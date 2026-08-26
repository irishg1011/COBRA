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
            f"SELECT la_id FROM {LEARNING_ACTIVITIES_TABLE} WHERE la_id = %s",
            (activity_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Learning activity not found."

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