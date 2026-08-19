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
"""

from mysql.connector import Error
from cobradb import get_db_connection
from lesson_validation import format_lesson_title, is_lesson_title_taken
from resource_publishing import get_draft_status_id

LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LESSON_CONTENT_TABLE = "lesson_content_tbl"
RESOURCE_TYPES_TABLE = "resource_types_tbl"

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


def save_lesson_draft(resource_id, lesson_name, cat_id, module_id, content_html, uploaded_by=None):
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

    Returns:
        (success: bool, message: str, resource_id: int | None)
    """
    normalized_name = format_lesson_title(lesson_name)
    if not normalized_name:
        return False, "Lesson name is required before saving a draft.", None

    cat_id = cat_id or None
    module_id = module_id or None
    if not cat_id:
        return False, "Please select a category before saving a draft.", None
    if not module_id:
        return False, "Please select a module before saving a draft.", None

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
        # Task #42's exact global-uniqueness rule, just excluding this
        # resource's own row when re-saving an existing draft so a
        # lesson doesn't collide with itself.
        taken = is_lesson_title_taken(normalized_name, exclude_resource_id=existing_id)
        if taken is None:
            return False, "Could not verify lesson name uniqueness. Please try again.", None
        if taken:
            return False, (
                "A lesson with this name already exists. Lesson names must be "
                "unique across all categories and modules."
            ), None

        cursor = connection.cursor()

        if existing_id:
            # Confirm the row still exists before updating it - it may
            # have been deleted/archived by another admin in the
            # meantime.
            cursor.execute(
                f"SELECT resource_id FROM {LEARNING_RESOURCES_TABLE} WHERE resource_id = %s",
                (existing_id,)
            )
            if cursor.fetchone() is None:
                cursor.close()
                return False, "This draft no longer exists. Please refresh and try again.", None

            cursor.execute(
                f"""UPDATE {LEARNING_RESOURCES_TABLE}
                    SET resource_title = %s, cat_id = %s, module_id = %s, updated_at = NOW()
                    WHERE resource_id = %s""",
                (normalized_name, cat_id, module_id, existing_id)
            )

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
            return True, "Draft saved successfully.", existing_id

        # First save for this lesson - INSERT a brand new Draft row.
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