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

from datetime import timedelta
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
MCQ_ANSWERS_TABLE = "mcq_learner_answers_tbl"

# Quiz reuses mcq_questions_tbl / mcq_options_tbl for its content and
# learner_activity_progress_tbl for its progress - no quiz-only tables.
QUIZ_TYPE_NAME = "Quiz"
QUIZ_MAX_LIVES = 3
QUIZ_REGEN_SECONDS = 300  # +1 life every 5 minutes, up to QUIZ_MAX_LIVES
_quiz_schema_ensured = False


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
        ensure_quiz_schema(connection)
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

            # Quiz shares the MCQ tables and item shape - the learner page
            # just renders it as the cobra arena instead of a list.
            if activity_type in ("Multiple Choice", QUIZ_TYPE_NAME):
                cursor.execute(
                    f"SELECT q_id, question_text FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s ORDER BY sort_order ASC, q_id ASC",
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


# ============================================================
# QUIZ (cobra arena) - lives, position and grading, all server-side
# ------------------------------------------------------------
# The browser only ever knows the question text and option ids. The
# current question, remaining lives and the 5-minute regeneration
# clock live on the learner's learner_activity_progress_tbl row, so a
# page refresh can never restore lives or skip a question. Every
# answer is appended to mcq_learner_answers_tbl (never overwritten).
# ============================================================
def ensure_quiz_schema(connection):
    """
    Lazily adds the columns the Quiz needs (idempotent, once per
    process):
      - mcq_questions_tbl.sort_order      question order within a quiz
      - learner_activity_progress_tbl.lives / current_q_index /
        lives_regen_at                    the learner's run state
      - learner_activity_progress_tbl.completed_at -> NULLable, so an
        in-progress quiz row can exist before it is completed.

    ALTER TABLE commits implicitly, so callers must run this BEFORE they
    write anything on `connection`.
    """
    global _quiz_schema_ensured
    if _quiz_schema_ensured:
        return True
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {MCQ_QUESTIONS_TABLE} ADD COLUMN IF NOT EXISTS sort_order INT(5) NOT NULL DEFAULT 0"
        )
        cursor.execute(
            f"ALTER TABLE {PROGRESS_TABLE} ADD COLUMN IF NOT EXISTS lives TINYINT(1) DEFAULT NULL"
        )
        cursor.execute(
            f"ALTER TABLE {PROGRESS_TABLE} ADD COLUMN IF NOT EXISTS current_q_index INT(5) DEFAULT NULL"
        )
        cursor.execute(
            f"ALTER TABLE {PROGRESS_TABLE} ADD COLUMN IF NOT EXISTS lives_regen_at DATETIME DEFAULT NULL"
        )
        cursor.execute(f"SHOW COLUMNS FROM {PROGRESS_TABLE} LIKE 'completed_at'")
        col = cursor.fetchone()
        if col and col[2] == "NO":
            cursor.execute(
                f"ALTER TABLE {PROGRESS_TABLE} MODIFY completed_at DATETIME NULL DEFAULT NULL"
            )
        cursor.close()
        _quiz_schema_ensured = True
        return True
    except Error as e:
        print(f"lesson_activities: failed to ensure quiz schema: {e}")
        return False


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _quiz_state(lives, index, total, correct, seconds_left, completed):
    """The only quiz state the browser ever receives."""
    return {
        "lives": lives,
        "max_lives": QUIZ_MAX_LIVES,
        "regen_seconds": QUIZ_REGEN_SECONDS,
        "seconds_to_next_life": seconds_left if lives < QUIZ_MAX_LIVES else 0,
        "current_index": index,
        "total": total,
        "correct_count": correct,
        "completed": completed,
    }


def _apply_quiz_regen(row):
    """
    +1 life per QUIZ_REGEN_SECONDS since lives_regen_at, capped at
    QUIZ_MAX_LIVES - keeps counting while the learner is away. Uses the
    database clock (row["db_now"]) so server/DB timezone drift can't
    shorten or stretch the wait.

    Returns (lives, regen_at, seconds_until_next_life).
    """
    lives = row["lives"] if row["lives"] is not None else QUIZ_MAX_LIVES
    regen_at = row["lives_regen_at"]
    now = row["db_now"]

    if lives >= QUIZ_MAX_LIVES:
        return QUIZ_MAX_LIVES, None, 0
    if regen_at is None:
        regen_at = now

    elapsed = max(0, int((now - regen_at).total_seconds()))
    gained = elapsed // QUIZ_REGEN_SECONDS
    if gained:
        lives = min(QUIZ_MAX_LIVES, lives + gained)
        regen_at = regen_at + timedelta(seconds=gained * QUIZ_REGEN_SECONDS)

    if lives >= QUIZ_MAX_LIVES:
        return QUIZ_MAX_LIVES, None, 0

    seconds_left = QUIZ_REGEN_SECONDS - max(0, int((now - regen_at).total_seconds()))
    return lives, regen_at, max(1, seconds_left)


