/**
 * upload-video-tutorial-ui.js - New Video Tutorial page functionality
 * ---------------------------------------------------------------------
 * Backs admin/upload-video-tutorial.html. Handles:
 *   - Category -> Module -> Lesson cascading dropdowns, backed entirely
 *     by real database lookups (reuses the SAME dependent-dropdown
 *     endpoints Create Learning Activity / Create Coding Exercise
 *     already use - no duplicate endpoints):
 *       GET /admin/upload-resource/modules-by-category?cat_id=
 *       GET /admin/create-learning-activity/lessons-by-module?module_id=
 *   - The Description About the Video rich-text toolbar (Bold, Italic,
 *     Underline, Bullet/Numbered List, Alignment, Insert Image, Insert
 *     Link) via document.execCommand, matched against each button's
 *     existing `title` attribute so no HTML markup has to change.
 *   - Video File drag-and-drop / Browse File selection, with client-side
 *     format (MP4/WebM/MOV) and size (2GB) validation, and a real
 *     <video> element injected into the existing .video-preview-player
 *     container (replacing its mock placeholder only once a valid file
 *     is chosen, and restoring the original mock UI when it's removed).
 *   - The read-only Video Information panel, updated live from the
 *     selected Category/Module/Lesson option text.
 *   - Preview Video / Save Draft / Publish, each validating through the
 *     SAME custom modal/toast notification pattern already used
 *     elsewhere in this admin (#confirmActionModal, .resource-popup-
 *     alert, .changes-saved-toast) - never a native alert()/confirm()/
 *     prompt().
 *   - Reloading a previously saved video tutorial (via ?video_id=) so
 *     every field, the cascading dropdowns, and the video preview all
 *     come back exactly as they were left.
 */
