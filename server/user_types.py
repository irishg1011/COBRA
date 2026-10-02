"""
user_types.py - usertype_tbl lookups (feat/mentor-role)
-------------------------------------------------------
usertype_tbl ships with (1, 'Admin') and (2, 'Learner'). The 'Mentor'
row is added here by ensure_mentor_user_type() - idempotent (checked by
name first) and run once per process, the same pattern as the other
ensure_* helpers (e.g. learning_activities.ensure_activity_types()).

Roles are always matched BY NAME. The Mentor ut_id is whatever
AUTO_INCREMENT gave it, so nothing here ever hardcodes a number.

    get_user_type_id(connection, name)  -> ut_id or None
    get_account_role(acc_id)            -> (role name or None, ok)
"""

from mysql.connector import Error

from cobradb import get_db_connection

USERTYPE_TABLE = "usertype_tbl"
ACCOUNT_TABLE = "account_tbl"

ADMIN_ROLE = "Admin"
MENTOR_ROLE = "Mentor"
LEARNER_ROLE = "Learner"
STAFF_ROLES = (ADMIN_ROLE, MENTOR_ROLE)

_mentor_type_ensured = False


def ensure_mentor_user_type(connection):
    """Inserts the 'Mentor' row into usertype_tbl if it isn't there yet."""
    global _mentor_type_ensured
    if _mentor_type_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(f"SELECT ut_id FROM {USERTYPE_TABLE} WHERE u_type = %s", (MENTOR_ROLE,))
        if cursor.fetchone() is None:
            cursor.execute(f"INSERT INTO {USERTYPE_TABLE} (u_type) VALUES (%s)", (MENTOR_ROLE,))
            connection.commit()
        cursor.close()
        _mentor_type_ensured = True
    except Error as e:
        print(f"user_types: failed to seed {MENTOR_ROLE} in {USERTYPE_TABLE}: {e}")


def get_user_type_id(connection, role_name):
    """ut_id for a role name ('Admin' / 'Mentor' / 'Learner'), or None."""
    ensure_mentor_user_type(connection)
    cursor = connection.cursor()
    cursor.execute(f"SELECT ut_id FROM {USERTYPE_TABLE} WHERE u_type = %s", (role_name,))
    row = cursor.fetchone()
    cursor.close()
    return row[0] if row else None


def get_account_role(acc_id):
    """
    The account's CURRENT role name, read from the database on every
    call (never cached, never taken from the session).

    Returns (role, ok): ok is False only on a database problem, so the
    caller can tell "no such / archived account" (None, True) from
    "couldn't check right now" (None, False).
    """
    if not acc_id:
        return None, True
    connection = get_db_connection()
    if connection is None:
        return None, False
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""SELECT ut.u_type
                FROM {ACCOUNT_TABLE} a
                JOIN {USERTYPE_TABLE} ut ON a.u_type = ut.ut_id
                WHERE a.acc_id = %s AND (a.is_deleted = 0 OR a.is_deleted IS NULL)""",
            (acc_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        return (row[0] if row else None), True
    except Error as e:
        print(f"user_types: failed to load role for {acc_id}: {e}")
        return None, False
    finally:
        if connection.is_connected():
            connection.close()
