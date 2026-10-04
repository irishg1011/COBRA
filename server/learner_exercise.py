"""
learner_exercise.py - Learner-Side Coding Exercise Data Access & Grading
------------------------------------------------------------------------------
Pure DB-access helpers backing the learner-facing Exercise step on
lesson-content.html. Mirrors lesson_activities.py's convention: READ-ONLY
for exercise content from the learner's point of view, and NEVER returns
any test case's expected_output to the client - grading happens entirely
server-side in grade_exercise_submission() below, comparing the actual
output the learner's code produced (captured client-side via Pyodide and
sent up) against the real expected_output kept server-only.

This file never touches Flask/session state directly - learner_routes.py
is the only place these get turned into HTTP responses, matching the
project's existing convention.
"""

from mysql.connector import Error
from cobradb import get_db_connection

CODING_EXERCISES_TABLE = "coding_exercises_tbl"
TEST_CASES_TABLE = "test_cases_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
SUBMISSIONS_TABLE = "exercise_submissions_tbl"
PROGRESS_TABLE = "learner_exercise_progress_tbl"


def get_published_exercise_for_resource(resource_id):
    """
    Returns the Published coding_exercises_tbl row for `resource_id`,
    with its test cases' test_input ONLY - never expected_output, which
    stays server-side until grading.

    Returns None if the lesson has no Published exercise, or on any
    database error.
    """
    if not resource_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT ce.exercise_id, ce.exercise_title, ce.points, ce.instruction,
                       ce.situation, ce.problem_question, ce.clue
                FROM {CODING_EXERCISES_TABLE} ce
                JOIN {LA_STATS_TABLE} las ON ce.exercise_stats_id = las.la_stats_id
                WHERE ce.resource_id = %s AND las.la_stats_name = 'Published'
                  AND COALESCE(ce.is_archived, 0) = 0
                ORDER BY ce.exercise_id DESC
                LIMIT 1""",
            (resource_id,)
        )
        exercise = cursor.fetchone()
        if not exercise:
            cursor.close()
            return None

        cursor.execute(
            f"""SELECT test_case_id, test_order, test_input
                FROM {TEST_CASES_TABLE}
                WHERE exercise_id = %s
                ORDER BY test_order ASC, test_case_id ASC""",
            (exercise["exercise_id"],)
        )
        exercise["test_cases"] = cursor.fetchall()
        cursor.close()
        return exercise
    except Error as e:
        print(f"learner_exercise: failed to load exercise for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def is_exercise_completed(acc_id, exercise_id):
    """Returns True if this learner already has a completed row for this exercise."""
    connection = get_db_connection()
    if connection is None:
        return False
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT progress_id FROM {PROGRESS_TABLE} WHERE acc_id = %s AND exercise_id = %s",
            (acc_id, exercise_id)
        )
        row = cursor.fetchone()
        cursor.close()
        return row is not None
    except Error as e:
        print(f"learner_exercise: failed to check completion for exercise_id={exercise_id}: {e}")
        return False
    finally:
        if connection.is_connected():
            connection.close()

def get_latest_submission(acc_id, exercise_id, correct_only=False):
    """
    Returns this learner's most recent exercise_submissions_tbl row for
    `exercise_id` (highest attempt_number) - used to pre-fill the code
    editor and show the last result when reviewing an exercise they've
    already attempted, rather than showing a blank slate.

    correct_only: the latest PASSING attempt instead - a passed exercise is
    locked, so its page shows the code that passed, not a later failed try.

    Returns None if they've never submitted, or on any database error.
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT submitted_code, status, test_cases_passed, test_cases_total, feedback_given
                FROM {SUBMISSIONS_TABLE}
                WHERE acc_id = %s AND exercise_id = %s
                  {"AND status = 'correct'" if correct_only else ""}
                ORDER BY attempt_number DESC, submission_id DESC
                LIMIT 1""",
            (acc_id, exercise_id)
        )
        row = cursor.fetchone()
        cursor.close()
        return row
    except Error as e:
        print(f"learner_exercise: failed to get latest submission for exercise_id={exercise_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()

def grade_exercise_submission(acc_id, exercise_id, submitted_code, actual_outputs):
    """
    Grades one submission: `actual_outputs` is a list of
    {"test_case_id": int, "actual_output": str} - the REAL output the
    learner's code produced for each test case, captured client-side via
    Pyodide and fed real test_input. This looks up each test case's real
    expected_output (never sent to the client) and compares, trimmed on
    both sides.

    Logs the attempt as a new row in exercise_submissions_tbl
    (append-only, attempt_number increments per (acc_id, exercise_id)).

    Returns (passed: int, total: int, status: str, feedback: str) on
    success, or None on failure (exercise not found, DB unreachable).
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT test_case_id, expected_output FROM {TEST_CASES_TABLE} WHERE exercise_id = %s",
            (exercise_id,)
        )
        test_case_rows = cursor.fetchall()
        expected_by_id = {r["test_case_id"]: (r["expected_output"] or "").strip() for r in test_case_rows}
        total = len(expected_by_id)

        if total == 0:
            cursor.close()
            return None

        actual_by_id = {int(a["test_case_id"]): (a.get("actual_output") or "").strip() for a in (actual_outputs or [])}

        passed = 0
        for tc_id, expected in expected_by_id.items():
            actual = actual_by_id.get(tc_id, "")
            if actual == expected:
                passed += 1

        status = "correct" if passed == total else "incorrect"

        cursor.execute(
            f"SELECT correct_feedback FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s",
            (exercise_id,)
        )
        ex_row = cursor.fetchone()
        correct_feedback = (ex_row.get("correct_feedback") if ex_row else "") or ""

        feedback = correct_feedback if status == "correct" else f"{passed} of {total} test cases passed. Review your code and try again."

        cursor.execute(
            f"SELECT COUNT(*) AS cnt FROM {SUBMISSIONS_TABLE} WHERE acc_id = %s AND exercise_id = %s",
            (acc_id, exercise_id)
        )
        attempt_number = cursor.fetchone()["cnt"] + 1

        cursor.execute(
            f"""INSERT INTO {SUBMISSIONS_TABLE}
                (acc_id, exercise_id, submitted_code, test_cases_passed, test_cases_total,
                 attempt_number, status, source, recommendation_id, feedback_given, submitted_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'self', NULL, %s, NOW())""",
            (acc_id, exercise_id, submitted_code or "", passed, total, attempt_number, status, feedback)
        )
        connection.commit()
        cursor.close()
        return passed, total, status, feedback
    except Error as e:
        connection.rollback()
        print(f"learner_exercise: failed to grade submission for exercise_id={exercise_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def record_exercise_progress(acc_id, exercise_id):
    """
    Marks this exercise completed for this learner. Only ever inserted
    once (completed_at is NOT NULL - there's no in-progress state for
    exercises, unlike lessons/activities) - calling this again for an
    already-completed exercise is a no-op.

    Best-effort: returns True/False, never raises.
    """
    connection = get_db_connection()
    if connection is None:
        return False
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT progress_id FROM {PROGRESS_TABLE} WHERE acc_id = %s AND exercise_id = %s",
            (acc_id, exercise_id)
        )
        if cursor.fetchone():
            cursor.close()
            return True

        cursor.execute(
            f"""INSERT INTO {PROGRESS_TABLE} (acc_id, exercise_id, status, completed_at)
                VALUES (%s, %s, 'completed', NOW())""",
            (acc_id, exercise_id)
        )
        connection.commit()
        cursor.close()
        return True
    except Error as e:
        connection.rollback()
        print(f"learner_exercise: failed to record exercise progress for exercise_id={exercise_id}: {e}")
        return False
    finally:
        if connection.is_connected():
            connection.close()