"""
relational_archive.py - Task #116: Relational Archive Restrictions,
Cascading Archive & Checkbox-Controlled Cascading Restore
--------------------------------------------------------------------------------------
Single source of truth for:
    1. Blocking an archive action on a Category / Module / Learning Resource
       whenever any connected child/descendant item is currently Published.
    2. Cascading an archive action down to every connected child/descendant
       that is NOT published (i.e. still in Draft) once the parent itself is
       confirmed eligible and archived.
    3. Listing every archived child/descendant of a Category/Module -
       grouped by type (Modules, Learning Resources, Learning Activities,
       Coding Exercises) - so the checkbox Restore modal can present one
       checkbox per item.
    4. Restoring a parent item together with only the checkboxes the admin
       actually selected.

RELATIONSHIP SHAPE (per cobra_db.sql):

    category_tbl (cat_id)
        -> modules_tbl (cat_id)
            -> learning_resources_tbl (module_id)
                -> learning_activities_tbl (resource_id)
                -> coding_exercises_tbl (resource_id)
            -> learning_activities_tbl (module_id)   [an activity can also
               be tied directly to a module, independent of any one lesson]

STATUS/ARCHIVE COLUMNS USED:
    modules_tbl              -> module_stats_id (module_stats_tbl) + is_archived
    category_tbl              -> is_archived (no separate status table)
    learning_resources_tbl    -> lr_stats_id (learning_resources_stats_tbl,
                                  includes an "Archived" row - Task #81)
    learning_activities_tbl   -> la_stats_id (learning_activities_stats_tbl,
                                  includes "Draft"/"Published"/"Archived")
    coding_exercises_tbl      -> exercise_stats_id (learning_activities_stats_tbl,
                                  reused) + is_archived (Task #112)

RESTORE RULE: a restored item ALWAYS lands back in "Draft" - never straight
back to "Published" - matching every other restore/unpublish action already
in this project (resource_publishing.unpublish_resource(),
learning_activity_publishing.unpublish_activity(), etc.). The admin must
re-publish deliberately.

This file never touches Flask/session state directly - admin_routes.py is
the only place these get turned into HTTP responses, matching this
project's existing convention (manage_course.py, resource_publishing.py,
learning_activity_publishing.py, coding_exercise_publishing.py, etc.).
"""

from mysql.connector import Error
from cobradb import get_db_connection

CATEGORY_TABLE = "category_tbl"
MODULES_TABLE = "modules_tbl"
MODULE_STATS_TABLE = "module_stats_tbl"
LEARNING_RESOURCES_TABLE = "learning_resources_tbl"
LR_STATS_TABLE = "learning_resources_stats_tbl"
LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
CODING_EXERCISES_TABLE = "coding_exercises_tbl"


# ================================================================
# DEPENDENCY COLLECTION - gathers every descendant of a parent, with
# its own display name and its own real status name, regardless of
# whether that status happens to be Draft / Published / Archived.
# ================================================================
def _fetch_module_descendants(cursor, module_ids):
    """
    Given a list of module_id, returns:
        resources:         [{resource_id, resource_title, module_id, status}]
        activities_direct: [{la_id, activity_title, module_id, resource_id, status}]
    (module-linked activities - i.e. not necessarily tied to any one lesson)
    """
    if not module_ids:
        return [], []
    fmt = ",".join(["%s"] * len(module_ids))

    cursor.execute(
        f"""SELECT lr.resource_id, lr.resource_title, lr.module_id,
                   COALESCE(lrs.lr_stats_name, 'Draft') AS status
            FROM {LEARNING_RESOURCES_TABLE} lr
            LEFT JOIN {LR_STATS_TABLE} lrs ON lr.lr_stats_id = lrs.lr_stats_id
            WHERE lr.module_id IN ({fmt})""",
        tuple(module_ids)
    )
    resources = cursor.fetchall()

    cursor.execute(
        f"""SELECT la.la_id, la.activity_title, la.module_id, la.resource_id,
                   COALESCE(las.la_stats_name, 'Draft') AS status
            FROM {LEARNING_ACTIVITIES_TABLE} la
            LEFT JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
            WHERE la.module_id IN ({fmt})""",
        tuple(module_ids)
    )
    activities = cursor.fetchall()

    return resources, activities


