"""
CobraByte - Backend (Flask)
----------------------------
This backend handles the Sign In form submitted from index.html.

SETUP NEEDED FROM YOU:
1. Install dependencies:
       pip install flask mysql-connector-python
   (If you're using a different database like PostgreSQL or SQLite,
   swap out the connector accordingly.)

2. Fill in the placeholders in the CONFIG section below once your
   database and table are created.
"""

from flask import Flask, request, jsonify
import mysql.connector
from mysql.connector import Error

app = Flask(__name__)

# ============================================================
# CONFIG - FILL THESE IN ONCE YOUR DATABASE EXISTS
# ============================================================
DB_HOST = "localhost"
DB_USER = "root"
DB_PASSWORD = ""                      # <-- your MySQL password
DB_NAME = "<YOUR_DATABASE_NAME>"      # <-- e.g. "cobrabyte_db"
TABLE_NAME = "<YOUR_TABLE_NAME>"      # <-- e.g. "users"
# ============================================================


def get_db_connection():
    """
    Opens a connection to the database using the config above.
    Called only AFTER we've confirmed username/password were provided.
    """
    return mysql.connector.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )


@app.route("/login", methods=["POST"])
def login():
    # Accept form-encoded data or JSON
    data = request.form if request.form else (request.get_json(silent=True) or {})

    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    # ------------------------------------------------------------
    # VALIDATION: block login if either field is empty.
    # This runs BEFORE any database connection is attempted, so an
    # incomplete form never reaches the dashboard.
    # ------------------------------------------------------------
    if not username or not password:
        return jsonify({
            "success": False,
            "message": "Please fill in your username and password before logging in."
        }), 400

    # ------------------------------------------------------------
    # Only reached if both fields were filled in.
    # ------------------------------------------------------------
    try:
        connection = get_db_connection()
        cursor = connection.cursor(dictionary=True)

        query = f"SELECT * FROM {TABLE_NAME} WHERE username = %s AND password = %s"
        cursor.execute(query, (username, password))
        user = cursor.fetchone()

        cursor.close()
        connection.close()

        if user:
            return jsonify({
                "success": True,
                "message": "Login successful. Redirecting to dashboard..."
            }), 200
        else:
            return jsonify({
                "success": False,
                "message": "Incorrect username or password."
            }), 401

    except Error as e:
        return jsonify({
            "success": False,
            "message": f"Database error: {str(e)}"
        }), 500


if __name__ == "__main__":
    app.run(debug=True)

