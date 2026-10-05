"""
title_history.py - Name/title history for everything that has a title
---------------------------------------------------------------------------
feat/module-title-history

One shared log for Chapter (category), Module, Lesson, Video Tutorial,
Activity and Coding Exercise names. Every save function that can create
or rename one of those calls log_title_change() on its OWN cursor, right
before its commit - so a failed save never leaves a history row behind.

    title_history_tbl
    ------------------
    history_id   INT(10) UNSIGNED AUTO_INCREMENT PRIMARY KEY
    entity_type  ENUM('category','module','lesson','video','activity','exercise')
    entity_id    INT(10)        - id in that entity's own table (no FK:
                                  one column can't reference 6 tables)
    change_type  ENUM('created','renamed','reverted') DEFAULT 'renamed'
    old_title    VARCHAR(255) NULL   - NULL on 'created' rows
    new_title    VARCHAR(255)
    changed_by   VARCHAR(15) NULL    - FK -> account_tbl.acc_id (SET NULL)
    changed_at   TIMESTAMP NULL DEFAULT current_timestamp()
                                    - NULL only for backfilled Chapters,
                                      which have no created_at of their own

Created lazily (CREATE TABLE IF NOT EXISTS) the same way the other log
tables in this project are. The very first time it's created, every
EXISTING item gets one 'created' row with its current name (backfill),
so no History modal starts out empty.

This file never touches Flask/session - callers pass changed_by in.
Reverting lives in title_history_revert.py (it needs the per-type
validation rules, which would make this file a circular import).
"""

from mysql.connector import Error
from cobradb import get_db_connection
from admin_time import fmt_datetime  # the one admin date + time format

TITLE_HISTORY_TABLE = "title_history_tbl"

ENTITY_TYPES = ("category", "module", "lesson", "video", "activity", "exercise")

# entity_type -> (table, id column, title column) - the CURRENT name lives here
ENTITY_SOURCES = {
    "category": ("category_tbl", "cat_id", "category_name"),
    "module": ("modules_tbl", "module_id", "module_name"),
    "lesson": ("learning_resources_tbl", "resource_id", "resource_title"),
    "video": ("video_tutorials_tbl", "video_tutorial_id", "video_title"),
    "activity": ("learning_activities_tbl", "la_id", "activity_title"),
    "exercise": ("coding_exercises_tbl", "exercise_id", "exercise_title"),
}

ENTITY_LABELS = {
    "category": "Chapter",
    "module": "Module",
    "lesson": "Lesson",
    "video": "Video Tutorial",
    "activity": "Activity",
    "exercise": "Coding Exercise",
}

_table_ensured = False


# ------------------------------------------------------------------
# Table + one-time backfill
# ------------------------------------------------------------------
def _backfill_existing(cursor):
    """
    One 'created' row per existing item, with its current name. The
    creator is only kept if that acc_id really exists (the FK would
    reject e.g. the old 'Admin' placeholder some exercises have).
    Chapters have no created_at -> changed_at stays NULL
    ("before history tracking" in the modal).
    """
    valid_creator = "CASE WHEN a.acc_id IS NULL THEN NULL ELSE t.uploaded_by END"

    cursor.execute(
        f"""INSERT INTO {TITLE_HISTORY_TABLE}
                (entity_type, entity_id, change_type, old_title, new_title, changed_by, changed_at)
            SELECT 'category', t.cat_id, 'created', NULL, t.category_name, NULL, NULL
            FROM category_tbl t"""
    )
    cursor.execute(
        f"""INSERT INTO {TITLE_HISTORY_TABLE}
                (entity_type, entity_id, change_type, old_title, new_title, changed_by, changed_at)
            SELECT 'module', t.module_id, 'created', NULL, t.module_name, NULL, t.created_at
            FROM modules_tbl t"""
    )
    for entity_type, table, id_col, title_col in (
        ("lesson", "learning_resources_tbl", "resource_id", "resource_title"),
        ("video", "video_tutorials_tbl", "video_tutorial_id", "video_title"),
        ("activity", "learning_activities_tbl", "la_id", "activity_title"),
        ("exercise", "coding_exercises_tbl", "exercise_id", "exercise_title"),
    ):
        cursor.execute(
            f"""INSERT INTO {TITLE_HISTORY_TABLE}
                    (entity_type, entity_id, change_type, old_title, new_title, changed_by, changed_at)
                SELECT '{entity_type}', t.{id_col}, 'created', NULL, t.{title_col},
                       {valid_creator}, t.created_at
                FROM {table} t
                LEFT JOIN account_tbl a ON a.acc_id = t.uploaded_by"""
        )


