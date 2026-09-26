"""
learner_routes.py - CobraByte Learner-Side Page & Asset Routes
------------------------------------------------------------------
Blueprint containing every route that serves a page or asset for
logged-in Learner accounts: Dashboard, Coding Sandbox, Learning Map,
Lessons, Lesson Content, and the learner/ folder's own css/js files.

Registered onto the main app in login.py via:
    app.register_blueprint(learner_bp)
"""

import os
from flask import Blueprint, render_template, send_from_directory, jsonify, session, request
import mysql.connector
from mysql.connector import Error
from lesson_activities import (
    get_published_activities_for_resource,
    check_fill_blank_answer,
    check_flashcard_answer,
    record_activity_progress,
    get_activities_completion_summary,
    get_activity_type_name,
    MCQ_TYPE_NAME,
    get_mcq_activity_state,
    play_mcq_activity,
    submit_mcq_answer,
    lose_mcq_life,
)
from learner_exercise import (
    get_published_exercise_for_resource,
    is_exercise_completed,
    grade_exercise_submission,
    record_exercise_progress,
    get_latest_submission,
)
from lesson_summary import get_lesson_performance_summary, get_next_lesson_info
from sandbox_snippets import save_snippet, get_snippets_for_learner, get_snippet, delete_snippet  # Coding Sandbox - save to account
from sandbox_runs import log_run  # NEW: Coding Sandbox - run history log
from learner_progress_unlocks import has_unlock, write_unlock, get_unlocked_at  # NEW - Task #13: permanent category unlock check; get_unlocked_at added for Task #16's catch-up badge

learner_bp = Blueprint('learner_bp', __name__)

LEARNER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../learner'))

DB_HOST = "localhost"
DB_USER = "root"
DB_PASSWORD = ""
DB_NAME = "cobra_db"


def get_db_connection():
    try:
        connection = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        if connection.is_connected():
            return connection
    except Error as e:
        print(f"Error connecting to MySQL database: {e}")
    return None


