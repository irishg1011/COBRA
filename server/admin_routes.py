import os
from functools import wraps
from datetime import datetime
from flask import Blueprint, render_template, session, redirect, request, jsonify, url_for, flash
from mysql.connector import Error
from werkzeug.security import generate_password_hash  # NEW: reuses the exact same hashing scheme as the Learner Sign Up flow

from cobradb import get_db_connection
from account_status import refresh_inactive_accounts, get_account_status_counts  # NEW: shared, configurable Active/Inactive sweep + lean status-count aggregate
from login_logs import get_todays_login_metrics  # NEW: today's login/success/fail counts for the Login Logs metric cards
from password_reset_logs import get_password_resets_today_count  # NEW: today's password-reset count for the Login Logs metric cards
from session_tracker import get_active_session_count, touch_session, end_session as end_active_session  # NEW: live "Active Sessions" tracking
from lockout_logs import get_lockouts_today_count  # NEW: distinct-per-day "Locked Out Due to Fails" count
from validators import (  # NEW: same validation rules used by login.py's Learner Sign Up route - never re-implemented here
    validate_name_field,
    validate_required,
    validate_email_format,
    validate_mobile_format,
    validate_birthdate,
    validate_password_strength,
    validate_password_confirmation,
    capitalize_name,
    ADMIN_MIN_SIGNUP_AGE,  # NEW: Admin accounts require 20-60, not Learner's 13-60
    ADMIN_MAX_SIGNUP_AGE,  # NEW
)
from id_generator import generate_prefixed_acc_id  # NEW: same sequential-ID generator login.py's signup uses, just with a different prefix
from manage_course import (
    get_module_stats_options, get_categories, get_categories_with_modules,
    create_category, update_category, delete_category,
    create_module, update_module, delete_module, get_modules_overview,
    archive_module, restore_module,  # NEW - Task #27: soft delete/archive
    get_modules_by_category,  # NEW - Task #41: dependent Module dropdown lookup
)
from learning_resources import (  # NEW - Task #37, #38, #39 & #40: Learning Resources DB integration
    get_resource_types, get_learning_resources_overview,
)
from lesson_validation import validate_lesson_title  # NEW - Task #42: global lesson-name uniqueness + sentence-case formatting
from resource_publishing import (  # NEW - Task #43: Draft-default + Publish/Unpublish workflow for learning resources
    get_draft_status_id, publish_resource, unpublish_resource,
)


ADMIN_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../admin'))

admin_bp = Blueprint(
    'admin_bp',
    __name__,
    template_folder=ADMIN_DIR,
    static_folder=ADMIN_DIR,           # Maps the entire admin folder as static assets
    static_url_path='/admin/assets'    # Creates a direct route for them
)

# Login page is served by the frontend (Live Server), the same URL already
# used by admin-auth-guard.js and admin-script.js - NOT the backend's own
# "/" route, which serves a different purpose and isn't guaranteed to
# resolve to login.html depending on where the Flask process is launched
# from.
LOGIN_REDIRECT_URL = "http://127.0.0.1:5500/templates/login.html"

# ------------------------------------------------------------
# Task: Create Administrator - table/prefix/u_type config
# ------------------------------------------------------------
ACCOUNT_TABLE = "account_tbl"
PROFILE_TABLE = "profile_tbl"
GENDER_TABLE = "gender_tbl"

# Mirrors login.py's LEARNER_ID_PREFIX/LEARNER_ID_SEQ_DIGITS, just with
# the "AD" prefix instead of "LR" - both go through the exact same
# id_generator.generate_prefixed_acc_id() function.
ADMIN_ID_PREFIX = "AD"
ADMIN_ID_SEQ_DIGITS = 4

# Matches usertype_tbl: 1 = Admin, 2 = Learner (see login.py's
# ADMIN_U_TYPE/LEARNER_U_TYPE constants).
ADMIN_U_TYPE = 1


# ------------------------------------------------------------------
# Task #17: Role / Status filter + Sort option lookup tables
# ------------------------------------------------------------------
# The dropdown on the frontend sends "Administrator"/"Learner", but the
# value actually stored in usertype_tbl.u_type (and therefore returned by
# the `ut.u_type AS role` column) is "Admin"/"Learner". This map translates
# whatever the frontend sends into the exact value stored in the database,
# so the SQL filter is a plain equality check - no guessing/hardcoding on
# the frontend side.
ROLE_FILTER_MAP = {
    "administrator": "Admin",
    "admin": "Admin",
    "learner": "Learner",
}

# Valid status values a filter is allowed to request. Anything else (e.g.
# an empty string / "All Status") is treated as "no status filter".
VALID_STATUS_FILTERS = {"active", "inactive"}

# Maps the Sort dropdown's value to a safe, hardcoded ORDER BY clause.
# Never build ORDER BY directly from user input - only ever pick one of
# these three pre-written clauses based on a recognized key.
SORT_CLAUSES = {
    "date_created": "a.created_at DESC",
    "name": "p.firstname ASC, p.lastname ASC",
    # NULLs (accounts that have never logged in) always sort last,
    # regardless of DESC/ASC, thanks to the `(a.last_login IS NULL)` guard
    # sorting ascending (0 = has a value, 1 = NULL) before the real
    # last_login DESC ordering kicks in.
    "last_login": "(a.last_login IS NULL) ASC, a.last_login DESC",
}
DEFAULT_SORT_KEY = "date_created"


# ------------------------------------------------------------------
# Task #18: Login Logs status filter + sort option lookup tables
# ------------------------------------------------------------------
# NOTE: this is a DIFFERENT status vocabulary than account_tbl.status
# (Active/Inactive) above - here "status" means the outcome of a single
# login attempt, stored in login_logs_tbl.attempt_status as
# "Success"/"Failed".
LOGIN_LOG_STATUS_FILTERS = {"success", "failed"}

# login_logs_tbl has no created_at/date_created column of its own (that
# belongs to account_tbl) - the two meaningful sorts for a log table are
# its own timestamp and the associated person's name.
LOGIN_LOG_SORT_CLAUSES = {
    "attempted_at": "ll.attempted_at DESC",
    "name": "p.firstname ASC, p.lastname ASC",
}
DEFAULT_LOGIN_LOG_SORT_KEY = "attempted_at"


# ------------------------------------------------------------------
# Task #12: Session-based admin authentication
# ------------------------------------------------------------------
@admin_bp.before_request
def _require_admin_session():
    """
    Runs before every admin_bp route. Static asset requests (CSS/JS/images
    served under /admin/assets) are left alone; every actual page route
    requires a valid admin_id in the server-side session, or the request
    is redirected to the login page instead of rendering anything.
    """
    if request.endpoint == 'admin_bp.static':
        return
    if not session.get("admin_id"):
        return redirect(LOGIN_REDIRECT_URL)
    # NEW: bump active_sessions_tbl.last_seen_at so an admin actively
    # browsing isn't swept as a stale/expired session mid-use (see
    # session_tracker.sweep_expired_sessions()). Passing admin_id lets
    # touch_session() SELF-HEAL: if this session's row was already
    # swept while the admin was still logged in, it gets recreated with
    # the same token instead of the admin silently disappearing from
    # the "Active Sessions" count until they log out and back in.
    touch_session(session.get("session_token"), session.get("admin_id"))


def get_greeting():
    """
    Returns a time-of-day greeting ("Good morning" / "Good afternoon" /
    "Good evening") based on the CURRENT SERVER TIME - never hardcoded,
    never based on client-supplied data.

    Rules (24-hour clock, server local time):
        05:00 - 11:59  -> "Good morning"
        12:00 - 17:59  -> "Good afternoon"
        18:00 - 04:59  -> "Good evening"

    Reused everywhere a greeting is shown (Dashboard, Account & Security,
    and any future admin page) via inject_current_admin() below, so there
    is exactly one place this logic lives.
    """
    hour = datetime.now().hour
    if 5 <= hour < 12:
        return "Good morning"
    if 12 <= hour < 18:
        return "Good afternoon"
    return "Good evening"


