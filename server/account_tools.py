"""
account_tools.py - shared pieces of feat/account-tools
------------------------------------------------------------------------------
Schema, admin settings and the account activity log used by:

    progress_reset.py     Reset progress (learners only, admin only)
    help_requests.py      "Can't get in? Ask an admin" + admin password reset
    account_deletion.py   Delete my own account (30-day restore)

    system_settings_tbl       setting_key -> setting_value (admin ON/OFF switches)
    account_actions_log_tbl   one row per account action (who, to whom, when)
    help_requests_tbl         see help_requests.py
    account_tbl               + must_change_password, deletion_requested_at,
                                deletion_due_at

Everything is created lazily (IF NOT EXISTS), once per process, like the
other log tables - the same SQL is in
database/migrations/2026-10-account-tools.sql for HeidiSQL.
No Flask code here.
"""

import hashlib

from mysql.connector import Error

from cobradb import get_db_connection

SETTINGS_TABLE = "system_settings_tbl"
ACTIONS_TABLE = "account_actions_log_tbl"
HELP_TABLE = "help_requests_tbl"

ALLOW_PROGRESS_RESET = "allow_progress_reset"
SETTING_DEFAULTS = {ALLOW_PROGRESS_RESET: "1"}   # ON while the system is being tested

# action names written to account_actions_log_tbl
ACTION_LABELS = {
    "progress_reset": "Progress reset",
    "password_reset": "Password reset by an admin",
    "password_changed": "Set a new password (after a reset)",
    "unlock": "Unlocked by an admin",
    "help_request": "Help request sent",
    "help_done": "Help request closed",
    "self_delete": "Asked to delete the account",
    "self_restore": "Restored the account (pending deletion cancelled)",
    "admin_restore_pending": "Pending deletion cancelled by an admin",
    "auto_archive": "Archived after 30 days pending deletion",
    "setting_changed": "Setting changed",
}

_schema_ready = False

SCHEMA_SQL = (
    f"""CREATE TABLE IF NOT EXISTS {SETTINGS_TABLE} (
          setting_key   VARCHAR(64)  NOT NULL,
          setting_value VARCHAR(255) NOT NULL,
          updated_by    VARCHAR(15)  NULL,
          updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (setting_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci""",
    f"""CREATE TABLE IF NOT EXISTS {ACTIONS_TABLE} (
          action_id   INT          NOT NULL AUTO_INCREMENT,
          action      VARCHAR(40)  NOT NULL,
          acc_id      VARCHAR(15)  NULL,
          done_by     VARCHAR(15)  NULL,
          details     VARCHAR(500) NULL,
          ip_address  VARCHAR(45)  NULL,
          created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (action_id),
          KEY idx_actions_acc (acc_id, created_at),
          KEY idx_actions_by (done_by),
          KEY idx_actions_action (action, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci""",
    f"""CREATE TABLE IF NOT EXISTS {HELP_TABLE} (
          request_id   INT          NOT NULL AUTO_INCREMENT,
          typed_name   VARCHAR(100) NOT NULL,
          acc_id       VARCHAR(15)  NULL,
          message      VARCHAR(500) NOT NULL,
          ip_address   VARCHAR(45)  NULL,
          status       VARCHAR(10)  NOT NULL DEFAULT 'open',
          created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
          handled_by   VARCHAR(15)  NULL,
          handled_at   DATETIME     NULL,
          resolution   VARCHAR(30)  NULL,
          PRIMARY KEY (request_id),
          KEY idx_help_status (status, created_at),
          KEY idx_help_acc (acc_id),
          KEY idx_help_ip (ip_address, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci""",
    """ALTER TABLE account_tbl
          ADD COLUMN IF NOT EXISTS must_change_password  TINYINT(1) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS deletion_requested_at DATETIME NULL,
          ADD COLUMN IF NOT EXISTS deletion_due_at       DATETIME NULL""",
    "CREATE INDEX IF NOT EXISTS idx_account_deletion_due ON account_tbl (deletion_due_at)",
)


def ensure_account_tools_schema(connection):
    """Creates the tables / columns above if missing. Once per process; never raises."""
    global _schema_ready
    if _schema_ready:
        return
    try:
        cursor = connection.cursor()
        for statement in SCHEMA_SQL:
            cursor.execute(statement)
        for key, value in SETTING_DEFAULTS.items():
            cursor.execute(
                f"INSERT IGNORE INTO {SETTINGS_TABLE} (setting_key, setting_value) VALUES (%s, %s)",
                (key, value)
            )
        connection.commit()
        cursor.close()
        _schema_ready = True
    except Error as e:
        print(f"account_tools: could not prepare the account-tools tables: {e}")
    # feat/admin-extras: log_action() writes to the Activity Log tables
    from audit import ensure_audit_schema
    ensure_audit_schema(connection)


def password_signature(password_hash):
    """
    A short fingerprint of the stored password HASH, kept in the staff
    session at sign-in. When the password changes (an admin reset, Change
    Password, the forced change) the fingerprint no longer matches and
    every other signed-in device is signed out on its next request.
    """
    return hashlib.sha256((password_hash or "").encode("utf-8")).hexdigest()[:16]


