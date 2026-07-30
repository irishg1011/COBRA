document.addEventListener('DOMContentLoaded', () => {

    // ===============================
    // Profile Dropdown
    // ===============================
    const profileBtn = document.getElementById('profileDropdownBtn');
    const dropdownMenu = document.getElementById('profileDropdownMenu');

    if (profileBtn && dropdownMenu) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.style.display =
                dropdownMenu.style.display === 'block'
                    ? 'none'
                    : 'block';
        });

        document.addEventListener('click', () => {
            dropdownMenu.style.display = 'none';
        });
    }

    // ===============================
    // Logout Modal
    // ===============================
    const logoutTriggerBtn = document.getElementById('logoutTriggerBtn');
    const logoutModal = document.getElementById('logoutModal');
    const cancelLogoutBtn = document.getElementById('cancelLogoutBtn');
    const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

    if (logoutTriggerBtn && logoutModal) {
        logoutTriggerBtn.addEventListener('click', () => {
            if (dropdownMenu) dropdownMenu.style.display = 'none';
            logoutModal.style.display = 'flex';
        });
    }

    if (cancelLogoutBtn && logoutModal) {
        cancelLogoutBtn.addEventListener('click', () => {
            logoutModal.style.display = 'none';
        });
    }

    // ===============================
    // Logout
    // ===============================
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', () => {

            logoutModal.style.display = 'none';

            // Use auth-guard logout if available
            if (typeof window.cobraByteLogout === 'function') {
                window.cobraByteLogout();
            } else {
                sessionStorage.clear();
                localStorage.clear();

                window.location.replace('login.html');
            }

        });
    }

    // ===============================
    // Prevent viewing Dashboard after logout
    // ===============================
    window.addEventListener("pageshow", () => {
    // Do nothing.
    // Authentication is handled by auth-guard.js.
});
});