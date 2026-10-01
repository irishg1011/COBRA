"""
learning_time.py - Learner learning-time tracker (Profile "Total Hours")
-------------------------------------------------------------------------
There was no history of how long a learner has spent learning, so this
keeps one running total per learner, fed by a heartbeat that every
learner page sends once a minute while the tab is visible
(learner.js -> POST /api/profile/heartbeat).

Each beat adds the real time since the previous beat, capped at
MAX_BEAT_SECONDS, so a tab left open in the background or a laptop that
went to sleep can't add hours that weren't spent learning.

Table (created lazily; same DDL as sql/profile_badges.sql):
    learner_time_tbl (acc_id PK, total_seconds, last_beat_at)
"""

from datetime import datetime
from mysql.connector import Error

LEARNER_TIME_TABLE = "learner_time_tbl"
MAX_BEAT_SECONDS = 75   # heartbeat is every 60s; small grace for slow requests
MIN_BEAT_SECONDS = 20   # ignore duplicate beats (e.g. two open tabs)


def ensure_learning_time_schema(cursor):
    cursor.execute(
        f"""CREATE TABLE IF NOT EXISTS {LEARNER_TIME_TABLE} (
                acc_id VARCHAR(15) NOT NULL,
                total_seconds INT(10) NOT NULL DEFAULT 0,
                last_beat_at DATETIME NULL DEFAULT NULL,
                PRIMARY KEY (acc_id),
                CONSTRAINT fk_learner_time_acc FOREIGN KEY (acc_id)
                    REFERENCES account_tbl (acc_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
    )


def record_heartbeat(connection, acc_id):
    """Adds the time since this learner's last beat (capped). Returns total seconds."""
    cursor = connection.cursor(dictionary=True)
    try:
        ensure_learning_time_schema(cursor)
        now = datetime.now()
        cursor.execute(
            f"SELECT total_seconds, last_beat_at FROM {LEARNER_TIME_TABLE} WHERE acc_id = %s FOR UPDATE",
            (acc_id,)
        )
        row = cursor.fetchone()
        if row is None:
            # First beat ever: start the clock, nothing to add yet.
            cursor.execute(
                f"INSERT INTO {LEARNER_TIME_TABLE} (acc_id, total_seconds, last_beat_at) VALUES (%s, 0, %s)",
                (acc_id, now)
            )
            connection.commit()
            return 0

        total = int(row["total_seconds"] or 0)
        last = row["last_beat_at"]
        elapsed = (now - last).total_seconds() if last else 0

        if last is not None and elapsed < MIN_BEAT_SECONDS:
            connection.commit()
            return total  # duplicate beat - keep last_beat_at as is

        total += int(min(elapsed, MAX_BEAT_SECONDS)) if last else 0
        cursor.execute(
            f"UPDATE {LEARNER_TIME_TABLE} SET total_seconds = %s, last_beat_at = %s WHERE acc_id = %s",
            (total, now, acc_id)
        )
        connection.commit()
        return total
    except Error:
        connection.rollback()
        raise
    finally:
        cursor.close()


def get_total_seconds(cursor, acc_id):
    """cursor must be a dictionary cursor."""
    ensure_learning_time_schema(cursor)
    cursor.execute(f"SELECT total_seconds FROM {LEARNER_TIME_TABLE} WHERE acc_id = %s", (acc_id,))
    row = cursor.fetchone()
    return int(row["total_seconds"] or 0) if row else 0