/*
 * py-runner.js - CobraPy: ONE background Python runner for every page
 * (feat/python-runner-no-freeze)
 * ---------------------------------------------------------------------------
 * Python (Pyodide) runs in a Web Worker (static/py-worker.js), so the page
 * never freezes - not while Python downloads, not while a program runs, not
 * even for `while True: pass`.
 *
 *   CobraPy.preload()            start loading Python quietly (pages with code)
 *   CobraPy.state                "idle" | "loading" | "ready" | "error"
 *   CobraPy.onState(fn)          fn(state) now and on every change
 *   CobraPy.retry()              after a failed load
 *   CobraPy.run({mode, code, files, moduleFiles, givenInputs, maxSeconds,
 *                onOutput(text), onInput(prompt) -> Promise<string>,
 *                onStarted(), live})
 *       -> Promise<{ok, result, message, stopped, killed, loadFailed}>
 *       mode: "block" | "exrun" | "sandbox" | "adminsandbox" | "grade"
 *   CobraPy.stop()               Stop: the worker is ended and a fresh one
 *                                starts in the background (no reload needed)
 *   CobraPy.chip(afterEl)        the "Getting Python ready..." status chip
 *   CobraPy.runningButton(btn, {onStop})  "Running... 3s" + a Stop button
 *
 * Safety: the program's own guard stops it after 1,000 output lines or
 * maxSeconds (5 for lessons / exercise / staff editors, 15 for the two
 * Sandboxes). BACKUP for heavy code the guard can't reach (x = 10**10**8,
 * deep recursion): still running 5 s after its limit -> the worker is ended
 * with "Program stopped: it took too long to finish." Time spent waiting on
 * input() never counts.
 */
