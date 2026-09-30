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
        if (existing) existing.remove();

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
    let activeOutputBox = null;

    function getPyodideInstance() {
        if (!pyodideLoadPromise) {
            if (typeof loadPyodide !== "function") {
                return Promise.reject(new Error("Pyodide script did not load."));
            }
            pyodideLoadPromise = loadPyodide({ indexURL: PYODIDE_INDEX_URL });
        }
        return pyodideLoadPromise;
    }

    // Inline input() prompt inside the running block's output box.
    function showPreviewInputPrompt(promptText) {
        return new Promise((resolve) => {
            const outputBox = activeOutputBox;
            if (!outputBox) { resolve(""); return; }

            const promptSpan = el("span", "editor-terminal-prompt-text", promptText || "");
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
    window.cobraByteEditorPreviewInput = showPreviewInputPrompt;

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

    function getAllCodeBlockFiles(scopeEl) {
        const files = [];
        scopeEl.querySelectorAll(".editor-code-container").forEach((wrapper) => {
            const filenameInput = wrapper.querySelector(".editor-code-filename");
            const consoleBox = wrapper.querySelector(".editor-console-box");
            files.push({
                filename: filenameInput ? filenameInput.value.trim() : "",
                code: consoleBox ? consoleBox.innerText : "",
            });
        });
        return files;
    }

    async function runPythonCode(code, files, currentFilename) {
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
                "    _val = await _cobrabyte_js.cobraByteEditorPreviewInput(str(prompt) if prompt else '')\n" +
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

    function wireRunButton(wrapper, scopeEl) {
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

            const files = getAllCodeBlockFiles(scopeEl);
            const currentFilename = filenameInput ? filenameInput.value.trim() : "";
            const output = await runPythonCode(code, files, currentFilename);

            activeOutputBox = null;
            outputBox.textContent = output.trim();

            runBtn.disabled = false;
            runBtn.innerHTML = originalHtml;
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