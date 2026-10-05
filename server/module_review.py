"""
module_review.py - Module Review (the card at the end of every module)
------------------------------------------------------------------------------
Once a learner has finished every lesson of a module, the Lessons page
shows one more card after the lessons: the MODULE REVIEW. It is where
the learner's recommendations live (they used to sit on every lesson
Summary). It shows, grouped by lesson:

  - every item they missed (first try wrong or skipped, not fixed in a
    retake round yet - activity_retakes.missed_item_ids, same as before)
  - what they answered and the feedback the game gave them
  - the part of the lesson content that teaches it (weak_spots matching)
  - "Retake missed items" for that lesson while the module is below the
    pass mark
  - the coding exercise result (attempts it took)

States (module_review_state):
  not_ready     some lessons of the module are not finished yet
  needs_retake  every lesson finished, module average below PASS_PERCENT -
                this card is the required next step; the next module stays
                locked (module_performance gate, unchanged)
  passed        every lesson finished and the module passed - the review
                is optional practice and the next module is open

The CORRECT answer is never shown (not even once the module is passed):
the learner gets their own answer and the game's feedback instead.

Opening the review marks its recommendations as viewed (In Progress on
the mentor's Recommendations page), through weak_spots._save_recommendations.

Pure DB helpers + public entry points that open their own connection.
Never touches Flask.
"""

from mysql.connector import Error

from cobradb import get_db_connection
from learner_exercise import exercise_score
from activity_retakes import ensure_retake_schema
from module_performance import (
    module_performance, module_lesson_ids, live_module_ids, module_locked_for_learner,
)
from weak_spots import _course_lessons, _build, _save_recommendations, _published_game_activities
from lesson_summary import get_next_lesson_info
from lesson_insights import lesson_insights

STATE_NOT_READY = "not_ready"
STATE_NEEDS_RETAKE = "needs_retake"
STATE_PASSED = "passed"


def module_review_state(perf):
    """not_ready | needs_retake | passed, from a module_performance() result."""
    if not perf["all_done"]:
        return STATE_NOT_READY
    return STATE_PASSED if perf["passed"] else STATE_NEEDS_RETAKE


def module_review_summary(cursor, acc_id, module_id, perf=None):
    """
    Small status block for lists (Lessons page card, admin / mentor pages):
      {"state", "percent", "pass_percent", "missed", "lessons_left"}
    """
    if perf is None:
        perf = module_performance(cursor, acc_id, module_id)
    lessons = perf["lessons"].values()
    return {
        "state": module_review_state(perf),
        "percent": perf["percent"],
        "pass_percent": perf["pass_percent"],
        "missed": sum((l.get("missed") or 0) for l in lessons),
        "lessons_left": sum(1 for l in lessons if not l.get("completed")),
    }


def _item_result(your_answer):
    """wrong | skipped | unanswered - shown next to each missed item number."""
    if your_answer == "Skipped":
        return "skipped"
    return "wrong" if your_answer else "unanswered"


def _module_row(cursor, module_id):
    cursor.execute(
        """SELECT m.module_id, m.module_name, m.description, m.cat_id, c.category_name
           FROM modules_tbl m
           JOIN category_tbl c ON c.cat_id = m.cat_id
           WHERE m.module_id = %s""",
        (module_id,)
    )
    return cursor.fetchone()


