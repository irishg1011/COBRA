"""
publishing_actions.py - feat/publishing-tree
-----------------------------------------------------------------------
ONE set of status rules for all 6 item types on the Publishing page:

    category (chapter) > module > lesson > video / activity / exercise

Actions (each is one transaction):
    mark_ready(kind, id)        Draft -> Ready to Publish
                                (parent must already be Ready or Published)
    mark_all_ready(kind, id)    same, then every Draft item inside -> Ready
    move_to_draft(kind, id)     Ready -> Draft, and every Ready item inside
                                goes back to Draft too (a child is never
                                further along than its parent)
    publish(kind, id)           Ready -> Published (parent must be Published),
                                then every Ready item inside is published too
                                ("publish the chapter once")
    unpublish(kind, id)         Published -> Ready, and every Published item
                                inside -> Ready (learner progress is never
                                touched - rows are only hidden, not deleted)
    confirm_update(kind, id)    Published item edited after it went live:
                                marks the edit as reviewed (clears "Edited")

"Edited since publish" = updated_at > published_at. Every publish stamps
published_at = NOW() in the same UPDATE that sets updated_at = NOW().
The columns are added lazily (ADD COLUMN IF NOT EXISTS), like every
other column this project adds at runtime.

Pure DB helpers - admin_routes.py is the only place these become HTTP
responses. Never touches Flask/session state.
"""

from mysql.connector import Error
from cobradb import get_db_connection

LA_STATS = ("learning_activities_stats_tbl", "la_stats_id", "la_stats_name")

# kind -> table, id column, status FK column, (stats table, stats id, stats name),
#         parent (kind, FK column), archived-flag column or None
NODES = {
    "category": {
        "table": "category_tbl", "id": "cat_id", "fk": "cat_stats_id",
        "stats": ("category_stats_tbl", "cat_stats_id", "cat_stats_name"),
        "parent": None, "archived_col": "is_archived", "label": "chapter",
    },
    "module": {
        "table": "modules_tbl", "id": "module_id", "fk": "module_stats_id",
        "stats": ("module_stats_tbl", "module_stats_id", "module_stats_name"),
        "parent": ("category", "cat_id"), "archived_col": "is_archived", "label": "module",
    },
    "lesson": {
        "table": "learning_resources_tbl", "id": "resource_id", "fk": "lr_stats_id",
        "stats": ("learning_resources_stats_tbl", "lr_stats_id", "lr_stats_name"),
        "parent": ("module", "module_id"), "archived_col": None, "label": "lesson",
    },
    "video": {
        "table": "video_tutorials_tbl", "id": "video_tutorial_id", "fk": "video_stats_id",
        "stats": LA_STATS,
        "parent": ("lesson", "resource_id"), "archived_col": None, "label": "video",
    },
    "activity": {
        "table": "learning_activities_tbl", "id": "la_id", "fk": "la_stats_id",
        "stats": LA_STATS,
        "parent": ("lesson", "resource_id"), "archived_col": None, "label": "activity",
    },
    "exercise": {
        "table": "coding_exercises_tbl", "id": "exercise_id", "fk": "exercise_stats_id",
        "stats": LA_STATS,
        "parent": ("lesson", "resource_id"), "archived_col": "is_archived", "label": "exercise",
    },
}

CHILDREN = {
    "category": ["module"],
    "module": ["lesson"],
    "lesson": ["video", "activity", "exercise"],
    "video": [], "activity": [], "exercise": [],
}

DRAFT = "Draft"
READY = "Ready to Publish"
PUBLISHED = "Published"

_columns_ensured = False


