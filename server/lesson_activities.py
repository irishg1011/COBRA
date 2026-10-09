"""
lesson_activities.py - Learner-Side Activities Data Access & Answer Checking
------------------------------------------------------------------------------
Pure DB-access helpers backing the learner-facing "Proceed to Activities"
gate on lesson-content.html. Mirrors learning_activity_content.py's table
routing (mcq_questions_tbl/mcq_options_tbl, fill_blanks_tbl,
flashcards_tbl) but is READ-ONLY from the learner's point of view for
question content, and NEVER returns the correct answer to the client -
answer checking happens entirely server-side.

Multiple Choice (activity_type_id = 1) is played as the cobra arena.
Its grading, lives, current question and pause/resume state all live
server-side (see the MULTIPLE CHOICE ARENA section at the bottom), so a
refresh can never restore lives or skip a question. check_mcq_answer()
stays as the stateless checker used by the admin Publishing Preview.

This file never touches Flask/session state directly - learner_routes.py
is the only place these get turned into HTTP responses, matching the
project's existing convention (learning_activities.py, resource_draft.py,
etc.).
"""

from datetime import timedelta
from mysql.connector import Error
from notifications import notify_lives_refilled, notify_out_of_lives  # header bell
from cobradb import get_db_connection
from activity_retakes import (  # Module 85% gate: retake rounds
    ensure_retake_schema, open_retake, retake_progress, complete_retake, retake_payload,
)
from learner_shuffle import learner_order, order_rows, shuffle_options, activity_scope  # feat/learner-shuffle

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
MCQ_QUESTIONS_TABLE = "mcq_questions_tbl"
MCQ_OPTIONS_TABLE = "mcq_options_tbl"
FILL_BLANKS_TABLE = "fill_blanks_tbl"
FLASHCARDS_TABLE = "flashcards_tbl"
FLASHCARD_ANSWERS_TABLE = "flashcard_learner_answers_tbl"
PROGRESS_TABLE = "learner_activity_progress_tbl"
MCQ_ANSWERS_TABLE = "mcq_learner_answers_tbl"

ACTIVITY_TYPES_TABLE = "activity_types_tbl"
ACCOUNT_TABLE = "account_tbl"
RECOMMENDATIONS_TABLE = "lesson_recommendations_tbl"

# Lives pool: one row per (learner, activity type), shared by every
# lesson's activity of that type - e.g. 1 life left for Multiple Choice
# applies to every Multiple Choice activity in every lesson. Fill in the
# Blanks and Flashcards get their own pools here once their game
# versions are built (same table, their own activity_type_id).
#
#   lives          regular lives, 0..MAX_LIVES (5). All of them come back
#                  at once LIFE_REFILL_SECONDS (10 min) after the first
#                  one was lost.
#   bonus_lives    0..MAX_BONUS_LIVES (5), handed out every day at 8:00 AM
#                  Philippine time (with a full regular refill), so a day
#                  starts at 10. A separate RESERVE (feat/lives-5v5): used only once
#                  the regular lives are at 0; never refilled by the 10-minute timer.
#
# Every lives timestamp is Philippine time (UTC+8), taken from the
# database's UTC clock, so neither the server's nor MySQL's timezone
# setting can move the 8 AM reset or the refill timer.
LIVES_TABLE = "learner_lives_tbl"
MAX_LIVES = 5
MAX_BONUS_LIVES = 5
LIFE_REFILL_SECONDS = 600   # all regular lives back 10 minutes after the first one is lost
DAILY_RESET_HOUR = 8        # 8:00 AM Philippine time
PH_NOW_SQL = "(UTC_TIMESTAMP() + INTERVAL 8 HOUR)"

# One row per Multiple Choice play (start -> pause/resume -> completed).
MCQ_SESSIONS_TABLE = "mcq_activity_sessions_tbl"
MCQ_TYPE_NAME = "Multiple Choice"

_game_schema_ensured = False


