"""
learner_exercise.py - Learner-Side Coding Exercise Data Access & Grading
------------------------------------------------------------------------------
Pure DB-access helpers backing the learner-facing Exercise step on
lesson-content.html, and THE grader (feat/output-based-exercises) - the
learner's Submit and both staff previews all call evaluate_submission().

An attempt is correct only when ALL of these hold:
  1. the code ran without a Python error (the page runs it with Pyodide
     and sends the error text; a syntax error is also caught here),
  2. its output matches the exercise's ONE Expected Output after
     exercise_tips.normalize_output() on both sides,
  3. every "Required in the code" tag is found (exercise_tags.py - the
     code is parsed with ast, never executed on the server).

The page is given the Expected Output, the Given input and the required
tags (all three are shown to the learner). An exercise counts as ONE
gradable item everywhere (EXERCISE_ITEMS).

This file never touches Flask/session state directly - learner_routes.py
is the only place these get turned into HTTP responses, matching the
project's existing convention.
"""

import ast

from mysql.connector import Error
from cobradb import get_db_connection
from exercise_tips import error_feedback, output_feedback, normalize_output
from exercise_tags import missing_tags, tag_label
from coding_exercises import ensure_output_exercise_schema, load_exercise_spec, tag_dict

CODING_EXERCISES_TABLE = "coding_exercises_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
SUBMISSIONS_TABLE = "exercise_submissions_tbl"
PROGRESS_TABLE = "learner_exercise_progress_tbl"

# One exercise = one gradable item in every score (lesson summary, module
# performance, progress monitor, insights).
EXERCISE_ITEMS = 1

# After this many FAILED submissions the clue can be shown / the exercise
# can be skipped. A skip is saved as a status='skipped' row in
# exercise_submissions_tbl (never a progress row - that table only ever
# means "passed"), so it is not counted as an attempt anywhere.
HINT_AFTER_FAILS = 2
SKIP_AFTER_FAILS = 3
SKIPPED_STATUS = "skipped"


def add_public_spec(cursor, exercise):
    """
    Adds what the exercise screen shows - expected_output, given_input and
    required_tags [{"kind", "value", "label"}] - to an exercise row. Used
    by the learner page and both staff previews, so they all show the same.
    """
    spec = load_exercise_spec(cursor, exercise["exercise_id"]) or {
        "expected_output": "", "given_input": "", "tags": []}
    exercise["expected_output"] = spec["expected_output"]
    exercise["given_input"] = spec["given_input"]
    exercise["required_tags"] = [tag_dict(kind, value) for kind, value in spec["tags"]]
    return exercise


