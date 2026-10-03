/**
 * admin-profile-photo.js - Profile photo popup (Admin + Mentor)
 * --------------------------------------------------------------------
 * feat/profile-photo
 *
 * Loaded from admin-header.html, so it runs on every admin and mentor
 * page. "Change Photo" in the header's profile dropdown
 * (admin-profile-menu.js) opens #profilePhotoModal (profile-photo-modal.html):
 *
 *   Upload / Change photo -> POST /admin/profile/photo        (field "avatar")
 *   Remove photo          -> asks first, then POST /admin/profile/photo/remove
 *
 * The server decides whose photo it is (the logged-in account) and
 * checks the file again (profile_avatar.py) - the checks here only
 * save a round trip. After a change every copy of the photo on the
 * page (.js-profile-photo: header button + dropdown) updates right
 * away; no page reload.
 */
(function () {
    "use strict";

    const UPLOAD_URL = "/admin/profile/photo";
    const REMOVE_URL = "/admin/profile/photo/remove";
    const MAX_BYTES = 2 * 1024 * 1024;
    const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];
    const PHOTO_NAME = /\.(png|jpe?g|webp)$/i;
    const PHOTO_MAX_SIDE = 512;   // px - the photo is never shown larger than this

    function init() {
        const modal = document.getElementById("profilePhotoModal");
        const openBtn = document.getElementById("openProfilePhotoBtn");
        if (!modal || !openBtn) return;

        const pagePhotos = Array.from(document.querySelectorAll(".js-profile-photo"));   // header button + dropdown
        const preview = document.getElementById("profilePhotoPreview");
        const mainView = document.getElementById("profilePhotoMain");
        const confirmView = document.getElementById("profilePhotoConfirm");
        const message = document.getElementById("profilePhotoMessage");
        const pickBtn = document.getElementById("profilePhotoPickBtn");
        const removeBtn = document.getElementById("profilePhotoRemoveBtn");
        const keepBtn = document.getElementById("profilePhotoKeepBtn");
        const confirmRemoveBtn = document.getElementById("profilePhotoConfirmRemoveBtn");
        const closeBtn = document.getElementById("closeProfilePhotoBtn");
        const fileInput = document.getElementById("profilePhotoInput");
        const defaultSrc = preview.dataset.defaultSrc;

        // The header sits inside the page layout; the popup belongs on top of everything.
        document.body.appendChild(modal);

        let hasPhoto = modal.dataset.hasPhoto === "1";
        let busy = false;
        let lastFocused = null;

        function showMessage(text, isError) {
            message.textContent = text || "";
            message.classList.toggle("is-error", Boolean(isError));
        }

        function showView(confirming) {
            mainView.classList.toggle("is-hidden", confirming);
            confirmView.classList.toggle("is-hidden", !confirming);
        }

        function setBusy(state) {
            busy = state;
            [pickBtn, removeBtn, keepBtn, confirmRemoveBtn].forEach((btn) => { btn.disabled = state; });
        }

        // One place that draws the current photo everywhere on the page.
        function renderPhoto(url) {
            hasPhoto = Boolean(url);
            const src = url || defaultSrc;
            preview.src = src;
            pagePhotos.forEach((img) => { img.src = src; });
            pickBtn.textContent = hasPhoto ? "Change photo" : "Upload photo";
            removeBtn.classList.toggle("is-hidden", !hasPhoto);
        }

        // A photo whose file is gone falls back to the default picture - no broken image.
        [preview, ...pagePhotos].forEach((img) => {
            img.addEventListener("error", () => {
                if (img.getAttribute("src") !== defaultSrc) img.src = defaultSrc;
            });
        });

        function openModal() {
            lastFocused = document.activeElement;
            showMessage("");
            showView(false);
            modal.classList.remove("modal-hidden");
            pickBtn.focus();
        }

        function closeModal() {
            if (busy) return;
            modal.classList.add("modal-hidden");
            if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
        }

        async function send(url, body) {
            const response = await fetch(url, {
                method: "POST",
                headers: { "X-Requested-With": "XMLHttpRequest" },
                credentials: "include",
                body,
            });
            const data = await response.json().catch(() => ({}));
            return { ok: response.ok && data.success === true, data };
        }

        async function upload(file) {
            const typeOk = file.type ? PHOTO_TYPES.includes(file.type) : PHOTO_NAME.test(file.name);
            if (!typeOk) { showMessage("Your photo must be a JPG, PNG or WebP image.", true); return; }
            if (file.size > MAX_BYTES) { showMessage("Your photo must be 2 MB or smaller.", true); return; }

            setBusy(true);
            showMessage("Uploading...");
            try {
                // Shrunk in the browser first (image-shrink.js): photos are stored in the database.
                const shrink = window.cobraByteShrinkImage;
                const photo = typeof shrink === "function" ? await shrink(file, PHOTO_MAX_SIDE) : file;
                const body = new FormData();
                body.append("avatar", photo, photo.name);

                const { ok, data } = await send(UPLOAD_URL, body);
                if (ok) {
                    renderPhoto(data.avatar_url);
                    showMessage(data.message || "Profile photo updated.");
                } else {
                    showMessage(data.message || "Could not save your photo. Please try again.", true);
                }
            } catch (err) {
                console.error("admin-profile-photo: upload failed:", err);
                showMessage("Could not save your photo. Check your connection and try again.", true);
            } finally {
                setBusy(false);
            }
        }

        async function removePhoto() {
            setBusy(true);
            try {
                const { ok, data } = await send(REMOVE_URL);
                showView(false);
                if (ok) {
                    renderPhoto(null);
                    showMessage(data.message || "Profile photo removed.");
                } else {
                    showMessage(data.message || "Could not remove your photo. Please try again.", true);
                }
            } catch (err) {
                console.error("admin-profile-photo: remove failed:", err);
                showView(false);
                showMessage("Could not remove your photo. Check your connection and try again.", true);
            } finally {
                setBusy(false);
                pickBtn.focus();
            }
        }

        renderPhoto(hasPhoto ? preview.getAttribute("src") : null);

        openBtn.addEventListener("click", openModal);
        closeBtn.addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !modal.classList.contains("modal-hidden")) closeModal();
        });

        pickBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", () => {
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = "";   // so picking the same file again still fires "change"
            if (file) upload(file);
        });

        removeBtn.addEventListener("click", () => { showMessage(""); showView(true); keepBtn.focus(); });
        keepBtn.addEventListener("click", () => { showView(false); removeBtn.focus(); });
        confirmRemoveBtn.addEventListener("click", removePhoto);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();