# ============================================================
# Columns: published_at on every table + updated_at on category_tbl
# ============================================================
def ensure_publishing_columns(connection):
    """
    Adds published_at (and category_tbl.updated_at, which never existed)
    once per process. DDL commits implicitly, so callers run this BEFORE
    any write. Also makes sure every table/stats row the other ensure_*
    functions add already exists, by calling them first.
    """
    global _columns_ensured
    if _columns_ensured:
        return
    # Lazy imports: these modules are large and some import each other.
    from manage_course import ensure_category_stats_id_column, ensure_category_is_archived_column, ensure_is_archived_column, ensure_module_stats
    from resource_publishing import ensure_lr_stats
    from learning_activities import ensure_la_stats
    from video_tutorials import ensure_video_stats
    from coding_exercises import ensure_exercise_stats

    ensure_category_stats_id_column(connection)
    ensure_category_is_archived_column(connection)
    ensure_is_archived_column(connection)
    ensure_module_stats(connection)
    ensure_lr_stats(connection)
    ensure_la_stats(connection)
    ensure_video_stats(connection)
    ensure_exercise_stats(connection)

    try:
        cursor = connection.cursor()
        cursor.execute("ALTER TABLE category_tbl ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL")
        for node in NODES.values():
            cursor.execute(f"ALTER TABLE {node['table']} ADD COLUMN IF NOT EXISTS published_at DATETIME NULL")
        connection.commit()
        cursor.close()
        _columns_ensured = True
    except Error as e:
        print(f"publishing_actions: failed to ensure publishing columns: {e}")


def backfill_published_at(connection):
    """
    Items that were already Published before this branch (or were
    published by a path that doesn't stamp published_at) get
    published_at = their updated_at, so nothing shows "Edited" on day
    one. Cheap: only touches rows where published_at IS NULL.
    """
    try:
        cursor = connection.cursor()
        for node in NODES.values():
            s_table, s_id, s_name = node["stats"]
            cursor.execute(
                f"""UPDATE {node['table']} t
                    JOIN {s_table} s ON t.{node['fk']} = s.{s_id}
                    SET t.published_at = COALESCE(t.updated_at, NOW())
                    WHERE s.{s_name} = %s AND t.published_at IS NULL""",
                (PUBLISHED,)
            )
        connection.commit()
        cursor.close()
    except Error as e:
        print(f"publishing_actions: failed to backfill published_at: {e}")


# ============================================================
# Small cursor helpers (all run on the caller's open cursor)
# ============================================================
def _status_id(cursor, kind, name):
    s_table, s_id, s_name = NODES[kind]["stats"]
    cursor.execute(f"SELECT {s_id} FROM {s_table} WHERE {s_name} = %s LIMIT 1", (name,))
    row = cursor.fetchone()
    return row[0] if row else None


def _row(cursor, kind, item_id):
    """(status name, title-ish label) or None if the row doesn't exist."""
    node = NODES[kind]
    s_table, s_id, s_name = node["stats"]
    cursor.execute(
        f"""SELECT COALESCE(s.{s_name}, 'Draft')
            FROM {node['table']} t
            LEFT JOIN {s_table} s ON t.{node['fk']} = s.{s_id}
            WHERE t.{node['id']} = %s""",
        (item_id,)
    )
    row = cursor.fetchone()
    return row[0] if row else None


def _parent(cursor, kind, item_id):
    """(parent kind, parent id, parent status) or None for a chapter."""
    parent = NODES[kind]["parent"]
    if not parent:
        return None
    parent_kind, fk_col = parent
    cursor.execute(
        f"SELECT {fk_col} FROM {NODES[kind]['table']} WHERE {NODES[kind]['id']} = %s",
        (item_id,)
    )
    row = cursor.fetchone()
    if not row or row[0] is None:
        return (parent_kind, None, DRAFT)
    return (parent_kind, row[0], _row(cursor, parent_kind, row[0]) or DRAFT)


def _children(cursor, kind, item_id):
    """Every non-archived child: [(child kind, child id, status), ...]."""
    out = []
    for child_kind in CHILDREN[kind]:
        node = NODES[child_kind]
        s_table, s_id, s_name = node["stats"]
        fk_col = node["parent"][1]
        archived = f"AND COALESCE(t.{node['archived_col']}, 0) = 0" if node["archived_col"] else ""
        cursor.execute(
            f"""SELECT t.{node['id']}, COALESCE(s.{s_name}, 'Draft')
                FROM {node['table']} t
                LEFT JOIN {s_table} s ON t.{node['fk']} = s.{s_id}
                WHERE t.{fk_col} = %s {archived}
                  AND COALESCE(s.{s_name}, '') != 'Archived'""",
            (item_id,)
        )
        out.extend((child_kind, cid, status) for cid, status in cursor.fetchall())
    return out


