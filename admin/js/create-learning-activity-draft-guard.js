/**
 * create-learning-activity-draft-guard.js - Unsaved Changes Protection
 * & Navigation Alert for Create Learning Activity
 * --------------------------------------------------------------------
 * Watches Activity Title / Category / Module / Lesson / Activity Type /
 * Points AND every dynamically-added question / fill-blank / flashcard
 * field (Section 2) for changes, and:
 *   - Shows a native browser warning (beforeunload) on tab close,
 *     refresh, or a typed/bookmarked URL navigation while there are
 *     unsaved changes.
 *   - Intercepts in-app link clicks (sidebar nav, the header "Back"
 *     link, etc.) and shows a custom modal instead of navigating
 *     immediately, offering "Stay", "Leave Without Saving", or
 *     "Save Draft & Leave".
 *   - Wires the "Save Draft" button to POST the current Activity
 *     Information fields AND the current Section 2 content (Task #56)
 *     to /admin/create-learning-activity/save-draft (see
 *     admin_routes.py -> learning_activity_draft.py ->
 *     learning_activity_content.py), storing the returned activity_id
 *     in a hidden field so every later save updates the SAME row
 *     instead of creating duplicates, and syncing the read-only Points
 *     field from the server's own computed value (never trusting the
 *     client's own running count as the value that gets saved).
 *   - Clears the unsaved-changes flag the moment a draft save OR the
 *     real Publish submission succeeds.
 *
 * Mirrors upload-resource-draft-guard.js's pattern exactly (Task #44),
 * for workflow parity between the two content-creation pages.
 *
 * Only present on pages that have #createActivityForm (currently just
 * create-learning-activity.html), so this is safe to include as a
 * shared script without guard checks elsewhere.
 */
