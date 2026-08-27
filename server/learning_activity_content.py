"""
learning_activity_content.py - Task #56: Section 2 Persistence for
Learning Activities (Save Draft)
--------------------------------------------------------------------------
learning_activity_draft.py already covered Section 1 (Activity
Information: title, category, module, lesson, activity type, points) -
its own docstring explicitly called out that Section 2 (the questions /
fill-in-the-blank items / flashcards built in the Activity Content
builder) had "no backend persistence anywhere in this project yet" and
that admin_routes.py's create_activity_submit() still had a
"TODO: Insert activity and question sets" placeholder.

Task #56 requires "Save Draft" to store ALL form parameters, questions,
mappings, and calculated points - so this file adds the missing half:
persisting/reloading Section 2 straight into the same child tables
learning_activities.delete_activity() already knows how to clean up:

    mcq_questions_tbl / mcq_options_tbl   - Multiple Choice
    fill_blanks_tbl                        - Fill in the Blanks
    flashcards_tbl                         - Flashcards

WHY A SEPARATE FILE (never inline in admin_routes.py)
Matches this project's existing convention (learning_activity_draft.py,
resource_draft.py, activity_validation.py, etc.) - admin_routes.py stays
a thin HTTP wrapper only.

WHY THE WRITE PATH TAKES A CALLER-OWNED CONNECTION
Section 2's rows are children of the very same la_id row Section 1
INSERTs/UPDATEs in learning_activity_draft.save_activity_draft(). Both
halves need to land in ONE transaction - either the whole draft
(activity + its content) is saved, or none of it is - so
save_activity_content() below never opens its own connection or calls
commit()/rollback() itself; it always operates on the caller's already-
open `connection` and lets the caller decide when to commit.

SAVE STRATEGY
Every save is idempotent per la_id and REPLACES the previous content
outright: every existing row for this la_id, across ALL THREE content
tables, is deleted first, then the currently-submitted set is inserted
fresh. This mirrors how the frontend already treats Section 2 (the
whole card list is re-submitted every save - see
create-learning-activity.js's reindexAllQuestions() etc.), and it means
switching Activity Type between two saves (e.g. Multiple Choice ->
Flashcards) cleanly drops the old type's rows instead of leaving
orphaned content behind.
"""

from mysql.connector import Error
from text_formatting import format_display_name

MCQ_QUESTIONS_TABLE = "mcq_questions_tbl"
MCQ_OPTIONS_TABLE = "mcq_options_tbl"
FILL_BLANKS_TABLE = "fill_blanks_tbl"
FLASHCARDS_TABLE = "flashcards_tbl"


def _clear_existing_content(cursor, la_id):
    """
    Deletes every child row belonging to `la_id` across ALL THREE
    content tables (not just whichever type is currently selected), so
    re-saving a draft - including right after switching Activity Type -
    never leaves orphaned rows from a previous save behind.
    """
    cursor.execute(
        f"""DELETE FROM {MCQ_OPTIONS_TABLE}
            WHERE q_id IN (SELECT q_id FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s)""",
        (la_id,)
    )
    cursor.execute(f"DELETE FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s", (la_id,))
    cursor.execute(f"DELETE FROM {FILL_BLANKS_TABLE} WHERE la_id = %s", (la_id,))
    cursor.execute(f"DELETE FROM {FLASHCARDS_TABLE} WHERE la_id = %s", (la_id,))


