import mysql.connector
from mysql.connector import Error

# Database Configuration
DB_HOST = "localhost"
DB_USER = "root"
DB_PASSWORD = ""          # Leave empty for default XAMPP/WAMP setup
DB_NAME = "cobra_db"

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