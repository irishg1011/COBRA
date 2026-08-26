"""
learning_activities.py - Manage Learning Activities DB Integration
--------------------------------------------------------------------------------------
Pure DB-access helpers backing the Admin > Learning Activities page, mirroring
learning_resources.py's / manage_course.py's style exactly: this file never
touches Flask/session state directly - admin_routes.py is the only place
these get turned into HTTP responses/JSON.

Tables involved (per cobra_db.sql):

    learning_activities_tbl
    ------------------------
    la_id             int(10) AUTO_INCREMENT PRIMARY KEY
    activity_title    varchar(255)
    cat_id            int(10)  FK -> category_tbl.cat_id
    module_id         int(10)  FK -> modules_tbl.module_id
    resource_id       int(10)  FK -> learning_resources_tbl.resource_id
    activity_type_id  int(10)  FK -> activity_types_tbl.activity_type_id
    points            int(5)
    la_stats_id       int(10)  FK -> learning_activities_stats_tbl.la_stats_id
    uploaded_by       varchar(15) NULL  FK -> account_tbl/profile_tbl.acc_id
    created_at        datetime NULL
    updated_at        datetime NULL

    learning_activities_stats_tbl
    ------------------------------
    la_stats_id    int(10) AUTO_INCREMENT PRIMARY KEY
    la_stats_name  varchar(50)

    activity_types_tbl
    -------------------
    activity_type_id    int(10) AUTO_INCREMENT PRIMARY KEY
    activity_type_name  varchar(50)

WHY THIS EXISTS
Before this file, admin_routes.py's learning_activities() route rendered
manage-learning-activities.html with NO data at all - the table always
showed "No learning activities found." regardless of what was actually in
learning_activities_tbl. This file gives that page a real, joined query the
same way learning_resources.py already does for Learning Resources.

Requirements satisfied:
    1. Column structure - get_learning_activities_overview() returns each
       row shaped for exactly: Activity Name, Lesson Name, Status,
       Uploaded By, Created At, Updated At (plus a few extra fields kept
       available for search/filtering, e.g. category/module/type).
    2. Joins - LEFT JOINs learning_activities_tbl.resource_id ->
       learning_resources_tbl.resource_id for resource_title (aliased
       "Lesson Name"), and la_stats_id -> learning_activities_stats_tbl for
       the human-readable status name. LEFT JOIN (not INNER) throughout,
       since resource_id/uploaded_by/la_stats_id can all legitimately be
       missing or point at a row that no longer exists - an INNER JOIN
       would silently drop those activities instead of showing them with a
       graceful placeholder.
    3. Formatting - created_at/updated_at are formatted the same way
       learning_resources.py / manage_course.py already format their own
       date/datetime columns, so there is only one date-formatting
       convention across the whole admin section.
"""

from mysql.connector import Error
from cobradb import get_db_connection

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
PROFILE_TABLE = "profile_tbl"
CATEGORY_TABLE = "category_tbl"
MODULES_TABLE = "modules_tbl"
ACTIVITY_TYPES_TABLE = "activity_types_tbl"

# Task requirement: these statuses must exist in learning_activities_stats_tbl.
# Never hardcoded anywhere else in the app - every caller reads them via
# get_activity_stats_options() below. Mirrors manage_course.py's
# DEFAULT_STATUSES / resource_publishing.py's DEFAULT_LR_STATUSES seeding
# pattern exactly.
DEFAULT_LA_STATUSES = ["Draft", "Published", "Archived"]

_la_stats_ensured = False


def ensure_la_stats(connection):
    """
    "If these records do not already exist, automatically insert them into
    learning_activities_stats_tbl." Idempotent and gated behind a
    module-level flag (same pattern as manage_course.ensure_module_stats() /
    resource_publishing.ensure_lr_stats()) so it only round-trips once per
    process lifetime.
    """
    global _la_stats_ensured
    if _la_stats_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT la_stats_name FROM {LA_STATS_TABLE}")
        existing = {row[0] for row in cursor.fetchall()}
        missing = [s for s in DEFAULT_LA_STATUSES if s not in existing]
        for name in missing:
            cursor.execute(
                f"INSERT INTO {LA_STATS_TABLE} (la_stats_name) VALUES (%s)",
                (name,)
            )
        if missing:
            connection.commit()
        cursor.close()
        _la_stats_ensured = True
    except Error as e:
        print(f"learning_activities: failed to seed {LA_STATS_TABLE}: {e}")


def _fmt_date(dt):
    """e.g. 'Aug 26, 2026' - matches learning_resources.py's / manage_course.py's
    own _fmt_date() convention, written cross-platform (no %-d, which is
    Linux/macOS only)."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _fmt_datetime(dt):
    """e.g. 'Aug 26, 01:30 PM' - matches learning_resources.py's own
    _fmt_datetime() convention."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.strftime('%I:%M %p').lstrip('0') or '12:00 AM'}"


