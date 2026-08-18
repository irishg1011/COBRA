document.addEventListener('DOMContentLoaded', function() {
    // Activity Type Dropdown Change Logic
    const activityTypeSelect = document.getElementById('activityType');
    
    // Containers for different activity types
    const multipleChoiceSection = document.getElementById('multipleChoiceSection');
    const fillBlanksSection = document.getElementById('fillBlanksSection');
    const flashcardsSection = document.getElementById('flashcardsSection');
    
    const instructionLabel = document.querySelector('.sub-instruction strong');
    const instructionDesc = document.querySelector('.sub-instruction p');

    if (activityTypeSelect) {
        activityTypeSelect.addEventListener('change', function() {
            const selectedType = this.value;

            // Hide all sections using d-none
            if (multipleChoiceSection) multipleChoiceSection.classList.add('d-none');
            if (fillBlanksSection) fillBlanksSection.classList.add('d-none');
            if (flashcardsSection) flashcardsSection.classList.add('d-none');

            // Show selected section and update instructions
            if (selectedType === 'Multiple Choice') {
                if (multipleChoiceSection) multipleChoiceSection.classList.remove('d-none');
                if (instructionLabel) instructionLabel.textContent = 'MULTIPLE CHOICE';
                if (instructionDesc) instructionDesc.textContent = 'Create questions with multiple answer options. Add feedback for each option.';
            } else if (selectedType === 'Fill in the Blanks') {
                if (fillBlanksSection) fillBlanksSection.classList.remove('d-none');
                if (instructionLabel) instructionLabel.textContent = 'FILL IN THE BLANKS';
                if (instructionDesc) instructionDesc.textContent = 'Create sentences with missing words. Use [_____] to indicate where the blank space goes in the sentence.';
            } else if (selectedType === 'Flashcards') {
                if (flashcardsSection) flashcardsSection.classList.remove('d-none');
                if (instructionLabel) instructionLabel.textContent = 'FLASHCARDS';
                if (instructionDesc) instructionDesc.textContent = 'Create front and back flashcard terms for studying.';
            }
            updatePointsTotal();
        });
    }

    // OUTSIDE BUTTON: Add a brand new Question Card
    const addQuestionMainBtn = document.getElementById('addQuestionMainBtn');
    if (addQuestionMainBtn) {
        addQuestionMainBtn.addEventListener('click', function() {
            addNewQuestionCard();
        });
    }
});

// Function to update Points based on total question count
function updatePointsTotal() {
    const container = document.getElementById('questionsContainer');
    const questionCards = container.querySelectorAll('.question-card');
    const pointsInput = document.getElementById('activityPoints');
    if (pointsInput) {
        pointsInput.value = questionCards.length;
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
}

// Delete an option row with the minus button
function removeOptionRow(btn) {
    const row = btn.closest('.answer-row');
    const wrapper = row.closest('.answer-options-wrapper');
    
    if (wrapper.querySelectorAll('.answer-row').length <= 2) {
        alert('Multiple choice questions must have at least 2 options.');
        return;
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
}

document.addEventListener('DOMContentLoaded', function() {
    // ... existing initialization code ...

    // OUTSIDE BUTTON: Add a brand new Fill in the Blank Item
    const addFillBlankMainBtn = document.getElementById('addFillBlankMainBtn');
    if (addFillBlankMainBtn) {
        addFillBlankMainBtn.addEventListener('click', function() {
            addNewFillBlankCard();
        });
    }

    // Update Activity Type change listener to calculate points based on active section
    if (activityTypeSelect) {
        activityTypeSelect.addEventListener('change', function() {
            const selectedType = this.value;

            if (multipleChoiceSection) multipleChoiceSection.style.display = 'none';
            if (fillBlanksSection) fillBlanksSection.style.display = 'none';
            if (flashcardsSection) flashcardsSection.style.display = 'none';

            if (selectedType === 'Multiple Choice') {
                if (multipleChoiceSection) multipleChoiceSection.style.display = 'block';
                if (instructionLabel) instructionLabel.textContent = 'MULTIPLE CHOICE';
                if (instructionDesc) instructionDesc.textContent = 'Create questions with multiple answer options. Add feedback for each option.';
            } else if (selectedType === 'Fill in the Blanks') {
                if (fillBlanksSection) fillBlanksSection.style.display = 'block';
                if (instructionLabel) instructionLabel.textContent = 'FILL IN THE BLANKS';
                if (instructionDesc) instructionDesc.textContent = 'Create sentences or statements with missing words. Add the correct answers and feedback for each response.';
            } else if (selectedType === 'Flashcards') {
                if (flashcardsSection) flashcardsSection.style.display = 'block';
                if (instructionLabel) instructionLabel.textContent = 'FLASHCARDS';
                if (instructionDesc) instructionDesc.textContent = 'Create front and back flashcard terms for studying.';
            }
            updatePointsTotal();
        });
    }
});

// Update dynamic points calculation to support multiple activity types
function updatePointsTotal() {
    const activityType = document.getElementById('activityType').value;
    let totalItems = 0;

    if (activityType === 'Multiple Choice') {
        const container = document.getElementById('questionsContainer');
        totalItems = container.querySelectorAll('.question-card').length;
    } else if (activityType === 'Fill in the Blanks') {
        const container = document.getElementById('fillBlanksContainer');
        totalItems = container.querySelectorAll('.fill-blank-card').length;
    }

    const pointsInput = document.getElementById('activityPoints');
    if (pointsInput) {
        pointsInput.value = totalItems;
    }
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
    updatePointsTotal();
}

// Remove Fill in the Blank Card
function removeFillBlankCard(btn) {
    const card = btn.closest('.fill-blank-card');
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

// Re-sequence Fill in the Blank items
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

// Updated reindex function to keep inputs and names fully synced when moved/deleted
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