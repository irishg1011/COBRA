/**
 * auth-guard.js - CobraByte Protected Page Guard
 * ------------------------------------------------
 * Include this script on every authenticated page (Dashboard, Lessons,
 * Profile, etc.) - typically right before the closing </body> tag, after
 * any page-specific script that might also need auth state.
 *
 *      <script src="../static/auth-guard.js"></script>
 *
 * BACK / FORWARD BUTTONS
 * Back and Forward (browser arrows, phone Back button) work normally
 * between pages and never ask about logging out. Only when the previous
 * page is the sign-in page does Back stay on the current page. (The old
 * data-auth-guard-mode attribute is no longer needed; it is ignored.)
 *
 * WHAT IT DOES
 * 1. On page load, checks a client-side "isAuthenticated" flag
 *    (sessionStorage). This flag is set by script.js immediately after a
 *    successful /login call, and removed on logout or whenever the
 *    login page shows the Sign In view.
 * 2. If the flag is missing, the visitor isn't considered logged in -
 *    the page redirects straight to the landing page with no dialog
 *    (e.g. someone reached this URL directly, or is coming back from
 *    bfcache after already logging out elsewhere).
 * 3. If the flag IS present, Back/Forward work normally (see above);
 *    only a page reached straight from sign-in keeps Back from leaving.
 *
 * IMPORTANT CAVEAT / BACKEND NOTE
 * The current Flask backend (login.py) does not issue any real session
 * token, JWT, or cookie on login - /login only returns a success/failure
 * JSON response. Because of that, "authenticated" here is a client-side
 * sessionStorage flag, not a verified server-side session. This is
 * sufficient to satisfy the UX requirements (confirmation dialog, no
 * back-navigation into protected pages after logout) but it is NOT a
 * substitute for real server-side auth. Anyone could open dev tools and
 * set the flag manually to view a protected page's markup - the backend
 * routes serving Dashboard/Lessons/Profile data should still verify a
 * real session/cookie/JWT before returning anything sensitive.
 */
