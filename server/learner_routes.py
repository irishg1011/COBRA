"""
learner_routes.py - CobraByte Learner-Side Page & Asset Routes
------------------------------------------------------------------
Blueprint containing every route that serves a page or asset for
logged-in Learner accounts: Dashboard, Coding Sandbox, Learning Map,
and the learner/ folder's own css/js files (learner.js, sandbox.css,
sandbox.js, learning-map.css, learning-map.js, etc.).

Registered onto the main app in login.py via:
    app.register_blueprint(learner_bp)

Kept separate from login.py (which stays focused on auth/session
routes) the same way admin_routes.py's admin_bp is kept separate.
"""

import os
from flask import Blueprint, render_template, send_from_directory, jsonify, session
import mysql.connector
from mysql.connector import Error

learner_bp = Blueprint('learner_bp', __name__)

# This file lives in server/, so learner/ is a sibling one level up
# (server/learner_routes.py -> ../learner).
LEARNER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../learner'))

# ------------------------------------------------------------
# DATABASE CONFIG
# ------------------------------------------------------------
# Duplicated from login.py (same as admin_routes.py does) rather than
# imported, to avoid a circular import - login.py imports learner_bp
# FROM this file, so this file can't import back from login.py.
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
    """
    Identifies which learner is making the request, using the
    session_token that login() stored in the Flask session cookie.

    ASSUMPTION: this queries active_sessions_tbl for a row matching
    the current session_token, expecting columns named
    "session_token" and "acc_id". session_tracker.py's create_session()
    is what originally inserts that row at login time - if its actual
    column names differ, update the query below to match.

    Returns None if there's no session token, or no matching active
    session row (e.g. it expired or was already ended by logout).
    """
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
    """
    dashboard.html lives in the main Flask templates/ folder (like
    login.html), so render_template works as normal here - the
    Blueprint shares the main app's Jinja template loader.
    """
    return render_template('dashboard.html')


# ============================================================
# ROUTE: CODING SANDBOX PAGE
# ============================================================
@learner_bp.route("/sandbox")
def sandbox():
    """
    sandbox.html lives under learner/html/, NOT the Flask templates/
    folder, so it's served directly via send_from_directory rather
    than render_template.
    """
    learner_html_dir = os.path.join(LEARNER_DIR, 'html')
    return send_from_directory(learner_html_dir, 'sandbox.html')


# ============================================================
# ROUTE: LEARNING MAP PAGE
# ============================================================
@learner_bp.route("/learning-map")
def learning_map_page():
    """
    learning-map.html lives under learner/html/, same pattern as
    sandbox.html above.
    """
    learner_html_dir = os.path.join(LEARNER_DIR, 'html')
    return send_from_directory(learner_html_dir, 'learning-map.html')


# ============================================================
# ROUTE: LEARNING MAP DATA (JSON API)
# ============================================================
@learner_bp.route("/api/learning-map", methods=["GET"])
def learning_map_data():
    """
    Computes, for the currently logged-in learner, the completion
    status of every chapter (category_tbl row) and returns it as JSON
    for learning-map.js to render.

    Module completion is derived (not stored) by checking every
    resource/activity/exercise that belongs to that module against
    this learner's three progress tables:
        - learner_resource_progress_tbl
        - learner_activity_progress_tbl
        - learner_exercise_progress_tbl

    A module with zero items of a given type is vacuously "complete"
    for that type (nothing to finish). Chapter completion is then
    derived from its modules, and chapters are sequentially locked:
    chapter N (N>1) is locked unless chapter N-1 is fully completed.
    """
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    try:
        cursor = connection.cursor(dictionary=True)

        # ------------------------------------------------------------
        # 1. Fetch all categories (chapters) and all modules up front.
        # ------------------------------------------------------------
        cursor.execute(
            "SELECT cat_id, category_name FROM category_tbl WHERE is_archived = 0 ORDER BY cat_id ASC"
        )
        categories = cursor.fetchall()

        cursor.execute(
            "SELECT module_id, cat_id FROM modules_tbl WHERE is_archived = 0 ORDER BY cat_id ASC, module_id ASC"
        )
        modules = cursor.fetchall()

        # ------------------------------------------------------------
        # 2. For every module, compute this learner's completion status
        #    by checking all three content types under it.
        # ------------------------------------------------------------
        module_status_by_id = {}

        for module in modules:
            module_id = module["module_id"]

            # --- Resources (lessons/videos) ---
            cursor.execute(
                "SELECT COUNT(*) AS total FROM learning_resources_tbl WHERE module_id = %s",
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

            # --- Activities (quizzes/flashcards/fill-in-the-blanks) ---
            cursor.execute(
                "SELECT COUNT(*) AS total FROM learning_activities_tbl WHERE module_id = %s",
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

            # --- Coding Exercises ---
            # coding_exercises_tbl has no module_id of its own - it links to a
            # module indirectly via resource_id -> learning_resources_tbl.module_id.
            cursor.execute(
                """SELECT COUNT(*) AS total
                   FROM coding_exercises_tbl ce
                   JOIN learning_resources_tbl lr ON ce.resource_id = lr.resource_id
                   WHERE lr.module_id = %s""",
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

        # ------------------------------------------------------------
        # 3. Roll module statuses up into chapter (category) statuses.
        # ------------------------------------------------------------
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

        # ------------------------------------------------------------
        # 4. Sequential locking: the first chapter is always unlocked;
        #    each later chapter is locked unless the previous one is
        #    fully completed.
        # ------------------------------------------------------------
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
# ROUTE: LEARNER FOLDER ASSETS (css/js/etc.)
# ============================================================
@learner_bp.route('/learner/<path:filename>')
def serve_learner_assets(filename):
    """
    Serves everything under the learner/ folder - e.g. learner/js/learner.js,
    learner/css/sandbox.css, learner/js/sandbox.js, learner/css/learning-map.css,
    learner/js/learning-map.js - so relative paths like
    "../learner/css/sandbox.css" resolve correctly from pages served at
    routes like /sandbox, /dashboard, or /learning-map.

    <path:filename> matches slashes, so nested subfolders (css/, js/,
    html/) work automatically without extra routes.
    """
    return send_from_directory(LEARNER_DIR, filename)