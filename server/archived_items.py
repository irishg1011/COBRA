"""
archived_items.py - Task #117: Dedicated Archive Modals & Data Access Layer
--------------------------------------------------------------------------------------
Pure DB-access helpers backing the tabbed Archive Modals across:
  1. Manage Learning Resources (Lesson Content & Video Tutorial tabs)
  2. Manage Learning Activities (Multiple Choice Test, Fill in the Blanks, Flashcards tabs)
  3. Manage Coding Exercises (Coding Exercises tab)

Follows existing conventions (manage_course.py, learning_resources.py,
learning_activities.py, coding_exercises.py): this file never touches Flask/session
state directly - admin_routes.py turns these into JSON HTTP responses.
"""

from datetime import datetime
from mysql.connector import Error
from cobradb import get_db_connection

# Table constants
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
RESOURCE_TYPES_TABLE = "resource_types_tbl"
LR_STATS_TABLE = "learning_resources_stats_tbl"
LESSON_CONTENT_TABLE = "lesson_content_tbl"
VIDEO_TUTORIALS_TABLE = "video_tutorials_tbl"

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
ACTIVITY_TYPES_TABLE = "activity_types_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
MCQ_QUESTIONS_TABLE = "mcq_questions_tbl"
MCQ_OPTIONS_TABLE = "mcq_options_tbl"
FILL_BLANKS_TABLE = "fill_blanks_tbl"
FLASHCARDS_TABLE = "flashcards_tbl"

CODING_EXERCISES_TABLE = "coding_exercises_tbl"
TEST_CASES_TABLE = "test_cases_tbl"

MODULES_TABLE = "modules_tbl"
CATEGORY_TABLE = "category_tbl"
PROFILE_TABLE = "profile_tbl"


def _fmt_date(dt):
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _fmt_datetime(dt):
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.strftime('%I:%M %p').lstrip('0') or '12:00 AM'}"


# ==============================================================================
# 1. LEARNING RESOURCES ARCHIVE
# ==============================================================================

