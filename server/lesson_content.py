"""
lesson_content.py - Lesson Name Normalization & Global Uniqueness
--------------------------------------------------------------------
Backs the Learning Resources "New Lesson" form's Lesson Name field.

ASSUMPTION (please correct if wrong): the project files provided don't
include the actual lesson-creation table/route, so this targets the
table already visible in your phpMyAdmin sidebar screenshot -
`lesson_content_tbl` - with a `lesson_name` column, following this
project's exact naming convention (module_name, category_name,
resource_title, etc.). If the real table/column names differ, only
LESSON_TABLE / LESSON_NAME_COLUMN below need to change - nothing else
in this file's logic depends on the specific names.

WHY A NEW FILE
Mirrors manage_course.py's role for category_tbl/modules_tbl: pure
DB-access + normalization helpers, no Flask/session/request handling.
admin_routes.py is the only place this becomes an HTTP response, per
the "don't put substantial logic inline in admin_routes.py" rule.

NORMALIZATION
Reuses text_formatting.format_display_name() - the SAME sentence-case
rule ("pYtHoN bAsIcS" -> "Python basics") already used for Category and
Module names - rather than a second, divergent formatter. This alone
satisfies "first letter uppercase, rest lowercase, whitespace trimmed".

GLOBAL UNIQUENESS
lesson_name_exists() / create_lesson() intentionally take NO cat_id or
module_id filter anywhere in their WHERE clause - the spec requires
checking the entire table regardless of Category/Module grouping.

CASE-INSENSITIVE COMPARISON
Every query uses LOWER(...) = LOWER(%s) explicitly, so correctness
does not depend on the column's collation. ensure_lesson_name_unique_index()
below additionally adds a DB-level UNIQUE index on lesson_name for
race-condition safety - this project's tables already use the
utf8mb4_general_ci collation (case-insensitive), so a plain UNIQUE
index on the column enforces case-insensitive uniqueness at the
database level without any schema redesign or generated column.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from text_formatting import format_display_name

# ASSUMPTION - see module docstring above.
LESSON_TABLE = "lesson_content_tbl"
LESSON_NAME_COLUMN = "lesson_name"

_unique_index_ensured = False


def normalize_lesson_name(raw_name):
    """
    Single source of truth for Lesson Name formatting:
      - trims leading/trailing whitespace
      - first character uppercase, every other character lowercase
    Reuses format_display_name() (Category/Module names' own rule)
    rather than a third copy of this normalization logic.

    "" for None/blank input, matching format_display_name()'s own
    convention so the existing "required" check downstream still
    catches an empty value the same way it always has.
    """
    return format_display_name(raw_name)


def ensure_lesson_name_unique_index(connection):
    """
    Idempotent, best-effort DB-level safety net (Task: "Race Condition
    and Data Integrity") - adds a UNIQUE index on lesson_name so two
    near-simultaneous submissions for the same normalized name can
    never both succeed, even if the application-level check below
    raced.

    Gated behind a module-level flag (same pattern as
    manage_course.ensure_is_archived_column()) so this only actually
    round-trips to the database once per process lifetime. Safe/no-op
    if the index already exists - MySQL/MariaDB raises error 1061
    ("Duplicate key name") in that case, which is caught and ignored
    rather than treated as a failure.

    Never destructive: only ever ADDS an index, never drops/alters
    existing data, and is skipped entirely (logged, not raised) if it
    can't be applied - e.g. existing duplicate rows already violate
    uniqueness. In that case the application-level check in
    lesson_name_exists()/create_lesson() below remains the primary
    guard.
    """
    global _unique_index_ensured
    if _unique_index_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {LESSON_TABLE} "
            f"ADD UNIQUE INDEX uq_{LESSON_NAME_COLUMN} ({LESSON_NAME_COLUMN})"
        )
        connection.commit()
        cursor.close()
        _unique_index_ensured = True
    except Error as e:
        # 1061 = index already exists (expected on every call after the
        # first) - anything else (e.g. pre-existing duplicate rows
        # blocking the constraint) is logged only; this must never
        # block lesson creation, since the app-level check still
        # enforces uniqueness on its own.
        if getattr(e, "errno", None) == 1061:
            _unique_index_ensured = True
        else:
            print(f"lesson_content: could not ensure unique index on {LESSON_NAME_COLUMN}: {e}")


def lesson_name_exists(normalized_name, exclude_lesson_id=None):
    """
    Task: GLOBAL duplicate check - deliberately has no cat_id/module_id
    parameter and adds no such filter to the query, so a lesson named
    "Introduction" in ANY Category/Module collides with a new
    "Introduction" in any other Category/Module.

    Args:
        normalized_name (str): already-normalized (via
            normalize_lesson_name()) candidate name.
        exclude_lesson_id: optional - when editing an existing lesson,
            excludes that lesson's own row from the check so saving it
            unchanged doesn't flag itself as a duplicate of itself.

    Returns:
        bool: True if a case-insensitive match already exists
        anywhere in the table. Returns True on any database error
        (fail-closed) so a DB hiccup can never let a real duplicate
        slip through - the caller should surface a generic "could not
        validate, please try again" rather than silently allowing the
        save.
    """
    if not normalized_name:
        return False

    connection = get_db_connection()
    if connection is None:
        return True  # fail-closed

    try:
        cursor = connection.cursor()
        query = f"SELECT 1 FROM {LESSON_TABLE} WHERE LOWER({LESSON_NAME_COLUMN}) = LOWER(%s)"
        params = [normalized_name]
        if exclude_lesson_id:
            query += " AND lesson_id != %s"
            params.append(exclude_lesson_id)
        query += " LIMIT 1"

        cursor.execute(query, tuple(params))
        found = cursor.fetchone() is not None
        cursor.close()
        return found
    except Error as e:
        print(f"lesson_content: duplicate check failed: {e}")
        return True  # fail-closed
    finally:
        if connection.is_connected():
            connection.close()


def create_lesson(raw_lesson_name, **extra_fields):
    """
    Full validate-then-save flow for a new lesson, per the task's
    required order:
        1. normalize
        2. reject if empty
        3/4/5. global, case-insensitive duplicate check
        6/7. reject with a clear message if a duplicate exists
        8. never insert a duplicate row
        9. otherwise proceed with the insert

    Args:
        raw_lesson_name (str): exactly as submitted by the admin.
        **extra_fields: any other already-validated columns this
            table needs (e.g. cat_id, module_id, content) - passed
            through as-is; this function only owns the lesson_name
            column's own normalization/uniqueness rules, not the rest
            of the row's shape, since that isn't specified here.

    Returns:
        (bool success, str message, normalized_name or None)
    """
    normalized = normalize_lesson_name(raw_lesson_name)
    if not normalized:
        return False, "Lesson name is required.", None

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        ensure_lesson_name_unique_index(connection)
        cursor = connection.cursor()

        # Application-level check first (gives a clean, specific error
        # message rather than a raw duplicate-key exception).
        cursor.execute(
            f"SELECT 1 FROM {LESSON_TABLE} WHERE LOWER({LESSON_NAME_COLUMN}) = LOWER(%s) LIMIT 1",
            (normalized,)
        )
        if cursor.fetchone():
            cursor.close()
            return False, "A lesson with this name already exists.", None

        columns = [LESSON_NAME_COLUMN] + list(extra_fields.keys())
        placeholders = ", ".join(["%s"] * len(columns))
        values = [normalized] + list(extra_fields.values())

        try:
            cursor.execute(
                f"INSERT INTO {LESSON_TABLE} ({', '.join(columns)}) VALUES ({placeholders})",
                tuple(values)
            )
        except Error as insert_err:
            # Belt-and-suspenders: if the UNIQUE index (added above)
            # rejects a name that raced past the SELECT check a moment
            # earlier (two near-simultaneous submissions), surface the
            # SAME clear message instead of a raw DB error.
            if getattr(insert_err, "errno", None) == 1062:  # Duplicate entry
                connection.rollback()
                cursor.close()
                return False, "A lesson with this name already exists.", None
            raise

        connection.commit()
        cursor.close()
        return True, "Lesson created successfully.", normalized

    except Error as e:
        connection.rollback()
        print(f"lesson_content: failed to create lesson: {e}")
        return False, f"Database error: {e}", None
    finally:
        if connection.is_connected():
            connection.close()