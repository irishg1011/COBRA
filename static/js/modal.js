/**
 * modal.js - CobraByte Create Administrator Modal
 * ---------------------------------------------------
 * Responsibilities:
 *   - Open the Create Administrator modal
 *   - Close it via Cancel, the X button, an outside click, or ESC
 *
 * Frontend-only: the form inside the modal never submits or calls a
 * backend endpoint (see create_admin_modal.html).
 */
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('createAdminOverlay');
    const openBtn = document.getElementById('openCreateAdminBtn');
    const closeBtn = document.getElementById('createAdminClose');
    const cancelBtn = document.getElementById('createAdminCancel');
    const modalCard = overlay ? overlay.querySelector('.admin-modal') : null;
    const form = document.getElementById('createAdminForm');

    if (!overlay) return;

    function openModal() {
        overlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        const firstField = document.getElementById('newAdminUsername');
        if (firstField) firstField.focus();
    }

    function closeModal() {
        overlay.classList.remove('is-open');
        document.body.style.overflow = '';
        if (form) form.reset();
    }

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // Close when clicking the dimmed backdrop, but not the modal card itself
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeModal();
    });

    // Close on ESC, only when the modal is actually open
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
            closeModal();
        }
    });

    // Frontend-only submission stub: this is where a future fetch/AJAX
    // call to the backend would go. For now it just closes the modal.
    if (form) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            console.log('Create Administrator: frontend-only, no data was submitted.');
            closeModal();
        });
    }
});