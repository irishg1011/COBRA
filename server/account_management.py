"""
account_management.py - Admin > Account & Security: account details + archive
-------------------------------------------------------------------------------
Pure DB-access helpers behind the Account & Security page's row actions
(feat/archive-accounts). Same style as the other feature files: nothing
here touches Flask/session state - admin_routes.py passes the current
admin's acc_id in and turns the results into JSON.

ARCHIVE = SOFT DELETE ONLY
    Archiving reuses account_tbl's existing columns:
        is_deleted = 1, deleted_at = NOW()
    Nothing is ever removed - progress, logs and uploaded content all
    stay. Restoring flips is_deleted back to 0. Every other part of the
    app already hides is_deleted accounts (the accounts table, metric
    cards, Learner Progress, get_current_admin()), and login.py already
    refuses them, so no other file needs to know about "archived".

SAFETY RULES (enforced here, not only by the disabled buttons)
    - An admin can never archive their own account.
    - The last active admin can never be archived.

PUBLIC FUNCTIONS
    get_archive_block_reason(...)   - why a row's Archive is disabled ("" = allowed)
    get_account_detail(acc_id, current_admin_id)
    archive_account(acc_id, current_admin_id)
    restore_account(acc_id)
    get_archived_accounts(search_query, page, per_page)
    is_account_archived(acc_id)      - used by admin_routes.py's session guard
"""

from datetime import date, datetime
from mysql.connector import Error

from cobradb import get_db_connection
from session_tracker import end_sessions_for_account, _get_timeout_minutes
from learner_progress_monitor import get_learner_course_detail

ACCOUNT_TABLE = "account_tbl"
PROFILE_TABLE = "profile_tbl"
USERTYPE_TABLE = "usertype_tbl"

ADMIN_ROLE = "Admin"
LEARNER_ROLE = "Learner"
RECENT_LOGINS_LIMIT = 10
ARCHIVED_PER_PAGE = 8

SELF_ARCHIVE_REASON = "You can't archive your own account."
LAST_ADMIN_REASON = "At least one administrator must remain."

# Content an admin can upload -> (label, count-by-status query). Every
# query takes the acc_id once; status names are bucketed by _status_bucket().
CONTENT_SOURCES = [
    (
        "Lessons",
        """SELECT s.lr_stats_name AS status, COUNT(*) AS total
           FROM learning_resources_tbl t
           LEFT JOIN learning_resources_stats_tbl s ON t.lr_stats_id = s.lr_stats_id
           WHERE t.uploaded_by = %s
           GROUP BY s.lr_stats_name""",
    ),
    (
        "Video Tutorials",
        """SELECT s.la_stats_name AS status, COUNT(*) AS total
           FROM video_tutorials_tbl t
           LEFT JOIN learning_activities_stats_tbl s ON t.video_stats_id = s.la_stats_id
           WHERE t.uploaded_by = %s
           GROUP BY s.la_stats_name""",
    ),
    (
        "Learning Activities",
        """SELECT s.la_stats_name AS status, COUNT(*) AS total
           FROM learning_activities_tbl t
           LEFT JOIN learning_activities_stats_tbl s ON t.la_stats_id = s.la_stats_id
           WHERE t.uploaded_by = %s
           GROUP BY s.la_stats_name""",
    ),
    (
        "Coding Exercises",
        """SELECT CASE WHEN COALESCE(t.is_archived, 0) = 1 THEN 'Archived'
                       ELSE s.la_stats_name END AS status,
                  COUNT(*) AS total
           FROM coding_exercises_tbl t
           LEFT JOIN learning_activities_stats_tbl s ON t.exercise_stats_id = s.la_stats_id
           WHERE t.uploaded_by = %s
           GROUP BY status""",
    ),
]


# ------------------------------------------------------------------
# Small helpers
# ------------------------------------------------------------------
def _fmt_date(dt):
    """e.g. 'Jul 12, 2026'"""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _fmt_datetime(dt):
    """e.g. 'Jul 15, 2026, 1:30 PM'"""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}, {dt.strftime('%I:%M %p').lstrip('0')}"


def _full_name(row):
    name = " ".join(part for part in [row.get("firstname"), row.get("lastname")] if part).strip()
    return name or row.get("username") or "—"


