/**
 * admin-login-logs.js - CobraByte Live Login Logs Search + Filter + Sort
 * --------------------------------------------------------------------
 * Wires up the Login Logs toolbar (search box + Role / Status / Sort
 * dropdowns) to the backend endpoint (/admin/login-logs/data) so the
 * table updates live as the admin types or changes a filter, with no
 * page reload.
 *
 * Mirrors admin-account-search.js's pattern intentionally, for
 * consistency across the two admin tables:
 *   - The initial rows are already rendered server-side by Flask/Jinja
 *     when the page loads (see admin_routes.py: login_logs() calling
 *     get_login_logs_overview()), so this script does NOT fire a
 *     redundant fetch on DOMContentLoaded - it only reacts to the admin
 *     actually changing something.
 *   - All four controls (search, role, status, sort) are combined into
 *     a single query string on every request, so they always compose
 *     with each other.
 *
 * Only present on pages that have #loginLogsTableBody (currently just
 * login-logs.html), so this is safe to include as a shared script
 * without guard checks elsewhere.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {
        const searchInput = document.getElementById("logSearchInput");
        const roleSelect = document.getElementById("logRoleSelect");
        const statusSelect = document.getElementById("logStatusSelect");
        const sortSelect = document.getElementById("logSortSelect");
        const tableBody = document.getElementById("loginLogsTableBody");

        if (!tableBody) return;

        let debounceTimer = null;
        let activeRequestId = 0; // guards against out-of-order responses

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function roleBadgeHtml(log) {
            if (log.role === "Admin") {
                return '<span class="badge badge-admin">Admin</span>';
            }
            if (log.role === "Learner") {
                return '<span class="badge badge-learner">Learner</span>';
            }
            // Unmatched login attempt (no acc_id, so no role known) -
            // neutral badge rather than mislabeling it Admin or Learner.
            return `<span class="badge badge-inactive">${escapeHtml(log.role)}</span>`;
        }

        function statusBadgeHtml(log) {
            if (log.status === "Success") {
                return '<span class="badge badge-success-log">Success</span>';
            }
            return `<span class="badge badge-failed-log">${escapeHtml(log.status || "Failed")}</span>`;
        }

        function renderRows(logs) {
            if (!logs || logs.length === 0) {
                // Empty state per Task #18, Requirement: exact wording,
                // centered, no placeholder rows.
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-muted table-empty-message">
                            No login logs found.
                        </td>
                    </tr>`;
                return;
            }

            tableBody.innerHTML = logs.map(log => `
                <tr>
                    <td class="profile-cell">
                        <div class="avatar-sm">👤</div>
                        <strong>${escapeHtml(log.full_name)}</strong>
                    </td>
                    <td class="text-muted">${escapeHtml(log.email)}</td>
                    <td class="text-muted">${escapeHtml(log.acc_id)}</td>
                    <td>${roleBadgeHtml(log)}</td>
                    <td>${statusBadgeHtml(log)}</td>
                    <td class="text-right text-muted">${escapeHtml(log.attempted_at)}</td>
                </tr>
            `).join("");
        }

        /**
         * Reads the current value of every toolbar control and builds a
         * single query string out of them. Empty/default values ("All
         * Roles", "All Status") are omitted rather than sent as empty
         * params, matching exactly what the backend treats as "no filter".
         */
        function buildQueryParams() {
            const params = new URLSearchParams();

            const term = searchInput ? searchInput.value.trim() : "";
            if (term) params.set("q", term);

            if (roleSelect && roleSelect.value) params.set("role", roleSelect.value);
            if (statusSelect && statusSelect.value) params.set("status", statusSelect.value);

            // Sort always has a meaningful value (defaults to Attempted
            // At), so it's always sent explicitly.
            if (sortSelect && sortSelect.value) params.set("sort", sortSelect.value);

            return params;
        }

        async function runFetch() {
            const requestId = ++activeRequestId;
            const params = buildQueryParams();

            try {
                const response = await fetch(
                    `/admin/login-logs/data?${params.toString()}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                // If a newer request has since started, ignore this stale response
                if (requestId !== activeRequestId) return;

                if (result.success) {
                    renderRows(result.logs);
                } else {
                    console.error("admin-login-logs: backend reported failure:", result.message);
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="6" class="text-muted table-empty-message">
                                Could not load login logs. Please try again.
                            </td>
                        </tr>`;
                }
            } catch (err) {
                if (requestId !== activeRequestId) return;
                console.error("admin-login-logs: request failed:", err);
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-muted table-empty-message">
                            Could not reach the server.
                        </td>
                    </tr>`;
            }
        }

        function scheduleFetch() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runFetch, DEBOUNCE_MS);
        }

        // Live search: debounced so it doesn't fire a request on every
        // single keystroke.
        if (searchInput) searchInput.addEventListener("input", scheduleFetch);

        // Role / Status / Sort - each change re-runs the same combined
        // fetch, preserving whatever is currently in the search box and
        // in the other dropdowns rather than resetting anything.
        [roleSelect, statusSelect, sortSelect].forEach((select) => {
            if (!select) return;
            select.addEventListener("change", scheduleFetch);
        });
    });
})();