"""
learner_progress_unlocks.py - Task #13: Permanent Category Unlock Check
------------------------------------------------------------------------------
Pure DB-access helpers for learner_progress_unlocks_tbl (created manually
in Task #11 - no lazy ensure_* here, the table already exists). Backs the
"has this learner already reached this category?" check that replaces
learning_map_data()'s old pure live-recalculation.

Only 'category' is actually read/gated on today - modules have no live
lock check of their own to replace (see learning_map_data(): every module
in an unlocked category is freely browsable; only lessons WITHIN a module
are sequentially gated). has_unlock()/write_unlock() are written generic
(entity_type/entity_id) so a future module-level gate can reuse them with
zero changes here, but nothing calls them with entity_type='module' yet.

This file never touches Flask/session state directly - learner_routes.py
is the only place this gets turned into HTTP responses.
"""

from mysql.connector import Error

LEARNER_UNLOCKS_TABLE = "learner_progress_unlocks_tbl"


def has_unlock(connection, acc_id, entity_type, entity_id):
    """
    Returns True if a permanent unlock row already exists for this
    learner + entity_type + entity_id - i.e. they've already
    legitimately reached it, ever, regardless of what's changed since.

    Returns False (never raises) on any database error - callers should
    fail safe by falling back to the live recalculation, matching the
    exact behavior a learner with no row yet already gets.
    """
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""SELECT 1 FROM {LEARNER_UNLOCKS_TABLE}
                WHERE acc_id = %s AND entity_type = %s AND entity_id = %s
                LIMIT 1""",
            (acc_id, entity_type, entity_id)
        )
        row = cursor.fetchone()
        cursor.close()
        return row is not None
    except Error as e:
        print(f"learner_progress_unlocks: failed to check unlock for {acc_id}/{entity_type}/{entity_id}: {e}")
        return False


def get_unlocked_at(connection, acc_id, entity_type, entity_id):
    """
    Task #16: returns the datetime this learner first unlocked
    entity_type/entity_id, or None if they haven't (yet). Backs the
    "New"/catch-up badge - content created AFTER this timestamp is
    something the learner hasn't seen before, even in a category
    they've already passed.
    """
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""SELECT unlocked_at FROM {LEARNER_UNLOCKS_TABLE}
                WHERE acc_id = %s AND entity_type = %s AND entity_id = %s
                LIMIT 1""",
            (acc_id, entity_type, entity_id)
        )
        row = cursor.fetchone()
        cursor.close()
        return row[0] if row else None
    except Error as e:
        print(f"learner_progress_unlocks: failed to get unlocked_at for {acc_id}/{entity_type}/{entity_id}: {e}")
        return None


def write_unlock(connection, acc_id, entity_type, entity_id):
    """
    Writes a permanent unlock row the moment a learner is FIRST found
    to qualify via the live recalculation - so it never has to be
    recomputed again for them. INSERT IGNORE relies on
    learner_progress_unlocks_tbl's own uq_learner_unlock unique
    constraint - calling this on an entity the learner already has a
    row for is always a safe no-op, never a duplicate or an error.

    Best-effort: returns True/False, never raises. A failure here just
    means the live check runs again next page load - not a correctness
    problem, only a missed optimization for that one request.
    """
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""INSERT IGNORE INTO {LEARNER_UNLOCKS_TABLE}
                (acc_id, entity_type, entity_id, unlocked_at)
                VALUES (%s, %s, %s, NOW())""",
            (acc_id, entity_type, entity_id)
        )
        connection.commit()
        cursor.close()
        return True
    except Error as e:
        connection.rollback()
        print(f"learner_progress_unlocks: failed to write unlock for {acc_id}/{entity_type}/{entity_id}: {e}")
        return False