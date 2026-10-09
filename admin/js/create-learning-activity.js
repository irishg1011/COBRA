/**
 * create-learning-activity.js
 * --------------------------------------------------------------------
 * Task #58 additions (Multiple Choice question builder only - Section 2
 * of Create Learning Activity), as amended by Task #108:
 *
 *   1. TASK #108 UPDATE: the original "Are you sure you want to clear
 *      it?" confirmation that used to fire the moment a Question /
 *      Answer Option / Feedback field went from having text to being
 *      empty (including plain backspacing/typing) has been REMOVED
 *      entirely, across every activity type (Multiple Choice, Fill in
 *      the Blanks, Flashcards). Typing, editing, and deleting text
 *      inside any builder input/textarea is now completely
 *      uninterrupted. Confirmation dialogs are now triggered EXCLUSIVELY
 *      by an explicit delete/remove action - the option row's minus (-)
 *      button (removeOptionRow), a question's trash icon
 *      (removeQuestionCard), a Fill in the Blanks item's trash icon
 *      (removeFillBlankCard), or a Flashcard's trash icon
 *      (removeFlashcardCard) - never by editing a field's text.
 *
 *   2. Live casing normalization on every Question / Answer Option /
 *      Feedback field: first character uppercase, every other character
 *      lowercase - mirrors the exact same rule already used server-side
 *      for Activity/Lesson/Category names (text_formatting.py,
 *      lesson_validation.py, activity_validation.py) and client-side in
 *      create-learning-activity-validations.js for the Activity Title
 *      field, just applied here to the Section 2 builder fields. This
 *      still runs on every keystroke - only the clear-confirmation
 *      behavior above was removed.
 *
 *   3. "Add Question" / "Duplicate Question" are blocked (with an
 *      explanatory alert) unless the CURRENT last question card already
 *      has its Question text, every Answer Option, and every Feedback
 *      field filled in - so a new/duplicated card can never be appended
 *      while the previous one is still incomplete. Unaffected by Task
 *      #108 - this is a completeness gate on Add/Duplicate, not a
 *      confirmation on typing.
 *
 * These behaviors are implemented via event delegation scoped to the
 * activity builder containers, so they apply uniformly to every
 * question/item card - including ones added, duplicated, moved, or
 * reindexed after page load - without needing to re-bind anything per
 * card.
 *
 * feat/activity-add-many:
 *   - "Add [n] questions / items / cards": the number box next to each
 *     main Add button (1-20, clamped) adds that many blank cards at once,
 *     through the same gate + add function as adding one.
 *   - A NEW Multiple Choice question starts with options A-D. Add Option
 *     goes up to F (6); options can be removed down to B (2). The
 *     buttons are disabled at those limits. Saved questions load with
 *     exactly the options they were saved with.
 */

// feat/activity-add-many: limits
const ADD_MANY_MIN = 1;
const ADD_MANY_MAX = 20;
const MCQ_DEFAULT_OPTIONS = 4;
const MCQ_MIN_OPTIONS = 2;
const MCQ_MAX_OPTIONS = 6;
// feat/question-pool-draw: each activity's pool aims for this many items
// (learners get 5 drawn per play). Under it is a warning, never a block.
const POOL_TARGET = 50;

/** Value of an "Add [n]" box, clamped to 1-20 (empty/invalid -> 1). Writes the clamped value back. */
function readAddManyCount(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return 1;
    let n = parseInt(input.value, 10);
    if (!Number.isFinite(n) || n < ADD_MANY_MIN) n = ADD_MANY_MIN;
    if (n > ADD_MANY_MAX) n = ADD_MANY_MAX;
    input.value = n;
    updateAddManyLabel(input);
    return n;
}

/** "question" / "questions" (etc.) next to an "Add [n]" box. */
function updateAddManyLabel(input) {
    const label = input ? document.querySelector(`label.add-many-label[for="${input.id}"]`) : null;
    if (!label) return;
    const n = parseInt(input.value, 10);
    label.textContent = n === 1 ? input.dataset.singular : input.dataset.plural;
}

/** Disables Add Option at 6 options and every remove (-) button at 2. */
function updateOptionControls(card) {
    if (!card) return;
    const count = card.querySelectorAll('.answer-row').length;
    const addBtn = card.querySelector('.add-sub-question-btn');
    if (addBtn) {
        addBtn.disabled = count >= MCQ_MAX_OPTIONS;
        addBtn.title = addBtn.disabled ? `A question can have up to ${MCQ_MAX_OPTIONS} options (A-F).` : 'Add an answer option';
    }
    card.querySelectorAll('.delete-option-btn').forEach((btn) => {
        btn.disabled = count <= MCQ_MIN_OPTIONS;
        btn.title = btn.disabled ? `A question needs at least ${MCQ_MIN_OPTIONS} options.` : 'Remove Option';
    });
}

// ========================================================================
// TASK #58 & TASK #60 (as amended by TASK #108): shared helpers - casing
// normalization and completeness checks across Multiple Choice, Fill in
// the Blanks, and Flashcards builders.
//
// TASK #108: the per-field "value tracker" that used to power an
// in-field "Are you sure you want to clear it?" confirmation (fired on
// backspace/typing/select-all-delete, not just on an explicit delete
// button) has been removed entirely. Typing and editing inside any
// builder field is now always uninterrupted; confirmation prompts are
// exclusively wired to the explicit delete/remove action buttons further
// down this file (removeOptionRow, removeQuestionCard,
// removeFillBlankCard, removeFlashcardCard).
// ========================================================================

function showActivityAlert(msg, title = "Required Field Missing") {
    if (typeof window.cobraByteShowActivityInfoModal === 'function') {
        window.cobraByteShowActivityInfoModal(msg, title);
    } else if (typeof window.cobraByteShowActivityPopupAlert === 'function') {
        window.cobraByteShowActivityPopupAlert(msg, 'error');
    } else {
        alert(msg);
    }
}

/**
 * True for all text inputs and textareas across the activity builder containers
 * (Multiple Choice, Fill in the Blanks, Flashcards). Radios, hidden inputs,
 * buttons, and Section 1 fields are explicitly excluded.
 */
function isGuardedActivityField(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toUpperCase();
    if (tag !== 'TEXTAREA' && tag !== 'INPUT') return false;
    if (tag === 'INPUT' && (el.type === 'radio' || el.type === 'hidden' || el.type === 'button' || el.type === 'submit')) return false;

    if (el.closest('#questionsContainer') || el.closest('#multipleChoiceSection') ||
        el.closest('#fillBlanksContainer') || el.closest('#fillBlanksSection') ||
        el.closest('#flashcardsContainer') || el.closest('#flashcardsSection') ||
        el.closest('.tab-content-container')) {
        return true;
    }

    return false;
}

/**
 * "First character uppercase, every other character lowercase" - the
 * exact same rule already used for Activity Title / Lesson Name /
 * Category Name elsewhere in this project.
 */
function normalizeActivityFieldCasing(value) {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/**
 * Applies normalizeActivityFieldCasing() to `el.value` in place, keeping
 * the caret where the admin was typing (rather than jumping to the end
 * of the field) - same technique already used by
 * create-learning-activity-validations.js's Activity Title formatter.
 */
function applyActivityFieldCasing(el) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const normalized = normalizeActivityFieldCasing(el.value);
    if (normalized === el.value) return;
    el.value = normalized;
    if (start !== null && end !== null && typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(start, end);
    }
}

/**
 * TASK #108: kept as a no-op (rather than removed outright) purely so
 * existing call sites (addNewQuestionCard, addOptionRow,
 * addNewFillBlankCard, addNewFlashcardCard, and the DOMContentLoaded
 * initializer further down) don't each need their own follow-up edit.
 * Previously this seeded a per-field value tracker used to detect "the
 * admin just cleared a field that had text" so an in-field clear could
 * be intercepted with a confirmation prompt - that tracking (and the
 * prompt it powered) is removed entirely per Task #108, so there is
 * nothing left for this function to do.
 */
function refreshActivityFieldTrackers(scopeEl) {
    // Intentionally empty - see docstring above.
}

// Alias for backward compatibility with existing call sites.
function refreshQuestionFieldTrackers(scopeEl) {
    refreshActivityFieldTrackers(scopeEl);
}

/**
 * TASK #108: fires on every input event anywhere inside the activity
 * content builders (Multiple Choice, Fill in the Blanks, Flashcards).
 * Typing, editing, and deleting/backspacing text no longer triggers any
 * confirmation dialog - this only ever applies live casing
 * normalization and refreshes the Add/Duplicate button completeness
 * state. Deletion confirmations live exclusively on the explicit
 * delete/remove action buttons (removeOptionRow, removeQuestionCard,
 * removeFillBlankCard, removeFlashcardCard).
 */
/**
 * Answer fields are saved exactly as the admin typed them (no casing
 * normalization), since learner answers are checked case-sensitively -
 * e.g. "def", "print()", "print("Hello!")" must stay untouched.
 *   - Multiple Choice: Answer Options
 *   - Fill in the Blanks: Sentence and Correct Answer
 *   - Flashcards: Front Card and Back Card
 */
