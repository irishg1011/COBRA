/**
 * lesson-fill-blanks.js - Learner Fill in the Blanks (Cobra vs SyntaxBug)
 * ---------------------------------------------------------------
 * Self-contained game for the "Fill in the Blanks" activity type. It
 * does not use any of the Multiple Choice cobra-arena code; lesson-
 * activities.js just hands the activity over through
 * window.cobraByteRenderFillBlanks(activity, container, onActivityDone).
 *
 * Rules (all enforced server-side - see game_plays.py):
 *   - Each play draws 5 items the learner has not seen (feat/question-pool-draw).
 *   - ONE attempt per item (feat/one-attempt-flow): wrong, Skip, running out
 *     of time or leaving the page twice cost 1 life; the feedback shows
 *     (never the answer) and Next puzzle moves on. No Try again.
 *   - Lives (feat/lives-5v5): 5 regular hearts, the daily bonus is a
 *     separate reserve used only after them. SyntaxBug has 5 health, one
 *     per drawn puzzle; each correct answer takes one.
 *   - Timer (feat/question-timer): a slim bar per puzzle; the server decides.
 *   - 0 lives: the play pauses BEFORE the next puzzle is revealed.
 *   - Console items (feat/fib-console): question, hint, the code with its
 *     blank and the expected output; the answer is put in the blank and
 *     the code really runs - the console shows the real output or error.
 *
 * POST /api/lesson-activities/fib-start reveals the current item (and is
 * the only call that does); GET fib-play reads the state; answers go to
 * POST fib-answer. Neither ever includes the correct answer.
 * The 3D stage (battle3d.js) is loaded only when this activity opens.
 * Its scenery follows activity.terrain ("land" forest / "water" ship,
 * from the chapter's side on the Learning Map), and the cobra slithers
 * in whenever the learner presses Start / Resume.
 *
 * Phones: Start / Resume opens the game full screen (.is-focus) so the
 * page behind can't scroll while answering - same as the Multiple
 * Choice arena. See "full screen (phones)" below.
 */
