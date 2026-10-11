"""
dashboard_cards.py - what opens when an Admin Dashboard card is clicked (feat/admin-online)
------------------------------------------------------------------------------------------
Each card opens a modal with at most CARD_LIMIT rows and a "View all ->"
link (admin_routes.dashboard_card()):

    learners / mentors / admins   newest accounts of that role
    sessions                      who is signed in right now (presence.py)
    logins                        today's login attempts (Login Logs)
    locked                        accounts locked right now + who got locked out today

Everything here is read-only EXCEPT unlock_account() - the "Unlock now"
button (admin only). Every unlock is written to unlock_logs_tbl and the
admins' header bell is told.

    unlock_logs_tbl
    ----------------
    unlock_id               INT AUTO_INCREMENT PRIMARY KEY
    acc_id                  VARCHAR(15)  the account that was unlocked
    unlocked_by             VARCHAR(15)  the admin who clicked Unlock now
    failed_attempts_before  INT NULL
    lockout_until_before    DATETIME NULL  when the lock would have ended by itself
    ip_address              VARCHAR(45) NULL  the admin's IP
    unlocked_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP

Created lazily (IF NOT EXISTS) like the other log tables - the same SQL is
in database/migrations/2026-10-admin-online.sql for HeidiSQL.
"""

from mysql.connector import Error

from cobradb import get_db_connection
from admin_time import fmt_datetime
from profile_avatar import get_avatar_urls
from lockout_logs import LOCKOUT_LOGS_TABLE, _ensure_table as _ensure_lockout_table

CARD_LIMIT = 10
UNLOCK_LOGS_TABLE = "unlock_logs_tbl"

_unlock_table_ensured = False


