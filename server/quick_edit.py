"""
quick_edit.py - edit ONE item from the preview's Review list
(feat/quick-edit-items). Mentors only (role_permissions.py).
--------------------------------------------------------------------------
Item kinds and their rows:
    mcq        mcq_questions_tbl + its options (mcq_options_tbl)
    fib        fill_blanks_tbl
    flashcard  flashcards_tbl
    exercise   coding_exercises_tbl  (required tags are not edited here)

The Review list (preview_play.get_review_list) loads every item through
the load_* functions below, so each item carries:
    id, version  - a hash of the item's saved values. Save sends it back;
                   if the saved values changed since (someone else saved),
                   the save is refused instead of overwriting their work.
    answered     - how many learners already answered it (their results
                   stay as they are; the item is still editable).

Saving:
    - the shared rules (item_rules.py, the same the editors use);
    - only EXISTING fields: no option / item is added or removed;
    - rows are updated in place (same ids - learners' answers stay linked),
      with the same formatting the full editor's save applies;
    - the parent activity / exercise gets updated_at = NOW(), so a
      Published one shows "Edited" on the Publishing page;
    - the status never changes.
"""

import hashlib
import json
import re

from mysql.connector import Error

from cobradb import get_db_connection
from item_rules import check_mcq, check_fib, check_flashcard, check_exercise
from learning_activity_content import (
    MCQ_QUESTIONS_TABLE, MCQ_OPTIONS_TABLE, FILL_BLANKS_TABLE, FLASHCARDS_TABLE,
    MCQ_ANSWERS_TABLE, FIB_ANSWERS_TABLE, FLASHCARD_ANSWERS_TABLE,
    MCQActivityController, FillBlanksActivityController, FlashcardsActivityController,
    _fmt_optional,
)
from lesson_fill_blanks import parse_fib_choices
from text_formatting import capitalize_first_only

LEARNING_ACTIVITIES_TABLE = "learning_activities_tbl"
LA_STATS_TABLE = "learning_activities_stats_tbl"
CODING_EXERCISES_TABLE = "coding_exercises_tbl"
SUBMISSIONS_TABLE = "exercise_submissions_tbl"

KINDS = ("mcq", "fib", "flashcard", "exercise")
CHANGED_MESSAGE = "This item was changed by someone else a moment ago. Reload it?"
# create-learning-activity.js splitFlashcardFront - the same pattern
FRONT_CODE_RE = re.compile(r"```(?:[ \t]*(?:python3?|py)?[ \t]*\n)?([\s\S]*?)(?:```|$)", re.IGNORECASE)


class QuickEditError(Exception):
    def __init__(self, message, status=400, code=None):
        super().__init__(message)
        self.status = status
        self.code = code


