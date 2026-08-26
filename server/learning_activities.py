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
manage-learning-activities.html with NO data at all, and the page's "Type"
filter dropdown was a hardcoded <option> list (Multiple Choice / Flashcard /
Fill in the Blank) with no connection to activity_types_tbl whatsoever - a
new activity type added to the database would never show up, and the
dropdown's value never matched any real activity_type_id. This file fixes
both: real joined data for the table (see get_learning_activities_overview()),
and a real, seeded, id-backed source for the Type dropdown (see
ensure_activity_types() / get_activity_types() below).

Requirements satisfied:
    1. Dynamic dropdown - get_activity_types() reads activity_type_id /
       activity_type_name straight from activity_types_tbl (seeded via
       ensure_activity_types() if empty) - never a hardcoded list.
    2. "All Types" default - handled entirely on the frontend/template
       side (a static leading <option value="">All Types</option>), which
       maps to type_filter being falsy/empty below - i.e. "no restriction".
    3. Table filtering - get_learning_activities_overview()'s type_filter
       param is compared directly against the real
       learning_activities_tbl.activity_type_id column, never a hardcoded/
       assumed id or a name-string comparison.
    4. Joins - LEFT JOINs learning_activities_tbl.resource_id ->
       learning_resources_tbl.resource_id for resource_title (aliased
       "Lesson Name"), and la_stats_id -> learning_activities_stats_tbl for
       the human-readable status name. LEFT JOIN (not INNER) throughout,
       since resource_id/uploaded_by/la_stats_id/activity_type_id can all
       legitimately be missing or point at a row that no longer exists -
       an INNER JOIN would silently drop those activities instead of
       showing them with a graceful placeholder.
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
# get_learning_activities_overview()'s own status resolution. Mirrors
# manage_course.py's DEFAULT_STATUSES / resource_publishing.py's
# DEFAULT_LR_STATUSES seeding pattern exactly.
DEFAULT_LA_STATUSES = ["Draft", "Published", "Archived"]

# These activity types must exist in activity_types_tbl. Matches the exact
# three options the Create Learning Activity form
# (create-learning-activity.html: #activityType) already lets an admin
# choose from - "Multiple Choice", "Fill in the Blanks", "Flashcards" -
# never hardcoded anywhere else; every caller (the Type filter dropdown,
# the create-activity form, future features) reads them fresh via
# get_activity_types() below.
DEFAULT_ACTIVITY_TYPES = ["Multiple Choice", "Fill in the Blanks", "Flashcards"]

_la_stats_ensured = False
_activity_types_ensured = False

# ------------------------------------------------------------------
# Sort options for Manage Learning Activities (mirrors admin_routes.py's
# SORT_CLAUSES pattern for Account & Security) - the dropdown value only
# ever selects one of these hardcoded ORDER BY clauses, never built from
# raw input.
# ------------------------------------------------------------------
LA_SORT_CLAUSES = {
    "created_desc": "la.created_at DESC",
    "created_asc": "la.created_at ASC",
    "updated_desc": "la.updated_at DESC",
}
DEFAULT_LA_SORT_KEY = "created_desc"

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


