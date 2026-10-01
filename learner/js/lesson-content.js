document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = ""; // feat/admin-login-page: same-origin, works on 127.0.0.1 and localhost
    const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
    const LESSON_MODULES_DIR = "/lesson_modules";
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
    const reviewWeakSpotsBtn = document.getElementById('reviewWeakSpotsBtn');
    const reviewWeakSpotsLabel = document.getElementById('reviewWeakSpotsLabel');
    const reviewModuleWeakSpotsBtn = document.getElementById('reviewModuleWeakSpotsBtn');
    const reviewModuleWeakSpotsLabel = document.getElementById('reviewModuleWeakSpotsLabel');
    const weakSpotsPanel = document.getElementById('weakSpotsPanel');

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

    const videoStep = document.getElementById('videoStep');
    const lessonVideoFrame = document.getElementById('lessonVideoFrame');
    const lessonVideoTitle = document.getElementById('lessonVideoTitle');
    const videoContinueBtn = document.getElementById('videoContinueBtn');
    const videoLockedNote = document.getElementById('videoLockedNote');

    const contentStep = document.getElementById('contentStep');
    const lessonContentScroll = document.getElementById('lessonContentScroll');
    const contentContinueBtn = document.getElementById('contentContinueBtn');
    const contentLockedNote = document.getElementById('contentLockedNote');

    const activitiesStep = document.getElementById('activitiesStep');

    let activeOutputBox = null;
    let lessonData = null;
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
                node.addEventListener('click', () => goToStep(s.key));
            }
            lessonStepper.appendChild(node);
            if (i < stepOrder.length - 1) {
                const line = document.createElement('div');
                line.className = "lesson-step-line" + (isDone ? " done" : "");
                lessonStepper.appendChild(line);
            }
        });
    }

    function showStep(key) {
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
        const playerDiv = document.createElement('div');
        playerDiv.id = "ytPlayerTarget";
        lessonVideoFrame.innerHTML = "";
        lessonVideoFrame.appendChild(playerDiv);

        await loadYouTubeApi();

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
        goToStep("content");
    });

    // ---------------- Content step (real scroll tracking) ----------------
    let contentUnlocked = false;
    async function unlockContentContinue() {
        if (contentUnlocked) return;
        contentUnlocked = true;
        contentContinueBtn.disabled = false;
        contentLockedNote.style.display = "none";
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

    contentContinueBtn.addEventListener('click', () => {
        if (contentContinueBtn.disabled) return;
        goToStep("activities");
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

    // ---------------- Pyodide (unchanged from before) ----------------
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
    window.cobraByteTerminalInput = showTerminalInputPrompt;

    let pyodideLoadPromise = null;

    function getPyodideInstance() {
        if (!pyodideLoadPromise) {
            if (typeof loadPyodide !== "function") {
                return Promise.reject(new Error("Pyodide script did not load."));
            }
            pyodideLoadPromise = loadPyodide({ indexURL: PYODIDE_INDEX_URL });
        }
        return pyodideLoadPromise;
    }

    function syncModuleFilesToFS(pyodide, files) {
        try {
            pyodide.FS.mkdirTree(LESSON_MODULES_DIR);
        } catch (err) { /* already exists */ }
        files.forEach(({ filename, code }) => {
            const name = (filename || "").trim();
            if (!name.toLowerCase().endsWith(".py")) return;
            const baseName = name.split('/').pop().split('\\').pop();
            try {
                pyodide.FS.writeFile(`${LESSON_MODULES_DIR}/${baseName}`, code || "", { encoding: "utf8" });
            } catch (err) { /* ignore */ }
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
    async function runPythonCode(code, files = []) {
        let pyodide;
        try {
            pyodide = await getPyodideInstance();
        } catch (err) {
            return "Could not load the Python runtime. Check your internet connection and try again.";
        }

        syncModuleFilesToFS(pyodide, files);

        pyodide.globals.set("_cobrabyte_user_code", code || "");

        try {
            const result = await pyodide.runPythonAsync(
                "import sys, io, traceback, builtins, importlib, ast, types\n" +
                "import js as _cobrabyte_js\n" +
                `_cobrabyte_modules_dir = ${JSON.stringify(LESSON_MODULES_DIR)}\n` +
                "if _cobrabyte_modules_dir not in sys.path:\n" +
                "    sys.path.insert(0, _cobrabyte_modules_dir)\n" +
                "importlib.invalidate_caches()\n" +
                "_cobrabyte_stdout = io.StringIO()\n" +
                "_cobrabyte_stderr = io.StringIO()\n" +
                "_old_stdout, _old_stderr = sys.stdout, sys.stderr\n" +
                "_old_input = builtins.input\n" +
                "sys.stdout, sys.stderr = _cobrabyte_stdout, _cobrabyte_stderr\n" +
                "async def _cobrabyte_input(prompt=''):\n" +
                "    if prompt:\n" +
                "        sys.stdout.write(str(prompt))\n" +
                "    _val = await _cobrabyte_js.cobraByteTerminalInput(str(prompt) if prompt else '')\n" +
                "    if _val is None:\n" +
                "        raise EOFError('Input was cancelled while testing.')\n" +
                "    _val = str(_val)\n" +
                "    sys.stdout.write(_val + chr(10))\n" +
                "    return _val\n" +
                "builtins.input = _cobrabyte_input\n" +
                "class _CobrabyteAsyncify:\n" +
                "    # input() -> await input(). Any function that calls input() - directly\n" +
                "    # or through other user functions/methods - becomes async, and every\n" +
                "    # call to it is awaited, so input() works anywhere in the code.\n" +
                "    def __init__(self, tree):\n" +
                "        self.tree = tree\n" +
                "        self.async_names = set()\n" +
                "        self.method_names = set()\n" +
                "    @staticmethod\n" +
                "    def _own_calls(fn):\n" +
                "        stack = list(fn.body)\n" +
                "        while stack:\n" +
                "            node = stack.pop()\n" +
                "            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):\n" +
                "                continue\n" +
                "            if isinstance(node, ast.Call):\n" +
                "                yield node\n" +
                "            stack.extend(ast.iter_child_nodes(node))\n" +
                "    def _call_name(self, call):\n" +
                "        f = call.func\n" +
                "        if isinstance(f, ast.Name):\n" +
                "            return f.id\n" +
                "        if isinstance(f, ast.Attribute) and f.attr in self.method_names:\n" +
                "            return f.attr\n" +
                "        return None\n" +
                "    @staticmethod\n" +
                "    def _can_be_async(fn):\n" +
                "        if fn.name.startswith('__') and fn.name.endswith('__'):\n" +
                "            return False\n" +
                "        for node in ast.walk(fn):\n" +
                "            if isinstance(node, (ast.Yield, ast.YieldFrom)):\n" +
                "                return False\n" +
                "        return True\n" +
                "    def run(self):\n" +
                "        self.method_names = {\n" +
                "            item.name\n" +
                "            for cls in ast.walk(self.tree) if isinstance(cls, ast.ClassDef)\n" +
                "            for item in cls.body if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))\n" +
                "        }\n" +
                "        funcs = [n for n in ast.walk(self.tree) if isinstance(n, ast.FunctionDef) and self._can_be_async(n)]\n" +
                "        changed = True\n" +
                "        while changed:\n" +
                "            changed = False\n" +
                "            for fn in funcs:\n" +
                "                if fn.name in self.async_names:\n" +
                "                    continue\n" +
                "                for call in self._own_calls(fn):\n" +
                "                    name = self._call_name(call)\n" +
                "                    if name == 'input' or name in self.async_names:\n" +
                "                        self.async_names.add(fn.name)\n" +
                "                        changed = True\n" +
                "                        break\n" +
                "        self._rewrite(self.tree, True)\n" +
                "        ast.fix_missing_locations(self.tree)\n" +
                "        return self.tree\n" +
                "    def _rewrite(self, node, in_async):\n" +
                "        for field, value in ast.iter_fields(node):\n" +
                "            if isinstance(value, list):\n" +
                "                setattr(node, field, [self._visit(v, in_async) if isinstance(v, ast.AST) else v for v in value])\n" +
                "            elif isinstance(value, ast.AST):\n" +
                "                setattr(node, field, self._visit(value, in_async))\n" +
                "    def _visit(self, node, in_async):\n" +
                "        if isinstance(node, ast.FunctionDef):\n" +
                "            if node.name in self.async_names and self._can_be_async(node):\n" +
                "                extra = {'type_params': node.type_params} if hasattr(node, 'type_params') else {}\n" +
                "                new = ast.AsyncFunctionDef(name=node.name, args=node.args, body=node.body,\n" +
                "                                           decorator_list=node.decorator_list, returns=node.returns,\n" +
                "                                           type_comment=None, **extra)\n" +
                "                ast.copy_location(new, node)\n" +
                "                self._rewrite(new, True)\n" +
                "                return new\n" +
                "            self._rewrite(node, False)\n" +
                "            return node\n" +
                "        if isinstance(node, ast.AsyncFunctionDef):\n" +
                "            self._rewrite(node, True)\n" +
                "            return node\n" +
                "        if isinstance(node, ast.Lambda):\n" +
                "            self._rewrite(node, False)\n" +
                "            return node\n" +
                "        if isinstance(node, ast.ClassDef):\n" +
                "            self._rewrite(node, in_async)\n" +
                "            return node\n" +
                "        self._rewrite(node, in_async)\n" +
                "        if isinstance(node, ast.Call):\n" +
                "            name = self._call_name(node)\n" +
                "            if name == 'input' or name in self.async_names:\n" +
                "                if in_async:\n" +
                "                    return ast.copy_location(ast.Await(value=node), node)\n" +
                "                if name == 'input':\n" +
                "                    node.func = ast.copy_location(ast.Name(id='_cobrabyte_input_unsupported', ctx=ast.Load()), node.func)\n" +
                "        return node\n" +
                "def _cobrabyte_input_unsupported(*args, **kwargs):\n" +
                "    raise RuntimeError(\"input() can't be used inside __init__, a lambda, or a generator here. Move it into a normal function.\")\n" +
                "async def _cobrabyte_exec_async(source, mod_globals):\n" +
                "    tree = ast.parse(source or '', filename='<exec>', mode='exec')\n" +
                "    tree = _CobrabyteAsyncify(tree).run()\n" +
                "    code = compile(tree, '<exec>', 'exec', flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)\n" +
                "    mod_globals['_cobrabyte_input_unsupported'] = _cobrabyte_input_unsupported\n" +
                "    result = eval(code, mod_globals)\n" +
                "    if result is not None and hasattr(result, '__await__'):\n" +
                "        await result\n" +
                "try:\n" +
                "    await _cobrabyte_exec_async(_cobrabyte_user_code, {'__name__': '__main__'})\n" +
                "except Exception:\n" +
                "    traceback.print_exc()\n" +
                "finally:\n" +
                "    builtins.input = _old_input\n" +
                "    sys.stdout, sys.stderr = _old_stdout, _old_stderr\n" +
                "_cobrabyte_stdout.getvalue() + _cobrabyte_stderr.getvalue()\n"
            );
            return result;
        } catch (err) {
            return "Error running code: " + (err && err.message ? err.message : String(err));
        }
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
    let pyodideReady = false;

    const RUN_BTN_STOP_HTML = '<i class="fa-solid fa-stop"></i> Stop';
    const RUN_BTN_LOADING_HTML = '<i class="fa-solid fa-stop"></i> Loading Python...';

    // Clicked block's code only runs other lesson blocks it actually
    // imports (by filename, transitively, each at most once) - never the
    // whole lesson. Output is streamed live through _cobrabyte_write.
    const CODE_BLOCK_RUN_PY =
        "import sys, time, traceback, builtins, importlib, ast, types\n" +
        `_cobrabyte_modules_dir = ${JSON.stringify(LESSON_MODULES_DIR)}\n` +
        "if _cobrabyte_modules_dir not in sys.path:\n" +
        "    sys.path.insert(0, _cobrabyte_modules_dir)\n" +
        "importlib.invalidate_caches()\n" +
        "# Safety limits, so a runaway program stops by itself instead of\n" +
        "# freezing the page: at most 1,000 output lines, and 5 seconds of running\n" +
        "# time (time spent waiting for an input() answer does not count).\n" +
        "_COBRABYTE_MAX_LINES = 1000\n" +
        "_COBRABYTE_MAX_SECONDS = 5\n" +
        "class _CobrabyteLimit(BaseException):\n" +
        "    # BaseException, so the program's own `except Exception` can't catch it.\n" +
        "    pass\n" +
        "class _CobrabyteGuard:\n" +
        "    def __init__(self):\n" +
        "        self.lines = 0\n" +
        "        self.at_line_start = True\n" +
        "        self.hit = None\n" +
        "        self.used = 0.0\n" +
        "        self.started = time.monotonic()\n" +
        "    def pause(self):\n" +
        "        self.used += time.monotonic() - self.started\n" +
        "    def resume(self):\n" +
        "        self.started = time.monotonic()\n" +
        "    def check_time(self):\n" +
        "        if self.hit is None and self.used + (time.monotonic() - self.started) > _COBRABYTE_MAX_SECONDS:\n" +
        "            self.hit = 'Program stopped: it ran longer than ' + str(_COBRABYTE_MAX_SECONDS) + ' seconds.'\n" +
        "        if self.hit is not None:\n" +
        "            raise _CobrabyteLimit()\n" +
        "    def report(self):\n" +
        "        _cobrabyte_write(('' if self.at_line_start else chr(10)) + self.hit)\n" +
        "_cobrabyte_guard = _CobrabyteGuard()\n" +
        "class _CobrabyteLoopGuard(ast.NodeTransformer):\n" +
        "    # Every loop body starts with a quick time check, so even a one-line\n" +
        "    # `while True: pass` is stopped once the time limit is up.\n" +
        "    def _guard(self, node):\n" +
        "        self.generic_visit(node)\n" +
        "        tick = ast.Expr(value=ast.Call(func=ast.Name(id='_cobrabyte_tick', ctx=ast.Load()), args=[], keywords=[]))\n" +
        "        node.body.insert(0, ast.copy_location(tick, node))\n" +
        "        return node\n" +
        "    visit_For = visit_AsyncFor = visit_While = _guard\n" +
        "class _CobrabyteStream:\n" +
        "    # print() output goes straight to the clicked block's Output box.\n" +
        "    def __init__(self, write_fn):\n" +
        "        self._write_fn = write_fn\n" +
        "    def write(self, text):\n" +
        "        text = str(text)\n" +
        "        guard = _cobrabyte_guard\n" +
        "        if guard.hit is not None:\n" +
        "            raise _CobrabyteLimit()\n" +
        "        if text:\n" +
        "            if guard.lines >= _COBRABYTE_MAX_LINES:\n" +
        "                guard.hit = 'Program stopped: too much output (limit ' + format(_COBRABYTE_MAX_LINES, ',') + ' lines).'\n" +
        "                raise _CobrabyteLimit()\n" +
        "            guard.lines += text.count(chr(10))\n" +
        "            guard.at_line_start = text.endswith(chr(10))\n" +
        "            self._write_fn(text)\n" +
        "        return len(text)\n" +
        "    def flush(self):\n" +
        "        pass\n" +
        "    def isatty(self):\n" +
        "        return False\n" +
        "_old_stdout, _old_stderr = sys.stdout, sys.stderr\n" +
        "_old_input = builtins.input\n" +
        "sys.stdout = _CobrabyteStream(_cobrabyte_write)\n" +
        "sys.stderr = _CobrabyteStream(_cobrabyte_write)\n" +
        "async def _cobrabyte_input(prompt=''):\n" +
        "    _cobrabyte_guard.pause()\n" +
        "    try:\n" +
        "        _val = await _cobrabyte_read_input(str(prompt) if prompt else '')\n" +
        "    finally:\n" +
        "        _cobrabyte_guard.resume()\n" +
        "    if not isinstance(_val, str):\n" +
        "        raise EOFError('Input was cancelled while testing.')\n" +
        "    _cobrabyte_guard.at_line_start = True\n" +
        "    return _val\n" +
        "builtins.input = _cobrabyte_input\n" +
        "class _CobrabyteAsyncify:\n" +
        "    # input() -> await input(). Any function that calls input() - directly\n" +
        "    # or through other user functions/methods - becomes async, and every\n" +
        "    # call to it is awaited, so input() works anywhere in the code.\n" +
        "    def __init__(self, tree):\n" +
        "        self.tree = tree\n" +
        "        self.async_names = set()\n" +
        "        self.method_names = set()\n" +
        "    @staticmethod\n" +
        "    def _own_calls(fn):\n" +
        "        stack = list(fn.body)\n" +
        "        while stack:\n" +
        "            node = stack.pop()\n" +
        "            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):\n" +
        "                continue\n" +
        "            if isinstance(node, ast.Call):\n" +
        "                yield node\n" +
        "            stack.extend(ast.iter_child_nodes(node))\n" +
        "    def _call_name(self, call):\n" +
        "        f = call.func\n" +
        "        if isinstance(f, ast.Name):\n" +
        "            return f.id\n" +
        "        if isinstance(f, ast.Attribute) and f.attr in self.method_names:\n" +
        "            return f.attr\n" +
        "        return None\n" +
        "    @staticmethod\n" +
        "    def _can_be_async(fn):\n" +
        "        if fn.name.startswith('__') and fn.name.endswith('__'):\n" +
        "            return False\n" +
        "        for node in ast.walk(fn):\n" +
        "            if isinstance(node, (ast.Yield, ast.YieldFrom)):\n" +
        "                return False\n" +
        "        return True\n" +
        "    def run(self):\n" +
        "        self.method_names = {\n" +
        "            item.name\n" +
        "            for cls in ast.walk(self.tree) if isinstance(cls, ast.ClassDef)\n" +
        "            for item in cls.body if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))\n" +
        "        }\n" +
        "        funcs = [n for n in ast.walk(self.tree) if isinstance(n, ast.FunctionDef) and self._can_be_async(n)]\n" +
        "        changed = True\n" +
        "        while changed:\n" +
        "            changed = False\n" +
        "            for fn in funcs:\n" +
        "                if fn.name in self.async_names:\n" +
        "                    continue\n" +
        "                for call in self._own_calls(fn):\n" +
        "                    name = self._call_name(call)\n" +
        "                    if name == 'input' or name in self.async_names:\n" +
        "                        self.async_names.add(fn.name)\n" +
        "                        changed = True\n" +
        "                        break\n" +
        "        self._rewrite(self.tree, True)\n" +
        "        ast.fix_missing_locations(self.tree)\n" +
        "        return self.tree\n" +
        "    def _rewrite(self, node, in_async):\n" +
        "        for field, value in ast.iter_fields(node):\n" +
        "            if isinstance(value, list):\n" +
        "                setattr(node, field, [self._visit(v, in_async) if isinstance(v, ast.AST) else v for v in value])\n" +
        "            elif isinstance(value, ast.AST):\n" +
        "                setattr(node, field, self._visit(value, in_async))\n" +
        "    def _visit(self, node, in_async):\n" +
        "        if isinstance(node, ast.FunctionDef):\n" +
        "            if node.name in self.async_names and self._can_be_async(node):\n" +
        "                extra = {'type_params': node.type_params} if hasattr(node, 'type_params') else {}\n" +
        "                new = ast.AsyncFunctionDef(name=node.name, args=node.args, body=node.body,\n" +
        "                                           decorator_list=node.decorator_list, returns=node.returns,\n" +
        "                                           type_comment=None, **extra)\n" +
        "                ast.copy_location(new, node)\n" +
        "                self._rewrite(new, True)\n" +
        "                return new\n" +
        "            self._rewrite(node, False)\n" +
        "            return node\n" +
        "        if isinstance(node, ast.AsyncFunctionDef):\n" +
        "            self._rewrite(node, True)\n" +
        "            return node\n" +
        "        if isinstance(node, ast.Lambda):\n" +
        "            self._rewrite(node, False)\n" +
        "            return node\n" +
        "        if isinstance(node, ast.ClassDef):\n" +
        "            self._rewrite(node, in_async)\n" +
        "            return node\n" +
        "        self._rewrite(node, in_async)\n" +
        "        if isinstance(node, ast.Call):\n" +
        "            name = self._call_name(node)\n" +
        "            if name == 'input' or name in self.async_names:\n" +
        "                if in_async:\n" +
        "                    return ast.copy_location(ast.Await(value=node), node)\n" +
        "                if name == 'input':\n" +
        "                    node.func = ast.copy_location(ast.Name(id='_cobrabyte_input_unsupported', ctx=ast.Load()), node.func)\n" +
        "        return node\n" +
        "def _cobrabyte_input_unsupported(*args, **kwargs):\n" +
        "    raise RuntimeError(\"input() can't be used inside __init__, a lambda, or a generator here. Move it into a normal function.\")\n" +
        "async def _cobrabyte_exec_async(source, mod_globals):\n" +
        "    tree = ast.parse(source or '', filename='<exec>', mode='exec')\n" +
        "    tree = _CobrabyteAsyncify(tree).run()\n" +
        "    tree = _CobrabyteLoopGuard().visit(tree)\n" +
        "    ast.fix_missing_locations(tree)\n" +
        "    code = compile(tree, '<exec>', 'exec', flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)\n" +
        "    mod_globals['_cobrabyte_input_unsupported'] = _cobrabyte_input_unsupported\n" +
        "    mod_globals['_cobrabyte_tick'] = _cobrabyte_guard.check_time\n" +
        "    result = eval(code, mod_globals)\n" +
        "    if result is not None and hasattr(result, '__await__'):\n" +
        "        await result\n" +
        "def _cobrabyte_imported_names(source):\n" +
        "    # Top-level names of every `import x` / `from x import y` in source.\n" +
        "    try:\n" +
        "        tree = ast.parse(source or '')\n" +
        "    except SyntaxError:\n" +
        "        return []\n" +
        "    nodes = [n for n in ast.walk(tree) if isinstance(n, (ast.Import, ast.ImportFrom))]\n" +
        "    nodes.sort(key=lambda n: (n.lineno, n.col_offset))\n" +
        "    names = []\n" +
        "    for node in nodes:\n" +
        "        if isinstance(node, ast.Import):\n" +
        "            names.extend(alias.name.split('.')[0] for alias in node.names)\n" +
        "        elif node.level == 0 and node.module:\n" +
        "            names.append(node.module.split('.')[0])\n" +
        "    return names\n" +
        "# Other lesson blocks by module name (the clicked block is never in here).\n" +
        "_cobrabyte_lesson_modules = {}\n" +
        "for _mf in _cobrabyte_module_files.to_py():\n" +
        "    _mf_name = (_mf.get('filename') or '').strip()\n" +
        "    if not _mf_name.lower().endswith('.py'):\n" +
        "        continue\n" +
        "    _mod_name = _mf_name.split('/')[-1].split(chr(92))[-1][:-3]\n" +
        "    if _mod_name and _mod_name not in _cobrabyte_lesson_modules:\n" +
        "        _cobrabyte_lesson_modules[_mod_name] = _mf.get('code') or ''\n" +
        "# Forget lesson modules from earlier runs, so edited code is loaded fresh.\n" +
        "for _name, _m in list(sys.modules.items()):\n" +
        "    if getattr(_m, '__cobrabyte_lesson__', False) or str(getattr(_m, '__file__', '') or '').startswith(_cobrabyte_modules_dir + '/'):\n" +
        "        sys.modules.pop(_name, None)\n" +
        "_cobrabyte_loaded = set()\n" +
        "async def _cobrabyte_load_module(name):\n" +
        "    # Runs one imported lesson block as a module, its own lesson imports\n" +
        "    # first. Each block loads at most once, so import cycles stop here.\n" +
        "    if name in _cobrabyte_loaded or name not in _cobrabyte_lesson_modules:\n" +
        "        return\n" +
        "    _cobrabyte_loaded.add(name)\n" +
        "    source = _cobrabyte_lesson_modules[name]\n" +
        "    mod = types.ModuleType(name)\n" +
        "    mod.__file__ = _cobrabyte_modules_dir + '/' + name + '.py'\n" +
        "    mod.__cobrabyte_lesson__ = True\n" +
        "    sys.modules[name] = mod\n" +
        "    for dep in _cobrabyte_imported_names(source):\n" +
        "        await _cobrabyte_load_module(dep)\n" +
        "    try:\n" +
        "        await _cobrabyte_exec_async(source, mod.__dict__)\n" +
        "    except Exception:\n" +
        "        traceback.print_exc()\n" +
        "_cobrabyte_guard.resume()\n" +
        "try:\n" +
        "    for _dep in _cobrabyte_imported_names(_cobrabyte_user_code):\n" +
        "        await _cobrabyte_load_module(_dep)\n" +
        "    await _cobrabyte_exec_async(_cobrabyte_user_code, {'__name__': '__main__'})\n" +
        "except _CobrabyteLimit:\n" +
        "    pass\n" +
        "except SystemExit:\n" +
        "    pass\n" +
        "except Exception:\n" +
        "    traceback.print_exc()\n" +
        "finally:\n" +
        "    builtins.input = _old_input\n" +
        "    sys.stdout, sys.stderr = _old_stdout, _old_stderr\n" +
        "    if _cobrabyte_guard.hit is not None:\n" +
        "        _cobrabyte_guard.report()\n";

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

    // Stop: a waiting input() gets null, so the program ends through
    // EOFError - its traceback is hidden, since nothing prints once stopped.
    function stopCurrentRun() {
        const run = currentRun;
        if (!run || run.stopped) return;
        run.stopped = true;
        if (run.inputResolve) run.inputResolve(null);
        const box = run.outputBox;
        const text = box.textContent;
        box.appendChild(document.createTextNode((text && !text.endsWith("\n") ? "\n" : "") + "Program stopped."));
        box.scrollTop = box.scrollHeight;
        run.runBtn.disabled = true;
        run.signalStop();
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
    async function runCodeBlock(opts) {
        let signalStop = null;
        const run = {
            runBtn: opts.runBtn,
            outputBox: opts.outputBox,
            inputResolve: null,
            stopped: false,
            stopPromise: new Promise((resolve) => { signalStop = resolve; }),
        };
        run.signalStop = () => signalStop(null);

        const runBtn = run.runBtn;
        const originalHtml = runBtn.innerHTML;
        const originalTitle = runBtn.getAttribute("title");
        const otherBtns = Array.from(opts.scopeEl.querySelectorAll(".run-btn"))
            .filter((btn) => btn !== runBtn && !btn.disabled);
        currentRun = run;

        try {
            otherBtns.forEach((btn) => { btn.disabled = true; });
            runBtn.disabled = false;
            runBtn.classList.add("run-btn--stop");
            runBtn.setAttribute("title", "Stop");
            runBtn.innerHTML = pyodideReady ? RUN_BTN_STOP_HTML : RUN_BTN_LOADING_HTML;
            run.outputBox.textContent = "";

            let pyodide;
            try {
                pyodide = await Promise.race([getPyodideInstance(), run.stopPromise]);
            } catch (err) {
                appendRunOutput(run, "Could not load the Python runtime. Check your internet connection and try again.");
                return;
            }
            if (run.stopped || !pyodide) return;
            pyodideReady = true;
            runBtn.innerHTML = RUN_BTN_STOP_HTML;

            syncModuleFilesToFS(pyodide, opts.allFiles);
            pyodide.globals.set("_cobrabyte_user_code", opts.code || "");
            pyodide.globals.set("_cobrabyte_module_files", opts.moduleFiles);
            pyodide.globals.set("_cobrabyte_write", (text) => appendRunOutput(run, text));
            pyodide.globals.set("_cobrabyte_read_input", (promptText) => readRunInput(run, promptText));

            try {
                await pyodide.runPythonAsync(CODE_BLOCK_RUN_PY);
            } catch (err) {
                appendRunOutput(run, "Error running code: " + (err && err.message ? err.message : String(err)));
            }
        } finally {
            otherBtns.forEach((btn) => { btn.disabled = false; });
            runBtn.disabled = false;
            runBtn.classList.remove("run-btn--stop");
            if (originalTitle === null) runBtn.removeAttribute("title");
            else runBtn.setAttribute("title", originalTitle);
            runBtn.innerHTML = originalHtml;
            if (currentRun === run) currentRun = null;
        }
    }

    function wireRunButton(wrapper) {
        const runBtn = wrapper.querySelector(".run-btn");
        const consoleBox = wrapper.querySelector(".editor-console-box");
        const outputBox = wrapper.querySelector(".editor-output-box");
        if (!runBtn || !consoleBox || !outputBox) return;

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
    // Deterministic run used ONLY for grading: input() answers come from
    // a pre-supplied queue (this test case's test_input, split by line)
    // instead of prompting the learner - no UI, no waiting. The free
    // "Run" button below reuses the existing interactive runPythonCode()
    // instead, since that's meant for the learner trying things out by
    // hand with real prompts.
    async function runExerciseForGrading(code, testInput) {
        let pyodide;
        try {
            pyodide = await getPyodideInstance();
        } catch (err) {
            return null;
        }

        const inputLines = (testInput || "").split("\n");
        pyodide.globals.set("_cobrabyte_grade_code", code || "");
        pyodide.globals.set("_cobrabyte_grade_inputs", inputLines);

        try {
            const result = await pyodide.runPythonAsync(
                "import sys, io, traceback, builtins\n" +
                "_cobrabyte_grade_stdout = io.StringIO()\n" +
                "_old_stdout, _old_stderr = sys.stdout, sys.stderr\n" +
                "sys.stdout = sys.stderr = _cobrabyte_grade_stdout\n" +
                "_cobrabyte_grade_queue = list(_cobrabyte_grade_inputs.to_py())\n" +
                "def _cobrabyte_grade_input(prompt=''):\n" +
                "    return _cobrabyte_grade_queue.pop(0) if _cobrabyte_grade_queue else ''\n" +
                "_old_input = builtins.input\n" +
                "builtins.input = _cobrabyte_grade_input\n" +
                "try:\n" +
                "    exec(_cobrabyte_grade_code, {'__name__': '__main__'})\n" +
                "except Exception:\n" +
                "    traceback.print_exc()\n" +
                "finally:\n" +
                "    builtins.input = _old_input\n" +
                "    sys.stdout, sys.stderr = _old_stdout, _old_stderr\n" +
                "_cobrabyte_grade_stdout.getvalue()\n"
            );
            return result;
        } catch (err) {
            return "Error running code: " + (err && err.message ? err.message : String(err));
        }
    }

    exerciseRunBtn.addEventListener('click', async () => {
        const code = exerciseCodeBox.innerText.trim();
        if (!code) return;
        exerciseRunBtn.disabled = true;
        exerciseRunBtn.textContent = "Running...";
        activeOutputBox = exerciseOutputBox;
        exerciseOutputBox.textContent = "";
        const output = await runPythonCode(code, [], "");
        activeOutputBox = null;
        exerciseOutputBox.textContent = (output || "").trim();
        exerciseRunBtn.disabled = false;
        exerciseRunBtn.textContent = "Run";
    });

    exerciseSubmitBtn.addEventListener('click', async () => {
        const code = exerciseCodeBox.innerText;
        if (!code.trim()) return;

        exerciseSubmitBtn.disabled = true;
        exerciseSubmitBtn.textContent = "Running tests...";

        const actualOutputs = [];
        for (const tc of lessonData.exercise.test_cases) {
            const output = await runExerciseForGrading(code, tc.test_input);
            actualOutputs.push({ test_case_id: tc.test_case_id, actual_output: (output || "").trim() });
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/lesson-exercise/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    resource_id: resourceId,
                    exercise_id: lessonData.exercise.exercise_id,
                    submitted_code: code,
                    actual_outputs: actualOutputs
                })
            });
            const result = await response.json();

            exerciseResultBox.style.display = "block";
            if (result.success && result.status === "correct") {
                exerciseResultBox.className = "exercise-result pass";
                exerciseResultBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${result.feedback} (${result.passed}/${result.total} test cases passed)`;
                exerciseCompleteRow.style.display = "flex";
                exerciseCompleteStatus.style.display = "inline-flex";
                await attemptCompleteLesson();
            } else if (result.success) {
                exerciseResultBox.className = "exercise-result fail";
                exerciseResultBox.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${result.feedback} (${result.passed}/${result.total} test cases passed)`;
            } else {
                exerciseResultBox.className = "exercise-result fail";
                exerciseResultBox.textContent = result.message || "Could not check your submission.";
            }
        } catch (err) {
            console.error('Error submitting exercise:', err);
        }

        exerciseSubmitBtn.disabled = false;
        exerciseSubmitBtn.textContent = "Submit";
    });

    // ---------------- Activities step (unchanged behavior from before) ----------------
    async function attemptCompleteLesson() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/lesson-content/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ resource_id: resourceId })
            });
            const result = await response.json();
            if (result.success) {
                lessonData.is_completed = true;
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
            } else {
                console.error('Could not mark this lesson complete:', result.message);
                showCompletionBlocked(result);
            }
        } catch (err) {
            console.error('Could not reach the server to complete this lesson.', err);
            showCompletionBlocked({ message: 'Could not reach the server. Please try again.' });
        }
    }

    // The server refused to complete the lesson - never leave the learner
    // on a dead end: say what's left and give a way back into it.
    function showCompletionBlocked(result) {
        if (lessonData.exercise) return;   // exercise lessons finish on the Exercise step
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
        const onActivitiesDone = lessonData.exercise ? (() => goToStep("exercise")) : attemptCompleteLesson;

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

    if (backToActivitiesBtn) {
        // Rebuilds the activities panel: done activities show "already
        // completed" + Continue, so the learner lands on the unfinished one.
        backToActivitiesBtn.addEventListener('click', () => startActivitiesStep());
    }

    if (viewSummaryFromActivitiesBtn) {
        viewSummaryFromActivitiesBtn.addEventListener('click', () => goToStep("summary"));
    }
    if (viewSummaryFromExerciseBtn) {
        viewSummaryFromExerciseBtn.addEventListener('click', () => goToStep("summary"));
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

    function renderSummary(data) {
        if (data.performance_percent !== null && data.performance_percent !== undefined) {
            perfBanner.style.display = 'flex';
            perfRing.style.setProperty('--pct', data.performance_percent);
            perfRingLabel.textContent = data.performance_percent + '%';
        }

        const rows = [];
        rows.push(`<div class="summary-row"><span>Video Tutorial</span><span class="${data.video_watched ? 'ok' : 'pending'}">${data.video_watched ? 'Completed' : 'Not watched'}</span></div>`);
        rows.push(`<div class="summary-row"><span>Lesson Content</span><span class="${data.content_read ? 'ok' : 'pending'}">${data.content_read ? 'Completed' : 'Not read'}</span></div>`);

        (data.activities || []).forEach(a => {
            const label = a.total > 0 ? `${a.score}/${a.total} points` : (a.completed ? 'Completed' : 'Not completed');
            rows.push(`<div class="summary-row"><span>${a.activity_title} — ${a.activity_type}</span><span class="${a.completed ? 'ok' : 'pending'}">${label}</span></div>`);
        });

        if (data.exercise) {
            const ex = data.exercise;
            rows.push(`<div class="summary-row"><span>Exercise — ${ex.exercise_title}</span><span class="${ex.completed ? 'ok' : 'pending'}">${ex.points_earned}/${ex.points_total} test cases${ex.completed ? ' (Passed)' : ''}</span></div>`);
        }

        summaryList.innerHTML = rows.join('');

        const next = data.next;
        if (next && next.type === "module_gate") {
            // Module 85% gate: this module isn't passed yet, so no way forward.
            if (summaryGateNote) {
                summaryGateNote.textContent = next.all_done
                    ? `Your module score is ${next.module_percent}%. You need ${next.pass_percent}% to unlock the next module - retake your missed items on the Lessons page.`
                    : `Finish every lesson in this module with an average of ${next.pass_percent}% or higher to unlock the next module.`;
                summaryGateNote.hidden = false;
            }
            summaryContinueBtn.textContent = "Back to Lessons";
            summaryContinueBtn.disabled = false;
            summaryContinueBtn.addEventListener('click', () => { window.location.href = backToLessonsLink.href; });
        } else if (!next || next.type === "end") {
            summaryContinueBtn.textContent = "Back to Lessons";
            summaryContinueBtn.disabled = false;
            summaryContinueBtn.addEventListener('click', () => { window.location.href = backToLessonsLink.href; });
        } else if (next.type === "chapter") {
            summaryContinueBtn.textContent = `Continue to ${next.category_name}`;
            summaryContinueBtn.disabled = false;
            summaryContinueBtn.addEventListener('click', () => { window.location.href = `/lesson-content?resource_id=${next.resource_id}`; });
        } else {
            summaryContinueBtn.textContent = `Continue to ${next.resource_title}`;
            summaryContinueBtn.disabled = false;
            summaryContinueBtn.addEventListener('click', () => { window.location.href = `/lesson-content?resource_id=${next.resource_id}`; });
        }

        renderReview(data.review);
    }

    // ---------------- Summary: review lesson + weak spots ----------------
    // Shown when this lesson is below the pass % (review the lesson / its
    // weak spots), and on the LAST lesson of a module that needs a retake
    // (weak spots across the whole module).
    const weakSpotsCache = {};
    let weakSpotsOpenScope = null;

    function renderReview(review) {
        if (!summaryReview || !review) return;
        const lessonBelow = !!review.lesson_below;
        const moduleBelow = !!review.module_below;
        if (!lessonBelow && !moduleBelow) return;

        summaryReview.hidden = false;
        summaryReviewNote.textContent = lessonBelow
            ? `This lesson is at ${review.lesson_percent}% - you need ${review.pass_percent}%. Review the lesson or go straight to the parts behind the questions you missed.`
            : `Your module needs a retake. Review your weak spots across the module first.`;

        reviewWeakSpotsBtn.hidden = !(lessonBelow && review.lesson_missed > 0);
        reviewWeakSpotsLabel.textContent = `Review my weak spots (${review.lesson_missed})`;
        reviewModuleWeakSpotsBtn.hidden = !(moduleBelow && review.module_missed > 0);
        reviewModuleWeakSpotsLabel.textContent = `Review module weak spots (${review.module_missed})`;
    }

    async function toggleWeakSpots(scope) {
        const btn = scope === "module" ? reviewModuleWeakSpotsBtn : reviewWeakSpotsBtn;
        const otherBtn = scope === "module" ? reviewWeakSpotsBtn : reviewModuleWeakSpotsBtn;

        if (weakSpotsOpenScope === scope) {            // second click closes it
            weakSpotsPanel.hidden = true;
            weakSpotsOpenScope = null;
            btn.classList.remove('is-active');
            return;
        }
        weakSpotsOpenScope = scope;
        btn.classList.add('is-active');
        otherBtn.classList.remove('is-active');
        weakSpotsPanel.hidden = false;
        weakSpotsPanel.innerHTML = '<p class="weak-spots-empty">Finding your weak spots...</p>';

        try {
            if (!weakSpotsCache[scope]) {
                const response = await fetch(`${API_BASE_URL}/api/weak-spots?resource_id=${encodeURIComponent(resourceId)}&scope=${scope}`, {
                    credentials: 'include'
                });
                const data = await response.json();
                if (!response.ok || !data.success) throw new Error(data.message || 'Request failed');
                weakSpotsCache[scope] = data;
            }
            if (weakSpotsOpenScope === scope) renderWeakSpots(weakSpotsCache[scope], scope);
        } catch (err) {
            console.error('Error loading weak spots:', err);
            weakSpotsPanel.innerHTML = '<p class="weak-spots-empty">Could not load your weak spots. Please try again.</p>';
        }
    }

    function renderWeakSpots(data, scope) {
        weakSpotsPanel.innerHTML = "";
        const groups = data.groups || [];
        if (!groups.length) {
            weakSpotsPanel.innerHTML = '<p class="weak-spots-empty">No missed items left to review.</p>';
            return;
        }

        const title = document.createElement('p');
        title.className = 'weak-spots-title';
        title.textContent = scope === "module" ? "Your weak spots in this module" : "Your weak spots in this lesson";
        const sub = document.createElement('p');
        sub.className = 'weak-spots-sub';
        sub.textContent = `${data.missed_total} missed item${data.missed_total === 1 ? '' : 's'}, grouped under the part of the lesson that teaches them.`;
        weakSpotsPanel.append(title, sub);

        groups.forEach((group) => {
            const card = document.createElement('div');
            card.className = 'weak-spot-group';

            const from = document.createElement('p');
            from.className = 'weak-spot-from' + (group.is_current_lesson ? '' : ' is-earlier');
            from.textContent = (group.is_current_lesson && scope !== "module")
                ? `This lesson · ${group.items.length} missed`
                : `From ${group.lesson_title} · ${group.items.length} missed`;

            const heading = document.createElement('p');
            heading.className = 'weak-spot-heading';
            heading.textContent = group.heading;

            // The lesson part itself (admin-authored lesson HTML), made read-only
            // exactly like the Content step.
            const content = document.createElement('div');
            content.className = 'weak-spot-content lesson-content-body';
            content.innerHTML = group.html || '';
            content.querySelectorAll('[contenteditable="true"]').forEach((el) => el.setAttribute('contenteditable', 'false'));
            preparePageForLearner(content);

            const list = document.createElement('div');
            list.className = 'weak-spot-items';
            group.items.forEach((item) => {
                const row = document.createElement('div');
                row.className = 'weak-spot-item';

                const label = document.createElement('span');
                label.className = 'weak-spot-item-label';
                label.textContent = item.label;
                const prompt = document.createElement('span');
                prompt.className = 'weak-spot-item-prompt';
                prompt.textContent = item.prompt;

                const answers = document.createElement('div');
                answers.className = 'weak-spot-item-answers';
                const yours = document.createElement('code');
                yours.textContent = item.your_answer || '-';
                // Feedback only - the correct answer is never shown to learners.
                const feedback = document.createElement('span');
                feedback.className = 'weak-spot-item-feedback';
                feedback.textContent = item.feedback || '-';
                answers.append('Your answer: ', yours, '  ·  Feedback: ', feedback);

                row.append(label, prompt, answers);
                list.appendChild(row);
            });

            card.append(from, heading, content, list);
            weakSpotsPanel.appendChild(card);
        });
    }

    if (reviewLessonBtn) {
        reviewLessonBtn.addEventListener('click', () => {
            const target = stepOrder.some((s) => s.key === "content") ? "content"
                : (stepOrder[0] ? stepOrder[0].key : null);
            if (target) {
                goToStep(target);
                window.scrollTo({ top: 0, behavior: "smooth" });
            }
        });
    }
    if (reviewWeakSpotsBtn) reviewWeakSpotsBtn.addEventListener('click', () => toggleWeakSpots("lesson"));
    if (reviewModuleWeakSpotsBtn) reviewModuleWeakSpotsBtn.addEventListener('click', () => toggleWeakSpots("module"));

    // ---------------- Initial load ----------------
    async function loadLesson() {
        if (!resourceId) {
            lessonLoading.style.display = 'none';
            lessonError.textContent = 'No lesson selected.';
            lessonError.style.display = 'block';
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/lesson-content?resource_id=${encodeURIComponent(resourceId)}`, {
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
                if (data.exercise_completed) {
                    exerciseCompleteRow.style.display = "flex";
                    exerciseCompleteStatus.style.display = "inline-flex";
                }

                const lastSub = data.exercise_last_submission;
                if (lastSub) {
                    if (lastSub.submitted_code) {
                        exerciseCodeBox.textContent = lastSub.submitted_code;
                    }
                    exerciseResultBox.style.display = "block";
                    const passed = lastSub.status === "correct";
                    exerciseResultBox.className = "exercise-result " + (passed ? "pass" : "fail");
                    exerciseResultBox.innerHTML = `<i class="fa-solid fa-${passed ? "circle-check" : "circle-xmark"}"></i> ${lastSub.feedback_given || ""} (${lastSub.test_cases_passed}/${lastSub.test_cases_total} test cases passed)`;
                }
            }

            // Build step order - Video and Exercise are only included if
            // this lesson actually has one. Summary is always last.
            stepOrder = [];
            if (data.video) stepOrder.push({ key: "video", label: "Video" });
            stepOrder.push({ key: "content", label: "Content" });
            stepOrder.push({ key: "activities", label: "Activities" });
            if (data.exercise) stepOrder.push({ key: "exercise", label: "Exercise" });
            stepOrder.push({ key: "summary", label: "Summary" });

            // The video player is built once here regardless of watch
            // status, so reviewing it later (via the stepper) always
            // has something to show - only the STARTING step depends
            // on progress.
            if (data.video) {
                await setupVideoStep(data.video);
            }

            const progress = data.progress || { video_watched: false, content_read: false };

            // Resume at the first incomplete step; a fully-completed
            // lesson (re-opened for review) goes straight to Activities.
            if (data.video && !progress.video_watched) {
                goToStep("video");
            } else if (!progress.content_read) {
                goToStep("content");
            } else {
                goToStep("activities");
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