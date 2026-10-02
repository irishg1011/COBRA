"""
CobraByte - Sign Up & Login Backend (Flask)
--------------------------------------------
Based on your existing cobradb.py connection config and the account_tbl
structure shown in phpMyAdmin:

    account_tbl
    -----------
    acc_id          varchar(15)   PRIMARY KEY   <-- system-generated ID (not typed by user)
    email           varchar(100)
    username        varchar(30)   UNIQUE        <-- used for login
    password        varchar(255)
    u_type          int(10)       FK -> usertype_tbl
    failed_attempts tinyint(1)
    is_deleted      tinyint(1)
    deleted_at      timestamp

NOTE ON "acc_id":
Since acc_id is the PRIMARY KEY but is a varchar(15) with no auto-increment,
something has to generate it during sign up. This code auto-generates one
(see generate_acc_id() below) using a simple "ACC" + zero-padded counter
scheme. If you already generate acc_id a different way (e.g. in another
part of your system), replace generate_acc_id() with that logic instead.

PLACEHOLDERS YOU STILL NEED TO CONFIRM:
- profile_tbl columns (first_name, last_name, birthdate, gender_id, acc_id)
- gender_tbl columns (gender_id, gender_name)
Adjust the PROFILE_COLUMNS section below once you confirm the real names.

Install what you need:
    pip install flask mysql-connector-python werkzeug
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
CORS(app)  # allows requests from other origins/ports, e.g. Live Server on :5500

# ============================================================
# DATABASE CONFIG (same as your cobradb.py)
# ============================================================
from cobradb import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME  # single source of DB settings

ACCOUNT_TABLE = "account_tbl"
PROFILE_TABLE = "profile_tbl"       # <-- confirm this table name

# Default user type assigned to new sign-ups (check usertype_tbl for the
# correct id, e.g. 1 = student)
DEFAULT_U_TYPE = 1
# ============================================================


def get_db_connection():
    """Opens a connection to cobra_db."""
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
    Generates a new acc_id like 'ACC00001', 'ACC00002', etc.
    Fits within varchar(15). Adjust this if you already have your own
    ID scheme elsewhere in the system.
    """
    cursor.execute(f"SELECT COUNT(*) AS total FROM {ACCOUNT_TABLE}")
    total = cursor.fetchone()[0]
    new_id = f"ACC{total + 1:05d}"
    return new_id


# ============================================================
# SIGN UP
# ============================================================
@app.route("/signup", methods=["POST"])
def signup():
    data = request.form if request.form else (request.get_json(silent=True) or {})

    first_name = (data.get("firstName") or "").strip()
    last_name = (data.get("lastName") or "").strip()
    birthdate = (data.get("birthdate") or "").strip()
    gender = (data.get("gender") or "").strip()
    email = (data.get("email") or "").strip()
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    confirm_password = (data.get("confirmPassword") or "").strip()

    # ------------------------------------------------------------
    # VALIDATION: lahat ng fields kailangan ma-fill up bago mag-proceed.
    # ------------------------------------------------------------
    required_fields = {
        "First name": first_name,
        "Last name": last_name,
        "Birthdate": birthdate,
        "Gender": gender,
        "Email": email,
        "Username": username,
        "Password": password,
        "Confirm password": confirm_password,
    }

    missing = [label for label, value in required_fields.items() if not value]
    if missing:
        return jsonify({
            "success": False,
            "message": f"Please fill in the following field(s): {', '.join(missing)}."
        }), 400

    if password != confirm_password:
        return jsonify({
            "success": False,
            "message": "Password and confirm password do not match."
        }), 400

    if len(username) > 15:
        return jsonify({
            "success": False,
            "message": "Username must be 15 characters or fewer."
        }), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to the database."}), 500

    try:
        cursor = connection.cursor()

        # Check if username or email already exists
        cursor.execute(
            f"SELECT acc_id FROM {ACCOUNT_TABLE} WHERE username = %s OR email = %s",
            (username, email)
        )
        if cursor.fetchone():
            return jsonify({
                "success": False,
                "message": "Username or email is already taken."
            }), 409

        hashed_password = generate_password_hash(password)
        new_acc_id = generate_acc_id(cursor)

        # Insert into account_tbl
        cursor.execute(
            f"""INSERT INTO {ACCOUNT_TABLE}
                (acc_id, email, username, password, u_type, failed_attempts, is_deleted)
                VALUES (%s, %s, %s, %s, %s, 0, 0)""",
            (new_acc_id, email, username, hashed_password, DEFAULT_U_TYPE)
        )

        # ------------------------------------------------------------
        # Insert into profile_tbl (PLACEHOLDER - confirm real column names)
        # ------------------------------------------------------------
        cursor.execute(
            f"""INSERT INTO {PROFILE_TABLE}
                (acc_id, first_name, last_name, birthdate, gender)
                VALUES (%s, %s, %s, %s, %s)""",
            (new_acc_id, first_name, last_name, birthdate, gender)
        )

        connection.commit()
        cursor.close()

        return jsonify({
            "success": True,
            "message": "Account created successfully."
        }), 201

    except Error as e:
        connection.rollback()
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# LOGIN
# ============================================================
@app.route("/login", methods=["POST"])
def login():
    data = request.form if request.form else (request.get_json(silent=True) or {})

    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    # ------------------------------------------------------------
    # VALIDATION: parehong hindi puwedeng blangko bago mag-proceed.
    # ------------------------------------------------------------
    if not username or not password:
        return jsonify({
            "success": False,
            "message": "Please fill in your username and password before logging in."
        }), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to the database."}), 500

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT acc_id, password, is_deleted
                FROM {ACCOUNT_TABLE}
                WHERE username = %s""",
            (username,)
        )
        account = cursor.fetchone()
        cursor.close()

        # Wrong username, or account was soft-deleted
        if not account or account.get("is_deleted"):
            return jsonify({
                "success": False,
                "message": "Wrong username or password."
            }), 401

        # Wrong password
        if not check_password_hash(account["password"], password):
            return jsonify({
                "success": False,
                "message": "Wrong username or password."
            }), 401

        return jsonify({
            "success": True,
            "message": "Login successful. Redirecting to dashboard..."
        }), 200

    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {str(e)}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


if __name__ == "__main__":
    app.run(debug=True)