"""
image_uploads.py - Uploaded images (badge icons, profile photos), kept in the DATABASE
---------------------------------------------------------------------------------------
Every image a user uploads is stored in uploaded_images_tbl, not in a
folder. So the images travel with the database (export / import) and
survive on hosting that wipes the app's files on every deploy.

ONE copy of the rules, shared by the Mentor > Achievements badge icons
(achievements.py) and the profile photos (profile_avatar.py):

    - PNG, JPG or WebP only. The file NAME must end in an allowed
      extension AND the file's first bytes must really be that kind of
      image (a renamed .exe / .svg / .html is refused).
    - A size limit chosen by the caller.
    - The saved image gets a random name: "<prefix>_<24 hex>.<ext>". The
      name the user's file had is never used. That name is what the
      owning table keeps (profile_tbl.avatar_file, badges_tbl.icon_file)
      and what the browser asks for: /media/<name>  (learner_profile.py).

save_image() / delete_image() run on the CALLER's cursor, inside the
caller's transaction - the image and the row that points at it are
saved or rolled back together, so there are no orphans.

Images uploaded BEFORE this (files in assets/uploads/avatars and
assets/uploads/badges) keep working: the first time one is asked for,
it is copied into the table.

Table (created lazily; same DDL as sql/uploaded_images.sql):
    uploaded_images_tbl - image_name (unique), mime_type, image_data, byte_size

No Flask/session code here.
"""

import os
import re
import secrets
from mysql.connector import Error

from cobradb import get_db_connection

IMAGES_TABLE = "uploaded_images_tbl"
MEDIA_URL_PREFIX = "/media/"

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
MIME_TYPES = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}

# read_image_upload() error codes - callers turn them into their own messages.
ERROR_TYPE = "type"     # not a PNG / JPG / WebP image
ERROR_EMPTY = "empty"   # nothing in the file
ERROR_SIZE = "size"     # larger than the caller's limit

# Where uploads lived before they moved into the database (prefix -> folder).
_UPLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../assets/uploads"))
LEGACY_DIRS = {
    "avatar": os.path.join(_UPLOADS_DIR, "avatars"),
    "badge": os.path.join(_UPLOADS_DIR, "badges"),
}
_ANY_NAME_REGEX = re.compile(r"^(avatar|badge)_[0-9a-f]{24}\.(png|jpg|webp)$")

_schema_ready = False   # the table check runs once per server start


def ensure_image_schema(cursor):
    global _schema_ready
    if _schema_ready:
        return
    cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {IMAGES_TABLE} (
                image_id INT(10) NOT NULL AUTO_INCREMENT,
                image_name VARCHAR(100) NOT NULL,
                mime_type VARCHAR(30) NOT NULL,
                image_data MEDIUMBLOB NOT NULL,
                byte_size INT(10) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (image_id),
                UNIQUE KEY uq_image_name (image_name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
    )
    _schema_ready = True


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
    """Matches only image names save_image() makes for this prefix."""
    return re.compile(rf"^{re.escape(prefix)}_[0-9a-f]{{24}}\.(png|jpg|webp)$")


def image_url(name):
    """Image name -> the URL the browser loads it from. None when there is no image."""
    return f"{MEDIA_URL_PREFIX}{name}" if name else None


def _legacy_path(name):
    """The old file for `name` (from before images moved into the database), or None."""
    if not name or not _ANY_NAME_REGEX.match(name):
        return None
    path = os.path.join(LEGACY_DIRS[name.split("_", 1)[0]], name)
    return path if os.path.isfile(path) else None


def save_image(cursor, prefix, data, extension):
    """
    Stores the image under a random name and returns that name.
    Runs on the caller's cursor: the caller commits (or rolls back) it
    together with the row that will point at the image.
    """
    ensure_image_schema(cursor)
    name = f"{prefix}_{secrets.token_hex(12)}.{extension}"
    cursor.execute(
        f"""INSERT INTO {IMAGES_TABLE} (image_name, mime_type, image_data, byte_size)
            VALUES (%s, %s, %s, %s)""",
        (name, MIME_TYPES[extension], data, len(data))
    )
    return name


def delete_image(cursor, prefix, name):
    """
    Removes an image save_image() made for this prefix (and its old file,
    if it still has one). Anything else is ignored. Caller's transaction.
    """
    if not name or not stored_name_regex(prefix).match(name):
        return
    ensure_image_schema(cursor)
    cursor.execute(f"DELETE FROM {IMAGES_TABLE} WHERE image_name = %s", (name,))
    path = _legacy_path(name)
    if path:
        try:
            os.remove(path)
        except OSError:
            pass


def image_exists(cursor, prefix, name):
    """True when `name` is one of ours and can still be served."""
    if not name or not stored_name_regex(prefix).match(name):
        return False
    ensure_image_schema(cursor)
    cursor.execute(f"SELECT 1 FROM {IMAGES_TABLE} WHERE image_name = %s LIMIT 1", (name,))
    if cursor.fetchone() is not None:
        return True
    return _legacy_path(name) is not None   # an old file: served (and copied in) on first request


def get_image(name):
    """
    For the /media/<name> route: (image bytes, mime type), or None when
    there is no such image. Opens its own connection. An image that only
    exists as an old file is copied into the table first.
    """
    if not name or not _ANY_NAME_REGEX.match(name):
        return None

    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor()
        ensure_image_schema(cursor)
        cursor.execute(f"SELECT image_data, mime_type FROM {IMAGES_TABLE} WHERE image_name = %s", (name,))
        row = cursor.fetchone()
        if row is not None:
            cursor.close()
            return bytes(row[0]), row[1]

        path = _legacy_path(name)
        if path is None:
            cursor.close()
            return None
        with open(path, "rb") as handle:
            data = handle.read()
        extension = _sniff_image_extension(data)
        if not extension:
            cursor.close()
            return None
        cursor.execute(
            f"""INSERT IGNORE INTO {IMAGES_TABLE} (image_name, mime_type, image_data, byte_size)
                VALUES (%s, %s, %s, %s)""",
            (name, MIME_TYPES[extension], data, len(data))
        )
        connection.commit()
        cursor.close()
        return data, MIME_TYPES[extension]
    except (Error, OSError) as e:
        print(f"image_uploads: could not load {name}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()