"""
coding_exercise_publishing.py - Task #111 & #112: Publish, Unpublish & Archive Workflow for Coding Exercises
---------------------------------------------------------------------------------------------------------
Pure DB-access helper backing the Coding Exercises publish/unpublish/archive workflow,
mirroring learning_activity_publishing.py and resource_publishing.py patterns:
this file never touches Flask/session state directly - admin_routes.py is the
only place this gets turned into an HTTP response.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from coding_exercises import (
    ensure_exercise_stats,
    LA_STATS_TABLE,
    CODING_EXERCISES_TABLE,
)

_is_archived_column_ensured = False


def ensure_exercise_is_archived_column(connection):
    """
    Task #112: ensures coding_exercises_tbl has an is_archived TINYINT(1) column.
    """
    global _is_archived_column_ensured
    if _is_archived_column_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {CODING_EXERCISES_TABLE} ADD COLUMN IF NOT EXISTS "
            f"is_archived TINYINT(1) NOT NULL DEFAULT 0"
        )
        connection.commit()
        cursor.close()
        _is_archived_column_ensured = True
    except Error as e:
        print(f"coding_exercise_publishing: failed to ensure {CODING_EXERCISES_TABLE}.is_archived: {e}")


def _get_status_id(connection, name):
    """Looks up a single la_stats_id by its status name."""
    cursor = connection.cursor()
    cursor.execute(f"SELECT la_stats_id FROM {LA_STATS_TABLE} WHERE la_stats_name = %s", (name,))
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else None


def get_published_status_id(connection):
    """Returns the la_stats_id for 'Published'."""
    ensure_exercise_stats(connection)
    return _get_status_id(connection, "Published")


def get_draft_status_id(connection):
    """Returns the la_stats_id for 'Draft'."""
    ensure_exercise_stats(connection)
    return _get_status_id(connection, "Draft")


def get_archived_status_id(connection):
    """Returns the la_stats_id for 'Archived'."""
    ensure_exercise_stats(connection)
    return _get_status_id(connection, "Archived")


def publish_exercise(exercise_id):
    """
    Task #111 & #112: flips a coding exercise's status to "Published" (is_archived = 0).
    Expects exercise_id to already exist in coding_exercises_tbl.

    Args:
        exercise_id (int | str): the coding_exercises_tbl.exercise_id to publish.

    Returns:
        (bool, str): (success, message)
    """
    if not exercise_id:
        return False, "Exercise ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_exercise_stats(connection)
        ensure_exercise_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"""
            SELECT ce.exercise_id, lr.resource_id, lrs.lr_stats_name
            FROM {CODING_EXERCISES_TABLE} ce
            LEFT JOIN learning_resources_tbl lr ON ce.resource_id = lr.resource_id
            LEFT JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
            WHERE ce.exercise_id = %s
            """,
            (exercise_id,)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Coding exercise not found."

        lesson_status = row[2] or "Draft"
        if lesson_status != "Published":
            cursor.close()
            return False, f"Cannot publish this exercise - its parent lesson is still in {lesson_status} status. Publish the parent lesson first."

        published_id = get_published_status_id(connection)
        if not published_id:
            cursor.close()
            return False, "Could not resolve the Published status."

        cursor.execute(
            f"""UPDATE {CODING_EXERCISES_TABLE}
                SET exercise_stats_id = %s, is_archived = 0, updated_at = NOW()
                WHERE exercise_id = %s""",
            (published_id, exercise_id)
        )
        connection.commit()
        cursor.close()
        return True, "Coding exercise published successfully."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"coding_exercise_publishing: failed to publish exercise {exercise_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def unpublish_exercise(exercise_id):
    """
    Task #111 & #112: flips a coding exercise's status back to "Draft" (is_archived = 0).
    Expects exercise_id to already exist in coding_exercises_tbl.

    Args:
        exercise_id (int | str): the coding_exercises_tbl.exercise_id to unpublish.

    Returns:
        (bool, str): (success, message)
    """
    if not exercise_id:
        return False, "Exercise ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_exercise_stats(connection)
        ensure_exercise_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT exercise_id FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s",
            (exercise_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Coding exercise not found."

        draft_id = get_draft_status_id(connection)
        if not draft_id:
            cursor.close()
            return False, "Could not resolve the Draft status."

        cursor.execute(
            f"""UPDATE {CODING_EXERCISES_TABLE}
                SET exercise_stats_id = %s, is_archived = 0, updated_at = NOW()
                WHERE exercise_id = %s""",
            (draft_id, exercise_id)
        )
        connection.commit()
        cursor.close()
        return True, "Coding exercise moved back to Draft."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"coding_exercise_publishing: failed to unpublish exercise {exercise_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()

def get_ready_to_publish_status_id(connection):
    """Returns the la_stats_id for 'Ready to Publish' (Task #publishing-schema)."""
    ensure_exercise_stats(connection)
    return _get_status_id(connection, "Ready to Publish")


def mark_ready_to_publish_exercise(exercise_id):
    """
    Task #publishing-schema: flips a coding exercise's status to "Ready
    to Publish" - the queue the new Publishing page's Ready to Publish
    tab reads from. Unlike publish_exercise(), this never checks the
    parent module's status - queueing something as ready doesn't make
    it live, so there's nothing to gate here.

    Returns (bool, str) - (success, message).
    """
    if not exercise_id:
        return False, "Exercise ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_exercise_stats(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT exercise_id FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s",
            (exercise_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Coding exercise not found."

        ready_id = get_ready_to_publish_status_id(connection)
        if not ready_id:
            cursor.close()
            return False, "Could not resolve the Ready to Publish status."

        cursor.execute(
            f"""UPDATE {CODING_EXERCISES_TABLE}
                SET exercise_stats_id = %s, is_archived = 0, updated_at = NOW()
                WHERE exercise_id = %s""",
            (ready_id, exercise_id)
        )
        connection.commit()
        cursor.close()
        return True, "Coding exercise marked as Ready to Publish."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"coding_exercise_publishing: failed to mark exercise {exercise_id} ready to publish: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()

def unpublish_exercise_to_ready(exercise_id):
    """
    Task #7: the Publishing page's own Unpublish action for a coding
    exercise - a leaf node, so no cascade needed. Targets "Ready to
    Publish" instead of "Draft", distinct from unpublish_exercise()
    (the manage-side action, still targeting "Draft").
    """
    if not exercise_id:
        return False, "Exercise ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_exercise_stats(connection)
        ensure_exercise_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT exercise_id FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s",
            (exercise_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Coding exercise not found."

        ready_id = get_ready_to_publish_status_id(connection)
        if not ready_id:
            cursor.close()
            return False, "Could not resolve the Ready to Publish status."

        cursor.execute(
            f"""UPDATE {CODING_EXERCISES_TABLE}
                SET exercise_stats_id = %s, is_archived = 0, updated_at = NOW()
                WHERE exercise_id = %s""",
            (ready_id, exercise_id)
        )
        connection.commit()
        cursor.close()
        return True, "Coding exercise moved back to Ready to Publish."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"coding_exercise_publishing: failed to unpublish exercise {exercise_id} to ready: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def archive_exercise(exercise_id):
    """
    Task #112: Soft-archives a coding exercise.
    Flips is_archived = 1 and exercise_stats_id to 'Archived'.
    Preserves database records and associated test cases.

    Args:
        exercise_id (int | str): the coding_exercises_tbl.exercise_id to archive.

    Returns:
        (bool, str): (success, message)
    """
    if not exercise_id:
        return False, "Exercise ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_exercise_stats(connection)
        ensure_exercise_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT exercise_id FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s",
            (exercise_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Coding exercise not found."

        # Task #123: backend-level guard, not just the frontend archive-
        # check - a Published exercise can never be archived directly,
        # matching the same rule enforced for Modules/Categories.
        cursor.execute(
            f"""SELECT last.la_stats_name FROM {CODING_EXERCISES_TABLE} ce
                LEFT JOIN {LA_STATS_TABLE} last ON ce.exercise_stats_id = last.la_stats_id
                WHERE ce.exercise_id = %s""",
            (exercise_id,)
        )
        (current_status,) = cursor.fetchone()
        if current_status == "Published":
            cursor.close()
            return False, (
                "This exercise is Published. You must unpublish it first "
                "before you can archive it."
            )

        archived_id = get_archived_status_id(connection)
        if not archived_id:
            cursor.close()
            return False, "Could not resolve the Archived status."

        cursor.execute(
            f"""UPDATE {CODING_EXERCISES_TABLE}
                SET is_archived = 1, exercise_stats_id = %s, updated_at = NOW()
                WHERE exercise_id = %s""",
            (archived_id, exercise_id)
        )
        connection.commit()
        cursor.close()
        return True, "Coding exercise archived successfully."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"coding_exercise_publishing: failed to archive exercise {exercise_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()