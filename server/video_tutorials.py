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

Task: New Video Tutorial no longer uploads a file to disk/the database
at all - the admin pastes a YouTube link instead, which gets embedded
(never a visible/clickable raw link - see upload-video-tutorial-ui.js's
inline <iframe> embed). Rather than add a new column for this (this
project's own convention - see coding_exercises.py's is_archived
column - is to extend a table via idempotent "ADD COLUMN IF NOT
EXISTS" only when genuinely needed), the EXISTING file_path column is
reused to store just the 11-character YouTube video id (e.g.
"dQw4w9WgXcQ") - short, stable, and exactly what an <iframe
src="https://www.youtube.com/embed/{id}"> needs, without storing
tracking query params or which exact URL format the admin pasted.
file_size no longer applies to a YouTube-hosted video and is always
left NULL going forward (still present in the table for any old rows
from before this change).

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

import re

from mysql.connector import Error
from cobradb import get_db_connection
from validators import validate_title_length  # feat/title-char-limit

VIDEO_TUTORIALS_TABLE = "video_tutorials_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
MODULES_TABLE = "modules_tbl"
CATEGORY_TABLE = "category_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"  # reused, same table coding_exercises_tbl uses

DEFAULT_VIDEO_STATUSES = ["Draft", "Published", "Archived"]

# Matches the video id out of every common YouTube URL shape an admin
# might paste: youtu.be/ID, youtube.com/watch?v=ID (with or without
# other query params), youtube.com/embed/ID, youtube.com/shorts/ID.
_YOUTUBE_ID_PATTERN = re.compile(
    r"(?:youtube(?:-nocookie)?\.com/(?:watch\?v=|embed/|shorts/|v/)|youtu\.be/)([A-Za-z0-9_-]{11})"
)

_video_columns_ensured = False
_video_stats_ensured = False


def extract_youtube_video_id(url):
    """
    Pulls the 11-character video id out of any common YouTube URL
    shape. Returns None if `url` isn't a recognizable YouTube link at
    all (also None for empty/whitespace-only input).
    """
    if not url:
        return None
    match = _YOUTUBE_ID_PATTERN.search(url.strip())
    return match.group(1) if match else None


def validate_youtube_url(url):
    """
    Returns (is_valid: bool, error_message: str | None, video_id: str | None).
    An empty/blank url is treated as "no video provided yet" (valid,
    video_id None) - Save Draft doesn't require one; save_video_tutorial()
    below is what actually enforces "required for Publish".
    """
    cleaned = (url or "").strip()
    if not cleaned:
        return True, None, None
    video_id = extract_youtube_video_id(cleaned)
    if not video_id:
        return False, "Please paste a valid YouTube video link.", None
    return True, None, video_id


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
    is_valid, length_msg = validate_title_length(formatted, "video", "Video Tutorial Title")
    if not is_valid:
        return False, length_msg, ""
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
                vt.video_tutorial_id, vt.resource_id, vt.file_path AS video_id, vt.file_size,
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
        if row and row.get("video_id"):
            row["youtube_url"] = f"https://www.youtube.com/watch?v={row['video_id']}"
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
            "video_url": str | None,        # a pasted YouTube link - validated/
                                             # normalized to just its video id here
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

        url_ok, url_err, new_video_id = validate_youtube_url(data.get("video_url"))
        if not url_ok:
            cursor.close()
            return False, None, url_err

        # Task #10 vs #11: Publish requires a YouTube video link
        # (either provided THIS request, or already attached from a
        # prior Save Draft) and a description - Save Draft does not.
        existing_video_id = None
        if video_tutorial_id:
            cursor.execute(
                f"SELECT file_path FROM {VIDEO_TUTORIALS_TABLE} WHERE video_tutorial_id = %s",
                (video_tutorial_id,)
            )
            existing_row = cursor.fetchone()
            if existing_row:
                existing_video_id = existing_row.get("file_path")

        final_video_id = new_video_id or existing_video_id

        if status_name == "Published":
            if not final_video_id:
                cursor.close()
                return False, None, "Please add a YouTube video link before publishing."
            if not description:
                cursor.close()
                return False, None, "Please write a description about the video before publishing."

        status_id = _get_status_id(connection, status_name)
        if not status_id:
            cursor.close()
            return False, None, "Could not resolve the status for this video tutorial."

        uploader = uploaded_by or data.get("uploaded_by") or None

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
                    file_path = %s, file_size = NULL, video_stats_id = %s,
                    updated_at = NOW()
                WHERE video_tutorial_id = %s
                """,
                (resource_id, formatted_title, description, final_video_id,
                 status_id, video_tutorial_id)
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
            VALUES (%s, %s, %s, %s, NULL, %s, %s, NOW(), NOW())
            """,
            (resource_id, formatted_title, description, final_video_id,
             status_id, uploader)
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


def archive_video_tutorial(video_tutorial_id):
    """
    Soft-archives one Video Tutorial by flipping its video_stats_id to
    "Archived" - reuses the SAME learning_activities_stats_tbl lookup
    (and its already-seeded "Archived" row) this file already relies
    on for Draft/Published, never a DELETE and never a new table/
    column. Backs Manage Learning Resources' new Archive checklist
    ("Lesson Content" / "Video Tutorial" / "All") when "Video Tutorial"
    is checked - independent of archive_resource() in
    resource_publishing.py, since a video's own status
    (video_stats_id) is separate from its parent Lesson's (lr_stats_id).

    Returns (bool, str) - (success, message).
    """
    if not video_tutorial_id:
        return False, "Video tutorial ID is required."
    try:
        vid = int(video_tutorial_id)
    except (TypeError, ValueError):
        return False, "Invalid video tutorial ID."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_video_stats(connection)
        cursor = connection.cursor()

        cursor.execute(f"SELECT video_tutorial_id FROM {VIDEO_TUTORIALS_TABLE} WHERE video_tutorial_id = %s", (vid,))
        if not cursor.fetchone():
            cursor.close()
            return False, "Video tutorial not found."

        # Task #123: backend-level guard - a Published video can never
        # be archived directly, matching the same rule enforced
        # everywhere else in this admin.
        cursor.execute(
            f"""SELECT vts.la_stats_name FROM {VIDEO_TUTORIALS_TABLE} vt
                LEFT JOIN {LA_STATS_TABLE} vts ON vt.video_stats_id = vts.la_stats_id
                WHERE vt.video_tutorial_id = %s""",
            (vid,)
        )
        (current_status,) = cursor.fetchone()
        if current_status == "Published":
            cursor.close()
            return False, (
                "This video tutorial is Published. You must unpublish it "
                "first before you can archive it."
            )

        status_id = _get_status_id(connection, "Archived")
        if not status_id:
            cursor.close()
            return False, "Could not resolve the Archived status."

        cursor.execute(
            f"UPDATE {VIDEO_TUTORIALS_TABLE} SET video_stats_id = %s, updated_at = NOW() WHERE video_tutorial_id = %s",
            (status_id, vid)
        )
        connection.commit()
        cursor.close()
        return True, "Video tutorial archived successfully."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"video_tutorials: failed to archive video tutorial {vid}: {e}")
        return False, "Could not archive this video tutorial."
    finally:
        if connection.is_connected():
            connection.close()


