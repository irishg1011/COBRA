"""
login.py - CobraByte Backend Server (Merged)
------------------------------------
Single Flask app serving:
  - The landing page at "/"
  - The login/signup page at "/login"
  - All auth/API routes (signup, login, OTP, password reset, etc.)
  - The admin blueprint
  - The learner blueprint (Dashboard, Sandbox, learner/ folder assets)
  - Shared static/assets folders

Merged from what were previously two separate Flask apps (app.py +
login.py) so everything runs on one port with no CORS/cross-origin
juggling needed for same-origin fetch() calls.
"""

import os
from flask import Flask, jsonify, request, send_from_directory, render_template, session
from api import generate_otp, send_email
import mysql.connector
from mysql.connector import Error
from werkzeug.security import check_password_hash, generate_password_hash
from datetime import datetime
import time
import re
from login_logs import log_login_attempt  # NEW: reusable login attempt logger
from admin_routes import admin_bp  # NEW: import admin blueprint
from learner_routes import learner_bp  # NEW: import learner blueprint|
from learner_fib_routes import learner_fib_bp  # Fill in the Blanks battle API (own blueprint)
from learner_flashcard_routes import learner_flashcard_bp  # Flashcards card-duel API (own blueprint)
from learner_profile import learner_profile_bp  # Profile dropdown: View/Edit Profile, Change Password, badges
from notifications import learner_notifications_bp, notify  # header bell notifications
from session_tracker import end_session  # NEW: live "Active Sessions" tracking (Admin + Learner)
from auth_core import (  # feat/admin-login-page: ONE copy of the sign-in / reset rules, shared with /admin/login
    authenticate, send_reset_code, verify_reset_code, reset_password, otp_storage,
    send_username_code, verify_username_code,  # feat/forgot-username
)
from validators import PASSWORD_REGEX, calculate_age, MIN_SIGNUP_AGE, MAX_SIGNUP_AGE  # NEW: shared validation rules (also reused by admin_routes.py's Create Administrator flow)
from id_generator import generate_prefixed_acc_id  # NEW: shared account-ID generator (also reused by admin_routes.py)

# Define paths relative to this file's folder (matches the old app.py's setup)
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
TEMPLATES_DIR = os.path.abspath(os.path.join(BASE_DIR, '../templates'))
STATIC_DIR = os.path.abspath(os.path.join(BASE_DIR, '../static'))

app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR)

# ------------------------------------------------------------
# SESSION CONFIG (Task #12: server-side admin session)
# ------------------------------------------------------------
# Required for Flask to sign the session cookie. Move this to an
# environment variable before deploying anywhere real - a hardcoded
# secret is fine for local dev only.
app.secret_key = os.environ.get("COBRABYTE_SECRET_KEY", "dev-only-change-me")

# feat/admin-login-page: CORS removed. Everything (pages + API) is served
# by this one Flask app on :5000, so every fetch() is same-origin and the
# session cookie is always sent. Nothing uses Live Server (:5500) anymore.

# Register the admin blueprint (only once, now that app.py's duplicate
# registration no longer exists)
app.register_blueprint(admin_bp, url_prefix='/admin')

# NEW: Learner-side pages (Dashboard, Sandbox) and learner/ folder assets -
# kept in their own blueprint (learner_routes.py) the same way admin
# routes are kept separate in admin_routes.py.
app.register_blueprint(learner_bp)

app.register_blueprint(learner_fib_bp)
app.register_blueprint(learner_flashcard_bp)
app.register_blueprint(learner_profile_bp)
app.register_blueprint(learner_notifications_bp)

# feat/terms-consent: Terms + Privacy Notice consent for learners (consent.py)
from consent import (
    consent_bp, check_signup_consent, guardian_flag, record_consent,
    has_current_consent, CONSENT_PAGE_URL,
)
app.register_blueprint(consent_bp)

# feat/contact-messages: the landing page's "Send Us a Message" form (public)
from contact_routes import contact_bp
app.register_blueprint(contact_bp)
# ============================================================
# DATABASE CONFIG
# ============================================================
from cobradb import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME  # single source of DB settings

