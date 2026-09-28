/**
 * admin-title-history.js - shared "Name History" modal
 * --------------------------------------------------------------------
 * feat/module-title-history
 *
 * Any button/link with class .js-title-history and
 *     data-scope = category | module | lesson | activities | exercise
 *     data-id    = that item's id (for "activities": the lesson's resource_id)
 * opens #titleHistoryModal (title-history-modal.html) with that item's
 * name history, newest first - from /admin/title-history/<scope>/<id>.
 *
 * "Revert to this" asks for confirmation right inside the entry (no
 * second modal), then POSTs /admin/title-history/revert. The server
 * applies the same rules as a normal rename. After a successful revert
 * the modal reloads and a "cobra:title-changed" event is fired on
 * document, so the page's own table can refresh itself.
 *
 * Delegated on document, so it also works for rows rebuilt by search,
 * pagination and the Categories modal.
 */
(function () {
    "use strict";

    const TOAST_MS = 2500;
    const CHANGE_ICONS = {
        created: "fa-solid fa-star",
        renamed: "fa-solid fa-pen",
        reverted: "fa-solid fa-rotate-left",
    };

    document.addEventListener("DOMContentLoaded", () => {
        const modal = document.getElementById("titleHistoryModal");
        if (!modal) return;

        const closeBtn = document.getElementById("closeTitleHistoryBtn");
        const subtitleEl = document.getElementById("titleHistorySubtitle");
        const bodyEl = document.getElementById("titleHistoryBody");

        let current = null; // { scope, id }
        let requestId = 0;
        let lastFocused = null;

        function escapeHtml(str) {
            const div = document.createElement("div");
            div.textContent = str == null ? "" : String(str);
            return div.innerHTML;
        }

        // Same green toast the rest of the admin uses (.changes-saved-toast)
        let toastTimer = null;
        function showToast(message) {
            let toast = document.getElementById("titleHistoryToast");
            if (!toast) {
                toast = document.createElement("div");
                toast.id = "titleHistoryToast";
                toast.className = "changes-saved-toast";
                toast.setAttribute("role", "status");
                document.body.appendChild(toast);
            }
            toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${escapeHtml(message)}</span>`;
            toast.classList.add("show");
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toast.classList.remove("show"), TOAST_MS);
        }

        function changeText(entry) {
            const newTitle = `<strong>&ldquo;${escapeHtml(entry.new_title)}&rdquo;</strong>`;
            if (entry.change_type === "created") return `Created as ${newTitle}`;
            const oldTitle = `&ldquo;${escapeHtml(entry.old_title)}&rdquo;`;
            const verb = entry.change_type === "reverted" ? "Reverted" : "Renamed";
            return `${verb} ${oldTitle} <i class="fa-solid fa-arrow-right title-history-arrow" aria-hidden="true"></i> ${newTitle}`;
        }

        function entryHtml(entry) {
            const when = entry.changed_at || "Before history tracking";
            const who = entry.changed_by ? ` &middot; by ${escapeHtml(entry.changed_by)}` : "";
            const revert = entry.can_revert
                ? `<button type="button" class="btn-pill-light title-history-revert-btn js-history-revert" data-history-id="${entry.history_id}" data-title="${escapeHtml(entry.new_title)}">
                       <i class="fa-solid fa-rotate-left"></i> Revert to this
                   </button>`
                : "";
            return `
                <li class="title-history-item title-history-item--${escapeHtml(entry.change_type)}">
                    <span class="title-history-icon" aria-hidden="true"><i class="${CHANGE_ICONS[entry.change_type] || CHANGE_ICONS.renamed}"></i></span>
                    <div class="title-history-main">
                        <p class="title-history-change">${changeText(entry)}</p>
                        <p class="title-history-meta">${escapeHtml(when)}${who}</p>
                        <div class="title-history-actions">${revert}</div>
                    </div>
                </li>`;
        }

        function sectionHtml(section, showLabel) {
            const entries = section.entries.length
                ? `<ol class="title-history-list">${section.entries.map(entryHtml).join("")}</ol>`
                : `<p class="text-muted title-history-empty">No name changes recorded yet.</p>`;
            return `
                <section class="title-history-section">
                    ${showLabel ? `<span class="title-history-label">${escapeHtml(section.label)}</span>` : ""}
                    <p class="title-history-current">Current name: <strong>${escapeHtml(section.current_title)}</strong></p>
                    ${entries}
                </section>`;
        }

        async function load() {
            if (!current) return;
            const myRequest = ++requestId;
            try {
                const response = await fetch(`/admin/title-history/${encodeURIComponent(current.scope)}/${encodeURIComponent(current.id)}`, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                });
                const data = await response.json();
                if (myRequest !== requestId) return;
                if (!response.ok || !data.success) throw new Error(data.message || `HTTP ${response.status}`);

                subtitleEl.textContent = data.heading || "";
                // Label every section only when there's more than one
                // (lesson + video, or several activities).
                const showLabels = data.sections.length > 1 || current.scope === "activities";
                bodyEl.innerHTML = data.sections.map((s) => sectionHtml(s, showLabels)).join("");
            } catch (err) {
                if (myRequest !== requestId) return;
                bodyEl.innerHTML = `<p class="title-history-error">Could not load the name history. Please close and try again.</p>`;
                console.error("admin-title-history: failed to load history:", err);
            }
        }

        function open(scope, id) {
            if (!scope || !id) return;
            current = { scope, id };
            lastFocused = document.activeElement;
            subtitleEl.textContent = "";
            bodyEl.innerHTML = `<p class="text-muted">Loading&hellip;</p>`;
            modal.classList.remove("modal-hidden");
            closeBtn.focus();
            load();
        }

        function close() {
            if (modal.classList.contains("modal-hidden")) return false;
            requestId++;
            current = null;
            modal.classList.add("modal-hidden");
            if (lastFocused && typeof lastFocused.focus === "function" && document.contains(lastFocused)) {
                lastFocused.focus();
            }
            return true;
        }

        // --- Revert: confirm inside the entry itself ---
        function showInlineConfirm(button) {
            const actions = button.closest(".title-history-actions");
            const title = button.dataset.title;
            actions.innerHTML = `
                <div class="title-history-confirm">
                    <span>Rename back to <strong>&ldquo;${escapeHtml(title)}&rdquo;</strong>?</span>
                    <button type="button" class="modal-btn-cancel title-history-small-btn js-history-cancel">Cancel</button>
                    <button type="button" class="modal-btn-save title-history-small-btn js-history-confirm" data-history-id="${escapeHtml(button.dataset.historyId)}" data-title="${escapeHtml(title)}">Revert</button>
                </div>
                <p class="title-history-error" role="alert"></p>`;
            actions.querySelector(".js-history-confirm").focus();
        }

        async function doRevert(button) {
            const actions = button.closest(".title-history-actions");
            const errorEl = actions.querySelector(".title-history-error");
            button.disabled = true;
            button.textContent = "Reverting...";
            try {
                const response = await fetch("/admin/title-history/revert", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                    credentials: "include",
                    body: JSON.stringify({ history_id: Number(button.dataset.historyId) }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok || !data.success) {
                    errorEl.textContent = data.message || "Could not revert this name.";
                    button.disabled = false;
                    button.textContent = "Revert";
                    return;
                }
                showToast(data.message || "Name reverted.");
                document.dispatchEvent(new CustomEvent("cobra:title-changed", { detail: { scope: current && current.scope } }));
                load();
            } catch (err) {
                errorEl.textContent = "Could not reach the server. Please try again.";
                button.disabled = false;
                button.textContent = "Revert";
            }
        }

        bodyEl.addEventListener("click", (e) => {
            const revertBtn = e.target.closest(".js-history-revert");
            if (revertBtn) { showInlineConfirm(revertBtn); return; }

            const cancelBtn = e.target.closest(".js-history-cancel");
            if (cancelBtn) { load(); return; }

            const confirmBtn = e.target.closest(".js-history-confirm");
            if (confirmBtn) doRevert(confirmBtn);
        });

        // Open from any page's History icon (rows are rebuilt often, so delegate).
        document.addEventListener("click", (e) => {
            const trigger = e.target.closest(".js-title-history");
            if (!trigger) return;
            e.preventDefault();
            e.stopPropagation(); // e.g. don't also toggle the Categories accordion row
            open(trigger.dataset.scope, trigger.dataset.id);
        }, true);

        // <i role="button"> triggers (Categories modal) - Enter / Space open too.
        document.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const trigger = e.target.closest && e.target.closest(".js-title-history");
            if (!trigger || trigger.tagName === "BUTTON" || trigger.tagName === "A") return;
            e.preventDefault();
            open(trigger.dataset.scope, trigger.dataset.id);
        });

        closeBtn.addEventListener("click", close);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) close();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !e.defaultPrevented && close()) e.preventDefault();
        });

        window.CobraTitleHistory = { open };
    });
})();
