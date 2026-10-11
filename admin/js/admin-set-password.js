/**
 * admin-set-password.js - forced "Set a new password" (feat/account-tools)
 * --------------------------------------------------------------------------
 * After an admin reset this account's password (Help Requests), the person
 * signs in with the temporary password and lands here. The live rules
 * checklist + "Passwords match" come from password-checklist.js (same rules
 * as the server); POST /staff/set-password, then their home page.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", () => {
        const newInput = document.getElementById("setPwNew");
        const confirmInput = document.getElementById("setPwConfirm");
        const saveBtn = document.getElementById("setPwSaveBtn");
        const message = document.getElementById("setPwMessage");
        // Live rules + "Passwords match" (js/password-checklist.js) - same rules as the server.
        const checklist = CobraPasswordChecklist.attach(newInput, confirmInput);

        function say(text, success) {
            message.textContent = text || "";
            message.classList.toggle("is-success", Boolean(success));
        }

        document.querySelectorAll("[data-toggle]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const input = document.getElementById(btn.dataset.toggle);
                const show = input.type === "password";
                input.type = show ? "text" : "password";
                btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
                btn.innerHTML = `<i class="fa-regular ${show ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i>`;
            });
        });

        async function save() {
            say("");
            if (!checklist.rulesMet()) {
                say("Your password doesn't meet all the rules yet.");
                return;
            }
            if (newInput.value !== confirmInput.value) {
                say("Passwords do not match.");
                return;
            }
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving…";
            try {
                const response = await fetch("/staff/set-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ newPassword: newInput.value, confirmPassword: confirmInput.value }),
                });
                const data = await response.json();
                if (data.success) {
                    say("Password saved. Taking you to your dashboard…", true);
                    setTimeout(() => window.location.replace(data.redirect || "/staff/login"), 900);
                    return;
                }
                if (data.redirect && response.status === 401) {
                    window.location.replace(data.redirect);
                    return;
                }
                say(data.message || "Could not save the password.");
            } catch (err) {
                say("Could not reach the server. Please try again.");
            }
            saveBtn.disabled = false;
            saveBtn.textContent = "Save and continue";
        }

        saveBtn.addEventListener("click", save);
        [newInput, confirmInput].forEach((input) => input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") save();
        }));
    });
})();
