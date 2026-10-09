"""
coding_exercises.py - Manage Coding Exercises DB Integration
--------------------------------------------------------------------------------------
Pure DB-access helpers backing the Admin > Coding Exercises page, mirroring
learning_activities.py / learning_resources.py style: this file never
touches Flask/session state directly - admin_routes.py is the only place
these get turned into HTTP responses/JSON.
"""

import re
from mysql.connector import Error
from cobradb import get_db_connection
from admin_time import fmt_datetime  # the one admin date + time format
from validators import validate_title_length  # feat/title-char-limit
from title_history import ensure_title_history, log_title_change  # feat/module-title-history
from exercise_tags import normalize_tag, tag_label
from activity_validation import ACTIVITY_TITLE_SEPARATOR, get_lesson_title  # feat/exercise-auto-title

CODING_EXERCISES_TABLE = "coding_exercises_tbl"
TEST_CASES_TABLE = "test_cases_tbl"   # old grading - only read for exercises saved before feat/output-based-exercises
REQUIRED_TAGS_TABLE = "exercise_required_tags_tbl"
SUBMISSIONS_TABLE = "exercise_submissions_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
PROFILE_TABLE = "profile_tbl"
CATEGORY_TABLE = "category_tbl"
MODULES_TABLE = "modules_tbl"
MODULE_STATS_TABLE = "module_stats_tbl"

DEFAULT_EXERCISE_STATUSES = ["Draft", "Published", "Archived", "Ready to Publish"]
_stats_ensured = False

# feat/output-based-exercises: an exercise is graded on ONE Expected
# Output (coding_exercises_tbl.expected_answer), the optional Given input
# fed to input() (given_input) and the "Required in the code" tags
# (exercise_required_tags_tbl, see exercise_tags.py). test_cases_tbl is
# left as it was and is no longer written; it is only read for an
# exercise that was never saved in the new form (given_input IS NULL),
# whose first exact-output test case then stands in for its Expected
# Output and Given input - see load_exercise_spec().
# Old test cases are 'output' (Input + Expected Output) or 'check' (an
# AI-judged requirement, exercise_ai.py - no longer used) in case_type.
CASE_OUTPUT = "output"
_output_schema_ensured = False


