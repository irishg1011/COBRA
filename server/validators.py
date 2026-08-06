"""
validators.py - Shared Sign Up / Account Validation Helpers
-------------------------------------------------------------
Single source of truth for the validation rules that originally lived
inline inside login.py's /signup route. Extracted here so any other
account-creation flow (e.g. admin_routes.py's Create Administrator
modal) can reuse the EXACT same rules instead of re-implementing them -
per the "reuse Learner Sign Up validation instead of duplicating it"
requirement.

Nothing in this file touches the database, Flask, or request objects -
every function is a pure, easily testable helper that takes a plain
value and returns either a normalized value, or an (is_valid, message)
tuple. This keeps it safely importable from BOTH login.py (the main
Flask app) and admin_routes.py (a blueprint imported BY login.py)
without any circular-import risk.
"""

import re
from datetime import datetime

# ------------------------------------------------------------
# Age policy (mirrors the constants login.py's /signup route already
# enforces)
# ------------------------------------------------------------
MIN_SIGNUP_AGE = 13
MAX_SIGNUP_AGE = 60

# ------------------------------------------------------------
# Password strength - 8+ chars, at least one uppercase, one lowercase,
# one digit, one special character. Identical pattern to the one
# previously hardcoded in login.py and mirrored client-side in
# script.js's `strongRegex`.
# ------------------------------------------------------------
PASSWORD_REGEX = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_,.?\":{}|<>]).{8,}$"
)

# ------------------------------------------------------------
# Email format - identical pattern to script.js's `emailRegex`.
# ------------------------------------------------------------
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

# ------------------------------------------------------------
# PH mobile number format: 09XXXXXXXXX (11 digits, starts with 09) -
# matches the placeholder already shown on the Create Administrator
# modal's Mobile Number field.
# ------------------------------------------------------------
MOBILE_REGEX = re.compile(r"^09\d{9}$")

# Allowed characters for name-type fields (letters, spaces, hyphens,
# apostrophes, periods) - covers First/Middle/Last Name and Suffix.
NAME_CHARS_REGEX = re.compile(r"^[A-Za-z\s'\-.]+$")


def capitalize_name(value):
    """
    Title-cases a name field exactly like script.js's live input
    formatter (`val.replace(/\\b\\w/g, c => c.toUpperCase())`), so a
    server-side save always matches what the user saw client-side, even
    if the client-side formatter was somehow bypassed.
    """
    if not value:
        return ""
    return re.sub(r"\b\w", lambda m: m.group(0).upper(), value.strip())


def validate_required(value, label):
    if not (value or "").strip():
        return False, f"{label} is required."
    return True, ""


def validate_name_field(value, label, required=True):
    """
    Validates a name-type field (First/Middle/Last Name, Suffix).
    `required=False` lets Middle Name / Suffix be left blank.
    """
    value = (value or "").strip()
    if not value:
        if required:
            return False, f"{label} is required."
        return True, ""
    if not NAME_CHARS_REGEX.match(value):
        return False, f"{label} may only contain letters, spaces, hyphens, and apostrophes."
    return True, ""


def validate_email_format(email):
    email = (email or "").strip()
    if not email:
        return False, "Email address is required."
    if not EMAIL_REGEX.match(email):
        return False, "Please enter a valid email address (e.g., name@example.com)."
    return True, ""


def validate_mobile_format(mobile):
    mobile = (mobile or "").strip()
    if not mobile:
        return False, "Mobile number is required."
    if not MOBILE_REGEX.match(mobile):
        return False, "Please enter a valid PH mobile number (e.g., 09XXXXXXXXX)."
    return True, ""


def calculate_age(birthdate_str):
    """
    Parses a birthdate string (YYYY-MM-DD, what HTML <input type="date">
    sends) and returns the current age in whole years, or None if
    missing/malformed. Identical logic to login.py's original
    calculate_age().
    """
    if not birthdate_str:
        return None
    try:
        birth_date = datetime.strptime(birthdate_str, "%Y-%m-%d").date()
    except ValueError:
        return None

    today = datetime.now().date()
    age = today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )
    return age


def validate_birthdate(birthdate_str):
    age = calculate_age(birthdate_str)
    if age is None:
        return False, "Please enter a valid birthdate."
    if age < MIN_SIGNUP_AGE:
        return False, f"Must be at least {MIN_SIGNUP_AGE} years old to create an account."
    if age > MAX_SIGNUP_AGE:
        return False, f"Must be {MAX_SIGNUP_AGE} years old or younger to create an account."
    return True, ""


def validate_password_strength(password):
    password = password or ""
    if not PASSWORD_REGEX.match(password):
        return False, (
            "Password must be at least 8 characters long and include an "
            "uppercase letter, lowercase letter, number, and special character."
        )
    return True, ""


def validate_password_confirmation(password, confirm_password):
    if password != confirm_password:
        return False, "Passwords do not match."
    return True, ""