def get_archived_video_tutorials(search_query=None, page=1, per_page=8):
    """
    Fetches paginated archived Video Tutorials, for the "Video Tutorial"
    tab of the Archived Learning Resources modal. Separate from
    archived_items.get_archived_resources() because a Video Tutorial is
    its own row in video_tutorials_tbl (see this file's module
    docstring) attached to an existing Lesson via resource_id - never a
    learning_resources_tbl row of its own - so it needs its own query,
    joined back to learning_resources_tbl/category_tbl/modules_tbl only
    to display which Lesson/Category/Module it's attached to.

    Returns the SAME {resource_id, resource_title, category, module,
    updated_at, ...} shape archived_items.get_archived_resources() uses
    (resource_id/resource_title populated with this video's OWN
    video_tutorial_id/video_title, not the parent Lesson's) so the
    existing admin-archived-resources.js's renderRows() needs no
    changes to display either tab.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        ensure_video_stats(connection)
        cursor = connection.cursor(dictionary=True)

        base_query = f"""
            FROM {VIDEO_TUTORIALS_TABLE} vt
            LEFT JOIN {LEARNING_RESOURCES_TABLE} lr ON vt.resource_id = lr.resource_id
            LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
            LEFT JOIN {MODULES_TABLE} m ON lr.module_id = m.module_id
            LEFT JOIN {LA_STATS_TABLE} vts ON vt.video_stats_id = vts.la_stats_id
            WHERE LOWER(COALESCE(vts.la_stats_name, '')) = 'archived'
        """
        params = []

        term = (search_query or "").strip()
        if term:
            base_query += """
                AND (
                    LOWER(vt.video_title) LIKE %s
                    OR LOWER(COALESCE(lr.resource_title, '')) LIKE %s
                    OR LOWER(COALESCE(c.category_name, '')) LIKE %s
                    OR LOWER(COALESCE(m.module_name, '')) LIKE %s
                )
            """
            like_term = f"%{term.lower()}%"
            params.extend([like_term] * 4)

        cursor.execute(f"SELECT COUNT(*) AS total {base_query}", tuple(params))
        total = cursor.fetchone()["total"]

        page = max(1, int(page))
        per_page = max(1, int(per_page))
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(page, total_pages)
        offset = (page - 1) * per_page

        cursor.execute(
            f"""
            SELECT vt.video_tutorial_id, vt.video_title,
                   c.category_name, m.module_name,
                   vt.updated_at AS raw_updated_at
            {base_query}
            ORDER BY vt.updated_at DESC, vt.video_tutorial_id DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params + [per_page, offset])
        )
        rows = cursor.fetchall()
        cursor.close()

        resources = []
        for r in rows:
            resources.append({
                "resource_id": r["video_tutorial_id"],
                "resource_title": r.get("video_title") or "Untitled video",
                "category": r.get("category_name") or "—",
                "module": r.get("module_name") or "—",
                "updated_at": _format_archived_datetime(r.get("raw_updated_at")),
            })

        return {
            "resources": resources,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
    except Error as e:
        print(f"video_tutorials: failed to load archived video tutorials: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def _format_archived_datetime(dt):
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.strftime('%I:%M %p').lstrip('0') or '12:00 AM'}"


def restore_video_tutorial(video_tutorial_id):
    """Restores an archived Video Tutorial back to 'Draft' status."""
    if not video_tutorial_id:
        return False, "Video tutorial ID is required."
    try:
        vid = int(video_tutorial_id)
    except (TypeError, ValueError):
        return False, "Invalid video tutorial ID."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_video_stats(connection)
        cursor = connection.cursor()

        cursor.execute(f"SELECT video_tutorial_id FROM {VIDEO_TUTORIALS_TABLE} WHERE video_tutorial_id = %s", (vid,))
        if not cursor.fetchone():
            cursor.close()
            return False, "Video tutorial not found."

        draft_id = _get_status_id(connection, "Draft")
        if not draft_id:
            cursor.close()
            return False, "Could not resolve the Draft status."

        cursor.execute(
            f"UPDATE {VIDEO_TUTORIALS_TABLE} SET video_stats_id = %s, updated_at = NOW() WHERE video_tutorial_id = %s",
            (draft_id, vid)
        )
        connection.commit()
        cursor.close()
        return True, "Video tutorial restored successfully."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"video_tutorials: failed to restore video tutorial {vid}: {e}")
        return False, "Could not restore this video tutorial."
    finally:
        if connection.is_connected():
            connection.close()