function isExactAnswerField(el) {
    const name = el.getAttribute('name') || '';
    // feat/fib-console + feat/hints-feedback: code, expected output, the
    // must-contain text and hints are code-like - never re-cased.
    return /^fill_blanks\[\d+\]\[(correct_answer|code_text|expected_output|must_contain|hint)\]$/.test(name) ||
           /^flashcards\[\d+\]\[(back|hint|front_code)\]$/.test(name);
}

function handleActivityFieldInput(e) {
    const el = e.target;
    if (!isGuardedActivityField(el)) return;

    if (!isExactAnswerField(el)) {
        applyActivityFieldCasing(el);
    }
    updateAddButtonsState();
    const card = el.closest('.question-card, .fill-blank-card, .flashcard-card');
    if (card) checkAnswerLeaks(card);
}

// ------------------------------------------------------------------
// feat/hints-feedback: answer-leak check (a warning, not a block). A hint
// or a wrong-answer feedback that contains the correct answer text would
// hand the answer to the learner.
// ------------------------------------------------------------------
function leakWarningFor(card) {
    let answer = '';
    const texts = [];
    if (card.classList.contains('question-card')) {
        const checked = card.querySelector('input[type="radio"]:checked');
        const row = checked ? checked.closest('.answer-row') : null;
        const input = row ? row.querySelector('input[type="text"]') : null;
        answer = input ? input.value.trim() : '';
        const wrong = card.querySelector('[name$="[incorrect_feedback]"]');
        if (wrong) texts.push(['Wrong-answer feedback', wrong.value]);
    } else {
        const ans = card.querySelector('[name$="[correct_answer]"], [name$="[back]"]');
        answer = ans ? ans.value.trim() : '';
        const hint = card.querySelector('[name$="[hint]"]');
        const wrong = card.querySelector('[name$="[incorrect_feedback]"]');
        if (hint) texts.push(['Hint', hint.value]);
        if (wrong) texts.push(['Wrong-answer feedback', wrong.value]);
    }
    if (answer.length < 2) return '';
    const needle = answer.toLowerCase();
    const leaks = texts.filter(([, value]) => value.toLowerCase().includes(needle)).map(([label]) => label);
    return leaks.length ? `${leaks.join(' and ')} contain${leaks.length === 1 ? 's' : ''} the correct answer - learners would see it.` : '';
}

function checkAnswerLeaks(card) {
    let note = card.querySelector('.leak-warning');
    const message = leakWarningFor(card);
    if (!message) {
        if (note) note.remove();
        return;
    }
    if (!note) {
        note = document.createElement('p');
        note.className = 'leak-warning';
        note.setAttribute('role', 'status');
        card.appendChild(note);
    }
    note.textContent = message;
}

document.addEventListener('change', (e) => {
    const card = e.target && e.target.closest ? e.target.closest('.question-card, .fill-blank-card, .flashcard-card') : null;
    if (card) checkAnswerLeaks(card);
});

// ------------------------------------------------------------------
// feat/question-pool-draw: pool count against the target ("23 / 50").
// ------------------------------------------------------------------
function updatePoolCount(activityType, totalItems) {
    const sectionId = isMcqBuilderType(activityType) ? 'multipleChoiceSection'
        : activityType === 'Fill in the Blanks' ? 'fillBlanksSection'
        : activityType === 'Flashcards' ? 'flashcardsSection' : null;
    document.querySelectorAll('.pool-count').forEach((n) => { if (!sectionId || !n.closest('#' + sectionId)) n.remove(); });
    const section = sectionId ? document.getElementById(sectionId) : null;
    if (!section) return;
    let badge = section.querySelector('.pool-count');
    if (!badge) {
        badge = document.createElement('p');
        badge.className = 'pool-count';
        section.insertBefore(badge, section.firstChild);
    }
    const under = totalItems < POOL_TARGET;
    badge.classList.toggle('is-under', under);
    badge.textContent = under
        ? `Pool: ${totalItems} / ${POOL_TARGET} items. Learners get 5 random unseen items per play - add ${POOL_TARGET - totalItems} more so they can't memorize answers (you can still save and publish).`
        : `Pool: ${totalItems} / ${POOL_TARGET} items. Learners get 5 random unseen items per play.`;
}

document.addEventListener('input', handleActivityFieldInput);

/**
 * True only if `card` has its Question text filled in AND every one of
 * its current Answer Options has BOTH an answer and a feedback message
 * filled in (matches the "Feedback for Learner *" required column shown
 * in the builder), with NO duplicate option answers and NO matching
 * answer/feedback pairs. A question with fewer than 2 options is treated as
 * incomplete, since Multiple Choice always requires at least 2.
 */
function isQuestionCardComplete(card) {
    if (!card) return false;

    const textarea = card.querySelector('.question-textarea');
    const questionText = textarea ? textarea.value.trim() : '';
    if (!questionText) return false;

    const rows = card.querySelectorAll('.answer-row');
    if (rows.length < 2) return false;

    const seenAnswers = new Set();
    for (const row of rows) {
        const textInput = row.querySelector('input[type="text"]:nth-of-type(1)');
        const feedbackInput = row.querySelector('input[type="text"]:nth-of-type(2)');
        const optionText = textInput ? textInput.value.trim() : '';
        const feedbackText = feedbackInput ? feedbackInput.value.trim() : '';
        if (!optionText || !feedbackText) return false;

        const lowerOpt = optionText.toLowerCase();
        if (seenAnswers.has(lowerOpt)) return false;
        seenAnswers.add(lowerOpt);

        if (lowerOpt === feedbackText.toLowerCase()) return false;
    }

    return true;
}

/**
 * Task #58, #61 & #103: gate for both "Add Question" and "Duplicate Question".
 * Returns true when there is no existing question yet, or the current
 * LAST question card is fully complete with valid unique options and differentiated feedback.
 * Otherwise alerts the admin with helpful validation feedback and returns false.
 */
function canAddNewQuestion(sourceCard = null) {
    const targetCard = sourceCard || (function () {
        const container = document.getElementById('questionsContainer');
        if (!container) return null;
        const cards = container.querySelectorAll('.question-card');
        return cards.length > 0 ? cards[cards.length - 1] : null;
    })();

    if (!targetCard) return true;

    const textarea = targetCard.querySelector('.question-textarea');
    const questionText = textarea ? textarea.value.trim() : '';
    if (!questionText) {
        const msg = sourceCard
            ? 'Please enter the question text before duplicating this question.'
            : 'Please enter the question text for the current question before adding another.';
        showActivityAlert(msg, 'Incomplete Question');
        if (textarea) {
            textarea.classList.add('field-error');
            textarea.focus();
        }
        return false;
    }

    const rows = targetCard.querySelectorAll('.answer-row');
    if (rows.length < 2) {
        const msg = 'Multiple choice questions must have at least 2 options.';
        showActivityAlert(msg, 'Validation Error');
        return false;
    }

    const seenAnswers = new Map();
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        const textInput = row.querySelector('input[type="text"]:nth-of-type(1)');
        const feedbackInput = row.querySelector('input[type="text"]:nth-of-type(2)');
        const optionText = textInput ? textInput.value.trim() : '';
        const feedbackText = feedbackInput ? feedbackInput.value.trim() : '';
        const letter = String.fromCharCode(65 + rIdx);

        if (!optionText) {
            const msg = `Please enter the answer for Option ${letter} before proceeding.`;
            showActivityAlert(msg, 'Incomplete Option');
            if (textInput) {
                textInput.classList.add('field-error');
                textInput.focus();
            }
            return false;
        }

        if (!feedbackText) {
            const msg = `Please enter the feedback for Option ${letter} before proceeding.`;
            showActivityAlert(msg, 'Incomplete Feedback');
            if (feedbackInput) {
                feedbackInput.classList.add('field-error');
                feedbackInput.focus();
            }
            return false;
        }

        const lowerOpt = optionText.toLowerCase();
        if (seenAnswers.has(lowerOpt)) {
            if (textInput) textInput.classList.add('field-error');
            const prevInput = seenAnswers.get(lowerOpt);
            if (prevInput) prevInput.classList.add('field-error');
            const msg = `Duplicate answer option "${optionText}" found. Each option must have a unique answer.`;
            showActivityAlert(msg, 'Duplicate Option');
            if (textInput) textInput.focus();
            return false;
        }
        seenAnswers.set(lowerOpt, textInput);

        if (lowerOpt === feedbackText.toLowerCase()) {
            if (textInput) textInput.classList.add('field-error');
            if (feedbackInput) feedbackInput.classList.add('field-error');
            const msg = `Answer and Feedback for Learner cannot be identical (Option ${letter}).`;
            showActivityAlert(msg, 'Validation Error');
            if (feedbackInput) feedbackInput.focus();
            return false;
        }
    }

    return true;
}

/**
 * Task #61: True only if `card` has both Question/Content and Correct Answer
 * filled in (required fields for Fill in the Blanks items).
 */
function isFillBlankCardComplete(card) {
    if (!card) return false;

    const val = (field) => { const el = card.querySelector(`[name$="[${field}]"]`); return el ? el.value.trim() : ''; };
    if (!val('correct_answer')) return false;
    if (val('code_text')) return !!(val('instruction') && val('expected_output'));
    return !!val('content');   // an item saved before the console
}

