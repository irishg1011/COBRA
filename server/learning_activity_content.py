"""
learning_activity_content.py - Task #62: Distinct Activity Table Routing
& Insertion Controllers for Learning Activities
--------------------------------------------------------------------------
Provides dedicated, modular database controllers tailored to each
specific activity table schema mapped through `learning_activities_tbl`
via foreign key `la_id`:

    1. MCQActivityController:
       - mcq_questions_tbl (q_id, la_id, question_text, sort_order)
       - mcq_options_tbl (option_id, q_id, option_letter, option_text, is_correct, feedback)
    2. FillBlanksActivityController:
       - fill_blanks_tbl (fib_id, la_id, content, correct_answer, correct_feedback, incorrect_feedback)
    3. FlashcardsActivityController:
       - flashcards_tbl (flashcard_id, la_id, front_text, back_text, correct_feedback, incorrect_feedback)

An ActivityContentRouter dispatches saves and retrievals to the
appropriate controller based on the selected activity type.

feat/publishing-tree: SAVE IN PLACE (was: delete everything, re-insert)
------------------------------------------------------------------------
Learners' answers point at these rows by id:
    mcq_learner_answers_tbl.q_id / .option_id
    fib_learner_answers_tbl.fib_id
    flashcard_learner_answers_tbl.flashcard_id
so the old delete-and-re-insert failed with a foreign-key error the moment
any learner had answered - editing a live activity was impossible.

Now every question / option / item the editor sends back carries its own
id (q_id / option_id / fib_id / flashcard_id, set by
create-learning-activity.js when the activity is reopened):
    - has an id  -> UPDATE that row (same id, learners' answers stay attached)
    - no id      -> INSERT a new row
    - existing row not sent back (the admin removed it):
          nobody answered it -> DELETE
          learners answered   -> ContentInUseError, nothing is saved
If a request carries NO ids at all (old/no-JS form post), rows are matched
by position instead, so a plain edit still keeps its ids.

Fill in the Blanks / Flashcards have no sort column, so their order is
creation order (fib_id / flashcard_id) - same order learners always got.
"""

from mysql.connector import Error
from text_formatting import capitalize_first_only, format_display_name

MCQ_QUESTIONS_TABLE = "mcq_questions_tbl"
MCQ_OPTIONS_TABLE = "mcq_options_tbl"
FILL_BLANKS_TABLE = "fill_blanks_tbl"
FLASHCARDS_TABLE = "flashcards_tbl"

MCQ_ANSWERS_TABLE = "mcq_learner_answers_tbl"
FIB_ANSWERS_TABLE = "fib_learner_answers_tbl"
FLASHCARD_ANSWERS_TABLE = "flashcard_learner_answers_tbl"


class ContentInUseError(Exception):
    """A question/item learners already answered was removed - the save is refused."""


class FibOutputMismatchError(ContentInUseError):
    """
    feat/fib-console: a console item's code, run with its correct answer,
    does not print its Expected Output - the save is refused (same path as
    ContentInUseError, so the mentor sees the message).
    """


def _int_or_none(value):
    try:
        return int(value) if value not in (None, "", "null") else None
    except (TypeError, ValueError):
        return None


def _answered_ids(cursor, answers_table, column, ids):
    """Subset of `ids` that have at least one learner answer."""
    ids = [i for i in ids if i]
    if not ids:
        return set()
    placeholders = ", ".join(["%s"] * len(ids))
    cursor.execute(
        f"SELECT DISTINCT {column} FROM {answers_table} WHERE {column} IN ({placeholders})",
        tuple(ids)
    )
    return {row[0] for row in cursor.fetchall()}


def _short(text, limit=40):
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit - 3] + "..."


def _match_ids(incoming, existing_ids, id_key):
    """
    Returns one id (or None = new row) per incoming item. Uses the ids the
    editor sent; when it sent none at all, falls back to position so a
    plain re-save still updates rows in place.
    """
    existing = list(existing_ids)
    sent = [_int_or_none(item.get(id_key)) for item in incoming]
    if any(sent):
        valid = set(existing)
        return [i if i in valid else None for i in sent]
    return [existing[pos] if pos < len(existing) else None for pos in range(len(incoming))]


