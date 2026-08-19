/**
 * admin-learning-resources.js - CobraByte Live Learning Resources
 * Search + Type Filter + Created/Updated At Date Filters + Pagination
 * ---------------------------------------------------------------
 * Wires up the Manage Learning Resources toolbar (search box, Type
 * dropdown, and the new Created At / Updated At date filters) to the
 * backend endpoint (/admin/learning-resources/data) so the table
 * updates live as the admin types or changes a filter, with no page
 * reload.
 *
 * Mirrors admin-manage-course.js's date-filter + pagination pattern
 * intentionally, for consistency across the admin tables:
 *   - The initial rows are already rendered server-side by Flask/Jinja
 *     on page load (see admin_routes.py: learning_resources() calling
 *     learning_resources.get_learning_resources_overview()), so this
 *     script does NOT fire a redundant fetch on DOMContentLoaded - it
 *     only reacts to the admin actually changing something.
 *   - Search + Type + both date filters are combined into a single
 *     query string on every request, so they always compose with each
 *     other, and pagination always reflects whatever filters are
 *     currently active.
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
        const pageLabel = document.getElementById("resourcesPageLabel");
        const prevBtn = document.getElementById("resourcesPrevBtn");
        const nextBtn = document.getElementById("resourcesNextBtn");

        // Created At / Updated At date filter controls. Each field is a
        // single date picker by default; the matching "Range" toggle
        // checkbox reveals its second (end) date input only when the
        // admin actually wants to filter a span of dates - identical
        // UX to admin-manage-course.js's date filters.
        const createdFromInput = document.getElementById("resourceCreatedFromInput");
        const createdToInput = document.getElementById("resourceCreatedToInput");
        const createdRangeToggle = document.getElementById("resourceCreatedRangeToggle");
        const clearCreatedDateBtn = document.getElementById("clearResourceCreatedDateBtn");
        const updatedFromInput = document.getElementById("resourceUpdatedFromInput");
        const updatedToInput = document.getElementById("resourceUpdatedToInput");
        const updatedRangeToggle = document.getElementById("resourceUpdatedRangeToggle");
        const clearUpdatedDateBtn = document.getElementById("clearResourceUpdatedDateBtn");
        const dateFilterError = document.getElementById("resourceDateFilterError");

        if (!searchInput || !tableBody) return;

        let currentPage = 1;
        let totalPages = 1;
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
         * on its own Range toggle: with the toggle off, the field acts as
         * a single-date filter ("on this date") and `to` mirrors `from`;
         * with it on, `to` comes from the field's own end-date input. An
         * empty `from` means the filter isn't in use at all. Identical
         * logic to admin-manage-course.js's getEffectiveDateRange().
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
                return;
            }

            tableBody.innerHTML = resources.map(r => `
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
        }

        /**
         * Reads the current value of every toolbar control (search text,
         * Type dropdown, and both date filters) and builds a single
         * query string. Empty/default values ("" / "All Types", or an
         * untouched date field) are omitted rather than sent as empty
         * params, matching exactly what the backend treats as "no
         * filter".
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

            params.set("page", currentPage);
            return params;
        }

        async function runSearch() {
            // Don't even call the backend with a known-bad range - keep
            // the current table/pagination as-is and just surface the
            // validation message.
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

                if (!result.success) {
                    // The backend's own range check (400) lands here too
                    // (e.g. if this script's client-side check was
                    // somehow bypassed) - show it as a filter error, not
                    // a generic "could not load" message.
                    if (response.status === 400 && result.message) {
                        showDateFilterError(result.message);
                        return;
                    }
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="8" class="text-muted table-empty-message">
                                Could not load resources. Please try again.
                            </td>
                        </tr>`;
                    return;
                }

                clearDateFilterError();
                renderRows(result.resources);
                currentPage = result.page;
                totalPages = result.total_pages;

                if (showingCount) showingCount.textContent = `Showing ${result.resources.length} of ${result.total} Resources`;
                if (pageLabel) pageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (prevBtn) prevBtn.disabled = result.page <= 1;
                if (nextBtn) nextBtn.disabled = result.page >= result.total_pages;
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

        function scheduleSearch(resetPage = true) {
            if (resetPage) currentPage = 1;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runSearch, DEBOUNCE_MS);
        }

        // Live search: debounced so it doesn't fire a request on every
        // single keystroke. Resets to page 1 since the result set changes.
        searchInput.addEventListener("input", () => scheduleSearch(true));

        // Type filter - re-runs the same combined search, resetting to
        // page 1, preserving whatever is currently in the search box and
        // date filters.
        if (typeSelect) {
            typeSelect.addEventListener("change", () => scheduleSearch(true));
        }

        // Pagination - Prev/Next preserve every active filter (they're
        // already baked into buildQueryParams()).
        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) { currentPage--; runSearch(); }
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (currentPage < totalPages) { currentPage++; runSearch(); }
            });
        }

        // ------------------------------------------------------------
        // Created At / Updated At date filters
        // ------------------------------------------------------------
        // Each date input reruns the same combined search (debounced,
        // and resets to page 1), preserving whatever is currently in
        // search/type/the other date fields, exactly like search/type
        // already do above.
        [createdFromInput, createdToInput, updatedFromInput, updatedToInput].forEach((input) => {
            if (!input) return;
            input.addEventListener("change", () => scheduleSearch(true));
        });

        // Each field's "Range" toggle shows/hides its own end-date
        // input, instead of both always being visible. Restores the
        // toggle's checked state from whatever values were already
        // rendered server-side (e.g. a bookmarked/shared filtered URL)
        // BEFORE the first sync, so loading a page with an active range
        // doesn't wipe out its own end date.
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
                scheduleSearch(true);
            });
        }
        initDateRangeToggle(createdFromInput, createdToInput, createdRangeToggle);
        initDateRangeToggle(updatedFromInput, updatedToInput, updatedRangeToggle);

        // Clear buttons - each only removes ITS OWN date restriction
        // (Created At or Updated At) - search, type, and the other date
        // filter are left completely untouched.
        if (clearCreatedDateBtn) {
            clearCreatedDateBtn.addEventListener("click", () => {
                if (createdFromInput) createdFromInput.value = "";
                if (createdToInput) createdToInput.value = "";
                if (createdRangeToggle) createdRangeToggle.checked = false;
                if (createdToInput) createdToInput.style.display = "none";
                clearDateFilterError();
                scheduleSearch(true);
            });
        }
        if (clearUpdatedDateBtn) {
            clearUpdatedDateBtn.addEventListener("click", () => {
                if (updatedFromInput) updatedFromInput.value = "";
                if (updatedToInput) updatedToInput.value = "";
                if (updatedRangeToggle) updatedRangeToggle.checked = false;
                if (updatedToInput) updatedToInput.style.display = "none";
                clearDateFilterError();
                scheduleSearch(true);
            });
        }
    });
})();