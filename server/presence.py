"""
presence.py - Who's online + the green / yellow / grey dots (feat/admin-online)
------------------------------------------------------------------------------
Read-only. Everything comes from active_sessions_tbl (session_tracker.py):

    a live session      = a row whose last_seen_at is within
                          SESSION_TIMEOUT_MINUTES (the same rule the sweep
                          uses), so a stale row is never shown as online
                          even before the next sweep deletes it.
    last real activity  = last_activity_at - set only when the person opens
                          a page or clicks / types / scrolls (idle_logout.py).
                          Background polling (dashboards, bells) never sets
                          it, so a forgotten open tab turns yellow, then grey.

    online  (green)   live session, real activity in the last ONLINE_MINUTES
    idle    (yellow)  live session, last real activity ONLINE_MINUTES..IDLE_MINUTES ago
                      (also a live session with no activity recorded yet)
    offline (grey)    no live session, or idle longer than IDLE_MINUTES

One account can be signed in on several devices: its dot is its BEST
device (any green device -> green).
"""

import re
from datetime import datetime

from mysql.connector import Error

from cobradb import get_db_connection
from session_tracker import ACTIVE_SESSIONS_TABLE, _ensure_table, _get_timeout_minutes
from profile_avatar import get_avatar_urls
from admin_time import fmt_datetime
from user_types import LEARNER_ROLE

ONLINE_MINUTES = 5
IDLE_MINUTES = 60
MAX_PRESENCE_IDS = 300   # one /admin/presence call (a page never lists more)

STATE_RANK = {"online": 2, "idle": 1, "offline": 0}
STATE_LABEL = {"online": "Online", "idle": "Idle", "offline": "Offline"}

# Same role names the Account & Security filter accepts.
ROLE_FILTER_MAP = {"administrator": "Admin", "admin": "Admin", "mentor": "Mentor", "learner": "Learner"}


# ------------------------------------------------------------------
# Small helpers
# ------------------------------------------------------------------
def state_for(idle_seconds):
    """Dot state of ONE live session from seconds since its last real activity (None = unknown)."""
    if idle_seconds is None:
        return "idle"
    if idle_seconds <= ONLINE_MINUTES * 60:
        return "online"
    if idle_seconds <= IDLE_MINUTES * 60:
        return "idle"
    return "offline"


def ago_text(seconds):
    """'just now', '3 min ago', '2 h ago', '3 days ago'."""
    if seconds is None:
        return "—"
    seconds = max(0, int(seconds))
    if seconds < 60:
        return "just now"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} min ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} h ago"
    days = hours // 24
    return f"{days} day{'s' if days != 1 else ''} ago"


def describe_user_agent(user_agent):
    """
    'Chrome on Windows', 'Safari on iPhone', ... from a User-Agent string,
    plus whether it is a phone/tablet. No library - only the common
    browsers / systems are named; anything else is 'Unknown device'.
    """
    ua = user_agent or ""
    if not ua:
        return {"label": "Unknown device", "mobile": False}

    if "Edg/" in ua or "EdgA/" in ua or "EdgiOS/" in ua:
        browser = "Edge"
    elif "OPR/" in ua or "Opera" in ua:
        browser = "Opera"
    elif "SamsungBrowser/" in ua:
        browser = "Samsung Internet"
    elif "Firefox/" in ua or "FxiOS/" in ua:
        browser = "Firefox"
    elif "CriOS/" in ua or "Chrome/" in ua or "Chromium/" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = None

    if "iPhone" in ua:
        system = "iPhone"
    elif "iPad" in ua:
        system = "iPad"
    elif "Android" in ua:
        system = "Android"
    elif "CrOS" in ua:
        system = "ChromeOS"
    elif "Windows" in ua:
        system = "Windows"
    elif "Macintosh" in ua or "Mac OS X" in ua:
        system = "Mac"
    elif "Linux" in ua:
        system = "Linux"
    else:
        system = None

    mobile = bool(re.search(r"iPhone|iPad|Android|Mobile", ua))
    if browser and system:
        label = f"{browser} on {system}"
    else:
        label = browser or system or "Unknown device"
    return {"label": label, "mobile": mobile}


def _full_name(row):
    name = " ".join(p for p in (row.get("firstname"), row.get("lastname")) if p).strip()
    return name or row.get("username") or row.get("acc_id")


