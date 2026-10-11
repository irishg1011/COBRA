/**
 * admin-online-users.js - Who's Online page (feat/admin-online)
 * --------------------------------------------------------------------------
 * Search / Role / Status filters re-ask /admin/online/data with no page
 * reload, and the shared 10 s timer (admin-live-refresh.js) keeps the cards
 * and the table fresh with the filters that are on screen. Rows are only
 * rewritten when they changed. Read-only.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;
    const ROLE_BADGE = { Admin: "badge-admin", Mentor: "badge-mentor", Learner: "badge-learner" };

    document.addEventListener("DOMContentLoaded", () => {
        const searchInput = document.getElementById("onlineSearchInput");
        const roleSelect = document.getElementById("onlineRoleSelect");
        const stateSelect = document.getElementById("onlineStateSelect");
        const tableBody = document.getElementById("onlineTableBody");
        const showingCount = document.getElementById("onlineShowingCount");
        if (!searchInput || !tableBody) return;

        let debounceTimer = null;
        let activeRequestId = 0;

        function escapeHtml(value) {
            const div = document.createElement("div");
            div.textContent = value == null ? "" : String(value);
            return div.innerHTML;
        }

        function params() {
            const p = new URLSearchParams();
            const term = searchInput.value.trim();
            if (term) p.set("q", term);
            if (roleSelect.value) p.set("role", roleSelect.value);
            if (stateSelect.value) p.set("state", stateSelect.value);
            return p;
        }

        function rowHtml(u) {
            const img = window.CobraAvatar ? CobraAvatar.html(u.avatar_url) : '<div class="avatar-sm">👤</div>';
            const devices = (u.devices || []).map((d) =>
                `<span class="dash-device" title="IP ${escapeHtml(d.ip_address)} · active ${escapeHtml(d.last_activity)}"><i class="fa-solid ${d.mobile ? "fa-mobile-screen" : "fa-desktop"}" aria-hidden="true"></i>${escapeHtml(d.label)}</span>`
            ).join("");
            return `
                <tr data-acc-id="${escapeHtml(u.acc_id)}">
                    <td class="profile-cell">
                        ${window.CobraPresence ? CobraPresence.avatar(u.acc_id, img) : img}
                        <div class="dash-card-name">
                            <strong class="cell-truncate-1">${escapeHtml(u.full_name)}</strong>
                            <small class="text-muted cell-truncate-1">${escapeHtml(u.email)}</small>
                        </div>
                    </td>
                    <td><span class="badge ${ROLE_BADGE[u.role] || "badge-inactive"}">${escapeHtml(u.role)}</span></td>
                    <td><span class="dash-state dash-state-${escapeHtml(u.state)}">${escapeHtml(u.label)}</span></td>
                    <td class="text-muted dash-nowrap" title="Signed in for ${escapeHtml(u.logged_in_for)}">${escapeHtml(u.logged_in_since)}</td>
                    <td class="text-muted dash-nowrap">${escapeHtml(u.last_activity)}</td>
                    <td class="dash-devices">${devices}</td>
                </tr>`;
        }

        function message(text) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">${escapeHtml(text)}</td></tr>`;
        }

        function renderRows(users, total) {
            if (!users.length) message("Nobody matching is signed in right now.");
            else tableBody.innerHTML = users.map(rowHtml).join("");
            if (showingCount) showingCount.textContent = `Showing ${total} signed-in account${total === 1 ? "" : "s"}`;
            if (window.CobraPresence) CobraPresence.refresh();
        }

        function renderCounts(counts) {
            document.querySelectorAll("[data-online-count]").forEach((el) => {
                const value = counts ? counts[el.dataset.onlineCount] : undefined;
                if (value === undefined) return;
                if (window.CobraLive) CobraLive.setText(el, value);
                else el.textContent = value;
            });
        }

        async function fetchData() {
            const response = await fetch(`/admin/online/data?${params().toString()}`, {
                headers: { "X-Requested-With": "XMLHttpRequest" },
                credentials: "include",
            });
            return response.json();
        }

        async function runSearch() {
            const id = ++activeRequestId;
            try {
                const data = await fetchData();
                if (id !== activeRequestId) return;
                if (!data.success) {
                    message("Could not load who is online. Please try again.");
                    return;
                }
                renderCounts(data.counts);
                renderRows(data.users, data.total);
                if (window.CobraLive) CobraLive.changed("online-rows", data.users);
            } catch (err) {
                if (id === activeRequestId) message("Could not reach the server.");
            }
        }

        function scheduleSearch() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(runSearch, DEBOUNCE_MS);
        }

        searchInput.addEventListener("input", scheduleSearch);
        roleSelect.addEventListener("change", scheduleSearch);
        stateSelect.addEventListener("change", scheduleSearch);

        if (window.CobraLive) {
            CobraLive.every("online-users", async () => {
                const startedAt = activeRequestId;
                const data = await fetchData();
                if (!data.success || startedAt !== activeRequestId) return;
                renderCounts(data.counts);
                if (CobraLive.changed("online-rows", data.users)) renderRows(data.users, data.total);
            });
        }
    });
})();