/**
 * Task #61: gate for both "Add Blank Item" and "Duplicate Item".
 * Returns true when there is no existing item yet, or the current
 * LAST blank item is fully complete (and sourceCard is complete if duplicating).
 * Otherwise alerts the admin with helpful validation feedback and returns false.
 */
function canAddNewFillBlank(sourceCard = null) {
    if (sourceCard && !isFillBlankCardComplete(sourceCard)) {
        showActivityAlert('Please complete this item first before duplicating it.', 'Incomplete Item');
        return false;
    }

    const container = document.getElementById('fillBlanksContainer');
    if (!container) return true;

    const cards = container.querySelectorAll('.fill-blank-card');
    if (cards.length === 0) return true;

    const lastCard = cards[cards.length - 1];
    if (!isFillBlankCardComplete(lastCard)) {
        showActivityAlert(
            'Please complete the current item first - the question, code with blank, ' +
            'correct answer and expected output are required before adding or duplicating another item.',
            'Incomplete Item'
        );
        return false;
    }

    return true;
}

/**
 * Task #61: True only if `card` has both Front Card and Back Card
 * filled in (required fields for Flashcards).
 */
function isFlashcardCardComplete(card) {
    if (!card) return false;

    const frontTextarea = card.querySelector('textarea[name*="[front]"]');
    const backTextarea = card.querySelector('textarea[name*="[back]"]');
    const front = frontTextarea ? frontTextarea.value.trim() : '';
    const back = backTextarea ? backTextarea.value.trim() : '';
    if (!front || !back) return false;

    return true;
}

/**
 * Task #61: gate for both "Add Flashcard" and "Duplicate Flashcard".
 * Returns true when there is no existing flashcard yet, or the current
 * LAST flashcard is fully complete (and sourceCard is complete if duplicating).
 * Otherwise alerts the admin with helpful validation feedback and returns false.
 */
function canAddNewFlashcard(sourceCard = null) {
    if (sourceCard && !isFlashcardCardComplete(sourceCard)) {
        showActivityAlert('Please complete this flashcard first before duplicating it.', 'Incomplete Flashcard');
        return false;
    }

    const container = document.getElementById('flashcardsContainer');
    if (!container) return true;

    const cards = container.querySelectorAll('.flashcard-card');
    if (cards.length === 0) return true;

    const lastCard = cards[cards.length - 1];
    if (!isFlashcardCardComplete(lastCard)) {
        showActivityAlert(
            'Please complete the current flashcard first - the front and ' +
            'back card texts are required before adding or duplicating another flashcard.',
            'Incomplete Flashcard'
        );
        return false;
    }

    return true;
}

/**
 * Task #61: Adapts the visual state (opacity, cursor, title) of "+ Add Question",
 * "+ Add Blank Item", "+ Add Flashcard" and duplication controls dynamically
 * based on the completion status of the current/last cards.
 */
function updateAddButtonsState() {
    // 1. Multiple Choice
    const mcContainer = document.getElementById('questionsContainer');
    const addQuestionBtn = document.getElementById('addQuestionMainBtn');
    if (mcContainer && addQuestionBtn) {
        const cards = mcContainer.querySelectorAll('.question-card');
        const canAdd = cards.length === 0 || isQuestionCardComplete(cards[cards.length - 1]);
        addQuestionBtn.style.opacity = canAdd ? '1' : '0.65';
        addQuestionBtn.title = canAdd ? 'Add a new question' : 'Complete the current question first';
    }

    // 2. Fill in the Blanks
    const fbContainer = document.getElementById('fillBlanksContainer');
    const addFillBlankBtn = document.getElementById('addFillBlankMainBtn');
    if (fbContainer && addFillBlankBtn) {
        const cards = fbContainer.querySelectorAll('.fill-blank-card');
        const canAdd = cards.length === 0 || isFillBlankCardComplete(cards[cards.length - 1]);
        addFillBlankBtn.style.opacity = canAdd ? '1' : '0.65';
        addFillBlankBtn.title = canAdd ? 'Add a new blank item' : 'Complete the current item first';
    }

    // 3. Flashcards
    const fcContainer = document.getElementById('flashcardsContainer');
    const addFlashcardBtn = document.getElementById('addFlashcardMainBtn');
    if (fcContainer && addFlashcardBtn) {
        const cards = fcContainer.querySelectorAll('.flashcard-card');
        const canAdd = cards.length === 0 || isFlashcardCardComplete(cards[cards.length - 1]);
        addFlashcardBtn.style.opacity = canAdd ? '1' : '0.65';
        addFlashcardBtn.title = canAdd ? 'Add a new flashcard' : 'Complete the current flashcard first';
    }

    // 4. Duplication controls on individual cards
    document.querySelectorAll('.question-card').forEach((card) => {
        const dupBtn = card.querySelector('button[title*="Duplicate"]');
        if (dupBtn) {
            const canDup = isQuestionCardComplete(card);
            dupBtn.style.opacity = canDup ? '1' : '0.45';
        }
    });

    document.querySelectorAll('.fill-blank-card').forEach((card) => {
        const dupBtn = card.querySelector('button[title*="Duplicate"]');
        if (dupBtn) {
            const canDup = isFillBlankCardComplete(card);
            dupBtn.style.opacity = canDup ? '1' : '0.45';
        }
    });

    document.querySelectorAll('.flashcard-card').forEach((card) => {
        const dupBtn = card.querySelector('button[title*="Duplicate"]');
        if (dupBtn) {
            const canDup = isFlashcardCardComplete(card);
            dupBtn.style.opacity = canDup ? '1' : '0.45';
        }
    });
}

/**
 * True if `card` (a whole question) has ANY typed content - its own
 * Question text, or any Answer Option's text/feedback - used to decide
 * whether deleting the card needs a confirmation warning.
 */
function questionCardHasData(card) {
    if (!card) return false;

    const textarea = card.querySelector('.question-textarea');
    if (textarea && textarea.value.trim() !== '') return true;

    const rows = card.querySelectorAll('.answer-row');
    for (const row of rows) {
        const textInput = row.querySelector('input[type="text"]:nth-of-type(1)');
        const feedbackInput = row.querySelector('input[type="text"]:nth-of-type(2)');
        if (textInput && textInput.value.trim() !== '') return true;
        if (feedbackInput && feedbackInput.value.trim() !== '') return true;
    }

    return false;
}

/**
 * True if a single Answer Option `row` has a typed answer and/or
 * feedback - used to decide whether removing that one option needs a
 * confirmation warning.
 */
function optionRowHasData(row) {
    if (!row) return false;
    const textInput = row.querySelector('input[type="text"]:nth-of-type(1)');
    const feedbackInput = row.querySelector('input[type="text"]:nth-of-type(2)');
    const optionText = textInput ? textInput.value.trim() : '';
    const feedbackText = feedbackInput ? feedbackInput.value.trim() : '';
    return !!(optionText || feedbackText);
}

/**
 * True if a Fill in the Blank card has ANY typed content - question content,
 * correct answer, correct feedback, or incorrect feedback.
 */
function fillBlankCardHasData(card) {
    if (!card) return false;
    const textarea = card.querySelector('textarea');
    if (textarea && textarea.value.trim() !== '') return true;
    const inputs = card.querySelectorAll('input[type="text"]');
    for (const input of inputs) {
        if (input && input.value.trim() !== '') return true;
    }
    return false;
}

/**
 * True if a Flashcard card has ANY typed content - front card, back card,
 * correct feedback, or incorrect feedback.
 */
function flashcardCardHasData(card) {
    if (!card) return false;
    const textareas = card.querySelectorAll('textarea');
    for (const ta of textareas) {
        if (ta && ta.value.trim() !== '') return true;
    }
    const inputs = card.querySelectorAll('input[type="text"]');
    for (const input of inputs) {
        if (input && input.value.trim() !== '') return true;
    }
    return false;
}

// ========================================================================
// TASK #59: Activity Type Switch Confirmation Guard & Layout Management
// ========================================================================

/**
 * Checks if the activity content builder contains any populated item cards
 * or active typed input/textarea values.
 * If a specific `type` is passed ('Multiple Choice', 'Fill in the Blanks',
 * 'Flashcards'), checks that type's builder. If no type is passed, checks
 * across all activity builder containers.
 */
/**
 * Quiz reuses the Multiple Choice builder (#multipleChoiceSection) -
 * same question cards, same option/feedback fields, same tables.
 */
function isMcqBuilderType(type) {
    return type === 'Multiple Choice' || type === 'Quiz';
}

