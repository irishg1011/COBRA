// Global submission state flag to suppress beforeunload alert on intended saves/navigation
let isSubmitting = false;

document.addEventListener('DOMContentLoaded', function () {
    console.log("Create Exercise frontend script loaded successfully.");

    // Task #69 & Task #72: Setup live casing normalization on specified text fields
    setupFieldCasingNormalization('exerciseTitle');
    setupFieldCasingNormalization('exerciseInstruction');
    setupFieldCasingNormalization('problemSituation');
    setupFieldCasingNormalization('problemQuestion');
    setupFieldCasingNormalization('problemClue');
    setupFieldCasingNormalization('correctFeedback');
    setupFieldCasingNormalization('incorrectFeedback');

    // Task #74 & Fix #2: Setup Exercise Title duplicate validation check
    setupExerciseTitleValidation();

    // Task #70 & Fix #1: Setup Category -> Module -> Lesson dependent dropdowns
    setupDependentDropdowns();

    // Task #73 & Fix #3: Setup Back / Cancel protective confirmation guard
    setupBackCancelGuard();

    // Task #76 & Fix #3: Setup Save Draft button handler
    setupSaveDraftHandler();

    // Task #111: Setup Unpublish button handler & confirmation modal
    setupUnpublishHandler();

    // Dynamic character counters setup with immediate count initialization (Fix #1)
    setupCharacterCounter('exerciseInstruction', 'instructionCount', 1000);
    setupCharacterCounter('problemSituation', 'situationCount', 500);
    setupCharacterCounter('problemQuestion', 'questionCount', 500);
    setupCharacterCounter('problemClue', 'clueCount', 500);
    setupCharacterCounter('expectedAnswer', 'expectedAnswerCount', 1000);
    setupCharacterCounter('correctFeedback', 'correctFeedbackCount', 500);

    // Initialize exactly ONE empty test case row IF container is currently empty
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

    // Form submit listener to set isSubmitting = true (Fix #3 & #4)
    const form = document.getElementById('createExerciseForm');
    if (form) {
        form.addEventListener('submit', function () {
            isSubmitting = true;
        });
    }
});

/* =================================================================
   Task #69 & Task #72: Live Text Fields Casing Normalization
==================================================================== */
function formatSentenceCaseLive(value) {
    if (!value) return value;
    const lower = value.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function setupFieldCasingNormalization(elementOrId) {
    const input = (typeof elementOrId === 'string')
        ? (document.getElementById(elementOrId) || document.querySelector(`[name="${elementOrId}"]`))
        : elementOrId;

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

function setupTitleCasingNormalization(inputId) {
    setupFieldCasingNormalization(inputId);
}

/* =================================================================
   Task #74 & Fix #2: Exercise Title Global Duplication Prevention
==================================================================== */
function setupExerciseTitleValidation() {
    const titleInput = document.getElementById('exerciseTitle');
    const titleError = document.getElementById('exerciseTitleError');
    const form = document.getElementById('createExerciseForm');

    if (!titleInput) return;

    let debounceTimer = null;
    let isTitleTaken = false;
    let isChecking = false;

    function showTitleError(message) {
        if (titleError) {
            titleError.textContent = message;
            titleError.style.display = 'block';
        }
        titleInput.style.borderColor = '#ef4444';
        isTitleTaken = true;
    }

    function clearTitleError() {
        if (titleError) {
            titleError.textContent = '';
            titleError.style.display = 'none';
        }
        titleInput.style.borderColor = '';
        isTitleTaken = false;
    }

    async function checkTitleAvailability() {
        const rawTitle = titleInput.value.trim();
        if (!rawTitle) {
            clearTitleError();
            return true;
        }

        const excludeId = titleInput.dataset.exerciseId || document.getElementById('exerciseIdInput')?.value || '';
        isChecking = true;

        try {
            const url = `/admin/coding-exercises/check-title?title=${encodeURIComponent(rawTitle)}&exclude_exercise_id=${encodeURIComponent(excludeId)}`;
            const response = await fetch(url, { credentials: 'include' });
            const data = await response.json();

            if (!data.available) {
                showTitleError(data.message || 'A coding exercise with this title already exists.');
                return false;
            } else {
                clearTitleError();
                return true;
            }
        } catch (err) {
            console.error('create-exercise: failed to check title availability:', err);
            return true; // Allow submission on network error or fail-safe
        } finally {
            isChecking = false;
        }
    }

    titleInput.addEventListener('input', function () {
        clearTitleError();
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            checkTitleAvailability();
        }, 300);
    });

    titleInput.addEventListener('blur', function () {
        if (debounceTimer) clearTimeout(debounceTimer);
        checkTitleAvailability();
    });

    if (form) {
        form.addEventListener('submit', async function (e) {
            if (isTitleTaken) {
                e.preventDefault();
                titleInput.focus();
                showTitleError('A coding exercise with this title already exists. Exercise titles must be unique across the entire system.');
                return false;
            }

            const isAvailable = await checkTitleAvailability();
            if (!isAvailable) {
                e.preventDefault();
                titleInput.focus();
                return false;
            }
        });
    }
}