def _live_sessions(cursor, acc_ids=None, learners_only=False):
    """
    Every LIVE session row (not stale), with the seconds since its last
    real activity. acc_ids limits it to those accounts; learners_only to
    Learner accounts (what a mentor may see).
    """
    query = f"""
        SELECT s.acc_id, s.created_at, s.last_activity_at, s.user_agent, s.ip_address,
               TIMESTAMPDIFF(SECOND, s.last_activity_at, NOW()) AS idle_seconds,
               TIMESTAMPDIFF(SECOND, s.created_at, NOW()) AS age_seconds
        FROM {ACTIVE_SESSIONS_TABLE} s
        JOIN account_tbl a ON a.acc_id = s.acc_id
        LEFT JOIN usertype_tbl ut ON ut.ut_id = a.u_type
        WHERE TIMESTAMPDIFF(SECOND, s.last_seen_at, NOW()) <= %s
          AND (a.is_deleted = 0 OR a.is_deleted IS NULL)
    """
    params = [_get_timeout_minutes() * 60]
    if acc_ids is not None:
        if not acc_ids:
            return []
        query += f" AND s.acc_id IN ({', '.join(['%s'] * len(acc_ids))})"
        params.extend(acc_ids)
    if learners_only:
        query += " AND ut.u_type = %s"
        params.append(LEARNER_ROLE)
    cursor.execute(query, tuple(params))
    return cursor.fetchall()


def _roll_up(sessions):
    """Session rows -> {acc_id: {"state", "idle_seconds", "since", "since_seconds", "devices"}}."""
    people = {}
    for s in sessions:
        state = state_for(s["idle_seconds"])
        person = people.setdefault(s["acc_id"], {
            "state": "offline", "idle_seconds": None,
            "since": None, "since_seconds": None, "devices": [],
        })
        if STATE_RANK[state] > STATE_RANK[person["state"]]:
            person["state"] = state
        idle = s["idle_seconds"]
        if idle is not None and (person["idle_seconds"] is None or idle < person["idle_seconds"]):
            person["idle_seconds"] = idle
        if s["created_at"] and (person["since"] is None or s["created_at"] < person["since"]):
            person["since"] = s["created_at"]
            person["since_seconds"] = s["age_seconds"]
        # Same browser + IP twice (e.g. signed in again without logging out)
        # is one device: keep its most recent activity.
        device = describe_user_agent(s.get("user_agent"))
        ip_address = s.get("ip_address") or "—"
        same = next((d for d in person["devices"]
                     if d["label"] == device["label"] and d["ip_address"] == ip_address), None)
        if same is None:
            person["devices"].append({
                "label": device["label"],
                "mobile": device["mobile"],
                "ip_address": ip_address,
                "state": state,
                "last_activity": ago_text(idle),
                "_idle": idle,
            })
        elif idle is not None and (same["_idle"] is None or idle < same["_idle"]):
            same.update(state=state, last_activity=ago_text(idle), _idle=idle)
    for person in people.values():
        for device in person["devices"]:
            device.pop("_idle", None)
    return people


def _presence_entry(person):
    if person is None:
        return {"state": "offline", "label": STATE_LABEL["offline"], "last_activity": None}
    return {
        "state": person["state"],
        "label": STATE_LABEL[person["state"]],
        "last_activity": ago_text(person["idle_seconds"]) if person["idle_seconds"] is not None else None,
    }