def _ensure_unlock_table(connection):
    global _unlock_table_ensured
    if _unlock_table_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {UNLOCK_LOGS_TABLE} (
                unlock_id INT NOT NULL AUTO_INCREMENT,
                acc_id VARCHAR(15) NOT NULL,
                unlocked_by VARCHAR(15) NOT NULL,
                failed_attempts_before INT NULL,
                lockout_until_before DATETIME NULL,
                ip_address VARCHAR(45) NULL,
                unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (unlock_id),
                KEY idx_unlock_acc (acc_id),
                KEY idx_unlock_by (unlocked_by),
                KEY idx_unlock_at (unlocked_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
            """
        )
        connection.commit()
        cursor.close()
        _unlock_table_ensured = True
    except Error as e:
        print(f"dashboard_cards: failed to ensure {UNLOCK_LOGS_TABLE} exists: {e}")


def _full_name(row):
    name = " ".join(p for p in (row.get("firstname"), row.get("lastname")) if p).strip()
    return name or row.get("username") or row.get("acc_id")


def _with_connection(build, label):
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True, buffered=True)
        result = build(cursor, connection)
        cursor.close()
        return result
    except Error as e:
        print(f"dashboard_cards: failed to load {label}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Learners / Mentors / Admins - newest accounts of one role
# ------------------------------------------------------------------
def get_newest_accounts(role, limit=CARD_LIMIT):
    """{"rows": [...], "total": n} for role 'Learner' / 'Mentor' / 'Admin'. None on a DB error."""
    def build(cursor, connection):
        where = """FROM account_tbl a
                   JOIN usertype_tbl ut ON ut.ut_id = a.u_type
                   LEFT JOIN profile_tbl p ON p.acc_id = a.acc_id
                   WHERE ut.u_type = %s AND (a.is_deleted = 0 OR a.is_deleted IS NULL)"""
        cursor.execute(f"SELECT COUNT(*) AS n {where}", (role,))
        total = int(cursor.fetchone()["n"])
        cursor.execute(
            f"""SELECT a.acc_id, a.username, a.email, a.status, a.created_at, a.last_login,
                       (a.lockout_until IS NOT NULL AND a.lockout_until > NOW()) AS is_locked,
                       p.firstname, p.lastname
                {where}
                ORDER BY a.created_at DESC, a.acc_id DESC
                LIMIT %s""",
            (role, int(limit))
        )
        rows = cursor.fetchall()
        avatars = get_avatar_urls(cursor, [r["acc_id"] for r in rows])
        return {"total": total, "rows": [{
            "acc_id": r["acc_id"],
            "full_name": _full_name(r),
            "username": r.get("username") or "",
            "status": "Locked" if r.get("is_locked") else (r.get("status") or "Active"),
            "date_created": fmt_datetime(r.get("created_at")),
            "last_login": fmt_datetime(r.get("last_login"), empty="Never"),
            "avatar_url": avatars.get(r["acc_id"]),
        } for r in rows]}
    return _with_connection(build, f"newest {role} accounts")


# ------------------------------------------------------------------
# Locked Accounts - locked right now + locked out today
# ------------------------------------------------------------------
def get_locked_accounts(limit=CARD_LIMIT):
    """
    {"rows": [...], "total": n, "today": [...], "today_total": n}
      rows   accounts locked RIGHT NOW (lockout_until in the future), soonest
             unlock last - each with until / seconds_left for "Unlock now"
      today  every account locked out at some point today (lockout_logs_tbl),
             including ones already unlocked again - locks only last 1 minute,
             so this is usually the useful list.
    """
    def build(cursor, connection):
        base = """FROM account_tbl a
                  LEFT JOIN usertype_tbl ut ON ut.ut_id = a.u_type
                  LEFT JOIN profile_tbl p ON p.acc_id = a.acc_id
                  WHERE a.lockout_until IS NOT NULL AND a.lockout_until > NOW()
                    AND (a.is_deleted = 0 OR a.is_deleted IS NULL)"""
        cursor.execute(f"SELECT COUNT(*) AS n {base}")
        total = int(cursor.fetchone()["n"])
        cursor.execute(
            f"""SELECT a.acc_id, a.username, a.failed_attempts, a.lockout_until,
                       TIMESTAMPDIFF(SECOND, NOW(), a.lockout_until) AS seconds_left,
                       ut.u_type AS role, p.firstname, p.lastname
                {base}
                ORDER BY a.lockout_until DESC
                LIMIT %s""",
            (int(limit),)
        )
        locked = cursor.fetchall()

        _ensure_lockout_table(connection)   # no lockout ever -> the table may not exist yet
        cursor.execute(
            f"""SELECT COUNT(DISTINCT l.acc_id) AS n FROM {LOCKOUT_LOGS_TABLE} l
                WHERE l.locked_at >= CURDATE()"""
        )
        today_total = int(cursor.fetchone()["n"])
        cursor.execute(
            f"""SELECT l.acc_id, COUNT(*) AS times, MAX(l.locked_at) AS last_locked_at,
                       MAX(a.username) AS username, MAX(ut.u_type) AS role,
                       MAX(p.firstname) AS firstname, MAX(p.lastname) AS lastname,
                       MAX(a.lockout_until IS NOT NULL AND a.lockout_until > NOW()) AS is_locked
                FROM {LOCKOUT_LOGS_TABLE} l
                LEFT JOIN account_tbl a ON a.acc_id = l.acc_id
                LEFT JOIN usertype_tbl ut ON ut.ut_id = a.u_type
                LEFT JOIN profile_tbl p ON p.acc_id = l.acc_id
                WHERE l.locked_at >= CURDATE()
                GROUP BY l.acc_id
                ORDER BY last_locked_at DESC
                LIMIT %s""",
            (int(limit),)
        )
        today = cursor.fetchall()
        avatars = get_avatar_urls(cursor, [r["acc_id"] for r in locked] + [r["acc_id"] for r in today])
        return {
            "total": total,
            "rows": [{
                "acc_id": r["acc_id"],
                "full_name": _full_name(r),
                "role": r.get("role") or "Unknown",
                "failed_attempts": int(r.get("failed_attempts") or 0),
                "locked_until": fmt_datetime(r.get("lockout_until")),
                "seconds_left": max(0, int(r.get("seconds_left") or 0)),
                "avatar_url": avatars.get(r["acc_id"]),
            } for r in locked],
            "today_total": today_total,
            "today": [{
                "acc_id": r["acc_id"],
                "full_name": _full_name(r),
                "role": r.get("role") or "Unknown",
                "times": int(r.get("times") or 0),
                "last_locked_at": fmt_datetime(r.get("last_locked_at")),
                "is_locked": bool(r.get("is_locked")),
                "avatar_url": avatars.get(r["acc_id"]),
            } for r in today],
        }
    return _with_connection(build, "locked accounts")


# ------------------------------------------------------------------
# "Unlock now" (admin only, logged)
# ------------------------------------------------------------------
def unlock_account(acc_id, admin_id, ip_address=None):
    """
    Clears a lockout early: failed_attempts = 0, lockout_until = NULL.
    Only an account that is locked RIGHT NOW is unlocked (a lock that
    already ran out needs nothing). Writes one unlock_logs_tbl row and
    tells every admin's bell, in the same transaction.
    Returns (success: bool, message: str).
    """
    acc_id = (acc_id or "").strip()
    if not acc_id or not admin_id:
        return False, "Account not found."
    connection = get_db_connection()
    if connection is None:
        return False, "Could not reach the database."
    try:
        _ensure_unlock_table(connection)
        cursor = connection.cursor(dictionary=True, buffered=True)
        cursor.execute(
            """SELECT acc_id, failed_attempts, lockout_until,
                      (lockout_until IS NOT NULL AND lockout_until > NOW()) AS is_locked
               FROM account_tbl
               WHERE acc_id = %s AND (is_deleted = 0 OR is_deleted IS NULL)
               FOR UPDATE""",
            (acc_id,)
        )
        row = cursor.fetchone()
        if row is None:
            connection.rollback()
            cursor.close()
            return False, "Account not found."
        if not row["is_locked"]:
            connection.rollback()
            cursor.close()
            return False, "This account is not locked anymore - the lock already ended."

        cursor.execute(
            "UPDATE account_tbl SET failed_attempts = 0, lockout_until = NULL WHERE acc_id = %s",
            (acc_id,)
        )
        cursor.execute(
            f"""INSERT INTO {UNLOCK_LOGS_TABLE}
                    (acc_id, unlocked_by, failed_attempts_before, lockout_until_before, ip_address)
                VALUES (%s, %s, %s, %s, %s)""",
            (acc_id, admin_id, row.get("failed_attempts"), row.get("lockout_until"), ip_address)
        )
        unlock_id = cursor.lastrowid

        # (imported here, like lockout_logs.py: staff_notifications loads the Flask notification module)
        from urllib.parse import quote
        from staff_notifications import notify_admins, account_summary
        name, email = account_summary(cursor, acc_id)
        admin_name, _ = account_summary(cursor, admin_id)
        notify_admins(
            cursor, "lockout",
            f"**{name}** was unlocked",
            f"Unlocked early by {admin_name}.",
            f"/admin/login-logs.html?q={quote(email or str(acc_id))}",
            f"unlock:{unlock_id}",
        )
        connection.commit()
        cursor.close()
        return True, f"{name} can sign in again."
    except Error as e:
        connection.rollback()
        print(f"dashboard_cards: failed to unlock {acc_id}: {e}")
        return False, "Could not unlock the account. Please try again."
    finally:
        if connection.is_connected():
            connection.close()


def seconds_left_text(seconds):
    """'45 s left' / '2 min left'."""
    seconds = max(0, int(seconds or 0))
    return f"{seconds} s left" if seconds < 60 else f"{seconds // 60} min left"

