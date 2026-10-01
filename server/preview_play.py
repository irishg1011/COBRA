"""
preview_play.py - Admin "play it like a learner" preview
------------------------------------------------------------------
Backs /admin/preview-play: the REAL learner games (Multiple Choice cobra
arena, Fill in the Blanks, Flashcards) and the REAL coding exercise
screen, run in preview mode by an admin. The learner JS talks to the
admin mirror routes in admin_routes.py, which call into this file and
get back the SAME response shapes as the learner routes.

WHAT PREVIEW MEANS HERE
- No locks: any activity / exercise opens directly (any status except
  Archived; the lesson walkthrough is Ready to Publish + Published only).
- Unlimited lives: lives always come back full and never go down, so a
  wrong answer never ends the game.
- Nothing saved: this file only ever SELECTs. Every bit of play state
  (current question, items solved, attempts, first-try count) lives in
  the Flask session under PREVIEW_SESSION_KEY - never in the database.

Answers are graded by the learner side's own functions
(lesson_activities.check_mcq_answer, lesson_fill_blanks.compare_fib_answer,
lesson_flashcards.grade_flashcard, publishing_preview.grade_preview_exercise)
and items are shaped by the learner side's own helpers, so preview can
never drift from what a learner sees.

This file never touches Flask directly except through the `store` dict
the routes pass in (the session's preview entry).
"""

from datetime import datetime
from mysql.connector import Error
from cobradb import get_db_connection
from lesson_activities import (
    check_mcq_answer, get_chapter_terrain, lives_payload, MAX_LIVES, MCQ_TYPE_NAME,
)
from lesson_fill_blanks import (
    compare_fib_answer, _load_items as load_fib_items, _learner_item as learner_fib_item,
    FIB_TYPE_NAME, CLOSE_FEEDBACK as FIB_CLOSE_FEEDBACK,
    FALLBACK_CORRECT_FEEDBACK as FIB_CORRECT_FEEDBACK,
    FALLBACK_INCORRECT_FEEDBACK as FIB_INCORRECT_FEEDBACK,
)
from lesson_flashcards import (
    grade_flashcard, _load_cards as load_flashcards, _learner_card as learner_flashcard,
    FLASHCARD_TYPE_NAME, CLOSE_FEEDBACK as FC_CLOSE_FEEDBACK,
    FALLBACK_CORRECT_FEEDBACK as FC_CORRECT_FEEDBACK,
    FALLBACK_INCORRECT_FEEDBACK as FC_INCORRECT_FEEDBACK,
    ANSWER_MAX_LEN as FC_ANSWER_MAX_LEN,
)
from publishing_preview import PREVIEW_STATUSES, get_preview_exercise

PREVIEW_SESSION_KEY = "cobra_preview_play"

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
ACTIVITY_TYPES_TABLE = "activity_types_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
CODING_EXERCISES_TABLE = "coding_exercises_tbl"
TEST_CASES_TABLE = "test_cases_tbl"
MCQ_QUESTIONS_TABLE = "mcq_questions_tbl"
MCQ_OPTIONS_TABLE = "mcq_options_tbl"
FILL_BLANKS_TABLE = "fill_blanks_tbl"
FLASHCARDS_TABLE = "flashcards_tbl"

NOT_AVAILABLE = "This activity is not available."


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _full_lives():
    """Lives payload with every life left and no refill timer running."""
    return lives_payload({"lives": MAX_LIVES, "bonus": 0, "regen_at": None, "db_now": datetime.now()})


def _activity_select():
    return (f"""SELECT la.la_id, la.activity_title, la.points, la.activity_type_id, la.resource_id,
                       atp.activity_type_name, COALESCE(las.la_stats_name, 'Draft') AS status_name
                FROM {LEARNING_ACTIVITIES_TABLE} la
                LEFT JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
                LEFT JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id""")


def _open_activity(cursor, la_id, type_name):
    """The activity row if la_id is a non-Archived activity of type_name, else None."""
    cursor.execute(
        _activity_select() + """
            WHERE la.la_id = %s AND COALESCE(las.la_stats_name, '') != 'Archived'
              AND atp.activity_type_name = %s""",
        (la_id, type_name)
    )
    return cursor.fetchone()


