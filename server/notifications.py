"""
notifications.py - Learner notifications (Facebook-style bell dropdown)
------------------------------------------------------------------------
One row per notification in notifications_tbl. Two ways rows get made:

  1. Right where the event happens (same DB transaction as the event):
       - welcome on sign-up                 (login.py /signup)
       - password changed / reset           (auth_core.reset_password)
       - profile / email updated            (learner_profile /api/profile/update)
       - sandbox snippet saved              (learner_routes /api/sandbox/save)
       - badge earned                       (badges.award_and_list_badges)
       - lives refilled / out of lives      (lesson_activities lives pool)

  2. sync_for_learner() - run (throttled) whenever the bell asks for news,
     for things that have no single "event" moment:
       - a lives pool that refilled on its 10-minute timer while nobody
         was playing (recorded at the REAL refill time)
       - the daily 8:00 AM bonus lives
       - module passed / chapter completed / module needs a retake /
         lesson that should be reviewed (weak spots)
       - badges (re-checked here too, so nobody has to open the profile)

Every notification has a dedupe_key, so the same event is never notified
twice. Rows older than 30 days are deleted automatically.

All times are Philippine time (UTC+8, same clock as the lives pool), so
"refilled at 4:58 PM" and "2m ago" always agree.

Blueprint (registered in login.py):
    GET  /api/notifications?filter=all|unread&before_id=&limit=
    GET  /api/notifications/count
    POST /api/notifications/<id>/read
    POST /api/notifications/read-all
"""

import time
from datetime import timedelta
from flask import Blueprint, jsonify, request
from mysql.connector import Error

from cobradb import get_db_connection

NOTIFICATIONS_TABLE = "notifications_tbl"
PH_NOW_SQL = "(UTC_TIMESTAMP() + INTERVAL 8 HOUR)"
KEEP_DAYS = 30
SYNC_EVERY_SECONDS = 90          # per learner, in memory
LIFE_REFILL_SECONDS = 600        # same as lesson_activities.LIFE_REFILL_SECONDS
MAX_LIVES = 5
MAX_BONUS_LIVES = 5
DAILY_RESET_HOUR = 8
ACTIVITY_TYPE_NAMES = {1: "Multiple Choice", 2: "Fill in the Blanks", 3: "Flashcards"}

learner_notifications_bp = Blueprint("learner_notifications_bp", __name__)

_schema_ready = False
_last_sync = {}


