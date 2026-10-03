"""
contact_messages.py - "Send Us a Message" (landing page) + Admin > Messages
------------------------------------------------------------------------------
feat/contact-messages

A visitor fills the landing page's "Send Us a Message" form. The message:
  1. is SAVED in contact_messages_tbl, so nothing is ever lost, and
  2. is EMAILED to the system's Gmail inbox - sent the same way the OTP
     emails are (api.send_email), with the visitor's address as Reply-To.
Admins read every message on Admin > Messages and can reply from that
page; the reply is emailed to the visitor (again through api.send_email)
and saved in contact_replies_tbl.

    submit_contact_message()  - the public form (contact_routes.py)
    get_messages_data()       - stat cards + one page of the table
    get_message()             - one message with its replies (marks it read)
    send_reply()              - emails the reply, then saves it

Status of a message: unread -> read (opened by an admin) -> replied.

Same convention as sandbox_monitor.py / achievements.py: no Flask or
session code here; the routes turn these into HTTP responses. Every
function that changes something returns (payload, http_status).

Tables (created lazily; same DDL as sql/contact_messages.sql):
    contact_messages_tbl  - one row per message
    contact_replies_tbl   - one row per reply an admin sent
"""

import re
import time
from datetime import datetime
from mysql.connector import Error

from cobradb import get_db_connection
from api import send_email, GMAIL_ADDRESS

MESSAGES_TABLE = "contact_messages_tbl"
REPLIES_TABLE = "contact_replies_tbl"
PH_NOW_SQL = "(UTC_TIMESTAMP() + INTERVAL 8 HOUR)"   # Philippine time, same clock as notifications.py
DEFAULT_PER_PAGE = 8

# Where a new message is emailed: the system's own Gmail inbox.
ADMIN_INBOX = GMAIL_ADDRESS

# Field limits - the form's maxlength attributes use the same numbers.
NAME_MAX = 100
EMAIL_MAX = 150
MESSAGE_MIN = 10
MESSAGE_MAX = 2000
REPLY_MAX = 4000

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")   # same rule as validators.py

# The form is open to anyone, so one visitor (by IP) may send only a few
# messages in a short time. Kept in memory - it resets when the server restarts.
RATE_LIMIT_COUNT = 3
RATE_LIMIT_SECONDS = 10 * 60
_recent_submissions = {}

STATUS_LABELS = {"unread": "Unread", "read": "Read", "replied": "Replied"}

_schema_ready = False   # the table check runs once per server start