def _set_status(cursor, kind, item_id, name):
    """Status change + updated_at; publishing also stamps published_at."""
    node = NODES[kind]
    status_id = _status_id(cursor, kind, name)
    if not status_id:
        raise Error(f"Could not resolve the {name} status.")
    stamp = ", published_at = NOW()" if name == PUBLISHED else ""
    cursor.execute(
        f"UPDATE {node['table']} SET {node['fk']} = %s, updated_at = NOW(){stamp} WHERE {node['id']} = %s",
        (status_id, item_id)
    )


def _video_ready_problem(cursor, video_id):
    """A video needs its YouTube link and a description before it can go live."""
    cursor.execute(
        "SELECT file_path, description FROM video_tutorials_tbl WHERE video_tutorial_id = %s",
        (video_id,)
    )
    row = cursor.fetchone()
    if not row:
        return "Video tutorial not found."
    if not (row[0] or "").strip():
        return "Add a YouTube video link to this video tutorial first."
    if not (row[1] or "").strip():
        return "Write a description for this video tutorial first."
    return None


# ============================================================
# Actions
# ============================================================
def _run(kind, item_id, work):
    """Opens a connection, runs work(cursor) -> (ok, msg, extra), commits or rolls back."""
    if kind not in NODES:
        return False, "Unknown item type.", {}
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return False, "Invalid item ID.", {}

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database.", {}
    try:
        ensure_publishing_columns(connection)
        cursor = connection.cursor()
        if _row(cursor, kind, item_id) is None:
            cursor.close()
            return False, f"This {NODES[kind]['label']} no longer exists.", {}
        ok, message, extra = work(cursor)
        if ok:
            connection.commit()
        else:
            connection.rollback()
        cursor.close()
        return ok, message, extra
    except Error as e:
        connection.rollback()
        print(f"publishing_actions: {kind} {item_id} failed: {e}")
        return False, f"Database error: {e}", {}
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# "Empty" rules - learners must never get an empty chapter/module
#   - a lesson always counts as content (its content is required on save)
#   - a module needs at least 1 lesson, a chapter at least 1 module with
#     at least 1 lesson
#   - going live: a chapter/module needs at least 1 lesson that is live
#     afterwards
# ============================================================
CONTAINERS = ("category", "module")


def _lessons_under(cursor, kind, item_id, statuses=None):
    """Non-archived lessons inside a chapter/module (optionally only these statuses)."""
    status_sql = ""
    params = [item_id]
    if statuses:
        status_sql = f"AND COALESCE(lrs.lr_stats_name, 'Draft') IN ({', '.join(['%s'] * len(statuses))})"
        params.extend(statuses)
    if kind == "module":
        cursor.execute(
            f"""SELECT COUNT(*) FROM learning_resources_tbl lr
                LEFT JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE lr.module_id = %s AND COALESCE(lrs.lr_stats_name, '') != 'Archived' {status_sql}""",
            tuple(params)
        )
    else:
        cursor.execute(
            f"""SELECT COUNT(*) FROM learning_resources_tbl lr
                JOIN modules_tbl m ON lr.module_id = m.module_id
                LEFT JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
                WHERE m.cat_id = %s AND COALESCE(m.is_archived, 0) = 0
                  AND COALESCE(lrs.lr_stats_name, '') != 'Archived' {status_sql}""",
            tuple(params)
        )
    return cursor.fetchone()[0]


def _live_lessons_under(cursor, kind, item_id):
    """Published lessons a learner can actually reach (through Published modules)."""
    if kind == "module":
        return _lessons_under(cursor, "module", item_id, [PUBLISHED])
    cursor.execute(
        """SELECT COUNT(*) FROM learning_resources_tbl lr
           JOIN modules_tbl m ON lr.module_id = m.module_id
           JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
           JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
           WHERE m.cat_id = %s AND COALESCE(m.is_archived, 0) = 0
             AND ms.module_stats_name = %s AND lrs.lr_stats_name = %s""",
        (item_id, PUBLISHED, PUBLISHED)
    )
    return cursor.fetchone()[0]


