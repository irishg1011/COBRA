"""
records.py - read-only "Records" browser for admins (feat/admin-extras)
------------------------------------------------------------------------------
Pick a table from ALLOWED_TABLES, browse it with search + paging. SELECT
only: there is no code here that writes anything.

Safety:
  - The table name must be a key of ALLOWED_TABLES (never taken as typed).
  - Column names come from the database's own information_schema, and are
    quoted with backticks.
  - Secret columns are NEVER read: any column whose name contains pass /
    token / otp / secret / salt / tab_id (a few harmless flags excepted -
    SHOWN_ANYWAY). They are left out of the SELECT entirely.
  - Binary columns (images) are shown as "[image, 24 KB]" - only their
    length is read. Long text is cut to TEXT_PREVIEW characters.
  - Search is a parameterized LIKE over the text columns (+ exact id).
"""

import re
from datetime import date, datetime
from decimal import Decimal

from mysql.connector import Error

from cobradb import get_db_connection
from admin_time import fmt_datetime

PER_PAGE = 25
TEXT_PREVIEW = 160
SECRET_COLUMN = re.compile(r"pass|token|otp|secret|salt|tab_id", re.IGNORECASE)
SHOWN_ANYWAY = {"must_change_password"}   # a yes/no flag, not a secret
BINARY_TYPES = {"blob", "tinyblob", "mediumblob", "longblob", "binary", "varbinary"}
TEXT_TYPES = {"char", "varchar", "text", "tinytext", "mediumtext", "longtext", "enum", "set"}

# table -> (group, friendly name)
ALLOWED_TABLES = {
    "account_tbl": ("Accounts", "Accounts"),
    "profile_tbl": ("Accounts", "Profiles"),
    "usertype_tbl": ("Accounts", "Roles"),
    "consent_tbl": ("Accounts", "Terms / privacy consent"),
    "category_tbl": ("Course", "Chapters"),
    "modules_tbl": ("Course", "Modules"),
    "learning_resources_tbl": ("Course", "Lessons"),
    "lesson_content_tbl": ("Course", "Lesson content"),
    "video_tutorials_tbl": ("Course", "Videos"),
    "learning_activities_tbl": ("Course", "Activities"),
    "mcq_questions_tbl": ("Course", "Multiple choice questions"),
    "mcq_options_tbl": ("Course", "Multiple choice options"),
    "fill_blanks_tbl": ("Course", "Fill in the blanks items"),
    "flashcards_tbl": ("Course", "Flashcards"),
    "coding_exercises_tbl": ("Course", "Coding exercises"),
    "test_cases_tbl": ("Course", "Coding exercise test cases"),
    "badges_tbl": ("Progress", "Badges"),
    "learner_resource_progress_tbl": ("Progress", "Lesson progress"),
    "learner_activity_progress_tbl": ("Progress", "Activity progress"),
    "exercise_submissions_tbl": ("Progress", "Exercise submissions"),
    "learner_badges_tbl": ("Progress", "Badges earned"),
    "certificates_tbl": ("Progress", "Certificates"),
    "login_logs_tbl": ("Logs", "Login logs"),
    "lockout_logs_tbl": ("Logs", "Lockouts"),
    "password_reset_logs_tbl": ("Logs", "Password resets"),
    "unlock_logs_tbl": ("Logs", "Unlocks"),
    "activity_log_tbl": ("Logs", "Activity log"),
    "title_history_tbl": ("Logs", "Name history"),
}
GROUP_ORDER = ("Accounts", "Course", "Progress", "Logs")


def _existing(cursor):
    cursor.execute("SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = DATABASE()")
    return {str(name).lower(): int(rows or 0) for name, rows in cursor.fetchall()}


