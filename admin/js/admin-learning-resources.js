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
        const sortSelect = document.getElementById("resourceSortSelect");
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
                <div class="video-preview-modal-card">
                    <button type="button" id="videoPreviewModalCloseBtn" class="modal-close-btn video-preview-close-btn" title="Close">&times;</button>
                    <div class="video-preview-frame">
                        <iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1" class="video-preview-iframe" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>
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
        // Each field is a single date picker (sent as from = to); the
        // matching "Today" checkbox is a shortcut that fills in today's
        // local date - same UI convention used by Manage Course's own
        // date filters (see admin-manage-course.js).
        // ------------------------------------------------------------
        const createdFromInput = document.getElementById("resourceCreatedFromInput");
        const createdRangeToggle = document.getElementById("resourceCreatedRangeToggle");
        const clearCreatedDateBtn = document.getElementById("clearResourceCreatedDateBtn");
        const updatedFromInput = document.getElementById("resourceUpdatedFromInput");
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
         * Resolves a date filter field's effective {from, to} pair - a
         * single picked date filters that one day. Identical logic to
         * admin-manage-course.js's getEffectiveDateRange().
         */
        function getEffectiveDateRange(fromInput) {
            const from = fromInput ? fromInput.value : "";
            if (!from) return { from: "", to: "" };
            return { from, to: from };
        }

        // Today's LOCAL date as YYYY-MM-DD (never toISOString(), which
        // is UTC and lands on yesterday before 8 AM in UTC+8).
        function getTodayLocalDate() {
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, "0");
            const d = String(now.getDate()).padStart(2, "0");
            return `${y}-${m}-${d}`;
        }

        // "2026-10-01" -> "Oct 1, 2026"
        function formatFilterDate(value) {
            const [y, m, d] = value.split("-").map(Number);
            return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        }

        function describeFilterDay(value) {
            return value === getTodayLocalDate() ? "today" : `on ${formatFilterDate(value)}`;
        }

        function getEmptyMessage() {
            const created = createdFromInput ? createdFromInput.value : "";
            const updated = updatedFromInput ? updatedFromInput.value : "";
            if (created && updated) return "No resources match these date filters.";
            if (created) return `No resources created ${describeFilterDay(created)}.`;
            if (updated) return `No resources updated ${describeFilterDay(updated)}.`;
            return "No resources found.";
        }

        /**
         * Task #40: reject an invalid date range (End before Start)
         * client-side, before ever calling the backend. The backend's
         * /learning-resources/data endpoint re-validates the exact same
         * rule server-side (never trusting only this check).
         */
        function validateDateRanges() {
            clearDateFilterError();

            const created = getEffectiveDateRange(createdFromInput);
            if (created.from && created.to && created.from > created.to) {
                showDateFilterError("Created At: end date must be on or after the start date.");
                return false;
            }

            const updated = getEffectiveDateRange(updatedFromInput);
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
        function actionsHtml(resourceId, status, videoEditUrl, videoTutorialId, videoStatus) {
            if (window.cobraByteResourceActions) {
                return window.cobraByteResourceActions.actionsHtml(resourceId, null, status, videoEditUrl, videoTutorialId, videoStatus);
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

        function getPreviewPyodideInstance() {
            if (!previewPyodideLoadPromise) {
                if (typeof loadPyodide !== "function") {
                    return Promise.reject(new Error("Pyodide script did not load."));
                }
                previewPyodideLoadPromise = loadPyodide({ indexURL: PREVIEW_PYODIDE_INDEX_URL });
            }
            return previewPyodideLoadPromise;
        }

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

        // `skipWrapper` (the clicked block) is left out when given.
        function getAllPreviewCodeBlockFiles(scopeEl, skipWrapper) {
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
            "import sys, time, traceback, builtins, importlib, ast, types\n" +
            `_cobrabyte_modules_dir = ${JSON.stringify(PREVIEW_LESSON_MODULES_DIR)}\n` +
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
                    pyodide = await Promise.race([getPreviewPyodideInstance(), run.stopPromise]);
                } catch (err) {
                    appendRunOutput(run, "Could not load the Python runtime. Check your internet connection and try again.");
                    return;
                }
                if (run.stopped || !pyodide) return;
                pyodideReady = true;
                runBtn.innerHTML = RUN_BTN_STOP_HTML;

                syncPreviewModuleFilesToFS(pyodide, opts.allFiles);
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

        function wirePreviewRunButton(wrapper, scopeEl) {
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
                    allFiles: getAllPreviewCodeBlockFiles(scopeEl),
                    moduleFiles: getAllPreviewCodeBlockFiles(scopeEl, wrapper),
                });
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
            if (overlay) {
                stopCurrentRun();
                overlay.remove();
            }

            overlay = document.createElement("div");
            overlay.id = "contentPreviewModalOverlay";
            overlay.className = "modal-overlay";
            overlay.innerHTML = `
                <div class="content-preview-card">
                    <div class="content-preview-header">
                        <strong id="contentPreviewTitle">Loading...</strong>
                        <button type="button" id="contentPreviewCloseBtn" class="modal-close-btn modal-close-inline" title="Close">&times;</button>
                    </div>
                    <div class="content-preview-body lesson-content-body" id="contentPreviewBody">Loading content...</div>
                </div>
            `;
            document.body.appendChild(overlay);

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
                            ${escapeHtml(getEmptyMessage())}
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
                        <strong class="table-item-title cell-truncate">${escapeHtml(r.resource_title)}</strong>
                    </td>
                    <td>${contentIconsHtml(r.resource_id, r.type, r.video_file_path)}</td>
                    <td class="text-muted"><span class="cell-truncate cell-truncate--sm">${escapeHtml(r.category)}</span></td>
                    <td class="text-muted"><span class="cell-truncate-1 cell-truncate--sm">${escapeHtml(r.uploaded_by)}</span></td>
                    <td class="text-muted js-status-cell">${statusBadgeHtml(r.status)}</td>
                    <td class="text-muted">${escapeHtml(r.created_at)}</td>
                    <td class="text-muted">${escapeHtml(r.updated_at)}</td>
                    <td class="text-right">${actionsHtml(r.resource_id, r.status, videoEditUrl, r.video_tutorial_id, r.video_status)}</td>
                    <td class="text-right">${publishButtonHtml(r.resource_id, r.status, r.module_status)}</td>
                </tr>
            `;
            }).join("");

            // Task #124: post-restore row highlight - see the matching
            // note in admin-coding-exercises.js's renderRows() for how
            // this cross-file signal works.
            flashRestoredRow(tableBody, `tr[data-resource-id="${window.cobraByteHighlightRestoredId}"]`);
        }

        function flashRestoredRow(container, selector) {
            if (!container || !window.cobraByteHighlightRestoredId) return;
            const row = container.querySelector(selector);
            window.cobraByteHighlightRestoredId = null;
            if (!row) return;
            row.classList.add("row-restored-highlight");
            setTimeout(() => row.classList.remove("row-restored-highlight"), 4000);
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
            if (sortSelect && sortSelect.value) params.set("sort", sortSelect.value);

            // Task #40: only ever sent when the admin actually picked a
            // "from" value - see getEffectiveDateRange() above.
            const created = getEffectiveDateRange(createdFromInput);
            if (created.from) params.set("created_from", created.from);
            if (created.to) params.set("created_to", created.to);

            const updated = getEffectiveDateRange(updatedFromInput);
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
        if (sortSelect) sortSelect.addEventListener("change", () => scheduleLoad(true));

        // feat/module-title-history: a reverted name shows up right away.
        document.addEventListener("cobra:title-changed", () => loadResources());

        if (prevBtn) prevBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadResources(); } });
        if (nextBtn) nextBtn.addEventListener("click", () => { if (currentPage < totalPages) { currentPage++; loadResources(); } });

        // ------------------------------------------------------------
        // Task #40: Created At / Updated At date filters
        // ------------------------------------------------------------
        [createdFromInput, updatedFromInput].forEach((input) => {
            if (!input) return;
            input.addEventListener("change", () => scheduleLoad(true));
        });

        // "Today" checkbox: a shortcut that fills/clears the date input.
        // It stays ticked only while the picked date IS today.
        function initTodayToggle(dateInput, todayToggle) {
            if (!dateInput || !todayToggle) return;

            const syncFromInput = () => {
                todayToggle.checked = !!dateInput.value && dateInput.value === getTodayLocalDate();
            };
            syncFromInput();

            dateInput.addEventListener("change", syncFromInput);
            todayToggle.addEventListener("change", () => {
                dateInput.value = todayToggle.checked ? getTodayLocalDate() : "";
                clearDateFilterError();
                scheduleLoad(true);
            });
        }
        initTodayToggle(createdFromInput, createdRangeToggle);
        initTodayToggle(updatedFromInput, updatedRangeToggle);

        // Clear buttons only remove THEIR OWN date restriction - search,
        // type filter, and the other date filter are left untouched.
        if (clearCreatedDateBtn) {
            clearCreatedDateBtn.addEventListener("click", () => {
                if (createdFromInput) createdFromInput.value = "";
                if (createdRangeToggle) createdRangeToggle.checked = false;
                clearDateFilterError();
                scheduleLoad(true);
            });
        }
        if (clearUpdatedDateBtn) {
            clearUpdatedDateBtn.addEventListener("click", () => {
                if (updatedFromInput) updatedFromInput.value = "";
                if (updatedRangeToggle) updatedRangeToggle.checked = false;
                clearDateFilterError();
                scheduleLoad(true);
            });
        }
    });
})();