def _exercise_result(cursor, acc_id, resource_id):
    """{"title", "attempts", "passed", "skipped"} for the lesson's published exercise, or None."""
    cursor.execute(
        """SELECT ce.exercise_id, ce.exercise_title
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
    score = exercise_score(cursor, acc_id, row["exercise_id"])
    return {"title": row["exercise_title"], "attempts": score["attempts"],
            "passed": score["passed"], "skipped": score["skipped"]}


def get_module_review(acc_id, module_id):
    """
    Everything the Module Review page shows. Returns (payload, http_status).
    """
    connection = get_db_connection()
    if connection is None:
        return {"success": False, "message": "Could not connect to database."}, 500

    try:
        ensure_retake_schema(connection)
        cursor = connection.cursor(dictionary=True)

        module = _module_row(cursor, module_id)
        live_ids = live_module_ids(cursor, module["cat_id"]) if module else []
        if not module or module_id not in live_ids:
            cursor.close()
            return {"success": False, "message": "This module is not available."}, 404
        if module_locked_for_learner(cursor, acc_id, module_id):
            cursor.close()
            return {"success": False, "locked": True, "cat_id": module["cat_id"],
                    "message": "This module is locked. Pass the previous module first."}, 403

        perf = module_performance(cursor, acc_id, module_id)
        state = module_review_state(perf)
        course = _course_lessons(cursor)
        by_id = {l["resource_id"]: l for l in course}
        lesson_ids = [rid for rid in module_lesson_ids(cursor, module_id) if rid in by_id]

        base = {
            "success": True,
            "module_id": module_id,
            "module_name": module["module_name"],
            "module_number": live_ids.index(module_id) + 1,
            "cat_id": module["cat_id"],
            "category_name": module["category_name"],
            "state": state,
            "percent": perf["percent"],
            "pass_percent": perf["pass_percent"],
            "lessons_left": sum(1 for l in perf["lessons"].values() if not l["completed"]),
        }
        if state == STATE_NOT_READY:
            cursor.close()
            return {**base, "lessons": [], "missed_total": 0, "next": None}, 200

        passed = state == STATE_PASSED
        groups = _build(cursor, acc_id, [by_id[rid] for rid in lesson_ids], course)

        # weak_spots groups items by the PART to re-read; the review shows
        # them by the LESSON they were asked in. Each lesson lists its parts
        # ONCE (with the item numbers they cover) - an item only points to
        # its part by key, so the same lesson text is never repeated.
        items_by_lesson = {}
        parts_by_lesson = {}
        for g in groups:
            for item in g["items"]:
                rid = item["from_resource_id"]
                parts = parts_by_lesson.setdefault(rid, [])
                key = f'{g["resource_id"]}:{g["heading"]}'
                part = next((p for p in parts if p["key"] == key), None)
                if part is None:
                    part = {
                        "key": key,
                        "resource_id": g["resource_id"],
                        "lesson_title": g["lesson_title"],
                        "heading": g["heading"],
                        "html": g["html"],
                        "is_other_lesson": g["resource_id"] != rid,
                        "labels": [],
                    }
                    parts.append(part)
                part["labels"].append(item["label"])
                items_by_lesson.setdefault(rid, []).append({
                    "label": item["label"],
                    "activity_type": item["activity_type"],
                    "prompt": item["prompt"],
                    "result": _item_result(item["your_answer"]),
                    "your_answer": "" if item["your_answer"] == "Skipped" else item["your_answer"],
                    "feedback": item["feedback"],
                    "part_key": key,
                    "part_heading": g["heading"],
                })

        # Items in activity order: MCQ 1, MCQ 2, ... (weak_spots returns them by part).
        def _item_order(item):
            label_number = item["label"].rsplit(" ", 1)[-1]
            return (item["activity_type"], int(label_number) if label_number.isdigit() else 0)
        for items in items_by_lesson.values():
            items.sort(key=_item_order)

        lessons_out = []
        for number, rid in enumerate(lesson_ids, start=1):
            lesson_perf = perf["lessons"].get(rid) or {}
            items = items_by_lesson.get(rid, [])
            lessons_out.append({
                "resource_id": rid,
                "number": number,
                "title": by_id[rid]["resource_title"],
                "percent": lesson_perf.get("percent"),
                "missed": len(items),
                "can_retake": state == STATE_NEEDS_RETAKE and len(items) > 0,
                "has_games": bool(_published_game_activities(cursor, rid)),
                "items": items,
                "parts": parts_by_lesson.get(rid, []),
                "exercise": _exercise_result(cursor, acc_id, rid),
                # Strong / Needs work, worked out automatically (lesson_insights.py)
                "insights": lesson_insights(cursor, acc_id, rid, groups),
            })

        # Opening the review = the learner looked at these recommendations.
        if groups:
            titles = {l["resource_id"]: l["resource_title"] for l in course}
            _save_recommendations(cursor, acc_id, module_id, groups, titles,
                                  viewed_keys={(g["resource_id"], g["heading"]) for g in groups})
            connection.commit()
        cursor.close()

        # Where "Continue" leads once the module is passed (next module / chapter).
        next_info = get_next_lesson_info(lesson_ids[-1], acc_id) if (passed and lesson_ids) else None

        return {
            **base,
            "lessons": lessons_out,
            "missed_total": sum(l["missed"] for l in lessons_out),
            "next": next_info,
        }, 200

    except Error as e:
        try:
            connection.rollback()
        except Error:
            pass
        print(f"module_review: failed to build review for {acc_id} / module {module_id}: {e}")
        return {"success": False, "message": "Could not load your module review."}, 500
    finally:
        if connection.is_connected():
            connection.close()
