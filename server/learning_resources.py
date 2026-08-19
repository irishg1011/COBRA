"""
learning_resources.py - Manage Learning Resources Database Integration
--------------------------------------------------------------------------
Backs the Admin > Learning Resources page: pulls real records from
learning_resources_tbl, joined against category_tbl (Category),
resource_types_tbl (Type), learning_resources_stats_tbl (Status), and
account_tbl/profile_tbl (Uploaded By).

Mirrors manage_course.py's pattern - pure DB-access helpers, no Flask/
session/request handling here. admin_routes.py is the only place these
get turned into HTTP responses, so business logic doesn't pile up
inline in the routes file (per project convention).
"""

from mysql.connector import Error
from cobradb import get_db_connection

LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
CATEGORY_TABLE = "category_tbl"
RESOURCE_TYPES_TABLE = "resource_types_tbl"
LR_STATS_TABLE = "learning_resources_stats_tbl"
ACCOUNT_TABLE = "account_tbl"
PROFILE_TABLE = "profile_tbl"


def _fmt_date(dt):
    """e.g. 'Jul 12, 2026' - matches manage_course.py's own _fmt_date()
    convention, written cross-platform (no %-d, Linux/macOS only)."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def get_resource_type_options():
    """
    Type filter dropdown source - never hardcoded. Returns every row
    currently in resource_types_tbl, ordered by name. Returns []
    (never raises) on any database error, matching
    manage_course.get_module_stats_options()'s fail-safe convention.
    """
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT resource_type_id, resource_type_name FROM {RESOURCE_TYPES_TABLE} "
            f"ORDER BY resource_type_name ASC"
        )
        rows = cursor.fetchall()
        cursor.close()
        return rows
    except Error as e:
        print(f"learning_resources: failed to load resource type options: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


def get_learning_resources_overview(search_query=None, type_filter=None,
                                     created_from=None, created_to=None,
                                     updated_from=None, updated_to=None):
    """
    Pulls every learning_resources_tbl row, LEFT JOINed against
    category_tbl / resource_types_tbl / learning_resources_stats_tbl /
    account_tbl+profile_tbl so Category, Type, Status, and Uploaded By
    are all resolved to readable display values - never a raw
    cat_id / resource_type_id / lr_stats_id / uploaded_by acc_id.

    LEFT JOINs (not INNER) throughout because uploaded_by, cat_id, or
    the stats/type ids could theoretically be NULL/orphaned on an older
    row - a resource should still render (with a graceful fallback
    label) instead of silently disappearing from the table.

    search_query (str | None): case-insensitive "contains" match
    against resource_title, resource type name, category name, the
    uploader's full name/username, status name, AND the created_at /
    updated_at dates (matched against the same display format
    _fmt_date() renders below, e.g. "Jul 2, 2026") - not just the
    title. All fields are OR'ed together as one group.

    type_filter (str | int | None): the resource type's real key -
    learning_resources_tbl.resource_type_id, which is what
    resource_types_tbl.resource_type_id (the primary key) actually
    joins against. Matching on the id rather than resource_type_name
    means a rename in resource_types_tbl can never silently break
    filtering, and there's no ambiguity if two types ever shared a
    display name. Anything falsy, or not parseable as an int, means
    "no type filter applied" (covers "", "All Types", or a stray
    non-numeric value).

    created_from / created_to / updated_from / updated_to (str | None):
    optional 'YYYY-MM-DD' date-range bounds against the REAL
    learning_resources_tbl.created_at / updated_at columns - mirrors
    manage_course.get_modules_overview()'s Task #30 date-filter
    convention exactly, for consistency across the two admin tables:
        - Compared via SQL DATE(...), so the time-of-day portion never
          excludes an otherwise-matching row, and an end date is
          naturally inclusive through 23:59:59 of that day.
        - Each bound is only ever added to the query when it was
          actually supplied - an absent bound adds no restriction, and
          the two ranges (created/updated) are independent of each
          other (both may be active together).
        - A single-date filter is just created_from == created_to (or
          updated_from == updated_to) - the frontend collapses to this
          when its own "Range" toggle is off, so this function only
          ever needs to think in terms of a from/to pair.

    Returns {"resources": [...], "total": int}, or None on DB failure
    (caller renders an empty-state table rather than crashing).
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
            LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
            LEFT JOIN {ACCOUNT_TABLE} a ON lr.uploaded_by = a.acc_id
            LEFT JOIN {PROFILE_TABLE} p ON lr.uploaded_by = p.acc_id
            WHERE 1 = 1
        """
        params = []

        term = (search_query or "").strip()
        if term:
            # Task: search must match across resource_title, resource
            # type, category, uploader (name or username), status, AND
            # the created_at / updated_at dates - not just the title.
            #
            # created_at/updated_at are matched via DATE_FORMAT(...) using
            # the SAME '%b %e, %Y' pattern _fmt_date() below renders for
            # display (e.g. "Jul 2, 2026") - '%e' (not '%d') is what
            # gives the day without a leading zero, matching dt.day's
            # un-padded output exactly, so a user can search using
            # whatever date text they actually see in the table.
            #
            # This whole block is one OR-grouped condition, ANDed with
            # the type filter below (and with the empty WHERE 1=1
            # anchor above it) - matching the task's required
            # "(title OR type OR category OR uploader OR status OR
            # created_at OR updated_at) AND active_type_filter"
            # structure exactly.
            base_query += """
                AND (
                    LOWER(lr.resource_title) LIKE %s
                    OR LOWER(rt.resource_type_name) LIKE %s
                    OR LOWER(c.category_name) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                    OR LOWER(a.username) LIKE %s
                    OR LOWER(lrs.lr_stats_name) LIKE %s
                    OR LOWER(DATE_FORMAT(lr.created_at, '%%b %%e, %%Y')) LIKE %s
                    OR LOWER(DATE_FORMAT(lr.updated_at, '%%b %%e, %%Y')) LIKE %s
                )
            """
            like_term = f"%{term.lower()}%"
            params.extend([like_term] * 8)

        # Filter by the real FK (resource_type_id), never by string-
        # matching resource_type_name - a display name is not a stable
        # identifier to filter on.
        type_term = (type_filter or "")
        type_term = str(type_term).strip() if type_term != "" else ""
        if type_term and type_term.lower() != "all types":
            try:
                type_id = int(type_term)
                base_query += " AND lr.resource_type_id = %s"
                params.append(type_id)
            except (TypeError, ValueError):
                # Not a valid id (e.g. a stray non-numeric value) -
                # treat exactly like "no filter" rather than erroring
                # or silently matching nothing.
                pass

        # ------------------------------------------------------------
        # Created At / Updated At date-range filters
        # ------------------------------------------------------------
        # Same convention as manage_course.get_modules_overview(): DATE()
        # comparison (so time-of-day never excludes a matching row), each
        # bound only added when actually supplied, and the two ranges
        # are independent of/composable with each other and with the
        # search/type filters above (everything is AND'ed together).
        created_from = (created_from or "").strip() or None
        created_to = (created_to or "").strip() or None
        updated_from = (updated_from or "").strip() or None
        updated_to = (updated_to or "").strip() or None

        if created_from:
            base_query += " AND DATE(lr.created_at) >= %s"
            params.append(created_from)
        if created_to:
            base_query += " AND DATE(lr.created_at) <= %s"
            params.append(created_to)
        if updated_from:
            base_query += " AND DATE(lr.updated_at) >= %s"
            params.append(updated_from)
        if updated_to:
            base_query += " AND DATE(lr.updated_at) <= %s"
            params.append(updated_to)

        cursor.execute(
            f"""
            SELECT
                lr.resource_id, lr.resource_title,
                lr.resource_type_id, rt.resource_type_name,
                c.category_name,
                lrs.lr_stats_name,
                lr.uploaded_by,
                a.username, p.firstname, p.lastname,
                lr.created_at, lr.updated_at
            {base_query}
            ORDER BY lr.created_at DESC
            """,
            tuple(params)
        )
        rows = cursor.fetchall()
        cursor.close()

        resources = []
        for row in rows:
            uploader_name = " ".join(
                part for part in [row.get("firstname"), row.get("lastname")] if part
            ).strip() or row.get("username") or "Unknown"

            resources.append({
                "resource_id": row["resource_id"],
                "title": row["resource_title"],
                # NEW: the real key, alongside the display name - the
                # frontend never needs to filter/compare by name.
                "type_id": row.get("resource_type_id"),
                "type": row.get("resource_type_name") or "Unspecified",
                "category": row.get("category_name") or "Uncategorized",
                "status": row.get("lr_stats_name") or "Draft",
                "uploaded_by": uploader_name,
                "created_at": _fmt_date(row.get("created_at")),
                "updated_at": _fmt_date(row.get("updated_at")),
            })

        return {"resources": resources, "total": len(resources)}
    except Error as e:
        print(f"learning_resources: failed to load learning resources overview: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()

"""
learning_resources_ADDITION.py
---------------------------------
NOT a standalone file to run - append these functions into the
EXISTING learning_resources.py (it already owns LR_STATS_TABLE /
CATEGORY_TABLE constants and get_db_connection, so this reuses that
exact module rather than creating a second one).

