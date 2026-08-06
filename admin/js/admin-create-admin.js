/**
 * admin-create-admin.js - CobraByte Admin: Create Administrator Modal
 * ---------------------------------------------------------------------
 * Wires up the Create Administrator modal (admin-create-admin-modal.html)
 * to the backend's validation + account-creation endpoints
 * (admin_routes.py: create_administrator, check_account_field_availability),
 * reusing the exact same rules the Learner Sign Up form already uses -
 * live name capitalization, password strength, email/mobile format,
 * and duplicate-username/email/mobile checks - instead of a second,
 * divergent copy of that logic.
 *
 * The modal's markup is intentionally left untouched (Task requirement:
 * "Keep the current Create Administrator modal UI unchanged"), so every
 * bit of validation feedback is injected dynamically - the same
 * technique script.js already uses on the Sign Up form via
 * showInlineError()/clearInlineError() - rather than relying on any
 * hardcoded error/checker element in this modal's HTML.
 *
 * Included on every admin page that also includes the modal
 * (account-security.html, login-logs.html). Safe to include everywhere
 * else too - it no-ops if #createAdminForm isn't present on the page.
 */
(function () {
    "use strict";

    const DEBOUNCE_MS = 400;

    // Mirrors validators.py's PASSWORD_REGEX / script.js's strongRegex
    // exactly, so the "live" feedback here always agrees with what the
    // server will ultimately accept or reject.
    const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_,.?":{}|<>]).{8,}$/;
    const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    const MOBILE_REGEX = /^09\d{9}$/;

    document.addEventListener("DOMContentLoaded", () => {
        const form = document.getElementById("createAdminForm");
        if (!form) return; // modal not included on this page

        const fields = {
            username: document.getElementById("admin_username"),
            password: document.getElementById("admin_password"),
            confirmPassword: document.getElementById("admin_confirm_password"),
            email: document.getElementById("admin_email"),
            mobile: document.getElementById("admin_mobile"),
            firstName: document.getElementById("admin_firstname"),
            lastName: document.getElementById("admin_lastname"),
            gender: document.getElementById("admin_gender"),
            birthdate: document.getElementById("admin_birthdate"),
        };

        const submitBtn = form.querySelector('button[type="submit"]');
        const createAdminModal = document.getElementById("createAdminModal");
        const modalHeaderSection = document.querySelector("#createAdminModal .modal-header-section");

        // ------------------------------------------------------------
        // Live "next Account ID" preview - replaces the static
        // "Auto-generated on submit" placeholder with what the real ID
        // will actually look like (e.g. "AD2608060004"), fetched from
        // admin_routes.py's read-only /admin/accounts/next-id endpoint.
        // Purely cosmetic: the real ID is still only ever generated
        // server-side, inside create_administrator()'s own transaction.
        // ------------------------------------------------------------
        const accIdPreviewInput = document.getElementById("admin_acc_id");
        const ACC_ID_PLACEHOLDER = "Auto-generated on submit";

        async function loadNextAdminId() {
            if (!accIdPreviewInput) return;
            accIdPreviewInput.value = "Loading...";
            try {
                const response = await fetch("/admin/accounts/next-id", { credentials: "include" });
                const result = await response.json();
                accIdPreviewInput.value = result.success ? result.next_id : ACC_ID_PLACEHOLDER;
            } catch (err) {
                accIdPreviewInput.value = ACC_ID_PLACEHOLDER;
            }
        }

        // Exposed globally so admin-script.js's "open modal" click handler
        // can trigger a fresh preview every time the modal is opened,
        // instead of duplicating the fetch logic there.
        window.cobraByteLoadNextAdminId = loadNextAdminId;

        // ------------------------------------------------------------
        // Top-of-panel banner - same purpose as the Sign Up page's
        // inline error text, but for messages that AREN'T tied to one
        // specific field (e.g. "Please fix the highlighted fields.",
        // a database error, or a network failure). Lives right under
        // the modal's subtitle so it's the first thing the admin sees,
        // instead of a browser alert() popup.
        // ------------------------------------------------------------
        function showFormMessage(message, isError = true) {
            if (!modalHeaderSection) return;
            let banner = modalHeaderSection.querySelector(".js-form-banner-message");
            if (!banner) {
                banner = document.createElement("p");
                banner.className = "js-form-banner-message";
                banner.style.marginTop = "10px";
                banner.style.padding = "10px 14px";
                banner.style.borderRadius = "8px";
                banner.style.fontSize = "13px";
                banner.style.fontWeight = "600";
                modalHeaderSection.appendChild(banner);
            }
            banner.textContent = message;
            banner.style.color = isError ? "#b91c1c" : "#166534";
            banner.style.background = isError ? "#fee2e2" : "#dcfce7";
        }

        function clearFormMessage() {
            if (!modalHeaderSection) return;
            const banner = modalHeaderSection.querySelector(".js-form-banner-message");
            if (banner) banner.remove();
        }

        // ------------------------------------------------------------
        // Inline error helpers - mirrors script.js's
        // showInlineError()/clearInlineError() pattern exactly, so no
        // field needs a pre-existing error element in the HTML.
        // ------------------------------------------------------------
        function showFieldError(input, message) {
            if (!input) return;
            const formGroup = input.closest(".form-group") || input.parentElement;
            let errorEl = formGroup.querySelector(".js-error-message");
            if (!errorEl) {
                errorEl = document.createElement("p");
                errorEl.className = "js-error-message";
                errorEl.style.color = "#e02424";
                errorEl.style.fontSize = "12px";
                errorEl.style.marginTop = "6px";
                formGroup.appendChild(errorEl);
            }
            errorEl.textContent = message;
        }

        function clearFieldError(input) {
            if (!input) return;
            const formGroup = input.closest(".form-group") || input.parentElement;
            const errorEl = formGroup.querySelector(".js-error-message");
            if (errorEl) errorEl.remove();
        }

        function clearAllErrors() {
            Object.values(fields).forEach(clearFieldError);
        }

        // ------------------------------------------------------------
        // Live name capitalization (Task: "Automatically capitalize all
        // name fields using the existing capitalization logic") -
        // identical formatter to script.js's firstName/lastName input
        // handler.
        // ------------------------------------------------------------
        [fields.firstName, fields.lastName].forEach((input) => {
            if (!input) return;
            input.addEventListener("input", () => {
                const start = input.selectionStart, end = input.selectionEnd;
                let val = input.value.replace(/[^a-zA-Z\s]/g, "");
                if (val.length > 0) val = val.replace(/\b\w/g, (c) => c.toUpperCase());
                input.value = val;
                if (start !== null && end !== null) input.setSelectionRange(start, end);
                clearFieldError(input);
            });
        });

        // Email -> lowercase, restricted charset (mirrors script.js)
        if (fields.email) {
            fields.email.addEventListener("input", () => {
                const start = fields.email.selectionStart, end = fields.email.selectionEnd;
                fields.email.value = fields.email.value.toLowerCase().replace(/[^a-z0-9@._-]/g, "");
                if (start !== null && end !== null) fields.email.setSelectionRange(start, end);
            });
        }

        // Username -> lowercase, restricted charset (mirrors script.js)
        if (fields.username) {
            fields.username.addEventListener("input", () => {
                const start = fields.username.selectionStart, end = fields.username.selectionEnd;
                fields.username.value = fields.username.value.toLowerCase().replace(/[^a-z0-9@_]/g, "");
                if (start !== null && end !== null) fields.username.setSelectionRange(start, end);
            });
        }

        // Mobile -> digits only, capped at 11 (PH format 09XXXXXXXXX)
        if (fields.mobile) {
            fields.mobile.addEventListener("input", () => {
                fields.mobile.value = fields.mobile.value.replace(/\D/g, "").slice(0, 11);
            });
        }

        // ------------------------------------------------------------
        // Task: "Implement live password strength validation" - a
        // single consolidated inline message instead of a dedicated
        // checker box, since the modal's markup has no such element and
        // must stay unchanged.
        // ------------------------------------------------------------
        function checkPasswordStrength() {
            if (!fields.password) return true;
            const val = fields.password.value;
            if (!val) { clearFieldError(fields.password); return false; }
            if (!PASSWORD_REGEX.test(val)) {
                showFieldError(fields.password, "Must be 8+ characters with an uppercase letter, lowercase letter, number, and special character.");
                return false;
            }
            clearFieldError(fields.password);
            return true;
        }

        // Task: "Implement live password confirmation checking"
        function checkPasswordMatch() {
            if (!fields.confirmPassword) return true;
            if (!fields.confirmPassword.value) { clearFieldError(fields.confirmPassword); return false; }
            if (fields.password.value !== fields.confirmPassword.value) {
                showFieldError(fields.confirmPassword, "Passwords do not match.");
                return false;
            }
            clearFieldError(fields.confirmPassword);
            return true;
        }

        if (fields.password) {
            fields.password.addEventListener("input", () => {
                checkPasswordStrength();
                if (fields.confirmPassword && fields.confirmPassword.value) checkPasswordMatch();
            });
        }
        if (fields.confirmPassword) fields.confirmPassword.addEventListener("input", checkPasswordMatch);

        // ------------------------------------------------------------
        // Live duplicate checks (username / email / mobile) - debounced
        // calls to GET /admin/accounts/check-availability. Purely a UX
        // convenience; the server re-checks uniqueness on submit
        // regardless (see admin_routes.py: create_administrator()).
        // ------------------------------------------------------------
        function debounce(fn, ms) {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn(...args), ms);
            };
        }

        function checkAvailability(field, input, takenMessage) {
            const value = input.value.trim();
            if (!value) { clearFieldError(input); return; }
            fetch(`/admin/accounts/check-availability?field=${field}&value=${encodeURIComponent(value)}`, { credentials: "include" })
                .then((r) => r.json())
                .then((result) => {
                    if (!result.success) return;
                    if (result.available === false) {
                        showFieldError(input, takenMessage);
                    } else {
                        clearFieldError(input);
                    }
                })
                .catch(() => { /* best-effort - server re-validates on submit anyway */ });
        }

        if (fields.username) {
            fields.username.addEventListener("input", debounce(
                () => checkAvailability("username", fields.username, "This username is already taken."), DEBOUNCE_MS
            ));
        }
        if (fields.email) {
            fields.email.addEventListener("input", debounce(
                () => checkAvailability("email", fields.email, "An account with this email already exists."), DEBOUNCE_MS
            ));
        }
        if (fields.mobile) {
            fields.mobile.addEventListener("input", debounce(
                () => checkAvailability("mobile", fields.mobile, "This mobile number is already registered."), DEBOUNCE_MS
            ));
        }

        // ------------------------------------------------------------
        // Submission
        // ------------------------------------------------------------
        let submitting = false; // Task: "Prevent duplicate submissions"

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (submitting) return;

            clearAllErrors();
            clearFormMessage();

            const passwordOk = checkPasswordStrength();
            const matchOk = checkPasswordMatch();
            let hasError = !passwordOk || !matchOk;

            // Required-field pass (mirrors script.js's validateRequiredFields)
            [
                [fields.firstName, "First name is required."],
                [fields.lastName, "Last name is required."],
                [fields.username, "Username is required."],
                [fields.email, "Email address is required."],
                [fields.mobile, "Mobile number is required."],
                [fields.gender, "Please select a gender."],
                [fields.birthdate, "Birthdate is required."],
            ].forEach(([input, msg]) => {
                if (input && !input.value.trim()) {
                    showFieldError(input, msg);
                    hasError = true;
                }
            });

            if (fields.mobile && fields.mobile.value && !MOBILE_REGEX.test(fields.mobile.value)) {
                showFieldError(fields.mobile, "Please enter a valid PH mobile number (e.g., 09XXXXXXXXX).");
                hasError = true;
            }

            if (fields.email && fields.email.value && !EMAIL_REGEX.test(fields.email.value)) {
                showFieldError(fields.email, "Please enter a valid email address (e.g., name@example.com).");
                hasError = true;
            }

            // NOTE: this used to `return` here on any client-side error
            // (password strength, password match, required fields,
            // mobile/email format) - which meant the backend was never
            // even called, so the admin had to fix those, resubmit, and
            // only THEN find out separately that the username/email/
            // mobile were duplicates.
            //
            // The backend now re-validates format AND checks duplicates
            // together in one pass, returning every error at once (see
            // admin_routes.py: create_administrator()). So instead of
            // stopping here, submission always proceeds: the client-side
            // errors already shown above stay visible, and the merge
            // below (result.errors) adds anything else the server finds
            // - duplicates, or anything client-side missed - onto the
            // same fields. `hasError` itself no longer gates submission.

            submitting = true;
            if (submitBtn) {
                submitBtn.disabled = true;
                if (!submitBtn.dataset.originalHtml) submitBtn.dataset.originalHtml = submitBtn.innerHTML;
                submitBtn.innerHTML = "Creating...";
            }

            try {
                const formData = new FormData(form);
                const response = await fetch(form.action, {
                    method: "POST",
                    credentials: "include",
                    body: formData,
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                });
                const result = await response.json();

                if (result.success) {
                    // Task: "Show success feedback after a successful account creation"
                    showFormMessage(result.message || "Administrator account created successfully.", false);
                    // Task: "Clear the form only after the account has been successfully saved"
                    setTimeout(() => {
                        form.reset();
                        clearAllErrors();
                        clearFormMessage();
                        if (createAdminModal) createAdminModal.style.display = "none";
                    }, 1200);
                } else if (result.errors && Object.keys(result.errors).length) {
                    // Task: "Display validation messages dynamically without
                    // refreshing the page" - every error (including a 409
                    // duplicate email/username/mobile from the server) renders
                    // inline in this same panel, never as a raw JSON page.
                    const inputMap = {
                        first_name: fields.firstName,
                        last_name: fields.lastName,
                        username: fields.username,
                        password: fields.password,
                        confirm_password: fields.confirmPassword,
                        email: fields.email,
                        mobile: fields.mobile,
                        gender: fields.gender,
                        birthdate: fields.birthdate,
                    };
                    Object.entries(result.errors).forEach(([key, msg]) => {
                        if (inputMap[key]) showFieldError(inputMap[key], msg);
                    });
                    showFormMessage(result.message || "Please fix the highlighted fields.");
                } else {
                    showFormMessage(result.message || "Could not create the account.");
                }
            } catch (err) {
                showFormMessage("Could not reach the server. Please try again.");
            } finally {
                submitting = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = submitBtn.dataset.originalHtml || "Create Account";
                }
            }
        });

        // ------------------------------------------------------------
        // Task: "If click outside the panel there's a notice if you
        // want to close, else the data that have been input will
        // erase." Shared close logic used by the X button, the outside
        // click, AND the future Cancel button (if one is added) - see
        // admin-script.js, which routes both its close handlers through
        // this exact function instead of hiding the modal directly.
        // ------------------------------------------------------------
        function formHasData() {
            return Object.values(fields).some((input) => input && String(input.value || "").trim() !== "");
        }

        function attemptCloseModal() {
            if (formHasData()) {
                const confirmed = window.confirm(
                    "Are you sure you want to close this window? Your inputted data will be lost."
                );
                if (!confirmed) return false; // stay open, data untouched
            }
            form.reset();
            clearAllErrors();
            clearFormMessage();
            if (createAdminModal) createAdminModal.style.display = "none";
            return true;
        }

        // Exposed globally so admin-script.js's existing close-button and
        // outside-click handlers can reuse this EXACT logic instead of a
        // second, divergent copy of the "unsaved changes" check.
        window.cobraByteAttemptCloseCreateAdminModal = attemptCloseModal;
    });
})();