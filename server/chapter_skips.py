"""
chapter_skips.py - Skippable chapters (feat/skippable-chapter)
------------------------------------------------------------------------------
A mentor / admin can mark a chapter as Skippable (Manage Course / Publishing
> Edit Chapter). A learner who already knows that chapter (e.g. "Getting
started" - they already have Python installed) can then skip it:

  - the chapters after it unlock (the chapter gate treats a skipped chapter
    like a passed one),
  - the chapter itself is NOT marked completed - it shows "Skipped", its
    lessons stay at 0%, and no lesson / chapter badges are earned from it,
  - a skipped chapter does not block the Certificate,
  - the learner can still open and read it; once every module in it is
    passed it simply shows "Completed" again.

Turning Skippable OFF later only hides the skip option: learners who
already skipped stay skipped, so nobody is suddenly locked out.

Tables (created lazily here; same DDL as
database/migrations/2026-10-skippable-chapter.sql):
    category_tbl.is_skippable   TINYINT(1) NOT NULL DEFAULT 0
    category_tbl.skip_question  VARCHAR(255) NULL   (NULL = DEFAULT_SKIP_QUESTION)
    learner_chapter_skips_tbl   acc_id + cat_id (unique), skipped_at

Readers never raise: if the columns / table are missing (migration not run
yet and the lazy ensure failed) nothing is skippable and nothing is skipped,
which is exactly how the course behaved before this feature.
No Flask code here.
"""

from mysql.connector import Error

CATEGORY_TABLE = "category_tbl"
SKIPS_TABLE = "learner_chapter_skips_tbl"
DEFAULT_SKIP_QUESTION = "Do you already have Python installed on your computer?"
SKIP_QUESTION_MAX = 255

_schema_ready = False   # checked once per server start


def ensure_chapter_skip_schema(connection):
    """Adds the two category_tbl columns and the skips table if missing. DDL - call before any write."""
    global _schema_ready
    if _schema_ready:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(f"SHOW COLUMNS FROM {CATEGORY_TABLE} LIKE 'is_skippable'")
        if cursor.fetchone() is None:
            cursor.execute(f"ALTER TABLE {CATEGORY_TABLE} ADD COLUMN is_skippable TINYINT(1) NOT NULL DEFAULT 0")
        cursor.execute(f"SHOW COLUMNS FROM {CATEGORY_TABLE} LIKE 'skip_question'")
        if cursor.fetchone() is None:
            cursor.execute(f"ALTER TABLE {CATEGORY_TABLE} ADD COLUMN skip_question VARCHAR(255) DEFAULT NULL")
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {SKIPS_TABLE} (
                    skip_id INT(10) NOT NULL AUTO_INCREMENT,
                    acc_id VARCHAR(15) NOT NULL,
                    cat_id INT(10) NOT NULL,
                    skipped_at DATETIME NOT NULL,
                    PRIMARY KEY (skip_id),
                    UNIQUE KEY uq_chapter_skip (acc_id, cat_id),
                    KEY idx_chapter_skip_cat (cat_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        connection.commit()
        cursor.close()
        _schema_ready = True
    except Error as e:
        print(f"chapter_skips: could not prepare the skippable-chapter schema: {e}")


def skipped_chapter_ids(cursor, acc_id):
    """Every chapter this learner has skipped (set of cat_id). Empty on any error."""
    try:
        cursor.execute(f"SELECT cat_id FROM {SKIPS_TABLE} WHERE acc_id = %s", (acc_id,))
        return {_first(row) for row in cursor.fetchall()}
    except Error:
        return set()


def skipped_at_by_learner(cursor, acc_ids):
    """{acc_id: {cat_id: skipped_at}} for the given learners (Learner Progress). Empty on any error."""
    acc_ids = list(acc_ids)
    if not acc_ids:
        return {}
    try:
        placeholders = ", ".join(["%s"] * len(acc_ids))
        cursor.execute(
            f"SELECT acc_id, cat_id, skipped_at FROM {SKIPS_TABLE} WHERE acc_id IN ({placeholders})",
            tuple(acc_ids)
        )
        result = {}
        for row in cursor.fetchall():
            acc_id, cat_id, skipped_at = row if not isinstance(row, dict) else (
                row["acc_id"], row["cat_id"], row["skipped_at"])
            result.setdefault(acc_id, {})[cat_id] = skipped_at
        return result
    except Error:
        return {}


def chapter_skip_settings(cursor, cat_id):
    """{"is_skippable": bool, "skip_question": str (never empty)} - Off on any error."""
    settings = {"is_skippable": False, "skip_question": DEFAULT_SKIP_QUESTION}
    try:
        cursor.execute(
            f"SELECT is_skippable, skip_question FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        row = cursor.fetchone()
    except Error:
        return settings
    if row:
        if isinstance(row, dict):
            row = (row["is_skippable"], row["skip_question"])
        settings["is_skippable"] = bool(row[0])
        settings["skip_question"] = (row[1] or "").strip() or DEFAULT_SKIP_QUESTION
    return settings


def skippable_chapter_ids(cursor):
    """Every chapter whose Skippable switch is ON (set of cat_id). Empty on any error."""
    try:
        cursor.execute(f"SELECT cat_id FROM {CATEGORY_TABLE} WHERE is_skippable = 1")
        return {_first(row) for row in cursor.fetchall()}
    except Error:
        return set()


def save_chapter_skip_settings(connection, cat_id, is_skippable, skip_question):
    """
    Mentor / admin: turn Skippable on or off for one chapter.
    Returns (success, message, changes) - changes is a short text for the
    Activity Log ("" when nothing changed).
    """
    question = (skip_question or "").strip()
    if len(question) > SKIP_QUESTION_MAX:
        return False, f"The skip question can be at most {SKIP_QUESTION_MAX} characters.", ""
    # The default question is stored as NULL, so a later change of the
    # default reaches every chapter that never had its own question.
    stored_question = None if question in ("", DEFAULT_SKIP_QUESTION) else question

    ensure_chapter_skip_schema(connection)
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT is_skippable, skip_question FROM {CATEGORY_TABLE} WHERE cat_id = %s", (cat_id,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, "Chapter not found.", ""
        old_on, old_question = bool(row[0]), row[1]

        changes = []
        if old_on != bool(is_skippable):
            changes.append(f"Skippable turned {'ON' if is_skippable else 'OFF'}")
        if (old_question or None) != stored_question:
            changes.append(f"Skip question: \"{stored_question or DEFAULT_SKIP_QUESTION}\"")
        if not changes:
            cursor.close()
            return True, "No changes.", ""

        cursor.execute(
            f"UPDATE {CATEGORY_TABLE} SET is_skippable = %s, skip_question = %s WHERE cat_id = %s",
            (1 if is_skippable else 0, stored_question, cat_id)
        )
        connection.commit()
        cursor.close()
        return True, "Skip settings saved.", "; ".join(changes)
    except Error as e:
        connection.rollback()
        print(f"chapter_skips: failed to save skip settings for cat_id={cat_id}: {e}")
        return False, "Could not save the skip settings.", ""


def record_skip(cursor, acc_id, cat_id):
    """Saves the learner's skip. Skipping twice changes nothing (the first date stays)."""
    cursor.execute(
        f"INSERT IGNORE INTO {SKIPS_TABLE} (acc_id, cat_id, skipped_at) VALUES (%s, %s, NOW())",
        (acc_id, cat_id)
    )


def _first(row):
    return list(row.values())[0] if isinstance(row, dict) else row[0]
