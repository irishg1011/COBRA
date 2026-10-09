"""
lesson_flashcards.py - Flashcards ("Cobra's Card Duel"): Data, Lives & Grading
------------------------------------------------------------------------------
Everything the Flashcards game needs on the server, in one module - the
same shape as lesson_fill_blanks.py and the Multiple Choice arena.

Source tables (unchanged):
  flashcards_tbl                  front_text (prompt) / back_text (answer)
                                  + correct_feedback / incorrect_feedback
  flashcard_learner_answers_tbl   every typed answer, append-only
                                  (attempt_number 1 = first attempt, used
                                  by recommendations)
  learner_lives_tbl               the Flashcards lives pool (shared helpers
                                  in lesson_activities.py)
  learner_activity_progress_tbl   written ONLY on completion
New (created lazily, see ensure_flashcard_schema()):
  flashcard_activity_sessions_tbl one row per play: current card,
                                  in_progress / paused / completed, times

Rules (every play rule now lives in game_plays.py - feat/question-pool-draw):
  - Grading: exact match with back_text (trimmed) = "correct";
    same apart from capital letters / extra spaces = "close" (accepted,
    no life lost, the exact spelling is shown); anything else =
    "incorrect" (-1 life, and the play MOVES ON to the next card -
    adviser's rule: the first answer counts; a missed card is fixed later
    in a retake round).
  - Lives: 5 regular (all back 10 min after the first loss) + 5 daily
    bonus lives at 8:00 AM PH time, spent first. Shared by every
    Flashcards activity in every lesson.
  - 0 lives: the play pauses on its card; resuming continues the SAME
    play (no new session row).
  - Saved score = cards answered exactly right on attempt_number 1.
    Completed once every card is answered (right or wrong) or skipped.
    No replay.

learner_flashcard_routes.py turns these into HTTP responses.
"""

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
    FLASHCARD_TYPE, open_retake, retake_progress, complete_retake, retake_payload,
)
from learner_shuffle import order_rows, activity_scope  # feat/learner-shuffle

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
ACTIVITY_TYPES_TABLE = "activity_types_tbl"
ACCOUNT_TABLE = "account_tbl"
FLASHCARDS_TABLE = "flashcards_tbl"
FLASHCARD_ANSWERS_TABLE = "flashcard_learner_answers_tbl"
FLASHCARD_SESSIONS_TABLE = "flashcard_activity_sessions_tbl"
PROGRESS_TABLE = "learner_activity_progress_tbl"
RECOMMENDATIONS_TABLE = "lesson_recommendations_tbl"

FLASHCARD_TYPE_NAME = "Flashcards"
ANSWER_MAX_LEN = 255           # flashcard_learner_answers_tbl.answer_given is varchar(255)

CLOSE_FEEDBACK = "So close! Only the capital letters or spacing are different."
FALLBACK_CORRECT_FEEDBACK = "Nice recall - that's the card's answer."
FALLBACK_INCORRECT_FEEDBACK = "Not quite. Think about the card again and try once more."

_flashcard_schema_ensured = False


