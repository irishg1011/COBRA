import os
import time
import mysql.connector
from mysql.connector import Error

# Database Configuration
# Read from environment variables so production can use its own DB user.
# Defaults match a stock local XAMPP/WAMP setup, so no setup is needed locally.
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_NAME = os.environ.get("DB_NAME", "cobra_db")

# ------------------------------------------------------------------
# App clock = Philippine time (UTC+8), wherever the server runs.
# The live server's clock is UTC, so NOW() / CURRENT_TIMESTAMP in MySQL and
# datetime.now() in Python were 8 hours behind (Login Logs said 3:58 AM at
# 11:58 AM). Both are set here, once, for the whole app:
#   - every MySQL connection runs with time_zone = DB_TIME_ZONE, so NOW(),
#     CURRENT_TIMESTAMP defaults and TIMESTAMP columns (attempted_at,
#     last_seen_at, ...) read and write Philippine time;
#   - the Python process uses APP_TZ for datetime.now() / time.localtime().
# UTC_TIMESTAMP() is not affected, so the "UTC_TIMESTAMP() + INTERVAL 8 HOUR"
# clocks in notifications.py / contact_messages.py / lesson_activities.py
# stay exactly as they were.
# ------------------------------------------------------------------
DB_TIME_ZONE = os.environ.get("DB_TIME_ZONE", "+08:00")
APP_TZ = os.environ.get("APP_TZ", "PHT-8")   # POSIX form of UTC+8 - needs no tz database

if hasattr(time, "tzset"):   # Linux / macOS; on Windows the PC's own clock (PH) is used
    os.environ["TZ"] = APP_TZ
    time.tzset()

def get_db_connection():
    """Establishes and returns a connection to the cobra_db database."""
    try:
        connection = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            time_zone=DB_TIME_ZONE,
        )
        if connection.is_connected():
            _ensure_item_removal_schema(connection)
            return connection
    except Error as e:
        print(f"Error connecting to MySQL database: {e}")
        return None


# ------------------------------------------------------------------
# Removed activity items (Multiple Choice questions and answer options,
# Fill in the Blanks items, Flashcards). A removed item that learners already answered (or
# saw - a time-out, skip or leave is saved too) is hidden with
# is_removed = 1 instead of deleted, so their answers, scores and
# analytics keep pointing at it. Every query that lists an activity's
# items reads only is_removed = 0; reads of one item by id (history) don't.
# Added on the first connection, before any query can read the column.
# ------------------------------------------------------------------
ITEM_TABLES_WITH_REMOVAL = ("mcq_questions_tbl", "mcq_options_tbl", "fill_blanks_tbl", "flashcards_tbl")
_item_removal_ready = False


def _ensure_item_removal_schema(connection):
    global _item_removal_ready
    if _item_removal_ready:
        return
    try:
        cursor = connection.cursor()
        for table in ITEM_TABLES_WITH_REMOVAL:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS is_removed TINYINT(1) NOT NULL DEFAULT 0")
        cursor.close()
        _item_removal_ready = True
    except Error as e:
        print(f"cobradb: could not add is_removed to the activity item tables: {e}")