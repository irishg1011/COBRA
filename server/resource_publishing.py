"""
resource_publishing.py - Task #43: Learning Resource Publish Workflow
------------------------------------------------------------------------
Pure DB-access helpers backing the Admin > Learning Resources publish/
unpublish workflow, mirroring lesson_validation.py / learning_resources.py's
style exactly: this file never touches Flask/session state directly -
admin_routes.py is the only place these get turned into HTTP responses.

WHAT THIS FILE DOES
1. Seeds learning_resources_stats_tbl with "Draft" / "Published" the same
   lazy way manage_course.py's ensure_module_stats() seeds
   module_stats_tbl - no manual migration step required.
2. get_draft_status_id() - the id every newly created learning resource
   should be inserted with (Task #43, Requirement: "Set the default
   status of learning resources to Draft automatically upon creation").
   Whichever code path eventually performs the INSERT into
   learning_resources_tbl (see admin_routes.py: upload_resource()) should
   call this for the row's lr_stats_id instead of hardcoding an id.
3. publish_resource(resource_id) / unpublish_resource(resource_id) - the
   two actions behind the Learning Resources table's Publish/Unpublish
   button. publish_resource() is the authoritative, server-side gate:
   it refuses to publish a resource whose parent module is not itself
   "Published" - the frontend's confirmation dialog and disabled-button
   state are UX conveniences on top of this, never a substitute for it.

NOTE ON "category or module" GATING
category_tbl in this project's schema (see cobra_db.sql) has no
publish/draft status column of its own - only modules_tbl does, via
module_stats_id -> module_stats_tbl. Categories are purely a grouping/
label here. So a resource's parent CATEGORY can't be gated on a real
"is it still Draft" value until/unless a status column is added to
category_tbl the same lazy way modules_tbl.is_archived was added (see
manage_course.py: ensure_is_archived_column()). This file gates on the
one real, existing parent-status signal in the schema today - the
resource's parent MODULE's status - and is written so a category-status
check can be dropped in later without changing its public functions'
signatures.
"""

from mysql.connector import Error
from cobradb import get_db_connection

LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LR_STATS_TABLE = "learning_resources_stats_tbl"
MODULES_TABLE = "modules_tbl"
MODULE_STATS_TABLE = "module_stats_tbl"
CATEGORY_TABLE = "category_tbl"

# Task requirement: these statuses must exist in
# learning_resources_stats_tbl. Never hardcoded anywhere else in the
# app - every caller reads the id it needs via get_draft_status_id() /
# get_published_status_id() / get_archived_status_id() below.
#
# NEW (Task #81): "Archived" is a resource-level state distinct from
# Draft/Published, backing the Manage Learning Resources table's
# ACTIONS -> Archive control. This mirrors module_stats_tbl already
# having a "Archived" status alongside "Draft"/"Published" (see
# manage_course.py's DEFAULT_STATUSES) - no schema change, just a new
# row in the existing learning_resources_stats_tbl, seeded lazily the
# exact same way Draft/Published already are.
DEFAULT_LR_STATUSES = ["Draft", "Published", "Archived", "Ready to Publish"]

_lr_stats_ensured = False
_resource_display_order_column_ensured = False


def ensure_resource_display_order_column(connection):
    """
    Task #publishing-schema: adds learning_resources_tbl.display_order
    (INT NULL) for the Publishing page's lesson reordering, then backfills
    existing rows per module (not globally), using created_at order, so
    nothing jumps around the first time this ships.
    """
    global _resource_display_order_column_ensured
    if _resource_display_order_column_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {LEARNING_RESOURCES_TABLE} ADD COLUMN IF NOT EXISTS "
            f"display_order INT(10) NULL"
        )
        cursor.execute(f"SELECT DISTINCT module_id FROM {LEARNING_RESOURCES_TABLE}")
        for (module_id,) in cursor.fetchall():
            cursor.execute(
                f"SELECT resource_id FROM {LEARNING_RESOURCES_TABLE} "
                f"WHERE module_id = %s AND display_order IS NULL "
                f"ORDER BY created_at ASC, resource_id ASC",
                (module_id,)
            )
            for position, (resource_id,) in enumerate(cursor.fetchall(), start=1):
                cursor.execute(
                    f"UPDATE {LEARNING_RESOURCES_TABLE} SET display_order = %s WHERE resource_id = %s",
                    (position, resource_id)
                )
        connection.commit()
        cursor.close()
        _resource_display_order_column_ensured = True
    except Error as e:
        print(f"resource_publishing: failed to ensure {LEARNING_RESOURCES_TABLE}.display_order column exists: {e}")


