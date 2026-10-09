// Global submission state flag to suppress beforeunload alert on intended saves/navigation
let isSubmitting = false;

/* =================================================================
   Task #113: Custom Info / Alert Modal (Reuses #confirmActionModal)
==================================================================== */
function showInfoModal(message, title = "Required Field Missing", onOk = null) {
    const modal = document.getElementById("confirmActionModal");
    const modalTitle = document.getElementById("confirmActionTitle");
    const modalText = document.getElementById("confirmActionText");
    const cancelBtn = document.getElementById("confirmActionCancelBtn");
    const confirmBtn = document.getElementById("confirmActionConfirmBtn");

    if (!modal) {
        alert(message);
        if (typeof onOk === "function") onOk();
        return;
    }

    if (modalTitle) modalTitle.textContent = title;
    if (modalText) modalText.textContent = message;
    if (cancelBtn) cancelBtn.style.display = "none";
    if (confirmBtn) {
        confirmBtn.textContent = "OK";
        confirmBtn.className = "modal-btn-save";
    }

    modal.classList.remove("modal-hidden");
    modal.style.display = "flex";

    function cleanup() {
        modal.classList.add("modal-hidden");
        modal.style.display = "none";
        if (cancelBtn) cancelBtn.style.display = "";
        if (confirmBtn) {
            confirmBtn.removeEventListener("click", handleOk);
            confirmBtn.textContent = "Confirm";
        }
        modal.removeEventListener("click", handleOverlay);
        document.removeEventListener("keydown", handleKeydown);
    }

    function handleOk() {
        cleanup();
        if (typeof onOk === "function") onOk();
    }

    function handleOverlay(e) {
        if (e.target === modal) {
            cleanup();
            if (typeof onOk === "function") onOk();
        }
    }

    function handleKeydown(e) {
        if (e.key === "Escape" || e.key === "Enter") {
            cleanup();
            if (typeof onOk === "function") onOk();
        }
    }

    if (confirmBtn) confirmBtn.addEventListener("click", handleOk);
    modal.addEventListener("click", handleOverlay);
    document.addEventListener("keydown", handleKeydown);
}

/* =================================================================
   feat/exercise-cards: ONE page for all coding exercises of a lesson
   -----------------------------------------------------------------
   A lesson holds a pool of up to EXERCISE_POOL_MAX (5) coding exercises
   (each learner gets one at random). Like the activity editor's items,
   every exercise is a card ("Coding Exercise 1", "2", ...), "+ Add"
   adds one, the trash icon removes one, and the header Save saves
   every changed card (each through /admin/coding-exercises/save-draft,
   so all the old save rules still run on the server).

   Each card keeps its own status (Draft / Ready to Publish / Published)
   and its own Preview and status button. Exercises still go live from
   the Publishing page.
==================================================================== */
const EXERCISE_POOL_MAX = 5;
const EXERCISE_FIELDS = ["instruction", "situation", "problem_question", "clue",
    "expected_answer", "given_input", "correct_feedback"];
// First letter capital, the rest as typed (Expected Output / Given input
// are kept exactly as typed).
const EXERCISE_CASED_FIELDS = ["instruction", "situation", "problem_question", "clue", "correct_feedback"];
const TAG_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

let currentLessonId = "";
let lessonLoadToken = 0;

function exerciseCards() {
    return Array.from(document.querySelectorAll("#exerciseCards .exercise-card"));
}

function cardField(card, field) {
    return card.querySelector(`[data-field="${field}"]`);
}

function cardValues(card) {
    const values = {};
    EXERCISE_FIELDS.forEach((field) => {
        const el = cardField(card, field);
        values[field] = el ? el.value : "";
    });
    values.required_tags = Array.from(card.querySelectorAll(".js-tags-selected .required-tag-chip"))
        .map((chip) => chip.dataset.key);
    return values;
}

function cardSnapshot(card) {
    return JSON.stringify(cardValues(card));
}

function cardIsDirty(card) {
    return card.dataset.snapshot !== cardSnapshot(card);
}

function cardHasContent(card) {
    const v = cardValues(card);
    return EXERCISE_FIELDS.some((f) => (v[f] || "").trim()) || v.required_tags.length > 0;
}

