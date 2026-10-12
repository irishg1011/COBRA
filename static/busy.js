/*
 * busy.js - the "please wait" standard for every page (learner AND staff)
 * (feat/python-runner-no-freeze)
 * ---------------------------------------------------------------------------
 * Wraps window.fetch for same-origin requests the person is WAITING on -
 * never for background calls (heartbeats, notification counts, idle pings,
 * presence, live dashboard refreshes, run logs), so those never show
 * anything.
 *
 *   under 1 s     nothing (no flicker)
 *   after 1 s     a thin bar at the top + a small note: "Loading..." /
 *                 "Saving..." (or the page's own label)
 *   after 8 s     "Still working... your connection may be slow."
 *   after 20 s    "This is taking too long."      [Try again] (reads only)
 *   network fail  "Couldn't reach the server."    [Try again] (reads only)
 *
 * Which requests count as "waited on": ones that start while the page is
 * still loading, or within 1.5 s of a click / key press / form submit.
 * A page can also say so itself:
 *     fetch(url, { cobraBusy: "Publishing..." })   always show, with this label
 *     fetch(url, { cobraBackground: true })        never show
 *
 * Try again re-sends a READ (GET) for the page, which simply gets the answer
 * - it never re-sends a save (that could save twice); a failed save shows the
 * message and the page's own error handling runs as before.
 *
 * Buttons: the button just clicked that started a save gets a spinner and
 * stays disabled until the save finishes (no double clicks). Buttons the page
 * already disables itself are left alone; data-busy="off" opts a button out.
 */
