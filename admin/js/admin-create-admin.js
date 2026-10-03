/**
 * admin-create-admin.js - CobraByte Admin: Create Administrator / Create Mentor
 * ---------------------------------------------------------------------
 * feat/mentor-role: ONE script for both staff-account modals. Every
 * .js-create-account-modal on the page (admin-create-account-modal.html,
 * included by admin-create-admin-modal.html and
 * admin-create-mentor-modal.html) is wired by initCreateAccountModal().
 * The account type comes from the modal itself:
 *     data-account-type   "admin" | "mentor"  -> /admin/accounts/next-id?type=...
 *     data-account-label  "Administrator" | "Mentor" (messages)
 *     form action         /admin/create-administrator | /admin/create-mentor
 * and each modal is opened by the button whose data-open-modal names it
 * (#openCreateAdminBtn / #openCreateMentorBtn).
 *
 * Wires up the modal to the backend's validation + account-creation endpoints
 * (admin_routes.py: _create_staff_account, check_account_field_availability),
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

    // NEW: Admin accounts require an older minimum age than Learner
    // sign-up (which allows 13-60). Kept in sync with
    // validators.py's ADMIN_MIN_SIGNUP_AGE / ADMIN_MAX_SIGNUP_AGE.
    const ADMIN_MIN_SIGNUP_AGE = 20;
    const ADMIN_MAX_SIGNUP_AGE = 60;

    // ------------------------------------------------------------
    // Shared #confirmActionModal (confirm-action-modal.html) - used for
    // the "discard what you typed?" question instead of window.confirm().
    // Other scripts on the page (admin-account-actions.js) also listen on
    // this modal's buttons; this one only reacts while its own question
    // is open (pendingDiscard).
    // ------------------------------------------------------------
    let pendingDiscard = null;

    function askDiscard(onDiscard) {
        const modal = document.getElementById("confirmActionModal");
        if (!modal) { onDiscard(); return; }
        const okBtn = document.getElementById("confirmActionConfirmBtn");
        const cancelBtn = document.getElementById("confirmActionCancelBtn");
        const icon = modal.querySelector(".modal-confirm-icon");
        document.getElementById("confirmActionTitle").textContent = "Discard this form?";
        document.getElementById("confirmActionText").textContent =
            "Are you sure you want to close this window? Your inputted data will be lost.";
        if (okBtn) {
            okBtn.textContent = "Discard";
            okBtn.classList.add("modal-btn-danger");
            okBtn.classList.remove("modal-btn-save");
        }
        if (icon) {
            icon.classList.add("modal-confirm-icon-danger");
            icon.classList.remove("modal-confirm-icon-info");
        }
        pendingDiscard = onDiscard;
        modal.classList.remove("modal-hidden");
        if (cancelBtn) cancelBtn.focus();
    }

    function settleDiscard(discard) {
        if (!pendingDiscard) return;
        const modal = document.getElementById("confirmActionModal");
        if (modal) modal.classList.add("modal-hidden");
        const action = pendingDiscard;
        pendingDiscard = null;
        if (discard) action();
    }

    function wireDiscardModal() {
        const modal = document.getElementById("confirmActionModal");
        if (!modal) return;
        const okBtn = document.getElementById("confirmActionConfirmBtn");
        const cancelBtn = document.getElementById("confirmActionCancelBtn");
        if (okBtn) okBtn.addEventListener("click", () => settleDiscard(true));
        if (cancelBtn) cancelBtn.addEventListener("click", () => settleDiscard(false));
        modal.addEventListener("click", (e) => { if (e.target === modal) settleDiscard(false); });
    }

    document.addEventListener("DOMContentLoaded", () => {
        const modals = document.querySelectorAll(".js-create-account-modal");
        if (!modals.length) return; // no create-account modal on this page
        wireDiscardModal();
        modals.forEach(initCreateAccountModal);
    });

    function initCreateAccountModal(createAdminModal) {
        const form = createAdminModal.querySelector(".js-create-account-form");
        if (!form) return;

        const accountType = createAdminModal.dataset.accountType || "admin";
        const accountLabel = createAdminModal.dataset.accountLabel || "Administrator";
        const idPrefix = createAdminModal.dataset.idPrefix || "admin";
        const field = (name) => document.getElementById(`${idPrefix}_${name}`);

        const fields = {
            username: field("username"),
            password: field("password"),
            confirmPassword: field("confirm_password"),
            email: field("email"),
            mobile: field("mobile"),
            firstName: field("firstname"),
            lastName: field("lastname"),
            gender: field("gender"),
            birthdate: field("birthdate"),
        };

        const submitBtn = form.querySelector('button[type="submit"]');
        const modalHeaderSection = createAdminModal.querySelector(".modal-header-section");

        // ------------------------------------------------------------
        // Eye toggle for Password / Confirm Password - same behavior as
        // the Learner Sign Up form (script.js), scoped to this modal's
        // form. feat/mentor-role: the icon is a Font Awesome <i> (no
        // inline SVG) - fa-eye while hidden, fa-eye-slash while shown.
        // ------------------------------------------------------------
        form.addEventListener("click", (event) => {
            const toggleBtn = event.target.closest(".toggle-password-visibility");
            if (!toggleBtn) return;
            event.preventDefault();
            const passwordInput = toggleBtn.parentElement.querySelector("input");
            if (!passwordInput) return;
            const isPassword = passwordInput.getAttribute("type") === "password";
            passwordInput.setAttribute("type", isPassword ? "text" : "password");
            const icon = toggleBtn.querySelector(".eye-icon");
            if (icon) {
                icon.classList.toggle("fa-eye", !isPassword);
                icon.classList.toggle("fa-eye-slash", isPassword);
            }
        });

        // ------------------------------------------------------------
        // Live "next Account ID" preview - replaces the static
        // "Auto-generated on submit" placeholder with what the real ID
        // will actually look like (e.g. "AD2608060004"), fetched from
        // admin_routes.py's read-only /admin/accounts/next-id endpoint.
        // Purely cosmetic: the real ID is still only ever generated
        // server-side, inside create_administrator()'s own transaction.
        // ------------------------------------------------------------
        const accIdPreviewInput = field("acc_id");
        const ACC_ID_PLACEHOLDER = "Auto-generated on submit";

        async function loadNextAdminId() {
            if (!accIdPreviewInput) return;
            accIdPreviewInput.value = "Loading...";
            try {
                const response = await fetch(`/admin/accounts/next-id?type=${encodeURIComponent(accountType)}`, { credentials: "include" });
                const result = await response.json();
                accIdPreviewInput.value = result.success ? result.next_id : ACC_ID_PLACEHOLDER;
            } catch (err) {
                accIdPreviewInput.value = ACC_ID_PLACEHOLDER;
            }
        }


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
                banner.className = "js-form-banner-message"; // styled in admin-style.css
                modalHeaderSection.appendChild(banner);
            }
            banner.textContent = message;
            banner.classList.toggle("is-success", !isError);
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
                errorEl.className = "js-error-message"; // styled in admin-style.css
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
        // NEW standard: first letter of each word UPPERCASE, every
        // other letter forced to lowercase (e.g. "gOLD" -> "Gold"),
        // instead of only ever upper-casing without touching the rest.
        // ------------------------------------------------------------
        [fields.firstName, fields.lastName].forEach((input) => {
            if (!input) return;
            input.addEventListener("input", () => {
                const start = input.selectionStart, end = input.selectionEnd;
                let val = input.value.replace(/[^a-zA-Z\s]/g, "");
                if (val.length > 0) {
                    val = val.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
                }
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
        // NEW: Admin birthdate age rule - 20+ and 60 or younger.
        // Different range than Learner Sign Up (13-60, see script.js's
        // MIN_SIGNUP_AGE/MAX_SIGNUP_AGE), kept in sync with
        // ADMIN_MIN_SIGNUP_AGE/ADMIN_MAX_SIGNUP_AGE at the top of this
        // file and validators.py's ADMIN_MIN_SIGNUP_AGE/ADMIN_MAX_SIGNUP_AGE
        // on the server side.
        // ------------------------------------------------------------
        function calculateAge(birthdateStr) {
            if (!birthdateStr) return null;
            const birthDate = new Date(birthdateStr + "T00:00:00");
            if (isNaN(birthDate.getTime())) return null;

            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const hasHadBirthdayThisYear =
                (today.getMonth() > birthDate.getMonth()) ||
                (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
            if (!hasHadBirthdayThisYear) age--;
            return age;
        }

        function setAdminBirthdateBounds() {
            if (!fields.birthdate) return;
            const today = new Date();
            const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            // max = the latest birthdate that is still >= ADMIN_MIN_SIGNUP_AGE years old today
            const maxDate = new Date(today.getFullYear() - ADMIN_MIN_SIGNUP_AGE, today.getMonth(), today.getDate());
            // min = the earliest birthdate that is still <= ADMIN_MAX_SIGNUP_AGE years old today
            const minDate = new Date(today.getFullYear() - ADMIN_MAX_SIGNUP_AGE, today.getMonth(), today.getDate());
            fields.birthdate.setAttribute("max", fmt(maxDate));
            fields.birthdate.setAttribute("min", fmt(minDate));
        }
        setAdminBirthdateBounds();

        function checkAdminBirthdateAge() {
            if (!fields.birthdate || !fields.birthdate.value) { clearFieldError(fields.birthdate); return false; }
            const age = calculateAge(fields.birthdate.value);
            if (age === null) {
                showFieldError(fields.birthdate, "Please enter a valid birthdate.");
                return false;
            }
            if (age < ADMIN_MIN_SIGNUP_AGE) {
                showFieldError(fields.birthdate, `${accountLabel} must be at least ${ADMIN_MIN_SIGNUP_AGE} years old.`);
                return false;
            }
            if (age > ADMIN_MAX_SIGNUP_AGE) {
                showFieldError(fields.birthdate, `${accountLabel} must be ${ADMIN_MAX_SIGNUP_AGE} years old or younger.`);
                return false;
            }
            clearFieldError(fields.birthdate);
            return true;
        }

        if (fields.birthdate) fields.birthdate.addEventListener("change", checkAdminBirthdateAge);

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

            // NEW: Admin age rule (20-60) - only checked when a birthdate
            // was actually provided, so the "required" message above stays
            // the one shown for a blank field.
            if (fields.birthdate && fields.birthdate.value && !checkAdminBirthdateAge()) {
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
                    showFormMessage(result.message || `${accountLabel} account created successfully.`, false);
                    // Task: "Clear the form only after the account has been successfully saved"
                    setTimeout(() => {
                        form.reset();
                        clearAllErrors();
                        clearFormMessage();
                        hideModal();
                        // Account & Security: show the new account without a reload.
                        if (window.CobraAccountsTable) window.CobraAccountsTable.refresh();
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

        function hideModal() {
            createAdminModal.classList.add("modal-hidden");
        }

        function discardAndClose() {
            form.reset();
            clearAllErrors();
            clearFormMessage();
            hideModal();
        }

        // Filled-in form -> ask first in the shared confirm modal (never
        // window.confirm()); an empty form just closes.
        function attemptCloseModal() {
            if (formHasData()) askDiscard(discardAndClose);
            else discardAndClose();
        }

        // ------------------------------------------------------------
        // Open / close (moved here from admin-script.js so both modals
        // share it): the open button names its modal in data-open-modal.
        // ------------------------------------------------------------
        document.querySelectorAll(`[data-open-modal="${createAdminModal.id}"]`).forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                createAdminModal.classList.remove("modal-hidden");
                // Fresh "next Account ID" preview (AD... / MT...) on every open.
                loadNextAdminId();
            });
        });

        const closeBtn = createAdminModal.querySelector(".modal-close-btn");
        if (closeBtn) closeBtn.addEventListener("click", attemptCloseModal);

        // Close when clicking outside the modal card
        createAdminModal.addEventListener("click", (e) => {
            if (e.target === createAdminModal) attemptCloseModal();
        });
    }
})();