import os
import mysql.connector
from mysql.connector import Error

# Database Configuration
# Read from environment variables so production can use its own DB user.
# Defaults match a stock local XAMPP/WAMP setup, so no setup is needed locally.
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_NAME = os.environ.get("DB_NAME", "cobra_db")

def get_db_connection():
    """Establishes and returns a connection to the cobra_db database."""
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