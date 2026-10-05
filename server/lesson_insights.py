"""
lesson_insights.py - Automatic strengths & weaknesses for one lesson
------------------------------------------------------------------------------
"Strong" vs "Needs work" for a learner in one lesson, worked out
automatically from their FIRST-TRY results compared with the lesson the
mentor uploaded. No outside service and no AI key: the same input always
gives the same, explainable result (so it also works offline).

Each kind of activity measures a different skill:

    Multiple Choice     Concepts & definitions   (content, context, terms)
    Fill in the Blanks  Code structure           (syntax, writing the code)
    Flashcards          Reading code output      (what the code prints)
    Coding Exercise     Applying the lesson      (the challenge)

  - games: first-try correct items / items (a Flashcards "close" answer
    counts as right, like the game itself)
  - exercise: one item - right when the FIRST submission was correct
  - a skill is STRONG at STRONG_PERCENT or higher, NEEDS WORK below
  - a skill is left out when the lesson has no such activity, or the
    learner has not answered any of it yet

For every "needs work" skill the lesson parts behind the misses are
named, using the same matching as the recommendations (weak_spots: each
missed item -> the part of the lesson content that teaches it).

    lesson_insights(cursor, acc_id, resource_id, groups=None) -> dict
        groups: weak_spots._build() groups already built by the caller
                (the Module Review passes them); built here otherwise.
    get_lesson_insights(acc_id, resource_id) -> dict
        same, with its own connection (lesson Summary, admin modal)

Pure DB helpers, caller's cursor, never raises (an error -> no insights).
"""

from mysql.connector import Error

from cobradb import get_db_connection
from activity_retakes import GAME_TABLES, MCQ_TYPE, FIB_TYPE, FLASHCARD_TYPE, item_ids_for_activity
from weak_spots import _course_lessons, _build, _published_game_activities
from learner_exercise import exercise_score, EXERCISE_ITEMS

STRONG_PERCENT = 80
EXERCISE_KEY = "exercise"

SKILLS = {
    MCQ_TYPE: {"key": "concepts", "label": "Concepts & definitions", "source": "Multiple Choice"},
    FIB_TYPE: {"key": "structure", "label": "Code structure", "source": "Fill in the Blanks"},
    FLASHCARD_TYPE: {"key": "output", "label": "Reading code output", "source": "Flashcards"},
    EXERCISE_KEY: {"key": "applying", "label": "Applying the lesson", "source": "Coding Exercise"},
}
SKILL_ORDER = [MCQ_TYPE, FIB_TYPE, FLASHCARD_TYPE, EXERCISE_KEY]

# One plain sentence per skill - what "strong" / "needs work" means for it.
STRONG_TEXT = {
    "concepts": "You understand the ideas and terms in this lesson.",
    "structure": "You can write the code structure correctly.",
    "output": "You can tell what the code will print.",
    "applying": "You can put the lesson together to solve a problem.",
}
WEAK_TEXT = {
    "concepts": "Review the explanations and definitions in this lesson.",
    "structure": "Practise writing the code: syntax, symbols and order.",
    "output": "Trace the code step by step to predict what it prints.",
    "applying": "Practise combining the lesson's steps to solve a problem.",
}


def _first_try_counts(cursor, acc_id, activity_type, item_ids):
    """(answered, right) on the FIRST attempt for these items."""
    if not item_ids:
        return 0, 0
    answers_table, id_col, _, _ = GAME_TABLES[activity_type]
    placeholders = ",".join(["%s"] * len(item_ids))
    cursor.execute(
        f"""SELECT status FROM {answers_table}
            WHERE acc_id = %s AND attempt_number = 1 AND {id_col} IN ({placeholders})""",
        tuple([acc_id] + list(item_ids))
    )
    rows = cursor.fetchall()
    right_statuses = ("correct", "close") if activity_type == FLASHCARD_TYPE else ("correct",)
    right = sum(1 for r in rows if (r["status"] if isinstance(r, dict) else r[0]) in right_statuses)
    return len(rows), right


