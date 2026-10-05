/**
 * admin-bulk-restore.js - tick several archived rows, restore them at once
 * --------------------------------------------------------------------------------------
 * Adds a checkbox column + "Select all" to every Archive table listed in
 * TABLES below (Manage Course, Learning Resources, Learning Activities,
 * Coding Exercises). Ticking a row shows a bar above the table:
 *
 *     3 selected   [Restore selected]  [Clear]
 *
 * Restore selected -> confirm -> POST /admin/archive/bulk-restore. Rows
 * that would duplicate an active item are skipped by the server; the
 * summary dialog lists what was restored and what was skipped (and why).
 * Categories / Modules open the restore checklist instead (their archived
 * lessons / activities / exercises), via window.cobraByteOpenRestoreChecklist
 * from admin-relational-archive.js.
 *
 * The rows themselves are still rendered by each page's own archive file;
 * this file only watches the <tbody> and adds the checkbox cell. When a
 * restore is done it fires "cobra:bulk-restored" on the <tbody> so that
 * page can reload its tables.
 *
 * Also exposes window.CobraBulkRestore.{showSummary, confirm} for
 * admin-relational-archive.js.
 */
(function () {
    "use strict";

    const TABLES = [
        { id: "archivedModulesTableBody", button: ".js-restore-module", type: "module", noun: "module" },
        { id: "archivedCategoriesTableBody", button: ".js-restore-category", type: "category", noun: "category" },
        { id: "archivedLessonContentTableBody", button: ".js-restore-resource", type: "resource", noun: "lesson" },
        { id: "archivedVideoTutorialTableBody", button: ".js-restore-resource", type: "video", noun: "video tutorial" },
        { id: "archivedMctTableBody", button: ".js-restore-activity", type: "activity", noun: "activity" },
        { id: "archivedFibTableBody", button: ".js-restore-activity", type: "activity", noun: "activity" },
        { id: "archivedFcTableBody", button: ".js-restore-activity", type: "activity", noun: "activity" },
        { id: "archivedExercisesTableBody", button: ".js-restore-exercise", type: "exercise", noun: "coding exercise" },
    ];

    const TYPE_LABELS = {
        category: "Category", module: "Module", resource: "Lesson",
        video: "Video Tutorial", activity: "Activity", exercise: "Coding Exercise",
    };

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function plural(n, noun) {
        if (n === 1) return `1 ${noun}`;
        if (noun.endsWith("y")) return `${n} ${noun.slice(0, -1)}ies`;
        return `${n} ${noun}s`;
    }

    // ------------------------------------------------------------
    // Own dialog (above every other modal), so it never fights with a
    // page's shared #confirmActionModal handlers.
    // ------------------------------------------------------------
    let dialog = null;

    function getDialog() {
        if (dialog) return dialog;
        dialog = document.createElement("div");
        dialog.className = "modal-overlay modal-overlay-front bulk-restore-dialog";
        dialog.style.display = "none";
        dialog.innerHTML = `
            <div class="modal-card modal-card-confirm">
                <h3 class="modal-confirm-title"></h3>
                <div class="bulk-restore-dialog-body"></div>
                <div class="modal-confirm-actions">
                    <button type="button" class="modal-btn-cancel">Cancel</button>
                    <button type="button" class="modal-btn-save">OK</button>
                </div>
            </div>`;
        document.body.appendChild(dialog);
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) closeDialog();
        });
        dialog.querySelector(".modal-btn-cancel").addEventListener("click", closeDialog);
        dialog.querySelector(".modal-btn-save").addEventListener("click", () => {
            const action = dialog._onOk;
            closeDialog();
            if (typeof action === "function") action();
        });
        return dialog;
    }

    function closeDialog() {
        if (!dialog) return;
        dialog.style.display = "none";
        dialog._onOk = null;
    }

    function openDialog(title, bodyHtml, okLabel, onOk, showCancel) {
        const d = getDialog();
        d.querySelector(".modal-confirm-title").textContent = title;
        d.querySelector(".bulk-restore-dialog-body").innerHTML = bodyHtml;
        d.querySelector(".modal-btn-save").textContent = okLabel;
        d.querySelector(".modal-btn-cancel").style.display = showCancel ? "" : "none";
        d._onOk = onOk;
        d.style.display = "flex";
    }

    function confirm(title, message, onOk) {
        openDialog(title, `<p class="modal-confirm-text">${escapeHtml(message)}</p>`, "Restore", onOk, true);
    }

    function listHtml(entries, withReason) {
        return `<ul class="bulk-restore-list">${entries.map((e) => `
            <li>
                <span class="bulk-restore-type">${escapeHtml(TYPE_LABELS[e.type] || "Item")}</span>
                <strong>${escapeHtml(e.name)}</strong>
                ${withReason && e.reason ? `<div class="bulk-restore-reason">${escapeHtml(e.reason)}</div>` : ""}
            </li>`).join("")}</ul>`;
    }

    /** result: the server's {message, restored: [], skipped: []} reply. */
    function showSummary(result, onClose) {
        const restored = (result && result.restored) || [];
        const skipped = (result && result.skipped) || [];
        let body = `<p class="modal-confirm-text">${escapeHtml((result && result.message) || "")}</p>`;
        if (skipped.length) {
            body += `<div class="bulk-restore-section bulk-restore-section-skipped">
                        <div class="bulk-restore-section-title"><i class="fa-solid fa-triangle-exclamation"></i> Not restored</div>
                        ${listHtml(skipped, true)}
                     </div>`;
        }
        if (restored.length) {
            body += `<div class="bulk-restore-section">
                        <div class="bulk-restore-section-title"><i class="fa-solid fa-rotate-left"></i> Restored (now Draft)</div>
                        ${listHtml(restored, false)}
                     </div>`;
        }
        const title = restored.length ? (skipped.length ? "Partly Restored" : "Restored") : "Nothing Restored";
        openDialog(title, body, "OK", onClose, false);
    }

    function showError(message) {
        openDialog("Error", `<p class="modal-confirm-text">${escapeHtml(message)}</p>`, "OK", null, false);
    }

    function postBulkRestore(items) {
        return fetch("/admin/archive/bulk-restore", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items }),
        }).then((r) => r.json());
    }

    // ------------------------------------------------------------
    // Checkbox column + selection bar for one archive table
    // ------------------------------------------------------------
    function attach(config) {
        const tbody = document.getElementById(config.id);
        if (!tbody || tbody.dataset.bulkRestore) return;
        tbody.dataset.bulkRestore = "1";
        const table = tbody.closest("table");
        if (!table) return;

        const headRow = table.querySelector("thead tr");
        const selectAll = document.createElement("input");
        selectAll.type = "checkbox";
        selectAll.className = "bulk-select-all";
        selectAll.title = "Select all on this page";
        if (headRow) {
            const th = document.createElement("th");
            th.className = "bulk-col";
            th.appendChild(selectAll);
            headRow.insertBefore(th, headRow.firstChild);
        }

        const bar = document.createElement("div");
        bar.className = "bulk-restore-bar is-hidden";
        bar.innerHTML = `
            <span class="bulk-restore-count"></span>
            <button type="button" class="bulk-restore-btn"><i class="fa-solid fa-rotate-left"></i> Restore selected</button>
            <button type="button" class="bulk-clear-btn">Clear</button>`;
        table.parentNode.insertBefore(bar, table);
        const countEl = bar.querySelector(".bulk-restore-count");

        function rowBoxes() {
            return Array.from(tbody.querySelectorAll("input.bulk-row-check"));
        }

        function selected() {
            return rowBoxes().filter((cb) => cb.checked);
        }

        function updateBar() {
            const boxes = rowBoxes();
            const picked = boxes.filter((cb) => cb.checked);
            bar.classList.toggle("is-hidden", picked.length === 0);
            countEl.textContent = `${picked.length} selected`;
            selectAll.checked = boxes.length > 0 && picked.length === boxes.length;
            selectAll.indeterminate = picked.length > 0 && picked.length < boxes.length;
            selectAll.disabled = boxes.length === 0;
            tbody.querySelectorAll("tr").forEach((tr) => {
                const cb = tr.querySelector("input.bulk-row-check");
                tr.classList.toggle("bulk-row-selected", !!(cb && cb.checked));
            });
        }

        // Adds the checkbox cell to every freshly rendered row. Only the
        // tbody's own children are watched, so adding a cell never loops.
        function decorate() {
            tbody.querySelectorAll(":scope > tr").forEach((tr) => {
                if (tr.dataset.bulkDecorated) return;
                tr.dataset.bulkDecorated = "1";
                const restoreBtn = tr.querySelector(config.button);
                if (!restoreBtn) {
                    const only = tr.querySelector("td[colspan]");
                    if (only) only.colSpan = (parseInt(only.getAttribute("colspan"), 10) || 1) + 1;
                    return;
                }
                const td = document.createElement("td");
                td.className = "bulk-col";
                const name = tr.querySelector(".table-item-title, strong");
                td.innerHTML = `<input type="checkbox" class="bulk-row-check" data-id="${escapeHtml(restoreBtn.dataset.id)}"
                                   data-name="${escapeHtml(name ? name.textContent.trim() : "")}"
                                   aria-label="Select ${escapeHtml(name ? name.textContent.trim() : "row")}">`;
                tr.insertBefore(td, tr.firstChild);
            });
            updateBar();
        }

        new MutationObserver(decorate).observe(tbody, { childList: true });
        decorate();

        tbody.addEventListener("change", (e) => {
            if (e.target.classList && e.target.classList.contains("bulk-row-check")) updateBar();
        });
        selectAll.addEventListener("change", () => {
            rowBoxes().forEach((cb) => { cb.checked = selectAll.checked; });
            updateBar();
        });
        bar.querySelector(".bulk-clear-btn").addEventListener("click", () => {
            rowBoxes().forEach((cb) => { cb.checked = false; });
            updateBar();
        });

        function done() {
            tbody.dispatchEvent(new CustomEvent("cobra:bulk-restored", { bubbles: true }));
        }

        bar.querySelector(".bulk-restore-btn").addEventListener("click", () => {
            const picked = selected().map((cb) => ({ id: parseInt(cb.dataset.id, 10), name: cb.dataset.name }));
            if (!picked.length) return;

            if ((config.type === "category" || config.type === "module")
                && typeof window.cobraByteOpenRestoreChecklist === "function") {
                window.cobraByteOpenRestoreChecklist(
                    picked.map((p) => ({ type: config.type, id: p.id, name: p.name })),
                    done
                );
                return;
            }

            confirm(
                `Restore ${plural(picked.length, config.noun)}?`,
                `They will come back as Draft. Anything that has the same name as an active item is skipped.`,
                () => {
                    const btn = bar.querySelector(".bulk-restore-btn");
                    btn.disabled = true;
                    postBulkRestore(picked.map((p) => ({ type: config.type, id: p.id })))
                        .then((result) => {
                            btn.disabled = false;
                            if (!result.restored && !result.skipped) {
                                showError(result.message || "Could not restore the selected items.");
                                return;
                            }
                            showSummary(result);
                            done();
                        })
                        .catch(() => {
                            btn.disabled = false;
                            showError("Could not reach the server. Please try again.");
                        });
                }
            );
        });
    }

    window.CobraBulkRestore = { showSummary, showError, confirm, postBulkRestore, escapeHtml };

    document.addEventListener("DOMContentLoaded", () => {
        TABLES.forEach(attach);
    });
})();
