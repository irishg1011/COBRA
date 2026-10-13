"""
learner_where.py - "Doing now" for learners (feat/learner-activity)
------------------------------------------------------------------------------
Every learner page reports WHERE the learner is (learner/js/learner.js ->
POST /session/where): the page, the lesson, the lesson step and - in a
game - the game, "question 3 of 5", lives and paused / out of lives; on the
coding exercise, the number of tries. Sent when it changes (and when the
tab comes back to the front), never on a timer of its own.

ONLY these small facts are accepted and stored - never the learner's code,
typed answers or any answer. Every field is checked against a fixed list /
range below; anything else is dropped.

    learner_where_tbl - one row per learner (the latest report wins)
    -----------------
    acc_id       VARCHAR(15) PK
    page         VARCHAR(20)   dashboard / learning_map / lessons / lesson / ...
    resource_id  INT           the lesson (lesson pages only)
    step         VARCHAR(12)   video / content / activities / exercise / summary
    game         TINYINT       1 Multiple Choice, 2 Fill in the Blanks, 3 Flashcards
    game_state   VARCHAR(12)   playing / paused / out_of_lives
    q_num, q_total SMALLINT    question N of M
    lives        SMALLINT      lives left (regular + bonus)
    tries        SMALLINT      coding exercise tries
    since_at     DATETIME      when the learner got to this place (page / step / game / state)
    updated_at   DATETIME      last report

A table - not memory - so it also works with several worker processes.
Rows untouched for a day are deleted now and then. It is only ever shown
for a learner who is signed in right now (presence.py decides that), so an
old row never shows up on its own.

Admins (Who's online + its Dashboard modal, Learner Progress) and mentors
(Learner Progress only - through /admin/presence) read describe_many().
Nothing here ever raises: presence is a nicety and must never break a page.
"""

import time
import threading

from mysql.connector import Error

from cobradb import get_db_connection

WHERE_TABLE = "learner_where_tbl"
KEEP_HOURS = 24
CLEANUP_EVERY_SECONDS = 600
MIN_SECONDS_BETWEEN_SAVES = 1.0     # per learner, in memory (the page already debounces)

PAGES = {
    "dashboard": "Dashboard",
    "learning_map": "Learning Map",
    "lessons": "Lessons",
    "lesson": "Lesson",
    "module_review": "Module Review",
    "sandbox": "Sandbox",
    "profile": "Profile",
    "edit_profile": "Edit Profile",
    "change_password": "Change Password",
    "certificate": "Certificate",
}
STEPS = ("video", "content", "activities", "exercise", "summary")
GAMES = {1: "Multiple Choice", 2: "Fill in the Blanks", 3: "Flashcards"}
GAME_ITEM = {1: "Question", 2: "Puzzle", 3: "Card"}
GAME_STATES = ("playing", "paused", "out_of_lives")

_table_ready = False
_last_cleanup = 0.0
_cleanup_lock = threading.Lock()
_last_save = {}


def _ensure_table(connection):
    global _table_ready
    if _table_ready:
        return
    try:
        cursor = connection.cursor()
        cursor.execute(
            f"""CREATE TABLE IF NOT EXISTS {WHERE_TABLE} (
                    acc_id      VARCHAR(15) NOT NULL,
                    page        VARCHAR(20) NOT NULL,
                    resource_id INT(10)     DEFAULT NULL,
                    step        VARCHAR(12) DEFAULT NULL,
                    game        TINYINT(1)  DEFAULT NULL,
                    game_state  VARCHAR(12) DEFAULT NULL,
                    q_num       SMALLINT    DEFAULT NULL,
                    q_total     SMALLINT    DEFAULT NULL,
                    lives       SMALLINT    DEFAULT NULL,
                    tries       SMALLINT    DEFAULT NULL,
                    since_at    DATETIME    NOT NULL,
                    updated_at  DATETIME    NOT NULL,
                    PRIMARY KEY (acc_id),
                    KEY idx_where_updated (updated_at),
                    CONSTRAINT fk_where_acc FOREIGN KEY (acc_id)
                        REFERENCES account_tbl (acc_id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"""
        )
        connection.commit()
        cursor.close()
        _table_ready = True
    except Error as e:
        print(f"learner_where: could not create {WHERE_TABLE}: {e}")


def _forget_table_if_missing(error):
    """The table was dropped while the app runs (e.g. a database reset) - create it again next time."""
    global _table_ready
    if getattr(error, "errno", None) == 1146:
        _table_ready = False


def _int(value, low, high):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if low <= number <= high else None


def clean(data):
    """
    The report -> only the allowed facts (dict), or None if the page is unknown.
    Fields that don't belong to the page / step are dropped.
    """
    data = data if isinstance(data, dict) else {}
    page = str(data.get("page") or "")
    if page not in PAGES:
        return None
    out = {"page": page, "resource_id": None, "step": None, "game": None, "game_state": None,
           "q_num": None, "q_total": None, "lives": None, "tries": None}
    if page != "lesson":
        return out
    out["resource_id"] = _int(data.get("resource_id"), 1, 10 ** 9)
    step = str(data.get("step") or "")
    out["step"] = step if step in STEPS else None
    if out["step"] == "activities":
        game = _int(data.get("game"), 1, 3)
        state = str(data.get("game_state") or "")
        if game and state in GAME_STATES:
            out["game"] = game
            out["game_state"] = state
            out["q_total"] = _int(data.get("q_total"), 1, 500)
            out["q_num"] = _int(data.get("q_num"), 1, out["q_total"] or 500)
            out["lives"] = _int(data.get("lives"), 0, 99)
    elif out["step"] == "exercise":
        out["tries"] = _int(data.get("tries"), 0, 9999)
    return out