def ensure_activity_types(connection):
    """
    Task: Dynamic Type dropdown. "If these records do not already exist,
    automatically insert them into activity_types_tbl." Idempotent
    (checked by name before inserting, so re-running this never creates
    duplicates) and gated behind a module-level flag so it only round-trips
    to the database once per process lifetime - identical convention to
    ensure_la_stats() above and manage_course.ensure_module_stats().
    """
    global _activity_types_ensured
    if _activity_types_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT activity_type_name FROM {ACTIVITY_TYPES_TABLE}")
        existing = {row[0] for row in cursor.fetchall()}
        missing = [t for t in DEFAULT_ACTIVITY_TYPES if t not in existing]
        for name in missing:
            cursor.execute(
                f"INSERT INTO {ACTIVITY_TYPES_TABLE} (activity_type_name) VALUES (%s)",
                (name,)
            )
        if missing:
            connection.commit()
        cursor.close()
        _activity_types_ensured = True
    except Error as e:
        print(f"learning_activities: failed to seed {ACTIVITY_TYPES_TABLE}: {e}")


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
# ACTIVITY TYPES (Type filter dropdown source - never hardcoded)
# ================================================================
def get_activity_types():
    """
    Requirement #1: Returns every row of activity_types_tbl
    (activity_type_id, activity_type_name), ordered by name, so the
    "All Types" dropdown on manage-learning-activities.html is built
    ENTIRELY from the database - never a hardcoded <option> list.

    Seeds the table first (ensure_activity_types()) so a fresh/empty
    database still gives the dropdown real, id-backed rows to render
    instead of showing just the bare "All Types" option forever.

    Returns [] (never raises) on any database error, so the page still
    renders (with just the "All Types" option) instead of crashing.
    """
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        ensure_activity_types(connection)
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
# LEARNING ACTIVITIES OVERVIEW (table data + live search/filter)
# ================================================================
def get_learning_activities_overview(search_query=None, type_filter=None, page=1, per_page=8,
                                      sort_by=None,
                                      created_from=None, created_to=None,
                                      updated_from=None, updated_to=None):
    """
    Pulls a page of learning_activities_tbl, LEFT JOINed against
    learning_resources_tbl (Lesson Name), learning_activities_stats_tbl
    (Status), profile_tbl (Uploaded By), category_tbl, modules_tbl, and
    activity_types_tbl - so every column the UI needs is returned
    display-ready.

    search_query (str | None): matches, case-insensitively, against the
    activity title, lesson (resource) title, category name, module name,
    activity type name, and the uploader's "firstname lastname" - all
    combined with OR in one parameterized clause.

    type_filter (str | int | None): the real activity_type_id from
    activity_types_tbl. Falsy/empty means "no type filter".

    sort_by (str | None): one of LA_SORT_CLAUSES's keys
    ("created_desc" [default, Newest First], "created_asc"
    [Oldest First], "updated_desc" [Recently Updated]). Only ever
    selects one of the three hardcoded clauses above - never built from
    raw input.

    created_from / created_to / updated_from / updated_to (str | None):
    optional 'YYYY-MM-DD' strings. Each is only added to the query when
    actually supplied - an absent bound adds no restriction. Compared
    via DATE(...) so a timestamp's time-of-day never excludes an
    otherwise-matching row, and created_at/updated_at filtering are
    independent of each other (both may be active together).

    Returns {"activities": [...], "total": int, "page": int, "per_page":
    int, "total_pages": int}, or None on DB failure.
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
                    OR LOWER(c.category_name) LIKE %s
                    OR LOWER(m.module_name) LIKE %s
                    OR LOWER(atp.activity_type_name) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                )
            """
            like_term = f"%{term.lower()}%"
            params.extend([like_term] * 6)

        type_id = (str(type_filter).strip() if type_filter not in (None, "") else "")
        if type_id:
            base_query += " AND la.activity_type_id = %s"
            params.append(type_id)

        # ------------------------------------------------------------
        # Created At / Updated At date filters
        # ------------------------------------------------------------
        created_from = (created_from or "").strip() or None
        created_to = (created_to or "").strip() or None
        updated_from = (updated_from or "").strip() or None
        updated_to = (updated_to or "").strip() or None

        if created_from:
            base_query += " AND DATE(la.created_at) >= %s"
            params.append(created_from)
        if created_to:
            base_query += " AND DATE(la.created_at) <= %s"
            params.append(created_to)
        if updated_from:
            base_query += " AND DATE(la.updated_at) >= %s"
            params.append(updated_from)
        if updated_to:
            base_query += " AND DATE(la.updated_at) <= %s"
            params.append(updated_to)

        # Total count (for pagination), before LIMIT/OFFSET.
        cursor.execute(f"SELECT COUNT(*) AS total {base_query}", tuple(params))
        total = cursor.fetchone()["total"]

        page = max(1, page)
        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(page, total_pages)
        offset = (page - 1) * per_page

        # Sort - only ever one of the hardcoded LA_SORT_CLAUSES entries.
        sort_key = (sort_by or "").strip().lower()
        order_clause = LA_SORT_CLAUSES.get(sort_key, LA_SORT_CLAUSES[DEFAULT_LA_SORT_KEY])

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
            ORDER BY {order_clause}
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
            uploaded_by_display = uploader_name or row.get("uploaded_by") or "—"

            activities.append({
                "activity_id": row["la_id"],
                "activity_name": row["activity_title"],
                "lesson_name": row.get("resource_title") or "—",
                "status": row.get("la_stats_name") or "Draft",
                "uploaded_by": uploaded_by_display,
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