function hasPopulatedActivityContent(type) {
    if (!type || isMcqBuilderType(type)) {
        const mcContainer = document.getElementById('questionsContainer');
        if (mcContainer && mcContainer.querySelectorAll('.question-card').length > 0) {
            return true;
        }
        const mcSection = document.getElementById('multipleChoiceSection');
        if (mcSection) {
            const inputs = mcSection.querySelectorAll('input[type="text"], textarea');
            for (const el of inputs) {
                if (el.value && el.value.trim() !== '') return true;
            }
        }
    }

    if (!type || type === 'Fill in the Blanks') {
        const fbContainer = document.getElementById('fillBlanksContainer');
        if (fbContainer && fbContainer.querySelectorAll('.fill-blank-card').length > 0) {
            return true;
        }
        const fbSection = document.getElementById('fillBlanksSection');
        if (fbSection) {
            const inputs = fbSection.querySelectorAll('input[type="text"], textarea');
            for (const el of inputs) {
                if (el.value && el.value.trim() !== '') return true;
            }
        }
    }

    if (!type || type === 'Flashcards') {
        const fcContainer = document.getElementById('flashcardsContainer');
        if (fcContainer && fcContainer.querySelectorAll('.flashcard-card').length > 0) {
            return true;
        }
        const fcSection = document.getElementById('flashcardsSection');
        if (fcSection) {
            const inputs = fcSection.querySelectorAll('input[type="text"], textarea');
            for (const el of inputs) {
                if (el.value && el.value.trim() !== '') return true;
            }
        }
    }

    return false;
}

/**
 * Resets all dynamic builder containers cleanly to their default empty
 * placeholder states and updates points to 0.
 */
function resetActivityContent() {
    const questionsContainer = document.getElementById('questionsContainer');
    if (questionsContainer) {
        questionsContainer.innerHTML = `
            <div class="text-muted text-center placeholder-box" id="noQuestionsMessage">
                No questions added yet. Click the button below to add your first question.
            </div>
        `;
    }

    const fillBlanksContainer = document.getElementById('fillBlanksContainer');
    if (fillBlanksContainer) {
        fillBlanksContainer.innerHTML = `
            <div class="text-muted text-center placeholder-box" id="noFillBlanksMessage">
                No fill-in-the-blank items added yet. Click the button below to add your first item.
            </div>
        `;
    }

    const flashcardsContainer = document.getElementById('flashcardsContainer');
    if (flashcardsContainer) {
        flashcardsContainer.innerHTML = `
            <div class="text-muted text-center placeholder-box" id="noFlashcardsMessage">
                No flashcards added yet. Click the button below to add your first flashcard.
            </div>
        `;
    }

    updatePointsTotal();
}

/**
 * Updates the visible builder section and sub-instructions corresponding to
 * the selected activity type.
 */
function updateActivityTypeView(selectedType) {
    const multipleChoiceSection = document.getElementById('multipleChoiceSection');
    const fillBlanksSection = document.getElementById('fillBlanksSection');
    const flashcardsSection = document.getElementById('flashcardsSection');
    const instructionLabel = document.querySelector('.sub-instruction strong');
    const instructionDesc = document.querySelector('.sub-instruction p');

    // Hide all sections first
    if (multipleChoiceSection) {
        multipleChoiceSection.classList.add('d-none');
        multipleChoiceSection.style.display = 'none';
    }
    if (fillBlanksSection) {
        fillBlanksSection.classList.add('d-none');
        fillBlanksSection.style.display = 'none';
    }
    if (flashcardsSection) {
        flashcardsSection.classList.add('d-none');
        flashcardsSection.style.display = 'none';
    }

    // Show selected section and set instructions
    if (isMcqBuilderType(selectedType)) {
        if (multipleChoiceSection) {
            multipleChoiceSection.classList.remove('d-none');
            multipleChoiceSection.style.display = 'block';
        }
        const isQuiz = selectedType === 'Quiz';
        if (instructionLabel) instructionLabel.textContent = isQuiz ? 'QUIZ' : 'MULTIPLE CHOICE';
        if (instructionDesc) instructionDesc.textContent = isQuiz
            ? 'Create questions with answer options, in the order learners will get them. Learners answer by steering the cobra into the correct letter.'
            : 'Create questions with multiple answer options. Add feedback for each option.';
    } else if (selectedType === 'Fill in the Blanks') {
        if (fillBlanksSection) {
            fillBlanksSection.classList.remove('d-none');
            fillBlanksSection.style.display = 'block';
        }
        if (instructionLabel) instructionLabel.textContent = 'FILL IN THE BLANKS';
        if (instructionDesc) instructionDesc.textContent = 'Create sentences or statements with missing words. Add the correct answers and feedback for each response.';
    } else if (selectedType === 'Flashcards') {
        if (flashcardsSection) {
            flashcardsSection.classList.remove('d-none');
            flashcardsSection.style.display = 'block';
        }
        if (instructionLabel) instructionLabel.textContent = 'FLASHCARDS';
        if (instructionDesc) instructionDesc.textContent = 'Create front and back flashcard terms for studying.';
    }

    updatePointsTotal();
    updateAddButtonsState();
}

/**
 * Shows the protective confirmation modal (#confirmActionModal) or falls
 * back to window.confirm. Invokes onConfirm() only on explicit confirmation,
 * and onCancel() if canceled or dismissed.
 */
function showActivityTypeConfirmModal(message, onConfirm, onCancel, title) {
    const modal = document.getElementById('confirmActionModal');
    const modalTitle = document.getElementById('confirmActionTitle');
    const modalText = document.getElementById('confirmActionText');
    const cancelBtn = document.getElementById('confirmActionCancelBtn');
    const confirmBtn = document.getElementById('confirmActionConfirmBtn');

    if (!modal || !cancelBtn || !confirmBtn) {
        if (window.confirm(message)) {
            if (typeof onConfirm === 'function') onConfirm();
        } else {
            if (typeof onCancel === 'function') onCancel();
        }
        return;
    }

    if (modalTitle) modalTitle.textContent = title || 'Change Activity Type?';
    if (modalText) modalText.textContent = message;

    function cleanup() {
        cancelBtn.removeEventListener('click', handleCancel);
        confirmBtn.removeEventListener('click', handleConfirm);
        modal.removeEventListener('click', handleBackdropClick);
        modal.style.display = 'none';
        modal.classList.add('modal-hidden');
    }

    function handleConfirm() {
        cleanup();
        if (typeof onConfirm === 'function') onConfirm();
    }

    function handleCancel() {
        cleanup();
        if (typeof onCancel === 'function') onCancel();
    }

    function handleBackdropClick(e) {
        if (e.target === modal) {
            cleanup();
            if (typeof onCancel === 'function') onCancel();
        }
    }

    cancelBtn.addEventListener('click', handleCancel);
    confirmBtn.addEventListener('click', handleConfirm);
    modal.addEventListener('click', handleBackdropClick);

    modal.classList.remove('modal-hidden');
    modal.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', function() {
    // Activity Type Dropdown Change Logic with Task #59 Protective Confirmation Guard
    const activityTypeSelect = document.getElementById('activityType');

    // Track the active Activity Type continuously
    let previousActivityType = activityTypeSelect ? activityTypeSelect.value : 'Multiple Choice';

    // Synchronize initial view with whatever activity type is currently selected
    if (activityTypeSelect) {
        updateActivityTypeView(previousActivityType);

        activityTypeSelect.addEventListener('change', function() {
            const targetType = this.value;
            if (targetType === previousActivityType) return;

            // Quiz and Multiple Choice share the same builder - switching
            // between them keeps the questions instead of wiping them.
            if (isMcqBuilderType(previousActivityType) && isMcqBuilderType(targetType)) {
                previousActivityType = targetType;
                updateActivityTypeView(targetType);
                return;
            }

            // Task #59: Check if active input values or populated items exist in the builder
            const hasData = hasPopulatedActivityContent(previousActivityType) || hasPopulatedActivityContent();

            if (hasData) {
                const message = 'Changing the activity type will reset all existing items and content in the builder. Are you sure you want to proceed?';
                const title = 'Change Activity Type?';

                showActivityTypeConfirmModal(
                    message,
                    function onConfirm() {
                        previousActivityType = targetType;
                        activityTypeSelect.value = targetType;
                        resetActivityContent();
                        updateActivityTypeView(targetType);
                    },
                    function onCancel() {
                        activityTypeSelect.value = previousActivityType;
                        // feat/activity-auto-title: the title follows the type back
                        if (typeof window.cobraByteUpdateActivityTitle === 'function') window.cobraByteUpdateActivityTitle();
                    },
                    title
                );
            } else {
                // No active data to lose - switch cleanly
                previousActivityType = targetType;
                updateActivityTypeView(targetType);
            }
        });
    }

    // OUTSIDE BUTTON: Add a brand new Question Card
    const addQuestionMainBtn = document.getElementById('addQuestionMainBtn');
    if (addQuestionMainBtn) {
        addQuestionMainBtn.addEventListener('click', function() {
            // Task #58, Requirement #3: never append a new question while
            // the current last one is still incomplete.
            if (!canAddNewQuestion()) return;
            // feat/activity-add-many: same gate + same add function, n times
            const count = readAddManyCount('addQuestionCount');
            for (let i = 0; i < count; i++) addNewQuestionCard();
        });
    }

    // OUTSIDE BUTTON: Add a brand new Fill in the Blank Item
    const addFillBlankMainBtn = document.getElementById('addFillBlankMainBtn');
    if (addFillBlankMainBtn) {
        addFillBlankMainBtn.addEventListener('click', function() {
            // Task #61: never append a new item while the current last one is incomplete
            if (!canAddNewFillBlank()) return;
            const count = readAddManyCount('addFillBlankCount');
            for (let i = 0; i < count; i++) addNewFillBlankCard();
        });
    }

    // OUTSIDE BUTTON: Add a brand new Flashcard Item
    const addFlashcardMainBtn = document.getElementById('addFlashcardMainBtn');
    if (addFlashcardMainBtn) {
        addFlashcardMainBtn.addEventListener('click', function() {
            // Task #61: never append a new flashcard while the current last one is incomplete
            if (!canAddNewFlashcard()) return;
            const count = readAddManyCount('addFlashcardCount');
            for (let i = 0; i < count; i++) addNewFlashcardCard();
        });
    }

    // feat/activity-add-many: the "Add [n]" boxes. Their events stop here,
    // so typing a number never marks the form as having unsaved changes
    // and never goes through the builder fields' casing handler.
    document.querySelectorAll('.js-add-many-count').forEach((input) => {
        input.addEventListener('input', (e) => {
            e.stopPropagation();
            updateAddManyLabel(input);
        });
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            readAddManyCount(input.id);
        });
        input.addEventListener('keydown', (e) => {
            // Enter adds, instead of submitting the form
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const btn = input.parentElement ? input.parentElement.querySelector('button') : null;
            if (btn) btn.click();
        });
    });

    // Task #63: Load preloaded Section 2 content if reopening an existing saved draft
    const preloadedScript = document.getElementById('preloadedActivityData');
    if (preloadedScript) {
        try {
            const preloaded = JSON.parse(preloadedScript.textContent || '{}');
            if (preloaded && preloaded.activity_type) {
                if (isMcqBuilderType(preloaded.activity_type) && Array.isArray(preloaded.questions) && preloaded.questions.length > 0) {
                    preloaded.questions.forEach(q => addNewQuestionCard(q));
                } else if (preloaded.activity_type === 'Fill in the Blanks' && Array.isArray(preloaded.fill_blanks) && preloaded.fill_blanks.length > 0) {
                    preloaded.fill_blanks.forEach(fb => addNewFillBlankCard(fb));
                } else if (preloaded.activity_type === 'Flashcards' && Array.isArray(preloaded.flashcards) && preloaded.flashcards.length > 0) {
                    preloaded.flashcards.forEach(fc => addNewFlashcardCard(fc));
                }
            }
        } catch (e) {
            console.error('Failed to parse preloaded activity data:', e);
        }
    }

    refreshActivityFieldTrackers(document);
    updatePointsTotal();
    updateAddButtonsState();
});

