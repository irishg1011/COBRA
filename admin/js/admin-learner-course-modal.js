/**
 * admin-learner-course-modal.js - shared Course Progress modal
 * --------------------------------------------------------------------
 * Drives #learnerCourseModal (learner-progress-learner-modal.html): one
 * learner's whole course as a Chapter -> Module -> Lesson accordion.
 * Moved out of admin-learner-progress-learners.js (feat/archive-accounts)
 * so more than one page can open it:
 *   - Learner Progress (By Learner): the table's eye button
 *   - Account & Security: "View full course progress" in the Learning tab
 * Each started lesson's eye opens the shared Lesson Progress modal on top
 * (admin-lesson-progress-modal.js), so load that file first.
 *
 * Open it with: window.CobraLearnerCourseModal.open(accId)
 * Data: /admin/learner-progress/learner-detail/<acc_id>
 */
(function () {
    "use strict";

    const PASS_MARK = 80;

    document.addEventListener("DOMContentLoaded", () => {
        const modal = document.getElementById("learnerCourseModal");
        if (!modal) return;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function scoreBadgeHtml(score) {
            if (score === null || score === undefined) {
                return `<span class="progress-no-score">—</span>`;
            }
            const cls = score >= PASS_MARK ? "badge-active" : "badge-locked";
            return `<span class="badge ${cls}">${escapeHtml(score)}%</span>`;
        }

        function completionHtml(pct, small = false) {
            const value = Number(pct) || 0;
            return `
                <div class="completion-cell">
                    <progress class="completion-bar${small ? " completion-bar-sm" : ""}" value="${value}" max="100" aria-label="Completion ${value}%"></progress>
                    <span class="completion-pct">${value}%</span>
                </div>
            `;
        }

        const closeBtn = document.getElementById("closeLearnerCourseBtn");
        const errorEl = document.getElementById("learnerCourseError");
        const nameEl = document.getElementById("learnerCourseName");
        const avatarEl = document.getElementById("learnerCourseAvatar");
        const accIdEl = document.getElementById("learnerCourseAccId");
        const currentEl = document.getElementById("learnerCourseCurrent");
        const currentPathEl = document.getElementById("learnerCourseCurrentPath");
        const lessonsEl = document.getElementById("learnerCourseLessons");
        const modulesEl = document.getElementById("learnerCourseModules");
        const scoreEl = document.getElementById("learnerCourseScore");
        const completionEl = document.getElementById("learnerCourseCompletion");
        const lastActiveEl = document.getElementById("learnerCourseLastActive");
        const chaptersEl = document.getElementById("learnerCourseChapters");

        let modalRequestId = 0;
        let lastFocused = null;

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
            [nameEl, accIdEl, currentEl, lessonsEl, scoreEl, completionEl, lastActiveEl]
                .forEach((el) => setText(el, "—"));
            setText(currentPathEl, "");
            setText(modulesEl, "");
            window.CobraAvatar && window.CobraAvatar.set(avatarEl, null);
            if (chaptersEl) chaptersEl.innerHTML = `<p class="progress-detail-empty">Loading...</p>`;
            hideError();
        }

        // Chapters also show modules done; module rows only show lessons.
        function groupStatsHtml(g) {
            const avg = g.avg_score === null || g.avg_score === undefined ? "—" : `${g.avg_score}%`;
            const modules = g.modules_total !== undefined
                ? `<span>${escapeHtml(g.modules_completed)}/${escapeHtml(g.modules_total)} modules</span>`
                : "";
            return `
                ${modules}
                <span>${escapeHtml(g.lessons_completed)}/${escapeHtml(g.lessons_total)} lessons</span>
                <span>Avg ${escapeHtml(avg)}</span>
                ${completionHtml(g.completion, true)}
            `;
        }

        function lessonStatusBadge(status) {
            if (status === "completed") return badge("badge-active", "Completed");
            if (status === "in_progress") return badge("badge-draft", "In progress");
            return badge("badge-inactive", "Not started");
        }

        function lessonTableHtml(lessons) {
            if (!lessons || lessons.length === 0) {
                return `<p class="course-empty">No published lessons in this module.</p>`;
            }
            const rows = lessons.map((l) => `
                <tr class="${l.is_current ? "is-current-lesson" : ""}">
                    <td>${escapeHtml(l.title)}${l.is_current ? ` ${badge("badge-draft", "Current")}` : ""}</td>
                    <td>${scoreBadgeHtml(l.score)}</td>
                    <td>${l.status === "not_started" ? "—" : completionHtml(l.completion, true)}</td>
                    <td>${lessonStatusBadge(l.status)}</td>
                    <td>${escapeHtml(l.started_at)}</td>
                    <td>${escapeHtml(l.completed_at)}</td>
                    <td>
                        ${l.progress_id ? `
                        <button type="button" class="icon-button-reset progress-view-btn js-open-lesson-progress" data-progress-id="${escapeHtml(l.progress_id)}" title="View lesson breakdown" aria-label="View lesson breakdown for ${escapeHtml(l.title)}">
                            <span class="mask-icon icon-eye"></span>
                        </button>` : ""}
                    </td>
                </tr>
            `).join("");
            return `
                <div class="course-lesson-scroll">
                    <table class="progress-detail-table course-lesson-table">
                        <thead>
                            <tr><th>Lesson</th><th>Score</th><th>Completion</th><th>Status</th><th>Started</th><th>Completed</th><th></th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }

        function chaptersHtml(chapters) {
            if (!chapters || chapters.length === 0) {
                return `<p class="progress-detail-empty">There are no published lessons in the course yet.</p>`;
            }

            // Open the chapter they're on now; if none, the first unlocked one.
            const anyCurrent = chapters.some((c) => c.is_current);
            const fallbackIndex = Math.max(0, chapters.findIndex((c) => !c.locked));

            return chapters.map((ch, index) => {
                const open = ch.is_current || (!anyCurrent && index === fallbackIndex);
                const lockTag = ch.locked
                    ? `<span class="badge badge-inactive"><i class="fa-solid fa-lock"></i> Locked</span>`
                    : "";

                const modules = ch.modules.map((m) => `
                    <details class="course-module" ${m.is_current ? "open" : ""}>
                        <summary class="course-summary course-summary-module">
                            <span class="course-summary-title">
                                <i class="fa-solid fa-chevron-right course-caret"></i>
                                ${escapeHtml(m.name)}
                            </span>
                            <span class="course-summary-stats">${groupStatsHtml(m)}</span>
                        </summary>
                        ${lessonTableHtml(m.lessons)}
                    </details>
                `).join("");

                return `
                    <details class="course-chapter ${ch.locked ? "is-locked" : ""}" ${open ? "open" : ""}>
                        <summary class="course-summary">
                            <span class="course-summary-title">
                                <i class="fa-solid fa-chevron-right course-caret"></i>
                                ${escapeHtml(ch.name)} ${lockTag}
                            </span>
                            <span class="course-summary-stats">${groupStatsHtml(ch)}</span>
                        </summary>
                        <div class="course-chapter-body">${modules}</div>
                    </details>
                `;
            }).join("");
        }

        function fillModal(learner) {
            setText(nameEl, learner.name || "—");
            window.CobraAvatar && window.CobraAvatar.set(avatarEl, learner.avatar_url);
            setText(accIdEl, learner.acc_id || "—");

            if (learner.current_state === "not_started") {
                setText(currentEl, "Not started");
                setText(currentPathEl, "");
            } else if (learner.current_state === "finished") {
                setText(currentEl, "Finished the course");
                setText(currentPathEl, "");
            } else {
                setText(currentEl, learner.current_lesson || "—");
                setText(currentPathEl, `${learner.current_state === "idle" ? "Last completed • " : ""}${learner.current_path || ""}`);
            }

            setText(lessonsEl, `${learner.lessons_completed} / ${learner.lessons_total} lessons`);
            setText(modulesEl, `${learner.modules_completed} / ${learner.modules_total} modules`);
            setText(scoreEl, learner.avg_score === null || learner.avg_score === undefined ? "—" : `${learner.avg_score}%`);
            setText(completionEl, `${learner.completion}%`);
            setText(lastActiveEl, learner.last_active || "—");

            if (chaptersEl) chaptersEl.innerHTML = chaptersHtml(learner.chapters);
        }

        async function openModal(accId) {
            if (!accId) return;

            lastFocused = document.activeElement;
            resetModal();
            modal.classList.remove("modal-hidden");
            if (closeBtn) closeBtn.focus();

            const requestId = ++modalRequestId;

            try {
                const response = await fetch(`/admin/learner-progress/learner-detail/${encodeURIComponent(accId)}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                if (requestId !== modalRequestId) return;

                if (!response.ok || !data.success) {
                    throw new Error(data.message || `HTTP ${response.status}`);
                }
                fillModal(data.learner);
            } catch (err) {
                if (requestId !== modalRequestId) return;
                if (chaptersEl) chaptersEl.innerHTML = "";
                showError("Could not load this learner. Please close and try again.");
                console.error("admin-learner-progress-learners: failed to load learner:", err);
            }
        }

        function closeModal() {
            if (modal.classList.contains("modal-hidden")) return false;
            modalRequestId++;
            modal.classList.add("modal-hidden");
            if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
            return true;
        }

        // Lesson eye -> shared Lesson Progress modal, on top of this one
        if (chaptersEl) {
            chaptersEl.addEventListener("click", (e) => {
                const btn = e.target.closest(".js-open-lesson-progress");
                if (btn && window.CobraLessonProgressModal) {
                    window.CobraLessonProgressModal.open(btn.dataset.progressId);
                }
            });
        }

        if (closeBtn) closeBtn.addEventListener("click", closeModal);

        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });

        // If the lesson modal on top just used this Escape, leave this one
        // open; if THIS one closes, mark the Escape as used so a modal
        // underneath it (e.g. Account Details) stays open.
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !e.defaultPrevented && closeModal()) e.preventDefault();
        });

        window.CobraLearnerCourseModal = { open: openModal };
    });
})();
