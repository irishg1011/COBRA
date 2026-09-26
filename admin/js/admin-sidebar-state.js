/**
 * admin-sidebar-state.js - CobraByte Admin Sidebar (saved state)
 * --------------------------------------------------------------
 * Load this in the <head> of every admin page, BEFORE the page paints:
 *
 *      <script src="{{ url_for('admin_bp.static', filename='js/admin-sidebar-state.js') }}"></script>
 *
 * It only re-applies the collapsed/expanded state the admin last chose,
 * by putting "sidebar-collapsed" on <html> - so a collapsed sidebar never
 * flashes open for a split second on page load. The click toggle itself
 * lives in admin-script.js.
 */
(function () {
    "use strict";

    try {
        if (localStorage.getItem("cobrabyteAdminSidebarCollapsed") === "true") {
            document.documentElement.classList.add("sidebar-collapsed");
        }
    } catch (e) {
        /* storage unavailable - sidebar simply starts expanded */
    }
})();