ACCOUNT_TABLE = "account_tbl"
# ARCHIVED_ACCOUNT_MESSAGE moved to auth_core.py with the rest of the login rules.
PROFILE_TABLE = "profile_tbl"
GENDER_TABLE = "gender_tbl"
DEFAULT_U_TYPE = 2  # 2 = Learner
# MIN_SIGNUP_AGE / MAX_SIGNUP_AGE now live in validators.py (imported
# above) so this file and admin_routes.py can never drift out of sync.

# Role constants (1 = Admin, 2 = Learner) live in auth_core.py.

# ------------------------------------------------------------
# ACCOUNT INACTIVITY CONFIG
# ------------------------------------------------------------
# The inactivity threshold itself (and the sweep logic that applies it)
# now lives in account_status.py, controlled by the ACCOUNT_INACTIVITY_MINUTES
# environment variable (defaults to 1 minute if unset - matches the "for
# testing: 1 minute" requirement; set it to 43200 for a 30-day policy in
# production). Nothing in this file hardcodes the threshold anymore.

# ------------------------------------------------------------
# LEARNER ID GENERATION CONFIG
# ------------------------------------------------------------
# Only Learner accounts are supported for now (Admin creation is not
# implemented yet), so every generated ID uses this fixed prefix.
LEARNER_ID_PREFIX = "LR"
LEARNER_ID_SEQ_DIGITS = 4  # 0001, 0002, ... 9999 per day

# otp_storage (in-memory sign-up / reset codes) now lives in auth_core.py and
# is imported above, so the admin reset flow shares the same store.

# PASSWORD_REGEX now lives in validators.py (imported above) - shared
# with admin_routes.py's Create Administrator flow instead of being
# redefined here.


def get_db_connection():
    try:
        connection = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME
        )
        if connection.is_connected():
            return connection
    except Error as e:
        print(f"Error connecting to MySQL database: {e}")
    return None


def generate_acc_id(cursor):
    """
    Generates a unique, sequential Learner account ID in the format:

        LR YYMMDD 0000
        └┬┘ └──┬──┘ └┬─┘
     prefix  date   4-digit sequence, resets to 0001 every new day

    Example: a learner signing up on 2026-07-29 gets "LR2607290001",
    the next one that same day gets "LR2607290002", and so on. When the
    date rolls over, the sequence starts again at 0001.

    IMPORTANT - concurrency & failure safety:
    This function must be called from inside an open DB transaction
    (mysql-connector defaults to autocommit=False, and the caller commits
    only after the INSERT into account_tbl succeeds). It uses
    "SELECT ... FOR UPDATE" to lock the row(s) matching today's prefix
    before reading the current highest sequence number. That means:

      - If two signups happen at the same moment, the second one's
        SELECT ... FOR UPDATE blocks until the first transaction either
        commits (so it sees the new highest ID) or rolls back (so it
        reuses that same sequence number). Either way, no two accounts
        can ever end up with the same ID.
      - If a signup fails partway through (e.g. a later validation error
        or DB error causes a rollback), the ID that was tentatively
        reserved for it is never actually consumed - the next successful
        signup will generate that same sequence number instead of
        skipping it.

    NOTE: the actual sequential-ID logic now lives in id_generator.py's
    generate_prefixed_acc_id() (imported above), shared with
    admin_routes.py's Create Administrator flow (which calls the same
    function with prefix "AD" instead of "LR"). This wrapper is kept so
    every existing call site in this file doesn't need to change.
    """
    return generate_prefixed_acc_id(cursor, LEARNER_ID_PREFIX, LEARNER_ID_SEQ_DIGITS)


# calculate_age() now lives in validators.py (imported above) - shared
# with admin_routes.py's Create Administrator flow instead of being
# redefined here.

