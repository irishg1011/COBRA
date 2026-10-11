/**
 * mentor-content-insights.js - Mentor Dashboard: "How your content is doing"
 * (feat/dashboard-reports). Read-only.
 * --------------------------------------------------------------------
 * GET /admin/mentor-dashboard/content-insights[?mine=1] (content_health.py):
 *   hardest activity, the 5 lowest-scoring questions (first try, with the
 *   "check the answer key" flag) and content health (too few items,
 *   missing feedback / hint, exercises without an expected output).
 * Every row has an Edit link to the same editor Publishing opens.
 * "Only mine" = only content this mentor uploaded; remembered in the browser.
 */
(function () {
    "use strict";

    const MINE_KEY = "cobra.mentorDashboard.onlyMine";

    document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("mentorContentInsights");
        if (!root) return;
        const I = window.CobraInsights;
        const esc = I.esc;
        const $ = (id) => document.getElementById(id);
        const mine = $("mciOnlyMine");
        let requestId = 0;

        try { mine.checked = window.localStorage.getItem(MINE_KEY) === "1"; } catch (e) { /* private mode */ }

        function edit(url, label) {
            return `<a class="lp-edit-link" href="${esc(url)}">${esc(label || "Edit")}</a>`;
        }

        function statusBadge(status) {
            const cls = { "Published": "badge-active", "Ready to Publish": "badge-ready", "Draft": "badge-draft" }[status] || "badge-inactive";
            return `<span class="badge ${cls}">${esc(status)}</span>`;
        }

        function list(rows, render, emptyText) {
            if (!rows.length) return `<p class="mci-empty">${esc(emptyText)}</p>`;
            return `<ul class="mci-list">${rows.map(render).join("")}</ul>`;
        }

        function render(data) {
            const p = data.performance;
            const h = data.health;
            const minText = `at least ${p.min_learners} learners`;

            $("mciHardest").innerHTML = p.hardest
                ? `<div class="mci-hardest">
                        <div><strong>${esc(p.hardest.title)}</strong>
                        <small>${esc(p.hardest.lesson)} · ${esc(p.hardest.type)} · ${esc(p.hardest.learners)} learners</small></div>
                        <div class="mci-hardest-side">${I.scoreHtml(p.hardest.percent, "First-try score")} ${edit(p.hardest.edit_url)}</div>
                   </div>` +
                  (p.activities.length > 1 ? `<p class="mci-next">Next: ${p.activities.slice(1).map((a) =>
                      `<a href="${esc(a.edit_url)}">${esc(a.title)}</a> ${I.scoreHtml(a.percent)}`).join(" · ")}</p>` : "")
                : `<p class="mci-empty">Not enough plays yet (needs ${esc(minText)} on a published activity).</p>`;

            $("mciQuestions").innerHTML = p.questions.length
                ? p.questions.map((q) => `
                    <li class="lp-missed-item${q.check_key ? " is-check-key" : ""}">
                        <div class="lp-missed-text"><strong>${esc(q.question)}</strong>
                            <small>${esc(q.lesson)}${q.activity !== q.lesson ? ` · ${esc(q.activity)}` : ""} · ${esc(q.type)}</small></div>
                        <div class="lp-missed-stats">
                            <span class="badge lp-band lp-band-${q.miss_percent >= 50 ? "fail" : "close"}">${esc(q.miss_percent)}% missed</span>
                            <small>${esc(q.missed)} of ${esc(q.answered)} learners</small>
                            ${q.check_key ? '<span class="lp-check-key"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Check the answer key</span>' : ""}
                            ${edit(q.edit_url, "Edit question")}
                        </div>
                    </li>`).join("")
                : `<li class="mci-empty">No question missed on the first try yet.</li>`;

            const problems = h.too_few_total + h.feedback_total + h.exercises_total;
            $("mciHealthFacts").innerHTML = `
                <span class="mci-fact ${h.too_few_total ? "is-bad" : "is-ok"}"><strong>${h.too_few_total}</strong> with fewer than ${h.draw_size} items</span>
                <span class="mci-fact ${h.feedback_total ? "is-warn" : "is-ok"}"><strong>${h.items_missing_feedback + h.items_missing_hint}</strong> items missing feedback / hint</span>
                <span class="mci-fact ${h.exercises_total ? "is-bad" : "is-ok"}"><strong>${h.exercises_total}</strong> exercises missing expected output</span>
                <small class="mci-fact-note">${h.activities_checked} activities checked · ${h.under_target} under the ${h.pool_target}-item pool target${problems ? "" : " · nothing to fix"}</small>`;

            $("mciTooFewTitle").textContent = `Too few items (${h.too_few_total})`;
            $("mciTooFew").innerHTML = list(h.too_few, (a) => `
                <li><span><strong>${esc(a.title)}</strong> <small>${esc(a.lesson)} · ${esc(a.type)}</small></span>
                    <span class="mci-row-side"><span class="lp-reason">${esc(a.items)} item${a.items === 1 ? "" : "s"}</span> ${statusBadge(a.status)} ${edit(a.edit_url)}</span></li>`,
                `Every activity has at least ${h.draw_size} items.`);

            $("mciFeedbackTitle").textContent = `Missing feedback or hint (${h.feedback_total} activities)`;
            $("mciFeedback").innerHTML = list(h.feedback, (a) => `
                <li><span><strong>${esc(a.title)}</strong> <small>${esc(a.lesson)} · ${esc(a.type)}</small></span>
                    <span class="mci-row-side">
                        ${a.missing_feedback ? `<span class="lp-reason">${esc(a.missing_feedback)} without feedback</span>` : ""}
                        ${a.missing_hint ? `<span class="lp-reason mci-hint">${esc(a.missing_hint)} without a hint</span>` : ""}
                        ${statusBadge(a.status)} ${edit(a.edit_url)}</span></li>`,
                "Every item has its feedback and hint.");

            $("mciExercisesTitle").textContent = `Exercises missing expected output (${h.exercises_total})`;
            $("mciExercises").innerHTML = list(h.exercises, (x) => `
                <li><span><strong>${esc(x.title)}</strong> <small>${esc(x.lesson)}</small></span>
                    <span class="mci-row-side">${statusBadge(x.status)} ${edit(x.edit_url)}</span></li>`,
                "Every coding exercise has an expected output.");

            $("mciLoading").hidden = true;
            $("mciBody").hidden = false;
        }

        async function load() {
            const id = ++requestId;
            try {
                const response = await fetch(`/admin/mentor-dashboard/content-insights${mine.checked ? "?mine=1" : ""}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" }, credentials: "include",
                });
                const data = await response.json();
                if (id !== requestId) return;
                if (!response.ok || !data.success) throw new Error(data.message || `HTTP ${response.status}`);
                render(data);
            } catch (err) {
                if (id !== requestId) return;
                $("mciLoading").hidden = false;
                $("mciLoading").textContent = "Couldn't load this right now.";
                $("mciBody").hidden = true;
            }
        }

        mine.addEventListener("change", () => {
            try { window.localStorage.setItem(MINE_KEY, mine.checked ? "1" : "0"); } catch (e) { /* private mode */ }
            load();
        });
        load();
    });
})();