def get_chapter_terrain(cursor, resource_id):
    """
    "land" or "water" for the chapter this lesson belongs to, matching
    where the chapter sits on the Learning Map: chapters alternate
    left (land) / right (water) in the same order /api/learning-map
    lists them (non-archived categories by display_order, then cat_id).
    Falls back to "land" if anything can't be found.
    """
    cursor.execute("SELECT cat_id FROM learning_resources_tbl WHERE resource_id = %s", (resource_id,))
    row = cursor.fetchone()
    if not row:
        return "land"
    cursor.execute(
        "SELECT cat_id FROM category_tbl WHERE is_archived = 0 "
        "ORDER BY COALESCE(display_order, 999999) ASC, cat_id ASC"
    )
    order = [r["cat_id"] for r in cursor.fetchall()]
    if row["cat_id"] not in order:
        return "land"
    return "land" if order.index(row["cat_id"]) % 2 == 0 else "water"


def get_published_activities_for_resource(resource_id, acc_id=None):
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
        ensure_activity_game_schema(connection)
        cursor = connection.cursor(dictionary=True)
        # Ordered by type so every lesson runs Multiple Choice first,
        # then Fill in the Blanks, then Flashcards.
        cursor.execute(
            f"""SELECT la.la_id, la.activity_title, la.points, la.activity_type_id, atp.activity_type_name
                FROM {LEARNING_ACTIVITIES_TABLE} la
                JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
                LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
                WHERE la.resource_id = %s AND las.la_stats_name = 'Published'
                ORDER BY la.activity_type_id ASC, la.la_id ASC""",
            (resource_id,)
        )
        activity_rows = cursor.fetchall()
        terrain = get_chapter_terrain(cursor, resource_id) if activity_rows else "land"

        results = []
        for row in activity_rows:
            la_id = row["la_id"]
            activity_type = row.get("activity_type_name") or ""
            entry = {
                "la_id": la_id,
                "activity_title": row["activity_title"],
                "activity_type": activity_type,
                "activity_type_id": row.get("activity_type_id"),
                "terrain": terrain,     # "land" forest / "water" ship scenery for the games
                "points": row.get("points") or 0,
                "items": [],
            }

            # Multiple Choice is rendered as the cobra arena on the learner
            # page - options go out WITHOUT is_correct/feedback.
            if acc_id:
                # feat/question-pool-draw: a learner never gets the pool. Each
                # play's drawn questions come with the game's own state, one
                # at a time as they are revealed (game_plays.py).
                entry["pool_size"] = _pool_size(cursor, activity_type, la_id)
            elif activity_type == MCQ_TYPE_NAME:
                cursor.execute(
                    f"SELECT q_id, question_text FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s AND is_removed = 0 ORDER BY sort_order ASC, q_id ASC",
                    (la_id,)
                )
                # feat/learner-shuffle: with acc_id (the learner's lesson page) the
                # questions come in THAT learner's order - the same order the
                # arena's server side uses (_open_mcq) - and each question's
                # choices are shuffled and re-lettered for them. Without acc_id
                # (staff preview) everything stays in the order it was written.
                questions = order_rows(acc_id, activity_scope(la_id), cursor.fetchall(), "q_id")
                for q in questions:
                    cursor.execute(
                        f"""SELECT option_id, option_letter, option_text
                            FROM {MCQ_OPTIONS_TABLE} WHERE q_id = %s AND is_removed = 0 ORDER BY option_letter ASC""",
                        (q["q_id"],)
                    )
                    options = shuffle_options(acc_id, q["q_id"], cursor.fetchall())
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
                    f"SELECT fib_id, content FROM {FILL_BLANKS_TABLE} WHERE la_id = %s AND is_removed = 0 ORDER BY fib_id ASC",
                    (la_id,)
                )
                for row2 in order_rows(acc_id, activity_scope(la_id), cursor.fetchall(), "fib_id"):
                    entry["items"].append({"fib_id": row2["fib_id"], "content": row2["content"]})

            elif activity_type == "Flashcards":
                cursor.execute(
                    f"SELECT flashcard_id, front_text, back_text FROM {FLASHCARDS_TABLE} WHERE la_id = %s AND is_removed = 0 ORDER BY flashcard_id ASC",
                    (la_id,)
                )
                for row2 in order_rows(acc_id, activity_scope(la_id), cursor.fetchall(), "flashcard_id"):
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


