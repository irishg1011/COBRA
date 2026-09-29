"""
module_performance.py - Module 85% gate
------------------------------------------------------------------------------
A learner may only move on to the next module once the current one is
PASSED:
  1. every lesson in the module is completed (first attempt of every game
     in every lesson done, plus the lesson's own completion rules), and
  2. the AVERAGE of the lessons' performance % is at least PASS_PERCENT.

Lesson performance % = (passed game items + coding exercise points)
                       / (all game items + coding exercise test cases)
where an item is "passed" if its first attempt was correct OR its first
answer in a retake round was correct (see activity_retakes.py). Lessons
with nothing gradeable (no items, no test cases) are left out of the
average. A module with no published lessons passes automatically, so an
empty module can never block the ones after it.

Below 85%, the learner retakes only what they missed - one retake round
per activity, started by start_activity_retake().

Only Published lessons/activities count, same as the Learning Map.
Pure DB helpers + two public entry points that open their own
connection (get_resource_retake_info, start_activity_retake). Never
touches Flask.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from activity_retakes import (
    PASS_PERCENT,
    GAME_TABLES,
    ensure_retake_schema,
    missed_item_ids,
    open_retake,
    create_retake,
)


# ---------------- lessons + completion ----------------
def module_lesson_ids(cursor, module_id):
    """Published lessons (resources) of a module, in display order."""
    cursor.execute(
        """SELECT lr.resource_id
           FROM learning_resources_tbl lr
           JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
           WHERE lr.module_id = %s AND lrs.lr_stats_name = 'Published'
           ORDER BY COALESCE(lr.display_order, 999999) ASC, lr.resource_id ASC""",
        (module_id,)
    )
    return [r["resource_id"] for r in cursor.fetchall()]


def _published_activities(cursor, resource_id):
    cursor.execute(
        """SELECT la.la_id, atp.activity_type_name
           FROM learning_activities_tbl la
           JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
           LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
           WHERE la.resource_id = %s AND las.la_stats_name = 'Published'
           ORDER BY la.activity_type_id ASC, la.la_id ASC""",
        (resource_id,)
    )
    return cursor.fetchall()


def lesson_complete(cursor, acc_id, resource_id):
    """Same rule the Lessons page uses: read + every Published activity done + exercise passed."""
    cursor.execute(
        "SELECT status FROM learner_resource_progress_tbl WHERE acc_id = %s AND resource_id = %s",
        (acc_id, resource_id)
    )
    row = cursor.fetchone()
    if not row or row["status"] != "completed":
        return False

    activities = _published_activities(cursor, resource_id)
    if activities:
        la_ids = [a["la_id"] for a in activities]
        placeholders = ",".join(["%s"] * len(la_ids))
        cursor.execute(
            f"""SELECT COUNT(DISTINCT la_id) AS done FROM learner_activity_progress_tbl
                WHERE acc_id = %s AND status = 'completed' AND la_id IN ({placeholders})""",
            tuple([acc_id] + la_ids)
        )
        if cursor.fetchone()["done"] < len(la_ids):
            return False

    cursor.execute("SELECT exercise_id FROM coding_exercises_tbl WHERE resource_id = %s", (resource_id,))
    for ex in cursor.fetchall():
        cursor.execute(
            "SELECT status FROM learner_exercise_progress_tbl WHERE acc_id = %s AND exercise_id = %s",
            (acc_id, ex["exercise_id"])
        )
        ex_row = cursor.fetchone()
        if not ex_row or ex_row["status"] != "completed":
            return False
    return True


# ---------------- performance ----------------
def _exercise_points(cursor, acc_id, resource_id):
    """(points_earned, points_total) for the lesson's coding exercise - same rule as lesson_summary.py."""
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
        return 0, 0
    exercise_id = row["exercise_id"]
    cursor.execute("SELECT COUNT(*) AS cnt FROM test_cases_tbl WHERE exercise_id = %s", (exercise_id,))
    test_total = cursor.fetchone()["cnt"]
    cursor.execute(
        "SELECT progress_id FROM learner_exercise_progress_tbl WHERE acc_id = %s AND exercise_id = %s",
        (acc_id, exercise_id)
    )
    if cursor.fetchone() is not None:
        return test_total, test_total
    cursor.execute(
        """SELECT test_cases_passed FROM exercise_submissions_tbl
           WHERE acc_id = %s AND exercise_id = %s
           ORDER BY attempt_number DESC LIMIT 1""",
        (acc_id, exercise_id)
    )
    latest = cursor.fetchone()
    return (latest["test_cases_passed"] if latest else 0), test_total


def lesson_performance(cursor, acc_id, resource_id):
    """
    {"percent": int | None, "missed": int, "activities": {la_id: {"type", "missed", "total"}}}
    percent is None when the lesson has nothing gradeable.
    """
    points, total, missed_total = 0, 0, 0
    activities = {}
    for act in _published_activities(cursor, resource_id):
        activity_type = act.get("activity_type_name") or ""
        if activity_type not in GAME_TABLES:
            continue
        missed, item_total = missed_item_ids(cursor, acc_id, activity_type, act["la_id"])
        activities[act["la_id"]] = {"type": activity_type, "missed": len(missed), "total": item_total}
        points += item_total - len(missed)
        total += item_total
        missed_total += len(missed)

    ex_points, ex_total = _exercise_points(cursor, acc_id, resource_id)
    points += ex_points
    total += ex_total

    return {
        "percent": round((points / total) * 100) if total > 0 else None,
        "missed": missed_total,
        "activities": activities,
    }


