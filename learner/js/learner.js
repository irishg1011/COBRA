/*
 * learner.js - shared learner header behavior (every learner page)
 * -----------------------------------------------------------------
 *  - Profile dropdown: the profile icon opens a menu with the learner's
 *    clickable name (-> /profile), Edit Profile, Change Password and
 *    Logout. The menu markup is built here and mounted into the page's
 *    <div class="profile-menu" data-profile-menu></div> placeholder, so
 *    every page shares one copy.
 *  - Logout: same flow as before (confirm modal -> auth-guard's
 *    cobraByteLogout()). The modal is built here too, so pages no longer
 *    carry their own inline-styled copy.
 *  - Learning-time heartbeat: once a minute while the tab is visible,
 *    for the profile's Total Hours and the "Dedicated" badge.
 *
 * Styles: learner/css/profile-menu.css
 */
document.addEventListener('DOMContentLoaded', () => {

    const HEARTBEAT_MS = 60 * 1000;

    // ===============================
    // Profile dropdown
    // ===============================
    const mount = document.querySelector('[data-profile-menu]');
    let menuBtn = null;
    let menuPanel = null;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function renderName(profile) {
        if (!menuPanel || !profile) return;
        const nameEl = menuPanel.querySelector('[data-pm="name"]');
        const subEl = menuPanel.querySelector('[data-pm="sub"]');
        nameEl.textContent = profile.full_name || profile.username || 'My profile';
        subEl.textContent = profile.username ? `@${profile.username}` : '';
    }

    function openMenu() {
        menuPanel.hidden = false;
        menuBtn.setAttribute('aria-expanded', 'true');
        const first = menuPanel.querySelector('a, button');
        if (first) first.focus();
    }

    function closeMenu(returnFocus) {
        if (!menuPanel || menuPanel.hidden) return;
        menuPanel.hidden = true;
        menuBtn.setAttribute('aria-expanded', 'false');
        if (returnFocus) menuBtn.focus();
    }

    if (mount) {
        mount.innerHTML = `
            <button type="button" class="icon-btn profile-menu-btn" aria-label="Open profile menu"
                    aria-haspopup="true" aria-expanded="false" data-pm="btn">
                <i class="fa-solid fa-circle-user" aria-hidden="true"></i>
            </button>
            <div class="profile-menu-panel" role="menu" data-pm="panel" hidden>
                <a href="/profile" class="profile-menu-identity" role="menuitem">
                    <span class="profile-menu-avatar" aria-hidden="true"><i class="fa-solid fa-user"></i></span>
                    <span class="profile-menu-identity-text">
                        <span class="profile-menu-name" data-pm="name">My profile</span>
                        <span class="profile-menu-sub" data-pm="sub"></span>
                    </span>
                </a>
                <div class="profile-menu-divider" role="separator"></div>
                <a href="/profile/edit" class="profile-menu-item" role="menuitem">
                    <i class="fa-regular fa-circle-user" aria-hidden="true"></i> Edit Profile
                </a>
                <a href="/profile/change-password" class="profile-menu-item" role="menuitem">
                    <i class="fa-solid fa-lock" aria-hidden="true"></i> Change Password
                </a>
                <div class="profile-menu-divider" role="separator"></div>
                <button type="button" class="profile-menu-item profile-menu-logout" role="menuitem" data-pm="logout">
                    <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Logout
                </button>
            </div>`;

        menuBtn = mount.querySelector('[data-pm="btn"]');
        menuPanel = mount.querySelector('[data-pm="panel"]');

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menuPanel.hidden) openMenu(); else closeMenu(false);
        });
        menuPanel.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', () => closeMenu(false));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeMenu(true);
        });

        fetch('/api/profile/me', { credentials: 'include' })
            .then((res) => res.json())
            .then((data) => { if (data && data.success) renderName(data.profile); })
            .catch(() => { /* name stays "My profile" */ });
    }

    // Lets Edit Profile refresh the dropdown name right after saving.
    window.cobraByteProfileMenu = { renderName };

    // ===============================
    // Logout modal (built once, shared)
    // ===============================
    const logoutModal = document.createElement('div');
    logoutModal.className = 'logout-modal-overlay';
    logoutModal.hidden = true;
    logoutModal.innerHTML = `
        <div class="logout-modal-card" role="dialog" aria-modal="true" aria-labelledby="logoutModalTitle">
            <div class="logout-modal-icon" aria-hidden="true"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <h3 id="logoutModalTitle">Are you sure you want to log out?</h3>
            <p>You will need to sign back in to access your dashboard.</p>
            <div class="logout-modal-actions">
                <button type="button" class="logout-modal-cancel" data-lm="cancel">Cancel</button>
                <button type="button" class="logout-modal-confirm" data-lm="confirm">Yes, Logout</button>
            </div>
        </div>`;
    document.body.appendChild(logoutModal);

    const cancelLogoutBtn = logoutModal.querySelector('[data-lm="cancel"]');
    const confirmLogoutBtn = logoutModal.querySelector('[data-lm="confirm"]');

    function openLogoutModal() {
        closeMenu(false);
        logoutModal.hidden = false;
        cancelLogoutBtn.focus();
    }

    function closeLogoutModal() {
        logoutModal.hidden = true;
    }

    if (menuPanel) {
        menuPanel.querySelector('[data-pm="logout"]').addEventListener('click', openLogoutModal);
    }
    cancelLogoutBtn.addEventListener('click', closeLogoutModal);
    logoutModal.addEventListener('click', (e) => {
        if (e.target === logoutModal) closeLogoutModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !logoutModal.hidden) closeLogoutModal();
    });

    confirmLogoutBtn.addEventListener('click', () => {
        closeLogoutModal();
        // Use auth-guard logout if available
        if (typeof window.cobraByteLogout === 'function') {
            window.cobraByteLogout();
        } else {
            sessionStorage.clear();
            localStorage.clear();
            window.location.replace('/login');
        }
    });

    // ===============================
    // Learning-time heartbeat
    // ===============================
    function beat() {
        if (document.visibilityState !== 'visible') return;
        fetch('/api/profile/heartbeat', { method: 'POST', credentials: 'include' })
            .catch(() => { /* best-effort */ });
    }
    beat();
    setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', beat);

    // ===============================
    // Prevent viewing Dashboard after logout
    // ===============================
    window.addEventListener('pageshow', () => {
        // Do nothing.
        // Authentication is handled by auth-guard.js.
    });

    // Exposed for pages that render their own name (escapeHtml reused by profile pages).
    window.cobraByteEscapeHtml = escapeHtml;
});