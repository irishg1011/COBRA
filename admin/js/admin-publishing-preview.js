/**
 * admin-publishing-preview.js
 * --------------------------------------------------------------------
 * Drives the Preview modal across 3 screens, reusing the REAL learner-
 * side CSS classes and closely mirroring learning-map.js / lessons.js /
 * lesson-content.js / lesson-activities.js's own rendering patterns -
 * pointed at the read-only /publishing/preview/... routes instead of
 * the real learner /api/... routes, and with every gate (locking,
 * watch-%, scroll-%) removed since nothing needs to be earned here.
 *
 * Nothing in this file ever calls a route that records progress -
 * activities are graded via the real check-answer logic, exercises via
 * the real comparison logic, but neither is ever saved anywhere.
 *
 * Exposes window.CobraBytePublishingPreview.open() for the Preview
 * button (admin-publishing.js) to call.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const modal = document.getElementById("publishingPreviewModal");
        if (!modal) return;

        const closeBtn = document.getElementById("previewCloseBtn");
        const backBtn = document.getElementById("previewBackBtn");

        const mapScreen = document.getElementById("previewMapScreen");
        const lessonsScreen = document.getElementById("previewLessonsScreen");
        const contentScreen = document.getElementById("previewContentScreen");

        const mapChain = document.getElementById("previewMapChain");
        const categoryTitleEl = document.getElementById("previewCategoryTitle");
        const modulesContainer = document.getElementById("previewModulesContainer");

        const stepperEl = document.getElementById("previewStepper");
        const lessonTitleEl = document.getElementById("previewLessonTitle");

        const videoStep = document.getElementById("previewVideoStep");
        const videoFrame = document.getElementById("previewVideoFrame");
        const videoTitleEl = document.getElementById("previewVideoTitle");
        const videoContinueBtn = document.getElementById("previewVideoContinueBtn");

        const contentStep = document.getElementById("previewContentStep");
        const contentBodyEl = document.getElementById("previewLessonContentBody");
        const contentContinueBtn = document.getElementById("previewContentContinueBtn");

        const activitiesStep = document.getElementById("previewActivitiesStep");
        const activitiesContainer = document.getElementById("previewActivitiesContainer");
        const activitiesContinueBtn = document.getElementById("previewActivitiesContinueBtn");

        const exerciseStep = document.getElementById("previewExerciseStep");
        const exerciseTitleEl = document.getElementById("previewExerciseTitle");
        const exerciseSituationEl = document.getElementById("previewExerciseSituation");
        const exerciseProblemEl = document.getElementById("previewExerciseProblem");
        const exerciseClueEl = document.getElementById("previewExerciseClue");
        const exerciseCodeBox = document.getElementById("previewExerciseCodeBox");
        const exerciseOutputBox = document.getElementById("previewExerciseOutputBox");
        const exerciseRunBtn = document.getElementById("previewExerciseRunBtn");
        const exerciseSubmitBtn = document.getElementById("previewExerciseSubmitBtn");
        const exerciseResultBox = document.getElementById("previewExerciseResultBox");
        const exerciseCompleteRow = document.getElementById("previewExerciseCompleteRow");
        const exerciseContinueBtn = document.getElementById("previewExerciseContinueBtn");

        const summaryStep = document.getElementById("previewSummaryStep");
        const summaryListEl = document.getElementById("previewSummaryList");
        const summaryContinueBtn = document.getElementById("previewSummaryContinueBtn");

        let navStack = [];
        let currentLesson = null; // { resource_id, video, exercise } - built up as steps load
        let stepOrder = [];
        let sessionTally = { video_seen: false, content_seen: false, activities: [], exercise: null };
        let statusFilter = "all"; // "all" | "Ready to Publish" | "Published"

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function badgeHtml(status) {
            const cls = status === "Published" ? "status-completed" : "status-ready";
            return `<span class="lesson-badge ${cls}">${escapeHtml(status)}</span>`;
        }

        function showScreen(screen) {
            [mapScreen, lessonsScreen, contentScreen].forEach((s) => s.classList.add("preview-hidden"));
            screen.classList.remove("preview-hidden");
        }

        function updateBackButton() {
            backBtn.classList.toggle("preview-hidden", navStack.length === 0);
        }

        // ------------------------------------------------------------
        // SCREEN 1: Learning Map
        // ------------------------------------------------------------
        const mapLoadingEl = document.getElementById("previewMapLoading");
        const mapErrorEl = document.getElementById("previewMapError");
        const statusFilterEl = document.getElementById("previewStatusFilter");
        let allChapters = []; // unfiltered, cached so the filter buttons don't need to re-fetch

        if (statusFilterEl) {
            statusFilterEl.querySelectorAll(".preview-filter-btn").forEach((btn) => {
                btn.addEventListener("click", () => {
                    statusFilterEl.querySelectorAll(".preview-filter-btn").forEach((b) => b.classList.remove("active"));
                    btn.classList.add("active");
                    statusFilter = btn.dataset.filter;
                    renderMapChapters(applyStatusFilter(allChapters));
                });
            });
        }

        function applyStatusFilter(chapters) {
            if (statusFilter === "all") return chapters;
            return chapters.filter((c) => c.status === statusFilter);
        }

        async function loadMap(pushToStack) {
            if (pushToStack) navStack.push(() => loadMap(false));
            showScreen(mapScreen);
            updateBackButton();
            mapLoadingEl.style.display = "block";
            mapErrorEl.style.display = "none";
            mapChain.innerHTML = "";

            try {
                const resp = await fetch("/admin/publishing/preview/learning-map", { credentials: "include" });
                const result = await resp.json();
                allChapters = result.chapters || [];

                mapLoadingEl.style.display = "none";

                const filtered = applyStatusFilter(allChapters);
                if (filtered.length === 0) {
                    mapErrorEl.textContent = statusFilter === "all"
                        ? "Nothing is Ready to Publish or Published yet."
                        : `Nothing is ${statusFilter} yet.`;
                    mapErrorEl.style.display = "block";
                    return;
                }

                renderMapChapters(filtered);
            } catch (e) {
                mapLoadingEl.style.display = "none";
                mapErrorEl.textContent = "Could not reach the server.";
                mapErrorEl.style.display = "block";
            }
        }

        const MAP_BOOK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>`;
        const MAP_CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>`;

        function renderMapChapters(chapters) {
            mapChain.innerHTML = "";

            chapters.forEach((chapter, index) => {
                const row = document.createElement("div");
                row.className = `map-node-row ${index % 2 === 0 ? "align-left" : "align-right"}`;

                const isPublished = chapter.status === "Published";
                const node = document.createElement("div");
                node.className = `map-node node-clickable ${isPublished ? "status-completed" : "status-in_progress"}`;

                node.innerHTML = `
                    <div class="map-node-icon">${isPublished ? MAP_CHECK_ICON : MAP_BOOK_ICON}</div>
                    <div class="map-node-text">
                        <p class="chapter-label">Chapter ${index + 1}</p>
                        <h3>${escapeHtml(chapter.category_name)}</h3>
                        <p class="chapter-meta">${chapter.modules_total} module${chapter.modules_total === 1 ? "" : "s"} &middot; ${escapeHtml(chapter.status)}</p>
                    </div>
                `;
                node.addEventListener("click", () => loadLessons(chapter.cat_id, true));

                row.appendChild(node);
                mapChain.appendChild(row);
            });

            requestAnimationFrame(() => drawMapConnectors(chapters));
        }

        function drawMapConnectors(chapters) {
            const existingSvg = mapChain.querySelector(".map-connector-svg");
            if (existingSvg) existingSvg.remove();
            mapChain.querySelectorAll(".map-connector-lock").forEach((el) => el.remove());

            const containerRect = mapChain.getBoundingClientRect();
            const nodeEls = mapChain.querySelectorAll(".map-node");
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("class", "map-connector-svg");
            svg.style.position = "absolute";
            svg.style.top = "0";
            svg.style.left = "0";
            svg.style.width = "100%";
            svg.style.height = `${mapChain.scrollHeight}px`;
            svg.style.pointerEvents = "none";
            svg.style.zIndex = "1";

            nodeEls.forEach((nodeEl, index) => {
                if (index >= nodeEls.length - 1) return;
                const nextEl = nodeEls[index + 1];
                const rectA = nodeEl.getBoundingClientRect();
                const rectB = nextEl.getBoundingClientRect();

                const x1 = rectA.left + rectA.width / 2 - containerRect.left;
                const y1 = rectA.bottom - containerRect.top;
                const x2 = rectB.left + rectB.width / 2 - containerRect.left;
                const y2 = rectB.top - containerRect.top;
                const midY = (y1 + y2) / 2;

                const path = document.createElementNS(svgNS, "path");
                path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
                path.setAttribute("fill", "none");
                path.setAttribute("stroke", chapters[index].status === "Published" ? "#0ED400" : "#64748b");
                path.setAttribute("stroke-width", "5");
                path.setAttribute("stroke-linecap", "round");
                path.style.filter = "drop-shadow(0 0 3px rgba(255,255,255,0.9))";
                svg.appendChild(path);
            });

            mapChain.insertBefore(svg, mapChain.firstChild);
        }

        // ------------------------------------------------------------
        // SCREEN 2: Lessons
        // ------------------------------------------------------------
        async function loadLessons(catId, pushToStack) {
            if (pushToStack) navStack.push(() => loadLessons(catId, false));
            showScreen(lessonsScreen);
            updateBackButton();
            modulesContainer.innerHTML = `<p class="lessons-loading">Loading&hellip;</p>`;

            try {
                const resp = await fetch(`/admin/publishing/preview/lessons?cat_id=${catId}`, { credentials: "include" });
                const result = await resp.json();
                if (!result.success) {
                    modulesContainer.innerHTML = `<p class="lessons-error">${escapeHtml(result.message || "Could not load this chapter.")}</p>`;
                    return;
                }

                categoryTitleEl.textContent = result.category_name || "";
                const modules = result.modules || [];

                modulesContainer.innerHTML = modules.map((m) => `
                    <div class="module-block">
                        <div class="module-header">
                            <div class="module-flag-icon"><i class="fa-solid fa-flag"></i></div>
                            <div><h2>${escapeHtml(m.module_name)} ${badgeHtml(m.status)}</h2><p>${escapeHtml(m.description || "")}</p></div>
                        </div>
                        <div class="lessons-list">
                            ${(m.lessons || []).map((l) => `
                                <div class="lesson-card unlocked" data-resource-id="${l.resource_id}" style="cursor:pointer;">
                                    <div class="lesson-card-main">
                                        <div class="lesson-badges">${badgeHtml(l.status)}</div>
                                        <h3>${escapeHtml(l.resource_title)}</h3>
                                    </div>
                                    <button type="button" class="lesson-action-btn action-unlocked">Open</button>
                                </div>
                            `).join("") || `<p class="lessons-loading">No publishable lessons yet.</p>`}
                        </div>
                    </div>
                `).join("");

                modulesContainer.querySelectorAll(".lesson-card").forEach((card) => {
                    card.addEventListener("click", () => loadLessonContent(parseInt(card.dataset.resourceId, 10), true));
                });
            } catch (e) {
                modulesContainer.innerHTML = `<p class="lessons-error">Could not reach the server.</p>`;
            }
        }

        // ------------------------------------------------------------
        // SCREEN 3: Lesson Content stepper
        // ------------------------------------------------------------
        function renderStepper(currentKey) {
            const currentIndex = stepOrder.findIndex((s) => s.key === currentKey);
            stepperEl.innerHTML = stepOrder.map((s, i) => {
                const isDone = i < currentIndex;
                const isCurrent = i === currentIndex;
                const cls = isDone ? " done" : isCurrent ? " current" : "";
                const circle = isDone ? '<i class="fa-solid fa-check"></i>' : (i + 1);
                const line = i < stepOrder.length - 1 ? `<div class="lesson-step-line${isDone ? " done" : ""}"></div>` : "";
                return `<div class="lesson-step-node${cls}"><div class="lesson-step-circle">${circle}</div><div class="lesson-step-label">${s.label}</div></div>${line}`;
            }).join("");
        }

        function showStep(key) {
            [videoStep, contentStep, activitiesStep, exerciseStep, summaryStep].forEach((s) => s.style.display = "none");
            const map = { video: videoStep, content: contentStep, activities: activitiesStep, exercise: exerciseStep, summary: summaryStep };
            map[key].style.display = "block";
            renderStepper(key);
            if (key === "summary") loadSummary();
        }

        async function loadLessonContent(resourceId, pushToStack) {
            if (pushToStack) navStack.push(() => loadLessonContent(resourceId, false));
            showScreen(contentScreen);
            updateBackButton();
            sessionTally = { video_seen: false, content_seen: false, activities: [], exercise: null };

            try {
                const [contentResp, videoResp, exerciseResp] = await Promise.all([
                    fetch(`/admin/publishing/preview/lesson-content?resource_id=${resourceId}`, { credentials: "include" }),
                    fetch(`/admin/publishing/preview/video?resource_id=${resourceId}`, { credentials: "include" }),
                    fetch(`/admin/publishing/preview/exercise?resource_id=${resourceId}`, { credentials: "include" }),
                ]);
                const contentResult = await contentResp.json();
                const videoResult = await videoResp.json();
                const exerciseResult = await exerciseResp.json();

                if (!contentResult.success) {
                    lessonTitleEl.style.display = "block";
                    lessonTitleEl.textContent = contentResult.message || "Could not load this lesson.";
                    return;
                }

                currentLesson = {
                    resource_id: resourceId,
                    video: videoResult.video || null,
                    exercise: exerciseResult.exercise || null,
                };

                lessonTitleEl.style.display = "block";
                lessonTitleEl.textContent = contentResult.resource_title || "";
                contentBodyEl.innerHTML = contentResult.content_html || "";

                stepOrder = [];
                if (currentLesson.video) stepOrder.push({ key: "video", label: "Video" });
                stepOrder.push({ key: "content", label: "Content" });
                stepOrder.push({ key: "activities", label: "Activities" });
                if (currentLesson.exercise) stepOrder.push({ key: "exercise", label: "Exercise" });
                stepOrder.push({ key: "summary", label: "Summary" });

                if (currentLesson.video) {
                    videoTitleEl.textContent = currentLesson.video.video_title || "";
                    videoFrame.innerHTML = `<iframe src="https://www.youtube.com/embed/${escapeHtml(currentLesson.video.video_id || "")}" allowfullscreen></iframe>`;
                }

                if (currentLesson.exercise) {
                    exerciseTitleEl.textContent = currentLesson.exercise.exercise_title || "";
                    exerciseSituationEl.textContent = currentLesson.exercise.situation || "";
                    exerciseProblemEl.textContent = currentLesson.exercise.problem_question || "";
                    exerciseClueEl.textContent = currentLesson.exercise.clue || "";
                    exerciseCodeBox.textContent = "# Write your code here\n";
                    exerciseOutputBox.textContent = "Run your code to see the output.";
                    exerciseResultBox.style.display = "none";
                    exerciseCompleteRow.style.display = "none";
                }

                showStep(stepOrder[0].key);
            } catch (e) {
                lessonTitleEl.style.display = "block";
                lessonTitleEl.textContent = "Could not reach the server.";
            }
        }

        // Video/Content: Continue always enabled - Preview has nothing to earn.
        videoContinueBtn.addEventListener("click", () => {
            sessionTally.video_seen = true;
            showStep("content");
        });
        contentContinueBtn.addEventListener("click", () => {
            sessionTally.content_seen = true;
            startActivitiesStep();
        });

        // ------------------------------------------------------------
        // Activities - adapted from lesson-activities.js: same
        // sequential Question X of Y flow, pointed at the preview
        // check-answer route, with markActivityComplete() dropped
        // entirely (nothing is ever recorded).
        // ------------------------------------------------------------
        function el(tag, className, html) {
            const e = document.createElement(tag);
            if (className) e.className = className;
            if (html !== undefined) e.innerHTML = html;
            return e;
        }

        async function checkPreviewAnswer(payload) {
            const resp = await fetch("/admin/publishing/preview/check-answer", {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            return resp.json();
        }

        function renderMCQ(activity, container, onDone) {
            let idx = 0, correct = 0;
            const total = activity.items.length;
            function renderQ() {
                container.innerHTML = "";
                const q = activity.items[idx];
                container.appendChild(el("p", "activity-progress-label", `Question ${idx + 1} of ${total}`));
                container.appendChild(el("h4", "activity-question-text", escapeHtml(q.question_text)));
                const wrap = el("div", "activity-options-list");
                q.options.forEach((opt) => {
                    const btn = el("button", "activity-option-btn", escapeHtml(opt.text));
                    btn.type = "button"; btn.dataset.optionId = opt.option_id;
                    btn.addEventListener("click", () => select(opt.option_id, btn, wrap));
                    wrap.appendChild(btn);
                });
                container.appendChild(wrap);
                const feedback = el("div", "activity-feedback-box"); feedback.style.display = "none";
                container.appendChild(feedback);
                const nextBtn = el("button", "activity-next-btn", idx === total - 1 ? "Finish" : "Next Question");
                nextBtn.type = "button"; nextBtn.style.display = "none";
                nextBtn.addEventListener("click", () => { idx += 1; idx >= total ? finish() : renderQ(); });
                container.appendChild(nextBtn);

                async function select(optId, btnEl, wrapEl) {
                    wrapEl.querySelectorAll(".activity-option-btn").forEach((b) => (b.disabled = true));
                    btnEl.classList.add("selected");
                    const result = await checkPreviewAnswer({ type: "mcq", q_id: q.q_id, option_id: optId });
                    wrapEl.querySelectorAll(".activity-option-btn").forEach((b) => {
                        if (Number(b.dataset.optionId) === result.correct_option_id) b.classList.add("correct");
                    });
                    if (!result.is_correct) btnEl.classList.add("incorrect"); else correct += 1;
                    feedback.style.display = "block";
                    feedback.className = "activity-feedback-box " + (result.is_correct ? "is-correct" : "is-incorrect");
                    feedback.textContent = result.feedback || (result.is_correct ? "Correct!" : "Not quite.");
                    nextBtn.style.display = "inline-flex";
                }
            }
            function finish() {
                container.innerHTML = "";
                const s = el("div", "activity-summary"); s.innerHTML = `<p>Scored <strong>${correct} / ${total}</strong> on "${escapeHtml(activity.activity_title)}".</p>`;
                container.appendChild(s);
                sessionTally.activities.push({ title: activity.activity_title, score: correct, total });
                onDone();
            }
            renderQ();
        }

        function renderFillBlanks(activity, container, onDone) {
            let idx = 0, correct = 0;
            const total = activity.items.length;
            function renderItem() {
                container.innerHTML = "";
                const item = activity.items[idx];
                container.appendChild(el("p", "activity-progress-label", `Item ${idx + 1} of ${total}`));
                container.appendChild(el("p", "activity-question-text", escapeHtml(item.content)));
                const input = el("input", "activity-fillblank-input"); input.type = "text"; input.placeholder = "Type your answer...";
                container.appendChild(input);
                const submitBtn = el("button", "activity-next-btn", "Submit"); submitBtn.type = "button";
                container.appendChild(submitBtn);
                const feedback = el("div", "activity-feedback-box"); feedback.style.display = "none";
                container.appendChild(feedback);

                submitBtn.addEventListener("click", async () => {
                    if (submitBtn.textContent === "Submit") {
                        const result = await checkPreviewAnswer({ type: "fill_blank", fib_id: item.fib_id, answer: input.value });
                        input.disabled = true;
                        if (result.is_correct) correct += 1;
                        feedback.style.display = "block";
                        feedback.className = "activity-feedback-box " + (result.is_correct ? "is-correct" : "is-incorrect");
                        feedback.textContent = result.is_correct ? (result.feedback || "Correct!") : (result.feedback || `Not quite. Answer: ${result.correct_answer}`);
                        submitBtn.textContent = idx === total - 1 ? "Finish" : "Next Item";
                    } else {
                        idx += 1; idx >= total ? finish() : renderItem();
                    }
                });
            }
            function finish() {
                container.innerHTML = "";
                const s = el("div", "activity-summary"); s.innerHTML = `<p>Scored <strong>${correct} / ${total}</strong> on "${escapeHtml(activity.activity_title)}".</p>`;
                container.appendChild(s);
                sessionTally.activities.push({ title: activity.activity_title, score: correct, total });
                onDone();
            }
            renderItem();
        }

        function renderFlashcards(activity, container, onDone) {
            let idx = 0, flipped = false;
            const total = activity.items.length;
            function renderCard() {
                flipped = false;
                container.innerHTML = "";
                const card = activity.items[idx];
                container.appendChild(el("p", "activity-progress-label", `Card ${idx + 1} of ${total}`));
                const box = el("div", "activity-flashcard-box", escapeHtml(card.front));
                box.style.cssText = "min-height:160px;display:flex;align-items:center;justify-content:center;text-align:center;padding:32px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:14px;font-size:18px;font-weight:700;color:#0f172a;cursor:pointer;margin-bottom:12px;";
                box.addEventListener("click", () => { flipped = !flipped; box.textContent = flipped ? card.back : card.front; });
                container.appendChild(box);
                container.appendChild(el("p", "activity-flashcard-hint", "Click the card to flip it."));
                const nextBtn = el("button", "activity-next-btn", idx === total - 1 ? "Finish" : "Next Card"); nextBtn.type = "button";
                nextBtn.addEventListener("click", () => { idx += 1; idx >= total ? finish() : renderCard(); });
                container.appendChild(nextBtn);
            }
            function finish() {
                container.innerHTML = "";
                const s = el("div", "activity-summary"); s.innerHTML = `<p>Reviewed all ${total} flashcards in "${escapeHtml(activity.activity_title)}".</p>`;
                container.appendChild(s);
                sessionTally.activities.push({ title: activity.activity_title, score: null, total });
                onDone();
            }
            renderCard();
        }

        function renderActivity(activity, container, onDone) {
            if (activity.activity_type === "Multiple Choice" || activity.activity_type === "Quiz") renderMCQ(activity, container, onDone);
            else if (activity.activity_type === "Fill in the Blanks") renderFillBlanks(activity, container, onDone);
            else if (activity.activity_type === "Flashcards") renderFlashcards(activity, container, onDone);
            else onDone();
        }

        async function startActivitiesStep() {
            showStep("activities");
            activitiesContinueBtn.style.display = "none";

            let activities = [];
            try {
                const resp = await fetch(`/admin/publishing/preview/activities?resource_id=${currentLesson.resource_id}`, { credentials: "include" });
                const result = await resp.json();
                activities = result.activities || [];
            } catch (e) { /* leave empty */ }

            if (activities.length === 0) {
                activitiesContainer.style.display = "none";
                afterActivities();
                return;
            }

            activitiesContainer.style.display = "block";
            activitiesContainer.innerHTML = "";
            const gate = el("div", "activities-gate");
            gate.innerHTML = `<h3><i class="fa-solid fa-list-check"></i> Activities</h3><p>Complete the activities below.</p><button type="button" class="activities-proceed-btn">Proceed to Activities</button>`;
            activitiesContainer.appendChild(gate);
            const host = el("div", "activity-host"); host.style.display = "none";
            activitiesContainer.appendChild(host);

            gate.querySelector(".activities-proceed-btn").addEventListener("click", () => {
                gate.style.display = "none"; host.style.display = "block"; runNext(0);
            });

            function runNext(index) {
                if (index >= activities.length) {
                    host.innerHTML = `<div class="activity-summary"><p><i class="fa-solid fa-circle-check"></i> All activities completed!</p></div>`;
                    afterActivities();
                    return;
                }
                const section = el("div", "activity-section");
                host.innerHTML = ""; host.appendChild(section);
                renderActivity(activities[index], section, () => runNext(index + 1));
            }
        }

        function afterActivities() {
            activitiesContinueBtn.style.display = "inline-flex";
            if (currentLesson.exercise) {
                activitiesContinueBtn.textContent = "Continue";
                activitiesContinueBtn.onclick = () => showStep("exercise");
            } else {
                activitiesContinueBtn.textContent = "View Summary";
                activitiesContinueBtn.onclick = () => showStep("summary");
            }
        }

        // ------------------------------------------------------------
        // Exercise - own lean Pyodide runtime (this modal isn't on the
        // real lesson-content.js page, so it needs its own loader).
        // Deterministic grading run feeds each test case's real input
        // through builtins.input(); the free "Run" button uses a blank
        // input queue since there's no real terminal prompt UI here -
        // good enough for an admin sanity-checking their own code.
        // ------------------------------------------------------------
        let pyodideLoadPromise = null;
        function getPyodide() {
            if (!pyodideLoadPromise) {
                if (typeof loadPyodide !== "function") return Promise.reject(new Error("Pyodide not loaded."));
                pyodideLoadPromise = loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" });
            }
            return pyodideLoadPromise;
        }

        async function runForGrading(code, testInput) {
            let pyodide;
            try { pyodide = await getPyodide(); } catch (e) { return null; }
            const inputLines = (testInput || "").split("\n");
            pyodide.globals.set("_pv_code", code || "");
            pyodide.globals.set("_pv_inputs", inputLines);
            try {
                return await pyodide.runPythonAsync(
                    "import sys, io, traceback, builtins\n" +
                    "_pv_out = io.StringIO()\n" +
                    "_old_out, _old_err = sys.stdout, sys.stderr\n" +
                    "sys.stdout = sys.stderr = _pv_out\n" +
                    "_pv_queue = list(_pv_inputs.to_py())\n" +
                    "def _pv_input(prompt=''):\n" +
                    "    return _pv_queue.pop(0) if _pv_queue else ''\n" +
                    "_old_input = builtins.input\n" +
                    "builtins.input = _pv_input\n" +
                    "try:\n" +
                    "    exec(_pv_code, {'__name__': '__main__'})\n" +
                    "except Exception:\n" +
                    "    traceback.print_exc()\n" +
                    "finally:\n" +
                    "    builtins.input = _old_input\n" +
                    "    sys.stdout, sys.stderr = _old_out, _old_err\n" +
                    "_pv_out.getvalue()\n"
                );
            } catch (err) {
                return "Error running code: " + (err && err.message ? err.message : String(err));
            }
        }

        exerciseRunBtn.addEventListener("click", async () => {
            const code = exerciseCodeBox.innerText.trim();
            if (!code) return;
            exerciseRunBtn.disabled = true; exerciseRunBtn.textContent = "Running...";
            exerciseOutputBox.textContent = "";
            const output = await runForGrading(code, "");
            exerciseOutputBox.textContent = (output || "").trim();
            exerciseRunBtn.disabled = false; exerciseRunBtn.textContent = "Run";
        });

        exerciseSubmitBtn.addEventListener("click", async () => {
            const code = exerciseCodeBox.innerText;
            if (!code.trim() || !currentLesson.exercise) return;
            exerciseSubmitBtn.disabled = true; exerciseSubmitBtn.textContent = "Running tests...";

            const actualOutputs = [];
            for (const tc of currentLesson.exercise.test_cases) {
                const output = await runForGrading(code, tc.test_input);
                actualOutputs.push({ test_case_id: tc.test_case_id, actual_output: (output || "").trim() });
            }

            try {
                const resp = await fetch("/admin/publishing/preview/exercise/grade", {
                    method: "POST", credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ exercise_id: currentLesson.exercise.exercise_id, actual_outputs: actualOutputs }),
                });
                const result = await resp.json();
                exerciseResultBox.style.display = "block";
                if (result.success) {
                    const passed = result.status === "correct";
                    exerciseResultBox.className = "exercise-result " + (passed ? "pass" : "fail");
                    exerciseResultBox.innerHTML = `<i class="fa-solid fa-${passed ? "circle-check" : "circle-xmark"}"></i> ${escapeHtml(result.feedback)} (${result.passed}/${result.total} test cases passed)`;
                    sessionTally.exercise = { passed: result.passed, total: result.total };
                    exerciseCompleteRow.style.display = "flex";
                } else {
                    exerciseResultBox.className = "exercise-result fail";
                    exerciseResultBox.textContent = result.message || "Could not grade this submission.";
                }
            } catch (e) {
                exerciseResultBox.style.display = "block";
                exerciseResultBox.className = "exercise-result fail";
                exerciseResultBox.textContent = "Could not reach the server.";
            }

            exerciseSubmitBtn.disabled = false; exerciseSubmitBtn.textContent = "Submit";
        });

        exerciseContinueBtn.addEventListener("click", () => showStep("summary"));

        // ------------------------------------------------------------
        // Summary - built entirely from THIS session's in-memory state
        // (sessionTally), since Preview never persists anything to
        // compute a real performance history from.
        // ------------------------------------------------------------
        async function loadSummary() {
            const rows = [];
            if (stepOrder.some((s) => s.key === "video")) {
                rows.push(`<div class="summary-row"><span>Video Tutorial</span><span class="${sessionTally.video_seen ? "ok" : "pending"}">${sessionTally.video_seen ? "Viewed" : "Not viewed"}</span></div>`);
            }
            rows.push(`<div class="summary-row"><span>Lesson Content</span><span class="${sessionTally.content_seen ? "ok" : "pending"}">${sessionTally.content_seen ? "Viewed" : "Not viewed"}</span></div>`);
            sessionTally.activities.forEach((a) => {
                const label = a.score !== null ? `${a.score}/${a.total} points` : "Reviewed";
                rows.push(`<div class="summary-row"><span>${escapeHtml(a.title)}</span><span class="ok">${label}</span></div>`);
            });
            if (sessionTally.exercise) {
                rows.push(`<div class="summary-row"><span>Coding Exercise</span><span class="${sessionTally.exercise.passed === sessionTally.exercise.total ? "ok" : "pending"}">${sessionTally.exercise.passed}/${sessionTally.exercise.total} test cases</span></div>`);
            }
            summaryListEl.innerHTML = rows.join("") || `<p class="lessons-loading">Nothing to summarize yet.</p>`;

            summaryContinueBtn.textContent = "Loading...";
            summaryContinueBtn.disabled = true;
            try {
                const resp = await fetch(`/admin/publishing/preview/next-lesson?resource_id=${currentLesson.resource_id}`, { credentials: "include" });
                const result = await resp.json();
                const next = result.next;
                summaryContinueBtn.disabled = false;
                if (!next || next.type === "end") {
                    summaryContinueBtn.textContent = "Back to Chapters";
                    summaryContinueBtn.onclick = () => loadMap(false);
                } else {
                    summaryContinueBtn.textContent = `Continue to ${next.resource_title}`;
                    summaryContinueBtn.onclick = () => loadLessonContent(next.resource_id, true);
                }
            } catch (e) {
                summaryContinueBtn.textContent = "Back to Chapters";
                summaryContinueBtn.disabled = false;
                summaryContinueBtn.onclick = () => loadMap(false);
            }
        }

        // ------------------------------------------------------------
        // Modal open/close/back
        // ------------------------------------------------------------
        function openModal() {
            navStack = [];
            statusFilter = "all";
            if (statusFilterEl) {
                statusFilterEl.querySelectorAll(".preview-filter-btn").forEach((b) => b.classList.remove("active"));
                statusFilterEl.querySelector('[data-filter="all"]').classList.add("active");
            }
            modal.classList.remove("preview-hidden");
            loadMap(false);
        }
        function closeModal() {
            modal.classList.add("preview-hidden");
            navStack = [];
        }

        closeBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
        backBtn.addEventListener("click", () => {
            navStack.pop();
            const previous = navStack.pop();
            previous ? previous() : loadMap(false);
        });

        window.CobraBytePublishingPreview = { open: openModal, close: closeModal };
    });
})();