(function () {
    "use strict";

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

        // Shared Save Draft / Publish confirmation modal (see
        // confirm-action-modal.html) - same generic Yes/No modal
        // upload-resource.html already uses.
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
                        text: textInput ? textInput.value.trim() : "",
                        feedback: feedbackInput ? feedbackInput.value.trim() : "",
                    });
                });

                questions.push({ text: text, options: options, correct_option: correctOption });
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

        [activityTitleInput, courseSelect, moduleSelect, lessonSelect, activityTypeSelect, pointsInput].forEach((el) => {
            if (!el) return;
            el.addEventListener("input", markDirty);
            el.addEventListener("change", markDirty);
        });

        // Section 2's question/fill-blank/flashcard cards are added
        // dynamically (create-learning-activity.js) - event delegation
        // on the whole form catches typing/changes inside any of them
        // (including ones added after this listener was attached)
        // without needing to re-bind per card.
        form.addEventListener("input", (e) => {
            if (e.target === activityTitleInput || e.target === pointsInput) return; // already handled above
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
                if (message) alert(message);
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
                if (action) action();
            });
        }

        if (saveAndLeaveBtn) {
            saveAndLeaveBtn.addEventListener("click", async () => {
                clearUnsavedSaveError();

                const fallbackAction = pendingNavigation;
                const redirectUrl = saveAndLeaveBtn.dataset.redirectUrl || "";

                saveAndLeaveBtn.disabled = true;
                if (stayBtn) stayBtn.disabled = true;
                if (leaveBtn) leaveBtn.disabled = true;

                const ok = await performSaveDraft();

                saveAndLeaveBtn.disabled = false;
                if (stayBtn) stayBtn.disabled = false;
                if (leaveBtn) leaveBtn.disabled = false;

                if (!ok) {
                    const notice = document.querySelector(".top-bar-validation-row .js-draft-notice");
                    const message = (notice && notice.textContent)
                        ? notice.textContent
                        : "Could not save this draft. Please check the form and try again.";
                    showUnsavedSaveError(message);
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
        // Draft save notice - renders beside the Save Draft button's
        // row if a .top-bar-validation-row element exists on this page;
        // otherwise falls back to alert() for errors only.
        // --------------------------------------------------------
        function showDraftNotice(message, isError) {
            const anchor = document.querySelector(".top-bar-validation-row");
            if (!anchor) { if (isError) alert(message); return; }
            let notice = anchor.querySelector(".js-draft-notice");
            if (!notice) {
                notice = document.createElement("span");
                notice.className = "js-draft-notice top-bar-inline-message";
                anchor.appendChild(notice);
            }
            notice.textContent = message;
            notice.style.display = "inline";
            notice.style.color = isError ? "#e02424" : "#09B300";
        }

        // --------------------------------------------------------
        // Save Draft (POST /admin/create-learning-activity/save-draft)
        // --------------------------------------------------------
        async function performSaveDraft() {
            if (!activityTitleInput || !activityTitleInput.value.trim()) {
                showDraftNotice("Please enter an activity title before saving a draft.", true);
                if (activityTitleInput) activityTitleInput.focus();
                return false;
            }
            if (!courseSelect || !courseSelect.value) {
                showDraftNotice("Please select a category before saving a draft.", true);
                return false;
            }
            if (!moduleSelect || !moduleSelect.value) {
                showDraftNotice("Please select a module before saving a draft.", true);
                return false;
            }
            if (!lessonSelect || !lessonSelect.value) {
                showDraftNotice("Please select a lesson before saving a draft.", true);
                return false;
            }
            if (!activityTypeSelect || !activityTypeSelect.value) {
                showDraftNotice("Please select an activity type before saving a draft.", true);
                return false;
            }

            const originalHtml = saveDraftBtn ? saveDraftBtn.innerHTML : "";
            if (saveDraftBtn) {
                saveDraftBtn.disabled = true;
                saveDraftBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            }

            // Task #56: only the section matching the currently-selected
            // Activity Type is actually collected/sent - matches
            // activity_points.py's own "one list per activity_type" rule,
            // and keeps the request from carrying stale content left over
            // from a type the admin has since switched away from.
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
                        questions: selectedType === "Multiple Choice" ? collectMultipleChoiceQuestions() : [],
                        fill_blanks: selectedType === "Fill in the Blanks" ? collectFillBlanks() : [],
                        flashcards: selectedType === "Flashcards" ? collectFlashcards() : [],
                    }),
                });
                const result = await response.json();

                if (!result.success) {
                    showDraftNotice(result.message || "Could not save draft.", true);
                    return false;
                }

                if (activityIdInput && result.activity_id) {
                    activityIdInput.value = result.activity_id;
                }
                // Task #56: reflect the server's own computed points back
                // into the read-only field - this (not the client's own
                // running tally) is what was actually persisted.
                if (pointsInput && typeof result.points !== "undefined" && result.points !== null) {
                    pointsInput.value = result.points;
                }
                clearDirty();
                showDraftNotice(result.message || "Draft saved successfully.", false);
                return true;
            } catch (err) {
                showDraftNotice("Could not reach the server. Please try again.", true);
                return false;
            } finally {
                if (saveDraftBtn) {
                    saveDraftBtn.disabled = false;
                    saveDraftBtn.innerHTML = originalHtml;
                }
            }
        }

        // Confirm before actually saving a draft - matches Publish's
        // own confirm-then-save flow below.
        if (saveDraftBtn) {
            saveDraftBtn.addEventListener("click", (e) => {
                e.preventDefault();
                showConfirmModal(
                    "Are you sure you want to save this activity as a draft?",
                    () => { performSaveDraft(); },
                    "Save Draft?"
                );
            });
        }

        // --------------------------------------------------------
        // Intercept in-app link navigation (sidebar, header Back link,
        // etc.) while there are unsaved changes. Excludes the admin
        // logout link and disabled placeholder nav items, which already
        // have their own dedicated click handlers/modals elsewhere.
        // --------------------------------------------------------
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
        // Publish submit handling - confirm before the real submission,
        // matching upload-resource-draft-guard.js's exact pattern.
        // --------------------------------------------------------
        form.addEventListener("submit", function (e) {
            if (!publishConfirmed) {
                e.preventDefault();
                showConfirmModal(
                    "Are you sure you want to publish this activity?",
                    () => {
                        publishConfirmed = true;
                        isSubmitting = true;
                        clearDirty();
                        form.requestSubmit();
                    },
                    "Publish Activity?"
                );
                return;
            }

            isSubmitting = true;
            clearDirty();
        });
    });
})();