def get_current_admin():
    """
    Looks up the currently logged-in administrator using ONLY the acc_id
    stored server-side in session["admin_id"] - never anything supplied
    by the client/frontend. Returns a dict with the fields the header
    needs (full_name, role), or None if the session/account is invalid.
    """
    admin_id = session.get("admin_id")
    if not admin_id:
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT
                a.acc_id,
                ut.u_type AS role,
                p.firstname,
                p.lastname
            FROM account_tbl a
            LEFT JOIN usertype_tbl ut ON a.u_type = ut.ut_id
            LEFT JOIN profile_tbl p ON a.acc_id = p.acc_id
            WHERE a.acc_id = %s
              AND (a.is_deleted = 0 OR a.is_deleted IS NULL)
            """,
            (admin_id,)
        )
        row = cursor.fetchone()
        cursor.close()

        if not row:
            return None

        full_name = " ".join(
            part for part in [row.get("firstname"), row.get("lastname")] if part
        ).strip() or "Administrator"

        return {
            "acc_id": row["acc_id"],
            "full_name": full_name,
            "role": row.get("role") or "Administrator",
        }

    except Error as e:
        print(f"admin_routes: database error while loading current admin: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_gender_options():
    """
    Task: Gender dropdown - "Populate the Gender dropdown dynamically
    from the database" / "Do not hardcode gender values" / "Reuse the
    existing lookup/reference data mechanism if available."

    Reuses the SAME gender_tbl already queried by login.py's /genders
    endpoint for the Learner Sign Up form, instead of a second lookup
    mechanism. Returns [] (never raises) on any database error, so the
    Create Administrator modal renders with an empty dropdown rather
    than crashing the page.
    """
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(f"SELECT gender_id, gender FROM {GENDER_TABLE} ORDER BY gender_id ASC")
        rows = cursor.fetchall()
        cursor.close()
        return rows
    except Error as e:
        print(f"admin_routes: failed to load gender options: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------
# Task: Create Administrator - mobile number support
# ------------------------------------------------------------
# profile_tbl has no `mobile` column in the original schema. Rather than
# requiring a separate manual migration step, this idempotently adds it
# the same way password_reset_logs.py's _ensure_table() lazily creates
# its own table - gated behind a module-level flag so it only actually
# round-trips to the database once per running process.
_mobile_column_ensured = False


def _ensure_mobile_column(connection):
    global _mobile_column_ensured
    if _mobile_column_ensured:
        return
    try:
        cursor = connection.cursor()
        # MariaDB 10.4+ / MySQL 8.0.29+ support "ADD COLUMN IF NOT
        # EXISTS" directly, avoiding the need to first inspect
        # information_schema.
        cursor.execute(
            f"ALTER TABLE {PROFILE_TABLE} ADD COLUMN IF NOT EXISTS mobile VARCHAR(15) NULL"
        )
        connection.commit()
        cursor.close()
        _mobile_column_ensured = True
    except Error as e:
        print(f"admin_routes: failed to ensure {PROFILE_TABLE}.mobile column exists: {e}")


@admin_bp.context_processor
def inject_current_admin():
    """
    Makes `current_admin`, `greeting`, AND `genders` available
    automatically to every template rendered by an admin_bp route
    (Dashboard, Account & Security, and any future admin page) without
    each route having to fetch/compute and pass them individually.

    `greeting` is recomputed on every request (not cached), so it stays
    correct as time passes across a long-lived session, `current_admin`
    is re-looked-up from the server-side session on every request, so the
    displayed name always matches whichever admin is actually logged in,
    and `genders` backs the Create Administrator modal's dropdown on
    every page that includes it (Account & Security, Login Logs) without
    an extra AJAX round trip on modal open.
    """
    return {
        "current_admin": get_current_admin(),
        "greeting": get_greeting(),
        "genders": get_gender_options(),
    }


@admin_bp.route('/logout')
def admin_logout():
    """
    Task #15: Admin logout.

    1. Read the authenticated admin's acc_id from the current session
       (before it's destroyed).
    2. Update that admin's last_login timestamp in account_tbl using the
       server's current date/time (NOW() - never a hardcoded value).
    3. Destroy the session completely.
    4. Redirect back to the Login page.

    Updating last_login is best-effort: a database hiccup here should
    never prevent the admin from actually being logged out.
    """
    admin_id = session.get("admin_id")

    # NEW: remove this admin's active_sessions_tbl row - this is what
    # makes "Active Sessions" decrease immediately on logout, rather
    # than only after SESSION_TIMEOUT_MINUTES of inactivity.
    end_active_session(session.get("session_token"))

    if admin_id:
        connection = get_db_connection()
        if connection is not None:
            try:
                cursor = connection.cursor()
                cursor.execute(
                    "UPDATE account_tbl SET last_login = NOW() WHERE acc_id = %s",
                    (admin_id,)
                )
                connection.commit()
                cursor.close()
            except Error as e:
                print(f"admin_routes: failed to update last_login on logout: {e}")
            finally:
                if connection.is_connected():
                    connection.close()

    session.clear()
    return redirect(LOGIN_REDIRECT_URL)


# ============================================================
# ROUTE: BEACON - END ADMIN SESSION ON TAB CLOSE (no explicit Logout click)
# ============================================================
@admin_bp.route('/session/end', methods=['POST'])
def admin_session_end_beacon():
    """
    Task: "Active Sessions" should drop the instant an admin closes the
    tab/browser, not sit stale for up to SESSION_TIMEOUT_MINUTES until
    the next lazy sweep. admin-auth-guard.js fires this via
    navigator.sendBeacon() on 'pagehide' - sendBeacon requests are
    fire-and-forget (the browser doesn't wait for or care about the
    response), so this route is intentionally trivial: end the session
    row and return immediately.

    Deliberately does NOT run through _require_admin_session's normal
    before_request redirect flow in any way that matters here - it
    simply ends whatever session_token this request's cookie carries,
    which is a no-op (not an error) if it's already gone.
    """
    end_active_session(session.get("session_token"))
    return ("", 204)


# ------------------------------------------------------------------
# Formatting helpers (avoid platform-dependent strftime flags like %-d)
# ------------------------------------------------------------------
def _fmt_date(dt):
    """e.g. 'Jul 12, 2026'"""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _fmt_datetime(dt):
    """e.g. 'Jul 15, 01:30 AM'"""
    if not dt:
        return "Never"
    return f"{dt.strftime('%b')} {dt.day}, {dt.strftime('%I:%M %p').lstrip('0') or '12:00 AM'}"


def get_accounts_overview(search_query=None, role_filter=None, status_filter=None, sort_by=None):
    """
    Pulls every non-deleted account from account_tbl, joined against
    profile_tbl (for the display name) and usertype_tbl (for the role
    label), and rolls up the summary metric cards shown on the
    Account & Security page. Returns a dict ready to hand straight to
    the template (or to jsonify for the live-search endpoint), or None
    if the DB connection failed.

    search_query (str | None): when provided (Task #16 - Live Account
    Search), filters rows in SQL to those whose full name, username, or
    email contain the term - case-insensitive, partial match. Filtering
    happens in the database, not in Python, so it scales with the
    dataset instead of requiring every row to be loaded first.

    role_filter (str | None): Task #17 - "Administrator" or "Learner"
    (case-insensitive). Maps through ROLE_FILTER_MAP to the exact value
    stored in usertype_tbl.u_type before being used in a parameterized
    equality check. Anything not recognized (None, "", "All Roles", a
    typo, etc.) means "no role filter applied".

    status_filter (str | None): Task #17 - "Active" or "Inactive"
    (case-insensitive). Anything not recognized means "no status filter
    applied".

    sort_by (str | None): Task #17 - one of "date_created" (default),
    "name", or "last_login". The value is only ever used to select one
    of three hardcoded ORDER BY clauses (SORT_CLAUSES) - it is never
    concatenated into the query directly, so there is no SQL injection
    surface here even though the value ultimately affects ORDER BY.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    # ------------------------------------------------------------
    # ACCOUNT INACTIVITY SWEEP
    # ------------------------------------------------------------
    # The Admin > Account & Security page (and the metrics cards above
    # the table) should always reflect the LATEST computed status - not
    # just whatever was written the last time some account happened to
    # log in. Sweeping here, before the SELECT below, means every page
    # load / live-search request (this function backs both) re-evaluates
    # every account against the configurable ACCOUNT_INACTIVITY_MINUTES
    # threshold (see account_status.py) and flips any that have gone
    # stale to 'Inactive' first.
    refresh_inactive_accounts(connection)

    accounts = []
    try:
        cursor = connection.cursor(dictionary=True)

        base_query = """
            SELECT
                a.acc_id,
                a.username,
                a.email,
                a.status,
                a.created_at,
                a.last_login,
                a.lockout_until,
                ut.u_type AS role,
                p.firstname,
                p.lastname
            FROM account_tbl a
            LEFT JOIN usertype_tbl ut ON a.u_type = ut.ut_id
            LEFT JOIN profile_tbl p ON a.acc_id = p.acc_id
            WHERE (a.is_deleted = 0 OR a.is_deleted IS NULL)
        """
        params = []

        term = (search_query or "").strip()
        if term:
            # NOTE (bug fix): every field here uses prefix ("starts with")
            # matching, not "contains anywhere" - otherwise a term like
            # "da" (meant for "Danzen") also matches usernames such as
            # "aydatkam"/"aydatkam8", and a term like "ga" (meant for
            # "Gamboa") also matches an email like
            # "mijoynicole.cdsga@gmail.com" purely because the letters
            # happen to sit in the middle of the string.
            #
            # Email is split into its local part (before "@") and domain
            # (after "@") so each half is checked at ITS OWN start - this
            # is what keeps a domain-wide search like "gmail" working
            # (the domain "gmail.com" starts with "gmail") while no longer
            # matching a term that just happens to appear mid-way through
            # the local part.
            base_query += """
                AND (
                    LOWER(p.firstname) LIKE %s
                    OR LOWER(p.lastname) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                    OR LOWER(a.username) LIKE %s
                    OR LOWER(SUBSTRING_INDEX(a.email, '@', 1)) LIKE %s
                    OR LOWER(SUBSTRING_INDEX(a.email, '@', -1)) LIKE %s
                )
            """
            prefix_term = f"{term.lower()}%"
            params.extend([
                prefix_term,  # firstname
                prefix_term,  # lastname
                prefix_term,  # "firstname lastname" concat
                prefix_term,  # username
                prefix_term,  # email local part (before @)
                prefix_term,  # email domain (after @)
            ])

        # ------------------------------------------------------------
        # Task #17: Role Filter (Administrator / Learner)
        # ------------------------------------------------------------
        mapped_role = ROLE_FILTER_MAP.get((role_filter or "").strip().lower())
        if mapped_role:
            base_query += " AND ut.u_type = %s"
            params.append(mapped_role)

        # ------------------------------------------------------------
        # Task #17: Status Filter (Active / Inactive)
        # ------------------------------------------------------------
        normalized_status = (status_filter or "").strip().lower()
        status_applied = normalized_status in VALID_STATUS_FILTERS
        if status_applied:
            # Store the properly-cased value for the equality check, since
            # a.status is stored as "Active"/"Inactive" in the database.
            base_query += " AND a.status = %s"
            params.append(normalized_status.capitalize())

        # ------------------------------------------------------------
        # Task #17: Sorting (Date Created / Name / Last Login)
        # ------------------------------------------------------------
        sort_key = (sort_by or "").strip().lower()
        order_clause = SORT_CLAUSES.get(sort_key, SORT_CLAUSES[DEFAULT_SORT_KEY])
        base_query += f" ORDER BY {order_clause}"

        cursor.execute(base_query, tuple(params))
        rows = cursor.fetchall()
        cursor.close()

        now = datetime.now()

        for row in rows:
            full_name = " ".join(
                part for part in [row.get("firstname"), row.get("lastname")] if part
            ).strip() or row["username"]

            is_locked = bool(row.get("lockout_until")) and row["lockout_until"] > now

            accounts.append({
                "acc_id": row["acc_id"],
                "full_name": full_name,
                "username": row["username"],
                "email": row["email"],
                "role": row.get("role") or "Unknown",
                "status": row.get("status") or "Active",
                "is_locked": is_locked,
                "date_created": _fmt_date(row.get("created_at")),
                "last_login": _fmt_datetime(row.get("last_login")),
            })

        # Metrics should always reflect the FULL registry, not the
        # search/role/status-filtered results, so compute them from an
        # unfiltered pass whenever THIS call itself applied any filter.
        is_filtered = bool(term) or bool(mapped_role) or status_applied
        if is_filtered:
            full_overview = get_accounts_overview()
            metrics = full_overview["metrics"] if full_overview else {
                "total_accounts": 0,
                "active_accounts": 0,
                "inactive_accounts": 0,
                "administrators": 0,
                "learners": 0,
                "locked_accounts": 0,
            }
        else:
            total_accounts = len(accounts)
            active_accounts = sum(1 for a in accounts if a["status"] == "Active")
            inactive_accounts = sum(1 for a in accounts if a["status"] == "Inactive")
            administrators = sum(1 for a in accounts if a["role"] == "Admin")
            learners = sum(1 for a in accounts if a["role"] == "Learner")
            locked_accounts = sum(1 for a in accounts if a["is_locked"])
            metrics = {
                "total_accounts": total_accounts,
                "active_accounts": active_accounts,
                "inactive_accounts": inactive_accounts,
                "administrators": administrators,
                "learners": learners,
                "locked_accounts": locked_accounts,
            }

        return {"accounts": accounts, "metrics": metrics}

    except Error as e:
        print(f"account-security: database error while loading accounts: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Task: Dynamic Login Logs metric cards
# ------------------------------------------------------------------
def get_login_logs_metrics():
    """
    Computes all 6 Admin > Login Logs metric cards from LIVE data, in a
    small, fixed number of aggregate queries (no per-row Python loops,
    no building/formatting a full account or log list just to count
    it) - one connection, then:

        1 sweep          - refresh_inactive_accounts (keeps Active/
                            Inactive current before counting)
        1 aggregate query - get_account_status_counts
                            (Active Sessions + Locked Out Due to Fails)
        1 aggregate query - get_todays_login_metrics
                            (Total Logins Today + Successful + Failed)
        1 count query     - get_password_resets_today_count

    Returns a dict whose keys line up 1:1 with what login-logs.html's
    Jinja template - and the /admin/login-logs/metrics JSON endpoint
    below, used for the page's live auto-refresh - both expect:

        total_logins_today, successful_logins, failed_logins,
        active_sessions, locked_out_fails, password_resets_today

    Returns an all-zero dict (never raises) if the database is
    unreachable, so the page/endpoint renders cleanly with 0s instead of
    crashing or showing blank cards.
    """
    zero_metrics = {
        "total_logins_today": 0,
        "successful_logins": 0,
        "failed_logins": 0,
        "active_sessions": 0,
        "locked_out_fails": 0,
        "password_resets_today": 0,
    }

    connection = get_db_connection()
    if connection is None:
        return zero_metrics

    try:
        # Kept for other callers of get_account_status_counts (e.g. any
        # future use of active_accounts/locked_accounts as-of-now), but
        # "Active Sessions" and "Locked Out Due to Fails" below now come
        # from real event tables (session_tracker / lockout_logs)
        # instead of this account_tbl snapshot - see the docstring above
        # for why account_tbl state can't answer either question
        # correctly.
        refresh_inactive_accounts(connection)
        login_counts = get_todays_login_metrics(connection)
        resets_today = get_password_resets_today_count(connection)

        return {
            "total_logins_today": login_counts["total_logins_today"],
            "successful_logins": login_counts["successful_logins"],
            "failed_logins": login_counts["failed_logins"],
            # NEW: live COUNT(*) of open active_sessions_tbl rows -
            # incremented at login, decremented at logout, and swept
            # after SESSION_TIMEOUT_MINUTES of inactivity. Never derived
            # from login/logout history.
            "active_sessions": get_active_session_count(connection),
            # NEW: COUNT(DISTINCT acc_id) of lockout_logs_tbl events
            # today - counts each account once per day even if locked
            # multiple times, and still counts accounts already
            # unlocked again, per the task's requirements.
            "locked_out_fails": get_lockouts_today_count(connection),
            "password_resets_today": resets_today,
        }
    except Error as e:
        print(f"admin_routes: database error while loading login logs metrics: {e}")
        return zero_metrics
    finally:
        if connection.is_connected():
            connection.close()


def get_login_logs_overview(search_query=None, role_filter=None, status_filter=None, sort_by=None):
    """
    Task #18: Pulls login attempt records from login_logs_tbl, joined
    against account_tbl (email, u_type), usertype_tbl (role label), and
    profile_tbl (display name) - ONE query, so there is no N+1 lookup per
    row for the account/profile/role info the UI needs.

    LEFT JOINs are used throughout because login_logs_tbl.acc_id can be
    NULL (login_logs.log_login_attempt() logs a failed attempt with
    acc_id=None whenever the typed username didn't match any account at
    all) - an INNER JOIN would silently drop those rows instead of
    showing them with a placeholder identity.

    search_query (str | None): matches against the associated person's
    first/last/full name, email, or acc_id (case-insensitive, prefix
    match - same convention as get_accounts_overview's search).

    role_filter (str | None): "Administrator" or "Learner", reusing the
    exact same ROLE_FILTER_MAP as the accounts table for consistency.

    status_filter (str | None): "Success" or "Failed" - the login
    attempt's own outcome (login_logs_tbl.attempt_status), NOT the
    account's Active/Inactive status.

    sort_by (str | None): "attempted_at" (default, newest first) or
    "name". Only ever selects one of the two hardcoded LOGIN_LOG_SORT_CLAUSES
    entries - never built from raw input.

    Returns a list of dicts (each with log_id, acc_id, ip_address,
    full_name, email, role, status, attempted_at) ready for direct use
    in Jinja (initial page load) or jsonify (the AJAX filter endpoint) -
    both consume the exact same shape. Returns None if the DB connection
    failed.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    logs = []
    try:
        cursor = connection.cursor(dictionary=True)

        base_query = """
            SELECT
                ll.log_id,
                ll.acc_id,
                ll.ip_address,
                ll.attempt_status,
                ll.attempted_at,
                a.email,
                ut.u_type AS role,
                p.firstname,
                p.lastname
            FROM login_logs_tbl ll
            LEFT JOIN account_tbl a ON ll.acc_id = a.acc_id
            LEFT JOIN usertype_tbl ut ON a.u_type = ut.ut_id
            LEFT JOIN profile_tbl p ON ll.acc_id = p.acc_id
            WHERE 1 = 1
        """
        params = []

        term = (search_query or "").strip()
        if term:
            base_query += """
                AND (
                    LOWER(p.firstname) LIKE %s
                    OR LOWER(p.lastname) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                    OR LOWER(a.email) LIKE %s
                    OR LOWER(a.username) LIKE %s
                    OR LOWER(ll.acc_id) LIKE %s
                )
            """
            prefix_term = f"{term.lower()}%"
            params.extend([prefix_term] * 6)

        mapped_role = ROLE_FILTER_MAP.get((role_filter or "").strip().lower())
        if mapped_role:
            base_query += " AND ut.u_type = %s"
            params.append(mapped_role)

        normalized_status = (status_filter or "").strip().lower()
        if normalized_status in LOGIN_LOG_STATUS_FILTERS:
            base_query += " AND ll.attempt_status = %s"
            params.append(normalized_status.capitalize())

        sort_key = (sort_by or "").strip().lower()
        order_clause = LOGIN_LOG_SORT_CLAUSES.get(sort_key, LOGIN_LOG_SORT_CLAUSES[DEFAULT_LOGIN_LOG_SORT_KEY])
        base_query += f" ORDER BY {order_clause}"

        cursor.execute(base_query, tuple(params))
        rows = cursor.fetchall()
        cursor.close()

        for row in rows:
            full_name = " ".join(
                part for part in [row.get("firstname"), row.get("lastname")] if part
            ).strip() or "Unknown User"

            logs.append({
                "log_id": row["log_id"],
                "acc_id": row.get("acc_id") or "—",
                "full_name": full_name,
                "email": row.get("email") or "—",
                "ip_address": row.get("ip_address") or "—",
                "role": row.get("role") or "Unknown",
                "status": row.get("attempt_status"),
                "attempted_at": _fmt_datetime(row.get("attempted_at")),
            })

        return logs

    except Error as e:
        print(f"admin_routes: database error while loading login logs: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


@admin_bp.route('/dashboard')
def admin_dashboard():
    return render_template('admin_dashboard.html')


@admin_bp.route('/account-security.html')
def account_security():
    overview = get_accounts_overview()

    if overview is None:
        # DB unreachable - render the page with empty state rather than crashing
        overview = {
            "accounts": [],
            "metrics": {
                "total_accounts": 0,
                "active_accounts": 0,
                "inactive_accounts": 0,
                "administrators": 0,
                "learners": 0,
                "locked_accounts": 0,
            },
        }

    return render_template(
        'account-security.html',
        accounts=overview["accounts"],
        metrics=overview["metrics"],
    )


# ============================================================
# ROUTE: LIVE ACCOUNT SEARCH + FILTER + SORT (Task #16 & #17, JSON)
# ============================================================
@admin_bp.route('/accounts/search')
def search_accounts():
    """
    Backend-driven live search/filter/sort for the Account & Security
    table.

    Query params (all optional):
      q      - free-text search term (name / username / email)
      role   - "Administrator" or "Learner" (case-insensitive)
      status - "Active" or "Inactive" (case-insensitive)
      sort   - "date_created" (default), "name", or "last_login"

    - No params at all -> returns the full account list (same as page
      load), sorted by newest first.
    - Any combination of q / role / status is applied together (AND'ed
      in SQL), and the requested sort is applied on top of that filtered
      set - search, filters, and sorting all compose with each other.

    Returns JSON: { "success": bool, "accounts": [...], "total": int }
    The frontend uses this to re-render only the table body - no page
    reload, and none of the filter controls' values are touched by the
    caller.
    """
    term = request.args.get('q', '')
    role = request.args.get('role', '')
    status = request.args.get('status', '')
    sort = request.args.get('sort', '')

    overview = get_accounts_overview(
        search_query=term,
        role_filter=role,
        status_filter=status,
        sort_by=sort,
    )
    if overview is None:
        return jsonify({"success": False, "message": "Could not reach the database.", "accounts": []}), 500

    return jsonify({
        "success": True,
        "accounts": overview["accounts"],
        "total": len(overview["accounts"]),
    }), 200


# Task #17 spec names the endpoint "/admin/accounts/filter" - registered
# as an alias pointing at the exact same view function above, so both
# URLs are supported without duplicating any query-building logic.
admin_bp.add_url_rule(
    '/accounts/filter',
    endpoint='accounts_filter',
    view_func=search_accounts,
)


@admin_bp.route('/login-logs.html')
def login_logs():
    """
    Renders the login logs page using LIVE metric cards (Total Logins
    Today / Successful / Failed / Active Sessions / Locked Out Due to
    Fails / Password Resets Today - see get_login_logs_metrics() above)
    and real login log data (Task #18).

    NOTE: this used to reuse get_accounts_overview()'s metrics dict
    (total_accounts, active_accounts, etc.) - those keys never matched
    what this template actually renders (metrics.total_logins_today and
    friends), so every card silently rendered blank. get_login_logs_metrics()
    replaces that with the correct keys, computed directly against
    login_logs_tbl / account_tbl / password_reset_logs_tbl instead of
    piggybacking on a differently-shaped metrics dict.

    Calling get_login_logs_overview() with no filters here means the
    page shows the full, newest-first log the moment it loads - the
    same "server renders real data on load" pattern already used by
    account_security() above. admin-login-logs.js then takes over for
    live search/role/status/sort filtering AND for periodically
    refreshing the metric cards, without a page reload.
    """
    metrics = get_login_logs_metrics()

    logs = get_login_logs_overview()
    if logs is None:
        # DB unreachable - render with an empty list rather than crashing;
        # the template's {% else %} branch already shows "No login logs
        # found." for an empty list.
        logs = []

    return render_template(
        'login-logs.html',
        metrics=metrics,
        logs=logs
    )


# ============================================================
# ROUTE: LIVE LOGIN LOG SEARCH + FILTER + SORT (Task #18, JSON)
# ============================================================
@admin_bp.route('/login-logs/data')
def login_logs_data():
    """
    Backend-driven live search/filter/sort for the Login Logs table,
    mirroring /accounts/search's pattern exactly for consistency.

    Query params (all optional):
      q      - free-text search term (name / email / account ID)
      role   - "Administrator" or "Learner"
      status - "Success" or "Failed" (the login attempt's own outcome)
      sort   - "attempted_at" (default, newest first) or "name"

    Returns JSON: { "success": bool, "logs": [...], "total": int }
    """
    term = request.args.get('q', '')
    role = request.args.get('role', '')
    status = request.args.get('status', '')
    sort = request.args.get('sort', '')

    logs = get_login_logs_overview(
        search_query=term,
        role_filter=role,
        status_filter=status,
        sort_by=sort,
    )
    if logs is None:
        return jsonify({"success": False, "message": "Could not reach the database.", "logs": []}), 500

    return jsonify({"success": True, "logs": logs, "total": len(logs)}), 200


# ============================================================
# ROUTE: LIVE LOGIN LOGS METRIC CARDS (JSON)
# ============================================================
@admin_bp.route('/login-logs/metrics')
def login_logs_metrics():
    """
    JSON endpoint backing the Login Logs page's live metric-card refresh
    (see admin-login-logs.js: loadMetrics()). Computed via
    get_login_logs_metrics() - the exact same function that renders the
    page's initial server-side values - so the frontend can overwrite
    each card's text with result.metrics.<key> and it will always match
    what a fresh page load would show.

    Returns JSON: { "success": true, "metrics": {...} }. Always 200 -
    get_login_logs_metrics() itself falls back to all zeros on a
    database error rather than raising, so there is no failure mode here
    that needs its own 500 branch.
    """
    metrics = get_login_logs_metrics()
    return jsonify({"success": True, "metrics": metrics}), 200


@admin_bp.route('/create-administrator', methods=['POST'])
def create_administrator():
    """
    Task: Admin > Create Administrator modal backend.

    Reuses the EXACT SAME validation rules as the Learner Sign Up flow
    (see validators.py - imported by both login.py's /signup route and
    this route) instead of re-implementing name/email/mobile/birthdate/
    password rules a second time. The only meaningful differences from
    Learner sign-up are:
      - no OTP step (the Create Administrator modal has no OTP UI)
      - the generated account ID uses the "AD" prefix instead of "LR"
        (via the same id_generator.generate_prefixed_acc_id() function)
      - u_type is hardcoded to ADMIN_U_TYPE (1) instead of Learner's 2

    Returns JSON (not a redirect) so the modal's JS
    (admin-create-admin.js) can show inline validation errors and
    success feedback without a page reload, per the "display validation
    messages dynamically" / "show success feedback" requirements.
    """
    data = request.form if request.form else (request.get_json(silent=True) or {})

    # NOTE: acc_id is intentionally NEVER read from the request body -
    # it is always generated server-side below (generate_prefixed_acc_id),
    # exactly like login.py's /signup route. The modal's readonly acc_id
    # field is a preview only; the client can never set or override it.
    first_name = (data.get('first_name') or '').strip()
    middle_name = (data.get('middle_name') or '').strip()  # optional - no dedicated modal field yet; validated if present
    last_name = (data.get('last_name') or '').strip()
    suffix = (data.get('suffix') or '').strip()             # optional - same as above
    birthdate = (data.get('birthdate') or '').strip()
    gender = (data.get('gender') or '').strip()
    email = (data.get('email') or '').strip().lower()
    mobile = (data.get('mobile') or '').strip()
    username = (data.get('username') or '').strip().lower()
    password = (data.get('password') or '').strip()
    confirm_password = (data.get('confirm_password') or '').strip()

    # ------------------------------------------------------------
    # Server-side validation (Task: "Validate all user input on the
    # server, even if client-side validation exists") - reuses
    # validators.py exclusively, never a second copy of these rules.
    # ------------------------------------------------------------
    errors = {}

    ok, msg = validate_name_field(first_name, "First name")
    if not ok:
        errors['first_name'] = msg

    ok, msg = validate_name_field(middle_name, "Middle name", required=False)
    if not ok:
        errors['middle_name'] = msg

    ok, msg = validate_name_field(last_name, "Last name")
    if not ok:
        errors['last_name'] = msg

    ok, msg = validate_name_field(suffix, "Suffix", required=False)
    if not ok:
        errors['suffix'] = msg

    ok, msg = validate_email_format(email)
    if not ok:
        errors['email'] = msg

    ok, msg = validate_mobile_format(mobile)
    if not ok:
        errors['mobile'] = msg

    ok, msg = validate_birthdate(birthdate, min_age=ADMIN_MIN_SIGNUP_AGE, max_age=ADMIN_MAX_SIGNUP_AGE)
    if not ok:
        errors['birthdate'] = msg

    ok, msg = validate_required(gender, "Gender")
    if not ok:
        errors['gender'] = msg

    ok, msg = validate_required(username, "Username")
    if ok and len(username) > 15:
        ok, msg = False, "Username must be 15 characters or fewer."
    if not ok:
        errors['username'] = msg

    ok, msg = validate_password_strength(password)
    if not ok:
        errors['password'] = msg

    ok, msg = validate_password_confirmation(password, confirm_password)
    if not ok:
        errors['confirm_password'] = msg

    # NOTE: format validation above (name/email/mobile/birthdate/gender/
    # username/password/confirm) intentionally does NOT return here.
    # Format errors and duplicate-username/email/mobile errors are
    # merged into ONE `errors` dict and returned together in a single
    # response below - so a single submission surfaces every problem
    # at once, instead of the admin fixing a password error, resubmitting,
    # and only THEN discovering the username/email/mobile were also
    # taken.

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to the database."}), 500

    try:
        _ensure_mobile_column(connection)
        cursor = connection.cursor()

        # ------------------------------------------------------------
        # Task: Prevent duplicate usernames / emails / mobile numbers.
        # Re-checked here even though admin-create-admin.js already
        # does live checks, since client-side checks are never trusted
        # on their own (Task: "Sanitize and validate all incoming data").
        #
        # Runs regardless of whether the format-validation pass above
        # already found errors on OTHER fields, and checks all three of
        # username/email/mobile before responding - never stops at the
        # first duplicate found. Skips a field's own duplicate check
        # only if that exact field already failed its own format/required
        # validation above (an empty or malformed value can't usefully
        # be duplicate-checked), so a bad username doesn't block finding
        # out the email/mobile are duplicates too.
        # ------------------------------------------------------------
        if username and 'username' not in errors:
            cursor.execute(f"SELECT acc_id FROM {ACCOUNT_TABLE} WHERE username = %s", (username,))
            if cursor.fetchone():
                errors["username"] = "This username is already taken."

        if email and 'email' not in errors:
            cursor.execute(f"SELECT acc_id FROM {ACCOUNT_TABLE} WHERE email = %s", (email,))
            if cursor.fetchone():
                errors["email"] = "An account with this email already exists."

        if mobile and 'mobile' not in errors:
            cursor.execute(f"SELECT acc_id FROM {PROFILE_TABLE} WHERE mobile = %s", (mobile,))
            if cursor.fetchone():
                errors["mobile"] = "This mobile number is already registered."

        # Task: "Do not allow account creation until every validation
        # passes successfully." Only stop here (and skip account
        # creation entirely) if format validation OR the duplicate
        # checks above found anything wrong - and when they did, every
        # error found (format AND duplicate, across every field) is
        # returned together in this one response.
        if errors:
            cursor.close()
            return jsonify({
                "success": False,
                "errors": errors,
                "message": "Please fix the highlighted fields.",
            }), 400

        # ------------------------------------------------------------
        # Task: Account creation - reuses the SAME ID-generation
        # (id_generator.generate_prefixed_acc_id, prefix "AD") and
        # password-hashing (werkzeug's generate_password_hash, same
        # call login.py's /signup route makes) as Learner Sign Up.
        # ------------------------------------------------------------
        hashed_password = generate_password_hash(password)
        new_acc_id = generate_prefixed_acc_id(cursor, ADMIN_ID_PREFIX, ADMIN_ID_SEQ_DIGITS)

        cursor.execute(
            f"""INSERT INTO {ACCOUNT_TABLE} (
                    acc_id, email, username, password, u_type,
                    status, created_at, last_login,
                    failed_attempts, lockout_until, is_deleted
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    'Active', NOW(), NULL,
                    0, NULL, 0
                )""",
            (new_acc_id, email, username, hashed_password, ADMIN_U_TYPE)
        )

        # Task: "Automatically capitalize all name fields using the
        # existing capitalization logic" - reuses
        # validators.capitalize_name(), the same rule script.js applies
        # live on First/Last Name while typing.
        cursor.execute(
            f"""INSERT INTO {PROFILE_TABLE} (acc_id, firstname, lastname, gender, birthdate, mobile)
                VALUES (%s, %s, %s, %s, %s, %s)""",
            (
                new_acc_id,
                capitalize_name(first_name),
                capitalize_name(last_name),
                gender,
                birthdate,
                mobile,
            )
        )

        connection.commit()
        cursor.close()

        return jsonify({
            "success": True,
            "message": "Administrator account created successfully.",
            "acc_id": new_acc_id,
        }), 201

    except Error as e:
        connection.rollback()
        print(f"admin_routes: failed to create administrator: {e}")
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# ROUTE: PREVIEW NEXT ADMIN ACCOUNT ID (Create Administrator modal)
# ============================================================
@admin_bp.route('/accounts/next-id')
def preview_next_admin_id():
    """
    Preview-only: computes what the NEXT Admin acc_id would look like
    (e.g. "AD2608060004") WITHOUT reserving or inserting it - purely for
    display in the Create Administrator modal's readonly Account ID
    field, replacing the static "Auto-generated on submit" placeholder
    text.

    IMPORTANT: this is read-only and takes no lock. The real,
    authoritative ID is still only ever generated inside
    create_administrator()'s own transaction via
    generate_prefixed_acc_id() (which DOES take a row lock via
    SELECT ... FOR UPDATE) - this endpoint never writes anything and
    never reserves the number it shows. If two admins open the modal at
    the same moment, both may briefly preview the same next ID; whichever
    one actually submits first gets it for real, and the other's
    create_administrator() call will simply generate the number after
    that once its own transaction runs. This is expected and harmless -
    the preview is a UX nicety, not a reservation.

    Returns JSON: { "success": bool, "next_id": str }
    """
    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to the database."}), 500
    try:
        cursor = connection.cursor()
        today_prefix = f"{ADMIN_ID_PREFIX}{datetime.now().strftime('%y%m%d')}"
        cursor.execute(
            f"""SELECT acc_id FROM {ACCOUNT_TABLE}
                WHERE acc_id LIKE %s
                ORDER BY acc_id DESC
                LIMIT 1""",
            (f"{today_prefix}%",)
        )
        row = cursor.fetchone()
        cursor.close()

        if row:
            next_seq = int(row[0][-ADMIN_ID_SEQ_DIGITS:]) + 1
        else:
            next_seq = 1

        next_id = f"{today_prefix}{next_seq:0{ADMIN_ID_SEQ_DIGITS}d}"
        return jsonify({"success": True, "next_id": next_id}), 200
    except Error as e:
        print(f"admin_routes: failed to preview next admin id: {e}")
        return jsonify({"success": False, "message": "Could not compute next ID."}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# ROUTE: LIVE FIELD AVAILABILITY CHECK (Create Administrator modal)
# ============================================================
@admin_bp.route('/accounts/check-availability')
def check_account_field_availability():
    """
    Backs admin-create-admin.js's live duplicate checks (Task:
    "Prevent duplicate usernames/emails/mobile numbers" + "Display
    validation messages dynamically without refreshing the page").
    Checks ONE field at a time so the frontend can fire this on
    blur/debounced-input without needing the rest of the form filled
    in yet - this is a UX convenience only; create_administrator()
    above re-validates uniqueness itself before ever inserting a row,
    so this endpoint being skipped or spoofed can't bypass anything.

    Query params:
      field - "username", "email", or "mobile"
      value - the current value of that field

    Returns JSON: { "success": bool, "available": bool }
    """
    field = (request.args.get('field') or '').strip().lower()
    value = (request.args.get('value') or '').strip()

    if field not in ("username", "email", "mobile") or not value:
        return jsonify({"success": False, "message": "Invalid field or value."}), 400

    if field == "email":
        value = value.lower()
    if field == "username":
        value = value.lower()

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to the database."}), 500

    try:
        cursor = connection.cursor()
        if field == "mobile":
            _ensure_mobile_column(connection)
            cursor.execute(f"SELECT acc_id FROM {PROFILE_TABLE} WHERE mobile = %s", (value,))
        else:
            cursor.execute(f"SELECT acc_id FROM {ACCOUNT_TABLE} WHERE {field} = %s", (value,))
        taken = cursor.fetchone() is not None
        cursor.close()
        return jsonify({"success": True, "available": not taken}), 200
    except Error as e:
        print(f"admin_routes: availability check failed: {e}")
        return jsonify({"success": False, "message": "Could not check availability."}), 500
    finally:
        if connection.is_connected():
            connection.close()

@admin_bp.route('/manage-course')
def manage_course():
    search = request.args.get('q', '')
    status = request.args.get('status', '')
    page = request.args.get('page', 1, type=int)

    # Task #30: Created At / Updated At date filters. All four are
    # optional 'YYYY-MM-DD' strings coming straight from the query
    # string (never hardcoded) - an absent param means "no restriction"
    # for that bound, handled by get_modules_overview() itself.
    created_from = request.args.get('created_from', '') or None
    created_to = request.args.get('created_to', '') or None
    updated_from = request.args.get('updated_from', '') or None
    updated_to = request.args.get('updated_to', '') or None

    overview = get_modules_overview(
        search_query=search, status_filter=status, page=page,
        created_from=created_from, created_to=created_to,
        updated_from=updated_from, updated_to=updated_to,
    )
    if overview is None:
        overview = {"modules": [], "total": 0, "page": 1, "per_page": 8, "total_pages": 1}
 
    return render_template(
        'manage-course.html',
        modules=overview["modules"],
        total_modules=overview["total"],
        page=overview["page"],
        total_pages=overview["total_pages"],
        statuses=get_module_stats_options(),
        categories=get_categories(),
        # NEW: reflected back into the date inputs' `value` attributes so a
        # direct/refreshed load with a query string (e.g. a bookmarked or
        # shared filtered URL) shows the same filter state instead of
        # silently resetting it - admin-manage-course.js takes over for
        # every subsequent live filter change.
        created_from=created_from or '',
        created_to=created_to or '',
        updated_from=updated_from or '',
        updated_to=updated_to or '',
    )
 
 
@admin_bp.route('/manage-course/data')
def manage_course_data():
    """Live search/filter/pagination for the module table - JSON."""
    search = request.args.get('q', '')
    status = request.args.get('status', '')
    page = request.args.get('page', 1, type=int)

    # Task #30: same four optional date-filter params as manage_course()
    # above, for the live AJAX endpoint admin-manage-course.js calls on
    # every search/status/date/page change.
    created_from = request.args.get('created_from', '') or None
    created_to = request.args.get('created_to', '') or None
    updated_from = request.args.get('updated_from', '') or None
    updated_to = request.args.get('updated_to', '') or None

    # Server-side range validation - never trust only the frontend's own
    # check (admin-manage-course.js validates the same thing for instant
    # feedback, but a request can always arrive here directly). Plain
    # string comparison is safe here because both bounds are always
    # 'YYYY-MM-DD' (ISO 8601 sorts lexicographically the same as
    # chronologically).
    if created_from and created_to and created_from > created_to:
        return jsonify({
            "success": False,
            "message": "Created At: end date must be on or after the start date.",
        }), 400
    if updated_from and updated_to and updated_from > updated_to:
        return jsonify({
            "success": False,
            "message": "Updated At: end date must be on or after the start date.",
        }), 400

    overview = get_modules_overview(
        search_query=search, status_filter=status, page=page,
        created_from=created_from, created_to=created_to,
        updated_from=updated_from, updated_to=updated_to,
    )
    if overview is None:
        return jsonify({"success": False, "message": "Could not reach the database."}), 500
    return jsonify({"success": True, **overview}), 200
 
 
@admin_bp.route('/manage-course/categories')
def manage_course_categories():
    """Backs the Categories modal - categories + their nested modules."""
    return jsonify({"success": True, "categories": get_categories_with_modules()}), 200
 
 
@admin_bp.route('/manage-course/categories/create', methods=['POST'])
def manage_course_create_category():
    data = request.form if request.form else (request.get_json(silent=True) or {})
    success, message, cat_id = create_category(data.get('category_name'))
    status_code = 201 if success else 400
    return jsonify({"success": success, "message": message, "cat_id": cat_id}), status_code
 
 
@admin_bp.route('/manage-course/categories/<int:cat_id>/update', methods=['POST'])
def manage_course_update_category(cat_id):
    data = request.form if request.form else (request.get_json(silent=True) or {})
    success, message = update_category(cat_id, data.get('category_name'))
    return jsonify({"success": success, "message": message}), (200 if success else 400)
 
 
@admin_bp.route('/manage-course/categories/<int:cat_id>/delete', methods=['POST'])
def manage_course_delete_category(cat_id):
    success, message = delete_category(cat_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)
 
 
@admin_bp.route('/manage-course/modules/create', methods=['POST'])
def manage_course_create_module():
    data = request.form if request.form else (request.get_json(silent=True) or {})
    success, message, module_id = create_module(
        data.get('module_name'), data.get('description'),
        data.get('cat_id'), data.get('module_stats_id')
    )
    return jsonify({"success": success, "message": message, "module_id": module_id}), (201 if success else 400)
 
 
@admin_bp.route('/manage-course/modules/<int:module_id>/update', methods=['POST'])
def manage_course_update_module(module_id):
    data = request.form if request.form else (request.get_json(silent=True) or {})
    success, message = update_module(
        module_id, data.get('module_name'), data.get('description'),
        data.get('cat_id'), data.get('module_stats_id')
    )
    return jsonify({"success": success, "message": message}), (200 if success else 400)
 
 
@admin_bp.route('/manage-course/modules/<int:module_id>/delete', methods=['POST'])
def manage_course_delete_module(module_id):
    """
    Task #27: this used to permanently DELETE the module row
    (delete_module()). It now performs a soft delete/archive instead
    (archive_module()) - the route/endpoint URL is left unchanged
    (still "/delete") on purpose, since admin-manage-course.js's
    existing Delete/trash icon already points here and the request/
    response shape is identical; only the underlying database operation
    changed from DELETE to UPDATE ... SET is_archived = 1.
    """
    success, message = archive_module(module_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


# ============================================================
# Task #27: ARCHIVED MODULES - list + restore
# ============================================================
@admin_bp.route('/manage-course/modules/archived')
def manage_course_archived_modules():
    """
    Live search/pagination for the Archived Modules view - mirrors
    manage_course_data() exactly, just scoped to is_archived = 1
    (via get_modules_overview(archived=True)) instead of the active
    (is_archived = 0) list. No status filter param here since the
    Archived Modules view doesn't expose a status dropdown of its own.
    """
    search = request.args.get('q', '')
    page = request.args.get('page', 1, type=int)

    overview = get_modules_overview(search_query=search, page=page, archived=True)
    if overview is None:
        return jsonify({"success": False, "message": "Could not reach the database."}), 500
    return jsonify({"success": True, **overview}), 200


@admin_bp.route('/manage-course/modules/<int:module_id>/restore', methods=['POST'])
def manage_course_restore_module(module_id):
    """
    Task #27: flips a module's is_archived flag back to 0 so it
    reappears in the normal active Manage Course list. Never creates a
    new module row - the exact same module_id, name, description,
    category, and publication status are preserved.
    """
    success, message = restore_module(module_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)

# ------------------------------------------------------------------
# Task #19: Placeholder ("Under Construction") pages
# ------------------------------------------------------------------
def render_placeholder(title):
    return render_template('admin-placeholder.html', title=title)


@admin_bp.route('/learning-resources')
def learning_resources():
    """
    Task #37, #38 & #40: renders the Learning Resources page with LIVE
    data - real rows from learning_resources_tbl (Category / Uploaded
    By / Status / Created At / Updated At all resolved to display names
    via JOINs - see learning_resources.py), a resource-type dropdown
    populated straight from resource_types_tbl, and Created At /
    Updated At date filters prefilled from the query string (if any) -
    instead of the previous static/empty placeholder page.

    admin-learning-resources.js takes over afterward for live
    search/type-filter/date-filter/pagination without a page reload,
    the same "server renders real data on load, JS takes over for live
    updates" pattern already used by manage_course() / account_security().
    """
    # Task #40: same four optional 'YYYY-MM-DD' query params as
    # manage_course()'s own Created At / Updated At filters - reflected
    # back into the date inputs' `value` attributes so a direct/shared
    # filtered URL shows the same filter state instead of silently
    # resetting it.
    created_from = request.args.get('created_from', '') or None
    created_to = request.args.get('created_to', '') or None
    updated_from = request.args.get('updated_from', '') or None
    updated_to = request.args.get('updated_to', '') or None

    overview = get_learning_resources_overview(
        created_from=created_from, created_to=created_to,
        updated_from=updated_from, updated_to=updated_to,
    )
    if overview is None:
        # DB unreachable - render with an empty list rather than
        # crashing; the template's {% else %} branch already shows
        # "No resources found." for a genuinely empty list. This is
        # NOT the same as get_learning_resources_overview() returning
        # zero rows for a successful query - see Task #37, Requirement #7.
        overview = {"resources": [], "total": 0, "page": 1, "per_page": 8, "total_pages": 1}

    return render_template(
        'learning-resources.html',
        resources=overview["resources"],
        total_resources=overview["total"],
        page=overview["page"],
        total_pages=overview["total_pages"],
        resource_types=get_resource_types(),
        created_from=created_from or '',
        created_to=created_to or '',
        updated_from=updated_from or '',
        updated_to=updated_to or '',
    )


@admin_bp.route('/learning-resources/data')
def learning_resources_data():
    """
    Task #37, #38, #39 & #40: backend-driven live search/type-filter/
    date-filter/pagination for the Learning Resources table - JSON,
    mirroring manage_course_data()'s pattern exactly for consistency.

    Query params (all optional):
      q             - free-text search term (Task #39: matches title,
                      resource type, category, uploader, status, AND
                      created/updated date - see learning_resources.py)
      type          - the real resource_type_id from resource_types_tbl
                      (never a hardcoded id or a name string - Task #38)
      page          - page number
      created_from  - Task #40: 'YYYY-MM-DD', inclusive lower bound on
                      learning_resources_tbl.created_at
      created_to    - Task #40: 'YYYY-MM-DD', inclusive upper bound
      updated_from  - Task #40: 'YYYY-MM-DD', inclusive lower bound on
                      learning_resources_tbl.updated_at
      updated_to    - Task #40: 'YYYY-MM-DD', inclusive upper bound

    Returns JSON: { "success": bool, "resources": [...], "total": int,
    "page": int, "total_pages": int }
    """
    search = request.args.get('q', '')
    type_filter = request.args.get('type', '')
    page = request.args.get('page', 1, type=int)

    created_from = request.args.get('created_from', '') or None
    created_to = request.args.get('created_to', '') or None
    updated_from = request.args.get('updated_from', '') or None
    updated_to = request.args.get('updated_to', '') or None

    # Task #40: server-side range validation - never trust only the
    # frontend's own check (admin-learning-resources.js validates the
    # same thing for instant feedback, but a request can always arrive
    # here directly). Plain string comparison is safe here because both
    # bounds are always 'YYYY-MM-DD' (ISO 8601 sorts lexicographically
    # the same as chronologically) - identical convention to
    # manage_course_data()'s own validation.
    if created_from and created_to and created_from > created_to:
        return jsonify({
            "success": False,
            "message": "Created At: end date must be on or after the start date.",
        }), 400
    if updated_from and updated_to and updated_from > updated_to:
        return jsonify({
            "success": False,
            "message": "Updated At: end date must be on or after the start date.",
        }), 400

    overview = get_learning_resources_overview(
        search_query=search, type_filter=type_filter, page=page,
        created_from=created_from, created_to=created_to,
        updated_from=updated_from, updated_to=updated_to,
    )
    if overview is None:
        return jsonify({"success": False, "message": "Could not reach the database."}), 500
    return jsonify({"success": True, **overview}), 200


# ============================================================
# Task #43: PUBLISH / UNPUBLISH A LEARNING RESOURCE
# ============================================================
@admin_bp.route('/learning-resources/<int:resource_id>/publish', methods=['POST'])
def publish_learning_resource(resource_id):
    """
    Task #43: flips a resource's status to "Published". All of the real
    validation - including the "parent module must already be Published"
    gate - lives in resource_publishing.publish_resource(), never here;
    this route is a thin HTTP wrapper only, matching this project's
    existing convention (see manage_course_delete_module(),
    manage_course_restore_module(), etc.).

    Returns JSON: { "success": bool, "message": str }
    """
    success, message = publish_resource(resource_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/learning-resources/<int:resource_id>/unpublish', methods=['POST'])
def unpublish_learning_resource(resource_id):
    """
    Task #43: flips a resource's status back to "Draft". Unlike
    publishing, no parent-status gate applies here - taking a resource
    offline is always allowed (see resource_publishing.unpublish_resource()).

    Returns JSON: { "success": bool, "message": str }
    """
    success, message = unpublish_resource(resource_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/learning-activities')
def learning_activities():
    """
    Renders the static learning activities management page.
    """
    return render_template('manage-learning-activities.html')

@admin_bp.route('/coding-exercises')
def coding_exercises():
    return render_template('coding-exercises.html')


@admin_bp.route('/coding-sandbox')
def coding_sandbox():
    return render_placeholder("Coding Sandbox")


@admin_bp.route('/learner-progress')
def learner_progress():
    return render_placeholder("Learner Progress")


@admin_bp.route('/analytics')
def analytics():
    return render_placeholder("Analytics")


@admin_bp.route('/recommendations')
def recommendations():
    return render_placeholder("Recommendations")


@admin_bp.route('/achievements')
def achievements():
    return render_placeholder("Achievements")


@admin_bp.route('/reports')
def reports():
    return render_placeholder("Reports")

@admin_bp.route('/upload-resource', methods=['GET', 'POST'])
def upload_resource():
    """
    Task #42: the lesson's title (posted as `lesson_name`) is now
    validated before anything else happens - normalized to sentence
    case, then checked for GLOBAL uniqueness across every category and
    module in learning_resources_tbl - via
    lesson_validation.validate_lesson_title(), a separate, reusable
    module (never inline validation logic here, matching this
    project's existing "no new logic inline inside admin_routes.py"
    convention - see manage_course.py / learning_resources.py /
    account_status.py).

    On failure (missing name, or a global duplicate), the error is
    flashed and the admin is redirected back to this same page - no
    partial/invalid data is ever saved. On success, `lesson_name` has
    already been normalized ("javascript" -> "Javascript") and is ready
    to be persisted by the resource-creation/status workflow.
    """
    if request.method == 'POST':
        lesson_name = (request.form.get('lesson_name') or '').strip()

        is_valid, result = validate_lesson_title(lesson_name)
        if not is_valid:
            # `result` is the human-readable error message when
            # is_valid is False (required / DB unreachable / duplicate).
            flash(result, 'error')
            return redirect(url_for('admin_bp.upload_resource'))

        # `result` is now the normalized ("sentence case") lesson title -
        # e.g. "javascript" / "JAVASCRIPT" / "jAvAsCrIpT" all become
        # "Javascript". This is the exact value that MUST be used
        # wherever the learning_resources_tbl row is actually persisted.
        normalized_lesson_name = result  # noqa: F841 - consumed by the resource-creation workflow

        # NEW - Task #43: whenever the actual INSERT into
        # learning_resources_tbl is wired up here, its lr_stats_id MUST
        # come from get_draft_status_id() - never a hardcoded id - so
        # every newly created resource starts out as "Draft" and can
        # only go live through the explicit Publish action (see
        # publish_learning_resource() above), which itself refuses to
        # publish until the resource's parent module is "Published".
        #
        #     draft_status_id = get_draft_status_id()
        #     cursor.execute(
        #         "INSERT INTO learning_resources_tbl "
        #         "(resource_title, resource_type_id, cat_id, module_id, "
        #         " uploaded_by, lr_stats_id, created_at, updated_at) "
        #         "VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())",
        #         (normalized_lesson_name, ..., ..., ..., ..., draft_status_id)
        #     )

        flash('Lesson name validated successfully.', 'success')
        return redirect(url_for('admin_bp.upload_resource'))

    # Task #41: Category dropdown is rendered server-side from real
    # category_tbl rows (same get_categories() Manage Course already
    # uses) - never hardcoded. The Module dropdown starts empty/disabled
    # in the template and is populated live by upload-resource.js once
    # the Admin picks a Category.
    return render_template('upload-resource.html', categories=get_categories())


# ============================================================
# ROUTE: TASK #42 - LIVE LESSON NAME UNIQUENESS CHECK
# ============================================================
@admin_bp.route('/upload-resource/check-lesson-name')
def upload_resource_check_lesson_name():
    """
    Task #42: backs upload-resource.js's live, debounced duplicate check
    while the admin types a lesson name - mirrors
    check_account_field_availability()'s pattern exactly (see above).
    Purely a UX convenience: the POST /admin/upload-resource route
    above always re-validates uniqueness itself (via the SAME
    lesson_validation module) before anything is ever saved, so this
    endpoint being skipped or spoofed can't bypass anything.

    Query params:
      name - the lesson title currently typed (raw, not yet
             normalized - normalization happens inside
             validate_lesson_title()).

    Returns JSON:
      { "success": true, "available": bool, "normalized": str }  - on a
        successful check (available may still be False for a duplicate)
      { "success": true, "available": false, "message": str }    - when
        the title can't be validated yet (e.g. still empty)
      400 - no `name` query param supplied at all
    """
    name = (request.args.get('name') or '').strip()
    if not name:
        return jsonify({"success": False, "message": "Lesson name is required."}), 400

    is_valid, result = validate_lesson_title(name)
    if not is_valid:
        # A duplicate (or a not-yet-checkable value) is the only
        # failure mode this endpoint reports - always 200, since this
        # is informational, not an error condition for the request
        # itself.
        return jsonify({"success": True, "available": False, "message": result}), 200

    return jsonify({"success": True, "available": True, "normalized": result}), 200


# ============================================================
# ROUTE: TASK #41 - MODULES DEPENDENT ON SELECTED CATEGORY
# ============================================================
@admin_bp.route('/upload-resource/modules-by-category')
def upload_resource_modules_by_category():
    """
    Task #41: backs the New Lesson form's dependent Module dropdown.
    Takes a single query param, `cat_id`, and returns ONLY the modules
    whose modules_tbl.cat_id matches it - via
    manage_course.get_modules_by_category()'s parameterized query, so
    the selected category id is never concatenated into SQL.

    A missing/invalid cat_id returns an empty module list rather than
    a 400, since the frontend calls this defensively on every Category
    change (including back to "Select category...").

    Returns JSON: { "success": true, "modules": [{module_id, module_name}, ...] }
    """
    cat_id = request.args.get('cat_id', '', type=int)
    if not cat_id:
        return jsonify({"success": True, "modules": []}), 200

    modules = get_modules_by_category(cat_id)
    return jsonify({"success": True, "modules": modules}), 200

@admin_bp.route('/create-learning-activity', methods=['GET'])
def create_learning_activity_page():
    greeting = "Welcome back"
    return render_template('create-learning-activity.html', greeting=greeting)

@admin_bp.route('/create-learning-activity/submit', methods=['POST'])
def create_activity_submit():
    # Extract submitted form data and dynamic questions
    activity_title = request.form.get('activity_title')
    course_id = request.form.get('course_id')
    module_id = request.form.get('module_id')
    lesson_id = request.form.get('lesson_id')
    activity_type = request.form.get('activity_type')
    points = request.form.get('points')
    status = request.form.get('status')
    
    # TODO: Insert activity and question sets into your database here
    
    flash('Learning activity created and published successfully!', 'success')
    return redirect(url_for('admin_bp.learning_activities'))

@admin_bp.route('/coding-exercises/create', methods=['GET'])
def create_coding_exercise():
    return render_template('create-coding-exercise.html')