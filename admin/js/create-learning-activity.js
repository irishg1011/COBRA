/**
 * create-learning-activity.js
 * --------------------------------------------------------------------
 * Task #58 additions (Multiple Choice question builder only - Section 2
 * of Create Learning Activity):
 *
 *   1. Confirmation warning before any question-builder field (Question
 *      text, an Answer Option, or a Feedback field) is CLEARED from
 *      having text to being empty - covers both manual clearing (select
 *      all + delete/backspace) and clicking a trash/delete icon
 *      (removeQuestionCard / removeOptionRow) on a question/option that
 *      still has typed data. Canceling restores the previous value
 *      (for in-field clears) or aborts the removal (for delete icons).
 *
 *   2. Live casing normalization on every Question / Answer Option /
 *      Feedback field: first character uppercase, every other character
 *      lowercase - mirrors the exact same rule already used server-side
 *      for Activity/Lesson/Category names (text_formatting.py,
 *      lesson_validation.py, activity_validation.py) and client-side in
 *      create-learning-activity-validations.js for the Activity Title
 *      field, just applied here to the Section 2 builder fields.
 *
 *   3. "Add Question" / "Duplicate Question" are blocked (with an
 *      explanatory alert) unless the CURRENT last question card already
 *      has its Question text, every Answer Option, and every Feedback
 *      field filled in - so a new/duplicated card can never be appended
 *      while the previous one is still incomplete.
 *
 * All three behaviors are implemented via event delegation scoped to
 * #questionsContainer, so they apply uniformly to every question card -
 * including ones added, duplicated, moved, or reindexed after page
 * load - without needing to re-bind anything per card.
 */

// ========================================================================
// TASK #58 & TASK #60: shared helpers - casing normalization,
// clear-confirmation, deletion protection, and completeness checks across
// Multiple Choice, Fill in the Blanks, and Flashcards builders.
// ========================================================================

// Tracks the last known value of every guarded field across all activity builders,
// keyed by the actual DOM element - this is what lets us tell "the admin just
// cleared a field that had text" apart from "this field has always been empty",
// without needing a data-* attribute that would have to be kept in sync separately.
const activityFieldValueTracker = new WeakMap();
// Alias for backward compatibility
const questionFieldValueTracker = activityFieldValueTracker;

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