def ensure_output_exercise_schema(connection):
    """
    Lazy, idempotent schema for output-based grading (run before any write -
    DDL commits implicitly):
      coding_exercises_tbl.given_input      TEXT NULL (NULL = never saved in the new form)
      exercise_required_tags_tbl            one row per required tag
      exercise_submissions_tbl.actual_output / output_passed / tags_passed
    """
    global _output_schema_ensured
    if _output_schema_ensured:
        return
    tags_columns = f"""
            tag_row_id INT AUTO_INCREMENT PRIMARY KEY,
            exercise_id INT NOT NULL,
            tag_kind ENUM('concept','function','method') NOT NULL,
            tag_value VARCHAR(100) NOT NULL,
            tag_order INT NOT NULL,
            INDEX idx_required_tags_exercise (exercise_id)"""
    try:
        cursor = connection.cursor()
        cursor.execute(f"ALTER TABLE {CODING_EXERCISES_TABLE} ADD COLUMN IF NOT EXISTS given_input TEXT NULL")
        try:
            cursor.execute(f"""
                CREATE TABLE IF NOT EXISTS {REQUIRED_TAGS_TABLE} ({tags_columns},
                    CONSTRAINT fk_required_tags_exercise FOREIGN KEY (exercise_id)
                        REFERENCES {CODING_EXERCISES_TABLE} (exercise_id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci""")
        except Error as e:
            # e.g. the exercises table has no usable key for a foreign key -
            # the table still works; deletes clean the tags up explicitly.
            print(f"coding_exercises: {REQUIRED_TAGS_TABLE} created without its foreign key: {e}")
            cursor.execute(f"""
                CREATE TABLE IF NOT EXISTS {REQUIRED_TAGS_TABLE} ({tags_columns}
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci""")
        cursor.execute(
            f"ALTER TABLE {SUBMISSIONS_TABLE} "
            f"ADD COLUMN IF NOT EXISTS actual_output TEXT NULL, "
            f"ADD COLUMN IF NOT EXISTS output_passed TINYINT(1) NULL, "
            f"ADD COLUMN IF NOT EXISTS tags_passed TINYINT(1) NULL"
        )
        connection.commit()
        cursor.close()
        _output_schema_ensured = True
    except Error as e:
        print(f"coding_exercises: failed to ensure the output-based exercise schema: {e}")


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
DEFAULT_CE_SORT_KEY = "created_asc"  # Oldest First - first made shows first


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
    Task #69: Exercise title formatting - first letter uppercase,
    everything after it kept exactly as typed.
    """
    cleaned = (title or "").strip()
    if not cleaned:
        return ""
    return cleaned[0].upper() + cleaned[1:] 


def is_exercise_title_taken(title: str, exclude_exercise_id=None, format_case=True, skip_archived=False):
    """
    Task #74: Checks whether `title` already exists globally in coding_exercises_tbl
    (case-insensitive comparison). feat/exercise-auto-title: a generated
    title is checked as built (format_case=False), and archived exercises
    never block it (skip_archived=True) - same rule as activities.
    """
    formatted = format_exercise_title(title) if format_case else (title or "").strip()
    if not formatted:
        return False

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor()
        query = f"""SELECT ce.exercise_id FROM {CODING_EXERCISES_TABLE} ce
                    LEFT JOIN {LA_STATS_TABLE} stats ON ce.exercise_stats_id = stats.la_stats_id
                    WHERE LOWER(ce.exercise_title) = LOWER(%s)"""
        params = [formatted]
        if skip_archived:
            query += " AND COALESCE(ce.is_archived, 0) = 0 AND COALESCE(stats.la_stats_name, '') <> 'Archived'"

        if exclude_exercise_id:
            query += " AND ce.exercise_id != %s"
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


# ---------------- feat/exercise-auto-title ----------------
# Like the activities (activity_validation.py): the title is never typed.
# It is always "<Lesson name> – Coding Exercise", built on the server on
# every save (the client's title is ignored) and renamed with its lesson.
EXERCISE_TITLE_TYPE = "Coding Exercise"


def build_exercise_title(lesson_title, number=None):
    """
    "<Lesson name> – Coding Exercise N" (feat/exercise-pool: a lesson holds up
    to 5, numbered 1-5 so titles stay unique), or "" without a lesson name.
    number=None builds the old unnumbered title. Never truncated.
    """
    lesson = (lesson_title or "").strip()
    if not lesson:
        return ""
    title = f"{lesson}{ACTIVITY_TITLE_SEPARATOR}{EXERCISE_TITLE_TYPE}"
    return f"{title} {int(number)}" if number else title


_TITLE_NUMBER_RE = re.compile(r"Coding Exercise (\d+)$")


def exercise_number(title):
    """The N of "... – Coding Exercise N" (an old unnumbered title counts as 1)."""
    match = _TITLE_NUMBER_RE.search(title or "")
    return int(match.group(1)) if match else 1


def next_exercise_number(cursor, resource_id, exercise_id=None):
    """
    The number for an exercise of this lesson: an existing exercise keeps its
    own; a new one takes the lowest number 1-5 not used by the lesson's
    other non-archived exercises.
    """
    cursor.execute(
        f"""SELECT ce.exercise_id, ce.exercise_title FROM {CODING_EXERCISES_TABLE} ce
            LEFT JOIN {LA_STATS_TABLE} s ON ce.exercise_stats_id = s.la_stats_id
            WHERE ce.resource_id = %s AND COALESCE(ce.is_archived, 0) = 0
              AND COALESCE(s.la_stats_name, '') != 'Archived'""",
        (resource_id,)
    )
    rows = cursor.fetchall()
    used = set()
    for r in rows:
        if exercise_id and r["exercise_id"] == exercise_id:
            return exercise_number(r["exercise_title"])
        used.add(exercise_number(r["exercise_title"]))
    return next((n for n in range(1, 100) if n not in used), len(used) + 1)


def validate_generated_exercise_title(title, exclude_exercise_id=None):
    """(is_valid, message_or_title) for a title from build_exercise_title() - kept exactly as built."""
    title = (title or "").strip()
    if not title:
        return False, "Please select a lesson."
    is_valid, _msg = validate_title_length(title, "exercise", "Exercise title")
    if not is_valid:
        return False, (f'This lesson\'s name is too long to build the exercise title ("{title}"). '
                       "Please shorten the lesson name first.")
    taken = is_exercise_title_taken(title, exclude_exercise_id=exclude_exercise_id,
                                    format_case=False, skip_archived=True)
    if taken is None:
        return False, "Database connection unavailable. Could not verify title uniqueness."
    if taken:
        return False, f'A coding exercise named "{title}" already exists.'
    return True, title


def sync_lesson_exercise_titles(cursor, resource_id, lesson_title, changed_by=None):
    """
    After a lesson is renamed, rename ALL its exercises (archived ones too,
    so a later restore already has the right name). Runs on the caller's
    cursor, inside the caller's transaction; each change is logged in Name
    History. Lesson names are unique, so the new titles can't collide.
    Returns how many exercises were renamed.
    """
    if not build_exercise_title(lesson_title):
        return 0
    cursor.execute(
        f"SELECT exercise_id, exercise_title FROM {CODING_EXERCISES_TABLE} WHERE resource_id = %s",
        (resource_id,)
    )
    renamed = 0
    for row in cursor.fetchall():
        exercise_id, old_title = (row["exercise_id"], row["exercise_title"]) if isinstance(row, dict) else row
        # feat/exercise-pool: each exercise keeps its number (an old
        # unnumbered title stays unnumbered).
        number = exercise_number(old_title) if _TITLE_NUMBER_RE.search(old_title or "") else None
        new_title = build_exercise_title(lesson_title, number)
        if old_title == new_title:
            continue
        cursor.execute(
            f"UPDATE {CODING_EXERCISES_TABLE} SET exercise_title = %s, updated_at = NOW() WHERE exercise_id = %s",
            (new_title, exercise_id)
        )
        log_title_change(cursor, "exercise", exercise_id, old_title, new_title, changed_by)
        renamed += 1
    return renamed


def _fmt_date(dt):
    """e.g. 'Aug 26, 2026'."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _fmt_datetime(dt):
    """e.g. 'Oct 5, 2026 4:53 PM' (admin_time.fmt_datetime - one format for the admin side)"""
    return fmt_datetime(dt)


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
    Fetches a single coding exercise for the editor, with its required
    tags and Given input. An exercise never saved in the new form shows
    the Expected Output / Given input of its first old test case
    (legacy_prefilled), so saving it once converts it.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        ensure_output_exercise_schema(connection)
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

        spec = load_exercise_spec(cursor, exercise_id)
        cursor.close()
        exercise["expected_answer"] = spec["expected_output"]
        exercise["given_input"] = spec["given_input"]
        exercise["required_tags"] = [tag_dict(kind, value) for kind, value in spec["tags"]]
        exercise["legacy_prefilled"] = spec["legacy"]
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
        ensure_output_exercise_schema(connection)
        cursor = connection.cursor()
        cursor.execute(f"DELETE FROM {TEST_CASES_TABLE} WHERE exercise_id = %s", (exercise_id,))
        cursor.execute(f"DELETE FROM {REQUIRED_TAGS_TABLE} WHERE exercise_id = %s", (exercise_id,))
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


