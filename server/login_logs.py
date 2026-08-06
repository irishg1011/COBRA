"""
login_logs.py - Login Attempt Logging
--------------------------------------
Reusable helper(s) for recording every login attempt (success or failure)
into login_logs_tbl. Logging is intentionally isolated here so login.py
only has to call log_login_attempt() and never touches logging SQL directly.

IMPORTANT: Logging must never break the login flow. Any database error
here is caught, printed to the server console, and swallowed - it is
never surfaced to the caller or the frontend.
"""

from mysql.connector import Error
from cobradb import get_db_connection  # reuse the shared connection helper

LOGIN_LOGS_TABLE = "login_logs_tbl"


def log_login_attempt(acc_id, ip_address, attempt_status):
    """
    Insert a single login attempt record.

    Args:
        acc_id (str | None): The account's acc_id, or None if the
            username did not match any account.
        ip_address (str): Client IP address (e.g. request.remote_addr).
        attempt_status (str): "Success" or "Failed".

    Notes:
        - attempted_at is NOT inserted here; the table's DEFAULT
          current_timestamp() handles it automatically.
        - This function opens and closes its own connection so it can be
          called safely without interfering with the caller's own
          transaction/connection in login.py.
        - Any failure is caught and logged to console only; it never
          raises back to the caller.
    """
    connection = None
    try:
        connection = get_db_connection()
        if connection is None:
            print("login_logs: could not connect to database, skipping log entry.")
            return

        cursor = connection.cursor()
        cursor.execute(
            f"""INSERT INTO {LOGIN_LOGS_TABLE} (acc_id, ip_address, attempt_status)
                VALUES (%s, %s, %s)""",
            (acc_id, ip_address, attempt_status)
        )
        connection.commit()
        cursor.close()

    except Error as e:
        # Logging must never prevent login - just report it and move on.
        print(f"login_logs: failed to record login attempt: {e}")

    finally:
        if connection is not None and connection.is_connected():
            connection.close()


def get_todays_login_metrics(connection):
    """
    Backs three of the Admin > Login Logs metric cards - "Total Logins
    Today", "Successful Logins", and "Failed Login Attempts" - in a
    SINGLE aggregate query instead of three separate COUNT(*) round
    trips, using conditional SUM() to split Success/Failed out of the
    same scan.

    Scoped to "today" via DATE(attempted_at) = CURDATE() - server-local
    date, matching the convention already used throughout this project
    (see account_status.py's TIMESTAMPDIFF/NOW() usage).

    Reuses the CALLER's connection (unlike log_login_attempt above,
    which intentionally opens its own) so admin_routes.py can fold this
    into the same connection it already has open for the rest of the
    Login Logs metrics, rather than opening a second one.

    Uses COALESCE(SUM(...), 0) so a day with zero attempts logged so far
    cleanly returns zeros instead of NULLs.

    Returns {"total_logins_today": int, "successful_logins": int,
    "failed_logins": int}. Never raises - returns all zeros on any
    database error.
    """
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""
            SELECT
                COUNT(*) AS total_logins_today,
                COALESCE(SUM(CASE WHEN attempt_status = 'Success' THEN 1 ELSE 0 END), 0) AS successful_logins,
                COALESCE(SUM(CASE WHEN attempt_status = 'Failed' THEN 1 ELSE 0 END), 0) AS failed_logins
            FROM {LOGIN_LOGS_TABLE}
            WHERE DATE(attempted_at) = CURDATE()
            """
        )
        row = cursor.fetchone()
        cursor.close()
        return {
            "total_logins_today": int(row[0] or 0),
            "successful_logins": int(row[1] or 0),
            "failed_logins": int(row[2] or 0),
        }
    except Error as e:
        print(f"login_logs: failed to compute today's login metrics: {e}")
        return {"total_logins_today": 0, "successful_logins": 0, "failed_logins": 0}