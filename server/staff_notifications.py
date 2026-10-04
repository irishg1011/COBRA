"""
staff_notifications.py - The admin bell (staff header)
------------------------------------------------------------------------------
feat/admin-bell

Admins get a notification, in the header bell, when:
    message      a visitor sent a message from the landing page   (contact_messages.py)
    lockout      an account was locked after 5 failed logins      (lockout_logs.py)
    signup       a new learner signed up                          (login.py /signup)
    course_done  a learner finished the whole course              (certificates.py)
Mentors get none (their header shows no bell).

Nothing new is stored: the rows go into the SAME notifications_tbl the
learner bell uses (notifications.notify), one row per admin account, so
each admin has their own read / unread state. Every row has a dedupe_key,
so the same event never notifies the same admin twice.

    notify_admins(cursor, ...)        - at the event, on the CALLER's cursor
                                        (commits or rolls back with the event)
    notify_admins_standalone(...)     - same, for code with no open cursor
    list_notifications / unread_count / mark_read / mark_all_read
                                      - the bell itself (admin_routes.py);
                                        always for ONE account: the
                                        logged-in admin from the session

No Flask/session code here. Like notifications.notify(), nothing in this
file ever raises: a notification must not break the event it describes.
"""

from mysql.connector import Error

from cobradb import get_db_connection
from notifications import (
    notify, ensure_notifications_schema, _relative,
    NOTIFICATIONS_TABLE, PH_NOW_SQL, KEEP_DAYS,
)
from user_types import ADMIN_ROLE

ACCOUNT_TABLE = "account_tbl"
USERTYPE_TABLE = "usertype_tbl"
PROFILE_TABLE = "profile_tbl"


def _value(row, key, index=0):
    """A column from a dictionary-cursor row or a tuple-cursor row."""
    return row[key] if isinstance(row, dict) else row[index]


def _admin_ids(cursor):
    """Every active Admin account."""
    cursor.execute(
        f"""SELECT a.acc_id
            FROM {ACCOUNT_TABLE} a
            JOIN {USERTYPE_TABLE} ut ON a.u_type = ut.ut_id
            WHERE ut.u_type = %s AND (a.is_deleted = 0 OR a.is_deleted IS NULL)""",
        (ADMIN_ROLE,)
    )
    return [_value(row, "acc_id") for row in cursor.fetchall()]


def account_summary(cursor, acc_id):
    """(display name, email) of an account - the name falls back to the acc_id."""
    try:
        cursor.execute(
            f"""SELECT p.firstname, p.lastname, a.email
                FROM {ACCOUNT_TABLE} a
                LEFT JOIN {PROFILE_TABLE} p ON p.acc_id = a.acc_id
                WHERE a.acc_id = %s""",
            (acc_id,)
        )
        row = cursor.fetchone()
    except Error:
        row = None
    if not row:
        return acc_id, ""
    first, last = _value(row, "firstname", 0), _value(row, "lastname", 1)
    name = f"{first or ''} {last or ''}".strip() or acc_id
    return name, (_value(row, "email", 2) or "")


# ------------------------------------------------------------------
# Creating notifications
# ------------------------------------------------------------------
def notify_admins(cursor, notif_type, title, detail=None, link=None, dedupe_key=None):
    """
    One notification for every admin, on the CALLER's cursor (so it is
    saved or rolled back together with the event). Call it when the
    cursor has no unread SELECT results. Returns how many were added.
    """
    try:
        admin_ids = _admin_ids(cursor)
    except Error as e:
        print(f"staff_notifications: could not list the admins for '{notif_type}': {e}")
        return 0
    return sum(1 for acc_id in admin_ids
               if notify(cursor, acc_id, notif_type, title, detail, link, dedupe_key))


def notify_admins_standalone(notif_type, title, detail=None, link=None, dedupe_key=None):
    """notify_admins() with its own connection, for code that has no open cursor."""
    connection = get_db_connection()
    if connection is None:
        return 0
    try:
        cursor = connection.cursor()
        added = notify_admins(cursor, notif_type, title, detail, link, dedupe_key)
        connection.commit()
        cursor.close()
        return added
    except Error as e:
        print(f"staff_notifications: standalone notify failed: {e}")
        return 0
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# The bell (one account at a time - the logged-in admin)
# ------------------------------------------------------------------
def _unread(cursor, acc_id):
    cursor.execute(
        f"SELECT COUNT(*) AS n FROM {NOTIFICATIONS_TABLE} WHERE acc_id = %s AND is_read = 0",
        (acc_id,)
    )
    return int(cursor.fetchone()["n"])


def list_notifications(acc_id, only_unread=False, before_id=None, limit=12):
    """
    {"unread_count", "items", "has_more"} - the same shape the learner
    bell's API returns - or None on a database problem.
    Rows older than KEEP_DAYS are removed here, like on the learner side.
    """
    if not acc_id:
        return None
    limit = max(1, min(30, limit or 12))
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        ensure_notifications_schema(cursor)
        cursor.execute(
            f"""DELETE FROM {NOTIFICATIONS_TABLE}
                WHERE acc_id = %s AND created_at < {PH_NOW_SQL} - INTERVAL {int(KEEP_DAYS)} DAY""",
            (acc_id,)
        )
        connection.commit()

        where, params = ["acc_id = %s"], [acc_id]
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
        unread = _unread(cursor, acc_id)
        cursor.close()

        return {
            "unread_count": unread,
            "has_more": has_more,
            "items": [{
                "id": r["notif_id"],
                "type": r["notif_type"],
                "title": r["title"],
                "detail": r["detail"] or "",
                "link": r["link_url"],
                "is_read": bool(r["is_read"]),
                "is_today": bool(r["is_today"]),
                "relative": _relative(r["secs_ago"]),
                "when": r["created_at"].strftime("%b %d, %Y · %I:%M %p").replace(" 0", " "),
            } for r in rows],
        }
    except Error as e:
        print(f"staff_notifications: could not list notifications for {acc_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def unread_count(acc_id):
    """How many unread notifications this account has, or None on a database problem."""
    if not acc_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        ensure_notifications_schema(cursor)
        count = _unread(cursor, acc_id)
        cursor.close()
        return count
    except Error as e:
        print(f"staff_notifications: could not count notifications for {acc_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def mark_read(acc_id, notif_id=None):
    """
    Marks ONE of this account's notifications read (notif_id), or all of
    them (notif_id=None). The acc_id is part of the WHERE, so an admin can
    never touch someone else's row. Returns the new unread count, or None
    on a database problem.
    """
    if not acc_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        if notif_id is None:
            cursor.execute(
                f"""UPDATE {NOTIFICATIONS_TABLE} SET is_read = 1, read_at = {PH_NOW_SQL}
                    WHERE acc_id = %s AND is_read = 0""",
                (acc_id,)
            )
        else:
            cursor.execute(
                f"""UPDATE {NOTIFICATIONS_TABLE} SET is_read = 1, read_at = {PH_NOW_SQL}
                    WHERE notif_id = %s AND acc_id = %s AND is_read = 0""",
                (notif_id, acc_id)
            )
        connection.commit()
        count = _unread(cursor, acc_id)
        cursor.close()
        return count
    except Error as e:
        print(f"staff_notifications: could not mark notifications read for {acc_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()