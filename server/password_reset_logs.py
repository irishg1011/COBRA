"""
password_reset_logs.py - Password Reset Activity Logging
------------------------------------------------------------
Mirrors login_logs.py's pattern: a single reusable helper for recording
every successful password reset.

WHY THIS EXISTS
account_tbl only ever stores the CURRENT password hash - there is no
column tracking when it last changed. The Admin > Login Logs page's
"Password Resets Today" metric card needs a real, timestamped event to
count against, so that count cannot be derived from account_tbl alone.
This file gives password resets the same kind of append-only log
login_logs.py already gives login attempts.

Logging is intentionally isolated here so login.py's
forgot_password_reset() route only has to call log_password_reset() and
never touches logging SQL directly. Logging a reset must never break the
reset flow - any database error here is caught, printed to the server
console, and swallowed, exactly like log_login_attempt().
"""

from mysql.connector import Error
from cobradb import get_db_connection

PASSWORD_RESET_LOGS_TABLE = "password_reset_logs_tbl"

# Guards against re-issuing "CREATE TABLE IF NOT EXISTS" on every single
# call. The table only needs to be ensured once per running process, not
# once per password reset and not once per metrics read - this keeps the
# hot paths (a reset, or a Login Logs page/metrics load) down to the one
# query they actually need.
_table_ensured = False


def _ensure_table(connection):
    """
    Creates password_reset_logs_tbl if it doesn't already exist. Safe to
    call repeatedly (IF NOT EXISTS), but gated behind the module-level
    flag above so it only actually round-trips to the database once per
    process lifetime.
    """
    global _table_ensured
    if _table_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {PASSWORD_RESET_LOGS_TABLE} (
                reset_id INT AUTO_INCREMENT PRIMARY KEY,
                acc_id VARCHAR(15) NULL,
                reset_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()
        cursor.close()
        _table_ensured = True
    except Error as e:
        print(f"password_reset_logs: failed to ensure table exists: {e}")


def log_password_reset(acc_id):
    """
    Insert a single password-reset event.

    Opens and closes its own connection (same convention as
    login_logs.log_login_attempt) so it never interferes with the
    caller's own connection/transaction in login.py.

    Args:
        acc_id (str | None): the account whose password was reset.

    Any failure is caught and logged to console only; it never raises
    back to the caller - a logging hiccup must never block a password
    reset that otherwise succeeded.
    """
    connection = None
    try:
        connection = get_db_connection()
        if connection is None:
            print("password_reset_logs: could not connect to database, skipping log entry.")
            return

        _ensure_table(connection)

        cursor = connection.cursor()
        cursor.execute(
            f"INSERT INTO {PASSWORD_RESET_LOGS_TABLE} (acc_id) VALUES (%s)",
            (acc_id,)
        )
        connection.commit()
        cursor.close()

    except Error as e:
        print(f"password_reset_logs: failed to record password reset: {e}")

    finally:
        if connection is not None and connection.is_connected():
            connection.close()


def get_password_resets_today_count(connection):
    """
    Backs the "Password Resets Today" metric card - one COUNT(*) query
    scoped to today (server-local date, via CURDATE()).

    Reuses the CALLER's connection (unlike log_password_reset above) so
    admin_routes.py can fold this into the same connection it already
    has open for the rest of the Login Logs metrics, instead of opening
    a second one.

    Returns 0 (never raises) if the table doesn't exist yet - i.e. no
    reset has ever happened - or on any other database error.
    """
    try:
        _ensure_table(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT COUNT(*) FROM {PASSWORD_RESET_LOGS_TABLE} WHERE DATE(reset_at) = CURDATE()"
        )
        row = cursor.fetchone()
        cursor.close()
        return int(row[0]) if row and row[0] is not None else 0
    except Error as e:
        print(f"password_reset_logs: failed to count today's resets: {e}")
        return 0