def _quiz_correct_count(cursor, acc_id, la_id):
    """Questions whose LATEST attempt is correct (latest attempt = progression truth)."""
    cursor.execute(
        f"""SELECT COUNT(*) AS cnt
            FROM {MCQ_ANSWERS_TABLE} a
            JOIN {MCQ_QUESTIONS_TABLE} q ON a.q_id = q.q_id
            WHERE a.acc_id = %s AND q.la_id = %s AND a.status = 'correct'
              AND a.attempt_number = (
                  SELECT MAX(a2.attempt_number) FROM {MCQ_ANSWERS_TABLE} a2
                  WHERE a2.acc_id = a.acc_id AND a2.q_id = a.q_id
              )""",
        (acc_id, la_id)
    )
    return cursor.fetchone()["cnt"]


def _load_quiz_row(cursor, acc_id, la_id):
    """Locks (FOR UPDATE) - creating if needed - this learner's progress row for the quiz."""
    select_sql = f"""SELECT progress_id, status, score, lives, current_q_index,
                            lives_regen_at, NOW() AS db_now
                     FROM {PROGRESS_TABLE}
                     WHERE acc_id = %s AND la_id = %s
                     ORDER BY progress_id ASC LIMIT 1 FOR UPDATE"""
    cursor.execute(select_sql, (acc_id, la_id))
    row = cursor.fetchone()
    if row is None:
        cursor.execute(
            f"""INSERT INTO {PROGRESS_TABLE} (acc_id, la_id, status, score, lives, current_q_index)
                VALUES (%s, %s, 'in_progress', 0, %s, 0)""",
            (acc_id, la_id, QUIZ_MAX_LIVES)
        )
        cursor.execute(select_sql, (acc_id, la_id))
        row = cursor.fetchone()
    return row


def _save_quiz_row(cursor, progress_id, status, score, lives, index, regen_at):
    completed_sql = ", completed_at = NOW()" if status == "completed" else ""
    cursor.execute(
        f"""UPDATE {PROGRESS_TABLE}
            SET status = %s, score = %s, lives = %s, current_q_index = %s,
                lives_regen_at = %s{completed_sql}
            WHERE progress_id = %s""",
        (status, score, lives, index, regen_at, progress_id)
    )


def _open_quiz(cursor, acc_id, la_id):
    """
    Shared opening for every quiz call: confirms la_id is a Published
    Quiz, loads its ordered question ids, locks the learner's row and
    applies life regeneration. Returns None if it isn't a Published Quiz.
    """
    cursor.execute(
        f"""SELECT 1 FROM {LEARNING_ACTIVITIES_TABLE} la
            JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
            JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
            WHERE la.la_id = %s AND las.la_stats_name = 'Published'
              AND atp.activity_type_name = %s""",
        (la_id, QUIZ_TYPE_NAME)
    )
    if cursor.fetchone() is None:
        return None

    cursor.execute(
        f"SELECT q_id FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s ORDER BY sort_order ASC, q_id ASC",
        (la_id,)
    )
    q_ids = [r["q_id"] for r in cursor.fetchall()]

    row = _load_quiz_row(cursor, acc_id, la_id)
    lives, regen_at, seconds_left = _apply_quiz_regen(row)
    return {
        "q_ids": q_ids,
        "row": row,
        "lives": lives,
        "regen_at": regen_at,
        "seconds_left": seconds_left,
        "index": row["current_q_index"] if row["current_q_index"] is not None else 0,
        "completed": row["status"] == "completed",
    }