SCHEMA ASSUMPTIONS (please correct if these don't match reality):

1. learning_resources_tbl has no module_id column in the schema shown
   so far (get_learning_resources_overview() only ever joins on
   cat_id). But the New Lesson form has a Module dropdown, and this
   task requires validating "the selected Module's status" per
   resource - so a module_id FK is added here idempotently
   (ADD COLUMN IF NOT EXISTS), matching the exact pattern
   admin_routes.py already uses for profile_tbl.mobile.

2. category_tbl (per your phpMyAdmin screenshot) currently has ONLY
   cat_id and category_name - no status field at all. Since this task
   requires blocking publish when "the Category is Draft", a status
   column is required and didn't exist before. Added idempotently
   (ADD COLUMN IF NOT EXISTS) as a plain VARCHAR, mirroring
   account_tbl.status's own convention (a simple 'Active'/'Inactive'
   string, not a separate lookup table) rather than introducing a new
   category_stats_tbl for a single column. Defaults every existing
   (and new) category to 'Published' so this migration can never
   retroactively block any resource that could already publish today -
   satisfies "safe for current records, no destructive changes".

3. Module status already exists and is fully reused as-is:
   modules_tbl.module_stats_id -> module_stats_tbl.module_stats_name
   ("Draft"/"Published"/"Archived") - see manage_course.py. Nothing
   new is added for Module status.

