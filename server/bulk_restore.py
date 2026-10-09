"""
bulk_restore.py - restore archived items (one, many, or a parent with a
checklist of its children) without ever creating a duplicate
--------------------------------------------------------------------------------------
Every Restore button in the admin goes through restore_one() here, so
the duplicate rule lives in ONE place:

    category  - no other ACTIVE category with the same name
    module    - no other ACTIVE module with the same name in its category
    lesson    - no other ACTIVE lesson with the same title
    video     - its lesson has no other active video tutorial
    activity  - no other active activity with the same title, and its
                lesson has no other active activity of the same type
    exercise  - no other active exercise with the same title, and its
                lesson has no other active coding exercise

(the same rules Add/Edit already enforce - an archived row never blocks
a new name, so restoring it is where the clash has to be caught).

The actual restore is still done by each item's existing restore
function (manage_course.restore_category(), archived_items.
restore_learning_activity(), ...) - this file only decides whether it
may run.

Archiving a Category / Module also archives everything under it (see
manage_course.archive_category() / archive_module()), so
get_restore_options() lists those archived children as a tree and
restore_with_children() brings back the ticked ones with the parent.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from manage_course import restore_category, restore_module
from archived_items import restore_learning_resource, restore_learning_activity, restore_coding_exercise
from video_tutorials import restore_video_tutorial
from publishing_actions import lesson_already_has

KINDS = ("category", "module", "resource", "video", "activity", "exercise")
KIND_LABELS = {
    "category": "Category", "module": "Module", "resource": "Lesson",
    "video": "Video Tutorial", "activity": "Activity", "exercise": "Coding Exercise",
}
CHILD_KEYS = ("module_ids", "resource_ids", "video_ids", "activity_ids", "exercise_ids")

_RESTORE_FUNCS = {
    "category": restore_category,
    "module": restore_module,
    "resource": restore_learning_resource,
    "video": restore_video_tutorial,
    "activity": restore_learning_activity,
    "exercise": restore_coding_exercise,
}


# ============================================================
# Duplicate / state check
# ============================================================
def _row(cursor, sql, params):
    cursor.execute(sql, params)
    return cursor.fetchone()


def _check_category(cursor, cat_id):
    row = _row(cursor, "SELECT category_name AS name, COALESCE(is_archived, 0) AS archived "
                       "FROM category_tbl WHERE cat_id = %s", (cat_id,))
    if not row:
        return None, "Category not found."
    if not row["archived"]:
        return row["name"], "This category is no longer archived."
    if _row(cursor, """SELECT 1 FROM category_tbl
                       WHERE LOWER(category_name) = LOWER(%s) AND cat_id != %s
                         AND COALESCE(is_archived, 0) = 0 LIMIT 1""", (row["name"], cat_id)):
        return row["name"], f'A category named "{row["name"]}" already exists. Rename or archive it first.'
    return row["name"], None


def _check_module(cursor, module_id):
    row = _row(cursor, """SELECT m.module_name AS name, m.cat_id,
                                 (COALESCE(m.is_archived, 0) = 1 OR COALESCE(ms.module_stats_name, '') = 'Archived') AS archived
                          FROM modules_tbl m
                          LEFT JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
                          WHERE m.module_id = %s""", (module_id,))
    if not row:
        return None, "Module not found."
    if not row["archived"]:
        return row["name"], "This module is no longer archived."
    if _row(cursor, """SELECT 1 FROM modules_tbl m
                       LEFT JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
                       WHERE LOWER(m.module_name) = LOWER(%s) AND m.cat_id = %s AND m.module_id != %s
                         AND COALESCE(m.is_archived, 0) = 0
                         AND COALESCE(ms.module_stats_name, '') != 'Archived' LIMIT 1""",
            (row["name"], row["cat_id"], module_id)):
        return row["name"], f'A module named "{row["name"]}" already exists in this category. Rename or archive it first.'
    return row["name"], None


def _check_resource(cursor, resource_id):
    row = _row(cursor, """SELECT lr.resource_title AS name, COALESCE(lrs.lr_stats_name, '') AS status
                          FROM learning_resources_tbl lr
                          LEFT JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
                          WHERE lr.resource_id = %s""", (resource_id,))
    if not row:
        return None, "Lesson not found."
    if row["status"] != "Archived":
        return row["name"], "This lesson is no longer archived."
    if _row(cursor, """SELECT 1 FROM learning_resources_tbl lr
                       LEFT JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
                       WHERE LOWER(lr.resource_title) = LOWER(%s) AND lr.resource_id != %s
                         AND COALESCE(lrs.lr_stats_name, '') != 'Archived' LIMIT 1""",
            (row["name"], resource_id)):
        return row["name"], f'A lesson named "{row["name"]}" already exists. Rename or archive it first.'
    return row["name"], None


def _check_video(cursor, video_id):
    row = _row(cursor, """SELECT vt.video_title AS name, vt.resource_id, COALESCE(s.la_stats_name, '') AS status
                          FROM video_tutorials_tbl vt
                          LEFT JOIN learning_activities_stats_tbl s ON vt.video_stats_id = s.la_stats_id
                          WHERE vt.video_tutorial_id = %s""", (video_id,))
    if not row:
        return None, "Video tutorial not found."
    name = row["name"] or "Untitled video"
    if row["status"] != "Archived":
        return name, "This video tutorial is no longer archived."
    if row["resource_id"] and lesson_already_has(cursor, "video", row["resource_id"], exclude_id=video_id):
        return name, "Its lesson already has a video tutorial. Each lesson can have only one."
    return name, None


def _check_activity(cursor, la_id):
    row = _row(cursor, """SELECT la.activity_title AS name, la.resource_id, la.activity_type_id,
                                 atp.activity_type_name AS type_name, COALESCE(s.la_stats_name, '') AS status
                          FROM learning_activities_tbl la
                          LEFT JOIN learning_activities_stats_tbl s ON la.la_stats_id = s.la_stats_id
                          LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
                          WHERE la.la_id = %s""", (la_id,))
    if not row:
        return None, "Activity not found."
    if row["status"] != "Archived":
        return row["name"], "This activity is no longer archived."
    active = """LEFT JOIN learning_activities_stats_tbl s ON la.la_stats_id = s.la_stats_id
                WHERE la.la_id != %s AND COALESCE(s.la_stats_name, '') != 'Archived'"""
    if _row(cursor, f"SELECT 1 FROM learning_activities_tbl la {active} "
                    "AND LOWER(la.activity_title) = LOWER(%s) LIMIT 1", (la_id, row["name"])):
        return row["name"], f'An activity named "{row["name"]}" already exists.'
    if row["resource_id"] and _row(cursor, f"SELECT 1 FROM learning_activities_tbl la {active} "
                                           "AND la.resource_id = %s AND la.activity_type_id = %s LIMIT 1",
                                   (la_id, row["resource_id"], row["activity_type_id"])):
        return row["name"], f'Its lesson already has a {row["type_name"] or "matching"} activity. Each lesson can have only one of each type.'
    return row["name"], None


def _check_exercise(cursor, exercise_id):
    row = _row(cursor, """SELECT ce.exercise_title AS name, ce.resource_id,
                                 (COALESCE(ce.is_archived, 0) = 1 OR COALESCE(s.la_stats_name, '') = 'Archived') AS archived
                          FROM coding_exercises_tbl ce
                          LEFT JOIN learning_activities_stats_tbl s ON ce.exercise_stats_id = s.la_stats_id
                          WHERE ce.exercise_id = %s""", (exercise_id,))
    if not row:
        return None, "Coding exercise not found."
    if not row["archived"]:
        return row["name"], "This coding exercise is no longer archived."
    if _row(cursor, """SELECT 1 FROM coding_exercises_tbl ce
                       LEFT JOIN learning_activities_stats_tbl s ON ce.exercise_stats_id = s.la_stats_id
                       WHERE LOWER(ce.exercise_title) = LOWER(%s) AND ce.exercise_id != %s
                         AND COALESCE(ce.is_archived, 0) = 0
                         AND COALESCE(s.la_stats_name, '') != 'Archived' LIMIT 1""",
            (row["name"], exercise_id)):
        return row["name"], f'A coding exercise named "{row["name"]}" already exists.'
    from exercise_pool import lesson_exercise_count, EXERCISE_POOL_MAX   # feat/exercise-pool
    if row["resource_id"] and lesson_exercise_count(cursor, row["resource_id"], exclude_id=exercise_id) >= EXERCISE_POOL_MAX:
        return row["name"], f"Its lesson already has {EXERCISE_POOL_MAX} coding exercises, the most a lesson can have."
    return row["name"], None


_CHECKS = {
    "category": _check_category,
    "module": _check_module,
    "resource": _check_resource,
    "video": _check_video,
    "activity": _check_activity,
    "exercise": _check_exercise,
}


def restore_conflict(kind, item_id):
    """(name, reason) - reason is None when the item may be restored."""
    connection = get_db_connection()
    if connection is None:
        return None, "Could not connect to the database."
    try:
        cursor = connection.cursor(dictionary=True)
        result = _CHECKS[kind](cursor, item_id)
        cursor.close()
        return result
    except Error as e:
        print(f"bulk_restore: failed to check {kind} {item_id}: {e}")
        return None, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def restore_one(kind, item_id):
    """
    Duplicate check, then the item's own restore function.
    Returns (success: bool, message: str, name: str | None).
    """
    if kind not in KINDS:
        return False, "Unknown item type.", None
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return False, "Invalid item ID.", None
    name, reason = restore_conflict(kind, item_id)
    if reason:
        return False, reason, name
    success, message = _RESTORE_FUNCS[kind](item_id)
    return success, message, name


# ============================================================
# Archived children of a Category / Module (restore checklist)
# ============================================================
def _in(ids):
    return ",".join(["%s"] * len(ids))


def _lessons_tree(cursor, module_ids):
    """{module_id: [lesson dict]} - only lessons that are archived or hold an archived item."""
    if not module_ids:
        return {}
    cursor.execute(
        f"""SELECT lr.resource_id, lr.resource_title, lr.module_id,
                   COALESCE(lrs.lr_stats_name, '') = 'Archived' AS archived
            FROM learning_resources_tbl lr
            LEFT JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
            WHERE lr.module_id IN ({_in(module_ids)})
            ORDER BY COALESCE(lr.display_order, 999999), lr.resource_id""",
        tuple(module_ids))
    lessons = cursor.fetchall()
    if not lessons:
        return {}
    rids = [l["resource_id"] for l in lessons]
    items = {rid: [] for rid in rids}

    cursor.execute(
        f"""SELECT vt.video_tutorial_id AS id, vt.resource_id, vt.video_title AS name
            FROM video_tutorials_tbl vt
            JOIN learning_activities_stats_tbl s ON vt.video_stats_id = s.la_stats_id
            WHERE vt.resource_id IN ({_in(rids)}) AND s.la_stats_name = 'Archived'
            ORDER BY vt.video_tutorial_id""", tuple(rids))
    for r in cursor.fetchall():
        items[r["resource_id"]].append({"type": "video", "id": r["id"], "label": "Video Tutorial",
                                        "name": r["name"] or "Untitled video"})

    cursor.execute(
        f"""SELECT la.la_id AS id, la.resource_id, la.activity_title AS name, atp.activity_type_name AS type_name
            FROM learning_activities_tbl la
            JOIN learning_activities_stats_tbl s ON la.la_stats_id = s.la_stats_id
            LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
            WHERE la.resource_id IN ({_in(rids)}) AND s.la_stats_name = 'Archived'
            ORDER BY la.la_id""", tuple(rids))
    for r in cursor.fetchall():
        items[r["resource_id"]].append({"type": "activity", "id": r["id"], "label": r["type_name"] or "Activity",
                                        "name": r["name"]})

    cursor.execute(
        f"""SELECT ce.exercise_id AS id, ce.resource_id, ce.exercise_title AS name
            FROM coding_exercises_tbl ce
            LEFT JOIN learning_activities_stats_tbl s ON ce.exercise_stats_id = s.la_stats_id
            WHERE ce.resource_id IN ({_in(rids)})
              AND (COALESCE(ce.is_archived, 0) = 1 OR COALESCE(s.la_stats_name, '') = 'Archived')
            ORDER BY ce.exercise_id""", tuple(rids))
    for r in cursor.fetchall():
        items[r["resource_id"]].append({"type": "exercise", "id": r["id"], "label": "Coding Exercise",
                                        "name": r["name"]})

    tree = {}
    for l in lessons:
        if not l["archived"] and not items[l["resource_id"]]:
            continue
        tree.setdefault(l["module_id"], []).append({
            "id": l["resource_id"], "name": l["resource_title"],
            "archived": bool(l["archived"]), "items": items[l["resource_id"]],
        })
    return tree


def get_restore_options(parent_type, parent_id):
    """
    Archived children of a Category or Module, as a tree:
        {"name", "modules": [{"id", "name", "archived", "lessons": [
            {"id", "name", "archived", "items": [{"type", "id", "label", "name"}]}]}]}
    A Module parent has exactly one entry in "modules" - itself.
    Active rows are only listed to hold an archived row below them.
    Returns None on a database error / unknown parent.
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        if parent_type == "category":
            row = _row(cursor, "SELECT category_name AS name FROM category_tbl WHERE cat_id = %s", (parent_id,))
            where, params = "m.cat_id = %s", (parent_id,)
        elif parent_type == "module":
            row = _row(cursor, "SELECT module_name AS name FROM modules_tbl WHERE module_id = %s", (parent_id,))
            where, params = "m.module_id = %s", (parent_id,)
        else:
            return None
        if not row:
            return None

        cursor.execute(
            f"""SELECT m.module_id, m.module_name,
                       (COALESCE(m.is_archived, 0) = 1 OR COALESCE(ms.module_stats_name, '') = 'Archived') AS archived
                FROM modules_tbl m
                LEFT JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
                WHERE {where}
                ORDER BY COALESCE(m.display_order, 999999), m.module_id""", params)
        modules = cursor.fetchall()
        lessons = _lessons_tree(cursor, [m["module_id"] for m in modules])
        cursor.close()

        result = []
        for m in modules:
            m_lessons = lessons.get(m["module_id"], [])
            if parent_type == "category" and not m["archived"] and not m_lessons:
                continue
            result.append({"id": m["module_id"], "name": m["module_name"],
                           "archived": bool(m["archived"]), "lessons": m_lessons})
        return {"name": row["name"], "modules": result}
    except Error as e:
        print(f"bulk_restore: failed to list restore options for {parent_type} {parent_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def _ids(values):
    result = set()
    for v in values or []:
        try:
            result.add(int(v))
        except (TypeError, ValueError):
            continue
    return result


def restore_with_children(parent_type, parent_id, children=None):
    """
    Restores a Category / Module, then the ticked children - only ids that
    really are archived children of this parent are touched. A child whose
    module / lesson is still archived is skipped (it would be hidden under
    an archived parent). Returns (restored: [..], skipped: [..]), each
    entry {"type", "id", "name"[, "reason"]}.
    """
    restored, skipped = [], []

    def run(kind, item_id):
        ok, message, name = restore_one(kind, item_id)
        entry = {"type": kind, "id": item_id, "name": name or KIND_LABELS.get(kind, kind)}
        if ok:
            restored.append(entry)
        else:
            skipped.append({**entry, "reason": message})
        return ok

    if not run(parent_type, parent_id):
        return restored, skipped

    children = children or {}
    options = get_restore_options(parent_type, parent_id)
    if not options:
        return restored, skipped

    picked = {key: _ids(children.get(key)) for key in CHILD_KEYS}
    for module in options["modules"]:
        module_ok = not module["archived"]
        if parent_type == "module":
            module_ok = True   # the parent itself, restored above
        elif module["archived"] and module["id"] in picked["module_ids"]:
            module_ok = run("module", module["id"])

        for lesson in module["lessons"]:
            wants_lesson = lesson["archived"] and lesson["id"] in picked["resource_ids"]
            wanted_items = [it for it in lesson["items"] if it["id"] in picked[f"{it['type']}_ids"]]
            if not module_ok:
                for it in ([{"type": "resource", **lesson}] if wants_lesson else []) + wanted_items:
                    skipped.append({"type": it["type"], "id": it["id"], "name": it["name"],
                                    "reason": f'Its module "{module["name"]}" is still archived.'})
                continue

            lesson_ok = not lesson["archived"]
            if wants_lesson:
                lesson_ok = run("resource", lesson["id"])
            for it in wanted_items:
                if lesson_ok:
                    run(it["type"], it["id"])
                else:
                    skipped.append({"type": it["type"], "id": it["id"], "name": it["name"],
                                    "reason": f'Its lesson "{lesson["name"]}" is still archived.'})
    return restored, skipped


def restore_many(items):
    """
    items: [{"type", "id", "children"?}] - children only for a category /
    module. Restores whatever it can and reports the rest.
    Returns (restored, skipped) like restore_with_children().
    """
    restored, skipped = [], []
    for item in items or []:
        kind = (item or {}).get("type")
        item_id = (item or {}).get("id")
        if kind in ("category", "module"):
            r, s = restore_with_children(kind, item_id, item.get("children"))
        else:
            ok, message, name = restore_one(kind, item_id)
            entry = {"type": kind, "id": item_id, "name": name or KIND_LABELS.get(kind, "Item")}
            r, s = ([entry], []) if ok else ([], [{**entry, "reason": message}])
        restored.extend(r)
        skipped.extend(s)
    return restored, skipped


def summary_message(restored, skipped):
    parts = []
    if restored:
        parts.append(f"{len(restored)} item{'s' if len(restored) != 1 else ''} restored")
    if skipped:
        parts.append(f"{len(skipped)} skipped")
    return (", ".join(parts) or "Nothing was restored") + "."
