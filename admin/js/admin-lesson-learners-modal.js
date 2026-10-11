/**
 * admin-lesson-learners-modal.js - one lesson on Learner Progress
 * (moved out of admin-learner-progress.js; feat/learner-progress-insights)
 * --------------------------------------------------------------------
 * Drives #lessonLearnersModal (learner-progress-lesson-modal.html):
 * summary, step funnel, results per activity type, the most-missed
 * questions and every learner of the lesson.
 * Data: /admin/learner-progress/lessons/<resource_id>?<status + dates>
 *
 *   CobraLessonModal.open(resourceId)
 *   CobraLessonModal.setFilters(() => ({status, started_from, ...}))
 * A learner's eye opens the shared Lesson Progress modal on top
 * (admin-lesson-progress-modal.js - load that file first).
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const modal = document.getElementById("lessonLearnersModal");
        if (!modal) return;
        const I = window.CobraInsights;
        const esc = I.esc;

        const titleEl = document.getElementById("lessonLearnersTitle");
        const pathEl = document.getElementById("lessonLearnersPath");
        const noteEl = document.getElementById("lessonLearnersNote");
        const errorEl = document.getElementById("lessonLearnersError");
        const bodyEl = document.getElementById("lessonLearnersTableBody");
        const closeBtn = document.getElementById("closeLessonLearnersBtn");
        const summaryEl = document.getElementById("lessonInsightSummary");
        const funnelEl = document.getElementById("lessonInsightFunnel");
        const typesEl = document.getElementById("lessonInsightTypes");
        const missedEl = document.getElementById("lessonInsightMissed");
        const canEdit = modal.dataset.canEdit === "1";

        let filtersFn = () => ({});
        let requestId = 0;
        let lastFocused = null;

        function setError(message) {
            if (!errorEl) return;
            errorEl.textContent = message || "";
            errorEl.classList.toggle("is-visible", !!message);
        }

        function message(text) {
            bodyEl.innerHTML = `<tr><td colspan="8" class="text-muted table-empty-message">${esc(text)}</td></tr>`;
        }

        function summaryItem(label, value, tip, sub) {
            return `<div class="progress-summary-item">
                <span class="progress-summary-label">${esc(label)} ${tip ? I.info(tip) : ""}</span>
                <strong>${value}</strong>${sub ? `<small class="progress-summary-sub">${esc(sub)}</small>` : ""}
            </div>`;
        }

        function fillSummary(s) {
            const hardest = s.hardest ? `${esc(s.hardest.type)} ${esc(s.hardest.percent)}%` : "—";
            const stuck = s.stuck_at ? esc(s.stuck_at.step) : "—";
            summaryEl.innerHTML =
                summaryItem("Started → finished", `${esc(s.started)} started · ${esc(s.finished)} finished`,
                    "How many learners opened this lesson, and how many finished it.") +
                summaryItem("Average score", I.scoreHtml(s.avg_score),
                    `First try, learners who finished only. Green ${I.passMark}%+, yellow ${I.closeFrom}–${I.passMark - 1}%, red below.`) +
                summaryItem("Pass rate", s.pass_rate === null ? "—" : `${esc(s.pass_rate)}%`,
                    `Of the learners who finished, how many scored ${I.passMark}% or more.`,
                    s.pass_rate === null ? "" : `${s.passed} of ${s.finished}`) +
                summaryItem("Hardest part", hardest, "The activity type with the lowest first-try score here.") +
                summaryItem("Stuck at", stuck, "Of the learners who haven't finished, the step most of them stopped on.",
                    s.stuck_at ? `${s.stuck_at.count} learner${s.stuck_at.count === 1 ? "" : "s"}` : "");
        }

        function fillFunnel(steps) {
            if (!steps || !steps.length || !steps[0].count) {
                funnelEl.innerHTML = `<p class="progress-detail-empty">No learner has opened this lesson yet.</p>`;
                return;
            }
            funnelEl.innerHTML = steps.map((s) => `
                <div class="lp-funnel-step">
                    <span class="lp-funnel-label">${esc(s.step)}</span>
                    <span class="lp-funnel-track"><span class="lp-funnel-fill" style="width:${Number(s.percent) || 0}%"></span></span>
                    <span class="lp-funnel-count">${esc(s.count)} <small>(${esc(s.percent)}%)</small></span>
                </div>`).join("");
        }

        function fillTypes(rows) {
            if (!rows || !rows.length) {
                typesEl.innerHTML = `<p class="progress-detail-empty">This lesson has no graded activities.</p>`;
                return;
            }
            typesEl.innerHTML = `<table class="progress-detail-table">
                <thead><tr><th>Type</th><th>First-try avg</th><th>Learners</th><th>Timeouts</th><th>Skips</th><th>Retakes</th></tr></thead>
                <tbody>${rows.map((r) => `<tr>
                    <td>${esc(r.type)}</td>
                    <td>${I.scoreHtml(r.avg)}</td>
                    <td>${esc(r.learners)}</td>
                    <td>${r.timeouts === null ? "—" : esc(r.timeouts)}</td>
                    <td>${esc(r.skips)}</td>
                    <td>${esc(r.retakes)}</td>
                </tr>`).join("")}</tbody>
            </table>`;
        }

        function fillMissed(rows) {
            if (!rows || !rows.length) {
                missedEl.innerHTML = `<p class="progress-detail-empty">No question has been missed on the first try yet.</p>`;
                return;
            }
            missedEl.innerHTML = `<ol class="lp-mq-list">${rows.map((q) => I.missedRowHtml(q, {
                editUrl: canEdit ? `/admin/create-learning-activity?activity_id=${encodeURIComponent(q.la_id)}` : null, newTab: true,
            })).join("")}</ol>`;
        }

        function fillLearners(records) {
            if (!records.length) {
                message("No learner records for this lesson with the current filters.");
                return;
            }
            bodyEl.innerHTML = records.map((rec) => `
                <tr>
                    <td>${I.learnerHtml(rec.acc_id, rec.name, rec.avatar_url)}</td>
                    <td>${I.scoreHtml(rec.result, rec.is_completed ? null : "Not finished yet - first-try score of the activities done so far")}</td>
                    <td>${I.chipHtml(rec.status, rec.status_label)}</td>
                    <td>${I.barHtml(rec.completion, 100, `${Number(rec.completion) || 0}%`)}</td>
                    <td>${rec.stuck_at ? esc(rec.stuck_at) : '<span class="progress-no-score">—</span>'}</td>
                    <td>${esc(rec.started_at)}</td>
                    <td>${esc(rec.last_update)}</td>
                    <td>
                        <button type="button" class="icon-button-reset progress-view-btn js-view-progress-btn" data-progress-id="${esc(rec.progress_id)}" title="View details" aria-label="View details for ${esc(rec.name)}">
                            <span class="mask-icon icon-eye"></span>
                        </button>
                    </td>
                </tr>`).join("");
        }

        function reset() {
            setError("");
            titleEl.textContent = "Loading…";
            pathEl.textContent = "";
            noteEl.textContent = "";
            [summaryEl, funnelEl, typesEl, missedEl].forEach((el) => { el.innerHTML = ""; });
            message("Loading…");
        }

        async function open(resourceId) {
            const id = ++requestId;
            lastFocused = document.activeElement;
            reset();
            modal.classList.remove("modal-hidden");
            if (closeBtn) closeBtn.focus();

            const params = new URLSearchParams();
            const filters = filtersFn() || {};
            Object.keys(filters).forEach((key) => { if (filters[key]) params.set(key, filters[key]); });

            try {
                const response = await fetch(`/admin/learner-progress/lessons/${encodeURIComponent(resourceId)}?${params.toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                if (id !== requestId) return;
                if (!response.ok || !data.success) throw new Error(data.message || `HTTP ${response.status}`);
                titleEl.textContent = data.lesson;
                pathEl.textContent = `${data.chapter} › ${data.module}`;
                const records = data.records || [];
                noteEl.textContent = `${records.length} learner${records.length === 1 ? "" : "s"}` +
                    (filters.status ? ` (Status: ${I.labels[filters.status] || filters.status})` : "");
                fillSummary(data.summary || {});
                fillFunnel(data.funnel);
                fillTypes(data.per_type);
                fillMissed(data.most_missed);
                fillLearners(records);
            } catch (err) {
                if (id !== requestId) return;
                titleEl.textContent = "Lesson";
                message("");
                setError("Could not load this lesson. Please close and try again.");
                console.error("admin-lesson-learners-modal: failed to load lesson:", err);
            }
        }

        function close() {
            if (modal.classList.contains("modal-hidden")) return false;
            requestId++;
            modal.classList.add("modal-hidden");
            if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
            return true;
        }

        bodyEl.addEventListener("click", (e) => {
            const btn = e.target.closest(".js-view-progress-btn");
            if (btn && window.CobraLessonProgressModal) CobraLessonProgressModal.open(btn.dataset.progressId);
        });
        if (closeBtn) closeBtn.addEventListener("click", close);
        modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
        // The Lesson Progress modal on top uses Escape first (it marks it handled).
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !e.defaultPrevented && close()) e.preventDefault();
        });

        window.CobraLessonModal = {
            open,
            setFilters(fn) { if (typeof fn === "function") filtersFn = fn; },
        };
    });
})();
