/**
 * admin-quick-edit.js - Quick edit ONE item from the preview's Review list
 * (feat/quick-edit-items). Mentors only: the pencil is only drawn for
 * them, and POST /admin/quick-edit/<kind>/<id> refuses everyone else.
 * --------------------------------------------------------------------
 *   CobraQuickEdit.open(item, ctx)
 *     item  one Review list item (has kind, id, version, answered, fields)
 *     ctx   { number, parentTitle, status, laId, limits,
 *             onSaved(freshItem), onReload(kind, id), trigger }
 *
 * Only the item's EXISTING fields are edited (no choices / items added or
 * removed). The server checks the same rules as the full editor
 * (item_rules.py) and refuses the save when someone else changed the
 * item since it was loaded ("Reload it?").
 * All database text goes in through .value / textContent.
 */
(function () {
    "use strict";

    const LIVE = ["Published", "Ready to Publish"];
    const TAB_OF_STATUS = { "Draft": "draft", "Ready to Publish": "ready", "Published": "published" };

    let modal = null;
    let els = {};
    let state = null;      // { item, ctx, snapshot, saving }

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null && text !== "") node.textContent = text;
        return node;
    }

    function build() {
        modal = el("div", "qe-backdrop");
        modal.hidden = true;
        modal.innerHTML = `
            <div class="qe-dialog" role="dialog" aria-modal="true" aria-labelledby="qeTitle">
                <div class="qe-head">
                    <div class="qe-head-text">
                        <h2 class="qe-title" id="qeTitle"></h2>
                        <p class="qe-sub"><span class="qe-parent"></span> <span class="qe-chip"></span></p>
                    </div>
                    <button type="button" class="qe-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="qe-body">
                    <p class="qe-note qe-live" hidden><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> <span></span></p>
                    <p class="qe-note qe-answered" hidden><i class="fa-solid fa-users" aria-hidden="true"></i> <span></span></p>
                    <div class="qe-error" role="alert" hidden><span class="qe-error-text"></span> <button type="button" class="qe-reload" hidden>Reload</button></div>
                    <form class="qe-form" novalidate></form>
                </div>
                <div class="qe-foot">
                    <button type="button" class="qe-btn qe-cancel">Cancel</button>
                    <button type="button" class="qe-btn qe-full"><i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i> Open in full editor</button>
                    <button type="button" class="qe-btn qe-save"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        els = {
            title: modal.querySelector(".qe-title"),
            parent: modal.querySelector(".qe-parent"),
            chip: modal.querySelector(".qe-chip"),
            live: modal.querySelector(".qe-live"),
            answered: modal.querySelector(".qe-answered"),
            error: modal.querySelector(".qe-error"),
            errorText: modal.querySelector(".qe-error-text"),
            reload: modal.querySelector(".qe-reload"),
            form: modal.querySelector(".qe-form"),
            save: modal.querySelector(".qe-save"),
            full: modal.querySelector(".qe-full"),
        };
        modal.querySelector(".qe-close").addEventListener("click", () => close());
        modal.querySelector(".qe-cancel").addEventListener("click", () => close());
        modal.addEventListener("mousedown", (e) => { if (e.target === modal) close(); });
        els.save.addEventListener("click", save);
        els.full.addEventListener("click", openFullEditor);
        els.reload.addEventListener("click", () => {
            const { item, ctx } = state;
            close(true);
            if (ctx.onReload) ctx.onReload(item.kind, item.id);
        });
        els.form.addEventListener("submit", (e) => e.preventDefault());
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal && !modal.hidden) { e.preventDefault(); close(); }
        });
    }

    // ---------- fields ----------
    function limitOf(key) {
        const limits = (state && state.ctx.limits) || {};
        return limits[key] || null;
    }

    // opts: { name, label, note, value, multiline, code, required, limit, noCounter, readonly, rows, hint, placeholder }
    function field(parent, opts) {
        const wrap = el("div", "qe-field");
        const id = `qe_${opts.name.replace(/[^a-z0-9_]/gi, "_")}`;
        const label = el("label", "qe-label", opts.label + (opts.required ? " *" : ""));
        if (opts.note) label.appendChild(el("small", "qe-label-note", ` ${opts.note}`));
        label.htmlFor = id;
        wrap.appendChild(label);
        const input = el(opts.multiline || opts.code ? "textarea" : "input", "qe-input" + (opts.code ? " qe-code" : ""));
        if (!(opts.multiline || opts.code)) input.type = "text";
        else input.rows = opts.rows || (opts.code ? 4 : 2);
        input.id = id;
        input.name = opts.name;
        input.value = opts.value || "";
        if (opts.placeholder) input.placeholder = opts.placeholder;
        if (opts.code) input.spellcheck = false;
        if (opts.readonly) { input.readOnly = true; input.tabIndex = -1; input.classList.add("is-readonly"); }
        const limit = opts.limit ? limitOf(opts.limit) : null;
        if (limit) input.maxLength = limit;
        wrap.appendChild(input);
        if (limit && !opts.noCounter) {
            const counter = el("small", "qe-counter");
            const update = () => {
                counter.textContent = `${input.value.length} / ${limit}`;
                counter.classList.toggle("is-full", input.value.length >= limit);
            };
            input.addEventListener("input", update);
            update();
            wrap.appendChild(counter);
        }
        if (opts.hint) wrap.appendChild(el("small", "qe-hint", opts.hint));
        parent.appendChild(wrap);
        return input;
    }

    function row(parent, extra) {
        const r = el("div", "qe-row" + (extra ? " " + extra : ""));
        parent.appendChild(r);
        return r;
    }

    function value(name) {
        const input = els.form.elements[name];
        return input ? input.value : "";
    }

    // The SAME boxes as the full editor's cards (create-learning-activity.js),
    // with the same labels - nothing the editor doesn't have.
    function renderMcq(item) {
        const f = els.form;
        field(f, { name: "question", label: "Question", value: item.question, multiline: true, rows: 2, required: true, limit: "mcq_question", placeholder: "Type your question here..." });
        // Option | Answer | Is Correct | Feedback for Learner - one row per option
        const table = el("div", "qe-options");
        const headRow = el("div", "qe-option qe-option-head");
        ["Option", "Answer", "Is Correct", "Feedback for Learner *"].forEach((t) => headRow.appendChild(el("span", "qe-label", t)));
        table.appendChild(headRow);
        const limits = (state && state.ctx.limits) || {};
        item.options.forEach((o) => {
            const line = el("div", "qe-option");
            line.dataset.optionId = o.id;
            line.appendChild(el("span", "qe-option-badge", o.letter));
            const answer = el("input", "qe-input");
            answer.type = "text";
            answer.name = `opt_${o.id}_text`;
            answer.value = o.text;
            answer.placeholder = "Answer option";
            answer.setAttribute("aria-label", `Option ${o.letter} answer`);
            if (limits.mcq_option) answer.maxLength = limits.mcq_option;
            line.appendChild(answer);
            const pick = el("span", "qe-correct");
            const radio = el("input");
            radio.type = "radio";
            radio.name = "correct_option_id";
            radio.value = String(o.id);
            radio.checked = !!o.correct;
            radio.setAttribute("aria-label", `Option ${o.letter} is the correct answer`);
            pick.appendChild(radio);
            line.appendChild(pick);
            const feedback = el("input", "qe-input");
            feedback.type = "text";
            feedback.name = `opt_${o.id}_feedback`;
            feedback.value = o.feedback;
            feedback.placeholder = "Feedback";
            feedback.setAttribute("aria-label", `Option ${o.letter} feedback for learner`);
            if (limits.mcq_option_feedback) feedback.maxLength = limits.mcq_option_feedback;
            line.appendChild(feedback);
            table.appendChild(line);
        });
        f.appendChild(table);
    }

    function renderFib(item) {
        const f = els.form;
        const isLegacy = !(item.code_text || "").trim() && !!(item.content || "").trim();
        field(f, { name: "instruction", label: "Question", value: item.instruction, multiline: true, rows: 2, required: true, limit: "fib_instruction", placeholder: "e.g. Put the text hi, in quotes, into the blank so the program prints it." });
        const code = field(f, { name: "code_text", label: "Code with blank", note: "(mark the blank with ___ )", value: item.code_text, code: true, rows: 4, required: true, placeholder: "message = ___\nprint(message)" });
        const r = row(f);
        const answer = field(r, { name: "correct_answer", label: "Correct Answer (what goes in the blank)", value: item.correct_answer, required: true, limit: "fib_answer", noCounter: true, placeholder: 'e.g. "hi"' });
        field(r, { name: "must_contain", label: "Must contain", note: "(optional)", value: item.must_contain, limit: "fib_must_contain", noCounter: true, placeholder: "e.g. + (so typing the output itself is not enough)" });
        const expected = field(f, { name: "expected_output", label: "Expected output", value: item.expected_output, code: true, rows: 2, readonly: true, required: true, placeholder: "Click Generate expected output - the code runs with the correct answer" });
        const gen = el("div", "qe-generate");
        const btn = el("button", "qe-btn qe-btn-small", "Generate expected output");
        btn.type = "button";
        const note = el("small", "qe-hint");
        gen.appendChild(btn);
        gen.appendChild(note);
        expected.parentNode.appendChild(gen);
        // Same as the editor: a changed code / answer needs a new run.
        [code, answer].forEach((input) => input.addEventListener("input", () => {
            if (!expected.value) return;
            expected.value = "";
            note.textContent = "The code or the answer changed - click Generate expected output again.";
        }));
        btn.addEventListener("click", () => generate(btn, note, code, answer, expected));
        field(f, { name: "hint", label: "Hint", note: "(shown while answering - never the answer)", value: item.hint, limit: "hint", noCounter: true, placeholder: "e.g. Text in Python goes inside quotes." });
        if (isLegacy) {
            const old = field(f, { name: "content", label: "Old item text", note: "(saved before the console - graded by text match until Code is filled in)", value: item.content, multiline: true, rows: 4 });
            autoGrow(old);
        }
        const r2 = row(f);
        field(r2, { name: "correct_feedback", label: "Feedback when correct", value: item.correct_feedback, limit: "feedback", noCounter: true, placeholder: "Why the answer is right" });
        field(r2, { name: "incorrect_feedback", label: "Feedback when wrong", value: item.incorrect_feedback, limit: "feedback", noCounter: true, placeholder: "Why it is off - without giving the answer" });
    }

    function autoGrow(textarea) {
        const fit = () => {
            textarea.style.height = "auto";
            textarea.style.height = `${Math.min(textarea.scrollHeight + 2, 320)}px`;
        };
        textarea.addEventListener("input", fit);
        requestAnimationFrame(fit);
    }

    async function generate(btn, note, code, answer, expected) {
        if (!code.value.trim() || !answer.value.trim()) {
            note.textContent = "Write the code with its blank and the correct answer first.";
            return;
        }
        btn.disabled = true;
        note.textContent = "Running the code...";
        try {
            const response = await fetch("/admin/api/fib-run", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: code.value, answer: answer.value }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || "Could not run the code.");
            if (data.error) {
                expected.value = "";
                note.textContent = `The code can't run: ${data.error}`;
            } else {
                expected.value = data.output;
                note.textContent = data.same_for_any
                    ? 'Filled in - but ANY answer gives this same result. Fill "Must contain" so only the right answer passes.'
                    : "Expected output filled in from a real run.";
            }
        } catch (err) {
            note.textContent = err.message;
        } finally {
            btn.disabled = false;
        }
    }

    function renderFlashcard(item) {
        const f = els.form;
        const r = row(f, "qe-row-3");
        field(r, { name: "front", label: "Front Card", value: item.front, multiline: true, rows: 3, required: true, limit: "flashcard_front", placeholder: "Prompt, term, or question on the front" });
        field(r, { name: "front_code", label: "Code on the card", note: "(optional)", value: item.front_code, code: true, rows: 3, placeholder: "e.g. x = 5\nprint(x * 2)" });
        field(r, { name: "back", label: "Back Card", value: item.back_text, multiline: true, rows: 3, required: true, limit: "flashcard_back", placeholder: "Answer or definition revealed on the back" });
        field(f, { name: "hint", label: "Hint", note: "(shown while answering - never the answer)", value: item.hint, limit: "hint", noCounter: true, placeholder: "Points the way without giving the answer" });
        const r2 = row(f);
        field(r2, { name: "correct_feedback", label: "Feedback when correct", value: item.correct_feedback, limit: "feedback", noCounter: true, placeholder: "Why the answer is right" });
        field(r2, { name: "incorrect_feedback", label: "Feedback when wrong", value: item.incorrect_feedback, limit: "feedback", noCounter: true, placeholder: "Why it is off - without giving the answer" });
    }

    // create-coding-exercise.html's card, same labels and limits.
    function renderExercise(item) {
        const f = els.form;
        field(f, { name: "instruction", label: "Instruction", value: item.instruction, multiline: true, rows: 3, required: true, limit: "ex_instruction", placeholder: "Write instructions here..." });
        const r = row(f, "qe-row-3");
        field(r, { name: "situation", label: "Situation", value: item.situation, multiline: true, rows: 3, required: true, limit: "ex_situation", placeholder: "Describe the situation..." });
        field(r, { name: "problem_question", label: "Question", value: item.problem_question, multiline: true, rows: 3, required: true, limit: "ex_question", placeholder: "State the question..." });
        field(r, { name: "clue", label: "Clue (hint)", value: item.clue, multiline: true, rows: 3, required: true, limit: "ex_clue", placeholder: "Provide a helpful hint..." });
        const r2 = row(f);
        field(r2, { name: "expected_output", label: "Expected Output", note: "(exactly what the program should print)", value: item.expected_output, code: true, rows: 4, required: true, limit: "ex_expected", placeholder: "e.g., Welcome to the School Portal!" });
        field(r2, { name: "correct_feedback", label: "Correct Feedback", value: item.correct_feedback, multiline: true, rows: 4, required: true, limit: "ex_feedback" });
        field(f, { name: "given_input", label: "Given input (optional)", value: item.given_input, code: true, rows: 2, placeholder: "e.g., Alice",
            hint: "One value per line, fed to the learner's input() calls in order. The text an input() prompt shows is not part of the output." });
        if ((item.required || []).length) {
            f.appendChild(el("p", "qe-hint qe-tags", `Must use: ${item.required.join(" · ")} (change these in the full editor)`));
        }
    }

    const RENDER = { mcq: renderMcq, fib: renderFib, flashcard: renderFlashcard, exercise: renderExercise };

    // Only the boxes shown are sent; the server keeps every other saved value.
    function collect() {
        const item = state.item;
        const body = { version: item.version };
        if (item.kind === "mcq") {
            body.question = value("question");
            body.options = item.options.map((o) => ({ id: o.id, text: value(`opt_${o.id}_text`), feedback: value(`opt_${o.id}_feedback`) }));
            const picked = els.form.querySelector("input[name='correct_option_id']:checked");
            body.correct_option_id = picked ? Number(picked.value) : null;
        } else {
            Array.from(els.form.elements).forEach((input) => {
                if (input.name && input.type !== "radio" && input.type !== "button") body[input.name] = input.value;
            });
        }
        return body;
    }

    function snapshot() {
        const body = collect();
        delete body.version;
        return JSON.stringify(body);
    }

    function isDirty() {
        return state && snapshot() !== state.snapshot;
    }

    function showError(message, reload) {
        els.errorText.textContent = message || "";
        els.error.hidden = !message;
        els.reload.hidden = !reload;
        if (message) els.error.scrollIntoView({ block: "nearest" });
    }

    // ---------- open / close ----------
    function open(item, ctx) {
        if (!modal) build();
        state = { item, ctx, snapshot: "", saving: false };
        const isExercise = item.kind === "exercise";
        els.title.textContent = isExercise ? `Edit Exercise #${ctx.number}` : `Edit Item #${ctx.number}`;
        els.parent.textContent = ctx.parentTitle || "";
        els.chip.textContent = ctx.status || "Draft";
        els.chip.className = `qe-chip qe-chip-${String(ctx.status || "Draft").toLowerCase().replace(/\s+/g, "-")}`;

        const live = LIVE.includes(ctx.status);
        els.live.hidden = !live;
        els.live.querySelector("span").textContent = `This ${isExercise ? "exercise" : "activity"} is live. Learners see your change right after you save.`;
        const n = Number(item.answered) || 0;
        els.answered.hidden = n === 0;
        els.answered.querySelector("span").textContent = `${n} learner${n === 1 ? "" : "s"} already ${isExercise ? "submitted this exercise" : "answered this item"}. Their results stay as they are.`;

        showError("");
        els.form.innerHTML = "";
        RENDER[item.kind](item);
        state.snapshot = snapshot();
        els.save.disabled = false;
        modal.hidden = false;
        modal.querySelector(".qe-body").scrollTop = 0;
        document.documentElement.classList.add("qe-open");
        const first = els.form.querySelector("textarea:not([readonly]), input[type='text']:not([readonly])");
        if (first) first.focus({ preventScroll: true });
    }

    function close(force) {
        if (!modal || modal.hidden) return true;
        if (!force && isDirty() && !window.confirm("Discard your changes to this item?")) return false;
        modal.hidden = true;
        document.documentElement.classList.remove("qe-open");
        const trigger = state && state.ctx.trigger;
        state = null;
        if (trigger && document.contains(trigger)) trigger.focus();
        return true;
    }

    async function save() {
        if (!state || state.saving) return;
        const { item, ctx } = state;
        state.saving = true;
        els.save.disabled = true;
        const original = els.save.innerHTML;
        els.save.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Saving...';
        showError("");
        try {
            const response = await fetch(`/admin/quick-edit/${item.kind}/${encodeURIComponent(item.id)}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                body: JSON.stringify(collect()),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                showError(data.message || "Could not save. Please try again.", data.code === "changed");
                return;
            }
            close(true);
            if (ctx.onSaved) ctx.onSaved(data.item);
        } catch (err) {
            showError("Could not reach the server. Please try again.");
        } finally {
            if (state) {
                state.saving = false;
                els.save.disabled = false;
                els.save.innerHTML = original;
            }
        }
    }

    function openFullEditor() {
        if (!state) return;
        const { item, ctx } = state;
        if (isDirty() && !window.confirm("Leave without saving? Your changes in this box are lost.")) return;
        const params = new URLSearchParams();
        let path;
        if (item.kind === "exercise") {
            path = "/admin/coding-exercises/create";
            params.set("exercise_id", item.id);
        } else {
            path = "/admin/create-learning-activity";
            params.set("activity_id", ctx.laId);
        }
        params.set("item", item.id);
        params.set("return", "publishing");
        const tab = TAB_OF_STATUS[ctx.status];
        if (tab) params.set("tab", tab);
        state.snapshot = snapshot();        // no second "discard?" question
        // The preview often runs in a frame on the Publishing page: the WHOLE tab goes to the editor.
        let target = window;
        try { target = window.top || window; } catch (e) { target = window; }
        target.location.href = `${path}?${params.toString()}`;
    }

    window.CobraQuickEdit = { open, close, isOpen: () => !!(modal && !modal.hidden) };
})();
