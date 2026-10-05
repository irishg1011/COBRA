"""
publishing_preview.py - Task #17: Admin Preview (read-only, no progress)
------------------------------------------------------------------------------
Pure DB-access helpers backing the Publishing page's Preview modal - a
completely separate, SELECT-only code path from the real learner-facing
routes in learner_routes.py / lesson_activities.py. This file physically
contains no INSERT/UPDATE into any progress table, by construction: an
admin clicking through preview can never accidentally record a lesson
start, an activity completion, or anything else a real learner's session
would leave behind.

WHAT THIS FILE DOES NOT DO
- No acc_id, no learner session, no locking/unlocking math.
- No calls to learner_resource_progress_tbl / learner_activity_progress_tbl /
  learner_exercise_progress_tbl / learner_progress_unlocks_tbl - reading
  OR writing.
- Every chapter/module/lesson returned here is implicitly "unlocked" -
  there is no locked/ready state to compute at all.

SCOPE
Every function here only ever returns content whose status is "Ready to
Publish" or "Published" (see PREVIEW_STATUSES) - Draft is never visible
in preview, matching the same scope Edit Order already uses.

Reuses lesson_activities.check_mcq_answer() / check_fill_blank_answer()
directly (imported by admin_routes.py, not re-implemented here) for the
Preview modal's answer-check endpoint - those two functions are already
pure/stateless (they grade an answer and return feedback, nothing else),
so there's nothing to duplicate.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from coding_exercises import ensure_output_exercise_schema
from learner_exercise import evaluate_submission, add_public_spec   # the one exercise fetch + grader

CATEGORY_TABLE = "category_tbl"
CATEGORY_STATS_TABLE = "category_stats_tbl"
MODULES_TABLE = "modules_tbl"
MODULE_STATS_TABLE = "module_stats_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LR_STATS_TABLE = "learning_resources_stats_tbl"
LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
CODING_EXERCISES_TABLE = "coding_exercises_tbl"
VIDEO_TUTORIALS_TABLE = "video_tutorials_tbl"
MCQ_QUESTIONS_TABLE = "mcq_questions_tbl"
MCQ_OPTIONS_TABLE = "mcq_options_tbl"
FILL_BLANKS_TABLE = "fill_blanks_tbl"
FLASHCARDS_TABLE = "flashcards_tbl"

# Task: Preview shows Ready to Publish + Published combined, Draft
# excluded - the exact same scope Edit Order already uses on the
# Publishing page, for the same reason (see the reordering brainstorm).
PREVIEW_STATUSES = ("Ready to Publish", "Published")


def _status_placeholders():
    """`%s, %s` for the 2-item PREVIEW_STATUSES tuple - used in every
    IN (...) clause below so the allowed statuses live in exactly one
    place (PREVIEW_STATUSES) instead of being hand-typed per query."""
    return ", ".join(["%s"] * len(PREVIEW_STATUSES))


def get_preview_learning_map():
    """
    Returns every category where status is Ready to Publish OR
    Published, each with a count of how many of its modules also fall
    in that same combined scope - mirrors learner_routes.py's
    learning_map_data() shape (cat_id, category_name, modules_total),
    minus every locked/completed/acc_id concept, since preview has none
    of those.

    Returns [] (never raises) on any database error.
    """
    connection = get_db_connection()
    if connection is None:
        return []

    try:
        cursor = connection.cursor(dictionary=True)
        placeholders = _status_placeholders()

        cursor.execute(
            f"""SELECT c.cat_id, c.category_name,
                       COALESCE(cs.cat_stats_name, 'Draft') AS status_name
                FROM {CATEGORY_TABLE} c
                LEFT JOIN {CATEGORY_STATS_TABLE} cs ON c.cat_stats_id = cs.cat_stats_id
                WHERE COALESCE(c.is_archived, 0) = 0
                  AND COALESCE(cs.cat_stats_name, '') IN ({placeholders})
                ORDER BY COALESCE(c.display_order, 999999) ASC, c.cat_id ASC""",
            PREVIEW_STATUSES
        )
        categories = cursor.fetchall()

        cursor.execute(
            f"""SELECT m.cat_id, COUNT(*) AS total
                FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE COALESCE(m.is_archived, 0) = 0
                  AND COALESCE(ms.module_stats_name, '') IN ({placeholders})
                GROUP BY m.cat_id""",
            PREVIEW_STATUSES
        )
        module_counts = {row["cat_id"]: row["total"] for row in cursor.fetchall()}
        cursor.close()

        chapters = []
        for c in categories:
            chapters.append({
                "cat_id": c["cat_id"],
                "category_name": c["category_name"],
                "status": c["status_name"],
                "modules_total": module_counts.get(c["cat_id"], 0),
            })
        return chapters
    except Error as e:
        print(f"publishing_preview: failed to build preview learning map: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


def get_preview_lessons(cat_id):
    """
    Returns one category's modules + lessons, both filtered to
    Ready to Publish/Published only, in display_order - mirrors
    learner_routes.py's lessons_data() shape, minus every locking/
    progress concept.

    Returns None if the category itself doesn't exist or isn't in
    preview scope (caller returns 404); otherwise a dict:
        { "category_name": str, "modules": [
            { "module_id", "module_name", "description", "status",
              "lessons": [{"resource_id", "resource_title", "status"}, ...] },
            ...
        ]}
    """
    if not cat_id:
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        placeholders = _status_placeholders()

        cursor.execute(
            f"""SELECT c.cat_id, c.category_name
                FROM {CATEGORY_TABLE} c
                LEFT JOIN {CATEGORY_STATS_TABLE} cs ON c.cat_stats_id = cs.cat_stats_id
                WHERE c.cat_id = %s AND COALESCE(c.is_archived, 0) = 0
                  AND COALESCE(cs.cat_stats_name, '') IN ({placeholders})""",
            (cat_id,) + PREVIEW_STATUSES
        )
        category = cursor.fetchone()
        if not category:
            cursor.close()
            return None

        cursor.execute(
            f"""SELECT m.module_id, m.module_name, m.description,
                       COALESCE(ms.module_stats_name, 'Draft') AS status_name
                FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE m.cat_id = %s AND COALESCE(m.is_archived, 0) = 0
                  AND COALESCE(ms.module_stats_name, '') IN ({placeholders})
                ORDER BY COALESCE(m.display_order, 999999) ASC, m.module_id ASC""",
            (cat_id,) + PREVIEW_STATUSES
        )
        raw_modules = cursor.fetchall()

        modules_out = []
        for module in raw_modules:
            module_id = module["module_id"]

            cursor.execute(
                f"""SELECT lr.resource_id, lr.resource_title,
                           COALESCE(lrs.lr_stats_name, 'Draft') AS status_name
                    FROM {LEARNING_RESOURCES_TABLE} lr
                    LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                    WHERE lr.module_id = %s
                      AND COALESCE(lrs.lr_stats_name, '') IN ({placeholders})
                    ORDER BY COALESCE(lr.display_order, 999999) ASC, lr.resource_id ASC""",
                (module_id,) + PREVIEW_STATUSES
            )
            lessons = [
                {"resource_id": r["resource_id"], "resource_title": r["resource_title"], "status": r["status_name"]}
                for r in cursor.fetchall()
            ]

            modules_out.append({
                "module_id": module_id,
                "module_name": module["module_name"],
                "description": module["description"],
                "status": module["status_name"],
                "lessons": lessons,
            })

        cursor.close()
        return {"category_name": category["category_name"], "modules": modules_out}
    except Error as e:
        print(f"publishing_preview: failed to build preview lessons for cat_id={cat_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_preview_lesson_content(resource_id):
    """
    Returns a lesson's title + real content_body HTML - the exact same
    content a real learner would see - WITHOUT ever writing to
    learner_resource_progress_tbl. This is the one function whose real
    learner-side counterpart (lesson_content_data()) has a write in it;
    this version simply omits that write entirely, by not containing
    the code for it at all.

    Returns None if the resource doesn't exist or isn't in preview scope.
    """
    if not resource_id:
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        placeholders = _status_placeholders()

        cursor.execute(
            f"""SELECT lr.resource_id, lr.resource_title
                FROM {LEARNING_RESOURCES_TABLE} lr
                LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE lr.resource_id = %s
                  AND COALESCE(lrs.lr_stats_name, '') IN ({placeholders})""",
            (resource_id,) + PREVIEW_STATUSES
        )
        resource = cursor.fetchone()
        if not resource:
            cursor.close()
            return None

        cursor.execute(
            "SELECT content_body FROM lesson_content_tbl WHERE resource_id = %s",
            (resource_id,)
        )
        content_row = cursor.fetchone()
        cursor.close()

        return {
            "resource_id": resource["resource_id"],
            "resource_title": resource["resource_title"],
            "content_html": content_row["content_body"] if content_row else "",
        }
    except Error as e:
        print(f"publishing_preview: failed to load preview lesson content for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_preview_activities(resource_id):
    """
    Returns every Ready to Publish/Published activity AND coding
    exercise attached to a lesson, shaped for interactive preview -
    correct answers are NEVER included here (mirrors
    lesson_activities.get_published_activities_for_resource()'s own
    rule exactly), only revealed via the real check_mcq_answer()/
    check_fill_blank_answer() functions once the admin submits a guess
    (wired in Task 18) - those functions are read-only/stateless
    themselves, so reusing them directly is safe.

    Coding exercises are returned separately from activities (own
    "kind": "exercise" entries) with no expected_answer/correct_feedback
    field - matching the same "never reveal the answer up front" rule,
    and consistent with the real learner side never having a server-
    side exercise-check route either (exercises run client-side via
    Pyodide, same as the Coding Sandbox).

    Returns {"activities": [...], "exercises": [...]} (both possibly
    empty), never raises.
    """
    if not resource_id:
        return {"activities": [], "exercises": []}

    connection = get_db_connection()
    if connection is None:
        return {"activities": [], "exercises": []}

    try:
        cursor = connection.cursor(dictionary=True)
        placeholders = _status_placeholders()

        cursor.execute(
            f"""SELECT la.la_id, la.activity_title, la.points, atp.activity_type_name
                FROM {LEARNING_ACTIVITIES_TABLE} la
                LEFT JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
                LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
                WHERE la.resource_id = %s
                  AND COALESCE(las.la_stats_name, '') IN ({placeholders})
                ORDER BY la.la_id ASC""",
            (resource_id,) + PREVIEW_STATUSES
        )
        activity_rows = cursor.fetchall()

        activities = []
        for row in activity_rows:
            la_id = row["la_id"]
            activity_type = row.get("activity_type_name") or ""
            entry = {
                "la_id": la_id,
                "activity_title": row["activity_title"],
                "activity_type": activity_type,
                "points": row.get("points") or 0,
                "items": [],
            }

            if activity_type in ("Multiple Choice", "Quiz"):
                cursor.execute(
                    f"SELECT q_id, question_text FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s ORDER BY q_id ASC",
                    (la_id,)
                )
                for q in cursor.fetchall():
                    cursor.execute(
                        f"""SELECT option_id, option_letter, option_text
                            FROM {MCQ_OPTIONS_TABLE} WHERE q_id = %s ORDER BY option_letter ASC""",
                        (q["q_id"],)
                    )
                    options = cursor.fetchall()
                    entry["items"].append({
                        "q_id": q["q_id"],
                        "question_text": q["question_text"],
                        "options": [
                            {"option_id": o["option_id"], "option_letter": o["option_letter"], "text": o["option_text"]}
                            for o in options
                        ],
                    })

            elif activity_type == "Fill in the Blanks":
                cursor.execute(
                    f"SELECT fib_id, content FROM {FILL_BLANKS_TABLE} WHERE la_id = %s ORDER BY fib_id ASC",
                    (la_id,)
                )
                for row2 in cursor.fetchall():
                    entry["items"].append({"fib_id": row2["fib_id"], "content": row2["content"]})

            elif activity_type == "Flashcards":
                cursor.execute(
                    f"SELECT flashcard_id, front_text, back_text FROM {FLASHCARDS_TABLE} WHERE la_id = %s ORDER BY flashcard_id ASC",
                    (la_id,)
                )
                for row2 in cursor.fetchall():
                    entry["items"].append({
                        "flashcard_id": row2["flashcard_id"],
                        "front": row2["front_text"],
                        "back": row2["back_text"],
                    })

            activities.append(entry)

        cursor.execute(
            f"""SELECT ce.exercise_id, ce.exercise_title, ce.points,
                       ce.instruction, ce.situation, ce.problem_question, ce.clue
                FROM {CODING_EXERCISES_TABLE} ce
                LEFT JOIN {LA_STATS_TABLE} las ON ce.exercise_stats_id = las.la_stats_id
                WHERE ce.resource_id = %s
                  AND COALESCE(ce.is_archived, 0) = 0
                  AND COALESCE(las.la_stats_name, '') IN ({placeholders})
                ORDER BY ce.exercise_id ASC""",
            (resource_id,) + PREVIEW_STATUSES
        )
        exercises = [
            {
                "exercise_id": r["exercise_id"],
                "exercise_title": r["exercise_title"],
                "points": r.get("points") or 0,
                "instruction": r.get("instruction") or "",
                "situation": r.get("situation") or "",
                "problem_question": r.get("problem_question") or "",
                "clue": r.get("clue") or "",
            }
            for r in cursor.fetchall()
        ]

        cursor.close()
        return {"activities": activities, "exercises": exercises}
    except Error as e:
        print(f"publishing_preview: failed to load preview activities for resource_id={resource_id}: {e}")
        return {"activities": [], "exercises": []}
    finally:
        if connection.is_connected():
            connection.close()

# =============================================================================
# ADD THESE to the EXISTING publishing_preview.py (append at the end).
# Also add these two table names near the top with the other TABLE constants:
#     VIDEO_TUTORIALS_TABLE = "video_tutorials_tbl"
# =============================================================================


def get_preview_video(resource_id):
    """
    Returns the Ready to Publish/Published video tutorial attached to a
    lesson, shaped for the learner-style video step - video_title,
    description, and the normalized video id (stored in the
    video_tutorials_tbl.file_path column - repurposed from its old
    file-upload role to hold the YouTube video id since Cobra's video
    tutorials switched to pasted links).

    Returns None if there's no video in preview scope for this lesson.
    """
    if not resource_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        placeholders = _status_placeholders()
        cursor.execute(
            f"""SELECT vt.video_tutorial_id, vt.video_title, vt.description, vt.file_path AS video_id
                FROM {VIDEO_TUTORIALS_TABLE} vt
                LEFT JOIN {LA_STATS_TABLE} vts ON vt.video_stats_id = vts.la_stats_id
                WHERE vt.resource_id = %s
                  AND COALESCE(vts.la_stats_name, '') IN ({placeholders})
                ORDER BY vt.video_tutorial_id DESC LIMIT 1""",
            (resource_id,) + PREVIEW_STATUSES
        )
        video = cursor.fetchone()
        cursor.close()
        return video
    except Error as e:
        print(f"publishing_preview: failed to load preview video for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_preview_exercise(resource_id):
    """
    Returns the Ready to Publish/Published coding exercise attached to a
    lesson, with its Expected Output, Given input and required tags -
    learner_exercise.add_public_spec(), the same shape the learner page
    gets, just widened to PREVIEW_STATUSES.

    Returns None if there's no exercise in preview scope for this lesson.
    """
    if not resource_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        ensure_output_exercise_schema(connection)
        cursor = connection.cursor(dictionary=True)
        placeholders = _status_placeholders()
        cursor.execute(
            f"""SELECT ce.exercise_id, ce.exercise_title, ce.points, ce.instruction,
                       ce.situation, ce.problem_question, ce.clue
                FROM {CODING_EXERCISES_TABLE} ce
                LEFT JOIN {LA_STATS_TABLE} las ON ce.exercise_stats_id = las.la_stats_id
                WHERE ce.resource_id = %s
                  AND COALESCE(ce.is_archived, 0) = 0
                  AND COALESCE(las.la_stats_name, '') IN ({placeholders})
                ORDER BY ce.exercise_id DESC LIMIT 1""",
            (resource_id,) + PREVIEW_STATUSES
        )
        exercise = cursor.fetchone()
        if not exercise:
            cursor.close()
            return None

        add_public_spec(cursor, exercise)
        cursor.close()
        return exercise
    except Error as e:
        print(f"publishing_preview: failed to load preview exercise for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def grade_preview_exercise(exercise_id, submitted_code, actual_output, error_text=None):
    """
    Grades exactly like the learner's Submit - the same
    learner_exercise.evaluate_submission() - but NEVER writes to
    exercise_submissions_tbl. Nothing is recorded, so an admin can
    resubmit the same exercise in preview endlessly with zero trace.

    Returns {"status": "correct"|"incorrect", "feedback": str,
    "output_passed": bool, "tags_passed": bool} or None on failure.
    """
    if not exercise_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        ensure_output_exercise_schema(connection)
        cursor = connection.cursor(dictionary=True)
        result = evaluate_submission(cursor, exercise_id, submitted_code, actual_output, error_text)
        cursor.close()
        if result is None:
            return None
        return {key: result[key] for key in ("status", "feedback", "output_passed", "tags_passed")}
    except Error as e:
        print(f"publishing_preview: failed to grade preview exercise {exercise_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()

def get_preview_next_lesson(resource_id):
    """
    Same walk as lesson_summary.get_next_lesson_info() (next lesson in
    module -> first lesson of next module -> first lesson of next
    chapter -> end), but every step is filtered to PREVIEW_STATUSES so
    Preview's "Continue" never recommends something still in Draft.

    Returns the same shape as get_next_lesson_info(), or None on error.
    """
    if not resource_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        placeholders = _status_placeholders()

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

        cursor.execute(
            f"""SELECT lr.resource_id, lr.resource_title FROM {LEARNING_RESOURCES_TABLE} lr
                LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE lr.module_id = %s AND lr.resource_id > %s
                  AND COALESCE(lrs.lr_stats_name, '') IN ({placeholders})
                ORDER BY lr.resource_id ASC LIMIT 1""",
            (module_id, resource_id) + PREVIEW_STATUSES
        )
        next_in_module = cursor.fetchone()
        if next_in_module:
            cursor.close()
            return {"type": "lesson", "resource_id": next_in_module["resource_id"], "resource_title": next_in_module["resource_title"]}

        cursor.execute(
            f"""SELECT module_id FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE m.cat_id = %s AND m.module_id > %s AND COALESCE(m.is_archived, 0) = 0
                  AND COALESCE(ms.module_stats_name, '') IN ({placeholders})
                ORDER BY m.module_id ASC LIMIT 1""",
            (cat_id, module_id) + PREVIEW_STATUSES
        )
        next_module = cursor.fetchone()
        if next_module:
            cursor.execute(
                f"""SELECT lr.resource_id, lr.resource_title FROM {LEARNING_RESOURCES_TABLE} lr
                    LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                    WHERE lr.module_id = %s
                      AND COALESCE(lrs.lr_stats_name, '') IN ({placeholders})
                    ORDER BY lr.resource_id ASC LIMIT 1""",
                (next_module["module_id"],) + PREVIEW_STATUSES
            )
            first_resource = cursor.fetchone()
            if first_resource:
                cursor.close()
                return {"type": "lesson", "resource_id": first_resource["resource_id"], "resource_title": first_resource["resource_title"]}

        cursor.execute(
            f"""SELECT c.cat_id, c.category_name FROM {CATEGORY_TABLE} c
                LEFT JOIN {CATEGORY_STATS_TABLE} cs ON c.cat_stats_id = cs.cat_stats_id
                WHERE c.cat_id > %s AND COALESCE(c.is_archived, 0) = 0
                  AND COALESCE(cs.cat_stats_name, '') IN ({placeholders})
                ORDER BY c.cat_id ASC LIMIT 1""",
            (cat_id,) + PREVIEW_STATUSES
        )
        next_cat = cursor.fetchone()
        if next_cat:
            cursor.execute(
                f"""SELECT module_id FROM {MODULES_TABLE} m
                    LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                    WHERE m.cat_id = %s AND COALESCE(m.is_archived, 0) = 0
                      AND COALESCE(ms.module_stats_name, '') IN ({placeholders})
                    ORDER BY m.module_id ASC LIMIT 1""",
                (next_cat["cat_id"],) + PREVIEW_STATUSES
            )
            first_module = cursor.fetchone()
            if first_module:
                cursor.execute(
                    f"""SELECT lr.resource_id, lr.resource_title FROM {LEARNING_RESOURCES_TABLE} lr
                        LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                        WHERE lr.module_id = %s
                          AND COALESCE(lrs.lr_stats_name, '') IN ({placeholders})
                        ORDER BY lr.resource_id ASC LIMIT 1""",
                    (first_module["module_id"],) + PREVIEW_STATUSES
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
        print(f"publishing_preview: failed to compute preview next lesson for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()