def _fetch_resource_descendants(cursor, resource_ids):
    """
    Given a list of resource_id, returns:
        activities: [{la_id, activity_title, resource_id, status}]
        exercises:  [{exercise_id, exercise_title, resource_id, status, is_archived}]
    """
    if not resource_ids:
        return [], []
    fmt = ",".join(["%s"] * len(resource_ids))

    cursor.execute(
        f"""SELECT la.la_id, la.activity_title, la.resource_id,
                   COALESCE(las.la_stats_name, 'Draft') AS status
            FROM {LEARNING_ACTIVITIES_TABLE} la
            LEFT JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
            WHERE la.resource_id IN ({fmt})""",
        tuple(resource_ids)
    )
    activities = cursor.fetchall()

    cursor.execute(
        f"""SELECT ce.exercise_id, ce.exercise_title, ce.resource_id,
                   COALESCE(las.la_stats_name, 'Draft') AS status,
                   COALESCE(ce.is_archived, 0) AS is_archived
            FROM {CODING_EXERCISES_TABLE} ce
            LEFT JOIN {LA_STATS_TABLE} las ON ce.exercise_stats_id = las.la_stats_id
            WHERE ce.resource_id IN ({fmt})""",
        tuple(resource_ids)
    )
    exercises = cursor.fetchall()

    return activities, exercises


def _dedupe_activities(*lists):
    seen = set()
    result = []
    for lst in lists:
        for a in lst:
            if a["la_id"] in seen:
                continue
            seen.add(a["la_id"])
            result.append(a)
    return result


