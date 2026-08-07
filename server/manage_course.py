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


def get_modules_overview(search_query=None, status_filter=None, page=1, per_page=8):
    """
    Pulls a page of modules_tbl, JOINed against category_tbl and
    module_stats_tbl so Category Name / Status Name are returned
    directly - never a raw cat_id / module_stats_id.

    search_query matches module_name, description, OR category_name
    (case-insensitive, "contains"). status_filter matches the status's
    display NAME (e.g. "Published"), never a numeric id.

    Returns {"modules": [...], "total": int, "page": int,
    "per_page": int, "total_pages": int}, or None on DB failure.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        ensure_module_stats(connection)
        cursor = connection.cursor(dictionary=True)

        base_query = """
            FROM {modules} m
            LEFT JOIN {categories} c ON m.cat_id = c.cat_id
            LEFT JOIN {statuses} ms ON m.module_stats_id = ms.module_stats_id
            WHERE 1 = 1
        """.format(modules=MODULES_TABLE, categories=CATEGORY_TABLE, statuses=MODULE_STATS_TABLE)
        params = []

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