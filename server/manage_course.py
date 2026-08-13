"""
manage_course.py - Task #24: Manage Course Database Integration
------------------------------------------------------------------
Categories + Modules CRUD backing the Admin > Manage Course page.
Pure DB-access helpers (mirrors account_status.py / lockout_logs.py's
style) - admin_routes.py is the only place these get turned into HTTP
responses, so this file never touches Flask/session state directly.
"""

from mysql.connector import Error
from cobradb import get_db_connection

CATEGORY_TABLE = "category_tbl"
MODULES_TABLE = "modules_tbl"
MODULE_STATS_TABLE = "module_stats_tbl"

# Task requirement: these three statuses must exist in module_stats_tbl.
# Never hardcoded anywhere else in the app - every other file reads them
# from the database via get_module_stats_options().
DEFAULT_STATUSES = ["Published", "Draft", "Archived"]

_module_stats_ensured = False

# ------------------------------------------------------------------
# Task #27: Soft Delete / Archive - lazy migration flag
# ------------------------------------------------------------------
# Mirrors admin_routes.py's _ensure_mobile_column() pattern: idempotent,
# gated behind a module-level flag so "ADD COLUMN IF NOT EXISTS" only
# actually round-trips to the database once per running process, not on
# every single request.
_is_archived_column_ensured = False


def ensure_is_archived_column(connection):
    """
    Task #27 - adds modules_tbl.is_archived (TINYINT(1) NOT NULL DEFAULT 0)
    if it doesn't already exist yet. This is intentionally a SEPARATE
    column from module_stats_id/status_name (Published/Draft/Archived) -
    publication status and archive state are different concepts (see
    Task #27 spec, Requirement 12): a module can be Published AND
    archived at the same time. DEFAULT 0 means every existing module
    automatically stays active/non-archived the moment this column is
    added - nothing needs to be backfilled.

    "ADD COLUMN IF NOT EXISTS" (MariaDB 10.4+ / MySQL 8.0.29+) is the
    same idempotent-migration convention already used elsewhere in this
    project (see admin_routes.py's _ensure_mobile_column()).
    """
    global _is_archived_column_ensured
    if _is_archived_column_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {MODULES_TABLE} ADD COLUMN IF NOT EXISTS "
            f"is_archived TINYINT(1) NOT NULL DEFAULT 0"
        )
        connection.commit()
        cursor.close()
        _is_archived_column_ensured = True
    except Error as e:
        print(f"manage_course: failed to ensure {MODULES_TABLE}.is_archived column exists: {e}")


def ensure_module_stats(connection):
    """
    "If these records do not already exist, automatically insert them
    into module_stats_tbl." Idempotent and gated behind a module-level
    flag (same pattern as password_reset_logs._ensure_table) so it only
    round-trips once per process lifetime.
    """
    global _module_stats_ensured
    if _module_stats_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT module_stats_name FROM {MODULE_STATS_TABLE}")
        existing = {row[0] for row in cursor.fetchall()}
        missing = [s for s in DEFAULT_STATUSES if s not in existing]
        for name in missing:
            cursor.execute(
                f"INSERT INTO {MODULE_STATS_TABLE} (module_stats_name) VALUES (%s)",
                (name,)
            )
        if missing:
            connection.commit()
        cursor.close()
        _module_stats_ensured = True
    except Error as e:
        print(f"manage_course: failed to seed module_stats_tbl: {e}")


