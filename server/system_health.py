"""
system_health.py - System Health page + Dashboard card (feat/admin-extras)
------------------------------------------------------------------------------
Read-only. One call -> everything the page shows:

    database   connected?  response time, MariaDB version, its uptime,
               database size, open connections
    app        uptime of THIS server process (since its last start/restart),
               Python version
    sessions   accounts signed in now (session_tracker) + online now (presence)
    errors     today's count from error_log_tbl (audit.init_error_log) + the last 10
    backup     the newest file in BACKUP_DIR (env; default <project>/backups) -
               written by deploy/backup.sh. "No backups found" otherwise.
    disk       free space where the backups are kept

Overall status: "ok", "warning" (no backup in 2 days, errors today, low
disk) or "down" (database unreachable).
"""

import os
import platform
import shutil
import time
from datetime import datetime

from mysql.connector import Error

from cobradb import get_db_connection, DB_NAME
from admin_time import fmt_datetime
from audit import ERROR_TABLE, ensure_audit_schema

APP_STARTED = time.time()           # when this server process started
PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKUP_PATTERNS = (".sql", ".sql.gz", ".gz", ".zip")
BACKUP_WARN_HOURS = 48
LOW_DISK_PERCENT = 10


def backup_dir():
    return os.environ.get("BACKUP_DIR") or os.path.join(PROJECT_DIR, "backups")


def human_duration(seconds):
    seconds = int(max(0, seconds))
    days, rest = divmod(seconds, 86400)
    hours, rest = divmod(rest, 3600)
    minutes = rest // 60
    if days:
        return f"{days} day{'s' if days != 1 else ''}, {hours} h"
    if hours:
        return f"{hours} h {minutes} min"
    return f"{minutes} min"


def human_size(num):
    num = float(num or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if num < 1024 or unit == "TB":
            return f"{num:.0f} {unit}" if unit == "B" else f"{num:.1f} {unit}"
        num /= 1024


def _database():
    started = time.perf_counter()
    connection = get_db_connection()
    if connection is None:
        return {"ok": False, "message": "Can't connect to the database."}, None
    info = {"ok": True, "message": "Connected"}
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT VERSION()")
        info["version"] = cursor.fetchone()[0]
        info["response_ms"] = round((time.perf_counter() - started) * 1000)
        cursor.execute("SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime', 'Threads_connected')")
        status = {name: value for name, value in cursor.fetchall()}
        info["uptime"] = human_duration(int(status.get("Uptime", 0)))
        info["connections"] = int(status.get("Threads_connected", 0))
        cursor.execute(
            """SELECT COALESCE(SUM(data_length + index_length), 0), COUNT(*)
               FROM information_schema.tables WHERE table_schema = DATABASE()"""
        )
        size, tables = cursor.fetchone()
        info["size"] = human_size(size)
        info["tables"] = int(tables)
        info["name"] = DB_NAME
        cursor.close()
        return info, connection
    except Error as e:
        if connection.is_connected():
            connection.close()
        return {"ok": False, "message": f"Database error: {e}"}, None


def _errors(connection):
    try:
        ensure_audit_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(f"SELECT COUNT(*) AS n FROM {ERROR_TABLE} WHERE created_at >= CURDATE()")
        today = int(cursor.fetchone()["n"])
        cursor.execute(
            f"""SELECT created_at, status, method, path, error_type, message
                FROM {ERROR_TABLE} ORDER BY created_at DESC, error_id DESC LIMIT 10"""
        )
        recent = [{
            "when": fmt_datetime(r["created_at"]),
            "status": r["status"],
            "where": f"{r.get('method') or ''} {r.get('path') or ''}".strip(),
            "what": (r.get("error_type") or "") + (f": {r['message']}" if r.get("message") else ""),
        } for r in cursor.fetchall()]
        cursor.close()
        return {"today": today, "recent": recent}
    except Error as e:
        return {"today": None, "recent": [], "message": f"Could not read the error log: {e}"}


def _sessions(connection):
    out = {"signed_in": None, "online": None}
    try:
        from session_tracker import get_active_session_count
        out["signed_in"] = get_active_session_count(connection)
    except Exception:
        pass
    try:
        from presence import get_all_states
        out["online"] = sum(1 for state in get_all_states().values() if state == "online")
    except Exception:
        pass
    return out


def _backup():
    folder = backup_dir()
    info = {"folder": folder, "found": False}
    try:
        files = [os.path.join(folder, name) for name in os.listdir(folder)
                 if name.lower().endswith(BACKUP_PATTERNS)]
    except OSError:
        info["message"] = "No backup folder yet."
        return info
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        info["message"] = "No backups found."
        return info
    newest = max(files, key=os.path.getmtime)
    age_hours = (time.time() - os.path.getmtime(newest)) / 3600
    info.update({
        "found": True,
        "count": len(files),
        "file": os.path.basename(newest),
        "size": human_size(os.path.getsize(newest)),
        "when": fmt_datetime(datetime.fromtimestamp(os.path.getmtime(newest))),
        "age": human_duration(age_hours * 3600) + " ago",
        "stale": age_hours > BACKUP_WARN_HOURS,
    })
    return info


def _disk():
    for path in (backup_dir(), PROJECT_DIR):
        try:
            usage = shutil.disk_usage(path)
            return {"free": human_size(usage.free), "total": human_size(usage.total),
                    "free_percent": round(usage.free * 100 / usage.total) if usage.total else None}
        except OSError:
            continue
    return {}


def get_system_health():
    database, connection = _database()
    try:
        if connection is not None:
            errors = _errors(connection)
            sessions = _sessions(connection)
        else:
            errors = {"today": None, "recent": []}
            sessions = {"signed_in": None, "online": None}
    finally:
        if connection is not None and connection.is_connected():
            connection.close()

    backup = _backup()
    disk = _disk()
    warnings = []
    if not database["ok"]:
        status = "down"
        warnings.append(database["message"])
    else:
        status = "ok"
        if errors.get("today"):
            warnings.append(f"{errors['today']} server error{'s' if errors['today'] != 1 else ''} today.")
        if not backup["found"]:
            warnings.append("No database backup found.")
        elif backup.get("stale"):
            warnings.append(f"The last backup is {backup['age']}.")
        if disk.get("free_percent") is not None and disk["free_percent"] < LOW_DISK_PERCENT:
            warnings.append(f"Low disk space: {disk['free']} free.")
        if warnings:
            status = "warning"
    return {
        "status": status,
        "status_label": {"ok": "All good", "warning": "Needs attention", "down": "Database down"}[status],
        "warnings": warnings,
        "checked_at": fmt_datetime(datetime.now()),
        "database": database,
        "app": {
            "uptime": human_duration(time.time() - APP_STARTED),
            "started": fmt_datetime(datetime.fromtimestamp(APP_STARTED)),
            "python": platform.python_version(),
            "process": os.getpid(),
        },
        "sessions": sessions,
        "errors": errors,
        "backup": backup,
        "disk": disk,
    }