def _exercise_first_try(cursor, acc_id, resource_id):
    """(items total, items right on the first submission, attempts, skipped for now) or None.
    An exercise is one item (learner_exercise.EXERCISE_ITEMS): right when the first attempt was correct."""
    cursor.execute(
        """SELECT ce.exercise_id
           FROM coding_exercises_tbl ce
           JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
           WHERE ce.resource_id = %s AND las.la_stats_name = 'Published'
             AND COALESCE(ce.is_archived, 0) = 0
           ORDER BY ce.exercise_id DESC LIMIT 1""",
        (resource_id,)
    )
    row = cursor.fetchone()
    if not row:
        return None
    cursor.execute(
        """SELECT status FROM exercise_submissions_tbl
           WHERE acc_id = %s AND exercise_id = %s AND status <> 'skipped'
           ORDER BY attempt_number ASC, submission_id ASC""",
        (acc_id, row["exercise_id"])
    )
    subs = cursor.fetchall()
    if not subs:
        return None
    skipped = exercise_score(cursor, acc_id, row["exercise_id"])["skipped"]
    first_right = EXERCISE_ITEMS if subs[0]["status"] == "correct" else 0
    return EXERCISE_ITEMS, first_right, len(subs), skipped


def _weak_parts(groups, resource_id):
    """{activity_type: [part headings, in lesson order]} for items missed in this lesson."""
    parts = {}
    for g in groups or []:
        for item in g["items"]:
            if item.get("from_resource_id") != resource_id:
                continue
            headings = parts.setdefault(item["activity_type"], [])
            label = g["heading"] if g["resource_id"] == resource_id else f'{g["heading"]} ({g["lesson_title"]})'
            if label not in headings:
                headings.append(label)
    return parts


def lesson_insights(cursor, acc_id, resource_id, groups=None):
    """
    {
      "strong_percent": 80,
      "skills": [{"key", "label", "source", "right", "total", "percent", "strong",
                  "text", "parts": [...], "attempts"?}],
      "strong": [...same dicts...], "weak": [...]
    }
    Empty lists when nothing has been answered yet. Never raises.
    """
    resource_id = int(resource_id)
    empty = {"strong_percent": STRONG_PERCENT, "skills": [], "strong": [], "weak": []}
    try:
        per_type = {}
        for act in _published_game_activities(cursor, resource_id):
            activity_type = act["activity_type_name"]
            ids = item_ids_for_activity(cursor, activity_type, act["la_id"])
            answered, right = _first_try_counts(cursor, acc_id, activity_type, ids)
            entry = per_type.setdefault(activity_type, {"total": 0, "answered": 0, "right": 0})
            entry["total"] += len(ids)
            entry["answered"] += answered
            entry["right"] += right

        exercise = _exercise_first_try(cursor, acc_id, resource_id)
        if exercise:
            total, passed, attempts, skipped = exercise
            per_type[EXERCISE_KEY] = {"total": total, "answered": total, "right": passed,
                                      "attempts": attempts, "skipped": skipped}

        if groups is None and any(t != EXERCISE_KEY for t in per_type):
            course = _course_lessons(cursor)
            lesson = next((l for l in course if l["resource_id"] == resource_id), None)
            groups = _build(cursor, acc_id, [lesson], course) if lesson else []
        weak_parts = _weak_parts(groups, resource_id)

        skills = []
        for activity_type in SKILL_ORDER:
            data = per_type.get(activity_type)
            if not data or not data["total"] or not data["answered"]:
                continue
            meta = SKILLS[activity_type]
            percent = round(data["right"] / data["total"] * 100)
            # A skipped exercise is always "needs work" until it's passed.
            strong = percent >= STRONG_PERCENT and not data.get("skipped")
            skill = {
                **meta,
                "right": data["right"],
                "total": data["total"],
                "percent": percent,
                "strong": strong,
                "text": STRONG_TEXT[meta["key"]] if strong else WEAK_TEXT[meta["key"]],
                "parts": [] if strong else weak_parts.get(activity_type, []),
            }
            if "attempts" in data:
                skill["attempts"] = data["attempts"]
            if data.get("skipped"):
                skill["skipped"] = True
                skill["text"] = "You skipped this exercise for now. Try it again - passing it gives full credit."
            skills.append(skill)

        return {
            "strong_percent": STRONG_PERCENT,
            "skills": skills,
            "strong": [s for s in skills if s["strong"]],
            "weak": [s for s in skills if not s["strong"]],
        }
    except Error as e:
        print(f"lesson_insights: could not build insights for {acc_id} / {resource_id}: {e}")
        return empty


def get_lesson_insights(acc_id, resource_id):
    """lesson_insights() with its own connection - for the lesson Summary and
    the admin/mentor Learner Progress modal. Never raises."""
    empty = {"strong_percent": STRONG_PERCENT, "skills": [], "strong": [], "weak": []}
    connection = get_db_connection()
    if connection is None:
        return empty
    try:
        cursor = connection.cursor(dictionary=True)
        result = lesson_insights(cursor, acc_id, resource_id)
        cursor.close()
        return result
    finally:
        if connection.is_connected():
            connection.close()
