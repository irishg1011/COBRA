/**
 * account-restore.js - "Restore your account?" at sign-in (feat/account-tools)
 * --------------------------------------------------------------------------
 * Used by BOTH login pages (learner static/script.js, staff admin-login.js).
 * When the right password is typed for an account its owner asked to delete,
 * the server answers 409 {pending_deletion, delete_on}. The page then calls
 *
 *     const restore = await CobraRestore.ask("Nov 10, 2026");
 *
 * true  -> the page sends the same sign-in again with restore: true
 * false -> nothing changes: still pending, still signed out.
 */
(function () {
    "use strict";

    function build() {
        const overlay = document.createElement("div");
        overlay.className = "cr-overlay";
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="cr-dialog" role="alertdialog" aria-modal="true" aria-labelledby="crTitle" aria-describedby="crText">
                <div class="cr-icon" aria-hidden="true">!</div>
                <h2 class="cr-title" id="crTitle">Restore your account?</h2>
                <p class="cr-text" id="crText"></p>
                <div class="cr-actions">
                    <button type="button" class="cr-btn cr-btn--ghost" data-cr="cancel">Cancel</button>
                    <button type="button" class="cr-btn cr-btn--primary" data-cr="restore">Restore my account</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        return overlay;
    }

    let overlay = null;

    function ask(deleteOn) {
        overlay = overlay || build();
        overlay.querySelector("#crText").textContent =
            `Your account will be deleted on ${deleteOn}. Restore it to keep using CobraByte - everything will be just as you left it.`;
        overlay.hidden = false;
        const restoreBtn = overlay.querySelector('[data-cr="restore"]');
        const cancelBtn = overlay.querySelector('[data-cr="cancel"]');
        restoreBtn.focus();
        return new Promise((resolve) => {
            function done(answer) {
                overlay.hidden = true;
                restoreBtn.removeEventListener("click", onRestore);
                cancelBtn.removeEventListener("click", onCancel);
                document.removeEventListener("keydown", onKey);
                resolve(answer);
            }
            const onRestore = () => done(true);
            const onCancel = () => done(false);
            const onKey = (e) => { if (e.key === "Escape") done(false); };
            restoreBtn.addEventListener("click", onRestore);
            cancelBtn.addEventListener("click", onCancel);
            document.addEventListener("keydown", onKey);
        });
    }

    window.CobraRestore = { ask };
})();