def _save_questions(cursor, la_id, questions):
    """
    Inserts every Multiple Choice question + its options. Skips a
    question with no typed text, and an option row with no typed text -
    matches the frontend's own required-field markers, without
    rejecting the whole save over one blank/in-progress row.
    Applies strict sentence-case formatting (Task #60).
    """
    for q in (questions or []):
        text = (q.get("text") or "").strip()
        if not text:
            continue

        normalized_text = format_display_name(text)

        cursor.execute(
            f"INSERT INTO {MCQ_QUESTIONS_TABLE} (la_id, question_text) VALUES (%s, %s)",
            (la_id, normalized_text)
        )
        q_id = cursor.lastrowid

        try:
            correct_index = int(q.get("correct_option"))
        except (TypeError, ValueError):
            correct_index = None

        for idx, opt in enumerate(q.get("options") or []):
            opt_text = (opt.get("text") or "").strip()
            if not opt_text:
                continue
            normalized_opt_text = format_display_name(opt_text)
            letter = chr(65 + idx)  # 0 -> 'A', 1 -> 'B', ...
            is_correct = 1 if correct_index == idx else 0
            raw_feedback = (opt.get("feedback") or "").strip()
            feedback = format_display_name(raw_feedback) if raw_feedback else None
            cursor.execute(
                f"""INSERT INTO {MCQ_OPTIONS_TABLE}
                    (q_id, option_letter, option_text, is_correct, feedback)
                    VALUES (%s, %s, %s, %s, %s)""",
                (q_id, letter, normalized_opt_text, is_correct, feedback)
            )


def _save_fill_blanks(cursor, la_id, fill_blanks):
    """Inserts every Fill in the Blanks item that has both content and
    a correct answer typed - an incomplete row is skipped, not saved
    half-filled. Applies strict sentence-case formatting (Task #60)."""
    for fb in (fill_blanks or []):
        content = (fb.get("content") or "").strip()
        answer = (fb.get("correct_answer") or "").strip()
        if not content or not answer:
            continue
        normalized_content = format_display_name(content)
        normalized_answer = format_display_name(answer)
        raw_correct_fb = (fb.get("correct_feedback") or "").strip()
        raw_incorrect_fb = (fb.get("incorrect_feedback") or "").strip()
        correct_fb = format_display_name(raw_correct_fb) if raw_correct_fb else None
        incorrect_fb = format_display_name(raw_incorrect_fb) if raw_incorrect_fb else None
        cursor.execute(
            f"""INSERT INTO {FILL_BLANKS_TABLE}
                (la_id, content, correct_answer, correct_feedback, incorrect_feedback)
                VALUES (%s, %s, %s, %s, %s)""",
            (la_id, normalized_content, normalized_answer, correct_fb, incorrect_fb)
        )


def _save_flashcards(cursor, la_id, flashcards):
    """Inserts every Flashcard that has both a front and a back typed.
    Applies strict sentence-case formatting (Task #60)."""
    for fc in (flashcards or []):
        front = (fc.get("front") or "").strip()
        back = (fc.get("back") or "").strip()
        if not front or not back:
            continue
        normalized_front = format_display_name(front)
        normalized_back = format_display_name(back)
        raw_correct_fb = (fc.get("correct_feedback") or "").strip()
        raw_incorrect_fb = (fc.get("incorrect_feedback") or "").strip()
        correct_fb = format_display_name(raw_correct_fb) if raw_correct_fb else None
        incorrect_fb = format_display_name(raw_incorrect_fb) if raw_incorrect_fb else None
        cursor.execute(
            f"""INSERT INTO {FLASHCARDS_TABLE}
                (la_id, front_text, back_text, correct_feedback, incorrect_feedback)
                VALUES (%s, %s, %s, %s, %s)""",
            (la_id, normalized_front, normalized_back, correct_fb, incorrect_fb)
        )


