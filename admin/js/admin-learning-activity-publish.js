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
            const normalized = (status || "").toLowerCase();
            const cls = normalized === "published" ? "badge-active" : "badge-draft";
            return `<span class="badge ${cls}">${escapeHtml(status || "Draft")}</span>`;
        }

        function publishButtonHtml(activityId, status) {
            const isPublished = status === "Published";
            const label = isPublished ? "Unpublish" : "Publish";
            const btnClass = isPublished ? "btn-unpublish-custom" : "btn-success-custom";
            return `
                <button type="button"
                        class="btn ${btnClass} js-toggle-activity-publish-btn"
                        data-activity-id="${activityId}"
                        data-status="${escapeHtml(status || "Draft")}">
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
            const isPublished = currentStatus === "Published";

            const confirmMsg = isPublished
                ? "Are you sure you want to unpublish this learning activity? It will be moved back to Draft and hidden from learners."
                : "Are you sure you want to publish this learning activity? It will become visible to learners.";
            const confirmTitle = isPublished ? "Unpublish Activity?" : "Publish Activity?";

            showConfirmModal(confirmMsg, async () => {
                const endpoint = isPublished
                    ? `/admin/learning-activities/${activityId}/unpublish`
                    : `/admin/learning-activities/${activityId}/publish`;

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
                        alert(result.message || "Could not update this activity's status.");
                        btn.disabled = false;
                        btn.textContent = originalText;
                        return;
                    }

                    const newStatus = isPublished ? "Draft" : "Published";

                    // Toggle the button itself into its new state.
                    btn.dataset.status = newStatus;
                    btn.textContent = newStatus === "Published" ? "Unpublish" : "Publish";
                    btn.classList.remove("btn-success-custom", "btn-unpublish-custom");
                    btn.classList.add(newStatus === "Published" ? "btn-unpublish-custom" : "btn-success-custom");
                    btn.disabled = false;

                    // Update this row's Status badge cell in place.
                    const row = btn.closest("tr");
                    const statusCell = row ? row.querySelector(".js-status-cell") : null;
                    if (statusCell) {
                        statusCell.innerHTML = statusBadgeHtml(newStatus);
                    }

                    showSuccessToast(
                        result.message || (newStatus === "Published" ? "Activity published successfully." : "Activity moved back to Draft.")
                    );
                } catch (err) {
                    alert("Could not reach the server. Please try again.");
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            }, confirmTitle);
        });
    });
})();