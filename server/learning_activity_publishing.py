"""
learning_activity_publishing.py - Task #57: Publish Workflow for Learning
Activities
--------------------------------------------------------------------------------------
Pure DB-access helper backing the Create Learning Activity page's Publish
button, mirroring resource_publishing.py's exact pattern for Learning
Resources: this file never touches Flask/session state directly -
admin_routes.py is the only place this gets turned into an HTTP response.

WHY THIS EXISTS
Before Task #57, admin_routes.py's create_activity_submit() had a bare
"TODO: Insert activity and question sets" placeholder - nothing was ever
saved, and there was no concept of "publish" for a learning activity at
all. learning_activity_draft.save_activity_draft() already knows how to
INSERT/UPDATE a learning_activities_tbl row (Section 1) and its
questions/fill-blanks/flashcards (Section 2) - but it always saves with
la_stats_id = "Draft" (see its own docstring: "Saves a Draft ... row").

This file adds the other half: flipping an already-saved activity's status
to "Published", exactly the same two-step shape
admin_routes.py's upload_resource() route already uses for Learning
Resources:

    1. save_lesson_draft(...)      -> resource_publishing.publish_resource(...)
    2. save_activity_draft(...)    -> learning_activity_publishing.publish_activity(...)

Task #57's create_activity_submit() calls save_activity_draft() first
(so Section 1 + Section 2 are persisted using the exact same
validated/normalized/server-computed-points path Save Draft already uses -
Task #53/#55/#56 rules can never be bypassed by Publish), then calls
publish_activity() here to flip status to "Published" as the final step.

SCOPE
Only learning_activities_tbl.la_stats_id (and updated_at) are ever
written here - no other column, no child table. Section 1/Section 2
persistence itself stays exclusively in learning_activity_draft.py /
learning_activity_content.py, matching this project's existing
convention of one file per concern (resource_draft.py vs.
resource_publishing.py).
"""

from mysql.connector import Error
from cobradb import get_db_connection
from learning_activities import ensure_la_stats, LA_STATS_TABLE, LEARNING_ACTIVITIES_TABLE


def _get_status_id(connection, name):
    """Looks up a single la_stats_id by its status name. Reuses the
    caller's already-open connection (see publish_activity() below)."""
    cursor = connection.cursor()
    cursor.execute(f"SELECT la_stats_id FROM {LA_STATS_TABLE} WHERE la_stats_name = %s", (name,))
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else None


def get_published_status_id(connection):
    """
    Returns the la_stats_id for "Published". Seeds
    learning_activities_stats_tbl first (ensure_la_stats() - the exact
    same seeding learning_activities.py's own DEFAULT_LA_STATUSES relies
    on), so this never fails against a fresh/empty database.
    """
    ensure_la_stats(connection)
    return _get_status_id(connection, "Published")


def get_draft_status_id(connection):
    """
    Task #107: returns the la_stats_id for "Draft" - the status a
    quick-unpublish from the Manage Learning Activities table flips an
    activity back to. Mirrors resource_publishing.get_draft_status_id()'s
    exact role for Learning Resources, just reusing the caller's
    already-open connection (see unpublish_activity() below) rather than
    opening its own, since this is only ever called from inside another
    function that already has one.
    """
    ensure_la_stats(connection)
    return _get_status_id(connection, "Draft")


