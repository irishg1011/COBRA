/**
 * admin-resource-publish.js - Task #43: Learning Resource Publish Workflow
 * --------------------------------------------------------------------
 * Wires up the Publish/Unpublish button in the Learning Resources table
 * (learning-resources.html) to the backend endpoints
 * (/admin/learning-resources/<id>/publish and .../unpublish, see
 * admin_routes.py -> resource_publishing.py).
 *
 * Behavior:
 *   - Draft resource shows a "Publish" button. Clicking it asks for
 *     confirmation, then calls the publish endpoint.
 *   - If the resource's parent module isn't "Published" yet, this is
 *     caught client-side first (fast, no round trip) using the
 *     data-module-status attribute rendered server-side - AND is
 *     re-checked authoritatively server-side regardless (see
 *     resource_publishing.publish_resource()), so this client check is
 *     a UX nicety, never the real gate.
 *   - Published resource shows an "Unpublish" button instead. Clicking
 *     it asks for confirmation, then calls the unpublish endpoint.
 *   - On success, the button's label/class and the row's Status badge
 *     are updated in place - no page reload, no full table re-fetch.
 *
 * Uses event delegation on #resourcesTableBody so it keeps working after
 * admin-learning-resources.js re-renders the table body during a live
 * search/filter/page change - no re-binding required.
 *
 * Include this on learning-resources.html, right after
 * admin-learning-resources.js:
 *
 *   <script src="{{ url_for('admin_bp.static', filename='js/admin-resource-publish.js') }}"></script>
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

        function statusBadgeHtml(status) {
            const normalized = (status || "").toLowerCase();
            const cls = normalized === "published" ? "badge-active" : "badge-draft";
            return `<span class="badge ${cls}">${escapeHtml(status || "Draft")}</span>`;
        }

        function publishButtonHtml(resourceId, status, moduleStatus) {
            const isPublished = status === "Published";
            const label = isPublished ? "Unpublish" : "Publish";
            // Task #81, Requirement #4: the old "btn-secondary-custom"
            // class rendered as a near-white button with faint text -
            // clickable, but easy to mistake for disabled. Unpublish
            // now uses its own dedicated, high-contrast style
            // (.btn-unpublish-custom, see admin-style.css) so it reads
            // as an active, clickable button and stays visually
            // distinct from the green Publish button.
            const btnClass = isPublished ? "btn-unpublish-custom" : "btn-success-custom";
            return `
                <button type="button"
                        class="btn ${btnClass} js-toggle-publish-btn"
                        data-resource-id="${resourceId}"
                        data-status="${escapeHtml(status || "Draft")}"
                        data-module-status="${escapeHtml(moduleStatus || "")}">
                    ${label}
                </button>`;
        }

        // Exposed globally so admin-learning-resources.js's renderRows()
        // can build the exact same Status badge / Actions cell markup
        // for live-search/filter/page results, without duplicating this
        // logic a second time in that file.
        window.cobraByteResourcePublishing = { statusBadgeHtml, publishButtonHtml };

        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");

        let pendingConfirmAction = null;

        function showAlertModal(message, title = "Cannot Publish") {
            if (!confirmActionModal) {
                alert(message);
                return;
            }
            pendingConfirmAction = null;
            if (confirmActionTitle) confirmActionTitle.textContent = title;
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "none";
            if (confirmActionConfirmBtn) confirmActionConfirmBtn.textContent = "OK";
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        function showConfirmModal(message, onConfirm, title) {
            if (!confirmActionModal) {
                if (window.confirm(message)) onConfirm();
                return;
            }
            pendingConfirmAction = onConfirm;
            if (confirmActionTitle) confirmActionTitle.textContent = title || "Confirm Action";
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
            if (confirmActionConfirmBtn) confirmActionConfirmBtn.textContent = "Confirm";
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        function closeConfirmModal() {
            if (confirmActionModal) {
                confirmActionModal.classList.add("modal-hidden");
                confirmActionModal.style.display = "none";
            }
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
            if (confirmActionConfirmBtn) confirmActionConfirmBtn.textContent = "Confirm";
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

        tableBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".js-toggle-publish-btn");
            if (!btn) return;
            e.preventDefault();

            const resourceId = btn.dataset.resourceId;
            const currentStatus = btn.dataset.status || "Draft";
            const moduleStatus = btn.dataset.moduleStatus || "";
            const isPublished = currentStatus === "Published";

            if (!isPublished) {
                // Task #43: block publishing client-side first if the
                // parent module isn't Published - fast feedback before
                // ever hitting the server (which re-checks this exact
                // rule authoritatively regardless).
                if (moduleStatus && moduleStatus !== "Published") {
                    showAlertModal(
                        `Cannot publish this resource - its parent module is still in ` +
                        `${moduleStatus} status. Publish the parent module first.`,
                        "Cannot Publish"
                    );
                    return;
                }
            }

            const confirmMsg = isPublished
                ? "Are you sure you want to unpublish this resource? It will be moved back to Draft and hidden from learners."
                : "Are you sure you want to publish this resource? It will become visible to learners.";
            const confirmTitle = isPublished ? "Unpublish Resource?" : "Publish Resource?";

            showConfirmModal(confirmMsg, async () => {
                const endpoint = isPublished
                    ? `/admin/learning-resources/${resourceId}/unpublish`
                    : `/admin/learning-resources/${resourceId}/publish`;

                btn.disabled = true;
                const originalText = btn.textContent;
                btn.textContent = isPublished ? "Unpublishing..." : "Publishing...";

                try {
                    const response = await fetch(endpoint, {
                        method: "POST",
                        credentials: "include",
                    });
                    const result = await response.json();

                    if (!result.success) {
                        showAlertModal(result.message || "Could not update this resource's status.", "Cannot Publish");
                        btn.disabled = false;
                        btn.textContent = originalText;
                        return;
                    }

                    const newStatus = isPublished ? "Draft" : "Published";

                    // Toggle the button itself into its new state.
                    btn.dataset.status = newStatus;
                    btn.textContent = newStatus === "Published" ? "Unpublish" : "Publish";
                    btn.classList.remove("btn-success-custom", "btn-unpublish-custom", "btn-secondary-custom");
                    btn.classList.add(newStatus === "Published" ? "btn-unpublish-custom" : "btn-success-custom");
                    btn.disabled = false;

                    // Update this row's Status badge cell in place.
                    const row = btn.closest("tr");
                    const statusCell = row ? row.querySelector(".js-status-cell") : null;
                    if (statusCell) {
                        statusCell.innerHTML = statusBadgeHtml(newStatus);
                    }
                } catch (err) {
                    alert("Could not reach the server. Please try again.");
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            }, confirmTitle);
        });
    });
})();