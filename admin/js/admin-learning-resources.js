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
        // Python execution (the shared background runner, CobraPy), interactive input()
        // support - ported from lesson-content.js rather than
        // re-invented, so admin and learner can never drift apart.
        // ------------------------------------------------------------

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


        // Clicked block's code only runs other lesson blocks it actually
        // imports (by filename, transitively, each at most once) - never the
        // whole lesson. Output is streamed live through _cobrabyte_write.
        // (The code-block Python program now lives in static/py-worker.js, "block" mode.)

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
            appendRunNote(run, "Program stopped.");
        }

        // Appends a message on its own line (Stop, load failure, backup time limit).
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

        // Runs one block in the shared background Python (CobraPy, "block" mode -
        // the same program as before, with its 1,000-line / 5-second guard). Never
        // throws; while it runs the button shows "Running... 3s" + Stop and the
        // page stays usable (feat/python-runner-no-freeze).
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
                if (outcome.loadFailed) { run.outputBox.textContent = ""; appendRunNote(run, CobraPy.messages.LOAD_FAILED_MESSAGE); }
                else if (outcome.killed) appendRunNote(run, outcome.message);
                else if (!outcome.ok) appendRunOutput(run, "Error running code: " + outcome.message);
            } finally {
                done();
                otherBtns.forEach((btn) => { btn.disabled = false; });
                runBtn.disabled = false;
                if (currentRun === run) currentRun = null;
            }
        }

        function wirePreviewRunButton(wrapper, scopeEl) {
            const runBtn = wrapper.querySelector(".run-btn");
            const consoleBox = wrapper.querySelector(".editor-console-box");
            const outputBox = wrapper.querySelector(".editor-output-box");
            if (!runBtn || !consoleBox || !outputBox) return;
            // feat/python-runner-no-freeze: there is code here - get Python ready in
            // the background, with a small status chip by the Run button.
            CobraPy.preload();
            CobraPy.chip(runBtn);

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