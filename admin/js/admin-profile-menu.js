/**
 * admin-profile-menu.js - Staff profile dropdown (Admin + Mentor)
 * --------------------------------------------------------------------
 * feat/staff-profile-menu
 *
 * Loaded from admin-header.html, so it runs on every admin and mentor
 * page. The profile area in the header (photo + name + arrow) opens a
 * dropdown in the same format as the learner header's:
 *
 *   [photo]  Name / Role
 *   Change Photo  -> the Profile photo popup (admin-profile-photo.js
 *                    listens on the same #openProfilePhotoBtn)
 *   Logout        -> the same confirm modal as the sidebar's Logout
 *                    (window.cobraByteOpenLogoutModal, admin-auth-guard.js)
 *
 * Closes on an outside click, on Escape, and after picking an item.
 * Up / Down arrows move between the items.
 * Styles: css/admin-profile-menu.css
 */
(function () {
    "use strict";

    function init() {
        const menuBtn = document.getElementById("staffMenuBtn");
        const panel = document.getElementById("staffMenuPanel");
        if (!menuBtn || !panel) return;

        const logoutBtn = document.getElementById("staffMenuLogoutBtn");
        const items = () => Array.from(panel.querySelectorAll('[role="menuitem"]'));

        function openMenu() {
            panel.hidden = false;
            menuBtn.setAttribute("aria-expanded", "true");
            const first = items()[0];
            if (first) first.focus();
        }

        function closeMenu(returnFocus) {
            if (panel.hidden) return;
            panel.hidden = true;
            menuBtn.setAttribute("aria-expanded", "false");
            if (returnFocus) menuBtn.focus();
        }

        menuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (panel.hidden) openMenu(); else closeMenu(false);
        });

        // Picking an item closes the menu FIRST (capture phase) and puts the
        // focus back on the header button, so whatever the item opens
        // (photo popup, logout modal) returns the focus there when it closes.
        panel.addEventListener("click", (e) => {
            if (e.target.closest('[role="menuitem"]')) closeMenu(true);
        }, true);
        panel.addEventListener("click", (e) => e.stopPropagation());
        document.addEventListener("click", () => closeMenu(false));

        document.addEventListener("keydown", (e) => {
            if (panel.hidden) return;
            if (e.key === "Escape") {
                closeMenu(true);
                return;
            }
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            const list = items();
            if (!list.length) return;
            e.preventDefault();
            const current = list.indexOf(document.activeElement);
            const step = e.key === "ArrowDown" ? 1 : list.length - 1;
            list[(current + step + list.length) % list.length].focus();
        });

        if (logoutBtn) {
            logoutBtn.addEventListener("click", () => {
                // Same confirmation as the sidebar's Logout - never a second copy.
                if (typeof window.cobraByteOpenLogoutModal === "function") {
                    window.cobraByteOpenLogoutModal();
                    return;
                }
                const sidebarLogout = document.getElementById("adminLogoutBtn");
                if (sidebarLogout) sidebarLogout.click();
            });
        }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();