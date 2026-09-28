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
from validators import validate_title_length  # feat/title-char-limit

CODING_EXERCISES_TABLE = "coding_exercises_tbl"
TEST_CASES_TABLE = "test_cases_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
PROFILE_TABLE = "profile_tbl"
CATEGORY_TABLE = "category_tbl"
MODULES_TABLE = "modules_tbl"
MODULE_STATS_TABLE = "module_stats_tbl"

DEFAULT_EXERCISE_STATUSES = ["Draft", "Published", "Archived", "Ready to Publish"]
_stats_ensured = False
_is_archived_column_ensured = False

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


def ensure_exercise_is_archived_column(connection):
    """
    Task #112: ensures coding_exercises_tbl has an is_archived TINYINT(1) column.
    """
    global _is_archived_column_ensured
    if _is_archived_column_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {CODING_EXERCISES_TABLE} ADD COLUMN IF NOT EXISTS "
            f"is_archived TINYINT(1) NOT NULL DEFAULT 0"
        )
        connection.commit()
        cursor.close()
        _is_archived_column_ensured = True
    except Error as e:
        print(f"coding_exercises: failed to ensure {CODING_EXERCISES_TABLE}.is_archived: {e}")


def ensure_exercise_stats(connection):
    """
    Ensures that default exercise statuses exist in learning_activities_stats_tbl.
    Idempotent and runs once per process lifetime.
    """
    global _stats_ensured
    ensure_exercise_is_archived_column(connection)
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
    is_valid, length_msg = validate_title_length(formatted, "exercise", "Exercise title")
    if not is_valid:
        return False, length_msg, formatted

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
            LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
            LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
            LEFT JOIN {LA_STATS_TABLE} stats ON ce.exercise_stats_id = stats.la_stats_id
            LEFT JOIN {PROFILE_TABLE} p ON ce.uploaded_by = p.acc_id
            WHERE (stats.la_stats_name IS NULL OR stats.la_stats_name != 'Archived')
              AND (COALESCE(ce.is_archived, 0) = 0)
              AND (c.cat_id IS NULL OR COALESCE(c.is_archived, 0) = 0)
              AND (m.module_id IS NULL OR COALESCE(m.is_archived, 0) = 0)
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
                ms.module_stats_name,
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
                "module_status": r.get("module_stats_name") or "Draft",
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
                stats.la_stats_name AS stats_name,
                stats.la_stats_name AS status
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


def parse_test_cases_from_form(form_data):
    """
    Parses test_cases[0][input] and test_cases[0][output] from multipart form data.
    """
    import re
    cases_dict = {}
    for key, val in form_data.items():
        if key.startswith('test_cases['):
            m = re.match(r'test_cases\[(\d+)\]\[(\w+)\]', key)
            if m:
                idx = int(m.group(1))
                field = m.group(2)
                if idx not in cases_dict:
                    cases_dict[idx] = {}
                cases_dict[idx][field] = val

    sorted_indices = sorted(cases_dict.keys())
    result = []
    for idx in sorted_indices:
        item = cases_dict[idx]
        input_val = (item.get('input') or '').strip()
        output_val = (item.get('output') or '').strip()
        if input_val or output_val:
            result.append({
                'input': input_val,
                'output': output_val,
            })
    return result


