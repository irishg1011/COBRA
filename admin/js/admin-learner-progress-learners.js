/**
 * admin-learner-progress-learners.js - Admin > Learner Progress (By Learner)
 * --------------------------------------------------------------------
 * 1. Table: search, status (by average score), Chapter -> Module
 *    (dependent, filtered in the browser from the options the server
 *    rendered), Last Active range, pagination - live, no reload
 *    (/admin/learner-progress/learners/data).
 * 2. Eye button: opens #learnerCourseModal - the learner's whole course
 *    as a Chapter -> Module -> Lesson accordion
 *    (/admin/learner-progress/learner-detail/<acc_id>). Each started
 *    lesson's eye opens the shared Lesson Progress modal on top
 *    (admin-lesson-progress-modal.js).
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;
    const PASS_MARK = 80;

    document.addEventListener("DOMContentLoaded", () => {

        // ============================================================
        // 1. TABLE + FILTERS
        // ============================================================
        const searchInput = document.getElementById("learnerSearchInput");
        const statusSelect = document.getElementById("learnerStatusSelect");
        const chapterSelect = document.getElementById("learnerChapterSelect");
        const moduleSelect = document.getElementById("learnerModuleSelect");
        const activeFromInput = document.getElementById("learnerActiveFromInput");
        const activeToInput = document.getElementById("learnerActiveToInput");
        const clearActiveBtn = document.getElementById("clearLearnerActiveDateBtn");
        const dateFilterError = document.getElementById("learnerDateFilterError");
        const tableBody = document.getElementById("learnersTableBody");
        const showingCount = document.getElementById("learnersShowingCount");
        const pageLabel = document.getElementById("learnersPageLabel");
        const prevBtn = document.getElementById("learnersPrevBtn");
        const nextBtn = document.getElementById("learnersNextBtn");

        const metricEls = {
            total_learners: document.getElementById("metricTotalLearners"),
            not_started: document.getElementById("metricNotStarted"),
            average_score: document.getElementById("metricLearnerAvgScore"),
            finished: document.getElementById("metricFinished"),
            below_80: document.getElementById("metricLearnerBelow80"),
        };

        if (!tableBody) return;

        let currentPage = parseInt(tableBody.dataset.page || "1", 10);
        let totalPages = parseInt(tableBody.dataset.totalPages || "1", 10);
        let debounceTimer = null;
        let activeRequestId = 0;

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

        function currentLessonHtml(l) {
            if (l.current_state === "not_started") return `<span class="progress-in-progress">Not started</span>`;
            if (l.current_state === "finished") return `<span class="badge badge-active">Finished</span>`;
            const note = l.current_state === "idle"
                ? `<small class="current-lesson-path">Last completed</small>`
                : "";
            return `
                <div class="current-lesson-cell">
                    <span class="current-lesson-title">${escapeHtml(l.current_lesson)}</span>
                    ${note}
                </div>
            `;
        }

        function progressCountHtml(l) {
            return `
                <div class="progress-count-cell">
                    <span>${escapeHtml(l.modules_completed)}/${escapeHtml(l.modules_total)} modules</span>
                    <small>${escapeHtml(l.lessons_completed)}/${escapeHtml(l.lessons_total)} lessons</small>
                </div>
            `;
        }

        // --- Chapter -> Module (options come from the server-rendered list) ---
        const allModules = moduleSelect
            ? Array.from(moduleSelect.querySelectorAll("option[data-cat-id]")).map((o) => ({
                value: o.value,
                label: o.textContent,
                catId: o.dataset.catId,
            }))
            : [];

        function rebuildModules(catId, keepValue) {
            if (!moduleSelect) return;
            const options = allModules.filter((m) => m.catId === catId);
            moduleSelect.innerHTML = `<option value="">All Modules</option>` + options
                .map((m) => `<option value="${escapeHtml(m.value)}" data-cat-id="${escapeHtml(m.catId)}">${escapeHtml(m.label)}</option>`)
                .join("");
            moduleSelect.disabled = !catId;
            moduleSelect.value = options.some((m) => m.value === keepValue) ? keepValue : "";
        }

        if (chapterSelect && moduleSelect) {
            rebuildModules(chapterSelect.value, moduleSelect.value);
        }

        function showDateError(message) {
            if (!dateFilterError) return;
            dateFilterError.textContent = message;
            dateFilterError.classList.add("is-visible");
        }

        function clearDateError() {
            if (!dateFilterError) return;
            dateFilterError.textContent = "";
            dateFilterError.classList.remove("is-visible");
        }

        function validateDates() {
            clearDateError();
            const from = activeFromInput ? activeFromInput.value : "";
            const to = activeToInput ? activeToInput.value : "";
            if (from && to && from > to) {
                showDateError("Last Active: the end date must be on or after the start date.");
                return false;
            }
            return true;
        }

        function buildParams(page) {
            const params = new URLSearchParams();
            const values = {
                q: searchInput ? searchInput.value.trim() : "",
                status: statusSelect ? statusSelect.value : "",
                cat_id: chapterSelect ? chapterSelect.value : "",
                module_id: moduleSelect && !moduleSelect.disabled ? moduleSelect.value : "",
                active_from: activeFromInput ? activeFromInput.value : "",
                active_to: activeToInput ? activeToInput.value : "",
            };
            Object.keys(values).forEach((key) => {
                if (values[key]) params.set(key, values[key]);
            });
            params.set("page", String(page));
            return params;
        }

        function renderRows(learners) {
            if (!learners || learners.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="10" class="text-muted table-empty-message">No learners found.</td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = learners.map((l) => `
                <tr data-acc-id="${escapeHtml(l.acc_id)}">
                    <td>${escapeHtml(l.acc_id)}</td>
                    <td>${escapeHtml(l.name)}</td>
                    <td>${escapeHtml(l.current_chapter)}</td>
                    <td>${escapeHtml(l.current_module)}</td>
                    <td>${currentLessonHtml(l)}</td>
                    <td>${progressCountHtml(l)}</td>
                    <td>${scoreBadgeHtml(l.avg_score)}</td>
                    <td>${completionHtml(l.completion)}</td>
                    <td>${escapeHtml(l.last_active)}</td>
                    <td>
                        <button type="button" class="icon-button-reset progress-view-btn js-view-learner-btn" data-acc-id="${escapeHtml(l.acc_id)}" title="View course progress" aria-label="View course progress for ${escapeHtml(l.acc_id)}">
                            <span class="mask-icon icon-eye"></span>
                        </button>
                    </td>
                </tr>
            `).join("");
        }

        function updateMetrics(metrics) {
            if (!metrics) return;
            Object.keys(metricEls).forEach((key) => {
                if (metricEls[key] && metrics[key] !== undefined) {
                    metricEls[key].textContent = metrics[key];
                }
            });
        }

        function updatePagination(countOnPage, total, page, pages) {
            currentPage = page;
            totalPages = pages;
            if (showingCount) showingCount.textContent = `Showing ${countOnPage} of ${total} learners`;
            if (pageLabel) pageLabel.textContent = `${page} of ${pages}`;
            if (prevBtn) prevBtn.disabled = page <= 1;
            if (nextBtn) nextBtn.disabled = page >= pages;
        }

        async function fetchLearners(page = 1) {
            if (!validateDates()) return;

            const requestId = ++activeRequestId;

            try {
                const response = await fetch(`/admin/learner-progress/learners/data?${buildParams(page).toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                if (requestId !== activeRequestId) return;

                const learners = data.learners || [];
                renderRows(learners);
                updateMetrics(data.metrics);
                updatePagination(learners.length, data.total || 0, data.page || 1, data.total_pages || 1);
            } catch (err) {
                console.error("admin-learner-progress-learners: failed to load learners:", err);
            }
        }

        function scheduleFetch(page = 1) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchLearners(page), DEBOUNCE_MS);
        }

        if (searchInput) searchInput.addEventListener("input", () => scheduleFetch(1));
        if (statusSelect) statusSelect.addEventListener("change", () => fetchLearners(1));

        if (chapterSelect) {
            chapterSelect.addEventListener("change", () => {
                rebuildModules(chapterSelect.value, "");
                fetchLearners(1);
            });
        }

        if (moduleSelect) moduleSelect.addEventListener("change", () => fetchLearners(1));

        [activeFromInput, activeToInput].forEach((input) => {
            if (input) input.addEventListener("change", () => fetchLearners(1));
        });

        if (clearActiveBtn) {
            clearActiveBtn.addEventListener("click", () => {
                if (activeFromInput) activeFromInput.value = "";
                if (activeToInput) activeToInput.value = "";
                clearDateError();
                fetchLearners(1);
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) fetchLearners(currentPage - 1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (currentPage < totalPages) fetchLearners(currentPage + 1);
            });
        }

        // ============================================================
        // 2. COURSE MODAL
        // ============================================================
        const modal = document.getElementById("learnerCourseModal");
        const closeBtn = document.getElementById("closeLearnerCourseBtn");
        const errorEl = document.getElementById("learnerCourseError");
        const nameEl = document.getElementById("learnerCourseName");
        const accIdEl = document.getElementById("learnerCourseAccId");
        const currentEl = document.getElementById("learnerCourseCurrent");
        const currentPathEl = document.getElementById("learnerCourseCurrentPath");
        const lessonsEl = document.getElementById("learnerCourseLessons");
        const modulesEl = document.getElementById("learnerCourseModules");
        const scoreEl = document.getElementById("learnerCourseScore");
        const completionEl = document.getElementById("learnerCourseCompletion");
        const lastActiveEl = document.getElementById("learnerCourseLastActive");
        const chaptersEl = document.getElementById("learnerCourseChapters");

        if (!modal) return;

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
            if (modal.classList.contains("modal-hidden")) return;
            modalRequestId++;
            modal.classList.add("modal-hidden");
            if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
        }

        tableBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".js-view-learner-btn");
            if (btn) openModal(btn.dataset.accId);
        });

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

        // If the lesson modal on top just used this Escape, leave this one open.
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !e.defaultPrevented) closeModal();
        });
    });
})();