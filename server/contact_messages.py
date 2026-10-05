"""
contact_messages.py - the landing page's "Send Us a Message" form
------------------------------------------------------------------------------
feat/contact-messages

A visitor fills the form; the message is EMAILED to the system's Gmail
inbox, sent the same way the OTP emails are (api.send_email), with the
visitor's name, email and message in the body and Reply-To set to the
visitor's address - so a plain "Reply" in Gmail answers them directly.

Nothing is saved any more (the admin Messages page was removed) and there
is no admin bell notification. contact_messages_tbl / contact_replies_tbl
and their old rows are left in the database untouched.

If the email can't be sent the visitor gets an error, never a false
"sent". The form's validation, the hidden bot trap and the per-visitor
rate limit are unchanged.

    submit_contact_message()  - the public form (contact_routes.py)

No Flask or session code here; contact_routes.py turns the (payload,
http_status) result into the HTTP response.
"""

import re
import time

from api import send_email, GMAIL_ADDRESS

# Where a message is emailed: the system's own Gmail inbox.
ADMIN_INBOX = GMAIL_ADDRESS

# Field limits - the form's maxlength attributes use the same numbers.
NAME_MAX = 100
EMAIL_MAX = 150
MESSAGE_MIN = 10
MESSAGE_MAX = 2000

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")   # same rule as validators.py

# The form is open to anyone, so one visitor (by IP) may send only a few
# messages in a short time. Kept in memory - it resets when the server restarts.
RATE_LIMIT_COUNT = 3
RATE_LIMIT_SECONDS = 10 * 60
_recent_submissions = {}

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
    it gets a normal-looking "sent" answer and nothing is emailed.
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

    delivered = send_email(
        ADMIN_INBOX,
        f"New message from {clean['name']} - CobraByte",
        "A visitor sent a message from the CobraByte landing page.\n\n"
        f"Name:  {clean['name']}\n"
        f"Email: {clean['email']}\n\n"
        "Message:\n"
        f"{clean['message']}\n\n"
        "----\n"
        "Reply to this email to answer the visitor directly.",
        reply_to=clean["email"],
    )
    if not delivered:
        print("contact_messages: a landing page message could not be emailed.")
        return {"success": False,
                "message": "We could not send your message right now. Please try again later."}, 503

    # Only a message that really went out counts toward the rate limit.
    if client_key:
        _note_submission(client_key)

    return {"success": True, "message": "Thank you! Your message has been sent. We will get back to you by email."}, 201
