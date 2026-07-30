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