document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = "http://127.0.0.1:5000";

    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        fetch('header.html')
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
                input.style.borderColor = '';
                input.style.backgroundColor = '';
            });
        });
    };

    configureOtpInputs('#signUpStep3Panel', 'showSignUpOtp');
    configureOtpInputs('#forgotOtpPanel', 'showForgotOtp');

    window.setOtpBoxesState = function(containerSelector, isCorrect, shouldClear = false) {
        const inputs = document.querySelectorAll(`${containerSelector} .otp-input`);
        inputs.forEach(input => {
            if (isCorrect) {
                input.style.borderColor = '#0e9f6e';
                input.style.backgroundColor = '#ecfdf5';
            } else {
                input.style.borderColor = '#e02424';
                input.style.backgroundColor = '#fef2f2';
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
            input.style.borderColor = '';
            input.style.backgroundColor = '';
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
            errorEl.style.color = '#e02424';
            errorEl.style.fontSize = '14px';
            errorEl.style.marginTop = '8px';
            afterEl.insertAdjacentElement('afterend', errorEl);
        }
        errorEl.textContent = message;
    }

    function clearInlineError(afterEl) {
        if (!afterEl) return;
        const errorEl = afterEl.parentElement.querySelector('.js-error-message');
        if (errorEl) errorEl.remove();
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
            const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(val);

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
                reqSpecial.textContent = (hasSpecial ? '✓' : '✗') + ' Requires a special character (!@#$%^&*)';
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
    }

    setupPasswordMatchIndicator('createPassword', 'confirmPassword', 'confirmPassword-match');
    setupPasswordMatchIndicator('forgotNewPassword', 'forgotConfirmPassword', 'forgotConfirmPassword-match');

    // --- COUNTDOWN TIMERS ---
    let signUpOtpExpired = false;
    let forgotOtpExpired = false;

    function startOtpCountdown(timerDisplayEl, resendLinkEl, isSignUp = true) {
        if (!timerDisplayEl) return;

        if (timerDisplayEl.intervalId) clearInterval(timerDisplayEl.intervalId);

        let timeLeft = 60;
        if (isSignUp) signUpOtpExpired = false;
        else forgotOtpExpired = false;

        if (resendLinkEl) {
            resendLinkEl.style.pointerEvents = 'none';
            resendLinkEl.style.opacity = '0.5';
            resendLinkEl.style.cursor = 'default';
        }

        timerDisplayEl.intervalId = setInterval(() => {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;

            timerDisplayEl.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

            if (timeLeft <= 0) {
                clearInterval(timerDisplayEl.intervalId);
                if (isSignUp) signUpOtpExpired = true;
                else forgotOtpExpired = true;

                if (resendLinkEl) {
                    resendLinkEl.style.pointerEvents = 'auto';
                    resendLinkEl.style.opacity = '1';
                    resendLinkEl.style.cursor = 'pointer';
                }
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
    // --- TASK 10: UNIVERSAL UNSAVED CHANGES CHECK ---
    // =========================================================================
    function activePanelHasInputs() {
        const allPanels = document.querySelectorAll(
            '#signInPanel, #signUpPanel, #signUpStep2Panel, #signUpStep3Panel, #forgotPasswordPanel, #forgotOtpPanel, #setNewPasswordPanel'
        );

        for (const panel of allPanels) {
            // Check only the panel currently visible on screen
            if (panel && panel.style.display !== 'none' && getComputedStyle(panel).display !== 'none') {
                const inputs = panel.querySelectorAll('input:not([type="checkbox"]):not([type="hidden"]), select');
                for (const input of inputs) {
                    if (input.value && input.value.trim() !== '') {
                        return true; // Found unsubmitted data in the active panel!
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

    // --- FORM RESET HELPERS ---
    function resetSignUpForm() {
        const signUpFormStep1 = document.querySelector('#signUpPanel form');
        const signUpFormStep2 = document.querySelector('#signUpStep2Panel form');

        if (signUpFormStep1) signUpFormStep1.reset();
        if (signUpFormStep2) signUpFormStep2.reset();

        clearOtpInputs('#signUpStep3Panel', 'showSignUpOtp');

        if (emailInput) clearInlineError(emailInput);
        if (regUsernameInput) clearInlineError(regUsernameInput);
        if (createPasswordInput && createPasswordInput.closest('.password-wrapper')) {
            clearInlineError(createPasswordInput.closest('.password-wrapper'));
        }
        if (confirmPasswordInput && confirmPasswordInput.closest('.password-wrapper')) {
            clearInlineError(confirmPasswordInput.closest('.password-wrapper'));
        }

        const createChecker = document.getElementById('createPassword-checker');
        if (createChecker) createChecker.style.display = 'none';

        const matchIndicator = document.getElementById('confirmPassword-match');
        if (matchIndicator) {
            matchIndicator.style.display = 'none';
            matchIndicator.textContent = '';
        }
    }

    function resetSignInForm() {
        const signInForm = document.querySelector('#signInPanel form');
        if (signInForm) signInForm.reset();

        if (passwordInput && passwordInput.closest('.password-wrapper')) {
            clearInlineError(passwordInput.closest('.password-wrapper'));
        }
    }

    function resetForgotPasswordForm() {
        const forgotForm = document.querySelector('#forgotPasswordPanel form');
        const setNewPwdForm = document.querySelector('#setNewPasswordPanel form');

        if (forgotForm) forgotForm.reset();
        if (setNewPwdForm) setNewPwdForm.reset();

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
        if (forgotChecker) forgotChecker.style.display = 'none';

        const forgotMatchIndicator = document.getElementById('forgotConfirmPassword-match');
        if (forgotMatchIndicator) {
            forgotMatchIndicator.style.display = 'none';
            forgotMatchIndicator.textContent = '';
        }
    }

    function hideAllPanels() {
        const panels = [signInPanel, signUpPanel, signUpStep2Panel, signUpStep3Panel, signUpStep4Panel,
                        forgotPasswordPanel, forgotOtpPanel, setNewPasswordPanel, forgotSuccessPanel];
        panels.forEach(p => { if (p) p.style.display = 'none'; });
        if (document.getElementById('signInSuccessPanel')) document.getElementById('signInSuccessPanel').style.display = 'none';
    }

    function showSignInView() {
        hideAllPanels();
        resetSignUpForm();
        resetForgotPasswordForm();
        if (authToggleBar) authToggleBar.style.display = 'flex';
        if (signInBtn) signInBtn.classList.add('active');
        if (signUpBtn) signUpBtn.classList.remove('active');
        if (signInPanel) signInPanel.style.display = 'block';
    }

    function showSignUpView() {
        hideAllPanels();
        resetSignInForm();
        resetForgotPasswordForm();
        if (authToggleBar) authToggleBar.style.display = 'flex';
        if (signInBtn) signInBtn.classList.remove('active');
        if (signUpBtn) signUpBtn.classList.add('active');
        if (signUpPanel) signUpPanel.style.display = 'block';
    }

    if (signInBtn && signUpBtn) {
        signUpBtn.addEventListener('click', () => {
            if (signInBtn.classList.contains('active') && !confirmViewSwitch()) return;
            showSignUpView();
        });

        signInBtn.addEventListener('click', () => {
            if (signUpBtn.classList.contains('active') && !confirmViewSwitch()) return;
            showSignInView();
        });
    }

    if (goToStep2) {
        goToStep2.addEventListener('click', () => {
            if (!validateRequiredFields([firstNameInput, lastNameInput, birthdateInput, genderSelect])) return;
            hideAllPanels();
            if (signUpStep2Panel) signUpStep2Panel.style.display = 'block';
        });
    }

    if (backToStep1) backToStep1.addEventListener('click', (e) => { e.preventDefault(); hideAllPanels(); if (signUpPanel) signUpPanel.style.display = 'block'; });

    if (proceedToStep3) {
        proceedToStep3.addEventListener('click', async (e) => {
            e.preventDefault();

            clearInlineError(emailInput);
            clearInlineError(regUsernameInput);
            clearInlineError(createPasswordInput.closest('.password-wrapper'));
            clearInlineError(confirmPasswordInput.closest('.password-wrapper'));

            let hasError = false;

            if (!emailInput.value.trim() || !regUsernameInput.value.trim() || !createPasswordInput.value.trim() || !confirmPasswordInput.value.trim()) {
                alert("All fields are required.");
                return;
            }

            const pwdVal = createPasswordInput.value.trim();
            const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
            if (!strongRegex.test(pwdVal)) {
                showInlineError(createPasswordInput.closest('.password-wrapper'), 'Password does not meet the strength requirements.');
                hasError = true;
            }

            if (pwdVal !== confirmPasswordInput.value.trim()) {
                showInlineError(confirmPasswordInput.closest('.password-wrapper'), 'Passwords do not match.');
                hasError = true;
            }

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
                    if (result.message.includes("email")) {
                        showInlineError(emailInput, "An account with this email already exists.");
                        hasError = true;
                    }
                    if (result.message.includes("username")) {
                        showInlineError(regUsernameInput, "This username is already taken.");
                        hasError = true;
                    }
                    if (!result.message.includes("email") && !result.message.includes("username")) {
                        alert(result.message);
                        hasError = true;
                    }
                }

                if (hasError) return;

                if (result.success) {
                    const placeholder = document.getElementById('userEmailPlaceholder');
                    if (placeholder) placeholder.textContent = emailInput.value;

                    hideAllPanels();
                    if (authToggleBar) authToggleBar.style.display = 'none';
                    if (signUpStep3Panel) signUpStep3Panel.style.display = 'block';

                    clearOtpInputs('#signUpStep3Panel', 'showSignUpOtp');
                    startOtpCountdown(
                        document.getElementById('otpTimerDisplay'), 
                        document.getElementById('resendOtpLink'),
                        true
                    );
                }

            } catch (err) {
                alert('Could not send verification code. Ensure your backend server is running.');
            }
        });
    }

    const resendOtpLink = document.getElementById('resendOtpLink');
    if (resendOtpLink) {
        resendOtpLink.addEventListener('click', async (e) => {
            e.preventDefault();
            if (resendOtpLink.style.pointerEvents === 'none') return;
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
                if (result.success) {
                    alert('New verification code sent successfully!');
                    clearOtpInputs('#signUpStep3Panel', 'showSignUpOtp');
                    startOtpCountdown(document.getElementById('otpTimerDisplay'), resendOtpLink, true);
                } else {
                    alert(result.message);
                }
            } catch (err) {
                alert('Could not resend code.');
            }
        });
    }

    if (backToStep2) {
        backToStep2.addEventListener('click', (e) => {
            e.preventDefault(); hideAllPanels();
            if (authToggleBar) authToggleBar.style.display = 'flex';
            if (signUpStep2Panel) signUpStep2Panel.style.display = 'block';
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
                        otp: otpCode
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
                        if (signUpStep4Panel) signUpStep4Panel.style.display = 'block';
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

    if (backToSignIn) backToSignIn.addEventListener('click', showSignInView);

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

    const signInFormElement = document.querySelector('#signInPanel form');
    if (signInFormElement) {
        let lockoutTimerInterval = null;

        signInFormElement.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = signInFormElement.querySelector('button[type="submit"]') || signInFormElement.querySelector('.btn-login');

            if (!validateRequiredFields([usernameInput, passwordInput])) return;
            clearInlineError(passwordInput.closest('.password-wrapper'));

            setButtonLoading(submitBtn, "Signing in...");

            let response;
            try {
                response = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: usernameInput.value.trim(),
                        password: passwordInput.value.trim()
                    })
                });
                const result = await response.json();

                if (result.success) {
                    if (lockoutTimerInterval) clearInterval(lockoutTimerInterval);
                    if (authToggleBar) authToggleBar.style.display = 'none';
                    if (signInPanel) signInPanel.style.display = 'none';
                    const successPanel = document.getElementById('signInSuccessPanel');
                    if (successPanel) successPanel.style.display = 'block';
                    setTimeout(() => { window.location.href = 'dashboard.html'; }, 3000);
                } else {
                    passwordInput.value = '';

                    if (response.status === 423) {
                        resetButtonLoading(submitBtn);
                        submitBtn.disabled = true;

                        let timeLeft = 60;
                        if (lockoutTimerInterval) clearInterval(lockoutTimerInterval);

                        const updateCountdownMessage = () => {
                            const minutes = Math.floor(timeLeft / 60);
                            const seconds = timeLeft % 60;
                            const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
                            showInlineError(passwordInput.closest('.password-wrapper'), `Too many failed attempts. Please try again in ${timeFormatted}.`);
                        };

                        updateCountdownMessage();

                        lockoutTimerInterval = setInterval(() => {
                            timeLeft--;
                            if (timeLeft < 0) {
                                clearInterval(lockoutTimerInterval);
                                clearInlineError(passwordInput.closest('.password-wrapper'));
                                submitBtn.disabled = false;
                            } else {
                                updateCountdownMessage();
                            }
                        }, 1000);
                    } else {
                        resetButtonLoading(submitBtn);
                        showInlineError(passwordInput.closest('.password-wrapper'), result.message);
                    }
                }
            } catch (err) {
                resetButtonLoading(submitBtn);
                showInlineError(passwordInput.closest('.password-wrapper'), 'Could not reach server.');
            }
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
            if (forgotPasswordPanel) forgotPasswordPanel.style.display = 'block';
        });
    }

    const btnForgotProceed = document.getElementById('btnForgotProceed');
    const forgotEmailInput = document.getElementById('forgotEmail');

    if (btnForgotProceed) {
        btnForgotProceed.addEventListener('click', async (e) => {
            e.preventDefault();

            if (!validateRequiredFields([forgotEmailInput])) return;

            const userEmail = forgotEmailInput.value.trim();

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
                    if (forgotOtpPanel) forgotOtpPanel.style.display = 'block';

                    clearOtpInputs('#forgotOtpPanel', 'showForgotOtp');
                    startOtpCountdown(
                        document.getElementById('forgotTimerDisplay'), 
                        document.getElementById('resendForgotLink'),
                        false
                    );
                } else {
                    alert(result.message);
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
            if (resendForgotLink.style.pointerEvents === 'none') return;
            try {
                const response = await fetch(`${API_BASE_URL}/forgot-password/send-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: forgotEmailInput.value.trim() })
                });
                const result = await response.json();
                if (result.success) {
                    alert('New password reset code sent!');
                    clearOtpInputs('#forgotOtpPanel', 'showForgotOtp');
                    startOtpCountdown(document.getElementById('forgotTimerDisplay'), resendForgotLink, false);
                } else {
                    alert(result.message);
                }
            } catch (err) {
                alert('Could not resend code.');
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
                        if (setNewPasswordPanel) setNewPasswordPanel.style.display = 'block';
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
            const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;

            const matchIndicator = document.getElementById('forgotConfirmPassword-match');

            let errors = [];

            if (!strongRegex.test(pwdVal)) {
                errors.push('Password does not meet the strength requirements.');
            }

            if (pwdVal !== confirmVal) {
                errors.push('Passwords do not match.');
            }

            if (errors.length > 0) {
                if (matchIndicator) matchIndicator.style.display = 'none';
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
                    if (forgotSuccessPanel) forgotSuccessPanel.style.display = 'block';
                } else {
                    if (matchIndicator) matchIndicator.style.display = 'none';
                    showInlineError(confirmWrapper, result.message);
                }
            } catch (err) {
                if (matchIndicator) matchIndicator.style.display = 'none';
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
            showSignInView();
        });
    });

});