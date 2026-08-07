"""
lockout_logs.py - Account Lockout EVENT Logging
--------------------------------------------------
Backs the "Locked Out Due to Fails" metric with a real, timestamped
event log, instead of account_tbl's current lockout_until column.

WHY THIS EXISTS
account_tbl.lockout_until only tells you whether an account HAPPENS TO
BE locked right now - it self-clears after 1 minute (see login.py) or
on the account's next successful login. That means it can never answer
"how many distinct accounts got locked at some point today, even ones
that are already unlocked again" - which is exactly what the metric
needs to show. This file gives lockouts the same kind of append-only
log login_logs.py already gives login attempts, and
password_reset_logs.py gives password resets.

    lockout_logs_tbl
    -----------------
    lockout_id  INT AUTO_INCREMENT PRIMARY KEY
    acc_id      VARCHAR(15) NOT NULL
    locked_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP

USAGE
    - login.py: log_lockout_event(acc_id) is called exactly once per
      lockout EVENT - i.e. the moment failed_attempts hits 5 and the
      account transitions into a locked state - never once per failed
      attempt, and never repeated while the account is already locked.
    - admin_routes.py: get_lockouts_today_count(connection) backs the
      "Locked Out Due to Fails" metric card, using COUNT(DISTINCT acc_id)
      scoped to today so:
        * the same account locked multiple times today still counts
          as 1,
        * an account locked today and later unlocked is still counted,
        * accounts locked on previous days are excluded entirely.

Table is created lazily (IF NOT EXISTS) on first use - no manual
migration step required, matching the rest of this project's
convention.
"""

from mysql.connector import Error
from cobradb import get_db_connection

LOCKOUT_LOGS_TABLE = "lockout_logs_tbl"

# Guards against re-issuing "CREATE TABLE IF NOT EXISTS" on every call -
# only needs to be ensured once per running process.
_table_ensured = False


def _ensure_table(connection):
    """
    Creates lockout_logs_tbl if it doesn't already exist. Safe to call
    repeatedly, but gated behind the module-level flag so it only
    actually round-trips to the database once per process lifetime.
    """
    global _table_ensured
    if _table_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {LOCKOUT_LOGS_TABLE} (
                lockout_id INT AUTO_INCREMENT PRIMARY KEY,
                acc_id VARCHAR(15) NOT NULL,
                locked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()
        cursor.close()
        _table_ensured = True
    except Error as e:
        print(f"lockout_logs: failed to ensure table exists: {e}")


def log_lockout_event(acc_id):
    """
    Insert a single lockout event record, timestamped by the database's
    own CURRENT_TIMESTAMP (never a value computed in Python), matching
    the convention used by log_login_attempt() and
    log_password_reset().

    Opens and closes its own connection so it never interferes with the
    caller's own connection/transaction in login.py (the lockout UPDATE
    to account_tbl happens on a separate connection/cursor there).

    Any failure is caught and logged to console only; it must never
    raise back to the caller or block the login flow that triggered the
    lockout.
    """
    connection = None
    try:
        connection = get_db_connection()
        if connection is None:
            print("lockout_logs: could not connect to database, skipping log entry.")
            return

        _ensure_table(connection)

        cursor = connection.cursor()
        cursor.execute(
            f"INSERT INTO {LOCKOUT_LOGS_TABLE} (acc_id) VALUES (%s)",
            (acc_id,)
        )
        connection.commit()
        cursor.close()

    except Error as e:
        print(f"lockout_logs: failed to record lockout event: {e}")

    finally:
        if connection is not None and connection.is_connected():
            connection.close()


def get_lockouts_today_count(connection):
    """
    Backs the "Locked Out Due to Fails" metric card - a single
    COUNT(DISTINCT acc_id) query scoped to today (server-local date,
    via CURDATE(), matching the rest of this project's date-scoping
    convention).

    Reuses the CALLER's connection (unlike log_lockout_event above,
    which intentionally opens its own) so admin_routes.py can fold this
    into the same connection it already has open for the rest of the
    Login Logs metrics, instead of opening a second one.

    DISTINCT is what guarantees the same account locked multiple times
    in one day is only ever counted once, per the task's requirement.

    Returns 0 (never raises) if the table doesn't exist yet - i.e. no
    lockout has ever happened - or on any other database error.
    """
    try:
        _ensure_table(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"""SELECT COUNT(DISTINCT acc_id) FROM {LOCKOUT_LOGS_TABLE}
                WHERE DATE(locked_at) = CURDATE()"""
        )
        row = cursor.fetchone()
        cursor.close()
        return int(row[0]) if row and row[0] is not None else 0
    except Error as e:
        print(f"lockout_logs: failed to count today's lockouts: {e}")
        return 0