def ensure_title_history(connection):
    """
    Creates title_history_tbl (+ its FK) if needed and backfills it the
    first time. Call it right after opening a connection, BEFORE any
    other writes: CREATE/ALTER TABLE commit implicitly in MySQL, so
    calling it mid-transaction would commit the caller's work early.
    Gated by a module flag - only really runs once per process. Never
    raises; a failure just means history isn't recorded.
    """
    global _table_ensured
    if _table_ensured:
        return
    try:
        cursor = connection.cursor()
        cursor.execute("SHOW TABLES LIKE %s", (TITLE_HISTORY_TABLE,))
        is_new = cursor.fetchone() is None

        cursor.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {TITLE_HISTORY_TABLE} (
                history_id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
                entity_type ENUM('category','module','lesson','video','activity','exercise') NOT NULL,
                entity_id INT(10) NOT NULL,
                change_type ENUM('created','renamed','reverted') NOT NULL DEFAULT 'renamed',
                old_title VARCHAR(255) NULL,
                new_title VARCHAR(255) NOT NULL,
                changed_by VARCHAR(15) NULL,
                changed_at TIMESTAMP NULL DEFAULT current_timestamp(),
                PRIMARY KEY (history_id),
                KEY idx_entity (entity_type, entity_id, changed_at),
                KEY idx_changed_by (changed_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
            """
        )

        if is_new:
            # Separate step so a charset/engine mismatch on account_tbl
            # can only cost us the FK - never the history table itself.
            try:
                cursor.execute(
                    f"""ALTER TABLE {TITLE_HISTORY_TABLE}
                        ADD CONSTRAINT fk_th_changed_by FOREIGN KEY (changed_by)
                        REFERENCES account_tbl (acc_id)
                        ON DELETE SET NULL ON UPDATE CASCADE"""
                )
            except Error as e:
                print(f"title_history: history table created, but its changed_by FK could not be added: {e}")

            _backfill_existing(cursor)

        connection.commit()
        cursor.close()
        _table_ensured = True
    except Error as e:
        print(f"title_history: failed to ensure {TITLE_HISTORY_TABLE}: {e}")


# ------------------------------------------------------------------
# Writing
# ------------------------------------------------------------------
def log_title_change(cursor, entity_type, entity_id, old_title, new_title, changed_by=None, change_type=None):
    """
    Adds one history row using the CALLER's cursor (same transaction -
    it's saved or rolled back together with the rename itself).

    - old_title None      -> 'created'
    - old == new          -> nothing is logged (saved without renaming)
    - change_type given   -> used as-is (e.g. 'reverted')

    Never raises: a history hiccup must not block the actual save.
    """
    if entity_type not in ENTITY_TYPES or not entity_id or not new_title:
        return
    if old_title is not None and old_title == new_title:
        return
    kind = change_type or ("created" if old_title is None else "renamed")
    try:
        cursor.execute(
            f"""INSERT INTO {TITLE_HISTORY_TABLE}
                    (entity_type, entity_id, change_type, old_title, new_title, changed_by)
                VALUES (%s, %s, %s, %s, %s, %s)""",
            (entity_type, int(entity_id), kind, old_title, new_title, changed_by or None)
        )
    except Error as e:
        print(f"title_history: failed to log {entity_type} {entity_id} title change: {e}")


# ------------------------------------------------------------------
# Reading
# ------------------------------------------------------------------
def _fmt_datetime(dt):
    """e.g. 'Oct 5, 2026 4:53 PM' (admin_time.fmt_datetime - one format for the admin side)"""
    return fmt_datetime(dt, empty=None)


def _current_title(cursor, entity_type, entity_id):
    table, id_col, title_col = ENTITY_SOURCES[entity_type]
    cursor.execute(f"SELECT {title_col} AS title FROM {table} WHERE {id_col} = %s", (entity_id,))
    row = cursor.fetchone()
    return row["title"] if row else None


def _section(cursor, entity_type, entity_id, label=None):
    """One item's history, newest first, or None if the item doesn't exist."""
    current = _current_title(cursor, entity_type, entity_id)
    if current is None:
        return None

    cursor.execute(
        f"""SELECT th.history_id, th.change_type, th.old_title, th.new_title,
                   th.changed_at, th.changed_by, p.firstname, p.lastname
            FROM {TITLE_HISTORY_TABLE} th
            LEFT JOIN profile_tbl p ON th.changed_by = p.acc_id
            WHERE th.entity_type = %s AND th.entity_id = %s
            ORDER BY (th.changed_at IS NULL) ASC, th.changed_at DESC, th.history_id DESC""",
        (entity_type, entity_id)
    )
    entries = []
    for r in cursor.fetchall():
        name = " ".join(part for part in [r.get("firstname"), r.get("lastname")] if part).strip()
        entries.append({
            "history_id": r["history_id"],
            "change_type": r["change_type"],
            "old_title": r.get("old_title"),
            "new_title": r["new_title"],
            "changed_at": _fmt_datetime(r.get("changed_at")),  # None -> "before history tracking"
            "changed_by": name or r.get("changed_by") or None,
            # Any past name can be restored, except the one it already has.
            "can_revert": r["new_title"] != current,
        })

    return {
        "entity_type": entity_type,
        "entity_id": int(entity_id),
        "label": label or ENTITY_LABELS[entity_type],
        "current_title": current,
        "entries": entries,
    }


def get_title_history(scope, target_id):
    """
    What one History icon shows, as a list of sections:

        category / module / exercise -> that one item
        lesson     -> the lesson + its video tutorial(s), if any
        activities -> every activity of that lesson (one section each)

    Returns {"heading", "sections"} or None if nothing was found / the
    DB is unreachable.
    """
    try:
        target_id = int(target_id)
    except (TypeError, ValueError):
        return None

    connection = get_db_connection()
    if connection is None:
        return None

    try:
        ensure_title_history(connection)
        cursor = connection.cursor(dictionary=True)
        sections = []
        heading = None

        if scope in ("category", "module", "exercise"):
            section = _section(cursor, scope, target_id)
            if section:
                sections.append(section)
                heading = section["current_title"]

        elif scope == "lesson":
            section = _section(cursor, "lesson", target_id)
            if section:
                sections.append(section)
                heading = section["current_title"]
                cursor.execute(
                    "SELECT video_tutorial_id FROM video_tutorials_tbl WHERE resource_id = %s ORDER BY video_tutorial_id DESC",
                    (target_id,)
                )
                video_ids = [r["video_tutorial_id"] for r in cursor.fetchall()]
                for vid in video_ids:
                    video = _section(cursor, "video", vid)
                    if video:
                        sections.append(video)

        elif scope == "activities":
            heading = _current_title(cursor, "lesson", target_id)
            cursor.execute(
                """SELECT la.la_id, atp.activity_type_name
                   FROM learning_activities_tbl la
                   LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
                   LEFT JOIN learning_activities_stats_tbl s ON la.la_stats_id = s.la_stats_id
                   WHERE la.resource_id = %s
                     AND (s.la_stats_name IS NULL OR s.la_stats_name != 'Archived')
                   ORDER BY la.la_id ASC""",
                (target_id,)
            )
            activities = cursor.fetchall()
            for r in activities:
                section = _section(cursor, "activity", r["la_id"], label=r.get("activity_type_name") or "Activity")
                if section:
                    sections.append(section)

        cursor.close()
        if not sections:
            return None
        return {"heading": heading, "sections": sections}

    except Error as e:
        print(f"title_history: failed to load history for {scope} {target_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_history_entry(history_id):
    """One history row (entity_type, entity_id, new_title) - used by revert."""
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        ensure_title_history(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            f"SELECT history_id, entity_type, entity_id, new_title FROM {TITLE_HISTORY_TABLE} WHERE history_id = %s",
            (history_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        return row
    except Error as e:
        print(f"title_history: failed to load history entry {history_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()
