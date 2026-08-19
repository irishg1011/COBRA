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

# Task requirement: these two statuses must exist in
# learning_resources_stats_tbl. Never hardcoded anywhere else in the
# app - every caller reads the id it needs via get_draft_status_id() /
# get_published_status_id() below.
DEFAULT_LR_STATUSES = ["Draft", "Published"]

_lr_stats_ensured = False


def ensure_lr_stats(connection):
    """
    "If these records do not already exist, automatically insert them
    into learning_resources_stats_tbl." Idempotent and gated behind a
    module-level flag (same pattern as manage_course.ensure_module_stats)
    so it only round-trips once per process lifetime.
    """
    global _lr_stats_ensured
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