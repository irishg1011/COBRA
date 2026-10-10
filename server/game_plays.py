"""
game_plays.py - The ONE play engine behind the three learner games
------------------------------------------------------------------------------
feat/question-pool-draw, feat/one-attempt-flow, feat/retake-unseen,
feat/lives-5v5, feat/question-timer, feat/leave-detection

Multiple Choice, Fill in the Blanks and Flashcards all run through here,
so the defense rules are written once:

POOL AND DRAW (Task 1)
  Each activity holds a POOL of items (target POOL_TARGET = 50). A PLAY is
  one run of the activity by one learner with its own DRAWN set: DRAW_SIZE
  (5) items picked at random from the ones that learner has not seen
  (draw_items()). Fewer unseen left -> the gap is filled from seen items,
  oldest first; once the whole pool has been seen the cycle starts over.
  The drawn set is saved with the play (activity_play_items_tbl), so a
  paused play resumes with the same questions.

  "Seen" = shown to the learner (shown_at), whatever happened next.
  An item is marked shown when it is REVEALED - by the start/next call
  the browser makes right before it displays the question - never when
  the previous answer is graded, so the next question stays hidden while
  the feedback is on screen and while the play is paused at 0 lives.

ONE ATTEMPT (Task 2)
  Every shown item ends with exactly one outcome and exactly one attempt
  row in the game's answers table:
      play item outcome   answers.status   cobra
      correct             correct          -
      wrong               incorrect        -1 life
      close (Flashcards)  close            -      (accepted, as before)
      skipped             skipped          -1 life
      timed_out           timed_out        -1 life
      left                left             -1 life
  ("replaced" marks items swapped away by a leave - seen, no row.)
  No Try Again: after any outcome the play moves to the next item.

RETAKES (Task 3)
  A retake play holds N new unseen items, N = the slots still missed in
  the activity (activity_retakes.activity_standing). Each correct retake
  answer turns one missed slot into passed. The retake round keeps its
  activity_retakes_tbl row (round number), linked by retake_id.

LIVES 5 vs 5 (Task 4)
  Regular lives (max 5) are spent first; the daily bonus is a separate
  reserve used only once the regular lives are at 0 (lesson_activities
  ._take_life). The bug has one health point per drawn question.

TIMER (Task 5)
  Per-question limit per activity type (game_settings_tbl, so it can be
  changed without a code edit). The clock starts when the item is revealed
  (preview card included), stops at submit/skip, and is frozen while the
  play is paused at 0 lives or by the game's Pause button (hold_timer -
  the question is hidden while paused). It keeps running while the
  learner is away.
  The SERVER decides: an answer that arrives after limit + grace counts as
  timed_out, and an expired item is timed out the next time the play is
  touched. The browser only draws the bar.

LEAVING THE PAGE (Task 6)
  leave_start (beacon on hide) / leave_end (on return). First leave in a
  play: a warning. From the second: the current item is 'left' (-1 life)
  and the remaining unanswered items are replaced with unseen ones.
  Every leave is logged (activity_leave_logs_tbl) for the mentors.

Pure DB helpers + public entry points that open their own connection.
Never touches Flask.
"""

import random
import re
import time
from datetime import timedelta

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
from activity_retakes import (
    GAME_TABLES, MCQ_TYPE, FIB_TYPE, FLASHCARD_TYPE,
    item_ids_for_activity, complete_retake, activity_standing,
)
from learner_shuffle import shuffle_options

PLAYS_TABLE = "activity_plays_tbl"
PLAY_ITEMS_TABLE = "activity_play_items_tbl"
LEAVES_TABLE = "activity_leave_logs_tbl"
SETTINGS_TABLE = "game_settings_tbl"
PROGRESS_TABLE = "learner_activity_progress_tbl"
RECOMMENDATIONS_TABLE = "lesson_recommendations_tbl"

DRAW_SIZE = 5        # questions per play (activity_retakes.DRAW_SIZE scores on the same 5)
POOL_TARGET = 50     # the mentor editor's pool target (create-learning-activity.js POOL_TARGET)

# play item outcome -> answers table status
ANSWER_STATUS = {
    "correct": "correct", "close": "close", "wrong": "incorrect",
    "skipped": "skipped", "timed_out": "timed_out", "left": "left",
}
LIFE_OUTCOMES = ("wrong", "skipped", "timed_out", "left")

# Defaults written once into game_settings_tbl (INSERT IGNORE) - edit the
# rows to change the game, no code edit needed.
DEFAULT_SETTINGS = {
    "timer_seconds_mcq": ("60", "Seconds per Multiple Choice question"),
    "timer_seconds_fib": ("90", "Seconds per Fill in the Blanks item"),
    "timer_seconds_flashcards": ("60", "Seconds per Flashcard"),
    "timer_grace_seconds": ("3", "Extra seconds allowed for network delay on a late answer"),
    "leave_min_seconds": ("2", "Absences shorter than this are ignored"),
}
TIMER_KEYS = {MCQ_TYPE: "timer_seconds_mcq", FIB_TYPE: "timer_seconds_fib", FLASHCARD_TYPE: "timer_seconds_flashcards"}

FALLBACK_FEEDBACK = {
    "correct": "Nice work - that's right.",
    "wrong": "Not quite. Read the lesson part again - you'll get the next one.",
    "skipped": "You skipped this one. Review the lesson part it comes from.",
    "timed_out": "Time ran out on this one. Read the lesson part again so it comes faster next time.",
    "left": "This question was forfeited because you left the page during the activity.",
}
LEAVE_WARNING = ("You left the activity page. Please stay on this page until you finish: "
                 "next time you leave, the current question is forfeited (-1 life) and "
                 "the remaining questions are replaced.")
LEAVE_FORFEIT = ("You left the activity page again, so the current question was forfeited "
                 "(-1 life) and your remaining questions were changed.")

_schema_ensured = False
_settings_cache = {"at": 0.0, "values": {}}
SETTINGS_CACHE_SECONDS = 10


