"""
staff_presence.py - "Who's here / who's editing" for staff (feat/publishing-presence)
-------------------------------------------------------------------------------------
Like Google Docs presence, NOT live co-typing and NOT a lock: every open
staff tab sends a tiny heartbeat (admin/js/admin-presence-beat.js, every
HEARTBEAT_SECONDS) saying which page it is on and which items it has open
in an editor. One row per browser TAB:

    staff_presence_tbl
    -------------------
    tab_id      VARCHAR(32) PK   random id made by the tab itself
    acc_id      VARCHAR(15)      who
    endpoint    VARCHAR(80)      the Flask endpoint of the page (admin_bp.publishing ...)
    items       VARCHAR(255)     "res-12,ex-3" - items open in an editor ("" = just looking)
    active_at   DATETIME         last real click / key / scroll in that tab
    expires_at  DATETIME         heartbeat + 35 s (visible tab) / + 90 s (hidden tab:
                                 browsers slow background timers to ~1 per minute)
    updated_at  TIMESTAMP

A tab that closes sends POST /admin/presence/leave (sendBeacon) and its row
goes at once; a crashed tab simply expires. Expired rows are deleted now and
then (at most once a minute per process). A table - not memory - so it also
works when the server runs several worker processes.

Server cost per open staff tab: one upsert + one small SELECT every 15 s.
Nothing here ever raises: presence is a nicety and must never break a page.
"""

import re
import time
import threading

from mysql.connector import Error

from cobradb import get_db_connection
from profile_avatar import get_avatar_urls

PRESENCE_TABLE = "staff_presence_tbl"
HEARTBEAT_SECONDS = 15
VISIBLE_TTL_SECONDS = 35
HIDDEN_TTL_SECONDS = 90
IDLE_AFTER_SECONDS = 5 * 60        # "has this open (idle 12 min)" instead of "is editing"
MAX_ITEMS = 10
CLEANUP_EVERY_SECONDS = 60

TAB_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,32}$")
ITEM_RE = re.compile(r"^(cat|mod|res|vid|act|ex)-\d{1,10}$")

# Item prefix -> (table, id column, name column, label) - for "Editing: <name>"
ITEM_SOURCES = {
    "cat": ("category_tbl", "cat_id", "category_name", "chapter"),
    "mod": ("modules_tbl", "module_id", "module_name", "module"),
    "res": ("learning_resources_tbl", "resource_id", "resource_title", "lesson"),
    "vid": ("video_tutorials_tbl", "video_tutorial_id", "video_title", "video"),
    "act": ("learning_activities_tbl", "la_id", "activity_title", "activity"),
    "ex": ("coding_exercises_tbl", "exercise_id", "exercise_title", "exercise"),
}

_table_ready = False
_last_cleanup = 0.0
_cleanup_lock = threading.Lock()


