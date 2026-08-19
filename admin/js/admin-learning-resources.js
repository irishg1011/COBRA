/**
 * admin-learning-resources.js - Task #37 & #38: Learning Resources
 * Live Search + Dynamic Type Filter
 * --------------------------------------------------------------------
 * Wires up the Learning Resources toolbar (search box + the
 * database-driven "All Types" dropdown, see admin_routes.py's
 * learning_resources() route and learning_resources.py's
 * get_resource_types()) to the backend endpoint
 * (/admin/learning-resources/data) so the table updates live as the
 * admin types or changes the type filter, with no page reload.
 *
 * Mirrors admin-manage-course.js's search/filter/pagination pattern
 * intentionally, for consistency across the admin tables:
 *   - The initial rows are already rendered server-side by Flask/Jinja
 *     when the page loads (see admin_routes.py: learning_resources()
 *     calling get_learning_resources_overview()), so this script does
 *     NOT fire a redundant fetch on DOMContentLoaded - it only reacts
 *     to the admin actually typing/changing something.
 *   - Search + type filter are combined into a single query string on
 *     every request, so they always compose with each other (Task #38,
 *     Requirement #7: "Search + type filter -> applies both criteria
 *     together").
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

        let currentPage = 1;
        let totalPages = 1;
        let debounceTimer = null;
        let activeRequestId = 0;

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

        function renderRows(resources) {
            if (!resources || resources.length === 0) {
                // Task #37, Requirement #7: empty state only ever shown
                // when the query genuinely returned zero rows.
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-muted table-empty-message">
                            No resources found.
                        </td>
                    </tr>`;
                if (showingCount) showingCount.textContent = "Showing 0 Resources";
                return;
            }

            tableBody.innerHTML = resources.map(r => `
                <tr data-resource-id="${r.resource_id}">
                    <td>
                        <strong class="table-item-title">${escapeHtml(r.resource_title)}</strong>
                    </td>
                    <td>${typeBadgeHtml(r.type)}</td>
                    <td class="text-muted">${escapeHtml(r.category)}</td>
                    <td class="text-muted">${escapeHtml(r.uploaded_by)}</td>
                    <td class="text-muted">${escapeHtml(r.status)}</td>
                    <td class="text-muted">${escapeHtml(r.created_at)}</td>
                    <td class="text-muted">${escapeHtml(r.updated_at)}</td>
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

            params.set("page", currentPage);
            return params;
        }

        async function loadResources() {
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
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="7" class="text-muted table-empty-message">
                                Could not load resources. Please try again.
                            </td>
                        </tr>`;
                    return;
                }

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
                        <td colspan="7" class="text-muted table-empty-message">
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
        // preserving whatever is currently in the search box.
        if (typeSelect) typeSelect.addEventListener("change", () => scheduleLoad(true));

        if (prevBtn) prevBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadResources(); } });
        if (nextBtn) nextBtn.addEventListener("click", () => { if (currentPage < totalPages) { currentPage++; loadResources(); } });
    });
})();