class MCQActivityController:
    """
    Controller for Multiple Choice questions and option sets
    (mcq_questions_tbl and mcq_options_tbl).
    """

    @staticmethod
    def _existing_questions(cursor, la_id):
        cursor.execute(
            f"SELECT q_id, question_text FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s ORDER BY sort_order ASC, q_id ASC",
            (la_id,)
        )
        return cursor.fetchall()

    @staticmethod
    def _existing_options(cursor, q_id):
        cursor.execute(
            f"SELECT option_id, option_text FROM {MCQ_OPTIONS_TABLE} WHERE q_id = %s ORDER BY option_letter ASC, option_id ASC",
            (q_id,)
        )
        return cursor.fetchall()

    @staticmethod
    def _delete_questions(cursor, rows):
        """rows: [(q_id, text), ...] - refuses if any learner answered them."""
        if not rows:
            return
        answered = _answered_ids(cursor, MCQ_ANSWERS_TABLE, "q_id", [r[0] for r in rows])
        if answered:
            text = next(r[1] for r in rows if r[0] in answered)
            raise ContentInUseError(
                f'Learners already answered the question "{_short(text)}", so it can\'t be removed. '
                "Edit its text instead, or keep it."
            )
        for q_id, _text in rows:
            cursor.execute(f"DELETE FROM {MCQ_OPTIONS_TABLE} WHERE q_id = %s", (q_id,))
            cursor.execute(f"DELETE FROM {MCQ_QUESTIONS_TABLE} WHERE q_id = %s", (q_id,))

    @staticmethod
    def clear(cursor, la_id):
        MCQActivityController._delete_questions(
            cursor, MCQActivityController._existing_questions(cursor, la_id)
        )

    @staticmethod
    def save(cursor, la_id, questions):
        incoming = [q for q in (questions or []) if (q.get("text") or "").strip()]
        existing = MCQActivityController._existing_questions(cursor, la_id)
        matched = _match_ids(incoming, [r[0] for r in existing], "q_id")

        kept = set()
        # sort_order = the question's position in the builder (0, 1, 2...),
        # which is the order Quiz learners get them in.
        for sort_order, (q, q_id) in enumerate(zip(incoming, matched)):
            text = capitalize_first_only(q.get("text").strip())
            # feat/hints-feedback: one correct + one wrong text per question
            correct_fb = _fmt_optional(q.get("correct_feedback") or q.get("correctFeedback"))
            wrong_fb = _fmt_optional(q.get("incorrect_feedback") or q.get("incorrectFeedback"))
            if q_id:
                cursor.execute(
                    f"""UPDATE {MCQ_QUESTIONS_TABLE} SET question_text = %s, sort_order = %s,
                            correct_feedback = %s, incorrect_feedback = %s WHERE q_id = %s""",
                    (text, sort_order, correct_fb, wrong_fb, q_id)
                )
            else:
                cursor.execute(
                    f"""INSERT INTO {MCQ_QUESTIONS_TABLE}
                        (la_id, question_text, sort_order, correct_feedback, incorrect_feedback)
                        VALUES (%s, %s, %s, %s, %s)""",
                    (la_id, text, sort_order, correct_fb, wrong_fb)
                )
                q_id = cursor.lastrowid
            kept.add(q_id)
            MCQActivityController._save_options(cursor, q_id, q)

        MCQActivityController._delete_questions(
            cursor, [(r[0], r[1]) for r in existing if r[0] not in kept]
        )

    @staticmethod
    def _save_options(cursor, q_id, question):
        try:
            correct_index = int(question.get("correct_option"))
        except (TypeError, ValueError):
            correct_index = None

        # Keep each option's position from the builder (so correct_option
        # still points at the right one), dropping blank rows.
        raw_options = question.get("options") or []
        incoming = [(idx, opt) for idx, opt in enumerate(raw_options) if (opt.get("text") or "").strip()]
        existing = MCQActivityController._existing_options(cursor, q_id)
        matched = _match_ids([opt for _idx, opt in incoming], [r[0] for r in existing], "option_id")

        kept = set()
        for position, ((idx, opt), option_id) in enumerate(zip(incoming, matched)):
            letter = chr(65 + position)
            text = opt.get("text").strip()  # answer option - saved exactly as typed
            text = opt.get("text").strip()  # answer option - saved exactly as typed (only trimmed)
            is_correct = 1 if correct_index == idx else 0
            raw_feedback = (opt.get("feedback") or "").strip()
            feedback = capitalize_first_only(raw_feedback) if raw_feedback else None
            if option_id:
                cursor.execute(
                    f"""UPDATE {MCQ_OPTIONS_TABLE}
                        SET option_letter = %s, option_text = %s, is_correct = %s, feedback = %s
                        WHERE option_id = %s""",
                    (letter, text, is_correct, feedback, option_id)
                )
            else:
                cursor.execute(
                    f"""INSERT INTO {MCQ_OPTIONS_TABLE}
                        (q_id, option_letter, option_text, is_correct, feedback)
                        VALUES (%s, %s, %s, %s, %s)""",
                    (q_id, letter, text, is_correct, feedback)
                )
                option_id = cursor.lastrowid
            kept.add(option_id)

        removed = [r for r in existing if r[0] not in kept]
        if removed:
            answered = _answered_ids(cursor, MCQ_ANSWERS_TABLE, "option_id", [r[0] for r in removed])
            if answered:
                text = next(r[1] for r in removed if r[0] in answered)
                raise ContentInUseError(
                    f'Learners already picked the answer option "{_short(text)}", so it can\'t be removed. '
                    "Edit its text instead, or keep it."
                )
            for option_id, _text in removed:
                cursor.execute(f"DELETE FROM {MCQ_OPTIONS_TABLE} WHERE option_id = %s", (option_id,))

    @staticmethod
    def fetch(cursor, la_id):
        cursor.execute(
            f"""SELECT q_id, question_text, correct_feedback, incorrect_feedback
                FROM {MCQ_QUESTIONS_TABLE} WHERE la_id = %s ORDER BY sort_order ASC, q_id ASC""",
            (la_id,)
        )
        question_rows = cursor.fetchall()

        questions = []
        for q in question_rows:
            cursor.execute(
                f"""SELECT option_id, option_letter, option_text, is_correct, feedback
                    FROM {MCQ_OPTIONS_TABLE} WHERE q_id = %s ORDER BY option_letter ASC, option_id ASC""",
                (q["q_id"],)
            )
            option_rows = cursor.fetchall()
            options = [
                {
                    "option_id": o["option_id"],
                    "text": o["option_text"],
                    "feedback": o.get("feedback") or "",
                }
                for o in option_rows
            ]
            correct_option = next(
                (i for i, o in enumerate(option_rows) if o["is_correct"]), None
            )
            questions.append({
                "q_id": q["q_id"],
                "text": q["question_text"],
                "options": options,
                "correct_option": correct_option,
                "correct_feedback": q.get("correct_feedback") or "",
                "incorrect_feedback": q.get("incorrect_feedback") or "",
            })
        return questions


