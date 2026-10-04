/**
 * admin-lesson-progress-modal.js - shared Lesson Progress modal
 * --------------------------------------------------------------------
 * Drives #progressDetailModal (learner-progress-modal.html): one
 * learner's breakdown for one lesson. Used by BOTH Learner Progress
 * views:
 *   - By Lesson: the table's eye button
 *   - By Learner: each lesson's eye button inside the course modal
 *     (this modal opens on top of it)
 *
 * Open it with: window.CobraLessonProgressModal.open(progressId)
 * Data: /admin/learner-progress/records/<progress_id>
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const modal = document.getElementById("progressDetailModal");
        if (!modal) return;

        const closeBtn = document.getElementById("closeProgressDetailBtn");
        const errorEl = document.getElementById("progressDetailError");
        const nameEl = document.getElementById("progressDetailName");
        const avatarEl = document.getElementById("progressDetailAvatar");
        const insightsEl = document.getElementById("progressDetailInsights");
        const accIdEl = document.getElementById("progressDetailAccId");
        const lessonEl = document.getElementById("progressDetailLesson");
        const scoreEl = document.getElementById("progressDetailScore");
        const completionEl = document.getElementById("progressDetailCompletion");
        const stepCountEl = document.getElementById("progressDetailStepCount");
        const startedEl = document.getElementById("progressDetailStarted");
        const completedEl = document.getElementById("progressDetailCompleted");
        const stepsEl = document.getElementById("progressDetailSteps");
        const activitiesEl = document.getElementById("progressDetailActivities");
        const exerciseEl = document.getElementById("progressDetailExercise");
        const gradedEl = document.getElementById("progressDetailGraded");

        let modalRequestId = 0;
        let lastFocused = null;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function setText(el, value) {
            if (el) el.textContent = value;
        }

        function badge(cls, label) {
            return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
        }

        function showError(message) {
            if (!errorEl) return;
            errorEl.textContent = message;
            errorEl.classList.add("is-visible");
        }

        function hideError() {
            if (!errorEl) return;
            errorEl.textContent = "";
            errorEl.classList.remove("is-visible");
        }

        function resetModal() {
            [nameEl, accIdEl, lessonEl, scoreEl, completionEl, startedEl, completedEl]
                .forEach((el) => setText(el, "—"));
            setText(stepCountEl, "");
            window.CobraAvatar && window.CobraAvatar.set(avatarEl, null);
            if (stepsEl) stepsEl.innerHTML = "";
            if (activitiesEl) activitiesEl.innerHTML = `<p class="progress-detail-empty">Loading...</p>`;
            if (exerciseEl) exerciseEl.innerHTML = "";
            toggleSection(activitiesEl, true);
            toggleSection(exerciseEl, true);
            if (insightsEl) insightsEl.innerHTML = "";
            setText(gradedEl, "");
            hideError();
        }

        // Only the steps this lesson HAS (same as the learner's step bar):
        // no Video row without a video.
        function stepsHtml(rec) {
            const content = rec.content_read
                ? badge("badge-active", "Read")
                : badge("badge-inactive", "Not read");
            const video = rec.has_video
                ? `<li class="progress-step-item"><span>Video Tutorial</span>${rec.video_watched ? badge("badge-active", "Watched") : badge("badge-inactive", "Not watched")}</li>`
                : "";

            return `
                ${video}
                <li class="progress-step-item"><span>Lesson Content</span>${content}</li>
            `;
        }

        // Strong | Needs work for this learner in this lesson - worked out
        // automatically from first-try answers (server: lesson_insights.py).
        function insightsHtml(insights) {
            const skills = (insights && insights.skills) || [];
            if (!skills.length) {
                return `<p class="progress-detail-empty">No answers yet in this lesson's activities.</p>`;
            }
            const cell = (list, empty) => list.length
                ? list.map((s) => `
                    <div class="insight-cell-item">
                        <strong>${escapeHtml(s.label)}</strong> <span class="text-muted">${escapeHtml(s.percent)}% · ${escapeHtml(s.right)}/${escapeHtml(s.total)} first try (${escapeHtml(s.source)})</span>
                        ${!s.strong && s.parts && s.parts.length ? `<small class="insight-cell-parts">Re-read: ${s.parts.map(escapeHtml).join(", ")}</small>` : ""}
                    </div>`).join("")
                : `<span class="text-muted">${escapeHtml(empty)}</span>`;
            return `
                <table class="progress-detail-table insight-table">
                    <thead><tr><th>Strong (${escapeHtml(insights.strong_percent)}%+)</th><th>Needs work</th></tr></thead>
                    <tbody><tr>
                        <td>${cell(insights.strong || [], "None yet")}</td>
                        <td>${cell(insights.weak || [], "No weak areas")}</td>
                    </tr></tbody>
                </table>`;
        }

        // Hide a whole section (heading included) when the lesson has none of it.
        function toggleSection(el, show) {
            const section = el ? el.closest(".progress-detail-section") : null;
            if (section) section.hidden = !show;
        }

        function activityStatus(act) {
            if (act.completed) return badge("badge-active", "Completed");
            if (act.started) return badge("badge-draft", "In progress");
            return badge("badge-inactive", "Not started");
        }

        function activitiesHtml(activities) {
            if (!activities || activities.length === 0) {
                return `<p class="progress-detail-empty">This lesson has no published activities.</p>`;
            }
            const rows = activities.map((act) => `
                <tr>
                    <td>${escapeHtml(act.title)}</td>
                    <td>${escapeHtml(act.type)}</td>
                    <td>${act.total > 0 ? `${escapeHtml(act.score)} / ${escapeHtml(act.total)}` : "—"}</td>
                    <td>${activityStatus(act)}</td>
                </tr>
            `).join("");
            return `
                <table class="progress-detail-table">
                    <thead><tr><th>Activity</th><th>Type</th><th>Score</th><th>Status</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            `;
        }

        function exerciseHtml(ex) {
            if (!ex) {
                return `<p class="progress-detail-empty">This lesson has no coding exercise.</p>`;
            }
            let status;
            if (ex.passed) status = badge("badge-active", "Passed");
            else if (ex.attempts > 0) status = badge("badge-locked", "Not passed yet");
            else status = badge("badge-inactive", "Not attempted");

            return `
                <table class="progress-detail-table">
                    <thead><tr><th>Exercise</th><th>Attempts</th><th>Test Cases</th><th>Status</th></tr></thead>
                    <tbody>
                        <tr>
                            <td>${escapeHtml(ex.title)}</td>
                            <td>${escapeHtml(ex.attempts)}</td>
                            <td>${escapeHtml(ex.points_earned)} / ${escapeHtml(ex.points_total)}</td>
                            <td>${status}</td>
                        </tr>
                    </tbody>
                </table>
            `;
        }

        function fillModal(rec) {
            setText(nameEl, rec.name || "—");
            window.CobraAvatar && window.CobraAvatar.set(avatarEl, rec.avatar_url);
            setText(accIdEl, rec.acc_id || "—");
            setText(lessonEl, rec.lesson || "—");
            setText(scoreEl, rec.score === null || rec.score === undefined ? "—" : `${rec.score}%`);
            setText(completionEl, `${rec.completion}%`);
            setText(stepCountEl, `${rec.steps_done} of ${rec.steps_total} steps`);
            setText(startedEl, rec.started_at || "—");
            setText(completedEl, rec.is_completed ? rec.completed_at : "In progress");

            if (stepsEl) stepsEl.innerHTML = stepsHtml(rec);
            if (activitiesEl) activitiesEl.innerHTML = activitiesHtml(rec.activities);
            if (exerciseEl) exerciseEl.innerHTML = exerciseHtml(rec.exercise);
            toggleSection(activitiesEl, !!(rec.activities && rec.activities.length));
            toggleSection(exerciseEl, !!rec.exercise);
            if (insightsEl) insightsEl.innerHTML = insightsHtml(rec.insights);
            toggleSection(insightsEl, !!(rec.activities && rec.activities.length) || !!rec.exercise);

            setText(
                gradedEl,
                rec.graded_total > 0
                    ? `Score = 50% activities (${rec.graded_points} of ${rec.graded_total} graded points across activities and the exercise) + 50% lesson content (content read, and the video when the lesson has one) - the same Performance % the learner sees.`
                    : "Nothing in this lesson has been graded yet, so there is no score."
            );
        }

        async function openModal(progressId) {
            if (!progressId) return;

            lastFocused = document.activeElement;
            resetModal();
            modal.classList.remove("modal-hidden");
            if (closeBtn) closeBtn.focus();

            const requestId = ++modalRequestId;

            try {
                const response = await fetch(`/admin/learner-progress/records/${encodeURIComponent(progressId)}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                if (requestId !== modalRequestId) return; // closed or another record opened

                if (!response.ok || !data.success) {
                    throw new Error(data.message || `HTTP ${response.status}`);
                }
                fillModal(data.record);
            } catch (err) {
                if (requestId !== modalRequestId) return;
                if (activitiesEl) activitiesEl.innerHTML = "";
                showError("Could not load this record. Please close and try again.");
                console.error("admin-lesson-progress-modal: failed to load record:", err);
            }
        }

        function closeModal() {
            if (modal.classList.contains("modal-hidden")) return false;
            modalRequestId++;
            modal.classList.add("modal-hidden");
            if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
            return true;
        }

        if (closeBtn) closeBtn.addEventListener("click", closeModal);

        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });

        // preventDefault() tells a modal underneath (By Learner's course
        // modal) that this Escape was already used, so only one closes.
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && closeModal()) e.preventDefault();
        });

        window.CobraLessonProgressModal = { open: openModal };
    });
})();