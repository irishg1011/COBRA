"""
session_tracker.py - Live "Active Sessions" Tracking
------------------------------------------------------
Tracks CURRENTLY logged-in sessions (Admin + Learner), separate from
login_logs_tbl (an append-only history of every attempt). A row here
means "this account has an open session right now" and is removed the
moment that session ends or goes stale - this is what the "Active
Sessions" metric counts, never login/logout history.

ONE ROW PER SIGNED-IN BROWSER, not per account: the same account can be
signed in on a phone and a laptop at the same time, each with its own
session_token. Signing in on one device never signs out another. A row
goes away when that device logs out, when its account is archived
(end_sessions_for_account), or when it has been idle longer than
SESSION_TIMEOUT_MINUTES and a sweep runs.

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
    - login.py:  touch_session(token) about once a minute while a learner
                 is using the site (_keep_learner_session_alive), so an
                 active learner is never swept as stale.
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

    Other sessions of the same account are LEFT ALONE, so one account
    can be signed in on several devices at once (the newest login used
    to delete every older row, which signed the other device out in the
    middle of whatever it was doing). Only this account's rows that are
    already stale - idle longer than SESSION_TIMEOUT_MINUTES, e.g. a
    crashed tab or a browser closed without logging out - are cleared
    here, so dead rows do not pile up.

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

        cursor.execute(
            f"""DELETE FROM {ACTIVE_SESSIONS_TABLE}
                WHERE acc_id = %s
                  AND TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) > %s""",
            (acc_id, _get_timeout_minutes() * 60)
        )

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


def end_sessions_for_account(acc_id):
    """
    feat/archive-accounts: removes EVERY active-session row for acc_id
    (not just one token) - used right after an account is archived so it
    drops out of "Active Sessions" immediately. Same safety rules as
    end_session(): safe no-op for a falsy acc_id, never raises.
    """
    if not acc_id:
        return
    connection = None
    try:
        connection = get_db_connection()
        if connection is None:
            return
        _ensure_table(connection)
        cursor = connection.cursor()
        cursor.execute(f"DELETE FROM {ACTIVE_SESSIONS_TABLE} WHERE acc_id = %s", (acc_id,))
        connection.commit()
        cursor.close()
    except Error as e:
        print(f"session_tracker: failed to end sessions for {acc_id}: {e}")
    finally:
        if connection is not None and connection.is_connected():
            connection.close()


def touch_session(token, acc_id=None):
    """
    Bumps last_seen_at for an in-use session, so an admin actively
    browsing the dashboard doesn't get swept as "stale" by
    sweep_expired_sessions() mid-use. Call this on every authenticated
    request (see admin_routes.py's before_request guard).

    SELF-HEALING (bug fix): previously this only ran an UPDATE, which
    silently touched 0 rows if the session's row had already been swept
    (e.g. the admin left a page open that doesn't poll anything - not
    every admin page hits the backend every few seconds - past
    SESSION_TIMEOUT_MINUTES). Once that row was gone, the admin was
    STILL logged in (their Flask session cookie/session_token were
    untouched) but get_active_session_count() would never count them
    again until a full logout+login - so "Active Sessions" quietly
    undercounted logged-in admins.

    Now, when acc_id is provided, this does an upsert: if a row for this
    exact session_token still exists, it's just refreshed (unchanged
    behavior); if it's missing, it's recreated with the SAME token the
    browser already holds, so the very next request after a stale sweep
    makes the admin visible in the active count again - no re-login
    needed. acc_id is optional (defaults to update-only) so any other
    caller that doesn't have it handy keeps the original behavior.
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
        if acc_id:
            cursor.execute(
                f"""INSERT INTO {ACTIVE_SESSIONS_TABLE} (acc_id, session_token)
                    VALUES (%s, %s)
                    ON DUPLICATE KEY UPDATE last_seen_at = NOW()""",
                (acc_id, token)
            )
        else:
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
    then counts the ACCOUNTS that still have a row in
    active_sessions_tbl - i.e. every account (Admin or Learner)
    currently logged in right now, never derived from login_logs_tbl
    history. An account signed in on two devices has two rows but is
    still one account, so it is counted once (COUNT(DISTINCT acc_id)).

    Returns 0 (never raises) on any database error.
    """
    try:
        sweep_expired_sessions(connection)
        _ensure_table(connection)
        cursor = connection.cursor()
        cursor.execute(f"SELECT COUNT(DISTINCT acc_id) FROM {ACTIVE_SESSIONS_TABLE}")
        row = cursor.fetchone()
        cursor.close()
        return int(row[0]) if row and row[0] is not None else 0
    except Error as e:
        print(f"session_tracker: failed to count active sessions: {e}")
        return 0