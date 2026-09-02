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

TASK #56 UPDATE - Section 2 is no longer out of scope
Previously this file's docstring called out that the question/fill-
blank/flashcard content builders (Section 2) had no backend persistence
anywhere in the project - admin_routes.py's create_activity_submit()
still had a bare "TODO: Insert activity and question sets" placeholder,
and the frontend's own unsaved-changes detection watched Section 2's
inputs without anything ever actually saving them.

That gap is now closed:
  - save_activity_draft() below takes the real Activity Type NAME
    ("Multiple Choice" / "Fill in the Blanks" / "Flashcards" - matching
    activity_points.py's constants and the #activityType <option>
    values exactly) instead of an ambiguous "activity_type_id" that
    was, in practice, always the same string being stuffed into a
    numeric FK column. It resolves the REAL activity_types_tbl id via
    _resolve_activity_type_id() before ever writing
    learning_activities_tbl.activity_type_id.
  - points are NEVER trusted from the client for a draft either - they
    are always recomputed from the actual submitted question/fill-
    blank/flashcard items via activity_points.py's
    calculate_activity_points_from_lists(), the exact same rule Task
    #55 already enforces for the final Publish submission. Save Draft
    and Publish can therefore never disagree about "the points" for
    the same content.
  - Section 2's rows (questions+options / fill-blanks / flashcards) are
    now persisted too, via learning_activity_content.save_activity_content() -
    called on the SAME open connection as this file's own
    INSERT/UPDATE of learning_activities_tbl, and only committed once
    BOTH halves succeed, so a draft save is atomic: either the whole
    activity (Section 1 + Section 2) lands, or none of it does.

