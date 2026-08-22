/**
 * admin-learning-resources.js - Task #37, #38, #39, #40 & #43: Learning
 * Resources Live Search + Dynamic Type Filter + Created/Updated Date
 * Filters + Publish/Unpublish Actions
 * --------------------------------------------------------------------
 * Wires up the Learning Resources toolbar - the search box, the
 * database-driven "All Types" dropdown (Task #38), and the Created At /
 * Updated At date filters (Task #40) - to the backend endpoint
 * (/admin/learning-resources/data) so the table updates live with no
 * page reload.
 *
 * Mirrors admin-manage-course.js's search/filter/date-filter/pagination
 * pattern intentionally, for consistency across the admin tables:
 *   - The initial rows are already rendered server-side by Flask/Jinja
 *     when the page loads (see admin_routes.py: learning_resources()
 *     calling get_learning_resources_overview()), so this script does
 *     NOT fire a redundant fetch on DOMContentLoaded - it only reacts
 *     to the admin actually typing/changing something.
 *   - Search, type filter, and both date filters are combined into a
 *     single query string on every request, so they always compose
 *     with each other (Task #39 Requirement #5, Task #40 Requirements
 *     #5 & #6).
 *
 * Task #43: renderRows() now also renders the Status badge with the
 * js-status-cell hook, and an Actions cell with the Publish/Unpublish
 * button - using the exact same markup helpers
 * (window.cobraByteResourcePublishing) that admin-resource-publish.js
 * exposes, so the server-rendered initial table and this script's live
 * re-renders can never drift out of sync with each other. This file
 * does NOT wire up the button's click behavior itself - that stays in
 * admin-resource-publish.js, loaded after this file.
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

        if (!searchInput || !tableBody) return;

        // ------------------------------------------------------------
        // Task #40: Created At / Updated At date filter controls.
        // Each field is a single date picker by default; the matching
        // "Range" toggle checkbox reveals its second (end) date input
        // only when the admin wants to filter a span of dates - same
        // UI convention already used by Manage Course's own date
        // filters (see admin-manage-course.js).
        // ------------------------------------------------------------
        const createdFromInput = document.getElementById("resourceCreatedFromInput");
        const createdToInput = document.getElementById("resourceCreatedToInput");
        const createdRangeToggle = document.getElementById("resourceCreatedRangeToggle");
        const clearCreatedDateBtn = document.getElementById("clearResourceCreatedDateBtn");
        const updatedFromInput = document.getElementById("resourceUpdatedFromInput");
        const updatedToInput = document.getElementById("resourceUpdatedToInput");
        const updatedRangeToggle = document.getElementById("resourceUpdatedRangeToggle");
        const clearUpdatedDateBtn = document.getElementById("clearResourceUpdatedDateBtn");
        const dateFilterError = document.getElementById("resourceDateFilterError");

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

        /**
         * Resolves a date filter field's effective {from, to} pair based
         * on its own Range toggle - identical logic to
         * admin-manage-course.js's getEffectiveDateRange().
         */
        function getEffectiveDateRange(fromInput, toInput, rangeToggle) {
            const from = fromInput ? fromInput.value : "";
            if (!from) return { from: "", to: "" };
            const isRange = !!(rangeToggle && rangeToggle.checked);
            const to = (isRange && toInput) ? toInput.value : from;
            return { from, to };
        }

        /**
         * Task #40: reject an invalid date range (End before Start)
         * client-side, before ever calling the backend. The backend's
         * /learning-resources/data endpoint re-validates the exact same
         * rule server-side (never trusting only this check).
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
            const cls = normalized.includes("video") ? "badge-video"
                : normalized.includes("pdf") ? "badge-pdf"
                : normalized.includes("image") ? "badge-image"
                : "badge-document";
            return `<span class="badge ${cls}">${escapeHtml(type || "—")}</span>`;
        }

        // ------------------------------------------------------------
        // Task #43: Status badge + Publish/Unpublish button markup.
        // Falls back to a plain badge/no button if
        // admin-resource-publish.js hasn't loaded for some reason
        // (script tag order or load failure), so the table still shows
        // useful info instead of throwing.
        // ------------------------------------------------------------
        function statusBadgeHtml(status) {
            if (window.cobraByteResourcePublishing) {
                return window.cobraByteResourcePublishing.statusBadgeHtml(status);
            }
            const normalized = (status || "").toLowerCase();
            const cls = normalized === "published" ? "badge-active" : "badge-draft";
            return `<span class="badge ${cls}">${escapeHtml(status || "Draft")}</span>`;
        }

        function publishButtonHtml(resourceId, status, moduleStatus) {
            if (window.cobraByteResourcePublishing) {
                return window.cobraByteResourcePublishing.publishButtonHtml(resourceId, status, moduleStatus);
            }
            return "";
        }

        // Task #81: ACTIONS column (Edit/Archive) markup - falls back to
        // just an Edit link if admin-resource-actions.js hasn't loaded
        // for some reason (script tag order/load failure), so the table
        // still shows a usable action instead of throwing.
        function actionsHtml(resourceId) {
            if (window.cobraByteResourceActions) {
                return window.cobraByteResourceActions.actionsHtml(resourceId);
            }
            return `<a href="/admin/upload-resource?resource_id=${encodeURIComponent(resourceId)}" title="Edit" class="table-action-icon"><i class="fa-solid fa-pen-to-square"></i></a>`;
        }

        function renderRows(resources) {
            if (!resources || resources.length === 0) {
                // Task #37, Requirement #7: empty state only ever shown
                // when the query genuinely returned zero rows.
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-muted table-empty-message">
                            No resources found.
                        </td>
                    </tr>`;
                if (showingCount) showingCount.textContent = "Showing 0 Resources";
                return;
            }

            // Task #81: ACTIONS (Edit/Archive) and PUBLISH STATUS
            // (Publish/Unpublish) are now two separate cells, in that
            // order, both still at the far right of the row - no other
            // columns were reordered.
            tableBody.innerHTML = resources.map(r => `
                <tr data-resource-id="${r.resource_id}">
                    <td>
                        <strong class="table-item-title">${escapeHtml(r.resource_title)}</strong>
                    </td>
                    <td>${typeBadgeHtml(r.type)}</td>
                    <td class="text-muted">${escapeHtml(r.category)}</td>
                    <td class="text-muted">${escapeHtml(r.uploaded_by)}</td>
                    <td class="text-muted js-status-cell">${statusBadgeHtml(r.status)}</td>
                    <td class="text-muted">${escapeHtml(r.created_at)}</td>
                    <td class="text-muted">${escapeHtml(r.updated_at)}</td>
                    <td class="text-right">${actionsHtml(r.resource_id)}</td>
                    <td class="text-right">${publishButtonHtml(r.resource_id, r.status, r.module_status)}</td>
                </tr>
            `).join("");
        }

        function buildParams() {
            const params = new URLSearchParams();
            const term = searchInput.value.trim();
            if (term) params.set("q", term);

            // Task #38: whatever value is currently selected IS the
            // real resource_type_id from resource_types_tbl (see the
            // dynamically-rendered <option value="{{ t.resource_type_id }}">
            // in learning-resources.html) - "All Types" has an empty
            // value, which is simply omitted here, matching exactly
            // what get_learning_resources_overview() treats as "no
            // type filter".
            if (typeSelect && typeSelect.value) params.set("type", typeSelect.value);

            // Task #40: only ever sent when the admin actually picked a
            // "from" value - see getEffectiveDateRange() above.
            const created = getEffectiveDateRange(createdFromInput, createdToInput, createdRangeToggle);
            if (created.from) params.set("created_from", created.from);
            if (created.to) params.set("created_to", created.to);

            const updated = getEffectiveDateRange(updatedFromInput, updatedToInput, updatedRangeToggle);
            if (updated.from) params.set("updated_from", updated.from);
            if (updated.to) params.set("updated_to", updated.to);

            params.set("page", currentPage);
            return params;
        }

        async function loadResources() {
            // Task #40: don't even call the backend with a known-bad
            // range - keep the current table/pagination as-is and just
            // surface the validation message.
            if (!validateDateRanges()) return;

            const requestId = ++activeRequestId;
            const params = buildParams();

            try {
                const response = await fetch(
                    `/admin/learning-resources/data?${params.toString()}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                if (requestId !== activeRequestId) return;

                if (!result.success) {
                    // Task #40: the backend's own range check (400)
                    // lands here too (e.g. if this script's client-side
                    // check was somehow bypassed) - show it as a filter
                    // error, not a generic "could not load" message.
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

        function scheduleLoad(resetPage = true) {
            if (resetPage) currentPage = 1;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(loadResources, DEBOUNCE_MS);
        }

        // Live search: debounced so it doesn't fire a request on every
        // single keystroke.
        searchInput.addEventListener("input", () => scheduleLoad(true));

        // Task #38: type filter re-runs the same combined search
        // immediately (debounced only to coalesce rapid changes),
        // preserving whatever is currently in the search box and the
        // date filters.
        if (typeSelect) typeSelect.addEventListener("change", () => scheduleLoad(true));

        if (prevBtn) prevBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadResources(); } });
        if (nextBtn) nextBtn.addEventListener("click", () => { if (currentPage < totalPages) { currentPage++; loadResources(); } });

        // ------------------------------------------------------------
        // Task #40: Created At / Updated At date filters
        // ------------------------------------------------------------
        [createdFromInput, createdToInput, updatedFromInput, updatedToInput].forEach((input) => {
            if (!input) return;
            input.addEventListener("change", () => scheduleLoad(true));
        });

        // Each field's "Range" toggle shows/hides its own end-date
        // input, and restores its checked state from whatever values
        // were already rendered server-side (e.g. a bookmarked/shared
        // filtered URL) before the first sync.
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

        // Clear buttons only remove THEIR OWN date restriction - search,
        // type filter, and the other date filter are left untouched.
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