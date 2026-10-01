"""
lesson_fill_blanks.py - Fill in the Blanks: Data Access, Lives & Grading
------------------------------------------------------------------------------
Everything the Fill in the Blanks activity needs on the server, kept in
one self-contained module so it never depends on (or changes) the
Multiple Choice cobra-arena code.

Learner rules (same shape as the MCQ arena):
  - Lives are a per-activity-type POOL shared across all lessons, kept
    in the same learner_lives_tbl as every game (row for the Fill in the
    Blanks activity_type_id) and run by lesson_activities.py's shared
    helpers: 5 regular lives, all refilled 10 minutes after the first
    one is lost, plus 5 bonus lives every day at 8:00 AM PH time (spent
    first, never refilled by the timer). fib_learner_lives_tbl from the
    first build is no longer used.
  - Wrong answer: -1 life, logged, and the correct answer is revealed;
    the learner chooses Try Again (SAME item) or Skip (next item, logged
    as status 'skipped' - no life, no score). Correct answer: next item.
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
from mysql.connector import Error
from cobradb import get_db_connection
from lesson_activities import (
    ensure_activity_game_schema,
    load_lives_pool,
    take_life,
    save_lives_pool,
    total_lives,
    lives_payload,
)
from activity_retakes import (  # Module 85% gate: retake rounds
    FIB_TYPE, open_retake, retake_progress, complete_retake, retake_payload,
)

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
ACTIVITY_TYPES_TABLE = "activity_types_tbl"
FILL_BLANKS_TABLE = "fill_blanks_tbl"
FIB_ANSWERS_TABLE = "fib_learner_answers_tbl"
PROGRESS_TABLE = "learner_activity_progress_tbl"

FIB_TYPE_NAME = "Fill in the Blanks"
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
    (the lives pool lives in learner_lives_tbl - see
    lesson_activities.ensure_activity_game_schema())

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
def _published_fib_type_id(cursor, la_id):
    """activity_type_id of la_id if it's a Published FIB activity, else None."""
    cursor.execute(
        f"""SELECT la.activity_type_id FROM {LEARNING_ACTIVITIES_TABLE} la
            JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
            JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
            WHERE la.la_id = %s AND las.la_stats_name = 'Published'
              AND atp.activity_type_name = %s""",
        (la_id, FIB_TYPE_NAME)
    )
    row = cursor.fetchone()
    return row["activity_type_id"] if row else None


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
      solved_ids        fib_ids with a correct attempt or a skip
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
        if r["status"] in ("correct", "skipped"):
            solved.add(r["fib_id"])
        if r["status"] == "correct" and r["attempt_number"] == 1:
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
# STATE
# ============================================================
def _state(pool, index, total, first_try, solved_count, completed, retake=None):
    """The only battle state the browser ever receives (lives via lives_payload())."""
    state = lives_payload(pool)
    state.update({
        "current_index": index,
        "total": total,
        "solved_count": solved_count,
        "first_try_correct": first_try,
        "completed": completed,
        "retake": retake,   # None outside a retake round (see activity_retakes.retake_payload)
    })
    return state


def _retake_info(cursor, acc_id, play, completed):
    """Retake round payload for _state() - None for the normal play."""
    retake = play.get("retake")
    if not retake:
        return None
    _, fixed = retake_progress(cursor, acc_id, FIB_TYPE, retake)
    ids = play["fib_ids"]
    return retake_payload(retake, len(ids), len(fixed & set(ids)), completed)


def _finish(cursor, acc_id, la_id, play, first_try):
    """Last item done: a retake round just closes; a normal play saves its completion."""
    if play.get("retake"):
        complete_retake(cursor, play["retake"]["retake_id"])
    else:
        _save_completion(cursor, acc_id, la_id, first_try)


