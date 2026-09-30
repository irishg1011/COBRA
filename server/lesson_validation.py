"""
lesson_validation.py - Task #42: Global Lesson Name Validation
-----------------------------------------------------------------
Enforces that every lesson title (learning_resources_tbl.resource_title)
is unique GLOBALLY across every category and module - not just within
one category/module - and normalizes its casing before it's ever
compared or saved.

WHY THIS EXISTS
Lesson titles live in the same learning_resources_tbl already used by
Upload Resource / Learning Resources (see learning_resources.py).
Rather than bolting duplicate-checking and formatting logic directly
into admin_routes.py's upload_resource() route (which this project's
existing convention avoids - see manage_course.py, learning_resources.py,
account_status.py, lockout_logs.py, etc., all pure DB-access helpers
kept out of admin_routes.py), this file is the single source of truth
for both rules, reused by:
    - admin_routes.py's upload_resource() POST handler (server-side,
      authoritative validation before any save)
    - admin_routes.py's live-check endpoint (AJAX duplicate check while
      typing, mirrors admin_routes.check_account_field_availability())

FORMATTING RULE
    "javascript" -> "Javascript"
    "JAVASCRIPT" -> "Javascript"
    "jAvAsCrIpT" -> "Javascript"
Only the first character is uppercased; every other character is forced
lowercase - internal spacing is left untouched. This is intentionally
the SAME normalization style as text_formatting.format_display_name()
(used for Category/Module names), reused here rather than duplicated,
since both rules are identical "sentence case" formatting.

SCOPE
Only learning_resources_tbl.resource_title is read/compared here. No
new tables, no new columns, no schema migration.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from text_formatting import format_display_name

LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LR_STATS_TABLE = "learning_resources_stats_tbl"
ARCHIVED_STATUS_NAME = "Archived"

LESSON_TITLE_TAKEN_MESSAGE = (
    "A lesson with this name already exists. Lesson names must be "
    "unique across all categories and modules."
)
LESSON_TITLE_ARCHIVED_MESSAGE = (
    "This name is used by an archived lesson. Restore it from Archived, "
    "or use a different name."
)


def format_lesson_title(value):
    """
    Normalizes a lesson title - first character uppercase, everything
    after it kept exactly as typed ("python on Windows" ->
    "Python on Windows"). Thin wrapper around text_formatting.format_display_name()
    so both "sentence case" rules (Category/Module names, and now Lesson
    names) share exactly one implementation rather than a second,
    divergent copy of the same logic.

        "javascript" -> "Javascript"
        "JAVASCRIPT" -> "Javascript"
        "jAvAsCrIpT" -> "Javascript"

    Returns "" for an empty/None input.
    """
    return format_display_name(value)


def is_lesson_title_taken(title, exclude_resource_id=None):
    """
    Checks whether `title` (after formatting) already exists ANYWHERE in
    learning_resources_tbl - across every category and every module, not
    scoped to any one of them - matching Task #42's "globally unique"
    requirement. Comparison is case-insensitive
    (LOWER(resource_title) = LOWER(%s)), so "Javascript" and "javascript"
    are treated as the same title even before formatting is applied.

    Args:
        title (str): the raw or already-formatted lesson title.
        exclude_resource_id (int | None): when re-validating an existing
            lesson (e.g. a future edit flow), pass its own resource_id so
            the row doesn't collide with itself.

    Returns:
        True  - a lesson with this title already exists somewhere.
        False - the title is free to use.
        None  - the check could not be performed (DB unreachable).
            Callers MUST treat None as "could not verify" and fail safe
            (block the save) rather than silently allowing a possible
            duplicate through.
    """
    name = format_lesson_title(title)
    if not name:
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor()
        if exclude_resource_id:
            cursor.execute(
                f"""SELECT resource_id FROM {LEARNING_RESOURCES_TABLE}
                    WHERE LOWER(resource_title) = LOWER(%s) AND resource_id != %s
                    LIMIT 1""",
                (name, exclude_resource_id)
            )
        else:
            cursor.execute(
                f"""SELECT resource_id FROM {LEARNING_RESOURCES_TABLE}
                    WHERE LOWER(resource_title) = LOWER(%s)
                    LIMIT 1""",
                (name,)
            )
        row = cursor.fetchone()
        cursor.close()
        return row is not None
    except Error as e:
        print(f"lesson_validation: failed to check lesson title uniqueness: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_lesson_title_conflict(title, exclude_resource_id=None):
    """
    Same global, case-insensitive check as is_lesson_title_taken(), but
    also says WHAT kind of lesson owns the name, so the message can tell
    the admin when the name belongs to an archived lesson.

    Returns:
        False       - the title is free to use.
        "active"    - a non-archived lesson already uses it.
        "archived"  - only an archived lesson uses it.
        None        - the check could not be performed (fail safe).
    """
    name = format_lesson_title(title)
    if not name:
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor()
        query = (
            f"""SELECT lrs.lr_stats_name
                FROM {LEARNING_RESOURCES_TABLE} lr
                LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE LOWER(lr.resource_title) = LOWER(%s)"""
        )
        params = [name]
        if exclude_resource_id:
            query += " AND lr.resource_id != %s"
            params.append(exclude_resource_id)
        # A non-archived match wins over an archived one.
        query += " ORDER BY (lrs.lr_stats_name = %s) ASC LIMIT 1"
        params.append(ARCHIVED_STATUS_NAME)

        cursor.execute(query, tuple(params))
        row = cursor.fetchone()
        cursor.close()
        if row is None:
            return False
        return "archived" if row[0] == ARCHIVED_STATUS_NAME else "active"
    except Error as e:
        print(f"lesson_validation: failed to check lesson title conflict: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def lesson_title_taken_message(conflict):
    """The error message for a get_lesson_title_conflict() result."""
    if conflict == "archived":
        return LESSON_TITLE_ARCHIVED_MESSAGE
    return LESSON_TITLE_TAKEN_MESSAGE


def validate_lesson_title(title, exclude_resource_id=None):
    """
    Combined required + format + global-uniqueness check, mirroring the
    (is_valid, message_or_value) tuple convention already used
    throughout validators.py and manage_course.py.

    Args:
        title (str): the raw, as-typed lesson title.
        exclude_resource_id (int | None): see is_lesson_title_taken().

    Returns:
        (True, normalized_title)  on success - `normalized_title` is the
            sentence-cased value ("javascript" -> "Javascript") that MUST
            be the value actually persisted, never the raw input.
        (False, error_message)    on failure - required field missing,
            DB unreachable (fails safe), or a global duplicate exists.

    This function only VALIDATES - it never writes to the database
    itself. Callers are responsible for using the returned normalized
    title when they actually save the row.
    """
    normalized = format_lesson_title(title)
    if not normalized:
        return False, "Lesson name is required."

    conflict = get_lesson_title_conflict(normalized, exclude_resource_id=exclude_resource_id)
    if conflict is None:
        return False, "Could not verify lesson name uniqueness. Please try again."
    if conflict:
        return False, lesson_title_taken_message(conflict)  

    return True, normalized