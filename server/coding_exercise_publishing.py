"""
coding_exercise_publishing.py - Task #111: Publish & Unpublish Workflow for Coding Exercises
--------------------------------------------------------------------------------------
Pure DB-access helper backing the Coding Exercises publish/unpublish workflow,
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


def publish_exercise(exercise_id):
    """
    Task #111: flips a coding exercise's status to "Published".
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
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT exercise_id FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s",
            (exercise_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Coding exercise not found."

        published_id = get_published_status_id(connection)
        if not published_id:
            cursor.close()
            return False, "Could not resolve the Published status."

        cursor.execute(
            f"""UPDATE {CODING_EXERCISES_TABLE}
                SET exercise_stats_id = %s, updated_at = NOW()
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
    Task #111: flips a coding exercise's status back to "Draft".
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
                SET exercise_stats_id = %s, updated_at = NOW()
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
