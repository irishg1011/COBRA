/**
 * admin-relational-archive.js - Task #116: Relational Archive
 * Restrictions, Cascading Archive & Checkbox-Controlled Cascading Restore
 * --------------------------------------------------------------------------------------
 * Intercepts (capture phase, so it always runs BEFORE the bubble-phase
 * handlers already bound to the same buttons in admin-manage-course.js /
 * admin-resource-actions.js) the Archive and Restore actions for
 * Categories, Modules, and Learning Resources, and replaces them with:
 *
 *   1. Archive (Category / Module / Learning Resource):
 *      - GET the item's archive-eligibility check first. If any
 *        connected/descendant item is currently Published, show a
 *        warning alert explaining exactly which item(s) are blocking it
 *        and stop - nothing is archived.
 *      - Otherwise show a confirmation modal. On confirm, call the
 *        existing archive endpoint, which now cascades server-side to
 *        every DRAFT descendant automatically (see relational_archive.py).
 *
 *   2. Restore (Category / Module only - their Learning Resources /
 *      Learning Activities / Coding Exercises are restored FROM this
 *      same checkbox modal, never individually):
 *      - GET every archived descendant, grouped by type.
 *      - Open #restoreSelectionModal with one checkbox per item, plus a
 *        "Select All" toggle.
 *      - On confirm, restore the parent PLUS only the checked items.
 *
 * Uses the shared #confirmActionModal (confirm-action-modal.html) for
 * both the warning alert and the archive confirmation, matching this
 * project's existing modal conventions - never window.confirm()/alert().
 *
 * REQUIRED INCLUDES (see TASK_116_INTEGRATION_NOTES.md for exact diffs):
 *   - confirm-action-modal.html + restore-selection-modal.html present
 *     on the page.
 *   - Loaded AFTER admin-manage-course.js (on manage-course.html) and
 *     AFTER admin-resource-actions.js / admin-resource-publish.js (on
 *     learning-resources.html), so its capture-phase listeners register
 *     last and can intercept clicks before those files' own bubble-phase
 *     handlers run.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");

        const restoreModal = document.getElementById("restoreSelectionModal");
        const restoreTitle = document.getElementById("restoreSelectionTitle");
        const restoreIntro = document.getElementById("restoreSelectionIntro");
        const restoreGroups = document.getElementById("restoreSelectionGroups");
        const restoreSelectAll = document.getElementById("restoreSelectAllToggle");
        const closeRestoreBtn = document.getElementById("closeRestoreSelectionModal");
        const cancelRestoreBtn = document.getElementById("cancelRestoreSelectionBtn");
        const confirmRestoreBtn = document.getElementById("confirmRestoreSelectionBtn");

        if (!confirmActionModal && !restoreModal) return; // neither modal present on this page

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        // ------------------------------------------------------------
        // Shared alert/confirm modal (single-button "OK" alert, or a
        // Cancel/Confirm dialog) - reuses #confirmActionModal so no new
        // modal shell is introduced for this.
        // ------------------------------------------------------------
        let pendingConfirm = null;

        function showAlert(message, title) {
            if (!confirmActionModal) { alert(message); return; }
            pendingConfirm = null;
            if (confirmActionTitle) confirmActionTitle.textContent = title || "Cannot Archive";
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "none";
            if (confirmActionConfirmBtn) {
                confirmActionConfirmBtn.textContent = "OK";
                confirmActionConfirmBtn.className = "modal-btn-save";
            }
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        function showConfirm(message, title, onConfirm) {
            if (!confirmActionModal) {
                if (window.confirm(message)) onConfirm();
                return;
            }
            pendingConfirm = onConfirm;
            if (confirmActionTitle) confirmActionTitle.textContent = title || "Confirm Action";
            if (confirmActionText) confirmActionText.textContent = message;
            if (confirmActionCancelBtn) confirmActionCancelBtn.style.display = "";
            if (confirmActionConfirmBtn) {
                confirmActionConfirmBtn.textContent = "Confirm";
                confirmActionConfirmBtn.className = "modal-btn-save";
            }
            confirmActionModal.classList.remove("modal-hidden");
            confirmActionModal.style.display = "flex";
        }

        function closeSharedModal() {
            if (confirmActionModal) {
                confirmActionModal.classList.add("modal-hidden");
                confirmActionModal.style.display = "none";
            }
            pendingConfirm = null;
        }

        if (confirmActionCancelBtn) confirmActionCancelBtn.addEventListener("click", closeSharedModal);
        if (confirmActionConfirmBtn) {
            confirmActionConfirmBtn.addEventListener("click", () => {
                const action = pendingConfirm;
                closeSharedModal();
                if (typeof action === "function") action();
            });
        }
        if (confirmActionModal) {
            confirmActionModal.addEventListener("click", (e) => {
                if (e.target === confirmActionModal) closeSharedModal();
            });
        }

        // ------------------------------------------------------------
        // Generic "check -> warn OR confirm -> archive" flow, shared by
        // Category / Module / Learning Resource archive actions.
        // ------------------------------------------------------------
        function runArchiveFlow(checkUrl, archiveUrl, itemLabel, onSuccess) {
            fetch(checkUrl, { credentials: "include" })
                .then((r) => r.json())
                .then((result) => {
                    if (!result.success) {
                        showAlert(result.message || `Could not verify this ${itemLabel}'s connected items.`, "Error");
                        return;
                    }
                    if (!result.eligible) {
                        // Task #123: blockers are now structured objects
                        // ({type, title, category, module, lesson}) with
                        // full context, not plain strings - and the
                        // wording here is the exact instruction the task
                        // specifies. This is a hard block: no confirm is
                        // ever offered while any blocker remains.
                        const list = (result.blockers || [])
                            .map((b) => `\u2022 ${b.title} (${b.type}, Published) \u2014 ${[b.category, b.module, b.lesson].filter((p) => p && p !== "\u2014").join(" \u203a ")}`)
                            .join("\n");
                        showAlert(
                            `This ${itemLabel} still has published content:\n\n${list}\n\n` +
                            `You must unpublish these items first before you can archive this parent record.`,
                            "Cannot Archive"
                        );
                        return;
                    }
                    showConfirm(
                        `Archiving this ${itemLabel} will also archive every connected item still in Draft status. Published items are never touched. Continue?`,
                        `Archive ${itemLabel.charAt(0).toUpperCase() + itemLabel.slice(1)}?`,
                        () => {
                            fetch(archiveUrl, { method: "POST", credentials: "include" })
                                .then((r) => r.json())
                                .then((archiveResult) => {
                                    if (!archiveResult.success) {
                                        showAlert(archiveResult.message || `Could not archive this ${itemLabel}.`, "Error");
                                        return;
                                    }
                                    if (typeof onSuccess === "function") onSuccess(archiveResult);
                                })
                                .catch(() => showAlert("Could not reach the server. Please try again.", "Error"));
                        }
                    );
                })
                .catch(() => showAlert("Could not reach the server. Please try again.", "Error"));
        }

        // ------------------------------------------------------------
        // Category archive interception (Categories modal accordion)
        // ------------------------------------------------------------
        const categoriesListView = document.getElementById("categoriesListView");
        if (categoriesListView) {
            categoriesListView.addEventListener("click", (e) => {
                const btn = e.target.closest(".js-delete-category");
                if (!btn) return;
                e.preventDefault();
                e.stopImmediatePropagation();

                const item = btn.closest(".category-accordion-item");
                const catId = item ? item.dataset.catId : null;
                if (!catId) return;

                runArchiveFlow(
                    `/admin/manage-course/categories/${catId}/archive-check`,
                    `/admin/manage-course/categories/${catId}/delete`,
                    "category",
                    () => {
                        showAlert("Category archived successfully.", "Archived");
                        if (typeof window.cobraByteRefreshManageCourse === "function") {
                            window.cobraByteRefreshManageCourse();
                        } else {
                            window.location.reload();
                        }
                    }
                );
            }, true);
        }

        // ------------------------------------------------------------
        // Module archive interception (active Manage Course table)
        // ------------------------------------------------------------
        const modulesTableBody = document.getElementById("modulesTableBody");
        if (modulesTableBody) {
            modulesTableBody.addEventListener("click", (e) => {
                const btn = e.target.closest(".js-delete-module");
                if (!btn) return;
                e.preventDefault();
                e.stopImmediatePropagation();

                const id = btn.dataset.id;
                if (!id) return;

                runArchiveFlow(
                    `/admin/manage-course/modules/${id}/archive-check`,
                    `/admin/manage-course/modules/${id}/delete`,
                    "module",
                    () => {
                        showAlert("Module archived successfully.", "Archived");
                        if (typeof window.cobraByteRefreshManageCourse === "function") {
                            window.cobraByteRefreshManageCourse();
                        } else {
                            window.location.reload();
                        }
                    }
                );
            }, true);
        }

        // ------------------------------------------------------------
        // Learning Resource archive interception
        // ------------------------------------------------------------
        const resourcesTableBody = document.getElementById("resourcesTableBody");
        if (resourcesTableBody) {
            resourcesTableBody.addEventListener("click", (e) => {
                const btn = e.target.closest(".js-archive-resource-btn");
                if (!btn) return;
                e.preventDefault();
                e.stopImmediatePropagation();

                const id = btn.dataset.resourceId;
                if (!id) return;

                runArchiveFlow(
                    `/admin/learning-resources/${id}/archive-check`,
                    `/admin/learning-resources/${id}/archive`,
                    "learning resource",
                    () => {
                        const row = btn.closest("tr");
                        if (row) row.remove();
                        if (resourcesTableBody && !resourcesTableBody.querySelector("tr")) {
                            resourcesTableBody.innerHTML = `<tr><td colspan="9" class="text-muted table-empty-message">No resources found.</td></tr>`;
                        }
                    }
                );
            }, true);
        }

        // ------------------------------------------------------------
        // Checkbox-Controlled Restore Modal
        // ------------------------------------------------------------
        let restoreContext = null; // { parentType, parentId }

        function groupHtml(label, type, items) {
            if (!items || items.length === 0) return "";
            const rows = items.map((it) => `
                <label class="checkbox-label" style="display: flex; align-items: center; margin-bottom: 8px;">
                    <input type="checkbox" class="restore-item-checkbox" data-type="${type}" data-id="${it.id}" checked>
                    <span style="margin-left: 8px;">${escapeHtml(it.name)}</span>
                </label>
            `).join("");
            return `
                <div class="form-section-group" style="margin-bottom: 14px;">
                    <span class="form-section-label">${label}</span>
                    ${rows}
                </div>
            `;
        }

        function openRestoreModal(parentType, parentId, parentLabel) {
            if (!restoreModal) return;
            restoreContext = { parentType, parentId };
            if (restoreTitle) restoreTitle.textContent = `Restore ${parentLabel}`;
            if (restoreIntro) {
                restoreIntro.textContent = `This ${parentType} was archived along with the connected items below. Choose which ones to bring back along with it.`;
            }
            if (restoreGroups) restoreGroups.innerHTML = `<p class="text-muted">Loading connected items&hellip;</p>`;
            if (restoreSelectAll) restoreSelectAll.checked = true;

            restoreModal.style.display = "flex";

            const optionsUrl = parentType === "category"
                ? `/admin/manage-course/categories/${parentId}/restore-options`
                : `/admin/manage-course/modules/${parentId}/restore-options`;

            fetch(optionsUrl, { credentials: "include" })
                .then((r) => r.json())
                .then((result) => {
                    if (!result.success) {
                        restoreGroups.innerHTML = `<p class="text-muted">Could not load connected items.</p>`;
                        return;
                    }
                    let html = "";
                    if (parentType === "category") {
                        html += groupHtml("Modules", "module", result.modules);
                    }
                    html += groupHtml("Learning Resources", "resource", result.resources);
                    html += groupHtml("Learning Activities", "activity", result.activities);
                    html += groupHtml("Coding Exercises", "exercise", result.exercises);

                    restoreGroups.innerHTML = html || `<p class="text-muted">No connected items were archived alongside this ${parentType}.</p>`;
                })
                .catch(() => {
                    restoreGroups.innerHTML = `<p class="text-muted">Could not reach the server.</p>`;
                });
        }

        function closeRestoreModal() {
            if (restoreModal) restoreModal.style.display = "none";
            restoreContext = null;
        }

        if (closeRestoreBtn) closeRestoreBtn.addEventListener("click", closeRestoreModal);
        if (cancelRestoreBtn) cancelRestoreBtn.addEventListener("click", closeRestoreModal);
        if (restoreModal) {
            restoreModal.addEventListener("click", (e) => {
                if (e.target === restoreModal) closeRestoreModal();
            });
        }
        if (restoreSelectAll) {
            restoreSelectAll.addEventListener("change", () => {
                document.querySelectorAll(".restore-item-checkbox").forEach((cb) => {
                    cb.checked = restoreSelectAll.checked;
                });
            });
        }

        if (confirmRestoreBtn) {
            confirmRestoreBtn.addEventListener("click", () => {
                if (!restoreContext) return;
                const { parentType, parentId } = restoreContext;

                const selected = { module_ids: [], resource_ids: [], activity_ids: [], exercise_ids: [] };
                document.querySelectorAll(".restore-item-checkbox:checked").forEach((cb) => {
                    const type = cb.dataset.type;
                    const id = parseInt(cb.dataset.id, 10);
                    if (type === "module") selected.module_ids.push(id);
                    else if (type === "resource") selected.resource_ids.push(id);
                    else if (type === "activity") selected.activity_ids.push(id);
                    else if (type === "exercise") selected.exercise_ids.push(id);
                });

                const restoreUrl = parentType === "category"
                    ? `/admin/manage-course/categories/${parentId}/restore-selected`
                    : `/admin/manage-course/modules/${parentId}/restore-selected`;

                confirmRestoreBtn.disabled = true;
                fetch(restoreUrl, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(selected),
                })
                    .then((r) => r.json())
                    .then((result) => {
                        confirmRestoreBtn.disabled = false;
                        if (!result.success) {
                            showAlert(result.message || "Could not restore this item.", "Error");
                            return;
                        }
                        closeRestoreModal();
                        showAlert(result.message || "Restored successfully.", "Restored");
                        if (typeof window.cobraByteRefreshManageCourse === "function") {
                            window.cobraByteRefreshManageCourse();
                        } else {
                            window.location.reload();
                        }
                    })
                    .catch(() => {
                        confirmRestoreBtn.disabled = false;
                        showAlert("Could not reach the server. Please try again.", "Error");
                    });
            });
        }

        // ------------------------------------------------------------
        // Restore button interception (Archived Modules/Categories modal)
        // ------------------------------------------------------------
        const archivedModulesTableBody = document.getElementById("archivedModulesTableBody");
        if (archivedModulesTableBody) {
            archivedModulesTableBody.addEventListener("click", (e) => {
                const btn = e.target.closest(".js-restore-module");
                if (!btn) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                const id = btn.dataset.id;
                if (!id) return;
                openRestoreModal("module", id, "Module");
            }, true);
        }

        const archivedCategoriesTableBody = document.getElementById("archivedCategoriesTableBody");
        if (archivedCategoriesTableBody) {
            archivedCategoriesTableBody.addEventListener("click", (e) => {
                const btn = e.target.closest(".js-restore-category");
                if (!btn) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                const id = btn.dataset.id;
                if (!id) return;
                openRestoreModal("category", id, "Category");
            }, true);
        }
    });
})();