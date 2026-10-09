/**
 * idle-notice.js - on the learner and staff login pages: after an idle
 * logout (idle-logout.js adds ?reason=idle; the server sets the
 * cobra_idle_logout cookie when it ends an idle session itself), say why.
 */
(function () {
    "use strict";
    const COOKIE = "cobra_idle_logout";

    function cookieRole() {
        const match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE + "=([^;]*)"));
        return match ? decodeURIComponent(match[1]) : "";
    }

    function hoursText(minutes) {
        if (minutes % 60 === 0) {
            const h = minutes / 60;
            return `${h} hour${h === 1 ? "" : "s"}`;
        }
        return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    }

    async function show() {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get("reason") === "idle";
        const fromCookie = cookieRole();
        if (!fromUrl && !fromCookie) return;

        // Shown once: clear the cookie and the ?reason=idle.
        document.cookie = `${COOKIE}=; Max-Age=0; path=/`;
        if (fromUrl) {
            params.delete("reason");
            const query = params.toString();
            window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
        }

        const isStaff = window.location.pathname.indexOf("/staff") === 0;
        let text = "You were logged out because you were inactive for a while. Please log in again.";
        try {
            const info = await (await fetch("/session/idle-info", { credentials: "same-origin" })).json();
            const minutes = isStaff ? info.staff_minutes : info.learner_minutes;
            if (minutes) text = `You were logged out after ${hoursText(minutes)} of inactivity. Please log in again.`;
        } catch (e) { /* keep the general text */ }

        const form = document.querySelector("#adminSignInForm") || document.querySelector("#signInPanel .auth-form");
        if (!form) return;
        const note = document.createElement("p");
        note.className = "idle-logout-notice";
        note.setAttribute("role", "status");
        note.textContent = text;
        note.style.cssText = "margin:0 0 14px;padding:10px 14px;border-radius:10px;background:#fef3c7;" +
            "color:#92400e;font-size:0.9rem;line-height:1.4;border:1px solid #fcd34d;";
        form.parentNode.insertBefore(note, form);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", show);
    } else {
        show();
    }
})();