def ensure_flashcard_schema(connection):
    """
    Lazily creates flashcard_activity_sessions_tbl (idempotent, once per
    process). CREATE TABLE commits implicitly, so callers run this BEFORE
    writing anything on `connection`.
    """
    global _flashcard_schema_ensured
    if _flashcard_schema_ensured:
        return True
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {FLASHCARD_SESSIONS_TABLE} (
                    session_id INT(10) NOT NULL AUTO_INCREMENT,
                    acc_id VARCHAR(15) NOT NULL,
                    la_id INT(10) NOT NULL,
                    current_flashcard_id INT(10) DEFAULT NULL,
                    score INT(5) NOT NULL DEFAULT 0,
                    status VARCHAR(20) NOT NULL,
                    started_at DATETIME NOT NULL,
                    paused_at DATETIME DEFAULT NULL,
                    resumed_at DATETIME DEFAULT NULL,
                    completed_at DATETIME DEFAULT NULL,
                    PRIMARY KEY (session_id),
                    KEY idx_fcsess_acc_la (acc_id, la_id),
                    KEY fk_fcsess_la_id (la_id),
                    CONSTRAINT fk_fcsess_account_id FOREIGN KEY (acc_id)
                        REFERENCES {ACCOUNT_TABLE} (acc_id),
                    CONSTRAINT fk_fcsess_la_id FOREIGN KEY (la_id)
                        REFERENCES {LEARNING_ACTIVITIES_TABLE} (la_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        cursor.close()
        _flashcard_schema_ensured = True
        return True
    except Error as e:
        print(f"lesson_flashcards: failed to ensure flashcard schema: {e}")
        return False


# ---------------- grading ----------------
def _norm_text(val):
    if not val:
        return ""
    # Normalize CRLF/CR to LF and strip trailing whitespace on each line
    lines = [line.rstrip() for line in val.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    return "\n".join(lines).strip()


def _loose(value):
    """Lower-case with runs of whitespace collapsed - for the 'close' check."""
    return re.sub(r"\s+", " ", (value or "").strip()).lower()


def grade_flashcard(submitted, back_text):
    """'correct' | 'close' | 'incorrect' for a typed answer."""
    submitted = _norm_text(submitted)
    back_text = _norm_text(back_text)
    if not submitted or not back_text:
        return "incorrect"
    if submitted == back_text:
        return "correct"
    if _loose(submitted) == _loose(back_text):
        return "close"
    return "incorrect"


# ---------------- code answers: show the real syntax error ----------------
_CODE_CHARS = set("()[]{}=:'\"")


def answer_syntax_error(answer, back_text):
    """
    When the card's answer is Python code (e.g. print("hi")), a wrong answer
    that is not valid Python gets the real SyntaxError, like the console in
    Fill in the Blanks. None for word answers ("Jupiter") or valid code.
    Only parsed (ast), never run.
    """
    import ast
    back = _norm_text(back_text)
    if not back or not any(ch in _CODE_CHARS for ch in back):
        return None
    try:
        ast.parse(back)
    except (SyntaxError, ValueError):
        return None   # the back is not code
    try:
        ast.parse(_norm_text(answer))
        return None
    except SyntaxError as e:
        lines = [f'File "<your answer>", line {e.lineno or 1}']
        if e.text:
            lines.append("    " + e.text.rstrip("\n"))
            if e.offset:
                lines.append("    " + " " * max(0, e.offset - 1) + "^")
        lines.append(f"SyntaxError: {e.msg}")
        return "\n".join(lines)
    except ValueError as e:
        return f"SyntaxError: {e}"


# ---------------- small helpers ----------------
def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _published_type_id(cursor, la_id):
    """activity_type_id of la_id if it's a Published Flashcards activity, else None."""
    cursor.execute(
        f"""SELECT la.activity_type_id
            FROM {LEARNING_ACTIVITIES_TABLE} la
            JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
            JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
            WHERE la.la_id = %s AND las.la_stats_name = 'Published'
              AND atp.activity_type_name = %s""",
        (la_id, FLASHCARD_TYPE_NAME)
    )
    row = cursor.fetchone()
    return row["activity_type_id"] if row else None


def _load_cards(cursor, la_id):
    cursor.execute(
        f"""SELECT flashcard_id, front_text, back_text, correct_feedback, incorrect_feedback, hint
            FROM {FLASHCARDS_TABLE} WHERE la_id = %s ORDER BY flashcard_id ASC""",
        (la_id,)
    )
    return cursor.fetchall()


def _learner_card(row):
    """What the browser may see of a card - never back_text."""
    return {"flashcard_id": row["flashcard_id"], "front_text": row["front_text"] or ""}


def _solved_ids(cursor, acc_id, card_ids):
    if not card_ids:
        return set()
    placeholders = ",".join(["%s"] * len(card_ids))
    cursor.execute(
        f"""SELECT DISTINCT flashcard_id FROM {FLASHCARD_ANSWERS_TABLE}
            WHERE acc_id = %s AND status IN ('correct', 'close', 'incorrect', 'skipped')
              AND flashcard_id IN ({placeholders})""",
        tuple([acc_id] + card_ids)
    )
    return {r["flashcard_id"] for r in cursor.fetchall()}


def _first_try_score(cursor, acc_id, card_ids):
    """Cards answered exactly right on attempt_number = 1."""
    if not card_ids:
        return 0
    placeholders = ",".join(["%s"] * len(card_ids))
    cursor.execute(
        f"""SELECT COUNT(*) AS cnt FROM {FLASHCARD_ANSWERS_TABLE}
            WHERE acc_id = %s AND attempt_number = 1 AND status = 'correct'
              AND flashcard_id IN ({placeholders})""",
        tuple([acc_id] + card_ids)
    )
    return cursor.fetchone()["cnt"]


def _valid_recommendation_id(cursor, acc_id, recommendation_id):
    recommendation_id = _to_int(recommendation_id)
    if not recommendation_id:
        return None
    cursor.execute(
        f"SELECT 1 FROM {RECOMMENDATIONS_TABLE} WHERE recommendation_id = %s AND acc_id = %s",
        (recommendation_id, acc_id)
    )
    return recommendation_id if cursor.fetchone() else None


# ---------------- play (feat/question-pool-draw) ----------------
# game_plays.py runs every rule (5 drawn cards per play, one attempt,
# timer, leaving the page, retakes); these keep the route names.
def get_flashcard_play(acc_id, la_id):
    """Cards of the current play (revealed ones in full, the rest hidden) + state."""
    from game_plays import get_state
    state, error = get_state(acc_id, la_id, FLASHCARD_TYPE_NAME)
    if state is None:
        return None, error
    return {"cards": state["items"], "state": state}, None


def start_flashcard_play(acc_id, la_id, boot=False):
    """Start-or-resume the ONE play and reveal its current card."""
    from game_plays import start_play
    return start_play(acc_id, la_id, FLASHCARD_TYPE_NAME, boot=boot)


def submit_flashcard_answer(acc_id, la_id, flashcard_id, answer, recommendation_id=None):
    """One attempt (see game_plays.submit_answer)."""
    from game_plays import submit_answer
    return submit_answer(acc_id, la_id, flashcard_id, {"answer": answer, "recommendation_id": recommendation_id},
                         FLASHCARD_TYPE_NAME)


def skip_flashcard(acc_id, la_id, flashcard_id, from_preview=True):
    """Skip always costs 1 life and is logged 'skipped'."""
    from game_plays import skip_item
    return skip_item(acc_id, la_id, flashcard_id, FLASHCARD_TYPE_NAME)
