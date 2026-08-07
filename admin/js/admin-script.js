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

document.addEventListener('DOMContentLoaded', function() {
    const categoriesModal = document.getElementById('categoriesModal');
    const openModalBtn = document.getElementById('openCreateModuleBtn');
    const closeModalBtn = document.getElementById('closeCategoriesModal');
    
    const mainModalFooter = document.getElementById('mainModalFooter');
    const modalBodyRel = document.querySelector('.modal-body-relative');

    const addCategoryDrawer = document.getElementById('addCategoryDrawer');
    const addModuleDrawer = document.getElementById('addModuleDrawer');

    const modalAddCategoryBtn = document.getElementById('modalAddCategoryBtn');
    const modalAddModuleBtn = document.getElementById('modalAddModuleBtn');

    // NOTE: the Categories modal (.custom-modal-dialog) is now a FIXED
    // size (see admin-style.css) regardless of which drawer - if any -
    // is open, so this no longer toggles a "modal-expanded" class or
    // tracks a "tall" flag per drawer. Taller content (e.g. Add Module's
    // extra fields) just scrolls within the same fixed box instead of
    // resizing/repositioning the whole modal.
    function openDrawer(drawer) {
        // Hide all drawers first
        addCategoryDrawer.style.display = 'none';
        addModuleDrawer.style.display = 'none';

        // Open target drawer, hide footer, and dim background list
        drawer.style.display = 'block';
        if (mainModalFooter) mainModalFooter.style.display = 'none';
        if (modalBodyRel) modalBodyRel.classList.add('drawer-open');
    }

    function closeAllDrawers() {
        addCategoryDrawer.style.display = 'none';
        addModuleDrawer.style.display = 'none';
        if (mainModalFooter) mainModalFooter.style.display = 'flex';
        if (modalBodyRel) modalBodyRel.classList.remove('drawer-open');
    }

    // Open Main Modal
    if (openModalBtn && categoriesModal) {
        openModalBtn.addEventListener('click', function() {
            categoriesModal.style.display = 'flex';
            closeAllDrawers();
        });
    }

    // Close Main Modal via 'X'
    if (closeModalBtn && categoriesModal) {
        closeModalBtn.addEventListener('click', function() {
            categoriesModal.style.display = 'none';
        });
    }

    // Trigger buttons for slide-up drawers
    if (modalAddCategoryBtn) {
        modalAddCategoryBtn.addEventListener('click', () => openDrawer(addCategoryDrawer));
    }
    if (modalAddModuleBtn) {
        modalAddModuleBtn.addEventListener('click', () => openDrawer(addModuleDrawer));
    }

    // Bind close actions to all elements sharing cancel/header arrow classes
    document.querySelectorAll('.cancel-drawer-btn, .close-drawer-btn').forEach(el => {
        el.addEventListener('click', closeAllDrawers);
    });

    // Close Modal when clicking outside the dialog content area
    window.addEventListener('click', function(event) {
        if (event.target === categoriesModal) {
            categoriesModal.style.display = 'none';
        }
    });

    // Accordion Toggle for Categories List
    document.querySelectorAll('.category-accordion-toggle').forEach(toggle => {
        toggle.addEventListener('click', function() {
            const parentItem = this.parentElement;
            parentItem.classList.toggle('active');
            
            const arrow = this.querySelector('.toggle-arrow');
            if (parentItem.classList.contains('active')) {
                arrow.classList.remove('fa-chevron-right');
                arrow.classList.add('fa-chevron-down');
            } else {
                arrow.classList.remove('fa-chevron-down');
                arrow.classList.add('fa-chevron-right');
            }
        });
    });
});