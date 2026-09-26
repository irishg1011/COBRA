"""
lesson_fill_blanks.py - Fill in the Blanks: Data Access, Lives & Grading
------------------------------------------------------------------------------
Everything the Fill in the Blanks activity needs on the server, kept in
one self-contained module so it never depends on (or changes) the
Multiple Choice cobra-arena code.

Learner rules (same shape as the MCQ arena):
  - Lives are a per-activity-type POOL shared across all lessons: this
    learner has one Fill in the Blanks pool (fib_learner_lives_tbl),
    max 3, +1 every 5 minutes (keeps counting while they are away).
  - Wrong answer: -1 life, logged, and the learner stays on the SAME
    item (Try Again). Correct answer: move to the next item.
  - At 0 lives the play pauses on its current item; the learner can go
    review the lesson and resumes the same play once a life is back.
  - The current item is derived from the answer log: the first item (in
    sort order) that has no correct attempt yet. No position column.
  - Saved score = first-attempt correct count (attempt_number = 1).
    Completed once every item has a correct attempt. No replay.
  - Every attempt is appended to fib_learner_answers_tbl.

Also shared with the admin builder (learning_activity_content.py):
  ensure_fib_schema(), parse_fib_choices(), compare_fib_answer().

This file never touches Flask/session state; learner_fib_routes.py turns
these into HTTP responses.
"""

import json
import random
import re
from datetime import timedelta
from mysql.connector import Error
from cobradb import get_db_connection

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
ACTIVITY_TYPES_TABLE = "activity_types_tbl"
FILL_BLANKS_TABLE = "fill_blanks_tbl"
FIB_ANSWERS_TABLE = "fib_learner_answers_tbl"
FIB_LIVES_TABLE = "fib_learner_lives_tbl"
PROGRESS_TABLE = "learner_activity_progress_tbl"

FIB_TYPE_NAME = "Fill in the Blanks"
FIB_MAX_LIVES = 3
FIB_REGEN_SECONDS = 1          # +1 life every 5 minutes, up to FIB_MAX_LIVES
FIB_MAX_WRONG_CHOICES = 7

CLOSE_FEEDBACK = "So close! Only the capitalization or spacing is off - Python is picky about those."
FALLBACK_CORRECT_FEEDBACK = "Nice work - that's exactly what the code needs."
FALLBACK_INCORRECT_FEEDBACK = "Not quite. Take another look at the code around the blank and try again."

_fib_schema_ensured = False


