"""
learning_activity_draft.py - Unsaved Changes Protection: Draft Autosave
for Create Learning Activity
--------------------------------------------------------------------------
Mirrors resource_draft.py's pattern for the Upload Resource page, just
scoped to learning_activities_tbl instead of learning_resources_tbl /
lesson_content_tbl - backs the "Save Draft" action on
Admin > Learning Activities > Create Learning Activity
(create-learning-activity.html), so an in-progress activity survives
navigating away mid-edit, exactly like an in-progress lesson already
does (Task #44).

WHAT THIS FILE DOES
Saves the Activity Information fields (title, category, module, lesson,
activity type, points) as a real learning_activities_tbl row with
la_stats_id = "Draft" - never any other status. Every save is
idempotent per activity: the first save INSERTs a new row and returns
its la_id; every subsequent save (the frontend echoes that la_id back)
UPDATEs the SAME row in place, so clicking "Save Draft" repeatedly on
the same activity never creates duplicate rows.

SCOPE
Only the Activity Information fields (Section 1 of the form) are
persisted here. The question/fill-blank/flashcard content builders
(Section 2) have no backend persistence anywhere in this project yet
(see admin_routes.py's create_activity_submit(), which still has a
"TODO: Insert activity and question sets" placeholder) - this file
does not expand that scope, it only adds draft-saving for the fields
that already have real columns to land in. The frontend's unsaved-
changes detection still watches Section 2's inputs too (so leaving the
page with unsaved question data still warns the admin), it just isn't
persisted by a Save Draft click yet.

This file never touches Flask/session state directly - admin_routes.py
is the only place this gets turned into an HTTP response, matching
this project's existing convention (resource_draft.py,
lesson_validation.py, manage_course.py, etc.).
"""

from mysql.connector import Error
from cobradb import get_db_connection
from learning_activities import ensure_la_stats, LA_STATS_TABLE, LEARNING_ACTIVITIES_TABLE
from activity_validation import validate_activity_title  # NEW - Task #53: casing + global uniqueness


def get_la_draft_status_id(connection=None):
    """
    Returns the la_stats_id for "Draft" - the status every activity
    saved through this file must be created/updated with. Opens/closes
    its own connection when one isn't supplied, mirroring
    resource_publishing.get_draft_status_id()'s exact convention.

    Returns None (never raises) if the DB is unreachable or the status
    row can't be resolved - callers should fail safe (block the save)
    rather than inserting a NULL/garbage status.
    """
    own_connection = connection is None
    if own_connection:
        connection = get_db_connection()
        if connection is None:
            return None
    try:
        ensure_la_stats(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT la_stats_id FROM {LA_STATS_TABLE} WHERE la_stats_name = %s",
            ("Draft",)
        )
        row = cursor.fetchone()
        cursor.close()
        return row[0] if row else None
    finally:
        if own_connection and connection is not None and connection.is_connected():
            connection.close()