def _version(values):
    raw = json.dumps(values, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def _answered_counts(cursor, table, column, ids):
    """{id: number of different learners who answered it}."""
    ids = [i for i in ids if i]
    if not ids:
        return {}
    marks = ",".join(["%s"] * len(ids))
    cursor.execute(
        f"SELECT {column} AS item_id, COUNT(DISTINCT acc_id) AS learners FROM {table} "
        f"WHERE {column} IN ({marks}) GROUP BY {column}",
        tuple(ids)
    )
    return {r["item_id"]: int(r["learners"]) for r in cursor.fetchall()}


def split_flashcard_front(front):
    """'Question\\n```\\ncode\\n```' -> ("Question", "code") - create-learning-activity.js splitFlashcardFront."""
    source = (front or "").replace("\r\n", "\n").replace("\r", "\n")
    match = FRONT_CODE_RE.search(source)
    if not match:
        return source.strip(), ""
    question = (source[:match.start()] + source[match.end():]).strip()
    return question, re.sub(r"^\n+|\s+$", "", match.group(1))


# ============================================================
# LOAD - shared by the Review list and Save (same values = same version)
# ============================================================
def load_mcq(cursor, la_id=None, q_id=None):
    where, param = ("q.q_id = %s", q_id) if q_id else ("q.la_id = %s", la_id)
    cursor.execute(
        f"""SELECT q.q_id, q.la_id, q.question_text, q.correct_feedback, q.incorrect_feedback
            FROM {MCQ_QUESTIONS_TABLE} q WHERE {where} AND q.is_removed = 0
            ORDER BY q.sort_order ASC, q.q_id ASC""",
        (param,)
    )
    rows = cursor.fetchall()
    answered = _answered_counts(cursor, MCQ_ANSWERS_TABLE, "q_id", [r["q_id"] for r in rows])
    items = []
    for q in rows:
        cursor.execute(
            f"""SELECT option_id, option_letter, option_text, is_correct, feedback
                FROM {MCQ_OPTIONS_TABLE} WHERE q_id = %s AND is_removed = 0
                ORDER BY option_letter ASC, option_id ASC""",
            (q["q_id"],)
        )
        options = [{"id": o["option_id"], "letter": o["option_letter"], "text": o["option_text"] or "",
                    "correct": bool(o["is_correct"]), "feedback": o["feedback"] or ""}
                   for o in cursor.fetchall()]
        item = {
            "kind": "mcq", "id": q["q_id"], "la_id": q["la_id"],
            "question": q["question_text"] or "",
            "options": options,
            "correct_feedback": q["correct_feedback"] or "",
            "incorrect_feedback": q["incorrect_feedback"] or "",
        }
        item["version"] = _version([item["question"], options, item["correct_feedback"], item["incorrect_feedback"]])
        item["answered"] = answered.get(q["q_id"], 0)
        items.append(item)
    return items


FIB_FIELDS = ("instruction", "content", "code_text", "correct_answer", "must_contain",
              "expected_output", "hint", "correct_feedback", "incorrect_feedback")


def load_fib(cursor, la_id=None, fib_id=None):
    where, param = ("fib_id = %s", fib_id) if fib_id else ("la_id = %s", la_id)
    cursor.execute(
        f"""SELECT fib_id, la_id, {", ".join(FIB_FIELDS)}, answer_choices
            FROM {FILL_BLANKS_TABLE} WHERE {where} AND is_removed = 0
            ORDER BY sort_order ASC, fib_id ASC""",
        (param,)
    )
    rows = cursor.fetchall()
    answered = _answered_counts(cursor, FIB_ANSWERS_TABLE, "fib_id", [r["fib_id"] for r in rows])
    items = []
    for r in rows:
        item = {"kind": "fib", "id": r["fib_id"], "la_id": r["la_id"]}
        item.update({key: r[key] or "" for key in FIB_FIELDS})
        item["wrong_choices"] = parse_fib_choices(r["answer_choices"])   # tile mode only
        item["version"] = _version([item[k] for k in FIB_FIELDS] + [item["wrong_choices"]])
        item["answered"] = answered.get(r["fib_id"], 0)
        items.append(item)
    return items


FLASHCARD_FIELDS = ("front_text", "back_text", "hint", "correct_feedback", "incorrect_feedback")


def load_flashcard(cursor, la_id=None, flashcard_id=None):
    where, param = ("flashcard_id = %s", flashcard_id) if flashcard_id else ("la_id = %s", la_id)
    cursor.execute(
        f"""SELECT flashcard_id, la_id, {", ".join(FLASHCARD_FIELDS)}
            FROM {FLASHCARDS_TABLE} WHERE {where} AND is_removed = 0 ORDER BY flashcard_id ASC""",
        (param,)
    )
    rows = cursor.fetchall()
    answered = _answered_counts(cursor, FLASHCARD_ANSWERS_TABLE, "flashcard_id", [r["flashcard_id"] for r in rows])
    items = []
    for r in rows:
        item = {"kind": "flashcard", "id": r["flashcard_id"], "la_id": r["la_id"]}
        item.update({key: r[key] or "" for key in FLASHCARD_FIELDS})
        item["front"], item["front_code"] = split_flashcard_front(item["front_text"])
        item["version"] = _version([item[k] for k in FLASHCARD_FIELDS])
        item["answered"] = answered.get(r["flashcard_id"], 0)
        items.append(item)
    return items


EXERCISE_FIELDS = ("instruction", "situation", "problem_question", "clue", "correct_feedback")


def load_exercise(cursor, exercise_id):
    """The exercise's editable values (expected output / given input as the learner page reads them)."""
    from coding_exercises import load_exercise_spec, tag_dict
    cursor.execute(
        f"""SELECT exercise_id, exercise_title, {", ".join(EXERCISE_FIELDS)},
                   COALESCE((SELECT la_stats_name FROM {LA_STATS_TABLE} WHERE la_stats_id = ce.exercise_stats_id), 'Draft') AS status_name,
                   COALESCE(ce.is_archived, 0) AS is_archived
            FROM {CODING_EXERCISES_TABLE} ce WHERE exercise_id = %s""",
        (exercise_id,)
    )
    row = cursor.fetchone()
    if not row:
        return None
    spec = load_exercise_spec(cursor, exercise_id) or {"expected_output": "", "given_input": "", "tags": []}
    item = {"kind": "exercise", "id": row["exercise_id"], "exercise_id": row["exercise_id"],
            "title": row["exercise_title"] or "Coding Exercise", "status": row["status_name"],
            "archived": bool(row["is_archived"])}
    item.update({key: row[key] or "" for key in EXERCISE_FIELDS})
    item["question"] = item["problem_question"]            # the Review list's name for it
    item["expected_output"] = spec["expected_output"]
    item["given_input"] = spec["given_input"]
    item["required"] = [tag_dict(k, v)["label"] for k, v in spec["tags"]]
    item["version"] = _version([item[k] for k in EXERCISE_FIELDS] + [item["expected_output"], item["given_input"]])
    cursor.execute(f"SELECT COUNT(DISTINCT acc_id) AS learners FROM {SUBMISSIONS_TABLE} WHERE exercise_id = %s",
                   (exercise_id,))
    item["answered"] = int((cursor.fetchone() or {}).get("learners") or 0)
    return item


def _activity(cursor, la_id, lock=False):
    cursor.execute(
        f"""SELECT la.la_id, la.activity_title, COALESCE(las.la_stats_name, 'Draft') AS status_name
            FROM {LEARNING_ACTIVITIES_TABLE} la
            LEFT JOIN {LA_STATS_TABLE} las ON la.la_stats_id = las.la_stats_id
            WHERE la.la_id = %s""" + (" FOR UPDATE" if lock else ""),
        (la_id,)
    )
    return cursor.fetchone()


def _load_one(cursor, kind, item_id):
    if kind == "mcq":
        items = load_mcq(cursor, q_id=item_id)
    elif kind == "fib":
        items = load_fib(cursor, fib_id=item_id)
    elif kind == "flashcard":
        items = load_flashcard(cursor, flashcard_id=item_id)
    else:
        item = load_exercise(cursor, item_id)
        items = [item] if item else []
    return items[0] if items else None


# ============================================================
# SAVE
# ============================================================
def _text(data, key):
    value = data.get(key)
    return value if isinstance(value, str) else ("" if value is None else str(value))


def _save_mcq(cursor, item, data):
    sent = {}
    for opt in data.get("options") or []:
        try:
            sent[int(opt.get("id"))] = opt
        except (TypeError, ValueError):
            raise QuickEditError("An answer option is missing its id - reload and try again.")
    existing_ids = [o["id"] for o in item["options"]]
    if sorted(sent) != sorted(existing_ids):
        raise QuickEditError("Quick edit can't add or remove options - use the full editor for that.")
    try:
        correct_id = int(data.get("correct_option_id"))
    except (TypeError, ValueError):
        correct_id = None
    options = [{"option_id": oid, "text": _text(sent[oid], "text"), "feedback": _text(sent[oid], "feedback")}
               for oid in existing_ids]
    question = {
        "text": _text(data, "question"),
        "options": options,
        "correct_option": existing_ids.index(correct_id) if correct_id in existing_ids else None,
        # Not boxes in the editor's question card: kept as saved unless sent.
        "correct_feedback": _text(data, "correct_feedback") if "correct_feedback" in data else item["correct_feedback"],
        "incorrect_feedback": _text(data, "incorrect_feedback") if "incorrect_feedback" in data else item["incorrect_feedback"],
    }
    problem = check_mcq(question, "This question", strict=True)
    if problem:
        raise QuickEditError(problem)
    # Same formatting as the editor's save (MCQActivityController.save).
    cursor.execute(
        f"""UPDATE {MCQ_QUESTIONS_TABLE} SET question_text = %s, correct_feedback = %s, incorrect_feedback = %s
            WHERE q_id = %s""",
        (capitalize_first_only(question["text"].strip()), _fmt_optional(question["correct_feedback"]),
         _fmt_optional(question["incorrect_feedback"]), item["id"])
    )
    MCQActivityController._save_options(cursor, item["id"], question)


def _save_fib(cursor, item, data):
    # The editor's boxes. A box not sent keeps its saved value - e.g. the
    # tile "wrong choices" (no box in the editor) or an older item's text.
    keys = ("instruction", "content", "code_text", "correct_answer", "must_contain",
            "expected_output", "hint", "correct_feedback", "incorrect_feedback")
    fields = {key: (_text(data, key) if key in data else item[key]) for key in keys}
    if fields["code_text"].strip():
        fields["content"] = ""            # rebuilt from Question + Code, as the editor's save does
    raw_choices = data["wrong_choices"] if "wrong_choices" in data else item["wrong_choices"]
    if isinstance(raw_choices, str):
        raw_choices = raw_choices.splitlines()
    fields["wrong_choices"] = [str(c).strip() for c in raw_choices or [] if str(c).strip()]
    problem = check_fib(fields, "This item", strict=True, run_code=True)
    if problem:
        raise QuickEditError(problem)
    values = FillBlanksActivityController._values(fields)     # same formatting as the editor's save
    if values is None:
        raise QuickEditError("This item: the question and the correct answer are required.")
    set_clause = ", ".join(f"{col} = %s" for col in FillBlanksActivityController.COLUMNS)
    cursor.execute(
        f"UPDATE {FILL_BLANKS_TABLE} SET {set_clause}, answer_choices = %s WHERE fib_id = %s",
        values + (json.dumps(parse_fib_choices(fields["wrong_choices"]), ensure_ascii=False)
                  if fields["wrong_choices"] else None, item["id"])
    )


def _save_flashcard(cursor, item, data):
    card = {key: _text(data, key) for key in ("front", "front_code", "back", "hint",
                                               "correct_feedback", "incorrect_feedback")}
    problem = check_flashcard(card, "This flashcard", strict=True)
    if problem:
        raise QuickEditError(problem)
    values = FlashcardsActivityController._values(card)       # same formatting as the editor's save
    set_clause = ", ".join(f"{col} = %s" for col in FlashcardsActivityController.COLUMNS)
    cursor.execute(f"UPDATE {FLASHCARDS_TABLE} SET {set_clause} WHERE flashcard_id = %s", values + (item["id"],))


def _save_exercise(cursor, item, data):
    from coding_exercises import keep_as_typed
    values = {key: _text(data, key) for key in EXERCISE_FIELDS}
    values["expected_answer"] = keep_as_typed(data.get("expected_output"))
    values["given_input"] = keep_as_typed(data.get("given_input"))
    problem = check_exercise(values, "This exercise", strict=True)
    if problem:
        raise QuickEditError(problem)
    # The exercise editor capitalizes the first letter of these (Expected
    # output / Given input stay exactly as typed).
    cased = {key: capitalize_first_only(values[key].strip()) for key in EXERCISE_FIELDS}
    cursor.execute(
        f"""UPDATE {CODING_EXERCISES_TABLE}
            SET instruction = %s, situation = %s, problem_question = %s, clue = %s,
                correct_feedback = %s, expected_answer = %s, given_input = %s, updated_at = NOW()
            WHERE exercise_id = %s""",
        (cased["instruction"], cased["situation"], cased["problem_question"], cased["clue"],
         cased["correct_feedback"], values["expected_answer"], values["given_input"], item["id"])
    )


SAVERS = {"mcq": _save_mcq, "fib": _save_fib, "flashcard": _save_flashcard, "exercise": _save_exercise}
TYPE_OF_KIND = {"mcq": ("Multiple Choice", "Quiz"), "fib": ("Fill in the Blanks",), "flashcard": ("Flashcards",)}


def save_item(kind, item_id, data):
    """
    Returns (item, None) with the item as the Review list shows it after
    the save, or (None, QuickEditError).
    """
    if kind not in KINDS:
        return None, QuickEditError("Unknown item type.", 404)
    try:
        item_id = int(item_id)
    except (TypeError, ValueError):
        return None, QuickEditError("Invalid item.", 404)

    from coding_exercises import ensure_output_exercise_schema
    connection = get_db_connection()
    if connection is None:
        return None, QuickEditError("Could not connect to the database.", 500)
    try:
        ensure_output_exercise_schema(connection)   # DDL commits implicitly - before the transaction
        connection.start_transaction()
        cursor = connection.cursor(dictionary=True)

        # Lock the parent row first (every quick edit and editor save of the
        # same activity / exercise waits here), then read the saved values.
        if kind == "exercise":
            cursor.execute(f"SELECT exercise_id FROM {CODING_EXERCISES_TABLE} WHERE exercise_id = %s FOR UPDATE",
                           (item_id,))
            if not cursor.fetchone():
                raise QuickEditError("This exercise no longer exists.", 404)
            item = load_exercise(cursor, item_id)
            if item["archived"] or item["status"] == "Archived":
                raise QuickEditError("This exercise is archived - it can't be edited.", 409)
            parent = None
        else:
            item = _load_one(cursor, kind, item_id)
            if not item:
                raise QuickEditError("This item no longer exists - it may have been removed. Reload the list.", 404)
            parent = _activity(cursor, item["la_id"], lock=True)
            if not parent or parent["status_name"] == "Archived":
                raise QuickEditError("This activity is archived - it can't be edited.", 409)
            item = _load_one(cursor, kind, item_id)      # read again under the lock

        if not item or data.get("version") != item["version"]:
            raise QuickEditError(CHANGED_MESSAGE, 409, code="changed")

        plain = connection.cursor()            # learning_activity_content's controllers read tuples
        SAVERS[kind](plain, item, data)
        plain.close()
        if parent:
            cursor.execute(f"UPDATE {LEARNING_ACTIVITIES_TABLE} SET updated_at = NOW() WHERE la_id = %s",
                           (parent["la_id"],))
        connection.commit()

        fresh = _load_one(cursor, kind, item_id)
        if parent:
            fresh["status"] = parent["status_name"]
        cursor.close()
        return fresh, None
    except QuickEditError as e:
        connection.rollback()
        return None, e
    except Error as e:
        connection.rollback()
        print(f"quick_edit: failed to save {kind} {item_id}: {e}")
        return None, QuickEditError("Could not save - database error. Please try again.", 500)
    finally:
        if connection.is_connected():
            connection.close()