(function () {
    "use strict";
    if (window.CobraBusy || typeof window.fetch !== "function") return;

    const SHOW_AFTER = 1000;
    const SLOW_AFTER = 8000;
    const TOO_LONG_AFTER = 20000;
    const INTERACTION_WINDOW = 1500;
    const PAGE_LOAD_GRACE = 3000;

    const BACKGROUND = /\/(presence|heartbeat)\b|\/notifications\/count|\/session\/(activity|idle-info|idle-logout)|\/api\/consent\/status|\/dashboard\/live|\/online\/data|\/preview-play\/api\/tally|\/api\/sandbox\/log-run|\/static\/|\.(js|css|png|jpe?g|svg|webp|woff2?)(\?|$)/i;

    const nativeFetch = window.fetch.bind(window);
    let lastInteraction = -Infinity;
    let lastButton = null;
    let lastButtonAt = -Infinity;
    let pageSettled = false;

    function markInteraction(e) {
        lastInteraction = performance.now();
        if (e && e.type === "click" && e.target && e.target.closest) {
            const btn = e.target.closest("button, input[type=submit], input[type=button], a.btn, [role=button]");
            if (btn) { lastButton = btn; lastButtonAt = lastInteraction; }
        }
    }
    ["pointerdown", "keydown", "submit", "click"].forEach((type) => {
        window.addEventListener(type, markInteraction, true);
    });
    window.addEventListener("load", () => setTimeout(() => { pageSettled = true; }, PAGE_LOAD_GRACE));

    // ---------------- UI ----------------
    let ui = null;
    const tasks = new Set();

    function buildUi() {
        if (ui || !document.body) return ui;
        const style = document.createElement("style");
        style.id = "cobraBusyStyles";
        style.textContent = `
.cobra-busy-bar { position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 99998; overflow: hidden;
  background: rgba(16, 185, 129, 0.18); pointer-events: none; }
.cobra-busy-bar::before { content: ""; position: absolute; top: 0; bottom: 0; left: -40%; width: 40%;
  background: #10b981; animation: cobra-busy-slide 1.1s ease-in-out infinite; }
.cobra-busy-note { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 99999;
  display: flex; align-items: center; gap: 10px; width: max-content; max-width: calc(100vw - 32px); box-sizing: border-box;
  padding: 7px 14px; border-radius: 999px; background: #0f172a; color: #f8fafc;
  font: 600 13px/1.4 "Inter", "Poppins", system-ui, sans-serif; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.25); }
.cobra-busy-note.is-problem { background: #7f1d1d; }
.cobra-busy-note button { border: 0; border-radius: 999px; padding: 4px 12px; background: #ffffff; color: #0f172a;
  font: inherit; cursor: pointer; white-space: nowrap; }
.cobra-busy-note button.is-plain { background: transparent; color: #e2e8f0; text-decoration: underline; padding: 4px 4px; }
.cobra-busy-note[hidden], .cobra-busy-bar[hidden] { display: none; }
.cobra-busy-btn { position: relative; cursor: progress !important; }
.cobra-busy-btn::after { content: ""; display: inline-block; width: 12px; height: 12px; margin-left: 8px;
  border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
  vertical-align: -2px; animation: cobra-busy-rot 0.8s linear infinite; }
@keyframes cobra-busy-slide { 0% { left: -40%; } 100% { left: 100%; } }
@keyframes cobra-busy-rot { to { transform: rotate(360deg); } }
@media (prefers-color-scheme: dark) { .cobra-busy-note { background: #e2e8f0; color: #0f172a; }
  .cobra-busy-note button { background: #0f172a; color: #f8fafc; } .cobra-busy-note button.is-plain { color: #0f172a; background: transparent; } }
@media (max-width: 600px) { .cobra-busy-note { top: 8px; font-size: 12.5px; padding: 6px 12px; } }
@media (prefers-reduced-motion: reduce) { .cobra-busy-bar::before { animation-duration: 3s; } .cobra-busy-btn::after { animation: none; } }
`;
        document.head.appendChild(style);
        const bar = document.createElement("div");
        bar.className = "cobra-busy-bar";
        bar.hidden = true;
        const note = document.createElement("div");
        note.className = "cobra-busy-note";
        note.setAttribute("role", "status");
        note.setAttribute("aria-live", "polite");
        note.hidden = true;
        const text = document.createElement("span");
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Try again";
        const dismiss = document.createElement("button");
        dismiss.type = "button";
        dismiss.className = "is-plain";
        dismiss.textContent = "Dismiss";
        note.append(text, retry, dismiss);
        document.body.append(bar, note);
        ui = { bar, note, text, retry, dismiss };
        return ui;
    }

    // Shows the newest visible task (a problem wins over plain waiting).
    function render() {
        if (!buildUi()) return;
        const visible = Array.from(tasks).filter((t) => t.visible);
        const shown = visible.filter((t) => t.problem).pop() || visible[visible.length - 1];
        ui.bar.hidden = !visible.some((t) => !t.problem || t.stage === "slow");
        if (!shown) { ui.note.hidden = true; return; }
        ui.note.hidden = false;
        ui.note.classList.toggle("is-problem", !!shown.problem);
        ui.text.textContent = shown.message;
        ui.retry.hidden = !shown.onRetry;
        ui.dismiss.hidden = !shown.onDismiss;
        ui.retry.onclick = shown.onRetry || null;
        ui.dismiss.onclick = shown.onDismiss || null;
    }

    function startTask(label) {
        const task = { visible: false, problem: false, message: label, stage: "wait", timers: [] };
        tasks.add(task);
        task.timers.push(setTimeout(() => { task.visible = true; render(); }, SHOW_AFTER));
        task.timers.push(setTimeout(() => {
            if (task.problem) return;
            task.stage = "slow";
            task.message = "Still working... your connection may be slow.";
            render();
        }, SLOW_AFTER));
        return task;
    }

    function endTask(task) {
        task.timers.forEach(clearTimeout);
        tasks.delete(task);
        render();
    }

    // A message that stays a few seconds after the request already ended.
    function flash(message) {
        const task = { visible: true, problem: true, message, stage: "done", timers: [] };
        tasks.add(task);
        render();
        task.timers.push(setTimeout(() => endTask(task), 6000));
        task.onDismiss = () => endTask(task);
        render();
    }

    // ---------------- button spinner ----------------
    function claimButton(isSave) {
        if (!isSave || !lastButton || performance.now() - lastButtonAt > INTERACTION_WINDOW) return null;
        const btn = lastButton;
        if (!btn.isConnected || btn.disabled || btn.dataset.busy === "off" || btn.classList.contains("cobra-busy-btn")) return null;
        if (btn.classList.contains("cobrapy-running") || btn.getAttribute("aria-busy") === "true") return null;
        btn.disabled = true;
        btn.classList.add("cobra-busy-btn");
        btn.setAttribute("aria-busy", "true");
        return () => {
            btn.classList.remove("cobra-busy-btn");
            btn.removeAttribute("aria-busy");
            btn.disabled = false;
        };
    }

    // ---------------- fetch ----------------
    function sameOrigin(url) {
        try { return new URL(url, window.location.href).origin === window.location.origin; } catch (e) { return false; }
    }

    window.fetch = function (input, init) {
        init = init || {};
        const url = typeof input === "string" ? input : (input && input.url) || String(input);
        const method = String(init.method || (input && input.method) || "GET").toUpperCase();
        const { cobraBusy, cobraBackground, ...cleanInit } = init;
        const interactive = !pageSettled || performance.now() - lastInteraction < INTERACTION_WINDOW;
        const watch = !cobraBackground && !init.keepalive && sameOrigin(url) && method !== "HEAD"
            && (cobraBusy || (interactive && !BACKGROUND.test(url)));
        if (!watch) return nativeFetch(input, cleanInit);

        const isRead = method === "GET";
        const label = typeof cobraBusy === "string" && cobraBusy ? cobraBusy : (isRead ? "Loading..." : "Saving...");
        const releaseButton = claimButton(!isRead);
        const task = startTask(label);

        // Reads can be re-sent: each attempt gets its own abort controller.
        let controller = null;
        const attempt = () => {
            let req = input;
            if (input instanceof Request) req = input.clone();
            if (!isRead) return nativeFetch(req, cleanInit);
            controller = new AbortController();
            if (cleanInit.signal) {
                if (cleanInit.signal.aborted) controller.abort();
                else cleanInit.signal.addEventListener("abort", () => controller.abort(), { once: true });
            }
            return nativeFetch(req, { ...cleanInit, signal: controller.signal });
        };

        return new Promise((resolve, reject) => {
            let settled = false;
            let tooLongTimer = null;
            let retryRequested = false;     // [Try again] after "taking too long"
            const done = (fn, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(tooLongTimer);
                endTask(task);
                if (releaseButton) releaseButton();
                fn(value);
            };
            const armTooLong = () => {
                clearTimeout(tooLongTimer);
                tooLongTimer = setTimeout(() => {
                    task.visible = true;
                    task.problem = true;
                    task.message = "This is taking too long.";
                    task.onRetry = isRead ? () => { retryRequested = true; controller.abort(); } : null;
                    task.onDismiss = () => { task.visible = false; task.problem = false; render(); };
                    render();
                }, TOO_LONG_AFTER);
            };
            const run = () => {
                armTooLong();
                attempt().then(
                    (response) => done(resolve, response),
                    (err) => {
                        if (settled) return;
                        if (retryRequested) {          // [Try again] after "taking too long"
                            retryRequested = false;
                            task.problem = false; task.visible = true; task.stage = "wait"; task.message = label;
                            task.onRetry = task.onDismiss = null;
                            render();
                            run();
                            return;
                        }
                        if (err && err.name === "AbortError") { done(reject, err); return; }
                        // Network failure
                        clearTimeout(tooLongTimer);
                        if (!isRead) {
                            done(reject, err);
                            flash("Couldn't reach the server. Please try again.");
                            return;
                        }
                        task.visible = true;
                        task.problem = true;
                        task.message = "Couldn't reach the server.";
                        task.onRetry = () => {
                            task.problem = false; task.message = label; task.onRetry = task.onDismiss = null;
                            render();
                            run();
                        };
                        task.onDismiss = () => done(reject, err);
                        render();
                    }
                );
            };
            run();
        });
    };

    window.CobraBusy = {
        // For actions that are not a fetch: const end = CobraBusy.start("Publishing..."); ... end();
        start(label) {
            const task = startTask(label || "Loading...");
            return () => endTask(task);
        },
    };
})();
