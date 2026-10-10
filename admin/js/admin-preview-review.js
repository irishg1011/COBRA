/**
 * admin-preview-review.js - the preview's "Review list" tab
 * ---------------------------------------------------------------
 * /admin/preview-play shows the REAL learner game ("Play as learner").
 * Checking 50 questions by playing 50 rounds is slow, so "Review list"
 * shows every question / card / puzzle of the previewed activities -
 * and the lesson's coding exercises - numbered, with the correct answer
 * and the feedback, from GET /admin/preview-play/api/review (staff only;
 * learners never get the answer key). Search filters the list.
 * All database text goes in through textContent.
 */
(function () {
    "use strict";

    const tabs = Array.from(document.querySelectorAll("[data-preview-mode]"));
    const panel = document.getElementById("previewReview");
    const body = document.getElementById("previewReviewBody");
    const search = document.getElementById("previewReviewSearch");
    const count = document.getElementById("previewReviewCount");
    if (!tabs.length || !panel || !body) return;

    let loaded = false;

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null && text !== "") node.textContent = text;
        return node;
    }

    // "Label: value" row; skipped when the value is empty.
    function field(parent, label, value, opts) {
        if (!value) return;
        const row = el("div", "rv-field" + (opts && opts.cls ? " " + opts.cls : ""));
        row.appendChild(el("span", "rv-label", label));
        row.appendChild(el(opts && opts.pre ? "pre" : "span", "rv-value", value));
        parent.appendChild(row);
    }

    function itemCard(n, title) {
        const card = el("article", "rv-item");
        const head = el("div", "rv-item-head");
        head.appendChild(el("span", "rv-num", `#${n}`));
        head.appendChild(el("span", "rv-q", title || "(no text)"));
        card.appendChild(head);
        return card;
    }

    function mcqItem(item, n) {
        const card = itemCard(n, item.question);
        const list = el("ul", "rv-options");
        (item.options || []).forEach((o) => {
            const li = el("li", "rv-option" + (o.correct ? " is-correct" : ""));
            li.appendChild(el("b", "rv-letter", o.letter));
            li.appendChild(el("span", "", o.text));
            if (o.correct) li.appendChild(el("span", "rv-tag", "Correct"));
            if (o.feedback) li.appendChild(el("small", "rv-option-fb", o.feedback));
            list.appendChild(li);
        });
        card.appendChild(list);
        field(card, "Feedback if right", item.correct_feedback);
        field(card, "Feedback if wrong", item.incorrect_feedback);
        return card;
    }

    function fibItem(item, n) {
        const card = itemCard(n, item.content || item.instruction);
        if (item.content) field(card, "Instruction", item.instruction);
        field(card, "Code", item.code_text, { pre: true });
        field(card, "Correct answer", item.correct_answer, { cls: "is-answer" });
        field(card, "Wrong choices (tiles)", (item.wrong_choices || []).join(" · "));
        field(card, "Expected output", item.expected_output, { pre: true });
        field(card, "Hint", item.hint);
        field(card, "Feedback if right", item.correct_feedback);
        field(card, "Feedback if wrong", item.incorrect_feedback);
        return card;
    }

    function flashcardItem(item, n) {
        const card = itemCard(n, item.front_text);
        field(card, "Back (answer)", item.back_text, { cls: "is-answer", pre: /\n/.test(item.back_text || "") });
        field(card, "Hint", item.hint);
        field(card, "Feedback if right", item.correct_feedback);
        field(card, "Feedback if wrong", item.incorrect_feedback);
        return card;
    }

    function exerciseItem(ex, n) {
        const card = itemCard(n, ex.title);
        card.querySelector(".rv-item-head").appendChild(el("span", "rv-status", ex.status));
        field(card, "Instruction", ex.instruction);
        field(card, "Situation", ex.situation);
        field(card, "Question", ex.question);
        field(card, "Clue", ex.clue);
        field(card, "Must use", (ex.required || []).join(" · "));
        field(card, "Given input", ex.given_input, { pre: true });
        field(card, "Expected output", ex.expected_output, { pre: true, cls: "is-answer" });
        field(card, "Feedback if right", ex.correct_feedback);
        return card;
    }

    function section(title, meta, status) {
        const box = el("section", "rv-section");
        const head = el("div", "rv-section-head");
        const left = el("div");
        left.appendChild(el("span", "rv-eyebrow", meta));
        left.appendChild(el("h3", "rv-title", title));
        head.appendChild(left);
        if (status) head.appendChild(el("span", "rv-status", status));
        box.appendChild(head);
        return box;
    }

    function render(data) {
        body.innerHTML = "";
        const builders = { "Multiple Choice": mcqItem, "Fill in the Blanks": fibItem, "Flashcards": flashcardItem };
        (data.activities || []).forEach((act) => {
            const n = (act.items || []).length;
            const box = section(act.title, `${act.type} · ${n} item${n === 1 ? "" : "s"}`, act.status);
            const build = builders[act.type];
            (act.items || []).forEach((item, i) => { if (build) box.appendChild(build(item, i + 1)); });
            if (!n) box.appendChild(el("p", "preview-review-empty", "No items yet."));
            body.appendChild(box);
        });
        const exercises = data.exercises || [];
        if (exercises.length) {
            const box = section("Coding exercises", `${exercises.length} in this lesson · each learner gets one at random`);
            exercises.forEach((ex, i) => box.appendChild(exerciseItem(ex, i + 1)));
            body.appendChild(box);
        }
        if (!body.children.length) body.appendChild(el("p", "preview-review-empty", "Nothing to review in this preview."));
        applySearch();
    }

    function applySearch() {
        const words = (search.value || "").trim().toLowerCase();
        let shown = 0, all = 0;
        body.querySelectorAll(".rv-section").forEach((box) => {
            let inBox = 0;
            box.querySelectorAll(".rv-item").forEach((item) => {
                all++;
                const hit = !words || item.textContent.toLowerCase().includes(words);
                item.hidden = !hit;
                if (hit) { shown++; inBox++; }
            });
            box.hidden = !!words && inBox === 0;
        });
        count.textContent = words ? `${shown} of ${all} shown` : `${all} item${all === 1 ? "" : "s"}`;
    }

    async function load() {
        loaded = true;
        const query = (window.COBRA_PREVIEW_MODE && window.COBRA_PREVIEW_MODE.query) || "";
        try {
            const response = await fetch(`/admin/preview-play/api/review?${query}`, { credentials: "include" });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || "Could not load the review list.");
            render(data);
        } catch (err) {
            loaded = false;   // try again next time the tab is opened
            body.innerHTML = "";
            body.appendChild(el("p", "preview-review-empty is-error", err.message || "Could not load the review list."));
        }
    }

    function setMode(mode) {
        const review = mode === "review";
        tabs.forEach((t) => {
            const on = t.dataset.previewMode === mode;
            t.classList.toggle("is-active", on);
            t.setAttribute("aria-selected", on ? "true" : "false");
        });
        panel.hidden = !review;
        document.documentElement.classList.toggle("preview-reviewing", review);
        if (review && !loaded) load();
    }

    tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.previewMode)));
    search.addEventListener("input", applySearch);
})();
