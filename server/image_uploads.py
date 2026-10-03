"""
image_uploads.py - Shared image upload checks (badge icons, profile photos)
----------------------------------------------------------------------------
ONE copy of the rules for every image a user uploads, so the same checks
protect the Mentor > Achievements badge icons (achievements.py) and the
profile photos (profile_avatar.py):

    - PNG, JPG or WebP only. The file NAME must end in an allowed
      extension AND the file's first bytes must really be that kind of
      image (a renamed .exe / .svg / .html is refused).
    - A size limit chosen by the caller.
    - The saved file gets a random name: "<prefix>_<24 hex>.<ext>". The
      name the user's file had is never used, so there is no path
      traversal, no overwriting someone else's file and no collisions.

No Flask/session code and no database code here - callers decide where
the file goes and which table remembers its name.
"""

import os
import re
import secrets

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

# read_image_upload() error codes - callers turn them into their own messages.
ERROR_TYPE = "type"     # not a PNG / JPG / WebP image
ERROR_EMPTY = "empty"   # nothing in the file
ERROR_SIZE = "size"     # larger than the caller's limit


def has_upload(file_storage):
    """True when the request really carried a file in this field."""
    return bool(file_storage and (file_storage.filename or "").strip())


def _sniff_image_extension(data):
    """The image type from the file's first bytes (never from its name)."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def read_image_upload(file_storage, max_bytes):
    """
    Checks an uploaded image WITHOUT saving it.
    Returns (data, extension, error) - error is None when the image is
    valid, otherwise ERROR_TYPE / ERROR_EMPTY / ERROR_SIZE.
    """
    name_ext = os.path.splitext(file_storage.filename or "")[1].lower().lstrip(".")
    if name_ext not in ALLOWED_IMAGE_EXTENSIONS:
        return None, None, ERROR_TYPE

    data = file_storage.read(max_bytes + 1)
    if not data:
        return None, None, ERROR_EMPTY
    if len(data) > max_bytes:
        return None, None, ERROR_SIZE

    extension = _sniff_image_extension(data)
    if not extension:
        return None, None, ERROR_TYPE
    return data, extension, None


def stored_name_regex(prefix):
    """Matches only file names save_image() makes for this prefix."""
    return re.compile(rf"^{re.escape(prefix)}_[0-9a-f]{{24}}\.(png|jpg|webp)$")


def save_image(directory, prefix, data, extension):
    """Writes the image under a random name and returns that file name."""
    os.makedirs(directory, exist_ok=True)
    filename = f"{prefix}_{secrets.token_hex(12)}.{extension}"
    with open(os.path.join(directory, filename), "wb") as handle:
        handle.write(data)
    return filename


def image_exists(directory, prefix, filename):
    """True when `filename` is one of ours and is still on disk."""
    if not filename or not stored_name_regex(prefix).match(filename):
        return False
    return os.path.isfile(os.path.join(directory, filename))


def delete_image(directory, prefix, filename):
    """Removes a file save_image() made. Anything else is ignored. Never raises."""
    if not filename or not stored_name_regex(prefix).match(filename):
        return
    try:
        os.remove(os.path.join(directory, filename))
    except OSError:
        pass