def get_archived_resources(resource_type=None, search_query=None, page=1, per_page=8):
    """
    Fetches paginated archived learning resources, optionally filtered by
    resource type ("Lesson Content" or "Video Tutorial").
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)

        base_query = f"""
            FROM {LEARNING_RESOURCES_TABLE} lr
            LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
            LEFT JOIN {RESOURCE_TYPES_TABLE} rt ON lr.resource_type_id = rt.resource_type_id
            LEFT JOIN {PROFILE_TABLE} p ON lr.uploaded_by = p.acc_id
            LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
            LEFT JOIN {MODULES_TABLE} m ON lr.module_id = m.module_id
            WHERE LOWER(COALESCE(lrs.lr_stats_name, '')) = 'archived'
        """
        params = []

        # Filter by resource type
        r_type = (resource_type or "").strip()
        if r_type:
            base_query += " AND LOWER(rt.resource_type_name) = %s"
            params.append(r_type.lower())

        # Search term filter
        term = (search_query or "").strip()
        if term:
            base_query += """
                AND (
                    LOWER(lr.resource_title) LIKE %s
                    OR LOWER(COALESCE(rt.resource_type_name, '')) LIKE %s
                    OR LOWER(COALESCE(c.category_name, '')) LIKE %s
                    OR LOWER(COALESCE(m.module_name, '')) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                    OR LOWER(DATE_FORMAT(lr.created_at, '%%b %%e, %%Y')) LIKE %s
                    OR LOWER(DATE_FORMAT(lr.updated_at, '%%b %%e, %%Y')) LIKE %s
                )
            """
            like_term = f"%{term.lower()}%"
            params.extend([like_term] * 7)

        # Count total
        count_sql = f"SELECT COUNT(*) AS total {base_query}"
        cursor.execute(count_sql, tuple(params))
        total = cursor.fetchone()["total"]

        page = max(1, int(page))
        per_page = max(1, int(per_page))
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(page, total_pages)
        offset = (page - 1) * per_page

        select_sql = f"""
            SELECT
                lr.resource_id,
                lr.resource_title,
                rt.resource_type_name,
                c.category_name,
                m.module_name,
                CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, '')) AS uploader_name,
                lrs.lr_stats_name AS status,
                lr.created_at AS raw_created_at,
                lr.updated_at AS raw_updated_at
            {base_query}
            ORDER BY lr.updated_at DESC, lr.resource_id DESC
            LIMIT %s OFFSET %s
        """
        cursor.execute(select_sql, tuple(params + [per_page, offset]))
        rows = cursor.fetchall()
        cursor.close()

        resources = []
        for r in rows:
            resources.append({
                "resource_id": r["resource_id"],
                "resource_title": r["resource_title"],
                "resource_type": r.get("resource_type_name") or "Lesson Content",
                "category": r.get("category_name") or "—",
                "module": r.get("module_name") or "—",
                "uploaded_by": (r.get("uploader_name") or "").strip() or "Admin",
                "status": r.get("status") or "Archived",
                "created_at": _fmt_date(r.get("raw_created_at")),
                "updated_at": _fmt_datetime(r.get("raw_updated_at")),
            })

        return {
            "resources": resources,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
    except Error as e:
        print(f"archived_items: failed to load archived resources: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def restore_learning_resource(resource_id):
    """
    Restores an archived learning resource back to 'Draft' status.
    """
    if not resource_id:
        return False, "Resource ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()

        # Check resource existence
        cursor.execute(
            f"SELECT resource_id FROM {LEARNING_RESOURCES_TABLE} WHERE resource_id = %s",
            (resource_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Learning resource not found."

        # Find Draft status id
        cursor.execute(
            f"SELECT lr_stats_id FROM {LR_STATS_TABLE} WHERE lr_stats_name = 'Draft'"
        )
        draft_row = cursor.fetchone()
        draft_id = draft_row[0] if draft_row else 1

        cursor.execute(
            f"""UPDATE {LEARNING_RESOURCES_TABLE}
                SET lr_stats_id = %s, updated_at = NOW()
                WHERE resource_id = %s""",
            (draft_id, resource_id)
        )
        connection.commit()
        cursor.close()
        return True, "Resource restored successfully."
    except Error as e:
        connection.rollback()
        print(f"archived_items: failed to restore resource {resource_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def permanently_delete_learning_resource(resource_id):
    """
    Permanently removes an archived learning resource from the database.
    Checks for connected active learning activities or coding exercises to preserve
    referential integrity, then cleans up child tables (lesson_content_tbl,
    video_tutorials_tbl) before deleting the resource row.
    """
    if not resource_id:
        return False, "Resource ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()

        # Check existence
        cursor.execute(
            f"""SELECT lr.resource_id, COALESCE(lrs.lr_stats_name, '') AS status
                FROM {LEARNING_RESOURCES_TABLE} lr
                LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE lr.resource_id = %s""",
            (resource_id,)
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Learning resource not found."

        if row[1].lower() != "archived":
            cursor.close()
            return False, "This resource must be archived before it can be permanently deleted."

        # Check for dependent records
        cursor.execute(
            f"SELECT COUNT(*) FROM {LEARNING_ACTIVITIES_TABLE} WHERE resource_id = %s",
            (resource_id,)
        )
        (act_count,) = cursor.fetchone()

        cursor.execute(
            f"SELECT COUNT(*) FROM {CODING_EXERCISES_TABLE} WHERE resource_id = %s",
            (resource_id,)
        )
        (ex_count,) = cursor.fetchone()

        if act_count > 0 or ex_count > 0:
            cursor.close()
            deps = []
            if act_count > 0:
                deps.append(f"{act_count} learning activity(ies)")
            if ex_count > 0:
                deps.append(f"{ex_count} coding exercise(s)")
            return False, f"Cannot permanently delete: {' and '.join(deps)} are linked to this resource."

        # Clean child tables
        cursor.execute(f"DELETE FROM {LESSON_CONTENT_TABLE} WHERE resource_id = %s", (resource_id,))
        cursor.execute(f"DELETE FROM {VIDEO_TUTORIALS_TABLE} WHERE resource_id = %s", (resource_id,))

        # Delete resource row
        cursor.execute(f"DELETE FROM {LEARNING_RESOURCES_TABLE} WHERE resource_id = %s", (resource_id,))

        connection.commit()
        cursor.close()
        return True, "Learning resource permanently deleted."
    except Error as e:
        connection.rollback()
        print(f"archived_items: failed to permanently delete resource {resource_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


# ==============================================================================
# 2. LEARNING ACTIVITIES ARCHIVE
# ==============================================================================

def get_archived_activities(activity_type=None, search_query=None, page=1, per_page=8):
    """
    Fetches paginated archived learning activities, optionally filtered by
    activity type ("Multiple Choice", "Fill in the Blanks", or "Flashcards").
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)

        base_query = f"""
            FROM {LEARNING_ACTIVITIES_TABLE} la
            LEFT JOIN {LEARNING_RESOURCES_TABLE} lr ON la.resource_id = lr.resource_id
            LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
            LEFT JOIN {PROFILE_TABLE} p ON la.uploaded_by = p.acc_id
            LEFT JOIN {CATEGORY_TABLE} c ON la.cat_id = c.cat_id
            LEFT JOIN {MODULES_TABLE} m ON la.module_id = m.module_id
            LEFT JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
            WHERE LOWER(COALESCE(last.la_stats_name, '')) = 'archived'
        """
        params = []

        # Filter by activity type
        a_type = (activity_type or "").strip().lower()
        if a_type:
            # Match variants (e.g., "multiple choice", "mct", "fill in the blanks", "fib", "flashcards", "fc")
            if "choice" in a_type or a_type == "mct":
                base_query += " AND LOWER(atp.activity_type_name) LIKE '%multiple choice%'"
            elif "blank" in a_type or a_type == "fib":
                base_query += " AND LOWER(atp.activity_type_name) LIKE '%blank%'"
            elif "flash" in a_type or a_type == "fc":
                base_query += " AND LOWER(atp.activity_type_name) LIKE '%flash%'"
            else:
                base_query += " AND LOWER(atp.activity_type_name) = %s"
                params.append(a_type)

        # Search term filter
        term = (search_query or "").strip()
        if term:
            base_query += """
                AND (
                    LOWER(la.activity_title) LIKE %s
                    OR LOWER(COALESCE(lr.resource_title, '')) LIKE %s
                    OR LOWER(COALESCE(c.category_name, '')) LIKE %s
                    OR LOWER(COALESCE(m.module_name, '')) LIKE %s
                    OR LOWER(COALESCE(atp.activity_type_name, '')) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                )
            """
            like_term = f"%{term.lower()}%"
            params.extend([like_term] * 6)

        count_sql = f"SELECT COUNT(*) AS total {base_query}"
        cursor.execute(count_sql, tuple(params))
        total = cursor.fetchone()["total"]

        page = max(1, int(page))
        per_page = max(1, int(per_page))
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(page, total_pages)
        offset = (page - 1) * per_page

        select_sql = f"""
            SELECT
                la.la_id,
                la.resource_id,
                la.activity_title,
                atp.activity_type_name,
                lr.resource_title AS lesson_name,
                c.category_name,
                m.module_name,
                la.points,
                CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, '')) AS uploader_name,
                last.la_stats_name AS status,
                la.created_at AS raw_created_at,
                la.updated_at AS raw_updated_at
            {base_query}
            ORDER BY la.updated_at DESC, la.la_id DESC
            LIMIT %s OFFSET %s
        """
        cursor.execute(select_sql, tuple(params + [per_page, offset]))
        rows = cursor.fetchall()
        cursor.close()

        activities = []
        for r in rows:
            activities.append({
                "activity_id": r["la_id"],
                "resource_id": r.get("resource_id"),
                "activity_name": r["activity_title"],
                "activity_type": r.get("activity_type_name") or "Multiple Choice",
                "lesson_name": r.get("lesson_name") or "—",
                "category": r.get("category_name") or "—",
                "module": r.get("module_name") or "—",
                "points": r.get("points") or 0,
                "uploaded_by": (r.get("uploader_name") or "").strip() or "Admin",
                "status": r.get("status") or "Archived",
                "created_at": _fmt_date(r.get("raw_created_at")),
                "updated_at": _fmt_datetime(r.get("raw_updated_at")),
            })

        return {
            "activities": activities,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
    except Error as e:
        print(f"archived_items: failed to load archived activities: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def restore_learning_activity(activity_id):
    """
    Restores an archived learning activity back to 'Draft' status.
    """
    if not activity_id:
        return False, "Activity ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT la_id FROM {LEARNING_ACTIVITIES_TABLE} WHERE la_id = %s",
            (activity_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Learning activity not found."

        cursor.execute(
            f"SELECT la_stats_id FROM {LA_STATS_TABLE} WHERE la_stats_name = 'Draft'"
        )
        draft_row = cursor.fetchone()
        draft_id = draft_row[0] if draft_row else 1

        cursor.execute(
            f"""UPDATE {LEARNING_ACTIVITIES_TABLE}
                SET la_stats_id = %s, updated_at = NOW()
                WHERE la_id = %s""",
            (draft_id, activity_id)
        )
        connection.commit()
        cursor.close()
        return True, "Learning activity restored successfully."
    except Error as e:
        connection.rollback()
        print(f"archived_items: failed to restore activity {activity_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def permanently_delete_learning_activity(activity_id):
    """
    Permanently deletes a learning activity and all dependent records:
    mcq_options_tbl, mcq_questions_tbl, fill_blanks_tbl, flashcards_tbl,
    and learning_activities_tbl.
    """
    if not activity_id:
        return False, "Activity ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()

        cursor.execute(
            f"""SELECT la.la_id, COALESCE(las.la_stats_name, '') AS status
                FROM {LEARNING_ACTIVITIES_TABLE} la
                LEFT JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
                WHERE la.la_id = %s""",
            (activity_id,)
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Learning activity not found."

        if row[1].lower() != "archived":
            cursor.close()
            return False, "This activity must be archived before it can be permanently deleted."

        # Delete MCQ options
        cursor.execute(
            f"""DELETE FROM {MCQ_OPTIONS_TABLE}
                WHERE q_id IN (SELECT q_id FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s)""",
            (activity_id,)
        )
        # Delete MCQ questions
        cursor.execute(f"DELETE FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s", (activity_id,))
        # Delete fill in the blanks
        cursor.execute(f"DELETE FROM {FILL_BLANKS_TABLE} WHERE la_id = %s", (activity_id,))
        # Delete flashcards
        cursor.execute(f"DELETE FROM {FLASHCARDS_TABLE} WHERE la_id = %s", (activity_id,))
        # Delete learning activity row
        cursor.execute(f"DELETE FROM {LEARNING_ACTIVITIES_TABLE} WHERE la_id = %s", (activity_id,))

        connection.commit()
        cursor.close()
        return True, "Learning activity permanently deleted."
    except Error as e:
        connection.rollback()
        print(f"archived_items: failed to permanently delete activity {activity_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


# ==============================================================================
# 3. CODING EXERCISES ARCHIVE
# ==============================================================================

def get_archived_exercises(search_query=None, page=1, per_page=8):
    """
    Fetches paginated archived coding exercises (is_archived = 1 or status = 'Archived').
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)

        base_query = f"""
            FROM {CODING_EXERCISES_TABLE} ce
            LEFT JOIN {LEARNING_RESOURCES_TABLE} lr ON ce.resource_id = lr.resource_id
            LEFT JOIN {MODULES_TABLE} m ON lr.module_id = m.module_id
            LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
            LEFT JOIN {LA_STATS_TABLE} stats ON ce.exercise_stats_id = stats.la_stats_id
            LEFT JOIN {PROFILE_TABLE} p ON ce.uploaded_by = p.acc_id
            WHERE (COALESCE(ce.is_archived, 0) = 1 OR LOWER(COALESCE(stats.la_stats_name, '')) = 'archived')
        """
        params = []

        term = (search_query or "").strip()
        if term:
            base_query += """
                AND (
                    LOWER(ce.exercise_title) LIKE %s
                    OR LOWER(COALESCE(lr.resource_title, '')) LIKE %s
                    OR LOWER(COALESCE(m.module_name, '')) LIKE %s
                    OR LOWER(COALESCE(c.category_name, '')) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                    OR LOWER(COALESCE(ce.uploaded_by, '')) LIKE %s
                )
            """
            like_term = f"%{term.lower()}%"
            params.extend([like_term] * 6)

        count_sql = f"SELECT COUNT(*) AS total {base_query}"
        cursor.execute(count_sql, tuple(params))
        total = cursor.fetchone()["total"]

        page = max(1, int(page))
        per_page = max(1, int(per_page))
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(page, total_pages)
        offset = (page - 1) * per_page

        select_sql = f"""
            SELECT
                ce.exercise_id,
                ce.exercise_title,
                lr.resource_title AS lesson_title,
                m.module_name,
                c.category_name,
                ce.points,
                CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, '')) AS uploader_name,
                ce.uploaded_by AS uploader_id,
                stats.la_stats_name AS stats_name,
                ce.created_at AS raw_created_at,
                ce.updated_at AS raw_updated_at
            {base_query}
            ORDER BY ce.updated_at DESC, ce.exercise_id DESC
            LIMIT %s OFFSET %s
        """
        cursor.execute(select_sql, tuple(params + [per_page, offset]))
        rows = cursor.fetchall()
        cursor.close()

        exercises = []
        for r in rows:
            uploader = (r.get("uploader_name") or "").strip() or r.get("uploader_id") or "Admin"
            exercises.append({
                "exercise_id": r["exercise_id"],
                "exercise_title": r["exercise_title"],
                "lesson_name": r.get("lesson_title") or "—",
                "module": r.get("module_name") or "—",
                "category": r.get("category_name") or "—",
                "points": r.get("points") or 0,
                "uploaded_by": uploader,
                "status": r.get("stats_name") or "Archived",
                "created_at": _fmt_date(r.get("raw_created_at")),
                "updated_at": _fmt_datetime(r.get("raw_updated_at")),
            })

        return {
            "exercises": exercises,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
    except Error as e:
        print(f"archived_items: failed to load archived exercises: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def restore_coding_exercise(exercise_id):
    """
    Restores an archived coding exercise back to active 'Draft' status (is_archived = 0).
    """
    if not exercise_id:
        return False, "Exercise ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT exercise_id FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s",
            (exercise_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Coding exercise not found."

        cursor.execute(
            f"SELECT la_stats_id FROM {LA_STATS_TABLE} WHERE la_stats_name = 'Draft'"
        )
        draft_row = cursor.fetchone()
        draft_id = draft_row[0] if draft_row else 1

        cursor.execute(
            f"""UPDATE {CODING_EXERCISES_TABLE}
                SET is_archived = 0, exercise_stats_id = %s, updated_at = NOW()
                WHERE exercise_id = %s""",
            (draft_id, exercise_id)
        )
        connection.commit()
        cursor.close()
        return True, "Coding exercise restored successfully."
    except Error as e:
        connection.rollback()
        print(f"archived_items: failed to restore exercise {exercise_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def permanently_delete_coding_exercise(exercise_id):
    """
    Permanently deletes a coding exercise and its test cases.
    """
    if not exercise_id:
        return False, "Exercise ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()

        cursor.execute(
            f"""SELECT ce.exercise_id, ce.is_archived, COALESCE(stats.la_stats_name, '') AS status
                FROM {CODING_EXERCISES_TABLE} ce
                LEFT JOIN {LA_STATS_TABLE} stats ON ce.exercise_stats_id = stats.la_stats_id
                WHERE ce.exercise_id = %s""",
            (exercise_id,)
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Coding exercise not found."

        is_archived = bool(row[1]) or (row[2].lower() == "archived")
        if not is_archived:
            cursor.close()
            return False, "This exercise must be archived before it can be permanently deleted."

        cursor.execute(f"DELETE FROM {TEST_CASES_TABLE} WHERE exercise_id = %s", (exercise_id,))
        cursor.execute(f"DELETE FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s", (exercise_id,))

        connection.commit()
        cursor.close()
        return True, "Coding exercise permanently deleted."
    except Error as e:
        connection.rollback()
        print(f"archived_items: failed to permanently delete exercise {exercise_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()