def get_staff_guard_state(acc_id):
    """
    {"pw_sig", "must_change_password", "pending_deletion"} for the staff
    session guard, or None on a database problem / unknown account.
    """
    def work(connection):
        cursor = connection.cursor()
        cursor.execute(
            "SELECT password, must_change_password, deletion_due_at FROM account_tbl WHERE acc_id = %s",
            (acc_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        if not row:
            return None
        return {"pw_sig": password_signature(row[0]), "must_change_password": bool(row[1]),
                "pending_deletion": row[2] is not None}
    return _with_connection(work, None, "account_tools.get_staff_guard_state")


def _with_connection(work, fallback=None, label="account_tools"):
    connection = get_db_connection()
    if connection is None:
        return fallback
    try:
        ensure_account_tools_schema(connection)
        return work(connection)
    except Error as e:
        print(f"{label}: database error: {e}")
        return fallback
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Settings
# ------------------------------------------------------------------
def get_setting(key):
    """The setting's value (str); its default when unset or the DB is down."""
    def work(connection):
        cursor = connection.cursor()
        cursor.execute(f"SELECT setting_value FROM {SETTINGS_TABLE} WHERE setting_key = %s", (key,))
        row = cursor.fetchone()
        cursor.close()
        return row[0] if row else SETTING_DEFAULTS.get(key)
    return _with_connection(work, SETTING_DEFAULTS.get(key), "account_tools.get_setting")


def setting_is_on(key):
    return str(get_setting(key) or "0") == "1"


def set_setting(key, value, admin_id, ip_address=None):
    """Saves a setting and logs who changed it. Returns True on success."""
    value = str(value)

    def work(connection):
        cursor = connection.cursor()
        cursor.execute(
            f"""INSERT INTO {SETTINGS_TABLE} (setting_key, setting_value, updated_by)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)""",
            (key, value, admin_id)
        )
        log_action(cursor, "setting_changed", None, admin_id,
                   f"{key} = {'ON' if value == '1' else 'OFF' if value == '0' else value}", ip_address)
        connection.commit()
        cursor.close()
        return True
    return bool(_with_connection(work, False, "account_tools.set_setting"))


# ------------------------------------------------------------------
# Activity log
# ------------------------------------------------------------------
def log_action(cursor, action, acc_id, done_by, details=None, ip_address=None):
    """
    feat/admin-extras: writes to the ONE Activity Log (audit.activity_log_tbl)
    on the CALLER's cursor, so it is saved (or rolled back) together with the
    action itself. acc_id = the account it happened to. Never raises.
    (account_actions_log_tbl is no longer written; its old rows were copied.)
    """
    from audit import log_on_cursor, ACCOUNT_TOOL_CATEGORIES
    log_on_cursor(
        cursor, action, ACCOUNT_TOOL_CATEGORIES.get(action, "accounts"), actor=done_by,
        target_type="account" if acc_id else None, target_id=acc_id,
        details=details, ip_address=ip_address, endpoint="account_tools",
    )


def log_action_standalone(action, acc_id, done_by, details=None, ip_address=None):
    def work(connection):
        from audit import ensure_audit_schema
        ensure_audit_schema(connection)
        cursor = connection.cursor()
        log_action(cursor, action, acc_id, done_by, details, ip_address)
        connection.commit()
        cursor.close()
        return True
    return _with_connection(work, False, "account_tools.log_action")


def get_account_actions(acc_id, limit=20):
    """
    The newest actions about (or by) one account, for Account Details >
    Security: [{"action", "label", "details", "by", "at"}]. [] on a DB error.
    """
    from admin_time import fmt_datetime
    from audit import describe

    def work(connection):
        cursor = connection.cursor(dictionary=True)
        from audit import ensure_audit_schema, ACTIVITY_TABLE
        ensure_audit_schema(connection)
        cursor.execute(
            f"""SELECT l.action, l.details, l.created_at, l.actor_acc_id AS done_by, l.target_id AS acc_id,
                       p.firstname, p.lastname, a.username
                FROM {ACTIVITY_TABLE} l
                LEFT JOIN account_tbl a ON a.acc_id = l.actor_acc_id
                LEFT JOIN profile_tbl p ON p.acc_id = l.actor_acc_id
                WHERE l.target_type = 'account' AND l.target_id = %s
                ORDER BY l.created_at DESC, l.log_id DESC
                LIMIT %s""",
            (acc_id, int(limit))
        )
        rows = cursor.fetchall()
        cursor.close()
        out = []
        for r in rows:
            if not r.get("done_by"):
                by = "System"
            elif r["done_by"] == acc_id:
                by = "Themselves"
            else:
                by = " ".join(x for x in (r.get("firstname"), r.get("lastname")) if x).strip() \
                    or r.get("username") or r["done_by"]
            out.append({
                "action": r["action"],
                "label": ACTION_LABELS.get(r["action"]) or describe(r["action"], None),
                "details": r.get("details") or "",
                "by": by,
                "at": fmt_datetime(r.get("created_at")),
            })
        return out
    return _with_connection(work, [], "account_tools.get_account_actions") or []