class _SimpleItemController:
    """
    Shared in-place save for the two one-row-per-item tables
    (Fill in the Blanks, Flashcards). Subclasses set the table/column names
    and how to read one incoming item.
    """
    TABLE = ""
    ID = ""
    ANSWERS_TABLE = ""
    LABEL = "item"
    COLUMNS = ()          # data columns written on insert/update, in order

    @classmethod
    def _values(cls, item):
        """Returns a tuple matching COLUMNS, or None to skip a blank item."""
        raise NotImplementedError

    @classmethod
    def _existing(cls, cursor, la_id):
        cursor.execute(
            f"SELECT {cls.ID}, {cls.COLUMNS[0]} FROM {cls.TABLE} WHERE la_id = %s ORDER BY {cls.ID} ASC",
            (la_id,)
        )
        return cursor.fetchall()

    @classmethod
    def _delete(cls, cursor, rows):
        if not rows:
            return
        answered = _answered_ids(cursor, cls.ANSWERS_TABLE, cls.ID, [r[0] for r in rows])
        if answered:
            text = next(r[1] for r in rows if r[0] in answered)
            raise ContentInUseError(
                f'Learners already answered the {cls.LABEL} "{_short(text)}", so it can\'t be removed. '
                "Edit it instead, or keep it."
            )
        for row_id, _text in rows:
            cursor.execute(f"DELETE FROM {cls.TABLE} WHERE {cls.ID} = %s", (row_id,))

    @classmethod
    def clear(cls, cursor, la_id):
        cls._delete(cursor, cls._existing(cursor, la_id))

    @classmethod
    def save(cls, cursor, la_id, items):
        incoming = []
        for item in (items or []):
            values = cls._values(item)
            if values is not None:
                incoming.append((item, values))
        existing = cls._existing(cursor, la_id)
        matched = _match_ids([item for item, _v in incoming], [r[0] for r in existing], cls.ID)

        kept = set()
        set_clause = ", ".join(f"{col} = %s" for col in cls.COLUMNS)
        insert_cols = ", ".join(("la_id",) + cls.COLUMNS)
        insert_marks = ", ".join(["%s"] * (len(cls.COLUMNS) + 1))
        for (_item, values), row_id in zip(incoming, matched):
            if row_id:
                cursor.execute(
                    f"UPDATE {cls.TABLE} SET {set_clause} WHERE {cls.ID} = %s",
                    values + (row_id,)
                )
            else:
                cursor.execute(
                    f"INSERT INTO {cls.TABLE} ({insert_cols}) VALUES ({insert_marks})",
                    (la_id,) + values
                )
                row_id = cursor.lastrowid
            kept.add(row_id)

        cls._delete(cursor, [(r[0], r[1]) for r in existing if r[0] not in kept])


