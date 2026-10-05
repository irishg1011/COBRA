/**
 * admin-live-refresh.js - stat cards (and tables) that keep themselves fresh
 * --------------------------------------------------------------------------
 * ONE timer for the whole admin page. Each page registers what to refresh:
 *
 *     CobraLive.every("learner-progress", async ({ modalOpen }) => { ... });
 *
 * Every POLL_MS (10 s) each registered tick runs once - one at a time, never
 * overlapping itself. The ticks re-ask the page's own JSON endpoint with the
 * filters / sort / page that are on screen right now, so a refresh never
 * resets anything the admin chose.
 *
 *   - Paused while the browser tab is hidden; runs once as soon as the tab
 *     is visible again, then carries on every POLL_MS.
 *   - ctx.modalOpen is true while any modal is on screen: ticks still update
 *     the stat cards but leave the tables alone.
 *   - Only touch the DOM when something changed: setText() / setHtml() /
 *     changed() compare with what is already shown, so an unchanged value
 *     is never rewritten (no flicker, no layout jump).
 *
 * The server keeps these answers for the same 10 seconds (live_cache.py),
 * so several open admin tabs don't multiply the work.
 * Loaded by admin-header.html, before every page's own scripts.
 */
(function () {
    "use strict";

    const POLL_MS = 10000;   // the ONE refresh interval of the admin side

    const ticks = [];
    let timer = null;
    let running = false;

    const MODAL_SELECTOR = ".modal-overlay, .custom-modal-overlay, [role='dialog'][aria-modal='true']";

    function isShown(el) {
        const cs = window.getComputedStyle(el);
        return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length > 0;
    }

    function modalOpen() {
        return Array.from(document.querySelectorAll(MODAL_SELECTOR)).some(isShown);
    }

    async function runAll() {
        if (running || document.hidden) return;
        running = true;
        const ctx = { modalOpen: modalOpen() };
        for (const tick of ticks) {
            try {
                await tick.fn(ctx);
            } catch (err) {
                // One failing refresh never stops the others (or the next round).
                console.error(`admin-live-refresh: "${tick.name}" failed:`, err);
            }
        }
        running = false;
    }

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            await runAll();
            schedule();
        }, POLL_MS);
    }

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            clearTimeout(timer);          // paused
        } else {
            runAll().then(schedule);      // catch up once, then the normal beat
        }
    });

    // ------------------------------------------------------------
    // Helpers for the ticks: change the DOM only when the value changed
    // ------------------------------------------------------------
    function setText(el, value) {
        if (!el) return false;
        const text = value === null || value === undefined ? "" : String(value);
        if (el.textContent === text) return false;
        el.textContent = text;
        return true;
    }

    function setHtml(el, html) {
        if (!el || el.dataset.liveHtml === html) return false;
        el.innerHTML = html;
        el.dataset.liveHtml = html;
        return true;
    }

    // changed(key, data): true (and remembers it) when data differs from the
    // last value seen under this key - e.g. a table's rows from the server.
    const seen = {};
    function changed(key, data) {
        const sig = JSON.stringify(data);
        if (seen[key] === sig) return false;
        seen[key] = sig;
        return true;
    }

    window.CobraLive = {
        POLL_MS,
        every(name, fn) {
            ticks.push({ name, fn });
            if (!timer) schedule();
        },
        setText,
        setHtml,
        changed,
        modalOpen,
    };
})();