/* =================================================================
   Task #76, #111 & Fix #3: Save / Save Draft Handler & Persistence Sync
==================================================================== */
function setupSaveDraftHandler() {
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    const form = document.getElementById('createExerciseForm');
    if (!saveDraftBtn || !form) return;

    saveDraftBtn.addEventListener('click', async function (e) {
        e.preventDefault();

        const isPublished = saveDraftBtn.dataset.isPublished === "true";
        const titleInput = document.getElementById('exerciseTitle');
        const lessonSelect = document.getElementById('exerciseLesson');
        const exerciseIdInput = document.getElementById('exerciseIdInput');

        if (!titleInput || !titleInput.value.trim()) {
            alert(`Please enter an Exercise Title before ${isPublished ? 'saving' : 'saving a draft'}.`);
            if (titleInput) titleInput.focus();
            return;
        }

        if (!lessonSelect || !lessonSelect.value) {
            alert(`Please select Category, Module, and Lesson before ${isPublished ? 'saving' : 'saving a draft'}.`);
            return;
        }

        const formData = new FormData(form);
        formData.append('action', isPublished ? 'save' : 'draft');
        formData.append('preserve_status', isPublished ? 'true' : 'false');

        const originalHtml = saveDraftBtn.innerHTML;

        try {
            saveDraftBtn.disabled = true;
            saveDraftBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

            const response = await fetch('/admin/coding-exercises/save-draft', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include'
            });

            const result = await response.json();
            if (result.success) {
                isSubmitting = true; // Suppress beforeunload warning
                if (result.exercise_id) {
                    if (exerciseIdInput) exerciseIdInput.value = result.exercise_id;
                    if (titleInput) titleInput.dataset.exerciseId = result.exercise_id;
                }
                window.location.href = result.redirect_url || '/admin/coding-exercises';
            } else {
                alert(result.message || (isPublished ? 'Failed to save coding exercise.' : 'Failed to save draft.'));
                saveDraftBtn.disabled = false;
                saveDraftBtn.innerHTML = originalHtml;
            }
        } catch (err) {
            console.error('Failed to save exercise:', err);
            alert('An unexpected error occurred while saving.');
            saveDraftBtn.disabled = false;
            saveDraftBtn.innerHTML = originalHtml;
        }
    });
}