function escapeAttr(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Function to update Points based on total item count for the active activity type
function updatePointsTotal() {
    const activityTypeSelect = document.getElementById('activityType');
    const activityType = activityTypeSelect ? activityTypeSelect.value : 'Multiple Choice';
    let totalItems = 0;

    if (isMcqBuilderType(activityType)) {
        const container = document.getElementById('questionsContainer');
        totalItems = container ? container.querySelectorAll('.question-card').length : 0;
    } else if (activityType === 'Fill in the Blanks') {
        const container = document.getElementById('fillBlanksContainer');
        totalItems = container ? container.querySelectorAll('.fill-blank-card').length : 0;
    } else if (activityType === 'Flashcards') {
        const container = document.getElementById('flashcardsContainer');
        totalItems = container ? container.querySelectorAll('.flashcard-card').length : 0;
    }

    const pointsInput = document.getElementById('activityPoints');
    if (pointsInput) {
        pointsInput.value = totalItems;
    }
    updatePoolCount(activityType, totalItems);
}

// Add a brand new question card
function addNewQuestionCard(prefilledData = null) {
    const container = document.getElementById('questionsContainer');
    const emptyMsg = document.getElementById('noQuestionsMessage');
    if (emptyMsg) emptyMsg.remove();

    const questionCount = container.querySelectorAll('.question-card').length;
    const qIndex = questionCount;
    const qNum = qIndex + 1;

    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.questionIndex = qIndex;
    // feat/publishing-tree: remember the saved question's id so a save
    // updates it in place (learners' answers point at it). Duplicated
    // and new cards have none -> saved as new questions.
    if (prefilledData && prefilledData.q_id) card.dataset.itemId = prefilledData.q_id;
    
    let questionTextVal = prefilledData ? prefilledData.text : '';
    const qCorrectFb = prefilledData ? (prefilledData.correct_feedback || '') : '';
    const qWrongFb = prefilledData ? (prefilledData.incorrect_feedback || '') : '';

    // feat/activity-add-many: a NEW question starts with A-D. Saved and
    // duplicated questions keep exactly the options they have.
    const blankOptions = (n) => Array.from({ length: n }, () => ({ text: '', feedback: '' }));
    const optionsToRender = (prefilledData && Array.isArray(prefilledData.options) && prefilledData.options.length > 0)
        ? prefilledData.options
        : blankOptions(prefilledData ? MCQ_MIN_OPTIONS : MCQ_DEFAULT_OPTIONS);

    let correctOptionIdx = (prefilledData && prefilledData.correct_option !== undefined && prefilledData.correct_option !== null)
        ? Number(prefilledData.correct_option)
        : 0;

    let optionsRowsHtml = '';
    optionsToRender.forEach((opt, optIdx) => {
        const letter = String.fromCharCode(65 + optIdx);
        const optText = opt.text || '';
        const optFeedback = opt.feedback || '';
        const isChecked = optIdx === correctOptionIdx ? 'checked' : '';

        const optionIdAttr = opt.option_id ? ` data-option-id="${escapeAttr(String(opt.option_id))}"` : '';
        optionsRowsHtml += `
            <div class="answer-row"${optionIdAttr}>
                <div class="option-badge">${letter}</div>
                <input type="text" name="questions[${qIndex}][options][${optIdx}][text]" class="form-control" placeholder="Answer option" value="${escapeAttr(optText)}" required>
                <div class="text-center">
                    <input type="radio" name="questions[${qIndex}][correct_option]" value="${optIdx}" class="custom-radio" ${isChecked}>
                </div>
                <input type="text" name="questions[${qIndex}][options][${optIdx}][feedback]" class="form-control" placeholder="Feedback" value="${escapeAttr(optFeedback)}">
                <div class="text-center">
                    <button type="button" class="icon-control-btn text-danger delete-option-btn" title="Remove Option" onclick="removeOptionRow(this)"><i class="fa-solid fa-minus"></i></button>
                </div>
            </div>
        `;
    });
    
    card.innerHTML = `
        <div class="question-card-header">
            <span class="question-number">Question ${qNum}</span>
            <div class="question-controls card-controls">
                <button type="button" class="icon-control-btn" title="Move Up" onclick="moveQuestionUp(this)"><i class="fa-solid fa-arrow-up"></i></button>
                <button type="button" class="icon-control-btn" title="Move Down" onclick="moveQuestionDown(this)"><i class="fa-solid fa-arrow-down"></i></button>
                <button type="button" class="icon-control-btn" title="Duplicate Question" onclick="duplicateQuestionCard(this)"><i class="fa-regular fa-copy"></i></button>
                <button type="button" class="icon-control-btn text-danger" title="Delete Question" onclick="removeQuestionCard(this)"><i class="fa-regular fa-trash-can"></i></button>
            </div>
        </div>

        <div class="question-body-content">
            <div class="form-group mb-20 form-group-relative">
                <label class="form-label">Question *</label>
                <textarea name="questions[${qIndex}][text]" class="form-control question-textarea" rows="2" placeholder="Type your question here..." required>${escapeAttr(questionTextVal)}</textarea>
                <span class="char-counter">${questionTextVal.length} / 1000</span>
            </div>

            <div class="answer-options-wrapper">
                <div class="answer-options-header">
                    <span>Option</span>
                    <span>Answer</span>
                    <span>Is Correct</span>
                    <span>Feedback for Learner *</span>
                    <span class="text-center">Action</span>
                </div>

                ${optionsRowsHtml}
            </div>

            <!-- INSIDE BUTTON: Add Option -->
            <button type="button" class="add-sub-question-btn mt-14" onclick="addOptionRow(this, ${qIndex})">
                <i class="fa-solid fa-plus"></i> Add Option
            </button>

            <!-- feat/hints-feedback: one text for a right answer, one for any miss (never the answer) -->
            <div class="fill-blank-grid-2 mt-16">
                <div class="form-group">
                    <label class="form-label">Feedback when correct</label>
                    <input type="text" name="questions[${qIndex}][correct_feedback]" class="form-control" value="${escapeAttr(qCorrectFb)}" placeholder="Why this answer is right">
                </div>
                <div class="form-group">
                    <label class="form-label">Feedback when wrong</label>
                    <input type="text" name="questions[${qIndex}][incorrect_feedback]" class="form-control" value="${escapeAttr(qWrongFb)}" placeholder="Why it is off - without giving the answer">
                </div>
            </div>
            <p class="form-hint">Empty? The option's own feedback above is shown instead.</p>
        </div>
    `;

    container.appendChild(card);
    updateOptionControls(card);
    setupTextareaCounters(card);
    // Task #58: seed the clear-confirmation tracker with whatever this
    // card starts out with (blank for a fresh card, or the prefilled
    // Question text passed in for a duplicate - option values are
    // copied in separately by duplicateQuestionCard(), which refreshes
    // the tracker itself once that's done).
    refreshQuestionFieldTrackers(card);
    updatePointsTotal();
    updateAddButtonsState();
}

// Setup character counters for textareas dynamically
function setupTextareaCounters(scope) {
    const textareas = scope.querySelectorAll('.question-textarea');
    textareas.forEach(textarea => {
        const counter = textarea.parentElement.querySelector('.char-counter');
        if (counter) {
            textarea.addEventListener('input', function() {
                counter.textContent = `${this.value.length} / 1000`;
            });
        }
    });
}

// INSIDE BUTTON FUNCTION: Add Option Row
function addOptionRow(btn, qIndex) {
    const card = btn.closest('.question-card');
    const optionsWrapper = card.querySelector('.answer-options-wrapper');
    const existingRows = optionsWrapper.querySelectorAll('.answer-row');
    // feat/activity-add-many: at most 6 options (A-F)
    if (existingRows.length >= MCQ_MAX_OPTIONS) {
        updateOptionControls(card);
        return;
    }
    const optIndex = existingRows.length;
    const nextLetter = String.fromCharCode(65 + optIndex);

    const newRow = document.createElement('div');
    newRow.className = 'answer-row';
    newRow.innerHTML = `
        <div class="option-badge">${nextLetter}</div>
        <input type="text" name="questions[${qIndex}][options][${optIndex}][text]" class="form-control" placeholder="Answer option">
        <div class="text-center">
            <input type="radio" name="questions[${qIndex}][correct_option]" value="${optIndex}" class="custom-radio">
        </div>
        <input type="text" name="questions[${qIndex}][options][${optIndex}][feedback]" class="form-control" placeholder="Feedback">
        <div class="text-center">
            <button type="button" class="icon-control-btn text-danger delete-option-btn" title="Remove Option" onclick="removeOptionRow(this)"><i class="fa-solid fa-minus"></i></button>
        </div>
    `;

    optionsWrapper.appendChild(newRow);
    updateOptionControls(card);
    // Task #58: a freshly-added option row starts empty - track it from
    // the start so clearing it later behaves consistently.
    refreshQuestionFieldTrackers(newRow);
    updateAddButtonsState();
}

// Delete an option row with the minus button
function removeOptionRow(btn) {
    const row = btn.closest('.answer-row');
    const wrapper = row.closest('.answer-options-wrapper');
    
    if (wrapper.querySelectorAll('.answer-row').length <= MCQ_MIN_OPTIONS) {
        showActivityAlert('Multiple choice questions must have at least 2 options.', 'Option Limit');
        return;
    }

    // Task #58, Requirement #1: confirm before removing an option that
    // still has a typed answer and/or feedback message.
    if (optionRowHasData(row)) {
        const confirmed = window.confirm(
            'This answer option contains data. Are you sure you want to remove it?'
        );
        if (!confirmed) return;
    }

    const card = wrapper.closest('.question-card');
    const qIndex = card.dataset.questionIndex;
    row.remove();

    // Re-index remaining option badges and field names while preserving checked state
    const remainingRows = wrapper.querySelectorAll('.answer-row');
    remainingRows.forEach((r, idx) => {
        const letter = String.fromCharCode(65 + idx);
        r.querySelector('.option-badge').textContent = letter;
        
        const textInput = r.querySelector('input[type="text"]:nth-of-type(1)');
        const radioInput = r.querySelector('input[type="radio"]');
        const feedbackInput = r.querySelector('input[type="text"]:nth-of-type(2)');

        if (textInput) textInput.name = `questions[${qIndex}][options][${idx}][text]`;
        if (feedbackInput) feedbackInput.name = `questions[${qIndex}][options][${idx}][feedback]`;

        if (radioInput) {
            const wasChecked = radioInput.checked;
            radioInput.name = `questions[${qIndex}][correct_option]`;
            radioInput.value = idx;
            radioInput.checked = wasChecked;
        }
    });
    updateOptionControls(card);
    updateAddButtonsState();
}

// Delete an entire question card
function removeQuestionCard(btn) {
    const card = btn.closest('.question-card');

    // Task #58, Requirement #1: confirm before deleting a question that
    // still has a typed question, answer option, or feedback in it.
    if (questionCardHasData(card)) {
        const confirmed = window.confirm(
            'This question contains data. Are you sure you want to delete it? ' +
            'This action cannot be undone.'
        );
        if (!confirmed) return;
    }

    card.remove();

    const container = document.getElementById('questionsContainer');
    const remainingCards = container.querySelectorAll('.question-card');
    
    if (remainingCards.length === 0) {
        container.innerHTML = `
            <div class="text-muted text-center placeholder-box" id="noQuestionsMessage">
                No questions added yet. Click the button below to add your first question.
            </div>
        `;
    } else {
        reindexAllQuestions();
    }
    updatePointsTotal();
    updateAddButtonsState();
}

// Re-sequence all question numbers and indices
//
// IMPORTANT: radios are grouped by their `name` attribute across the WHOLE
// page, not just within one card. If we rename+recheck one card's radios
// while another card (not yet processed) still has its OLD name, the two
// can briefly collide on the same group name, and checking one radio will
// silently uncheck the other card's "correct" radio before it's even been
// touched. To avoid that race entirely, this runs in three passes:
//   1. Snapshot which option (if any) is checked in every card, first.
//   2. Rename everything, with all radios forced unchecked (so no group can
//      possibly collide while renaming is in progress).
//   3. Once every radio has its final, unique name, re-check the right one
//      in each card from the snapshot taken in step 1.
function reindexAllQuestions() {
    const container = document.getElementById('questionsContainer');
    const remainingCards = container.querySelectorAll('.question-card');

    // Pass 1: snapshot each card's currently-correct option index
    const checkedSnapshot = [];
    remainingCards.forEach((c) => {
        const rows = c.querySelectorAll('.answer-row');
        let checkedIdx = -1;
        rows.forEach((r, optIdx) => {
            const radioInput = r.querySelector('input[type="radio"]');
            if (radioInput && radioInput.checked) checkedIdx = optIdx;
        });
        checkedSnapshot.push(checkedIdx);
    });

    // Pass 2: rename everything with radios forced unchecked (no collisions possible)
    remainingCards.forEach((c, idx) => {
        c.dataset.questionIndex = idx;
        c.querySelector('.question-number').textContent = `Question ${idx + 1}`;

        const textarea = c.querySelector('.question-textarea');
        if (textarea) textarea.name = `questions[${idx}][text]`;
        const qCorrect = c.querySelector('[name$="[correct_feedback]"]:not([name*="[options]"])');
        const qWrong = c.querySelector('[name$="[incorrect_feedback]"]:not([name*="[options]"])');
        if (qCorrect) qCorrect.name = `questions[${idx}][correct_feedback]`;
        if (qWrong) qWrong.name = `questions[${idx}][incorrect_feedback]`;

        const rows = c.querySelectorAll('.answer-row');
        rows.forEach((r, optIdx) => {
            const textInput = r.querySelector('input[type="text"]:nth-of-type(1)');
            const radioInput = r.querySelector('input[type="radio"]');
            const feedbackInput = r.querySelector('input[type="text"]:nth-of-type(2)');

            if (textInput) textInput.name = `questions[${idx}][options][${optIdx}][text]`;
            if (feedbackInput) feedbackInput.name = `questions[${idx}][options][${optIdx}][feedback]`;

            if (radioInput) {
                radioInput.checked = false;
                radioInput.removeAttribute('checked');
                radioInput.name = `questions[${idx}][correct_option]`;
                radioInput.value = optIdx;
            }
        });

        // Update the Add Option onclick attribute with the new question index
        const addOptBtn = c.querySelector('.add-sub-question-btn');
        if (addOptBtn) {
            addOptBtn.setAttribute('onclick', `addOptionRow(this, ${idx})`);
        }
    });

    // Pass 3: every radio now has its final, unique name — safe to restore
    remainingCards.forEach((c, idx) => {
        const checkedIdx = checkedSnapshot[idx];
        if (checkedIdx === -1) return;
        const rows = c.querySelectorAll('.answer-row');
        const targetRow = rows[checkedIdx];
        if (targetRow) {
            const radioInput = targetRow.querySelector('input[type="radio"]');
            if (radioInput) {
                radioInput.checked = true;
                radioInput.setAttribute('checked', 'checked');
            }
        }
    });
}

// 1. Move Question Up
function moveQuestionUp(btn) {
    const card = btn.closest('.question-card');
    const prevCard = card.previousElementSibling;
    if (prevCard && prevCard.classList.contains('question-card')) {
        card.parentNode.insertBefore(card, prevCard);
        // reindexAllQuestions() takes a snapshot of every card's correct
        // answer before renaming anything, then restores it afterward —
        // so every card (not just this one) keeps its correct answer.
        reindexAllQuestions();
    }
}

// 2. Move Question Down
function moveQuestionDown(btn) {
    const card = btn.closest('.question-card');
    const nextCard = card.nextElementSibling;
    if (nextCard && nextCard.classList.contains('question-card')) {
        card.parentNode.insertBefore(nextCard, card);
        reindexAllQuestions();
    }
}

// 3. Duplicate Question Card
function duplicateQuestionCard(btn) {
    // Task #58 & #61: never duplicate while the source question or
    // current last question is incomplete.
    const card = btn.closest('.question-card');
    if (!canAddNewQuestion(card)) return;

    const textarea = card.querySelector('.question-textarea');
    const textVal = textarea ? textarea.value : '';

    const sourceOptionsWrapper = card.querySelector('.answer-options-wrapper');
    const sourceRows = sourceOptionsWrapper ? sourceOptionsWrapper.querySelectorAll('.answer-row') : [];
    
    let correctOptionIdx = 0;
    const options = [];
    sourceRows.forEach((sRow, sIdx) => {
        const textInput = sRow.querySelector('input[type="text"]:nth-of-type(1)');
        const radioInput = sRow.querySelector('input[type="radio"]');
        const feedbackInput = sRow.querySelector('input[type="text"]:nth-of-type(2)');

        const sText = textInput ? textInput.value : '';
        const sIsChecked = radioInput ? radioInput.checked : false;
        const sFeedback = feedbackInput ? feedbackInput.value : '';

        if (sIsChecked) correctOptionIdx = sIdx;
        options.push({ text: sText, feedback: sFeedback });
    });

    const qCorrect = card.querySelector('[name$="[correct_feedback]"]');
    const qWrong = card.querySelector('[name$="[incorrect_feedback]"]');
    addNewQuestionCard({
        text: textVal,
        correct_option: correctOptionIdx,
        options: options,
        correct_feedback: qCorrect ? qCorrect.value : '',
        incorrect_feedback: qWrong ? qWrong.value : ''
    });
}

// Add a brand new Fill in the Blank Card
// feat/fib-console: Question, Code with blank, Correct answer, Expected
// output (+ Generate), Hint, Must contain, and the two feedback texts.
// Items saved before this release (no code) show their old text box and
// keep the old text-match grading until the mentor adds code.
function fibField(card, field) {
    return card.querySelector(`[name$="[${field}]"]`);
}

function addNewFillBlankCard(prefilledData = null) {
    const container = document.getElementById('fillBlanksContainer');
    const emptyMsg = document.getElementById('noFillBlanksMessage');
    if (emptyMsg) emptyMsg.remove();

    const count = container.querySelectorAll('.fill-blank-card').length;
    const index = count;
    const num = index + 1;

    const card = document.createElement('div');
    card.className = 'fill-blank-card';
    card.dataset.index = index;
    if (prefilledData && prefilledData.fib_id) card.dataset.itemId = prefilledData.fib_id; // feat/publishing-tree

    const v = (key, alt) => (prefilledData ? (prefilledData[key] || (alt ? prefilledData[alt] : '') || '') : '');
    const codeVal = v('code_text');
    const legacyVal = codeVal ? '' : v('content', 'text');
    const isLegacy = !!(prefilledData && !codeVal && legacyVal);

    card.innerHTML = `
        <div class="fill-blank-card-header">
            <span class="fill-blank-title">Item ${num}</span>
            <div class="fill-blank-controls card-controls">
                <button type="button" class="icon-control-btn" title="Move Up" onclick="moveFillBlankUp(this)"><i class="fa-solid fa-arrow-up"></i></button>
                <button type="button" class="icon-control-btn" title="Move Down" onclick="moveFillBlankDown(this)"><i class="fa-solid fa-arrow-down"></i></button>
                <button type="button" class="icon-control-btn" title="Duplicate Item" onclick="duplicateFillBlankCard(this)"><i class="fa-regular fa-copy"></i></button>
                <button type="button" class="icon-control-btn text-danger" title="Delete Item" onclick="removeFillBlankCard(this)"><i class="fa-regular fa-trash-can"></i></button>
            </div>
        </div>

        <div class="form-group mb-20 form-group-relative">
            <label class="form-label">Question *</label>
            <textarea name="fill_blanks[${index}][instruction]" class="form-control question-textarea fib-question-input" rows="2" placeholder="e.g. Put the text hi, in quotes, into the blank so the program prints it.">${escapeAttr(v('instruction'))}</textarea>
            <span class="char-counter">${v('instruction').length} / 500</span>
        </div>

        <div class="form-group mb-20">
            <label class="form-label">Code with blank * <small class="text-muted">(mark the blank with ___ )</small></label>
            <textarea name="fill_blanks[${index}][code_text]" class="form-control fib-code-input" rows="4" spellcheck="false" placeholder="message = ___&#10;print(message)">${escapeAttr(codeVal)}</textarea>
        </div>

        <div class="fill-blank-grid-2">
            <div class="form-group">
                <label class="form-label">Correct Answer (what goes in the blank) *</label>
                <input type="text" name="fill_blanks[${index}][correct_answer]" class="form-control" value="${escapeAttr(v('correct_answer', 'answer'))}" placeholder='e.g. "hi"' required>
            </div>
            <div class="form-group">
                <label class="form-label">Must contain <small class="text-muted">(optional)</small></label>
                <input type="text" name="fill_blanks[${index}][must_contain]" class="form-control" value="${escapeAttr(v('must_contain'))}" placeholder="e.g. + (so typing the output itself is not enough)">
            </div>
        </div>

        <div class="form-group mb-20">
            <label class="form-label">Expected output *</label>
            <textarea name="fill_blanks[${index}][expected_output]" class="form-control fib-code-input" rows="2" spellcheck="false" placeholder="What the code prints with the correct answer">${escapeAttr(v('expected_output'))}</textarea>
            <button type="button" class="add-sub-question-btn mt-8 fib-generate-btn" onclick="generateExpectedOutput(this)"><i class="fa-solid fa-play"></i> Generate expected output</button>
            <p class="form-hint fib-run-note" hidden></p>
        </div>

        <div class="form-group mb-20">
            <label class="form-label">Hint <small class="text-muted">(shown while answering - never the answer)</small></label>
            <input type="text" name="fill_blanks[${index}][hint]" class="form-control" value="${escapeAttr(v('hint'))}" placeholder="e.g. Text in Python goes inside quotes.">
        </div>

        <div class="form-group mb-20 fib-legacy-content"${isLegacy ? '' : ' hidden'}>
            <label class="form-label">Old item text <small class="text-muted">(saved before the console - graded by text match until Code is filled in)</small></label>
            <textarea name="fill_blanks[${index}][content]" class="form-control" rows="3">${escapeAttr(legacyVal)}</textarea>
        </div>

        <div class="fill-blank-grid-2">
            <div class="form-group">
                <label class="form-label">Feedback when correct</label>
                <input type="text" name="fill_blanks[${index}][correct_feedback]" class="form-control" value="${escapeAttr(v('correct_feedback', 'correctFeedback'))}" placeholder="Why the answer is right">
            </div>
            <div class="form-group">
                <label class="form-label">Feedback when wrong</label>
                <input type="text" name="fill_blanks[${index}][incorrect_feedback]" class="form-control" value="${escapeAttr(v('incorrect_feedback', 'incorrectFeedback'))}" placeholder="Why it is off - without giving the answer">
            </div>
        </div>
    `;

    container.appendChild(card);
    setupTextareaCounters(card);
    refreshActivityFieldTrackers(card);
    checkAnswerLeaks(card);
    updatePointsTotal();
    updateAddButtonsState();
}

// feat/fib-console: fills Expected output from a real run of the code with
// the correct answer in its blank (POST /admin/api/fib-run).
async function generateExpectedOutput(btn) {
    const card = btn.closest('.fill-blank-card');
    const note = card.querySelector('.fib-run-note');
    const code = fibField(card, 'code_text').value;
    const answer = fibField(card, 'correct_answer').value;
    note.hidden = false;
    if (!code.trim() || !answer.trim()) {
        note.textContent = 'Write the code with its blank and the correct answer first.';
        return;
    }
    btn.disabled = true;
    note.textContent = 'Running the code...';
    try {
        const response = await fetch('/admin/api/fib-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ code, answer })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Could not run the code.');
        if (data.error) {
            note.textContent = `The code stopped with an error: ${data.error}`;
        } else {
            fibField(card, 'expected_output').value = data.output;
            note.textContent = 'Expected output filled in from a real run.';
        }
    } catch (err) {
        note.textContent = err.message;
    } finally {
        btn.disabled = false;
    }
}

// Remove Fill in the Blank Card
function removeFillBlankCard(btn) {
    const card = btn.closest('.fill-blank-card');

    // Task #60: Enforce confirmation before deleting a populated Fill in the Blank item
    if (fillBlankCardHasData(card)) {
        const confirmed = window.confirm(
            'This fill-in-the-blank item contains data. Are you sure you want to delete it? ' +
            'This action cannot be undone.'
        );
        if (!confirmed) return;
    }

    card.remove();

    const container = document.getElementById('fillBlanksContainer');
    const remainingCards = container.querySelectorAll('.fill-blank-card');

    if (remainingCards.length === 0) {
        container.innerHTML = `
            <div class="text-muted text-center placeholder-box" id="noFillBlanksMessage">
                No fill-in-the-blank items added yet. Click the button below to add your first item.
            </div>
        `;
    } else {
        reindexAllFillBlanks();
    }
    updatePointsTotal();
    updateAddButtonsState();
}

// Duplicate Fill in the Blank Card
function duplicateFillBlankCard(btn) {
    const card = btn.closest('.fill-blank-card');
    if (!canAddNewFillBlank(card)) return;

    const copy = {};
    ['instruction', 'code_text', 'correct_answer', 'expected_output', 'hint', 'must_contain',
        'content', 'correct_feedback', 'incorrect_feedback'].forEach((field) => {
        const el = fibField(card, field);
        copy[field] = el ? el.value : '';
    });
    addNewFillBlankCard(copy);
}

// Move Fill in the Blank Item Up
function moveFillBlankUp(btn) {
    const card = btn.closest('.fill-blank-card');
    const prevCard = card.previousElementSibling;
    if (prevCard && prevCard.classList.contains('fill-blank-card')) {
        card.parentNode.insertBefore(card, prevCard);
        reindexAllFillBlanks();
    }
}

// Move Fill in the Blank Item Down
function moveFillBlankDown(btn) {
    const card = btn.closest('.fill-blank-card');
    const nextCard = card.nextElementSibling;
    if (nextCard && nextCard.classList.contains('fill-blank-card')) {
        card.parentNode.insertBefore(nextCard, card);
        reindexAllFillBlanks();
    }
}

// Re-sequence Fill in the Blank items (keeps inputs and names fully
// synced when moved/deleted)
function reindexAllFillBlanks() {
    const container = document.getElementById('fillBlanksContainer');
    const cards = container.querySelectorAll('.fill-blank-card');

    cards.forEach((card, idx) => {
        card.dataset.index = idx;
        card.querySelector('.fill-blank-title').textContent = `Item ${idx + 1}`;

        card.querySelectorAll('[name^="fill_blanks["]').forEach((el) => {
            el.name = el.name.replace(/^fill_blanks\[\d+\]/, `fill_blanks[${idx}]`);
        });
    });
}

// Add a brand new Flashcard Card
function addNewFlashcardCard(prefilledData = null) {
    const container = document.getElementById('flashcardsContainer');
    const emptyMsg = document.getElementById('noFlashcardsMessage');
    if (emptyMsg) emptyMsg.remove();

    const count = container.querySelectorAll('.flashcard-card').length;
    const index = count;
    const num = index + 1;

    const card = document.createElement('div');
    card.className = 'flashcard-card';
    card.dataset.index = index;
    if (prefilledData && prefilledData.flashcard_id) card.dataset.itemId = prefilledData.flashcard_id; // feat/publishing-tree

    // The card's question and its code are edited in separate boxes; a saved
    // card keeps its code in a ``` block inside the front text.
    const split = splitFlashcardFront(prefilledData ? (prefilledData.front || prefilledData.front_text || '') : '');
    let frontVal = split.question;
    const frontCodeVal = prefilledData && prefilledData.front_code !== undefined ? prefilledData.front_code : split.code;
    let backVal = prefilledData ? (prefilledData.back || prefilledData.back_text || '') : '';
    let correctFeedbackVal = prefilledData ? (prefilledData.correctFeedback || prefilledData.correct_feedback || '') : '';
    let incorrectFeedbackVal = prefilledData ? (prefilledData.incorrectFeedback || prefilledData.incorrect_feedback || '') : '';
    const hintVal = prefilledData ? (prefilledData.hint || '') : '';

    card.innerHTML = `
        <div class="flashcard-card-header">
            <span class="flashcard-title">Flashcard ${num}</span>
            <div class="flashcard-controls card-controls">
                <button type="button" class="icon-control-btn" title="Move Up" onclick="moveFlashcardUp(this)"><i class="fa-solid fa-arrow-up"></i></button>
                <button type="button" class="icon-control-btn" title="Move Down" onclick="moveFlashcardDown(this)"><i class="fa-solid fa-arrow-down"></i></button>
                <button type="button" class="icon-control-btn" title="Duplicate Flashcard" onclick="duplicateFlashcardCard(this)"><i class="fa-regular fa-copy"></i></button>
                <button type="button" class="icon-control-btn text-danger" title="Delete Flashcard" onclick="removeFlashcardCard(this)"><i class="fa-regular fa-trash-can"></i></button>
            </div>
        </div>

        <div class="flashcard-grid-2">
            <div class="form-group form-group-relative">
                <label class="form-label">Front Card *</label>
                <textarea name="flashcards[${index}][front]" class="form-control question-textarea" rows="3" placeholder="Prompt, term, or question on the front" required>${escapeAttr(frontVal)}</textarea>
                <span class="char-counter">${frontVal.length} / 500</span>
            </div>
            <div class="form-group form-group-relative">
                <label class="form-label">Back Card *</label>
                <textarea name="flashcards[${index}][back]" class="form-control question-textarea" rows="3" placeholder="Answer or definition revealed on the back" required>${escapeAttr(backVal)}</textarea>
                <span class="char-counter">${backVal.length} / 500</span>
            </div>
        </div>

        <div class="form-group mt-16">
            <label class="form-label">Code on the card <small class="text-muted">(optional - shown under the front question)</small></label>
            <textarea name="flashcards[${index}][front_code]" class="form-control fc-code-input" rows="3" spellcheck="false" placeholder="e.g. x = 5&#10;print(x * 2)">${escapeAttr(frontCodeVal)}</textarea>
        </div>

        <div class="form-group mt-16">
            <label class="form-label">Hint <small class="text-muted">(shown while answering - never the answer)</small></label>
            <input type="text" name="flashcards[${index}][hint]" class="form-control" value="${escapeAttr(hintVal)}" placeholder="Points the way without giving the answer">
        </div>

        <div class="flashcard-grid-2 mt-16">
            <div class="form-group">
                <label class="form-label">Feedback when correct</label>
                <input type="text" name="flashcards[${index}][correct_feedback]" class="form-control" value="${escapeAttr(correctFeedbackVal)}" placeholder="Why the answer is right">
            </div>
            <div class="form-group">
                <label class="form-label">Feedback when wrong</label>
                <input type="text" name="flashcards[${index}][incorrect_feedback]" class="form-control" value="${escapeAttr(incorrectFeedbackVal)}" placeholder="Why it is off - without giving the answer">
            </div>
        </div>
    `;

    container.appendChild(card);
    setupTextareaCounters(card);
    refreshActivityFieldTrackers(card);
    updatePointsTotal();
    updateAddButtonsState();
}

// The question and the ``` code block of a saved card front.
function splitFlashcardFront(text) {
    const source = String(text || '').replace(/\r\n?/g, '\n');
    const m = source.match(/```(?:[ \t]*(?:python3?|py)?[ \t]*\n)?([\s\S]*?)(?:```|$)/i);
    if (!m) return { question: source.trim(), code: '' };
    const question = (source.slice(0, m.index) + source.slice(m.index + m[0].length)).trim();
    return { question, code: m[1].replace(/^\n+|\s+$/g, '') };
}

