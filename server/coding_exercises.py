"""
coding_exercises.py - Manage Coding Exercises DB Integration
--------------------------------------------------------------------------------------
Pure DB-access helpers backing the Admin > Coding Exercises page, mirroring
learning_activities.py / learning_resources.py style: this file never
touches Flask/session state directly - admin_routes.py is the only place
these get turned into HTTP responses/JSON.
"""

from mysql.connector import Error
from cobradb import get_db_connection

CODING_EXERCISES_TABLE = "coding_exercises_tbl"
TEST_CASES_TABLE = "test_cases_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
PROFILE_TABLE = "profile_tbl"
CATEGORY_TABLE = "category_tbl"
MODULES_TABLE = "modules_tbl"

DEFAULT_EXERCISE_STATUSES = ["Draft", "Published", "Archived"]
_stats_ensured = False

CE_SORT_CLAUSES = {
    "created_desc": "ce.created_at DESC",
    "created_asc": "ce.created_at ASC",
    "updated_desc": "ce.updated_at DESC",
    "updated_asc": "ce.updated_at ASC",
    "status_asc": "stats.la_stats_name ASC, ce.created_at DESC",
    "status_desc": "stats.la_stats_name DESC, ce.created_at DESC",
    "title_asc": "ce.exercise_title ASC",
    "title_desc": "ce.exercise_title DESC",
}
DEFAULT_CE_SORT_KEY = "created_desc"


def ensure_exercise_stats(connection):
    """
    Ensures that default exercise statuses exist in learning_activities_stats_tbl.
    Idempotent and runs once per process lifetime.
    """
    global _stats_ensured
    if _stats_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT la_stats_name FROM {LA_STATS_TABLE}")
        existing = {row[0] for row in cursor.fetchall()}
        missing = [s for s in DEFAULT_EXERCISE_STATUSES if s not in existing]
        for name in missing:
            cursor.execute(
                f"INSERT INTO {LA_STATS_TABLE} (la_stats_name) VALUES (%s)",
                (name,)
            )
        if missing:
            connection.commit()
        cursor.close()
        _stats_ensured = True
    except Error as e:
        print(f"coding_exercises: failed to seed {LA_STATS_TABLE}: {e}")


def format_exercise_title(title: str) -> str:
    """
    Task #69: Sentence-case formatting for exercise titles -
    first letter uppercase, rest lowercase.
    """
    cleaned = (title or "").strip()
    if not cleaned:
        return ""
    lower = cleaned.lower()
    return lower[0].upper() + lower[1:]


