"""
learning_activity_content.py - Task #62: Distinct Activity Table Routing
& Insertion Controllers for Learning Activities
--------------------------------------------------------------------------
Provides dedicated, modular database controllers tailored to each
specific activity table schema mapped through `learning_activities_tbl`
via foreign key `la_id`:

    1. MCQActivityController:
       - mcq_questions_tbl (q_id, la_id, question_text)
       - mcq_options_tbl (option_id, q_id, option_letter, option_text, is_correct, feedback)
    2. FillBlanksActivityController:
       - fill_blanks_tbl (fib_id, la_id, content, correct_answer, correct_feedback, incorrect_feedback)
    3. FlashcardsActivityController:
       - flashcards_tbl (flashcard_id, la_id, front_text, back_text, correct_feedback, incorrect_feedback)

An ActivityContentRouter dispatches insertions and retrievals to the
appropriate controller based on the selected activity type.
"""

from mysql.connector import Error
from text_formatting import format_display_name

MCQ_QUESTIONS_TABLE = "mcq_questions_tbl"
MCQ_OPTIONS_TABLE = "mcq_options_tbl"
FILL_BLANKS_TABLE = "fill_blanks_tbl"
FLASHCARDS_TABLE = "flashcards_tbl"


class MCQActivityController:
    """
    Controller for Multiple Choice questions and option sets
    (mcq_questions_tbl and mcq_options_tbl).
    """

    @staticmethod
    def clear(cursor, la_id):
        cursor.execute(
            f"""DELETE FROM {MCQ_OPTIONS_TABLE}
                WHERE q_id IN (SELECT q_id FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s)""",
            (la_id,)
        )
        cursor.execute(f"DELETE FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s", (la_id,))

    @staticmethod
    def insert(cursor, la_id, questions):
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
                letter = chr(65 + idx)
                is_correct = 1 if correct_index == idx else 0
                raw_feedback = (opt.get("feedback") or "").strip()
                feedback = format_display_name(raw_feedback) if raw_feedback else None
                cursor.execute(
                    f"""INSERT INTO {MCQ_OPTIONS_TABLE}
                        (q_id, option_letter, option_text, is_correct, feedback)
                        VALUES (%s, %s, %s, %s, %s)""",
                    (q_id, letter, normalized_opt_text, is_correct, feedback)
                )

    @staticmethod
    def fetch(cursor, la_id):
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
        return questions


class FillBlanksActivityController:
    """
    Controller for Fill in the Blanks items (fill_blanks_tbl).
    """

    @staticmethod
    def clear(cursor, la_id):
        cursor.execute(f"DELETE FROM {FILL_BLANKS_TABLE} WHERE la_id = %s", (la_id,))

    @staticmethod
    def insert(cursor, la_id, fill_blanks):
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

    @staticmethod
    def fetch(cursor, la_id):
        cursor.execute(
            f"""SELECT content, correct_answer, correct_feedback, incorrect_feedback
                FROM {FILL_BLANKS_TABLE} WHERE la_id = %s ORDER BY fib_id ASC""",
            (la_id,)
        )
        return [
            {
                "text": row["content"],
                "answer": row["correct_answer"],
                "correctFeedback": row.get("correct_feedback") or "",
                "incorrectFeedback": row.get("incorrect_feedback") or "",
            }
            for row in cursor.fetchall()
        ]


class FlashcardsActivityController:
    """
    Controller for Flashcard items (flashcards_tbl).
    """

    @staticmethod
    def clear(cursor, la_id):
        cursor.execute(f"DELETE FROM {FLASHCARDS_TABLE} WHERE la_id = %s", (la_id,))

    @staticmethod
    def insert(cursor, la_id, flashcards):
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

    @staticmethod
    def fetch(cursor, la_id):
        cursor.execute(
            f"""SELECT front_text, back_text, correct_feedback, incorrect_feedback
                FROM {FLASHCARDS_TABLE} WHERE la_id = %s ORDER BY flashcard_id ASC""",
            (la_id,)
        )
        return [
            {
                "front": row["front_text"],
                "back": row["back_text"],
                "correctFeedback": row.get("correct_feedback") or "",
                "incorrectFeedback": row.get("incorrect_feedback") or "",
            }
            for row in cursor.fetchall()
        ]


class ActivityContentRouter:
    """
    Router that coordinates insertion, retrieval, and clearing across
    all activity content controllers.
    """

    CONTROLLERS = {
        "Multiple Choice": MCQActivityController,
        "Fill in the Blanks": FillBlanksActivityController,
        "Flashcards": FlashcardsActivityController,
    }

    @classmethod
    def get_controller(cls, activity_type):
        name = (activity_type or "").strip()
        return cls.CONTROLLERS.get(name)

    @classmethod
    def clear_all(cls, cursor, la_id):
        MCQActivityController.clear(cursor, la_id)
        FillBlanksActivityController.clear(cursor, la_id)
        FlashcardsActivityController.clear(cursor, la_id)

    @classmethod
    def route_insertion(cls, cursor, la_id, activity_type, questions=None,
                        fill_blanks=None, flashcards=None):
        cls.clear_all(cursor, la_id)
        controller = cls.get_controller(activity_type)
        if controller is MCQActivityController:
            controller.insert(cursor, la_id, questions)
        elif controller is FillBlanksActivityController:
            controller.insert(cursor, la_id, fill_blanks)
        elif controller is FlashcardsActivityController:
            controller.insert(cursor, la_id, flashcards)


def save_activity_content(connection, la_id, activity_type, questions=None,
                           fill_blanks=None, flashcards=None):
    """
    Replaces la_id's Section 2 content with the submitted set, scoped to
    `activity_type` using the dedicated controllers. Operates on the caller's
    open connection for transaction atomicity.
    """
    cursor = connection.cursor()
    ActivityContentRouter.route_insertion(
        cursor, la_id, activity_type,
        questions=questions, fill_blanks=fill_blanks, flashcards=flashcards
    )
    cursor.close()


def get_activity_content(la_id):
    """
    Reloads Section 2 content across all activity types for the given la_id.
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
        questions = MCQActivityController.fetch(cursor, la_id)
        fill_blanks = FillBlanksActivityController.fetch(cursor, la_id)
        flashcards = FlashcardsActivityController.fetch(cursor, la_id)
        cursor.close()
        return {"questions": questions, "fill_blanks": fill_blanks, "flashcards": flashcards}
    except Error as e:
        print(f"learning_activity_content: failed to load content for la_id={la_id}: {e}")
        return empty
    finally:
        if connection.is_connected():
            connection.close()