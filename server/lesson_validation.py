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


def format_lesson_title(value):
    """
    Normalizes a lesson title to sentence case - first character
    uppercase, every other character lowercase, internal spacing left
    untouched. Thin wrapper around text_formatting.format_display_name()
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

    taken = is_lesson_title_taken(normalized, exclude_resource_id=exclude_resource_id)
    if taken is None:
        return False, "Could not verify lesson name uniqueness. Please try again."
    if taken:
        return False, (
            "A lesson with this name already exists. Lesson names must be "
            "unique across all categories and modules."
        )

    return True, normalized