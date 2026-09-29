/**
 * create-learning-activity-draft-guard.js - Task #56, #83, #84, #102
 * --------------------------------------------------------------------
 * Handles:
 *   - Form validation with red field borders (.field-error), zero
 *     inline layout distortion, popup alerts, and real-time error
 *     clearing upon typing/selection.
 *   - Unsaved changes detection and exit confirmations.
 *   - Save Draft & Publish workflows with confirmation modals.
 *   - Success feedback uses floating toasts (changes-saved-toast),
 *     auto-dismissed after 2s.
 *   - feat/publishing-tree: every question / option / item is sent back
 *     with its database id (card data-item-id, option row
 *     data-option-id - set by create-learning-activity.js) so the server
 *     updates rows in place and learners' answers stay attached. Save
 *     never changes the status; "Mark Ready" = save + Ready to Publish
 *     (both over JSON, so the ids are kept). Move to Draft / Unpublish
 *     are handled by admin-editor-status.js.
 */
(function () {
    "use strict";

    const TOAST_DURATION_MS = 2000;

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    // --------------------------------------------------------
    // Success toast (matches changes-saved-toast)
    // --------------------------------------------------------
    let successToastTimeout = null;

    function showSuccessToast(message) {
        let toast = document.getElementById("changesSavedToast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "changesSavedToast";
            toast.className = "changes-saved-toast";
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${escapeHtml(message)}</span>`;
        toast.classList.add("show");

        if (successToastTimeout) clearTimeout(successToastTimeout);
        successToastTimeout = setTimeout(() => {
            toast.classList.remove("show");
        }, TOAST_DURATION_MS);
    }

    // --------------------------------------------------------
    // Error popup alerts (zero inline layout shifting)
    // --------------------------------------------------------
    let popupAlertTimeout = null;

    function showPopupAlert(message, type = "error") {
        if (type === "success") {
            showSuccessToast(message);
            return;
        }

        let popup = document.getElementById("resourcePopupAlert");
        if (!popup) {
            popup = document.createElement("div");
            popup.id = "resourcePopupAlert";
            document.body.appendChild(popup);
        }
        popup.className = "resource-popup-alert error";
        popup.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span>${escapeHtml(message)}</span>`;
        popup.classList.add("show");

        if (popupAlertTimeout) clearTimeout(popupAlertTimeout);
        popupAlertTimeout = setTimeout(() => {
            hidePopupAlert();
        }, TOAST_DURATION_MS);
    }

    function hidePopupAlert() {
        const popup = document.getElementById("resourcePopupAlert");
        if (popup) popup.classList.remove("show");
        if (popupAlertTimeout) {
            clearTimeout(popupAlertTimeout);
            popupAlertTimeout = null;
        }
    }

    window.cobraByteShowActivityPopupAlert = showPopupAlert;
    window.cobraByteHideActivityPopupAlert = hidePopupAlert;

    document.addEventListener("DOMContentLoaded", () => {
        const form = document.getElementById("createActivityForm");
        if (!form) return; // not on this page

        const activityTitleInput = document.getElementById("activityTitle");
        const courseSelect = document.getElementById("courseSelect");
        const moduleSelect = document.getElementById("moduleSelect");
        const lessonSelect = document.getElementById("lessonSelect");
        const activityTypeSelect = document.getElementById("activityType");
        const pointsInput = document.getElementById("activityPoints");
        const activityIdInput = document.getElementById("activityIdInput");
        const saveDraftBtn = document.getElementById("saveDraftBtn");

        const unsavedModal = document.getElementById("unsavedChangesModal");
        const stayBtn = document.getElementById("unsavedStayBtn");
        const leaveBtn = document.getElementById("unsavedLeaveBtn");
        const saveAndLeaveBtn = document.getElementById("unsavedSaveAndLeaveBtn");
        const unsavedSaveError = document.getElementById("unsavedSaveError");

        // Shared Save Draft / Publish confirmation modal
        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");

        let isDirty = false;
        let isSubmitting = false;
        let pendingNavigation = null;
        let pendingConfirmAction = null;
        let pendingConfirmCancelAction = null;
        let publishConfirmed = false;

        // Flash message handling
        (function consumeFlashMessages() {
            const container = document.querySelector(".activity-flash-messages");
            if (!container) return;
            container.querySelectorAll(".flash-message").forEach((el) => {
                const text = (el.textContent || "").trim();
                if (!text) return;
                const isError = el.classList.contains("flash-error");
                showPopupAlert(text, isError ? "error" : "success");
            });
            container.remove();
        })();

        // --------------------------------------------------------
        // Task #56: Section 2 collectors - read the CURRENT DOM state
        // of whichever builder is active (Multiple Choice / Fill in the
        // Blanks / Flashcards) into the exact shape
        // learning_activity_content.py expects. Reused by both the
        // header "Save Draft" button and "Save Draft & Leave".
        // --------------------------------------------------------
        function collectMultipleChoiceQuestions() {
            const cards = document.querySelectorAll("#questionsContainer .question-card");
            const questions = [];
            cards.forEach((card) => {
                const textarea = card.querySelector(".question-textarea");
                const text = textarea ? textarea.value.trim() : "";

                const options = [];
                let correctOption = null;
                card.querySelectorAll(".answer-row").forEach((row, idx) => {
                    const textInput = row.querySelector('input[type="text"]:nth-of-type(1)');
                    const feedbackInput = row.querySelector('input[type="text"]:nth-of-type(2)');
                    const radio = row.querySelector('input[type="radio"]');
                    if (radio && radio.checked) correctOption = idx;
                    options.push({
                        option_id: row.dataset.optionId || null,
                        text: textInput ? textInput.value.trim() : "",
                        feedback: feedbackInput ? feedbackInput.value.trim() : "",
                    });
                });

                questions.push({ q_id: card.dataset.itemId || null, text: text, options: options, correct_option: correctOption });
            });
            return questions;
        }

        function collectFillBlanks() {
            const cards = document.querySelectorAll("#fillBlanksContainer .fill-blank-card");
            const items = [];
            cards.forEach((card) => {
                const textarea = card.querySelector("textarea");
                const inputs = card.querySelectorAll('input[type="text"]');
                items.push({
                    fib_id: card.dataset.itemId || null,
                    content: textarea ? textarea.value.trim() : "",
                    correct_answer: inputs[0] ? inputs[0].value.trim() : "",
                    correct_feedback: inputs[1] ? inputs[1].value.trim() : "",
                    incorrect_feedback: inputs[2] ? inputs[2].value.trim() : "",
                });
            });
            return items;
        }

        function collectFlashcards() {
            const cards = document.querySelectorAll("#flashcardsContainer .flashcard-card");
            const items = [];
            cards.forEach((card) => {
                const textareas = card.querySelectorAll("textarea");
                const inputs = card.querySelectorAll('input[type="text"]');
                items.push({
                    flashcard_id: card.dataset.itemId || null,
                    front: textareas[0] ? textareas[0].value.trim() : "",
                    back: textareas[1] ? textareas[1].value.trim() : "",
                    correct_feedback: inputs[0] ? inputs[0].value.trim() : "",
                    incorrect_feedback: inputs[1] ? inputs[1].value.trim() : "",
                });
            });
            return items;
        }

        // --------------------------------------------------------
        // Dirty-state tracking
        // --------------------------------------------------------
        function markDirty() {
            isDirty = true;
        }

        // --------------------------------------------------------
        // Real-time error clearing
        // --------------------------------------------------------
        function clearFieldError(el) {
            if (!el) return;
            el.classList.remove("field-error");
            hidePopupAlert();
        }

        [activityTitleInput, courseSelect, moduleSelect, lessonSelect, activityTypeSelect].forEach((el) => {
            if (!el) return;
            el.addEventListener("input", () => {
                markDirty();
                clearFieldError(el);
            });
            el.addEventListener("change", () => {
                markDirty();
                clearFieldError(el);
            });
        });

        document.addEventListener("input", (e) => {
            if (e.target && e.target.classList.contains("field-error")) {
                clearFieldError(e.target);
            }
        });
        document.addEventListener("change", (e) => {
            if (e.target && e.target.classList.contains("field-error")) {
                clearFieldError(e.target);
            }
        });

        // --------------------------------------------------------
        // Task #102: Form Validation with Red Border Highlighting
        // --------------------------------------------------------
        function validateActivityForm(isPublish = false) {
            let isValid = true;
            let firstErrorMsg = "";
            let firstErrorField = null;

            // 1. Activity Title
            const titleVal = activityTitleInput ? activityTitleInput.value.trim() : "";
            if (!titleVal) {
                isValid = false;
                if (activityTitleInput) activityTitleInput.classList.add("field-error");
                if (!firstErrorMsg) {
                    firstErrorMsg = isPublish
                        ? "Please enter an activity title before publishing."
                        : "Please enter an activity title before saving a draft.";
                    firstErrorField = activityTitleInput;
                }
            } else {
                if (activityTitleInput) activityTitleInput.classList.remove("field-error");
            }

            // 2. Category
            const catVal = courseSelect ? courseSelect.value : "";
            if (!catVal) {
                isValid = false;
                if (courseSelect) courseSelect.classList.add("field-error");
                if (!firstErrorMsg) {
                    firstErrorMsg = isPublish
                        ? "Please select a category before publishing."
                        : "Please select a category before saving a draft.";
                    firstErrorField = courseSelect;
                }
            } else {
                if (courseSelect) courseSelect.classList.remove("field-error");
            }

            // 3. Module
            const modVal = moduleSelect ? moduleSelect.value : "";
            if (!modVal) {
                isValid = false;
                if (moduleSelect) moduleSelect.classList.add("field-error");
                if (!firstErrorMsg) {
                    firstErrorMsg = isPublish
                        ? "Please select a module before publishing."
                        : "Please select a module before saving a draft.";
                    firstErrorField = moduleSelect;
                }
            } else {
                if (moduleSelect) moduleSelect.classList.remove("field-error");
            }

            // 4. Lesson
            const lessonVal = lessonSelect ? lessonSelect.value : "";
            if (!lessonVal) {
                isValid = false;
                if (lessonSelect) lessonSelect.classList.add("field-error");
                if (!firstErrorMsg) {
                    firstErrorMsg = isPublish
                        ? "Please select a lesson before publishing."
                        : "Please select a lesson before saving a draft.";
                    firstErrorField = lessonSelect;
                }
            } else {
                if (lessonSelect) lessonSelect.classList.remove("field-error");
            }

            // 5. Activity Type
            const typeVal = activityTypeSelect ? activityTypeSelect.value : "";
            if (!typeVal) {
                isValid = false;
                if (activityTypeSelect) activityTypeSelect.classList.add("field-error");
                if (!firstErrorMsg) {
                    firstErrorMsg = isPublish
                        ? "Please select an activity type before publishing."
                        : "Please select an activity type before saving a draft.";
                    firstErrorField = activityTypeSelect;
                }
            } else {
                if (activityTypeSelect) activityTypeSelect.classList.remove("field-error");
            }

            // 6. Section 2 Content Validation (MCQ duplicate options & answer/feedback match)
            const selectedType = activityTypeSelect ? activityTypeSelect.value : "Multiple Choice";
            if (selectedType === "Multiple Choice" || selectedType === "Quiz") {
                const cards = document.querySelectorAll("#questionsContainer .question-card");
                if (isPublish && (!cards || cards.length === 0)) {
                    isValid = false;
                    if (!firstErrorMsg) {
                        firstErrorMsg = "Please add at least one question before publishing.";
                        firstErrorField = document.getElementById("addQuestionMainBtn");
                    }
                } else if (cards && cards.length > 0) {
                    cards.forEach((card, cIdx) => {
                        const textarea = card.querySelector(".question-textarea");
                        if (isPublish && textarea && !textarea.value.trim()) {
                            isValid = false;
                            textarea.classList.add("field-error");
                            if (!firstErrorMsg) {
                                firstErrorMsg = `Question #${cIdx + 1} text is required.`;
                                firstErrorField = textarea;
                            }
                        }

                        const rows = card.querySelectorAll(".answer-row");
                        const seenAnswers = new Map();

                        rows.forEach((row, rIdx) => {
                            const textInput = row.querySelector('input[type="text"]:nth-of-type(1)');
                            const feedbackInput = row.querySelector('input[type="text"]:nth-of-type(2)');
                            const optText = textInput ? textInput.value.trim() : "";
                            const fbText = feedbackInput ? feedbackInput.value.trim() : "";
                            const letter = String.fromCharCode(65 + rIdx);

                            if (isPublish && textInput && !optText) {
                                isValid = false;
                                textInput.classList.add("field-error");
                                if (!firstErrorMsg) {
                                    firstErrorMsg = `Answer option in Question #${cIdx + 1} is required.`;
                                    firstErrorField = textInput;
                                }
                            }
                            if (isPublish && feedbackInput && !fbText) {
                                isValid = false;
                                feedbackInput.classList.add("field-error");
                                if (!firstErrorMsg) {
                                    firstErrorMsg = `Feedback in Question #${cIdx + 1} is required.`;
                                    firstErrorField = feedbackInput;
                                }
                            }

                            // Task #103: Duplicate answer check within the same question
                            if (optText) {
                                const lowerOpt = optText.toLowerCase();
                                if (!seenAnswers.has(lowerOpt)) {
                                    seenAnswers.set(lowerOpt, []);
                                }
                                seenAnswers.get(lowerOpt).push(textInput);
                            }

                            // Task #103: Answer vs Feedback cannot be identical
                            if (optText && fbText && optText.toLowerCase() === fbText.toLowerCase()) {
                                isValid = false;
                                if (textInput) textInput.classList.add("field-error");
                                if (feedbackInput) feedbackInput.classList.add("field-error");
                                if (!firstErrorMsg) {
                                    firstErrorMsg = `Answer and Feedback for Learner cannot be identical in Question #${cIdx + 1} (Option ${letter}).`;
                                    firstErrorField = feedbackInput;
                                }
                            }
                        });

                        // Highlight duplicate answer options
                        for (const [ansKey, inputs] of seenAnswers.entries()) {
                            if (inputs.length > 1) {
                                isValid = false;
                                inputs.forEach((inp) => inp.classList.add("field-error"));
                                if (!firstErrorMsg) {
                                    firstErrorMsg = `Duplicate answer option "${inputs[0].value.trim()}" found in Question #${cIdx + 1}. Each option must have a unique answer.`;
                                    firstErrorField = inputs[1] || inputs[0];
                                }
                            }
                        }

                        // Check correct radio option when publishing
                        if (isPublish && rows.length > 0) {
                            const checkedRadio = card.querySelector('input[type="radio"]:checked');
                            if (!checkedRadio) {
                                isValid = false;
                                if (!firstErrorMsg) {
                                    firstErrorMsg = `Please select the correct answer for Question #${cIdx + 1}.`;
                                    firstErrorField = card.querySelector('input[type="radio"]');
                                }
                            }
                        }
                    });
                }
            } else if (isPublish && selectedType === "Fill in the Blanks") {
                const cards = document.querySelectorAll("#fillBlanksContainer .fill-blank-card");
                if (!cards || cards.length === 0) {
                    isValid = false;
                    if (!firstErrorMsg) {
                        firstErrorMsg = "Please add at least one sentence before publishing.";
                        firstErrorField = document.getElementById("addFillBlankMainBtn");
                    }
                }
            } else if (isPublish && selectedType === "Flashcards") {
                const cards = document.querySelectorAll("#flashcardsContainer .flashcard-card");
                if (!cards || cards.length === 0) {
                    isValid = false;
                    if (!firstErrorMsg) {
                        firstErrorMsg = "Please add at least one flashcard before publishing.";
                        firstErrorField = document.getElementById("addFlashcardMainBtn");
                    }
                }
            }

            if (!isValid) {
                showInfoModal(firstErrorMsg, "Required Field Missing", () => {
                    if (firstErrorField && typeof firstErrorField.focus === "function") {
                        firstErrorField.focus();
                    }
                });
            }

            return isValid;
        }

        // --------------------------------------------------------
        // Dirty-state tracking
        // --------------------------------------------------------
        function markDirty() {
            isDirty = true;
        }

        [activityTitleInput, courseSelect, moduleSelect, lessonSelect, activityTypeSelect, pointsInput].forEach((el) => {
            if (!el) return;
            el.addEventListener("input", markDirty);
            el.addEventListener("change", markDirty);
        });

        form.addEventListener("input", (e) => {
            if (e.target === activityTitleInput || e.target === pointsInput) return;
            markDirty();
        });
        form.addEventListener("change", (e) => {
            if (e.target === courseSelect || e.target === moduleSelect ||
                e.target === lessonSelect || e.target === activityTypeSelect) return;
            markDirty();
        });

        function clearDirty() {
            isDirty = false;
        }

        // Native warning for tab close / refresh / typed URL navigation.
        window.addEventListener("beforeunload", (e) => {
            if (!isDirty || isSubmitting) return;
            e.preventDefault();
            e.returnValue = "";
        });

        // --------------------------------------------------------
        // Custom modal
        // --------------------------------------------------------
        function showUnsavedSaveError(message) {
            if (!unsavedSaveError) {
                if (message) showPopupAlert(message, "error");
                return;
            }
            unsavedSaveError.textContent = message;
            unsavedSaveError.classList.remove("modal-hidden");
        }

        function clearUnsavedSaveError() {
            if (!unsavedSaveError) return;
            unsavedSaveError.textContent = "";
            unsavedSaveError.classList.add("modal-hidden");
        }

        function openUnsavedModal(navigateAction) {
            pendingNavigation = navigateAction;
            clearUnsavedSaveError();
            if (unsavedModal) unsavedModal.style.display = "flex";
        }

        function closeUnsavedModal() {
            if (unsavedModal) unsavedModal.style.display = "none";
            pendingNavigation = null;
            clearUnsavedSaveError();
        }

        if (stayBtn) stayBtn.addEventListener("click", closeUnsavedModal);

        // --------------------------------------------------------
        // --------------------------------------------------------
        // Task #115: Custom Info Alert Modal (Reuses #confirmActionModal)
        // --------------------------------------------------------
        function showInfoModal(message, title = "Required Field Missing", onOk = null) {
            if (!confirmActionModal) {
                alert(message);
                if (typeof onOk === "function") onOk();
                return;
            }

            if (confirmActionTitle) confirmActionTitle.textContent = title;
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "none";
            if (confirmActionConfirmBtn) {
                confirmActionConfirmBtn.textContent = "OK";
                confirmActionConfirmBtn.className = "modal-btn-save";
            }

            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";

            function cleanup() {
                confirmActionModal.classList.add("modal-hidden");
                confirmActionModal.style.display = "none";
                if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
                if (confirmActionConfirmBtn) {
                    confirmActionConfirmBtn.removeEventListener("click", handleOk);
                    confirmActionConfirmBtn.textContent = "Confirm";
                }
                confirmActionModal.removeEventListener("click", handleOverlay);
                document.removeEventListener("keydown", handleKeydown);
            }

            function handleOk() {
                cleanup();
                if (typeof onOk === "function") onOk();
            }

            function handleOverlay(e) {
                if (e.target === confirmActionModal) {
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

            if (confirmActionConfirmBtn) confirmActionConfirmBtn.addEventListener("click", handleOk);
            confirmActionModal.addEventListener("click", handleOverlay);
            document.addEventListener("keydown", handleKeydown);
        }

        window.cobraByteShowActivityInfoModal = showInfoModal;

        // --------------------------------------------------------
        // Save Draft / Publish confirmation modal
        // --------------------------------------------------------
        function showConfirmModal(message, onConfirm, onCancel, title) {
            if (typeof onCancel === "string" && typeof title === "undefined") {
                title = onCancel;
                onCancel = null;
            }
            if (!confirmActionModal) {
                if (window.confirm(message)) {
                    if (typeof onConfirm === "function") onConfirm();
                } else {
                    if (typeof onCancel === "function") onCancel();
                }
                return;
            }
            pendingConfirmAction = onConfirm;
            pendingConfirmCancelAction = onCancel;
            if (confirmActionTitle) confirmActionTitle.textContent = title || "Confirm Action";
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
            if (confirmActionConfirmBtn) {
                confirmActionConfirmBtn.textContent = "Confirm";
                confirmActionConfirmBtn.className = "modal-btn-save";
            }
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        function closeConfirmModal() {
            if (confirmActionModal) confirmActionModal.style.display = "none";
            pendingConfirmAction = null;
            pendingConfirmCancelAction = null;
        }

        if (confirmActionCancelBtn) {
            confirmActionCancelBtn.addEventListener("click", () => {
                const cancelAction = pendingConfirmCancelAction;
                closeConfirmModal();
                if (typeof cancelAction === "function") cancelAction();
            });
        }
        if (confirmActionConfirmBtn) {
            confirmActionConfirmBtn.addEventListener("click", () => {
                const action = pendingConfirmAction;
                closeConfirmModal();
                if (typeof action === "function") action();
            });
        }
        if (confirmActionModal) {
            confirmActionModal.addEventListener("click", (e) => {
                if (e.target === confirmActionModal) {
                    const cancelAction = pendingConfirmCancelAction;
                    closeConfirmModal();
                    if (typeof cancelAction === "function") cancelAction();
                }
            });
        }

        if (leaveBtn) {
            leaveBtn.addEventListener("click", () => {
                const action = pendingNavigation;
                clearDirty();
                closeUnsavedModal();
                if (typeof action === "function") action();
            });
        }

        if (saveAndLeaveBtn) {
            saveAndLeaveBtn.addEventListener("click", async () => {
                if (!validateActivityForm(false)) {
                    showUnsavedSaveError("Please fill in all required activity information fields before saving.");
                    return;
                }

                saveAndLeaveBtn.disabled = true;
                if (stayBtn) stayBtn.disabled = true;
                if (leaveBtn) leaveBtn.disabled = true;

                const redirectUrl = typeof pendingNavigation === "string" ? pendingNavigation : null;
                const fallbackAction = typeof pendingNavigation === "function" ? pendingNavigation : null;

                const ok = await performSaveDraft();

                saveAndLeaveBtn.disabled = false;
                if (stayBtn) stayBtn.disabled = false;
                if (leaveBtn) leaveBtn.disabled = false;

                if (!ok) {
                    showUnsavedSaveError("Could not save this draft. Please check the form and try again.");
                    return;
                }

                closeUnsavedModal();

                if (redirectUrl) {
                    window.location.href = redirectUrl;
                } else if (fallbackAction) {
                    fallbackAction();
                }
            });
        }

        // --------------------------------------------------------
        // Save Draft (POST /admin/create-learning-activity/save-draft)
        // --------------------------------------------------------
        async function performSaveDraft() {
            if (!validateActivityForm(false)) {
                return false;
            }

            const originalHtml = saveDraftBtn ? saveDraftBtn.innerHTML : "";
            if (saveDraftBtn) {
                saveDraftBtn.disabled = true;
                saveDraftBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            }

            const selectedType = activityTypeSelect.value;

            try {
                const response = await fetch("/admin/create-learning-activity/save-draft", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        activity_id: activityIdInput ? (activityIdInput.value || null) : null,
                        activity_title: activityTitleInput.value.trim(),
                        category_id: courseSelect.value,
                        module_id: moduleSelect.value,
                        lesson_id: lessonSelect.value,
                        activity_type: selectedType,
                        questions: (selectedType === "Multiple Choice" || selectedType === "Quiz") ? collectMultipleChoiceQuestions() : [],
                        fill_blanks: selectedType === "Fill in the Blanks" ? collectFillBlanks() : [],
                        flashcards: selectedType === "Flashcards" ? collectFlashcards() : [],
                    }),
                });
                const result = await response.json();

                if (!result.success) {
                    showPopupAlert(result.message || "Could not save draft.", "error");
                    return false;
                }

                if (activityIdInput && result.activity_id) {
                    activityIdInput.value = result.activity_id;
                }
                if (pointsInput && typeof result.points !== "undefined" && result.points !== null) {
                    pointsInput.value = result.points;
                }
                clearDirty();
                showSuccessToast(result.message || "Activity saved successfully.");
                return true;
            } catch (err) {
                showPopupAlert("Could not reach the server. Please try again.", "error");
                return false;
            } finally {
                if (saveDraftBtn) {
                    saveDraftBtn.disabled = false;
                    saveDraftBtn.innerHTML = originalHtml;
                }
            }
        }

        // Confirm before saving draft
        if (saveDraftBtn) {
            saveDraftBtn.addEventListener("click", (e) => {
                e.preventDefault();
                if (!validateActivityForm(false)) return;

                const isPublished = saveDraftBtn.dataset.status === "Published";
                showConfirmModal(
                    isPublished
                        ? "Save your changes? This activity is live, so learners will see them right away."
                        : "Save your changes to this activity?",
                    async () => {
                        const ok = await performSaveDraft();
                        // feat/publishing-tree: opened from the Publishing page -> go back there.
                        const back = window.cobraEditorReturnUrl ? window.cobraEditorReturnUrl("") : "";
                        if (ok && back) {
                            isSubmitting = true;
                            setTimeout(() => { window.location.href = back; }, TOAST_DURATION_MS);
                        }
                    },
                    "Save Changes?"
                );
            });
        }

        // Intercept in-app link navigation
        document.querySelectorAll('a[href]:not([href="#"])').forEach((link) => {
            if (link.id === "adminLogoutBtn") return;
            if (link.dataset.disabled === "true") return;

            link.addEventListener("click", (e) => {
                if (!isDirty) return;
                e.preventDefault();
                const href = link.getAttribute("href");
                openUnsavedModal(() => { window.location.href = href; });
            });
        });

        // --------------------------------------------------------
        // Publish submit handling
        // --------------------------------------------------------
        // feat/publishing-tree: "Mark Ready" = JSON save (keeps every
        // question/item id) + POST .../mark-ready. The old multipart form
        // post (create_activity_submit) is only a no-JavaScript fallback.
        async function performMarkReady() {
            const publishBtn = document.getElementById("publishActivityBtn");
            const originalHtml = publishBtn ? publishBtn.innerHTML : "";
            if (publishBtn) {
                publishBtn.disabled = true;
                publishBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            }
            try {
                const saved = await performSaveDraft();
                if (!saved) return;
                const activityId = activityIdInput ? activityIdInput.value : "";
                const result = await window.cobraEditorStatusAction("activity", activityId, "mark-ready");
                if (!result.success) {
                    showPopupAlert(`Activity saved, but could not mark it ready: ${result.message || "unknown error"}`, "error");
                    return;
                }
                isSubmitting = true;
                clearDirty();
                showSuccessToast("Activity saved and marked as Ready to Publish.");
                setTimeout(() => {
                    window.location.href = window.cobraEditorReturnUrlForTab("/admin/learning-activities", "ready");
                }, TOAST_DURATION_MS);
            } catch (err) {
                showPopupAlert("Could not reach the server. Please try again.", "error");
            } finally {
                if (publishBtn && !isSubmitting) {
                    publishBtn.disabled = false;
                    publishBtn.innerHTML = originalHtml;
                }
            }
        }

        form.addEventListener("submit", function (e) {
            e.preventDefault();
            if (!validateActivityForm(true)) return;

            // No shared helper (script missing) -> fall back to the plain form post.
            if (typeof window.cobraEditorStatusAction !== "function") {
                isSubmitting = true;
                clearDirty();
                form.submit();
                return;
            }

            showConfirmModal(
                "Save this activity and mark it Ready to Publish? It goes live when it's published on the Publishing page.",
                () => { performMarkReady(); },
                "Mark Ready?"
            );
        });
    });
})();
