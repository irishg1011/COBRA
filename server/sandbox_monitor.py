"""
sandbox_monitor.py - Admin > Coding Sandbox: Run Monitoring
------------------------------------------------------------------
Read-only DB helpers behind the Admin > Coding Sandbox page. Reads
sandbox_runs_tbl (written by sandbox_runs.log_run() every time a
learner clicks Run Code) - this file never writes anything.

Same convention as coding_exercises.py: no Flask/session code here;
admin_routes.py is the only place these become HTTP responses.

Filters:
    search_query  - learner ID (acc_id), partial match
    status_filter - 'success' or 'error' ('failed' also accepted)
    date_from / date_to - 'YYYY-MM-DD', inclusive, on run_at

Metric cards follow search + date only, never the status filter -
otherwise picking "Success" would always show Failed = 0.
"""

from datetime import datetime
from mysql.connector import Error
from cobradb import get_db_connection

SANDBOX_RUNS_TABLE = "sandbox_runs_tbl"
SANDBOX_SNIPPETS_TABLE = "sandbox_snippets_tbl"
DEFAULT_PER_PAGE = 8

# Maps whatever the Status dropdown sends to the value stored in the DB.
STATUS_FILTER_MAP = {"success": "success", "error": "error", "failed": "error"}
STATUS_LABELS = {"success": "Success", "error": "Failed"}


# ------------------------------------------------------------------
# Formatting helpers
# ------------------------------------------------------------------
def _fmt_time(dt):
    return dt.strftime('%I:%M %p').lstrip('0')


def _fmt_datetime(dt):
    """Table timestamp, e.g. 'Jul 20, 10:00 AM'."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {_fmt_time(dt)}"


def _fmt_full_datetime(dt):
    """Modal timestamp, e.g. 'Jul 20, 2026, 10:00 AM'."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}, {_fmt_time(dt)}"


def _fmt_exec_time(ms):
    """exec_time_ms -> seconds, e.g. 45.123 -> '0.045s'. NULL -> '—'."""
    if ms is None:
        return "—"
    try:
        return f"{float(ms) / 1000:.3f}s"
    except (TypeError, ValueError):
        return "—"


def _fmt_size(num_bytes):
    """Code size, e.g. 512 -> '512 B', 2048 -> '2.0 KB'."""
    n = int(num_bytes or 0)
    if n < 1024:
        return f"{n} B"
    return f"{n / 1024:.1f} KB"


