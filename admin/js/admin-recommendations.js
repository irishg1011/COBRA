/**
 * admin-recommendations.js - Mentor > Recommendations
 * --------------------------------------------------------------------
 * feat/mentor-recommendations
 *
 * Read-only page: stat cards + the table of lesson recommendations
 * (search by learner / topic / lesson, status filter, date range,
 * pagination) - live, no page reload (/admin/recommendations/data).
 *
 * The first load asks the server to re-check learners' current weak
 * spots (refresh=1), so a recommendation a learner already fixed shows
 * as Completed. Later searches and page changes skip that step.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;
    const DATA_URL = "/admin/recommendations/data";
    const STATUS_ICONS = {
        pending: "fa-regular fa-clock",
        in_progress: "fa-solid fa-rotate",
        completed: "fa-regular fa-circle-check",
    };

    document.addEventListener("DOMContentLoaded", () => {
        const tableBody = document.getElementById("recTableBody");
        if (!tableBody) return;

        const searchInput = document.getElementById("recSearchInput");
        const statusSelect = document.getElementById("recStatusSelect");
        const dateFromInput = document.getElementById("recDateFromInput");
        const dateToInput = document.getElementById("recDateToInput");
        const clearDateBtn = document.getElementById("clearRecDateBtn");
        const dateFilterError = document.getElementById("recDateFilterError");
        const showingCount = document.getElementById("recShowingCount");
        const pageLabel = document.getElementById("recPageLabel");
        const prevBtn = document.getElementById("recPrevBtn");
        const nextBtn = document.getElementById("recNextBtn");

        const metricEls = {
            total: document.getElementById("metricRecTotal"),
            pending: document.getElementById("metricRecPending"),
            in_progress: document.getElementById("metricRecInProgress"),
            completed: document.getElementById("metricRecCompleted"),
        };

        let currentPage = 1;
        let totalPages = 1;
        let debounceTimer = null;
        let activeRequestId = 0;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML.replace(/"/g, "&quot;");
        }

        function emptyRow(message) {
            return `
                <tr>
                    <td colspan="7" class="text-muted table-empty-message">${escapeHtml(message)}</td>
                </tr>`;
        }

        function hasFilters() {
            return Boolean(searchInput.value.trim() || statusSelect.value || dateFromInput.value || dateToInput.value);
        }

        function validateDates() {
            dateFilterError.textContent = "";
            dateFilterError.classList.remove("is-visible");
            if (dateFromInput.value && dateToInput.value && dateFromInput.value > dateToInput.value) {
                dateFilterError.textContent = "Date: the end date must be on or after the start date.";
                dateFilterError.classList.add("is-visible");
                return false;
            }
            return true;
        }

        function buildParams(page, refresh) {
            const params = new URLSearchParams();
            const q = searchInput.value.trim();
            if (q) params.set("q", q);
            if (statusSelect.value) params.set("status", statusSelect.value);
            if (dateFromInput.value) params.set("date_from", dateFromInput.value);
            if (dateToInput.value) params.set("date_to", dateToInput.value);
            params.set("page", String(page));
            if (refresh) params.set("refresh", "1");
            return params;
        }

        function statusHtml(row) {
            const cls = STATUS_ICONS[row.status] ? row.status : "pending";
            const done = row.completed_on ? `<span class="rec-completed-on">${escapeHtml(row.completed_on)}</span>` : "";
            return `
                <span class="rec-status rec-status-${cls}">
                    <i class="${STATUS_ICONS[cls]}" aria-hidden="true"></i> ${escapeHtml(row.status_label)}
                </span>${done}`;
        }

        // The learner's Module Review for this recommendation's module:
        // not ready (lessons left) / needs retake / passed, with the score.
        function moduleReviewHtml(row) {
            const r = row.module_review;
            if (!r) return "—";
            let label, cls;
            if (r.state === "passed") { label = `Passed · ${r.percent}%`; cls = "rec-review-passed"; }
            else if (r.state === "needs_retake") { label = `Needs retake · ${r.percent}%`; cls = "rec-review-retake"; }
            else { label = `Not ready · ${r.lessons_left} lesson${r.lessons_left === 1 ? "" : "s"} left`; cls = "rec-review-pending"; }
            return `<span class="rec-review ${cls}">${escapeHtml(label)}</span>`
                + (row.module ? `<span class="rec-module-name">${escapeHtml(row.module)}</span>` : "");
        }

        function renderRows(rows) {
            if (!rows.length) {
                tableBody.innerHTML = emptyRow(hasFilters()
                    ? "No recommendations match your search or filters."
                    : "No recommendations yet. They appear here when a learner misses items in a lesson's activities.");
                return;
            }
            tableBody.innerHTML = rows.map((row) => `
                <tr>
                    <td>
                        ${escapeHtml(row.acc_id)}
                        ${row.learner_name ? `<span class="rec-learner-name">${escapeHtml(row.learner_name)}</span>` : ""}
                    </td>
                    <td><span class="rec-topic" title="${escapeHtml(row.weak_topic)}">${escapeHtml(row.weak_topic)}</span></td>
                    <td>
                        <span class="cell-truncate">${escapeHtml(row.lesson)}</span>
                        ${row.module ? `<span class="rec-module-name">${escapeHtml(row.module)}</span>` : ""}
                    </td>
                    <td><span class="cell-truncate">${escapeHtml(row.reason)}</span></td>
                    <td>${moduleReviewHtml(row)}</td>
                    <td>${escapeHtml(row.date)}</td>
                    <td>${statusHtml(row)}</td>
                </tr>`).join("");
        }

        function updateMetrics(metrics) {
            if (!metrics) return;
            Object.keys(metricEls).forEach((key) => {
                if (metricEls[key] && metrics[key] !== undefined) metricEls[key].textContent = metrics[key];
            });
        }

        function updatePagination(countOnPage, total, page, pages) {
            currentPage = page;
            totalPages = pages;
            showingCount.textContent = `Showing ${countOnPage} of ${total} recommendations`;
            pageLabel.textContent = `${page} of ${pages}`;
            prevBtn.disabled = page <= 1;
            nextBtn.disabled = page >= pages;
        }

        async function fetchRows(page = 1, refresh = false) {
            if (!validateDates()) return;
            const requestId = ++activeRequestId;

            try {
                const response = await fetch(`${DATA_URL}?${buildParams(page, refresh).toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                if (requestId !== activeRequestId) return;   // a newer request already won

                const rows = data.rows || [];
                renderRows(rows);
                updateMetrics(data.metrics);
                updatePagination(rows.length, data.total || 0, data.page || 1, data.total_pages || 1);
            } catch (err) {
                console.error("admin-recommendations: failed to load data:", err);
                if (requestId !== activeRequestId) return;
                tableBody.innerHTML = emptyRow("Could not load recommendations. Please refresh the page.");
            }
        }

        function scheduleFetch() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchRows(1), DEBOUNCE_MS);
        }

        searchInput.addEventListener("input", scheduleFetch);
        statusSelect.addEventListener("change", () => fetchRows(1));
        dateFromInput.addEventListener("change", () => fetchRows(1));
        dateToInput.addEventListener("change", () => fetchRows(1));
        clearDateBtn.addEventListener("click", () => {
            dateFromInput.value = "";
            dateToInput.value = "";
            fetchRows(1);
        });
        prevBtn.addEventListener("click", () => { if (currentPage > 1) fetchRows(currentPage - 1); });
        nextBtn.addEventListener("click", () => { if (currentPage < totalPages) fetchRows(currentPage + 1); });

        // First load: also re-check learners' current weak spots.
        fetchRows(1, true);
    });
})();