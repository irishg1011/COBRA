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
 * Nothing in this file ever calls a route that records progress. The
 * Activities + Exercise steps run the REAL learner games and exercise
 * screen through /admin/preview-play (scope=walkthrough) in a frame -
 * no locks, unlimited lives, nothing saved.
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
            stopPlayFrame();
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
            // Admin redesign: the static position/size rules live in
            // publishing-preview.css (.map-connector-svg); only the
            // height is set here, since it depends on the rendered map.
            svg.style.height = `${mapChain.scrollHeight}px`;

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
                                <div class="lesson-card unlocked" data-resource-id="${l.resource_id}">
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
            [videoStep, contentStep, activitiesStep, summaryStep].forEach((s) => s.style.display = "none");
            // The Exercise runs inside the activities frame (real exercise screen).
            const map = { video: videoStep, content: contentStep, activities: activitiesStep, exercise: activitiesStep, summary: summaryStep };
            map[key].style.display = "block";
            if (key !== "activities" && key !== "exercise") stopPlayFrame();
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
        // Activities + Exercise - feat/admin-real-game-preview: the REAL
        // learner games and exercise screen, run by /admin/preview-play
        // (scope=walkthrough: Ready to Publish + Published only) inside a
        // frame. It tells this page which step it's on and when it's
        // done; the scores for the Summary come from the preview's own
        // session state (/admin/preview-play/api/tally). Nothing is saved.
        // ------------------------------------------------------------
        let playFrame = null;

        function walkthroughQuery() {
            return `resource_id=${encodeURIComponent(currentLesson.resource_id)}&scope=walkthrough`;
        }

        function stopPlayFrame() {
            // Removing the frame stops its game loop and any sound.
            if (playFrame) { playFrame.remove(); playFrame = null; }
        }

        async function startActivitiesStep() {
            stopPlayFrame();
            showStep("activities");
            activitiesContinueBtn.style.display = "none";

            let activities = [];
            try {
                const resp = await fetch(`/admin/publishing/preview/activities?resource_id=${currentLesson.resource_id}`, { credentials: "include" });
                const result = await resp.json();
                activities = result.activities || [];
            } catch (e) { /* leave empty */ }

            if (activities.length === 0 && !currentLesson.exercise) {
                activitiesContainer.style.display = "none";
                afterActivities();
                return;
            }

            activitiesContainer.style.display = "block";
            activitiesContainer.innerHTML = "";
            playFrame = document.createElement("iframe");
            playFrame.className = "preview-play-frame";
            playFrame.title = "Activities and exercise preview";
            playFrame.src = `/admin/preview-play?${walkthroughQuery()}`;
            activitiesContainer.appendChild(playFrame);
        }

        async function onPlayFinished() {
            try {
                const resp = await fetch(`/admin/preview-play/api/tally?${walkthroughQuery()}`, { credentials: "include" });
                const result = await resp.json();
                if (result.success) {
                    sessionTally.activities = result.activities || [];
                    sessionTally.exercise = result.exercise || null;
                }
            } catch (e) { /* summary shows what it has */ }
            afterActivities();
        }

        window.addEventListener("message", (e) => {
            if (!playFrame || e.source !== playFrame.contentWindow || e.origin !== window.location.origin) return;
            const msg = e.data || {};
            if (msg.source !== "cobra-preview-play") return;
            if (msg.type === "step" && stepOrder.some((s) => s.key === msg.key)) renderStepper(msg.key);
            if (msg.type === "finished") onPlayFinished();
        });

        function afterActivities() {
            activitiesContinueBtn.style.display = "inline-flex";
            activitiesContinueBtn.textContent = "View Summary";
            activitiesContinueBtn.onclick = () => showStep("summary");
        }


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
            stopPlayFrame();
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