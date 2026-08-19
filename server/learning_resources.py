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


def get_learning_resources_overview(search_query=None, type_filter=None):
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
    against resource_title, category_name, OR the uploader's full
    name/username - same convention as
    admin_routes.get_accounts_overview()'s search.

    type_filter (str | int | None): the resource type's real key -
    learning_resources_tbl.resource_type_id, which is what
    resource_types_tbl.resource_type_id (the primary key) actually
    joins against. Matching on the id rather than resource_type_name
    means a rename in resource_types_tbl can never silently break
    filtering, and there's no ambiguity if two types ever shared a
    display name. Anything falsy, or not parseable as an int, means
    "no type filter applied" (covers "", "All Types", or a stray
    non-numeric value).

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
            base_query += """
                AND (
                    LOWER(lr.resource_title) LIKE %s
                    OR LOWER(c.category_name) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                    OR LOWER(a.username) LIKE %s
                )
            """
            like_term = f"%{term.lower()}%"
            params.extend([like_term, like_term, like_term, like_term])

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