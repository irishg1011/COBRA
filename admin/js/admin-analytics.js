/**
 * admin-analytics.js - Admin > Analytics (Learning Analytics)
 * -----------------------------------------------------------
 * Loads every card from /admin/analytics/data (learning_analytics.py)
 * and draws it with Chart.js:
 *   - Lesson Performance  bar per module + dashed 80% pass line
 *   - Score Distribution  donut of learners per score range + legend
 *   - Exercise Stages     avg % per activity type, learners who
 *                         completed it under each bar
 *   - Growth & Trend      last 8 weeks, toggle Active Learners / Avg Score
 *                         (one measure at a time - never two scales)
 *   - Topic Strength      3 strongest / 3 weakest modules
 * Status + time range filters reload everything; the filters are kept
 * in the URL so a reload shows the same view. Print Dashboard calls
 * window.print() - analytics.css lays the cards out for paper.
 */
(function () {
    "use strict";

    const GREEN = "#16a34a";
    const PASS_MARK = 80;
    // Score bands, highest first (same order as the server): green above
    // the 80% pass mark, red below - darker = further from the pass mark.
    const BAND_COLORS = ["#15803d", "#4ade80", "#fca5a5", "#f87171", "#dc2626", "#991b1b"];
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
        let trendMeasure = "active_learners";
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
            const head = headers.map((h) => `<th class="${h.num ? "num" : ""}">${escapeHtml(h.label)}</th>`).join("");
            const body = rows.map((r) => `<tr>${r.map((cell, i) =>
                `<td class="${headers[i].num ? "num" : ""}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
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
                const yPos = y.getPixelForValue(PASS_MARK);
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
                modules.map((m) => [m.name, m.chapter, pct(m.avg), m.learners]));
            if (!hasData) return;

            draw("lessonPerf", "lessonPerfChart", {
                type: "bar",
                data: {
                    labels: modules.map((m) => m.name),
                    datasets: [{
                        label: "Avg Score",
                        data: modules.map((m) => m.avg),
                        backgroundColor: GREEN,
                        borderRadius: 4,
                        maxBarThickness: 34,
                    }],
                },
                options: {
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            ...tooltipStyle,
                            callbacks: {
                                title: (items) => modules[items[0].dataIndex].name,
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
                            ticks: { maxRotation: 40, minRotation: 0, callback(value) { return shorten(this.getLabelForValue(value), 16); } },
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
                <li>
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
                        backgroundColor: GREEN,
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
                <li>
                    <div class="analytics-topic-row">
                        <span>${escapeHtml(t.name)}<small>${escapeHtml(t.chapter)} · ${plural(t.learners, "learner")}</small></span>
                        <strong>${pct(t.avg)}</strong>
                    </div>
                    <div class="analytics-topic-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${t.avg}" aria-label="${escapeHtml(t.name)}">
                        <div class="analytics-topic-fill" style="width:${Math.max(0, Math.min(100, t.avg))}%"></div>
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
            scopeEl.textContent = `Based on ${plural(data.learners_scored, "learner")} with scores `
                + `(out of ${data.learners_total}) · ${plural(data.records, "lesson record")}`;
        }

        function renderAll(data) {
            lastData = data;
            renderScope(data);
            renderLessonPerformance(data.lesson_performance || []);
            renderScoreDistribution(data.score_distribution || [], data.learners_scored || 0);
            renderStages(data.stages || []);
            renderTrend(data.trend || []);
            renderTopics(data.topics || {});
        }

        // ------------------------------------------------------------
        // Loading + filters
        // ------------------------------------------------------------
        function currentParams() {
            const params = new URLSearchParams();
            if (statusSelect && statusSelect.value !== "all") params.set("status", statusSelect.value);
            if (rangeSelect && rangeSelect.value !== "all") params.set("range", rangeSelect.value);
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
        if (rangeSelect && !rangeSelect.value) rangeSelect.value = "all";

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

        loadAnalytics();

        // ------------------------------------------------------------
        // Print Dashboard
        // ------------------------------------------------------------
        function selectedText(select) {
            const option = select ? select.options[select.selectedIndex] : null;
            return option ? option.textContent.trim() : "";
        }

        function updatePrintHeader() {
            if (printFilters) {
                printFilters.textContent = `${selectedText(statusSelect) || "All Learners"} · ${selectedText(rangeSelect) || "All Time"}`;
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