# ------------------------------------------------------------------
# The dots: GET /admin/presence?ids=...
# ------------------------------------------------------------------
def get_presence(acc_ids, learners_only=False):
    """
    {acc_id: {"state", "label", "last_activity"}} for every asked acc_id.
    learners_only (mentors): only Learner accounts are answered - any other
    id is simply left out, so a mentor learns nothing about staff.
    Returns None if the database is unreachable.
    """
    ids = []
    for acc_id in acc_ids or []:
        acc_id = (acc_id or "").strip()
        if acc_id and len(acc_id) <= 15 and acc_id not in ids:
            ids.append(acc_id)
    ids = ids[:MAX_PRESENCE_IDS]
    if not ids:
        return {}

    connection = get_db_connection()
    if connection is None:
        return None
    try:
        _ensure_table(connection)
        cursor = connection.cursor(dictionary=True)
        people = _roll_up(_live_sessions(cursor, ids, learners_only))
        allowed = set(ids)
        if learners_only:
            cursor.execute(
                f"""SELECT a.acc_id FROM account_tbl a
                    JOIN usertype_tbl ut ON ut.ut_id = a.u_type
                    WHERE ut.u_type = %s AND a.acc_id IN ({', '.join(['%s'] * len(ids))})""",
                (LEARNER_ROLE, *ids)
            )
            allowed = {row["acc_id"] for row in cursor.fetchall()}
        cursor.close()
        return {acc_id: _presence_entry(people.get(acc_id)) for acc_id in ids if acc_id in allowed}
    except Error as e:
        print(f"presence: failed to load presence: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Who's online page + the Active Sessions modal
# ------------------------------------------------------------------
def get_online_users(search_query=None, role_filter=None, state_filter=None, limit=None):
    """
    Every account with a live session, best state first, then most
    recent activity. Each: acc_id, full_name, username, email, role,
    avatar_url, state, label, logged_in_since, last_activity,
    last_activity_at, devices [...].

    Returns {"users": [...], "total": n, "counts": {...}} - counts are
    always for EVERYONE online (the page's cards), never the filtered
    list. None if the database is unreachable.
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        _ensure_table(connection)
        cursor = connection.cursor(dictionary=True)
        people = _roll_up(_live_sessions(cursor))
        if not people:
            cursor.close()
            return {"users": [], "total": 0, "counts": _counts([])}

        ids = list(people)
        cursor.execute(
            f"""SELECT a.acc_id, a.username, a.email, ut.u_type AS role, p.firstname, p.lastname
                FROM account_tbl a
                LEFT JOIN usertype_tbl ut ON ut.ut_id = a.u_type
                LEFT JOIN profile_tbl p ON p.acc_id = a.acc_id
                WHERE a.acc_id IN ({', '.join(['%s'] * len(ids))})""",
            tuple(ids)
        )
        accounts = {row["acc_id"]: row for row in cursor.fetchall()}
        avatars = get_avatar_urls(cursor, ids)
        cursor.close()
    except Error as e:
        print(f"presence: failed to load online users: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()

    everyone = []
    for acc_id, person in people.items():
        row = accounts.get(acc_id)
        if row is None:
            continue
        everyone.append({
            "acc_id": acc_id,
            "full_name": _full_name(row),
            "username": row.get("username") or "",
            "email": row.get("email") or "",
            "role": row.get("role") or "Unknown",
            "avatar_url": avatars.get(acc_id),
            "state": person["state"],
            # Still signed in but idle past IDLE_MINUTES: grey dot, "Away".
            "label": "Away" if person["state"] == "offline" else STATE_LABEL[person["state"]],
            "logged_in_since": fmt_datetime(person["since"]),
            "logged_in_for": ago_text(person["since_seconds"]).replace(" ago", "") if person["since_seconds"] is not None else "—",
            "last_activity": ago_text(person["idle_seconds"]) if person["idle_seconds"] is not None else "No activity yet",
            "idle_seconds": person["idle_seconds"],
            "devices": person["devices"],
        })

    everyone.sort(key=lambda u: (-STATE_RANK[u["state"]],
                                 u["idle_seconds"] if u["idle_seconds"] is not None else 10 ** 9,
                                 u["full_name"].lower()))

    users = everyone
    term = (search_query or "").strip().lower()
    if term:
        users = [u for u in users if any(
            (field or "").lower().startswith(term)
            for field in (u["full_name"], *u["full_name"].split(" "), u["username"], u["email"], u["acc_id"])
        )]
    role = ROLE_FILTER_MAP.get((role_filter or "").strip().lower())
    if role:
        users = [u for u in users if u["role"] == role]
    state = (state_filter or "").strip().lower()
    if state in STATE_RANK:
        users = [u for u in users if u["state"] == state]

    total = len(users)
    if limit is not None:
        users = users[:limit]
    return {"users": users, "total": total, "counts": _counts(everyone)}


def _counts(everyone):
    return {
        "online": sum(1 for u in everyone if u["state"] == "online"),
        "idle": sum(1 for u in everyone if u["state"] == "idle"),
        "signed_in": len(everyone),
        "learners": sum(1 for u in everyone if u["role"] == LEARNER_ROLE),
        "staff": sum(1 for u in everyone if u["role"] != LEARNER_ROLE),
    }
