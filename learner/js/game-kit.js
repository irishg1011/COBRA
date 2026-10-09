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
 *                                       leaves (beacon) and comes back.
 *   CobraGameKit.notice(title, text)    one-button notice in the shared
 *                                       confirmation modal (CobraProceed)
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
    function timerBar(host, extraClass) {
        const bar = document.createElement("div");
        bar.className = "game-timer" + (extraClass ? " " + extraClass : "");
        bar.setAttribute("role", "presentation");
        bar.innerHTML = '<div class="game-timer-fill"></div>';
        host.appendChild(bar);
        const fill = bar.firstChild;
        let deadline = 0, limit = 1, raf = null, onExpire = null, fired = false, itemKey = null;

        function frame() {
            const left = Math.max(0, (deadline - performance.now()) / 1000);
            fill.style.transform = `scaleX(${Math.max(0, Math.min(1, left / limit))})`;
            bar.classList.toggle("is-low", left <= 10);
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
                bar.hidden = false;
                if (timer.running) {
                    if (!raf) raf = requestAnimationFrame(frame);
                } else {
                    this.stop();
                    fill.style.transform = `scaleX(${Math.max(0, Math.min(1, (timer.seconds_left ?? limit) / limit))})`;
                }
            },
            stop() {
                if (raf) cancelAnimationFrame(raf);
                raf = null;
            },
            hide() {
                this.stop();
                bar.hidden = true;
            },
            onExpire(fn) { onExpire = fn; },
            dispose() {
                this.stop();
                bar.remove();
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

    // ---------------- leaving the page ----------------
    // opts: {url, body(): {...}, isActive(): bool, onResult(data)}
    // A blur shorter than the server's minimum (about 2 s) is ignored there.
    function leaveGuard(opts) {
        let away = false, awayAt = 0, disposed = false;

        function send(phase, extra) {
            const payload = JSON.stringify(Object.assign({ phase }, opts.body(), extra || {}));
            if (phase === "start" && navigator.sendBeacon) {
                navigator.sendBeacon(opts.url, new Blob([payload], { type: "application/json" }));
                return Promise.resolve(null);
            }
            return fetch(opts.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                keepalive: phase === "start",
                body: payload
            }).then((r) => r.json()).catch(() => null);
        }

        function leave(reason) {
            if (disposed || away || !opts.isActive()) return;
            away = true;
            awayAt = Date.now();
            send("start", { reason });
        }

        function back(reason) {
            if (disposed || !away) return;
            away = false;
            const seconds = (Date.now() - awayAt) / 1000;
            send("end", { away_seconds: seconds, reason }).then((data) => {
                if (data && data.success && !disposed && opts.onResult) opts.onResult(data);
            });
        }

        function onVisibility() {
            if (document.hidden) leave("hidden");
            else back("hidden");
        }
        function onBlur() { leave("blur"); }
        function onFocus() { back("blur"); }
        function onPageHide() { leave("closed_or_refreshed"); }

        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("blur", onBlur);
        window.addEventListener("focus", onFocus);
        window.addEventListener("pagehide", onPageHide);

        return {
            dispose() {
                disposed = true;
                document.removeEventListener("visibilitychange", onVisibility);
                window.removeEventListener("blur", onBlur);
                window.removeEventListener("focus", onFocus);
                window.removeEventListener("pagehide", onPageHide);
            }
        };
    }

    function notice(title, text, icon) {
        if (window.CobraProceed) {
            window.CobraProceed.open({ icon: icon || "fa-triangle-exclamation", title, text, yesLabel: "I understand", noLabel: false });
        }
    }

    window.CobraGameKit = { hearts, livesText, timerBar, timerBars, leaveGuard, notice };
})();
