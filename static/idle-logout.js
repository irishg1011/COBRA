/**
 * idle-logout.js - log out after a period of no real activity
 * --------------------------------------------------------------------
 * Learners: 1 hour, staff (Admin / Mentor): 2 hours - the server sends
 * the limit (/session/idle-info, see server/idle_logout.py).
 *
 * Real activity = clicking, typing, scrolling, moving the mouse,
 * touching the screen, or a lesson video playing (lesson-content.js
 * calls window.cobraIdle.markActive()). Background calls never count.
 * The last activity time is shared by every tab of this browser
 * (localStorage), so using one tab keeps the others signed in too.
 *
 * 60 seconds before the limit a box asks "Stay logged in?". If nobody
 * answers, this device's session ends (POST /session/idle-logout) and
 * the login page says why. The server also checks on its own, so a
 * closed tab or a sleeping laptop is logged out as well.
 *
 * Loaded by learner.js and admin-script.js (every signed-in page).
 */
(function () {
    "use strict";
    if (window.cobraIdle) return;

    const STORAGE_KEY = "cobraLastActive";
    const PING_EVERY_MS = 60 * 1000;
    const CHECK_EVERY_MS = 5 * 1000;
    const MOVE_THROTTLE_MS = 5 * 1000;

    let limitMs = 0;
    let warnMs = 60 * 1000;
    let loginUrl = "/login";
    let role = "learner";
    let lastPingAt = 0;
    let lastSeenLocal = Date.now();
    let lastMoveAt = 0;
    let loggingOut = false;
    let modal = null;
    let countdownEl = null;

    function readShared() {
        try {
            const value = Number(window.localStorage.getItem(STORAGE_KEY));
            return Number.isFinite(value) ? value : 0;
        } catch (e) {
            return 0;
        }
    }

    function lastActive() {
        return Math.max(lastSeenLocal, readShared());
    }

    function markActive() {
        if (loggingOut) return;
        const now = Date.now();
        lastSeenLocal = now;
        try { window.localStorage.setItem(STORAGE_KEY, String(now)); } catch (e) { /* private mode */ }
        if (now - lastPingAt >= PING_EVERY_MS) ping();
        if (modal && !modal.hidden) hideWarning();
    }

    function ping() {
        lastPingAt = Date.now();
        fetch("/session/activity", { method: "POST", credentials: "same-origin" }).catch(() => {});
    }

    function onMove() {
        const now = Date.now();
        if (now - lastMoveAt < MOVE_THROTTLE_MS) return;
        lastMoveAt = now;
        markActive();
    }

    function buildWarning() {
        const style = document.createElement("style");
        style.textContent = `
.cobra-idle-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;
  background:rgba(15,23,42,.55);padding:16px;font-family:inherit}
.cobra-idle-overlay[hidden]{display:none}
.cobra-idle-card{background:#fff;border-radius:16px;max-width:400px;width:100%;padding:24px;text-align:center;
  box-shadow:0 20px 50px rgba(15,23,42,.3)}
.cobra-idle-card h3{margin:0 0 8px;font-size:1.15rem;color:#0f172a}
.cobra-idle-card p{margin:0 0 6px;color:#475569;font-size:.92rem;line-height:1.45}
.cobra-idle-count{font-size:2rem;font-weight:700;color:#dc2626;margin:10px 0 14px}
.cobra-idle-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.cobra-idle-actions button{border:0;border-radius:999px;padding:10px 20px;font:inherit;font-weight:600;cursor:pointer}
.cobra-idle-stay{background:linear-gradient(90deg,#0ea5e9,#22c55e);color:#fff}
.cobra-idle-out{background:#f1f5f9;color:#334155}`;
        document.head.appendChild(style);

        modal = document.createElement("div");
        modal.className = "cobra-idle-overlay";
        modal.hidden = true;
        modal.setAttribute("role", "alertdialog");
        modal.setAttribute("aria-modal", "true");
        const staffNote = role === "staff"
            ? "<p>Unsaved changes will be lost - click Stay logged in, then save your work.</p>" : "";
        modal.innerHTML = `
<div class="cobra-idle-card">
  <h3>Are you still there?</h3>
  <p>You'll be logged out soon because you haven't been active for a while.</p>
  ${staffNote}
  <div class="cobra-idle-count" aria-live="polite"></div>
  <div class="cobra-idle-actions">
    <button type="button" class="cobra-idle-out">Log out now</button>
    <button type="button" class="cobra-idle-stay">Stay logged in</button>
  </div>
</div>`;
        countdownEl = modal.querySelector(".cobra-idle-count");
        modal.querySelector(".cobra-idle-stay").addEventListener("click", () => {
            lastPingAt = 0;   // tell the server right away
            markActive();
        });
        modal.querySelector(".cobra-idle-out").addEventListener("click", logOut);
        document.body.appendChild(modal);
    }

    function showWarning(secondsLeft) {
        if (!modal) buildWarning();
        countdownEl.textContent = `${Math.max(0, secondsLeft)}s`;
        if (modal.hidden) {
            modal.hidden = false;
            const stay = modal.querySelector(".cobra-idle-stay");
            if (stay) stay.focus();
        }
    }

    function hideWarning() {
        if (modal) modal.hidden = true;
    }

    const LOGOUT_KEY = "cobraIdleLoggedOut";

    function goToLogin() {
        window.location.href = `${loginUrl}?reason=idle`;
    }

    async function logOut() {
        if (loggingOut) return;
        loggingOut = true;
        try {
            await fetch("/session/idle-logout", { method: "POST", credentials: "same-origin" });
        } catch (e) { /* the server ends it on the next request anyway */ }
        // Every other tab of this browser shares the session - send them to
        // the login page too, only now that it has really ended (a request
        // sent earlier could otherwise save the old session cookie again).
        try { window.localStorage.setItem(LOGOUT_KEY, String(Date.now())); } catch (e) { /* ignore */ }
        // An editor with unsaved changes still shows its own "leave?" prompt.
        goToLogin();
    }

    function check() {
        if (!limitMs || loggingOut) return;
        const idle = Date.now() - lastActive();
        if (idle >= limitMs) {
            logOut();
        } else if (idle >= limitMs - warnMs) {
            showWarning(Math.ceil((limitMs - idle) / 1000));
        } else {
            hideWarning();
        }
    }

    async function start() {
        let info;
        try {
            info = await (await fetch("/session/idle-info", { credentials: "same-origin" })).json();
        } catch (e) {
            return;
        }
        if (!info || !info.logged_in) return;
        limitMs = info.limit_seconds * 1000;
        warnMs = Math.min(info.warning_seconds * 1000, limitMs / 2);
        loginUrl = info.login_url || loginUrl;
        role = info.role || role;

        // Opening this page counts as activity (the server already noted it).
        lastPingAt = Date.now();
        lastSeenLocal = Date.now();
        try { window.localStorage.setItem(STORAGE_KEY, String(lastSeenLocal)); } catch (e) { /* ignore */ }

        ["click", "keydown", "scroll", "wheel", "touchstart", "pointerdown", "input"].forEach((type) =>
            window.addEventListener(type, markActive, { passive: true, capture: true }));
        window.addEventListener("mousemove", onMove, { passive: true });
        // Another tab was used -> close this tab's warning too.
        window.addEventListener("storage", (e) => {
            if (e.key === STORAGE_KEY) check();
            if (e.key === LOGOUT_KEY && e.newValue && !loggingOut) {
                loggingOut = true;
                goToLogin();
            }
        });
        document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
        setInterval(check, CHECK_EVERY_MS);
    }

    window.cobraIdle = { markActive };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
