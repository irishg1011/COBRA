/**
 * admin-learning-resources.js - CobraByte Live Learning Resources
 * Search + Type Filter + Created At / Updated At Date Filters
 * ---------------------------------------------------------------
 * Wires up the Manage Learning Resources toolbar (search box, Type
 * dropdown, and the Created At / Updated At date filters) to the
 * backend endpoint (/admin/learning-resources/data) so the table
 * updates live as the admin types or changes any filter, with no page
 * reload.
 *
 * Mirrors admin-manage-course.js's pattern intentionally (same date-
 * filter UX, same validation, same query-param shape), for consistency
 * across the admin tables:
 *   - The initial rows are already rendered server-side by Flask/Jinja
 *     on page load (see admin_routes.py: learning_resources() calling
 *     learning_resources.get_learning_resources_overview()), so this
 *     script does NOT fire a redundant fetch on DOMContentLoaded - it
 *     only reacts to the admin actually changing something.
 *   - Search, Type, Created At, and Updated At are all combined into a
 *     single query string on every request, so they always compose
 *     with each other.
 *
 * Only present on pages that have #resourceSearchInput and
 * #resourcesTableBody (currently just learning-resources.html), so
 * this is safe to include as a shared script without guard checks
 * elsewhere.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {
        const searchInput = document.getElementById("resourceSearchInput");
        const typeSelect = document.getElementById("resourceTypeSelect");
        const tableBody = document.getElementById("resourcesTableBody");
        const showingCount = document.getElementById("resourcesShowingCount");

        if (!searchInput || !tableBody) return;

        // Created At / Updated At date filter controls - same pattern
        // as admin-manage-course.js: each field is a single date picker
        // by default; its own "Range" toggle checkbox reveals the
        // second (end) date input only when the admin wants a range.
        const createdFromInput = document.getElementById("createdFromInput");
        const createdToInput = document.getElementById("createdToInput");
        const createdRangeToggle = document.getElementById("createdRangeToggle");
        const clearCreatedDateBtn = document.getElementById("clearCreatedDateBtn");
        const updatedFromInput = document.getElementById("updatedFromInput");
        const updatedToInput = document.getElementById("updatedToInput");
        const updatedRangeToggle = document.getElementById("updatedRangeToggle");
        const clearUpdatedDateBtn = document.getElementById("clearUpdatedDateBtn");
        const dateFilterError = document.getElementById("dateFilterError");

        let debounceTimer = null;
        let activeRequestId = 0; // guards against out-of-order responses

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

        /**
         * Resolves a date filter field's effective {from, to} pair based
         * on its own Range toggle: with the toggle off, the field acts
         * as a single-date filter ("on this date") and `to` mirrors
         * `from`; with it on, `to` comes from the field's own end-date
         * input. An empty `from` means the filter isn't in use at all.
         */
        function getEffectiveDateRange(fromInput, toInput, rangeToggle) {
            const from = fromInput ? fromInput.value : "";
            if (!from) return { from: "", to: "" };
            const isRange = !!(rangeToggle && rangeToggle.checked);
            const to = (isRange && toInput) ? toInput.value : from;
            return { from, to };
        }

        /**
         * Rejects an invalid date range (End before Start) client-side,
         * before ever calling the backend, so the admin gets instant
         * feedback. The backend's /learning-resources/data endpoint
         * re-validates the exact same rule server-side (never trusting
         * only this check) in case this script is bypassed.
         */
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

        function typeBadgeHtml(type) {
            const normalized = (type || "").toLowerCase();
            let cls = "badge-document";
            if (normalized === "video") cls = "badge-video";
            else if (normalized === "pdf") cls = "badge-pdf";
            else if (normalized === "image") cls = "badge-image";
            return `<span class="badge ${cls}">${escapeHtml(type)}</span>`;
        }

        function statusBadgeHtml(status) {
            const normalized = (status || "").toLowerCase();
            let cls = "badge-inactive";
            if (normalized === "published") cls = "badge-success-log";
            else if (normalized === "draft") cls = "badge-draft";
            return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
        }

        function renderRows(resources) {
            if (!resources || resources.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-muted table-empty-message">
                            No resources found.
                        </td>
                    </tr>`;
                if (showingCount) showingCount.textContent = "Showing 0 of 0 Resources";
                return;
            }

            const rowsHtml = resources.map(r => `
                <tr data-resource-id="${escapeHtml(r.resource_id)}">
                    <td>
                        <strong class="table-item-title">${escapeHtml(r.title)}</strong>
                    </td>
                    <td class="text-muted">${escapeHtml(r.category)}</td>
                    <td>${typeBadgeHtml(r.type)}</td>
                    <td class="text-muted">${escapeHtml(r.uploaded_by)}</td>
                    <td>${statusBadgeHtml(r.status)}</td>
                    <td class="text-muted">${escapeHtml(r.created_at)}</td>
                    <td class="text-muted">${escapeHtml(r.updated_at)}</td>
                    <td class="text-right">
                        <div class="table-actions-group">
                            <a href="#" title="Edit" class="table-action-icon"><i class="fa-solid fa-pen-to-square"></i></a>
                            <a href="#" title="Delete" class="table-action-icon delete-action"><i class="fa-solid fa-trash"></i></a>
                        </div>
                    </td>
                </tr>
            `).join("");

            tableBody.innerHTML = rowsHtml;

            if (showingCount) {
                const n = resources.length;
                showingCount.textContent = `Showing ${n} of ${n} Resources`;
            }
        }

        /**
         * Reads the current value of every toolbar control (search
         * text, Type dropdown, and both date filters) and builds a
         * single query string out of them. Empty/default values are
         * omitted rather than sent as empty params, matching exactly
         * what the backend already treats as "no filter" - each filter
         * stays fully independent and optional.
         */
        function buildQueryParams() {
            const params = new URLSearchParams();

            const term = searchInput.value.trim();
            if (term) params.set("q", term);

            if (typeSelect && typeSelect.value) params.set("type", typeSelect.value);

            const created = getEffectiveDateRange(createdFromInput, createdToInput, createdRangeToggle);
            if (created.from) params.set("created_from", created.from);
            if (created.to) params.set("created_to", created.to);

            const updated = getEffectiveDateRange(updatedFromInput, updatedToInput, updatedRangeToggle);
            if (updated.from) params.set("updated_from", updated.from);
            if (updated.to) params.set("updated_to", updated.to);

            return params;
        }

        async function runSearch() {
            // Don't even call the backend with a known-bad range - keep
            // the current table as-is and just surface the validation
            // message, same as admin-manage-course.js.
            if (!validateDateRanges()) return;

            const requestId = ++activeRequestId;
            const params = buildQueryParams();

            try {
                const response = await fetch(
                    `/admin/learning-resources/data?${params.toString()}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                // If a newer request has since started, ignore this stale response
                if (requestId !== activeRequestId) return;

                if (result.success) {
                    clearDateFilterError();
                    renderRows(result.resources);
                } else if (response.status === 400 && result.message) {
                    // The backend's own range check (400) lands here too
                    // (e.g. if this script's client-side check was
                    // somehow bypassed) - show it as a filter error, not
                    // a generic "could not load" message.
                    showDateFilterError(result.message);
                } else {
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="8" class="text-muted table-empty-message">
                                Could not load resources. Please try again.
                            </td>
                        </tr>`;
                }
            } catch (err) {
                if (requestId !== activeRequestId) return;
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-muted table-empty-message">
                            Could not reach the server.
                        </td>
                    </tr>`;
            }
        }

        function scheduleSearch() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runSearch, DEBOUNCE_MS);
        }

        // Live search: debounced so it doesn't fire a request on every
        // single keystroke.
        searchInput.addEventListener("input", scheduleSearch);

        // Type filter - re-runs the same combined search immediately
        // (debounced only to coalesce rapid successive changes),
        // preserving whatever is currently in the search box and both
        // date filters.
        if (typeSelect) {
            typeSelect.addEventListener("change", scheduleSearch);
        }

        // Created At / Updated At date inputs - each reruns the same
        // combined search, preserving whatever is currently in
        // search/type/the other date filter, exactly like
        // admin-manage-course.js's own date filters.
        [createdFromInput, createdToInput, updatedFromInput, updatedToInput].forEach((input) => {
            if (!input) return;
            input.addEventListener("change", scheduleSearch);
        });

        /**
         * Each field's "Range" toggle shows/hides its own end-date
         * input, instead of both always being visible. Restores the
         * toggle's checked state from whatever values were already
         * rendered server-side (e.g. a bookmarked/shared filtered URL)
         * BEFORE the first sync, so loading a page with an active range
         * doesn't wipe out its own end date.
         */
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
                scheduleSearch();
            });
        }
        initDateRangeToggle(createdFromInput, createdToInput, createdRangeToggle);
        initDateRangeToggle(updatedFromInput, updatedToInput, updatedRangeToggle);

        // Clear buttons - each only removes ITS OWN date restriction
        // (Created At or Updated At); search, type, and the other date
        // filter are left completely untouched.
        if (clearCreatedDateBtn) {
            clearCreatedDateBtn.addEventListener("click", () => {
                if (createdFromInput) createdFromInput.value = "";
                if (createdToInput) createdToInput.value = "";
                if (createdRangeToggle) createdRangeToggle.checked = false;
                if (createdToInput) createdToInput.style.display = "none";
                clearDateFilterError();
                scheduleSearch();
            });
        }
        if (clearUpdatedDateBtn) {
            clearUpdatedDateBtn.addEventListener("click", () => {
                if (updatedFromInput) updatedFromInput.value = "";
                if (updatedToInput) updatedToInput.value = "";
                if (updatedRangeToggle) updatedRangeToggle.checked = false;
                if (updatedToInput) updatedToInput.style.display = "none";
                clearDateFilterError();
                scheduleSearch();
            });
        }
    });
})();