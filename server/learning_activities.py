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
from lesson_activities import ensure_activity_game_schema  # MCQ arena: sort_order + lives/session tables

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
PROFILE_TABLE = "profile_tbl"
CATEGORY_TABLE = "category_tbl"
MODULES_TABLE = "modules_tbl"
MODULE_STATS_TABLE = "module_stats_tbl"
ACTIVITY_TYPES_TABLE = "activity_types_tbl"

# Task requirement: these statuses must exist in learning_activities_stats_tbl.
# Never hardcoded anywhere else in the app - every caller reads them via
# get_learning_activities_overview()'s own status resolution. Mirrors
# manage_course.py's DEFAULT_STATUSES / resource_publishing.py's
# DEFAULT_LR_STATUSES seeding pattern exactly.
DEFAULT_LA_STATUSES = ["Draft", "Published", "Archived", "Ready to Publish"]

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
DEFAULT_LA_SORT_KEY = "created_asc"  # Oldest First - first made shows first

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
    # MCQ arena: mcq_questions_tbl.sort_order + the learner lives/session
    # tables. Runs here because the draft save calls this BEFORE it writes
    # anything - ALTER/CREATE TABLE would otherwise commit that
    # transaction early.
    ensure_activity_game_schema(connection)
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
            LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
            LEFT JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
            WHERE (last.la_stats_name IS NULL OR last.la_stats_name != 'Archived')
              AND (c.cat_id IS NULL OR COALESCE(c.is_archived, 0) = 0)
              AND (m.module_id IS NULL OR COALESCE(m.is_archived, 0) = 0)
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
                ms.module_stats_name,
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
                "module_status": row.get("module_stats_name") or "Draft",
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


