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
 *      - GET every archived descendant as a Module > Lesson > item tree.
 *      - Open #restoreSelectionModal with one checkbox per item, plus a
 *        "Select All" toggle - for one parent (its Restore icon) or for
 *        several at once (window.cobraByteOpenRestoreChecklist, used by
 *        admin-bulk-restore.js's "Restore selected").
 *      - On confirm, POST /admin/archive/bulk-restore: each parent PLUS
 *        only its checked items; duplicates are skipped and reported.
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

        // Extra HTML block under the modal text (the "Cannot Archive" tree).
        // Created once, emptied every time the modal closes so another
        // page's plain-text message never shows a stale tree.
        let confirmActionDetails = null;
        function setDetails(html) {
            if (!confirmActionText) return;
            if (!confirmActionDetails) {
                confirmActionDetails = document.createElement("div");
                confirmActionDetails.className = "archive-blocker-details";
                confirmActionText.insertAdjacentElement("afterend", confirmActionDetails);
            }
            confirmActionDetails.innerHTML = html || "";
            confirmActionDetails.style.display = html ? "" : "none";
        }

        function showAlert(message, title, detailsHtml) {
            if (!confirmActionModal) { alert(message); return; }
            pendingConfirm = null;
            setDetails(detailsHtml);
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
            setDetails("");
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
            setDetails("");
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
        const BLOCKER_ICONS = {
            "Module": "fa-layer-group",
            "Lesson Content": "fa-file-lines",
            "Video Tutorial": "fa-circle-play",
            "Coding Exercise": "fa-code",
            "Multiple Choice": "fa-list-check",
            "Quiz": "fa-list-check",
            "Fill in the Blanks": "fa-pen-to-square",
            "Flashcards": "fa-clone",
        };

        // blockers: [{type, title, category, module, lesson}] -> Module > Lesson > item tree
        function blockersTreeHtml(blockers) {
            const modules = new Map();
            const real = (v) => v && v !== "\u2014";
            blockers.forEach((b) => {
                const moduleName = real(b.module) ? b.module : (b.type === "Module" ? b.title : "Other");
                if (!modules.has(moduleName)) modules.set(moduleName, { published: false, lessons: new Map() });
                const mod = modules.get(moduleName);
                if (b.type === "Module") { mod.published = true; return; }
                const lessonName = real(b.lesson) ? b.lesson : "";
                if (!mod.lessons.has(lessonName)) mod.lessons.set(lessonName, []);
                mod.lessons.get(lessonName).push(b);
            });

            const badge = `<span class="archive-tree-badge">Published</span>`;
            const itemHtml = (b) => {
                const icon = BLOCKER_ICONS[b.type] || "fa-puzzle-piece";
                const label = b.type === "Lesson Content"
                    ? "Lesson Content"
                    : `${escapeHtml(b.type)}: <span class="archive-tree-title">${escapeHtml(b.title)}</span>`;
                return `<li><i class="fa-solid ${icon}"></i> ${label}</li>`;
            };

            let html = `<ul class="archive-tree">`;
            modules.forEach((mod, moduleName) => {
                html += `<li><div class="archive-tree-node"><i class="fa-solid fa-layer-group"></i>
                            <strong>${escapeHtml(moduleName)}</strong>${mod.published ? badge : ""}</div>`;
                if (mod.lessons.size) {
                    html += `<ul>`;
                    mod.lessons.forEach((items, lessonName) => {
                        if (!lessonName) { html += items.map(itemHtml).join(""); return; }
                        html += `<li><div class="archive-tree-node"><i class="fa-solid fa-book-open"></i>
                                    <span>${escapeHtml(lessonName)}</span></div>
                                    <ul>${items.map(itemHtml).join("")}</ul></li>`;
                    });
                    html += `</ul>`;
                }
                html += `</li>`;
            });
            return html + `</ul>`;
        }

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
                        // Grouped Module > Lesson > item, so the path is
                        // never repeated on every line.
                        showAlert(
                            `This ${itemLabel} still has published content. ` +
                            `You must unpublish these items first before you can archive this parent record.`,
                            "Cannot Archive",
                            blockersTreeHtml(result.blockers || [])
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
        // Checkbox-Controlled Restore Modal - one or many Categories /
        // Modules. Each parent gets a tree of what was archived with it
        // (Module > Lesson > Video / Activities / Exercise). The parent
        // itself is always restored; a child only when ticked. Ticking a
        // child ticks the archived lesson / module above it; unticking
        // a lesson / module unticks everything under it.
        // ------------------------------------------------------------
        let restoreParents = [];   // [{type, id, name}]
        let restoreOnDone = null;

        const ITEM_ICONS = { video: "fa-circle-play", activity: "fa-list-check", exercise: "fa-code" };

        function checkNode(type, id, label, iconClass, checked) {
            return `
                <label class="checkbox-label restore-item-label">
                    <input type="checkbox" class="restore-item-checkbox" data-type="${type}" data-id="${id}" ${checked ? "checked" : ""}>
                    <i class="fa-solid ${iconClass} restore-item-icon"></i>
                    <span class="restore-item-name">${label}</span>
                </label>`;
        }

        function plainNode(label, iconClass) {
            return `
                <div class="restore-item-label restore-item-active" title="Already active - not archived">
                    <i class="fa-solid ${iconClass} restore-item-icon"></i>
                    <span class="restore-item-name">${label}</span>
                    <span class="restore-active-tag">active</span>
                </div>`;
        }

        function lessonHtml(lesson) {
            const items = lesson.items.map((it) => `
                <li>${checkNode(it.type, it.id,
                    `${escapeHtml(it.label)}: ${escapeHtml(it.name)}`, ITEM_ICONS[it.type] || "fa-puzzle-piece", true)}</li>`).join("");
            const head = lesson.archived
                ? checkNode("resource", lesson.id, escapeHtml(lesson.name), "fa-book-open", true)
                : plainNode(escapeHtml(lesson.name), "fa-book-open");
            return `<li>${head}${items ? `<ul class="restore-tree">${items}</ul>` : ""}</li>`;
        }

        function parentHtml(parent, options) {
            const icon = parent.type === "category" ? "fa-folder" : "fa-layer-group";
            const kind = parent.type === "category" ? "Category" : "Module";
            let tree = "";
            if (parent.type === "module") {
                const lessons = (options.modules[0] || { lessons: [] }).lessons;
                tree = lessons.map(lessonHtml).join("");
            } else {
                tree = options.modules.map((m) => {
                    const head = m.archived
                        ? checkNode("module", m.id, escapeHtml(m.name), "fa-layer-group", true)
                        : plainNode(escapeHtml(m.name), "fa-layer-group");
                    const lessons = m.lessons.map(lessonHtml).join("");
                    return `<li>${head}${lessons ? `<ul class="restore-tree">${lessons}</ul>` : ""}</li>`;
                }).join("");
            }
            return `
                <div class="restore-parent" data-type="${parent.type}" data-id="${parent.id}">
                    <div class="restore-parent-head">
                        <i class="fa-solid ${icon}"></i>
                        <strong>${escapeHtml(options.name || parent.name || kind)}</strong>
                        <span class="restore-parent-kind">${kind} &middot; always restored</span>
                    </div>
                    ${tree
                        ? `<ul class="restore-tree restore-tree-root">${tree}</ul>`
                        : `<p class="text-muted restore-parent-empty">Nothing else was archived with this ${kind.toLowerCase()}.</p>`}
                </div>`;
        }

        function syncSelectAll() {
            if (!restoreSelectAll || !restoreGroups) return;
            const boxes = Array.from(restoreGroups.querySelectorAll(".restore-item-checkbox"));
            const ticked = boxes.filter((cb) => cb.checked).length;
            restoreSelectAll.checked = boxes.length > 0 && ticked === boxes.length;
            restoreSelectAll.indeterminate = ticked > 0 && ticked < boxes.length;
            restoreSelectAll.disabled = boxes.length === 0;
        }

        function openRestoreChecklist(parents, onDone) {
            if (!restoreModal || !parents || !parents.length) return;
            restoreParents = parents;
            restoreOnDone = typeof onDone === "function" ? onDone : null;

            const single = parents.length === 1;
            const kind = parents[0].type === "category" ? "Category" : "Module";
            if (restoreTitle) {
                restoreTitle.textContent = single ? `Restore ${kind}` : `Restore ${parents.length} ${kind === "Category" ? "Categories" : "Modules"}`;
            }
            if (restoreIntro) {
                restoreIntro.textContent = single
                    ? `These were archived together with this ${kind.toLowerCase()}. Tick the ones to bring back with it. Everything comes back as Draft.`
                    : `Each ${kind.toLowerCase()} below is restored with the items you tick under it. Everything comes back as Draft.`;
            }
            if (restoreGroups) restoreGroups.innerHTML = `<p class="text-muted">Loading archived items&hellip;</p>`;
            if (restoreSelectAll) { restoreSelectAll.checked = true; restoreSelectAll.indeterminate = false; }
            if (confirmRestoreBtn) confirmRestoreBtn.disabled = true;
            restoreModal.style.display = "flex";

            Promise.all(parents.map((p) => {
                const url = p.type === "category"
                    ? `/admin/manage-course/categories/${p.id}/restore-options`
                    : `/admin/manage-course/modules/${p.id}/restore-options`;
                return fetch(url, { credentials: "include" })
                    .then((r) => r.json())
                    .catch(() => ({ success: false }));
            })).then((results) => {
                if (!restoreGroups) return;
                restoreGroups.innerHTML = results.map((res, i) => res && res.success
                    ? parentHtml(parents[i], res)
                    : `<div class="restore-parent"><p class="text-muted">Could not load the archived items of
                          &ldquo;${escapeHtml(parents[i].name || "this item")}&rdquo;.</p></div>`).join("");
                if (confirmRestoreBtn) confirmRestoreBtn.disabled = false;
                syncSelectAll();
            });
        }
        window.cobraByteOpenRestoreChecklist = openRestoreChecklist;

        function closeRestoreModal() {
            if (restoreModal) restoreModal.style.display = "none";
            restoreParents = [];
            restoreOnDone = null;
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
                if (!restoreGroups) return;
                restoreGroups.querySelectorAll(".restore-item-checkbox").forEach((cb) => {
                    cb.checked = restoreSelectAll.checked;
                });
                syncSelectAll();
            });
        }
        if (restoreGroups) {
            restoreGroups.addEventListener("change", (e) => {
                const cb = e.target;
                if (!cb.classList || !cb.classList.contains("restore-item-checkbox")) return;
                const li = cb.closest("li");
                if (cb.checked) {
                    // a child needs its archived lesson / module back too
                    let up = li ? li.parentElement.closest("li") : null;
                    while (up) {
                        const own = up.querySelector(":scope > label .restore-item-checkbox");
                        if (own) own.checked = true;
                        up = up.parentElement.closest("li");
                    }
                } else if (li) {
                    li.querySelectorAll("ul .restore-item-checkbox").forEach((child) => { child.checked = false; });
                }
                syncSelectAll();
            });
        }

        function refreshAfterRestore(done) {
            if (typeof done === "function") done();
            if (typeof window.cobraByteRefreshManageCourse === "function") {
                window.cobraByteRefreshManageCourse();
            } else {
                window.location.reload();
            }
        }

        if (confirmRestoreBtn) {
            confirmRestoreBtn.addEventListener("click", () => {
                if (!restoreParents.length || !restoreGroups) return;

                const items = Array.from(restoreGroups.querySelectorAll(".restore-parent[data-id]")).map((box) => {
                    const children = { module_ids: [], resource_ids: [], video_ids: [], activity_ids: [], exercise_ids: [] };
                    box.querySelectorAll(".restore-item-checkbox:checked").forEach((cb) => {
                        const key = `${cb.dataset.type}_ids`;
                        if (children[key]) children[key].push(parseInt(cb.dataset.id, 10));
                    });
                    return { type: box.dataset.type, id: parseInt(box.dataset.id, 10), children };
                });
                if (!items.length) return;

                confirmRestoreBtn.disabled = true;
                fetch("/admin/archive/bulk-restore", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items }),
                })
                    .then((r) => r.json())
                    .then((result) => {
                        confirmRestoreBtn.disabled = false;
                        if (!result.restored && !result.skipped) {
                            showAlert(result.message || "Could not restore the selected items.", "Error");
                            return;
                        }
                        const onDone = restoreOnDone;
                        closeRestoreModal();
                        if (window.CobraBulkRestore) {
                            window.CobraBulkRestore.showSummary(result);
                        } else {
                            showAlert(result.message || "Restored.", "Restored");
                        }
                        refreshAfterRestore(onDone);
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
        function rowName(btn) {
            const row = btn.closest("tr");
            const title = row ? row.querySelector(".table-item-title") : null;
            return title ? title.textContent.trim() : "";
        }

        const archivedModulesTableBody = document.getElementById("archivedModulesTableBody");
        if (archivedModulesTableBody) {
            archivedModulesTableBody.addEventListener("click", (e) => {
                const btn = e.target.closest(".js-restore-module");
                if (!btn) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                const id = parseInt(btn.dataset.id, 10);
                if (!id) return;
                openRestoreChecklist([{ type: "module", id, name: rowName(btn) }]);
            }, true);
        }

        const archivedCategoriesTableBody = document.getElementById("archivedCategoriesTableBody");
        if (archivedCategoriesTableBody) {
            archivedCategoriesTableBody.addEventListener("click", (e) => {
                const btn = e.target.closest(".js-restore-category");
                if (!btn) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                const id = parseInt(btn.dataset.id, 10);
                if (!id) return;
                openRestoreChecklist([{ type: "category", id, name: rowName(btn) }]);
            }, true);
        }
    });
})();