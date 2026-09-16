"""
lesson_summary.py - Learner-Side Lesson Summary & Performance Calculation
------------------------------------------------------------------------------
Pure DB-access helpers backing the Summary step on lesson-content.html:
a read-only recap of everything the learner did in this lesson (video,
content, each activity's score, the exercise result) plus an overall
Performance % across every GRADED item (MCQ + Fill in the Blanks +
Flashcards + Exercise - Video/Content have no "correct answer" so they
never count toward it).

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
            "performance_percent": int | None,  # None if this lesson has nothing gradeable at all
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

        for row in activity_rows:
            la_id = row["la_id"]
            activity_type = row.get("activity_type_name") or ""

            if activity_type == "Multiple Choice":
                cursor.execute("SELECT COUNT(*) AS cnt FROM mcq_questions_tbl WHERE la_id = %s", (la_id,))
            elif activity_type == "Fill in the Blanks":
                cursor.execute("SELECT COUNT(*) AS cnt FROM fill_blanks_tbl WHERE la_id = %s", (la_id,))
            elif activity_type == "Flashcards":
                cursor.execute("SELECT COUNT(*) AS cnt FROM flashcards_tbl WHERE la_id = %s", (la_id,))
            else:
                cursor.execute("SELECT 0 AS cnt")
            item_total = cursor.fetchone()["cnt"]

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
        cursor.execute(
            """SELECT ce.exercise_id, ce.exercise_title
               FROM coding_exercises_tbl ce
               JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
               WHERE ce.resource_id = %s AND las.la_stats_name = 'Published'
                 AND COALESCE(ce.is_archived, 0) = 0
               ORDER BY ce.exercise_id DESC LIMIT 1""",
            (resource_id,)
        )
        exercise_row = cursor.fetchone()
        if exercise_row:
            exercise_id = exercise_row["exercise_id"]

            cursor.execute("SELECT COUNT(*) AS cnt FROM test_cases_tbl WHERE exercise_id = %s", (exercise_id,))
            test_total = cursor.fetchone()["cnt"]

            cursor.execute(
                "SELECT progress_id FROM learner_exercise_progress_tbl WHERE acc_id = %s AND exercise_id = %s",
                (acc_id, exercise_id)
            )
            ex_completed = cursor.fetchone() is not None

            if ex_completed:
                points_earned = test_total
            else:
                cursor.execute(
                    """SELECT test_cases_passed FROM exercise_submissions_tbl
                       WHERE acc_id = %s AND exercise_id = %s
                       ORDER BY attempt_number DESC LIMIT 1""",
                    (acc_id, exercise_id)
                )
                latest = cursor.fetchone()
                points_earned = latest["test_cases_passed"] if latest else 0

            exercise_out = {
                "exercise_title": exercise_row["exercise_title"],
                "points_earned": points_earned,
                "points_total": test_total,
                "completed": ex_completed,
            }

            if test_total > 0:
                graded_points += points_earned
                graded_total += test_total

        performance_percent = round((graded_points / graded_total) * 100) if graded_total > 0 else None

        cursor.close()
        return {
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


def get_next_lesson_info(resource_id):
    """
    Figures out what "Continue" should lead to after this lesson's
    summary: the next lesson in the same module, else the first lesson
    of the next module in the same chapter, else the first lesson of the
    next chapter, else the end of the course. Ordering follows the same
    ascending-ID convention already used everywhere else in this
    codebase (learner_routes.py's own queries).

    Returns one of:
        {"type": "lesson", "resource_id": int, "resource_title": str}
        {"type": "chapter", "resource_id": int, "resource_title": str, "cat_id": int, "category_name": str}
        {"type": "end"}
    or None on database error.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT resource_id, module_id FROM learning_resources_tbl WHERE resource_id = %s",
            (resource_id,)
        )
        current = cursor.fetchone()
        if not current:
            cursor.close()
            return None
        module_id = current["module_id"]

        cursor.execute("SELECT cat_id FROM modules_tbl WHERE module_id = %s", (module_id,))
        module_row = cursor.fetchone()
        cat_id = module_row["cat_id"] if module_row else None

        # 1. Next lesson in the SAME module
        cursor.execute(
            """SELECT resource_id, resource_title FROM learning_resources_tbl
               WHERE module_id = %s AND resource_id > %s ORDER BY resource_id ASC LIMIT 1""",
            (module_id, resource_id)
        )
        next_in_module = cursor.fetchone()
        if next_in_module:
            cursor.close()
            return {"type": "lesson", "resource_id": next_in_module["resource_id"], "resource_title": next_in_module["resource_title"]}

        # 2. First lesson of the NEXT module in the same chapter
        cursor.execute(
            """SELECT module_id FROM modules_tbl
               WHERE cat_id = %s AND module_id > %s AND is_archived = 0
               ORDER BY module_id ASC LIMIT 1""",
            (cat_id, module_id)
        )
        next_module = cursor.fetchone()
        if next_module:
            cursor.execute(
                "SELECT resource_id, resource_title FROM learning_resources_tbl WHERE module_id = %s ORDER BY resource_id ASC LIMIT 1",
                (next_module["module_id"],)
            )
            first_resource = cursor.fetchone()
            if first_resource:
                cursor.close()
                return {"type": "lesson", "resource_id": first_resource["resource_id"], "resource_title": first_resource["resource_title"]}

        # 3. First lesson of the NEXT chapter
        cursor.execute(
            "SELECT cat_id, category_name FROM category_tbl WHERE cat_id > %s AND is_archived = 0 ORDER BY cat_id ASC LIMIT 1",
            (cat_id,)
        )
        next_cat = cursor.fetchone()
        if next_cat:
            cursor.execute(
                "SELECT module_id FROM modules_tbl WHERE cat_id = %s AND is_archived = 0 ORDER BY module_id ASC LIMIT 1",
                (next_cat["cat_id"],)
            )
            first_module = cursor.fetchone()
            if first_module:
                cursor.execute(
                    "SELECT resource_id, resource_title FROM learning_resources_tbl WHERE module_id = %s ORDER BY resource_id ASC LIMIT 1",
                    (first_module["module_id"],)
                )
                first_resource = cursor.fetchone()
                if first_resource:
                    cursor.close()
                    return {
                        "type": "chapter",
                        "resource_id": first_resource["resource_id"],
                        "resource_title": first_resource["resource_title"],
                        "cat_id": next_cat["cat_id"],
                        "category_name": next_cat["category_name"],
                    }

        cursor.close()
        return {"type": "end"}
    except Error as e:
        print(f"lesson_summary: failed to compute next lesson for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()