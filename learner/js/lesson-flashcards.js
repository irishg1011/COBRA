/**
 * lesson-flashcards.js - Learner Flashcards ("Cobra's Card Duel")
 * ---------------------------------------------------------------
 * Self-contained game for the "Flashcards" activity type. lesson-
 * activities.js hands the activity over through
 * window.cobraByteRenderFlashcards(activity, container, onActivityDone).
 *
 * Cobra vs NullScorpion: a flashcard floats between them showing its
 * front. The learner types the back:
 *   - right (or "close" - only capital letters/spacing differ): the card
 *     flips to its answer and the cobra flicks it into the scorpion
 *     (-1 HP), then the next card
 *   - wrong / skip / time up: the scorpion stings (-1 life), the card's
 *     feedback shows (never its back) and Next card moves on - one try
 *     per card (feat/one-attempt-flow), no Try Again.
 * A preview modal shows each card's front (and its hint) before it is played.
 *
 * Rules (all enforced server-side - see game_plays.py):
 *   - Each play draws 5 cards the learner has not seen (feat/question-pool-draw).
 *   - Lives (feat/lives-5v5): 5 regular hearts; the daily bonus is a
 *     separate reserve used only after them. NullScorpion has 5 health,
 *     one per drawn card; each correct card takes one.
 *   - Timer (feat/question-timer): a slim bar per card; the server decides.
 *   - 0 lives: the play pauses BEFORE the next card is revealed.
 *
 * POST /api/lesson-activities/flashcard-start reveals the current card;
 * GET flashcard-play reads the state. Never the answer. The 3D stage (flashcards3d.js) follows
 * activity.terrain ("land" forest / "water" ship).
 *
 * Phones: Start / Continue / Play card opens the game full screen
 * (.is-focus) so the page behind can't scroll while answering - same as
 * the Multiple Choice arena. See "full screen (phones)" below.
 */
