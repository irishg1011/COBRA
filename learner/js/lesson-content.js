document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = "http://127.0.0.1:5000";
    const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
    const LESSON_MODULES_DIR = "/lesson_modules";

    const urlParams = new URLSearchParams(window.location.search);
    const resourceId = urlParams.get('resource_id');

    const lessonLoading = document.getElementById('lessonLoading');
    const lessonError = document.getElementById('lessonError');
    const lessonResourceTitle = document.getElementById('lessonResourceTitle');
    const lessonContentBody = document.getElementById('lessonContentBody');
    const lessonCompleteRow = document.getElementById('lessonCompleteRow');
    const markCompleteBtn = document.getElementById('markCompleteBtn');
    const markCompleteConfirm = document.getElementById('markCompleteConfirm');
    const backToLessonsLink = document.getElementById('backToLessonsLink');

    let activeOutputBox = null;

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
            const modeSelect = wrapper.querySelector(".editor-code-mode-select");
            const isSnippetOnly = modeSelect && modeSelect.value === "snippet";
            const outputPane = wrapper.querySelector(".output-card-pane");
            const consolePane = wrapper.querySelector(".console-card-pane");
            if (isSnippetOnly && outputPane) {
                outputPane.style.display = "none";
                if (consolePane) consolePane.style.gridColumn = "1 / -1";
            }
            wireRunButton(wrapper);
        });

        lessonContentBody.querySelectorAll(".editor-terminal-box").forEach((box) => {
            box.setAttribute("contenteditable", "false");
        });
    }

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

            lessonLoading.style.display = 'none';
            lessonResourceTitle.textContent = data.resource_title;
            lessonResourceTitle.style.display = 'block';
            lessonContentBody.innerHTML = data.content_html || '';

            if (data.cat_id) {
                backToLessonsLink.href = `/lessons?cat_id=${data.cat_id}`;
            }

            preparePageForLearner();
            lessonCompleteRow.style.display = 'flex';

        } catch (err) {
            console.error('Error loading lesson:', err);
            lessonLoading.style.display = 'none';
            lessonError.style.display = 'block';
        }
    }

    if (markCompleteBtn) {
        markCompleteBtn.addEventListener('click', async () => {
            markCompleteBtn.disabled = true;
            try {
                const response = await fetch(`${API_BASE_URL}/api/lesson-content/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ resource_id: resourceId })
                });
                const result = await response.json();
                if (result.success) {
                    markCompleteBtn.style.display = 'none';
                    markCompleteConfirm.style.display = 'inline-flex';
                } else {
                    alert(result.message || 'Could not mark this lesson complete.');
                    markCompleteBtn.disabled = false;
                }
            } catch (err) {
                alert('Could not reach the server.');
                markCompleteBtn.disabled = false;
            }
        });
    }

    loadLesson();
});