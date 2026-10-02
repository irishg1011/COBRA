"""
recommendations.py - Mentor > Recommendations (Lesson Recommendations)
------------------------------------------------------------------------
Read-only DB helpers behind the Mentor > Recommendations page. Reads
lesson_recommendations_tbl - the rows weak_spots.py creates from each
learner's missed items (the lesson PART that teaches what they missed).
This file never decides what to recommend and never changes a
recommendation's status; weak_spots.py owns both.

Same convention as sandbox_monitor.py: no Flask/session code here;
admin_routes.py is the only place these become HTTP responses.

Status (worked out from the row, see weak_spots.py):
    pending      recommended, the learner has not opened the review yet
    in_progress  the learner opened the review, or fixed some of the items
    completed    every missed item behind it was fixed

Filters:
    search_query  - learner ID or name, weak topic, or lesson title
    status_filter - 'pending' | 'in_progress' | 'completed'
    date_from / date_to - 'YYYY-MM-DD', inclusive, on the date recommended

The stat cards follow search + date only, never the status filter -
otherwise picking "Pending" would always show In Progress = 0.
"""

from datetime import datetime
from mysql.connector import Error

from cobradb import get_db_connection
from weak_spots import (
    RECOMMENDATIONS_TABLE, LEGACY_REASON_RE, ensure_recommendation_schema, refresh_recommendations,
)

DEFAULT_PER_PAGE = 8

STATUS_LABELS = {"pending": "Pending", "in_progress": "In Progress", "completed": "Completed"}

# The one place the status rule is written for SQL (r = lesson_recommendations_tbl).
STATUS_SQL = """CASE
        WHEN r.resolved = 1 THEN 'completed'
        WHEN r.viewed_at IS NOT NULL OR r.missed_count < r.initial_missed THEN 'in_progress'
        ELSE 'pending'
    END"""

FROM_SQL = f"""
    FROM {RECOMMENDATIONS_TABLE} r
    LEFT JOIN learning_resources_tbl lr ON lr.resource_id = r.resource_id
    LEFT JOIN modules_tbl m ON m.module_id = r.module_id
    LEFT JOIN profile_tbl p ON p.acc_id = r.acc_id
"""


def _fmt_date(dt):
    """e.g. 'Jul 10, 2026'. NULL -> '—'."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


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
    """Search + date filters - used by BOTH the stat cards and the table."""
    clauses, params = [], []

    term = (search_query or "").strip().lower()
    if term:
        clauses.append(
            "(LOWER(r.acc_id) LIKE %s OR LOWER(CONCAT_WS(' ', p.firstname, p.lastname)) LIKE %s "
            "OR LOWER(COALESCE(r.weak_topic, r.reason, '')) LIKE %s OR LOWER(COALESCE(lr.resource_title, '')) LIKE %s)"
        )
        params.extend([f"%{term}%"] * 4)
    if date_from:
        clauses.append("DATE(r.generated_at) >= %s")
        params.append(date_from)
    if date_to:
        clauses.append("DATE(r.generated_at) <= %s")
        params.append(date_to)

    return clauses, params


def _empty_metrics():
    return {"total": 0, "pending": 0, "in_progress": 0, "completed": 0}


def empty_recommendations_data():
    """Used when the DB is unreachable so the page still answers."""
    return {
        "rows": [], "metrics": _empty_metrics(),
        "total": 0, "page": 1, "per_page": DEFAULT_PER_PAGE, "total_pages": 1,
    }


def _weak_topic(row):
    """The lesson part to re-read. Old rows only have it inside the reason text."""
    if row.get("weak_topic"):
        return row["weak_topic"]
    match = LEGACY_REASON_RE.match(row.get("reason") or "")
    return match.group(1) if match else "—"


def get_recommendations_data(search_query=None, status_filter=None, date_from=None,
                             date_to=None, page=1, per_page=DEFAULT_PER_PAGE, refresh=False):
    """
    refresh=True (the page's first load) first re-checks learners' current
    weak spots through weak_spots.refresh_recommendations() - throttled
    there, so reloading the page does not repeat the work.

    Returns:
        {
            "rows": [...], "metrics": {...},
            "total": int, "page": int, "per_page": int, "total_pages": int
        }
    or None if the database is unreachable.
    """
    if refresh:
        refresh_recommendations()

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        ensure_recommendation_schema(cursor)

        date_from = _clean_date(date_from)
        date_to = _clean_date(date_to)
        clauses, params = _shared_filters(search_query, date_from, date_to)

        # --- Stat cards (search + date only) ---
        cursor.execute(
            f"""
            SELECT status, COUNT(*) AS n
            FROM (SELECT {STATUS_SQL} AS status {FROM_SQL} {_where(clauses)}) counted
            GROUP BY status
            """,
            tuple(params)
        )
        metrics = _empty_metrics()
        for row in cursor.fetchall():
            if row["status"] in metrics:
                metrics[row["status"]] = int(row["n"] or 0)
        metrics["total"] = metrics["pending"] + metrics["in_progress"] + metrics["completed"]

        # --- Table (search + date + status) ---
        table_clauses = list(clauses)
        table_params = list(params)
        status = (status_filter or "").strip().lower()
        if status in STATUS_LABELS:
            table_clauses.append(f"({STATUS_SQL}) = %s")
            table_params.append(status)
        where_sql = _where(table_clauses)

        cursor.execute(f"SELECT COUNT(*) AS total {FROM_SQL} {where_sql}", tuple(table_params))
        total = cursor.fetchone()["total"]

        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(max(1, page or 1), total_pages)
        offset = (page - 1) * per_page

        cursor.execute(
            f"""
            SELECT r.recommendation_id, r.acc_id, r.weak_topic, r.reason,
                   r.missed_count, r.initial_missed, r.generated_at, r.resolved_at,
                   {STATUS_SQL} AS status,
                   lr.resource_title, m.module_name,
                   p.firstname, p.lastname
            {FROM_SQL}
            {where_sql}
            ORDER BY r.generated_at DESC, r.recommendation_id DESC
            LIMIT %s OFFSET %s
            """,
            tuple(table_params + [per_page, offset])
        )
        fetched = cursor.fetchall()
        cursor.close()

        rows = [{
            "recommendation_id": row["recommendation_id"],
            "acc_id": row["acc_id"],
            "learner_name": f"{row.get('firstname') or ''} {row.get('lastname') or ''}".strip(),
            "weak_topic": _weak_topic(row),
            "lesson": row.get("resource_title") or "Lesson no longer available",
            "module": row.get("module_name") or "",
            "reason": row.get("reason") or "—",
            "date": _fmt_date(row.get("generated_at")),
            "status": row["status"],
            "status_label": STATUS_LABELS.get(row["status"], "Pending"),
            "completed_on": _fmt_date(row.get("resolved_at")) if row["status"] == "completed" else "",
        } for row in fetched]

        return {
            "rows": rows,
            "metrics": metrics,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    except Error as e:
        print(f"recommendations: failed to load data: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()