function hasUnsavedExerciseChanges() {
    return exerciseCards().some((card) => card.dataset.exerciseId ? cardIsDirty(card) : cardHasContent(card));
}
// Old name, still used by the unsaved-changes guard below.
function hasPopulatedExerciseInputs() {
    return hasUnsavedExerciseChanges();
}

function lessonName() {
    const lessonSelect = document.getElementById("exerciseLesson");
    if (!lessonSelect || !lessonSelect.value) return "";
    const option = lessonSelect.options[lessonSelect.selectedIndex];
    return option ? option.textContent.trim() : "";
}

function cardTitle(card) {
    const number = card.dataset.number;
    const lesson = lessonName();
    const label = number ? `Coding Exercise ${number}` : "New Coding Exercise";
    return lesson ? `${lesson} – ${label}` : label;
}

/* ---------------- one card ---------------- */
const STATUS_BUTTONS = {
    "Draft": { action: "mark-ready", icon: "fa-circle-check", label: "Mark Ready", cls: "is-ready" },
    "Ready to Publish": { action: "move-to-draft", icon: "fa-rotate-left", label: "Move to Draft", cls: "" },
    "Published": { action: "unpublish", icon: "fa-arrow-rotate-left", label: "Unpublish", cls: "is-danger" },
};

function renderCardHeader(card) {
    card.querySelector(".js-ex-title").textContent = card.dataset.number
        ? `Coding Exercise ${card.dataset.number}` : "New Coding Exercise";
    const status = card.dataset.status || "";
    const chip = card.querySelector(".js-ex-status");
    chip.textContent = status || "Not saved yet";
    chip.className = "exercise-status-chip js-ex-status is-" + (status || "new").toLowerCase().replace(/\s+/g, "-");
    card.querySelector(".js-ex-points").textContent = `${card.dataset.points || 10} pts`;

    const slot = card.querySelector(".js-ex-status-action");
    slot.innerHTML = "";
    const def = STATUS_BUTTONS[status];
    if (!def) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `exercise-status-btn js-ex-status-btn ${def.cls}`;
    btn.dataset.action = def.action;
    btn.innerHTML = `<i class="fa-solid ${def.icon}"></i> ${def.label}`;
    slot.appendChild(btn);
}

function setupCardCounters(card) {
    card.querySelectorAll("textarea[data-max]").forEach((textarea) => {
        const counter = textarea.parentElement.querySelector(".char-counter");
        const max = Number(textarea.dataset.max);
        const update = () => {
            if (!counter) return;
            counter.textContent = `${textarea.value.length} / ${max}`;
            counter.style.color = textarea.value.length >= max ? "#ef4444" : "#94a3b8";
        };
        textarea.maxLength = max;
        update();
        textarea.addEventListener("input", update);
    });
}

function setupCardCasing(card) {
    EXERCISE_CASED_FIELDS.forEach((field) => {
        const input = cardField(card, field);
        if (!input) return;
        input.addEventListener("input", () => {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            input.value = input.value.replace(/^(\s*)(\S)/, (m, space, ch) => space + ch.toUpperCase());
            if (start !== null && end !== null) input.setSelectionRange(start, end);
        });
    });
}

