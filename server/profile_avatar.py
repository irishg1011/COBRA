"""
profile_avatar.py - Profile photo for every account (learner, admin, mentor)
----------------------------------------------------------------------------
One profile photo per account. profile_tbl.avatar_file keeps the image's
NAME; the image itself is stored in the database (uploaded_images_tbl,
see image_uploads.py) and the browser loads it from /media/<name>.

    get_avatar_url(cursor, acc_id)   - URL of the account's photo, or None
                                       (None = show the default icon)
    set_avatar(acc_id, file)         - upload / replace
    remove_avatar(acc_id)            - back to the default icon

No Flask/session code here. The callers (learner_profile.py for
learners, admin_routes.py for staff) always pass the acc_id of the
LOGGED-IN account from the session - never an id sent by the browser -
so nobody can change another account's photo.

A new photo always gets a new random name (image_uploads.py), so the
browser can never keep showing the old one from its cache. The replaced
or removed image is deleted in the same database transaction.
"""

from mysql.connector import Error

from cobradb import get_db_connection
from image_uploads import (
    has_upload, read_image_upload, save_image, delete_image, image_exists, image_url,
    ensure_image_schema, ERROR_SIZE, ERROR_EMPTY,
)

PROFILE_TABLE = "profile_tbl"

AVATAR_FILE_PREFIX = "avatar"
MAX_AVATAR_BYTES = 2 * 1024 * 1024

NO_FILE_MESSAGE = "Choose a photo to upload."
TYPE_MESSAGE = "Your photo must be a JPG, PNG or WebP image."
SIZE_MESSAGE = "Your photo must be 2 MB or smaller."
EMPTY_MESSAGE = "That file is empty. Choose another photo."

_schema_ready = False   # the column check runs once per server start


def ensure_avatar_schema(cursor):
    """Adds profile_tbl.avatar_file when it is missing. Safe to call any time."""
    global _schema_ready
    if _schema_ready:
        return
    ensure_image_schema(cursor)   # DDL first, so it never interrupts a save in progress
    cursor.execute(f"SHOW COLUMNS FROM {PROFILE_TABLE}")
    columns = set()
    for row in cursor.fetchall():
        columns.add(next(iter(row.values())) if isinstance(row, dict) else row[0])
    if "avatar_file" not in columns:
        cursor.execute(f"ALTER TABLE {PROFILE_TABLE} ADD COLUMN avatar_file VARCHAR(100) NULL")
    _schema_ready = True


def _current_file(cursor, acc_id):
    """(profile row exists?, avatar_file or None) for this account."""
    cursor.execute(
        f"SELECT avatar_file FROM {PROFILE_TABLE} WHERE acc_id = %s ORDER BY prof_id LIMIT 1",
        (acc_id,)
    )
    row = cursor.fetchone()
    if row is None:
        return False, None
    return True, (row["avatar_file"] if isinstance(row, dict) else row[0])


def get_avatar_url(cursor, acc_id):
    """
    The account's photo URL, or None for the default icon. Uses the
    CALLER's cursor and never raises - a missing photo must not break
    the page that shows it.
    """
    if not acc_id:
        return None
    try:
        ensure_avatar_schema(cursor)
        _, avatar_file = _current_file(cursor, acc_id)
        if not image_exists(cursor, AVATAR_FILE_PREFIX, avatar_file):
            return None   # no photo, or its image is gone -> default icon
        return image_url(avatar_file)
    except Error as e:
        print(f"profile_avatar: could not load the photo for {acc_id}: {e}")
        return None


def _fail(message, status=400):
    return {"success": False, "message": message}, status


def set_avatar(acc_id, file_storage):
    """
    Upload / replace the photo of `acc_id` (the logged-in account).
    `file_storage` is request.files.get('avatar').
    Returns (payload, http_status); payload carries avatar_url on success.
    """
    if not acc_id:
        return _fail("Please log in again.", 401)
    if not has_upload(file_storage):
        return _fail(NO_FILE_MESSAGE)

    data, extension, error = read_image_upload(file_storage, MAX_AVATAR_BYTES)
    if error:
        return _fail({ERROR_SIZE: SIZE_MESSAGE, ERROR_EMPTY: EMPTY_MESSAGE}.get(error, TYPE_MESSAGE))

    connection = get_db_connection()
    if connection is None:
        return _fail("Could not connect to the database.", 500)

    try:
        cursor = connection.cursor(dictionary=True)
        ensure_avatar_schema(cursor)
        has_profile, old_file = _current_file(cursor, acc_id)

        new_file = save_image(cursor, AVATAR_FILE_PREFIX, data, extension)
        if has_profile:
            # The existing profile row is updated - never a second one.
            cursor.execute(
                f"UPDATE {PROFILE_TABLE} SET avatar_file = %s WHERE acc_id = %s",
                (new_file, acc_id)
            )
        else:
            cursor.execute(
                f"INSERT INTO {PROFILE_TABLE} (acc_id, avatar_file) VALUES (%s, %s)",
                (acc_id, new_file)
            )
        delete_image(cursor, AVATAR_FILE_PREFIX, old_file)   # the replaced photo
        connection.commit()   # new image + reference + old image removed: all or nothing
        cursor.close()

        return {
            "success": True,
            "message": "Profile photo updated.",
            "avatar_url": image_url(new_file),
        }, 200

    except (Error, OSError) as e:
        print(f"profile_avatar: failed to save the photo for {acc_id}: {e}")
        try:
            connection.rollback()   # also undoes the stored image - no orphan
        except Error:
            pass
        return _fail("Could not save your photo. Please try again.", 500)
    finally:
        if connection.is_connected():
            connection.close()


def remove_avatar(acc_id):
    """Back to the default icon for `acc_id`. Returns (payload, http_status)."""
    if not acc_id:
        return _fail("Please log in again.", 401)

    connection = get_db_connection()
    if connection is None:
        return _fail("Could not connect to the database.", 500)

    try:
        cursor = connection.cursor(dictionary=True)
        ensure_avatar_schema(cursor)
        _, old_file = _current_file(cursor, acc_id)

        cursor.execute(f"UPDATE {PROFILE_TABLE} SET avatar_file = NULL WHERE acc_id = %s", (acc_id,))
        delete_image(cursor, AVATAR_FILE_PREFIX, old_file)
        connection.commit()
        cursor.close()

        return {"success": True, "message": "Profile photo removed.", "avatar_url": None}, 200

    except Error as e:
        print(f"profile_avatar: failed to remove the photo for {acc_id}: {e}")
        try:
            connection.rollback()
        except Error:
            pass
        return _fail("Could not remove your photo. Please try again.", 500)
    finally:
        if connection.is_connected():
            connection.close()