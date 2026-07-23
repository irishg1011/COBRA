/* ==========================================================================
   AUTH TIMERS & OTP MODULE
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // --- OTP MASKING & CHECKBOX BINDING ---
    window.configureOtpInputs = function(containerSelector, checkboxId) {
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

    window.validateOtpComplete = function(containerSelector) {
        const inputs = document.querySelectorAll(`${containerSelector} .otp-input`);
        const complete = [...inputs].every(input => input.value.trim() !== '');
        if (!complete) {
            alert('Please enter the complete 6-digit code.');
            setOtpBoxesState(containerSelector, false, false);
        }
        return complete;
    };

    window.clearOtpInputs = function(containerSelector, checkboxId) {
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
    };

    window.setupOtpJumping = function(containerSelector) {
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

    // --- COUNTDOWN TIMERS ---
    window.signUpOtpExpired = false;
    window.forgotOtpExpired = false;

    window.startOtpCountdown = function(timerDisplayEl, resendLinkEl, isSignUp = true) {
        if (!timerDisplayEl) return;

        if (timerDisplayEl.intervalId) clearInterval(timerDisplayEl.intervalId);

        let timeLeft = 60;
        if (isSignUp) window.signUpOtpExpired = false;
        else window.forgotOtpExpired = false;

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
                if (isSignUp) window.signUpOtpExpired = true;
                else window.forgotOtpExpired = true;

                if (resendLinkEl) {
                    resendLinkEl.style.pointerEvents = 'auto';
                    resendLinkEl.style.opacity = '1';
                    resendLinkEl.style.cursor = 'pointer';
                }
            } else {
                timeLeft--;
            }
        }, 1000);
    };

});