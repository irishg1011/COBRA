document.addEventListener('DOMContentLoaded', () => {
    // 1. Profile Dropdown Toggle Logic
    const profileBtn = document.getElementById('profileDropdownBtn');
    const dropdownMenu = document.getElementById('profileDropdownMenu');

    if (profileBtn && dropdownMenu) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.style.display = dropdownMenu.style.display === 'block' ? 'none' : 'block';
        });

        document.addEventListener('click', () => {
            dropdownMenu.style.display = 'none';
        });
    }

    // 2. Logout Modal Control Elements
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

    // 3. Confirm Logout Action, Storage Clear & Cache Invalidation
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener('click', () => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace('login.html');
        });
    }

    // 4. Prevent Back-Button Browser Caching Restoration
    window.addEventListener('pageshow', (event) => {
        if (event.persisted || performance.getEntriesByType("navigation")[0]?.type === "back_forward") {
            window.location.replace('login.html');
        }
    });
});