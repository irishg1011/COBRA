/* ==========================================================================
   AUTH VALIDATORS & FORMATTERS MODULE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // --- DYNAMIC INPUT FORMATTING & STRICT CHARACTER VALIDATION ---
    document.addEventListener('input', (e) => {
        const input = e.target;
        if (!input || input.tagName !== 'INPUT') return;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        let val = input.value;

        // 1. First Name & Last Name -> Letters and Spaces ONLY, Title Case
        if (input.id === 'firstName' || input.id === 'lastName') {
            val = val.replace(/[^a-zA-Z\s]/g, '');
            if (val.length > 0) {
                val = val.replace(/\b\w/g, char => char.toUpperCase());
            }
            input.value = val;
            if (start !== null && end !== null) input.setSelectionRange(start, end);
        }

        // 2. Username Fields -> ALL LOWERCASE, Letters, Numbers, @, and _ ONLY
        if (input.id === 'username' || input.id === 'regUsername') {
            val = val.toLowerCase().replace(/[^a-z0-9@_]/g, '');
            input.value = val;
            if (start !== null && end !== null) input.setSelectionRange(start, end);
        }

        // 3. Email Fields -> ALL LOWERCASE, Letters, Numbers, @, ., -, _ ONLY
        if (input.id === 'email' || input.id === 'forgotEmail') {
            val = val.toLowerCase().replace(/[^a-z0-9@._-]/g, '');
            input.value = val;
            if (start !== null && end !== null) input.setSelectionRange(start, end);
        }
    });

    // --- PASSWORD STRENGTH VALIDATOR HELPER ---
    window.setupPasswordValidator = function(passwordInputId, checkerBoxId, prefix = "") {
        const pwdInput = document.getElementById(passwordInputId);
        const checkerBox = document.getElementById(checkerBoxId);
        if (!pwdInput || !checkerBox) return;

        const pfx = prefix ? `${prefix}-` : '';
        const reqLength = document.getElementById(`${pfx}req-length`);
        const reqUpper = document.getElementById(`${pfx}req-upper`);
        const reqLower = document.getElementById(`${pfx}req-lower`);
        const reqNumber = document.getElementById(`${pfx}req-number`);
        const reqSpecial = document.getElementById(`${pfx}req-special`);

        const updateValidationUI = (val) => {
            const hasLength = val.length >= 8;
            const hasUpper = /[A-Z]/.test(val);
            const hasLower = /[a-z]/.test(val);
            const hasNumber = /[0-9]/.test(val);
            const hasSpecial = /[!@#$%^&*()_,.?":{}|<>]/.test(val);

            if (reqLength) {
                reqLength.textContent = (hasLength ? '✓' : '✗') + ' Requires at least 8 characters';
                reqLength.style.color = hasLength ? '#0e9f6e' : '#e02424';
            }
            if (reqUpper) {
                reqUpper.textContent = (hasUpper ? '✓' : '✗') + ' Requires an uppercase letter (A-Z)';
                reqUpper.style.color = hasUpper ? '#0e9f6e' : '#e02424';
            }
            if (reqLower) {
                reqLower.textContent = (hasLower ? '✓' : '✗') + ' Requires a lowercase letter (a-z)';
                reqLower.style.color = hasLower ? '#0e9f6e' : '#e02424';
            }
            if (reqNumber) {
                reqNumber.textContent = (hasNumber ? '✓' : '✗') + ' Requires a number (0-9)';
                reqNumber.style.color = hasNumber ? '#0e9f6e' : '#e02424';
            }
            if (reqSpecial) {
                reqSpecial.textContent = (hasSpecial ? '✓' : '✗') + ' Requires a special character (!@#$%^&*_)';
                reqSpecial.style.color = hasSpecial ? '#0e9f6e' : '#e02424';
            }
        };

        pwdInput.addEventListener('focus', () => {
            checkerBox.style.display = 'block';
            updateValidationUI(pwdInput.value);
        });

        pwdInput.addEventListener('input', () => {
            checkerBox.style.display = 'block';
            updateValidationUI(pwdInput.value);
        });

        pwdInput.addEventListener('blur', () => {
            checkerBox.style.display = 'none';
        });
    };

    setupPasswordValidator('createPassword', 'createPassword-checker', '');
    setupPasswordValidator('forgotNewPassword', 'forgotNewPassword-checker', 'forgot');

    // --- REAL-TIME PASSWORD MATCH INDICATOR HELPER ---
    window.setupPasswordMatchIndicator = function(passwordInputId, confirmInputId, indicatorId) {
        const pwdInput = document.getElementById(passwordInputId);
        const confirmInput = document.getElementById(confirmInputId);
        const indicator = document.getElementById(indicatorId);
        if (!pwdInput || !confirmInput || !indicator) return;

        const updateMatchUI = () => {
            if (typeof clearInlineError === 'function') {
                clearInlineError(confirmInput.closest('.password-wrapper'));
                clearInlineError(pwdInput.closest('.password-wrapper'));
            }

            const pwdVal = pwdInput.value;
            const confirmVal = confirmInput.value;

            if (!confirmVal) {
                indicator.style.display = 'none';
                return;
            }

            indicator.style.display = 'block';
            if (pwdVal === confirmVal) {
                indicator.textContent = '✓ Passwords match';
                indicator.style.color = '#0e9f6e';
            } else {
                indicator.textContent = '✗ Passwords do not match';
                indicator.style.color = '#e02424';
            }
        };

        confirmInput.addEventListener('focus', updateMatchUI);
        confirmInput.addEventListener('input', updateMatchUI);
        pwdInput.addEventListener('input', () => {
            if (confirmInput.value) updateMatchUI();
        });
    };

    setupPasswordMatchIndicator('createPassword', 'confirmPassword', 'confirmPassword-match');
    setupPasswordMatchIndicator('forgotNewPassword', 'forgotConfirmPassword', 'forgotConfirmPassword-match');

});