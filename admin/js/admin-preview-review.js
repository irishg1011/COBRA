/**
 * admin-preview-review.js - the preview's "Review list" tab
 * ---------------------------------------------------------------
 * /admin/preview-play shows the REAL learner game ("Play as learner").
 * Checking 50 questions by playing 50 rounds is slow, so "Review list"
 * shows every question / card / puzzle of the previewed activities -
 * and the lesson's coding exercises - numbered, with the correct answer
 * and the feedback, from GET /admin/preview-play/api/review (staff only;
 * learners never get the answer key).
 * feat/quick-edit-items: the search is the shared find bar
 * (cobra-find-bar.js, same as the editors). Mentors get a pencil on each
 * item -> Quick edit (admin-quick-edit.js); a saved item is redrawn in
 * place. Admins never see the pencil.
 * All database text goes in through textContent.
 */
(function () {
    "use strict";

    const tabs = Array.from(document.querySelectorAll("[data-preview-mode]"));
    const panel = document.getElementById("previewReview");
    const body = document.getElementById("previewReviewBody");
    if (!tabs.length || !panel || !body) return;

    const pageCanEdit = panel.dataset.canEdit === "1";
    let loaded = false;
    let canEdit = false;
    let limits = {};
    let findBar = null;

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
        card.dataset.n = n;
        const head = el("div", "rv-item-head");
        head.appendChild(el("span", "rv-num", `#${n}`));
        head.appendChild(el("span", "rv-q", title || "(no text)"));
        card.appendChild(head);
        return card;
    }

    // ctx: { number, parentTitle, status, laId }
    function addPencil(card, item, ctx) {
        card.dataset.kind = item.kind;
        card.dataset.itemId = item.id;
        if (!canEdit) return;
        const btn = el("button", "rv-edit");
        btn.type = "button";
        btn.title = "Quick edit";
        btn.setAttribute("aria-label", `Quick edit ${item.kind === "exercise" ? "exercise" : "item"} #${ctx.number}`);
        btn.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
        btn.addEventListener("click", () => {
            if (!window.CobraQuickEdit) return;
            CobraQuickEdit.open(item, Object.assign({}, ctx, {
                limits,
                trigger: btn,
                onSaved: (fresh) => replaceItem(card, fresh, ctx),
                onReload: reloadAndOpen,
            }));
        });
        card.querySelector(".rv-item-head").appendChild(btn);
    }

    const BUILDERS = { mcq: (i, n) => mcqItem(i, n), fib: (i, n) => fibItem(i, n), flashcard: (i, n) => flashcardItem(i, n), exercise: (i, n) => exerciseItem(i, n) };

    function buildItem(item, ctx) {
        const card = BUILDERS[item.kind](item, ctx.number);
        addPencil(card, item, ctx);
        return card;
    }

    // A saved item is redrawn where it was - the rest of the list stays.
    function replaceItem(oldCard, fresh, ctx) {
        const status = fresh.status || ctx.status;
        const next = buildItem(fresh, Object.assign({}, ctx, { status }));
        next.classList.add("rv-saved");
        oldCard.replaceWith(next);
        setTimeout(() => next.classList.remove("rv-saved"), 1800);
        if (findBar) findBar.refresh();
        toast("Saved");
    }

    let toastTimer = null;
    function toast(message) {
        let box = document.getElementById("rvToast");
        if (!box) {
            box = el("div", "rv-toast");
            box.id = "rvToast";
            box.setAttribute("role", "status");
            document.body.appendChild(box);
        }
        box.innerHTML = '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> ';
        box.appendChild(document.createTextNode(message));
        box.classList.add("is-shown");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => box.classList.remove("is-shown"), 2200);
    }

    // "Changed by someone else - Reload": fresh list, then the same item again.
    async function reloadAndOpen(kind, id) {
        await load();
        const card = body.querySelector(`.rv-item[data-kind="${kind}"][data-item-id="${id}"]`);
        const btn = card && card.querySelector(".rv-edit");
        if (btn) {
            card.scrollIntoView({ block: "center" });
            btn.click();
        }
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
        return card;
    }

    function fibItem(item, n) {
        const card = itemCard(n, item.content || item.instruction);
        if (item.content) field(card, "Instruction", item.instruction);
        field(card, "Code", item.code_text, { pre: true });
        field(card, "Correct answer", item.correct_answer, { cls: "is-answer" });
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
        (data.activities || []).forEach((act) => {
            const n = (act.items || []).length;
            const box = section(act.title, `${act.type} · ${n} item${n === 1 ? "" : "s"}`, act.status);
            (act.items || []).forEach((item, i) => {
                if (BUILDERS[item.kind]) {
                    box.appendChild(buildItem(item, { number: i + 1, parentTitle: act.title, status: act.status, laId: act.la_id }));
                }
            });
            if (!n) box.appendChild(el("p", "preview-review-empty", "No items yet."));
            body.appendChild(box);
        });
        const exercises = data.exercises || [];
        if (exercises.length) {
            const box = section("Coding exercises", `${exercises.length} in this lesson · each learner gets one at random`);
            exercises.forEach((ex, i) => box.appendChild(buildItem(ex, { number: i + 1, parentTitle: ex.title, status: ex.status })));
            body.appendChild(box);
        }
        if (!body.children.length) body.appendChild(el("p", "preview-review-empty", "Nothing to review in this preview."));
        if (findBar) findBar.refresh();
    }

    // Sections whose items are all hidden by "Show matches only" hide too.
    function syncSections() {
        body.querySelectorAll(".rv-section").forEach((box) => {
            const items = box.querySelectorAll(".rv-item");
            box.hidden = items.length > 0 && Array.from(items).every((i) => i.classList.contains("cfb-hidden"));
        });
    }

    async function load() {
        loaded = true;
        const query = (window.COBRA_PREVIEW_MODE && window.COBRA_PREVIEW_MODE.query) || "";
        try {
            const response = await fetch(`/admin/preview-play/api/review?${query}`, { credentials: "include" });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || "Could not load the review list.");
            canEdit = pageCanEdit && data.can_edit === true;
            limits = data.limits || {};
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
    if (window.CobraFindBar) {
        findBar = CobraFindBar.attach({
            before: body,
            items: () => Array.from(body.querySelectorAll(".rv-item")),
            textOf: (card) => card.textContent,
            numberOf: (card) => Number(card.dataset.n),
            placeholder: "Search questions, answers, feedback...",
            noun: "item",
            onChange: syncSections,
        });
    }
})();
