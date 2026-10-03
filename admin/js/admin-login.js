/**
 * admin-login.js - Staff sign in + forgot password (feat/admin-login-page)
 * --------------------------------------------------------------------------
 * Drives admin-login.html. Same behavior as the learner login (script.js),
 * minus Sign Up:
 *   Sign In -> Sign In Successful -> the role's home (server's data.redirect:
 *   Admin -> /admin/dashboard, Mentor -> mentor home; feat/mentor-role)
 *   Forgot password -> Verify code (1:00) -> Set New Password -> Success
 * with the same 5-try lockout countdown, password checklist, match
 * indicator, show/hide code, and snake animations (animations.css).
 *
 * Every call is same-origin (relative URLs) so the session cookie always
 * goes along - no more :5000 / :5500 mix-ups:
 *   POST /admin/login
 *   POST /admin/forgot-password/send-otp | verify-otp | reset-password
 * All rules are enforced on the server (auth_core.py); this file only
 * gives instant feedback.
 */
(function () {
    "use strict";

    const OTP_SECONDS = 300;
    const REDIRECT_DELAY_MS = 1800;
    const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_,.?":{}|<>]).{8,}$/;

    const OPEN_EYE = '<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />';
    const CLOSED_EYE = '<path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 1-4.243-4.243m4.242 4.242L9.88 9.88" />';

    document.addEventListener("DOMContentLoaded", () => {
        const $ = (id) => document.getElementById(id);

        const panels = {
            signIn: $("signInPanel"),
            signInSuccess: $("signInSuccessPanel"),
            forgot: $("forgotPasswordPanel"),
            otp: $("forgotOtpPanel"),
            setPassword: $("setNewPasswordPanel"),
            resetSuccess: $("forgotSuccessPanel"),
        };

        const usernameInput = $("username");
        const passwordInput = $("password");
        const loginBtn = $("btnAdminLogin");
        const forgotEmailInput = $("forgotEmail");
        const proceedBtn = $("btnForgotProceed");
        const otpWrapper = $("forgotOtpWrapper");
        const otpInputs = Array.from(document.querySelectorAll("#forgotOtpPanel .otp-input"));
        const showOtpToggle = $("showForgotOtp");
        const timerDisplay = $("forgotTimerDisplay");
        const resendLink = $("resendForgotLink");
        const verifyBtn = $("btnVerifyForgotCode");
        const newPasswordInput = $("forgotNewPassword");
        const confirmPasswordInput = $("forgotConfirmPassword");
        const resetBtn = $("btnResetPassword");

        let otpTimer = null;
        let otpExpired = false;

        // Nothing on this page should ever do a real form submit.
        document.querySelectorAll(".auth-form").forEach((form) => {
            form.addEventListener("submit", (e) => e.preventDefault());
        });

        // ============================================================
        // Small helpers
        // ============================================================
        async function postJson(url, body) {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify(body),
            });
            const data = await response.json().catch(() => ({ success: false, message: "Unexpected server response." }));
            return { response, data };
        }

        // Fields glide in (animations.css .panel-animate-in). 'back' = from the left.
        function showPanel(panel, direction = "forward") {
            Object.values(panels).forEach((p) => {
                if (p) p.classList.add("auth-hidden");
            });
            if (!panel) return;
            panel.classList.remove("auth-hidden", "panel-animate-in", "panel-from-left");
            void panel.offsetWidth;
            panel.classList.add("panel-animate-in");
            if (direction === "back") panel.classList.add("panel-from-left");
        }

        function errorFieldOf(anchor) {
            if (!anchor) return null;
            return anchor.matches("input") ? anchor : anchor.querySelector("input");
        }

        // Red message right after `anchor` + calm red outline on the field.
        function showInlineError(anchor, message) {
            if (!anchor) return;
            let errorEl = anchor.parentElement.querySelector(".js-error-message");
            if (!errorEl) {
                errorEl = document.createElement("p");
                errorEl.className = "js-error-message";
                errorEl.setAttribute("role", "alert");
                anchor.insertAdjacentElement("afterend", errorEl);
            }
            errorEl.textContent = message;
            const field = errorFieldOf(anchor);
            if (field && !field.classList.contains("auth-input-error")) {
                field.classList.add("auth-input-error");
                field.addEventListener("input", () => field.classList.remove("auth-input-error"), { once: true });
            }
        }

        function clearInlineError(anchor) {
            if (!anchor) return;
            const errorEl = anchor.parentElement.querySelector(".js-error-message");
            if (errorEl) errorEl.remove();
            const field = errorFieldOf(anchor);
            if (field) field.classList.remove("auth-input-error");
        }

        // Error line for places without a single field (the code boxes).
        function showBlockError(afterEl, message) {
            let errorEl = afterEl.parentElement.querySelector(".al-error");
            if (!errorEl) {
                errorEl = document.createElement("p");
                errorEl.className = "js-error-message al-error";
                errorEl.setAttribute("role", "alert");
                afterEl.insertAdjacentElement("afterend", errorEl);
            }
            errorEl.textContent = message;
        }

        function clearBlockError(afterEl) {
            const errorEl = afterEl && afterEl.parentElement.querySelector(".al-error");
            if (errorEl) errorEl.remove();
        }

        function requireFilled(fields) {
            for (const field of fields) {
                if (!field.value.trim()) {
                    field.setCustomValidity("Please fill out this field.");
                    field.reportValidity();
                    field.focus();
                    field.addEventListener("input", () => field.setCustomValidity(""), { once: true });
                    return false;
                }
            }
            return true;
        }

        // Ouroboros spinner (animations.css restyles .btn-spinner)
        function setButtonLoading(button, text) {
            if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
            button.disabled = true;
            button.classList.add("btn-loading");
            button.innerHTML = `<span class="btn-spinner"></span><span>${text}</span>`;
        }

        function resetButtonLoading(button) {
            button.disabled = false;
            button.classList.remove("btn-loading");
            if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
        }

        // ============================================================
        // Typing rules (same as the learner login)
        // ============================================================
        usernameInput.addEventListener("input", () => {
            usernameInput.value = usernameInput.value.toLowerCase().replace(/[^a-z0-9@_]/g, "");
        });
        forgotEmailInput.addEventListener("input", () => {
            forgotEmailInput.value = forgotEmailInput.value.toLowerCase().replace(/[^a-z0-9@._-]/g, "");
        });

        // Show / hide password
        document.addEventListener("click", (e) => {
            const toggle = e.target.closest(".toggle-password-visibility");
            if (!toggle) return;
            e.preventDefault();
            const input = toggle.parentElement.querySelector("input");
            if (!input) return;
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
            const svg = toggle.querySelector("svg");
            if (svg) svg.innerHTML = show ? CLOSED_EYE : OPEN_EYE;
        });

        // ============================================================
        // SIGN IN (with the per-username lockout countdown)
        // ============================================================
        const lockouts = {}; // username -> { timeLeft, interval }
        const passwordAnchor = passwordInput.closest(".password-wrapper");

        function formatClock(seconds) {
            const s = Math.max(0, seconds);
            return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        }

        function syncLockoutUI() {
            const user = usernameInput.value.trim();
            const lock = user ? lockouts[user] : null;
            if (lock) {
                loginBtn.disabled = true;
                showInlineError(passwordAnchor, `Too many failed attempts. Please try again in ${formatClock(lock.timeLeft)}.`);
            } else {
                loginBtn.disabled = false;
                clearInlineError(passwordAnchor);
            }
        }

        function startLockout(user, seconds) {
            if (lockouts[user]) clearInterval(lockouts[user].interval);
            const lock = { timeLeft: seconds, interval: null };
            lockouts[user] = lock;
            lock.interval = setInterval(() => {
                lock.timeLeft -= 1;
                if (lock.timeLeft < 0) {
                    clearInterval(lock.interval);
                    delete lockouts[user];
                }
                if (usernameInput.value.trim() === user) syncLockoutUI();
            }, 1000);
            syncLockoutUI();
        }

        usernameInput.addEventListener("input", syncLockoutUI);

        async function signIn() {
            if (!requireFilled([usernameInput, passwordInput])) return;
            const user = usernameInput.value.trim();
            if (lockouts[user]) { syncLockoutUI(); return; }
            clearInlineError(passwordAnchor);

            setButtonLoading(loginBtn, "Signing in...");
            let result;
            try {
                result = await postJson("/admin/login", { username: user, password: passwordInput.value });
            } catch (err) {
                resetButtonLoading(loginBtn);
                showInlineError(passwordAnchor, "Could not reach the server. Please try again.");
                return;
            }
            const { response, data } = result;
            resetButtonLoading(loginBtn);

            if (data.success) {
                showPanel(panels.signInSuccess);
                setTimeout(() => window.location.replace(data.redirect || "/admin/login"), REDIRECT_DELAY_MS);
                return;
            }

            passwordInput.value = "";
            if (response.status === 423) {
                startLockout(user, data.remaining_seconds || 60);
                return;
            }
            showInlineError(passwordAnchor, data.message || "Could not sign in.");
        }

        loginBtn.addEventListener("click", signIn);

        // ============================================================
        // FORGOT PASSWORD
        // ============================================================
        function resetForgotFlow() {
            [forgotEmailInput, newPasswordInput, confirmPasswordInput].forEach((input) => {
                input.value = "";
                if (input.type === "text" && input !== forgotEmailInput) input.type = "password";
            });
            clearInlineError(forgotEmailInput);
            clearInlineError(newPasswordInput.closest(".password-wrapper"));
            clearInlineError(confirmPasswordInput.closest(".password-wrapper"));
            clearOtp();
            $("forgotNewPassword-checker").classList.add("auth-hidden");
            const match = $("forgotConfirmPassword-match");
            match.classList.add("auth-hidden");
            match.textContent = "";
            if (otpTimer) clearInterval(otpTimer);
        }

        function showSignIn(direction = "forward") {
            resetForgotFlow();
            passwordInput.value = "";
            clearInlineError(passwordAnchor);
            syncLockoutUI();
            showPanel(panels.signIn, direction);
        }

        $("openForgotLink").addEventListener("click", (e) => {
            e.preventDefault();
            resetForgotFlow();
            showPanel(panels.forgot);
            forgotEmailInput.focus();
        });

        document.querySelectorAll(".back-to-login-link, .back-to-login-btn").forEach((link) => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                showSignIn("back");
            });
        });

        function startOtpCountdown() {
            if (otpTimer) clearInterval(otpTimer);
            let timeLeft = OTP_SECONDS;
            otpExpired = false;
            timerDisplay.textContent = formatClock(timeLeft);
            resendLink.classList.add("resend-link--disabled");
            otpTimer = setInterval(() => {
                timeLeft -= 1;
                timerDisplay.textContent = formatClock(timeLeft);
                if (timeLeft <= 0) {
                    clearInterval(otpTimer);
                    otpExpired = true;
                    resendLink.classList.remove("resend-link--disabled");
                }
            }, 1000);
        }

        async function sendCode(isResend) {
            const email = forgotEmailInput.value.trim();
            const button = isResend ? null : proceedBtn;
            if (button) setButtonLoading(button, "Sending code...");
            try {
                const { data } = await postJson("/admin/forgot-password/send-otp", { email });
                if (!data.success) {
                    if (isResend) showBlockError(otpWrapper, data.message);
                    else showInlineError(forgotEmailInput, data.message);
                    return false;
                }
                return true;
            } catch (err) {
                const msg = "Could not reach the server. Please try again.";
                if (isResend) showBlockError(otpWrapper, msg);
                else showInlineError(forgotEmailInput, msg);
                return false;
            } finally {
                if (button) resetButtonLoading(button);
            }
        }

        proceedBtn.addEventListener("click", async () => {
            clearInlineError(forgotEmailInput);
            if (!requireFilled([forgotEmailInput])) return;
            const email = forgotEmailInput.value.trim();
            if (!EMAIL_REGEX.test(email)) {
                showInlineError(forgotEmailInput, "Please enter a valid email address (e.g., name@example.com).");
                return;
            }
            if (!(await sendCode(false))) return;

            document.querySelectorAll(".dynamic-forgot-email").forEach((el) => { el.textContent = email; });
            clearOtp();
            showPanel(panels.otp);
            startOtpCountdown();
            otpInputs[0].focus();
        });

        resendLink.addEventListener("click", async (e) => {
            e.preventDefault();
            if (resendLink.classList.contains("resend-link--disabled")) return;
            resendLink.classList.add("resend-link--disabled");
            const original = resendLink.textContent;
            resendLink.textContent = "Sending code...";
            clearBlockError(otpWrapper);
            const ok = await sendCode(true);
            resendLink.textContent = original;
            if (ok) {
                clearOtp();
                startOtpCountdown();
                otpInputs[0].focus();
            } else {
                resendLink.classList.remove("resend-link--disabled");
            }
        });

        // --- Code boxes: masked, auto-advance, backspace back, paste all 6 ---
        function clearOtp() {
            otpInputs.forEach((input) => {
                input.value = "";
                input.type = "password";
                input.classList.remove("otp-input--correct", "otp-input--wrong");
            });
            showOtpToggle.checked = false;
            clearBlockError(otpWrapper);
        }

        function markOtp(isCorrect) {
            otpInputs.forEach((input) => {
                input.classList.toggle("otp-input--correct", isCorrect);
                input.classList.toggle("otp-input--wrong", !isCorrect);
                if (!isCorrect) input.value = "";
            });
            if (!isCorrect) otpInputs[0].focus();
        }

        showOtpToggle.addEventListener("change", () => {
            otpInputs.forEach((input) => { input.type = showOtpToggle.checked ? "text" : "password"; });
        });

        otpInputs.forEach((input, index) => {
            input.placeholder = "X";
            input.addEventListener("input", () => {
                input.value = input.value.replace(/\D/g, "").slice(0, 1);
                input.classList.remove("otp-input--correct", "otp-input--wrong");
                clearBlockError(otpWrapper);
                if (input.value && index < otpInputs.length - 1) otpInputs[index + 1].focus();
            });
            input.addEventListener("keydown", (e) => {
                if (e.key === "Backspace" && !input.value && index > 0) otpInputs[index - 1].focus();
            });
            input.addEventListener("paste", (e) => {
                const digits = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, otpInputs.length);
                if (!digits) return;
                e.preventDefault();
                digits.split("").forEach((d, i) => { otpInputs[i].value = d; });
                otpInputs[Math.min(digits.length, otpInputs.length - 1)].focus();
            });
        });

        verifyBtn.addEventListener("click", async () => {
            clearBlockError(otpWrapper);
            if (otpExpired) {
                markOtp(false);
                showBlockError(otpWrapper, "Your code has expired. Click 'Resend code' to get a new one.");
                return;
            }
            const code = otpInputs.map((i) => i.value).join("");
            if (code.length !== otpInputs.length) {
                showBlockError(otpWrapper, "Please enter the complete 6-digit code.");
                return;
            }

            setButtonLoading(verifyBtn, "Verifying...");
            try {
                const { data } = await postJson("/admin/forgot-password/verify-otp", {
                    email: forgotEmailInput.value.trim(),
                    otp: code,
                });
                if (data.success) {
                    markOtp(true);
                    if (otpTimer) clearInterval(otpTimer);
                    setTimeout(() => {
                        showPanel(panels.setPassword);
                        newPasswordInput.focus();
                    }, 400);
                } else {
                    markOtp(false);
                    showBlockError(otpWrapper, data.message || "Invalid verification code.");
                }
            } catch (err) {
                showBlockError(otpWrapper, "Could not reach the server. Please try again.");
            } finally {
                resetButtonLoading(verifyBtn);
            }
        });

        // --- New password: live checklist + match indicator ---
        const checker = $("forgotNewPassword-checker");
        const rules = [
            ["forgot-req-length", (v) => v.length >= 8, "Requires at least 8 characters"],
            ["forgot-req-upper", (v) => /[A-Z]/.test(v), "Requires an uppercase letter (A-Z)"],
            ["forgot-req-lower", (v) => /[a-z]/.test(v), "Requires a lowercase letter (a-z)"],
            ["forgot-req-number", (v) => /[0-9]/.test(v), "Requires a number (0-9)"],
            ["forgot-req-special", (v) => /[!@#$%^&*()_,.?":{}|<>]/.test(v), "Requires a special character (!@#$%^&*_)"],
        ];

        function updateChecklist() {
            const value = newPasswordInput.value;
            rules.forEach(([id, test, label]) => {
                const met = test(value);
                const el = $(id);
                el.textContent = `${met ? "✓" : "✗"} ${label}`;
                el.classList.toggle("password-req--met", met);
            });
        }

        newPasswordInput.addEventListener("focus", () => { checker.classList.remove("auth-hidden"); updateChecklist(); });
        newPasswordInput.addEventListener("input", () => { checker.classList.remove("auth-hidden"); updateChecklist(); });
        newPasswordInput.addEventListener("blur", () => checker.classList.add("auth-hidden"));

        const matchIndicator = $("forgotConfirmPassword-match");
        function updateMatch() {
            clearInlineError(confirmPasswordInput.closest(".password-wrapper"));
            if (!confirmPasswordInput.value) {
                matchIndicator.classList.add("auth-hidden");
                return;
            }
            const ok = newPasswordInput.value === confirmPasswordInput.value;
            matchIndicator.classList.remove("auth-hidden");
            matchIndicator.textContent = ok ? "✓ Passwords match" : "✗ Passwords do not match";
            matchIndicator.classList.toggle("password-match--ok", ok);
            matchIndicator.classList.toggle("password-match--bad", !ok);
        }
        confirmPasswordInput.addEventListener("input", updateMatch);
        newPasswordInput.addEventListener("input", () => { if (confirmPasswordInput.value) updateMatch(); });

        resetBtn.addEventListener("click", async () => {
            const confirmAnchor = confirmPasswordInput.closest(".password-wrapper");
            clearInlineError(confirmAnchor);
            if (!requireFilled([newPasswordInput, confirmPasswordInput])) return;

            const pwd = newPasswordInput.value.trim();
            const confirmPwd = confirmPasswordInput.value.trim();
            const errors = [];
            if (!STRONG_PASSWORD.test(pwd)) errors.push("Password does not meet the strength requirements.");
            if (pwd !== confirmPwd) errors.push("Passwords do not match.");
            if (errors.length) {
                matchIndicator.classList.add("auth-hidden");
                showInlineError(confirmAnchor, errors.join(" "));
                return;
            }

            setButtonLoading(resetBtn, "Resetting...");
            try {
                const { data } = await postJson("/admin/forgot-password/reset-password", {
                    email: forgotEmailInput.value.trim(),
                    newPassword: pwd,
                    confirmPassword: confirmPwd,
                });
                if (data.success) {
                    showPanel(panels.resetSuccess);
                } else {
                    matchIndicator.classList.add("auth-hidden");
                    showInlineError(confirmAnchor, data.message || "Could not reset your password.");
                }
            } catch (err) {
                showInlineError(confirmAnchor, "Could not reach the server. Please try again.");
            } finally {
                resetButtonLoading(resetBtn);
            }
        });

        // ============================================================
        // Enter key: next field, then the panel's main button
        // ============================================================
        const panelButtons = new Map([
            [panels.signIn, loginBtn],
            [panels.forgot, proceedBtn],
            [panels.otp, verifyBtn],
            [panels.setPassword, resetBtn],
        ]);

        document.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            const active = document.activeElement;
            if (!active || active.tagName !== "INPUT" || active.type === "checkbox") return;
            const panel = active.closest(".al-panel");
            if (!panel || !panelButtons.has(panel)) return;
            e.preventDefault();

            const fields = Array.from(panel.querySelectorAll("input:not([type='checkbox'])"))
                .filter((el) => !el.disabled && el.offsetParent !== null);
            const index = fields.indexOf(active);
            const isOtp = active.classList.contains("otp-input");
            if (!isOtp && index > -1 && index < fields.length - 1) {
                fields[index + 1].focus();
                return;
            }
            const button = panelButtons.get(panel);
            if (button && !button.disabled) button.click();
        });

        // ============================================================
        // Snake border (once, after load) - same as the learner login
        // ============================================================
        const snakeTrace = $("snakeTrace");
        const snakeRect = $("snakeTraceRect");
        const card = document.querySelector(".auth-card");

        function runSnakeTrace() {
            if (!snakeTrace || !snakeRect || !card) return;
            const w = card.offsetWidth;
            const h = card.offsetHeight;
            snakeTrace.setAttribute("viewBox", `0 0 ${w + 8} ${h + 8}`);
            snakeRect.setAttribute("width", w + 4);
            snakeRect.setAttribute("height", h + 4);
            snakeTrace.classList.remove("is-running");
            void snakeTrace.getBoundingClientRect();
            snakeTrace.classList.add("is-running");
        }

        // Fresh Sign In every time the page is shown (incl. Back / bfcache).
        window.addEventListener("pageshow", () => showSignIn());
        window.addEventListener("load", () => requestAnimationFrame(runSnakeTrace), { once: true });
    });
})();
