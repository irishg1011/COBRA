/**
 * admin-preview-frame.js - feat/admin-real-game-preview
 * ---------------------------------------------------------------
 * One shared popup for previewing an activity or coding exercise with
 * the REAL learner games / exercise screen (/admin/preview-play) inside
 * an iframe. Same modal pattern as the video preview popup
 * (modal-overlay + card, CSS in admin-style.css).
 *
 * Closes on x, on a click outside the card, and on Esc. Closing removes
 * the overlay (and the iframe with it), so the game loop and any sound stop.
 *
 * Exposes window.CobraPreviewFrame.open(query, title), where query is the
 * preview-play query string, e.g. "la_id=12" or "exercise_id=4".
 */
(function () {
    "use strict";

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    function open(query, title) {
        let overlay = document.getElementById("previewFrameModalOverlay");
        if (overlay) overlay.remove();

        overlay = document.createElement("div");
        overlay.id = "previewFrameModalOverlay";
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="preview-frame-card" role="dialog" aria-modal="true" aria-labelledby="previewFrameTitle">
                <div class="preview-frame-head">
                    <h3 class="preview-frame-title" id="previewFrameTitle">${escapeHtml(title || "Preview")}</h3>
                    <button type="button" id="previewFrameCloseBtn" class="modal-close-btn preview-frame-close-btn" title="Close" aria-label="Close">&times;</button>
                </div>
                <iframe class="preview-frame-iframe" src="/admin/preview-play?${query}" title="${escapeHtml(title || "Preview")}"></iframe>
            </div>
        `;
        document.body.appendChild(overlay);

        const frame = overlay.querySelector(".preview-frame-iframe");

        function closeModal() {
            overlay.remove();
            document.removeEventListener("keydown", onEscKey);
            window.removeEventListener("message", onFrameMessage);
        }
        function onEscKey(e) {
            if (e.key === "Escape") closeModal();
        }
        // Esc pressed inside the game frame (see admin-preview-play.js).
        function onFrameMessage(e) {
            if (e.source !== frame.contentWindow || e.origin !== window.location.origin) return;
            const msg = e.data || {};
            if (msg.source === "cobra-preview-play" && msg.type === "escape") closeModal();
        }

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeModal();
        });
        overlay.querySelector("#previewFrameCloseBtn").addEventListener("click", closeModal);
        document.addEventListener("keydown", onEscKey);
        window.addEventListener("message", onFrameMessage);
    }

    window.CobraPreviewFrame = { open: open };
})();
