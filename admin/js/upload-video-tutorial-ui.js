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
 *     Underline) via document.execCommand, matched against each
 *     button's existing `title` attribute so no HTML markup has to
 *     change.
 *   - The YouTube Video Link input: validates the pasted link client-
 *     side, extracts its video id, and embeds it as a real, playable
 *     <iframe> injected into the existing .video-preview-player
 *     container - the raw URL is never shown or made clickable, only
 *     the embedded player is, and it plays inline with no click-
 *     through required. No file is ever uploaded to disk/the server.
 *   - The read-only Video Information panel, updated live from the
 *     selected Category/Module/Lesson option text.
 *   - Preview Video: a popup showing the video exactly like the
 *     learner's video step, from the current (even unsaved) form values.
 *   - Save Draft / Publish, each validating through the
 *     SAME custom modal/toast notification pattern already used
 *     elsewhere in this admin (#confirmActionModal, .resource-popup-
 *     alert, .changes-saved-toast) - never a native alert()/confirm()/
 *     prompt().
 *   - Reloading a previously saved video tutorial (via ?video_id=) so
 *     every field, the cascading dropdowns, and the video preview all
 *     come back exactly as they were left.
 *   - feat/publishing-tree: Save never changes the status; the main
 *     button is "Mark Ready" (save + Ready to Publish) - videos go live
 *     from the Publishing page. Opened from the Publishing page, every
 *     save returns there. Move to Draft / Unpublish are handled by
 *     admin-editor-status.js.
 */
