/**
 * password-checklist.js - live password rules + "passwords match" (staff side)
 * --------------------------------------------------------------------------
 * The SAME rules as the server (validators.PASSWORD_REGEX). Each rule turns
 * green with a check as soon as it is met, and the confirm field says
 * whether both passwords match.
 *
 *     const pw = CobraPasswordChecklist.attach(passwordInput, confirmInput, { after: element });
 *     pw.isValid()   -> every rule met AND both fields match
 *     pw.refresh()   -> re-check now (e.g. after form.reset())
 *
 * options.after: where the checklist goes (default: right after the
 * password field's wrapper). Used by the Create Administrator / Create
 * Mentor modals and the forced "Set a new password" page.
 */
(function () {
    "use strict";

    const SPECIAL = /[!@#$%^&*()_,.?":{}|<>]/;   // = validators.PASSWORD_REGEX
    const RULES = [
        ["length", "8+ characters", (v) => v.length >= 8],
        ["upper", "Uppercase (A-Z)", (v) => /[A-Z]/.test(v)],
        ["lower", "Lowercase (a-z)", (v) => /[a-z]/.test(v)],
        ["number", "Number (0-9)", (v) => /\d/.test(v)],
        ["special", "A special character: ! @ # $ % ^ & * ( ) _ , . ? \" : { } | < >", (v) => SPECIAL.test(v)],
    ];

    function attach(passwordInput, confirmInput, options = {}) {
        if (!passwordInput) return null;

        const list = document.createElement("ul");
        list.className = "pw-checklist";
        list.setAttribute("aria-live", "polite");
        list.innerHTML = RULES.map(([key, label]) =>
            `<li data-rule="${key}"><span class="pw-checklist-mark" aria-hidden="true"></span><span class="pw-checklist-text"></span></li>`).join("");
        RULES.forEach(([key, label]) => {
            list.querySelector(`[data-rule="${key}"] .pw-checklist-text`).textContent = label;
        });
        const anchor = options.after || passwordInput.closest(".password-wrapper, .staff-pw-input-wrap") || passwordInput;
        anchor.insertAdjacentElement("afterend", list);

        let match = null;
        if (confirmInput) {
            match = document.createElement("p");
            match.className = "pw-match";
            match.setAttribute("aria-live", "polite");
            const confirmAnchor = confirmInput.closest(".password-wrapper, .staff-pw-input-wrap") || confirmInput;
            confirmAnchor.insertAdjacentElement("afterend", match);
        }

        function rulesMet() {
            return RULES.every(([, , test]) => test(passwordInput.value));
        }

        function refresh() {
            const value = passwordInput.value;
            RULES.forEach(([key, label, test]) => {
                const li = list.querySelector(`[data-rule="${key}"]`);
                const met = test(value);
                li.classList.toggle("is-met", met);
                li.setAttribute("aria-label", `${label}: ${met ? "done" : "not yet"}`);
            });
            list.classList.toggle("is-complete", rulesMet());
            if (match) {
                const c = confirmInput.value;
                match.className = "pw-match";
                if (!c) {
                    match.textContent = "";
                } else if (c === value) {
                    match.textContent = "✓ Passwords match";
                    match.classList.add("is-ok");
                } else {
                    match.textContent = "✗ Passwords do not match";
                    match.classList.add("is-bad");
                }
            }
        }

        passwordInput.addEventListener("input", refresh);
        if (confirmInput) confirmInput.addEventListener("input", refresh);
        const form = passwordInput.form;
        if (form) form.addEventListener("reset", () => setTimeout(refresh, 0));
        refresh();

        return {
            refresh,
            rulesMet,
            isValid: () => rulesMet() && (!confirmInput || confirmInput.value === passwordInput.value),
        };
    }

    window.CobraPasswordChecklist = { attach, RULES };
})();