/* =================================================================
   Task #111: Unpublish Exercise Handler & Confirmation Modal
==================================================================== */
function setupUnpublishHandler() {
    const unpublishBtn = document.getElementById('unpublishExerciseBtn');
    const exerciseIdInput = document.getElementById('exerciseIdInput');
    const confirmActionModal = document.getElementById('confirmActionModal');
    const confirmActionTitle = document.getElementById('confirmActionTitle');
    const confirmActionText = document.getElementById('confirmActionText');
    const confirmActionCancelBtn = document.getElementById('confirmActionCancelBtn');
    const confirmActionConfirmBtn = document.getElementById('confirmActionConfirmBtn');

    if (!unpublishBtn) return;

    function showConfirmModal(message, onConfirm, title) {
        if (!confirmActionModal) {
            if (window.confirm(message)) onConfirm();
            return;
        }
        if (confirmActionTitle) confirmActionTitle.textContent = title || "Unpublish Coding Exercise?";
        if (confirmActionText) confirmActionText.textContent = message;
        confirmActionModal.classList.remove('modal-hidden');
        confirmActionModal.style.display = 'flex';

        function cleanup() {
            confirmActionModal.classList.add('modal-hidden');
            confirmActionModal.style.display = 'none';
            if (confirmActionCancelBtn) confirmActionCancelBtn.removeEventListener('click', onCancel);
            if (confirmActionConfirmBtn) confirmActionConfirmBtn.removeEventListener('click', onOk);
            confirmActionModal.removeEventListener('click', onOverlay);
        }

        function onCancel() {
            cleanup();
        }

        function onOk() {
            cleanup();
            onConfirm();
        }

        function onOverlay(e) {
            if (e.target === confirmActionModal) cleanup();
        }

        if (confirmActionCancelBtn) confirmActionCancelBtn.addEventListener('click', onCancel);
        if (confirmActionConfirmBtn) confirmActionConfirmBtn.addEventListener('click', onOk);
        confirmActionModal.addEventListener('click', onOverlay);
    }

    unpublishBtn.addEventListener('click', function (e) {
        e.preventDefault();

        const exerciseId = unpublishBtn.dataset.exerciseId || (exerciseIdInput ? exerciseIdInput.value : '');
        if (!exerciseId) {
            alert('Could not find exercise ID to unpublish.');
            return;
        }

        showConfirmModal(
            'Are you sure you want to unpublish this coding exercise? It will be moved back to Draft and will no longer be visible to learners.',
            async function () {
                const originalHtml = unpublishBtn.innerHTML;
                unpublishBtn.disabled = true;
                unpublishBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Unpublishing...';

                try {
                    const response = await fetch(`/admin/coding-exercises/${exerciseId}/unpublish`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    });
                    const result = await response.json();
                    if (result.success) {
                        isSubmitting = true;
                        window.location.href = '/admin/coding-exercises';
                    } else {
                        alert(result.message || 'Failed to unpublish coding exercise.');
                        unpublishBtn.disabled = false;
                        unpublishBtn.innerHTML = originalHtml;
                    }
                } catch (err) {
                    console.error('Failed to unpublish exercise:', err);
                    alert('An unexpected error occurred while unpublishing the exercise.');
                    unpublishBtn.disabled = false;
                    unpublishBtn.innerHTML = originalHtml;
                }
            },
            'Unpublish Coding Exercise?'
        );
    });
}

/* =================================================================
   Task #73 & Fix #3: Back & Cancel Unsaved Changes Protective Guard
==================================================================== */
function hasPopulatedExerciseInputs() {
    const title = (document.getElementById('exerciseTitle')?.value || '').trim();
    const category = (document.getElementById('exerciseCategory')?.value || '').trim();
    const moduleVal = (document.getElementById('exerciseModule')?.value || '').trim();
    const lesson = (document.getElementById('exerciseLesson')?.value || '').trim();
    const points = (document.getElementById('exercisePoints')?.value || '').trim();
    const instruction = (document.getElementById('exerciseInstruction')?.value || '').trim();
    const situation = (document.getElementById('problemSituation')?.value || '').trim();
    const question = (document.getElementById('problemQuestion')?.value || '').trim();
    const clue = (document.getElementById('problemClue')?.value || '').trim();
    const expected = (document.getElementById('expectedAnswer')?.value || '').trim();
    const feedback = (document.getElementById('correctFeedback')?.value || '').trim();

    if (title || category || moduleVal || lesson || points || instruction || situation || question || clue || expected || feedback) {
        return true;
    }

    // Check test cases
    const testInputs = document.querySelectorAll('#testCasesContainer input');
    for (const input of testInputs) {
        if ((input.value || '').trim() !== '') {
            return true;
        }
    }

    return false;
}

