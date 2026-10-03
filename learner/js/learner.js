/*
 * learner.js - shared learner header behavior (every learner page)
 * -----------------------------------------------------------------
 *  - Profile dropdown: the profile icon opens a menu with the learner's
 *    clickable name (-> /profile), Edit Profile, Change Password and
 *    Logout. The menu markup is built here and mounted into the page's
 *    <div class="profile-menu" data-profile-menu></div> placeholder, so
 *    every page shares one copy. The learner's profile photo (when they
 *    uploaded one) replaces the default icon there.
 *  - Logout: same flow as before (confirm modal -> auth-guard's
 *    cobraByteLogout()). The modal is built here too, so pages no longer
 *    carry their own inline-styled copy.
 *  - Learning-time heartbeat: once a minute while the tab is visible,
 *    for the profile's Total Hours and the "Dedicated" badge.
 *  - Notifications bell: Facebook-style dropdown (All / Unread, New /
 *    Earlier, unread dots, mark all as read, see previous) fed by
 *    /api/notifications (notifications.py); unread count polled every minute.
 *  - Dark mode toggle: a moon/sun button placed before the bell. It uses
 *    window.cobraByteTheme from theme.js (loaded in the <head>).
 *
 * Styles: learner/css/profile-menu.css, learner/css/dark-mode.css
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

    // feat/profile-photo: the learner's uploaded photo replaces the default
    // icons (header button + the dropdown's identity row). No photo, or a
    // photo whose file is gone -> the icons come back (never a broken image).
    function renderAvatar(avatarUrl) {
        if (!menuBtn || !menuPanel) return;
        const spots = [
            { el: menuBtn, icon: 'fa-solid fa-circle-user' },
            { el: menuPanel.querySelector('.profile-menu-avatar'), icon: 'fa-solid fa-user' },
        ];
        spots.forEach(({ el, icon }) => {
            if (!el) return;
            el.classList.toggle('has-photo', !!avatarUrl);
            if (!avatarUrl) {
                el.innerHTML = `<i class="${icon}" aria-hidden="true"></i>`;
                return;
            }
            el.innerHTML = `<img class="profile-menu-photo" src="${escapeHtml(avatarUrl)}" alt="">`;
            el.querySelector('img').addEventListener('error', () => renderAvatar(null), { once: true });
        });
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
                <a href="/terms" target="_blank" rel="noopener" class="profile-menu-item" role="menuitem">
                    <i class="fa-solid fa-file-lines" aria-hidden="true"></i> Terms and Conditions
                </a>
                <a href="/privacy" target="_blank" rel="noopener" class="profile-menu-item" role="menuitem">
                    <i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Privacy Notice
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
            .then((data) => {
                if (!data || !data.success) return;
                renderName(data.profile);
                renderAvatar(data.profile.avatar_url);   // feat/profile-photo
            })
            .catch(() => { /* name stays "My profile" */ });
    }

    // Lets Edit Profile refresh the dropdown name right after saving, and
    // the header photo right after an upload / remove (profile-photo.js).
    window.cobraByteProfileMenu = { renderName, renderAvatar };

    // ===============================
    // Notifications bell (Facebook-style dropdown)
    // ===============================
    // Data: /api/notifications (notifications.py). The unread count is
    // polled every minute; the list loads when the panel opens.
    const NOTIF_POLL_MS = 60 * 1000;
    const NOTIF_TYPES = {
        lives_refill:  { icon: 'fa-heart',            badge: 'fa-rotate',           tone: 'red' },
        lives_out:     { icon: 'fa-heart-crack',      badge: 'fa-clock',            tone: 'rose' },
        daily_bonus:   { icon: 'fa-gift',             badge: 'fa-plus',             tone: 'amber' },
        badge:         { icon: 'fa-award',            badge: 'fa-star',             tone: 'gold' },
        module_passed: { icon: 'fa-layer-group',      badge: 'fa-check',            tone: 'green' },
        chapter_done:  { icon: 'fa-flag-checkered',   badge: 'fa-check',            tone: 'teal' },
        course_done:   { icon: 'fa-graduation-cap',   badge: 'fa-star',             tone: 'gold' },
        retake:        { icon: 'fa-arrow-rotate-right', badge: 'fa-exclamation',    tone: 'orange' },
        review:        { icon: 'fa-lightbulb',        badge: 'fa-book-open',        tone: 'orange' },
        security:      { icon: 'fa-lock',             badge: 'fa-shield-halved',    tone: 'blue' },
        snippet:       { icon: 'fa-code',             badge: 'fa-floppy-disk',      tone: 'indigo' },
        profile:       { icon: 'fa-user-pen',         badge: 'fa-pen',              tone: 'sky' },
        welcome:       { icon: 'fa-hand-sparkles',    badge: 'fa-star',             tone: 'teal' },
    };

    const bellBtn = document.querySelector('.header-controls [aria-label="Notifications"]');
    if (bellBtn) {
        const notifWrap = document.createElement('div');
        notifWrap.className = 'notif-menu';
        bellBtn.parentNode.insertBefore(notifWrap, bellBtn);
        notifWrap.appendChild(bellBtn);
        bellBtn.classList.add('notif-bell');
        bellBtn.setAttribute('aria-haspopup', 'true');
        bellBtn.setAttribute('aria-expanded', 'false');

        const bellCount = document.createElement('span');
        bellCount.className = 'notif-count';
        bellCount.hidden = true;
        bellBtn.appendChild(bellCount);

        const panel = document.createElement('div');
        panel.className = 'notif-panel';
        panel.hidden = true;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Notifications');
        panel.innerHTML = `
            <div class="notif-head">
                <h2>Notifications</h2>
                <div class="notif-more">
                    <button type="button" class="notif-more-btn" aria-label="More options" data-n="moreBtn">
                        <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
                    </button>
                    <div class="notif-more-menu" data-n="moreMenu" hidden>
                        <button type="button" data-n="readAll"><i class="fa-solid fa-check" aria-hidden="true"></i> Mark all as read</button>
                    </div>
                </div>
            </div>
            <div class="notif-tabs" role="tablist">
                <button type="button" class="notif-tab is-active" role="tab" aria-selected="true" data-filter="all">All</button>
                <button type="button" class="notif-tab" role="tab" aria-selected="false" data-filter="unread">Unread</button>
            </div>
            <div class="notif-scroll" data-n="scroll">
                <p class="notif-status" data-n="status">Loading...</p>
                <div data-n="list"></div>
                <button type="button" class="notif-older" data-n="older" hidden>See previous notifications</button>
            </div>`;
        notifWrap.appendChild(panel);

        const q = (name) => panel.querySelector(`[data-n="${name}"]`);
        const listEl = q('list');
        const statusEl = q('status');
        const olderBtn = q('older');
        const moreMenu = q('moreMenu');
        let filter = 'all';
        let items = [];
        let loading = false;

        function setCount(n) {
            const count = Number(n) || 0;
            bellCount.hidden = count === 0;
            bellCount.textContent = count > 9 ? '9+' : String(count);
            bellBtn.setAttribute('aria-label', count ? `Notifications, ${count} unread` : 'Notifications');
        }

        // **bold** -> <strong>, everything else escaped
        function rich(text) {
            return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        }

        function itemHtml(n) {
            const t = NOTIF_TYPES[n.type] || { icon: 'fa-bell', badge: 'fa-circle-info', tone: 'teal' };
            const tag = n.link ? 'a' : 'button';
            const href = n.link ? ` href="${escapeHtml(n.link)}"` : ' type="button"';
            return `
                <${tag}${href} class="notif-item${n.is_read ? '' : ' is-unread'}" data-id="${n.id}">
                    <span class="notif-avatar tone-${t.tone}" aria-hidden="true">
                        <i class="fa-solid ${t.icon}"></i>
                        <span class="notif-avatar-badge"><i class="fa-solid ${t.badge}"></i></span>
                    </span>
                    <span class="notif-body">
                        <span class="notif-title">${rich(n.title)}</span>
                        ${n.detail ? `<span class="notif-detail">${rich(n.detail)}</span>` : ''}
                        <span class="notif-time" title="${escapeHtml(n.when)}">${escapeHtml(n.relative)} · ${escapeHtml(n.when)}</span>
                    </span>
                    <span class="notif-dot" aria-label="${n.is_read ? '' : 'Unread'}"></span>
                </${tag}>`;
        }

        function render() {
            const fresh = items.filter(n => n.is_today);
            const earlier = items.filter(n => !n.is_today);
            let html = '';
            if (fresh.length) html += `<h3 class="notif-section">New</h3>${fresh.map(itemHtml).join('')}`;
            if (earlier.length) html += `<h3 class="notif-section">Earlier</h3>${earlier.map(itemHtml).join('')}`;
            listEl.innerHTML = html;
            if (!items.length) {
                statusEl.hidden = false;
                statusEl.textContent = filter === 'unread'
                    ? "You're all caught up - no unread notifications."
                    : 'No notifications yet. Finish a lesson or earn a badge and it shows up here.';
            } else {
                statusEl.hidden = true;
            }
        }

        async function load(more) {
            if (loading) return;
            loading = true;
            if (!more) {
                statusEl.hidden = false;
                statusEl.textContent = 'Loading...';
            }
            olderBtn.disabled = true;
            try {
                const params = new URLSearchParams({ filter, limit: '12' });
                if (more && items.length) params.set('before_id', items[items.length - 1].id);
                const res = await fetch(`/api/notifications?${params}`, { credentials: 'include' });
                const data = await res.json();
                if (!data.success) throw new Error();
                items = more ? items.concat(data.items) : data.items;
                setCount(data.unread_count);
                render();
                olderBtn.hidden = !data.has_more;
            } catch (e) {
                if (!more) {
                    listEl.innerHTML = '';
                    statusEl.hidden = false;
                    statusEl.textContent = 'Notifications could not be loaded. Try again in a moment.';
                }
            } finally {
                olderBtn.disabled = false;
                loading = false;
            }
        }

        async function pollCount() {
            if (document.visibilityState !== 'visible') return;
            try {
                const res = await fetch('/api/notifications/count', { credentials: 'include' });
                const data = await res.json();
                if (data.success) setCount(data.unread_count);
            } catch (e) { /* keep the last count */ }
        }

        function openPanel() {
            closeMenu(false);
            panel.hidden = false;
            bellBtn.setAttribute('aria-expanded', 'true');
            load(false);
        }

        function closePanel(returnFocus) {
            if (panel.hidden) return;
            panel.hidden = true;
            moreMenu.hidden = true;
            bellBtn.setAttribute('aria-expanded', 'false');
            if (returnFocus) bellBtn.focus();
        }

        bellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (panel.hidden) openPanel(); else closePanel(false);
        });
        panel.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', () => closePanel(false));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(true); });
        if (menuBtn) menuBtn.addEventListener('click', () => closePanel(false));

        panel.querySelectorAll('.notif-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                filter = tab.dataset.filter;
                panel.querySelectorAll('.notif-tab').forEach(t => {
                    const on = t === tab;
                    t.classList.toggle('is-active', on);
                    t.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                load(false);
            });
        });

        q('moreBtn').addEventListener('click', () => { moreMenu.hidden = !moreMenu.hidden; });
        q('readAll').addEventListener('click', async () => {
            moreMenu.hidden = true;
            try {
                await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' });
            } catch (e) { /* the next load shows the real state */ }
            items.forEach(n => { n.is_read = true; });
            if (filter === 'unread') items = [];
            setCount(0);
            render();
        });

        olderBtn.addEventListener('click', () => load(true));

        // Clicking a notification marks it read, then follows its link.
        listEl.addEventListener('click', (e) => {
            const el = e.target.closest('.notif-item');
            if (!el) return;
            const n = items.find(x => String(x.id) === el.dataset.id);
            if (!n || n.is_read) return;
            n.is_read = true;
            el.classList.remove('is-unread');
            setCount(Math.max(0, (Number(bellCount.textContent) || 1) - 1));
            fetch(`/api/notifications/${n.id}/read`, { method: 'POST', credentials: 'include', keepalive: true })
                .then(res => res.json())
                .then(data => { if (data && data.success) setCount(data.unread_count); })
                .catch(() => { /* best-effort */ });
        });

        pollCount();
        setInterval(pollCount, NOTIF_POLL_MS);
        document.addEventListener('visibilitychange', pollCount);
    }

    // ===============================
    // Dark mode toggle (moon = switch to dark, sun = switch to light)
    // ===============================
    const controls = document.querySelector('.header-controls');
    if (controls && window.cobraByteTheme) {
        const themeBtn = document.createElement('button');
        themeBtn.type = 'button';
        themeBtn.className = 'icon-btn header-icon-btn theme-toggle';
        themeBtn.innerHTML = '<i aria-hidden="true"></i>';
        controls.insertBefore(themeBtn, controls.firstChild);

        const paintToggle = () => {
            const dark = window.cobraByteTheme.get() === 'dark';
            themeBtn.querySelector('i').className = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
            themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
            themeBtn.title = dark ? 'Light mode' : 'Dark mode';
        };
        paintToggle();
        themeBtn.addEventListener('click', () => window.cobraByteTheme.toggle());
        document.addEventListener('cobrabyte:themechange', paintToggle);
    }

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