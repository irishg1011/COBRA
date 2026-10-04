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
    settle_lesson_activities,
    get_activity_type_name,
    MCQ_TYPE_NAME,
    get_mcq_activity_state,
    play_mcq_activity,
    submit_mcq_answer,
    lose_mcq_life,
    skip_mcq_question,
)
from learner_exercise import (
    get_published_exercise_for_resource,
    is_exercise_completed,
    grade_exercise_submission,
    record_exercise_progress,
    get_latest_submission,
)
from lesson_summary import get_lesson_performance_summary, get_next_lesson_info
from weak_spots import get_weak_spots, get_review_status  # weak-spot recommendations
from module_review import get_module_review, module_review_summary  # Module Review card (end of every module)
from sandbox_snippets import save_snippet, get_snippets_for_learner, get_snippet, delete_snippet  # Coding Sandbox - save to account
from sandbox_runs import log_run  # NEW: Coding Sandbox - run history log
from notifications import notify_standalone  # header bell
import time
from module_performance import (  # Module 85% gate
    module_performance, module_locked_for_learner, get_resource_retake_info, start_activity_retake,
    live_course_rows, is_live_lesson,  # feat/published-only: what a learner can see
)
from activity_retakes import ensure_retake_schema, PASS_PERCENT
from learner_progress_unlocks import has_unlock, write_unlock, get_unlocked_at  # NEW - Task #13: permanent category unlock check; get_unlocked_at added for Task #16's catch-up badge

learner_bp = Blueprint('learner_bp', __name__)

LEARNER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../learner'))

