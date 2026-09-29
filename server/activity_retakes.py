"""
activity_retakes.py - Module 85% gate: retake rounds for the three games
------------------------------------------------------------------------------
A module passes when every lesson in it is completed AND the average of
its lessons' performance % is at least PASS_PERCENT. Below that, the
learner retakes only the items they missed.

An item counts as PASSED when either:
  - its first attempt ever (attempt_number = 1) was 'correct', or
  - in some retake round, the FIRST answer given to it in that round
    was 'correct' (a Try Again that ends correct does not count - same
    rule as the first play).

One retake round = one activity_retakes_tbl row for one activity
(la_id), holding the list of items that were still missed when the
round started. Answers given during a round carry its retake_id in the
game's answers table; first-attempt rows are never touched, so the
diagnostic "first attempt" data stays exactly as it was.

The three game engines (lesson_activities.py, lesson_flashcards.py,
lesson_fill_blanks.py) switch to "retake mode" whenever an in-progress
round exists for the activity: they play only that round's items.

Pure DB helpers - never touches Flask. Schema is created lazily and
idempotently (ensure_retake_schema).
"""

from mysql.connector import Error

RETAKES_TABLE = "activity_retakes_tbl"
PASS_PERCENT = 85

MCQ_TYPE = "Multiple Choice"
FIB_TYPE = "Fill in the Blanks"
FLASHCARD_TYPE = "Flashcards"

# activity type -> (answers table, item id column, items table, item ORDER BY)
GAME_TABLES = {
    MCQ_TYPE: ("mcq_learner_answers_tbl", "q_id", "mcq_questions_tbl", "sort_order ASC, q_id ASC"),
    FIB_TYPE: ("fib_learner_answers_tbl", "fib_id", "fill_blanks_tbl", "sort_order ASC, fib_id ASC"),
    FLASHCARD_TYPE: ("flashcard_learner_answers_tbl", "flashcard_id", "flashcards_tbl", "flashcard_id ASC"),
}

# Statuses that move a game past an item (the item is "done" for position).
DONE_STATUSES = ("correct", "close", "skipped")

_retake_schema_ensured = False


