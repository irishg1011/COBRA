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

    function setMaxBirthdate() {
        if (!birthdateInput) return;
        const today = new Date();
        const maxDate = new Date(today.getFullYear() - MIN_SIGNUP_AGE, today.getMonth(), today.getDate());
        const yyyy = maxDate.getFullYear();
        const mm = String(maxDate.getMonth() + 1).padStart(2, '0');
        const dd = String(maxDate.getDate()).padStart(2, '0');
        birthdateInput.setAttribute('max', `${yyyy}-${mm}-${dd}`);
    }

    setMaxBirthdate();

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
    window.addEventListener('pageshow', () => {
        showSignInView();
    });
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
                if (signUpStep3Panel) signUpStep3Panel.style.display = 'block';

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
                    clearOtpInputs('#signUpStep3Panel', 'showSignUpOtp');
                    startOtpCountdown(document.getElementById('otpTimerDisplay'), resendOtpLink, true);
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
                    body: JSON.stringify({
                        username: targetUsername,
                        password: passwordInput.value.trim()
                    })
                });
                const result = await response.json();

                if (result.success) {
                    // Clear lockout for this user if they successfully logged in
                    if (window.activeLockouts[targetUsername]) {
                        clearInterval(window.activeLockouts[targetUsername].interval);
                        delete window.activeLockouts[targetUsername];
                    }

                    if (authToggleBar) authToggleBar.style.display = 'none';
                    if (signInPanel) signInPanel.style.display = 'none';
                    const successPanel = document.getElementById('signInSuccessPanel');
                    if (successPanel) successPanel.style.display = 'block';
                    setTimeout(() => { window.location.href = '../templates/dashboard.html'; }, 3000);
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
                    if (forgotOtpPanel) forgotOtpPanel.style.display = 'block';

                    clearOtpInputs('#forgotOtpPanel', 'showForgotOtp');
                    startOtpCountdown(
                        document.getElementById('forgotTimerDisplay'), 
                        document.getElementById('resendForgotLink'),
                        false
                    );
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
                    clearOtpInputs('#forgotOtpPanel', 'showForgotOtp');
                    startOtpCountdown(document.getElementById('forgotTimerDisplay'), resendForgotLink, false);
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
    });

});