def _pool_size(cursor, activity_type, la_id):
    table = {MCQ_TYPE_NAME: MCQ_QUESTIONS_TABLE, "Fill in the Blanks": FILL_BLANKS_TABLE,
             "Flashcards": FLASHCARDS_TABLE}.get(activity_type)
    if not table:
        return 0
    cursor.execute(f"SELECT COUNT(*) AS cnt FROM {table} WHERE la_id = %s AND is_removed = 0", (la_id,))
    return cursor.fetchone()["cnt"]


def check_mcq_answer(q_id, selected_option_id):
    """
    Looks up the real correct option for `q_id` and compares it against
    `selected_option_id` (an mcq_options_tbl.option_id the learner
    picked) - entirely server-side, so the correct answer is never sent
    to the browser before this point. Stateless (records nothing) - used
    by the admin Publishing Preview. Learners go through
    submit_mcq_answer() instead.

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


def settle_lesson_activities(acc_id, resource_id):
    """
    Lesson-completion check used by /api/lesson-content/complete.

    1. Any Published activity in this lesson that has NO items (0 MCQ
       questions / FIB items / flashcards, or a type with no game) is
       marked completed for this learner with score 0. The games skip
       an empty activity straight away without saving anything, which
       used to leave the lesson impossible to complete.
    2. Returns the titles of the Published activities this learner
       still hasn't completed ([] = all done), or None on a DB error.
    """
    if not resource_id:
        return []
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT la.la_id, la.activity_title, atp.activity_type_name,
                       (SELECT COUNT(*) FROM {MCQ_QUESTIONS_TABLE} q WHERE q.la_id = la.la_id AND q.is_removed = 0) AS mcq_n,
                       (SELECT COUNT(*) FROM {FILL_BLANKS_TABLE} f WHERE f.la_id = la.la_id AND f.is_removed = 0) AS fib_n,
                       (SELECT COUNT(*) FROM {FLASHCARDS_TABLE} c WHERE c.la_id = la.la_id AND c.is_removed = 0) AS fc_n,
                       EXISTS(SELECT 1 FROM {PROGRESS_TABLE} p
                              WHERE p.acc_id = %s AND p.la_id = la.la_id
                                AND p.status = 'completed') AS is_done
                FROM {LEARNING_ACTIVITIES_TABLE} la
                JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
                LEFT JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
                WHERE la.resource_id = %s AND las.la_stats_name = 'Published'
                ORDER BY la.la_id ASC""",
            (acc_id, resource_id)
        )
        rows = cursor.fetchall()

        unfinished = []
        for row in rows:
            if row["is_done"]:
                continue
            type_name = row.get("activity_type_name") or ""
            if type_name in ("Multiple Choice", "Quiz"):
                item_total = row["mcq_n"]
            elif type_name == "Fill in the Blanks":
                item_total = row["fib_n"]
            elif type_name == "Flashcards":
                item_total = row["fc_n"]
            else:
                item_total = 0

            if item_total > 0:
                unfinished.append(row["activity_title"])
                continue

            # Empty activity - nothing to play, so it counts as done.
            cursor.execute(
                f"SELECT progress_id FROM {PROGRESS_TABLE} WHERE acc_id = %s AND la_id = %s ORDER BY progress_id ASC LIMIT 1",
                (acc_id, row["la_id"])
            )
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    f"""UPDATE {PROGRESS_TABLE}
                        SET status = 'completed', score = 0, completed_at = NOW()
                        WHERE progress_id = %s""",
                    (existing["progress_id"],)
                )
            else:
                cursor.execute(
                    f"""INSERT INTO {PROGRESS_TABLE} (acc_id, la_id, status, score, completed_at)
                        VALUES (%s, %s, 'completed', 0, NOW())""",
                    (acc_id, row["la_id"])
                )

        connection.commit()
        cursor.close()
        return unfinished
    except Error as e:
        connection.rollback()
        print(f"lesson_activities: failed to settle lesson activities for resource_id={resource_id}: {e}")
        return None
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


