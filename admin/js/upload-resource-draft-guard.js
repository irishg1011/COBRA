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

        let isDirty = false;
        let isSubmitting = false; // true once the real Publish form is actually submitting
        let pendingNavigation = null; // function to run once the admin confirms leaving

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
        // Inline "Draft saved" / error notice, right under the Lesson
        // Name field - reuses the same dynamic-banner technique already
        // used by admin-create-admin.js's showFormMessage().
        // --------------------------------------------------------
        function showDraftNotice(message, isError) {
            const anchor = lessonNameInput ? lessonNameInput.closest(".form-group") : null;
            if (!anchor) { if (isError) alert(message); return; }
            let notice = anchor.querySelector(".js-draft-notice");
            if (!notice) {
                notice = document.createElement("p");
                notice.className = "js-draft-notice";
                notice.style.fontSize = "12px";
                notice.style.marginTop = "6px";
                notice.style.fontWeight = "600";
                anchor.appendChild(notice);
            }
            notice.textContent = message;
            notice.style.color = isError ? "#e02424" : "#09B300";
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

        if (saveDraftBtn) {
            saveDraftBtn.addEventListener("click", (e) => {
                e.preventDefault();
                performSaveDraft();
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
        // Clear the unsaved-changes flag once the real Publish form is
        // actually being submitted, so beforeunload's native prompt
        // doesn't fire during a legitimate, successful submission.
        // --------------------------------------------------------
        form.addEventListener("submit", () => {
            isSubmitting = true;
            clearDirty();
        });
        // Task: Lesson Message minimum length - shared by the Publish submit
        // below AND upload-resource-draft-guard.js's Save Draft flow (via
        // window.cobraByteValidateLessonContent), so create and edit both
        // enforce the exact same rule instead of two divergent copies.
        function validateLessonContentLength() {
            const length = getMainLessonContentLength();
            if (length < MIN_LESSON_CONTENT_CHARS) {
                return {
                    valid: false,
                    message: `Lesson message must contain at least ${MIN_LESSON_CONTENT_CHARS} characters of meaningful content.`,
                };
            }
            return { valid: true, message: "" };
        }

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

        editor.addEventListener("input", clearLessonContentError);

        window.cobraByteValidateLessonContent = validateLessonContentLength;

        form.addEventListener("submit", function (e) {
            const check = validateLessonContentLength();
            if (!check.valid) {
                e.preventDefault();
                showLessonContentError(check.message);
                editor.focus();
                return;
            }
            clearLessonContentError();

            // Task #45: must run BEFORE reading editor.innerHTML...
            syncInteractiveBlockValues();
            hiddenInput.value = editor.innerHTML;
        });
    });
})();