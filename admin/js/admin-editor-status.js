/**
 * admin-editor-status.js - feat/publishing-tree
 * --------------------------------------------------------------------
 * Shared by the 4 editors (New Lesson, Create Learning Activity, Create
 * Coding Exercise, Video Tutorial):
 *
 * 1. window.cobraEditorReturnUrl(fallback)
 *    Where to go after a save / status change. When the editor was
 *    opened from the Publishing page (?return=publishing), the server
 *    puts that page's URL on <body data-return-url="...">; otherwise the
 *    editor's own manage page (fallback) is used.
 *
 * 2. Status buttons in the editor header, e.g.
 *      <button class="js-editor-status-action" data-kind="lesson"
 *              data-id="12" data-action="unpublish" data-tab="ready"
 *              data-title="Unpublish Lesson?" data-confirm="...">
 *    Click -> shared #confirmActionModal -> POST
 *    /admin/publishing/<kind>/<id>/<action> -> toast -> back to the
 *    Publishing page (or the manage page). All rules live on the server
 *    (publishing_actions.py).
 */
(function () {
    "use strict";

    window.cobraEditorReturnUrl = function (fallback) {
        const url = document.body ? document.body.dataset.returnUrl : "";
        return url || fallback;
    };

    // Same tab the admin came from, unless the action moved the item to another tab.
    function returnUrlForTab(fallback, tab) {
        const url = window.cobraEditorReturnUrl("");
        if (!url) return fallback;
        if (!tab) return url;
        const base = url.split("?")[0];
        return `${base}?tab=${encodeURIComponent(tab)}`;
    }
    window.cobraEditorReturnUrlForTab = returnUrlForTab;

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function showToast(message, isError) {
        const id = isError ? "resourcePopupAlert" : "changesSavedToast";
        let toast = document.getElementById(id);
        if (!toast) {
            toast = document.createElement("div");
            toast.id = id;
            document.body.appendChild(toast);
        }
        toast.className = isError ? "resource-popup-alert error" : "changes-saved-toast";
        const icon = isError ? "fa-circle-exclamation" : "fa-circle-check";
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), isError ? 3500 : 2000);
    }
    window.cobraEditorToast = showToast;

    // One-shot confirm on the shared modal. The page's own scripts also
    // listen on these buttons; they only close the modal, so both are safe.
    function confirmOnce(message, title, onConfirm) {
        const modal = document.getElementById("confirmActionModal");
        if (!modal) {
            if (window.confirm(message)) onConfirm();
            return;
        }
        const titleEl = document.getElementById("confirmActionTitle");
        const textEl = document.getElementById("confirmActionText");
        const cancelBtn = document.getElementById("confirmActionCancelBtn");
        const okBtn = document.getElementById("confirmActionConfirmBtn");

        if (titleEl) titleEl.textContent = title || "Confirm Action";
        if (textEl) textEl.textContent = message;
        if (cancelBtn) cancelBtn.style.display = "";
        if (okBtn) okBtn.textContent = "Confirm";
        modal.classList.remove("modal-hidden");
        modal.style.display = "flex";

        function cleanup() {
            modal.classList.add("modal-hidden");
            modal.style.display = "none";
            if (okBtn) okBtn.removeEventListener("click", onOk);
            if (cancelBtn) cancelBtn.removeEventListener("click", cleanup);
            modal.removeEventListener("click", onOverlay);
        }
        function onOk() { cleanup(); onConfirm(); }
        function onOverlay(e) { if (e.target === modal) cleanup(); }

        if (okBtn) okBtn.addEventListener("click", onOk);
        if (cancelBtn) cancelBtn.addEventListener("click", cleanup);
        modal.addEventListener("click", onOverlay);
    }
    window.cobraEditorConfirm = confirmOnce;

    async function postStatusAction(kind, id, action) {
        const response = await fetch(`/admin/publishing/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/${encodeURIComponent(action)}`, {
            method: "POST",
            credentials: "same-origin",
            headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        return response.json().catch(() => ({ success: false, message: "Unexpected server response." }));
    }
    window.cobraEditorStatusAction = postStatusAction;

    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".js-editor-status-action");
        if (!btn) return;
        e.preventDefault();

        const { kind, id, action, tab, fallback } = btn.dataset;
        if (!id) {
            showToast("Save this item first.", true);
            return;
        }

        confirmOnce(btn.dataset.confirm || "Are you sure?", btn.dataset.title, async () => {
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Working...';
            try {
                const result = await postStatusAction(kind, id, action);
                if (!result.success) {
                    showToast(result.message || "Could not change the status.", true);
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                    return;
                }
                // Unsaved edits in the form still trigger the page's own
                // "leave without saving?" warning on the redirect below.
                showToast(result.message || "Status updated.");
                setTimeout(() => {
                    window.location.href = returnUrlForTab(fallback || "/admin/publishing", tab);
                }, 1200);
            } catch (err) {
                showToast("Could not reach the server. Please try again.", true);
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        });
    });
})();