def ensure_contact_schema(cursor):
    global _schema_ready
    if _schema_ready:
        return
    cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {MESSAGES_TABLE} (
                message_id INT(10) NOT NULL AUTO_INCREMENT,
                sender_name VARCHAR(100) NOT NULL,
                sender_email VARCHAR(150) NOT NULL,
                message TEXT NOT NULL,
                status VARCHAR(10) NOT NULL DEFAULT 'unread',
                received_at DATETIME NOT NULL,
                read_at DATETIME NULL,
                PRIMARY KEY (message_id),
                KEY idx_contact_status (status),
                KEY idx_contact_received (received_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
    )
    cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {REPLIES_TABLE} (
                reply_id INT(10) NOT NULL AUTO_INCREMENT,
                message_id INT(10) NOT NULL,
                replied_by VARCHAR(15) NULL,
                reply_text TEXT NOT NULL,
                sent_at DATETIME NOT NULL,
                PRIMARY KEY (reply_id),
                KEY idx_reply_message (message_id),
                CONSTRAINT fk_reply_message FOREIGN KEY (message_id)
                    REFERENCES {MESSAGES_TABLE} (message_id) ON DELETE CASCADE,
                CONSTRAINT fk_reply_account FOREIGN KEY (replied_by)
                    REFERENCES account_tbl (acc_id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
    )
    _schema_ready = True


# ------------------------------------------------------------------
# Small helpers
# ------------------------------------------------------------------
def _clean_line(value):
    """One line of text: trimmed, inner whitespace collapsed (no line breaks -
    this text goes into an email header)."""
    return " ".join(str(value or "").split())


def _clean_text(value):
    """Multi-line text: trimmed, line endings normalized."""
    return str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()


def _fmt_datetime(dt):
    """e.g. 'Oct 3, 2026 10:22 PM'. NULL -> '—'."""
    if not dt:
        return "—"
    hour = dt.strftime("%I").lstrip("0") or "12"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year} {hour}:{dt.strftime('%M %p')}"


def _clean_date(value):
    """Only a real 'YYYY-MM-DD' date is used; anything else is ignored."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def _preview(text, length=90):
    """First line-ish of a message for the table."""
    flat = " ".join((text or "").split())
    return flat if len(flat) <= length else flat[:length - 1].rstrip() + "…"


def _too_many(client_key):
    """True when this visitor already sent RATE_LIMIT_COUNT messages recently."""
    now = time.time()
    recent = [t for t in _recent_submissions.get(client_key, []) if now - t < RATE_LIMIT_SECONDS]
    _recent_submissions[client_key] = recent
    if len(_recent_submissions) > 5000:   # never let the map grow without limit
        for key in [k for k, v in _recent_submissions.items() if not v or now - v[-1] >= RATE_LIMIT_SECONDS]:
            _recent_submissions.pop(key, None)
    return len(recent) >= RATE_LIMIT_COUNT


def _note_submission(client_key):
    _recent_submissions.setdefault(client_key, []).append(time.time())


# ------------------------------------------------------------------
# Public form
# ------------------------------------------------------------------
def validate_contact_form(name, email, message):
    """Returns (clean, errors). errors maps a field (name, email, message) to its message."""
    errors = {}
    name = _clean_line(name)
    email = _clean_line(email)
    message = _clean_text(message)

    if not name:
        errors["name"] = "Please enter your name."
    elif len(name) > NAME_MAX:
        errors["name"] = f"Your name must be {NAME_MAX} characters or fewer."

    if not email:
        errors["email"] = "Please enter your email address."
    elif len(email) > EMAIL_MAX or not EMAIL_REGEX.match(email):
        errors["email"] = "Please enter a valid email address."

    if not message:
        errors["message"] = "Please write your message."
    elif len(message) < MESSAGE_MIN:
        errors["message"] = f"Your message is too short. Please write at least {MESSAGE_MIN} characters."
    elif len(message) > MESSAGE_MAX:
        errors["message"] = f"Your message must be {MESSAGE_MAX} characters or fewer."

    return {"name": name, "email": email, "message": message}, errors


def submit_contact_message(name, email, message, client_key=None, trap=None):
    """
    The landing page form. `client_key` is the visitor's IP (rate limit);
    `trap` is the hidden field real visitors never see - a bot that fills
    it gets a normal-looking "sent" answer and nothing is saved.
    Returns (payload, http_status).
    """
    if _clean_line(trap):
        return {"success": True, "message": "Thank you! Your message has been sent."}, 200

    clean, errors = validate_contact_form(name, email, message)
    if errors:
        return {"success": False, "message": "Please check the highlighted fields.", "errors": errors}, 400

    if client_key and _too_many(client_key):
        return {"success": False,
                "message": "You have sent several messages in a short time. Please try again in a few minutes."}, 429

    connection = get_db_connection()
    if connection is None:
        return {"success": False, "message": "We could not send your message right now. Please try again later."}, 500
    try:
        cursor = connection.cursor(dictionary=True)
        ensure_contact_schema(cursor)
        cursor.execute(
            f"""INSERT INTO {MESSAGES_TABLE} (sender_name, sender_email, message, status, received_at)
                VALUES (%s, %s, %s, 'unread', {PH_NOW_SQL})""",
            (clean["name"], clean["email"], clean["message"])
        )
        message_id = cursor.lastrowid
        connection.commit()
        cursor.close()
    except Error as e:
        print(f"contact_messages: failed to save a message: {e}")
        return {"success": False, "message": "We could not send your message right now. Please try again later."}, 500
    finally:
        if connection.is_connected():
            connection.close()

    if client_key:
        _note_submission(client_key)

    # Delivered to the admin inbox the same way an OTP is sent. The message
    # is already saved, so a mail problem never loses it - it is only logged.
    delivered = send_email(
        ADMIN_INBOX,
        f"New message from {clean['name']} - CobraByte",
        "A visitor sent a message from the CobraByte landing page.\n\n"
        f"Name:  {clean['name']}\n"
        f"Email: {clean['email']}\n\n"
        "Message:\n"
        f"{clean['message']}\n\n"
        "----\n"
        "Reply to this email to answer the visitor directly, or open\n"
        "Admin > Messages in CobraByte to reply from there.\n"
        f"(Message #{message_id})",
        reply_to=clean["email"],
    )
    if not delivered:
        print(f"contact_messages: message #{message_id} was saved but the inbox email could not be sent.")

    return {"success": True, "message": "Thank you! Your message has been sent. We will get back to you by email."}, 201


# ------------------------------------------------------------------
# Admin > Messages: stat cards + table
# ------------------------------------------------------------------
def _empty_metrics():
    return {"total": 0, "unread": 0, "replied": 0, "today": 0}


def empty_messages_data():
    """Used when the DB is unreachable so the page still answers."""
    return {"rows": [], "metrics": _empty_metrics(),
            "total": 0, "page": 1, "per_page": DEFAULT_PER_PAGE, "total_pages": 1}


def get_messages_data(search_query=None, status_filter=None, date_from=None, date_to=None,
                      page=1, per_page=DEFAULT_PER_PAGE):
    """
    Returns {"rows", "metrics", "total", "page", "per_page", "total_pages"},
    or None if the database is unreachable.
    The stat cards follow search + dates only, never the status filter.
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        ensure_contact_schema(cursor)

        clauses, params = [], []
        term = (search_query or "").strip().lower()
        if term:
            clauses.append("(LOWER(sender_name) LIKE %s OR LOWER(sender_email) LIKE %s OR LOWER(message) LIKE %s)")
            params.extend([f"%{term}%"] * 3)
        date_from, date_to = _clean_date(date_from), _clean_date(date_to)
        if date_from:
            clauses.append("DATE(received_at) >= %s")
            params.append(date_from)
        if date_to:
            clauses.append("DATE(received_at) <= %s")
            params.append(date_to)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        cursor.execute(
            f"""SELECT COUNT(*) AS total,
                       COALESCE(SUM(status = 'unread'), 0) AS unread,
                       COALESCE(SUM(status = 'replied'), 0) AS replied,
                       COALESCE(SUM(DATE(received_at) = DATE({PH_NOW_SQL})), 0) AS today
                FROM {MESSAGES_TABLE} {where}""",
            tuple(params)
        )
        row = cursor.fetchone() or {}
        metrics = {key: int(row.get(key) or 0) for key in ("total", "unread", "replied", "today")}

        table_clauses, table_params = list(clauses), list(params)
        status = (status_filter or "").strip().lower()
        if status in STATUS_LABELS:
            table_clauses.append("status = %s")
            table_params.append(status)
        table_where = ("WHERE " + " AND ".join(table_clauses)) if table_clauses else ""

        cursor.execute(f"SELECT COUNT(*) AS total FROM {MESSAGES_TABLE} {table_where}", tuple(table_params))
        total = cursor.fetchone()["total"]
        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(max(1, page or 1), total_pages)

        cursor.execute(
            f"""SELECT message_id, sender_name, sender_email, message, status, received_at
                FROM {MESSAGES_TABLE} {table_where}
                ORDER BY received_at DESC, message_id DESC
                LIMIT %s OFFSET %s""",
            tuple(table_params + [per_page, (page - 1) * per_page])
        )
        rows = [{
            "message_id": r["message_id"],
            "name": r["sender_name"],
            "email": r["sender_email"],
            "preview": _preview(r["message"]),
            "status": r["status"] if r["status"] in STATUS_LABELS else "unread",
            "status_label": STATUS_LABELS.get(r["status"], "Unread"),
            "received_at": _fmt_datetime(r["received_at"]),
        } for r in cursor.fetchall()]
        cursor.close()

        return {"rows": rows, "metrics": metrics, "total": total,
                "page": page, "per_page": per_page, "total_pages": total_pages}
    except Error as e:
        print(f"contact_messages: failed to load messages: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Admin > Messages: one message
# ------------------------------------------------------------------
def _message_payload(cursor, message_id):
    cursor.execute(
        f"""SELECT message_id, sender_name, sender_email, message, status, received_at
            FROM {MESSAGES_TABLE} WHERE message_id = %s""",
        (message_id,)
    )
    row = cursor.fetchone()
    if not row:
        return None
    cursor.execute(
        f"""SELECT r.reply_text, r.sent_at, r.replied_by, p.firstname, p.lastname
            FROM {REPLIES_TABLE} r
            LEFT JOIN profile_tbl p ON p.acc_id = r.replied_by
            WHERE r.message_id = %s
            ORDER BY r.sent_at ASC, r.reply_id ASC""",
        (message_id,)
    )
    replies = [{
        "text": r["reply_text"],
        "sent_at": _fmt_datetime(r["sent_at"]),
        "by": f"{r.get('firstname') or ''} {r.get('lastname') or ''}".strip() or (r["replied_by"] or "Admin"),
    } for r in cursor.fetchall()]
    return {
        "message_id": row["message_id"],
        "name": row["sender_name"],
        "email": row["sender_email"],
        "message": row["message"],
        "status": row["status"] if row["status"] in STATUS_LABELS else "unread",
        "status_label": STATUS_LABELS.get(row["status"], "Unread"),
        "received_at": _fmt_datetime(row["received_at"]),
        "replies": replies,
        "reply_max": REPLY_MAX,
    }


def get_message(message_id):
    """Opens one message for an admin: unread -> read. Returns (payload, http_status)."""
    connection = get_db_connection()
    if connection is None:
        return {"success": False, "message": "Could not connect to the database."}, 500
    try:
        cursor = connection.cursor(dictionary=True)
        ensure_contact_schema(cursor)
        cursor.execute(
            f"""UPDATE {MESSAGES_TABLE} SET status = 'read', read_at = {PH_NOW_SQL}
                WHERE message_id = %s AND status = 'unread'""",
            (message_id,)
        )
        connection.commit()
        record = _message_payload(cursor, message_id)
        cursor.close()
        if record is None:
            return {"success": False, "message": "Message not found."}, 404
        return {"success": True, "record": record}, 200
    except Error as e:
        print(f"contact_messages: failed to open message {message_id}: {e}")
        return {"success": False, "message": "Could not load this message."}, 500
    finally:
        if connection.is_connected():
            connection.close()


def send_reply(message_id, reply_text, replied_by):
    """
    Emails `reply_text` to the visitor who wrote the message, THEN saves it
    and marks the message replied. If the email cannot be sent, nothing is
    saved and the admin is told. Returns (payload, http_status).
    """
    reply_text = _clean_text(reply_text)
    if not reply_text:
        return {"success": False, "message": "Write your reply first."}, 400
    if len(reply_text) > REPLY_MAX:
        return {"success": False, "message": f"Your reply must be {REPLY_MAX} characters or fewer."}, 400

    connection = get_db_connection()
    if connection is None:
        return {"success": False, "message": "Could not connect to the database."}, 500
    try:
        cursor = connection.cursor(dictionary=True)
        ensure_contact_schema(cursor)
        cursor.execute(
            f"SELECT sender_name, sender_email, message, received_at FROM {MESSAGES_TABLE} WHERE message_id = %s",
            (message_id,)
        )
        original = cursor.fetchone()
        if not original:
            cursor.close()
            return {"success": False, "message": "Message not found."}, 404

        quoted = "\n".join("> " + line for line in original["message"].split("\n"))
        sent = send_email(
            original["sender_email"],
            "Re: Your message to CobraByte",
            f"Hi {original['sender_name']},\n\n"
            f"{reply_text}\n\n"
            "- The CobraByte Team\n\n"
            f"On {_fmt_datetime(original['received_at'])}, you wrote:\n"
            f"{quoted}\n",
        )
        if not sent:
            cursor.close()
            return {"success": False,
                    "message": "The reply could not be emailed. Nothing was saved - please try again."}, 502

        cursor.execute(
            f"""INSERT INTO {REPLIES_TABLE} (message_id, replied_by, reply_text, sent_at)
                VALUES (%s, %s, %s, {PH_NOW_SQL})""",
            (message_id, replied_by, reply_text)
        )
        cursor.execute(
            f"""UPDATE {MESSAGES_TABLE}
                SET status = 'replied', read_at = COALESCE(read_at, {PH_NOW_SQL})
                WHERE message_id = %s""",
            (message_id,)
        )
        connection.commit()
        record = _message_payload(cursor, message_id)
        cursor.close()
        return {"success": True, "message": f"Reply sent to {original['sender_email']}.", "record": record}, 200
    except Error as e:
        print(f"contact_messages: failed to save the reply to message {message_id}: {e}")
        try:
            connection.rollback()
        except Error:
            pass
        return {"success": False,
                "message": "The reply was emailed, but it could not be saved here. Please refresh the page."}, 500
    finally:
        if connection.is_connected():
            connection.close()