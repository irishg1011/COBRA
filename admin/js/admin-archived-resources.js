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
                        <strong class="table-item-title">${escapeHtml(r.resource_title)}</strong>
                    </td>
                    <td class="text-muted">${escapeHtml(r.category)}</td>
                    <td class="text-muted">${escapeHtml(r.module)}</td>
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

        async function handleActionClick(e) {
            const restoreBtn = e.target.closest(".js-restore-resource");
            const deleteBtn = e.target.closest(".js-permanent-delete-resource");

            if (restoreBtn) {
                e.preventDefault();
                const id = restoreBtn.dataset.id;
                if (!confirm("Are you sure you want to restore this resource?")) return;

                restoreBtn.style.pointerEvents = "none";
                try {
                    const resp = await fetch(`/admin/learning-resources/${id}/restore`, {
                        method: "POST",
                        credentials: "include"
                    });
                    const result = await resp.json();
                    if (!result.success) {
                        alert(result.message || "Could not restore resource.");
                    } else {
                        alert(result.message || "Resource restored successfully.");
                        if (activeTab === "lesson_content") loadArchivedLessonContent();
                        else loadArchivedVideoTutorials();
                        refreshMainResourcesTable();
                    }
                } catch (err) {
                    alert("Could not reach the server. Please try again.");
                } finally {
                    restoreBtn.style.pointerEvents = "";
                }
                return;
            }

            if (deleteBtn) {
                e.preventDefault();
                const id = deleteBtn.dataset.id;
                const confirmed = confirm(
                    "Are you sure you want to permanently delete this resource? " +
                    "This action cannot be undone and will permanently remove the item from the system."
                );
                if (!confirmed) return;

                deleteBtn.style.pointerEvents = "none";
                try {
                    const resp = await fetch(`/admin/learning-resources/${id}/permanent-delete`, {
                        method: "POST",
                        credentials: "include"
                    });
                    const result = await resp.json();
                    if (!result.success) {
                        alert(result.message || "Could not permanently delete resource.");
                    } else {
                        alert(result.message || "Resource permanently deleted.");
                        if (activeTab === "lesson_content") loadArchivedLessonContent();
                        else loadArchivedVideoTutorials();
                    }
                } catch (err) {
                    alert("Could not reach the server. Please try again.");
                } finally {
                    deleteBtn.style.pointerEvents = "";
                }
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
