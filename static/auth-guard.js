/**
 * auth-guard.js - CobraByte Protected Page Guard
 * ------------------------------------------------
 * Include this script on every authenticated page (Dashboard, Lessons,
 * Profile, etc.) - typically right before the closing </body> tag, after
 * any page-specific script that might also need auth state.
 *
 *      <script src="../static/auth-guard.js"></script>
 *
 * PER-PAGE BACK-BUTTON MODE
 * Add data-auth-guard-mode="refresh" to a page's <body> tag to make the
 * Back button just silently reload that page (used on Dashboard, where
 * Back must never surface the Login page or ask about logging out):
 *
 *      <body data-auth-guard-mode="refresh"> ... Dashboard markup ... </body>
 *
 * Leave the attribute off (the default) for pages like Lessons or Profile,
 * where Back should ask "Are you sure you want to log out?" instead.
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
 * 3. If the flag IS present, it "traps" the browser Back button so it
 *    never actually navigates away from the current page, then does one
 *    of two things depending on data-auth-guard-mode:
 *      - "confirm-logout" (default): shows a confirm dialog asking
 *        "Are you sure you want to log out?" - Yes clears all auth-related
 *        client state and does a real, full navigation to the landing
 *        page; No leaves the user exactly where they were, session intact.
 *      - "refresh": skips the dialog entirely and just reloads the current
 *        page in place - the user stays logged in and never sees Login.
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

    // Back-button behavior is per-page, controlled by a data attribute on
    // <body>:
    //
    //   <body data-auth-guard-mode="refresh">        <- Dashboard
    //   <body>  (no attribute = default)              <- Lessons, Profile, etc.
    //
    // "confirm-logout" (default): pressing Back asks
    //   "Are you sure you want to log out?" - Yes clears auth state and
    //   sends the user to the landing page; No cancels and keeps them put.
    //
    // "refresh": pressing Back never shows a dialog and never leaves this
    //   page (in particular, it must never surface the Login page) - it
    //   just reloads the current page in place, session untouched. This is
    //   what Dashboard uses, since Back there should always just refresh
    //   the Dashboard rather than asking about logout.
    const GUARD_MODE = (document.body && document.body.dataset.authGuardMode) || "confirm-logout";

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
    if (!isAuthenticated()) {
        window.location.replace(LANDING_PAGE_URL);
        return;
    }

    // Push a sentinel history entry on top of the current one. This is
    // what makes the very next Back press resolve to a 'popstate' event
    // on THIS page/URL, instead of immediately leaving it.
    //
    // Guard against re-pushing on every script run: in "refresh" mode the
    // page does a full reload (which re-executes this script from the top
    // of the file), and history.state for the *current* entry survives a
    // reload. So if we're re-running because of our own refresh, the entry
    // we're already sitting on is still marked - skip pushing again, or
    // the history stack would grow by one on every single Back press.
    if (!history.state || !history.state.cobrabyteAuthGuard) {
        history.pushState({ cobrabyteAuthGuard: true }, "", location.href);
    }

    // A click on a placeholder link (href="#") is an in-page fragment
    // navigation: the browser pushes a history entry and fires popstate,
    // which the trap below would mistake for the Back button and ask
    // "Are you sure you want to log out?". Cancel only the navigation -
    // any click handler the link has still runs.
    document.addEventListener("click", function (event) {
        const link = event.target.closest && event.target.closest('a[href="#"]');
        if (link) event.preventDefault();
    });

    window.addEventListener("popstate", function (event) {

        if (!isAuthenticated()) {
            window.location.replace(LANDING_PAGE_URL);
            return;
        }

    // Dashboard mode:
    // Never go back to Login.
    // Simply reload the current page.
        if (GUARD_MODE === "refresh") {

            history.replaceState(
                { cobrabyteAuthGuard: true },
                "",
                location.href
            );

            window.location.reload();
            return;
        }

    // Other authenticated pages
        history.pushState(
            { cobrabyteAuthGuard: true },
            "",
            location.href
        );

        const confirmedLogout = window.confirm(
            "Are you sure you want to log out?"
        );

        if (confirmedLogout) {
            performLogout();
        }
    });
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