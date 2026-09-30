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
from validators import validate_title_length  # feat/title-char-limit: shared max-length check (limits live in validators.TITLE_LIMITS)
from title_history import ensure_title_history, log_title_change  # feat/module-title-history
from text_formatting import format_display_name, format_sentence_case  # NEW: sentence-case normalization for Category/Module names; format_sentence_case (Task #77) additionally restarts casing after every period, for Module Name + Description

CATEGORY_TABLE = "category_tbl"
MODULES_TABLE = "modules_tbl"
MODULE_STATS_TABLE = "module_stats_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LR_STATS_TABLE = "learning_resources_stats_tbl"
# NEW (Task #123): needed for the recursive Published-dependency check
# and cascade-archive - a Category/Module's "children" go all the way
# down through its Resources' own Video Tutorial, Activities, and
# Coding Exercises, each living in a separate table/status system.
VIDEO_TUTORIALS_TABLE = "video_tutorials_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"  # shared Draft/Published/Archived table - reused by video_stats_id, la_stats_id, and exercise_stats_id alike
LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
ACTIVITY_TYPES_TABLE = "activity_types_tbl"
CODING_EXERCISES_TABLE = "coding_exercises_tbl"

# Task requirement: these three statuses must exist in module_stats_tbl.
# Never hardcoded anywhere else in the app - every other file reads them
# from the database via get_module_stats_options().
DEFAULT_STATUSES = ["Published", "Draft", "Archived", "Ready to Publish"]

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
    ensure_category_stats_id_column(connection)
    ensure_display_order_columns(connection)
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


CATEGORY_STATS_TABLE = "category_stats_tbl"

# Task #publishing-schema: category_tbl has never had a status of its own -
# see resource_publishing.py's "NOTE ON category or module" docstring, which
# already flagged this as a column to add later. Ordered by actual lifecycle
# (Draft -> Ready to Publish -> Published -> Archived) since this is a brand
# new table with no legacy id order to preserve, unlike DEFAULT_STATUSES.
DEFAULT_CATEGORY_STATUSES = ["Draft", "Ready to Publish", "Published", "Archived"]

_category_stats_ensured = False
_category_stats_id_column_ensured = False
_display_order_columns_ensured = False


def ensure_category_stats(connection):
    """
    Creates category_stats_tbl if it doesn't exist yet and seeds it with
    DEFAULT_CATEGORY_STATUSES. Mirrors ensure_module_stats() below exactly.
    """
    global _category_stats_ensured
    if _category_stats_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"CREATE TABLE IF NOT EXISTS {CATEGORY_STATS_TABLE} ("
            f"cat_stats_id INT(10) NOT NULL AUTO_INCREMENT, "
            f"cat_stats_name VARCHAR(50) NOT NULL, "
            f"PRIMARY KEY (cat_stats_id), "
            f"UNIQUE KEY cat_stats_name (cat_stats_name)"
            f") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
        )
        cursor.execute(f"SELECT cat_stats_name FROM {CATEGORY_STATS_TABLE}")
        existing = {row[0] for row in cursor.fetchall()}
        missing = [s for s in DEFAULT_CATEGORY_STATUSES if s not in existing]
        for name in missing:
            cursor.execute(
                f"INSERT INTO {CATEGORY_STATS_TABLE} (cat_stats_name) VALUES (%s)",
                (name,)
            )
        connection.commit()
        cursor.close()
        _category_stats_ensured = True
    except Error as e:
        print(f"manage_course: failed to seed {CATEGORY_STATS_TABLE}: {e}")


def ensure_category_stats_id_column(connection):
    """
    Adds category_tbl.cat_stats_id (nullable FK -> category_stats_tbl) if it
    doesn't exist yet, then backfills every existing category to "Published" -
    they're already live today with no status field saying otherwise, so this
    is the one column here that needs an explicit backfill instead of a safe
    zero/NULL default.
    """
    global _category_stats_id_column_ensured
    if _category_stats_id_column_ensured:
        return
    ensure_category_stats(connection)
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {CATEGORY_TABLE} ADD COLUMN IF NOT EXISTS "
            f"cat_stats_id INT(10) NULL"
        )
        cursor.execute(
            f"SELECT cat_stats_id FROM {CATEGORY_STATS_TABLE} WHERE cat_stats_name = 'Published'"
        )
        published_row = cursor.fetchone()
        if published_row:
            cursor.execute(
                f"UPDATE {CATEGORY_TABLE} SET cat_stats_id = %s WHERE cat_stats_id IS NULL",
                (published_row[0],)
            )
        connection.commit()
        cursor.close()
        _category_stats_id_column_ensured = True
    except Error as e:
        print(f"manage_course: failed to ensure {CATEGORY_TABLE}.cat_stats_id column exists: {e}")