# ============================================================
# SCOPE - which activities / exercise one preview covers
# ============================================================
def resolve_scope(args):
    """
    Works out what a preview URL covers. args is the request's query
    args (la_id | resource_id + activity_type | exercise_id |
    resource_id + scope=walkthrough).

    Returns (scope, error_message). scope = {"resource_id", "la_ids",
    "exercise_id", "walkthrough"}.
    """
    la_id = _to_int(args.get("la_id"))
    exercise_id = _to_int(args.get("exercise_id"))
    resource_id = _to_int(args.get("resource_id"))
    activity_type = (args.get("activity_type") or "").strip()
    walkthrough = (args.get("scope") or "") == "walkthrough"

    connection = get_db_connection()
    if connection is None:
        return None, "Could not connect to the database."
    try:
        cursor = connection.cursor(dictionary=True)
        scope = {"resource_id": None, "la_ids": [], "exercise_id": None, "walkthrough": False}

        if la_id:
            cursor.execute(
                _activity_select() + " WHERE la.la_id = %s AND COALESCE(las.la_stats_name, '') != 'Archived'",
                (la_id,)
            )
            row = cursor.fetchone()
            if not row:
                cursor.close()
                return None, NOT_AVAILABLE
            scope.update(resource_id=row["resource_id"], la_ids=[row["la_id"]])

        elif exercise_id:
            cursor.execute(
                f"""SELECT ce.exercise_id, ce.resource_id
                    FROM {CODING_EXERCISES_TABLE} ce
                    LEFT JOIN {LA_STATS_TABLE} las ON ce.exercise_stats_id = las.la_stats_id
                    WHERE ce.exercise_id = %s AND COALESCE(ce.is_archived, 0) = 0
                      AND COALESCE(las.la_stats_name, '') != 'Archived'""",
                (exercise_id,)
            )
            row = cursor.fetchone()
            if not row:
                cursor.close()
                return None, "This exercise is not available."
            scope.update(resource_id=row["resource_id"], exercise_id=row["exercise_id"])

        elif resource_id and walkthrough:
            placeholders = ", ".join(["%s"] * len(PREVIEW_STATUSES))
            cursor.execute(
                _activity_select() + f"""
                    WHERE la.resource_id = %s AND COALESCE(las.la_stats_name, '') IN ({placeholders})
                    ORDER BY la.activity_type_id ASC, la.la_id ASC""",
                (resource_id,) + PREVIEW_STATUSES
            )
            la_ids = [r["la_id"] for r in cursor.fetchall()]
            exercise = get_preview_exercise(resource_id)
            scope.update(resource_id=resource_id, la_ids=la_ids, walkthrough=True,
                         exercise_id=exercise["exercise_id"] if exercise else None)

        elif resource_id and activity_type:
            cursor.execute(
                _activity_select() + """
                    WHERE la.resource_id = %s AND atp.activity_type_name = %s
                      AND COALESCE(las.la_stats_name, '') != 'Archived'
                    ORDER BY la.la_id ASC""",
                (resource_id, activity_type)
            )
            la_ids = [r["la_id"] for r in cursor.fetchall()]
            if not la_ids:
                cursor.close()
                return None, f"This lesson has no {activity_type} activity to preview."
            scope.update(resource_id=resource_id, la_ids=la_ids)

        else:
            cursor.close()
            return None, "Nothing to preview."

        cursor.close()
        return scope, None
    except Error as e:
        print(f"preview_play: failed to resolve preview scope: {e}")
        return None, "Could not load this preview."
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# LESSON SHELL + ACTIVITIES LIST (same shapes as the learner routes)
# ============================================================
def _exercise_by_id(cursor, exercise_id):
    """Exercise + test inputs only (never expected_output), any status but Archived."""
    cursor.execute(
        f"""SELECT ce.exercise_id, ce.exercise_title, ce.points, ce.instruction,
                   ce.situation, ce.problem_question, ce.clue
            FROM {CODING_EXERCISES_TABLE} ce
            LEFT JOIN {LA_STATS_TABLE} las ON ce.exercise_stats_id = las.la_stats_id
            WHERE ce.exercise_id = %s AND COALESCE(ce.is_archived, 0) = 0
              AND COALESCE(las.la_stats_name, '') != 'Archived'""",
        (exercise_id,)
    )
    exercise = cursor.fetchone()
    if not exercise:
        return None
    cursor.execute(
        f"""SELECT test_case_id, test_order, test_input
            FROM {TEST_CASES_TABLE}
            WHERE exercise_id = %s
            ORDER BY test_order ASC, test_case_id ASC""",
        (exercise_id,)
    )
    exercise["test_cases"] = cursor.fetchall()
    return exercise