def get_quiz_state(acc_id, la_id):
    """
    Current quiz state for this learner (see _quiz_state()), with life
    regeneration applied and saved. Returns None if la_id isn't a
    Published Quiz or on any database error.
    """
    la_id = _to_int(la_id)
    if not la_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        ensure_quiz_schema(connection)
        cursor = connection.cursor(dictionary=True)
        quiz = _open_quiz(cursor, acc_id, la_id)
        if quiz is None:
            connection.rollback()
            cursor.close()
            return None

        total = len(quiz["q_ids"])
        index = quiz["index"]
        completed = quiz["completed"]
        correct = _quiz_correct_count(cursor, acc_id, la_id)

        if not completed:
            # If questions were removed after this learner started and
            # they're already past the end, the quiz is finished.
            if total and index >= total:
                completed = True
            _save_quiz_row(
                cursor, quiz["row"]["progress_id"],
                "completed" if completed else "in_progress",
                correct, quiz["lives"], index, quiz["regen_at"]
            )

        connection.commit()
        cursor.close()
        return _quiz_state(quiz["lives"], index, total, correct, quiz["seconds_left"], completed)
    except Error as e:
        connection.rollback()
        print(f"lesson_activities: failed to load quiz state for la_id={la_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def submit_quiz_answer(acc_id, la_id, q_id, option_id):
    """
    Grades the pellet the cobra ate. Appends the attempt to
    mcq_learner_answers_tbl, costs a life when wrong (starting the regen
    clock if it wasn't running), and ALWAYS moves to the next question -
    a wrong answer stands. Completing the last question marks the
    activity completed with score = correct count.

    Returns (payload, error_message). payload["graded"] is False when
    nothing was graded - out of lives, already completed, or the browser
    is on a different question than the server - and payload["state"]
    tells the browser where it really is.
    """
    la_id, q_id, option_id = _to_int(la_id), _to_int(q_id), _to_int(option_id)
    if not la_id or not q_id or not option_id:
        return None, "A quiz answer needs la_id, q_id and option_id."

    connection = get_db_connection()
    if connection is None:
        return None, "Could not connect to the database."

    try:
        ensure_quiz_schema(connection)
        cursor = connection.cursor(dictionary=True)
        quiz = _open_quiz(cursor, acc_id, la_id)
        if quiz is None:
            connection.rollback()
            cursor.close()
            return None, "This quiz is not available."

        q_ids = quiz["q_ids"]
        total = len(q_ids)
        row = quiz["row"]
        lives, regen_at, seconds_left = quiz["lives"], quiz["regen_at"], quiz["seconds_left"]
        index = quiz["index"]

        if quiz["completed"] or lives <= 0 or index >= total or q_ids[index] != q_id:
            correct = _quiz_correct_count(cursor, acc_id, la_id)
            if not quiz["completed"]:
                _save_quiz_row(cursor, row["progress_id"], "in_progress", correct, lives, index, regen_at)
            connection.commit()
            cursor.close()
            state = _quiz_state(lives, index, total, correct, seconds_left, quiz["completed"])
            return {"graded": False, "state": state}, None

        cursor.execute(
            f"SELECT option_id, is_correct, feedback FROM {MCQ_OPTIONS_TABLE} WHERE q_id = %s",
            (q_id,)
        )
        options = cursor.fetchall()
        selected = next((o for o in options if o["option_id"] == option_id), None)
        if selected is None:
            connection.rollback()
            cursor.close()
            return None, "That answer does not belong to this question."

        correct_option = next((o for o in options if o["is_correct"]), None)
        is_correct = bool(correct_option and correct_option["option_id"] == option_id)
        feedback = selected.get("feedback") or ""

        cursor.execute(
            f"SELECT COUNT(*) AS cnt FROM {MCQ_ANSWERS_TABLE} WHERE acc_id = %s AND q_id = %s",
            (acc_id, q_id)
        )
        attempt_number = cursor.fetchone()["cnt"] + 1
        cursor.execute(
            f"""INSERT INTO {MCQ_ANSWERS_TABLE}
                (acc_id, q_id, option_id, attempt_number, status, source,
                 recommendation_id, feedback_given, answered_at)
                VALUES (%s, %s, %s, %s, %s, 'self', NULL, %s, NOW())""",
            (acc_id, q_id, option_id, attempt_number,
             "correct" if is_correct else "incorrect", feedback)
        )

        if not is_correct:
            lives -= 1
            if regen_at is None:
                regen_at = row["db_now"]
                seconds_left = QUIZ_REGEN_SECONDS

        index += 1
        correct = _quiz_correct_count(cursor, acc_id, la_id)
        completed = index >= total
        _save_quiz_row(
            cursor, row["progress_id"],
            "completed" if completed else "in_progress",
            correct, lives, index, regen_at
        )
        connection.commit()
        cursor.close()

        return {
            "graded": True,
            "is_correct": is_correct,
            "feedback": feedback,
            "correct_option_id": correct_option["option_id"] if correct_option else None,
            "state": _quiz_state(lives, index, total, correct, seconds_left, completed),
        }, None
    except Error as e:
        connection.rollback()
        print(f"lesson_activities: failed to grade quiz answer la_id={la_id} q_id={q_id}: {e}")
        return None, "Could not check this answer."
    finally:
        if connection.is_connected():
            connection.close()


def lose_quiz_life(acc_id, la_id):
    """
    Wall hit / self-bite in the arena: costs one life (never below 0)
    without logging an answer or changing the current question.
    Returns the updated state, or None if unavailable.
    """
    la_id = _to_int(la_id)
    if not la_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        ensure_quiz_schema(connection)
        cursor = connection.cursor(dictionary=True)
        quiz = _open_quiz(cursor, acc_id, la_id)
        if quiz is None:
            connection.rollback()
            cursor.close()
            return None

        total = len(quiz["q_ids"])
        lives, regen_at, seconds_left = quiz["lives"], quiz["regen_at"], quiz["seconds_left"]
        index = quiz["index"]
        completed = quiz["completed"]
        correct = _quiz_correct_count(cursor, acc_id, la_id)

        if not completed:
            if lives > 0:
                lives -= 1
                if regen_at is None:
                    regen_at = quiz["row"]["db_now"]
                    seconds_left = QUIZ_REGEN_SECONDS
            _save_quiz_row(cursor, quiz["row"]["progress_id"], "in_progress", correct, lives, index, regen_at)

        connection.commit()
        cursor.close()
        return _quiz_state(lives, index, total, correct, seconds_left, completed)
    except Error as e:
        connection.rollback()
        print(f"lesson_activities: failed to take a quiz life for la_id={la_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()
