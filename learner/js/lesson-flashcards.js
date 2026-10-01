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
 *   - wrong: the scorpion stings (-1 life) and a modal shows the card's
 *     feedback and its back; the learner picks Try Again (SAME card) or
 *     Skip card (next card - no life, no score)
 * A preview modal shows every card's front before it is played.
 *
 * Rules (all enforced server-side - see lesson_flashcards.py):
 *   - One Flashcards lives pool per learner, shared across all lessons:
 *     5 regular lives (all back 10 minutes after the first loss) + 5
 *     bonus lives every day at 8:00 AM PH time, spent first. HUD shows
 *     total/5, e.g. "7/5".
 *   - 0 lives: the play pauses on its card; review the lesson and come
 *     back - it resumes the same play once a life is back.
 *   - Saved score = cards answered exactly right on the first try. No replay.
 *
 * Cards come from GET /api/lesson-activities/flashcard-play (front_text
 * only - never the answer). The 3D stage (flashcards3d.js) follows
 * activity.terrain ("land" forest / "water" ship).
 */
(function () {
    "use strict";

    const API_BASE_URL = ""; // feat/admin-login-page: same-origin, works on 127.0.0.1 and localhost
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

    // Regular hearts (red, filled/empty out of max_lives) + today's bonus hearts (gold).
    function fcHearts(state) {
        const lives = state ? state.lives : 0;
        const max = state ? state.max_lives : 5;
        const bonus = state ? state.bonus_lives : 0;
        let html = "";
        for (let i = 0; i < max; i++) {
            html += `<i class="${i < lives ? "fa-solid" : "fa-regular"} fa-heart"></i>`;
        }
        for (let i = 0; i < bonus; i++) {
            html += '<i class="fa-solid fa-heart is-bonus"></i>';
        }
        return html;
    }

    function fcLivesCount(state) {
        return state ? `${state.total_lives}/${state.max_lives}` : "";
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
                    <div class="fc-card">
                        <span class="fc-card-label">Front</span>
                        <p class="fc-card-front" data-c="front"></p>
                    </div>
                    <div class="fc-answer-row" data-c="answerRow">
                        <input type="text" class="fc-answer-input" data-c="input" autocomplete="off" spellcheck="false" placeholder="Type the answer on the back of the card..." aria-label="Your answer">
                        <button type="button" class="fc-primary-btn" data-c="checkBtn" disabled><i class="fa-solid fa-bolt"></i> Throw answer</button>
                        <button type="button" class="fc-ghost-btn fc-skip-btn" data-c="playSkipBtn"><i class="fa-solid fa-forward"></i> <span data-c="playSkipText">Skip (−1 life)</span></button>
                    </div>
                    <div class="fc-feedback" data-c="feedback" hidden>
                        <div class="fc-feedback-body">
                            <b class="fc-feedback-title" data-c="fbTitle"></b>
                            <p class="fc-feedback-text" data-c="fbText"></p>
                            <p class="fc-feedback-exact" data-c="fbExact" hidden></p>
                        </div>
                        <button type="button" class="fc-primary-btn" data-c="nextBtn">Next card</button>
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
        let disposed = false;
        let stage3d = null;
        let qIndex = 0;
        let score = 0, streak = 0, bestStreak = 0;
        let revealedAnswer = null;  // the card's back, revealed after a wrong answer
        let rafId = null, countdownTimer = null, refreshing = false;
        const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;

        // duel animation state (display only - the server owns the real numbers)
        const fx = {
            foeMax: 1, foeHP: 1, heroMax: 5, heroHP: 5, collected: 0,
            anim: null, hitDone: false, shake: 0, flashFoe: 0, flashHero: 0,
            thrown: false, glow: "", defeated: false, heroDown: false, t: 0, lastTs: 0
        };

        function currentCard() { return cards[qIndex]; }

        // ---- HUD ----
        function setMode(next) {
            mode = next;
            root.dataset.mode = next;
            updateControls();
        }

        function applyState(state) {
            server = state;
            updateHUD();
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
            // Answer-bar Skip: free once this card was answered wrong,
            // otherwise -1 life (same rule as the preview skip).
            const skipCostsLife = !wrongOnCurrent;
            ui.playSkipText.textContent = skipCostsLife ? "Skip (−1 life)" : "Skip";
            ui.playSkipBtn.setAttribute("aria-label", skipCostsLife ? "Skip this card, costs 1 life" : "Skip this card");
            ui.playSkipBtn.disabled = !playing || (skipCostsLife && (!server || server.total_lives <= 0));
            ui.answerRow.hidden = mode === "review";
        }

        // ---- overlay (static markup + numbers only; DB text via textContent) ----
        function showOverlay(html) {
            ui.overlay.innerHTML = html;
            ui.overlay.hidden = false;
        }

        function hideOverlay() {
            ui.overlay.hidden = true;
            ui.overlay.innerHTML = "";
        }

        function overlayNode(name) {
            return ui.overlay.querySelector(`[data-c="${name}"]`);
        }

        // Preview: read the card's front BEFORE it is played.
        //   kind: start | continue | resume | next
        function showPreview(kind) {
            setMode("ready");
            const copy = {
                start: { eyebrow: "Read the card first", btn: "Start duel" },
                continue: { eyebrow: "Pick up where you left off", btn: "Continue" },
                resume: { eyebrow: "Your lives are back - resuming where you stopped", btn: "Resume" },
                next: { eyebrow: "Next card", btn: "Play card" }
            }[kind];
            showOverlay(`
                <div class="fc-overlay-card fc-preview">
                    <span class="fc-preview-eyebrow" data-c="pvEyebrow"></span>
                    <div class="fc-preview-card">
                        <span class="fc-card-label" data-c="pvMeta"></span>
                        <p class="fc-preview-front" data-c="pvFront"></p>
                    </div>
                    <p>Type what's on the back of this card. Get it right and Cobra flings the card at NullScorpion; get it wrong and the scorpion stings back (−1 life).</p>
                    <div class="fc-keys"><kbd>Enter = throw answer</kbd></div>
                    <div class="fc-overlay-actions">
                        <button type="button" class="fc-ghost-btn" data-c="pvSkipBtn" aria-label="Skip this card, costs 1 life"><i class="fa-solid fa-forward"></i> Skip (−1 life)</button>
                        <button type="button" class="fc-primary-btn" data-c="pvBtn"><i class="fa-solid fa-play"></i> <span data-c="pvBtnText"></span></button>
                    </div>
                </div>
            `);
            overlayNode("pvEyebrow").textContent = (server && server.retake)
                ? `Retake round ${server.retake.round} · ${copy.eyebrow}`
                : copy.eyebrow;
            overlayNode("pvMeta").textContent = `Card ${qIndex + 1} of ${total}`;
            overlayNode("pvFront").textContent = currentCard().front_text;
            overlayNode("pvBtnText").textContent = copy.btn;
            const startFromPreview = () => {
                if (kind === "next") {
                    hideOverlay();
                    setMode("playing");
                    ui.input.focus({ preventScroll: true });
                    return;
                }
                beginPlay();
            };
            const btn = overlayNode("pvBtn");
            btn.addEventListener("click", startFromPreview);
            overlayNode("pvSkipBtn").addEventListener("click", () => skipFromPreview(kind));
            btn.focus({ preventScroll: true });
        }

        function fillReveal(node) {
            if (!node) return;
            node.hidden = !revealedAnswer;
            if (!revealedAnswer) return;
            node.innerHTML = "";
            const label = el("span", "fc-reveal-label");
            label.textContent = "Back of the card";
            const text = el("span", "fc-reveal-text");
            text.textContent = revealedAnswer;
            node.appendChild(label);
            node.appendChild(text);
        }

        // Wrong answer: show why, reveal the back, then Try Again (same
        // card) or Skip card (next card - no life, no score).
        function showTryAgain(feedback) {
            setMode("tryagain");
            const lives = server ? server.total_lives : 0;
            showOverlay(`
                <div class="fc-overlay-card">
                    <i class="fa-solid fa-circle-xmark fc-overlay-icon is-danger"></i>
                    <h4>Not quite</h4>
                    <p class="fc-tryagain-feedback" data-c="taFeedback"></p>
                    <div class="fc-reveal" data-c="taReveal" hidden></div>
                    <p class="fc-subnote">NullScorpion stung you (−1 life) · ${lives} ${lives === 1 ? "life" : "lives"} left. Try card ${qIndex + 1} again for the satisfaction, or skip to the next one.</p>
                    <div class="fc-overlay-actions">
                        <button type="button" class="fc-ghost-btn" data-c="skipBtn"><i class="fa-solid fa-forward"></i> Skip card</button>
                        <button type="button" class="fc-primary-btn" data-c="taBtn"><i class="fa-solid fa-rotate-right"></i> Try Again</button>
                    </div>
                </div>
            `);
            overlayNode("taFeedback").textContent = feedback || "That's not what's on the back of this card.";
            fillReveal(overlayNode("taReveal"));
            overlayNode("skipBtn").addEventListener("click", skipCard);
            const btn = overlayNode("taBtn");
            btn.addEventListener("click", () => {
                hideOverlay();
                fx.glow = "";
                setMode("playing");
                ui.input.select();
                ui.input.focus({ preventScroll: true });
            });
            btn.focus({ preventScroll: true });
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
            overlayNode("cdResumeBtn").addEventListener("click", beginPlay);
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
                    <h4>${rt ? `Retake round ${Number(rt.round)} complete` : "NullScorpion defeated"}</h4>
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
                    const text = overlayNode("errorText");
                    if (text) text.textContent = `Still failing: ${err.message}`;
                    return;
                }
                if (!disposed) resyncFromState();
            });
        }

        // ---- card board ----
        function loadCard() {
            const card = currentCard();
            ui.qmeta.textContent = `Card ${qIndex + 1} of ${total}`;
            ui.front.textContent = card.front_text;
            ui.input.value = "";
            ui.feedback.hidden = true;
            revealedAnswer = null;
            wrongOnCurrent = false;
            fx.thrown = false;
            fx.glow = "";
            if (stage3d) stage3d.setCard(`Card ${qIndex + 1} of ${total}`, card.front_text, "?");
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
        }

        // ---- play flow ----
        function resyncFromState() {
            hideOverlay();
            fx.foeMax = Math.max(1, total);
            fx.foeHP = Math.max(0, total - server.solved_count);
            fx.collected = server.solved_count;
            fx.heroMax = Math.max(server.max_lives, server.total_lives);
            fx.heroHP = server.total_lives;
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
            else if (server.session_status === "paused") showPreview("resume");
            else if (server.session_status === "in_progress") showPreview("continue");
            else showPreview("start");
        }

        // Starts the ONE play on the server, or continues/resumes that same
        // play. true = in progress on the current card; false = it can't
        // run (completed, out of lives, error) and the right screen is shown.
        async function openPlay() {
            let data = null;
            try {
                data = await postJson("flashcard-start", { la_id: laId });
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
            fx.heroHP = server.total_lives;
            fx.heroMax = Math.max(fx.heroMax, server.total_lives);
            drawBars();
            if (Math.min(server.current_index, total - 1) !== qIndex) {
                qIndex = Math.min(server.current_index, total - 1);
                loadCard();
            }
            return true;
        }

        // Start the ONE play, or continue/resume that same play.
        async function beginPlay() {
            if (disposed || mode === "busy") return;
            setMode("busy");
            if (!(await openPlay())) return;
            hideOverlay();
            if (stage3d) stage3d.playIntro();   // cobra slithers in (on open and on resume)
            setMode("playing");
            ui.input.focus({ preventScroll: true });
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
                if (stage3d) stage3d.setCard(`Card ${qIndex + 1} of ${total}`, card.front_text, result.answer || answer);
                fx.glow = result.is_close ? "close" : "ok";
                winAnim();
                updateHUD();
                showFeedback(result);
                setMode("review");
                ui.nextBtn.disabled = true;           // wait for the card to land
                return;
            }

            // Wrong: reveal the back, then Try Again or Skip.
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
                if (server.total_lives <= 0) enterCooldown();
                else showTryAgain(result.feedback);
            }, FC_ANIM.sting);
        }

        // Skip the current card (only offered after a wrong answer): no
        // life, no score - the server logs it as 'skipped'. The card still
        // flips to its back and flies off, so the duel moves on.
        async function skipCard() {
            if (disposed || mode !== "tryagain") return;
            setMode("busy");
            await sendSkip(false);
        }

        // Skip from the answer bar while playing: free if this card was
        // already answered wrong (same as Skip card), otherwise -1 life
        // like the preview skip. No score either way - logged as 'skipped'.
        async function skipFromBar() {
            if (disposed || mode !== "playing") return;
            setMode("busy");
            await sendSkip(!wrongOnCurrent, false);
        }

        // Skip from the card preview (the card was never played): costs 1
        // life (NullScorpion stings), no score - logged as 'skipped'.
        // Start/continue/resume previews open the play first.
        async function skipFromPreview(kind) {
            if (disposed || mode !== "ready") return;
            setMode("busy");
            if (kind !== "next" && !(await openPlay())) return;
            await sendSkip(true, kind !== "next");
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
                if (stage3d) stage3d.setCard(`Card ${qIndex + 1} of ${total}`, card.front_text, revealedAnswer || "?");
                fx.glow = "";
                winAnim(true);
                setTimeout(() => {
                    if (disposed) return;
                    if (server.completed) {
                        setTimeout(() => { if (!disposed) finish(); }, fx.anim ? FC_ANIM.death : 0);
                        return;
                    }
                    qIndex = Math.min(server.current_index, total - 1);
                    loadCard();
                    if (server.total_lives <= 0) enterCooldown();
                    else showPreview("next");
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
            qIndex = Math.min(server.current_index, total - 1);
            loadCard();
            showPreview("next");
        }

        // ---- duel animations ----
        function playAnim(name, onImpact, onEnd) {
            fx.anim = { name, dur: FC_ANIM[name], t: 0, startTs: performance.now(), onImpact, onEnd };
            fx.hitDone = false;
        }

        function winAnim(skipped) {
            playAnim("win", () => {
                fx.foeHP = Math.max(0, fx.foeHP - 1);
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
                fx.heroHP = server ? server.total_lives : Math.max(0, fx.heroHP - 1);
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

            if (!stage3d || root.offsetParent === null) return; // hidden: skip the GPU work
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
                fx.heroMax = Math.max(fx.heroMax, play.state.total_lives);
                fx.heroHP = play.state.total_lives;
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
        ui.input.addEventListener("input", updateControls);
        ui.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                submitAnswer();
            }
        });
        ui.checkBtn.addEventListener("click", submitAnswer);
        ui.playSkipBtn.addEventListener("click", skipFromBar);
        ui.nextBtn.addEventListener("click", advance);

        function onKeyDown(e) {
            if (disposed || root.offsetParent === null) return;
            if (e.key !== "Enter") return;
            const target = e.target;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "BUTTON")) return;
            if (mode === "ready") {
                const btn = overlayNode("pvBtn");
                if (btn) { e.preventDefault(); btn.click(); }
            } else if (mode === "review") {
                e.preventDefault();
                advance();
            }
        }

        function onVisibility() {
            if (!document.hidden && server) refreshState();   // timers are throttled in background tabs
        }

        function onResize() {
            if (!disposed && stage3d) stage3d.resize();
        }

        function dispose() {
            if (disposed) return;
            disposed = true;
            cancelAnimationFrame(rafId);
            clearInterval(countdownTimer);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("visibilitychange", onVisibility);
            if (resizeObserver) resizeObserver.disconnect();
            if (stage3d && stage3d.dispose) stage3d.dispose();
            stage3d = null;
        }

        // ---- boot ----
        async function boot() {
            setMode("loading");
            showOverlay(`
                <div class="fc-overlay-card">
                    <i class="fa-solid fa-spinner fa-spin fc-overlay-icon"></i>
                    <p>Shuffling the cards...</p>
                </div>
            `);

            let play;
            try {
                play = await fetchPlay(laId);
            } catch (err) {
                console.error("Error loading Flashcards:", err);
                if (!disposed) showError(err.message);
                return;
            }
            if (disposed) return;

            cards = play.cards || [];
            total = cards.length;
            if (total === 0) {
                dispose();
                onActivityDone();
                return;
            }
            applyState(play.state);
            score = play.state.first_try_correct * 100
                + Math.max(0, play.state.solved_count - play.state.first_try_correct) * 50;

            try {
                const mod = await import(FC_JS_BASE + "flashcards3d.js");
                if (disposed) return;
                // "land" = forest clearing, "water" = inside a wooden ship
                stage3d = mod.createFlashStage(ui.canvas, { terrain: activity.terrain || "land" });
                stage3d.holdIntro();   // cobra waits in the bush / behind the doorway until Start
            } catch (err) {
                console.warn("Card duel stage unavailable, showing the cards only:", err);
                stage3d = null;
                root.classList.add("fc-no-3d");
            }
            if (disposed) return;

            booted = true;
            document.addEventListener("keydown", onKeyDown);
            document.addEventListener("visibilitychange", onVisibility);
            if (resizeObserver) resizeObserver.observe(root);
            countdownTimer = setInterval(tick, 1000);
            rafId = requestAnimationFrame(loop);

            resyncFromState();
        }

        boot();
    }

    window.cobraByteRenderFlashcards = renderFlashcards;
})();