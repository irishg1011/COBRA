"""
video_tutorials.py - New Video Tutorial DB Integration
--------------------------------------------------------------------------------------
Pure DB-access helpers backing Admin > Manage Learning Resources > New
Video Tutorial (upload-video-tutorial.html), mirroring
coding_exercises.py's style exactly: this file never touches Flask/
session state directly - admin_routes.py is the only place these get
turned into HTTP responses/JSON.

SCHEMA
video_tutorials_tbl (existing, per cobra_db.sql) only ships with:
    video_tutorial_id  int(10) AUTO_INCREMENT PRIMARY KEY
    resource_id        int(10)  FK -> learning_resources_tbl.resource_id
    file_path          varchar(255)
    file_size          varchar(50)

Exactly like coding_exercises_tbl (own exercise_title, a resource_id
FK to the parent Lesson, no cat_id/module_id of its own),
video_tutorials_tbl's resource_id points at an EXISTING Lesson (a
learning_resources_tbl row) selected through the SAME Category ->
Module -> Lesson cascading dropdowns already used by Create Learning
Activity / Create Coding Exercise. A Video Tutorial therefore attaches
to that existing Lesson rather than creating a second, duplicate
learning_resources_tbl row of its own.

Because video_tutorials_tbl doesn't yet have anywhere to store the
Video Tutorial's own title/description/status/uploader, this file
extends it the exact same lazy, idempotent way this project already
evolves other tables at runtime (see coding_exercises.py's
ensure_exercise_is_archived_column()) - via "ALTER TABLE ... ADD
COLUMN IF NOT EXISTS", never a manual migration step and never a
brand-new duplicate table.

Status (Draft/Published/Archived) reuses learning_activities_stats_tbl
- the SAME shared lookup table coding_exercises_tbl already reuses for
its own exercise_stats_id - rather than creating a second stats table.
"""

from mysql.connector import Error
from cobradb import get_db_connection

VIDEO_TUTORIALS_TABLE = "video_tutorials_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
MODULES_TABLE = "modules_tbl"
CATEGORY_TABLE = "category_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"  # reused, same table coding_exercises_tbl uses

DEFAULT_VIDEO_STATUSES = ["Draft", "Published", "Archived"]

_video_columns_ensured = False
_video_stats_ensured = False


def ensure_video_tutorials_columns(connection):
    """
    Idempotently extends video_tutorials_tbl with the columns a real
    Video Tutorial needs beyond its original file_path/file_size shape
    - video_title, description, video_stats_id, uploaded_by,
    created_at, updated_at. Safe to call on every request - MariaDB/
    MySQL no-ops "ADD COLUMN IF NOT EXISTS" once the column already
    exists - and gated behind a module-level flag so it only
    round-trips once per process lifetime, the same convention as
    coding_exercises.py's ensure_exercise_is_archived_column().
    """
    global _video_columns_ensured
    if _video_columns_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {VIDEO_TUTORIALS_TABLE} "
            f"ADD COLUMN IF NOT EXISTS video_title VARCHAR(255) NOT NULL DEFAULT ''"
        )
        cursor.execute(
            f"ALTER TABLE {VIDEO_TUTORIALS_TABLE} "
            f"ADD COLUMN IF NOT EXISTS description LONGTEXT NULL"
        )
        cursor.execute(
            f"ALTER TABLE {VIDEO_TUTORIALS_TABLE} "
            f"ADD COLUMN IF NOT EXISTS video_stats_id INT(10) NULL"
        )
        cursor.execute(
            f"ALTER TABLE {VIDEO_TUTORIALS_TABLE} "
            f"ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(15) NULL"
        )
        cursor.execute(
            f"ALTER TABLE {VIDEO_TUTORIALS_TABLE} "
            f"ADD COLUMN IF NOT EXISTS created_at DATETIME NULL"
        )
        cursor.execute(
            f"ALTER TABLE {VIDEO_TUTORIALS_TABLE} "
            f"ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL"
        )
        connection.commit()
        cursor.close()
        _video_columns_ensured = True
    except Error as e:
        print(f"video_tutorials: failed to ensure {VIDEO_TUTORIALS_TABLE} columns: {e}")


def ensure_video_stats(connection):
    """
    Ensures Draft/Published/Archived exist in
    learning_activities_stats_tbl - the SAME shared table
    coding_exercises_tbl already reuses for its own status (see
    coding_exercises.ensure_exercise_stats()). Idempotent - a no-op if
    another feature already seeded these rows.
    """
    global _video_stats_ensured
    ensure_video_tutorials_columns(connection)
    if _video_stats_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT la_stats_name FROM {LA_STATS_TABLE}")
        existing = {row[0] for row in cursor.fetchall()}
        missing = [s for s in DEFAULT_VIDEO_STATUSES if s not in existing]
        for name in missing:
            cursor.execute(
                f"INSERT INTO {LA_STATS_TABLE} (la_stats_name) VALUES (%s)",
                (name,)
            )
        if missing:
            connection.commit()
        cursor.close()
        _video_stats_ensured = True
    except Error as e:
        print(f"video_tutorials: failed to seed {LA_STATS_TABLE}: {e}")