def get_current_learner_acc_id():
    token = session.get("session_token")
    if not token:
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT acc_id FROM active_sessions_tbl WHERE session_token = %s",
            (token,)
        )
        row = cursor.fetchone()
        cursor.close()
        return row["acc_id"] if row else None
    except Error as e:
        print(f"Error looking up current learner: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_published_video_for_resource(cursor, resource_id):
    """
    Returns the most recently uploaded PUBLISHED video_tutorials_tbl row
    for a resource, or None if the lesson has no published video yet.
    A lesson can have multiple video rows across re-uploads (drafts +
    replacements) - the newest Published one (highest video_tutorial_id)
    is the one learners actually see.
    """
    cursor.execute(
        """SELECT vt.video_tutorial_id, vt.file_path, vt.video_title, vt.description
           FROM video_tutorials_tbl vt
           JOIN learning_resources_stats_tbl lrs ON vt.video_stats_id = lrs.lr_stats_id
           WHERE vt.resource_id = %s AND lrs.lr_stats_name = 'Published'
           ORDER BY vt.video_tutorial_id DESC
           LIMIT 1""",
        (resource_id,)
    )
    return cursor.fetchone()


# ============================================================
# ROUTE: DASHBOARD PAGE
# ============================================================
@learner_bp.route("/dashboard")
def dashboard():
    return render_template('dashboard.html')


# ============================================================
# ROUTE: CODING SANDBOX PAGE
# ============================================================
@learner_bp.route("/sandbox")
def sandbox():
    learner_html_dir = os.path.join(LEARNER_DIR, 'html')
    return send_from_directory(learner_html_dir, 'sandbox.html')


# ============================================================
# ROUTE: CODING SANDBOX - SAVE CODE TO THE LEARNER'S ACCOUNT (JSON API)
# ============================================================
@learner_bp.route("/api/sandbox/save", methods=["POST"])
def sandbox_save_code():
    """
    Persists the Sandbox editor's current code against the LOGGED-IN
    learner's own acc_id (see sandbox_snippets.py) - never to the
    local filesystem/file explorer, so it follows their account across
    devices/sessions.

    An optional snippet_id in the request body means "update this
    existing saved snippet" rather than create a new one - see
    sandbox_snippets.save_snippet()'s update-in-place behavior.
    """
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    snippet_id = data.get("snippet_id")

    success, snippet, message = save_snippet(acc_id, code, snippet_id=snippet_id)
    if not success:
        return jsonify({"success": False, "message": message}), 400

    return jsonify({
        "success": True,
        "message": message,
        "snippet": {
            "snippet_id": snippet["snippet_id"],
            "title": snippet["title"],
            "created_at": snippet["created_at"].strftime("%b %d, %I:%M %p") if snippet.get("created_at") else "",
            "updated_at": snippet["updated_at"].strftime("%b %d, %I:%M %p") if snippet.get("updated_at") else None,
        },
    }), 200


# ============================================================
# ROUTE: CODING SANDBOX - LIST THE LEARNER'S SAVED SNIPPETS (JSON API)
# ============================================================
@learner_bp.route("/api/sandbox/snippets", methods=["GET"])
def sandbox_list_snippets():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    rows = get_snippets_for_learner(acc_id)
    snippets = [{
        "snippet_id": row["snippet_id"],
        "title": row["title"],
        "created_at": row["created_at"].strftime("%b %d, %I:%M %p") if row.get("created_at") else "",
        "updated_at": row["updated_at"].strftime("%b %d, %I:%M %p") if row.get("updated_at") else None,
    } for row in rows]

    return jsonify({"success": True, "snippets": snippets}), 200


# ============================================================
# ROUTE: CODING SANDBOX - LOAD ONE SAVED SNIPPET'S FULL CODE (JSON API)
# ============================================================
@learner_bp.route("/api/sandbox/snippets/<int:snippet_id>", methods=["GET"])
def sandbox_get_snippet(snippet_id):
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    # Scoped to THIS learner's own acc_id inside get_snippet() itself -
    # requesting another learner's snippet_id correctly returns nothing.
    row = get_snippet(acc_id, snippet_id)
    if not row:
        return jsonify({"success": False, "message": "Snippet not found."}), 404

    return jsonify({
        "success": True,
        "snippet": {
            "snippet_id": row["snippet_id"],
            "title": row["title"],
            "code": row["code_content"],
            "created_at": row["created_at"].strftime("%b %d, %I:%M %p") if row.get("created_at") else "",
        },
    }), 200


# ============================================================
# ROUTE: CODING SANDBOX - DELETE A SAVED SNIPPET (JSON API)
# ============================================================
@learner_bp.route("/api/sandbox/snippets/<int:snippet_id>/delete", methods=["POST"])
def sandbox_delete_snippet(snippet_id):
    """
    Task #121: backs the Delete button on a saved snippet (Sandbox
    preview list and "See All" modal alike). Scoped to the logged-in
    learner's own acc_id inside delete_snippet() itself.
    """
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    success, message = delete_snippet(acc_id, snippet_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


# ============================================================
# ROUTE: CODING SANDBOX - LOG A RUN (JSON API)
# ============================================================
@learner_bp.route("/api/sandbox/log-run", methods=["POST"])
def sandbox_log_run():
    """
    Fire-and-forget: records one Run Code execution to
    sandbox_runs_tbl (see sandbox_runs.py) for future run-history/
    activity views. Called by the frontend AFTER a run already
    finished (Pyodide executes entirely client-side) - this never
    gates or slows down the run itself, and always responds success
    regardless of whether the log actually wrote, since a logging
    hiccup should never look like an error to the learner.
    """
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    output = data.get("output", "")
    status = data.get("status", "success")
    snippet_id = data.get("snippet_id")

    log_run(acc_id, code, output, status, snippet_id=snippet_id)
    return jsonify({"success": True}), 200


# ============================================================
# ROUTE: LEARNING MAP PAGE
# ============================================================
@learner_bp.route("/learning-map")
def learning_map_page():
    learner_html_dir = os.path.join(LEARNER_DIR, 'html')
    return send_from_directory(learner_html_dir, 'learning-map.html')


# ============================================================
# ROUTE: LEARNING MAP DATA (JSON API)
# ============================================================
@learner_bp.route("/api/learning-map", methods=["GET"])
def learning_map_data():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    try:
        cursor = connection.cursor(dictionary=True)

        # Task #15: Publishing page's Edit Order writes display_order -
        # this is the first place the learner side actually reads it.
        # COALESCE falls back to cat_id for any row that somehow still
        # has a NULL display_order, so nothing breaks if one is missing.
        cursor.execute(
            "SELECT cat_id, category_name FROM category_tbl WHERE is_archived = 0 "
            "ORDER BY COALESCE(display_order, 999999) ASC, cat_id ASC"
        )
        categories = cursor.fetchall()

        cursor.execute(
            "SELECT module_id, cat_id FROM modules_tbl WHERE is_archived = 0 "
            "ORDER BY cat_id ASC, COALESCE(display_order, 999999) ASC, module_id ASC"
        )
        modules = cursor.fetchall()

        module_status_by_id = {}

        for module in modules:
            module_id = module["module_id"]

            cursor.execute(
                """SELECT COUNT(*) AS total
                   FROM learning_resources_tbl lr
                   JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
                   WHERE lr.module_id = %s AND lrs.lr_stats_name = 'Published'""",
                (module_id,)
            )
            total_resources = cursor.fetchone()["total"]

            cursor.execute(
                """SELECT COUNT(*) AS done
                   FROM learner_resource_progress_tbl lrp
                   JOIN learning_resources_tbl lr ON lrp.resource_id = lr.resource_id
                   WHERE lr.module_id = %s AND lrp.acc_id = %s AND lrp.status = 'completed'""",
                (module_id, acc_id)
            )
            completed_resources = cursor.fetchone()["done"]

            cursor.execute(
                """SELECT COUNT(*) AS total
                   FROM learning_activities_tbl la
                   JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
                   WHERE la.module_id = %s AND las.la_stats_name = 'Published'""",
                (module_id,)
            )
            total_activities = cursor.fetchone()["total"]

            cursor.execute(
                """SELECT COUNT(*) AS done
                   FROM learner_activity_progress_tbl lap
                   JOIN learning_activities_tbl la ON lap.la_id = la.la_id
                   WHERE la.module_id = %s AND lap.acc_id = %s AND lap.status = 'completed'""",
                (module_id, acc_id)
            )
            completed_activities = cursor.fetchone()["done"]

            cursor.execute(
                """SELECT COUNT(*) AS total
                   FROM coding_exercises_tbl ce
                   JOIN learning_resources_tbl lr ON ce.resource_id = lr.resource_id
                   JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
                   WHERE lr.module_id = %s AND las.la_stats_name = 'Published'""",
                (module_id,)
            )
            total_exercises = cursor.fetchone()["total"]

            cursor.execute(
                """SELECT COUNT(*) AS done
                   FROM learner_exercise_progress_tbl lep
                   JOIN coding_exercises_tbl ce ON lep.exercise_id = ce.exercise_id
                   JOIN learning_resources_tbl lr ON ce.resource_id = lr.resource_id
                   WHERE lr.module_id = %s AND lep.acc_id = %s AND lep.status = 'completed'""",
                (module_id, acc_id)
            )
            completed_exercises = cursor.fetchone()["done"]

            total_items = total_resources + total_activities + total_exercises
            completed_items = completed_resources + completed_activities + completed_exercises

            if total_items > 0 and completed_items == total_items:
                status = "completed"
            elif completed_items > 0:
                status = "in_progress"
            else:
                status = "not_started"

            module_status_by_id[module_id] = status

        chapters = []

        for category in categories:
            cat_id = category["cat_id"]
            category_modules = [m for m in modules if m["cat_id"] == cat_id]

            modules_total = len(category_modules)
            modules_completed = sum(
                1 for m in category_modules
                if module_status_by_id.get(m["module_id"]) == "completed"
            )
            any_in_progress = any(
                module_status_by_id.get(m["module_id"]) == "in_progress"
                for m in category_modules
            )

            if modules_total > 0 and modules_completed == modules_total:
                chapter_status = "completed"
            elif modules_completed > 0 or any_in_progress:
                chapter_status = "in_progress"
            else:
                chapter_status = "not_started"

            chapters.append({
                "cat_id": cat_id,
                "category_name": category["category_name"],
                "modules_total": modules_total,
                "modules_completed": modules_completed,
                "status": chapter_status
            })

        for index, chapter in enumerate(chapters):
            cat_id = chapter["cat_id"]

            # Task #13: a permanent unlock, once earned, is never
            # revisited - skip the live recalculation entirely for a
            # learner who's already reached this category, so nothing
            # changed in an earlier category (a reorder, new content)
            # can ever lock them back out.
            if has_unlock(connection, acc_id, "category", cat_id):
                chapter["locked"] = False
                continue

            if index == 0:
                chapter["locked"] = False
            else:
                chapter["locked"] = chapters[index - 1]["status"] != "completed"

            # The moment this category is first found reachable, write
            # it down permanently - it's never recomputed again for
            # this learner after this point.
            if not chapter["locked"]:
                write_unlock(connection, acc_id, "category", cat_id)

        cursor.close()
        return jsonify({"success": True, "chapters": chapters}), 200

    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# ROUTE: LESSONS PAGE
# ============================================================
@learner_bp.route("/lessons")
def lessons_page():
    learner_html_dir = os.path.join(LEARNER_DIR, 'html')
    return send_from_directory(learner_html_dir, 'lessons.html')


# ============================================================
# ROUTE: LESSONS DATA (JSON API)
# ============================================================
@learner_bp.route("/api/lessons", methods=["GET"])
def lessons_data():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    cat_id = request.args.get("cat_id", type=int)
    if not cat_id:
        return jsonify({"success": False, "message": "cat_id is required."}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT cat_id, category_name FROM category_tbl WHERE cat_id = %s AND is_archived = 0",
            (cat_id,)
        )
        category = cursor.fetchone()
        if not category:
            cursor.close()
            return jsonify({"success": False, "message": "Chapter not found."}), 404

        # Task #16: the learner's own unlock timestamp for THIS
        # category - anything created after this is new to them, even
        # in a category they've already passed. None if they haven't
        # reached this category at all yet (badge logic below simply
        # never fires in that case, since nothing is browsable yet).
        category_unlocked_at = get_unlocked_at(connection, acc_id, "category", cat_id)

        cursor.execute(
            "SELECT module_id, module_name, description, created_at FROM modules_tbl WHERE cat_id = %s AND is_archived = 0 "
            "ORDER BY cat_id ASC, COALESCE(display_order, 999999) ASC, module_id ASC",
            (cat_id,)
        )
        raw_modules = cursor.fetchall()

        modules_out = []
        overall_completed = 0
        overall_total = 0

        for module in raw_modules:
            module_id = module["module_id"]

            cursor.execute(
                "SELECT resource_id, resource_title, created_at FROM learning_resources_tbl WHERE module_id = %s "
                "ORDER BY COALESCE(display_order, 999999) ASC, resource_id ASC",
                (module_id,)
            )
            resources = cursor.fetchall()

            lessons_out = []
            previous_reached = True

            for resource in resources:
                resource_id = resource["resource_id"]

                cursor.execute(
                    "SELECT status FROM learner_resource_progress_tbl WHERE acc_id = %s AND resource_id = %s",
                    (acc_id, resource_id)
                )
                progress_row = cursor.fetchone()
                # Task #14: has_ever_touched is True for ANY existing
                # row (in_progress or completed) - a lesson the learner
                # has started but not finished still counts as
                # "reached," so it can never be re-locked by a later
                # reorder either.
                has_ever_touched = progress_row is not None
                resource_watched = bool(progress_row and progress_row["status"] == "completed")

                cursor.execute(
                    "SELECT COUNT(*) AS total FROM learning_activities_tbl WHERE resource_id = %s",
                    (resource_id,)
                )
                activities_total = cursor.fetchone()["total"]

                cursor.execute(
                    """SELECT COUNT(*) AS done
                       FROM learner_activity_progress_tbl lap
                       JOIN learning_activities_tbl la ON lap.la_id = la.la_id
                       WHERE la.resource_id = %s AND lap.acc_id = %s AND lap.status = 'completed'""",
                    (resource_id, acc_id)
                )
                activities_completed = cursor.fetchone()["done"]

                cursor.execute(
                    "SELECT exercise_id FROM coding_exercises_tbl WHERE resource_id = %s",
                    (resource_id,)
                )
                exercise_rows = cursor.fetchall()
                has_exercise = len(exercise_rows) > 0

                exercise_completed = True
                if has_exercise:
                    exercise_completed = True
                    for ex in exercise_rows:
                        cursor.execute(
                            """SELECT status FROM learner_exercise_progress_tbl
                               WHERE acc_id = %s AND exercise_id = %s""",
                            (acc_id, ex["exercise_id"])
                        )
                        ex_progress = cursor.fetchone()
                        if not ex_progress or ex_progress["status"] != "completed":
                            exercise_completed = False
                            break

                activities_ok = (activities_total == 0) or (activities_completed == activities_total)
                is_complete = resource_watched and activities_ok and exercise_completed

                # Task #14: a lesson the learner has ever touched is
                # never locked, regardless of current position - only a
                # never-touched lesson falls back to the positional
                # check against whatever now comes before it.
                if is_complete:
                    status = "completed"
                elif has_ever_touched:
                    status = "ready"
                elif previous_reached:
                    status = "ready"
                else:
                    status = "locked"

                # Task #16: purely informational - never affects status/
                # locking above, only whether the "New" badge shows.
                is_new_lesson = bool(
                    category_unlocked_at and resource.get("created_at")
                    and resource["created_at"] > category_unlocked_at
                )

                lessons_out.append({
                    "resource_id": resource_id,
                    "resource_title": resource["resource_title"],
                    "status": status,
                    "activities_completed": activities_completed,
                    "activities_total": activities_total,
                    "has_exercise": has_exercise,
                    "exercise_completed": exercise_completed if has_exercise else False,
                    "is_new": is_new_lesson
                })

                overall_total += 1
                if is_complete:
                    overall_completed += 1

                # Task #14: "reached" now includes touched-but-not-yet-
                # complete, not just fully complete - this is the line
                # that keeps everything after an in-progress lesson from
                # locking behind it.
                previous_reached = is_complete or has_ever_touched

            lessons_completed_in_module = sum(1 for l in lessons_out if l["status"] == "completed")

            is_new_module = bool(
                category_unlocked_at and module.get("created_at")
                and module["created_at"] > category_unlocked_at
            )

            modules_out.append({
                "module_id": module_id,
                "module_name": module["module_name"],
                "description": module["description"],
                "lessons_completed": lessons_completed_in_module,
                "lessons_total": len(lessons_out),
                "lessons": lessons_out,
                "is_new": is_new_module
            })

        overall_percent = round((overall_completed / overall_total) * 100) if overall_total > 0 else 0

        cursor.close()
        return jsonify({
            "success": True,
            "category_name": category["category_name"],
            "overall_completed_lessons": overall_completed,
            "overall_total_lessons": overall_total,
            "overall_percent": overall_percent,
            "modules": modules_out
        }), 200

    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# ROUTE: LESSON CONTENT PAGE
# ============================================================
@learner_bp.route("/lesson-content")
def lesson_content_page():
    learner_html_dir = os.path.join(LEARNER_DIR, 'html')
    return send_from_directory(learner_html_dir, 'lesson-content.html')


# ============================================================
# ROUTE: LESSON CONTENT DATA (JSON API)
# ============================================================
@learner_bp.route("/api/lesson-content", methods=["GET"])
def lesson_content_data():
    """
    Returns one resource's title, its authored HTML body, its published
    video (if any), and this learner's per-step progress
    (video_watched / content_read) so the frontend knows which step to
    resume on and which steps are already unlocked.
    """
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    resource_id = request.args.get("resource_id", type=int)
    if not resource_id:
        return jsonify({"success": False, "message": "resource_id is required."}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            """SELECT lr.resource_id, lr.resource_title, m.cat_id
               FROM learning_resources_tbl lr
               JOIN modules_tbl m ON lr.module_id = m.module_id
               WHERE lr.resource_id = %s""",
            (resource_id,)
        )
        resource = cursor.fetchone()
        if not resource:
            cursor.close()
            return jsonify({"success": False, "message": "Lesson not found."}), 404

        cursor.execute(
            "SELECT content_body FROM lesson_content_tbl WHERE resource_id = %s",
            (resource_id,)
        )
        content_row = cursor.fetchone()
        content_html = content_row["content_body"] if content_row else ""

        video_row = get_published_video_for_resource(cursor, resource_id)
        video = None
        if video_row:
            video = {
                "video_id": video_row["file_path"],
                "title": video_row["video_title"],
                "description": video_row.get("description") or "",
            }

        exercise = get_published_exercise_for_resource(resource_id)
        exercise_completed = False
        exercise_last_submission = None
        if exercise:
            exercise_completed = is_exercise_completed(acc_id, exercise["exercise_id"])
            exercise_last_submission = get_latest_submission(acc_id, exercise["exercise_id"])

        # Ensure a progress row exists (first time opening this lesson),
        # without downgrading an already-completed one.
        cursor.execute(
            """SELECT status, video_watched_at, content_read_at
               FROM learner_resource_progress_tbl WHERE acc_id = %s AND resource_id = %s""",
            (acc_id, resource_id)
        )
        progress_row = cursor.fetchone()
        if not progress_row:
            cursor.execute(
                """INSERT INTO learner_resource_progress_tbl (acc_id, resource_id, status, started_at)
                   VALUES (%s, %s, 'in_progress', NOW())""",
                (acc_id, resource_id)
            )
            connection.commit()
            progress_row = {"status": "in_progress", "video_watched_at": None, "content_read_at": None}

        cursor.close()
        return jsonify({
            "success": True,
            "resource_id": resource["resource_id"],
            "resource_title": resource["resource_title"],
            "cat_id": resource["cat_id"],
            "content_html": content_html,
            "video": video,
            "exercise": exercise,
            "exercise_completed": exercise_completed,
            "exercise_last_submission": exercise_last_submission,
            "is_completed": progress_row["status"] == "completed",
            "progress": {
                "video_watched": progress_row["video_watched_at"] is not None,
                "content_read": progress_row["content_read_at"] is not None,
            }
        }), 200

    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# ROUTE: MARK VIDEO STEP WATCHED
# ============================================================
@learner_bp.route("/api/lesson-content/mark-video-watched", methods=["POST"])
def mark_video_watched():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    resource_id = data.get("resource_id")
    if not resource_id:
        return jsonify({"success": False, "message": "resource_id is required."}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT progress_id, video_watched_at FROM learner_resource_progress_tbl WHERE acc_id = %s AND resource_id = %s",
            (acc_id, resource_id)
        )
        existing = cursor.fetchone()

        if existing:
            if not existing["video_watched_at"]:
                cursor.execute(
                    "UPDATE learner_resource_progress_tbl SET video_watched_at = NOW() WHERE progress_id = %s",
                    (existing["progress_id"],)
                )
        else:
            cursor.execute(
                """INSERT INTO learner_resource_progress_tbl (acc_id, resource_id, status, started_at, video_watched_at)
                   VALUES (%s, %s, 'in_progress', NOW(), NOW())""",
                (acc_id, resource_id)
            )

        connection.commit()
        cursor.close()
        return jsonify({"success": True}), 200
    except Error as e:
        connection.rollback()
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# ROUTE: MARK CONTENT STEP READ
# ============================================================
@learner_bp.route("/api/lesson-content/mark-content-read", methods=["POST"])
def mark_content_read():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    resource_id = data.get("resource_id")
    if not resource_id:
        return jsonify({"success": False, "message": "resource_id is required."}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT progress_id, content_read_at FROM learner_resource_progress_tbl WHERE acc_id = %s AND resource_id = %s",
            (acc_id, resource_id)
        )
        existing = cursor.fetchone()

        if existing:
            if not existing["content_read_at"]:
                cursor.execute(
                    "UPDATE learner_resource_progress_tbl SET content_read_at = NOW() WHERE progress_id = %s",
                    (existing["progress_id"],)
                )
        else:
            cursor.execute(
                """INSERT INTO learner_resource_progress_tbl (acc_id, resource_id, status, started_at, content_read_at)
                   VALUES (%s, %s, 'in_progress', NOW(), NOW())""",
                (acc_id, resource_id)
            )

        connection.commit()
        cursor.close()
        return jsonify({"success": True}), 200
    except Error as e:
        connection.rollback()
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# ROUTE: SUBMIT A CODING EXERCISE
# ============================================================
@learner_bp.route("/api/lesson-exercise/submit", methods=["POST"])
def lesson_exercise_submit():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    exercise_id = data.get("exercise_id")
    submitted_code = data.get("submitted_code", "")
    actual_outputs = data.get("actual_outputs") or []

    if not exercise_id:
        return jsonify({"success": False, "message": "exercise_id is required."}), 400

    result = grade_exercise_submission(acc_id, exercise_id, submitted_code, actual_outputs)
    if result is None:
        return jsonify({"success": False, "message": "Could not grade this submission."}), 500

    passed, total, status, feedback = result
    if status == "correct":
        record_exercise_progress(acc_id, exercise_id)

    return jsonify({
        "success": True,
        "passed": passed,
        "total": total,
        "status": status,
        "feedback": feedback
    }), 200


# ============================================================
# ROUTE: LESSON ACTIVITIES (JSON API) - Multiple Choice / Fill in the
# Blanks / Flashcards attached to a lesson. Answers are NEVER included
# here - see /api/lesson-activities/check-answer below.
# ============================================================
@learner_bp.route("/api/lesson-activities", methods=["GET"])
def lesson_activities_data():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    resource_id = request.args.get("resource_id", type=int)
    if not resource_id:
        return jsonify({"success": False, "message": "resource_id is required."}), 400

    activities = get_published_activities_for_resource(resource_id)

    connection = get_db_connection()
    completed_ids = set()
    if connection is not None:
        try:
            la_ids = [a["la_id"] for a in activities]
            if la_ids:
                cursor = connection.cursor(dictionary=True)
                placeholders = ",".join(["%s"] * len(la_ids))
                cursor.execute(
                    f"""SELECT la_id FROM learner_activity_progress_tbl
                        WHERE acc_id = %s AND status = 'completed'
                        AND la_id IN ({placeholders})""",
                    tuple([acc_id] + la_ids)
                )
                completed_ids = {row["la_id"] for row in cursor.fetchall()}
                cursor.close()
        except Error as e:
            print(f"Error checking activity completion: {e}")
        finally:
            if connection.is_connected():
                connection.close()

    for activity in activities:
        activity["completed"] = activity["la_id"] in completed_ids

    return jsonify({"success": True, "activities": activities}), 200


# ============================================================
# ROUTE: CHECK A SINGLE ACTIVITY ANSWER (Fill in the Blanks / Flashcards)
# Multiple Choice answers go through /api/lesson-activities/mcq/answer
# (the cobra arena), which records every attempt and handles lives.
# ============================================================
@learner_bp.route("/api/lesson-activities/check-answer", methods=["POST"])
def lesson_activities_check_answer():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    answer_type = data.get("type")

    if answer_type == "fill_blank":
        is_correct, feedback, correct_answer = check_fill_blank_answer(
            data.get("fib_id"), data.get("answer")
        )
        return jsonify({
            "success": True,
            "is_correct": is_correct,
            "feedback": feedback,
            "correct_answer": correct_answer
        }), 200

    if answer_type == "flashcard":
        result = check_flashcard_answer(acc_id, data.get("flashcard_id"), data.get("answer"))
        if result is None:
            return jsonify({"success": False, "message": "This flashcard could not be checked."}), 500
        status, feedback, correct_answer = result
        points = 1 if status == "correct" else 0.5 if status == "close" else 0
        return jsonify({
            "success": True,
            "status": status,
            "points": points,
            "feedback": feedback,
            "correct_answer": correct_answer
        }), 200

    return jsonify({"success": False, "message": "Unknown answer type."}), 400


# ============================================================
# MULTIPLE CHOICE ARENA (activity_type_id = 1)
# ------------------------------------------------------------
#   GET  /mcq/state      lives, current question, pause state, countdown
#   POST /mcq/play       start the ONE play, or resume the same paused play
#   POST /mcq/answer     grade an eaten pellet (every attempt is recorded)
#   POST /mcq/lose-life  wall hit / self-bite (not an answer)
# ============================================================
def _mcq_response(payload, error_message):
    if payload is None:
        status = 404 if error_message == "This activity is not available." else 400
        return jsonify({"success": False, "message": error_message or "Request failed."}), status
    return None


@learner_bp.route("/api/lesson-activities/mcq/state", methods=["GET"])
def lesson_activities_mcq_state():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    state, error_message = get_mcq_activity_state(acc_id, request.args.get("la_id", type=int))
    failed = _mcq_response(state, error_message)
    if failed:
        return failed
    return jsonify({"success": True, "state": state}), 200


@learner_bp.route("/api/lesson-activities/mcq/play", methods=["POST"])
def lesson_activities_mcq_play():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    state, error_message = play_mcq_activity(acc_id, data.get("la_id"))
    failed = _mcq_response(state, error_message)
    if failed:
        return failed
    return jsonify({"success": True, "state": state}), 200


@learner_bp.route("/api/lesson-activities/mcq/answer", methods=["POST"])
def lesson_activities_mcq_answer():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    result, error_message = submit_mcq_answer(
        acc_id, data.get("la_id"), data.get("q_id"), data.get("option_id"),
        data.get("recommendation_id")
    )
    failed = _mcq_response(result, error_message)
    if failed:
        return failed
    return jsonify({"success": True, **result}), 200


@learner_bp.route("/api/lesson-activities/mcq/lose-life", methods=["POST"])
def lesson_activities_mcq_lose_life():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    state, error_message = lose_mcq_life(acc_id, data.get("la_id"))
    failed = _mcq_response(state, error_message)
    if failed:
        return failed
    return jsonify({"success": True, "state": state}), 200


# ============================================================
# ROUTE: MARK ONE ACTIVITY AS COMPLETE (Fill-in-the-Blanks/Flashcards
# after the last item)
# ============================================================
@learner_bp.route("/api/lesson-activities/mark-complete", methods=["POST"])
def lesson_activities_mark_complete():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    la_id = data.get("la_id")
    score = data.get("score")

    if not la_id:
        return jsonify({"success": False, "message": "la_id is required."}), 400

    # Multiple Choice completes itself server-side when the last question
    # is answered correctly (see submit_mcq_answer) - the browser can't
    # mark it complete or choose its score.
    if get_activity_type_name(la_id) == MCQ_TYPE_NAME:
        return jsonify({"success": False, "message": "Multiple Choice completes automatically."}), 400

    ok = record_activity_progress(acc_id, la_id, "completed", score)
    if not ok:
        return jsonify({"success": False, "message": "Could not record progress."}), 500

    return jsonify({"success": True, "message": "Activity marked complete."}), 200


# ============================================================
# ROUTE: MARK LESSON COMPLETE
# ============================================================
@learner_bp.route("/api/lesson-content/complete", methods=["POST"])
def mark_lesson_complete():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    resource_id = data.get("resource_id")
    if not resource_id:
        return jsonify({"success": False, "message": "resource_id is required."}), 400

    # Hard gate: a lesson can never be marked complete while any of its
    # Published activities are still unfinished for this learner. A
    # lesson with zero activities has nothing to gate on and passes
    # through immediately (total == 0).
    total, completed = get_activities_completion_summary(acc_id, resource_id)
    if total > 0 and completed < total:
        return jsonify({
            "success": False,
            "message": "Please complete all activities before finishing this lesson."
        }), 400

    # Same hard gate for the exercise, if this lesson has one.
    exercise = get_published_exercise_for_resource(resource_id)
    if exercise and not is_exercise_completed(acc_id, exercise["exercise_id"]):
        return jsonify({
            "success": False,
            "message": "Please pass the coding exercise before finishing this lesson."
        }), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            "SELECT progress_id FROM learner_resource_progress_tbl WHERE acc_id = %s AND resource_id = %s",
            (acc_id, resource_id)
        )
        existing = cursor.fetchone()

        if existing:
            cursor.execute(
                """UPDATE learner_resource_progress_tbl
                   SET status = 'completed', completed_at = NOW()
                   WHERE progress_id = %s""",
                (existing["progress_id"],)
            )
        else:
            cursor.execute(
                """INSERT INTO learner_resource_progress_tbl
                   (acc_id, resource_id, status, started_at, completed_at)
                   VALUES (%s, %s, 'completed', NOW(), NOW())""",
                (acc_id, resource_id)
            )

        connection.commit()
        cursor.close()
        return jsonify({"success": True, "message": "Lesson marked as complete."}), 200

    except Error as e:
        connection.rollback()
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# ROUTE: LESSON SUMMARY (JSON API) - performance recap + what's next
# ============================================================
@learner_bp.route("/api/lesson-summary", methods=["GET"])
def lesson_summary_data():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    resource_id = request.args.get("resource_id", type=int)
    if not resource_id:
        return jsonify({"success": False, "message": "resource_id is required."}), 400

    summary = get_lesson_performance_summary(acc_id, resource_id)
    if summary is None:
        return jsonify({"success": False, "message": "Could not load lesson summary."}), 500

    next_info = get_next_lesson_info(resource_id)

    return jsonify({
        "success": True,
        **summary,
        "next": next_info,
    }), 200


# ============================================================
# ROUTE: LEARNER FOLDER ASSETS (css/js/etc.)
# ============================================================
@learner_bp.route('/learner/<path:filename>')
def serve_learner_assets(filename):
    return send_from_directory(LEARNER_DIR, filename)