4. learning_resources_stats_tbl already exists (see LR_STATS_TABLE),
   the exact same lookup-table pattern as module_stats_tbl - reused
   as-is; ensure_lr_stats() below just guarantees "Draft" and
   "Published" rows exist in it, the same way
   manage_course.ensure_module_stats() seeds module_stats_tbl.
"""

CATEGORY_STATUS_COLUMN = "status"
LR_MODULE_ID_COLUMN = "module_id"

_lr_stats_ensured = False
_category_status_column_ensured = False
_lr_module_id_column_ensured = False

# Task: "Do not assume status IDs or hardcode numeric values unless
# the project already defines stable constants" - these are the
# stable, well-known DISPLAY NAMES the rest of the project already
# uses for status lookups (module_stats_name, lr_stats_name); actual
# ids are always resolved by name via SQL, never hardcoded as numbers.
LR_STATUS_DRAFT = "Draft"
LR_STATUS_PUBLISHED = "Published"


def ensure_lr_stats(connection):
    """
    Idempotent seed for learning_resources_stats_tbl - guarantees
    "Draft" and "Published" rows exist, mirroring
    manage_course.ensure_module_stats() exactly. Gated behind a
    module-level flag so it only round-trips once per process.
    """
    global _lr_stats_ensured
    if _lr_stats_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT lr_stats_name FROM {LR_STATS_TABLE}")
        existing = {row[0] for row in cursor.fetchall()}
        missing = [s for s in (LR_STATUS_DRAFT, LR_STATUS_PUBLISHED) if s not in existing]
        for name in missing:
            cursor.execute(f"INSERT INTO {LR_STATS_TABLE} (lr_stats_name) VALUES (%s)", (name,))
        if missing:
            connection.commit()
        cursor.close()
        _lr_stats_ensured = True
    except Error as e:
        print(f"learning_resources: failed to seed {LR_STATS_TABLE}: {e}")


def ensure_category_status_column(connection):
    """
    Idempotent migration - see assumption #2 above. Defaults every
    row (existing and new) to 'Published' so nothing that could
    already be published before this column existed suddenly becomes
    blocked.
    """
    global _category_status_column_ensured
    if _category_status_column_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {CATEGORY_TABLE} ADD COLUMN IF NOT EXISTS "
            f"{CATEGORY_STATUS_COLUMN} VARCHAR(20) NOT NULL DEFAULT '{LR_STATUS_PUBLISHED}'"
        )
        connection.commit()
        cursor.close()
        _category_status_column_ensured = True
    except Error as e:
        print(f"learning_resources: failed to ensure {CATEGORY_TABLE}.{CATEGORY_STATUS_COLUMN}: {e}")


def ensure_lr_module_id_column(connection):
    """Idempotent migration - see assumption #1 above."""
    global _lr_module_id_column_ensured
    if _lr_module_id_column_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"ALTER TABLE {LEARNING_RESOURCES_TABLE} ADD COLUMN IF NOT EXISTS "
            f"{LR_MODULE_ID_COLUMN} INT NULL"
        )
        connection.commit()
        cursor.close()
        _lr_module_id_column_ensured = True
    except Error as e:
        print(f"learning_resources: failed to ensure {LEARNING_RESOURCES_TABLE}.{LR_MODULE_ID_COLUMN}: {e}")


