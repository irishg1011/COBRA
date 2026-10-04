/*
 * profile-photo.js - learner profile photo on Edit Profile (/profile/edit)
 * feat/profile-photo
 *
 * Picking or removing a photo here only changes the PREVIEW on this page.
 * Nothing is saved until the learner clicks Save Changes: edit-profile.js
 * calls window.cobraByteProfilePhoto.save() after the name / username /
 * email are saved. Cancel, Back to profile or leaving the page simply
 * drops the waiting change - the saved photo stays as it was.
 *
 *   waiting upload -> POST /api/profile/avatar         (field "avatar")
 *   waiting remove -> POST /api/profile/avatar/remove
 *
 * The server decides whose photo it is (the logged-in learner) and
 * checks the file again (profile_avatar.py); the checks here only save
 * a round trip. The header icon changes only after a successful save,
 * through window.cobraByteProfileMenu.renderAvatar() (learner.js).
 * Styles: learner/css/profile-photo.css
 */
document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);

    const section = $('photoSection');
    if (!section) return;

    const MAX_BYTES = 2 * 1024 * 1024;
    const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
    const PHOTO_NAME = /\.(png|jpe?g|webp)$/i;
    const PHOTO_MAX_SIDE = 512;   // px - the photo is never shown larger than this
    const SHRUNK_EXTENSIONS = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
    const DEFAULT_ICON = '<i class="fa-solid fa-user"></i>';

    const avatar = $('photoAvatar');
    const changeBtn = $('changePhotoBtn');
    const removeBtn = $('removePhotoBtn');
    const undoBtn = $('undoPhotoBtn');
    const fileInput = $('photoInput');
    const message = $('photoMessage');

    let busy = false;
    let savedUrl = null;   // the photo that is really saved (null = default icon)
    // The change waiting for Save Changes:
    //   null | { kind: 'upload', file, previewUrl } | { kind: 'remove' }
    let pending = null;

    // kind: 'error' (red), 'pending' (waiting for Save Changes) or nothing (green)
    function showMessage(text, kind) {
        message.textContent = text || '';
        message.classList.toggle('is-error', kind === 'error');
        message.classList.toggle('is-pending', kind === 'pending');
        message.hidden = !text;
    }

    function setBusy(state) {
        busy = state;
        [changeBtn, removeBtn, undoBtn].forEach((btn) => { btn.disabled = state; });
    }

    function renderHeader(url) {
        if (window.cobraByteProfileMenu && window.cobraByteProfileMenu.renderAvatar) {
            window.cobraByteProfileMenu.renderAvatar(url || null);
        }
    }

    function dropPending() {
        if (pending && pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
        pending = null;
    }

    // Draws the circle on this page only: the waiting change if there is
    // one, otherwise the saved photo. The header is not touched here.
    function renderPreview() {
        const showingPending = !!pending;
        const url = pending ? (pending.previewUrl || null) : savedUrl;

        if (url) {
            const img = document.createElement('img');
            img.alt = '';
            img.addEventListener('error', () => {
                if (showingPending) {
                    // The picked file is not a readable image: forget it.
                    dropPending();
                    renderPreview();
                    showMessage('That file could not be opened as an image. Please pick another photo.', 'error');
                } else {
                    // A saved photo whose file is gone falls back to the default icon - no broken image.
                    savedUrl = null;
                    renderPreview();
                    renderHeader(null);
                }
            }, { once: true });
            img.src = url;
            avatar.replaceChildren(img);
        } else {
            avatar.innerHTML = DEFAULT_ICON;
        }

        changeBtn.textContent = url ? 'Change Photo' : 'Upload Photo';
        removeBtn.hidden = showingPending || !savedUrl;
        undoBtn.hidden = !showingPending;
    }

    // feat/images-in-database: photos are stored in the database, and they are
    // only ever shown small. So the picked image is scaled down here first
    // (longest side = PHOTO_MAX_SIDE, shape and transparency kept). If the
    // browser cannot do it, the original file is sent - the server checks
    // every upload again either way.
    function shrinkImage(file, maxSide) {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                try {
                    const longest = Math.max(img.naturalWidth, img.naturalHeight);
                    if (!longest) { resolve(file); return; }
                    const scale = Math.min(1, maxSide / longest);
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
                    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => {
                        const extension = blob && SHRUNK_EXTENSIONS[blob.type];
                        if (!extension || blob.size >= file.size) { resolve(file); return; }
                        resolve(new File([blob], `image.${extension}`, { type: blob.type }));
                    }, 'image/webp', 0.86);
                } catch (err) {
                    resolve(file);
                }
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        });
    }

    async function send(url, body) {
        const response = await fetch(url, { method: 'POST', credentials: 'include', body });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok && data.success === true, data };
    }

    // Change / Upload Photo: check the file, then only preview it.
    function pickPhoto(file) {
        const typeOk = file.type ? PHOTO_TYPES.includes(file.type) : PHOTO_NAME.test(file.name);
        if (!typeOk) { showMessage('Your photo must be a JPG, PNG or WebP image.', 'error'); return; }
        if (file.size > MAX_BYTES) { showMessage('Your photo must be 2 MB or smaller.', 'error'); return; }

        dropPending();
        pending = { kind: 'upload', file, previewUrl: URL.createObjectURL(file) };
        renderPreview();
        showMessage('New photo selected. Click Save Changes to apply it.', 'pending');
    }

    // Remove Photo: only preview the default icon.
    function markRemove() {
        dropPending();
        pending = { kind: 'remove' };
        renderPreview();
        showMessage('Your photo will be removed when you click Save Changes.', 'pending');
        undoBtn.focus();
    }

    // Undo: back to the saved photo, nothing waiting.
    function undoPending() {
        dropPending();
        renderPreview();
        showMessage('');
        changeBtn.focus();
    }

    // Called by edit-profile.js on Save Changes. Returns { ok, message }.
    async function savePending() {
        if (!pending) return { ok: true };

        const isUpload = pending.kind === 'upload';
        const failStart = isUpload ? 'Could not save your photo.' : 'Could not remove your photo.';

        setBusy(true);
        showMessage(isUpload ? 'Saving photo...' : 'Removing photo...', 'pending');
        try {
            let result;
            if (isUpload) {
                const photo = await shrinkImage(pending.file, PHOTO_MAX_SIDE);
                const body = new FormData();
                body.append('avatar', photo, photo.name);
                result = await send('/api/profile/avatar', body);
            } else {
                result = await send('/api/profile/avatar/remove');
            }

            if (!result.ok) {
                const text = result.data.message || `${failStart} Please try again.`;
                showMessage(text, 'error');   // the change stays waiting, so Save Changes can retry
                return { ok: false, message: text };
            }

            savedUrl = isUpload ? (result.data.avatar_url || null) : null;
            dropPending();
            renderPreview();
            renderHeader(savedUrl);
            showMessage('');
            return { ok: true };
        } catch (err) {
            const text = `${failStart} Check your connection and try again.`;
            showMessage(text, 'error');
            return { ok: false, message: text };
        } finally {
            setBusy(false);
        }
    }

    window.cobraByteProfilePhoto = {
        hasPending: () => !!pending,
        save: savePending,
    };

    changeBtn.addEventListener('click', () => { if (!busy) fileInput.click(); });
    fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';   // so picking the same file again still fires "change"
        if (file && !busy) pickPhoto(file);
    });
    removeBtn.addEventListener('click', () => { if (!busy) markRemove(); });
    undoBtn.addEventListener('click', () => { if (!busy) undoPending(); });

    // ---------------- Load ----------------
    fetch('/api/profile/me', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
            if (!data || !data.success) return;
            savedUrl = data.profile.avatar_url || null;
            renderPreview();
            renderHeader(savedUrl);
            section.hidden = false;
        })
        .catch(() => { /* the photo section stays hidden; the form still works */ });
});