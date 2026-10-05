(function () {
    "use strict";

    function showPage() {
        document.body.classList.remove('page-fade-out');
        document.body.classList.add('page-fade-in');
    }

    // Fade in on load
    document.addEventListener('DOMContentLoaded', showPage);

    // Fade in again when the browser brings this page back from its
    // back/forward cache (phone Back button or swipe). DOMContentLoaded
    // does not run again then, so without this the page stays invisible.
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) window.__cobrabyteInternalNav = false;
        showPage();
    });

    let showAgainTimer = null;

    // Fade out while navigating to another same-site page
    document.addEventListener('click', (e) => {
        // Not ours: a click another script already handled, and anything
        // that is not a plain left click (Ctrl / Cmd / Shift / Alt + click
        // and the middle button open a new tab or window).
        if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        if (link.target === '_blank' || link.hasAttribute('download')) return;

        // Only intercept same-origin links (internal navigation)
        let url;
        try {
            url = new URL(href, window.location.href);
        } catch (err) {
            return;
        }
        if (url.origin !== window.location.origin) return;

        e.preventDefault();
        document.body.classList.remove('page-fade-in');
        document.body.classList.add('page-fade-out');

        // Flag this as an intentional in-app navigation, not a real
        // tab/browser close - auth-guard.js's pagehide handler checks
        // this to avoid ending the session on every internal link click.
        window.__cobrabyteInternalNav = true;

        // Go right away - the fade-out plays while the next page loads.
        // (Every click used to wait 0.2 s on a timer first. A timer only
        // fires once the page is free, so while a game was loading or
        // drawing, the click looked like it did nothing.)
        window.location.href = url.href;

        // Safety net: if this page is still here a few seconds later (the
        // next page is slow or failed to load, or the link only moved
        // within this page), show it again instead of leaving it blank.
        // One timer only: a second click restarts it.
        clearTimeout(showAgainTimer);
        showAgainTimer = setTimeout(showPage, 3000);
    });
})();