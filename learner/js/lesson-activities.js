/**
 * lesson-activities.js - Learner-side Activities Gate
 * ---------------------------------------------------------------
 * Renders the "Proceed to Activities" gate and the Multiple Choice /
 * Fill in the Blanks / Flashcards activities attached to a lesson, in
 * that order (Multiple Choice first). Multiple Choice is the cobra arena
 * (/api/lesson-activities/mcq/*); Fill in the Blanks and Flashcards use
 * /api/lesson-activities/check-answer until their game versions land.
 * Answer checking always happens server-side - this file never has
 * access to a correct answer before the learner has submitted a guess.
 *
 * Exposes window.cobraByteInitLessonActivities(resourceId, container, onAllDone)
 * for lesson-content.js to call once the lesson's reading content has
 * finished rendering.
 */
(function () {
    "use strict";

    const API_BASE_URL = "http://127.0.0.1:5000";

    // Folder this script was served from - Multiple Choice loads arena3d.js
    // (and three.module.js) from the same folder, only when it opens.
    const LEARNER_JS_BASE = (document.currentScript && document.currentScript.src)
        ? new URL(".", document.currentScript.src).href
        : "";

    function el(tag, className, html) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (html !== undefined) e.innerHTML = html;
        return e;
    }

    async function fetchActivities(resourceId) {
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities?resource_id=${encodeURIComponent(resourceId)}`, {
            credentials: "include"
        });
        if (!response.ok) throw new Error("Request failed");
        const data = await response.json();
        if (!data.success) throw new Error("Unexpected response");
        return data.activities || [];
    }

    async function checkAnswer(payload) {
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities/check-answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload)
        });
        return response.json();
    }

    async function markActivityComplete(laId, score) {
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities/mark-complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ la_id: laId, score: score })
        });
        return response.json();
    }

    // ---------------- Fill in the Blanks ----------------
    function renderFillBlanks(activity, container, onActivityDone) {
        let currentIndex = 0;
        let correctCount = 0;
        const total = activity.items.length;

        function renderItem() {
            container.innerHTML = "";
            const item = activity.items[currentIndex];

            container.appendChild(el("p", "activity-progress-label", `Item ${currentIndex + 1} of ${total}`));
            container.appendChild(el("p", "activity-question-text", item.content));

            const input = el("input", "activity-fillblank-input");
            input.type = "text";
            input.placeholder = "Type your answer...";
            container.appendChild(input);

            const submitBtn = el("button", "activity-next-btn", "Submit");
            submitBtn.type = "button";
            container.appendChild(submitBtn);

            const feedbackBox = el("div", "activity-feedback-box");
            feedbackBox.style.display = "none";
            container.appendChild(feedbackBox);

            submitBtn.addEventListener("click", async () => {
                if (submitBtn.textContent === "Submit") {
                    const result = await checkAnswer({ type: "fill_blank", fib_id: item.fib_id, answer: input.value });
                    input.disabled = true;
                    if (result.is_correct) correctCount += 1;

                    feedbackBox.style.display = "block";
                    feedbackBox.className = "activity-feedback-box " + (result.is_correct ? "is-correct" : "is-incorrect");
                    feedbackBox.textContent = result.is_correct
                        ? (result.feedback || "Correct!")
                        : (result.feedback || `Not quite. Correct answer: ${result.correct_answer}`);

                    submitBtn.textContent = currentIndex === total - 1 ? "Finish" : "Next Item";
                } else {
                    currentIndex += 1;
                    if (currentIndex >= total) {
                        finishActivity();
                    } else {
                        renderItem();
                    }
                }
            });
        }

        function finishActivity() {
            container.innerHTML = "";
            const summary = el("div", "activity-summary");
            summary.innerHTML = `<p>You scored <strong>${correctCount} / ${total}</strong> on "${activity.activity_title}".</p>`;
            container.appendChild(summary);
            markActivityComplete(activity.la_id, correctCount).finally(() => onActivityDone());
        }

        renderItem();
    }

    // ---------------- Flashcards ----------------
    // Type-and-check, not flip-and-click: grading always happens
    // server-side (see /api/lesson-activities/check-answer, type
    // "flashcard") the moment the learner submits a guess. The flip is
    // purely a confirmation reveal AFTER grading, showing the real back
    // side next to what they typed - it never gates the score itself.
    function renderFlashcards(activity, container, onActivityDone) {
        let currentIndex = 0;
        let totalPoints = 0;
        const total = activity.items.length;
        let answered = false;
        let lastResult = null; // { answer, status, correct_answer, feedback }

        function renderCard() {
            answered = false;
            lastResult = null;
            container.innerHTML = "";
            const card = activity.items[currentIndex];

            container.appendChild(el("p", "activity-progress-label", `Card ${currentIndex + 1} of ${total}`));

            const scene = el("div", "flip-card-scene");
            const inner = el("div", "flip-card-inner");
            inner.id = "fcFlipInner";
            const front = el("div", "flip-face front", card.front);
            const back = el("div", "flip-face back");
            back.id = "fcFlipBack";
            inner.appendChild(front);
            inner.appendChild(back);
            scene.appendChild(inner);
            container.appendChild(scene);

            container.appendChild(el("p", "activity-flashcard-hint", "Type what the back of this card says."));
            container.appendChild(el("p", "activity-question-text", "Your answer"));

            const input = el("input", "activity-fillblank-input");
            input.type = "text";
            input.placeholder = "Type your answer...";
            input.id = "fcInput";
            container.appendChild(input);

            const feedbackBox = el("div", "activity-feedback-box");
            feedbackBox.style.display = "none";
            feedbackBox.id = "fcFeedback";
            container.appendChild(feedbackBox);

            const actionBtn = el("button", "activity-next-btn", "Submit");
            actionBtn.type = "button";
            container.appendChild(actionBtn);

            actionBtn.addEventListener("click", async () => {
                if (!answered) {
                    if (!input.value.trim()) { input.focus(); return; }
                    actionBtn.disabled = true;
                    const result = await checkAnswer({
                        type: "flashcard",
                        flashcard_id: card.flashcard_id,
                        answer: input.value
                    });
                    actionBtn.disabled = false;

                    lastResult = {
                        answer: input.value.trim(),
                        status: result.status,
                        correct_answer: result.correct_answer,
                        feedback: result.feedback
                    };
                    totalPoints += (result.points || 0);
                    answered = true;
                    input.disabled = true;

                    // Fill the back face BEFORE flipping, then flip a beat
                    // later so the reveal reads as deliberate.
                    back.className = "flip-face back is-" + lastResult.status;
                    back.innerHTML = `
                        <div class="flip-back-label">${lastResult.status === "correct" ? "Match!" : lastResult.status === "close" ? "Almost — case differs" : "Expected answer"}</div>
                        <div class="flip-back-answer">${lastResult.correct_answer}</div>
                        <div class="flip-back-compare">You typed: <b>"${lastResult.answer}"</b></div>
                    `;

                    feedbackBox.style.display = "block";
                    feedbackBox.className = "activity-feedback-box is-" + (lastResult.status === "incorrect" ? "incorrect" : "correct");
                    feedbackBox.textContent = lastResult.feedback || (
                        lastResult.status === "correct" ? "Correct! Full credit."
                        : lastResult.status === "close" ? "Close — right word, wrong case. Half credit."
                        : `Not quite. Correct answer: ${lastResult.correct_answer}`
                    );

                    setTimeout(() => inner.classList.add("flipped"), 150);
                    actionBtn.textContent = currentIndex === total - 1 ? "Finish" : "Next Card";
                } else {
                    currentIndex += 1;
                    if (currentIndex >= total) {
                        finishActivity();
                    } else {
                        renderCard();
                    }
                }
            });
        }

        function finishActivity() {
            container.innerHTML = "";
            const summary = el("div", "activity-summary");
            const roundedScore = Math.round(totalPoints);
            summary.innerHTML = `<p>You scored <strong>${totalPoints} / ${total}</strong> on "${activity.activity_title}".</p>`;
            container.appendChild(summary);
            markActivityComplete(activity.la_id, roundedScore).finally(() => onActivityDone());
        }

        renderCard();
    }

    // ---------------- Multiple Choice (cobra arena) ----------------
    // Multiple Choice (activity_type_id = 1) is played by steering the
    // cobra into the pellet with the right letter. Questions/options come
    // from mcq_questions_tbl / mcq_options_tbl via /api/lesson-activities
    // (never with the correct answer). Grading, lives, the current
    // question and pause/resume all live on the server:
    //   GET  /mcq/state      POST /mcq/play
    //   POST /mcq/answer     POST /mcq/lose-life
    // Wrong answer -> -1 life + Try Again on the SAME question.
    // 0 lives -> the play pauses where it stopped; lives come back +1
    // every 5 minutes (shared by every Multiple Choice activity).
    const ARENA_COLORS = { A: "#0d9488", B: "#2563eb", C: "#d97706", D: "#7c3aed", E: "#db2777", F: "#475569" };
    const ARENA_DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    const ARENA_KEYMAP = {
        ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
        ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right"
    };
    const ARENA_STEP_MS = 130;

    function arenaColor(letter) {
        return ARENA_COLORS[letter] || "#475569";
    }

    function letterClass(letter) {
        return ARENA_COLORS[letter] ? "is-letter-" + String(letter).toLowerCase() : "is-letter-other";
    }

    function formatClock(totalSeconds) {
        const s = Math.max(0, Math.ceil(totalSeconds));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }

    function heartsHtml(lives, max) {
        let html = "";
        for (let i = 0; i < max; i++) {
            html += `<i class="${i < lives ? "fa-solid" : "fa-regular"} fa-heart"></i>`;
        }
        return html;
    }

    async function mcqRequest(path, laId, extra) {
        const isGet = path === "state";
        const url = isGet
            ? `${API_BASE_URL}/api/lesson-activities/mcq/state?la_id=${encodeURIComponent(laId)}`
            : `${API_BASE_URL}/api/lesson-activities/mcq/${path}`;
        const response = await fetch(url, isGet ? { credentials: "include" } : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(Object.assign({ la_id: laId }, extra || {}))
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Request failed");
        return data;
    }

    function renderMCQ(activity, container, onActivityDone) {
        const questions = activity.items || [];
        const total = questions.length;
        if (total === 0) {
            onActivityDone();
            return;
        }

        container.innerHTML = "";
        const root = el("div", "mcq-arena-root");
        root.innerHTML = `
            <header class="mcq-arena-topbar">
                <div class="mcq-arena-brand">
                    <span class="mcq-arena-brand-icon"><i class="fa-solid fa-list-check"></i></span>
                    <div>
                        <span class="mcq-arena-brand-eyebrow">Activity · Multiple Choice</span>
                        <h3 class="mcq-arena-brand-title" data-ui="title"></h3>
                    </div>
                </div>
                <div class="mcq-arena-stats">
                    <div class="mcq-arena-stat is-score" data-ui="scoreStat"><b data-ui="score">0</b><i>Score</i></div>
                    <div class="mcq-arena-stat"><b data-ui="progress">1/${total}</b><i>Question</i></div>
                    <div class="mcq-arena-stat"><b data-ui="streak">0</b><i>Streak</i></div>
                    <div class="mcq-arena-stat is-lives" data-ui="livesStat"><b data-ui="lives"></b><i data-ui="livesLabel">Lives</i></div>
                </div>
            </header>
            <section class="mcq-arena-qcard">
                <div class="mcq-arena-qleft">
                    <div class="mcq-arena-qmeta" data-ui="qmeta"></div>
                    <p class="mcq-arena-qtext" data-ui="qtext"></p>
                </div>
                <div class="mcq-arena-choices" data-ui="choices"></div>
            </section>
            <div class="activity-feedback-box" data-ui="fallbackFeedback" hidden></div>
            <div class="mcq-arena-stage" data-ui="arena">
                <canvas class="mcq-arena-canvas" data-ui="canvas"></canvas>
                <div class="mcq-arena-flash" data-ui="flash"></div>
                <div class="mcq-arena-overlay" data-ui="overlay" hidden></div>
            </div>
            <div class="mcq-arena-toolbar">
                <p class="mcq-arena-hint" data-ui="hint">Eat the pellet carrying the <b>correct letter</b>. A wrong letter, hitting a wall, or biting yourself costs a life. Lives refill one every 5 minutes.</p>
                <button type="button" class="mcq-arena-ghost-btn" data-ui="pauseBtn"><i class="fa-solid fa-pause"></i> <span>Pause</span></button>
            </div>
            <div class="mcq-arena-dpad" data-ui="dpad">
                <button type="button" class="mcq-arena-dpad-up" data-dir="up" aria-label="Up"><i class="fa-solid fa-arrow-up"></i></button>
                <button type="button" class="mcq-arena-dpad-left" data-dir="left" aria-label="Left"><i class="fa-solid fa-arrow-left"></i></button>
                <button type="button" class="mcq-arena-dpad-down" data-dir="down" aria-label="Down"><i class="fa-solid fa-arrow-down"></i></button>
                <button type="button" class="mcq-arena-dpad-right" data-dir="right" aria-label="Right"><i class="fa-solid fa-arrow-right"></i></button>
            </div>
        `;
        container.appendChild(root);

        const ui = {};
        root.querySelectorAll("[data-ui]").forEach((node) => { ui[node.dataset.ui] = node; });
        ui.title.textContent = activity.activity_title;

        // ---- state ----
        let server = null;          // last state the server sent
        let mode = "loading";       // loading | ready | playing | paused | busy | tryagain | outoflives | done | error
        let booted = false;
        let disposed = false;
        let fallback = false;       // no WebGL -> tap the answer chips instead
        let arena = null;
        let qIndex = 0;
        let triedIds = new Set();   // wrong options already tried on this question
        let streak = 0, bestStreak = 0;
        let COLS = 40, ROWS = 15;
        let snake = [], prevSnake = [], pellets = [];
        let dir = { x: 1, y: 0 }, nextDir = { x: 1, y: 0 };
        let acc = 0, last = 0, shake = 0;
        let rafId = null, countdownTimer = null, flashTimer = null;
        let refreshing = false;
        const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;

        // ---- HUD ----
        function setMode(next) {
            mode = next;
            root.dataset.mode = next;
            ui.pauseBtn.innerHTML = next === "paused"
                ? '<i class="fa-solid fa-play"></i> <span>Resume</span>'
                : '<i class="fa-solid fa-pause"></i> <span>Pause</span>';
            ui.pauseBtn.disabled = !(next === "playing" || next === "paused");
        }

        function applyState(state) {
            server = state;
            updateHUD();
        }

        function updateHUD() {
            ui.score.textContent = server ? server.score : 0;
            ui.progress.textContent = `${Math.min(qIndex + 1, total)}/${total}`;
            ui.streak.textContent = streak;
            const lives = server ? server.lives : 3;
            const max = server ? server.max_lives : 3;
            ui.lives.innerHTML = heartsHtml(lives, max);
            ui.livesLabel.textContent = (server && lives < max && server.seconds_to_next_life > 0)
                ? `Lives · ${formatClock(server.seconds_to_next_life)}`
                : "Lives";
        }

        function bump(node) {
            node.classList.remove("bump");
            void node.offsetWidth;
            node.classList.add("bump");
        }

        function flash(message, ok) {
            clearTimeout(flashTimer);
            if (fallback) {
                ui.fallbackFeedback.hidden = false;
                ui.fallbackFeedback.className = "activity-feedback-box " + (ok ? "is-correct" : "is-incorrect");
                ui.fallbackFeedback.textContent = message;
                return;
            }
            ui.flash.textContent = message;
            ui.flash.className = "mcq-arena-flash show " + (ok ? "is-ok" : "is-no");
            flashTimer = setTimeout(() => { ui.flash.className = "mcq-arena-flash"; }, 1600);
        }

        // ---- overlays (only static markup goes through innerHTML; learner/DB text uses textContent) ----
        function showOverlay(html) {
            ui.overlay.innerHTML = html;
            ui.overlay.hidden = false;
            if (fallback) ui.arena.hidden = false;
        }

        function hideOverlay() {
            ui.overlay.hidden = true;
            ui.overlay.innerHTML = "";
            if (fallback) ui.arena.hidden = true;
        }

        function overlayNode(name) {
            return ui.overlay.querySelector(`[data-ui="${name}"]`);
        }

        function showReady(kind) {
            setMode("ready");
            const copy = {
                start: { icon: "fa-gamepad", title: "Feed the cobra the right answer", btn: "Start activity" },
                continue: { icon: "fa-gamepad", title: "Pick up where you left off", btn: "Continue" },
                resume: { icon: "fa-heart", title: "You have a life again", btn: "Resume activity" }
            }[kind];
            const body = kind === "resume"
                ? `Your activity was paused at question ${qIndex + 1}. It continues from exactly there.`
                : "Steer the cobra into the letter that answers the question. A wrong letter, a wall, or biting yourself costs a life.";
            showOverlay(`
                <div class="mcq-arena-overlay-card">
                    <i class="fa-solid ${copy.icon} mcq-arena-overlay-icon"></i>
                    <h4>${copy.title}</h4>
                    <p>${body}</p>
                    ${fallback ? "" : '<div class="mcq-arena-keys"><kbd>W A S D</kbd><kbd>Arrow keys</kbd><kbd>Space = pause</kbd></div>'}
                    <div class="mcq-arena-overlay-actions">
                        <button type="button" class="mcq-arena-primary-btn" data-ui="playBtn">${copy.btn}</button>
                    </div>
                </div>
            `);
            overlayNode("playBtn").addEventListener("click", beginPlay);
        }

        function pause() {
            if (mode !== "playing" || fallback) return;
            setMode("paused");
            showOverlay(`
                <div class="mcq-arena-overlay-card">
                    <i class="fa-solid fa-pause mcq-arena-overlay-icon"></i>
                    <h4>Paused</h4>
                    <p>Take a breath. Your progress is saved.</p>
                    <div class="mcq-arena-overlay-actions">
                        <button type="button" class="mcq-arena-primary-btn" data-ui="resumeBtn">Resume</button>
                    </div>
                </div>
            `);
            overlayNode("resumeBtn").addEventListener("click", resumePlay);
        }

        function resumePlay() {
            if (disposed) return;
            hideOverlay();
            acc = 0;
            last = performance.now();
            setMode("playing");
        }

        function showTryAgain(option, feedback) {
            setMode("tryagain");
            const lives = server ? server.lives : 0;
            showOverlay(`
                <div class="mcq-arena-overlay-card">
                    <i class="fa-solid fa-circle-xmark mcq-arena-overlay-icon is-danger"></i>
                    <h4>Try Again</h4>
                    <p class="mcq-arena-feedback" data-ui="tryFeedback"></p>
                    <p class="mcq-arena-subnote">You lost 1 life · ${lives} ${lives === 1 ? "life" : "lives"} left. You're still on question ${qIndex + 1}.</p>
                    <div class="mcq-arena-overlay-actions">
                        <button type="button" class="mcq-arena-primary-btn" data-ui="tryBtn"><i class="fa-solid fa-rotate-right"></i> Try Again</button>
                    </div>
                </div>
            `);
            overlayNode("tryFeedback").textContent = feedback || `${option.option_letter} isn't the right answer.`;
            overlayNode("tryBtn").addEventListener("click", () => {
                if (disposed) return;
                startQuestion();
                if (fallback) {
                    hideOverlay();
                    setMode("playing");
                    return;
                }
                resumePlay();
            });
        }

        function showOutOfLives() {
            setMode("outoflives");
            const max = server ? server.max_lives : 3;
            showOverlay(`
                <div class="mcq-arena-overlay-card is-wide">
                    <div class="mcq-arena-overlay-hearts" data-ui="outHearts">${heartsHtml(0, max)}</div>
                    <h4 data-ui="outTitle">You're out of lives.</h4>
                    <p>While waiting for at least 1 life to become available, you can review the current lesson or previous lessons. Your activity progress is paused and will continue from where you stopped once you have at least 1 life.</p>
                    <p class="mcq-arena-subnote" data-ui="outWhere"></p>
                    <div class="mcq-arena-countdown-row" data-ui="outCountdownRow">
                        <span>Next life in</span>
                        <b class="mcq-arena-countdown" data-ui="countdown">${formatClock(server ? server.seconds_to_next_life : 0)}</b>
                    </div>
                    <div class="mcq-arena-overlay-actions">
                        <button type="button" class="mcq-arena-ghost-btn" data-ui="reviewBtn"><i class="fa-solid fa-book-open"></i> Review this lesson</button>
                        <button type="button" class="mcq-arena-ghost-btn" data-ui="lessonsBtn"><i class="fa-solid fa-layer-group"></i> Back to lessons</button>
                        <button type="button" class="mcq-arena-primary-btn" data-ui="outResumeBtn" disabled><i class="fa-solid fa-play"></i> Resume activity</button>
                    </div>
                </div>
            `);
            overlayNode("outWhere").textContent = `Paused at question ${qIndex + 1} of ${total}.`;
            overlayNode("reviewBtn").addEventListener("click", () => {
                document.dispatchEvent(new CustomEvent("cobrabyte:review-lesson"));
            });
            overlayNode("lessonsBtn").addEventListener("click", () => {
                const link = document.getElementById("backToLessonsLink");
                if (link && link.getAttribute("href") && link.getAttribute("href") !== "#") {
                    window.location.href = link.href;
                } else {
                    window.location.href = "/lessons";
                }
            });
            overlayNode("outResumeBtn").addEventListener("click", beginPlay);
            syncOutOfLives();
        }

        // Unlocks Resume in place once the server reports at least 1 life.
        function syncOutOfLives() {
            if (mode !== "outoflives" || !server) return;
            const hasLife = server.lives > 0;
            const hearts = overlayNode("outHearts");
            const title = overlayNode("outTitle");
            const row = overlayNode("outCountdownRow");
            const btn = overlayNode("outResumeBtn");
            if (hearts) hearts.innerHTML = heartsHtml(server.lives, server.max_lives);
            if (title) title.textContent = hasLife ? "A life is back!" : "You're out of lives.";
            if (row) row.hidden = hasLife;
            if (btn) btn.disabled = !hasLife;
        }

        function finish() {
            setMode("done");
            const score = server ? server.score : 0;
            showOverlay(`
                <div class="mcq-arena-overlay-card">
                    <i class="fa-solid fa-trophy mcq-arena-overlay-icon"></i>
                    <h4>Activity complete</h4>
                    <div class="mcq-arena-results">
                        <div><b>${score}/${total}</b><span>Score</span></div>
                        <div><b>${bestStreak}</b><span>Best streak</span></div>
                        <div><b>${total}</b><span>Questions</span></div>
                    </div>
                    <p class="mcq-arena-subnote">Saved to your progress: ${score}/${total} answered right on the first try.</p>
                    <div class="mcq-arena-overlay-actions">
                        <button type="button" class="mcq-arena-primary-btn" data-ui="continueBtn">Continue</button>
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
                <div class="mcq-arena-overlay-card">
                    <i class="fa-solid fa-triangle-exclamation mcq-arena-overlay-icon is-warn"></i>
                    <h4>Something went wrong</h4>
                    <p data-ui="errorText"></p>
                    <div class="mcq-arena-overlay-actions">
                        <button type="button" class="mcq-arena-primary-btn" data-ui="retryBtn">Reload activity</button>
                    </div>
                </div>
            `);
            overlayNode("errorText").textContent = message || "Could not reach the server. Your progress is saved.";
            overlayNode("retryBtn").addEventListener("click", async () => {
                if (!booted) { boot(); return; }
                try {
                    applyState((await mcqRequest("state", activity.la_id)).state);
                } catch (err) {
                    return;
                }
                if (!disposed) resyncFromState();
            });
        }

        // ---- question + board ----
        function renderQuestion() {
            const q = questions[qIndex];
            ui.qmeta.textContent = `Question ${qIndex + 1} of ${total}`;
            ui.qtext.textContent = q.question_text;
            ui.choices.innerHTML = "";
            ui.fallbackFeedback.hidden = true;
            (q.options || []).forEach((opt) => {
                const btn = el("button", "mcq-arena-choice");
                btn.type = "button";
                btn.tabIndex = fallback ? 0 : -1;
                btn.dataset.optionId = opt.option_id;
                if (triedIds.has(opt.option_id)) btn.classList.add("is-wrong");
                const keyBadge = el("span", "mcq-arena-key " + letterClass(opt.option_letter));
                keyBadge.textContent = opt.option_letter;
                const label = el("span", "mcq-arena-choice-text");
                label.textContent = opt.text;
                btn.appendChild(keyBadge);
                btn.appendChild(label);
                btn.addEventListener("click", () => {
                    if (fallback && mode === "playing") submitAnswer(opt);
                });
                ui.choices.appendChild(btn);
            });
        }

        function spawnSnake() {
            const startX = Math.min(6, COLS - 4), startY = Math.floor(ROWS / 2);
            snake = [];
            for (let s = 0; s < 5; s++) snake.push({ x: startX - s, y: startY });
            prevSnake = snake.map((p) => ({ ...p }));
            dir = { x: 1, y: 0 };
            nextDir = { x: 1, y: 0 };
            acc = 0;
        }

        function spawnPellets() {
            const q = questions[qIndex];
            pellets = [];
            const taken = new Set(snake.map((p) => p.x + "," + p.y));
            const minX = Math.min(10, COLS - 6);
            (q.options || []).forEach((opt) => {
                let x, y, guard = 0;
                do {
                    x = minX + Math.floor(Math.random() * Math.max(1, COLS - minX - 2));
                    y = 1 + Math.floor(Math.random() * (ROWS - 2));
                    guard++;
                } while (taken.has(x + "," + y) && guard < 500);
                taken.add(x + "," + y);
                pellets.push({ x, y, letter: opt.option_letter, option: opt });
            });
        }

        function keepPelletsClear() {
            const startX = Math.min(6, COLS - 4), startY = Math.floor(ROWS / 2);
            const minX = Math.min(10, COLS - 6);
            pellets.forEach((p) => {
                let guard = 0;
                while (p.y === startY && p.x < startX + 4 && guard++ < 50) {
                    p.x = minX + Math.floor(Math.random() * 4);
                    p.y = 1 + Math.floor(Math.random() * (ROWS - 2));
                }
            });
        }

        // Fresh board for the CURRENT question (also used for Try Again).
        function startQuestion() {
            spawnSnake();
            spawnPellets();
            renderQuestion();
            updateHUD();
        }

        function goToServerQuestion() {
            const next = Math.min(server.current_index, total - 1);
            if (next !== qIndex) triedIds = new Set();
            qIndex = next;
            startQuestion();
        }

        function resyncFromState() {
            if (server.completed) {
                finish();
                return;
            }
            goToServerQuestion();
            if (server.lives <= 0) showOutOfLives();
            else if (server.session_status === "paused") showReady("resume");
            else if (server.session_status === "in_progress") showReady("continue");
            else showReady("start");
        }

        // Start the ONE play, or continue/resume that same play.
        async function beginPlay() {
            if (disposed || mode === "busy") return;
            setMode("busy");
            let data = null;
            try {
                data = await mcqRequest("play", activity.la_id);
            } catch (err) {
                if (!disposed) showError(err.message);
                return;
            }
            if (disposed) return;
            applyState(data.state);
            if (server.completed || server.session_status !== "in_progress") {
                resyncFromState();
                return;
            }
            goToServerQuestion();
            if (fallback) {
                hideOverlay();
                setMode("playing");
                return;
            }
            resumePlay();
        }

        // ---- answering ----
        async function submitAnswer(option) {
            if (mode !== "playing") return;
            setMode("busy");
            const q = questions[qIndex];

            let result = null;
            try {
                result = await mcqRequest("answer", activity.la_id, { q_id: q.q_id, option_id: option.option_id });
            } catch (err) {
                if (!disposed) showError(err.message);
                return;
            }
            if (disposed) return;

            applyState(result.state);
            if (!result.graded) {
                // Out of lives, paused, or on a different question than the server - resync.
                resyncFromState();
                return;
            }

            const chip = ui.choices.querySelector(`.mcq-arena-choice[data-option-id="${option.option_id}"]`);
            if (result.is_correct) {
                streak += 1;
                bestStreak = Math.max(bestStreak, streak);
                if (chip) chip.classList.add("is-right");
                bump(ui.scoreStat);
                flash(result.feedback || `Correct: ${option.option_letter}. ${option.text}`, true);
                setTimeout(() => { if (!disposed) advance(); }, fallback ? 1600 : 1100);
                return;
            }

            streak = 0;
            shake = 12;
            triedIds.add(option.option_id);
            if (chip) chip.classList.add("is-wrong");
            bump(ui.livesStat);
            updateHUD();
            if (server.lives <= 0) {
                flash(result.feedback || `${option.option_letter} isn't the right answer.`, false);
                setTimeout(() => { if (!disposed) showOutOfLives(); }, 900);
                return;
            }
            showTryAgain(option, result.feedback);
        }

        function advance() {
            if (server.completed) {
                finish();
                return;
            }
            goToServerQuestion();
            if (fallback) {
                setMode("playing");
                return;
            }
            resumePlay();
        }

        async function handleCollision(reason) {
            setMode("busy");
            shake = 16;
            streak = 0;
            bump(ui.livesStat);

            let data = null;
            try {
                data = await mcqRequest("lose-life", activity.la_id);
            } catch (err) {
                if (!disposed) showError(err.message);
                return;
            }
            if (disposed) return;

            applyState(data.state);
            flash(server.lives > 0
                ? `${reason}. ${server.lives} ${server.lives === 1 ? "life" : "lives"} left.`
                : `${reason}. You're out of lives.`, false);
            spawnSnake();
            keepPelletsClear();
            updateHUD();
            setTimeout(() => {
                if (disposed) return;
                if (server.lives <= 0) showOutOfLives();
                else resumePlay();
            }, 900);
        }

        // ---- game loop ----
        function setDir(name) {
            const d = ARENA_DIRS[name];
            if (!d || (d.x === -dir.x && d.y === -dir.y)) return;
            nextDir = d;
        }

        function steer(name) {
            if (fallback) return false;
            if (mode === "playing") { setDir(name); return true; }
            if (mode === "paused") { setDir(name); resumePlay(); return true; }
            return false;
        }

        function step() {
            prevSnake = snake.map((p) => ({ ...p }));
            dir = nextDir;
            const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

            if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) {
                handleCollision("You hit the wall");
                return;
            }
            if (snake.some((s, i) => i < snake.length - 1 && s.x === head.x && s.y === head.y)) {
                handleCollision("The cobra bit itself");
                return;
            }

            snake.unshift(head);
            const hit = pellets.findIndex((p) => p.x === head.x && p.y === head.y);
            if (hit === -1) {
                snake.pop();
                return;
            }
            const pellet = pellets[hit];
            if (arena) arena.burst(pellet.x, pellet.y, arenaColor(pellet.letter));
            pellets.splice(hit, 1);
            submitAnswer(pellet.option);
        }

        function draw(alpha, dtSeconds) {
            if (!arena || snake.length === 0) return;
            const pts = snake.map((cur, i) => {
                const prev = prevSnake[Math.min(i, prevSnake.length - 1)] || cur;
                return { x: prev.x + (cur.x - prev.x) * alpha, y: prev.y + (cur.y - prev.y) * alpha };
            });
            const head = pts[0];
            const neck = pts[1] || { x: head.x - 1, y: head.y };
            arena.render({
                segs: pts,
                headAngle: Math.atan2(head.y - neck.y, head.x - neck.x),
                pellets: pellets.map((p) => ({ x: p.x, y: p.y, letter: p.letter, color: arenaColor(p.letter) })),
                shake: shake * 0.05,
                dt: dtSeconds,
                dead: mode === "outoflives"
            });
        }

        function loop(ts) {
            if (disposed) return;
            if (!root.isConnected) {
                dispose();
                return;
            }
            const visible = root.offsetParent !== null;
            if (!visible && mode === "playing") pause();

            const dtMs = last ? Math.min(Math.max(ts - last, 0), 100) : 16;
            last = ts;
            if (mode === "playing") {
                acc += dtMs;
                while (acc >= ARENA_STEP_MS && mode === "playing") {
                    step();
                    acc -= ARENA_STEP_MS;
                }
            }
            if (shake > 0) shake = Math.max(0, shake - dtMs * 0.05);
            if (visible) draw(mode === "playing" ? Math.min(1, acc / ARENA_STEP_MS) : 1, dtMs / 1000);
            rafId = requestAnimationFrame(loop);
        }

        // ---- lives countdown (server stays the source of truth) ----
        function tick() {
            if (disposed) return;
            if (!root.isConnected) {
                dispose();
                return;
            }
            if (!server || server.completed || server.lives >= server.max_lives) return;
            server.seconds_to_next_life -= 1;
            if (server.seconds_to_next_life <= 0) {
                refreshState();
                return;
            }
            updateHUD();
            const countdown = overlayNode("countdown");
            if (countdown) countdown.textContent = formatClock(server.seconds_to_next_life);
        }

        async function refreshState() {
            if (refreshing) return;
            refreshing = true;
            try {
                const data = await mcqRequest("state", activity.la_id);
                if (disposed) return;
                applyState(data.state);
                syncOutOfLives();
            } catch (err) {
                if (server) server.seconds_to_next_life = 5; // retry shortly
            } finally {
                refreshing = false;
            }
        }

        // ---- input + lifecycle ----
        function onKeyDown(e) {
            if (disposed || fallback || root.offsetParent === null) return;
            const target = e.target;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

            const name = ARENA_KEYMAP[e.code];
            if (name) {
                if (steer(name)) e.preventDefault();
                return;
            }
            if (e.code === "Space" && (mode === "playing" || mode === "paused")) {
                e.preventDefault();
                if (mode === "playing") pause();
                else resumePlay();
            }
        }

        function onVisibility() {
            if (document.hidden) {
                pause();
            } else if (server && server.lives < server.max_lives) {
                refreshState(); // timers are throttled in background tabs
            }
        }

        function computeLayout() {
            const width = root.clientWidth;
            if (!width) return false;
            const narrow = width < 700;
            root.classList.toggle("is-narrow", narrow);
            const cols = narrow ? 20 : 40;
            const rows = narrow ? 22 : 15;
            if (cols === COLS && rows === ROWS) return false;
            COLS = cols;
            ROWS = rows;
            if (arena) arena.setGrid(COLS, ROWS);
            return true;
        }

        function onResize() {
            if (disposed || fallback) return;
            const gridChanged = computeLayout();
            if (arena) arena.resize();
            if (gridChanged && ["ready", "playing", "paused", "tryagain", "outoflives"].includes(mode)) {
                startQuestion(); // re-place the board for the new grid, same question
            }
        }

        function dispose() {
            if (disposed) return;
            disposed = true;
            cancelAnimationFrame(rafId);
            clearInterval(countdownTimer);
            clearTimeout(flashTimer);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("visibilitychange", onVisibility);
            if (resizeObserver) resizeObserver.disconnect();
            if (arena && arena.dispose) arena.dispose();
            arena = null;
        }

        ui.pauseBtn.addEventListener("click", () => {
            if (mode === "playing") pause();
            else if (mode === "paused") resumePlay();
        });

        ui.dpad.querySelectorAll("button[data-dir]").forEach((btn) => {
            btn.addEventListener("click", () => steer(btn.dataset.dir));
        });

        let touchStart = null;
        ui.canvas.addEventListener("touchstart", (e) => { touchStart = e.touches[0]; }, { passive: true });
        ui.canvas.addEventListener("touchend", (e) => {
            if (!touchStart) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - touchStart.clientX;
            const dy = t.clientY - touchStart.clientY;
            touchStart = null;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
            steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
        }, { passive: true });

        // ---- boot ----
        async function boot() {
            setMode("loading");
            showOverlay(`
                <div class="mcq-arena-overlay-card">
                    <i class="fa-solid fa-spinner fa-spin mcq-arena-overlay-icon"></i>
                    <p>Loading activity...</p>
                </div>
            `);

            let data;
            try {
                data = await mcqRequest("state", activity.la_id);
            } catch (err) {
                console.error("Error loading Multiple Choice state:", err);
                if (!disposed) showError("Could not load this activity.");
                return;
            }
            if (disposed) return;
            applyState(data.state);

            computeLayout();
            try {
                const mod = await import(LEARNER_JS_BASE + "arena3d.js");
                if (disposed) return;
                arena = mod.createArena(ui.canvas);
                arena.setGrid(COLS, ROWS);
            } catch (err) {
                console.warn("Arena unavailable, switching to tap-to-answer:", err);
                fallback = true;
                arena = null;
                root.classList.add("is-fallback");
                ui.hint.textContent = "Tap the answer you think is right. A wrong answer costs a life. Lives refill one every 5 minutes.";
                hideOverlay();
            }
            if (disposed) return;

            booted = true;
            document.addEventListener("keydown", onKeyDown);
            document.addEventListener("visibilitychange", onVisibility);
            if (resizeObserver) resizeObserver.observe(root);
            countdownTimer = setInterval(tick, 1000);
            if (!fallback) rafId = requestAnimationFrame(loop);

            resyncFromState();
        }

        boot();
    }

    function renderActivity(activity, container, onActivityDone) {
        if (activity.completed) {
            container.innerHTML = "";
            const already = el("div", "activity-summary");
            already.innerHTML = `<p><i class="fa-solid fa-circle-check"></i> You already completed "${activity.activity_title}".</p>`;
            container.appendChild(already);

            const continueBtn = el("button", "activity-next-btn", "Continue");
            continueBtn.type = "button";
            continueBtn.style.display = "block";
            continueBtn.style.margin = "0 auto";
            continueBtn.addEventListener("click", () => onActivityDone());
            container.appendChild(continueBtn);
            return;
        }

        if (activity.activity_type === "Multiple Choice") {
            renderMCQ(activity, container, onActivityDone);
        } else if (activity.activity_type === "Fill in the Blanks") {
            renderFillBlanks(activity, container, onActivityDone);
        } else if (activity.activity_type === "Flashcards") {
            renderFlashcards(activity, container, onActivityDone);
        } else {
            onActivityDone();
        }
    }

    async function initLessonActivities(resourceId, rootContainer, onAllDone) {
        let activities = [];
        try {
            activities = await fetchActivities(resourceId);
        } catch (err) {
            console.error("Error loading activities:", err);
        }

        if (activities.length === 0) {
            rootContainer.style.display = "none";
            onAllDone();
            return;
        }

        rootContainer.style.display = "block";
        rootContainer.innerHTML = "";

        const gate = el("div", "activities-gate");
        gate.innerHTML = `
            <h3><i class="fa-solid fa-list-check"></i> Activities</h3>
            <p>Complete the activities below to finish this lesson.</p>
            <button type="button" class="activities-proceed-btn">Proceed to Activities</button>
        `;
        rootContainer.appendChild(gate);

        const activityHost = el("div", "activity-host");
        activityHost.style.display = "none";
        rootContainer.appendChild(activityHost);

        gate.querySelector(".activities-proceed-btn").addEventListener("click", () => {
            gate.style.display = "none";
            activityHost.style.display = "block";
            runNext(0);
        });

        function runNext(index) {
            if (index >= activities.length) {
                activityHost.innerHTML = `<div class="activity-summary"><p><i class="fa-solid fa-circle-check"></i> All activities completed!</p></div>`;
                onAllDone();
                return;
            }
            const activity = activities[index];
            const section = el("div", "activity-section");
            activityHost.innerHTML = "";
            activityHost.appendChild(section);
            renderActivity(activity, section, () => runNext(index + 1));
        }
    }

    window.cobraByteInitLessonActivities = initLessonActivities;
})();