// Alias for backward compatibility
function isGuardedQuestionField(el) {
    return isGuardedActivityField(el);
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

// Alias for backward compatibility
function normalizeQuestionFieldCasing(value) {
    return normalizeActivityFieldCasing(value);
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

// Alias for backward compatibility
function applyQuestionFieldCasing(el) {
    applyActivityFieldCasing(el);
}

/**
 * (Re)synchronizes the tracker for every guarded field currently inside
 * `scopeEl` to that field's CURRENT value. Must be called right after a
 * card is created or duplicated (including once its options/inputs
 * have been copied over), so a freshly-duplicated field that already
 * has text is correctly recognized as "has data" the very first time
 * the admin tries to clear it - not just after they've typed into it
 * once themselves.
 */
function refreshActivityFieldTrackers(scopeEl) {
    if (!scopeEl || !scopeEl.querySelectorAll) return;
    scopeEl.querySelectorAll('textarea, input[type="text"]').forEach((el) => {
        if (isGuardedActivityField(el)) {
            activityFieldValueTracker.set(el, el.value || '');
        }
    });
}

// Alias for backward compatibility
function refreshQuestionFieldTrackers(scopeEl) {
    refreshActivityFieldTrackers(scopeEl);
}

/**
 * Task #58 & Task #60, Requirement #1 (in-field clearing): fires on every input
 * event anywhere inside the activity content builders. If a guarded field just
 * transitioned from having text to being completely empty, the admin is
 * asked to confirm; canceling restores the field to its previous value.
 * Otherwise (still has text, or was already empty), the field's casing
 * is normalized live (Requirement #2) and the tracker is updated.
 */
function handleActivityFieldInput(e) {
    const el = e.target;
    if (!isGuardedActivityField(el)) return;

    const previousValue = activityFieldValueTracker.has(el) ? activityFieldValueTracker.get(el) : '';
    const currentValue = el.value;

    if (previousValue.trim() !== '' && currentValue.trim() === '') {
        const confirmed = window.confirm(
            'This field contains data. Are you sure you want to clear it?'
        );
        if (!confirmed) {
            el.value = previousValue;
            activityFieldValueTracker.set(el, previousValue);
            if (typeof el.setSelectionRange === 'function') {
                el.setSelectionRange(previousValue.length, previousValue.length);
            }
            return;
        }
        // Confirmed - the field is intentionally left empty.
        activityFieldValueTracker.set(el, '');
        return;
    }

    applyActivityFieldCasing(el);
    activityFieldValueTracker.set(el, el.value);
}

// Alias for backward compatibility
function handleQuestionBuilderInput(e) {
    handleActivityFieldInput(e);
}

/**
 * Initializes tracking for a guarded field the first time it's ever
 * focused (covers a field that's focused and then cleared before any
 * 'input' event has had a chance to seed the tracker - e.g. focus,
 * select-all, delete, all before this field has been touched otherwise).
 */
function initActivityFieldTracking(e) {
    const el = e.target;
    if (!isGuardedActivityField(el)) return;
    if (!activityFieldValueTracker.has(el)) {
        activityFieldValueTracker.set(el, el.value || '');
    }
}

// Alias for backward compatibility
function initQuestionFieldTracking(e) {
    initActivityFieldTracking(e);
}

document.addEventListener('input', handleActivityFieldInput);
// 'focus' does not bubble, so this listener must be registered in the
// capture phase to reliably see focus events on nested inputs/textareas.
document.addEventListener('focus', initActivityFieldTracking, true);

/**
 * True only if `card` has its Question text filled in AND every one of
 * its current Answer Options has BOTH an answer and a feedback message
 * filled in (matches the "Feedback for Learner *" required column shown
 * in the builder). A question with fewer than 2 options is treated as
 * incomplete, since Multiple Choice always requires at least 2.
 */
function isQuestionCardComplete(card) {
    if (!card) return false;

    const textarea = card.querySelector('.question-textarea');
    const questionText = textarea ? textarea.value.trim() : '';
    if (!questionText) return false;

    const rows = card.querySelectorAll('.answer-row');
    if (rows.length < 2) return false;

    for (const row of rows) {
        const textInput = row.querySelector('input[type="text"]:nth-of-type(1)');
        const feedbackInput = row.querySelector('input[type="text"]:nth-of-type(2)');
        const optionText = textInput ? textInput.value.trim() : '';
        const feedbackText = feedbackInput ? feedbackInput.value.trim() : '';
        if (!optionText || !feedbackText) return false;
    }

    return true;
}

/**
 * Task #58, Requirement #3: gate for both "Add Question" and "Duplicate
 * Question". Returns true (and does nothing else) when there is no
 * existing question yet, or the current LAST question card is fully
 * complete. Otherwise alerts the admin with the reason and returns
 * false, so the caller can abort before appending/duplicating anything.
 */
function canAddNewQuestion() {
    const container = document.getElementById('questionsContainer');
    if (!container) return true;

    const cards = container.querySelectorAll('.question-card');
    if (cards.length === 0) return true;

    const lastCard = cards[cards.length - 1];
    if (!isQuestionCardComplete(lastCard)) {
        alert(
            'Please complete the current question first - the question text, ' +
            'every answer option, and every feedback field are all required ' +
            'before adding or duplicating another question.'
        );
        return false;
    }

    return true;
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
function hasPopulatedActivityContent(type) {
    if (!type || type === 'Multiple Choice') {
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
    if (selectedType === 'Multiple Choice') {
        if (multipleChoiceSection) {
            multipleChoiceSection.classList.remove('d-none');
            multipleChoiceSection.style.display = 'block';
        }
        if (instructionLabel) instructionLabel.textContent = 'MULTIPLE CHOICE';
        if (instructionDesc) instructionDesc.textContent = 'Create questions with multiple answer options. Add feedback for each option.';
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
            addNewQuestionCard();
        });
    }

    // OUTSIDE BUTTON: Add a brand new Fill in the Blank Item
    const addFillBlankMainBtn = document.getElementById('addFillBlankMainBtn');
    if (addFillBlankMainBtn) {
        addFillBlankMainBtn.addEventListener('click', function() {
            addNewFillBlankCard();
        });
    }

    // OUTSIDE BUTTON: Add a brand new Flashcard Item
    const addFlashcardMainBtn = document.getElementById('addFlashcardMainBtn');
    if (addFlashcardMainBtn) {
        addFlashcardMainBtn.addEventListener('click', function() {
            addNewFlashcardCard();
        });
    }

    refreshActivityFieldTrackers(document);
    updatePointsTotal();
});

// Function to update Points based on total item count for the active activity type
function updatePointsTotal() {
    const activityTypeSelect = document.getElementById('activityType');
    const activityType = activityTypeSelect ? activityTypeSelect.value : 'Multiple Choice';
    let totalItems = 0;

    if (activityType === 'Multiple Choice') {
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
    
    let questionTextVal = prefilledData ? prefilledData.text : '';
    
    card.innerHTML = `
        <div class="question-card-header">
            <span class="question-number">Question ${qNum}</span>
            <div class="question-controls" style="display: flex; gap: 8px; align-items: center;">
                <button type="button" class="icon-control-btn" title="Move Up" onclick="moveQuestionUp(this)"><i class="fa-solid fa-arrow-up"></i></button>
                <button type="button" class="icon-control-btn" title="Move Down" onclick="moveQuestionDown(this)"><i class="fa-solid fa-arrow-down"></i></button>
                <button type="button" class="icon-control-btn" title="Duplicate Question" onclick="duplicateQuestionCard(this)"><i class="fa-regular fa-copy"></i></button>
                <button type="button" class="icon-control-btn text-danger" title="Delete Question" onclick="removeQuestionCard(this)"><i class="fa-regular fa-trash-can"></i></button>
            </div>
        </div>

        <div class="question-body-content">
            <div class="form-group mb-20" style="position: relative;">
                <label class="form-label">Question *</label>
                <textarea name="questions[${qIndex}][text]" class="form-control question-textarea" rows="2" placeholder="Type your question here..." required>${questionTextVal}</textarea>
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

                <!-- Default 2 initial options upon question creation -->
                <div class="answer-row">
                    <div class="option-badge">A</div>
                    <input type="text" name="questions[${qIndex}][options][0][text]" class="form-control" placeholder="Answer option" required>
                    <div class="text-center">
                        <input type="radio" name="questions[${qIndex}][correct_option]" value="0" class="custom-radio" checked>
                    </div>
                    <input type="text" name="questions[${qIndex}][options][0][feedback]" class="form-control" placeholder="Feedback">
                    <div class="text-center">
                        <button type="button" class="icon-control-btn text-danger delete-option-btn" title="Remove Option" onclick="removeOptionRow(this)"><i class="fa-solid fa-minus"></i></button>
                    </div>
                </div>

                <div class="answer-row">
                    <div class="option-badge">B</div>
                    <input type="text" name="questions[${qIndex}][options][1][text]" class="form-control" placeholder="Answer option" required>
                    <div class="text-center">
                        <input type="radio" name="questions[${qIndex}][correct_option]" value="1" class="custom-radio">
                    </div>
                    <input type="text" name="questions[${qIndex}][options][1][feedback]" class="form-control" placeholder="Feedback">
                    <div class="text-center">
                        <button type="button" class="icon-control-btn text-danger delete-option-btn" title="Remove Option" onclick="removeOptionRow(this)"><i class="fa-solid fa-minus"></i></button>
                    </div>
                </div>
            </div>

            <!-- INSIDE BUTTON: Add Option -->
            <button type="button" class="add-sub-question-btn mt-14" onclick="addOptionRow(this, ${qIndex})">
                <i class="fa-solid fa-plus"></i> Add Option
            </button>
        </div>
    `;

    container.appendChild(card);
    setupTextareaCounters(card);
    // Task #58: seed the clear-confirmation tracker with whatever this
    // card starts out with (blank for a fresh card, or the prefilled
    // Question text passed in for a duplicate - option values are
    // copied in separately by duplicateQuestionCard(), which refreshes
    // the tracker itself once that's done).
    refreshQuestionFieldTrackers(card);
    updatePointsTotal();
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
    // Task #58: a freshly-added option row starts empty - track it from
    // the start so clearing it later behaves consistently.
    refreshQuestionFieldTrackers(newRow);
}

// Delete an option row with the minus button
function removeOptionRow(btn) {
    const row = btn.closest('.answer-row');
    const wrapper = row.closest('.answer-options-wrapper');
    
    if (wrapper.querySelectorAll('.answer-row').length <= 2) {
        alert('Multiple choice questions must have at least 2 options.');
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
            <div class="text-muted text-center py-4" id="noQuestionsMessage" style="padding: 30px; background: #f8fafc; border: 2px dashed #e2e8f0; border-radius: 8px; margin-bottom: 20px;">
                No questions added yet. Click the button below to add your first question.
            </div>
        `;
    } else {
        reindexAllQuestions();
    }
    updatePointsTotal();
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
    // Task #58, Requirement #3: never duplicate while the current last
    // question is still incomplete - a duplicate always gets appended
    // to the end, so this is the same completeness gate as "Add
    // Question".
    if (!canAddNewQuestion()) return;

    const card = btn.closest('.question-card');
    const textarea = card.querySelector('.question-textarea');
    const textVal = textarea ? textarea.value : '';

    addNewQuestionCard({ text: textVal });
    
    // Copy options data over to the newly appended duplicated card
    const container = document.getElementById('questionsContainer');
    const allCards = container.querySelectorAll('.question-card');
    const newCard = allCards[allCards.length - 1];

    // Remove default options of new card and replace with source card options
    const newOptionsWrapper = newCard.querySelector('.answer-options-wrapper');
    const sourceOptionsWrapper = card.querySelector('.answer-options-wrapper');
    
    const sourceRows = sourceOptionsWrapper.querySelectorAll('.answer-row');
    const newQIndex = newCard.dataset.questionIndex;
    
    newOptionsWrapper.querySelectorAll('.answer-row').forEach(r => r.remove());

    sourceRows.forEach((sRow, sIdx) => {
        const sText = sRow.querySelector('input[type="text"]:nth-of-type(1)').value;
        const sIsChecked = sRow.querySelector('input[type="radio"]').checked;
        const sFeedback = sRow.querySelector('input[type="text"]:nth-of-type(2)').value;
        const letter = String.fromCharCode(65 + sIdx);

        const clonedRow = document.createElement('div');
        clonedRow.className = 'answer-row';
        clonedRow.innerHTML = `
            <div class="option-badge">${letter}</div>
            <input type="text" name="questions[${newQIndex}][options][${sIdx}][text]" class="form-control" value="${sText}" placeholder="Answer option" required>
            <div class="text-center">
                <input type="radio" name="questions[${newQIndex}][correct_option]" value="${sIdx}" class="custom-radio" ${sIsChecked ? 'checked' : ''}>
            </div>
            <input type="text" name="questions[${newQIndex}][options][${sIdx}][feedback]" class="form-control" value="${sFeedback}" placeholder="Feedback">
            <div class="text-center">
                <button type="button" class="icon-control-btn text-danger delete-option-btn" title="Remove Option" onclick="removeOptionRow(this)"><i class="fa-solid fa-minus"></i></button>
            </div>
        `;
        newOptionsWrapper.appendChild(clonedRow);
    });

    // Task #58 & Task #60: the duplicated options were just copied in with real
    // values (not typed), so the clear-confirmation tracker must be
    // refreshed AFTER copying - otherwise the very first attempt to
    // clear a duplicated field wouldn't be recognized as "had data".
    refreshActivityFieldTrackers(newCard);
}

// Add a brand new Fill in the Blank Card
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

    let textVal = prefilledData ? prefilledData.text : '';
    let answerVal = prefilledData ? prefilledData.answer : '';
    let correctFeedbackVal = prefilledData ? prefilledData.correctFeedback : '';
    let incorrectFeedbackVal = prefilledData ? prefilledData.incorrectFeedback : '';

    card.innerHTML = `
        <div class="fill-blank-card-header">
            <span class="fill-blank-title">Item ${num}</span>
            <div class="fill-blank-controls" style="display: flex; gap: 8px; align-items: center;">
                <button type="button" class="icon-control-btn" title="Move Up" onclick="moveFillBlankUp(this)"><i class="fa-solid fa-arrow-up"></i></button>
                <button type="button" class="icon-control-btn" title="Move Down" onclick="moveFillBlankDown(this)"><i class="fa-solid fa-arrow-down"></i></button>
                <button type="button" class="icon-control-btn" title="Duplicate Item" onclick="duplicateFillBlankCard(this)"><i class="fa-regular fa-copy"></i></button>
                <button type="button" class="icon-control-btn text-danger" title="Delete Item" onclick="removeFillBlankCard(this)"><i class="fa-regular fa-trash-can"></i></button>
            </div>
        </div>

        <div class="form-group mb-20" style="position: relative;">
            <label class="form-label">Question / Content (Include the blank) *</label>
            <textarea name="fill_blanks[${index}][content]" class="form-control question-textarea" rows="3" placeholder="e.g. To define a function in Python, we use the [_____] keyword." required>${textVal}</textarea>
            <span class="char-counter">${textVal.length} / 500</span>
        </div>

        <div class="form-group mb-20">
            <label class="form-label">Correct Answer (word, value, or code to fill in) *</label>
            <input type="text" name="fill_blanks[${index}][correct_answer]" class="form-control" value="${answerVal}" placeholder="e.g. def" required>
        </div>

        <div class="fill-blank-grid-2">
            <div class="form-group">
                <label class="form-label">Correct Feedback</label>
                <input type="text" name="fill_blanks[${index}][correct_feedback]" class="form-control" value="${correctFeedbackVal}" placeholder="Feedback shown when the learner answers correctly">
            </div>
            <div class="form-group">
                <label class="form-label">Incorrect Feedback</label>
                <input type="text" name="fill_blanks[${index}][incorrect_feedback]" class="form-control" value="${incorrectFeedbackVal}" placeholder="Feedback shown when the learner answers incorrectly">
            </div>
        </div>
    `;

    container.appendChild(card);
    setupTextareaCounters(card);
    refreshActivityFieldTrackers(card);
    updatePointsTotal();
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
}

// Duplicate Fill in the Blank Card
function duplicateFillBlankCard(btn) {
    const card = btn.closest('.fill-blank-card');
    const textarea = card.querySelector('textarea');
    const inputs = card.querySelectorAll('input[type="text"]');

    addNewFillBlankCard({
        text: textarea ? textarea.value : '',
        answer: inputs[0] ? inputs[0].value : '',
        correctFeedback: inputs[1] ? inputs[1].value : '',
        incorrectFeedback: inputs[2] ? inputs[2].value : ''
    });
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

        const textarea = card.querySelector('textarea');
        if (textarea) textarea.name = `fill_blanks[${idx}][content]`;

        const inputs = card.querySelectorAll('input[type="text"]');
        if (inputs[0]) inputs[0].name = `fill_blanks[${idx}][correct_answer]`;
        if (inputs[1]) inputs[1].name = `fill_blanks[${idx}][correct_feedback]`;
        if (inputs[2]) inputs[2].name = `fill_blanks[${idx}][incorrect_feedback]`;
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

    let frontVal = prefilledData ? prefilledData.front : '';
    let backVal = prefilledData ? prefilledData.back : '';
    let correctFeedbackVal = prefilledData ? prefilledData.correctFeedback : '';
    let incorrectFeedbackVal = prefilledData ? prefilledData.incorrectFeedback : '';

    card.innerHTML = `
        <div class="flashcard-card-header">
            <span class="flashcard-title">Flashcard ${num}</span>
            <div class="flashcard-controls" style="display: flex; gap: 8px; align-items: center;">
                <button type="button" class="icon-control-btn" title="Move Up" onclick="moveFlashcardUp(this)"><i class="fa-solid fa-arrow-up"></i></button>
                <button type="button" class="icon-control-btn" title="Move Down" onclick="moveFlashcardDown(this)"><i class="fa-solid fa-arrow-down"></i></button>
                <button type="button" class="icon-control-btn" title="Duplicate Flashcard" onclick="duplicateFlashcardCard(this)"><i class="fa-regular fa-copy"></i></button>
                <button type="button" class="icon-control-btn text-danger" title="Delete Flashcard" onclick="removeFlashcardCard(this)"><i class="fa-regular fa-trash-can"></i></button>
            </div>
        </div>

        <div class="flashcard-grid-2">
            <div class="form-group" style="position: relative;">
                <label class="form-label">Front Card *</label>
                <textarea name="flashcards[${index}][front]" class="form-control question-textarea" rows="3" placeholder="Prompt, term, or question on the front" required>${frontVal}</textarea>
                <span class="char-counter">${frontVal.length} / 500</span>
            </div>
            <div class="form-group" style="position: relative;">
                <label class="form-label">Back Card *</label>
                <textarea name="flashcards[${index}][back]" class="form-control question-textarea" rows="3" placeholder="Answer or definition revealed on the back" required>${backVal}</textarea>
                <span class="char-counter">${backVal.length} / 500</span>
            </div>
        </div>

        <div class="flashcard-grid-2 mt-16">
            <div class="form-group">
                <label class="form-label">Correct Feedback</label>
                <input type="text" name="flashcards[${index}][correct_feedback]" class="form-control" value="${correctFeedbackVal}" placeholder="Feedback shown when the learner answer correctly">
            </div>
            <div class="form-group">
                <label class="form-label">Incorrect Feedback</label>
                <input type="text" name="flashcards[${index}][incorrect_feedback]" class="form-control" value="${incorrectFeedbackVal}" placeholder="Feedback shown when the learner answer incorrectly">
            </div>
        </div>
    `;

    container.appendChild(card);
    setupTextareaCounters(card);
    refreshActivityFieldTrackers(card);
    updatePointsTotal();
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
}

// Re-sequence Flashcard items and fields
function reindexAllFlashcards() {
    const container = document.getElementById('flashcardsContainer');
    const cards = container.querySelectorAll('.flashcard-card');

    cards.forEach((card, idx) => {
        card.dataset.index = idx;
        card.querySelector('.flashcard-title').textContent = `Flashcard ${idx + 1}`;

        const textareas = card.querySelectorAll('textarea');
        if (textareas[0]) textareas[0].name = `flashcards[${idx}][front]`;
        if (textareas[1]) textareas[1].name = `flashcards[${idx}][back]`;

        const inputs = card.querySelectorAll('input[type="text"]');
        if (inputs[0]) inputs[0].name = `flashcards[${idx}][correct_feedback]`;
        if (inputs[1]) inputs[1].name = `flashcards[${idx}][incorrect_feedback]`;
    });
}

// Duplicate Flashcard Card
function duplicateFlashcardCard(btn) {
    const card = btn.closest('.flashcard-card');
    const textareas = card.querySelectorAll('textarea');
    const inputs = card.querySelectorAll('input[type="text"]');

    addNewFlashcardCard({
        front: textareas[0] ? textareas[0].value : '',
        back: textareas[1] ? textareas[1].value : '',
        correctFeedback: inputs[0] ? inputs[0].value : '',
        incorrectFeedback: inputs[1] ? inputs[1].value : ''
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