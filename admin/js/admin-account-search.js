/**
 * admin-account-search.js - CobraByte Live Account Search + Filters + Sort
 * --------------------------------------------------------------------
 * Wires up the Account & Security toolbar - the search box AND the
 * Role / Status / Sort dropdowns (Task #17) - to the backend search
 * endpoint (/admin/accounts/search) so the table updates live as the
 * admin types or changes any filter, with no page reload.
 *
 * All four controls (search, role, status, sort) are combined into a
 * single query string on every request, so they always compose with
 * each other - e.g. typing "irish" while Role=Administrator and
 * Sort=Name are both selected sends q=irish&role=Administrator&sort=name
 * in one request, matching Task #17's "Combined Filtering" requirement.
 *
 * Only present on pages that have #accountSearchInput and
 * #accountsTableBody (currently just account-security.html), so this is
 * safe to include as a shared script without guard checks elsewhere.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {
        const searchInput = document.getElementById("accountSearchInput");
        const roleSelect = document.getElementById("roleFilterSelect");
        const statusSelect = document.getElementById("statusFilterSelect");
        const sortSelect = document.getElementById("sortFilterSelect");
        const tableBody = document.getElementById("accountsTableBody");
        const showingCount = document.getElementById("accountsShowingCount");

        if (!searchInput || !tableBody) return;

        let debounceTimer = null;
        let activeRequestId = 0; // guards against out-of-order responses

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function statusBadgeHtml(acc) {
            if (acc.is_locked) {
                return '<span class="badge badge-locked">Locked</span>';
            }
            if (acc.status === "Active") {
                return '<span class="badge badge-active">Active</span>';
            }
            return `<span class="badge badge-inactive">${escapeHtml(acc.status)}</span>`;
        }

        function roleBadgeHtml(acc) {
            const roleClass = acc.role === "Admin" ? "badge-admin" : "badge-learner";
            return `<span class="badge ${roleClass}">${escapeHtml(acc.role)}</span>`;
        }

        function renderRows(accounts) {
            if (!accounts || accounts.length === 0) {
                // Task #17, Requirement #9: centered empty-state row.
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-muted" style="text-align:center; padding: 30px 0;">
                            No accounts found.
                        </td>
                    </tr>`;
                if (showingCount) showingCount.textContent = "Showing 0 accounts";
                return;
            }

            const rowsHtml = accounts.map(acc => `
                <tr data-acc-id="${escapeHtml(acc.acc_id)}">
                    <td class="profile-cell">
                        <div class="avatar-sm">👤</div>
                        <strong>${escapeHtml(acc.full_name)}</strong>
                    </td>
                    <td class="text-muted">${escapeHtml(acc.username)}</td>
                    <td class="text-muted">${escapeHtml(acc.email)}</td>
                    <td>${roleBadgeHtml(acc)}</td>
                    <td>${statusBadgeHtml(acc)}</td>
                    <td class="text-muted">${escapeHtml(acc.date_created)}</td>
                    <td class="text-muted">${escapeHtml(acc.last_login)}</td>
                    <td class="text-right"><i class="fa-solid fa-ellipsis-vertical table-action-icon"></i></td>
                </tr>
            `).join("");

            tableBody.innerHTML = rowsHtml;

            if (showingCount) {
                const n = accounts.length;
                showingCount.textContent = `Showing ${n} account${n !== 1 ? "s" : ""}`;
            }
        }

        /**
         * Reads the current value of every toolbar control (search text +
         * the three dropdowns) and builds a single query string out of
         * them. Empty/default values ("All Roles", "All Status") are
         * simply omitted rather than sent as empty params, keeping the
         * request minimal and matching exactly what the backend already
         * treats as "no filter".
         */
        function buildQueryParams() {
            const params = new URLSearchParams();

            const term = searchInput.value.trim();
            if (term) params.set("q", term);

            if (roleSelect && roleSelect.value) params.set("role", roleSelect.value);
            if (statusSelect && statusSelect.value) params.set("status", statusSelect.value);

            // Sort always has a meaningful value (defaults to Date
            // Created), so it's always sent - this keeps the requested
            // sort order explicit rather than relying on the backend's
            // own default staying in sync with the dropdown's default.
            if (sortSelect && sortSelect.value) params.set("sort", sortSelect.value);

            return params;
        }

        async function runSearch() {
            const requestId = ++activeRequestId;
            const params = buildQueryParams();

            try {
                const response = await fetch(
                    `/admin/accounts/search?${params.toString()}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                // If a newer request has since started, ignore this stale response
                if (requestId !== activeRequestId) return;

                if (result.success) {
                    renderRows(result.accounts);
                } else {
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="8" class="text-muted" style="text-align:center; padding: 30px 0;">
                                Could not load accounts. Please try again.
                            </td>
                        </tr>`;
                }
            } catch (err) {
                if (requestId !== activeRequestId) return;
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-muted" style="text-align:center; padding: 30px 0;">
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

        // Task #17: Role / Status / Sort - each change re-runs the same
        // combined search immediately (debounced only to coalesce rapid
        // successive changes), preserving whatever is currently in the
        // search box and in the other dropdowns rather than resetting
        // anything (Requirement #11).
        [roleSelect, statusSelect, sortSelect].forEach((select) => {
            if (!select) return;
            select.addEventListener("change", scheduleSearch);
        });
    });
})();