# ============================================================
# SCHEMA
# ============================================================
def ensure_notifications_schema(cursor):
    """
    Creates the table if needed. Only call this with a cursor that has NO
    open work: CREATE TABLE commits the current transaction in MySQL.
    notify() never calls it - the table is created once at server start
    (see _create_table_on_startup below) and by the SQL file.
    """
    global _schema_ready
    if _schema_ready:
        return
    cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {NOTIFICATIONS_TABLE} (
                notif_id INT(10) NOT NULL AUTO_INCREMENT,
                acc_id VARCHAR(15) NOT NULL,
                notif_type VARCHAR(30) NOT NULL,
                title VARCHAR(200) NOT NULL,
                detail VARCHAR(300) DEFAULT NULL,
                link_url VARCHAR(255) DEFAULT NULL,
                dedupe_key VARCHAR(150) DEFAULT NULL,
                is_read TINYINT(1) NOT NULL DEFAULT 0,
                created_at DATETIME NOT NULL,
                read_at DATETIME DEFAULT NULL,
                PRIMARY KEY (notif_id),
                UNIQUE KEY uq_notif_dedupe (acc_id, dedupe_key),
                KEY idx_notif_acc_time (acc_id, created_at),
                CONSTRAINT fk_notif_acc FOREIGN KEY (acc_id)
                    REFERENCES account_tbl (acc_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
    )
    _schema_ready = True


@learner_notifications_bp.record_once
def _create_table_on_startup(state):
    connection = get_db_connection()
    if connection is None:
        return
    try:
        cursor = connection.cursor()
        ensure_notifications_schema(cursor)
        connection.commit()
        cursor.close()
    except Error as e:
        print(f"notifications: could not create {NOTIFICATIONS_TABLE}: {e}")
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# CREATE
# ============================================================
def notify(cursor, acc_id, notif_type, title, detail=None, link=None,
           dedupe_key=None, at=None, is_read=False):
    """
    Adds one notification using the CALLER's cursor (so it commits or rolls
    back together with the event). Never raises - a notification must not
    break the action it describes.

    title/detail may use **double asterisks** for bold words.
    at: a datetime in Philippine time for events that happened earlier
        (e.g. a lives refill); default is now.
    Returns True if a new row was added.
    """
    if not acc_id:
        return False
    try:
        if at is None:
            cursor.execute(
                f"""INSERT IGNORE INTO {NOTIFICATIONS_TABLE}
                    (acc_id, notif_type, title, detail, link_url, dedupe_key, is_read, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, {PH_NOW_SQL})""",
                (acc_id, notif_type, title[:200], (detail or None) and detail[:300],
                 link, dedupe_key, 1 if is_read else 0)
            )
        else:
            cursor.execute(
                f"""INSERT IGNORE INTO {NOTIFICATIONS_TABLE}
                    (acc_id, notif_type, title, detail, link_url, dedupe_key, is_read, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (acc_id, notif_type, title[:200], (detail or None) and detail[:300],
                 link, dedupe_key, 1 if is_read else 0, at)
            )
        return cursor.rowcount == 1
    except Error as e:
        print(f"notifications: could not add '{notif_type}' for {acc_id}: {e}")
        return False


def notify_standalone(acc_id, notif_type, title, detail=None, link=None, dedupe_key=None):
    """Same as notify() but with its own connection (for code with no open cursor)."""
    connection = get_db_connection()
    if connection is None:
        return False
    try:
        cursor = connection.cursor()
        added = notify(cursor, acc_id, notif_type, title, detail, link, dedupe_key)
        connection.commit()
        cursor.close()
        return added
    except Error as e:
        print(f"notifications: standalone notify failed: {e}")
        return False
    finally:
        if connection.is_connected():
            connection.close()


def _fmt_clock(dt):
    return dt.strftime("%I:%M %p").lstrip("0")


def _type_name(activity_type_id):
    return ACTIVITY_TYPE_NAMES.get(activity_type_id, "game")


# --- lives (called from lesson_activities' lives pool) ---------------------
def notify_lives_refilled(cursor, acc_id, activity_type_id, regen_at):
    refilled_at = regen_at + timedelta(seconds=LIFE_REFILL_SECONDS)
    return notify(
        cursor, acc_id, "lives_refill",
        f"Your **{_type_name(activity_type_id)} lives** are full again",
        f"{MAX_LIVES}/{MAX_LIVES} lives restored at {_fmt_clock(refilled_at)}. Jump back in!",
        None,
        f"lives_refill:{activity_type_id}:{regen_at:%Y%m%d%H%M%S}",
        at=refilled_at,
    )


def notify_out_of_lives(cursor, acc_id, activity_type_id, regen_at):
    if regen_at is None:
        return False
    back_at = regen_at + timedelta(seconds=LIFE_REFILL_SECONDS)
    return notify(
        cursor, acc_id, "lives_out",
        f"You're **out of {_type_name(activity_type_id)} lives**",
        f"All {MAX_LIVES} come back at {_fmt_clock(back_at)}. Review the lesson while you wait.",
        None,
        f"lives_out:{activity_type_id}:{regen_at:%Y%m%d%H%M%S}",
    )


# ============================================================
# SYNC (things with no single event moment)
# ============================================================
def _sync_lives(cursor, acc_id, backfill):
    cursor.execute(
        f"""SELECT activity_type_id, lives, bonus_lives, lives_regen_at, daily_reset_at,
                   {PH_NOW_SQL} AS db_now
            FROM learner_lives_tbl WHERE acc_id = %s""",
        (acc_id,)
    )
    rows = cursor.fetchall()
    if not rows:
        return
    now = rows[0]["db_now"]
    for r in rows:
        regen_at = r["lives_regen_at"]
        lives = r["lives"] if r["lives"] is not None else MAX_LIVES
        if lives < MAX_LIVES and regen_at is not None \
                and (now - regen_at).total_seconds() >= LIFE_REFILL_SECONDS:
            notify_lives_refilled(cursor, acc_id, r["activity_type_id"], regen_at)

    boundary = now.replace(hour=DAILY_RESET_HOUR, minute=0, second=0, microsecond=0)
    if now >= boundary:
        notify(
            cursor, acc_id, "daily_bonus",
            f"**+{MAX_BONUS_LIVES} bonus lives** for today",
            "Every game got 5 extra lives at 8:00 AM. They're used before your regular lives.",
            None, f"daily_bonus:{boundary:%Y%m%d}", at=boundary, is_read=backfill,
        )


def _sync_progress(connection, cursor, acc_id, backfill):
    # imported here: learner_profile imports this module too
    from learner_profile import _build_overview
    from module_performance import PASS_PERCENT
    from badges import award_and_list_badges

    collected = []
    _, _, _, facts = _build_overview(cursor, acc_id, collect=collected)

    chapters = {}
    for item in collected:
        chapter, module, perf = item["chapter"], item["module"], item["perf"]
        ch = chapters.setdefault(chapter["cat_id"], {"chapter": chapter, "all_passed": True, "lessons": 0})
        if not module["lessons"]:
            continue
        ch["lessons"] += len(module["lessons"])
        ch["all_passed"] = ch["all_passed"] and perf["passed"]
        link = f"/lessons?cat_id={chapter['cat_id']}"

        if perf["passed"]:
            notify(cursor, acc_id, "module_passed",
                   f"**{module['name']}** passed with {perf['percent']}%",
                   f"{chapter['name']} · the next module is unlocked.",
                   link, f"module_passed:{module['module_id']}", is_read=backfill)
        elif perf["needs_retake"]:
            missed = sum(l["missed"] for l in perf["lessons"].values())
            notify(cursor, acc_id, "retake",
                   f"**{module['name']}** is at {perf['percent']}% ({PASS_PERCENT}% needed)",
                   f"Retake {missed} missed item{'s' if missed != 1 else ''} to pass this module.",
                   link, f"module_retake:{module['module_id']}:{perf['percent']}", is_read=backfill)

        titles = {l["resource_id"]: l["title"] for l in module["lessons"]}
        for rid, lp in perf["lessons"].items():
            if lp["completed"] and lp["percent"] is not None and lp["percent"] < PASS_PERCENT:
                notify(cursor, acc_id, "review",
                       f"Review **{titles.get(rid, 'this lesson')}**: you scored {lp['percent']}%",
                       "Open the lesson Summary to see your weak spots and where they're taught.",
                       f"/lesson-content?resource_id={rid}", f"lesson_review:{rid}:{lp['percent']}",
                       is_read=backfill)

    for ch in chapters.values():
        if ch["lessons"] and ch["all_passed"]:
            notify(cursor, acc_id, "chapter_done",
                   f"Chapter complete: **{ch['chapter']['name']}**",
                   "Every module passed. The next chapter is unlocked on your Learning Map.",
                   "/learning-map", f"chapter_done:{ch['chapter']['cat_id']}", is_read=backfill)

    connection.commit()
    award_and_list_badges(connection, acc_id, facts, notify_as_read=backfill)


def sync_for_learner(connection, acc_id, force=False):
    """Throttled per learner. Never raises."""
    now = time.time()
    if not force and now - _last_sync.get(acc_id, 0) < SYNC_EVERY_SECONDS:
        return
    _last_sync[acc_id] = now
    cursor = connection.cursor(dictionary=True)
    try:
        ensure_notifications_schema(cursor)
        cursor.execute(
            f"DELETE FROM {NOTIFICATIONS_TABLE} WHERE acc_id = %s AND created_at < {PH_NOW_SQL} - INTERVAL %s DAY",
            (acc_id, KEEP_DAYS)
        )
        # First ever sync for this learner: past achievements are filed as
        # already read, so the bell doesn't light up with 30 old items.
        cursor.execute(f"SELECT COUNT(*) AS n FROM {NOTIFICATIONS_TABLE} WHERE acc_id = %s", (acc_id,))
        backfill = cursor.fetchone()["n"] == 0
        _sync_lives(cursor, acc_id, backfill)
        connection.commit()
        _sync_progress(connection, cursor, acc_id, backfill)
        connection.commit()
    except Exception as e:  # never let the bell break a page
        print(f"notifications: sync failed for {acc_id}: {e}")
        try:
            connection.rollback()
        except Error:
            pass
    finally:
        cursor.close()


# ============================================================
# API
# ============================================================
def _acc_id():
    from learner_routes import get_current_learner_acc_id
    return get_current_learner_acc_id()


def _relative(seconds):
    s = max(0, int(seconds or 0))
    if s < 60:
        return "Just now"
    if s < 3600:
        return f"{s // 60}m"
    if s < 86400:
        return f"{s // 3600}h"
    if s < 7 * 86400:
        return f"{s // 86400}d"
    return f"{s // (7 * 86400)}w"


def _unread_count(cursor, acc_id):
    cursor.execute(
        f"SELECT COUNT(*) AS n FROM {NOTIFICATIONS_TABLE} WHERE acc_id = %s AND is_read = 0",
        (acc_id,)
    )
    return int(cursor.fetchone()["n"])


@learner_notifications_bp.route("/api/notifications", methods=["GET"])
def list_notifications():
    acc_id = _acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Please log in again."}), 401

    only_unread = request.args.get("filter") == "unread"
    before_id = request.args.get("before_id", type=int)
    limit = max(1, min(30, request.args.get("limit", default=12, type=int)))

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500
    try:
        sync_for_learner(connection, acc_id)
        cursor = connection.cursor(dictionary=True)
        ensure_notifications_schema(cursor)

        where = ["acc_id = %s"]
        params = [acc_id]
        if only_unread:
            where.append("is_read = 0")
        if before_id:
            where.append("notif_id < %s")
            params.append(before_id)
        cursor.execute(
            f"""SELECT notif_id, notif_type, title, detail, link_url, is_read, created_at,
                       TIMESTAMPDIFF(SECOND, created_at, {PH_NOW_SQL}) AS secs_ago,
                       (DATE(created_at) = DATE({PH_NOW_SQL})) AS is_today
                FROM {NOTIFICATIONS_TABLE}
                WHERE {' AND '.join(where)}
                ORDER BY created_at DESC, notif_id DESC
                LIMIT %s""",
            tuple(params + [limit + 1])
        )
        rows = cursor.fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        unread = _unread_count(cursor, acc_id)
        cursor.close()

        items = [{
            "id": r["notif_id"],
            "type": r["notif_type"],
            "title": r["title"],
            "detail": r["detail"] or "",
            "link": r["link_url"],
            "is_read": bool(r["is_read"]),
            "is_today": bool(r["is_today"]),
            "relative": _relative(r["secs_ago"]),
            "when": r["created_at"].strftime("%b %d, %Y · %I:%M %p").replace(" 0", " "),
        } for r in rows]
        return jsonify({"success": True, "unread_count": unread, "items": items, "has_more": has_more})
    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {e}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


@learner_notifications_bp.route("/api/notifications/count", methods=["GET"])
def notifications_count():
    acc_id = _acc_id()
    if not acc_id:
        return jsonify({"success": False}), 401
    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False}), 500
    try:
        sync_for_learner(connection, acc_id)
        cursor = connection.cursor(dictionary=True)
        ensure_notifications_schema(cursor)
        unread = _unread_count(cursor, acc_id)
        cursor.close()
        return jsonify({"success": True, "unread_count": unread})
    except Error:
        return jsonify({"success": False}), 500
    finally:
        if connection.is_connected():
            connection.close()


@learner_notifications_bp.route("/api/notifications/<int:notif_id>/read", methods=["POST"])
def mark_notification_read(notif_id):
    acc_id = _acc_id()
    if not acc_id:
        return jsonify({"success": False}), 401
    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False}), 500
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""UPDATE {NOTIFICATIONS_TABLE} SET is_read = 1, read_at = {PH_NOW_SQL}
                WHERE notif_id = %s AND acc_id = %s AND is_read = 0""",
            (notif_id, acc_id)
        )
        connection.commit()
        unread = _unread_count(cursor, acc_id)
        cursor.close()
        return jsonify({"success": True, "unread_count": unread})
    except Error:
        return jsonify({"success": False}), 500
    finally:
        if connection.is_connected():
            connection.close()


@learner_notifications_bp.route("/api/notifications/read-all", methods=["POST"])
def mark_all_read():
    acc_id = _acc_id()
    if not acc_id:
        return jsonify({"success": False}), 401
    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False}), 500
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""UPDATE {NOTIFICATIONS_TABLE} SET is_read = 1, read_at = {PH_NOW_SQL}
                WHERE acc_id = %s AND is_read = 0""",
            (acc_id,)
        )
        connection.commit()
        cursor.close()
        return jsonify({"success": True, "unread_count": 0})
    except Error:
        return jsonify({"success": False}), 500
    finally:
        if connection.is_connected():
            connection.close()