// "Required in the code" picker, one per card. Each chip carries its
// "kind:value" key; Save sends the card's keys as required_tags.
function setupCardTags(card, tags) {
    const block = card.querySelector(".js-tags");
    const selected = card.querySelector(".js-tags-selected");
    const picker = card.querySelector(".js-tags-picker");
    const emptyNote = card.querySelector(".js-tags-empty");
    const customInput = card.querySelector(".js-tags-custom");
    const customBtn = card.querySelector(".js-tags-custom-add");
    const customError = card.querySelector(".js-tags-custom-error");
    const maxLength = parseInt(block.dataset.maxNameLength, 10) || 50;
    const keywords = new Set((block.dataset.keywords || "").split(" ").filter(Boolean));

    const chipFor = (key) => Array.from(selected.querySelectorAll(".required-tag-chip")).find((c) => c.dataset.key === key);
    const optionFor = (key) => Array.from(picker.querySelectorAll(".required-tag-option")).find((o) => o.dataset.key === key);

    function refresh() {
        const keys = new Set(Array.from(selected.querySelectorAll(".required-tag-chip")).map((c) => c.dataset.key));
        picker.querySelectorAll(".required-tag-option").forEach((option) => {
            const on = keys.has(option.dataset.key);
            option.classList.toggle("is-selected", on);
            option.setAttribute("aria-pressed", on ? "true" : "false");
        });
        if (emptyNote) emptyNote.hidden = keys.size > 0;
    }

    function addChip(key, label, silent) {
        if (chipFor(key)) return;
        const chip = document.createElement("span");
        chip.className = "required-tag-chip";
        chip.dataset.key = key;
        const text = document.createElement("span");
        text.className = "required-tag-chip-label";
        text.textContent = label;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "required-tag-remove";
        remove.setAttribute("aria-label", `Remove ${label}`);
        remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        chip.append(text, remove);
        selected.insertBefore(chip, emptyNote || null);
        refresh();
        if (!silent) updateExercisePageState();
    }

    function removeChip(key) {
        const chip = chipFor(key);
        if (!chip) return;
        chip.remove();
        refresh();
        updateExercisePageState();
    }

    picker.addEventListener("click", (e) => {
        const option = e.target.closest(".required-tag-option");
        if (!option) return;
        if (chipFor(option.dataset.key)) removeChip(option.dataset.key);
        else addChip(option.dataset.key, option.dataset.label);
    });
    selected.addEventListener("click", (e) => {
        const removeBtn = e.target.closest(".required-tag-remove");
        if (removeBtn) removeChip(removeBtn.closest(".required-tag-chip").dataset.key);
    });

    function showCustomError(message) {
        if (customError) customError.textContent = message;
        if (customInput) customInput.classList.toggle("field-error", !!message);
    }
    function addCustomTag() {
        // Exactly as typed - no first-letter capital. A leading dot means a method.
        let name = customInput.value.trim();
        const isMethod = name.startsWith(".");
        name = name.replace(/^\./, "").replace(/\(\)$/, "");
        if (!name) {
            showCustomError("Type a function or method name first.");
            return;
        }
        if (name.length > maxLength || !TAG_NAME_RE.test(name) || keywords.has(name)) {
            showCustomError(`Use a Python name: letters, digits and _ only, not starting with a digit, up to ${maxLength} characters (and not a keyword like "for").`);
            return;
        }
        const kind = isMethod ? "method" : "function";
        const key = `${kind}:${name}`;
        const option = optionFor(key);
        addChip(key, option ? option.dataset.label : (isMethod ? `.${name}()` : `${name}()`));
        customInput.value = "";
        showCustomError("");
    }
    customBtn.addEventListener("click", addCustomTag);
    customInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();   // never submit the whole form from here
            addCustomTag();
        }
    });
    customInput.addEventListener("input", () => showCustomError(""));

    (tags || []).forEach((tag) => addChip(`${tag.kind}:${tag.value}`, tag.label, true));
    refresh();
}

function buildExerciseCard(data) {
    const template = document.getElementById("exerciseCardTemplate");
    const card = template.content.firstElementChild.cloneNode(true);
    data = data || {};
    if (data.exercise_id) card.dataset.exerciseId = data.exercise_id;
    if (data.number) card.dataset.number = data.number;
    card.dataset.status = data.status || "";
    card.dataset.points = data.points || 10;
    EXERCISE_FIELDS.forEach((field) => {
        const el = cardField(card, field);
        if (el) el.value = data[field] || "";
    });
    card.querySelector(".js-ex-legacy").hidden = !data.legacy_prefilled;
    setupCardTags(card, data.required_tags);
    setupCardCounters(card);
    setupCardCasing(card);
    renderCardHeader(card);
    // A legacy exercise was filled in from its test case - unsaved until saved.
    card.dataset.snapshot = data.legacy_prefilled ? "" : cardSnapshot(card);
    card.addEventListener("input", (e) => {
        if (e.target.classList.contains("field-error")) e.target.classList.remove("field-error");
        updateExercisePageState();
    });
    return card;
}