(function () {
    "use strict";

    const TOAST_DURATION_MS = 2000;
    const DESC_MAX = 2000;
    const ALLOWED_VIDEO_EXTENSIONS = ["mp4", "webm", "mov"];
    const MAX_VIDEO_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    /* =============================================================
       Toast / popup alert (reuses admin-style.css's existing
       .changes-saved-toast / .resource-popup-alert classes - no new
       CSS, matches upload-resource-draft-guard.js's exact pattern)
    ============================================================= */
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

    let popupAlertTimeout = null;

    function showPopupAlert(message, type = "error") {
        if (type === "success") {
            showSuccessToast(message);
            return;
        }
        let popup = document.getElementById("videoPopupAlert");
        if (!popup) {
            popup = document.createElement("div");
            popup.id = "videoPopupAlert";
            document.body.appendChild(popup);
        }
        popup.className = "resource-popup-alert error";
        popup.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span>${escapeHtml(message)}</span>`;
        popup.classList.add("show");

        if (popupAlertTimeout) clearTimeout(popupAlertTimeout);
        popupAlertTimeout = setTimeout(() => {
            popup.classList.remove("show");
        }, TOAST_DURATION_MS);
    }

    document.addEventListener("DOMContentLoaded", () => {

        /* =========================================================
           Element references
        ========================================================= */
        const categorySelect = document.getElementById("videoCategorySelect");
        const moduleSelect = document.getElementById("videoModuleSelect");
        const lessonSelect = document.getElementById("videoLessonSelect");

        const titleInput = document.getElementById("videoTitleInput");

        const descEditor = document.getElementById("videoDescriptionEditor");
        const descCounter = document.getElementById("videoDescCounter");
        const hiddenDescription = document.getElementById("hiddenVideoDescription");

        const dropzone = document.getElementById("videoDropzone");
        const browseBtn = document.getElementById("videoBrowseBtn");
        const fileInput = document.getElementById("videoFileInput");
        const selectedFileBox = document.getElementById("videoSelectedFile");
        const selectedFileName = document.getElementById("videoSelectedFileName");
        const removeFileBtn = document.getElementById("removeVideoFileBtn");

        const previewPlayer = document.querySelector(".video-preview-player");
        const previewPlaceholder = document.getElementById("videoPreviewTitleText");
        const previewMockControls = previewPlayer ? previewPlayer.querySelector(".video-preview-controls-mock") : null;

        const infoCategory = document.getElementById("videoInfoCategory");
        const infoModule = document.getElementById("videoInfoModule");
        const infoLesson = document.getElementById("videoInfoLesson");

        const previewBtn = document.getElementById("previewVideoBtn");
        const saveDraftBtn = document.getElementById("saveVideoDraftBtn");
        const publishBtn = document.getElementById("publishVideoBtn");

        const videoTutorialIdInput = document.getElementById("videoTutorialIdInput");
        const existingFilePathInput = document.getElementById("existingVideoFilePathInput");
        const existingFileSizeInput = document.getElementById("existingVideoFileSizeInput");
        const existingFileUrlInput = document.getElementById("existingVideoFileUrlInput");

        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");

        let pendingConfirmAction = null;
        let selectedVideoFile = null; // File object chosen this session (null until a new one is picked)

        /* =========================================================
           Shared confirmation modal (Task pattern: #confirmActionModal)
        ========================================================= */
        function showConfirmModal(message, onConfirm, title) {
            if (!confirmActionModal) {
                onConfirm();
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

        /* =========================================================
           Info-only modal (single OK button) - reuses the SAME
           #confirmActionModal shell as showConfirmModal(), just
           hiding the Cancel button, for a plain acknowledgement
           dialog instead of a native alert().
        ========================================================= */
        function showInfoModal(message, title) {
            if (!confirmActionModal) return;
            if (confirmActionTitle) confirmActionTitle.textContent = title || "Missing Information";
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "none";
            if (confirmActionConfirmBtn) confirmActionConfirmBtn.textContent = "OK";
            pendingConfirmAction = null;
            confirmActionModal.style.display = "flex";

            const restore = () => {
                if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
                if (confirmActionConfirmBtn) confirmActionConfirmBtn.textContent = "Confirm";
                confirmActionConfirmBtn.removeEventListener("click", restore);
                confirmActionModal.removeEventListener("click", overlayRestore);
            };
            const overlayRestore = (e) => {
                if (e.target === confirmActionModal) restore();
            };
            if (confirmActionConfirmBtn) confirmActionConfirmBtn.addEventListener("click", restore);
            confirmActionModal.addEventListener("click", overlayRestore);
        }

        /* =========================================================
           Lightweight URL-prompt modal (for Insert Image / Insert
           Link) - built entirely at runtime, reusing the SAME
           .modal-overlay / .modal-card / .modal-confirm-title /
           .form-control / .modal-confirm-actions / .modal-btn-cancel
           / .modal-btn-save classes already defined in admin-
           style.css for every other modal on this admin, so no CSS
           file is touched and no native prompt() is used.
        ========================================================= */
        function promptForUrl(labelText, onSubmit) {
            let overlay = document.getElementById("videoUrlPromptModal");
            if (overlay) overlay.remove();

            overlay = document.createElement("div");
            overlay.id = "videoUrlPromptModal";
            overlay.className = "modal-overlay";
            overlay.style.display = "flex";
            overlay.innerHTML = `
                <div class="modal-card modal-card-confirm">
                    <h3 class="modal-confirm-title">${escapeHtml(labelText)}</h3>
                    <input type="url" class="form-control" id="videoUrlPromptInput" placeholder="https://" style="margin: 10px 0 18px 0;">
                    <div class="modal-confirm-actions">
                        <button type="button" class="modal-btn-cancel" id="videoUrlPromptCancel">Cancel</button>
                        <button type="button" class="modal-btn-save" id="videoUrlPromptOk">Insert</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const input = overlay.querySelector("#videoUrlPromptInput");
            const cancelBtn = overlay.querySelector("#videoUrlPromptCancel");
            const okBtn = overlay.querySelector("#videoUrlPromptOk");

            function cleanup() {
                overlay.remove();
            }

            cancelBtn.addEventListener("click", cleanup);
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) cleanup();
            });
            okBtn.addEventListener("click", () => {
                const value = (input.value || "").trim();
                cleanup();
                if (value) onSubmit(value);
            });
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    okBtn.click();
                } else if (e.key === "Escape") {
                    cleanup();
                }
            });

            if (input) input.focus();
        }

        /* =========================================================
           Category -> Module -> Lesson cascading dropdowns
        ========================================================= */
        const MODULE_PLACEHOLDER_HTML = '<option value="" disabled selected>Select module...</option>';
        const LESSON_PLACEHOLDER_HTML = '<option value="" disabled selected>Select lesson...</option>';

        function resetLessonDropdown() {
            if (!lessonSelect) return;
            lessonSelect.innerHTML = LESSON_PLACEHOLDER_HTML;
            lessonSelect.disabled = true;
            updateVideoInfoPanel();
        }

        function resetModuleDropdown() {
            if (!moduleSelect) return;
            moduleSelect.innerHTML = MODULE_PLACEHOLDER_HTML;
            moduleSelect.disabled = true;
        }

        async function loadLessonsForModule(moduleId, preselectResourceId) {
            resetLessonDropdown();
            if (!moduleId) return;

            try {
                const response = await fetch(
                    `/admin/create-learning-activity/lessons-by-module?module_id=${encodeURIComponent(moduleId)}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                if (!result.success || !Array.isArray(result.lessons) || result.lessons.length === 0) {
                    resetLessonDropdown();
                    return;
                }

                const optionsHtml = result.lessons.map((l) => {
                    const isSelected = preselectResourceId && String(l.resource_id) === String(preselectResourceId);
                    return `<option value="${escapeHtml(l.resource_id)}" ${isSelected ? "selected" : ""}>${escapeHtml(l.resource_title)}</option>`;
                }).join("");

                lessonSelect.innerHTML = LESSON_PLACEHOLDER_HTML + optionsHtml;
                lessonSelect.disabled = false;
                updateVideoInfoPanel();
            } catch (err) {
                resetLessonDropdown();
            }
        }

        async function loadModulesForCategory(catId, preselectModuleId, preselectResourceId) {
            resetModuleDropdown();
            resetLessonDropdown();
            if (!catId) return;

            try {
                const response = await fetch(
                    `/admin/upload-resource/modules-by-category?cat_id=${encodeURIComponent(catId)}`,
                    { credentials: "include" }
                );
                const result = await response.json();

                if (!result.success || !Array.isArray(result.modules) || result.modules.length === 0) {
                    resetModuleDropdown();
                    return;
                }

                const optionsHtml = result.modules.map((m) => {
                    const isSelected = preselectModuleId && String(m.module_id) === String(preselectModuleId);
                    return `<option value="${escapeHtml(m.module_id)}" ${isSelected ? "selected" : ""}>${escapeHtml(m.module_name)}</option>`;
                }).join("");

                moduleSelect.innerHTML = MODULE_PLACEHOLDER_HTML + optionsHtml;
                moduleSelect.disabled = false;
                updateVideoInfoPanel();

                if (preselectModuleId && moduleSelect.querySelector(`option[value="${preselectModuleId}"]`)) {
                    moduleSelect.value = String(preselectModuleId);
                    await loadLessonsForModule(preselectModuleId, preselectResourceId);
                }
            } catch (err) {
                resetModuleDropdown();
            }
        }

        if (categorySelect) {
            categorySelect.addEventListener("change", () => {
                clearFieldError(categorySelect);
                loadModulesForCategory(categorySelect.value);
            });
        }
        if (moduleSelect) {
            moduleSelect.addEventListener("change", () => {
                clearFieldError(moduleSelect);
                loadLessonsForModule(moduleSelect.value);
            });
        }
        if (lessonSelect) {
            lessonSelect.addEventListener("change", () => {
                clearFieldError(lessonSelect);
                updateVideoInfoPanel();
            });
        }

        /* =========================================================
           Video Information panel (Task #8) - reflects the selected
           option TEXT for Category/Module/Lesson, never hardcoded.
        ========================================================= */
        function updateVideoInfoPanel() {
            if (infoCategory) {
                const opt = categorySelect ? categorySelect.options[categorySelect.selectedIndex] : null;
                infoCategory.textContent = (opt && opt.value) ? opt.textContent : "-";
            }
            if (infoModule) {
                const opt = moduleSelect ? moduleSelect.options[moduleSelect.selectedIndex] : null;
                infoModule.textContent = (opt && opt.value) ? opt.textContent : "-";
            }
            if (infoLesson) {
                const opt = lessonSelect ? lessonSelect.options[lessonSelect.selectedIndex] : null;
                infoLesson.textContent = (opt && opt.value) ? opt.textContent : "-";
            }
        }

        /* =========================================================
           Description About the Video - rich-text toolbar (Task #5)
           Matched by each button's existing `title` attribute so the
           HTML markup itself never needs a data-action attribute.
        ========================================================= */
        function updateDescCounter() {
            if (!descEditor || !descCounter) return;
            const length = descEditor.textContent.length;
            descCounter.textContent = `${length} / ${DESC_MAX}`;
            descCounter.style.color = length >= DESC_MAX ? "#ef4444" : "#9ca3af";
        }

        function syncHiddenDescription() {
            if (hiddenDescription && descEditor) {
                hiddenDescription.value = descEditor.innerHTML;
            }
        }

        if (descEditor) {
            document.querySelectorAll(".video-desc-toolbar button[title]").forEach((button) => {
                button.addEventListener("click", (e) => {
                    e.preventDefault();
                    descEditor.focus();
                    const action = button.getAttribute("title");

                    switch (action) {
                        case "Bold":
                            document.execCommand("bold", false, null);
                            break;
                        case "Italic":
                            document.execCommand("italic", false, null);
                            break;
                        case "Underline":
                            document.execCommand("underline", false, null);
                            break;
                        case "Bullet List":
                            document.execCommand("insertUnorderedList", false, null);
                            break;
                        case "Numbered List":
                            document.execCommand("insertOrderedList", false, null);
                            break;
                        case "Align Left":
                            document.execCommand("justifyLeft", false, null);
                            break;
                        case "Align Center":
                            document.execCommand("justifyCenter", false, null);
                            break;
                        case "Align Right":
                            document.execCommand("justifyRight", false, null);
                            break;
                        case "Insert Image":
                            promptForUrl("Insert Image URL", (url) => {
                                descEditor.focus();
                                document.execCommand("insertImage", false, url);
                                markDirtyDesc();
                            });
                            return;
                        case "Insert Link":
                            promptForUrl("Insert Link URL", (url) => {
                                descEditor.focus();
                                const selectionText = window.getSelection().toString();
                                if (selectionText) {
                                    document.execCommand("createLink", false, url);
                                } else {
                                    document.execCommand("insertHTML", false,
                                        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`);
                                }
                                markDirtyDesc();
                            });
                            return;
                        default:
                            break;
                    }
                    markDirtyDesc();
                });
            });

            function markDirtyDesc() {
                updateDescCounter();
                syncHiddenDescription();
                clearFieldError(descEditor);
            }

            descEditor.addEventListener("input", markDirtyDesc);
            updateDescCounter();
            syncHiddenDescription();
        }

        /* =========================================================
           Video File upload (Task #6) - Browse / Drag&Drop, client
           validation (format + 2GB max), and real-time preview
           (Task #7).
        ========================================================= */
        function validateVideoFile(file) {
            const extension = (file.name.split(".").pop() || "").toLowerCase();
            if (!ALLOWED_VIDEO_EXTENSIONS.includes(extension)) {
                return "Unsupported file type. Please upload a MP4, WebM, or MOV video file.";
            }
            if (file.size > MAX_VIDEO_SIZE_BYTES) {
                return "This video exceeds the maximum allowed size of 2GB.";
            }
            if (file.size <= 0) {
                return "The selected video file appears to be empty.";
            }
            return null;
        }

        function showSelectedFile(name) {
            if (!selectedFileBox || !selectedFileName) return;
            selectedFileName.textContent = name;
            selectedFileBox.classList.add("show");
        }

        function clearSelectedFileDisplay() {
            if (selectedFileBox) selectedFileBox.classList.remove("show");
            if (selectedFileName) selectedFileName.textContent = "—";
        }

        // Injects a real <video controls> element into the existing
        // .video-preview-player container, hiding (never deleting) the
        // original mock placeholder/controls so the default no-selection
        // UI is fully preserved and restorable.
        function showVideoPreview(url) {
            if (!previewPlayer) return;
            if (previewPlaceholder) previewPlaceholder.style.display = "none";
            if (previewMockControls) previewMockControls.style.display = "none";

            let videoEl = document.getElementById("videoPreviewPlayerEl");
            if (!videoEl) {
                videoEl = document.createElement("video");
                videoEl.id = "videoPreviewPlayerEl";
                videoEl.controls = true;
                videoEl.style.width = "100%";
                videoEl.style.height = "100%";
                videoEl.style.objectFit = "contain";
                videoEl.style.position = "absolute";
                videoEl.style.top = "0";
                videoEl.style.left = "0";
                videoEl.style.background = "#000";
                previewPlayer.appendChild(videoEl);
            }
            videoEl.src = url;
        }

        function clearVideoPreview() {
            const videoEl = document.getElementById("videoPreviewPlayerEl");
            if (videoEl) {
                if (videoEl.src && videoEl.src.startsWith("blob:")) {
                    URL.revokeObjectURL(videoEl.src);
                }
                videoEl.remove();
            }
            if (previewPlaceholder) previewPlaceholder.style.display = "";
            if (previewMockControls) previewMockControls.style.display = "";
        }

        function handleFileSelected(file) {
            if (!file) return;
            const error = validateVideoFile(file);
            if (error) {
                showPopupAlert(error, "error");
                if (fileInput) fileInput.value = "";
                return;
            }
            selectedVideoFile = file;
            showSelectedFile(file.name);
            const blobUrl = URL.createObjectURL(file);
            showVideoPreview(blobUrl);
            clearFieldError(dropzone);
        }

        if (browseBtn && fileInput) {
            browseBtn.addEventListener("click", () => fileInput.click());
            fileInput.addEventListener("change", () => {
                if (fileInput.files && fileInput.files[0]) {
                    handleFileSelected(fileInput.files[0]);
                }
            });
        }

        if (dropzone) {
            ["dragenter", "dragover"].forEach((evt) => {
                dropzone.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.add("dragover");
                });
            });
            ["dragleave", "drop"].forEach((evt) => {
                dropzone.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.classList.remove("dragover");
                });
            });
            dropzone.addEventListener("drop", (e) => {
                const files = e.dataTransfer && e.dataTransfer.files;
                if (files && files[0]) {
                    if (fileInput) {
                        try { fileInput.files = files; } catch (err) { /* read-only in some browsers */ }
                    }
                    handleFileSelected(files[0]);
                }
            });
        }

        if (removeFileBtn) {
            removeFileBtn.addEventListener("click", () => {
                selectedVideoFile = null;
                if (fileInput) fileInput.value = "";
                clearSelectedFileDisplay();
                clearVideoPreview();
                if (existingFilePathInput) existingFilePathInput.value = "";
                if (existingFileSizeInput) existingFileSizeInput.value = "";
                if (existingFileUrlInput) existingFileUrlInput.value = "";
            });
        }

        /* =========================================================
           Field-error helpers (red border, matching .field-error
           already defined in admin-style.css)
        ========================================================= */
        function clearFieldError(el) {
            if (!el) return;
            el.classList.remove("field-error");
        }

        function setFieldError(el) {
            if (!el) return;
            el.classList.add("field-error");
        }

        [titleInput].forEach((el) => {
            if (el) el.addEventListener("input", () => clearFieldError(el));
        });

        /* =========================================================
           Form validation (Task #13) - Save Draft requires Category/
           Module/Lesson/Title; Publish additionally requires a video
           file and a description.
        ========================================================= */
        function validateVideoForm(isPublish) {
            let isValid = true;
            let firstErrorMsg = "";
            let firstErrorField = null;

            const catVal = categorySelect ? categorySelect.value : "";
            const modVal = moduleSelect ? moduleSelect.value : "";
            const lesVal = lessonSelect ? lessonSelect.value : "";
            const titleVal = titleInput ? titleInput.value.trim() : "";

            if (!catVal) {
                isValid = false;
                setFieldError(categorySelect);
                firstErrorMsg = firstErrorMsg || "Please select a Category.";
                firstErrorField = firstErrorField || categorySelect;
            } else {
                clearFieldError(categorySelect);
            }

            if (!modVal) {
                isValid = false;
                setFieldError(moduleSelect);
                firstErrorMsg = firstErrorMsg || "Please select a Module.";
                firstErrorField = firstErrorField || moduleSelect;
            } else {
                clearFieldError(moduleSelect);
            }

            if (!lesVal) {
                isValid = false;
                setFieldError(lessonSelect);
                firstErrorMsg = firstErrorMsg || "Please select a Lesson.";
                firstErrorField = firstErrorField || lessonSelect;
            } else {
                clearFieldError(lessonSelect);
            }

            if (!titleVal) {
                isValid = false;
                setFieldError(titleInput);
                firstErrorMsg = firstErrorMsg || "Please enter a Video Tutorial Title.";
                firstErrorField = firstErrorField || titleInput;
            } else {
                clearFieldError(titleInput);
            }

            if (isPublish) {
                const hasExistingFile = !!(existingFilePathInput && existingFilePathInput.value);
                const hasFile = !!selectedVideoFile || hasExistingFile;
                if (!hasFile) {
                    isValid = false;
                    setFieldError(dropzone);
                    firstErrorMsg = firstErrorMsg || "Please upload a video file before publishing.";
                    firstErrorField = firstErrorField || dropzone;
                } else {
                    clearFieldError(dropzone);
                }

                const descText = descEditor ? descEditor.textContent.trim() : "";
                if (!descText) {
                    isValid = false;
                    setFieldError(descEditor);
                    firstErrorMsg = firstErrorMsg || "Please write a description about the video before publishing.";
                    firstErrorField = firstErrorField || descEditor;
                } else {
                    clearFieldError(descEditor);
                }
            }

            if (!isValid) {
                showPopupAlert(firstErrorMsg, "error");
                if (firstErrorField && typeof firstErrorField.focus === "function") firstErrorField.focus();
            }

            return isValid;
        }

        /* =========================================================
           Preview Video (Task #9) - validates, never submits/publishes.
        ========================================================= */
        if (previewBtn) {
            previewBtn.addEventListener("click", () => {
                syncHiddenDescription();
                const catVal = categorySelect ? categorySelect.value : "";
                const modVal = moduleSelect ? moduleSelect.value : "";
                const lesVal = lessonSelect ? lessonSelect.value : "";
                const titleVal = titleInput ? titleInput.value.trim() : "";
                const hasFile = !!selectedVideoFile || (existingFilePathInput && !!existingFilePathInput.value);

                const missing = [];
                if (!catVal) missing.push("Category");
                if (!modVal) missing.push("Module");
                if (!lesVal) missing.push("Lesson");
                if (!titleVal) missing.push("Video Tutorial Title");
                if (!hasFile) missing.push("Video File");

                if (missing.length > 0) {
                    showInfoModal(
                        `Please provide the following before previewing: ${missing.join(", ")}.`,
                        "Cannot Preview Yet"
                    );
                    return;
                }

                updateVideoInfoPanel();
                if (previewPlayer) {
                    previewPlayer.scrollIntoView({ behavior: "smooth", block: "center" });
                }
                const videoEl = document.getElementById("videoPreviewPlayerEl");
                if (videoEl) {
                    videoEl.play().catch(() => { /* autoplay may be blocked - controls remain usable */ });
                }
            });
        }

        /* =========================================================
           Save Draft / Publish (Task #10, #11) - multipart/form-data
           since a video file may be attached; JSON can't carry files.
        ========================================================= */
        function buildFormData() {
            const formData = new FormData();
            formData.append("video_tutorial_id", videoTutorialIdInput ? videoTutorialIdInput.value || "" : "");
            formData.append("video_title", titleInput ? titleInput.value.trim() : "");
            formData.append("category_id", categorySelect ? categorySelect.value : "");
            formData.append("module_id", moduleSelect ? moduleSelect.value : "");
            formData.append("resource_id", lessonSelect ? lessonSelect.value : "");
            syncHiddenDescription();
            formData.append("description", hiddenDescription ? hiddenDescription.value : "");
            if (selectedVideoFile) {
                formData.append("video_file", selectedVideoFile);
            }
            return formData;
        }

        async function submitVideoTutorial(endpoint, isPublish, button) {
            const originalHtml = button ? button.innerHTML : "";
            if (button) {
                button.disabled = true;
                button.innerHTML = isPublish
                    ? '<i class="fa-solid fa-spinner fa-spin"></i> Publishing...'
                    : '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            }

            try {
                const response = await fetch(endpoint, {
                    method: "POST",
                    credentials: "include",
                    body: buildFormData(),
                });
                const result = await response.json();

                if (!result.success) {
                    showPopupAlert(result.message || "Could not save this video tutorial.", "error");
                    return;
                }

                if (videoTutorialIdInput && result.video_tutorial_id) {
                    videoTutorialIdInput.value = result.video_tutorial_id;
                }
                if (result.file_path && existingFilePathInput) {
                    existingFilePathInput.value = result.file_path;
                }
                selectedVideoFile = null;

                if (isPublish) {
                    showSuccessToast(result.message || "Video tutorial published successfully.");
                    setTimeout(() => {
                        window.location.href = "/admin/learning-resources";
                    }, TOAST_DURATION_MS);
                } else {
                    // Task #10: Save Draft must NOT navigate away - the
                    // admin stays on this page (mirroring upload-resource-
                    // draft-guard.js's own performSaveDraft(), which only
                    // shows a toast and keeps editing in place). Only
                    // Publish leaves the page.
                    showSuccessToast(result.message || "Draft saved successfully.");
                }
            } catch (err) {
                showPopupAlert("Could not reach the server. Please try again.", "error");
            } finally {
                if (button) {
                    button.disabled = false;
                    button.innerHTML = originalHtml;
                }
            }
        }

        if (saveDraftBtn) {
            saveDraftBtn.addEventListener("click", () => {
                if (!validateVideoForm(false)) return;
                showConfirmModal(
                    "Are you sure you want to save this draft?",
                    () => submitVideoTutorial("/admin/upload-video-tutorial/save-draft", false, saveDraftBtn),
                    "Save Draft?"
                );
            });
        }

        if (publishBtn) {
            publishBtn.addEventListener("click", () => {
                if (!validateVideoForm(true)) return;
                showConfirmModal(
                    "Are you sure you want to publish this video tutorial?",
                    () => submitVideoTutorial("/admin/upload-video-tutorial/publish", true, publishBtn),
                    "Publish Video Tutorial?"
                );
            });
        }

        /* =========================================================
           Reload support - reopening a previously saved video
           tutorial (Task #45-style: ?video_id= on the GET route).
           The server already pre-selects Category via #videoCategorySelect's
           rendered <option selected>; Module/Lesson still start empty/
           disabled since only the "change" handlers above populate
           them, so kick off the same cascade once on load, mirroring
           create-learning-activity-dependencies.js.
        ========================================================= */
        if (categorySelect && categorySelect.value) {
            const preselectModuleId = moduleSelect ? moduleSelect.dataset.preselectModuleId || "" : "";
            const preselectResourceId = lessonSelect ? lessonSelect.dataset.preselectResourceId || "" : "";
            loadModulesForCategory(categorySelect.value, preselectModuleId, preselectResourceId);
        } else {
            updateVideoInfoPanel();
        }

        if (existingFileUrlInput && existingFileUrlInput.value) {
            showSelectedFile("Previously uploaded video");
            showVideoPreview(existingFileUrlInput.value);
        }
    });
})();