def permanently_delete_video_tutorial(video_tutorial_id):
    """
    Permanently removes an archived Video Tutorial row. No dependent
    tables reference video_tutorial_id (unlike a Lesson, which
    activities/exercises can reference), so this is a simple delete -
    the parent Lesson itself is never touched.
    """
    if not video_tutorial_id:
        return False, "Video tutorial ID is required."
    try:
        vid = int(video_tutorial_id)
    except (TypeError, ValueError):
        return False, "Invalid video tutorial ID."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""
            SELECT vt.video_tutorial_id, vts.la_stats_name AS status
            FROM {VIDEO_TUTORIALS_TABLE} vt
            LEFT JOIN {LA_STATS_TABLE} vts ON vt.video_stats_id = vts.la_stats_id
            WHERE vt.video_tutorial_id = %s
            """,
            (vid,)
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Video tutorial not found."
        if (row.get("status") or "").lower() != "archived":
            cursor.close()
            return False, "This video tutorial must be archived before it can be permanently deleted."

        cursor.execute(f"DELETE FROM {VIDEO_TUTORIALS_TABLE} WHERE video_tutorial_id = %s", (vid,))
        connection.commit()
        cursor.close()
        return True, "Video tutorial permanently deleted."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"video_tutorials: failed to permanently delete video tutorial {vid}: {e}")
        return False, "Could not permanently delete this video tutorial."
    finally:
        if connection.is_connected():
            connection.close()
