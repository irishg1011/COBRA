/**
 * admin-coding-sandbox.js - Admin > Coding Sandbox
 * --------------------------------------------------------------------
 * 1. Table: search by learner ID, status filter, run-date range, and
 *    pagination - live, no page reload (/admin/coding-sandbox/data).
 *    The metric cards refresh with every fetch.
 * 2. Eye button: opens #sandboxRunModal with the learner's code
 *    (read-only) and their recorded output (/admin/coding-sandbox/runs/<id>).
 * 3. Run: executes that code in THIS browser with Pyodide - same
 *    runtime and inline input() prompt as the learner sandbox.js.
 *    Nothing is saved or logged.
 *
 * feat/python-runner-no-freeze: Python runs in a background worker
 * (static/py-runner.js -> CobraPy) - the page never freezes; a program is
 * stopped after 15 seconds or 1,000 output lines, and Stop ends it anytime.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;
    const SANDBOX_MAX_SECONDS = 15;

    document.addEventListener("DOMContentLoaded", () => {

        // ============================================================
        // 1. TABLE + FILTERS
        // ============================================================
        const searchInput = document.getElementById("sandboxSearchInput");
        const statusSelect = document.getElementById("sandboxStatusSelect");
        const dateFromInput = document.getElementById("sandboxDateFromInput");
        const dateToInput = document.getElementById("sandboxDateToInput");
        const clearDateBtn = document.getElementById("clearSandboxDateBtn");
        const dateFilterError = document.getElementById("sandboxDateFilterError");
        const tableBody = document.getElementById("sandboxRunsTableBody");
        const showingCount = document.getElementById("sandboxShowingCount");
        const pageLabel = document.getElementById("sandboxPageLabel");
        const prevBtn = document.getElementById("sandboxPrevBtn");
        const nextBtn = document.getElementById("sandboxNextBtn");

        const metricEls = {
            total_runs: document.getElementById("metricTotalRuns"),
            successful: document.getElementById("metricSuccessfulRuns"),
            failed: document.getElementById("metricFailedRuns"),
            avg_exec_time: document.getElementById("metricAvgExecTime"),
        };

        if (!tableBody) return;

        // Read from the server-rendered template, never assumed.
        let currentPage = parseInt(tableBody.dataset.page || "1", 10);
        let totalPages = parseInt(tableBody.dataset.totalPages || "1", 10);
        let debounceTimer = null;
        let activeRequestId = 0;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function statusBadgeHtml(status, label) {
            const cls = status === "success" ? "badge-active" : "badge-locked";
            return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
        }

        function showDateError(message) {
            if (!dateFilterError) return;
            dateFilterError.textContent = message;
            dateFilterError.classList.add("is-visible");
        }

        function clearDateError() {
            if (!dateFilterError) return;
            dateFilterError.textContent = "";
            dateFilterError.classList.remove("is-visible");
        }

        function validateDates() {
            clearDateError();
            const from = dateFromInput ? dateFromInput.value : "";
            const to = dateToInput ? dateToInput.value : "";
            if (from && to && from > to) {
                showDateError("Run Date: the end date must be on or after the start date.");
                return false;
            }
            return true;
        }

        function buildParams(page) {
            const params = new URLSearchParams();
            const q = searchInput ? searchInput.value.trim() : "";
            const status = statusSelect ? statusSelect.value : "";
            const from = dateFromInput ? dateFromInput.value : "";
            const to = dateToInput ? dateToInput.value : "";

            if (q) params.set("q", q);
            if (status) params.set("status", status);
            if (from) params.set("date_from", from);
            if (to) params.set("date_to", to);
            params.set("page", String(page));
            return params;
        }

        function renderRows(runs) {
            if (!runs || runs.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-muted table-empty-message">No sandbox runs found.</td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = runs.map((run) => `
                <tr data-run-id="${escapeHtml(run.run_id)}">
                    <td>${escapeHtml(run.acc_id)}</td>
                    <td>${statusBadgeHtml(run.status, run.status_label)}</td>
                    <td>${escapeHtml(run.exec_time)}</td>
                    <td>${escapeHtml(run.size)}</td>
                    <td>${escapeHtml(run.run_at)}</td>
                    <td>
                        <button type="button" class="icon-button-reset sandbox-view-btn js-view-run-btn" data-run-id="${escapeHtml(run.run_id)}" title="View code" aria-label="View code for run ${escapeHtml(run.run_id)}">
                            <span class="mask-icon icon-eye"></span>
                        </button>
                    </td>
                </tr>
            `).join("");
        }

        function updateMetrics(metrics) {
            if (!metrics) return;
            Object.keys(metricEls).forEach((key) => {
                // Only written when it changed (the live refresh calls this every 10 s).
                if (metricEls[key] && metrics[key] !== undefined && metricEls[key].textContent !== String(metrics[key])) {
                    metricEls[key].textContent = metrics[key];
                }
            });
        }

        function updatePagination(countOnPage, total, page, pages) {
            currentPage = page;
            totalPages = pages;
            const showingCountText = `Showing ${countOnPage} of ${total} Logs`;
            if (showingCount && showingCount.textContent !== showingCountText) showingCount.textContent = showingCountText;
            const pageLabelText = `${page} of ${pages}`;
            if (pageLabel && pageLabel.textContent !== pageLabelText) pageLabel.textContent = pageLabelText;
            if (prevBtn && prevBtn.disabled !== (page <= 1)) prevBtn.disabled = page <= 1;
            if (nextBtn && nextBtn.disabled !== (page >= pages)) nextBtn.disabled = page >= pages;
        }

        async function fetchRuns(page = 1) {
            if (!validateDates()) return;

            const requestId = ++activeRequestId;

            try {
                const response = await fetch(`/admin/coding-sandbox/data?${buildParams(page).toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                if (requestId !== activeRequestId) return; // a newer request already won

                const runs = data.runs || [];
                renderRows(runs);
                if (window.CobraLive) CobraLive.changed("sandbox-rows", runs);
                updateMetrics(data.metrics);
                updatePagination(runs.length, data.total || 0, data.page || 1, data.total_pages || 1);
            } catch (err) {
                console.error("admin-coding-sandbox: failed to load runs:", err);
            }
        }

        function scheduleFetch(page = 1) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchRuns(page), DEBOUNCE_MS);
        }

        if (searchInput) searchInput.addEventListener("input", () => scheduleFetch(1));
        if (statusSelect) statusSelect.addEventListener("change", () => fetchRuns(1));
        if (dateFromInput) dateFromInput.addEventListener("change", () => fetchRuns(1));
        if (dateToInput) dateToInput.addEventListener("change", () => fetchRuns(1));

        if (clearDateBtn) {
            clearDateBtn.addEventListener("click", () => {
                if (dateFromInput) dateFromInput.value = "";
                if (dateToInput) dateToInput.value = "";
                clearDateError();
                fetchRuns(1);
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) fetchRuns(currentPage - 1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener("click", () => {
                if (currentPage < totalPages) fetchRuns(currentPage + 1);
            });
        }

        // Live refresh (admin-live-refresh.js): same search / status / dates /
        // page that are on screen. Cards always; the rows only when they
        // changed, no modal is open and the admin didn't start a new search.
        if (window.CobraLive) {
            CobraLive.every("sandbox-rows", async ({ modalOpen }) => {
                if (!validateDates()) return;
                const startedAt = activeRequestId;
                const response = await fetch(`/admin/coding-sandbox/data?${buildParams(currentPage).toString()}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                if (!response.ok) return;
                const data = await response.json();
                if (startedAt !== activeRequestId) return;
                updateMetrics(data.metrics);
                if (modalOpen) return;
                const runs = data.runs || [];
                if (CobraLive.changed("sandbox-rows", runs)) renderRows(runs);
                updatePagination(runs.length, data.total || 0, data.page || 1, data.total_pages || 1);
            });
        }

        // ============================================================
        // 2. RUN MODAL
        // ============================================================
        const modal = document.getElementById("sandboxRunModal");
        const closeBtn = document.getElementById("closeSandboxRunModalBtn");
        const accIdEl = document.getElementById("sandboxRunAccId");
        const statusEl = document.getElementById("sandboxRunStatus");
        const execEl = document.getElementById("sandboxRunExecTime");
        const sizeEl = document.getElementById("sandboxRunSize");
        const runAtEl = document.getElementById("sandboxRunAt");
        const snippetEl = document.getElementById("sandboxRunSnippet");
        const loadErrorEl = document.getElementById("sandboxRunLoadError");
        const codeEl = document.getElementById("sandboxRunCode");
        const outputEl = document.getElementById("sandboxRunOutput");
        const consoleEl = document.getElementById("sandboxRunConsole");
        const consolePlaceholder = document.getElementById("sandboxRunConsolePlaceholder");
        const runBtn = document.getElementById("sandboxRunCodeBtn");
        const clearConsoleBtn = document.getElementById("sandboxRunClearBtn");

        if (!modal || !codeEl || !consoleEl || !runBtn) return;

        let modalRequestId = 0;
        let isModalLoading = false;
        let runToken = 0;              // bumps on close/open so an old run never writes into a new one
        let pendingInputResolve = null;
        let lastFocused = null;

        function setText(el, value) {
            if (el) el.textContent = value;
        }

        function showLoadError(message) {
            if (!loadErrorEl) return;
            loadErrorEl.textContent = message;
            loadErrorEl.classList.add("is-visible");
        }

        function hideLoadError() {
            if (!loadErrorEl) return;
            loadErrorEl.textContent = "";
            loadErrorEl.classList.remove("is-visible");
        }

        // Ends a paused input() so the Python run can finish.
        // undefined reaches Python as None -> EOFError.
        function cancelPendingInput() {
            if (pendingInputResolve) pendingInputResolve(undefined);
            if (window.CobraPy && CobraPy.isRunning()) CobraPy.stop();   // the program ends too
        }

        function resetConsole() {
            cancelPendingInput();
            consoleEl.innerHTML = "";
            if (consolePlaceholder) consoleEl.appendChild(consolePlaceholder);
        }

        function refreshRunBtnState() {
            runBtn.disabled = isModalLoading || !codeEl.value.trim();
        }

        function resetRunModal() {
            [accIdEl, execEl, sizeEl, runAtEl, snippetEl].forEach((el) => setText(el, "—"));
            if (statusEl) {
                statusEl.className = "badge sandbox-run-status";
                statusEl.textContent = "";
            }
            codeEl.value = "";
            codeEl.placeholder = "Loading...";
            if (outputEl) {
                outputEl.textContent = "";
                outputEl.classList.remove("is-empty");
            }
            hideLoadError();
            resetConsole();
        }

        function fillRunModal(run) {
            setText(accIdEl, run.acc_id || "—");
            setText(execEl, run.exec_time || "—");
            setText(sizeEl, run.size || "—");
            setText(runAtEl, run.run_at || "—");
            setText(snippetEl, run.snippet || "—");

            if (statusEl) {
                const cls = run.status === "success" ? "badge-active" : "badge-locked";
                statusEl.className = `badge sandbox-run-status ${cls}`;
                statusEl.textContent = run.status_label || "";
            }

            codeEl.value = run.code || "";
            codeEl.placeholder = "This run has no code.";

            if (outputEl) {
                const output = (run.output || "").trim();
                outputEl.textContent = output || "No output was recorded for this run.";
                outputEl.classList.toggle("is-empty", !output);
            }
        }

        async function openRunModal(runId) {
            if (!runId) return;

            lastFocused = document.activeElement;
            runToken++;
            if (window.CobraPy) CobraPy.preload();   // the modal shows code: get Python ready
            resetRunModal();
            isModalLoading = true;
            refreshRunBtnState();
            modal.classList.remove("modal-hidden");
            if (closeBtn) closeBtn.focus();

            const requestId = ++modalRequestId;

            try {
                const response = await fetch(`/admin/coding-sandbox/runs/${encodeURIComponent(runId)}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                if (requestId !== modalRequestId) return; // closed or another run opened

                if (!response.ok || !data.success) {
                    throw new Error(data.message || `HTTP ${response.status}`);
                }
                fillRunModal(data.run);
            } catch (err) {
                if (requestId !== modalRequestId) return;
                codeEl.placeholder = "";
                showLoadError("Could not load this run. Please close and try again.");
                console.error("admin-coding-sandbox: failed to load run:", err);
            } finally {
                if (requestId === modalRequestId) {
                    isModalLoading = false;
                    refreshRunBtnState();
                }
            }
        }

        function closeRunModal() {
            if (modal.classList.contains("modal-hidden")) return;
            modalRequestId++;
            runToken++;
            resetConsole();
            modal.classList.add("modal-hidden");
            if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
        }

        tableBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".js-view-run-btn");
            if (btn) openRunModal(btn.dataset.runId);
        });

        if (closeBtn) closeBtn.addEventListener("click", closeRunModal);

        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeRunModal();
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeRunModal();
        });

        if (clearConsoleBtn) clearConsoleBtn.addEventListener("click", resetConsole);

        // ============================================================
        // 3. PYTHON RUNNER - the shared background runner (CobraPy,
        //    "adminsandbox" mode: the same program as before, now with the
        //    15-second / 1,000-line safety guard). Output shows live.
        // ============================================================
        const CobraPy = window.CobraPy;

        function appendLiveOutput(text) {
            if (!text) return;
            if (consolePlaceholder && consolePlaceholder.parentNode === consoleEl) {
                consoleEl.removeChild(consolePlaceholder);
            }
            let live = consoleEl.lastElementChild;
            if (!live || !live.classList.contains("console-live")) {
                live = document.createElement("span");
                live.className = "console-line console-live";
                consoleEl.appendChild(live);
            }
            live.appendChild(document.createTextNode(text));
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }

        // Inline prompt + input inside the console, like a real terminal.
        function showInlineInputPrompt(promptText) {
            return new Promise((resolve) => {
                if (consolePlaceholder && consolePlaceholder.parentNode === consoleEl) {
                    consoleEl.removeChild(consolePlaceholder);
                }

                // The prompt itself was already printed (live output).
                const promptSpan = document.createElement("span");
                promptSpan.className = "terminal-prompt-text";
                promptSpan.textContent = "";

                const input = document.createElement("input");
                input.type = "text";
                input.className = "terminal-inline-input";
                input.autocomplete = "off";
                input.spellcheck = false;

                consoleEl.appendChild(promptSpan);
                consoleEl.appendChild(input);
                consoleEl.scrollTop = consoleEl.scrollHeight;
                input.focus();

                pendingInputResolve = (value) => {
                    pendingInputResolve = null;
                    promptSpan.remove();
                    input.remove();     // the answer comes back as live output
                    resolve(value);
                };

                input.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" && pendingInputResolve) {
                        e.preventDefault();
                        pendingInputResolve(input.value);
                    }
                });
            });
        }
        // Never throws. A stopped run returns the output so far + the reason.
        async function runPythonCode(code, myToken) {
            let liveText = "";
            const outcome = await CobraPy.run({
                mode: "adminsandbox", code: code || "", maxSeconds: SANDBOX_MAX_SECONDS, live: true,
                onStarted: () => { if (myToken === runToken) consoleEl.innerHTML = ""; },
                onOutput: (text) => { liveText += text; if (myToken === runToken) appendLiveOutput(text); },
                onInput: showInlineInputPrompt,
            });
            if (outcome.ok) return outcome.result;
            if (outcome.loadFailed) return CobraPy.messages.LOAD_FAILED_MESSAGE;
            if (outcome.stopped || outcome.killed) {
                return liveText + (liveText && !liveText.endsWith("\n") ? "\n" : "") + outcome.message;
            }
            return "Error running code: " + outcome.message;
        }

        runBtn.addEventListener("click", async () => {
            const code = codeEl.value;
            if (!code.trim()) return;

            if (CobraPy.isRunning()) return;
            const myToken = ++runToken;
            // "Running... 3s" + Stop; the page stays usable the whole time.
            const done = CobraPy.runningButton(runBtn, { onStop: () => CobraPy.stop() });

            cancelPendingInput();
            consoleEl.innerHTML = "";
            if (!CobraPy.isReady()) appendLiveOutput(CobraPy.messages.STARTING_MESSAGE);

            const output = await runPythonCode(code, myToken);
            done();

            // Only write the result if the modal still shows this run.
            if (myToken === runToken) {
                const trimmed = (output || "").trim();
                const isError = trimmed.includes("Traceback (most recent call last)");

                // Replace (not append) so input() prompts aren't shown twice.
                consoleEl.innerHTML = "";
                const p = document.createElement("p");
                if (trimmed) {
                    p.className = isError ? "console-line console-error" : "console-line";
                    p.textContent = trimmed;
                } else {
                    p.className = "console-placeholder";
                    p.textContent = "Program finished with no output.";
                }
                consoleEl.appendChild(p);
            }

            refreshRunBtnState();
        });

        // Status chip by Run; Python starts loading when a run is opened.
        CobraPy.chip(runBtn);
    });
})();