def _empty_problem(cursor, kind, item_id):
    """Message when a chapter/module has no lesson at all, else None."""
    if kind not in CONTAINERS or _lessons_under(cursor, kind, item_id):
        return None
    return (f"This {NODES[kind]['label']} has no lessons yet. "
            + ("Add a module with a lesson first." if kind == "category" else "Add a lesson first."))


def _publishable_problem(cursor, kind, item_id):
    """Message when publishing a module would leave it with nothing live, else None."""
    if kind != "module":
        return None
    if _lessons_under(cursor, "module", item_id, [READY, PUBLISHED]):
        return None
    return "This module has no Ready to Publish lessons, so learners would see it empty."


# ============================================================
# Cursor-level actions (so a checklist can run several in ONE
# transaction). Each returns (ok, message, counts).
# ============================================================
def _mark_ready_cur(cursor, kind, item_id, include_children):
    status = _row(cursor, kind, item_id)
    if status is None:
        return False, f"This {NODES[kind]['label']} no longer exists.", {}
    if status != DRAFT:
        return False, f"Only a Draft {NODES[kind]['label']} can be marked ready (this one is {status}).", {}

    parent = _parent(cursor, kind, item_id)
    if parent and parent[2] not in (READY, PUBLISHED):
        return False, f"Mark its {NODES[parent[0]]['label']} ready first.", {}

    problem = _empty_problem(cursor, kind, item_id)
    if problem:
        return False, problem, {}
    if kind == "video":
        problem = _video_ready_problem(cursor, item_id)
        if problem:
            return False, problem, {}

    _set_status(cursor, kind, item_id, READY)
    counts = {"marked": 0, "skipped": 0}
    if include_children:
        def walk(k, i):
            for ck, cid, cstatus in _children(cursor, k, i):
                if cstatus == DRAFT:
                    # Empty modules and videos without a link/description stay Draft.
                    if _empty_problem(cursor, ck, cid) or (ck == "video" and _video_ready_problem(cursor, cid)):
                        counts["skipped"] += 1
                        continue
                    _set_status(cursor, ck, cid, READY)
                    counts["marked"] += 1
                walk(ck, cid)
        walk(kind, item_id)
    return True, "", counts


def _publish_cur(cursor, kind, item_id, cascade):
    status = _row(cursor, kind, item_id)
    if status is None:
        return False, f"This {NODES[kind]['label']} no longer exists.", {}
    if status != READY:
        return False, f"Only a Ready to Publish {NODES[kind]['label']} can be published (this one is {status}).", {}

    parent = _parent(cursor, kind, item_id)
    if parent and parent[2] != PUBLISHED:
        return False, f"Publish its {NODES[parent[0]]['label']} first.", {}

    if kind == "video":
        problem = _video_ready_problem(cursor, item_id)
        if problem:
            return False, problem, {}

    _set_status(cursor, kind, item_id, PUBLISHED)
    counts = {"published": 0, "skipped": 0}
    if cascade:
        def walk(k, i):
            for ck, cid, cstatus in _children(cursor, k, i):
                if cstatus == READY:
                    if (ck == "video" and _video_ready_problem(cursor, cid)) or _publishable_problem(cursor, ck, cid):
                        counts["skipped"] += 1
                        continue
                    _set_status(cursor, ck, cid, PUBLISHED)
                    counts["published"] += 1
                    walk(ck, cid)
                elif cstatus == PUBLISHED:
                    walk(ck, cid)
        walk(kind, item_id)
    return True, "", counts


def _check_live(cursor, kind, item_id):
    """After publishing: a chapter/module must end up with a live lesson."""
    if kind in CONTAINERS and not _live_lessons_under(cursor, kind, item_id):
        return (f"Nothing inside this {NODES[kind]['label']} would be live, so learners would see it empty. "
                + ("Include at least one module with a Ready to Publish lesson." if kind == "category"
                   else "Include at least one Ready to Publish lesson."))
    return None


def _plural(count, word):
    return f"{count} {word}{'' if count == 1 else 's'}"