def _fmt_optional(value):
    value = (value or "").strip()
    return capitalize_first_only(value) if value else None


class FillBlanksActivityController(_SimpleItemController):
    """
    Controller for Fill in the Blanks items (fill_blanks_tbl).
    """
    TABLE = FILL_BLANKS_TABLE
    ID = "fib_id"
    ANSWERS_TABLE = FIB_ANSWERS_TABLE
    LABEL = "item"
    COLUMNS = ("content", "correct_answer", "correct_feedback", "incorrect_feedback",
               "instruction", "code_text", "expected_output", "hint", "must_contain")

    @classmethod
    def _values(cls, fb):
        """
        feat/fib-console: a console item has a Question (instruction), the Code
        with its blank (code_text), the Correct answer and the Expected output
        (+ optional Hint and Must contain). `content` keeps question + code
        for every older reader (weak spots, staff views). An item with no
        code is an older text-match item and is saved as before.
        """
        answer = (fb.get("correct_answer") or fb.get("answer") or "").strip()
        code = (fb.get("code_text") or "").rstrip()
        question = (fb.get("instruction") or "").strip()
        expected = (fb.get("expected_output") or "").strip()
        if code.strip():
            if not question or not answer:
                return None
            content = f"{question}\n{code}"
        else:
            content = (fb.get("content") or fb.get("text") or "").strip()
            if not content or not answer:
                return None
            code, expected = None, None
        return (
            content,
            answer,  # saved exactly as typed (only trimmed) - answers are case-sensitive
            _fmt_optional(fb.get("correct_feedback") or fb.get("correctFeedback")),
            _fmt_optional(fb.get("incorrect_feedback") or fb.get("incorrectFeedback")),
            question or None,
            code,
            expected,
            (fb.get("hint") or "").strip() or None,
            (fb.get("must_contain") or "").strip() or None,
        )

    @classmethod
    def save(cls, cursor, la_id, items):
        # feat/fib-console: the code is filled with the correct answer and
        # really run; a mismatch with the Expected output refuses the save.
        from lesson_fill_blanks import check_fib_item_for_save
        for number, item in enumerate(items or [], start=1):
            values = cls._values(item)
            if values is None or not values[5]:
                continue
            ok, actual, error = check_fib_item_for_save(values[5], values[1], values[6])
            if not ok:
                got = f"the code stopped with an error:\n{error}" if error else f'it printed:\n{actual or "(nothing)"}'
                raise FibOutputMismatchError(
                    f"Item {number}: with the correct answer in the blank, {got}\n"
                    f"but the Expected output is:\n{values[6] or '(empty)'}\n"
                    "Fix the code, the answer or the expected output (or use Generate expected output)."
                )
        super().save(cursor, la_id, items)

    @staticmethod
    def fetch(cursor, la_id):
        cursor.execute(
            f"""SELECT fib_id, content, correct_answer, correct_feedback, incorrect_feedback,
                       instruction, code_text, expected_output, hint, must_contain
                FROM {FILL_BLANKS_TABLE} WHERE la_id = %s ORDER BY fib_id ASC""",
            (la_id,)
        )
        return [
            {
                "fib_id": row["fib_id"],
                "content": row["content"],
                "text": row["content"],
                "correct_answer": row["correct_answer"],
                "answer": row["correct_answer"],
                "correct_feedback": row.get("correct_feedback") or "",
                "correctFeedback": row.get("correct_feedback") or "",
                "incorrect_feedback": row.get("incorrect_feedback") or "",
                "incorrectFeedback": row.get("incorrect_feedback") or "",
                "instruction": row.get("instruction") or "",
                "code_text": row.get("code_text") or "",
                "expected_output": row.get("expected_output") or "",
                "hint": row.get("hint") or "",
                "must_contain": row.get("must_contain") or "",
            }
            for row in cursor.fetchall()
        ]