(function () {
    "use strict";
    if (window.CobraPy) return;

    const INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
    const WORKER_URL = "/static/py-worker.js";
    const BACKUP_GRACE_SECONDS = 5;
    const KILL_MESSAGE = "Program stopped: it took too long to finish.";
    const LOAD_FAILED_MESSAGE = "Couldn't load Python. Check your internet connection.";
    const STARTING_MESSAGE = "Starting Python... the first run can take up to 15 seconds.";

    let worker = null;
    let state = "idle";
    const listeners = new Set();
    let active = null;        // the run in progress
    let nextId = 1;

    function setState(next) {
        if (state === next) return;
        state = next;
        listeners.forEach((fn) => { try { fn(state); } catch (e) { /* a listener failed */ } });
    }

    function startWorker() {
        worker = new Worker(WORKER_URL);
        worker.onmessage = onMessage;
        worker.onerror = () => {
            if (state === "loading") setState("error");
        };
        setState("loading");
        worker.postMessage({ type: "load", indexURL: INDEX_URL });
    }

    function ensureWorker() {
        if (!worker) startWorker();
    }

    function onMessage(e) {
        const msg = e.data || {};
        if (msg.type === "ready") { setState("ready"); return; }
        if (msg.type === "loadError") { setState("error"); return; }
        const run = active;
        if (!run || msg.id !== run.id) return;
        if (msg.type === "started") {
            setState("ready");
            run.started = true;
            run.lastTick = performance.now();
            if (run.opts.onStarted) run.opts.onStarted();
        } else if (msg.type === "output") {
            if (run.opts.onOutput) run.opts.onOutput(msg.text);
        } else if (msg.type === "input") {
            run.waitingInput = true;
            Promise.resolve(run.opts.onInput ? run.opts.onInput(msg.prompt) : null).then((value) => {
                run.waitingInput = false;
                run.lastTick = performance.now();
                if (active === run && worker) worker.postMessage({ type: "input", id: run.id, value });
            });
        } else if (msg.type === "done") {
            finish(run, msg.loadFailed
                ? { ok: false, loadFailed: true, message: LOAD_FAILED_MESSAGE }
                : { ok: !!msg.ok, result: msg.result == null ? null : msg.result, message: msg.message || "" });
        }
    }

    function finish(run, outcome) {
        if (active !== run) return;
        active = null;
        clearInterval(run.timer);
        run.resolve(outcome);
    }

    // Ends the worker (it can't be interrupted any other way) and starts a
    // fresh one in the background, so the next Run just works.
    function restartWorker() {
        if (worker) { worker.terminate(); worker = null; }
        startWorker();
    }

    function run(opts) {
        opts = opts || {};
        if (active) return Promise.resolve({ ok: false, message: "Another program is still running." });
        ensureWorker();
        if (state === "error") restartWorker();
        const maxSeconds = Number(opts.maxSeconds) || 5;
        return new Promise((resolve) => {
            const runRec = {
                id: nextId++, opts, resolve, started: false, waitingInput: false,
                runSeconds: 0, lastTick: performance.now(),
            };
            active = runRec;
            // Backup limit: counts only real running time (not the load,
            // not input() waits).
            runRec.timer = setInterval(() => {
                const now = performance.now();
                if (runRec.started && !runRec.waitingInput) runRec.runSeconds += (now - runRec.lastTick) / 1000;
                runRec.lastTick = now;
                if (runRec.runSeconds > maxSeconds + BACKUP_GRACE_SECONDS) {
                    restartWorker();
                    finish(runRec, { ok: false, killed: true, message: KILL_MESSAGE });
                }
            }, 250);
            worker.postMessage({
                type: "run", id: runRec.id, indexURL: INDEX_URL, mode: opts.mode, code: opts.code || "",
                files: opts.files || [], moduleFiles: opts.moduleFiles || [], givenInputs: opts.givenInputs || [],
                maxLines: 1000, maxSeconds, live: !!opts.live,
            });
        });
    }

    function stop() {
        const runRec = active;
        if (!runRec) return false;
        restartWorker();
        finish(runRec, { ok: false, stopped: true, message: "Program stopped." });
        return true;
    }

    // ---------------- small UI helpers ----------------
    const CHIP_TEXT = {
        idle: "Getting Python ready...",
        loading: "Getting Python ready...",
        ready: "Python ready",
        error: "Couldn't load Python. Check your internet connection.",
    };

    // A small status chip right after `afterEl` (a Run button / console head).
    function chip(afterEl) {
        if (!afterEl || !afterEl.parentNode) return null;
        if (afterEl.nextElementSibling && afterEl.nextElementSibling.classList.contains("cobrapy-chip")) {
            return afterEl.nextElementSibling;
        }
        const el = document.createElement("span");
        el.className = "cobrapy-chip";
        el.setAttribute("role", "status");
        el.setAttribute("aria-live", "polite");
        const text = document.createElement("span");
        text.className = "cobrapy-chip-text";
        const retryBtn = document.createElement("button");
        retryBtn.type = "button";
        retryBtn.className = "cobrapy-chip-retry";
        retryBtn.textContent = "Try again";
        retryBtn.addEventListener("click", retry);
        el.appendChild(text);
        el.appendChild(retryBtn);
        afterEl.insertAdjacentElement("afterend", el);
        onState((s) => {
            el.dataset.state = s;
            text.textContent = CHIP_TEXT[s] || "";
            retryBtn.hidden = s !== "error";
        });
        return el;
    }

    // "Running... 3s" on the Run button + a Stop button next to it.
    // Returns done() to put everything back.
    function runningButton(btn, options) {
        options = options || {};
        if (!btn) return () => {};
        const original = btn.innerHTML;
        const originalDisabled = btn.disabled;
        const startedAt = performance.now();
        btn.disabled = true;
        btn.classList.add("cobrapy-running");
        const label = () => {
            const s = Math.floor((performance.now() - startedAt) / 1000);
            btn.innerHTML = `<span class="cobrapy-spin" aria-hidden="true"></span> Running... ${s}s`;
        };
        label();
        const tick = setInterval(label, 500);
        let stopBtn = null;
        if (options.onStop) {
            stopBtn = document.createElement("button");
            stopBtn.type = "button";
            // Same look as the Run button, but never its "run" hooks (.run-btn...).
            const look = options.stopClass || Array.from(btn.classList)
                .filter((c) => c !== "cobrapy-running" && !/run/i.test(c)).join(" ");
            stopBtn.className = (look + " cobrapy-stop-btn").trim();
            stopBtn.innerHTML = '<span class="cobrapy-stop-icon" aria-hidden="true"></span> Stop';
            stopBtn.addEventListener("click", () => options.onStop());
            btn.insertAdjacentElement("afterend", stopBtn);
        }
        return function done() {
            clearInterval(tick);
            btn.classList.remove("cobrapy-running");
            btn.innerHTML = original;
            btn.disabled = originalDisabled;
            if (stopBtn) stopBtn.remove();
        };
    }

    function onState(fn) {
        listeners.add(fn);
        fn(state);
        return () => listeners.delete(fn);
    }

    function retry() {
        restartWorker();
    }

    // The chip / Stop button look - added once, works in dark mode too.
    function addStyles() {
        if (document.getElementById("cobrapyStyles")) return;
        const style = document.createElement("style");
        style.id = "cobrapyStyles";
        style.textContent = `
.cobrapy-chip { display: inline-flex; align-items: center; gap: 6px; margin: 0 8px; padding: 2px 10px; border-radius: 999px;
  font: 600 12px/1.6 inherit; font-family: inherit; background: #f1f5f9; color: #475569; vertical-align: middle; white-space: nowrap; }
.cobrapy-chip::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; flex-shrink: 0; }
.cobrapy-chip[data-state="loading"]::before, .cobrapy-chip[data-state="idle"]::before { animation: cobrapy-pulse 1s ease-in-out infinite; }
.cobrapy-chip[data-state="ready"] { background: #dcfce7; color: #166534; }
.cobrapy-chip[data-state="ready"]::before { background: #16a34a; }
.cobrapy-chip[data-state="error"] { background: #fee2e2; color: #991b1b; white-space: normal; }
.cobrapy-chip[data-state="error"]::before { background: #dc2626; }
.cobrapy-chip-retry { border: 0; border-radius: 999px; padding: 1px 9px; background: #991b1b; color: #fff; font: inherit; cursor: pointer; }
.cobrapy-chip-retry[hidden] { display: none; }
.cobrapy-spin { display: inline-block; width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent;
  border-radius: 50%; vertical-align: -2px; animation: cobrapy-rot 0.8s linear infinite; }
.cobrapy-stop-btn { margin-left: 6px; }
.cobrapy-running { white-space: nowrap; }
/* Narrow screens: the Console header row (title, Run, Stop, chip) wraps instead of cutting off. */
.editor-code-title-row:has(.cobrapy-chip) { flex-wrap: wrap; row-gap: 6px; }
/* Exercise "Your Code" header: keep Run, Stop and the chip together on the right. */
.exercise-pane-head:has(.cobrapy-chip) { flex-wrap: wrap; justify-content: flex-start; gap: 6px; }
.exercise-pane-head:has(.cobrapy-chip) .exercise-run-btn { margin-left: auto; }
@media (max-width: 600px) { .cobrapy-chip { margin: 0; } }
/* Code-block consoles style their buttons through .run-btn - give Stop its own look there. */
.console-action-btn.cobrapy-stop-btn { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 6px;
  padding: 5px 12px; background: #ef4444; color: #fff; font: 600 13px/1.4 inherit; font-family: inherit; cursor: pointer; }
.console-action-btn.cobrapy-stop-btn:hover { background: #dc2626; }
.cobrapy-stop-icon { display: inline-block; width: 9px; height: 9px; background: currentColor; border-radius: 2px; vertical-align: 0; }
@keyframes cobrapy-pulse { 50% { opacity: 0.3; } }
@keyframes cobrapy-rot { to { transform: rotate(360deg); } }
@media (prefers-color-scheme: dark) {
  html.dark-mode .cobrapy-chip, body.dark-mode .cobrapy-chip { background: #1e293b; color: #cbd5e1; }
}
html.dark-mode .cobrapy-chip, body.dark-mode .cobrapy-chip, [data-theme="dark"] .cobrapy-chip { background: #1e293b; color: #cbd5e1; }
html.dark-mode .cobrapy-chip[data-state="ready"], body.dark-mode .cobrapy-chip[data-state="ready"], [data-theme="dark"] .cobrapy-chip[data-state="ready"] { background: #14532d; color: #bbf7d0; }
@media (prefers-reduced-motion: reduce) { .cobrapy-spin, .cobrapy-chip::before { animation: none !important; } }
`;
        document.head.appendChild(style);
    }
    if (document.head) addStyles();
    else document.addEventListener("DOMContentLoaded", addStyles);

    window.CobraPy = {
        preload() { ensureWorker(); },
        get state() { return state; },
        isReady: () => state === "ready",
        isRunning: () => !!active,
        onState, retry, run, stop, chip, runningButton,
        messages: { KILL_MESSAGE, LOAD_FAILED_MESSAGE, STARTING_MESSAGE },
    };
})();
