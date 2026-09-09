/**
 * admin-learning-resources.js - Task #37, #38, #39, #40 & #43: Learning
 * Resources Live Search + Dynamic Type Filter + Created/Updated Date
 * Filters + Publish/Unpublish Actions
 * --------------------------------------------------------------------
 * Wires up the Learning Resources toolbar - the search box, the
 * database-driven "All Types" dropdown (Task #38), and the Created At /
 * Updated At date filters (Task #40) - to the backend endpoint
 * (/admin/learning-resources/data) so the table updates live with no
 * page reload.
 *
 * Mirrors admin-manage-course.js's search/filter/date-filter/pagination
 * pattern intentionally, for consistency across the admin tables:
 *   - The initial rows are already rendered server-side by Flask/Jinja
 *     when the page loads (see admin_routes.py: learning_resources()
 *     calling get_learning_resources_overview()), so this script does
 *     NOT fire a redundant fetch on DOMContentLoaded - it only reacts
 *     to the admin actually typing/changing something.
 *   - Search, type filter, and both date filters are combined into a
 *     single query string on every request, so they always compose
 *     with each other (Task #39 Requirement #5, Task #40 Requirements
 *     #5 & #6).
 *
 * Task #43: renderRows() now also renders the Status badge with the
 * js-status-cell hook, and an Actions cell with the Publish/Unpublish
 * button - using the exact same markup helpers
 * (window.cobraByteResourcePublishing) that admin-resource-publish.js
 * exposes, so the server-rendered initial table and this script's live
 * re-renders can never drift out of sync with each other. This file
 * does NOT wire up the button's click behavior itself - that stays in
 * admin-resource-publish.js, loaded after this file.
 *
 * Only present on pages that have #resourceSearchInput and
 * #resourcesTableBody (currently just learning-resources.html), so
 * this is safe to include as a shared script without guard checks
 * elsewhere.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {
        const searchInput = document.getElementById("resourceSearchInput");
        const typeSelect = document.getElementById("resourceTypeSelect");
        const tableBody = document.getElementById("resourcesTableBody");
        const showingCount = document.getElementById("resourcesShowingCount");
        const pageLabel = document.getElementById("resourcesPageLabel");
        const prevBtn = document.getElementById("resourcesPrevBtn");
        const nextBtn = document.getElementById("resourcesNextBtn");

        // ------------------------------------------------------------
        // Video preview - clicking the green play icon next to a
        // Lesson that has a Video Tutorial attached opens an inline
        // embedded preview (a real, playable YouTube <iframe>) instead
        // of navigating anywhere. Delegated on the table body itself
        // (not per-row) so this keeps working whether the row came
        // from Flask's initial server render or from this script's own
        // renderRows() re-render below - and placed ahead of the
        // searchInput/tableBody guard below so it works independently
        // of the search/filter wiring.
        // ------------------------------------------------------------
        function showVideoPreviewModal(videoId) {
            if (!videoId) return;
            let overlay = document.getElementById("videoPreviewModalOverlay");
            if (overlay) overlay.remove();

            overlay = document.createElement("div");
            overlay.id = "videoPreviewModalOverlay";
            overlay.className = "modal-overlay";
            overlay.innerHTML = `
                <div style="position: relative; width: 100%; max-width: 720px; background: #000; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3);">
                    <button type="button" id="videoPreviewModalCloseBtn" class="modal-close-btn" style="top: 8px; right: 12px; color: #ffffff;" title="Close">&times;</button>
                    <div style="position: relative; width: 100%; aspect-ratio: 16 / 9;">
                        <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

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
            const closeBtn = overlay.querySelector("#videoPreviewModalCloseBtn");
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            document.addEventListener("keydown", onEscKey);
        }

        if (tableBody) {
            tableBody.addEventListener("click", (e) => {
                const trigger = e.target.closest(".video-preview-trigger");
                if (!trigger) return;
                e.preventDefault();
                showVideoPreviewModal(trigger.dataset.videoId);
            });
        }

        if (!searchInput || !tableBody) return;

        // ------------------------------------------------------------
        // Task #40: Created At / Updated At date filter controls.
        // Each field is a single date picker by default; the matching
        // "Range" toggle checkbox reveals its second (end) date input
        // only when the admin wants to filter a span of dates - same
        // UI convention already used by Manage Course's own date
        // filters (see admin-manage-course.js).
        // ------------------------------------------------------------
        const createdFromInput = document.getElementById("resourceCreatedFromInput");
        const createdToInput = document.getElementById("resourceCreatedToInput");
        const createdRangeToggle = document.getElementById("resourceCreatedRangeToggle");
        const clearCreatedDateBtn = document.getElementById("clearResourceCreatedDateBtn");
        const updatedFromInput = document.getElementById("resourceUpdatedFromInput");
        const updatedToInput = document.getElementById("resourceUpdatedToInput");
        const updatedRangeToggle = document.getElementById("resourceUpdatedRangeToggle");
        const clearUpdatedDateBtn = document.getElementById("clearResourceUpdatedDateBtn");
        const dateFilterError = document.getElementById("resourceDateFilterError");

        let currentPage = 1;
        let totalPages = 1;

        // BUG FIX: these used to stay hardcoded at 1/1 until some other
        // action (search/type/date filter) happened to trigger the first
        // loadResources() call - since this script intentionally does NOT
        // fetch on page load (it reuses the rows Flask already rendered),
        // totalPages never picked up the REAL total_pages Flask rendered
        // into #resourcesPageLabel (e.g. "1 of 2"). That silently broke
        // the Next button: its click handler only calls loadResources()
        // when currentPage < totalPages, which was always false (1 < 1)
        // on a fresh page load, no matter how many pages actually
        // existed. Reading the already-rendered label here fixes Next
        // (and keeps Prev/disabled-state correct) without needing an
        // extra network request.
        if (pageLabel) {
            const initialMatch = (pageLabel.textContent || "").match(/(\d+)\s*of\s*(\d+)/);
            if (initialMatch) {
                currentPage = parseInt(initialMatch[1], 10) || 1;
                totalPages = parseInt(initialMatch[2], 10) || 1;
            }
        }
        let debounceTimer = null;
        let activeRequestId = 0;

        function showDateFilterError(message) {
            if (!dateFilterError) { alert(message); return; }
            dateFilterError.textContent = message;
            dateFilterError.style.display = "block";
        }

        function clearDateFilterError() {
            if (!dateFilterError) return;
            dateFilterError.textContent = "";
            dateFilterError.style.display = "none";
        }

        /**
         * Resolves a date filter field's effective {from, to} pair based
         * on its own Range toggle - identical logic to
         * admin-manage-course.js's getEffectiveDateRange().
         */
        function getEffectiveDateRange(fromInput, toInput, rangeToggle) {
            const from = fromInput ? fromInput.value : "";
            if (!from) return { from: "", to: "" };
            const isRange = !!(rangeToggle && rangeToggle.checked);
            const to = (isRange && toInput) ? toInput.value : from;
            return { from, to };
        }

        /**
         * Task #40: reject an invalid date range (End before Start)
         * client-side, before ever calling the backend. The backend's
         * /learning-resources/data endpoint re-validates the exact same
         * rule server-side (never trusting only this check).
         */
        function validateDateRanges() {
            clearDateFilterError();

            const created = getEffectiveDateRange(createdFromInput, createdToInput, createdRangeToggle);
            if (created.from && created.to && created.from > created.to) {
                showDateFilterError("Created At: end date must be on or after the start date.");
                return false;
            }

            const updated = getEffectiveDateRange(updatedFromInput, updatedToInput, updatedRangeToggle);
            if (updated.from && updated.to && updated.from > updated.to) {
                showDateFilterError("Updated At: end date must be on or after the start date.");
                return false;
            }

            return true;
        }

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        // Task update: the TYPE badge column is now a CONTENT column -
        // icon buttons instead of a text badge. Every Lesson always
        // gets a document icon (its own text content); a Video Tutorial
        // icon is added alongside it ONLY when one is actually attached
        // (r.video_tutorial_id set) - clicking either previews that
        // specific content inline rather than navigating anywhere.
        function contentIconsHtml(resourceId, type, videoId) {
            let html = `<button type="button" class="resource-content-trigger" data-resource-id="${resourceId}" title="Preview ${escapeHtml(type || 'content')}"><i class="fa-regular fa-file-lines"></i></button>`;
            if (videoId) {
                html += ` <button type="button" class="video-preview-trigger" data-video-id="${escapeHtml(videoId)}" title="Preview video"><i class="fa-solid fa-circle-play"></i></button>`;
            }
            return html;
        }

        // ------------------------------------------------------------
        // Task #43: Status badge + Publish/Unpublish button markup.
        // Falls back to a plain badge/no button if
        // admin-resource-publish.js hasn't loaded for some reason
        // (script tag order or load failure), so the table still shows
        // useful info instead of throwing.
        // ------------------------------------------------------------
        function statusBadgeHtml(status) {
            if (window.cobraByteResourcePublishing) {
                return window.cobraByteResourcePublishing.statusBadgeHtml(status);
            }
            const normalized = (status || "").toLowerCase();
            const cls = normalized === "published" ? "badge-active" : "badge-draft";
            return `<span class="badge ${cls}">${escapeHtml(status || "Draft")}</span>`;
        }

        function publishButtonHtml(resourceId, status, moduleStatus) {
            if (window.cobraByteResourcePublishing) {
                return window.cobraByteResourcePublishing.publishButtonHtml(resourceId, status, moduleStatus);
            }
            return "";
        }

        // ACTIONS column (Edit dropdown/Archive) markup - falls back to
        // just a plain Edit link if admin-resource-actions.js hasn't
        // loaded for some reason (script tag order/load failure), so
        // the table still shows a usable action instead of throwing.
        // videoEditUrl (optional): when set, the Edit dropdown offers
        // BOTH "Edit lesson content" and "Edit video"; omitted means
        // only "Edit lesson content" is offered (no video attached).
        function actionsHtml(resourceId, status, videoEditUrl) {
            if (window.cobraByteResourceActions) {
                return window.cobraByteResourceActions.actionsHtml(resourceId, null, status, videoEditUrl);
            }
            return `<a href="/admin/upload-resource?resource_id=${encodeURIComponent(resourceId)}" title="Edit" class="table-action-icon js-edit-resource-btn" data-resource-id="${resourceId}" data-status="${escapeHtml(status || '')}"><i class="fa-solid fa-pen-to-square"></i></a>`;
        }

        // ------------------------------------------------------------
        // Content preview modal (document icon) - fetches the Lesson's
        // real saved content from /admin/learning-resources/preview-
        // content (which itself reuses resource_draft.get_lesson_draft(),
        // the SAME function the actual editor loads from) and renders it
        // exactly like a learner would see it on lesson-content.html -
        // not just a raw HTML dump. That means: the SAME CSS (see
        // admin-style.css's ".lesson-content-body"/".editor-code-*"
        // rules, copied verbatim from lesson-content.css) AND the SAME
        // behavior - filenames read-only, Run buttons wired to a real
        // Pyodide (WebAssembly Python) execution, interactive input()
        // support - ported from lesson-content.js rather than
        // re-invented, so admin and learner can never drift apart.
        // ------------------------------------------------------------
        const PREVIEW_PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
        const PREVIEW_LESSON_MODULES_DIR = "/lesson_modules";
        let previewPyodideLoadPromise = null;
        let previewActiveOutputBox = null;

        function getPreviewPyodideInstance() {
            if (!previewPyodideLoadPromise) {
                if (typeof loadPyodide !== "function") {
                    return Promise.reject(new Error("Pyodide script did not load."));
                }
                previewPyodideLoadPromise = loadPyodide({ indexURL: PREVIEW_PYODIDE_INDEX_URL });
            }
            return previewPyodideLoadPromise;
        }

        // Inline input() prompt, appended directly into whichever output
        // box is currently running - same interaction as the learner's
        // own lesson page (and the Sandbox): the raw prompt text plus a
        // live input field, no separate input box anywhere else.
        function showPreviewTerminalInputPrompt(promptText) {
            return new Promise((resolve) => {
                const outputBox = previewActiveOutputBox;
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
        window.cobraByteContentPreviewInput = showPreviewTerminalInputPrompt;

        function syncPreviewModuleFilesToFS(pyodide, files) {
            try {
                pyodide.FS.mkdirTree(PREVIEW_LESSON_MODULES_DIR);
            } catch (err) { /* already exists */ }
            files.forEach(({ filename, code }) => {
                const name = (filename || "").trim();
                if (!name.toLowerCase().endsWith(".py")) return;
                const baseName = name.split('/').pop().split('\\').pop();
                try {
                    pyodide.FS.writeFile(`${PREVIEW_LESSON_MODULES_DIR}/${baseName}`, code || "", { encoding: "utf8" });
                } catch (err) { /* ignore */ }
            });
        }

        function getAllPreviewCodeBlockFiles(scopeEl) {
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

        async function runPreviewPythonCode(code, files, currentFilename) {
            let pyodide;
            try {
                pyodide = await getPreviewPyodideInstance();
            } catch (err) {
                return "Could not load the Python runtime. Check your internet connection and try again.";
            }

            syncPreviewModuleFilesToFS(pyodide, files);
            pyodide.globals.set("_cobrabyte_user_code", code || "");
            pyodide.globals.set("_cobrabyte_module_files", files);
            pyodide.globals.set("_cobrabyte_current_filename", currentFilename || "");

            try {
                const result = await pyodide.runPythonAsync(
                    "import sys, io, traceback, builtins, importlib, ast, types\n" +
                    "import js as _cobrabyte_js\n" +
                    `_cobrabyte_modules_dir = ${JSON.stringify(PREVIEW_LESSON_MODULES_DIR)}\n` +
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
                    "    _val = await _cobrabyte_js.cobraByteContentPreviewInput(str(prompt) if prompt else '')\n" +
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

        function wirePreviewRunButton(wrapper, scopeEl) {
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
                runBtn.innerHTML = previewPyodideLoadPromise
                    ? '<i class="fa-solid fa-spinner fa-spin"></i> Running...'
                    : '<i class="fa-solid fa-spinner fa-spin"></i> Loading Python...';

                previewActiveOutputBox = outputBox;
                outputBox.textContent = "";

                const files = getAllPreviewCodeBlockFiles(scopeEl);
                const currentFilename = filenameInput ? filenameInput.value.trim() : "";
                const output = await runPreviewPythonCode(code, files, currentFilename);

                previewActiveOutputBox = null;
                outputBox.textContent = output.trim();

                runBtn.disabled = false;
                runBtn.innerHTML = originalHtml;
            });
        }

        // Mirrors lesson-content.js's preparePageForLearner() exactly,
        // just scoped to the modal's own content container instead of
        // a whole page.
        function preparePreviewContent(scopeEl) {
            scopeEl.querySelectorAll(".editor-code-filename").forEach((input) => {
                input.setAttribute("disabled", "true");
            });

            scopeEl.querySelectorAll(".editor-console-box").forEach((box) => {
                box.setAttribute("contenteditable", "false");
            });

            scopeEl.querySelectorAll(".editor-code-container").forEach((wrapper) => {
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

                wirePreviewRunButton(wrapper, scopeEl);
            });

            scopeEl.querySelectorAll(".editor-terminal-box").forEach((box) => {
                box.setAttribute("contenteditable", "false");
            });
        }

        async function showContentPreviewModal(resourceId) {
            let overlay = document.getElementById("contentPreviewModalOverlay");
            if (overlay) overlay.remove();

            overlay = document.createElement("div");
            overlay.id = "contentPreviewModalOverlay";
            overlay.className = "modal-overlay";
            overlay.innerHTML = `
                <div class="content-preview-card">
                    <div class="content-preview-header">
                        <strong id="contentPreviewTitle">Loading...</strong>
                        <button type="button" id="contentPreviewCloseBtn" class="modal-close-btn" style="position: static; font-size: 22px;" title="Close">&times;</button>
                    </div>
                    <div class="content-preview-body lesson-content-body" id="contentPreviewBody">Loading content...</div>
                </div>
            `;
            document.body.appendChild(overlay);

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
            const closeBtn = overlay.querySelector("#contentPreviewCloseBtn");
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            document.addEventListener("keydown", onEscKey);

            try {
                const response = await fetch(`/admin/learning-resources/preview-content?resource_id=${encodeURIComponent(resourceId)}`, {
                    credentials: "include",
                });
                const result = await response.json();

                const titleEl = document.getElementById("contentPreviewTitle");
                const bodyEl = document.getElementById("contentPreviewBody");
                if (!titleEl || !bodyEl) return; // modal was closed before this resolved

                if (!result.success) {
                    titleEl.textContent = "Preview";
                    bodyEl.textContent = result.message || "Could not load this content.";
                    return;
                }

                titleEl.textContent = result.title || "Preview";
                bodyEl.innerHTML = result.content_html || "<em>No content yet.</em>";
                preparePreviewContent(bodyEl);
            } catch (err) {
                const bodyEl = document.getElementById("contentPreviewBody");
                if (bodyEl) bodyEl.textContent = "Could not reach the server.";
            }
        }

        if (tableBody) {
            tableBody.addEventListener("click", (e) => {
                const contentTrigger = e.target.closest(".resource-content-trigger");
                if (!contentTrigger) return;
                e.preventDefault();
                showContentPreviewModal(contentTrigger.dataset.resourceId);
            });
        }

        function renderRows(resources) {
            if (!resources || resources.length === 0) {
                // Task #37, Requirement #7: empty state only ever shown
                // when the query genuinely returned zero rows.
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="9" class="text-muted table-empty-message">
                            No resources found.
                        </td>
                    </tr>`;
                if (showingCount) showingCount.textContent = "Showing 0 Resources";
                return;
            }

            // Task #81: ACTIONS (Edit/Archive) and PUBLISH STATUS
            // (Publish/Unpublish) are now two separate cells, in that
            // order, both still at the far right of the row - no other
            // columns were reordered.
            tableBody.innerHTML = resources.map(r => {
                const videoEditUrl = r.video_tutorial_id
                    ? `/admin/upload-video-tutorial?video_id=${encodeURIComponent(r.video_tutorial_id)}`
                    : null;
                return `
                <tr data-resource-id="${r.resource_id}">
                    <td>
                        <strong class="table-item-title">${escapeHtml(r.resource_title)}</strong>
                    </td>
                    <td>${contentIconsHtml(r.resource_id, r.type, r.video_file_path)}</td>
                    <td class="text-muted">${escapeHtml(r.category)}</td>
                    <td class="text-muted">${escapeHtml(r.uploaded_by)}</td>
                    <td class="text-muted js-status-cell">${statusBadgeHtml(r.status)}</td>
                    <td class="text-muted">${escapeHtml(r.created_at)}</td>
                    <td class="text-muted">${escapeHtml(r.updated_at)}</td>
                    <td class="text-right">${actionsHtml(r.resource_id, r.status, videoEditUrl)}</td>
                    <td class="text-right">${publishButtonHtml(r.resource_id, r.status, r.module_status)}</td>
                </tr>
            `;
            }).join("");
        }

        function buildParams() {
            const params = new URLSearchParams();
            const term = searchInput.value.trim();
            if (term) params.set("q", term);

            // Task #38: whatever value is currently selected IS the
            // real resource_type_id from resource_types_tbl (see the
            // dynamically-rendered <option value="{{ t.resource_type_id }}">
            // in learning-resources.html) - "All Types" has an empty
            // value, which is simply omitted here, matching exactly
            // what get_learning_resources_overview() treats as "no
            // type filter".
            if (typeSelect && typeSelect.value) params.set("type", typeSelect.value);

            // Task #40: only ever sent when the admin actually picked a
            // "from" value - see getEffectiveDateRange() above.
            const created = getEffectiveDateRange(createdFromInput, createdToInput, createdRangeToggle);
            if (created.from) params.set("created_from", created.from);
            if (created.to) params.set("created_to", created.to);

            const updated = getEffectiveDateRange(updatedFromInput, updatedToInput, updatedRangeToggle);
            if (updated.from) params.set("updated_from", updated.from);
            if (updated.to) params.set("updated_to", updated.to);

            params.set("page", currentPage);
            return params;
        }

        async function loadResources() {
            // Task #40: don't even call the backend with a known-bad
            // range - keep the current table/pagination as-is and just
            // surface the validation message.
            if (!validateDateRanges()) return;

            const requestId = ++activeRequestId;
            const params = buildParams();

            try {
                const response = await fetch(
                    `/admin/learning-resources/data?${params.toString()}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                if (requestId !== activeRequestId) return;

                if (!result.success) {
                    // Task #40: the backend's own range check (400)
                    // lands here too (e.g. if this script's client-side
                    // check was somehow bypassed) - show it as a filter
                    // error, not a generic "could not load" message.
                    if (response.status === 400 && result.message) {
                        showDateFilterError(result.message);
                        return;
                    }
                    tableBody.innerHTML = `
                        <tr>
                            <td colspan="8" class="text-muted table-empty-message">
                                Could not load resources. Please try again.
                            </td>
                        </tr>`;
                    return;
                }

                clearDateFilterError();
                renderRows(result.resources);
                currentPage = result.page;
                totalPages = result.total_pages;

                if (showingCount) showingCount.textContent = `Showing ${result.resources.length} of ${result.total} Resources`;
                if (pageLabel) pageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (prevBtn) prevBtn.disabled = result.page <= 1;
                if (nextBtn) nextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== activeRequestId) return;
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-muted table-empty-message">
                            Could not reach the server.
                        </td>
                    </tr>`;
            }
        }

        function scheduleLoad(resetPage = true) {
            if (resetPage) currentPage = 1;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(loadResources, DEBOUNCE_MS);
        }

        // Live search: debounced so it doesn't fire a request on every
        // single keystroke.
        searchInput.addEventListener("input", () => scheduleLoad(true));

        // Task #38: type filter re-runs the same combined search
        // immediately (debounced only to coalesce rapid changes),
        // preserving whatever is currently in the search box and the
        // date filters.
        if (typeSelect) typeSelect.addEventListener("change", () => scheduleLoad(true));

        if (prevBtn) prevBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadResources(); } });
        if (nextBtn) nextBtn.addEventListener("click", () => { if (currentPage < totalPages) { currentPage++; loadResources(); } });

        // ------------------------------------------------------------
        // Task #40: Created At / Updated At date filters
        // ------------------------------------------------------------
        [createdFromInput, createdToInput, updatedFromInput, updatedToInput].forEach((input) => {
            if (!input) return;
            input.addEventListener("change", () => scheduleLoad(true));
        });

        // Each field's "Range" toggle shows/hides its own end-date
        // input, and restores its checked state from whatever values
        // were already rendered server-side (e.g. a bookmarked/shared
        // filtered URL) before the first sync.
        function initDateRangeToggle(fromInput, toInput, rangeToggle) {
            if (!rangeToggle || !toInput) return;

            const fromVal = fromInput ? fromInput.value : "";
            if (toInput.value && toInput.value !== fromVal) {
                rangeToggle.checked = true;
            }

            const sync = () => {
                toInput.style.display = rangeToggle.checked ? "" : "none";
                if (!rangeToggle.checked) toInput.value = "";
            };
            sync();

            rangeToggle.addEventListener("change", () => {
                sync();
                scheduleLoad(true);
            });
        }
        initDateRangeToggle(createdFromInput, createdToInput, createdRangeToggle);
        initDateRangeToggle(updatedFromInput, updatedToInput, updatedRangeToggle);

        // Clear buttons only remove THEIR OWN date restriction - search,
        // type filter, and the other date filter are left untouched.
        if (clearCreatedDateBtn) {
            clearCreatedDateBtn.addEventListener("click", () => {
                if (createdFromInput) createdFromInput.value = "";
                if (createdToInput) createdToInput.value = "";
                if (createdRangeToggle) createdRangeToggle.checked = false;
                if (createdToInput) createdToInput.style.display = "none";
                clearDateFilterError();
                scheduleLoad(true);
            });
        }
        if (clearUpdatedDateBtn) {
            clearUpdatedDateBtn.addEventListener("click", () => {
                if (updatedFromInput) updatedFromInput.value = "";
                if (updatedToInput) updatedToInput.value = "";
                if (updatedRangeToggle) updatedRangeToggle.checked = false;
                if (updatedToInput) updatedToInput.style.display = "none";
                clearDateFilterError();
                scheduleLoad(true);
            });
        }
    });
})();