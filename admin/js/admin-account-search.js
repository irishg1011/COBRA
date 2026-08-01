/**
 * admin-account-search.js - CobraByte Live Account Search (Task #16)
 * --------------------------------------------------------------------
 * Wires up the Account & Security search box to the backend search
 * endpoint (/admin/accounts/search?q=...) so the table updates as the
 * admin types, with no Search button and no page reload.
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

        async function runSearch(term) {
            const requestId = ++activeRequestId;

            try {
                const response = await fetch(
                    `/admin/accounts/search?q=${encodeURIComponent(term)}`,
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

        searchInput.addEventListener("input", () => {
            const term = searchInput.value; // value is never touched programmatically elsewhere

            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                runSearch(term.trim());
            }, DEBOUNCE_MS);
        });
    });
})();