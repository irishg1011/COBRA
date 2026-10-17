"""
audit.py - Activity Log (audit trail) + error log (feat/admin-extras)
------------------------------------------------------------------------------
WHO did WHAT, WHEN - one table, one helper, used everywhere:

    activity_log_tbl
    -----------------
    log_id        BIGINT AUTO_INCREMENT PK
    created_at    DATETIME          (app time - cobradb sets the session time zone)
    actor_acc_id  VARCHAR(15) NULL  who did it (NULL = the system, e.g. the 30-day move)
    actor_role    VARCHAR(20) NULL  their role at that moment
    action        VARCHAR(40)       publish, archive, password_reset, ...
    category      VARCHAR(20)       content / accounts / security / settings
    target_type   VARCHAR(20) NULL  lesson, module, account, badge, ...
    target_id     VARCHAR(30) NULL
    target_name   VARCHAR(255) NULL the name AT THAT MOMENT (still readable after a rename/delete)
    details       VARCHAR(500) NULL
    ip_address    VARCHAR(45) NULL
    endpoint      VARCHAR(80) NULL  the route that did it

How rows get in:
  1. log(...) / log_on_cursor(...) - called directly (account tools, exports).
  2. The admin_bp hook (install_audit_hooks): every successful POST to a
     route in ROUTE_ACTIONS is logged automatically - publish / unpublish,
     create / edit / archive / restore / delete content, account archive /
     restore / unlock, badges, settings ... A POST route that is NOT in the
     map is still logged as "other change", so a new route is never missed.
     The target's name is read BEFORE the action (so a delete still has it).
  3. Logins are NOT copied here: the Activity Log page reads login_logs_tbl
     next to this table (no double data).

Rows older than RETENTION_DAYS (365) are deleted, at most once a day.

    error_log_tbl - one row per server error (unhandled crash or a 5xx
    answer) for System Health's "errors today".

Nothing here ever raises: logging must never break the action it records.
"""

import csv
import io
import time
import threading
from datetime import datetime

from flask import g, request, session
from mysql.connector import Error

from cobradb import get_db_connection
from admin_time import fmt_datetime

ACTIVITY_TABLE = "activity_log_tbl"
ERROR_TABLE = "error_log_tbl"
OLD_ACCOUNT_LOG = "account_actions_log_tbl"
RETENTION_DAYS = 365
PER_PAGE = 25
EXPORT_LIMIT = 50000

CATEGORIES = {
    "content": "Content",
    "accounts": "Accounts",
    "security": "Security",
    "settings": "Settings",
    "logins": "Logins",
}

# action key -> past-tense label ("Published", ...). The target type is added
# when the row is shown: "Published lesson", "Archived account".
VERBS = {
    "publish": "Published", "unpublish": "Unpublished", "mark_ready": "Marked ready",
    "mark_all_ready": "Marked all ready", "move_to_draft": "Moved to draft", "update_live": "Updated live",
    "create": "Created", "edit": "Edited", "save_draft": "Saved draft", "archive": "Archived",
    "restore": "Restored", "restore_selected": "Restored (selected items)", "bulk_restore": "Restored (bulk)",
    "delete": "Deleted", "permanent_delete": "Permanently deleted", "reorder": "Reordered",
    "revert_name": "Reverted the name of", "checklist": "Checklist on",
    "unlock": "Unlocked", "progress_reset": "Reset the progress of", "password_reset": "Reset the password of",
    "password_changed": "Set a new password", "help_request": "Sent a help request",
    "help_done": "Closed a help request for", "self_delete": "Asked to delete their account",
    "self_restore": "Restored their own account", "admin_restore_pending": "Cancelled the deletion of",
    "auto_archive": "Archived (30 days after deletion request)", "setting_changed": "Changed a setting",
    "game_settings": "Changed game settings", "export_csv": "Exported CSV", "create_account": "Created",
    "login": "Signed in", "login_failed": "Failed sign-in",
    "photo_change": "Changed their photo", "photo_remove": "Removed their photo",
    "other": "Changed",
}

# Old account-tools action names (account_actions_log_tbl) -> category.
ACCOUNT_TOOL_CATEGORIES = {
    "progress_reset": "accounts", "password_reset": "security", "password_changed": "security",
    "unlock": "security", "help_request": "security", "help_done": "security",
    "self_delete": "accounts", "self_restore": "accounts", "admin_restore_pending": "accounts",
    "auto_archive": "accounts", "setting_changed": "settings",
}

