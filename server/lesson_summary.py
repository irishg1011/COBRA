"""
lesson_summary.py - Learner-Side Lesson Summary & Performance Calculation
------------------------------------------------------------------------------
Pure DB-access helpers backing the Summary step on lesson-content.html:
a read-only recap of everything the learner did in this lesson (video,
content, each activity's score, the exercise result) plus an overall
Performance %.

Performance % (feat/grade-50-50) = 50% ACTIVITIES + 50% LESSON CONTENT:
all correct items of every activity + the passed exercise (one item), POOLED
over all items + the exercise (adviser's rule), is worth 50, and going through the lesson content
(reading it, and watching the video when there is one) is worth the
other 50 - so a learner who finished the lesson never sees 0%, even
with every answer wrong. The rule itself lives in
module_performance.lesson_grade_percent(); nothing is calculated twice.

Design call worth knowing: for the Exercise, if it's already been
COMPLETED (learner_exercise_progress_tbl has a row), the summary always
shows full credit for it - even if a later, separate re-attempt failed
(e.g. resubmitting broken code just to see what happens). Once you've
proven you can do it, that stands - matching the same "resolved stays
resolved" philosophy already used for lesson_recommendations_tbl. Only
an exercise that's NEVER been passed shows its latest (still-failing)
attempt as partial credit.

This file never touches Flask/session state directly - learner_routes.py
is the only place these get turned into HTTP responses, matching the
project's existing convention.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from activity_retakes import ensure_retake_schema, DRAW_SIZE
from module_performance import module_performance, lesson_grade_percent, lesson_content_progress
from learner_exercise import exercise_score


def get_lesson_performance_summary(acc_id, resource_id):
    """
    Returns a dict describing this learner's results for `resource_id`:
        {
            "video_watched": bool,
            "content_read": bool,
            "activities": [
                {"la_id", "activity_title", "activity_type", "score", "total", "completed"}, ...
            ],
            "exercise": {"exercise_title", "points_earned", "points_total", "completed"} | None,
            "graded_points": float,
            "graded_total": int,
            "performance_percent": int | None,  # 50% activities + 50% lesson content;
                                                # None if this lesson has nothing gradeable at all
        }
    Returns None on any database error.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT video_watched_at, content_read_at FROM learner_resource_progress_tbl WHERE acc_id = %s AND resource_id = %s",
            (acc_id, resource_id)
        )
        progress = cursor.fetchone() or {}

        cursor.execute(
            """SELECT la.la_id, la.activity_title, atp.activity_type_name
               FROM learning_activities_tbl la
               JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
               LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
               WHERE la.resource_id = %s AND las.la_stats_name = 'Published'
               ORDER BY la.la_id ASC""",
            (resource_id,)
        )
        activity_rows = cursor.fetchall()

        activities_out = []
        graded_points = 0.0
        graded_total = 0
        # graded_points / graded_total (pooled over every game item and
        # the exercise, one item) are the ACTIVITY half of the grade - see
        # module_performance.lesson_grade_percent().

        for row in activity_rows:
            la_id = row["la_id"]
            activity_type = row.get("activity_type_name") or ""

            if activity_type in ("Multiple Choice", "Quiz"):
                cursor.execute("SELECT COUNT(*) AS cnt FROM mcq_questions_tbl WHERE la_id = %s AND is_removed = 0", (la_id,))
            elif activity_type == "Fill in the Blanks":
                cursor.execute("SELECT COUNT(*) AS cnt FROM fill_blanks_tbl WHERE la_id = %s AND is_removed = 0", (la_id,))
            elif activity_type == "Flashcards":
                cursor.execute("SELECT COUNT(*) AS cnt FROM flashcards_tbl WHERE la_id = %s AND is_removed = 0", (la_id,))
            else:
                cursor.execute("SELECT 0 AS cnt")
            # feat/question-pool-draw: a play draws DRAW_SIZE (5) of the pool
            item_total = min(DRAW_SIZE, cursor.fetchone()["cnt"])

            cursor.execute(
                "SELECT status, score FROM learner_activity_progress_tbl WHERE acc_id = %s AND la_id = %s",
                (acc_id, la_id)
            )
            prog_row = cursor.fetchone()
            completed = bool(prog_row and prog_row["status"] == "completed")
            score = prog_row["score"] if prog_row else 0

            activities_out.append({
                "la_id": la_id,
                "activity_title": row["activity_title"],
                "activity_type": activity_type,
                "score": score,
                "total": item_total,
                "completed": completed,
            })

            if item_total > 0:
                graded_points += score
                graded_total += item_total

        exercise_out = None
        from exercise_pool import assigned_exercise_row   # feat/exercise-pool: their own exercise
        exercise_row = assigned_exercise_row(cursor, acc_id, resource_id)
        if exercise_row:
            exercise_id = exercise_row["exercise_id"]

            # One item (feat/output-based-exercises): earned when the latest attempt is correct.
            ex_score = exercise_score(cursor, acc_id, exercise_id)
            ex_completed = ex_score["passed"]
            points_earned = ex_score["earned"]

            exercise_out = {
                "exercise_title": exercise_row["exercise_title"],
                "points_earned": points_earned,
                "points_total": ex_score["total"],
                "completed": ex_completed,
                "skipped": ex_score["skipped"],
            }

            graded_points += points_earned
            graded_total += ex_score["total"]

        # feat/grade-50-50: 50% activities + 50% lesson content progress
        content_done, content_total = lesson_content_progress(cursor, acc_id, resource_id)
        performance_percent = lesson_grade_percent(graded_points, graded_total, content_done, content_total)

        cursor.close()
        return {
            # Only what the lesson HAS is listed on the Summary (no "Video -
            # Not watched" row for a lesson without a video).
            "has_video": content_total > 1,
            "video_watched": progress.get("video_watched_at") is not None,
            "content_read": progress.get("content_read_at") is not None,
            "activities": activities_out,
            "exercise": exercise_out,
            "graded_points": graded_points,
            "graded_total": graded_total,
            "performance_percent": performance_percent,
        }
    except Error as e:
        print(f"lesson_summary: failed to build performance summary for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_next_lesson_info(resource_id, acc_id=None):
    """
    Figures out what "Continue" should lead to after this lesson's
    summary: the next lesson in the same module, else the first lesson
    of the next module in the same chapter, else the first lesson of the
    next chapter, else the end of the course.

    feat/publishing-tree:
      - only PUBLISHED lessons in PUBLISHED modules and chapters count
        (the same things the Learning Map / Lessons page show), so
        "Continue" never points at something a learner can't open;
      - the order is the admin's Edit Order (display_order, then id) -
        the same order the Learning Map uses. It used to go by id, so
        after a reorder "next" could jump to the wrong lesson.

    Returns one of:
        {"type": "lesson", "resource_id": int, "resource_title": str, "new_module": bool, "module_name": str}
        {"type": "chapter", "resource_id": int, "resource_title": str, "cat_id": int, "category_name": str}
        {"type": "end"}
        {"type": "module_gate", "module_percent": int, "pass_percent": int, "all_done": bool}
            - Module 85% gate: the next lesson is in another module (or
              chapter) but this learner's current module hasn't PASSED
              yet, so there is no way forward until it does.
    or None on database error.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """SELECT lr.resource_id, lr.resource_title, m.module_id, m.module_name, c.cat_id, c.category_name
               FROM learning_resources_tbl lr
               JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
               JOIN modules_tbl m ON lr.module_id = m.module_id
               JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
               JOIN category_tbl c ON m.cat_id = c.cat_id
               JOIN category_stats_tbl cs ON c.cat_stats_id = cs.cat_stats_id
               WHERE lrs.lr_stats_name = 'Published'
                 AND ms.module_stats_name = 'Published'
                 AND cs.cat_stats_name = 'Published'
                 AND COALESCE(m.is_archived, 0) = 0
                 AND COALESCE(c.is_archived, 0) = 0
               ORDER BY COALESCE(c.display_order, 999999), c.cat_id,
                        COALESCE(m.display_order, 999999), m.module_id,
                        COALESCE(lr.display_order, 999999), lr.resource_id"""
        )
        course = cursor.fetchall()

        position = next((i for i, row in enumerate(course) if row["resource_id"] == int(resource_id)), None)
        if position is None or position + 1 >= len(course):
            cursor.close()
            return {"type": "end"}

        current, following = course[position], course[position + 1]

        # Module 85% gate: leaving this module needs it PASSED first.
        if acc_id and following["module_id"] != current["module_id"]:
            ensure_retake_schema(connection)
            perf = module_performance(cursor, acc_id, current["module_id"])
            if not perf["passed"]:
                cursor.close()
                return {
                    "type": "module_gate",
                    "module_percent": perf["percent"],
                    "pass_percent": perf["pass_percent"],
                    "all_done": perf["all_done"],
                }
        cursor.close()

        if following["cat_id"] != current["cat_id"]:
            return {
                "type": "chapter",
                "resource_id": following["resource_id"],
                "resource_title": following["resource_title"],
                "cat_id": following["cat_id"],
                "category_name": following["category_name"],
            }
        return {
            "type": "lesson",
            "resource_id": following["resource_id"],
            "resource_title": following["resource_title"],
            # the "Proceed?" popup says when the next lesson starts a new module
            "new_module": following["module_id"] != current["module_id"],
            "module_name": following["module_name"],
        }
    except (Error, TypeError, ValueError) as e:
        print(f"lesson_summary: failed to compute next lesson for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()