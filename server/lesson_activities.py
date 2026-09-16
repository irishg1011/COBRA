"""
lesson_activities.py - Learner-Side Activities Data Access & Answer Checking
------------------------------------------------------------------------------
Pure DB-access helpers backing the learner-facing "Proceed to Activities"
gate on lesson-content.html. Mirrors learning_activity_content.py's table
routing (mcq_questions_tbl/mcq_options_tbl, fill_blanks_tbl,
flashcards_tbl) but is READ-ONLY from the learner's point of view for
question content, and NEVER returns the correct answer to the client -
answer checking happens entirely server-side in check_mcq_answer() /
check_fill_blank_answer() / check_flashcard_answer() below.

This file never touches Flask/session state directly - learner_routes.py
is the only place these get turned into HTTP responses, matching the
project's existing convention (learning_activities.py, resource_draft.py,
etc.).
"""

from mysql.connector import Error
from cobradb import get_db_connection

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
MCQ_QUESTIONS_TABLE = "mcq_questions_tbl"
MCQ_OPTIONS_TABLE = "mcq_options_tbl"
FILL_BLANKS_TABLE = "fill_blanks_tbl"
FLASHCARDS_TABLE = "flashcards_tbl"
FLASHCARD_ANSWERS_TABLE = "flashcard_learner_answers_tbl"
PROGRESS_TABLE = "learner_activity_progress_tbl"


def get_published_activities_for_resource(resource_id):
    """
    Returns every Published learning_activities_tbl row attached to
    `resource_id`, with Section 2 content shaped for the learner -
    NEVER including which MCQ option is correct, or any fill-in-the-
    blank correct_answer. Those are only ever revealed by
    check_mcq_answer()/check_fill_blank_answer() below, after the
    learner has actually submitted a guess.

    Returns [] (never raises) on any database error or if resource_id
    is falsy/invalid.
    """
    if not resource_id:
        return []
    try:
        resource_id = int(resource_id)
    except (TypeError, ValueError):
        return []

    connection = get_db_connection()
    if connection is None:
        return []

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT la.la_id, la.activity_title, la.points, atp.activity_type_name
                FROM {LEARNING_ACTIVITIES_TABLE} la
                JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
                LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
                WHERE la.resource_id = %s AND las.la_stats_name = 'Published'
                ORDER BY la.la_id ASC""",
            (resource_id,)
        )
        activity_rows = cursor.fetchall()

        results = []
        for row in activity_rows:
            la_id = row["la_id"]
            activity_type = row.get("activity_type_name") or ""
            entry = {
                "la_id": la_id,
                "activity_title": row["activity_title"],
                "activity_type": activity_type,
                "points": row.get("points") or 0,
                "items": [],
            }

            if activity_type == "Multiple Choice":
                cursor.execute(
                    f"SELECT q_id, question_text FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s ORDER BY q_id ASC",
                    (la_id,)
                )
                questions = cursor.fetchall()
                for q in questions:
                    cursor.execute(
                        f"""SELECT option_id, option_letter, option_text
                            FROM {MCQ_OPTIONS_TABLE} WHERE q_id = %s ORDER BY option_letter ASC""",
                        (q["q_id"],)
                    )
                    options = cursor.fetchall()
                    entry["items"].append({
                        "q_id": q["q_id"],
                        "question_text": q["question_text"],
                        "options": [
                            {"option_id": o["option_id"], "option_letter": o["option_letter"], "text": o["option_text"]}
                            for o in options
                        ],
                    })

            elif activity_type == "Fill in the Blanks":
                cursor.execute(
                    f"SELECT fib_id, content FROM {FILL_BLANKS_TABLE} WHERE la_id = %s ORDER BY fib_id ASC",
                    (la_id,)
                )
                for row2 in cursor.fetchall():
                    entry["items"].append({"fib_id": row2["fib_id"], "content": row2["content"]})

            elif activity_type == "Flashcards":
                cursor.execute(
                    f"SELECT flashcard_id, front_text, back_text FROM {FLASHCARDS_TABLE} WHERE la_id = %s ORDER BY flashcard_id ASC",
                    (la_id,)
                )
                for row2 in cursor.fetchall():
                    entry["items"].append({
                        "flashcard_id": row2["flashcard_id"],
                        "front": row2["front_text"],
                        "back": row2["back_text"],
                    })

            results.append(entry)

        cursor.close()
        return results
    except Error as e:
        print(f"lesson_activities: failed to load activities for resource_id={resource_id}: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


def check_mcq_answer(q_id, selected_option_id):
    """
    Looks up the real correct option for `q_id` and compares it against
    `selected_option_id` (an mcq_options_tbl.option_id the learner
    picked) - entirely server-side, so the correct answer is never sent
    to the browser before this point.

    Returns (is_correct: bool, feedback: str, correct_option_id: int | None)
    """
    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT option_id, is_correct, feedback FROM {MCQ_OPTIONS_TABLE} WHERE q_id = %s",
            (q_id,)
        )
        options = cursor.fetchall()
        cursor.close()

        correct_option = next((o for o in options if o["is_correct"]), None)
        selected = next((o for o in options if o["option_id"] == selected_option_id), None)

        is_correct = bool(selected and correct_option and selected["option_id"] == correct_option["option_id"])
        feedback = (selected.get("feedback") if selected else "") or ""
        correct_id = correct_option["option_id"] if correct_option else None

        return is_correct, feedback, correct_id
    except Error as e:
        print(f"lesson_activities: failed to check MCQ answer for q_id={q_id}: {e}")
        return False, "Could not check this answer.", None
    finally:
        if connection.is_connected():
            connection.close()


def check_fill_blank_answer(fib_id, submitted_answer):
    """
    Looks up the real correct_answer for `fib_id` and compares it
    against `submitted_answer`, case-insensitively with surrounding
    whitespace ignored.

    Returns (is_correct: bool, feedback: str, correct_answer: str | None)
    """
    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT correct_answer, correct_feedback, incorrect_feedback
                FROM {FILL_BLANKS_TABLE} WHERE fib_id = %s""",
            (fib_id,)
        )
        row = cursor.fetchone()
        cursor.close()

        if not row:
            return False, "This item could not be found.", None

        correct_answer = (row.get("correct_answer") or "").strip()
        submitted = (submitted_answer or "").strip()
        is_correct = bool(correct_answer) and submitted.lower() == correct_answer.lower()

        feedback = (row.get("correct_feedback") if is_correct else row.get("incorrect_feedback")) or ""
        return is_correct, feedback, correct_answer
    except Error as e:
        print(f"lesson_activities: failed to check fill-blank answer for fib_id={fib_id}: {e}")
        return False, "Could not check this answer.", None
    finally:
        if connection.is_connected():
            connection.close()


