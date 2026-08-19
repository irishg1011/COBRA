"""
learning_resources.py - Task #37, #38, #39 & #40: Learning Resources DB Integration
--------------------------------------------------------------------------------------
Pure DB-access helpers backing the Admin > Learning Resources page,
mirroring manage_course.py's style exactly: this file never touches
Flask/session state directly - admin_routes.py is the only place these
get turned into HTTP responses/JSON.

Tables involved (per the project's existing schema - see phpMyAdmin
`learning_resources_tbl` / `resource_types_tbl` structure):

    learning_resources_tbl
    -----------------------
    resource_id       int(10) AUTO_INCREMENT PRIMARY KEY
    resource_title    varchar(255)
    resource_type_id  int(10)  FK -> resource_types_tbl.resource_type_id
    cat_id            int(10)  FK -> category_tbl.cat_id
    module_id         int(10)  FK -> modules_tbl.module_id
    uploaded_by       varchar(15) NULL   FK -> account_tbl/profile_tbl.acc_id
    lr_stats_id       int(10)  FK -> learning_resources_stats_tbl.lr_stats_id
    created_at        datetime NULL
    updated_at        datetime NULL

    resource_types_tbl
    -------------------
    resource_type_id    int(10) AUTO_INCREMENT PRIMARY KEY
    resource_type_name  varchar(50)

    learning_resources_stats_tbl (mirrors module_stats_tbl's own
    id/name pattern used elsewhere in this project)
    -----------------------------
    lr_stats_id    int(10) AUTO_INCREMENT PRIMARY KEY
    lr_stats_name  varchar(50)

Task #37 requirements this file satisfies:
    - Real records pulled from learning_resources_tbl (never mock data).
    - Category/Uploader/Status are resolved to display names via JOINs,
      never returned as raw foreign-key IDs.
    - Search + pagination happen in SQL, not in Python, so this scales
      with the dataset the same way get_modules_overview() does.

Task #38 requirements this file satisfies:
    - get_resource_types() reads resource_type_id/resource_type_name
      straight from resource_types_tbl - nothing hardcoded - so the
      Admin page's "All Types" dropdown is always in sync with the
      database.
    - get_learning_resources_overview()'s type_filter param is always
      compared against the real resource_type_id column, never a
      hardcoded/assumed numeric id or a name string.

Task #39 requirements this file satisfies:
    - The search term is checked, in one query, against every column
      actually shown in the table: resource title, resource type name,
      category name, uploader's display name, status name, AND a
      formatted rendering of created_at / updated_at - not just the
      resource's own title.
    - All of this is combined with OR inside a single parameterized
      WHERE clause (never string-concatenated raw input).

Task #40 requirements this file satisfies:
    - created_from/created_to and updated_from/updated_to add DATE(...)
      range conditions against learning_resources_tbl.created_at /
      updated_at, mirroring get_modules_overview()'s own Created At /
      Updated At filtering exactly (same "absent bound = no
      restriction", same DATE()-only comparison so a timestamp's
      time-of-day never excludes an otherwise-matching row, same
      inclusive end-date behavior).
    - Composes with search_query/type_filter/pagination exactly like
      every other condition already in this query - all AND'ed
      together.
"""

from datetime import datetime
from mysql.connector import Error
from cobradb import get_db_connection

LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
RESOURCE_TYPES_TABLE = "resource_types_tbl"
CATEGORY_TABLE = "category_tbl"
PROFILE_TABLE = "profile_tbl"
LR_STATS_TABLE = "learning_resources_stats_tbl"


def _fmt_date(dt):
    """e.g. 'Jul 12, 2026' - matches manage_course.py's / admin_routes.py's
    own _fmt_date() convention, written cross-platform (no %-d, which is
    Linux/macOS only)."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _fmt_datetime(dt):
    """e.g. 'Jul 15, 01:30 AM' - matches admin_routes.py's own
    _fmt_datetime() convention."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.strftime('%I:%M %p').lstrip('0') or '12:00 AM'}"