def _age(birthdate):
    if not birthdate:
        return None
    if isinstance(birthdate, datetime):
        birthdate = birthdate.date()
    if not isinstance(birthdate, date):
        return None
    today = date.today()
    return today.year - birthdate.year - ((today.month, today.day) < (birthdate.month, birthdate.day))


def _status_bucket(name):
    """Every content status falls into one of four buckets."""
    if name == "Published":
        return "published"
    if name == "Ready to Publish":
        return "ready"
    if name == "Archived":
        return "archived"
    return "draft"  # NULL / Draft / anything unexpected


def _count_active_admins(cursor):
    cursor.execute(
        f"""SELECT COUNT(*) AS total
            FROM {ACCOUNT_TABLE} a
            JOIN {USERTYPE_TABLE} ut ON a.u_type = ut.ut_id
            WHERE ut.u_type = %s
              AND (a.is_deleted = 0 OR a.is_deleted IS NULL)""",
        (ADMIN_ROLE,)
    )
    row = cursor.fetchone()
    total = row["total"] if isinstance(row, dict) else row[0]
    return int(total or 0)


def get_archive_block_reason(acc_id, role, current_admin_id, active_admin_count):
    """
    Why this account's Archive action is blocked, or "" if it's allowed.
    Shared by the table rows (admin_routes.get_accounts_overview), the
    details modal, and archive_account() itself so all three agree.
    """
    if current_admin_id and acc_id == current_admin_id:
        return SELF_ARCHIVE_REASON
    if role == ADMIN_ROLE and active_admin_count <= 1:
        return LAST_ADMIN_REASON
    return ""


# ------------------------------------------------------------------
# Details modal
# ------------------------------------------------------------------
def _load_security(cursor, acc_id):
    security = {
        "online": False,
        "last_seen": "—",
        "logins_success": 0,
        "logins_failed": 0,
        "recent_logins": [],
        "lockouts": 0,
        "last_lockout": "—",
        "resets": 0,
        "last_reset": "—",
    }

    try:
        cursor.execute(
            """SELECT
                   COALESCE(SUM(CASE WHEN attempt_status = 'Success' THEN 1 ELSE 0 END), 0) AS ok,
                   COALESCE(SUM(CASE WHEN attempt_status = 'Failed' THEN 1 ELSE 0 END), 0) AS failed
               FROM login_logs_tbl WHERE acc_id = %s""",
            (acc_id,)
        )
        row = cursor.fetchone() or {}
        security["logins_success"] = int(row.get("ok") or 0)
        security["logins_failed"] = int(row.get("failed") or 0)

        cursor.execute(
            f"""SELECT attempt_status, ip_address, attempted_at
                FROM login_logs_tbl WHERE acc_id = %s
                ORDER BY attempted_at DESC LIMIT {RECENT_LOGINS_LIMIT}""",
            (acc_id,)
        )
        security["recent_logins"] = [
            {
                "status": r.get("attempt_status") or "—",
                "ip_address": r.get("ip_address") or "—",
                "attempted_at": _fmt_datetime(r.get("attempted_at")),
            }
            for r in cursor.fetchall()
        ]
    except Error as e:
        print(f"account_management: failed to load login history for {acc_id}: {e}")

    # These log tables are created lazily, so they may not exist yet.
    try:
        cursor.execute(
            "SELECT COUNT(*) AS total, MAX(locked_at) AS last_at FROM lockout_logs_tbl WHERE acc_id = %s",
            (acc_id,)
        )
        row = cursor.fetchone() or {}
        security["lockouts"] = int(row.get("total") or 0)
        security["last_lockout"] = _fmt_datetime(row.get("last_at"))
    except Error:
        pass

    try:
        cursor.execute(
            "SELECT COUNT(*) AS total, MAX(reset_at) AS last_at FROM password_reset_logs_tbl WHERE acc_id = %s",
            (acc_id,)
        )
        row = cursor.fetchone() or {}
        security["resets"] = int(row.get("total") or 0)
        security["last_reset"] = _fmt_datetime(row.get("last_at"))
    except Error:
        pass

    # "Online now" = an active session touched within the session timeout
    # (same rule session_tracker uses before counting Active Sessions).
    try:
        cursor.execute(
            """SELECT MAX(last_seen_at) AS last_seen,
                      SUM(CASE WHEN TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) <= %s THEN 1 ELSE 0 END) AS live
               FROM active_sessions_tbl WHERE acc_id = %s""",
            (_get_timeout_minutes() * 60, acc_id)
        )
        row = cursor.fetchone() or {}
        security["online"] = int(row.get("live") or 0) > 0
        security["last_seen"] = _fmt_datetime(row.get("last_seen"))
    except Error:
        pass

    return security


