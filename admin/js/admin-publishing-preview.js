/**
 * admin-publishing-preview.js - Task #21
 * --------------------------------------------------------------------
 * Opens/closes the Preview modal (publishing-preview-modal.html) and
 * drives its 3 views by fetching from the read-only /publishing/
 * preview/... routes (Task #18). No locking logic anywhere in this
 * file - every chapter/module/lesson returned by those routes is
 * already implicitly unlocked, matching the Preview spec exactly.
 *
 * Exposes window.CobraBytePublishingPreview.open() for Task #22's
 * Preview button to call.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const modal = document.getElementById("publishingPreviewModal");
        if (!modal) return;

        const closeBtn = document.getElementById("previewCloseBtn");
        const backBtn = document.getElementById("previewBackBtn");
        const titleEl = document.getElementById("previewModalTitle");

        const mapView = document.getElementById("previewLearningMapView");
        const lessonsView = document.getElementById("previewLessonsView");
        const contentView = document.getElementById("previewLessonContentView");

        const chaptersList = document.getElementById("previewChaptersList");
        const categoryNameEl = document.getElementById("previewCategoryName");
        const modulesList = document.getElementById("previewModulesList");
        const lessonTitleEl = document.getElementById("previewLessonTitle");
        const lessonBodyEl = document.getElementById("previewLessonBody");
        const activitiesSection = document.getElementById("previewActivitiesSection");
        const activitiesList = document.getElementById("previewActivitiesList");
        const exercisesSection = document.getElementById("previewExercisesSection");
        const exercisesList = document.getElementById("previewExercisesList");

        // Simple back-stack: each entry knows how to re-render itself.
        let navStack = [];

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function badgeHtml(status) {
            const cls = status === "Published" ? "status-published" : "status-ready";
            return `<span class="preview-badge ${cls}">${escapeHtml(status)}</span>`;
        }

        function showView(view) {
            [mapView, lessonsView, contentView].forEach((v) => v.classList.add("preview-hidden"));
            view.classList.remove("preview-hidden");
        }

        function updateBackButton() {
            backBtn.classList.toggle("preview-hidden", navStack.length === 0);
        }

        // ------------------------------------------------------------
        // View 1: Learning Map
        // ------------------------------------------------------------
        async function loadChapters(pushToStack) {
            if (pushToStack) navStack.push(() => loadChapters(false));
            titleEl.textContent = "Preview - Roadmap";
            showView(mapView);
            updateBackButton();

            chaptersList.innerHTML = `<p class="preview-loading">Loading&hellip;</p>`;
            try {
                const resp = await fetch("/admin/publishing/preview/learning-map", { credentials: "include" });
                const result = await resp.json();
                const chapters = result.chapters || [];

                if (chapters.length === 0) {
                    chaptersList.innerHTML = `<p class="preview-loading">Nothing is Ready to Publish or Published yet.</p>`;
                    return;
                }

                chaptersList.innerHTML = chapters.map((c) => `
                    <div class="preview-chapter-card" data-cat-id="${c.cat_id}">
                        <div class="preview-chapter-icon">CH</div>
                        <div class="preview-chapter-info">
                            <h3>${escapeHtml(c.category_name)}</h3>
                            <p>${c.modules_total} module${c.modules_total === 1 ? "" : "s"}</p>
                        </div>
                        ${badgeHtml(c.status)}
                    </div>
                `).join("");

                chaptersList.querySelectorAll(".preview-chapter-card").forEach((card) => {
                    card.addEventListener("click", () => loadLessons(parseInt(card.dataset.catId, 10), true));
                });
            } catch (e) {
                chaptersList.innerHTML = `<p class="preview-loading">Could not reach the server.</p>`;
            }
        }

        // ------------------------------------------------------------
        // View 2: Lessons (modules + lessons for one chapter)
        // ------------------------------------------------------------
        async function loadLessons(catId, pushToStack) {
            if (pushToStack) navStack.push(() => loadLessons(catId, false));
            titleEl.textContent = "Preview";
            showView(lessonsView);
            updateBackButton();

            modulesList.innerHTML = `<p class="preview-loading">Loading&hellip;</p>`;
            try {
                const resp = await fetch(`/admin/publishing/preview/lessons?cat_id=${catId}`, { credentials: "include" });
                const result = await resp.json();

                if (!result.success) {
                    modulesList.innerHTML = `<p class="preview-loading">${escapeHtml(result.message || "Could not load this chapter.")}</p>`;
                    return;
                }

                categoryNameEl.textContent = result.category_name || "";
                const modules = result.modules || [];

                if (modules.length === 0) {
                    modulesList.innerHTML = `<p class="preview-loading">No publishable modules in this chapter yet.</p>`;
                    return;
                }

                modulesList.innerHTML = modules.map((m) => `
                    <div class="preview-module-block">
                        <div class="preview-module-header">
                            <h4>${escapeHtml(m.module_name)}</h4>
                            ${badgeHtml(m.status)}
                        </div>
                        ${(m.lessons || []).map((l) => `
                            <div class="preview-lesson-row" data-resource-id="${l.resource_id}">
                                <span class="lesson-title">${escapeHtml(l.resource_title)}</span>
                                ${badgeHtml(l.status)}
                            </div>
                        `).join("") || `<p class="preview-loading" style="padding:8px 0;">No publishable lessons yet.</p>`}
                    </div>
                `).join("");

                modulesList.querySelectorAll(".preview-lesson-row").forEach((row) => {
                    row.addEventListener("click", () => loadLessonContent(parseInt(row.dataset.resourceId, 10), true));
                });
            } catch (e) {
                modulesList.innerHTML = `<p class="preview-loading">Could not reach the server.</p>`;
            }
        }

        // ------------------------------------------------------------
        // View 3: Lesson Content + Activities/Exercises
        // ------------------------------------------------------------
        async function loadLessonContent(resourceId, pushToStack) {
            if (pushToStack) navStack.push(() => loadLessonContent(resourceId, false));
            titleEl.textContent = "Preview";
            showView(contentView);
            updateBackButton();

            lessonTitleEl.textContent = "";
            lessonBodyEl.innerHTML = `<p class="preview-loading">Loading&hellip;</p>`;
            activitiesSection.classList.add("preview-hidden");
            exercisesSection.classList.add("preview-hidden");

            try {
                const [contentResp, activitiesResp] = await Promise.all([
                    fetch(`/admin/publishing/preview/lesson-content?resource_id=${resourceId}`, { credentials: "include" }),
                    fetch(`/admin/publishing/preview/activities?resource_id=${resourceId}`, { credentials: "include" }),
                ]);
                const contentResult = await contentResp.json();
                const activitiesResult = await activitiesResp.json();

                if (!contentResult.success) {
                    lessonBodyEl.innerHTML = `<p class="preview-loading">${escapeHtml(contentResult.message || "Could not load this lesson.")}</p>`;
                    return;
                }

                lessonTitleEl.textContent = contentResult.resource_title || "";
                lessonBodyEl.innerHTML = contentResult.content_html || "<em>No content yet.</em>";

                const activities = activitiesResult.activities || [];
                const exercises = activitiesResult.exercises || [];

                if (activities.length > 0) {
                    activitiesSection.classList.remove("preview-hidden");
                    activitiesList.innerHTML = activities.map(renderActivityCard).join("");
                    wireActivityInteractions();
                }

                if (exercises.length > 0) {
                    exercisesSection.classList.remove("preview-hidden");
                    exercisesList.innerHTML = exercises.map(renderExerciseCard).join("");
                }
            } catch (e) {
                lessonBodyEl.innerHTML = `<p class="preview-loading">Could not reach the server.</p>`;
            }
        }

        function renderActivityCard(activity) {
            let inner = "";
            if (activity.activity_type === "Multiple Choice") {
                inner = activity.items.map((q) => `
                    <div class="preview-mcq-question" data-q-id="${q.q_id}">
                        <p>${escapeHtml(q.question_text)}</p>
                        ${q.options.map((o) => `
                            <button type="button" class="preview-mcq-option" data-option-id="${o.option_id}">${escapeHtml(o.option_letter)}. ${escapeHtml(o.text)}</button>
                        `).join("")}
                        <div class="preview-answer-feedback preview-hidden"></div>
                    </div>
                `).join("");
            } else if (activity.activity_type === "Fill in the Blanks") {
                inner = activity.items.map((f) => `
                    <div class="preview-fib-item" data-fib-id="${f.fib_id}">
                        <p>${escapeHtml(f.content)}</p>
                        <input type="text" class="preview-fib-input" placeholder="Type your answer...">
                        <button type="button" class="preview-fib-check-btn">Check</button>
                        <div class="preview-answer-feedback preview-hidden"></div>
                    </div>
                `).join("");
            } else if (activity.activity_type === "Flashcards") {
                inner = activity.items.map((c) => `
                    <div class="preview-flashcard" data-front="${escapeHtml(c.front)}" data-back="${escapeHtml(c.back)}" data-showing="front">${escapeHtml(c.front)}</div>
                `).join("");
            }
            return `
                <div class="preview-activity-card">
                    <div class="activity-title">${escapeHtml(activity.activity_title)} <span class="preview-badge status-ready" style="margin-left:6px;">${escapeHtml(activity.activity_type)}</span></div>
                    ${inner}
                </div>
            `;
        }

        function renderExerciseCard(exercise) {
            return `
                <div class="preview-exercise-card">
                    <div class="exercise-title">${escapeHtml(exercise.exercise_title)}</div>
                    ${exercise.situation ? `<p>${escapeHtml(exercise.situation)}</p>` : ""}
                    ${exercise.problem_question ? `<p><strong>Task:</strong> ${escapeHtml(exercise.problem_question)}</p>` : ""}
                    ${exercise.clue ? `<p style="color:var(--text-secondary,#6b7280);"><em>Hint: ${escapeHtml(exercise.clue)}</em></p>` : ""}
                </div>
            `;
        }

        function wireActivityInteractions() {
            // MCQ options
            activitiesList.querySelectorAll(".preview-mcq-question").forEach((qEl) => {
                const qId = qEl.dataset.qId;
                qEl.querySelectorAll(".preview-mcq-option").forEach((btn) => {
                    btn.addEventListener("click", async () => {
                        const optionId = btn.dataset.optionId;
                        try {
                            const resp = await fetch("/admin/publishing/preview/check-answer", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ type: "mcq", q_id: qId, option_id: optionId }),
                            });
                            const result = await resp.json();
                            const feedbackEl = qEl.querySelector(".preview-answer-feedback");
                            qEl.querySelectorAll(".preview-mcq-option").forEach((o) => o.classList.remove("correct", "incorrect"));
                            btn.classList.add(result.is_correct ? "correct" : "incorrect");
                            feedbackEl.textContent = result.feedback || (result.is_correct ? "Correct!" : "Not quite.");
                            feedbackEl.className = `preview-answer-feedback ${result.is_correct ? "correct" : "incorrect"}`;
                        } catch (e) {
                            // best-effort preview - a failed check just leaves no feedback
                        }
                    });
                });
            });

            // Fill in the blanks
            activitiesList.querySelectorAll(".preview-fib-item").forEach((fEl) => {
                const fibId = fEl.dataset.fibId;
                const input = fEl.querySelector(".preview-fib-input");
                const checkBtn = fEl.querySelector(".preview-fib-check-btn");
                checkBtn.addEventListener("click", async () => {
                    try {
                        const resp = await fetch("/admin/publishing/preview/check-answer", {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ type: "fill_blank", fib_id: fibId, answer: input.value }),
                        });
                        const result = await resp.json();
                        const feedbackEl = fEl.querySelector(".preview-answer-feedback");
                        feedbackEl.textContent = result.feedback || (result.is_correct ? "Correct!" : `Not quite. Answer: ${result.correct_answer || ""}`);
                        feedbackEl.className = `preview-answer-feedback ${result.is_correct ? "correct" : "incorrect"}`;
                        feedbackEl.classList.remove("preview-hidden");
                    } catch (e) {
                        // best-effort preview
                    }
                });
            });

            // Flashcards - click to flip
            activitiesList.querySelectorAll(".preview-flashcard").forEach((card) => {
                card.addEventListener("click", () => {
                    const showingFront = card.dataset.showing === "front";
                    card.textContent = showingFront ? card.dataset.back : card.dataset.front;
                    card.dataset.showing = showingFront ? "back" : "front";
                });
            });
        }

        // ------------------------------------------------------------
        // Modal open/close + back navigation
        // ------------------------------------------------------------
        function openModal() {
            navStack = [];
            modal.classList.remove("preview-hidden");
            loadChapters(false);
        }

        function closeModal() {
            modal.classList.add("preview-hidden");
            navStack = [];
        }

        if (closeBtn) closeBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });
        if (backBtn) {
            backBtn.addEventListener("click", () => {
                navStack.pop(); // discard current view's own re-render entry
                const previous = navStack.pop();
                if (previous) {
                    previous();
                } else {
                    loadChapters(false);
                }
            });
        }

        window.CobraBytePublishingPreview = { open: openModal, close: closeModal };
    });
})();