def get_published_exercise_for_resource(resource_id, acc_id=None):
    """
    Returns the Published coding_exercises_tbl row for `resource_id`,
    with its Expected Output, Given input and required tags (add_public_spec).
    feat/exercise-pool: with acc_id, THAT learner's exercise - one of the
    lesson's pool, drawn on their first visit and kept (exercise_pool.py).

    Returns None if the lesson has no Published exercise, or on any
    database error.
    """
    if not resource_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None

    own_id = None
    if acc_id:
        from exercise_pool import get_or_draw_exercise_id
        own_id = get_or_draw_exercise_id(acc_id, resource_id)
        if not own_id:
            connection.close()
            return None
    try:
        ensure_output_exercise_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT ce.exercise_id, ce.exercise_title, ce.points, ce.instruction,
                       ce.situation, ce.problem_question, ce.clue
                FROM {CODING_EXERCISES_TABLE} ce
                JOIN {LA_STATS_TABLE} las ON ce.exercise_stats_id = las.la_stats_id
                WHERE ce.resource_id = %s AND las.la_stats_name = 'Published'
                  AND COALESCE(ce.is_archived, 0) = 0
                  {"AND ce.exercise_id = %s" if own_id else ""}
                ORDER BY ce.exercise_id DESC
                LIMIT 1""",
            (resource_id, own_id) if own_id else (resource_id,)
        )
        exercise = cursor.fetchone()
        if not exercise:
            cursor.close()
            return None

        add_public_spec(cursor, exercise)
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
                WHERE acc_id = %s AND exercise_id = %s AND status <> '{SKIPPED_STATUS}'
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

def _syntax_error_text(code):
    """A traceback-like text when the code can't even be parsed, else None -
    so a syntax error is caught even if the page did not report it."""
    try:
        ast.parse(code)
        return None
    except SyntaxError as e:
        return f'File "<string>", line {e.lineno or 1}\n{type(e).__name__}: {e.msg}'
    except ValueError as e:   # e.g. a NUL character in the code
        return f"SyntaxError: {e}"


def _tags_text(labels):
    return ", ".join(labels)


def evaluate_submission(cursor, exercise_id, submitted_code, actual_output, error_text=None):
    """
    THE grading rule, shared by the learner's Submit and both staff
    previews. Writes nothing.

    actual_output: everything the code printed in ONE run with the Given
    input (captured by Pyodide in the browser). error_text: the Python
    error that run stopped with, if any.

    Returns None when the exercise does not exist, else
      {"status": "correct"|"incorrect", "output_passed": bool,
       "tags_passed": bool, "missing_tags": [labels], "feedback": str,
       "actual_output": str}
    """
    spec = load_exercise_spec(cursor, exercise_id)
    if spec is None:
        return None
    code = str(submitted_code or "")
    actual_output = str(actual_output or "")
    error_text = str(error_text or "").strip() or _syntax_error_text(code)

    missing = [tag_label(kind, value) for kind, value in missing_tags(code, spec["tags"])]
    tags_passed = not missing
    needs = f"this exercise needs: {_tags_text(missing)}."

    if error_text:
        output_passed = False
        feedback = error_feedback(error_text)
    else:
        output_hint = output_feedback(actual_output, spec["expected_output"])
        output_passed = output_hint is None
        if output_passed and tags_passed:
            feedback = spec["correct_feedback"] or "Great job! Your code is correct."
        elif output_passed:
            feedback = f"Your output is right, but {needs}"
        elif tags_passed:
            feedback = output_hint
        else:
            feedback = f"{output_hint} Also, {needs}"

    return {
        "status": "correct" if (not error_text and output_passed and tags_passed) else "incorrect",
        "output_passed": output_passed,
        "tags_passed": tags_passed,
        "missing_tags": missing,
        "feedback": feedback,
        "actual_output": normalize_output(actual_output),
    }


def grade_exercise_submission(acc_id, exercise_id, submitted_code, actual_output, error_text=None):
    """
    Grades one submission with evaluate_submission() and logs the attempt
    as a new row in exercise_submissions_tbl (append-only, attempt_number
    increments per (acc_id, exercise_id)). test_cases_passed is 1 or 0 out
    of test_cases_total = 1, so old readers of those columns stay sane.

    Returns evaluate_submission()'s dict on success, or None on failure
    (exercise not found, DB unreachable).
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        ensure_output_exercise_schema(connection)   # DDL first - it commits implicitly
        cursor = connection.cursor(dictionary=True)
        result = evaluate_submission(cursor, exercise_id, submitted_code, actual_output, error_text)
        if result is None:
            cursor.close()
            return None
        correct = result["status"] == "correct"

        cursor.execute(
            f"""SELECT COUNT(*) AS cnt FROM {SUBMISSIONS_TABLE}
                WHERE acc_id = %s AND exercise_id = %s AND status <> '{SKIPPED_STATUS}'""",
            (acc_id, exercise_id)
        )
        attempt_number = cursor.fetchone()["cnt"] + 1

        cursor.execute(
            f"""INSERT INTO {SUBMISSIONS_TABLE}
                (acc_id, exercise_id, submitted_code, test_cases_passed, test_cases_total,
                 attempt_number, status, source, recommendation_id, feedback_given,
                 actual_output, output_passed, tags_passed, submitted_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'self', NULL, %s, %s, %s, %s, NOW())""",
            (acc_id, exercise_id, submitted_code or "", 1 if correct else 0, EXERCISE_ITEMS,
             attempt_number, result["status"], result["feedback"], result["actual_output"],
             int(result["output_passed"]), int(result["tags_passed"]))
        )
        connection.commit()
        cursor.close()
        return result
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

