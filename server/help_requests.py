"""
help_requests.py - "Can't get in? Ask an admin" (feat/account-tools)
------------------------------------------------------------------------------
STAFF LOGIN ONLY. A mentor or admin who can't sign in types their username
(or account ID) and a short message on /staff/login. That becomes one row
in help_requests_tbl and every admin's bell is told.

The form never reveals whether an account exists: it always answers
"Request sent". Only a STAFF account is ever matched (a learner's name is
stored as typed, unmatched). At most RATE_LIMIT requests per hour per IP
and per typed name, so the form can't be used to flood the admins.

Admins (never mentors - role_permissions.py) then, after checking it's
really that person:
    Reset password   admin_reset_password(): a temporary password is shown
                     ONCE to the admin; only its hash is stored. The account
                     gets must_change_password = 1, so the next sign-in goes
                     to the forced "Set a new password" screen, and every
                     other signed-in device is signed out.
    Unlock now       dashboard_cards.unlock_account() (same as the Dashboard)
    Mark done        close it without either.

Every step is written to account_actions_log_tbl.
"""

import secrets
import string

from mysql.connector import Error
from werkzeug.security import generate_password_hash

from cobradb import get_db_connection
from admin_time import fmt_datetime
from account_tools import ensure_account_tools_schema, log_action, HELP_TABLE
from session_tracker import end_sessions_for_account
from user_types import STAFF_ROLES
from validators import PASSWORD_REGEX

RATE_LIMIT = 3              # requests per hour, per IP and per typed name
TYPED_MAX = 100
MESSAGE_MAX = 500
TEMP_PASSWORD_LENGTH = 12
TEMP_PASSWORD_SYMBOLS = "!@#$%^&*"
SENT_MESSAGE = "Request sent. An administrator will contact you after checking it's really you."


def _name(row):
    name = " ".join(p for p in (row.get("firstname"), row.get("lastname")) if p).strip()
    return name or row.get("username") or row.get("acc_id")


