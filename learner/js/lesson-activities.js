/**
 * lesson-activities.js - Learner-side Activities Gate
 * ---------------------------------------------------------------
 * Renders the "Proceed to Activities" gate and the Multiple Choice /
 * Fill in the Blanks / Flashcards activities attached to a lesson.
 * Answer checking always happens server-side (see
 * /api/lesson-activities/check-answer) - this file never has access
 * to a correct answer before the learner has actually submitted a
 * guess.
 *
 * Exposes window.cobraByteInitLessonActivities(resourceId, container, onAllDone)
 * for lesson-content.js to call once the lesson's reading content has
 * finished rendering.
 */
(function () {
    "use strict";

    const API_BASE_URL = "http://127.0.0.1:5000";

    // Folder this script was served from - the Quiz loads arena3d.js
    // (and three.module.js) from the same folder, only when a Quiz opens.
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

    // ---------------- Multiple Choice ----------------
    function renderMCQ(activity, container, onActivityDone) {
        let currentIndex = 0;
        let correctCount = 0;
        const total = activity.items.length;

        function renderQuestion() {
            container.innerHTML = "";
            const q = activity.items[currentIndex];

            container.appendChild(el("p", "activity-progress-label", `Question ${currentIndex + 1} of ${total}`));
            container.appendChild(el("h4", "activity-question-text", q.question_text));

            const optionsWrap = el("div", "activity-options-list");
            q.options.forEach((opt) => {
                const optBtn = el("button", "activity-option-btn", opt.text);
                optBtn.type = "button";
                optBtn.dataset.optionId = opt.option_id;
                optBtn.addEventListener("click", () => handleSelect(opt.option_id, optBtn, optionsWrap));
                optionsWrap.appendChild(optBtn);
            });
            container.appendChild(optionsWrap);

            const feedbackBox = el("div", "activity-feedback-box");
            feedbackBox.style.display = "none";
            container.appendChild(feedbackBox);

            const nextBtn = el("button", "activity-next-btn", currentIndex === total - 1 ? "Finish" : "Next Question");
            nextBtn.type = "button";
            nextBtn.style.display = "none";
            nextBtn.addEventListener("click", () => {
                currentIndex += 1;
                if (currentIndex >= total) {
                    finishActivity();
                } else {
                    renderQuestion();
                }
            });
            container.appendChild(nextBtn);

            async function handleSelect(optionId, btnEl, wrapEl) {
                wrapEl.querySelectorAll(".activity-option-btn").forEach((b) => (b.disabled = true));
                btnEl.classList.add("selected");

                const result = await checkAnswer({ type: "mcq", q_id: q.q_id, option_id: optionId });

                wrapEl.querySelectorAll(".activity-option-btn").forEach((b) => {
                    if (Number(b.dataset.optionId) === result.correct_option_id) {
                        b.classList.add("correct");
                    }
                });
                if (!result.is_correct) btnEl.classList.add("incorrect");
                if (result.is_correct) correctCount += 1;

                feedbackBox.style.display = "block";
                feedbackBox.className = "activity-feedback-box " + (result.is_correct ? "is-correct" : "is-incorrect");
                feedbackBox.textContent = result.feedback || (result.is_correct ? "Correct!" : "Not quite - review and continue.");

                nextBtn.style.display = "inline-flex";
            }
        }

        function finishActivity() {
            container.innerHTML = "";
            const summary = el("div", "activity-summary");
            summary.innerHTML = `<p>You scored <strong>${correctCount} / ${total}</strong> on "${activity.activity_title}".</p>`;
            container.appendChild(summary);
            markActivityComplete(activity.la_id, correctCount).finally(() => onActivityDone());
        }

        renderQuestion();
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

    // ---------------- Quiz (cobra arena) ----------------
    // Learners answer by steering the cobra into the pellet with the
    // right letter. Grading, lives, the 5-minute life regeneration and
    // the current question all live on the server
    // (/quiz-state, /check-answer type "quiz", /quiz-lose-life) - this
    // code only holds question text and option ids, never the correct
    // answer, and a refresh can't restore lives or skip a question.
    const QUIZ_COLORS = { A: "#0d9488", B: "#2563eb", C: "#d97706", D: "#7c3aed", E: "#db2777", F: "#475569" };
    const QUIZ_DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    const QUIZ_KEYMAP = {
        ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
        ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right"
    };
    const QUIZ_STEP_MS = 130;

    function quizColor(letter) {
        return QUIZ_COLORS[letter] || "#475569";
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

    async function fetchQuizState(laId) {
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities/quiz-state?la_id=${encodeURIComponent(laId)}`, {
            credentials: "include"
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Request failed");
        return data.state;
    }

    async function postQuizLoseLife(laId) {
        const response = await fetch(`${API_BASE_URL}/api/lesson-activities/quiz-lose-life`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ la_id: laId })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Request failed");
        return data.state;
    }

    function renderQuiz(activity, container, onActivityDone) {
        const questions = activity.items || [];
        const total = questions.length;
        if (total === 0) {
            onActivityDone();
            return;
        }

        container.innerHTML = "";
        const root = el("div", "quiz-root");
        root.innerHTML = `
            <header class="quiz-topbar">
                <div class="quiz-brand">
                    <span class="quiz-brand-icon"><i class="fa-solid fa-gamepad"></i></span>
                    <div>
                        <span class="quiz-brand-eyebrow">Activity · Quiz</span>
                        <h3 class="quiz-brand-title" data-q="title"></h3>
                    </div>
                </div>
                <div class="quiz-stats">
                    <div class="quiz-stat is-score" data-q="scoreStat"><b data-q="score">0</b><i>Score</i></div>
                    <div class="quiz-stat"><b data-q="progress">1/${total}</b><i>Question</i></div>
                    <div class="quiz-stat"><b data-q="streak">0</b><i>Streak</i></div>
                    <div class="quiz-stat is-lives" data-q="livesStat"><b data-q="lives"></b><i data-q="livesLabel">Lives</i></div>
                </div>
            </header>
            <section class="quiz-qcard">
                <div class="quiz-qleft">
                    <div class="quiz-qmeta" data-q="qmeta"></div>
                    <p class="quiz-qtext" data-q="qtext"></p>
                </div>
                <div class="quiz-choices" data-q="choices"></div>
            </section>
            <div class="activity-feedback-box" data-q="fallbackFeedback" style="display: none;"></div>
            <div class="quiz-arena" data-q="arena">
                <canvas class="quiz-canvas" data-q="canvas"></canvas>
                <div class="quiz-flash" data-q="flash"></div>
                <div class="quiz-overlay" data-q="overlay" hidden></div>
            </div>
            <div class="quiz-toolbar">
                <p class="quiz-hint" data-q="hint">Eat the pellet carrying the <b>correct letter</b>. A wrong letter, hitting a wall, or biting yourself costs a life. Lives refill one every 5 minutes.</p>
                <button type="button" class="quiz-ghost-btn" data-q="pauseBtn"><i class="fa-solid fa-pause"></i> <span>Pause</span></button>
            </div>
            <div class="quiz-dpad" data-q="dpad">
                <button type="button" class="quiz-dpad-up" data-dir="up" aria-label="Up"><i class="fa-solid fa-arrow-up"></i></button>
                <button type="button" class="quiz-dpad-left" data-dir="left" aria-label="Left"><i class="fa-solid fa-arrow-left"></i></button>
                <button type="button" class="quiz-dpad-down" data-dir="down" aria-label="Down"><i class="fa-solid fa-arrow-down"></i></button>
                <button type="button" class="quiz-dpad-right" data-dir="right" aria-label="Right"><i class="fa-solid fa-arrow-right"></i></button>
            </div>
        `;
        container.appendChild(root);

        const ui = {};
        root.querySelectorAll("[data-q]").forEach((node) => { ui[node.dataset.q] = node; });
        ui.title.textContent = activity.activity_title;

        // ---- state ----
        let server = null;          // last state the server sent
        let mode = "loading";       // loading | ready | playing | paused | busy | cooldown | done | error
        let booted = false;
        let disposed = false;
        let fallback = false;       // no WebGL -> tap the answer chips instead
        let arena = null;
        let qIndex = 0;
        let score = 0, streak = 0, bestStreak = 0;
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
            ui.score.textContent = score;
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
                ui.fallbackFeedback.style.display = "block";
                ui.fallbackFeedback.className = "activity-feedback-box " + (ok ? "is-correct" : "is-incorrect");
                ui.fallbackFeedback.textContent = message;
                return;
            }
            ui.flash.textContent = message;
            ui.flash.className = "quiz-flash show " + (ok ? "is-ok" : "is-no");
            flashTimer = setTimeout(() => { ui.flash.className = "quiz-flash"; }, 1600);
        }

        // ---- overlay (only static markup goes through innerHTML) ----
        function showOverlay(html) {
            ui.overlay.innerHTML = html;
            ui.overlay.hidden = false;
            if (fallback) ui.arena.style.display = "";
        }

        function hideOverlay() {
            ui.overlay.hidden = true;
            ui.overlay.innerHTML = "";
            if (fallback) ui.arena.style.display = "none";
        }

        function showReady(restored) {
            if (fallback) {
                hideOverlay();
                setMode("playing");
                if (restored) flash("A life is back. Keep going!", true);
                return;
            }
            setMode("ready");
            const title = restored ? "A life is back"
                : qIndex > 0 ? "Pick up where you left off"
                : "Feed the cobra the right answer";
            showOverlay(`
                <div class="quiz-overlay-card">
                    <i class="fa-solid ${restored ? "fa-heart" : "fa-gamepad"} quiz-overlay-icon"></i>
                    <h4>${title}</h4>
                    <p>Steer the cobra into the letter that answers the question. A wrong letter, a wall, or biting yourself costs a life.</p>
                    <div class="quiz-keys"><kbd>W A S D</kbd><kbd>Arrow keys</kbd><kbd>Space = pause</kbd></div>
                    <div class="quiz-overlay-actions">
                        <button type="button" class="quiz-primary-btn" data-q="startBtn">${qIndex > 0 ? "Resume quiz" : "Start quiz"}</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-q="startBtn"]').addEventListener("click", resumePlay);
        }

        function pause() {
            if (mode !== "playing" || fallback) return;
            setMode("paused");
            showOverlay(`
                <div class="quiz-overlay-card">
                    <i class="fa-solid fa-pause quiz-overlay-icon"></i>
                    <h4>Paused</h4>
                    <p>Take a breath. Your progress is saved.</p>
                    <div class="quiz-overlay-actions">
                        <button type="button" class="quiz-primary-btn" data-q="resumeBtn">Resume</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-q="resumeBtn"]').addEventListener("click", resumePlay);
        }

        function resumePlay() {
            if (disposed) return;
            hideOverlay();
            acc = 0;
            last = performance.now();
            setMode("playing");
        }

        function enterCooldown() {
            setMode("cooldown");
            const max = server ? server.max_lives : 3;
            showOverlay(`
                <div class="quiz-overlay-card">
                    <div class="quiz-overlay-hearts">${heartsHtml(0, max)}</div>
                    <div class="quiz-countdown" data-q="countdown">${formatClock(server ? server.seconds_to_next_life : 0)}</div>
                    <p>until your next life. You'll resume at question ${qIndex + 1}. Review the lesson while you wait. Your progress is saved.</p>
                    <div class="quiz-overlay-actions">
                        <button type="button" class="quiz-primary-btn" data-q="reviewBtn"><i class="fa-solid fa-book-open"></i> Review lesson</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-q="reviewBtn"]').addEventListener("click", () => {
                document.dispatchEvent(new CustomEvent("cobrabyte:review-lesson"));
            });
        }

        function finish() {
            setMode("done");
            const correct = server ? server.correct_count : 0;
            showOverlay(`
                <div class="quiz-overlay-card">
                    <i class="fa-solid fa-trophy quiz-overlay-icon"></i>
                    <h4>Quiz complete</h4>
                    <div class="quiz-results">
                        <div><b>${correct}/${total}</b><span>Correct</span></div>
                        <div><b>${bestStreak}</b><span>Best streak</span></div>
                        <div><b>${score}</b><span>Score</span></div>
                    </div>
                    <p class="quiz-saved-note">Saved to your progress: ${correct} correct</p>
                    <div class="quiz-overlay-actions">
                        <button type="button" class="quiz-primary-btn" data-q="continueBtn">Continue</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-q="continueBtn"]').addEventListener("click", () => {
                dispose();
                onActivityDone();
            });
        }

        function showError(message) {
            setMode("error");
            showOverlay(`
                <div class="quiz-overlay-card">
                    <i class="fa-solid fa-triangle-exclamation quiz-overlay-icon is-warn"></i>
                    <h4>Something went wrong</h4>
                    <p data-q="errorText"></p>
                    <div class="quiz-overlay-actions">
                        <button type="button" class="quiz-primary-btn" data-q="retryBtn">Try again</button>
                    </div>
                </div>
            `);
            ui.overlay.querySelector('[data-q="errorText"]').textContent =
                message || "Could not reach the server. Your progress is saved.";
            ui.overlay.querySelector('[data-q="retryBtn"]').addEventListener("click", async () => {
                if (!booted) { boot(); return; }
                try {
                    applyState(await fetchQuizState(activity.la_id));
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
            ui.fallbackFeedback.style.display = "none";
            (q.options || []).forEach((opt) => {
                const color = quizColor(opt.option_letter);
                const btn = el("button", "quiz-choice");
                btn.type = "button";
                btn.tabIndex = fallback ? 0 : -1;
                btn.dataset.optionId = opt.option_id;
                const keyBadge = el("span", "quiz-key");
                keyBadge.textContent = opt.option_letter;
                keyBadge.style.color = color;
                keyBadge.style.background = color + "1a";
                const label = el("span", "quiz-choice-text");
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

        function startQuestion() {
            spawnSnake();
            spawnPellets();
            renderQuestion();
            updateHUD();
        }

        function resyncFromState() {
            if (server.completed) {
                finish();
                return;
            }
            qIndex = Math.min(server.current_index, total - 1);
            startQuestion();
            if (server.lives <= 0) enterCooldown();
            else showReady(false);
        }

        function markChoices(selectedId, correctId, isCorrect) {
            ui.choices.querySelectorAll(".quiz-choice").forEach((btn) => {
                const id = Number(btn.dataset.optionId);
                if (id === correctId) btn.classList.add("is-right");
                if (id === selectedId && !isCorrect) btn.classList.add("is-wrong");
            });
        }

        // ---- answering ----
        async function submitAnswer(option) {
            if (mode !== "playing") return;
            setMode("busy");
            const q = questions[qIndex];

            let result = null;
            try {
                result = await checkAnswer({ type: "quiz", la_id: activity.la_id, q_id: q.q_id, option_id: option.option_id });
            } catch (err) {
                result = null;
            }
            if (disposed) return;
            if (!result || !result.success) {
                showError(result && result.message);
                return;
            }

            applyState(result.state);
            if (!result.graded) {
                // Out of lives or on a different question than the server - resync.
                resyncFromState();
                return;
            }

            markChoices(option.option_id, result.correct_option_id, result.is_correct);
            if (result.is_correct) {
                streak += 1;
                bestStreak = Math.max(bestStreak, streak);
                score += 100 + streak * 20;
                bump(ui.scoreStat);
                flash(result.feedback || `Correct: ${option.option_letter}. ${option.text}`, true);
            } else {
                streak = 0;
                shake = 12;
                bump(ui.livesStat);
                flash(`${result.feedback || `Not ${option.option_letter}.`} (−1 life)`, false);
            }
            updateHUD();
            setTimeout(() => { if (!disposed) advance(); }, fallback ? 2200 : 1300);
        }

        function advance() {
            if (server.completed) {
                finish();
                return;
            }
            qIndex = server.current_index;
            startQuestion();
            if (server.lives <= 0) {
                enterCooldown();
                return;
            }
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

            let state = null;
            try {
                state = await postQuizLoseLife(activity.la_id);
            } catch (err) {
                state = null;
            }
            if (disposed) return;
            if (!state) {
                showError();
                return;
            }

            applyState(state);
            flash(state.lives > 0
                ? `${reason}. ${state.lives} ${state.lives === 1 ? "life" : "lives"} left.`
                : `${reason}. You're out of lives.`, false);
            spawnSnake();
            keepPelletsClear();
            updateHUD();
            setTimeout(() => {
                if (disposed) return;
                if (server.lives <= 0) enterCooldown();
                else resumePlay();
            }, 900);
        }

        // ---- game loop ----
        function setDir(name) {
            const d = QUIZ_DIRS[name];
            if (!d || (d.x === -dir.x && d.y === -dir.y)) return;
            nextDir = d;
        }

        function steer(name) {
            if (fallback) return false;
            if (mode === "playing") { setDir(name); return true; }
            if (mode === "ready" || mode === "paused") { setDir(name); resumePlay(); return true; }
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
            if (arena) arena.burst(pellet.x, pellet.y, quizColor(pellet.letter));
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
                pellets: pellets.map((p) => ({ x: p.x, y: p.y, letter: p.letter, color: quizColor(p.letter) })),
                shake: shake * 0.05,
                dt: dtSeconds,
                dead: mode === "cooldown"
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
                while (acc >= QUIZ_STEP_MS && mode === "playing") {
                    step();
                    acc -= QUIZ_STEP_MS;
                }
            }
            if (shake > 0) shake = Math.max(0, shake - dtMs * 0.05);
            if (visible) draw(mode === "playing" ? Math.min(1, acc / QUIZ_STEP_MS) : 1, dtMs / 1000);
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
            const countdown = ui.overlay.querySelector('[data-q="countdown"]');
            if (countdown) countdown.textContent = formatClock(server.seconds_to_next_life);
        }

        async function refreshState() {
            if (refreshing) return;
            refreshing = true;
            try {
                const state = await fetchQuizState(activity.la_id);
                if (disposed) return;
                applyState(state);
                if (mode === "cooldown" && state.lives > 0) showReady(true);
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

            const name = QUIZ_KEYMAP[e.code];
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
            if (gridChanged && ["ready", "playing", "paused", "cooldown"].includes(mode)) {
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
                <div class="quiz-overlay-card">
                    <i class="fa-solid fa-spinner fa-spin quiz-overlay-icon"></i>
                    <p>Loading quiz...</p>
                </div>
            `);

            let state;
            try {
                state = await fetchQuizState(activity.la_id);
            } catch (err) {
                console.error("Error loading quiz state:", err);
                if (!disposed) showError("Could not load this quiz.");
                return;
            }
            if (disposed) return;
            applyState(state);
            score = state.correct_count * 100;

            computeLayout();
            try {
                const mod = await import(LEARNER_JS_BASE + "arena3d.js");
                if (disposed) return;
                arena = mod.createArena(ui.canvas);
                arena.setGrid(COLS, ROWS);
            } catch (err) {
                console.warn("Quiz arena unavailable, switching to tap-to-answer:", err);
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
        } else if (activity.activity_type === "Quiz") {
            renderQuiz(activity, container, onActivityDone);
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