"""
lesson_fill_blanks.py - Fill in the Blanks: Data Access, Lives & Grading
------------------------------------------------------------------------------
Everything the Fill in the Blanks activity needs on the server, kept in
one self-contained module so it never depends on (or changes) the
Multiple Choice cobra-arena code.

Learner rules - since feat/question-pool-draw every rule of a play lives
in game_plays.py (shared by the three games); what follows is the older
description of the lives pool, still accurate:
  - Lives are a per-activity-type POOL shared across all lessons, kept
    in the same learner_lives_tbl as every game (row for the Fill in the
    Blanks activity_type_id) and run by lesson_activities.py's shared
    helpers: 5 regular lives, all refilled 10 minutes after the first
    one is lost, plus 5 bonus lives every day at 8:00 AM PH time (spent
    first, never refilled by the timer). fib_learner_lives_tbl from the
    first build is no longer used.
  - Wrong answer: -1 life, logged, and the play MOVES ON to the next item
    (adviser's rule: the first answer is what counts; a missed item is
    fixed later in a retake round). Correct answer: next item.
  - At 0 lives the play pauses on its current item; the learner can go
    review the lesson and resumes the same play once a life is back.
  - The current item is derived from the answer log: the first item (in
    sort order) not answered (right or wrong) or skipped yet. No position
    column.
  - Saved score = first-attempt correct count (attempt_number = 1).
    Completed once every item is answered or skipped. No replay.
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
from learner_shuffle import order_rows, activity_scope  # feat/learner-shuffle

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
                   correct_feedback, incorrect_feedback,
                   code_text, expected_output, hint, must_contain
            FROM {FILL_BLANKS_TABLE} WHERE la_id = %s AND is_removed = 0
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
      solved_ids        fib_ids already answered (right or wrong) or skipped
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
        if r["status"] in ("correct", "incorrect", "skipped"):
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
# feat/fib-console: CONSOLE ITEMS (Task 8)
# ------------------------------------------------------------
# An item has a Question (instruction), a Code-with-blank (code_text), the
# Expected Output and a Hint, plus an optional Must contain. The learner's
# answer goes into the blank and the code REALLY runs (code_sandbox.run_once,
# one short run with a time limit); it is correct when the output matches
# the expected output by the coding exercises' own rule
# (exercise_tips.normalize_output) and any must-contain text is in the
# answer. Items saved before this release have no code_text: they keep the
# old text-match grading, unchanged.
# ============================================================
def fill_blank(code, answer):
    """The code with its first blank (___ / [___]) replaced by `answer`."""
    code = str(code or "").replace("\r\n", "\n")
    match = re.search(r"\[?_{3,}\]?", code)
    if not match:
        return code
    return code[:match.start()] + answer + code[match.end():]


def run_fib_code(code, answer):
    """{"output", "error", "timed_out"} for the code with `answer` in its blank."""
    from code_sandbox import run_once
    return run_once(fill_blank(code, answer))


# An item may END in an error on purpose (e.g. "which error does this raise?"):
# the error's last line counts as part of the output. A syntax error never
# does - code that is not valid Python gives the same result for any answer.
UNRUNNABLE_ERRORS = ("SyntaxError", "IndentationError", "TabError")


def error_line(error):
    """'NameError: name 'x' is not defined' - the last line of a traceback."""
    lines = [line.strip() for line in str(error or "").splitlines() if line.strip()]
    return lines[-1] if lines else ""


def run_result_text(run):
    """
    (text, problem): what the run printed plus, when it stopped with an
    error, that error's last line. problem is a message (never a valid
    expected output) for a time-out or a syntax error, else "".
    """
    from exercise_tips import normalize_output
    output = normalize_output(run["output"])
    if not run["error"]:
        return output, ""
    line = error_line(run["error"])
    if run.get("timed_out") or not line or line.split(":")[0].strip() in UNRUNNABLE_ERRORS:
        return output, run["error"]
    return normalize_output(f"{output}\n{line}" if output else line), ""


def fib_choices_for_learner(row):
    """The tiles (correct answer mixed in, unmarked) or [] -> the learner types."""
    wrong = parse_fib_choices(row.get("answer_choices"))
    correct = (row.get("correct_answer") or "").strip()
    if not (wrong and correct):
        return []
    choices = [correct] + [c for c in wrong if c != correct]
    random.shuffle(choices)
    return choices


def grade_fib_item(row, answer):
    """
    {"outcome": correct|wrong, "is_close", "system_feedback", "console"}.
    console (console items only): {"output", "error"} - the learner's REAL
    result; the correct answer is never part of it.
    """
    from exercise_tips import normalize_output, output_feedback, error_feedback
    code = (row.get("code_text") or "").strip()
    if not code:
        result = compare_fib_answer(answer, row.get("correct_answer"))
        if result == "correct":
            return {"outcome": "correct", "is_close": False, "system_feedback": FALLBACK_CORRECT_FEEDBACK}
        if result == "close":
            extra = row.get("incorrect_feedback") or ""
            return {"outcome": "wrong", "is_close": True, "system_feedback": f"{CLOSE_FEEDBACK} {extra}".strip()}
        return {"outcome": "wrong", "is_close": False, "system_feedback": FALLBACK_INCORRECT_FEEDBACK}

    run = run_fib_code(code, answer)
    console = {"output": normalize_output(run["output"]), "error": run["error"]}
    must = (row.get("must_contain") or "").strip()
    expected = normalize_output(row.get("expected_output") or "")
    actual, problem = run_result_text(run)
    if run["error"] and (problem or actual != expected):
        return {"outcome": "wrong", "is_close": False, "console": console,
                "system_feedback": error_feedback(run["error"])}
    hint = output_feedback(actual, expected)
    if hint is not None:
        return {"outcome": "wrong", "is_close": False, "console": console, "system_feedback": hint}
    if must and must not in answer:
        return {"outcome": "wrong", "is_close": False, "console": console,
                "system_feedback": "The output matches, but this blank needs the code the question asks for - "
                                   "not the printed result."}
    return {"outcome": "correct", "is_close": False, "console": console,
            "system_feedback": FALLBACK_CORRECT_FEEDBACK}


def check_fib_item_for_save(code, correct_answer, expected_output):
    """
    Mentor save check: fills the blank with the correct answer and runs it.
    Returns (ok, actual_output, error_text).
    """
    from exercise_tips import normalize_output
    run = run_fib_code(code, correct_answer)
    actual, problem = run_result_text(run)
    if problem:
        return False, actual, problem
    return actual == normalize_output(expected_output or ""), actual, ""


# ============================================================
# PLAY (feat/question-pool-draw) - game_plays.py runs every rule:
# 5 drawn items per play, one attempt, timer, leaving the page, retakes.
# ============================================================
def get_fib_play(acc_id, la_id):
    """
    Current state (never creates a play) with the play's items: revealed
    items in full (learner-safe), the rest as {"fib_id", "hidden": True}.
    Returns (payload, error_message, http_status).
    """
    from game_plays import get_state
    state, error = get_state(acc_id, la_id, FIB_TYPE_NAME)
    if state is None:
        return None, error, (404 if error == "This activity is not available." else 400)
    return {"items": state["items"], "state": state}, None, 200


def start_fib_play(acc_id, la_id, boot=False):
    """Start-or-resume the ONE play and reveal its current item."""
    from game_plays import start_play
    state, error = start_play(acc_id, la_id, FIB_TYPE_NAME, boot=boot)
    if state is None:
        return None, error
    return {"items": state["items"], "state": state}, None


def submit_fib_answer(acc_id, la_id, fib_id, answer):
    """One attempt (see game_plays.submit_answer); the answer is never sent back."""
    from game_plays import submit_answer
    return submit_answer(acc_id, la_id, fib_id, {"answer": answer}, FIB_TYPE_NAME)


def skip_fib_item(acc_id, la_id, fib_id, from_preview=True):
    """Skip always costs 1 life and is logged 'skipped'."""
    from game_plays import skip_item
    return skip_item(acc_id, la_id, fib_id, FIB_TYPE_NAME)