def _ensure_table(connection):
    global _table_ready
    if _table_ready:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {PRESENCE_TABLE} (
                    tab_id      VARCHAR(32)  NOT NULL,
                    acc_id      VARCHAR(15)  NOT NULL,
                    endpoint    VARCHAR(80)  NOT NULL,
                    items       VARCHAR(255) NOT NULL DEFAULT '',
                    active_at   DATETIME     NOT NULL,
                    expires_at  DATETIME     NOT NULL,
                    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (tab_id),
                    KEY idx_presence_expires (expires_at),
                    KEY idx_presence_acc (acc_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        connection.commit()
        cursor.close()
        _table_ready = True
    except Error as e:
        print(f"staff_presence: could not create {PRESENCE_TABLE}: {e}")


def _forget_table_if_missing(error):
    """The table was dropped while the app runs (e.g. a database reset) - create it again next time."""
    global _table_ready
    if getattr(error, "errno", None) == 1146:
        _table_ready = False


def clean_items(items):
    """Only well-formed item ids ("res-12"), no repeats, at most MAX_ITEMS."""
    out = []
    for item in items or []:
        item = str(item or "").strip()
        if ITEM_RE.match(item) and item not in out:
            out.append(item)
    return out[:MAX_ITEMS]


def _maybe_cleanup(cursor):
    global _last_cleanup
    now = time.monotonic()
    with _cleanup_lock:
        if now - _last_cleanup < CLEANUP_EVERY_SECONDS:
            return
        _last_cleanup = now
    cursor.execute(f"DELETE FROM {PRESENCE_TABLE} WHERE expires_at < NOW() - INTERVAL 5 MINUTE")


def _name(row):
    name = " ".join(p for p in (row.get("firstname"), row.get("lastname")) if p).strip()
    return name or row.get("username") or row.get("acc_id")


def _live_rows(cursor):
    cursor.execute(
        f"""SELECT s.tab_id, s.acc_id, s.endpoint, s.items,
                   GREATEST(0, TIMESTAMPDIFF(SECOND, s.active_at, NOW())) AS idle_seconds,
                   a.username, ut.u_type AS role, p.firstname, p.lastname
            FROM {PRESENCE_TABLE} s
            JOIN account_tbl a ON a.acc_id = s.acc_id
            LEFT JOIN usertype_tbl ut ON ut.ut_id = a.u_type
            LEFT JOIN profile_tbl p ON p.acc_id = s.acc_id
            WHERE s.expires_at >= NOW() AND (a.is_deleted = 0 OR a.is_deleted IS NULL)"""
    )
    return cursor.fetchall()


def heartbeat(acc_id, tab_id, endpoint, items, hidden=False, idle_seconds=0):
    """
    Saves this tab's presence and answers what the page needs:
      {"here":    [{acc_id, name, role, avatar_url, idle}]   other people on the same page,
       "editing": {item_id: [{acc_id, name, idle, idle_minutes, is_me}]}  every open editor}
    None if the tab id is bad or the database is unreachable.
    """
    if not acc_id or not TAB_ID_RE.match(tab_id or "") or not endpoint:
        return None
    items = clean_items(items)
    try:
        idle_seconds = max(0, min(int(idle_seconds or 0), 24 * 3600))
    except (TypeError, ValueError):
        idle_seconds = 0
    ttl = HIDDEN_TTL_SECONDS if hidden else VISIBLE_TTL_SECONDS

    connection = get_db_connection()
    if connection is None:
        return None
    try:
        _ensure_table(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""INSERT INTO {PRESENCE_TABLE} (tab_id, acc_id, endpoint, items, active_at, expires_at)
                VALUES (%s, %s, %s, %s, NOW() - INTERVAL %s SECOND, NOW() + INTERVAL %s SECOND)
                ON DUPLICATE KEY UPDATE
                    endpoint   = IF(acc_id = VALUES(acc_id), VALUES(endpoint), endpoint),
                    items      = IF(acc_id = VALUES(acc_id), VALUES(items), items),
                    active_at  = IF(acc_id = VALUES(acc_id), VALUES(active_at), active_at),
                    expires_at = IF(acc_id = VALUES(acc_id), VALUES(expires_at), expires_at)""",
            (tab_id, acc_id, endpoint[:80], ",".join(items), idle_seconds, ttl)
        )
        # (a tab id belongs to the account that made it: another account's
        # heartbeat with the same id changes nothing)
        _maybe_cleanup(cursor)
        connection.commit()
        rows = _live_rows(cursor)
        here_ids = sorted({r["acc_id"] for r in rows if r["endpoint"] == endpoint and r["acc_id"] != acc_id})
        avatars = get_avatar_urls(cursor, here_ids) if here_ids else {}
        cursor.close()
    except Error as e:
        _forget_table_if_missing(e)
        print(f"staff_presence: heartbeat failed: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()

    here = {}
    editing = {}
    for r in rows:
        if r["endpoint"] == endpoint and r["acc_id"] != acc_id:
            person = here.setdefault(r["acc_id"], {
                "acc_id": r["acc_id"], "name": _name(r), "role": r.get("role") or "",
                "avatar_url": avatars.get(r["acc_id"]), "idle": True,
            })
            if int(r["idle_seconds"] or 0) < IDLE_AFTER_SECONDS:
                person["idle"] = False
        for item in filter(None, (r["items"] or "").split(",")):
            people = editing.setdefault(item, {})
            idle = int(r["idle_seconds"] or 0)
            prev = people.get(r["acc_id"])
            if prev is None or idle < prev["idle_seconds"]:
                people[r["acc_id"]] = {
                    "acc_id": r["acc_id"], "name": _name(r), "is_me": r["acc_id"] == acc_id,
                    "idle_seconds": idle, "idle": idle >= IDLE_AFTER_SECONDS,
                    "idle_minutes": idle // 60,
                }
    return {
        "here": sorted(here.values(), key=lambda p: p["name"].lower()),
        "editing": {item: sorted(people.values(), key=lambda p: (p["idle_seconds"], p["name"]))
                    for item, people in editing.items()},
        "heartbeat_seconds": HEARTBEAT_SECONDS,
    }


def leave(acc_id, tab_id):
    """The tab is closing (sendBeacon): remove its row right away. Never raises."""
    if not acc_id or not TAB_ID_RE.match(tab_id or ""):
        return
    connection = get_db_connection()
    if connection is None:
        return
    try:
        _ensure_table(connection)
        cursor = connection.cursor()
        cursor.execute(f"DELETE FROM {PRESENCE_TABLE} WHERE tab_id = %s AND acc_id = %s", (tab_id, acc_id))
        connection.commit()
        cursor.close()
    except Error as e:
        print(f"staff_presence: leave failed: {e}")
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Who's Online: "On: Publishing" / "Editing: <lesson name>"
# ------------------------------------------------------------------
def _item_names(cursor, items):
    """{"res-12": ("lesson", "Variables"), ...} for the given item ids."""
    by_kind = {}
    for item in items:
        kind, _, num = item.partition("-")
        if kind in ITEM_SOURCES:
            by_kind.setdefault(kind, []).append(int(num))
    names = {}
    for kind, ids in by_kind.items():
        table, id_col, name_col, label = ITEM_SOURCES[kind]
        try:
            cursor.execute(
                f"SELECT {id_col} AS id, {name_col} AS name FROM {table} WHERE {id_col} IN ({', '.join(['%s'] * len(ids))})",
                tuple(ids)
            )
            for row in cursor.fetchall():
                names[f"{kind}-{row['id']}"] = (label, row["name"] or f"{label} #{row['id']}")
        except Error:
            continue
    return names


def get_staff_locations(page_titles):
    """
    {acc_id: {"page": "Publishing", "editing": "Editing lesson: Variables"}} for
    every staff member with a live tab - their most recently ACTIVE tab wins.
    page_titles: {endpoint: "Page name"} (from staff_search.PAGES). {} on errors.
    """
    connection = get_db_connection()
    if connection is None:
        return {}
    try:
        _ensure_table(connection)
        cursor = connection.cursor(dictionary=True)
        rows = _live_rows(cursor)
        best = {}
        for r in rows:
            cur = best.get(r["acc_id"])
            if cur is None or int(r["idle_seconds"] or 0) < int(cur["idle_seconds"] or 0):
                best[r["acc_id"]] = r
        all_items = [i for r in best.values() for i in filter(None, (r["items"] or "").split(","))]
        names = _item_names(cursor, all_items) if all_items else {}
        cursor.close()
    except Error as e:
        print(f"staff_presence: could not load staff locations: {e}")
        return {}
    finally:
        if connection.is_connected():
            connection.close()

    out = {}
    for acc_id, r in best.items():
        items = [i for i in (r["items"] or "").split(",") if i]
        editing = ""
        if items:
            label, name = names.get(items[0], ("item", items[0]))
            editing = f"Editing {label}: {name}" + (f" (+{len(items) - 1} more)" if len(items) > 1 else "")
        out[acc_id] = {"page": page_titles.get(r["endpoint"], ""), "editing": editing}
    return out
