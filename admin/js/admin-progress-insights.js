/**
 * admin-progress-insights.js - shared pieces of Learner Progress
 * (feat/learner-progress-insights). Loaded before the page scripts.
 * --------------------------------------------------------------------
 *   CobraInsights.settings       thresholds from the server (progress_insights.py)
 *   band(score)                  "pass" | "close" | "fail" | "none"
 *   scoreHtml(score)             coloured pill: green / yellow / red / "—"
 *   chipHtml(status)             On track / Needs help / Inactive / ...
 *   info(text)                   the (i) tooltip
 *   trendHtml(trend)             ▲ ▼ ▬ arrow with its own tooltip
 *   barHtml(value, max, label)   small bar with "value of max"
 *   learnerHtml(accId, name, avatar)
 *   downloadCsv(name, columns, rows)   formula-safe, UTF-8 BOM
 *   memory.load() / memory.save({cat_id, module_id, status})
 *        Chapter / Module / Status are remembered between visits and
 *        between the By Lesson and By Learner tabs.
 */
(function () {
    "use strict";

    function readJson(id, fallback) {
        const el = document.getElementById(id);
        if (!el) return fallback;
        try { return JSON.parse(el.textContent || "null") || fallback; } catch (e) { return fallback; }
    }

    const settings = readJson("lpSettings", {});
    const passMark = Number(settings.pass_mark || (window.CobraScore && CobraScore.passMark()) || 80);
    const closeFrom = Number(settings.close_from || passMark - 10);
    const labels = settings.status_labels || {};

    function esc(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function num(v) {
        if (v === null || v === undefined || v === "" || v === "—") return null;
        const n = typeof v === "number" ? v : parseFloat(String(v).replace("%", ""));
        return Number.isFinite(n) ? n : null;
    }

    function band(score) {
        const n = num(score);
        if (n === null) return "none";
        if (n >= passMark) return "pass";
        if (n >= closeFrom) return "close";
        return "fail";
    }

    const BAND_TEXT = {
        pass: `Passed (${passMark}% or more)`,
        close: `Close (${closeFrom}–${passMark - 1}%)`,
        fail: `Needs help (below ${closeFrom}%)`,
        none: "No score yet",
    };

    function scoreHtml(score, title) {
        const n = num(score);
        if (n === null) return `<span class="progress-no-score" title="No score yet">—</span>`;
        const b = band(n);
        return `<span class="badge lp-band lp-band-${b}" title="${esc(title || BAND_TEXT[b])}">${esc(Math.round(n))}%</span>`;
    }

    function chipHtml(status, label) {
        if (!status) return "";
        return `<span class="lp-chip lp-chip-${esc(status)}">${esc(label || labels[status] || status)}</span>`;
    }

    function info(text) {
        return `<span class="lp-info" tabindex="0" role="note" aria-label="${esc(text)}" data-tip="${esc(text)}">i</span>`;
    }

    function trendHtml(trend) {
        if (!trend || !trend.direction) {
            return `<span class="lp-trend lp-trend-none" title="Not enough finished lessons in the last ${settings.trend_days || 14} days and the ${settings.trend_days || 14} days before to compare.">–</span>`;
        }
        const map = { up: ["▲", "Going up"], down: ["▼", "Going down"], same: ["▬", "About the same"] };
        const [arrow, words] = map[trend.direction] || ["–", ""];
        const tip = `${words}: ${trend.recent}% in the last ${settings.trend_days || 14} days vs ${trend.before}% the ${settings.trend_days || 14} days before.`;
        return `<span class="lp-trend lp-trend-${esc(trend.direction)}" title="${esc(tip)}" aria-label="${esc(tip)}">${arrow}</span>`;
    }

    function barHtml(value, max, label) {
        const v = Number(value) || 0;
        const m = Number(max) || 0;
        const pct = m ? Math.round((v / m) * 100) : 0;
        return `<div class="lp-bar-cell">
            <span class="lp-bar" aria-hidden="true"><span class="lp-bar-fill" style="width:${pct}%"></span></span>
            <small>${esc(label != null ? label : `${v} of ${m}`)}</small>
        </div>`;
    }

    function learnerHtml(accId, name, avatarUrl) {
        const avatar = window.CobraAvatar ? CobraAvatar.html(avatarUrl) : "";
        const pic = window.CobraPresence && avatar ? CobraPresence.avatar(accId, avatar) : avatar;
        return `<div class="profile-cell">${pic}<span class="lp-learner-name"><strong>${esc(name)}</strong><small>${esc(accId)}</small></span></div>`;
    }

    // ---------- CSV ----------
    function csvCell(v) {
        let s = v == null ? "" : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // never a spreadsheet formula
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }

    function downloadCsv(filename, columns, rows) {
        const lines = [columns.map((c) => csvCell(c.label)).join(",")];
        rows.forEach((r) => lines.push(columns.map((c) => csvCell(r[c.key])).join(",")));
        const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 0);
    }

    // ---------- remembered filters ----------
    const MEMORY_KEY = "cobra.learnerProgress.filters";
    const memory = {
        load() {
            try { return JSON.parse(window.localStorage.getItem(MEMORY_KEY) || "{}") || {}; } catch (e) { return {}; }
        },
        save(values) {
            try { window.localStorage.setItem(MEMORY_KEY, JSON.stringify(values || {})); } catch (e) { /* private mode */ }
        },
    };

    // Puts remembered Chapter / Module / Status on the selects when the
    // page was opened without filters in its address. Returns true when
    // something changed (the page then fetches again).
    function restoreFilters(chapterSelect, moduleSelect, statusSelect, rebuildModules) {
        if (window.location.search) return false;
        const saved = memory.load();
        let changed = false;
        if (chapterSelect && saved.cat_id && chapterSelect.querySelector(`option[value="${CSS.escape(saved.cat_id)}"]`)) {
            chapterSelect.value = saved.cat_id;
            rebuildModules(saved.cat_id, saved.module_id || "");
            changed = true;
        }
        if (statusSelect && saved.status && statusSelect.querySelector(`option[value="${CSS.escape(saved.status)}"]`)) {
            statusSelect.value = saved.status;
            changed = true;
        }
        return changed;
    }

    function rememberFilters(chapterSelect, moduleSelect, statusSelect) {
        memory.save({
            cat_id: chapterSelect ? chapterSelect.value : "",
            module_id: moduleSelect && !moduleSelect.disabled ? moduleSelect.value : "",
            status: statusSelect ? statusSelect.value : "",
        });
    }

    window.CobraInsights = {
        settings, passMark, closeFrom, labels, readJson, esc, num, band, bandText: BAND_TEXT,
        scoreHtml, chipHtml, info, trendHtml, barHtml, learnerHtml, downloadCsv, memory,
        restoreFilters, rememberFilters,
    };
})();