def publish_activity(activity_id):
    """
    Task #57: flips a previously-saved learning activity's status to
    "Published". Expects `activity_id` to already exist (i.e.
    learning_activity_draft.save_activity_draft() has already run
    successfully for this same activity, in the same request) - this
    function never creates a row itself, it only updates one that's
    already there.

    Args:
        activity_id (int | str): the learning_activities_tbl.la_id to
            publish.

    Returns:
        (bool, str): (success, message) - mirrors
        resource_publishing.publish_resource()'s exact return
        convention, so admin_routes.py can handle both the exact same
        way.
    """
    if not activity_id:
        return False, "Activity ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_la_stats(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"""
            SELECT la.la_id, la.module_id, ms.module_stats_name
            FROM {LEARNING_ACTIVITIES_TABLE} la
            LEFT JOIN modules_tbl m ON la.module_id = m.module_id
            LEFT JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
            WHERE la.la_id = %s
            """,
            (activity_id,)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Learning activity not found."

        module_status = row[2] or "Draft"
        if module_status != "Published":
            cursor.close()
            return False, f"Cannot publish this activity - its parent module is still in {module_status} status. Publish the parent module first."

        published_id = get_published_status_id(connection)
        if not published_id:
            cursor.close()
            return False, "Could not resolve the Published status."

        cursor.execute(
            f"""UPDATE {LEARNING_ACTIVITIES_TABLE}
                SET la_stats_id = %s, updated_at = NOW()
                WHERE la_id = %s""",
            (published_id, activity_id)
        )
        connection.commit()
        cursor.close()
        return True, "Learning activity published successfully."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"learning_activity_publishing: failed to publish activity {activity_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def unpublish_activity(activity_id):
    """
    Task #107: reverses publish_activity() - flips a previously-published
    learning activity's status back to "Draft" directly from the Manage
    Learning Activities table's quick Publish/Unpublish toggle. No
    parent-status gate is needed to unpublish (unlike publishing) -
    taking an activity offline is always allowed, mirroring
    resource_publishing.unpublish_resource()'s exact convention for
    Learning Resources.

    Args:
        activity_id (int | str): the learning_activities_tbl.la_id to
            unpublish.

    Returns:
        (bool, str): (success, message) - same (success, message)
        convention as publish_activity() above, so admin_routes.py can
        handle both the exact same way.
    """
    if not activity_id:
        return False, "Activity ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_la_stats(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT la_id FROM {LEARNING_ACTIVITIES_TABLE} WHERE la_id = %s",
            (activity_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Learning activity not found."

        draft_id = get_draft_status_id(connection)
        if not draft_id:
            cursor.close()
            return False, "Could not resolve the Draft status."

        cursor.execute(
            f"""UPDATE {LEARNING_ACTIVITIES_TABLE}
                SET la_stats_id = %s, updated_at = NOW()
                WHERE la_id = %s""",
            (draft_id, activity_id)
        )
        connection.commit()
        cursor.close()
        return True, "Learning activity moved back to Draft."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"learning_activity_publishing: failed to unpublish activity {activity_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def get_archived_status_id(connection):
    """
    Returns the la_stats_id for "Archived". Seeds
    learning_activities_stats_tbl first.
    """
    ensure_la_stats(connection)
    return _get_status_id(connection, "Archived")


def get_ready_to_publish_status_id(connection):
    """
    Returns the la_stats_id for "Ready to Publish" (Task
    #publishing-schema). Seeds learning_activities_stats_tbl first,
    same convention as get_published_status_id() above.
    """
    ensure_la_stats(connection)
    return _get_status_id(connection, "Ready to Publish")


def mark_ready_to_publish_activity(activity_id):
    """
    Task #publishing-schema: flips a learning activity's status to
    "Ready to Publish" - the queue the new Publishing page's Ready to
    Publish tab reads from. Unlike publish_activity(), this never
    checks the parent module's status - queueing something as ready
    doesn't make it live, so there's nothing to gate here.

    Returns (bool, str) - (success, message).
    """
    if not activity_id:
        return False, "Activity ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_la_stats(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT la_id FROM {LEARNING_ACTIVITIES_TABLE} WHERE la_id = %s",
            (activity_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Learning activity not found."

        ready_id = get_ready_to_publish_status_id(connection)
        if not ready_id:
            cursor.close()
            return False, "Could not resolve the Ready to Publish status."

        cursor.execute(
            f"""UPDATE {LEARNING_ACTIVITIES_TABLE}
                SET la_stats_id = %s, updated_at = NOW()
                WHERE la_id = %s""",
            (ready_id, activity_id)
        )
        connection.commit()
        cursor.close()
        return True, "Learning activity marked as Ready to Publish."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"learning_activity_publishing: failed to mark activity {activity_id} ready to publish: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def archive_activity(activity_id):
    """
    Archives a learning activity by setting its la_stats_id to Archived.
    """
    if not activity_id:
        return False, "Activity ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_la_stats(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT la_id FROM {LEARNING_ACTIVITIES_TABLE} WHERE la_id = %s",
            (activity_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Learning activity not found."

        archived_id = get_archived_status_id(connection)
        if not archived_id:
            cursor.close()
            return False, "Could not resolve the Archived status."

        cursor.execute(
            f"""UPDATE {LEARNING_ACTIVITIES_TABLE}
                SET la_stats_id = %s, updated_at = NOW()
                WHERE la_id = %s""",
            (archived_id, activity_id)
        )
        connection.commit()
        cursor.close()
        return True, "Learning activity archived successfully."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"learning_activity_publishing: failed to archive activity {activity_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()
