"""
resource_draft.py - Task #44: Upload Resource Draft Autosave
------------------------------------------------------------
Pure DB-access helpers backing the "Save Draft" action on
Admin > Learning Resources > Upload Resource (upload-resource.html),
mirroring lesson_validation.py / resource_publishing.py's style
exactly: this file never touches Flask/session state directly -
admin_routes.py is the only place these get turned into HTTP
responses.

WHAT THIS FILE DOES
Lets the admin save the in-progress "New Lesson" form (lesson name,
category, module, and rich-text lesson content) as a real Draft row
in learning_resources_tbl / lesson_content_tbl at any point, instead
of losing everything if they navigate away. Reuses:
    - lesson_validation.py for the same sentence-case + GLOBAL
      uniqueness rule already enforced on final Publish (Task #42) -
      a draft's title is held to the exact same rule.
    - resource_publishing.get_draft_status_id() so every newly created
      row starts life with the exact same "Draft" lr_stats_id the
      Publish workflow already understands (Task #43) - a resource
      saved here is immediately visible/editable from the normal
      Learning Resources table.

Every save is idempotent per resource: the first save INSERTs a new
learning_resources_tbl row and returns its resource_id; every
subsequent save (the frontend echoes that resource_id back) UPDATEs
the SAME row and its lesson_content_tbl row in place - so clicking
"Save Draft" repeatedly on the same lesson never creates duplicate
rows.

feat/publishing-tree: an UPDATE never changes lr_stats_id any more.
A new lesson starts as Draft; after that only the status buttons
(publishing_actions.py) move it between Draft / Ready / Published.
Saving a Published lesson keeps it live - the Publishing page marks it
"Edited" so an admin can confirm the update.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from lesson_validation import format_lesson_title, get_lesson_title_conflict, lesson_title_taken_message
from validators import validate_title_length  # feat/title-char-limit
from title_history import ensure_title_history, log_title_change  # feat/module-title-history
from resource_publishing import get_draft_status_id
from lesson_content_validation import validate_lesson_content

LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LESSON_CONTENT_TABLE = "lesson_content_tbl"
RESOURCE_TYPES_TABLE = "resource_types_tbl"
# Task #48: needed so get_lesson_draft() can resolve and display the
# resource's real Draft/Published status name (see learning_resources.py /
# resource_publishing.py, which already use this same table under this
# same constant name).
LR_STATS_TABLE = "learning_resources_stats_tbl"

# The Upload Resource page has no Resource Type selector of its own -
# every lesson created there is a "Lesson Content" resource. Never
# hardcoded as a numeric id anywhere else in the app; every caller
# resolves it fresh via ensure_lesson_content_type() below.
LESSON_CONTENT_TYPE_NAME = "Lesson Content"

_lesson_content_type_ensured = False


def ensure_lesson_content_type(connection):
    """
    Idempotently seeds resource_types_tbl with a "Lesson Content" row if
    one doesn't already exist - same lazy-seed pattern as
    manage_course.ensure_module_stats() / resource_publishing.ensure_lr_stats().
    Gated behind a module-level flag so it only round-trips once per
    process lifetime.
    """
    global _lesson_content_type_ensured
    if _lesson_content_type_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT resource_type_id FROM {RESOURCE_TYPES_TABLE} WHERE resource_type_name = %s",
            (LESSON_CONTENT_TYPE_NAME,)
        )
        if cursor.fetchone() is None:
            cursor.execute(
                f"INSERT INTO {RESOURCE_TYPES_TABLE} (resource_type_name) VALUES (%s)",
                (LESSON_CONTENT_TYPE_NAME,)
            )
            connection.commit()
        cursor.close()
        _lesson_content_type_ensured = True
    except Error as e:
        print(f"resource_draft: failed to ensure {RESOURCE_TYPES_TABLE} has '{LESSON_CONTENT_TYPE_NAME}': {e}")


def _get_lesson_content_type_id(connection):
    ensure_lesson_content_type(connection)
    cursor = connection.cursor()
    cursor.execute(
        f"SELECT resource_type_id FROM {RESOURCE_TYPES_TABLE} WHERE resource_type_name = %s",
        (LESSON_CONTENT_TYPE_NAME,)
    )
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else None


def get_lesson_draft(resource_id):
    """
    Task #45: Companion read-path to save_lesson_draft() below - fetches
    a previously saved lesson's metadata (title, category, module) AND
    its full lesson_content_tbl.content_body (the rich-text editor's
    complete innerHTML, including every nested interactive block: code
    console containers with their filename/mode fields, expected-output
    boxes, and terminal blocks) so admin_routes.py's upload_resource()
    GET handler can hand it straight to the template and have the New
    Lesson page reopen exactly as it was left - not just the plain text,
    but every embedded block and field.

    Args:
        resource_id (int | str | None): the learning_resources_tbl.resource_id
            to load. Falsy/invalid values short-circuit to None so this
            is always safe to call with a raw, unvalidated query-string
            value.

    Returns:
        dict with keys resource_id, lesson_name, cat_id, module_id,
        content_html, status - or None if resource_id is missing/invalid,
        the resource doesn't exist, or the database is unreachable.
        Callers should treat None exactly like "no draft to reload" (i.e.
        show a normal blank form) rather than raising.

        "status" (Task #48) is the resource's REAL, current
        lr_stats_name ("Draft" by default, since every resource is
        created via get_draft_status_id() - see save_lesson_draft()
        below - and only ever moves to "Published" through
        resource_publishing.publish_resource(), never through this
        editor). It's resolved fresh from the database rather than
        assumed, so if a resource somehow reaches this editor while
        already Published, the New Lesson page's read-only Status field
        reflects that truthfully instead of always claiming "Draft".
    """
    if not resource_id:
        return None
    try:
        rid = int(resource_id)
    except (TypeError, ValueError):
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        # Task #48: LEFT JOINed against learning_resources_stats_tbl so
        # the resource's real status NAME comes back directly - never a
        # raw lr_stats_id, and never an assumed/hardcoded "Draft" string.
        # LEFT JOIN (not INNER) so a resource somehow missing its stats
        # row still loads instead of silently disappearing.
        cursor.execute(
            f"""SELECT lr.resource_id, lr.resource_title, lr.cat_id, lr.module_id,
                       lrs.lr_stats_name
                FROM {LEARNING_RESOURCES_TABLE} lr
                LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE lr.resource_id = %s""",
            (rid,)
        )
        resource = cursor.fetchone()
        if not resource:
            cursor.close()
            return None

        cursor.execute(
            f"SELECT content_body FROM {LESSON_CONTENT_TABLE} WHERE resource_id = %s",
            (rid,)
        )
        content_row = cursor.fetchone()
        cursor.close()

        return {
            "resource_id": resource["resource_id"],
            "lesson_name": resource["resource_title"],
            "cat_id": resource["cat_id"],
            "module_id": resource["module_id"],
            # NULL/no lesson_content_tbl row yet (shouldn't normally
            # happen - save_lesson_draft() always writes one - but fail
            # safe with an empty editor rather than erroring) becomes "".
            "content_html": (content_row["content_body"] if content_row else "") or "",
            # Task #48: real status name, defaulting to "Draft" only if
            # the stats row is somehow missing - matches the default
            # every other status display in this project already falls
            # back to (see learning_resources.py's own "Draft" fallback).
            "status": resource.get("lr_stats_name") or "Draft",
        }
    except Error as e:
        print(f"resource_draft: failed to load lesson draft for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def save_lesson_draft(resource_id, lesson_name, cat_id, module_id, content_html, uploaded_by=None, preserve_status=False):
    """
    Saves (creating or updating) a Draft learning_resources_tbl /
    lesson_content_tbl row from the Upload Resource form's current
    in-progress values.

    Args:
        resource_id (int | str | None): the resource_id from a PRIOR
            save on this same lesson, or None/empty for the very first
            save (which INSERTs a new row).
        lesson_name (str): raw, as-typed lesson title - normalized to
            sentence case and checked for GLOBAL uniqueness exactly
            like the final Publish flow (Task #42), excluding this
            resource's own row when updating.
        cat_id (int | str | None): category_tbl.cat_id.
        module_id (int | str | None): modules_tbl.module_id.
        content_html (str): the rich-text editor's current HTML
            content - stored as-is in lesson_content_tbl.content_body.
        uploaded_by (str | None): the saving admin's acc_id (from
            Flask session["admin_id"]) - only ever set on the initial
            INSERT; an update never changes who originally uploaded it.
        preserve_status (bool): if True, updating an existing resource
            maintains its current status (e.g. Published) instead of
            forcing it to Draft.

    Returns:
        (success: bool, message: str, resource_id: int | None)
    """
    normalized_name = format_lesson_title(lesson_name)
    if not normalized_name:
        return False, "Lesson name is required before saving a draft.", None
    is_valid, length_msg = validate_title_length(normalized_name, "resource", "Lesson name")
    if not is_valid:
        return False, length_msg, None

    cat_id = cat_id or None
    module_id = module_id or None
    if not cat_id:
        return False, "Please select a category before saving a draft.", None
    if not module_id:
        return False, "Please select a module before saving a draft.", None

    # Lesson Message minimum length - enforced here so it applies
    # identically to Publish AND Save Draft, for a new lesson or an
    # edit, and can never be bypassed by skipping the browser check.
    content_ok, content_message = validate_lesson_content(content_html)
    if not content_ok:
        return False, content_message, None

    existing_id = None
    if resource_id:
        try:
            existing_id = int(resource_id)
        except (TypeError, ValueError):
            existing_id = None

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        # feat/module-title-history: before any write (DDL commits implicitly).
        # uploaded_by is the admin saving right now - also who renamed it.
        ensure_title_history(connection)

        # Task #42's exact global-uniqueness rule, just excluding this
        # resource's own row when re-saving an existing draft so a
        # lesson doesn't collide with itself.
        conflict = get_lesson_title_conflict(normalized_name, exclude_resource_id=existing_id)
        if conflict is None:
            return False, "Could not verify lesson name uniqueness. Please try again.", None
        if conflict:
            return False, lesson_title_taken_message(conflict), None

        cursor = connection.cursor()

        if existing_id:
            # ------------------------------------------------------------
            # UPDATE branch - re-saving a lesson that already has a
            # resource_id (i.e. it was saved/created before).
            # ------------------------------------------------------------

            # Confirm the row still exists before updating it - it may
            # have been deleted/archived by another admin in the
            # meantime.
            cursor.execute(
                f"SELECT resource_title FROM {LEARNING_RESOURCES_TABLE} WHERE resource_id = %s",
                (existing_id,)
            )
            old_row = cursor.fetchone()
            if old_row is None:
                cursor.close()
                return False, "This resource no longer exists. Please refresh and try again.", None

            # feat/publishing-tree: saving NEVER changes the status. A Draft
            # stays Draft, a Ready lesson stays Ready, a Published lesson
            # stays live (the Publishing page shows it as "Edited"). Only
            # the status buttons change status (publishing_actions.py).
            # preserve_status is still accepted so old callers keep working.
            cursor.execute(
                f"""UPDATE {LEARNING_RESOURCES_TABLE}
                    SET resource_title = %s, cat_id = %s, module_id = %s,
                        updated_at = NOW()
                    WHERE resource_id = %s""",
                (normalized_name, cat_id, module_id, existing_id)
            )
            success_msg = "Lesson saved successfully."

            log_title_change(cursor, "lesson", existing_id, old_row[0], normalized_name, uploaded_by)

            cursor.execute(
                f"SELECT lesson_content_id FROM {LESSON_CONTENT_TABLE} WHERE resource_id = %s",
                (existing_id,)
            )
            content_row = cursor.fetchone()
            if content_row:
                cursor.execute(
                    f"UPDATE {LESSON_CONTENT_TABLE} SET content_body = %s WHERE resource_id = %s",
                    (content_html, existing_id)
                )
            else:
                cursor.execute(
                    f"INSERT INTO {LESSON_CONTENT_TABLE} (resource_id, content_body) VALUES (%s, %s)",
                    (existing_id, content_html)
                )

            connection.commit()
            cursor.close()
            return True, success_msg, existing_id

        # ------------------------------------------------------------
        # INSERT branch - first save for this lesson, no resource_id
        # yet. This is the branch that was accidentally dropped -
        # without it, learning_resources_tbl never gets a new row and
        # lesson_content_tbl's INSERT below is handed a None
        # resource_id, which is exactly what produced the
        # "Column 'resource_id' cannot be null" error.
        # ------------------------------------------------------------
        draft_status_id = get_draft_status_id(connection)
        if not draft_status_id:
            cursor.close()
            return False, "Could not resolve the Draft status.", None

        resource_type_id = _get_lesson_content_type_id(connection)
        if not resource_type_id:
            cursor.close()
            return False, "Could not resolve the Lesson Content resource type.", None

        cursor.execute(
            f"""INSERT INTO {LEARNING_RESOURCES_TABLE}
                (resource_title, resource_type_id, cat_id, module_id,
                 uploaded_by, lr_stats_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())""",
            (normalized_name, resource_type_id, cat_id, module_id, uploaded_by, draft_status_id)
        )
        new_resource_id = cursor.lastrowid
        log_title_change(cursor, "lesson", new_resource_id, None, normalized_name, uploaded_by)

        cursor.execute(
            f"INSERT INTO {LESSON_CONTENT_TABLE} (resource_id, content_body) VALUES (%s, %s)",
            (new_resource_id, content_html)
        )

        connection.commit()
        cursor.close()
        return True, "Draft saved successfully.", new_resource_id

    except Error as e:
        connection.rollback()
        print(f"resource_draft: failed to save lesson draft: {e}")
        return False, f"Database error: {e}", None
    finally:
        if connection.is_connected():
            connection.close()