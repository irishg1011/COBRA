"""
sandbox_snippets.py - Coding Sandbox: Save Code to the Learner's Account
--------------------------------------------------------------------------------------
Backs the "Save Code" button and "Your Saved Snippets" panel on the
learner-side Coding Sandbox (learner/html/sandbox.html). Persists code
against the LOGGED-IN LEARNER'S OWN acc_id - never to the local
filesystem/file explorer.

SCHEMA (sandbox_snippets_tbl) - finalized as:
    snippet_id    INT AUTO_INCREMENT PRIMARY KEY
    acc_id        VARCHAR(15)
    title         VARCHAR(255)   - auto-derived from the code's first line
    code_content  LONGTEXT
    created_at    DATETIME
    updated_at    DATETIME NULL  - set only once a snippet is re-saved

This file ONLY ever ensures those columns exist (via idempotent "ADD
COLUMN IF NOT EXISTS", never destructive) and never touches any other
column on this table - in particular, it does not read, write, or
attempt to migrate/drop any earlier "label"/"code" columns some
installs may still have lying around; those are left entirely alone
for manual cleanup.

UPDATE-IN-PLACE: save_snippet() takes an optional snippet_id. When
given (the learner loaded an existing saved snippet, then hit Save
Code again), it UPDATEs that same row instead of inserting a new one -
this is what keeps re-saving from creating duplicate rows for what's
really the same snippet, edited.
"""

from mysql.connector import Error
from cobradb import get_db_connection

SANDBOX_SNIPPETS_TABLE = "sandbox_snippets_tbl"
MAX_SNIPPETS_PER_LEARNER = 50
MAX_CODE_LENGTH = 20000

_table_ensured = False


