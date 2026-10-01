/*
 * edit-profile.js - learner Edit Profile page (/profile/edit)
 * First/last name, username and email. A new email must be verified
 * with a 6-digit code sent to that new address before Save works.
 * Styles: learner/css/account-forms.css
 */
document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const RESEND_SECONDS = 60;

    const form = $('editForm');
    const fields = {
        firstName: $('firstName'),
        lastName: $('lastName'),
        username: $('username'),
        email: $('email'),
    };
    const errors = {
        firstName: $('firstNameError'),
        lastName: $('lastNameError'),
        username: $('usernameError'),
        email: $('emailError'),
    };
    const SERVER_FIELD = { 'First name': 'firstName', 'Last name': 'lastName', username: 'username', email: 'email' };

    const NAME_REGEX = /^[A-Za-z\s'\-.]+$/;
    const USERNAME_REGEX = /^[a-z0-9._]{3,30}$/;
    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    let originalEmail = '';
    let verifiedEmail = null;   // the new email that passed OTP
    let timerId = null;

    // ---------------- helpers ----------------
    function normEmail() {
        return fields.email.value.trim().toLowerCase();
    }

    function capitalizeName(value) {
        return value.toLowerCase().replace(/(^|\s)([a-z])/g, (m, sp, ch) => sp + ch.toUpperCase());
    }

    function showMessage(text, success) {
        const el = $('formMessage');
        el.textContent = text;
        el.classList.toggle('is-success', !!success);
        el.hidden = !text;
    }

    function setError(key, text) {
        errors[key].textContent = text || '';
        errors[key].hidden = !text;
        fields[key].classList.toggle('is-invalid', !!text);
        if (text) fields[key].setAttribute('aria-invalid', 'true');
        else fields[key].removeAttribute('aria-invalid');
    }

    function clearErrors() {
        Object.keys(errors).forEach((k) => setError(k, ''));
        showMessage('');
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

    // ---------------- new-email verification ----------------
    function startResendTimer() {
        const btn = $('resendEmailCodeBtn');
        const label = $('emailTimer');
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

    function refreshVerifyBox() {
        const changed = normEmail() !== originalEmail;
        const box = $('verifyBox');
        box.hidden = !changed;
        if (!changed) return;

        const verified = verifiedEmail === normEmail();
        $('verifyDone').hidden = !verified;
        if (verified) {
            $('verifySendRow').hidden = true;
            $('verifyCodeRow').hidden = true;
        } else if ($('verifyCodeRow').dataset.forEmail !== normEmail()) {
            // Email edited after a code was sent: start over.
            $('verifySendRow').hidden = false;
            $('verifyCodeRow').hidden = true;
            $('emailOtp').value = '';
        }
    }

    async function sendEmailCode() {
        const email = normEmail();
        if (!EMAIL_REGEX.test(email)) {
            setError('email', 'Please enter a valid email address (e.g., name@example.com).');
            return;
        }
        setError('email', '');
        const sendBtn = $('sendEmailCodeBtn');
        const resendBtn = $('resendEmailCodeBtn');
        sendBtn.disabled = true;
        resendBtn.disabled = true;

        const { ok, data } = await postJson('/api/profile/email/send-otp', { email });
        sendBtn.disabled = false;
        if (!ok) {
            setError('email', data.message || 'Could not send the code. Please try again.');
            resendBtn.disabled = false;
            return;
        }
        $('verifySendRow').hidden = true;
        $('verifyCodeRow').hidden = false;
        $('verifyCodeRow').dataset.forEmail = email;
        $('verifyText').textContent = `Enter the 6-digit code we sent to ${email}.`;
        $('emailOtp').focus();
        startResendTimer();
    }

    async function verifyEmailCode() {
        const email = normEmail();
        const otp = $('emailOtp').value.trim();
        if (!/^\d{6}$/.test(otp)) {
            setError('email', 'Enter the 6-digit code from your email.');
            return;
        }
        const btn = $('verifyEmailCodeBtn');
        btn.disabled = true;
        const { ok, data } = await postJson('/api/profile/email/verify-otp', { email, otp });
        btn.disabled = false;
        if (!ok) {
            setError('email', data.message || 'That code did not work. Please try again.');
            return;
        }
        setError('email', '');
        verifiedEmail = email;
        clearInterval(timerId);
        $('verifyText').textContent = 'Your new email is verified. Press Save Changes to finish.';
        refreshVerifyBox();
    }

    // ---------------- validation + save ----------------
    function validate() {
        let valid = true;
        [['firstName', 'First name'], ['lastName', 'Last name']].forEach(([key, label]) => {
            const v = fields[key].value.trim();
            if (!v) { setError(key, `${label} is required.`); valid = false; }
            else if (!NAME_REGEX.test(v)) {
                setError(key, `${label} may only contain letters, spaces, hyphens, and apostrophes.`);
                valid = false;
            }
        });
        if (!USERNAME_REGEX.test(fields.username.value.trim())) {
            setError('username', '3-30 characters: letters, numbers, dots or underscores only.');
            valid = false;
        }
        const email = normEmail();
        if (!EMAIL_REGEX.test(email)) {
            setError('email', 'Please enter a valid email address (e.g., name@example.com).');
            valid = false;
        } else if (email !== originalEmail && verifiedEmail !== email) {
            setError('email', 'Verify your new email with the code before saving.');
            valid = false;
        }
        return valid;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();
        fields.firstName.value = capitalizeName(fields.firstName.value.trim());
        fields.lastName.value = capitalizeName(fields.lastName.value.trim());
        if (!validate()) return;

        const btn = $('saveProfileBtn');
        btn.disabled = true;
        const { ok, data } = await postJson('/api/profile/update', {
            firstName: fields.firstName.value.trim(),
            lastName: fields.lastName.value.trim(),
            username: fields.username.value.trim().toLowerCase(),
            email: normEmail(),
        });
        btn.disabled = false;

        if (!ok) {
            const key = SERVER_FIELD[data.field];
            if (key) setError(key, data.message);
            else showMessage(data.message || 'Your changes could not be saved. Please try again.');
            return;
        }

        const profile = data.profile;
        fields.firstName.value = profile.first_name;
        fields.lastName.value = profile.last_name;
        fields.username.value = profile.username;
        fields.email.value = profile.email;
        originalEmail = profile.email;
        verifiedEmail = null;
        refreshVerifyBox();
        showMessage('Profile updated.', true);
        if (window.cobraByteProfileMenu) window.cobraByteProfileMenu.renderName(profile);
    });

    // ---------------- events ----------------
    fields.username.addEventListener('input', () => {
        const pos = fields.username.selectionStart;
        fields.username.value = fields.username.value.toLowerCase().replace(/\s/g, '');
        fields.username.setSelectionRange(pos, pos);
    });
    ['firstName', 'lastName'].forEach((key) => {
        fields[key].addEventListener('blur', () => {
            fields[key].value = capitalizeName(fields[key].value.trim());
        });
    });
    fields.email.addEventListener('input', () => {
        setError('email', '');
        refreshVerifyBox();
    });
    $('sendEmailCodeBtn').addEventListener('click', sendEmailCode);
    $('resendEmailCodeBtn').addEventListener('click', sendEmailCode);
    $('verifyEmailCodeBtn').addEventListener('click', verifyEmailCode);
    $('emailOtp').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });
    $('emailOtp').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); verifyEmailCode(); }
    });

    // ---------------- load ----------------
    fetch('/api/profile/me', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
            if (!data || !data.success) throw new Error();
            const p = data.profile;
            fields.firstName.value = p.first_name;
            fields.lastName.value = p.last_name;
            fields.username.value = p.username;
            fields.email.value = p.email;
            originalEmail = (p.email || '').toLowerCase();
            $('editLoading').hidden = true;
            form.hidden = false;
        })
        .catch(() => {
            $('editLoading').textContent = 'Your details could not be loaded. Refresh the page to try again.';
        });
});