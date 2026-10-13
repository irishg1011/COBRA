document.addEventListener('DOMContentLoaded', () => {

    // feat/admin-real-game-preview: set ONLY by admin-preview-play.js on /admin/preview-play.
    // Undefined on learner pages, so everything below runs exactly as before.
    const PREVIEW = window.COBRA_PREVIEW_MODE || null;
    const API_BASE_URL = PREVIEW ? PREVIEW.apiBase : ""; // feat/admin-login-page: same-origin, works on 127.0.0.1 and localhost
    const VIDEO_WATCH_THRESHOLD = 0.9; // 90% watched unlocks Continue
    const CONTENT_SCROLL_THRESHOLD = 0.95; // 95% scrolled unlocks Continue

    const urlParams = new URLSearchParams(window.location.search);
    const resourceId = urlParams.get('resource_id');

    const lessonStepper = document.getElementById('lessonStepper');
    const lessonLoading = document.getElementById('lessonLoading');
    const lessonError = document.getElementById('lessonError');
    const lessonResourceTitle = document.getElementById('lessonResourceTitle');
    const lessonContentBody = document.getElementById('lessonContentBody');
    const lessonCompleteRow = document.getElementById('lessonCompleteRow');
    const lessonCompleteStatus = document.getElementById('lessonCompleteStatus');
    const lessonInProgressStatus = document.getElementById('lessonInProgressStatus');
    const activitiesContainer = document.getElementById('activitiesContainer');
    const backToLessonsLink = document.getElementById('backToLessonsLink');

    const viewSummaryFromActivitiesBtn = document.getElementById('viewSummaryFromActivitiesBtn');
    const backToActivitiesBtn = document.getElementById('backToActivitiesBtn');
    const IN_PROGRESS_TEXT = 'Finish the activities above to complete this lesson.';
    const viewSummaryFromExerciseBtn = document.getElementById('viewSummaryFromExerciseBtn');

    const summaryStep = document.getElementById('summaryStep');
    const perfBanner = document.getElementById('perfBanner');
    const perfRing = document.getElementById('perfRing');
    const perfRingLabel = document.getElementById('perfRingLabel');
    const summaryList = document.getElementById('summaryList');
    const summaryContinueBtn = document.getElementById('summaryContinueBtn');
    const summaryGateNote = document.getElementById('summaryGateNote');
    const summaryReview = document.getElementById('summaryReview');
    const summaryReviewNote = document.getElementById('summaryReviewNote');
    const reviewLessonBtn = document.getElementById('reviewLessonBtn');
    const openModuleReviewBtn = document.getElementById('openModuleReviewBtn');
    const lessonResumeNote = document.getElementById('lessonResumeNote');
    const lessonResumeText = document.getElementById('lessonResumeText');

    const exerciseStep = document.getElementById('exerciseStep');
    const exerciseTitle = document.getElementById('exerciseTitle');
    const exerciseSituation = document.getElementById('exerciseSituation');
    const exerciseProblem = document.getElementById('exerciseProblem');
    const exerciseClue = document.getElementById('exerciseClue');
    const exerciseCodeBox = document.getElementById('exerciseCodeBox');
    const exerciseOutputBox = document.getElementById('exerciseOutputBox');
    const exerciseRunBtn = document.getElementById('exerciseRunBtn');
    const exerciseSubmitBtn = document.getElementById('exerciseSubmitBtn');
    const exerciseResultBox = document.getElementById('exerciseResultBox');
    const exerciseCompleteRow = document.getElementById('exerciseCompleteRow');
    const exerciseCompleteStatus = document.getElementById('exerciseCompleteStatus');
    const exerciseClueRow = document.getElementById('exerciseClueRow');
    const exerciseHintBtn = document.getElementById('exerciseHintBtn');
    const exerciseRequiredRow = document.getElementById('exerciseRequiredRow');
    const exerciseRequiredChips = document.getElementById('exerciseRequiredChips');
    const exerciseExpectedBox = document.getElementById('exerciseExpectedBox');
    const exerciseSkippedNote = document.getElementById('exerciseSkippedNote');
    const exerciseSubmitNote = document.getElementById('exerciseSubmitNote');
    const exerciseSkipBtn = document.getElementById('exerciseSkipBtn');
    const exerciseHintWrap = document.getElementById('exerciseHintWrap');
    const exerciseHintNote = document.getElementById('exerciseHintNote');
    const exerciseSkipWrap = document.getElementById('exerciseSkipWrap');
    const exerciseSkipNote = document.getElementById('exerciseSkipNote');
    const exerciseBackToActivitiesBtn = document.getElementById('exerciseBackToActivitiesBtn');
    const exerciseRetrySaveBtn = document.getElementById('exerciseRetrySaveBtn');

    const videoStep = document.getElementById('videoStep');
    const lessonVideoFrame = document.getElementById('lessonVideoFrame');
    const lessonVideoTitle = document.getElementById('lessonVideoTitle');
    const lessonVideoDescription = document.getElementById('lessonVideoDescription');
    const videoContinueBtn = document.getElementById('videoContinueBtn');
    const videoLockedNote = document.getElementById('videoLockedNote');

    const contentStep = document.getElementById('contentStep');
    const lessonContentScroll = document.getElementById('lessonContentScroll');
    const contentContinueBtn = document.getElementById('contentContinueBtn');
    const contentLockedNote = document.getElementById('contentLockedNote');

    const activitiesStep = document.getElementById('activitiesStep');

    let activeOutputBox = null;
    let lessonData = null;
    // True only when THIS visit completed the lesson for the first time -
    // then the Summary's Continue button asks "Proceed?" (proceed-modal.js)
    // instead of leaving straight away.
    let justCompleted = false;
    let stepOrder = []; // built dynamically depending on whether this lesson has a video
    let ytPlayer = null;
    let ytPollTimer = null;

    // ---------------- Stepper indicator ----------------
        function renderStepper(currentKey) {
        if (!lessonStepper || stepOrder.length === 0) return;
        const currentIndex = stepOrder.findIndex(s => s.key === currentKey);
        lessonStepper.innerHTML = "";
        stepOrder.forEach((s, i) => {
            const isDone = i < currentIndex;
            const isCurrent = i === currentIndex;
            const node = document.createElement('div');
            node.className = "lesson-step-node" + (isDone ? " done" : isCurrent ? " current" : "");
            node.innerHTML = `<div class="lesson-step-circle">${isDone ? '<i class="fa-solid fa-check"></i>' : i + 1}</div><div class="lesson-step-label">${s.label}</div>`;
            if (isDone) {
                node.style.cursor = "pointer";
                node.title = `Review ${s.label}`;
                node.addEventListener('click', () => {
                    // A game question's timer is running: looking at the lesson
                    // now would be answering with the book open - finish first.
                    const risk = window.CobraGameKit && window.CobraGameKit.leaveRisk();
                    if (risk && risk.kind === "game") {
                        window.CobraGameKit.notice("Finish this question first",
                            "Its timer is running. Answer or skip it - then you can review the lesson.");
                        return;
                    }
                    goToStep(s.key);
                });
            }
            lessonStepper.appendChild(node);
            if (i < stepOrder.length - 1) {
                const line = document.createElement('div');
                line.className = "lesson-step-line" + (isDone ? " done" : "");
                lessonStepper.appendChild(line);
            }
        });
    }

    let resumeNoteStep = null;   // the note only belongs to the step it was shown on

    function showStep(key) {
        if (lessonResumeNote && resumeNoteStep && key !== resumeNoteStep) {
            lessonResumeNote.hidden = true;
            resumeNoteStep = null;
        }
        // Leaving the video step (Continue button or the stepper): pause the
        // YouTube player - hiding the iframe alone doesn't stop playback.
        // Paused (not stopped) so it resumes where the learner left off.
        if (key !== "video" && ytPlayer && typeof ytPlayer.pauseVideo === "function") {
            ytPlayer.pauseVideo();
        }
        videoStep.style.display = key === "video" ? "block" : "none";
        contentStep.style.display = key === "content" ? "block" : "none";
        activitiesStep.style.display = key === "activities" ? "block" : "none";
        exerciseStep.style.display = key === "exercise" ? "block" : "none";
        summaryStep.style.display = key === "summary" ? "block" : "none";
        renderStepper(key);
        if (PREVIEW) PREVIEW.onStep(key);
        if (key === "summary") loadSummary();
    }

    // ---------------- Video step (YouTube IFrame API) ----------------
    let youtubeApiLoadPromise = null;
    function loadYouTubeApi() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        if (youtubeApiLoadPromise) return youtubeApiLoadPromise;
        youtubeApiLoadPromise = new Promise((resolve) => {
            window.onYouTubeIframeAPIReady = resolve;
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(tag);
        });
        return youtubeApiLoadPromise;
    }

    async function setupVideoStep(video) {
        lessonVideoTitle.textContent = video.title || "";
        // The description the mentor wrote for this video (formatted text
        // from the New Video Tutorial editor). Hidden when there is none.
        if (lessonVideoDescription) {
            lessonVideoDescription.innerHTML = video.description || "";
            lessonVideoDescription.hidden = !(video.description || "").trim();
        }
        const playerDiv = document.createElement('div');
        playerDiv.id = "ytPlayerTarget";
        lessonVideoFrame.innerHTML = "";
        lessonVideoFrame.appendChild(playerDiv);

        await loadYouTubeApi();

        // Watching a lesson video counts as activity (idle-logout.js) -
        // the YouTube frame swallows the page's mouse and key events.
        setInterval(() => {
            if (window.cobraIdle && ytPlayer && typeof ytPlayer.getPlayerState === "function"
                && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                window.cobraIdle.markActive();
            }
        }, 30 * 1000);
        ytPlayer = new YT.Player('ytPlayerTarget', {
            videoId: video.video_id,
            playerVars: { rel: 0 },
            events: {
                onStateChange: onYtStateChange
            }
        });
    }

    function onYtStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            if (ytPollTimer) clearInterval(ytPollTimer);
            ytPollTimer = setInterval(checkVideoWatchProgress, 1000);
        } else if (event.data === YT.PlayerState.ENDED) {
            unlockVideoContinue();
        }
    }

    function checkVideoWatchProgress() {
        if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
        const duration = ytPlayer.getDuration();
        const current = ytPlayer.getCurrentTime();
        if (duration > 0 && current / duration >= VIDEO_WATCH_THRESHOLD) {
            unlockVideoContinue();
        }
    }

    let videoUnlocked = false;
    async function unlockVideoContinue() {
        if (videoUnlocked) return;
        videoUnlocked = true;
        if (ytPollTimer) clearInterval(ytPollTimer);
        videoContinueBtn.disabled = false;
        videoLockedNote.style.display = "none";
        if (PREVIEW) return;   // admin preview: nothing saved
        try {
            await fetch(`${API_BASE_URL}/api/lesson-content/mark-video-watched`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ resource_id: resourceId })
            });
        } catch (err) {
            console.error('Could not record video progress:', err);
        }
    }

    videoContinueBtn.addEventListener('click', () => {
        if (videoContinueBtn.disabled) return;
        goToStep(stepAfter("video") || "content");
    });

    // ---------------- Content step (real scroll tracking) ----------------
    let contentUnlocked = false;
    async function unlockContentContinue() {
        if (contentUnlocked) return;
        contentUnlocked = true;
        contentContinueBtn.disabled = false;
        contentLockedNote.style.display = "none";
        if (PREVIEW) return;   // admin preview: nothing saved
        try {
            await fetch(`${API_BASE_URL}/api/lesson-content/mark-content-read`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ resource_id: resourceId })
            });
        } catch (err) {
            console.error('Could not record content progress:', err);
        }
    }

    lessonContentScroll.addEventListener('scroll', () => {
        const el = lessonContentScroll;
        const scrollable = el.scrollHeight - el.clientHeight;
        const pct = scrollable > 0 ? el.scrollTop / scrollable : 1;
        if (pct >= CONTENT_SCROLL_THRESHOLD) {
            unlockContentContinue();
        }
    });

    // Short content that fits without scrolling has no "bottom" to
    // reach, so it unlocks as soon as it's visible. A hidden panel
    // measures 0x0, so only check while the content box is on screen.
    function checkContentFits() {
        if (contentUnlocked) return;
        const el = lessonContentScroll;
        if (!el || el.offsetParent === null || el.clientHeight === 0) return;
        const scrollable = el.scrollHeight - el.clientHeight;
        if (scrollable <= 4) {
            unlockContentContinue();
        }
    }

    window.addEventListener('resize', checkContentFits);

    // The step after `key` in this lesson's own step list (only the steps
    // the mentor uploaded - see the step order built in loadLesson()).
    function stepAfter(key) {
        const i = stepOrder.findIndex((s) => s.key === key);
        return i >= 0 && i + 1 < stepOrder.length ? stepOrder[i + 1].key : null;
    }

    const CONTINUE_LABELS = {
        content: "Continue to Lesson Content",
        activities: "Continue to Activities",
        exercise: "Continue to Exercise",
    };

    // Content is the last step before the Summary when the lesson has no
    // activities and no exercise - its button then finishes the lesson.
    function updateContinueLabels() {
        const afterContent = stepAfter("content");
        contentContinueBtn.textContent = afterContent === "summary"
            ? (lessonData && lessonData.is_completed ? "View Summary" : "Finish Lesson")
            : (CONTINUE_LABELS[afterContent] || "Continue");
        videoContinueBtn.textContent = CONTINUE_LABELS[stepAfter("video")] || "Continue";
    }

    contentContinueBtn.addEventListener('click', async () => {
        if (contentContinueBtn.disabled) return;
        const next = stepAfter("content");
        if (next !== "summary") {
            goToStep(next);
            return;
        }
        if (lessonData.is_completed) {
            goToStep("summary");
            return;
        }
        contentContinueBtn.disabled = true;
        await attemptCompleteLesson();
        contentContinueBtn.disabled = false;
    });

    // ---------------- Step navigation ----------------
    function goToStep(key) {
        showStep(key);
        if (key === "activities") {
            startActivitiesStep();
        }
        if (key === "content") {
            // Wait one frame so the step is laid out before measuring.
            requestAnimationFrame(checkContentFits);
        }
    }

    // Quiz: "Review lesson" on the lives cooldown sends the learner back
    // to the lesson content. Their quiz spot, lives and timer are saved
    // server-side, so "Continue to Activities" resumes right where they were.
    document.addEventListener("cobrabyte:review-lesson", () => {
        const target = stepOrder.some((s) => s.key === "content") ? "content"
            : (stepOrder[0] ? stepOrder[0].key : null);
        if (target) {
            goToStep(target);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });

    // ---------------- Python (feat/python-runner-no-freeze) ----------------
    // Python runs in a background worker (static/py-runner.js -> CobraPy), so
    // this page never freezes. The programs it runs are the same as before.
    const CobraPy = window.CobraPy;
    const LOAD_FAILED = CobraPy.messages.LOAD_FAILED_MESSAGE;

    // input() for the exercise's free Run: the inline field in its output box.
    function showTerminalInputPrompt(promptText) {
        return new Promise((resolve) => {
            const outputBox = activeOutputBox;
            if (!outputBox) { resolve(""); return; }

            const promptSpan = document.createElement("span");
            promptSpan.className = "editor-terminal-prompt-text";
            promptSpan.textContent = promptText || "";

            const input = document.createElement("input");
            input.type = "text";
            input.className = "editor-terminal-inline-input";
            input.autocomplete = "off";
            input.spellcheck = false;

            outputBox.appendChild(promptSpan);
            outputBox.appendChild(input);
            outputBox.scrollTop = outputBox.scrollHeight;
            input.focus();

            input.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    input.disabled = true;
                    resolve(input.value);
                }
            });
        });
    }

    // `skipWrapper` (the clicked block) is left out when given.
    function getAllCodeBlockFiles(skipWrapper) {
        const files = [];
        document.querySelectorAll(".editor-code-container").forEach((wrapper) => {
            if (wrapper === skipWrapper) return;
            const filenameInput = wrapper.querySelector(".editor-code-filename");
            const consoleBox = wrapper.querySelector(".editor-console-box");
            files.push({
                filename: filenameInput ? filenameInput.value.trim() : "",
                code: consoleBox ? consoleBox.innerText : ""
            });
        });
        return files;
    }

    // Used by the exercise step's free "Run" button (output collected and
    // returned). Lesson code blocks use runCodeBlock() below instead.
    // `opts.onStop` puts a Stop button next to the Run button.
    async function runPythonCode(code, files = [], _unused, opts = {}) {
        const outcome = await CobraPy.run({
            mode: "exrun", code, files, maxSeconds: 5,
            onInput: showTerminalInputPrompt,
            onStarted: opts.onStarted,
        });
        if (outcome.ok) return outcome.result;
        if (outcome.loadFailed) return LOAD_FAILED;
        if (outcome.stopped || outcome.killed) return outcome;
        return "Error running code: " + outcome.message;
    }

    // Code block run popup - built once on first use, like learner.js's
    // logout modal. Resolves true (confirm button) / false (cancel).
    // `withCancel` false = a plain notice with just the confirm button.
    let runModal = null;
    function showRunModal(title, message, confirmLabel, withCancel) {
        if (!runModal) {
            runModal = document.createElement("div");
            runModal.className = "code-run-modal-overlay";
            runModal.hidden = true;
            runModal.innerHTML = `
                <div class="code-run-modal-card" role="dialog" aria-modal="true" aria-labelledby="codeRunModalTitle">
                    <div class="code-run-modal-icon" aria-hidden="true"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <h3 id="codeRunModalTitle"></h3>
                    <p class="code-run-modal-text"></p>
                    <div class="code-run-modal-actions">
                        <button type="button" class="code-run-modal-cancel">Cancel</button>
                        <button type="button" class="code-run-modal-confirm"></button>
                    </div>
                </div>`;
            document.body.appendChild(runModal);
        }
        const cancelBtn = runModal.querySelector(".code-run-modal-cancel");
        const confirmBtn = runModal.querySelector(".code-run-modal-confirm");
        runModal.querySelector("#codeRunModalTitle").textContent = title;
        runModal.querySelector(".code-run-modal-text").textContent = message;
        confirmBtn.textContent = confirmLabel;
        cancelBtn.hidden = !withCancel;
        runModal.hidden = false;
        (withCancel ? cancelBtn : confirmBtn).focus();

        return new Promise((resolve) => {
            function finish(result) {
                runModal.hidden = true;
                confirmBtn.removeEventListener("click", onOk);
                cancelBtn.removeEventListener("click", onCancel);
                runModal.removeEventListener("click", onOverlay);
                document.removeEventListener("keydown", onKey);
                resolve(result);
            }
            function onOk() { finish(true); }
            function onCancel() { finish(false); }
            function onOverlay(e) { if (e.target === runModal) finish(false); }
            function onKey(e) { if (e.key === "Escape") finish(false); }
            confirmBtn.addEventListener("click", onOk);
            cancelBtn.addEventListener("click", onCancel);
            runModal.addEventListener("click", onOverlay);
            document.addEventListener("keydown", onKey);
        });
    }

    // ------------------------------------------------------------
    // Code block runner - ONE run at a time on this page. `currentRun`
    // is the clicked block's Run button + Output box, any input() still
    // waiting for an answer, and whether Stop was clicked.
    // ------------------------------------------------------------
    let currentRun = null;


    // The clicked block's code only runs other lesson blocks it actually
    // imports (by filename, transitively, each at most once) - never the
    // whole lesson. Output is streamed live. (The program is "block" mode in
    // static/py-worker.js, with its 1,000-line / 5-second safety guard.)

    // Writes text straight into the run's Output box, as it happens.
    function appendRunOutput(run, text) {
        if (!text || run.stopped) return;
        const box = run.outputBox;
        const last = box.lastChild;
        if (last && last.nodeType === Node.TEXT_NODE) {
            last.appendData(text);
        } else {
            box.appendChild(document.createTextNode(text));
        }
        box.scrollTop = box.scrollHeight;
    }

    // input(): the prompt + inline field go into the run's own Output box.
    // Resolves with the typed text, or null when Stop is clicked.
    function readRunInput(run, promptText) {
        return new Promise((resolve) => {
            if (run.stopped) { resolve(null); return; }
            const box = run.outputBox;

            const promptSpan = document.createElement("span");
            promptSpan.className = "editor-terminal-prompt-text";
            promptSpan.textContent = promptText || "";

            const input = document.createElement("input");
            input.type = "text";
            input.className = "editor-terminal-inline-input";
            input.autocomplete = "off";
            input.spellcheck = false;

            box.appendChild(promptSpan);
            box.appendChild(input);
            box.scrollTop = box.scrollHeight;
            input.focus();

            run.inputResolve = function (value) {
                run.inputResolve = null;
                // The answered line stays behind as plain text, like a terminal.
                const answered = (promptText || "") + (value === null ? "" : value + "\n");
                if (answered) box.insertBefore(document.createTextNode(answered), promptSpan);
                promptSpan.remove();
                input.remove();
                resolve(value);
            };

            input.addEventListener("keydown", function (e) {
                if (e.key === "Enter" && run.inputResolve) {
                    e.preventDefault();
                    run.inputResolve(input.value);
                }
            });
        });
    }

    // Stop: the background Python is ended (and a fresh one starts), so even
    // `while True: pass` stops at once - the page never froze meanwhile.
    function stopCurrentRun() {
        const run = currentRun;
        if (!run || run.stopped) return;
        run.stopped = true;
        if (run.inputResolve) run.inputResolve(null);
        CobraPy.stop();
        const box = run.outputBox;
        const text = box.textContent;
        box.appendChild(document.createTextNode((text && !text.endsWith("\n") ? "\n" : "") + "Program stopped."));
        box.scrollTop = box.scrollHeight;
    }

    // Appends a message on its own line (load failure, backup time limit).
    function appendRunNote(run, message) {
        const box = run.outputBox;
        const text = box.textContent;
        box.appendChild(document.createTextNode((text && !text.endsWith("\n") ? "\n" : "") + message));
        box.scrollTop = box.scrollHeight;
    }

    // An always-true loop (`while True:` / `while 1:`) whose body has no
    // break, return, input(), exit() or sys.exit() can never end.
    function hasEndlessLoop(code) {
        const lines = code.replace(/ /g, " ").split(/\r?\n/);
        const indentOf = (line) => line.match(/^\s*/)[0].replace(/\t/g, "    ").length;
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/^\s*while\s*\(?\s*(?:True|1)\s*\)?\s*:(.*)$/);
            if (!match) continue;
            const loopIndent = indentOf(lines[i]);
            const body = [match[1]];
            for (let j = i + 1; j < lines.length; j++) {
                const line = lines[j];
                if (!line.trim() || /^\s*#/.test(line)) continue;
                if (indentOf(line) <= loopIndent) break;
                body.push(line);
            }
            if (!/\b(?:break|return)\b|\b(?:input|exit)\s*\(/.test(body.join("\n"))) return true;
        }
        return false;
    }

    function confirmEndlessLoopRun() {
        return showRunModal(
            "This loop might never stop",
            "This loop has no way to end. If it runs too long or prints too much, it will be stopped automatically. Run anyway?",
            "Run anyway",
            true
        );
    }

    // Runs one block. Never throws - the finally always puts every Run
    // button back, whether the code finished, failed or was stopped.
    // While it runs: "Running... 3s" + Stop; the page stays usable.
    async function runCodeBlock(opts) {
        const run = {
            runBtn: opts.runBtn,
            outputBox: opts.outputBox,
            inputResolve: null,
            stopped: false,
        };

        const runBtn = run.runBtn;
        const otherBtns = Array.from(opts.scopeEl.querySelectorAll(".run-btn"))
            .filter((btn) => btn !== runBtn && !btn.disabled);
        currentRun = run;
        let done = () => {};

        try {
            otherBtns.forEach((btn) => { btn.disabled = true; });
            done = CobraPy.runningButton(runBtn, { onStop: stopCurrentRun });
            run.outputBox.textContent = "";
            if (!CobraPy.isReady()) appendRunOutput(run, CobraPy.messages.STARTING_MESSAGE);

            const outcome = await CobraPy.run({
                mode: "block",
                code: opts.code || "",
                files: opts.allFiles,
                moduleFiles: opts.moduleFiles,
                maxSeconds: 5,
                onStarted: () => { if (!run.stopped) run.outputBox.textContent = ""; },
                onOutput: (text) => appendRunOutput(run, text),
                onInput: (promptText) => readRunInput(run, promptText),
            });
            if (run.stopped || outcome.stopped) return;
            if (outcome.loadFailed) { run.outputBox.textContent = ""; appendRunNote(run, LOAD_FAILED); }
            else if (outcome.killed) appendRunNote(run, outcome.message);
            else if (!outcome.ok) appendRunOutput(run, "Error running code: " + outcome.message);
        } finally {
            done();
            otherBtns.forEach((btn) => { btn.disabled = false; });
            runBtn.disabled = false;
            if (currentRun === run) currentRun = null;
        }
    }

    function wireRunButton(wrapper) {
        const runBtn = wrapper.querySelector(".run-btn");
        const consoleBox = wrapper.querySelector(".editor-console-box");
        const outputBox = wrapper.querySelector(".editor-output-box");
        if (!runBtn || !consoleBox || !outputBox) return;
        // feat/python-runner-no-freeze: this page has code - get Python ready
        // in the background now, with a small status chip by the Run button.
        CobraPy.preload();
        CobraPy.chip(runBtn);

        runBtn.addEventListener("click", async function () {
            // While a run is going, this block's button is Stop and the
            // others are disabled. A run whose block left the page is stopped.
            if (currentRun) {
                if (currentRun.runBtn === runBtn || !currentRun.runBtn.isConnected) stopCurrentRun();
                return;
            }

            const code = consoleBox.innerText.trim();
            if (!code) {
                showRunModal("Notice", "There's no example code in this Console block.", "OK", false);
                return;
            }

            if (hasEndlessLoop(code)) {
                const runAnyway = await confirmEndlessLoopRun();
                if (!runAnyway || currentRun || !runBtn.isConnected) return;
            }

            await runCodeBlock({
                runBtn,
                outputBox,
                code,
                scopeEl: document,
                allFiles: getAllCodeBlockFiles(),
                moduleFiles: getAllCodeBlockFiles(wrapper),
            });
        });
    }

    // `root` defaults to the lesson content; the weak-spots panel reuses it
    // for the lesson parts it shows (read-only boxes, working Run buttons).
    function preparePageForLearner(root) {
        root = root || lessonContentBody;
        root.querySelectorAll(".editor-code-filename").forEach((input) => {
            input.setAttribute("disabled", "true");
        });

        root.querySelectorAll(".editor-console-box").forEach((box) => {
            box.setAttribute("contenteditable", "false");
        });

        root.querySelectorAll(".editor-code-container").forEach((wrapper) => {
            wrapper.querySelectorAll(".editor-output-mode-select").forEach((el) => el.remove());

            const modeSelect = wrapper.querySelector(".editor-code-mode-select");
            const isSnippetOnly = modeSelect && modeSelect.value === "snippet";
            const outputPane = wrapper.querySelector(".output-card-pane");
            const consolePane = wrapper.querySelector(".console-card-pane");
            if (isSnippetOnly && outputPane) {
                outputPane.style.display = "none";
                if (consolePane) consolePane.style.gridColumn = "1 / -1";
            }

            const outputBox = wrapper.querySelector(".editor-output-box");
            if (outputBox) {
                outputBox.textContent = "";
                outputBox.setAttribute("placeholder", "Run the program first to see the output.");
            }

            wireRunButton(wrapper);
        });

        root.querySelectorAll(".editor-terminal-box").forEach((box) => {
            box.setAttribute("contenteditable", "false");
        });
    }

    // ---------------- Exercise step ----------------
    // Deterministic run used for grading (feat/output-based-exercises):
    // input() answers come from the exercise's Given input (one value per
    // line, in order) instead of prompting - no UI, no waiting. Returns
    // {output, error}: everything printed, and the traceback of the Python
    // error the code stopped with ("" when it ran fine). null when the
    // Python runtime could not load.
    function givenInputLines() {
        const text = String((lessonData.exercise && lessonData.exercise.given_input) || '')
            .replace(/\r\n?/g, '\n').replace(/\n$/, '');
        return text ? text.split('\n') : [];
    }

    // Grading run in the background worker ("grade" mode, same program as
    // before). Now with the safety guard: a program that hits a limit gets
    // its output so far + the "Program stopped: ..." message as its error, so
    // it is graded wrong with a clear reason instead of freezing the page.
    // {killed} / {stopped} come back when the backup limit or Stop ended it.
    async function runExerciseForGrading(code) {
        const outcome = await CobraPy.run({
            mode: "grade", code: code || "", givenInputs: givenInputLines(), maxSeconds: 5,
        });
        if (outcome.loadFailed) return null;
        if (outcome.stopped) return { output: "", error: "Program stopped.", stopped: true };
        if (outcome.killed) return { output: "", error: outcome.message };
        if (!outcome.ok) return { output: "", error: "Error running code: " + outcome.message };
        const [output, error] = JSON.parse(outcome.result);
        return { output: output || "", error: error || "" };
    }

    const runText = (run) => [run.output.replace(/\s+$/, ""), run.error.trim()].filter(Boolean).join("\n");

    // Run: "Running... 3s" + Stop while it runs; the page stays usable.
    exerciseRunBtn.addEventListener('click', async () => {
        const code = exerciseCodeBox.innerText.trim();
        if (!code || CobraPy.isRunning()) return;
        exerciseOutputBox.textContent = CobraPy.isReady() ? "" : CobraPy.messages.STARTING_MESSAGE;
        let stopped = false;
        const done = CobraPy.runningButton(exerciseRunBtn, {
            stopClass: "console-action-btn",
            onStop: () => { stopped = true; CobraPy.stop(); },
        });
        try {
            if (givenInputLines().length) {
                // The exercise gives its own input - run with it, same as Submit.
                const run = await runExerciseForGrading(code);
                exerciseOutputBox.textContent = stopped ? "Program stopped."
                    : run ? runText(run) : LOAD_FAILED;
            } else {
                activeOutputBox = exerciseOutputBox;
                const output = await runPythonCode(code, [], "", {
                    onStarted: () => { exerciseOutputBox.textContent = ""; },
                });
                activeOutputBox = null;
                exerciseOutputBox.textContent = stopped ? "Program stopped."
                    : (output && typeof output === "object") ? output.message
                    : (output || "").trim();
            }
        } finally {
            done();
        }
    });

    // "You must use:" chips + the expected output (shown, never hidden).
    function renderExerciseRequirements(exercise) {
        const tags = exercise.required_tags || [];
        exerciseRequiredChips.innerHTML = '';
        tags.forEach((tag) => {
            const chip = document.createElement('span');
            chip.className = 'exercise-required-chip';
            chip.textContent = tag.label;
            exerciseRequiredChips.appendChild(chip);
        });
        exerciseRequiredRow.hidden = tags.length === 0;
        exerciseExpectedBox.textContent = exercise.expected_output || '';
    }

    // ---------------- Exercise: submit lock, hint, skip ----------------
    // exerciseState comes from the server (learner_exercise.get_exercise_state):
    // {passed, skipped, attempts, failed, best, total, hint_after, skip_after}.
    let exerciseState = null;
    let lastFailedCode = null;   // Submit stays greyed out until the code differs from this

    const codeKey = (code) => (code || '').replace(/\s+$/g, '').replace(/[ \t]+\n/g, '\n');

    function updateSubmitLock() {
        if (lessonData.exercise_completed || exerciseSubmitBtn.dataset.running === '1') return;
        const unchanged = lastFailedCode !== null && codeKey(exerciseCodeBox.innerText) === lastFailedCode;
        exerciseSubmitBtn.disabled = unchanged;
        exerciseSubmitNote.hidden = !unchanged;
    }
    exerciseCodeBox.addEventListener('input', updateSubmitLock);
    exerciseCodeBox.addEventListener('keyup', updateSubmitLock);

    // feat/exercise-flow-fixes: Hint and Skip show from the start. Until the
    // "try first" rule opens them they are grey, disabled and say how many
    // more wrong tries unlock them; unlocking them glows once.
    // [icon when unlocked, label] - a locked button shows a lock instead.
    const HINT_LOOK = ['<i class="fa-solid fa-lightbulb" aria-hidden="true"></i> ', 'Show hint'];
    const SKIP_LOOK = ['', 'Skip for now'];
    const LOCK_ICON = '<i class="fa-solid fa-lock" aria-hidden="true"></i> ';
    const lockedBefore = { hint: null, skip: null };

    function triesLeftText(left) {
        return `unlocks after ${left} more wrong ${left === 1 ? 'try' : 'tries'}`;
    }

    function setUnlockButton(key, btn, note, look, name, locked, left) {
        btn.disabled = locked;
        btn.classList.toggle('is-locked', locked);
        btn.innerHTML = (locked ? LOCK_ICON : look[0]) + look[1];
        note.textContent = locked ? triesLeftText(left) : '';
        if (locked) btn.setAttribute('aria-label', `${name} - ${triesLeftText(left)}`);
        else btn.removeAttribute('aria-label');
        if (lockedBefore[key] === true && !locked) {
            // Just unlocked by this Submit: a short glow (none with reduced motion - CSS).
            btn.classList.remove('exercise-unlock-glow');
            void btn.offsetWidth;
            btn.classList.add('exercise-unlock-glow');
        }
        lockedBefore[key] = locked;
    }

    function renderExerciseState() {
        const st = exerciseState;
        // Admin preview: the clue is always shown and there is nothing to skip.
        if (PREVIEW || !st) {
            exerciseClueRow.hidden = !lessonData.exercise.clue;
            exerciseHintWrap.hidden = true;
            exerciseSkipWrap.hidden = true;
            exerciseSkippedNote.hidden = true;
            return;
        }
        const failed = st.failed || 0;
        const hintOpen = !exerciseClueRow.hidden;
        // No clue = no Hint button at all. A passed exercise keeps it unlocked (as before).
        const hasClue = !!lessonData.exercise.clue;
        const hintLocked = !st.passed && failed < st.hint_after;
        exerciseHintWrap.hidden = !hasClue || hintOpen;
        if (hasClue && !hintOpen) {
            setUnlockButton('hint', exerciseHintBtn, exerciseHintNote, HINT_LOOK, 'Hint', hintLocked, st.hint_after - failed);
        }
        if (!hasClue || hintLocked) exerciseClueRow.hidden = true;
        // Skip: gone once passed or skipped.
        exerciseSkipWrap.hidden = st.passed || st.skipped;
        if (!exerciseSkipWrap.hidden) {
            setUnlockButton('skip', exerciseSkipBtn, exerciseSkipNote, SKIP_LOOK, 'Skip', failed < st.skip_after, st.skip_after - failed);
        }
        exerciseSkippedNote.hidden = !st.skipped || st.passed;
        if ((st.skipped || st.passed) && lessonData.is_completed) {
            // Lesson finished: the way on to the Summary stays here.
            showExerciseLessonComplete(false);
        }
    }

    exerciseHintBtn.addEventListener('click', () => {
        if (exerciseHintBtn.disabled) return;
        exerciseClueRow.hidden = false;
        exerciseHintWrap.hidden = true;
    });

    // Titles of the lesson's activities still to finish (from the exercise state).
    function unfinishedActivities() {
        return (exerciseState && Array.isArray(exerciseState.unfinished_activities)) ? exerciseState.unfinished_activities : [];
    }

    exerciseSkipBtn.addEventListener('click', () => {
        if (exerciseSkipBtn.disabled) return;
        const doSkip = () => skipExercise();
        if (!(window.CobraProceed && window.CobraProceed.open)) { doSkip(); return; }
        const left = unfinishedActivities();
        window.CobraProceed.open({
            icon: 'fa-forward',
            title: 'Skip this exercise for now?',
            text: `The exercise will count as not passed in your lesson score, and "Applying the lesson" will show as Needs work. `
                + (left.length
                    ? `Finish ${left.join(', ')} first, then you can finish this lesson. You can come back any time - passing the exercise later gives full credit.`
                    : `You can finish the lesson and come back any time - passing the exercise later gives full credit.`),
            yesLabel: 'Yes, skip for now',
            noLabel: 'Keep trying',
            onYes: doSkip
        });
    });

    // ---------------- feat/exercise-pool ----------------
    // Each learner gets one exercise of the lesson's pool. A retake (module
    // below the pass mark, exercise not passed) gives another unseen one;
    // leaving the page twice while working on it swaps it and clears the
    // editor (feat/leave-detection - same rule as the games).
    let exerciseLeaveGuard = null;
    function exerciseUrl() {
        return `/lesson-content?resource_id=${encodeURIComponent(resourceId)}&step=exercise`;
    }

    function setupExercisePool(data) {
        const retakeBtn = document.getElementById('exerciseRetakeBtn');
        if (retakeBtn) {
            retakeBtn.hidden = !data.exercise_retake_allowed;
            retakeBtn.onclick = () => {
                const run = async () => {
                    retakeBtn.disabled = true;
                    try {
                        const response = await fetch(`${API_BASE_URL}/api/lesson-exercise/retake`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ resource_id: resourceId })
                        });
                        const result = await response.json();
                        if (result.success) {
                            window.location.href = exerciseUrl();
                            return;
                        }
                        exerciseResultBox.style.display = 'block';
                        exerciseResultBox.className = 'exercise-result fail';
                        exerciseResultBox.textContent = result.message || 'Could not start the retake.';
                    } catch (err) {
                        console.error('Error starting the exercise retake:', err);
                    }
                    retakeBtn.disabled = false;
                };
                if (window.CobraProceed) {
                    window.CobraProceed.open({
                        icon: 'fa-rotate-right',
                        title: 'Retake with a new exercise?',
                        text: 'You will get another exercise from this lesson that you have not seen yet. Passing it raises your module score.',
                        yesLabel: 'Yes, give me a new one',
                        noLabel: 'Keep this one',
                        onYes: run
                    });
                } else {
                    run();
                }
            };
        }
        if (exerciseLeaveGuard || !window.CobraGameKit || data.exercise_completed) return;
        const step = document.getElementById('exerciseStep');
        // Clicking away from an exercise in progress asks first (game-kit.js).
        window.CobraGameKit.addLeaveRisk(() => {
            if (!(step && step.style.display !== 'none' && lessonData && lessonData.exercise
                && !(exerciseState && exerciseState.passed))) return null;
            const code = (exerciseCodeBox.textContent || '').trim();
            return { kind: 'exercise', code: !!code && code !== '# Write your code here' };
        });
        exerciseLeaveGuard = window.CobraGameKit.leaveGuard({
            url: `${API_BASE_URL}/api/lesson-exercise/leave`,
            body: () => ({ exercise_id: lessonData && lessonData.exercise ? lessonData.exercise.exercise_id : null }),
            isActive: () => !!(step && step.style.display !== 'none' && lessonData && lessonData.exercise
                && !(exerciseState && exerciseState.passed)),
            onResult: (result) => {
                const event = result && result.event;
                if (!event) return;
                if (event.type === 'leave_warning') {
                    window.CobraGameKit.notice('Please stay on this page', event.message);
                    return;
                }
                exerciseCodeBox.textContent = '# Write your code here\n';
                if (window.CobraProceed) {
                    window.CobraProceed.open({
                        icon: 'fa-shuffle', title: 'New exercise', text: event.message,
                        yesLabel: 'Show my new exercise', noLabel: false, href: exerciseUrl()
                    });
                } else {
                    window.location.href = exerciseUrl();
                }
            }
        });
    }

    async function skipExercise() {
        exerciseSkipBtn.disabled = true;
        try {
            const response = await fetch(`${API_BASE_URL}/api/lesson-exercise/skip`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ exercise_id: lessonData.exercise.exercise_id })
            });
            const result = await response.json();
            if (result.state) exerciseState = result.state;
            renderExerciseState();
            if (result.success) {
                // Same as a pass: save, stay on the exercise and show the result.
                if (!lessonData.is_completed) await finishLessonFromExercise();
                else showExerciseLessonComplete(false);
            } else {
                exerciseResultBox.style.display = 'block';
                exerciseResultBox.className = 'exercise-result fail';
                exerciseResultBox.textContent = result.message || 'Could not skip this exercise.';
            }
        } catch (err) {
            console.error('Error skipping exercise:', err);
            exerciseResultBox.style.display = 'block';
            exerciseResultBox.className = 'exercise-result fail';
            exerciseResultBox.textContent = "Couldn't skip. Check your internet and try again.";
        }
        renderExerciseState();
    }

    exerciseSubmitBtn.addEventListener('click', async () => {
        const code = exerciseCodeBox.innerText;
        if (!code.trim() || exerciseSubmitBtn.disabled || CobraPy.isRunning()) return;

        exerciseSubmitBtn.disabled = true;
        exerciseSubmitBtn.dataset.running = '1';
        exerciseSubmitNote.hidden = true;
        // feat/python-runner-no-freeze: the first run may still be loading Python.
        exerciseSubmitBtn.textContent = CobraPy.isReady() ? "Checking..." : "Starting Python...";
        const unwatch = CobraPy.onState((st) => {
            if (st === "ready" && exerciseSubmitBtn.dataset.running === '1') exerciseSubmitBtn.textContent = "Checking...";
        });

        let failed = false;
        try {
            // ONE run with the exercise's Given input; the server compares
            // its output with the Expected Output and checks the required
            // tags in the code (learner_exercise.evaluate_submission).
            const run = await runExerciseForGrading(code);
            exerciseResultBox.style.display = "block";
            if (!run) throw new Error("Python runtime unavailable");
            exerciseOutputBox.textContent = runText(run);

            const body = {
                resource_id: resourceId,
                exercise_id: lessonData.exercise.exercise_id,
                submitted_code: code,
                actual_output: run.output
            };
            if (run.error) body.error = run.error;
            const response = await fetch(`${API_BASE_URL}/api/lesson-exercise/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body)
            });
            const result = await response.json();

            if (result.state) exerciseState = result.state;
            if (result.locked) {
                lockExercise();
                return;
            }
            if (result.success && result.status === "correct") {
                exerciseResultBox.className = "exercise-result pass";
                exerciseResultBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${escapeHtml(result.feedback)}`;
                lessonData.exercise_completed = true;
                lockExercise();
                renderExerciseState();
                // A skipped lesson is already complete - passing now just
                // upgrades the score, so stay here instead of re-finishing.
                // First completion: save it now but STAY on the feedback -
                // the learner moves on with View Summary when ready.
                if (!lessonData.is_completed) {
                    if (PREVIEW) await attemptCompleteLesson();
                    else await finishLessonFromExercise();
                } else if (!PREVIEW) {
                    showExerciseLessonComplete(false);
                }
            } else if (result.success) {
                failed = true;
                exerciseResultBox.className = "exercise-result fail";
                exerciseResultBox.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${escapeHtml(result.feedback)}`;
                renderExerciseState();
            } else {
                exerciseResultBox.className = "exercise-result fail";
                exerciseResultBox.textContent = result.message || "Could not check your submission.";
            }
        } catch (err) {
            console.error('Error submitting exercise:', err);
            exerciseResultBox.style.display = "block";
            exerciseResultBox.className = "exercise-result fail";
            exerciseResultBox.textContent = "Could not check your code. Check your internet connection and try again.";
        } finally {
            delete exerciseSubmitBtn.dataset.running;
            unwatch();
        }

        if (!lessonData.exercise_completed) {
            exerciseSubmitBtn.textContent = "Submit";
            if (failed) lastFailedCode = codeKey(code);
            exerciseSubmitBtn.disabled = false;
            updateSubmitLock();
        }
    });

    // A passed exercise is locked, same rule as the activities: the result
    // that counts is saved, so it can't be submitted again. Run still works
    // so the learner can look at their code's output.
    function lockExercise() {
        exerciseSubmitBtn.disabled = true;
        exerciseSubmitBtn.hidden = true;
        exerciseCodeBox.setAttribute('contenteditable', 'false');
        exerciseCodeBox.classList.add('is-locked');
        let note = document.getElementById('exerciseLockedNote');
        if (!note) {
            note = document.createElement('p');
            note.id = 'exerciseLockedNote';
            note.className = 'answered-note';
            exerciseResultBox.insertAdjacentElement('afterend', note);
        }
        exerciseSubmitNote.hidden = true;
        exerciseSkipWrap.hidden = true;
        exerciseSkippedNote.hidden = true;
        note.innerHTML = `<i class="fa-solid fa-lock"></i> You passed this exercise. Your result is saved, so it can't be submitted again.`;
    }

    // A pass or a skip (or a reload of one): the feedback and output stay on
    // screen and the completion is saved in the background (same call as
    // always). Saved -> View Summary pulses. Refused -> the reason and a
    // way on (showExerciseCompletionBlocked) - never a dead end.
    let finishingLesson = false;
    async function finishLessonFromExercise() {
        if (finishingLesson) return false;
        finishingLesson = true;
        exerciseCompleteRow.style.display = "flex";
        exerciseCompleteStatus.style.display = "inline-flex";
        exerciseCompleteStatus.classList.remove('is-blocked');
        exerciseCompleteStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Saving your progress...</span>`;
        viewSummaryFromExerciseBtn.hidden = true;
        exerciseBackToActivitiesBtn.hidden = true;
        exerciseRetrySaveBtn.hidden = true;
        const saved = await attemptCompleteLesson({ stay: true });
        finishingLesson = false;
        if (saved) showExerciseLessonComplete(true);
        return saved;
    }

    // The lesson is complete: the way on to the Summary, on the Exercise step.
    function showExerciseLessonComplete(justNow) {
        exerciseCompleteRow.style.display = "flex";
        exerciseCompleteStatus.style.display = "inline-flex";
        exerciseCompleteStatus.classList.remove('is-blocked');
        exerciseBackToActivitiesBtn.hidden = true;
        exerciseRetrySaveBtn.hidden = true;
        viewSummaryFromExerciseBtn.hidden = false;
        if (justNow) {
            viewSummaryFromExerciseBtn.classList.add('game-next-pulse');
            exerciseCompleteStatus.innerHTML = `<span>🎉 Lesson complete! Press <strong>View Summary</strong> to continue.</span>`;
        } else if (!exerciseCompleteStatus.querySelector('span')) {
            exerciseCompleteStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> Lesson completed!`;
        }
    }

    // The completion was refused on the Exercise step: ALWAYS the reason and
    // a way out - unfinished activities -> Go back to activities; network or
    // anything else -> Try again.
    function showExerciseCompletionBlocked(result) {
        const titles = (result && Array.isArray(result.unfinished)) ? result.unfinished : [];
        if (exerciseState) exerciseState.unfinished_activities = titles;
        exerciseCompleteRow.style.display = "flex";
        exerciseCompleteStatus.style.display = "inline-flex";
        exerciseCompleteStatus.classList.add('is-blocked');
        viewSummaryFromExerciseBtn.hidden = true;
        viewSummaryFromExerciseBtn.classList.remove('game-next-pulse');
        exerciseBackToActivitiesBtn.hidden = !titles.length;
        exerciseRetrySaveBtn.hidden = !!titles.length;
        exerciseCompleteStatus.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${titles.length
            ? `You still need to finish: ${escapeHtml(titles.join(', '))}.`
            : "Couldn't save. Check your internet."}</span>`;
    }

    if (exerciseBackToActivitiesBtn) exerciseBackToActivitiesBtn.addEventListener('click', () => goToStep("activities"));
    if (exerciseRetrySaveBtn) exerciseRetrySaveBtn.addEventListener('click', () => finishLessonFromExercise());

    // ---------------- Activities step (unchanged behavior from before) ----------------
    // options.stay: a first completion does NOT jump to the Summary (the
    // Exercise step keeps its feedback on screen). Returns true when saved.
    async function attemptCompleteLesson(options = {}) {
        if (PREVIEW) {
            // Admin preview: nothing is saved - just say it's finished.
            lessonData.is_completed = true;
            lessonInProgressStatus.style.display = 'none';
            lessonCompleteStatus.style.display = 'inline-flex';
            PREVIEW.onFinished();
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/api/lesson-content/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ resource_id: resourceId })
            });
            const result = await response.json();
            if (result.success) {
                const firstTime = !lessonData.is_completed;
                lessonData.is_completed = true;
                updateContinueLabels();
                if (firstTime) {
                    // First completion: straight to the Summary, which saves the
                    // recommendations and then asks "Proceed to the next lesson?".
                    // With {stay: true} the caller shows View Summary instead;
                    // justCompleted keeps the Summary's "Proceed?" question.
                    justCompleted = true;
                    if (options.stay) return true;
                    goToStep("summary");
                    return true;
                }
                if (backToActivitiesBtn) backToActivitiesBtn.hidden = true;
                lessonInProgressStatus.classList.remove('is-blocked');
                lessonInProgressStatus.style.display = 'none';
                lessonCompleteStatus.style.display = 'inline-flex';
                // Lessons without an exercise finish on the Activities
                // panel, so the way forward to the Summary has to appear
                // here as soon as the lesson is completed - not only when
                // the page is reloaded on an already-completed lesson.
                if (!lessonData.exercise) {
                    lessonCompleteRow.style.display = 'flex';
                    viewSummaryFromActivitiesBtn.style.display = 'inline-flex';
                }
                return true;
            } else {
                console.error('Could not mark this lesson complete:', result.message);
                if (options.stay) showExerciseCompletionBlocked(result);
                showCompletionBlocked(result);
            }
        } catch (err) {
            console.error('Could not reach the server to complete this lesson.', err);
            const offline = { message: 'Could not reach the server. Please try again.' };
            if (options.stay) showExerciseCompletionBlocked(offline);
            showCompletionBlocked(offline);
        }
        return false;
    }

    // The server refused to complete the lesson - never leave the learner
    // on a dead end: say what's left and give a way back into it.
    function showCompletionBlocked(result) {
        if (lessonData.exercise) return;   // exercise lessons finish on the Exercise step
        if (!lessonData.has_activities) {
            // Content-only lesson: it finishes on the Content step.
            contentLockedNote.style.display = "inline-flex";
            contentLockedNote.textContent = result.message || "This lesson could not be completed yet.";
            return;
        }
        const titles = Array.isArray(result.unfinished) ? result.unfinished : [];
        lessonCompleteRow.style.display = 'flex';
        lessonCompleteStatus.style.display = 'none';
        viewSummaryFromActivitiesBtn.style.display = 'none';
        lessonInProgressStatus.style.display = 'inline-flex';
        lessonInProgressStatus.classList.add('is-blocked');
        lessonInProgressStatus.textContent = titles.length
            ? `Not finished yet: ${titles.join(', ')}. Go back and finish ${titles.length > 1 ? 'them' : 'it'} to complete this lesson.`
            : (result.message || 'This lesson could not be completed yet.');
        if (backToActivitiesBtn) backToActivitiesBtn.hidden = false;
    }

    function startActivitiesStep() {
        // A lesson with an exercise finishes THERE instead - this panel's
        // own complete row is only ever used for lessons with no exercise.
        const onActivitiesDone = lessonData.exercise ? exerciseAfterActivities : attemptCompleteLesson;

        if (!lessonData.exercise) {
            lessonCompleteRow.style.display = 'flex';
            lessonInProgressStatus.textContent = IN_PROGRESS_TEXT;
            lessonInProgressStatus.classList.remove('is-blocked');
            if (backToActivitiesBtn) backToActivitiesBtn.hidden = true;
            if (lessonData.is_completed) {
                lessonCompleteStatus.style.display = 'inline-flex';
                lessonInProgressStatus.style.display = 'none';
                viewSummaryFromActivitiesBtn.style.display = 'inline-flex';
            } else {
                lessonCompleteStatus.style.display = 'none';
                lessonInProgressStatus.style.display = 'inline-flex';
                viewSummaryFromActivitiesBtn.style.display = 'none';
            }
        }

        // Always (re)build the activities UI, even when this lesson is
        // already completed - navigating back here via the stepper is a
        // review, not a first attempt. cobraByteInitLessonActivities()
        // already knows how to show "you already completed this" per
        // activity (see activity.completed in lesson-activities.js) -
        // it just never got the chance to run before this fix.
        if (typeof window.cobraByteInitLessonActivities === 'function') {
            // ?retake=1 (Lessons page "Retake N missed"): Module 85% gate
            // retake - only the missed items are replayed.
            window.cobraByteInitLessonActivities(resourceId, activitiesContainer, onActivitiesDone, {
                retake: urlParams.get('retake') === '1'
            });
        }
    }

    // Activities all done in a lesson with an exercise: on to the Exercise
    // step. If the exercise is already passed or skipped (the lesson was
    // only waiting on the activities), finish the lesson there now.
    function exerciseAfterActivities() {
        if (exerciseState) exerciseState.unfinished_activities = [];
        goToStep("exercise");
        if (!PREVIEW && !lessonData.is_completed && exerciseIsDone()) finishLessonFromExercise();
    }

    function exerciseIsDone() {
        return !!(lessonData.exercise_completed || (exerciseState && (exerciseState.passed || exerciseState.skipped)));
    }

    if (backToActivitiesBtn) {
        // Rebuilds the activities panel: done activities show "already
        // completed" + Continue, so the learner lands on the unfinished one.
        backToActivitiesBtn.addEventListener('click', () => startActivitiesStep());
    }

    if (viewSummaryFromActivitiesBtn) {
        viewSummaryFromActivitiesBtn.addEventListener('click', () => goToStep("summary"));
    }
    if (viewSummaryFromExerciseBtn) {
        // The exercise can be passed (and locked) while the lesson is not marked
        // complete yet - e.g. the connection dropped right after passing. Then
        // this button finishes the lesson first instead of leaving it stuck.
        viewSummaryFromExerciseBtn.addEventListener('click', async () => {
            if (!lessonData.is_completed && (lessonData.exercise_completed || (exerciseState && exerciseState.skipped))) {
                // Retry after a failed save: stay on the feedback until it worked.
                const saved = await attemptCompleteLesson({ stay: true });
                if (!saved) return;
                exerciseCompleteStatus.classList.remove('is-blocked');
            }
            viewSummaryFromExerciseBtn.classList.remove('game-next-pulse');
            goToStep("summary");
        });
    }

    // ---------------- Summary step ----------------
    let summaryLoaded = false;

    async function loadSummary() {
        if (summaryLoaded) return; // built once per page load, same as video/exercise content
        summaryLoaded = true;

        try {
            const response = await fetch(`${API_BASE_URL}/api/lesson-summary?resource_id=${encodeURIComponent(resourceId)}`, {
                credentials: 'include'
            });
            const data = await response.json();
            if (!data.success) throw new Error('Unexpected response');
            renderSummary(data);
        } catch (err) {
            console.error('Error loading summary:', err);
            summaryList.innerHTML = '<p style="color:#e02424;">Could not load your results. Please refresh and try again.</p>';
            summaryContinueBtn.textContent = "Back to Lessons";
            summaryContinueBtn.disabled = false;
            summaryContinueBtn.addEventListener('click', () => { window.location.href = backToLessonsLink.href; });
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function renderSummary(data) {
        if (data.performance_percent !== null && data.performance_percent !== undefined) {
            perfBanner.style.display = 'flex';
            perfRing.style.setProperty('--pct', data.performance_percent);
            perfRingLabel.textContent = data.performance_percent + '%';
        }

        // Only what this lesson HAS: no video row without a video, no
        // activity rows without activities, no exercise row without one.
        const rows = [];
        if (data.has_video) {
            rows.push(`<div class="summary-row"><span>Video Tutorial</span><span class="${data.video_watched ? 'ok' : 'pending'}">${data.video_watched ? 'Completed' : 'Not watched'}</span></div>`);
        }
        rows.push(`<div class="summary-row"><span>Lesson Content</span><span class="${data.content_read ? 'ok' : 'pending'}">${data.content_read ? 'Completed' : 'Not read'}</span></div>`);

        (data.activities || []).forEach(a => {
            const label = a.total > 0 ? `${a.score}/${a.total} points` : (a.completed ? 'Completed' : 'Not completed');
            rows.push(`<div class="summary-row"><span>${escapeHtml(a.activity_title)} — ${escapeHtml(a.activity_type)}</span><span class="${a.completed ? 'ok' : 'pending'}">${label}</span></div>`);
        });

        if (data.exercise) {
            const ex = data.exercise;
            rows.push(`<div class="summary-row"><span>Exercise — ${escapeHtml(ex.exercise_title)}</span><span class="${ex.completed ? 'ok' : 'pending'}">${ex.completed ? 'Passed' : (ex.skipped ? 'Skipped – try again' : 'Not passed yet')}</span></div>`);
        }

        summaryList.innerHTML = rows.join('');

        // Strong | Needs work, worked out from the first-try answers.
        const insightsBox = document.getElementById('summaryInsights');
        if (insightsBox && window.CobraInsights) insightsBox.innerHTML = window.CobraInsights.html(data.insights);

        const next = data.next;
        const review = data.review || {};
        const moduleReviewUrl = review.module_id ? `/module-review?module_id=${review.module_id}` : null;
        const go = (url) => () => { window.location.href = url; };
        let continueAction;

        if (next && next.type === "module_gate") {
            // Module gate: this module isn't passed yet, so no way forward.
            if (summaryGateNote) {
                summaryGateNote.textContent = next.all_done
                    ? `Your module score is ${next.module_percent}%. You need ${next.pass_percent}% to unlock the next module - open your Module Review to see what you missed and retake it.`
                    : `Finish every lesson in this module with an average of ${next.pass_percent}% or higher to unlock the next module.`;
                summaryGateNote.hidden = false;
            }
            if (next.all_done && moduleReviewUrl) {
                summaryContinueBtn.textContent = "Go to Module Review";
                continueAction = go(moduleReviewUrl);
            } else {
                summaryContinueBtn.textContent = "Back to Lessons";
                continueAction = go(backToLessonsLink.href);
            }
        } else if (!next || next.type === "end") {
            summaryContinueBtn.textContent = "Back to Lessons";
            continueAction = go(backToLessonsLink.href);
        } else if (next.type === "chapter") {
            summaryContinueBtn.textContent = `Proceed to next chapter: ${next.category_name}`;
            continueAction = go(`/lesson-content?resource_id=${next.resource_id}`);
        } else {
            summaryContinueBtn.textContent = `Continue to ${next.resource_title}`;
            continueAction = go(`/lesson-content?resource_id=${next.resource_id}`);
        }
        summaryContinueBtn.disabled = false;
        // A lesson completed on THIS visit asks "Proceed?" first (progress,
        // score and recommendations are already saved by now); moving to a
        // new chapter always asks. Re-opened old lessons just continue.
        const askFirst = justCompleted || (next && next.type === "chapter");
        summaryContinueBtn.addEventListener('click', () => {
            if (askFirst && window.CobraProceed) {
                window.CobraProceed.open(proceedOptions(next, moduleReviewUrl));
            } else {
                continueAction();
            }
        });

        renderReview(review, moduleReviewUrl);
    }

    // ---------------- Summary: missed items -> Module Review ----------------
    // The lesson Summary only says how many items were missed. The full list
    // (what was answered, the feedback, the part to re-read, the retake) is
    // in the Module Review card at the end of the module.
    function renderReview(review, moduleReviewUrl) {
        if (!summaryReview || !review) return;
        const missed = review.lesson_missed || 0;
        const lessonBelow = !!review.lesson_below;
        if (!missed && !lessonBelow) return;

        summaryReview.hidden = false;
        const parts = [];
        if (lessonBelow) parts.push(`This lesson is at ${review.lesson_percent}% (the module needs ${review.pass_percent}%).`);
        if (missed) {
            parts.push(review.module_all_done
                ? `You missed ${missed} item${missed === 1 ? '' : 's'}. See exactly what to fix in your Module Review.`
                : `You missed ${missed} item${missed === 1 ? '' : 's'}. You'll see them in your Module Review at the end of this module.`);
        }
        summaryReviewNote.textContent = parts.join(' ');

        if (openModuleReviewBtn && moduleReviewUrl && review.module_all_done) {
            openModuleReviewBtn.href = moduleReviewUrl;
            openModuleReviewBtn.hidden = false;
        }
    }

    if (reviewLessonBtn) {
        reviewLessonBtn.addEventListener('click', () => {
            const target = stepOrder[0] ? stepOrder[0].key : null;
            if (target) {
                goToStep(target);
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        });
    }

    // ---------------- "Proceed?" popup content (proceed-modal.js) ----------------
    function proceedOptions(next, moduleReviewUrl) {
        const lessonsUrl = backToLessonsLink.href;
        if (next && next.type === "module_gate") {
            if (next.all_done) {
                return {
                    icon: "fa-clipboard-check",
                    title: "Module finished!",
                    text: `Your module score is ${next.module_percent}%. You need ${next.pass_percent}% to unlock the next module. Go to your Module Review to see what you missed and retake it?`,
                    yesLabel: "Yes, go to Module Review",
                    href: moduleReviewUrl || lessonsUrl,
                };
            }
            return {
                title: "Lesson complete!",
                text: `Some lessons in this module are not finished yet. Finish them with an average of ${next.pass_percent}% to unlock the next module. Go back to the lessons?`,
                yesLabel: "Yes, back to lessons",
                href: lessonsUrl,
            };
        }
        if (!next || next.type === "end") {
            return {
                icon: "fa-trophy",
                title: "You finished the course!",
                text: "Great work - that was the last lesson. Go back to your lessons?",
                yesLabel: "Yes, back to lessons",
                href: lessonsUrl,
            };
        }
        if (next.type === "chapter") {
            return {
                icon: "fa-flag-checkered",
                title: "Chapter complete!",
                text: `Proceed to the next chapter, ${next.category_name}, starting with "${next.resource_title}"?`,
                yesLabel: "Yes, next chapter",
                href: `/lesson-content?resource_id=${next.resource_id}`,
            };
        }
        if (next.new_module) {
            return {
                icon: "fa-flag",
                title: "Module complete!",
                text: `Proceed to the next module, ${next.module_name}, starting with "${next.resource_title}"?`,
                href: `/lesson-content?resource_id=${next.resource_id}`,
            };
        }
        return {
            title: "Lesson complete!",
            text: `Proceed to the next lesson, "${next.resource_title}"?`,
            href: `/lesson-content?resource_id=${next.resource_id}`,
        };
    }

    // ---------------- Initial load ----------------
    async function loadLesson() {
        if (!resourceId && !PREVIEW) {
            lessonLoading.style.display = 'none';
            lessonError.textContent = 'No lesson selected.';
            lessonError.style.display = 'block';
            return;
        }

        try {
            const lessonQuery = PREVIEW ? PREVIEW.query : `resource_id=${encodeURIComponent(resourceId)}`;
            const response = await fetch(`${API_BASE_URL}/api/lesson-content?${lessonQuery}`, {
                credentials: 'include'
            });

            const data = await response.json().catch(() => null);

            // Module 85% gate: this lesson's module is still locked.
            if (response.status === 403 && data && data.locked) {
                lessonLoading.style.display = 'none';
                if (data.cat_id) backToLessonsLink.href = `/lessons?cat_id=${data.cat_id}`;
                lessonError.textContent = data.message;
                lessonError.style.display = 'block';
                return;
            }

            if (!response.ok || !data) throw new Error('Request failed');
            if (!data.success) throw new Error('Unexpected response shape');

            lessonData = data;
            lessonLoading.style.display = 'none';
            lessonResourceTitle.textContent = data.resource_title;
            lessonResourceTitle.style.display = 'block';
            lessonContentBody.innerHTML = data.content_html || '';
            preparePageForLearner();
            // The coding exercise also needs Python: start it early.
            if (data.exercise) {
                CobraPy.preload();
                CobraPy.chip(exerciseRunBtn);
            }

            // Images can grow the content after first render, so
            // re-measure once each one finishes loading.
            lessonContentBody.querySelectorAll('img').forEach((img) => {
                if (!img.complete) {
                    img.addEventListener('load', checkContentFits);
                    img.addEventListener('error', checkContentFits);
                }
            });

            if (data.cat_id) {
                backToLessonsLink.href = `/lessons?cat_id=${data.cat_id}`;
            }

            // Populate the exercise panel once here regardless of step
            // shown, same reasoning as the video player - so reviewing it
            // later has something to show.
            if (data.exercise) {
                exerciseTitle.textContent = data.exercise.exercise_title;
                exerciseSituation.textContent = data.exercise.situation;
                exerciseProblem.textContent = data.exercise.problem_question;
                exerciseClue.textContent = data.exercise.clue;
                renderExerciseRequirements(data.exercise);
                exerciseState = data.exercise_state || null;
                // The complete row (and its way on) is shown by renderExerciseState /
                // finishLessonFromExercise below, depending on the lesson's state.
                if (data.exercise_completed) lockExercise();

                const lastSub = data.exercise_last_submission;
                if (lastSub) {
                    if (lastSub.submitted_code) {
                        exerciseCodeBox.textContent = lastSub.submitted_code;
                    }
                    exerciseResultBox.style.display = "block";
                    const passed = lastSub.status === "correct";
                    exerciseResultBox.className = "exercise-result " + (passed ? "pass" : "fail");
                    // The full saved feedback, same as right after submitting (older
                    // attempts also saved their "Test N: ..." tips below the message).
                    const savedFeedback = String(lastSub.feedback_given || "").trim();
                    exerciseResultBox.innerHTML = `<i class="fa-solid fa-${passed ? "circle-check" : "circle-xmark"}"></i> ${escapeHtml(savedFeedback)}`;
                    if (!passed) {
                        // The editor holds the code that just failed - same lock as after submitting.
                        if (lastSub.submitted_code) lastFailedCode = codeKey(lastSub.submitted_code);
                    }
                }
                renderExerciseState();
                updateSubmitLock();
                if (!PREVIEW) setupExercisePool(data);
                // Passed or skipped but the lesson is not completed (e.g. an
                // activity was unfinished, or the save failed): try once now;
                // if it is still refused the Exercise step says why + a way on.
                if (!PREVIEW && !data.is_completed && exerciseIsDone()) finishLessonFromExercise();
            }

            // Admin preview: only this preview's games and/or exercise,
            // opened directly - no video/content gates, no summary.
            if (PREVIEW) {
                stepOrder = [];
                if (data.has_activities) stepOrder.push({ key: "activities", label: "Activities" });
                if (data.exercise) stepOrder.push({ key: "exercise", label: "Exercise" });
                goToStep(stepOrder.length ? stepOrder[0].key : "activities");
                return;
            }

            // Build step order - only the steps the mentor uploaded, so the
            // numbering has no gaps and the learner never lands on an empty
            // page: Video, Activities and Exercise only when the lesson has
            // one. Content and Summary are always there.
            stepOrder = [];
            if (data.video) stepOrder.push({ key: "video", label: "Video" });
            stepOrder.push({ key: "content", label: "Content" });
            if (data.has_activities) stepOrder.push({ key: "activities", label: "Activities" });
            if (data.exercise) stepOrder.push({ key: "exercise", label: "Exercise" });
            stepOrder.push({ key: "summary", label: "Summary" });
            updateContinueLabels();

            // The video player is built once here regardless of watch
            // status, so reviewing it later (via the stepper) always
            // has something to show - only the STARTING step depends
            // on progress.
            if (data.video) {
                await setupVideoStep(data.video);
            }

            const progress = data.progress || { video_watched: false, content_read: false };

            // Where to start:
            //  - retake page (?retake=1): straight to the activities
            //  - a COMPLETED lesson (review): its first step, from the start
            //  - an unfinished lesson: the first step not done yet, with a
            //    "You stopped here last time" note when it was opened before
            let startKey;
            if (urlParams.get('retake') === '1' && data.has_activities) {
                startKey = "activities";
            } else if (urlParams.get('step') === 'exercise' && data.exercise && (data.is_completed || data.exercise_state && data.exercise_state.skipped)) {
                // Module Review "Try the exercise again" on a skipped exercise.
                startKey = "exercise";
            } else if (!data.is_completed && data.exercise && exerciseIsDone() && progress.content_read
                && (!data.video || progress.video_watched)
                && !((data.exercise_state && data.exercise_state.unfinished_activities) || []).length) {
                // Exercise passed or skipped, nothing else left, but the lesson is not
                // completed yet (e.g. the save failed): back on the Exercise step,
                // where it is finished now (or says why not).
                startKey = "exercise";
            } else if (data.is_completed) {
                startKey = stepOrder[0].key;
            } else if (data.video && !progress.video_watched) {
                startKey = "video";
            } else if (!progress.content_read) {
                startKey = "content";
            } else if (data.has_activities) {
                startKey = "activities";
            } else if (data.exercise) {
                startKey = "exercise";
            } else {
                startKey = "content";   // content-only lesson not finished yet: Finish Lesson
            }
            goToStep(startKey);

            if (lessonResumeNote && !data.is_completed && data.started_before && urlParams.get('retake') !== '1') {
                const label = (stepOrder.find((st) => st.key === startKey) || {}).label || "this step";
                lessonResumeText.textContent = `You stopped here last time - continuing from ${label}.`;
                lessonResumeNote.hidden = false;
                resumeNoteStep = startKey;
            } else if (lessonResumeNote && data.is_completed && urlParams.get('retake') !== '1') {
                lessonResumeText.textContent = "You already completed this lesson - reviewing it from the start. Your answers and scores are saved.";
                lessonResumeNote.hidden = false;
                resumeNoteStep = startKey;
            }

            // Already-crossed steps show as unlocked immediately if the
            // learner navigates back to them (no gate re-imposed).
            if (progress.video_watched) { videoUnlocked = true; videoContinueBtn.disabled = false; videoLockedNote.style.display = "none"; }
            if (progress.content_read) { contentUnlocked = true; contentContinueBtn.disabled = false; contentLockedNote.style.display = "none"; }

        } catch (err) {
            console.error('Error loading lesson:', err);
            lessonLoading.style.display = 'none';
            lessonError.style.display = 'block';
        }
    }

    loadLesson();
});