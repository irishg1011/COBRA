/**
 * admin_dashboard.js - CobraByte Admin Dashboard
 * ---------------------------------------------------
 * Responsibilities:
 *   - Dashboard initialization
 *   - General page interactions that don't belong to sidebar/modal/table
 *
 * Frontend-only: no fetch/AJAX/backend calls happen here.
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- Live-updating clock next to the page title ---
    // The initial value in the HTML ("11:00AM · Monday, July 25, 2026") is
    // the approved-design placeholder; once the page loads in a real
    // browser this swaps in the visitor's actual local time so the header
    // doesn't look frozen. Purely cosmetic - no backend involved.
    const dateTimeEl = document.getElementById('adminDateTime');

    function updateDateTime() {
        if (!dateTimeEl) return;
        const now = new Date();
        const timeText = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const dateText = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        dateTimeEl.textContent = `${timeText} \u00B7 ${dateText}`;
    }

    updateDateTime();
    setInterval(updateDateTime, 30000);

    // --- Login Logs button ---
    // No backend route exists yet, so clicking this logs a placeholder
    // message instead of following a dead link.
    const loginLogsBtn = document.getElementById('loginLogsBtn');
    if (loginLogsBtn) {
        loginLogsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            console.log('Login Logs: navigate to /login-logs once the backend route exists.');
        });
    }

    // --- Notification bell placeholder ---
    const notifBtn = document.getElementById('adminNotifBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', () => {
            console.log('Notifications: placeholder - no real notifications wired up yet.');
        });
    }
});