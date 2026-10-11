"""
dashboards.py - Mentor Dashboard + Admin Dashboard helpers (read-only)
---------------------------------------------------------------------
Every number comes from an existing function wherever one exists:

    content status counts   publishing.get_publishing_tree()  (same tree
                            and statuses the Publishing page tabs use;
                            archived items are already excluded there)
    mentor contributions    account_management.get_account_content()
                            (the Account Details "Content" counts)
    learner ranking         reports.get_learner_ranking()
    learner metrics         learner_progress_monitor.get_learners_progress_overview()

The one new query is get_recent_content_edits(): newest updated_at
across lessons / videos / activities / exercises. It only reads
timestamps - titles and statuses come from the publishing tree, so an
archived item (not in the tree) never shows up.

Every section is built through _section(), so one failing section
becomes {"ok": False} (shown empty with a short message) instead of
breaking the whole page. Nothing here writes to the database.
"""

from mysql.connector import Error

from cobradb import get_db_connection
from publishing import get_publishing_tree
import publishing as publishing_module
from account_management import get_account_content, _fmt_datetime
from reports import get_learner_ranking
from learner_progress_monitor import get_learners_progress_overview
from live_cache import live_cached

STATUSES = ("Draft", "Ready to Publish", "Published")

# Tree node id prefix -> (key, plural label). Same prefixes as publishing.py.
CONTENT_TYPES = (
    ("cat", "chapters", "Chapters"),
    ("mod", "modules", "Modules"),
    ("res", "lessons", "Lessons"),
    ("vid", "videos", "Videos"),
    ("act", "activities", "Activities"),
    ("ex", "exercises", "Exercises"),
)
PREFIX_LABEL = {"res": "Lesson", "vid": "Video", "act": "Activity", "ex": "Exercise"}

RECENT_EDITS_LIMIT = 8
TOP_LEARNERS_LIMIT = 5
RECENT_LOGINS_LIMIT = 5


# ------------------------------------------------------------------
# Section wrapper: one failing section never breaks the page
# ------------------------------------------------------------------
def _section(build):
    try:
        data = build()
    except Exception as e:  # any failure -> this section shows "couldn't load"
        print(f"dashboards: section failed: {e}")
        return {"ok": False}
    if data is None:
        return {"ok": False}
    return {"ok": True, **data}


# ------------------------------------------------------------------
# Publishing tree helpers
# ------------------------------------------------------------------
def _load_tree():
    """The publishing tree, or None when it could not be built (not just empty)."""
    tree = get_publishing_tree()
    if not tree and publishing_module.last_tree_error:
        return None
    return tree


def _walk(tree):
    """Every node in the tree (chapters, modules, lessons, videos, activities, exercises)."""
    stack = list(tree)
    while stack:
        node = stack.pop()
        yield node
        stack.extend(node.get("children") or [])
        stack.extend(node.get("videos") or [])
        stack.extend(node.get("activities") or [])
        stack.extend(node.get("exercises") or [])


def count_tree_statuses(tree):
    """
    {"chapters": {"Draft": n, "Ready to Publish": n, "Published": n, "total": n}, ...}
    plus "ready_total" = everything Ready to Publish (the Publishing page's
    Ready to Publish tab count).
    """
    counts = {key: dict({s: 0 for s in STATUSES}, total=0) for _, key, _ in CONTENT_TYPES}
    key_of = {prefix: key for prefix, key, _ in CONTENT_TYPES}
    for node in _walk(tree):
        key = key_of.get(node["id"].split("-")[0])
        if key is None:
            continue
        bucket = counts[key]
        status = node.get("status") or "Draft"
        bucket[status if status in STATUSES else "Draft"] += 1
        bucket["total"] += 1
    ready_total = sum(c["Ready to Publish"] for c in counts.values())
    return counts, ready_total


def content_rows(counts):
    """counts -> ordered rows for the templates."""
    return [{"key": key, "label": label, **counts[key]} for _, key, label in CONTENT_TYPES]


# ------------------------------------------------------------------
# Recently edited content (the one new read-only query)
# ------------------------------------------------------------------
RECENT_EDITS_SQL = """
    SELECT kind, item_id, edited_at FROM (
        SELECT 'res' AS kind, resource_id AS item_id, COALESCE(updated_at, created_at) AS edited_at
        FROM learning_resources_tbl
        UNION ALL
        SELECT 'vid', video_tutorial_id, COALESCE(updated_at, created_at) FROM video_tutorials_tbl
        UNION ALL
        SELECT 'act', la_id, COALESCE(updated_at, created_at) FROM learning_activities_tbl
        UNION ALL
        SELECT 'ex', exercise_id, COALESCE(updated_at, created_at) FROM coding_exercises_tbl
    ) edits
    WHERE edited_at IS NOT NULL
    ORDER BY edited_at DESC
    LIMIT %s
"""