def get_preview_lesson(scope):
    """
    /api/lesson-content's shape for the preview page: no video, no
    reading content, every step already "crossed", nothing completed.
    has_activities tells the page whether to open on Activities.
    Returns None on a database error.
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT resource_id, resource_title FROM {LEARNING_RESOURCES_TABLE} WHERE resource_id = %s",
            (scope["resource_id"],)
        )
        resource = cursor.fetchone() or {"resource_id": scope["resource_id"], "resource_title": "Preview"}
        exercise = _exercise_by_id(cursor, scope["exercise_id"]) if scope["exercise_id"] else None
        cursor.close()
        return {
            "resource_id": resource["resource_id"],
            "resource_title": resource["resource_title"],
            "cat_id": None,
            "content_html": "",
            "video": None,
            "exercise": exercise,
            "exercise_completed": False,
            "exercise_last_submission": None,
            "is_completed": False,
            "progress": {"video_watched": True, "content_read": True},
            "has_activities": bool(scope["la_ids"]),
        }
    except Error as e:
        print(f"preview_play: failed to load preview lesson: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_preview_activities(scope):
    """
    The activities in this preview, shaped exactly like
    lesson_activities.get_published_activities_for_resource() (never the
    correct answers), with completed=False and retake=None so the games
    always start fresh. Returns [] on a database error.
    """
    if not scope["la_ids"]:
        return []
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        cursor = connection.cursor(dictionary=True)
        placeholders = ",".join(["%s"] * len(scope["la_ids"]))
        cursor.execute(
            _activity_select() + f" WHERE la.la_id IN ({placeholders}) ORDER BY la.activity_type_id ASC, la.la_id ASC",
            tuple(scope["la_ids"])
        )
        rows = cursor.fetchall()
        terrain = get_chapter_terrain(cursor, scope["resource_id"]) if rows else "land"

        results = []
        for row in rows:
            la_id = row["la_id"]
            activity_type = row.get("activity_type_name") or ""
            entry = {
                "la_id": la_id,
                "activity_title": row["activity_title"],
                "activity_type": activity_type,
                "activity_type_id": row.get("activity_type_id"),
                "terrain": terrain,
                "points": row.get("points") or 0,
                "items": [],
                "completed": False,
                "retake": None,
            }
            if activity_type == MCQ_TYPE_NAME:
                cursor.execute(
                    f"SELECT q_id, question_text FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s ORDER BY sort_order ASC, q_id ASC",
                    (la_id,)
                )
                for q in cursor.fetchall():
                    cursor.execute(
                        f"""SELECT option_id, option_letter, option_text
                            FROM {MCQ_OPTIONS_TABLE} WHERE q_id = %s ORDER BY option_letter ASC""",
                        (q["q_id"],)
                    )
                    entry["items"].append({
                        "q_id": q["q_id"],
                        "question_text": q["question_text"],
                        "options": [
                            {"option_id": o["option_id"], "option_letter": o["option_letter"], "text": o["option_text"]}
                            for o in cursor.fetchall()
                        ],
                    })
            elif activity_type == FIB_TYPE_NAME:
                cursor.execute(
                    f"SELECT fib_id, content FROM {FILL_BLANKS_TABLE} WHERE la_id = %s ORDER BY fib_id ASC",
                    (la_id,)
                )
                for r in cursor.fetchall():
                    entry["items"].append({"fib_id": r["fib_id"], "content": r["content"]})
            elif activity_type == FLASHCARD_TYPE_NAME:
                cursor.execute(
                    f"SELECT flashcard_id, front_text, back_text FROM {FLASHCARDS_TABLE} WHERE la_id = %s ORDER BY flashcard_id ASC",
                    (la_id,)
                )
                for r in cursor.fetchall():
                    entry["items"].append({"flashcard_id": r["flashcard_id"], "front": r["front_text"], "back": r["back_text"]})
            results.append(entry)

        cursor.close()
        return results
    except Error as e:
        print(f"preview_play: failed to load preview activities: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# PLAY STATE (Flask session only)
# ============================================================
def _play(store, la_id):
    """This activity's in-memory play, created fresh on first use."""
    key = str(la_id)
    if key not in store:
        store[key] = {"started": False, "index": 0, "solved": [], "attempts": {},
                      "wrong": [], "first_try": 0, "completed": False}
    return store[key]