class FlashcardsActivityController(_SimpleItemController):
    """
    Controller for Flashcards items (flashcards_tbl).
    """
    TABLE = FLASHCARDS_TABLE
    ID = "flashcard_id"
    ANSWERS_TABLE = FLASHCARD_ANSWERS_TABLE
    LABEL = "flashcard"
    COLUMNS = ("front_text", "back_text", "correct_feedback", "incorrect_feedback", "hint")

    @classmethod
    def _values(cls, fc):
        front = (fc.get("front") or fc.get("front_text") or "").strip()
        back = (fc.get("back") or fc.get("back_text") or "").strip()
        if not front or not back:
            return None
        return (
            format_display_name(front),
            back,  # saved exactly as typed (only trimmed) - answers are case-sensitive
            _fmt_optional(fc.get("correct_feedback") or fc.get("correctFeedback")),
            _fmt_optional(fc.get("incorrect_feedback") or fc.get("incorrectFeedback")),
            (fc.get("hint") or "").strip() or None,   # feat/hints-feedback
        )

    @staticmethod
    def fetch(cursor, la_id):
        cursor.execute(
            f"""SELECT flashcard_id, front_text, back_text, correct_feedback, incorrect_feedback, hint
                FROM {FLASHCARDS_TABLE} WHERE la_id = %s ORDER BY flashcard_id ASC""",
            (la_id,)
        )
        return [
            {
                "flashcard_id": row["flashcard_id"],
                "front": row["front_text"],
                "front_text": row["front_text"],
                "back": row["back_text"],
                "back_text": row["back_text"],
                "correct_feedback": row.get("correct_feedback") or "",
                "correctFeedback": row.get("correct_feedback") or "",
                "incorrect_feedback": row.get("incorrect_feedback") or "",
                "incorrectFeedback": row.get("incorrect_feedback") or "",
                "hint": row.get("hint") or "",
            }
            for row in cursor.fetchall()
        ]


class ActivityContentRouter:
    """
    Router that coordinates saving, retrieval, and clearing across
    all activity content controllers.
    """

    CONTROLLERS = {
        "Multiple Choice": MCQActivityController,
        "Fill in the Blanks": FillBlanksActivityController,
        "Flashcards": FlashcardsActivityController,
        "Quiz": MCQActivityController,  # same questions/options tables as MCQ
    }

    ALL = (MCQActivityController, FillBlanksActivityController, FlashcardsActivityController)

    @classmethod
    def get_controller(cls, activity_type):
        name = (activity_type or "").strip()
        return cls.CONTROLLERS.get(name)

    @classmethod
    def clear_all(cls, cursor, la_id):
        for controller in cls.ALL:
            controller.clear(cursor, la_id)

    @classmethod
    def route_insertion(cls, cursor, la_id, activity_type, questions=None,
                        fill_blanks=None, flashcards=None):
        """
        Saves the selected type's items in place and removes content of
        the OTHER types (left over after the activity type was changed).
        Raises ContentInUseError if something learners answered would be
        removed.
        """
        controller = cls.get_controller(activity_type)
        for other in cls.ALL:
            if other is not controller:
                other.clear(cursor, la_id)
        if controller is MCQActivityController:
            controller.save(cursor, la_id, questions)
        elif controller is FillBlanksActivityController:
            controller.save(cursor, la_id, fill_blanks)
        elif controller is FlashcardsActivityController:
            controller.save(cursor, la_id, flashcards)


def save_activity_content(connection, la_id, activity_type, questions=None,
                           fill_blanks=None, flashcards=None):
    """
    Saves la_id's Section 2 content in place (see the module docstring),
    scoped to `activity_type`. Operates on the caller's open connection
    for transaction atomicity - the caller commits, or rolls back on
    ContentInUseError / Error.
    """
    cursor = connection.cursor()
    try:
        ActivityContentRouter.route_insertion(
            cursor, la_id, activity_type,
            questions=questions, fill_blanks=fill_blanks, flashcards=flashcards
        )
    finally:
        cursor.close()


def get_activity_content(la_id):
    """
    Reloads Section 2 content across all activity types for the given la_id,
    with every row's id so the editor can save them back in place.
    """
    empty = {"questions": [], "fill_blanks": [], "flashcards": []}
    if not la_id:
        return empty
    try:
        la_id = int(la_id)
    except (TypeError, ValueError):
        return empty

    from cobradb import get_db_connection
    from game_plays import ensure_play_schema   # the hint / feedback / console columns
    connection = get_db_connection()
    if connection is None:
        return empty

    try:
        ensure_play_schema(connection)
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