function setupBackCancelGuard() {
    const backBtn = document.getElementById('backExerciseBtn') || document.querySelector('.btn-back-custom');
    const cancelBtn = document.getElementById('cancelExerciseBtn');
    const form = document.getElementById('createExerciseForm');
    const unsavedModal = document.getElementById('unsavedChangesModal');
    const stayBtn = document.getElementById('unsavedStayBtn');
    const leaveBtn = document.getElementById('unsavedLeaveBtn');
    const saveAndLeaveBtn = document.getElementById('unsavedSaveAndLeaveBtn');

    let pendingNavigation = null;

    if (form) {
        form.addEventListener('submit', function () {
            isSubmitting = true;
        });
    }

    function showUnsavedWarning(targetUrl, e) {
        if (!hasPopulatedExerciseInputs()) {
            return true;
        }

        if (e) e.preventDefault();
        pendingNavigation = targetUrl;

        if (unsavedModal) {
            unsavedModal.classList.remove('modal-hidden');
        } else {
            const confirmed = window.confirm("You have unsaved changes in this coding exercise. Are you sure you want to leave without saving?");
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

    if (cancelBtn) {
        cancelBtn.addEventListener('click', function (e) {
            showUnsavedWarning(cancelBtn.href, e);
        });
    }

    // Also guard sidebar link navigation while form is dirty
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
            const titleInput = document.getElementById('exerciseTitle');
            const lessonSelect = document.getElementById('exerciseLesson');
            const saveDraftBtn = document.getElementById('saveDraftBtn');
            const isPublished = saveDraftBtn ? saveDraftBtn.dataset.isPublished === "true" : false;

            if (!titleInput || !titleInput.value.trim() || !lessonSelect || !lessonSelect.value) {
                alert(`Please enter an Exercise Title and Lesson before ${isPublished ? 'saving' : 'saving a draft'}.`);
                return;
            }

            if (!form) {
                isSubmitting = true;
                hideUnsavedModal();
                window.location.href = '/admin/coding-exercises';
                return;
            }

            const formData = new FormData(form);
            formData.append('action', isPublished ? 'save' : 'draft');
            formData.append('preserve_status', isPublished ? 'true' : 'false');

            try {
                const response = await fetch('/admin/coding-exercises/save-draft', {
                    method: 'POST',
                    body: formData,
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    credentials: 'include'
                });
                const result = await response.json();
                if (result.success) {
                    isSubmitting = true;
                    hideUnsavedModal();
                    window.location.href = result.redirect_url || '/admin/coding-exercises';
                } else {
                    alert(result.message || (isPublished ? 'Failed to save.' : 'Failed to save draft.'));
                }
            } catch (err) {
                console.error('Failed to save & leave:', err);
                isSubmitting = true;
                hideUnsavedModal();
                window.location.href = '/admin/coding-exercises';
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
                return `<option value="${escapeHtml(lesson.resource_id)}" ${isSelected ? 'selected' : ''}>${escapeHtml(lesson.resource_title)}</option>`;
            }).join("");

            lessonSelect.innerHTML = LESSON_PLACEHOLDER_HTML + optionsHtml;
            lessonSelect.disabled = false;

            if (preselectResourceId && lessonSelect.querySelector(`option[value="${preselectResourceId}"]`)) {
                lessonSelect.value = String(preselectResourceId);
            }
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

/* =================================================================
   Fix #1: Character Counter with Immediate Value Synchronization
==================================================================== */
function setupCharacterCounter(textareaId, counterId, maxLength) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    
    let counter = document.getElementById(counterId);
    if (!counter) {
        counter = textarea.parentElement.querySelector('.char-counter');
    }

    if (textarea && counter) {
        const updateCount = () => {
            const currentLength = textarea.value.length;
            counter.textContent = `${currentLength} / ${maxLength}`;
            if (currentLength >= maxLength) {
                counter.style.color = '#ef4444';
            } else {
                counter.style.color = '#94a3b8';
            }
        };

        // Initialize immediately with current/loaded value
        updateCount();
        textarea.addEventListener('input', updateCount);
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

function isTestCaseRowPopulated(row) {
    if (!row) return false;
    const inputField = row.querySelector('input[name*="[input]"]');
    const outputField = row.querySelector('input[name*="[output]"]');

    const inputVal = inputField ? inputField.value.trim() : '';
    const outputVal = outputField ? outputField.value.trim() : '';

    return (inputVal !== '' || outputVal !== '');
}

function removeTestCaseRow(btn) {
    const row = btn.closest('.test-case-row');
    const container = document.getElementById('testCasesContainer');

    if (!row || !container) return;

    if (container.querySelectorAll('.test-case-row').length <= 1) {
        alert('You must have at least one test case.');
        return;
    }

    // Task #75: Prompt confirmation only if test case row contains populated values
    if (isTestCaseRowPopulated(row)) {
        const confirmed = window.confirm(
            'This test case contains input values. Are you sure you want to delete it? Entered values will be lost.'
        );
        if (!confirmed) {
            return;
        }
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