def module_performance(cursor, acc_id, module_id):
    """
    {
        "percent": int,            # average of the lessons' % (gradeable lessons only)
        "all_done": bool,          # every published lesson completed
        "passed": bool,            # all_done and percent >= PASS_PERCENT
        "needs_retake": bool,      # all_done and not passed
        "pass_percent": int,
        "lessons": {resource_id: {"percent", "missed", "completed"}},
    }
    """
    lesson_ids = module_lesson_ids(cursor, module_id)
    lessons = {}
    percents = []
    all_done = True
    for resource_id in lesson_ids:
        perf = lesson_performance(cursor, acc_id, resource_id)
        done = lesson_complete(cursor, acc_id, resource_id)
        all_done = all_done and done
        lessons[resource_id] = {"percent": perf["percent"], "missed": perf["missed"], "completed": done}
        if perf["percent"] is not None:
            percents.append(perf["percent"])

    percent = round(sum(percents) / len(percents)) if percents else 100
    passed = all_done and percent >= PASS_PERCENT
    return {
        "percent": percent,
        "all_done": all_done,
        "passed": passed,
        "needs_retake": all_done and not passed,
        "pass_percent": PASS_PERCENT,
        "lessons": lessons,
    }


# ---------------- public entry points ----------------
def get_resource_retake_info(acc_id, resource_id):
    """
    Retake info for one lesson's activities (for /api/lesson-activities):
      {"module_needs_retake": bool, "module_percent": int,
       "activities": {la_id: {"missed": int, "open": bool, "round": int | None}}}
    Returns None on any database error (the page then behaves as before).
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        ensure_retake_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT module_id FROM learning_resources_tbl WHERE resource_id = %s", (resource_id,))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return None
        module = module_performance(cursor, acc_id, row["module_id"])
        perf = lesson_performance(cursor, acc_id, resource_id)
        activities = {}
        for la_id, info in perf["activities"].items():
            retake = open_retake(cursor, acc_id, la_id, lock=False)
            activities[la_id] = {
                "missed": info["missed"],
                "open": retake is not None,
                "round": retake["round_no"] if retake else None,
            }
        cursor.close()
        return {
            "module_needs_retake": module["needs_retake"],
            "module_percent": module["percent"],
            "lesson_percent": perf["percent"],
            "activities": activities,
        }
    except Error as e:
        print(f"module_performance: failed to load retake info for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def start_activity_retake(acc_id, la_id):
    """
    Starts (or returns the already-open) retake round for one activity.
    Allowed only when the activity's first play is completed, its module
    is fully done but under PASS_PERCENT, and it still has missed items.
    Returns (payload, error_message):
      payload = {"started": True, "retake": {"retake_id", "round", "item_ids"}}
              | {"started": False, "message": str}
    """
    try:
        la_id = int(la_id)
    except (TypeError, ValueError):
        return None, "la_id is required."

    connection = get_db_connection()
    if connection is None:
        return None, "Could not connect to the database."
    try:
        ensure_retake_schema(connection)   # DDL first - it commits implicitly
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """SELECT lr.module_id, atp.activity_type_name
               FROM learning_activities_tbl la
               JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
               JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
               JOIN learning_resources_tbl lr ON la.resource_id = lr.resource_id
               WHERE la.la_id = %s AND las.la_stats_name = 'Published'""",
            (la_id,)
        )
        activity = cursor.fetchone()
        if not activity or activity["activity_type_name"] not in GAME_TABLES:
            connection.rollback()
            cursor.close()
            return None, "This activity is not available."

        def started(retake):
            return {"started": True, "retake": {
                "retake_id": retake["retake_id"],
                "round": retake["round_no"],
                "item_ids": retake["item_ids"],
            }}

        retake = open_retake(cursor, acc_id, la_id)
        if retake:
            connection.commit()
            cursor.close()
            return started(retake), None

        cursor.execute(
            """SELECT 1 FROM learner_activity_progress_tbl
               WHERE acc_id = %s AND la_id = %s AND status = 'completed' LIMIT 1""",
            (acc_id, la_id)
        )
        if cursor.fetchone() is None:
            connection.rollback()
            cursor.close()
            return {"started": False, "message": "Finish the first attempt of this activity first."}, None

        module = module_performance(cursor, acc_id, activity["module_id"])
        if not module["needs_retake"]:
            connection.rollback()
            cursor.close()
            message = ("This module already passed." if module["passed"]
                       else "Finish every lesson in this module first.")
            return {"started": False, "message": message}, None

        missed, _ = missed_item_ids(cursor, acc_id, activity["activity_type_name"], la_id)
        if not missed:
            connection.rollback()
            cursor.close()
            return {"started": False, "message": "Nothing to retake in this activity."}, None

        retake = create_retake(cursor, acc_id, la_id, missed)
        connection.commit()
        cursor.close()
        return started(retake), None
    except Error as e:
        connection.rollback()
        print(f"module_performance: failed to start retake for la_id={la_id}: {e}")
        return None, "Something went wrong. Your progress is saved."
    finally:
        if connection.is_connected():
            connection.close()