"""
exercise_pool.py - Coding exercise pool: each learner gets ONE of the lesson's exercises
------------------------------------------------------------------------------
feat/exercise-pool

A lesson holds a pool of up to EXERCISE_POOL_MAX (5) coding exercises.
Each learner is given ONE of them, drawn the same way as the game
questions:

  1. When the learner reaches the lesson's exercise, they get one exercise
     they have not seen, picked at random (draw_exercise).
  2. The draw is saved (learner_exercise_draws_tbl), so leaving and coming
     back shows the same exercise.
  3. A retake draws another unseen exercise (retake_exercise).
  4. After all of them have been seen, the cycle starts over.

Leaving the page (feat/leave-detection, same rule as the games): first
leave during an exercise = a warning; from the second, the exercise is
replaced with an unseen one and the editor is cleared. Every leave goes to
the same log as the games (game_plays.LEAVES_TABLE).

Unchanged: grading (output match + required tags), tips, no timer, no
lives; for lesson performance the exercise is still ONE gradable item -
the learner's own exercise (assigned_exercise_id).

Learners who worked on the lesson's exercise before this release keep
it: their existing exercise becomes their draw.

Pure DB helpers + public entry points with their own connection.
"""

import random
from datetime import timedelta

from mysql.connector import Error
from cobradb import get_db_connection

DRAWS_TABLE = "learner_exercise_draws_tbl"
EXERCISE_POOL_MAX = 5
LEAVE_WARNING = ("You left the exercise page. Please stay on this page until you finish: "
                 "next time you leave, this exercise is replaced with a new one and your code is cleared.")
LEAVE_SWAP = "You left the exercise page again, so you have a new exercise and the editor was cleared."

_schema_ensured = False