from cobradb import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME  # single source of DB settings


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

    # header bell: "Saved <title> to your snippets"
    lines = len((code or "").splitlines()) or 1
    notify_standalone(
        acc_id, "snippet",
        f"{'Updated' if snippet_id else 'Saved'} **{snippet['title']}** in your snippets",
        f"Coding Sandbox · {lines} line{'s' if lines != 1 else ''} of code.",
        "/sandbox",
        f"snippet:{snippet['snippet_id']}:{int(time.time())}",
    )

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
    exec_time_ms = data.get("exec_time_ms")

    log_run(acc_id, code, output, status, snippet_id=snippet_id, exec_time_ms=exec_time_ms)
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

        ensure_retake_schema(connection)   # Module 85% gate reads answers.retake_id

        # Task #15: Publishing page's Edit Order writes display_order -
        # this is the first place the learner side actually reads it.
        # COALESCE falls back to cat_id for any row that somehow still
        # has a NULL display_order, so nothing breaks if one is missing.
        # feat/published-only: the map only has chapters and modules a
        # learner can see - lesson, module AND chapter all Published
        # (module_performance.live_course_rows), still in Edit Order.
        categories, modules = [], []
        seen_categories, seen_modules = set(), set()
        for live_row in live_course_rows(cursor):
            if live_row["cat_id"] not in seen_categories:
                seen_categories.add(live_row["cat_id"])
                categories.append({"cat_id": live_row["cat_id"], "category_name": live_row["category_name"]})
            if live_row["module_id"] not in seen_modules:
                seen_modules.add(live_row["module_id"])
                modules.append({"module_id": live_row["module_id"], "cat_id": live_row["cat_id"]})

        module_status_by_id = {}

        for module in modules:
            module_id = module["module_id"]

            # Learning Map completion uses the SAME rule as the Lessons page
            # and the Module 85% gate (module_performance): a module is
            # completed once every published lesson in it is done (content
            # watched/read + its activities + its coding exercise - lessons
            # with no activities still complete) AND the lesson average is
            # >= 85%. A module with no lessons counts as passed, so empty
            # modules never block their chapter.
            if module_performance(cursor, acc_id, module_id)["passed"]:
                status = "completed"
            else:
                # In progress = the learner has started (or finished) at
                # least one lesson in this module.
                cursor.execute(
                    """SELECT COUNT(*) AS touched
                       FROM learner_resource_progress_tbl lrp
                       JOIN learning_resources_tbl lr ON lrp.resource_id = lr.resource_id
                       WHERE lr.module_id = %s AND lrp.acc_id = %s""",
                    (module_id, acc_id)
                )
                touched = cursor.fetchone()["touched"]
                status = "in_progress" if touched > 0 else "not_started"

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

        # feat/published-only: this page only lists what a learner can see -
        # lesson, module AND chapter all Published. A chapter with nothing
        # live does not exist for learners.
        live_rows = live_course_rows(cursor, cat_id)
        if not live_rows:
            cursor.close()
            return jsonify({"success": False, "message": "Chapter not found."}), 404
        category = {"cat_id": cat_id, "category_name": live_rows[0]["category_name"]}

        # Task #16: the learner's own unlock timestamp for THIS
        # category - anything created after this is new to them, even
        # in a category they've already passed. None if they haven't
        # reached this category at all yet (badge logic below simply
        # never fires in that case, since nothing is browsable yet).
        category_unlocked_at = get_unlocked_at(connection, acc_id, "category", cat_id)
        ensure_retake_schema(connection)   # Module 85% gate reads answers.retake_id

        # feat/published-only: modules and their lessons come from live_rows
        # (already in Edit Order), so Draft / Ready ones never show up.
        raw_modules, lessons_by_module = [], {}
        for live_row in live_rows:
            if live_row["module_id"] not in lessons_by_module:
                lessons_by_module[live_row["module_id"]] = []
                raw_modules.append({
                    "module_id": live_row["module_id"],
                    "module_name": live_row["module_name"],
                    "description": live_row["module_description"],
                    "created_at": live_row["module_created_at"],
                })
            lessons_by_module[live_row["module_id"]].append({
                "resource_id": live_row["resource_id"],
                "resource_title": live_row["resource_title"],
                "created_at": live_row["resource_created_at"],
            })

        modules_out = []
        overall_completed = 0
        overall_total = 0
        previous_module_passed = True

        for module_index, module in enumerate(raw_modules):
            module_id = module["module_id"]
            module_touched = False

            resources = lessons_by_module.get(module_id, [])   # feat/published-only

            lessons_out = []
            previous_reached = True

            for resource in resources:
                resource_id = resource["resource_id"]

                cursor.execute(
                    """SELECT status, video_watched_at, content_read_at
                       FROM learner_resource_progress_tbl WHERE acc_id = %s AND resource_id = %s""",
                    (acc_id, resource_id)
                )
                progress_row = cursor.fetchone()
                # Task #14: has_ever_touched is True for ANY existing
                # row (in_progress or completed) - a lesson the learner
                # has started but not finished still counts as
                # "reached," so it can never be re-locked by a later
                # reorder either.
                has_ever_touched = progress_row is not None
                module_touched = module_touched or has_ever_touched
                resource_watched = bool(progress_row and progress_row["status"] == "completed")

                # Only Published activities count - Draft / Ready to Publish /
                # Archived ones are never shown to the learner, so they must
                # not appear in "x/y activities" or block lesson completion.
                cursor.execute(
                    """SELECT COUNT(*) AS total
                       FROM learning_activities_tbl la
                       JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
                       WHERE la.resource_id = %s AND las.la_stats_name = 'Published'""",
                    (resource_id,)
                )
                activities_total = cursor.fetchone()["total"]

                cursor.execute(
                    """SELECT COUNT(DISTINCT lap.la_id) AS done
                       FROM learner_activity_progress_tbl lap
                       JOIN learning_activities_tbl la ON lap.la_id = la.la_id
                       JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
                       WHERE la.resource_id = %s AND lap.acc_id = %s AND lap.status = 'completed'
                         AND las.la_stats_name = 'Published'""",
                    (resource_id, acc_id)
                )
                activities_completed = cursor.fetchone()["done"]

                # feat/published-only: only a Published exercise counts - a
                # Draft or archived one is invisible to learners, so it must
                # not keep the lesson from completing.
                cursor.execute(
                    """SELECT ce.exercise_id
                       FROM coding_exercises_tbl ce
                       JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
                       WHERE ce.resource_id = %s AND las.la_stats_name = 'Published'
                         AND COALESCE(ce.is_archived, 0) = 0""",
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

                # The card's progress bar = EVERY step of the lesson the mentor
                # uploaded (video if any, content, each activity, the exercise
                # if any) - so a finished lesson is always fully green, even
                # one with no activities.
                cursor.execute(
                    """SELECT COUNT(*) AS cnt
                       FROM video_tutorials_tbl vt
                       JOIN learning_resources_stats_tbl lrs ON vt.video_stats_id = lrs.lr_stats_id
                       WHERE vt.resource_id = %s AND lrs.lr_stats_name = 'Published'""",
                    (resource_id,)
                )
                has_video = cursor.fetchone()["cnt"] > 0
                video_done = bool(has_video and progress_row and progress_row["video_watched_at"])
                content_done = bool(progress_row and progress_row["content_read_at"])
                steps_total = 1 + (1 if has_video else 0) + activities_total + (1 if has_exercise else 0)
                steps_done = ((1 if content_done else 0) + (1 if video_done else 0)
                              + min(activities_completed, activities_total)
                              + (1 if has_exercise and exercise_completed else 0))
                if is_complete:
                    steps_done = steps_total

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
                    "has_video": has_video,
                    "steps_done": steps_done,
                    "steps_total": steps_total,
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

            # Module 85% gate - STRICT, LIVE: the first module of a chapter
            # is always open; every other one is open only while the module
            # before it is PASSING (all lessons done + lesson average >= 85%).
            # Saved unlock rows and lessons already started here no longer
            # keep a module open - if the previous module drops below 85%
            # (e.g. an admin adds an activity), this one locks again until
            # it's passed.
            perf = module_performance(cursor, acc_id, module_id)
            module_locked = not (module_index == 0 or previous_module_passed)
            for lesson in lessons_out:
                lesson_perf = perf["lessons"].get(lesson["resource_id"]) or {}
                lesson["performance_percent"] = lesson_perf.get("percent")
                lesson["missed"] = lesson_perf.get("missed", 0)
                if module_locked:
                    lesson["status"] = "locked"
            previous_module_passed = perf["passed"]

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
                "is_new": is_new_module,
                # Module 85% gate
                "locked": module_locked,
                "performance_percent": perf["percent"],
                "all_done": perf["all_done"],
                "passed": perf["passed"],
                "needs_retake": perf["needs_retake"],
                "pass_percent": perf["pass_percent"],
                "missed_total": sum(l["missed"] for l in lessons_out),
                # Module Review card after the lessons (module_review.py)
                "review": {**module_review_summary(cursor, acc_id, module_id, perf), "locked": module_locked},
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
            """SELECT lr.resource_id, lr.resource_title, lr.module_id, m.cat_id
               FROM learning_resources_tbl lr
               JOIN modules_tbl m ON lr.module_id = m.module_id
               WHERE lr.resource_id = %s""",
            (resource_id,)
        )
        resource = cursor.fetchone()
        if not resource:
            cursor.close()
            return jsonify({"success": False, "message": "Lesson not found."}), 404

        # feat/published-only: a lesson that is not live (the lesson, its
        # module or its chapter is not Published) can't be opened, not even
        # by typing its URL.
        if not is_live_lesson(cursor, resource_id):
            cursor.close()
            return jsonify({"success": False, "message": "This lesson is not available."}), 404

        # Module 85% gate (strict, live): a lesson in a locked module can't
        # be opened, not even by typing its URL.
        ensure_retake_schema(connection)
        if module_locked_for_learner(cursor, acc_id, resource["module_id"]):
            cursor.close()
            return jsonify({
                "success": False,
                "locked": True,
                "cat_id": resource["cat_id"],
                "message": f"This lesson is locked. Pass the previous module with {PASS_PERCENT}% or higher to unlock it.",
            }), 403

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

        # Steps the learner sees = only what the mentor uploaded: the
        # Activities step is shown only when there is a Published activity.
        cursor.execute(
            """SELECT COUNT(*) AS cnt
               FROM learning_activities_tbl la
               JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
               WHERE la.resource_id = %s AND las.la_stats_name = 'Published'""",
            (resource_id,)
        )
        has_activities = cursor.fetchone()["cnt"] > 0

        exercise = get_published_exercise_for_resource(resource_id)
        exercise_completed = False
        exercise_last_submission = None
        if exercise:
            exercise_completed = is_exercise_completed(acc_id, exercise["exercise_id"])
            exercise_last_submission = (
                get_latest_submission(acc_id, exercise["exercise_id"], correct_only=True)
                if exercise_completed else None
            ) or get_latest_submission(acc_id, exercise["exercise_id"])

        # Ensure a progress row exists (first time opening this lesson),
        # without downgrading an already-completed one.
        cursor.execute(
            """SELECT status, video_watched_at, content_read_at
               FROM learner_resource_progress_tbl WHERE acc_id = %s AND resource_id = %s""",
            (acc_id, resource_id)
        )
        progress_row = cursor.fetchone()
        started_before = progress_row is not None   # "You stopped here last time" note
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
            "has_activities": has_activities,
            "module_id": resource["module_id"],
            "started_before": started_before,
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

    # Locked once passed - same rule as the activities (the result that
    # counts is already saved), so a passed exercise can't be resubmitted.
    if is_exercise_completed(acc_id, exercise_id):
        return jsonify({
            "success": False,
            "locked": True,
            "message": "You already passed this exercise. Your result is saved, so it can't be submitted again.",
        }), 409

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

    # feat/learner-shuffle: acc_id -> this learner's own question order
    # (and shuffled Multiple Choice choices); see learner_shuffle.py.
    activities = get_published_activities_for_resource(resource_id, acc_id)

    connection = get_db_connection()
    completed_ids = set()
    first_scores = {}   # la_id -> score saved from the first play (the one that counts)
    if connection is not None:
        try:
            la_ids = [a["la_id"] for a in activities]
            if la_ids:
                cursor = connection.cursor(dictionary=True)
                placeholders = ",".join(["%s"] * len(la_ids))
                cursor.execute(
                    f"""SELECT la_id, score FROM learner_activity_progress_tbl
                        WHERE acc_id = %s AND status = 'completed'
                        AND la_id IN ({placeholders})""",
                    tuple([acc_id] + la_ids)
                )
                for row in cursor.fetchall():
                    completed_ids.add(row["la_id"])
                    first_scores.setdefault(row["la_id"], row["score"])
                cursor.close()
        except Error as e:
            print(f"Error checking activity completion: {e}")
        finally:
            if connection.is_connected():
                connection.close()

    # Module 85% gate: per-activity retake info (missed items, open round).
    retake_info = get_resource_retake_info(acc_id, resource_id) or {}
    retake_by_la = retake_info.get("activities") or {}
    for activity in activities:
        activity["completed"] = activity["la_id"] in completed_ids
        info = retake_by_la.get(activity["la_id"])
        # Shown on an already-answered activity ("4/5 on your first try").
        activity["first_score"] = first_scores.get(activity["la_id"])
        activity["item_total"] = info["total"] if info else None
        activity["retake"] = {
            "allowed": bool(retake_info.get("module_needs_retake")),
            "missed": info["missed"],
            "open": info["open"],
            "round": info["round"],
        } if info else None

    return jsonify({
        "success": True,
        "activities": activities,
        "module_needs_retake": bool(retake_info.get("module_needs_retake")),
        "module_percent": retake_info.get("module_percent"),
        "module_id": retake_info.get("module_id"),
        "pass_percent": retake_info.get("pass_percent", PASS_PERCENT),
    }), 200