def _load_content(cursor, acc_id):
    content = []
    for label, query in CONTENT_SOURCES:
        counts = {"label": label, "total": 0, "published": 0, "ready": 0, "draft": 0, "archived": 0}
        try:
            cursor.execute(query, (acc_id,))
            for row in cursor.fetchall():
                total = int(row.get("total") or 0)
                counts["total"] += total
                counts[_status_bucket(row.get("status"))] += total
        except Error as e:
            print(f"account_management: failed to count {label} for {acc_id}: {e}")
        content.append(counts)
    return content


def _load_learning(acc_id):
    """Summary numbers only - the full course tree opens in the Course Progress modal."""
    detail = get_learner_course_detail(acc_id)
    if not detail:
        return None
    keys = (
        "current_state", "current_lesson", "current_path",
        "lessons_completed", "lessons_total", "modules_completed", "modules_total",
        "avg_score", "completion", "last_active",
    )
    return {key: detail.get(key) for key in keys}


def get_account_detail(acc_id, current_admin_id=None):
    """
    Everything the Account Details modal shows for one ACTIVE account,
    or None if it doesn't exist / is archived / the DB is unreachable.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT a.acc_id, a.username, a.email, a.status, a.created_at, a.last_login,
                       a.lockout_until, a.failed_attempts,
                       ut.u_type AS role,
                       p.*
                FROM {ACCOUNT_TABLE} a
                LEFT JOIN {USERTYPE_TABLE} ut ON a.u_type = ut.ut_id
                LEFT JOIN {PROFILE_TABLE} p ON a.acc_id = p.acc_id
                WHERE a.acc_id = %s
                  AND (a.is_deleted = 0 OR a.is_deleted IS NULL)""",
            (acc_id,)
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return None

        # p.* also has an acc_id column (NULL when there's no profile row).
        row["acc_id"] = acc_id
        role = row.get("role") or "Unknown"
        lockout_until = row.get("lockout_until")
        is_locked = bool(lockout_until) and lockout_until > datetime.now()

        archive_block = get_archive_block_reason(acc_id, role, current_admin_id, _count_active_admins(cursor))

        detail = {
            "acc_id": acc_id,
            "full_name": _full_name(row),
            "username": row.get("username") or "—",
            "email": row.get("email") or "—",
            "role": role,
            "status": row.get("status") or "Active",
            "is_locked": is_locked,
            "locked_until": _fmt_datetime(lockout_until) if is_locked else "—",
            "failed_attempts": int(row.get("failed_attempts") or 0),
            "gender": row.get("gender") or "—",
            "birthdate": _fmt_date(row.get("birthdate")),
            "age": _age(row.get("birthdate")),
            "mobile": row.get("mobile") or "—",  # column only exists once an admin was created
            "date_created": _fmt_date(row.get("created_at")),
            "last_login": _fmt_datetime(row.get("last_login")) if row.get("last_login") else "Never",
            "is_self": bool(current_admin_id) and acc_id == current_admin_id,
            "archive_block": archive_block,
            "security": _load_security(cursor, acc_id),
            "learning": None,
            "content": None,
        }

        if role == ADMIN_ROLE:
            detail["content"] = _load_content(cursor, acc_id)
        cursor.close()

        if role == LEARNER_ROLE:
            detail["learning"] = _load_learning(acc_id)

        return detail

    except Error as e:
        print(f"account_management: failed to load account {acc_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Archive / Restore (soft delete only)
# ------------------------------------------------------------------
def archive_account(acc_id, current_admin_id):
    """Returns (success, message)."""
    if not acc_id:
        return False, "Account ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT a.acc_id, a.is_deleted, ut.u_type AS role
                FROM {ACCOUNT_TABLE} a
                LEFT JOIN {USERTYPE_TABLE} ut ON a.u_type = ut.ut_id
                WHERE a.acc_id = %s""",
            (acc_id,)
        )
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Account not found."
        if row.get("is_deleted"):
            cursor.close()
            return False, "This account is already archived."

        reason = get_archive_block_reason(acc_id, row.get("role"), current_admin_id, _count_active_admins(cursor))
        if reason:
            cursor.close()
            return False, reason

        cursor.execute(
            f"UPDATE {ACCOUNT_TABLE} SET is_deleted = 1, deleted_at = NOW() WHERE acc_id = %s",
            (acc_id,)
        )
        connection.commit()
        cursor.close()

    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"account_management: failed to archive {acc_id}: {e}")
        return False, "Could not archive this account."
    finally:
        if connection.is_connected():
            connection.close()

    # Drop them from Active Sessions right away. An archived admin is
    # also logged out on their next request by admin_routes.py's guard.
    end_sessions_for_account(acc_id)
    return True, "Account archived."


def restore_account(acc_id):
    """Returns (success, message)."""
    if not acc_id:
        return False, "Account ID is required."

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT is_deleted FROM {ACCOUNT_TABLE} WHERE acc_id = %s", (acc_id,))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return False, "Account not found."
        if not row[0]:
            cursor.close()
            return False, "This account is not archived."

        cursor.execute(
            f"UPDATE {ACCOUNT_TABLE} SET is_deleted = 0, deleted_at = NULL WHERE acc_id = %s",
            (acc_id,)
        )
        connection.commit()
        cursor.close()
        return True, "Account restored."

    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"account_management: failed to restore {acc_id}: {e}")
        return False, "Could not restore this account."
    finally:
        if connection.is_connected():
            connection.close()


def get_archived_accounts(search_query=None, page=1, per_page=ARCHIVED_PER_PAGE):
    """
    Archived Accounts modal: search (name / username / email, "starts
    with" like the main table) + pagination, newest archived first.
    Returns {"accounts", "total", "page", "per_page", "total_pages"} or None.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)

        where = "WHERE a.is_deleted = 1"
        params = []
        term = (search_query or "").strip().lower()
        if term:
            where += """
                AND (
                    LOWER(p.firstname) LIKE %s
                    OR LOWER(p.lastname) LIKE %s
                    OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s
                    OR LOWER(a.username) LIKE %s
                    OR LOWER(a.email) LIKE %s
                )
            """
            params.extend([f"{term}%"] * 5)

        joins = f"""
            FROM {ACCOUNT_TABLE} a
            LEFT JOIN {USERTYPE_TABLE} ut ON a.u_type = ut.ut_id
            LEFT JOIN {PROFILE_TABLE} p ON a.acc_id = p.acc_id
        """

        cursor.execute(f"SELECT COUNT(*) AS total {joins} {where}", tuple(params))
        total = int(cursor.fetchone()["total"] or 0)

        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(max(1, page or 1), total_pages)
        offset = (page - 1) * per_page

        cursor.execute(
            f"""SELECT a.acc_id, a.username, a.email, a.deleted_at,
                       ut.u_type AS role, p.firstname, p.lastname
                {joins} {where}
                ORDER BY a.deleted_at DESC, a.acc_id ASC
                LIMIT %s OFFSET %s""",
            tuple(params) + (per_page, offset)
        )
        accounts = [
            {
                "acc_id": r["acc_id"],
                "full_name": _full_name(r),
                "username": r.get("username") or "—",
                "email": r.get("email") or "—",
                "role": r.get("role") or "Unknown",
                "archived_at": _fmt_date(r.get("deleted_at")),
            }
            for r in cursor.fetchall()
        ]
        cursor.close()

        return {
            "accounts": accounts,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    except Error as e:
        print(f"account_management: failed to load archived accounts: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def is_account_archived(acc_id):
    """
    True only when the account exists and is archived. False on a DB
    hiccup, so a database blip can never lock every admin out.
    """
    if not acc_id:
        return False
    connection = get_db_connection()
    if connection is None:
        return False
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT is_deleted FROM {ACCOUNT_TABLE} WHERE acc_id = %s", (acc_id,))
        row = cursor.fetchone()
        cursor.close()
        return bool(row and row[0])
    except Error as e:
        print(f"account_management: failed to check archive state for {acc_id}: {e}")
        return False
    finally:
        if connection.is_connected():
            connection.close()