def check_flashcard_answer(acc_id, flashcard_id, submitted_answer):
    """
    Grades a flashcard attempt against flashcards_tbl.back_text and logs
    it as a new row in flashcard_learner_answers_tbl (append-only, never
    updated in place - attempt_number increments per (acc_id,
    flashcard_id) pair, matching the same convention as the other
    attempt-log tables).

    Grading: exact match on back_text (case-sensitive) = "correct";
    case-insensitive match only = "close" (half credit, decided by
    Cobra); anything else = "incorrect".

    Returns (status, feedback, correct_answer) on success, or None on
    any failure (flashcard not found, DB unreachable).
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT back_text, correct_feedback, incorrect_feedback
                FROM {FLASHCARDS_TABLE} WHERE flashcard_id = %s""",
            (flashcard_id,)
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return None

        back_text = (row.get("back_text") or "").strip()
        submitted = (submitted_answer or "").strip()

        if submitted and back_text and submitted == back_text:
            status = "correct"
        elif submitted and back_text and submitted.lower() == back_text.lower():
            status = "close"
        else:
            status = "incorrect"

        feedback = (row.get("correct_feedback") if status == "correct" else row.get("incorrect_feedback")) or ""

        cursor.execute(
            f"SELECT COUNT(*) AS cnt FROM {FLASHCARD_ANSWERS_TABLE} WHERE acc_id = %s AND flashcard_id = %s",
            (acc_id, flashcard_id)
        )
        attempt_number = cursor.fetchone()["cnt"] + 1

        cursor.execute(
            f"""INSERT INTO {FLASHCARD_ANSWERS_TABLE}
                (acc_id, flashcard_id, answer_given, attempt_number, status, source, recommendation_id, feedback_given, answered_at)
                VALUES (%s, %s, %s, %s, %s, 'self', NULL, %s, NOW())""",
            (acc_id, flashcard_id, submitted, attempt_number, status, feedback)
        )
        connection.commit()
        cursor.close()
        return status, feedback, back_text
    except Error as e:
        connection.rollback()
        print(f"lesson_activities: failed to check flashcard answer for flashcard_id={flashcard_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def record_activity_progress(acc_id, la_id, status, score=None):
    """
    Writes/updates this learner's row in learner_activity_progress_tbl
    for a given activity (la_id). `status` is "in_progress" or
    "completed", matching learner_resource_progress_tbl's own
    vocabulary. `score` defaults to 0 (never None) since the column is
    NOT NULL. completed_at is only ever set on the "completed" path -
    omitted entirely otherwise, matching the same convention already
    used by learner_resource_progress_tbl's own INSERT in
    learner_routes.py.

    Best-effort: returns True/False, never raises.
    """
    score_val = score if score is not None else 0

    connection = get_db_connection()
    if connection is None:
        return False

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT progress_id FROM {PROGRESS_TABLE} WHERE acc_id = %s AND la_id = %s",
            (acc_id, la_id)
        )
        existing = cursor.fetchone()

        if existing:
            if status == "completed":
                cursor.execute(
                    f"""UPDATE {PROGRESS_TABLE}
                        SET status = %s, score = %s, completed_at = NOW()
                        WHERE progress_id = %s""",
                    (status, score_val, existing["progress_id"])
                )
            else:
                cursor.execute(
                    f"""UPDATE {PROGRESS_TABLE}
                        SET status = %s, score = %s
                        WHERE progress_id = %s""",
                    (status, score_val, existing["progress_id"])
                )
        else:
            if status == "completed":
                cursor.execute(
                    f"""INSERT INTO {PROGRESS_TABLE} (acc_id, la_id, status, score, completed_at)
                        VALUES (%s, %s, %s, %s, NOW())""",
                    (acc_id, la_id, status, score_val)
                )
            else:
                cursor.execute(
                    f"""INSERT INTO {PROGRESS_TABLE} (acc_id, la_id, status, score)
                        VALUES (%s, %s, %s, %s)""",
                    (acc_id, la_id, status, score_val)
                )

        connection.commit()
        cursor.close()
        return True
    except Error as e:
        connection.rollback()
        print(f"lesson_activities: failed to record activity progress for la_id={la_id}: {e}")
        return False
    finally:
        if connection.is_connected():
            connection.close()


