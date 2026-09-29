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

Rules:
  - Grading: exact match with back_text (trimmed) = "correct";
    same apart from capital letters / extra spaces = "close" (accepted,
    no life lost, the exact spelling is shown); anything else =
    "incorrect" (-1 life; the card's back is revealed and the learner
    chooses Try Again (SAME card) or Skip (next card, logged as status
    'skipped' - no life, no score)).
  - Lives: 5 regular (all back 10 min after the first loss) + 5 daily
    bonus lives at 8:00 AM PH time, spent first. Shared by every
    Flashcards activity in every lesson.
  - 0 lives: the play pauses on its card; resuming continues the SAME
    play (no new session row).
  - Saved score = cards answered exactly right on attempt_number 1.
    Completed once every card has a correct/close answer. No replay.

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
def _loose(value):
    """Lower-case with runs of whitespace collapsed - for the 'close' check."""
    return re.sub(r"\s+", " ", (value or "").strip()).lower()


def grade_flashcard(submitted, back_text):
    """'correct' | 'close' | 'incorrect' for a typed answer."""
    submitted = (submitted or "").strip()
    back_text = (back_text or "").strip()
    if not submitted or not back_text:
        return "incorrect"
    if submitted == back_text:
        return "correct"
    if _loose(submitted) == _loose(back_text):
        return "close"
    return "incorrect"


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
        f"""SELECT flashcard_id, front_text, back_text, correct_feedback, incorrect_feedback
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
            WHERE acc_id = %s AND status IN ('correct', 'close', 'skipped')
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


# ---------------- play context ----------------
def _open(cursor, acc_id, la_id):
    """
    Confirms la_id is a Published Flashcards activity, loads its cards,
    locks the learner's Flashcards lives pool (applying the 8 AM reset and
    the 10-minute refill) and their latest play. None if not Flashcards.
    """
    type_id = _published_type_id(cursor, la_id)
    if type_id is None:
        return None
    cards = _load_cards(cursor, la_id)
    card_ids = [c["flashcard_id"] for c in cards]

    # Lock order everywhere: lives pool first, then the session row.
    pool = load_lives_pool(cursor, acc_id, type_id)

    cursor.execute(
        f"""SELECT session_id, current_flashcard_id, score, status
            FROM {FLASHCARD_SESSIONS_TABLE}
            WHERE acc_id = %s AND la_id = %s
            ORDER BY session_id DESC LIMIT 1 FOR UPDATE""",
        (acc_id, la_id)
    )
    session_row = cursor.fetchone()

    cursor.execute(
        f"""SELECT 1 FROM {PROGRESS_TABLE}
            WHERE acc_id = %s AND la_id = %s AND status = 'completed' LIMIT 1""",
        (acc_id, la_id)
    )
    completed = cursor.fetchone() is not None or bool(session_row and session_row["status"] == "completed")

    solved = _solved_ids(cursor, acc_id, card_ids)
    if session_row and session_row["current_flashcard_id"] in card_ids:
        index = card_ids.index(session_row["current_flashcard_id"])
    else:
        index = next((i for i, cid in enumerate(card_ids) if cid not in solved), len(card_ids))

    ctx = {
        "acc_id": acc_id,
        "la_id": la_id,
        "cards": cards,
        "card_ids": card_ids,
        "solved": solved,
        "pool": pool,
        "session": session_row,
        "index": index,
        "completed": completed,
        "retake": None,
    }
    retake = open_retake(cursor, acc_id, la_id)
    if retake:
        _enter_retake(cursor, ctx, retake)
    return ctx


def _enter_retake(cursor, ctx, retake):
    """
    Retake mode (Module 85% gate): an in-progress retake round exists, so
    this play covers ONLY that round's cards. "Solved" = moved past in this
    round; the round's "session" lives in memory (in_progress with lives,
    paused at 0). The normal play's session and first-try score are
    never touched.
    """
    by_id = {c["flashcard_id"]: c for c in ctx["cards"]}
    card_ids = [cid for cid in retake["item_ids"] if cid in by_id]
    done, _ = retake_progress(cursor, ctx["acc_id"], FLASHCARD_TYPE, retake)
    ctx["cards"] = [by_id[cid] for cid in card_ids]
    ctx["card_ids"] = card_ids
    ctx["solved"] = {cid for cid in card_ids if cid in done}
    ctx["index"] = next((i for i, cid in enumerate(card_ids) if cid not in ctx["solved"]), len(card_ids))
    ctx["completed"] = False
    ctx["retake"] = retake
    ctx["session"] = {
        "session_id": None,
        "current_flashcard_id": card_ids[ctx["index"]] if ctx["index"] < len(card_ids) else None,
        "score": 0,
        "status": "in_progress" if total_lives(ctx["pool"]) > 0 else "paused",
    }


def _retake_id(ctx):
    """retake_id to stamp on an answer row (None for the normal play)."""
    return ctx["retake"]["retake_id"] if ctx.get("retake") else None


def _state(cursor, ctx):
    """The only Flashcards state the browser ever receives."""
    card_ids = ctx["card_ids"]
    index = ctx["index"]
    session_row = ctx["session"]
    state = lives_payload(ctx["pool"])
    state.update({
        "session_status": session_row["status"] if session_row else None,
        "current_index": index,
        "current_flashcard_id": card_ids[index] if index < len(card_ids) else None,
        "total": len(card_ids),
        "solved_count": len(ctx["solved"]),
        "first_try_correct": _first_try_score(cursor, ctx["acc_id"], card_ids),
        "completed": ctx["completed"],
        "retake": None,
    })
    retake = ctx.get("retake")
    if retake:
        _, fixed = retake_progress(cursor, ctx["acc_id"], FLASHCARD_TYPE, retake)
        state["retake"] = retake_payload(retake, len(card_ids), len(fixed & set(card_ids)), ctx["completed"])
    return state


def _complete(cursor, ctx):
    """Session -> completed; learner_activity_progress_tbl -> completed + first-try score."""
    if ctx.get("retake"):
        # Retake round finished: only the round closes.
        complete_retake(cursor, ctx["retake"]["retake_id"])
        ctx["session"]["status"] = "completed"
        ctx["completed"] = True
        ctx["index"] = len(ctx["card_ids"])
        return
    acc_id, la_id = ctx["acc_id"], ctx["la_id"]
    score = _first_try_score(cursor, acc_id, ctx["card_ids"])
    session_row = ctx["session"]
    if session_row:
        cursor.execute(
            f"""UPDATE {FLASHCARD_SESSIONS_TABLE}
                SET status = 'completed', score = %s, current_flashcard_id = NULL, completed_at = NOW()
                WHERE session_id = %s""",
            (score, session_row["session_id"])
        )
        session_row["status"] = "completed"

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
    ctx["completed"] = True
    ctx["index"] = len(ctx["card_ids"])


def _pause_if_out_of_lives(cursor, ctx):
    """0 lives -> the in-progress play pauses on its current card (also
    catches lives spent on another Flashcards activity - the pool is shared)."""
    session_row = ctx["session"]
    if (session_row and session_row["status"] == "in_progress"
            and total_lives(ctx["pool"]) <= 0 and not ctx["completed"]):
        if ctx.get("retake"):
            session_row["status"] = "paused"   # retake rounds pause in memory only
            return
        cursor.execute(
            f"UPDATE {FLASHCARD_SESSIONS_TABLE} SET status = 'paused', paused_at = NOW() WHERE session_id = %s",
            (session_row["session_id"],)
        )
        session_row["status"] = "paused"


def _settle_position(cursor, ctx):
    """Finishes the play if every card is already solved (e.g. cards were
    removed after the learner started); re-points a drifted current card."""
    session_row = ctx["session"]
    if not session_row or ctx["completed"]:
        return
    card_ids = ctx["card_ids"]
    if (card_ids or ctx.get("retake")) and all(cid in ctx["solved"] for cid in card_ids):
        _complete(cursor, ctx)
        return
    if card_ids and ctx["index"] >= len(card_ids):
        ctx["index"] = next(i for i, cid in enumerate(card_ids) if cid not in ctx["solved"])
    if ctx.get("retake"):
        return
    if card_ids:
        wanted = card_ids[ctx["index"]]
        if session_row["current_flashcard_id"] != wanted:
            cursor.execute(
                f"UPDATE {FLASHCARD_SESSIONS_TABLE} SET current_flashcard_id = %s WHERE session_id = %s",
                (wanted, session_row["session_id"])
            )
            session_row["current_flashcard_id"] = wanted


def _run(acc_id, la_id, action, error_label):
    """Connection + transaction around action(cursor, ctx) -> (payload, error)."""
    la_id = _to_int(la_id)
    if not la_id:
        return None, "la_id is required."
    connection = get_db_connection()
    if connection is None:
        return None, "Could not connect to the database."
    try:
        if not (ensure_activity_game_schema(connection) and ensure_flashcard_schema(connection)):
            return None, "Could not prepare the Flashcards tables - check the Flask console."
        cursor = connection.cursor(dictionary=True)
        ctx = _open(cursor, acc_id, la_id)
        if ctx is None:
            connection.rollback()
            cursor.close()
            return None, "This activity is not available."

        _settle_position(cursor, ctx)
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
        print(f"lesson_flashcards: {error_label} failed for la_id={la_id}: {e}")
        return None, "Something went wrong. Your progress is saved."
    finally:
        if connection.is_connected():
            connection.close()


def _advance(cursor, ctx, flashcard_id):
    """Marks the card solved and moves to the next unsolved card (or completes)."""
    session_row = ctx["session"]
    card_ids = ctx["card_ids"]
    index = ctx["index"]
    ctx["solved"].add(flashcard_id)
    remaining = [i for i, cid in enumerate(card_ids) if cid not in ctx["solved"]]
    if not remaining:
        _complete(cursor, ctx)
        return
    ctx["index"] = next((i for i in remaining if i > index), remaining[0])
    next_id = card_ids[ctx["index"]]
    if ctx.get("retake"):
        session_row["current_flashcard_id"] = next_id
        return
    cursor.execute(
        f"""UPDATE {FLASHCARD_SESSIONS_TABLE}
            SET current_flashcard_id = %s, score = %s WHERE session_id = %s""",
        (next_id, _first_try_score(cursor, ctx["acc_id"], card_ids), session_row["session_id"])
    )
    session_row["current_flashcard_id"] = next_id


# ---------------- public API ----------------
def get_flashcard_play(acc_id, la_id):
    """
    Cards (front_text only) + current state, with the lives reset/refill
    applied and saved. Never creates a play. Returns (payload, error).
    """
    def action(cursor, ctx):
        return {
            "cards": [_learner_card(c) for c in ctx["cards"]],
            "state": _state(cursor, ctx),
        }, None
    return _run(acc_id, la_id, action, "load flashcard play")


def start_flashcard_play(acc_id, la_id):
    """
    Start-or-resume, the ONLY place a play is created:
      completed -> nothing; in progress -> same play; paused + lives ->
      same play resumes (resumed_at); paused + 0 lives -> stays paused;
      no play + lives -> ONE new play at the first unsolved card;
      no play + 0 lives -> nothing is created.
    Returns (state, error).
    """
    def action(cursor, ctx):
        session_row = ctx["session"]
        lives = total_lives(ctx["pool"])
        if ctx["completed"] or not ctx["card_ids"]:
            return _state(cursor, ctx), None
        if session_row and session_row["status"] == "paused":
            if lives > 0:
                if not ctx.get("retake"):
                    cursor.execute(
                        f"""UPDATE {FLASHCARD_SESSIONS_TABLE}
                            SET status = 'in_progress', resumed_at = NOW() WHERE session_id = %s""",
                        (session_row["session_id"],)
                    )
                session_row["status"] = "in_progress"
        elif not session_row and lives > 0:
            index = min(ctx["index"], len(ctx["card_ids"]) - 1)
            card_id = ctx["card_ids"][index]
            cursor.execute(
                f"""INSERT INTO {FLASHCARD_SESSIONS_TABLE}
                    (acc_id, la_id, current_flashcard_id, score, status, started_at)
                    VALUES (%s, %s, %s, 0, 'in_progress', NOW())""",
                (ctx["acc_id"], ctx["la_id"], card_id)
            )
            ctx["session"] = {
                "session_id": cursor.lastrowid,
                "current_flashcard_id": card_id,
                "score": 0,
                "status": "in_progress",
            }
            ctx["index"] = index
        return _state(cursor, ctx), None
    return _run(acc_id, la_id, action, "start/resume flashcard play")


def submit_flashcard_answer(acc_id, la_id, flashcard_id, answer, recommendation_id=None):
    """
    Grades the typed answer for the current card and appends it to
    flashcard_learner_answers_tbl (attempt_number counts up per
    learner/card, so attempt 1 stays the first attempt).

      correct / close -> next card (or completes the activity)
      incorrect       -> -1 life, SAME card; at 0 lives the play pauses

    back_text ("answer") is returned after the card is answered - for a
    wrong answer too, so the learner can Try Again or Skip - but never
    before the first answer on a card. payload["graded"] is False when nothing was
    graded (no running play, 0 lives, completed, or a different card).
    """
    flashcard_id = _to_int(flashcard_id)
    answer = (answer or "").strip()
    if not flashcard_id:
        return None, "An answer needs flashcard_id."
    if not answer:
        return None, "Type an answer first."

    def action(cursor, ctx):
        session_row = ctx["session"]
        card_ids = ctx["card_ids"]
        index = ctx["index"]
        pool = ctx["pool"]
        if (ctx["completed"] or not session_row or session_row["status"] != "in_progress"
                or total_lives(pool) <= 0 or index >= len(card_ids) or card_ids[index] != flashcard_id):
            return {"graded": False, "state": _state(cursor, ctx)}, None

        card = ctx["cards"][index]
        status = grade_flashcard(answer, card["back_text"])
        if status == "correct":
            feedback = card.get("correct_feedback") or FALLBACK_CORRECT_FEEDBACK
        elif status == "close":
            feedback = CLOSE_FEEDBACK
        else:
            feedback = card.get("incorrect_feedback") or FALLBACK_INCORRECT_FEEDBACK
        rec_id = _valid_recommendation_id(cursor, ctx["acc_id"], recommendation_id)

        cursor.execute(
            f"SELECT COUNT(*) AS cnt FROM {FLASHCARD_ANSWERS_TABLE} WHERE acc_id = %s AND flashcard_id = %s",
            (ctx["acc_id"], flashcard_id)
        )
        attempt_number = cursor.fetchone()["cnt"] + 1
        cursor.execute(
            f"""INSERT INTO {FLASHCARD_ANSWERS_TABLE}
                (acc_id, flashcard_id, answer_given, attempt_number, status, source,
                 recommendation_id, feedback_given, answered_at, retake_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s)""",
            (ctx["acc_id"], flashcard_id, answer[:ANSWER_MAX_LEN], attempt_number, status,
             "recommendation" if rec_id else "self", rec_id, feedback, _retake_id(ctx))
        )

        passed = status in ("correct", "close")
        if passed:
            _advance(cursor, ctx, flashcard_id)
        else:
            take_life(pool)
            _pause_if_out_of_lives(cursor, ctx)

        return {
            "graded": True,
            "status": status,
            "is_correct": passed,
            "is_close": status == "close",
            "first_try": attempt_number == 1 and status == "correct",
            "attempt_number": attempt_number,
            "feedback": feedback,
            "answer": (card["back_text"] or "").strip(),
            "state": _state(cursor, ctx),
        }, None
    return _run(acc_id, la_id, action, "grade flashcard answer")


def skip_flashcard(acc_id, la_id, flashcard_id, from_preview=False):
    """
    Skip the current card. Appends a status 'skipped' row (answer_given
    '', no score) and moves to the next card; skipping the last one
    completes the play.
      - after a wrong answer (from_preview=False): costs no life; needs a
        wrong answer on it first
      - from the card preview (from_preview=True): costs 1 life and needs
        no earlier answer; 0 lives afterwards pauses the play
    payload["skipped"] is False when it wasn't allowed (no running play,
    0 lives, a different card, or - after-wrong skip only - no wrong
    answer on it yet).
    """
    flashcard_id = _to_int(flashcard_id)
    if not flashcard_id:
        return None, "A skip needs flashcard_id."

    def action(cursor, ctx):
        session_row = ctx["session"]
        card_ids = ctx["card_ids"]
        index = ctx["index"]
        allowed = (not ctx["completed"] and session_row and session_row["status"] == "in_progress"
                   and total_lives(ctx["pool"]) > 0 and index < len(card_ids)
                   and card_ids[index] == flashcard_id)
        if allowed and not from_preview:
            cursor.execute(
                f"""SELECT COUNT(*) AS wrong FROM {FLASHCARD_ANSWERS_TABLE}
                    WHERE acc_id = %s AND flashcard_id = %s AND status = 'incorrect'""",
                (ctx["acc_id"], flashcard_id)
            )
            allowed = cursor.fetchone()["wrong"] > 0
        if not allowed:
            return {"skipped": False, "state": _state(cursor, ctx)}, None

        cursor.execute(
            f"SELECT COUNT(*) AS cnt FROM {FLASHCARD_ANSWERS_TABLE} WHERE acc_id = %s AND flashcard_id = %s",
            (ctx["acc_id"], flashcard_id)
        )
        attempt_number = cursor.fetchone()["cnt"] + 1
        cursor.execute(
            f"""INSERT INTO {FLASHCARD_ANSWERS_TABLE}
                (acc_id, flashcard_id, answer_given, attempt_number, status, source,
                 recommendation_id, feedback_given, answered_at, retake_id)
                VALUES (%s, %s, '', %s, 'skipped', 'self', NULL, NULL, NOW(), %s)""",
            (ctx["acc_id"], flashcard_id, attempt_number, _retake_id(ctx))
        )
        if from_preview:
            take_life(ctx["pool"])
        _advance(cursor, ctx, flashcard_id)
        if from_preview:
            _pause_if_out_of_lives(cursor, ctx)
        return {"skipped": True, "state": _state(cursor, ctx)}, None
    return _run(acc_id, la_id, action, "skip flashcard")