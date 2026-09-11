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
from text_formatting import format_display_name, format_sentence_case  # NEW: sentence-case normalization for Category/Module names; format_sentence_case (Task #77) additionally restarts casing after every period, for Module Name + Description

CATEGORY_TABLE = "category_tbl"
MODULES_TABLE = "modules_tbl"
MODULE_STATS_TABLE = "module_stats_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LR_STATS_TABLE = "learning_resources_stats_tbl"

# Task requirement: these three statuses must exist in module_stats_tbl.
# Never hardcoded anywhere else in the app - every other file reads them
# from the database via get_module_stats_options().
DEFAULT_STATUSES = ["Published", "Draft", "Archived"]

_module_stats_ensured = False

# ------------------------------------------------------------------
# Task #27 & #87: Soft Delete / Archive - lazy migration flags
# ------------------------------------------------------------------
# Mirrors admin_routes.py's _ensure_mobile_column() pattern: idempotent,
# gated behind a module-level flag so "ADD COLUMN IF NOT EXISTS" only
# actually round-trips to the database once per running process, not on
# every single request.
_is_archived_column_ensured = False
_is_category_archived_column_ensured = False


def ensure_is_archived_column(connection):
    """
    Task #27 - adds modules_tbl.is_archived (TINYINT(1) NOT NULL DEFAULT 0)
    if it doesn't already exist yet.
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


def ensure_category_is_archived_column(connection):
    """
    Task #87 - adds category_tbl.is_archived (TINYINT(1) NOT NULL DEFAULT 0)
    if it doesn't already exist yet.
    """
    global _is_category_archived_column_ensured
    if _is_category_archived_column_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {CATEGORY_TABLE} ADD COLUMN IF NOT EXISTS "
            f"is_archived TINYINT(1) NOT NULL DEFAULT 0"
        )
        connection.commit()
        cursor.close()
        _is_category_archived_column_ensured = True
    except Error as e:
        print(f"manage_course: failed to ensure {CATEGORY_TABLE}.is_archived column exists: {e}")



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
def get_categories(include_archived=False):
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        ensure_category_is_archived_column(connection)
        cursor = connection.cursor(dictionary=True)
        where_clause = "" if include_archived else "WHERE COALESCE(is_archived, 0) = 0"
        cursor.execute(f"SELECT cat_id, category_name FROM {CATEGORY_TABLE} {where_clause} ORDER BY category_name ASC")
        rows = cursor.fetchall()
        cursor.close()
        return rows
    except Error as e:
        print(f"manage_course: failed to load categories: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


def get_categories_with_modules(include_archived=False):
    """
    Backs the Categories modal - every active category, each with its own list
    of active modules (module_name, description, status_name), so the frontend
    can render the accordion straight from one payload instead of N+1 requests.
    """
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        ensure_category_is_archived_column(connection)
        ensure_is_archived_column(connection)
        cursor = connection.cursor(dictionary=True)
        where_clause = "" if include_archived else "WHERE COALESCE(is_archived, 0) = 0"
        cursor.execute(f"SELECT cat_id, category_name FROM {CATEGORY_TABLE} {where_clause} ORDER BY category_name ASC")
        categories = cursor.fetchall()

        cursor.execute(
            f"""
            SELECT m.module_id, m.module_name, m.description, m.cat_id,
                   COALESCE(ms.module_stats_name, 'Draft') AS status_name
            FROM {MODULES_TABLE} m
            LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
            WHERE COALESCE(m.is_archived, 0) = 0
              AND COALESCE(ms.module_stats_name, '') != 'Archived'
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
    # Task: Category names are auto-formatted to sentence case
    # ("pYtHoN bAsIcS" -> "Python basics") before any validation,
    # duplicate check, or save - see text_formatting.format_display_name().
    name = format_display_name(category_name)
    if not name:
        return False, "Category name is required.", None

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        ensure_category_is_archived_column(connection)
        cursor = connection.cursor()
        # Prevent duplicate active category names (case-insensitive).
        cursor.execute(f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE LOWER(category_name) = LOWER(%s) AND is_archived = 0", (name,))
        if cursor.fetchone():
            cursor.close()
            return False, "A category with this name already exists.", None

        cursor.execute(f"INSERT INTO {CATEGORY_TABLE} (category_name, is_archived) VALUES (%s, 0)", (name,))
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
    # Task: same sentence-case formatting as create_category() above,
    # so a rename always ends up in the same normalized form.
    name = format_display_name(category_name)
    if not name:
        return False, "Category name is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_category_is_archived_column(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE LOWER(category_name) = LOWER(%s) AND cat_id != %s AND is_archived = 0",
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


def archive_category(cat_id):
    """
    Task #87: Soft Delete / Archive for Categories.
    Marks category as archived (is_archived = 1).
    Fails safely if there are active (non-archived) modules belonging to it.
    """
    if not cat_id:
        return False, "Category ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_category_is_archived_column(connection)
        ensure_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(f"SELECT is_archived FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Category not found."

        if row[0]:
            cursor.close()
            return False, "This category is already archived."

        # Prevent archiving if active modules still reference this category
        cursor.execute(
            f"SELECT COUNT(*) FROM {MODULES_TABLE} WHERE cat_id = %s AND is_archived = 0",
            (cat_id,)
        )
        (active_count,) = cursor.fetchone()
        if active_count > 0:
            cursor.close()
            return False, (
                f"Cannot archive this category - {active_count} active module(s) still belong to it. "
                "Please archive or reassign those modules first."
            )

        cursor.execute(
            f"UPDATE {CATEGORY_TABLE} SET is_archived = 1 WHERE cat_id = %s AND is_archived = 0",
            (cat_id,)
        )
        connection.commit()
        cursor.close()
        return True, "Category archived successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to archive category: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def restore_category(cat_id):
    """
    Task #87: Flips a category's is_archived flag back to 0.
    """
    if not cat_id:
        return False, "Category ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_category_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(f"SELECT is_archived FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Category not found."

        if not row[0]:
            cursor.close()
            return False, "This category is not archived."

        cursor.execute(
            f"UPDATE {CATEGORY_TABLE} SET is_archived = 0 WHERE cat_id = %s AND is_archived = 1",
            (cat_id,)
        )
        connection.commit()
        cursor.close()
        return True, "Category restored successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to restore category: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def permanently_delete_category(cat_id):
    """
    Task #87: Permanently deletes an archived category from category_tbl.
    Enforces referential integrity - blocks deletion if any module (active or archived)
    still references this cat_id.
    """
    if not cat_id:
        return False, "Category ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_category_is_archived_column(connection)
        ensure_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(f"SELECT is_archived FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Category not found."

        if not row[0]:
            cursor.close()
            return False, "This category must be archived before it can be permanently deleted."

        cursor.execute(f"SELECT COUNT(*) FROM {MODULES_TABLE} WHERE cat_id = %s", (cat_id,))
        (module_count,) = cursor.fetchone()
        if module_count > 0:
            cursor.close()
            return False, (
                f"Cannot permanently delete this category - {module_count} module(s) (including archived) "
                "still reference it. Permanently delete or reassign those modules first."
            )

        cursor.execute(
            f"DELETE FROM {CATEGORY_TABLE} WHERE cat_id = %s AND is_archived = 1",
            (cat_id,)
        )
        connection.commit()
        deleted_rows = cursor.rowcount
        cursor.close()

        if deleted_rows == 0:
            return False, "This category could not be deleted (it may no longer be archived)."

        return True, "Category permanently deleted."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to permanently delete category: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def get_archived_categories(search_query=None, page=1, per_page=8):
    """
    Task #87: Pulls paginated archived categories with module count.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        ensure_category_is_archived_column(connection)
        ensure_is_archived_column(connection)
        cursor = connection.cursor(dictionary=True)

        base_query = f"FROM {CATEGORY_TABLE} c WHERE c.is_archived = 1"
        params = []

        term = (search_query or "").strip()
        if term:
            base_query += " AND LOWER(c.category_name) LIKE %s"
            params.append(f"%{term.lower()}%")

        cursor.execute(f"SELECT COUNT(*) AS total {base_query}", tuple(params))
        total = cursor.fetchone()["total"]

        page = max(1, page)
        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(page, total_pages)
        offset = (page - 1) * per_page

        cursor.execute(
            f"""
            SELECT c.cat_id, c.category_name,
                   (SELECT COUNT(*) FROM {MODULES_TABLE} m WHERE m.cat_id = c.cat_id) AS module_count
            {base_query}
            ORDER BY c.category_name ASC
            LIMIT %s OFFSET %s
            """,
            tuple(params) + (per_page, offset)
        )
        rows = cursor.fetchall()
        cursor.close()

        categories = []
        for r in rows:
            categories.append({
                "cat_id": r["cat_id"],
                "category_name": r["category_name"],
                "module_count": r.get("module_count", 0)
            })

        return {
            "categories": categories,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages
        }
    except Error as e:
        print(f"manage_course: failed to load archived categories: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def delete_category(cat_id):
    """
    Soft-archives a category via archive_category(cat_id).
    """
    return archive_category(cat_id)



# ================================================================
# MODULES
# ================================================================
def create_module(module_name, description, cat_id, module_stats_id):
    # Task #77: Module Name AND Description are both auto-formatted to
    # sentence case via format_sentence_case() - which, unlike
    # format_display_name() (still used for Category names), restarts
    # capitalization after every period so a multi-sentence Description
    # (or Module Name) is fully sentence-cased, not just its first word.
    name = format_sentence_case(module_name)
    desc = format_sentence_case(description)

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


def update_module(module_id, module_name, description, cat_id, module_stats_id=None):
    # Task #77: same period-aware sentence-case formatting as
    # create_module() above, so editing an existing Module always ends
    # up in the same normalized form (e.g. "INTRODUCTION TO PYTHON. THIS
    # IS THE FIRST LESSON." -> "Introduction to python. This is the
    # first lesson.").
    name = format_sentence_case(module_name)
    desc = format_sentence_case(description)

    if not name:
        return False, "Module name is required."
    if not desc:
        return False, "Description is required."
    if not cat_id:
        return False, "Category is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()
        # updated_at bumped, created_at intentionally left untouched.
        if module_stats_id:
            cursor.execute(
                f"""UPDATE {MODULES_TABLE}
                    SET module_name = %s, description = %s, cat_id = %s,
                        module_stats_id = %s, updated_at = NOW()
                    WHERE module_id = %s""",
                (name, desc, cat_id, module_stats_id, module_id)
            )
        else:
            cursor.execute(
                f"""UPDATE {MODULES_TABLE}
                    SET module_name = %s, description = %s, cat_id = %s,
                        updated_at = NOW()
                    WHERE module_id = %s""",
                (name, desc, cat_id, module_id)
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


def publish_module(module_id):
    """
    Task #90: Sets a module's status to 'Published'.
    """
    if not module_id:
        return False, "Module ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_module_stats(connection)
        ensure_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT module_stats_id FROM {MODULE_STATS_TABLE} WHERE module_stats_name = 'Published' LIMIT 1"
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Published status not found."
        published_id = row[0]

        cursor.execute(
            f"""UPDATE {MODULES_TABLE}
                SET module_stats_id = %s, is_archived = 0, updated_at = NOW()
                WHERE module_id = %s""",
            (published_id, module_id)
        )
        connection.commit()
        cursor.close()
        return True, "Module published successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to publish module: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def unpublish_module(module_id):
    """
    Task #90: Sets a module's status to 'Draft'.
    """
    if not module_id:
        return False, "Module ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_module_stats(connection)
        ensure_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT module_stats_id FROM {MODULE_STATS_TABLE} WHERE module_stats_name = 'Draft' LIMIT 1"
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Draft status not found."
        draft_id = row[0]

        cursor.execute(
            f"""UPDATE {MODULES_TABLE}
                SET module_stats_id = %s, updated_at = NOW()
                WHERE module_id = %s""",
            (draft_id, module_id)
        )
        connection.commit()
        cursor.close()
        return True, "Module unpublished successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to unpublish module: {e}")
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

    Task #79 - Published modules cannot be archived directly:
    A module's CURRENT status is read fresh from modules_tbl (joined
    against module_stats_tbl for the real status name - never a raw
    module_stats_id, and never anything supplied by the caller/frontend)
    immediately before the archive UPDATE. If that status is
    "Published", the archive is rejected here - the one and only place
    this rule is enforced - and the row is left completely untouched
    (still Published, still is_archived = 0). The admin must explicitly
    change the module to "Draft" first (the existing update_module()
    flow already supports this); this function never auto-downgrades a
    Published module to Draft on the caller's behalf.

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

        # Task #79: pulls both is_archived AND the module's real,
        # current status name in one query - is_archived alone (the
        # original check below) can't tell a Published module from a
        # Draft one, and module_stats_id alone would be a raw FK id,
        # not the actual status name this rule needs to compare against.
        cursor.execute(
            f"""SELECT m.is_archived, ms.module_stats_name
                FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE m.module_id = %s""",
            (module_id,)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Module not found."

        is_archived, status_name = row
        if is_archived:
            cursor.close()
            return False, "This module is already archived."

        # Task #79, Requirement 1 & 3: reject BEFORE the archive UPDATE
        # ever runs, based solely on the database's own status value -
        # never a status the frontend happened to display or send.
        if status_name == "Published":
            cursor.close()
            return False, (
                "Published modules cannot be archived. Please change the "
                "module status to Draft first."
            )

        # Task #91: Check if there are active learning resources attached to this module
        cursor.execute(
            f"""SELECT COUNT(*)
                FROM {LEARNING_RESOURCES_TABLE} lr
                LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE lr.module_id = %s
                  AND (lrs.lr_stats_name IS NULL OR lrs.lr_stats_name != 'Archived')""",
            (module_id,)
        )
        (resource_count,) = cursor.fetchone()
        if resource_count > 0:
            cursor.close()
            return False, (
                "Cannot archive this module because it has attached learning resources. "
                "Please delete or reassign the resources first."
            )

        cursor.execute(
            f"""UPDATE {MODULES_TABLE}
                SET is_archived = 1, updated_at = NOW()
                WHERE module_id = %s AND COALESCE(is_archived, 0) = 0""",
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

        cursor.execute(
            f"""SELECT m.is_archived, ms.module_stats_name
                FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE m.module_id = %s""",
            (module_id,)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Module not found."
        is_archived, status_name = row
        if not is_archived and status_name != "Archived":
            cursor.close()
            return False, "This module is not archived."

        cursor.execute(
            f"""UPDATE {MODULES_TABLE}
                SET is_archived = 0,
                    module_stats_id = CASE
                        WHEN module_stats_id = (SELECT module_stats_id FROM {MODULE_STATS_TABLE} WHERE module_stats_name = 'Archived' LIMIT 1)
                        THEN (SELECT module_stats_id FROM {MODULE_STATS_TABLE} WHERE module_stats_name = 'Draft' LIMIT 1)
                        ELSE module_stats_id
                    END,
                    updated_at = NOW()
                WHERE module_id = %s""",
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


# ================================================================
# Task #80: PERMANENT DELETE (Archived Modules only)
# ================================================================
def permanently_delete_module(module_id):
    """
    Task #80: PERMANENTLY removes an archived module row from
    modules_tbl - a real DELETE, never another archive/status flip like
    archive_module()/restore_module() above. Only ever callable on a
    module that is already archived (is_archived = 1); this action
    lives exclusively under the Archived Modules view.

    REFERENTIAL INTEGRITY (Requirement #6): per the project's schema
    (cobra_db.sql), modules_tbl is referenced by
    learning_resources_tbl.module_id (fk_lr_module_id) and
    learning_activities_tbl.module_id (fk_la_module_id) - neither
    foreign key is ON DELETE CASCADE, so a bare DELETE would simply
    fail with a foreign-key constraint error the instant either table
    has a row pointing at this module. Rather than guessing that the
    admin also wants those dependent resources/activities destroyed
    (out of scope here, and irreversible), this function fails safe:
    it checks for dependent rows FIRST and, if any exist, blocks the
    delete with a clear explanation instead of a raw database error or
    a silent cascade.

    Returns (bool, str) - (success, message).
    """
    if not module_id:
        return False, "Module ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_is_archived_column(connection)
        cursor = connection.cursor()

        # Confirm the module exists AND is currently archived - a
        # permanent delete may only ever be performed from the Archived
        # Modules list, never the active Manage Course table.
        cursor.execute(
            f"SELECT is_archived FROM {MODULES_TABLE} WHERE module_id = %s",
            (module_id,)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Module not found."

        if not row[0]:
            cursor.close()
            return False, "This module must be archived before it can be permanently deleted."

        # Dependent-record check - never blindly DELETE and let the
        # database throw a raw foreign-key error.
        cursor.execute(
            "SELECT COUNT(*) FROM learning_resources_tbl WHERE module_id = %s",
            (module_id,)
        )
        (resource_count,) = cursor.fetchone()
        cursor.execute(
            "SELECT COUNT(*) FROM learning_activities_tbl WHERE module_id = %s",
            (module_id,)
        )
        (activity_count,) = cursor.fetchone()

        if resource_count > 0 or activity_count > 0:
            cursor.close()
            parts = []
            if resource_count > 0:
                parts.append(f"{resource_count} learning resource(s)")
            if activity_count > 0:
                parts.append(f"{activity_count} learning activity/activities")
            return False, (
                f"Cannot permanently delete this module - {' and '.join(parts)} "
                "still reference it. Remove or reassign them first."
            )

        cursor.execute(
            f"DELETE FROM {MODULES_TABLE} WHERE module_id = %s AND is_archived = 1",
            (module_id,)
        )
        connection.commit()
        deleted_rows = cursor.rowcount
        cursor.close()

        if deleted_rows == 0:
            # Row disappeared/changed state between our checks above and
            # the DELETE (e.g. restored by another admin in the
            # meantime) - report this honestly rather than claiming
            # success.
            return False, "This module could not be deleted (it may no longer be archived)."

        return True, "Module permanently deleted."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to permanently delete module: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def get_modules_overview(search_query=None, status_filter=None, page=1, per_page=8, archived=False,
                          created_from=None, created_to=None, updated_from=None, updated_to=None):
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

    Task #30 - Date filtering (created_from/created_to/updated_from/
    updated_to, each an optional 'YYYY-MM-DD' string):
        - Filters against the REAL modules_tbl.created_at /
          modules_tbl.updated_at columns - never hardcoded/static dates.
        - Compares by DATE ONLY (via SQL DATE(...)), so a timestamp like
          '2026-08-07 18:21:43' still matches a filter of '2026-08-07' -
          the time-of-day portion never excludes an otherwise-matching
          row, and an end date is naturally inclusive through 23:59:59
          of that day since we compare the DATE(), not the full
          timestamp, against the end date.
        - Each of the four bounds is only ever added to the query when
          it was actually supplied - an absent bound adds no
          restriction, and created_at / updated_at filtering are
          independent of each other (both may be active together, per
          Task #30 requirement #8).
        - Composes with search_query/status_filter/pagination exactly
          like every other condition already in this query - all are
          AND'ed together.

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

        if archived:
            base_query = """
                FROM {modules} m
                LEFT JOIN {categories} c ON m.cat_id = c.cat_id
                LEFT JOIN {statuses} ms ON m.module_stats_id = ms.module_stats_id
                WHERE (COALESCE(m.is_archived, 0) = 1 OR ms.module_stats_name = 'Archived')
            """.format(modules=MODULES_TABLE, categories=CATEGORY_TABLE, statuses=MODULE_STATS_TABLE)
            params = []
        else:
            base_query = """
                FROM {modules} m
                LEFT JOIN {categories} c ON m.cat_id = c.cat_id
                LEFT JOIN {statuses} ms ON m.module_stats_id = ms.module_stats_id
                WHERE COALESCE(m.is_archived, 0) = 0
                  AND COALESCE(ms.module_stats_name, '') != 'Archived'
                  AND (COALESCE(c.is_archived, 0) = 0 OR c.cat_id IS NULL)
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

        # ------------------------------------------------------------
        # Task #30: Created At / Updated At date filters
        # ------------------------------------------------------------
        created_from = (created_from or "").strip() or None
        created_to = (created_to or "").strip() or None
        updated_from = (updated_from or "").strip() or None
        updated_to = (updated_to or "").strip() or None

        if created_from:
            base_query += " AND DATE(m.created_at) >= %s"
            params.append(created_from)
        if created_to:
            base_query += " AND DATE(m.created_at) <= %s"
            params.append(created_to)
        if updated_from:
            base_query += " AND DATE(m.updated_at) >= %s"
            params.append(updated_from)
        if updated_to:
            base_query += " AND DATE(m.updated_at) <= %s"
            params.append(updated_to)

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

def get_modules_by_category(cat_id):
    """
    Task #41: returns the active (non-archived) modules belonging to a
    single category, for dependent-dropdown use (e.g. Admin > Learning
    Resources > New Lesson). Only module_id and module_name are needed
    by that dropdown, so this stays a lean, parameterized SELECT rather
    than reusing get_modules_overview()'s full paginated/joined shape.

    cat_id (int | str): the category_tbl.cat_id to filter modules_tbl by.
    Always used as a parameterized value - never concatenated into SQL.

    Returns [] (never raises) if cat_id is falsy, the category has no
    modules, or on any database error - callers should treat an empty
    list as "no modules available for this category" and never fall
    back to hardcoded/mock data.
    """
    if not cat_id:
        return []

    connection = get_db_connection()
    if connection is None:
        return []
    try:
        ensure_is_archived_column(connection)
        ensure_category_is_archived_column(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT m.module_id, m.module_name FROM {MODULES_TABLE} m
                INNER JOIN {CATEGORY_TABLE} c ON m.cat_id = c.cat_id
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE m.cat_id = %s
                  AND COALESCE(m.is_archived, 0) = 0
                  AND COALESCE(c.is_archived, 0) = 0
                  AND COALESCE(ms.module_stats_name, '') != 'Archived'
                ORDER BY m.module_name ASC""",
            (cat_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        return rows
    except Error as e:
        print(f"manage_course: failed to load modules for category {cat_id}: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()

# ================================================================
# ARCHIVE ELIGIBILITY CHECKS (backs the "check before archive" flow
# admin-relational-archive.js already calls, previously missing entirely)
# ================================================================
def check_module_archive_eligibility(module_id):
    """
    Reports WHETHER archive_module(module_id) would currently succeed,
    and why not if it wouldn't - without actually archiving anything.
    Mirrors archive_module()'s own two rejection reasons exactly (a
    Published module, or one with attached active learning resources),
    so this check can never say "eligible" when the real archive call
    would then turn around and reject it.

    Returns (success: bool, eligible: bool | None, blockers: list[str], message: str | None)
    """
    if not module_id:
        return False, None, [], "Module ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, None, [], "Could not connect to the database."

    try:
        ensure_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"""SELECT m.is_archived, ms.module_stats_name
                FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE m.module_id = %s""",
            (module_id,)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, None, [], "Module not found."

        is_archived, status_name = row
        if is_archived:
            cursor.close()
            return False, None, [], "This module is already archived."

        blockers = []
        if status_name == "Published":
            blockers.append("This module itself is Published - change it to Draft first")

        cursor.execute(
            f"""SELECT COUNT(*)
                FROM {LEARNING_RESOURCES_TABLE} lr
                LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE lr.module_id = %s
                  AND (lrs.lr_stats_name IS NULL OR lrs.lr_stats_name != 'Archived')""",
            (module_id,)
        )
        (resource_count,) = cursor.fetchone()
        if resource_count > 0:
            blockers.append(f"{resource_count} attached learning resource(s) - delete or reassign them first")

        cursor.close()
        return True, len(blockers) == 0, blockers, None
    except Error as e:
        print(f"manage_course: failed to check module archive eligibility: {e}")
        return False, None, [], f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def check_category_archive_eligibility(cat_id):
    """
    Reports WHETHER archive_category(cat_id) would currently succeed,
    mirroring its own single rejection reason (active modules still
    belonging to it) exactly.

    Returns (success: bool, eligible: bool | None, blockers: list[str], message: str | None)
    """
    if not cat_id:
        return False, None, [], "Category ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, None, [], "Could not connect to the database."

    try:
        ensure_category_is_archived_column(connection)
        ensure_is_archived_column(connection)
        cursor = connection.cursor()

        cursor.execute(f"SELECT is_archived FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, None, [], "Category not found."
        if row[0]:
            cursor.close()
            return False, None, [], "This category is already archived."

        cursor.execute(
            f"SELECT COUNT(*) FROM {MODULES_TABLE} WHERE cat_id = %s AND is_archived = 0",
            (cat_id,)
        )
        (active_count,) = cursor.fetchone()
        cursor.close()

        blockers = []
        if active_count > 0:
            blockers.append(f"{active_count} active module(s) still belong to it - archive or reassign them first")

        return True, len(blockers) == 0, blockers, None
    except Error as e:
        print(f"manage_course: failed to check category archive eligibility: {e}")
        return False, None, [], f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()