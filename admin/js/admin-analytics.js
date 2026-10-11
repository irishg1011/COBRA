/**
 * admin-analytics.js - Admin > Analytics (Learning Analytics)
 * -----------------------------------------------------------
 * Loads every card from /admin/analytics/data (learning_analytics.py)
 * and draws it with Chart.js:
 *   - Lesson Performance  bar per module + dashed pass-mark line; bars and the
 *                         Avg Score column use the shared score color rule
 *                         (CobraScore: green at/above the pass mark, red below)
 *   - Score Distribution  donut of learners per score range + legend
 *   - Exercise Stages     avg % per activity type, learners who
 *                         completed it under each bar
 *   - Growth & Trend      last 8 weeks, toggle Active Learners / Avg Score
 *                         (one measure at a time - never two scales)
 *   - Topic Strength      3 strongest / 3 weakest modules
 * Status + time range filters reload everything; the filters are kept
 * in the URL so a reload shows the same view. Print Dashboard calls
 * window.print() - analytics.css lays the cards out for paper.
 *
 * feat/analytics-insights: plain chart names + a one-line insight under
 * each (from the server); top numbers vs the previous period; course
 * funnel, most-missed questions, engagement (per day + busiest hours);
 * green / yellow / red from the pass mark (CobraInsights); every card,
 * bar, slice, step, question, day and hour opens the list behind it
 * (admin-progress-cards.js -> /admin/analytics/details/<kind>?key=...).
 * Default range: Last 30 days.
 */