def clean_test_text(value):
    r"""
    The shape old test-case text (Input, Expected Output) was saved in -
    used to read an old exercise's first test case (load_exercise_spec):

      - Windows / old-Mac line endings become "\n" (a <textarea> submits
        "\r\n", Python prints "\n")
      - spaces at the END of each line are dropped
      - blank lines and spaces around the whole text are dropped

    Nothing else changes: the words, capital letters, punctuation and
    the spaces inside a line must still match exactly.
    """
    text = str(value if value is not None else "").replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in text.split("\n")).strip()


def keep_as_typed(value):
    r"""Expected Output and Given input are saved exactly as typed - only
    Windows line endings (what a <textarea> submits) become "\n"."""
    return str(value if value is not None else "").replace("\r\n", "\n").replace("\r", "\n")


def tag_dict(kind, value):
    return {"kind": kind, "value": value, "label": tag_label(kind, value)}


def parse_required_tags(raw_tags):
    """
    The mentor's "Required in the code" picks -> [{"kind", "value", "label"}],
    valid and de-duplicated, in the order picked. Each pick is
    "kind:value" (the form's required_tags fields) or a {"kind", "value"} dict.
    """
    tags, seen = [], set()
    for raw in raw_tags or []:
        if isinstance(raw, dict):
            kind, value = raw.get("kind"), raw.get("value")
        else:
            kind, _, value = str(raw).partition(":")
        tag = normalize_tag(kind, value)
        if tag and tag not in seen:
            seen.add(tag)
            tags.append(tag_dict(*tag))
    return tags