def _skipped_note(skipped, verb):
    if not skipped:
        return ""
    return (f" {_plural(skipped, 'item')} stayed {verb} - empty modules, or videos "
            "without a link or description.")


# ============================================================
# Single actions (one item) - each is one transaction
# ============================================================
def mark_ready(kind, item_id, include_children=False):
    def work(cursor):
        ok, msg, counts = _mark_ready_cur(cursor, kind, item_id, include_children)
        if not ok:
            return ok, msg, counts
        msg = "Marked as Ready to Publish."
        if counts.get("marked"):
            msg = f"Marked as Ready to Publish, with {_plural(counts['marked'], 'item')} inside."
        return True, msg + _skipped_note(counts.get("skipped"), "Draft"), counts
    return _run(kind, item_id, work)


def mark_all_ready(kind, item_id):
    return mark_ready(kind, item_id, include_children=True)


def move_to_draft(kind, item_id):
    def work(cursor):
        status = _row(cursor, kind, item_id)
        if status != READY:
            return False, f"Only a Ready to Publish {NODES[kind]['label']} can be moved to Draft (this one is {status}).", {}
        _set_status(cursor, kind, item_id, DRAFT)

        moved = 0
        def walk(k, i):
            nonlocal moved
            for ck, cid, cstatus in _children(cursor, k, i):
                if cstatus == READY:
                    _set_status(cursor, ck, cid, DRAFT)
                    moved += 1
                walk(ck, cid)
        walk(kind, item_id)

        msg = "Moved back to Draft."
        if moved:
            msg = f"Moved back to Draft, with {_plural(moved, 'item')} inside."
        return True, msg, {"moved": moved}
    return _run(kind, item_id, work)


def publish(kind, item_id):
    def work(cursor):
        ok, msg, counts = _publish_cur(cursor, kind, item_id, cascade=True)
        if not ok:
            return ok, msg, counts
        problem = _check_live(cursor, kind, item_id)
        if problem:
            return False, problem, {}
        msg = "Published. Learners can see it now."
        if counts.get("published"):
            msg = f"Published, with {_plural(counts['published'], 'item')} inside. Learners can see them now."
        return True, msg + _skipped_note(counts.get("skipped"), "Ready to Publish"), counts
    return _run(kind, item_id, work)


def unpublish(kind, item_id):
    def work(cursor):
        status = _row(cursor, kind, item_id)
        if status != PUBLISHED:
            return False, f"This {NODES[kind]['label']} is not published (it is {status}).", {}
        _set_status(cursor, kind, item_id, READY)

        moved = 0
        def walk(k, i):
            nonlocal moved
            for ck, cid, cstatus in _children(cursor, k, i):
                if cstatus == PUBLISHED:
                    _set_status(cursor, ck, cid, READY)
                    moved += 1
                walk(ck, cid)
        walk(kind, item_id)

        msg = "Unpublished and moved back to Ready to Publish."
        if moved:
            msg = f"Unpublished, with {_plural(moved, 'item')} inside. All moved back to Ready to Publish."
        return True, msg, {"moved": moved}
    return _run(kind, item_id, work)


def confirm_update(kind, item_id):
    def work(cursor):
        status = _row(cursor, kind, item_id)
        if status != PUBLISHED:
            return False, f"Only a published {NODES[kind]['label']} can be updated.", {}
        node = NODES[kind]
        # published_at catches up to the latest edit; updated_at is left
        # alone, so the item keeps its real "last edited" time.
        cursor.execute(
            f"UPDATE {node['table']} SET published_at = NOW() WHERE {node['id']} = %s",
            (item_id,)
        )
        return True, "Update confirmed. Learners already see the latest version.", {}
    return _run(kind, item_id, work)


ACTIONS = {
    "mark-ready": mark_ready,
    "mark-all-ready": mark_all_ready,
    "move-to-draft": move_to_draft,
    "publish": publish,
    "unpublish": unpublish,
    "confirm-update": confirm_update,
}


def run_action(kind, item_id, action):
    """Dispatcher for the single /admin/publishing/<kind>/<id>/<action> route."""
    fn = ACTIONS.get(action)
    if not fn:
        return False, "Unknown action.", {}
    return fn(kind, item_id)


