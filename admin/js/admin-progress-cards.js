/**
 * admin-progress-cards.js - clickable metric cards on Learner Progress
 * (feat/learner-progress-insights)
 * --------------------------------------------------------------------
 * Each card carries data-lp-card="<kind>". Click / Enter / Space opens
 * #lpCardModal (progress-card-modal.html) with
 * /admin/learner-progress/cards/<view>/<kind>?<the page's filters>.
 * The modal has a search box, CSV export (what the search shows) and
 * clickable rows:
 *     learner -> Course Progress modal   (CobraLearnerCourseModal)
 *     lesson  -> the lesson's modal      (CobraLessonModal)
 *     record  -> one learner in a lesson (CobraLessonProgressModal)
 * Those open ON TOP of this modal, so it is placed first in the page.
 *
 *   CobraProgressCards.init({ view: "lessons" | "learners", params: () => URLSearchParams })
 * feat/analytics-insights: also Admin > Analytics -
 *   init({ endpoint: "/admin/analytics/details", params, csvPrefix: "analytics" })
 *   CobraProgressCards.open(kind, trigger, { key })   (a chart bar / point)
 * Cards may carry data-lp-key for that extra key.
 */
(function () {
    "use strict";

    const I = () => window.CobraInsights;

    function init(options) {
        const modal = document.getElementById("lpCardModal");
        if (!modal) return;
        const titleEl = document.getElementById("lpCardTitle");
        const subEl = document.getElementById("lpCardSubtitle");
        const errorEl = document.getElementById("lpCardError");
        const contentEl = document.getElementById("lpCardContent");
        const searchEl = document.getElementById("lpCardSearch");
        const bandsEl = document.getElementById("lpCardBands");
        const exportBtn = document.getElementById("lpCardExport");
        const closeBtn = document.getElementById("lpCardClose");

        let current = null;      // the loaded card
        let kindOpen = "";
        let requestId = 0;
        let lastFocused = null;

        function setError(message) {
            errorEl.textContent = message || "";
            errorEl.classList.toggle("is-visible", !!message);
        }

        function cellHtml(col, value) {
            const ins = I();
            switch (col.type) {
                case "learner":
                    return value ? ins.learnerHtml(value.acc_id, value.name, null) : "—";
                case "score":
                    return ins.scoreHtml(value);
                case "percent":
                    return value === null || value === undefined ? "—" : `${ins.esc(value)}%`;
                case "status":
                    return ins.chipHtml(value);
                case "reasons":
                    return (value || []).map((r) => `<span class="lp-reason">${ins.esc(r)}</span>`).join(" ");
                case "bar":
                    return value ? ins.barHtml(value.value, value.max) : "—";
                default:
                    return ins.esc(value === null || value === undefined ? "—" : value);
            }
        }

        function cellText(col, value) {
            if (value === null || value === undefined) return "";
            if (col.type === "learner") return `${value.name} (${value.acc_id})`;
            if (col.type === "score" || col.type === "percent") return `${value}%`;
            if (col.type === "status") return I().labels[value] || value;
            if (col.type === "reasons") return (value || []).join("; ");
            if (col.type === "bar") return `${value.value} of ${value.max}`;
            return String(value);
        }

        function rowText(section, row) {
            return section.columns.map((c) => cellText(c, row[c.key])).join(" ").toLowerCase();
        }

        function visibleRows(section) {
            const term = (searchEl.value || "").trim().toLowerCase();
            return term ? section.rows.filter((r) => rowText(section, r).includes(term)) : section.rows;
        }

        function render() {
            if (!current) return;
            const ins = I();
            contentEl.innerHTML = current.sections.map((section, si) => {
                const rows = visibleRows(section);
                const body = rows.length
                    ? rows.map((row) => {
                        const index = section.rows.indexOf(row);
                        const open = row._open ? ` class="lp-row-link" tabindex="0" data-section="${si}" data-row="${index}" title="Open details"` : "";
                        return `<tr${open}>${section.columns.map((c) => `<td>${cellHtml(c, row[c.key])}</td>`).join("")}</tr>`;
                    }).join("")
                    : `<tr><td colspan="${section.columns.length}" class="text-muted table-empty-message">Nothing to show${searchEl.value ? " for this search" : ""}.</td></tr>`;
                const more = section.total > section.rows.length
                    ? `<p class="progress-detail-empty">Showing the first ${section.rows.length} of ${section.total}.</p>` : "";
                return `
                    ${section.title ? `<h4 class="lp-card-section-title">${ins.esc(section.title)}</h4>` : ""}
                    <div class="table-scroll lp-card-table-wrap">
                        <table class="data-table progress-table lp-card-table">
                            <thead><tr>${section.columns.map((c) => `<th>${ins.esc(c.label)}</th>`).join("")}</tr></thead>
                            <tbody>${body}</tbody>
                        </table>
                    </div>
                    <p class="lp-card-count text-muted">${rows.length} of ${section.total} shown</p>${more}`;
            }).join("");
        }

        function renderBands(bands) {
            if (!bands) { bandsEl.innerHTML = ""; return; }
            const ins = I();
            bandsEl.innerHTML = ["pass", "close", "fail"].map((b) =>
                `<span class="lp-band-count lp-band-${b}" title="${ins.esc(ins.bandText[b])}">${ins.esc(ins.bandText[b].split(" (")[0])}: <strong>${Number(bands[b] || 0)}</strong></span>`
            ).join("");
        }

        function cardUrl(kind, extra) {
            const params = options.params ? options.params() : new URLSearchParams();
            Object.keys(extra || {}).forEach((k) => { if (extra[k] !== undefined && extra[k] !== "") params.set(k, extra[k]); });
            const base = options.endpoint || `/admin/learner-progress/cards/${encodeURIComponent(options.view)}`;
            return `${base}/${encodeURIComponent(kind)}?${params.toString()}`;
        }

        async function open(kind, trigger, extra) {
            kindOpen = kind;
            lastFocused = trigger || document.activeElement;
            current = null;
            setError("");
            titleEl.textContent = "Loading…";
            subEl.textContent = "";
            searchEl.value = "";
            bandsEl.innerHTML = "";
            contentEl.innerHTML = `<p class="progress-detail-empty">Loading…</p>`;
            modal.classList.remove("modal-hidden");
            closeBtn.focus();

            const id = ++requestId;
            try {
                const response = await fetch(cardUrl(kind, extra), {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                if (id !== requestId) return;
                if (!response.ok || !data.success) throw new Error(data.message || `HTTP ${response.status}`);
                current = data;
                titleEl.textContent = data.title;
                subEl.textContent = data.subtitle || "";
                renderBands(data.bands);
                render();
                searchEl.focus();
            } catch (err) {
                if (id !== requestId) return;
                titleEl.textContent = "Details";
                contentEl.innerHTML = "";
                setError("Could not load this list. Please close and try again.");
                console.error("admin-progress-cards: failed to load card:", err);
            }
        }

        function close() {
            if (modal.classList.contains("modal-hidden")) return false;
            requestId++;
            modal.classList.add("modal-hidden");
            if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
            return true;
        }

        function openRow(tr) {
            const section = current && current.sections[Number(tr.dataset.section)];
            const row = section && section.rows[Number(tr.dataset.row)];
            const target = row && row._open;
            if (!target) return;
            if (target.type === "learner" && window.CobraLearnerCourseModal) CobraLearnerCourseModal.open(target.id);
            else if (target.type === "lesson" && window.CobraLessonModal) CobraLessonModal.open(target.id);
            else if (target.type === "record" && window.CobraLessonProgressModal) CobraLessonProgressModal.open(target.id);
        }

        contentEl.addEventListener("click", (e) => {
            const tr = e.target.closest(".lp-row-link");
            if (tr) openRow(tr);
        });
        contentEl.addEventListener("keydown", (e) => {
            const tr = e.target.closest(".lp-row-link");
            if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openRow(tr); }
        });
        searchEl.addEventListener("input", render);

        exportBtn.addEventListener("click", () => {
            if (!current) return;
            const multi = current.sections.length > 1;
            const columns = (multi ? [{ key: "_list", label: "List" }] : []).concat(current.sections[0].columns.map((c) => ({ key: c.key, label: c.label })));
            const rows = [];
            current.sections.forEach((section) => {
                visibleRows(section).forEach((r) => {
                    const out = { _list: section.title || "" };
                    section.columns.forEach((c) => { out[c.key] = cellText(c, r[c.key]); });
                    rows.push(out);
                });
            });
            const stamp = new Date().toISOString().slice(0, 10);
            I().downloadCsv(`${options.csvPrefix || `learner-progress-${options.view}`}-${kindOpen}-${stamp}.csv`, columns, rows);
        });

        closeBtn.addEventListener("click", close);
        modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
        // A modal opened on top of this one uses Escape first (they mark it handled).
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !e.defaultPrevented && close()) e.preventDefault();
        });

        document.querySelectorAll("[data-lp-card]").forEach((card) => {
            card.addEventListener("click", (e) => {
                if (e.target.closest(".lp-info")) return;      // the (i) only shows its tip
                open(card.dataset.lpCard, card, { key: card.dataset.lpKey });
            });
            card.addEventListener("keydown", (e) => {
                if ((e.key === "Enter" || e.key === " ") && !e.target.closest(".lp-info")) {
                    e.preventDefault();
                    open(card.dataset.lpCard, card, { key: card.dataset.lpKey });
                }
            });
        });

        window.CobraProgressCards.open = open;
    }

    window.CobraProgressCards = { init };
})();
