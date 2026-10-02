"""
staff_password.py - Change Password for staff (Admin + Mentor)
----------------------------------------------------------------
Behind the "Change Password" item in the staff header's profile
dropdown. The same 3 steps as the learner's Profile > Change Password
(send code -> enter code -> new password) and the SAME rules and codes:
every check lives in auth_core.py (send_reset_code / verify_reset_code /
reset_password, staff door), shared with the staff login page's Forgot
Password. Nothing about passwords is re-implemented here.

The only difference from Forgot Password: the email is never typed.
It is always the email of the LOGGED-IN account (the acc_id the caller
reads from the session), so a staff member can only change their own
password.

No Flask/session code here; admin_routes.py turns these into HTTP
responses. Every function returns (payload, http_status), except
get_masked_email().
"""

from mysql.connector import Error

from cobradb import get_db_connection
from auth_core import send_reset_code, verify_reset_code, reset_password

ACCOUNT_TABLE = "account_tbl"
STAFF_PORTAL = "admin"   # auth_core's staff door (Admin + Mentor accounts)

NOT_LOGGED_IN = ({"success": False, "message": "Please log in again."}, 401)


def _account_email(acc_id):
    """The logged-in account's email, or None (signed out, archived, DB down)."""
    if not acc_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT email FROM {ACCOUNT_TABLE}
                WHERE acc_id = %s AND (is_deleted = 0 OR is_deleted IS NULL)""",
            (acc_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        return row["email"] if row else None
    except Error as e:
        print(f"staff_password: could not load the email for {acc_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def mask_email(email):
    """'markgil@gmail.com' -> 'ma*****@gmail.com' (same masking as the learner page)."""
    name, _, domain = (email or "").partition("@")
    if not domain:
        return email
    shown = name[:2] if len(name) > 2 else name[:1]
    return f"{shown}{'*' * max(len(name) - len(shown), 3)}@{domain}"


def get_masked_email(acc_id):
    """For the page's first step. None when the email could not be loaded."""
    email = _account_email(acc_id)
    return mask_email(email) if email else None


def send_change_code(acc_id):
    """Step 1 (and Resend): a 6-digit code to the account's own email."""
    email = _account_email(acc_id)
    if not email:
        return NOT_LOGGED_IN
    payload, status = send_reset_code(email, STAFF_PORTAL)
    if payload.get("success"):
        payload["message"] = f"We sent a 6-digit code to {mask_email(email)}."
    return payload, status


def verify_change_code(acc_id, otp):
    """Step 2: check the code."""
    email = _account_email(acc_id)
    if not email:
        return NOT_LOGGED_IN
    return verify_reset_code(email, otp, STAFF_PORTAL)


def change_password(acc_id, new_password, confirm_password):
    """Step 3: save the new password (needs a code verified in step 2)."""
    email = _account_email(acc_id)
    if not email:
        return NOT_LOGGED_IN
    payload, status = reset_password(email, new_password, confirm_password, STAFF_PORTAL, via="change")
    if not payload.get("success") and "Forgot password" in (payload.get("message") or ""):
        payload["message"] = "Your code expired. Please send a new code and try again."
    return payload, status