// admin/js/admin-script.js
document.addEventListener('DOMContentLoaded', () => {
    console.log("CobraByte Admin Dashboard Loaded successfully.");

    // --------------------------------------------------------------
    // Task #13: Placeholder sidebar items (Manage Course, Learning
    // Resources, etc.) are not implemented yet. Their links already use
    // a safe href ("javascript:void(0);") that never changes the URL, but
    // this listener is added as a second line of defense: it stops the
    // click from doing anything at all and - critically - keeps it from
    // bubbling up to any other handler on the page (e.g. the auth guard's
    // popstate/back-button logic), so a placeholder click can never be
    // mistaken for a Back-button press or trigger the logout dialog.
    // --------------------------------------------------------------
    document.querySelectorAll('.admin-sidebar .nav-item[data-disabled="true"]').forEach((item) => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Task #14: open the shared custom modal (defined once in
            // admin-sidebar.html, wired up in admin-auth-guard.js) instead
            // of the browser's native confirm() dialog.
            if (typeof window.cobraByteOpenLogoutModal === 'function') {
                window.cobraByteOpenLogoutModal();
            }
        });
    }
});