/* ---------------- the page ---------------- */
function updateExercisePageState() {
    const cards = exerciseCards();
    const lesson = lessonName();
    const note = document.getElementById("exercisePoolCount");
    const addRow = document.getElementById("addExerciseRow");
    const addBtn = document.getElementById("addExerciseBtn");
    const empty = document.getElementById("noExercisesMessage");
    if (empty) {
        empty.hidden = !!(lesson && cards.length);
        empty.textContent = lesson ? "This lesson has no coding exercises yet. Click Add below."
            : "Select a lesson to see its coding exercises.";
    }
    if (addRow) addRow.hidden = !lesson;
    if (addBtn) addBtn.disabled = cards.length >= EXERCISE_POOL_MAX;
    if (note) {
        note.hidden = !lesson;
        const n = cards.length;
        note.classList.toggle("is-under", n < EXERCISE_POOL_MAX);
        note.classList.toggle("is-full", n >= EXERCISE_POOL_MAX);
        note.textContent = n >= EXERCISE_POOL_MAX
            ? `This lesson has ${n} / ${EXERCISE_POOL_MAX} coding exercises - the most it can have. Each learner gets one of them at random.`
            : `This lesson has ${n} / ${EXERCISE_POOL_MAX} coding exercises. Each learner gets one of them at random - add ${EXERCISE_POOL_MAX - n} more (you can still save and publish).`;
    }
    cards.forEach((card) => card.classList.toggle("is-dirty", card.dataset.exerciseId ? cardIsDirty(card) : cardHasContent(card)));
}

function addExerciseCard(data, scroll) {
    if (exerciseCards().length >= EXERCISE_POOL_MAX) {
        showInfoModal(`A lesson can have at most ${EXERCISE_POOL_MAX} coding exercises.`, "Pool is full");
        return null;
    }
    const card = buildExerciseCard(data);
    document.getElementById("exerciseCards").appendChild(card);
    updateExercisePageState();
    if (scroll) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        const first = cardField(card, "instruction");
        if (first) first.focus({ preventScroll: true });
    }
    return card;
}

async function loadLessonExercises() {
    const lessonSelect = document.getElementById("exerciseLesson");
    const container = document.getElementById("exerciseCards");
    const lessonId = lessonSelect && lessonSelect.value ? lessonSelect.value : "";
    const token = ++lessonLoadToken;
    currentLessonId = lessonId;
    exerciseCards().forEach((card) => card.remove());
    updateExercisePageState();
    if (!lessonId) return;
    try {
        const response = await fetch(`/admin/coding-exercises/lesson-exercises?resource_id=${encodeURIComponent(lessonId)}`,
            { credentials: "include" });
        const result = await response.json();
        if (token !== lessonLoadToken) return;   // the lesson changed again meanwhile
        (result.exercises || []).forEach((ex) => container.appendChild(buildExerciseCard(ex)));
    } catch (err) {
        console.error("create-exercise: failed to load the lesson's exercises:", err);
    }
    if (token !== lessonLoadToken) return;
    updateExercisePageState();

    const form = document.getElementById("createExerciseForm");
    const focusId = form ? form.dataset.focusExerciseId : "";
    const focusCard = focusId && exerciseCards().find((c) => c.dataset.exerciseId === String(focusId));
    if (focusCard) {
        focusCard.classList.add("is-focused");
        focusCard.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => focusCard.classList.remove("is-focused"), 2500);
    } else if (!focusId && exerciseCards().length < EXERCISE_POOL_MAX) {
        // Opened to create one ("Create Exercise" / Publishing "+"): a blank card.
        addExerciseCard(null, exerciseCards().length > 0);
    }
}

/* ---------------- checks ---------------- */
const REQUIRED_FOR_READY = [
    ["instruction", "Please provide Instructions"],
    ["situation", "Please describe the Problem Situation"],
    ["problem_question", "Please state the Problem Question"],
    ["clue", "Please provide a Clue (hint)"],
    ["expected_answer", "Please provide the Expected Output"],
    ["correct_feedback", "Please provide Correct Feedback"],
];

function lessonSelected() {
    const ids = ["exerciseCategory", "exerciseModule", "exerciseLesson"];
    let ok = true;
    ids.forEach((id) => {
        const el = document.getElementById(id);
        const has = !!(el && el.value);
        if (el) el.classList.toggle("field-error", !has);
        if (!has) ok = false;
    });
    if (!ok) showInfoModal("Please select Category, Module, and Lesson first.", "Required Field Missing");
    return ok;
}

