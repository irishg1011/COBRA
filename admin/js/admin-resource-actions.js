/**
 * admin-resource-actions.js - Task #81: Manage Learning Resources
 * ACTIONS column (Edit / Archive)
 * --------------------------------------------------------------------
 * Wires up the ACTIONS column in the Manage Learning Resources table
 * (learning-resources.html), which is now strictly Edit + Archive -
 * Publish/Unpublish has moved to its own "Publish Status" column,
 * handled separately by admin-resource-publish.js.
 *
 * Edit reuses the existing Upload Resource route
 * (admin_bp.upload_resource?resource_id=<id>) - it's a normal link, no
 * JS needed beyond the server-rendered href already in the markup.
 *
 * Archive calls the new /admin/learning-resources/<id>/archive
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
         *
         * editUrl is passed in (rather than built here) since the real
         * Flask url_for()-generated route lives server-side; the
         * initial page-load table already has it baked into each row's
         * href, and admin-learning-resources.js's JSON results include
         * resource_id, from which the same URL pattern can be built.
         */
        function actionsHtml(resourceId, editUrl) {
            const href = editUrl || `/admin/upload-resource?resource_id=${encodeURIComponent(resourceId)}`;
            return `
                <div class="table-actions-group">
                    <a href="${href}" title="Edit" class="table-action-icon">
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
            const archiveBtn = e.target.closest(".js-archive-resource-btn");
            if (!archiveBtn) return;
            e.preventDefault();

            const resourceId = archiveBtn.dataset.resourceId;
            if (!resourceId) return;

            const confirmed = confirm(
                "Are you sure you want to archive this resource? " +
                "It will be removed from active use, but its content is preserved."
            );
            if (!confirmed) return;

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
        });
    });
})();