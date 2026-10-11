"""
account_deletion.py - "Delete my account" with a 30-day restore (feat/account-tools)
------------------------------------------------------------------------------------
Anyone (learner, mentor, admin) can ask to delete their OWN account:

    1. confirm with their password  -> request_self_deletion()
       account_tbl.deletion_requested_at = NOW()
       account_tbl.deletion_due_at       = NOW() + 30 days
       every device is signed out.
    2. signing in again before deletion_due_at: auth_core.authenticate()
       answers "pending_deletion" instead of signing in; the login page asks
       "Your account will be deleted on <date>. Restore it?" -
       Restore re-sends the sign-in with restore=true -> restore_pending().
    3. after 30 days: archive_due_deletions() turns it into a normal
       ARCHIVED account (is_deleted = 1, same as the admin Archive - every
       row of data is kept, only an admin can restore it). It runs on every
       sign-in attempt and every Account & Security load, so no scheduled
       job is needed.

The status column (Active / Inactive) is NOT used: the inactivity sweep
and every sign-in rewrite it. "Pending deletion" = deletion_due_at IS NOT NULL.

Rules: the last active admin can't delete themselves (an admin already
pending deletion doesn't count as active). A mentor's lessons and
activities are never touched. Every step goes to account_actions_log_tbl.
"""

from mysql.connector import Error
from werkzeug.security import check_password_hash

from cobradb import get_db_connection
from admin_time import fmt_datetime
from account_tools import ensure_account_tools_schema, log_action
from session_tracker import end_sessions_for_account
from user_types import ADMIN_ROLE

DELETION_DAYS = 30
LAST_ADMIN_MESSAGE = ("You are the only active administrator, so this account can't be deleted. "
                      "Create or restore another administrator first.")


def fmt_date(dt):
    """'Nov 10, 2026' (no time - the account goes on that day)."""
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}" if dt else "—"


def _count_other_active_admins(cursor, acc_id):
    cursor.execute(
        """SELECT COUNT(*) FROM account_tbl a JOIN usertype_tbl ut ON ut.ut_id = a.u_type
           WHERE ut.u_type = %s AND a.acc_id <> %s
             AND (a.is_deleted = 0 OR a.is_deleted IS NULL) AND a.deletion_due_at IS NULL""",
        (ADMIN_ROLE, acc_id)
    )
    row = cursor.fetchone()
    return int((row[0] if not isinstance(row, dict) else list(row.values())[0]) or 0)


def self_deletion_block_reason(acc_id):
    """Why this account may not delete itself ("" = allowed)."""
    connection = get_db_connection()
    if connection is None:
        return "Could not reach the database."
    try:
        ensure_account_tools_schema(connection)
        cursor = connection.cursor()
        cursor.execute(
            """SELECT ut.u_type FROM account_tbl a JOIN usertype_tbl ut ON ut.ut_id = a.u_type
               WHERE a.acc_id = %s""",
            (acc_id,)
        )
        row = cursor.fetchone()
        reason = ""
        if row and row[0] == ADMIN_ROLE and _count_other_active_admins(cursor, acc_id) == 0:
            reason = LAST_ADMIN_MESSAGE
        cursor.close()
        return reason
    except Error:
        return "Could not check this account right now."
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# 1. Ask to delete (from the profile)
# ------------------------------------------------------------------
def request_self_deletion(acc_id, password, ip_address=None):
    """
    Returns (success, message, delete_on 'Nov 10, 2026' or None).
    The caller clears its own Flask session afterwards.
    """
    if not acc_id:
        return False, "Please sign in again.", None
    if not (password or "").strip():
        return False, "Enter your password to confirm.", None

    connection = get_db_connection()
    if connection is None:
        return False, "Could not reach the database.", None
    try:
        ensure_account_tools_schema(connection)
        cursor = connection.cursor(dictionary=True, buffered=True)
        cursor.execute(
            """SELECT a.acc_id, a.password, a.is_deleted, a.deletion_due_at, ut.u_type AS role
               FROM account_tbl a JOIN usertype_tbl ut ON ut.ut_id = a.u_type
               WHERE a.acc_id = %s FOR UPDATE""",
            (acc_id,)
        )
        account = cursor.fetchone()
        if account is None or account.get("is_deleted"):
            connection.rollback()
            return False, "Account not found.", None
        if not check_password_hash(account["password"], password.strip()):
            connection.rollback()
            return False, "Incorrect password.", None
        if account.get("deletion_due_at"):
            connection.rollback()
            return False, f"This account is already set to be deleted on {fmt_date(account['deletion_due_at'])}.", None
        if account.get("role") == ADMIN_ROLE and _count_other_active_admins(cursor, acc_id) == 0:
            connection.rollback()
            return False, LAST_ADMIN_MESSAGE, None

        cursor.execute(
            f"""UPDATE account_tbl
                SET deletion_requested_at = NOW(),
                    deletion_due_at = NOW() + INTERVAL {DELETION_DAYS} DAY
                WHERE acc_id = %s""",
            (acc_id,)
        )
        cursor.execute("SELECT deletion_due_at FROM account_tbl WHERE acc_id = %s", (acc_id,))
        due = cursor.fetchone()["deletion_due_at"]
        log_action(cursor, "self_delete", acc_id, acc_id, f"Will be archived on {fmt_date(due)}", ip_address)

        from staff_notifications import notify_admins, account_summary
        name, email = account_summary(cursor, acc_id)
        notify_admins(cursor, "account_deletion", f"**{name}** asked to delete their account",
                      f"{account.get('role')} account. It becomes archived on {fmt_date(due)} unless restored.",
                      "/admin/account-security.html", f"self_delete:{acc_id}:{due:%Y%m%d%H%M%S}")
        connection.commit()
        cursor.close()
    except Error as e:
        connection.rollback()
        print(f"account_deletion: failed for {acc_id}: {e}")
        return False, "Could not delete the account. Please try again.", None
    finally:
        if connection.is_connected():
            connection.close()

    end_sessions_for_account(acc_id)   # every device is signed out
    return True, f"Your account will be deleted on {fmt_date(due)}. Sign in before then to restore it.", fmt_date(due)