def parse_required_tags_from_form(form_data):
    """required_tags fields of the mentor form (one per chip)."""
    return parse_required_tags(form_data.getlist("required_tags"))


def load_exercise_spec(cursor, exercise_id):
    """
    What an exercise is graded on, with the caller's cursor:
      {"expected_output", "given_input", "tags": [(kind, value)],
       "correct_feedback", "legacy": bool}
    or None when the exercise does not exist.

    legacy: never saved in the new form (given_input IS NULL) and it has an
    old exact-output test case - that row's expected_output / test_input
    are used (read-only), because expected_answer held the mentor's answer
    CODE back then, not what the program prints.
    """
    cursor.execute(
        f"""SELECT expected_answer, given_input, correct_feedback
            FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s""",
        (exercise_id,)
    )
    row = cursor.fetchone()
    if not row:
        return None
    cursor.execute(
        f"""SELECT tag_kind, tag_value FROM {REQUIRED_TAGS_TABLE}
            WHERE exercise_id = %s ORDER BY tag_order ASC, tag_row_id ASC""",
        (exercise_id,)
    )
    spec = {
        "expected_output": keep_as_typed(row["expected_answer"]),
        "given_input": keep_as_typed(row["given_input"]),
        "tags": [(r["tag_kind"], r["tag_value"]) for r in cursor.fetchall()],
        "correct_feedback": row["correct_feedback"] or "",
        "legacy": False,
    }
    if row["given_input"] is None:
        # SELECT * - old databases may not have the case_type column yet.
        cursor.execute(
            f"""SELECT * FROM {TEST_CASES_TABLE} WHERE exercise_id = %s
                ORDER BY test_order ASC, test_case_id ASC""",
            (exercise_id,)
        )
        first = next((r for r in cursor.fetchall() if (r.get("case_type") or CASE_OUTPUT) == CASE_OUTPUT), None)
        if first:
            spec.update(expected_output=clean_test_text(first["expected_output"]),
                        given_input=clean_test_text(first["test_input"]), legacy=True)
    return spec


