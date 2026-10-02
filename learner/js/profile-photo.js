/*
 * profile-photo.js - learner profile photo on Edit Profile (/profile/edit)
 * feat/profile-photo
 *
 * Upload / Change Photo -> POST /api/profile/avatar         (field "avatar")
 * Remove Photo          -> asks first, then POST /api/profile/avatar/remove
 *
 * The photo is saved right away - it is separate from the Save Changes
 * button and never touches the name / username / email fields.
 * The server decides whose photo it is (the logged-in learner) and
 * checks the file again (profile_avatar.py); the checks here only save
 * a round trip. After a change the header icon updates through
 * window.cobraByteProfileMenu.renderAvatar() (learner.js).
 * Styles: learner/css/profile-photo.css
 */
document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);

    const section = $('photoSection');
    if (!section) return;

    const MAX_BYTES = 2 * 1024 * 1024;
    const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
    const PHOTO_NAME = /\.(png|jpe?g|webp)$/i;
    const DEFAULT_ICON = '<i class="fa-solid fa-user"></i>';

    const avatar = $('photoAvatar');
    const actions = $('photoActions');
    const confirmRow = $('photoConfirm');
    const changeBtn = $('changePhotoBtn');
    const removeBtn = $('removePhotoBtn');
    const cancelRemoveBtn = $('cancelRemovePhotoBtn');
    const confirmRemoveBtn = $('confirmRemovePhotoBtn');
    const fileInput = $('photoInput');
    const message = $('photoMessage');

    let busy = false;

    function showMessage(text, isError) {
        message.textContent = text || '';
        message.classList.toggle('is-error', !!isError);
        message.hidden = !text;
    }

    function setBusy(state) {
        busy = state;
        [changeBtn, removeBtn, cancelRemoveBtn, confirmRemoveBtn].forEach((btn) => { btn.disabled = state; });
    }

    function showConfirm(confirming) {
        actions.hidden = confirming;
        confirmRow.hidden = !confirming;
    }

    // One place that draws the current photo: here and in the header.
    function renderPhoto(url) {
        if (url) {
            const img = document.createElement('img');
            img.alt = '';
            // A photo whose file is gone falls back to the default icon - no broken image.
            img.addEventListener('error', () => renderPhoto(null), { once: true });
            img.src = url;
            avatar.replaceChildren(img);
        } else {
            avatar.innerHTML = DEFAULT_ICON;
        }
        changeBtn.textContent = url ? 'Change Photo' : 'Upload Photo';
        removeBtn.hidden = !url;
        if (window.cobraByteProfileMenu && window.cobraByteProfileMenu.renderAvatar) {
            window.cobraByteProfileMenu.renderAvatar(url || null);
        }
    }

    async function send(url, body) {
        const response = await fetch(url, { method: 'POST', credentials: 'include', body });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok && data.success === true, data };
    }

    async function upload(file) {
        const typeOk = file.type ? PHOTO_TYPES.includes(file.type) : PHOTO_NAME.test(file.name);
        if (!typeOk) { showMessage('Your photo must be a JPG, PNG or WebP image.', true); return; }
        if (file.size > MAX_BYTES) { showMessage('Your photo must be 2 MB or smaller.', true); return; }

        const body = new FormData();
        body.append('avatar', file);

        setBusy(true);
        showMessage('Uploading...');
        try {
            const { ok, data } = await send('/api/profile/avatar', body);
            if (ok) {
                renderPhoto(data.avatar_url);
                showMessage(data.message || 'Profile photo updated.');
            } else {
                showMessage(data.message || 'Could not save your photo. Please try again.', true);
            }
        } catch (err) {
            showMessage('Could not save your photo. Check your connection and try again.', true);
        } finally {
            setBusy(false);
        }
    }

    async function removePhoto() {
        setBusy(true);
        try {
            const { ok, data } = await send('/api/profile/avatar/remove');
            showConfirm(false);
            if (ok) {
                renderPhoto(null);
                showMessage(data.message || 'Profile photo removed.');
            } else {
                showMessage(data.message || 'Could not remove your photo. Please try again.', true);
            }
        } catch (err) {
            showConfirm(false);
            showMessage('Could not remove your photo. Check your connection and try again.', true);
        } finally {
            setBusy(false);
            changeBtn.focus();
        }
    }

    changeBtn.addEventListener('click', () => { if (!busy) fileInput.click(); });
    fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';   // so picking the same file again still fires "change"
        if (file) upload(file);
    });
    removeBtn.addEventListener('click', () => { showMessage(''); showConfirm(true); cancelRemoveBtn.focus(); });
    cancelRemoveBtn.addEventListener('click', () => { showConfirm(false); removeBtn.focus(); });
    confirmRemoveBtn.addEventListener('click', removePhoto);

    // ---------------- Load ----------------
    fetch('/api/profile/me', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
            if (!data || !data.success) return;
            renderPhoto(data.profile.avatar_url || null);
            section.hidden = false;
        })
        .catch(() => { /* the photo section stays hidden; the form still works */ });
});