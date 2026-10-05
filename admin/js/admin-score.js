/**
 * admin-score.js - one color rule for every score shown on the admin side
 * --------------------------------------------------------------------------
 *   below the pass mark  -> red     (.score-fail, badge-locked pill)
 *   pass mark and above  -> green   (.score-pass, badge-active pill)
 *   no score ("—")       -> neutral (.score-none)
 *
 * The pass mark comes from the server (activity_retakes.PASS_PERCENT) through
 * the staff header's data-pass-mark, so it is never typed in a page script.
 * Server-rendered numbers use the matching Jinja filters (score_display.py).
 * Colors live in admin-style.css (--score-pass / --score-fail); color() reads
 * them back for canvases (Analytics charts), which can't use a CSS class.
 *
 * Loaded by admin-header.html, before every page's own scripts.
 */
(function () {
    "use strict";

    const CLASSES = ["score-pass", "score-fail", "score-none"];

    function readPassMark() {
        const header = document.querySelector("[data-pass-mark]");
        const value = header ? parseFloat(header.dataset.passMark) : NaN;
        return Number.isFinite(value) ? value : null;
    }

    let passMark = null;

    function mark() {
        if (passMark === null) passMark = readPassMark();
        return passMark;
    }

    // 60, "60%", " 60 % " -> 60; null, "", "—" -> null
    function value(v) {
        if (v === null || v === undefined || typeof v === "boolean") return null;
        const n = typeof v === "number" ? v : parseFloat(String(v).replace("%", "").trim());
        return Number.isFinite(n) ? n : null;
    }

    function passes(v) {
        const n = value(v);
        const m = mark();
        if (n === null || m === null) return null;
        return n >= m;
    }

    function cls(v) {
        const p = passes(v);
        return p === null ? "score-none" : (p ? "score-pass" : "score-fail");
    }

    function badgeClass(v) {
        const p = passes(v);
        return p === null ? "" : (p ? "badge-active" : "badge-locked");
    }

    // Put the right class on an element that shows a score (e.g. a stat card).
    function apply(el, v) {
        if (!el) return;
        const next = cls(v);
        CLASSES.forEach((c) => { if (c !== next) el.classList.remove(c); });
        el.classList.add(next);
    }

    function cssVar(name, fallback) {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return raw || fallback;
    }

    // Fill color for a score drawn on a canvas.
    function color(v) {
        const p = passes(v);
        if (p === null) return cssVar("--score-none", "#6b7280");
        return p ? cssVar("--score-pass", "#0F7A3D") : cssVar("--score-fail", "#C62828");
    }

    window.CobraScore = { passMark: mark, value, passes, cls, badgeClass, apply, color };
})();
