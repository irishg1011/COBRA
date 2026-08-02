"""
login.py - CobraByte Backend Server
------------------------------------
Flask routes for user registration, authentication, and OTP verification.
"""

import os
from flask import Flask, jsonify, request, send_from_directory, render_template, session
from api import generate_otp, send_email
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
from werkzeug.security import check_password_hash, generate_password_hash
from datetime import datetime
import time
import re
from login_logs import log_login_attempt  # NEW: reusable login attempt logger
from admin_routes import admin_bp  # NEW: import admin blueprint
from account_status import refresh_inactive_accounts, is_account_inactive  # NEW: shared, configurable Active/Inactive logic

app = Flask(__name__, template_folder='../templates', static_folder='../static')

# ------------------------------------------------------------
# SESSION CONFIG (Task #12: server-side admin session)
# ------------------------------------------------------------
# Required for Flask to sign the session cookie. Move this to an
# environment variable before deploying anywhere real - a hardcoded
# secret is fine for local dev only.
app.secret_key = os.environ.get("COBRABYTE_SECRET_KEY", "dev-only-change-me")

# supports_credentials lets the frontend's fetch() calls send/receive the
# session cookie across origins (e.g. Live Server on :5500 -> Flask on :5000).
# NOTE: browsers require an explicit origin (not "*") whenever credentials
# are involved, so list the frontend origin(s) directly instead of allowing
# any origin.
FRONTEND_ORIGINS = ["http://127.0.0.1:5500", "http://localhost:5500"]
CORS(app, supports_credentials=True, origins=FRONTEND_ORIGINS)

# Register the admin blueprint
app.register_blueprint(admin_bp, url_prefix='/admin')

# ============================================================
# DATABASE CONFIG
# ============================================================
DB_HOST = "localhost"
DB_USER = "root"
DB_PASSWORD = ""
DB_NAME = "cobra_db"

ACCOUNT_TABLE = "account_tbl" 
PROFILE_TABLE = "profile_tbl"
GENDER_TABLE = "gender_tbl"
DEFAULT_U_TYPE = 2  # 2 = Learner
MIN_SIGNUP_AGE = 13
MAX_SIGNUP_AGE = 60

# ------------------------------------------------------------
# ROLE / USERTYPE CONFIG (matches usertype_tbl: 1 = Admin, 2 = Learner)
# ------------------------------------------------------------
ADMIN_U_TYPE = 1
LEARNER_U_TYPE = 2

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

# Temporary in-memory OTP storage with timestamp expiration: { "key": {"otp": "123456", "expires_at": 1234567890.0} }
otp_storage = {}