# ============================================================
# ROUTE: SEND SIGNUP OTP
# ============================================================
@app.route("/send-otp", methods=["POST"])
def handle_send_otp():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower() 
    username = (data.get("username") or "").strip().lower()

    if not email:
        return jsonify({"success": False, "message": "Email is required."}), 400

    connection = get_db_connection()
    if connection:
        cursor = connection.cursor()
        
        # Check both fields independently
        cursor.execute(f"SELECT acc_id FROM {ACCOUNT_TABLE} WHERE email = %s", (email,))
        email_exists = cursor.fetchone()

        username_exists = None
        if username:
            cursor.execute(f"SELECT acc_id FROM {ACCOUNT_TABLE} WHERE username = %s", (username,))
            username_exists = cursor.fetchone()

        cursor.close()
        connection.close()

        # Return explicit individual messages or a combined one containing the keywords "email" and "username"
        if email_exists and username_exists:
            return  jsonify({"success": False, "message": "An account with this email already exists and this username is already taken."}), 409
        elif email_exists:
            return jsonify({"success": False, "message": "An account with this email already exists."}), 409
        elif username_exists:
            return jsonify({"success": False, "message": "This username is already taken."}), 409

    otp_code = generate_otp()
    # Store OTP with a 60-second expiration timestamp matching frontend timer
    otp_storage[email] = {
        "otp": otp_code,
        "expires_at": time.time() + 5 * 60
    }

    sent = send_email(
        to_email=email,
        subject="CobraByte - Email Verification Code",
        body_text=f"Your 6-digit verification code is: {otp_code}\nThis code expires in 5 minutes."
    )

    if sent:
        return jsonify({"success": True, "message": "OTP sent successfully!"}), 200
    return jsonify({"success": False, "message": "Failed to send OTP email."}), 500

