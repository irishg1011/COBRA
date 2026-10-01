/**
 * admin-editor-preview.js
 * --------------------------------------------------------------------
 * Wires the Preview button on the 3 editor pages:
 *   - Preview Lesson   (#previewLessonBtn   - upload-resource.html)
 *   - Preview Activity (#previewActivityBtn - create-learning-activity.html)
 *   - Preview Exercise (#previewExerciseBtn - create-coding-exercise.html)
 *
 * Rules (same on all 3 pages):
 *   1. Runs the SAME checks the page's Save button runs first. If
 *      something is missing, the page's own red borders + popup show
 *      and the preview does NOT open.
 *   2. Shows what is in the editor RIGHT NOW (saved or not).
 *   3. Shows a yellow notice when the item was never saved, or has
 *      changes since the last save.
 *   4. Never saves anything and never calls a route that records
 *      anything.
 *
 * Lesson: rendered like the learner's lesson page, Run buttons work
 *   (Pyodide) - same logic as the Resources list's content preview.
 * Activity / Exercise: view only - nothing can be answered or graded.
 *
 * Reads from the page:
 *   window.cobraByteLessonEditor   (upload-resource-draft-guard.js)
 *   window.cobraByteActivityEditor (create-learning-activity-draft-guard.js)
 *   validateExerciseForm()         (create-exercise.js, global)
 */