def save_activity_content(connection, la_id, activity_type, questions=None,
                           fill_blanks=None, flashcards=None):
    """
    Replaces la_id's Section 2 content with the submitted set, scoped to
    `activity_type` ("Multiple Choice" / "Fill in the Blanks" /
    "Flashcards" - matches activity_points.py's exact constants and
    create-learning-activity.html's #activityType option values).

    Operates on the CALLER's already-open `connection` - never opens its
    own connection, never calls commit()/rollback() - so this always
    runs inside the same transaction as
    learning_activity_draft.save_activity_draft()'s own INSERT/UPDATE of
    learning_activities_tbl. A draft save is therefore atomic: either
    the activity row AND its content both land, or - if anything raises -
    the caller's rollback() undoes both together.

    Raises mysql.connector.Error on failure; the caller is responsible
    for catching it (see save_activity_draft()).
    """
    cursor = connection.cursor()
    _clear_existing_content(cursor, la_id)

    normalized_type = (activity_type or "").strip()
    if normalized_type == "Multiple Choice":
        _save_questions(cursor, la_id, questions)
    elif normalized_type == "Fill in the Blanks":
        _save_fill_blanks(cursor, la_id, fill_blanks)
    elif normalized_type == "Flashcards":
        _save_flashcards(cursor, la_id, flashcards)

    cursor.close()


def get_activity_content(la_id):
    """
    Companion read-path to save_activity_content() above - reloads a
    previously saved activity's Section 2 content, mirroring
    learning_activity_draft.get_activity_draft()'s own role for
    Section 1, so a saved draft can eventually be reopened with its
    questions/fill-blanks/flashcards intact instead of always starting
    the Activity Content builder blank.

    Returns {"questions": [...], "fill_blanks": [...], "flashcards": [...]}
    - only the list matching the activity's saved type will actually
    have rows in it; the other two are always [] (never omitted), so
    callers never need a None-check. Returns all-empty lists (never
    raises) if la_id is missing/invalid or the database is unreachable.
    """
    empty = {"questions": [], "fill_blanks": [], "flashcards": []}
    if not la_id:
        return empty
    try:
        la_id = int(la_id)
    except (TypeError, ValueError):
        return empty

    from cobradb import get_db_connection
    connection = get_db_connection()
    if connection is None:
        return empty

    try:
        cursor = connection.cursor(dictionary=True)

        cursor.execute(
            f"SELECT q_id, question_text FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s ORDER BY q_id ASC",
            (la_id,)
        )
        question_rows = cursor.fetchall()

        questions = []
        for q in question_rows:
            cursor.execute(
                f"""SELECT option_letter, option_text, is_correct, feedback
                    FROM {MCQ_OPTIONS_TABLE} WHERE q_id = %s ORDER BY option_letter ASC""",
                (q["q_id"],)
            )
            option_rows = cursor.fetchall()
            options = [
                {
                    "text": o["option_text"],
                    "feedback": o.get("feedback") or "",
                }
                for o in option_rows
            ]
            correct_option = next(
                (i for i, o in enumerate(option_rows) if o["is_correct"]), None
            )
            questions.append({
                "text": q["question_text"],
                "options": options,
                "correct_option": correct_option,
            })

        cursor.execute(
            f"""SELECT content, correct_answer, correct_feedback, incorrect_feedback
                FROM {FILL_BLANKS_TABLE} WHERE la_id = %s ORDER BY fib_id ASC""",
            (la_id,)
        )
        fill_blanks = [
            {
                "text": row["content"],
                "answer": row["correct_answer"],
                "correctFeedback": row.get("correct_feedback") or "",
                "incorrectFeedback": row.get("incorrect_feedback") or "",
            }
            for row in cursor.fetchall()
        ]

        cursor.execute(
            f"""SELECT front_text, back_text, correct_feedback, incorrect_feedback
                FROM {FLASHCARDS_TABLE} WHERE la_id = %s ORDER BY flashcard_id ASC""",
            (la_id,)
        )
        flashcards = [
            {
                "front": row["front_text"],
                "back": row["back_text"],
                "correctFeedback": row.get("correct_feedback") or "",
                "incorrectFeedback": row.get("incorrect_feedback") or "",
            }
            for row in cursor.fetchall()
        ]

        cursor.close()
        return {"questions": questions, "fill_blanks": fill_blanks, "flashcards": flashcards}
    except Error as e:
        print(f"learning_activity_content: failed to load content for la_id={la_id}: {e}")
        return empty
    finally:
        if connection.is_connected():
            connection.close()