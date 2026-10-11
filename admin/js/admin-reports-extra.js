/**
 * admin-reports-extra.js - Reports tabs, CSV and PDF (feat/dashboard-reports)
 * --------------------------------------------------------------------
 *   Learner ranking        (admin-reports.js - unchanged)
 *   By chapter & module    GET /admin/reports/course?cat_id&module_id
 *   Certificates           GET /admin/reports/certificates?q
 * Export CSV = the tab you're on, with the filters in use (formula-safe,
 * CobraInsights.downloadCsv). Export PDF = the print layout of the tab
 * you're on (admin-reports.js opens the print window; pick "Save as PDF").
 * The open tab is remembered in this browser. Read-only.
 */
(function () {
    "use strict";

    const TAB_KEY = "cobra.reports.tab";
    const TITLES = {
        ranking: "Learner Performance Ranking",
        course: "Report by Chapter & Module",
        certificates: "Certificates Issued",
    };

    document.addEventListener("DOMContentLoaded", () => {
        const I = window.CobraInsights;
        const esc = I.esc;
        const tabs = Array.from(document.querySelectorAll("[data-report-tab]"));
        const panels = Array.from(document.querySelectorAll("[data-report-panel]"));
        if (!tabs.length) return;
        const searchInput = document.getElementById("reportSearchInput");
        const chapterSelect = document.getElementById("reportChapterSelect");
        const moduleSelect = document.getElementById("reportModuleSelect");
        const courseBody = document.getElementById("reportCourseBody");
        const certBody = document.getElementById("reportCertBody");
        const certCount = document.getElementById("reportCertCount");
        const csvBtn = document.getElementById("reportCsvBtn");
        const printTitle = document.querySelector(".report-print-header h2");

        let current = "ranking";
        let courseData = null;
        let certData = null;
        let courseReq = 0;
        let certReq = 0;
        let debounce = null;

        function filterParams(withSearch, withScope) {
            const params = new URLSearchParams();
            if (withSearch && searchInput && searchInput.value.trim()) params.set("q", searchInput.value.trim());
            if (withScope && chapterSelect && chapterSelect.value) params.set("cat_id", chapterSelect.value);
            if (withScope && moduleSelect && !moduleSelect.disabled && moduleSelect.value) params.set("module_id", moduleSelect.value);
            return params;
        }

        async function getJson(url) {
            const response = await fetch(url, { headers: { "X-Requested-With": "XMLHttpRequest" }, credentials: "include" });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || `HTTP ${response.status}`);
            return data;
        }

        // ---------- By chapter & module ----------
        function hardest(h) {
            return h ? `${esc(h.type)} ${I.scoreHtml(h.percent)}` : '<span class="progress-no-score">—</span>';
        }

        function courseRow(r, isModule) {
            return `<tr class="${isModule ? "report-course-module" : "report-course-chapter"}">
                <td>${isModule ? "↳ " : `<strong>Chapter ${esc(r.number)}:</strong> `}${esc(r.name)}</td>
                <td>${esc(r.lessons)}</td>
                <td>${esc(r.started)} <small class="text-muted">of ${esc(r.learners)}</small></td>
                <td>${esc(r.finished)}</td>
                <td>${I.scoreHtml(r.avg_score)}</td>
                <td>${r.pass_rate === null ? '<span class="progress-no-score">—</span>' : `${esc(r.pass_rate)}% <small class="text-muted">(${esc(r.finished_lessons)} lessons)</small>`}</td>
                <td>${hardest(r.hardest)}</td>
            </tr>`;
        }

        async function loadCourse() {
            const id = ++courseReq;
            try {
                const data = await getJson(`/admin/reports/course?${filterParams(false, true).toString()}`);
                if (id !== courseReq) return;
                courseData = data;
                courseBody.innerHTML = data.chapters.length
                    ? data.chapters.map((ch) => courseRow(ch, false) + ch.modules.map((m) => courseRow(m, true)).join("")).join("")
                    : `<tr><td colspan="7" class="text-muted table-empty-message">No published lessons for this filter.</td></tr>`;
            } catch (err) {
                if (id === courseReq) courseBody.innerHTML = `<tr><td colspan="7" class="text-muted table-empty-message">Couldn't load this report.</td></tr>`;
            }
        }

        // ---------- Certificates ----------
        async function loadCertificates() {
            const id = ++certReq;
            try {
                const data = await getJson(`/admin/reports/certificates?${filterParams(true, false).toString()}`);
                if (id !== certReq) return;
                certData = data;
                certBody.innerHTML = data.certificates.length
                    ? data.certificates.map((c) => `<tr>
                        <td><div class="report-learner-cell"><strong>${esc(c.name)}</strong><small class="text-muted">${esc(c.acc_id)}</small></div></td>
                        <td><code>${esc(c.reference_no)}</code></td>
                        <td>${esc(c.course_name)}</td>
                        <td>${esc(c.issued_at)}</td></tr>`).join("")
                    : `<tr><td colspan="4" class="text-muted table-empty-message">No certificates issued yet${searchInput && searchInput.value.trim() ? " for this search" : ""}.</td></tr>`;
                certCount.textContent = `${data.total} certificate${data.total === 1 ? "" : "s"}`;
            } catch (err) {
                if (id === certReq) certBody.innerHTML = `<tr><td colspan="4" class="text-muted table-empty-message">Couldn't load certificates.</td></tr>`;
            }
        }

        // ---------- tabs ----------
        function show(tab) {
            if (!TITLES[tab]) tab = "ranking";
            current = tab;
            tabs.forEach((t) => {
                const on = t.dataset.reportTab === tab;
                t.classList.toggle("is-active", on);
                t.setAttribute("aria-selected", on ? "true" : "false");
            });
            panels.forEach((p) => { p.hidden = p.dataset.reportPanel !== tab; });
            document.body.dataset.reportTab = tab;
            if (printTitle) printTitle.textContent = `CobraByte — ${TITLES[tab]}`;
            try { window.localStorage.setItem(TAB_KEY, tab); } catch (e) { /* private mode */ }
            if (tab === "course") loadCourse();
            if (tab === "certificates") loadCertificates();
        }

        tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.reportTab)));

        // Filters also drive the other tabs (admin-reports.js keeps driving the ranking).
        [chapterSelect, moduleSelect].forEach((el) => {
            if (el) el.addEventListener("change", () => { if (current === "course") setTimeout(loadCourse, 0); });
        });
        if (searchInput) {
            searchInput.addEventListener("input", () => {
                if (current !== "certificates") return;
                clearTimeout(debounce);
                debounce = setTimeout(loadCertificates, 300);
            });
        }

        // ---------- CSV ----------
        if (csvBtn) {
            csvBtn.addEventListener("click", async () => {
                const stamp = new Date().toISOString().slice(0, 10);
                try {
                    if (current === "ranking") {
                        const data = await getJson(`/admin/reports/data?${filterParams(true, true).toString()}`);
                        I.downloadCsv(`report-ranking-${stamp}.csv`, [
                            { key: "rank", label: "Rank" }, { key: "acc_id", label: "Learner ID" }, { key: "name", label: "Name" },
                            { key: "avg_score", label: "Avg score %" }, { key: "completion", label: "Completion %" },
                            { key: "lessons", label: "Lessons" }, { key: "last_active", label: "Last active" },
                            { key: "level", label: "Performance level" },
                        ], data.learners.map((l) => ({ ...l, rank: l.rank === null ? "" : l.rank,
                            avg_score: l.avg_score === null ? "" : l.avg_score,
                            lessons: `${l.lessons_completed} of ${l.lessons_total}` })));
                    } else if (current === "course") {
                        if (!courseData) await loadCourse();
                        const rows = [];
                        (courseData ? courseData.chapters : []).forEach((ch) => {
                            rows.push({ ...ch, level: "Chapter", chapter: ch.name, module: "" });
                            ch.modules.forEach((m) => rows.push({ ...m, level: "Module", chapter: ch.name, module: m.name }));
                        });
                        I.downloadCsv(`report-chapters-modules-${stamp}.csv`, [
                            { key: "level", label: "Level" }, { key: "chapter", label: "Chapter" }, { key: "module", label: "Module" },
                            { key: "lessons", label: "Lessons" }, { key: "started", label: "Learners started" },
                            { key: "finished", label: "Learners finished" }, { key: "avg_score", label: "Avg score %" },
                            { key: "pass_rate", label: "Pass rate %" }, { key: "hardest_text", label: "Hardest part" },
                        ], rows.map((r) => ({ ...r, avg_score: r.avg_score ?? "", pass_rate: r.pass_rate ?? "",
                            hardest_text: r.hardest ? `${r.hardest.type} ${r.hardest.percent}%` : "" })));
                    } else {
                        if (!certData) await loadCertificates();
                        I.downloadCsv(`report-certificates-${stamp}.csv`, [
                            { key: "acc_id", label: "Learner ID" }, { key: "name", label: "Name" },
                            { key: "reference_no", label: "Reference no." }, { key: "course_name", label: "Course" },
                            { key: "issued_at", label: "Issued" },
                        ], certData ? certData.certificates : []);
                    }
                } catch (err) {
                    const el = document.getElementById("reportLoadError");
                    if (el) { el.textContent = "Couldn't export right now. Please try again."; el.classList.add("is-visible"); }
                }
            });
        }

        let saved = "ranking";
        try { saved = window.localStorage.getItem(TAB_KEY) || "ranking"; } catch (e) { /* private mode */ }
        show(saved);
    });
})();