# ============================================================
# SCHEMA
# ============================================================
def ensure_fib_schema(connection):
    """
    Lazily adds what Fill in the Blanks needs (idempotent, once per
    process):
      - fill_blanks_tbl.instruction     optional task line above the code
      - fill_blanks_tbl.answer_choices  optional wrong choices (JSON array)
      - fill_blanks_tbl.sort_order      item order within the activity
      - fib_learner_lives_tbl           this learner's FIB lives pool

    ALTER/CREATE TABLE commit implicitly, so callers must run this
    BEFORE they write anything on `connection`.
    """
    global _fib_schema_ensured
    if _fib_schema_ensured:
        return True
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {FILL_BLANKS_TABLE} ADD COLUMN IF NOT EXISTS instruction VARCHAR(255) DEFAULT NULL AFTER la_id"
        )
        cursor.execute(
            f"ALTER TABLE {FILL_BLANKS_TABLE} ADD COLUMN IF NOT EXISTS answer_choices TEXT DEFAULT NULL AFTER correct_answer"
        )
        cursor.execute(
            f"ALTER TABLE {FILL_BLANKS_TABLE} ADD COLUMN IF NOT EXISTS sort_order INT(5) NOT NULL DEFAULT 0"
        )
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {FIB_LIVES_TABLE} (
                    lives_id INT(10) NOT NULL AUTO_INCREMENT,
                    acc_id VARCHAR(15) NOT NULL,
                    lives TINYINT(1) NOT NULL DEFAULT {FIB_MAX_LIVES},
                    lives_regen_at DATETIME DEFAULT NULL,
                    updated_at DATETIME DEFAULT NULL,
                    PRIMARY KEY (lives_id),
                    UNIQUE KEY uq_fiblives_acc_id (acc_id),
                    CONSTRAINT fk_fiblives_account_id FOREIGN KEY (acc_id) REFERENCES account_tbl (acc_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        cursor.close()
        _fib_schema_ensured = True
        return True
    except Error as e:
        print(f"lesson_fill_blanks: failed to ensure schema: {e}")
        return False


# ============================================================
# SHARED HELPERS (learner + admin builder + admin preview)
# ============================================================
def parse_fib_choices(raw):
    """
    Normalizes wrong choices into a clean list of unique strings. Accepts
    the stored JSON array, a list, or the admin textarea's one-per-line
    text. Choices keep their exact casing (they are code). Never raises.
    """
    if raw is None:
        return []
    if isinstance(raw, (list, tuple)):
        values = list(raw)
    else:
        text = str(raw).strip()
        if not text:
            return []
        values = None
        if text.startswith("["):
            try:
                loaded = json.loads(text)
                if isinstance(loaded, list):
                    values = loaded
            except ValueError:
                values = None
        if values is None:
            values = text.splitlines()

    cleaned, seen = [], set()
    for value in values:
        choice = str(value).strip()[:255] if value is not None else ""
        if choice and choice not in seen:
            seen.add(choice)
            cleaned.append(choice)
    return cleaned[:FIB_MAX_WRONG_CHOICES]


def _fib_normalize(value):
    """Trims and collapses runs of whitespace - casing is kept (Python is case-sensitive)."""
    return re.sub(r"\s+", " ", (value or "").strip())


def compare_fib_answer(submitted, correct_answer):
    """
    Returns "correct", "close" or "incorrect".
      correct - identical after trimming/collapsing whitespace
      close   - only capitalization or spacing differs (still wrong,
                but gets the closeness feedback instead of the flat one)
    """
    given = _fib_normalize(submitted)
    expected = _fib_normalize(correct_answer)
    if not given or not expected:
        return "incorrect"
    if given == expected:
        return "correct"
    if given.lower() == expected.lower() or given.replace(" ", "") == expected.replace(" ", ""):
        return "close"
    return "incorrect"


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


# ============================================================
# ITEMS + PROGRESS (derived from the answer log)
# ============================================================
def _is_published_fib(cursor, la_id):
    cursor.execute(
        f"""SELECT 1 FROM {LEARNING_ACTIVITIES_TABLE} la
            JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
            JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
            WHERE la.la_id = %s AND las.la_stats_name = 'Published'
              AND atp.activity_type_name = %s""",
        (la_id, FIB_TYPE_NAME)
    )
    return cursor.fetchone() is not None


def _load_items(cursor, la_id):
    """Every item of this activity in sort order (includes the answer - server-side only)."""
    cursor.execute(
        f"""SELECT fib_id, instruction, content, correct_answer, answer_choices,
                   correct_feedback, incorrect_feedback
            FROM {FILL_BLANKS_TABLE} WHERE la_id = %s
            ORDER BY sort_order ASC, fib_id ASC""",
        (la_id,)
    )
    return cursor.fetchall()


def _learner_item(row):
    """Learner-safe shape: the correct answer is only ever mixed, unmarked, into `choices`."""
    wrong = parse_fib_choices(row.get("answer_choices"))
    correct = (row.get("correct_answer") or "").strip()
    choices = []
    if wrong and correct:
        choices = [correct] + [c for c in wrong if c != correct]
        random.shuffle(choices)
    return {
        "fib_id": row["fib_id"],
        "instruction": row.get("instruction") or "",
        "content": row["content"],
        "choices": choices,   # [] -> the learner types the answer
    }


def _answer_summary(cursor, acc_id, fib_ids):
    """
    Returns (solved_ids, first_try_correct):
      solved_ids        fib_ids with at least one correct attempt
      first_try_correct items whose attempt_number = 1 is correct
    """
    if not fib_ids:
        return set(), 0
    placeholders = ",".join(["%s"] * len(fib_ids))
    cursor.execute(
        f"""SELECT fib_id, attempt_number, status FROM {FIB_ANSWERS_TABLE}
            WHERE acc_id = %s AND fib_id IN ({placeholders})""",
        tuple([acc_id] + list(fib_ids))
    )
    solved, first_try = set(), set()
    for r in cursor.fetchall():
        if r["status"] == "correct":
            solved.add(r["fib_id"])
            if r["attempt_number"] == 1:
                first_try.add(r["fib_id"])
    return solved, len(first_try)


def _progress_completed(cursor, acc_id, la_id):
    cursor.execute(
        f"""SELECT 1 FROM {PROGRESS_TABLE}
            WHERE acc_id = %s AND la_id = %s AND status = 'completed' LIMIT 1""",
        (acc_id, la_id)
    )
    return cursor.fetchone() is not None


def _save_completion(cursor, acc_id, la_id, score):
    """Marks the activity completed with score = first-attempt correct count."""
    cursor.execute(
        f"SELECT progress_id FROM {PROGRESS_TABLE} WHERE acc_id = %s AND la_id = %s ORDER BY progress_id ASC LIMIT 1",
        (acc_id, la_id)
    )
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            f"""UPDATE {PROGRESS_TABLE}
                SET status = 'completed', score = %s, completed_at = NOW()
                WHERE progress_id = %s""",
            (score, existing["progress_id"])
        )
    else:
        cursor.execute(
            f"""INSERT INTO {PROGRESS_TABLE} (acc_id, la_id, status, score, completed_at)
                VALUES (%s, %s, 'completed', %s, NOW())""",
            (acc_id, la_id, score)
        )


# ============================================================
# LIVES POOL (one per learner for Fill in the Blanks, all lessons)
# ============================================================
def _load_lives(cursor, acc_id):
    """Locks (FOR UPDATE) - creating if needed - this learner's FIB lives row."""
    select_sql = f"""SELECT lives_id, lives, lives_regen_at, NOW() AS db_now
                     FROM {FIB_LIVES_TABLE} WHERE acc_id = %s FOR UPDATE"""
    cursor.execute(select_sql, (acc_id,))
    row = cursor.fetchone()
    if row is None:
        cursor.execute(
            f"INSERT INTO {FIB_LIVES_TABLE} (acc_id, lives, lives_regen_at, updated_at) VALUES (%s, %s, NULL, NOW())",
            (acc_id, FIB_MAX_LIVES)
        )
        cursor.execute(select_sql, (acc_id,))
        row = cursor.fetchone()
    return row


def _apply_regen(row):
    """
    +1 life per FIB_REGEN_SECONDS since lives_regen_at, capped at
    FIB_MAX_LIVES. Uses the database clock (row["db_now"]) so server/DB
    timezone drift can't shorten or stretch the wait.

    Returns (lives, regen_at, seconds_until_next_life).
    """
    lives = row["lives"] if row["lives"] is not None else FIB_MAX_LIVES
    regen_at = row["lives_regen_at"]
    now = row["db_now"]

    if lives >= FIB_MAX_LIVES:
        return FIB_MAX_LIVES, None, 0
    if regen_at is None:
        regen_at = now

    elapsed = max(0, int((now - regen_at).total_seconds()))
    gained = elapsed // FIB_REGEN_SECONDS
    if gained:
        lives = min(FIB_MAX_LIVES, lives + gained)
        regen_at = regen_at + timedelta(seconds=gained * FIB_REGEN_SECONDS)

    if lives >= FIB_MAX_LIVES:
        return FIB_MAX_LIVES, None, 0

    seconds_left = FIB_REGEN_SECONDS - max(0, int((now - regen_at).total_seconds()))
    return lives, regen_at, max(1, seconds_left)


def _save_lives(cursor, lives_id, lives, regen_at):
    cursor.execute(
        f"UPDATE {FIB_LIVES_TABLE} SET lives = %s, lives_regen_at = %s, updated_at = NOW() WHERE lives_id = %s",
        (lives, regen_at, lives_id)
    )


# ============================================================
# STATE
# ============================================================
def _state(lives, seconds_left, index, total, first_try, solved_count, completed):
    """The only battle state the browser ever receives."""
    return {
        "lives": lives,
        "max_lives": FIB_MAX_LIVES,
        "regen_seconds": FIB_REGEN_SECONDS,
        "seconds_to_next_life": seconds_left if lives < FIB_MAX_LIVES else 0,
        "current_index": index,
        "total": total,
        "solved_count": solved_count,
        "first_try_correct": first_try,
        "completed": completed,
    }


def _open(cursor, acc_id, la_id):
    """
    Shared opening for every call: confirms la_id is a Published FIB
    activity, loads its items, works out the current item from the answer
    log, and locks + regenerates the learner's FIB lives pool.
    Returns None if la_id isn't a Published FIB activity.
    """
    if not _is_published_fib(cursor, la_id):
        return None
    items = _load_items(cursor, la_id)
    fib_ids = [r["fib_id"] for r in items]
    solved, first_try = _answer_summary(cursor, acc_id, fib_ids)
    index = next((i for i, fid in enumerate(fib_ids) if fid not in solved), len(fib_ids))
    already_completed = _progress_completed(cursor, acc_id, la_id)

    lives_row = _load_lives(cursor, acc_id)
    lives, regen_at, seconds_left = _apply_regen(lives_row)
    return {
        "items": items,
        "fib_ids": fib_ids,
        "solved": solved,
        "first_try": first_try,
        "index": index,
        "already_completed": already_completed,
        "lives_row": lives_row,
        "lives": lives,
        "regen_at": regen_at,
        "seconds_left": seconds_left,
    }


def get_fib_play(acc_id, la_id):
    """
    Items (learner-safe) + current battle state for this learner, with
    life regeneration applied and saved. If every item is already solved
    but the completion was never saved, it is saved here.

    Returns (payload, error_message, http_status). payload is None on
    failure; error_message says why (shown to the learner and printed
    to the Flask console).
    """
    la_id = _to_int(la_id)
    if not la_id:
        return None, "la_id is required.", 400
    connection = get_db_connection()
    if connection is None:
        return None, "Could not connect to the database.", 500
    try:
        if not ensure_fib_schema(connection):
            return None, ("Could not prepare the Fill in the Blanks tables - "
                          "run fib_migration.sql and check the Flask console."), 500
        cursor = connection.cursor(dictionary=True)
        play = _open(cursor, acc_id, la_id)
        if play is None:
            connection.rollback()
            cursor.close()
            return None, f"Activity {la_id} is not a published Fill in the Blanks activity.", 404

        total = len(play["fib_ids"])
        completed = play["already_completed"] or (total > 0 and play["index"] >= total)
        if completed and not play["already_completed"]:
            _save_completion(cursor, acc_id, la_id, play["first_try"])
        _save_lives(cursor, play["lives_row"]["lives_id"], play["lives"], play["regen_at"])

        connection.commit()
        cursor.close()
        return {
            "items": [_learner_item(r) for r in play["items"]],
            "state": _state(play["lives"], play["seconds_left"], min(play["index"], total), total,
                            play["first_try"], len(play["solved"]), completed),
        }, None, 200
    except Error as e:
        connection.rollback()
        print(f"lesson_fill_blanks: failed to load play for la_id={la_id}: {e}")
        return None, f"Database error while loading this activity: {e}", 500
    finally:
        if connection.is_connected():
            connection.close()


def submit_fib_answer(acc_id, la_id, fib_id, answer):
    """
    Grades one blank. Appends the attempt to fib_learner_answers_tbl.
    Wrong -> -1 life from the FIB pool (starting the regen clock if it
    wasn't running) and the learner stays on the same item.
    Correct -> moves to the next item; solving the last one saves the
    completion with score = first-attempt correct count.

    Returns (payload, error_message). payload["graded"] is False when
    nothing was graded - out of lives, already completed, or the browser
    is on a different item than the server - and payload["state"] tells
    the browser where it really is. The correct answer is never returned
    (a wrong answer means Try Again).
    """
    la_id, fib_id = _to_int(la_id), _to_int(fib_id)
    answer = (answer or "").strip()
    if not la_id or not fib_id:
        return None, "A fill-in-the-blank answer needs la_id and fib_id."
    if not answer:
        return None, "Fill in the blank before checking."

    connection = get_db_connection()
    if connection is None:
        return None, "Could not connect to the database."

    try:
        if not ensure_fib_schema(connection):
            return None, "Could not prepare the Fill in the Blanks tables - check the Flask console."
        cursor = connection.cursor(dictionary=True)
        play = _open(cursor, acc_id, la_id)
        if play is None:
            connection.rollback()
            cursor.close()
            return None, "This activity is not available."

        fib_ids = play["fib_ids"]
        total = len(fib_ids)
        index = play["index"]
        lives, regen_at, seconds_left = play["lives"], play["regen_at"], play["seconds_left"]
        lives_id = play["lives_row"]["lives_id"]
        first_try = play["first_try"]
        solved_count = len(play["solved"])
        completed = play["already_completed"] or index >= total

        if completed or lives <= 0 or fib_ids[index] != fib_id:
            _save_lives(cursor, lives_id, lives, regen_at)
            connection.commit()
            cursor.close()
            state = _state(lives, seconds_left, min(index, total), total, first_try, solved_count, completed)
            return {"graded": False, "state": state}, None

        item = play["items"][index]
        result = compare_fib_answer(answer, item.get("correct_answer"))
        is_correct = result == "correct"
        is_close = result == "close"

        # Feedback priority: closeness check -> admin feedback -> flat fallback.
        if is_correct:
            feedback = item.get("correct_feedback") or FALLBACK_CORRECT_FEEDBACK
        elif is_close:
            extra = item.get("incorrect_feedback") or ""
            feedback = f"{CLOSE_FEEDBACK} {extra}".strip()
        else:
            feedback = item.get("incorrect_feedback") or FALLBACK_INCORRECT_FEEDBACK

        cursor.execute(
            f"SELECT COUNT(*) AS cnt FROM {FIB_ANSWERS_TABLE} WHERE acc_id = %s AND fib_id = %s",
            (acc_id, fib_id)
        )
        attempt_number = cursor.fetchone()["cnt"] + 1
        cursor.execute(
            f"""INSERT INTO {FIB_ANSWERS_TABLE}
                (acc_id, fib_id, answer_given, attempt_number, status, source,
                 recommendation_id, feedback_given, answered_at)
                VALUES (%s, %s, %s, %s, %s, 'self', NULL, %s, NOW())""",
            (acc_id, fib_id, answer[:255], attempt_number,
             "correct" if is_correct else "incorrect", feedback)
        )

        if is_correct:
            if attempt_number == 1:
                first_try += 1
            solved_count += 1
            index += 1
            completed = index >= total
            if completed:
                _save_completion(cursor, acc_id, la_id, first_try)
        else:
            lives -= 1
            if regen_at is None:
                regen_at = play["lives_row"]["db_now"]
                seconds_left = FIB_REGEN_SECONDS

        _save_lives(cursor, lives_id, lives, regen_at)
        connection.commit()
        cursor.close()

        return {
            "graded": True,
            "is_correct": is_correct,
            "is_close": is_close,
            "first_try": is_correct and attempt_number == 1,
            "feedback": feedback,
            "state": _state(lives, seconds_left, min(index, total), total, first_try, solved_count, completed),
        }, None
    except Error as e:
        connection.rollback()
        print(f"lesson_fill_blanks: failed to grade la_id={la_id} fib_id={fib_id}: {e}")
        return None, f"Could not check this answer (database error: {e})."
    finally:
        if connection.is_connected():
            connection.close()