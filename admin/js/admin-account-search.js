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
            const roleClass = acc.role === "Admin" ? "badge-admin" : acc.role === "Mentor" ? "badge-mentor" : "badge-learner";
            return `<span class="badge ${roleClass}">${escapeHtml(acc.role)}</span>`;
        }

        // feat/archive-accounts: the 4 row icons - same markup as the
        // Jinja rows in account-security.html. The 3rd icon depends on
        // role (Learning for learners, Content for admins); Archive is
        // shown disabled, with the reason as its tooltip, when blocked.
        function actionsHtml(acc) {
            const id = escapeHtml(acc.acc_id);
            const name = escapeHtml(acc.full_name);
            const viewBtn = (tab, icon, title, label) =>
                `<button type="button" class="account-action-btn js-account-view" data-acc-id="${id}" data-tab="${tab}" title="${title}" aria-label="${label} ${name}"><i class="fa-solid ${icon}"></i></button>`;

            const third = (acc.role === "Admin" || acc.role === "Mentor")
                ? viewBtn("content", "fa-book", "Content created", "Content created by")
                : viewBtn("learning", "fa-chart-simple", "Learning progress", "Learning progress of");

            const block = escapeHtml(acc.archive_block || "");
            const archive = block
                ? `<button type="button" class="account-action-btn account-action-btn--archive is-disabled" aria-disabled="true" title="${block}" aria-label="${block}"><i class="fa-solid fa-box-archive"></i></button>`
                : `<button type="button" class="account-action-btn account-action-btn--archive js-account-archive" data-acc-id="${id}" data-name="${name}" data-role="${escapeHtml(acc.role)}" title="Archive" aria-label="Archive ${name}"><i class="fa-solid fa-box-archive"></i></button>`;

            return `
                <div class="account-actions">
                    ${viewBtn("profile", "fa-eye", "View profile", "View profile of")}
                    ${viewBtn("security", "fa-shield-halved", "Security", "Security details of")}
                    ${third}
                    ${archive}
                </div>`;
        }

        // feat/archive-accounts: metric cards are marked with
        // data-metric="<key>" in account-security.html.
        function updateMetrics(metrics) {
            if (!metrics) return;
            document.querySelectorAll("[data-metric]").forEach((el) => {
                const value = metrics[el.dataset.metric];
                if (value !== undefined) el.textContent = value;
            });
        }

        function renderRows(accounts) {
            if (!accounts || accounts.length === 0) {
                // Task #17, Requirement #9: centered empty-state row.
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-muted table-empty-message">
                            No accounts found.
                        </td>
                    </tr>`;
                if (showingCount) showingCount.textContent = "Showing 0 accounts";
                return;
            }

            const rowsHtml = accounts.map(acc => `
                <tr data-acc-id="${escapeHtml(acc.acc_id)}">
                    <td class="profile-cell">
                        ${window.CobraAvatar.html(acc.avatar_url)}
                        <strong class="cell-truncate-1">${escapeHtml(acc.full_name)}</strong>
                    </td>
                    <td class="text-muted"><span class="cell-truncate-1 cell-truncate--sm">${escapeHtml(acc.username)}</span></td>
                    <td class="text-muted"><span class="cell-truncate-1">${escapeHtml(acc.email)}</span></td>
                    <td>${roleBadgeHtml(acc)}</td>
                    <td>${statusBadgeHtml(acc)}</td>
                    <td class="text-muted">${escapeHtml(acc.date_created)}</td>
                    <td class="text-muted">${escapeHtml(acc.last_login)}</td>
                    <td>${actionsHtml(acc)}</td>
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
            if (debounceTimer) clearTimeout(debounceTimer);
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
                    updateMetrics(result.metrics);
                } else {
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="8" class="text-muted table-empty-message">
                                Could not load accounts. Please try again.
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

        // feat/archive-accounts: lets admin-account-actions.js reload the
        // table (keeping the current search/filters/sort) after an
        // archive or restore. Returns a promise that resolves once the
        // new rows are in the DOM.
        window.CobraAccountsTable = { refresh: runSearch };

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
