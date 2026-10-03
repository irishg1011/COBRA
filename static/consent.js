/*
 * consent.js - the "Before you continue" screen (feat/terms-consent)
 * ---------------------------------------------------------------------------
 * Shown to a signed-in learner who has not accepted the current Terms and
 * Conditions and Privacy Notice yet (see server/consent.py).
 *
 *   Agree and continue   -> POST /api/consent/accept, then the dashboard
 *   Decline and log out  -> POST /logout, then the login page
 *
 * The server decides whether the learner is under 18 (from the birthdate
 * on their profile) and whether consent is still needed; this page only
 * shows what it is told.
 *
 * Styles: static/legal.css.  Popup: static/legal-popup.js.
 */
document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const LOGIN_URL = "/login";
    const HOME_URL = "/dashboard";

    const agreeBox = document.getElementById("consentAgree");
    const guardianRow = document.getElementById("consentGuardianRow");
    const guardianBox = document.getElementById("consentGuardian");
    const errorEl = document.getElementById("consentPageError");
    const agreeBtn = document.getElementById("consentAgreeBtn");
    const declineBtn = document.getElementById("consentDeclineBtn");

    let isMinor = false;

    function showError(message) {
        errorEl.textContent = message;
        errorEl.hidden = false;
    }

    function clearError() {
        errorEl.textContent = "";
        errorEl.hidden = true;
    }

    function setBusy(busy) {
        agreeBtn.disabled = busy;
        declineBtn.disabled = busy;
    }

    function goToLogin() {
        sessionStorage.clear();
        window.location.replace(LOGIN_URL);
    }

    // Not signed in on this browser tab -> nothing to accept here.
    if (sessionStorage.getItem("isAuthenticated") !== "true") {
        goToLogin();
        return;
    }

    setBusy(true);
    fetch("/api/consent/status", { credentials: "include" })
        .then((res) => res.json().then((data) => ({ status: res.status, data })))
        .then(({ status, data }) => {
            if (status === 401) { goToLogin(); return; }
            if (!data.needs_consent) { window.location.replace(HOME_URL); return; }
            isMinor = !!data.is_minor;
            guardianRow.hidden = !isMinor;
            setBusy(false);
        })
        .catch(() => {
            setBusy(false);
            showError("Could not reach the server. Check your connection and refresh the page.");
        });

    [agreeBox, guardianBox].forEach((box) => box.addEventListener("change", clearError));

    agreeBtn.addEventListener("click", async () => {
        clearError();
        if (!agreeBox.checked) {
            showError("Please tick the box to agree before you continue.");
            return;
        }
        if (isMinor && !guardianBox.checked) {
            showError("Please confirm that your parent or guardian agrees.");
            return;
        }

        setBusy(true);
        try {
            const res = await fetch("/api/consent/accept", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ agree: true, guardian: isMinor && guardianBox.checked }),
            });
            const data = await res.json();
            if (res.status === 401) { goToLogin(); return; }
            if (!data.success) {
                showError(data.message || "Your answer could not be saved. Please try again.");
                setBusy(false);
                return;
            }
            window.location.replace(data.redirect || HOME_URL);
        } catch (err) {
            showError("Could not reach the server. Please try again.");
            setBusy(false);
        }
    });

    declineBtn.addEventListener("click", () => {
        setBusy(true);
        fetch("/logout", { method: "POST", credentials: "include" })
            .catch(() => { /* best-effort, same as the normal logout */ })
            .finally(goToLogin);
    });
});