# ============================================================
# ROUTE: SIGN UP (VERIFY OTP & SAVE TO MYSQL)
# ============================================================
@app.route("/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}

    first_name = (data.get("firstName") or "").strip().title() 
    last_name = (data.get("lastName") or "").strip().title()
    birthdate = (data.get("birthdate") or "").strip()
    gender = (data.get("gender") or "").strip()
    email = (data.get("email") or "").strip().lower() 
    username = (data.get("username") or "").strip().lower()
    password = (data.get("password") or "").strip()
    confirm_password = (data.get("confirmPassword") or "").strip()
    user_otp = (data.get("otp") or "").strip()

    # NOTE: acc_id is intentionally NOT read from the request body anywhere
    # in this route. It is always generated server-side by generate_acc_id(),
    # so there is no way for a client to submit or override their own ID.

    if not all([first_name, last_name, birthdate, gender, email, username, password, confirm_password, user_otp]):
        return jsonify({"success": False, "message": "All fields are required."}), 400

    # ------------------------------------------------------------
    # AGE VALIDATION (Backend Enforcement - Feature 1)
    # ------------------------------------------------------------
    age = calculate_age(birthdate)
    if age is None:
        return jsonify({"success": False, "message": "Please enter a valid birthdate."}), 400

    if age < MIN_SIGNUP_AGE:
        return jsonify({
            "success": False,
            "message": "You must be at least 13 years old to create an account."
        }), 400

    if age > MAX_SIGNUP_AGE:
        return jsonify({
            "success": False,
            "message": "You must be 60 years old or younger to create an account."
        }), 400

    # feat/terms-consent: no account without consent; under 18 also needs
    # the parent or guardian box. Also makes sure consent_tbl exists before
    # the sign-up transaction starts.
    consent_error = check_signup_consent(data, age)
    if consent_error:
        return jsonify({"success": False, "message": consent_error}), 400

    if password != confirm_password:
        return jsonify({"success": False, "message": "Passwords do not match."}), 400

    # Backend Regex Password Validation Check
    if not PASSWORD_REGEX.match(password):
        return jsonify({
            "success": False, 
            "message": "Password must be at least 8 characters long and include an uppercase letter, lowercase letter, number, and special character."
        }), 400

    # Validate OTP code and check expiration against timestamp
    stored_record = otp_storage.get(email)
    if not stored_record:
        return jsonify({"success": False, "message": "No verification code found. Please request a new code."}), 400

    if time.time() > stored_record["expires_at"]:
        otp_storage.pop(email, None)
        return jsonify({"success": False, "message": "Verification code has expired. Please click 'Resend code'."}), 400

    if stored_record["otp"] != user_otp:
        return jsonify({"success": False, "message": "Invalid verification code."}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    try:
        cursor = connection.cursor()

        cursor.execute(
            f"SELECT acc_id FROM {ACCOUNT_TABLE} WHERE username = %s OR email = %s",
            (username, email)
        )
        if cursor.fetchone():
            return jsonify({"success": False, "message": "Username or email is already taken."}), 409

        hashed_password = generate_password_hash(password)

        # Generate the Learner account ID (LRYYMMDD0000). This must happen
        # inside this same transaction/connection - generate_acc_id() takes
        # a row lock (SELECT ... FOR UPDATE) that is only released when this
        # transaction commits or rolls back, which is what keeps concurrent
        # signups from ever generating the same ID.
        new_acc_id = generate_acc_id(cursor)

        # 1. Insert into account_tbl
        cursor.execute(
            f"""INSERT INTO {ACCOUNT_TABLE} (
                    acc_id, email, username, password, u_type,
                    status, created_at, last_login,
                    failed_attempts, lockout_until, is_deleted
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    'Active', NOW(), NULL,
                    0, NULL, 0
                )""",
            (new_acc_id, email, username, hashed_password, DEFAULT_U_TYPE)
        )

        # 2. Insert into profile_tbl matching exact structure
        cursor.execute(
            f"INSERT INTO {PROFILE_TABLE} (acc_id, firstname, lastname, gender, birthdate) VALUES (%s, %s, %s, %s, %s)",
            (new_acc_id, first_name, last_name, gender, birthdate)
        )

        # 3. feat/terms-consent: save the consent given at sign-up
        record_consent(cursor, new_acc_id, guardian_declared=guardian_flag(data, age))

        # 4. Welcome notification for the header bell
        notify(cursor, new_acc_id, "welcome",
               f"Welcome to CobraByte, **{first_name}**!",
               "Start with Chapter 1 on your Learning Map. Your progress, badges and lives show up here.",
               "/learning-map", "welcome")

        # 5. feat/admin-bell: the admins' header bell hears about the new learner
        #    (imported here: only this route needs it)
        from urllib.parse import quote
        from staff_notifications import notify_admins
        notify_admins(cursor, "signup",
                      f"**{first_name} {last_name}** signed up",
                      f"New learner account {new_acc_id}.",
                      f"/admin/account-security.html?q={quote(email)}",
                      f"signup:{new_acc_id}")

        connection.commit()
        cursor.close()

        # Clean up OTP after registration
        otp_storage.pop(email, None)

        return jsonify({"success": True, "message": "Account created successfully.", "acc_id": new_acc_id}), 201

    except Error as e:
        connection.rollback()
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# ROUTE: LEARNER LOGIN
# ============================================================
@app.route("/login", methods=["POST"])
def login():
    """
    Learner door. All the rules (sweep, 5-try lockout, logs, archived
    message) live in auth_core.authenticate() - shared with /admin/login.
    An admin account gets 403 + admin_login_url here, never a session.
    """
    data = request.get_json(silent=True) or {}
    payload, status, login_info = authenticate(
        data.get("username"), data.get("password"), "learner", request.remote_addr
    )
    if login_info:
        session.clear()
        if login_info["session_token"]:
            session["session_token"] = login_info["session_token"]
        session["acc_id"] = login_info["acc_id"]
        session.permanent = True
        # feat/terms-consent: current versions not accepted yet -> consent screen first
        if has_current_consent(login_info["acc_id"]) is False:
            payload["redirect"] = CONSENT_PAGE_URL
    return jsonify(payload), status


# ============================================================
# ROUTES: LEARNER FORGOT PASSWORD (send code -> verify -> reset)
# Learner accounts only - admins reset from /admin/login.
# ============================================================
@app.route("/forgot-password/send-otp", methods=["POST"])
def forgot_password_send_otp():
    data = request.get_json(silent=True) or {}
    payload, status = send_reset_code(data.get("email"), "learner")
    return jsonify(payload), status


@app.route("/forgot-password/verify-otp", methods=["POST"])
def forgot_password_verify_otp():
    data = request.get_json(silent=True) or {}
    payload, status = verify_reset_code(data.get("email"), data.get("otp"), "learner")
    return jsonify(payload), status


@app.route("/forgot-password/reset-password", methods=["POST"])
def forgot_password_reset():
    data = request.get_json(silent=True) or {}
    payload, status = reset_password(
        data.get("email"), data.get("newPassword"), data.get("confirmPassword"), "learner"
    )
    return jsonify(payload), status


# feat/forgot-username: "Forgot your username?" on the learner login page.
# Same shape as the two forgot-password routes above; the rules live in
# auth_core.py. The username is only returned after the emailed code is
# verified.
@app.route("/forgot-username/send-otp", methods=["POST"])
def forgot_username_send_otp():
    data = request.get_json(silent=True) or {}
    payload, status = send_username_code(data.get("email"), "learner")
    return jsonify(payload), status


@app.route("/forgot-username/verify-otp", methods=["POST"])
def forgot_username_verify_otp():
    data = request.get_json(silent=True) or {}
    payload, status = verify_username_code(data.get("email"), data.get("otp"), "learner")
    return jsonify(payload), status


# ============================================================
# ROUTE: GET GENDER OPTIONS (Feature 2)
# ============================================================
@app.route("/genders", methods=["GET"])
def get_genders():
    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(f"SELECT gender_id, gender FROM {GENDER_TABLE} ORDER BY gender_id ASC")
        genders = cursor.fetchall()
        cursor.close()
        return jsonify(genders), 200

    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()

# ============================================================
# ROUTE: LEARNER LOGOUT
# ============================================================
@app.route("/logout", methods=["POST"])
def learner_logout():
    """
    Task: "Active Sessions" must decrease on logout, not just on
    session expiry. Mirrors admin_routes.py's admin_logout() but for
    Learner accounts (which have no server-side session guard of their
    own - see auth-guard.js's docstring - so this route's only job is
    to end the active_sessions_tbl row that create_session() opened at
    login).

    Best-effort: end_session() never raises, so this always returns
    success even if the underlying delete failed - a logout must never
    appear to fail to the frontend.
    """
    token = session.get("session_token")
    end_session(token)
    session.clear()
    return jsonify({"success": True, "message": "Logged out."}), 200


# ============================================================
# ROUTE: BEACON - END SESSION ON TAB CLOSE (no explicit Logout click)
# ============================================================
@app.route("/session/end", methods=["POST"])
def learner_session_end_beacon():
    """
    Task: "Active Sessions" should drop the instant a person closes the
    tab/browser, not sit stale for up to SESSION_TIMEOUT_MINUTES until
    the next sweep. auth-guard.js fires this via navigator.sendBeacon()
    on 'pagehide' - sendBeacon requests are fire-and-forget (the
    browser doesn't wait for or care about the response, and may still
    be mid-unload when this fires), so this route is intentionally
    trivial: end the session row and return immediately. It does NOT
    clear the full Flask session or attempt anything else, since the
    tab is already closing and there's no page left to react to a
    richer response.

    Safe to call redundantly - end_session() is a no-op if the token is
    already gone (e.g. the person used the real Logout button first).
    """
    token = session.get("session_token")
    end_session(token)
    return ("", 204)


# ============================================================
# ROUTE: SERVE FRONTEND PAGES
# ============================================================
@app.route("/")
def landing_page():
    """Landing page now owns the root path (merged from the old app.py)."""
    return render_template('landing_page.html')


@app.route("/login")
def serve_login():
    """
    Login/signup page now lives at /login instead of "/", since the
    landing page owns the root path in this merged app. Uses
    render_template() (not send_from_directory) so it correctly reads
    from the templates/ folder configured above.
    """
    return render_template('login.html')

# NOTE: /dashboard and /learner/<path:filename> moved to learner_routes.py
# (registered above as learner_bp) - no longer defined here.

# ============================================================
# ROUTE: GLOBAL ASSETS HANDLER (Handles root and blueprint paths)
# ============================================================
@app.route('/assets/<path:filename>')
@app.route('/admin/assets/<path:filename>')
def serve_global_assets(filename):
    assets_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../assets'))
    return send_from_directory(assets_dir, filename)

@app.route("/header.html")
def serve_header():
    return render_template('header.html')

if __name__ == "__main__":
    app.run(debug=True, port=5000)