def _clean_date(value):
    """Only a real 'YYYY-MM-DD' date is used; anything else is ignored."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def _where(clauses):
    return ("WHERE " + " AND ".join(clauses)) if clauses else ""


def _shared_filters(search_query, date_from, date_to):
    """Search + date filters - used by BOTH the metric cards and the table."""
    clauses, params = [], []

    term = (search_query or "").strip().lower()
    if term:
        clauses.append("LOWER(r.acc_id) LIKE %s")
        params.append(f"%{term}%")
    if date_from:
        clauses.append("DATE(r.run_at) >= %s")
        params.append(date_from)
    if date_to:
        clauses.append("DATE(r.run_at) <= %s")
        params.append(date_to)

    return clauses, params


def _empty_metrics():
    return {"total_runs": 0, "successful": 0, "failed": 0, "avg_exec_time": "—"}


# ------------------------------------------------------------------
# Page data: metric cards + one page of the runs table
# ------------------------------------------------------------------
def get_sandbox_overview(search_query=None, status_filter=None, date_from=None,
                         date_to=None, page=1, per_page=DEFAULT_PER_PAGE):
    """
    Returns:
        {
            "runs": [...], "metrics": {...},
            "total": int, "page": int, "per_page": int, "total_pages": int
        }
    or None if the database is unreachable.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)

        date_from = _clean_date(date_from)
        date_to = _clean_date(date_to)
        clauses, params = _shared_filters(search_query, date_from, date_to)

        # --- Metric cards (search + date only) ---
        cursor.execute(
            f"""
            SELECT
                COUNT(*) AS total_runs,
                COALESCE(SUM(r.status = 'success'), 0) AS successful,
                COALESCE(SUM(r.status = 'error'), 0) AS failed,
                AVG(r.exec_time_ms) AS avg_exec_ms
            FROM {SANDBOX_RUNS_TABLE} r
            {_where(clauses)}
            """,
            tuple(params)
        )
        m = cursor.fetchone() or {}
        metrics = {
            "total_runs": int(m.get("total_runs") or 0),
            "successful": int(m.get("successful") or 0),
            "failed": int(m.get("failed") or 0),
            "avg_exec_time": _fmt_exec_time(m.get("avg_exec_ms")),
        }

        # --- Table (search + date + status) ---
        table_clauses = list(clauses)
        table_params = list(params)
        status = STATUS_FILTER_MAP.get((status_filter or "").strip().lower())
        if status:
            table_clauses.append("r.status = %s")
            table_params.append(status)
        where_sql = _where(table_clauses)

        cursor.execute(
            f"SELECT COUNT(*) AS total FROM {SANDBOX_RUNS_TABLE} r {where_sql}",
            tuple(table_params)
        )
        total = cursor.fetchone()["total"]

        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(max(1, page or 1), total_pages)
        offset = (page - 1) * per_page

        cursor.execute(
            f"""
            SELECT
                r.run_id,
                r.acc_id,
                r.status,
                r.exec_time_ms,
                OCTET_LENGTH(r.code_content) AS code_bytes,
                r.run_at
            FROM {SANDBOX_RUNS_TABLE} r
            {where_sql}
            ORDER BY r.run_at DESC, r.run_id DESC
            LIMIT %s OFFSET %s
            """,
            tuple(table_params + [per_page, offset])
        )
        rows = cursor.fetchall()
        cursor.close()

        runs = [{
            "run_id": row["run_id"],
            "acc_id": row["acc_id"],
            "status": row["status"],
            "status_label": STATUS_LABELS.get(row["status"], "Success"),
            "exec_time": _fmt_exec_time(row.get("exec_time_ms")),
            "size": _fmt_size(row.get("code_bytes")),
            "run_at": _fmt_datetime(row.get("run_at")),
        } for row in rows]

        return {
            "runs": runs,
            "metrics": metrics,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    except Error as e:
        print(f"sandbox_monitor: failed to load overview: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def empty_sandbox_overview():
    """Used when the DB is unreachable so the page still renders."""
    return {
        "runs": [], "metrics": _empty_metrics(),
        "total": 0, "page": 1, "per_page": DEFAULT_PER_PAGE, "total_pages": 1,
    }


# ------------------------------------------------------------------
# Modal data: one run's full code + recorded output
# ------------------------------------------------------------------
def get_sandbox_run(run_id):
    """Returns one run with its full code/output, or None if not found."""
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""
            SELECT
                r.run_id,
                r.acc_id,
                r.code_content,
                r.output,
                r.status,
                r.exec_time_ms,
                OCTET_LENGTH(r.code_content) AS code_bytes,
                r.run_at,
                s.title AS snippet_title
            FROM {SANDBOX_RUNS_TABLE} r
            LEFT JOIN {SANDBOX_SNIPPETS_TABLE} s ON r.snippet_id = s.snippet_id
            WHERE r.run_id = %s
            """,
            (run_id,)
        )
        row = cursor.fetchone()
        cursor.close()

        if not row:
            return None

        return {
            "run_id": row["run_id"],
            "acc_id": row["acc_id"],
            "status": row["status"],
            "status_label": STATUS_LABELS.get(row["status"], "Success"),
            "exec_time": _fmt_exec_time(row.get("exec_time_ms")),
            "size": _fmt_size(row.get("code_bytes")),
            "run_at": _fmt_full_datetime(row.get("run_at")),
            "snippet": row.get("snippet_title") or "Unsaved code",
            "code": row.get("code_content") or "",
            "output": row.get("output") or "",
        }

    except Error as e:
        print(f"sandbox_monitor: failed to load run {run_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()