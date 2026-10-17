/**
 * admin-learner-course-modal.js - shared Course Progress modal
 * --------------------------------------------------------------------
 * Drives #learnerCourseModal (learner-progress-learner-modal.html): one
 * learner's whole course as a Chapter -> Module -> Lesson accordion.
 * Moved out of admin-learner-progress-learners.js (feat/archive-accounts)
 * so more than one page can open it:
 *   - Learner Progress (By Learner): the table's eye button
 *   - Account & Security: "View full course progress" in the Learning tab
 * Each started lesson's eye opens the shared Lesson Progress modal on top
 * (admin-lesson-progress-modal.js), so load that file first.
 *
 * feat/learner-progress-insights: status chip + why, a line chart of the
 * finished lessons' scores (Chart.js, when the page loads it), strong /
 * weak topics, retakes, time in activities and recommendations given.
 *
 * Open it with: window.CobraLearnerCourseModal.open(accId)
 * Data: /admin/learner-progress/learner-detail/<acc_id>
 */
(function () {
    "use strict";


    document.addEventListener("DOMContentLoaded", () => {
        const modal = document.getElementById("learnerCourseModal");
        if (!modal) return;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function scoreBadgeHtml(score) {
            if (score === null || score === undefined) {
                return `<span class="progress-no-score">—</span>`;
            }
            return `<span class="badge ${CobraScore.badgeClass(score)}">${escapeHtml(score)}%</span>`;
        }

        function completionHtml(pct, small = false) {
            const value = Number(pct) || 0;
            return `
                <div class="completion-cell">
                    <progress class="completion-bar${small ? " completion-bar-sm" : ""}" value="${value}" max="100" aria-label="Completion ${value}%"></progress>
                    <span class="completion-pct">${value}%</span>
                </div>
            `;
        }

        const closeBtn = document.getElementById("closeLearnerCourseBtn");
        const errorEl = document.getElementById("learnerCourseError");
        const nameEl = document.getElementById("learnerCourseName");
        const avatarEl = document.getElementById("learnerCourseAvatar");
        const accIdEl = document.getElementById("learnerCourseAccId");
        const currentEl = document.getElementById("learnerCourseCurrent");
        const currentPathEl = document.getElementById("learnerCourseCurrentPath");
        const lessonsEl = document.getElementById("learnerCourseLessons");
        const modulesEl = document.getElementById("learnerCourseModules");
        const scoreEl = document.getElementById("learnerCourseScore");
        const completionEl = document.getElementById("learnerCourseCompletion");
        const lastActiveEl = document.getElementById("learnerCourseLastActive");
        const chaptersEl = document.getElementById("learnerCourseChapters");
        const leavesEl = document.getElementById("learnerCourseLeaves");
        const statusEl = document.getElementById("learnerCourseStatus");
        const chartCanvas = document.getElementById("learnerCourseChart");
        const chartEmptyEl = document.getElementById("learnerCourseChartEmpty");
        // Learning signals (4 small cards) + their "View all" window
        const signalBodies = {
            topics: document.getElementById("lcTopicsBody"),
            retakes: document.getElementById("lcRetakesBody"),
            recommendations: document.getElementById("lcRecsBody"),
            leaves: leavesEl,
        };
        const signalModal = document.getElementById("learnerSignalModal");
        const signalTitle = document.getElementById("learnerSignalTitle");
        const signalSub = document.getElementById("learnerSignalSub");
        const signalContent = document.getElementById("learnerSignalContent");
        const signalNote = document.getElementById("learnerSignalNote");
        const signalSearch = document.getElementById("learnerSignalSearch");
        const signalExport = document.getElementById("learnerSignalExport");
        const signalClose = document.getElementById("closeLearnerSignalBtn");
        const PREVIEW_ROWS = 3;
        let currentLearner = null;
        let openSignal = null;
        const Ins = window.CobraInsights || null;
        let chart = null;

        let modalRequestId = 0;
        let lastFocused = null;

        function setText(el, value) {
            if (el) el.textContent = value;
        }

        function badge(cls, label) {
            return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
        }

        function showError(message) {
            if (!errorEl) return;
            errorEl.textContent = message;
            errorEl.classList.add("is-visible");
        }

        function hideError() {
            if (!errorEl) return;
            errorEl.textContent = "";
            errorEl.classList.remove("is-visible");
        }

        function resetModal() {
            [nameEl, accIdEl, currentEl, lessonsEl, scoreEl, completionEl, lastActiveEl]
                .forEach((el) => setText(el, "—"));
            setText(currentPathEl, "");
            setText(modulesEl, "");
            window.CobraAvatar && window.CobraAvatar.set(avatarEl, null);
            if (chaptersEl) chaptersEl.innerHTML = `<p class="progress-detail-empty">Loading...</p>`;
            if (statusEl) statusEl.innerHTML = "";
            Object.values(signalBodies).forEach((el) => { if (el) el.innerHTML = ""; });
            modal.querySelectorAll(".lc-view-all").forEach((b) => { b.hidden = true; });
            closeSignal();
            if (chartEmptyEl) chartEmptyEl.textContent = "";
            if (chart) { chart.destroy(); chart = null; }
            hideError();
        }

        // Chapters also show modules done; module rows only show lessons.
        function groupStatsHtml(g) {
            const avg = g.avg_score === null || g.avg_score === undefined ? "—" : `${g.avg_score}%`;
            const modules = g.modules_total !== undefined
                ? `<span>${escapeHtml(g.modules_completed)}/${escapeHtml(g.modules_total)} modules</span>`
                : "";
            return `
                ${modules}
                <span>${escapeHtml(g.lessons_completed)}/${escapeHtml(g.lessons_total)} lessons</span>
                <span>Avg ${escapeHtml(avg)}</span>
                ${completionHtml(g.completion, true)}
            `;
        }

        function lessonStatusBadge(status) {
            if (status === "completed") return badge("badge-active", "Completed");
            if (status === "in_progress") return badge("badge-draft", "In progress");
            return badge("badge-inactive", "Not started");
        }

        function lessonTableHtml(lessons) {
            if (!lessons || lessons.length === 0) {
                return `<p class="course-empty">No published lessons in this module.</p>`;
            }
            const rows = lessons.map((l) => `
                <tr class="${l.is_current ? "is-current-lesson" : ""}">
                    <td>${escapeHtml(l.title)}${l.is_current ? ` ${badge("badge-draft", "Current")}` : ""}</td>
                    <td>${scoreBadgeHtml(l.score)}</td>
                    <td>${l.status === "not_started" ? "—" : completionHtml(l.completion, true)}</td>
                    <td>${lessonStatusBadge(l.status)}</td>
                    <td>${escapeHtml(l.started_at)}</td>
                    <td>${escapeHtml(l.completed_at)}</td>
                    <td>
                        ${l.progress_id ? `
                        <button type="button" class="icon-button-reset progress-view-btn js-open-lesson-progress" data-progress-id="${escapeHtml(l.progress_id)}" title="View lesson breakdown" aria-label="View lesson breakdown for ${escapeHtml(l.title)}">
                            <span class="mask-icon icon-eye"></span>
                        </button>` : ""}
                    </td>
                </tr>
            `).join("");
            return `
                <div class="course-lesson-scroll">
                    <table class="progress-detail-table course-lesson-table">
                        <thead>
                            <tr><th>Lesson</th><th>Score</th><th>Completion</th><th>Status</th><th>Started</th><th>Completed</th><th></th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }

        // Module Review (the card at the end of every module on the learner's
        // Lessons page): not ready / needs retake / passed.
        function reviewBadgeHtml(review) {
            if (!review) return "";
            if (review.state === "passed") {
                return `<span class="badge badge-active course-review-badge" title="Module Review: passed">Review: Passed ${escapeHtml(review.percent)}%${review.missed ? ` · ${escapeHtml(review.missed)} missed` : ""}</span>`;
            }
            if (review.state === "needs_retake") {
                return `<span class="badge badge-locked course-review-badge" title="Module Review: below ${escapeHtml(review.pass_percent)}%">Review: Needs retake ${escapeHtml(review.percent)}% · ${escapeHtml(review.missed)} missed</span>`;
            }
            return `<span class="badge badge-inactive course-review-badge" title="Module Review opens when every lesson is finished">Review: Not ready</span>`;
        }

        function chaptersHtml(chapters) {
            if (!chapters || chapters.length === 0) {
                return `<p class="progress-detail-empty">There are no published lessons in the course yet.</p>`;
            }

            // Open the chapter they're on now; if none, the first unlocked one.
            const anyCurrent = chapters.some((c) => c.is_current);
            const fallbackIndex = Math.max(0, chapters.findIndex((c) => !c.locked));

            return chapters.map((ch, index) => {
                const open = ch.is_current || (!anyCurrent && index === fallbackIndex);
                const lockTag = ch.locked
                    ? `<span class="badge badge-inactive"><i class="fa-solid fa-lock"></i> Locked</span>`
                    : "";
                // feat/skippable-chapter: the learner skipped this chapter (never shown as completed)
                const skipTag = ch.skipped
                    ? `<span class="badge badge-inactive" title="Skipped on ${escapeHtml(ch.skipped_at || "")}"><i class="fa-solid fa-forward"></i> Skipped</span>`
                    : "";

                const modules = ch.modules.map((m) => `
                    <details class="course-module" ${m.is_current ? "open" : ""}>
                        <summary class="course-summary course-summary-module">
                            <span class="course-summary-title">
                                <i class="fa-solid fa-chevron-right course-caret"></i>
                                ${escapeHtml(m.name)} ${reviewBadgeHtml(m.review)}
                            </span>
                            <span class="course-summary-stats">${groupStatsHtml(m)}</span>
                        </summary>
                        ${lessonTableHtml(m.lessons)}
                    </details>
                `).join("");

                return `
                    <details class="course-chapter ${ch.locked ? "is-locked" : ""}" ${open ? "open" : ""}>
                        <summary class="course-summary">
                            <span class="course-summary-title">
                                <i class="fa-solid fa-chevron-right course-caret"></i>
                                ${escapeHtml(ch.name)} ${lockTag}${skipTag}
                            </span>
                            <span class="course-summary-stats">${groupStatsHtml(ch)}</span>
                        </summary>
                        <div class="course-chapter-body">${modules}</div>
                    </details>
                `;
            }).join("");
        }

        function fillModal(learner) {
            setText(nameEl, learner.name || "—");
            window.CobraAvatar && window.CobraAvatar.set(avatarEl, learner.avatar_url);
            setText(accIdEl, learner.acc_id || "—");

            if (learner.current_state === "not_started") {
                setText(currentEl, "Not started");
                setText(currentPathEl, "");
            } else if (learner.current_state === "finished") {
                setText(currentEl, "Finished the course");
                setText(currentPathEl, "");
            } else {
                setText(currentEl, learner.current_lesson || "—");
                setText(currentPathEl, `${learner.current_state === "idle" ? "Last completed • " : ""}${learner.current_path || ""}`);
            }

            setText(lessonsEl, `${learner.lessons_completed} / ${learner.lessons_total} lessons`);
            setText(modulesEl, `${learner.modules_completed} / ${learner.modules_total} modules`);
            setText(scoreEl, learner.avg_score === null || learner.avg_score === undefined ? "—" : `${learner.avg_score}%`);
            setText(completionEl, `${learner.completion}%`);
            setText(lastActiveEl, learner.last_active || "—");

            if (chaptersEl) chaptersEl.innerHTML = chaptersHtml(learner.chapters);
            fillInsights(learner);
        }

        // ---------- feat/learner-progress-insights ----------
        function scoreHtml(score) {
            return Ins ? Ins.scoreHtml(score) : scoreBadgeHtml(score);
        }

        function fillInsights(learner) {
            const ins = learner.insights || {};
            if (statusEl && learner.status) {
                const why = (learner.reasons || []).map((r) => `<li>${escapeHtml(r.text)}</li>`).join("");
                statusEl.innerHTML = `
                    <span class="lp-chip lp-chip-${escapeHtml(learner.status)}">${escapeHtml(learner.status_label)}</span>
                    <span class="lp-learner-trend">Avg ${scoreHtml(learner.avg_score)} ${Ins ? Ins.trendHtml(ins.trend) : ""}</span>
                    <span class="text-muted">Last active ${escapeHtml(learner.last_active_ago || "—")}</span>
                    <span class="text-muted" title="Time spent on timed activity questions. Video and reading time aren't recorded.">${Number(ins.activity_minutes || 0)} min in activities</span>
                    ${why ? `<ul class="lp-why-list">${why}</ul>` : ""}`;
            }
            drawChart(ins.timeline || []);
            currentLearner = learner;
            fillSignals(learner);
        }

        function drawChart(points) {
            if (!chartCanvas) return;
            const wrap = chartCanvas.parentElement;
            if (!points.length || typeof window.Chart !== "function") {
                if (wrap) wrap.hidden = true;
                if (chartEmptyEl) chartEmptyEl.hidden = false;
                if (chartEmptyEl) chartEmptyEl.textContent = points.length
                    ? points.map((p) => `${p.lesson}: ${p.score}%`).join(" · ")
                    : "No finished lesson with a score yet.";
                return;
            }
            if (wrap) wrap.hidden = false;
            if (chartEmptyEl) chartEmptyEl.hidden = true;
            const pass = Ins ? Ins.passMark : 80;
            const colour = (score) => (window.CobraScore ? CobraScore.color(score) : "#0F7A3D");
            const closeColour = "#B7791F";
            const colours = points.map((p) => (p.band === "close" ? closeColour : colour(p.score)));
            chart = new Chart(chartCanvas, {
                type: "line",
                data: {
                    labels: points.map((p) => p.date),
                    datasets: [
                        { label: "Score", data: points.map((p) => p.score), borderColor: "#18B8E6", backgroundColor: colours,
                          pointBackgroundColor: colours, pointRadius: 5, tension: 0.25, fill: false },
                        { label: `Pass mark (${pass}%)`, data: points.map(() => pass), borderColor: "#9ca3af",
                          borderDash: [6, 4], pointRadius: 0, fill: false },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    scales: { y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } } },
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: {
                            title: (items) => points[items[0].dataIndex].lesson,
                            label: (item) => item.datasetIndex === 0 ? `Score ${item.parsed.y}% (${points[item.dataIndex].module})` : `Pass mark ${pass}%`,
                        } },
                    },
                },
            });
        }

        // ---------- Learning signals: preview cards + "View all" ----------
        // Each signal: the full rows (plain values, for the table + CSV), the
        // columns, and a short preview for its card.
        function signalData(kind, learner) {
            const ins = learner.insights || {};
            if (kind === "topics") {
                const modules = [...(ins.strong || []), ...(ins.weak || [])]
                    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
                    .map((m) => ({ kind: "Module", name: m.module, avg: m.avg, lessons: m.lessons,
                                   verdict: m.band === "pass" ? "Strong" : "Weak" }));
                const types = (ins.types || []).map((t) => ({ kind: "Activity type", name: t.type, avg: t.percent,
                                                              lessons: "", verdict: t.band === "pass" ? "Strong" : "Weak" }));
                return {
                    title: "Topics", sub: "Modules (finished lessons) and activity types (first try), strongest first.",
                    columns: [{ key: "name", label: "Topic" }, { key: "kind", label: "Kind" },
                              { key: "avg", label: "Score", score: true }, { key: "lessons", label: "Lessons" },
                              { key: "verdict", label: "Strong / weak" }],
                    rows: [...modules, ...types],
                };
            }
            if (kind === "retakes") {
                return {
                    title: "Retakes", sub: `${Number(ins.retake_total || 0)} retake round${ins.retake_total === 1 ? "" : "s"}, most first.`,
                    columns: [{ key: "activity", label: "Activity" }, { key: "rounds", label: "Retake rounds" },
                              { key: "done", label: "Finished" }, { key: "last", label: "Last" }],
                    rows: [...(ins.retakes || [])].sort((a, b) => b.rounds - a.rounds),
                };
            }
            if (kind === "recommendations") {
                const rows = (ins.recommendations || []).map((r) => ({ ...r, state: r.resolved ? "Done" : "Open" }));
                const open = rows.filter((r) => !r.resolved).length;
                return {
                    title: "Recommendations given", sub: `${rows.length} given · ${open} still open. Newest first.`,
                    columns: [{ key: "when", label: "When" }, { key: "lesson", label: "Lesson to review" },
                              { key: "reason", label: "Why" }, { key: "state", label: "Done?", badge: true }],
                    rows,
                };
            }
            const rows = (learner.leave_log || []).map((r) => ({ ...r, away: `${Number(r.away_seconds)} s` }));
            const forfeits = rows.filter((r) => r.action !== "Warning").length;
            return {
                title: "Left the page", sub: `${rows.length} time${rows.length === 1 ? "" : "s"} · ${forfeits} forfeited. Newest first.`,
                note: "The system cannot see where the learner went, a second device, or a window read side by side without clicking it.",
                columns: [{ key: "left_at", label: "When" }, { key: "where", label: "Where" }, { key: "context", label: "Type" },
                          { key: "leave_no", label: "Leave #" }, { key: "action", label: "What happened" },
                          { key: "reason", label: "How" }, { key: "away", label: "Away" }],
                rows,
            };
        }

        function stateBadge(value) {
            return value === "Done" ? badge("badge-active", "Done") : badge("badge-inactive", value);
        }

        function chips(items, empty) {
            return items.length
                ? items.map((m) => `<span class="lc-chip">${escapeHtml(m.name)} ${scoreHtml(m.avg)}</span>`).join("")
                : `<span class="lc-none">${escapeHtml(empty)}</span>`;
        }

        function previewHtml(kind, data) {
            const rows = data.rows;
            if (kind === "topics") {
                const modules = rows.filter((r) => r.kind === "Module");
                if (!rows.length) return `<p class="lc-none">No finished lesson yet.</p>`;
                const weak = modules.filter((m) => m.verdict === "Weak").reverse().slice(0, PREVIEW_ROWS);
                const strong = modules.filter((m) => m.verdict === "Strong").slice(0, PREVIEW_ROWS);
                const types = rows.filter((r) => r.kind === "Activity type");
                return `<div class="lc-line"><span class="lc-label">Weak</span>${chips(weak, "None - nice!")}</div>
                        <div class="lc-line"><span class="lc-label">Strong</span>${chips(strong, "None yet")}</div>
                        ${types.length ? `<div class="lc-line"><span class="lc-label">By type</span>${chips(types, "")}</div>` : ""}`;
            }
            if (!rows.length) {
                return `<p class="lc-none">${{ retakes: "No retakes.", recommendations: "No recommendations given yet.",
                    leaves: "Never left an activity page during a play." }[kind]}</p>`;
            }
            const head = `<p class="lc-count">${escapeHtml(data.sub.replace(/,? (Newest first|most first)\.$/, ""))}</p>`;
            const top = rows.slice(0, PREVIEW_ROWS);
            let items = "";
            if (kind === "retakes") {
                items = top.map((r) => `<li><span class="lc-main">${escapeHtml(r.activity)}</span><span class="lc-side">${Number(r.rounds)} round${r.rounds === 1 ? "" : "s"}</span></li>`).join("");
            } else if (kind === "recommendations") {
                items = top.map((r) => `<li><span class="lc-main">${escapeHtml(r.lesson)}<small>${escapeHtml(r.reason)}</small></span><span class="lc-side">${stateBadge(r.state)}</span></li>`).join("");
            } else {
                items = top.map((r) => `<li><span class="lc-main">${escapeHtml(r.where)}<small>${escapeHtml(r.left_at)} · ${escapeHtml(r.reason)}</small></span><span class="lc-side">${escapeHtml(r.action)}</span></li>`).join("");
            }
            return `${head}<ul class="lc-list">${items}</ul>`;
        }

        function fillSignals(learner) {
            Object.keys(signalBodies).forEach((kind) => {
                const body = signalBodies[kind];
                if (!body) return;
                const data = signalData(kind, learner);
                body.innerHTML = previewHtml(kind, data);
                const btn = modal.querySelector(`.lc-view-all[data-signal="${kind}"]`);
                let shown = Math.min(data.rows.length, PREVIEW_ROWS);
                if (kind === "topics") {   // up to 3 weak + 3 strong modules, every activity type
                    const modules = data.rows.filter((r) => r.kind === "Module");
                    shown = Math.min(modules.filter((m) => m.verdict === "Weak").length, PREVIEW_ROWS)
                        + Math.min(modules.filter((m) => m.verdict === "Strong").length, PREVIEW_ROWS)
                        + data.rows.filter((r) => r.kind === "Activity type").length;
                }
                if (btn) {
                    btn.hidden = data.rows.length <= shown || data.rows.length === 0;
                    btn.textContent = `View all (${data.rows.length})`;
                }
            });
        }

        // ---------- the "View all" window ----------
        function cellText(col, row) {
            const v = row[col.key];
            if (v === null || v === undefined || v === "") return "";
            return col.score ? `${v}%` : String(v);
        }

        function renderSignal() {
            if (!openSignal) return;
            const { columns, rows } = openSignal;
            const term = (signalSearch.value || "").trim().toLowerCase();
            const shown = term ? rows.filter((r) => columns.map((c) => cellText(c, r)).join(" ").toLowerCase().includes(term)) : rows;
            signalContent.innerHTML = `<div class="lc-signal-table-wrap"><table class="progress-detail-table lc-signal-table">
                <thead><tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
                <tbody>${shown.length ? shown.map((r) => `<tr>${columns.map((c) => {
                    const v = r[c.key];
                    if (c.score) return `<td>${scoreHtml(v)}</td>`;
                    if (c.badge) return `<td>${stateBadge(v)}</td>`;
                    return `<td>${escapeHtml(v === null || v === undefined || v === "" ? "—" : v)}</td>`;
                }).join("")}</tr>`).join("")
                : `<tr><td colspan="${columns.length}" class="text-muted">Nothing matches this search.</td></tr>`}</tbody>
            </table></div><p class="lc-shown">${shown.length} of ${rows.length} shown</p>`;
        }

        function openSignalModal(kind) {
            if (!currentLearner || !signalModal) return;
            openSignal = { kind, ...signalData(kind, currentLearner) };
            signalTitle.textContent = `${openSignal.title} - ${currentLearner.name || currentLearner.acc_id}`;
            signalSub.textContent = openSignal.sub;
            signalNote.textContent = openSignal.note || "";
            signalNote.hidden = !openSignal.note;
            signalSearch.value = "";
            renderSignal();
            signalModal.classList.remove("modal-hidden");
            signalSearch.focus();
        }

        function closeSignal() {
            if (!signalModal || signalModal.classList.contains("modal-hidden")) return false;
            signalModal.classList.add("modal-hidden");
            const btn = openSignal && modal.querySelector(`.lc-view-all[data-signal="${openSignal.kind}"]`);
            openSignal = null;
            if (btn && !btn.hidden) btn.focus();
            return true;
        }

        modal.addEventListener("click", (e) => {
            const btn = e.target.closest(".lc-view-all");
            if (btn) openSignalModal(btn.dataset.signal);
        });
        if (signalModal) {
            signalSearch.addEventListener("input", renderSignal);
            signalClose.addEventListener("click", closeSignal);
            signalModal.addEventListener("click", (e) => { if (e.target === signalModal) closeSignal(); });
            signalExport.addEventListener("click", () => {
                if (!openSignal || !currentLearner) return;
                const { columns, rows } = openSignal;
                const name = `${openSignal.kind}-${currentLearner.acc_id}-${new Date().toISOString().slice(0, 10)}.csv`;
                const plain = rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, cellText(c, r)])));
                if (Ins && Ins.downloadCsv) {
                    Ins.downloadCsv(name, columns, plain);
                    return;
                }
                const cell = (v) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
                const csv = [columns.map((c) => cell(c.label)).join(",")].concat(plain.map((r) => columns.map((c) => cell(r[c.key])).join(","))).join("\r\n");
                const link = document.createElement("a");
                link.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
                link.download = name;
                document.body.appendChild(link); link.click();
                setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 0);
            });
        }

        async function openModal(accId) {
            if (!accId) return;

            lastFocused = document.activeElement;
            resetModal();
            modal.classList.remove("modal-hidden");
            if (closeBtn) closeBtn.focus();

            const requestId = ++modalRequestId;

            try {
                const response = await fetch(`/admin/learner-progress/learner-detail/${encodeURIComponent(accId)}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                if (requestId !== modalRequestId) return;

                if (!response.ok || !data.success) {
                    throw new Error(data.message || `HTTP ${response.status}`);
                }
                fillModal(data.learner);
            } catch (err) {
                if (requestId !== modalRequestId) return;
                if (chaptersEl) chaptersEl.innerHTML = "";
                showError("Could not load this learner. Please close and try again.");
                console.error("admin-learner-progress-learners: failed to load learner:", err);
            }
        }

        function closeModal() {
            if (modal.classList.contains("modal-hidden")) return false;
            closeSignal();
            modalRequestId++;
            modal.classList.add("modal-hidden");
            if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
            return true;
        }

        // Lesson eye -> shared Lesson Progress modal, on top of this one
        if (chaptersEl) {
            chaptersEl.addEventListener("click", (e) => {
                const btn = e.target.closest(".js-open-lesson-progress");
                if (btn && window.CobraLessonProgressModal) {
                    window.CobraLessonProgressModal.open(btn.dataset.progressId);
                }
            });
        }

        if (closeBtn) closeBtn.addEventListener("click", closeModal);

        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });

        // If the lesson modal on top just used this Escape, leave this one
        // open; if THIS one closes, mark the Escape as used so a modal
        // underneath it (e.g. Account Details) stays open.
        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape" || e.defaultPrevented) return;
            if (closeSignal()) { e.preventDefault(); return; }   // "View all" first, then this one
            if (closeModal()) e.preventDefault();
        });

        window.CobraLearnerCourseModal = { open: openModal };
    });
})();
