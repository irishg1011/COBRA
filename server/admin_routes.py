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
    Makes `current_admin` available automatically to every template
    rendered by an admin_bp route (Dashboard, Account & Security, and any
    future admin page) without each route having to fetch and pass it
    individually.
    """
    return {"current_admin": get_current_admin()}


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


def get_accounts_overview(search_query=None):
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

        base_query += " ORDER BY a.created_at DESC"

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

        # Metrics should always reflect the FULL registry, not the filtered
        # search results, so compute them from an unfiltered pass whenever
        # this call itself was filtered.
        if term:
            full_overview = get_accounts_overview(search_query=None)
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
# ROUTE: LIVE ACCOUNT SEARCH (Task #16, JSON, called by fetch())
# ============================================================
@admin_bp.route('/accounts/search')
def search_accounts():
    """
    Backend-driven live search for the Account & Security table.

    Query param: ?q=<term>
    - Empty/missing q -> returns the full account list (same as page load).
    - Non-empty q -> case-insensitive partial match against full name,
      username, and email, filtered in SQL.

    Returns JSON: { "success": bool, "accounts": [...] }
    The frontend uses this to re-render only the table body - no page
    reload, and the search input's value is left untouched by the caller.
    """
    term = request.args.get('q', '')

    overview = get_accounts_overview(search_query=term)
    if overview is None:
        return jsonify({"success": False, "message": "Could not reach the database.", "accounts": []}), 500

    return jsonify({"success": True, "accounts": overview["accounts"]}), 200


@admin_bp.route('/login-logs.html')
def login_logs():
    """
    Renders the login logs page using the overview metrics and log data.
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

    logs = []

    return render_template(
        'login-logs.html',
        metrics=metrics,
        logs=logs
    )


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