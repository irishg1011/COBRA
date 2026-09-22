/**
 * admin-publishing.js - Task #publishing-page-frontend
 * --------------------------------------------------------------------
 * Renders the Publishing page's tree (Category > Module > Lesson >
 * Activities/Exercises) from the JSON already embedded in the page by
 * admin_routes.py's publishing() route, filtered by the active tab,
 * with a status badge next to each name, an inline Publish/Unpublish
 * button wired to the real per-type publish/unpublish endpoints, and
 * a name-click popover offering Edit / Preview.
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

        let tree = [];
        try {
            tree = JSON.parse(root.dataset.tree || "[]");
        } catch (e) {
            tree = [];
        }

        let activeTab = "ready";
        let expanded = {};   // id -> bool, default expanded
        let openPopover = null;

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
        function numId(nodeId) { return nodeId.split("-")[1]; }

        function endpointsFor(type, id) {
            const n = numId(id);
            switch (type) {
                case "category": return {
                    publish: `/admin/manage-course/categories/${n}/publish`,
                    unpublish: `/admin/manage-course/categories/${n}/move-to-draft`,
                };
                case "module": return {
                    publish: `/admin/manage-course/modules/${n}/publish`,
                    unpublish: `/admin/manage-course/modules/${n}/unpublish`,
                };
                case "lesson": return {
                    publish: `/admin/learning-resources/${n}/publish`,
                    unpublish: `/admin/learning-resources/${n}/unpublish`,
                };
                case "activity": return {
                    publish: `/admin/learning-activities/${n}/publish`,
                    unpublish: `/admin/learning-activities/${n}/unpublish`,
                };
                case "exercise": return {
                    publish: `/admin/coding-exercises/${n}/publish`,
                    unpublish: `/admin/coding-exercises/${n}/unpublish`,
                };
            }
            return {};
        }

        function editUrlFor(type, id) {
            const n = numId(id);
            switch (type) {
                case "category":
                case "module": return "/admin/manage-course";
                case "lesson": return `/admin/upload-resource?resource_id=${n}`;
                case "activity": return `/admin/create-learning-activity?activity_id=${n}`;
                case "exercise": return `/admin/coding-exercises/create?exercise_id=${n}`;
            }
            return "#";
        }

        async function showPreview(type, id, parentResourceId) {
            const n = numId(id);
            if (type === "lesson") {
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
            if (type === "activity" && parentResourceId) {
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
        // descendant matches the active tab).
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
            const wanted = activeTab === "ready" ? "Ready to Publish" : "Published";
            if (node.status === wanted) return true;
            if (node.children && node.children.some(matchesTab)) return true;
            if (node.activities && node.activities.some((a) => a.status === wanted)) return true;
            if (node.exercises && node.exercises.some((e) => e.status === wanted)) return true;
            return false;
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

        function renderRow(node, depth, tagClass, tagLabel) {
            const isOpen = expanded[node.id] !== false;
            const hasKids = node.children && node.children.length > 0;
            const chevron = hasKids
                ? `<button type="button" class="publishing-toggle-btn js-pub-toggle" data-id="${node.id}"><i class="fa-solid fa-chevron-${isOpen ? 'down' : 'right'}"></i></button>`
                : `<span class="publishing-toggle-spacer"></span>`;
            const popOpen = openPopover === node.id;
            return `
                <div class="publishing-row" style="padding-left:${12 + depth * 26}px;">
                    ${chevron}
                    <span class="publishing-tag ${tagClass}">${tagLabel}</span>
                    <div class="publishing-name-wrap">
                        <button type="button" class="publishing-name-btn js-pub-name" data-id="${node.id}">${escapeHtml(node.name)}</button>
                        ${popOpen ? popoverHtml(node.id.split("-")[0], node.id) : ""}
                    </div>
                    ${badgeHtml(node.status)}
                    <div class="publishing-spacer"></div>
                    ${actionButtonHtml(node.id.split("-")[0], node.id, node.status)}
                </div>`;
        }

        function renderLeafRow(leaf, depth, tagLabel, parentResourceId) {
            const popOpen = openPopover === leaf.id;
            const type = leaf.id.split("-")[0] === "act" ? "activity" : "exercise";
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

        // ------------------------------------------------------------
        // Refresh the whole tree from the server (after any action) -
        // simplest correct way to reflect a status/order change without
        // hand-patching the in-memory tree in several places.
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
                const confirmMsg = action === "publish"
                    ? `Are you sure you want to publish "${label}"? It will become visible to learners.`
                    : `Are you sure you want to unpublish "${label}"? It will be moved back to Draft and hidden from learners.`;

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
            activeTab = tab;
            openPopover = null;
            if (tabReady) tabReady.classList.toggle("active", tab === "ready");
            if (tabPublished) tabPublished.classList.toggle("active", tab === "published");
            renderTree();
        }

        if (tabReady) tabReady.addEventListener("click", () => setTab("ready"));
        if (tabPublished) tabPublished.addEventListener("click", () => setTab("published"));

        updateCounts();
        renderTree();
    });
})();