def _get_status_id(connection, name):
    cursor = connection.cursor()
    cursor.execute(f"SELECT la_stats_id FROM {LA_STATS_TABLE} WHERE la_stats_name = %s", (name,))
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else None


def format_video_title(title):
    """Sentence-case formatting, matching lesson_validation.
    format_lesson_title() / coding_exercises.format_exercise_title()'s
    exact convention."""
    cleaned = (title or "").strip()
    if not cleaned:
        return ""
    lower = cleaned.lower()
    return lower[0].upper() + lower[1:]


def validate_video_title(title):
    """
    Task requirement #4 / #13: Video Tutorial Title is required before
    Save Draft or Publish. No global-uniqueness rule is requested for
    this field (unlike Lesson Name / Exercise Title / Activity Title
    elsewhere in this project), so this only checks presence.

    Returns (is_valid: bool, error_message: str | None, formatted_title: str)
    """
    formatted = format_video_title(title)
    if not formatted:
        return False, "Video Tutorial Title is required.", ""
    return True, None, formatted


def validate_lesson_hierarchy(cat_id, module_id, resource_id):
    """
    Task requirement #14: the backend must independently verify
    (never just trust the frontend's cascading dropdowns) that:
      - the selected Module actually belongs to the selected Category
      - the selected Lesson (resource_id) actually belongs to the
        selected Module

    Returns (is_valid: bool, error_message: str | None)
    """
    if not cat_id or not module_id or not resource_id:
        return False, "Please select a Category, Module, and Lesson."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT module_id FROM {MODULES_TABLE} WHERE module_id = %s AND cat_id = %s",
            (module_id, cat_id)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "The selected Module does not belong to the selected Category."

        cursor.execute(
            f"SELECT resource_id FROM {LEARNING_RESOURCES_TABLE} WHERE resource_id = %s AND module_id = %s",
            (resource_id, module_id)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "The selected Lesson does not belong to the selected Module."

        cursor.close()
        return True, None
    except Error as e:
        print(f"video_tutorials: failed to validate hierarchy: {e}")
        return False, "Could not verify the Category/Module/Lesson selection."
    finally:
        if connection.is_connected():
            connection.close()


def get_video_tutorial(video_tutorial_id):
    """
    Companion read-path to save_video_tutorial() below - fetches a
    previously saved video tutorial's own fields PLUS its parent
    Lesson's cat_id/module_id/resource_title (via JOIN, never
    hardcoded), so admin_routes.py's upload_video_tutorial() GET
    handler can hand it straight to the template and reopen the page
    exactly as it was left - matching resource_draft.get_lesson_draft()
    / coding_exercises.get_coding_exercise()'s exact convention.

    Returns None if video_tutorial_id is missing/invalid, the row
    doesn't exist, or the database is unreachable. Callers should
    treat None exactly like "no draft to reload" (a normal blank form).
    """
    if not video_tutorial_id:
        return None
    try:
        vid = int(video_tutorial_id)
    except (TypeError, ValueError):
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        ensure_video_stats(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""
            SELECT
                vt.video_tutorial_id, vt.resource_id, vt.file_path, vt.file_size,
                vt.video_title, vt.description, vt.video_stats_id,
                lr.cat_id, lr.module_id, lr.resource_title,
                stats.la_stats_name AS status
            FROM {VIDEO_TUTORIALS_TABLE} vt
            LEFT JOIN {LEARNING_RESOURCES_TABLE} lr ON vt.resource_id = lr.resource_id
            LEFT JOIN {LA_STATS_TABLE} stats ON vt.video_stats_id = stats.la_stats_id
            WHERE vt.video_tutorial_id = %s
            """,
            (vid,)
        )
        row = cursor.fetchone()
        cursor.close()
        return row
    except Error as e:
        print(f"video_tutorials: failed to get video tutorial {video_tutorial_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def save_video_tutorial(data, status="Draft", uploaded_by=None):
    """
    Persists (creating or updating) a Video Tutorial. Supports both
    Save Draft (status="Draft") and Publish (status="Published"),
    mirroring coding_exercises.save_coding_exercise()'s exact shape -
    a single function both admin_routes.py endpoints call, so Save
    Draft and Publish can never disagree about how a video tutorial is
    stored.

    Args:
        data (dict): {
            "video_tutorial_id": int | str | None,
            "video_title": str,
            "category_id": int | str,
            "module_id": int | str,
            "resource_id": int | str,       # the selected Lesson
            "description": str,
            "file_path": str | None,        # set only when a NEW file was uploaded this request
            "file_size": int | str | None,
        }
        status ("Draft" | "Published")
        uploaded_by (str | None): the saving admin's acc_id (from
            Flask session["admin_id"]) - only ever set on the initial
            INSERT; an update never changes who originally uploaded it.

    Returns:
        (success: bool, video_tutorial_id: int | None, message: str)
    """
    connection = get_db_connection()
    if connection is None:
        return False, None, "Could not connect to the database."

    try:
        ensure_video_stats(connection)
        cursor = connection.cursor(dictionary=True)

        video_tutorial_id = data.get("video_tutorial_id")
        if video_tutorial_id:
            try:
                video_tutorial_id = int(video_tutorial_id)
            except (ValueError, TypeError):
                video_tutorial_id = None

        is_valid_title, title_err, formatted_title = validate_video_title(data.get("video_title"))
        if not is_valid_title:
            cursor.close()
            return False, None, title_err

        cat_id = data.get("category_id") or None
        module_id = data.get("module_id") or None
        resource_id = data.get("resource_id") or None

        hierarchy_ok, hierarchy_err = validate_lesson_hierarchy(cat_id, module_id, resource_id)
        if not hierarchy_ok:
            cursor.close()
            return False, None, hierarchy_err

        try:
            resource_id = int(resource_id)
        except (TypeError, ValueError):
            cursor.close()
            return False, None, "Invalid Lesson selection."

        description = (data.get("description") or "").strip()
        status_name = status if status in ("Draft", "Published", "Archived") else "Draft"

        # Task #10 vs #11: Publish requires a video file (either
        # uploaded THIS request, or already attached from a prior Save
        # Draft) and a description - Save Draft does not.
        new_file_path = data.get("file_path") or None
        new_file_size = data.get("file_size") or None

        existing_file_path = None
        existing_file_size = None
        if video_tutorial_id:
            cursor.execute(
                f"SELECT file_path, file_size FROM {VIDEO_TUTORIALS_TABLE} WHERE video_tutorial_id = %s",
                (video_tutorial_id,)
            )
            existing_row = cursor.fetchone()
            if existing_row:
                existing_file_path = existing_row.get("file_path")
                existing_file_size = existing_row.get("file_size")

        final_file_path = new_file_path or existing_file_path
        final_file_size = new_file_size or existing_file_size

        if status_name == "Published":
            if not final_file_path:
                cursor.close()
                return False, None, "Please upload a video file before publishing."
            if not description:
                cursor.close()
                return False, None, "Please write a description about the video before publishing."

        status_id = _get_status_id(connection, status_name)
        if not status_id:
            cursor.close()
            return False, None, "Could not resolve the status for this video tutorial."

        uploader = uploaded_by or data.get("uploaded_by") or None
        final_file_size_str = str(final_file_size) if final_file_size else None

        if video_tutorial_id:
            cursor.execute(
                f"SELECT video_tutorial_id FROM {VIDEO_TUTORIALS_TABLE} WHERE video_tutorial_id = %s",
                (video_tutorial_id,)
            )
            if cursor.fetchone() is None:
                cursor.close()
                return False, None, "This video tutorial no longer exists. Please refresh and try again."

            cursor.execute(
                f"""
                UPDATE {VIDEO_TUTORIALS_TABLE}
                SET resource_id = %s, video_title = %s, description = %s,
                    file_path = %s, file_size = %s, video_stats_id = %s,
                    updated_at = NOW()
                WHERE video_tutorial_id = %s
                """,
                (resource_id, formatted_title, description, final_file_path,
                 final_file_size_str, status_id, video_tutorial_id)
            )
            connection.commit()
            cursor.close()
            action_msg = "published" if status_name == "Published" else "saved as draft"
            return True, video_tutorial_id, f"Video tutorial {action_msg} successfully!"

        cursor.execute(
            f"""
            INSERT INTO {VIDEO_TUTORIALS_TABLE}
            (resource_id, video_title, description, file_path, file_size,
             video_stats_id, uploaded_by, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            """,
            (resource_id, formatted_title, description, final_file_path,
             final_file_size_str, status_id, uploader)
        )
        new_id = cursor.lastrowid
        connection.commit()
        cursor.close()
        action_msg = "published" if status_name == "Published" else "saved as draft"
        return True, new_id, f"Video tutorial {action_msg} successfully!"

    except Error as e:
        connection.rollback()
        print(f"video_tutorials: failed to save video tutorial: {e}")
        return False, None, f"Database error while saving video tutorial: {e}"
    finally:
        if connection.is_connected():
            connection.close()