def get_activity_draft(activity_id):
    """
    Companion read-path to save_activity_draft() below - fetches a
    previously saved activity's Activity Information fields so
    admin_routes.py's create_learning_activity_page() GET handler can
    hand it straight to the template and have the form reopen exactly
    as it was left, matching resource_draft.get_lesson_draft()'s own
    role for the Upload Resource page.

    Args:
        activity_id (int | str | None): the learning_activities_tbl.la_id
            to load. Falsy/invalid values short-circuit to None so this
            is always safe to call with a raw, unvalidated query-string
            value.

    Returns:
        dict with keys la_id, activity_title, cat_id, module_id,
        resource_id, activity_type_id, points, status - or None if
        activity_id is missing/invalid, the activity doesn't exist, or
        the database is unreachable. Callers should treat None exactly
        like "no draft to reload" (a normal blank form).
    """
    if not activity_id:
        return None
    try:
        aid = int(activity_id)
    except (TypeError, ValueError):
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT la.la_id, la.activity_title, la.cat_id, la.module_id,
                       la.resource_id, la.activity_type_id, la.points,
                       las.la_stats_name
                FROM {LEARNING_ACTIVITIES_TABLE} la
                LEFT JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
                WHERE la.la_id = %s""",
            (aid,)
        )
        row = cursor.fetchone()
        cursor.close()
        if not row:
            return None

        return {
            "la_id": row["la_id"],
            "activity_title": row["activity_title"],
            "cat_id": row.get("cat_id"),
            "module_id": row.get("module_id"),
            "resource_id": row.get("resource_id"),
            "activity_type_id": row.get("activity_type_id"),
            "points": row.get("points"),
            "status": row.get("la_stats_name") or "Draft",
        }
    except Error as e:
        print(f"learning_activity_draft: failed to load activity draft for la_id={activity_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def save_activity_draft(activity_id, activity_title, cat_id, module_id,
                         resource_id, activity_type_id, points, uploaded_by=None):
    """
    ... (docstring unchanged) ...
    """
    existing_id = None
    if activity_id:
        try:
            existing_id = int(activity_id)
        except (TypeError, ValueError):
            existing_id = None

    # Task #53: casing normalization ("Python quiz") + GLOBAL uniqueness
    # check across the whole learning_activities_tbl, excluding this
    # activity's own row when re-saving an existing draft so it doesn't
    # collide with itself. Never a second, divergent copy of this rule -
    # the exact same validator backs the live check endpoint and the
    # final Publish submit in admin_routes.py.
    is_valid, result = validate_activity_title(activity_title, exclude_la_id=existing_id)
    if not is_valid:
        return False, result, None
    title = result

    cat_id = cat_id or None
    module_id = module_id or None
    resource_id = resource_id or None
    activity_type_id = activity_type_id or None

    if not cat_id:
        return False, "Please select a category before saving a draft.", None
    if not module_id:
        return False, "Please select a module before saving a draft.", None
    if not resource_id:
        return False, "Please select a lesson before saving a draft.", None
    if not activity_type_id:
        return False, "Please select an activity type before saving a draft.", None

    try:
        points_val = int(points) if points not in (None, "") else 0
    except (TypeError, ValueError):
        points_val = 0

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None
    # ... rest of the function is unchanged from here ...

    try:
        draft_status_id = get_la_draft_status_id(connection)
        if not draft_status_id:
            return False, "Could not resolve the Draft status.", None

        cursor = connection.cursor()

        if existing_id:
            cursor.execute(
                f"SELECT la_id FROM {LEARNING_ACTIVITIES_TABLE} WHERE la_id = %s",
                (existing_id,)
            )
            if cursor.fetchone() is None:
                cursor.close()
                return False, "This draft no longer exists. Please refresh and try again.", None

            cursor.execute(
                f"""UPDATE {LEARNING_ACTIVITIES_TABLE}
                    SET activity_title = %s, cat_id = %s, module_id = %s,
                        resource_id = %s, activity_type_id = %s, points = %s,
                        la_stats_id = %s, updated_at = NOW()
                    WHERE la_id = %s""",
                (title, cat_id, module_id, resource_id, activity_type_id,
                 points_val, draft_status_id, existing_id)
            )
            connection.commit()
            cursor.close()
            return True, "Draft saved successfully.", existing_id

        cursor.execute(
            f"""INSERT INTO {LEARNING_ACTIVITIES_TABLE}
                (activity_title, cat_id, module_id, resource_id, activity_type_id,
                 points, la_stats_id, uploaded_by, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())""",
            (title, cat_id, module_id, resource_id, activity_type_id,
             points_val, draft_status_id, uploaded_by)
        )
        new_id = cursor.lastrowid
        connection.commit()
        cursor.close()
        return True, "Draft saved successfully.", new_id

    except Error as e:
        connection.rollback()
        print(f"learning_activity_draft: failed to save activity draft: {e}")
        return False, f"Database error: {e}", None
    finally:
        if connection.is_connected():
            connection.close()