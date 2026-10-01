/**
 * admin-publishing.js - Publishing page
 * --------------------------------------------------------------------
 * Renders the course tree  Chapter > Module > Lesson > Video / Activity /
 * Exercise  from the JSON admin_routes.py embeds in the page.
 *
 * feat/publishing-tree:
 *   - Tree guide lines (like a file explorer) instead of colored bars.
 *   - Three tabs: Draft / Ready to Publish / Published. A parent that is
 *     only shown because something inside it matches the tab is dimmed.
 *   - One status button set, the same for every item type, all through
 *     POST /admin/publishing/<kind>/<id>/<action> (publishing_actions.py):
 *         Draft tab      Mark ready  (+ Mark all ready when Drafts are inside)
 *         Ready tab      Publish (publishes everything Ready inside too), Move to Draft
 *         Published tab  Update (only when edited after publishing), Unpublish
 *   - "+" depends on the tab:
 *         Draft      create something new inside (editor opens with the
 *                    parent chosen and locked; + Module is a modal here)
 *         Ready      checklist of the item's Draft children -> mark ready
 *         Published  checklist of the item's Ready children -> publish
 *     "Mark all ready" (Draft) and "Publish" on an item with Ready
 *     children (Ready) open the same checklist, the item itself included.
 *     Each checked child brings its own insides along. One transaction:
 *     POST /admin/publishing/checklist.
 *   - Empty chapters/modules (no lesson) can't be marked ready, and a
 *     chapter/module can't go live unless a lesson inside goes live too.
 *   - "+ Chapter" (Draft tab only) and chapter / module Edit are modals.
 *   - Click a name: Edit / Preview / Name history.
 *
 * Edit Order mode (drag handle + arrows, Save / Cancel) shows every
 * chapter, module and lesson, whatever its status or the active tab.
 * Reuses the shared #confirmActionModal - no native alert()/confirm().
 */