def is_exercise_title_taken(title: str, exclude_exercise_id=None):
    """
    Task #74: Checks whether `title` already exists globally in coding_exercises_tbl
    (case-insensitive comparison).
    """
    formatted = format_exercise_title(title)
    if not formatted:
        return False

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor()
        query = f"SELECT exercise_id FROM {CODING_EXERCISES_TABLE} WHERE LOWER(exercise_title) = LOWER(%s)"
        params = [formatted]

        if exclude_exercise_id:
            query += " AND exercise_id != %s"
            params.append(exclude_exercise_id)

        query += " LIMIT 1"
        cursor.execute(query, tuple(params))
        row = cursor.fetchone()
        cursor.close()
        return row is not None
    except Error as e:
        print(f"coding_exercises: error checking exercise title uniqueness: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def validate_exercise_title(title: str, exclude_exercise_id=None):
    """
    Task #74: Validates exercise title presence and global uniqueness.
    Returns:
        (is_valid: bool, error_message: str | None, formatted_title: str)
    """
    cleaned = (title or "").strip()
    if not cleaned:
        return False, "Exercise title is required.", ""

    formatted = format_exercise_title(cleaned)
    taken = is_exercise_title_taken(formatted, exclude_exercise_id=exclude_exercise_id)

    if taken is None:
        return False, "Database connection unavailable. Could not verify title uniqueness.", formatted

    if taken:
        return False, f"A coding exercise with the title '{formatted}' already exists. Exercise titles must be unique across the entire system.", formatted

    return True, None, formatted


def _fmt_date(dt):
    """e.g. 'Aug 26, 2026'."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _fmt_datetime(dt):
    """e.g. 'Aug 26, 01:30 PM'."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.strftime('%I:%M %p').lstrip('0') or '12:00 AM'}"


def get_exercise_stats():
    """
    Returns available exercise statuses from learning_activities_stats_tbl.
    """
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        ensure_exercise_stats(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT la_stats_id AS stats_id, la_stats_name AS stats_name FROM {LA_STATS_TABLE} "
            f"ORDER BY la_stats_id ASC"
        )
        rows = cursor.fetchall()
        cursor.close()
        return rows
    except Error as e:
        print(f"coding_exercises: failed to load exercise stats: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


def get_coding_exercises_overview(search_query=None, stats_filter=None, page=1, per_page=8,
                                  sort_by=None, created_from=None, created_to=None,
                                  updated_from=None, updated_to=None):
    """
    Pulls a page of coding_exercises_tbl, LEFT JOINed against
    learning_resources_tbl (Lesson), modules_tbl (Module), category_tbl
    (Category), learning_activities_stats_tbl (Stats), and profile_tbl (Uploaded By).

    Returns a dict:
      {
          "exercises": [...],
          "total": int,
          "page": int,
          "per_page": int,
          "total_pages": int
      }
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        ensure_exercise_stats(connection)
        cursor = connection.cursor(dictionary=True)

        base_query = f"""
            FROM {CODING_EXERCISES_TABLE} ce
            LEFT JOIN {LEARNING_RESOURCES_TABLE} lr ON ce.resource_id = lr.resource_id
            LEFT JOIN {MODULES_TABLE} m ON lr.module_id = m.module_id
            LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
            LEFT JOIN {LA_STATS_TABLE} stats ON ce.exercise_stats_id = stats.la_stats_id
            LEFT JOIN {PROFILE_TABLE} p ON ce.uploaded_by = p.acc_id
            WHERE 1 = 1
        """
        params = []

        term = (search_query or "").strip()
        if term:
            base_query += """
                AND (
                    LOWER(ce.exercise_title) LIKE %s
                    OR LOWER(lr.resource_title) LIKE %s
                    OR LOWER(m.module_name) LIKE %s
                    OR LOWER(c.category_name) LIKE %s
                    OR LOWER(COALESCE(stats.la_stats_name, '')) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                    OR LOWER(COALESCE(ce.uploaded_by, '')) LIKE %s
                )
            """
            like_term = f"%{term.lower()}%"
            params.extend([like_term] * 7)

        stats_val = (str(stats_filter).strip() if stats_filter not in (None, "") else "")
        if stats_val:
            if stats_val.isdigit():
                base_query += " AND ce.exercise_stats_id = %s"
                params.append(int(stats_val))
            else:
                base_query += " AND LOWER(stats.la_stats_name) = %s"
                params.append(stats_val.lower())

        if created_from:
            base_query += " AND DATE(ce.created_at) >= %s"
            params.append(created_from)
        if created_to:
            base_query += " AND DATE(ce.created_at) <= %s"
            params.append(created_to)
        if updated_from:
            base_query += " AND DATE(ce.updated_at) >= %s"
            params.append(updated_from)
        if updated_to:
            base_query += " AND DATE(ce.updated_at) <= %s"
            params.append(updated_to)

        # Total count before pagination
        cursor.execute(f"SELECT COUNT(*) AS total {base_query}", tuple(params))
        total = cursor.fetchone()["total"]

        page = max(1, page)
        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(page, total_pages)
        offset = (page - 1) * per_page

        order_by = CE_SORT_CLAUSES.get(sort_by, CE_SORT_CLAUSES[DEFAULT_CE_SORT_KEY])

        select_query = f"""
            SELECT
                ce.exercise_id,
                ce.exercise_title,
                ce.resource_id,
                ce.points,
                ce.exercise_stats_id,
                ce.instruction,
                ce.situation,
                ce.problem_question,
                ce.clue,
                ce.expected_answer,
                ce.correct_feedback,
                ce.uploaded_by AS uploaded_by_id,
                ce.created_at AS raw_created_at,
                ce.updated_at AS raw_updated_at,
                lr.resource_title AS lesson_title,
                m.module_id,
                m.module_name,
                c.cat_id,
                c.category_name,
                stats.la_stats_name AS stats_name,
                CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, '')) AS uploader_name
            {base_query}
            ORDER BY {order_by}
            LIMIT %s OFFSET %s
        """
        cursor.execute(select_query, tuple(params + [per_page, offset]))
        rows = cursor.fetchall()
        cursor.close()

        exercises = []
        for r in rows:
            uploader = (r.get("uploader_name") or "").strip()
            if not uploader:
                uploader = r.get("uploaded_by_id") or "Admin"

            exercises.append({
                "exercise_id": r["exercise_id"],
                "exercise_title": r["exercise_title"],
                "exercise_name": r["exercise_title"],
                "resource_id": r["resource_id"],
                "lesson": r.get("lesson_title") or "—",
                "lesson_title": r.get("lesson_title") or "—",
                "module_id": r.get("module_id"),
                "module": r.get("module_name") or "—",
                "module_name": r.get("module_name") or "—",
                "cat_id": r.get("cat_id"),
                "category": r.get("category_name") or "—",
                "category_name": r.get("category_name") or "—",
                "exercise_stats_id": r["exercise_stats_id"],
                "status": r.get("stats_name") or "Draft",
                "stats_name": r.get("stats_name") or "Draft",
                "points": r.get("points") or 0,
                "uploaded_by": uploader,
                "created_at": _fmt_datetime(r.get("raw_created_at")),
                "updated_at": _fmt_datetime(r.get("raw_updated_at")),
                "raw_created_at": r.get("raw_created_at"),
                "raw_updated_at": r.get("raw_updated_at"),
                "instruction": r.get("instruction") or "",
                "situation": r.get("situation") or "",
                "problem_question": r.get("problem_question") or "",
                "clue": r.get("clue") or "",
                "expected_answer": r.get("expected_answer") or "",
                "correct_feedback": r.get("correct_feedback") or "",
            })

        return {
            "exercises": exercises,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    except Error as e:
        print(f"coding_exercises: failed to get overview: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_coding_exercise(exercise_id):
    """
    Fetches a single coding exercise along with its test cases.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""
            SELECT
                ce.*,
                lr.resource_title AS lesson_title,
                m.module_id,
                m.module_name,
                c.cat_id,
                c.category_name,
                stats.la_stats_name AS stats_name
            FROM {CODING_EXERCISES_TABLE} ce
            LEFT JOIN {LEARNING_RESOURCES_TABLE} lr ON ce.resource_id = lr.resource_id
            LEFT JOIN {MODULES_TABLE} m ON lr.module_id = m.module_id
            LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
            LEFT JOIN {LA_STATS_TABLE} stats ON ce.exercise_stats_id = stats.la_stats_id
            WHERE ce.exercise_id = %s
            """,
            (exercise_id,)
        )
        exercise = cursor.fetchone()
        if not exercise:
            cursor.close()
            return None

        cursor.execute(
            f"""
            SELECT test_case_id, exercise_id, test_order, test_input, expected_output
            FROM {TEST_CASES_TABLE}
            WHERE exercise_id = %s
            ORDER BY test_order ASC, test_case_id ASC
            """,
            (exercise_id,)
        )
        exercise["test_cases"] = cursor.fetchall()
        cursor.close()
        return exercise
    except Error as e:
        print(f"coding_exercises: failed to get exercise {exercise_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def delete_coding_exercise(exercise_id):
    """
    Deletes a coding exercise and its associated test cases.
    """
    connection = get_db_connection()
    if connection is None:
        return False, "Database connection unavailable."

    try:
        cursor = connection.cursor()
        cursor.execute(f"DELETE FROM {TEST_CASES_TABLE} WHERE exercise_id = %s", (exercise_id,))
        cursor.execute(f"DELETE FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s", (exercise_id,))
        connection.commit()
        cursor.close()
        return True, "Coding exercise deleted successfully."
    except Error as e:
        connection.rollback()
        print(f"coding_exercises: failed to delete exercise {exercise_id}: {e}")
        return False, f"Failed to delete coding exercise: {e}"
    finally:
        if connection.is_connected():
            connection.close()