(function () {
    "use strict";

    // feat/admin-real-game-preview: set ONLY by admin-preview-play.js on /admin/preview-play.
    // Undefined on learner pages, so everything below runs exactly as before.
    const PREVIEW = window.COBRA_PREVIEW_MODE || null;
    const API_BASE_URL = PREVIEW ? PREVIEW.apiBase : ""; // feat/admin-login-page: same-origin, works on 127.0.0.1 and localhost

    // Folder this script was served from - battle3d.js (and
    // three.module.js) are loaded from the same folder.
    const FIB_JS_BASE = (document.currentScript && document.currentScript.src)
        ? new URL(".", document.currentScript.src).href
        : "";

    const FIB_BLANK_PATTERN = /\[?_{3,}\]?/;
    const FIB_TOKEN_PATTERN = /(#.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z0-9_'"#]+)/g;
    const FIB_KEYWORDS = new Set([
        "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
        "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
        "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
        "return", "try", "while", "with", "yield"
    ]);
    const FIB_ANIM = { strike: 1500, foebite: 1300, death: 1700 };

    // ---------------- small helpers ----------------
    function el(tag, className) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        return node;
    }

    function fibClock(totalSeconds) {
        const s = Math.max(0, Math.ceil(totalSeconds));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }

    // feat/lives-5v5: 5 regular hearts + the daily bonus as a separate reserve.
    function fibHearts(state) {
        return window.CobraGameKit ? window.CobraGameKit.hearts(state) : "";
    }

    // The cobra's health bar: the regular lives (max 5); while only the daily
    // reserve is left, the reserve - never more than 5 segments.
    function heroLives(state) {
        return Math.min(state.max_lives, state.lives > 0 ? state.lives : state.total_lives);
    }

    function fibLivesCount(state) {
        return window.CobraGameKit ? window.CobraGameKit.livesText(state) : "";
    }

    // The activities list has used both "la_id" and "activity_id" for the
    // same thing - accept either so this never calls ?la_id=undefined.
    function activityIdOf(activity) {
        const id = activity && (activity.la_id ?? activity.activity_id ?? activity.id);
        return id === undefined || id === null || id === "" ? null : id;
    }

    // Reads JSON safely: a missing route returns an HTML 404 page, which
    // would otherwise surface as a vague "Could not load" with no cause.
    async function readJson(response, what) {
        let data = null;
        try {
            data = await response.json();
        } catch (err) {
            data = null;
        }
        if (!data) {
            throw new Error(response.status === 404
                ? `The Fill in the Blanks API was not found (HTTP 404 on ${what}). Check that learner_fib_routes.py is registered in login.py and restart Flask.`
                : `The server sent an unexpected response (HTTP ${response.status} on ${what}).`);
        }
        return data;
    }

    async function fetchPlay(laId) {
        if (laId === null) throw new Error("This activity has no id in the activities list (la_id / activity_id is missing).");
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities/fib-play?la_id=${encodeURIComponent(laId)}`, {
            credentials: "include"
        });
        const data = await readJson(response, "fib-play");
        if (!response.ok || !data.success) throw new Error(data.message || `Request failed (HTTP ${response.status}).`);
        return data;
    }

    // Start-or-resume the play and reveal its current item (learners only -
    // the admin preview keeps its own fib-play flow).
    async function startPlay(laId, boot) {
        if (PREVIEW) return fetchPlay(laId);
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities/fib-start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ la_id: laId, boot: !!boot })
        });
        const data = await readJson(response, "fib-start");
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

    async function postAnswer(payload) {
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities/fib-answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload)
        });
        return readJson(response, "fib-answer");
    }

    // Appends syntax-coloured spans for one line of code. textContent only -
    // content comes from the database and is never parsed as HTML.
    function highlightInto(parent, text) {
        let last = 0;
        FIB_TOKEN_PATTERN.lastIndex = 0;
        let m;
        while ((m = FIB_TOKEN_PATTERN.exec(text)) !== null) {
            if (m[0] === "") { FIB_TOKEN_PATTERN.lastIndex += 1; continue; }
            if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
            let cls = "";
            if (m[1]) cls = "tok-cmt";
            else if (m[2]) cls = "tok-str";
            else if (m[3]) cls = "tok-num";
            else if (m[4]) {
                if (FIB_KEYWORDS.has(m[4])) cls = "tok-kw";
                else if (text.charAt(m.index + m[4].length) === "(") cls = "tok-fn";
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
        if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
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
    function renderFillBlanks(activity, container, onActivityDone) {
        container.innerHTML = "";
        const root = el("div", "fib-root");
        root.innerHTML = `
            <header class="fib-topbar">
                <div class="fib-brand">
                    <span class="fib-brand-icon"><i class="fa-solid fa-code"></i></span>
                    <div>
                        <span class="fib-brand-eyebrow">Activity · Fill in the Blanks</span>
                        <h3 class="fib-brand-title" data-f="title"></h3>
                    </div>
                </div>
                <div class="fib-stats">
                    <div class="fib-stat is-score" data-f="scoreStat"><b data-f="score">0</b><i>Score</i></div>
                    <div class="fib-stat"><b data-f="progress">-</b><i>Puzzle</i></div>
                    <div class="fib-stat"><b data-f="streak">0</b><i>Streak</i></div>
                    <div class="fib-stat is-lives" data-f="livesStat"><b><span class="fib-hearts" data-f="lives"></span><span class="fib-lives-count" data-f="livesCount"></span></b><i data-f="livesLabel">Lives</i></div>
                </div>
                <button type="button" class="fib-ghost-btn fib-focus-btn" data-f="focusBtn" aria-label="Full screen"><i class="fa-solid fa-expand"></i> <span>Full screen</span></button>
            </header>
            <div class="fib-play">
                <section class="fib-stage" data-f="stage">
                    <canvas class="fib-canvas" data-f="canvas"></canvas>
                    <div class="fib-hpbar is-hero">
                        <span class="fib-hpbar-name">Cobra · your debugger</span>
                        <div class="fib-hpbar-track" data-f="heroTrack"></div>
                    </div>
                    <div class="fib-hpbar is-foe">
                        <span class="fib-hpbar-name">SyntaxBug</span>
                        <div class="fib-hpbar-track" data-f="foeTrack"></div>
                    </div>
                    <p class="fib-stage-hint">Drag the arena to look around · double-click to reset</p>
                </section>
                <section class="fib-board">
                    <div class="fib-board-head">
                        <span class="fib-chip" data-f="qmeta"></span>
                        <span class="fib-chip is-muted" data-f="modeChip"></span>
                    </div>
                    <div data-f="timerHost"></div>
                    <p class="fib-instruction fib-question" data-f="instruction" hidden></p>
                    <p class="fib-hint" data-f="hint" hidden></p>
                    <div class="fib-code" data-f="code"></div>
                    <div class="fib-expected" data-f="expected" hidden>
                        <span class="fib-expected-label">Expected output</span>
                        <pre data-f="expectedText"></pre>
                    </div>
                    <div class="fib-console-out" data-f="consoleOut" hidden>
                        <span class="fib-console-label" data-f="consoleLabel">Your output</span>
                        <pre data-f="consoleText"></pre>
                    </div>
                    <div class="fib-tray-head" data-f="trayHead">
                        <h4>Choices</h4>
                        <span class="fib-keyhint">Click or drag a tile into the blank · <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>Backspace</kbd> clear · <kbd>Enter</kbd> check</span>
                    </div>
                    <div class="fib-tray" data-f="tray"></div>
                    <div class="fib-controls" data-f="controls">
                        <button type="button" class="fib-primary-btn" data-f="checkBtn" disabled><i class="fa-solid fa-check"></i> Check answer</button>
                        <button type="button" class="fib-ghost-btn" data-f="clearBtn"><i class="fa-solid fa-eraser"></i> Clear</button>
                        <button type="button" class="fib-ghost-btn fib-skip-btn" data-f="playSkipBtn"><i class="fa-solid fa-forward"></i> <span data-f="playSkipText">Skip (−1 life)</span></button>
                    </div>
                    <div class="fib-feedback" data-f="feedback" hidden>
                        <div class="fib-feedback-body">
                            <b class="fib-feedback-title" data-f="fbTitle"></b>
                            <p class="fib-feedback-text" data-f="fbText"></p>
                            <p class="fib-feedback-answer" data-f="fbAnswer" hidden></p>
                        </div>
                        <button type="button" class="fib-primary-btn" data-f="nextBtn" hidden>Next puzzle</button>
                        <div class="fib-feedback-actions" data-f="fbActions" hidden></div>
                    </div>
                </section>
                <div class="fib-overlay" data-f="overlay" hidden></div>
            </div>
        `;
        container.appendChild(root);

        const ui = {};
        root.querySelectorAll("[data-f]").forEach((node) => { ui[node.dataset.f] = node; });
        ui.title.textContent = activity.activity_title || "";
        const laId = activityIdOf(activity);

        // ---- state ----
        let items = [];
        let total = 0;
        let server = null;          // last state the server sent
        let mode = "loading";       // loading | ready | playing | busy | review | cooldown | done | error
        let booted = false;
        let disposed = false;
        let stage3d = null;         // battle3d.js api, null when WebGL/Three is unavailable
        let qIndex = 0;
        let score = 0, streak = 0, bestStreak = 0;
        let placedChoice = null;    // index into the current item's choices
        let wrongChoices = new Set(); // tiles already tried (wrong) on this item, this session
        let wrongOnCurrent = false;   // learner already got THIS puzzle wrong -> answer-bar Skip is free
        let slotEl = null, slotInput = null;
        let rafId = null, countdownTimer = null, refreshing = false;
        const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
        // feat/question-timer: above the question AND inside the game stage (phones, full screen)
        const timer = (!PREVIEW && window.CobraGameKit) ? window.CobraGameKit.timerBars([ui.timerHost, ui.stage]) : null;
        let leaveGuard = null;

        // battle animation state (display only - the server owns the real numbers)
        const bt = {
            foeMax: 1, foeHP: 1, heroMax: 3, heroHP: 3,
            anim: null, hitDone: false, shake: 0, flashFoe: 0, flashHero: 0,
            defeated: false, heroDown: false, t: 0, lastTs: 0
        };

        function currentItem() { return items[qIndex]; }
        function isTyping() { return !(currentItem().choices && currentItem().choices.length); }

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
            // feat/question-pool-draw: the play's drawn items (revealed ones in full).
            if (state && Array.isArray(state.items) && state.items.length) {
                items = state.items.map((item) => (item.hidden
                    ? { fib_id: item.fib_id, content: "", choices: [], hidden: true } : item));
                total = items.length;
            }
            if (timer && state && state.timer) {
                if (state.current_item_id && state.current_revealed && !state.completed) timer.sync(state.timer, state.current_item_id);
                else timer.hide();
            }
            updateHUD();
        }

        // SyntaxBug's health (feat/lives-5v5): one point per drawn puzzle,
        // each correct answer takes one - in a retake it carries on.
        function syncBugBars() {
            if (!server) return;
            bt.foeMax = Math.max(1, server.bug_max || total || 1);
            bt.foeHP = Math.max(0, server.bug_hp ?? (total - server.solved_count));
        }

        function updateHUD() {
            ui.score.textContent = score;
            ui.progress.textContent = total ? `${Math.min(qIndex + 1, total)}/${total}` : "-";
            ui.streak.textContent = streak;
            ui.lives.innerHTML = fibHearts(server);
            ui.livesCount.textContent = fibLivesCount(server);
            ui.livesLabel.textContent = (server && server.seconds_to_refill > 0)
                ? `Lives · refill ${fibClock(server.seconds_to_refill)}`
                : "Lives";
        }

        function bump(node) {
            node.classList.remove("bump");
            void node.offsetWidth;
            node.classList.add("bump");
        }

        function drawBars() {
            [[ui.foeTrack, bt.foeMax, bt.foeHP], [ui.heroTrack, bt.heroMax, bt.heroHP]].forEach(([track, max, hp]) => {
                track.innerHTML = "";
                for (let i = 0; i < max; i++) track.appendChild(el("i", i < hp ? "is-on" : ""));
            });
        }

        // ---- overlay (only static markup + numbers go through innerHTML) ----
        function showOverlay(html) {
            ui.overlay.innerHTML = html;
            ui.overlay.hidden = false;
        }

        function hideOverlay() {
            ui.overlay.hidden = true;
            ui.overlay.innerHTML = "";
        }

        function showReady(restored) {
            setMode("ready");
            let title = restored ? `Your lives are back (${fibLivesCount(server)})`
                : (server && server.solved_count > 0) ? "Pick up where you left off"
                : "Forge the missing code";
            if (server && server.retake) title = `Retake round ${Number(server.retake.round)} · ${title}`;
            showOverlay(`
                <div class="fib-overlay-card">
                    <i class="fa-solid ${restored ? "fa-heart" : "fa-code"} fib-overlay-icon"></i>
                    <h4>${title}</h4>
                    <p>Each puzzle hides part of the code. Fill the blank - the code really runs - and Cobra strikes SyntaxBug. You get one try per puzzle: a wrong answer, a skip or running out of time lets the bug bite back (−1 life).</p>
                    <div class="fib-keys"><kbd>1–9 pick a tile</kbd><kbd>Backspace clear</kbd><kbd>Enter check</kbd></div>
                    <div class="fib-overlay-actions">
                        <button type="button" class="fib-ghost-btn" data-f="startSkipBtn" aria-label="Skip this puzzle, costs 1 life"><i class="fa-solid fa-forward"></i> Skip (−1 life)</button>
                        <button type="button" class="fib-primary-btn" data-f="startBtn">${(server && server.solved_count > 0) || restored ? "Resume" : "Start activity"}</button>
                    </div>
                </div>
            `);
            const startFromReady = () => {
                enterFocusIfPhone();   // phones: the game goes full screen
                hideOverlay();
                if (stage3d) stage3d.playIntro();   // cobra slithers in (on open and on resume)
                setMode("playing");
                if (slotInput) slotInput.focus({ preventScroll: true });
            };
            ui.overlay.querySelector('[data-f="startBtn"]').addEventListener("click", startFromReady);
            ui.overlay.querySelector('[data-f="startSkipBtn"]').addEventListener("click", () => skipItem(true));
        }

        async function resumeFromCooldown() {
            if (disposed || mode !== "cooldown") return;
            setMode("busy");
            let play = null;
            try {
                play = await startPlay(laId, false);
            } catch (err) {
                if (!disposed) showError(err.message);
                return;
            }
            if (disposed) return;
            applyState(play.state);
            bt.heroDown = server.total_lives <= 0;
            resyncFromState(true);
        }

        function enterCooldown() {
            setMode("cooldown");
            bt.heroDown = true;
            if (stage3d) stage3d.skipIntro();
            showOverlay(`
                <div class="fib-overlay-card">
                    <div class="fib-overlay-hearts">${fibHearts(server)}</div>
                    <h4>You're out of lives.</h4>
                    <div class="fib-countdown" data-f="countdown">${fibClock(server ? server.seconds_to_refill : 0)}</div>
                    <p>until all 5 lives refill (bonus lives come back every day at 8:00 AM). You'll resume at puzzle ${qIndex + 1}. Review the lesson while you wait. Your progress is saved.</p>
                    <div class="fib-overlay-actions">
                        <button type="button" class="fib-primary-btn" data-f="reviewBtn"><i class="fa-solid fa-book-open"></i> Review lesson</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-f="reviewBtn"]').addEventListener("click", () => {
                document.dispatchEvent(new CustomEvent("cobrabyte:review-lesson"));
            });
        }

        function finish() {
            setMode("done");
            if (stage3d) stage3d.skipIntro();
            const firstTry = server ? server.first_try_correct : 0;
            const rt = server && server.retake;   // Module 85% gate: finished a retake round
            showOverlay(`
                <div class="fib-overlay-card">
                    <i class="fa-solid fa-trophy fib-overlay-icon"></i>
                    <h4>${rt ? `Retake round ${Number(rt.round)} complete` : (server && server.bug_hp === 0 ? "SyntaxBug defeated" : "Activity complete")}</h4>
                    <div class="fib-results">
                        <div><b>${rt ? `${Number(rt.fixed)}/${Number(rt.total)}` : `${firstTry}/${total}`}</b><span>${rt ? "Fixed" : "First try"}</span></div>
                        <div><b>${bestStreak}</b><span>Best streak</span></div>
                        <div><b>${score}</b><span>Score</span></div>
                    </div>
                    <p class="fib-saved-note">${rt
                        ? `${Number(rt.fixed)} of ${Number(rt.total)} missed puzzles fixed on the first try. Your module score is updated on the Lessons page.`
                        : `Saved to your progress: ${firstTry} correct on the first try`}</p>
                    <div class="fib-overlay-actions">
                        <button type="button" class="fib-primary-btn" data-f="continueBtn">Continue</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-f="continueBtn"]').addEventListener("click", () => {
                dispose();
                onActivityDone();
            });
        }

        function showError(message) {
            setMode("error");
            const isAuthError = Boolean(message && message.toLowerCase().includes("not logged in"));
            if (isAuthError) {
                showOverlay(`
                    <div class="fib-overlay-card">
                        <i class="fa-solid fa-lock fib-overlay-icon is-warn"></i>
                        <h4>Session Expired</h4>
                        <p data-f="errorText">Your login session has expired. Please sign in again to continue.</p>
                        <div class="fib-overlay-actions">
                            <button type="button" class="fib-primary-btn" data-f="loginBtn">Sign In</button>
                        </div>
                    </div>
                `);
                const loginBtn = ui.overlay.querySelector('[data-f="loginBtn"]');
                if (loginBtn) {
                    loginBtn.addEventListener("click", () => {
                        window.location.replace("/login");
                    });
                }
                return;
            }
            showOverlay(`
                <div class="fib-overlay-card">
                    <i class="fa-solid fa-triangle-exclamation fib-overlay-icon is-warn"></i>
                    <h4>Something went wrong</h4>
                    <p data-f="errorText"></p>
                    <div class="fib-overlay-actions">
                        <button type="button" class="fib-primary-btn" data-f="retryBtn">Try again</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-f="errorText"]').textContent =
                message || "Could not reach the server. Your progress is saved.";
            ui.overlay.querySelector('[data-f="retryBtn"]').addEventListener("click", async () => {
                if (!booted) { boot(); return; }
                try {
                    const play = await fetchPlay(laId);
                    applyState(play.state);
                } catch (err) {
                    if (err.message && err.message.toLowerCase().includes("not logged in")) {
                        showError(err.message);
                        return;
                    }
                    const text = ui.overlay.querySelector('[data-f="errorText"]');
                    if (text) text.textContent = `Still failing: ${err.message}`;
                    return;
                }
                if (!disposed) resyncFromState();
            });
        }

        // ---- puzzle board ----
        function loadItem() {
            const item = currentItem();
            placedChoice = null;
            wrongChoices = new Set();
            wrongOnCurrent = false;
            slotEl = null;
            slotInput = null;

            ui.qmeta.textContent = `Puzzle ${qIndex + 1} of ${total}`;
            ui.modeChip.textContent = isTyping() ? "Type the answer" : "Pick a tile";
            ui.instruction.textContent = item.instruction || "";
            ui.instruction.hidden = !item.instruction;
            // feat/fib-console + feat/hints-feedback: hint and expected output
            // show while answering; the console shows the real run afterwards.
            ui.hint.textContent = item.hint ? `Hint: ${item.hint}` : "";
            ui.hint.hidden = !item.hint;
            // The expected output is not shown while answering - only the
            // real output after a correct answer (showConsole).
            ui.expectedText.textContent = "";
            ui.expected.hidden = true;
            ui.consoleOut.hidden = true;
            hideFeedback();
            ui.trayHead.hidden = isTyping();
            ui.tray.hidden = isTyping();

            renderCode();
            renderTray();
            updateHUD();
            updateControls();
        }

        function buildSlot() {
            const slot = el("span", "fib-slot");
            if (isTyping()) {
                slot.classList.add("is-input");
                const input = el("input", "fib-slot-input");
                input.type = "text";
                input.autocomplete = "off";
                input.spellcheck = false;
                input.size = 8;
                input.setAttribute("aria-label", "Your answer for the blank");
                input.addEventListener("input", () => {
                    input.size = Math.max(8, input.value.length + 1);
                    slot.classList.remove("is-wrong");
                    updateControls();
                });
                input.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        if (mode === "playing") submitAnswer();
                        else if (mode === "review") advance();
                    }
                });
                slot.appendChild(input);
                slotInput = input;
            } else {
                slot.tabIndex = 0;
                slot.setAttribute("role", "button");
                slot.addEventListener("click", () => { if (mode === "playing") clearSlot(); });
                slot.addEventListener("dragover", (e) => {
                    if (mode !== "playing") return;
                    e.preventDefault();
                    slot.classList.add("is-over");
                });
                slot.addEventListener("dragleave", () => slot.classList.remove("is-over"));
                slot.addEventListener("drop", (e) => {
                    e.preventDefault();
                    slot.classList.remove("is-over");
                    const idx = Number(e.dataTransfer.getData("text/plain"));
                    if (mode === "playing" && !Number.isNaN(idx)) placeChoice(idx);
                });
            }
            slotEl = slot;
            paintSlot();
            return slot;
        }

        function paintSlot() {
            if (!slotEl || isTyping()) return;
            const choices = currentItem().choices;
            slotEl.textContent = placedChoice === null ? "?" : choices[placedChoice];
            slotEl.classList.toggle("is-filled", placedChoice !== null);
            slotEl.setAttribute("aria-label", placedChoice === null ? "Empty blank" : `Blank filled with ${choices[placedChoice]}. Click to clear.`);
        }

        function renderCode() {
            const content = String(currentItem().content || "").replace(/\r\n?/g, "\n");
            const lines = content.split("\n");
            const blankLine = lines.findIndex((line) => FIB_BLANK_PATTERN.test(line));
            ui.code.innerHTML = "";

            lines.forEach((line, i) => {
                const row = el("div", "fib-code-row");
                const ln = el("span", "fib-ln");
                ln.textContent = i + 1;
                const body = el("span", "fib-code-line");
                if (i === blankLine) {
                    const m = line.match(FIB_BLANK_PATTERN);
                    highlightInto(body, line.slice(0, m.index));
                    body.appendChild(buildSlot());
                    highlightInto(body, line.slice(m.index + m[0].length));
                } else {
                    highlightInto(body, line);
                }
                row.appendChild(ln);
                row.appendChild(body);
                ui.code.appendChild(row);
            });

            // No blank marker in the content: the answer goes on its own line.
            if (blankLine === -1) {
                const row = el("div", "fib-code-row");
                const ln = el("span", "fib-ln");
                ln.textContent = lines.length + 1;
                const body = el("span", "fib-code-line");
                body.appendChild(buildSlot());
                row.appendChild(ln);
                row.appendChild(body);
                ui.code.appendChild(row);
            }
        }

        function renderTray() {
            ui.tray.innerHTML = "";
            if (isTyping()) return;
            currentItem().choices.forEach((choice, i) => {
                const tile = el("button", "fib-tile");
                tile.type = "button";
                tile.draggable = true;
                tile.dataset.index = i;
                const key = el("span", "fib-tile-key");
                key.textContent = i < 9 ? i + 1 : "";
                const text = el("code", "fib-tile-text");
                text.textContent = choice;
                tile.appendChild(key);
                tile.appendChild(text);
                tile.addEventListener("click", () => { if (mode === "playing") placeChoice(i); });
                tile.addEventListener("dragstart", (e) => {
                    if (mode !== "playing" || wrongChoices.has(i)) { e.preventDefault(); return; }
                    e.dataTransfer.setData("text/plain", String(i));
                    e.dataTransfer.effectAllowed = "move";
                    tile.classList.add("is-dragging");
                });
                tile.addEventListener("dragend", () => tile.classList.remove("is-dragging"));
                ui.tray.appendChild(tile);
            });
            paintTray();
        }

        function paintTray() {
            ui.tray.querySelectorAll(".fib-tile").forEach((tile) => {
                const idx = Number(tile.dataset.index);
                tile.classList.toggle("is-used", idx === placedChoice);
                tile.classList.toggle("is-wrong", wrongChoices.has(idx));
                tile.disabled = mode !== "playing" || wrongChoices.has(idx);
            });
        }

        function placeChoice(i) {
            if (!currentItem().choices || i < 0 || i >= currentItem().choices.length || wrongChoices.has(i)) return;
            placedChoice = i;
            if (slotEl) slotEl.classList.remove("is-wrong");
            paintSlot();
            paintTray();
            updateControls();
        }

        function clearSlot() {
            if (slotInput) {
                slotInput.value = "";
                slotInput.size = 8;
                slotInput.focus({ preventScroll: true });
            } else {
                placedChoice = null;
                paintSlot();
                paintTray();
            }
            if (slotEl) slotEl.classList.remove("is-wrong");
            updateControls();
        }

        function currentAnswer() {
            if (slotInput) return slotInput.value.trim();
            return placedChoice === null ? "" : currentItem().choices[placedChoice];
        }

        function updateControls() {
            const playing = mode === "playing";
            const hasAnswer = items.length > 0 && !!currentAnswer();
            ui.checkBtn.disabled = !playing || !hasAnswer;
            ui.clearBtn.disabled = !playing || !hasAnswer;
            // Skip always costs 1 life (feat/one-attempt-flow).
            ui.playSkipText.textContent = "Skip (−1 life)";
            ui.playSkipBtn.setAttribute("aria-label", "Skip this puzzle, costs 1 life");
            ui.playSkipBtn.disabled = !playing || items.length === 0 || !server || server.total_lives <= 0;
            ui.controls.hidden = mode === "review";
            if (slotInput) slotInput.disabled = !playing;
            paintTray();
        }

        function hideFeedback() {
            ui.feedback.hidden = true;
            ui.nextBtn.hidden = true;
            ui.fbActions.hidden = true;
            ui.fbAnswer.hidden = true;
        }

        function showConsole(consoleResult) {
            if (!consoleResult) {
                ui.consoleOut.hidden = true;
                return;
            }
            // Correct -> the program's output (exactly the expected output).
            // Wrong -> the Python error, or what their code printed instead.
            const isError = !!consoleResult.error;
            const correct = !!consoleResult.correct;
            ui.consoleOut.hidden = false;
            ui.consoleOut.classList.toggle("is-error", !correct);
            ui.consoleLabel.textContent = correct ? "Output" : isError ? "Python error" : "Your output (not what the question asks for)";
            ui.consoleText.textContent = isError ? consoleResult.error : (consoleResult.output || "(nothing was printed)");
        }

        function showFeedback(result) {
            ui.feedback.hidden = false;
            ui.feedback.classList.toggle("is-correct", !!result.is_correct);
            ui.feedback.classList.toggle("is-incorrect", !result.is_correct);
            ui.fbTitle.textContent = result.is_correct ? "Correct!"
                : result.timed_out ? "Time's up" : result.is_close ? "Almost there" : "Not quite";
            ui.fbText.textContent = result.is_correct
                ? (result.feedback || "")
                : `${result.feedback || ""} SyntaxBug bites back (−1 life). This puzzle counts as missed.`.trim();
            showConsole(result.console ? Object.assign({ correct: !!result.is_correct }, result.console) : null);
            // One try per puzzle: the only way forward is the next puzzle.
            // The correct answer is never shown.
            ui.fbAnswer.hidden = true;
            ui.fbAnswer.innerHTML = "";
            ui.fbActions.hidden = true;
            ui.nextBtn.hidden = false;
            ui.nextBtn.textContent = server.completed ? "See results" : "Next puzzle";
        }

        // ---- answering ----
        async function submitAnswer() {
            const answer = currentAnswer();
            if (mode !== "playing" || !answer) return;
            setMode("busy");
            const item = currentItem();
            const triedChoice = placedChoice;

            let result = null;
            try {
                result = await postAnswer({ la_id: laId, fib_id: item.fib_id, answer: answer });
            } catch (err) {
                result = { success: false, message: err.message };
            }
            if (disposed) return;
            if (!result || !result.success) {
                showError(result && result.message);
                return;
            }

            applyState(result.state);
            if (!result.graded) {
                // Out of lives or on a different item than the server - resync.
                resyncFromState();
                return;
            }

            showFeedback(result);
            if (result.is_correct) {
                syncBugBars();
                if (slotEl) slotEl.classList.add("is-right");
                streak += 1;
                bestStreak = Math.max(bestStreak, streak);
                score += (result.first_try ? 100 : 50) + streak * 20;
                bump(ui.scoreStat);
                heroStrike();
                updateHUD();
                setMode("review");
                ui.nextBtn.focus({ preventScroll: true });
                return;
            }

            // Wrong: marked wrong, and the play moves on (Next puzzle) -
            // at 0 lives the next puzzle opens paused (advance -> cooldown).
            wrongOnCurrent = true;
            streak = 0;
            bump(ui.livesStat);
            foeStrike();
            if (slotEl) slotEl.classList.add("is-wrong");
            if (triedChoice !== null) {
                wrongChoices.add(triedChoice);
                placedChoice = null;
                paintSlot();
            }
            updateHUD();
            // The checked answer stays on screen, locked; Next moves on.
            setMode("review");
            ui.nextBtn.focus({ preventScroll: true });
        }

        // Skip the current puzzle: always -1 life, no score - the server
        // logs it as 'skipped' (counts as missed). fromPreview: the intro card.
        async function skipItem(fromPreview) {
            fromPreview = fromPreview === true;   // the button passes a click event
            const canSkip = fromPreview ? mode === "ready" : mode === "playing";
            if (disposed || !canSkip) return;
            setMode("busy");
            let data = null;
            try {
                data = await postJson("fib-skip", { la_id: laId, fib_id: currentItem().fib_id, from_preview: true });
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
            streak = 0;
            hideFeedback();
            if (fromPreview) {
                // Leave the intro card first.
                enterFocusIfPhone();   // the play starts here too (phones: full screen)
                hideOverlay();
                if (stage3d) stage3d.playIntro();
            }
            // SyntaxBug bites (-1 life) for a skip.
            bump(ui.livesStat);
            bt.heroHP = heroLives(server);
            foeStrike();
            if (stage3d) stage3d.float("foe", "Skipped", "#64748b");
            updateHUD();
            setTimeout(() => {
                if (disposed) return;
                if (server.completed) {
                    finish();
                    return;
                }
                revealNext();
            }, FIB_ANIM.foebite);
        }

        // feat/question-timer: the bar ran out - the server checks its own clock.
        async function onTimerExpired(fibId) {
            if (disposed || !server || server.current_item_id !== fibId) return;
            if (mode !== "playing" && mode !== "ready") return;
            if (mode === "ready") hideOverlay();
            setMode("busy");
            let data = null;
            try {
                data = await postJson("game/timeout", { la_id: laId, item_id: fibId });
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
            bt.heroHP = heroLives(server);
            foeStrike();
            showFeedback({ is_correct: false, timed_out: true, feedback: data.feedback });
            setMode("review");
            ui.nextBtn.focus({ preventScroll: true });
        }

        // feat/leave-detection: what the server decided when the learner came back.
        function onLeaveResult(data) {
            if (disposed || !data || !data.state) return;
            applyState(data.state);
            const event = data.event;
            if (!event) return;
            if (window.CobraGameKit) {
                window.CobraGameKit.notice(event.type === "leave_warning" ? "Please stay on this page" : "Questions changed",
                    event.message);
            }
            if (event.type === "leave_forfeit") {
                streak = 0;
                bump(ui.livesStat);
                bt.heroHP = heroLives(server);
                hideFeedback();
                if (server.completed) finish();
                else revealNext();
            }
        }

        // The next puzzle is revealed (and its clock started) by the server
        // only now - never while feedback is shown or at 0 lives.
        async function revealNext() {
            if (disposed) return;
            if (server.total_lives <= 0) {
                qIndex = Math.min(server.current_index, total - 1);
                setMode("busy");
                loadItem();
                enterCooldown();
                return;
            }
            setMode("busy");
            let play = null;
            try {
                play = await startPlay(laId, false);
            } catch (err) {
                if (!disposed) showError(err.message);
                return;
            }
            if (disposed) return;
            applyState(play.state);
            if (server.completed) {
                finish();
                return;
            }
            qIndex = Math.min(server.current_index, total - 1);
            setMode("playing");
            loadItem();
            if (server.total_lives <= 0 || (!PREVIEW && server.session_status !== "in_progress")) enterCooldown();
            else if (slotInput) slotInput.focus({ preventScroll: true });
        }

        function advance() {
            if (mode !== "review") return;
            if (server.completed) {
                if (bt.anim && bt.anim.name === "death") {
                    setMode("busy");
                    setTimeout(() => { if (!disposed) finish(); }, FIB_ANIM.death);
                } else {
                    finish();
                }
                return;
            }
            revealNext();
        }

        function resyncFromState(restored) {
            hideOverlay();
            syncBugBars();
            // Cobra's HP bar: the regular 5 plus any bonus lives left today.
            bt.heroMax = server.max_lives;   // feat/lives-5v5: the bar never shows more than 5
            bt.heroHP = heroLives(server);
            bt.heroDown = server.total_lives <= 0;
            bt.defeated = bt.foeHP === 0;
            drawBars();
            if (server.completed) {
                finish();
                return;
            }
            qIndex = Math.min(server.current_index, total - 1);
            setMode("ready");
            loadItem();
            if (server.total_lives <= 0 || server.session_status === "paused") enterCooldown();
            else showReady(!!restored);
        }

        async function refreshState() {
            if (refreshing) return;
            refreshing = true;
            try {
                const play = await fetchPlay(laId);
                if (disposed) return;
                applyState(play.state);
                bt.heroMax = play.state.max_lives;
                bt.heroHP = heroLives(play.state);
                bt.heroDown = play.state.total_lives <= 0;
                drawBars();
                if (mode === "cooldown" && play.state.total_lives > 0) resumeFromCooldown();
            } catch (err) {
                if (server) {                    // retry shortly
                    server.seconds_to_refill = Math.max(server.seconds_to_refill, 5);
                    server.seconds_to_daily_reset = Math.max(server.seconds_to_daily_reset, 5);
                }
            } finally {
                refreshing = false;
            }
        }

        function tick() {
            if (!server || server.completed) return;
            // Daily 8:00 AM bonus reset - pick it up even if the page stayed open.
            server.seconds_to_daily_reset -= 1;
            if (server.seconds_to_daily_reset <= 0) {
                refreshState();
                return;
            }
            if (server.seconds_to_refill <= 0) return;
            server.seconds_to_refill = Math.max(0, server.seconds_to_refill - 1);
            updateHUD();
            const countdown = ui.overlay.querySelector('[data-f="countdown"]');
            if (countdown) countdown.textContent = fibClock(server.seconds_to_refill);
            if (server.seconds_to_refill <= 0) refreshState();
        }

        // ---- battle stage ----
        function playAnim(name, onImpact, onEnd) {
            bt.anim = { name, dur: FIB_ANIM[name], t: 0, startTs: performance.now(), onImpact, onEnd };
            bt.hitDone = false;
        }

        function heroStrike() {
            playAnim("strike", () => {
                bt.foeHP = Math.max(0, bt.foeHP - 1);
                bt.flashFoe = 1;
                bt.shake = 16;
                if (stage3d) {
                    stage3d.float("foe", "-1 HP", "#dc2626");
                    stage3d.burst("foe", "#f87171", 26);
                }
                drawBars();
                if (bt.foeHP === 0) {
                    setTimeout(() => {
                        if (!disposed) playAnim("death", null, () => { bt.defeated = true; });
                    }, 380);
                }
            });
        }

        function foeStrike() {
            playAnim("foebite", () => {
                bt.heroHP = server ? heroLives(server) : Math.max(0, bt.heroHP - 1);
                bt.flashHero = 1;
                bt.shake = 14;
                if (stage3d) {
                    stage3d.float("hero", "-1 life", "#dc2626");
                    stage3d.burst("hero", "#16a34a", 18);
                }
                drawBars();
                if (bt.heroHP <= 0) bt.heroDown = true;
            });
        }

        function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
        function easeIn(t) { return t * t; }

        function heroLunge() {
            if (!bt.anim) return 0;
            const p = bt.anim.t / bt.anim.dur;
            if (bt.anim.name === "strike") {
                if (p < 0.22) return -0.22 * easeOut(p / 0.22);
                if (p < 0.42) return easeIn((p - 0.22) / 0.20);
                if (p < 0.62) return 1;
                return 1 - easeOut((p - 0.62) / 0.38);
            }
            if (bt.anim.name === "foebite" && p > 0.36 && p < 0.66) return -0.18;
            return 0;
        }

        function foeLunge() {
            if (!bt.anim || bt.anim.name !== "foebite") return 0;
            const p = bt.anim.t / bt.anim.dur;
            if (p < 0.24) return -0.15 * easeOut(p / 0.24);
            if (p < 0.42) return easeIn((p - 0.24) / 0.18);
            if (p < 0.58) return 1;
            return 1 - easeOut((p - 0.58) / 0.42);
        }

        function loop(ts) {
            if (disposed) return;
            rafId = requestAnimationFrame(loop);
            const dt = Math.min((ts - bt.lastTs) / 1000, 0.12) || 0;
            bt.lastTs = ts;
            bt.t += dt;
            if (bt.anim) {
                bt.anim.t = performance.now() - bt.anim.startTs;
                const p = bt.anim.t / bt.anim.dur;
                if (!bt.hitDone && p >= 0.42 && bt.anim.onImpact) { bt.hitDone = true; bt.anim.onImpact(); }
                if (p >= 1) { const end = bt.anim.onEnd; bt.anim = null; if (end) end(); }
            }
            bt.shake = Math.max(0, bt.shake - dt * 40);
            bt.flashFoe = Math.max(0, bt.flashFoe - dt * 2.4);
            bt.flashHero = Math.max(0, bt.flashHero - dt * 2.4);

            if (!stage3d || !isShown()) return; // hidden: skip the GPU work
            stage3d.render({
                t: bt.t,
                heroLunge: heroLunge(),
                foeLunge: foeLunge(),
                heroFlash: bt.flashHero,
                foeFlash: bt.flashFoe,
                shake: bt.shake * 0.02,
                hp01: bt.foeMax ? bt.foeHP / bt.foeMax : 0,
                critical: bt.foeMax > 1 && bt.foeHP === 1,
                dying: bt.anim && bt.anim.name === "death" ? bt.anim.t / bt.anim.dur : 0,
                dead: bt.defeated,
                heroDown: bt.heroDown,
                status: bt.defeated ? "bug fixed \u2713" : ""
            });
        }

        // ---- input + lifecycle ----
        function onKeyDown(e) {
            if (disposed || !items.length || !isShown()) return;
            const target = e.target;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
            if (target && target.closest && target.closest("button") && e.key === "Enter") return; // let the focused button handle it

            if (mode === "playing" && !isTyping() && /^[1-9]$/.test(e.key)) {
                const idx = Number(e.key) - 1;
                if (idx < currentItem().choices.length) {
                    e.preventDefault();
                    placeChoice(idx);
                }
            } else if (mode === "playing" && e.key === "Backspace" && !isTyping()) {
                e.preventDefault();
                clearSlot();
            } else if (e.key === "Enter") {
                if (mode === "playing" && currentAnswer()) { e.preventDefault(); submitAnswer(); }
                else if (mode === "review") { e.preventDefault(); advance(); }
            }
        }

        function onVisibility() {
            if (!document.hidden && server) {
                refreshState(); // timers are throttled in background tabs
            }
        }

        function onResize() {
            if (disposed) return;
            updateFocusBtn();   // a turned phone / resized window may change "is this a phone"
            if (stage3d) stage3d.resize();
        }

        // ---- full screen (phones): the game fills the screen while playing ----
        // Same idea as the Multiple Choice arena: Start / Resume on a phone
        // opens the game full screen and the page behind stops scrolling.
        // It closes by itself on the results, an error, or when lives run
        // out, and the learner can leave / come back with the button in
        // the top bar. Styles: .fib-root.is-focus in the CSS file.
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
        // to leave the room to the puzzle.
        function syncViewport() {
            const vv = window.visualViewport;
            const usable = !!vv && root.classList.contains("is-focus") && Math.abs(vv.scale - 1) < 0.01;
            root.classList.toggle("has-viewport", usable);
            root.classList.toggle("is-compact", usable && vv.height < window.innerHeight - 120);
            if (usable) {
                root.style.setProperty("--fib-vv-top", `${vv.offsetTop}px`);
                root.style.setProperty("--fib-vv-height", `${vv.height}px`);
            }
        }

        function setFocus(on) {
            if (root.classList.contains("is-focus") === on) return;
            root.classList.toggle("is-focus", on);
            document.documentElement.classList.toggle("fib-focus-lock", on);
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
            document.documentElement.classList.remove("fib-focus-lock");
            if (stage3d && stage3d.dispose) stage3d.dispose();
            stage3d = null;
        }

        ui.focusBtn.addEventListener("click", toggleFocus);
        ui.checkBtn.addEventListener("click", submitAnswer);
        ui.clearBtn.addEventListener("click", () => { if (mode === "playing") clearSlot(); });
        ui.nextBtn.addEventListener("click", advance);
        ui.playSkipBtn.addEventListener("click", () => skipItem(false));

        // ---- boot ----
        async function boot() {
            setMode("loading");
            showOverlay(`
                <div class="fib-overlay-card">
                    <i class="fa-solid fa-spinner fa-spin fib-overlay-icon"></i>
                    <p>Loading activity...</p>
                </div>
            `);

            // Fetch the 3D stage's files while the server answers, not after it.
            const stageFiles = import(FIB_JS_BASE + "battle3d.js").then((mod) => ({ mod }), (error) => ({ error }));

            let play;
            try {
                play = await startPlay(laId, true);
            } catch (err) {
                console.error("Error loading fill-in-the-blanks activity:", err);
                if (!disposed) showError(`Could not load this activity. ${err.message || ""}`.trim());
                return;
            }
            if (disposed) return;

            items = play.items || [];
            total = items.length;
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
                // Scenery follows the chapter's side on the Learning Map:
                // "land" = forest clearing, "water" = inside a wooden ship.
                stage3d = loaded.mod.createBattle(ui.canvas, { terrain: activity.terrain || "land" });
                stage3d.holdIntro();   // cobra waits in the bush / behind the doorway until Start
                // Shaders get ready here, behind "Loading activity..." - the
                // first frame used to freeze the page while they compiled.
                await warmStage(stage3d);
            } catch (err) {
                console.warn("Battle stage unavailable, showing the board only:", err);
                stage3d = null;
                root.classList.add("fib-no-3d");
            }
            if (disposed) return;

            booted = true;
            if (timer) timer.onExpire(onTimerExpired);
            if (!PREVIEW && window.CobraGameKit) {
                leaveGuard = window.CobraGameKit.leaveGuard({
                    url: `${API_BASE_URL}/api/lesson-activities/game/leave`,
                    body: () => ({ la_id: laId }),
                    isActive: () => !!(server && !server.completed && server.session_status === "in_progress"
                        && server.total_lives > 0 && root.isConnected),
                    onResult: onLeaveResult
                });
                (play.state.events || []).forEach((event) => {
                    if (event.type === "leave_warning" || event.type === "leave_forfeit") {
                        window.CobraGameKit.notice(event.type === "leave_warning" ? "Please stay on this page" : "Questions changed", event.message);
                    }
                });
            }
            document.addEventListener("keydown", onKeyDown);
            document.addEventListener("visibilitychange", onVisibility);
            if (window.visualViewport) {
                window.visualViewport.addEventListener("resize", syncViewport);
                window.visualViewport.addEventListener("scroll", syncViewport);
            }
            updateFocusBtn();
            if (resizeObserver) resizeObserver.observe(ui.stage);
            countdownTimer = setInterval(tick, 1000);
            rafId = requestAnimationFrame(loop);

            resyncFromState();
        }

        boot();
    }

    window.cobraByteRenderFillBlanks = renderFillBlanks;
})();