def list_tables():
    """[{group, tables: [{name, label, rows}]}] - only allowed tables that exist. None on a DB error."""
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor()
        existing = _existing(cursor)
        cursor.close()
    except Error as e:
        print(f"records: could not list tables: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()
    groups = []
    for group in GROUP_ORDER:
        tables = [{"name": name, "label": label, "rows": existing[name]}
                  for name, (g, label) in ALLOWED_TABLES.items() if g == group and name in existing]
        if tables:
            groups.append({"group": group, "tables": tables})
    return groups


def _columns(cursor, table):
    cursor.execute(
        """SELECT column_name, data_type, column_key
           FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = %s
           ORDER BY ordinal_position""",
        (table,)
    )
    cols = []
    for name, data_type, key in cursor.fetchall():
        name = str(name)
        hidden = bool(SECRET_COLUMN.search(name)) and name not in SHOWN_ANYWAY
        cols.append({"name": name, "type": str(data_type).lower(), "key": key, "hidden": hidden})
    return cols


def _display(value, col):
    if value is None:
        return None
    if col["type"] in BINARY_TYPES:
        size = int(value or 0)
        return f"[binary, {size / 1024:.0f} KB]" if size >= 1024 else f"[binary, {size} B]"
    if isinstance(value, datetime):
        return fmt_datetime(value)
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (bytes, bytearray)):
        return f"[binary, {len(value)} B]"
    text = str(value)
    if len(text) > TEXT_PREVIEW:
        return text[:TEXT_PREVIEW] + "…"
    return value if isinstance(value, (int, float)) else text


def browse(table, search_query="", page=1, per_page=PER_PAGE):
    """
    {"table", "label", "columns": [names], "hidden": [names], "rows": [[...]],
     "total", "page", "total_pages"} - or (None, message).
    """
    if table not in ALLOWED_TABLES:
        return None, "That table isn't in the list."
    connection = get_db_connection()
    if connection is None:
        return None, "Could not reach the database."
    try:
        cursor = connection.cursor()
        if table not in _existing(cursor):
            cursor.close()
            return None, "That table doesn't exist yet."
        cols = _columns(cursor, table)
        shown = [c for c in cols if not c["hidden"]]
        if not shown:
            cursor.close()
            return None, "Nothing in this table can be shown."

        select = []
        for c in shown:
            q = f"`{c['name']}`"
            if c["type"] in BINARY_TYPES:
                select.append(f"LENGTH({q})")
            elif c["type"] in ("text", "mediumtext", "longtext"):
                select.append(f"LEFT({q}, {TEXT_PREVIEW + 1})")
            else:
                select.append(q)

        where, params = "", []
        term = (search_query or "").strip()
        if term:
            text_cols = [c for c in shown if c["type"] in TEXT_TYPES]
            parts = [f"`{c['name']}` LIKE %s" for c in text_cols]
            params = [f"%{term}%"] * len(text_cols)
            if term.isdigit():
                for c in shown:
                    if c["key"] == "PRI" and c["type"] not in TEXT_TYPES:
                        parts.append(f"`{c['name']}` = %s")
                        params.append(int(term))
            where = " WHERE " + (" OR ".join(parts) if parts else "1 = 0")

        cursor.execute(f"SELECT COUNT(*) FROM `{table}`{where}", tuple(params))
        total = int(cursor.fetchone()[0])
        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(max(1, int(page or 1)), total_pages)

        primary = [c["name"] for c in cols if c["key"] == "PRI"]
        order_col = primary[0] if primary else shown[0]["name"]
        cursor.execute(
            f"SELECT {', '.join(select)} FROM `{table}`{where} ORDER BY `{order_col}` DESC LIMIT %s OFFSET %s",
            tuple(params) + (per_page, (page - 1) * per_page)
        )
        rows = [[_display(v, c) for v, c in zip(row, shown)] for row in cursor.fetchall()]
        cursor.close()
        return {
            "table": table,
            "label": ALLOWED_TABLES[table][1],
            "columns": [c["name"] for c in shown],
            "hidden": [c["name"] for c in cols if c["hidden"]],
            "rows": rows,
            "total": total,
            "page": page,
            "total_pages": total_pages,
            "per_page": per_page,
        }, ""
    except Error as e:
        print(f"records: could not read {table}: {e}")
        return None, "Could not read this table."
    finally:
        if connection.is_connected():
            connection.close()
