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
    const snippetsSeeAllBtn = document.getElementById('snippetsSeeAllBtn');
    const snippetsSearchInput = document.getElementById('snippetsSearchInput');

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
    // feat/python-runner-no-freeze: Python runs in a background worker
    // (static/py-runner.js -> CobraPy), so the page never freezes. A program
    // is stopped after 15 seconds of running or 1,000 output lines, and the
    // Stop button ends it at any time.
    // ===============================
    const CobraPy = window.CobraPy;
    const SANDBOX_MAX_SECONDS = 15;

    // Exec-time tracking for sandbox_runs_tbl.exec_time_ms.
    // inputWaitMs adds up how long the program sat paused on input()
    // prompts, so time spent typing is subtracted from the run time.
    // lastExecTimeMs is null when the run never actually started
    // (e.g. Pyodide failed to load) so no fake time gets logged.
    let inputWaitMs = 0;
    let lastExecTimeMs = null;

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

            // The prompt text itself was already printed (live output).
            const promptSpan = document.createElement('span');
            promptSpan.className = 'terminal-prompt-text';
            promptSpan.textContent = '';

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'terminal-inline-input';
            input.autocomplete = 'off';
            input.spellcheck = false;

            outputBody.appendChild(promptSpan);
            outputBody.appendChild(input);
            outputBody.scrollTop = outputBody.scrollHeight;
            input.focus();

            const waitStartedAt = performance.now();

            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    inputWaitMs += performance.now() - waitStartedAt;
                    // The answer comes back as live output - the field goes.
                    promptSpan.remove();
                    input.remove();
                    resolve(input.value);
                }
            });
        });
    }
    // Live output while the program runs (the final text replaces it when
    // it finishes - the same text as before).
    function appendLiveOutput(text) {
        if (!outputBody || !text) return;
        if (outputPlaceholder && outputPlaceholder.parentNode === outputBody) {
            outputBody.removeChild(outputPlaceholder);
        }
        let live = outputBody.querySelector('.output-live');
        if (!live || live !== outputBody.lastElementChild) {
            live = document.createElement('span');
            live.className = 'output-line output-live';
            outputBody.appendChild(live);
        }
        live.appendChild(document.createTextNode(text));
        outputBody.scrollTop = outputBody.scrollHeight;
    }

    // Runs `code` as Python in the background worker ("sandbox" mode - the
    // same program as before, now with the safety guard), capturing stdout
    // AND stderr into one string. Never throws. A stopped run returns the
    // output so far + "Program stopped." (or the backup limit's message).
    async function runPythonCode(code) {
        lastExecTimeMs = null;
        inputWaitMs = 0;
        let execStartedAt = null;
        let liveText = '';
        const outcome = await CobraPy.run({
            mode: 'sandbox', code: code || '', maxSeconds: SANDBOX_MAX_SECONDS, live: true,
            onStarted: () => { execStartedAt = performance.now(); clearConsole(); },
            onOutput: (text) => { liveText += text; appendLiveOutput(text); },
            onInput: showInlineInputPrompt,
        });
        if (execStartedAt !== null) lastExecTimeMs = computeExecTimeMs(execStartedAt);
        if (outcome.ok) return outcome.result;
        if (outcome.loadFailed) return CobraPy.messages.LOAD_FAILED_MESSAGE;
        if (outcome.stopped || outcome.killed) {
            return liveText + (liveText && !liveText.endsWith('\n') ? '\n' : '') + outcome.message;
        }
        return 'Error running code: ' + outcome.message;
    }

    // Run time = total time minus time spent paused on input() prompts,
    // rounded to 3 decimals to match the DECIMAL(10,3) column.
    function computeExecTimeMs(startedAt) {
        const ms = performance.now() - startedAt - inputWaitMs;
        return Math.round(Math.max(0, ms) * 1000) / 1000;
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

            if (CobraPy.isRunning()) return;
            // "Running... 3s" + Stop; the page stays usable the whole time.
            const done = CobraPy.runningButton(runCodeBtn, { onStop: () => CobraPy.stop() });
            if (CobraPy.isReady()) clearConsole();
            else showOutput(CobraPy.messages.STARTING_MESSAGE, true);

            const output = await runPythonCode(code);
            done();
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
                    exec_time_ms: lastExecTimeMs,
                }),
            }).catch(() => { /* best-effort only */ });
        });

        // This page is all about code: get Python ready right away.
        CobraPy.preload();
        CobraPy.chip(runCodeBtn);
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
    // from the server on page load. Task #121: the panel only ever
    // previews the SNIPPET_PREVIEW_LIMIT most recent snippets by
    // default to keep the sandbox layout clean; "See All" expands the
    // SAME card in place (never a separate popup) to show every saved
    // snippet plus a search box, since the full list can run up to 50.
    // Every row - collapsed or expanded - gets Load/Copy/Delete
    // buttons via one shared snippetRowHtml()/wireSnippetRowActions()
    // pair so the two states can never drift out of sync.
    // ===============================
    const SNIPPET_PREVIEW_LIMIT = 5;
    let savedSnippets = [];
    let snippetsExpanded = false;
    let snippetsSearchTerm = '';

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function snippetRowHtml(snippet) {
        return `
            <li class="snippet-item" data-snippet-id="${snippet.snippet_id}">
                <div class="snippet-info">
                    <span class="snippet-label">${escapeHtml(snippet.title)}</span>
                    <span class="snippet-time">${escapeHtml(snippet.updated_at || snippet.created_at)}</span>
                </div>
                <div class="snippet-actions">
                    <button type="button" class="snippet-action-btn snippet-load-btn" data-id="${snippet.snippet_id}" title="Load into editor"><i class="fa-solid fa-arrow-up-from-bracket"></i></button>
                    <button type="button" class="snippet-action-btn snippet-copy-btn" data-id="${snippet.snippet_id}" title="Copy code"><i class="fa-regular fa-copy"></i></button>
                    <button type="button" class="snippet-action-btn snippet-delete-btn" data-id="${snippet.snippet_id}" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            </li>
        `;
    }

    // Delegated once on the (single, shared) list container - works
    // for rows re-rendered later (search filtering, expand/collapse,
    // deletions) without ever re-attaching listeners.
    function wireSnippetRowActions(container) {
        if (!container || container.dataset.actionsWired) return;
        container.dataset.actionsWired = 'true';
        container.addEventListener('click', (e) => {
            const loadBtn = e.target.closest('.snippet-load-btn');
            const copyBtn = e.target.closest('.snippet-copy-btn');
            const deleteBtn = e.target.closest('.snippet-delete-btn');

            if (loadBtn) {
                loadSnippet(loadBtn.dataset.id);
            } else if (copyBtn) {
                copySnippetCode(copyBtn.dataset.id, copyBtn);
            } else if (deleteBtn) {
                confirmDeleteSnippet(deleteBtn.dataset.id);
            }
        });
    }

    function renderSnippets() {
        if (!snippetsList || !snippetsEmpty || !snippetsCount) return;

        snippetsCount.textContent = `${savedSnippets.length} saved`;
        if (snippetsSeeAllBtn) {
            snippetsSeeAllBtn.style.display = savedSnippets.length > SNIPPET_PREVIEW_LIMIT ? '' : 'none';
            snippetsSeeAllBtn.textContent = snippetsExpanded ? 'Show Less' : 'See All';
        }
        if (snippetsSearchInput) {
            snippetsSearchInput.style.display = snippetsExpanded ? '' : 'none';
        }
        snippetsList.classList.toggle('snippets-list-expanded', snippetsExpanded);

        const term = snippetsSearchTerm.trim().toLowerCase();
        const source = (snippetsExpanded && term)
            ? savedSnippets.filter((s) => s.title.toLowerCase().includes(term))
            : savedSnippets;
        const visible = snippetsExpanded ? source : source.slice(0, SNIPPET_PREVIEW_LIMIT);

        if (visible.length === 0) {
            snippetsEmpty.style.display = 'block';
            snippetsEmpty.textContent = term
                ? 'No snippets match your search.'
                : 'No saved snippets yet. Write some code and click "Save Code".';
            snippetsList.innerHTML = '';
            return;
        }

        snippetsEmpty.style.display = 'none';
        snippetsList.innerHTML = visible.map(snippetRowHtml).join('');
        wireSnippetRowActions(snippetsList);
    }

    if (snippetsSeeAllBtn) {
        snippetsSeeAllBtn.addEventListener('click', () => {
            snippetsExpanded = !snippetsExpanded;
            if (!snippetsExpanded) {
                snippetsSearchTerm = '';
                if (snippetsSearchInput) snippetsSearchInput.value = '';
            }
            renderSnippets();
        });
    }

    if (snippetsSearchInput) {
        snippetsSearchInput.addEventListener('input', (e) => {
            snippetsSearchTerm = e.target.value;
            renderSnippets();
        });
    }

    // ------------------------------------------------------------
    // Copy - fetches the snippet's full code (the list endpoint only
    // carries title/dates, not code) then writes it to the clipboard.
    // ------------------------------------------------------------
    async function copySnippetCode(snippetId, btn) {
        try {
            const response = await fetch(`/api/sandbox/snippets/${snippetId}`, { credentials: 'include' });
            const result = await response.json();
            if (!result.success) return;

            await navigator.clipboard.writeText(result.snippet.code);
            // feat/copy-paste-block: copied inside CobraByte, so the editor accepts it.
            if (window.CobraClipboard) window.CobraClipboard.remember(result.snippet.code);

            if (btn) {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => { btn.innerHTML = originalHtml; }, 1200);
            }
        } catch (err) {
            // Clipboard permission denied or snippet fetch failed -
            // not worth interrupting the learner over; they can just
            // use Load instead.
        }
    }

    // ------------------------------------------------------------
    // Delete - small custom confirm built at runtime (this project
    // never uses native confirm()/alert()), reusing the same
    // .sandbox-modal-overlay/.sandbox-modal-card classes as "See All"
    // for visual consistency.
    // ------------------------------------------------------------
    function confirmDeleteSnippet(snippetId) {
        const snippet = savedSnippets.find((s) => String(s.snippet_id) === String(snippetId));
        const label = snippet ? snippet.title : 'this snippet';

        const overlay = document.createElement('div');
        overlay.id = 'deleteSnippetConfirmModal';
        overlay.className = 'sandbox-modal-overlay';
        overlay.style.zIndex = '2100'; // above the "See All" modal, if open
        overlay.innerHTML = `
            <div class="sandbox-modal-card" style="max-width: 380px;">
                <div class="sandbox-modal-header">
                    <h3>Delete Snippet?</h3>
                    <button type="button" class="sandbox-modal-close-btn" id="deleteSnippetCloseBtn" title="Close">&times;</button>
                </div>
                <div class="sandbox-modal-body">
                    <p style="margin: 0 0 20px; color: #475569; font-size: 14px;">Delete "<strong>${escapeHtml(label)}</strong>"? This can't be undone.</p>
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button type="button" class="sandbox-modal-btn-cancel" id="deleteSnippetCancelBtn">Cancel</button>
                        <button type="button" class="sandbox-modal-btn-danger" id="deleteSnippetConfirmBtn">Delete</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        function closeThis() { overlay.remove(); }
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeThis(); });
        overlay.querySelector('#deleteSnippetCloseBtn').addEventListener('click', closeThis);
        overlay.querySelector('#deleteSnippetCancelBtn').addEventListener('click', closeThis);
        overlay.querySelector('#deleteSnippetConfirmBtn').addEventListener('click', async () => {
            const confirmBtn = overlay.querySelector('#deleteSnippetConfirmBtn');
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Deleting...';

            try {
                const response = await fetch(`/api/sandbox/snippets/${snippetId}/delete`, {
                    method: 'POST',
                    credentials: 'include',
                });
                const result = await response.json();
                if (result.success) {
                    savedSnippets = savedSnippets.filter((s) => String(s.snippet_id) !== String(snippetId));
                    if (String(currentSnippetId) === String(snippetId)) currentSnippetId = null;
                    renderSnippets();
                }
            } catch (err) {
                // Best-effort - the list simply won't reflect the
                // deletion if this failed; the learner can retry.
            }
            closeThis();
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

            // Nothing typed (or only spaces / blank lines): don't save an empty snippet.
            if (!codeEditor.value.trim()) {
                showOutput('Write some code first before saving.', true);
                saveCodeBtn.disabled = true;
                saveCodeBtn.innerHTML = 'Nothing to save';
                setTimeout(() => {
                    saveCodeBtn.innerHTML = originalHtml;
                    saveCodeBtn.disabled = false;
                }, 1600);
                codeEditor.focus();
                return;
            }

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