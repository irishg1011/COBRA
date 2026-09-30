/**
 * upload-resource-draft-guard.js - Task #44, #83, #84, #93 & #95
 * --------------------------------------------------------------------
 * Handles:
 *   - Unsaved changes detection and exit confirmations.
 *   - Save Draft & Publish workflows with shared confirmation modals.
 *   - Task #93: Form validation with red field borders (.field-error),
 *     zero inline layout distortion, popup alerts, and real-time error
 *     clearing upon typing/selection.
 *   - Task #95: Success feedback uses the same floating toast as
 *     Manage Course (changes-saved-toast), auto-dismissed after 2s.
 *     Inline / flash success text is never shown in the form header.
 *   - feat/publishing-tree: Save never changes the status. The main
 *     button is "Mark Ready" (save + Ready to Publish); lessons go live
 *     from the Publishing page. Opened from the Publishing page, every
 *     save / status change returns there (admin-editor-status.js).
 *     Move to Draft / Unpublish are handled by admin-editor-status.js.
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
    // Task #95: Success toast (matches Task #90's changes-saved-toast)
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
    // Task #93: Error popup alerts (zero inline layout shifting)
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

    window.cobraByteShowResourcePopupAlert = showPopupAlert;
    window.cobraByteHideResourcePopupAlert = hidePopupAlert;

    document.addEventListener("DOMContentLoaded", () => {
        const form = document.getElementById("uploadModuleForm");
        if (!form) return;

        const lessonNameInput = document.getElementById("lessonNameInput");
        const categorySelect = document.getElementById("categorySelect");
        const moduleSelect = document.getElementById("moduleSelect");
        const editor = document.getElementById("editorContent");
        const editorBody = document.querySelector(".editor-body");
        const hiddenContent = document.getElementById("hiddenModuleContent");
        const resourceIdInput = document.getElementById("resourceIdInput");
        const saveDraftBtn = document.getElementById("saveDraftBtn");
        const publishBtn = document.getElementById("publishResourceBtn");
        const unpublishBtn = document.getElementById("unpublishResourceBtn");

        const unsavedModal = document.getElementById("unsavedChangesModal");
        const stayBtn = document.getElementById("unsavedStayBtn");
        const leaveBtn = document.getElementById("unsavedLeaveBtn");
        const saveAndLeaveBtn = document.getElementById("unsavedSaveAndLeaveBtn");
        const unsavedSaveError = document.getElementById("unsavedSaveError");

        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");

        let isDirty = false;
        let isSubmitting = false;
        let pendingNavigation = null;
        let pendingConfirmAction = null;
        let publishConfirmed = false;

        // Task #95: Flask flash markup is kept only as a data source for
        // the toast (non-JS POST fallback). Never leave it visible inline.
        (function consumeFlashMessages() {
            const container = document.querySelector(".upload-resource-flash-messages");
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
        // Dirty-state tracking & Real-time Error Clearing
        // --------------------------------------------------------
        function markDirty() {
            isDirty = true;
        }

        function clearFieldError(el) {
            if (!el) return;
            el.classList.remove("field-error");
            if (el === editor && editorBody) {
                editorBody.classList.remove("field-error");
            }
            hidePopupAlert();
        }

        if (lessonNameInput) {
            lessonNameInput.addEventListener("input", () => {
                markDirty();
                clearFieldError(lessonNameInput);
            });
        }
        if (categorySelect) {
            categorySelect.addEventListener("change", () => {
                markDirty();
                clearFieldError(categorySelect);
            });
        }
        if (moduleSelect) {
            moduleSelect.addEventListener("change", () => {
                markDirty();
                clearFieldError(moduleSelect);
            });
        }
        if (editor) {
            editor.addEventListener("input", () => {
                markDirty();
                clearFieldError(editor);
            });
        }

        function clearDirty() {
            isDirty = false;
        }

        // Preview Lesson (admin-editor-preview.js) reads these - the SAME
        // dirty flag the leave warning uses, and the SAME checks Save uses.
        window.cobraByteLessonEditor = {
            isDirty: () => isDirty,
            validate: () => validateResourceForm(false),
        };

        // Native warning for tab close / refresh
        window.addEventListener("beforeunload", (e) => {
            if (!isDirty || isSubmitting) return;
            e.preventDefault();
            e.returnValue = "";
        });

        // --------------------------------------------------------
        // Task #93: Form Validation with Red Border Highlighting
        // --------------------------------------------------------
        function validateResourceForm(isPublish = false) {
            let isValid = true;
            let firstErrorMsg = "";
            let firstErrorField = null;

            // 1. Lesson Name
            const nameVal = lessonNameInput ? lessonNameInput.value.trim() : "";
            if (!nameVal) {
                isValid = false;
                if (lessonNameInput) lessonNameInput.classList.add("field-error");
                if (!firstErrorMsg) {
                    firstErrorMsg = isPublish
                        ? "Please enter a lesson name before publishing."
                        : "Please enter a lesson name before saving a draft.";
                    firstErrorField = lessonNameInput;
                }
            } else {
                if (lessonNameInput) lessonNameInput.classList.remove("field-error");
            }

            // 2. Category
            const catVal = categorySelect ? categorySelect.value : "";
            if (!catVal) {
                isValid = false;
                if (categorySelect) categorySelect.classList.add("field-error");
                if (!firstErrorMsg) {
                    firstErrorMsg = isPublish
                        ? "Please select a category before publishing."
                        : "Please select a category before saving a draft.";
                    firstErrorField = categorySelect;
                }
            } else {
                if (categorySelect) categorySelect.classList.remove("field-error");
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

            // 4. Content Validation
            if (typeof window.cobraByteValidateLessonContent === "function") {
                const contentCheck = window.cobraByteValidateLessonContent();
                const targetEditorBox = editorBody || editor;
                if (!contentCheck.valid) {
                    isValid = false;
                    if (targetEditorBox) targetEditorBox.classList.add("field-error");
                    if (!firstErrorMsg) {
                        firstErrorMsg = contentCheck.message;
                        firstErrorField = editor;
                    }
                } else {
                    if (targetEditorBox) targetEditorBox.classList.remove("field-error");
                }
            }

            if (!isValid) {
                showPopupAlert(firstErrorMsg, "error");
                if (firstErrorField) firstErrorField.focus();
            }

            return isValid;
        }

        // --------------------------------------------------------
        // Unsaved Changes Modal (Task #44, #84, #100)
        // --------------------------------------------------------
        const unsavedModalDesc = document.getElementById("unsavedModalDesc") ||
            (unsavedModal ? unsavedModal.querySelector(".modal-confirm-text:not(.modal-error-text)") : null);

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

            if (unsavedModalDesc) {
                unsavedModalDesc.textContent = "You have unsaved changes to this lesson. Save your changes, or leave and lose them.";
            }
            if (saveAndLeaveBtn) {
                saveAndLeaveBtn.innerHTML = '<i class="fa-regular fa-floppy-disk"></i> Save &amp; Leave';
            }

            if (unsavedModal) unsavedModal.style.display = "flex";
        }

        function closeUnsavedModal() {
            if (unsavedModal) unsavedModal.style.display = "none";
            pendingNavigation = null;
            clearUnsavedSaveError();
        }

        if (stayBtn) stayBtn.addEventListener("click", closeUnsavedModal);

        if (leaveBtn) {
            leaveBtn.addEventListener("click", () => {
                clearDirty();
                const action = pendingNavigation;
                closeUnsavedModal();
                if (typeof action === "function") action();
            });
        }

        if (saveAndLeaveBtn) {
            saveAndLeaveBtn.addEventListener("click", async () => {
                const redirectUrl = saveAndLeaveBtn.dataset.redirectUrl || "";
                const fallbackAction = pendingNavigation;

                saveAndLeaveBtn.disabled = true;
                if (stayBtn) stayBtn.disabled = true;
                if (leaveBtn) leaveBtn.disabled = true;

                const ok = await performSaveDraft();

                saveAndLeaveBtn.disabled = false;
                if (stayBtn) stayBtn.disabled = false;
                if (leaveBtn) leaveBtn.disabled = false;

                if (!ok) {
                    showUnsavedSaveError("Could not save your changes. Please check the required fields.");
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
        // Confirmation Modal (Task #83)
        // --------------------------------------------------------
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

        if (confirmActionCancelBtn) confirmActionCancelBtn.addEventListener("click", closeConfirmModal);
        if (confirmActionModal) {
            confirmActionModal.addEventListener("click", (e) => {
                if (e.target === confirmActionModal) closeConfirmModal();
            });
        }
        if (confirmActionConfirmBtn) {
            confirmActionConfirmBtn.addEventListener("click", () => {
                const action = pendingConfirmAction;
                closeConfirmModal();
                if (typeof action === "function") action();
            });
        }

        // --------------------------------------------------------
        // Save / Save Draft Logic
        // --------------------------------------------------------
        async function performSaveDraft() {
            if (!validateResourceForm(false)) {
                return false;
            }

            const originalHtml = saveDraftBtn ? saveDraftBtn.innerHTML : "";
            if (saveDraftBtn) {
                saveDraftBtn.disabled = true;
                saveDraftBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            }

            try {
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
                        preserve_status: true, // feat/publishing-tree: saving never changes the status
                    }),
                });
                const result = await response.json();

                if (!result.success) {
                    showPopupAlert(result.message || "Could not save.", "error");
                    return false;
                }

                if (resourceIdInput && result.resource_id) {
                    resourceIdInput.value = result.resource_id;
                }
                clearDirty();
                showPopupAlert(result.message || "Lesson saved successfully.", "success");
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

        if (saveDraftBtn) {
            saveDraftBtn.addEventListener("click", (e) => {
                e.preventDefault();
                if (!validateResourceForm(false)) return;

                const isPublished = saveDraftBtn.dataset.status === "Published";
                const confirmMsg = isPublished
                    ? "Save your changes? This lesson is live, so learners will see them right away."
                    : "Save your changes to this lesson?";

                showConfirmModal(
                    confirmMsg,
                    async () => {
                        const ok = await performSaveDraft();
                        // After a successful save, go back to the list page - or to the
                        // Publishing page when the editor was opened from there.
                        const back = window.cobraEditorReturnUrl ? window.cobraEditorReturnUrl("/admin/learning-resources") : "/admin/learning-resources";
                        if (ok && back) {
                            isSubmitting = true;
                            setTimeout(() => { window.location.href = back; }, TOAST_DURATION_MS);
                        }
                    },
                    "Save Changes?"
                );
            });
        }

        // --------------------------------------------------------
        // Task #99: Unpublish Logic (from within editor)
        // --------------------------------------------------------
        async function performUnpublish() {
            const resourceId = (resourceIdInput && resourceIdInput.value)
                ? resourceIdInput.value
                : (unpublishBtn ? unpublishBtn.dataset.resourceId : null);

            if (!resourceId) {
                showPopupAlert("Could not find resource ID to unpublish.", "error");
                return false;
            }

            const originalHtml = unpublishBtn ? unpublishBtn.innerHTML : "";
            if (unpublishBtn) {
                unpublishBtn.disabled = true;
                unpublishBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Unpublishing...';
            }

            try {
                const response = await fetch(`/admin/learning-resources/${resourceId}/unpublish`, {
                    method: "POST",
                    credentials: "include",
                });
                const result = await response.json();

                if (!result.success) {
                    showPopupAlert(result.message || "Could not unpublish this resource.", "error");
                    return false;
                }

                clearDirty();
                isSubmitting = true;
                showSuccessToast(result.message || "Resource unpublished successfully.");
                setTimeout(() => {
                    window.location.href = "/admin/learning-resources";
                }, TOAST_DURATION_MS);
                return true;
            } catch (err) {
                showPopupAlert("Could not reach the server. Please try again.", "error");
                return false;
            } finally {
                if (unpublishBtn && !isSubmitting) {
                    unpublishBtn.disabled = false;
                    unpublishBtn.innerHTML = originalHtml;
                }
            }
        }

        if (unpublishBtn) {
            unpublishBtn.addEventListener("click", (e) => {
                e.preventDefault();
                showConfirmModal(
                    "Are you sure you want to unpublish this resource? It will be moved back to Draft and will no longer be visible to learners.",
                    () => { performUnpublish(); },
                    "Unpublish Resource?"
                );
            });
        }

        // --------------------------------------------------------
        // In-app Link Interception
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
        // Publish (JSON) — toast on success, then return to the list
        // --------------------------------------------------------
        async function performPublish() {
            if (!validateResourceForm(true)) {
                return false;
            }

            const originalHtml = publishBtn ? publishBtn.innerHTML : "";
            if (publishBtn) {
                publishBtn.disabled = true;
                publishBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            }

            try {
                if (typeof window.cobraByteSyncInteractiveBlocks === "function") {
                    window.cobraByteSyncInteractiveBlocks();
                }
                if (hiddenContent && editor) hiddenContent.value = editor.innerHTML;

                const response = await fetch("/admin/upload-resource/publish", {
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
                    if (resourceIdInput && result.resource_id) {
                        resourceIdInput.value = result.resource_id;
                    }
                    showPopupAlert(result.message || "Could not mark this lesson ready.", "error");
                    return false;
                }

                if (resourceIdInput && result.resource_id) {
                    resourceIdInput.value = result.resource_id;
                }
                clearDirty();
                isSubmitting = true;
                showSuccessToast(result.message || "Lesson saved and marked as Ready to Publish.");
                setTimeout(() => {
                    window.location.href = window.cobraEditorReturnUrlForTab
                        ? window.cobraEditorReturnUrlForTab("/admin/learning-resources", "ready")
                        : "/admin/learning-resources";
                }, TOAST_DURATION_MS);
                return true;
            } catch (err) {
                showPopupAlert("Could not reach the server. Please try again.", "error");
                return false;
            } finally {
                if (publishBtn && !isSubmitting) {
                    publishBtn.disabled = false;
                    publishBtn.innerHTML = originalHtml;
                }
            }
        }

        form.addEventListener("submit", function (e) {
            e.preventDefault();

            if (!validateResourceForm(true)) {
                return;
            }

            if (!publishConfirmed) {
                showConfirmModal(
                    "Save this lesson and mark it Ready to Publish? It goes live when it's published on the Publishing page.",
                    () => {
                        publishConfirmed = true;
                        performPublish();
                    },
                    "Mark Ready?"
                );
                return;
            }

            performPublish();
        });
    });
})();