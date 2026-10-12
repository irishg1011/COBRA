/**
 * admin-editor-preview.js
 * --------------------------------------------------------------------
 * Wires the Preview button on the 3 editor pages:
 *   - Preview Lesson   (#previewLessonBtn   - upload-resource.html)
 *   - Preview Activity (#previewActivityBtn - create-learning-activity.html)
 *   - Preview on each exercise card (create-coding-exercise.html, via
 *     window.cobraPreviewExerciseCard - feat/exercise-cards)
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

    function wireRunButton(wrapper, scopeEl) {
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

    // feat/fib-console: a console item shows the learner's four parts -
    // question, hint, the code with its blank, and the expected output.
    // An item saved before the console still shows its old sentence.
    function previewBlock(label, text, className) {
        const wrap = el("div", "editor-preview-block " + (className || ""));
        wrap.appendChild(el("span", "editor-preview-block-label", label));
        wrap.appendChild(el("pre", "editor-preview-code", text));
        return wrap;
    }

    function renderFillBlanks(items, body) {
        const total = items.length;
        items.forEach((item, idx) => {
            const host = activityHost(`Item ${idx + 1} of ${total}`);
            if (item.code_text) {
                host.appendChild(el("p", "activity-question-text", item.instruction || "(No question yet)"));
                if (item.hint) host.appendChild(el("p", "editor-preview-hint", `Hint: ${item.hint}`));
                host.appendChild(previewBlock("Code", item.code_text));
                host.appendChild(previewBlock("Expected output", item.expected_output || "(No expected output yet)"));
            } else {
                host.appendChild(el("p", "activity-question-text",
                    item.content || item.instruction || "(No question yet - add the Question and the Code with blank)"));
                if (item.hint) host.appendChild(el("p", "editor-preview-hint", `Hint: ${item.hint}`));
            }

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
            if (card.front_code) host.appendChild(previewBlock("Code on the card", card.front_code));
            if (card.hint) host.appendChild(el("p", "editor-preview-hint", `Hint: ${card.hint}`));   // feat/hints-feedback
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
            emptyText = "No items added yet.";
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

    // feat/exercise-cards: each exercise card has its own Preview button
    // (create-exercise.js passes that card's values).
    function previewExercise(card) {
        if (typeof validateExerciseForm === "function" && !validateExerciseForm(false)) return;

        const body = openPreviewModal(
            card.title,
            getNoticeText("exercise", card.isNew, card.dirty)
        );

        body.appendChild(el("p", "lesson-step-eyebrow", "Coding Exercise"));
        body.appendChild(el("h2", "exercise-title", card.title));

        const prompt = el("div", "exercise-prompt");
        prompt.appendChild(exercisePromptLine("Situation:", card.situation));
        prompt.appendChild(exercisePromptLine("Problem:", card.question));
        const clue = el("p", "exercise-clue");
        clue.innerHTML = '<i class="fa-solid fa-lightbulb"></i> ' + escapeHtml(card.clue || "-");
        prompt.appendChild(clue);
        body.appendChild(prompt);

        // Same rows the learner sees (lesson-content.html): required tags + expected output.
        const tagLabels = card.tags || [];
        if (tagLabels.length) {
            const tagsRow = el("div", "exercise-required-row");
            tagsRow.appendChild(el("span", "exercise-required-label", "You must use:"));
            const chips = el("div", "exercise-required-chips");
            tagLabels.forEach((label) => chips.appendChild(el("span", "exercise-required-chip", label)));
            tagsRow.appendChild(chips);
            body.appendChild(tagsRow);
        }
        const expectedPane = el("div", "exercise-pane exercise-expected");
        expectedPane.appendChild(el("div", "exercise-pane-head", "Your output should look like this"));
        expectedPane.appendChild(el("pre", "exercise-output-box exercise-expected-box", card.expected || ""));
        body.appendChild(expectedPane);

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
    window.cobraPreviewExerciseCard = previewExercise;

    // ------------------------------------------------------------
    // Wire whichever Preview button this page has.
    // ------------------------------------------------------------
    document.addEventListener("DOMContentLoaded", () => {
        const lessonBtn = document.getElementById("previewLessonBtn");
        const activityBtn = document.getElementById("previewActivityBtn");

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
    });
})();