# ================================================================
# MODULE STATUS OPTIONS (dropdown source - never hardcoded)
# ================================================================
def get_module_stats_options():
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        ensure_module_stats(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT module_stats_id, module_stats_name FROM {MODULE_STATS_TABLE} "
            f"ORDER BY module_stats_id ASC"
        )
        rows = cursor.fetchall()
        cursor.close()
        return rows
    except Error as e:
        print(f"manage_course: failed to load module status options: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


# ================================================================
# CATEGORIES
# ================================================================
def get_categories():
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(f"SELECT cat_id, category_name FROM {CATEGORY_TABLE} ORDER BY category_name ASC")
        rows = cursor.fetchall()
        cursor.close()
        return rows
    except Error as e:
        print(f"manage_course: failed to load categories: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


def get_categories_with_modules():
    """
    Backs the Categories modal - every category, each with its own list
    of modules (module_name, description, status_name), so the frontend
    can render the accordion (Basics -> Introduction to Python, ...)
    straight from one payload instead of N+1 requests.
    """
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(f"SELECT cat_id, category_name FROM {CATEGORY_TABLE} ORDER BY category_name ASC")
        categories = cursor.fetchall()

        cursor.execute(
            f"""
            SELECT m.module_id, m.module_name, m.description, m.cat_id,
                   COALESCE(ms.module_stats_name, 'Draft') AS status_name
            FROM {MODULES_TABLE} m
            LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
            ORDER BY m.module_id ASC
            """
        )
        modules = cursor.fetchall()
        cursor.close()

        by_cat = {}
        for m in modules:
            by_cat.setdefault(m["cat_id"], []).append(m)

        for c in categories:
            c["modules"] = by_cat.get(c["cat_id"], [])

        return categories
    except Error as e:
        print(f"manage_course: failed to load categories with modules: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


def create_category(category_name):
    name = (category_name or "").strip()
    if not name:
        return False, "Category name is required.", None

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        cursor = connection.cursor()
        # Prevent duplicate category names (case-insensitive).
        cursor.execute(f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE LOWER(category_name) = LOWER(%s)", (name,))
        if cursor.fetchone():
            cursor.close()
            return False, "A category with this name already exists.", None

        cursor.execute(f"INSERT INTO {CATEGORY_TABLE} (category_name) VALUES (%s)", (name,))
        connection.commit()
        new_id = cursor.lastrowid
        cursor.close()
        return True, "Category created successfully.", new_id
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to create category: {e}")
        return False, f"Database error: {e}", None
    finally:
        if connection.is_connected():
            connection.close()


def update_category(cat_id, category_name):
    name = (category_name or "").strip()
    if not name:
        return False, "Category name is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE LOWER(category_name) = LOWER(%s) AND cat_id != %s",
            (name, cat_id)
        )
        if cursor.fetchone():
            cursor.close()
            return False, "A category with this name already exists."

        cursor.execute(f"UPDATE {CATEGORY_TABLE} SET category_name = %s WHERE cat_id = %s", (name, cat_id))
        connection.commit()
        cursor.close()
        return True, "Category updated successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to update category: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def delete_category(cat_id):
    """
    Task requirement: "Prevent orphaned Modules ... either preventing
    deletion while modules exist, or reassigning/deleting related
    modules." This implementation takes the safer route: block deletion
    while any module still references this category, so cat_id never
    dangles.
    """
    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT COUNT(*) FROM {MODULES_TABLE} WHERE cat_id = %s", (cat_id,))
        (module_count,) = cursor.fetchone()
        if module_count > 0:
            cursor.close()
            return False, (
                f"Cannot delete this category - {module_count} module(s) still belong to it. "
                "Move or delete those modules first."
            )

        cursor.execute(f"DELETE FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        connection.commit()
        cursor.close()
        return True, "Category deleted successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to delete category: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


# ================================================================
# MODULES
# ================================================================
def create_module(module_name, description, cat_id, module_stats_id):
    name = (module_name or "").strip()
    desc = (description or "").strip()

    if not name:
        return False, "Module name is required.", None
    if not desc:
        return False, "Description is required.", None
    if not cat_id:
        return False, "Category is required.", None
    if not module_stats_id:
        return False, "Status is required.", None

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        ensure_module_stats(connection)
        cursor = connection.cursor()

        # Task #29: prevent duplicate modules WITHIN THE SAME CATEGORY.
        # Uniqueness rule = module_name + cat_id (case-insensitive,
        # already-trimmed `name` above) - mirrors create_category()'s own
        # LOWER(...) = LOWER(%s) duplicate check above, just additionally
        # scoped by cat_id so the exact same module_name remains valid
        # under a DIFFERENT category (existing Category -> Module
        # relationship is respected, never made globally unique).
        cursor.execute(
            f"""SELECT module_id FROM {MODULES_TABLE}
                WHERE LOWER(module_name) = LOWER(%s) AND cat_id = %s""",
            (name, cat_id)
        )
        if cursor.fetchone():
            cursor.close()
            return False, "This module already exists in the selected category.", None

        cursor.execute(
            f"""INSERT INTO {MODULES_TABLE}
                (module_name, description, cat_id, module_stats_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, NOW(), NOW())""",
            (name, desc, cat_id, module_stats_id)
        )
        connection.commit()
        new_id = cursor.lastrowid
        cursor.close()
        return True, "Module created successfully.", new_id
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to create module: {e}")
        return False, f"Database error: {e}", None
    finally:
        if connection.is_connected():
            connection.close()


def update_module(module_id, module_name, description, cat_id, module_stats_id):
    name = (module_name or "").strip()
    desc = (description or "").strip()

    if not name:
        return False, "Module name is required."
    if not desc:
        return False, "Description is required."
    if not cat_id:
        return False, "Category is required."
    if not module_stats_id:
        return False, "Status is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()
        # updated_at bumped, created_at intentionally left untouched.
        cursor.execute(
            f"""UPDATE {MODULES_TABLE}
                SET module_name = %s, description = %s, cat_id = %s,
                    module_stats_id = %s, updated_at = NOW()
                WHERE module_id = %s""",
            (name, desc, cat_id, module_stats_id, module_id)
        )
        connection.commit()
        cursor.close()
        return True, "Module updated successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to update module: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def delete_module(module_id):
    """
    DEPRECATED (Task #27): this used to permanently DELETE a module row.
    The Manage Course "Delete" action now performs a soft delete/archive
    instead (see archive_module() below) - modules are never permanently
    removed from modules_tbl anymore, so admins can always restore one
    later and nothing that references a module_id (e.g. future
    activities/exercises tied to a module) ever dangles.

    Kept here, unused by admin_routes.py, purely for reference/history -
    per this project's convention of preserving deprecated functions
    with documentation instead of deleting them outright.
    """
    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()
        cursor.execute(f"DELETE FROM {MODULES_TABLE} WHERE module_id = %s", (module_id,))
        connection.commit()
        cursor.close()
        return True, "Module deleted successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to delete module: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


# ================================================================
# Task #27: SOFT DELETE / ARCHIVE
# ================================================================
def archive_module(module_id):
    """
    Marks a module as archived (is_archived = 1) instead of deleting its
    row. This is what the existing "Delete" action in Manage Course now
    calls (see admin_routes.py: manage_course_delete_module()).

    - Never runs DELETE FROM modules_tbl.
    - Only flips is_archived; module_name, description, cat_id,
      module_stats_id (publication status), created_at are all left
      untouched. updated_at is bumped, same convention update_module()
      already uses for any other edit to the row.
    - The WHERE clause requires is_archived = 0, so archiving an
      already-archived module is a no-op UPDATE (rowcount 0) rather than
      silently "succeeding" twice - the caller is told exactly why.

    Returns (bool, str).
    """
    if not module_id:
        return False, "Module ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(f"SELECT is_archived FROM {MODULES_TABLE} WHERE module_id = %s", (module_id,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Module not found."
        if row[0]:
            cursor.close()
            return False, "This module is already archived."

        cursor.execute(
            f"""UPDATE {MODULES_TABLE}
                SET is_archived = 1, updated_at = NOW()
                WHERE module_id = %s AND is_archived = 0""",
            (module_id,)
        )
        connection.commit()
        cursor.close()
        return True, "Module archived successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to archive module: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def restore_module(module_id):
    """
    Reverses archive_module(): flips is_archived back to 0 so the module
    reappears in the normal active Manage Course list. Same guarantees
    as archive_module() - only is_archived and updated_at change; the
    module_id, name, description, category, publication status, and
    created_at are all completely unaffected, and no new row is ever
    created.

    Returns (bool, str).
    """
    if not module_id:
        return False, "Module ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(f"SELECT is_archived FROM {MODULES_TABLE} WHERE module_id = %s", (module_id,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Module not found."
        if not row[0]:
            cursor.close()
            return False, "This module is not archived."

        cursor.execute(
            f"""UPDATE {MODULES_TABLE}
                SET is_archived = 0, updated_at = NOW()
                WHERE module_id = %s AND is_archived = 1""",
            (module_id,)
        )
        connection.commit()
        cursor.close()
        return True, "Module restored successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to restore module: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def get_modules_overview(search_query=None, status_filter=None, page=1, per_page=8, archived=False):
    """
    Pulls a page of modules_tbl, JOINed against category_tbl and
    module_stats_tbl so Category Name / Status Name are returned
    directly - never a raw cat_id / module_stats_id.

    search_query matches module_name, description, OR category_name
    (case-insensitive, "contains"). status_filter matches the status's
    display NAME (e.g. "Published"), never a numeric id.

    archived (bool) - Task #27: when False (default), only ACTIVE
    modules (is_archived = 0) are returned - this is what the normal
    Manage Course page shows. When True, only ARCHIVED modules
    (is_archived = 1) are returned - this backs the separate Archived
    Modules view. The two lists never mix: search/filter/pagination are
    always scoped to whichever dataset was requested.

    Returns {"modules": [...], "total": int, "page": int,
    "per_page": int, "total_pages": int}, or None on DB failure.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        ensure_module_stats(connection)
        ensure_is_archived_column(connection)
        cursor = connection.cursor(dictionary=True)

        base_query = """
            FROM {modules} m
            LEFT JOIN {categories} c ON m.cat_id = c.cat_id
            LEFT JOIN {statuses} ms ON m.module_stats_id = ms.module_stats_id
            WHERE m.is_archived = %s
        """.format(modules=MODULES_TABLE, categories=CATEGORY_TABLE, statuses=MODULE_STATS_TABLE)
        params = [1 if archived else 0]

        term = (search_query or "").strip()
        if term:
            base_query += """
                AND (
                    LOWER(m.module_name) LIKE %s
                    OR LOWER(m.description) LIKE %s
                    OR LOWER(c.category_name) LIKE %s
                )
            """
            like_term = f"%{term.lower()}%"
            params.extend([like_term, like_term, like_term])

        status_term = (status_filter or "").strip()
        if status_term and status_term.lower() != "all status":
            base_query += " AND ms.module_stats_name = %s"
            params.append(status_term)

        # Total count (for pagination), before LIMIT/OFFSET.
        cursor.execute(f"SELECT COUNT(*) AS total {base_query}", tuple(params))
        total = cursor.fetchone()["total"]

        page = max(1, page)
        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(page, total_pages)
        offset = (page - 1) * per_page

        cursor.execute(
            f"""
            SELECT
                m.module_id, m.module_name, m.description,
                m.cat_id, c.category_name,
                m.module_stats_id, COALESCE(ms.module_stats_name, 'Draft') AS status_name,
                m.created_at, m.updated_at
            {base_query}
            ORDER BY m.created_at DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params) + (per_page, offset)
        )
        rows = cursor.fetchall()
        cursor.close()

        modules = []
        for row in rows:
            modules.append({
                "module_id": row["module_id"],
                "module_name": row["module_name"],
                "description": row["description"],
                "category": row.get("category_name") or "Uncategorized",
                "status": row["status_name"],
                "created_at": _fmt_date(row.get("created_at")),
                "updated_at": _fmt_date(row.get("updated_at")),
                "is_archived": bool(archived),
            })

        return {
            "modules": modules,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
    except Error as e:
        print(f"manage_course: failed to load modules overview: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def _fmt_date(dt):
    """e.g. 'Jul 12, 2026' - matches admin_routes.py's own _fmt_date()
    convention, written cross-platform (no %-d, which is Linux/macOS
    only) so this works the same on Windows dev machines too."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"