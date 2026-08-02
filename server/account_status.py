"""
account_status.py - Centralized Account Inactivity Status Logic
-----------------------------------------------------------------
Single source of truth for automatically flipping account_tbl.status
between "Active" and "Inactive", based ONLY on account_tbl.last_login
(no schema changes, no new tables/columns - matches the task spec).

WHY THIS EXISTS
Before this file, the "has this account gone stale?" comparison lived
inline inside login.py's /login route and only ever ran for the ONE
account currently attempting to log in - so (a) it used day-granularity
(datetime.days), which can't be tested at "1 minute" like the spec
requires, and (b) other accounts never got re-evaluated until THEY
happened to log in, meaning the Admin > Account & Security page could
show a stale "Active" badge indefinitely for an account nobody has
logged into recently. Centralizing it here means:
    - the comparison logic (and its configurable threshold) is written
      exactly once, so login.py and admin_routes.py can never drift out
      of sync with each other, and
    - both callers can proactively sweep the WHOLE table, not just one
      row, keeping the Admin page's displayed status trustworthy even
      for accounts that haven't touched login recently.

CONFIGURABLE THRESHOLD (never hardcoded in the comparison logic itself)
Controlled by the ACCOUNT_INACTIVITY_MINUTES environment variable,
falling back to ACCOUNT_INACTIVITY_MINUTES_DEFAULT if unset/invalid.
This is the same style already used elsewhere in this project for
configurable-via-env values (see login.py's app.secret_key). To change
the policy app-wide, set the env var - nothing in this file or its
callers needs to change:

    ACCOUNT_INACTIVITY_MINUTES=1        # development / testing (spec's example)
    ACCOUNT_INACTIVITY_MINUTES=43200    # production: 30 days (30 * 24 * 60)

SCOPE
Only account_tbl.status and account_tbl.last_login are read/written
here. No new tables, no new columns, no schema migration.
"""

import os
from datetime import datetime
from mysql.connector import Error

ACCOUNT_TABLE = "account_tbl"

# ------------------------------------------------------------
# CONFIGURABLE THRESHOLD (minutes)
# ------------------------------------------------------------
# Kept small by default so a fresh checkout "just works" for testing per
# the spec's own example ("For testing: 1 minute"). Override via env var
# in production, e.g. ACCOUNT_INACTIVITY_MINUTES=43200 for 30 days.
ACCOUNT_INACTIVITY_MINUTES_DEFAULT = 1


def _get_inactivity_minutes():
    """
    Reads the configurable inactivity threshold (in minutes) from the
    environment EVERY time it's called (not cached at import time), so
    changing the env var takes effect immediately without restarting
    anything else in the request lifecycle. Falls back to the safe
    default if the env var is missing, blank, or not a valid number.
    """
    raw = os.environ.get("ACCOUNT_INACTIVITY_MINUTES")
    if raw is None or raw.strip() == "":
        return ACCOUNT_INACTIVITY_MINUTES_DEFAULT
    try:
        minutes = float(raw)
        return minutes if minutes > 0 else ACCOUNT_INACTIVITY_MINUTES_DEFAULT
    except (TypeError, ValueError):
        return ACCOUNT_INACTIVITY_MINUTES_DEFAULT


def is_account_inactive(last_login, now=None):
    """
    Reusable, pure comparison helper (no DB access) - given a single
    account's last_login (a datetime, or None), returns True if it has
    exceeded the configurable inactivity threshold.

        elapsed = now - last_login
        return elapsed > threshold

    Notes:
      - last_login is None (account has never logged in) -> returns
        False. A brand-new signup already starts as 'Active' (see
        login.py's signup INSERT) and hasn't had a chance to log in yet -
        that's a different situation from an account that WAS active and
        has since gone stale, so this function intentionally does not
        flag it.
      - `now` can be injected (e.g. in a unit test) to check the logic
        deterministically instead of depending on wall-clock time.

    This function is not required by the bulk sweep below (that does the
    comparison in SQL for efficiency), but it's kept here as the
    single readable definition of "what counts as inactive" for any
    other caller (tests, a future single-account check, etc.) that needs
    it without touching the database.
    """
    if last_login is None:
        return False
    now = now or datetime.now()
    elapsed_seconds = (now - last_login).total_seconds()
    threshold_seconds = _get_inactivity_minutes() * 60
    return elapsed_seconds > threshold_seconds


def refresh_inactive_accounts(connection):
    """
    Bulk sweep: in ONE UPDATE statement, flips every account whose
    last_login has exceeded the configurable threshold to
    status = 'Inactive'. This is the function login.py and
    admin_routes.py both call so that:
        - every login attempt re-evaluates the WHOLE table (not just the
          account currently logging in), and
        - every load of the Admin > Account & Security page shows
          up-to-date statuses, even for accounts nobody has logged into
          recently.

    Inactivity check logic (mirrors is_account_inactive() above, but
    expressed in SQL so it can be applied set-based instead of row by
    row):

        Current Time - last_login > threshold  ->  status = 'Inactive'
        otherwise                              ->  leave status as-is

    Deliberately conservative:
      - Only ever moves status TOWARD 'Inactive'. It never sets an
        account back to 'Active' - that transition is only ever made by
        a real successful login (login.py's /login route sets
        status = 'Active' there). This means it's safe to call this
        sweep defensively and often (every login POST, every admin page
        load) without any risk of it racing/overwriting a status a login
        just set in the same request.
      - Accounts with last_login IS NULL (never logged in) are left
        untouched, matching is_account_inactive()'s rule.
      - Already-'Inactive' accounts are excluded from the UPDATE (via
        `status != 'Inactive'`) purely so the query only touches rows
        that actually need to change.

    Args:
        connection: an open mysql.connector connection (the caller owns
            opening/closing it - this function does not open its own,
            so it can be called mid-transaction from either login.py or
            admin_routes.py without interfering with their own
            connection lifecycle).

    Returns:
        int: number of rows updated, or
        None: if the update failed. A failure here is intentionally
            swallowed (logged to console only) rather than raised -
            this is best-effort housekeeping and must never break login
            or prevent the Admin page from rendering with whatever
            status is already in the database.
    """
    threshold_minutes = _get_inactivity_minutes()

    try:
        cursor = connection.cursor()
        # TIMESTAMPDIFF(SECOND, ...) is used (rather than DATE_ADD/INTERVAL
        # with a variable) specifically so a fractional-minute threshold
        # (e.g. testing at 1 minute, or even less) compares correctly -
        # INTERVAL clauses with a bound parameter are awkward to make
        # fraction-of-a-minute safe across MySQL/MariaDB versions, while
        # TIMESTAMPDIFF in whole seconds is not.
        cursor.execute(
            f"""
            UPDATE {ACCOUNT_TABLE}
            SET status = 'Inactive'
            WHERE last_login IS NOT NULL
              AND status != 'Inactive'
              AND TIMESTAMPDIFF(SECOND, last_login, NOW()) > %s
            """,
            (threshold_minutes * 60,)
        )
        affected = cursor.rowcount
        connection.commit()
        cursor.close()
        return affected
    except Error as e:
        print(f"account_status: failed to refresh inactive accounts: {e}")
        return None