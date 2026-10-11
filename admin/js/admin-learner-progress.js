/**
 * admin-learner-progress.js - Admin > Learner Progress (By Lesson)
 * --------------------------------------------------------------------
 * 1. Table: ONE ROW PER LESSON that has at least one learner record, in
 *    course order - Learners, Avg Score, Completed, Last Activity.
 *    Search (lesson, module or chapter name), Status, Chapter / Module,
 *    Started + Completed date ranges, pagination - live, no reload
 *    (/admin/learner-progress/data). Status and the dates decide which
 *    learner records are counted. Metric cards refresh every fetch.
 * 2. Eye button: the lesson's modal (admin-lesson-learners-modal.js -
 *    CobraLessonModal), with the same Status / dates.
 * feat/learner-progress-insights: rows show started -> finished, avg
 * score (green / yellow / red), pass rate, hardest part and "stuck at";
 * the metric cards open lists (admin-progress-cards.js); Chapter /
 * Module / Status are remembered (CobraInsights.memory). The first rows
 * come from #lpInitial (rendered with the page), not a second request.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {

        // ============================================================
        // 1. TABLE + FILTERS
        // ============================================================
        const searchInput = document.getElementById("progressSearchInput");
        const statusSelect = document.getElementById("progressStatusSelect");
        const chapterSelect = document.getElementById("progressChapterSelect");
        const moduleSelect = document.getElementById("progressModuleSelect");
        const sortSelect = document.getElementById("progressSortSelect");
        const startedFromInput = document.getElementById("progressStartedFromInput");
        const startedToInput = document.getElementById("progressStartedToInput");
        const clearStartedBtn = document.getElementById("clearProgressStartedDateBtn");
        const completedFromInput = document.getElementById("progressCompletedFromInput");
        const completedToInput = document.getElementById("progressCompletedToInput");
        const clearCompletedBtn = document.getElementById("clearProgressCompletedDateBtn");
        const dateFilterError = document.getElementById("progressDateFilterError");
        const tableBody = document.getElementById("progressTableBody");
        const showingCount = document.getElementById("progressShowingCount");
        const pageLabel = document.getElementById("progressPageLabel");
        const prevBtn = document.getElementById("progressPrevBtn");
        const nextBtn = document.getElementById("progressNextBtn");

        const metricEls = {
            total_records: document.getElementById("metricTotalRecords"),
            average_score: document.getElementById("metricAverageScore"),
            completed_100: document.getElementById("metricCompleted100"),
        };
        const mostCompletedEl = document.getElementById("metricMostCompleted");
        const mostCompletedSubEl = document.getElementById("metricMostCompletedSub");
        const I = window.CobraInsights;

        if (!tableBody) return;

        // Read from the server-rendered template, never assumed.
        let currentPage = parseInt(tableBody.dataset.page || "1", 10);
        let totalPages = parseInt(tableBody.dataset.totalPages || "1", 10);
        let debounceTimer = null;
        let activeRequestId = 0;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
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
            const checks = [
                ["Started", startedFromInput, startedToInput],
                ["Completed", completedFromInput, completedToInput],
            ];
            for (const [label, fromInput, toInput] of checks) {
                const from = fromInput ? fromInput.value : "";
                const to = toInput ? toInput.value : "";
                if (from && to && from > to) {
                    showDateError(`${label}: the end date must be on or after the start date.`);
                    return false;
                }
            }
            return true;
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

        // Status + dates: shared by the table and the lesson modal.
        function recordFilters() {
            return {
                status: statusSelect ? statusSelect.value : "",
                started_from: startedFromInput ? startedFromInput.value : "",
                started_to: startedToInput ? startedToInput.value : "",
                completed_from: completedFromInput ? completedFromInput.value : "",
                completed_to: completedToInput ? completedToInput.value : "",
            };
        }

        function buildParams(page) {
            const params = new URLSearchParams();
            const values = {
                q: searchInput ? searchInput.value.trim() : "",
                cat_id: chapterSelect ? chapterSelect.value : "",
                module_id: moduleSelect && !moduleSelect.disabled ? moduleSelect.value : "",
                sort: sortSelect && sortSelect.value !== "course" ? sortSelect.value : "",
                ...recordFilters(),
            };
            Object.keys(values).forEach((key) => {
                if (values[key]) params.set(key, values[key]);
            });
            params.set("page", String(page));
            return params;
        }

        function renderRows(lessons) {
            if (!lessons || lessons.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-muted table-empty-message">No lessons found.</td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = lessons.map((l) => `
                <tr data-resource-id="${escapeHtml(l.resource_id)}">
                    <td>
                        <strong class="table-item-title cell-truncate">${escapeHtml(l.lesson)}</strong>
                        <small class="lp-path cell-truncate">${escapeHtml(l.chapter)} › ${escapeHtml(l.module)}</small>
                    </td>
                    <td>${I.barHtml(l.completed, l.learners, `${l.learners} started · ${l.completed} finished`)}</td>
                    <td>${I.scoreHtml(l.avg_score)}</td>
                    <td>${l.pass_rate === null || l.pass_rate === undefined ? '<span class="progress-no-score">—</span>' : `<span title="${escapeHtml(`${l.passed} of ${l.completed} finished learners passed`)}">${escapeHtml(l.pass_rate)}%</span>`}</td>
                    <td>${l.hardest ? `<span class="lp-hardest">${escapeHtml(l.hardest.type)}</span> ${I.scoreHtml(l.hardest.percent)}` : '<span class="progress-no-score">—</span>'}</td>
                    <td>${l.stuck_at ? `${escapeHtml(l.stuck_at.step)} <small class="text-muted">(${escapeHtml(l.stuck_at.count)})</small>` : '<span class="progress-no-score">—</span>'}</td>
                    <td>${escapeHtml(l.last_activity)}</td>
                    <td>
                        <button type="button" class="icon-button-reset progress-view-btn js-view-lesson-btn" data-resource-id="${escapeHtml(l.resource_id)}" title="Open this lesson" aria-label="Open ${escapeHtml(l.lesson)}">
                            <span class="mask-icon icon-eye"></span>
                        </button>
                    </td>
                </tr>
            `).join("");
        }

        function setText(el, text) {
            if (el && el.textContent !== String(text)) el.textContent = text;
        }

        function updateMetrics(metrics) {
            if (!metrics) return;
            Object.keys(metricEls).forEach((key) => {
                // Only written when it changed (the live refresh calls this every 10 s).
                if (metrics[key] !== undefined) setText(metricEls[key], metrics[key]);
            });
            const avgEl = metricEls.average_score;
            if (avgEl) {
                const cls = `lp-text-${metrics.average_band || "none"}`;
                if (!avgEl.classList.contains(cls)) {
                    avgEl.className = avgEl.className.replace(/\blp-text-\w+/g, "").trim() + " " + cls;
                }
            }
            const top = metrics.most_completed;
            setText(mostCompletedEl, top ? top.lesson : "—");
            setText(mostCompletedSubEl, top ? `${top.finished} finished · Top 10 →` : "Top 10 →");
        }

        function updatePagination(countOnPage, total, page, pages) {
            currentPage = page;
            totalPages = pages;
            const showingCountText = `Showing ${countOnPage} of ${total} lesson${total === 1 ? "" : "s"}`;
            if (showingCount && showingCount.textContent !== showingCountText) showingCount.textContent = showingCountText;
            const pageLabelText = `${page} of ${pages}`;
            if (pageLabel && pageLabel.textContent !== pageLabelText) pageLabel.textContent = pageLabelText;
            if (prevBtn && prevBtn.disabled !== (page <= 1)) prevBtn.disabled = page <= 1;
            if (nextBtn && nextBtn.disabled !== (page >= pages)) nextBtn.disabled = page >= pages;
        }

        async function fetchLessons(page = 1) {
            if (!validateDates()) return;

            const requestId = ++activeRequestId;

            try {
                const response = await fetch(`/admin/learner-progress/data?${buildParams(page).toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                if (requestId !== activeRequestId) return; // a newer request already won

                const lessons = data.lessons || [];
                renderRows(lessons);
                if (window.CobraLive) CobraLive.changed("lesson-progress-rows", lessons);
                updateMetrics(data.metrics);
                updatePagination(lessons.length, data.total || 0, data.page || 1, data.total_pages || 1);
            } catch (err) {
                console.error("admin-learner-progress: failed to load lessons:", err);
            }
        }

        function remember() {
            I.rememberFilters(chapterSelect, moduleSelect, statusSelect);
        }

        function scheduleFetch(page = 1) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchLessons(page), DEBOUNCE_MS);
        }

        if (searchInput) searchInput.addEventListener("input", () => scheduleFetch(1));
        if (statusSelect) statusSelect.addEventListener("change", () => { remember(); fetchLessons(1); });

        if (chapterSelect) {
            chapterSelect.addEventListener("change", () => {
                rebuildModules(chapterSelect.value, "");
                remember();
                fetchLessons(1);
            });
        }
        if (moduleSelect) moduleSelect.addEventListener("change", () => { remember(); fetchLessons(1); });
        if (sortSelect) sortSelect.addEventListener("change", () => fetchLessons(1));

        [startedFromInput, startedToInput, completedFromInput, completedToInput].forEach((input) => {
            if (input) input.addEventListener("change", () => fetchLessons(1));
        });

        function wireClear(btn, fromInput, toInput) {
            if (!btn) return;
            btn.addEventListener("click", () => {
                if (fromInput) fromInput.value = "";
                if (toInput) toInput.value = "";
                clearDateError();
                fetchLessons(1);
            });
        }
        wireClear(clearStartedBtn, startedFromInput, startedToInput);
        wireClear(clearCompletedBtn, completedFromInput, completedToInput);

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) fetchLessons(currentPage - 1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (currentPage < totalPages) fetchLessons(currentPage + 1);
            });
        }

        // Live refresh (admin-live-refresh.js): same search / filters / page
        // that are on screen. Cards always; the rows only when they changed,
        // no modal is open and the admin didn't start a new search meanwhile.
        if (window.CobraLive) {
            CobraLive.every("lesson-progress-rows", async ({ modalOpen }) => {
                if (!validateDates()) return;
                const startedAt = activeRequestId;
                const response = await fetch(`/admin/learner-progress/data?${buildParams(currentPage).toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                if (!response.ok) return;
                const data = await response.json();
                if (startedAt !== activeRequestId) return;
                updateMetrics(data.metrics);
                if (modalOpen) return;
                const lessons = data.lessons || [];
                if (CobraLive.changed("lesson-progress-rows", lessons)) renderRows(lessons);
                updatePagination(lessons.length, data.total || 0, data.page || 1, data.total_pages || 1);
            });
        }

        // ============================================================
        // 2. FIRST ROWS, REMEMBERED FILTERS, LESSON MODAL, CARDS
        // ============================================================
        const initial = I.readJson("lpInitial", null);
        if (I.restoreFilters(chapterSelect, moduleSelect, statusSelect, rebuildModules)) {
            fetchLessons(1);
        } else if (initial) {
            renderRows(initial.lessons || []);
            if (window.CobraLive) CobraLive.changed("lesson-progress-rows", initial.lessons || []);
            updateMetrics(initial.metrics);
        }

        if (window.CobraLessonModal) CobraLessonModal.setFilters(recordFilters);
        tableBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".js-view-lesson-btn");
            if (btn && window.CobraLessonModal) CobraLessonModal.open(btn.dataset.resourceId);
        });

        // Cards follow the page's filters, never Status.
        if (window.CobraProgressCards) {
            CobraProgressCards.init({
                view: "lessons",
                params: () => {
                    const params = buildParams(1);
                    params.delete("status");
                    params.delete("page");
                    params.delete("sort");
                    return params;
                },
            });
        }
    });
})();
