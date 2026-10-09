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

// feat/mentor-role: the Create Administrator / Create Mentor modals now
// open and close from admin-create-admin.js (one place for both).

// ======================================================================
// feat/title-char-limit
// Both features below use listeners on `document` (event delegation), so
// they also work for rows/inputs that other scripts create later (live
// search, pagination, archived modals, edit modals) with no extra calls.
// ======================================================================

// ----------------------------------------------------------------------
// 1) Live character counter for title inputs.
// Markup: an input with a maxlength, followed by
//   <small class="char-counter" data-counter-for="INPUT_ID"></small>
// The limit comes from the input's own maxlength (which the templates
// fill from validators.TITLE_LIMITS), so no numbers are repeated here.
// Refreshes on typing AND on focus - the edit/create modals set the
// value by script and then focus the input, so the counter is always
// correct when the admin starts typing.
// ----------------------------------------------------------------------
(function setupCharCounters() {
    const NEAR_LIMIT_RATIO = 0.9;

    function updateCounter(input) {
        if (!input || !input.id) return;
        const counter = document.querySelector(`.char-counter[data-counter-for="${input.id}"]`);
        if (!counter) return;

        const max = parseInt(input.getAttribute('maxlength'), 10);
        if (!max) return;

        const length = input.value.length;
        counter.textContent = `${length}/${max}`;
        counter.classList.toggle('is-over', length > max);
        counter.classList.toggle('is-full', length === max);
        counter.classList.toggle('is-near', length < max && length >= Math.ceil(max * NEAR_LIMIT_RATIO));
    }

    function refreshAll() {
        document.querySelectorAll('.char-counter[data-counter-for]').forEach((counter) => {
            updateCounter(document.getElementById(counter.dataset.counterFor));
        });
    }

    document.addEventListener('input', (e) => updateCounter(e.target));
    document.addEventListener('focusin', (e) => updateCounter(e.target));
    // blur can re-format the value (e.g. sentence case), so re-count after it.
    document.addEventListener('focusout', (e) => updateCounter(e.target));

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refreshAll);
    } else {
        refreshAll();
    }

    // For any script that sets a title's value without focusing it.
    window.cobraByteRefreshCharCounters = refreshAll;
})();

// ----------------------------------------------------------------------
// 2) Hover tooltip for truncated table text (.cell-truncate /
// .cell-truncate-1, see admin-style.css). The full text is shown only
// when it's actually cut off - short titles get no tooltip.
// ----------------------------------------------------------------------
(function setupTruncateTooltips() {
    const TRUNCATE_SELECTOR = '.cell-truncate, .cell-truncate-1';

    document.addEventListener('mouseover', (e) => {
        const el = e.target.closest ? e.target.closest(TRUNCATE_SELECTOR) : null;
        if (!el) return;

        const isCut = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
        if (isCut) {
            el.setAttribute('title', el.textContent.trim());
        } else {
            el.removeAttribute('title');
        }
    });
})();

// Idle logout (learners 1 hour, staff 2 hours) - static/idle-logout.js
(function () {
    if (document.querySelector('script[data-idle-logout]')) return;
    const script = document.createElement('script');
    script.src = '/static/idle-logout.js';
    script.defer = true;
    script.dataset.idleLogout = '1';
    document.head.appendChild(script);
})();