(function () {
    "use strict";

    const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
    const LESSON_MODULES_DIR = "/lesson_modules";

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function fieldValue(id) {
        const node = document.getElementById(id);
        return node ? (node.value || "").trim() : "";
    }

    // ------------------------------------------------------------
    // Unsaved notice text - null means "everything is saved".
    // ------------------------------------------------------------
    function getNoticeText(kindLabel, isNew, isDirty) {
        if (isNew) {
            return `This ${kindLabel} hasn't been saved yet. Click Save to keep it.`;
        }
        if (isDirty) {
            return "You're previewing unsaved changes. Click Save to keep them.";
        }
        return null;
    }

    // ------------------------------------------------------------
    // Modal shell - reuses admin-style.css's .modal-overlay /
    // .content-preview-card, same as the Resources list preview.
    // Returns the body element to render into.
    // ------------------------------------------------------------
    function openPreviewModal(title, noticeText) {
        const existing = document.getElementById("editorPreviewModalOverlay");
        if (existing) {
            stopCurrentRun();
            existing.remove();
        }

        const overlay = document.createElement("div");
        overlay.id = "editorPreviewModalOverlay";
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="content-preview-card editor-preview-card">
                <div class="content-preview-header">
                    <strong class="editor-preview-title"></strong>
                    <button type="button" class="modal-close-btn modal-close-inline editor-preview-close-btn" title="Close">&times;</button>
                </div>
                <div class="editor-preview-notice editor-preview-hidden">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span class="editor-preview-notice-text"></span>
                </div>
                <div class="content-preview-body editor-preview-body"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector(".editor-preview-title").textContent = title || "Preview";

        if (noticeText) {
            overlay.querySelector(".editor-preview-notice-text").textContent = noticeText;
            overlay.querySelector(".editor-preview-notice").classList.remove("editor-preview-hidden");
        }

        function closeModal() {
            // A block still running in this preview is stopped with it.
            stopCurrentRun();
            overlay.remove();
            document.removeEventListener("keydown", onEscKey);
        }
        function onEscKey(e) {
            if (e.key === "Escape") closeModal();
        }
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeModal();
        });
        overlay.querySelector(".editor-preview-close-btn").addEventListener("click", closeModal);
        document.addEventListener("keydown", onEscKey);

        return overlay.querySelector(".editor-preview-body");
    }

    // ============================================================
    // LESSON - same Pyodide run logic as the Resources list's
    // content preview (admin-learning-resources.js), ported here
    // because that file only loads on the Resources list page.
    // ============================================================
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
            const baseName = name.split("/").pop().split("\\").pop();
            try {
                pyodide.FS.writeFile(`${LESSON_MODULES_DIR}/${baseName}`, code || "", { encoding: "utf8" });
            } catch (err) { /* ignore */ }
        });
    }

    // `skipWrapper` (the clicked block) is left out when given.
    function getAllCodeBlockFiles(scopeEl, skipWrapper) {
        const files = [];
        scopeEl.querySelectorAll(".editor-code-container").forEach((wrapper) => {
            if (wrapper === skipWrapper) return;
            const filenameInput = wrapper.querySelector(".editor-code-filename");
            const consoleBox = wrapper.querySelector(".editor-console-box");
            files.push({
                filename: filenameInput ? filenameInput.value.trim() : "",
                code: consoleBox ? consoleBox.innerText : "",
            });
        });
        return files;
    }

    // Shared #confirmActionModal as a promise (true = confirm button).
    // `withCancel` false = a plain notice with just the confirm button.
    // Pulled in front of any open preview overlay while it is showing.
    function showRunModal(title, message, confirmLabel, withCancel) {
        const modal = document.getElementById("confirmActionModal");
        if (!modal) return Promise.resolve(true);
        const modalTitle = document.getElementById("confirmActionTitle");
        const modalText = document.getElementById("confirmActionText");
        const cancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmBtn = document.getElementById("confirmActionConfirmBtn");
        if (modalTitle) modalTitle.textContent = title;
        if (modalText) modalText.textContent = message;
        if (cancelBtn) cancelBtn.style.display = withCancel ? "" : "none";
        if (confirmBtn) {
            confirmBtn.textContent = confirmLabel;
            confirmBtn.className = "modal-btn-save";
        }
        modal.classList.add("modal-overlay-front");
        modal.classList.remove("modal-hidden");
        modal.style.display = "flex";

        return new Promise((resolve) => {
            function finish(result) {
                modal.classList.add("modal-hidden");
                modal.classList.remove("modal-overlay-front");
                modal.style.display = "none";
                if (cancelBtn) {
                    cancelBtn.style.display = "";
                    cancelBtn.removeEventListener("click", onCancel);
                }
                if (confirmBtn) {
                    confirmBtn.textContent = "Confirm";
                    confirmBtn.removeEventListener("click", onOk);
                }
                modal.removeEventListener("click", onOverlay);
                document.removeEventListener("keydown", onKey);
                resolve(result);
            }
            function onOk() { finish(true); }
            function onCancel() { finish(false); }
            function onOverlay(e) { if (e.target === modal) finish(false); }
            function onKey(e) { if (e.key === "Escape") finish(false); }
            if (confirmBtn) confirmBtn.addEventListener("click", onOk);
            if (cancelBtn) cancelBtn.addEventListener("click", onCancel);
            modal.addEventListener("click", onOverlay);
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
        "import sys, traceback, builtins, importlib, ast, types\n" +
        `_cobrabyte_modules_dir = ${JSON.stringify(LESSON_MODULES_DIR)}\n` +
        "if _cobrabyte_modules_dir not in sys.path:\n" +
        "    sys.path.insert(0, _cobrabyte_modules_dir)\n" +
        "importlib.invalidate_caches()\n" +
        "class _CobrabyteStream:\n" +
        "    # print() output goes straight to the clicked block's Output box.\n" +
        "    def __init__(self, write_fn):\n" +
        "        self._write_fn = write_fn\n" +
        "    def write(self, text):\n" +
        "        text = str(text)\n" +
        "        if text:\n" +
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
        "    _val = await _cobrabyte_read_input(str(prompt) if prompt else '')\n" +
        "    if not isinstance(_val, str):\n" +
        "        raise EOFError('Input was cancelled while testing.')\n" +
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
        "try:\n" +
        "    for _dep in _cobrabyte_imported_names(_cobrabyte_user_code):\n" +
        "        await _cobrabyte_load_module(_dep)\n" +
        "    await _cobrabyte_exec_async(_cobrabyte_user_code, {'__name__': '__main__'})\n" +
        "except SystemExit:\n" +
        "    pass\n" +
        "except Exception:\n" +
        "    traceback.print_exc()\n" +
        "finally:\n" +
        "    builtins.input = _old_input\n" +
        "    sys.stdout, sys.stderr = _old_stdout, _old_stderr\n";

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
            "This loop has no way to end, so it can freeze the page. If that happens, just refresh. Run anyway?",
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

    function wireRunButton(wrapper, scopeEl) {
        const runBtn = wrapper.querySelector(".run-btn");
        const consoleBox = wrapper.querySelector(".editor-console-box");
        const outputBox = wrapper.querySelector(".editor-output-box");
        if (!runBtn || !consoleBox || !outputBox) return;

        runBtn.addEventListener("click", async function () {
            // While a run is going, this block's button is Stop and the
            // others are disabled. A run left in a closed preview is stopped.
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
                scopeEl,
                allFiles: getAllCodeBlockFiles(scopeEl),
                moduleFiles: getAllCodeBlockFiles(scopeEl, wrapper),
            });
        });
    }

    // Same steps as the Resources list preview (and lesson-content.js):
    // read-only filenames/consoles, mode selects removed, snippet-only
    // blocks hide their output pane, output boxes start empty.
    function prepareLessonContent(scopeEl) {
        scopeEl.querySelectorAll(".editor-code-filename").forEach((input) => {
            input.setAttribute("disabled", "true");
        });

        scopeEl.querySelectorAll(".editor-console-box").forEach((box) => {
            box.setAttribute("contenteditable", "false");
        });

        scopeEl.querySelectorAll(".editor-code-container").forEach((wrapper) => {
            wrapper.querySelectorAll(".editor-output-mode-select").forEach((node) => node.remove());

            const modeSelect = wrapper.querySelector(".editor-code-mode-select");
            const isSnippetOnly = modeSelect && modeSelect.value === "snippet";
            const outputPane = wrapper.querySelector(".output-card-pane");
            const consolePane = wrapper.querySelector(".console-card-pane");
            if (isSnippetOnly && outputPane) {
                outputPane.classList.add("editor-preview-hidden");
                if (consolePane) consolePane.classList.add("editor-preview-full-width");
            }

            const outputBox = wrapper.querySelector(".editor-output-box");
            if (outputBox) {
                outputBox.textContent = "";
                outputBox.setAttribute("placeholder", "Run the program first to see the output.");
            }

            wireRunButton(wrapper, scopeEl);
        });

        scopeEl.querySelectorAll(".editor-terminal-box").forEach((box) => {
            box.setAttribute("contenteditable", "false");
        });
    }

    function previewLesson() {
        const api = window.cobraByteLessonEditor;
        if (!api) return;

        // 1. Same checks as Save - stops here if anything is missing.
        if (!api.validate()) return;

        // 2. Copy filename / mode values into the HTML first, the same
        //    fix Save runs before it captures the editor's content.
        if (typeof window.cobraByteSyncInteractiveBlocks === "function") {
            window.cobraByteSyncInteractiveBlocks();
        }

        const editor = document.getElementById("editorContent");
        const isNew = !fieldValue("resourceIdInput");
        const body = openPreviewModal(
            fieldValue("lessonNameInput"),
            getNoticeText("lesson", isNew, api.isDirty())
        );

        body.classList.add("lesson-content-body");
        const html = editor ? editor.innerHTML.trim() : "";
        if (!html) {
            body.appendChild(el("p", "editor-preview-empty", "No content yet."));
            return;
        }
        body.innerHTML = html;
        prepareLessonContent(body);
    }

    // ============================================================
    // ACTIVITY - view only. Same learner classes the Publishing
    // preview uses; every control is disabled.
    // ============================================================
    function activityHost(labelText) {
        const host = el("div", "activity-host editor-preview-activity");
        host.appendChild(el("p", "activity-progress-label", labelText));
        return host;
    }

    function renderMultipleChoice(questions, body) {
        const total = questions.length;
        questions.forEach((q, idx) => {
            const host = activityHost(`Question ${idx + 1} of ${total}`);
            host.appendChild(el("h4", "activity-question-text", q.text || "(No question text yet)"));

            const list = el("div", "activity-options-list");
            q.options.forEach((opt) => {
                const btn = el("button", "activity-option-btn", opt.text || "(Empty option)");
                btn.type = "button";
                btn.disabled = true;
                list.appendChild(btn);
            });
            host.appendChild(list);
            body.appendChild(host);
        });
    }

    function renderFillBlanks(items, body) {
        const total = items.length;
        items.forEach((item, idx) => {
            const host = activityHost(`Item ${idx + 1} of ${total}`);
            host.appendChild(el("p", "activity-question-text", item.content || "(No sentence yet)"));

            const input = el("input", "activity-fillblank-input");
            input.type = "text";
            input.placeholder = "Type your answer...";
            input.disabled = true;
            host.appendChild(input);
            body.appendChild(host);
        });
    }

    function renderFlashcards(cards, body) {
        const total = cards.length;
        cards.forEach((card, idx) => {
            const host = activityHost(`Card ${idx + 1} of ${total}`);
            const front = card.front || "(No front text yet)";
            const back = card.back || "(No back text yet)";

            const box = el("div", "activity-flashcard-box editor-preview-flashcard", front);
            let flipped = false;
            box.addEventListener("click", () => {
                flipped = !flipped;
                box.textContent = flipped ? back : front;
            });
            host.appendChild(box);
            host.appendChild(el("p", "activity-flashcard-hint", "Click the card to flip it."));
            body.appendChild(host);
        });
    }

    function previewActivity() {
        const api = window.cobraByteActivityEditor;
        if (!api) return;

        if (!api.validate()) return;

        const data = api.collect();
        const isNew = !fieldValue("activityIdInput");
        const body = openPreviewModal(
            fieldValue("activityTitle"),
            getNoticeText("activity", isNew, api.isDirty())
        );

        body.appendChild(el("p", "lesson-step-eyebrow", data.type || "Activity"));

        let items = [];
        let emptyText = "";
        if (data.type === "Multiple Choice" || data.type === "Quiz") {
            items = data.questions;
            emptyText = "No questions added yet.";
            if (items.length) renderMultipleChoice(items, body);
        } else if (data.type === "Fill in the Blanks") {
            items = data.fillBlanks;
            emptyText = "No sentences added yet.";
            if (items.length) renderFillBlanks(items, body);
        } else if (data.type === "Flashcards") {
            items = data.flashcards;
            emptyText = "No flashcards added yet.";
            if (items.length) renderFlashcards(items, body);
        }

        if (!items.length) {
            body.appendChild(el("p", "editor-preview-empty", emptyText || "Nothing to preview yet."));
        }
    }

    // ============================================================
    // EXERCISE - view only. Mirrors the learner's exercise step
    // (lesson-content.html): title, Situation / Problem / Clue,
    // code + output panes. Run and Submit are disabled.
    // ============================================================
    let exerciseDirty = false;

    function trackExerciseChanges() {
        const form = document.getElementById("createExerciseForm");
        if (!form) return;
        // Only real user actions count (isTrusted) - the dropdowns
        // filling themselves on page load never mark it as changed.
        const mark = (e) => { if (e.isTrusted) exerciseDirty = true; };
        form.addEventListener("input", mark);
        form.addEventListener("change", mark);
        document.addEventListener("click", (e) => {
            if (!e.isTrusted) return;
            if (e.target.closest("#addTestCaseBtn, .test-case-delete-btn")) exerciseDirty = true;
        });
    }

    function exercisePromptLine(label, value) {
        const p = el("p");
        p.appendChild(el("strong", "", label + " "));
        p.appendChild(el("span", "", value || "-"));
        return p;
    }

    function exercisePane(headText, boxText, withRunBtn) {
        const pane = el("div", "exercise-pane");
        const head = el("div", "exercise-pane-head", headText);
        if (withRunBtn) {
            const runBtn = el("button", "exercise-run-btn", "Run");
            runBtn.type = "button";
            runBtn.disabled = true;
            runBtn.title = "Disabled in preview";
            head.appendChild(runBtn);
        }
        pane.appendChild(head);
        const box = el("pre", withRunBtn ? "exercise-code-box" : "exercise-output-box", boxText);
        pane.appendChild(box);
        return pane;
    }

    function previewExercise() {
        if (typeof validateExerciseForm !== "function") return;

        if (!validateExerciseForm(false)) return;

        const isNew = !fieldValue("exerciseIdInput");
        const body = openPreviewModal(
            fieldValue("exerciseTitle"),
            getNoticeText("exercise", isNew, exerciseDirty)
        );

        body.appendChild(el("p", "lesson-step-eyebrow", "Coding Exercise"));
        body.appendChild(el("h2", "exercise-title", fieldValue("exerciseTitle")));

        const prompt = el("div", "exercise-prompt");
        prompt.appendChild(exercisePromptLine("Situation:", fieldValue("problemSituation")));
        prompt.appendChild(exercisePromptLine("Problem:", fieldValue("problemQuestion")));
        const clue = el("p", "exercise-clue");
        clue.innerHTML = '<i class="fa-solid fa-lightbulb"></i> ' + escapeHtml(fieldValue("problemClue") || "-");
        prompt.appendChild(clue);
        body.appendChild(prompt);

        const grid = el("div", "exercise-editor-grid");
        grid.appendChild(exercisePane("Your Code", "# Write your code here", true));
        grid.appendChild(exercisePane("Output", "Run your code to see the output.", false));
        body.appendChild(grid);

        const footer = el("div", "lesson-step-footer");
        const submitBtn = el("button", "lesson-step-btn", "Submit");
        submitBtn.type = "button";
        submitBtn.disabled = true;
        submitBtn.title = "Disabled in preview";
        footer.appendChild(submitBtn);
        body.appendChild(footer);
    }

    // ------------------------------------------------------------
    // Wire whichever Preview button this page has.
    // ------------------------------------------------------------
    document.addEventListener("DOMContentLoaded", () => {
        const lessonBtn = document.getElementById("previewLessonBtn");
        const activityBtn = document.getElementById("previewActivityBtn");
        const exerciseBtn = document.getElementById("previewExerciseBtn");

        if (lessonBtn) {
            lessonBtn.addEventListener("click", (e) => {
                e.preventDefault();
                previewLesson();
            });
        }
        if (activityBtn) {
            activityBtn.addEventListener("click", (e) => {
                e.preventDefault();
                previewActivity();
            });
        }
        if (exerciseBtn) {
            trackExerciseChanges();
            exerciseBtn.addEventListener("click", (e) => {
                e.preventDefault();
                previewExercise();
            });
        }
    });
})();