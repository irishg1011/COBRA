/**
 * game-kit.js - pieces shared by the three learner games and the coding exercise
 * ---------------------------------------------------------------------------
 * feat/lives-5v5, feat/question-timer, feat/leave-detection
 *
 *   CobraGameKit.hearts(state)          the regular lives (max 5) + the daily
 *                                       bonus as a separate reserve badge
 *   CobraGameKit.livesText(state)       "3/5" (+ "· 2 reserve")
 *   CobraGameKit.timerBar(host)         slim shrinking bar, no numbers, no
 *                                       sound; colour changes only in the last
 *                                       10 seconds. The SERVER decides when
 *                                       time is up - this only draws it.
 *   CobraGameKit.leaveGuard(opts)       page-visibility + focus detection:
 *                                       tells the server when the learner
 *                                       leaves and comes back, in that order.
 *   CobraGameKit.notice(title, text, icon, onClose)
 *                                       one-button notice in the shared
 *                                       confirmation modal (CobraProceed).
 *                                       The game behind it is blurred and the
 *                                       leave guard waits until it is closed.
 *   CobraGameKit.noticeOpen()           true while such a notice is open
 */
(function () {
    "use strict";

    function hearts(state) {
        const lives = state ? state.lives : 0;
        const max = state ? state.max_lives : 5;
        const reserve = state ? (state.reserve_lives ?? state.bonus_lives ?? 0) : 0;
        let html = "";
        for (let i = 0; i < max; i++) {
            html += `<i class="${i < lives ? "fa-solid" : "fa-regular"} fa-heart"></i>`;
        }
        if (reserve > 0) {
            html += `<span class="game-reserve" title="Daily bonus lives - used only after your 5 lives are gone"><i class="fa-solid fa-heart is-bonus"></i>+${Number(reserve)}</span>`;
        }
        return html;
    }

    function livesText(state) {
        if (!state) return "";
        const reserve = state.reserve_lives ?? state.bonus_lives ?? 0;
        return `${state.lives}/${state.max_lives}` + (reserve > 0 ? ` · ${reserve} reserve` : "");
    }

    // ---------------- question timer ----------------
    // A bar that shrinks + the seconds left at its end (42s). The last
    // LOW_SECONDS: bar and number turn red, the number pulses and a
    // "Hurry! N seconds left" line shows under it.
    const LOW_SECONDS = 10;

    function timerBar(host, extraClass) {
        const wrap = document.createElement("div");
        wrap.className = "game-timer-wrap" + (extraClass ? " " + extraClass : "");
        wrap.innerHTML = '<div class="game-timer-row"><div class="game-timer" role="presentation">'
            + '<div class="game-timer-fill"></div></div><span class="game-timer-secs" aria-hidden="true"></span></div>'
            + '<p class="game-timer-hurry" aria-live="polite" hidden></p>';
        host.appendChild(wrap);
        const bar = wrap.querySelector(".game-timer");
        const fill = wrap.querySelector(".game-timer-fill");
        const secs = wrap.querySelector(".game-timer-secs");
        const hurry = wrap.querySelector(".game-timer-hurry");
        let deadline = 0, limit = 1, raf = null, onExpire = null, fired = false, itemKey = null, shown = -1;

        function paint(left) {
            fill.style.transform = `scaleX(${Math.max(0, Math.min(1, left / limit))})`;
            const whole = Math.max(0, Math.ceil(left));
            if (whole === shown) return;
            shown = whole;
            const low = whole <= LOW_SECONDS;
            wrap.classList.toggle("is-low", low);
            secs.textContent = `${whole}s`;
            hurry.hidden = !low || whole <= 0;
            if (low && whole > 0) hurry.textContent = `\u23F0 Hurry! ${whole} second${whole === 1 ? "" : "s"} left`;
        }

        function frame() {
            const left = Math.max(0, (deadline - performance.now()) / 1000);
            paint(left);
            if (left <= 0) {
                raf = null;
                if (!fired && onExpire) {
                    fired = true;
                    onExpire(itemKey);
                }
                return;
            }
            raf = requestAnimationFrame(frame);
        }

        return {
            // timer: state.timer from the server; key: the item it belongs to
            sync(timer, key) {
                if (!timer) return;
                limit = Math.max(1, timer.limit || 1);
                if (key !== itemKey) fired = false;
                itemKey = key;
                deadline = performance.now() + (timer.seconds_left ?? limit) * 1000;
                wrap.hidden = false;
                shown = -1;
                if (timer.running) {
                    if (!raf) raf = requestAnimationFrame(frame);
                } else {
                    this.stop();
                    paint(timer.seconds_left ?? limit);
                }
            },
            stop() {
                if (raf) cancelAnimationFrame(raf);
                raf = null;
            },
            hide() {
                this.stop();
                wrap.hidden = true;
            },
            onExpire(fn) { onExpire = fn; },
            dispose() {
                this.stop();
                wrap.remove();
            }
        };
    }

    // The same clock drawn in several places - above the question AND inside
    // the game stage, so it stays in view when a phone shows the game full
    // screen. hosts: [element, ...]; the first is the normal bar, the rest
    // float over the stage. onExpire fires once.
    function timerBars(hosts) {
        const bars = hosts.filter(Boolean).map((host, i) => timerBar(host, i ? "is-stage" : ""));
        return {
            sync(timer, key) { bars.forEach((b) => b.sync(timer, key)); },
            stop() { bars.forEach((b) => b.stop()); },
            hide() { bars.forEach((b) => b.hide()); },
            onExpire(fn) { if (bars[0]) bars[0].onExpire(fn); },
            dispose() { bars.forEach((b) => b.dispose()); }
        };
    }

    // ---------------- notice ----------------
    // One-button notice in the shared confirmation modal (CobraProceed).
    // While it is open <html> carries NOTICE_CLASS: game-kit.css blurs the
    // game behind it so nothing can be read, and leaveGuard reports nothing.
    // onClose runs once, after the learner closed it - with "I understand",
    // or any other way the modal allows (the watcher below notices that).
    const NOTICE_CLASS = "game-notice-open";
    const NOTICE_BUTTON = "I understand";
    const NOTICE_WATCH_MS = 300;
    const NOTICE_WATCH_MISSES = 10;   // the popup never showed (3 s): do not leave the game covered
    let openNotice = null;            // { done: [fn], watch, seen, misses, focusBack }

    function noticeOpen() {
        return !!openNotice;
    }

    function nodeShown(node) {
        if (typeof node.checkVisibility === "function") {
            return node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        }
        return node.getClientRects().length > 0;
    }

    function noticeButtonShown() {
        const nodes = document.querySelectorAll("button, a, [role='button']");
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].textContent.trim() === NOTICE_BUTTON && nodeShown(nodes[i])) return true;
        }
        return false;
    }

    function finishNotice() {
        const current = openNotice;
        if (!current) return;
        openNotice = null;
        clearInterval(current.watch);
        document.documentElement.classList.remove(NOTICE_CLASS);
        // Back to where the learner was typing, if that box is still there.
        const box = current.focusBack;
        if (box && box.isConnected && !box.disabled && typeof box.focus === "function") {
            box.focus({ preventScroll: true });
        }
        current.done.forEach((fn) => {
            try { fn(); } catch (err) { console.error("game-kit: notice callback failed:", err); }
        });
    }

    function watchNotice() {
        const current = openNotice;
        if (!current) return;
        if (noticeButtonShown()) {
            current.seen = true;
        } else if (current.seen || ++current.misses >= NOTICE_WATCH_MISSES) {
            finishNotice();   // closed without the button (Esc, click outside), or never shown
        }
    }

    // icon and onClose are optional: notice(title, text) still works.
    function notice(title, text, icon, onClose) {
        if (typeof icon === "function") {
            onClose = icon;
            icon = null;
        }
        if (!(window.CobraProceed && window.CobraProceed.open)) {
            if (onClose) onClose();
            return;
        }
        // A second notice while one is open takes its place; both callbacks
        // run when the learner closes it.
        const current = openNotice || { done: [], watch: null, seen: false, misses: 0, focusBack: null };
        if (onClose) current.done.push(onClose);
        if (!openNotice) {
            const active = document.activeElement;
            if (active && active !== document.body && typeof active.blur === "function") {
                current.focusBack = active;
                active.blur();   // nothing can be typed into the game behind the notice
            }
            current.watch = setInterval(watchNotice, NOTICE_WATCH_MS);
        }
        current.seen = false;
        current.misses = 0;
        openNotice = current;
        document.documentElement.classList.add(NOTICE_CLASS);
        window.CobraProceed.open({
            icon: icon || "fa-triangle-exclamation", title, text,
            yesLabel: NOTICE_BUTTON, noLabel: false, onYes: finishNotice
        });
    }

    // ---------------- leaving the page ----------------
    // opts: {url, body(): {...}, isActive(): bool, onResult(data), minSeconds?(): number}
    // An absence shorter than the server's minimum (game_settings_tbl,
    // leave_min_seconds) is ignored there.
    //
    // fix/leave-guard-spam:
    //   - "left" and "came back" reach the server one at a time and in that
    //     order, so switching tabs quickly can't leave the play marked as away.
    //   - While a leave notice is open nothing is reported: leaving again
    //     before pressing "I understand" costs nothing more.
    //   - Coming back from an absence long enough to count (minSeconds) covers
    //     the game at once (CHECK_CLASS, blurred by game-kit.css) until the
    //     server has answered, so the reaction is immediate.
    const CHECK_CLASS = "game-leave-check";
    const START_WAIT_MS = 3000;    // "came back" never waits longer than this for a slow "left"
    const END_TIMEOUT_MS = 10000;  // give up on a "came back" report that gets no answer
    let covers = 0;                // open "checking" covers, over every guard on the page

    function setCover(on) {
        covers = Math.max(0, covers + (on ? 1 : -1));
        document.documentElement.classList.toggle(CHECK_CLASS, covers > 0);
    }

    function leaveGuard(opts) {
        let trip = null;                 // the absence in progress: { at, dropped }
        let reports = 0;                 // "came back" reports the server has not answered yet
        let chain = Promise.resolve();   // every report waits for the one before it
        let disposed = false;

        function payload(phase, extra) {
            return JSON.stringify(Object.assign({ phase }, opts.body(), extra || {}));
        }

        function post(body, keepalive, timeoutMs) {
            const controller = (timeoutMs && typeof AbortController === "function") ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
            return fetch(opts.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                keepalive: !!keepalive,   // a "left" report survives the tab being closed
                body: body,
                signal: controller ? controller.signal : undefined
            }).then((r) => r.json()).catch(() => null).then((data) => {
                if (timer) clearTimeout(timer);
                return data;
            });
        }

        function wait(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }

        function minSeconds() {
            const value = opts.minSeconds ? Number(opts.minSeconds()) : NaN;
            return Number.isFinite(value) ? value : Infinity;   // unknown -> never cover
        }

        function leave(reason) {
            if (disposed || trip || noticeOpen() || !opts.isActive()) return;
            const current = { at: Date.now(), dropped: false };
            trip = current;
            chain = chain.then(() => {
                // A notice opened while an earlier report was still on its way:
                // this absence is not counted.
                if (disposed || noticeOpen()) {
                    current.dropped = true;
                    return null;
                }
                return Promise.race([post(payload("start", { reason }), true), wait(START_WAIT_MS)]);
            }).catch(() => null);   // one failed report must not block the next ones
        }

        function back(reason) {
            const current = trip;
            if (disposed || !current) return;
            trip = null;
            const seconds = (Date.now() - current.at) / 1000;
            const covered = seconds >= minSeconds() && !noticeOpen();
            reports += 1;
            if (covered) setCover(true);
            chain = chain.then(() => {
                if (disposed || current.dropped) return null;
                return post(payload("end", { away_seconds: seconds, reason }), false, END_TIMEOUT_MS);
            }).catch(() => null).then((data) => {
                reports -= 1;
                try {
                    if (data && data.success && !disposed && opts.onResult) opts.onResult(data);
                } catch (err) {
                    console.error("game-kit: leave result failed:", err);
                }
                // After onResult, so a notice it opened is up before the cover goes.
                if (covered) setCover(false);
            });
        }

        function onVisibility() {
            if (document.hidden) leave("hidden");
            else back("hidden");
        }
        function onBlur() { leave("blur"); }
        function onFocus() { back("blur"); }
        function onPageHide() {
            // The tab is closing or reloading: a beacon is the surest way out.
            // A "left" the server already has is simply ignored there.
            if (disposed || noticeOpen() || !(trip || opts.isActive())) return;
            if (trip && trip.dropped) return;
            if (!trip) trip = { at: Date.now(), dropped: false };
            if (navigator.sendBeacon) {
                navigator.sendBeacon(opts.url, new Blob([payload("start", { reason: "closed_or_refreshed" })],
                    { type: "application/json" }));
            } else {
                post(payload("start", { reason: "closed_or_refreshed" }), true);
            }
        }

        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("blur", onBlur);
        window.addEventListener("focus", onFocus);
        window.addEventListener("pagehide", onPageHide);

        return {
            // true from the moment the learner leaves until the server has
            // answered the "came back" report (its answer carries the state).
            isReporting() { return !!trip || reports > 0; },
            dispose() {
                disposed = true;
                document.removeEventListener("visibilitychange", onVisibility);
                window.removeEventListener("blur", onBlur);
                window.removeEventListener("focus", onFocus);
                window.removeEventListener("pagehide", onPageHide);
            }
        };
    }

    // ------------------------------------------------------------
    // feat/game-countdown: nothing of a question is on screen (or even in
    // the browser) before its clock starts. A blurred cover over the game
    // shows a Start card, then "3 - 2 - 1"; only then does the game ask the
    // server to reveal the question - which starts its timer - and show it.
    //   startCard(host, opts) -> Promise, resolves when Start is pressed
    //     opts: { eyebrow, title, lines: [text...], button }
    //   countdown(host, opts) -> Promise, resolves after 3 - 2 - 1
    //     opts: { label, result }  label e.g. "Question 2 of 5"; result
    //     { ok, title, text } keeps the last answer's verdict on screen
    // The cover stays until hideCover(host) (or the next startCard/countdown),
    // so the game can fetch the question behind it without a flash.
    // ------------------------------------------------------------
    const COVER_CLASS = "game-ready-cover";
    const READY_NOTE = "The timer starts the moment each question appears.";

    function coverFor(host) {
        host.classList.add("game-ready-host");
        let cover = host.querySelector(":scope > ." + COVER_CLASS);
        if (!cover) {
            cover = document.createElement("div");
            cover.className = COVER_CLASS;
            host.appendChild(cover);
        }
        cover.hidden = false;
        return cover;
    }

    function hideCover(host) {
        const cover = host && host.querySelector(":scope > ." + COVER_CLASS);
        if (cover) {
            cover.hidden = true;
            cover.innerHTML = "";
        }
    }

    function startCard(host, opts) {
        opts = opts || {};
        const cover = coverFor(host);
        cover.innerHTML = "";
        const card = document.createElement("div");
        card.className = "game-ready-card";
        const add = (tag, cls, text) => {
            const node = document.createElement(tag);
            node.className = cls;
            node.textContent = text;
            card.appendChild(node);
            return node;
        };
        if (opts.eyebrow) add("span", "game-ready-eyebrow", opts.eyebrow);
        add("h4", "game-ready-title", opts.title || "Ready to play?");
        const list = document.createElement("ul");
        list.className = "game-ready-lines";
        (opts.lines || []).filter(Boolean).forEach((text) => {
            const li = document.createElement("li");
            li.textContent = text;
            list.appendChild(li);
        });
        if (list.children.length) card.appendChild(list);
        const note = add("p", "game-ready-note", "");
        note.innerHTML = '<i class="fa-solid fa-stopwatch"></i> ';
        note.appendChild(document.createTextNode(opts.note || READY_NOTE));
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "game-ready-btn";
        btn.innerHTML = '<i class="fa-solid fa-play"></i> ';
        btn.appendChild(document.createTextNode(opts.button || "Start"));
        card.appendChild(btn);
        cover.appendChild(card);
        return new Promise((resolve) => {
            btn.addEventListener("click", () => {
                btn.disabled = true;
                resolve();
            }, { once: true });
            setTimeout(() => btn.focus({ preventScroll: true }), 50);
        });
    }

    function countdown(host, opts) {
        opts = opts || {};
        const cover = coverFor(host);
        cover.innerHTML = "";
        const box = document.createElement("div");
        box.className = "game-ready-count";
        box.setAttribute("aria-live", "assertive");
        if (opts.result) {
            const verdict = document.createElement("div");
            verdict.className = "game-ready-result " + (opts.result.ok ? "is-ok" : "is-bad");
            const head = document.createElement("b");
            head.textContent = opts.result.title || (opts.result.ok ? "Correct!" : "Not quite");
            verdict.appendChild(head);
            if (opts.result.text) {
                const body = document.createElement("span");
                body.textContent = opts.result.text;
                verdict.appendChild(body);
            }
            box.appendChild(verdict);
        }
        const label = document.createElement("span");
        label.className = "game-ready-count-label";
        label.textContent = opts.label || "Get ready";
        const number = document.createElement("b");
        number.className = "game-ready-count-number";
        const sub = document.createElement("span");
        sub.className = "game-ready-count-sub";
        sub.textContent = "The question and its timer start together.";
        box.append(label, number, sub);
        cover.appendChild(box);
        const steps = [3, 2, 1];
        return new Promise((resolve) => {
            let i = 0;
            const show = () => {
                if (i >= steps.length) {
                    resolve();
                    return;
                }
                number.textContent = String(steps[i]);
                number.classList.remove("is-tick");
                void number.offsetWidth;   // restart the pop animation
                number.classList.add("is-tick");
                i += 1;
                setTimeout(show, 1000);
            };
            show();
        });
    }

    // The line above a feedback's Next button: the game waits for the
    // learner, and the next timer only starts after the 3 - 2 - 1.
    function nextNoteText(last) {
        return last ? "\uD83D\uDC49 Tap the button when you're ready to see your results."
            : "\uD83D\uDC49 Tap Next when you're ready - the next question's timer starts only after the 3 - 2 - 1.";
    }

    window.CobraGameKit = { hearts, livesText, timerBar, timerBars, leaveGuard, notice, noticeOpen,
        startCard, countdown, hideCover, nextNoteText };
})();