/**
 * admin-change-password.js - Change Password for staff (Admin + Mentor)
 * --------------------------------------------------------------------
 * feat/staff-change-password  (staff-change-password.html)
 *
 * Same 3 steps as the learner's Profile > Change Password:
 *   1. Send code       POST /admin/profile/password/send-otp
 *   2. Enter code      POST /admin/profile/password/verify-otp   { otp }
 *   3. New password    POST /admin/profile/password/reset        { newPassword, confirmPassword }
 *
 * The code always goes to the logged-in account's own email, so no
 * email is typed or sent from here. The server checks every rule again
 * (auth_core.py through staff_password.py) - the checks here only save
 * a round trip.
 * Styles: css/staff-change-password.css
 */
(function () {
    "use strict";

    const BASE_URL = "/admin/profile/password";
    const RESEND_SECONDS = 60;
    const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_,.?":{}|<>]).{8,}$/;
    const RULES = {
        length: (v) => v.length >= 8,
        upper: (v) => /[A-Z]/.test(v),
        lower: (v) => /[a-z]/.test(v),
        number: (v) => /\d/.test(v),
        special: (v) => /[!@#$%^&*()_,.?":{}|<>]/.test(v),
    };

    document.addEventListener("DOMContentLoaded", () => {
        const $ = (id) => document.getElementById(id);

        const sendBtn = $("staffPwSendBtn");
        if (!sendBtn) return;

        const resendBtn = $("staffPwResendBtn");
        const verifyBtn = $("staffPwVerifyBtn");
        const updateBtn = $("staffPwUpdateBtn");
        const otpInput = $("staffPwOtp");
        const newInput = $("staffPwNew");
        const confirmInput = $("staffPwConfirm");
        const sentText = $("staffPwSentText");
        const timerLabel = $("staffPwTimer");
        const message = $("staffPwMessage");
        const panels = Array.from(document.querySelectorAll(".staff-pw-panel"));
        const dots = Array.from(document.querySelectorAll(".staff-pw-step"));
        const ruleItems = Array.from(document.querySelectorAll("#staffPwRules li"));

        let timerId = null;

        function showMessage(text, success) {
            message.textContent = text || "";
            message.classList.toggle("is-success", Boolean(success));
        }

        function goToStep(step) {
            panels.forEach((panel) => panel.classList.toggle("is-hidden", panel.dataset.step !== String(step)));
            const n = step === "done" ? 4 : Number(step);
            dots.forEach((dot) => {
                const d = Number(dot.dataset.stepDot);
                dot.classList.toggle("is-current", d === n);
                dot.classList.toggle("is-done", d < n);
            });
            showMessage("");
            if (step === 2) otpInput.focus();
            if (step === 3) newInput.focus();
        }

        async function postJson(path, body) {
            try {
                const response = await fetch(`${BASE_URL}/${path}`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
                    body: JSON.stringify(body || {}),
                });
                const data = await response.json().catch(() => ({}));
                return { ok: response.ok && data.success === true, data };
            } catch (err) {
                console.error("admin-change-password: request failed:", err);
                return { ok: false, data: { message: "Could not reach the server. Check your connection and try again." } };
            }
        }

        function startResendTimer() {
            let left = RESEND_SECONDS;
            resendBtn.disabled = true;
            timerLabel.textContent = `(${left}s)`;
            clearInterval(timerId);
            timerId = setInterval(() => {
                left -= 1;
                if (left <= 0) {
                    clearInterval(timerId);
                    resendBtn.disabled = false;
                    timerLabel.textContent = "";
                } else {
                    timerLabel.textContent = `(${left}s)`;
                }
            }, 1000);
        }

        // ---------------- Step 1 / resend ----------------
        async function sendCode(fromResend) {
            const btn = fromResend ? resendBtn : sendBtn;
            btn.disabled = true;
            const { ok, data } = await postJson("send-otp");
            if (!ok) {
                btn.disabled = false;
                showMessage(data.message || "The code could not be sent. Please try again.");
                return;
            }
            if (!fromResend) goToStep(2);
            sentText.textContent = data.message || "Enter the 6-digit code we sent to your email.";
            otpInput.value = "";
            if (fromResend) showMessage("A new code is on its way.", true);
            startResendTimer();
            sendBtn.disabled = false;
        }

        // ---------------- Step 2 ----------------
        async function verifyCode() {
            const otp = otpInput.value.trim();
            if (!/^\d{6}$/.test(otp)) {
                showMessage("Enter the 6-digit code from your email.");
                return;
            }
            verifyBtn.disabled = true;
            const { ok, data } = await postJson("verify-otp", { otp });
            verifyBtn.disabled = false;
            if (!ok) {
                showMessage(data.message || "That code did not work. Please try again.");
                return;
            }
            clearInterval(timerId);
            goToStep(3);
        }

        // ---------------- Step 3 ----------------
        function updateRules() {
            ruleItems.forEach((li) => li.classList.toggle("is-met", RULES[li.dataset.rule](newInput.value)));
        }

        async function updatePassword() {
            const newPassword = newInput.value;
            const confirmPassword = confirmInput.value;
            if (!PASSWORD_REGEX.test(newPassword)) {
                showMessage("Your new password needs every item in the list above.");
                return;
            }
            if (newPassword !== confirmPassword) {
                showMessage("The two passwords do not match.");
                return;
            }
            updateBtn.disabled = true;
            const { ok, data } = await postJson("reset", { newPassword, confirmPassword });
            updateBtn.disabled = false;
            if (!ok) {
                showMessage(data.message || "Your password could not be updated. Please try again.");
                if (/send a new code/i.test(data.message || "")) {
                    const expired = message.textContent;
                    goToStep(1);
                    showMessage(expired);   // goToStep clears it - keep the reason on screen
                }
                return;
            }
            newInput.value = "";
            confirmInput.value = "";
            goToStep("done");
        }

        // ---------------- events ----------------
        sendBtn.addEventListener("click", () => sendCode(false));
        resendBtn.addEventListener("click", () => sendCode(true));
        verifyBtn.addEventListener("click", verifyCode);
        updateBtn.addEventListener("click", updatePassword);
        newInput.addEventListener("input", updateRules);
        otpInput.addEventListener("input", () => {
            otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 6);
        });
        otpInput.addEventListener("keydown", (e) => { if (e.key === "Enter") verifyCode(); });
        confirmInput.addEventListener("keydown", (e) => { if (e.key === "Enter") updatePassword(); });

        document.querySelectorAll(".staff-pw-toggle").forEach((btn) => {
            btn.addEventListener("click", () => {
                const input = $(btn.dataset.toggle);
                const show = input.type === "password";
                input.type = show ? "text" : "password";
                btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
                btn.querySelector("i").className = show ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
            });
        });
    });
})();