/**
 * admin-learner-progress.js - Admin > Learner Progress (By Lesson)
 * --------------------------------------------------------------------
 * 1. Table: search (learner ID or name), status (Passed / Below 80%),
 *    Started + Completed date ranges, pagination - live, no reload
 *    (/admin/learner-progress/data). Metric cards refresh every fetch.
 * 2. Eye button: opens the shared Lesson Progress modal
 *    (admin-lesson-progress-modal.js - also used by the By Learner page).
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;
    const PASS_MARK = 80;

    document.addEventListener("DOMContentLoaded", () => {

        // ============================================================
        // 1. TABLE + FILTERS
        // ============================================================
        const searchInput = document.getElementById("progressSearchInput");
        const statusSelect = document.getElementById("progressStatusSelect");
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
            below_80: document.getElementById("metricBelow80"),
        };

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

        function scoreBadgeHtml(score) {
            if (score === null || score === undefined) {
                return `<span class="progress-no-score">—</span>`;
            }
            const cls = score >= PASS_MARK ? "badge-active" : "badge-locked";
            return `<span class="badge ${cls}">${escapeHtml(score)}%</span>`;
        }

        function completionHtml(pct) {
            const value = Number(pct) || 0;
            return `
                <div class="completion-cell">
                    <progress class="completion-bar" value="${value}" max="100" aria-label="Completion ${value}%"></progress>
                    <span class="completion-pct">${value}%</span>
                </div>
            `;
        }

        function completeAtHtml(rec) {
            return rec.is_completed
                ? escapeHtml(rec.completed_at)
                : `<span class="progress-in-progress">In progress</span>`;
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

        function buildParams(page) {
            const params = new URLSearchParams();
            const values = {
                q: searchInput ? searchInput.value.trim() : "",
                status: statusSelect ? statusSelect.value : "",
                started_from: startedFromInput ? startedFromInput.value : "",
                started_to: startedToInput ? startedToInput.value : "",
                completed_from: completedFromInput ? completedFromInput.value : "",
                completed_to: completedToInput ? completedToInput.value : "",
            };
            Object.keys(values).forEach((key) => {
                if (values[key]) params.set(key, values[key]);
            });
            params.set("page", String(page));
            return params;
        }

        function renderRows(records) {
            if (!records || records.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-muted table-empty-message">No progress records found.</td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = records.map((rec) => `
                <tr data-progress-id="${escapeHtml(rec.progress_id)}">
                    <td>${escapeHtml(rec.acc_id)}</td>
                    <td>${escapeHtml(rec.name)}</td>
                    <td>${escapeHtml(rec.lesson)}</td>
                    <td>${scoreBadgeHtml(rec.score)}</td>
                    <td>${completionHtml(rec.completion)}</td>
                    <td>${escapeHtml(rec.started_at)}</td>
                    <td>${completeAtHtml(rec)}</td>
                    <td>
                        <button type="button" class="icon-button-reset progress-view-btn js-view-progress-btn" data-progress-id="${escapeHtml(rec.progress_id)}" title="View details" aria-label="View details for ${escapeHtml(rec.acc_id)}">
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
            if (showingCount) showingCount.textContent = `Showing ${countOnPage} of ${total} records`;
            if (pageLabel) pageLabel.textContent = `${page} of ${pages}`;
            if (prevBtn) prevBtn.disabled = page <= 1;
            if (nextBtn) nextBtn.disabled = page >= pages;
        }

        async function fetchRecords(page = 1) {
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

                const records = data.records || [];
                renderRows(records);
                updateMetrics(data.metrics);
                updatePagination(records.length, data.total || 0, data.page || 1, data.total_pages || 1);
            } catch (err) {
                console.error("admin-learner-progress: failed to load records:", err);
            }
        }

        function scheduleFetch(page = 1) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchRecords(page), DEBOUNCE_MS);
        }

        if (searchInput) searchInput.addEventListener("input", () => scheduleFetch(1));
        if (statusSelect) statusSelect.addEventListener("change", () => fetchRecords(1));

        [startedFromInput, startedToInput, completedFromInput, completedToInput].forEach((input) => {
            if (input) input.addEventListener("change", () => fetchRecords(1));
        });

        function wireClear(btn, fromInput, toInput) {
            if (!btn) return;
            btn.addEventListener("click", () => {
                if (fromInput) fromInput.value = "";
                if (toInput) toInput.value = "";
                clearDateError();
                fetchRecords(1);
            });
        }
        wireClear(clearStartedBtn, startedFromInput, startedToInput);
        wireClear(clearCompletedBtn, completedFromInput, completedToInput);

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) fetchRecords(currentPage - 1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (currentPage < totalPages) fetchRecords(currentPage + 1);
            });
        }

        // ============================================================
        // 2. DETAIL MODAL - lives in admin-lesson-progress-modal.js
        //    (shared with the By Learner page)
        // ============================================================
        tableBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".js-view-progress-btn");
            if (btn && window.CobraLessonProgressModal) {
                window.CobraLessonProgressModal.open(btn.dataset.progressId);
            }
        });
    });
})();