"""
login.py - CobraByte Backend Server
------------------------------------
Flask routes for user registration, authentication, and OTP verification.
"""

from api import generate_otp, send_email
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
from werkzeug.security import check_password_hash, generate_password_hash
from datetime import datetime
import time
import re

app = Flask(__name__)
CORS(app)  # Enables cross-origin requests from Live Server (http://127.0.0.1:5500)

# ============================================================
# DATABASE CONFIG
# ============================================================
DB_HOST = "localhost"
DB_USER = "root"
DB_PASSWORD = ""
DB_NAME = "cobra_db"

ACCOUNT_TABLE = "account_tbl"
PROFILE_TABLE = "profile_tbl"
DEFAULT_U_TYPE = 2  # 2 = Learner

# Temporary in-memory OTP storage with timestamp expiration: { "key": {"otp": "123456", "expires_at": 1234567890.0} }
otp_storage = {}

# Reusable robust password strength regex validator
PASSWORD_REGEX = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?\":{}|<>]).{8,}$")


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
    cursor.execute(f"SELECT COUNT(*) AS total FROM {ACCOUNT_TABLE}")
    total = cursor.fetchone()[0]
    return f"ACC{total + 1:05d}"

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

        # Build a combined error message if both exist
        errors = []
        if email_exists:
            errors.append("An account with this email already exists.")
        if username_exists:
            errors.append("This username is already taken.")

        if errors:
            return jsonify({"success": False, "message": " ".join(errors)}), 409

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

    if not all([first_name, last_name, birthdate, gender, email, username, password, confirm_password, user_otp]):
        return jsonify({"success": False, "message": "All fields are required."}), 400

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
        new_acc_id = generate_acc_id(cursor)

        # 1. Insert into account_tbl
        cursor.execute(
            f"INSERT INTO {ACCOUNT_TABLE} (acc_id, email, username, password, u_type, failed_attempts, lockout_until, is_deleted) VALUES (%s, %s, %s, %s, %s, 0, NULL, 0)",
            (new_acc_id, email, username, hashed_password, DEFAULT_U_TYPE)
        )

        # 2. Insert into profile_tbl matching exact structure
        cursor.execute(
            f"INSERT INTO {PROFILE_TABLE} (acc_id, email, username, firstname, lastname, gender, birthdate) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (new_acc_id, email, username, first_name, last_name, gender, birthdate)
        )

        connection.commit()
        cursor.close()

        # Clean up OTP after registration
        otp_storage.pop(email, None)

        return jsonify({"success": True, "message": "Account created successfully."}), 201

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

    try:
        cursor = connection.cursor(dictionary=True)
        
        # Fetch account details
        cursor.execute(
            f"SELECT acc_id, password, failed_attempts, lockout_until, is_deleted FROM {ACCOUNT_TABLE} WHERE username = %s",
            (username,)
        )
        account = cursor.fetchone()

        if not account or account.get("is_deleted"):
            cursor.close()
            return jsonify({"success": False, "message": "Invalid username or password."}), 401

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
            return jsonify({
                "success": False, 
                "message": "Too many failed attempts. Please try again in 1 minute."
            }), 423  # HTTP 423 Locked

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
                return jsonify({
                    "success": False, 
                    "message": "Too many failed attempts. Please try again in 1 minute."
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
                return jsonify({
                    "success": False, 
                    "message": f"Incorrect password. {attempts_remaining} attempt(s) remaining."
                }), 401

        # Successful login: Reset failed attempts and clear lockout state
        cursor.execute(
            f"UPDATE {ACCOUNT_TABLE} SET failed_attempts = 0, lockout_until = NULL WHERE acc_id = %s",
            (account["acc_id"],)
        )
        connection.commit()
        cursor.close()

        return jsonify({"success": True, "message": "Login successful. Redirecting..."}), 200

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
        cursor = connection.cursor()
        
        # Hash the new password before updating
        hashed_password = generate_password_hash(new_password)

        # Update password and automatically clear failed attempts / lockout state
        cursor.execute(
            f"UPDATE {ACCOUNT_TABLE} SET password = %s, failed_attempts = 0, lockout_until = NULL WHERE email = %s AND is_deleted = 0",
            (hashed_password, email)
        )
        connection.commit()

        if cursor.rowcount == 0:
            cursor.close()
            return jsonify({"success": False, "message": "Account not found or password not updated."}), 404

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
# ROUTE: SERVE FRONTEND PAGES
# ============================================================
@app.route("/")
def serve_login():
    return send_from_directory('.', 'login.html')

@app.route("/<path:filename>")
def serve_static_files(filename):
    return send_from_directory('.', filename)

if __name__ == "__main__":
    app.run(debug=True, port=5000)