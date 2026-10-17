"""
learner_tour.py - First-time user tour (feat/welcome-tour)
------------------------------------------------------------------------------
Remembers, per learner, which parts of the guided tour they already saw, so
each part shows ONCE (on any device) and the "?" button can replay it.

    Parts (TOUR_KEYS):
      welcome  - first login: Dashboard -> Learning Map -> Lessons page
      lesson   - the first time a lesson opens (video -> reading -> ...)
      game     - the first time a game's "Ready to play?" card shows (lives, timer, leaving)
      sandbox  - the first time the Coding Sandbox opens

    learner_tour_tbl (created lazily; same DDL as
    database/migrations/2026-10-welcome-tour.sql)
      acc_id + tour_key (unique), status 'finished' | 'skipped', updated_at

A replay from the "?" button never writes anything. Skipping a part is
final for that part only (the other parts still show once).

    tour_status(cursor, acc_id)            {tour_key: status}
    save_tour_status(connection, ...)      first answer wins, except a later
                                           'finished' replaces 'skipped'
    tour_summary(cursor)                   admin: finished / skipped / not seen
                                           per part, learners only
No Flask code here.
"""

from mysql.connector import Error

TOUR_TABLE = "learner_tour_tbl"
TOUR_KEYS = ("welcome", "lesson", "game", "sandbox")
TOUR_LABELS = {
    "welcome": "Welcome tour",
    "lesson": "Lesson tip",
    "game": "Game tip",
    "sandbox": "Sandbox tip",
}
STATUSES = ("finished", "skipped")

_schema_ready = False   # checked once per server start


def ensure_tour_schema(connection):
    """Creates learner_tour_tbl if missing. DDL - call before any write. Never raises."""
    global _schema_ready
    if _schema_ready:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {TOUR_TABLE} (
                    tour_id INT(10) NOT NULL AUTO_INCREMENT,
                    acc_id VARCHAR(15) NOT NULL,
                    tour_key VARCHAR(20) NOT NULL,
                    status VARCHAR(10) NOT NULL,
                    updated_at DATETIME NOT NULL,
                    PRIMARY KEY (tour_id),
                    UNIQUE KEY uq_learner_tour (acc_id, tour_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        connection.commit()
        cursor.close()
        _schema_ready = True
    except Error as e:
        print(f"learner_tour: could not prepare learner_tour_tbl: {e}")


def tour_status(cursor, acc_id):
    """{tour_key: 'finished' | 'skipped'} for the parts this learner already saw. Empty on any error."""
    try:
        cursor.execute(f"SELECT tour_key, status FROM {TOUR_TABLE} WHERE acc_id = %s", (acc_id,))
        rows = cursor.fetchall()
    except Error:
        return {}
    result = {}
    for row in rows:
        key, status = (row["tour_key"], row["status"]) if isinstance(row, dict) else row
        result[key] = status
    return result


def save_tour_status(connection, acc_id, tour_key, status):
    """
    Saves one part as finished / skipped. Returns (success, message).
    The first answer stays, except that 'finished' replaces an earlier
    'skipped' (the learner went back with "?" and watched it through).
    """
    if tour_key not in TOUR_KEYS:
        return False, "Unknown tour."
    if status not in STATUSES:
        return False, "Unknown status."
    ensure_tour_schema(connection)
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""INSERT INTO {TOUR_TABLE} (acc_id, tour_key, status, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON DUPLICATE KEY UPDATE
                    updated_at = IF(status = 'skipped' AND VALUES(status) = 'finished', NOW(), updated_at),
                    status = IF(status = 'skipped' AND VALUES(status) = 'finished', 'finished', status)""",
            (acc_id, tour_key, status)
        )
        connection.commit()
        cursor.close()
        return True, "Saved."
    except Error as e:
        connection.rollback()
        print(f"learner_tour: failed to save {tour_key}={status} for {acc_id}: {e}")
        return False, "Could not save."


def tour_summary(cursor):
    """
    Admin / mentor: how many LEARNERS finished, skipped or have not seen
    each part yet (deleted accounts left out).
      {"learners": n, "parts": [{"key", "label", "finished", "skipped", "not_seen"}]}
    """
    cursor.execute(
        """SELECT COUNT(*) AS n
           FROM account_tbl a JOIN usertype_tbl u ON a.u_type = u.ut_id
           WHERE u.u_type = 'Learner' AND COALESCE(a.is_deleted, 0) = 0"""
    )
    row = cursor.fetchone()
    learners = int((row["n"] if isinstance(row, dict) else row[0]) or 0)

    counts = {key: {"finished": 0, "skipped": 0} for key in TOUR_KEYS}
    try:
        cursor.execute(
            f"""SELECT t.tour_key, t.status, COUNT(*) AS n
                FROM {TOUR_TABLE} t
                JOIN account_tbl a ON a.acc_id = t.acc_id
                JOIN usertype_tbl u ON a.u_type = u.ut_id
                WHERE u.u_type = 'Learner' AND COALESCE(a.is_deleted, 0) = 0
                GROUP BY t.tour_key, t.status"""
        )
        for r in cursor.fetchall():
            key, status, n = (r["tour_key"], r["status"], r["n"]) if isinstance(r, dict) else r
            if key in counts and status in counts[key]:
                counts[key][status] = int(n)
    except Error:
        pass   # table not created yet: nobody has seen the tour

    parts = []
    for key in TOUR_KEYS:
        finished, skipped = counts[key]["finished"], counts[key]["skipped"]
        parts.append({
            "key": key,
            "label": TOUR_LABELS[key],
            "finished": finished,
            "skipped": skipped,
            "not_seen": max(0, learners - finished - skipped),
        })
    return {"learners": learners, "parts": parts}
