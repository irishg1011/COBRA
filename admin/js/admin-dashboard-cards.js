/**
 * admin-dashboard-cards.js - clickable account cards on the Admin Dashboard
 * (feat/admin-online)
 * --------------------------------------------------------------------------
 * Each card in dashboard-live-accounts.html carries data-dash-card="<kind>".
 * Clicking it (or Enter / Space) opens #dashCardModal, filled from
 * GET /admin/dashboard/cards/<kind> - at most 10 rows - with a "View all"
 * link to the full page:
 *
 *     learners / mentors / admins  newest accounts  -> Account & Security (role)
 *     sessions                     who is online now -> Who's online
 *     logins                       today's logins    -> Login Logs (today)
 *     locked                       locked accounts   -> Account & Security (Locked)
 *
 * The cards are re-rendered every 10 s by admin-dashboard-live.js, so clicks
 * are caught on the document (event delegation). While the modal is open it
 * refreshes with the same 10 s timer (CobraLive) when its rows changed.
 * Read-only, except "Unlock now" (two clicks: arm, then confirm).
 */
(function () {
    "use strict";

    const ARM_MS = 4000;    // "Click again to unlock" stays armed this long

    const TITLES = {
        learners: "Learners",
        mentors: "Mentors",
        admins: "Admins",
        sessions: "Who's online now",
        logins: "Logins today",
        locked: "Locked accounts",
    };
    const ROLE_PLURAL = { learners: "learners", mentors: "mentors", admins: "admins" };

    document.addEventListener("DOMContentLoaded", () => {
        const modal = document.getElementById("dashCardModal");
        if (!modal) return;
        const titleEl = document.getElementById("dashCardModalTitle");
        const subEl = document.getElementById("dashCardModalSub");
        const contentEl = document.getElementById("dashCardModalContent");
        const messageEl = document.getElementById("dashCardModalMessage");
        const viewAllEl = document.getElementById("dashCardModalViewAll");
        const closeBtn = document.getElementById("dashCardModalClose");

        let currentKind = null;
        let opener = null;
        let requestId = 0;
        let armedButton = null;
        let armTimer = null;

        // ------------------------------------------------------------
        // Small HTML helpers
        // ------------------------------------------------------------
        function escapeHtml(value) {
            const div = document.createElement("div");
            div.textContent = value == null ? "" : String(value);
            return div.innerHTML;
        }

        function avatarHtml(row) {
            const img = window.CobraAvatar ? CobraAvatar.html(row.avatar_url) : '<div class="avatar-sm">👤</div>';
            return window.CobraPresence ? CobraPresence.avatar(row.acc_id, img) : img;
        }

        function nameCell(row, sub) {
            return `<td><div class="profile-cell">${avatarHtml(row)}
                <div class="dash-card-name"><strong class="cell-truncate-1">${escapeHtml(row.full_name)}</strong>
                ${sub ? `<small class="text-muted cell-truncate-1">${escapeHtml(sub)}</small>` : ""}</div></div></td>`;
        }

        function roleBadge(role) {
            const cls = role === "Admin" ? "badge-admin" : role === "Mentor" ? "badge-mentor" : role === "Learner" ? "badge-learner" : "badge-inactive";
            return `<span class="badge ${cls}">${escapeHtml(role)}</span>`;
        }

        function statusBadge(status) {
            if (status === "Locked") return '<span class="badge badge-locked">Locked</span>';
            if (status === "Active") return '<span class="badge badge-active">Active</span>';
            return `<span class="badge badge-inactive">${escapeHtml(status)}</span>`;
        }

        function stateBadge(row) {
            return `<span class="dash-state dash-state-${escapeHtml(row.state)}">${escapeHtml(row.label)}</span>`;
        }

        function table(headers, rowsHtml) {
            return `<div class="table-scroll"><table class="data-table dash-table dash-card-table">
                <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
                <tbody>${rowsHtml}</tbody></table></div>`;
        }

        function empty(text) {
            return `<p class="dash-section-empty">${escapeHtml(text)}</p>`;
        }

        function showing(n, total, noun) {
            if (!total) return `No ${noun}`;
            return n < total ? `Showing ${n} of ${total} ${noun}` : `${total} ${noun}`;
        }

        // ------------------------------------------------------------
        // One renderer per card
        // ------------------------------------------------------------
        function renderAccounts(data, kind) {
            const noun = ROLE_PLURAL[kind];
            subEl.textContent = data.total
                ? `Newest ${data.rows.length} of ${data.total} ${noun}`
                : `No ${noun} yet`;
            if (!data.rows.length) return empty(`No ${noun} yet.`);
            return table(["Name", "Status", "Created", "Last login"], data.rows.map((r) => `
                <tr>${nameCell(r, r.username)}
                    <td>${statusBadge(r.status)}</td>
                    <td class="text-muted dash-nowrap">${escapeHtml(r.date_created)}</td>
                    <td class="text-muted dash-nowrap">${escapeHtml(r.last_login)}</td></tr>`).join(""));
        }

        function deviceList(devices) {
            return (devices || []).map((d) =>
                `<span class="dash-device" title="IP ${escapeHtml(d.ip_address)} · active ${escapeHtml(d.last_activity)}">
                    <i class="fa-solid ${d.mobile ? "fa-mobile-screen" : "fa-desktop"}" aria-hidden="true"></i>${escapeHtml(d.label)}</span>`
            ).join("");
        }

        function renderSessions(data) {
            const c = data.counts || {};
            subEl.textContent = `${c.online || 0} online · ${c.idle || 0} idle · ${c.signed_in || 0} signed in`;
            if (!data.rows.length) return empty("Nobody is signed in right now.");
            return table(["Name", "Status", "Logged in since", "Last activity", "Device"], data.rows.map((r) => `
                <tr>${nameCell(r, r.role)}
                    <td>${stateBadge(r)}</td>
                    <td class="text-muted dash-nowrap" title="Signed in for ${escapeHtml(r.logged_in_for)}">${escapeHtml(r.logged_in_since)}</td>
                    <td class="text-muted dash-nowrap">${escapeHtml(r.last_activity)}</td>
                    <td class="dash-devices">${deviceList(r.devices)}</td></tr>`).join(""))
                + (data.total > data.rows.length ? `<p class="dash-card-more text-muted">${showing(data.rows.length, data.total, "people signed in")}</p>` : "");
        }

        function renderLogins(data) {
            const c = data.counts || {};
            subEl.innerHTML = `<span class="dash-good">${escapeHtml(c.successful || 0)} successful</span> · ` +
                `<span class="dash-bad">${escapeHtml(c.failed || 0)} failed</span> · ${escapeHtml(showing(data.rows.length, data.total, "attempts"))}`;
            if (!data.rows.length) return empty("No login attempts today yet.");
            return table(["Name", "Role", "Result", "Time", "IP"], data.rows.map((r) => {
                const result = r.status === "Success"
                    ? '<span class="badge badge-success-log">Success</span>'
                    : `<span class="badge badge-failed-log">${escapeHtml(r.status || "Failed")}</span>`;
                return `<tr>${nameCell(r, r.email !== "—" ? r.email : "")}
                    <td>${roleBadge(r.role)}</td>
                    <td>${result}</td>
                    <td class="text-muted dash-nowrap">${escapeHtml(r.attempted_at)}</td>
                    <td class="text-muted">${escapeHtml(r.ip_address)}</td></tr>`;
            }).join(""));
        }

        function renderLocked(data) {
            subEl.textContent = `${data.total} locked right now · ${data.today_total} locked out today`;
            let html = '<h4 class="dash-card-subtitle">Locked right now</h4>';
            html += data.rows.length
                ? table(["Name", "Role", "Failed tries", "Locked until", ""], data.rows.map((r) => `
                    <tr data-locked-row="${escapeHtml(r.acc_id)}">${nameCell(r, "")}
                        <td>${roleBadge(r.role)}</td>
                        <td>${escapeHtml(r.failed_attempts)}</td>
                        <td class="dash-nowrap">${escapeHtml(r.locked_until)}<small class="text-muted dash-block">${escapeHtml(r.time_left)}</small></td>
                        <td class="text-right"><button type="button" class="btn-pill-light dash-unlock-btn js-dash-unlock"
                            data-acc-id="${escapeHtml(r.acc_id)}" data-name="${escapeHtml(r.full_name)}">
                            <i class="fa-solid fa-lock-open" aria-hidden="true"></i> Unlock now</button></td></tr>`).join(""))
                : empty("No account is locked right now. Locks end by themselves after 1 minute.");

            html += '<h4 class="dash-card-subtitle">Locked out today</h4>';
            html += data.today.length
                ? table(["Name", "Role", "Times", "Last locked", "Now"], data.today.map((r) => `
                    <tr>${nameCell(r, "")}
                        <td>${roleBadge(r.role)}</td>
                        <td>${escapeHtml(r.times)}</td>
                        <td class="text-muted dash-nowrap">${escapeHtml(r.last_locked_at)}</td>
                        <td>${r.is_locked ? '<span class="badge badge-locked">Locked</span>' : '<span class="badge badge-active">Unlocked</span>'}</td></tr>`).join(""))
                : empty("Nobody was locked out today.");
            return html;
        }

        function render(kind, data) {
            titleEl.textContent = TITLES[kind];
            if (kind === "sessions") return renderSessions(data);
            if (kind === "logins") return renderLogins(data);
            if (kind === "locked") return renderLocked(data);
            return renderAccounts(data, kind);
        }

        // ------------------------------------------------------------
        // Load / open / close
        // ------------------------------------------------------------
        async function load(kind, { quiet = false } = {}) {
            const id = ++requestId;
            if (!quiet) {
                contentEl.innerHTML = '<p class="dash-section-empty">Loading&hellip;</p>';
                subEl.textContent = "";
            }
            try {
                const response = await fetch(`/admin/dashboard/cards/${encodeURIComponent(kind)}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                if (id !== requestId || currentKind !== kind) return;
                if (!response.ok || !data.success) {
                    if (!quiet) contentEl.innerHTML = empty(data.message || "Couldn't load this list right now.");
                    return;
                }
                if (window.CobraLive && !CobraLive.changed(`dash-card-${kind}`, data) && quiet) return;
                viewAllEl.href = data.view_all;
                contentEl.innerHTML = render(kind, data);
            } catch (err) {
                if (id === requestId && !quiet) contentEl.innerHTML = empty("Could not reach the server.");
            }
        }

        function open(kind, fromEl) {
            if (!TITLES[kind]) return;
            currentKind = kind;
            opener = fromEl || null;
            titleEl.textContent = TITLES[kind];
            messageEl.textContent = "";
            messageEl.className = "dash-card-modal-message";
            viewAllEl.href = "#";
            if (window.CobraLive) CobraLive.changed(`dash-card-${kind}`, null);   // forget the last answer
            modal.classList.remove("is-hidden");
            closeBtn.focus();
            load(kind);
        }

        function close() {
            if (modal.classList.contains("is-hidden")) return;
            modal.classList.add("is-hidden");
            currentKind = null;
            disarm();
            if (opener && document.contains(opener)) opener.focus();
            else {
                // The cards were re-rendered meanwhile - focus the same card again.
                const kind = opener && opener.dataset.dashCard;
                const again = kind && document.querySelector(`[data-dash-card="${kind}"]`);
                if (again) again.focus();
            }
            opener = null;
        }

        document.addEventListener("click", (e) => {
            const card = e.target.closest("[data-dash-card]");
            if (card) open(card.dataset.dashCard, card);
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !modal.classList.contains("is-hidden")) {
                e.preventDefault();
                close();
                return;
            }
            const card = e.target.closest && e.target.closest("[data-dash-card]");
            if (card && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                open(card.dataset.dashCard, card);
            }
        });
        closeBtn.addEventListener("click", close);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) close();
        });

        // ------------------------------------------------------------
        // "Unlock now": first click arms the button, second click unlocks
        // ------------------------------------------------------------
        function disarm() {
            clearTimeout(armTimer);
            if (armedButton && document.contains(armedButton)) {
                armedButton.classList.remove("is-armed");
                armedButton.innerHTML = '<i class="fa-solid fa-lock-open" aria-hidden="true"></i> Unlock now';
            }
            armedButton = null;
        }

        function showMessage(text, ok) {
            messageEl.textContent = text;
            messageEl.className = `dash-card-modal-message is-visible ${ok ? "is-ok" : "is-error"}`;
        }

        contentEl.addEventListener("click", async (e) => {
            const btn = e.target.closest(".js-dash-unlock");
            if (!btn || btn.disabled) return;
            if (armedButton !== btn) {
                disarm();
                armedButton = btn;
                btn.classList.add("is-armed");
                btn.textContent = "Click again to unlock";
                armTimer = setTimeout(disarm, ARM_MS);
                return;
            }
            clearTimeout(armTimer);
            armedButton = null;
            btn.disabled = true;
            btn.textContent = "Unlocking…";
            try {
                const response = await fetch(`/admin/accounts/${encodeURIComponent(btn.dataset.accId)}/unlock`, {
                    method: "POST",
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                showMessage(data.message || (data.success ? "Unlocked." : "Could not unlock the account."), !!data.success);
            } catch (err) {
                showMessage("Could not reach the server.", false);
            }
            if (currentKind) load(currentKind, { quiet: true });
        });

        // Same 10 s beat as the rest of the Dashboard, only while open.
        if (window.CobraLive) {
            CobraLive.every("dashboard-card-modal", async () => {
                if (!currentKind || armedButton) return;
                await load(currentKind, { quiet: true });
            });
        }
    });
})();