# ============================================================
# Checklist actions - several items in ONE transaction
# ============================================================
def run_checklist(action, parent_kind, parent_id, include_parent, items):
    """
    The Publishing page's checklists:
      action "mark-ready":  optionally the parent (Draft tab "Mark all
                            ready"), then each checked Draft child WITH its
                            Draft insides.
      action "publish":     optionally the parent (Ready tab "Publish"),
                            then each checked Ready child WITH its Ready
                            insides; the parent must end up with a live
                            lesson.
    items = [{"kind": ..., "id": ...}, ...] - each must be a direct child
    of the parent, in the right status. Any failure rolls everything back.
    """
    if action not in ("mark-ready", "publish"):
        return False, "Unknown action.", {}
    if parent_kind not in NODES:
        return False, "Unknown item type.", {}

    def work(cursor):
        wanted_status = DRAFT if action == "mark-ready" else READY
        children = {(ck, cid): cstatus for ck, cid, cstatus in _children(cursor, parent_kind, int(parent_id))}
        picked = []
        for item in items or []:
            try:
                key = (item.get("kind"), int(item.get("id")))
            except (TypeError, ValueError, AttributeError):
                return False, "Invalid item in the list.", {}
            if key not in children:
                return False, "One of the checked items is no longer inside this item. Refresh and try again.", {}
            if children[key] != wanted_status:
                return False, "One of the checked items changed status. Refresh and try again.", {}
            picked.append(key)

        if not include_parent and not picked:
            return False, "Check at least one item.", {}

        total, skipped = 0, 0
        if include_parent:
            if action == "mark-ready":
                ok, msg, _ = _mark_ready_cur(cursor, parent_kind, int(parent_id), include_children=False)
            else:
                ok, msg, _ = _publish_cur(cursor, parent_kind, int(parent_id), cascade=False)
            if not ok:
                return ok, msg, {}
            total += 1

        for ck, cid in picked:
            if action == "mark-ready":
                ok, msg, counts = _mark_ready_cur(cursor, ck, cid, include_children=True)
                inside = counts.get("marked", 0)
            else:
                problem = _publishable_problem(cursor, ck, cid)
                if problem:
                    return False, problem, {}
                ok, msg, counts = _publish_cur(cursor, ck, cid, cascade=True)
                inside = counts.get("published", 0)
            if not ok:
                return False, msg, {}
            total += 1 + inside
            skipped += counts.get("skipped", 0)

        if action == "publish":
            problem = _check_live(cursor, parent_kind, int(parent_id))
            if problem:
                return False, problem, {}
            msg = f"Published {_plural(total, 'item')}. Learners can see them now."
            return True, msg + _skipped_note(skipped, "Ready to Publish"), {"published": total}

        msg = f"Marked {_plural(total, 'item')} as Ready to Publish."
        return True, msg + _skipped_note(skipped, "Draft"), {"marked": total}

    return _run(parent_kind, parent_id, work)


# ============================================================
# One-of-each-type per lesson (videos + exercises; activity types
# already have activity_validation.validate_activity_type_for_lesson)
# ============================================================
def lesson_already_has(cursor, kind, resource_id, exclude_id=None):
    """
    True if the lesson already has a non-archived video / exercise
    (other than exclude_id). Runs on the caller's cursor.
    """
    node = NODES[kind]
    s_table, s_id, s_name = node["stats"]
    archived = f"AND COALESCE(t.{node['archived_col']}, 0) = 0" if node["archived_col"] else ""
    params = [resource_id]
    exclude = ""
    if exclude_id:
        exclude = f"AND t.{node['id']} != %s"
        params.append(exclude_id)
    cursor.execute(
        f"""SELECT 1 FROM {node['table']} t
            LEFT JOIN {s_table} s ON t.{node['fk']} = s.{s_id}
            WHERE t.resource_id = %s {archived} {exclude}
              AND COALESCE(s.{s_name}, '') != 'Archived'
            LIMIT 1""",
        tuple(params)
    )
    return cursor.fetchone() is not None
