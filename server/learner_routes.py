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
    check_mcq_answer,
    check_fill_blank_answer,
    record_activity_progress,
    get_activities_completion_summary,
)
from sandbox_snippets import save_snippet, get_snippets_for_learner, get_snippet  # Coding Sandbox - save to account
from sandbox_runs import log_run  # NEW: Coding Sandbox - run history log

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

        cursor.execute(
            "SELECT cat_id, category_name FROM category_tbl WHERE is_archived = 0 ORDER BY cat_id ASC"
        )
        categories = cursor.fetchall()

        cursor.execute(
            "SELECT module_id, cat_id FROM modules_tbl WHERE is_archived = 0 ORDER BY cat_id ASC, module_id ASC"
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
            if index == 0:
                chapter["locked"] = False
            else:
                chapter["locked"] = chapters[index - 1]["status"] != "completed"

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

        cursor.execute(
            "SELECT module_id, module_name, description FROM modules_tbl WHERE cat_id = %s AND is_archived = 0 ORDER BY module_id ASC",
            (cat_id,)
        )
        raw_modules = cursor.fetchall()

        modules_out = []
        overall_completed = 0
        overall_total = 0

        for module in raw_modules:
            module_id = module["module_id"]

            cursor.execute(
                "SELECT resource_id, resource_title FROM learning_resources_tbl WHERE module_id = %s ORDER BY resource_id ASC",
                (module_id,)
            )
            resources = cursor.fetchall()

            lessons_out = []
            previous_complete = True

            for resource in resources:
                resource_id = resource["resource_id"]

                cursor.execute(
                    "SELECT status FROM learner_resource_progress_tbl WHERE acc_id = %s AND resource_id = %s",
                    (acc_id, resource_id)
                )
                progress_row = cursor.fetchone()
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

                if is_complete:
                    status = "completed"
                elif previous_complete:
                    status = "ready"
                else:
                    status = "locked"

                lessons_out.append({
                    "resource_id": resource_id,
                    "resource_title": resource["resource_title"],
                    "status": status,
                    "activities_completed": activities_completed,
                    "activities_total": activities_total,
                    "has_exercise": has_exercise,
                    "exercise_completed": exercise_completed if has_exercise else False
                })

                overall_total += 1
                if is_complete:
                    overall_completed += 1

                previous_complete = is_complete

            lessons_completed_in_module = sum(1 for l in lessons_out if l["status"] == "completed")

            modules_out.append({
                "module_id": module_id,
                "module_name": module["module_name"],
                "description": module["description"],
                "lessons_completed": lessons_completed_in_module,
                "lessons_total": len(lessons_out),
                "lessons": lessons_out
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
    Returns one resource's title and its full authored HTML body
    (lesson_content_tbl.content_body) for the learner-facing viewer to
    render directly - the same rich content the admin editor produced,
    including embedded interactive code/terminal blocks.
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

        # Mark this lesson as at least started, without downgrading an
        # already-completed one.
        cursor.execute(
            "SELECT status FROM learner_resource_progress_tbl WHERE acc_id = %s AND resource_id = %s",
            (acc_id, resource_id)
        )
        existing_progress = cursor.fetchone()
        if not existing_progress:
            cursor.execute(
                """INSERT INTO learner_resource_progress_tbl (acc_id, resource_id, status, started_at)
                   VALUES (%s, %s, 'in_progress', NOW())""",
                (acc_id, resource_id)
            )
            connection.commit()

        cursor.close()
        return jsonify({
            "success": True,
            "resource_id": resource["resource_id"],
            "resource_title": resource["resource_title"],
            "cat_id": resource["cat_id"],
            "content_html": content_html
        }), 200

    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


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
# ROUTE: CHECK A SINGLE ACTIVITY ANSWER (MCQ or Fill in the Blanks)
# ============================================================
@learner_bp.route("/api/lesson-activities/check-answer", methods=["POST"])
def lesson_activities_check_answer():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    answer_type = data.get("type")

    if answer_type == "mcq":
        is_correct, feedback, correct_option_id = check_mcq_answer(
            data.get("q_id"), data.get("option_id")
        )
        return jsonify({
            "success": True,
            "is_correct": is_correct,
            "feedback": feedback,
            "correct_option_id": correct_option_id
        }), 200

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

    return jsonify({"success": False, "message": "Unknown answer type."}), 400


# ============================================================
# ROUTE: MARK ONE ACTIVITY AS COMPLETE (MCQ/Fill-in-the-Blanks after
# the last item, or Flashcards after reviewing every card)
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
# ROUTE: LEARNER FOLDER ASSETS (css/js/etc.)
# ============================================================
@learner_bp.route('/learner/<path:filename>')
def serve_learner_assets(filename):
    return send_from_directory(LEARNER_DIR, filename)