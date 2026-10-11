"""
progress_reset.py - Reset a learner's progress (feat/account-tools)
------------------------------------------------------------------------------
For testing: the learner's ACCOUNT stays (login, password, profile, photo,
consent, login history) and ALL their learning is erased, as if they had
just signed up. Learners only, admins only, and only while the admin
setting "Allow progress reset (testing)" is ON (account_tools).

Every row below is deleted WHERE acc_id = <learner>, in this order (child
rows before the rows they point to), in ONE transaction - either all of
it is erased or nothing is. A table the app has not created yet (they are
created lazily on first use) is simply skipped.

Lesson / chapter unlocks need no rebuilding: with no rows in
learner_progress_unlocks_tbl the learning map calculates unlocks live,
exactly like for a brand-new learner.

Not touched: account_tbl, profile_tbl, uploaded_images_tbl (photo),
consent_tbl, login/lockout/password-reset logs, staff tables, and
exercise_ai_verdicts_tbl (a shared cache with no learner column).
"""

from mysql.connector import Error

from cobradb import get_db_connection
from account_tools import ensure_account_tools_schema, log_action, setting_is_on, ALLOW_PROGRESS_RESET
from user_types import LEARNER_ROLE

LEARNING_NOTIFICATION_TYPES = ("badge", "chapter_done", "course_done", "module_passed", "retake", "review")

# (table, label shown to the admin, WHERE clause - always one %s = acc_id)
PROGRESS_TABLES = (
    ("activity_play_items_tbl", "Game play items",
     "play_id IN (SELECT play_id FROM activity_plays_tbl WHERE acc_id = %s)"),
    ("activity_leave_logs_tbl", "Left-page logs", "acc_id = %s"),
    ("activity_plays_tbl", "Game plays", "acc_id = %s"),
    ("activity_retakes_tbl", "Retake rounds", "acc_id = %s"),
    ("mcq_learner_answers_tbl", "Multiple choice answers", "acc_id = %s"),
    ("fib_learner_answers_tbl", "Fill in the blanks answers", "acc_id = %s"),
    ("flashcard_learner_answers_tbl", "Flashcard answers", "acc_id = %s"),
    ("mcq_activity_sessions_tbl", "Multiple choice sessions", "acc_id = %s"),
    ("flashcard_activity_sessions_tbl", "Flashcard sessions", "acc_id = %s"),
    ("learner_activity_progress_tbl", "Activity progress", "acc_id = %s"),
    ("exercise_submissions_tbl", "Coding exercise submissions", "acc_id = %s"),
    ("learner_exercise_progress_tbl", "Coding exercise progress", "acc_id = %s"),
    ("learner_exercise_draws_tbl", "Coding exercise draws", "acc_id = %s"),
    ("lesson_recommendations_tbl", "Recommendations", "acc_id = %s"),
    ("learner_resource_progress_tbl", "Lesson / video progress", "acc_id = %s"),
    ("learner_progress_unlocks_tbl", "Chapter unlocks", "acc_id = %s"),
    ("learner_lives_tbl", "Lives", "acc_id = %s"),
    ("fib_learner_lives_tbl", "Lives (old)", "acc_id = %s"),
    ("learner_badges_tbl", "Badges", "acc_id = %s"),
    ("certificates_tbl", "Certificate", "acc_id = %s"),
    ("learner_time_tbl", "Learning time", "acc_id = %s"),
    ("sandbox_runs_tbl", "Coding sandbox runs", "acc_id = %s"),
    ("sandbox_snippets_tbl", "Coding sandbox saved code", "acc_id = %s"),
    ("notifications_tbl", "Learning notifications",
     "acc_id = %s AND notif_type IN (" + ", ".join(f"'{t}'" for t in LEARNING_NOTIFICATION_TYPES) + ")"),
)

DISABLED_MESSAGE = "Progress reset is turned off. Turn on \"Allow progress reset (testing)\" first."


def _existing_tables(cursor):
    cursor.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()"
    )
    return {(row[0] if not isinstance(row, dict) else list(row.values())[0]).lower() for row in cursor.fetchall()}


def _learner(cursor, acc_id):
    """(account row or None). Only a non-archived Learner qualifies."""
    cursor.execute(
        """SELECT a.acc_id, a.username, ut.u_type AS role, a.is_deleted
           FROM account_tbl a LEFT JOIN usertype_tbl ut ON ut.ut_id = a.u_type
           WHERE a.acc_id = %s""",
        (acc_id,)
    )
    row = cursor.fetchone()
    if not row:
        return None
    return {"acc_id": row[0], "username": row[1], "role": row[2], "is_deleted": row[3]}


def preview_progress_reset(acc_id):
    """
    What a reset would erase: {"allowed", "message", "rows": [{"label", "count"}], "total"}.
    None if the database is unreachable.
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        ensure_account_tools_schema(connection)
        cursor = connection.cursor()
        learner = _learner(cursor, acc_id)
        if learner is None or learner["role"] != LEARNER_ROLE:
            cursor.close()
            return {"allowed": False, "message": "Only learner accounts can be reset.", "rows": [], "total": 0}
        existing = _existing_tables(cursor)
        rows, total = [], 0
        for table, label, where in PROGRESS_TABLES:
            if table not in existing:
                continue
            cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE {where}", (acc_id,))
            count = int(cursor.fetchone()[0] or 0)
            total += count
            rows.append({"label": label, "count": count})
        cursor.close()
        enabled = setting_is_on(ALLOW_PROGRESS_RESET)
        return {"allowed": enabled, "message": "" if enabled else DISABLED_MESSAGE,
                "rows": rows, "total": total, "acc_id": acc_id}
    except Error as e:
        print(f"progress_reset: failed to preview {acc_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def reset_learner_progress(acc_id, typed_acc_id, admin_id, ip_address=None):
    """
    Erases every learning row of one learner (see PROGRESS_TABLES).
    typed_acc_id must equal acc_id exactly - the admin's typed confirmation.
    Returns (success, message, deleted_rows).
    """
    acc_id = (acc_id or "").strip()
    if not acc_id or (typed_acc_id or "").strip() != acc_id:
        return False, "Type the account ID exactly to confirm.", 0
    if not setting_is_on(ALLOW_PROGRESS_RESET):
        return False, DISABLED_MESSAGE, 0

    connection = get_db_connection()
    if connection is None:
        return False, "Could not reach the database.", 0
    try:
        ensure_account_tools_schema(connection)
        cursor = connection.cursor()
        learner = _learner(cursor, acc_id)
        if learner is None:
            cursor.close()
            return False, "Account not found.", 0
        if learner["role"] != LEARNER_ROLE:
            cursor.close()
            return False, "Only learner accounts can be reset.", 0

        existing = _existing_tables(cursor)
        deleted, per_table = 0, []
        for table, label, where in PROGRESS_TABLES:
            if table not in existing:
                continue
            cursor.execute(f"DELETE FROM {table} WHERE {where}", (acc_id,))
            if cursor.rowcount:
                deleted += cursor.rowcount
                per_table.append(f"{label} {cursor.rowcount}")
        log_action(cursor, "progress_reset", acc_id, admin_id,
                   f"Deleted {deleted} rows" + (f": {', '.join(per_table)}" if per_table else ""), ip_address)
        connection.commit()
        cursor.close()
    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"progress_reset: failed to reset {acc_id}: {e}")
        return False, "Could not reset the progress - nothing was changed.", 0
    finally:
        if connection.is_connected():
            connection.close()

    # The learner stays signed in; their next page load shows the fresh start.
    return True, f"Progress reset - {deleted} rows erased. {learner['username']} starts from the beginning.", deleted