# ================================================================
# GROUPED-BY-LESSON OVERVIEW (Manage Learning Activities table restructure)
# ================================================================
def get_learning_activities_grouped_overview(search_query=None, type_filter=None, page=1, per_page=8,
                                              sort_by=None,
                                              created_from=None, created_to=None,
                                              updated_from=None, updated_to=None):
    """
    Task: Manage Learning Activities restructured to one row PER LESSON
    (like Manage Learning Resources), not one row per activity. Every
    activity a Lesson has (Multiple Choice / Fill in the Blanks /
    Flashcards) is folded into that Lesson's single row - the ACTIVITY
    column shows an icon per TYPE the lesson actually has, and the
    ACTIONS column's Edit/Archive controls list the individual
    activities to choose from (see admin_routes.py's
    /learning-activities/preview and /learning-activities/<id>/archive).

    This performs the SAME filtering as get_learning_activities_overview()
    (search/type/date), fetches every matching activity (no LIMIT), then
    groups them by resource_id in Python and paginates the GROUPS -
    doing this in SQL alone would need a much less maintainable
    correlated-aggregate query for comparatively little gain at this
    table's realistic size.

    Returns {"lessons": [...], "total": int, "page": int, "per_page":
    int, "total_pages": int}, or None on DB failure. Each lesson dict:
        {
            "resource_id", "lesson_name", "category", "module",
            "module_status", "uploaded_by",
            "status": "Published" only if EVERY activity under this
                      lesson is Published, else "Draft" - a mixed
                      lesson is treated as not-fully-published,
            "created_at": earliest activity's created_at,
            "updated_at": most recent activity's updated_at,
            "activity_type_names": sorted list of distinct types present,
            "activities": [{"activity_id", "activity_title",
                             "activity_type", "status"}, ...]
        }
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
            LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
            LEFT JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
            WHERE (last.la_stats_name IS NULL OR last.la_stats_name != 'Archived')
              AND (c.cat_id IS NULL OR COALESCE(c.is_archived, 0) = 0)
              AND (m.module_id IS NULL OR COALESCE(m.is_archived, 0) = 0)
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

        cursor.execute(
            f"""
            SELECT
                la.la_id, la.activity_title,
                lr.resource_id, lr.resource_title,
                la.la_stats_id, last.la_stats_name,
                la.uploaded_by, p.firstname, p.lastname,
                c.category_name, m.module_name, atp.activity_type_name,
                ms.module_stats_name,
                la.created_at, la.updated_at
            {base_query}
            ORDER BY la.resource_id, la.created_at ASC
            """,
            tuple(params)
        )
        rows = cursor.fetchall()
        cursor.close()

        # Group in Python by resource_id - a lesson with NO resource_id
        # (shouldn't normally happen, but defensively) is skipped rather
        # than crashing or silently merging unrelated activities together.
        grouped = {}
        order = []
        for row in rows:
            resource_id = row.get("resource_id")
            if not resource_id:
                continue
            if resource_id not in grouped:
                grouped[resource_id] = {
                    "resource_id": resource_id,
                    "lesson_name": row.get("resource_title") or "—",
                    "category": row.get("category_name") or "Uncategorized",
                    "module": row.get("module_name") or "—",
                    "module_status": row.get("module_stats_name") or "Draft",
                    "uploaded_by_raw": None,
                    "statuses": [],
                    "created_ats": [],
                    "updated_ats": [],
                    "activity_type_names": [],
                    "activities": [],
                }
                order.append(resource_id)

            g = grouped[resource_id]
            uploader_name = " ".join(
                part for part in [row.get("firstname"), row.get("lastname")] if part
            ).strip()
            uploaded_by_display = uploader_name or row.get("uploaded_by") or "—"
            # Most recently created activity's uploader "wins" for the
            # lesson-level Uploaded By display (rows are pre-sorted by
            # created_at ASC above, so the last one seen is the latest).
            g["uploaded_by_raw"] = uploaded_by_display

            status = row.get("la_stats_name") or "Draft"
            g["statuses"].append(status)
            if row.get("created_at"):
                g["created_ats"].append(row["created_at"])
            if row.get("updated_at"):
                g["updated_ats"].append(row["updated_at"])

            activity_type = row.get("activity_type_name") or "—"
            if activity_type not in g["activity_type_names"]:
                g["activity_type_names"].append(activity_type)

            g["activities"].append({
                "activity_id": row["la_id"],
                "activity_title": row["activity_title"],
                "activity_type": activity_type,
                "status": status,
            })

        lessons = []
        for resource_id in order:
            g = grouped[resource_id]
            statuses = g["statuses"]
            # Task fix: this used to be a binary "all Published, else
            # Draft" check, which silently discarded a "Ready to
            # Publish" state the moment the aggregate was recomputed on
            # reload - a lesson with even one Ready to Publish activity
            # always displayed as Draft, making the Ready to Publish
            # action look like it never saved. Now a real 3-state rule:
            # any Draft anywhere -> Draft (not ready yet); no Draft but
            # not fully Published -> Ready to Publish; everything
            # Published -> Published.
            if statuses and all(s == "Published" for s in statuses):
                aggregate_status = "Published"
            elif statuses and any(s == "Draft" for s in statuses):
                aggregate_status = "Draft"
            elif statuses:
                aggregate_status = "Ready to Publish"
            else:
                aggregate_status = "Draft"

            lessons.append({
                "resource_id": g["resource_id"],
                "lesson_name": g["lesson_name"],
                "category": g["category"],
                "module": g["module"],
                "module_status": g["module_status"],
                "uploaded_by": g["uploaded_by_raw"] or "—",
                "status": aggregate_status,
                "created_at": _fmt_date(min(g["created_ats"])) if g["created_ats"] else "—",
                "updated_at": _fmt_datetime(max(g["updated_ats"])) if g["updated_ats"] else "—",
                "activity_type_names": g["activity_type_names"],
                "activities": g["activities"],
            })

        # Sort the GROUPS (not individual activities) - same three
        # options as before, applied to each lesson's own aggregated
        # created_at/updated_at (the raw datetimes, not the formatted
        # display strings, hence pulling from `grouped` again below).
        sort_key = (sort_by or "").strip().lower()
        # No / unknown choice -> Oldest First (the default).
        if sort_key not in ("created_desc", "updated_desc"):
            sort_key = "created_asc"

        def sort_value(entry):
            g = grouped[entry["resource_id"]]
            if sort_key == "created_asc":
                return min(g["created_ats"]) if g["created_ats"] else None
            if sort_key == "updated_desc":
                return max(g["updated_ats"]) if g["updated_ats"] else None
            return min(g["created_ats"]) if g["created_ats"] else None  # created_desc / default

        reverse = sort_key != "created_asc"
        lessons.sort(key=lambda entry: sort_value(entry) or "", reverse=reverse)

        total = len(lessons)
        page = max(1, page)
        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(page, total_pages)
        offset = (page - 1) * per_page
        page_lessons = lessons[offset:offset + per_page]

        return {
            "lessons": page_lessons,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }
    except Error as e:
        print(f"learning_activities: failed to load grouped learning activities overview: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_activities_for_resource(resource_id):
    """
    Returns every non-archived learning_activities_tbl row attached to
    `resource_id`, WITH full content INCLUDING correct answers (MCQ's
    correct option, fill-in-the-blank's correct_answer) - this is the
    admin-facing counterpart to lesson_activities.
    get_published_activities_for_resource(), which deliberately hides
    correct answers from learners and only returns Published rows.
    Backs the Content preview modal, the Edit dropdown, and the Archive
    checklist on Manage Learning Activities - all three need to know
    exactly which individual activities exist for a lesson.

    Returns [] (never raises) on any error or invalid resource_id.
    """
    if not resource_id:
        return []
    try:
        resource_id = int(resource_id)
    except (TypeError, ValueError):
        return []

    connection = get_db_connection()
    if connection is None:
        return []

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT la.la_id, la.activity_title, la.points, atp.activity_type_name,
                       last.la_stats_name
                FROM {LEARNING_ACTIVITIES_TABLE} la
                LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
                LEFT JOIN {ACTIVITY_TYPES_TABLE} atp ON la.activity_type_id = atp.activity_type_id
                WHERE la.resource_id = %s
                  AND (last.la_stats_name IS NULL OR last.la_stats_name != 'Archived')
                ORDER BY la.la_id ASC""",
            (resource_id,)
        )
        activity_rows = cursor.fetchall()

        results = []
        for row in activity_rows:
            la_id = row["la_id"]
            activity_type = row.get("activity_type_name") or ""
            entry = {
                "activity_id": la_id,
                "activity_title": row["activity_title"],
                "activity_type": activity_type,
                "status": row.get("la_stats_name") or "Draft",
                "points": row.get("points") or 0,
                "items": [],
            }

            if activity_type == "Multiple Choice":
                cursor.execute(
                    "SELECT q_id, question_text FROM mcq_questions_tbl WHERE la_id = %s ORDER BY q_id ASC",
                    (la_id,)
                )
                for q in cursor.fetchall():
                    cursor.execute(
                        """SELECT option_id, option_letter, option_text, is_correct
                           FROM mcq_options_tbl WHERE q_id = %s ORDER BY option_letter ASC""",
                        (q["q_id"],)
                    )
                    options = cursor.fetchall()
                    entry["items"].append({
                        "q_id": q["q_id"],
                        "question_text": q["question_text"],
                        "options": [
                            {
                                "option_id": o["option_id"],
                                "option_letter": o["option_letter"],
                                "text": o["option_text"],
                                "is_correct": bool(o.get("is_correct")),
                            }
                            for o in options
                        ],
                    })

            elif activity_type == "Fill in the Blanks":
                cursor.execute(
                    "SELECT fib_id, content, correct_answer FROM fill_blanks_tbl WHERE la_id = %s ORDER BY fib_id ASC",
                    (la_id,)
                )
                for row2 in cursor.fetchall():
                    entry["items"].append({
                        "fib_id": row2["fib_id"],
                        "content": row2["content"],
                        "correct_answer": row2.get("correct_answer"),
                    })

            elif activity_type == "Flashcards":
                cursor.execute(
                    "SELECT flashcard_id, front_text, back_text FROM flashcards_tbl WHERE la_id = %s ORDER BY flashcard_id ASC",
                    (la_id,)
                )
                for row2 in cursor.fetchall():
                    entry["items"].append({
                        "flashcard_id": row2["flashcard_id"],
                        "front": row2["front_text"],
                        "back": row2["back_text"],
                    })

            results.append(entry)

        cursor.close()
        return results
    except Error as e:
        print(f"learning_activities: failed to load admin activities for resource_id={resource_id}: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


def archive_activity(activity_id):
    """
    Soft-archives one activity by flipping its la_stats_id to
    "Archived" - never a DELETE, mirroring resource_publishing.
    archive_resource()'s exact convention (and finally giving the
    Manage Learning Activities table's Archive button a REAL backing
    route - it previously called a /admin/learning-activities/<id>/
    archive URL that didn't exist yet; only a hard-delete /delete route
    did).

    Returns (bool, str) - (success, message).
    """
    if not activity_id:
        return False, "Activity ID is required."
    try:
        aid = int(activity_id)
    except (TypeError, ValueError):
        return False, "Invalid activity ID."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_la_stats(connection)
        cursor = connection.cursor()

        cursor.execute(f"SELECT la_id FROM {LEARNING_ACTIVITIES_TABLE} WHERE la_id = %s", (aid,))
        if not cursor.fetchone():
            cursor.close()
            return False, "Learning activity not found."

        # Task #123: backend-level guard, not just the frontend archive-
        # check - a Published activity can never be archived directly.
        cursor.execute(
            f"""SELECT last.la_stats_name FROM {LEARNING_ACTIVITIES_TABLE} la
                LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
                WHERE la.la_id = %s""",
            (aid,)
        )
        (current_status,) = cursor.fetchone()
        if current_status == "Published":
            cursor.close()
            return False, (
                "This activity is Published. You must unpublish it first "
                "before you can archive it."
            )

        cursor.execute(f"SELECT la_stats_id FROM {LA_STATS_TABLE} WHERE la_stats_name = 'Archived'")
        status_row = cursor.fetchone()
        if not status_row:
            cursor.close()
            return False, "Could not resolve the Archived status."
        archived_status_id = status_row[0]

        cursor.execute(
            f"UPDATE {LEARNING_ACTIVITIES_TABLE} SET la_stats_id = %s, updated_at = NOW() WHERE la_id = %s",
            (archived_status_id, aid)
        )
        connection.commit()
        cursor.close()
        return True, "Activity archived successfully."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"learning_activities: failed to archive activity {aid}: {e}")
        return False, "Could not archive this activity."
    finally:
        if connection.is_connected():
            connection.close()


