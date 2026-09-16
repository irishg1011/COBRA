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

    function renderActivity(activity, container, onActivityDone) {
        if (activity.completed) {
            container.innerHTML = "";
            const already = el("div", "activity-summary");
            already.innerHTML = `<p><i class="fa-solid fa-circle-check"></i> You already completed "${activity.activity_title}".</p>`;
            container.appendChild(already);
            onActivityDone();
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