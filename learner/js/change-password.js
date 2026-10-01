/*
 * change-password.js - learner Change Password page (/profile/change-password)
 * Same 3 steps as the login page's Forgot Password (send code -> enter
 * code -> new password), but the code always goes to the logged-in
 * account's own email, so the learner never types an email here.
 * Styles: learner/css/account-forms.css
 */
document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const RESEND_SECONDS = 60;
    const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_,.?":{}|<>]).{8,}$/;
    const RULES = {
        length: (v) => v.length >= 8,
        upper: (v) => /[A-Z]/.test(v),
        lower: (v) => /[a-z]/.test(v),
        number: (v) => /\d/.test(v),
        special: (v) => /[!@#$%^&*()_,.?":{}|<>]/.test(v),
    };

    let timerId = null;

    function showMessage(text, success) {
        const el = $('pwMessage');
        el.textContent = text || '';
        el.classList.toggle('is-success', !!success);
        el.hidden = !text;
    }

    function goToStep(step) {
        document.querySelectorAll('.pw-panel').forEach((p) => {
            p.hidden = p.dataset.step !== String(step);
        });
        const n = step === 'done' ? 4 : Number(step);
        document.querySelectorAll('.pw-step').forEach((dot) => {
            const d = Number(dot.dataset.stepDot);
            dot.classList.toggle('is-current', d === n);
            dot.classList.toggle('is-done', d < n);
        });
        showMessage('');
        const focusMap = { 2: 'pwOtp', 3: 'newPassword' };
        if (focusMap[step]) $(focusMap[step]).focus();
    }

    async function postJson(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
        });
        let data = {};
        try { data = await res.json(); } catch (e) { /* non-JSON */ }
        return { ok: res.ok && data.success, data };
    }

    function startResendTimer() {
        const btn = $('resendCodeBtn');
        const label = $('codeTimer');
        let left = RESEND_SECONDS;
        btn.disabled = true;
        label.textContent = `(${left}s)`;
        clearInterval(timerId);
        timerId = setInterval(() => {
            left -= 1;
            if (left <= 0) {
                clearInterval(timerId);
                btn.disabled = false;
                label.textContent = '';
            } else {
                label.textContent = `(${left}s)`;
            }
        }, 1000);
    }

    // ---------------- Step 1 / resend ----------------
    async function sendCode(fromResend) {
        const btn = fromResend ? $('resendCodeBtn') : $('sendCodeBtn');
        btn.disabled = true;
        const { ok, data } = await postJson('/api/profile/password/send-otp');
        if (!ok) {
            btn.disabled = false;
            showMessage(data.message || 'The code could not be sent. Please try again.');
            return;
        }
        if (!fromResend) goToStep(2);
        $('codeSentText').textContent = data.message || 'Enter the 6-digit code we sent to your email.';
        $('pwOtp').value = '';
        if (fromResend) showMessage('A new code is on its way.', true);
        startResendTimer();
        $('sendCodeBtn').disabled = false;
    }

    // ---------------- Step 2 ----------------
    async function verifyCode() {
        const otp = $('pwOtp').value.trim();
        if (!/^\d{6}$/.test(otp)) {
            showMessage('Enter the 6-digit code from your email.');
            return;
        }
        const btn = $('verifyCodeBtn');
        btn.disabled = true;
        const { ok, data } = await postJson('/api/profile/password/verify-otp', { otp });
        btn.disabled = false;
        if (!ok) {
            showMessage(data.message || 'That code did not work. Please try again.');
            return;
        }
        clearInterval(timerId);
        goToStep(3);
    }

    // ---------------- Step 3 ----------------
    function updateRules() {
        const value = $('newPassword').value;
        document.querySelectorAll('#pwRules li').forEach((li) => {
            li.classList.toggle('is-met', RULES[li.dataset.rule](value));
        });
    }

    async function updatePassword() {
        const newPassword = $('newPassword').value;
        const confirmPassword = $('confirmPassword').value;
        if (!PASSWORD_REGEX.test(newPassword)) {
            showMessage('Your new password needs every item in the list above.');
            return;
        }
        if (newPassword !== confirmPassword) {
            showMessage('The two passwords do not match.');
            return;
        }
        const btn = $('updatePasswordBtn');
        btn.disabled = true;
        const { ok, data } = await postJson('/api/profile/password/reset', { newPassword, confirmPassword });
        btn.disabled = false;
        if (!ok) {
            showMessage(data.message || 'Your password could not be updated. Please try again.');
            if (/send a new code/i.test(data.message || '')) goToStep(1);
            return;
        }
        goToStep('done');
    }

    // ---------------- events ----------------
    $('sendCodeBtn').addEventListener('click', () => sendCode(false));
    $('resendCodeBtn').addEventListener('click', () => sendCode(true));
    $('verifyCodeBtn').addEventListener('click', verifyCode);
    $('updatePasswordBtn').addEventListener('click', updatePassword);
    $('newPassword').addEventListener('input', updateRules);
    $('pwOtp').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });
    $('pwOtp').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyCode();
    });
    $('confirmPassword').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') updatePassword();
    });

    document.querySelectorAll('.pw-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = $(btn.dataset.toggle);
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            btn.querySelector('i').className = show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
        });
    });

    // Masked email for step 1
    fetch('/api/profile/me', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
            if (data && data.success) $('maskedEmail').textContent = data.profile.masked_email;
        })
        .catch(() => { /* keeps "your email" */ });
});