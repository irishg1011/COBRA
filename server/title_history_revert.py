"""
title_history_revert.py - "Revert to this" for the History modal
-------------------------------------------------------------------
feat/module-title-history

Puts an older name back on a Chapter / Module / Lesson / Video /
Activity / Coding Exercise. A revert is just a rename, so it goes
through the SAME rules a normal rename does for that type:

    category  sentence case (format_display_name), 50-char limit,
              no duplicate active chapter name
    module    sentence case (format_sentence_case), 60-char limit,
              no duplicate name inside the same chapter
    lesson    format_lesson_title, 60-char limit, globally unique
    video     format_video_title, 60-char limit
    activity  only its generated "<Lesson> – <Type>" title (feat/activity-auto-title)
    exercise  validate_exercise_title (format + limit + unique)

If an old name is now taken or too long, the revert is refused with
that reason. The title update and its 'reverted' history row are saved
in one transaction. Only the title changes - status, content,
category/module links etc. are never touched.

Kept separate from title_history.py because it imports the per-type
modules, which themselves import title_history.py for logging.
"""

from mysql.connector import Error
from cobradb import get_db_connection
from validators import validate_title_length
from text_formatting import format_display_name, format_sentence_case
from lesson_validation import format_lesson_title, is_lesson_title_taken
from activity_validation import (
    build_activity_title, validate_generated_activity_title, sync_lesson_activity_titles,  # feat/activity-auto-title
)
from coding_exercises import validate_exercise_title
from video_tutorials import format_video_title
from title_history import (
    ENTITY_SOURCES, ENTITY_LABELS, ensure_title_history, log_title_change, get_history_entry,
)

# Tables that have an updated_at column to bump on rename
_HAS_UPDATED_AT = {"module", "lesson", "video", "activity", "exercise"}


def _prepare_title(cursor, entity_type, entity_id, raw_title):
    """Returns (ok, message_or_formatted_title) using that type's own rename rules."""
    if entity_type == "category":
        name = format_display_name(raw_title)
        ok, msg = validate_title_length(name, "category", "Chapter name")
        if not ok:
            return False, msg
        cursor.execute(
            """SELECT cat_id FROM category_tbl
               WHERE LOWER(category_name) = LOWER(%s) AND cat_id != %s
                 AND COALESCE(is_archived, 0) = 0""",
            (name, entity_id)
        )
        if cursor.fetchone():
            return False, f'A chapter named "{name}" already exists.'
        return True, name

    if entity_type == "module":
        name = format_sentence_case(raw_title)
        ok, msg = validate_title_length(name, "module", "Module name")
        if not ok:
            return False, msg
        cursor.execute(
            """SELECT m2.module_id FROM modules_tbl m
               JOIN modules_tbl m2 ON m2.cat_id = m.cat_id
               WHERE m.module_id = %s AND m2.module_id != %s
                 AND LOWER(m2.module_name) = LOWER(%s)""",
            (entity_id, entity_id, name)
        )
        if cursor.fetchone():
            return False, f'This chapter already has a module named "{name}".'
        return True, name

    if entity_type == "lesson":
        name = format_lesson_title(raw_title)
        ok, msg = validate_title_length(name, "resource", "Lesson name")
        if not ok:
            return False, msg
        taken = is_lesson_title_taken(name, exclude_resource_id=entity_id)
        if taken is None:
            return False, "Could not check if this lesson name is available. Please try again."
        if taken:
            return False, f'A lesson named "{name}" already exists.'
        return True, name

    if entity_type == "video":
        name = format_video_title(raw_title)
        ok, msg = validate_title_length(name, "video", "Video Tutorial Title")
        if not ok:
            return False, msg
        return True, name

    if entity_type == "activity":
        # feat/activity-auto-title: an activity's title is always
        # "<Lesson> – <Type>", so only that title can be put back. Older
        # free-text names are refused - rename the lesson instead.
        cursor.execute(
            """SELECT lr.resource_title, at.activity_type_name
               FROM learning_activities_tbl la
               LEFT JOIN learning_resources_tbl lr ON la.resource_id = lr.resource_id
               LEFT JOIN activity_types_tbl at ON la.activity_type_id = at.activity_type_id
               WHERE la.la_id = %s""",
            (entity_id,)
        )
        row = cursor.fetchone()
        generated = build_activity_title(row[0], row[1]) if row else ""
        if not generated or (raw_title or "").strip() != generated:
            return False, ("Activity titles follow their lesson name and type, so older names "
                           "can't be put back. Rename the lesson to change this title.")
        ok, result = validate_generated_activity_title(generated, exclude_la_id=entity_id)
        return (True, result) if ok else (False, result)

    if entity_type == "exercise":
        ok, msg, name = validate_exercise_title(raw_title, exclude_exercise_id=entity_id)
        return (True, name) if ok else (False, msg)

    return False, "Unknown item type."


def revert_title(history_id, changed_by=None):
    """
    Puts back the name recorded in history row `history_id`.
    Returns (success, message).
    """
    try:
        history_id = int(history_id)
    except (TypeError, ValueError):
        return False, "Invalid history entry."

    entry = get_history_entry(history_id)
    if not entry:
        return False, "This history entry no longer exists."

    entity_type = entry["entity_type"]
    entity_id = entry["entity_id"]
    table, id_col, title_col = ENTITY_SOURCES[entity_type]
    label = ENTITY_LABELS[entity_type]

    connection = get_db_connection()
    if connection is None:
        return False, "Could not connect to the database."

    try:
        ensure_title_history(connection)
        cursor = connection.cursor()

        cursor.execute(f"SELECT {title_col} FROM {table} WHERE {id_col} = %s", (entity_id,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            return False, f"This {label.lower()} no longer exists."
        current_title = row[0]

        ok, result = _prepare_title(cursor, entity_type, entity_id, entry["new_title"])
        if not ok:
            cursor.close()
            return False, result
        new_title = result

        if new_title == current_title:
            cursor.close()
            return False, f"This {label.lower()} is already named \"{new_title}\"."

        bump = ", updated_at = NOW()" if entity_type in _HAS_UPDATED_AT else ""
        cursor.execute(
            f"UPDATE {table} SET {title_col} = %s{bump} WHERE {id_col} = %s",
            (new_title, entity_id)
        )
        log_title_change(cursor, entity_type, entity_id, current_title, new_title,
                         changed_by=changed_by, change_type="reverted")
        # feat/activity-auto-title: a reverted lesson name renames its
        # activities too, in this same transaction.
        if entity_type == "lesson":
            sync_lesson_activity_titles(cursor, entity_id, new_title, changed_by)
        connection.commit()
        cursor.close()
        return True, f'{label} renamed back to "{new_title}".'

    except Error as e:
        if connection.is_connected():
            connection.rollback()
        print(f"title_history_revert: failed to revert history entry {history_id}: {e}")
        return False, "Could not revert this name."
    finally:
        if connection.is_connected():
            connection.close()
