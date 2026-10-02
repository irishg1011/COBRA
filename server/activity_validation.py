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

feat/activity-auto-title:
    Activity titles are no longer typed. They are always built on the
    server as "<Lesson name> – <Activity type>" (build_activity_title /
    generate_activity_title) and checked by
    validate_generated_activity_title() - length + uniqueness, no casing
    change (the type keeps its capitals: "Variables – Multiple Choice").
    ARCHIVED activities never block a title, so a new activity can reuse
    the title of an archived one for the same lesson + type.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from text_formatting import format_display_name
from validators import validate_title_length  # feat/title-char-limit
from title_history import log_title_change  # feat/activity-auto-title: lesson rename -> activity titles

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"

# feat/activity-auto-title: "<Lesson name> – <Activity type>" (en dash)
ACTIVITY_TITLE_SEPARATOR = " \u2013 "


def build_activity_title(lesson_title, activity_type_name):
    """
    "<Lesson name> – <Activity type>", e.g. "Variables – Multiple Choice".
    Returns "" when either part is missing. Never truncated.
    """
    lesson = (lesson_title or "").strip()
    type_name = (activity_type_name or "").strip()
    if not lesson or not type_name:
        return ""
    return f"{lesson}{ACTIVITY_TITLE_SEPARATOR}{type_name}"


def get_lesson_title(resource_id, connection=None):
    """Current resource_title of a lesson, or None (missing lesson / DB error)."""
    try:
        rid = int(resource_id)
    except (TypeError, ValueError):
        return None

    own_connection = connection is None
    if own_connection:
        connection = get_db_connection()
        if connection is None:
            return None
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT resource_title FROM {LEARNING_RESOURCES_TABLE} WHERE resource_id = %s",
            (rid,)
        )
        row = cursor.fetchone()
        cursor.close()
        return row[0] if row and row[0] else None
    except Error as e:
        print(f"activity_validation: failed to read lesson {resource_id} title: {e}")
        return None
    finally:
        if own_connection and connection is not None and connection.is_connected():
            connection.close()


def generate_activity_title(resource_id, activity_type_name, connection=None):
    """Server-side title for an activity: built from the lesson's CURRENT name."""
    return build_activity_title(get_lesson_title(resource_id, connection), activity_type_name)


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


def is_activity_title_taken(title, exclude_la_id=None, format_case=True):
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
        format_case (bool): False for generated titles - compare them
            as they are (the check itself is case-insensitive anyway).

    Archived activities are ignored (feat/activity-auto-title).

    Returns:
        True  - an activity with this title already exists somewhere.
        False - the title is free to use.
        None  - the check could not be performed (DB unreachable).
            Callers MUST treat None as "could not verify" and fail safe
            (block the save) rather than silently allowing a possible
            duplicate through.
    """
    name = format_activity_title(title) if format_case else (title or "").strip()
    if not name:
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor()
        # feat/activity-auto-title: archived activities never block a title.
        if exclude_la_id:
            cursor.execute(
                f"""SELECT la.la_id FROM {LEARNING_ACTIVITIES_TABLE} la
                    LEFT JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
                    WHERE LOWER(la.activity_title) = LOWER(%s) AND la.la_id != %s
                      AND (las.la_stats_name IS NULL OR las.la_stats_name != 'Archived')
                    LIMIT 1""",
                (name, exclude_la_id)
            )
        else:
            cursor.execute(
                f"""SELECT la.la_id FROM {LEARNING_ACTIVITIES_TABLE} la
                    LEFT JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
                    WHERE LOWER(la.activity_title) = LOWER(%s)
                      AND (las.la_stats_name IS NULL OR las.la_stats_name != 'Archived')
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

    is_valid, length_msg = validate_title_length(normalized, "activity", "Activity title")
    if not is_valid:
        return False, length_msg

    taken = is_activity_title_taken(normalized, exclude_la_id=exclude_la_id)
    if taken is None:
        return False, "Could not verify activity title uniqueness. Please try again."
    if taken:
        return False, (
            "An activity with this title already exists. Activity titles "
            "must be unique across the entire system."
        )

    return True, normalized


def sync_lesson_activity_titles(cursor, resource_id, lesson_title, changed_by=None):
    """
    feat/activity-auto-title: after a lesson is renamed, rewrite the
    titles of ALL its activities (archived ones too, so a later restore
    already has the right name) to "<new lesson name> – <type>".

    Runs on the CALLER's cursor, inside the caller's transaction - the
    caller commits or rolls back the lesson rename and these together.
    Each change is logged in Name History ('activity' entries) with the
    same changed_by. Lesson names are globally unique, so the new titles
    can't collide. Returns how many activities were renamed.
    """
    cursor.execute(
        f"""SELECT la.la_id, la.activity_title, at.activity_type_name
            FROM {LEARNING_ACTIVITIES_TABLE} la
            LEFT JOIN {ACTIVITY_TYPES_TABLE} at ON la.activity_type_id = at.activity_type_id
            WHERE la.resource_id = %s""",
        (resource_id,)
    )
    renamed = 0
    for la_id, old_title, type_name in cursor.fetchall():
        new_title = build_activity_title(lesson_title, type_name)
        if not new_title or new_title == old_title:
            continue
        cursor.execute(
            f"UPDATE {LEARNING_ACTIVITIES_TABLE} SET activity_title = %s, updated_at = NOW() WHERE la_id = %s",
            (new_title, la_id)
        )
        log_title_change(cursor, "activity", la_id, old_title, new_title, changed_by)
        renamed += 1
    return renamed