# ================================================================
# ACTIVITY TYPES (dropdown source - never hardcoded)
# ================================================================
def get_activity_types():
    """
    Returns every row of activity_types_tbl (activity_type_id,
    activity_type_name), ordered by name, so the "All Types" dropdown on
    manage-learning-activities.html can be built entirely from the
    database instead of the hardcoded <option> list it currently has.

    Returns [] (never raises) on any database error, so the page still
    renders (with just the "All Types" option) instead of crashing.
    """
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT activity_type_id, activity_type_name FROM {ACTIVITY_TYPES_TABLE} "
            f"ORDER BY activity_type_name ASC"
        )
        rows = cursor.fetchall()
        cursor.close()
        return rows
    except Error as e:
        print(f"learning_activities: failed to load activity types: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


# ================================================================
# LEARNING ACTIVITIES OVERVIEW (table data)
# ================================================================
def get_learning_activities_overview(search_query=None, type_filter=None, page=1, per_page=8):
    """
    Pulls a page of learning_activities_tbl, LEFT JOINed against
    learning_resources_tbl (for the Lesson Name), learning_activities_stats_tbl
    (for the Status name), profile_tbl (for the Uploaded By display name),
    category_tbl, modules_tbl, and activity_types_tbl - so every column the
    UI needs is returned display-ready, never a raw resource_id/la_stats_id/
    uploaded_by/cat_id/module_id/activity_type_id.

    LEFT JOINs (not INNER) are used throughout because every one of these
    foreign keys can legitimately be missing or point at a row that no
    longer exists (resource_id, uploaded_by are nullable in the schema;
    la_stats_id/cat_id/module_id/activity_type_id could reference a since-
    deleted row) - an INNER JOIN would silently drop those activities
    instead of showing them with a graceful placeholder.

    search_query (str | None): matches, case-insensitively, against the
    activity title, the joined lesson (resource) title, the status name,
    the uploader's "firstname lastname", the category name, the module
    name, and the activity type name - all combined with OR in one
    parameterized clause (never string-concatenated raw input).

    type_filter (str | int | None): the real activity_type_id from
    activity_types_tbl (never a hardcoded id or a name string). Falsy/empty
    means "no type filter" (the "All Types" option).

    Returns {"activities": [...], "total": int, "page": int, "per_page":
    int, "total_pages": int}, or None on DB failure - admin_routes.py is
    responsible for turning a None into a proper "could not reach the
    database" response rather than silently showing an empty table.

    Each activity dict has the exact columns Requirement #1 asks for
    ("activity_name", "lesson_name", "status", "uploaded_by", "created_at",
    "updated_at"), plus "category"/"module"/"type" kept available for any
    future filter/search UI without a second query.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        ensure_la_stats(connection)
        cursor = connection.cursor(dictionary=True)

        base_query = f"""
            FROM {LEARNING_ACTIVITIES_TABLE} la
            LEFT JOIN {LEARNING_RESOURCES_TABLE} lr ON la.resource_id = lr.resource_id
            LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
            LEFT JOIN {PROFILE_TABLE} p ON la.uploaded_by = p.acc_id
            LEFT JOIN {CATEGORY_TABLE} c ON la.cat_id = c.cat_id
            LEFT JOIN {MODULES_TABLE} m ON la.module_id = m.module_id
            LEFT JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
            WHERE 1 = 1
        """
        params = []

        term = (search_query or "").strip()
        if term:
            base_query += """
                AND (
                    LOWER(la.activity_title) LIKE %s
                    OR LOWER(lr.resource_title) LIKE %s
                    OR LOWER(last.la_stats_name) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                    OR LOWER(c.category_name) LIKE %s
                    OR LOWER(m.module_name) LIKE %s
                    OR LOWER(atp.activity_type_name) LIKE %s
                )
            """
            like_term = f"%{term.lower()}%"
            params.extend([like_term] * 7)

        # Filter by the REAL activity_type_id, never a hardcoded/assumed
        # numeric id or a display-name comparison.
        type_id = (str(type_filter).strip() if type_filter not in (None, "") else "")
        if type_id:
            base_query += " AND la.activity_type_id = %s"
            params.append(type_id)

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
                la.la_id, la.activity_title,
                lr.resource_id, lr.resource_title,
                la.la_stats_id, last.la_stats_name,
                la.uploaded_by, p.firstname, p.lastname,
                c.category_name, m.module_name, atp.activity_type_name,
                la.created_at, la.updated_at
            {base_query}
            ORDER BY la.created_at DESC
            LIMIT %s OFFSET %s
            """,
            tuple(params) + (per_page, offset)
        )
        rows = cursor.fetchall()
        cursor.close()

        activities = []
        for row in rows:
            uploader_name = " ".join(
                part for part in [row.get("firstname"), row.get("lastname")] if part
            ).strip()
            # Same nullable-uploader fallback convention as
            # learning_resources.py: profile name, else the raw acc_id,
            # else an em-dash if there's no uploader at all.
            uploaded_by_display = uploader_name or row.get("uploaded_by") or "—"

            activities.append({
                "activity_id": row["la_id"],
                "activity_name": row["activity_title"],
                "lesson_name": row.get("resource_title") or "—",
                "status": row.get("la_stats_name") or "Draft",
                "uploaded_by": uploaded_by_display,
                # Kept available (not part of the required 6 columns) for
                # any search/filter UI built on top of this later, without
                # needing a second query.
                "category": row.get("category_name") or "Uncategorized",
                "module": row.get("module_name") or "—",
                "type": row.get("activity_type_name") or "—",
                "created_at": _fmt_date(row.get("created_at")),
                "updated_at": _fmt_datetime(row.get("updated_at")),
            })

        return {
            "activities": activities,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
    except Error as e:
        print(f"learning_activities: failed to load learning activities overview: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()