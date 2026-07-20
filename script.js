document.addEventListener('DOMContentLoaded', () => {

    // 1. Handle Header Injection
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        fetch('header.html')
            .then(response => response.text())
            .then(data => {
                headerPlaceholder.innerHTML = data;
            })
            .catch(error => console.error('Error loading the header:', error));
    }

    // 2. SVG Paths for the Eye States
    const openEyePath = `<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />`;
    const closedEyePath = `<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 1-4.243-4.243m4.242 4.242L9.88 9.88" />`;

    // 3. Multi-Field Password Toggle Logic
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

    // Step Switching Controls
    const goToStep2 = document.getElementById('goToStep2');
    const proceedToStep3 = document.querySelector('#signUpStep2Panel .btn-next');
    const verifyAndFinish = document.getElementById('btnFinish');
    const backToSignIn = document.getElementById('btnBackToSignIn');
    
    const backToStep1 = document.getElementById('backToStep1');
    const backToStep2 = document.getElementById('backToStep2');

    // Function to completely reset to Sign In view
    function showSignInView() {
        if(authToggleBar) authToggleBar.style.display = 'flex';
        if(signInBtn) signInBtn.classList.add('active');
        if(signUpBtn) signUpBtn.classList.remove('active');
        
        signUpPanel.style.display = 'none';
        signUpStep2Panel.style.display = 'none';
        signUpStep3Panel.style.display = 'none';
        signUpStep4Panel.style.display = 'none';
        if(document.getElementById('signInSuccessPanel')) document.getElementById('signInSuccessPanel').style.display = 'none';
        signInPanel.style.display = 'block';
    }

    // Switch between Main Top Tabs
    if (signInBtn && signUpBtn) {
        signUpBtn.addEventListener('click', () => {
            if(authToggleBar) authToggleBar.style.display = 'flex';
            signInBtn.classList.remove('active');
            signUpBtn.classList.add('active');
            signInPanel.style.display = 'none';
            signUpStep2Panel.style.display = 'none';
            signUpStep3Panel.style.display = 'none';
            signUpStep4Panel.style.display = 'none';
            if(document.getElementById('signInSuccessPanel')) document.getElementById('signInSuccessPanel').style.display = 'none';
            signUpPanel.style.display = 'block';
        });

        signInBtn.addEventListener('click', showSignInView);
    }

    // Step 1 -> Step 2
    if (goToStep2) {
        goToStep2.addEventListener('click', () => {
            signUpPanel.style.display = 'none';
            signUpStep2Panel.style.display = 'block';
        });
    }

    // Step 2 -> Step 3 (Verification Screen)
    if (proceedToStep3) {
        proceedToStep3.addEventListener('click', () => {
            const emailInput = document.getElementById('email');
            const placeholder = document.getElementById('userEmailPlaceholder');
            if (emailInput && emailInput.value && placeholder) {
                placeholder.textContent = emailInput.value;
            }

            signUpStep2Panel.style.display = 'none';
            if (authToggleBar) authToggleBar.style.display = 'none';
            signUpStep3Panel.style.display = 'block';
        });
    }

    // Step 3 -> Step 4 (Success Verified Screen)
    if (verifyAndFinish) {
        verifyAndFinish.addEventListener('click', () => {
            // Combine First Name + Last Name to update success message greeting dynamically
            const fName = document.getElementById('firstName')?.value || '';
            const lName = document.getElementById('lastName')?.value || '';
            const fullName = (fName + ' ' + lName).trim();
            const namePlaceholder = document.getElementById('successUserPlaceholder');
            
            if (fullName && namePlaceholder) {
                namePlaceholder.textContent = fullName;
            }

            signUpStep3Panel.style.display = 'none';
            signUpStep4Panel.style.display = 'block';
        });
    }

    // Success Screen -> Direct Routing Back to Sign In
    if (backToSignIn) {
        backToSignIn.addEventListener('click', showSignInView);
    }

    // Back to Step 1
    if (backToStep1) {
        backToStep1.addEventListener('click', (e) => {
            e.preventDefault();
            signUpStep2Panel.style.display = 'none';
            signUpPanel.style.display = 'block';
        });
    }

    // Back to Step 2
    if (backToStep2) {
        backToStep2.addEventListener('click', (e) => {
            e.preventDefault();
            signUpStep3Panel.style.display = 'none';
            if (authToggleBar) authToggleBar.style.display = 'flex';
            signUpStep2Panel.style.display = 'block';
        });
    }

    // 5. Intelligent Auto-Jump OTP Fields Mechanism
    const otpInputs = document.querySelectorAll('.otp-input');
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && e.target.value.length === 0 && index > 0) {
                otpInputs[index - 1].focus();
            }
        });
    });

    // 6. NEW: Sign In Form Submission Redirect Logic (3-Second Pause)
    const signInFormElement = document.querySelector('#signInPanel form');
    if (signInFormElement) {
        signInFormElement.addEventListener('submit', (e) => {
            e.preventDefault(); 
            
            if (authToggleBar) authToggleBar.style.display = 'none';
            signInPanel.style.display = 'none';
            
            const successPanel = document.getElementById('signInSuccessPanel');
            if (successPanel) successPanel.style.display = 'block';
            
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 3000);
        });
    }
});