# ============================================================
# ROUTE: START (OR CONTINUE) A RETAKE ROUND FOR ONE ACTIVITY
# Module 85% gate - only the items still missed are replayed; the game's
# own endpoints (mcq/*, fib-*, flashcard-*) then run in retake mode.
# ============================================================
@learner_bp.route("/api/lesson-activities/retake/start", methods=["POST"])
def lesson_activities_retake_start():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    result, error_message = start_activity_retake(acc_id, data.get("la_id"))
    if result is None:
        return jsonify({"success": False, "message": error_message or "Could not start the retake."}), 400
    return jsonify({"success": True, **result}), 200


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
#   POST /mcq/skip       skip the current question (after a wrong answer: free;
#                        from the preview with from_preview=true: -1 life)
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


@learner_bp.route("/api/lesson-activities/mcq/skip", methods=["POST"])
def lesson_activities_mcq_skip():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    result, error_message = skip_mcq_question(
        acc_id, data.get("la_id"), data.get("q_id"), data.get("from_preview") is True
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
    # Published activities are still unfinished for this learner. Empty
    # activities (no items) are auto-completed first, so they can never
    # block the lesson. A lesson with zero activities passes straight
    # through. The unfinished titles go back to the page so the learner
    # knows exactly what's left.
    unfinished = settle_lesson_activities(acc_id, resource_id)
    if unfinished is None:
        return jsonify({"success": False, "message": "Could not check your activities. Please try again."}), 500
    if unfinished:
        return jsonify({
            "success": False,
            "message": "Please complete all activities before finishing this lesson.",
            "unfinished": unfinished,
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

    # Order matters: get_review_status() saves this learner's recommendations
    # for the module FIRST, so everything the Module Review, the mentor's
    # Recommendations, Analytics and Learner Progress read is up to date
    # before the page asks "Proceed to the next lesson?".
    review = get_review_status(acc_id, resource_id)
    next_info = get_next_lesson_info(resource_id, acc_id)   # Module gate aware

    return jsonify({
        "success": True,
        **summary,
        "next": next_info,
        "review": review,
    }), 200


# ============================================================
# ROUTE: WEAK SPOTS (JSON API) - the parts of the lesson content behind
# the learner's missed items, for this lesson or its whole module
# ============================================================
@learner_bp.route("/api/weak-spots", methods=["GET"])
def weak_spots_data():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    resource_id = request.args.get("resource_id", type=int)
    if not resource_id:
        return jsonify({"success": False, "message": "resource_id is required."}), 400
    scope = "module" if request.args.get("scope") == "module" else "lesson"

    data = get_weak_spots(acc_id, resource_id, scope)
    if data is None:
        return jsonify({"success": False, "message": "Could not load your weak spots."}), 500
    return jsonify({"success": True, **data}), 200


# ============================================================
# ROUTE: MODULE REVIEW - the card at the end of every module
# (module_review.py): the learner's weak spots for the whole module,
# grouped by lesson, with the part to re-read and the retake.
# ============================================================
@learner_bp.route("/module-review")
def module_review_page():
    learner_html_dir = os.path.join(LEARNER_DIR, 'html')
    return send_from_directory(learner_html_dir, 'module-review.html')


@learner_bp.route("/api/module-review", methods=["GET"])
def module_review_data():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401
    module_id = request.args.get("module_id", type=int)
    if not module_id:
        return jsonify({"success": False, "message": "module_id is required."}), 400
    payload, status = get_module_review(acc_id, module_id)
    return jsonify(payload), status


# ============================================================
# ROUTE: LEARNER FOLDER ASSETS (css/js/etc.)
# ============================================================
@learner_bp.route('/learner/<path:filename>')
def serve_learner_assets(filename):
    return send_from_directory(LEARNER_DIR, filename)