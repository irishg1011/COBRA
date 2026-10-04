"""
consent.py - Terms and Conditions + Privacy Notice consent (feat/terms-consent)
--------------------------------------------------------------------------------
Learners must accept the CURRENT version of both documents before they
use CobraByte. Staff accounts are not asked yet.

    consent_tbl  (created on first use, like active_sessions_tbl)
    -----------
    consent_id         INT AUTO_INCREMENT PRIMARY KEY
    acc_id             VARCHAR(15) NOT NULL
    terms_version      VARCHAR(10) NOT NULL
    privacy_version    VARCHAR(10) NOT NULL
    guardian_declared  TINYINT(1)  NOT NULL DEFAULT 0   (under 18: "my parent or guardian agrees" box)
    accepted_at        TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP

One row per acceptance. A learner "has consent" when a row exists for
their acc_id with BOTH current versions. Change TERMS_VERSION or
PRIVACY_VERSION below (and the version line in templates/terms.html /
privacy.html / consent.html) and every learner is asked again.

WHERE IT IS ENFORCED
    - Sign-up (login.py /signup): check_signup_consent() refuses the
      request without the box(es); record_consent() saves the row in the
      same transaction as the new account.
    - Login (login.py /login): has_current_consent() is False -> the
      learner is redirected to /consent instead of /dashboard.
    - Every learner data request (/api/...): the before_app_request hook
      below answers 403 {"needs_consent": true} until they accept.
    - Learner pages: auth-guard.js asks /api/consent/status and sends
      the learner to /consent.

Registered in login.py:  app.register_blueprint(consent_bp)
"""

from datetime import date, datetime

from flask import Blueprint, jsonify, render_template, request, session
from mysql.connector import Error

from cobradb import get_db_connection
from user_types import LEARNER_ROLE

consent_bp = Blueprint("consent_bp", __name__)

# ------------------------------------------------------------
# CONFIG
# ------------------------------------------------------------
TERMS_VERSION = "1.0"
PRIVACY_VERSION = "1.0"
ADULT_AGE = 18                      # younger than this also needs the parent/guardian box

CONSENT_TABLE = "consent_tbl"
CONSENT_PAGE_URL = "/consent"
LEARNER_HOME_URL = "/dashboard"

AGREE_MESSAGE = "Please agree to the Terms and Conditions and the Privacy Notice."
GUARDIAN_MESSAGE = "Please confirm that your parent or guardian agrees."
NEEDS_CONSENT_MESSAGE = "Please read and accept the Terms and Conditions and the Privacy Notice to continue."

# Remembered in the signed Flask session after one successful check, so
# the hook below does not query the database on every request.
SESSION_FLAG = "consent_ok"

_table_ensured = False


def _current_versions_key():
    return f"{TERMS_VERSION}|{PRIVACY_VERSION}"


# ============================================================
# TABLE
# ============================================================
def ensure_consent_table():
    """
    Creates consent_tbl if it does not exist yet. Uses its OWN connection:
    CREATE TABLE ends any open transaction, so it must never run inside
    the sign-up transaction (that would release generate_acc_id()'s lock).
    Returns True when the table is ready.
    """
    global _table_ensured
    if _table_ensured:
        return True

    connection = get_db_connection()
    if connection is None:
        return False
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {CONSENT_TABLE} (
                consent_id INT AUTO_INCREMENT PRIMARY KEY,
                acc_id VARCHAR(15) NOT NULL,
                terms_version VARCHAR(10) NOT NULL,
                privacy_version VARCHAR(10) NOT NULL,
                guardian_declared TINYINT(1) NOT NULL DEFAULT 0,
                accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_consent_acc (acc_id)
            )
            """
        )
        connection.commit()
        cursor.close()
        _table_ensured = True
        return True
    except Error as e:
        print(f"consent: failed to ensure table exists: {e}")
        return False
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# AGE HELPERS
# ============================================================
def age_from_birthdate(birthdate):
    """birthdate: a date, a datetime or a 'YYYY-MM-DD' string. Returns the age in years, or None."""
    if not birthdate:
        return None
    if isinstance(birthdate, datetime):
        birthdate = birthdate.date()
    if isinstance(birthdate, str):
        try:
            birthdate = datetime.strptime(birthdate.strip(), "%Y-%m-%d").date()
        except ValueError:
            return None
    if not isinstance(birthdate, date):
        return None
    today = date.today()
    return today.year - birthdate.year - ((today.month, today.day) < (birthdate.month, birthdate.day))


def is_minor_age(age):
    return age is not None and age < ADULT_AGE


# ============================================================
# SIGN-UP (called from login.py /signup)
# ============================================================
def check_signup_consent(data, age):
    """
    Returns an error message when the sign-up request may not go ahead,
    else None. Call it BEFORE opening the sign-up transaction: it also
    makes sure consent_tbl exists.
    """
    if data.get("agreeTerms") is not True:
        return AGREE_MESSAGE
    if is_minor_age(age) and data.get("guardianAgrees") is not True:
        return GUARDIAN_MESSAGE
    if not ensure_consent_table():
        return "Could not connect to database."
    return None


def guardian_flag(data, age):
    """True when an under-18 learner ticked the parent/guardian box."""
    return bool(is_minor_age(age) and data.get("guardianAgrees") is True)


def record_consent(cursor, acc_id, guardian_declared=False):
    """Saves one acceptance of the current versions, using the CALLER's cursor (same transaction)."""
    cursor.execute(
        f"""INSERT INTO {CONSENT_TABLE} (acc_id, terms_version, privacy_version, guardian_declared)
            VALUES (%s, %s, %s, %s)""",
        (acc_id, TERMS_VERSION, PRIVACY_VERSION, 1 if guardian_declared else 0)
    )


