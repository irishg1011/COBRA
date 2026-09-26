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

    // --------------------------------------------------------------
    // Admin redesign: collapsible sidebar (icon-only when closed).
    // The button lives in the shared admin-header.html. The state is a
    // single "sidebar-collapsed" class on <html> - all visuals are in
    // admin-style.css - and it's saved to localStorage so it stays the
    // same across pages (admin-sidebar-state.js re-applies it in <head>).
    // --------------------------------------------------------------
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    if (sidebarToggleBtn) {
        const rootEl = document.documentElement;
        sidebarToggleBtn.setAttribute('aria-expanded', String(!rootEl.classList.contains('sidebar-collapsed')));

        sidebarToggleBtn.addEventListener('click', () => {
            const isCollapsed = rootEl.classList.toggle('sidebar-collapsed');
            sidebarToggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
            try {
                localStorage.setItem('cobrabyteAdminSidebarCollapsed', String(isCollapsed));
            } catch (err) {
                /* storage unavailable - toggle still works for this page */
            }
        });
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const createAdminModal = document.getElementById("createAdminModal");
    const openModalBtn = document.getElementById("openCreateAdminBtn"); // Using the exact ID now
    const closeModalBtn = document.getElementById("closeCreateAdminModal");

    // ------------------------------------------------------------
    // Task: "If click outside the panel there's a notice if you want to
    // close, else the data that have been input will erase."
    // ------------------------------------------------------------
    // admin-create-admin.js defines window.cobraByteAttemptCloseCreateAdminModal,
    // which checks whether any field has been filled in and, if so, asks
    // for confirmation before resetting the form and hiding the modal -
    // exactly like the Sign Up page's confirmViewSwitch()/
    // activePanelHasInputs() pattern. Both close triggers below (the X
    // button and clicking the overlay) go through that SAME function so
    // there's only one place this "unsaved changes" check lives. If that
    // script hasn't loaded for some reason, fall back to closing the
    // modal directly rather than leaving the button dead.
    function closeCreateAdminModal() {
        if (typeof window.cobraByteAttemptCloseCreateAdminModal === "function") {
            window.cobraByteAttemptCloseCreateAdminModal();
        } else if (createAdminModal) {
            createAdminModal.style.display = "none";
        }
    }

    if (openModalBtn && createAdminModal) {
        openModalBtn.addEventListener("click", (e) => {
            e.preventDefault();
            createAdminModal.style.display = "flex";

            // Fetch and display what the next Account ID will actually
            // be (e.g. "AD2608060004") instead of leaving the static
            // "Auto-generated on submit" placeholder showing. Defined in
            // admin-create-admin.js - guarded in case that script hasn't
            // loaded for some reason.
            if (typeof window.cobraByteLoadNextAdminId === "function") {
                window.cobraByteLoadNextAdminId();
            }
        });
    }

    if (closeModalBtn && createAdminModal) {
        closeModalBtn.addEventListener("click", () => {
            closeCreateAdminModal();
        });
    }

    // Close when clicking outside the modal card
    window.addEventListener("click", (e) => {
        if (e.target === createAdminModal) {
            closeCreateAdminModal();
        }
    });
});