# ------------------------------------------------------------------
# admin_bp routes -> (action, category, target type)
# target type "from_kind" = the <kind> in the URL; "from_args_type" = lesson
# or video depending on ?type=Video Tutorial. None = logged explicitly elsewhere.
# ------------------------------------------------------------------
ROUTE_ACTIONS = {
    # Accounts
    "account_archive": ("archive", "accounts", "account"),
    "account_restore": ("restore", "accounts", "account"),
    "account_unlock": ("unlock", "security", "account"),
    "create_administrator": ("create_account", "accounts", "account"),
    "create_mentor": ("create_account", "accounts", "account"),
    # logged by account_tools / help_requests / account_deletion themselves
    "account_progress_reset": None, "account_restore_pending": None, "progress_reset_setting": None,
    "help_request_reset_password": None, "help_request_unlock": None, "help_request_done": None,
    "staff_delete_account": None,
    # Chapters / modules
    "manage_course_create_category": ("create", "content", "chapter"),
    "manage_course_update_category": ("edit", "content", "chapter"),
    "manage_course_save_category_skip_settings": None,   # logs itself with what changed (feat/skippable-chapter)
    "manage_course_category_ready_to_publish": ("mark_ready", "content", "chapter"),
    "manage_course_category_move_to_draft": ("move_to_draft", "content", "chapter"),
    "manage_course_publish_category": ("publish", "content", "chapter"),
    "manage_course_delete_category": ("delete", "content", "chapter"),
    "manage_course_archive_category": ("archive", "content", "chapter"),
    "manage_course_restore_category": ("restore", "content", "chapter"),
    "manage_course_category_restore_selected": ("restore_selected", "content", "chapter"),
    "manage_course_permanently_delete_category": ("permanent_delete", "content", "chapter"),
    "manage_course_create_module": ("create", "content", "module"),
    "manage_course_update_module": ("edit", "content", "module"),
    "manage_course_delete_module": ("archive", "content", "module"),
    "manage_course_publish_module": ("publish", "content", "module"),
    "manage_course_unpublish_module": ("unpublish", "content", "module"),
    "manage_course_ready_to_publish_module": ("mark_ready", "content", "module"),
    "manage_course_restore_module": ("restore", "content", "module"),
    "manage_course_module_restore_selected": ("restore_selected", "content", "module"),
    "manage_course_permanently_delete_module": ("permanent_delete", "content", "module"),
    "archive_bulk_restore": ("bulk_restore", "content", None),
    "title_history_revert": ("revert_name", "content", None),
    # Publishing
    "publishing_item_action": ("from_action", "content", "from_kind"),
    "publishing_checklist_action": ("checklist", "content", None),
    "publishing_reorder": ("reorder", "content", None),
    "publishing_unpublish_category": ("unpublish", "content", "chapter"),
    "publishing_unpublish_module": ("unpublish", "content", "module"),
    "publishing_unpublish_resource": ("unpublish", "content", "lesson"),
    "publishing_unpublish_activity": ("unpublish", "content", "activity"),
    "publishing_unpublish_exercise": ("unpublish", "content", "exercise"),
    # Lessons / videos
    "upload_resource": ("save_or_create", "content", "lesson"),
    "upload_resource_save_draft": ("save_or_create", "content", "lesson"),
    "upload_resource_publish": ("publish", "content", "lesson"),
    "publish_learning_resource": ("publish", "content", "lesson"),
    "unpublish_learning_resource": ("unpublish", "content", "lesson"),
    "ready_to_publish_learning_resource": ("mark_ready", "content", "lesson"),
    "archive_learning_resource": ("archive", "content", "lesson"),
    "restore_learning_resource_route": ("restore", "content", "from_args_type"),
    "permanently_delete_learning_resource_route": ("permanent_delete", "content", "from_args_type"),
    "upload_video_tutorial_save_draft": ("save_or_create", "content", "video"),
    "upload_video_tutorial_publish": ("publish", "content", "video"),
    "archive_video_tutorial_route": ("archive", "content", "video"),
    # Activities
    "create_learning_activity_save_draft": ("save_or_create", "content", "activity"),
    "create_activity_submit": ("save_or_create", "content", "activity"),
    "publish_learning_activity": ("publish", "content", "activity"),
    "unpublish_learning_activity": ("unpublish", "content", "activity"),
    "ready_to_publish_learning_activity": ("mark_ready", "content", "activity"),
    "archive_learning_activity": ("archive", "content", "activity"),
    "restore_learning_activity_route": ("restore", "content", "activity"),
    "permanently_delete_learning_activity_route": ("permanent_delete", "content", "activity"),
    "delete_activity": ("delete", "content", "activity"),
    # Coding exercises
    "save_coding_exercise_draft": ("save_or_create", "content", "exercise"),
    "create_coding_exercise": ("save_or_create", "content", "exercise"),
    "publish_coding_exercise": ("publish", "content", "exercise"),
    "unpublish_coding_exercise": ("unpublish", "content", "exercise"),
    "ready_to_publish_coding_exercise": ("mark_ready", "content", "exercise"),
    "archive_coding_exercise": ("archive", "content", "exercise"),
    "restore_coding_exercise_route": ("restore", "content", "exercise"),
    "permanently_delete_coding_exercise_route": ("permanent_delete", "content", "exercise"),
    "delete_exercise": ("delete", "content", "exercise"),
    # Badges
    "achievements_create_badge": ("create", "content", "badge"),
    "achievements_update_badge": ("edit", "content", "badge"),
    "achievements_archive_badge": ("archive", "content", "badge"),
    "achievements_restore_badge": ("restore", "content", "badge"),
    # Settings / own account
    "game_settings": ("game_settings", "settings", None),
    "staff_password_reset": ("password_changed", "security", "account"),
    "profile_photo_upload": ("photo_change", "accounts", "account"),
    "profile_photo_remove": ("photo_remove", "accounts", "account"),
}