def ensure_retake_schema(connection):
    """
    Lazily creates activity_retakes_tbl and adds a nullable retake_id
    column to the three answers tables (idempotent, once per process).
    CREATE/ALTER commit implicitly - run before writing on `connection`.
    """
    global _retake_schema_ensured
    if _retake_schema_ensured:
        return True
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {RETAKES_TABLE} (
                    retake_id INT(10) NOT NULL AUTO_INCREMENT,
                    acc_id VARCHAR(15) NOT NULL,
                    la_id INT(10) NOT NULL,
                    round_no INT(5) NOT NULL,
                    item_ids TEXT NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    started_at DATETIME NOT NULL,
                    completed_at DATETIME DEFAULT NULL,
                    PRIMARY KEY (retake_id),
                    KEY idx_retake_acc_la (acc_id, la_id),
                    KEY fk_retake_la_id (la_id),
                    CONSTRAINT fk_retake_account_id FOREIGN KEY (acc_id)
                        REFERENCES account_tbl (acc_id),
                    CONSTRAINT fk_retake_la_id FOREIGN KEY (la_id)
                        REFERENCES learning_activities_tbl (la_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        for answers_table, _, _, _ in GAME_TABLES.values():
            cursor.execute(
                f"ALTER TABLE {answers_table} ADD COLUMN IF NOT EXISTS retake_id INT(10) DEFAULT NULL"
            )
            cursor.execute(
                f"ALTER TABLE {answers_table} ADD INDEX IF NOT EXISTS idx_retake_id (retake_id)"
            )
        cursor.close()
        _retake_schema_ensured = True
        return True
    except Error as e:
        print(f"activity_retakes: failed to ensure retake schema: {e}")
        return False


def _ids_text(item_ids):
    return ",".join(str(int(i)) for i in item_ids)


def _parse_ids(text):
    out = []
    for part in (text or "").split(","):
        part = part.strip()
        if part.isdigit():
            out.append(int(part))
    return out


def item_ids_for_activity(cursor, activity_type, la_id):
    """Every item id of this activity, in the same order its game plays them."""
    if activity_type not in GAME_TABLES:
        return []
    _, id_col, items_table, order_by = GAME_TABLES[activity_type]
    cursor.execute(
        f"SELECT {id_col} AS item_id FROM {items_table} WHERE la_id = %s ORDER BY {order_by}",
        (la_id,)
    )
    return [_row_value(r, "item_id") for r in cursor.fetchall()]


def _row_value(row, key):
    return row[key] if isinstance(row, dict) else row[0]


def passed_item_ids(cursor, acc_id, activity_type, item_ids):
    """Items this learner has passed (first try correct, or first answer correct in a retake round)."""
    if activity_type not in GAME_TABLES or not item_ids:
        return set()
    answers_table, id_col, _, _ = GAME_TABLES[activity_type]
    placeholders = ",".join(["%s"] * len(item_ids))
    params = tuple([acc_id] + list(item_ids))

    cursor.execute(
        f"""SELECT DISTINCT {id_col} AS item_id FROM {answers_table}
            WHERE acc_id = %s AND attempt_number = 1 AND status = 'correct'
              AND {id_col} IN ({placeholders})""",
        params
    )
    passed = {_row_value(r, "item_id") for r in cursor.fetchall()}

    cursor.execute(
        f"""SELECT a.{id_col} AS item_id
            FROM {answers_table} a
            JOIN (SELECT MIN(answer_id) AS first_id
                  FROM {answers_table}
                  WHERE acc_id = %s AND retake_id IS NOT NULL AND {id_col} IN ({placeholders})
                  GROUP BY retake_id, {id_col}) f ON a.answer_id = f.first_id
            WHERE a.status = 'correct'""",
        params
    )
    passed |= {_row_value(r, "item_id") for r in cursor.fetchall()}
    return passed


def missed_item_ids(cursor, acc_id, activity_type, la_id):
    """Items of this activity (in play order) the learner still has to retake."""
    item_ids = item_ids_for_activity(cursor, activity_type, la_id)
    passed = passed_item_ids(cursor, acc_id, activity_type, item_ids)
    return [i for i in item_ids if i not in passed], len(item_ids)


def open_retake(cursor, acc_id, la_id, lock=True):
    """The learner's in-progress retake round for this activity, or None."""
    cursor.execute(
        f"""SELECT retake_id, round_no, item_ids FROM {RETAKES_TABLE}
            WHERE acc_id = %s AND la_id = %s AND status = 'in_progress'
            ORDER BY retake_id DESC LIMIT 1{' FOR UPDATE' if lock else ''}""",
        (acc_id, la_id)
    )
    row = cursor.fetchone()
    if not row:
        return None
    if not isinstance(row, dict):
        row = {"retake_id": row[0], "round_no": row[1], "item_ids": row[2]}
    return {
        "retake_id": row["retake_id"],
        "round_no": row["round_no"],
        "item_ids": _parse_ids(row["item_ids"]),
    }


def create_retake(cursor, acc_id, la_id, item_ids):
    """Starts the next retake round for this activity with `item_ids`."""
    cursor.execute(
        f"SELECT COALESCE(MAX(round_no), 0) AS last_round FROM {RETAKES_TABLE} WHERE acc_id = %s AND la_id = %s",
        (acc_id, la_id)
    )
    row = cursor.fetchone()
    round_no = (_row_value(row, "last_round") or 0) + 1
    cursor.execute(
        f"""INSERT INTO {RETAKES_TABLE} (acc_id, la_id, round_no, item_ids, status, started_at)
            VALUES (%s, %s, %s, %s, 'in_progress', NOW())""",
        (acc_id, la_id, round_no, _ids_text(item_ids))
    )
    return {"retake_id": cursor.lastrowid, "round_no": round_no, "item_ids": list(item_ids)}


def complete_retake(cursor, retake_id):
    cursor.execute(
        f"UPDATE {RETAKES_TABLE} SET status = 'completed', completed_at = NOW() WHERE retake_id = %s",
        (retake_id,)
    )


def retake_progress(cursor, acc_id, activity_type, retake):
    """
    (done_ids, fixed_ids) for this round:
      done_ids   items the game has moved past in this round (correct/close/skipped)
      fixed_ids  items whose FIRST answer in this round was 'correct'
    """
    answers_table, id_col, _, _ = GAME_TABLES[activity_type]
    cursor.execute(
        f"""SELECT {id_col} AS item_id, status FROM {answers_table}
            WHERE acc_id = %s AND retake_id = %s
            ORDER BY answer_id ASC""",
        (acc_id, retake["retake_id"])
    )
    done, fixed, seen = set(), set(), set()
    for r in cursor.fetchall():
        item_id = _row_value(r, "item_id")
        status = r["status"] if isinstance(r, dict) else r[1]
        if item_id not in seen:
            seen.add(item_id)
            if status == "correct":
                fixed.add(item_id)
        if status in DONE_STATUSES:
            done.add(item_id)
    return done, fixed


def retake_payload(retake, total, fixed_count, completed):
    """What the browser gets about the current round (None outside a retake)."""
    if not retake:
        return None
    return {
        "retake_id": retake["retake_id"],
        "round": retake["round_no"],
        "total": total,
        "fixed": fixed_count,
        "completed": bool(completed),
    }