# ---------------- failed attempts / hint / skip ----------------
def exercise_score(cursor, acc_id, exercise_id):
    """
    {"earned", "total", "passed", "skipped", "attempts", "failed", "best"}
    for one learner's exercise, caller's cursor. The ONE scoring rule
    everywhere: an exercise is EXERCISE_ITEMS (1) item, earned when the
    latest attempt's status is 'correct' (or it is passed). Read from the
    status column, never test_cases_passed, so old multi-test-case rows
    can't score above 100%.
    """
    cursor.execute(
        f"SELECT 1 AS ok FROM {PROGRESS_TABLE} WHERE acc_id = %s AND exercise_id = %s LIMIT 1",
        (acc_id, exercise_id)
    )
    passed = cursor.fetchone() is not None
    cursor.execute(
        f"""SELECT status FROM {SUBMISSIONS_TABLE}
            WHERE acc_id = %s AND exercise_id = %s
            ORDER BY attempt_number ASC, submission_id ASC""",
        (acc_id, exercise_id)
    )
    rows = cursor.fetchall()
    attempts = [r for r in rows if r["status"] != SKIPPED_STATUS]
    skipped = any(r["status"] == SKIPPED_STATUS for r in rows)
    latest_correct = bool(attempts) and attempts[-1]["status"] == "correct"
    return {
        "earned": EXERCISE_ITEMS if (passed or latest_correct) else 0,
        "total": EXERCISE_ITEMS,
        "passed": passed,
        "skipped": skipped and not passed,
        "attempts": len(attempts),
        "failed": sum(1 for r in attempts if r["status"] != "correct"),
        "best": EXERCISE_ITEMS if any(r["status"] == "correct" for r in attempts) else 0,
    }


def get_exercise_state(acc_id, exercise_id):
    """exercise_score() with its own connection, plus the hint/skip rules
    the lesson page needs. None on a database error."""
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        state = exercise_score(cursor, acc_id, exercise_id)
        cursor.close()
        state["hint_after"] = HINT_AFTER_FAILS
        state["skip_after"] = SKIP_AFTER_FAILS
        return state
    except Error as e:
        print(f"learner_exercise: failed to read exercise state for exercise_id={exercise_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def skip_exercise(acc_id, exercise_id):
    """
    Saves "skipped for now" after SKIP_AFTER_FAILS failed submissions.
    Returns (ok: bool, message: str, state: dict | None). Skipping twice is
    a no-op; a passed exercise can't be skipped.
    """
    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to database.", None
    try:
        cursor = connection.cursor(dictionary=True)
        state = exercise_score(cursor, acc_id, exercise_id)
        if state["passed"]:
            cursor.close()
            return False, "You already passed this exercise.", state
        if state["failed"] < SKIP_AFTER_FAILS:
            cursor.close()
            return False, f"You can skip after {SKIP_AFTER_FAILS} tries.", state
        if not state["skipped"]:
            cursor.execute(
                f"""SELECT submitted_code FROM {SUBMISSIONS_TABLE}
                    WHERE acc_id = %s AND exercise_id = %s AND status <> '{SKIPPED_STATUS}'
                    ORDER BY attempt_number DESC, submission_id DESC LIMIT 1""",
                (acc_id, exercise_id)
            )
            latest = cursor.fetchone()
            cursor.execute(
                f"""INSERT INTO {SUBMISSIONS_TABLE}
                    (acc_id, exercise_id, submitted_code, test_cases_passed, test_cases_total,
                     attempt_number, status, source, recommendation_id, feedback_given, submitted_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'skip', NULL, %s, NOW())""",
                (acc_id, exercise_id, (latest or {}).get("submitted_code") or "", state["best"], EXERCISE_ITEMS,
                 state["attempts"], SKIPPED_STATUS,
                 f"Skipped for now after {state['failed']} tries.")
            )
            connection.commit()
            state = exercise_score(cursor, acc_id, exercise_id)
        cursor.close()
        return True, "Exercise skipped.", state
    except Error as e:
        connection.rollback()
        print(f"learner_exercise: failed to skip exercise_id={exercise_id}: {e}")
        return False, "Could not skip this exercise. Please try again.", None
    finally:
        if connection.is_connected():
            connection.close()


def is_exercise_done(acc_id, exercise_id):
    """Passed OR skipped - what finishing the lesson needs."""
    if is_exercise_completed(acc_id, exercise_id):
        return True
    state = get_exercise_state(acc_id, exercise_id)
    return bool(state and state["skipped"])