# POST routes that change nothing worth recording (checks, previews, beats, reads).
NOT_LOGGED = {
    "admin_session_end_beacon", "presence_heartbeat_route", "presence_leave_route",
    "coding_exercises_check_title", "fib_run_code", "staff_notifications_read",
    "staff_notifications_read_all", "staff_password_send_otp", "staff_password_verify_otp",
    "publishing_preview_check_answer", "publishing_preview_exercise_grade",
    "preview_play_fib_action", "preview_play_flashcard_action", "preview_play_mark_complete",
    "preview_play_mcq_action", "preview_play_exercise_submit",
}

# target type -> (table, id column, name column) for "the name at that moment"
NAME_SOURCES = {
    "chapter": ("category_tbl", "cat_id", "category_name"),
    "module": ("modules_tbl", "module_id", "module_name"),
    "lesson": ("learning_resources_tbl", "resource_id", "resource_title"),
    "video": ("video_tutorials_tbl", "video_tutorial_id", "video_title"),
    "activity": ("learning_activities_tbl", "la_id", "activity_title"),
    "exercise": ("coding_exercises_tbl", "exercise_id", "exercise_title"),
    "badge": ("badges_tbl", "badge_id", "badge_name"),
}

# where each target type's id can be found (URL args, form/JSON fields, the response)
ID_KEYS = {
    "chapter": ("cat_id", "category_id"),
    "module": ("module_id",),
    "lesson": ("resource_id",),
    "video": ("video_tutorial_id", "video_id", "resource_id"),
    "activity": ("activity_id", "la_id"),
    "exercise": ("exercise_id",),
    "badge": ("badge_id",),
    "account": ("acc_id",),
}
# form / JSON fields that carry a new item's name (used when no id is known)
NAME_FIELDS = ("category_name", "module_name", "lesson_name", "badge_name", "activity_title",
               "exercise_title", "video_title", "title", "name")
KIND_TO_TYPE = {"category": "chapter", "module": "module", "lesson": "lesson",
                "video": "video", "activity": "activity", "exercise": "exercise"}

_schema_ready = False
_last_retention = 0.0
_retention_lock = threading.Lock()

SCHEMA_SQL = (
    f"""CREATE TABLE IF NOT EXISTS {ACTIVITY_TABLE} (
          log_id        BIGINT       NOT NULL AUTO_INCREMENT,
          created_at    DATETIME     NOT NULL,
          actor_acc_id  VARCHAR(15)  NULL,
          actor_role    VARCHAR(20)  NULL,
          action        VARCHAR(40)  NOT NULL,
          category      VARCHAR(20)  NOT NULL,
          target_type   VARCHAR(20)  NULL,
          target_id     VARCHAR(30)  NULL,
          target_name   VARCHAR(255) NULL,
          details       VARCHAR(500) NULL,
          ip_address    VARCHAR(45)  NULL,
          endpoint      VARCHAR(80)  NULL,
          PRIMARY KEY (log_id),
          KEY idx_activity_time (created_at),
          KEY idx_activity_actor (actor_acc_id, created_at),
          KEY idx_activity_category (category, created_at),
          KEY idx_activity_action (action),
          KEY idx_activity_target (target_type, target_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci""",
    f"""CREATE TABLE IF NOT EXISTS {ERROR_TABLE} (
          error_id    BIGINT       NOT NULL AUTO_INCREMENT,
          created_at  DATETIME     NOT NULL,
          status      INT          NOT NULL DEFAULT 500,
          method      VARCHAR(10)  NULL,
          path        VARCHAR(255) NULL,
          endpoint    VARCHAR(80)  NULL,
          acc_id      VARCHAR(15)  NULL,
          error_type  VARCHAR(100) NULL,
          message     VARCHAR(500) NULL,
          PRIMARY KEY (error_id),
          KEY idx_error_time (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci""",
)


