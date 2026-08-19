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
                c.category_name,
                lrs.lr_stats_name,
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
                "category": row.get("category_name") or "Uncategorized",
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