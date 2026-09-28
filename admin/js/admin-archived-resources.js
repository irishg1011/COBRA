/**
 * admin-archived-resources.js - Task #117: Dedicated Archive Modal for Learning Resources
 * --------------------------------------------------------------------------------------
 * Manages the Learning Resources tabbed archive modal:
 *   - Tab 1: Lesson Content
 *   - Tab 2: Video Tutorial
 *   - Real-time debounced search per active tab
 *   - Independent pagination
 *   - Restore action (reverts status to Draft)
 *   - Permanent Delete action (with confirmation prompt)
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 300;

    document.addEventListener("DOMContentLoaded", () => {
        const openBtn = document.getElementById("openArchivedResourcesBtn");
        const modal = document.getElementById("archivedResourcesModal");
        const closeBtn = document.getElementById("closeArchivedResourcesModal");
        const searchInput = document.getElementById("archivedResourceSearchInput");

        const toggleLessonContentBtn = document.getElementById("toggleArchivedLessonContentBtn");
        const toggleVideoTutorialBtn = document.getElementById("toggleArchivedVideoTutorialBtn");

        const lessonContentView = document.getElementById("archivedLessonContentView");
        const videoTutorialView = document.getElementById("archivedVideoTutorialView");

        const lessonContentTableBody = document.getElementById("archivedLessonContentTableBody");
        const lessonContentShowingCount = document.getElementById("archivedLessonContentShowingCount");
        const lessonContentPageLabel = document.getElementById("archivedLessonContentPageLabel");
        const lessonContentPrevBtn = document.getElementById("archivedLessonContentPrevBtn");
        const lessonContentNextBtn = document.getElementById("archivedLessonContentNextBtn");

        const videoTutorialTableBody = document.getElementById("archivedVideoTutorialTableBody");
        const videoTutorialShowingCount = document.getElementById("archivedVideoTutorialShowingCount");
        const videoTutorialPageLabel = document.getElementById("archivedVideoTutorialPageLabel");
        const videoTutorialPrevBtn = document.getElementById("archivedVideoTutorialPrevBtn");
        const videoTutorialNextBtn = document.getElementById("archivedVideoTutorialNextBtn");

        if (!modal || !openBtn) return;

        // ------------------------------------------------------------
        // Shared confirm/alert modal (#confirmActionModal) - replaces
        // this file's previous native confirm()/alert() calls, matching
        // the same styled-modal convention used everywhere else in
        // this admin.
        // ------------------------------------------------------------
        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");
        let pendingConfirmAction = null;

        function closeSharedModal() {
            if (confirmActionModal) {
                confirmActionModal.classList.add("modal-hidden");
                confirmActionModal.style.display = "none";
            }
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
            pendingConfirmAction = null;
        }

        function showAlertModal(message, title = "Notice") {
            if (!confirmActionModal) { alert(message); return; }
            pendingConfirmAction = null;
            if (confirmActionTitle) confirmActionTitle.textContent = title;
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "none";
            if (confirmActionConfirmBtn) {
                confirmActionConfirmBtn.textContent = "OK";
                confirmActionConfirmBtn.className = "modal-btn-save";
            }
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        function showConfirmModal(message, onConfirm, title = "Confirm Action") {
            if (!confirmActionModal) { if (window.confirm(message)) onConfirm(); return; }
            pendingConfirmAction = onConfirm;
            if (confirmActionTitle) confirmActionTitle.textContent = title;
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
            if (confirmActionConfirmBtn) {
                confirmActionConfirmBtn.textContent = "Confirm";
                confirmActionConfirmBtn.className = "modal-btn-save";
            }
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        if (confirmActionCancelBtn) confirmActionCancelBtn.addEventListener("click", closeSharedModal);
        if (confirmActionConfirmBtn) {
            confirmActionConfirmBtn.addEventListener("click", () => {
                const action = pendingConfirmAction;
                closeSharedModal();
                if (typeof action === "function") action();
            });
        }
        if (confirmActionModal) {
            confirmActionModal.addEventListener("click", (e) => {
                if (e.target === confirmActionModal) closeSharedModal();
            });
        }

        let activeTab = "lesson_content"; // "lesson_content" | "video_tutorial"
        let lessonPage = 1;
        let lessonTotalPages = 1;
        let videoPage = 1;
        let videoTotalPages = 1;
        let debounceTimer = null;
        let activeRequestId = 0;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function setArchiveTab(tab) {
            activeTab = tab;
            if (toggleLessonContentBtn) toggleLessonContentBtn.classList.toggle("active", tab === "lesson_content");
            if (toggleVideoTutorialBtn) toggleVideoTutorialBtn.classList.toggle("active", tab === "video_tutorial");

            if (lessonContentView) lessonContentView.style.display = (tab === "lesson_content") ? "block" : "none";
            if (videoTutorialView) videoTutorialView.style.display = (tab === "video_tutorial") ? "block" : "none";

            if (searchInput) {
                searchInput.placeholder = (tab === "lesson_content")
                    ? "Search archived lesson content..."
                    : "Search archived video tutorials...";
                searchInput.value = "";
            }

            if (tab === "lesson_content") {
                lessonPage = 1;
                loadArchivedLessonContent();
            } else {
                videoPage = 1;
                loadArchivedVideoTutorials();
            }
        }

        if (toggleLessonContentBtn) {
            toggleLessonContentBtn.addEventListener("click", () => setArchiveTab("lesson_content"));
        }
        if (toggleVideoTutorialBtn) {
            toggleVideoTutorialBtn.addEventListener("click", () => setArchiveTab("video_tutorial"));
        }

        function renderRows(items, tableBody, emptyMessage) {
            if (!tableBody) return;
            if (!items || items.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">${emptyMessage}</td></tr>`;
                return;
            }

            tableBody.innerHTML = items.map(r => `
                <tr data-resource-id="${r.resource_id}">
                    <td>
                        <strong class="table-item-title cell-truncate">${escapeHtml(r.resource_title)}</strong>
                    </td>
                    <td class="text-muted"><span class="cell-truncate cell-truncate--sm">${escapeHtml(r.category)}</span></td>
                    <td class="text-muted"><span class="cell-truncate cell-truncate--sm">${escapeHtml(r.module)}</span></td>
                    <td><span class="badge badge-inactive">Archived</span></td>
                    <td class="text-muted">${escapeHtml(r.updated_at)}</td>
                    <td class="text-right">
                        <div class="table-actions-group">
                            <a href="#" title="Restore" class="archive-action-icon restore-action js-restore-resource" data-id="${r.resource_id}">
                                <i class="fa-solid fa-rotate-left"></i>
                            </a>
                            <a href="#" title="Permanently Delete" class="archive-action-icon delete-action js-permanent-delete-resource" data-id="${r.resource_id}">
                                <i class="fa-solid fa-trash-can"></i>
                            </a>
                        </div>
                    </td>
                </tr>
            `).join("");
        }

        async function loadArchivedLessonContent() {
            if (!lessonContentTableBody) return;
            const requestId = ++activeRequestId;
            const q = searchInput ? searchInput.value.trim() : "";
            try {
                const resp = await fetch(`/admin/learning-resources/archived?type=Lesson%20Content&q=${encodeURIComponent(q)}&page=${lessonPage}`, {
                    credentials: "include"
                });
                const result = await resp.json();
                if (requestId !== activeRequestId) return;

                if (!result.success) {
                    lessonContentTableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not load archived lesson content.</td></tr>`;
                    return;
                }

                renderRows(result.resources, lessonContentTableBody, "No archived lesson content found.");
                lessonPage = result.page;
                lessonTotalPages = result.total_pages;

                if (lessonContentShowingCount) lessonContentShowingCount.textContent = `Showing ${result.resources.length} of ${result.total} Archived Resources`;
                if (lessonContentPageLabel) lessonContentPageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (lessonContentPrevBtn) lessonContentPrevBtn.disabled = result.page <= 1;
                if (lessonContentNextBtn) lessonContentNextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== activeRequestId) return;
                lessonContentTableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not reach the server.</td></tr>`;
            }
        }

        async function loadArchivedVideoTutorials() {
            if (!videoTutorialTableBody) return;
            const requestId = ++activeRequestId;
            const q = searchInput ? searchInput.value.trim() : "";
            try {
                const resp = await fetch(`/admin/learning-resources/archived?type=Video%20Tutorial&q=${encodeURIComponent(q)}&page=${videoPage}`, {
                    credentials: "include"
                });
                const result = await resp.json();
                if (requestId !== activeRequestId) return;

                if (!result.success) {
                    videoTutorialTableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not load archived video tutorials.</td></tr>`;
                    return;
                }

                renderRows(result.resources, videoTutorialTableBody, "No archived video tutorials found.");
                videoPage = result.page;
                videoTotalPages = result.total_pages;

                if (videoTutorialShowingCount) videoTutorialShowingCount.textContent = `Showing ${result.resources.length} of ${result.total} Archived Resources`;
                if (videoTutorialPageLabel) videoTutorialPageLabel.textContent = `${result.page} of ${result.total_pages}`;
                if (videoTutorialPrevBtn) videoTutorialPrevBtn.disabled = result.page <= 1;
                if (videoTutorialNextBtn) videoTutorialNextBtn.disabled = result.page >= result.total_pages;
            } catch (err) {
                if (requestId !== activeRequestId) return;
                videoTutorialTableBody.innerHTML = `<tr><td colspan="6" class="text-muted table-empty-message">Could not reach the server.</td></tr>`;
            }
        }

        function scheduleLoad(resetPage = true) {
            if (activeTab === "lesson_content") {
                if (resetPage) lessonPage = 1;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(loadArchivedLessonContent, DEBOUNCE_MS);
            } else {
                if (resetPage) videoPage = 1;
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(loadArchivedVideoTutorials, DEBOUNCE_MS);
            }
        }

        if (openBtn) {
            openBtn.addEventListener("click", () => {
                modal.style.display = "flex";
                setArchiveTab("lesson_content");
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener("click", () => { modal.style.display = "none"; });
        }

        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.style.display = "none";
        });

        if (searchInput) {
            searchInput.addEventListener("input", () => scheduleLoad(true));
        }

        if (lessonContentPrevBtn) {
            lessonContentPrevBtn.addEventListener("click", () => {
                if (lessonPage > 1) { lessonPage--; loadArchivedLessonContent(); }
            });
        }
        if (lessonContentNextBtn) {
            lessonContentNextBtn.addEventListener("click", () => {
                if (lessonPage < lessonTotalPages) { lessonPage++; loadArchivedLessonContent(); }
            });
        }

        if (videoTutorialPrevBtn) {
            videoTutorialPrevBtn.addEventListener("click", () => {
                if (videoPage > 1) { videoPage--; loadArchivedVideoTutorials(); }
            });
        }
        if (videoTutorialNextBtn) {
            videoTutorialNextBtn.addEventListener("click", () => {
                if (videoPage < videoTotalPages) { videoPage++; loadArchivedVideoTutorials(); }
            });
        }

        function refreshMainResourcesTable() {
            const mainSearch = document.getElementById("resourceSearchInput");
            if (mainSearch) {
                mainSearch.dispatchEvent(new Event("input"));
            } else {
                window.location.reload();
            }
        }

        function handleActionClick(e) {
            const restoreBtn = e.target.closest(".js-restore-resource");
            const deleteBtn = e.target.closest(".js-permanent-delete-resource");
            const typeParam = activeTab === "video_tutorial" ? "Video Tutorial" : "Lesson Content";

            if (restoreBtn) {
                e.preventDefault();
                const id = restoreBtn.dataset.id;
                showConfirmModal("Are you sure you want to restore this resource?", async () => {
                    restoreBtn.style.pointerEvents = "none";
                    try {
                        const resp = await fetch(`/admin/learning-resources/${id}/restore?type=${encodeURIComponent(typeParam)}`, {
                            method: "POST",
                            credentials: "include"
                        });
                        const result = await resp.json();
                        if (!result.success) {
                            showAlertModal(result.message || "Could not restore resource.", "Error");
                        } else {
                            showAlertModal(result.message || "Resource restored successfully.", "Restored");
                            if (activeTab === "lesson_content") {
                                loadArchivedLessonContent();
                                // Task #124: only the Lesson Content tab
                                // maps to an actual row in the main
                                // Resources table - restoring a Video
                                // Tutorial alone doesn't reveal a new row,
                                // just an icon on its already-active
                                // parent Lesson, so there's nothing
                                // distinct to flash in that case.
                                window.cobraByteHighlightRestoredId = id;
                            } else {
                                loadArchivedVideoTutorials();
                            }
                            refreshMainResourcesTable();
                        }
                    } catch (err) {
                        showAlertModal("Could not reach the server. Please try again.", "Error");
                    } finally {
                        restoreBtn.style.pointerEvents = "";
                    }
                }, "Restore Resource?");
                return;
            }

            if (deleteBtn) {
                e.preventDefault();
                const id = deleteBtn.dataset.id;
                showConfirmModal(
                    "Are you sure you want to permanently delete this resource? " +
                    "This action cannot be undone and will permanently remove the item from the system.",
                    async () => {
                        deleteBtn.style.pointerEvents = "none";
                        try {
                            const resp = await fetch(`/admin/learning-resources/${id}/permanent-delete?type=${encodeURIComponent(typeParam)}`, {
                                method: "POST",
                                credentials: "include"
                            });
                            const result = await resp.json();
                            if (!result.success) {
                                showAlertModal(result.message || "Could not permanently delete resource.", "Error");
                            } else {
                                showAlertModal(result.message || "Resource permanently deleted.", "Deleted");
                                if (activeTab === "lesson_content") loadArchivedLessonContent();
                                else loadArchivedVideoTutorials();
                            }
                        } catch (err) {
                            showAlertModal("Could not reach the server. Please try again.", "Error");
                        } finally {
                            deleteBtn.style.pointerEvents = "";
                        }
                    },
                    "Permanently Delete Resource?"
                );
            }
        }

        if (lessonContentTableBody) {
            lessonContentTableBody.addEventListener("click", handleActionClick);
        }
        if (videoTutorialTableBody) {
            videoTutorialTableBody.addEventListener("click", handleActionClick);
        }
    });
})();
