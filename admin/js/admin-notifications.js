/**
 * admin-notifications.js - the admin bell in the staff header
 * --------------------------------------------------------------------
 * feat/admin-bell   (loaded from admin-header.html; the bell is only in
 * the page for admins - mentors have no notifications)
 *
 *   GET  /admin/notifications?filter=all|unread&before_id=&limit=
 *   GET  /admin/notifications/count        (checked every minute)
 *   POST /admin/notifications/<id>/read
 *   POST /admin/notifications/read-all
 *
 * The red number on the bell is the unread count. Opening the bell
 * lists the notifications (New / Earlier), with All / Unread tabs and
 * "Mark all as read". Clicking one marks it read and opens its page
 * (the login logs, the account, the learner's progress).
 * Same look and behavior as the learner bell (learner.js).
 */
(function () {
    "use strict";

    const BASE_URL = "/admin/notifications";
    const POLL_MS = 60 * 1000;
    const PAGE_SIZE = 12;
    const TYPES = {
        lockout:     { icon: "fa-lock",           tone: "red" },
        signup:      { icon: "fa-user-plus",      tone: "green" },
        course_done: { icon: "fa-graduation-cap", tone: "gold" },
    };
    const DEFAULT_TYPE = { icon: "fa-bell", tone: "teal" };

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML.replace(/"/g, "&quot;");
    }

    // **bold** in a title -> <strong>, after everything else is escaped
    function rich(text) {
        return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    }

    function init() {
        const bellBtn = document.getElementById("staffNotifBtn");
        const panel = document.getElementById("staffNotifPanel");
        if (!bellBtn || !panel) return;   // mentors: no bell on the page

        const countEl = document.getElementById("staffNotifCount");
        const statusEl = document.getElementById("staffNotifStatus");
        const listEl = document.getElementById("staffNotifList");
        const olderBtn = document.getElementById("staffNotifOlderBtn");
        const readAllBtn = document.getElementById("staffNotifReadAllBtn");
        const tabs = Array.from(panel.querySelectorAll(".staff-notif-tab"));

        let filter = "all";
        let loaded = [];
        let requestId = 0;

        function setCount(count) {
            const n = Number(count) || 0;
            countEl.hidden = n <= 0;
            countEl.textContent = n > 99 ? "99+" : String(n);
            bellBtn.setAttribute("aria-label", n > 0 ? `Notifications, ${n} unread` : "Notifications");
            readAllBtn.disabled = n <= 0;
        }

        async function request(path, method) {
            const response = await fetch(`${BASE_URL}${path}`, {
                method: method || "GET",
                headers: { "X-Requested-With": "XMLHttpRequest" },
                credentials: "include",
                keepalive: method === "POST",   // a "read" still lands when the click navigates away
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        }

        function itemHtml(n) {
            const type = TYPES[n.type] || DEFAULT_TYPE;
            const tag = n.link ? "a" : "button";
            const attrs = n.link ? ` href="${escapeHtml(n.link)}"` : ' type="button"';
            return `
                <${tag}${attrs} class="staff-notif-item${n.is_read ? "" : " is-unread"}" data-id="${escapeHtml(n.id)}">
                    <span class="staff-notif-avatar staff-tone-${type.tone}" aria-hidden="true"><i class="fa-solid ${type.icon}"></i></span>
                    <span class="staff-notif-body">
                        <span class="staff-notif-title">${rich(n.title)}</span>
                        ${n.detail ? `<span class="staff-notif-detail">${rich(n.detail)}</span>` : ""}
                        <span class="staff-notif-time" title="${escapeHtml(n.when)}">${escapeHtml(n.relative)} &middot; ${escapeHtml(n.when)}</span>
                    </span>
                    <span class="staff-notif-dot"${n.is_read ? "" : ' aria-label="Unread"'}></span>
                </${tag}>`;
        }

        function renderList() {
            if (!loaded.length) {
                listEl.innerHTML = "";
                statusEl.textContent = filter === "unread" ? "You have no unread notifications." : "No notifications yet.";
                statusEl.hidden = false;
                return;
            }
            statusEl.hidden = true;
            const fresh = loaded.filter((n) => n.is_today);
            const earlier = loaded.filter((n) => !n.is_today);
            let html = "";
            if (fresh.length) html += `<h3 class="staff-notif-section">New</h3>${fresh.map(itemHtml).join("")}`;
            if (earlier.length) html += `<h3 class="staff-notif-section">Earlier</h3>${earlier.map(itemHtml).join("")}`;
            listEl.innerHTML = html;
        }

        async function load(more) {
            const thisRequest = ++requestId;
            const params = new URLSearchParams({ filter, limit: String(PAGE_SIZE) });
            if (more && loaded.length) params.set("before_id", String(loaded[loaded.length - 1].id));
            if (!more) {
                statusEl.textContent = "Loading...";
                statusEl.hidden = false;
            }
            try {
                const data = await request(`?${params.toString()}`);
                if (thisRequest !== requestId) return;
                loaded = more ? loaded.concat(data.items || []) : (data.items || []);
                setCount(data.unread_count);
                olderBtn.hidden = !data.has_more;
                renderList();
            } catch (err) {
                if (thisRequest !== requestId) return;
                console.error("admin-notifications: failed to load:", err);
                if (!more) listEl.innerHTML = "";
                statusEl.textContent = "Could not load notifications. Please try again.";
                statusEl.hidden = false;
            }
        }

        async function pollCount() {
            if (document.hidden) return;
            try {
                const data = await request("/count");
                setCount(data.unread_count);
            } catch (err) {
                /* a missed check is fine - the next one will catch up */
            }
        }

        function openPanel() {
            panel.hidden = false;
            bellBtn.setAttribute("aria-expanded", "true");
            load(false);
        }

        function closePanel(returnFocus) {
            if (panel.hidden) return;
            panel.hidden = true;
            bellBtn.setAttribute("aria-expanded", "false");
            if (returnFocus) bellBtn.focus();
        }

        bellBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (panel.hidden) openPanel(); else closePanel(false);
        });
        panel.addEventListener("click", (e) => e.stopPropagation());
        document.addEventListener("click", () => closePanel(false));
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !panel.hidden) closePanel(true);
        });

        tabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                filter = tab.dataset.filter === "unread" ? "unread" : "all";
                tabs.forEach((t) => {
                    const active = t === tab;
                    t.classList.toggle("is-active", active);
                    t.setAttribute("aria-selected", active ? "true" : "false");
                });
                load(false);
            });
        });

        olderBtn.addEventListener("click", () => load(true));

        readAllBtn.addEventListener("click", async () => {
            try {
                const data = await request("/read-all", "POST");
                setCount(data.unread_count);
                loaded.forEach((n) => { n.is_read = true; });
                if (filter === "unread") loaded = [];
                renderList();
            } catch (err) {
                console.error("admin-notifications: mark all read failed:", err);
            }
        });

        // Clicking a notification marks it read, then follows its link.
        listEl.addEventListener("click", async (e) => {
            const el = e.target.closest(".staff-notif-item");
            if (!el) return;
            const note = loaded.find((n) => String(n.id) === el.dataset.id);
            if (!note) return;
            const href = el.getAttribute("href");
            if (href) e.preventDefault();

            if (!note.is_read) {
                try {
                    const data = await request(`/${encodeURIComponent(note.id)}/read`, "POST");
                    note.is_read = true;
                    setCount(data.unread_count);
                } catch (err) {
                    console.error("admin-notifications: mark read failed:", err);
                }
            }
            if (href) {
                window.location.href = href;
            } else {
                el.classList.remove("is-unread");
            }
        });

        pollCount();
        setInterval(pollCount, POLL_MS);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();