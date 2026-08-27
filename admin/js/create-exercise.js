document.addEventListener('DOMContentLoaded', function () {
    console.log("Create Exercise frontend script loaded successfully.");

    // Task #69: Setup Exercise Title live casing normalization
    setupTitleCasingNormalization('exerciseTitle');

    // Dynamic character counters setup
    setupCharacterCounter('exerciseInstruction', 'instructionCount', 1000);
    setupCharacterCounter('problemSituation', 'situationCount', 500);
    setupCharacterCounter('problemQuestion', 'questionCount', 500);
    setupCharacterCounter('problemClue', 'clueCount', 500);

    // Initialize exactly ONE empty test case row if container is empty
    const testCaseContainer = document.getElementById('testCasesContainer');
    if (testCaseContainer && testCaseContainer.children.length === 0) {
        addTestCaseRow('', '');
    }

    // Add Test Case button listener (using 'once' or checking to prevent duplicate triggers)
    const addTestCaseBtn = document.getElementById('addTestCaseBtn');
    if (addTestCaseBtn && !addTestCaseBtn.dataset.listenerAttached) {
        addTestCaseBtn.dataset.listenerAttached = "true";
        addTestCaseBtn.addEventListener('click', function (e) {
            e.preventDefault();
            addTestCaseRow('', '');
        });
    }
});

/* =================================================================
   Task #69: Live Exercise Title Casing Normalization
==================================================================== */
function formatSentenceCaseLive(value) {
    if (!value) return value;
    const lower = value.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function setupTitleCasingNormalization(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('input', function () {
        const start = input.selectionStart;
        const end = input.selectionEnd;

        input.value = formatSentenceCaseLive(input.value);

        if (start !== null && end !== null) {
            input.setSelectionRange(start, end);
        }
    });
}

function setupCharacterCounter(textareaId, counterId, maxLength) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    
    let counter = document.getElementById(counterId);
    if (!counter) {
        counter = textarea.parentElement.querySelector('.char-counter');
    }

    if (textarea && counter) {
        textarea.addEventListener('input', function () {
            const currentLength = textarea.value.length;
            counter.textContent = `${currentLength} / ${maxLength}`;
            if (currentLength >= maxLength) {
                counter.style.color = '#ef4444';
            } else {
                counter.style.color = '#94a3b8';
            }
        });
    }
}

/* =================================================================
   Dynamic Test Cases Management Functions
==================================================================== */

function addTestCaseRow(inputVal = '', outputVal = '') {
    const container = document.getElementById('testCasesContainer');
    if (!container) return;

    const index = container.querySelectorAll('.test-case-row').length;
    const num = index + 1;

    const row = document.createElement('div');
    row.className = 'test-case-row';
    row.dataset.index = index;
    row.style.cssText = "display: flex; align-items: center; gap: 16px; margin-bottom: 12px; background: #ffffff; padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px;";

    row.innerHTML = `
        <div class="test-case-badge" style="font-weight: 500; color: #64748b; min-width: 20px; text-align: center; font-size: 14px;">${num}</div>
        
        <div style="flex: 1;">
            <label class="form-label" style="font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 6px; display: block;">Input</label>
            <input type="text" name="test_cases[${index}][input]" class="form-control" value="${inputVal}" placeholder="e.g., 5" required>
        </div>

        <div style="flex: 1;">
            <label class="form-label" style="font-size: 12px; font-weight: 500; color: #475569; margin-bottom: 6px; display: block;">Expected Output</label>
            <input type="text" name="test_cases[${index}][output]" class="form-control" value="${outputVal}" placeholder="e.g., Positive" required>
        </div>

        <div style="display: flex; align-items: center; padding-top: 20px;">
            <button type="button" class="icon-control-btn text-danger" title="Delete" onclick="removeTestCaseRow(this)" style="background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 15px; transition: color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'"><i class="fa-solid fa-trash-can"></i></button>
        </div>
    `;

    container.appendChild(row);
}

function removeTestCaseRow(btn) {
    const row = btn.closest('.test-case-row');
    const container = document.getElementById('testCasesContainer');

    if (container.querySelectorAll('.test-case-row').length <= 1) {
        alert('You must have at least one test case.');
        return;
    }

    row.remove();
    reindexTestCases();
}

function reindexTestCases() {
    const container = document.getElementById('testCasesContainer');
    if (!container) return;

    const rows = container.querySelectorAll('.test-case-row');
    rows.forEach((row, idx) => {
        row.dataset.index = idx;
        row.querySelector('.test-case-badge').textContent = idx + 1;

        const inputField = row.querySelector('input[name*="[input]"]');
        const outputField = row.querySelector('input[name*="[output]"]');

        if (inputField) inputField.name = `test_cases[${idx}][input]`;
        if (outputField) outputField.name = `test_cases[${idx}][output]`;
    });
}