def get_category_tree(cat_id, connection=None):
    """
    Collects every descendant of a Category: its Modules, and (one level
    deeper, per Module) its Learning Resources and module-linked Learning
    Activities, and (one level deeper still, per Resource) its
    resource-linked Learning Activities and Coding Exercises.

    Returns {"modules": [...], "resources": [...], "activities": [...],
    "exercises": [...]} or None on a database error.
    """
    own_connection = connection is None
    if own_connection:
        connection = get_db_connection()
        if connection is None:
            return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT m.module_id, m.module_name,
                       COALESCE(ms.module_stats_name, 'Draft') AS status
                FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE m.cat_id = %s""",
            (cat_id,)
        )
        modules = cursor.fetchall()
        module_ids = [m["module_id"] for m in modules]

        resources, activities_direct = _fetch_module_descendants(cursor, module_ids)
        resource_ids = [r["resource_id"] for r in resources]
        activities_via_resource, exercises = _fetch_resource_descendants(cursor, resource_ids)

        activities = _dedupe_activities(activities_direct, activities_via_resource)

        return {
            "modules": modules,
            "resources": resources,
            "activities": activities,
            "exercises": exercises,
        }
    except Error as e:
        print(f"relational_archive: failed to build category tree for {cat_id}: {e}")
        return None
    finally:
        if own_connection and connection is not None and connection.is_connected():
            connection.close()


def get_module_tree(module_id, connection=None):
    """
    Collects every descendant of a single Module: its Learning Resources,
    module-linked Learning Activities, and (one level deeper) each
    Resource's Learning Activities and Coding Exercises.

    Returns {"resources": [...], "activities": [...], "exercises": [...]}
    or None on a database error.
    """
    own_connection = connection is None
    if own_connection:
        connection = get_db_connection()
        if connection is None:
            return None
    try:
        cursor = connection.cursor(dictionary=True)
        resources, activities_direct = _fetch_module_descendants(cursor, [module_id])
        resource_ids = [r["resource_id"] for r in resources]
        activities_via_resource, exercises = _fetch_resource_descendants(cursor, resource_ids)

        activities = _dedupe_activities(activities_direct, activities_via_resource)

        return {"resources": resources, "activities": activities, "exercises": exercises}
    except Error as e:
        print(f"relational_archive: failed to build module tree for {module_id}: {e}")
        return None
    finally:
        if own_connection and connection is not None and connection.is_connected():
            connection.close()


def get_resource_tree(resource_id, connection=None):
    """
    Collects a single Learning Resource's direct children: its Learning
    Activities and Coding Exercises.

    Returns {"activities": [...], "exercises": [...]} or None on a
    database error.
    """
    own_connection = connection is None
    if own_connection:
        connection = get_db_connection()
        if connection is None:
            return None
    try:
        cursor = connection.cursor(dictionary=True)
        activities, exercises = _fetch_resource_descendants(cursor, [resource_id])
        return {"activities": activities, "exercises": exercises}
    except Error as e:
        print(f"relational_archive: failed to build resource tree for {resource_id}: {e}")
        return None
    finally:
        if own_connection and connection is not None and connection.is_connected():
            connection.close()


# ================================================================
# PUBLISHED-DEPENDENCY GATE
# ================================================================
def _find_published(items):
    return [i for i in items if i.get("status") == "Published"]


def check_category_archive_eligibility(cat_id):
    """
    Returns (eligible: bool, blockers: [str], tree: dict|None).
    `blockers` lists a human-readable name for every currently-Published
    descendant blocking the archive (modules, resources, activities,
    exercises), so the caller can surface them verbatim in a warning
    alert without the frontend having to know the relationship shape.
    """
    tree = get_category_tree(cat_id)
    if tree is None:
        return False, ["Could not verify this category's connected items. Please try again."], None

    blockers = []
    blockers += [f'Module "{m["module_name"]}"' for m in _find_published(tree["modules"])]
    blockers += [f'Learning resource "{r["resource_title"]}"' for r in _find_published(tree["resources"])]
    blockers += [f'Learning activity "{a["activity_title"]}"' for a in _find_published(tree["activities"])]
    blockers += [f'Coding exercise "{e["exercise_title"]}"' for e in _find_published(tree["exercises"])]

    return (len(blockers) == 0), blockers, tree


def check_module_archive_eligibility(module_id):
    tree = get_module_tree(module_id)
    if tree is None:
        return False, ["Could not verify this module's connected items. Please try again."], None

    blockers = []
    blockers += [f'Learning resource "{r["resource_title"]}"' for r in _find_published(tree["resources"])]
    blockers += [f'Learning activity "{a["activity_title"]}"' for a in _find_published(tree["activities"])]
    blockers += [f'Coding exercise "{e["exercise_title"]}"' for e in _find_published(tree["exercises"])]

    return (len(blockers) == 0), blockers, tree


def check_resource_archive_eligibility(resource_id):
    tree = get_resource_tree(resource_id)
    if tree is None:
        return False, ["Could not verify this resource's connected items. Please try again."], None

    blockers = []
    blockers += [f'Learning activity "{a["activity_title"]}"' for a in _find_published(tree["activities"])]
    blockers += [f'Coding exercise "{e["exercise_title"]}"' for e in _find_published(tree["exercises"])]

    return (len(blockers) == 0), blockers, tree


# ================================================================
# CASCADING ARCHIVE
# ================================================================
def _get_status_id(cursor, table, name_col, id_col, name):
    cursor.execute(f"SELECT {id_col} FROM {table} WHERE {name_col} = %s", (name,))
    row = cursor.fetchone()
    return row[0] if row else None


def _archive_ids(cursor, table, id_col, stats_col, archived_stats_id, ids, is_archived_col=None):
    if not ids:
        return
    fmt = ",".join(["%s"] * len(ids))
    if is_archived_col:
        cursor.execute(
            f"UPDATE {table} SET {stats_col} = %s, {is_archived_col} = 1 WHERE {id_col} IN ({fmt})",
            tuple([archived_stats_id] + ids)
        )
    else:
        cursor.execute(
            f"UPDATE {table} SET {stats_col} = %s WHERE {id_col} IN ({fmt})",
            tuple([archived_stats_id] + ids)
        )


def cascade_archive_category(cat_id):
    """
    Archives the category itself, then cascades to every DRAFT descendant
    (modules, resources, activities, exercises). Published descendants
    must never reach here - the caller is expected to have already
    called check_category_archive_eligibility() and blocked the request
    if any exist; this function does not re-check on its own, matching
    the "check, then confirm, then act" flow the frontend drives.

    Returns (success: bool, message: str).
    """
    if not cat_id:
        return False, "Category ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        tree = get_category_tree(cat_id, connection=connection)
        if tree is None:
            return False, "Could not verify this category's connected items."

        cursor = connection.cursor()

        cursor.execute(f"SELECT is_archived FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Category not found."
        if row[0]:
            cursor.close()
            return False, "This category is already archived."

        module_archived_id = _get_status_id(cursor, MODULE_STATS_TABLE, "module_stats_name", "module_stats_id", "Archived")
        lr_archived_id = _get_status_id(cursor, LR_STATS_TABLE, "lr_stats_name", "lr_stats_id", "Archived")
        la_archived_id = _get_status_id(cursor, LA_STATS_TABLE, "la_stats_name", "la_stats_id", "Archived")

        draft_module_ids = [m["module_id"] for m in tree["modules"] if m["status"] != "Published"]
        draft_resource_ids = [r["resource_id"] for r in tree["resources"] if r["status"] != "Published"]
        draft_activity_ids = [a["la_id"] for a in tree["activities"] if a["status"] != "Published"]
        draft_exercise_ids = [e["exercise_id"] for e in tree["exercises"] if e["status"] != "Published"]

        if module_archived_id:
            _archive_ids(cursor, MODULES_TABLE, "module_id", "module_stats_id", module_archived_id, draft_module_ids, is_archived_col="is_archived")
        if lr_archived_id:
            _archive_ids(cursor, LEARNING_RESOURCES_TABLE, "resource_id", "lr_stats_id", lr_archived_id, draft_resource_ids)
        if la_archived_id:
            _archive_ids(cursor, LEARNING_ACTIVITIES_TABLE, "la_id", "la_stats_id", la_archived_id, draft_activity_ids)
            _archive_ids(cursor, CODING_EXERCISES_TABLE, "exercise_id", "exercise_stats_id", la_archived_id, draft_exercise_ids, is_archived_col="is_archived")

        cursor.execute(
            f"UPDATE {CATEGORY_TABLE} SET is_archived = 1 WHERE cat_id = %s AND is_archived = 0",
            (cat_id,)
        )

        connection.commit()
        cursor.close()
        return True, "Category and its draft-status connected items were archived successfully."
    except Error as e:
        connection.rollback()
        print(f"relational_archive: failed to cascade-archive category {cat_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def cascade_archive_module(module_id):
    """
    Archives the module itself, then cascades to every DRAFT descendant
    (resources, activities, exercises).

    Returns (success: bool, message: str).
    """
    if not module_id:
        return False, "Module ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        tree = get_module_tree(module_id, connection=connection)
        if tree is None:
            return False, "Could not verify this module's connected items."

        cursor = connection.cursor()

        cursor.execute(
            f"""SELECT m.is_archived, ms.module_stats_name
                FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE m.module_id = %s""",
            (module_id,)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Module not found."
        is_archived, status_name = row
        if is_archived:
            cursor.close()
            return False, "This module is already archived."
        if status_name == "Published":
            cursor.close()
            return False, "Published modules cannot be archived. Please change the module status to Draft first."

        lr_archived_id = _get_status_id(cursor, LR_STATS_TABLE, "lr_stats_name", "lr_stats_id", "Archived")
        la_archived_id = _get_status_id(cursor, LA_STATS_TABLE, "la_stats_name", "la_stats_id", "Archived")

        draft_resource_ids = [r["resource_id"] for r in tree["resources"] if r["status"] != "Published"]
        draft_activity_ids = [a["la_id"] for a in tree["activities"] if a["status"] != "Published"]
        draft_exercise_ids = [e["exercise_id"] for e in tree["exercises"] if e["status"] != "Published"]

        if lr_archived_id:
            _archive_ids(cursor, LEARNING_RESOURCES_TABLE, "resource_id", "lr_stats_id", lr_archived_id, draft_resource_ids)
        if la_archived_id:
            _archive_ids(cursor, LEARNING_ACTIVITIES_TABLE, "la_id", "la_stats_id", la_archived_id, draft_activity_ids)
            _archive_ids(cursor, CODING_EXERCISES_TABLE, "exercise_id", "exercise_stats_id", la_archived_id, draft_exercise_ids, is_archived_col="is_archived")

        cursor.execute(
            f"""UPDATE {MODULES_TABLE} SET is_archived = 1, updated_at = NOW()
                WHERE module_id = %s AND COALESCE(is_archived, 0) = 0""",
            (module_id,)
        )

        connection.commit()
        cursor.close()
        return True, "Module and its draft-status connected items were archived successfully."
    except Error as e:
        connection.rollback()
        print(f"relational_archive: failed to cascade-archive module {module_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def cascade_archive_resource(resource_id):
    """
    Archives the resource itself, then cascades to every DRAFT descendant
    (activities, exercises).

    Returns (success: bool, message: str).
    """
    if not resource_id:
        return False, "Resource ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        tree = get_resource_tree(resource_id, connection=connection)
        if tree is None:
            return False, "Could not verify this resource's connected items."

        cursor = connection.cursor()
        cursor.execute(
            f"SELECT resource_id FROM {LEARNING_RESOURCES_TABLE} WHERE resource_id = %s",
            (resource_id,)
        )
        if cursor.fetchone() is None:
            cursor.close()
            return False, "Resource not found."

        lr_archived_id = _get_status_id(cursor, LR_STATS_TABLE, "lr_stats_name", "lr_stats_id", "Archived")
        la_archived_id = _get_status_id(cursor, LA_STATS_TABLE, "la_stats_name", "la_stats_id", "Archived")

        draft_activity_ids = [a["la_id"] for a in tree["activities"] if a["status"] != "Published"]
        draft_exercise_ids = [e["exercise_id"] for e in tree["exercises"] if e["status"] != "Published"]

        if la_archived_id:
            _archive_ids(cursor, LEARNING_ACTIVITIES_TABLE, "la_id", "la_stats_id", la_archived_id, draft_activity_ids)
            _archive_ids(cursor, CODING_EXERCISES_TABLE, "exercise_id", "exercise_stats_id", la_archived_id, draft_exercise_ids, is_archived_col="is_archived")

        if not lr_archived_id:
            cursor.close()
            return False, "Could not resolve the Archived status."

        cursor.execute(
            f"UPDATE {LEARNING_RESOURCES_TABLE} SET lr_stats_id = %s, updated_at = NOW() WHERE resource_id = %s",
            (lr_archived_id, resource_id)
        )

        connection.commit()
        cursor.close()
        return True, "Resource and its draft-status connected items were archived successfully."
    except Error as e:
        connection.rollback()
        print(f"relational_archive: failed to cascade-archive resource {resource_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


# ================================================================
# RESTORE - list archived descendants (for the checkbox modal) &
# restore parent + only the selected ones.
# ================================================================
def get_archived_descendants_for_restore(parent_type, parent_id):
    """
    Returns every currently-ARCHIVED descendant of a Category or Module,
    grouped by type, ready for a checkbox restore modal:

        {
            "modules": [{"id", "name"}],       (Category only)
            "resources": [{"id", "name"}],
            "activities": [{"id", "name"}],
            "exercises": [{"id", "name"}],
        }

    parent_type: "category" | "module". Returns None on a database error
    or an unrecognized parent_type.
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        if parent_type == "category":
            tree = get_category_tree(parent_id, connection=connection)
        elif parent_type == "module":
            tree = get_module_tree(parent_id, connection=connection)
        else:
            return None
        if tree is None:
            return None

        result = {"resources": [], "activities": [], "exercises": []}
        if parent_type == "category":
            result["modules"] = [
                {"id": m["module_id"], "name": m["module_name"]}
                for m in tree["modules"] if m["status"] == "Archived"
            ]
        result["resources"] = [
            {"id": r["resource_id"], "name": r["resource_title"]}
            for r in tree["resources"] if r["status"] == "Archived"
        ]
        result["activities"] = [
            {"id": a["la_id"], "name": a["activity_title"]}
            for a in tree["activities"] if a["status"] == "Archived"
        ]
        result["exercises"] = [
            {"id": e["exercise_id"], "name": e["exercise_title"]}
            for e in tree["exercises"] if e["status"] == "Archived"
        ]
        return result
    except Error as e:
        print(f"relational_archive: failed to list archived descendants for {parent_type} {parent_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def _to_int_list(values):
    result = []
    for v in (values or []):
        try:
            result.append(int(v))
        except (TypeError, ValueError):
            continue
    return result


def restore_category_with_selection(cat_id, module_ids=None, resource_ids=None, activity_ids=None, exercise_ids=None):
    """
    Restores the category itself (is_archived -> 0), then restores only
    the explicitly selected child items back to "Draft".

    Returns (success: bool, message: str).
    """
    if not cat_id:
        return False, "Category ID is required."

    module_ids = _to_int_list(module_ids)
    resource_ids = _to_int_list(resource_ids)
    activity_ids = _to_int_list(activity_ids)
    exercise_ids = _to_int_list(exercise_ids)

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()

        cursor.execute(f"SELECT is_archived FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Category not found."
        if not row[0]:
            cursor.close()
            return False, "This category is not archived."

        module_draft_id = _get_status_id(cursor, MODULE_STATS_TABLE, "module_stats_name", "module_stats_id", "Draft")
        lr_draft_id = _get_status_id(cursor, LR_STATS_TABLE, "lr_stats_name", "lr_stats_id", "Draft")
        la_draft_id = _get_status_id(cursor, LA_STATS_TABLE, "la_stats_name", "la_stats_id", "Draft")

        cursor.execute(f"UPDATE {CATEGORY_TABLE} SET is_archived = 0 WHERE cat_id = %s", (cat_id,))

        if module_ids and module_draft_id:
            fmt = ",".join(["%s"] * len(module_ids))
            cursor.execute(
                f"UPDATE {MODULES_TABLE} SET is_archived = 0, module_stats_id = %s WHERE module_id IN ({fmt})",
                tuple([module_draft_id] + module_ids)
            )
        if resource_ids and lr_draft_id:
            fmt = ",".join(["%s"] * len(resource_ids))
            cursor.execute(
                f"UPDATE {LEARNING_RESOURCES_TABLE} SET lr_stats_id = %s WHERE resource_id IN ({fmt})",
                tuple([lr_draft_id] + resource_ids)
            )
        if activity_ids and la_draft_id:
            fmt = ",".join(["%s"] * len(activity_ids))
            cursor.execute(
                f"UPDATE {LEARNING_ACTIVITIES_TABLE} SET la_stats_id = %s WHERE la_id IN ({fmt})",
                tuple([la_draft_id] + activity_ids)
            )
        if exercise_ids and la_draft_id:
            fmt = ",".join(["%s"] * len(exercise_ids))
            cursor.execute(
                f"UPDATE {CODING_EXERCISES_TABLE} SET exercise_stats_id = %s, is_archived = 0 WHERE exercise_id IN ({fmt})",
                tuple([la_draft_id] + exercise_ids)
            )

        connection.commit()
        cursor.close()
        return True, "Category restored along with the selected items."
    except Error as e:
        connection.rollback()
        print(f"relational_archive: failed to restore category {cat_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def restore_module_with_selection(module_id, resource_ids=None, activity_ids=None, exercise_ids=None):
    """
    Restores the module itself, then restores only the explicitly
    selected Learning Resources / Learning Activities / Coding Exercises
    back to "Draft".

    Returns (success: bool, message: str).
    """
    if not module_id:
        return False, "Module ID is required."

    resource_ids = _to_int_list(resource_ids)
    activity_ids = _to_int_list(activity_ids)
    exercise_ids = _to_int_list(exercise_ids)

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()

        cursor.execute(
            f"""SELECT m.is_archived, ms.module_stats_name
                FROM {MODULES_TABLE} m
                LEFT JOIN {MODULE_STATS_TABLE} ms ON m.module_stats_id = ms.module_stats_id
                WHERE m.module_id = %s""",
            (module_id,)
        )
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Module not found."
        is_archived, status_name = row
        if not is_archived and status_name != "Archived":
            cursor.close()
            return False, "This module is not archived."

        lr_draft_id = _get_status_id(cursor, LR_STATS_TABLE, "lr_stats_name", "lr_stats_id", "Draft")
        la_draft_id = _get_status_id(cursor, LA_STATS_TABLE, "la_stats_name", "la_stats_id", "Draft")
        module_draft_id = _get_status_id(cursor, MODULE_STATS_TABLE, "module_stats_name", "module_stats_id", "Draft")

        cursor.execute(
            f"""UPDATE {MODULES_TABLE}
                SET is_archived = 0,
                    module_stats_id = CASE
                        WHEN module_stats_id = (SELECT module_stats_id FROM {MODULE_STATS_TABLE} WHERE module_stats_name = 'Archived' LIMIT 1)
                        THEN %s
                        ELSE module_stats_id
                    END,
                    updated_at = NOW()
                WHERE module_id = %s""",
            (module_draft_id, module_id)
        )

        if resource_ids and lr_draft_id:
            fmt = ",".join(["%s"] * len(resource_ids))
            cursor.execute(
                f"UPDATE {LEARNING_RESOURCES_TABLE} SET lr_stats_id = %s WHERE resource_id IN ({fmt})",
                tuple([lr_draft_id] + resource_ids)
            )
        if activity_ids and la_draft_id:
            fmt = ",".join(["%s"] * len(activity_ids))
            cursor.execute(
                f"UPDATE {LEARNING_ACTIVITIES_TABLE} SET la_stats_id = %s WHERE la_id IN ({fmt})",
                tuple([la_draft_id] + activity_ids)
            )
        if exercise_ids and la_draft_id:
            fmt = ",".join(["%s"] * len(exercise_ids))
            cursor.execute(
                f"UPDATE {CODING_EXERCISES_TABLE} SET exercise_stats_id = %s, is_archived = 0 WHERE exercise_id IN ({fmt})",
                tuple([la_draft_id] + exercise_ids)
            )

        connection.commit()
        cursor.close()
        return True, "Module restored along with the selected items."
    except Error as e:
        connection.rollback()
        print(f"relational_archive: failed to restore module {module_id}: {e}")
        return False, f"Database error: {e}"
    finally:
        if connection.is_connected():
            connection.close()