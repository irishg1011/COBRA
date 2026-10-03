/**
 * image-shrink.js - shrinks a picked image in the browser before upload
 * --------------------------------------------------------------------
 * feat/images-in-database
 *
 * Uploaded images are stored in the database, and they are only ever
 * shown small (a profile photo, a badge icon). So before an image is
 * sent, it is scaled down here to the largest size it is displayed at.
 * A phone photo of several MB becomes a few dozen KB: quicker to upload,
 * quicker to load, and small in the database.
 *
 *   window.cobraByteShrinkImage(file, maxSide)  ->  Promise<File>
 *
 * maxSide: the longest side in pixels after shrinking (the shape is kept).
 * Transparent backgrounds are kept. If the browser cannot shrink it (or
 * the result would not be smaller), the ORIGINAL file is returned - the
 * server checks every upload again either way.
 * Loaded from admin-header.html; used by admin-profile-photo.js and
 * admin-achievements.js.
 */
(function () {
    "use strict";

    const EXTENSIONS = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

    window.cobraByteShrinkImage = function (file, maxSide) {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const img = new Image();

            img.onload = () => {
                URL.revokeObjectURL(url);
                try {
                    const longest = Math.max(img.naturalWidth, img.naturalHeight);
                    if (!longest) { resolve(file); return; }
                    const scale = Math.min(1, maxSide / longest);
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
                    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

                    // WebP keeps transparency and is small; a browser that cannot
                    // write WebP hands back a PNG instead, which is fine too.
                    canvas.toBlob((blob) => {
                        const extension = blob && EXTENSIONS[blob.type];
                        if (!extension || blob.size >= file.size) { resolve(file); return; }
                        resolve(new File([blob], `image.${extension}`, { type: blob.type }));
                    }, "image/webp", 0.86);
                } catch (err) {
                    resolve(file);
                }
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        });
    };
})();