def _maybe_cleanup(cursor):
    global _last_cleanup
    now = time.monotonic()
    with _cleanup_lock:
        if now - _last_cleanup < CLEANUP_EVERY_SECONDS:
            return
        _last_cleanup = now
    cursor.execute(f"DELETE FROM {WHERE_TABLE} WHERE updated_at < NOW() - INTERVAL %s HOUR", (KEEP_HOURS,))


def save(acc_id, data):
    """Saves the learner's latest place. True when saved. Never raises."""
    place = clean(data)
    if not acc_id or place is None:
        return False
    now = time.monotonic()
    if now - _last_save.get(acc_id, 0) < MIN_SECONDS_BETWEEN_SAVES:
        return False
    _last_save[acc_id] = now

    connection = get_db_connection()
    if connection is None:
        return False
    try:
        _ensure_table(connection)
        cursor = connection.cursor()
        cols = ("page", "resource_id", "step", "game", "game_state", "q_num", "q_total", "lives", "tries")
        # since_at moves only when the PLACE changes (page / lesson / step /
        # game / paused-playing-out of lives) - not on "question 4 of 5".
        same_place = " AND ".join(f"{c} <=> VALUES({c})" for c in ("page", "resource_id", "step", "game", "game_state"))
        cursor.execute(
            f"""INSERT INTO {WHERE_TABLE} (acc_id, {', '.join(cols)}, since_at, updated_at)
                VALUES (%s, {', '.join(['%s'] * len(cols))}, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                    since_at = IF({same_place}, since_at, NOW()),
                    {', '.join(f'{c} = VALUES({c})' for c in cols)},
                    updated_at = NOW()""",
            (acc_id, *[place[c] for c in cols])
        )
        _maybe_cleanup(cursor)
        connection.commit()
        cursor.close()
        return True
    except Error as e:
        _forget_table_if_missing(e)
        print(f"learner_where: save failed: {e}")
        return False
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# "Doing now" lines for staff
# ------------------------------------------------------------------
def _since_text(seconds):
    minutes = max(0, int(seconds or 0)) // 60
    if minutes < 1:
        return "<1 min"
    if minutes < 60:
        return f"{minutes} min"
    hours = minutes // 60
    return f"{hours} h"


def _count(n, one, many):
    return f"{n} {one if n == 1 else many}"


def _place(row, title):
    """Where the learner is, short: 'Dashboard', 'Variables · Activities'."""
    if row["page"] == "lesson" and title:
        return f"{title} · {row['step'].capitalize()}" if row["step"] else title
    return PAGES.get(row["page"], "")


def _doing(row, title):
    """The line for a learner who is ONLINE right now."""
    page, step = row["page"], row["step"]
    lesson = title or "a lesson"
    if page == "lesson" and step == "activities" and row["game"]:
        game = GAMES[row["game"]]
        if row["game_state"] == "out_of_lives":
            return f"Out of lives · {game} · waiting for refill"
        parts = [f"Paused · {game}" if row["game_state"] == "paused" else f"Playing {game}", lesson]
        if row["q_num"] and row["q_total"]:
            parts.append(f"{GAME_ITEM[row['game']]} {row['q_num']} of {row['q_total']}")
        if row["game_state"] == "playing" and row["lives"] is not None:
            parts.append(_count(row["lives"], "life", "lives"))
        return " · ".join(parts)
    if page == "lesson":
        if step == "video":
            return f"Watching video · {lesson}"
        if step == "content":
            return f"Reading lesson · {lesson}"
        if step == "activities":
            return f"Choosing a game · {lesson}"
        if step == "exercise":
            tries = row["tries"]
            return f"Coding exercise · {lesson}" + (f" · {_count(tries, 'try', 'tries')}" if tries else "")
        if step == "summary":
            return f"Lesson summary · {lesson}"
        return f"Opening lesson · {lesson}"
    if page == "sandbox":
        return "In the Sandbox"
    if page == "module_review":
        return "Module Review"
    return f"On: {PAGES[page]}"


def describe_many(states):
    """
    states: {acc_id: "online" | "idle" | "offline"} for signed-in learners.
    -> {acc_id: "Playing Multiple Choice · Variables · Question 3 of 5 · 4 lives · since 4 min"}
    Online: what they are doing + since when. Idle / away: "Last on: Dashboard".
    Learners with no report are left out. {} on errors.
    """
    ids = [acc_id for acc_id in states if acc_id]
    if not ids:
        return {}
    connection = get_db_connection()
    if connection is None:
        return {}
    try:
        _ensure_table(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"""SELECT w.*, r.resource_title,
                       GREATEST(0, TIMESTAMPDIFF(SECOND, w.since_at, NOW())) AS since_seconds
                FROM {WHERE_TABLE} w
                LEFT JOIN learning_resources_tbl r ON r.resource_id = w.resource_id
                WHERE w.acc_id IN ({', '.join(['%s'] * len(ids))})""",
            tuple(ids)
        )
        rows = cursor.fetchall()
        cursor.close()
    except Error as e:
        _forget_table_if_missing(e)
        print(f"learner_where: could not load: {e}")
        return {}
    finally:
        if connection.is_connected():
            connection.close()

    out = {}
    for row in rows:
        if row["page"] not in PAGES:
            continue
        title = row.get("resource_title") or ""
        if states.get(row["acc_id"]) == "online":
            out[row["acc_id"]] = f"{_doing(row, title)} · since {_since_text(row['since_seconds'])}"
        else:
            out[row["acc_id"]] = f"Last on: {_place(row, title)}"
    return out