def _get_lr_stats_id(cursor, status_name):
    """Resolves a status display name to its real lr_stats_id - never
    a hardcoded number."""
    cursor.execute(f"SELECT lr_stats_id FROM {LR_STATS_TABLE} WHERE lr_stats_name = %s", (status_name,))
    row = cursor.fetchone()
    return row[0] if row else None


def create_learning_resource(resource_title, cat_id, module_id, resource_type_id, uploaded_by):
    """
    Task: "Every newly created Learning Resource automatically starts
    with a Draft status" - the admin never selects an initial status;
    this function always resolves and assigns the real Draft
    lr_stats_id itself.

    Returns (bool success, str message, resource_id or None).
    """
    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        ensure_lr_stats(connection)
        ensure_lr_module_id_column(connection)
        cursor = connection.cursor()

        draft_id = _get_lr_stats_id(cursor, LR_STATUS_DRAFT)
        if draft_id is None:
            cursor.close()
            return False, "Draft status is not configured.", None

        cursor.execute(
            f"""INSERT INTO {LEARNING_RESOURCES_TABLE}
                (resource_title, cat_id, {LR_MODULE_ID_COLUMN}, resource_type_id,
                 lr_stats_id, uploaded_by, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())""",
            (resource_title, cat_id, module_id, resource_type_id, draft_id, uploaded_by)
        )
        connection.commit()
        new_id = cursor.lastrowid
        cursor.close()
        return True, "Learning resource created as Draft.", new_id
    except Error as e:
        connection.rollback()
        print(f"learning_resources: failed to create resource: {e}")
        return False, f"Database error: {e}", None
    finally:
        if connection.is_connected():
            connection.close()


