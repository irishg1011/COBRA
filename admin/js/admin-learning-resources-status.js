/**
 * admin-learning-resources-status.js - CobraByte Admin: Learning
 * Resource Draft -> Publish -> Unpublish Workflow
 * ------------------------------------------------------------------
 * Wires up a Publish/Unpublish action button per Learning Resource
 * row on the Manage Learning Resources table.
 *
 * Uses window.confirm() for the confirmation step (Task: "Display a
 * confirmation alert using the existing project UI pattern") - this
 * matches the SAME pattern already used for other status-changing row
 * actions in this project (admin-manage-course.js's Archive/Restore
 * module actions both use window.confirm() the exact same way), so
 * this stays consistent with the existing UI rather than introducing
 * a new custom-modal pattern for just this one action.
 *
 * ASSUMPTION (please adjust the selector below if it differs): each
 * row's action cell has a button like:
 *
 *   <button type="button"
 *           class="table-action-icon js-toggle-publish"
 *           data-id="{{ resource.resource_id }}"
 *           data-status="{{ resource.status }}">
 *       {{ 'Unpublish' if resource.status == 'Published' else 'Publish' }}
 *   </button>
 *
 * See learning-resources_row-template_SNIPPET.html for the exact
 * markup to add to both the Jinja-rendered row (learning-resources.html)
 * and the JS-rendered row (admin-learning-resources.js's renderRows()).
 *
 * Include this on the Learning Resources page, after
 * admin-learning-resources.js:
 *
 *   <script src="{{ url_for('admin_bp.static', filename='js/admin-learning-resources-status.js') }}"></script>
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const tableBody = document.getElementById("resourcesTableBody");
        if (!tableBody) return;

        /**
         * Renders a toggle button's label/data-status FROM the actual
         * status string - never a locally-flipped guess. Called after
         * every successful publish/unpublish response, and usable by
         * admin-learning-resources.js's own renderRows() for the
         * initial render too.
         */
        function applyButtonState(button, status) {
            const isPublished = status === "Published";
            button.textContent = isPublished ? "Unpublish" : "Publish";
            button.dataset.status = status;
            // Task: "Draft option must be disabled/unavailable while
            // published" - surfaced as a data attribute so any Draft-
            // related control elsewhere in the row (e.g. a status
            // dropdown, if one exists) can read it and disable itself
            // accordingly without this script needing to know that
            // control's exact markup.
            button.closest("tr")?.setAttribute("data-resource-status", status);
        }
        window.cobraByteApplyResourceStatusButton = applyButtonState;

        async function togglePublish(button) {
            const resourceId = button.dataset.id;
            const currentStatus = button.dataset.status;
            if (!resourceId) return;

            const isPublished = currentStatus === "Published";

            // Task: confirmation BEFORE any status change, for BOTH
            // directions - cancelling leaves the resource/button
            // completely untouched.
            const confirmMessage = isPublished
                ? "Are you sure you want to unpublish this resource? It will move back to Draft."
                : "Are you sure you want to publish this resource? It will become visible to learners.";
            if (!window.confirm(confirmMessage)) return;

            const endpoint = isPublished
                ? `/admin/learning-resources/${resourceId}/unpublish`
                : `/admin/learning-resources/${resourceId}/publish`;

            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = isPublished ? "Unpublishing..." : "Publishing...";

            try {
                const response = await fetch(endpoint, { method: "POST", credentials: "include" });
                const result = await response.json();

                if (!result.success) {
                    // Task: clear, user-friendly message - e.g. "The
                    // selected Category must be published before this
                    // resource can be published." surfaced verbatim
                    // from the backend, which is the same message
                    // style already used for Category/Module errors
                    // elsewhere in this admin panel (alert()-based, as
                    // in admin-manage-course.js's archive/restore/
                    // create-category error handling).
                    alert(result.message || "Could not update the resource status.");
                    button.textContent = originalText; // revert - status never changed
                    return;
                }

                // Task: "UI must reflect the actual saved result" -
                // the button always renders from result.status (what
                // the database actually now holds), never from a
                // locally-assumed opposite of currentStatus.
                applyButtonState(button, result.status);
            } catch (err) {
                console.error("admin-learning-resources-status: request failed:", err);
                alert("Could not reach the server. Please try again.");
                button.textContent = originalText;
            } finally {
                button.disabled = false;
            }
        }

        // Event delegation - survives admin-learning-resources.js's
        // full tbody re-renders on every search/filter change, since
        // this listens on the stable parent element rather than on
        // individual buttons.
        tableBody.addEventListener("click", (e) => {
            const button = e.target.closest(".js-toggle-publish");
            if (!button) return;
            e.preventDefault();
            togglePublish(button);
        });
    });
})();