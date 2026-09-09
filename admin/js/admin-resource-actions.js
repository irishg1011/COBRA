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
        function actionsHtml(resourceId, editUrl, status, videoEditUrl) {
            const href = editUrl || `/admin/upload-resource?resource_id=${encodeURIComponent(resourceId)}`;
            const statusAttr = status ? ` data-status="${escapeHtml(status)}"` : "";
            const videoAttr = videoEditUrl ? ` data-video-edit-url="${escapeHtml(videoEditUrl)}"` : "";
            return `
                <div class="table-actions-group">
                    <button type="button" title="Edit" class="table-action-icon js-edit-resource-trigger"
                       data-resource-id="${resourceId}" data-edit-url="${escapeHtml(href)}"${statusAttr}${videoAttr}>
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <a href="#" title="Archive"
                       class="table-action-icon delete-action js-archive-resource-btn"
                       data-resource-id="${resourceId}">
                        <i class="fa-solid fa-box-archive"></i>
                    </a>
                </div>`;
        }

        window.cobraByteResourceActions = { actionsHtml };

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

            const archiveBtn = e.target.closest(".js-archive-resource-btn");
            if (!archiveBtn) return;
            e.preventDefault();

            const resourceId = archiveBtn.dataset.resourceId;
            if (!resourceId) return;

            const confirmMsg = "Are you sure you want to archive this resource? " +
                "It will be removed from active use, but its content is preserved.";
            const confirmTitle = "Archive Resource?";

            showConfirmModal(confirmMsg, async () => {
                const icon = archiveBtn.querySelector("i");
                const originalClass = icon ? icon.className : "";
                if (icon) icon.className = "fa-solid fa-spinner fa-spin";
                archiveBtn.style.pointerEvents = "none";

                try {
                    const response = await fetch(`/admin/learning-resources/${resourceId}/archive`, {
                        method: "POST",
                        credentials: "include",
                    });
                    const result = await response.json();

                    if (!result.success) {
                        alert(result.message || "Could not archive this resource.");
                        if (icon) icon.className = originalClass;
                        archiveBtn.style.pointerEvents = "";
                        return;
                    }

                    // Row no longer belongs in the active list - remove it
                    // in place rather than a full page reload, same UX as
                    // admin-manage-course.js's own archive-module flow.
                    const row = archiveBtn.closest("tr");
                    if (row) row.remove();

                    if (!tableBody.querySelector("tr")) {
                        tableBody.innerHTML = `
                            <tr>
                                <td colspan="9" class="text-muted table-empty-message">
                                    No resources found.
                                </td>
                            </tr>`;
                    }
                } catch (err) {
                    alert("Could not reach the server. Please try again.");
                    if (icon) icon.className = originalClass;
                    archiveBtn.style.pointerEvents = "";
                }
            }, confirmTitle);
        });
    });
})();