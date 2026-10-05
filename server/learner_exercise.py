"""
learner_exercise.py - Learner-Side Coding Exercise Data Access & Grading
------------------------------------------------------------------------------
Pure DB-access helpers backing the learner-facing Exercise step on
lesson-content.html. Mirrors lesson_activities.py's convention: READ-ONLY
for exercise content from the learner's point of view, and NEVER returns
any test case's expected_output (or an AI check's requirement text) to
the client - grading happens entirely
server-side in grade_exercise_submission() below, comparing the actual
output the learner's code produced (captured client-side via Pyodide and
sent up) against the real expected_output kept server-only.

This file never touches Flask/session state directly - learner_routes.py
is the only place these get turned into HTTP responses, matching the
project's existing convention.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from exercise_tips import fix_tips, tips_text
from coding_exercises import (
    clean_test_text,  # same text rule when a test case is saved and when it is graded
    ensure_test_case_type_column, CASE_CHECK,
)
from exercise_ai import judge_checks, CheckerUnavailable  # "AI check" test cases

CODING_EXERCISES_TABLE = "coding_exercises_tbl"
TEST_CASES_TABLE = "test_cases_tbl"

# The page runs the learner's code once with NO input and sends what it
# printed under this test_case_id (no real test case has id 0). It is what
# the AI checks look at; "exact output" test cases use their own runs.
PLAIN_RUN_ID = 0
LA_STATS_TABLE = "learning_activities_stats_tbl"
SUBMISSIONS_TABLE = "exercise_submissions_tbl"
PROGRESS_TABLE = "learner_exercise_progress_tbl"

# After this many FAILED submissions the clue can be shown / the exercise
# can be skipped. A skip is saved as a status='skipped' row in
# exercise_submissions_tbl (never a progress row - that table only ever
# means "passed"), so it is not counted as an attempt anywhere.
HINT_AFTER_FAILS = 2
SKIP_AFTER_FAILS = 3
SKIPPED_STATUS = "skipped"


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

        ensure_test_case_type_column(connection)
        cursor.execute(
            f"""SELECT test_case_id, test_order, test_input, case_type
                FROM {TEST_CASES_TABLE}
                WHERE exercise_id = %s
                ORDER BY test_order ASC, test_case_id ASC""",
            (exercise["exercise_id"],)
        )
        exercise["test_cases"] = public_test_cases(cursor.fetchall())
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

def public_test_cases(rows):
    """
    Test cases as the lesson page may see them: never expected_output, and
    for an AI check never the requirement text either (it can give the
    answer away) - only that the row is a check, so the page does not run
    the code for it. A test input can be several lines (one per input()
    call); the page splits it on "\n", so it leaves here with "\n" only.
    """
    cases = []
    for row in rows:
        is_check = (row.get("case_type") or "") == CASE_CHECK
        cases.append({
            "test_case_id": row["test_case_id"],
            "test_order": row.get("test_order"),
            "case_type": CASE_CHECK if is_check else "output",
            "test_input": "" if is_check else clean_test_text(row.get("test_input")),
        })
    return cases


def evaluate_submission(connection, exercise_id, submitted_code, actual_outputs):
    """
    The ONE grading rule, shared by the learner's Submit and the admin
    Preview. Nothing is written here except the AI's saved verdict.

    `actual_outputs` is a list of {"test_case_id": int, "actual_output": str}
    - the REAL output the learner's code produced, captured in the browser
    by Pyodide: one entry per "exact output" test case (run with that test
    case's input), plus one under PLAIN_RUN_ID (run with no input).

      'output' test case  passes when the output equals expected_output
                          after clean_test_text() on both sides (line
                          endings and spaces at the end of a line do not
                          matter, everything else must match exactly).
      'check' test case   passes when the AI says the learner's code meets
                          the mentor's requirement (exercise_ai.py).

    Returns {"passed", "total", "status", "tips", "correct_feedback"} or
    None when the exercise has no test cases. Raises CheckerUnavailable
    when the AI could not answer - the caller must record no attempt.
    """
    ensure_test_case_type_column(connection)
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            f"""SELECT test_case_id, test_order, test_input, expected_output, case_type
                FROM {TEST_CASES_TABLE} WHERE exercise_id = %s
                ORDER BY test_order ASC, test_case_id ASC""",
            (exercise_id,)
        )
        rows = cursor.fetchall()
        if not rows:
            return None
        cursor.execute(
            f"""SELECT exercise_id, instruction, situation, problem_question,
                       expected_answer, correct_feedback
                FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s""",
            (exercise_id,)
        )
        exercise = cursor.fetchone() or {"exercise_id": exercise_id}
    finally:
        cursor.close()

    for number, row in enumerate(rows, start=1):
        row["number"] = int(row.get("test_order") or number)   # "Test N" in tips
        row["test_input"] = clean_test_text(row.get("test_input"))
        row["expected_output"] = clean_test_text(row.get("expected_output"))
    output_rows = [r for r in rows if (r.get("case_type") or "") != CASE_CHECK]
    check_rows = [r for r in rows if (r.get("case_type") or "") == CASE_CHECK]

    actual_by_id = {}
    for item in (actual_outputs or []):
        try:
            actual_by_id[int(item["test_case_id"])] = clean_test_text(item.get("actual_output"))
        except (KeyError, TypeError, ValueError):
            continue

    passed = sum(1 for r in output_rows if actual_by_id.get(r["test_case_id"], "") == r["expected_output"])
    tips = fix_tips(submitted_code, output_rows, actual_by_id)

    if check_rows:
        verdict = judge_checks(
            connection, exercise,
            [{"number": r["number"], "text": r["test_input"]} for r in check_rows],
            submitted_code,
            actual_by_id.get(PLAIN_RUN_ID),   # None when the page did not send it
        )
        for row in check_rows:
            result = verdict[row["number"]]
            if result["passed"]:
                passed += 1
            else:
                tips.append({
                    "test": row["number"],
                    "input": "",
                    "tip": result["reason"] or "Your code does not do what this part of the problem asks yet.",
                })

    total = len(rows)
    status = "correct" if passed == total else "incorrect"
    tips = [] if status == "correct" else sorted(tips, key=lambda t: t["test"])
    return {
        "passed": passed,
        "total": total,
        "status": status,
        "tips": tips,
        "correct_feedback": exercise.get("correct_feedback") or "",
    }


def grade_exercise_submission(acc_id, exercise_id, submitted_code, actual_outputs):
    """
    Grades one submission with evaluate_submission() and logs the attempt
    as a new row in exercise_submissions_tbl (append-only, attempt_number
    increments per (acc_id, exercise_id)).

    Returns (passed: int, total: int, status: str, feedback: str,
    tips: list - one per failing test case, empty when passed) on
    success, or None on failure (exercise not found, DB unreachable).
    Raises CheckerUnavailable when an AI check could not be judged: no
    attempt is logged, and the route asks the learner to submit again.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        result = evaluate_submission(connection, exercise_id, submitted_code, actual_outputs)
        if result is None:
            return None
        passed, total, status, tips = result["passed"], result["total"], result["status"], result["tips"]
        cursor = connection.cursor(dictionary=True)

        feedback = result["correct_feedback"] if status == "correct" else f"{passed} of {total} test cases passed. Review your code and try again."
        # The tips are saved with the attempt so mentors see what the learner was told.
        saved_feedback = feedback + ("\n" + tips_text(tips) if tips else "")

        cursor.execute(
            f"""SELECT COUNT(*) AS cnt FROM {SUBMISSIONS_TABLE}
                WHERE acc_id = %s AND exercise_id = %s AND status <> '{SKIPPED_STATUS}'""",
            (acc_id, exercise_id)
        )
        attempt_number = cursor.fetchone()["cnt"] + 1

        cursor.execute(
            f"""INSERT INTO {SUBMISSIONS_TABLE}
                (acc_id, exercise_id, submitted_code, test_cases_passed, test_cases_total,
                 attempt_number, status, source, recommendation_id, feedback_given, submitted_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'self', NULL, %s, NOW())""",
            (acc_id, exercise_id, submitted_code or "", passed, total, attempt_number, status, saved_feedback)
        )
        connection.commit()
        cursor.close()
        return passed, total, status, feedback, tips
    except CheckerUnavailable:
        raise   # nothing was logged - learner_routes tells the learner to try again
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
def exercise_score(cursor, acc_id, exercise_id, test_total):
    """
    {"earned", "passed", "skipped", "attempts", "failed", "best"} for one
    learner's exercise, caller's cursor. The ONE scoring rule everywhere:
      passed  -> every test case
      skipped -> the BEST attempt's passed test cases
      else    -> the latest attempt's passed test cases (0 when none)
    """
    cursor.execute(
        f"SELECT 1 AS ok FROM {PROGRESS_TABLE} WHERE acc_id = %s AND exercise_id = %s LIMIT 1",
        (acc_id, exercise_id)
    )
    passed = cursor.fetchone() is not None
    cursor.execute(
        f"""SELECT status, test_cases_passed FROM {SUBMISSIONS_TABLE}
            WHERE acc_id = %s AND exercise_id = %s
            ORDER BY attempt_number ASC, submission_id ASC""",
        (acc_id, exercise_id)
    )
    rows = cursor.fetchall()
    attempts = [r for r in rows if r["status"] != SKIPPED_STATUS]
    skipped = any(r["status"] == SKIPPED_STATUS for r in rows)
    best = max((int(r["test_cases_passed"] or 0) for r in attempts), default=0)
    latest = int(attempts[-1]["test_cases_passed"] or 0) if attempts else 0
    if passed:
        earned = test_total
    elif skipped:
        earned = min(best, test_total)
    else:
        earned = min(latest, test_total)
    return {
        "earned": earned,
        "passed": passed,
        "skipped": skipped and not passed,
        "attempts": len(attempts),
        "failed": sum(1 for r in attempts if r["status"] != "correct"),
        "best": best,
    }


def get_exercise_state(acc_id, exercise_id):
    """exercise_score() with its own connection, plus the hint/skip rules
    the lesson page needs. None on a database error."""
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(f"SELECT COUNT(*) AS cnt FROM {TEST_CASES_TABLE} WHERE exercise_id = %s", (exercise_id,))
        total = int(cursor.fetchone()["cnt"] or 0)
        state = exercise_score(cursor, acc_id, exercise_id, total)
        cursor.close()
        state["total"] = total
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
        cursor.execute(f"SELECT COUNT(*) AS cnt FROM {TEST_CASES_TABLE} WHERE exercise_id = %s", (exercise_id,))
        total = int(cursor.fetchone()["cnt"] or 0)
        state = exercise_score(cursor, acc_id, exercise_id, total)
        if state["passed"]:
            cursor.close()
            return False, "You already passed this exercise.", state
        if state["failed"] < SKIP_AFTER_FAILS:
            cursor.close()
            return False, f"You can skip after {SKIP_AFTER_FAILS} tries.", state
        if not state["skipped"]:
            cursor.execute(
                f"""SELECT submitted_code, test_cases_passed FROM {SUBMISSIONS_TABLE}
                    WHERE acc_id = %s AND exercise_id = %s AND status <> '{SKIPPED_STATUS}'
                    ORDER BY test_cases_passed DESC, attempt_number DESC LIMIT 1""",
                (acc_id, exercise_id)
            )
            best = cursor.fetchone()
            cursor.execute(
                f"""INSERT INTO {SUBMISSIONS_TABLE}
                    (acc_id, exercise_id, submitted_code, test_cases_passed, test_cases_total,
                     attempt_number, status, source, recommendation_id, feedback_given, submitted_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'skip', NULL, %s, NOW())""",
                (acc_id, exercise_id, (best or {}).get("submitted_code") or "", state["best"], total,
                 state["attempts"], SKIPPED_STATUS,
                 f"Skipped for now after {state['failed']} tries. Best attempt: {state['best']} of {total} test cases.")
            )
            connection.commit()
            state = exercise_score(cursor, acc_id, exercise_id, total)
        cursor.close()
        state["total"] = total
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