def ensure_display_order_columns(connection):
    """
    Task #publishing-schema: adds display_order (INT NULL) to category_tbl
    and modules_tbl for the Publishing page's drag/up-down reordering, then
    backfills existing rows so nothing jumps around the first time this
    ships. Categories have no created_at, so cat_id stands in for creation
    order. Modules are backfilled per category (not globally) since that's
    the scope reordering actually happens in.
    """
    global _display_order_columns_ensured
    if _display_order_columns_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {CATEGORY_TABLE} ADD COLUMN IF NOT EXISTS "
            f"display_order INT(10) NULL"
        )
        cursor.execute(
            f"ALTER TABLE {MODULES_TABLE} ADD COLUMN IF NOT EXISTS "
            f"display_order INT(10) NULL"
        )

        cursor.execute(
            f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE display_order IS NULL ORDER BY cat_id ASC"
        )
        for position, (cat_id,) in enumerate(cursor.fetchall(), start=1):
            cursor.execute(
                f"UPDATE {CATEGORY_TABLE} SET display_order = %s WHERE cat_id = %s",
                (position, cat_id)
            )

        cursor.execute(f"SELECT cat_id FROM {CATEGORY_TABLE}")
        for (cat_id,) in cursor.fetchall():
            cursor.execute(
                f"SELECT module_id FROM {MODULES_TABLE} "
                f"WHERE cat_id = %s AND display_order IS NULL "
                f"ORDER BY created_at ASC, module_id ASC",
                (cat_id,)
            )
            for position, (module_id,) in enumerate(cursor.fetchall(), start=1):
                cursor.execute(
                    f"UPDATE {MODULES_TABLE} SET display_order = %s WHERE module_id = %s",
                    (position, module_id)
                )

        connection.commit()
        cursor.close()
        _display_order_columns_ensured = True
    except Error as e:
        print(f"manage_course: failed to ensure display_order columns exist: {e}")



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
        # Creation order (first made shows first). category_tbl has no
        # created_at, so cat_id stands in for creation order - same as
        # ensure_display_order_columns() above.
        cursor.execute(f"SELECT cat_id, category_name FROM {CATEGORY_TABLE} {where_clause} ORDER BY cat_id ASC")
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
        cursor.execute(
            f"""SELECT c.cat_id, c.category_name,
                       COALESCE(cs.cat_stats_name, 'Draft') AS status_name
                FROM {CATEGORY_TABLE} c
                LEFT JOIN {CATEGORY_STATS_TABLE} cs ON c.cat_stats_id = cs.cat_stats_id
                {where_clause}
                ORDER BY c.category_name ASC"""
        )
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