def get_recent_content_edits(tree, limit=RECENT_EDITS_LIMIT):
    """
    The `limit` most recently updated lessons / videos / activities /
    exercises that are still in the publishing tree (so archived ones are
    skipped). Returns a list, or None on a database error.
    """
    nodes = {node["id"]: node for node in _walk(tree)}
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        # Ask for extra rows: archived items are dropped below.
        cursor.execute(RECENT_EDITS_SQL, (limit * 6,))
        rows = cursor.fetchall()
        cursor.close()
    except Error as e:
        print(f"dashboards: failed to load recent edits: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()

    items = []
    for row in rows:
        node = nodes.get(f"{row['kind']}-{row['item_id']}")
        if node is None:
            continue
        items.append({
            "kind": row["kind"],
            "item_id": row["item_id"],
            "type_label": PREFIX_LABEL[row["kind"]],
            "title": node.get("name") or "Untitled",
            "status": node.get("status") or "Draft",
            "edited_at": _fmt_datetime(row["edited_at"]),
        })
        if len(items) >= limit:
            break
    return items


# ------------------------------------------------------------------
# MENTOR DASHBOARD
# ------------------------------------------------------------------
def build_mentor_dashboard(acc_id):
    """All Mentor Dashboard sections. Each is {"ok": bool, ...}."""
    tree = None
    try:
        tree = _load_tree()
    except Exception as e:
        print(f"dashboards: failed to load publishing tree: {e}")

    def status_section():
        if tree is None:
            return None
        counts, ready_total = count_tree_statuses(tree)
        return {"rows": content_rows(counts), "ready_total": ready_total}

    def recent_section():
        if tree is None:
            return None
        items = get_recent_content_edits(tree)
        return None if items is None else {"items": items}

    def contributions_section():
        content = get_account_content(acc_id)
        return None if content is None else {"items": content}

    status = _section(status_section)
    return {
        "content_status": status,
        "waiting": {"ok": status["ok"], "ready_total": status.get("ready_total", 0)},
        "recent_edits": _section(recent_section),
        "contributions": _section(contributions_section),
    }


# ------------------------------------------------------------------
# ADMIN DASHBOARD - content + learning sections
# (account / login sections are built in admin_routes.py, where
#  get_accounts_overview / get_login_logs_* live)
# ------------------------------------------------------------------
TREND_DAYS = 7   # feat/dashboard-reports: "this week" = the last 7 days vs the 7 before


def build_learning_section():
    """
    feat/dashboard-reports - six cards, each number + trend + subtitle:
      active this week, lessons finished this week, avg score this week
      (learning_analytics with range 7d - the same numbers as Analytics),
      needs attention, finished course, not started (Learner Progress).
    """
    def build():
        from learning_analytics import get_learning_analytics
        overview = get_learners_progress_overview(page=1, per_page=1)
        week = get_learning_analytics("all", f"{TREND_DAYS}d")
        if overview is None or week is None:
            return None
        cards = week["cards"]
        return {
            "metrics": overview["metrics"],
            "week": {
                "active": cards["active"],
                "lessons": cards["lessons_finished"],
                "avg_score": cards["avg_score"],
                "finished_in_week": cards["finished"]["in_period"],
            },
        }
    return _section(build)


@live_cached
def account_trends():
    """
    New accounts per role in the last 7 days, sign-in attempts today vs
    yesterday, lockouts in the last 7 days. None on a database error.
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """SELECT ut.u_type AS role, COUNT(*) AS n
               FROM account_tbl a JOIN usertype_tbl ut ON ut.ut_id = a.u_type
               WHERE (a.is_deleted = 0 OR a.is_deleted IS NULL)
                 AND a.created_at >= NOW() - INTERVAL %s DAY
               GROUP BY ut.u_type""",
            (TREND_DAYS,)
        )
        new = {r["role"]: int(r["n"]) for r in cursor.fetchall()}
        cursor.execute(
            """SELECT SUM(DATE(attempted_at) = CURDATE()) AS today,
                      SUM(DATE(attempted_at) = CURDATE() - INTERVAL 1 DAY) AS yesterday
               FROM login_logs_tbl WHERE attempted_at >= CURDATE() - INTERVAL 1 DAY"""
        )
        row = cursor.fetchone() or {}
        cursor.execute("SELECT COUNT(*) AS n FROM lockout_logs_tbl WHERE locked_at >= NOW() - INTERVAL %s DAY",
                       (TREND_DAYS,))
        locks = int((cursor.fetchone() or {}).get("n") or 0)
        cursor.close()
        today, yesterday = int(row.get("today") or 0), int(row.get("yesterday") or 0)
        return {
            "new_learners": new.get("Learner", 0),
            "new_mentors": new.get("Mentor", 0),
            "new_admins": new.get("Admin", 0),
            "logins_today": today,
            "logins_yesterday": yesterday,
            "logins_change": today - yesterday,
            "locks_week": locks,
        }
    except Error as e:
        print(f"dashboards: failed to load account trends: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def build_top_learners_section(limit=TOP_LEARNERS_LIMIT):
    def build():
        ranking = get_learner_ranking()
        if ranking is None:
            return None
        ranked = [l for l in ranking["learners"] if l["rank"] is not None]
        return {"learners": ranked[:limit]}
    return _section(build)


def build_content_snapshot_section():
    def build():
        tree = _load_tree()
        if tree is None:
            return None
        counts, _ = count_tree_statuses(tree)
        rows = [r for r in content_rows(counts) if r["key"] != "videos"]
        return {"rows": rows}
    return _section(build)


def section(build):
    """Public wrapper for admin_routes.py's own sections."""
    return _section(build)