# ------------------------------------------------------------------
# 2. Restore while pending (the person at sign-in, or an admin)
# ------------------------------------------------------------------
def restore_pending(acc_id, done_by, ip_address=None, cursor=None):
    """Cancels a pending deletion. Returns (success, message)."""
    action = "self_restore" if done_by == acc_id else "admin_restore_pending"

    def work(cur):
        cur.execute(
            """UPDATE account_tbl SET deletion_requested_at = NULL, deletion_due_at = NULL
               WHERE acc_id = %s AND deletion_due_at IS NOT NULL
                 AND (is_deleted = 0 OR is_deleted IS NULL)""",
            (acc_id,)
        )
        if cur.rowcount == 0:
            return False, "This account is not pending deletion."
        log_action(cur, action, acc_id, done_by, None, ip_address)
        return True, "Account restored."

    if cursor is not None:
        return work(cursor)
    connection = get_db_connection()
    if connection is None:
        return False, "Could not reach the database."
    try:
        ensure_account_tools_schema(connection)
        cur = connection.cursor()
        ok, message = work(cur)
        connection.commit() if ok else connection.rollback()
        cur.close()
        return ok, message
    except Error as e:
        connection.rollback()
        print(f"account_deletion: failed to restore {acc_id}: {e}")
        return False, "Could not restore the account."
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# 3. After 30 days -> archived
# ------------------------------------------------------------------
def archive_due_deletions(connection):
    """
    Every pending account whose 30 days are over becomes ARCHIVED (same as
    the admin Archive). Uses the caller's connection; never raises.
    Returns how many accounts were archived.
    """
    try:
        ensure_account_tools_schema(connection)
        cursor = connection.cursor()
        cursor.execute(
            """SELECT acc_id FROM account_tbl
               WHERE deletion_due_at IS NOT NULL AND deletion_due_at <= NOW()
                 AND (is_deleted = 0 OR is_deleted IS NULL)"""
        )
        due = [row[0] for row in cursor.fetchall()]
        for acc_id in due:
            cursor.execute(
                """UPDATE account_tbl
                   SET is_deleted = 1, deleted_at = NOW(),
                       deletion_requested_at = NULL, deletion_due_at = NULL
                   WHERE acc_id = %s""",
                (acc_id,)
            )
            log_action(cursor, "auto_archive", acc_id, None, f"{DELETION_DAYS} days after the owner asked to delete it")
        connection.commit()
        cursor.close()
        for acc_id in due:
            end_sessions_for_account(acc_id)
        return len(due)
    except Error as e:
        print(f"account_deletion: failed to archive due accounts: {e}")
        return 0


# ------------------------------------------------------------------
# Admin: the Pending Deletion list
# ------------------------------------------------------------------
def get_pending_deletions(search_query=None):
    """[{acc_id, full_name, username, email, role, requested_at, delete_on, days_left}] or None."""
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        archive_due_deletions(connection)
        cursor = connection.cursor(dictionary=True)
        query = """
            SELECT a.acc_id, a.username, a.email, a.deletion_requested_at, a.deletion_due_at,
                   GREATEST(0, DATEDIFF(a.deletion_due_at, NOW())) AS days_left,
                   ut.u_type AS role, p.firstname, p.lastname
            FROM account_tbl a
            LEFT JOIN usertype_tbl ut ON ut.ut_id = a.u_type
            LEFT JOIN profile_tbl p ON p.acc_id = a.acc_id
            WHERE a.deletion_due_at IS NOT NULL AND (a.is_deleted = 0 OR a.is_deleted IS NULL)
        """
        params = []
        term = (search_query or "").strip().lower()
        if term:
            query += """ AND (LOWER(p.firstname) LIKE %s OR LOWER(p.lastname) LIKE %s
                              OR LOWER(a.username) LIKE %s OR LOWER(a.email) LIKE %s)"""
            params.extend([f"{term}%"] * 4)
        query += " ORDER BY a.deletion_due_at ASC"
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        cursor.close()
        return [{
            "acc_id": r["acc_id"],
            "full_name": " ".join(x for x in (r.get("firstname"), r.get("lastname")) if x).strip() or r["username"],
            "username": r["username"],
            "email": r.get("email") or "—",
            "role": r.get("role") or "Unknown",
            "requested_at": fmt_datetime(r.get("deletion_requested_at")),
            "delete_on": fmt_date(r.get("deletion_due_at")),
            "days_left": int(r.get("days_left") or 0),
        } for r in rows]
    except Error as e:
        print(f"account_deletion: failed to list pending deletions: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()