def _attempt(play, item_id):
    """Counts one more attempt on item_id and returns its number (1 = first try)."""
    key = str(item_id)
    play["attempts"][key] = play["attempts"].get(key, 0) + 1
    return play["attempts"][key]


def _load_ids(la_id, type_name, loader):
    """(activity_row, items) for a non-Archived activity of type_name, or (None, None)."""
    connection = get_db_connection()
    if connection is None:
        return None, None
    try:
        cursor = connection.cursor(dictionary=True)
        row = _open_activity(cursor, la_id, type_name)
        items = loader(cursor, la_id) if row else None
        cursor.close()
        return row, items
    except Error as e:
        print(f"preview_play: failed to load la_id={la_id}: {e}")
        return None, None
    finally:
        if connection.is_connected():
            connection.close()


# ---------------- Multiple Choice ----------------
def _mcq_q_ids(cursor, la_id):
    cursor.execute(
        f"SELECT q_id FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s ORDER BY sort_order ASC, q_id ASC",
        (la_id,)
    )
    return [r["q_id"] for r in cursor.fetchall()]


def _mcq_state(play, q_ids):
    index = min(play["index"], len(q_ids))
    status = "completed" if play["completed"] else ("in_progress" if play["started"] else None)
    state = _full_lives()
    state.update({
        "session_status": status,
        "current_index": index,
        "current_q_id": q_ids[index] if index < len(q_ids) else None,
        "total": len(q_ids),
        "score": play["first_try"],
        "completed": play["completed"],
        "retake": None,
    })
    return state


def _mcq_advance(play, q_ids):
    play["index"] += 1
    if play["index"] >= len(q_ids):
        play["completed"] = True


def preview_mcq(store, la_id, action, data=None):
    """
    Mirrors get_mcq_activity_state / play_mcq_activity / submit_mcq_answer /
    skip_mcq_question / lose_mcq_life. action: state | play | answer |
    skip | lose-life. Returns (payload, error_message).
    """
    la_id = _to_int(la_id)
    if not la_id:
        return None, "la_id is required."
    row, q_ids = _load_ids(la_id, MCQ_TYPE_NAME, _mcq_q_ids)
    if row is None:
        return None, NOT_AVAILABLE
    data = data or {}
    play = _play(store, la_id)
    running = play["started"] and not play["completed"]

    if action == "state" or action == "lose-life":
        # A wall hit / self-bite costs nothing in preview.
        return _mcq_state(play, q_ids), None

    if action == "play":
        if not play["completed"] and q_ids:
            play["started"] = True
        return _mcq_state(play, q_ids), None

    q_id = _to_int(data.get("q_id"))
    on_question = running and play["index"] < len(q_ids) and q_ids[play["index"]] == q_id

    if action == "answer":
        option_id = _to_int(data.get("option_id"))
        if not q_id or not option_id:
            return None, "An answer needs q_id and option_id."
        if not on_question:
            return {"graded": False, "state": _mcq_state(play, q_ids)}, None
        is_correct, feedback, _ = check_mcq_answer(q_id, option_id)
        attempt_number = _attempt(play, q_id)
        if is_correct:
            if attempt_number == 1:
                play["first_try"] += 1
            _mcq_advance(play, q_ids)
        elif q_id not in play["wrong"]:
            play["wrong"].append(q_id)
        return {
            "graded": True,
            "is_correct": is_correct,
            "attempt_number": attempt_number,
            "feedback": feedback or "",
            "state": _mcq_state(play, q_ids),
        }, None

    if action == "skip":
        if not q_id:
            return None, "A skip needs q_id."
        from_preview = data.get("from_preview") is True
        allowed = on_question and (from_preview or q_id in play["wrong"])
        if allowed:
            _attempt(play, q_id)
            _mcq_advance(play, q_ids)
        return {"skipped": bool(allowed), "state": _mcq_state(play, q_ids)}, None

    return None, "Unknown action."


