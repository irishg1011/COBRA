/**
 * admin-auth-guard.js - CobraByte Admin Page Guard
 * ------------------------------------------------
 * Include this on every rendered admin page (Dashboard, Account & Security,
 * etc.) - right before the closing </body> tag:
 *
 *      <script src="{{ url_for('admin_bp.static', filename='js/admin-auth-guard.js') }}"></script>
 *
 * WHY THIS EXISTS
 * The Admin side is served by Flask on a different origin/port than the
 * Learner-facing frontend (e.g. Flask on :5000 vs. the frontend on :5500).
 * sessionStorage does NOT carry across origins, so the "isAuthenticated"
 * flag set by script.js on the frontend when an Admin logs in is invisible
 * here. Without a guard of its own, pressing Back on an admin page falls
 * straight through to whatever the browser's normal history has - which is
 * usually the Login page, and if THAT page's "already logged in, skip
 * straight to a dashboard" check isn't role-aware, it can bounce the admin
 * onto the Learner dashboard instead. This file gives the admin side the
 * same kind of Back-button trap the Learner Dashboard already has.
 *
 * PER-PAGE BACK-BUTTON MODE
 * Add data-auth-guard-mode="refresh" to a page's <body> tag to make the
 * Back button just silently reload that page (used on the main Admin
 * Dashboard, so Back never surfaces Login or the Learner dashboard):
 *
 *      <body data-auth-guard-mode="refresh"> ... Dashboard markup ... </body>
 *
 * Leave the attribute off (the default) for other admin pages (e.g.
 * Account & Security), where Back should ask "Are you sure you want to
 * log out?" instead.
 *
 * IMPORTANT CAVEAT
 * Same caveat as the Learner-side guard: there is currently no real
 * server-side session/cookie check on the admin_bp routes. Reaching this
 * page through Flask is treated as sufficient proof of a valid admin
 * session for the purposes of this client-side flag. This is enough to
 * fix the Back-button UX bug, but it is NOT a substitute for real
 * server-side auth - anyone who can guess/type the URL directly can still
 * load these pages. Add a real Flask session/JWT check on admin_bp if you
 * need actual access control.
 */
(function () {
    "use strict";

    // ------------------------------------------------------------
    // CONFIG - update this to match wherever your frontend (Login page)
    // is actually served from. In this project that's currently the
    // Live Server / static frontend, NOT the Flask backend.
    // ------------------------------------------------------------
    const LOGIN_PAGE_URL = "http://127.0.0.1:5500/templates/login.html";
    const AUTH_FLAG_KEY = "isAdminAuthenticated";

    const GUARD_MODE = (document.body && document.body.dataset.authGuardMode) || "confirm-logout";

    function isAuthenticated() {
        return sessionStorage.getItem(AUTH_FLAG_KEY) === "true";
    }

    // Reaching a Flask-rendered admin page at all is currently treated as
    // proof of a valid admin session (see caveat above) - mark this tab's
    // admin session active every time one of these pages successfully
    // renders.
    sessionStorage.setItem(AUTH_FLAG_KEY, "true");

    /**
     * Clears the admin auth flag and sends the browser back to the real
     * Login page with a full navigation (not an SPA route change), the
     * same way the Learner-side guard's performLogout() works.
     */
    function performLogout() {
    sessionStorage.removeItem(AUTH_FLAG_KEY);
    sessionStorage.clear();
    window.location.replace(LOGIN_PAGE_URL);   // full navigation, same as the Learner side
}

    // Push a sentinel history entry on top of the current one so the very
    // next Back press resolves to a 'popstate' on THIS page/URL instead of
    // immediately leaving it.
    if (!history.state || !history.state.cobrabyteAdminGuard) {
        history.pushState({ cobrabyteAdminGuard: true }, "", location.href);
    }

    window.addEventListener("popstate", function () {
        if (!isAuthenticated()) {
            window.location.replace(LOGIN_PAGE_URL);
            return;
        }

        // Admin Dashboard mode: Back never leaves this page - just reload it.
        if (GUARD_MODE === "refresh") {
            history.replaceState({ cobrabyteAdminGuard: true }, "", location.href);
            window.location.reload();
            return;
        }

        // Other authenticated admin pages: ask before logging out.
        history.pushState({ cobrabyteAdminGuard: true }, "", location.href);

        const confirmedLogout = window.confirm("Are you sure you want to log out?");
        if (confirmedLogout) {
            performLogout();
        }
    });

    // Belt-and-suspenders: if this exact page is later restored from
    // bfcache (e.g. logged out in another tab, then Forward back into a
    // cached copy), re-check the flag and bounce immediately.
    window.addEventListener("pageshow", function () {
        if (isAuthenticated()) return;
        window.location.replace(LOGIN_PAGE_URL);
    });

    // Expose performLogout globally so the sidebar's Logout link can reuse
    // this exact clear-everything-then-redirect logic.
    window.cobraByteAdminLogout = performLogout;
})();