This file never touches Flask/session state directly - admin_routes.py
is the only place this gets turned into an HTTP response, matching
this project's existing convention (resource_draft.py,
lesson_validation.py, manage_course.py, etc.).
"""

from mysql.connector import Error
from cobradb import get_db_connection
from learning_activities import (
    ensure_la_stats, LA_STATS_TABLE, LEARNING_ACTIVITIES_TABLE,
    ensure_activity_types, ACTIVITY_TYPES_TABLE,
)
from activity_validation import validate_activity_title, validate_activity_type_for_lesson  # Task #53 & Task #62
from activity_points import calculate_activity_points_from_lists  # Task #55/#56: never trust client-supplied points
from learning_activity_content import save_activity_content, get_activity_content  # Task #56: Section 2 persistence


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


def _resolve_activity_type_id(connection, activity_type_name):
    """
    Task #56: looks up the REAL activity_types_tbl.activity_type_id for
    a given type name ("Multiple Choice", "Fill in the Blanks",
    "Flashcards"). Seeds the table first (ensure_activity_types() - the
    exact same seeding learning_activities.get_activity_types() already
    relies on), so this never fails against a fresh/empty database.

    Fixes a pre-existing mismatch where Save Draft stored the raw type
    NAME string directly into learning_activities_tbl's numeric
    activity_type_id FK column - this resolves the real integer id
    first instead.

    Returns the numeric id, or None if it can't be resolved (DB
    unreachable, or an unrecognized type name) - callers should fail
    safe (block the save) rather than writing a NULL/garbage FK.
    """
    name = (activity_type_name or "").strip()
    if not name:
        return None
    ensure_activity_types(connection)
    cursor = connection.cursor()
    cursor.execute(
        f"SELECT activity_type_id FROM {ACTIVITY_TYPES_TABLE} WHERE activity_type_name = %s",
        (name,)
    )
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else None


def get_activity_draft(activity_id):
    """
    Companion read-path to save_activity_draft() below - fetches a
    previously saved activity's Activity Information fields (Section 1)
    AND its questions/fill-blanks/flashcards (Section 2 - Task #56) so
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
        resource_id, activity_type (the real type NAME, e.g. "Multiple
        Choice" - Task #56), points, status, questions, fill_blanks,
        flashcards - or None if activity_id is missing/invalid, the
        activity doesn't exist, or the database is unreachable. Callers
        should treat None exactly like "no draft to reload" (a normal
        blank form).
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
                       la.resource_id, la.activity_type_id, at.activity_type_name,
                       la.points, las.la_stats_name
                FROM {LEARNING_ACTIVITIES_TABLE} la
                LEFT JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
                LEFT JOIN {ACTIVITY_TYPES_TABLE} at ON la.activity_type_id = at.activity_type_id
                WHERE la.la_id = %s""",
            (aid,)
        )
        row = cursor.fetchone()
        cursor.close()
        if not row:
            return None

        # Task #56: reload Section 2 alongside Section 1 - never a
        # second/divergent read path for an activity's content.
        content = get_activity_content(aid)

        return {
            "la_id": row["la_id"],
            "activity_title": row["activity_title"],
            "cat_id": row.get("cat_id"),
            "module_id": row.get("module_id"),
            "resource_id": row.get("resource_id"),
            "activity_type_id": row.get("activity_type_id"),
            "activity_type": row.get("activity_type_name"),
            "points": row.get("points"),
            "status": row.get("la_stats_name") or "Draft",
            "questions": content["questions"],
            "fill_blanks": content["fill_blanks"],
            "flashcards": content["flashcards"],
        }
    except Error as e:
        print(f"learning_activity_draft: failed to load activity draft for la_id={activity_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def save_activity_draft(activity_id, activity_title, cat_id, module_id,
                         resource_id, activity_type, questions=None,
                         fill_blanks=None, flashcards=None, uploaded_by=None):
    """
    Saves (creating or updating) a Draft learning_activities_tbl row -
    plus, as of Task #56, its Section 2 content (mcq_questions_tbl/
    mcq_options_tbl, fill_blanks_tbl, or flashcards_tbl, whichever
    matches `activity_type`) - from the Create Learning Activity form's
    current in-progress values.

    Args:
        activity_id (int | str | None): the la_id from a PRIOR save on
            this same activity, or None/empty for the very first save
            (which INSERTs a new row).
        activity_title (str): raw, as-typed title - normalized to
            sentence case and checked for GLOBAL uniqueness exactly
            like the final Publish flow (Task #53), excluding this
            activity's own row when updating.
        cat_id / module_id / resource_id (int | str | None): the
            selected Category / Module / Lesson.
        activity_type (str): "Multiple Choice", "Fill in the Blanks",
            or "Flashcards" - matches create-learning-activity.html's
            #activityType values and activity_points.py's constants
            exactly. Resolved to the real activity_types_tbl FK id
            internally (see _resolve_activity_type_id()) before being
            written to learning_activities_tbl.activity_type_id.
        questions / fill_blanks / flashcards (list | None): Section 2's
            current item lists, in the exact shape
            create-learning-activity-draft-guard.js's
            collectMultipleChoiceQuestions()/collectFillBlanks()/
            collectFlashcards() produce. Only the list matching
            `activity_type` is actually persisted or counted toward
            points - the other two are ignored, matching
            activity_points.calculate_activity_points_from_lists()'s
            own "one list per activity_type" rule.
        uploaded_by (str | None): the saving admin's acc_id - only ever
            set on the initial INSERT; an update never changes who
            originally uploaded it.

    Returns:
        (success: bool, message: str, activity_id: int | None,
         points: int)
        `points` is always the server-COMPUTED count (Task #55/#56's
        rule - never the client's displayed value) - 0 on any failure
        path, since nothing was actually saved in that case.
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
    # collide with itself.
    is_valid, result = validate_activity_title(activity_title, exclude_la_id=existing_id)
    if not is_valid:
        return False, result, None, 0
    title = result

    cat_id = cat_id or None
    module_id = module_id or None
    resource_id = resource_id or None

    if not cat_id:
        return False, "Please select a category before saving a draft.", None, 0
    if not module_id:
        return False, "Please select a module before saving a draft.", None, 0
    if not resource_id:
        return False, "Please select a lesson before saving a draft.", None, 0

    activity_type_name = (activity_type or "").strip()
    if not activity_type_name:
        return False, "Please select an activity type before saving a draft.", None, 0

    # Task #62: ensure that for any given lesson (resource_id), only one
    # active activity entry per unique activity type can exist.
    is_type_valid, type_err_msg = validate_activity_type_for_lesson(
        resource_id, activity_type_name, exclude_la_id=existing_id
    )
    if not is_type_valid:
        return False, type_err_msg, None, 0

    # Task #103: Validate Multiple Choice questions for duplicate options and matching feedback
    if activity_type_name == "Multiple Choice" and questions:
        for q_idx, q in enumerate(questions):
            opts = q.get("options") or []
            seen_opts = set()
            for opt_idx, opt in enumerate(opts):
                opt_text = (opt.get("text") or "").strip()
                opt_feedback = (opt.get("feedback") or "").strip()
                letter = chr(65 + opt_idx)

                if opt_text:
                    lower_text = opt_text.lower()
                    if lower_text in seen_opts:
                        return False, f'Duplicate answer option "{opt_text}" found in Question #{q_idx + 1}. Each option must have a unique answer.', None, 0
                    seen_opts.add(lower_text)

                    if opt_feedback and lower_text == opt_feedback.lower():
                        return False, f'Answer and Feedback for Learner cannot be identical in Question #{q_idx + 1} (Option {letter}).', None, 0

    # Task #55/#56: points are NEVER trusted from the client, for either
    # Save Draft or Publish - always recomputed here from the actual
    # submitted items, so the two paths can never disagree.
    points_val = calculate_activity_points_from_lists(
        activity_type_name, questions=questions, fill_blanks=fill_blanks, flashcards=flashcards
    )

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None, 0

    try:
        draft_status_id = get_la_draft_status_id(connection)
        if not draft_status_id:
            return False, "Could not resolve the Draft status.", None, 0

        activity_type_id = _resolve_activity_type_id(connection, activity_type_name)
        if not activity_type_id:
            return False, "Could not resolve the selected activity type.", None, 0

        cursor = connection.cursor()

        if existing_id:
            cursor.execute(
                f"SELECT la_id FROM {LEARNING_ACTIVITIES_TABLE} WHERE la_id = %s",
                (existing_id,)
            )
            if cursor.fetchone() is None:
                cursor.close()
                return False, "This draft no longer exists. Please refresh and try again.", None, 0

            cursor.execute(
                f"""UPDATE {LEARNING_ACTIVITIES_TABLE}
                    SET activity_title = %s, cat_id = %s, module_id = %s,
                        resource_id = %s, activity_type_id = %s, points = %s,
                        la_stats_id = %s, updated_at = NOW()
                    WHERE la_id = %s""",
                (title, cat_id, module_id, resource_id, activity_type_id,
                 points_val, draft_status_id, existing_id)
            )
            cursor.close()

            # Task #56: Section 2 is saved on this SAME connection,
            # before the commit below - a draft save is atomic.
            save_activity_content(
                connection, existing_id, activity_type_name,
                questions=questions, fill_blanks=fill_blanks, flashcards=flashcards
            )
            connection.commit()
            return True, "Draft saved successfully.", existing_id, points_val

        cursor.execute(
            f"""INSERT INTO {LEARNING_ACTIVITIES_TABLE}
                (activity_title, cat_id, module_id, resource_id, activity_type_id,
                 points, la_stats_id, uploaded_by, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())""",
            (title, cat_id, module_id, resource_id, activity_type_id,
             points_val, draft_status_id, uploaded_by)
        )
        new_id = cursor.lastrowid
        cursor.close()

        save_activity_content(
            connection, new_id, activity_type_name,
            questions=questions, fill_blanks=fill_blanks, flashcards=flashcards
        )
        connection.commit()
        return True, "Draft saved successfully.", new_id, points_val

    except Error as e:
        connection.rollback()
        print(f"learning_activity_draft: failed to save activity draft: {e}")
        return False, f"Database error: {e}", None, 0
    finally:
        if connection.is_connected():
            connection.close()