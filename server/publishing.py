"""
publishing.py - Task #publishing-page-backend
------------------------------------------------------------------
Pure DB-access helper backing the new Admin > Publishing page. Mirrors
manage_course.py's style exactly: this file never touches Flask/session
state directly - admin_routes.py is the only place this gets turned
into an HTTP response.

WHAT THIS FILE DOES
Builds the FULL content tree - Category > Module > Lesson > Activities/
Coding Exercises - in the same order learners walk through it
(display_order at every level, per Task #publishing-schema), with each
node's own status. The whole tree is always returned; the Publishing
page's Ready to Publish / Published tabs filter it client-side, the
same way the interactive prototype already worked - a parent stays
visible whenever any of its descendants match the active tab, which is
much simpler to keep in sync as one rule on the frontend than
duplicating that branch-pruning logic in SQL as well.

Reuses the existing ensure_* lazy-migration functions from
manage_course.py / resource_publishing.py rather than re-declaring
them, so this file is never the FIRST place those columns/tables get
created - it just reads whatever they've already ensured exist.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from manage_course import (
    ensure_category_stats_id_column, ensure_display_order_columns,
    CATEGORY_TABLE, CATEGORY_STATS_TABLE, MODULES_TABLE, MODULE_STATS_TABLE,
)
from publishing_actions import ensure_publishing_columns, backfill_published_at  # feat/publishing-tree
from resource_publishing import (
    ensure_resource_display_order_column,
    LEARNING_RESOURCES_TABLE, LR_STATS_TABLE,
)

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
CODING_EXERCISES_TABLE = "coding_exercises_tbl"
VIDEO_TUTORIALS_TABLE = "video_tutorials_tbl"


REORDER_CONFIG = {
    "category": {"table": CATEGORY_TABLE, "id_col": "cat_id", "parent_col": None},
    "module": {"table": MODULES_TABLE, "id_col": "module_id", "parent_col": "cat_id"},
    "lesson": {"table": LEARNING_RESOURCES_TABLE, "id_col": "resource_id", "parent_col": "module_id"},
}


def reorder_items(item_type, parent_id, ordered_ids):
    """
    Task #publishing-reorder-backend: persists a new display_order for
    a set of categories, modules, or lessons that all share the same
    parent (categories have none - they're always top-level). Rejects
    the WHOLE request up front if any id doesn't exist or belongs to a
    different parent than claimed - reordering never silently drops an
    item or reassigns it to a different parent as a side effect.

    item_type (str): "category" | "module" | "lesson"
    parent_id: the shared cat_id (for modules) or module_id (for
        lessons); ignored for categories.
    ordered_ids (list): ids in the new desired order - display_order
        becomes their 1-based position in this list.

    Returns (bool, str).
    """
    config = REORDER_CONFIG.get(item_type)
    if not config:
        return False, "Unknown item type."
    if not ordered_ids or not isinstance(ordered_ids, list):
        return False, "A list of ordered IDs is required."

    # Task fix: ordered_ids arrives from the frontend's numId() helper
    # as strings (String.split() never returns numbers) - the database
    # cursor returns real integers for these id columns, so comparing
    # the two sets directly (found_ids != set(ordered_ids)) was ALWAYS
    # true, even for a perfectly valid reorder. Normalizing to int here
    # once means every comparison below (the found_ids check, the
    # UPDATE's WHERE clause) works correctly against real integer ids.
    try:
        ordered_ids = [int(x) for x in ordered_ids]
    except (TypeError, ValueError):
        return False, "Invalid item ID in the new order."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_category_stats_id_column(connection)
        ensure_display_order_columns(connection)
        ensure_resource_display_order_column(connection)

        cursor = connection.cursor()
        table = config["table"]
        id_col = config["id_col"]
        parent_col = config["parent_col"]

        placeholders = ", ".join(["%s"] * len(ordered_ids))
        if parent_col:
            cursor.execute(
                f"SELECT {id_col}, {parent_col} FROM {table} WHERE {id_col} IN ({placeholders})",
                tuple(ordered_ids)
            )
        else:
            cursor.execute(
                f"SELECT {id_col} FROM {table} WHERE {id_col} IN ({placeholders})",
                tuple(ordered_ids)
            )
        rows = cursor.fetchall()

        found_ids = {row[0] for row in rows}
        if found_ids != set(ordered_ids):
            cursor.close()
            return False, "One or more items could not be found."

        if parent_col:
            mismatched = [row[0] for row in rows if str(row[1]) != str(parent_id)]
            if mismatched:
                cursor.close()
                return False, "You can only reorder items within the same parent."

        for position, item_id in enumerate(ordered_ids, start=1):
            cursor.execute(
                f"UPDATE {table} SET display_order = %s WHERE {id_col} = %s",
                (position, item_id)
            )

        connection.commit()
        cursor.close()
        return True, "New order saved."
    except Error as e:
        connection.rollback()
        print(f"publishing: failed to reorder {item_type}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def _edited_sql(alias, status_expr):
    """1 when a Published row was edited after it went live (updated_at > published_at)."""
    return (f"(CASE WHEN {status_expr} = 'Published' AND {alias}.updated_at IS NOT NULL "
            f"AND {alias}.published_at IS NOT NULL AND {alias}.updated_at > {alias}.published_at "
            f"THEN 1 ELSE 0 END)")


def get_publishing_tree():
    """
    Returns the full roadmap tree, in learner order:

        [ { "id": "cat-<cat_id>", "type": "category", "name", "status",
            "edited", "display_order",
            "children": [
              { "id": "mod-<module_id>", "type": "module", "name", "description",
                "status", "edited", "display_order",
                "children": [
                  { "id": "res-<resource_id>", "type": "lesson", "name", "status",
                    "edited", "display_order",
                    "videos":     [{"id": "vid-<id>", "name", "status", "edited"}],
                    "activities": [{"id": "act-<id>", "name", "status", "edited", "activity_type"}],
                    "exercises":  [{"id": "ex-<id>",  "name", "status", "edited"}] } ] } ] } ]

    feat/publishing-tree: adds videos (they were missing from the tree),
    each activity's type (for the + menu's one-of-each-type rule), the
    module description (for the Edit Module modal) and "edited" - a
    Published item changed after it went live, which the Published tab
    shows with an Update button.

    Archived items are excluded at every level. Returns [] (never raises)
    on any database error.
    """
    connection = get_db_connection()
    if connection is None:
        return []

    try:
        ensure_category_stats_id_column(connection)
        ensure_display_order_columns(connection)
        ensure_resource_display_order_column(connection)
        ensure_publishing_columns(connection)
        backfill_published_at(connection)

        cursor = connection.cursor(dictionary=True)

        cat_status = "COALESCE(cs.cat_stats_name, 'Draft')"
        cursor.execute(
            f"""SELECT c.cat_id, c.category_name, c.display_order,
                       {cat_status} AS status_name, {_edited_sql('c', cat_status)} AS edited
                FROM {CATEGORY_TABLE} c
                LEFT JOIN {CATEGORY_STATS_TABLE} cs ON c.cat_stats_id = cs.cat_stats_id
                WHERE COALESCE(c.is_archived, 0) = 0
                  AND COALESCE(cs.cat_stats_name, '') != 'Archived'
                ORDER BY COALESCE(c.display_order, 999999) ASC, c.cat_id ASC"""
        )
        categories = cursor.fetchall()

        mod_status = "COALESCE(ms.module_stats_name, 'Draft')"
        cursor.execute(
            f"""SELECT m.module_id, m.module_name, m.description, m.cat_id, m.display_order,
                       {mod_status} AS status_name, {_edited_sql('m', mod_status)} AS edited
                FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE COALESCE(m.is_archived, 0) = 0
                  AND COALESCE(ms.module_stats_name, '') != 'Archived'
                ORDER BY m.cat_id ASC, COALESCE(m.display_order, 999999) ASC, m.created_at ASC, m.module_id ASC"""
        )
        modules = cursor.fetchall()

        lr_status = "COALESCE(lrs.lr_stats_name, 'Draft')"
        cursor.execute(
            f"""SELECT lr.resource_id, lr.resource_title, lr.module_id, lr.display_order,
                       {lr_status} AS status_name, {_edited_sql('lr', lr_status)} AS edited
                FROM {LEARNING_RESOURCES_TABLE} lr
                LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE COALESCE(lrs.lr_stats_name, '') != 'Archived'
                ORDER BY lr.module_id ASC, COALESCE(lr.display_order, 999999) ASC, lr.created_at ASC, lr.resource_id ASC"""
        )
        lessons = cursor.fetchall()

        leaf_status = "COALESCE(last.la_stats_name, 'Draft')"
        cursor.execute(
            f"""SELECT vt.video_tutorial_id, vt.video_title, vt.resource_id,
                       {leaf_status} AS status_name, {_edited_sql('vt', leaf_status)} AS edited
                FROM {VIDEO_TUTORIALS_TABLE} vt
                LEFT JOIN {LA_STATS_TABLE} last ON vt.video_stats_id = last.la_stats_id
                WHERE COALESCE(last.la_stats_name, '') != 'Archived'
                ORDER BY vt.resource_id ASC, vt.video_tutorial_id ASC"""
        )
        videos = cursor.fetchall()

        cursor.execute(
            f"""SELECT la.la_id, la.activity_title, la.resource_id, atp.activity_type_name,
                       {leaf_status} AS status_name, {_edited_sql('la', leaf_status)} AS edited
                FROM {LEARNING_ACTIVITIES_TABLE} la
                LEFT JOIN {LA_STATS_TABLE} last ON la.la_stats_id = last.la_stats_id
                LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
                WHERE COALESCE(last.la_stats_name, '') != 'Archived'
                ORDER BY la.resource_id ASC, la.la_id ASC"""
        )
        activities = cursor.fetchall()

        cursor.execute(
            f"""SELECT ce.exercise_id, ce.exercise_title, ce.resource_id,
                       {leaf_status} AS status_name, {_edited_sql('ce', leaf_status)} AS edited
                FROM {CODING_EXERCISES_TABLE} ce
                LEFT JOIN {LA_STATS_TABLE} last ON ce.exercise_stats_id = last.la_stats_id
                WHERE COALESCE(ce.is_archived, 0) = 0
                  AND COALESCE(last.la_stats_name, '') != 'Archived'
                ORDER BY ce.resource_id ASC, ce.exercise_id ASC"""
        )
        exercises = cursor.fetchall()

        cursor.close()

        def leaf(prefix, row, id_col, name_col, **extra):
            item = {
                "id": f"{prefix}-{row[id_col]}",
                "name": row[name_col] or "Untitled",
                "status": row["status_name"],
                "edited": bool(row["edited"]),
            }
            item.update(extra)
            return item

        videos_by_resource = {}
        for v in videos:
            videos_by_resource.setdefault(v["resource_id"], []).append(
                leaf("vid", v, "video_tutorial_id", "video_title"))

        activities_by_resource = {}
        for a in activities:
            activities_by_resource.setdefault(a["resource_id"], []).append(
                leaf("act", a, "la_id", "activity_title", activity_type=a.get("activity_type_name") or ""))

        exercises_by_resource = {}
        for e in exercises:
            exercises_by_resource.setdefault(e["resource_id"], []).append(
                leaf("ex", e, "exercise_id", "exercise_title"))

        lessons_by_module = {}
        for lr in lessons:
            lessons_by_module.setdefault(lr["module_id"], []).append({
                "id": f"res-{lr['resource_id']}",
                "type": "lesson",
                "name": lr["resource_title"],
                "status": lr["status_name"],
                "edited": bool(lr["edited"]),
                "display_order": lr["display_order"],
                "videos": videos_by_resource.get(lr["resource_id"], []),
                "activities": activities_by_resource.get(lr["resource_id"], []),
                "exercises": exercises_by_resource.get(lr["resource_id"], []),
            })

        modules_by_category = {}
        for m in modules:
            modules_by_category.setdefault(m["cat_id"], []).append({
                "id": f"mod-{m['module_id']}",
                "type": "module",
                "name": m["module_name"],
                "description": m.get("description") or "",
                "status": m["status_name"],
                "edited": bool(m["edited"]),
                "display_order": m["display_order"],
                "children": lessons_by_module.get(m["module_id"], []),
            })

        tree = []
        for c in categories:
            tree.append({
                "id": f"cat-{c['cat_id']}",
                "type": "category",
                "name": c["category_name"],
                "status": c["status_name"],
                "edited": bool(c["edited"]),
                "display_order": c["display_order"],
                "children": modules_by_category.get(c["cat_id"], []),
            })

        return tree
    except Error as e:
        print(f"publishing: failed to build publishing tree: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()
