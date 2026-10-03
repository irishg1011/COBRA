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
# enforces) - Learner Sign Up.
# ------------------------------------------------------------
MIN_SIGNUP_AGE = 13
MAX_SIGNUP_AGE = 60

# ------------------------------------------------------------
# NEW: Age policy for Admin account creation (Admin > Create
# Administrator modal). Administrators must be older than the Learner
# minimum - 20 years old at minimum, still capped at 60 like Learner
# sign-up. Kept as its own pair of constants (rather than overwriting
# MIN_SIGNUP_AGE/MAX_SIGNUP_AGE above) so Learner sign-up's 13-60 rule
# is completely unaffected.
# ------------------------------------------------------------
ADMIN_MIN_SIGNUP_AGE = 20
ADMIN_MAX_SIGNUP_AGE = 60

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

# ------------------------------------------------------------
# Title / name length limits (feat/title-char-limit).
# Single source of truth for every admin-typed title. The same numbers
# reach the HTML inputs' `maxlength` through admin_routes.py's context
# processor (`title_limits`), and the live counters in JS read that
# `maxlength` attribute - so changing a number here changes it
# everywhere (input, counter, and backend check).
# Kept well under the DB column sizes (255 / 100) so long titles can't
# stretch the admin tables.
# ------------------------------------------------------------
# feat/activity-auto-title: activity titles are generated as
# "<Lesson name> – <Activity type>". The longest suffix is
# " – Fill in the Blanks" (21 chars), so the activity limit is the lesson
# limit + 21 - a full-length lesson name always fits, never truncated.
ACTIVITY_TITLE_LONGEST_SUFFIX = " \u2013 Fill in the Blanks"

TITLE_LIMITS = {
    "category": 50,   # Chapter name   -> category_tbl.category_name
    "module": 60,     # Module name    -> modules_tbl.module_name
    "resource": 60,   # Lesson title   -> learning_resources_tbl.resource_title
    "video": 100,     # Video title    -> video_tutorials_tbl.video_title (varchar 255)
    "activity": 60 + len(ACTIVITY_TITLE_LONGEST_SUFFIX),  # 81 -> learning_activities_tbl.activity_title (varchar 255)
    "exercise": 60,   # Exercise title -> coding_exercises_tbl.exercise_title
}

# Allowed characters for name-type fields (letters, spaces, hyphens,
# apostrophes, periods) - covers First/Middle/Last Name and Suffix.
NAME_CHARS_REGEX = re.compile(r"^[A-Za-z\s'\-.]+$")


def capitalize_name(value):
    """
    Standardizes a name field so ONLY the first letter of each word is
    uppercase and every other letter is forced to lowercase, e.g.:

        "gOLD"        -> "Gold"
        "DE LA CRUZ"  -> "De La Cruz"
        "o'brien"     -> "O'brien"

    This matches script.js's live input formatter on the client side
    (admin-create-admin.js / script.js), so a server-side save always
    matches what the user saw while typing, even if the client-side
    formatter was somehow bypassed. Previous behavior only ever
    UPPERCASED the first letter of each word without touching the rest
    of the word - that let stray uppercase letters slip through (e.g.
    "gOLD" stayed "gOLD" instead of becoming "Gold").
    """
    if not value:
        return ""
    return re.sub(
        r"\b\w+",
        lambda m: m.group(0)[:1].upper() + m.group(0)[1:].lower(),
        value.strip(),
    )


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


def validate_title_length(value, limit_key, label):
    """
    Checks a title/name against its TITLE_LIMITS entry.
    Returns (is_valid, message) like the other helpers here. Only checks
    LENGTH - "is it required?" stays with each route's existing check, so
    a blank Save Draft still behaves exactly as before.
    """
    limit = TITLE_LIMITS[limit_key]
    length = len((value or "").strip())
    if length > limit:
        return False, f"{label} must be {limit} characters or less (currently {length})."
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


def validate_birthdate(birthdate_str, min_age=MIN_SIGNUP_AGE, max_age=MAX_SIGNUP_AGE):
    """
    Validates a birthdate string against a min/max age range.

    Defaults to the Learner Sign Up range (MIN_SIGNUP_AGE=13,
    MAX_SIGNUP_AGE=60) so every existing call site (login.py's /signup
    route) keeps behaving exactly as before with no changes needed.

    Admin account creation (admin_routes.py's create_administrator())
    passes min_age=ADMIN_MIN_SIGNUP_AGE (20), max_age=ADMIN_MAX_SIGNUP_AGE
    (60) explicitly, so this ONE function backs both age policies -
    there is still only a single place the "is this birthdate old
    enough / not too old" comparison lives.
    """
    age = calculate_age(birthdate_str)
    if age is None:
        return False, "Please enter a valid birthdate."
    if age < min_age:
        return False, f"Must be at least {min_age} years old to create an account."
    if age > max_age:
        return False, f"Must be {max_age} years old or younger to create an account."
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