// full = every required field (Mark Ready); otherwise just "has something".
function validateExerciseCard(card, full) {
    let firstField = null;
    let message = "";
    const label = card.querySelector(".js-ex-title").textContent;
    if (full) {
        REQUIRED_FOR_READY.forEach(([field, text]) => {
            const el = cardField(card, field);
            const empty = !el || !el.value.trim();
            if (el) el.classList.toggle("field-error", empty);
            if (empty && !firstField) {
                firstField = el;
                message = `${label}: ${text} before marking it ready.`;
            }
        });
    } else if (!cardHasContent(card)) {
        const el = cardField(card, "instruction");
        if (el) el.classList.add("field-error");
        firstField = el;
        message = `${label} is empty - fill it in, or delete it with its trash icon.`;
    }
    if (firstField) {
        showInfoModal(message, "Required Field Missing", () => {
            firstField.scrollIntoView({ behavior: "smooth", block: "center" });
            firstField.focus({ preventScroll: true });
        });
        return false;
    }
    return true;
}

// Kept for admin-editor-preview.js (it checks this exists).
function validateExerciseForm() {
    return lessonSelected();
}

/* ---------------- save ---------------- */
function cardPayload(card, action) {
    const values = cardValues(card);
    return Object.assign(values, {
        exercise_id: card.dataset.exerciseId || "",
        resource_id: currentLessonId,
        points: card.dataset.points || 10,
        action: action || "draft",
    });
}

async function postExerciseCard(card, url, action) {
    const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(cardPayload(card, action)),
    });
    const result = await response.json().catch(() => ({ success: false, message: "Unexpected server response." }));
    if (result.success && result.exercise_id) {
        card.dataset.exerciseId = result.exercise_id;
        card.dataset.snapshot = cardSnapshot(card);
    }
    return result;
}

function returnUrlAfterSave(exerciseId) {
    const fallback = `/admin/coding-exercises/create?exercise_id=${encodeURIComponent(exerciseId || "")}`;
    const url = typeof window.cobraEditorReturnUrl === "function"
        ? window.cobraEditorReturnUrl("/admin/coding-exercises", "exercise", exerciseId) : "/admin/coding-exercises";
    return url || fallback;
}

// Saves every changed card in order (new ones get the next free number).
// Returns the id of the last saved card, or null when something failed.
async function saveAllExercises() {
    if (!lessonSelected()) return null;
    const toSave = exerciseCards().filter((card) => card.dataset.exerciseId ? cardIsDirty(card) : true);
    for (const card of toSave) {
        if (!validateExerciseCard(card, false)) return null;
    }
    let lastId = exerciseCards().length ? exerciseCards()[0].dataset.exerciseId : null;
    for (const card of toSave) {
        const result = await postExerciseCard(card, "/admin/coding-exercises/save-draft", "draft");
        if (!result.success) {
            showInfoModal(`${card.querySelector(".js-ex-title").textContent}: ${result.message || "Could not save."}`, "Save Error");
            card.scrollIntoView({ behavior: "smooth", block: "start" });
            return null;
        }
        lastId = result.exercise_id;
    }
    return lastId || "saved";
}

function setupSaveAllHandler() {
    const saveBtn = document.getElementById("saveDraftBtn");
    if (!saveBtn) return;
    saveBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const originalHtml = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        try {
            const savedId = await saveAllExercises();
            if (savedId) {
                isSubmitting = true;
                if (typeof window.cobraEditorToast === "function") window.cobraEditorToast("Coding exercises saved.");
                window.location.href = returnUrlAfterSave(savedId === "saved" ? "" : savedId);
                return;
            }
        } catch (err) {
            console.error("Failed to save exercises:", err);
            showInfoModal("An unexpected error occurred while saving.", "Save Error");
        }
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHtml;
    });
}

/* ---------------- per-card buttons ---------------- */
function reloadThisLesson(exerciseId) {
    isSubmitting = true;
    const params = new URLSearchParams(window.location.search);
    if (exerciseId) params.set("exercise_id", exerciseId);
    window.location.href = `${window.location.pathname}?${params.toString()}`;
}

function otherCardsDirty(card) {
    return exerciseCards().some((c) => c !== card && (c.dataset.exerciseId ? cardIsDirty(c) : cardHasContent(c)));
}

