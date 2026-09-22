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
            if (status === "Published") return `<span class="badge badge-active">${escapeHtml(status)}</span>`;
            if (status === "Ready to Publish") return `<span class="badge badge-ready">${escapeHtml(status)}</span>`;
            return `<span class="badge badge-draft">${escapeHtml(status || "Draft")}</span>`;
        }

         function publishButtonHtml(resourceId, status, moduleStatus) {
            let label, btnClass;
            if (status === "Published") { label = "Unpublish"; btnClass = "btn-unpublish-custom"; }
            else if (status === "Ready to Publish") { label = "Move to Draft"; btnClass = "btn-movedraft-custom"; }
            else { label = "Ready to Publish"; btnClass = "btn-ready-custom"; }
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

            let endpoint, confirmMsg, confirmTitle, busyText;
            if (currentStatus === "Published") {
                endpoint = `/admin/learning-resources/${resourceId}/unpublish`;
                confirmMsg = "Are you sure you want to unpublish this resource? It will be moved back to Draft and hidden from learners.";
                confirmTitle = "Unpublish Resource?";
                busyText = "Unpublishing...";
            } else if (currentStatus === "Ready to Publish") {
                endpoint = `/admin/learning-resources/${resourceId}/unpublish`;
                confirmMsg = "Are you sure you want to move this resource back to Draft? It will come out of the Ready to Publish queue.";
                confirmTitle = "Move to Draft?";
                busyText = "Moving to Draft...";
            } else {
                endpoint = `/admin/learning-resources/${resourceId}/ready-to-publish`;
                confirmMsg = "Are you sure you want to mark this resource as Ready to Publish?";
                confirmTitle = "Ready to Publish?";
                busyText = "Marking Ready...";
            }

            showConfirmModal(confirmMsg, async () => {
                btn.disabled = true;
                const originalText = btn.textContent;
                btn.textContent = busyText;

                try {
                    const response = await fetch(endpoint, {
                        method: "POST",
                        credentials: "include",
                    });
                    const result = await response.json();

                    if (!result.success) {
                        showAlertModal(result.message || "Could not update this resource's status.", "Error");
                        btn.disabled = false;
                        btn.textContent = originalText;
                        return;
                    }

                    const newStatus = currentStatus === "Draft" ? "Ready to Publish" : "Draft";

                    btn.dataset.status = newStatus;
                    let newLabel, newClass;
                    if (newStatus === "Ready to Publish") { newLabel = "Move to Draft"; newClass = "btn-movedraft-custom"; }
                    else { newLabel = "Ready to Publish"; newClass = "btn-ready-custom"; }
                    btn.textContent = newLabel;
                    btn.classList.remove("btn-success-custom", "btn-unpublish-custom", "btn-ready-custom", "btn-movedraft-custom", "btn-secondary-custom");
                    btn.classList.add(newClass);
                    btn.disabled = false;

                    const row = btn.closest("tr");
                    const statusCell = row ? row.querySelector(".js-status-cell") : null;
                    if (statusCell) {
                        statusCell.innerHTML = statusBadgeHtml(newStatus);
                    }
                } catch (err) {
                    showAlertModal("Could not reach the server. Please try again.", "Error");
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            }, confirmTitle);
        });
    });
})();