def get_activities_completion_summary(acc_id, resource_id):
    """
    Returns (total_activities, completed_activities) for every Published
    activity attached to resource_id, for this learner. Used to gate
    lesson completion - a lesson with zero activities returns (0, 0)
    and is treated as "nothing to gate on" by the caller.
    """
    if not resource_id:
        return 0, 0
    connection = get_db_connection()
    if connection is None:
        return 0, 0
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT la.la_id
                FROM {LEARNING_ACTIVITIES_TABLE} la
                JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
                WHERE la.resource_id = %s AND las.la_stats_name = 'Published'""",
            (resource_id,)
        )
        la_ids = [r["la_id"] for r in cursor.fetchall()]
        total = len(la_ids)
        if total == 0:
            cursor.close()
            return 0, 0

        placeholders = ",".join(["%s"] * total)
        cursor.execute(
            f"""SELECT COUNT(*) AS done FROM {PROGRESS_TABLE}
                WHERE acc_id = %s AND la_id IN ({placeholders}) AND status = 'completed'""",
            tuple([acc_id] + la_ids)
        )
        completed = cursor.fetchone()["done"]
        cursor.close()
        return total, completed
    except Error as e:
        print(f"lesson_activities: failed to get completion summary: {e}")
        return 0, 0
    finally:
        if connection.is_connected():
            connection.close()