def save_coding_exercise(data: dict, status: str = 'Draft', uploaded_by: str = None):
    """
    Task #76: Persists a coding exercise with its Given input and required
    tags (feat/output-based-exercises) with atomic transaction handling. Supports both Save Draft (status='Draft')
    and Publish (status='Published').

    Returns:
        (success: bool, exercise_id: int | None, message: str)
    """
    connection = get_db_connection()
    if connection is None:
        return False, None, "Database connection unavailable."

    try:
        ensure_exercise_stats(connection)
        ensure_title_history(connection)  # before any write - DDL commits implicitly
        ensure_output_exercise_schema(connection)
        cursor = connection.cursor(dictionary=True)

        exercise_id = data.get('exercise_id')
        if exercise_id:
            try:
                exercise_id = int(exercise_id)
            except (ValueError, TypeError):
                exercise_id = None

        resource_id = data.get('resource_id') or data.get('lesson_id')
        if not resource_id:
            cursor.close()
            return False, None, "A valid Lesson must be selected."
        try:
            resource_id = int(resource_id)
        except (ValueError, TypeError):
            cursor.close()
            return False, None, "Invalid Lesson ID."

        # feat/exercise-auto-title: the client's title is ignored.
        # feat/exercise-pool: numbered 1-5 within the lesson.
        formatted_title = build_exercise_title(get_lesson_title(resource_id, connection),
                                               next_exercise_number(cursor, resource_id, exercise_id))
        is_valid, title_msg = validate_generated_exercise_title(formatted_title, exclude_exercise_id=exercise_id)
        if not is_valid:
            cursor.close()
            return False, None, title_msg

        points = data.get('points')
        try:
            points = max(1, int(points)) if points else 10
        except (ValueError, TypeError):
            points = 10

        instruction = (data.get('instruction') or '').strip()
        situation = (data.get('situation') or '').strip()
        problem_question = (data.get('problem_question') or '').strip()
        clue = (data.get('clue') or '').strip()
        # Expected Output + Given input: exactly as typed (no first-letter
        # capital, no trimming). given_input is never NULL once saved here.
        expected_answer = keep_as_typed(data.get('expected_answer'))
        given_input = keep_as_typed(data.get('given_input'))
        correct_feedback = (data.get('correct_feedback') or '').strip()
        required_tags = parse_required_tags(data.get('required_tags'))

        # Resolve status id
        status_name = status if status in ('Draft', 'Published', 'Archived') else 'Draft'
        cursor.execute(f"SELECT la_stats_id FROM {LA_STATS_TABLE} WHERE la_stats_name = %s", (status_name,))
        stat_row = cursor.fetchone()
        stats_id = stat_row['la_stats_id'] if stat_row else (1 if status_name == 'Draft' else 2)

        # Fallback uploaded_by
        uploader = uploaded_by or data.get('uploaded_by') or 'Admin'

        # feat/exercise-pool: a lesson holds a pool of up to five exercises
        # (each learner gets one). Was: one per lesson.
        from exercise_pool import lesson_exercise_count, EXERCISE_POOL_MAX
        if lesson_exercise_count(cursor, resource_id, exclude_id=exercise_id) >= EXERCISE_POOL_MAX:
            cursor.close()
            return False, None, (
                f"This lesson already has {EXERCISE_POOL_MAX} coding exercises, the most a lesson can have - "
                "edit one of them instead."
            )

        if exercise_id:
            cursor.execute(
                f"SELECT exercise_title FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s",
                (exercise_id,)
            )
            old_row = cursor.fetchone()
            # feat/publishing-tree: saving NEVER changes the status - a
            # Published exercise stays live (shown as "Edited" on the
            # Publishing page). `status` only applies to a brand-new row.
            update_sql = f"""
                UPDATE {CODING_EXERCISES_TABLE}
                SET
                    exercise_title = %s,
                    resource_id = %s,
                    points = %s,
                    instruction = %s,
                    situation = %s,
                    problem_question = %s,
                    clue = %s,
                    expected_answer = %s,
                    given_input = %s,
                    correct_feedback = %s,
                    updated_at = NOW()
                WHERE exercise_id = %s
            """
            cursor.execute(update_sql, (
                formatted_title, resource_id, points,
                instruction, situation, problem_question, clue,
                expected_answer, given_input, correct_feedback, exercise_id
            ))
            if old_row:
                # uploaded_by (not the 'Admin' fallback) - changed_by must be a real account
                log_title_change(cursor, "exercise", exercise_id, old_row["exercise_title"], formatted_title, uploaded_by)
            cursor.execute(f"DELETE FROM {REQUIRED_TAGS_TABLE} WHERE exercise_id = %s", (exercise_id,))
        else:
            insert_sql = f"""
                INSERT INTO {CODING_EXERCISES_TABLE}
                (
                    exercise_title, resource_id, points, exercise_stats_id,
                    instruction, situation, problem_question, clue,
                    expected_answer, given_input, correct_feedback, uploaded_by,
                    created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            """
            cursor.execute(insert_sql, (
                formatted_title, resource_id, points, stats_id,
                instruction, situation, problem_question, clue,
                expected_answer, given_input, correct_feedback, uploader
            ))
            exercise_id = cursor.lastrowid
            log_title_change(cursor, "exercise", exercise_id, None, formatted_title, uploaded_by)

        for order, tag in enumerate(required_tags, start=1):
            cursor.execute(
                f"""INSERT INTO {REQUIRED_TAGS_TABLE} (exercise_id, tag_kind, tag_value, tag_order)
                    VALUES (%s, %s, %s, %s)""",
                (exercise_id, tag["kind"], tag["value"], order)
            )

        connection.commit()
        cursor.close()

        return True, exercise_id, "Coding exercise saved successfully."

    except Error as e:
        connection.rollback()
        print(f"coding_exercises: failed to save exercise: {e}")
        return False, None, f"Database error while saving coding exercise: {e}"
    finally:
        if connection.is_connected():
            connection.close()