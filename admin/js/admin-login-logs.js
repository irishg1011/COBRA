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
        const showingCount = document.getElementById("logsShowingCount");
        // Attempted At range (same date-range control as Learner Progress / Coding Sandbox)
        const dateFromInput = document.getElementById("logDateFromInput");
        const dateToInput = document.getElementById("logDateToInput");
        const clearDateBtn = document.getElementById("clearLogDateBtn");
        const dateFilterError = document.getElementById("logDateFilterError");
        // Pagination
        const pageLabel = document.getElementById("logsPageLabel");
        const prevBtn = document.getElementById("logsPrevBtn");
        const nextBtn = document.getElementById("logsNextBtn");

        if (!tableBody) return;

        // Read from the server-rendered page, never assumed.
        let currentPage = parseInt(tableBody.dataset.page || "1", 10);
        let totalPages = parseInt(tableBody.dataset.totalPages || "1", 10);
        let debounceTimer = null;
        let activeRequestId = 0; // guards against out-of-order responses

        // ------------------------------------------------------------
        // Task: Dynamic Login Logs metric cards
        // ------------------------------------------------------------
        // The 6 metric cards are already rendered server-side on page
        // load (see admin_routes.py: login_logs() -> get_login_logs_metrics()),
        // so this doesn't need to fetch anything just to show a first
        // value. It refreshes them afterward (and periodically) so the
        // cards stay in sync with login attempts, account status
        // changes, lockouts, and password resets that happen while the
        // page is open - without requiring a manual page reload.
        const METRICS_ENDPOINT = "/admin/login-logs/metrics";
        // Refreshed every 10 s by the shared admin-live-refresh.js (below).

        const metricElements = {
            total_logins_today: document.getElementById("metric-total-logins-today"),
            successful_logins: document.getElementById("metric-successful-logins"),
            failed_logins: document.getElementById("metric-failed-logins"),
            active_sessions: document.getElementById("metric-active-sessions"),
            locked_out_fails: document.getElementById("metric-locked-out-fails"),
            password_resets_today: document.getElementById("metric-password-resets-today"),
        };

        async function loadMetrics() {
            try {
                const response = await fetch(METRICS_ENDPOINT, { credentials: "include" });
                const result = await response.json();

                if (!result.success || !result.metrics) {
                    console.error("admin-login-logs: metrics endpoint reported failure:", result.message);
                    return;
                }

                Object.keys(metricElements).forEach((key) => {
                    const el = metricElements[key];
                    if (!el) return;
                    const value = result.metrics[key];
                    // Gracefully fall back to 0 rather than showing
                    // "undefined"/blank if a key is ever missing. Only
                    // written when it changed.
                    const text = (value === null || value === undefined) ? "0" : value;
                    if (window.CobraLive) CobraLive.setText(el, text);
                    else el.textContent = text;
                });
            } catch (err) {
                // Best-effort: leave whatever values are currently on
                // screen (server-rendered on page load, or the last
                // successful refresh) rather than blanking the cards.
                console.error("admin-login-logs: failed to refresh metrics:", err);
            }
        }

        // Refresh once immediately (covers activity that happened
        // between the server render and the page finishing load); after
        // that the shared live refresh keeps the cards (and the table) up
        // to date - see the CobraLive.every() call at the end.
        loadMetrics();

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function roleBadgeHtml(log) {
            if (log.role === "Admin") {
                return '<span class="badge badge-admin">Admin</span>';
            }
            if (log.role === "Mentor") {
                return '<span class="badge badge-mentor">Mentor</span>';
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
                        ${window.CobraAvatar.html(log.avatar_url)}
                        <strong class="cell-truncate-1">${escapeHtml(log.full_name)}</strong>
                    </td>
                    <td class="text-muted">${escapeHtml(log.acc_id)}</td>
                    <td class="text-muted">${escapeHtml(log.ip_address)}</td>
                    <td>${roleBadgeHtml(log)}</td>
                    <td>${statusBadgeHtml(log)}</td>
                    <td class="text-right text-muted">${escapeHtml(log.attempted_at)}</td>
                </tr>
            `).join("");

        }

        // Only writes when the text changed (live refresh calls this every 10 s).
        function setText(el, text) {
            if (el && el.textContent !== text) el.textContent = text;
        }

        // Footer: "Showing 10 of 57 logs" + "2 of 6" + Prev / Next.
        function updatePagination(countOnPage, total, page, pages) {
            currentPage = page;
            totalPages = pages;
            if (tableBody.dataset.page !== String(page)) tableBody.dataset.page = String(page);
            if (tableBody.dataset.totalPages !== String(pages)) tableBody.dataset.totalPages = String(pages);
            setText(showingCount, `Showing ${countOnPage} of ${total} log${total !== 1 ? "s" : ""}`);
            setText(pageLabel, `${page} of ${pages}`);
            if (prevBtn && prevBtn.disabled !== (page <= 1)) prevBtn.disabled = page <= 1;
            if (nextBtn && nextBtn.disabled !== (page >= pages)) nextBtn.disabled = page >= pages;
        }

        function showDateError(message) {
            if (!dateFilterError) return;
            dateFilterError.textContent = message;
            dateFilterError.classList.add("is-visible");
        }

        function clearDateError() {
            if (!dateFilterError) return;
            dateFilterError.textContent = "";
            dateFilterError.classList.remove("is-visible");
        }

        function validateDates() {
            clearDateError();
            const from = dateFromInput ? dateFromInput.value : "";
            const to = dateToInput ? dateToInput.value : "";
            if (from && to && from > to) {
                showDateError("Attempted At: the end date must be on or after the start date.");
                return false;
            }
            return true;
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

            if (dateFromInput && dateFromInput.value) params.set("from", dateFromInput.value);
            if (dateToInput && dateToInput.value) params.set("to", dateToInput.value);
            params.set("page", String(currentPage));

            return params;
        }

        async function runFetch() {
            if (!validateDates()) return;
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
                    if (window.CobraLive) CobraLive.changed("login-logs-rows", result.logs);
                    updatePagination(result.logs.length, result.total, result.page, result.total_pages);
                    // Cheap extra freshness: a search/filter round-trip is
                    // a natural moment to also re-sync the metric cards.
                    loadMetrics();
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

        // Any filter change starts again from page 1; Prev / Next keep the filters.
        function scheduleFetch(resetPage = true) {
            if (resetPage) currentPage = 1;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runFetch, DEBOUNCE_MS);
        }

        // Live search: debounced so it doesn't fire a request on every
        // single keystroke.
        if (searchInput) searchInput.addEventListener("input", () => scheduleFetch());

        // Role / Status / Sort - each change re-runs the same combined
        // fetch, preserving whatever is currently in the search box and
        // in the other dropdowns rather than resetting anything.
        [roleSelect, statusSelect, sortSelect].forEach((select) => {
            if (!select) return;
            select.addEventListener("change", () => scheduleFetch());
        });

        [dateFromInput, dateToInput].forEach((input) => {
            if (input) input.addEventListener("change", () => scheduleFetch());
        });
        if (clearDateBtn) {
            clearDateBtn.addEventListener("click", () => {
                if (dateFromInput) dateFromInput.value = "";
                if (dateToInput) dateToInput.value = "";
                clearDateError();
                scheduleFetch();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) { currentPage--; scheduleFetch(false); }
            });
        }

        // Live refresh (admin-live-refresh.js): the six cards always; the
        // current page of the table (same search / filters / sort / page)
        // only when its rows changed, no modal is open and the admin didn't
        // start a new search meanwhile.
        if (window.CobraLive) {
            CobraLive.every("login-logs", async ({ modalOpen }) => {
                await loadMetrics();
                if (modalOpen || !validateDates()) return;
                const startedAt = activeRequestId;
                const response = await fetch(`/admin/login-logs/data?${buildQueryParams().toString()}`, { credentials: "include" });
                const result = await response.json();
                if (!result.success || startedAt !== activeRequestId) return;
                if (CobraLive.changed("login-logs-rows", result.logs)) renderRows(result.logs);
                updatePagination(result.logs.length, result.total, result.page, result.total_pages);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (currentPage < totalPages) { currentPage++; scheduleFetch(false); }
            });
        }
    });
})();