async function onStatusButton(card, btn) {
    const action = btn.dataset.action;
    if (otherCardsDirty(card)) {
        showInfoModal("Other exercises on this page have unsaved changes. Click Save first, then change this one's status.", "Save first");
        return;
    }
    if (action === "mark-ready") {
        if (!lessonSelected() || !validateExerciseCard(card, true)) return;
        btn.disabled = true;
        // Saves this card and marks it Ready to Publish (same as the old Mark Ready).
        const result = await postExerciseCard(card, "/admin/coding-exercises/create", "publish");
        if (!result.success) {
            showInfoModal(result.message || "Could not mark it ready.", "Error");
            btn.disabled = false;
            return;
        }
        if (typeof window.cobraEditorToast === "function") window.cobraEditorToast(result.message || "Marked ready.");
        setTimeout(() => reloadThisLesson(result.exercise_id), 900);
        return;
    }
    if (cardIsDirty(card)) {
        showInfoModal("Save this exercise's changes first.", "Save first");
        return;
    }
    const texts = {
        "move-to-draft": ["Move to Draft?", "Move this coding exercise back to Draft?"],
        "unpublish": ["Unpublish Coding Exercise?", "Unpublish this coding exercise? Learners won't see it until it's published again. Their submissions are kept."],
    }[action];
    window.cobraEditorConfirm(texts[1], texts[0], async () => {
        btn.disabled = true;
        const result = await window.cobraEditorStatusAction("exercise", card.dataset.exerciseId, action);
        if (!result.success) {
            window.cobraEditorToast(result.message || "Could not change the status.", true);
            btn.disabled = false;
            return;
        }
        window.cobraEditorToast(result.message || "Status updated.");
        setTimeout(() => reloadThisLesson(card.dataset.exerciseId), 900);
    });
}

async function onDeleteCard(card) {
    const exerciseId = card.dataset.exerciseId;
    const title = card.querySelector(".js-ex-title").textContent;
    if (!exerciseId) {
        if (!cardHasContent(card)) {
            card.remove();
            updateExercisePageState();
            return;
        }
        window.cobraEditorConfirm(`Delete ${title}? It was never saved.`, "Delete Exercise?", () => {
            card.remove();
            updateExercisePageState();
        });
        return;
    }
    // A saved exercise is archived (its learners' submissions are kept) -
    // the same rules as the Archive button on the Coding Exercises page.
    try {
        const check = await (await fetch(`/admin/coding-exercises/${exerciseId}/archive-check`, { credentials: "include" })).json();
        if (!check.success) {
            showInfoModal(check.message || "Could not check this exercise.", "Error");
            return;
        }
        if (!check.eligible) {
            // The only blocker an exercise has is its own Published status.
            showInfoModal(`${title} is published - unpublish it first (its Unpublish button), then delete it.`, "Can't delete yet");
            return;
        }
    } catch (err) {
        showInfoModal("Could not reach the server. Please try again.", "Error");
        return;
    }
    window.cobraEditorConfirm(`Delete ${title}? It moves to Archived - learners' submissions are kept and it can be restored.`,
        "Delete Exercise?", async () => {
            const result = await (await fetch(`/admin/coding-exercises/${exerciseId}/archive`, {
                method: "POST", credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" },
            })).json().catch(() => ({ success: false }));
            if (!result.success) {
                showInfoModal(result.message || "Could not delete the exercise.", "Error");
                return;
            }
            window.cobraEditorToast(result.message || "Exercise deleted.");
            card.remove();
            updateExercisePageState();
        });
}

function setupCardButtons() {
    const container = document.getElementById("exerciseCards");
    container.addEventListener("click", (e) => {
        const card = e.target.closest(".exercise-card");
        if (!card) return;
        const statusBtn = e.target.closest(".js-ex-status-btn");
        if (statusBtn) {
            e.preventDefault();
            onStatusButton(card, statusBtn);
            return;
        }
        if (e.target.closest(".js-ex-delete")) {
            e.preventDefault();
            onDeleteCard(card);
            return;
        }
        if (e.target.closest(".js-ex-preview")) {
            e.preventDefault();
            if (typeof window.cobraPreviewExerciseCard === "function") {
                const v = cardValues(card);
                window.cobraPreviewExerciseCard({
                    title: cardTitle(card),
                    situation: v.situation,
                    question: v.problem_question,
                    clue: v.clue,
                    expected: v.expected_answer,
                    tags: Array.from(card.querySelectorAll(".js-tags-selected .required-tag-chip-label")).map((l) => l.textContent),
                    isNew: !card.dataset.exerciseId,
                    dirty: card.dataset.exerciseId ? cardIsDirty(card) : cardHasContent(card),
                });
            }
        }
    });
    document.getElementById("addExerciseBtn").addEventListener("click", () => addExerciseCard(null, true));
}

