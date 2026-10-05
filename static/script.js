document.addEventListener('DOMContentLoaded', () => {
    // If the user is already logged in, skip the login page and go
    // directly to their dashboard.
    //
    // NOTE (loop fix): Admin auth now lives in a real server-side session
    // (see admin_routes.py's before_request guard), not just this
    // sessionStorage flag. If that flag says "Admin" but the actual server
    // session cookie is missing/expired, blindly redirecting to
    // /admin/dashboard just bounces straight back here (the backend
    // redirects unauthenticated admin requests back to this page), which
    // then bounces back to /admin/dashboard again - an infinite loop.
    // So for Admin, treat a stale flag as untrustworthy and clear it
    // instead of redirecting; the user simply sees the login form again.
    // Learner access is still governed entirely client-side, so that
    // shortcut remains unchanged and safe.
    const storedRole = sessionStorage.getItem("userRole");
    const isAuthenticatedFlag = sessionStorage.getItem("isAuthenticated") === "true";

    if (isAuthenticatedFlag && storedRole === "Admin") {
        sessionStorage.removeItem("isAuthenticated");
        sessionStorage.removeItem("userRole");
    } else if (isAuthenticatedFlag) {
        window.location.replace("/dashboard");
    }

    // feat/admin-login-page: same-origin (relative) URLs. The page and the
    // API are both served by Flask, so this works on 127.0.0.1:5000 and
    // localhost:5000 alike, and the session cookie is always sent.
    const API_BASE_URL = "";

    // Stop every auth form from doing a real page submit. Replaces the
    // inline onsubmit="event.preventDefault();" that used to sit on each
    // <form> in login.html. Buttons keep their own click handlers below.
    document.querySelectorAll('.auth-form').forEach((form) => {
        form.addEventListener('submit', (e) => e.preventDefault());
    });

    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        fetch('/header.html')
            .then(response => response.text())
            .then(data => { headerPlaceholder.innerHTML = data; })
            .catch(error => console.error('Error loading header:', error));
    }

    const openEyePath = `<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />`;
    const closedEyePath = `<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 1-4.243-4.243m4.242 4.242L9.88 9.88" />`;

    document.addEventListener('click', (event) => {
        const toggleBtn = event.target.closest('.toggle-password-visibility');
        if (toggleBtn) {
            event.preventDefault();
            const passwordInput = toggleBtn.parentElement.querySelector('input');
            if (passwordInput) {
                const isPassword = passwordInput.getAttribute('type') === 'password';
                passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
                const svgElement = toggleBtn.querySelector('svg');
                if (svgElement) svgElement.innerHTML = isPassword ? closedEyePath : openEyePath;
            }
        }
    });

    // =========================================================================
    // --- TASK 12 & 15: DYNAMIC INPUT FORMATTING & STRICT CHARACTER VALIDATION ---
    // =========================================================================
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

    // --- OTP MASKING & CHECKBOX BINDING ---
    const configureOtpInputs = (containerSelector, checkboxId) => {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        const inputs = container.querySelectorAll('.otp-input');
        const checkbox = document.getElementById(checkboxId);

        if (checkbox) {
            checkbox.addEventListener('change', () => {
                const targetType = checkbox.checked ? 'text' : 'password';
                inputs.forEach(inp => inp.setAttribute('type', targetType));
            });
        }

        inputs.forEach(input => {
            input.setAttribute('type', 'password');
            input.setAttribute('placeholder', 'X');

            input.addEventListener('input', () => {
                input.classList.remove('otp-input--correct', 'otp-input--wrong');
            });
        });
    };

    configureOtpInputs('#signUpStep3Panel', 'showSignUpOtp');
    configureOtpInputs('#forgotOtpPanel', 'showForgotOtp');
    configureOtpInputs('#forgotUsernameOtpPanel', 'showForgotUsernameOtp');   // feat/forgot-username

    window.setOtpBoxesState = function(containerSelector, isCorrect, shouldClear = false) {
        const inputs = document.querySelectorAll(`${containerSelector} .otp-input`);
        inputs.forEach(input => {
            input.classList.toggle('otp-input--correct', isCorrect);
            input.classList.toggle('otp-input--wrong', !isCorrect);
            if (!isCorrect) {
                if (shouldClear) {
                    input.value = '';
                }
            }
        });
        if (shouldClear && inputs.length > 0) {
            inputs[0].focus();
        }
    };

    function validateRequiredFields(fields) {
        for (const field of fields) {
            if (!field) continue;
            if (!field.value || field.value.trim() === '') {
                field.setCustomValidity('Please fill out this field.');
                field.reportValidity();
                field.focus();
                const clearValidity = () => {
                    field.setCustomValidity('');
                    field.removeEventListener('input', clearValidity);
                };
                field.addEventListener('input', clearValidity);
                return false;
            }
        }
        return true;
    }

    function validateOtpComplete(containerSelector) {
        const inputs = document.querySelectorAll(`${containerSelector} .otp-input`);
        const complete = [...inputs].every(input => input.value.trim() !== '');
        if (!complete) {
            alert('Please enter the complete 6-digit code.');
            setOtpBoxesState(containerSelector, false, false);
        }
        return complete;
    }

    function clearOtpInputs(containerSelector, checkboxId) {
        const inputs = document.querySelectorAll(`${containerSelector} .otp-input`);
        inputs.forEach(input => {
            input.value = '';
            input.classList.remove('otp-input--correct', 'otp-input--wrong');
            input.setAttribute('type', 'password');
        });
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) checkbox.checked = false;
        if (inputs.length > 0) inputs[0].focus();
    }

    function showInlineError(afterEl, message) {
        if (!afterEl) { alert(message); return; }
        let errorEl = afterEl.parentElement.querySelector('.js-error-message');
        if (!errorEl) {
            errorEl = document.createElement('p');
            errorEl.className = 'js-error-message';
            afterEl.insertAdjacentElement('afterend', errorEl);
        }
        errorEl.textContent = message;

        // feat/login-animations: calm red outline on the field (no shaking).
        // Cleared by clearInlineError() or as soon as the user types again.
        const field = getErrorField(afterEl);
        if (field && !field.classList.contains('auth-input-error')) {
            field.classList.add('auth-input-error');
            field.addEventListener('input', () => field.classList.remove('auth-input-error'), { once: true });
        }
    }

    // The input an error belongs to: afterEl is either the input itself
    // or a .password-wrapper that contains it.
    function getErrorField(afterEl) {
        if (!afterEl) return null;
        if (afterEl.matches('input, select')) return afterEl;
        return afterEl.querySelector('input');
    }

    function clearInlineError(afterEl) {
        if (!afterEl) return;
        const errorEl = afterEl.parentElement.querySelector('.js-error-message');
        if (errorEl) errorEl.remove();
        // A "Sign up" hint (see showSignUpHint) always belongs to an error,
        // so it goes away whenever that error is cleared.
        const hintEl = afterEl.parentElement.querySelector('.auth-signup-hint');
        if (hintEl) hintEl.remove();
        const field = getErrorField(afterEl);
        if (field) field.classList.remove('auth-input-error');
    }

    // =========================================================================
    // --- feat/login-signup-redirect: "SIGN UP" HINT UNDER AN ERROR ---
    // =========================================================================
    // Adds a line like "No account yet? Sign up" right under the red
    // message showInlineError() just placed after `afterEl`. Built with
    // textContent (never innerHTML) so nothing typed by the user can inject
    // markup. Removed automatically by clearInlineError().
    function showSignUpHint(afterEl, leadText, linkText, prefillEmail = '') {
        if (!afterEl) return;
        const errorEl = afterEl.parentElement.querySelector('.js-error-message');
        if (!errorEl) return;

        let hintEl = afterEl.parentElement.querySelector('.auth-signup-hint');
        if (hintEl) hintEl.remove();

        hintEl = document.createElement('p');
        hintEl.className = 'auth-signup-hint';
        hintEl.append(`${leadText} `);

        const link = document.createElement('a');
        link.href = '#';
        link.className = 'auth-inline-link';
        link.textContent = linkText;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            goToSignUp(prefillEmail);
        });

        hintEl.appendChild(link);
        errorEl.insertAdjacentElement('afterend', hintEl);
    }


    // Opens Sign Up (step 1) on purpose, so no "switch views?" confirm.
    // showSignUpView() clears the sign-up form first, so the email is
    // filled in AFTER it runs - it's waiting in step 2's Email field.
    function goToSignUp(prefillEmail = '') {
        showSignUpView();
        if (prefillEmail && emailInput) emailInput.value = prefillEmail;
    }

    function setButtonLoading(button, loadingText = "Processing...") {
        if (!button) return;
        if (!button.dataset.originalHtml) {
            button.dataset.originalHtml = button.innerHTML;
        }
        button.disabled = true;
        button.classList.add('btn-loading');
        button.innerHTML = `<span class="btn-spinner"></span><span>${loadingText}</span>`;
    }

    function resetButtonLoading(button) {
        if (!button) return;
        button.disabled = false;
        button.classList.remove('btn-loading');
        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
        }
    }

    // --- PASSWORD STRENGTH VALIDATOR HELPER ---
    function setupPasswordValidator(passwordInputId, checkerBoxId, prefix = "") {
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
                reqLength.classList.toggle('password-req--met', hasLength);
            }
            if (reqUpper) {
                reqUpper.textContent = (hasUpper ? '✓' : '✗') + ' Requires an uppercase letter (A-Z)';
                reqUpper.classList.toggle('password-req--met', hasUpper);
            }
            if (reqLower) {
                reqLower.textContent = (hasLower ? '✓' : '✗') + ' Requires a lowercase letter (a-z)';
                reqLower.classList.toggle('password-req--met', hasLower);
            }
            if (reqNumber) {
                reqNumber.textContent = (hasNumber ? '✓' : '✗') + ' Requires a number (0-9)';
                reqNumber.classList.toggle('password-req--met', hasNumber);
            }
            if (reqSpecial) {
                reqSpecial.textContent = (hasSpecial ? '✓' : '✗') + ' Requires a special character (!@#$%^&*_)';
                reqSpecial.classList.toggle('password-req--met', hasSpecial);
            }
        };

        pwdInput.addEventListener('focus', () => {
            checkerBox.classList.remove('auth-hidden');
            updateValidationUI(pwdInput.value);
        });

        pwdInput.addEventListener('input', () => {
            checkerBox.classList.remove('auth-hidden');
            updateValidationUI(pwdInput.value);
        });

        pwdInput.addEventListener('blur', () => {
            checkerBox.classList.add('auth-hidden');
        });
    }

    setupPasswordValidator('createPassword', 'createPassword-checker', '');
    setupPasswordValidator('forgotNewPassword', 'forgotNewPassword-checker', 'forgot');

    // --- REAL-TIME PASSWORD MATCH INDICATOR HELPER ---
    function setupPasswordMatchIndicator(passwordInputId, confirmInputId, indicatorId) {
        const pwdInput = document.getElementById(passwordInputId);
        const confirmInput = document.getElementById(confirmInputId);
        const indicator = document.getElementById(indicatorId);
        if (!pwdInput || !confirmInput || !indicator) return;

        const updateMatchUI = () => {
            clearInlineError(confirmInput.closest('.password-wrapper'));
            clearInlineError(pwdInput.closest('.password-wrapper'));

            const pwdVal = pwdInput.value;
            const confirmVal = confirmInput.value;

            if (!confirmVal) {
                indicator.classList.add('auth-hidden');
                return;
            }

            indicator.classList.remove('auth-hidden');
            const isMatch = pwdVal === confirmVal;
            indicator.textContent = isMatch ? '✓ Passwords match' : '✗ Passwords do not match';
            indicator.classList.toggle('password-match--ok', isMatch);
            indicator.classList.toggle('password-match--bad', !isMatch);
        };

        confirmInput.addEventListener('focus', updateMatchUI);
        confirmInput.addEventListener('input', updateMatchUI);
        pwdInput.addEventListener('input', () => {
            if (confirmInput.value) updateMatchUI();
        });
    }

    setupPasswordMatchIndicator('createPassword', 'confirmPassword', 'confirmPassword-match');
    setupPasswordMatchIndicator('forgotNewPassword', 'forgotConfirmPassword', 'forgotConfirmPassword-match');

    // --- COUNTDOWN TIMERS ---
    let signUpOtpExpired = false;
    let forgotOtpExpired = false;
    let forgotUsernameOtpExpired = false;   // feat/forgot-username

    // isSignUp: true = sign-up code, false = forgot-password code,
    // 'username' = forgot-username code (feat/forgot-username).
    function startOtpCountdown(timerDisplayEl, resendLinkEl, isSignUp = true) {
        if (!timerDisplayEl) return;

        if (timerDisplayEl.intervalId) clearInterval(timerDisplayEl.intervalId);

        let timeLeft = 300;
        if (isSignUp === 'username') forgotUsernameOtpExpired = false;
        else if (isSignUp) signUpOtpExpired = false;
        else forgotOtpExpired = false;

        if (resendLinkEl) resendLinkEl.classList.add('resend-link--disabled');

        timerDisplayEl.intervalId = setInterval(() => {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;

            timerDisplayEl.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

            if (timeLeft <= 0) {
                clearInterval(timerDisplayEl.intervalId);
                if (isSignUp === 'username') forgotUsernameOtpExpired = true;
                else if (isSignUp) signUpOtpExpired = true;
                else forgotOtpExpired = true;

                if (resendLinkEl) resendLinkEl.classList.remove('resend-link--disabled');
            } else {
                timeLeft--;
            }
        }, 1000);
    }

    // --- PANEL NAVIGATION STATE ---
    const authToggleBar = document.querySelector('.auth-toggle');
    const signInBtn = document.getElementById('switchToSignIn');
    const signUpBtn = document.getElementById('switchToSignUp');

    const signInPanel = document.getElementById('signInPanel');
    const signUpPanel = document.getElementById('signUpPanel');
    const signUpStep2Panel = document.getElementById('signUpStep2Panel');
    const signUpStep3Panel = document.getElementById('signUpStep3Panel');
    const signUpStep4Panel = document.getElementById('signUpStep4Panel');

    const forgotPasswordPanel = document.getElementById('forgotPasswordPanel');
    const forgotOtpPanel = document.getElementById('forgotOtpPanel');
    const setNewPasswordPanel = document.getElementById('setNewPasswordPanel');
    const forgotSuccessPanel = document.getElementById('forgotSuccessPanel');

    // feat/forgot-username: the three "Forgot your username?" screens
    const forgotUsernamePanel = document.getElementById('forgotUsernamePanel');
    const forgotUsernameOtpPanel = document.getElementById('forgotUsernameOtpPanel');
    const forgotUsernameSuccessPanel = document.getElementById('forgotUsernameSuccessPanel');

    const goToStep2 = document.getElementById('goToStep2');
    const proceedToStep3 = document.querySelector('#signUpStep2Panel .btn-next');
    const verifyAndFinish = document.getElementById('btnFinish');
    const backToSignIn = document.getElementById('btnBackToSignIn');
    const backToStep1 = document.getElementById('backToStep1');
    const backToStep2 = document.getElementById('backToStep2');

    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const birthdateInput = document.getElementById('birthdate');
    const genderSelect = document.getElementById('gender');

    const emailInput = document.getElementById('email');
    const regUsernameInput = document.getElementById('regUsername');
    const createPasswordInput = document.getElementById('createPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // =========================================================================
    // --- feat/terms-consent: SIGN-UP CONSENT CHECKBOXES (step 2) ---
    // =========================================================================
    // "I agree to the Terms and Privacy Notice" is always required. Under 18
    // (from the birthdate typed on step 1) a second box is shown and
    // required too. The server checks both again on /signup.
    const ADULT_AGE = 18;
    const agreeTermsInput = document.getElementById('agreeTerms');
    const guardianRow = document.getElementById('guardianConsentRow');
    const guardianAgreesInput = document.getElementById('guardianAgrees');
    const consentError = document.getElementById('consentError');

    function signUpIsMinor() {
        const age = calculateAge(birthdateInput ? birthdateInput.value : '');
        return age !== null && age < ADULT_AGE;
    }

    function refreshGuardianRow() {
        if (!guardianRow) return;
        const minor = signUpIsMinor();
        guardianRow.hidden = !minor;
        if (!minor && guardianAgreesInput) guardianAgreesInput.checked = false;
    }

    function clearConsentError() {
        if (!consentError) return;
        consentError.textContent = '';
        consentError.hidden = true;
    }

    // true when the needed boxes are ticked; otherwise shows why under them
    function checkSignUpConsent() {
        refreshGuardianRow();
        let message = '';
        if (!agreeTermsInput || !agreeTermsInput.checked) {
            message = 'Please agree to the Terms and Conditions and the Privacy Notice to continue.';
        } else if (signUpIsMinor() && (!guardianAgreesInput || !guardianAgreesInput.checked)) {
            message = 'Please confirm that your parent or guardian agrees.';
        }
        if (!message) {
            clearConsentError();
            return true;
        }
        if (consentError) {
            consentError.textContent = message;
            consentError.hidden = false;
        }
        return false;
    }

    if (birthdateInput) birthdateInput.addEventListener('change', refreshGuardianRow);
    [agreeTermsInput, guardianAgreesInput].forEach((box) => {
        if (box) box.addEventListener('change', clearConsentError);
    });
    // resetSignUpForm() resets this form, which also unticks the boxes
    const signUpStep2Form = document.querySelector('#signUpStep2Panel form');
    if (signUpStep2Form) {
        signUpStep2Form.addEventListener('reset', () => {
            clearConsentError();
            if (guardianRow) guardianRow.hidden = true;
        });
    }

    // =========================================================================
    // --- FEATURE 1: MINIMUM AGE (13+) RESTRICTION FOR SIGN UP ---
    // =========================================================================
    const MIN_SIGNUP_AGE = 13;
    const MAX_SIGNUP_AGE = 60;

    function calculateAge(birthdateStr) {
        if (!birthdateStr) return null;
        const birthDate = new Date(birthdateStr + 'T00:00:00');
        if (isNaN(birthDate.getTime())) return null;

        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const hasHadBirthdayThisYear =
            (today.getMonth() > birthDate.getMonth()) ||
            (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
        if (!hasHadBirthdayThisYear) age--;
        return age;
    }

    function setBirthdateBounds() {
        if (!birthdateInput) return;
        const today = new Date();
        const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        // max = latest birthdate that is still >= MIN_SIGNUP_AGE (13) years old today
        const maxDate = new Date(today.getFullYear() - MIN_SIGNUP_AGE, today.getMonth(), today.getDate());
        // min = earliest birthdate that is still <= MAX_SIGNUP_AGE (60) years old today
        const minDate = new Date(today.getFullYear() - MAX_SIGNUP_AGE, today.getMonth(), today.getDate());
        birthdateInput.setAttribute('max', fmt(maxDate));
        birthdateInput.setAttribute('min', fmt(minDate));
    }

    setBirthdateBounds();

    // =========================================================================
    // --- FEATURE 2: LOAD GENDER OPTIONS FROM MySQL (gender_tbl) ---
    // =========================================================================
    async function loadGenderOptions() {
        if (!genderSelect) return;

        try {
            const response = await fetch(`${API_BASE_URL}/genders`);
            if (!response.ok) throw new Error('Request failed');
            const genders = await response.json();

            if (!Array.isArray(genders)) throw new Error('Unexpected response');

            genders.forEach(g => {
                const option = document.createElement('option');
                option.value = g.gender;
                option.textContent = g.gender;
                genderSelect.appendChild(option);
            });
        } catch (err) {
            console.error('Error loading gender list:', err);
            genderSelect.disabled = true;
            alert('Unable to load gender list.');
        }
    }

    loadGenderOptions();

    // --- TASK 10: UNIVERSAL UNSAVED CHANGES CHECK ---
    function activePanelHasInputs() {
        const allPanels = document.querySelectorAll(
            '#signInPanel, #signUpPanel, #signUpStep2Panel, #signUpStep3Panel, #forgotPasswordPanel, #forgotOtpPanel, #setNewPasswordPanel, #forgotUsernamePanel, #forgotUsernameOtpPanel'
        );

        for (const panel of allPanels) {
            if (panel && panel.style.display !== 'none' && getComputedStyle(panel).display !== 'none') {
                const inputs = panel.querySelectorAll('input:not([type="checkbox"]):not([type="hidden"]), select');
                for (const input of inputs) {
                    if (input.value && input.value.trim() !== '') {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function confirmViewSwitch() {
        if (activePanelHasInputs()) {
            return confirm("Are you sure you want to switch views? Your inputted data will be lost.");
        }
        return true;
    }

    // =========================================================================
    // --- PANEL ENTRANCE ANIMATION HELPER ---
    // =========================================================================
    // Replaces plain `panel.style.display = 'block'` everywhere a panel is
    // revealed. Re-adding the animation class every call (after forcing a
    // reflow) makes the fade+slide-up animation replay each time, even if
    // the same panel was shown before with the class still attached.
    //
    // feat/login-animations: `direction` picks which side the fields glide
    // in from - 'forward' (default, from the right) or 'back' (from the
    // left, used by Back links and when returning to Sign In). The actual
    // animation lives in animations.css (.panel-animate-in).
    function showPanel(panel, displayValue = 'block', direction = 'forward') {
        if (!panel) return;
        panel.style.display = displayValue;
        panel.classList.remove('panel-animate-in', 'panel-from-left');
        void panel.offsetWidth; // force reflow so the animation retriggers
        panel.classList.add('panel-animate-in');
        if (direction === 'back') panel.classList.add('panel-from-left');
    }

    // feat/login-animations: the gradient Sign In / Sign Up pill stretches
    // while it slides (animations.css .is-stretching). Only when it moves.
    function stretchToggleSlider() {
        if (!toggleSlider) return;
        toggleSlider.classList.remove('is-stretching');
        void toggleSlider.offsetWidth;
        toggleSlider.classList.add('is-stretching');
    }

    function hideAllPanels() {
        const panels = [signInPanel, signUpPanel, signUpStep2Panel, signUpStep3Panel, signUpStep4Panel,
                        forgotPasswordPanel, forgotOtpPanel, setNewPasswordPanel, forgotSuccessPanel,
                        forgotUsernamePanel, forgotUsernameOtpPanel, forgotUsernameSuccessPanel];
        panels.forEach(p => { if (p) p.style.display = 'none'; });
        if (document.getElementById('signInSuccessPanel')) document.getElementById('signInSuccessPanel').style.display = 'none';
    }

        const toggleSlider = document.getElementById('toggleSlider');

    function showSignInView(direction = 'forward') {
        const sliderMoves = !!(toggleSlider && toggleSlider.classList.contains('slide-right'));
        resetSignUpForm();
        resetForgotPasswordForm();
        resetForgotUsernameForm();
        resetSignInForm();
        hideAllPanels();
        if (authToggleBar) authToggleBar.style.display = 'flex';
        if (signInBtn) signInBtn.classList.add('active');
        if (signUpBtn) signUpBtn.classList.remove('active');
        if (toggleSlider) toggleSlider.classList.remove('slide-right');
        if (sliderMoves) stretchToggleSlider();
        showPanel(signInPanel, 'block', direction);
    }

    function showSignUpView() {
        resetSignInForm();
        resetForgotPasswordForm();
        resetForgotUsernameForm();
        resetSignUpForm();
        hideAllPanels();
        if (authToggleBar) authToggleBar.style.display = 'flex';
        if (signInBtn) signInBtn.classList.remove('active');
        if (signUpBtn) signUpBtn.classList.add('active');
        const sliderMoves = !!(toggleSlider && !toggleSlider.classList.contains('slide-right'));
        if (toggleSlider) toggleSlider.classList.add('slide-right');
        if (sliderMoves) stretchToggleSlider();
        showPanel(signUpPanel);
    }
    
    // --- FORM RESET HELPERS (TASK 14) ---
    function resetSignUpForm() {
        const signUpFormStep1 = document.querySelector('#signUpPanel form');
        const signUpFormStep2 = document.querySelector('#signUpStep2Panel form');

        if (signUpFormStep1) signUpFormStep1.reset();
        if (signUpFormStep2) signUpFormStep2.reset();

        document.querySelectorAll('#signUpPanel input, #signUpPanel select, #signUpStep2Panel input, #signUpStep2Panel select').forEach(inp => {
            if (inp.type !== 'checkbox' && inp.type !== 'hidden') inp.value = '';
        });

        clearOtpInputs('#signUpStep3Panel', 'showSignUpOtp');

        if (emailInput) clearInlineError(emailInput);
        if (regUsernameInput) clearInlineError(regUsernameInput);
        if (createPasswordInput && createPasswordInput.closest('.password-wrapper')) {
            clearInlineError(createPasswordInput.closest('.password-wrapper'));
        }
        if (confirmPasswordInput && confirmPasswordInput.closest('.password-wrapper')) {
            clearInlineError(confirmPasswordInput.closest('.password-wrapper'));
        }
        if (birthdateInput) clearInlineError(birthdateInput);

        const createChecker = document.getElementById('createPassword-checker');
        if (createChecker) createChecker.classList.add('auth-hidden');

        const matchIndicator = document.getElementById('confirmPassword-match');
        if (matchIndicator) {
            matchIndicator.classList.add('auth-hidden');
            matchIndicator.textContent = '';
        }
    }

    function resetSignInForm() {
        const signInForm = document.querySelector('#signInPanel form');
        if (signInForm) signInForm.reset();

        document.querySelectorAll('#signInPanel input').forEach(inp => {
            if (inp.type !== 'checkbox' && inp.type !== 'hidden') inp.value = '';
        });

        if (passwordInput && passwordInput.closest('.password-wrapper')) {
            clearInlineError(passwordInput.closest('.password-wrapper'));
        }
    }

    function resetForgotPasswordForm() {
        const forgotForm = document.querySelector('#forgotPasswordPanel form');
        const setNewPwdForm = document.querySelector('#setNewPasswordPanel form');

        if (forgotForm) forgotForm.reset();
        if (setNewPwdForm) setNewPwdForm.reset();

        document.querySelectorAll('#forgotPasswordPanel input, #setNewPasswordPanel input').forEach(inp => {
            if (inp.type !== 'checkbox' && inp.type !== 'hidden') inp.value = '';
        });

        clearOtpInputs('#forgotOtpPanel', 'showForgotOtp');

        const forgotEmailInp = document.getElementById('forgotEmail');
        const forgotNewPwdInp = document.getElementById('forgotNewPassword');
        const forgotConfirmPwdInp = document.getElementById('forgotConfirmPassword');

        if (forgotEmailInp) clearInlineError(forgotEmailInp);
        if (forgotNewPwdInp && forgotNewPwdInp.closest('.password-wrapper')) {
            clearInlineError(forgotNewPwdInp.closest('.password-wrapper'));
        }
        if (forgotConfirmPwdInp && forgotConfirmPwdInp.closest('.password-wrapper')) {
            clearInlineError(forgotConfirmPwdInp.closest('.password-wrapper'));
        }

        const forgotChecker = document.getElementById('forgotNewPassword-checker');
        if (forgotChecker) forgotChecker.classList.add('auth-hidden');

        const forgotMatchIndicator = document.getElementById('forgotConfirmPassword-match');
        if (forgotMatchIndicator) {
            forgotMatchIndicator.classList.add('auth-hidden');
            forgotMatchIndicator.textContent = '';
        }
    }

    // feat/forgot-username: clears the "Forgot your username?" screens.
    function resetForgotUsernameForm() {
        const emailInp = document.getElementById('forgotUsernameEmail');
        if (emailInp) {
            emailInp.value = '';
            clearInlineError(emailInp);
        }
        clearOtpInputs('#forgotUsernameOtpPanel', 'showForgotUsernameOtp');

        const timerEl = document.getElementById('forgotUsernameTimerDisplay');
        if (timerEl && timerEl.intervalId) clearInterval(timerEl.intervalId);

        const shown = document.getElementById('recoveredUsername');
        if (shown) shown.textContent = '';
    }

    window.addEventListener('pageshow', () => {
    const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('tab') === 'signup') {
            showSignUpView();
        } else {
            showSignInView();
        }
    });

    if (signInBtn && signUpBtn) {
        signUpBtn.addEventListener('click', () => {
            if (signInBtn.classList.contains('active') && !confirmViewSwitch()) return;
            showSignUpView();
        });

        signInBtn.addEventListener('click', () => {
            if (signUpBtn.classList.contains('active') && !confirmViewSwitch()) return;
            showSignInView('back');
        });
    }

    if (goToStep2) {
        goToStep2.addEventListener('click', () => {
            if (!validateRequiredFields([firstNameInput, lastNameInput, birthdateInput, genderSelect])) return;

            // --- FEATURE 1: Block proceeding if the user is under 13 ---
            clearInlineError(birthdateInput);
            const age = calculateAge(birthdateInput.value);
            if (age === null || age < MIN_SIGNUP_AGE) {
                showInlineError(birthdateInput, 'You must be at least 13 years old to create an account.');
                birthdateInput.focus();
                return;
            }

            if (age > MAX_SIGNUP_AGE) {
                showInlineError(birthdateInput, 'You must be 60 years old or younger to create an account.');
                birthdateInput.focus();
                return;
            }

            hideAllPanels();
            showPanel(signUpStep2Panel);
        });
    }

    if (backToStep1) backToStep1.addEventListener('click', (e) => { e.preventDefault(); hideAllPanels(); showPanel(signUpPanel, 'block', 'back'); });

    if (proceedToStep3) {
        proceedToStep3.addEventListener('click', async (e) => {
            e.preventDefault();

            clearInlineError(emailInput);
            clearInlineError(regUsernameInput);
            clearInlineError(createPasswordInput.closest('.password-wrapper'));
            clearInlineError(confirmPasswordInput.closest('.password-wrapper'));

            if (!emailInput.value.trim() || !regUsernameInput.value.trim() || !createPasswordInput.value.trim() || !confirmPasswordInput.value.trim()) {
                alert("All fields are required.");
                return;
            }

            // feat/terms-consent: nothing is sent until the boxes are ticked
            if (!checkSignUpConsent()) return;

            let hasError = false;

            // Strict Email Format Regex Check
            const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
            if (!emailRegex.test(emailInput.value.trim())) {
                showInlineError(emailInput, 'Please enter a valid email address (e.g., name@example.com).');
                hasError = true;
            }

            const pwdVal = createPasswordInput.value.trim();
            const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_,.?":{}|<>]).{8,}$/;
            if (!strongRegex.test(pwdVal)) {
                showInlineError(createPasswordInput.closest('.password-wrapper'), 'Password does not meet the strength requirements.');
                hasError = true;
            }

            if (pwdVal !== confirmPasswordInput.value.trim()) {
                showInlineError(confirmPasswordInput.closest('.password-wrapper'), 'Passwords do not match.');
                hasError = true;
            }

            // Always call the backend so email/username duplicates are checked, 
            // even if password or email format rules fail on the frontend!
            setButtonLoading(proceedToStep3, "Sending Code...");

            try {
                const response = await fetch(`${API_BASE_URL}/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: emailInput.value.trim(),
                        username: regUsernameInput.value.trim() 
                    })
                });
                const result = await response.json();

                if (!result.success) {
                    let backendHasError = false;
                    const msg = result.message.toLowerCase();
                    
                    if (msg.includes("email") || msg.includes("already exists")) {
                        showInlineError(emailInput, "An account with this email already exists.");
                        backendHasError = true;
                    }
                    if (msg.includes("username") || msg.includes("taken")) {
                        showInlineError(regUsernameInput, "This username is already taken.");
                        backendHasError = true;
                    }
                    if (!backendHasError && !hasError) {
                        alert(result.message);
                    }
                }

                // If frontend rules failed OR backend returned an error, stop here
                if (hasError || !result.success) return;

                // If everything is completely successful, proceed to Step 3 OTP screen
                const placeholder = document.getElementById('userEmailPlaceholder');
                if (placeholder) placeholder.textContent = emailInput.value;

                hideAllPanels();
                if (authToggleBar) authToggleBar.style.display = 'none';
                showPanel(signUpStep3Panel);

                clearOtpInputs('#signUpStep3Panel', 'showSignUpOtp');
                startOtpCountdown(
                    document.getElementById('otpTimerDisplay'), 
                    document.getElementById('resendOtpLink'),
                    true
                );

            } catch (err) {
                alert('Could not send verification code. Ensure your backend server is running.');
            } finally {
                resetButtonLoading(proceedToStep3);
            }
        });
    }

    const resendOtpLink = document.getElementById('resendOtpLink');
    if (resendOtpLink) {
        resendOtpLink.addEventListener('click', async (e) => {
            e.preventDefault();
            if (resendOtpLink.classList.contains('resend-link--disabled') || resendOtpLink.dataset.sending === "true") return;

            resendOtpLink.dataset.sending = "true";
            resendOtpLink.classList.add('resend-link--disabled');
            const originalText = resendOtpLink.textContent;
            resendOtpLink.textContent = 'Sending code...';

            try {
                const response = await fetch(`${API_BASE_URL}/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email: emailInput.value.trim(),
                        username: regUsernameInput.value.trim() 
                    })
                });
                const result = await response.json();

                resendOtpLink.textContent = originalText;

                if (result.success) {
                    alert('New verification code sent successfully!');
                    clearOtpInputs('#signUpStep3Panel', 'showSignUpOtp');
                    startOtpCountdown(document.getElementById('otpTimerDisplay'), resendOtpLink, true);
                } else {
                    alert(result.message);
                    resendOtpLink.classList.remove('resend-link--disabled');
                }
            } catch (err) {
                resendOtpLink.textContent = originalText;
                alert('Could not resend code.');
                resendOtpLink.classList.remove('resend-link--disabled');
            } finally {
                resendOtpLink.dataset.sending = "false";
            }
        });
    }

    if (backToStep2) {
        backToStep2.addEventListener('click', (e) => {
            e.preventDefault(); hideAllPanels();
            if (authToggleBar) authToggleBar.style.display = 'flex';
            showPanel(signUpStep2Panel, 'block', 'back');
        });
    }

    if (verifyAndFinish) {
        verifyAndFinish.addEventListener('click', async () => {
            if (signUpOtpExpired) {
                alert("Your verification code has expired. Please click 'Resend code' to get a new one.");
                setOtpBoxesState('#signUpStep3Panel', false, true);
                return;
            }

            if (!validateOtpComplete('#signUpStep3Panel')) return;

            const otpInputs = document.querySelectorAll('#signUpStep3Panel .otp-input');
            const otpCode = Array.from(otpInputs).map(i => i.value).join('');

            setButtonLoading(verifyAndFinish, "Creating Account...");

            try {
                const response = await fetch(`${API_BASE_URL}/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        firstName: firstNameInput?.value.trim(),
                        lastName: lastNameInput?.value.trim(),
                        birthdate: birthdateInput?.value,
                        gender: genderSelect?.value,
                        email: emailInput?.value.trim(),
                        username: regUsernameInput?.value.trim(),
                        password: createPasswordInput?.value.trim(),
                        confirmPassword: confirmPasswordInput?.value.trim(),
                        otp: otpCode,
                        agreeTerms: !!(agreeTermsInput && agreeTermsInput.checked),
                        guardianAgrees: !!(guardianAgreesInput && guardianAgreesInput.checked)
                    })
                });
                const result = await response.json();

                if (result.success) {
                    setOtpBoxesState('#signUpStep3Panel', true, false);
                    const fullName = ((firstNameInput?.value || '') + ' ' + (lastNameInput?.value || '')).trim();
                    const namePlaceholder = document.getElementById('successUserPlaceholder');
                    if (fullName && namePlaceholder) namePlaceholder.textContent = fullName;

                    setTimeout(() => {
                        hideAllPanels();
                        showPanel(signUpStep4Panel);
                    }, 400);
                } else {
                    setOtpBoxesState('#signUpStep3Panel', false, true);
                    alert(result.message);
                }
            } catch (err) {
                setOtpBoxesState('#signUpStep3Panel', false, true);
                alert('Could not reach the server.');
            } finally {
                resetButtonLoading(verifyAndFinish);
            }
        });
    }

    if (backToSignIn) backToSignIn.addEventListener('click', () => showSignInView());

    const setupOtpJumping = (containerSelector) => {
        const inputs = document.querySelectorAll(`${containerSelector} .otp-input`);
        inputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                const val = e.target.value;
                if (val.length === 1 && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) {
                    inputs[index - 1].focus();
                }
            });
        });
    };
    setupOtpJumping('#signUpStep3Panel');
    setupOtpJumping('#forgotOtpPanel');
    setupOtpJumping('#forgotUsernameOtpPanel');   // feat/forgot-username

    const signInFormElement = document.querySelector('#signInPanel form');
    if (signInFormElement) {
        // Dictionary to store active lockout states per username: { "username": { timeLeft: 60, interval: setInterval(...) } }
        window.activeLockouts = window.activeLockouts || {};

        const updateSignInUIForCurrentUsername = () => {
            const currentTypedUser = usernameInput.value.trim().toLowerCase();
            const submitBtn = signInFormElement.querySelector('button[type="submit"]') || signInFormElement.querySelector('.btn-login');

            if (!currentTypedUser) {
                clearInlineError(passwordInput.closest('.password-wrapper'));
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            // Check if this specific typed username is currently locked out
            if (window.activeLockouts[currentTypedUser]) {
                const lockoutData = window.activeLockouts[currentTypedUser];
                if (submitBtn) submitBtn.disabled = true;
                const minutes = Math.floor(lockoutData.timeLeft / 60);
                const seconds = lockoutData.timeLeft % 60;
                const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
                showInlineError(passwordInput.closest('.password-wrapper'), `Too many failed attempts. Please try again in ${timeFormatted}.`);
            } else {
                clearInlineError(passwordInput.closest('.password-wrapper'));
                if (submitBtn) submitBtn.disabled = false;
            }
        };

        if (usernameInput) {
            usernameInput.addEventListener('input', updateSignInUIForCurrentUsername);
        }

        signInFormElement.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = signInFormElement.querySelector('button[type="submit"]') || signInFormElement.querySelector('.btn-login');
            const targetUsername = usernameInput.value.trim().toLowerCase();

            if (!validateRequiredFields([usernameInput, passwordInput])) return;
            clearInlineError(passwordInput.closest('.password-wrapper'));

            // If this account is already locked out locally, block submission immediately
            if (window.activeLockouts[targetUsername]) {
                updateSignInUIForCurrentUsername();
                return;
            }

            setButtonLoading(submitBtn, "Signing in...");

            let response;
            try {
                response = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        username: targetUsername,
                        password: passwordInput.value.trim()
                    })
                });
                const result = await response.json();

if (result.success) {

    // Mark user as authenticated
    sessionStorage.setItem("isAuthenticated", "true");
    sessionStorage.setItem("userRole", result.role || "Learner");

    // Clear lockout for this user if they successfully logged in
    if (window.activeLockouts[targetUsername]) {
        clearInterval(window.activeLockouts[targetUsername].interval);
        delete window.activeLockouts[targetUsername];
    }

    if (authToggleBar) authToggleBar.style.display = 'none';
    if (signInPanel) signInPanel.style.display = 'none';

    const successPanel = document.getElementById('signInSuccessPanel');
    showPanel(successPanel);

    // feat/admin-login-page: this page only signs learners in - admins
    // get a 403 and a link to /admin/login instead - so it's always the
    // learner dashboard.
    const destination = result.redirect || "/dashboard";

    setTimeout(() => {
        window.location.replace(destination);
    }, 3000);
} else {
                    passwordInput.value = '';

                    if (response.status === 423) {
                        // Explicitly clear loading state and reset button
                        submitBtn.disabled = true;
                        submitBtn.classList.remove('btn-loading');
                        submitBtn.innerHTML = "Login"; // or your original button text
                        
                        const serverTimeLeft = result.remaining_seconds || 60;

                        if (!window.activeLockouts[targetUsername]) {
                            window.activeLockouts[targetUsername] = {
                                timeLeft: serverTimeLeft,
                                interval: null
                            };
                        }

                        const lockoutData = window.activeLockouts[targetUsername];
                        lockoutData.timeLeft = serverTimeLeft;

                        if (lockoutData.interval) clearInterval(lockoutData.interval);

                        lockoutData.interval = setInterval(() => {
                            lockoutData.timeLeft--;

                            if (lockoutData.timeLeft < 0) {
                                clearInterval(lockoutData.interval);
                                delete window.activeLockouts[targetUsername];

                                if (usernameInput.value.trim().toLowerCase() === targetUsername) {
                                    clearInlineError(passwordInput.closest('.password-wrapper'));
                                    submitBtn.disabled = false;
                                }
                            } else {
                                if (usernameInput.value.trim().toLowerCase() === targetUsername) {
                                    const minutes = Math.floor(lockoutData.timeLeft / 60);
                                    const seconds = lockoutData.timeLeft % 60;
                                    const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
                                    submitBtn.disabled = true;
                                    showInlineError(passwordInput.closest('.password-wrapper'), `Too many failed attempts. Please try again in ${timeFormatted}.`);
                                }
                            }
                        }, 1000);

                        updateSignInUIForCurrentUsername();
                    } else {
                        // Explicitly clear loading state for normal errors (like wrong password)
                        submitBtn.disabled = false;
                        submitBtn.classList.remove('btn-loading');
                        submitBtn.innerHTML = "Login";
                        
                        showInlineError(passwordInput.closest('.password-wrapper'), result.message);

                        // feat/login-signup-redirect: shown on EVERY failed
                        // login (unknown username AND wrong password) so the
                        // form never reveals whether a username exists.
                        if (response.status === 401) {
                            showSignUpHint(passwordInput.closest('.password-wrapper'), 'No account yet?', 'Sign up');
                        }
                    }
                }
            } catch (err) {
                resetButtonLoading(submitBtn);
                showInlineError(passwordInput.closest('.password-wrapper'), 'Could not reach server.');
            }
        });
    }

    // =========================================================================
    // --- FORGOT USERNAME (feat/forgot-username) ---
    // Same steps as Forgot Password below: email -> 6-digit code -> result.
    // The result is the account's username, shown on the last screen and
    // filled into the Sign In form when the learner goes back.
    //   POST /forgot-username/send-otp    { email }
    //   POST /forgot-username/verify-otp  { email, otp } -> { username }
    // =========================================================================
    const forgotUsernameLink = document.getElementById('forgotUsernameLink');
    const forgotUsernameEmailInput = document.getElementById('forgotUsernameEmail');
    const btnForgotUsernameProceed = document.getElementById('btnForgotUsernameProceed');
    const resendForgotUsernameLink = document.getElementById('resendForgotUsernameLink');
    const btnVerifyForgotUsernameCode = document.getElementById('btnVerifyForgotUsernameCode');
    const btnUsernameBackToSignIn = document.getElementById('btnUsernameBackToSignIn');
    const recoveredUsernameEl = document.getElementById('recoveredUsername');

    if (forgotUsernameLink && forgotUsernamePanel) {
        forgotUsernameLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (!confirmViewSwitch()) return;
            hideAllPanels();
            if (authToggleBar) authToggleBar.style.display = 'none';
            showPanel(forgotUsernamePanel);
        });
    }

    if (btnForgotUsernameProceed) {
        btnForgotUsernameProceed.addEventListener('click', async (e) => {
            e.preventDefault();

            clearInlineError(forgotUsernameEmailInput);

            if (!validateRequiredFields([forgotUsernameEmailInput])) return;

            const userEmail = forgotUsernameEmailInput.value.trim();

            // Same strict email format check as Forgot Password
            const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
            if (!emailRegex.test(userEmail)) {
                showInlineError(forgotUsernameEmailInput, 'Please enter a valid email address (e.g., name@example.com).');
                return;
            }

            setButtonLoading(btnForgotUsernameProceed, "Verifying...");

            try {
                const response = await fetch(`${API_BASE_URL}/forgot-username/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail })
                });

                const result = await response.json();

                if (result.success) {
                    document.querySelectorAll('.dynamic-forgot-username-email').forEach(el => {
                        el.textContent = userEmail;
                    });

                    hideAllPanels();
                    showPanel(forgotUsernameOtpPanel);

                    clearOtpInputs('#forgotUsernameOtpPanel', 'showForgotUsernameOtp');
                    startOtpCountdown(
                        document.getElementById('forgotUsernameTimerDisplay'),
                        resendForgotUsernameLink,
                        'username'
                    );
                } else {
                    showInlineError(forgotUsernameEmailInput, result.message);

                    // 404 = no account uses this email -> offer Sign Up with it filled in.
                    if (response.status === 404) {
                        showSignUpHint(forgotUsernameEmailInput, 'Want to make one?', 'Sign up with this email', userEmail);
                    }
                }
            } catch (err) {
                alert('Could not reach the server. Make sure your Flask backend is running.');
            } finally {
                resetButtonLoading(btnForgotUsernameProceed);
            }
        });
    }

    if (resendForgotUsernameLink) {
        resendForgotUsernameLink.addEventListener('click', async (e) => {
            e.preventDefault();
            if (resendForgotUsernameLink.classList.contains('resend-link--disabled') || resendForgotUsernameLink.dataset.sending === "true") return;

            resendForgotUsernameLink.dataset.sending = "true";
            resendForgotUsernameLink.classList.add('resend-link--disabled');
            const originalText = resendForgotUsernameLink.textContent;
            resendForgotUsernameLink.textContent = 'Sending code...';

            try {
                const response = await fetch(`${API_BASE_URL}/forgot-username/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: forgotUsernameEmailInput.value.trim() })
                });
                const result = await response.json();

                resendForgotUsernameLink.textContent = originalText;

                if (result.success) {
                    alert('New verification code sent!');
                    clearOtpInputs('#forgotUsernameOtpPanel', 'showForgotUsernameOtp');
                    startOtpCountdown(document.getElementById('forgotUsernameTimerDisplay'), resendForgotUsernameLink, 'username');
                } else {
                    alert(result.message);
                    resendForgotUsernameLink.classList.remove('resend-link--disabled');
                }
            } catch (err) {
                resendForgotUsernameLink.textContent = originalText;
                alert('Could not resend code.');
                resendForgotUsernameLink.classList.remove('resend-link--disabled');
            } finally {
                resendForgotUsernameLink.dataset.sending = "false";
            }
        });
    }

    if (btnVerifyForgotUsernameCode) {
        btnVerifyForgotUsernameCode.addEventListener('click', async (e) => {
            e.preventDefault();

            if (forgotUsernameOtpExpired) {
                alert("Your verification code has expired. Please click 'Resend code' to get a new one.");
                setOtpBoxesState('#forgotUsernameOtpPanel', false, true);
                return;
            }

            if (!validateOtpComplete('#forgotUsernameOtpPanel')) return;

            const otpInputs = document.querySelectorAll('#forgotUsernameOtpPanel .otp-input');
            const otpCode = Array.from(otpInputs).map(i => i.value).join('');
            const userEmail = forgotUsernameEmailInput ? forgotUsernameEmailInput.value.trim() : '';

            setButtonLoading(btnVerifyForgotUsernameCode, "Verifying Code...");

            try {
                const response = await fetch(`${API_BASE_URL}/forgot-username/verify-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail, otp: otpCode })
                });

                const result = await response.json();

                if (result.success) {
                    setOtpBoxesState('#forgotUsernameOtpPanel', true, false);
                    if (recoveredUsernameEl) recoveredUsernameEl.textContent = result.username;
                    const timerEl = document.getElementById('forgotUsernameTimerDisplay');
                    if (timerEl && timerEl.intervalId) clearInterval(timerEl.intervalId);
                    setTimeout(() => {
                        hideAllPanels();
                        showPanel(forgotUsernameSuccessPanel);
                    }, 400);
                } else {
                    setOtpBoxesState('#forgotUsernameOtpPanel', false, true);
                    alert(result.message);
                }
            } catch (err) {
                setOtpBoxesState('#forgotUsernameOtpPanel', false, true);
                alert('Could not verify code. Ensure server is running.');
            } finally {
                resetButtonLoading(btnVerifyForgotUsernameCode);
            }
        });
    }

    // Back to Sign in from the result screen: the username is already typed
    // in for them, and the cursor waits in the Password box.
    if (btnUsernameBackToSignIn) {
        btnUsernameBackToSignIn.addEventListener('click', (e) => {
            e.preventDefault();
            const recovered = recoveredUsernameEl ? recoveredUsernameEl.textContent.trim() : '';
            showSignInView('back');   // this also clears every form
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            if (usernameInput && recovered) usernameInput.value = recovered;
            if (passwordInput) passwordInput.focus();
        });
    }

    // --- FORGOT PASSWORD NAVIGATION & HANDLERS ---
    const forgotLink = document.querySelector('.forgot-link');
    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (!confirmViewSwitch()) return;
            hideAllPanels();
            if (authToggleBar) authToggleBar.style.display = 'none';
            showPanel(forgotPasswordPanel);
        });
    }

    const btnForgotProceed = document.getElementById('btnForgotProceed');
    const forgotEmailInput = document.getElementById('forgotEmail');

    if (btnForgotProceed) {
        btnForgotProceed.addEventListener('click', async (e) => {
            e.preventDefault();

            clearInlineError(forgotEmailInput);

            if (!validateRequiredFields([forgotEmailInput])) return;

            const userEmail = forgotEmailInput.value.trim();

            // Strict Email Format Regex Check
            const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
            if (!emailRegex.test(userEmail)) {
                showInlineError(forgotEmailInput, 'Please enter a valid email address (e.g., name@example.com).');
                return;
            }

            setButtonLoading(btnForgotProceed, "Verifying...");

            try {
                const response = await fetch(`${API_BASE_URL}/forgot-password/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail })
                });

                const result = await response.json();

                if (result.success) {
                    document.querySelectorAll('.dynamic-forgot-email').forEach(el => {
                        el.textContent = userEmail;
                    });

                    hideAllPanels();
                    showPanel(forgotOtpPanel);

                    clearOtpInputs('#forgotOtpPanel', 'showForgotOtp');
                    startOtpCountdown(
                        document.getElementById('forgotTimerDisplay'), 
                        document.getElementById('resendForgotLink'),
                        false
                    );
                } else {
                    showInlineError(forgotEmailInput, result.message);

                    // feat/login-signup-redirect: 404 = no account uses this
                    // email -> offer Sign Up with the email already filled in.
                    if (response.status === 404) {
                        showSignUpHint(forgotEmailInput, 'Want to make one?', 'Sign up with this email', userEmail);
                    }
                }
            } catch (err) {
                alert('Could not reach the server. Make sure your Flask backend is running.');
            } finally {
                resetButtonLoading(btnForgotProceed);
            }
        });
    }

    const resendForgotLink = document.getElementById('resendForgotLink');
    if (resendForgotLink) {
        resendForgotLink.addEventListener('click', async (e) => {
            e.preventDefault();
            if (resendForgotLink.classList.contains('resend-link--disabled') || resendForgotLink.dataset.sending === "true") return;

            resendForgotLink.dataset.sending = "true";
            resendForgotLink.classList.add('resend-link--disabled');
            const originalText = resendForgotLink.textContent;
            resendForgotLink.textContent = 'Sending code...';

            try {
                const response = await fetch(`${API_BASE_URL}/forgot-password/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: forgotEmailInput.value.trim() })
                });
                const result = await response.json();

                resendForgotLink.textContent = originalText;

                if (result.success) {
                    alert('New password reset code sent!');
                    clearOtpInputs('#forgotOtpPanel', 'showForgotOtp');
                    startOtpCountdown(document.getElementById('forgotTimerDisplay'), resendForgotLink, false);
                } else {
                    alert(result.message);
                    resendForgotLink.classList.remove('resend-link--disabled');
                }
            } catch (err) {
                resendForgotLink.textContent = originalText;
                alert('Could not resend code.');
                resendForgotLink.classList.remove('resend-link--disabled');
            } finally {
                resendForgotLink.dataset.sending = "false";
            }
        });
    }

    const btnVerifyForgotCode = document.getElementById('btnVerifyForgotCode');
    if (btnVerifyForgotCode) {
        btnVerifyForgotCode.addEventListener('click', async (e) => {
            e.preventDefault();

            if (forgotOtpExpired) {
                alert("Your verification code has expired. Please click 'Resend code' to get a new one.");
                setOtpBoxesState('#forgotOtpPanel', false, true);
                return;
            }

            if (!validateOtpComplete('#forgotOtpPanel')) return;

            const otpInputs = document.querySelectorAll('#forgotOtpPanel .otp-input');
            const otpCode = Array.from(otpInputs).map(i => i.value).join('');
            const userEmail = forgotEmailInput ? forgotEmailInput.value.trim() : '';

            setButtonLoading(btnVerifyForgotCode, "Verifying Code...");

            try {
                const response = await fetch(`${API_BASE_URL}/forgot-password/verify-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: userEmail, otp: otpCode })
                });

                const result = await response.json();

                if (result.success) {
                    setOtpBoxesState('#forgotOtpPanel', true, false);
                    setTimeout(() => {
                        hideAllPanels();
                        showPanel(setNewPasswordPanel);
                    }, 400);
                } else {
                    setOtpBoxesState('#forgotOtpPanel', false, true);
                    alert(result.message);
                }
            } catch (err) {
                setOtpBoxesState('#forgotOtpPanel', false, true);
                alert('Could not verify code. Ensure server is running.');
            } finally {
                resetButtonLoading(btnVerifyForgotCode);
            }
        });
    }

    // --- RESET PASSWORD CLICK HANDLER ---
    const btnResetPassword = document.getElementById('btnResetPassword');
    const forgotNewPasswordInput = document.getElementById('forgotNewPassword');
    const forgotConfirmPasswordInput = document.getElementById('forgotConfirmPassword');

    if (btnResetPassword) {
        btnResetPassword.addEventListener('click', async (e) => {
            e.preventDefault();

            const confirmWrapper = forgotConfirmPasswordInput.closest('.password-wrapper');
            clearInlineError(forgotNewPasswordInput.closest('.password-wrapper'));
            clearInlineError(confirmWrapper);

            if (!validateRequiredFields([forgotNewPasswordInput, forgotConfirmPasswordInput])) return;

            const pwdVal = forgotNewPasswordInput.value.trim();
            const confirmVal = forgotConfirmPasswordInput.value.trim();
            const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_,.?":{}|<>]).{8,}$/;

            const matchIndicator = document.getElementById('forgotConfirmPassword-match');

            let errors = [];

            if (!strongRegex.test(pwdVal)) {
                errors.push('Password does not meet the strength requirements.');
            }

            if (pwdVal !== confirmVal) {
                errors.push('Passwords do not match.');
            }

            if (errors.length > 0) {
                if (matchIndicator) matchIndicator.classList.add('auth-hidden');
                showInlineError(confirmWrapper, errors.join(' '));
                return;
            }

            const userEmail = forgotEmailInput ? forgotEmailInput.value.trim() : '';

            setButtonLoading(btnResetPassword, "Resetting Password...");

            try {
                const response = await fetch(`${API_BASE_URL}/forgot-password/reset-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: userEmail,
                        newPassword: pwdVal,
                        confirmPassword: confirmVal
                    })
                });

                const result = await response.json();

                if (result.success) {
                    hideAllPanels();
                    showPanel(forgotSuccessPanel);
                } else {
                    if (matchIndicator) matchIndicator.classList.add('auth-hidden');
                    showInlineError(confirmWrapper, result.message);
                }
            } catch (err) {
                if (matchIndicator) matchIndicator.classList.add('auth-hidden');
                showInlineError(confirmWrapper, 'Could not reset password.');
            } finally {
                resetButtonLoading(btnResetPassword);
            }
        });
    }

    const backToLoginLinks = document.querySelectorAll('.back-to-login-link, .back-to-login-btn');
    backToLoginLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (!confirmViewSwitch()) return;
            showSignInView('back');
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;

        const activeElement = document.activeElement;
        if (!activeElement || (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'SELECT')) return;

        e.preventDefault();

        const visiblePanel = activeElement.closest(
            '#signInPanel, #signUpPanel, #signUpStep2Panel, #signUpStep3Panel, #forgotPasswordPanel, #forgotOtpPanel, #setNewPasswordPanel, #forgotUsernamePanel, #forgotUsernameOtpPanel'
        );
        if (!visiblePanel) return;

        // Gather all focusable inputs/selects inside the currently active panel in order
        const focusableInputs = Array.from(visiblePanel.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), select'))
            .filter(el => !el.disabled && el.offsetParent !== null);

        const currentIndex = focusableInputs.indexOf(activeElement);

        // If there is a next input field in the form, move focus to it
        if (currentIndex !== -1 && currentIndex < focusableInputs.length - 1) {
            focusableInputs[currentIndex + 1].focus();
            if (focusableInputs[currentIndex + 1].tagName === 'INPUT') {
                focusableInputs[currentIndex + 1].select();
            }
            return;
        }

        // If we are on the last input field of the panel, trigger the primary action button
        const panelId = visiblePanel.id;

        if (panelId === 'signInPanel') {
            const loginBtn = visiblePanel.querySelector('button[type="submit"], .btn-login');
            if (loginBtn) loginBtn.click();
        }
        else if (panelId === 'signUpPanel') {
            const nextBtn = document.getElementById('goToStep2');
            if (nextBtn) nextBtn.click();
        }
        else if (panelId === 'signUpStep2Panel') {
            const proceedBtn = visiblePanel.querySelector('.btn-next');
            if (proceedBtn) proceedBtn.click();
        }
        else if (panelId === 'signUpStep3Panel') {
            const finishBtn = document.getElementById('btnFinish');
            if (finishBtn) finishBtn.click();
        }
        else if (panelId === 'forgotPasswordPanel') {
            const forgotProceedBtn = document.getElementById('btnForgotProceed');
            if (forgotProceedBtn) forgotProceedBtn.click();
        }
        else if (panelId === 'forgotOtpPanel') {
            const verifyForgotBtn = document.getElementById('btnVerifyForgotCode');
            if (verifyForgotBtn) verifyForgotBtn.click();
        }
        else if (panelId === 'setNewPasswordPanel') {
            const resetBtn = document.getElementById('btnResetPassword');
            if (resetBtn) resetBtn.click();
        }
        // feat/forgot-username
        else if (panelId === 'forgotUsernamePanel') {
            const proceedBtn = document.getElementById('btnForgotUsernameProceed');
            if (proceedBtn) proceedBtn.click();
        }
        else if (panelId === 'forgotUsernameOtpPanel') {
            const verifyBtn = document.getElementById('btnVerifyForgotUsernameCode');
            if (verifyBtn) verifyBtn.click();
        }
    });

    // =========================================================================
    // --- feat/login-animations: SNAKE BORDER TRACE (page load only) ---
    // =========================================================================
    // Sizes the SVG outline to the card, then adds .is-running so the
    // gradient "snake" coils around the card once (animations.css). With
    // reduce-motion on, the CSS simply never shows it.
    const snakeTrace = document.getElementById('snakeTrace');
    const snakeTraceRect = document.getElementById('snakeTraceRect');
    const authCard = document.querySelector('.auth-card');

    function runSnakeTrace() {
        if (!snakeTrace || !snakeTraceRect || !authCard) return;
        const w = authCard.offsetWidth;
        const h = authCard.offsetHeight;
        snakeTrace.setAttribute('viewBox', `0 0 ${w + 8} ${h + 8}`);
        snakeTraceRect.setAttribute('width', w + 4);
        snakeTraceRect.setAttribute('height', h + 4);
        snakeTrace.classList.remove('is-running');
        void snakeTrace.getBoundingClientRect();
        snakeTrace.classList.add('is-running');
    }

    // After pageshow has put the Sign In panel in place, so the size is final.
    window.addEventListener('load', () => requestAnimationFrame(runSnakeTrace), { once: true });

    // =========================================================================
    // --- feat/login-signup-redirect: "CREATE AN EMAIL" HELP POPUP ---
    // =========================================================================
    // Opened from "Create one" under the sign-up Email field. The provider
    // buttons are plain links with target="_blank" (see login.html), so
    // they open in a new tab and this sign-up form stays exactly as it was.
    const createEmailModal = document.getElementById('createEmailModal');
    const openCreateEmailHelp = document.getElementById('openCreateEmailHelp');
    const closeCreateEmailHelp = document.getElementById('closeCreateEmailHelp');

    function openCreateEmailModal() {
        if (!createEmailModal) return;
        createEmailModal.classList.remove('auth-hidden');
        if (closeCreateEmailHelp) closeCreateEmailHelp.focus();
    }

    function closeCreateEmailModal() {
        if (!createEmailModal || createEmailModal.classList.contains('auth-hidden')) return;
        createEmailModal.classList.add('auth-hidden');
        if (openCreateEmailHelp) openCreateEmailHelp.focus();
    }

    if (openCreateEmailHelp) {
        openCreateEmailHelp.addEventListener('click', (e) => {
            e.preventDefault();
            openCreateEmailModal();
        });
    }

    if (closeCreateEmailHelp) closeCreateEmailHelp.addEventListener('click', closeCreateEmailModal);

    if (createEmailModal) {
        // Click on the dark backdrop (not the card) closes it.
        createEmailModal.addEventListener('click', (e) => {
            if (e.target === createEmailModal) closeCreateEmailModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCreateEmailModal();
    });

});