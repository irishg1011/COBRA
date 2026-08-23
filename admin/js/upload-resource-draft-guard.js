/**
 * upload-resource-draft-guard.js - Task #44: Unsaved Changes Detection
 * + Draft Autosave for Upload Resource
 * --------------------------------------------------------------------
 * Watches Lesson Name / Category / Module / the rich-text editor for
 * changes and:
 *   - Shows a native browser warning (beforeunload) on tab close,
 *     refresh, or a typed/bookmarked URL navigation while there are
 *     unsaved changes.
 *   - Intercepts in-app link clicks (sidebar nav, the header "Back"
 *     link, etc.) and shows a custom modal instead of navigating
 *     immediately, offering "Stay", "Leave Without Saving", or
 *     "Save Draft & Leave".
 *   - Wires the "Save Draft" button to POST the current form state to
 *     /admin/upload-resource/save-draft (see admin_routes.py ->
 *     resource_draft.py), storing the returned resource_id in a hidden
 *     field so every later save updates the SAME row instead of
 *     creating duplicates.
 *   - Clears the unsaved-changes flag the moment a draft save OR the
 *     real Publish submission succeeds.
 *
 * Task #82: showDraftNotice() below renders in .top-bar-validation-row
 * (under the Preview Lesson / Save Draft / Publish buttons) - a
 * DIFFERENT spot than #lessonNameError, which lives beside the "Lesson
 * Name" label (see upload-resource.html / upload-resource.js). The two
 * message sources are kept fully separate so they never land in the
 * same element and visually run together.
 *
 * Only present on pages that have #uploadModuleForm (currently just
 * upload-resource.html), so this is safe to include as a shared
 * script without guard checks elsewhere.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const form = document.getElementById("uploadModuleForm");
        if (!form) return; // not on this page

        const lessonNameInput = document.getElementById("lessonNameInput");
        const categorySelect = document.getElementById("categorySelect");
        const moduleSelect = document.getElementById("moduleSelect");
        const editor = document.getElementById("editorContent");
        const hiddenContent = document.getElementById("hiddenModuleContent");
        const resourceIdInput = document.getElementById("resourceIdInput");
        const saveDraftBtn = document.getElementById("saveDraftBtn");

        const unsavedModal = document.getElementById("unsavedChangesModal");
        const stayBtn = document.getElementById("unsavedStayBtn");
        const leaveBtn = document.getElementById("unsavedLeaveBtn");
        const saveAndLeaveBtn = document.getElementById("unsavedSaveAndLeaveBtn");

        // Task #83: shared Save Draft / Publish confirmation modal (see
        // confirm-action-modal.html). One generic Yes/No modal reused by
        // both actions - showConfirmModal() below sets its title/message
        // and what runs on Confirm.
        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");

        let isDirty = false;
        let isSubmitting = false; // true once the real Publish form is actually submitting
        let pendingNavigation = null; // function to run once the admin confirms leaving
        let pendingConfirmAction = null; // function to run once the admin confirms Save Draft/Publish
        let publishConfirmed = false; // true once the admin has confirmed Publish for the in-flight submit

        // --------------------------------------------------------
        // Dirty-state tracking
        // --------------------------------------------------------
        function markDirty() {
            isDirty = true;
        }

        [lessonNameInput, categorySelect, moduleSelect].forEach((el) => {
            if (!el) return;
            el.addEventListener("input", markDirty);
            el.addEventListener("change", markDirty);
        });
        if (editor) {
            editor.addEventListener("input", markDirty);
        }

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
        function openUnsavedModal(navigateAction) {
            pendingNavigation = navigateAction;
            if (unsavedModal) unsavedModal.style.display = "flex";
        }

        function closeUnsavedModal() {
            if (unsavedModal) unsavedModal.style.display = "none";
            pendingNavigation = null;
        }

        if (stayBtn) stayBtn.addEventListener("click", closeUnsavedModal);

        // --------------------------------------------------------
        // Task #83: Save Draft / Publish confirmation modal
        // --------------------------------------------------------
        // Shows the shared confirm modal with a given title/message and
        // runs `onConfirm` only if the admin actually clicks Confirm.
        // Cancel (or clicking outside the card) simply closes the modal -
        // no form data is touched either way, and `onConfirm` never runs.
        // Falls back to a native confirm() if the modal markup isn't on
        // the page for some reason, so this never silently breaks the
        // Save Draft/Publish flow.
        function showConfirmModal(message, onConfirm, title) {
            if (!confirmActionModal) {
                if (window.confirm(message)) onConfirm();
                return;
            }
            pendingConfirmAction = onConfirm;
            if (confirmActionTitle) confirmActionTitle.textContent = title || "Confirm Action";
            if (confirmActionText) confirmActionText.textContent = message;
            confirmActionModal.style.display = "flex";
        }

        function closeConfirmModal() {
            if (confirmActionModal) confirmActionModal.style.display = "none";
            pendingConfirmAction = null;
        }

        if (confirmActionCancelBtn) {
            confirmActionCancelBtn.addEventListener("click", closeConfirmModal);
        }
        if (confirmActionConfirmBtn) {
            confirmActionConfirmBtn.addEventListener("click", () => {
                const action = pendingConfirmAction;
                closeConfirmModal();
                if (action) action();
            });
        }
        if (confirmActionModal) {
            // Click outside the card closes it too, matching every other
            // modal's own outside-click behavior on this page.
            confirmActionModal.addEventListener("click", (e) => {
                if (e.target === confirmActionModal) closeConfirmModal();
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
                const action = pendingNavigation;
                saveAndLeaveBtn.disabled = true;
                const ok = await performSaveDraft();
                saveAndLeaveBtn.disabled = false;
                closeUnsavedModal();
                if (ok && action) action();
            });
        }

        // --------------------------------------------------------
        // Task #82: Draft save notice ("Draft saved successfully." /
        // "Please enter a lesson name before saving a draft.", etc.)
        // renders inside .top-bar-validation-row, under the Preview
        // Lesson / Save Draft / Publish buttons - completely separate
        // from #lessonNameError (which sits beside the Lesson Name
        // label instead).
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

        function clearDraftNotice() {
            const anchor = document.querySelector(".top-bar-validation-row");
            const notice = anchor ? anchor.querySelector(".js-draft-notice") : null;
            if (notice) {
                notice.textContent = "";
                notice.style.display = "none";
            }
        }

        // --------------------------------------------------------
        // Save Draft (POST /admin/upload-resource/save-draft)
        // --------------------------------------------------------
        async function performSaveDraft() {
            if (!lessonNameInput || !lessonNameInput.value.trim()) {
                showDraftNotice("Please enter a lesson name before saving a draft.", true);
                if (lessonNameInput) lessonNameInput.focus();
                return false;
            }
            if (!categorySelect || !categorySelect.value) {
                showDraftNotice("Please select a category before saving a draft.", true);
                return false;
            }
            if (!moduleSelect || !moduleSelect.value) {
                showDraftNotice("Please select a module before saving a draft.", true);
                return false;
            }
                    if (!moduleSelect || !moduleSelect.value) {
            showDraftNotice("Please select a module before saving a draft.", true);
            return false;
        }

        // NEW: same Lesson Message minimum-length rule Publish enforces
        // (editor-toolbar.js), reused here instead of a second copy.
        if (typeof window.cobraByteValidateLessonContent === "function") {
            const contentCheck = window.cobraByteValidateLessonContent();
            if (!contentCheck.valid) {
                showDraftNotice(contentCheck.message, true);
                return false;
            }
        }
            const originalHtml = saveDraftBtn ? saveDraftBtn.innerHTML : "";
            if (saveDraftBtn) {
                saveDraftBtn.disabled = true;
                saveDraftBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            }

            try {
                // Task #45: same fix as the real Publish submit (see
                // editor-toolbar.js's syncInteractiveBlockValues()) -
                // without this, a filename typed or a mode dropdown
                // changed inside a code/terminal block would silently
                // vanish from the draft the moment it's saved, since
                // those live values never make it into editor.innerHTML
                // on their own.
                if (typeof window.cobraByteSyncInteractiveBlocks === "function") {
                    window.cobraByteSyncInteractiveBlocks();
                }
                if (hiddenContent && editor) hiddenContent.value = editor.innerHTML;

                const response = await fetch("/admin/upload-resource/save-draft", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        resource_id: resourceIdInput ? (resourceIdInput.value || null) : null,
                        lesson_name: lessonNameInput.value.trim(),
                        category_id: categorySelect.value,
                        module_id: moduleSelect.value,
                        module_content: hiddenContent ? hiddenContent.value : "",
                    }),
                });
                const result = await response.json();

                if (!result.success) {
                    showDraftNotice(result.message || "Could not save draft.", true);
                    return false;
                }

                if (resourceIdInput && result.resource_id) {
                    resourceIdInput.value = result.resource_id;
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

        // Task #83: confirm before actually saving a draft. Cancel closes
        // the modal and leaves every field exactly as typed; Confirm runs
        // the existing performSaveDraft() flow unchanged (including its
        // own required-field/content-length validation).
        if (saveDraftBtn) {
            saveDraftBtn.addEventListener("click", (e) => {
                e.preventDefault();
                showConfirmModal(
                    "Are you sure you want to save this draft?",
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

        function showLessonContentError(message) {
            const errorEl = document.getElementById("lessonContentError");
            if (!errorEl) { alert(message); return; }
            errorEl.textContent = message;
            errorEl.style.display = "block";
        }

        function clearLessonContentError() {
            const errorEl = document.getElementById("lessonContentError");
            if (errorEl) { errorEl.style.display = "none"; errorEl.textContent = ""; }
        }

        if (editor) editor.addEventListener("input", clearLessonContentError);

        // --------------------------------------------------------
        // Publish submit handling (Task #83, plus a fix for a pre-existing
        // bug): the Publish button is a real type="submit" control, so the
        // browser's own required-field validation (Lesson Name, Category,
        // Module all have `required`) already runs BEFORE this listener
        // ever fires - that behavior is untouched here.
        //
        // Once the native required-field check passes:
        //   1. Content-length is checked via the SAME shared validator
        //      Save Draft already uses (window.cobraByteValidateLessonContent,
        //      defined once in editor-toolbar.js) - previously this file had
        //      its own broken copy of this check (referencing functions/
        //      variables that don't exist in this file's scope), which threw
        //      an error on every single Publish click. That broken copy is
        //      removed; this is now the one place this rule is enforced for
        //      Publish.
        //   2. If content is valid and the admin hasn't confirmed yet, the
        //      real submission is paused (preventDefault) and the shared
        //      confirm modal is shown. Cancel leaves the form exactly as it
        //      was - nothing is submitted, nothing is lost.
        //   3. On Confirm, the same interactive-block sync Publish always
        //      needed (Task #45) is performed, then the form is submitted
        //      for real via form.requestSubmit() - which re-runs this exact
        //      listener, but `publishConfirmed` is now true, so it falls
        //      through to the real, unblocked submission instead of asking
        //      again.
        form.addEventListener("submit", function (e) {
            const check = typeof window.cobraByteValidateLessonContent === "function"
                ? window.cobraByteValidateLessonContent()
                : { valid: true, message: "" };

            if (!check.valid) {
                e.preventDefault();
                showLessonContentError(check.message);
                if (editor) editor.focus();
                return;
            }
            clearLessonContentError();

            if (!publishConfirmed) {
                e.preventDefault();
                showConfirmModal(
                    "Are you sure you want to publish this resource?",
                    () => {
                        publishConfirmed = true;
                        isSubmitting = true;
                        clearDirty();
                        // Task #45: must run BEFORE reading editor.innerHTML,
                        // or any filename typed / dropdown chosen inside a
                        // code/terminal block would silently be dropped from
                        // what actually gets published.
                        if (typeof window.cobraByteSyncInteractiveBlocks === "function") {
                            window.cobraByteSyncInteractiveBlocks();
                        }
                        if (hiddenContent && editor) hiddenContent.value = editor.innerHTML;
                        form.requestSubmit();
                    },
                    "Publish Resource?"
                );
                return;
            }

            // Already confirmed - this is the real, final submission.
            isSubmitting = true;
            clearDirty();
        });
    });
})();