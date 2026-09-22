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
            if (status === "Archived") return `<span class="badge badge-inactive">${escapeHtml(status)}</span>`;
            return `<span class="badge badge-draft">${escapeHtml(status || "Draft")}</span>`;
        }

        function publishButtonHtml(exerciseId, status, moduleStatus) {
            let label, btnClass;
            if (status === "Published") { label = "Unpublish"; btnClass = "btn-unpublish-custom"; }
            else if (status === "Ready to Publish") { label = "Move to Draft"; btnClass = "btn-movedraft-custom"; }
            else { label = "Ready to Publish"; btnClass = "btn-ready-custom"; }
            return `
                <button type="button"
                        class="btn ${btnClass} js-toggle-exercise-publish-btn"
                        data-exercise-id="${exerciseId}"
                        data-status="${escapeHtml(status || "Draft")}"
                        data-module-status="${escapeHtml(moduleStatus || "Draft")}">
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

            let endpoint, confirmMsg, confirmTitle, busyText;
            if (currentStatus === "Published") {
                endpoint = `/admin/coding-exercises/${exerciseId}/unpublish`;
                confirmMsg = "Are you sure you want to unpublish this coding exercise? It will be moved back to Draft and hidden from learners.";
                confirmTitle = "Unpublish Coding Exercise?";
                busyText = "Unpublishing...";
            } else if (currentStatus === "Ready to Publish") {
                endpoint = `/admin/coding-exercises/${exerciseId}/unpublish`;
                confirmMsg = "Are you sure you want to move this exercise back to Draft?";
                confirmTitle = "Move to Draft?";
                busyText = "Moving to Draft...";
            } else {
                endpoint = `/admin/coding-exercises/${exerciseId}/ready-to-publish`;
                confirmMsg = "Are you sure you want to mark this exercise as Ready to Publish?";
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
                        showAlertModal(result.message || "Could not update this exercise's status.", "Error");
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

        // Task #112: Archive Coding Exercise Click Handler
        tableBody.addEventListener("click", async (e) => {
            const archiveBtn = e.target.closest(".js-archive-exercise-btn");
            if (!archiveBtn) return;
            e.preventDefault();

            const exerciseId = archiveBtn.dataset.exerciseId;
            if (!exerciseId) return;

            // Task #123: universal Published-dependency check - a
            // Coding Exercise is a leaf node (no children), so this is
            // just a self-status check, but it's still done BEFORE
            // ever showing the confirm dialog, exactly like every other
            // area's archive-check. Hard block, no bypass.
            try {
                const checkResp = await fetch(`/admin/coding-exercises/${exerciseId}/archive-check`, { credentials: "include" });
                const checkResult = await checkResp.json();
                if (!checkResult.success) {
                    showAlertModal(checkResult.message || "Could not verify this exercise's status.", "Error");
                    return;
                }
                if (!checkResult.eligible) {
                    showAlertModal(
                        "This exercise is Published. You must unpublish it first before you can archive it.",
                        "Cannot Archive"
                    );
                    return;
                }
            } catch (err) {
                showAlertModal("Could not reach the server. Please try again.", "Error");
                return;
            }

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
                        showAlertModal(result.message || "Could not archive this coding exercise.", "Error");
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
                    showAlertModal("Could not reach the server. Please try again.", "Error");
                    if (icon) icon.className = originalClass;
                    archiveBtn.style.pointerEvents = "";
                }
            }, confirmTitle);
        });
    });
})();