def ensure_audit_schema(connection):
    """Creates both tables (once per process) and copies the old account-tools log once."""
    global _schema_ready
    if _schema_ready:
        return
    try:
        cursor = connection.cursor()
        for statement in SCHEMA_SQL:
            cursor.execute(statement)
        connection.commit()
        try:
            _copy_old_account_log(cursor)
            connection.commit()
        except Error as e:   # the copy is retried on the next start
            connection.rollback()
            print(f"audit: could not copy the old account log yet: {e}")
        cursor.close()
        _schema_ready = True
    except Error as e:
        print(f"audit: could not prepare the log tables: {e}")


def _copy_old_account_log(cursor):
    """
    One time: every row of the account-tools log (account_actions_log_tbl)
    is copied here, so there is ONE log. The old table is left untouched.
    """
    cursor.execute(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = %s",
        (OLD_ACCOUNT_LOG,)
    )
    if not cursor.fetchone()[0]:
        return
    cursor.execute(
        "SELECT setting_value FROM system_settings_tbl WHERE setting_key = 'activity_log_copied_account_log'"
    )
    if cursor.fetchone():
        return
    cases = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in ACCOUNT_TOOL_CATEGORIES.items())
    cursor.execute(
        f"""INSERT INTO {ACTIVITY_TABLE}
                (created_at, actor_acc_id, actor_role, action, category, target_type, target_id,
                 target_name, details, ip_address, endpoint)
            SELECT o.created_at, o.done_by, ut.u_type, o.action,
                   CASE o.action {cases} ELSE 'accounts' END,
                   IF(o.acc_id IS NULL, NULL, 'account'), o.acc_id,
                   TRIM(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))),
                   o.details, o.ip_address, 'account_tools'
            FROM {OLD_ACCOUNT_LOG} o
            LEFT JOIN account_tbl a ON a.acc_id = o.done_by
            LEFT JOIN usertype_tbl ut ON ut.ut_id = a.u_type
            LEFT JOIN profile_tbl p ON p.acc_id = o.acc_id
            ORDER BY o.action_id"""
    )
    cursor.execute(
        """INSERT INTO system_settings_tbl (setting_key, setting_value) VALUES ('activity_log_copied_account_log', '1')
           ON DUPLICATE KEY UPDATE setting_value = '1'"""
    )


# ------------------------------------------------------------------
# The one helper
# ------------------------------------------------------------------
def _role_of(cursor, acc_id):
    if not acc_id:
        return None
    try:
        cursor.execute(
            """SELECT ut.u_type FROM account_tbl a JOIN usertype_tbl ut ON ut.ut_id = a.u_type
               WHERE a.acc_id = %s""",
            (acc_id,)
        )
        row = cursor.fetchone()
        return (row[0] if not isinstance(row, dict) else row.get("u_type")) if row else None
    except Error:
        return None


def target_name(cursor, target_type, target_id):
    """The current name of an item / account, or None."""
    if not target_type or target_id in (None, ""):
        return None
    try:
        if target_type == "account":
            cursor.execute(
                """SELECT TRIM(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))), a.username
                   FROM account_tbl a LEFT JOIN profile_tbl p ON p.acc_id = a.acc_id
                   WHERE a.acc_id = %s LIMIT 1""",
                (str(target_id),)
            )
            row = cursor.fetchone()
            if not row:
                return None
            values = list(row.values()) if isinstance(row, dict) else list(row)
            return (values[0] or values[1] or None)
        source = NAME_SOURCES.get(target_type)
        if not source:
            return None
        table, id_col, name_col = source
        cursor.execute(f"SELECT {name_col} FROM {table} WHERE {id_col} = %s LIMIT 1", (int(target_id),))
        row = cursor.fetchone()
        if not row:
            return None
        return (list(row.values())[0] if isinstance(row, dict) else row[0])
    except (Error, ValueError, TypeError):
        return None