# Reusable robust password strength regex validator
PASSWORD_REGEX = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_,.?\":{}|<>]).{8,}$")


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
    """
    today_prefix = f"{LEARNER_ID_PREFIX}{datetime.now().strftime('%y%m%d')}"

    # Lock the most recent ID for today's prefix (if any) so no other
    # concurrent transaction can read/generate against it until we're done.
    cursor.execute(
        f"""SELECT acc_id FROM {ACCOUNT_TABLE}
            WHERE acc_id LIKE %s
            ORDER BY acc_id DESC
            LIMIT 1
            FOR UPDATE""",
        (f"{today_prefix}%",)
    )
    row = cursor.fetchone()

    if row:
        last_seq = int(row[0][-LEARNER_ID_SEQ_DIGITS:])
        next_seq = last_seq + 1
    else:
        next_seq = 1

    return f"{today_prefix}{next_seq:0{LEARNER_ID_SEQ_DIGITS}d}"


def calculate_age(birthdate_str):
    """
    Parses a birthdate string (expected format: YYYY-MM-DD, which is what
    HTML <input type="date"> sends) and returns the user's current age
    in whole years. Returns None if the date is missing or malformed.
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
        "expires_at": time.time() + 60
    }

    sent = send_email(
        to_email=email,
        subject="CobraByte - Email Verification Code",
        body_text=f"Your 6-digit verification code is: {otp_code}\nThis code expires in 1 minute."
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
# ROUTE: LOGIN (WITH AUTO-RESET & LOCKOUT PROTECTION)
# ============================================================
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"success": False, "message": "Please enter both username and password."}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    # ------------------------------------------------------------
    # ACCOUNT INACTIVITY SWEEP (table-wide, not just this account)
    # ------------------------------------------------------------
    # Runs before we even look up the account being logged into, so every
    # login attempt doubles as an opportunity to catch ANY account whose
    # last_login has exceeded the configurable ACCOUNT_INACTIVITY_MINUTES
    # threshold (see account_status.py) and flip it to 'Inactive'. This
    # is best-effort/non-fatal by design - see refresh_inactive_accounts()'s
    # own docstring for why it swallows its own errors.
    refresh_inactive_accounts(connection)

    try:
        cursor = connection.cursor(dictionary=True)
        
        # Fetch account details
        cursor.execute(
            f"SELECT acc_id, password, status, last_login, failed_attempts, lockout_until, is_deleted, u_type FROM {ACCOUNT_TABLE} WHERE username = %s",
            (username,)
        )
        account = cursor.fetchone()

        if not account or account.get("is_deleted"):
            cursor.close()
            # NEW: log failed attempt for unknown/deleted username (acc_id=None)
            log_login_attempt(acc_id=None, ip_address=request.remote_addr, attempt_status="Failed")
            return jsonify({"success": False, "message": "Invalid username or password."}), 401

        # ------------------------------------------------------------
        # ACCOUNT INACTIVITY CHECK
        # ------------------------------------------------------------
        # The actual "has this exceeded the configurable inactivity
        # threshold?" comparison already ran table-wide (not just for
        # this one account) via refresh_inactive_accounts() right after
        # the connection was opened above - see the call before the
        # SELECT. If that sweep just flipped THIS account to 'Inactive',
        # reflect that in the in-memory `account` dict too, since it was
        # fetched before the sweep ran.
        if is_account_inactive(account.get("last_login")):
            account["status"] = "Inactive"

        lockout_until = account.get("lockout_until")
        
        # Automatically reset attempts and clear lockout if 1-minute timeout has passed
        if lockout_until and datetime.now() >= lockout_until:
            cursor.execute(
                f"UPDATE {ACCOUNT_TABLE} SET failed_attempts = 0, lockout_until = NULL WHERE acc_id = %s",
                (account["acc_id"],)
            )
            connection.commit()
            account["failed_attempts"] = 0
            account["lockout_until"] = None
            lockout_until = None

        # Check if account is currently locked out
        if lockout_until and datetime.now() < lockout_until:
            cursor.close()
            remaining_seconds = int((lockout_until - datetime.now()).total_seconds())
            # NEW: log failed attempt caused by active lockout
            log_login_attempt(acc_id=account["acc_id"], ip_address=request.remote_addr, attempt_status="Failed")
            return jsonify({
                "success": False, 
                "message": f"Too many failed attempts. Please try again in 1 minute.",
                "remaining_seconds": max(1, remaining_seconds)
            }), 423 # HTTP 423 Locked

        # Verify Password Hash
        if not check_password_hash(account["password"], password):
            failed_attempts = account.get("failed_attempts", 0) + 1
            
            if failed_attempts >= 5:
                # Lock account for 1 minute
                cursor.execute(
                    f"UPDATE {ACCOUNT_TABLE} SET failed_attempts = %s, lockout_until = DATE_ADD(NOW(), INTERVAL 1 MINUTE) WHERE acc_id = %s",
                    (failed_attempts, account["acc_id"])
                )
                connection.commit()
                cursor.close()
                # NEW: log failed attempt that triggered the lockout
                log_login_attempt(acc_id=account["acc_id"], ip_address=request.remote_addr, attempt_status="Failed")
                return jsonify({
                    "success": False, 
                    "message": "Too many failed attempts. Please try again in 1 minute.",
                    "remaining_seconds": 60
                }), 423
            else:
                # Increment failed attempts and return remaining count out of 5
                cursor.execute(
                    f"UPDATE {ACCOUNT_TABLE} SET failed_attempts = %s WHERE acc_id = %s",
                    (failed_attempts, account["acc_id"])
                )
                connection.commit()
                cursor.close()
                attempts_remaining = 5 - failed_attempts
                # NEW: log failed attempt (wrong password)
                log_login_attempt(acc_id=account["acc_id"], ip_address=request.remote_addr, attempt_status="Failed")
                return jsonify({
                    "success": False, 
                    "message": f"Incorrect password. {attempts_remaining} attempt(s) remaining."
                }), 401

        # Successful login: reset failed attempts/lockout, update last_login,
        # and reactivate status. This UPDATE is the ONLY place in the app
        # that ever sets status back to 'Active' - refresh_inactive_accounts()
        # (account_status.py) only ever moves accounts TOWARD 'Inactive', so
        # there's no risk of the two racing/undoing each other. This is what
        # implements "Inactive account logs in again -> status = Active".
        cursor.execute(
            f"UPDATE {ACCOUNT_TABLE} SET failed_attempts = 0, lockout_until = NULL, last_login = NOW(), status = 'Active' WHERE acc_id = %s",
            (account["acc_id"],)
        )
        connection.commit()
        cursor.close()

        # NEW: log successful login
        log_login_attempt(acc_id=account["acc_id"], ip_address=request.remote_addr, attempt_status="Success")

        # ------------------------------------------------------------
        # ROLE-BASED REDIRECT (u_type: 1 = Admin, 2 = Learner)
        # ------------------------------------------------------------
        is_admin = account.get("u_type") == ADMIN_U_TYPE
        role = "Admin" if is_admin else "Learner"
        redirect_url = "/admin/dashboard" if is_admin else "dashboard.html"

        # NEW (Task #12): Admin pages are authenticated via a real
        # server-side session, not just the frontend's sessionStorage
        # flag. Store only the acc_id here - admin_routes.py looks this
        # up fresh from the database on every request rather than
        # trusting any name/role passed in from the client.
        if is_admin:
            session.clear()
            session["admin_id"] = account["acc_id"]
        else:
            session.clear()

        return jsonify({
            "success": True,
            "message": "Login successful. Redirecting...",
            "acc_id": account["acc_id"],
            "u_type": account["u_type"],
            "role": role,
            "redirect": redirect_url
        }), 200

    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()

