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

    // Fade out before navigating to another same-site page
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        if (link.target === '_blank') return;

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

        setTimeout(() => {
            window.location.href = url.href;
        }, 200);

        // Safety net: if this page is still here a few seconds later (the
        // next page is slow or failed to load, or the link only moved
        // within this page), show it again instead of leaving it blank.
        setTimeout(showPage, 3000);
    });
})();