def create_category(category_name, changed_by=None):
    # Task: Category names are auto-formatted to sentence case
    # ("pYtHoN bAsIcS" -> "Python basics") before any validation,
    # duplicate check, or save - see text_formatting.format_display_name().
    name = format_display_name(category_name)
    if not name:
        return False, "Category name is required.", None
    is_valid, length_msg = validate_title_length(name, "category", "Category name")
    if not is_valid:
        return False, length_msg, None

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        ensure_category_is_archived_column(connection)
        ensure_title_history(connection)  # before any write - DDL commits implicitly
        cursor = connection.cursor()
        # Prevent duplicate active category names (case-insensitive).
        cursor.execute(f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE LOWER(category_name) = LOWER(%s) AND is_archived = 0", (name,))
        if cursor.fetchone():
            cursor.close()
            return False, "A category with this name already exists.", None

        # feat/publishing-tree: a new chapter starts as Draft on purpose.
        # Before, cat_stats_id was left NULL - shown as Draft, but the
        # one-time backfill in ensure_category_stats_id_column() turned
        # every NULL into Published on the next server restart.
        cursor.execute(
            f"SELECT cat_stats_id FROM {CATEGORY_STATS_TABLE} WHERE cat_stats_name = 'Draft' LIMIT 1"
        )
        draft_row = cursor.fetchone()
        cursor.execute(
            f"INSERT INTO {CATEGORY_TABLE} (category_name, is_archived, cat_stats_id) VALUES (%s, 0, %s)",
            (name, draft_row[0] if draft_row else None)
        )
        new_id = cursor.lastrowid
        log_title_change(cursor, "category", new_id, None, name, changed_by)
        connection.commit()
        cursor.close()
        return True, "Category created successfully.", new_id
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to create category: {e}")
        return False, f"Database error: {e}", None
    finally:
        if connection.is_connected():
            connection.close()


def update_category(cat_id, category_name, changed_by=None):
    # Task: same sentence-case formatting as create_category() above,
    # so a rename always ends up in the same normalized form.
    name = format_display_name(category_name)
    if not name:
        return False, "Category name is required."
    is_valid, length_msg = validate_title_length(name, "category", "Category name")
    if not is_valid:
        return False, length_msg

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_category_is_archived_column(connection)
        ensure_title_history(connection)
        from publishing_actions import ensure_publishing_columns  # adds category_tbl.updated_at (DDL - before any write)
        ensure_publishing_columns(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE LOWER(category_name) = LOWER(%s) AND cat_id != %s AND is_archived = 0",
            (name, cat_id)
        )
        if cursor.fetchone():
            cursor.close()
            return False, "A category with this name already exists."

        cursor.execute(f"SELECT category_name FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        old_row = cursor.fetchone()
        # feat/publishing-tree: updated_at lets the Publishing page show a
        # renamed live chapter as "Edited".
        cursor.execute(f"UPDATE {CATEGORY_TABLE} SET category_name = %s, updated_at = NOW() WHERE cat_id = %s", (name, cat_id))
        if old_row:
            log_title_change(cursor, "category", cat_id, old_row[0], name, changed_by)
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

        # Task #123: replaces the old "blocks on ANY active module"
        # rule - only a PUBLISHED module (or anything Published
        # further down in its resources/video/activities/exercises)
        # blocks the archive. Draft modules and everything under them
        # get cascade-archived below instead of blocking anything.
        category_name_row = None
        cursor.execute(f"SELECT category_name FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        category_name_row = cursor.fetchone()
        category_name = category_name_row[0] if category_name_row else None

        blockers = get_published_dependents_for_category(cursor, cat_id, category_name)
        if blockers:
            cursor.close()
            names = ", ".join(f"{b['title']} ({b['type']})" for b in blockers[:3])
            more = f" and {len(blockers) - 3} more" if len(blockers) > 3 else ""
            return False, (
                f"Cannot archive this category - it still has Published content: {names}{more}. "
                "You must unpublish these items first before you can archive this parent record."
            )

        archived_status_id = _get_archived_status_id(cursor)
        lr_archived_status_id = _get_lr_archived_status_id(cursor)
        cursor.execute(
            f"SELECT module_id FROM {MODULES_TABLE} WHERE cat_id = %s AND is_archived = 0",
            (cat_id,)
        )
        module_ids = [row[0] for row in cursor.fetchall()]
        for m_id in module_ids:
            for resource_id, _title, _status in _get_active_resources_for_module(cursor, m_id):
                if archived_status_id:
                    _cascade_archive_resource_children(cursor, resource_id, archived_status_id)
                if lr_archived_status_id:
                    cursor.execute(
                        f"UPDATE {LEARNING_RESOURCES_TABLE} SET lr_stats_id = %s, updated_at = NOW() WHERE resource_id = %s",
                        (lr_archived_status_id, resource_id)
                    )
            cursor.execute(
                f"UPDATE {MODULES_TABLE} SET is_archived = 1, updated_at = NOW() WHERE module_id = %s",
                (m_id,)
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
def create_module(module_name, description, cat_id, module_stats_id, changed_by=None):
    # Task #77: Module Name AND Description are both auto-formatted to
    # sentence case via format_sentence_case() - which, unlike
    # format_display_name() (still used for Category names), restarts
    # capitalization after every period so a multi-sentence Description
    # (or Module Name) is fully sentence-cased, not just its first word.
    name = format_sentence_case(module_name)
    desc = format_sentence_case(description)

    if not name:
        return False, "Module name is required.", None
    is_valid, length_msg = validate_title_length(name, "module", "Module name")
    if not is_valid:
        return False, length_msg, None
    if not desc:
        return False, "Description is required.", None
    if not cat_id:
        return False, "Category is required.", None

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        ensure_module_stats(connection)
        ensure_title_history(connection)
        cursor = connection.cursor()

        # feat/publishing-tree: no status sent (the Publishing page's
        # "+ Module") -> new modules start as Draft.
        if not module_stats_id:
            cursor.execute(
                f"SELECT module_stats_id FROM {MODULE_STATS_TABLE} WHERE module_stats_name = 'Draft' LIMIT 1"
            )
            draft_row = cursor.fetchone()
            if not draft_row:
                cursor.close()
                return False, "Could not resolve the Draft status.", None
            module_stats_id = draft_row[0]

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
        new_id = cursor.lastrowid
        log_title_change(cursor, "module", new_id, None, name, changed_by)
        connection.commit()
        cursor.close()
        return True, "Module created successfully.", new_id
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to create module: {e}")
        return False, f"Database error: {e}", None
    finally:
        if connection.is_connected():
            connection.close()


def update_module(module_id, module_name, description, cat_id, module_stats_id=None, changed_by=None):
    # Task #77: same period-aware sentence-case formatting as
    # create_module() above, so editing an existing Module always ends
    # up in the same normalized form (e.g. "INTRODUCTION TO PYTHON. THIS
    # IS THE FIRST LESSON." -> "Introduction to python. This is the
    # first lesson.").
    name = format_sentence_case(module_name)
    desc = format_sentence_case(description)

    if not name:
        return False, "Module name is required."
    is_valid, length_msg = validate_title_length(name, "module", "Module name")
    if not is_valid:
        return False, length_msg
    if not desc:
        return False, "Description is required."
    if not cat_id:
        return False, "Category is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_title_history(connection)
        cursor = connection.cursor()
        cursor.execute(f"SELECT module_name FROM {MODULES_TABLE} WHERE module_id = %s", (module_id,))
        old_row = cursor.fetchone()
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
        if old_row:
            log_title_change(cursor, "module", module_id, old_row[0], name, changed_by)
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

def _unpublish_children_of_module(cursor, module_id, target_status_name="Draft"):
    """
    Task #publishing-cascade / Task #7: flips every currently-Published
    lesson under this module (and every currently-Published activity/
    exercise under those lessons) to `target_status_name` - "Draft" when
    called from unpublish_module()'s own Move-to-Draft path, "Ready to
    Publish" when called from the Publishing page's Unpublish path.
    Uses an ALREADY-OPEN cursor - called from unpublish_module(),
    unpublish_module_to_ready(), and move_category_to_draft() while
    walking a whole category's modules.

    Returns (lesson_count, leaf_count) - how many of each were actually
    changed, for the caller's success message. Both are 0 (a no-op) if
    nothing under this module was Published, so this is always safe to
    call regardless of the module's own prior status.
    """
    cursor.execute(
        f"""SELECT lr.resource_id FROM {LEARNING_RESOURCES_TABLE} lr
            LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
            WHERE lr.module_id = %s AND lrs.lr_stats_name = 'Published'""",
        (module_id,)
    )
    resource_ids = [r[0] for r in cursor.fetchall()]
    if not resource_ids:
        return 0, 0

    leaf_count = 0
    placeholders = ", ".join(["%s"] * len(resource_ids))

    cursor.execute(f"SELECT la_stats_id FROM {LA_STATS_TABLE} WHERE la_stats_name = %s", (target_status_name,))
    row = cursor.fetchone()
    la_target_id = row[0] if row else None

    if la_target_id:
        cursor.execute(
            f"""SELECT COUNT(*) FROM {LEARNING_ACTIVITIES_TABLE} la
                LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
                WHERE la.resource_id IN ({placeholders}) AND last.la_stats_name = 'Published'""",
            tuple(resource_ids)
        )
        leaf_count += cursor.fetchone()[0]
        cursor.execute(
            f"""UPDATE {LEARNING_ACTIVITIES_TABLE} la
                LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
                SET la.la_stats_id = %s, la.updated_at = NOW()
                WHERE la.resource_id IN ({placeholders}) AND last.la_stats_name = 'Published'""",
            tuple([la_target_id] + resource_ids)
        )

        cursor.execute(
            f"""SELECT COUNT(*) FROM {CODING_EXERCISES_TABLE} ce
                LEFT JOIN {LA_STATS_TABLE} last ON ce.exercise_stats_id = last.la_stats_id
                WHERE ce.resource_id IN ({placeholders}) AND last.la_stats_name = 'Published'""",
            tuple(resource_ids)
        )
        leaf_count += cursor.fetchone()[0]
        cursor.execute(
            f"""UPDATE {CODING_EXERCISES_TABLE} ce
                LEFT JOIN {LA_STATS_TABLE} last ON ce.exercise_stats_id = last.la_stats_id
                SET ce.exercise_stats_id = %s, ce.updated_at = NOW()
                WHERE ce.resource_id IN ({placeholders}) AND last.la_stats_name = 'Published'""",
            tuple([la_target_id] + resource_ids)
        )

    cursor.execute(f"SELECT lr_stats_id FROM {LR_STATS_TABLE} WHERE lr_stats_name = %s", (target_status_name,))
    row = cursor.fetchone()
    lr_target_id = row[0] if row else None
    if lr_target_id:
        cursor.execute(
            f"""UPDATE {LEARNING_RESOURCES_TABLE}
                SET lr_stats_id = %s, updated_at = NOW()
                WHERE resource_id IN ({placeholders})""",
            tuple([lr_target_id] + resource_ids)
        )

    return len(resource_ids), leaf_count


def publish_module(module_id):
    """
    Task #90: Sets a module's status to 'Published'. Task
    #publishing-cascade adds the missing gate: a module can only be
    published if its parent CATEGORY is itself already Published -
    mirrors resource_publishing.publish_resource()'s own gate one
    level up.
    """
    if not module_id:
        return False, "Module ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_module_stats(connection)
        ensure_is_archived_column(connection)
        ensure_category_stats_id_column(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"""SELECT COALESCE(cs.cat_stats_name, 'Draft')
                FROM {MODULES_TABLE} m
                LEFT JOIN {CATEGORY_TABLE} c ON m.cat_id = c.cat_id
                LEFT JOIN {CATEGORY_STATS_TABLE} cs ON c.cat_stats_id = cs.cat_stats_id
                WHERE m.module_id = %s""",
            (module_id,)
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Module not found."

        category_status = row[0]
        if category_status != "Published":
            cursor.close()
            return False, (
                f"Cannot publish this module - its parent category is still in "
                f"{category_status} status. Publish the parent category first."
            )

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

        lesson_count, leaf_count = _unpublish_children_of_module(cursor, module_id)

        connection.commit()
        cursor.close()
        if lesson_count or leaf_count:
            return True, (
                f"Module moved back to Draft. Also unpublished {lesson_count} lesson(s) "
                f"and {leaf_count} activity/exercise item(s) under it."
            )
        return True, "Module unpublished successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to unpublish module: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def mark_module_ready_to_publish(module_id):
    """
    Task #publishing-schema: flips a module's status to "Ready to
    Publish" - the queue the new Publishing page's Ready to Publish tab
    reads from.

    Task #10 gate: a module can only queue as Ready to Publish if its
    parent CATEGORY has itself already left Draft (i.e. is "Ready to
    Publish" or "Published") - a child should never be able to sit
    further along the pipeline than its own parent.
    """
    if not module_id:
        return False, "Module ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_module_stats(connection)
        ensure_category_stats_id_column(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"""SELECT COALESCE(cs.cat_stats_name, 'Draft')
                FROM {MODULES_TABLE} m
                LEFT JOIN {CATEGORY_TABLE} c ON m.cat_id = c.cat_id
                LEFT JOIN {CATEGORY_STATS_TABLE} cs ON c.cat_stats_id = cs.cat_stats_id
                WHERE m.module_id = %s""",
            (module_id,)
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Module not found."

        category_status = row[0]
        if category_status not in ("Ready to Publish", "Published"):
            cursor.close()
            return False, (
                f"Cannot mark this module Ready to Publish - its parent category is still "
                f"in Draft status. Mark the parent category Ready to Publish first."
            )

        cursor.execute(
            f"SELECT module_stats_id FROM {MODULE_STATS_TABLE} WHERE module_stats_name = 'Ready to Publish' LIMIT 1"
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Ready to Publish status not found."
        ready_id = row[0]

        cursor.execute(
            f"""UPDATE {MODULES_TABLE}
                SET module_stats_id = %s, updated_at = NOW()
                WHERE module_id = %s""",
            (ready_id, module_id)
        )
        connection.commit()
        cursor.close()
        return True, "Module marked as Ready to Publish."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to mark module {module_id} ready to publish: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def _get_category_status_id(connection, name):
    """Looks up a single cat_stats_id by its status name."""
    ensure_category_stats_id_column(connection)
    cursor = connection.cursor()
    cursor.execute(f"SELECT cat_stats_id FROM {CATEGORY_STATS_TABLE} WHERE cat_stats_name = %s", (name,))
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else None


def mark_category_ready_to_publish(cat_id):
    """
    Task #publishing-schema: flips a category's status to "Ready to
    Publish" - queueing it for the Publishing page. Never a live status
    change, so this is always allowed regardless of anything else about
    the category.
    """
    if not cat_id:
        return False, "Category ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_category_stats_id_column(connection)
        cursor = connection.cursor()
        cursor.execute(f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Category not found."

        ready_id = _get_category_status_id(connection, "Ready to Publish")
        if not ready_id:
            cursor.close()
            return False, "Could not resolve the Ready to Publish status."

        cursor.execute(
            f"UPDATE {CATEGORY_TABLE} SET cat_stats_id = %s WHERE cat_id = %s",
            (ready_id, cat_id)
        )
        connection.commit()
        cursor.close()
        return True, "Category marked as Ready to Publish."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to mark category {cat_id} ready to publish: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()

def publish_category(cat_id):
    """
    Task #publishing-page-backend: sets a category's status to
    "Published" - the real, live-status action, reserved for the
    Publishing page. Mirrors publish_module()'s shape, minus the
    is_archived flip (categories don't have the same "publishing
    un-archives it" convention modules do).
    """
    if not cat_id:
        return False, "Category ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_category_stats_id_column(connection)
        cursor = connection.cursor()
        cursor.execute(f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Category not found."

        published_id = _get_category_status_id(connection, "Published")
        if not published_id:
            cursor.close()
            return False, "Could not resolve the Published status."

        cursor.execute(
            f"UPDATE {CATEGORY_TABLE} SET cat_stats_id = %s WHERE cat_id = %s",
            (published_id, cat_id)
        )
        connection.commit()
        cursor.close()
        return True, "Category published successfully."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to publish category {cat_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()

def move_category_to_draft(cat_id):
    """
    Task #publishing-schema: reverses mark_category_ready_to_publish()
    or a live Published category - flips status back to "Draft". Backs
    both the "Move to Draft" button (Ready to Publish state) and the
    "Unpublish" button (Published state) on the Publish Action column -
    both land here, since they perform the exact same operation.

    Task #publishing-cascade: also flips every currently-Published
    module under this category (and their lessons/activities/
    exercises, via _unpublish_children_of_module()) back to Draft. This
    runs unconditionally rather than checking the category's prior
    status first - a category that wasn't Published can never have had
    a Published module under it in the first place (publish_module()'s
    own gate prevents that), so the cascade queries simply find nothing
    to do and this stays a safe no-op in that case.
    """
    if not cat_id:
        return False, "Category ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_category_stats_id_column(connection)
        cursor = connection.cursor()
        cursor.execute(f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Category not found."

        draft_id = _get_category_status_id(connection, "Draft")
        if not draft_id:
            cursor.close()
            return False, "Could not resolve the Draft status."

        cursor.execute(
            f"UPDATE {CATEGORY_TABLE} SET cat_stats_id = %s WHERE cat_id = %s",
            (draft_id, cat_id)
        )

        module_draft_id = None
        cursor.execute(f"SELECT module_stats_id FROM {MODULE_STATS_TABLE} WHERE module_stats_name = 'Draft'")
        row = cursor.fetchone()
        module_draft_id = row[0] if row else None

        cursor.execute(
            f"""SELECT m.module_id FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE m.cat_id = %s AND ms.module_stats_name = 'Published'""",
            (cat_id,)
        )
        module_ids = [r[0] for r in cursor.fetchall()]

        lesson_total = 0
        leaf_total = 0
        if module_ids and module_draft_id:
            placeholders = ", ".join(["%s"] * len(module_ids))
            cursor.execute(
                f"UPDATE {MODULES_TABLE} SET module_stats_id = %s, updated_at = NOW() WHERE module_id IN ({placeholders})",
                tuple([module_draft_id] + module_ids)
            )
            for m_id in module_ids:
                l_count, leaf_count = _unpublish_children_of_module(cursor, m_id)
                lesson_total += l_count
                leaf_total += leaf_count

        connection.commit()
        cursor.close()

        if module_ids:
            return True, (
                f"Category moved back to Draft. Also unpublished {len(module_ids)} module(s), "
                f"{lesson_total} lesson(s), and {leaf_total} activity/exercise item(s) under it."
            )
        return True, "Category moved back to Draft."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to move category {cat_id} to draft: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def unpublish_module_to_ready(module_id):
    """
    Task #7: the Publishing page's own Unpublish action for a module -
    distinct from unpublish_module() (which is the manage pages' Move
    to Draft, still targeting "Draft"). This targets "Ready to Publish"
    instead: a published item pulled offline is still finished/
    reviewed, not suddenly "not ready" - only Move to Draft demotes it
    further. Cascades every Published descendant to "Ready to Publish"
    too, via _unpublish_children_of_module().
    """
    if not module_id:
        return False, "Module ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_module_stats(connection)
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT module_stats_id FROM {MODULE_STATS_TABLE} WHERE module_stats_name = 'Ready to Publish' LIMIT 1"
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Ready to Publish status not found."
        ready_id = row[0]

        cursor.execute(
            f"""UPDATE {MODULES_TABLE}
                SET module_stats_id = %s, updated_at = NOW()
                WHERE module_id = %s""",
            (ready_id, module_id)
        )

        lesson_count, leaf_count = _unpublish_children_of_module(cursor, module_id, target_status_name="Ready to Publish")

        connection.commit()
        cursor.close()
        if lesson_count or leaf_count:
            return True, (
                f"Module moved back to Ready to Publish. Also moved {lesson_count} lesson(s) "
                f"and {leaf_count} activity/exercise item(s) under it to Ready to Publish."
            )
        return True, "Module moved back to Ready to Publish."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to unpublish module {module_id} to ready: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def unpublish_category_to_ready(cat_id):
    """
    Task #7: the Publishing page's own Unpublish action for a category
    - mirrors unpublish_module_to_ready() one level up, and is
    distinct from move_category_to_draft() (the manage-side Move to
    Draft / old Unpublish, which targets "Draft"). Cascades every
    Published module under this category (and their lessons/
    activities/exercises) to "Ready to Publish" too.
    """
    if not cat_id:
        return False, "Category ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_category_stats_id_column(connection)
        cursor = connection.cursor()
        cursor.execute(f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Category not found."

        ready_id = _get_category_status_id(connection, "Ready to Publish")
        if not ready_id:
            cursor.close()
            return False, "Could not resolve the Ready to Publish status."

        cursor.execute(
            f"UPDATE {CATEGORY_TABLE} SET cat_stats_id = %s WHERE cat_id = %s",
            (ready_id, cat_id)
        )

        module_ready_id = None
        cursor.execute(f"SELECT module_stats_id FROM {MODULE_STATS_TABLE} WHERE module_stats_name = 'Ready to Publish'")
        row = cursor.fetchone()
        module_ready_id = row[0] if row else None

        cursor.execute(
            f"""SELECT m.module_id FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE m.cat_id = %s AND ms.module_stats_name = 'Published'""",
            (cat_id,)
        )
        module_ids = [r[0] for r in cursor.fetchall()]

        lesson_total = 0
        leaf_total = 0
        if module_ids and module_ready_id:
            placeholders = ", ".join(["%s"] * len(module_ids))
            cursor.execute(
                f"UPDATE {MODULES_TABLE} SET module_stats_id = %s, updated_at = NOW() WHERE module_id IN ({placeholders})",
                tuple([module_ready_id] + module_ids)
            )
            for m_id in module_ids:
                l_count, leaf_count = _unpublish_children_of_module(cursor, m_id, target_status_name="Ready to Publish")
                lesson_total += l_count
                leaf_total += leaf_count

        connection.commit()
        cursor.close()

        if module_ids:
            return True, (
                f"Category moved back to Ready to Publish. Also moved {len(module_ids)} module(s), "
                f"{lesson_total} lesson(s), and {leaf_total} activity/exercise item(s) to Ready to Publish."
            )
        return True, "Category moved back to Ready to Publish."
    except Error as e:
        connection.rollback()
        print(f"manage_course: failed to unpublish category {cat_id} to ready: {e}")
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

        # Task #123: replaces the old "blocks on ANY active resource"
        # rule - now only a PUBLISHED descendant (this module's own
        # resources, or THEIR video/activities/exercises) blocks the
        # archive. Everything else here is Draft and gets cascade-
        # archived below, so nothing is left orphaned under an
        # archived module.
        blockers = get_published_dependents_for_module(cursor, module_id, None, None)
        if blockers:
            cursor.close()
            names = ", ".join(f"{b['title']} ({b['type']})" for b in blockers[:3])
            more = f" and {len(blockers) - 3} more" if len(blockers) > 3 else ""
            return False, (
                f"Cannot archive this module - it still has Published content: {names}{more}. "
                "You must unpublish these items first before you can archive this parent record."
            )

        archived_status_id = _get_archived_status_id(cursor)
        lr_archived_status_id = _get_lr_archived_status_id(cursor)
        for resource_id, _title, _status in _get_active_resources_for_module(cursor, module_id):
            if archived_status_id:
                _cascade_archive_resource_children(cursor, resource_id, archived_status_id)
            if lr_archived_status_id:
                cursor.execute(
                    f"UPDATE {LEARNING_RESOURCES_TABLE} SET lr_stats_id = %s, updated_at = NOW() WHERE resource_id = %s",
                    (lr_archived_status_id, resource_id)
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
                ORDER BY m.created_at ASC, m.module_id ASC""",
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
# TASK #123: RECURSIVE PUBLISHED-DEPENDENCY CHECK & CASCADE ARCHIVE
# ================================================================
# Replaces the old "blocks on ANY active child, published or not"
# rule with: blocks ONLY on a PUBLISHED descendant, anywhere in the
# hierarchy (a Resource's own Lesson Content status, its Video
# Tutorial, its Activities, its Coding Exercises). Once nothing
# Published remains, archiving a Module or Category now CASCADES -
# every Draft descendant is soft-archived right along with it, so
# nothing is left silently orphaned under an archived parent. This is
# the one and only place either rule lives; archive_module()/
# archive_category() and their eligibility-check counterparts below
# all go through these same two functions.

def _get_published_dependents_for_resource(cursor, resource_id, category_name, module_name, lesson_name):
    """
    Uses an ALREADY-OPEN cursor (this is called while walking a whole
    Module or Category's hierarchy - opening a fresh connection per
    Resource would be wasteful). Returns a list of blocker dicts:
    {type, title, category, module, lesson} for anything Published
    attached to this one Resource - its Video Tutorial, Activities,
    and Coding Exercises (the Resource's OWN Published/Draft status is
    checked by the caller, since that's a property of the resource
    itself, not a "dependent").
    """
    blockers = []

    cursor.execute(
        f"""SELECT vt.video_title, vts.la_stats_name
            FROM {VIDEO_TUTORIALS_TABLE} vt
            LEFT JOIN {LA_STATS_TABLE} vts ON vt.video_stats_id = vts.la_stats_id
            WHERE vt.resource_id = %s
              AND (vts.la_stats_name IS NULL OR vts.la_stats_name != 'Archived')
            ORDER BY vt.video_tutorial_id DESC LIMIT 1""",
        (resource_id,)
    )
    row = cursor.fetchone()
    if row and row[1] == 'Published':
        blockers.append({"type": "Video Tutorial", "title": row[0] or "Untitled video",
                          "category": category_name, "module": module_name, "lesson": lesson_name})

    cursor.execute(
        f"""SELECT la.activity_title, last.la_stats_name, atp.activity_type_name
            FROM {LEARNING_ACTIVITIES_TABLE} la
            LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
            LEFT JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
            WHERE la.resource_id = %s
              AND (last.la_stats_name IS NULL OR last.la_stats_name != 'Archived')""",
        (resource_id,)
    )
    for title, status, atype in cursor.fetchall():
        if status == 'Published':
            blockers.append({"type": atype or "Activity", "title": title,
                              "category": category_name, "module": module_name, "lesson": lesson_name})

    cursor.execute(
        f"""SELECT ce.exercise_title, last.la_stats_name
            FROM {CODING_EXERCISES_TABLE} ce
            LEFT JOIN {LA_STATS_TABLE} last ON ce.exercise_stats_id = last.la_stats_id
            WHERE ce.resource_id = %s
              AND (last.la_stats_name IS NULL OR last.la_stats_name != 'Archived')""",
        (resource_id,)
    )
    for title, status in cursor.fetchall():
        if status == 'Published':
            blockers.append({"type": "Coding Exercise", "title": title,
                              "category": category_name, "module": module_name, "lesson": lesson_name})

    return blockers


def _get_active_resources_for_module(cursor, module_id):
    """Returns [(resource_id, resource_title, lr_stats_name), ...] for non-archived resources under a module."""
    cursor.execute(
        f"""SELECT lr.resource_id, lr.resource_title, lrs.lr_stats_name
            FROM {LEARNING_RESOURCES_TABLE} lr
            LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
            WHERE lr.module_id = %s
              AND (lrs.lr_stats_name IS NULL OR lrs.lr_stats_name != 'Archived')""",
        (module_id,)
    )
    return cursor.fetchall()


def get_published_dependents_for_module(cursor, module_id, category_name, module_name):
    """
    Walks every active Resource under this Module and collects every
    Published thing found - the Resource itself (if Published) plus
    its Video/Activities/Exercises. Uses an ALREADY-OPEN cursor.
    """
    blockers = []
    for resource_id, resource_title, lr_status in _get_active_resources_for_module(cursor, module_id):
        if lr_status == 'Published':
            blockers.append({"type": "Lesson Content", "title": resource_title,
                              "category": category_name, "module": module_name, "lesson": resource_title})
        blockers.extend(_get_published_dependents_for_resource(
            cursor, resource_id, category_name, module_name, resource_title
        ))
    return blockers


def get_published_dependents_for_category(cursor, cat_id, category_name):
    """Walks every active Module under this Category (and each Module's own Resources)."""
    blockers = []
    cursor.execute(
        f"""SELECT m.module_id, m.module_name, ms.module_stats_name
            FROM {MODULES_TABLE} m
            LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
            WHERE m.cat_id = %s AND m.is_archived = 0""",
        (cat_id,)
    )
    for module_id, module_name, module_status in cursor.fetchall():
        if module_status == 'Published':
            blockers.append({"type": "Module", "title": module_name,
                              "category": category_name, "module": module_name, "lesson": "—"})
        blockers.extend(get_published_dependents_for_module(cursor, module_id, category_name, module_name))
    return blockers


def _cascade_archive_resource_children(cursor, resource_id, archived_status_id):
    """
    Archives every remaining (Draft) Video Tutorial, Activity, and
    Coding Exercise attached to a Resource that's about to be
    archived. Only ever called after the caller has already confirmed
    zero Published descendants exist - never touches a Published row
    (there shouldn't be one left by this point, but the WHERE clause
    guards against archiving one anyway, as a last line of defense).
    """
    cursor.execute(
        f"""UPDATE {VIDEO_TUTORIALS_TABLE} vt
            LEFT JOIN {LA_STATS_TABLE} vts ON vt.video_stats_id = vts.la_stats_id
            SET vt.video_stats_id = %s, vt.updated_at = NOW()
            WHERE vt.resource_id = %s
              AND (vts.la_stats_name IS NULL OR vts.la_stats_name NOT IN ('Archived', 'Published'))""",
        (archived_status_id, resource_id)
    )
    cursor.execute(
        f"""UPDATE {LEARNING_ACTIVITIES_TABLE} la
            LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
            SET la.la_stats_id = %s, la.updated_at = NOW()
            WHERE la.resource_id = %s
              AND (last.la_stats_name IS NULL OR last.la_stats_name NOT IN ('Archived', 'Published'))""",
        (archived_status_id, resource_id)
    )
    cursor.execute(
        f"""UPDATE {CODING_EXERCISES_TABLE} ce
            LEFT JOIN {LA_STATS_TABLE} last ON ce.exercise_stats_id = last.la_stats_id
            SET ce.exercise_stats_id = %s, ce.updated_at = NOW()
            WHERE ce.resource_id = %s
              AND (last.la_stats_name IS NULL OR last.la_stats_name NOT IN ('Archived', 'Published'))""",
        (archived_status_id, resource_id)
    )


def _get_archived_status_id(cursor):
    cursor.execute(f"SELECT la_stats_id FROM {LA_STATS_TABLE} WHERE la_stats_name = 'Archived'")
    row = cursor.fetchone()
    return row[0] if row else None


def _get_lr_archived_status_id(cursor):
    cursor.execute(f"SELECT lr_stats_id FROM {LR_STATS_TABLE} WHERE lr_stats_name = 'Archived'")
    row = cursor.fetchone()
    return row[0] if row else None


# ================================================================
# ARCHIVE ELIGIBILITY CHECKS (backs the "check before archive" flow
# admin-relational-archive.js already calls)
# ================================================================
def check_module_archive_eligibility(module_id):
    """
    Reports WHETHER archive_module(module_id) would currently succeed,
    and lists exactly what's blocking it if not - every Published
    descendant, with full Category/Module/Lesson context, per Task
    #123 - without actually archiving anything.

    Returns (success: bool, eligible: bool | None, blockers: list[dict], message: str | None)
    Each blocker dict: {type, title, category, module, lesson}
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
            f"""SELECT m.is_archived, ms.module_stats_name, m.module_name, c.category_name
                FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                LEFT JOIN {CATEGORY_TABLE} c ON m.cat_id = c.cat_id
                WHERE m.module_id = %s""",
            (module_id,)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, None, [], "Module not found."

        is_archived, status_name, module_name, category_name = row
        if is_archived:
            cursor.close()
            return False, None, [], "This module is already archived."

        blockers = []
        if status_name == "Published":
            blockers.append({"type": "Module", "title": module_name,
                              "category": category_name, "module": module_name, "lesson": "—"})
        blockers.extend(get_published_dependents_for_module(cursor, module_id, category_name, module_name))

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
    Same as check_module_archive_eligibility() above, for Categories -
    recursively walks every Module and their Resources.

    Returns (success: bool, eligible: bool | None, blockers: list[dict], message: str | None)
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

        cursor.execute(f"SELECT is_archived, category_name FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, None, [], "Category not found."
        is_archived, category_name = row
        if is_archived:
            cursor.close()
            return False, None, [], "This category is already archived."

        blockers = get_published_dependents_for_category(cursor, cat_id, category_name)
        cursor.close()
        return True, len(blockers) == 0, blockers, None
    except Error as e:
        print(f"manage_course: failed to check category archive eligibility: {e}")
        return False, None, [], f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def check_resource_archive_eligibility(resource_id):
    """
    Task #123: same shape as check_module_archive_eligibility() above,
    scoped to a single Resource - used by Manage Learning Resources'
    Archive checklist, which needs to know about Published Activities/
    Coding Exercises attached to a Lesson (a real pre-existing gap:
    that checklist only ever checked the Lesson's own status and its
    Video Tutorial, never its quizzes or exercises).

    Returns (success: bool, eligible: bool | None, blockers: list[dict], message: str | None)
    """
    if not resource_id:
        return False, None, [], "Resource ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, None, [], "Could not connect to the database."

    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""SELECT lr.resource_title, lrs.lr_stats_name, c.category_name, m.module_name
                FROM {LEARNING_RESOURCES_TABLE} lr
                LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
                LEFT JOIN {MODULES_TABLE} m ON lr.module_id = m.module_id
                WHERE lr.resource_id = %s""",
            (resource_id,)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, None, [], "Resource not found."

        resource_title, lr_status, category_name, module_name = row

        blockers = []
        if lr_status == "Published":
            blockers.append({"type": "Lesson Content", "title": resource_title,
                              "category": category_name, "module": module_name, "lesson": resource_title})
        blockers.extend(_get_published_dependents_for_resource(
            cursor, resource_id, category_name, module_name, resource_title
        ))

        cursor.close()
        return True, len(blockers) == 0, blockers, None
    except Error as e:
        print(f"manage_course: failed to check resource archive eligibility: {e}")
        return False, None, [], f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def check_activity_archive_eligibility(activity_id):
    """
    Task #123: same shape again, for a single Learning Activity - a
    leaf node with no children of its own, so this is just a
    self-status check (mirrors check_coding_exercise_archive_
    eligibility() below).

    Returns (success: bool, eligible: bool | None, blockers: list[dict], message: str | None)
    """
    if not activity_id:
        return False, None, [], "Activity ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, None, [], "Could not connect to the database."

    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""SELECT la.activity_title, last.la_stats_name, atp.activity_type_name,
                       c.category_name, m.module_name, lr.resource_title
                FROM {LEARNING_ACTIVITIES_TABLE} la
                LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
                LEFT JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
                LEFT JOIN {LEARNING_RESOURCES_TABLE} lr ON la.resource_id = lr.resource_id
                LEFT JOIN {CATEGORY_TABLE} c ON la.cat_id = c.cat_id
                LEFT JOIN {MODULES_TABLE} m ON la.module_id = m.module_id
                WHERE la.la_id = %s""",
            (activity_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        if row is None:
            return False, None, [], "Activity not found."

        title, status, atype, category_name, module_name, lesson_name = row
        blockers = []
        if status == "Published":
            blockers.append({"type": atype or "Activity", "title": title,
                              "category": category_name, "module": module_name, "lesson": lesson_name})
        return True, len(blockers) == 0, blockers, None
    except Error as e:
        print(f"manage_course: failed to check activity archive eligibility: {e}")
        return False, None, [], f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def check_coding_exercise_archive_eligibility(exercise_id):
    """
    Task #123: Coding Exercises are leaf nodes with no children of
    their own, so "published dependency" here just means the exercise
    itself - it must be Draft before it can be archived.

    Returns (success: bool, eligible: bool | None, blockers: list[dict], message: str | None)
    """
    if not exercise_id:
        return False, None, [], "Exercise ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, None, [], "Could not connect to the database."

    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""SELECT ce.exercise_title, last.la_stats_name,
                       c.category_name, m.module_name, lr.resource_title
                FROM {CODING_EXERCISES_TABLE} ce
                LEFT JOIN {LA_STATS_TABLE} last ON ce.exercise_stats_id = last.la_stats_id
                LEFT JOIN {LEARNING_RESOURCES_TABLE} lr ON ce.resource_id = lr.resource_id
                LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
                LEFT JOIN {MODULES_TABLE} m ON lr.module_id = m.module_id
                WHERE ce.exercise_id = %s""",
            (exercise_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        if row is None:
            return False, None, [], "Exercise not found."

        title, status, category_name, module_name, lesson_name = row
        blockers = []
        if status == "Published":
            blockers.append({"type": "Coding Exercise", "title": title,
                              "category": category_name, "module": module_name, "lesson": lesson_name})
        return True, len(blockers) == 0, blockers, None
    except Error as e:
        print(f"manage_course: failed to check coding exercise archive eligibility: {e}")
        return False, None, [], f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()