(function () {
    "use strict";

    // feat/admin-real-game-preview: set ONLY by admin-preview-play.js on /admin/preview-play.
    // Undefined on learner pages, so everything below runs exactly as before.
    const PREVIEW = window.COBRA_PREVIEW_MODE || null;
    const API_BASE_URL = PREVIEW ? PREVIEW.apiBase : ""; // feat/admin-login-page: same-origin, works on 127.0.0.1 and localhost
    const FC_JS_BASE = (document.currentScript && document.currentScript.src)
        ? new URL(".", document.currentScript.src).href
        : "";
    const FC_ANIM = { win: 1700, sting: 1300, death: 1700 };

    // ---------------- small helpers ----------------
    function el(tag, className) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        return node;
    }

    function fcClock(totalSeconds) {
        const s = Math.max(0, Math.ceil(totalSeconds));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }

    // feat/lives-5v5: 5 regular hearts + the daily bonus as a separate reserve.
    function fcHearts(state) {
        return window.CobraGameKit ? window.CobraGameKit.hearts(state) : "";
    }

    // The cobra's health bar: the regular lives (max 5); while only the daily
    // reserve is left, the reserve - never more than 5 segments.
    function heroLives(state) {
        return Math.min(state.max_lives, state.lives > 0 ? state.lives : state.total_lives);
    }

    function fcLivesCount(state) {
        return window.CobraGameKit ? window.CobraGameKit.livesText(state) : "";
    }

    function activityIdOf(activity) {
        const id = activity && (activity.la_id ?? activity.activity_id ?? activity.id);
        return id === undefined || id === null || id === "" ? null : id;
    }

    async function readJson(response, what) {
        let data = null;
        try {
            data = await response.json();
        } catch (err) {
            data = null;
        }
        if (!data) {
            throw new Error(response.status === 404
                ? `The Flashcards API was not found (HTTP 404 on ${what}). Check that learner_flashcard_routes.py is registered in login.py and restart Flask.`
                : `The server sent an unexpected response (HTTP ${response.status} on ${what}).`);
        }
        return data;
    }

    async function fetchPlay(laId) {
        if (laId === null) throw new Error("This activity has no id in the activities list.");
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities/flashcard-play?la_id=${encodeURIComponent(laId)}`, {
            credentials: "include"
        });
        const data = await readJson(response, "flashcard-play");
        if (!response.ok || !data.success) throw new Error(data.message || `Request failed (HTTP ${response.status}).`);
        return data;
    }

    async function postJson(path, payload) {
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities/${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload)
        });
        const data = await readJson(response, path);
        if (!response.ok || !data.success) throw new Error(data.message || `Request failed (HTTP ${response.status}).`);
        return data;
    }

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
    function easeIn(t) { return t * t; }

    // ---------------- card text with code ----------------
    // A card's text may hold a fenced code block:
    //     What does this display?
    //     ```python
    //     name = "Cobra"
    //     print(name)
    //     ```
    // fcParseCard() splits the text into text parts and code parts, and
    // fcRenderCard() draws them: the code goes in a monospace box, one
    // statement per line, with Python colours. Display only - the mentor's
    // code is never rewritten. Tabs become 4 spaces, and trailing spaces
    // and a shared left indent are removed, so it lines up the PEP 8 way.
    // Card text comes from the database and only goes in via textContent.
    // After the opening ``` an optional language word is dropped: any word
    // that ends its line ("```python"), or python / py on the same line.
    const FC_FENCE = /```(?:[ \t]*[A-Za-z0-9_+#.-]*[ \t]*\n|[ \t]*(?:python3?|py)\b[ \t]*)?([\s\S]*?)(?:```|$)/gi;
    const FC_TOKEN_PATTERN = /(#.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z0-9_'"#]+)/g;
    const FC_KEYWORDS = new Set([
        "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
        "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
        "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
        "return", "try", "while", "with", "yield"
    ]);

    function fcCleanCode(code) {
        const lines = code.replace(/\t/g, "    ").split("\n").map((line) => line.replace(/\s+$/, ""));
        while (lines.length && !lines[0]) lines.shift();
        while (lines.length && !lines[lines.length - 1]) lines.pop();
        const indents = lines.filter(Boolean).map((line) => line.match(/^ */)[0].length);
        const cut = indents.length ? Math.min(...indents) : 0;
        return lines.map((line) => line.slice(cut)).join("\n");
    }

    // -> [{ type: "text" | "code", text }], in the order they appear.
    // A card with no code block is one "text" part.
    function fcParseCard(text) {
        const source = String(text === null || text === undefined ? "" : text).replace(/\r\n?/g, "\n");
        const parts = [];
        const pushText = (chunk) => {
            const clean = chunk.trim();
            if (clean) parts.push({ type: "text", text: clean });
        };
        let last = 0;
        let m;
        FC_FENCE.lastIndex = 0;
        while ((m = FC_FENCE.exec(source)) !== null) {
            pushText(source.slice(last, m.index));
            const code = fcCleanCode(m[1]);
            if (code) parts.push({ type: "code", text: code });
            last = m.index + m[0].length;
        }
        pushText(source.slice(last));
        return parts;
    }

    // Appends syntax-coloured spans for one line of code.
    function fcHighlightInto(parent, line) {
        let last = 0;
        let m;
        FC_TOKEN_PATTERN.lastIndex = 0;
        while ((m = FC_TOKEN_PATTERN.exec(line)) !== null) {
            if (m[0] === "") { FC_TOKEN_PATTERN.lastIndex += 1; continue; }
            if (m.index > last) parent.appendChild(document.createTextNode(line.slice(last, m.index)));
            let cls = "";
            if (m[1]) cls = "tok-cmt";
            else if (m[2]) cls = "tok-str";
            else if (m[3]) cls = "tok-num";
            else if (m[4]) {
                if (FC_KEYWORDS.has(m[4])) cls = "tok-kw";
                else if (line.charAt(m.index + m[4].length) === "(") cls = "tok-fn";
            }
            if (cls) {
                const span = el("span", cls);
                span.textContent = m[0];
                parent.appendChild(span);
            } else {
                parent.appendChild(document.createTextNode(m[0]));
            }
            last = m.index + m[0].length;
        }
        if (last < line.length) parent.appendChild(document.createTextNode(line.slice(last)));
    }

    // Draws card text into `node`: text parts as text (a `word` in single
    // backticks becomes inline code), code parts as a code box.
    function fcRenderCard(node, text) {
        node.textContent = "";
        fcParseCard(text).forEach((part) => {
            if (part.type === "code") {
                const pre = el("pre", "fc-code");
                part.text.split("\n").forEach((line, i) => {
                    if (i) pre.appendChild(document.createTextNode("\n"));
                    fcHighlightInto(pre, line);
                });
                node.appendChild(pre);
                return;
            }
            const block = el("span", "fc-text-part");
            part.text.split(/(`[^`\n]+`)/).forEach((piece) => {
                if (piece.length > 2 && piece.charAt(0) === "`" && piece.charAt(piece.length - 1) === "`") {
                    const code = el("code", "fc-inline-code");
                    code.textContent = piece.slice(1, -1);
                    block.appendChild(code);
                } else if (piece) {
                    block.appendChild(document.createTextNode(piece));
                }
            });
            node.appendChild(block);
        });
    }

    // Waits until the 3D stage has its shaders ready (stage.warmUp() in the
    // 3D file), but never longer than capMs - a slow device still starts.
    function warmStage(stage, capMs) {
        if (!stage || typeof stage.warmUp !== "function") return Promise.resolve();
        return Promise.race([
            stage.warmUp(),
            new Promise((resolve) => setTimeout(resolve, capMs || 6000))
        ]);
    }

    // ---------------- the activity ----------------
    function renderFlashcards(activity, container, onActivityDone) {
        container.innerHTML = "";
        const root = el("div", "fc-root");
        root.innerHTML = `
            <header class="fc-topbar">
                <div class="fc-brand">
                    <span class="fc-brand-icon"><i class="fa-solid fa-layer-group"></i></span>
                    <div>
                        <span class="fc-brand-eyebrow">Activity · Flashcards</span>
                        <h3 class="fc-brand-title" data-c="title"></h3>
                    </div>
                </div>
                <div class="fc-stats">
                    <div class="fc-stat is-score" data-c="scoreStat"><b data-c="score">0</b><i>Score</i></div>
                    <div class="fc-stat"><b data-c="progress">-</b><i>Card</i></div>
                    <div class="fc-stat"><b data-c="streak">0</b><i>Streak</i></div>
                    <div class="fc-stat is-lives" data-c="livesStat"><b><span class="fc-hearts" data-c="lives"></span><span class="fc-lives-count" data-c="livesCount"></span></b><i data-c="livesLabel">Lives</i></div>
                </div>
                <button type="button" class="fc-ghost-btn fc-focus-btn" data-c="focusBtn" aria-label="Full screen"><i class="fa-solid fa-expand"></i> <span>Full screen</span></button>
            </header>
            <div class="fc-play">
                <section class="fc-stage">
                    <canvas class="fc-canvas" data-c="canvas"></canvas>
                    <div class="fc-hpbar is-hero">
                        <span class="fc-hpbar-name">Cobra · your memory</span>
                        <div class="fc-hpbar-track" data-c="heroTrack"></div>
                    </div>
                    <div class="fc-hpbar is-foe">
                        <span class="fc-hpbar-name">NullScorpion</span>
                        <div class="fc-hpbar-track" data-c="foeTrack"></div>
                    </div>
                    <p class="fc-stage-hint">Drag the arena to look around · double-click to reset</p>
                </section>
                <section class="fc-board">
                    <div class="fc-board-head">
                        <span class="fc-chip" data-c="qmeta"></span>
                        <span class="fc-chip is-muted">Type the back of the card</span>
                    </div>
                    <div data-c="timerHost"></div>
                    <div class="fc-card">
                        <span class="fc-card-label">Front</span>
                        <div class="fc-card-front" data-c="front"></div>
                    </div>
                    <p class="fc-hint" data-c="hint" hidden></p>
                    <div class="fc-answer-row" data-c="answerRow">
                        <textarea class="fc-answer-input" data-c="input" rows="1" autocomplete="off" spellcheck="false" placeholder="Type the answer on the back of the card..." aria-label="Your answer"></textarea>
                        <button type="button" class="fc-primary-btn" data-c="checkBtn" disabled><i class="fa-solid fa-bolt"></i> Throw answer</button>
                        <button type="button" class="fc-ghost-btn fc-skip-btn" data-c="playSkipBtn"><i class="fa-solid fa-forward"></i> <span data-c="playSkipText">Skip (−1 life)</span></button>
                    </div>
                    <div class="fc-feedback" data-c="feedback" hidden>
                        <div class="fc-feedback-body">
                            <b class="fc-feedback-title" data-c="fbTitle"></b>
                            <p class="fc-feedback-text" data-c="fbText"></p>
                            <p class="fc-feedback-exact" data-c="fbExact" hidden></p>
                        </div>
                        <p class="game-next-note" data-c="nextNote"></p>
                        <button type="button" class="fc-primary-btn game-next-pulse" data-c="nextBtn">Next card</button>
                    </div>
                </section>
                <div class="fc-overlay" data-c="overlay" hidden></div>
            </div>
        `;
        container.appendChild(root);

        const ui = {};
        root.querySelectorAll("[data-c]").forEach((node) => { ui[node.dataset.c] = node; });
        ui.title.textContent = activity.activity_title || "";
        const laId = activityIdOf(activity);

        // ---- state ----
        let cards = [];
        let total = 0;
        let server = null;
        let mode = "loading";   // loading | ready | playing | busy | review | tryagain | cooldown | done | error
        let wrongOnCurrent = false;  // learner already got THIS card wrong -> answer-bar Skip is free
        let booted = false;
        let firstOpen = true;       // the first reveal after opening the page reports an unclosed leave
        let counting = false;       // a 3 - 2 - 1 is running
        let cardTimer = null;       // the timer bar on the card preview
        let disposed = false;
        let stage3d = null;
        let qIndex = 0;
        let score = 0, streak = 0, bestStreak = 0;
        let revealedAnswer = null;  // the card's back, revealed after a wrong answer
        let rafId = null, countdownTimer = null, refreshing = false;
        const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
        // feat/question-timer: above the question AND inside the game stage (phones, full screen)
        const timer = (!PREVIEW && window.CobraGameKit) ? window.CobraGameKit.timerBars([ui.timerHost, ui.canvas.parentElement]) : null;
        let leaveGuard = null;

        // duel animation state (display only - the server owns the real numbers)
        const fx = {
            foeMax: 1, foeHP: 1, heroMax: 5, heroHP: 5, collected: 0,
            anim: null, hitDone: false, shake: 0, flashFoe: 0, flashHero: 0,
            thrown: false, glow: "", defeated: false, heroDown: false, t: 0, lastTs: 0
        };

        // Before the play exists (a new learner, before Start) there is no
        // card at all - the board shows this empty one.
        const NOT_YET = { flashcard_id: null, front_text: "", hint: "", hidden: true };
        function currentCard() { return cards[qIndex] || NOT_YET; }

        // ---- HUD ----
        function setMode(next) {
            mode = next;
            root.dataset.mode = next;
            // Results, an error and "out of lives" always show in the normal page.
            if (next === "done" || next === "error" || next === "cooldown") setFocus(false);
            if (timer && (next === "done" || next === "error" || next === "cooldown")) timer.hide();
            updateControls();
        }

        function applyState(state) {
            server = state;
            // feat/question-pool-draw: the play's drawn cards (revealed ones in full).
            if (state && Array.isArray(state.items) && state.items.length) {
                cards = state.items.map((card) => (card.hidden
                    ? { flashcard_id: card.flashcard_id, front_text: "", hint: "", hidden: true } : card));
                total = cards.length;
            }
            if (timer && state && state.timer) {
                if (state.current_item_id && state.current_revealed && !state.completed) timer.sync(state.timer, state.current_item_id);
                else timer.hide();
            }
            updateHUD();
        }

        // NullScorpion's health (feat/lives-5v5): one point per drawn card,
        // each correct card takes one - in a retake it carries on.
        function syncBugBars() {
            if (!server) return;
            fx.foeMax = Math.max(1, server.bug_max || total || 1);
            fx.foeHP = Math.max(0, server.bug_hp ?? (total - server.solved_count));
        }

        function updateHUD() {
            ui.score.textContent = score;
            ui.progress.textContent = total ? `${Math.min(qIndex + 1, total)}/${total}` : "-";
            ui.streak.textContent = streak;
            ui.lives.innerHTML = fcHearts(server);
            ui.livesCount.textContent = fcLivesCount(server);
            ui.livesLabel.textContent = (server && server.seconds_to_refill > 0)
                ? `Lives · refill ${fcClock(server.seconds_to_refill)}`
                : "Lives";
        }

        function bump(node) {
            node.classList.remove("bump");
            void node.offsetWidth;
            node.classList.add("bump");
        }

        function drawBars() {
            [[ui.foeTrack, fx.foeMax, fx.foeHP], [ui.heroTrack, fx.heroMax, fx.heroHP]].forEach(([track, max, hp]) => {
                track.innerHTML = "";
                for (let i = 0; i < max; i++) track.appendChild(el("i", i < hp ? "is-on" : ""));
            });
        }

        function updateControls() {
            const playing = mode === "playing";
            ui.input.disabled = !playing;
            ui.checkBtn.disabled = !playing || !ui.input.value.trim();
            // Skip always costs 1 life (feat/one-attempt-flow).
            ui.playSkipText.textContent = "Skip (−1 life)";
            ui.playSkipBtn.setAttribute("aria-label", "Skip this card, costs 1 life");
            ui.playSkipBtn.disabled = !playing || !server || server.total_lives <= 0;
            ui.answerRow.hidden = mode === "review";
        }

        // ---- overlay (static markup + numbers only; DB text via textContent) ----
        function disposeCardTimer() {
            if (cardTimer) cardTimer.dispose();
            cardTimer = null;
        }

        function showOverlay(html) {
            disposeCardTimer();
            root.classList.add("has-overlay");   // the in-stage timer hides behind cards
            ui.overlay.innerHTML = html;
            ui.overlay.hidden = false;
        }

        function hideOverlay() {
            disposeCardTimer();
            root.classList.remove("has-overlay");
            ui.overlay.hidden = true;
            ui.overlay.innerHTML = "";
            ui.overlay.classList.remove("is-leaving");
            if (!currentCard().hidden) revealStageCard(false);
        }

        // The floating 3D card stays hidden during the Start card and the
        // 3 - 2 - 1, and pops in when its card is revealed.
        function revealStageCard(animated) {
            if (stage3d && stage3d.showCard) stage3d.showCard(animated);
        }

        function overlayNode(name) {
            return ui.overlay.querySelector(`[data-c="${name}"]`);
        }

        // feat/game-countdown: the duel waits behind a blurred Start card -
        // no card is on screen (or in the browser) before its clock starts.
        // Start -> 3 - 2 - 1 -> the server reveals the card (its timer
        // starts) and it shows.   kind: start | continue | resume
        function showStartCard(kind) {
            setMode("ready");
            hideOverlay();
            const copy = {
                start: { title: "Ready to duel?", btn: "Start duel" },
                continue: { title: "Pick up where you left off", btn: "Continue" },
                resume: { title: "Your lives are back", btn: "Resume" }
            }[kind] || { title: "Ready to duel?", btn: "Start duel" };
            const limit = server && server.timer ? server.timer.limit : 0;
            const left = Math.max(0, total - (server ? server.current_index || 0 : 0));
            if (stage3d && stage3d.hideCard) stage3d.hideCard();
            window.CobraGameKit.startCard(root, {
                eyebrow: (server && server.retake) ? `Retake round ${server.retake.round} · Flashcards` : "Flashcards",
                title: copy.title,
                lines: [
                    kind === "start" ? `${total} cards, one try each` : `${left} card${left === 1 ? "" : "s"} left`,
                    PREVIEW ? "" : (limit ? `${limit} seconds per card` : ""),
                    "Type what's on the back of each card."
                ],
                note: PREVIEW ? "Preview: no timer, nothing is saved." : "The timer starts the moment each card appears.",
                button: copy.btn
            }).then(() => {
                if (disposed) return;
                enterFocusIfPhone();   // phones: the game goes full screen
                startWithCountdown(true);
            });
        }

        // 3 - 2 - 1, THEN ask the server for the card (which starts its clock).
        //   intro: the cobra slithers in (first start / resume only)
        async function startWithCountdown(intro) {
            if (disposed || counting) return;
            counting = true;
            setMode("busy");
            hideOverlay();
            if (stage3d && stage3d.hideCard) stage3d.hideCard();   // no old card behind the 3 - 2 - 1
            const kit = window.CobraGameKit;
            const next = Math.min((server ? server.current_index : qIndex) + 1, total);
            await kit.countdown(root, { label: `Card ${next} of ${total}` });
            if (disposed) return;
            counting = false;
            // (in the admin preview, "start" only marks the run started - it is
            // what lets the preview grade the answers)
            if (!(await openPlay())) {
                if (mode !== "ready") kit.hideCover(root);   // out of lives / results are not covered
                return;
            }
            qIndex = Math.min(server.current_index, total - 1);
            loadCard();   // the card just revealed
            kit.hideCover(root);
            if (intro && stage3d) stage3d.playIntro();   // cobra slithers in
            showCardPreview();
        }

        // The card preview: the front of the card, shown right after the
        // 3 - 2 - 1 - its clock is ALREADY running, and the card says so and
        // shows it. Play puts the card on the stage and opens the answer box.
        function showCardPreview(note) {
            setMode("ready");
            if (stage3d && stage3d.hideCard) stage3d.hideCard();
            showOverlay(`
                <div class="fc-overlay-card fc-preview">
                    <span class="fc-timer-started" data-c="pvStarted"></span>
                    <div data-c="pvTimer"></div>
                    <div class="fc-preview-card">
                        <span class="fc-card-label" data-c="pvMeta"></span>
                        <div class="fc-preview-front" data-c="pvFront"></div>
                    </div>
                    <p class="fc-hint" data-c="pvHint" hidden></p>
                    <p data-c="pvNote"></p>
                    <div class="fc-overlay-actions">
                        <button type="button" class="fc-ghost-btn" data-c="pvSkipBtn" aria-label="Skip this card, costs 1 life"><i class="fa-solid fa-forward"></i> Skip (−1 life)</button>
                        <button type="button" class="fc-primary-btn" data-c="pvBtn"><i class="fa-solid fa-play"></i> Play</button>
                    </div>
                </div>
            `);
            overlayNode("pvStarted").innerHTML = PREVIEW
                ? '<i class="fa-solid fa-eye"></i> Preview - no timer'
                : '<i class="fa-solid fa-stopwatch"></i> Your timer has started!';
            if (!PREVIEW && server && server.timer && window.CobraGameKit) {
                cardTimer = window.CobraGameKit.timerBar(overlayNode("pvTimer"), "is-card");
                cardTimer.sync(server.timer, server.current_item_id);
            }
            overlayNode("pvMeta").textContent = `Card ${qIndex + 1} of ${total}`;
            fcRenderCard(overlayNode("pvFront"), currentCard().front_text);
            const pvHint = overlayNode("pvHint");
            pvHint.textContent = currentCard().hint ? `Hint: ${currentCard().hint}` : "";
            pvHint.hidden = !currentCard().hint;
            overlayNode("pvNote").textContent = note
                || "Read the card, then press Play (or Enter) and type what's on the back.";
            const btn = overlayNode("pvBtn");
            btn.addEventListener("click", () => {
                if (disposed || mode !== "ready") return;
                enterFocusIfPhone();
                hideOverlay();
                revealStageCard(true);
                setMode("playing");
                ui.input.focus({ preventScroll: true });
            });
            overlayNode("pvSkipBtn").addEventListener("click", () => {
                if (disposed || mode !== "ready") return;
                setMode("busy");
                sendSkip(true, false);
            });
            btn.focus({ preventScroll: true });
        }

        function fillReveal(node) {
            if (!node) return;
            node.hidden = !revealedAnswer;
            if (!revealedAnswer) return;
            node.innerHTML = "";
            const label = el("span", "fc-reveal-label");
            label.textContent = "Back of the card";
            const text = el("div", "fc-reveal-text");
            fcRenderCard(text, revealedAnswer);
            node.appendChild(label);
            node.appendChild(text);
        }

        // Wrong answer: show why, then MOVE ON (adviser's rule - the first
        // answer counts; a missed card is fixed later in a retake round).
        // The server already moved the play to the next card (or finished).
        function showWrongAndNext(feedback, title, syntaxError) {
            setMode("tryagain");
            const lives = server ? server.total_lives : 0;
            const last = !!(server && server.completed);
            showOverlay(`
                <div class="fc-overlay-card">
                    <i class="fa-solid fa-circle-xmark fc-overlay-icon is-danger"></i>
                    <h4 data-c="taTitle">Not quite</h4>
                    <p class="fc-tryagain-feedback" data-c="taFeedback"></p>
                    <div class="fib-console-out is-error" data-c="taError" hidden>
                        <span class="fib-console-label">Python error</span>
                        <pre data-c="taErrorText"></pre>
                    </div>
                    <div class="fc-reveal" data-c="taReveal" hidden></div>
                    <p class="fc-subnote">NullScorpion stung you (−1 life) · ${lives} ${lives === 1 ? "life" : "lives"} left. Card ${qIndex + 1} counts as missed.</p>
                    <div class="fc-overlay-actions">
                        <p class="game-next-note" data-c="taNote"></p>
                        <button type="button" class="fc-primary-btn game-next-pulse" data-c="taBtn">${last ? '<i class="fa-solid fa-flag-checkered"></i> See results' : '<i class="fa-solid fa-forward"></i> Next card'}</button>
                    </div>
                </div>
            `);
            if (title) overlayNode("taTitle").textContent = title;
            overlayNode("taFeedback").textContent = feedback || "That's not what's on the back of this card.";
            // A code answer that is not valid Python shows the real SyntaxError.
            overlayNode("taError").hidden = !syntaxError;
            overlayNode("taErrorText").textContent = syntaxError || "";
            fillReveal(overlayNode("taReveal"));
            overlayNode("taNote").textContent = window.CobraGameKit.nextNoteText(last);
            const btn = overlayNode("taBtn");
            btn.addEventListener("click", () => {
                if (disposed || mode !== "tryagain") return;
                hideOverlay();
                fx.glow = "";
                if (server.completed) {
                    setMode("busy");
                    finish();
                    return;
                }
                revealNext();
            });
            btn.focus({ preventScroll: true });
        }

        // The next card is revealed (and its clock started) by the server
        // only after its 3 - 2 - 1 - never while feedback is shown or at 0 lives.
        async function revealNext() {
            if (disposed) return;
            if (server.completed) {
                setMode("busy");
                finish();
                return;
            }
            if (server.total_lives <= 0) {
                qIndex = Math.min(server.current_index, total - 1);
                loadCard();
                enterCooldown();
                return;
            }
            startWithCountdown(false);   // 3 - 2 - 1, then the next card and its clock
        }

        // feat/question-timer: the bar ran out - the server checks its own clock.
        async function onTimerExpired(cardId) {
            if (disposed || !server || server.current_item_id !== cardId) return;
            if (mode !== "playing" && mode !== "ready") return;
            setMode("busy");
            let data = null;
            try {
                data = await postJson("game/timeout", { la_id: laId, item_id: cardId });
            } catch (err) {
                if (!disposed) showError(err.message);
                return;
            }
            if (disposed) return;
            applyState(data.state);
            if (!data.timed_out) {
                resyncFromState();
                return;
            }
            streak = 0;
            bump(ui.livesStat);
            fx.glow = "bad";
            stingAnim();
            updateHUD();
            setTimeout(() => {
                if (disposed) return;
                showWrongAndNext(data.feedback, "Time's up");
            }, FC_ANIM.sting);
        }

        // feat/leave-detection: what the server decided when the learner came back.
        // fix/leave-guard-spam: the game behind the notice is blurred (game-kit.css)
        // and nothing moves on until the learner presses "I understand" - the next
        // card is only asked for (and its clock started) after that.
        function onLeaveResult(data) {
            if (disposed || !data || !data.state) return;
            applyState(data.state);
            const event = data.event;
            if (!event) return;
            const forfeit = event.type === "leave_forfeit";
            if (forfeit) {
                setMode("busy");   // the forfeited card can't be answered any more
                streak = 0;
                bump(ui.livesStat);
                fx.heroHP = heroLives(server);
                drawBars();
                updateHUD();
            }
            const afterNotice = () => {
                if (disposed || !forfeit) return;
                hideOverlay();
                revealNext();
            };
            if (window.CobraGameKit) {
                window.CobraGameKit.notice(forfeit ? "Questions changed" : "Please stay on this page",
                    event.message, null, afterNotice);
            } else {
                afterNotice();
            }
        }

        function enterCooldown() {
            setMode("cooldown");
            fx.heroDown = true;
            fx.glow = "";
            if (stage3d) stage3d.skipIntro();
            showOverlay(`
                <div class="fc-overlay-card is-wide">
                    <div class="fc-overlay-hearts" data-c="cdHearts">${fcHearts(server)}</div>
                    <h4 data-c="cdTitle">You're out of lives.</h4>
                    <p>While waiting for at least 1 life to become available, you can review the current lesson or previous lessons. Your activity progress is paused and will continue from where you stopped once you have at least 1 life.</p>
                    <div class="fc-reveal" data-c="cdReveal" hidden></div>
                    <p class="fc-subnote" data-c="cdWhere"></p>
                    <div class="fc-countdown-row" data-c="cdRow">
                        <span>All 5 lives refill in</span>
                        <b class="fc-countdown" data-c="countdown">${fcClock(server ? server.seconds_to_refill : 0)}</b>
                        <span class="fc-countdown-note">Bonus lives come back every day at 8:00 AM.</span>
                    </div>
                    <div class="fc-overlay-actions">
                        <button type="button" class="fc-ghost-btn" data-c="reviewBtn"><i class="fa-solid fa-book-open"></i> Review this lesson</button>
                        <button type="button" class="fc-ghost-btn" data-c="lessonsBtn"><i class="fa-solid fa-layer-group"></i> Back to lessons</button>
                        <button type="button" class="fc-primary-btn" data-c="cdResumeBtn" disabled><i class="fa-solid fa-play"></i> Resume activity</button>
                    </div>
                </div>
            `);
            overlayNode("cdWhere").textContent = `Paused at card ${qIndex + 1} of ${total}.`;
            fillReveal(overlayNode("cdReveal"));
            overlayNode("reviewBtn").addEventListener("click", () => {
                document.dispatchEvent(new CustomEvent("cobrabyte:review-lesson"));
            });
            overlayNode("lessonsBtn").addEventListener("click", () => {
                const link = document.getElementById("backToLessonsLink");
                window.location.href = (link && link.getAttribute("href") && link.getAttribute("href") !== "#")
                    ? link.href : "/lessons";
            });
            overlayNode("cdResumeBtn").addEventListener("click", () => {
                if (mode !== "cooldown") return;
                enterFocusIfPhone();
                startWithCountdown(true);
            });
            syncCooldown();
        }

        // Unlocks Resume in place once the server reports at least 1 life.
        function syncCooldown() {
            if (mode !== "cooldown" || !server) return;
            const hasLife = server.total_lives > 0;
            const hearts = overlayNode("cdHearts");
            const title = overlayNode("cdTitle");
            const row = overlayNode("cdRow");
            const btn = overlayNode("cdResumeBtn");
            if (hearts) hearts.innerHTML = fcHearts(server);
            if (title) title.textContent = hasLife ? `Your lives are back! (${fcLivesCount(server)})` : "You're out of lives.";
            if (row) row.hidden = hasLife;
            if (btn) btn.disabled = !hasLife;
        }

        function finish() {
            setMode("done");
            if (stage3d) stage3d.skipIntro();
            const firstTry = server ? server.first_try_correct : 0;
            const rt = server && server.retake;   // Module 85% gate: finished a retake round
            showOverlay(`
                <div class="fc-overlay-card">
                    <i class="fa-solid fa-trophy fc-overlay-icon"></i>
                    <h4>${rt ? `Retake round ${Number(rt.round)} complete` : (server && server.bug_hp === 0 ? "NullScorpion defeated" : "Activity complete")}</h4>
                    <div class="fc-results">
                        <div><b>${rt ? `${Number(rt.fixed)}/${Number(rt.total)}` : `${firstTry}/${total}`}</b><span>${rt ? "Fixed" : "First try"}</span></div>
                        <div><b>${bestStreak}</b><span>Best streak</span></div>
                        <div><b>${score}</b><span>Score</span></div>
                    </div>
                    <p class="fc-subnote">${rt
                        ? `${Number(rt.fixed)} of ${Number(rt.total)} missed cards fixed on the first try. Your module score is updated on the Lessons page.`
                        : `Saved to your progress: ${firstTry} of ${total} cards right on the first try.`}</p>
                    <div class="fc-overlay-actions">
                        <button type="button" class="fc-primary-btn" data-c="continueBtn">Continue</button>
                    </div>
                </div>
            `);
            overlayNode("continueBtn").addEventListener("click", () => {
                dispose();
                onActivityDone();
            });
        }

        function showError(message) {
            setMode("error");
            const isAuthError = Boolean(message && message.toLowerCase().includes("not logged in"));
            if (isAuthError) {
                showOverlay(`
                    <div class="fc-overlay-card">
                        <i class="fa-solid fa-lock fc-overlay-icon is-warn"></i>
                        <h4>Session Expired</h4>
                        <p data-c="errorText">Your login session has expired. Please sign in again to continue.</p>
                        <div class="fc-overlay-actions">
                            <button type="button" class="fc-primary-btn" data-c="loginBtn">Sign In</button>
                        </div>
                    </div>
                `);
                const loginBtn = overlayNode("loginBtn");
                if (loginBtn) {
                    loginBtn.addEventListener("click", () => {
                        window.location.replace("/login");
                    });
                }
                return;
            }
            showOverlay(`
                <div class="fc-overlay-card">
                    <i class="fa-solid fa-triangle-exclamation fc-overlay-icon is-warn"></i>
                    <h4>Something went wrong</h4>
                    <p data-c="errorText"></p>
                    <div class="fc-overlay-actions">
                        <button type="button" class="fc-primary-btn" data-c="retryBtn">Try again</button>
                    </div>
                </div>
            `);
            overlayNode("errorText").textContent = message || "Could not reach the server. Your progress is saved.";
            overlayNode("retryBtn").addEventListener("click", async () => {
                if (!booted) { boot(); return; }
                try {
                    const play = await fetchPlay(laId);
                    applyState(play.state);
                } catch (err) {
                    if (err.message && err.message.toLowerCase().includes("not logged in")) {
                        showError(err.message);
                        return;
                    }
                    const text = overlayNode("errorText");
                    if (text) text.textContent = `Still failing: ${err.message}`;
                    return;
                }
                if (!disposed) resyncFromState();
            });
        }

        // ---- card board ----
        function autoResizeInput() {
            if (!ui.input) return;
            ui.input.style.height = "auto";
            const border = (ui.input.offsetHeight - ui.input.clientHeight) || 3;
            const nextH = Math.max(46, ui.input.scrollHeight + border);
            ui.input.style.height = `${nextH}px`;
        }

        function loadCard() {
            const card = currentCard();
            ui.qmeta.textContent = `Card ${qIndex + 1} of ${total}`;
            // feat/game-countdown: nothing of a card exists before its clock starts.
            if (card.hidden) ui.front.textContent = "The card appears after the 3 - 2 - 1 countdown.";
            else fcRenderCard(ui.front, card.front_text);
            ui.hint.textContent = card.hint ? `Hint: ${card.hint}` : "";   // feat/hints-feedback
            ui.hint.hidden = !card.hint;
            ui.input.value = "";
            autoResizeInput();
            ui.feedback.hidden = true;
            revealedAnswer = null;
            wrongOnCurrent = false;
            fx.thrown = false;
            fx.glow = "";
            if (stage3d) {
                if (card.hidden) {
                    if (stage3d.hideCard) stage3d.hideCard();
                } else {
                    stage3d.setCard(`Card ${qIndex + 1} of ${total}`, fcParseCard(card.front_text), "?");
                }
            }
            updateHUD();
            updateControls();
        }

        function showFeedback(result) {
            ui.feedback.hidden = false;
            ui.feedback.classList.toggle("is-close", !!result.is_close);
            ui.fbTitle.textContent = result.is_close ? "Close enough!" : "Correct!";
            ui.fbText.textContent = result.feedback || "";
            ui.fbExact.hidden = !result.is_close;
            ui.fbExact.textContent = result.is_close ? `Exact answer: ${result.answer}` : "";
            ui.nextBtn.textContent = server.completed ? "See results" : "Next card";
            // The game waits here - say so (the next timer starts after the 3 - 2 - 1).
            ui.nextNote.textContent = window.CobraGameKit.nextNoteText(!!server.completed);
        }

        // ---- play flow ----
        function resyncFromState() {
            hideOverlay();
            syncBugBars();
            fx.collected = server.solved_count;
            fx.heroMax = server.max_lives;   // feat/lives-5v5: the bar never shows more than 5
            fx.heroHP = heroLives(server);
            fx.heroDown = server.total_lives <= 0;
            fx.defeated = fx.foeHP === 0;
            drawBars();
            if (server.completed) {
                finish();
                return;
            }
            qIndex = Math.min(server.current_index, total - 1);
            loadCard();
            if (server.total_lives <= 0) enterCooldown();
            else if (server.session_status === "paused") showStartCard("resume");
            else if (server.session_status === "in_progress" && server.solved_count > 0) showStartCard("continue");
            else showStartCard("start");
        }

        // Starts the ONE play on the server, or continues/resumes that same
        // play. true = in progress on the current card; false = it can't
        // run (completed, out of lives, error) and the right screen is shown.
        async function openPlay() {
            let data = null;
            try {
                data = await postJson("flashcard-start", { la_id: laId, boot: firstOpen });
                firstOpen = false;
            } catch (err) {
                if (!disposed) showError(err.message);
                return false;
            }
            if (disposed) return false;
            applyState(data.state);
            if (server.completed || server.session_status !== "in_progress") {
                resyncFromState();
                return false;
            }
            fx.heroDown = false;
            fx.heroHP = heroLives(server);
            fx.heroMax = server.max_lives;
            drawBars();
            if (Math.min(server.current_index, total - 1) !== qIndex) {
                qIndex = Math.min(server.current_index, total - 1);
                loadCard();
            }
            return true;
        }

        async function submitAnswer() {
            const answer = ui.input.value.trim();
            if (mode !== "playing" || !answer) return;
            setMode("busy");
            const card = currentCard();

            let result = null;
            try {
                result = await postJson("flashcard-answer", { la_id: laId, flashcard_id: card.flashcard_id, answer: answer });
            } catch (err) {
                if (!disposed) showError(err.message);
                return;
            }
            if (disposed) return;

            applyState(result.state);
            if (!result.graded) {
                resyncFromState();
                return;
            }

            if (result.is_correct) {
                streak += 1;
                bestStreak = Math.max(bestStreak, streak);
                score += (result.first_try ? 100 : result.is_close ? 40 : 50) + streak * 20;
                bump(ui.scoreStat);
                if (stage3d) stage3d.setCard(`Card ${qIndex + 1} of ${total}`, fcParseCard(card.front_text), fcParseCard(result.answer || answer));
                fx.glow = result.is_close ? "close" : "ok";
                winAnim();
                updateHUD();
                showFeedback(result);
                setMode("review");
                ui.nextBtn.disabled = true;           // wait for the card to land
                return;
            }

            // Wrong: marked wrong, then Next card (no Try Again).
            wrongOnCurrent = true;
            streak = 0;
            revealedAnswer = result.answer || null;
            bump(ui.livesStat);
            fx.glow = "bad";
            stingAnim();
            updateHUD();
            setMode("busy");
            setTimeout(() => {
                if (disposed) return;
                showWrongAndNext(result.feedback, null, result.syntax_error);
            }, FC_ANIM.sting);
        }

        // Skip from the answer bar while playing: free if this card was
        // already answered wrong (same as Skip card), otherwise -1 life
        // like the preview skip. No score either way - logged as 'skipped'.
        async function skipFromBar() {
            if (disposed || mode !== "playing") return;
            setMode("busy");
            await sendSkip(true, false);
        }

        async function sendSkip(fromPreview, needsIntro) {
            const card = currentCard();
            let data = null;
            try {
                data = await postJson("flashcard-skip", { la_id: laId, flashcard_id: card.flashcard_id, from_preview: fromPreview });
            } catch (err) {
                if (!disposed) showError(err.message);
                return;
            }
            if (disposed) return;
            applyState(data.state);
            if (!data.skipped) {
                resyncFromState();
                return;
            }
            hideOverlay();
            streak = 0;
            updateHUD();
            const flyOff = () => {
                if (disposed) return;
                if (stage3d) stage3d.setCard(`Card ${qIndex + 1} of ${total}`, fcParseCard(card.front_text), fcParseCard(revealedAnswer || "?"));
                fx.glow = "";
                winAnim(true);
                setTimeout(() => {
                    if (disposed) return;
                    if (server.completed) {
                        setTimeout(() => { if (!disposed) finish(); }, fx.anim ? FC_ANIM.death : 0);
                        return;
                    }
                    revealNext();
                }, FC_ANIM.win + 60);
            };
            if (!fromPreview) {
                flyOff();
                return;
            }
            // Preview skip: the scorpion stings first (-1 life), then the card flies off.
            if (needsIntro && stage3d) stage3d.playIntro();
            bump(ui.livesStat);
            fx.glow = "bad";
            stingAnim();
            setTimeout(flyOff, FC_ANIM.sting);
        }

        function advance() {
            if (mode !== "review" || ui.nextBtn.disabled) return;
            if (server.completed) {
                setMode("busy");
                const wait = fx.anim ? FC_ANIM.death : 0;
                setTimeout(() => { if (!disposed) finish(); }, wait);
                return;
            }
            revealNext();
        }

        // ---- duel animations ----
        function playAnim(name, onImpact, onEnd) {
            fx.anim = { name, dur: FC_ANIM[name], t: 0, startTs: performance.now(), onImpact, onEnd };
            fx.hitDone = false;
        }

        function winAnim(skipped) {
            playAnim("win", () => {
                // Only a correct card takes NullScorpion's health (feat/lives-5v5).
                if (!skipped) fx.foeHP = Math.max(0, fx.foeHP - 1);
                fx.collected += 1;
                fx.flashFoe = 1;
                fx.shake = skipped ? 6 : 16;
                if (stage3d) {
                    stage3d.float("foe", skipped ? "Skipped" : "-1 HP", skipped ? "#64748b" : "#7c3aed");
                    stage3d.burst("foe", skipped ? "#94a3b8" : fx.glow === "close" ? "#f59e0b" : "#22c55e", skipped ? 14 : 30);
                }
                drawBars();
            }, () => {
                fx.thrown = true;
                ui.nextBtn.disabled = false;
                if (mode === "review") ui.nextBtn.focus({ preventScroll: true });
                if (fx.foeHP === 0) {
                    playAnim("death", null, () => { fx.defeated = true; });
                }
            });
        }

        function stingAnim() {
            playAnim("sting", () => {
                fx.heroHP = server ? heroLives(server) : Math.max(0, fx.heroHP - 1);
                fx.flashHero = 1;
                fx.shake = 14;
                if (stage3d) {
                    stage3d.float("hero", "-1 life", "#dc2626");
                    stage3d.burst("hero", "#fbbf24", 18);
                }
                drawBars();
                if (fx.heroHP <= 0) fx.heroDown = true;
            });
        }

        // frame values for flashcards3d.js from the current animation
        function frameValues() {
            const v = { cardFlip: 0, cardThrow: fx.thrown ? 1 : 0, cardShake: 0, heroFlick: 0, sting: 0, dying: 0 };
            if (!fx.anim) return v;
            const p = Math.min(1, fx.anim.t / fx.anim.dur);
            if (fx.anim.name === "win") {
                v.cardFlip = p < 0.3 ? easeOut(p / 0.3) : 1;
                v.heroFlick = p < 0.35 ? 0 : p < 0.5 ? easeIn((p - 0.35) / 0.15) : p < 0.65 ? 1 - (p - 0.5) / 0.15 : 0;
                v.cardThrow = p < 0.48 ? 0 : Math.min(1, (p - 0.48) / 0.35);
            } else if (fx.anim.name === "sting") {
                v.sting = p;
                v.cardShake = p > 0.35 && p < 0.75 ? 1 : 0;
            } else if (fx.anim.name === "death") {
                v.dying = p;
                v.cardThrow = 1;
            }
            return v;
        }

        function loop(ts) {
            if (disposed) return;
            rafId = requestAnimationFrame(loop);
            const dt = Math.min((ts - fx.lastTs) / 1000, 0.12) || 0;
            fx.lastTs = ts;
            fx.t += dt;
            if (fx.anim) {
                fx.anim.t = performance.now() - fx.anim.startTs;
                const p = fx.anim.t / fx.anim.dur;
                const impactAt = fx.anim.name === "win" ? 0.8 : 0.5;
                if (!fx.hitDone && p >= impactAt && fx.anim.onImpact) { fx.hitDone = true; fx.anim.onImpact(); }
                if (p >= 1) { const end = fx.anim.onEnd; fx.anim = null; if (end) end(); }
            }
            fx.shake = Math.max(0, fx.shake - dt * 40);
            fx.flashFoe = Math.max(0, fx.flashFoe - dt * 2.4);
            fx.flashHero = Math.max(0, fx.flashHero - dt * 2.4);

            if (!stage3d || !isShown()) return; // hidden: skip the GPU work
            const v = frameValues();
            stage3d.render({
                t: fx.t,
                cardFlip: v.cardFlip,
                cardThrow: v.cardThrow,
                cardShake: v.cardShake,
                cardGlow: fx.glow,
                heroFlick: v.heroFlick,
                sting: v.sting,
                heroFlash: fx.flashHero,
                foeFlash: fx.flashFoe,
                shake: fx.shake * 0.02,
                hp01: fx.foeMax ? fx.foeHP / fx.foeMax : 0,
                critical: fx.foeMax > 1 && fx.foeHP === 1,
                dying: v.dying,
                dead: fx.defeated,
                heroDown: fx.heroDown,
                collected: fx.collected,
                remaining: Math.max(0, total - fx.collected - (fx.thrown || fx.defeated ? 0 : 1))
            });
        }

        // ---- lives countdown (server stays the source of truth) ----
        async function refreshState() {
            if (refreshing) return;
            refreshing = true;
            try {
                const play = await fetchPlay(laId);
                if (disposed) return;
                applyState(play.state);
                fx.heroMax = play.state.max_lives;
                fx.heroHP = heroLives(play.state);
                fx.heroDown = play.state.total_lives <= 0;
                drawBars();
                syncCooldown();
            } catch (err) {
                if (server) {
                    server.seconds_to_refill = Math.max(server.seconds_to_refill, 5);
                    server.seconds_to_daily_reset = Math.max(server.seconds_to_daily_reset, 5);
                }
            } finally {
                refreshing = false;
            }
        }

        function tick() {
            if (disposed) return;
            if (!root.isConnected) {
                dispose();
                return;
            }
            if (!server || server.completed) return;
            server.seconds_to_daily_reset -= 1;
            if (server.seconds_to_daily_reset <= 0) {
                refreshState();
                return;
            }
            if (server.seconds_to_refill <= 0) return;
            server.seconds_to_refill = Math.max(0, server.seconds_to_refill - 1);
            updateHUD();
            const countdown = overlayNode("countdown");
            if (countdown) countdown.textContent = fcClock(server.seconds_to_refill);
            if (server.seconds_to_refill <= 0) refreshState();
        }

        // ---- input + lifecycle ----
        ui.input.addEventListener("input", () => {
            updateControls();
            autoResizeInput();
        });
        ui.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                // Allow default Enter behavior (inserting a newline in textarea);
                // stop event propagation so outer handlers or forms are not triggered.
                e.stopPropagation();
                requestAnimationFrame(() => {
                    updateControls();
                    autoResizeInput();
                });
            }
        });
        ui.checkBtn.addEventListener("click", submitAnswer);
        ui.playSkipBtn.addEventListener("click", skipFromBar);
        ui.nextBtn.addEventListener("click", advance);

        function onKeyDown(e) {
            if (disposed || !isShown()) return;
            if (window.CobraGameKit && window.CobraGameKit.noticeOpen()) return;   // a leave notice is open: no game keys
            if (e.key !== "Enter") return;
            const target = e.target;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "BUTTON")) return;
            if (mode === "ready") {
                const btn = overlayNode("pvBtn") || root.querySelector(".game-ready-btn");
                if (btn) { e.preventDefault(); btn.click(); }
            } else if (mode === "review") {
                e.preventDefault();
                advance();
            }
        }

        function onVisibility() {
            // (when the leave guard is reporting, its answer already brings the fresh state)
            if (document.hidden || !server || (leaveGuard && leaveGuard.isReporting())) return;
            refreshState();   // timers are throttled in background tabs
        }

        function onResize() {
            if (disposed) return;
            updateFocusBtn();   // a turned phone / resized window may change "is this a phone"
            autoResizeInput();
            if (stage3d) stage3d.resize();
        }

        // ---- full screen (phones): the game fills the screen while playing ----
        // Same idea as the Multiple Choice arena: Start / Resume on a phone
        // opens the game full screen and the page behind stops scrolling.
        // It closes by itself on the results, an error, or when lives run
        // out, and the learner can leave / come back with the button in
        // the top bar. Styles: .fc-root.is-focus in the CSS file.
        const touchQuery = window.matchMedia ? window.matchMedia("(hover: none) and (pointer: coarse)") : null;
        let focusDeclined = false;   // learner pressed "Exit full screen" - do not force it back on

        function isPhone() {
            return !!(touchQuery && touchQuery.matches && Math.min(window.innerWidth, window.innerHeight) <= 600);
        }

        // offsetParent is always null for position: fixed (full screen), so
        // ask for layout boxes instead: none = hidden (display: none).
        function isShown() {
            return root.getClientRects().length > 0;
        }

        function updateFocusBtn() {
            const on = root.classList.contains("is-focus");
            root.classList.toggle("can-focus", on || isPhone());
            if (ui.focusBtn.dataset.on === String(on)) return;   // label already right
            ui.focusBtn.dataset.on = String(on);
            ui.focusBtn.innerHTML = on
                ? '<i class="fa-solid fa-compress"></i> <span>Exit full screen</span>'
                : '<i class="fa-solid fa-expand"></i> <span>Full screen</span>';
            ui.focusBtn.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
        }

        // Keeps the full-screen game inside the part of the screen that is
        // really visible, so the on-screen keyboard never covers the answer
        // box. While the keyboard is open the 3D stage is hidden (is-compact)
        // to leave the room to the card and the answer box.
        function syncViewport() {
            const vv = window.visualViewport;
            const usable = !!vv && root.classList.contains("is-focus") && Math.abs(vv.scale - 1) < 0.01;
            root.classList.toggle("has-viewport", usable);
            root.classList.toggle("is-compact", usable && vv.height < window.innerHeight - 120);
            if (usable) {
                root.style.setProperty("--fc-vv-top", `${vv.offsetTop}px`);
                root.style.setProperty("--fc-vv-height", `${vv.height}px`);
            }
        }

        function setFocus(on) {
            if (root.classList.contains("is-focus") === on) return;
            root.classList.toggle("is-focus", on);
            document.documentElement.classList.toggle("fc-focus-lock", on);
            syncViewport();
            updateFocusBtn();
            onResize();
        }

        function enterFocusIfPhone() {
            if (isPhone() && !focusDeclined) setFocus(true);
        }

        function toggleFocus() {
            if (disposed || mode === "loading" || mode === "cooldown" || mode === "done" || mode === "error") return;
            const on = !root.classList.contains("is-focus");
            focusDeclined = !on;
            setFocus(on);
            if (!on) root.scrollIntoView({ block: "start" });
        }

        function dispose() {
            if (disposed) return;
            disposed = true;
            cancelAnimationFrame(rafId);
            clearInterval(countdownTimer);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("visibilitychange", onVisibility);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener("resize", syncViewport);
                window.visualViewport.removeEventListener("scroll", syncViewport);
            }
            if (resizeObserver) resizeObserver.disconnect();
            if (timer) timer.dispose();
            if (leaveGuard) leaveGuard.dispose();
            root.classList.remove("is-focus");
            document.documentElement.classList.remove("fc-focus-lock");
            if (stage3d && stage3d.dispose) stage3d.dispose();
            stage3d = null;
        }

        ui.focusBtn.addEventListener("click", toggleFocus);

        // ---- boot ----
        async function boot() {
            setMode("loading");
            showOverlay(`
                <div class="fc-overlay-card">
                    <i class="fa-solid fa-spinner fa-spin fc-overlay-icon"></i>
                    <p>Shuffling the cards...</p>
                </div>
            `);

            // Fetch the 3D stage's files while the server answers, not after it.
            const stageFiles = import(FC_JS_BASE + "flashcards3d.js").then((mod) => ({ mod }), (error) => ({ error }));

            let play;
            try {
                // feat/game-countdown: opening the page never reveals a card.
                play = await fetchPlay(laId);
            } catch (err) {
                console.error("Error loading Flashcards:", err);
                if (!disposed) showError(err.message);
                return;
            }
            if (disposed) return;

            cards = play.cards || [];
            // No play yet (a new learner, before Start): its 5 cards are drawn on Start.
            total = cards.length || (PREVIEW ? 0 : Math.min(5, (play.state && play.state.pool_size) || 0));
            applyState(play.state);
            if (total === 0 && !(play.state && play.state.completed)) {
                dispose();
                onActivityDone();
                return;
            }
            score = play.state.first_try_correct * 100
                + Math.max(0, play.state.solved_count - play.state.first_try_correct) * 50;

            try {
                const loaded = await stageFiles;
                if (loaded.error) throw loaded.error;
                if (disposed) return;
                // "land" = forest clearing, "water" = inside a wooden ship
                stage3d = loaded.mod.createFlashStage(ui.canvas, { terrain: activity.terrain || "land" });
                stage3d.holdIntro();   // cobra waits in the bush / behind the doorway until Start
                // Shaders get ready here, behind "Shuffling the cards..." - the
                // first frame used to freeze the page while they compiled.
                await warmStage(stage3d);
            } catch (err) {
                console.warn("Card duel stage unavailable, showing the cards only:", err);
                stage3d = null;
                root.classList.add("fc-no-3d");
            }
            if (disposed) return;

            booted = true;
            if (timer) timer.onExpire(onTimerExpired);
            if (!PREVIEW && window.CobraGameKit) {
                leaveGuard = window.CobraGameKit.leaveGuard({
                    url: `${API_BASE_URL}/api/lesson-activities/game/leave`,
                    body: () => ({ la_id: laId }),
                    // only while a card is on screen (not on the Start card / 3 - 2 - 1)
                    isActive: () => !!(server && !server.completed && server.session_status === "in_progress"
                        && server.total_lives > 0 && server.current_revealed && root.isConnected),
                    // the server's leave_min_seconds: shorter absences never cover the game
                    minSeconds: () => (server && server.leave ? server.leave.min_seconds : 2),
                    onResult: onLeaveResult
                });
            }
            document.addEventListener("keydown", onKeyDown);
            document.addEventListener("visibilitychange", onVisibility);
            if (window.visualViewport) {
                window.visualViewport.addEventListener("resize", syncViewport);
                window.visualViewport.addEventListener("scroll", syncViewport);
            }
            updateFocusBtn();
            if (resizeObserver) resizeObserver.observe(root);
            countdownTimer = setInterval(tick, 1000);
            rafId = requestAnimationFrame(loop);

            // A card whose clock was already running (page refreshed or
            // reopened mid-card) can't wait for a countdown - it shows now.
            if (!PREVIEW && server.current_revealed && !server.completed
                && server.session_status === "in_progress" && server.total_lives > 0) {
                const ok = await openPlay();   // also counts a tab closed mid-card
                if (disposed) return;
                showLeaveEvents();
                if (ok && server.current_revealed) {
                    resyncFromState();
                    window.CobraGameKit.hideCover(root);
                    if (stage3d) stage3d.skipIntro();
                    showCardPreview("Your timer kept running while you were away - press Play to continue.");
                }
                return;
            }
            resyncFromState();
        }

        function showLeaveEvents() {
            if (PREVIEW || !window.CobraGameKit || !server || !server.events) return;
            server.events.forEach((event) => {
                if (event.type === "leave_warning" || event.type === "leave_forfeit") {
                    window.CobraGameKit.notice(event.type === "leave_warning" ? "Please stay on this page" : "Questions changed", event.message);
                }
            });
        }

        boot();
    }

    window.cobraByteRenderFlashcards = renderFlashcards;
})();