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

UPDATED: Created At / Updated At date filtering + real pagination,
following the exact same convention manage_course.py's
get_modules_overview() already established for Manage Course (Task #30).

UPDATED (Task #43): Draft -> Publish -> Unpublish workflow.
publish_learning_resource() / unpublish_learning_resource() live here
(not admin_routes.py) per project convention - the routes in
admin_routes.py only call into these and turn the result into JSON.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from text_formatting import format_display_name  # NEW (Task #42): reuse the SAME
    # sentence-case normalizer Manage Course already uses for Category/Module
    # names ("iNtRoDuCtIoN" -> "Introduction"), instead of a second copy of
    # this rule.
from manage_course import ensure_category_stats_column  # NEW (Task #43): reuse the
    # SAME idempotent category_stats_id migration Manage Course owns,
    # instead of a second copy of that ALTER TABLE logic here.

LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
CATEGORY_TABLE = "category_tbl"
RESOURCE_TYPES_TABLE = "resource_types_tbl"
LR_STATS_TABLE = "learning_resources_stats_tbl"
ACCOUNT_TABLE = "account_tbl"
PROFILE_TABLE = "profile_tbl"
MODULES_TABLE = "modules_tbl"  # NEW (Task #43)
MODULE_STATS_TABLE = "module_stats_tbl"  # NEW (Task #43) - shared by Category + Module status

# NEW (Task #42): same seed-on-first-use convention as manage_course.py's
# DEFAULT_STATUSES / ensure_module_stats() - learning_resources_stats_tbl
# ships empty in the SQL dump, so a brand-new resource needs somewhere to
# default to.
DEFAULT_LR_STATUSES = ["Published", "Draft", "Archived"]
_lr_stats_ensured = False


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


def get_learning_resources_overview(search_query=None, type_filter=None, page=1, per_page=8,
                                     created_from=None, created_to=None,
                                     updated_from=None, updated_to=None):
    """
    Pulls a page of learning_resources_tbl, LEFT JOINed against
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
    learning_resources_tbl.resource_type_id. Anything falsy, or not
    parseable as an int, means "no type filter applied" (covers "",
    "All Types", or a stray non-numeric value).

    page / per_page: standard pagination - filtering (search, type,
    and the four date bounds below) is always applied BEFORE the
    LIMIT/OFFSET, so the total count and page count are always correct
    for whatever filters are currently active.

    Date filtering (created_from/created_to/updated_from/updated_to,
    each an optional 'YYYY-MM-DD' string) - mirrors
    manage_course.get_modules_overview() exactly:
        - Filters against the REAL learning_resources_tbl.created_at /
          .updated_at columns - never hardcoded/static dates.
        - Compares by DATE ONLY (via SQL DATE(...)), so a timestamp
          like '2026-08-07 18:21:43' still matches a filter of
          '2026-08-07' - the time-of-day portion never excludes an
          otherwise-matching row, and an end date is naturally
          inclusive through 23:59:59 of that day.
        - Each of the four bounds is only ever added to the query when
          it was actually supplied - an absent bound adds no
          restriction, and created_at / updated_at filtering are
          independent of each other (both may be active together).
        - Composes with search_query/type_filter/pagination exactly
          like every other condition already in this query - all
          AND'ed together.

    Returns {"resources": [...], "total": int, "page": int,
    "per_page": int, "total_pages": int}, or None on DB failure
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
            # Search must match across resource_title, resource type,
            # category, uploader (name or username), status, AND the
            # created_at / updated_at dates - not just the title.
            #
            # created_at/updated_at are matched via DATE_FORMAT(...)
            # using the SAME '%b %e, %Y' pattern _fmt_date() below
            # renders for display (e.g. "Jul 2, 2026") - '%e' (not
            # '%d') gives the day without a leading zero, matching
            # dt.day's un-padded output exactly, so a user can search
            # using whatever date text they actually see in the table.
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
        # Created At / Updated At date filters
        # ------------------------------------------------------------
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

        # Total count (for pagination), before LIMIT/OFFSET - filtering
        # (search, type, date bounds) always happens before pagination,
        # so the displayed page count and resource records stay correct.
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
                lr.resource_id, lr.resource_title,
                lr.resource_type_id, rt.resource_type_name,
                lr.cat_id, c.category_name,
                lr.module_id,
                lr.lr_stats_id, lrs.lr_stats_name,
                lr.uploaded_by,
                a.username, p.firstname, p.lastname,
                lr.created_at, lr.updated_at
            {base_query}
            ORDER BY lr.created_at DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params) + (per_page, offset)
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
                # The real key, alongside the display name - the
                # frontend never needs to filter/compare by name.
                "type_id": row.get("resource_type_id"),
                "type": row.get("resource_type_name") or "Unspecified",
                "cat_id": row.get("cat_id"),  # NEW (Task #43): needed by the frontend Publish action
                "category": row.get("category_name") or "Uncategorized",
                "module_id": row.get("module_id"),  # NEW (Task #43)
                "status": row.get("lr_stats_name") or "Draft",
                "uploaded_by": uploader_name,
                "created_at": _fmt_date(row.get("created_at")),
                "updated_at": _fmt_date(row.get("updated_at")),
            })

        return {
            "resources": resources,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
    except Error as e:
        print(f"learning_resources: failed to load learning resources overview: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()

# ================================================================
# TASK #41 + #42: LESSON / RESOURCE CREATION - CATEGORY/MODULE LINKAGE
# + GLOBAL TITLE UNIQUENESS
# ================================================================
def ensure_lr_stats(connection):
    """
    Idempotently seeds learning_resources_stats_tbl the first time a
    resource is created, mirroring manage_course.ensure_module_stats()
    exactly - gated behind a module-level flag so it only round-trips
    once per process lifetime.
    """
    global _lr_stats_ensured
    if _lr_stats_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT lr_stats_name FROM {LR_STATS_TABLE}")
        existing = {row[0] for row in cursor.fetchall()}
        missing = [s for s in DEFAULT_LR_STATUSES if s not in existing]
        for name in missing:
            cursor.execute(
                f"INSERT INTO {LR_STATS_TABLE} (lr_stats_name) VALUES (%s)", (name,)
            )
        if missing:
            connection.commit()
        cursor.close()
        _lr_stats_ensured = True
    except Error as e:
        print(f"learning_resources: failed to seed {LR_STATS_TABLE}: {e}")


def _get_lr_status_id(cursor, name):
    """
    Task #43: resolves a learning_resources_stats_tbl status display
    name ('Draft', 'Published') to its id - shared by
    _get_default_lr_stats_id(), publish_learning_resource(), and
    unpublish_learning_resource() so the lookup only lives in one place.
    """
    cursor.execute(
        f"SELECT lr_stats_id FROM {LR_STATS_TABLE} WHERE lr_stats_name = %s",
        (name,)
    )
    row = cursor.fetchone()
    return row[0] if row else None


def _get_default_lr_stats_id(cursor):
    """New resources default to 'Draft' (Task #43, Requirement #1) -
    same convention as manage_course.create_module()."""
    return _get_lr_status_id(cursor, "Draft")


def is_resource_title_taken(title, exclude_resource_id=None):
    """
    Task #42, Requirements #1-3: checks resource_title uniqueness
    GLOBALLY across the entire learning_resources_tbl table -
    deliberately NOT scoped to any cat_id/module_id - so a title reused
    in a different Category or Module is still flagged as taken.
    Case-insensitive, matching the same LOWER(...) = LOWER(%s) pattern
    already used throughout this project (account_tbl.username/email,
    category_tbl.category_name, modules_tbl.module_name).

    exclude_resource_id lets a future "edit resource" flow re-use this
    check without flagging a resource against its own existing title.

    Returns True/False, or None (never raises) if the database is
    unreachable - callers must treat None as "could not verify" rather
    than silently treating it as available.
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor()
        query = f"SELECT resource_id FROM {LEARNING_RESOURCES_TABLE} WHERE LOWER(resource_title) = LOWER(%s)"
        params = [title]
        if exclude_resource_id:
            query += " AND resource_id != %s"
            params.append(exclude_resource_id)
        cursor.execute(query, tuple(params))
        taken = cursor.fetchone() is not None
        cursor.close()
        return taken
    except Error as e:
        print(f"learning_resources: failed to check title availability: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def create_learning_resource(title, cat_id, module_id, resource_type_id, uploaded_by=None):
    """
    Task #41: creates a new learning_resources_tbl row linked to the
    submitted Category + Module.
    Task #42: enforces global lesson-title uniqueness and sentence-case
    normalization before that row is ever written.
    Task #43, Requirement #1: EVERY new resource defaults to lr_stats
    'Draft' (via _get_default_lr_stats_id() below) - this is the only
    place a resource's initial status is ever set, and it is always
    Draft, never Published, regardless of what the frontend sends.

    - Requirement #4: title is normalized to sentence case via
      format_display_name() BEFORE validation, duplicate-checking, or
      saving - "INTRODUCTION"/"iNtRoDuCtIoN"/"introduction" all become
      "Introduction".
    - Requirements #1-3: duplicate check runs against the WHOLE table
      (no cat_id/module_id scoping) - never bypassable by picking a
      different Category/Module.
    - Task #41: re-verifies server-side that the submitted module_id
      actually belongs to the submitted cat_id - never trusts only the
      frontend's own cat_id-filtered dropdown.

    Mirrors manage_course.create_module()'s validate-then-insert shape.
    Returns (success: bool, message: str, resource_id: int | None).
    """
    name = format_display_name(title)
    if not name:
        return False, "Lesson title is required.", None
    if not cat_id:
        return False, "Category is required.", None
    if not module_id:
        return False, "Module is required.", None
    if not resource_type_id:
        return False, "Resource type is required.", None

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", None

    try:
        ensure_lr_stats(connection)
        cursor = connection.cursor()

        # Task #42: GLOBAL duplicate check, done here (inside the same
        # transaction as the insert) rather than only trusting the
        # earlier live-check endpoint - a second tab/request could have
        # taken the title in between.
        cursor.execute(
            f"SELECT resource_id FROM {LEARNING_RESOURCES_TABLE} WHERE LOWER(resource_title) = LOWER(%s)",
            (name,)
        )
        if cursor.fetchone():
            cursor.close()
            return False, "A resource with this lesson title already exists.", None

        # Task #41: the module must genuinely belong to the submitted
        # category - re-verified server-side.
        cursor.execute(
            "SELECT module_id FROM modules_tbl WHERE module_id = %s AND cat_id = %s",
            (module_id, cat_id)
        )
        if not cursor.fetchone():
            cursor.close()
            return False, "The selected module does not belong to the selected category.", None

        # Task #43, Requirement #1: always Draft on creation - never
        # trusts a status value from the client (none is even accepted).
        default_status_id = _get_default_lr_stats_id(cursor)

        cursor.execute(
            f"""INSERT INTO {LEARNING_RESOURCES_TABLE}
                (resource_title, resource_type_id, cat_id, module_id,
                 uploaded_by, lr_stats_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())""",
            (name, resource_type_id, cat_id, module_id, uploaded_by, default_status_id)
        )
        connection.commit()
        new_id = cursor.lastrowid
        cursor.close()
        return True, "Resource uploaded successfully.", new_id
    except Error as e:
        connection.rollback()
        print(f"learning_resources: failed to create resource: {e}")
        return False, f"Database error: {e}", None
    finally:
        if connection.is_connected():
            connection.close()


# ================================================================
# TASK #43: DRAFT -> PUBLISH -> UNPUBLISH WORKFLOW
# ================================================================
def publish_learning_resource(resource_id):
    """
    Transitions a resource from Draft to Published - but ONLY after
    verifying, server-side, that BOTH its parent Category and parent
    Module are themselves Published. This is the authoritative check;
    the frontend's confirmation dialog and button state are UX only and
    must never be trusted on their own.

    Rules enforced (Requirement #3):
        - Resource must currently be Draft (not already Published).
        - Category status must be 'Published' (see manage_course.py's
          category_stats_id / ensure_category_stats_column()).
        - Module status must be 'Published' (modules_tbl.module_stats_id).
        - Only when BOTH are Published does the resource itself flip
          to Published.

    Returns (success: bool, message: str).
    """
    if not resource_id:
        return False, "Resource ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_lr_stats(connection)
        ensure_category_stats_column(connection)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            f"""
            SELECT
                lr.resource_id, lrs.lr_stats_name,
                COALESCE(cs.module_stats_name, 'Published') AS category_status,
                COALESCE(ms.module_stats_name, 'Draft') AS module_status
            FROM {LEARNING_RESOURCES_TABLE} lr
            LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
            LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
            LEFT JOIN {MODULE_STATS_TABLE} cs ON c.category_stats_id = cs.module_stats_id
            LEFT JOIN {MODULES_TABLE} m ON lr.module_id = m.module_id
            LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
            WHERE lr.resource_id = %s
            """,
            (resource_id,)
        )
        row = cursor.fetchone()

        if not row:
            cursor.close()
            return False, "Resource not found."

        if row["lr_stats_name"] == "Published":
            cursor.close()
            return False, "This resource is already published."

        if row["category_status"] != "Published":
            cursor.close()
            return False, "Cannot publish: this resource's Category is not Published yet."

        if row["module_status"] != "Published":
            cursor.close()
            return False, "Cannot publish: this resource's Module is not Published yet."

        published_id = _get_lr_status_id(cursor, "Published")
        if not published_id:
            cursor.close()
            return False, "Published status is not configured."

        cursor.execute(
            f"UPDATE {LEARNING_RESOURCES_TABLE} SET lr_stats_id = %s, updated_at = NOW() WHERE resource_id = %s",
            (published_id, resource_id)
        )
        connection.commit()
        cursor.close()
        return True, "Resource published successfully."
    except Error as e:
        connection.rollback()
        print(f"learning_resources: failed to publish resource: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def unpublish_learning_resource(resource_id):
    """
    Transitions a Published resource back to Draft (Requirement #6).
    No parent-status re-check is needed here (Category/Module being
    Draft never blocks moving something OUT of Published), but the
    resource itself must currently be Published, so this can't be
    called redundantly on an already-Draft resource.

    Returns (success: bool, message: str).
    """
    if not resource_id:
        return False, "Resource ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_lr_stats(connection)
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            f"""SELECT lr.resource_id, lrs.lr_stats_name
                FROM {LEARNING_RESOURCES_TABLE} lr
                LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE lr.resource_id = %s""",
            (resource_id,)
        )
        row = cursor.fetchone()

        if not row:
            cursor.close()
            return False, "Resource not found."

        if row["lr_stats_name"] != "Published":
            cursor.close()
            return False, "This resource is not currently published."

        draft_id = _get_lr_status_id(cursor, "Draft")
        if not draft_id:
            cursor.close()
            return False, "Draft status is not configured."

        cursor.execute(
            f"UPDATE {LEARNING_RESOURCES_TABLE} SET lr_stats_id = %s, updated_at = NOW() WHERE resource_id = %s",
            (draft_id, resource_id)
        )
        connection.commit()
        cursor.close()
        return True, "Resource moved back to Draft."
    except Error as e:
        connection.rollback()
        print(f"learning_resources: failed to unpublish resource: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()