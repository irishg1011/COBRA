"""
learning_resources.py - Task #37, #38, #39, #40 & #43: Learning Resources DB Integration
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

Task #43 requirements this file satisfies:
    - get_learning_resources_overview() now also resolves each
      resource's PARENT MODULE status (module_id, module_status), so
      the Learning Resources table/JS can know - without a second
      request - whether a resource is even eligible to be published
      (its module must be "Published" first; see resource_publishing.py,
      which is the authoritative, server-side gate for the actual
      publish action).
"""

from datetime import datetime
from mysql.connector import Error
from cobradb import get_db_connection

LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
RESOURCE_TYPES_TABLE = "resource_types_tbl"
CATEGORY_TABLE = "category_tbl"
PROFILE_TABLE = "profile_tbl"
LR_STATS_TABLE = "learning_resources_stats_tbl"
# NEW - Task #43: needed to resolve each resource's parent module status.
MODULES_TABLE = "modules_tbl"
MODULE_STATS_TABLE = "module_stats_tbl"
# NEW: needed so a Lesson's row can surface whether a Video Tutorial is
# attached to it (see video_tutorials.py - a video's resource_id points
# back at this Lesson).
VIDEO_TUTORIALS_TABLE = "video_tutorials_tbl"
# NEW: a Video Tutorial's own status (video_stats_id) reuses this SAME
# shared table (see video_tutorials.py) - needed here to exclude an
# archived video from the video-preview subquery above.
LA_STATS_TABLE = "learning_activities_stats_tbl"


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
# Task #54: LESSONS BY MODULE (dependent Lesson dropdown lookup)
# ================================================================
def get_resources_by_module(module_id):
    """
    Task #54: backs the Create Learning Activity page's dependent Lesson
    dropdown (Category -> Module -> Lesson). Returns only the lessons
    (learning_resources_tbl rows) whose module_id matches the selected
    Module - via a parameterized query, so the selected module id is
    never concatenated into SQL. Mirrors
    manage_course.get_modules_by_category()'s exact convention (a lean,
    single-purpose SELECT, not the full paginated/joined shape
    get_learning_resources_overview() returns) - just one level deeper
    (Module -> Lesson instead of Category -> Module).

    Excludes Archived resources (see resource_publishing.archive_resource())
    the same way get_learning_resources_overview()'s own default view
    does - an archived lesson should never be selectable as a new
    activity's parent lesson.

    Args:
        module_id (int | str): the modules_tbl.module_id to filter
            learning_resources_tbl by.

    Returns:
        [] (never raises) if module_id is falsy, the module has no
        resources, or on any database error - callers should treat an
        empty list as "no lessons available for this module" and never
        fall back to hardcoded/mock data. Otherwise a list of
        {"resource_id": int, "resource_title": str} dicts, ordered by
        title, which is exactly what the Lesson dropdown needs to map
        resource_id -> resource_title (Task #54's core requirement).
    """
    if not module_id:
        return []

    connection = get_db_connection()
    if connection is None:
        return []
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""
            SELECT lr.resource_id, lr.resource_title
            FROM {LEARNING_RESOURCES_TABLE} lr
            LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
            INNER JOIN {MODULES_TABLE} m ON lr.module_id = m.module_id
            LEFT JOIN {CATEGORY_TABLE} c ON lr.cat_id = c.cat_id
            WHERE lr.module_id = %s
              AND (lrs.lr_stats_name IS NULL OR lrs.lr_stats_name != 'Archived')
              AND COALESCE(m.is_archived, 0) = 0
              AND (c.cat_id IS NULL OR COALESCE(c.is_archived, 0) = 0)
            ORDER BY lr.created_at ASC, lr.resource_id ASC
            """,
            (module_id,)
        )
        rows = cursor.fetchall()
        cursor.close()
        return rows
    except Error as e:
        print(f"learning_resources: failed to load lessons for module {module_id}: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


# ================================================================
# Task #37, #39, #40 & #43: LEARNING RESOURCES OVERVIEW (table data)
# ================================================================
def get_learning_resources_overview(search_query=None, type_filter=None, page=1, per_page=8,
                                     created_from=None, created_to=None,
                                     updated_from=None, updated_to=None):
    """
    Pulls a page of learning_resources_tbl, LEFT JOINed against
    category_tbl, resource_types_tbl, profile_tbl (uploader),
    learning_resources_stats_tbl, AND (NEW - Task #43) modules_tbl /
    module_stats_tbl, so Category / Uploaded By / Type / Status / parent
    Module Status are all returned as display-ready values - never a raw
    cat_id / uploaded_by / resource_type_id / lr_stats_id / module_id.

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

    Each resource dict now also includes (Task #43):
        "module_id"      - the resource's parent module_id (or None)
        "module_status"  - the parent module's Published/Draft/Archived
                            status name ("Draft" if the module row is
                            missing/unlinked) - used by the Learning
                            Resources table/JS to grey out or explain
                            why the Publish button is blocked, before
                            the server re-validates the exact same rule
                            authoritatively (see resource_publishing.py).
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
            LEFT JOIN {MODULES_TABLE} md ON lr.module_id = md.module_id
            LEFT JOIN {MODULE_STATS_TABLE} mst ON md.module_stats_id = mst.module_stats_id
            WHERE (lrs.lr_stats_name IS NULL OR lrs.lr_stats_name != 'Archived')
        """
        # NEW - Task #81: an archived resource (see resource_publishing.
        # archive_resource()) is removed from the active Manage Learning
        # Resources list the same way an archived module is excluded
        # from the active Manage Course list - it still exists in
        # learning_resources_tbl (never deleted), just filtered out of
        # this default view.
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
                lr.module_id, mst.module_stats_name,
                lr.created_at, lr.updated_at,
                (SELECT vt.video_tutorial_id FROM {VIDEO_TUTORIALS_TABLE} vt
                    LEFT JOIN {LA_STATS_TABLE} vts ON vt.video_stats_id = vts.la_stats_id
                    WHERE vt.resource_id = lr.resource_id
                      AND (vts.la_stats_name IS NULL OR vts.la_stats_name != 'Archived')
                    ORDER BY vt.video_tutorial_id DESC LIMIT 1) AS video_tutorial_id,
                (SELECT vt.file_path FROM {VIDEO_TUTORIALS_TABLE} vt
                    LEFT JOIN {LA_STATS_TABLE} vts ON vt.video_stats_id = vts.la_stats_id
                    WHERE vt.resource_id = lr.resource_id
                      AND (vts.la_stats_name IS NULL OR vts.la_stats_name != 'Archived')
                    ORDER BY vt.video_tutorial_id DESC LIMIT 1) AS video_file_path,
                (SELECT vts.la_stats_name FROM {VIDEO_TUTORIALS_TABLE} vt
                    LEFT JOIN {LA_STATS_TABLE} vts ON vt.video_stats_id = vts.la_stats_id
                    WHERE vt.resource_id = lr.resource_id
                      AND (vts.la_stats_name IS NULL OR vts.la_stats_name != 'Archived')
                    ORDER BY vt.video_tutorial_id DESC LIMIT 1) AS video_status
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
                "status": row.get("lr_stats_name") or "Draft",
                # NEW - Task #43: parent module identity + status, so the
                # frontend can grey out / explain the Publish button
                # without a second request. Defaults to "Draft" when the
                # resource has no linked module row, which correctly
                # blocks publishing (a resource with no real parent
                # module can never be "Published").
                "module_id": row.get("module_id"),
                "module_status": row.get("module_stats_name") or "Draft",
                "created_at": _fmt_date(row.get("created_at")),
                "updated_at": _fmt_datetime(row.get("updated_at")),
                # NEW: if this Lesson has a Video Tutorial attached (see
                # video_tutorials.py - a video's resource_id points back
                # at its parent Lesson), surface the video's id/file path
                # so the frontend can show a "View Video" link on this
                # row - a correlated subquery, never a JOIN, so a Lesson
                # with multiple attached videos still returns exactly
                # one row here (only the most recent video is linked).
                "video_tutorial_id": row.get("video_tutorial_id"),
                "video_file_path": row.get("video_file_path"),
                # NEW: the video's OWN status (independent of the Lesson's)
                # - needed so the Archive checklist can warn specifically
                # about archiving a Published video, not just a Published
                # Lesson.
                "video_status": row.get("video_status") or "Draft",
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