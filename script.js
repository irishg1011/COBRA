document.addEventListener('DOMContentLoaded', () => {

    // Your HTML is served by Live Server (127.0.0.1:5500) while Flask
    // runs separately on 127.0.0.1:5000 — so we point directly to it.
    const API_BASE_URL = "http://127.0.0.1:5000";

    // 1. Handle Header Injection
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        fetch('header.html')
            .then(response => response.text())
            .then(data => { headerPlaceholder.innerHTML = data; })
            .catch(error => console.error('Error loading the header:', error));
    }

    // 2. SVG Paths for Eye Visibility Toggle States
    const openEyePath = `<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />`;
    const closedEyePath = `<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 1-4.243-4.243m4.242 4.242L9.88 9.88" />`;

    // 3. Multi-Field Universal Password Toggle
    document.addEventListener('click', (event) => {
        const toggleBtn = event.target.closest('.toggle-password-visibility');
        if (toggleBtn) {
            event.preventDefault();
            const passwordInput = toggleBtn.parentElement.querySelector('input');
            if (passwordInput) {
                const isCurrentlyPassword = passwordInput.getAttribute('type') === 'password';
                passwordInput.setAttribute('type', isCurrentlyPassword ? 'text' : 'password');
                const svgElement = toggleBtn.querySelector('svg');
                if (svgElement) {
                    svgElement.innerHTML = isCurrentlyPassword ? closedEyePath : openEyePath;
                }
            }
        }
    });

    // ----------------------------------------------------------
    // VALIDATION HELPER
    // Explicitly checks a list of fields one by one and shows the
    // native "Please fill out this field" warning on the first
    // empty one found. Returns false immediately if any is empty,
    // so the calling code can stop and NOT proceed to the next step.
    // ----------------------------------------------------------
    function validateRequiredFields(fields) {
        for (const field of fields) {
            if (!field) continue;
            if (!field.value || field.value.trim() === '') {
                field.setCustomValidity('Please fill out this field.');
                field.reportValidity();
                field.focus();

                const clearOnInput = () => {
                    field.setCustomValidity('');
                    field.removeEventListener('input', clearOnInput);
                };
                field.addEventListener('input', clearOnInput);

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
        }
        return complete;
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

    // 4. Panel Navigation Setup
    const authToggleBar = document.querySelector('.auth-toggle');
    const signInBtn = document.getElementById('switchToSignIn');
    const signUpBtn = document.getElementById('switchToSignUp');

    const signInPanel = document.getElementById('signInPanel');
    const signUpPanel = document.getElementById('signUpPanel');
    const signUpStep2Panel = document.getElementById('signUpStep2Panel');
    const signUpStep3Panel = document.getElementById('signUpStep3Panel');
    const signUpStep4Panel = document.getElementById('signUpStep4Panel');

    // Forgot Password Panels
    const forgotPasswordPanel = document.getElementById('forgotPasswordPanel');
    const forgotOtpPanel = document.getElementById('forgotOtpPanel');
    const setNewPasswordPanel = document.getElementById('setNewPasswordPanel');
    const forgotSuccessPanel = document.getElementById('forgotSuccessPanel');

    // Controls
    const goToStep2 = document.getElementById('goToStep2');
    const proceedToStep3 = document.querySelector('#signUpStep2Panel .btn-next');
    const verifyAndFinish = document.getElementById('btnFinish');
    const backToSignIn = document.getElementById('btnBackToSignIn');
    const backToStep1 = document.getElementById('backToStep1');
    const backToStep2 = document.getElementById('backToStep2');

    // Forgot Password Flow Triggers
    const forgotLink = document.querySelector('.forgot-link');
    const btnForgotProceed = document.getElementById('btnForgotProceed');
    const btnVerifyForgotCode = document.getElementById('btnVerifyForgotCode');
    const btnResetPassword = document.getElementById('btnResetPassword');

    // Step 1 fields
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const birthdateInput = document.getElementById('birthdate');
    const genderSelect = document.getElementById('gender');

    // Step 2 fields
    const emailInput = document.getElementById('email');
    const regUsernameInput = document.getElementById('regUsername');
    const createPasswordInput = document.getElementById('createPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    // Forgot password fields
    const forgotEmailInput = document.getElementById('forgotEmail');
    const forgotNewPasswordInput = document.getElementById('forgotNewPassword');
    const forgotConfirmPasswordInput = document.getElementById('forgotConfirmPassword');

    // Sign in fields
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // Master function to hide absolutely all views
    function hideAllPanels() {
        const panels = [signInPanel, signUpPanel, signUpStep2Panel, signUpStep3Panel, signUpStep4Panel,
                        forgotPasswordPanel, forgotOtpPanel, setNewPasswordPanel, forgotSuccessPanel];
        panels.forEach(p => { if(p) p.style.display = 'none'; });
        if(document.getElementById('signInSuccessPanel')) document.getElementById('signInSuccessPanel').style.display = 'none';
    }

    function showSignInView() {
        hideAllPanels();
        if(authToggleBar) authToggleBar.style.display = 'flex';
        if(signInBtn) signInBtn.classList.add('active');
        if(signUpBtn) signUpBtn.classList.remove('active');
        if(signInPanel) signInPanel.style.display = 'block';
    }

    // Tab Switches
    if (signInBtn && signUpBtn) {
        signUpBtn.addEventListener('click', () => {
            hideAllPanels();
            if(authToggleBar) authToggleBar.style.display = 'flex';
            signInBtn.classList.remove('active');
            signUpBtn.classList.add('active');
            if(signUpPanel) signUpPanel.style.display = 'block';
        });
        signInBtn.addEventListener('click', showSignInView);
    }

    // ==========================================================
    // Registration step routing handlers (NOW WITH VALIDATION)
    // ==========================================================
    if (goToStep2) {
        goToStep2.addEventListener('click', () => {
            const step1Fields = [firstNameInput, lastNameInput, birthdateInput, genderSelect];
            if (!validateRequiredFields(step1Fields)) return; // stop here if any field is empty

            hideAllPanels();
            if (signUpStep2Panel) signUpStep2Panel.style.display = 'block';
        });
    }

    if (backToStep1) backToStep1.addEventListener('click', (e) => { e.preventDefault(); hideAllPanels(); if(signUpPanel) signUpPanel.style.display = 'block'; });

    if (proceedToStep3) {
        proceedToStep3.addEventListener('click', (e) => {
            e.preventDefault(); // this is a type="submit" button; stop the form submit ourselves

            const step2Fields = [emailInput, regUsernameInput, createPasswordInput, confirmPasswordInput];
            if (!validateRequiredFields(step2Fields)) return; // stop here if any field is empty

            if (createPasswordInput.value.trim() !== confirmPasswordInput.value.trim()) {
                showInlineError(confirmPasswordInput.closest('.password-wrapper'), 'Passwords do not match.');
                return;
            }
            clearInlineError(confirmPasswordInput.closest('.password-wrapper'));

            const placeholder = document.getElementById('userEmailPlaceholder');
            if (emailInput && emailInput.value && placeholder) placeholder.textContent = emailInput.value;

            hideAllPanels();
            if (authToggleBar) authToggleBar.style.display = 'none';
            if(signUpStep3Panel) signUpStep3Panel.style.display = 'block';
        });
    }

    if (backToStep2) {
        backToStep2.addEventListener('click', (e) => {
            e.preventDefault(); hideAllPanels();
            if (authToggleBar) authToggleBar.style.display = 'flex';
            if(signUpStep2Panel) signUpStep2Panel.style.display = 'block';
        });
    }

    // Step 3 -> creates the account for real via /signup
    if (verifyAndFinish) {
        verifyAndFinish.addEventListener('click', async () => {
            if (!validateOtpComplete('#signUpStep3Panel')) return;

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
                        confirmPassword: confirmPasswordInput?.value.trim()
                    })
                });
                const result = await response.json();

                if (result.success) {
                    const fullName = ((firstNameInput?.value || '') + ' ' + (lastNameInput?.value || '')).trim();
                    const namePlaceholder = document.getElementById('successUserPlaceholder');
                    if (fullName && namePlaceholder) namePlaceholder.textContent = fullName;
                    hideAllPanels();
                    if(signUpStep4Panel) signUpStep4Panel.style.display = 'block';
                } else {
                    alert(result.message); // e.g. "Username or email is already taken."
                }
            } catch (err) {
                alert('Could not reach the server. Please try again.');
            }
        });
    }

    if (backToSignIn) backToSignIn.addEventListener('click', showSignInView);

    // ==========================================================================
    // FORGOT PASSWORD ENGINE INTERACTION ROUTING (NOW WITH VALIDATION)
    // ==========================================================================
    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            hideAllPanels();
            if (authToggleBar) authToggleBar.style.display = 'none';
            if(forgotPasswordPanel) forgotPasswordPanel.style.display = 'block';
        });
    }

    // Step 1 -> Step 2 (OTP)
    if (btnForgotProceed) {
        btnForgotProceed.addEventListener('click', () => {
            if (!validateRequiredFields([forgotEmailInput])) return;

            const forgotEmailVal = forgotEmailInput?.value || 'your email';
            document.querySelectorAll('.dynamic-forgot-email').forEach(el => {
                el.textContent = forgotEmailVal;
            });
            hideAllPanels();
            if(forgotOtpPanel) forgotOtpPanel.style.display = 'block';
        });
    }

    // Step 2 -> Step 3 (New Password Fields)
    if (btnVerifyForgotCode) {
        btnVerifyForgotCode.addEventListener('click', () => {
            if (!validateOtpComplete('#forgotOtpPanel')) return;

            hideAllPanels();
            if(setNewPasswordPanel) setNewPasswordPanel.style.display = 'block';
        });
    }

    // Step 3 -> Step 4 (Success Card)
    if (btnResetPassword) {
        btnResetPassword.addEventListener('click', () => {
            if (!validateRequiredFields([forgotNewPasswordInput, forgotConfirmPasswordInput])) return;

            if (forgotNewPasswordInput.value.trim() !== forgotConfirmPasswordInput.value.trim()) {
                showInlineError(forgotConfirmPasswordInput.closest('.password-wrapper'), 'Passwords do not match.');
                return;
            }
            clearInlineError(forgotConfirmPasswordInput.closest('.password-wrapper'));

            hideAllPanels();
            if(forgotSuccessPanel) forgotSuccessPanel.style.display = 'block';
        });
    }

    // Attach global click event to any "Back to log in" link/button
    document.addEventListener('click', (e) => {
        if (e.target.closest('.back-to-login-link') || e.target.closest('.back-to-login-btn')) {
            e.preventDefault();
            showSignInView();
        }
    });

    // 5. Intelligent Auto-Jump OTP Fields Mechanism
    const setupOtpJumping = (containerSelector) => {
        const inputs = document.querySelectorAll(`${containerSelector} .otp-input`);
        inputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                if (e.target.value.length === 1 && index < inputs.length - 1) {
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

    // 6. Sign In Form Submission -> real /login check
    const signInFormElement = document.querySelector('#signInPanel form');
    if (signInFormElement) {
        signInFormElement.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!validateRequiredFields([usernameInput, passwordInput])) return;

            clearInlineError(passwordInput.closest('.password-wrapper'));

            try {
                const response = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: usernameInput.value.trim(),
                        password: passwordInput.value.trim()
                    })
                });
                const result = await response.json();

                if (result.success) {
                    if (authToggleBar) authToggleBar.style.display = 'none';
                    if(signInPanel) signInPanel.style.display = 'none';
                    const successPanel = document.getElementById('signInSuccessPanel');
                    if (successPanel) successPanel.style.display = 'block';
                    setTimeout(() => { window.location.href = 'dashboard.html'; }, 3000);
                } else {
                    showInlineError(passwordInput.closest('.password-wrapper'), result.message);
                }
            } catch (err) {
                showInlineError(passwordInput.closest('.password-wrapper'), 'Could not reach the server. Please try again.');
            }
        });
    }

    // CRITICAL FIX: Run the sign-in initializer view immediately on initial page load!
    showSignInView();
});