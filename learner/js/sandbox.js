document.addEventListener('DOMContentLoaded', () => {

    const codeEditor = document.getElementById('codeEditor');
    const lineCountLabel = document.getElementById('lineCountLabel');
    const runCodeBtn = document.getElementById('runCodeBtn');
    const resetCodeBtn = document.getElementById('resetCodeBtn');
    const saveCodeBtn = document.getElementById('saveCodeBtn');
    const clearOutputBtn = document.getElementById('clearOutputBtn');
    const outputBody = document.getElementById('outputBody');
    const outputPlaceholder = document.getElementById('outputPlaceholder');
    const snippetsList = document.getElementById('snippetsList');
    const snippetsEmpty = document.getElementById('snippetsEmpty');
    const snippetsCount = document.getElementById('snippetsCount');

    // Tracks which saved snippet (if any) the current editor contents
    // came from - null means "freshly typed, never saved/loaded this
    // session". Used so Save Code UPDATEs that same row instead of
    // always inserting a new one, and so Run Code can link its log
    // entry (sandbox_runs_tbl.snippet_id) back to it.
    let currentSnippetId = null;

    // ===============================
    // Line count
    // ===============================
    function updateLineCount() {
        if (!codeEditor || !lineCountLabel) return;
        const lines = codeEditor.value.split('\n').length;
        lineCountLabel.textContent = `${lines} line${lines === 1 ? '' : 's'}`;
    }

    if (codeEditor) {
        codeEditor.addEventListener('input', updateLineCount);
        updateLineCount();
    }

    // ===============================
    // Run Code - real Python via Pyodide (Python compiled to
    // WebAssembly, running entirely in THIS browser tab, never sent
    // to the server). This is the exact same runtime and inline-
    // input pattern already used by the Manage Learning Resources
    // lesson editor's Interactive Exercise Console blocks (see
    // editor-toolbar.js's runPythonCode/showTerminalInputPrompt) -
    // ported here rather than re-invented, so both places behave
    // identically.
    //
    // When the learner's code calls input(), execution genuinely
    // pauses and an inline text field appears right after the prompt
    // text inside the console itself - typing a value and pressing
    // Enter resumes the program with that value, exactly like a real
    // terminal.
    //
    // KNOWN LIMITATION: Pyodide runs on the page's main JS thread, so
    // an infinite loop will freeze this tab until it's closed/
    // reloaded - there's no "Stop" button that can interrupt it once
    // started (the same trade-off the lesson editor's own Console
    // already accepts). Keep an eye on infinite loops.
    // ===============================
    const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
    let pyodideLoadPromise = null;

    function getPyodideInstance() {
        if (!pyodideLoadPromise) {
            if (typeof loadPyodide !== 'function') {
                return Promise.reject(new Error('Pyodide script did not load.'));
            }
            pyodideLoadPromise = loadPyodide({ indexURL: PYODIDE_INDEX_URL });
        }
        return pyodideLoadPromise;
    }

    // Renders an inline prompt + input field directly into the
    // console, right where output is currently being written - not a
    // separate input box below it. Resolves with whatever the learner
    // typed once they press Enter.
    function showInlineInputPrompt(promptText) {
        return new Promise((resolve) => {
            if (!outputBody) { resolve(''); return; }

            if (outputPlaceholder && outputPlaceholder.parentNode === outputBody) {
                outputBody.removeChild(outputPlaceholder);
            }

            const promptSpan = document.createElement('span');
            promptSpan.className = 'terminal-prompt-text';
            promptSpan.textContent = promptText || '';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'terminal-inline-input';
            input.autocomplete = 'off';
            input.spellcheck = false;

            outputBody.appendChild(promptSpan);
            outputBody.appendChild(input);
            outputBody.scrollTop = outputBody.scrollHeight;
            input.focus();

            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.disabled = true;
                    resolve(input.value);
                }
            });
        });
    }
    // Pyodide's `import js as _cobrabyte_js` reaches this as
    // _cobrabyte_js.cobraByteSandboxInput(...)
    window.cobraByteSandboxInput = showInlineInputPrompt;

    // Runs `code` as Python, capturing everything written to stdout
    // AND stderr into one string - never throws; any failure (Pyodide
    // unreachable, a genuine error in the learner's code) comes back
    // as readable text instead. input() is rewritten (via an AST
    // transform, so it works no matter where in the code it's called,
    // not just at the top level) into an awaitable call that pauses
    // the whole script and shows the inline prompt above.
    async function runPythonCode(code) {
        let pyodide;
        try {
            pyodide = await getPyodideInstance();
        } catch (err) {
            return 'Could not load the Python runtime. Check your internet connection and try again.';
        }

        pyodide.globals.set('_cobrabyte_user_code', code || '');

        try {
            const result = await pyodide.runPythonAsync(
                "import sys, io, traceback, builtins, ast\n" +
                "import js as _cobrabyte_js\n" +
                "_cobrabyte_stdout = io.StringIO()\n" +
                "_cobrabyte_stderr = io.StringIO()\n" +
                "_old_stdout, _old_stderr = sys.stdout, sys.stderr\n" +
                "_old_input = builtins.input\n" +
                "sys.stdout, sys.stderr = _cobrabyte_stdout, _cobrabyte_stderr\n" +
                "async def _cobrabyte_input(prompt=''):\n" +
                "    if prompt:\n" +
                "        sys.stdout.write(str(prompt))\n" +
                "    _val = await _cobrabyte_js.cobraByteSandboxInput(str(prompt) if prompt else '')\n" +
                "    if _val is None:\n" +
                "        raise EOFError('Input was cancelled.')\n" +
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
                "        name='_cobrabyte_main',\n" +
                "        args=ast.arguments(posonlyargs=[], args=[], vararg=None, kwonlyargs=[], kw_defaults=[], kwarg=None, defaults=[]),\n" +
                "        body=body, decorator_list=[], returns=None,\n" +
                "    )\n" +
                "    module_ast = ast.Module(body=[func], type_ignores=[])\n" +
                "    ast.fix_missing_locations(module_ast)\n" +
                "    exec(compile(module_ast, '<sandbox>', 'exec'), mod_globals)\n" +
                "    await mod_globals['_cobrabyte_main']()\n" +
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
            return 'Error running code: ' + (err && err.message ? err.message : String(err));
        }
    }

    function clearConsole() {
        if (!outputBody) return;
        outputBody.innerHTML = '';
        if (outputPlaceholder) outputBody.appendChild(outputPlaceholder);
    }

    function showOutput(message, isNote = false) {
        clearConsole();
        if (!outputBody) return;
        if (outputPlaceholder && outputPlaceholder.parentNode === outputBody) {
            outputBody.removeChild(outputPlaceholder);
        }
        const p = document.createElement('p');
        p.className = isNote ? 'output-placeholder' : 'output-line';
        p.textContent = message;
        outputBody.appendChild(p);
    }

    if (runCodeBtn) {
        runCodeBtn.addEventListener('click', async () => {
            if (!codeEditor) return;

            const code = codeEditor.value;
            if (!code.trim()) {
                showOutput('Write some code first.', true);
                return;
            }

            const originalHtml = runCodeBtn.innerHTML;
            runCodeBtn.disabled = true;
            runCodeBtn.innerHTML = pyodideLoadPromise ? 'Running...' : 'Loading Python...';
            clearConsole();

            const output = await runPythonCode(code);
            const trimmed = (output || '').trim();
            const isError = trimmed.includes('Traceback (most recent call last)');

            if (outputBody) {
                // Task fix: REPLACE the console's content with the final
                // captured text, rather than appending it after the
                // live inline prompt/input elements shown during
                // execution - appending caused "name: emman" (shown
                // live while paused on input()) to be immediately
                // followed by the SAME "name: emman" again as part of
                // the full captured output, doubling it. Matches
                // editor-toolbar.js's own `outputBox.textContent =
                // output.trim()` for this exact reason.
                outputBody.innerHTML = '';
                if (trimmed) {
                    const p = document.createElement('p');
                    p.className = isError ? 'output-line output-error' : 'output-line';
                    p.textContent = trimmed;
                    outputBody.appendChild(p);
                } else {
                    const p = document.createElement('p');
                    p.className = 'output-placeholder';
                    p.textContent = 'Program finished with no output.';
                    outputBody.appendChild(p);
                }
            }

            // Fire-and-forget: logs this execution to sandbox_runs_tbl
            // (see sandbox_runs.py) for a future run-history view -
            // never awaited/blocking, never shown as an error if it
            // fails, since a logging hiccup shouldn't look like the
            // learner's own code failed.
            fetch('/api/sandbox/log-run', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    output: trimmed,
                    status: isError ? 'error' : 'success',
                    snippet_id: currentSnippetId,
                }),
            }).catch(() => { /* best-effort only */ });

            runCodeBtn.disabled = false;
            runCodeBtn.innerHTML = originalHtml;
        });
    }

    // ===============================
    // Reset - fully erases the code editor AND the Console/Output
    // panel, back to a genuinely blank slate. Also forgets which saved
    // snippet (if any) was loaded, so the NEXT Save Code creates a
    // fresh snippet rather than overwriting the one just abandoned.
    // ===============================
    if (resetCodeBtn && codeEditor) {
        resetCodeBtn.addEventListener('click', () => {
            codeEditor.value = '';
            updateLineCount();
            clearConsole();
            currentSnippetId = null;
            codeEditor.focus();
        });
    }

    // ===============================
    // Clear Output
    // ===============================
    if (clearOutputBtn) {
        clearOutputBtn.addEventListener('click', clearConsole);
    }

    // ===============================
    // Saved Snippets - persisted to the learner's OWN account (see
    // sandbox_snippets.py), never to the local file explorer. Loaded
    // from the server on page load, and clicking a saved snippet
    // loads its full code back into the editor.
    // ===============================
    let savedSnippets = [];

    function renderSnippets() {
        if (!snippetsList || !snippetsEmpty || !snippetsCount) return;

        snippetsCount.textContent = `${savedSnippets.length} saved`;

        if (savedSnippets.length === 0) {
            snippetsEmpty.style.display = 'block';
            snippetsList.innerHTML = '';
            return;
        }

        snippetsEmpty.style.display = 'none';
        snippetsList.innerHTML = '';

        savedSnippets.forEach((snippet) => {
            const li = document.createElement('li');
            li.className = 'snippet-item';
            li.style.cursor = 'pointer';
            li.title = 'Click to load this snippet into the editor';

            const label = document.createElement('span');
            label.textContent = snippet.title;

            const time = document.createElement('span');
            time.className = 'snippet-time';
            time.textContent = snippet.created_at;

            li.appendChild(label);
            li.appendChild(time);
            li.addEventListener('click', () => loadSnippet(snippet.snippet_id));
            snippetsList.appendChild(li);
        });
    }

    async function fetchSavedSnippets() {
        try {
            const response = await fetch('/api/sandbox/snippets', { credentials: 'include' });
            if (!response.ok) return;
            const result = await response.json();
            if (result.success) {
                savedSnippets = result.snippets || [];
                renderSnippets();
            }
        } catch (err) {
            // Silently leave the list empty - not worth blocking the
            // page over a snippets-list fetch failure.
        }
    }

    async function loadSnippet(snippetId) {
        try {
            const response = await fetch(`/api/sandbox/snippets/${snippetId}`, { credentials: 'include' });
            const result = await response.json();
            if (result.success && codeEditor) {
                codeEditor.value = result.snippet.code;
                updateLineCount();
                currentSnippetId = result.snippet.snippet_id;
                codeEditor.focus();
            }
        } catch (err) {
            // Ignore - the learner can just try clicking it again.
        }
    }

    if (saveCodeBtn && codeEditor) {
        saveCodeBtn.addEventListener('click', async () => {
            const originalHtml = saveCodeBtn.innerHTML;
            saveCodeBtn.disabled = true;
            saveCodeBtn.innerHTML = 'Saving...';

            try {
                const response = await fetch('/api/sandbox/save', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: codeEditor.value, snippet_id: currentSnippetId }),
                });

                if (response.status === 401) {
                    saveCodeBtn.innerHTML = 'Please log in';
                    setTimeout(() => { saveCodeBtn.innerHTML = originalHtml; }, 1800);
                    return;
                }

                const result = await response.json();

                if (!result.success) {
                    saveCodeBtn.innerHTML = 'Could not save';
                    setTimeout(() => { saveCodeBtn.innerHTML = originalHtml; }, 1800);
                    return;
                }

                // Task fix: UPDATE the existing entry in the list in
                // place when re-saving the same loaded snippet, instead
                // of always unshifting a new one (which used to create
                // a visible duplicate for what's really the same
                // snippet, just edited).
                currentSnippetId = result.snippet.snippet_id;
                const existingIndex = savedSnippets.findIndex(s => s.snippet_id === result.snippet.snippet_id);
                if (existingIndex !== -1) {
                    savedSnippets.splice(existingIndex, 1);
                }
                savedSnippets.unshift(result.snippet);
                renderSnippets();

                saveCodeBtn.innerHTML = 'Saved!';
                setTimeout(() => { saveCodeBtn.innerHTML = originalHtml; }, 1400);
            } catch (err) {
                saveCodeBtn.innerHTML = 'Could not save';
                setTimeout(() => { saveCodeBtn.innerHTML = originalHtml; }, 1800);
            } finally {
                saveCodeBtn.disabled = false;
            }
        });
    }

    fetchSavedSnippets();
});