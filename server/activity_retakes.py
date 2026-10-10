"""
activity_retakes.py - Module 85% gate: retake rounds for the three games
------------------------------------------------------------------------------
A module passes when every lesson in it is completed AND the average of
its lessons' performance % is at least PASS_PERCENT (80). Below that, the
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
PASS_PERCENT = 80   # the module pass mark (was 85). The ONE place it is set: the gate, the
                    # Lessons page, the Summary and the retake prompts all read this value.

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
# "incorrect" too (adviser's rule): a wrong answer moves on - the first
# answer is what counts, and the miss is fixed in the next retake round.
DONE_STATUSES = ("correct", "close", "incorrect", "skipped")

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
            # feat/question-pool-draw: answers given in a play (see game_plays.py)
            cursor.execute(
                f"ALTER TABLE {answers_table} ADD COLUMN IF NOT EXISTS play_id INT(10) DEFAULT NULL"
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
        f"SELECT {id_col} AS item_id FROM {items_table} WHERE la_id = %s AND is_removed = 0 ORDER BY {order_by}",
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
            WHERE acc_id = %s AND attempt_number = 1 AND status = 'correct' AND play_id IS NULL
              AND {id_col} IN ({placeholders})""",
        params
    )
    passed = {_row_value(r, "item_id") for r in cursor.fetchall()}

    cursor.execute(
        f"""SELECT a.{id_col} AS item_id
            FROM {answers_table} a
            JOIN (SELECT MIN(answer_id) AS first_id
                  FROM {answers_table}
                  WHERE acc_id = %s AND retake_id IS NOT NULL AND play_id IS NULL
                    AND {id_col} IN ({placeholders})
                  GROUP BY retake_id, {id_col}) f ON a.answer_id = f.first_id
            WHERE a.status = 'correct'""",
        params
    )
    passed |= {_row_value(r, "item_id") for r in cursor.fetchall()}
    return passed


# ---------------- feat/question-pool-draw: standing per DRAWN slots ----------------
# Since the pool + draw release, an activity is scored on the questions the
# learner's FIRST PLAY drew (5), not on the whole pool (50):
#     slots    = items drawn in the first play
#     passed   = correct in the first play + correct answers in retake plays
#                (each correct retake answer turns one missed slot into passed)
#     missed   = slots - passed
# Learners who played before the release ("legacy": answers with no play,
# no first play row) keep their old answers, scored on DRAW_SIZE slots too:
# passed = old first-try correct + retake corrects (passed_item_ids), max 5.
PLAYS_TABLE = "activity_plays_tbl"
PLAY_ITEMS_TABLE = "activity_play_items_tbl"
DRAW_SIZE = 5


def _plays_exist(cursor):
    cursor.execute("SHOW TABLES LIKE %s", (PLAYS_TABLE,))
    found = cursor.fetchone() is not None
    return found


def _first_play_items(cursor, acc_id, la_id):
    """[(item_id, outcome)] of the learner's first play (None when there is none)."""
    if not _plays_exist(cursor):
        return None
    cursor.execute(
        f"""SELECT play_id FROM {PLAYS_TABLE}
            WHERE acc_id = %s AND la_id = %s AND play_kind = 'first'
            ORDER BY play_id ASC LIMIT 1""",
        (acc_id, la_id)
    )
    row = cursor.fetchone()
    if not row:
        return None
    play_id = _row_value(row, "play_id")
    cursor.execute(
        f"""SELECT item_id, outcome FROM {PLAY_ITEMS_TABLE}
            WHERE play_id = %s AND (outcome IS NULL OR outcome <> 'replaced')
            ORDER BY position ASC, play_item_id ASC""",
        (play_id,)
    )
    out = []
    for r in cursor.fetchall():
        out.append((_row_value(r, "item_id"), r["outcome"] if isinstance(r, dict) else r[1]))
    return out


def _retake_correct(cursor, acc_id, la_id):
    if not _plays_exist(cursor):
        return 0
    cursor.execute(
        f"""SELECT COUNT(*) AS cnt FROM {PLAY_ITEMS_TABLE} pi
            JOIN {PLAYS_TABLE} p ON p.play_id = pi.play_id
            WHERE p.acc_id = %s AND p.la_id = %s AND p.play_kind = 'retake' AND pi.outcome = 'correct'""",
        (acc_id, la_id)
    )
    return _row_value(cursor.fetchone(), "cnt") or 0