def get_activity_type_name(la_id):
    """activity_types_tbl name for la_id ("Multiple Choice", ...), or None."""
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT atp.activity_type_name
                FROM {LEARNING_ACTIVITIES_TABLE} la
                JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
                WHERE la.la_id = %s""",
            (la_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        return row["activity_type_name"] if row else None
    except Error as e:
        print(f"lesson_activities: failed to read activity type for la_id={la_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# MULTIPLE CHOICE ARENA - lives, position, pause/resume, grading
# ------------------------------------------------------------
# Multiple Choice (activity_type_id = 1) is played as the cobra arena.
# The browser only ever knows question text, option letters/text and
# option ids - never which option is correct.
#
#   mcq_questions_tbl / mcq_options_tbl   question + option source
#   mcq_learner_answers_tbl               every eaten pellet, append-only
#                                         (attempt_number 1 = first attempt,
#                                         used by recommendations)
#   learner_lives_tbl                     lives pool per learner per type
#   mcq_activity_sessions_tbl             one row per play: current
#                                         question, paused/resumed/completed
#   learner_activity_progress_tbl         written ONLY on completion
#                                         (status + first-attempt score)
#
# Rules (feat/question-pool-draw .. feat/leave-detection): see
# game_plays.py - each play draws 5 unseen questions, one attempt per
# question (wrong / skip / time out / leaving = -1 life, then the next
# question), 0 lives pauses the play before the next question is
# revealed, resuming continues the SAME play.
# ============================================================
def ensure_activity_game_schema(connection):
    """
    Lazily creates what the Multiple Choice arena needs (idempotent,
    once per process):
      - mcq_questions_tbl.sort_order   question order within an activity
      - learner_lives_tbl              lives pool per (acc_id, activity_type_id)
                                       (+ bonus_lives / daily_reset_at columns)
      - mcq_activity_sessions_tbl      one row per Multiple Choice play

    CREATE/ALTER TABLE commit implicitly, so callers must run this
    BEFORE they write anything on `connection`.
    """
    global _game_schema_ensured
    # Module 85% gate: activity_retakes_tbl + answers.retake_id (own once-flag).
    ensure_retake_schema(connection)
    if _game_schema_ensured:
        return True
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {MCQ_QUESTIONS_TABLE} ADD COLUMN IF NOT EXISTS sort_order INT(5) NOT NULL DEFAULT 0"
        )
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {LIVES_TABLE} (
                    lives_id INT(10) NOT NULL AUTO_INCREMENT,
                    acc_id VARCHAR(15) NOT NULL,
                    activity_type_id INT(10) NOT NULL,
                    lives TINYINT(2) NOT NULL DEFAULT {MAX_LIVES},
                    lives_regen_at DATETIME DEFAULT NULL,
                    updated_at DATETIME DEFAULT NULL,
                    PRIMARY KEY (lives_id),
                    UNIQUE KEY uq_lives_acc_type (acc_id, activity_type_id),
                    KEY fk_lives_activity_type_id (activity_type_id),
                    CONSTRAINT fk_lives_account_id FOREIGN KEY (acc_id)
                        REFERENCES {ACCOUNT_TABLE} (acc_id),
                    CONSTRAINT fk_lives_activity_type_id FOREIGN KEY (activity_type_id)
                        REFERENCES {ACTIVITY_TYPES_TABLE} (activity_type_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        # 5 regular + 5 daily bonus lives (tables created by the first build
        # only had `lives` with a default of 3).
        cursor.execute(
            f"ALTER TABLE {LIVES_TABLE} MODIFY lives TINYINT(2) NOT NULL DEFAULT {MAX_LIVES}"
        )
        cursor.execute(
            f"""ALTER TABLE {LIVES_TABLE}
                ADD COLUMN IF NOT EXISTS bonus_lives TINYINT(2) NOT NULL DEFAULT 0 AFTER lives"""
        )
        cursor.execute(
            f"""ALTER TABLE {LIVES_TABLE}
                ADD COLUMN IF NOT EXISTS daily_reset_at DATETIME DEFAULT NULL AFTER lives_regen_at"""
        )
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {MCQ_SESSIONS_TABLE} (
                    session_id INT(10) NOT NULL AUTO_INCREMENT,
                    acc_id VARCHAR(15) NOT NULL,
                    la_id INT(10) NOT NULL,
                    current_q_id INT(10) DEFAULT NULL,
                    score INT(5) NOT NULL DEFAULT 0,
                    status VARCHAR(20) NOT NULL,
                    started_at DATETIME NOT NULL,
                    paused_at DATETIME DEFAULT NULL,
                    resumed_at DATETIME DEFAULT NULL,
                    completed_at DATETIME DEFAULT NULL,
                    PRIMARY KEY (session_id),
                    KEY idx_mcqsess_acc_la (acc_id, la_id),
                    KEY fk_mcqsess_la_id (la_id),
                    CONSTRAINT fk_mcqsess_account_id FOREIGN KEY (acc_id)
                        REFERENCES {ACCOUNT_TABLE} (acc_id),
                    CONSTRAINT fk_mcqsess_la_id FOREIGN KEY (la_id)
                        REFERENCES {LEARNING_ACTIVITIES_TABLE} (la_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        cursor.close()
        _game_schema_ensured = True
        return True
    except Error as e:
        print(f"lesson_activities: failed to ensure activity game schema: {e}")
        return False


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ---------------- lives pool (shared helpers - reusable by FIB/Flashcards) ----------------
def _daily_boundary(now):
    """The most recent 8:00 AM (Philippine time) at or before `now`."""
    boundary = now.replace(hour=DAILY_RESET_HOUR, minute=0, second=0, microsecond=0)
    if now < boundary:
        boundary -= timedelta(days=1)
    return boundary


def _load_lives(cursor, acc_id, activity_type_id):
    """
    Locks (FOR UPDATE) - creating it if needed - this learner's lives row
    for one activity type, then applies, in order:
      1. the daily 8:00 AM reset: regular = 5, bonus = 5 (a row that has
         never been reset, including every row from before this change,
         gets it straight away)
      2. the 10-minute refill: regular lives back to 5 once
         LIFE_REFILL_SECONDS have passed since the first one was lost.
         Bonus lives are never refilled here.

    Returns {"lives_id", "lives", "bonus", "regen_at", "daily_reset_at", "db_now"}.
    """
    cursor.execute(
        f"""INSERT IGNORE INTO {LIVES_TABLE} (acc_id, activity_type_id, lives, bonus_lives, updated_at)
            VALUES (%s, %s, %s, 0, {PH_NOW_SQL})""",
        (acc_id, activity_type_id, MAX_LIVES)
    )
    cursor.execute(
        f"""SELECT lives_id, lives, bonus_lives, lives_regen_at, daily_reset_at,
                   {PH_NOW_SQL} AS db_now
            FROM {LIVES_TABLE}
            WHERE acc_id = %s AND activity_type_id = %s FOR UPDATE""",
        (acc_id, activity_type_id)
    )
    row = cursor.fetchone()
    now = row["db_now"]
    lives = min(MAX_LIVES, max(0, row["lives"] if row["lives"] is not None else MAX_LIVES))
    bonus = min(MAX_BONUS_LIVES, max(0, row["bonus_lives"] or 0))
    regen_at = row["lives_regen_at"]
    daily_reset_at = row["daily_reset_at"]

    boundary = _daily_boundary(now)
    if daily_reset_at is None or daily_reset_at < boundary:
        lives, bonus, regen_at, daily_reset_at = MAX_LIVES, MAX_BONUS_LIVES, None, boundary

    if lives >= MAX_LIVES:
        regen_at = None
    elif regen_at is None:
        regen_at = now          # shouldn't happen, but never leave a pool without a timer
    elif (now - regen_at).total_seconds() >= LIFE_REFILL_SECONDS:
        # header bell: "your lives are full again" at the real refill time
        # (deduped, so loading the pool again never repeats it)
        notify_lives_refilled(cursor, acc_id, activity_type_id, regen_at)
        lives, regen_at = MAX_LIVES, None

    return {
        "acc_id": acc_id,
        "activity_type_id": activity_type_id,
        "lives_id": row["lives_id"],
        "lives": lives,
        "bonus": bonus,
        "regen_at": regen_at,
        "daily_reset_at": daily_reset_at,
        "db_now": now,
    }


def _total_lives(pool):
    return pool["lives"] + pool["bonus"]


def _take_life(pool):
    """
    -1 life (feat/lives-5v5): the regular lives (max 5) go first; the daily
    bonus lives are a separate reserve, used only once the regular lives
    are at 0. Losing the first regular life starts the 10-minute full-refill
    timer (later losses don't restart it).
    """
    if pool["lives"] > 0:
        pool["lives"] -= 1
        if pool["regen_at"] is None:
            pool["regen_at"] = pool["db_now"]
        return
    if pool["bonus"] > 0:
        pool["bonus"] -= 1


def _save_lives(cursor, pool):
    cursor.execute(
        f"""UPDATE {LIVES_TABLE}
            SET lives = %s, bonus_lives = %s, lives_regen_at = %s,
                daily_reset_at = %s, updated_at = {PH_NOW_SQL}
            WHERE lives_id = %s""",
        (pool["lives"], pool["bonus"], pool["regen_at"], pool["daily_reset_at"], pool["lives_id"])
    )
    # header bell: "you're out of lives - back at 4:58 PM" (once per empty pool)
    if _total_lives(pool) == 0 and pool.get("acc_id"):
        notify_out_of_lives(cursor, pool["acc_id"], pool.get("activity_type_id"), pool["regen_at"])


def lives_payload(pool):
    """
    What any game's browser code gets about lives (feat/lives-5v5): the
    main bar shows the regular lives out of max_lives (never more than 5);
    the daily bonus is shown beside it as a separate reserve
    (reserve_lives). total_lives (regular + reserve) is what decides a pause.
    """
    now = pool["db_now"]
    refill_in = 0
    if pool["lives"] < MAX_LIVES and pool["regen_at"] is not None:
        refill_in = max(1, LIFE_REFILL_SECONDS - int((now - pool["regen_at"]).total_seconds()))
    next_reset = _daily_boundary(now) + timedelta(days=1)
    return {
        "lives": pool["lives"],
        "bonus_lives": pool["bonus"],
        "total_lives": _total_lives(pool),
        "reserve_lives": pool["bonus"],
        "max_lives": MAX_LIVES,
        "max_bonus_lives": MAX_BONUS_LIVES,
        "refill_seconds": LIFE_REFILL_SECONDS,
        "seconds_to_refill": refill_in,
        "seconds_to_daily_reset": max(1, int((next_reset - now).total_seconds())),
    }


# Public names for the other games (lesson_fill_blanks.py, later
# Flashcards) so every game shares one lives pool implementation.
load_lives_pool = _load_lives
take_life = _take_life
save_lives_pool = _save_lives
total_lives = _total_lives


# ---------------- Multiple Choice play ----------------
# feat/question-pool-draw: every rule of a play (draw of 5 unseen
# questions, one attempt, timer, leaving the page, retakes) lives in
# game_plays.py, shared by the three games. These keep the names the
# routes always used.
def get_mcq_activity_state(acc_id, la_id):
    """Current arena state (never creates a play). Returns (state, error)."""
    from game_plays import get_state
    return get_state(acc_id, la_id, MCQ_TYPE_NAME)


def play_mcq_activity(acc_id, la_id, boot=False):
    """Start-or-resume the ONE play and reveal its current question."""
    from game_plays import start_play
    return start_play(acc_id, la_id, MCQ_TYPE_NAME, boot=boot)


def submit_mcq_answer(acc_id, la_id, q_id, option_id, recommendation_id=None):
    """One attempt on the current question (see game_plays.submit_answer)."""
    from game_plays import submit_answer
    return submit_answer(acc_id, la_id, q_id, {"option_id": option_id, "recommendation_id": recommendation_id},
                         MCQ_TYPE_NAME)


def skip_mcq_question(acc_id, la_id, q_id, from_preview=True):
    """Skip always costs 1 life and is logged 'skipped' (no free skip any more)."""
    from game_plays import skip_item
    return skip_item(acc_id, la_id, q_id, MCQ_TYPE_NAME)


def lose_mcq_life(acc_id, la_id):
    """Wall hit / self-bite in the arena: -1 life, no answer logged."""
    from game_plays import lose_life
    return lose_life(acc_id, la_id, MCQ_TYPE_NAME)
