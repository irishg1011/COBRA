import os
from functools import wraps
from datetime import datetime
from flask import Blueprint, render_template, session, redirect, request, jsonify, url_for
from mysql.connector import Error

from cobradb import get_db_connection

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


@admin_bp.context_processor
def inject_current_admin():
    """
    Makes `current_admin` AND `greeting` available automatically to every
    template rendered by an admin_bp route (Dashboard, Account & Security,
    and any future admin page) without each route having to fetch/compute
    and pass them individually.

    `greeting` is recomputed on every request (not cached), so it stays
    correct as time passes across a long-lived session, and `current_admin`
    is re-looked-up from the server-side session on every request, so the
    displayed name always matches whichever admin is actually logged in -
    switching accounts automatically shows the new admin's name with no
    extra wiring needed on any individual page.
    """
    return {
        "current_admin": get_current_admin(),
        "greeting": get_greeting(),
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

    Returns a list of dicts (each with log_id, acc_id, full_name, email,
    role, status, attempted_at) ready for direct use in Jinja (initial
    page load) or jsonify (the AJAX filter endpoint) - both consume the
    exact same shape. Returns None if the DB connection failed.
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
                    OR LOWER(ll.acc_id) LIKE %s
                )
            """
            prefix_term = f"{term.lower()}%"
            params.extend([prefix_term] * 5)

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
    Renders the login logs page using the overview metrics (shared with
    Account & Security) and real login log data (Task #18 - previously
    this always passed a hardcoded empty list).

    Calling get_login_logs_overview() with no filters here means the
    page shows the full, newest-first log the moment it loads - the
    same "server renders real data on load" pattern already used by
    account_security() above. admin-login-logs.js then takes over for
    live search/role/status/sort filtering without a page reload.
    """
    overview = get_accounts_overview()
    metrics = overview["metrics"] if overview else {
        "total_accounts": 0,
        "active_accounts": 0,
        "inactive_accounts": 0,
        "administrators": 0,
        "learners": 0,
        "locked_accounts": 0,
    }

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


@admin_bp.route('/create-administrator', methods=['POST'])
def create_administrator():
    """
    Handles the creation of a new administrator account from the modal form.
    """
    connection = get_db_connection()
    if connection is None:
        return redirect(url_for('admin_bp.account_security'))

    try:
        username = request.form.get('username')
        password = request.form.get('password')
        email = request.form.get('email')
        mobile = request.form.get('mobile')
        first_name = request.form.get('first_name')
        last_name = request.form.get('last_name')
        birthdate = request.form.get('birthdate')
        gender = request.form.get('gender')

        cursor = connection.cursor()

        # Insert your logic here to save the account and profile details securely
        # e.g., hashing password, generating account ID, etc.

        connection.commit()
        cursor.close()
    except Error as e:
        print(f"admin_routes: failed to create administrator: {e}")
    finally:
        if connection.is_connected():
            connection.close()

    return redirect(url_for('admin_bp.account_security'))