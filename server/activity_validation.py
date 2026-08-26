"""
activity_validation.py - Task #53: Learning Activity Name Casing +
Global Uniqueness Validation
-----------------------------------------------------------------
Mirrors lesson_validation.py's exact pattern (Task #42), just scoped to
learning_activities_tbl.activity_title instead of
learning_resources_tbl.resource_title:

    1. Casing normalization: only the first character of the whole
       string is uppercased, every other character is forced lowercase
       - internal spacing left untouched.

            "PYTHON QUIZ"   -> "Python quiz"
            "python QUIZ"   -> "Python quiz"
            "pYtHoN qUiZ"   -> "Python quiz"

       Reuses text_formatting.format_display_name() (the same rule
       already used for Category names) rather than a second, divergent
       copy of "first char upper, rest lower" - the two happen to be
       identical rules, so there is exactly one implementation of it in
       the codebase.

    2. Global uniqueness: an activity title must be unique across the
       ENTIRE learning_activities_tbl - not scoped to any one category,
       module, or lesson - matching Task #53's "anywhere in the system"
       requirement.

WHY THIS EXISTS
Reused by BOTH:
    - admin_routes.py's create_activity_submit() POST handler
      (server-side, authoritative validation before any save)
    - admin_routes.py's live-check endpoint (AJAX duplicate check while
      typing, mirrors upload_resource_check_lesson_name()'s exact
      pattern)
    - learning_activity_draft.save_activity_draft() (the Save Draft
      path also persists activity_title, so it must enforce the exact
      same rule - never a second, divergent copy of it)

This file never touches Flask/session state directly - admin_routes.py
is the only place these get turned into HTTP responses, matching this
project's existing convention (lesson_validation.py, manage_course.py,
etc.).
"""

from mysql.connector import Error
from cobradb import get_db_connection
from text_formatting import format_display_name

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"


def format_activity_title(value):
    """
    Normalizes an activity title to "first character uppercase, every
    other character lowercase" casing - internal spacing left
    untouched. Thin wrapper around text_formatting.format_display_name()
    so this rule and Category/Module/Lesson naming's own sentence-case
    rule share exactly one implementation.

        "PYTHON QUIZ" -> "Python quiz"
        "python quiz" -> "Python quiz"

    Returns "" for an empty/None input.
    """
    return format_display_name(value)


def is_activity_title_taken(title, exclude_la_id=None):
    """
    Checks whether `title` (after formatting) already exists ANYWHERE in
    learning_activities_tbl - across every category, module, and lesson,
    not scoped to any one of them - matching Task #53's "duplicate
    activity name exists anywhere in the database" requirement.
    Comparison is case-insensitive (LOWER(activity_title) = LOWER(%s)),
    so "Python Quiz" and "python quiz" are treated as the same title
    even before formatting is applied.

    Args:
        title (str): the raw or already-formatted activity title.
        exclude_la_id (int | None): when re-validating an existing
            activity (e.g. editing a saved draft), pass its own la_id so
            the row doesn't collide with itself.

    Returns:
        True  - an activity with this title already exists somewhere.
        False - the title is free to use.
        None  - the check could not be performed (DB unreachable).
            Callers MUST treat None as "could not verify" and fail safe
            (block the save) rather than silently allowing a possible
            duplicate through.
    """
    name = format_activity_title(title)
    if not name:
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor()
        if exclude_la_id:
            cursor.execute(
                f"""SELECT la_id FROM {LEARNING_ACTIVITIES_TABLE}
                    WHERE LOWER(activity_title) = LOWER(%s) AND la_id != %s
                    LIMIT 1""",
                (name, exclude_la_id)
            )
        else:
            cursor.execute(
                f"""SELECT la_id FROM {LEARNING_ACTIVITIES_TABLE}
                    WHERE LOWER(activity_title) = LOWER(%s)
                    LIMIT 1""",
                (name,)
            )
        row = cursor.fetchone()
        cursor.close()
        return row is not None
    except Error as e:
        print(f"activity_validation: failed to check activity title uniqueness: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def validate_activity_title(title, exclude_la_id=None):
    """
    Combined required + format + global-uniqueness check, mirroring
    lesson_validation.validate_lesson_title()'s exact
    (is_valid, message_or_value) convention.

    Args:
        title (str): the raw, as-typed activity title.
        exclude_la_id (int | None): see is_activity_title_taken().

    Returns:
        (True, normalized_title)  on success - `normalized_title` is the
            casing-normalized value ("PYTHON QUIZ" -> "Python quiz")
            that MUST be the value actually persisted, never the raw
            input.
        (False, error_message)    on failure - required field missing,
            DB unreachable (fails safe), or a global duplicate exists.

    This function only VALIDATES - it never writes to the database
    itself. Callers are responsible for using the returned normalized
    title when they actually save the row.
    """
    normalized = format_activity_title(title)
    if not normalized:
        return False, "Activity title is required."

    taken = is_activity_title_taken(normalized, exclude_la_id=exclude_la_id)
    if taken is None:
        return False, "Could not verify activity title uniqueness. Please try again."
    if taken:
        return False, (
            "An activity with this title already exists. Activity titles "
            "must be unique across the entire system."
        )

    return True, normalized