# ============================================================
# SCHEMA
# ============================================================
def ensure_play_schema(connection):
    """
    Idempotent, once per process. DDL commits implicitly - run before
    writing on `connection`.
    """
    global _schema_ensured
    ensure_activity_game_schema(connection)
    if _schema_ensured:
        return True
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {PLAYS_TABLE} (
                    play_id INT(10) NOT NULL AUTO_INCREMENT,
                    acc_id VARCHAR(15) NOT NULL,
                    la_id INT(10) NOT NULL,
                    play_kind VARCHAR(10) NOT NULL DEFAULT 'first',
                    retake_id INT(10) DEFAULT NULL,
                    status VARCHAR(20) NOT NULL,
                    score INT(5) NOT NULL DEFAULT 0,
                    leave_count TINYINT(3) NOT NULL DEFAULT 0,
                    away_since DATETIME DEFAULT NULL,
                    started_at DATETIME NOT NULL,
                    paused_at DATETIME DEFAULT NULL,
                    resumed_at DATETIME DEFAULT NULL,
                    completed_at DATETIME DEFAULT NULL,
                    PRIMARY KEY (play_id),
                    KEY idx_play_acc_la (acc_id, la_id),
                    KEY fk_play_la_id (la_id),
                    CONSTRAINT fk_play_account_id FOREIGN KEY (acc_id) REFERENCES account_tbl (acc_id),
                    CONSTRAINT fk_play_la_id FOREIGN KEY (la_id) REFERENCES learning_activities_tbl (la_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {PLAY_ITEMS_TABLE} (
                    play_item_id INT(10) NOT NULL AUTO_INCREMENT,
                    play_id INT(10) NOT NULL,
                    item_id INT(10) NOT NULL,
                    position INT(5) NOT NULL,
                    shown_at DATETIME DEFAULT NULL,
                    timer_started_at DATETIME DEFAULT NULL,
                    time_used_seconds INT(10) NOT NULL DEFAULT 0,
                    outcome VARCHAR(20) DEFAULT NULL,
                    answered_at DATETIME DEFAULT NULL,
                    PRIMARY KEY (play_item_id),
                    KEY idx_play_items_play (play_id, position),
                    KEY idx_play_items_item (item_id),
                    CONSTRAINT fk_play_items_play FOREIGN KEY (play_id) REFERENCES {PLAYS_TABLE} (play_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {LEAVES_TABLE} (
                    leave_id INT(10) NOT NULL AUTO_INCREMENT,
                    acc_id VARCHAR(15) NOT NULL,
                    context VARCHAR(20) NOT NULL DEFAULT 'game',
                    la_id INT(10) DEFAULT NULL,
                    exercise_id INT(10) DEFAULT NULL,
                    play_id INT(10) DEFAULT NULL,
                    leave_no TINYINT(3) NOT NULL DEFAULT 1,
                    action VARCHAR(20) NOT NULL,
                    reason VARCHAR(30) DEFAULT NULL,
                    away_seconds INT(10) NOT NULL DEFAULT 0,
                    left_at DATETIME NOT NULL,
                    returned_at DATETIME DEFAULT NULL,
                    PRIMARY KEY (leave_id),
                    KEY idx_leave_acc (acc_id),
                    KEY idx_leave_la (la_id),
                    KEY idx_leave_exercise (exercise_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {SETTINGS_TABLE} (
                    setting_key VARCHAR(64) NOT NULL,
                    setting_value VARCHAR(255) NOT NULL,
                    description VARCHAR(255) DEFAULT NULL,
                    updated_at DATETIME DEFAULT NULL,
                    PRIMARY KEY (setting_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        for key, (value, description) in DEFAULT_SETTINGS.items():
            cursor.execute(
                f"INSERT IGNORE INTO {SETTINGS_TABLE} (setting_key, setting_value, description, updated_at) "
                f"VALUES (%s, %s, %s, NOW())",
                (key, value, description)
            )
        for answers_table, _, _, _ in GAME_TABLES.values():
            cursor.execute(f"ALTER TABLE {answers_table} ADD COLUMN IF NOT EXISTS play_id INT(10) DEFAULT NULL")
            cursor.execute(f"ALTER TABLE {answers_table} ADD INDEX IF NOT EXISTS idx_play_id (play_id)")
        # Task 8 / Task 9 content fields
        cursor.execute("ALTER TABLE fill_blanks_tbl MODIFY instruction TEXT DEFAULT NULL")
        cursor.execute("ALTER TABLE fill_blanks_tbl ADD COLUMN IF NOT EXISTS code_text TEXT DEFAULT NULL")
        cursor.execute("ALTER TABLE fill_blanks_tbl ADD COLUMN IF NOT EXISTS expected_output TEXT DEFAULT NULL")
        cursor.execute("ALTER TABLE fill_blanks_tbl ADD COLUMN IF NOT EXISTS hint VARCHAR(500) DEFAULT NULL")
        cursor.execute("ALTER TABLE fill_blanks_tbl ADD COLUMN IF NOT EXISTS must_contain VARCHAR(255) DEFAULT NULL")
        cursor.execute("ALTER TABLE flashcards_tbl ADD COLUMN IF NOT EXISTS hint VARCHAR(500) DEFAULT NULL")
        cursor.execute("ALTER TABLE mcq_questions_tbl ADD COLUMN IF NOT EXISTS correct_feedback VARCHAR(500) DEFAULT NULL")
        cursor.execute("ALTER TABLE mcq_questions_tbl ADD COLUMN IF NOT EXISTS incorrect_feedback VARCHAR(500) DEFAULT NULL")
        cursor.close()
        _schema_ensured = True
        return True
    except Error as e:
        print(f"game_plays: failed to ensure play schema: {e}")
        return False


# ============================================================
# SETTINGS
# ============================================================
def get_settings(cursor=None, fresh=False):
    """{key: str value} from game_settings_tbl (cached SETTINGS_CACHE_SECONDS)."""
    now = time.time()
    if not fresh and _settings_cache["values"] and now - _settings_cache["at"] < SETTINGS_CACHE_SECONDS:
        return dict(_settings_cache["values"])
    values = {k: v for k, (v, _d) in DEFAULT_SETTINGS.items()}
    own = None
    try:
        if cursor is None:
            own = get_db_connection()
            if own is None:
                return values
            ensure_play_schema(own)
            cursor = own.cursor(dictionary=True)
        cursor.execute(f"SELECT setting_key, setting_value FROM {SETTINGS_TABLE}")
        for row in cursor.fetchall():
            key = row["setting_key"] if isinstance(row, dict) else row[0]
            val = row["setting_value"] if isinstance(row, dict) else row[1]
            values[key] = val
        _settings_cache.update(at=now, values=dict(values))
    except Error as e:
        print(f"game_plays: could not read settings: {e}")
    finally:
        if own is not None and own.is_connected():
            own.close()
    return values


def setting_int(settings, key, minimum=0):
    try:
        return max(minimum, int(float(settings.get(key, DEFAULT_SETTINGS[key][0]))))
    except (TypeError, ValueError, KeyError):
        return int(DEFAULT_SETTINGS[key][0])


def save_settings(changes):
    """Admin: updates known keys. Returns (settings, error)."""
    connection = get_db_connection()
    if connection is None:
        return None, "Could not connect to the database."
    try:
        ensure_play_schema(connection)
        cursor = connection.cursor(dictionary=True)
        for key, value in (changes or {}).items():
            if key not in DEFAULT_SETTINGS:
                continue
            try:
                number = int(float(value))
            except (TypeError, ValueError):
                return None, f"{key} must be a number."
            if number < 0 or number > 3600:
                return None, f"{key} must be between 0 and 3600."
            cursor.execute(
                f"UPDATE {SETTINGS_TABLE} SET setting_value = %s, updated_at = NOW() WHERE setting_key = %s",
                (str(number), key)
            )
        connection.commit()
        values = get_settings(cursor, fresh=True)
        cursor.close()
        return values, None
    except Error as e:
        connection.rollback()
        return None, f"Could not save the settings: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def time_limit_for(settings, activity_type):
    return setting_int(settings, TIMER_KEYS.get(activity_type, "timer_seconds_mcq"), minimum=5)


# ============================================================
# DRAW (shared - first plays, retakes and leave swaps all use it)
# ============================================================
def seen_summary(cursor, acc_id, la_id, activity_type):
    """
    {item_id: (times_seen, last_seen)} for this learner and activity:
    every play item that was shown (or swapped away), plus items answered
    under the old rules (answer rows with no play_id).
    """
    seen = {}
    cursor.execute(
        f"""SELECT pi.item_id, COUNT(*) AS times, MAX(pi.shown_at) AS last_seen
            FROM {PLAY_ITEMS_TABLE} pi
            JOIN {PLAYS_TABLE} p ON p.play_id = pi.play_id
            WHERE p.acc_id = %s AND p.la_id = %s AND pi.shown_at IS NOT NULL
            GROUP BY pi.item_id""",
        (acc_id, la_id)
    )
    for r in cursor.fetchall():
        seen[r["item_id"]] = (r["times"], r["last_seen"])
    answers_table, id_col, _, _ = GAME_TABLES[activity_type]
    cursor.execute(
        f"""SELECT {id_col} AS item_id, MAX(answered_at) AS last_seen FROM {answers_table}
            WHERE acc_id = %s AND play_id IS NULL
              AND {id_col} IN (SELECT {id_col} FROM {GAME_TABLES[activity_type][2]} WHERE la_id = %s AND is_removed = 0)
            GROUP BY {id_col}""",
        (acc_id, la_id)
    )
    for r in cursor.fetchall():
        times, last = seen.get(r["item_id"], (0, None))
        if last is None or (r["last_seen"] and r["last_seen"] > last):
            last = r["last_seen"]
        seen[r["item_id"]] = (times + 1, last)
    return seen


def draw_items(cursor, acc_id, la_id, activity_type, count, exclude=()):
    """
    THE draw: `count` item ids for this learner and activity.
      1. items seen the fewest times (= not seen in the current cycle) are
         picked at random;
      2. if that is not enough, the gap is filled from the next ones,
         seen longest ago first.
    So nothing repeats until the whole pool has been seen, and then the
    cycle starts over. `exclude`: ids that must not be drawn (the play's
    own items, for a leave swap). Fewer items than `count` -> all of them.
    """
    exclude = set(exclude)
    pool = [i for i in item_ids_for_activity(cursor, activity_type, la_id) if i not in exclude]
    if count <= 0 or not pool:
        return []
    seen = seen_summary(cursor, acc_id, la_id, activity_type)
    by_times = {}
    for item_id in pool:
        by_times.setdefault(seen.get(item_id, (0, None))[0], []).append(item_id)
    picked = []
    for level_no, times in enumerate(sorted(by_times)):
        level = by_times[times]
        need = count - len(picked)
        if need <= 0:
            break
        if level_no == 0:
            random.shuffle(level)
        else:
            level.sort(key=lambda i: (seen[i][1] is not None, seen[i][1]))   # oldest first
        picked.extend(level[:need])
    random.shuffle(picked)   # the play's question order is random too
    return picked


def create_play(cursor, acc_id, la_id, item_ids, now, kind="first", retake_id=None):
    cursor.execute(
        f"""INSERT INTO {PLAYS_TABLE} (acc_id, la_id, play_kind, retake_id, status, started_at)
            VALUES (%s, %s, %s, %s, 'in_progress', %s)""",
        (acc_id, la_id, kind, retake_id, now)
    )
    play_id = cursor.lastrowid
    for position, item_id in enumerate(item_ids):
        cursor.execute(
            f"INSERT INTO {PLAY_ITEMS_TABLE} (play_id, item_id, position) VALUES (%s, %s, %s)",
            (play_id, item_id, position)
        )
    return play_id


# ============================================================
# ITEM ADAPTERS - content (learner-safe) and grading per game
# ============================================================
_BLANK_RE = re.compile(r"\[?_{3,}\]?")


def _load_mcq(cursor, acc_id, item_ids):
    out = {}
    if not item_ids:
        return out
    ph = ",".join(["%s"] * len(item_ids))
    cursor.execute(
        f"""SELECT q_id, question_text, correct_feedback, incorrect_feedback, is_removed
            FROM mcq_questions_tbl WHERE q_id IN ({ph})""",
        tuple(item_ids)
    )
    for q in cursor.fetchall():
        cursor.execute(
            """SELECT option_id, option_letter, option_text, is_correct, feedback
               FROM mcq_options_tbl WHERE q_id = %s AND is_removed = 0 ORDER BY option_letter ASC""",
            (q["q_id"],)
        )
        q["options"] = shuffle_options(acc_id, q["q_id"], cursor.fetchall())
        out[q["q_id"]] = q
    return out


def _load_fib(cursor, acc_id, item_ids):
    if not item_ids:
        return {}
    ph = ",".join(["%s"] * len(item_ids))
    cursor.execute(
        f"""SELECT fib_id, instruction, content, correct_answer, answer_choices, correct_feedback,
                   incorrect_feedback, code_text, expected_output, hint, must_contain, is_removed
            FROM fill_blanks_tbl WHERE fib_id IN ({ph})""",
        tuple(item_ids)
    )
    return {r["fib_id"]: r for r in cursor.fetchall()}


def _load_cards(cursor, acc_id, item_ids):
    if not item_ids:
        return {}
    ph = ",".join(["%s"] * len(item_ids))
    cursor.execute(
        f"""SELECT flashcard_id, front_text, back_text, correct_feedback, incorrect_feedback, hint, is_removed
            FROM flashcards_tbl WHERE flashcard_id IN ({ph})""",
        tuple(item_ids)
    )
    return {r["flashcard_id"]: r for r in cursor.fetchall()}


LOADERS = {MCQ_TYPE: _load_mcq, FIB_TYPE: _load_fib, FLASHCARD_TYPE: _load_cards}


def learner_item(activity_type, row):
    """What the browser may see of one revealed item - never the answer."""
    if activity_type == MCQ_TYPE:
        return {
            "q_id": row["q_id"],
            "question_text": row["question_text"],
            "options": [{"option_id": o["option_id"], "option_letter": o["option_letter"], "text": o["option_text"]}
                        for o in row["options"]],
        }
    if activity_type == FIB_TYPE:
        from lesson_fill_blanks import fib_choices_for_learner
        has_console = bool((row.get("code_text") or "").strip())
        return {
            "fib_id": row["fib_id"],
            # Task 8: question, hint, console (code with the blank), expected output
            "instruction": (row.get("instruction") or "") if has_console else (row.get("instruction") or ""),
            "content": row["code_text"] if has_console else row["content"],
            "has_console": has_console,
            # The expected output is NOT sent while answering: the learner sees
            # the real output only after a correct answer (submit_answer).
            "hint": row.get("hint") or "",
            "choices": fib_choices_for_learner(row),
        }
    return {"flashcard_id": row["flashcard_id"], "front_text": row["front_text"] or "", "hint": row.get("hint") or ""}


def _feedback_for(row, outcome, activity_type, fallback=None):
    """
    Task 9: the mentor's text - correct text after `correct`, wrong text after
    every other outcome - else the system feedback already in place.
    """
    if outcome in ("correct", "close"):
        text = row.get("correct_feedback")
    else:
        text = row.get("incorrect_feedback")
    text = (text or "").strip()
    if text:
        return text
    return fallback or FALLBACK_FEEDBACK.get("correct" if outcome == "close" else outcome, FALLBACK_FEEDBACK["wrong"])


def grade(activity_type, row, data):
    """
    Grades one submitted answer. Returns
      {"outcome": correct|close|wrong, "feedback", "answer_given", "option_id",
       "extra": {...shown to the learner}}
    or {"error": msg} when the submission is malformed.
    """
    if activity_type == MCQ_TYPE:
        try:
            option_id = int(data.get("option_id"))
        except (TypeError, ValueError):
            return {"error": "An answer needs option_id."}
        selected = next((o for o in row["options"] if o["option_id"] == option_id), None)
        if selected is None:
            return {"error": "That answer does not belong to this question."}
        outcome = "correct" if selected["is_correct"] else "wrong"
        return {
            "outcome": outcome,
            "feedback": _feedback_for(row, outcome, activity_type, fallback=(selected.get("feedback") or None)),
            "answer_given": None,
            "option_id": option_id,
            "extra": {},
        }
    if activity_type == FIB_TYPE:
        from lesson_fill_blanks import grade_fib_item
        answer = (data.get("answer") or "").strip()
        if not answer:
            return {"error": "Fill in the blank before checking."}
        result = grade_fib_item(row, answer)
        outcome = result["outcome"]
        return {
            "outcome": outcome,
            "feedback": _feedback_for(row, "correct" if outcome == "correct" else "wrong", activity_type,
                                      fallback=result.get("system_feedback")),
            "answer_given": answer[:255],
            "option_id": None,
            "extra": {"console": result.get("console"), "is_close": result.get("is_close", False)},
        }
    from lesson_flashcards import grade_flashcard, CLOSE_FEEDBACK, ANSWER_MAX_LEN, answer_syntax_error
    answer = (data.get("answer") or "").strip()
    if not answer:
        return {"error": "Type an answer first."}
    status = grade_flashcard(answer, row["back_text"])
    outcome = {"correct": "correct", "close": "close"}.get(status, "wrong")
    feedback = CLOSE_FEEDBACK if outcome == "close" else _feedback_for(row, outcome, activity_type)
    return {
        "outcome": outcome,
        "feedback": feedback,
        "answer_given": answer[:ANSWER_MAX_LEN],
        "option_id": None,
        # The back is only sent once the card is passed - never after a miss.
        "extra": {
            "answer": (row["back_text"] or "").strip() if outcome in ("correct", "close") else None,
            # A code answer that is not valid Python: the real SyntaxError.
            "syntax_error": answer_syntax_error(answer, row["back_text"]) if outcome == "wrong" else None,
        },
    }


# ============================================================
# PLAY CONTEXT
# ============================================================
def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _activity(cursor, la_id):
    cursor.execute(
        """SELECT la.la_id, la.activity_type_id, la.resource_id, atp.activity_type_name
           FROM learning_activities_tbl la
           JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
           JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
           WHERE la.la_id = %s AND las.la_stats_name = 'Published'""",
        (la_id,)
    )
    row = cursor.fetchone()
    if not row or row["activity_type_name"] not in GAME_TABLES:
        return None
    return row


def _load_play_items(cursor, play_id):
    cursor.execute(
        f"""SELECT play_item_id, item_id, position, shown_at, timer_started_at, time_used_seconds,
                   outcome, answered_at
            FROM {PLAY_ITEMS_TABLE}
            WHERE play_id = %s AND (outcome IS NULL OR outcome <> 'replaced')
            ORDER BY position ASC, play_item_id ASC""",
        (play_id,)
    )
    return cursor.fetchall()


def _open(cursor, acc_id, la_id, expected_type=None):
    activity = _activity(cursor, la_id)
    if activity is None or (expected_type and activity["activity_type_name"] != expected_type):
        return None
    pool = load_lives_pool(cursor, acc_id, activity["activity_type_id"])   # lock order: lives, then play
    cursor.execute(
        f"""SELECT play_id, play_kind, retake_id, status, score, leave_count, away_since, paused_at
            FROM {PLAYS_TABLE} WHERE acc_id = %s AND la_id = %s
            ORDER BY play_id DESC LIMIT 1 FOR UPDATE""",
        (acc_id, la_id)
    )
    latest = cursor.fetchone()
    cursor.execute(
        f"SELECT 1 FROM {PROGRESS_TABLE} WHERE acc_id = %s AND la_id = %s AND status = 'completed' LIMIT 1",
        (acc_id, la_id)
    )
    progress_done = cursor.fetchone() is not None
    settings = get_settings(cursor)
    ctx = {
        "acc_id": acc_id,
        "la_id": la_id,
        "type": activity["activity_type_name"],
        "activity": activity,
        "pool": pool,
        "now": pool["db_now"],
        "settings": settings,
        "limit": time_limit_for(settings, activity["activity_type_name"]),
        "progress_done": progress_done,
        "play": latest if latest and latest["status"] != "completed" else None,
        "last_play": latest,
        "items": [],
        "rows": {},
        "events": [],
    }
    if ctx["play"]:
        _load_ctx_items(cursor, ctx)
        if ctx["play"]["play_kind"] == "retake":
            _trim_oversized_retake(cursor, ctx)
        if ctx["play"]:
            _apply_expired_timer(cursor, ctx)
    return ctx


def _load_ctx_items(cursor, ctx):
    ctx["items"] = _load_play_items(cursor, ctx["play"]["play_id"])
    ids = [i["item_id"] for i in ctx["items"]]
    ctx["rows"] = LOADERS[ctx["type"]](cursor, ctx["acc_id"], ids)
    # An item deleted (or hidden - is_removed) from the pool after it was
    # drawn can't be played; one already answered in this play stays.
    ctx["items"] = [i for i in ctx["items"] if i["item_id"] in ctx["rows"]
                    and (i["outcome"] is not None or not ctx["rows"][i["item_id"]].get("is_removed"))]


def _trim_oversized_retake(cursor, ctx):
    """
    A retake round holds at most DRAW_SIZE (5) questions and only as many as
    are still missed. Rounds opened before that rule (one held 50) keep what
    was already answered; the extra unanswered questions are marked
    'replaced' (never shown, so never "seen"), in position order - the one
    on screen is always kept. Nothing left to play -> the round completes.
    """
    unanswered = [i for i in ctx["items"] if i["outcome"] is None]
    if not unanswered:
        return
    answered = len(ctx["items"]) - len(unanswered)
    standing = activity_standing(cursor, ctx["acc_id"], ctx["type"], ctx["la_id"])
    keep = max(0, min(standing["missed"], DRAW_SIZE - answered, len(unanswered)))
    if keep >= len(unanswered):
        return
    drop = unanswered[keep:]
    for item in drop:
        cursor.execute(
            f"UPDATE {PLAY_ITEMS_TABLE} SET outcome = 'replaced', answered_at = %s WHERE play_item_id = %s",
            (ctx["now"], item["play_item_id"])
        )
    dropped = {item["play_item_id"] for item in drop}
    ctx["items"] = [i for i in ctx["items"] if i["play_item_id"] not in dropped]
    if _current(ctx) is None:
        _after_outcome(cursor, ctx)   # nothing left to play: the round is done


def _current(ctx):
    return next((i for i in ctx["items"] if i["outcome"] is None), None)


def _elapsed(ctx, item):
    used = item["time_used_seconds"] or 0
    if item["timer_started_at"] is not None:
        used += max(0, int((ctx["now"] - item["timer_started_at"]).total_seconds()))
    return used


def _seconds_left(ctx, item):
    return max(0, ctx["limit"] - _elapsed(ctx, item))


# ---------------- writes ----------------
def _log_answer(cursor, ctx, item, outcome, feedback, answer_given=None, option_id=None, recommendation_id=None):
    answers_table, id_col, _, _ = GAME_TABLES[ctx["type"]]
    cursor.execute(
        f"SELECT COUNT(*) AS cnt FROM {answers_table} WHERE acc_id = %s AND {id_col} = %s",
        (ctx["acc_id"], item["item_id"])
    )
    attempt_number = cursor.fetchone()["cnt"] + 1
    source = "recommendation" if recommendation_id else "self"
    status = ANSWER_STATUS[outcome]
    play = ctx["play"]
    if ctx["type"] == MCQ_TYPE:
        cursor.execute(
            f"""INSERT INTO {answers_table}
                (acc_id, q_id, option_id, attempt_number, status, source, recommendation_id,
                 feedback_given, answered_at, retake_id, play_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (ctx["acc_id"], item["item_id"], option_id, attempt_number, status, source, recommendation_id,
             feedback, ctx["now"], play["retake_id"], play["play_id"])
        )
    else:
        cursor.execute(
            f"""INSERT INTO {answers_table}
                (acc_id, {id_col}, answer_given, attempt_number, status, source, recommendation_id,
                 feedback_given, answered_at, retake_id, play_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (ctx["acc_id"], item["item_id"], answer_given or "", attempt_number, status, source,
             recommendation_id, feedback, ctx["now"], play["retake_id"], play["play_id"])
        )
    return attempt_number


def _stop_timer(ctx, item):
    item["time_used_seconds"] = _elapsed(ctx, item)
    item["timer_started_at"] = None


def _set_outcome(cursor, ctx, item, outcome):
    _stop_timer(ctx, item)
    item["outcome"] = outcome
    item["answered_at"] = ctx["now"]
    cursor.execute(
        f"""UPDATE {PLAY_ITEMS_TABLE}
            SET outcome = %s, answered_at = %s, timer_started_at = NULL, time_used_seconds = %s
            WHERE play_item_id = %s""",
        (outcome, ctx["now"], item["time_used_seconds"], item["play_item_id"])
    )
    if outcome in LIFE_OUTCOMES:
        take_life(ctx["pool"])


def _correct_count(ctx):
    return sum(1 for i in ctx["items"] if i["outcome"] == "correct")


def _save_first_completion(cursor, acc_id, la_id, score):
    cursor.execute(
        f"SELECT progress_id FROM {PROGRESS_TABLE} WHERE acc_id = %s AND la_id = %s ORDER BY progress_id ASC LIMIT 1",
        (acc_id, la_id)
    )
    existing = cursor.fetchone()
    if existing:
        cursor.execute(
            f"UPDATE {PROGRESS_TABLE} SET status = 'completed', score = %s, completed_at = NOW() WHERE progress_id = %s",
            (score, existing["progress_id"])
        )
    else:
        cursor.execute(
            f"INSERT INTO {PROGRESS_TABLE} (acc_id, la_id, status, score, completed_at) VALUES (%s, %s, 'completed', %s, NOW())",
            (acc_id, la_id, score)
        )


def _after_outcome(cursor, ctx):
    """Completes the play after its last item, else pauses it at 0 lives."""
    play = ctx["play"]
    score = _correct_count(ctx)
    if _current(ctx) is None:
        cursor.execute(
            f"UPDATE {PLAYS_TABLE} SET status = 'completed', score = %s, completed_at = %s, away_since = NULL WHERE play_id = %s",
            (score, ctx["now"], play["play_id"])
        )
        play["status"] = "completed"
        if play["play_kind"] == "retake":
            if play["retake_id"]:
                complete_retake(cursor, play["retake_id"])
        else:
            _save_first_completion(cursor, ctx["acc_id"], ctx["la_id"], score)
            ctx["progress_done"] = True
        ctx["finished_play"] = play
        ctx["play"] = None
        return
    cursor.execute(f"UPDATE {PLAYS_TABLE} SET score = %s WHERE play_id = %s", (score, play["play_id"]))
    _pause_if_out_of_lives(cursor, ctx)


def _pause_if_out_of_lives(cursor, ctx):
    """0 lives -> pause before the next question is revealed (a revealed,
    unanswered one keeps its clock frozen until the play resumes)."""
    play = ctx["play"]
    if not play or play["status"] != "in_progress" or total_lives(ctx["pool"]) > 0:
        return
    current = _current(ctx)
    if current and current["timer_started_at"] is not None:
        _stop_timer(ctx, current)
        cursor.execute(
            f"UPDATE {PLAY_ITEMS_TABLE} SET timer_started_at = NULL, time_used_seconds = %s WHERE play_item_id = %s",
            (current["time_used_seconds"], current["play_item_id"])
        )
    cursor.execute(
        f"UPDATE {PLAYS_TABLE} SET status = 'paused', paused_at = %s WHERE play_id = %s",
        (ctx["now"], play["play_id"])
    )
    play["status"] = "paused"


def _reveal_current(cursor, ctx):
    """Marks the current item shown (= seen) and starts its clock."""
    play = ctx["play"]
    current = _current(ctx)
    if not play or play["status"] != "in_progress" or current is None or total_lives(ctx["pool"]) <= 0:
        return
    changed = False
    if current["shown_at"] is None:
        current["shown_at"] = ctx["now"]
        changed = True
    if current["timer_started_at"] is None:
        current["timer_started_at"] = ctx["now"]
        changed = True
    if changed:
        cursor.execute(
            f"UPDATE {PLAY_ITEMS_TABLE} SET shown_at = %s, timer_started_at = %s WHERE play_item_id = %s",
            (current["shown_at"], current["timer_started_at"], current["play_item_id"])
        )


def _apply_expired_timer(cursor, ctx):
    """The server decides: a revealed item past limit + grace is timed out."""
    play = ctx["play"]
    current = _current(ctx)
    if not play or play["status"] != "in_progress" or current is None or current["timer_started_at"] is None:
        return
    grace = setting_int(ctx["settings"], "timer_grace_seconds")
    if _elapsed(ctx, current) > ctx["limit"] + grace:
        _time_out(cursor, ctx, current)


def _time_out(cursor, ctx, item):
    row = ctx["rows"][item["item_id"]]
    feedback = _feedback_for(row, "timed_out", ctx["type"])
    _set_outcome(cursor, ctx, item, "timed_out")
    _log_answer(cursor, ctx, item, "timed_out", feedback)
    ctx["events"].append({"type": "timed_out", "item_id": item["item_id"], "feedback": feedback})
    _after_outcome(cursor, ctx)
    return feedback


def _start_or_resume(cursor, ctx, boot=False):
    """
    Start-or-resume - the only place a play is created:
      active play paused + lives -> same play resumes
      no active play, first play not finished, lives -> ONE new play with
      DRAW_SIZE drawn items
      completed / 0 lives -> nothing changes
    Then the current item is revealed. boot=True: the page was (re)opened,
    so a leave that was never closed (tab closed / refreshed) is counted.
    """
    lives = total_lives(ctx["pool"])
    play = ctx["play"]
    if play and boot and play.get("away_since") and play["status"] == "in_progress":
        _process_leave(cursor, ctx, away_seconds=None, reason="closed_or_refreshed", force=True)
        play = ctx["play"]
    if play is None and not ctx["progress_done"] and lives > 0:
        ids = draw_items(cursor, ctx["acc_id"], ctx["la_id"], ctx["type"], DRAW_SIZE)
        if not ids:
            return
        play_id = create_play(cursor, ctx["acc_id"], ctx["la_id"], ids, ctx["now"])
        ctx["play"] = {"play_id": play_id, "play_kind": "first", "retake_id": None, "status": "in_progress",
                       "score": 0, "leave_count": 0, "away_since": None, "paused_at": None}
        _load_ctx_items(cursor, ctx)
        play = ctx["play"]
    if play and play["status"] == "paused" and lives > 0:
        cursor.execute(
            f"UPDATE {PLAYS_TABLE} SET status = 'in_progress', resumed_at = %s WHERE play_id = %s",
            (ctx["now"], play["play_id"])
        )
        play["status"] = "in_progress"
    _reveal_current(cursor, ctx)


# ---------------- leaving the page ----------------
def _log_leave(cursor, ctx, leave_no, action, reason, away_seconds, left_at):
    cursor.execute(
        f"""INSERT INTO {LEAVES_TABLE}
            (acc_id, context, la_id, exercise_id, play_id, leave_no, action, reason, away_seconds, left_at, returned_at)
            VALUES (%s, 'game', %s, NULL, %s, %s, %s, %s, %s, %s, %s)""",
        (ctx["acc_id"], ctx["la_id"], ctx["play"]["play_id"], leave_no, action, reason,
         away_seconds, left_at, ctx["now"])
    )


def _process_leave(cursor, ctx, away_seconds=None, reason="hidden", force=False):
    play = ctx["play"]
    if not play or play["status"] != "in_progress":
        return None
    left_at = play.get("away_since") or ctx["now"]
    if away_seconds is None:
        away_seconds = max(0, int((ctx["now"] - left_at).total_seconds())) if play.get("away_since") else 0
    else:
        left_at = ctx["now"] - timedelta(seconds=away_seconds)
    cursor.execute(f"UPDATE {PLAYS_TABLE} SET away_since = NULL WHERE play_id = %s", (play["play_id"],))
    play["away_since"] = None
    if not force and away_seconds < setting_int(ctx["settings"], "leave_min_seconds"):
        return None
    leave_no = (play["leave_count"] or 0) + 1
    play["leave_count"] = leave_no
    cursor.execute(f"UPDATE {PLAYS_TABLE} SET leave_count = %s WHERE play_id = %s", (leave_no, play["play_id"]))
    if leave_no == 1:
        _log_leave(cursor, ctx, leave_no, "warning", reason, away_seconds, left_at)
        event = {"type": "leave_warning", "message": LEAVE_WARNING}
        ctx["events"].append(event)
        return event
    _log_leave(cursor, ctx, leave_no, "forfeit", reason, away_seconds, left_at)
    forfeited = None
    current = _current(ctx)
    if current is not None and current["shown_at"] is not None:
        row = ctx["rows"][current["item_id"]]
        feedback = _feedback_for(row, "left", ctx["type"])
        _set_outcome(cursor, ctx, current, "left")
        _log_answer(cursor, ctx, current, "left", feedback)
        forfeited = current["item_id"]
    # Replace every remaining unanswered item with unseen ones.
    remaining = [i for i in ctx["items"] if i["outcome"] is None]
    if remaining:
        cursor.execute(
            f"SELECT item_id FROM {PLAY_ITEMS_TABLE} WHERE play_id = %s", (play["play_id"],)
        )
        in_play = {r["item_id"] for r in cursor.fetchall()}
        fresh = draw_items(cursor, ctx["acc_id"], ctx["la_id"], ctx["type"], len(remaining), exclude=in_play)
        for old, new_id in zip(remaining, fresh):
            cursor.execute(
                f"""UPDATE {PLAY_ITEMS_TABLE} SET outcome = 'replaced', answered_at = %s,
                        shown_at = COALESCE(shown_at, %s), timer_started_at = NULL
                    WHERE play_item_id = %s""",
                (ctx["now"], ctx["now"], old["play_item_id"])
            )
            cursor.execute(
                f"INSERT INTO {PLAY_ITEMS_TABLE} (play_id, item_id, position) VALUES (%s, %s, %s)",
                (play["play_id"], new_id, old["position"])
            )
        _load_ctx_items(cursor, ctx)
    event = {"type": "leave_forfeit", "message": LEAVE_FORFEIT, "forfeited_item_id": forfeited,
             "replaced": len(remaining)}
    ctx["events"].append(event)
    if forfeited is not None or _current(ctx) is None:
        _after_outcome(cursor, ctx)
    return event


# ============================================================
# STATE (the only game state the browser receives)
# ============================================================
ID_KEYS = {MCQ_TYPE: "q_id", FIB_TYPE: "fib_id", FLASHCARD_TYPE: "flashcard_id"}


def _retake_round_no(cursor, retake_id):
    if not retake_id:
        return None
    cursor.execute("SELECT round_no FROM activity_retakes_tbl WHERE retake_id = %s", (retake_id,))
    row = cursor.fetchone()
    return row["round_no"] if row else None


def build_state(cursor, ctx):
    play = ctx["play"]
    shown_play = play or ctx.get("finished_play")
    state = lives_payload(ctx["pool"])
    id_key = ID_KEYS[ctx["type"]]
    items_out = []
    current = _current(ctx) if play else None
    index = len(ctx["items"])
    if shown_play:
        for n, item in enumerate(ctx["items"]):
            if item is current:
                index = n
            if item["shown_at"] is not None:
                entry = learner_item(ctx["type"], ctx["rows"][item["item_id"]])
            else:
                entry = {id_key: item["item_id"], "hidden": True}   # not revealed yet
            entry["outcome"] = item["outcome"]
            items_out.append(entry)
    total = len(ctx["items"]) if shown_play else 0
    correct = _correct_count(ctx) if shown_play else 0
    solved = sum(1 for i in ctx["items"] if i["outcome"] is not None) if shown_play else 0
    completed = play is None and (ctx["progress_done"] or bool(ctx.get("finished_play")))
    standing = activity_standing(cursor, ctx["acc_id"], ctx["type"], ctx["la_id"])

    is_retake = bool(shown_play and shown_play["play_kind"] == "retake")
    first_try = correct if not is_retake else standing["first_correct"]
    state.update({
        "play_id": shown_play["play_id"] if shown_play else None,
        "session_status": "completed" if completed else (play["status"] if play else None),
        "current_index": min(index, max(total - 1, 0)) if not completed else total,
        "current_item_id": current["item_id"] if current else None,
        "current_q_id": current["item_id"] if current else None,
        "current_flashcard_id": current["item_id"] if current else None,
        "current_revealed": bool(current and current["shown_at"] is not None),
        "total": total,
        "solved_count": solved,
        "first_try_correct": first_try,
        "score": first_try,
        "completed": completed,
        "items": items_out,
        "retake": None,
        "pool_size": len(item_ids_for_activity(cursor, ctx["type"], ctx["la_id"])),
        # Task 4: the bug has one health point per drawn question.
        "bug_max": standing["slots"],
        "bug_hp": max(0, standing["slots"] - standing["passed"]) if not (play and not is_retake)
                  else max(0, total - correct),
        # Task 5: the browser only draws the bar; the server decides.
        "timer": {
            "limit": ctx["limit"],
            "seconds_left": _seconds_left(ctx, current) if current else ctx["limit"],
            "running": bool(current and current["timer_started_at"] is not None),
            # Pause button: revealed, still in play, clock frozen.
            "held": bool(play and play["status"] == "in_progress" and current
                         and current["shown_at"] is not None and current["timer_started_at"] is None),
        },
        # Task 6
        "leave": {
            "count": (play or {}).get("leave_count") or 0,
            "warned": bool(((play or {}).get("leave_count") or 0) >= 1),
            "min_seconds": setting_int(ctx["settings"], "leave_min_seconds"),
        },
        "events": ctx["events"],
    })
    if is_retake:
        state["retake"] = {
            "retake_id": shown_play["retake_id"],
            "round": _retake_round_no(cursor, shown_play["retake_id"]) or 1,
            "total": total,
            "fixed": correct,
            "completed": shown_play["status"] == "completed",
        }
    return state


# ============================================================
# PUBLIC ENTRY POINTS
# ============================================================
def _valid_recommendation_id(cursor, acc_id, recommendation_id):
    recommendation_id = _to_int(recommendation_id)
    if not recommendation_id:
        return None
    cursor.execute(
        f"SELECT 1 FROM {RECOMMENDATIONS_TABLE} WHERE recommendation_id = %s AND acc_id = %s",
        (recommendation_id, acc_id)
    )
    return recommendation_id if cursor.fetchone() else None


def _run(acc_id, la_id, expected_type, action, label):
    la_id = _to_int(la_id)
    if not la_id:
        return None, "la_id is required."
    connection = get_db_connection()
    if connection is None:
        return None, "Could not connect to the database."
    try:
        if not ensure_play_schema(connection):
            return None, "Could not prepare the game tables - check the Flask console."
        cursor = connection.cursor(dictionary=True)
        ctx = _open(cursor, acc_id, la_id, expected_type)
        if ctx is None:
            connection.rollback()
            cursor.close()
            return None, "This activity is not available."
        _pause_if_out_of_lives(cursor, ctx)
        payload, error_message = action(cursor, ctx)
        if payload is None:
            connection.rollback()
            cursor.close()
            return None, error_message
        save_lives_pool(cursor, ctx["pool"])
        connection.commit()
        cursor.close()
        return payload, None
    except Error as e:
        connection.rollback()
        print(f"game_plays: {label} failed for la_id={la_id}: {e}")
        return None, "Something went wrong. Your progress is saved."
    finally:
        if connection.is_connected():
            connection.close()


def get_state(acc_id, la_id, expected_type=None):
    """Current state; never creates a play or reveals anything."""
    return _run(acc_id, la_id, expected_type, lambda cur, ctx: (build_state(cur, ctx), None), "load state")


def start_play(acc_id, la_id, expected_type=None, boot=False):
    """Start-or-resume, then reveal the current item (see _start_or_resume)."""
    def action(cursor, ctx):
        _start_or_resume(cursor, ctx, boot=boot)
        return build_state(cursor, ctx), None
    return _run(acc_id, la_id, expected_type, action, "start/resume play")


def _is_current(ctx, item_id):
    play = ctx["play"]
    current = _current(ctx) if play else None
    ok = (play is not None and play["status"] == "in_progress" and total_lives(ctx["pool"]) > 0
          and current is not None and current["item_id"] == _to_int(item_id) and current["shown_at"] is not None)
    return current if ok else None


def submit_answer(acc_id, la_id, item_id, data, expected_type=None):
    """
    One attempt. Late (past limit + grace) -> timed_out whatever was sent.
    payload["graded"] False when nothing was graded (not the current item,
    paused, completed) - payload["state"] says where the play really is.
    """
    data = data or {}

    def action(cursor, ctx):
        item = _is_current(ctx, item_id)
        if item is None:
            return {"graded": False, "state": build_state(cursor, ctx)}, None
        row = ctx["rows"][item["item_id"]]
        grace = setting_int(ctx["settings"], "timer_grace_seconds")
        if _elapsed(ctx, item) > ctx["limit"] + grace:
            feedback = _time_out(cursor, ctx, item)
            return {"graded": True, "is_correct": False, "is_close": False, "status": "timed_out",
                    "timed_out": True, "first_try": False, "feedback": feedback,
                    "state": build_state(cursor, ctx)}, None
        result = grade(ctx["type"], row, data)
        if "error" in result:
            return None, result["error"]
        rec_id = _valid_recommendation_id(cursor, ctx["acc_id"], data.get("recommendation_id"))
        outcome = result["outcome"]
        _set_outcome(cursor, ctx, item, outcome)
        attempt_number = _log_answer(cursor, ctx, item, outcome, result["feedback"], result["answer_given"],
                                     result["option_id"], rec_id)
        _after_outcome(cursor, ctx)
        passed = outcome in ("correct", "close")
        payload = {
            "graded": True,
            "status": ANSWER_STATUS[outcome],
            "is_correct": passed,
            "is_close": outcome == "close" or bool(result["extra"].get("is_close")),
            "timed_out": False,
            "first_try": outcome == "correct",
            "attempt_number": attempt_number,
            "feedback": result["feedback"],
            "state": build_state(cursor, ctx),
        }
        if ctx["type"] == FIB_TYPE:
            payload["is_correct"] = outcome == "correct"
            payload["console"] = result["extra"].get("console")
        if ctx["type"] == FLASHCARD_TYPE:
            payload["answer"] = result["extra"].get("answer")
            payload["syntax_error"] = result["extra"].get("syntax_error")
        return payload, None
    return _run(acc_id, la_id, expected_type, action, "grade answer")


def skip_item(acc_id, la_id, item_id, expected_type=None):
    """Skip always costs 1 life and is logged 'skipped' (counts as missed)."""
    def action(cursor, ctx):
        item = _is_current(ctx, item_id)
        if item is None:
            return {"skipped": False, "state": build_state(cursor, ctx)}, None
        row = ctx["rows"][item["item_id"]]
        feedback = _feedback_for(row, "skipped", ctx["type"])
        _set_outcome(cursor, ctx, item, "skipped")
        _log_answer(cursor, ctx, item, "skipped", feedback)
        _after_outcome(cursor, ctx)
        return {"skipped": True, "feedback": feedback, "state": build_state(cursor, ctx)}, None
    return _run(acc_id, la_id, expected_type, action, "skip item")


def time_out_item(acc_id, la_id, item_id, expected_type=None):
    """The bar ran out in the browser - the server checks the clock itself."""
    def action(cursor, ctx):
        item = _is_current(ctx, item_id)
        if item is None or _elapsed(ctx, item) < ctx["limit"] - 2:
            return {"timed_out": False, "state": build_state(cursor, ctx)}, None
        feedback = _time_out(cursor, ctx, item)
        return {"timed_out": True, "feedback": feedback, "state": build_state(cursor, ctx)}, None
    return _run(acc_id, la_id, expected_type, action, "time out item")


def hold_timer(acc_id, la_id, item_id, hold, expected_type=None):
    """
    The game's Pause button. hold=True freezes the current item's clock
    (the seconds used are saved); hold=False starts it again from there.
    The play stays in progress, so leaving the page still counts. Every
    pause charges at least 1 second - pausing over and over can't stretch
    the time.
    """
    def action(cursor, ctx):
        item = _is_current(ctx, item_id)
        if item is not None:
            if hold and item["timer_started_at"] is not None:
                used = (item["time_used_seconds"] or 0) + max(
                    1, int((ctx["now"] - item["timer_started_at"]).total_seconds()))
                item["time_used_seconds"] = used
                item["timer_started_at"] = None
                cursor.execute(
                    f"UPDATE {PLAY_ITEMS_TABLE} SET timer_started_at = NULL, time_used_seconds = %s "
                    f"WHERE play_item_id = %s",
                    (used, item["play_item_id"])
                )
                if _elapsed(ctx, item) > ctx["limit"] + setting_int(ctx["settings"], "timer_grace_seconds"):
                    _time_out(cursor, ctx, item)
            elif not hold:
                _reveal_current(cursor, ctx)
        state = build_state(cursor, ctx)
        return {"held": state["timer"]["held"], "state": state}, None
    return _run(acc_id, la_id, expected_type, action, "pause timer")


def lose_life(acc_id, la_id, expected_type=None):
    """Multiple Choice wall hit / self-bite: -1 life, no answer logged."""
    def action(cursor, ctx):
        play = ctx["play"]
        if play and play["status"] == "in_progress" and total_lives(ctx["pool"]) > 0:
            take_life(ctx["pool"])
            _pause_if_out_of_lives(cursor, ctx)
        return build_state(cursor, ctx), None
    return _run(acc_id, la_id, expected_type, action, "take life")


def report_leave(acc_id, la_id, phase, away_seconds=None, reason=None, expected_type=None):
    """
    phase "start": the page was hidden / lost focus (sent as a beacon) -
                   remembers when.
    phase "end":   the learner is back - counts the leave if it lasted at
                   least leave_min_seconds (server clock; the browser's own
                   figure is used only when the start beacon was lost).
    Only while a play is in progress (not on the 0-lives pause screen).
    """
    def action(cursor, ctx):
        play = ctx["play"]
        event = None
        if play and play["status"] == "in_progress":
            if phase == "start":
                if not play.get("away_since"):
                    cursor.execute(f"UPDATE {PLAYS_TABLE} SET away_since = %s WHERE play_id = %s",
                                   (ctx["now"], play["play_id"]))
                    play["away_since"] = ctx["now"]
            else:
                given = None
                if not play.get("away_since"):
                    try:
                        given = max(0, min(int(float(away_seconds or 0)), 86400))
                    except (TypeError, ValueError):
                        given = 0
                event = _process_leave(cursor, ctx, away_seconds=given, reason=(reason or "hidden")[:30])
        return {"event": event, "state": build_state(cursor, ctx)}, None
    return _run(acc_id, la_id, expected_type, action, "report leave")


def start_retake_play(cursor, acc_id, la_id, activity_type, retake_id, count):
    """Creates the retake play: `count` new items from the shared draw."""
    cursor.execute("SELECT (UTC_TIMESTAMP() + INTERVAL 8 HOUR) AS now")
    now = cursor.fetchone()["now"]
    ids = draw_items(cursor, acc_id, la_id, activity_type, count)
    play_id = create_play(cursor, acc_id, la_id, ids, now, "retake", retake_id)
    return play_id, ids


def open_retake_play(cursor, acc_id, la_id):
    """The learner's unfinished retake play for this activity, or None."""
    cursor.execute(
        f"""SELECT play_id, retake_id FROM {PLAYS_TABLE}
            WHERE acc_id = %s AND la_id = %s AND play_kind = 'retake' AND status <> 'completed'
            ORDER BY play_id DESC LIMIT 1""",
        (acc_id, la_id)
    )
    return cursor.fetchone()


# ============================================================
# MENTOR SIDE: leave counts (Learner Progress)
# ============================================================
def leave_counts(cursor, acc_ids=None):
    """{acc_id: {"total", "warnings", "forfeits", "last_at"}} from the leave log."""
    where, params = "", ()
    if acc_ids:
        where = "WHERE acc_id IN (" + ",".join(["%s"] * len(acc_ids)) + ")"
        params = tuple(acc_ids)
    try:
        cursor.execute(
            f"""SELECT acc_id, COUNT(*) AS total,
                       SUM(action = 'warning') AS warnings,
                       SUM(action <> 'warning') AS forfeits,
                       MAX(left_at) AS last_at
                FROM {LEAVES_TABLE} {where} GROUP BY acc_id""",
            params
        )
    except Error:
        return {}
    out = {}
    for r in cursor.fetchall():
        out[r["acc_id"]] = {"total": int(r["total"] or 0), "warnings": int(r["warnings"] or 0),
                            "forfeits": int(r["forfeits"] or 0), "last_at": r["last_at"]}
    return out


def leave_log(cursor, acc_id, limit=100):
    """One learner's leaves, newest first, with the activity / exercise title."""
    cursor.execute(
        f"""SELECT l.leave_id, l.context, l.la_id, l.exercise_id, l.leave_no, l.action, l.reason,
                   l.away_seconds, l.left_at, l.returned_at,
                   la.activity_title, ce.exercise_title
            FROM {LEAVES_TABLE} l
            LEFT JOIN learning_activities_tbl la ON la.la_id = l.la_id
            LEFT JOIN coding_exercises_tbl ce ON ce.exercise_id = l.exercise_id
            WHERE l.acc_id = %s ORDER BY l.left_at DESC, l.leave_id DESC LIMIT %s""",
        (acc_id, int(limit))
    )
    return cursor.fetchall()
