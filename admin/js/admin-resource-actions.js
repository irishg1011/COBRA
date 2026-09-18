/**
 * admin-resource-actions.js - Manage Learning Resources ACTIONS column
 * (Edit / Archive) & Published Edit Interception
 * --------------------------------------------------------------------
 * Wires up the ACTIONS column in the Manage Learning Resources table
 * (learning-resources.html), which handles Edit + Archive.
 *
 * Task update: the Edit (pencil) button no longer navigates directly -
 * it opens a small dropdown ("Edit lesson content" / "Edit video")
 * next to it, since a Lesson can now have a Video Tutorial attached in
 * addition to its own text content. A Lesson with no video attached
 * only ever shows the single "Edit lesson content" option (there's
 * nothing else to choose between). Whichever option is picked still
 * goes through the SAME "Published? confirm first" interception as
 * before, using the Lesson's own status.
 *
 * Archive calls the /admin/learning-resources/<id>/archive
 * endpoint (see admin_routes.py -> resource_publishing.archive_resource()),
 * mirroring admin-manage-course.js's own archive-module confirm/fetch
 * pattern for consistency.
 *
 * Uses event delegation on #resourcesTableBody so it keeps working
 * after admin-learning-resources.js re-renders the table body during a
 * live search/filter/page change - no re-binding required.
 *
 * Include this on learning-resources.html, right after
 * admin-learning-resources.js and before admin-resource-publish.js.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const tableBody = document.getElementById("resourcesTableBody");
        if (!tableBody) return; // not on this page

        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");

        let pendingConfirmAction = null;
        let openEditMenu = null;

        function showConfirmModal(message, onConfirm, title) {
            if (!confirmActionModal) {
                if (window.confirm(message)) onConfirm();
                return;
            }
            pendingConfirmAction = onConfirm;
            if (confirmActionTitle) confirmActionTitle.textContent = title || "Confirm Action";
            if (confirmActionText) confirmActionText.textContent = message;
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        function closeConfirmModal() {
            if (confirmActionModal) {
                confirmActionModal.classList.add("modal-hidden");
                confirmActionModal.style.display = "none";
            }
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

        function closeEditMenu() {
            if (openEditMenu) {
                openEditMenu.remove();
                openEditMenu = null;
            }
        }

        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return;
            if (confirmActionModal && !confirmActionModal.classList.contains("modal-hidden") && confirmActionModal.style.display !== "none") {
                closeConfirmModal();
            }
            if (openEditMenu) closeEditMenu();
        });

        // Closes the Edit dropdown on any click outside it (the trigger
        // click itself is handled separately below via stopPropagation,
        // so it doesn't immediately re-close the menu it just opened).
        document.addEventListener("click", (e) => {
            if (openEditMenu && !openEditMenu.contains(e.target)) {
                closeEditMenu();
            }
        });

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        function navigateWithPublishedCheck(targetUrl, isPublished) {
            if (isPublished) {
                showConfirmModal(
                    "You are about to edit a published resource. Do you wish to continue?",
                    () => { window.location.href = targetUrl; },
                    "Edit Published Resource?"
                );
            } else {
                window.location.href = targetUrl;
            }
        }

        /**
         * Opens the small "what do you want to edit?" dropdown below the
         * Edit (pencil) trigger - Task update: a Lesson with a Video
         * Tutorial attached now offers a choice ("Edit lesson content" /
         * "Edit video") instead of jumping straight to the lesson
         * editor; a Lesson with no video attached only ever shows the
         * single "Edit lesson content" option, since there's nothing
         * else to choose between.
         */
        function openEditMenuFor(trigger) {
            closeEditMenu();

            const editUrl = trigger.dataset.editUrl;
            const videoEditUrl = trigger.dataset.videoEditUrl;
            const isPublished = (trigger.dataset.status || "").trim().toLowerCase() === "published";

            const menu = document.createElement("div");
            menu.className = "resource-edit-menu";

            const lessonItem = document.createElement("button");
            lessonItem.type = "button";
            lessonItem.className = "resource-edit-menu-item";
            lessonItem.innerHTML = '<i class="fa-regular fa-file-lines"></i> Edit lesson content';
            lessonItem.addEventListener("click", (e) => {
                e.stopPropagation();
                closeEditMenu();
                navigateWithPublishedCheck(editUrl, isPublished);
            });
            menu.appendChild(lessonItem);

            if (videoEditUrl) {
                const videoItem = document.createElement("button");
                videoItem.type = "button";
                videoItem.className = "resource-edit-menu-item";
                videoItem.innerHTML = '<i class="fa-solid fa-circle-play"></i> Edit video';
                videoItem.addEventListener("click", (e) => {
                    e.stopPropagation();
                    closeEditMenu();
                    navigateWithPublishedCheck(videoEditUrl, isPublished);
                });
                menu.appendChild(videoItem);
            }

            document.body.appendChild(menu);

            const rect = trigger.getBoundingClientRect();
            const menuWidth = menu.offsetWidth;
            menu.style.top = `${rect.bottom + 6}px`;
            // Right-align to the trigger by default so the menu never
            // spills off the table's right edge; falls back to
            // left-aligned only if that would push it off-screen left.
            let left = rect.right - menuWidth;
            if (left < 8) left = rect.left;
            menu.style.left = `${left}px`;

            openEditMenu = menu;
        }

        /**
         * Builds the ACTIONS cell's inner markup (Edit trigger + Archive
         * button) for a given resource. Exposed globally so
         * admin-learning-resources.js's renderRows() can build the
         * exact same markup for live-search/filter/page results,
         * without duplicating this logic a second time in that file.
         *
         * videoEditUrl (optional): when the Lesson has a Video Tutorial
         * attached, this is its edit URL - the Edit dropdown then offers
         * BOTH "Edit lesson content" and "Edit video"; omitted/falsy
         * means only "Edit lesson content" is offered.
         */
        function actionsHtml(resourceId, editUrl, status, videoEditUrl, videoTutorialId, videoStatus) {
            const href = editUrl || `/admin/upload-resource?resource_id=${encodeURIComponent(resourceId)}`;
            const statusAttr = status ? ` data-status="${escapeHtml(status)}"` : "";
            const videoAttr = videoEditUrl ? ` data-video-edit-url="${escapeHtml(videoEditUrl)}"` : "";
            const videoIdAttr = videoTutorialId ? ` data-video-tutorial-id="${escapeHtml(String(videoTutorialId))}"` : "";
            const videoStatusAttr = videoTutorialId ? ` data-video-status="${escapeHtml(videoStatus || 'Draft')}"` : "";
            return `
                <div class="table-actions-group">
                    <button type="button" title="Edit" class="table-action-icon js-edit-resource-trigger"
                       data-resource-id="${resourceId}" data-edit-url="${escapeHtml(href)}"${statusAttr}${videoAttr}>
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button type="button" title="Archive"
                       class="table-action-icon delete-action js-archive-resource-trigger"
                       data-resource-id="${resourceId}"${statusAttr}${videoIdAttr}${videoStatusAttr}>
                        <i class="fa-solid fa-box-archive"></i>
                    </button>
                </div>`;
        }

        window.cobraByteResourceActions = { actionsHtml };

        /**
         * Archive checklist modal - "Lesson Content" is always offered
         * (archives via the EXISTING /admin/learning-resources/<id>/
         * archive route, unchanged); "Video Tutorial" only appears when
         * this Lesson actually has one attached (archives via the new
         * /admin/upload-video-tutorial/<id>/archive route,
         * independent of the Lesson's own status). A "Select all"
         * toggle checks every option at once for convenience - it is
         * not a separate third archive action, just a shortcut for
         * checking everything shown.
         */
        function openResourceArchiveChecklist(resourceId, videoTutorialId, resourceStatus, videoStatus, row) {
            let overlay = document.getElementById("resourceArchiveModalOverlay");
            if (overlay) overlay.remove();

            const options = [
                { key: "lesson", label: "Lesson Content", icon: "fa-regular fa-file-lines", status: resourceStatus },
            ];
            if (videoTutorialId) {
                options.push({ key: "video", label: "Video Tutorial", icon: "fa-solid fa-circle-play", status: videoStatus });
            }

            const itemsHtml = options.map((o) => `
                <label class="archive-checklist-item">
                    <input type="checkbox" class="archive-checklist-checkbox" value="${o.key}">
                    <span><i class="${o.icon}"></i> ${escapeHtml(o.label)}${o.status === "Published" ? ' <span style="color:#b45309; font-weight:600;">(Published)</span>' : ""}</span>
                </label>
            `).join("");

            // Task #120: Lesson/Category context, read straight from this
            // row's own cells (Resource, Content, Category, in that column
            // order) - no fetch, no backend change needed. Shown once,
            // since every option listed here belongs to this same Lesson.
            const contextParts = row
                ? [row.cells[2] ? row.cells[2].textContent.trim() : "", row.cells[0] ? row.cells[0].textContent.trim() : ""]
                    .filter((part) => part && part !== "—")
                : [];
            const contextHtml = contextParts.length
                ? `<p style="margin: 0 0 16px; padding: 8px 12px; background: #f1f5f9; border-radius: 8px; font-size: 13px; color: #475569;">
                       <i class="fa-solid fa-location-dot" style="margin-right: 6px; color: #64748b;"></i>${contextParts.map(escapeHtml).join(" &rsaquo; ")}
                   </p>`
                : "";

            overlay = document.createElement("div");
            overlay.id = "resourceArchiveModalOverlay";
            overlay.className = "modal-overlay";
            overlay.innerHTML = `
                <div class="content-preview-card" style="max-width: 420px;">
                    <div class="content-preview-header">
                        <strong>Archive which content?</strong>
                        <button type="button" id="resourceArchiveCloseBtn" class="modal-close-btn" style="position: static; font-size: 22px;" title="Close">&times;</button>
                    </div>
                    <div class="content-preview-body">
                        ${contextHtml}
                        ${options.length > 1 ? `
                        <label class="archive-checklist-item archive-checklist-select-all">
                            <input type="checkbox" id="resourceArchiveSelectAll">
                            <span><strong>All</strong></span>
                        </label>` : ""}
                        ${itemsHtml}
                        <div style="margin-top: 18px; display: flex; justify-content: flex-end; gap: 10px;">
                            <button type="button" class="modal-btn-cancel" id="resourceArchiveCancelBtn">Cancel</button>
                            <button type="button" class="modal-btn-save" id="resourceArchiveConfirmBtn">Archive Selected</button>

                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            function closeModal() { overlay.remove(); }
            overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
            overlay.querySelector("#resourceArchiveCloseBtn").addEventListener("click", closeModal);
            overlay.querySelector("#resourceArchiveCancelBtn").addEventListener("click", closeModal);

            const selectAll = overlay.querySelector("#resourceArchiveSelectAll");
            const checkboxes = Array.from(overlay.querySelectorAll(".archive-checklist-checkbox"));
            if (selectAll) {
                selectAll.addEventListener("change", () => {
                    checkboxes.forEach((cb) => { cb.checked = selectAll.checked; });
                });
            }

            async function performArchive(selectedKeys) {
                const confirmBtn = overlay.querySelector("#resourceArchiveConfirmBtn");
                confirmBtn.disabled = true;
                confirmBtn.textContent = "Archiving...";

                const requests = [];
                if (selectedKeys.includes("lesson")) {
                    requests.push(fetch(`/admin/learning-resources/${resourceId}/archive`, { method: "POST", credentials: "include" }));
                }
                if (selectedKeys.includes("video") && videoTutorialId) {
                    requests.push(fetch(`/admin/upload-video-tutorial/${videoTutorialId}/archive`, { method: "POST", credentials: "include" }));
                }

                try {
                    await Promise.all(requests);
                } catch (err) {
                    // Best-effort - the row's own state below reflects
                    // whatever the table shows on next reload regardless.
                }

                closeModal();

                if (selectedKeys.includes("lesson")) {
                    // The Lesson itself was archived - it disappears from
                    // the active list entirely, video or not.
                    if (row) row.remove();
                } else {
                    // Only the video was archived - the Lesson row stays,
                    // just without its video icon/edit option. A full
                    // reload is the simplest correct way to reflect that.
                    window.location.reload();
                }
            }

            overlay.querySelector("#resourceArchiveConfirmBtn").addEventListener("click", () => {
                const selectedKeys = checkboxes.filter((cb) => cb.checked).map((cb) => cb.value);
                if (selectedKeys.length === 0) {
                    closeModal();
                    return;
                }

                // Published-state interception, same rule as Edit: archiving
                // Draft content proceeds immediately; archiving anything
                // currently Published requires an explicit confirm first.
                // Task fix: closes THIS checklist overlay before opening
                // the shared confirm modal, rather than stacking them -
                // both use the same .modal-overlay z-index, and since
                // #confirmActionModal is a static element already in the
                // DOM at page load while this checklist is appended later
                // at runtime, the checklist would otherwise always paint
                // on top and silently hide the confirm dialog underneath it.
                const publishedSelections = options.filter((o) => selectedKeys.includes(o.key) && o.status === "Published");
                if (publishedSelections.length > 0) {
                    const names = publishedSelections.map((o) => o.label).join(" and ");
                    closeModal();
                    showConfirmModal(
                        `You are about to archive published content (${names}). Do you wish to continue?`,
                        () => performArchive(selectedKeys),
                        "Archive Published Content?"
                    );
                } else {
                    performArchive(selectedKeys);
                }
            });
        }

        tableBody.addEventListener("click", async (e) => {
            const editTrigger = e.target.closest(".js-edit-resource-trigger");
            if (editTrigger) {
                e.preventDefault();
                e.stopPropagation();
                if (openEditMenu && openEditMenu._trigger === editTrigger) {
                    closeEditMenu();
                } else {
                    openEditMenuFor(editTrigger);
                    if (openEditMenu) openEditMenu._trigger = editTrigger;
                }
                return;
            }

            const archiveTrigger = e.target.closest(".js-archive-resource-trigger");
            if (!archiveTrigger) return;
            e.preventDefault();

            const resourceId = archiveTrigger.dataset.resourceId;
            if (!resourceId) return;
            const videoTutorialId = archiveTrigger.dataset.videoTutorialId || null;
            const resourceStatus = archiveTrigger.dataset.status || "Draft";
            const videoStatus = archiveTrigger.dataset.videoStatus || "Draft";

            openResourceArchiveChecklist(resourceId, videoTutorialId, resourceStatus, videoStatus, archiveTrigger.closest("tr"));
        });
    });
})();