def validate_generated_activity_title(title, exclude_la_id=None):
    """
    feat/activity-auto-title: checks a title built by
    generate_activity_title(). Same (is_valid, message_or_title)
    convention as validate_activity_title(), but the title is kept
    exactly as built (no casing change) and is never truncated.
    """
    title = (title or "").strip()
    if not title:
        return False, "Please select a lesson and an activity type."

    is_valid, _msg = validate_title_length(title, "activity", "Activity title")
    if not is_valid:
        return False, (
            "This lesson's name is too long to build the activity title "
            f'("{title}"). Please shorten the lesson name first.'
        )

    taken = is_activity_title_taken(title, exclude_la_id=exclude_la_id, format_case=False)
    if taken is None:
        return False, "Could not verify activity title uniqueness. Please try again."
    if taken:
        return False, (
            f'An activity named "{title}" already exists. Each lesson can only '
            "have one activity of each type."
        )

    return True, title


ACTIVITY_TYPES_TABLE = "activity_types_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"


def is_activity_type_taken_for_lesson(resource_id, activity_type, exclude_la_id=None, connection=None):
    """
    Task #62: Checks whether an active activity of `activity_type` (e.g.,
    "Multiple Choice", "Fill in the Blanks", "Flashcards") already exists
    in learning_activities_tbl for the specified lesson (`resource_id`).

    Args:
        resource_id (int | str): the learning_resources_tbl.resource_id.
        activity_type (str | int): the activity type name (e.g. "Multiple Choice")
            or numeric activity_type_id.
        exclude_la_id (int | str | None): when editing or re-saving an existing
            activity draft, pass its la_id so the row does not collide with itself.
        connection: optional existing MySQL database connection. If None, opens
            and closes its own connection.

    Returns:
        True  - an activity with this type already exists for this lesson.
        False - no activity with this type exists for this lesson.
        None  - the check could not be performed (missing params or DB error).
    """
    if not resource_id or not activity_type:
        return None

    try:
        res_id = int(resource_id)
    except (TypeError, ValueError):
        return None

    exclude_id = None
    if exclude_la_id:
        try:
            exclude_id = int(exclude_la_id)
        except (TypeError, ValueError):
            exclude_id = None

    type_str = str(activity_type).strip()

    own_connection = connection is None
    if own_connection:
        connection = get_db_connection()
        if connection is None:
            return None

    try:
        cursor = connection.cursor(dictionary=True)
        if exclude_id:
            cursor.execute(
                f"""SELECT la.la_id, la.activity_title
                    FROM {LEARNING_ACTIVITIES_TABLE} la
                    LEFT JOIN {ACTIVITY_TYPES_TABLE} at ON la.activity_type_id = at.activity_type_id
                    LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
                    WHERE la.resource_id = %s
                      AND (at.activity_type_name = %s OR la.activity_type_id = %s)
                      AND (last.la_stats_name IS NULL OR last.la_stats_name != 'Archived')
                      AND la.la_id != %s
                    LIMIT 1""",
                (res_id, type_str, type_str, exclude_id)
            )
        else:
            cursor.execute(
                f"""SELECT la.la_id, la.activity_title
                    FROM {LEARNING_ACTIVITIES_TABLE} la
                    LEFT JOIN {ACTIVITY_TYPES_TABLE} at ON la.activity_type_id = at.activity_type_id
                    LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
                    WHERE la.resource_id = %s
                      AND (at.activity_type_name = %s OR la.activity_type_id = %s)
                      AND (last.la_stats_name IS NULL OR last.la_stats_name != 'Archived')
                    LIMIT 1""",
                (res_id, type_str, type_str)
            )
        row = cursor.fetchone()
        cursor.close()
        return row is not None
    except Error as e:
        print(f"activity_validation: failed to check activity type uniqueness for lesson {resource_id}: {e}")
        return None
    finally:
        if own_connection and connection is not None and connection.is_connected():
            connection.close()


def validate_activity_type_for_lesson(resource_id, activity_type, exclude_la_id=None, connection=None):
    """
    Task #62: Validates that for any given lesson (`resource_id`), only one
    active activity entry per unique activity type (Multiple Choice,
    Fill in the Blanks, and Flashcards) can exist, preventing duplicate
    activity creations while allowing combinations of different types.

    Args:
        resource_id (int | str): the selected lesson's resource_id.
        activity_type (str | int): the selected activity type name or id.
        exclude_la_id (int | str | None): see is_activity_type_taken_for_lesson.
        connection: optional existing DB connection.

    Returns:
        (True, None)             on success (available)
        (False, error_message)   on failure (duplicate found or DB error)
    """
    if not resource_id:
        return False, "Please select a lesson before validating activity type."
    if not activity_type:
        return False, "Please select an activity type."

    type_name = str(activity_type).strip()
    taken = is_activity_type_taken_for_lesson(
        resource_id, type_name, exclude_la_id=exclude_la_id, connection=connection
    )
    if taken is None:
        return False, "Could not verify activity type uniqueness for this lesson. Please try again."
    if taken:
        return False, (
            f"A {type_name} activity already exists for this lesson. "
            f"Each lesson can only have one activity of each type (Multiple Choice, Fill in the Blanks, Flashcards, Quiz)."
        )

    return True, None