(function () {
    "use strict";

    const TOAST_DURATION_MS = 2000;
    const DESC_MAX = 2000;

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

        const videoUrlInput = document.getElementById("videoUrlInput");

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
        const existingVideoIdInput = document.getElementById("existingVideoIdInput");

        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");

        let pendingConfirmAction = null;

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
           YouTube Video Link (Task update: replaces file upload) -
           validates the pasted link client-side and embeds it as a
           real, playable <iframe> injected into the existing
           .video-preview-player container - the raw URL itself is
           never shown or made clickable; only the embedded player is.
        ========================================================= */
        function extractYouTubeVideoId(url) {
            if (!url) return null;
            const match = url.match(
                /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
            );
            return match ? match[1] : null;
        }

        // Injects a real YouTube <iframe> into the existing
        // .video-preview-player container, hiding (never deleting)
        // the original mock placeholder/controls so the default
        // no-link UI is fully preserved and restorable. The iframe
        // plays inline right here - nothing to click through to.
        function showVideoPreview(videoId) {
            if (!previewPlayer) return;
            if (previewPlaceholder) previewPlaceholder.style.display = "none";
            if (previewMockControls) previewMockControls.style.display = "none";

            let iframeEl = document.getElementById("videoPreviewPlayerEl");
            if (!iframeEl) {
                iframeEl = document.createElement("iframe");
                iframeEl.id = "videoPreviewPlayerEl";
                iframeEl.style.width = "100%";
                iframeEl.style.height = "100%";
                iframeEl.style.position = "absolute";
                iframeEl.style.top = "0";
                iframeEl.style.left = "0";
                iframeEl.style.border = "none";
                iframeEl.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
                iframeEl.allowFullscreen = true;
                previewPlayer.appendChild(iframeEl);
            }
            iframeEl.src = `https://www.youtube.com/embed/${videoId}`;
        }

        function clearVideoPreview() {
            const iframeEl = document.getElementById("videoPreviewPlayerEl");
            if (iframeEl) iframeEl.remove();
            if (previewPlaceholder) previewPlaceholder.style.display = "";
            if (previewMockControls) previewMockControls.style.display = "";
        }

        let currentVideoId = null; // the last successfully-validated YouTube video id

        function handleVideoUrlInput() {
            if (!videoUrlInput) return;
            const raw = videoUrlInput.value.trim();
            clearFieldError(videoUrlInput);

            if (!raw) {
                currentVideoId = null;
                clearVideoPreview();
                return;
            }

            const videoId = extractYouTubeVideoId(raw);
            if (!videoId) {
                currentVideoId = null;
                clearVideoPreview();
                return; // don't error-flag while the admin is still mid-typing/pasting
            }

            currentVideoId = videoId;
            showVideoPreview(videoId);
        }

        if (videoUrlInput) {
            videoUrlInput.addEventListener("input", handleVideoUrlInput);
            videoUrlInput.addEventListener("blur", () => {
                const raw = videoUrlInput.value.trim();
                if (raw && !extractYouTubeVideoId(raw)) {
                    setFieldError(videoUrlInput);
                    showPopupAlert("Please paste a valid YouTube video link.", "error");
                }
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
                const hasExistingVideo = !!(existingVideoIdInput && existingVideoIdInput.value);
                const hasVideo = !!currentVideoId || hasExistingVideo;
                if (!hasVideo) {
                    isValid = false;
                    setFieldError(videoUrlInput);
                    firstErrorMsg = firstErrorMsg || "Please add a YouTube video link before publishing.";
                    firstErrorField = firstErrorField || videoUrlInput;
                } else {
                    clearFieldError(videoUrlInput);
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
           Preview Video - opens #videoLearnerPreviewModal, a copy of
           the learner's video step (#videoStep in lesson-content.html),
           filled from the CURRENT form values (saved or not). Never
           submits/publishes. The player is built the same way
           lesson-content.js's setupVideoStep() builds it (YouTube
           IFrame API, playerVars { rel: 0 }) minus the watch-progress
           tracking, and is destroyed on close so the audio stops.
        ========================================================= */
        const learnerPreviewModal = document.getElementById("videoLearnerPreviewModal");
        const learnerPreviewFrame = document.getElementById("videoLearnerPreviewFrame");
        const learnerPreviewTitle = document.getElementById("videoLearnerPreviewTitle");
        const learnerPreviewCloseBtn = document.getElementById("videoLearnerPreviewCloseBtn");

        let learnerPreviewPlayer = null;
        let learnerPreviewToken = 0; // bumped on every open/close so a late API load can't revive a closed popup

        // Same loader as lesson-content.js's loadYouTubeApi().
        let youtubeApiLoadPromise = null;
        function loadYouTubeApi() {
            if (window.YT && window.YT.Player) return Promise.resolve();
            if (youtubeApiLoadPromise) return youtubeApiLoadPromise;
            youtubeApiLoadPromise = new Promise((resolve) => {
                window.onYouTubeIframeAPIReady = resolve;
                const tag = document.createElement("script");
                tag.src = "https://www.youtube.com/iframe_api";
                document.head.appendChild(tag);
            });
            return youtubeApiLoadPromise;
        }

        function isLearnerPreviewOpen() {
            return !!learnerPreviewModal && !learnerPreviewModal.classList.contains("modal-hidden");
        }

        async function openLearnerPreview(videoId, title) {
            if (!learnerPreviewModal || !learnerPreviewFrame) return;
            const token = ++learnerPreviewToken;

            if (learnerPreviewTitle) learnerPreviewTitle.textContent = title || "";
            const playerDiv = document.createElement("div");
            playerDiv.id = "videoLearnerPreviewTarget";
            learnerPreviewFrame.innerHTML = "";
            learnerPreviewFrame.appendChild(playerDiv);
            learnerPreviewModal.classList.remove("modal-hidden");

            await loadYouTubeApi();
            if (token !== learnerPreviewToken) return; // closed while the API was loading

            learnerPreviewPlayer = new YT.Player("videoLearnerPreviewTarget", {
                videoId: videoId,
                playerVars: { rel: 0 },
            });
        }

        function closeLearnerPreview() {
            if (!isLearnerPreviewOpen()) return;
            learnerPreviewToken++;
            if (learnerPreviewPlayer && typeof learnerPreviewPlayer.destroy === "function") {
                learnerPreviewPlayer.destroy();
            }
            learnerPreviewPlayer = null;
            if (learnerPreviewFrame) learnerPreviewFrame.innerHTML = ""; // removes the iframe -> audio stops
            learnerPreviewModal.classList.add("modal-hidden");
        }

        if (learnerPreviewCloseBtn) learnerPreviewCloseBtn.addEventListener("click", closeLearnerPreview);
        if (learnerPreviewModal) {
            learnerPreviewModal.addEventListener("click", (e) => {
                if (e.target === learnerPreviewModal) closeLearnerPreview();
            });
        }
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && isLearnerPreviewOpen()) closeLearnerPreview();
        });

        if (previewBtn) {
            previewBtn.addEventListener("click", () => {
                const videoId = extractYouTubeVideoId(videoUrlInput ? videoUrlInput.value.trim() : "");
                if (!videoId) {
                    showInfoModal("Add a valid YouTube link to preview the video.", "Cannot Preview Yet");
                    return;
                }
                // Learners see the title as the server saves it:
                // video_tutorials.format_video_title() - trimmed, first
                // letter uppercase, the rest exactly as typed.
                const rawTitle = titleInput ? titleInput.value.trim() : "";
                const title = rawTitle ? rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1) : "";
                openLearnerPreview(videoId, title);
            });
        }

        /* =========================================================
           Save Draft / Publish (Task #10, #11) - multipart/form-data
           since a YouTube link is plain text - no file to carry, so no
           multipart/form-data needed anymore.
        ========================================================= */
        function buildPayload() {
            syncHiddenDescription();
            return {
                video_tutorial_id: videoTutorialIdInput ? videoTutorialIdInput.value || "" : "",
                video_title: titleInput ? titleInput.value.trim() : "",
                category_id: categorySelect ? categorySelect.value : "",
                module_id: moduleSelect ? moduleSelect.value : "",
                resource_id: lessonSelect ? lessonSelect.value : "",
                description: hiddenDescription ? hiddenDescription.value : "",
                video_url: currentVideoId ? `https://www.youtube.com/watch?v=${currentVideoId}` : "",
            };
        }

        async function submitVideoTutorial(endpoint, isPublish, button) {
            const originalHtml = button ? button.innerHTML : "";
            if (button) {
                button.disabled = true;
                button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            }

            try {
                const response = await fetch(endpoint, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(buildPayload()),
                });
                const result = await response.json();

                // feat/publishing-tree: keep the id even when only the
                // "mark ready" step failed - the video itself was saved,
                // so the next save must update it, not create a second one.
                if (videoTutorialIdInput && result.video_tutorial_id) {
                    videoTutorialIdInput.value = result.video_tutorial_id;
                }

                if (!result.success) {
                    showPopupAlert(result.message || "Could not save this video tutorial.", "error");
                    return;
                }
                if (currentVideoId && existingVideoIdInput) {
                    existingVideoIdInput.value = currentVideoId;
                }

                const savedVideoId = videoTutorialIdInput ? videoTutorialIdInput.value : "";
                const backUrl = window.cobraEditorReturnUrl ? window.cobraEditorReturnUrl("", "video", savedVideoId) : "";
                if (isPublish) {
                    showSuccessToast(result.message || "Video tutorial saved and marked as Ready to Publish.");
                    setTimeout(() => {
                        window.location.href = window.cobraEditorReturnUrlForTab
                            ? window.cobraEditorReturnUrlForTab("/admin/learning-resources", "ready", "video", savedVideoId)
                            : "/admin/learning-resources";
                    }, TOAST_DURATION_MS);
                } else if (backUrl) {
                    // feat/publishing-tree: opened from the Publishing page -> go back there.
                    showSuccessToast(result.message || "Video tutorial saved successfully.");
                    setTimeout(() => { window.location.href = backUrl; }, TOAST_DURATION_MS);
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
                const isPublished = saveDraftBtn.dataset.status === "Published";
                showConfirmModal(
                    isPublished
                        ? "Save your changes? This video is live, so learners will see them right away."
                        : "Save your changes to this video tutorial?",
                    () => submitVideoTutorial("/admin/upload-video-tutorial/save-draft", false, saveDraftBtn),
                    "Save Changes?"
                );
            });
        }

        if (publishBtn) {
            publishBtn.addEventListener("click", () => {
                if (!validateVideoForm(true)) return;
                showConfirmModal(
                    "Save this video and mark it Ready to Publish? It goes live when it's published on the Publishing page.",
                    () => submitVideoTutorial("/admin/upload-video-tutorial/publish", true, publishBtn),
                    "Mark Ready?"
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

        if (existingVideoIdInput && existingVideoIdInput.value) {
            currentVideoId = existingVideoIdInput.value;
            if (videoUrlInput) videoUrlInput.value = `https://www.youtube.com/watch?v=${currentVideoId}`;
            showVideoPreview(currentVideoId);
        }
    });
})();