# ============================================================
# LOOKUPS
# ============================================================
def has_current_consent(acc_id):
    """
    True  = this account accepted the current versions.
    False = it has not.
    None  = could not check (database problem) - callers do not block on None.
    """
    if not acc_id:
        return False
    if not ensure_consent_table():
        return None

    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""SELECT 1 FROM {CONSENT_TABLE}
                WHERE acc_id = %s AND terms_version = %s AND privacy_version = %s
                LIMIT 1""",
            (acc_id, TERMS_VERSION, PRIVACY_VERSION)
        )
        found = cursor.fetchone() is not None
        cursor.close()
        return found
    except Error as e:
        print(f"consent: failed to check consent: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def _current_learner():
    """
    The signed-in LEARNER behind this request, from the session token:
    {"acc_id", "birthdate"} - or None when nobody is signed in, the
    session expired, or the account is staff.
    """
    token = session.get("session_token")
    if not token:
        return None

    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """SELECT s.acc_id, ut.u_type AS role, p.birthdate
               FROM active_sessions_tbl s
               JOIN account_tbl a ON a.acc_id = s.acc_id
               LEFT JOIN usertype_tbl ut ON a.u_type = ut.ut_id
               LEFT JOIN profile_tbl p ON p.acc_id = a.acc_id
               WHERE s.session_token = %s""",
            (token,)
        )
        row = cursor.fetchone()
        cursor.close()
        if not row or row.get("role") != LEARNER_ROLE:
            return None
        return {"acc_id": row["acc_id"], "birthdate": row.get("birthdate")}
    except Error as e:
        print(f"consent: failed to look up the current learner: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# PAGES
# ============================================================
def _back_link():
    """Where "Back" on Terms / Privacy goes: a signed-in person returns to
    their own dashboard (not the public landing page, which looks like
    being logged out); a visitor goes back to the landing page."""
    if session.get("admin_id"):
        return "/admin/dashboard", "Back to dashboard"
    if _current_learner():
        return LEARNER_HOME_URL, "Back to dashboard"
    return "/", "Back to home"


@consent_bp.route("/terms")
def terms_page():
    back_url, back_label = _back_link()
    return render_template("terms.html", back_url=back_url, back_label=back_label)


@consent_bp.route("/privacy")
def privacy_page():
    back_url, back_label = _back_link()
    return render_template("privacy.html", back_url=back_url, back_label=back_label)


@consent_bp.route(CONSENT_PAGE_URL)
def consent_page():
    return render_template("consent.html")


# ============================================================
# API
# ============================================================
@consent_bp.route("/api/consent/status", methods=["GET"])
def consent_status():
    learner = _current_learner()
    if not learner:
        # Not signed in, or a staff account: nothing to accept here.
        return jsonify({"success": False, "needs_consent": False, "message": "Not logged in."}), 401

    accepted = has_current_consent(learner["acc_id"])
    if accepted:
        session[SESSION_FLAG] = _current_versions_key()
    return jsonify({
        "success": True,
        "needs_consent": accepted is False,
        "is_minor": is_minor_age(age_from_birthdate(learner["birthdate"])),
        "terms_version": TERMS_VERSION,
        "privacy_version": PRIVACY_VERSION,
    }), 200


@consent_bp.route("/api/consent/accept", methods=["POST"])
def consent_accept():
    learner = _current_learner()
    if not learner:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    if data.get("agree") is not True:
        return jsonify({"success": False, "message": AGREE_MESSAGE}), 400

    minor = is_minor_age(age_from_birthdate(learner["birthdate"]))
    if minor and data.get("guardian") is not True:
        return jsonify({"success": False, "message": GUARDIAN_MESSAGE}), 400

    if not ensure_consent_table():
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500
    try:
        cursor = connection.cursor()
        record_consent(cursor, learner["acc_id"], guardian_declared=minor)
        connection.commit()
        cursor.close()
    except Error as e:
        connection.rollback()
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()

    session[SESSION_FLAG] = _current_versions_key()
    return jsonify({"success": True, "redirect": LEARNER_HOME_URL}), 200


# ============================================================
# GUARD: learner data requests need consent
# ============================================================
@consent_bp.before_app_request
def require_consent_for_learner_api():
    """
    Runs before every request in the app, but only acts on learner data
    requests (/api/...). Staff routes live under /admin and are skipped,
    and a staff session that calls a learner /api route is skipped too.
    """
    path = request.path or ""
    if not path.startswith("/api/") or path.startswith("/api/consent/"):
        return None
    if session.get(SESSION_FLAG) == _current_versions_key():
        return None

    learner = _current_learner()
    if not learner:
        return None  # not signed in: the route itself answers 401

    accepted = has_current_consent(learner["acc_id"])
    if accepted is False:
        return jsonify({"success": False, "needs_consent": True, "message": NEEDS_CONSENT_MESSAGE}), 403
    if accepted:
        session[SESSION_FLAG] = _current_versions_key()
    return None