/**
 * delete-account.js - "Delete my account" (feat/account-tools)
 * --------------------------------------------------------------------------
 * Shared by the learner Profile page and the staff profile menu. Any element
 *
 *     <button data-delete-account="/api/profile/delete-account"
 *             data-delete-check="/admin/profile/delete-account">   (optional GET: allowed?)
 *
 * opens a dialog: what happens (30 days to change your mind, then archived),
 * password to confirm. On success the person is signed out and sent to the
 * login page (the server already ended every session).
 */
(function () {
    "use strict";

    let overlay = null;
    let endpoint = "";

    function escapeHtml(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function build() {
        const el = document.createElement("div");
        el.className = "da-overlay";
        el.hidden = true;
        el.innerHTML = `
            <div class="da-dialog" role="dialog" aria-modal="true" aria-labelledby="daTitle">
                <button type="button" class="da-close" data-da="cancel" aria-label="Close">&times;</button>
                <div class="da-icon" aria-hidden="true">!</div>
                <h2 class="da-title" id="daTitle">Delete my account</h2>
                <ul class="da-points">
                    <li>You'll be <strong>signed out</strong> on every device right away.</li>
                    <li>You have <strong>30 days</strong> to change your mind - just sign in again and choose <em>Restore</em>.</li>
                    <li>After 30 days the account is closed. Only an administrator can bring it back.</li>
                </ul>
                <p class="da-blocked" data-da="blocked" hidden></p>
                <label class="da-label" for="daPassword">Enter your password to confirm</label>
                <input type="password" id="daPassword" class="da-input" autocomplete="current-password">
                <p class="da-message" data-da="message" role="alert"></p>
                <div class="da-actions">
                    <button type="button" class="da-btn da-btn--ghost" data-da="cancel">Keep my account</button>
                    <button type="button" class="da-btn da-btn--danger" data-da="confirm">Delete my account</button>
                </div>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener("click", (e) => {
            if (e.target === el || e.target.closest('[data-da="cancel"]')) close();
        });
        el.querySelector('[data-da="confirm"]').addEventListener("click", submit);
        el.querySelector("#daPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) close(); });
        return el;
    }

    function $(name) {
        return overlay.querySelector(`[data-da="${name}"]`);
    }

    function close() {
        if (overlay) overlay.hidden = true;
    }

    async function open(trigger) {
        overlay = overlay || build();
        endpoint = trigger.dataset.deleteAccount;
        const password = overlay.querySelector("#daPassword");
        password.value = "";
        $("message").textContent = "";
        $("blocked").hidden = true;
        password.disabled = false;
        $("confirm").disabled = false;
        overlay.hidden = false;
        password.focus();

        if (trigger.dataset.deleteCheck) {
            try {
                const response = await fetch(trigger.dataset.deleteCheck, {
                    headers: { "X-Requested-With": "XMLHttpRequest" }, credentials: "same-origin",
                });
                const data = await response.json();
                if (data.success && !data.allowed) {
                    $("blocked").textContent = data.reason;
                    $("blocked").hidden = false;
                    password.disabled = true;
                    $("confirm").disabled = true;
                }
            } catch (err) { /* the server checks again on submit */ }
        }
    }

    async function submit() {
        const password = overlay.querySelector("#daPassword");
        const button = $("confirm");
        if (button.disabled) return;
        if (!password.value) {
            $("message").textContent = "Enter your password to confirm.";
            password.focus();
            return;
        }
        button.disabled = true;
        button.textContent = "Deleting…";
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                credentials: "same-origin",
                body: JSON.stringify({ password: password.value }),
            });
            const data = await response.json();
            if (data.success) {
                overlay.querySelector(".da-dialog").innerHTML = `
                    <div class="da-icon da-icon--ok" aria-hidden="true">&#10003;</div>
                    <h2 class="da-title">Account deleted</h2>
                    <p class="da-text">${escapeHtml(data.message)}</p>`;
                try { sessionStorage.clear(); } catch (err) { /* private mode */ }
                setTimeout(() => window.location.replace(data.redirect || "/"), 3500);
                return;
            }
            $("message").textContent = data.message || "Could not delete the account.";
        } catch (err) {
            $("message").textContent = "Could not reach the server. Please try again.";
        }
        button.disabled = false;
        button.textContent = "Delete my account";
    }

    // Capture phase: the staff profile menu stops clicks from bubbling out of it.
    document.addEventListener("click", (e) => {
        const trigger = e.target.closest("[data-delete-account]");
        if (!trigger) return;
        e.preventDefault();
        open(trigger);
    }, true);
})();
