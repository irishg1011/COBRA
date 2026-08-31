/**
 * admin-coding-exercise-publish.js - Task #111: Manage Coding
 * Exercises Quick Publish / Unpublish
 * --------------------------------------------------------------------
 * Wires up the Publish/Unpublish button in the Manage Coding
 * Exercises table's PUBLISH STATUS column (coding-exercises.html)
 * to the backend endpoints (/admin/coding-exercises/<id>/publish and
 * .../unpublish), letting an admin flip an exercise between Draft and
 * Published directly from the table without opening the full editor screen.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const tableBody = document.getElementById("exercisesTableBody");
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
            const cls = normalized === "published" ? "badge-active" : (normalized === "archived" ? "badge-inactive" : "badge-draft");
            return `<span class="badge ${cls}">${escapeHtml(status || "Draft")}</span>`;
        }

        function publishButtonHtml(exerciseId, status) {
            const isPublished = status === "Published";
            const label = isPublished ? "Unpublish" : "Publish";
            const btnClass = isPublished ? "btn-unpublish-custom" : "btn-success-custom";
            return `
                <button type="button"
                        class="btn ${btnClass} js-toggle-exercise-publish-btn"
                        data-exercise-id="${exerciseId}"
                        data-status="${escapeHtml(status || "Draft")}">
                    ${label}
                </button>`;
        }

        window.cobraByteExercisePublishing = { statusBadgeHtml, publishButtonHtml };

        tableBody.addEventListener("click", (e) => {
            const btn = e.target.closest(".js-toggle-exercise-publish-btn");
            if (!btn) return;
            e.preventDefault();

            const exerciseId = btn.dataset.exerciseId;
            const currentStatus = btn.dataset.status || "Draft";
            const isPublished = currentStatus === "Published";

            const confirmMsg = isPublished
                ? "Are you sure you want to unpublish this coding exercise? It will be moved back to Draft and hidden from learners."
                : "Are you sure you want to publish this coding exercise? It will become visible to learners.";
            const confirmTitle = isPublished ? "Unpublish Coding Exercise?" : "Publish Coding Exercise?";

            showConfirmModal(confirmMsg, async () => {
                const endpoint = isPublished
                    ? `/admin/coding-exercises/${exerciseId}/unpublish`
                    : `/admin/coding-exercises/${exerciseId}/publish`;

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
                        alert(result.message || "Could not update this exercise's status.");
                        btn.disabled = false;
                        btn.textContent = originalText;
                        return;
                    }

                    const newStatus = isPublished ? "Draft" : "Published";

                    // Toggle button state
                    btn.dataset.status = newStatus;
                    btn.textContent = newStatus === "Published" ? "Unpublish" : "Publish";
                    btn.classList.remove("btn-success-custom", "btn-unpublish-custom");
                    btn.classList.add(newStatus === "Published" ? "btn-unpublish-custom" : "btn-success-custom");
                    btn.disabled = false;

                    // Update row Status badge cell
                    const row = btn.closest("tr");
                    const statusCell = row ? row.querySelector(".js-status-cell") : null;
                    if (statusCell) {
                        statusCell.innerHTML = statusBadgeHtml(newStatus);
                    }

                    showSuccessToast(
                        result.message || (newStatus === "Published" ? "Coding exercise published successfully." : "Coding exercise moved back to Draft.")
                    );
                } catch (err) {
                    alert("Could not reach the server. Please try again.");
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            }, confirmTitle);
        });

        // Task #112: Archive Coding Exercise Click Handler
        tableBody.addEventListener("click", (e) => {
            const archiveBtn = e.target.closest(".js-archive-exercise-btn");
            if (!archiveBtn) return;
            e.preventDefault();

            const exerciseId = archiveBtn.dataset.exerciseId;
            if (!exerciseId) return;

            const confirmMsg = "Are you sure you want to archive this coding exercise? It will be removed from active use, but its content is preserved.";
            const confirmTitle = "Archive Coding Exercise?";

            showConfirmModal(confirmMsg, async () => {
                const icon = archiveBtn.querySelector("i");
                const originalClass = icon ? icon.className : "";
                if (icon) icon.className = "fa-solid fa-spinner fa-spin";
                archiveBtn.style.pointerEvents = "none";

                try {
                    const response = await fetch(`/admin/coding-exercises/${exerciseId}/archive`, {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            "X-Requested-With": "XMLHttpRequest"
                        }
                    });
                    const result = await response.json();

                    if (!result.success) {
                        alert(result.message || "Could not archive this coding exercise.");
                        if (icon) icon.className = originalClass;
                        archiveBtn.style.pointerEvents = "";
                        return;
                    }

                    // Remove row in place
                    const row = archiveBtn.closest("tr");
                    if (row) row.remove();

                    // Update showing count or show empty state if empty
                    const remainingRows = tableBody.querySelectorAll("tr:not(:has(.table-empty-message))");
                    if (remainingRows.length === 0) {
                        tableBody.innerHTML = `
                            <tr>
                                <td colspan="10" class="text-muted table-empty-message">
                                    No coding exercises found.
                                </td>
                            </tr>`;
                    }
                    const showingCount = document.getElementById("exercisesShowingCount");
                    if (showingCount) {
                        const countText = showingCount.textContent;
                        const match = countText.match(/Showing\s+(\d+)\s+of\s+(\d+)/i);
                        if (match) {
                            const newCount = Math.max(0, parseInt(match[1], 10) - 1);
                            const newTotal = Math.max(0, parseInt(match[2], 10) - 1);
                            showingCount.textContent = `Showing ${newCount} of ${newTotal} Exercises`;
                        }
                    }

                    showSuccessToast(result.message || "Coding exercise archived successfully.");
                } catch (err) {
                    alert("Could not reach the server. Please try again.");
                    if (icon) icon.className = originalClass;
                    archiveBtn.style.pointerEvents = "";
                }
            }, confirmTitle);
        });
    });
})();
