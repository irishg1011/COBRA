/**
 * admin-auth-guard.js - CobraByte Admin Page Guard
 * ------------------------------------------------
 * Include this on every rendered admin page (Dashboard, Account & Security,
 * etc.) - right before the closing </body> tag:
 *
 *      <script src="{{ url_for('admin_bp.static', filename='js/admin-auth-guard.js') }}"></script>
 *
 * WHY THIS EXISTS
 * Gives the admin pages the same Back-button trap the Learner Dashboard
 * has, so Back never drops an admin onto the login page while still
 * signed in. (feat/admin-login-page: admins now sign in at /admin/login,
 * served by the same Flask app on :5000 - no more Live Server / :5500.)
 *
 * BACK / FORWARD BUTTONS
 * Work normally between admin pages and never ask about logging out.
 * Only when the previous page is the sign-in page does Back stay put.
 * (data-auth-guard-mode is no longer used.)
 *
 * NOTE
 * The real access control is server-side: every admin_bp route checks
 * session["admin_id"] (admin_routes.py _require_admin_session) and sends
 * signed-out / archived admins to /admin/login. The sessionStorage flag
 * here only drives the Back-button behavior.
 */
(function () {
    "use strict";

    // feat/admin-login-page: the admin's own login page (same origin).
    const LOGIN_PAGE_URL = "/admin/login";
    const AUTH_FLAG_KEY = "isAdminAuthenticated";

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

        // NEW (Task #12): clearing the client-side flag isn't enough on its
        // own anymore - the real admin_id lives in a server-side session,
        // so hit the backend logout route (with credentials so the session
        // cookie is sent) to destroy it too, before navigating away.
        fetch("/admin/logout", { credentials: "include" })
            .catch(() => { /* best-effort - navigate away regardless */ })
            .finally(() => {
                window.location.replace(LOGIN_PAGE_URL); // full navigation, same as the Learner side
            });
    }

    // ------------------------------------------------------------
    // Task #14: Custom logout modal (replaces window.confirm() everywhere)
    // ------------------------------------------------------------
    // The modal markup itself lives once in admin-sidebar.html, which is
    // shared/included on every admin page - so there is nothing page
    // specific here, just open/close helpers plus the two button handlers.
    function openLogoutModal() {
        const modal = document.getElementById('adminLogoutModal');
        if (modal) modal.style.display = 'flex';
    }

    function closeLogoutModal() {
        const modal = document.getElementById('adminLogoutModal');
        if (modal) modal.style.display = 'none';
    }

    function wireLogoutModalButtons() {
        const cancelBtn = document.getElementById('adminCancelLogoutBtn');
        const confirmBtn = document.getElementById('adminConfirmLogoutBtn');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                closeLogoutModal(); // stay on the current page, session untouched
            });
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                closeLogoutModal();
                performLogout();
            });
        }
    }

    document.addEventListener('DOMContentLoaded', wireLogoutModalButtons);

    // Back / Forward (browser arrows, phone Back button) work normally
    // between admin pages - no "log out?" modal. Logging out only happens
    // through the Logout button. The one exception: when the previous page
    // is the sign-in page (or unknown, e.g. a fresh tab), Back stays here.
    function cameFromSignIn() {
        if (!document.referrer) return true;
        try {
            const ref = new URL(document.referrer);
            if (ref.origin !== location.origin) return true;
            return /^\/(login|admin\/login)?\/?$/.test(ref.pathname);
        } catch (e) {
            return true;
        }
    }

    if (cameFromSignIn()) {
        if (!history.state || !history.state.cobrabyteAdminGuard) {
            history.pushState({ cobrabyteAdminGuard: true }, "", location.href);
        }
        window.addEventListener("popstate", function () {
            if (!isAuthenticated()) {
                window.location.replace(LOGIN_PAGE_URL);
                return;
            }
            history.pushState({ cobrabyteAdminGuard: true }, "", location.href);
        });
    }

    // Belt-and-suspenders: if this exact page is later restored from
    // bfcache (e.g. logged out in another tab, then Forward back into a
    // cached copy), re-check the flag and bounce immediately.
    window.addEventListener("pageshow", function () {
        if (isAuthenticated()) return;
        window.location.replace(LOGIN_PAGE_URL);
    });

    // Expose performLogout and openLogoutModal globally so the sidebar's
    // Logout link (admin-script.js) reuses this exact same logic/modal
    // instead of duplicating it or falling back to window.confirm().
    window.cobraByteAdminLogout = performLogout;
    window.cobraByteOpenLogoutModal = openLogoutModal;

    // ------------------------------------------------------------
    // NEW: end the active_sessions_tbl row the INSTANT this tab closes
    // or navigates away - not up to SESSION_TIMEOUT_MINUTES later.
    // ------------------------------------------------------------
    // performLogout() (above) already ends the session via a normal
    // fetch() when the admin explicitly clicks Logout - but if they
    // just close the tab/browser instead, no JS gets a chance to run a
    // normal fetch(). 'pagehide' fires reliably in that case, and
    // navigator.sendBeacon() is purpose-built for exactly this: a tiny,
    // fire-and-forget POST the browser guarantees gets sent even while
    // the page is mid-unload, without blocking navigation.
    //
    // Background safety net only - never blocks the admin from leaving,
    // and if the beacon somehow fails to reach the server,
    // session_tracker.py's own sweep (on the next Active Sessions
    // count) still catches it within SESSION_TIMEOUT_MINUTES regardless.
    window.addEventListener("pagehide", function () {
        if (!isAuthenticated()) return;
        if (navigator.sendBeacon) {
            navigator.sendBeacon("/admin/session/end");
        }
    });
})();
