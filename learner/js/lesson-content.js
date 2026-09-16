document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = "http://127.0.0.1:5000";
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
        videoStep.style.display = key === "video" ? "block" : "none";
        contentStep.style.display = key === "content" ? "block" : "none";
        activitiesStep.style.display = key === "activities" ? "block" : "none";
        renderStepper(key);
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
    }

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

    function getAllCodeBlockFiles() {
        const files = [];
        document.querySelectorAll(".editor-code-container").forEach((wrapper) => {
            const filenameInput = wrapper.querySelector(".editor-code-filename");
            const consoleBox = wrapper.querySelector(".editor-console-box");
            files.push({
                filename: filenameInput ? filenameInput.value.trim() : "",
                code: consoleBox ? consoleBox.innerText : ""
            });
        });
        return files;
    }

    async function runPythonCode(code, files = [], currentFilename = "") {
        let pyodide;
        try {
            pyodide = await getPyodideInstance();
        } catch (err) {
            return "Could not load the Python runtime. Check your internet connection and try again.";
        }

        syncModuleFilesToFS(pyodide, files);

        pyodide.globals.set("_cobrabyte_user_code", code || "");
        pyodide.globals.set("_cobrabyte_module_files", files);
        pyodide.globals.set("_cobrabyte_current_filename", currentFilename || "");

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
                "class _CobrabyteInputAwaiter(ast.NodeTransformer):\n" +
                "    def visit_Call(self, node):\n" +
                "        self.generic_visit(node)\n" +
                "        if isinstance(node.func, ast.Name) and node.func.id == 'input':\n" +
                "            return ast.copy_location(ast.Await(value=node), node)\n" +
                "        return node\n" +
                "async def _cobrabyte_exec_async(source, mod_globals):\n" +
                "    tree = ast.parse(source or '', mode='exec')\n" +
                "    _CobrabyteInputAwaiter().visit(tree)\n" +
                "    ast.fix_missing_locations(tree)\n" +
                "    body = tree.body if tree.body else [ast.Pass()]\n" +
                "    func = ast.AsyncFunctionDef(\n" +
                "        name='_cobrabyte_block_main',\n" +
                "        args=ast.arguments(posonlyargs=[], args=[], vararg=None, kwonlyargs=[], kw_defaults=[], kwarg=None, defaults=[]),\n" +
                "        body=body, decorator_list=[], returns=None,\n" +
                "    )\n" +
                "    module_ast = ast.Module(body=[func], type_ignores=[])\n" +
                "    ast.fix_missing_locations(module_ast)\n" +
                "    exec(compile(module_ast, '<exec>', 'exec'), mod_globals)\n" +
                "    await mod_globals['_cobrabyte_block_main']()\n" +
                "try:\n" +
                "    for _mf in _cobrabyte_module_files.to_py():\n" +
                "        _mf_name = (_mf.get('filename') or '').strip()\n" +
                "        if not _mf_name.lower().endswith('.py'):\n" +
                "            continue\n" +
                "        if _mf_name == _cobrabyte_current_filename:\n" +
                "            continue\n" +
                "        _mod_name = _mf_name.split('/')[-1].split(chr(92))[-1][:-3]\n" +
                "        sys.modules.pop(_mod_name, None)\n" +
                "        _mod = types.ModuleType(_mod_name)\n" +
                "        sys.modules[_mod_name] = _mod\n" +
                "        try:\n" +
                "            await _cobrabyte_exec_async(_mf.get('code') or '', _mod.__dict__)\n" +
                "        except Exception:\n" +
                "            traceback.print_exc()\n" +
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

    function wireRunButton(wrapper) {
        const runBtn = wrapper.querySelector(".run-btn");
        const consoleBox = wrapper.querySelector(".editor-console-box");
        const outputBox = wrapper.querySelector(".editor-output-box");
        const filenameInput = wrapper.querySelector(".editor-code-filename");
        if (!runBtn || !consoleBox || !outputBox) return;

        runBtn.addEventListener("click", async function () {
            const code = consoleBox.innerText.trim();
            if (!code) {
                alert("There's no example code in this Console block.");
                return;
            }

            const originalHtml = runBtn.innerHTML;
            runBtn.disabled = true;
            runBtn.innerHTML = pyodideLoadPromise
                ? '<i class="fa-solid fa-spinner fa-spin"></i> Running...'
                : '<i class="fa-solid fa-spinner fa-spin"></i> Loading Python...';

            activeOutputBox = outputBox;
            outputBox.textContent = "";

            const files = getAllCodeBlockFiles();
            const currentFilename = filenameInput ? filenameInput.value.trim() : "";
            const output = await runPythonCode(code, files, currentFilename);

            activeOutputBox = null;
            outputBox.textContent = output.trim();

            runBtn.disabled = false;
            runBtn.innerHTML = originalHtml;
        });
    }

    function preparePageForLearner() {
        lessonContentBody.querySelectorAll(".editor-code-filename").forEach((input) => {
            input.setAttribute("disabled", "true");
        });

        lessonContentBody.querySelectorAll(".editor-console-box").forEach((box) => {
            box.setAttribute("contenteditable", "false");
        });

        lessonContentBody.querySelectorAll(".editor-code-container").forEach((wrapper) => {
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

        lessonContentBody.querySelectorAll(".editor-terminal-box").forEach((box) => {
            box.setAttribute("contenteditable", "false");
        });
    }

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
                lessonInProgressStatus.style.display = 'none';
                lessonCompleteStatus.style.display = 'inline-flex';
            } else {
                console.error('Could not mark this lesson complete:', result.message);
            }
        } catch (err) {
            console.error('Could not reach the server to complete this lesson.', err);
        }
    }

    function startActivitiesStep() {
        lessonCompleteRow.style.display = 'flex';

        if (lessonData.is_completed) {
            lessonCompleteStatus.style.display = 'inline-flex';
            lessonInProgressStatus.style.display = 'none';
            activitiesContainer.style.display = 'none';
        } else {
            lessonCompleteStatus.style.display = 'none';
            lessonInProgressStatus.style.display = 'inline-flex';
            if (typeof window.cobraByteInitLessonActivities === 'function') {
                window.cobraByteInitLessonActivities(resourceId, activitiesContainer, attemptCompleteLesson);
            }
        }
    }

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

            if (!response.ok) throw new Error('Request failed');

            const data = await response.json();
            if (!data.success) throw new Error('Unexpected response shape');

            lessonData = data;
            lessonLoading.style.display = 'none';
            lessonResourceTitle.textContent = data.resource_title;
            lessonResourceTitle.style.display = 'block';
            lessonContentBody.innerHTML = data.content_html || '';
            preparePageForLearner();

            if (data.cat_id) {
                backToLessonsLink.href = `/lessons?cat_id=${data.cat_id}`;
            }

            // Build step order - Video only included if this lesson has one
            stepOrder = [];
            if (data.video) stepOrder.push({ key: "video", label: "Video" });
            stepOrder.push({ key: "content", label: "Content" });
            stepOrder.push({ key: "activities", label: "Activities" });

            // The video player is built once here regardless of watch
            // status, so reviewing it later (via the stepper) always
            // has something to show - only the STARTING step depends
            // on progress.
            if (data.video) {
                await setupVideoStep(data.video);
            }

            // Resume at the first incomplete step; a fully-completed
            // lesson (re-opened for review) goes straight to Activities.
            if (data.video && !data.progress.video_watched) {
                goToStep("video");
            } else if (!data.progress.content_read) {
                goToStep("content");
            } else {
                goToStep("activities");
            }

            // Already-crossed steps show as unlocked immediately if the
            // learner navigates back to them (no gate re-imposed).
            if (data.progress.video_watched) { videoUnlocked = true; videoContinueBtn.disabled = false; videoLockedNote.style.display = "none"; }
            if (data.progress.content_read) { contentUnlocked = true; contentContinueBtn.disabled = false; contentLockedNote.style.display = "none"; }

        } catch (err) {
            console.error('Error loading lesson:', err);
            lessonLoading.style.display = 'none';
            lessonError.style.display = 'block';
        }
    }

    loadLesson();
});