// Switching the lesson would drop unsaved cards - ask first.
function setupLessonSwitchGuard() {
    ["exerciseCategory", "exerciseModule", "exerciseLesson"].forEach((id) => {
        const select = document.getElementById(id);
        if (!select) return;
        let previous = select.value;
        select.addEventListener("focus", () => { previous = select.value; });
        select.addEventListener("change", (e) => {
            if (hasUnsavedExerciseChanges()
                && !window.confirm("Switching the lesson drops the unsaved changes on this page. Continue?")) {
                e.stopImmediatePropagation();
                select.value = previous;
                return;
            }
            previous = select.value;
            if (id === "exerciseLesson") loadLessonExercises();
        }, true);
    });
}

/* =================================================================
   Task #73, #111, #113 & Fix #3: Back & Cancel Unsaved Changes Protective Guard
==================================================================== */
function setupBackCancelGuard() {
    const backBtn = document.getElementById('backExerciseBtn') || document.querySelector('.btn-back-custom');
    const unsavedModal = document.getElementById('unsavedChangesModal');
    const stayBtn = document.getElementById('unsavedStayBtn');
    const leaveBtn = document.getElementById('unsavedLeaveBtn');
    const saveAndLeaveBtn = document.getElementById('unsavedSaveAndLeaveBtn');

    let pendingNavigation = null;

    function showUnsavedWarning(targetUrl, e) {
        if (!hasPopulatedExerciseInputs()) {
            return true;
        }

        if (e) e.preventDefault();
        pendingNavigation = targetUrl;

        if (unsavedModal) {
            unsavedModal.classList.remove('modal-hidden');
        } else {
            const confirmed = window.confirm("You have unsaved changes in these coding exercises. Are you sure you want to leave without saving?");
            if (confirmed && targetUrl) {
                isSubmitting = true;
                window.location.href = targetUrl;
            }
        }
        return false;
    }

    function hideUnsavedModal() {
        if (unsavedModal) {
            unsavedModal.classList.add('modal-hidden');
        }
        pendingNavigation = null;
    }

    if (backBtn) {
        backBtn.addEventListener('click', function (e) {
            showUnsavedWarning(backBtn.href, e);
        });
    }

    // Also guard sidebar link navigation while there are unsaved changes
    document.querySelectorAll('.admin-sidebar a, .sidebar-nav a').forEach(link => {
        link.addEventListener('click', function (e) {
            if (link.getAttribute('href') && !link.getAttribute('href').startsWith('#')) {
                showUnsavedWarning(link.href, e);
            }
        });
    });

    if (stayBtn) {
        stayBtn.addEventListener('click', function () {
            hideUnsavedModal();
        });
    }

    if (leaveBtn) {
        leaveBtn.addEventListener('click', function () {
            isSubmitting = true;
            const target = pendingNavigation || '/admin/coding-exercises';
            hideUnsavedModal();
            window.location.href = target;
        });
    }

    if (saveAndLeaveBtn) {
        saveAndLeaveBtn.addEventListener('click', async function () {
            const target = pendingNavigation || '/admin/coding-exercises';
            hideUnsavedModal();
            const savedId = await saveAllExercises();
            if (savedId) {
                isSubmitting = true;
                window.location.href = target;
            }
        });
    }

    window.addEventListener('beforeunload', function (e) {
        if (isSubmitting) return;
        if (hasPopulatedExerciseInputs()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('createExerciseForm');
    if (form) {
        // Nothing on this page posts the form - each card is saved on its own.
        form.addEventListener('submit', (e) => e.preventDefault());
    }
    setupCardButtons();
    setupSaveAllHandler();
    setupBackCancelGuard();
    // Before the dropdowns' own listeners, so it can stop a lesson switch.
    setupLessonSwitchGuard();
    setupDependentDropdowns();
    document.querySelectorAll('#exerciseCategory, #exerciseModule, #exerciseLesson').forEach((el) => {
        el.addEventListener('change', () => el.classList.remove('field-error'));
    });
    updateExercisePageState();
});

/* =================================================================
   Task #70 & Fix #1: Category -> Module -> Lesson Cascading Dropdowns
==================================================================== */
function setupDependentDropdowns() {
    const categorySelect = document.getElementById('exerciseCategory');
    const moduleSelect = document.getElementById('exerciseModule');
    const lessonSelect = document.getElementById('exerciseLesson');

    if (!categorySelect || !moduleSelect || !lessonSelect) return;

    const MODULE_PLACEHOLDER_HTML = '<option value="" disabled selected>Select module</option>';
    const LESSON_PLACEHOLDER_HTML = '<option value="" disabled selected>Select lesson</option>';

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function resetModuleDropdown() {
        moduleSelect.innerHTML = MODULE_PLACEHOLDER_HTML;
        moduleSelect.disabled = true;
    }

    function resetLessonDropdown() {
        lessonSelect.innerHTML = LESSON_PLACEHOLDER_HTML;
        lessonSelect.disabled = true;
        loadLessonExercises();
    }

    async function loadLessonsForModule(moduleId, preselectResourceId = null) {
        resetLessonDropdown();

        if (!moduleId) return;

        try {
            const response = await fetch(
                `/admin/coding-exercises/lessons-by-module?module_id=${encodeURIComponent(moduleId)}`,
                { credentials: "include" }
            );
            const result = await response.json();

            if (!result.success || !Array.isArray(result.lessons) || result.lessons.length === 0) {
                resetLessonDropdown();
                return;
            }

            const optionsHtml = result.lessons.map(lesson => {
                const isSelected = preselectResourceId && String(lesson.resource_id) === String(preselectResourceId);
                return `<option value="${escapeHtml(lesson.resource_id)}" data-exercise-count="${Number(lesson.exercise_count || 0)}" ${isSelected ? 'selected' : ''}>${escapeHtml(lesson.resource_title)}</option>`;
            }).join("");

            lessonSelect.innerHTML = LESSON_PLACEHOLDER_HTML + optionsHtml;
            lessonSelect.disabled = false;

            if (preselectResourceId && lessonSelect.querySelector(`option[value="${preselectResourceId}"]`)) {
                lessonSelect.value = String(preselectResourceId);
            }
            loadLessonExercises();   // setting the value by script fires no "change"
        } catch (err) {
            console.error("create-exercise: failed to load lessons for module:", err);
            resetLessonDropdown();
        }
    }

    async function loadModulesForCategory(catId, preselectModuleId = null, preselectResourceId = null) {
        resetModuleDropdown();
        resetLessonDropdown();

        if (!catId) return;

        try {
            const response = await fetch(
                `/admin/coding-exercises/modules-by-category?cat_id=${encodeURIComponent(catId)}`,
                { credentials: "include" }
            );
            const result = await response.json();

            if (!result.success || !Array.isArray(result.modules) || result.modules.length === 0) {
                resetModuleDropdown();
                return;
            }

            const optionsHtml = result.modules.map(mod => {
                const isSelected = preselectModuleId && String(mod.module_id) === String(preselectModuleId);
                return `<option value="${escapeHtml(mod.module_id)}" ${isSelected ? 'selected' : ''}>${escapeHtml(mod.module_name)}</option>`;
            }).join("");

            moduleSelect.innerHTML = MODULE_PLACEHOLDER_HTML + optionsHtml;
            moduleSelect.disabled = false;

            if (preselectModuleId && moduleSelect.querySelector(`option[value="${preselectModuleId}"]`)) {
                moduleSelect.value = String(preselectModuleId);
                await loadLessonsForModule(preselectModuleId, preselectResourceId);
            }
        } catch (err) {
            console.error("create-exercise: failed to load modules for category:", err);
            resetModuleDropdown();
            resetLessonDropdown();
        }
    }

    categorySelect.addEventListener('change', function () {
        loadModulesForCategory(categorySelect.value);
    });

    moduleSelect.addEventListener('change', function () {
        loadLessonsForModule(moduleSelect.value);
    });

    // Handle initial pre-selected values (e.g. Editing / reloading saved draft)
    const initialCatId = categorySelect.value;
    const preselectModuleId = moduleSelect.dataset.preselectModuleId || null;
    const preselectResourceId = lessonSelect.dataset.preselectResourceId || null;

    if (initialCatId) {
        loadModulesForCategory(initialCatId, preselectModuleId, preselectResourceId);
    }
}

