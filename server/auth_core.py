"""
auth_core.py - Shared sign-in + password-reset logic (feat/admin-login-page)
-----------------------------------------------------------------------------
ONE copy of the login rules, used by both doors:

    Learner login  (/login, login.py)           portal = "learner"
    Staff login    (/admin/login, admin_routes)  portal = "admin"

Moved here unchanged from login.py's /login + /forgot-password routes:
inactivity sweep, 5-try lockout (1 minute), login logs, lockout logs,
active-session row, archived-account message, password rules, reset
logs. The only new part is WHICH ROLE each door lets in:

    Staff door, learner account (or unknown username)
        -> the generic "Invalid username or password." (401).
           Checked BEFORE the password, so the staff page never reveals
           whether a learner password was right or a learner is locked.
    Learner door, staff account (Admin or Mentor)
        -> only after the password is correct: 403 "Staff accounts sign
           in at the staff login page." + admin_login_url. A wrong
           password counts toward the lockout as usual; a right password
           at the wrong door does NOT, and it is logged as Failed.

feat/mentor-role: the staff door ("admin" portal) lets in BOTH Admin and
Mentor accounts. Roles are matched by usertype_tbl.u_type NAME (see
user_types.py) - the Mentor ut_id is never hardcoded.

Password reset is role-scoped the same way, and (fix) resetting now
requires a verified code: /verify-otp marks the code verified, and
/reset-password refuses without that - before, anyone could POST a
new password for any email and skip the code entirely.

This file never touches Flask's request/session objects: the routes
pass the IP in and set the session from the returned values.
"""

import time
from datetime import datetime

from mysql.connector import Error
from werkzeug.security import check_password_hash, generate_password_hash

from cobradb import get_db_connection
from api import generate_otp, send_email
from login_logs import log_login_attempt
from lockout_logs import log_lockout_event
from password_reset_logs import log_password_reset
from account_status import refresh_inactive_accounts, is_account_inactive
from session_tracker import create_session
from validators import PASSWORD_REGEX
from user_types import ensure_mentor_user_type, ADMIN_ROLE, LEARNER_ROLE, STAFF_ROLES

ACCOUNT_TABLE = "account_tbl"
USERTYPE_TABLE = "usertype_tbl"

# Role names each door accepts (matched against usertype_tbl.u_type).
PORTAL_ROLES = {"learner": (LEARNER_ROLE,), "admin": STAFF_ROLES}

LEARNER_LOGIN_URL = "/login"
ADMIN_LOGIN_URL = "/admin/login"
LEARNER_HOME_URL = "/dashboard"
ADMIN_HOME_URL = "/admin/dashboard"

MAX_FAILED_ATTEMPTS = 5
OTP_TTL_SECONDS = 5 * 60         # matches the pages' 5:00 timers
RESET_WINDOW_SECONDS = 5 * 60    # time to type the new password after verifying the code

ARCHIVED_ACCOUNT_MESSAGE = "This account has been archived. Please contact an administrator."
INVALID_LOGIN_MESSAGE = "Invalid username or password."
ADMIN_ELSEWHERE_MESSAGE = "Staff accounts sign in at the staff login page."
PASSWORD_RULE_MESSAGE = (
    "Password must be at least 8 characters long and include an uppercase letter, "
    "lowercase letter, number, and special character."
)

# In-memory OTP store, shared by sign-up (login.py) and both reset flows:
# { key: {"otp": "123456", "expires_at": 1234567890.0, "verified": bool} }
otp_storage = {}


def _portal(portal):
    return portal if portal in PORTAL_ROLES else "learner"


