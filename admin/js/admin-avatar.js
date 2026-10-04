/**
 * admin-avatar.js - Account photos in the staff tables and modals
 * ---------------------------------------------------------------
 * The server sends avatar_url per account (profile_avatar.py):
 *   a URL -> that account uploaded a photo, show it
 *   null  -> no photo yet, keep the default blue user icon
 *
 *   CobraAvatar.html(url)   - markup for a table cell (.avatar-sm)
 *   CobraAvatar.set(el, url) - fill an existing avatar element (modals)
 *
 * If a photo fails to load (deleted meanwhile), it falls back to the
 * default icon on its own.
 */
(function () {
    function escapeAttr(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function html(url) {
        if (!url) return '<div class="avatar-sm">👤</div>';
        return `<div class="avatar-sm has-photo"><img src="${escapeAttr(url)}" alt="" loading="lazy"></div>`;
    }

    function set(el, url) {
        if (!el) return;
        el.classList.toggle("has-photo", !!url);
        el.innerHTML = url ? `<img src="${escapeAttr(url)}" alt="">` : "";
    }

    // A broken photo -> back to the default icon (error events don't bubble, so capture).
    document.addEventListener("error", (event) => {
        const img = event.target;
        if (!(img instanceof HTMLImageElement)) return;
        const holder = img.parentElement;
        if (holder && holder.classList.contains("has-photo")) {
            holder.classList.remove("has-photo");
            img.remove();
        }
    }, true);

    window.CobraAvatar = { html, set };
})();