def ensure_exercise_pool_schema(connection):
    """Idempotent, once per process. DDL commits implicitly - run before writes."""
    global _schema_ensured
    if _schema_ensured:
        return True
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {DRAWS_TABLE} (
                    draw_id INT(10) NOT NULL AUTO_INCREMENT,
                    acc_id VARCHAR(15) NOT NULL,
                    resource_id INT(10) NOT NULL,
                    exercise_id INT(10) NOT NULL,
                    draw_kind VARCHAR(10) NOT NULL DEFAULT 'first',
                    status VARCHAR(20) NOT NULL DEFAULT 'active',
                    leave_count TINYINT(3) NOT NULL DEFAULT 0,
                    away_since DATETIME DEFAULT NULL,
                    drawn_at DATETIME NOT NULL,
                    ended_at DATETIME DEFAULT NULL,
                    PRIMARY KEY (draw_id),
                    KEY idx_exdraw_acc_res (acc_id, resource_id),
                    KEY idx_exdraw_exercise (exercise_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        cursor.close()
        _schema_ensured = True
        return True
    except Error as e:
        print(f"exercise_pool: failed to ensure schema: {e}")
        return False


def published_exercise_ids(cursor, resource_id):
    """The lesson's Published, non-archived exercises (oldest first)."""
    cursor.execute(
        """SELECT ce.exercise_id
           FROM coding_exercises_tbl ce
           JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
           WHERE ce.resource_id = %s AND las.la_stats_name = 'Published'
             AND COALESCE(ce.is_archived, 0) = 0
           ORDER BY ce.exercise_id ASC""",
        (resource_id,)
    )
    return [_val(r, "exercise_id") for r in cursor.fetchall()]


def _val(row, key):
    return row[key] if isinstance(row, dict) else row[0]


def _table_ready(cursor):
    cursor.execute("SHOW TABLES LIKE %s", (DRAWS_TABLE,))
    return cursor.fetchone() is not None


def _active_draw(cursor, acc_id, resource_id, lock=False):
    cursor.execute(
        f"""SELECT draw_id, exercise_id, draw_kind, leave_count, away_since
            FROM {DRAWS_TABLE}
            WHERE acc_id = %s AND resource_id = %s AND status = 'active'
            ORDER BY draw_id DESC LIMIT 1{' FOR UPDATE' if lock else ''}""",
        (acc_id, resource_id)
    )
    row = cursor.fetchone()
    if row and not isinstance(row, dict):
        row = dict(zip(("draw_id", "exercise_id", "draw_kind", "leave_count", "away_since"), row))
    return row


def _legacy_exercise(cursor, acc_id, published):
    """The exercise this learner already worked on before the pool (latest touched)."""
    if not published:
        return None
    ph = ",".join(["%s"] * len(published))
    cursor.execute(
        f"""SELECT exercise_id FROM (
                SELECT exercise_id, MAX(submitted_at) AS at FROM exercise_submissions_tbl
                WHERE acc_id = %s AND exercise_id IN ({ph}) GROUP BY exercise_id
                UNION ALL
                SELECT exercise_id, MAX(completed_at) AS at FROM learner_exercise_progress_tbl
                WHERE acc_id = %s AND exercise_id IN ({ph}) GROUP BY exercise_id
            ) t ORDER BY at DESC LIMIT 1""",
        tuple([acc_id] + published + [acc_id] + published)
    )
    row = cursor.fetchone()
    return _val(row, "exercise_id") if row else None


def assigned_exercise_id(cursor, acc_id, resource_id):
    """
    READ-ONLY: the exercise this learner has for the lesson, or None when
    nothing was drawn yet. A learner who worked on an exercise before the
    pool keeps that one. Safe on any cursor (never raises on a missing table).
    """
    published = published_exercise_ids(cursor, resource_id)
    if not published:
        return None
    try:
        if _table_ready(cursor):
            draw = _active_draw(cursor, acc_id, resource_id)
            if draw and draw["exercise_id"] in published:
                return draw["exercise_id"]
    except Error:
        pass
    return _legacy_exercise(cursor, acc_id, published)


def assigned_exercise_row(cursor, acc_id, resource_id):
    """{"exercise_id", "exercise_title"} of the learner's exercise, or None (read-only)."""
    exercise_id = assigned_exercise_id(cursor, acc_id, resource_id)
    if not exercise_id:
        return None
    cursor.execute("SELECT exercise_id, exercise_title FROM coding_exercises_tbl WHERE exercise_id = %s", (exercise_id,))
    return cursor.fetchone()


def assigned_exercise_map(cursor, acc_ids, resource_ids):
    """{(acc_id, resource_id): exercise_id} of the active draws - bulk, for staff tables."""
    if not acc_ids or not resource_ids:
        return {}
    try:
        if not _table_ready(cursor):
            return {}
        cursor.execute(
            f"""SELECT acc_id, resource_id, exercise_id FROM {DRAWS_TABLE}
                WHERE status = 'active'
                  AND acc_id IN ({",".join(["%s"] * len(acc_ids))})
                  AND resource_id IN ({",".join(["%s"] * len(resource_ids))})""",
            tuple(acc_ids) + tuple(resource_ids)
        )
        return {(r["acc_id"], r["resource_id"]): r["exercise_id"] for r in cursor.fetchall()}
    except Error:
        return {}


def _seen(cursor, acc_id, resource_id):
    """{exercise_id: (times, last)} drawn for this learner (plus older submissions)."""
    seen = {}
    cursor.execute(
        f"""SELECT exercise_id, COUNT(*) AS times, MAX(drawn_at) AS last_at FROM {DRAWS_TABLE}
            WHERE acc_id = %s AND resource_id = %s GROUP BY exercise_id""",
        (acc_id, resource_id)
    )
    for r in cursor.fetchall():
        seen[r["exercise_id"]] = (r["times"], r["last_at"])
    return seen


def _pick(cursor, acc_id, resource_id, exclude=()):
    """One exercise: never-seen (fewest times seen) at random, else the one seen longest ago."""
    pool = [e for e in published_exercise_ids(cursor, resource_id) if e not in set(exclude)]
    if not pool:
        pool = published_exercise_ids(cursor, resource_id)   # pool of 1: keep the only one
    if not pool:
        return None
    seen = _seen(cursor, acc_id, resource_id)
    fewest = min(seen.get(e, (0, None))[0] for e in pool)
    level = [e for e in pool if seen.get(e, (0, None))[0] == fewest]
    if fewest == 0:
        return random.choice(level)
    level.sort(key=lambda e: seen[e][1])
    return level[0]


def _now(cursor):
    cursor.execute("SELECT NOW() AS now")
    return cursor.fetchone()["now"]


def _new_draw(cursor, acc_id, resource_id, exercise_id, kind):
    cursor.execute(
        f"""INSERT INTO {DRAWS_TABLE} (acc_id, resource_id, exercise_id, draw_kind, status, drawn_at)
            VALUES (%s, %s, %s, %s, 'active', NOW())""",
        (acc_id, resource_id, exercise_id, kind)
    )


def _end_draw(cursor, draw_id, status):
    cursor.execute(
        f"UPDATE {DRAWS_TABLE} SET status = %s, ended_at = NOW(), away_since = NULL WHERE draw_id = %s",
        (status, draw_id)
    )


def ensure_assigned(cursor, acc_id, resource_id):
    """
    The learner's exercise for the lesson, drawing one if needed (caller
    commits). Older work is kept: the exercise they already worked on
    becomes their draw.
    """
    published = published_exercise_ids(cursor, resource_id)
    if not published:
        return None
    draw = _active_draw(cursor, acc_id, resource_id, lock=True)
    if draw and draw["exercise_id"] in published:
        return draw["exercise_id"]
    if draw:   # its exercise was unpublished / archived
        _end_draw(cursor, draw["draw_id"], "unavailable")
    legacy = _legacy_exercise(cursor, acc_id, published)
    if legacy:
        _new_draw(cursor, acc_id, resource_id, legacy, "legacy")
        return legacy
    picked = _pick(cursor, acc_id, resource_id)
    _new_draw(cursor, acc_id, resource_id, picked, "first")
    return picked


def _with_connection(work, label):
    connection = get_db_connection()
    if connection is None:
        return None, "Could not connect to the database."
    try:
        ensure_exercise_pool_schema(connection)
        cursor = connection.cursor(dictionary=True)
        result, error = work(cursor)
        if result is None:
            connection.rollback()
        else:
            connection.commit()
        cursor.close()
        return result, error
    except Error as e:
        connection.rollback()
        print(f"exercise_pool: {label} failed: {e}")
        return None, "Something went wrong. Your progress is saved."
    finally:
        if connection.is_connected():
            connection.close()


def get_or_draw_exercise_id(acc_id, resource_id):
    """Public: the learner's exercise id for the lesson (drawn on first visit), or None."""
    result, _ = _with_connection(lambda cur: ((ensure_assigned(cur, acc_id, resource_id) or 0), None),
                                 "assign exercise")
    return result or None


def is_assigned(acc_id, resource_id, exercise_id):
    """True when exercise_id is this learner's exercise for its lesson."""
    def work(cursor):
        cursor.execute("SELECT resource_id FROM coding_exercises_tbl WHERE exercise_id = %s", (exercise_id,))
        row = cursor.fetchone()
        if not row:
            return False, None
        return assigned_exercise_id(cursor, acc_id, row["resource_id"]) == int(exercise_id), None
    try:
        exercise_id = int(exercise_id)
    except (TypeError, ValueError):
        return False
    result, _ = _with_connection(work, "check exercise")
    return bool(result)


def retake_exercise(acc_id, resource_id, allowed_check):
    """
    A retake gives another unseen exercise. allowed_check(cursor) -> (bool, message)
    decides whether a retake is open (the module needs one and this
    exercise is not passed). Returns ({"exercise_id"}, None) or (None, message).
    """
    def work(cursor):
        ok, message = allowed_check(cursor)
        if not ok:
            return None, message
        draw = _active_draw(cursor, acc_id, resource_id, lock=True)
        current = draw["exercise_id"] if draw else assigned_exercise_id(cursor, acc_id, resource_id)
        if draw:
            _end_draw(cursor, draw["draw_id"], "retaken")
        picked = _pick(cursor, acc_id, resource_id, exclude=[current] if current else [])
        if picked is None:
            return None, "This lesson has no exercise to retake."
        _new_draw(cursor, acc_id, resource_id, picked, "retake")
        return {"exercise_id": picked}, None
    return _with_connection(work, "retake exercise")


def report_exercise_leave(acc_id, exercise_id, phase, away_seconds=None, reason=None, min_seconds=2):
    """
    feat/leave-detection for the coding exercise. phase "start" remembers
    when the learner left; "end" counts it (>= min_seconds): the first is a
    warning, from the second the exercise is replaced (editor cleared).
    Returns ({"event", "exercise_id"}, None).
    """
    from game_plays import LEAVES_TABLE

    def work(cursor):
        cursor.execute("SELECT resource_id FROM coding_exercises_tbl WHERE exercise_id = %s", (exercise_id,))
        row = cursor.fetchone()
        if not row:
            return None, "This exercise is not available."
        resource_id = row["resource_id"]
        draw = _active_draw(cursor, acc_id, resource_id, lock=True)
        if not draw or draw["exercise_id"] != int(exercise_id):
            return {"event": None, "exercise_id": draw["exercise_id"] if draw else None}, None
        # A passed exercise is finished - leaving afterwards changes nothing.
        cursor.execute("SELECT 1 FROM learner_exercise_progress_tbl WHERE acc_id = %s AND exercise_id = %s LIMIT 1",
                       (acc_id, exercise_id))
        if cursor.fetchone():
            return {"event": None, "exercise_id": draw["exercise_id"]}, None
        now = _now(cursor)
        if phase == "start":
            if not draw["away_since"]:
                cursor.execute(f"UPDATE {DRAWS_TABLE} SET away_since = %s WHERE draw_id = %s", (now, draw["draw_id"]))
            return {"event": None, "exercise_id": draw["exercise_id"]}, None
        left_at = draw["away_since"]
        if left_at:
            away = max(0, int((now - left_at).total_seconds()))
        else:
            try:
                away = max(0, min(int(float(away_seconds or 0)), 86400))
            except (TypeError, ValueError):
                away = 0
            left_at = now - timedelta(seconds=away)
        cursor.execute(f"UPDATE {DRAWS_TABLE} SET away_since = NULL WHERE draw_id = %s", (draw["draw_id"],))
        if away < min_seconds and reason != "closed_or_refreshed":
            return {"event": None, "exercise_id": draw["exercise_id"]}, None
        leave_no = (draw["leave_count"] or 0) + 1
        cursor.execute(f"UPDATE {DRAWS_TABLE} SET leave_count = %s WHERE draw_id = %s", (leave_no, draw["draw_id"]))
        action = "warning" if leave_no == 1 else "swap"
        cursor.execute(
            f"""INSERT INTO {LEAVES_TABLE}
                (acc_id, context, la_id, exercise_id, play_id, leave_no, action, reason, away_seconds, left_at, returned_at)
                VALUES (%s, 'exercise', NULL, %s, NULL, %s, %s, %s, %s, %s, %s)""",
            (acc_id, exercise_id, leave_no, action, (reason or "hidden")[:30], away, left_at, now)
        )
        if leave_no == 1:
            return {"event": {"type": "leave_warning", "message": LEAVE_WARNING},
                    "exercise_id": draw["exercise_id"]}, None
        _end_draw(cursor, draw["draw_id"], "replaced")
        picked = _pick(cursor, acc_id, resource_id, exclude=[draw["exercise_id"]])
        _new_draw(cursor, acc_id, resource_id, picked, "swap")
        # the new draw carries the leave count on, so every later leave swaps again
        cursor.execute(
            f"UPDATE {DRAWS_TABLE} SET leave_count = %s WHERE acc_id = %s AND resource_id = %s AND status = 'active'",
            (leave_no, acc_id, resource_id)
        )
        return {"event": {"type": "leave_swap", "message": LEAVE_SWAP}, "exercise_id": picked}, None

    try:
        exercise_id = int(exercise_id)
    except (TypeError, ValueError):
        return None, "exercise_id is required."
    from game_plays import ensure_play_schema
    connection = get_db_connection()
    if connection is not None:
        try:
            ensure_play_schema(connection)   # the shared leave log
        finally:
            connection.close()
    return _with_connection(work, "exercise leave")


def lesson_exercise_count(cursor, resource_id, exclude_id=None):
    """Mentor side: the lesson's non-archived exercises (Draft, Ready or Published)."""
    params = [resource_id]
    exclude = ""
    if exclude_id:
        exclude = "AND ce.exercise_id != %s"
        params.append(exclude_id)
    cursor.execute(
        f"""SELECT COUNT(*) AS cnt FROM coding_exercises_tbl ce
            LEFT JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
            WHERE ce.resource_id = %s AND COALESCE(ce.is_archived, 0) = 0
              AND COALESCE(las.la_stats_name, '') != 'Archived' {exclude}""",
        tuple(params)
    )
    row = cursor.fetchone()
    return _val(row, "cnt") or 0
