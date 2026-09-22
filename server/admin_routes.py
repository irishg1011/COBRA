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
    permanently_delete_module,  # NEW - Task #80: Archived Modules permanent delete
    archive_category, restore_category, permanently_delete_category, get_archived_categories,  # NEW - Task #87: Unified Archives
    publish_module, unpublish_module,  # NEW - Task #90: Module Publish/Unpublish
    check_module_archive_eligibility, check_category_archive_eligibility,  # NEW: fixes admin-relational-archive.js's pre-existing missing archive-check routes
    check_resource_archive_eligibility, check_activity_archive_eligibility, check_coding_exercise_archive_eligibility,  # NEW (Task #123): universal Published-dependency check
    mark_module_ready_to_publish, mark_category_ready_to_publish, move_category_to_draft,  # NEW - Task #publishing-schema: Ready to Publish queue actions
    publish_category,  # NEW - Task #publishing-page-backend: real Publish action for categories, reserved for the Publishing page
)
from learning_resources import (  # NEW - Task #37, #38, #39 & #40: Learning Resources DB integration
    get_resource_types, get_learning_resources_overview,
    get_resources_by_module,  # NEW - Task #54: dependent Lesson dropdown lookup
)
from learning_activities import (  # NEW: Manage Learning Activities DB integration
    get_activity_types,
    delete_activity as db_delete_activity,
    get_learning_activities_grouped_overview,  # NEW: Manage Learning Activities table restructure (grouped by Lesson)
    get_activities_for_resource, archive_activity,  # NEW: Content preview / Edit dropdown / Archive checklist
)
from learning_activity_draft import save_activity_draft, get_activity_draft  # NEW: Unsaved Changes Protection - draft autosave for Create Learning Activity
from learning_activity_form_parser import (  # NEW - Task #57: parses the raw multipart Publish submission's bracketed Section 2 fields (questions[]/fill_blanks[]/flashcards[]) into the same list-of-dicts shape Save Draft's JSON body already uses
    parse_questions_from_form, parse_fill_blanks_from_form, parse_flashcards_from_form,
)
from learning_activity_publishing import publish_activity, unpublish_activity, mark_ready_to_publish_activity  # NEW - Task #57 & #107: flips a saved activity's status between "Draft" and "Published", mirroring resource_publishing.py's publish_resource()/unpublish_resource() two-step pattern; mark_ready_to_publish_activity added for Task #publishing-schema
from lesson_validation import validate_lesson_title  # NEW - Task #42: global lesson-name uniqueness + sentence-case formatting
from resource_publishing import (  # NEW - Task #43: Draft-default + Publish/Unpublish workflow for learning resources
    get_draft_status_id, publish_resource, unpublish_resource,
    archive_resource,  # NEW - Task #81: Manage Learning Resources ACTIONS -> Archive
    mark_ready_to_publish_resource,  # NEW - Task #publishing-schema
)
from resource_draft import save_lesson_draft, get_lesson_draft  # NEW - Task #44: Upload Resource draft autosave; Task #45: reload saved content
from resource_form_publish import save_and_publish_lesson  # NEW - Task #95: shared save-then-publish for New Lesson
from activity_validation import validate_activity_title, validate_activity_type_for_lesson  # Task #53 & Task #62
from coding_exercises import (  # Task #66, #74, #76: Manage Coding Exercises DB integration
    get_coding_exercises_overview, get_exercise_stats, delete_coding_exercise,
    get_coding_exercise, validate_exercise_title, is_exercise_title_taken,
    save_coding_exercise, parse_test_cases_from_form,
)
from coding_exercise_publishing import publish_exercise, unpublish_exercise, archive_exercise, mark_ready_to_publish_exercise  # Task #111 & #112; mark_ready_to_publish_exercise added for Task #publishing-schema
from video_tutorials import (  # NEW: New Video Tutorial DB integration - Category -> Module -> Lesson cascade + Save Draft/Publish
    save_video_tutorial, get_video_tutorial,
    archive_video_tutorial,  # NEW: Manage Learning Resources Archive checklist - "Video Tutorial" option
    get_archived_video_tutorials, restore_video_tutorial, permanently_delete_video_tutorial,  # NEW: Archived Learning Resources modal - "Video Tutorial" tab
)
from archived_items import (  # NEW: fixes the pre-existing Archived Learning Resources/Activities modals - this file already existed fully written but was never wired up to any route
    get_archived_resources, restore_learning_resource, permanently_delete_learning_resource,
    get_archived_activities, restore_learning_activity,
    get_archived_exercises, restore_coding_exercise, permanently_delete_coding_exercise,  # NEW: same fix for Archived Coding Exercises modal
)
from publishing import get_publishing_tree, reorder_items 

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


