/**
 * admin-learning-activities.js - Multi-Field Search + Type Filter +
 * Date Sorting/Filtering for Manage Learning Activities
 * --------------------------------------------------------------------
 * Wires up the Manage Learning Activities toolbar - the search box, the
 * database-driven "All Types" dropdown, the Sort dropdown (Newest
 * First / Oldest First / Recently Updated), and the Created At /
 * Updated At date filters - to the backend endpoint
 * (/admin/learning-activities/data) so the table updates live with no
 * page reload. Mirrors admin-learning-resources.js's pattern exactly
 * for consistency across the admin tables.
 *
 * Only present on pages that have #activitySearchInput and
 * #activitiesTableBody (currently just manage-learning-activities.html).
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {
        const searchInput = document.getElementById("activitySearchInput");
        const typeSelect = document.getElementById("activityTypeSelect");
        const sortSelect = document.getElementById("activitySortSelect");
        const tableBody = document.getElementById("activitiesTableBody");
        const showingCount = document.getElementById("activitiesShowingCount");
        const pageLabel = document.getElementById("activitiesPageLabel");
        const prevBtn = document.getElementById("activitiesPrevBtn");
        const nextBtn = document.getElementById("activitiesNextBtn");

        if (!searchInput || !tableBody) return;

        const createdFromInput = document.getElementById("activityCreatedFromInput");
        const createdToInput = document.getElementById("activityCreatedToInput");
        const createdRangeToggle = document.getElementById("activityCreatedRangeToggle");
        const clearCreatedDateBtn = document.getElementById("clearActivityCreatedDateBtn");
        const updatedFromInput = document.getElementById("activityUpdatedFromInput");
        const updatedToInput = document.getElementById("activityUpdatedToInput");
        const updatedRangeToggle = document.getElementById("activityUpdatedRangeToggle");
        const clearUpdatedDateBtn = document.getElementById("clearActivityUpdatedDateBtn");
        const dateFilterError = document.getElementById("activityDateFilterError");

        let currentPage = 1;
        let totalPages = 1;
        let debounceTimer = null;
        let activeRequestId = 0;

        function showDateFilterError(message) {
            if (!dateFilterError) { alert(message); return; }
            dateFilterError.textContent = message;
            dateFilterError.style.display = "block";
        }

        function clearDateFilterError() {
            if (!dateFilterError) return;
            dateFilterError.textContent = "";
            dateFilterError.style.display = "none";
        }

        function getEffectiveDateRange(fromInput, toInput, rangeToggle) {
            const from = fromInput ? fromInput.value : "";
            if (!from) return { from: "", to: "" };
            const isRange = !!(rangeToggle && rangeToggle.checked);
            const to = (isRange && toInput) ? toInput.value : from;
            return { from, to };
        }

        function validateDateRanges() {
            clearDateFilterError();

            const created = getEffectiveDateRange(createdFromInput, createdToInput, createdRangeToggle);
            if (created.from && created.to && created.from > created.to) {
                showDateFilterError("Created At: end date must be on or after the start date.");
                return false;
            }

            const updated = getEffectiveDateRange(updatedFromInput, updatedToInput, updatedRangeToggle);
            if (updated.from && updated.to && updated.from > updated.to) {
                showDateFilterError("Updated At: end date must be on or after the start date.");
                return false;
            }

            return true;
        }

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function statusBadgeHtml(status) {
            if (status === "Published") return `<span class="badge badge-active">${escapeHtml(status)}</span>`;
            if (status === "Archived") return `<span class="badge badge-inactive">${escapeHtml(status)}</span>`;
            return `<span class="badge badge-draft">${escapeHtml(status || "Draft")}</span>`;
        }

        // Task #107: Publish/Unpublish button markup - falls back to no
        // button (rather than throwing) if admin-learning-activity-publish.js
        // hasn't loaded for some reason (script tag order/load failure),
        // matching admin-learning-resources.js's own fallback convention
        // for its Publish/Unpublish button.
        function publishButtonHtml(activityId, status) {
            if (window.cobraByteActivityPublishing) {
                return window.cobraByteActivityPublishing.publishButtonHtml(activityId, status);
            }
            return "";
        }

        function renderRows(activities) {
            if (!activities || activities.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-muted table-empty-message">
                            No learning activities found.
                        </td>
                    </tr>`;
                if (showingCount) showingCount.textContent = "Showing 0 of 0 Activities";
                return;
            }

            tableBody.innerHTML = activities.map(a => `
                <tr data-activity-id="${a.activity_id}">
                    <td>
                        <strong class="table-item-title">${escapeHtml(a.activity_name)}</strong>
                    </td>
                    <td class="text-muted">${escapeHtml(a.lesson_name)}</td>
                    <td class="js-status-cell">${statusBadgeHtml(a.status)}</td>
                    <td class="text-muted">${escapeHtml(a.uploaded_by)}</td>
                    <td class="text-muted">${escapeHtml(a.created_at)}</td>
                    <td class="text-muted">${escapeHtml(a.updated_at)}</td>
                    <td class="text-right">
                        <div class="table-actions-group">
                            <a href="/admin/create-learning-activity?activity_id=${encodeURIComponent(a.activity_id)}" title="Edit" class="table-action-icon js-edit-activity-btn" data-activity-id="${a.activity_id}"><i class="fa-solid fa-pen-to-square"></i></a>
                            <form action="/admin/learning-activities/${a.activity_id}/delete" method="POST" class="inline-form">
                                <button type="submit" title="Delete" class="table-action-icon delete-action icon-button-reset"><i class="fa-solid fa-trash"></i></button>
                            </form>
                        </div>
                    </td>
                    <td class="text-right">${publishButtonHtml(a.activity_id, a.status)}</td>
                </tr>
            `).join("");
        }

        function buildParams() {
            const params = new URLSearchParams();
            const term = searchInput.value.trim();
            if (term) params.set("q", term);

            if (typeSelect && typeSelect.value) params.set("type", typeSelect.value);
            if (sortSelect && sortSelect.value) params.set("sort", sortSelect.value);

            const created = getEffectiveDateRange(createdFromInput, createdToInput, createdRangeToggle);
            if (created.from) params.set("created_from", created.from);
            if (created.to) params.set("created_to", created.to);

            const updated = getEffectiveDateRange(updatedFromInput, updatedToInput, updatedRangeToggle);
            if (updated.from) params.set("updated_from", updated.from);
            if (updated.to) params.set("updated_to", updated.to);

            params.set("page", currentPage);
            return params;
        }

        async function loadActivities() {
            if (!validateDateRanges()) return;

            const requestId = ++activeRequestId;
            const params = buildParams();

            try {
                const response = await fetch(
                    `/admin/learning-activities/data?${params.toString()}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                if (requestId !== activeRequestId) return;

                if (!result.success) {
                    if (response.status === 400 && result.message) {
                        showDateFilterError(result.message);
                        return;
                    }
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="7" class="text-muted table-empty-message">
                                Could not load activities. Please try again.
                            </td>
                        </tr>`;
                    return;
                }

                clearDateFilterError();
                renderRows(result.activities);
                currentPage = result.page;
                totalPages = result.total_pages;

                if (showingCount) showingCount.textContent = `Showing ${result.activities.length} of ${result.total} Activities`;
                if (pageLabel) pageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (prevBtn) prevBtn.disabled = result.page <= 1;
                if (nextBtn) nextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== activeRequestId) return;
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-muted table-empty-message">
                            Could not reach the server.
                        </td>
                    </tr>`;
            }
        }

        function scheduleLoad(resetPage = true) {
            if (resetPage) currentPage = 1;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(loadActivities, DEBOUNCE_MS);
        }

        searchInput.addEventListener("input", () => scheduleLoad(true));
        if (typeSelect) typeSelect.addEventListener("change", () => scheduleLoad(true));
        if (sortSelect) sortSelect.addEventListener("change", () => scheduleLoad(true));

        if (prevBtn) prevBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadActivities(); } });
        if (nextBtn) nextBtn.addEventListener("click", () => { if (currentPage < totalPages) { currentPage++; loadActivities(); } });

        [createdFromInput, createdToInput, updatedFromInput, updatedToInput].forEach((input) => {
            if (!input) return;
            input.addEventListener("change", () => scheduleLoad(true));
        });

        function initDateRangeToggle(fromInput, toInput, rangeToggle) {
            if (!rangeToggle || !toInput) return;

            const fromVal = fromInput ? fromInput.value : "";
            if (toInput.value && toInput.value !== fromVal) {
                rangeToggle.checked = true;
            }

            const sync = () => {
                toInput.style.display = rangeToggle.checked ? "" : "none";
                if (!rangeToggle.checked) toInput.value = "";
            };
            sync();

            rangeToggle.addEventListener("change", () => {
                sync();
                scheduleLoad(true);
            });
        }
        initDateRangeToggle(createdFromInput, createdToInput, createdRangeToggle);
        initDateRangeToggle(updatedFromInput, updatedToInput, updatedRangeToggle);

        if (clearCreatedDateBtn) {
            clearCreatedDateBtn.addEventListener("click", () => {
                if (createdFromInput) createdFromInput.value = "";
                if (createdToInput) createdToInput.value = "";
                if (createdRangeToggle) createdRangeToggle.checked = false;
                if (createdToInput) createdToInput.style.display = "none";
                clearDateFilterError();
                scheduleLoad(true);
            });
        }
        if (clearUpdatedDateBtn) {
            clearUpdatedDateBtn.addEventListener("click", () => {
                if (updatedFromInput) updatedFromInput.value = "";
                if (updatedToInput) updatedToInput.value = "";
                if (updatedRangeToggle) updatedRangeToggle.checked = false;
                if (updatedToInput) updatedToInput.style.display = "none";
                clearDateFilterError();
                scheduleLoad(true);
            });
        }
    });
})();