def _open(cursor, acc_id, la_id):
    """
    Shared opening for every call: confirms la_id is a Published FIB
    activity, loads its items, works out the current item from the answer
    log, and locks the learner's FIB lives pool (applying the 8 AM reset
    and the 10-minute refill).
    Returns None if la_id isn't a Published FIB activity.
    """
    activity_type_id = _published_fib_type_id(cursor, la_id)
    if activity_type_id is None:
        return None
    items = _load_items(cursor, la_id)
    fib_ids = [r["fib_id"] for r in items]
    solved, first_try = _answer_summary(cursor, acc_id, fib_ids)
    index = next((i for i, fid in enumerate(fib_ids) if fid not in solved), len(fib_ids))
    already_completed = _progress_completed(cursor, acc_id, la_id)

    pool = load_lives_pool(cursor, acc_id, activity_type_id)
    play = {
        "items": items,
        "fib_ids": fib_ids,
        "solved": solved,
        "first_try": first_try,
        "index": index,
        "already_completed": already_completed,
        "pool": pool,
        "retake": None,
    }

    # Retake mode (Module 85% gate): an in-progress retake round exists,
    # so this play covers ONLY that round's items. "Solved" = moved past
    # in this round; first_try stays the activity's first-attempt count.
    retake = open_retake(cursor, acc_id, la_id)
    if retake:
        by_id = {r["fib_id"]: r for r in items}
        ids = [fid for fid in retake["item_ids"] if fid in by_id]
        done, _ = retake_progress(cursor, acc_id, FIB_TYPE, retake)
        round_solved = {fid for fid in ids if fid in done}
        play.update({
            "items": [by_id[fid] for fid in ids],
            "fib_ids": ids,
            "solved": round_solved,
            "index": next((i for i, fid in enumerate(ids) if fid not in round_solved), len(ids)),
            "already_completed": False,
            "retake": retake,
        })
    return play


def get_fib_play(acc_id, la_id):
    """
    Items (learner-safe) + current battle state for this learner, with
    the lives reset/refill applied and saved. If every item is already solved
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
        if not (ensure_activity_game_schema(connection) and ensure_fib_schema(connection)):
            return None, ("Could not prepare the Fill in the Blanks tables - "
                          "run fib_migration.sql and check the Flask console."), 500
        cursor = connection.cursor(dictionary=True)
        play = _open(cursor, acc_id, la_id)
        if play is None:
            connection.rollback()
            cursor.close()
            return None, f"Activity {la_id} is not a published Fill in the Blanks activity.", 404

        total = len(play["fib_ids"])
        if play["retake"]:
            completed = play["index"] >= total
            if completed:
                _finish(cursor, acc_id, la_id, play, play["first_try"])
        else:
            completed = play["already_completed"] or (total > 0 and play["index"] >= total)
            if completed and not play["already_completed"]:
                _save_completion(cursor, acc_id, la_id, play["first_try"])
        retake_info = _retake_info(cursor, acc_id, play, completed)
        save_lives_pool(cursor, play["pool"])

        connection.commit()
        cursor.close()
        return {
            "items": [_learner_item(r) for r in play["items"]],
            "state": _state(play["pool"], min(play["index"], total), total,
                            play["first_try"], len(play["solved"]), completed, retake_info),
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
    Wrong -> -1 life from the FIB pool (bonus lives first; losing the
    first regular life starts the 10-minute refill) and the learner
    stays on the same item.
    Correct -> moves to the next item; solving the last one saves the
    completion with score = first-attempt correct count.

    Returns (payload, error_message). payload["graded"] is False when
    nothing was graded - out of lives, already completed, or the browser
    is on a different item than the server - and payload["state"] tells
    the browser where it really is. The correct answer is only returned
    AFTER a wrong answer (so the learner can Try Again or Skip).
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
        if not (ensure_activity_game_schema(connection) and ensure_fib_schema(connection)):
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
        pool = play["pool"]
        first_try = play["first_try"]
        solved_count = len(play["solved"])
        completed = play["already_completed"] or index >= total

        if completed or total_lives(pool) <= 0 or fib_ids[index] != fib_id:
            retake_info = _retake_info(cursor, acc_id, play, completed)
            save_lives_pool(cursor, pool)
            connection.commit()
            cursor.close()
            state = _state(pool, min(index, total), total, first_try, solved_count, completed, retake_info)
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
                 recommendation_id, feedback_given, answered_at, retake_id)
                VALUES (%s, %s, %s, %s, %s, 'self', NULL, %s, NOW(), %s)""",
            (acc_id, fib_id, answer[:255], attempt_number,
             "correct" if is_correct else "incorrect", feedback,
             play["retake"]["retake_id"] if play["retake"] else None)
        )

        if is_correct:
            if attempt_number == 1:
                first_try += 1
            solved_count += 1
            index += 1
            completed = index >= total
            if completed:
                _finish(cursor, acc_id, la_id, play, first_try)
        else:
            take_life(pool)

        retake_info = _retake_info(cursor, acc_id, play, completed)
        save_lives_pool(cursor, pool)
        connection.commit()
        cursor.close()

        payload = {
            "graded": True,
            "is_correct": is_correct,
            "is_close": is_close,
            "first_try": is_correct and attempt_number == 1,
            "feedback": feedback,
            "state": _state(pool, min(index, total), total, first_try, solved_count, completed, retake_info),
        }
        # The correct answer is never sent back, not even after a wrong
        # answer - learners only get the feedback.
        return payload, None
    except Error as e:
        connection.rollback()
        print(f"lesson_fill_blanks: failed to grade la_id={la_id} fib_id={fib_id}: {e}")
        return None, f"Could not check this answer (database error: {e})."
    finally:
        if connection.is_connected():
            connection.close()