(function () {
    "use strict";

    const GREEN = "#16a34a";
    // Score bands, highest first (same order as the server): green above
    // the 80% pass mark, red below - darker = further from the pass mark.
    // feat/analytics-insights: 70-79% is the yellow "close" band.
    const BAND_COLORS = ["#15803d", "#4ade80", "#f59e0b", "#f87171", "#dc2626", "#991b1b"];
    const BAND_FILL = { pass: "#16a34a", close: "#f59e0b", fail: "#dc2626", none: "#9ca3af" };
    const INK_MUTED = "#6b7280";
    const GRID = "rgba(17, 17, 17, 0.08)";
    const CARD_BG = "#fffef4";

    document.addEventListener("DOMContentLoaded", () => {
        // Without Chart.js the legends, tables and topic bars still show.
        const hasChartJs = typeof window.Chart !== "undefined";

        const statusSelect = document.getElementById("analyticsStatusSelect");
        const rangeSelect = document.getElementById("analyticsRangeSelect");
        const printBtn = document.getElementById("analyticsPrintBtn");
        const scopeEl = document.getElementById("analyticsScope");
        const printFilters = document.getElementById("analyticsPrintFilters");
        const printDate = document.getElementById("analyticsPrintDate");

        if (hasChartJs) {
            Chart.defaults.font.family = "'Poppins', 'Segoe UI', sans-serif";
            Chart.defaults.font.size = 11;
            Chart.defaults.color = INK_MUTED;
        }

        const charts = {};
        let lastData = null;
        let trendMeasure = "avg_score";
        const Ins = window.CobraInsights;

        function openList(kind, key, trigger) {
            if (window.CobraProgressCards && CobraProgressCards.open) {
                CobraProgressCards.open(kind, trigger || document.activeElement, { key });
            }
        }

        function setInsight(id, text) {
            const el = document.getElementById(id);
            if (el && el.textContent !== (text || "")) el.textContent = text || "";
        }

        function pointer(evt, elements) {
            if (evt.native && evt.native.target) evt.native.target.style.cursor = elements.length ? "pointer" : "default";
        }
        let activeRequestId = 0;

        // ------------------------------------------------------------
        // Helpers
        // ------------------------------------------------------------
        function escapeHtml(str) {
            return String(str ?? "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        function pct(value) {
            return value === null || value === undefined ? "—" : `${value}%`;
        }

        function plural(n, word) {
            return `${n} ${word}${n === 1 ? "" : "s"}`;
        }

        function shorten(text, max) {
            text = String(text || "");
            return text.length > max ? `${text.slice(0, max - 1)}…` : text;
        }

        function showError(message) {
            const el = document.getElementById("analyticsLoadError");
            if (!el) return;
            el.textContent = message || "";
            el.classList.toggle("is-visible", !!message);
        }

        // Swap a chart for a "No data yet" note (and back) without losing the canvas.
        function setEmpty(wrapId, isEmpty, message) {
            const wrap = document.getElementById(wrapId);
            if (!wrap) return;
            let note = wrap.querySelector(".analytics-empty");
            Array.from(wrap.children).forEach((child) => {
                if (child !== note) child.style.display = isEmpty ? "none" : "";
            });
            if (isEmpty && !note) {
                note = document.createElement("div");
                note.className = "analytics-empty";
                wrap.appendChild(note);
            }
            if (note) {
                note.style.display = isEmpty ? "" : "none";
                note.innerHTML = `<i class="fa-regular fa-chart-bar" aria-hidden="true"></i><span>${escapeHtml(message || "No data yet.")}</span>`;
            }
        }

        function renderTable(containerId, headers, rows) {
            const el = document.getElementById(containerId);
            if (!el) return;
            if (!rows.length) {
                el.innerHTML = `<p class="analytics-card-note">No data yet.</p>`;
                return;
            }
            // A cell is a plain value, or { text, cls } when it needs a class
            // (e.g. the score color rule on an Avg Score cell).
            const head = headers.map((h) => `<th class="${h.num ? "num" : ""}">${escapeHtml(h.label)}</th>`).join("");
            const body = rows.map((r) => `<tr>${r.map((cell, i) => {
                const isObj = cell !== null && typeof cell === "object";
                const classes = [headers[i].num ? "num" : "", isObj ? cell.cls || "" : ""].filter(Boolean).join(" ");
                return `<td class="${classes}">${escapeHtml(isObj ? cell.text : cell)}</td>`;
            }).join("")}</tr>`).join("");
            el.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
        }

        function draw(key, canvasId, config) {
            if (!hasChartJs) return;
            if (charts[key]) charts[key].destroy();
            const canvas = document.getElementById(canvasId);
            if (canvas) charts[key] = new Chart(canvas, config);
        }

        const tooltipStyle = {
            backgroundColor: "#111111",
            padding: 10,
            cornerRadius: 6,
            displayColors: false,
        };

        function percentAxis() {
            return {
                min: 0,
                max: 100,
                ticks: { stepSize: 25, callback: (v) => `${v}%` },
                grid: { color: GRID },
                border: { display: false },
            };
        }

        // Dashed 80% pass line on the Lesson Performance chart.
        const passLine = {
            id: "passLine",
            afterDatasetsDraw(chart) {
                const y = chart.scales.y;
                const area = chart.chartArea;
                if (!y || !area) return;
                const mark = CobraScore.passMark();
                if (mark === null) return;
                const yPos = y.getPixelForValue(mark);
                const ctx = chart.ctx;
                ctx.save();
                ctx.strokeStyle = "#111111";
                ctx.globalAlpha = 0.55;
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 4]);
                ctx.beginPath();
                ctx.moveTo(area.left, yPos);
                ctx.lineTo(area.right, yPos);
                ctx.stroke();
                ctx.restore();
            },
        };

        // ------------------------------------------------------------
        // Cards
        // ------------------------------------------------------------
        function renderLessonPerformance(modules) {
            const hasData = modules.some((m) => m.avg !== null);
            setEmpty("lessonPerfWrap", !hasData, "No lesson scores yet for these learners.");
            renderTable("lessonPerfTable",
                [{ label: "Module" }, { label: "Chapter" }, { label: "Avg Score", num: true }, { label: "Learners", num: true }],
                modules.map((m) => [m.name, m.chapter, { text: pct(m.avg), cls: CobraScore.cls(m.avg) }, m.learners]));
            if (!hasData) return;

            draw("lessonPerf", "lessonPerfChart", {
                type: "bar",
                data: {
                    labels: modules.map((m) => m.name),
                    datasets: [{
                        label: "Avg Score",
                        data: modules.map((m) => m.avg),
                        backgroundColor: modules.map((m) => BAND_FILL[m.band || "none"]),
                        borderRadius: 4,
                        maxBarThickness: 34,
                    }],
                },
                options: {
                    maintainAspectRatio: false,
                    onHover: pointer,
                    onClick: (evt, elements) => {
                        if (elements.length) openList("module", modules[elements[0].index].module_id);
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...tooltipStyle,
                            callbacks: {
                                title: (items) => modules[items[0].dataIndex].name,
                                footer: () => "Click for its lessons",
                                label: (item) => {
                                    const m = modules[item.dataIndex];
                                    return [`Avg score: ${pct(m.avg)}`, `${m.chapter}`, plural(m.learners, "learner")];
                                },
                            },
                        },
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            // One label per bar: Chart.js would otherwise skip
                            // labels to make them fit, so the label under a
                            // bar could belong to a different module.
                            ticks: {
                                autoSkip: false,
                                maxRotation: 60,
                                minRotation: 0,
                                callback(value) { return shorten(this.getLabelForValue(value), 16); },
                            },
                        },
                        y: percentAxis(),
                    },
                },
                plugins: [passLine],
            });
        }

        function renderScoreDistribution(bands, learnersScored) {
            const total = bands.reduce((sum, b) => sum + b.count, 0);
            document.getElementById("scoreDistTotal").textContent = learnersScored;

            const legend = document.getElementById("scoreDistLegend");
            legend.innerHTML = bands.map((b, i) => `
                <li class="an-click" role="button" tabindex="0" data-band="${escapeHtml(b.label)}" title="Show these learners">
                    <span class="swatch" style="background:${BAND_COLORS[i]}"></span>
                    <span>${escapeHtml(b.label)}</span>
                    <span class="count">${plural(b.count, "learner")}</span>
                </li>`).join("");

            renderTable("scoreDistTable",
                [{ label: "Score Range" }, { label: "Learners", num: true }, { label: "Share", num: true }],
                bands.map((b) => [b.label, b.count, total ? `${Math.round((b.count / total) * 100)}%` : "—"]));

            setEmpty("scoreDistWrap", total === 0, "No learner has a score yet.");
            if (total === 0) return;

            draw("scoreDist", "scoreDistChart", {
                type: "doughnut",
                data: {
                    labels: bands.map((b) => b.label),
                    datasets: [{
                        data: bands.map((b) => b.count),
                        backgroundColor: BAND_COLORS,
                        borderColor: CARD_BG,
                        borderWidth: 2,
                        hoverOffset: 6,
                    }],
                },
                options: {
                    maintainAspectRatio: false,
                    cutout: "62%",
                    onHover: pointer,
                    onClick: (evt, elements) => {
                        if (elements.length) openList("band", bands[elements[0].index].label);
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...tooltipStyle,
                            callbacks: {
                                label: (item) => {
                                    const share = Math.round((item.raw / total) * 100);
                                    return `${item.label}: ${plural(item.raw, "learner")} (${share}%)`;
                                },
                            },
                        },
                    },
                },
            });
        }

        function renderStages(stages) {
            const stats = document.getElementById("stagesStats");
            if (stats) {
                stats.innerHTML = `<table class="progress-detail-table">
                    <thead><tr><th>Type</th><th>First-try avg</th><th>Learners</th><th title="Questions where time ran out (first try)">Timeouts</th><th title="Questions skipped (first try)">Skips</th><th title="Retake rounds started (exercise: extra attempts)">Retakes</th></tr></thead>
                    <tbody>${stages.map((s) => `<tr>
                        <td>${escapeHtml(s.label)}</td>
                        <td>${Ins ? Ins.scoreHtml(s.avg) : pct(s.avg)}</td>
                        <td>${escapeHtml(s.completed)}</td>
                        <td>${s.timeouts === null || s.timeouts === undefined ? "—" : escapeHtml(s.timeouts)}</td>
                        <td>${escapeHtml(s.skips ?? 0)}</td>
                        <td>${escapeHtml(s.retakes ?? 0)}</td>
                    </tr>`).join("")}</tbody></table>`;
            }
            const hasData = stages.some((s) => s.avg !== null);
            setEmpty("stagesWrap", !hasData, "No activities completed yet.");
            renderTable("stagesTable",
                [{ label: "Activity Type" }, { label: "Avg Score", num: true }, { label: "Learners Completed", num: true }],
                stages.map((s) => [s.label, pct(s.avg), s.completed]));
            if (!hasData) return;

            draw("stages", "stagesChart", {
                type: "bar",
                data: {
                    labels: stages.map((s) => [s.label, `${s.completed} completed`]),
                    datasets: [{
                        label: "Avg Score",
                        data: stages.map((s) => s.avg),
                        backgroundColor: stages.map((s) => BAND_FILL[Ins ? Ins.band(s.avg) : "pass"]),
                        borderRadius: 4,
                        maxBarThickness: 48,
                    }],
                },
                options: {
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...tooltipStyle,
                            callbacks: {
                                title: (items) => stages[items[0].dataIndex].label,
                                label: (item) => {
                                    const s = stages[item.dataIndex];
                                    return [`Avg score: ${pct(s.avg)}`, `${plural(s.completed, "learner")} completed`];
                                },
                            },
                        },
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: percentAxis(),
                    },
                },
            });
        }

        function renderTrend(trend) {
            renderTable("trendTable",
                [{ label: "Week" }, { label: "Active Learners", num: true }, { label: "Avg Score", num: true }],
                trend.map((w) => [w.range_label, w.active_learners, pct(w.avg_score)]));

            const isScore = trendMeasure === "avg_score";
            const values = trend.map((w) => w[trendMeasure]);
            const hasData = values.some((v) => v !== null && v > 0);
            setEmpty("trendWrap", !hasData,
                isScore ? "No lessons completed in the last 8 weeks." : "No learner logins in the last 8 weeks.");
            if (!hasData) return;

            const maxCount = Math.max(...values.filter((v) => v !== null), 0);
            draw("trend", "trendChart", {
                type: "line",
                data: {
                    labels: trend.map((w) => w.label),
                    datasets: [{
                        label: isScore ? "Avg Score" : "Active Learners",
                        data: values,
                        borderColor: GREEN,
                        backgroundColor: "rgba(22, 163, 74, 0.10)",
                        fill: true,
                        borderWidth: 2,
                        cubicInterpolationMode: "monotone",
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: GREEN,
                        pointBorderColor: CARD_BG,
                        pointBorderWidth: 2,
                        spanGaps: false,
                    }],
                },
                options: {
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...tooltipStyle,
                            callbacks: {
                                title: (items) => `Week of ${trend[items[0].dataIndex].range_label}`,
                                label: (item) => {
                                    const w = trend[item.dataIndex];
                                    return isScore
                                        ? `Avg score: ${pct(w.avg_score)}`
                                        : `${plural(w.active_learners, "active learner")}`;
                                },
                            },
                        },
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: isScore ? percentAxis() : {
                            min: 0,
                            suggestedMax: Math.max(4, maxCount + 1),
                            ticks: { precision: 0 },
                            grid: { color: GRID },
                            border: { display: false },
                        },
                    },
                },
            });
        }

        function renderTopicList(listId, topics, emptyText) {
            const list = document.getElementById(listId);
            if (!topics.length) {
                list.innerHTML = `<li class="analytics-topic-empty">${escapeHtml(emptyText)}</li>`;
                return;
            }
            list.innerHTML = topics.map((t) => `
                <li class="an-click" role="button" tabindex="0" data-module="${escapeHtml(t.module_id)}" title="Show this module's lessons">
                    <div class="analytics-topic-row">
                        <span>${escapeHtml(t.name)}<small>${escapeHtml(t.chapter)} · ${plural(t.learners, "learner")}</small></span>
                        <strong>${Ins ? Ins.scoreHtml(t.avg) : pct(t.avg)}</strong>
                    </div>
                    <div class="analytics-topic-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${t.avg}" aria-label="${escapeHtml(t.name)}">
                        <div class="analytics-topic-fill an-fill-${escapeHtml(t.band || "none")}" style="width:${Math.max(0, Math.min(100, t.avg))}%"></div>
                    </div>
                </li>`).join("");
        }

        function renderTopics(topics) {
            document.getElementById("topicsWeak").classList.add("is-weak");
            renderTopicList("topicsStrong", topics.strongest || [], "No module scores yet.");
            renderTopicList("topicsWeak", topics.weakest || [], "Needs at least two modules with scores.");
        }

        function renderScope(data) {
            if (!scopeEl) return;
            const when = data.period ? `${data.period.from} – ${data.period.to} (compared with ${data.period.previous})` : "All time (no comparison)";
            scopeEl.textContent = `${when} · ${plural(data.learners_scored, "learner")} with scores of ${data.learners_total} · ${plural(data.records, "finished lesson")}`;
        }

        // ---------- feat/analytics-insights ----------
        function changeText(c, unit, isPoints) {
            if (!c || c.direction === null || c.direction === undefined) {
                return (lastData && lastData.period) ? "No earlier data to compare" : "Pick a time range to compare";
            }
            const arrow = { up: "▲", down: "▼", same: "▬" }[c.direction];
            const prev = lastData && lastData.period ? `the previous ${lastData.period.days} days` : "before";
            if (c.change === null) return `${arrow} new vs ${prev}`;
            const amount = isPoints ? `${Math.abs(c.change)} pts` : `${Math.abs(c.change)}%`;
            return `${arrow} ${c.direction === "same" ? "same" : amount} vs ${prev}${c.previous !== null && c.previous !== undefined ? ` (${c.previous}${unit || ""})` : ""}`;
        }

        function setKpi(key, value, change, cls) {
            const v = document.querySelector(`[data-kpi-value="${key}"]`);
            const c = document.querySelector(`[data-kpi-change="${key}"]`);
            if (v && v.textContent !== String(value)) v.textContent = value;
            if (v) v.className = `metric-value ${cls || ""}`.trim();
            if (c && change !== undefined && c.textContent !== change) c.textContent = change;
        }

        function directionClass(c, goodWhenUp = true) {
            if (!c || !c.direction || c.direction === "same") return "";
            return (c.direction === "up") === goodWhenUp ? "is-good" : "is-bad";
        }

        function renderKpis(cards) {
            if (!cards || !cards.total) return;
            setKpi("total", cards.total.value, changeText(cards.total));
            setKpi("active", cards.active.value, changeText(cards.active));
            setKpi("inactive", cards.inactive.value);
            const avg = cards.avg_score;
            setKpi("avg_score", avg.value === null ? "—" : `${avg.value}%`, changeText(avg, "%", true), `lp-text-${avg.band || "none"}`);
            const fin = cards.finished;
            const pc = fin.period_compare;
            setKpi("finished", fin.value, pc ? `${fin.in_period} in this period · ${changeText(pc)}` : "All time");
            const st = cards.study_time;
            setKpi("study_time", st.value === null ? "—" : `${st.value} min`, changeText(st, " min"));
            document.querySelectorAll(".an-kpi-change[data-kpi-change]").forEach((el) => {
                const card = cards[el.dataset.kpiChange];
                const c = el.dataset.kpiChange === "finished" ? (card && card.period_compare) : card;
                el.classList.remove("is-good", "is-bad");
                const d = directionClass(c, el.dataset.kpiChange !== "inactive");
                if (d) el.classList.add(d);
            });
        }

        function renderInsights(map) {
            map = map || {};
            setInsight("lessonPerfInsight", map.lesson_performance);
            setInsight("scoreDistInsight", map.score_distribution);
            setInsight("stagesInsight", map.stages);
            setInsight("trendInsight", map.trend);
            setInsight("topicsInsight", map.topics);
            setInsight("funnelInsight", map.funnel);
            setInsight("missedInsight", map.most_missed);
            setInsight("engagementInsight", map.engagement);
        }

        function renderFunnel(steps) {
            const el = document.getElementById("funnelList");
            if (!el) return;
            if (!steps || !steps.length) { el.innerHTML = `<p class="analytics-card-note">No learners yet.</p>`; return; }
            el.innerHTML = steps.map((s) => `
                <div class="an-funnel-step an-click" role="button" tabindex="0" data-step="${s.index}" title="Who reached it / stopped here">
                    <span class="an-funnel-label">${escapeHtml(s.label)}</span>
                    <span class="lp-funnel-track"><span class="lp-funnel-fill" style="width:${Number(s.percent) || 0}%"></span></span>
                    <span class="an-funnel-count"><strong>${escapeHtml(s.count)}</strong> <small>(${escapeHtml(s.percent)}%)</small>
                        ${s.dropped ? `<small class="an-drop">−${escapeHtml(s.dropped)}</small>` : ""}</span>
                </div>`).join("");
        }

        function renderMissed(rows) {
            const el = document.getElementById("missedList");
            if (!el) return;
            if (!rows || !rows.length) {
                el.innerHTML = `<li class="analytics-topic-empty">No question was missed on the first try in this period.</li>`;
                return;
            }
            el.innerHTML = rows.map((q) => `
                <li class="lp-missed-item an-click${q.check_key ? " is-check-key" : ""}" role="button" tabindex="0" data-question="${escapeHtml(`${q.la_id}-${q.item_id}`)}" title="Who missed it">
                    <div class="lp-missed-text">
                        <strong>${escapeHtml(q.question)}</strong>
                        <small>${escapeHtml(q.lesson)}${q.activity && q.activity !== q.lesson ? ` · ${escapeHtml(q.activity)}` : ""} · ${escapeHtml(q.type)}</small>
                    </div>
                    <div class="lp-missed-stats">
                        <span class="badge lp-band lp-band-${q.miss_percent >= 50 ? "fail" : "close"}">${escapeHtml(q.miss_percent)}% missed</span>
                        <small>${escapeHtml(q.missed)} of ${escapeHtml(q.answered)} learners</small>
                        ${q.check_key ? `<span class="lp-check-key"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Check the answer key</span>` : ""}
                    </div>
                </li>`).join("");
        }

        const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        function hourLabel(h) { return `${h % 12 || 12}${h < 12 ? "a" : "p"}`; }

        function renderEngagement(eng) {
            eng = eng || { days: [], heatmap: [] };
            const stat = document.getElementById("sessionStat");
            if (stat) stat.textContent = eng.avg_session_minutes === null || eng.avg_session_minutes === undefined
                ? "" : `· avg study session ≈ ${eng.avg_session_minutes} min (${plural(eng.sessions, "session")}, estimated)`;

            const days = eng.days || [];
            const hasDays = days.some((d) => d.active > 0);
            setEmpty("daysWrap", !hasDays, "No activity in this period.");
            if (hasDays) {
                draw("days", "daysChart", {
                    type: "bar",
                    data: { labels: days.map((d) => d.label),
                        datasets: [{ label: "Active learners", data: days.map((d) => d.active), backgroundColor: "#18B8E6", borderRadius: 3, maxBarThickness: 18 }] },
                    options: {
                        maintainAspectRatio: false,
                        onHover: pointer,
                        onClick: (evt, elements) => { if (elements.length) openList("day", days[elements[0].index].date); },
                        plugins: { legend: { display: false }, tooltip: { ...tooltipStyle, callbacks: {
                            label: (item) => plural(item.raw, "active learner"), footer: () => "Click for who" } } },
                        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
                                  y: { min: 0, ticks: { precision: 0 }, grid: { color: GRID }, border: { display: false } } },
                    },
                });
            }

            const heat = document.getElementById("heatmap");
            if (!heat) return;
            const cells = {};
            let max = 0;
            (eng.heatmap || []).forEach((c) => { cells[`${c.day}-${c.hour}`] = c; max = Math.max(max, c.actions); });
            if (!max) { heat.innerHTML = `<p class="analytics-card-note">No learning activity in this period.</p>`; return; }
            let html = `<div class="an-heat-row an-heat-head"><span></span>${Array.from({ length: 24 }, (_, h) => `<span>${h % 3 === 0 ? hourLabel(h) : ""}</span>`).join("")}</div>`;
            DAY_NAMES.forEach((name, d) => {
                html += `<div class="an-heat-row"><span class="an-heat-day">${name}</span>`;
                for (let h = 0; h < 24; h++) {
                    const c = cells[`${d}-${h}`];
                    const level = c ? Math.max(1, Math.ceil((c.actions / max) * 4)) : 0;
                    const tip = c ? `${name} ${hourLabel(h)}: ${plural(c.actions, "action")} by ${plural(c.learners, "learner")} - click for who` : `${name} ${hourLabel(h)}: nothing`;
                    html += c
                        ? `<button type="button" class="an-heat-cell lvl-${level}" data-hour="${d}-${h}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}"></button>`
                        : `<span class="an-heat-cell lvl-0" title="${escapeHtml(tip)}"></span>`;
                }
                html += `</div>`;
            });
            heat.innerHTML = html + `<div class="an-heat-legend"><span>Less</span>${[0, 1, 2, 3, 4].map((l) => `<span class="an-heat-cell lvl-${l}"></span>`).join("")}<span>More</span></div>`;
        }

        // Clicks on lists drawn above (event delegation - they are redrawn on refresh)
        document.addEventListener("click", (e) => {
            const el = e.target.closest("[data-band], [data-module], [data-step], [data-question], [data-hour]");
            if (!el || !el.closest(".analytics-grid")) return;
            if (el.dataset.band) openList("band", el.dataset.band, el);
            else if (el.dataset.module) openList("module", el.dataset.module, el);
            else if (el.dataset.step !== undefined) openList("funnel", el.dataset.step, el);
            else if (el.dataset.question) openList("question", el.dataset.question, el);
            else if (el.dataset.hour) openList("hour", el.dataset.hour, el);
        });
        document.addEventListener("keydown", (e) => {
            if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("an-click")) {
                e.preventDefault();
                e.target.click();
            }
        });

        // Each card with the part of the data it draws - the live refresh
        // redraws only the cards whose part changed.
        const SECTIONS = [
            ["scope", (d) => [d.learners_scored, d.learners_total, d.records], (d) => renderScope(d)],
            ["lessonPerf", (d) => d.lesson_performance, (d) => renderLessonPerformance(d.lesson_performance || [])],
            ["scoreDist", (d) => [d.score_distribution, d.learners_scored],
                (d) => renderScoreDistribution(d.score_distribution || [], d.learners_scored || 0)],
            ["stages", (d) => d.stages, (d) => renderStages(d.stages || [])],
            ["trend", (d) => d.trend, (d) => renderTrend(d.trend || [])],
            ["topics", (d) => d.topics, (d) => renderTopics(d.topics || {})],
            ["kpis", (d) => [d.cards, d.period], (d) => renderKpis(d.cards)],
            ["insights", (d) => d.insights, (d) => renderInsights(d.insights)],
            ["funnel", (d) => d.funnel, (d) => renderFunnel(d.funnel || [])],
            ["missed", (d) => d.most_missed, (d) => renderMissed(d.most_missed || [])],
            ["engagement", (d) => d.engagement, (d) => renderEngagement(d.engagement)],
        ];

        function renderAll(data) {
            lastData = data;
            SECTIONS.forEach(([key, part, render]) => {
                if (window.CobraLive) CobraLive.changed(`analytics-${key}`, part(data));
                render(data);
            });
        }

        // Live refresh: only the changed cards, drawn without the grow-in
        // animation so an update never looks like a reload.
        function renderChanged(data) {
            lastData = data;
            const animation = hasChartJs ? Chart.defaults.animation : null;
            if (hasChartJs) Chart.defaults.animation = false;
            try {
                SECTIONS.forEach(([key, part, render]) => {
                    if (CobraLive.changed(`analytics-${key}`, part(data))) render(data);
                });
            } finally {
                if (hasChartJs) Chart.defaults.animation = animation;
            }
        }

        // ------------------------------------------------------------
        // Loading + filters
        // ------------------------------------------------------------
        function currentParams() {
            const params = new URLSearchParams();
            if (statusSelect && statusSelect.value !== "all") params.set("status", statusSelect.value);
            if (rangeSelect) params.set("range", rangeSelect.value || "30d");
            return params;
        }

        async function loadAnalytics() {
            const requestId = ++activeRequestId;
            const params = currentParams();

            try {
                const url = new URL(window.location.href);
                url.search = params.toString();
                window.history.replaceState(null, "", url.toString());
            } catch (e) { /* older browsers: filtering still works */ }

            try {
                const resp = await fetch(`/admin/analytics/data?${params.toString()}`, { credentials: "same-origin" });
                const result = await resp.json().catch(() => ({ success: false }));
                if (requestId !== activeRequestId) return; // a newer filter change won
                if (!result.success) {
                    showError(result.message || "Could not load analytics. Please try again.");
                    if (scopeEl) scopeEl.textContent = "";
                    return;
                }
                showError(hasChartJs ? "" : "The charts could not load. Refresh the page to try again - the numbers are under \"View data\".");
                renderAll(result);
                updatePrintHeader();
            } catch (err) {
                if (requestId === activeRequestId) showError("Could not reach the server. Please try again.");
            }
        }

        // Filters from the URL (reload-safe), then load.
        const initial = new URLSearchParams(window.location.search);
        if (statusSelect && initial.get("status")) statusSelect.value = initial.get("status");
        if (rangeSelect && initial.get("range")) rangeSelect.value = initial.get("range");
        if (statusSelect && !statusSelect.value) statusSelect.value = "all";
        if (rangeSelect && !rangeSelect.value) rangeSelect.value = "30d";

        if (statusSelect) statusSelect.addEventListener("change", loadAnalytics);
        if (rangeSelect) rangeSelect.addEventListener("change", loadAnalytics);

        document.querySelectorAll(".analytics-toggle button").forEach((btn) => {
            btn.addEventListener("click", () => {
                trendMeasure = btn.dataset.trend;
                document.querySelectorAll(".analytics-toggle button").forEach((b) => {
                    const on = b === btn;
                    b.classList.toggle("is-active", on);
                    b.setAttribute("aria-pressed", on ? "true" : "false");
                });
                if (lastData) renderTrend(lastData.trend || []);
            });
        });

        if (window.CobraProgressCards) {
            CobraProgressCards.init({ endpoint: "/admin/analytics/details", params: currentParams, csvPrefix: "analytics" });
        }
        loadAnalytics();

        // Live refresh (admin-live-refresh.js): same Learners / Time filters.
        // Skipped if the admin changed a filter meanwhile.
        if (window.CobraLive) {
            CobraLive.every("analytics", async () => {
                const startedAt = activeRequestId;
                const resp = await fetch(`/admin/analytics/data?${currentParams().toString()}`, { credentials: "same-origin" });
                const result = await resp.json().catch(() => ({ success: false }));
                if (!result.success || startedAt !== activeRequestId) return;
                renderChanged(result);
            });
        }

        // ------------------------------------------------------------
        // Print Dashboard
        // ------------------------------------------------------------
        function selectedText(select) {
            const option = select ? select.options[select.selectedIndex] : null;
            return option ? option.textContent.trim() : "";
        }

        function updatePrintHeader() {
            if (printFilters) {
                printFilters.textContent = `${selectedText(statusSelect) || "All Learners"} · ${selectedText(rangeSelect) || "Last 30 Days"}`;
            }
            if (printDate) {
                const now = new Date();
                printDate.textContent = `Printed ${now.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}, ${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
            }
        }

        function resizeCharts() {
            Object.values(charts).forEach((chart) => chart.resize());
        }

        window.addEventListener("beforeprint", () => { updatePrintHeader(); resizeCharts(); }); // also Ctrl+P
        window.addEventListener("afterprint", resizeCharts);
        if (printBtn) {
            printBtn.addEventListener("click", () => {
                updatePrintHeader();
                window.print();
            });
        }
    });
})();