// Remove Flashcard Card
function removeFlashcardCard(btn) {
    const card = btn.closest('.flashcard-card');

    // Task #60: Enforce confirmation before deleting a populated Flashcard item
    if (flashcardCardHasData(card)) {
        const confirmed = window.confirm(
            'This flashcard contains data. Are you sure you want to delete it? ' +
            'This action cannot be undone.'
        );
        if (!confirmed) return;
    }

    card.remove();

    const container = document.getElementById('flashcardsContainer');
    const remainingCards = container.querySelectorAll('.flashcard-card');

    if (remainingCards.length === 0) {
        container.innerHTML = `
            <div class="text-muted text-center placeholder-box" id="noFlashcardsMessage">
                No flashcards added yet. Click the button below to add your first flashcard.
            </div>
        `;
    } else {
        reindexAllFlashcards();
    }
    updatePointsTotal();
    updateAddButtonsState();
}

// Re-sequence Flashcard items and fields
function reindexAllFlashcards() {
    const container = document.getElementById('flashcardsContainer');
    const cards = container.querySelectorAll('.flashcard-card');

    cards.forEach((card, idx) => {
        card.dataset.index = idx;
        card.querySelector('.flashcard-title').textContent = `Flashcard ${idx + 1}`;

        card.querySelectorAll('[name^="flashcards["]').forEach((el) => {
            el.name = el.name.replace(/^flashcards\[\d+\]/, `flashcards[${idx}]`);
        });
    });
}

// Duplicate Flashcard Card
function duplicateFlashcardCard(btn) {
    const card = btn.closest('.flashcard-card');
    if (!canAddNewFlashcard(card)) return;

    const val = (field) => { const el = card.querySelector(`[name$="[${field}]"]`); return el ? el.value : ''; };
    addNewFlashcardCard({
        front: val('front'),
        front_code: val('front_code'),
        back: val('back'),
        hint: val('hint'),
        correctFeedback: val('correct_feedback'),
        incorrectFeedback: val('incorrect_feedback')
    });
}

// Move Flashcard Up
function moveFlashcardUp(btn) {
    const card = btn.closest('.flashcard-card');
    const prevCard = card.previousElementSibling;
    if (prevCard && prevCard.classList.contains('flashcard-card')) {
        card.parentNode.insertBefore(card, prevCard);
        reindexAllFlashcards();
    }
}

// Move Flashcard Down
function moveFlashcardDown(btn) {
    const card = btn.closest('.flashcard-card');
    const nextCard = card.nextElementSibling;
    if (nextCard && nextCard.classList.contains('flashcard-card')) {
        card.parentNode.insertBefore(nextCard, card);
        reindexAllFlashcards();
    }
}