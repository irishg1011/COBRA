/**
 * admin-presence.js - online status dots (feat/admin-online)
 * --------------------------------------------------------------------------
 * Every <span class="presence-dot" data-presence-id="ACC..."> on the page is
 * coloured from GET /admin/presence?ids=... :
 *
 *     green  online   active in the last 5 min
 *     yellow idle     signed in, no activity for 5-60 min
 *     grey   offline  not signed in (or idle more than 60 min)
 *
 * About every 30 s (paused while the tab is hidden). Rows added later (live
 * tables, modals) are noticed by a MutationObserver: a known id is coloured
 * at once, a new id is asked for a moment later. Mentors only get answers
 * for learners - any other dot just stays neutral.
 *
 *     CobraPresence.dot(accId)   -> the dot's HTML, for JS-built rows
 *     CobraPresence.avatar(accId, avatarHtml) -> avatar with the dot on its corner
 *     CobraPresence.refresh()    -> ask again now
 * Loaded (deferred) by admin-header.html on every staff page.
 */
(function () {
    "use strict";

    const POLL_MS = 30000;
    const NEW_IDS_DELAY_MS = 250;
    const MAX_IDS = 300;            // = presence.MAX_PRESENCE_IDS
    const SELECTOR = ".presence-dot[data-presence-id]";

    const known = {};               // acc_id -> {state, label, last_activity}
    let timer = null;
    let newIdsTimer = null;
    let inFlight = false;

    function escapeAttr(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
            .replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function dot(accId) {
        if (!accId || accId === "—") return "";
        const id = escapeAttr(accId);
        return `<span class="presence-dot" data-presence-id="${id}" role="img" aria-label="Checking status" title="Checking status…"></span>`;
    }

    function avatar(accId, avatarHtml) {
        return `<span class="presence-avatar-wrap">${avatarHtml || ""}${dot(accId)}</span>`;
    }

    function titleFor(info) {
        if (!info) return "";
        if (info.state === "online") return info.last_activity ? `Online · active ${info.last_activity}` : "Online";
        if (info.state === "idle") return info.last_activity ? `Idle · last active ${info.last_activity}` : "Idle · signed in";
        return "Offline";
    }

    function paint(el) {
        const info = known[el.dataset.presenceId];
        if (!info) return;
        if (el.dataset.state !== info.state) el.dataset.state = info.state;
        const title = titleFor(info);
        if (el.title !== title) {
            el.title = title;
            el.setAttribute("aria-label", title);
        }
    }

    function dotsOnPage() {
        return Array.from(document.querySelectorAll(SELECTOR));
    }

    function idsOnPage() {
        const ids = [];
        const seen = new Set();
        dotsOnPage().forEach((el) => {
            const id = el.dataset.presenceId;
            if (id && !seen.has(id)) {
                seen.add(id);
                ids.push(id);
            }
        });
        return ids.slice(0, MAX_IDS);
    }

    async function ask(ids) {
        if (!ids.length || inFlight) return;
        inFlight = true;
        try {
            const response = await fetch(`/admin/presence?ids=${encodeURIComponent(ids.join(","))}`, {
                headers: { "X-Requested-With": "XMLHttpRequest" },
                credentials: "include",
            });
            if (!response.ok) return;
            const data = await response.json();
            if (!data.success || !data.presence) return;
            Object.assign(known, data.presence);
            dotsOnPage().forEach(paint);
            document.dispatchEvent(new CustomEvent("cobra:presence", { detail: data.presence }));
        } catch (err) {
            // A missed round is fine - the next one tries again.
        } finally {
            inFlight = false;
        }
    }

    function refresh() {
        return ask(idsOnPage());
    }

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            if (!document.hidden) await refresh();
            schedule();
        }, POLL_MS);
    }

    function askForNewIds() {
        clearTimeout(newIdsTimer);
        newIdsTimer = setTimeout(() => {
            const fresh = idsOnPage().filter((id) => !(id in known));
            if (fresh.length) ask(fresh);
        }, NEW_IDS_DELAY_MS);
    }

    function watchNewDots() {
        const observer = new MutationObserver((mutations) => {
            let sawDot = false;
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType !== 1) return;
                    const dots = node.matches && node.matches(SELECTOR) ? [node] : node.querySelectorAll(SELECTOR);
                    dots.forEach((el) => {
                        sawDot = true;
                        paint(el);
                    });
                });
            });
            if (sawDot) askForNewIds();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refresh().then(schedule);
    });

    window.CobraPresence = { dot, avatar, refresh, POLL_MS };

    function start() {
        watchNewDots();
        refresh();
        schedule();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
