"""
session_tracker.py - Live "Active Sessions" Tracking
------------------------------------------------------
Tracks CURRENTLY logged-in sessions (Admin + Learner), separate from
login_logs_tbl (an append-only history of every attempt). A row here
means "this account has an open session right now" and is removed the
moment that session ends or goes stale - this is what the "Active
Sessions" metric counts, never login/logout history.

    active_sessions_tbl
    --------------------
    session_id     INT AUTO_INCREMENT PRIMARY KEY
    acc_id         VARCHAR(15) NOT NULL
    session_token  VARCHAR(64) NOT NULL UNIQUE
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    last_seen_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP

USAGE
    - login.py:  create_session(acc_id) on successful login (Admin or
                 Learner), store the returned token in Flask session[].
    - login.py:  end_session(token) on the Learner /logout route.
    - admin_routes.py: end_session(token) on admin_logout().
    - admin_routes.py: touch_session(token) on every authenticated admin
                 request (keeps a session "warm" while actively browsing
                 so it isn't swept as stale mid-use).
    - admin_routes.py: get_active_session_count(connection) backs the
                 "Active Sessions" metric card.

Table is created lazily (IF NOT EXISTS) on first use, matching the
pattern already used by password_reset_logs.py - no manual migration
step required.
"""

import os
import secrets
from mysql.connector import Error
from cobradb import get_db_connection

ACTIVE_SESSIONS_TABLE = "active_sessions_tbl"

# How long a session can go "untouched" before it's considered stale and
# swept out (covers crashed tabs / browsers closed without hitting
# /logout). Configurable the same way ACCOUNT_INACTIVITY_MINUTES is in
# account_status.py.
SESSION_TIMEOUT_MINUTES_DEFAULT = 30

_table_ensured = False


def _get_timeout_minutes():
    """
    Reads the configurable session-timeout threshold (in minutes) from
    the environment every call (not cached at import time), same
    convention as account_status.py's _get_inactivity_minutes().
    """
    raw = os.environ.get("SESSION_TIMEOUT_MINUTES")
    if raw is None or raw.strip() == "":
        return SESSION_TIMEOUT_MINUTES_DEFAULT
    try:
        minutes = float(raw)
        return minutes if minutes > 0 else SESSION_TIMEOUT_MINUTES_DEFAULT
    except (TypeError, ValueError):
        return SESSION_TIMEOUT_MINUTES_DEFAULT


def _ensure_table(connection):
    """
    Creates active_sessions_tbl if it doesn't already exist. Gated
    behind the module-level flag so it only actually round-trips to the
    database once per process lifetime.
    """
    global _table_ensured
    if _table_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {ACTIVE_SESSIONS_TABLE} (
                session_id INT AUTO_INCREMENT PRIMARY KEY,
                acc_id VARCHAR(15) NOT NULL,
                session_token VARCHAR(64) NOT NULL UNIQUE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP
            )
            """
        )
        connection.commit()
        cursor.close()
        _table_ensured = True
    except Error as e:
        print(f"session_tracker: failed to ensure table exists: {e}")


def create_session(acc_id):
    """
    Opens a new active-session row for acc_id and returns a random
    session token to store in Flask's server-side session[] (e.g.
    session["session_token"] = token).

    Any pre-existing row for this same acc_id is deleted first, so a
    fresh login always supersedes a stale/duplicate row left behind by
    a previous crashed browser tab - each account only ever occupies at
    most one row here at a time.

    Returns the token (str), or None if the session couldn't be
    created (DB unreachable). A None return should NOT block the login
    itself - session tracking is a metrics nicety, never a login gate.
    """
    connection = None
    try:
        connection = get_db_connection()
        if connection is None:
            print("session_tracker: could not connect to database, skipping session creation.")
            return None

        _ensure_table(connection)
        cursor = connection.cursor()

        cursor.execute(f"DELETE FROM {ACTIVE_SESSIONS_TABLE} WHERE acc_id = %s", (acc_id,))

        token = secrets.token_hex(32)
        cursor.execute(
            f"INSERT INTO {ACTIVE_SESSIONS_TABLE} (acc_id, session_token) VALUES (%s, %s)",
            (acc_id, token)
        )
        connection.commit()
        cursor.close()
        return token

    except Error as e:
        print(f"session_tracker: failed to create session: {e}")
        return None
    finally:
        if connection is not None and connection.is_connected():
            connection.close()


def end_session(token):
    """
    Removes a session row on logout (Admin or Learner). Safe no-op if
    token is falsy or doesn't match any row (e.g. already expired/swept).
    Never raises - a logout must always succeed client-side regardless
    of whether this cleanup step works.
    """
    if not token:
        return
    connection = None
    try:
        connection = get_db_connection()
        if connection is None:
            return
        _ensure_table(connection)
        cursor = connection.cursor()
        cursor.execute(f"DELETE FROM {ACTIVE_SESSIONS_TABLE} WHERE session_token = %s", (token,))
        connection.commit()
        cursor.close()
    except Error as e:
        print(f"session_tracker: failed to end session: {e}")
    finally:
        if connection is not None and connection.is_connected():
            connection.close()


def touch_session(token):
    """
    Bumps last_seen_at for an in-use session, so an admin actively
    browsing the dashboard doesn't get swept as "stale" by
    sweep_expired_sessions() mid-use. Call this on every authenticated
    request (see admin_routes.py's before_request guard).
    """
    if not token:
        return
    connection = None
    try:
        connection = get_db_connection()
        if connection is None:
            return
        _ensure_table(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"UPDATE {ACTIVE_SESSIONS_TABLE} SET last_seen_at = NOW() WHERE session_token = %s",
            (token,)
        )
        connection.commit()
        cursor.close()
    except Error as e:
        print(f"session_tracker: failed to touch session: {e}")
    finally:
        if connection is not None and connection.is_connected():
            connection.close()


def sweep_expired_sessions(connection):
    """
    Deletes any session row whose last_seen_at has exceeded the
    configurable SESSION_TIMEOUT_MINUTES threshold - this is what
    handles "session expired" (browser closed without a real /logout
    call) without needing a background job: it's swept lazily, the
    next time anyone asks for the active session count.

    Reuses the caller's connection (like account_status.py's
    refresh_inactive_accounts). Best-effort - errors are caught and
    logged, never raised.
    """
    timeout_minutes = _get_timeout_minutes()
    try:
        _ensure_table(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"""DELETE FROM {ACTIVE_SESSIONS_TABLE}
                WHERE TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) > %s""",
            (timeout_minutes * 60,)
        )
        connection.commit()
        cursor.close()
    except Error as e:
        print(f"session_tracker: failed to sweep expired sessions: {e}")


def get_active_session_count(connection):
    """
    Backs the "Active Sessions" metric card. Sweeps stale sessions
    first (so a crashed/abandoned tab doesn't inflate the count),
    then returns COUNT(*) of whatever active_sessions_tbl rows remain -
    i.e. every account (Admin or Learner) currently logged in right
    now, never derived from login_logs_tbl history.

    Returns 0 (never raises) on any database error.
    """
    try:
        sweep_expired_sessions(connection)
        _ensure_table(connection)
        cursor = connection.cursor()
        cursor.execute(f"SELECT COUNT(*) FROM {ACTIVE_SESSIONS_TABLE}")
        row = cursor.fetchone()
        cursor.close()
        return int(row[0]) if row and row[0] is not None else 0
    except Error as e:
        print(f"session_tracker: failed to count active sessions: {e}")
        return 0