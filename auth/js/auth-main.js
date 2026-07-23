document.addEventListener('DOMContentLoaded', () => {

    const API_BASE_URL = "http://127.0.0.1:5000";

    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        fetch('../components/header.html')
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

    function activePanelHasInputs() {
        const allPanels = document.querySelectorAll(
            '#signInPanel, #signUpPanel, #signUpStep2Panel, #signUpStep3Panel, #forgotPasswordPanel, #forgotOtpPanel, #setNewPasswordPanel'
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

    function resetSignUpForm() {
        const signUpFormStep1 = document.querySelector('#signUpPanel form');
        const signUpFormStep2 = document.querySelector('#signUpStep2Panel form');

        if (signUpFormStep1) signUpFormStep1.reset();
        if (signUpFormStep2) signUpFormStep2.reset();

        document.querySelectorAll('#signUpPanel input, #signUpPanel select, #signUpStep2Panel input, #signUpStep2Panel select').forEach(inp => {
            if (inp.type !== 'checkbox' && inp.type !== 'hidden') inp.value = '';
        });

        if (typeof clearOtpInputs === 'function') clearOtpInputs('#signUpStep3Panel', 'showSignUpOtp');

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

        if (typeof clearOtpInputs === 'function') clearOtpInputs('#forgotOtpPanel', 'showForgotOtp');

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
        resetSignUpForm();
        resetForgotPasswordForm();
        resetSignInForm();
        hideAllPanels();
        if (authToggleBar) authToggleBar.style.display = 'flex';
        if (signInBtn) signInBtn.classList.add('active');
        if (signUpBtn) signUpBtn.classList.remove('active');
        if (signInPanel) signInPanel.style.display = 'block';
    }

    function showSignUpView() {
        resetSignInForm();
        resetForgotPasswordForm();
        resetSignUpForm();
        hideAllPanels();
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

            if (!emailInput.value.trim() || !regUsernameInput.value.trim() || !createPasswordInput.value.trim() || !confirmPasswordInput.value.trim()) {
                alert("All fields are required.");
                return;
            }

            let hasError = false;

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

            if (hasError) return;

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

                if (hasError || !result.success) return;

                const placeholder = document.getElementById('userEmailPlaceholder');
                if (placeholder) placeholder.textContent = emailInput.value;

                hideAllPanels();
                if (authToggleBar) authToggleBar.style.display = 'none';
                if (signUpStep3Panel) signUpStep3Panel.style.display = 'block';

                if (typeof clearOtpInputs === 'function') clearOtpInputs('#signUpStep3Panel', 'showSignUpOtp');
                if (typeof startOtpCountdown === 'function') {
                    startOtpCountdown(
                        document.getElementById('otpTimerDisplay'), 
                        document.getElementById('resendOtpLink'),
                        true
                    );
                }

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
            if (resendOtpLink.style.pointerEvents === 'none' || resendOtpLink.dataset.sending === "true") return;

            resendOtpLink.dataset.sending = "true";
            resendOtpLink.style.pointerEvents = 'none';
            resendOtpLink.style.opacity = '0.5';
            resendOtpLink.style.cursor = 'not-allowed';
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
                    if (typeof clearOtpInputs === 'function') clearOtpInputs('#signUpStep3Panel', 'showSignUpOtp');
                    if (typeof startOtpCountdown === 'function') {
                        startOtpCountdown(document.getElementById('otpTimerDisplay'), resendOtpLink, true);
                    }
                } else {
                    alert(result.message);
                    resendOtpLink.style.pointerEvents = 'auto';
                    resendOtpLink.style.opacity = '1';
                    resendOtpLink.style.cursor = 'pointer';
                }
            } catch (err) {
                resendOtpLink.textContent = originalText;
                alert('Could not resend code.');
                resendOtpLink.style.pointerEvents = 'auto';
                resendOtpLink.style.opacity = '1';
                resendOtpLink.style.cursor = 'pointer';
            } finally {
                resendOtpLink.dataset.sending = "false";
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
            if (window.signUpOtpExpired) {
                alert("Your verification code has expired. Please click 'Resend code' to get a new one.");
                if (typeof setOtpBoxesState === 'function') setOtpBoxesState('#signUpStep3Panel', false, true);
                return;
            }

            if (typeof validateOtpComplete === 'function' && !validateOtpComplete('#signUpStep3Panel')) return;

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
                    if (typeof setOtpBoxesState === 'function') setOtpBoxesState('#signUpStep3Panel', true, false);
                    const fullName = ((firstNameInput?.value || '') + ' ' + (lastNameInput?.value || '')).trim();
                    const namePlaceholder = document.getElementById('successUserPlaceholder');
                    if (fullName && namePlaceholder) namePlaceholder.textContent = fullName;

                    setTimeout(() => {
                        hideAllPanels();
                        if (signUpStep4Panel) signUpStep4Panel.style.display = 'block';
                    }, 400);
                } else {
                    if (typeof setOtpBoxesState === 'function') setOtpBoxesState('#signUpStep3Panel', false, true);
                    alert(result.message);
                }
            } catch (err) {
                if (typeof setOtpBoxesState === 'function') setOtpBoxesState('#signUpStep3Panel', false, true);
                alert('Could not reach the server.');
            } finally {
                resetButtonLoading(verifyAndFinish);
            }
        });
    }

    if (backToSignIn) backToSignIn.addEventListener('click', showSignInView);

    const signInFormElement = document.querySelector('#signInPanel form');
    if (signInFormElement) {
        window.activeLockouts = window.activeLockouts || {};

        const updateSignInUIForCurrentUsername = () => {
            const currentTypedUser = usernameInput.value.trim().toLowerCase();
            const submitBtn = signInFormElement.querySelector('button[type="submit"]') || signInFormElement.querySelector('.btn-login');

            if (!currentTypedUser) {
                clearInlineError(passwordInput.closest('.password-wrapper'));
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

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
                    body: JSON.stringify({
                        username: targetUsername,
                        password: passwordInput.value.trim()
                    })
                });
                const result = await response.json();

                if (result.success) {
                    if (window.activeLockouts[targetUsername]) {
                        clearInterval(window.activeLockouts[targetUsername].interval);
                        delete window.activeLockouts[targetUsername];
                    }

                    if (authToggleBar) authToggleBar.style.display = 'none';
                    if (signInPanel) signInPanel.style.display = 'none';
                    const successPanel = document.getElementById('signInSuccessPanel');
                    if (successPanel) successPanel.style.display = 'block';
                    setTimeout(() => { window.location.href = '../learner/dashboard.html'; }, 3000);
                } else {
                    passwordInput.value = '';

                    if (response.status === 423) {
                        submitBtn.disabled = true;
                        submitBtn.classList.remove('btn-loading');
                        submitBtn.innerHTML = "Login";
                        
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
                        submitBtn.disabled = false;
                        submitBtn.classList.remove('btn-loading');
                        submitBtn.innerHTML = "Login";
                        
                        showInlineError(passwordInput.closest('.password-wrapper'), result.message);
                    }
                }
            } catch (err) {
                resetButtonLoading(submitBtn);
                showInlineError(passwordInput.closest('.password-wrapper'), 'Could not reach server.');
            }
        });
    }

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

            clearInlineError(forgotEmailInput);

            if (!validateRequiredFields([forgotEmailInput])) return;

            const userEmail = forgotEmailInput.value.trim();

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
                    if (forgotOtpPanel) forgotOtpPanel.style.display = 'block';

                    if (typeof clearOtpInputs === 'function') clearOtpInputs('#forgotOtpPanel', 'showForgotOtp');
                    if (typeof startOtpCountdown === 'function') {
                        startOtpCountdown(
                            document.getElementById('forgotTimerDisplay'), 
                            document.getElementById('resendForgotLink'),
                            false
                        );
                    }
                } else {
                    showInlineError(forgotEmailInput, result.message);
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
            if (resendForgotLink.style.pointerEvents === 'none' || resendForgotLink.dataset.sending === "true") return;

            resendForgotLink.dataset.sending = "true";
            resendForgotLink.style.pointerEvents = 'none';
            resendForgotLink.style.opacity = '0.5';
            resendForgotLink.style.cursor = 'not-allowed';
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
                    if (typeof clearOtpInputs === 'function') clearOtpInputs('#forgotOtpPanel', 'showForgotOtp');
                    if (typeof startOtpCountdown === 'function') {
                        startOtpCountdown(document.getElementById('forgotTimerDisplay'), resendForgotLink, false);
                    }
                } else {
                    alert(result.message);
                    resendForgotLink.style.pointerEvents = 'auto';
                    resendForgotLink.style.opacity = '1';
                    resendForgotLink.style.cursor = 'pointer';
                }
            } catch (err) {
                resendForgotLink.textContent = originalText;
                alert('Could not resend code.');
                resendForgotLink.style.pointerEvents = 'auto';
                resendForgotLink.style.opacity = '1';
                resendForgotLink.style.cursor = 'pointer';
            } finally {
                resendForgotLink.dataset.sending = "false";
            }
        });
    }

    const btnVerifyForgotCode = document.getElementById('btnVerifyForgotCode');
    if (btnVerifyForgotCode) {
        btnVerifyForgotCode.addEventListener('click', async (e) => {
            e.preventDefault();

            if (window.forgotOtpExpired) {
                alert("Your verification code has expired. Please click 'Resend code' to get a new one.");
                if (typeof setOtpBoxesState === 'function') setOtpBoxesState('#forgotOtpPanel', false, true);
                return;
            }

            if (typeof validateOtpComplete === 'function' && !validateOtpComplete('#forgotOtpPanel')) return;

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
                    if (typeof setOtpBoxesState === 'function') setOtpBoxesState('#forgotOtpPanel', true, false);
                    setTimeout(() => {
                        hideAllPanels();
                        if (setNewPasswordPanel) setNewPasswordPanel.style.display = 'block';
                    }, 400);
                } else {
                    if (typeof setOtpBoxesState === 'function') setOtpBoxesState('#forgotOtpPanel', false, true);
                    alert(result.message);
                }
            } catch (err) {
                if (typeof setOtpBoxesState === 'function') setOtpBoxesState('#forgotOtpPanel', false, true);
                alert('Could not verify code. Ensure server is running.');
            } finally {
                resetButtonLoading(btnVerifyForgotCode);
            }
        });
    }

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

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;

        const activeElement = document.activeElement;
        if (!activeElement || (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'SELECT')) return;

        e.preventDefault();

        const visiblePanel = activeElement.closest(
            '#signInPanel, #signUpPanel, #signUpStep2Panel, #signUpStep3Panel, #forgotPasswordPanel, #forgotOtpPanel, #setNewPasswordPanel'
        );
        if (!visiblePanel) return;

        const focusableInputs = Array.from(visiblePanel.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), select'))
            .filter(el => !el.disabled && el.offsetParent !== null);

        const currentIndex = focusableInputs.indexOf(activeElement);

        if (currentIndex !== -1 && currentIndex < focusableInputs.length - 1) {
            focusableInputs[currentIndex + 1].focus();
            if (focusableInputs[currentIndex + 1].tagName === 'INPUT') {
                focusableInputs[currentIndex + 1].select();
            }
            return;
        }

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
    });

});