# ================================================================
# Task #38: RESOURCE TYPES (dropdown source - never hardcoded)
# ================================================================
def get_resource_types():
    """
    Returns every row of resource_types_tbl (resource_type_id,
    resource_type_name), ordered by name, so the "All Types" dropdown on
    learning-resources.html can be built entirely from the database -
    "Lesson Content" / "Video Tutorial" (or anything added later) show
    up purely because a row for them exists, never because the
    frontend hardcodes their names or ids.

    Returns [] (never raises) on any database error, so the page still
    renders (with just the "All Types" option) instead of crashing.
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
        print(f"learning_resources: failed to load resource types: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


# ================================================================
# Task #37, #39 & #40: LEARNING RESOURCES OVERVIEW (table data)
# ================================================================
def get_learning_resources_overview(search_query=None, type_filter=None, page=1, per_page=8,
                                     created_from=None, created_to=None,
                                     updated_from=None, updated_to=None):
    """
    Pulls a page of learning_resources_tbl, LEFT JOINed against
    category_tbl, resource_types_tbl, profile_tbl (uploader), and
    learning_resources_stats_tbl so Category / Uploaded By / Type /
    Status are all returned as display-ready names - never a raw
    cat_id / uploaded_by / resource_type_id / lr_stats_id.

    LEFT JOINs (not INNER) are used throughout because every one of
    these foreign keys can legitimately be NULL or point at a row that
    no longer exists (e.g. uploaded_by, which the schema itself marks
    nullable) - an INNER JOIN would silently drop those resources
    instead of showing them with a graceful placeholder.

    search_query (str | None): Task #39 - matches, case-insensitively,
    against EVERY column actually shown in the table in one combined OR
    clause:
        - resource_title
        - resource_types_tbl.resource_type_name
        - category_tbl.category_name
        - the uploader's "firstname lastname" (profile_tbl)
        - learning_resources_stats_tbl.lr_stats_name
        - created_at, formatted the same way it's displayed ('Aug 7, 2026')
        - updated_at, formatted the same way it's displayed ('Aug 7, 01:30 PM')
    All seven are parameterized (%s placeholders) - the raw search term
    is never concatenated into the SQL string itself.

    type_filter (str | int | None): Task #38 - the actual
    resource_type_id from resource_types_tbl (never a hardcoded id or
    a name string). Falsy/empty means "no type filter" (the "All
    Types" option).

    created_from / created_to / updated_from / updated_to (str | None):
    Task #40 - optional 'YYYY-MM-DD' strings. Each is only ever added
    to the query when actually supplied - an absent bound adds no
    restriction. Compared via DATE(...) so a timestamp's time-of-day
    component never excludes an otherwise-matching row, and an end
    date is naturally inclusive through 23:59:59 of that day since we
    compare DATE(), not the full timestamp, against the end date.
    created_at/updated_at filtering are independent of each other and
    both may be active together, exactly like get_modules_overview().

    Returns {"resources": [...], "total": int, "page": int,
    "per_page": int, "total_pages": int}, or None on DB failure -
    admin_routes.py is responsible for turning a None into a proper
    "could not reach the database" response rather than silently
    showing an empty table (Task #37, Requirement #7).
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
            LEFT JOIN {PROFILE_TABLE} p ON lr.uploaded_by = p.acc_id
            LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
            WHERE 1 = 1
        """
        params = []

        # ------------------------------------------------------------
        # Task #39: multi-column search - title, type, category,
        # uploader, status, AND formatted created_at/updated_at, all
        # OR'ed together in one parameterized clause.
        # ------------------------------------------------------------
        term = (search_query or "").strip()
        if term:
            base_query += """
                AND (
                    LOWER(lr.resource_title) LIKE %s
                    OR LOWER(rt.resource_type_name) LIKE %s
                    OR LOWER(c.category_name) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                    OR LOWER(lrs.lr_stats_name) LIKE %s
                    OR LOWER(DATE_FORMAT(lr.created_at, '%%b %%e, %%Y')) LIKE %s
                    OR LOWER(DATE_FORMAT(lr.updated_at, '%%b %%e, %%Y')) LIKE %s
                    OR LOWER(DATE_FORMAT(lr.updated_at, '%%b %%e, %%h:%%i %%p')) LIKE %s
                )
            """
            like_term = f"%{term.lower()}%"
            params.extend([like_term] * 8)

        # Task #38: filter by the REAL resource_type_id key, never a
        # hardcoded/assumed numeric id or a display-name comparison.
        type_id = (str(type_filter).strip() if type_filter not in (None, "") else "")
        if type_id:
            base_query += " AND lr.resource_type_id = %s"
            params.append(type_id)

        # ------------------------------------------------------------
        # Task #40: Created At / Updated At date filters
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
                lr.resource_id, lr.resource_title,
                lr.resource_type_id, rt.resource_type_name,
                lr.cat_id, c.category_name,
                lr.uploaded_by, p.firstname, p.lastname,
                lr.lr_stats_id, lrs.lr_stats_name,
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
            ).strip()
            # Task #37, Requirement #4: "Handle nullable uploaded_by ...
            # values gracefully" - fall back to the raw acc_id if no
            # profile row was found, and to an em-dash if there is no
            # uploader at all (uploaded_by IS NULL).
            uploaded_by_display = uploader_name or row.get("uploaded_by") or "—"

            resources.append({
                "resource_id": row["resource_id"],
                "resource_title": row["resource_title"],
                "resource_type_id": row.get("resource_type_id"),
                "type": row.get("resource_type_name") or "—",
                "cat_id": row.get("cat_id"),
                "category": row.get("category_name") or "Uncategorized",
                "uploaded_by": uploaded_by_display,
                "status": row.get("lr_stats_name") or "—",
                "created_at": _fmt_date(row.get("created_at")),
                "updated_at": _fmt_datetime(row.get("updated_at")),
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