# ------------------------------------------------------------------
# Staff login page: send a request (public)
# ------------------------------------------------------------------
def create_help_request(typed_name, message, ip_address):
    """Returns (payload, http_status). Never says whether the account exists."""
    typed = (typed_name or "").strip()
    message = (message or "").strip()
    if not typed:
        return {"success": False, "message": "Enter your username or account ID."}, 400
    if not message:
        return {"success": False, "message": "Write a short message for the administrator."}, 400
    if len(typed) > TYPED_MAX:
        return {"success": False, "message": f"The username or ID can be at most {TYPED_MAX} characters."}, 400
    if len(message) > MESSAGE_MAX:
        return {"success": False, "message": f"The message can be at most {MESSAGE_MAX} characters."}, 400

    connection = get_db_connection()
    if connection is None:
        return {"success": False, "message": "Could not reach the server. Please try again."}, 500
    try:
        ensure_account_tools_schema(connection)
        cursor = connection.cursor(dictionary=True, buffered=True)
        cursor.execute(
            f"""SELECT
                    SUM(CASE WHEN ip_address = %s THEN 1 ELSE 0 END) AS by_ip,
                    SUM(CASE WHEN LOWER(typed_name) = LOWER(%s) THEN 1 ELSE 0 END) AS by_name
                FROM {HELP_TABLE}
                WHERE created_at >= NOW() - INTERVAL 1 HOUR""",
            (ip_address, typed)
        )
        recent = cursor.fetchone() or {}
        if int(recent.get("by_ip") or 0) >= RATE_LIMIT or int(recent.get("by_name") or 0) >= RATE_LIMIT:
            cursor.close()
            return {"success": False,
                    "message": "You already sent a few requests. Please wait an hour, or contact an administrator directly."}, 429

        cursor.execute(
            """SELECT a.acc_id, a.username, ut.u_type AS role, p.firstname, p.lastname
               FROM account_tbl a
               JOIN usertype_tbl ut ON ut.ut_id = a.u_type
               LEFT JOIN profile_tbl p ON p.acc_id = a.acc_id
               WHERE (LOWER(a.username) = LOWER(%s) OR UPPER(a.acc_id) = UPPER(%s))
                 AND (a.is_deleted = 0 OR a.is_deleted IS NULL)
               LIMIT 1""",
            (typed, typed)
        )
        account = cursor.fetchone()
        if account and account.get("role") not in STAFF_ROLES:
            account = None   # staff door only - a learner name stays unmatched
        acc_id = account["acc_id"] if account else None

        cursor.execute(
            f"INSERT INTO {HELP_TABLE} (typed_name, acc_id, message, ip_address) VALUES (%s, %s, %s, %s)",
            (typed, acc_id, message, ip_address)
        )
        request_id = cursor.lastrowid
        log_action(cursor, "help_request", acc_id, acc_id, f"Request #{request_id}: {message[:200]}", ip_address)

        from staff_notifications import notify_admins
        who = f"**{_name(account)}**" if account else f"“{typed[:40]}” (no matching staff account)"
        notify_admins(cursor, "help_request", f"Help request from {who}",
                      message[:200], "/admin/help-requests", f"help:{request_id}")
        connection.commit()
        cursor.close()
        return {"success": True, "message": SENT_MESSAGE}, 200
    except Error as e:
        connection.rollback()
        print(f"help_requests: failed to save a request: {e}")
        return {"success": False, "message": "Could not send the request. Please try again."}, 500
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Admin: the Help Requests list
# ------------------------------------------------------------------
def list_help_requests(status="open"):
    """{"requests": [...], "counts": {"open", "done"}} or None on a DB error."""
    status = "done" if status == "done" else "open"
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        ensure_account_tools_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(f"SELECT status, COUNT(*) AS n FROM {HELP_TABLE} GROUP BY status")
        counts = {"open": 0, "done": 0}
        for row in cursor.fetchall():
            counts[row["status"]] = int(row["n"])
        cursor.execute(
            f"""SELECT h.*, a.username, a.email, a.last_login, a.failed_attempts, a.must_change_password,
                       a.is_deleted, a.deletion_due_at,
                       (a.lockout_until IS NOT NULL AND a.lockout_until > NOW()) AS is_locked,
                       ut.u_type AS role, p.firstname, p.lastname,
                       hp.firstname AS by_first, hp.lastname AS by_last, hb.username AS by_username
                FROM {HELP_TABLE} h
                LEFT JOIN account_tbl a ON a.acc_id = h.acc_id
                LEFT JOIN usertype_tbl ut ON ut.ut_id = a.u_type
                LEFT JOIN profile_tbl p ON p.acc_id = h.acc_id
                LEFT JOIN account_tbl hb ON hb.acc_id = h.handled_by
                LEFT JOIN profile_tbl hp ON hp.acc_id = h.handled_by
                WHERE h.status = %s
                ORDER BY h.created_at {'ASC' if status == 'open' else 'DESC'}, h.request_id
                LIMIT 200""",
            (status,)
        )
        rows = cursor.fetchall()
        cursor.close()
    except Error as e:
        print(f"help_requests: failed to list requests: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()

    requests = []
    for r in rows:
        matched = bool(r.get("acc_id")) and r.get("username") is not None
        handled_by = " ".join(x for x in (r.get("by_first"), r.get("by_last")) if x).strip() or r.get("by_username") or ""
        requests.append({
            "request_id": r["request_id"],
            "typed_name": r["typed_name"],
            "message": r["message"],
            "ip_address": r.get("ip_address") or "—",
            "created_at": fmt_datetime(r.get("created_at")),
            "status": r["status"],
            "resolution": r.get("resolution") or "",
            "handled_by": handled_by,
            "handled_at": fmt_datetime(r.get("handled_at")),
            "matched": matched,
            "account": {
                "acc_id": r["acc_id"],
                "full_name": _name(r),
                "username": r.get("username"),
                "email": r.get("email") or "—",
                "role": r.get("role") or "Unknown",
                "is_locked": bool(r.get("is_locked")),
                "failed_attempts": int(r.get("failed_attempts") or 0),
                "last_login": fmt_datetime(r.get("last_login"), empty="Never"),
                "must_change_password": bool(r.get("must_change_password")),
                "archived": bool(r.get("is_deleted")),
                "pending_deletion": bool(r.get("deletion_due_at")),
            } if matched else None,
        })
    return {"requests": requests, "counts": counts}


def count_open_help_requests():
    connection = get_db_connection()
    if connection is None:
        return 0
    try:
        ensure_account_tools_schema(connection)
        cursor = connection.cursor()
        cursor.execute(f"SELECT COUNT(*) FROM {HELP_TABLE} WHERE status = 'open'")
        n = int(cursor.fetchone()[0] or 0)
        cursor.close()
        return n
    except Error:
        return 0
    finally:
        if connection.is_connected():
            connection.close()


def _request_account(cursor, request_id):
    cursor.execute(f"SELECT request_id, acc_id, status FROM {HELP_TABLE} WHERE request_id = %s", (request_id,))
    return cursor.fetchone()


def close_help_request(request_id, admin_id, resolution="other", ip_address=None, cursor=None):
    """Marks a request done. Returns (success, message)."""
    def work(cur):
        row = _request_account(cur, request_id)
        if row is None:
            return False, "Help request not found."
        cur.execute(
            f"""UPDATE {HELP_TABLE}
                SET status = 'done', handled_by = %s, handled_at = NOW(), resolution = %s
                WHERE request_id = %s""",
            (admin_id, resolution, request_id)
        )
        log_action(cur, "help_done", row["acc_id"], admin_id, f"Request #{request_id}: {resolution}", ip_address)
        return True, "Marked as done."

    if cursor is not None:
        return work(cursor)
    connection = get_db_connection()
    if connection is None:
        return False, "Could not reach the database."
    try:
        ensure_account_tools_schema(connection)
        cur = connection.cursor(dictionary=True, buffered=True)
        ok, message = work(cur)
        connection.commit() if ok else connection.rollback()
        cur.close()
        return ok, message
    except Error as e:
        connection.rollback()
        print(f"help_requests: failed to close #{request_id}: {e}")
        return False, "Could not update the request."
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Admin: Reset password (temporary password, shown once)
# ------------------------------------------------------------------
def generate_temp_password(length=TEMP_PASSWORD_LENGTH):
    """Random password that always passes validators.PASSWORD_REGEX."""
    alphabet = string.ascii_letters + string.digits + TEMP_PASSWORD_SYMBOLS
    while True:
        chars = [secrets.choice(string.ascii_uppercase), secrets.choice(string.ascii_lowercase),
                 secrets.choice(string.digits), secrets.choice(TEMP_PASSWORD_SYMBOLS)]
        chars += [secrets.choice(alphabet) for _ in range(length - len(chars))]
        secrets.SystemRandom().shuffle(chars)
        password = "".join(chars)
        if PASSWORD_REGEX.match(password):
            return password


def admin_reset_password(request_id, admin_id, ip_address=None):
    """
    Help request -> temporary password for its STAFF account.
    Returns (success, message, temp_password or None). The password is
    never stored or logged - only its hash.
    """
    connection = get_db_connection()
    if connection is None:
        return False, "Could not reach the database.", None
    try:
        ensure_account_tools_schema(connection)
        cursor = connection.cursor(dictionary=True, buffered=True)
        request = _request_account(cursor, request_id)
        if request is None:
            return False, "Help request not found.", None
        acc_id = request["acc_id"]
        if not acc_id:
            return False, "This request doesn't match any staff account, so there is nothing to reset.", None
        if acc_id == admin_id:
            return False, "You can't reset your own password here - use Change Password.", None
        cursor.execute(
            """SELECT a.acc_id, a.username, a.is_deleted, ut.u_type AS role
               FROM account_tbl a JOIN usertype_tbl ut ON ut.ut_id = a.u_type
               WHERE a.acc_id = %s FOR UPDATE""",
            (acc_id,)
        )
        account = cursor.fetchone()
        if account is None or account.get("role") not in STAFF_ROLES:
            connection.rollback()
            return False, "Only staff passwords can be reset here.", None
        if account.get("is_deleted"):
            connection.rollback()
            return False, "This account is archived - restore it first.", None

        temp_password = generate_temp_password()
        cursor.execute(
            """UPDATE account_tbl
               SET password = %s, must_change_password = 1, failed_attempts = 0, lockout_until = NULL
               WHERE acc_id = %s""",
            (generate_password_hash(temp_password), acc_id)
        )
        log_action(cursor, "password_reset", acc_id, admin_id,
                   f"Temporary password from help request #{request_id}", ip_address)
        close_help_request(request_id, admin_id, "password_reset", ip_address, cursor=cursor)
        connection.commit()
        cursor.close()
    except Error as e:
        connection.rollback()
        print(f"help_requests: failed to reset the password for request #{request_id}: {e}")
        return False, "Could not reset the password - nothing was changed.", None
    finally:
        if connection.is_connected():
            connection.close()

    # Sign out every device of that account (staff sessions also check the
    # password on each request - see admin_routes._require_admin_session).
    end_sessions_for_account(acc_id)
    try:
        from password_reset_logs import log_password_reset
        log_password_reset(acc_id)   # "Password Resets Today" on Login Logs
    except Exception as e:
        print(f"help_requests: could not add the password-reset log: {e}")
    return True, f"Temporary password for {account['username']} - shown only once.", temp_password


def admin_unlock_from_request(request_id, admin_id, ip_address=None):
    """Help request -> "Unlock now" (dashboard_cards.unlock_account), then closes it."""
    connection = get_db_connection()
    if connection is None:
        return False, "Could not reach the database."
    try:
        ensure_account_tools_schema(connection)
        cursor = connection.cursor(dictionary=True, buffered=True)
        request = _request_account(cursor, request_id)
        cursor.close()
    finally:
        if connection.is_connected():
            connection.close()
    if request is None:
        return False, "Help request not found."
    if not request["acc_id"]:
        return False, "This request doesn't match any staff account."

    from dashboard_cards import unlock_account
    unlocked, message = unlock_account(request["acc_id"], admin_id, ip_address)
    if unlocked:
        from account_tools import log_action_standalone
        log_action_standalone("unlock", request["acc_id"], admin_id, f"From help request #{request_id}", ip_address)
        close_help_request(request_id, admin_id, "unlocked", ip_address)
    return unlocked, message