# ================================================================
# DELETE LEARNING ACTIVITY
# ================================================================
def delete_activity(activity_id):
    """
    Deletes a learning activity by la_id along with its related child
    records in mcq_options_tbl, mcq_questions_tbl, fill_blanks_tbl,
    and flashcards_tbl.

    Args:
        activity_id (int | str): The primary key (la_id) of the activity to delete.

    Returns:
        tuple[bool, str]: (True, "Learning activity deleted successfully.") on success,
                          (False, "<error message>") on failure.
    """
    if not activity_id:
        return False, "Activity ID is required."
    try:
        aid = int(activity_id)
    except (TypeError, ValueError):
        return False, "Invalid activity ID."

    connection = get_db_connection()
    if connection is None:
        return False, "Database connection failed."

    try:
        cursor = connection.cursor()

        # Check if the activity exists
        cursor.execute(f"SELECT la_id FROM {LEARNING_ACTIVITIES_TABLE} WHERE la_id = %s", (aid,))
        if not cursor.fetchone():
            cursor.close()
            return False, "Learning activity not found."

        # Delete dependent mcq options first
        cursor.execute(
            """
            DELETE FROM mcq_options_tbl
            WHERE q_id IN (SELECT q_id FROM mcq_questions_tbl WHERE la_id = %s)
            """,
            (aid,)
        )

        # Delete dependent mcq questions
        cursor.execute("DELETE FROM mcq_questions_tbl WHERE la_id = %s", (aid,))

        # Delete dependent fill in the blanks
        cursor.execute("DELETE FROM fill_blanks_tbl WHERE la_id = %s", (aid,))

        # Delete dependent flashcards
        cursor.execute("DELETE FROM flashcards_tbl WHERE la_id = %s", (aid,))

        # Delete the learning activity itself
        cursor.execute(f"DELETE FROM {LEARNING_ACTIVITIES_TABLE} WHERE la_id = %s", (aid,))

        connection.commit()
        cursor.close()
        return True, "Learning activity deleted successfully."
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"learning_activities: failed to delete learning activity {aid}: {e}")
        return False, "Could not delete learning activity."
    finally:
        if connection.is_connected():
            connection.close()