@admin_bp.route('/manage-course/categories/<int:cat_id>/ready-to-publish', methods=['POST'])
def manage_course_category_ready_to_publish(cat_id):
    """Task #publishing-schema: marks a category Ready to Publish (queue-only, not live)."""
    success, message = mark_category_ready_to_publish(cat_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/manage-course/categories/<int:cat_id>/move-to-draft', methods=['POST'])
def manage_course_category_move_to_draft(cat_id):
    """Task #publishing-schema: reverts a category to Draft - backs both the "Move to Draft" and "Unpublish" buttons, which do the exact same thing."""
    success, message = move_category_to_draft(cat_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/manage-course/categories/<int:cat_id>/publish', methods=['POST'])
def manage_course_publish_category(cat_id):
    """Task #publishing-page-backend: publishes a category - the real, live-status action, only ever called from the Publishing page."""
    success, message = publish_category(cat_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)
 
 
@admin_bp.route('/manage-course/categories/<int:cat_id>/archive-check', methods=['GET'])
def manage_course_category_archive_check(cat_id):
    """
    Backs admin-relational-archive.js's "check -> warn OR confirm ->
    archive" flow for Categories - this route was already being called
    by that existing JS, it just never existed on the backend (a
    pre-existing gap, not something introduced here), which is why
    clicking the Category archive icon showed "Could not reach the
    server."
    """
    success, eligible, blockers, message = check_category_archive_eligibility(cat_id)
    if not success:
        return jsonify({"success": False, "message": message}), 400
    return jsonify({"success": True, "eligible": eligible, "blockers": blockers}), 200


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
 
 
@admin_bp.route('/manage-course/modules/<int:module_id>/archive-check', methods=['GET'])
def manage_course_module_archive_check(module_id):
    """
    Same fix as manage_course_category_archive_check() above, for
    Modules - admin-relational-archive.js was already calling this
    exact URL before ever attempting the actual archive.
    """
    success, eligible, blockers, message = check_module_archive_eligibility(module_id)
    if not success:
        return jsonify({"success": False, "message": message}), 400
    return jsonify({"success": True, "eligible": eligible, "blockers": blockers}), 200


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


@admin_bp.route('/manage-course/modules/<int:module_id>/publish', methods=['POST'])
def manage_course_publish_module(module_id):
    """Task #90: Publish a module (sets status to Published)."""
    success, message = publish_module(module_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/manage-course/modules/<int:module_id>/unpublish', methods=['POST'])
def manage_course_unpublish_module(module_id):
    """Task #90: Unpublish a module (sets status to Draft)."""
    success, message = unpublish_module(module_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/manage-course/modules/<int:module_id>/ready-to-publish', methods=['POST'])
def manage_course_ready_to_publish_module(module_id):
    """Task #publishing-schema: marks a module Ready to Publish (queue-only, not live)."""
    success, message = mark_module_ready_to_publish(module_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


# ============================================================
# Task #27 & #87: UNIFIED ARCHIVES - Modules & Categories
# ============================================================
@admin_bp.route('/manage-course/modules/archived')
def manage_course_archived_modules():
    """
    Live search/pagination for the Archived Modules view.
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
    Task #27: flips a module's is_archived flag back to 0.
    """
    success, message = restore_module(module_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/manage-course/modules/<int:module_id>/restore-options')
def manage_course_module_restore_options(module_id):
    """
    Backs admin-relational-archive.js's "restore with connected items"
    modal for Modules. archive_module() blocks archiving a module
    outright if it still has any active resources - it never cascades
    an archive down to children - so there's never anything connected
    to list here. Returns empty groups on purpose; the JS already
    falls back to "No connected items were archived alongside this
    module" when every group is empty.
    """
    return jsonify({"success": True, "resources": [], "activities": [], "exercises": []}), 200


@admin_bp.route('/manage-course/modules/<int:module_id>/restore-selected', methods=['POST'])
def manage_course_module_restore_selected(module_id):
    """
    Since restore-options above never reports any connected items to
    select, this just restores the module itself - same operation as
    manage_course_restore_module() above, called from the "connected
    items" modal's Confirm button instead of the plain Restore icon.
    """
    success, message = restore_module(module_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/manage-course/modules/<int:module_id>/permanent-delete', methods=['POST'])
def manage_course_permanently_delete_module(module_id):
    """
    Task #80: permanently removes an archived module from the database.
    """
    success, message = permanently_delete_module(module_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/manage-course/categories/archived')
def manage_course_archived_categories():
    """
    Task #87: Live search/pagination for the Archived Categories view.
    """
    search = request.args.get('q', '')
    page = request.args.get('page', 1, type=int)

    overview = get_archived_categories(search_query=search, page=page)
    if overview is None:
        return jsonify({"success": False, "message": "Could not reach the database."}), 500
    return jsonify({"success": True, **overview}), 200


@admin_bp.route('/manage-course/categories/<int:cat_id>/archive', methods=['POST'])
def manage_course_archive_category(cat_id):
    """
    Task #87: Soft-archives a category (is_archived = 1).
    """
    success, message = archive_category(cat_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/manage-course/categories/<int:cat_id>/restore', methods=['POST'])
def manage_course_restore_category(cat_id):
    """
    Task #87: Flips a category's is_archived flag back to 0.
    """
    success, message = restore_category(cat_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/manage-course/categories/<int:cat_id>/restore-options')
def manage_course_category_restore_options(cat_id):
    """
    Same fix as manage_course_module_restore_options() above, for
    Categories - archive_category() blocks archiving outright if any
    active modules still belong to it, so nothing is ever cascade-
    archived alongside it either.
    """
    return jsonify({"success": True, "modules": [], "resources": [], "activities": [], "exercises": []}), 200


@admin_bp.route('/manage-course/categories/<int:cat_id>/restore-selected', methods=['POST'])
def manage_course_category_restore_selected(cat_id):
    """Restores the category itself - see manage_course_module_restore_selected() above for why."""
    success, message = restore_category(cat_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/manage-course/categories/<int:cat_id>/permanent-delete', methods=['POST'])
def manage_course_permanently_delete_category(cat_id):
    """
    Task #87: Permanently deletes an archived category from the database.
    """
    success, message = permanently_delete_category(cat_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


# ============================================================
# ROUTE: PUBLISHING PAGE (Task #publishing-page-backend)
# ============================================================
@admin_bp.route('/publishing')
def publishing():
    """
    Renders the Publishing page with the full Category > Module >
    Lesson > Activities/Exercises tree, in learner order, server-side
    on load - same "server renders real data, JS takes over for live
    updates" pattern as every other page here. The Ready to Publish /
    Published tabs are a client-side filter over this same tree (see
    publishing.py's own docstring for why), not two separate queries.
    """
    import json
    tree = get_publishing_tree()
    return render_template('publishing.html', tree_json=json.dumps(tree))


@admin_bp.route('/publishing/data')
def publishing_data():
    """
    JSON refresh of the same tree - called after a Publish/Unpublish/
    reorder action instead of a full page reload, mirroring every
    other page's own /data endpoint convention.

    Returns JSON: { "success": bool, "tree": [...] }
    """
    return jsonify({"success": True, "tree": get_publishing_tree()}), 200


@admin_bp.route('/publishing/reorder', methods=['POST'])
def publishing_reorder():
    """
    Task #publishing-reorder-backend: persists a new order for a set of
    categories, modules, or lessons that share the same parent.

    Expects JSON body: { "type": "category" | "module" | "lesson",
    "parent_id": <id or null for category>, "ordered_ids": [id, id, ...] }

    Returns JSON: { "success": bool, "message": str }
    """
    data = request.get_json(silent=True) or {}
    success, message = reorder_items(
        data.get("type"),
        data.get("parent_id"),
        data.get("ordered_ids"),
    )
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


@admin_bp.route('/learning-resources/preview-content')
def learning_resources_preview_content():
    """
    Read-only preview for the Content column's document icon on Manage
    Learning Resources - reuses resource_draft.get_lesson_draft(), the
    SAME function New Lesson's own ?resource_id= reload path already
    uses, so this preview can never drift from what the actual editor
    would show. Returns JSON only; the frontend renders it inside a
    modal rather than navigating anywhere.
    """
    resource_id = request.args.get('resource_id', '')
    draft = get_lesson_draft(resource_id) if resource_id else None
    if not draft:
        return jsonify({"success": False, "message": "Content not found."}), 404

    return jsonify({
        "success": True,
        "title": draft.get("lesson_name"),
        "content_html": draft.get("content_html") or "",
    }), 200


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


@admin_bp.route('/learning-resources/<int:resource_id>/ready-to-publish', methods=['POST'])
def ready_to_publish_learning_resource(resource_id):
    """Task #publishing-schema: marks a resource Ready to Publish (queue-only, not live)."""
    success, message = mark_ready_to_publish_resource(resource_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


# ============================================================
# Task #81: ARCHIVE A LEARNING RESOURCE (ACTIONS column)
# ============================================================
@admin_bp.route('/learning-resources/<int:resource_id>/archive-check')
def learning_resource_archive_check(resource_id):
    """
    Task #123: backs the universal Published-dependency check for the
    Manage Learning Resources Archive checklist - now checks the
    Lesson's own status AND its Video Tutorial/Activities/Coding
    Exercises (previously only Video Tutorial was ever considered).
    """
    success, eligible, blockers, message = check_resource_archive_eligibility(resource_id)
    if not success:
        return jsonify({"success": False, "message": message}), 400
    return jsonify({"success": True, "eligible": eligible, "blockers": blockers}), 200


@admin_bp.route('/learning-resources/<int:resource_id>/archive', methods=['POST'])
def archive_learning_resource(resource_id):
    """
    Task #81: Manage Learning Resources table's ACTIONS -> Archive
    control. Thin HTTP wrapper only, matching this project's existing
    convention (see publish_learning_resource() /
    unpublish_learning_resource() above) - all real logic lives in
    resource_publishing.archive_resource().

    Returns JSON: { "success": bool, "message": str }
    """
    success, message = archive_resource(resource_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


# ============================================================
# ROUTES: ARCHIVED LEARNING RESOURCES MODAL (Lesson Content / Video Tutorial tabs)
# ============================================================
@admin_bp.route('/learning-resources/archived')
def learning_resources_archived():
    """
    Backs the Archived Learning Resources modal (archived-resources-
    modal.html / admin-archived-resources.js). This route - and its
    restore/permanent-delete counterparts below - previously didn't
    exist at all despite the modal's JS already calling them (a
    pre-existing gap, not something introduced here): archived_items.py
    already had a complete, correct implementation for the "Lesson
    Content" tab, it just had never been imported/wired into any route.

    The "Video Tutorial" tab uses a SEPARATE function
    (video_tutorials.get_archived_video_tutorials()) rather than
    archived_items.get_archived_resources(resource_type="Video
    Tutorial"), because a Video Tutorial is its own row in
    video_tutorials_tbl attached to an existing Lesson - never a
    learning_resources_tbl row of its own - so archived_items.py's
    resource_type_name-based filter would never match it.
    """
    resource_type = request.args.get('type', '')
    search = request.args.get('q', '')
    page = request.args.get('page', 1, type=int)

    if resource_type.strip().lower() == "video tutorial":
        overview = get_archived_video_tutorials(search_query=search, page=page)
    else:
        overview = get_archived_resources(resource_type=resource_type, search_query=search, page=page)

    if overview is None:
        return jsonify({"success": False, "message": "Could not reach the database."}), 500
    return jsonify({"success": True, **overview}), 200


@admin_bp.route('/learning-resources/<int:resource_id>/restore', methods=['POST'])
def restore_learning_resource_route(resource_id):
    """
    type=Video%20Tutorial routes to video_tutorials.restore_video_
    tutorial() instead (a video's own video_tutorial_id and a Lesson's
    resource_id are separate id spaces that can numerically collide,
    so the tab the request came from - passed by admin-archived-
    resources.js as ?type= - is what disambiguates which table this
    id actually belongs to, not the id's value alone).
    """
    resource_type = request.args.get('type', '')
    if resource_type.strip().lower() == "video tutorial":
        success, message = restore_video_tutorial(resource_id)
    else:
        success, message = restore_learning_resource(resource_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/learning-resources/<int:resource_id>/permanent-delete', methods=['POST'])
def permanently_delete_learning_resource_route(resource_id):
    """See restore_learning_resource_route() above for why ?type= is required to disambiguate."""
    resource_type = request.args.get('type', '')
    if resource_type.strip().lower() == "video tutorial":
        success, message = permanently_delete_video_tutorial(resource_id)
    else:
        success, message = permanently_delete_learning_resource(resource_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/learning-activities')
def learning_activities():
    """
    Renders the Manage Learning Activities page with LIVE data.

    q / type / sort / page / created_from / created_to / updated_from /
    updated_to all come from the query string (all optional), so a
    bookmarked/shared filtered URL renders the same result on load -
    same convention as learning_resources() / manage_course().
    """
    search = request.args.get('q', '')
    type_filter = request.args.get('type', '')
    sort = request.args.get('sort', '')
    page = request.args.get('page', 1, type=int)

    created_from = request.args.get('created_from', '') or None
    created_to = request.args.get('created_to', '') or None
    updated_from = request.args.get('updated_from', '') or None
    updated_to = request.args.get('updated_to', '') or None

    overview = get_learning_activities_grouped_overview(
        search_query=search, type_filter=type_filter, page=page,
        sort_by=sort,
        created_from=created_from, created_to=created_to,
        updated_from=updated_from, updated_to=updated_to,
    )
    if overview is None:
        overview = {"lessons": [], "total": 0, "page": 1, "per_page": 8, "total_pages": 1}

    return render_template(
        'manage-learning-activities.html',
        lessons=overview["lessons"],
        total_activities=overview["total"],
        page=overview["page"],
        total_pages=overview["total_pages"],
        activity_types=get_activity_types(),
        created_from=created_from or '',
        created_to=created_to or '',
        updated_from=updated_from or '',
        updated_to=updated_to or '',
        sort=sort or '',
    )


# ============================================================
# ROUTE: LIVE LEARNING ACTIVITIES SEARCH + FILTER + SORT + DATE (JSON)
# ============================================================
@admin_bp.route('/learning-activities/data')
def learning_activities_data():
    """
    Backend-driven live search/type-filter/sort/date-filter/pagination
    for the Manage Learning Activities table - JSON, mirroring
    learning_resources_data()'s pattern exactly for consistency.

    Query params (all optional):
      q             - free-text search term (Activity Name, Lesson
                      Name, Category, Module, Activity Type, Uploaded By)
      type          - the real activity_type_id from activity_types_tbl
      sort          - "created_desc" (default), "created_asc", or
                      "updated_desc"
      page          - page number
      created_from / created_to / updated_from / updated_to - 'YYYY-MM-DD'

    Returns JSON: { "success": bool, "activities": [...], "total": int,
    "page": int, "total_pages": int }
    """
    search = request.args.get('q', '')
    type_filter = request.args.get('type', '')
    sort = request.args.get('sort', '')
    page = request.args.get('page', 1, type=int)

    created_from = request.args.get('created_from', '') or None
    created_to = request.args.get('created_to', '') or None
    updated_from = request.args.get('updated_from', '') or None
    updated_to = request.args.get('updated_to', '') or None

    # Server-side range validation - never trust only the frontend's own
    # check, matching manage_course_data()'s / learning_resources_data()'s
    # own validation convention.
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

    overview = get_learning_activities_grouped_overview(
        search_query=search, type_filter=type_filter, page=page,
        sort_by=sort,
        created_from=created_from, created_to=created_to,
        updated_from=updated_from, updated_to=updated_to,
    )
    if overview is None:
        return jsonify({"success": False, "message": "Could not reach the database."}), 500
    return jsonify({"success": True, **overview}), 200


@admin_bp.route('/learning-activities/preview')
def learning_activities_preview():
    """
    Read-only preview for the ACTIVITY column's icon buttons AND the
    data source for the Edit dropdown / Archive checklist on Manage
    Learning Activities - all three need the SAME "every individual
    activity this Lesson has, with full content" shape, so one route
    (backed by learning_activities.get_activities_for_resource())
    serves all three rather than three near-duplicate endpoints.
    """
    resource_id = request.args.get('resource_id', '')
    activities = get_activities_for_resource(resource_id) if resource_id else []
    return jsonify({"success": True, "activities": activities}), 200


@admin_bp.route('/learning-activities/<int:activity_id>/archive-check')
def learning_activity_archive_check(activity_id):
    """Task #123: universal Published-dependency check for a single Learning Activity (a leaf node - self-status only)."""
    success, eligible, blockers, message = check_activity_archive_eligibility(activity_id)
    if not success:
        return jsonify({"success": False, "message": message}), 400
    return jsonify({"success": True, "eligible": eligible, "blockers": blockers}), 200


@admin_bp.route('/learning-activities/<int:activity_id>/archive', methods=['POST'])
def archive_learning_activity(activity_id):
    """
    Task: finally implements the route the ACTIONS column's Archive
    checklist actually calls - the pre-existing /js-archive-activity-
    btn click handler was already fetching this exact URL, but only a
    hard-delete /delete route existed, so archiving silently 404'd.
    Soft-archives via learning_activities.archive_activity() (flips
    la_stats_id to "Archived") - never a DELETE.
    """
    success, message = archive_activity(activity_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


# ============================================================
# ROUTES: ARCHIVED LEARNING ACTIVITIES MODAL (MCT / FIB / Flashcards tabs)
# ============================================================
@admin_bp.route('/learning-activities/archived')
def learning_activities_archived():
    """
    Backs the Archived Learning Activities modal (archived-activities-
    modal.html / admin-archived-activities.js). Same pre-existing gap
    as learning_resources_archived() above: archived_items.py already
    had a complete, correct get_archived_activities() implementation
    (it already handles "Multiple Choice"/"Fill in the Blanks"/
    "Flashcards" as well as short "mct"/"fib"/"fc" aliases), it just
    had never been imported/wired into any route.
    """
    activity_type = request.args.get('type', '')
    search = request.args.get('q', '')
    page = request.args.get('page', 1, type=int)

    overview = get_archived_activities(activity_type=activity_type, search_query=search, page=page)
    if overview is None:
        return jsonify({"success": False, "message": "Could not reach the database."}), 500
    return jsonify({"success": True, **overview}), 200


@admin_bp.route('/learning-activities/<int:activity_id>/restore', methods=['POST'])
def restore_learning_activity_route(activity_id):
    success, message = restore_learning_activity(activity_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/learning-activities/<int:activity_id>/permanent-delete', methods=['POST'])
def permanently_delete_learning_activity_route(activity_id):
    """
    Reuses the SAME db_delete_activity() (learning_activities.
    delete_activity()) the existing /learning-activities/<id>/delete
    route already calls - a real hard delete with correct cascading
    cleanup of mcq_options_tbl/mcq_questions_tbl/fill_blanks_tbl/
    flashcards_tbl - rather than a second, separately-written copy of
    the same operation.
    """
    success, message = db_delete_activity(activity_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


# ============================================================
# ROUTE: TASK #107 - QUICK PUBLISH / UNPUBLISH A LEARNING ACTIVITY
# ============================================================
@admin_bp.route('/learning-activities/<int:activity_id>/publish', methods=['POST'])
def publish_learning_activity(activity_id):
    """
    Task #107: flips a learning activity's status to "Published" directly
    from the Manage Learning Activities table's row-level toggle - no need
    to open the full Create/Edit Learning Activity screen first. Thin HTTP
    wrapper only, matching this project's existing convention (see
    publish_learning_resource() above) - all real logic lives in
    learning_activity_publishing.publish_activity().

    Returns JSON: { "success": bool, "message": str }
    """
    success, message = publish_activity(activity_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/learning-activities/<int:activity_id>/unpublish', methods=['POST'])
def unpublish_learning_activity(activity_id):
    """
    Task #107: flips a learning activity's status back to "Draft" directly
    from the Manage Learning Activities table's row-level toggle. Thin
    HTTP wrapper only - all real logic lives in
    learning_activity_publishing.unpublish_activity().

    Returns JSON: { "success": bool, "message": str }
    """
    success, message = unpublish_activity(activity_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/learning-activities/<int:activity_id>/ready-to-publish', methods=['POST'])
def ready_to_publish_learning_activity(activity_id):
    """Task #publishing-schema: marks a learning activity Ready to Publish (queue-only, not live)."""
    success, message = mark_ready_to_publish_activity(activity_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


# ============================================================
# ROUTE: DELETE LEARNING ACTIVITY
# ============================================================
@admin_bp.route('/learning-activities/<int:activity_id>/delete', methods=['POST'])
def delete_activity(activity_id):
    """
    Deletes a learning activity and all of its associated child records.
    Supports both JSON/fetch calls and standard HTML form POSTs.
    """
    success, message = db_delete_activity(activity_id)
    if request.is_json or request.headers.get('Accept') == 'application/json' or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return jsonify({"success": success, "message": message}), (200 if success else 400)
    flash(message, 'success' if success else 'error')
    return redirect(url_for('admin_bp.learning_activities'))


# ============================================================
# ROUTE: MANAGE CODING EXERCISES (PAGE VIEW)
# ============================================================
@admin_bp.route('/coding-exercises')
def coding_exercises():
    """
    Task #66: Renders the Manage Coding Exercises page with LIVE data
    joined from coding_exercises_tbl, learning_resources_tbl, modules_tbl,
    category_tbl, learning_activities_stats_tbl, and profile_tbl.
    """
    search = request.args.get('q', '')
    stats_filter = request.args.get('stats', '')
    sort = request.args.get('sort', '')
    page = request.args.get('page', 1, type=int)

    created_from = request.args.get('created_from', '') or None
    created_to = request.args.get('created_to', '') or None
    updated_from = request.args.get('updated_from', '') or None
    updated_to = request.args.get('updated_to', '') or None

    overview = get_coding_exercises_overview(
        search_query=search, stats_filter=stats_filter, page=page,
        sort_by=sort,
        created_from=created_from, created_to=created_to,
        updated_from=updated_from, updated_to=updated_to,
    )
    if overview is None:
        overview = {"exercises": [], "total": 0, "page": 1, "per_page": 8, "total_pages": 1}

    return render_template(
        'coding-exercises.html',
        exercises=overview["exercises"],
        total_exercises=overview["total"],
        page=overview["page"],
        total_pages=overview["total_pages"],
        exercise_stats=get_exercise_stats(),
        created_from=created_from or '',
        created_to=created_to or '',
        updated_from=updated_from or '',
        updated_to=updated_to or '',
        sort=sort or '',
        search=search or '',
    )


# ============================================================
# ROUTE: LIVE CODING EXERCISES SEARCH + FILTER + SORT (JSON)
# ============================================================
@admin_bp.route('/coding-exercises/data')
def coding_exercises_data():
    """
    Backend-driven live search/filter/sort/pagination for Manage Coding Exercises.
    """
    search = request.args.get('q', '')
    stats_filter = request.args.get('stats', '')
    sort = request.args.get('sort', '')
    page = request.args.get('page', 1, type=int)

    created_from = request.args.get('created_from', '') or None
    created_to = request.args.get('created_to', '') or None
    updated_from = request.args.get('updated_from', '') or None
    updated_to = request.args.get('updated_to', '') or None

    overview = get_coding_exercises_overview(
        search_query=search, stats_filter=stats_filter, page=page,
        sort_by=sort,
        created_from=created_from, created_to=created_to,
        updated_from=updated_from, updated_to=updated_to,
    )
    if overview is None:
        return jsonify({"success": False, "exercises": [], "total": 0, "page": 1, "total_pages": 1}), 500

    return jsonify({
        "success": True,
        "exercises": overview["exercises"],
        "total": overview["total"],
        "page": overview["page"],
        "total_pages": overview["total_pages"],
    }), 200


# ============================================================
# ROUTE: DELETE CODING EXERCISE
# ============================================================
@admin_bp.route('/coding-exercises/delete/<int:exercise_id>', methods=['POST'])
def delete_exercise(exercise_id):
    """
    Task #66: Deletes a coding exercise and cascades associated test cases.
    """
    success, message = delete_coding_exercise(exercise_id)
    flash(message, 'success' if success else 'error')
    return redirect(url_for('admin_bp.coding_exercises'))


# ============================================================
# ROUTE: PUBLISH / UNPUBLISH CODING EXERCISE
# ============================================================
@admin_bp.route('/coding-exercises/<int:exercise_id>/publish', methods=['POST'])
def publish_coding_exercise(exercise_id):
    """
    Task #111: flips a coding exercise's status to "Published" directly
    from the Manage Coding Exercises table's row-level toggle.
    Returns JSON: { "success": bool, "message": str }
    """
    success, message = publish_exercise(exercise_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/coding-exercises/<int:exercise_id>/unpublish', methods=['POST'])
def unpublish_coding_exercise(exercise_id):
    """
    Task #111: flips a coding exercise's status back to "Draft" directly
    from the Manage Coding Exercises table's row-level toggle or editor header.
    Returns JSON: { "success": bool, "message": str }
    """
    success, message = unpublish_exercise(exercise_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/coding-exercises/<int:exercise_id>/ready-to-publish', methods=['POST'])
def ready_to_publish_coding_exercise(exercise_id):
    """Task #publishing-schema: marks a coding exercise Ready to Publish (queue-only, not live)."""
    success, message = mark_ready_to_publish_exercise(exercise_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


# ============================================================
# ROUTES: ARCHIVED CODING EXERCISES MODAL
# ============================================================
@admin_bp.route('/coding-exercises/archived')
def coding_exercises_archived():
    """
    Backs the Archived Coding Exercises modal (admin-archived-exercises.js).
    Same pre-existing gap as the Resources/Activities modals: this route
    never existed even though the JS was already calling it -
    archived_items.get_archived_exercises() was already written and
    just needed wiring up.
    """
    search = request.args.get('q', '')
    page = request.args.get('page', 1, type=int)

    overview = get_archived_exercises(search_query=search, page=page)
    if overview is None:
        return jsonify({"success": False, "message": "Could not reach the database."}), 500
    return jsonify({"success": True, **overview}), 200


@admin_bp.route('/coding-exercises/<int:exercise_id>/restore', methods=['POST'])
def restore_coding_exercise_route(exercise_id):
    success, message = restore_coding_exercise(exercise_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/coding-exercises/<int:exercise_id>/permanent-delete', methods=['POST'])
def permanently_delete_coding_exercise_route(exercise_id):
    success, message = permanently_delete_coding_exercise(exercise_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


# ============================================================
# ROUTE: ARCHIVE CODING EXERCISE
# ============================================================
@admin_bp.route('/coding-exercises/<int:exercise_id>/archive-check')
def coding_exercise_archive_check(exercise_id):
    """Task #123: universal Published-dependency check for a single Coding Exercise (a leaf node - self-status only)."""
    success, eligible, blockers, message = check_coding_exercise_archive_eligibility(exercise_id)
    if not success:
        return jsonify({"success": False, "message": message}), 400
    return jsonify({"success": True, "eligible": eligible, "blockers": blockers}), 200


@admin_bp.route('/coding-exercises/<int:exercise_id>/archive', methods=['POST'])
def archive_coding_exercise(exercise_id):
    """
    Task #112: Soft-archives a coding exercise (is_archived = 1, status = 'Archived').
    Preserves database records and associated test cases.
    Returns JSON: { "success": bool, "message": str }
    """
    is_ajax = request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.args.get('format') == 'json'
    success, message = archive_exercise(exercise_id)

    if is_ajax:
        return jsonify({"success": success, "message": message}), (200 if success else 400)

    flash(message, 'success' if success else 'error')
    return redirect(url_for('admin_bp.coding_exercises'))


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

@admin_bp.route('/upload-video-tutorial', methods=['GET'])
def upload_video_tutorial():
    """
    Renders the New Video Tutorial page. Category options are real
    (get_categories(), same as upload_resource()/create_learning_
    activity_page()) - never hardcoded. The Module and Lesson
    dropdowns start empty/disabled in the template and are populated
    live by upload-video-tutorial-ui.js, reusing the SAME dependent-
    dropdown endpoints Create Learning Activity / Create Coding
    Exercise already use:
        /admin/upload-resource/modules-by-category
        /admin/create-learning-activity/lessons-by-module
    - no duplicate Category -> Module -> Lesson endpoints created for
    this page.

    On GET, an optional ?video_id= query param reloads a previously
    saved video tutorial's fields back into the form via
    video_tutorials.get_video_tutorial(), mirroring upload_resource()'s
    own ?resource_id=-based reload (Task #45) and
    create_coding_exercise()'s ?exercise_id=-based reload.
    """
    video_id = request.args.get('video_id', '') or None
    existing_video = get_video_tutorial(video_id) if video_id else None

    return render_template(
        'upload-video-tutorial.html',
        categories=get_categories(),
        existing_video=existing_video,
    )


# ============================================================
# ROUTE: NEW VIDEO TUTORIAL - SAVE DRAFT / PUBLISH
# ============================================================
def _handle_video_tutorial_submit(status):
    """
    Shared handler for both Save Draft and Publish below - a thin HTTP
    wrapper only. All validation/persistence logic lives in
    video_tutorials.py, per this project's existing convention (see
    upload_resource_save_draft() / save_coding_exercise_draft()) - no
    new backend logic lives inline here.

    Task: New Video Tutorial no longer uploads a file - the admin
    pastes a YouTube link instead (validated/normalized to just its
    video id in video_tutorials.save_video_tutorial()) - so this is
    now plain JSON, not multipart/form-data.
    """
    payload = request.get_json(silent=True) or {}

    data = {
        "video_tutorial_id": payload.get('video_tutorial_id'),
        "video_title": payload.get('video_title'),
        "category_id": payload.get('category_id'),
        "module_id": payload.get('module_id'),
        "resource_id": payload.get('resource_id'),
        "description": payload.get('description'),
        "video_url": payload.get('video_url'),
    }

    success, video_tutorial_id, message = save_video_tutorial(
        data, status=status, uploaded_by=session.get('admin_id')
    )

    return jsonify({
        "success": success,
        "message": message,
        "video_tutorial_id": video_tutorial_id,
    }), (200 if success else 400)


@admin_bp.route('/upload-video-tutorial/save-draft', methods=['POST'])
def upload_video_tutorial_save_draft():
    """
    Saves the New Video Tutorial form's current in-progress values
    (title, Category/Module/Lesson, description, and a YouTube video
    link) as a real Draft row in video_tutorials_tbl, mirroring
    upload_resource_save_draft() / save_coding_exercise_draft()'s
    pattern. Does NOT require a video link or description (Task #10) -
    only Category, Module, Lesson and Title.
    """
    return _handle_video_tutorial_submit(status="Draft")


@admin_bp.route('/upload-video-tutorial/publish', methods=['POST'])
def upload_video_tutorial_publish():
    """
    Publishes the New Video Tutorial form - the SAME save path as Save
    Draft (video_tutorials.save_video_tutorial()), just with
    status="Published", which additionally requires a YouTube video
    link (either provided this request or already attached from a
    prior Save Draft) and a description (Task #11).
    """
    return _handle_video_tutorial_submit(status="Published")


@admin_bp.route('/upload-video-tutorial/<int:video_tutorial_id>/archive', methods=['POST'])
def archive_video_tutorial_route(video_tutorial_id):
    """
    Backs the "Video Tutorial" option in Manage Learning Resources'
    Archive checklist modal - archives just the video
    (video_tutorials.archive_video_tutorial(), flips video_stats_id to
    "Archived") independently of its parent Lesson's own status, since
    a Lesson can keep its text content active while its attached video
    is retired, or vice versa.
    """
    success, message = archive_video_tutorial(video_tutorial_id)
    return jsonify({"success": success, "message": message}), (200 if success else 400)


@admin_bp.route('/upload-resource', methods=['GET', 'POST'])
def upload_resource():
    """
    Task #42: the lesson's title (posted as `lesson_name`) is still
    validated first - normalized to sentence case, then checked for
    GLOBAL uniqueness across every category and module in
    learning_resources_tbl. That rule now lives one level down, inside
    resource_draft.save_lesson_draft() (which itself calls
    lesson_validation.validate_lesson_title() - never re-implemented
    here), since Task #45 needs the SAME save path Publish and Save
    Draft both go through.

    Task #45: this route used to stop at validating the title and threw
    everything else away (see the old commented-out INSERT that never
    ran). It now actually PERSISTS the lesson - metadata (title,
    category, module) AND the full rich-text content, including every
    nested interactive block (code console containers with their
    filename/mode/expected-output fields, terminal blocks) - via
    resource_draft.save_lesson_draft(), the exact same function
    upload_resource_save_draft() below already uses for "Save Draft".
    Publish and Save Draft can therefore never disagree about how a
    lesson is stored; the only thing Publish does on top of that is
    flip the resource's status to "Published" afterward via
    resource_publishing.publish_resource() - which still enforces its
    own authoritative "parent module must already be Published" gate
    regardless of what this route does. No new persistence logic lives
    inline here - both save_lesson_draft() (resource_draft.py) and
    publish_resource() (resource_publishing.py) are the single sources
    of truth, matching this project's existing convention.

    On failure (missing/duplicate title, or the save otherwise fails),
    the error is flashed and the admin is redirected back to this same
    page - no partial/invalid data is ever saved.

    On GET, an optional ?resource_id= query param reloads a previously
    saved resource (its metadata AND its full content_body - every
    embedded interactive block included) back into the form/editor via
    resource_draft.get_lesson_draft(), instead of always starting
    blank. Absent/invalid/unknown resource_id behaves exactly like
    before - a normal blank form.
    """
    if request.method == 'POST':
        lesson_name = (request.form.get('lesson_name') or '').strip()
        cat_id = request.form.get('category_id') or None
        module_id = request.form.get('module_id') or None
        module_content = request.form.get('module_content') or ''
        resource_id = request.form.get('resource_id') or None

        success, message, saved_resource_id = save_and_publish_lesson(
            resource_id=resource_id,
            lesson_name=lesson_name,
            cat_id=cat_id,
            module_id=module_id,
            content_html=module_content,
            uploaded_by=session.get('admin_id'),
        )

        if not success:
            flash(message, 'error')
            # Keep the admin on the same in-progress resource (if one
            # already exists) rather than bouncing them back to a blank
            # form and losing their place.
            redirect_resource_id = saved_resource_id or resource_id
            if redirect_resource_id:
                return redirect(url_for('admin_bp.upload_resource', resource_id=redirect_resource_id))
            return redirect(url_for('admin_bp.upload_resource'))

        flash(message, 'success')
        return redirect(url_for('admin_bp.learning_resources'))

    # Task #41: Category dropdown is rendered server-side from real
    # category_tbl rows (same get_categories() Manage Course already
    # uses) - never hardcoded. The Module dropdown starts empty/disabled
    # in the template and is populated live by upload-resource.js once
    # the Admin picks a Category (or immediately, if reloading an
    # existing resource - see below).
    resource_id = request.args.get('resource_id', '') or None
    existing_resource = get_lesson_draft(resource_id) if resource_id else None

    return render_template(
        'upload-resource.html',
        categories=get_categories(),
        existing_resource=existing_resource,
    )


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
# ROUTE: TASK #53 - LIVE ACTIVITY TITLE UNIQUENESS CHECK
# ============================================================
@admin_bp.route('/create-learning-activity/check-activity-name')
def create_learning_activity_check_name():
    """
    Task #53: backs create-learning-activity-validation.js's live,
    debounced duplicate check while the admin types an activity title -
    mirrors upload_resource_check_lesson_name()'s exact pattern. Purely
    a UX convenience: create_activity_submit() below (and
    learning_activity_draft.save_activity_draft(), used by Save Draft)
    always re-validate uniqueness themselves via the SAME
    activity_validation module before anything is ever saved, so this
    endpoint being skipped or spoofed can't bypass anything.

    Query params:
      name - the activity title currently typed (raw, not yet
             normalized - normalization happens inside
             validate_activity_title()).

    Returns JSON:
      { "success": true, "available": bool, "normalized": str }  - on a
        successful check (available may still be False for a duplicate)
      { "success": true, "available": false, "message": str }    - when
        the title can't be validated yet (e.g. still empty)
      400 - no `name` query param supplied at all
    """
    name = (request.args.get('name') or '').strip()
    if not name:
        return jsonify({"success": False, "message": "Activity title is required."}), 400

    is_valid, result = validate_activity_title(name)
    if not is_valid:
        return jsonify({"success": True, "available": False, "message": result}), 200

    return jsonify({"success": True, "available": True, "normalized": result}), 200


# ============================================================
# ROUTE: TASK #62 - LIVE LESSON ACTIVITY TYPE UNIQUENESS CHECK
# ============================================================
@admin_bp.route('/create-learning-activity/check-lesson-activity-type')
def create_learning_activity_check_lesson_activity_type():
    """
    Task #62: Live check to ensure that for any given lesson (resource_id),
    only one active activity entry per unique activity type (Multiple Choice,
    Fill in the Blanks, and Flashcards) can exist, preventing duplicate activity
    creations.

    Query params:
      lesson_id     - selected learning_resources_tbl.resource_id
      activity_type - selected activity type name (e.g. "Multiple Choice")
      activity_id   - optional existing activity ID being edited (to exclude self)

    Returns JSON:
      { "success": true, "available": bool, "message": str | None }
    """
    lesson_id = request.args.get('lesson_id')
    activity_type = request.args.get('activity_type')
    activity_id = request.args.get('activity_id')

    if not lesson_id or not activity_type:
        return jsonify({"success": True, "available": True, "message": None}), 200

    is_valid, error_message = validate_activity_type_for_lesson(
        lesson_id, activity_type, exclude_la_id=activity_id
    )

    if not is_valid:
        return jsonify({"success": True, "available": False, "message": error_message}), 200

    return jsonify({"success": True, "available": True, "message": None}), 200


# ============================================================
# ROUTE: TASK #44 - SAVE UPLOAD RESOURCE FORM AS A DRAFT
# ============================================================
@admin_bp.route('/upload-resource/save-draft', methods=['POST'])
def upload_resource_save_draft():
    """
    Task #44: saves the Upload Resource form's current in-progress
    values (lesson name, category, module, rich-text content) as a
    real Draft row, so the admin's work survives navigating away
    mid-edit. All persistence logic lives in resource_draft.py - this
    route is a thin HTTP wrapper only, matching this project's existing
    convention (see publish_learning_resource(), manage_course_delete_module(), etc.).

    Expects JSON body: { resource_id, lesson_name, category_id, module_id, module_content }
    resource_id is omitted/null on the very first save; the frontend
    (upload-resource-draft-guard.js) echoes it back on every save
    afterward so this always updates the SAME row in place.

    Returns JSON: { "success": bool, "message": str, "resource_id": int | None }
    """
    data = request.get_json(silent=True) or {}
    preserve_status = bool(data.get('preserve_status', False))

    success, message, saved_resource_id = save_lesson_draft(
        resource_id=data.get('resource_id'),
        lesson_name=data.get('lesson_name'),
        cat_id=data.get('category_id'),
        module_id=data.get('module_id'),
        content_html=data.get('module_content') or '',
        uploaded_by=session.get('admin_id'),
        preserve_status=preserve_status,
    )
    return jsonify({
        "success": success,
        "message": message,
        "resource_id": saved_resource_id,
    }), (200 if success else 400)


# ============================================================
# ROUTE: TASK #95 - PUBLISH UPLOAD RESOURCE (JSON)
# ============================================================
@admin_bp.route('/upload-resource/publish', methods=['POST'])
def upload_resource_publish():
    """
    Task #95: JSON Publish for the New Lesson form so the frontend can
    show a floating success toast before leaving the page. Same
    save-then-publish path as the HTML POST on /admin/upload-resource
    (resource_form_publish.save_and_publish_lesson). This route is a
    thin HTTP wrapper only.

    Expects JSON body: { resource_id, lesson_name, category_id, module_id, module_content }

    Returns JSON: { "success": bool, "message": str, "resource_id": int | None }
    """
    data = request.get_json(silent=True) or {}

    success, message, saved_resource_id = save_and_publish_lesson(
        resource_id=data.get('resource_id'),
        lesson_name=data.get('lesson_name'),
        cat_id=data.get('category_id'),
        module_id=data.get('module_id'),
        content_html=data.get('module_content') or '',
        uploaded_by=session.get('admin_id'),
    )
    return jsonify({
        "success": success,
        "message": message,
        "resource_id": saved_resource_id,
    }), (200 if success else 400)


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


# ============================================================
# ROUTE: TASK #54 - LESSONS DEPENDENT ON SELECTED MODULE
# (Create Learning Activity: Category -> Module -> Lesson)
# ============================================================
@admin_bp.route('/create-learning-activity/lessons-by-module')
def create_learning_activity_lessons_by_module():
    """
    Task #54: backs the Create Learning Activity form's dependent Lesson
    dropdown - the second step of the Category -> Module -> Lesson
    cascade. Takes a single query param, `module_id`, and returns ONLY
    the lessons (learning_resources_tbl rows) whose module_id matches it
    - via learning_resources.get_resources_by_module()'s parameterized
    query, so the selected module id is never concatenated into SQL.
    Mirrors upload_resource_modules_by_category()'s exact pattern
    (Task #41) one level deeper.

    A missing/invalid module_id returns an empty lesson list rather than
    a 400, since the frontend calls this defensively on every Module
    change (including back to "Select module...").

    Returns JSON: { "success": true, "lessons": [{resource_id, resource_title}, ...] }
    """
    module_id = request.args.get('module_id', '', type=int)
    if not module_id:
        return jsonify({"success": True, "lessons": []}), 200

    lessons = get_resources_by_module(module_id)
    return jsonify({"success": True, "lessons": lessons}), 200


@admin_bp.route('/create-learning-activity', methods=['GET'])
def create_learning_activity_page():
    """
    Renders the Create Learning Activity form.

    On GET, an optional ?activity_id= query param reloads a previously
    saved draft's Activity Information fields back into the form - via
    learning_activity_draft.get_activity_draft() - instead of always
    starting blank, mirroring upload_resource()'s own
    ?resource_id=-based reload (Task #45).
    """
    greeting = "Welcome back"
    activity_id = request.args.get('activity_id', '') or None
    existing_activity = get_activity_draft(activity_id) if activity_id else None

    # Task #54: Category dropdown is rendered server-side from real
    # category_tbl rows (the SAME get_categories() Manage Course and
    # Upload Resource already use) - never hardcoded. The Module and
    # Lesson dropdowns start empty/disabled in the template and are
    # populated live by create-learning-activity-dependencies.js once
    # the admin picks a Category, then a Module - or immediately, if
    # reloading an existing draft (see existing_activity.cat_id/
    # module_id/resource_id below, and the matching
    # data-preselect-*-id attributes in create-learning-activity.html).
    return render_template(
        'create-learning-activity.html',
        greeting=greeting,
        existing_activity=existing_activity,
        categories=get_categories(),
    )


# ============================================================
# ROUTE: SAVE CREATE LEARNING ACTIVITY FORM AS A DRAFT
# ============================================================
@admin_bp.route('/create-learning-activity/save-draft', methods=['POST'])
def create_learning_activity_save_draft():
    """
    Task #56: saves the Create Learning Activity form's current
    in-progress state as a real Draft row - Section 1 (Activity
    Information) AND Section 2 (questions / fill-in-the-blank items /
    flashcards, whichever the selected Activity Type is using) - so
    the admin's work survives navigating away mid-edit and the Manage
    Learning Activities table/points reflect the actual saved content
    immediately. All persistence logic lives in
    learning_activity_draft.py (Section 1 + orchestration) and
    learning_activity_content.py (Section 2) - this route is a thin
    HTTP wrapper only.

    Expects JSON body: { activity_id, activity_title, category_id,
    module_id, lesson_id, activity_type, questions, fill_blanks,
    flashcards }

    activity_id is omitted/null on the very first save; the frontend
    (create-learning-activity-draft-guard.js) echoes it back on every
    save afterward so this always updates the SAME row in place.

    Returns JSON: { "success": bool, "message": str,
    "activity_id": int | None, "points": int }
    """
    data = request.get_json(silent=True) or {}

    success, message, saved_activity_id, points = save_activity_draft(
        activity_id=data.get('activity_id'),
        activity_title=data.get('activity_title'),
        cat_id=data.get('category_id'),
        module_id=data.get('module_id'),
        resource_id=data.get('lesson_id'),
        activity_type=data.get('activity_type'),
        questions=data.get('questions'),
        fill_blanks=data.get('fill_blanks'),
        flashcards=data.get('flashcards'),
        uploaded_by=session.get('admin_id'),
    )
    return jsonify({
        "success": success,
        "message": message,
        "activity_id": saved_activity_id,
        "points": points,
    }), (200 if success else 400)

@admin_bp.route('/create-learning-activity/submit', methods=['POST'])
def create_activity_submit():
    """
    Task #57: Publish handler for Create Learning Activity.

    Before this task, this route only validated the activity title and
    then hit a bare "TODO: Insert activity and question sets" - nothing
    was ever actually saved (no learning_activities_tbl row, no
    questions/fill-blanks/flashcards). This now persists EVERYTHING the
    form submitted:

      1. Section 2 (questions[]/fill_blanks[]/flashcards[]) is parsed out
         of the raw multipart form's bracketed field names via
         learning_activity_form_parser.py - never re-implemented here.
      2. Section 1 + Section 2 are both saved together by reusing
         learning_activity_draft.save_activity_draft() - the EXACT same
         function "Save Draft" already uses. This means Publish gets,
         for free and without a second/divergent code path:
             - Task #53's casing normalization + global title uniqueness
               (validate_activity_title, called inside save_activity_draft)
             - Task #55/#56's server-computed points (never the client's
               own read-only 'points' field/DOM count)
             - Category/Module/Lesson/Activity Type required-field checks
             - atomic persistence of the activity row AND its child
               content rows (mcq_questions_tbl/mcq_options_tbl,
               fill_blanks_tbl, or flashcards_tbl) in one transaction
         save_activity_draft() always writes with la_stats_id = "Draft"
         first, exactly like a normal draft save.
      3. Once saved, learning_activity_publishing.publish_activity()
         flips that same row's status to "Published" as the final step -
         mirroring upload_resource()'s own
         save_lesson_draft() -> resource_publishing.publish_resource()
         two-step pattern for Learning Resources.

    On any failure (missing/duplicate title, missing category/module/
    lesson/activity type, or a database error), the admin is redirected
    back to the same in-progress activity (via ?activity_id=) with a
    flashed error - no partial/invalid data is ever left half-published,
    since save_activity_draft()'s own transaction only ever commits a
    complete Section 1 + Section 2 save.
    """
    activity_title = request.form.get('activity_title')
    cat_id = request.form.get('course_id')
    module_id = request.form.get('module_id')
    lesson_id = request.form.get('lesson_id')
    activity_type = request.form.get('activity_type')
    activity_id = request.form.get('activity_id') or None

    # Task #57: turns the raw multipart form's bracketed field names
    # (questions[0][text], fill_blanks[2][correct_answer], etc.) into the
    # exact same list-of-dicts shape Save Draft's JSON body already sends -
    # so save_activity_draft() below never has to know or care which of
    # the two submission formats (multipart Publish vs. JSON Save Draft)
    # actually produced its questions/fill_blanks/flashcards arguments.
    questions = parse_questions_from_form(request.form)
    fill_blanks = parse_fill_blanks_from_form(request.form)
    flashcards = parse_flashcards_from_form(request.form)

    success, message, saved_activity_id, points = save_activity_draft(
        activity_id=activity_id,
        activity_title=activity_title,
        cat_id=cat_id,
        module_id=module_id,
        resource_id=lesson_id,
        activity_type=activity_type,
        questions=questions,
        fill_blanks=fill_blanks,
        flashcards=flashcards,
        uploaded_by=session.get('admin_id'),
    )

    if not success:
        flash(message, 'error')
        # Keep the admin on the same in-progress activity (if one already
        # exists) rather than bouncing them back to a blank form and
        # losing their place - same convention as upload_resource()'s own
        # failure-redirect handling above.
        redirect_activity_id = saved_activity_id or activity_id
        redirect_kwargs = {'activity_id': redirect_activity_id} if redirect_activity_id else {}
        return redirect(url_for('admin_bp.create_learning_activity_page', **redirect_kwargs))

    publish_success, publish_message = publish_activity(saved_activity_id)
    if not publish_success:
        # The activity itself saved successfully - only the "go live"
        # step was blocked. Say so plainly and stay on this same
        # activity, mirroring upload_resource()'s own partial-success
        # messaging.
        flash(f"Activity saved as a draft, but could not publish it: {publish_message}", 'error')
        return redirect(url_for('admin_bp.create_learning_activity_page', activity_id=saved_activity_id))

    flash('Learning activity created and published successfully!', 'success')
    return redirect(url_for('admin_bp.learning_activities'))
# ============================================================
# ROUTE: CREATE CODING EXERCISE (PAGE VIEW) & DEPENDENT DROPDOWNS
# ============================================================
@admin_bp.route('/coding-exercises/modules-by-category')
def coding_exercises_modules_by_category():
    """
    Task #70: backs the Create Coding Exercise form's dependent Module dropdown.
    Takes a single query param, `cat_id`, and returns ONLY the modules
    whose modules_tbl.cat_id matches it.
    """
    cat_id = request.args.get('cat_id', '', type=int)
    if not cat_id:
        return jsonify({"success": True, "modules": []}), 200

    modules = get_modules_by_category(cat_id)
    return jsonify({"success": True, "modules": modules}), 200


@admin_bp.route('/coding-exercises/lessons-by-module')
def coding_exercises_lessons_by_module():
    """
    Task #70: backs the Create Coding Exercise form's dependent Lesson dropdown.
    Takes a single query param, `module_id`, and returns ONLY the lessons
    (learning_resources_tbl rows) whose module_id matches it.
    """
    module_id = request.args.get('module_id', '', type=int)
    if not module_id:
        return jsonify({"success": True, "lessons": []}), 200

    lessons = get_resources_by_module(module_id)
    return jsonify({"success": True, "lessons": lessons}), 200


@admin_bp.route('/coding-exercises/check-title', methods=['GET', 'POST'])
def coding_exercises_check_title():
    """
    Task #74: AJAX duplicate check for Coding Exercise Title.
    Checks whether the title already exists globally in coding_exercises_tbl.
    """
    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form
        title = data.get('title', '')
        exclude_id = data.get('exclude_exercise_id')
        if exclude_id is not None:
            try:
                exclude_id = int(exclude_id)
            except (ValueError, TypeError):
                exclude_id = None
    else:
        title = request.args.get('title', '')
        exclude_id = request.args.get('exclude_exercise_id', type=int)

    is_valid, error_msg, formatted_title = validate_exercise_title(title, exclude_exercise_id=exclude_id)
    return jsonify({
        "success": True,
        "available": is_valid,
        "formatted_title": formatted_title,
        "message": error_msg or "Exercise title is available."
    }), 200


@admin_bp.route('/coding-exercises/create', methods=['GET', 'POST'])
def create_coding_exercise():
    """
    Task #70 & Task #76:
    - GET: Renders the Create Coding Exercise page with live Category options
      and support for editing/preloading an existing exercise.
    - POST: Persists new or updated coding exercise into coding_exercises_tbl
      and test_cases_tbl (Publish by default, or Draft if action=draft), then
      redirects back to the Manage Coding Exercises overview page.
    """
    if request.method == 'POST':
        is_ajax = request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.args.get('format') == 'json'
        data = request.get_json(silent=True) if request.is_json else request.form.to_dict()

        if not request.is_json:
            data['test_cases'] = parse_test_cases_from_form(request.form)

        action = (request.form.get('action') or (request.get_json(silent=True) or {}).get('action') or 'publish').lower()
        target_status = 'Draft' if action in ('draft', 'save_draft') else 'Published'

        admin_id = session.get('admin_id')
        success, exercise_id, msg = save_coding_exercise(data, status=target_status, uploaded_by=admin_id)

        if success:
            flash(msg, 'success')
            if is_ajax:
                return jsonify({
                    "success": True,
                    "exercise_id": exercise_id,
                    "message": msg,
                    "redirect_url": url_for('admin_bp.coding_exercises')
                }), 200
            return redirect(url_for('admin_bp.coding_exercises'))
        else:
            flash(msg, 'danger')
            if is_ajax:
                return jsonify({
                    "success": False,
                    "message": msg
                }), 400
            # If standard POST failed, re-render form with categories
            categories = get_categories()
            return render_template(
                'create-coding-exercise.html',
                categories=categories,
                existing_exercise=data,
            ), 400

    # GET request:
    exercise_id = request.args.get('exercise_id', type=int)
    existing_exercise = None
    if exercise_id:
        existing_exercise = get_coding_exercise(exercise_id)

    categories = get_categories()
    return render_template(
        'create-coding-exercise.html',
        categories=categories,
        existing_exercise=existing_exercise,
    )


@admin_bp.route('/coding-exercises/save-draft', methods=['POST'])
def save_coding_exercise_draft():
    """
    Task #76: Dedicated endpoint for Save Draft action.
    Persists coding exercise with status='Draft' and returns redirect sync.
    """
    is_ajax = request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.args.get('format') == 'json'
    data = request.get_json(silent=True) if request.is_json else request.form.to_dict()

    if not request.is_json:
        data['test_cases'] = parse_test_cases_from_form(request.form)

    preserve = data.get('preserve_status') in (True, 'true', '1') or data.get('action') == 'save'
    target_status = 'Published' if (preserve and data.get('status') == 'Published') else 'Draft'

    admin_id = session.get('admin_id')
    success, exercise_id, msg = save_coding_exercise(data, status=target_status, uploaded_by=admin_id)

    if success:
        flash(msg, 'success')
        if is_ajax:
            return jsonify({
                "success": True,
                "exercise_id": exercise_id,
                "message": msg,
                "redirect_url": url_for('admin_bp.coding_exercises')
            }), 200
        return redirect(url_for('admin_bp.coding_exercises'))
    else:
        flash(msg, 'danger')
        if is_ajax:
            return jsonify({
                "success": False,
                "message": msg
            }), 400
        return redirect(url_for('admin_bp.create_coding_exercise'))