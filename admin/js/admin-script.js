// admin/js/admin-script.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("CobraByte Admin Dashboard Loaded successfully.");

    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const confirmed = window.confirm("Are you sure you want to log out?");
            if (!confirmed) return;

            // Reuse the exact same clear-everything-then-redirect logic
            // the admin auth guard's Back-button trap uses.
            if (typeof window.cobraByteAdminLogout === 'function') {
                window.cobraByteAdminLogout();
            } else {
                sessionStorage.clear();
                window.location.replace("http://127.0.0.1:5500/templates/login.html");
            }
        });
    }
});