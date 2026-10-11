/**
 * admin-learner-progress-learners.js - Admin > Learner Progress (By Learner)
 * --------------------------------------------------------------------
 * 1. Table: search, status (by average score), Chapter -> Module
 *    (dependent, filtered in the browser from the options the server
 *    rendered), Last Active range, pagination - live, no reload
 *    (/admin/learner-progress/learners/data).
 * 2. Eye button: opens the shared Course Progress modal
 *    (admin-learner-course-modal.js - window.CobraLearnerCourseModal).
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

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
            return `<span class="badge ${CobraScore.badgeClass(score)}">${escapeHtml(score)}%</span>`;
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
                        <td colspan="11" class="text-muted table-empty-message">No learners found.</td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = learners.map((l) => `
                <tr data-acc-id="${escapeHtml(l.acc_id)}">
                    <td>${escapeHtml(l.acc_id)}</td>
                    <td><div class="profile-cell">${window.CobraPresence ? CobraPresence.avatar(l.acc_id, window.CobraAvatar.html(l.avatar_url)) : window.CobraAvatar.html(l.avatar_url)}<span>${escapeHtml(l.name)}</span></div></td>
                    <td>${escapeHtml(l.current_chapter)}</td>
                    <td>${escapeHtml(l.current_module)}</td>
                    <td>${currentLessonHtml(l)}</td>
                    <td>${progressCountHtml(l)}</td>
                    <td>${scoreBadgeHtml(l.avg_score)}</td>
                    <td>${completionHtml(l.completion)}</td>
                    <td>${escapeHtml(l.last_active)}</td>
                    <td>${leavesHtml(l)}</td>
                    <td>
                        <button type="button" class="icon-button-reset progress-view-btn js-view-learner-btn" data-acc-id="${escapeHtml(l.acc_id)}" title="View course progress" aria-label="View course progress for ${escapeHtml(l.acc_id)}">
                            <span class="mask-icon icon-eye"></span>
                        </button>
                    </td>
                </tr>
            `).join("");
        }

        // feat/leave-detection: times the learner left an activity page
        // (first leave in a play = warning; after that = forfeit).
        function leavesHtml(l) {
            const n = Number(l.leaves || 0);
            if (!n) return '<span class="progress-no-score">0</span>';
            const forfeits = Number(l.leave_forfeits || 0);
            return `<span class="badge ${forfeits ? "badge-locked" : "badge-inactive"}" title="${forfeits} forfeited">${n}</span>`;
        }

        function updateMetrics(metrics) {
            if (!metrics) return;
            Object.keys(metricEls).forEach((key) => {
                // Only written when it changed (the live refresh calls this every 10 s).
                if (metricEls[key] && metrics[key] !== undefined && metricEls[key].textContent !== String(metrics[key])) {
                    metricEls[key].textContent = metrics[key];
                }
                if (key === "average_score") CobraScore.apply(metricEls[key], metrics[key]);
            });
        }

        function updatePagination(countOnPage, total, page, pages) {
            currentPage = page;
            totalPages = pages;
            const showingCountText = `Showing ${countOnPage} of ${total} learners`;
            if (showingCount && showingCount.textContent !== showingCountText) showingCount.textContent = showingCountText;
            const pageLabelText = `${page} of ${pages}`;
            if (pageLabel && pageLabel.textContent !== pageLabelText) pageLabel.textContent = pageLabelText;
            if (prevBtn && prevBtn.disabled !== (page <= 1)) prevBtn.disabled = page <= 1;
            if (nextBtn && nextBtn.disabled !== (page >= pages)) nextBtn.disabled = page >= pages;
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
                if (window.CobraLive) CobraLive.changed("learner-progress-rows", learners);
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

        // Live refresh (admin-live-refresh.js): same search / filters / page
        // that are on screen. Cards always; the rows only when they changed,
        // no modal is open and the admin didn't start a new search meanwhile.
        if (window.CobraLive) {
            CobraLive.every("learner-progress-rows", async ({ modalOpen }) => {
                if (!validateDates()) return;
                const startedAt = activeRequestId;
                const response = await fetch(`/admin/learner-progress/learners/data?${buildParams(currentPage).toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                if (!response.ok) return;
                const data = await response.json();
                if (startedAt !== activeRequestId) return;
                updateMetrics(data.metrics);
                if (modalOpen) return;
                const learners = data.learners || [];
                if (CobraLive.changed("learner-progress-rows", learners)) renderRows(learners);
                updatePagination(learners.length, data.total || 0, data.page || 1, data.total_pages || 1);
            });
        }

        // ============================================================
        // 2. EYE BUTTON -> COURSE MODAL
        // The modal itself now lives in admin-learner-course-modal.js
        // (shared with Account & Security) - this page just opens it.
        // ============================================================
        tableBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".js-view-learner-btn");
            if (btn && window.CobraLearnerCourseModal) {
                window.CobraLearnerCourseModal.open(btn.dataset.accId);
            }
        });

    });
})();
