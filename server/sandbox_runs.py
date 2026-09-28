"""
sandbox_runs.py - Coding Sandbox: Run History Log
------------------------------------------------------------------
Logs every time a learner clicks "Run Code" in the Coding Sandbox to
sandbox_runs_tbl - one row per execution. This is the "activity log"
counterpart to sandbox_snippets.py's small, curated "Your Saved
Snippets" library: it grows constantly and isn't shown as the main
list anywhere yet, but gives a foundation for a future run-history/
activity view.

Since code now runs entirely client-side via Pyodide (see
sandbox.js/runPythonCode), this is called AFTER a run already
finished, fire-and-forget from the frontend - it never gates, blocks,
or slows down the run itself, and a logging failure is never surfaced
to the learner as an error (see the /api/sandbox/log-run route in
learner_routes.py, which always responds success regardless of
whether log_run() below actually succeeded).

SCHEMA (sandbox_runs_tbl):
    run_id        INT AUTO_INCREMENT PRIMARY KEY
    acc_id        VARCHAR(15)
    snippet_id    INT NULL   - set only when the code that ran came
                               from a saved snippet; NULL for
                               freshly-typed, never-saved code
    code_content  LONGTEXT   - snapshot of exactly what ran
    output        LONGTEXT   - what the console showed
    status        VARCHAR(20) - 'success' or 'error'
    exec_time_ms  DECIMAL(10,3) NULL - how long the Python actually ran,
                               measured client-side in sandbox.js
                               (excludes Pyodide loading and time
                               paused on input()); NULL for runs
                               logged before this column existed
    run_at        DATETIME
"""

from mysql.connector import Error
from cobradb import get_db_connection

SANDBOX_RUNS_TABLE = "sandbox_runs_tbl"
MAX_CODE_LENGTH = 20000
MAX_OUTPUT_LENGTH = 20000
MAX_RUNS_PER_LEARNER = 200
MAX_EXEC_TIME_MS = 3600000  # 1 hour cap - keeps a bad value inside DECIMAL(10,3)

_table_ensured = False


def _clean_exec_time(value):
    """
    exec_time_ms comes from the browser, so never trust it as-is:
    anything that isn't a real, non-negative number becomes None
    (stored as NULL) instead of breaking the insert.
    """
    try:
        ms = float(value)
    except (TypeError, ValueError):
        return None
    if ms != ms or ms < 0:  # NaN or negative
        return None
    return round(min(ms, MAX_EXEC_TIME_MS), 3)


def _clean_snippet_id(value):
    """snippet_id must be a positive int or None (unsaved code)."""
    try:
        snippet_id = int(value)
    except (TypeError, ValueError):
        return None
    return snippet_id if snippet_id > 0 else None


def _ensure_table(connection):
    """
    Creates sandbox_runs_tbl if it doesn't exist yet. Safe to call
    repeatedly (IF NOT EXISTS), gated behind a module-level flag so it
    only round-trips to the database once per process lifetime - see
    sandbox_snippets._ensure_table()'s identical convention.
    """
    global _table_ensured
    if _table_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {SANDBOX_RUNS_TABLE} (
                run_id INT AUTO_INCREMENT PRIMARY KEY,
                acc_id VARCHAR(15) NOT NULL,
                snippet_id INT NULL,
                code_content LONGTEXT NULL,
                output LONGTEXT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'success',
                exec_time_ms DECIMAL(10,3) NULL DEFAULT NULL,
                run_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_sandbox_runs_acc_id (acc_id)
            )
            """
        )
        connection.commit()
        cursor.close()
        _table_ensured = True
    except Error as e:
        print(f"sandbox_runs: failed to ensure table exists: {e}")


def log_run(acc_id, code, output, status, snippet_id=None, exec_time_ms=None):
    """
    Records one Run Code execution. Best-effort by design - see module
    docstring for why a failure here never surfaces to the learner.

    Returns True/False purely for the caller's own logging/debugging;
    the HTTP route ignores this and always responds success.
    """
    if not acc_id:
        return False

    connection = get_db_connection()
    if connection is None:
        return False

    try:
        _ensure_table(connection)
        cursor = connection.cursor()

        code = (code or "")[:MAX_CODE_LENGTH]
        output = (output or "")[:MAX_OUTPUT_LENGTH]
        status = status if status in ("success", "error") else "success"
        snippet_id = _clean_snippet_id(snippet_id)
        exec_time_ms = _clean_exec_time(exec_time_ms)

        cursor.execute(
            f"""
            INSERT INTO {SANDBOX_RUNS_TABLE} (acc_id, snippet_id, code_content, output, status, exec_time_ms, run_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            """,
            (acc_id, snippet_id, code, output, status, exec_time_ms)
        )
        connection.commit()

        # Task: keep this activity log from growing unbounded per
        # learner - quietly drop their oldest runs beyond
        # MAX_RUNS_PER_LEARNER.
        cursor.execute(
            f"SELECT run_id FROM {SANDBOX_RUNS_TABLE} WHERE acc_id = %s ORDER BY run_at DESC, run_id DESC LIMIT 1000",
            (acc_id,)
        )
        all_ids = [row[0] for row in cursor.fetchall()]
        stale_ids = all_ids[MAX_RUNS_PER_LEARNER:]
        if stale_ids:
            placeholders = ",".join(["%s"] * len(stale_ids))
            cursor.execute(
                f"DELETE FROM {SANDBOX_RUNS_TABLE} WHERE run_id IN ({placeholders})",
                tuple(stale_ids)
            )
            connection.commit()

        cursor.close()
        return True
    except Error as e:
        print(f"sandbox_runs: failed to log run: {e}")
        return False
    finally:
        if connection.is_connected():
            connection.close()