# ============================================================
# ROUTE: SEND FORGOT PASSWORD OTP
# ============================================================
@app.route("/forgot-password/send-otp", methods=["POST"])
def forgot_password_send_otp():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if not email:
        return jsonify({"success": False, "message": "Please enter your email address."}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT acc_id FROM {ACCOUNT_TABLE} WHERE email = %s AND is_deleted = 0", (email,))
        account = cursor.fetchone()
        cursor.close()

        if not account:
            return jsonify({"success": False, "message": "No account found with this email address."}), 404

        # Generate OTP and store in memory with expiration timestamp
        otp_code = generate_otp()
        otp_storage[f"forgot_{email}"] = {
            "otp": otp_code,
            "expires_at": time.time() + 60
        }

        # Send email using api.py
        sent = send_email(
            to_email=email,
            subject="CobraByte - Password Reset Code",
            body_text=f"Your 6-digit password reset code is: {otp_code}\nThis code expires in 1 minute."
        )

        if sent:
            return jsonify({"success": True, "message": "Reset code sent to your email."}), 200
        return jsonify({"success": False, "message": "Failed to send email. Please try again."}), 500

    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()

# ============================================================
# ROUTE: VERIFY FORGOT PASSWORD OTP
# ============================================================
@app.route("/forgot-password/verify-otp", methods=["POST"])
def forgot_password_verify_otp():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    user_otp = (data.get("otp") or "").strip()

    if not email or not user_otp:
        return jsonify({"success": False, "message": "Email and OTP code are required."}), 400

    stored_record = otp_storage.get(f"forgot_{email}")
    if not stored_record:
        return jsonify({"success": False, "message": "No verification code found. Please request a new code."}), 400

    if time.time() > stored_record["expires_at"]:
        otp_storage.pop(f"forgot_{email}", None)
        return jsonify({"success": False, "message": "Verification code has expired. Please click 'Resend code'."}), 400

    if stored_record["otp"] != user_otp:
        return jsonify({"success": False, "message": "Invalid verification code."}), 400

    return jsonify({"success": True, "message": "OTP verified successfully."}), 200


# ============================================================
# ROUTE: RESET PASSWORD (UPDATE IN MYSQL & CLEAR LOCKOUT)
# ============================================================
@app.route("/forgot-password/reset-password", methods=["POST"])
def forgot_password_reset():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    new_password = (data.get("newPassword") or "").strip()
    confirm_password = (data.get("confirmPassword") or "").strip()

    if not email or not new_password or not confirm_password:
        return jsonify({"success": False, "message": "All fields are required."}), 400

    if new_password != confirm_password:
        return jsonify({"success": False, "message": "Passwords do not match."}), 400

    # Backend Regex Password Validation Check for Reset Flow
    if not PASSWORD_REGEX.match(new_password):
        return jsonify({
            "success": False, 
            "message": "Password must be at least 8 characters long and include an uppercase letter, lowercase letter, number, and special character."
        }), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500

    try:
        cursor = connection.cursor(dictionary=True) # Ginawang dictionary=True para makuha sa key name
        
        # 1. Kunin muna ang kasalukuyang password hash ng user
        cursor.execute(f"SELECT password FROM {ACCOUNT_TABLE} WHERE email = %s AND is_deleted = 0", (email,))
        account = cursor.fetchone()

        if not account:
            cursor.close()
            return jsonify({"success": False, "message": "Account not found."}), 404

        # 2. DAGDAG CHECK: I-verify kung ang bagong password ay pareho sa lumang password
        if check_password_hash(account["password"], new_password):
            cursor.close()
            return jsonify({
                "success": False, 
                "message": "Your new password cannot be the same as your old password."
            }), 400

        # 3. Hash the new password before updating
        hashed_password = generate_password_hash(new_password)

        # Update password and automatically clear failed attempts / lockout state
        cursor.execute(
            f"UPDATE {ACCOUNT_TABLE} SET password = %s, failed_attempts = 0, lockout_until = NULL WHERE email = %s AND is_deleted = 0",
            (hashed_password, email)
        )
        connection.commit()

        cursor.close()

        # Clean up stored OTP after successful reset
        otp_storage.pop(f"forgot_{email}", None)

        return jsonify({"success": True, "message": "Password updated successfully."}), 200

    except Error as e:
        connection.rollback()
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


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
# ROUTE: SERVE FRONTEND PAGES
# ============================================================
@app.route("/")
def serve_login():
    return send_from_directory('.', 'login.html')

@app.route("/<path:filename>")
def serve_static_files(filename):
    return send_from_directory('.', filename)

# ============================================================
# ROUTE: DASHBOARD PAGE
# ============================================================
@app.route("/dashboard")
def dashboard():
    return render_template('/../dashboard.html')

# ============================================================
# ROUTE: GLOBAL ASSETS HANDLER (Handles root and blueprint paths)
# ============================================================
@app.route('/assets/<path:filename>')
@app.route('/admin/assets/<path:filename>')
def serve_global_assets(filename):
    assets_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../assets'))
    return send_from_directory(assets_dir, filename)

if __name__ == "__main__":
    app.run(debug=True, port=5000)