# ============================================================
# SIGN IN
# ============================================================
def authenticate(username, password, portal, ip_address):
    """
    Returns (payload: dict, status_code: int, login: dict | None).
    `login` is only set on success: {"acc_id", "u_type", "role",
    "is_admin", "is_staff", "session_token"} - the route stores the
    acc_id in Flask's session (never the role).
    """
    portal = _portal(portal)
    username = (username or "").strip().lower()
    password = (password or "").strip()

    if not username or not password:
        return {"success": False, "message": "Please enter both username and password."}, 400, None

    connection = get_db_connection()
    if connection is None:
        return {"success": False, "message": "Could not connect to database."}, 500, None

    # Inactivity sweep for every account (best-effort, see account_status.py)
    refresh_inactive_accounts(connection)
    ensure_mentor_user_type(connection)

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT a.acc_id, a.password, a.status, a.last_login, a.failed_attempts,
                       a.lockout_until, a.is_deleted, a.u_type, ut.u_type AS role
                FROM {ACCOUNT_TABLE} a
                LEFT JOIN {USERTYPE_TABLE} ut ON a.u_type = ut.ut_id
                WHERE a.username = %s""",
            (username,)
        )
        account = cursor.fetchone()

        if not account:
            cursor.close()
            log_login_attempt(acc_id=None, ip_address=ip_address, attempt_status="Failed")
            return {"success": False, "message": INVALID_LOGIN_MESSAGE}, 401, None

        role = account.get("role")
        is_staff = role in STAFF_ROLES
        is_admin = role == ADMIN_ROLE

        # Staff door: a learner account looks exactly like an unknown username.
        if portal == "admin" and not is_staff:
            cursor.close()
            log_login_attempt(acc_id=account["acc_id"], ip_address=ip_address, attempt_status="Failed")
            return {"success": False, "message": INVALID_LOGIN_MESSAGE}, 401, None

        if account.get("is_deleted"):
            cursor.close()
            log_login_attempt(acc_id=account["acc_id"], ip_address=ip_address, attempt_status="Failed")
            return {"success": False, "message": ARCHIVED_ACCOUNT_MESSAGE}, 403, None

        if is_account_inactive(account.get("last_login")):
            account["status"] = "Inactive"

        # Lockout finished -> clear it
        lockout_until = account.get("lockout_until")
        if lockout_until and datetime.now() >= lockout_until:
            cursor.execute(
                f"UPDATE {ACCOUNT_TABLE} SET failed_attempts = 0, lockout_until = NULL WHERE acc_id = %s",
                (account["acc_id"],)
            )
            connection.commit()
            account["failed_attempts"] = 0
            lockout_until = None

        # Still locked
        if lockout_until and datetime.now() < lockout_until:
            cursor.close()
            remaining = int((lockout_until - datetime.now()).total_seconds())
            log_login_attempt(acc_id=account["acc_id"], ip_address=ip_address, attempt_status="Failed")
            return {
                "success": False,
                "message": "Too many failed attempts. Please try again in 1 minute.",
                "remaining_seconds": max(1, remaining),
            }, 423, None

        # Wrong password
        if not check_password_hash(account["password"], password):
            failed_attempts = (account.get("failed_attempts") or 0) + 1
            log_login_attempt(acc_id=account["acc_id"], ip_address=ip_address, attempt_status="Failed")

            if failed_attempts >= MAX_FAILED_ATTEMPTS:
                cursor.execute(
                    f"""UPDATE {ACCOUNT_TABLE}
                        SET failed_attempts = %s, lockout_until = DATE_ADD(NOW(), INTERVAL 1 MINUTE)
                        WHERE acc_id = %s""",
                    (failed_attempts, account["acc_id"])
                )
                connection.commit()
                cursor.close()
                log_lockout_event(acc_id=account["acc_id"])
                return {
                    "success": False,
                    "message": "Too many failed attempts. Please try again in 1 minute.",
                    "remaining_seconds": 60,
                }, 423, None

            cursor.execute(
                f"UPDATE {ACCOUNT_TABLE} SET failed_attempts = %s WHERE acc_id = %s",
                (failed_attempts, account["acc_id"])
            )
            connection.commit()
            cursor.close()
            return {
                "success": False,
                "message": f"Incorrect password. {MAX_FAILED_ATTEMPTS - failed_attempts} attempt(s) remaining.",
            }, 401, None

        # Right password, wrong door (learner page, staff account).
        # Not a failed attempt (no lockout count), but no session either.
        if portal == "learner" and is_staff:
            cursor.close()
            log_login_attempt(acc_id=account["acc_id"], ip_address=ip_address, attempt_status="Failed")
            return {
                "success": False,
                "message": ADMIN_ELSEWHERE_MESSAGE,
                "admin_login_url": ADMIN_LOGIN_URL,
            }, 403, None

        # Success: the ONLY place status goes back to 'Active'
        cursor.execute(
            f"""UPDATE {ACCOUNT_TABLE}
                SET failed_attempts = 0, lockout_until = NULL, last_login = NOW(), status = 'Active'
                WHERE acc_id = %s""",
            (account["acc_id"],)
        )
        connection.commit()
        cursor.close()
        log_login_attempt(acc_id=account["acc_id"], ip_address=ip_address, attempt_status="Success")

        session_token = create_session(account["acc_id"])  # None on a DB hiccup - never blocks login
        return {
            "success": True,
            "message": "Login successful. Redirecting...",
            "acc_id": account["acc_id"],
            "u_type": account["u_type"],
            "role": role or LEARNER_ROLE,
            # Staff: the staff login page sends each role to its own home
            # (admin_routes.admin_login_submit fills in the exact URL).
            "redirect": ADMIN_HOME_URL if is_admin else (ADMIN_LOGIN_URL if is_staff else LEARNER_HOME_URL),
        }, 200, {
            "acc_id": account["acc_id"],
            "u_type": account["u_type"],
            "role": role,
            "is_admin": is_admin,
            "is_staff": is_staff,
            "session_token": session_token,
        }

    except Error as e:
        return {"success": False, "message": f"Database error: {str(e)}"}, 500, None
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# FORGOT PASSWORD (role-scoped: each door resets its own accounts)
# ============================================================
def _reset_key(portal, email):
    return f"forgot_{portal}_{email}"


def _find_account_by_email(email):
    """(row dict | None, error payload | None)"""
    connection = get_db_connection()
    if connection is None:
        return None, ({"success": False, "message": "Could not connect to database."}, 500)
    try:
        cursor = connection.cursor(dictionary=True)
        ensure_mentor_user_type(connection)
        cursor.execute(
            f"""SELECT a.acc_id, a.password, a.is_deleted, a.u_type, ut.u_type AS role
                FROM {ACCOUNT_TABLE} a
                LEFT JOIN {USERTYPE_TABLE} ut ON a.u_type = ut.ut_id
                WHERE a.email = %s""",
            (email,)
        )
        row = cursor.fetchone()
        cursor.close()
        return row, None
    except Error as e:
        return None, ({"success": False, "message": f"Database error: {str(e)}"}, 500)
    finally:
        if connection.is_connected():
            connection.close()


def send_reset_code(email, portal):
    """Returns (payload, status)."""
    portal = _portal(portal)
    email = (email or "").strip().lower()
    if not email:
        return {"success": False, "message": "Please enter your email address."}, 400

    account, err = _find_account_by_email(email)
    if err:
        return err

    wanted = PORTAL_ROLES[portal]
    if portal == "admin":
        # Staff door: learner emails look the same as unknown ones.
        if not account or account.get("role") not in wanted:
            return {"success": False, "message": "No staff account found with this email address."}, 404
    else:
        if not account:
            # 404 -> the learner page offers "Sign up with this email"
            return {"success": False, "message": "No account found with this email address."}, 404
        if account.get("role") not in wanted:
            return {"success": False, "message": "Staff accounts reset their password from the staff login page.",
                    "admin_login_url": ADMIN_LOGIN_URL}, 403

    if account.get("is_deleted"):
        return {"success": False, "message": ARCHIVED_ACCOUNT_MESSAGE}, 403

    otp_code = generate_otp()
    otp_storage[_reset_key(portal, email)] = {
        "otp": otp_code,
        "expires_at": time.time() + OTP_TTL_SECONDS,
        "verified": False,
    }
    sent = send_email(
        to_email=email,
        subject="CobraByte - Password Reset Code",
        body_text=f"Your 6-digit password reset code is: {otp_code}\nThis code expires in 5 minutes."
    )
    if sent:
        return {"success": True, "message": "Reset code sent to your email."}, 200
    return {"success": False, "message": "Failed to send email. Please try again."}, 500


def verify_reset_code(email, otp, portal):
    """Returns (payload, status). On success the code is marked verified."""
    portal = _portal(portal)
    email = (email or "").strip().lower()
    otp = (otp or "").strip()
    if not email or not otp:
        return {"success": False, "message": "Email and OTP code are required."}, 400

    key = _reset_key(portal, email)
    record = otp_storage.get(key)
    if not record:
        return {"success": False, "message": "No verification code found. Please request a new code."}, 400
    if time.time() > record["expires_at"]:
        otp_storage.pop(key, None)
        return {"success": False, "message": "Verification code has expired. Please click 'Resend code'."}, 400
    if record["otp"] != otp:
        return {"success": False, "message": "Invalid verification code."}, 400

    record["verified"] = True
    record["expires_at"] = time.time() + RESET_WINDOW_SECONDS
    return {"success": True, "message": "OTP verified successfully."}, 200


def reset_password(email, new_password, confirm_password, portal, via="forgot"):
    """Returns (payload, status). Needs a code verified by verify_reset_code()."""
    portal = _portal(portal)
    email = (email or "").strip().lower()
    new_password = (new_password or "").strip()
    confirm_password = (confirm_password or "").strip()

    if not email or not new_password or not confirm_password:
        return {"success": False, "message": "All fields are required."}, 400
    if new_password != confirm_password:
        return {"success": False, "message": "Passwords do not match."}, 400
    if not PASSWORD_REGEX.match(new_password):
        return {"success": False, "message": PASSWORD_RULE_MESSAGE}, 400

    key = _reset_key(portal, email)
    record = otp_storage.get(key)
    if not record or not record.get("verified") or time.time() > record["expires_at"]:
        otp_storage.pop(key, None)
        return {"success": False, "message": "Your reset session expired. Please start again from Forgot password."}, 400

    connection = get_db_connection()
    if connection is None:
        return {"success": False, "message": "Could not connect to database."}, 500

    try:
        cursor = connection.cursor(dictionary=True)
        roles = PORTAL_ROLES[portal]
        placeholders = ", ".join(["%s"] * len(roles))
        cursor.execute(
            f"""SELECT a.acc_id, a.password
                FROM {ACCOUNT_TABLE} a
                JOIN {USERTYPE_TABLE} ut ON a.u_type = ut.ut_id
                WHERE a.email = %s AND ut.u_type IN ({placeholders})
                  AND (a.is_deleted = 0 OR a.is_deleted IS NULL)""",
            (email, *roles)
        )
        account = cursor.fetchone()
        if not account:
            cursor.close()
            return {"success": False, "message": "Account not found."}, 404

        if check_password_hash(account["password"], new_password):
            cursor.close()
            return {"success": False, "message": "Your new password cannot be the same as your old password."}, 400

        cursor.execute(
            f"""UPDATE {ACCOUNT_TABLE}
                SET password = %s, failed_attempts = 0, lockout_until = NULL
                WHERE acc_id = %s""",
            (generate_password_hash(new_password), account["acc_id"])
        )
        if portal == "learner":
            # learner bell: via="change" = Profile > Change Password, else Forgot Password
            from notifications import notify
            if via == "change":
                notify(cursor, account["acc_id"], "security", "Your **password was changed**",
                       "Changed from your profile. If this wasn't you, reset your password right away.",
                       "/profile/change-password")
            else:
                notify(cursor, account["acc_id"], "security", "Your password was reset with **Forgot password**",
                       "A code sent to your email was used. If this wasn't you, change your password now.",
                       "/profile/change-password")
        connection.commit()
        cursor.close()

        otp_storage.pop(key, None)
        log_password_reset(acc_id=account["acc_id"])  # best-effort
        return {"success": True, "message": "Password updated successfully."}, 200

    except Error as e:
        connection.rollback()
        return {"success": False, "message": f"Database error: {str(e)}"}, 500
    finally:
        if connection.is_connected():
            connection.close()