def _has_legacy_answers(cursor, acc_id, activity_type, item_ids):
    if not item_ids:
        return False
    answers_table, id_col, _, _ = GAME_TABLES[activity_type]
    placeholders = ",".join(["%s"] * len(item_ids))
    cursor.execute(
        f"SELECT 1 FROM {answers_table} WHERE acc_id = %s AND play_id IS NULL AND {id_col} IN ({placeholders}) LIMIT 1",
        tuple([acc_id] + list(item_ids))
    )
    return cursor.fetchone() is not None


def activity_standing(cursor, acc_id, activity_type, la_id):
    """
    {"model": "pool"|"legacy"|"new", "slots", "passed", "missed",
     "first_correct", "first_answered", "first_missed_ids"} for one learner
    and one activity. "new" = not played yet (slots = what the draw will give).
    """
    if activity_type not in GAME_TABLES:
        return {"model": "none", "slots": 0, "passed": 0, "missed": 0, "first_correct": 0,
                "first_answered": 0, "first_missed_ids": []}
    first = _first_play_items(cursor, acc_id, la_id)
    retake_correct = _retake_correct(cursor, acc_id, la_id)
    if first is not None:
        slots = len(first)
        first_correct = sum(1 for _i, o in first if o == "correct")
        passed = min(slots, first_correct + retake_correct)
        return {
            "model": "pool", "slots": slots, "passed": passed, "missed": slots - passed,
            "first_correct": first_correct,
            "first_answered": sum(1 for _i, o in first if o is not None),
            "first_missed_ids": [i for i, o in first if o is not None and o != "correct"],
        }
    item_ids = item_ids_for_activity(cursor, activity_type, la_id)
    if not _has_legacy_answers(cursor, acc_id, activity_type, item_ids):
        slots = min(DRAW_SIZE, len(item_ids))
        return {"model": "new", "slots": slots, "passed": 0, "missed": slots, "first_correct": 0,
                "first_answered": 0, "first_missed_ids": []}
    # Answered before the pool + draw release: scored on DRAW_SIZE (5) slots
    # like everyone else - was the whole pool, so every question added later
    # (and never seen) counted as missed and a retake could hold 47 questions.
    passed_set = passed_item_ids(cursor, acc_id, activity_type, item_ids)
    first_ok = _first_try_correct_ids(cursor, acc_id, activity_type, item_ids)
    answered = _first_answered_ids(cursor, acc_id, activity_type, item_ids)
    slots = min(DRAW_SIZE, len(item_ids))
    passed = min(slots, len(passed_set) + retake_correct)
    return {
        "model": "legacy", "slots": slots, "passed": passed, "missed": slots - passed,
        "first_correct": min(slots, len(first_ok)),
        "first_answered": min(slots, len(answered)),
        # only questions really answered wrong - never the unseen ones
        "first_missed_ids": [i for i in item_ids if i in answered and i not in first_ok],
    }


def _first_try_correct_ids(cursor, acc_id, activity_type, item_ids):
    answers_table, id_col, _, _ = GAME_TABLES[activity_type]
    placeholders = ",".join(["%s"] * len(item_ids))
    cursor.execute(
        f"""SELECT DISTINCT {id_col} AS item_id FROM {answers_table}
            WHERE acc_id = %s AND attempt_number = 1 AND status = 'correct' AND play_id IS NULL
              AND {id_col} IN ({placeholders})""",
        tuple([acc_id] + list(item_ids))
    )
    return {_row_value(r, "item_id") for r in cursor.fetchall()}


def _first_answered_ids(cursor, acc_id, activity_type, item_ids):
    answers_table, id_col, _, _ = GAME_TABLES[activity_type]
    placeholders = ",".join(["%s"] * len(item_ids))
    cursor.execute(
        f"""SELECT DISTINCT {id_col} AS item_id FROM {answers_table}
            WHERE acc_id = %s AND attempt_number = 1 AND play_id IS NULL AND {id_col} IN ({placeholders})""",
        tuple([acc_id] + list(item_ids))
    )
    return {_row_value(r, "item_id") for r in cursor.fetchall()}


def first_play_missed_ids(cursor, acc_id, activity_type, la_id):
    """Items missed in the FIRST play - weak-spot analysis; retakes never change it."""
    return activity_standing(cursor, acc_id, activity_type, la_id)["first_missed_ids"]


def missed_item_ids(cursor, acc_id, activity_type, la_id):
    """
    (missed ids, slots): the first play's missed items still not made up by
    retakes (len = missed slots), and the activity's slot count. Used for
    tracking (mentor recommendations resolve as retakes fix slots).
    """
    standing = activity_standing(cursor, acc_id, activity_type, la_id)
    ids = standing["first_missed_ids"][:standing["missed"]]
    return ids, standing["slots"]


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