(function () {
    "use strict";

    // ------------------------------------------------------------
    // CONFIG - adjust these constants per deployment if needed
    // ------------------------------------------------------------
    const LANDING_PAGE_URL = "/login"; // CobraByte's login/landing route (see login.py: @app.route("/"))
    const AUTH_FLAG_KEY = "isAuthenticated";

    function isAuthenticated() {
        return sessionStorage.getItem(AUTH_FLAG_KEY) === "true";
    }

    /**
     * Clears every piece of client-side auth state we know about, then
     * forces a full, fresh navigation to the landing page. Using
     * location.replace() (rather than .href) also means this protected
     * page's entry is swapped out of history instead of piling on top of
     * it, so a subsequent Back press from the landing page won't hop back
     * into this page either.
     */
    // Relative (same-origin) - see script.js.
    const API_BASE_URL = ""; // feat/admin-login-page: same-origin, works on 127.0.0.1 and localhost

    function performLogout() {
        // NEW: tell the backend to end this account's active_sessions_tbl
        // row (see login.py: /logout) - this is what makes the Admin >
        // Login Logs "Active Sessions" metric decrease immediately,
        // instead of only after the session times out. Best-effort: a
        // network hiccup here must never block the user from actually
        // being logged out client-side.
        fetch(`${API_BASE_URL}/logout`, { method: "POST", credentials: "include" })
            .catch(function () { /* best-effort - proceed with client-side logout regardless */ })
            .finally(function () {
                // 1. Clear the auth flag (and anything else stashed in
                //    sessionStorage for this tab/session).
                sessionStorage.removeItem(AUTH_FLAG_KEY);
                sessionStorage.clear();

                // 2. Clear any token-based auth that might be added later
                //    (e.g. if this project moves to JWT-in-localStorage).
                localStorage.removeItem("authToken");

                // 3. Clear any non-HttpOnly cookies this page can see.
                document.cookie.split(";").forEach(function (cookie) {
                    const name = cookie.split("=")[0].trim();
                    if (!name) return;
                    document.cookie = name + "=;expires=" + new Date(0).toUTCString() + ";path=/";
                });

                // 4. Real, full navigation - not an SPA route change - so
                //    the landing page's own script.js runs fresh and its
                //    Sign In view initializes cleanly.
                window.location.replace(LANDING_PAGE_URL);
            });
    }

    // If this page is loaded/restored (including via bfcache) without a
    // valid auth flag, don't even set up the Back-button trap - just
    // bounce to the landing page immediately, no dialog needed.
    // A NEW TAB (a link opened in another tab, a bookmark, a typed URL)
    // starts with an empty sessionStorage, so the flag is missing even
    // though the browser is still signed in. Ask the server first: a
    // valid learner session restores the flag and the page carries on;
    // only a real "not signed in" goes to the sign-in page. The page is
    // hidden while asking so a signed-out visitor never sees it.
    if (!isAuthenticated()) {
        document.documentElement.style.visibility = "hidden";
        fetch(`${API_BASE_URL}/api/consent/status`, { credentials: "include" })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data || !data.success) throw new Error("not signed in");
                sessionStorage.setItem(AUTH_FLAG_KEY, "true");
                if (data.needs_consent) { window.location.replace("/consent"); return; }
                document.documentElement.style.visibility = "";
                startGuard(false);
            })
            .catch(function () { window.location.replace(LANDING_PAGE_URL); });
        return;
    }
    startGuard(true);

    function startGuard(checkConsent) {

    // feat/terms-consent: a learner who has not accepted the current Terms
    // and Privacy Notice is sent to the consent screen. The server refuses
    // their data requests anyway (consent.py); this just shows the screen.
    if (checkConsent) {
        fetch(`${API_BASE_URL}/api/consent/status`, { credentials: "include" })
            .then(function (res) {
                if (res.status === 401) {
                    performLogout();
                    return null;
                }
                return res.json();
            })
            .then(function (data) {
                if (!data) return;
                if (data.success === false && data.message === "Not logged in.") {
                    performLogout();
                    return;
                }
                if (data.needs_consent) window.location.replace("/consent");
            })
            .catch(function () { /* offline or network failure - allow page to handle */ });
    }

    // ------------------------------------------------------------
    // BACK / FORWARD BUTTONS (browser arrows and the phone's Back button)
    // ------------------------------------------------------------
    // They work normally between pages - no "log out?" question. Logging
    // out only ever happens through the Logout button.
    //
    // The ONE exception: when the page Back would go to is the sign-in
    // page (or there is no known previous page, e.g. a fresh tab), Back
    // simply stays on this page, so a signed-in learner never lands on
    // the login screen by accident.
    function cameFromSignIn() {
        if (!document.referrer) return true;
        try {
            const ref = new URL(document.referrer);
            if (ref.origin !== location.origin) return true;
            return /^\/(login|consent|admin\/login)?\/?$/.test(ref.pathname);
        } catch (e) {
            return true;
        }
    }

    if (cameFromSignIn()) {
        if (!history.state || !history.state.cobrabyteAuthGuard) {
            history.pushState({ cobrabyteAuthGuard: true }, "", location.href);
        }
        window.addEventListener("popstate", function () {
            if (!isAuthenticated()) {
                window.location.replace(LANDING_PAGE_URL);
                return;
            }
            // Stay here silently - the previous page is the sign-in page.
            history.pushState({ cobrabyteAuthGuard: true }, "", location.href);
        });
    }

    // A click on a placeholder link (href="#") is an in-page fragment
    // navigation: the browser pushes a history entry, so Back would need
    // an extra press. Cancel only the navigation - any click handler the
    // link has still runs.
    document.addEventListener("click", function (event) {
        const link = event.target.closest && event.target.closest('a[href="#"]');
        if (link) event.preventDefault();
    });

    // Explicit logout (kept for pages that want to reuse it).
    window.cobraByteLearnerLogout = performLogout;

    // Belt-and-suspenders: if this exact page is later restored from
    // bfcache (e.g. the user logged out in another tab, then hits Forward
    // back into a cached copy of this page), re-check the flag and bounce
    // immediately rather than showing a stale authenticated page.
 window.addEventListener("pageshow", function () {
    // If the user is still authenticated,
    // stay on the current page.
    if (isAuthenticated()) return;

    window.location.replace(LANDING_PAGE_URL);
});

    // Expose performLogout globally so an on-page "Logout" button can
    // reuse the exact same clear-everything-then-redirect logic instead
    // of duplicating it.
    window.cobraByteLogout = performLogout;
    }   // startGuard

    // ------------------------------------------------------------
    // NEW: end the active_sessions_tbl row the INSTANT this tab closes
    // or navigates away - not up to SESSION_TIMEOUT_MINUTES later.
    // ------------------------------------------------------------
    // performLogout() (above) already ends the session via a normal
    // fetch() when the person explicitly logs out - but if they just
    // close the tab/browser instead, no JS has a chance to run a normal
    // fetch(). 'pagehide' fires reliably in that case, and
    // navigator.sendBeacon() is purpose-built for exactly this: a tiny,
    // fire-and-forget POST that the browser guarantees gets sent even
    // while the page is mid-unload, without blocking navigation.
    //
    // This is a background safety net only - it never blocks the
    // person from actually leaving, and if the beacon somehow fails to
    // reach the server, session_tracker.py's 30-minute sweep still
    // catches it eventually. Guarded by isAuthenticated() so this never
    // fires for someone who was never logged in to begin with (e.g. a
    // page load that immediately redirects to the landing page above).
    // NOTE: The pagehide-based beacon was removed entirely. It's
    // impossible to reliably tell "tab actually closing" apart from
    // "page refreshing" or "browser back/forward" using pagehide alone -
    // all of these fire the same event, and each one was deleting the
    // active_sessions_tbl row, breaking any page (like Learning Map)
    // that depends on the session still being valid. Session cleanup
    // now relies on the explicit Logout button and session_tracker.py's
    // inactivity sweep instead.
})();