def ensure_lr_stats(connection):
    """
    "If these records do not already exist, automatically insert them
    into learning_resources_stats_tbl." Idempotent and gated behind a
    module-level flag (same pattern as manage_course.ensure_module_stats)
    so it only round-trips once per process lifetime.
    """
    global _lr_stats_ensured
    ensure_resource_display_order_column(connection)
    if _lr_stats_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT lr_stats_name FROM {LR_STATS_TABLE}")
        existing = {row[0] for row in cursor.fetchall()}
        missing = [s for s in DEFAULT_LR_STATUSES if s not in existing]
        for name in missing:
            cursor.execute(
                f"INSERT INTO {LR_STATS_TABLE} (lr_stats_name) VALUES (%s)",
                (name,)
            )
        if missing:
            connection.commit()
        cursor.close()
        _lr_stats_ensured = True
    except Error as e:
        print(f"resource_publishing: failed to seed {LR_STATS_TABLE}: {e}")


def _get_status_id(connection, name):
    cursor = connection.cursor()
    cursor.execute(f"SELECT lr_stats_id FROM {LR_STATS_TABLE} WHERE lr_stats_name = %s", (name,))
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else None


def get_draft_status_id(connection=None):
    """
    Returns the lr_stats_id for "Draft" - the default status every new
    learning resource must be created with (Task #43). Opens/closes its
    own connection when one isn't supplied, so a resource-creation code
    path can call this as a one-liner:

        lr_stats_id = get_draft_status_id()
        cursor.execute("INSERT INTO learning_resources_tbl (..., lr_stats_id, ...) VALUES (..., %s, ...)", (..., lr_stats_id, ...))

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
        ensure_lr_stats(connection)
        return _get_status_id(connection, "Draft")
    finally:
        if own_connection and connection is not None and connection.is_connected():
            connection.close()


def get_published_status_id(connection):
    """Returns the lr_stats_id for "Published". Reuses the caller's
    already-open connection (see publish_resource() below)."""
    ensure_lr_stats(connection)
    return _get_status_id(connection, "Published")


def get_archived_status_id(connection):
    """Returns the lr_stats_id for "Archived" (Task #81). Reuses the
    caller's already-open connection, same convention as
    get_published_status_id() above."""
    ensure_lr_stats(connection)
    return _get_status_id(connection, "Archived")


def get_ready_to_publish_status_id(connection):
    """Returns the lr_stats_id for "Ready to Publish" (Task
    #publishing-schema). Reuses the caller's already-open connection,
    same convention as get_published_status_id() above."""
    ensure_lr_stats(connection)
    return _get_status_id(connection, "Ready to Publish")


def _get_resource_with_parent_status(connection, resource_id):
    """
    Looks up the resource plus its parent module's Published/Draft/
    Archived status (and, for future use, its category name) in one
    query. Returns None if no such resource exists.
    """
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        f"""
        SELECT
            lr.resource_id, lr.module_id, lr.cat_id,
            m.module_name, ms.module_stats_name,
            c.category_name
        FROM {LEARNING_RESOURCES_TABLE} lr
        LEFT JOIN {MODULES_TABLE} m ON lr.module_id = m.module_id
        LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
        LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
        WHERE lr.resource_id = %s
        """,
        (resource_id,)
    )
    row = cursor.fetchone()
    cursor.close()
    return row


def publish_resource(resource_id):
    """
    Task #43: flips a resource's status to "Published" - but ONLY if its
    parent module is itself already "Published". This is the
    authoritative gate; a request that reaches here with a non-Published
    parent module is always rejected, regardless of what the frontend
    showed or checked beforehand.

    Never touches modules_tbl or category_tbl themselves - only reads
    their status to decide whether this resource may go live.

    Returns (bool, str) - (success, message).
    """
    if not resource_id:
        return False, "Resource ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_lr_stats(connection)
        parent = _get_resource_with_parent_status(connection, resource_id)
        if parent is None:
            return False, "Resource not found."

        module_status = parent.get("module_stats_name")
        if module_status != "Published":
            module_label = parent.get("module_name") or "its parent module"
            return False, (
                f"Cannot publish this resource - {module_label} is still "
                f"in {module_status or 'Draft'} status. Publish the parent "
                f"module first."
            )

        published_id = get_published_status_id(connection)
        if not published_id:
            return False, "Could not resolve the Published status."

        cursor = connection.cursor()
        cursor.execute(
            f"""UPDATE {LEARNING_RESOURCES_TABLE}
                SET lr_stats_id = %s, updated_at = NOW()
                WHERE resource_id = %s""",
            (published_id, resource_id)
        )
        connection.commit()
        cursor.close()
        return True, "Resource published successfully."
    except Error as e:
        connection.rollback()
        print(f"resource_publishing: failed to publish resource {resource_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def unpublish_resource(resource_id):
    """
    Task #43: reverses publish_resource() - flips the resource back to
    "Draft". No parent-status gate is needed to unpublish (unlike
    publishing) - taking something offline is always allowed.

    Returns (bool, str) - (success, message).
    """
    if not resource_id:
        return False, "Resource ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_lr_stats(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT resource_id FROM {LEARNING_RESOURCES_TABLE} WHERE resource_id = %s",
            (resource_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Resource not found."

        draft_id = get_draft_status_id(connection)
        if not draft_id:
            cursor.close()
            return False, "Could not resolve the Draft status."

        cursor.execute(
            f"""UPDATE {LEARNING_RESOURCES_TABLE}
                SET lr_stats_id = %s, updated_at = NOW()
                WHERE resource_id = %s""",
            (draft_id, resource_id)
        )
        connection.commit()
        cursor.close()
        return True, "Resource moved back to Draft."
    except Error as e:
        connection.rollback()
        print(f"resource_publishing: failed to unpublish resource {resource_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()

def mark_ready_to_publish_resource(resource_id):
    """
    Task #publishing-schema: flips a resource's status to "Ready to
    Publish" - the queue the new Publishing page's Ready to Publish tab
    reads from. Unlike publish_resource(), this never checks the parent
    module's status - queueing something as ready doesn't make it live,
    so there's nothing to gate here.

    Returns (bool, str) - (success, message).
    """
    if not resource_id:
        return False, "Resource ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_lr_stats(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT resource_id FROM {LEARNING_RESOURCES_TABLE} WHERE resource_id = %s",
            (resource_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Resource not found."

        ready_id = get_ready_to_publish_status_id(connection)
        if not ready_id:
            cursor.close()
            return False, "Could not resolve the Ready to Publish status."

        cursor.execute(
            f"""UPDATE {LEARNING_RESOURCES_TABLE}
                SET lr_stats_id = %s, updated_at = NOW()
                WHERE resource_id = %s""",
            (ready_id, resource_id)
        )
        connection.commit()
        cursor.close()
        return True, "Resource marked as Ready to Publish."
    except Error as e:
        connection.rollback()
        print(f"resource_publishing: failed to mark resource {resource_id} ready to publish: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()

def archive_resource(resource_id):
    """
    Task #81: backs the Manage Learning Resources table's ACTIONS ->
    Archive control. Flips a resource's lr_stats_id to "Archived" -
    never a DELETE, so the row (and its lesson_content_tbl content) is
    always preserved and the action is reversible by an admin re-
    editing the resource's status later, mirroring
    manage_course.archive_module()'s soft-delete convention for
    modules but scoped to learning_resources_tbl instead.

    Task #123 UPDATE: this used to have no parent-status gate at all
    ("always allowed regardless of status") - that's now superseded.
    A resource can no longer be archived while it, its Video Tutorial,
    any of its Activities, or any of its Coding Exercises is
    Published; the admin must unpublish those first. This backend
    check exists independently of the frontend's own archive-check
    call (manage_course.check_resource_archive_eligibility()) so a
    direct API call can never bypass it either.

    Returns (bool, str) - (success, message).
    """
    if not resource_id:
        return False, "Resource ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_lr_stats(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"""SELECT lr.resource_id, lrs.lr_stats_name FROM {LEARNING_RESOURCES_TABLE} lr
                LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE lr.resource_id = %s""",
            (resource_id,)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Resource not found."

        if row[1] == "Published":
            cursor.close()
            return False, (
                "This resource's Lesson Content is Published. You must "
                "unpublish it first before you can archive it."
            )

        # Task #123: also blocks on a Published Video Tutorial,
        # Activity, or Coding Exercise attached to this resource -
        # reuses the SAME recursive check the frontend's archive-check
        # route calls, imported lazily to avoid a circular import
        # (manage_course.py doesn't import resource_publishing.py).
        from manage_course import check_resource_archive_eligibility
        success, eligible, blockers, message = check_resource_archive_eligibility(resource_id)
        if success and not eligible:
            cursor.close()
            names = ", ".join(f"{b['title']} ({b['type']})" for b in blockers[:3])
            more = f" and {len(blockers) - 3} more" if len(blockers) > 3 else ""
            return False, (
                f"This resource still has published content: {names}{more}. "
                "You must unpublish these items first before you can archive this parent record."
            )

        archived_id = get_archived_status_id(connection)
        if not archived_id:
            cursor.close()
            return False, "Could not resolve the Archived status."

        cursor.execute(
            f"""UPDATE {LEARNING_RESOURCES_TABLE}
                SET lr_stats_id = %s, updated_at = NOW()
                WHERE resource_id = %s""",
            (archived_id, resource_id)
        )
        connection.commit()
        cursor.close()
        return True, "Resource archived successfully."
    except Error as e:
        connection.rollback()
        print(f"resource_publishing: failed to archive resource {resource_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()