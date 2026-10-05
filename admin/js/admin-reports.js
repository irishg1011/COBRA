/**
 * admin-reports.js - Admin > Reports (learner performance ranking)
 * --------------------------------------------------------------------
 * The page is server-rendered with the full ranking. This file:
 *   1. Re-loads the ranking + summary cards live when the Chapter /
 *      Module / search filters change (GET /admin/reports/data).
 *      Chapter -> Module is filtered in the browser from the options
 *      the server rendered (same as Learner Progress -> By Learner).
 *   2. Print: fills the print-only header (filters in use + date) and
 *      calls window.print(). reports.css hides the sidebar, header and
 *      filters on paper.
 * Read-only: nothing here changes data. Errors show inline under the
 * filters - never alert().
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;
    const LEVEL_CLASS = {
        "Excellent": "level-excellent",
        "Good": "level-good",
        "Needs Improvement": "level-needs-improvement",
    };

    document.addEventListener("DOMContentLoaded", () => {
        const tableBody = document.getElementById("reportTableBody");
        if (!tableBody) return;

        const searchInput = document.getElementById("reportSearchInput");
        const chapterSelect = document.getElementById("reportChapterSelect");
        const moduleSelect = document.getElementById("reportModuleSelect");
        const printBtn = document.getElementById("reportPrintBtn");
        const loadError = document.getElementById("reportLoadError");
        const showingCount = document.getElementById("reportShowingCount");
        const printFilters = document.getElementById("reportPrintFilters");
        const printDate = document.getElementById("reportPrintDate");

        const cards = {
            total: document.getElementById("reportTotalLearners"),
            ranked: document.getElementById("reportRankedLearners"),
            average: document.getElementById("reportAverageScore"),
            top: document.getElementById("reportTopPerformer"),
            excellent: document.getElementById("reportExcellent"),
            needs: document.getElementById("reportNeedsImprovement"),
        };

        let debounceTimer = null;
        let activeRequestId = 0;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function pct(value) {
            return value === null || value === undefined ? "—" : `${escapeHtml(value)}%`;
        }

        // ------------------------------------------------------------
        // Chapter -> Module (options come from the server-rendered list)
        // ------------------------------------------------------------
        const allModules = moduleSelect
            ? Array.from(moduleSelect.querySelectorAll("option[data-cat-id]")).map((o) => ({
                value: o.value,
                label: o.textContent,
                catId: o.dataset.catId,
            }))
            : [];

        function rebuildModules(catId, keepValue) {
            if (!moduleSelect) return;
            const options = allModules.filter((m) => m.catId === catId);
            moduleSelect.innerHTML = `<option value="">All Modules</option>` + options
                .map((m) => `<option value="${escapeHtml(m.value)}" data-cat-id="${escapeHtml(m.catId)}">${escapeHtml(m.label)}</option>`)
                .join("");
            moduleSelect.disabled = !catId;
            moduleSelect.value = options.some((m) => m.value === keepValue) ? keepValue : "";
        }

        if (chapterSelect && moduleSelect) rebuildModules(chapterSelect.value, moduleSelect.value);

        // ------------------------------------------------------------
        // Rendering
        // ------------------------------------------------------------
        function rowHtml(l) {
            const unrated = l.rank === null || l.rank === undefined;
            const completion = Number(l.completion) || 0;
            const levelClass = LEVEL_CLASS[l.level] || "level-not-rated";
            return `
                <tr class="${unrated ? "report-row-unrated" : ""}">
                    <td class="report-rank">${unrated ? "—" : escapeHtml(l.rank)}</td>
                    <td>
                        <div class="report-learner-cell">
                            <strong>${escapeHtml(l.name)}</strong>
                            <small class="text-muted">${escapeHtml(l.acc_id)}</small>
                        </div>
                    </td>
                    <td class="${CobraScore.cls(l.avg_score)}">${pct(l.avg_score)}</td>
                    <td>
                        <div class="completion-cell">
                            <progress class="completion-bar" value="${completion}" max="100" aria-label="Completion ${completion}%"></progress>
                            <span class="completion-pct">${completion}%</span>
                        </div>
                    </td>
                    <td>${escapeHtml(l.lessons_completed)}/${escapeHtml(l.lessons_total)}</td>
                    <td>${escapeHtml(l.last_active)}</td>
                    <td><span class="badge report-level ${levelClass}">${escapeHtml(l.level)}</span></td>
                </tr>`;
        }

        function renderTable(learners) {
            tableBody.innerHTML = learners.length
                ? learners.map(rowHtml).join("")
                : `<tr><td colspan="7" class="text-muted table-empty-message">No learners found.</td></tr>`;
            if (showingCount) showingCount.textContent = `${learners.length} learner${learners.length === 1 ? "" : "s"}`;
        }

        function renderSummary(s) {
            if (!s) return;
            if (cards.total) cards.total.textContent = s.total_learners;
            if (cards.ranked) cards.ranked.textContent = s.ranked_learners;
            if (cards.average) {
                cards.average.textContent = pct(s.average_score);
                CobraScore.apply(cards.average, s.average_score);
            }
            if (cards.excellent) cards.excellent.textContent = s.excellent;
            if (cards.needs) cards.needs.textContent = s.needs_improvement;
            if (cards.top) {
                cards.top.innerHTML = s.top_performer
                    ? `<span class="report-top-name">${escapeHtml(s.top_performer.name)}</span>
                       <small class="report-top-score ${CobraScore.cls(s.top_performer.avg_score)}">${pct(s.top_performer.avg_score)}</small>`
                    : "—";
            }
        }

        function showError(message) {
            if (!loadError) return;
            loadError.textContent = message || "";
            loadError.classList.toggle("is-visible", Boolean(message));
        }

        // ------------------------------------------------------------
        // Live filters
        // ------------------------------------------------------------
        function buildParams() {
            const params = new URLSearchParams();
            const q = searchInput ? searchInput.value.trim() : "";
            if (q) params.set("q", q);
            if (chapterSelect && chapterSelect.value) params.set("cat_id", chapterSelect.value);
            if (moduleSelect && moduleSelect.value) params.set("module_id", moduleSelect.value);
            return params;
        }

        async function loadRanking() {
            const requestId = ++activeRequestId;
            const params = buildParams();
            // Keep the URL shareable / reload-safe (page renders the same filters).
            try {
                const url = new URL(window.location.href);
                url.search = params.toString();
                window.history.replaceState(null, "", url.toString());
            } catch (e) { /* older browsers: filtering still works */ }

            try {
                const resp = await fetch(`/admin/reports/data?${params.toString()}`, { credentials: "same-origin" });
                const result = await resp.json().catch(() => ({ success: false }));
                if (requestId !== activeRequestId) return; // a newer filter change won
                if (!result.success) {
                    showError(result.message || "Could not load the report. Please try again.");
                    return;
                }
                showError("");
                renderTable(result.learners || []);
                renderSummary(result.summary);
                updatePrintHeader();
            } catch (err) {
                if (requestId === activeRequestId) showError("Could not reach the server. Please try again.");
            }
        }

        if (searchInput) {
            searchInput.addEventListener("input", () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(loadRanking, DEBOUNCE_MS);
            });
        }
        if (chapterSelect) {
            chapterSelect.addEventListener("change", () => {
                rebuildModules(chapterSelect.value, "");
                loadRanking();
            });
        }
        if (moduleSelect) moduleSelect.addEventListener("change", loadRanking);

        // ------------------------------------------------------------
        // Print
        // ------------------------------------------------------------
        function selectedText(select, fallback) {
            if (!select || !select.value) return fallback;
            const option = select.options[select.selectedIndex];
            return option ? option.textContent.trim() : fallback;
        }

        function updatePrintHeader() {
            if (printFilters) {
                const parts = [
                    `Chapter: ${selectedText(chapterSelect, "All chapters")}`,
                    `Module: ${selectedText(moduleSelect, "All modules")}`,
                ];
                const q = searchInput ? searchInput.value.trim() : "";
                if (q) parts.push(`Search: "${q}"`);
                printFilters.textContent = parts.join(" · ");
            }
            if (printDate) {
                const now = new Date();
                printDate.textContent = `Printed ${now.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}, ${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
            }
        }

        updatePrintHeader();
        window.addEventListener("beforeprint", updatePrintHeader); // also covers Ctrl+P
        if (printBtn) {
            printBtn.addEventListener("click", () => {
                updatePrintHeader();
                window.print();
            });
        }
    });
})();