def save_coding_exercise(data: dict, status: str = 'Draft', uploaded_by: str = None):
    """
    Task #76: Persists a coding exercise and its child test cases with
    atomic transaction handling. Supports both Save Draft (status='Draft')
    and Publish (status='Published').

    Returns:
        (success: bool, exercise_id: int | None, message: str)
    """
    connection = get_db_connection()
    if connection is None:
        return False, None, "Database connection unavailable."

    try:
        ensure_exercise_stats(connection)
        cursor = connection.cursor(dictionary=True)

        exercise_id = data.get('exercise_id')
        if exercise_id:
            try:
                exercise_id = int(exercise_id)
            except (ValueError, TypeError):
                exercise_id = None

        raw_title = data.get('title') or data.get('exercise_title') or ''
        is_valid, err_msg, formatted_title = validate_exercise_title(raw_title, exclude_exercise_id=exercise_id)
        if not is_valid:
            cursor.close()
            return False, None, err_msg

        resource_id = data.get('resource_id') or data.get('lesson_id')
        if not resource_id:
            cursor.close()
            return False, None, "A valid Lesson must be selected."
        try:
            resource_id = int(resource_id)
        except (ValueError, TypeError):
            cursor.close()
            return False, None, "Invalid Lesson ID."

        points = data.get('points')
        try:
            points = max(1, int(points)) if points else 10
        except (ValueError, TypeError):
            points = 10

        instruction = (data.get('instruction') or '').strip()
        situation = (data.get('situation') or '').strip()
        problem_question = (data.get('problem_question') or '').strip()
        clue = (data.get('clue') or '').strip()
        expected_answer = (data.get('expected_answer') or '').strip()
        correct_feedback = (data.get('correct_feedback') or '').strip()

        # Resolve status id
        status_name = status if status in ('Draft', 'Published', 'Archived') else 'Draft'
        cursor.execute(f"SELECT la_stats_id FROM {LA_STATS_TABLE} WHERE la_stats_name = %s", (status_name,))
        stat_row = cursor.fetchone()
        stats_id = stat_row['la_stats_id'] if stat_row else (1 if status_name == 'Draft' else 2)

        # Fallback uploaded_by
        uploader = uploaded_by or data.get('uploaded_by') or 'Admin'

        if exercise_id:
            update_sql = f"""
                UPDATE {CODING_EXERCISES_TABLE}
                SET
                    exercise_title = %s,
                    resource_id = %s,
                    points = %s,
                    exercise_stats_id = %s,
                    instruction = %s,
                    situation = %s,
                    problem_question = %s,
                    clue = %s,
                    expected_answer = %s,
                    correct_feedback = %s,
                    updated_at = NOW()
                WHERE exercise_id = %s
            """
            cursor.execute(update_sql, (
                formatted_title, resource_id, points, stats_id,
                instruction, situation, problem_question, clue,
                expected_answer, correct_feedback, exercise_id
            ))
            # Clear old test cases
            cursor.execute(f"DELETE FROM {TEST_CASES_TABLE} WHERE exercise_id = %s", (exercise_id,))
        else:
            insert_sql = f"""
                INSERT INTO {CODING_EXERCISES_TABLE}
                (
                    exercise_title, resource_id, points, exercise_stats_id,
                    instruction, situation, problem_question, clue,
                    expected_answer, correct_feedback, uploaded_by,
                    created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            """
            cursor.execute(insert_sql, (
                formatted_title, resource_id, points, stats_id,
                instruction, situation, problem_question, clue,
                expected_answer, correct_feedback, uploader
            ))
            exercise_id = cursor.lastrowid

        # Insert test cases
        test_cases = data.get('test_cases') or []
        if isinstance(test_cases, list):
            for order, tc in enumerate(test_cases, start=1):
                inp = str(tc.get('input', '')).strip()
                out = str(tc.get('output', '')).strip()
                if inp or out:
                    cursor.execute(
                        f"""
                        INSERT INTO {TEST_CASES_TABLE}
                        (exercise_id, test_order, test_input, expected_output)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (exercise_id, order, inp, out)
                    )

        connection.commit()
        cursor.close()

        action_msg = "published" if status_name == "Published" else "saved as draft"
        return True, exercise_id, f"Coding exercise {action_msg} successfully!"

    except Error as e:
        connection.rollback()
        print(f"coding_exercises: failed to save exercise: {e}")
        return False, None, f"Database error while saving coding exercise: {e}"
    finally:
        if connection.is_connected():
            connection.close()