(function () {
    "use strict";

    const KIND = { cat: "category", mod: "module", res: "lesson", vid: "video", act: "activity", ex: "exercise" };
    const LABEL = { cat: "chapter", mod: "module", res: "lesson", vid: "video", act: "activity", ex: "exercise" };
    const TAG = {
        cat: ["CH", "publishing-tag-ch"], mod: ["M", "publishing-tag-mod"], res: ["L", "publishing-tag-les"],
        vid: ["V", "publishing-tag-vid"], act: ["A", "publishing-tag-leaf"], ex: ["E", "publishing-tag-leaf"],
    };
    const TAB_STATUS = { draft: "Draft", ready: "Ready to Publish", published: "Published" };
    const EMPTY_TEXT = {
        draft: "Nothing in Draft.",
        ready: "Nothing waiting to be published.",
        published: "Nothing published yet.",
    };
    const ACTIVITY_TYPES = ["Multiple Choice", "Fill in the Blanks", "Flashcards"];

    function typeOf(nodeId) { return nodeId.split("-")[0]; }
    function numId(nodeId) { return nodeId.split("-")[1]; }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("publishingTreeRoot");
        if (!root) return;

        const tabButtons = Array.from(document.querySelectorAll(".js-pub-tab"));
        const countEls = {
            draft: document.getElementById("pubDraftCount"),
            ready: document.getElementById("pubReadyCount"),
            published: document.getElementById("pubPublishedCount"),
        };
        const orderActionsEl = document.getElementById("pubOrderActions");
        const editBannerEl = document.getElementById("pubEditBanner");
        const hintEl = document.getElementById("pubHint");
        const previewBtn = document.getElementById("pubPreviewBtn");
        const addChapterBtn = document.getElementById("pubAddChapterBtn");

        // Preview button lives OUTSIDE #pubOrderActions on purpose - that
        // container's innerHTML is replaced on every Edit Order toggle.
        if (previewBtn) {
            previewBtn.addEventListener("click", () => {
                if (window.CobraBytePublishingPreview) window.CobraBytePublishingPreview.open();
            });
        }

        let tree = [];
        try { tree = JSON.parse(root.dataset.tree || "[]"); } catch (e) { tree = []; }

        let activeTab = TAB_STATUS[root.dataset.initialTab] ? root.dataset.initialTab : "ready";
        const collapsed = {};          // id -> true when collapsed (default open)
        let openMenu = null;           // { id, kind: "name" | "plus" }
        let editOrder = false;
        let snapshot = null;
        let draggedId = null;
        let parentOf = {};             // node id -> parent node (built by indexTree)

        // ------------------------------------------------------------
        // Shared confirm / info modal
        // ------------------------------------------------------------
        const confirmModal = document.getElementById("confirmActionModal");
        const confirmTitle = document.getElementById("confirmActionTitle");
        const confirmText = document.getElementById("confirmActionText");
        const confirmCancelBtn = document.getElementById("confirmActionCancelBtn");
        const confirmOkBtn = document.getElementById("confirmActionConfirmBtn");
        let pendingConfirm = null;

        function openConfirm(message, title, okLabel, withCancel, onConfirm) {
            if (!confirmModal) {
                if (!withCancel) { alert(message); return; }
                if (window.confirm(message)) onConfirm();
                return;
            }
            pendingConfirm = onConfirm || null;
            if (confirmTitle) confirmTitle.textContent = title;
            if (confirmText) confirmText.textContent = message;
            if (confirmCancelBtn) confirmCancelBtn.style.display = withCancel ? "" : "none";
            if (confirmOkBtn) confirmOkBtn.textContent = okLabel;
            confirmModal.classList.remove("modal-hidden");
            confirmModal.style.display = "flex";
        }
        function showAlertModal(message, title = "Notice") { openConfirm(message, title, "OK", false, null); }
        function showConfirmModal(message, onConfirm, title) { openConfirm(message, title || "Confirm Action", "Confirm", true, onConfirm); }

        function closeConfirmModal() {
            if (confirmModal) {
                confirmModal.classList.add("modal-hidden");
                confirmModal.style.display = "none";
            }
            if (confirmCancelBtn) confirmCancelBtn.style.display = "";
            if (confirmOkBtn) confirmOkBtn.textContent = "Confirm";
            pendingConfirm = null;
        }
        if (confirmCancelBtn) confirmCancelBtn.addEventListener("click", closeConfirmModal);
        if (confirmModal) confirmModal.addEventListener("click", (e) => { if (e.target === confirmModal) closeConfirmModal(); });
        if (confirmOkBtn) {
            confirmOkBtn.addEventListener("click", () => {
                const action = pendingConfirm;
                closeConfirmModal();
                if (typeof action === "function") action();
            });
        }

        let toastTimer = null;
        function showToast(message) {
            let toast = document.getElementById("changesSavedToast");
            if (!toast) {
                toast = document.createElement("div");
                toast.id = "changesSavedToast";
                toast.className = "changes-saved-toast";
                document.body.appendChild(toast);
            }
            toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${escapeHtml(message)}</span>`;
            toast.classList.add("show");
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
        }

        // ------------------------------------------------------------
        // Tree helpers
        // ------------------------------------------------------------
        function kidsOf(node) {
            if (typeOf(node.id) === "res") {
                return [].concat(node.videos || [], node.activities || [], node.exercises || []);
            }
            return node.children || [];
        }

        function indexTree() {
            parentOf = {};
            (function walk(nodes, parent) {
                nodes.forEach((n) => {
                    parentOf[n.id] = parent;
                    walk(kidsOf(n), n);
                });
            })(tree, null);
        }

        function findNode(id, nodes) {
            nodes = nodes || tree;
            for (const n of nodes) {
                if (n.id === id) return n;
                const found = findNode(id, kidsOf(n));
                if (found) return found;
            }
            return null;
        }

        function ancestorId(node, prefix) {
            let cur = node;
            while (cur) {
                if (typeOf(cur.id) === prefix) return numId(cur.id);
                cur = parentOf[cur.id];
            }
            return "";
        }

        function hasStatusInside(node, status) {
            return kidsOf(node).some((k) => k.status === status || hasStatusInside(k, status));
        }

        function countInside(node, status) {
            return kidsOf(node).reduce((sum, k) => sum + (k.status === status ? 1 : 0) + countInside(k, status), 0);
        }

        // Items that Publish would take live with this node (Ready, reachable
        // through Ready/Published parents) - mirrors publishing_actions.publish().
        function countPublishable(node) {
            return kidsOf(node).reduce((sum, k) => {
                if (k.status === "Ready to Publish") return sum + 1 + countPublishable(k);
                if (k.status === "Published") return sum + countPublishable(k);
                return sum;
            }, 0);
        }

        // feat/publishing-tree: "empty" rules, mirrored from publishing_actions.py
        // (the server checks them again - these only pick the right button/note).
        function lessonsUnder(node, statuses) {
            if (typeOf(node.id) === "res") return 1;
            return kidsOf(node).reduce((sum, k) => {
                if (typeOf(k.id) === "res") return sum + (!statuses || statuses.includes(k.status) ? 1 : 0);
                return sum + (["cat", "mod"].includes(typeOf(k.id)) ? lessonsUnder(k, statuses) : 0);
            }, 0);
        }

        // Would publishing this module/chapter leave a lesson live inside it?
        function canGoLive(node) {
            const t = typeOf(node.id);
            if (t === "mod") return lessonsUnder(node, ["Ready to Publish", "Published"]) > 0;
            if (t === "cat") {
                return (node.children || []).some((m) =>
                    ["Ready to Publish", "Published"].includes(m.status) &&
                    lessonsUnder(m, ["Ready to Publish", "Published"]) > 0);
            }
            return true;
        }

        function emptyNote(node) {
            const t = typeOf(node.id);
            if (!["cat", "mod"].includes(t) || lessonsUnder(node) > 0) return null;
            return t === "cat" ? "Add a module with a lesson first" : "Add a lesson first";
        }

        // Children a checklist can offer: Draft ones (mark modes) or Ready ones (publish modes).
        const CHECKLIST_MODES = {
            "mark-all":     { action: "mark-ready", childStatus: "Draft", includeParent: true },
            "add-ready":    { action: "mark-ready", childStatus: "Draft", includeParent: false },
            "publish-with": { action: "publish", childStatus: "Ready to Publish", includeParent: true },
            "add-publish":  { action: "publish", childStatus: "Ready to Publish", includeParent: false },
        };

        function checklistChildren(node, mode) {
            const cfg = CHECKLIST_MODES[mode];
            return kidsOf(node).filter((k) => k.status === cfg.childStatus).map((k) => {
                const t = typeOf(k.id);
                let blocked = null;
                let note = "";
                if (cfg.action === "mark-ready") {
                    if (["cat", "mod"].includes(t)) {
                        const n = lessonsUnder(k);
                        blocked = n ? null : "no lessons yet";
                        note = n ? `${n} lesson${n === 1 ? "" : "s"} inside` : "";
                    } else if (t === "res") {
                        const n = countInside(k, "Draft");
                        note = n ? `+ ${n} inside` : "";
                    }
                } else {
                    if (t === "mod") {
                        const n = lessonsUnder(k, ["Ready to Publish"]);
                        blocked = canGoLive(k) ? null : "no ready lessons";
                        note = n ? `${n} ready lesson${n === 1 ? "" : "s"}` : "";
                    } else if (t === "res") {
                        const n = countInside(k, "Ready to Publish");
                        note = n ? `+ ${n} inside` : "";
                    }
                }
                return { node: k, blocked, note };
            });
        }

        function hasChecklistChoices(node, mode) {
            return checklistChildren(node, mode).some((c) => !c.blocked);
        }

        function matchesTab(node) {
            if (editOrder) {
                // Edit Order shows every chapter, module and lesson (any
                // status, any tab), each with its badge. No leaves.
                return !["vid", "act", "ex"].includes(typeOf(node.id));
            }
            const wanted = TAB_STATUS[activeTab];
            return node.status === wanted || kidsOf(node).some(matchesTab);
        }

        function updateCounts() {
            const totals = { draft: 0, ready: 0, published: 0 };
            (function walk(nodes) {
                nodes.forEach((n) => {
                    if (n.status === "Draft") totals.draft++;
                    else if (n.status === "Ready to Publish") totals.ready++;
                    else if (n.status === "Published") totals.published++;
                    walk(kidsOf(n));
                });
            })(tree);
            Object.keys(countEls).forEach((k) => { if (countEls[k]) countEls[k].textContent = totals[k]; });
        }

        // ------------------------------------------------------------
        // URLs: editors and "+" links (opened with the parent locked)
        // ------------------------------------------------------------
        function returnParams(tab) {
            return `return=publishing&tab=${encodeURIComponent(tab || activeTab)}`;
        }

        function editUrlFor(node) {
            const n = numId(node.id);
            switch (typeOf(node.id)) {
                case "res": return `/admin/upload-resource?resource_id=${n}&${returnParams()}`;
                case "vid": return `/admin/upload-video-tutorial?video_id=${n}&${returnParams()}`;
                case "act": return `/admin/create-learning-activity?activity_id=${n}&${returnParams()}`;
                case "ex": return `/admin/coding-exercises/create?exercise_id=${n}&${returnParams()}`;
            }
            return null;
        }

        function addUrl(parent, what, activityType) {
            const cat = ancestorId(parent, "cat");
            const mod = ancestorId(parent, "mod");
            const res = ancestorId(parent, "res");
            const base = `cat_id=${cat}&module_id=${mod}&lock=1&${returnParams("draft")}`;
            switch (what) {
                case "lesson": return `/admin/upload-resource?${base}`;
                case "video": return `/admin/upload-video-tutorial?${base}&resource_id=${res}`;
                case "activity": return `/admin/create-learning-activity?${base}&resource_id=${res}&type=${encodeURIComponent(activityType)}`;
                case "exercise": return `/admin/coding-exercises/create?${base}&resource_id=${res}`;
            }
            return "#";
        }

        function historyTrigger(node) {
            const t = typeOf(node.id);
            const n = numId(node.id);
            const parentLesson = parentOf[node.id] ? numId(parentOf[node.id].id) : "";
            const map = {
                cat: ["category", n], mod: ["module", n], res: ["lesson", n], ex: ["exercise", n],
                vid: ["lesson", parentLesson], act: ["activities", parentLesson],
            };
            return map[t];
        }

        // ------------------------------------------------------------
        // Rendering
        // ------------------------------------------------------------
        function badgeHtml(node) {
            const s = node.status || "Draft";
            const cls = s === "Published" ? "badge-active" : s === "Ready to Publish" ? "badge-ready" : "badge-draft";
            let html = `<span class="badge ${cls}">${escapeHtml(s)}</span>`;
            if (node.edited && s === "Published") html += `<span class="badge badge-edited" title="Changed after it was published - already live">Edited</span>`;
            return html;
        }

        function btn(action, node, label, cls, extra = "") {
            return `<button type="button" class="btn publishing-action-btn ${cls} js-pub-action" data-action="${action}" data-id="${node.id}" ${extra}>${label}</button>`;
        }

        function note(text) {
            return `<span class="publishing-note">${escapeHtml(text)}</span>`;
        }

        function actionsHtml(node) {
            if (editOrder) return orderCtrlsHtml(node.id);
            const wanted = TAB_STATUS[activeTab];
            if (node.status !== wanted) return "";

            const parent = parentOf[node.id];
            const parentLabel = parent ? LABEL[typeOf(parent.id)] : "";

            if (activeTab === "draft") {
                if (parent && parent.status === "Draft") return note(`Mark its ${parentLabel} ready first`);
                const empty = emptyNote(node);
                if (empty) return note(empty);
                let html = "";
                if (hasChecklistChoices(node, "mark-all")) {
                    html += btn("checklist", node, "Mark all ready...", "btn-pub-ghost", 'data-mode="mark-all"');
                }
                return html + btn("mark-ready", node, "Mark ready", "btn-ready-custom");
            }

            if (activeTab === "ready") {
                // Checked first: an empty module never goes live, not even with its chapter.
                if (!canGoLive(node)) {
                    const move = parent && parent.status !== "Published" && parent.status !== "Ready to Publish"
                        ? "" : btn("move-to-draft", node, "Move to Draft", "btn-pub-ghost");
                    return move + note("No Ready to Publish lessons inside");
                }
                if (parent && parent.status === "Ready to Publish") return note(`Goes live with its ${parentLabel}`);
                if (parent && parent.status !== "Published") return note(`Its ${parentLabel} is still ${parent.status}`);
                let html = btn("move-to-draft", node, "Move to Draft", "btn-pub-ghost");
                if (hasChecklistChoices(node, "publish-with")) {
                    return html + btn("checklist", node, "Publish...", "btn-success-custom", 'data-mode="publish-with"');
                }
                return html + btn("publish", node, "Publish", "btn-success-custom");
            }

            let html = "";
            if (node.edited) html += btn("confirm-update", node, "Update", "btn-pub-update");
            return html + btn("unpublish", node, "Unpublish", "btn-unpublish-custom");
        }

        // The checklist popover (Mark all ready / Publish... / "+" in Ready and Published tabs)
        function checklistHtml(node, mode) {
            const cfg = CHECKLIST_MODES[mode];
            const rows = checklistChildren(node, mode);
            const checked = openMenu.checked;
            const titles = {
                "mark-all": `Mark "${node.name}" ready, with:`,
                "add-ready": "Mark ready from Draft",
                "publish-with": `Publish "${node.name}", with:`,
                "add-publish": "Publish from Ready to Publish",
            };
            const items = rows.length
                ? rows.map((row) => {
                    const t = typeOf(row.node.id);
                    const disabled = !!row.blocked;
                    const isChecked = !disabled && checked.has(row.node.id);
                    const side = row.blocked
                        ? `<small class="publishing-check-note is-blocked">${escapeHtml(row.blocked)}</small>`
                        : (row.note ? `<small class="publishing-check-note">${escapeHtml(row.note)}</small>` : "");
                    return `<label class="publishing-check-item${disabled ? " is-disabled" : ""}">
                        <input type="checkbox" class="js-check-item" data-id="${row.node.id}" ${isChecked ? "checked" : ""} ${disabled ? "disabled" : ""}>
                        <span class="publishing-tag ${TAG[t][1]}">${TAG[t][0]}</span>
                        <span class="publishing-check-name">${escapeHtml(row.node.name)}</span>
                        ${side}
                    </label>`;
                }).join("")
                : `<p class="publishing-check-empty">${cfg.childStatus === "Draft" ? "Nothing in Draft here." : "Nothing Ready to Publish here."}</p>`;

            const selectable = rows.filter((r) => !r.blocked).length;
            const selectAll = selectable > 1
                ? `<label class="publishing-check-all"><input type="checkbox" class="js-check-all" ${[...checked].length === selectable ? "checked" : ""}> Select all</label>`
                : "<span></span>";
            return `<div class="resource-edit-menu publishing-popover publishing-checklist" role="dialog" aria-label="${escapeHtml(titles[mode])}">
                <p class="publishing-check-title">${escapeHtml(titles[mode])}</p>
                <div class="publishing-check-list">${items}</div>
                <div class="publishing-check-footer">
                    ${selectAll}
                    <button type="button" class="btn publishing-action-btn ${cfg.action === "publish" ? "btn-success-custom" : "btn-ready-custom"} js-check-confirm" data-id="${node.id}">${escapeHtml(checklistButtonLabel(mode, checked.size))}</button>
                </div>
            </div>`;
        }

        function checklistButtonLabel(mode, count) {
            const cfg = CHECKLIST_MODES[mode];
            const total = count + (cfg.includeParent ? 1 : 0);
            return cfg.action === "publish" ? `Publish ${total}` : `Mark ${total} ready`;
        }

        function openChecklist(node, mode) {
            const checked = new Set(checklistChildren(node, mode).filter((c) => !c.blocked).map((c) => c.node.id));
            openMenu = { id: node.id, kind: "checklist", mode, checked };
            renderTree();
        }

        function refreshChecklistFooter() {
            if (!openMenu || openMenu.kind !== "checklist") return;
            const btnEl = root.querySelector(".js-check-confirm");
            if (btnEl) {
                btnEl.textContent = checklistButtonLabel(openMenu.mode, openMenu.checked.size);
                const cfg = CHECKLIST_MODES[openMenu.mode];
                btnEl.disabled = !cfg.includeParent && openMenu.checked.size === 0;
            }
            const all = root.querySelector(".js-check-all");
            if (all) {
                const boxes = root.querySelectorAll(".js-check-item:not(:disabled)");
                all.checked = boxes.length > 0 && [...boxes].every((b) => b.checked);
            }
        }

        async function submitChecklist(node) {
            const cfg = CHECKLIST_MODES[openMenu.mode];
            const items = [...openMenu.checked].map((id) => ({ kind: KIND[typeOf(id)], id: numId(id) }));
            const send = async () => {
                try {
                    const resp = await fetch("/admin/publishing/checklist", {
                        method: "POST",
                        credentials: "same-origin",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: cfg.action,
                            parent: { kind: KIND[typeOf(node.id)], id: numId(node.id) },
                            include_parent: cfg.includeParent,
                            items,
                        }),
                    });
                    const result = await resp.json().catch(() => ({ success: false }));
                    if (!result.success) {
                        showAlertModal(result.message || "Nothing was changed.", "Not Changed");
                        return;
                    }
                    openMenu = null;
                    showToast(result.message || "Done.");
                    await refreshTree();
                } catch (err) {
                    showAlertModal("Could not reach the server. Please try again.", "Error");
                }
            };
            if (cfg.action === "publish") {
                const total = items.length + (cfg.includeParent ? 1 : 0);
                showConfirmModal(
                    `Publish ${total} item${total === 1 ? "" : "s"} (plus whatever is Ready to Publish inside them)? Learners will see them right away.`,
                    send, "Publish?");
            } else {
                send();
            }
        }

        function nameMenuHtml(node) {
            const t = typeOf(node.id);
            const items = [];
            items.push(`<button type="button" class="resource-edit-menu-item js-pub-edit" data-id="${node.id}"><i class="fa-solid fa-pen-to-square"></i> Edit</button>`);
            if (t === "res" || t === "act" || t === "vid") {
                items.push(`<button type="button" class="resource-edit-menu-item js-pub-preview" data-id="${node.id}"><i class="fa-regular fa-eye"></i> Preview</button>`);
            }
            const hist = historyTrigger(node);
            if (hist && hist[1]) {
                items.push(`<button type="button" class="resource-edit-menu-item js-title-history" data-scope="${hist[0]}" data-id="${hist[1]}"><i class="fa-solid fa-clock-rotate-left"></i> Name history</button>`);
            }
            return `<div class="resource-edit-menu publishing-popover" role="menu">${items.join("")}</div>`;
        }

        function plusMenuHtml(node) {
            const t = typeOf(node.id);
            const item = (attrs, icon, label, disabled) =>
                `<button type="button" class="resource-edit-menu-item js-pub-add" ${attrs} ${disabled ? "disabled" : ""}>` +
                `<i class="fa-solid ${icon}"></i> ${escapeHtml(label)}${disabled ? ' <span class="publishing-menu-note">(added)</span>' : ""}</button>`;

            if (t === "cat") return `<div class="resource-edit-menu publishing-popover publishing-plus-menu">${item(`data-what="module" data-id="${node.id}"`, "fa-layer-group", "Module", false)}</div>`;
            if (t === "mod") return `<div class="resource-edit-menu publishing-popover publishing-plus-menu">${item(`data-what="lesson" data-id="${node.id}"`, "fa-book-open", "Lesson", false)}</div>`;

            // Lesson: one of each type (videos, 3 activity types, coding exercise)
            const takenTypes = (node.activities || []).map((a) => a.activity_type);
            const rows = [
                item(`data-what="video" data-id="${node.id}"`, "fa-video", "Video tutorial", (node.videos || []).length > 0),
                ...ACTIVITY_TYPES.map((type) => item(
                    `data-what="activity" data-type="${escapeHtml(type)}" data-id="${node.id}"`,
                    type === "Flashcards" ? "fa-clone" : type === "Fill in the Blanks" ? "fa-i-cursor" : "fa-list-check",
                    type, takenTypes.includes(type))),
                item(`data-what="exercise" data-id="${node.id}"`, "fa-code", "Coding exercise", (node.exercises || []).length > 0),
            ];
            return `<div class="resource-edit-menu publishing-popover publishing-plus-menu">${rows.join("")}</div>`;
        }

        function orderCtrlsHtml(id) {
            const found = findParentArray(id);
            if (!found) return "";
            const atTop = found.idx === 0;
            const atBottom = found.idx === found.arr.length - 1;
            return `
                <div class="publishing-order-ctrls">
                    <button type="button" class="publishing-arrow-btn js-pub-move" data-id="${id}" data-dir="-1" ${atTop ? "disabled" : ""} aria-label="Move up"><i class="fa-solid fa-arrow-up"></i></button>
                    <button type="button" class="publishing-arrow-btn js-pub-move" data-id="${id}" data-dir="1" ${atBottom ? "disabled" : ""} aria-label="Move down"><i class="fa-solid fa-arrow-down"></i></button>
                    <span class="publishing-grip" draggable="true" data-id="${id}" aria-label="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
                </div>`;
        }

        // guides: one boolean per ancestor level below the top ("a later
        // sibling is still coming here" -> draw a vertical line). isLast:
        // this row's own connector is an elbow instead of a tee.
        function rowHtml(node, guides, isLast, visibleKids) {
            const t = typeOf(node.id);
            const [tagText, tagClass] = TAG[t];
            const isContext = !editOrder && node.status !== TAB_STATUS[activeTab];
            const open = !collapsed[node.id];

            let guideHtml = "";
            if (guides !== null) {
                guideHtml = guides.map((line) => `<span class="pub-g${line ? " pub-g-line" : ""}"></span>`).join("") +
                    `<span class="pub-g ${isLast ? "pub-g-elbow" : "pub-g-tee"}"></span>`;
            }

            const toggle = visibleKids.length
                ? `<button type="button" class="publishing-toggle-btn js-pub-toggle" data-id="${node.id}" aria-label="${open ? "Collapse" : "Expand"}" aria-expanded="${open}"><i class="fa-solid fa-chevron-${open ? "down" : "right"}"></i></button>`
                : `<span class="publishing-toggle-spacer"></span>`;

            const nameMenuOpen = !!(openMenu && openMenu.id === node.id && openMenu.kind === "name");
            const plusMenuOpen = !!(openMenu && openMenu.id === node.id && openMenu.kind === "plus");

            const nameHtml = editOrder
                ? `<span class="publishing-name-static">${escapeHtml(node.name)}</span>`
                : `<button type="button" class="publishing-name-btn js-pub-name" data-id="${node.id}" aria-haspopup="menu" aria-expanded="${nameMenuOpen}">${escapeHtml(node.name)}</button>${nameMenuOpen ? nameMenuHtml(node) : ""}`;

            // "+" per tab: Draft = create new; Ready = pick Draft children to
            // mark ready; Published = pick Ready children to publish. Only
            // shown where there is something to add.
            let plusMode = null;
            if (!editOrder && ["cat", "mod", "res"].includes(t)) {
                if (activeTab === "draft") plusMode = "create";
                else if (activeTab === "ready" && ["Ready to Publish", "Published"].includes(node.status)
                         && kidsOf(node).some((k) => k.status === "Draft")) plusMode = "add-ready";
                else if (activeTab === "published" && node.status === "Published"
                         && kidsOf(node).some((k) => k.status === "Ready to Publish")) plusMode = "add-publish";
            }
            const checklistOpen = !!(openMenu && openMenu.id === node.id && openMenu.kind === "checklist");
            const plusTitle = plusMode === "create" ? "Add inside" : plusMode === "add-ready" ? "Mark Draft items inside ready" : "Publish Ready items inside";
            const plusHtml = plusMode
                ? `<button type="button" class="publishing-plus-btn js-pub-plus" data-id="${node.id}" data-mode="${plusMode}" aria-label="${escapeHtml(plusTitle)}: ${escapeHtml(node.name)}" aria-haspopup="menu" aria-expanded="${plusMenuOpen || checklistOpen}" title="${escapeHtml(plusTitle)}"><i class="fa-solid fa-plus"></i></button>${plusMenuOpen ? plusMenuHtml(node) : ""}`
                : "";

            const dragAttr = editOrder ? `data-draggable-row="${node.id}"` : "";
            return `
                <div class="publishing-row publishing-row-${t}${isContext ? " is-context" : ""}" ${dragAttr}>
                    <span class="pub-guides">${guideHtml}</span>
                    ${toggle}
                    <span class="publishing-tag ${tagClass}">${tagText}</span>
                    <div class="publishing-name-wrap">${nameHtml}</div>
                    ${badgeHtml(node)}
                    <div class="publishing-spacer"></div>
                    <div class="publishing-row-actions">${actionsHtml(node)}${plusHtml}${checklistOpen ? checklistHtml(node, openMenu.mode) : ""}</div>
                </div>`;
        }

        function renderTree() {
            indexTree();
            const out = [];
            (function walk(nodes, guides) {
                const visible = nodes.filter(matchesTab);
                visible.forEach((node, i) => {
                    const isLast = i === visible.length - 1;
                    const kids = kidsOf(node).filter(matchesTab);
                    out.push(rowHtml(node, guides, isLast, kids));
                    if (!collapsed[node.id] && kids.length) {
                        walk(kidsOf(node), guides === null ? [] : guides.concat(!isLast));
                    }
                });
            })(tree, null);

            root.innerHTML = out.length
                ? out.join("")
                : `<p class="text-muted publishing-empty">${editOrder ? "Nothing to reorder yet." : EMPTY_TEXT[activeTab]}</p>`;
            if (editOrder) wireDragHandles();
        }

        // A load error is shown as an error - never as "Nothing in Draft".
        function showLoadError(message) {
            root.innerHTML = `<p class="publishing-empty publishing-load-error">${escapeHtml(message)}</p>`;
        }

        async function refreshTree() {
            try {
                const resp = await fetch("/admin/publishing/data", { credentials: "same-origin" });
                const result = await resp.json();
                if (result.success) {
                    tree = result.tree || [];
                    updateCounts();
                    renderTree();
                    return true;
                }
                showLoadError(result.message || "Could not load the course tree.");
            } catch (e) {
                // keep the current tree rather than blanking the page
            }
            return false;
        }

        // ------------------------------------------------------------
        // Status actions (one route for every item type)
        // ------------------------------------------------------------
        function confirmTextFor(action, node) {
            const name = `"${node.name}"`;
            const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
            switch (action) {
                case "mark-ready":
                    return [`Mark ${name} Ready to Publish?`, "Mark Ready?"];
                case "mark-all-ready": {
                    const n = countInside(node, "Draft");
                    return [`Mark ${name} and the ${plural(n, "Draft item")} inside it Ready to Publish?`, "Mark All Ready?"];
                }
                case "publish": {
                    const n = countPublishable(node);
                    return [n
                        ? `Publish ${name} and the ${plural(n, "Ready item")} inside it? Learners will see ${n === 1 ? "both" : "them all"} right away.`
                        : `Publish ${name}? Learners will see it right away.`, "Publish?"];
                }
                case "unpublish": {
                    const n = countInside(node, "Published");
                    return [n
                        ? `Unpublish ${name}? It and the ${plural(n, "published item")} inside it move back to Ready to Publish, and learners won't see them. Learner progress is kept.`
                        : `Unpublish ${name}? It moves back to Ready to Publish and learners won't see it. Learner progress is kept.`, "Unpublish?"];
                }
                case "move-to-draft": {
                    const n = countInside(node, "Ready to Publish");
                    return [n
                        ? `Move ${name} back to Draft? The ${plural(n, "Ready item")} inside it move back to Draft too.`
                        : `Move ${name} back to Draft?`, "Move to Draft?"];
                }
                case "confirm-update":
                    return [`Confirm the changes to ${name}? They're already live - this only clears the "Edited" mark.`, "Confirm Update?"];
            }
            return ["Are you sure?", "Confirm"];
        }

        function runAction(action, node, button) {
            const [message, title] = confirmTextFor(action, node);
            showConfirmModal(message, async () => {
                if (button) button.disabled = true;
                try {
                    const resp = await fetch(`/admin/publishing/${KIND[typeOf(node.id)]}/${numId(node.id)}/${action}`, {
                        method: "POST", credentials: "same-origin",
                    });
                    const result = await resp.json().catch(() => ({ success: false }));
                    if (!result.success) {
                        showAlertModal(result.message || "Could not update this item.", "Not Changed");
                        if (button) button.disabled = false;
                        return;
                    }
                    showToast(result.message || "Saved.");
                    await refreshTree();
                } catch (err) {
                    showAlertModal("Could not reach the server. Please try again.", "Error");
                    if (button) button.disabled = false;
                }
            }, title);
        }

        // ------------------------------------------------------------
        // Preview (lesson content / activity summary)
        // ------------------------------------------------------------
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
                        <button type="button" class="modal-close-btn modal-close-inline js-preview-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="content-preview-body lesson-content-body">${contentHtml}</div>
                </div>`;
            document.body.appendChild(overlay);
            const close = () => overlay.remove();
            overlay.addEventListener("click", (e) => { if (e.target === overlay || e.target.closest(".js-preview-close")) close(); });
        }

        // Video Preview: same YouTube popup as showVideoPreviewModal() in
        // admin-learning-resources.js (reuses its admin-style.css classes).
        // Removing the overlay removes the iframe, so the audio stops.
        function showVideoPreviewModal(videoId) {
            let overlay = document.getElementById("videoPreviewModalOverlay");
            if (overlay) overlay.remove();

            overlay = document.createElement("div");
            overlay.id = "videoPreviewModalOverlay";
            overlay.className = "modal-overlay";
            overlay.innerHTML = `
                <div class="video-preview-modal-card">
                    <button type="button" id="videoPreviewModalCloseBtn" class="modal-close-btn video-preview-close-btn" title="Close">&times;</button>
                    <div class="video-preview-frame">
                        <iframe src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1" class="video-preview-iframe" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            function closeModal() {
                overlay.remove();
                document.removeEventListener("keydown", onEscKey);
            }
            function onEscKey(e) {
                if (e.key === "Escape") closeModal();
            }

            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });
            const closeBtn = overlay.querySelector("#videoPreviewModalCloseBtn");
            if (closeBtn) closeBtn.addEventListener("click", closeModal);
            document.addEventListener("keydown", onEscKey);
        }

        async function showPreview(node) {
            const t = typeOf(node.id);
            if (t === "vid") {
                const videoId = (node.video_id || "").trim();
                if (!videoId) { showAlertModal("This video doesn't have a YouTube link yet.", "Preview"); return; }
                showVideoPreviewModal(videoId);
                return;
            }
            try {
                if (t === "res") {
                    const resp = await fetch(`/admin/learning-resources/preview-content?resource_id=${numId(node.id)}`, { credentials: "same-origin" });
                    const result = await resp.json();
                    if (!result.success) { showAlertModal("Could not load a preview for this lesson.", "Preview"); return; }
                    openPreviewOverlay(result.title || "Preview", result.content_html || "<em>No content yet.</em>");
                    return;
                }
                if (t === "act") {
                    const lesson = parentOf[node.id];
                    const resp = await fetch(`/admin/learning-activities/preview?resource_id=${numId(lesson.id)}`, { credentials: "same-origin" });
                    const result = await resp.json();
                    const match = (result.activities || []).find((a) => String(a.activity_id) === numId(node.id));
                    if (!match) { showAlertModal("Could not load a preview for this activity.", "Preview"); return; }
                    openPreviewOverlay(`${match.activity_type}: ${match.activity_title}`,
                        `<p>Status: ${escapeHtml(match.status)}</p><p>${match.items.length} item(s).</p>`);
                }
            } catch (e) {
                showAlertModal("Could not reach the server.", "Error");
            }
        }

        // ------------------------------------------------------------
        // Modals on this page: + Chapter, + Module, Edit chapter / module
        // ------------------------------------------------------------
        const $ = (id) => document.getElementById(id);

        function openModal(modal) {
            if (!modal) return;
            modal.classList.remove("modal-hidden");
            modal.style.display = "flex";
            if (typeof window.cobraByteRefreshCharCounters === "function") window.cobraByteRefreshCharCounters();
        }
        function closeModal(modal) {
            if (!modal) return;
            modal.classList.add("modal-hidden");
            modal.style.display = "none";
            const form = modal.querySelector("form");
            if (form) form.reset();
        }
        function wireClose(modal, ...buttonIds) {
            if (!modal) return;
            buttonIds.forEach((id) => { const b = $(id); if (b) b.addEventListener("click", () => closeModal(modal)); });
            modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(modal); });
        }

        async function fetchCategories() {
            try {
                const resp = await fetch("/admin/manage-course/categories", { credentials: "same-origin" });
                const result = await resp.json();
                return result.success ? result.categories : [];
            } catch (e) { return []; }
        }

        async function fillCategorySelect(select, selectedId, lock) {
            if (!select) return;
            const categories = await fetchCategories();
            select.innerHTML = `<option value="" disabled>Select Category</option>` +
                categories.map((c) => `<option value="${c.cat_id}">${escapeHtml(c.category_name)}</option>`).join("");
            select.value = selectedId ? String(selectedId) : "";
            select.classList.toggle("select-locked", !!lock);
            if (lock) { select.setAttribute("tabindex", "-1"); select.setAttribute("aria-disabled", "true"); }
            else { select.removeAttribute("tabindex"); select.removeAttribute("aria-disabled"); }
        }

        async function postForm(url, fields) {
            const resp = await fetch(url, { method: "POST", credentials: "same-origin", body: new URLSearchParams(fields) });
            return resp.json().catch(() => ({ success: false, message: "Unexpected server response." }));
        }

        // Same look as the editors: red outline on the field + red popup.
        let fieldPopupTimer = null;
        function fieldError(field, message) {
            if (field) {
                field.classList.add("field-error");
                field.addEventListener("input", () => field.classList.remove("field-error"), { once: true });
                field.addEventListener("change", () => field.classList.remove("field-error"), { once: true });
                field.focus();
            }
            let popup = document.getElementById("resourcePopupAlert");
            if (!popup) {
                popup = document.createElement("div");
                popup.id = "resourcePopupAlert";
                document.body.appendChild(popup);
            }
            popup.className = "resource-popup-alert error";
            popup.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span>${escapeHtml(message)}</span>`;
            popup.classList.add("show");
            if (fieldPopupTimer) clearTimeout(fieldPopupTimer);
            fieldPopupTimer = setTimeout(() => popup.classList.remove("show"), 2500);
            return null;
        }

        // First empty field in the list, or null.
        function firstEmpty(pairs) {
            return pairs.find(([el]) => el && !(el.value || "").trim()) || null;
        }

        function wireSubmit(form, modal, handler) {
            if (!form) return;
            let busy = false;
            form.addEventListener("submit", async (e) => {
                e.preventDefault();
                if (busy) return;
                busy = true;
                try {
                    const result = await handler();
                    if (!result) return;
                    if (!result.success) { showAlertModal(result.message || "Could not save.", "Not Saved"); return; }
                    closeModal(modal);
                    showToast(result.message || "Saved.");
                    await refreshTree();
                } catch (err) {
                    showAlertModal("Could not reach the server. Please try again.", "Error");
                } finally {
                    busy = false;
                }
            });
        }

        // + Chapter
        const createCategoryModal = $("createCategoryModal");
        wireClose(createCategoryModal, "closeCreateCategoryModalBtn", "cancelCreateCategoryBtn");
        if (addChapterBtn) addChapterBtn.addEventListener("click", () => { openModal(createCategoryModal); const i = $("newCategoryName"); if (i) i.focus(); });
        wireSubmit($("createCategoryForm"), createCategoryModal, async () => {
            const name = ($("newCategoryName").value || "").trim();
            if (!name) return fieldError($("newCategoryName"), "Please enter a chapter name.");
            return postForm("/admin/manage-course/categories/create", { category_name: name });
        });

        // + Module (chapter locked)
        const createModuleModal = $("createModuleModal");
        wireClose(createModuleModal, "closeCreateModuleModalBtn", "cancelCreateModuleBtn");
        async function openCreateModule(catId) {
            await fillCategorySelect($("newModuleCategory"), catId, true);
            openModal(createModuleModal);
            const i = $("newModuleName"); if (i) i.focus();
        }
        wireSubmit($("createModuleForm"), createModuleModal, async () => {
            const missing = firstEmpty([
                [$("newModuleName"), "Please enter a module name."],
                [$("newModuleDesc"), "Please enter a description."],
                [$("newModuleCategory"), "Please choose a chapter."],
            ]);
            if (missing) return fieldError(missing[0], missing[1]);
            const name = $("newModuleName").value.trim();
            const desc = $("newModuleDesc").value.trim();
            const catId = $("newModuleCategory").value;
            // No module_stats_id: the server starts new modules as Draft.
            return postForm("/admin/manage-course/modules/create", { module_name: name, description: desc, cat_id: catId });
        });

        // Edit chapter
        const editCategoryModal = $("editCategoryModal");
        wireClose(editCategoryModal, "closeEditCategoryModal", "cancelEditCategoryBtn");
        function openEditCategory(node) {
            $("editCategoryId").value = numId(node.id);
            $("editCategoryName").value = node.name;
            openModal(editCategoryModal);
            $("editCategoryName").focus();
        }
        wireSubmit($("editCategoryForm"), editCategoryModal, async () => {
            const name = ($("editCategoryName").value || "").trim();
            if (!name) return fieldError($("editCategoryName"), "Please enter a chapter name.");
            return postForm(`/admin/manage-course/categories/${$("editCategoryId").value}/update`, { category_name: name });
        });

        // Edit module
        const editModuleModal = $("editModuleModal");
        wireClose(editModuleModal, "closeEditModuleModal");
        async function openEditModule(node) {
            $("editModuleId").value = numId(node.id);
            $("editModuleName").value = node.name;
            $("editModuleDesc").value = node.description || "";
            await fillCategorySelect($("editModuleCategory"), ancestorId(node, "cat"), false);
            openModal(editModuleModal);
            $("editModuleName").focus();
        }
        wireSubmit($("editModuleForm"), editModuleModal, async () => {
            const missing = firstEmpty([
                [$("editModuleName"), "Please enter a module name."],
                [$("editModuleDesc"), "Please enter a description."],
                [$("editModuleCategory"), "Please choose a chapter."],
            ]);
            if (missing) return fieldError(missing[0], missing[1]);
            const name = $("editModuleName").value.trim();
            const desc = $("editModuleDesc").value.trim();
            const catId = $("editModuleCategory").value;
            return postForm(`/admin/manage-course/modules/${$("editModuleId").value}/update`, { module_name: name, description: desc, cat_id: catId });
        });

        function doEdit(node) {
            const t = typeOf(node.id);
            if (t === "cat") { openEditCategory(node); return; }
            if (t === "mod") { openEditModule(node); return; }
            const url = editUrlFor(node);
            if (url) window.location.href = url;
        }

        // ------------------------------------------------------------
        // Edit Order mode (unchanged behavior)
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
            [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
            renderTree();
        }

        function setToolbarDisabled(disabled) {
            tabButtons.forEach((b) => { b.disabled = disabled; });
            if (previewBtn) previewBtn.disabled = disabled;
            if (addChapterBtn) addChapterBtn.disabled = disabled;
            if (editBannerEl) editBannerEl.classList.toggle("show", disabled);
            if (hintEl) hintEl.classList.toggle("hide", disabled);
        }

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
            openMenu = null;
            setToolbarDisabled(true);
            setOrderActionsHtml();
            renderTree();
        }

        function cancelEditOrder() {
            tree = JSON.parse(snapshot);
            editOrder = false;
            snapshot = null;
            setToolbarDisabled(false);
            setOrderActionsHtml();
            updateCounts();
            renderTree();
        }

        async function postReorder(type, parentId, orderedIds) {
            const resp = await fetch("/admin/publishing/reorder", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type, parent_id: parentId, ordered_ids: orderedIds }),
            });
            return resp.json().catch(() => ({ success: false }));
        }

        async function saveEditOrder() {
            const saveBtn = document.getElementById("pubSaveOrderBtn");
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving..."; }

            const requests = [postReorder("category", null, tree.map((c) => numId(c.id)))];
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
            setToolbarDisabled(false);
            setOrderActionsHtml();
            if (failed.length) showAlertModal("Some of the new order could not be saved. Please try again.", "Order Not Fully Saved");
            await refreshTree();
        }

        // Drag and drop - only within the same parent, like the arrows.
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
                row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
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
                collapsed[toggle.dataset.id] = !collapsed[toggle.dataset.id];
                renderTree();
                return;
            }

            const moveBtn = e.target.closest(".js-pub-move");
            if (moveBtn) { moveSibling(moveBtn.dataset.id, parseInt(moveBtn.dataset.dir, 10)); return; }

            const nameBtn = e.target.closest(".js-pub-name");
            if (nameBtn) {
                e.stopPropagation();
                const id = nameBtn.dataset.id;
                openMenu = openMenu && openMenu.id === id && openMenu.kind === "name" ? null : { id, kind: "name" };
                renderTree();
                return;
            }

            const plusBtn = e.target.closest(".js-pub-plus");
            if (plusBtn) {
                e.stopPropagation();
                const id = plusBtn.dataset.id;
                const mode = plusBtn.dataset.mode;
                if (mode === "create") {
                    openMenu = openMenu && openMenu.id === id && openMenu.kind === "plus" ? null : { id, kind: "plus" };
                    renderTree();
                } else if (openMenu && openMenu.id === id && openMenu.kind === "checklist" && openMenu.mode === mode) {
                    openMenu = null;
                    renderTree();
                } else {
                    const node = findNode(id);
                    if (node) openChecklist(node, mode);
                }
                return;
            }

            if (e.target.closest(".js-check-item") || e.target.closest(".js-check-all")) return; // handled on "change"

            const checkConfirm = e.target.closest(".js-check-confirm");
            if (checkConfirm) {
                const node = findNode(checkConfirm.dataset.id);
                if (node && openMenu && openMenu.kind === "checklist") submitChecklist(node);
                return;
            }

            const editBtn = e.target.closest(".js-pub-edit");
            if (editBtn) {
                const node = findNode(editBtn.dataset.id);
                openMenu = null;
                renderTree();
                if (node) doEdit(node);
                return;
            }

            const previewItem = e.target.closest(".js-pub-preview");
            if (previewItem) {
                const node = findNode(previewItem.dataset.id);
                openMenu = null;
                renderTree();
                if (node) showPreview(node);
                return;
            }

            if (e.target.closest(".js-title-history")) {
                // admin-title-history.js opens the modal (document-level listener).
                openMenu = null;
                setTimeout(renderTree, 0);
                return;
            }

            const addItem = e.target.closest(".js-pub-add");
            if (addItem) {
                if (addItem.disabled) return;
                const parent = findNode(addItem.dataset.id);
                openMenu = null;
                renderTree();
                if (!parent) return;
                if (addItem.dataset.what === "module") { openCreateModule(numId(parent.id)); return; }
                window.location.href = addUrl(parent, addItem.dataset.what, addItem.dataset.type);
                return;
            }

            const actionBtn = e.target.closest(".js-pub-action");
            if (actionBtn) {
                const node = findNode(actionBtn.dataset.id);
                if (!node) return;
                if (actionBtn.dataset.action === "checklist") {
                    e.stopPropagation();
                    if (openMenu && openMenu.id === node.id && openMenu.kind === "checklist") { openMenu = null; renderTree(); }
                    else openChecklist(node, actionBtn.dataset.mode);
                    return;
                }
                runAction(actionBtn.dataset.action, node, actionBtn);
            }
        });

        // Checklist checkboxes: update the selection without re-rendering the tree.
        root.addEventListener("change", (e) => {
            if (!openMenu || openMenu.kind !== "checklist") return;
            const item = e.target.closest(".js-check-item");
            if (item) {
                if (item.checked) openMenu.checked.add(item.dataset.id);
                else openMenu.checked.delete(item.dataset.id);
                refreshChecklistFooter();
                return;
            }
            const all = e.target.closest(".js-check-all");
            if (all) {
                root.querySelectorAll(".js-check-item:not(:disabled)").forEach((box) => {
                    box.checked = all.checked;
                    if (all.checked) openMenu.checked.add(box.dataset.id);
                    else openMenu.checked.delete(box.dataset.id);
                });
                refreshChecklistFooter();
            }
        });

        // Close an open menu on an outside click or Escape.
        document.addEventListener("click", (e) => {
            if (!openMenu) return;
            if (e.target.closest(".publishing-popover") || e.target.closest(".js-pub-name") || e.target.closest(".js-pub-plus")
                || e.target.closest('.js-pub-action[data-action="checklist"]')) return;
            openMenu = null;
            renderTree();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && openMenu) { openMenu = null; renderTree(); }
        });

        // Name history "Revert to this" -> show the new name.
        document.addEventListener("cobra:title-changed", refreshTree);

        // ------------------------------------------------------------
        // Tabs
        // ------------------------------------------------------------
        function setTab(tab) {
            if (editOrder || !TAB_STATUS[tab]) return;
            activeTab = tab;
            openMenu = null;
            if (addChapterBtn) addChapterBtn.classList.toggle("is-hidden", tab !== "draft"); // creates new -> Draft tab only
            tabButtons.forEach((b) => {
                const on = b.dataset.tab === tab;
                b.classList.toggle("active", on);
                b.setAttribute("aria-selected", String(on));
            });
            try {
                const url = new URL(window.location.href);
                url.searchParams.set("tab", tab);
                window.history.replaceState(null, "", url.toString());
            } catch (e) { /* older browsers: tab still switches */ }
            renderTree();
        }
        tabButtons.forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

        setOrderActionsHtml();
        updateCounts();
        setTab(activeTab);

        // feat/publishing-tree: the first load right after a server restart
        // can fail during the one-time database setup. Ask again once
        // instead of showing an empty page.
        if (root.dataset.treeError || tree.length === 0) {
            refreshTree().then((ok) => {
                if (!ok && root.dataset.treeError) {
                    showLoadError(`Could not load the course tree: ${root.dataset.treeError}`);
                }
            });
        }
    });
})();
