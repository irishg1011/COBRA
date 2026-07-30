/**
 * sidebar.js - CobraByte Admin Sidebar
 * --------------------------------------
 * Responsibilities:
 *   - Active navigation highlighting (for links that don't have a real
 *     route yet, so the sidebar still feels responsive while the rest of
 *     the admin pages are built).
 *   - Sidebar responsiveness helpers (kept for future collapse/expand
 *     behavior on smaller viewports).
 *
 * This file is frontend-only: it never calls a backend endpoint.
 */
document.addEventListener('DOMContentLoaded', () => {
    const sidebarLinks = document.querySelectorAll('.sidebar-link[data-page]');

    sidebarLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            const href = link.getAttribute('href');

            // Links with a real, working route (Dashboard, Account & Security,
            // Logout) should navigate normally. Placeholder links (href="#")
            // just update the highlighted state for now.
            if (!href || href === '#') {
                event.preventDefault();
                sidebarLinks.forEach((l) => l.classList.remove('active'));
                link.classList.add('active');
            }
        });
    });

    // --- Sidebar responsiveness ---
    // On narrow viewports the sidebar collapses into an icon-only rail
    // (desktop/tablet) or a bottom bar (mobile) purely via CSS media
    // queries. This resize listener is a hook for any future JS-driven
    // behavior (e.g. a manual collapse toggle) without needing to touch
    // the CSS file.
    const adminSidebar = document.getElementById('adminSidebar');

    function handleSidebarResize() {
        if (!adminSidebar) return;
        const isCompact = window.innerWidth <= 1024;
        adminSidebar.classList.toggle('sidebar-compact', isCompact);
    }

    handleSidebarResize();
    window.addEventListener('resize', handleSidebarResize);
});