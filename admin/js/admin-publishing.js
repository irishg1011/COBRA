/**
 * admin-publishing.js - Task #publishing-page-frontend &
 * Task #publishing-reorder-frontend
 * --------------------------------------------------------------------
 * Renders the Publishing page's tree (Category > Module > Lesson >
 * Activities/Exercises) from the JSON already embedded in the page by
 * admin_routes.py's publishing() route, filtered by the active tab,
 * with a status badge next to each name, an inline Publish/Unpublish
 * button wired to the real per-type publish/unpublish endpoints, and
 * a name-click popover offering Edit / Preview.
 *
 * Also adds "Edit Order" mode: drag handle + up/down arrows on
 * categories, modules and lessons (never activities/exercises - those
 * aren't reorderable), Save Changes persisting via
 * /admin/publishing/reorder, and Cancel reverting to a snapshot taken
 * the moment edit mode was entered.
 *
 * Reuses the SAME #confirmActionModal shell every other admin page
 * relies on - no separate confirm flow introduced here.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("publishingTreeRoot");
        if (!root) return;

        const tabReady = document.getElementById("pubTabReady");
        const tabPublished = document.getElementById("pubTabPublished");
        const readyCountEl = document.getElementById("pubReadyCount");
        const publishedCountEl = document.getElementById("pubPublishedCount");
        const orderActionsEl = document.getElementById("pubOrderActions");
        const editBannerEl = document.getElementById("pubEditBanner");
        const hintEl = document.getElementById("pubHint");

        let tree = [];
        try {
            tree = JSON.parse(root.dataset.tree || "[]");
        } catch (e) {
            tree = [];
        }

        let activeTab = "ready";
        let expanded = {};   // id -> bool, default expanded
        let openPopover = null;
        let editOrder = false;
        let snapshot = null;
        let draggedId = null;

        // ------------------------------------------------------------
        // Shared confirm/info modal
        // ------------------------------------------------------------
        const confirmActionModal = document.getElementById("confirmActionModal");
        const confirmActionTitle = document.getElementById("confirmActionTitle");
        const confirmActionText = document.getElementById("confirmActionText");
        const confirmActionCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmActionConfirmBtn = document.getElementById("confirmActionConfirmBtn");
        let pendingConfirmAction = null;

        function showAlertModal(message, title = "Notice") {
            if (!confirmActionModal) { alert(message); return; }
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

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        // ------------------------------------------------------------
        // Per-type endpoint / edit-page / preview config
        // ------------------------------------------------------------
        function typeOf(nodeId) { return nodeId.split("-")[0]; }
        function numId(nodeId) { return nodeId.split("-")[1]; }

        function endpointsFor(type, id) {
            const n = numId(id);
            switch (type) {
                case "cat": return {
                    publish: `/admin/manage-course/categories/${n}/publish`,
                    unpublish: `/admin/publishing/categories/${n}/unpublish`,
                };
                case "mod": return {
                    publish: `/admin/manage-course/modules/${n}/publish`,
                    unpublish: `/admin/publishing/modules/${n}/unpublish`,
                };
                case "res": return {
                    publish: `/admin/learning-resources/${n}/publish`,
                    unpublish: `/admin/publishing/resources/${n}/unpublish`,
                };
                case "act": return {
                    publish: `/admin/learning-activities/${n}/publish`,
                    unpublish: `/admin/publishing/activities/${n}/unpublish`,
                };
                case "ex": return {
                    publish: `/admin/coding-exercises/${n}/publish`,
                    unpublish: `/admin/publishing/exercises/${n}/unpublish`,
                };
            }
            return {};
        }

        function editUrlFor(type, id) {
            const n = numId(id);
            switch (type) {
                case "cat":
                case "mod": return "/admin/manage-course";
                case "res": return `/admin/upload-resource?resource_id=${n}`;
                case "act": return `/admin/create-learning-activity?activity_id=${n}`;
                case "ex": return `/admin/coding-exercises/create?exercise_id=${n}`;
            }
            return "#";
        }

        async function showPreview(type, id, parentResourceId) {
            const n = numId(id);
            if (type === "res") {
                try {
                    const resp = await fetch(`/admin/learning-resources/preview-content?resource_id=${n}`, { credentials: "include" });
                    const result = await resp.json();
                    if (!result.success) { showAlertModal("Could not load a preview for this lesson.", "Preview"); return; }
                    openPreviewOverlay(result.title || "Preview", result.content_html || "<em>No content yet.</em>");
                } catch (e) {
                    showAlertModal("Could not reach the server.", "Error");
                }
                return;
            }
            if (type === "act" && parentResourceId) {
                try {
                    const resp = await fetch(`/admin/learning-activities/preview?resource_id=${numId(parentResourceId)}`, { credentials: "include" });
                    const result = await resp.json();
                    const match = (result.activities || []).find((a) => String(a.activity_id) === n);
                    if (!match) { showAlertModal("Could not load a preview for this activity.", "Preview"); return; }
                    openPreviewOverlay(`${match.activity_type}: ${match.activity_title}`, `<p>Status: ${escapeHtml(match.status)}</p><p>${match.items.length} item(s).</p>`);
                } catch (e) {
                    showAlertModal("Could not reach the server.", "Error");
                }
                return;
            }
            showAlertModal("No preview is available for this item yet.", "Preview");
        }

        function openPreviewOverlay(title, contentHtml) {
            let overlay = document.getElementById("pubPreviewOverlay");
            if (overlay) overlay.remove();
            overlay = document.createElement("div");
            overlay.id = "pubPreviewOverlay";
            overlay.className = "modal-overlay";
            overlay.innerHTML = `
                <div class="content-preview-card">
                    <div class="content-preview-header">
                        <strong>${escapeHtml(title)}</strong>
                        <button type="button" id="pubPreviewCloseBtn" class="modal-close-btn" style="position:static; font-size:22px;">&times;</button>
                    </div>
                    <div class="content-preview-body">${contentHtml}</div>
                </div>`;
            document.body.appendChild(overlay);
            function close() { overlay.remove(); }
            overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
            overlay.querySelector("#pubPreviewCloseBtn").addEventListener("click", close);
        }

        function doEdit(type, id) {
            const url = editUrlFor(type, id);
            showConfirmModal(
                "You'll be taken to the editor for this item. Any unsaved changes here will be kept.",
                () => { window.location.href = url; },
                "Edit this item?"
            );
        }

        // ------------------------------------------------------------
        // Counting + tab filtering (a parent shows if it or any
        // descendant matches the active tab). In Edit Order mode
        // everything shows, regardless of tab.
        // ------------------------------------------------------------
        function collectLeafStatuses(nodes, out) {
            (nodes || []).forEach((n) => {
                out.push(n.status);
                if (n.children) collectLeafStatuses(n.children, out);
                if (n.activities) n.activities.forEach((a) => out.push(a.status));
                if (n.exercises) n.exercises.forEach((e) => out.push(e.status));
            });
        }

        function updateCounts() {
            const all = [];
            collectLeafStatuses(tree, all);
            const readyCount = all.filter((s) => s === "Ready to Publish").length;
            const publishedCount = all.filter((s) => s === "Published").length;
            if (readyCountEl) readyCountEl.textContent = readyCount;
            if (publishedCountEl) publishedCountEl.textContent = publishedCount;
        }

        function matchesTab(node) {
            if (editOrder) return true;
            const wanted = activeTab === "ready" ? "Ready to Publish" : "Published";
            if (node.status === wanted) return true;
            if (node.children && node.children.some(matchesTab)) return true;
            if (node.activities && node.activities.some((a) => a.status === wanted)) return true;
            if (node.exercises && node.exercises.some((e) => e.status === wanted)) return true;
            return false;
        }

        // ------------------------------------------------------------
        // Parent-array lookup for reordering - a category lives in
        // `tree` itself; a module lives in its category's `children`;
        // a lesson lives in its module's `children`.
        // ------------------------------------------------------------
        function findParentArray(id) {
            const idxTop = tree.findIndex((n) => n.id === id);
            if (idxTop !== -1) return { arr: tree, idx: idxTop };
            for (const cat of tree) {
                const idxMod = (cat.children || []).findIndex((n) => n.id === id);
                if (idxMod !== -1) return { arr: cat.children, idx: idxMod };
                for (const mod of (cat.children || [])) {
                    const idxLes = (mod.children || []).findIndex((n) => n.id === id);
                    if (idxLes !== -1) return { arr: mod.children, idx: idxLes };
                }
            }
            return null;
        }

        function moveSibling(id, dir) {
            const found = findParentArray(id);
            if (!found) return;
            const { arr, idx } = found;
            const newIdx = idx + dir;
            if (newIdx < 0 || newIdx >= arr.length) return;
            const tmp = arr[idx];
            arr[idx] = arr[newIdx];
            arr[newIdx] = tmp;
            renderTree();
        }

        // ------------------------------------------------------------
        // Rendering
        // ------------------------------------------------------------
        function badgeHtml(status) {
            if (status === "Published") return `<span class="badge badge-active">${escapeHtml(status)}</span>`;
            if (status === "Ready to Publish") return `<span class="badge badge-ready">${escapeHtml(status)}</span>`;
            return `<span class="badge badge-draft">${escapeHtml(status || "Draft")}</span>`;
        }

        function actionButtonHtml(type, id, status) {
            if (editOrder) return "";
            if (status === "Ready to Publish") {
                return `<button type="button" class="btn btn-success-custom publishing-action-btn js-pub-action" data-action="publish" data-type="${type}" data-id="${id}">Publish</button>`;
            }
            if (status === "Published") {
                return `<button type="button" class="btn btn-unpublish-custom publishing-action-btn js-pub-action" data-action="unpublish" data-type="${type}" data-id="${id}">Unpublish</button>`;
            }
            return "";
        }

        function popoverHtml(type, id, parentResourceId) {
            return `<div class="resource-edit-menu" style="position:absolute; top:26px; left:0; z-index:20;">
                <button type="button" class="resource-edit-menu-item js-pub-edit" data-type="${type}" data-id="${id}"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                <button type="button" class="resource-edit-menu-item js-pub-preview" data-type="${type}" data-id="${id}" data-parent="${parentResourceId || ''}"><i class="fa-regular fa-eye"></i> Preview</button>
            </div>`;
        }

        function orderCtrlsHtml(id) {
            const found = findParentArray(id);
            const atTop = found ? found.idx === 0 : true;
            const atBottom = found ? found.idx === found.arr.length - 1 : true;
            return `
                <div class="publishing-order-ctrls">
                    <button type="button" class="publishing-arrow-btn js-pub-move" data-id="${id}" data-dir="-1" ${atTop ? "disabled" : ""} aria-label="Move up">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                    </button>
                    <button type="button" class="publishing-arrow-btn js-pub-move" data-id="${id}" data-dir="1" ${atBottom ? "disabled" : ""} aria-label="Move down">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                    </button>
                    <span class="publishing-grip" draggable="true" data-id="${id}" aria-label="Drag to reorder">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
                    </span>
                </div>`;
        }

        function renderRow(node, depth, tagClass, tagLabel) {
            const isOpen = expanded[node.id] !== false;
            const hasKids = node.children && node.children.length > 0;
            const chevron = hasKids
                ? `<button type="button" class="publishing-toggle-btn js-pub-toggle" data-id="${node.id}"><i class="fa-solid fa-chevron-${isOpen ? 'down' : 'right'}"></i></button>`
                : `<span class="publishing-toggle-spacer"></span>`;
            const popOpen = openPopover === node.id;

            const nameHtml = editOrder
                ? `<span class="publishing-name-static">${escapeHtml(node.name)}</span>`
                : `<button type="button" class="publishing-name-btn js-pub-name" data-id="${node.id}">${escapeHtml(node.name)}</button>
                   ${popOpen ? popoverHtml(typeOf(node.id), node.id) : ""}`;

            const dragAttrs = editOrder
                ? `data-draggable-row="${node.id}"`
                : "";

            return `
                <div class="publishing-row" style="padding-left:${12 + depth * 26}px;" ${dragAttrs}>
                    ${chevron}
                    <span class="publishing-tag ${tagClass}">${tagLabel}</span>
                    <div class="publishing-name-wrap">
                        ${nameHtml}
                    </div>
                    ${badgeHtml(node.status)}
                    <div class="publishing-spacer"></div>
                    ${editOrder ? orderCtrlsHtml(node.id) : actionButtonHtml(typeOf(node.id), node.id, node.status)}
                </div>`;
        }

        function renderLeafRow(leaf, depth, tagLabel, parentResourceId) {
            const popOpen = openPopover === leaf.id;
            const type = typeOf(leaf.id);
            return `
                <div class="publishing-row publishing-row-leaf" style="padding-left:${12 + depth * 26}px;">
                    <span class="publishing-toggle-spacer"></span>
                    <span class="publishing-tag publishing-tag-leaf">${tagLabel}</span>
                    <div class="publishing-name-wrap">
                        <button type="button" class="publishing-name-btn leaf js-pub-name" data-id="${leaf.id}" data-parent="${parentResourceId}">${escapeHtml(leaf.name)}</button>
                        ${popOpen ? popoverHtml(type, leaf.id, parentResourceId) : ""}
                    </div>
                    ${badgeHtml(leaf.status)}
                    <div class="publishing-spacer"></div>
                    ${actionButtonHtml(type, leaf.id, leaf.status)}
                </div>`;
        }

        function renderTree() {
            const visible = tree.filter(matchesTab);
            if (visible.length === 0) {
                root.innerHTML = `<p class="text-muted publishing-empty">${activeTab === "ready" ? "Nothing waiting to be published." : "Nothing published yet."}</p>`;
                return;
            }

            const out = [];
            visible.forEach((cat) => {
                out.push(renderRow(cat, 0, "publishing-tag-ch", "CH"));
                if (expanded[cat.id] === false) return;
                (cat.children || []).filter(matchesTab).forEach((mod) => {
                    out.push(renderRow(mod, 1, "publishing-tag-mod", "M"));
                    if (expanded[mod.id] === false) return;
                    (mod.children || []).filter(matchesTab).forEach((lesson) => {
                        out.push(renderRow(lesson, 2, "publishing-tag-les", "L"));
                        if (expanded[lesson.id] === false) return;
                        if (editOrder) return; // leaves aren't reorderable/shown in Edit Order mode
                        const wanted = activeTab === "ready" ? "Ready to Publish" : "Published";
                        (lesson.activities || []).filter((a) => a.status === wanted).forEach((a) => {
                            out.push(renderLeafRow(a, 3, "A", lesson.id));
                        });
                        (lesson.exercises || []).filter((e) => e.status === wanted).forEach((e) => {
                            out.push(renderLeafRow(e, 3, "E", lesson.id));
                        });
                    });
                });
            });

            root.innerHTML = out.join("");

            if (editOrder) wireDragHandles();
        }

        function findNode(id, nodes) {
            nodes = nodes || tree;
            for (const n of nodes) {
                if (n.id === id) return n;
                if (n.children) {
                    const f = findNode(id, n.children);
                    if (f) return f;
                }
                if (n.activities) {
                    const a = n.activities.find((x) => x.id === id);
                    if (a) return a;
                }
                if (n.exercises) {
                    const e = n.exercises.find((x) => x.id === id);
                    if (e) return e;
                }
            }
            return null;
        }

                function findParentNode(id) {
            for (const cat of tree) {
                if ((cat.children || []).some((m) => m.id === id)) return cat;
                for (const mod of (cat.children || [])) {
                    if ((mod.children || []).some((l) => l.id === id)) return mod;
                    for (const les of (mod.children || [])) {
                        if ((les.activities || []).some((a) => a.id === id)) return les;
                        if ((les.exercises || []).some((e) => e.id === id)) return les;
                    }
                }
            }
            return null;
        }

        function countPublishedDescendants(node) {
            let count = 0;
            (node.children || []).forEach((child) => {
                if (child.status === "Published") count++;
                count += countPublishedDescendants(child);
            });
            (node.activities || []).forEach((a) => { if (a.status === "Published") count++; });
            (node.exercises || []).forEach((e) => { if (e.status === "Published") count++; });
            return count;
        }

        // ------------------------------------------------------------
        // Refresh the whole tree from the server (after any publish/
        // unpublish action) - simplest correct way to reflect a status
        // change without hand-patching the in-memory tree.
        // ------------------------------------------------------------
        async function refreshTree() {
            try {
                const resp = await fetch("/admin/publishing/data", { credentials: "include" });
                const result = await resp.json();
                if (result.success) {
                    tree = result.tree || [];
                    updateCounts();
                    renderTree();
                }
            } catch (e) {
                // leave the stale tree in place rather than blanking the page
            }
        }

        // ------------------------------------------------------------
        // Edit Order mode
        // ------------------------------------------------------------
        function setOrderActionsHtml() {
            if (!orderActionsEl) return;
            if (editOrder) {
                orderActionsEl.innerHTML = `
                    <button type="button" class="btn btn-ghost-custom" id="pubCancelOrderBtn">Cancel</button>
                    <button type="button" class="btn btn-success-custom" id="pubSaveOrderBtn">Save Changes</button>`;
                orderActionsEl.querySelector("#pubCancelOrderBtn").addEventListener("click", cancelEditOrder);
                orderActionsEl.querySelector("#pubSaveOrderBtn").addEventListener("click", saveEditOrder);
            } else {
                orderActionsEl.innerHTML = `<button type="button" id="pubEditOrderBtn" class="btn btn-editorder-custom">Edit Order</button>`;
                orderActionsEl.querySelector("#pubEditOrderBtn").addEventListener("click", startEditOrder);
            }
        }

        function startEditOrder() {
            editOrder = true;
            snapshot = JSON.stringify(tree);
            openPopover = null;
            if (tabReady) tabReady.disabled = true;
            if (tabPublished) tabPublished.disabled = true;
            if (editBannerEl) editBannerEl.classList.add("show");
            if (hintEl) hintEl.classList.add("hide");
            setOrderActionsHtml();
            renderTree();
        }

        function cancelEditOrder() {
            tree = JSON.parse(snapshot);
            editOrder = false;
            snapshot = null;
            if (tabReady) tabReady.disabled = false;
            if (tabPublished) tabPublished.disabled = false;
            if (editBannerEl) editBannerEl.classList.remove("show");
            if (hintEl) hintEl.classList.remove("hide");
            setOrderActionsHtml();
            updateCounts();
            renderTree();
        }

        async function postReorder(type, parentId, orderedIds) {
            const resp = await fetch("/admin/publishing/reorder", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, parent_id: parentId, ordered_ids: orderedIds }),
            });
            return resp.json().catch(() => ({ success: false }));
        }

        async function saveEditOrder() {
            const saveBtn = document.getElementById("pubSaveOrderBtn");
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }

            const requests = [];
            requests.push(postReorder("category", null, tree.map((c) => numId(c.id))));
            tree.forEach((cat) => {
                if ((cat.children || []).length) {
                    requests.push(postReorder("module", numId(cat.id), cat.children.map((m) => numId(m.id))));
                }
                (cat.children || []).forEach((mod) => {
                    if ((mod.children || []).length) {
                        requests.push(postReorder("lesson", numId(mod.id), mod.children.map((l) => numId(l.id))));
                    }
                });
            });

            const results = await Promise.all(requests);
            const failed = results.filter((r) => !r.success);

            editOrder = false;
            snapshot = null;
            if (tabReady) tabReady.disabled = false;
            if (tabPublished) tabPublished.disabled = false;
            if (editBannerEl) editBannerEl.classList.remove("show");
            if (hintEl) hintEl.classList.remove("hide");
            setOrderActionsHtml();

            if (failed.length > 0) {
                showAlertModal("Some of the new order could not be saved. Please try again.", "Order Not Fully Saved");
            }

            await refreshTree();
        }

        // ------------------------------------------------------------
        // Drag and drop - only among the same parent array, exactly
        // like the up/down arrows.
        // ------------------------------------------------------------
        function wireDragHandles() {
            root.querySelectorAll(".publishing-grip").forEach((grip) => {
                grip.addEventListener("dragstart", (e) => {
                    draggedId = grip.dataset.id;
                    e.dataTransfer.effectAllowed = "move";
                    const row = grip.closest(".publishing-row");
                    if (row) setTimeout(() => row.classList.add("dragging"), 0);
                });
                grip.addEventListener("dragend", () => {
                    root.querySelectorAll(".publishing-row.dragging, .publishing-row.drag-over").forEach((r) => {
                        r.classList.remove("dragging", "drag-over");
                    });
                });
            });

            root.querySelectorAll("[data-draggable-row]").forEach((row) => {
                const overId = row.dataset.draggableRow;
                row.addEventListener("dragover", (e) => {
                    if (!draggedId || draggedId === overId) return;
                    e.preventDefault();
                    root.querySelectorAll(".publishing-row.drag-over").forEach((r) => r.classList.remove("drag-over"));
                    row.classList.add("drag-over");
                });
                row.addEventListener("dragleave", () => {
                    row.classList.remove("drag-over");
                });
                row.addEventListener("drop", (e) => {
                    e.preventDefault();
                    row.classList.remove("drag-over");
                    if (!draggedId || draggedId === overId) { draggedId = null; return; }

                    const source = findParentArray(draggedId);
                    const target = findParentArray(overId);
                    if (!source || !target || source.arr !== target.arr) {
                        showAlertModal("You can only reorder items within the same parent.", "Can't Move There");
                        draggedId = null;
                        return;
                    }
                    const [moved] = source.arr.splice(source.idx, 1);
                    const newTargetIdx = target.arr.indexOf(findNode(overId));
                    source.arr.splice(newTargetIdx, 0, moved);
                    draggedId = null;
                    renderTree();
                });
            });
        }

        // ------------------------------------------------------------
        // Event delegation
        // ------------------------------------------------------------
        root.addEventListener("click", (e) => {
            const toggle = e.target.closest(".js-pub-toggle");
            if (toggle) {
                const id = toggle.dataset.id;
                expanded[id] = expanded[id] === false ? true : false;
                renderTree();
                return;
            }

            const moveBtn = e.target.closest(".js-pub-move");
            if (moveBtn) {
                moveSibling(moveBtn.dataset.id, parseInt(moveBtn.dataset.dir, 10));
                return;
            }

            const nameBtn = e.target.closest(".js-pub-name");
            if (nameBtn) {
                e.stopPropagation();
                const id = nameBtn.dataset.id;
                openPopover = openPopover === id ? null : id;
                renderTree();
                return;
            }

            const editBtn = e.target.closest(".js-pub-edit");
            if (editBtn) {
                openPopover = null;
                doEdit(editBtn.dataset.type, editBtn.dataset.id);
                renderTree();
                return;
            }

            const previewBtn = e.target.closest(".js-pub-preview");
            if (previewBtn) {
                openPopover = null;
                showPreview(previewBtn.dataset.type, previewBtn.dataset.id, previewBtn.dataset.parent);
                renderTree();
                return;
            }

            const actionBtn = e.target.closest(".js-pub-action");
            if (actionBtn) {
                const type = actionBtn.dataset.type;
                const id = actionBtn.dataset.id;
                const action = actionBtn.dataset.action;
                const node = findNode(id);
                const label = node ? node.name : "this item";
                const endpoints = endpointsFor(type, id);
                const url = action === "publish" ? endpoints.publish : endpoints.unpublish;

                if (action === "publish") {
                    const parent = findParentNode(id);
                    if (parent && parent.status !== "Published") {
                        showAlertModal(
                            `Cannot publish "${label}" - its parent "${parent.name}" is still ${parent.status}. Publish the parent first.`,
                            "Cannot Publish"
                        );
                        return;
                    }
                }

                let confirmMsg;
                if (action === "publish") {
                    confirmMsg = `Are you sure you want to publish "${label}"? It will become visible to learners.`;
                } else {
                    const descCount = node ? countPublishedDescendants(node) : 0;
                    confirmMsg = descCount > 0
                        ? `Are you sure you want to unpublish "${label}"? It will be moved to Ready to Publish, and ${descCount} other published item(s) under it will move to Ready to Publish too.`
                        : `Are you sure you want to unpublish "${label}"? It will be moved back to Ready to Publish and hidden from learners.`;
                }

                showConfirmModal(confirmMsg, async () => {
                    try {
                        const resp = await fetch(url, { method: "POST", credentials: "include" });
                        const result = await resp.json();
                        if (!result.success) {
                            showAlertModal(result.message || "Could not update this item's status.", "Error");
                            return;
                        }
                        await refreshTree();
                    } catch (err) {
                        showAlertModal("Could not reach the server. Please try again.", "Error");
                    }
                }, action === "publish" ? "Publish?" : "Unpublish?");
                return;
            }
        });

        document.addEventListener("click", (e) => {
            if (!e.target.closest(".js-pub-name") && !e.target.closest(".resource-edit-menu") && openPopover) {
                openPopover = null;
                renderTree();
            }
        });

        function setTab(tab) {
            if (editOrder) return;
            activeTab = tab;
            openPopover = null;
            if (tabReady) tabReady.classList.toggle("active", tab === "ready");
            if (tabPublished) tabPublished.classList.toggle("active", tab === "published");
            renderTree();
        }

        if (tabReady) tabReady.addEventListener("click", () => setTab("ready"));
        if (tabPublished) tabPublished.addEventListener("click", () => setTab("published"));

        setOrderActionsHtml();
        updateCounts();
        renderTree();
    });
})();