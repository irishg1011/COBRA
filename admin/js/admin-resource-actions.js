/**
 * admin-resource-actions.js - Task #81 & #98: Manage Learning Resources
 * ACTIONS column (Edit / Archive) & Published Edit Interception
 * --------------------------------------------------------------------
 * Wires up the ACTIONS column in the Manage Learning Resources table
 * (learning-resources.html), which handles Edit + Archive.
 *
 * Task #98: Intercepts the click event on the Edit button for
 * resources with "Published" status, prompting the admin with a
 * confirmation warning modal (#confirmActionModal) before opening the
 * editor. Resources in "Draft" status bypass the warning directly.
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

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && confirmActionModal && !confirmActionModal.classList.contains("modal-hidden") && confirmActionModal.style.display !== "none") {
                closeConfirmModal();
            }
        });

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        /**
         * Builds the ACTIONS cell's inner markup (Edit link + Archive
         * button) for a given resource. Exposed globally so
         * admin-learning-resources.js's renderRows() can build the
         * exact same markup for live-search/filter/page results,
         * without duplicating this logic a second time in that file.
         */
        function actionsHtml(resourceId, editUrl, status) {
            const href = editUrl || `/admin/upload-resource?resource_id=${encodeURIComponent(resourceId)}`;
            const statusAttr = status ? ` data-status="${escapeHtml(status)}"` : "";
            return `
                <div class="table-actions-group">
                    <a href="${href}" title="Edit" class="table-action-icon js-edit-resource-btn"
                       data-resource-id="${resourceId}"${statusAttr}>
                        <i class="fa-solid fa-pen-to-square"></i>
                    </a>
                    <a href="#" title="Archive"
                       class="table-action-icon delete-action js-archive-resource-btn"
                       data-resource-id="${resourceId}">
                        <i class="fa-solid fa-box-archive"></i>
                    </a>
                </div>`;
        }

        window.cobraByteResourceActions = { actionsHtml };

        tableBody.addEventListener("click", async (e) => {
            // Task #98: Intercept Edit click for Published resources
            const editBtn = e.target.closest(".js-edit-resource-btn") || e.target.closest('a[title="Edit"]');
            if (editBtn) {
                const row = editBtn.closest("tr");
                const statusCell = row ? row.querySelector(".js-status-cell") : null;
                const statusText = (editBtn.dataset.status || (statusCell ? statusCell.textContent : "")).trim().toLowerCase();
                const isPublished = statusText === "published";

                if (isPublished) {
                    e.preventDefault();
                    const targetUrl = editBtn.href;
                    showConfirmModal(
                        "You are about to edit a published resource. Do you wish to continue?",
                        () => {
                            window.location.href = targetUrl;
                        },
                        "Edit Published Resource?"
                    );
                    return;
                }
                // Draft status bypasses warning and proceeds straight to editor
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