# ---------------- Fill in the Blanks ----------------
def _fib_state(play, total):
    index = min(play["index"], total)
    state = _full_lives()
    state.update({
        "current_index": index,
        "total": total,
        "solved_count": len(play["solved"]),
        "first_try_correct": play["first_try"],
        "completed": play["completed"],
        "retake": None,
    })
    return state


def _fib_next(play, fib_ids):
    play["index"] = next((i for i, fid in enumerate(fib_ids) if fid not in play["solved"]), len(fib_ids))
    play["completed"] = play["index"] >= len(fib_ids)


def preview_fib(store, la_id, action, data=None):
    """
    Mirrors get_fib_play / submit_fib_answer / skip_fib_item.
    action: play | answer | skip. Returns (payload, error_message).
    """
    la_id = _to_int(la_id)
    if not la_id:
        return None, "la_id is required."
    row, items = _load_ids(la_id, FIB_TYPE_NAME, load_fib_items)
    if row is None:
        return None, f"Activity {la_id} is not a Fill in the Blanks activity."
    data = data or {}
    play = _play(store, la_id)
    fib_ids = [r["fib_id"] for r in items]
    total = len(fib_ids)

    if action == "play":
        return {"items": [learner_fib_item(r) for r in items], "state": _fib_state(play, total)}, None

    fib_id = _to_int(data.get("fib_id"))
    on_item = not play["completed"] and play["index"] < total and fib_ids[play["index"]] == fib_id

    if action == "answer":
        answer = (data.get("answer") or "").strip()
        if not fib_id:
            return None, "A fill-in-the-blank answer needs la_id and fib_id."
        if not answer:
            return None, "Fill in the blank before checking."
        if not on_item:
            return {"graded": False, "state": _fib_state(play, total)}, None
        item = items[play["index"]]
        result = compare_fib_answer(answer, item.get("correct_answer"))
        is_correct = result == "correct"
        is_close = result == "close"
        # Same feedback priority as submit_fib_answer().
        if is_correct:
            feedback = item.get("correct_feedback") or FIB_CORRECT_FEEDBACK
        elif is_close:
            feedback = f"{FIB_CLOSE_FEEDBACK} {item.get('incorrect_feedback') or ''}".strip()
        else:
            feedback = item.get("incorrect_feedback") or FIB_INCORRECT_FEEDBACK
        attempt_number = _attempt(play, fib_id)
        if is_correct:
            if attempt_number == 1:
                play["first_try"] += 1
            play["solved"].append(fib_id)
            play["index"] += 1
            play["completed"] = play["index"] >= total
        elif fib_id not in play["wrong"]:
            play["wrong"].append(fib_id)
        return {
            "graded": True,
            "is_correct": is_correct,
            "is_close": is_close,
            "first_try": is_correct and attempt_number == 1,
            "feedback": feedback,
            "state": _fib_state(play, total),
        }, None

    if action == "skip":
        if not fib_id:
            return None, "A skip needs la_id and fib_id."
        from_preview = data.get("from_preview") is True
        allowed = on_item and (from_preview or fib_id in play["wrong"])
        if allowed:
            _attempt(play, fib_id)
            play["solved"].append(fib_id)
            _fib_next(play, fib_ids)
        return {"skipped": bool(allowed), "state": _fib_state(play, total)}, None

    return None, "Unknown action."


# ---------------- Flashcards ----------------
def _fc_state(play, card_ids):
    index = min(play["index"], len(card_ids))
    status = "completed" if play["completed"] else ("in_progress" if play["started"] else None)
    state = _full_lives()
    state.update({
        "session_status": status,
        "current_index": index,
        "current_flashcard_id": card_ids[index] if index < len(card_ids) else None,
        "total": len(card_ids),
        "solved_count": len(play["solved"]),
        "first_try_correct": play["first_try"],
        "completed": play["completed"],
        "retake": None,
    })
    return state


