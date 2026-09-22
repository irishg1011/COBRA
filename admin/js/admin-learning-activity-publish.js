/**
 * admin-learning-activity-publish.js - Task #107: Manage Learning
 * Activities Quick Publish / Unpublish
 * --------------------------------------------------------------------
 * Wires up the Publish/Unpublish button in the Manage Learning
 * Activities table's PUBLISH STATUS column (manage-learning-
 * activities.html) to the backend endpoints
 * (/admin/learning-activities/<id>/publish and .../unpublish - see
 * admin_routes.py -> learning_activity_publishing.py), letting an admin
 * flip an activity between Draft and Published directly from the table
 * without opening the full Create/Edit Learning Activity screen.
 *
 * Mirrors admin-resource-publish.js's exact pattern for Learning
 * Resources:
 *   - Draft activity shows a "Publish" button; Published shows
 *     "Unpublish" instead - same btn-success-custom / btn-unpublish-
 *     custom classes already used for every other publish toggle in
 *     this admin (Learning Resources, Manage Course).
 *   - On success, the button's label/class and the row's Status badge
 *     (.js-status-cell) are updated in place - no page reload, no full
 *     table re-fetch.
 *   - Uses event delegation on #activitiesTableBody so it keeps working
 *     after admin-learning-activities.js re-renders the table body
 *     during a live search/filter/date-filter/sort/page change - no
 *     re-binding required.
 *
 * Confirmation uses the SAME shared #confirmActionModal
 * (confirm-action-modal.html) admin-resource-actions.js already relies
 * on for the Learning Resources table's Edit-Published-resource
 * warning, rather than a second, divergent window.confirm() flow.
 *
 * Include this on manage-learning-activities.html, right after
 * admin-learning-activities.js:
 *
 *   <script src="{{ url_for('admin_bp.static', filename='js/admin-learning-activity-publish.js') }}"></script>
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const tableBody = document.getElementById("activitiesTableBody");
        if (!tableBody) return; // not on this page

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

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        // Reuses the exact "changes-saved-toast" element/CSS class already
        // defined in admin-style.css and used by Manage Course's own
        // Publish/Unpublish flow (admin-manage-course.js), so this needs
        // no new styling and looks identical to every other success toast
        // in the admin.
        let publishToastTimeout = null;
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

            if (publishToastTimeout) clearTimeout(publishToastTimeout);
            publishToastTimeout = setTimeout(() => {
                toast.classList.remove("show");
            }, 2000);
        }

        function statusBadgeHtml(status) {
            if (status === "Published") return `<span class="badge badge-active">${escapeHtml(status)}</span>`;
            if (status === "Ready to Publish") return `<span class="badge badge-ready">${escapeHtml(status)}</span>`;
            return `<span class="badge badge-draft">${escapeHtml(status || "Draft")}</span>`;
        }

        function publishButtonHtml(activityId, status, moduleStatus) {
            let label, btnClass;
            if (status === "Published") { label = "Unpublish"; btnClass = "btn-unpublish-custom"; }
            else if (status === "Ready to Publish") { label = "Move to Draft"; btnClass = "btn-movedraft-custom"; }
            else { label = "Ready to Publish"; btnClass = "btn-ready-custom"; }
            return `
                <button type="button"
                        class="btn ${btnClass} js-toggle-activity-publish-btn"
                        data-activity-id="${activityId}"
                        data-status="${escapeHtml(status || "Draft")}"
                        data-module-status="${escapeHtml(moduleStatus || "Draft")}">
                    ${label}
                </button>`;
        }

        // Exposed globally so admin-learning-activities.js's renderRows()
        // can build the exact same Status badge / Publish Status cell
        // markup for live-search/filter/page results, without
        // duplicating this logic a second time in that file.
        window.cobraByteActivityPublishing = { statusBadgeHtml, publishButtonHtml };

        tableBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".js-toggle-activity-publish-btn");
            if (!btn) return;
            e.preventDefault();

            const activityId = btn.dataset.activityId;
            const currentStatus = btn.dataset.status || "Draft";

            let endpoint, confirmMsg, confirmTitle, busyText;
            if (currentStatus === "Published") {
                endpoint = `/admin/learning-activities/${activityId}/unpublish`;
                confirmMsg = "Are you sure you want to unpublish this learning activity? It will be moved back to Draft and hidden from learners.";
                confirmTitle = "Unpublish Activity?";
                busyText = "Unpublishing...";
            } else if (currentStatus === "Ready to Publish") {
                endpoint = `/admin/learning-activities/${activityId}/unpublish`;
                confirmMsg = "Are you sure you want to move this activity back to Draft?";
                confirmTitle = "Move to Draft?";
                busyText = "Moving to Draft...";
            } else {
                endpoint = `/admin/learning-activities/${activityId}/ready-to-publish`;
                confirmMsg = "Are you sure you want to mark this activity as Ready to Publish?";
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
                        showAlertModal(result.message || "Could not update this activity's status.", "Error");
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
                    btn.classList.remove("btn-success-custom", "btn-unpublish-custom", "btn-ready-custom", "btn-movedraft-custom");
                    btn.classList.add(newClass);
                    btn.disabled = false;

                    const row = btn.closest("tr");
                    const statusCell = row ? row.querySelector(".js-status-cell") : null;
                    if (statusCell) {
                        statusCell.innerHTML = statusBadgeHtml(newStatus);
                    }

                    showSuccessToast(result.message || "Status updated.");
                } catch (err) {
                    showAlertModal("Could not reach the server. Please try again.", "Error");
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            }, confirmTitle);
        });
    });
})();