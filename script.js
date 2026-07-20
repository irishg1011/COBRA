document.addEventListener('DOMContentLoaded', () => {

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

    // Registration step routing handlers
    if (goToStep2) goToStep2.addEventListener('click', () => { hideAllPanels(); if(signUpStep2Panel) signUpStep2Panel.style.display = 'block'; });
    if (backToStep1) backToStep1.addEventListener('click', (e) => { e.preventDefault(); hideAllPanels(); if(signUpPanel) signUpPanel.style.display = 'block'; });
    
    if (proceedToStep3) {
        proceedToStep3.addEventListener('click', () => {
            const emailInput = document.getElementById('email');
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
    if (verifyAndFinish) {
        verifyAndFinish.addEventListener('click', () => {
            const fullName = ((document.getElementById('firstName')?.value || '') + ' ' + (document.getElementById('lastName')?.value || '')).trim();
            const namePlaceholder = document.getElementById('successUserPlaceholder');
            if (fullName && namePlaceholder) namePlaceholder.textContent = fullName;
            hideAllPanels();
            if(signUpStep4Panel) signUpStep4Panel.style.display = 'block';
        });
    }
    if (backToSignIn) backToSignIn.addEventListener('click', showSignInView);

    // ==========================================================================
    // FORGOT PASSWORD ENGINE INTERACTION ROUTING
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
            const forgotEmailVal = document.getElementById('forgotEmail')?.value || 'your email';
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
            hideAllPanels();
            if(setNewPasswordPanel) setNewPasswordPanel.style.display = 'block';
        });
    }

    // Step 3 -> Step 4 (Success Card)
    if (btnResetPassword) {
        btnResetPassword.addEventListener('click', () => {
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

    // 6. Sign In Form Submission Redirect Logic (3-Second Pause)
    const signInFormElement = document.querySelector('#signInPanel form');
    if (signInFormElement) {
        signInFormElement.addEventListener('submit', (e) => {
            e.preventDefault(); 
            if (authToggleBar) authToggleBar.style.display = 'none';
            if(signInPanel) signInPanel.style.display = 'none';
            const successPanel = document.getElementById('signInSuccessPanel');
            if (successPanel) successPanel.style.display = 'block';
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 3000);
        });
    }

    // CRITICAL FIX: Run the sign-in initializer view immediately on initial page load!
    showSignInView();
});