def _fc_advance(play, card_ids, flashcard_id):
    """Same order as lesson_flashcards._advance(): next unsolved after this one, wrapping."""
    if flashcard_id not in play["solved"]:
        play["solved"].append(flashcard_id)
    remaining = [i for i, cid in enumerate(card_ids) if cid not in play["solved"]]
    if not remaining:
        play["completed"] = True
        play["index"] = len(card_ids)
        return
    play["index"] = next((i for i in remaining if i > play["index"]), remaining[0])


def preview_flashcards(store, la_id, action, data=None):
    """
    Mirrors get_flashcard_play / start_flashcard_play /
    submit_flashcard_answer / skip_flashcard.
    action: play | start | answer | skip. Returns (payload, error_message).
    """
    la_id = _to_int(la_id)
    if not la_id:
        return None, "la_id is required."
    row, cards = _load_ids(la_id, FLASHCARD_TYPE_NAME, load_flashcards)
    if row is None:
        return None, NOT_AVAILABLE
    data = data or {}
    play = _play(store, la_id)
    card_ids = [c["flashcard_id"] for c in cards]

    if action == "play":
        return {"cards": [learner_flashcard(c) for c in cards], "state": _fc_state(play, card_ids)}, None

    if action == "start":
        if not play["completed"] and card_ids:
            play["started"] = True
        return _fc_state(play, card_ids), None

    flashcard_id = _to_int(data.get("flashcard_id"))
    running = play["started"] and not play["completed"]
    on_card = running and play["index"] < len(card_ids) and card_ids[play["index"]] == flashcard_id

    if action == "answer":
        answer = (data.get("answer") or "").strip()[:FC_ANSWER_MAX_LEN]
        if not flashcard_id:
            return None, "An answer needs flashcard_id."
        if not answer:
            return None, "Type an answer first."
        if not on_card:
            return {"graded": False, "state": _fc_state(play, card_ids)}, None
        card = cards[play["index"]]
        status = grade_flashcard(answer, card["back_text"])
        # Same feedback choice as submit_flashcard_answer().
        if status == "correct":
            feedback = card.get("correct_feedback") or FC_CORRECT_FEEDBACK
        elif status == "close":
            feedback = FC_CLOSE_FEEDBACK
        else:
            feedback = card.get("incorrect_feedback") or FC_INCORRECT_FEEDBACK
        attempt_number = _attempt(play, flashcard_id)
        passed = status in ("correct", "close")
        if passed:
            if attempt_number == 1 and status == "correct":
                play["first_try"] += 1
            _fc_advance(play, card_ids, flashcard_id)
        elif flashcard_id not in play["wrong"]:
            play["wrong"].append(flashcard_id)
        return {
            "graded": True,
            "status": status,
            "is_correct": passed,
            "is_close": status == "close",
            "first_try": attempt_number == 1 and status == "correct",
            "attempt_number": attempt_number,
            "feedback": feedback,
            "answer": (card["back_text"] or "").strip() if passed else None,
            "state": _fc_state(play, card_ids),
        }, None

    if action == "skip":
        if not flashcard_id:
            return None, "A skip needs flashcard_id."
        from_preview = data.get("from_preview") is True
        allowed = on_card and (from_preview or flashcard_id in play["wrong"])
        if allowed:
            _attempt(play, flashcard_id)
            _fc_advance(play, card_ids, flashcard_id)
        return {"skipped": bool(allowed), "state": _fc_state(play, card_ids)}, None

    return None, "Unknown action."


# ============================================================
# TALLY - the walkthrough's summary step
# ============================================================
def preview_tally(store, scope):
    """
    [{"title", "score", "total"}] for this preview's activities (score =
    first-try count, None if not finished) plus the last exercise result.
    Read from the session's preview state only.
    """
    rows = []
    for activity in get_preview_activities(scope):
        play = store.get(str(activity["la_id"])) or {}
        rows.append({
            "title": activity["activity_title"],
            "score": play.get("first_try") if play.get("completed") else None,
            "total": len(activity["items"]),
        })
    exercise = None
    if scope["exercise_id"]:
        exercise = (store.get("exercises") or {}).get(str(scope["exercise_id"]))
    return {"activities": rows, "exercise": exercise}