def _ensure_table(connection):
    """
    Creates sandbox_snippets_tbl if it doesn't exist yet, and ensures
    the columns THIS file actually uses (title, code_content,
    updated_at) are present - via "ADD COLUMN IF NOT EXISTS", which is
    a no-op if they're already there. Never touches any other column.
    Gated behind a module-level flag so it only round-trips to the
    database once per process lifetime.
    """
    global _table_ensured
    if _table_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {SANDBOX_SNIPPETS_TABLE} (
                snippet_id INT AUTO_INCREMENT PRIMARY KEY,
                acc_id VARCHAR(15) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_sandbox_snippets_acc_id (acc_id)
            )
            """
        )
        cursor.execute(
            f"ALTER TABLE {SANDBOX_SNIPPETS_TABLE} ADD COLUMN IF NOT EXISTS title VARCHAR(255) NOT NULL DEFAULT ''"
        )
        cursor.execute(
            f"ALTER TABLE {SANDBOX_SNIPPETS_TABLE} ADD COLUMN IF NOT EXISTS code_content LONGTEXT NULL"
        )
        cursor.execute(
            f"ALTER TABLE {SANDBOX_SNIPPETS_TABLE} ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL"
        )
        connection.commit()
        cursor.close()
        _table_ensured = True
    except Error as e:
        print(f"sandbox_snippets: failed to ensure table exists: {e}")


def _derive_title(code):
    for line in (code or "").split("\n"):
        stripped = line.strip()
        if stripped:
            return stripped[:255]
    return "Untitled snippet"


def save_snippet(acc_id, code, snippet_id=None):
    """
    Saves code against this learner's account.
      - If snippet_id is given AND actually belongs to this learner,
        UPDATES that row's title/code_content/updated_at in place.
      - Otherwise, INSERTS a brand new snippet.

    Returns (success: bool, snippet: dict | None, message: str)
    """
    if not acc_id:
        return False, None, "Not logged in."

    code = code if isinstance(code, str) else ("" if code is None else str(code))
    if len(code) > MAX_CODE_LENGTH:
        return False, None, f"Code is too long to save (max {MAX_CODE_LENGTH} characters)."

    connection = get_db_connection()
    if connection is None:
        return False, None, "Could not connect to the database."

    try:
        _ensure_table(connection)
        cursor = connection.cursor(dictionary=True)
        title = _derive_title(code)

        target_id = None
        if snippet_id:
            cursor.execute(
                f"SELECT snippet_id FROM {SANDBOX_SNIPPETS_TABLE} WHERE snippet_id = %s AND acc_id = %s",
                (snippet_id, acc_id)
            )
            if cursor.fetchone():
                target_id = snippet_id

        if target_id:
            cursor.execute(
                f"""
                UPDATE {SANDBOX_SNIPPETS_TABLE}
                SET title = %s, code_content = %s, updated_at = NOW()
                WHERE snippet_id = %s
                """,
                (title, code, target_id)
            )
            connection.commit()
            new_id = target_id
        else:
            cursor.execute(
                f"""
                INSERT INTO {SANDBOX_SNIPPETS_TABLE} (acc_id, title, code_content, created_at)
                VALUES (%s, %s, %s, NOW())
                """,
                (acc_id, title, code)
            )
            new_id = cursor.lastrowid
            connection.commit()

            # Task: keep each learner's saved-snippet list from growing
            # unbounded - quietly drop their oldest saves beyond
            # MAX_SNIPPETS_PER_LEARNER rather than erroring the save out.
            cursor.execute(
                f"""
                SELECT snippet_id FROM {SANDBOX_SNIPPETS_TABLE}
                WHERE acc_id = %s ORDER BY created_at DESC, snippet_id DESC
                LIMIT 1000
                """,
                (acc_id,)
            )
            all_ids = [row["snippet_id"] for row in cursor.fetchall()]
            stale_ids = all_ids[MAX_SNIPPETS_PER_LEARNER:]
            if stale_ids:
                placeholders = ",".join(["%s"] * len(stale_ids))
                cursor.execute(
                    f"DELETE FROM {SANDBOX_SNIPPETS_TABLE} WHERE snippet_id IN ({placeholders})",
                    tuple(stale_ids)
                )
                connection.commit()

        cursor.execute(
            f"""
            SELECT snippet_id, title, code_content, created_at, updated_at
            FROM {SANDBOX_SNIPPETS_TABLE} WHERE snippet_id = %s
            """,
            (new_id,)
        )
        row = cursor.fetchone()
        cursor.close()

        return True, row, "Code saved to your account."

    except Error as e:
        connection.rollback()
        print(f"sandbox_snippets: failed to save snippet: {e}")
        return False, None, f"Database error while saving: {e}"
    finally:
        if connection.is_connected():
            connection.close()


def get_snippets_for_learner(acc_id):
    """
    Returns this learner's saved snippets, most recently touched
    first (a re-saved/updated snippet floats back to the top, same as
    a real "recently used" list).
    """
    if not acc_id:
        return []

    connection = get_db_connection()
    if connection is None:
        return []

    try:
        _ensure_table(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""
            SELECT snippet_id, title, code_content, created_at, updated_at
            FROM {SANDBOX_SNIPPETS_TABLE}
            WHERE acc_id = %s
            ORDER BY COALESCE(updated_at, created_at) DESC, snippet_id DESC
            LIMIT %s
            """,
            (acc_id, MAX_SNIPPETS_PER_LEARNER)
        )
        rows = cursor.fetchall()
        cursor.close()
        return rows
    except Error as e:
        print(f"sandbox_snippets: failed to load snippets: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


def get_snippet(acc_id, snippet_id):
    """
    Fetches one of THIS learner's own snippets by id - scoped to
    acc_id so a learner can never load another learner's saved code by
    guessing/incrementing an id.
    """
    if not acc_id or not snippet_id:
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        _ensure_table(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""
            SELECT snippet_id, title, code_content, created_at, updated_at
            FROM {SANDBOX_SNIPPETS_TABLE}
            WHERE snippet_id = %s AND acc_id = %s
            """,
            (snippet_id, acc_id)
        )
        row = cursor.fetchone()
        cursor.close()
        return row
    except Error as e:
        print(f"sandbox_snippets: failed to load snippet {snippet_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()