def log_on_cursor(cursor, action, category, actor=None, target_type=None, target_id=None,
                  name=None, details=None, ip_address=None, endpoint=None, actor_role=None):
    """
    One activity row on the CALLER's cursor (saved or rolled back together
    with the action). Never raises.
    """
    try:
        if name is None and target_type:
            name = target_name(cursor, target_type, target_id)
        if actor_role is None:
            actor_role = _role_of(cursor, actor)
        cursor.execute(
            f"""INSERT INTO {ACTIVITY_TABLE}
                    (created_at, actor_acc_id, actor_role, action, category, target_type, target_id,
                     target_name, details, ip_address, endpoint)
                VALUES (NOW(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (actor, actor_role, action[:40], category[:20], target_type,
             None if target_id in (None, "") else str(target_id)[:30],
             (name or None) and str(name)[:255], (details or None) and str(details)[:500],
             ip_address, (endpoint or None) and str(endpoint)[:80])
        )
    except Error as e:
        print(f"audit: could not log '{action}': {e}")


def log(action, category, actor=None, target_type=None, target_id=None, name=None,
        details=None, ip_address=None, endpoint=None):
    """log_on_cursor() with its own connection. Never raises."""
    connection = get_db_connection()
    if connection is None:
        return
    try:
        ensure_audit_schema(connection)
        cursor = connection.cursor()
        log_on_cursor(cursor, action, category, actor, target_type, target_id, name, details,
                      ip_address, endpoint)
        _maybe_apply_retention(cursor)
        connection.commit()
        cursor.close()
    except Error as e:
        print(f"audit: log failed: {e}")
    finally:
        if connection.is_connected():
            connection.close()


def _maybe_apply_retention(cursor):
    """Rows older than RETENTION_DAYS go - checked at most once a day per process."""
    global _last_retention
    now = time.monotonic()
    with _retention_lock:
        if now - _last_retention < 24 * 3600:
            return
        _last_retention = now
    try:
        cursor.execute(f"DELETE FROM {ACTIVITY_TABLE} WHERE created_at < NOW() - INTERVAL {RETENTION_DAYS} DAY")
        cursor.execute(f"DELETE FROM {ERROR_TABLE} WHERE created_at < NOW() - INTERVAL 90 DAY")
    except Error as e:
        print(f"audit: retention cleanup failed: {e}")


# ------------------------------------------------------------------
# The automatic hook on admin_bp
# ------------------------------------------------------------------
def _short_endpoint():
    return (request.endpoint or "").split(".", 1)[-1]


def _resolve_type(spec):
    if spec == "from_kind":
        return KIND_TO_TYPE.get((request.view_args or {}).get("kind"))
    if spec == "from_args_type":
        return "video" if (request.args.get("type") or "").lower().startswith("video") else "lesson"
    return spec


def _request_values():
    values = dict(request.view_args or {})
    try:
        for key, value in request.form.items():
            values.setdefault(key, value)
    except Exception:
        pass
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        for key, value in data.items():
            if not isinstance(value, (list, dict)):
                values.setdefault(key, value)
    return values


def _find_id(target_type, values):
    # /publishing/<kind>/<int:item_id>/<action> names its id "item_id"
    for key in ID_KEYS.get(target_type, ()) + ("item_id",):
        value = values.get(key)
        if value not in (None, "", "None", "null", 0, "0"):
            return value
    return None


def _before_request_capture():
    """Remember the target and its CURRENT name before the action runs (a delete still has a name)."""
    if request.method != "POST":
        return
    endpoint = _short_endpoint()
    spec = ROUTE_ACTIONS.get(endpoint)
    if not spec:
        return
    target_type = _resolve_type(spec[2])
    values = _request_values()
    target_id = _find_id(target_type, values) if target_type else None
    g.audit_before = {"type": target_type, "id": target_id, "name": None}
    if target_type and target_id:
        connection = get_db_connection()
        if connection is None:
            return
        try:
            cursor = connection.cursor()
            g.audit_before["name"] = target_name(cursor, target_type, target_id)
            cursor.close()
        except Error:
            pass
        finally:
            if connection.is_connected():
                connection.close()


def _current_name(target_type, target_id):
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor()
        return target_name(cursor, target_type, target_id)
    except Error:
        return None
    finally:
        if connection.is_connected():
            connection.close()


def _response_json(response):
    try:
        if response.is_json:
            data = response.get_json(silent=True)
            return data if isinstance(data, dict) else {}
    except Exception:
        pass
    return {}


def _after_request_log(response):
    if request.method != "POST" or getattr(g, "audit_skip", False):
        return response
    endpoint = _short_endpoint()
    if endpoint in NOT_LOGGED or not endpoint:
        return response
    if response.status_code >= 400:
        return response
    body = _response_json(response)
    if body.get("success") is False:
        return response
    actor = session.get("admin_id")
    if not actor:
        return response

    spec = ROUTE_ACTIONS.get(endpoint, ("other", "content", None))
    if spec is None:
        return response                        # logged by the feature itself
    action, category, type_spec = spec
    before = getattr(g, "audit_before", None) or {}
    target_type = before.get("type") if before else _resolve_type(type_spec)
    target_id = before.get("id")
    name = before.get("name")
    values = _request_values()
    details = None

    if action == "save_or_create":
        created_id = None
        if target_type:
            for key in ID_KEYS.get(target_type, ()):
                if body.get(key):
                    created_id = body.get(key)
                    break
        action = "edit" if target_id else ("create" if created_id else "save_draft")
        target_id = target_id or created_id
        name = None   # read the NEW name after the save
    elif action == "edit":
        # The row shows the NEW name; a rename also says what it was.
        old_name = name
        name = None
        if old_name and target_type and target_id:
            new_name = _current_name(target_type, target_id)
            if new_name and new_name != old_name:
                details = f"Renamed from “{old_name}”"
    elif action == "from_action":
        action = str((request.view_args or {}).get("action") or "other").replace("-", "_")
    elif action == "create_account":
        target_id = body.get("acc_id") or values.get("acc_id")
        name = None
    elif action in ("checklist", "bulk_restore", "reorder"):
        data = request.get_json(silent=True) or {}
        items = data.get("items") if isinstance(data, dict) else None
        if isinstance(items, list):
            details = f"{len(items)} item{'s' if len(items) != 1 else ''}"
        if action == "checklist" and isinstance(data, dict) and data.get("mode"):
            details = f"{data.get('mode')}: {details or ''}".strip(": ")
    elif action == "revert_name":
        data = request.get_json(silent=True) or {}
        details = f"history #{data.get('history_id')}" if isinstance(data, dict) and data.get("history_id") else None
    elif action in ("password_changed", "photo_change", "photo_remove"):
        target_type, target_id = "account", actor
    elif action == "other":
        details = f"{request.method} {request.path}"

    # A new item's id is only in the answer ({"cat_id": 12} / {"badge": {"badge_id": 4}}).
    if not target_id and target_type:
        target_id = _find_id(target_type, body) or next(
            (_find_id(target_type, v) for v in body.values() if isinstance(v, dict) and _find_id(target_type, v)), None)
        if target_id:
            name = None
    if not name and not target_id:
        name = next((values.get(k) for k in NAME_FIELDS if values.get(k)), None)

    if not details and body.get("message") and action not in ("edit", "create", "save_draft"):
        details = str(body.get("message"))[:200]
    try:
        from client_ip import get_client_ip
        ip_address = get_client_ip()
    except Exception:
        ip_address = None
    log(action, category, actor, target_type, target_id, name, details, ip_address, endpoint)
    return response


def install_audit_hooks(blueprint):
    """Called once by admin_routes.py for admin_bp."""
    blueprint.before_request(_before_request_capture)
    blueprint.after_request(_after_request_log)


def skip_auto_log():
    """A route that logs itself in more detail can switch the hook off for this request."""
    g.audit_skip = True


# ------------------------------------------------------------------
# Errors (System Health)
# ------------------------------------------------------------------
def record_error(status, error_type=None, message=None):
    connection = get_db_connection()
    if connection is None:
        return
    try:
        ensure_audit_schema(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"""INSERT INTO {ERROR_TABLE} (created_at, status, method, path, endpoint, acc_id, error_type, message)
                VALUES (NOW(), %s, %s, %s, %s, %s, %s, %s)""",
            (int(status), request.method, request.path[:255], (request.endpoint or "")[:80],
             session.get("admin_id") or session.get("acc_id"),
             (error_type or None) and str(error_type)[:100], (message or None) and str(message)[:500])
        )
        connection.commit()
        cursor.close()
    except Exception as e:   # never let error logging cause another error
        print(f"audit: could not record an error: {e}")
    finally:
        if connection.is_connected():
            connection.close()


def init_error_log(app):
    """Every unhandled crash, and every 5xx answer, becomes one error_log_tbl row."""
    from flask import got_request_exception

    def on_exception(sender, exception, **extra):
        g.error_logged = True
        record_error(500, type(exception).__name__, str(exception))

    got_request_exception.connect(on_exception, app, weak=False)

    @app.after_request
    def _log_5xx(response):
        if response.status_code >= 500 and not getattr(g, "error_logged", False):
            body = _response_json(response)
            record_error(response.status_code, f"HTTP {response.status_code}", body.get("message"))
        return response


# ------------------------------------------------------------------
# The Activity Log page
# ------------------------------------------------------------------
def describe(action, target_type):
    verb = VERBS.get(action, action.replace("_", " ").capitalize())
    if action in ("login", "login_failed", "help_request", "self_delete", "self_restore", "password_changed",
                  "photo_change", "photo_remove", "game_settings", "setting_changed", "export_csv"):
        return verb
    if target_type and target_type != "account" and action not in ("progress_reset", "password_reset",
                                                                  "help_done", "admin_restore_pending"):
        return f"{verb} {target_type}"
    if target_type == "account" and action in ("archive", "restore", "unlock", "create_account"):
        return f"{verb} account"
    return verb


def _union_sql():
    return f"""
        SELECT 'activity' AS src, l.log_id AS row_id, l.created_at, l.actor_acc_id, l.actor_role,
               l.action, l.category, l.target_type, l.target_id, l.target_name, l.details, l.ip_address
        FROM {ACTIVITY_TABLE} l
        UNION ALL
        SELECT 'login', ll.log_id, ll.attempted_at, ll.acc_id, NULL,
               IF(ll.attempt_status = 'Success', 'login', 'login_failed'), 'logins',
               'account', ll.acc_id, NULL, NULL, ll.ip_address
        FROM login_logs_tbl ll
    """


def _filters_sql(filters):
    where, params = [], []
    if filters.get("actor"):
        where.append("x.actor_acc_id = %s")
        params.append(filters["actor"])
    category = filters.get("category")
    if category in CATEGORIES:
        where.append("x.category = %s")
        params.append(category)
    elif not filters.get("include_logins", True):
        where.append("x.category <> 'logins'")
    if filters.get("action"):
        where.append("x.action = %s")
        params.append(filters["action"])
    for key, op in (("date_from", ">="), ("date_to", "<")):
        value = filters.get(key)
        if value:
            try:
                datetime.strptime(value, "%Y-%m-%d")
            except ValueError:
                continue
            if op == "<":
                where.append("x.created_at < DATE_ADD(%s, INTERVAL 1 DAY)")
            else:
                where.append("x.created_at >= %s")
            params.append(value)
    term = (filters.get("q") or "").strip().lower()
    if term:
        like = f"%{term}%"
        where.append("""(LOWER(COALESCE(x.target_name, '')) LIKE %s OR LOWER(COALESCE(x.details, '')) LIKE %s
                         OR LOWER(COALESCE(x.target_id, '')) LIKE %s OR LOWER(COALESCE(x.actor_acc_id, '')) LIKE %s
                         OR LOWER(CONCAT(COALESCE(ap.firstname, ''), ' ', COALESCE(ap.lastname, ''))) LIKE %s
                         OR LOWER(COALESCE(tp.firstname, '')) LIKE %s OR LOWER(COALESCE(tp.lastname, '')) LIKE %s)""")
        params.extend([like] * 7)
    return (" WHERE " + " AND ".join(where)) if where else "", params


def get_activity(filters, page=1, per_page=PER_PAGE, export=False):
    """
    {"rows": [...], "total", "page", "total_pages", "people": [...], "actions": [...]}
    or None on a database error. export=True -> every matching row (capped).
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        ensure_audit_schema(connection)
        cursor = connection.cursor(dictionary=True)
        where, params = _filters_sql(filters)
        base = f"""
            FROM ({_union_sql()}) x
            LEFT JOIN profile_tbl ap ON ap.acc_id = x.actor_acc_id
            LEFT JOIN account_tbl aa ON aa.acc_id = x.actor_acc_id
            LEFT JOIN usertype_tbl aut ON aut.ut_id = aa.u_type
            LEFT JOIN profile_tbl tp ON x.target_type = 'account' AND tp.acc_id = x.target_id
            {where}
        """
        cursor.execute(f"SELECT COUNT(*) AS n {base}", tuple(params))
        total = int(cursor.fetchone()["n"])
        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(max(1, int(page or 1)), total_pages)
        limit, offset = (EXPORT_LIMIT, 0) if export else (per_page, (page - 1) * per_page)
        cursor.execute(
            f"""SELECT x.*, ap.firstname AS a_first, ap.lastname AS a_last, aa.username AS a_username,
                       aut.u_type AS a_role_now, tp.firstname AS t_first, tp.lastname AS t_last
                {base}
                ORDER BY x.created_at DESC, x.row_id DESC
                LIMIT %s OFFSET %s""",
            tuple(params) + (limit, offset)
        )
        rows = cursor.fetchall()
        people = _people(cursor) if not export else []
        cursor.execute(f"SELECT DISTINCT action FROM {ACTIVITY_TABLE} ORDER BY action")
        actions = sorted({r["action"] for r in cursor.fetchall()} | {"login", "login_failed"})
        cursor.close()
    except Error as e:
        print(f"audit: could not load the activity log: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()

    out = []
    for r in rows:
        actor_name = " ".join(x for x in (r.get("a_first"), r.get("a_last")) if x).strip() \
            or r.get("a_username") or (r.get("actor_acc_id") or "System")
        name = r.get("target_name")
        if not name and r.get("target_type") == "account":
            name = " ".join(x for x in (r.get("t_first"), r.get("t_last")) if x).strip() or None
        if r["src"] == "login":
            name = ""                            # the person IS the actor
            if not r.get("actor_acc_id"):
                actor_name = "Unknown username"
        out.append({
            "when": fmt_datetime(r.get("created_at")),
            "when_iso": r["created_at"].isoformat(sep=" ") if r.get("created_at") else "",
            "actor_acc_id": r.get("actor_acc_id") or "",
            "actor_name": actor_name,
            "actor_role": r.get("actor_role") or r.get("a_role_now") or "",
            "action": r["action"],
            "label": describe(r["action"], r.get("target_type")),
            "category": r["category"],
            "category_label": CATEGORIES.get(r["category"], r["category"].capitalize()),
            "target_type": r.get("target_type") or "",
            "target_id": r.get("target_id") or "",
            "target_name": name or "",
            "details": r.get("details") or "",
            "ip_address": r.get("ip_address") or "",
        })
    return {"rows": out, "total": total, "page": page, "total_pages": total_pages,
            "per_page": per_page, "people": people,
            "actions": [{"value": a, "label": VERBS.get(a, a.replace("_", " ").capitalize())} for a in actions],
            "categories": [{"value": k, "label": v} for k, v in CATEGORIES.items()]}


def _people(cursor):
    """Everyone who appears as an actor (for the Person filter)."""
    cursor.execute(
        f"""SELECT DISTINCT x.actor_acc_id AS acc_id, p.firstname, p.lastname, a.username, ut.u_type AS role
            FROM (SELECT DISTINCT actor_acc_id FROM {ACTIVITY_TABLE} WHERE actor_acc_id IS NOT NULL
                  UNION SELECT acc_id FROM account_tbl a2 JOIN usertype_tbl u2 ON u2.ut_id = a2.u_type
                        WHERE u2.u_type IN ('Admin', 'Mentor')) x
            JOIN account_tbl a ON a.acc_id = x.actor_acc_id
            LEFT JOIN usertype_tbl ut ON ut.ut_id = a.u_type
            LEFT JOIN profile_tbl p ON p.acc_id = x.actor_acc_id"""
    )
    people = []
    for r in cursor.fetchall():
        name = " ".join(x for x in (r.get("firstname"), r.get("lastname")) if x).strip() or r.get("username")
        people.append({"acc_id": r["acc_id"], "name": name, "role": r.get("role") or ""})
    return sorted(people, key=lambda p: (p["role"] == "Learner", p["name"].lower()))


# ------------------------------------------------------------------
# CSV (shared by every export)
# ------------------------------------------------------------------
def _safe_cell(value):
    """Excel / Sheets never run a cell as a formula (CSV injection)."""
    text = "" if value is None else str(value)
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


def to_csv(headers, rows):
    """headers: [(key, title)], rows: [dict] -> CSV text with a BOM (Excel opens UTF-8 correctly)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([title for _, title in headers])
    for row in rows:
        writer.writerow([_safe_cell(row.get(key)) for key, _ in headers])
    return "﻿" + buffer.getvalue()
