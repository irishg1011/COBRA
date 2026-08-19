/**
 * admin-learning-resources.js - CobraByte Live Learning Resources
 * Search + Type Filter
 * ---------------------------------------------------------------
 * Wires up the Manage Learning Resources toolbar (search box + Type
 * dropdown) to the backend endpoint (/admin/learning-resources/data)
 * so the table updates live as the admin types or changes the filter,
 * with no page reload.
 *
 * Mirrors admin-account-search.js / admin-manage-course.js's pattern
 * intentionally, for consistency across the admin tables:
 *   - The initial rows are already rendered server-side by Flask/Jinja
 *     on page load (see admin_routes.py: learning_resources() calling
 *     learning_resources.get_learning_resources_overview()), so this
 *     script does NOT fire a redundant fetch on DOMContentLoaded - it
 *     only reacts to the admin actually changing something.
 *   - Search + Type are combined into a single query string on every
 *     request, so they always compose with each other.
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

        let debounceTimer = null;
        let activeRequestId = 0; // guards against out-of-order responses

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
         * Reads the current value of both toolbar controls (search text
         * + Type dropdown) and builds a single query string. Empty/
         * default values ("" / "All Types") are omitted rather than
         * sent as empty params, matching exactly what the backend
         * already treats as "no filter".
         */
        function buildQueryParams() {
            const params = new URLSearchParams();

            const term = searchInput.value.trim();
            if (term) params.set("q", term);

            if (typeSelect && typeSelect.value) params.set("type", typeSelect.value);

            return params;
        }

        async function runSearch() {
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
                    renderRows(result.resources);
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
        // preserving whatever is currently in the search box.
        if (typeSelect) {
            typeSelect.addEventListener("change", scheduleSearch);
        }
    });
})();