def get_resource_publish_context(resource_id):
    """
    Pulls exactly what a publish/unpublish decision needs in one query:
    the resource's own current status, its Category's status, and its
    Module's status - all resolved to real display names, never raw
    ids passed back to the caller to interpret.

    Returns a dict:
        {
            "resource_id": int,
            "resource_status": str | None,
            "cat_id": int | None,
            "category_status": str | None,
            "module_id": int | None,
            "module_status": str | None,
        }
    or None if the resource itself doesn't exist / on DB error.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        ensure_category_status_column(connection)
        ensure_lr_module_id_column(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""
            SELECT
                lr.resource_id,
                lrs.lr_stats_name AS resource_status,
                lr.cat_id, c.{CATEGORY_STATUS_COLUMN} AS category_status,
                lr.{LR_MODULE_ID_COLUMN} AS module_id, ms.module_stats_name AS module_status
            FROM {LEARNING_RESOURCES_TABLE} lr
            LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
            LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
            LEFT JOIN modules_tbl m ON lr.{LR_MODULE_ID_COLUMN} = m.module_id
            LEFT JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
            WHERE lr.resource_id = %s
            """,
            (resource_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        return row
    except Error as e:
        print(f"learning_resources: failed to load publish context for resource {resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def publish_resource(resource_id):
    """
    Task: full server-side publish flow - identify resource, check its
    current status, validate BOTH parent statuses, and only then flip
    lr_stats_id to Published. Never trusts a frontend-supplied status.

    Returns (bool success, str message, new_status str | None).
    """
    context = get_resource_publish_context(resource_id)
    if context is None or context.get("resource_status") is None:
        return False, "This learning resource does not exist.", None

    if context["resource_status"] == LR_STATUS_PUBLISHED:
        return False, "This resource is already published.", context["resource_status"]

    if context.get("cat_id") is None or context.get("category_status") is None:
        return False, "This resource's Category could not be found.", None
    if context.get("module_id") is None or context.get("module_status") is None:
        return False, "This resource's Module could not be found.", None

    if context["category_status"] != LR_STATUS_PUBLISHED:
        return False, "The selected Category must be published before this resource can be published.", None
    if context["module_status"] != LR_STATUS_PUBLISHED:
        return False, "The selected Module must be published before this resource can be published.", None

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        ensure_lr_stats(connection)
        cursor = connection.cursor()
        published_id = _get_lr_stats_id(cursor, LR_STATUS_PUBLISHED)
        if published_id is None:
            cursor.close()
            return False, "Published status is not configured.", None

        cursor.execute(
            f"""UPDATE {LEARNING_RESOURCES_TABLE}
                SET lr_stats_id = %s, updated_at = NOW()
                WHERE resource_id = %s""",
            (published_id, resource_id)
        )
        connection.commit()
        cursor.close()
        return True, "Learning resource published successfully.", LR_STATUS_PUBLISHED
    except Error as e:
        connection.rollback()
        print(f"learning_resources: failed to publish resource {resource_id}: {e}")
        return False, f"Database error: {e}", None
    finally:
        if connection.is_connected():
            connection.close()


def unpublish_resource(resource_id):
    """
    Task: Unpublish always returns a Published resource back to Draft.
    Still fully server-validated - a nonexistent resource, or a
    resource that's already Draft, is rejected with a clear message
    rather than silently "succeeding".

    Returns (bool success, str message, new_status str | None).
    """
    context = get_resource_publish_context(resource_id)
    if context is None or context.get("resource_status") is None:
        return False, "This learning resource does not exist.", None

    if context["resource_status"] == LR_STATUS_DRAFT:
        return False, "This resource is already a draft.", context["resource_status"]

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        ensure_lr_stats(connection)
        cursor = connection.cursor()
        draft_id = _get_lr_stats_id(cursor, LR_STATUS_DRAFT)
        if draft_id is None:
            cursor.close()
            return False, "Draft status is not configured.", None

        cursor.execute(
            f"""UPDATE {LEARNING_RESOURCES_TABLE}
                SET lr_stats_id = %s, updated_at = NOW()
                WHERE resource_id = %s""",
            (draft_id, resource_id)
        )
        connection.commit()
        cursor.close()
        return True, "Learning resource moved back to Draft.", LR_STATUS_DRAFT
    except Error as e:
        connection.rollback()
        print(f"learning_resources: failed to unpublish resource {resource_id}: {e}")
        return False, f"Database error: {e}", None
    finally:
        if connection.is_connected():
            connection.close()