def skip_fib_item(acc_id, la_id, fib_id, from_preview=False):
    """
    Skip the current item. Appends a status 'skipped' row (answer_given
    '', no score); the next unsolved item becomes current, and skipping
    the last one saves the completion (score = first-attempt correct count).
      - after a wrong answer (from_preview=False): costs no life; needs a
        wrong answer on it first
      - from the intro card (from_preview=True): costs 1 life and needs
        no earlier answer
    payload["skipped"] is False when it wasn't allowed (0 lives,
    completed, a different item, or - after-wrong skip only - no wrong
    answer on it yet).
    """
    la_id, fib_id = _to_int(la_id), _to_int(fib_id)
    if not la_id or not fib_id:
        return None, "A skip needs la_id and fib_id."
    connection = get_db_connection()
    if connection is None:
        return None, "Could not connect to the database."
    try:
        if not (ensure_activity_game_schema(connection) and ensure_fib_schema(connection)):
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
        pool = play["pool"]
        first_try = play["first_try"]
        solved_count = len(play["solved"])
        completed = play["already_completed"] or index >= total

        allowed = not completed and total_lives(pool) > 0 and fib_ids[index] == fib_id
        if allowed and not from_preview:
            cursor.execute(
                f"""SELECT COUNT(*) AS wrong FROM {FIB_ANSWERS_TABLE}
                    WHERE acc_id = %s AND fib_id = %s AND status = 'incorrect'""",
                (acc_id, fib_id)
            )
            allowed = cursor.fetchone()["wrong"] > 0

        if allowed:
            cursor.execute(
                f"SELECT COUNT(*) AS cnt FROM {FIB_ANSWERS_TABLE} WHERE acc_id = %s AND fib_id = %s",
                (acc_id, fib_id)
            )
            attempt_number = cursor.fetchone()["cnt"] + 1
            cursor.execute(
                f"""INSERT INTO {FIB_ANSWERS_TABLE}
                    (acc_id, fib_id, answer_given, attempt_number, status, source,
                     recommendation_id, feedback_given, answered_at, retake_id)
                    VALUES (%s, %s, '', %s, 'skipped', 'self', NULL, NULL, NOW(), %s)""",
                (acc_id, fib_id, attempt_number,
                 play["retake"]["retake_id"] if play["retake"] else None)
            )
            if from_preview:
                take_life(pool)
            solved = set(play["solved"]) | {fib_id}
            solved_count = len(solved)
            index = next((i for i, fid in enumerate(fib_ids) if fid not in solved), total)
            completed = index >= total
            if completed:
                _finish(cursor, acc_id, la_id, play, first_try)

        retake_info = _retake_info(cursor, acc_id, play, completed)
        save_lives_pool(cursor, pool)
        connection.commit()
        cursor.close()
        return {
            "skipped": bool(allowed),
            "state": _state(pool, min(index, total), total, first_try, solved_count, completed, retake_info),
        }, None
    except Error as e:
        connection.rollback()
        print(f"lesson_fill_blanks: failed to skip fib_id={fib_id} for la_id={la_id}: {e}")
        return None, "Something went wrong. Your progress is saved."
    finally:
        if connection.is_connected():
            connection.close()