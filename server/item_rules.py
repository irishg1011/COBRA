"""
item_rules.py - ONE set of rules for a single question / item / card /
coding exercise (feat/quick-edit-items)
--------------------------------------------------------------------------
Until now the item rules lived only in the editors' JavaScript
(create-learning-activity*.js, create-exercise.js); the server checked
just a few of them on Save Draft. These functions hold the same rules on
the server, used by:

    - Quick edit (quick_edit.py)            strict=True  (always)
    - the activity editor's Save Draft       strict=False (drafts may be half-filled)
    - the activity editor's Mark Ready       strict=True
    - the exercise editor's Mark Ready       strict=True

Each check returns None when the item is fine, else ONE message for the
mentor (the first problem found), already starting with `label`
("Question #3", "Item 2", ...).

Limits = the editors' character counters, or the column size when the
database is smaller.
"""

import re

MCQ_MIN_OPTIONS = 2
MCQ_MAX_OPTIONS = 6          # options A-F (learning_activity_draft.MCQ_MAX_OPTIONS)
FIB_MAX_WRONG_CHOICES = 7    # lesson_fill_blanks.FIB_MAX_WRONG_CHOICES
BLANK_RE = re.compile(r"\[?_{3,}\]?")   # lesson_fill_blanks.fill_blank

LIMITS = {
    "mcq_question": 1000,
    "mcq_option": 500,
    "mcq_option_feedback": 500,
    "feedback": 500,             # correct / incorrect feedback (varchar 500)
    "hint": 500,
    "fib_instruction": 500,
    "fib_answer": 255,
    "fib_must_contain": 255,
    "fib_choice": 255,
    "flashcard_front": 500,
    "flashcard_back": 500,
    "ex_instruction": 1000,
    "ex_situation": 500,
    "ex_question": 500,
    "ex_clue": 500,
    "ex_expected": 1000,
    "ex_feedback": 500,
}


def _text(value):
    return (value or "").strip() if isinstance(value, str) or value is None else str(value).strip()


def _too_long(label, field_name, value, limit_key):
    limit = LIMITS[limit_key]
    if len(value or "") > limit:
        return f"{label}: {field_name} is too long ({len(value)} characters, the most is {limit})."
    return None


def _first(*problems):
    return next((p for p in problems if p), None)


# ------------------------------------------------------------------
# Multiple Choice
# question = {"text", "options": [{"text", "feedback"}], "correct_option": index,
#             "correct_feedback", "incorrect_feedback"}   (the editor's shape)
# ------------------------------------------------------------------
def check_mcq(question, label, strict=True):
    text = _text(question.get("text"))
    options = question.get("options") or []
    filled = [o for o in options if _text(o.get("text"))]

    if strict and not text:
        return f"{label}: the question text is required."
    problem = _first(
        _too_long(label, "the question", text, "mcq_question"),
        _too_long(label, "the feedback if right", _text(question.get("correct_feedback")), "feedback"),
        _too_long(label, "the feedback if wrong", _text(question.get("incorrect_feedback")), "feedback"),
    )
    if problem:
        return problem
    if len(filled) > MCQ_MAX_OPTIONS:
        return f"{label} has more than {MCQ_MAX_OPTIONS} answer options (A-F)."
    if strict and len(filled) < MCQ_MIN_OPTIONS:
        return f"{label}: Multiple choice questions must have at least {MCQ_MIN_OPTIONS} options."

    seen = set()
    for index, option in enumerate(options):
        letter = chr(65 + index)
        opt_text = _text(option.get("text"))
        feedback = _text(option.get("feedback"))
        if strict and not opt_text:
            return f"{label}: the answer for Option {letter} is required."
        if strict and not feedback:
            return f"{label}: the feedback for Option {letter} is required."
        problem = _first(
            _too_long(label, f"Option {letter}", opt_text, "mcq_option"),
            _too_long(label, f"the feedback for Option {letter}", feedback, "mcq_option_feedback"),
        )
        if problem:
            return problem
        if not opt_text:
            continue
        # Exact text: "okay", "OKAY" and "Okay" are different choices.
        if opt_text in seen:
            return f'{label}: duplicate answer option "{opt_text}". Each option must have a unique answer.'
        seen.add(opt_text)
        if feedback and opt_text.lower() == feedback.lower():
            return f"{label}: Answer and Feedback for Learner cannot be identical (Option {letter})."

    if strict:
        try:
            correct = int(question.get("correct_option"))
        except (TypeError, ValueError):
            correct = None
        if correct is None or not (0 <= correct < len(options)):
            return f"{label}: please select the correct answer (exactly one option)."
    return None


# ------------------------------------------------------------------
# Fill in the Blanks
# item = {"instruction", "code_text", "correct_answer", "must_contain", "expected_output",
#         "hint", "content", "wrong_choices": [..], "correct_feedback", "incorrect_feedback"}
# ------------------------------------------------------------------
def check_fib(item, label, strict=True, run_code=True):
    question = _text(item.get("instruction"))
    code = (item.get("code_text") or "").rstrip()
    answer = _text(item.get("correct_answer") or item.get("answer"))
    expected = _text(item.get("expected_output"))
    content = _text(item.get("content"))

    if not strict:
        return None
    if not answer:
        return f"{label}: the correct answer is required."
    if code.strip():
        if not question:
            return f"{label}: the question is required."
        if not BLANK_RE.search(code):
            return f"{label}: the code needs its blank - mark it with ___ ."
        if not expected:
            return f"{label}: click Generate expected output (the code runs with the correct answer to fill it)."
    elif not content:
        return f"{label}: the question is required."

    problem = _first(
        _too_long(label, "the question", question, "fib_instruction"),
        _too_long(label, "the correct answer", answer, "fib_answer"),
        _too_long(label, "Must contain", _text(item.get("must_contain")), "fib_must_contain"),
        _too_long(label, "the hint", _text(item.get("hint")), "hint"),
        _too_long(label, "the feedback if right", _text(item.get("correct_feedback")), "feedback"),
        _too_long(label, "the feedback if wrong", _text(item.get("incorrect_feedback")), "feedback"),
    )
    if problem:
        return problem

    choices = [_text(c) for c in (item.get("wrong_choices") or [])]
    choices = [c for c in choices if c]
    if len(choices) > FIB_MAX_WRONG_CHOICES:
        return f"{label}: at most {FIB_MAX_WRONG_CHOICES} wrong choices."
    if len(set(choices)) != len(choices):
        return f"{label}: each wrong choice must be different."
    for choice in choices:
        if choice == answer:
            return f'{label}: the wrong choice "{choice}" is the correct answer.'
        problem = _too_long(label, "a wrong choice", choice, "fib_choice")
        if problem:
            return problem

    if run_code and code.strip():
        return check_fib_output(code, answer, expected, label)
    return None


def check_fib_output(code, answer, expected, label):
    """The code, run with the correct answer in its blank, must print the Expected output."""
    from lesson_fill_blanks import check_fib_item_for_save
    ok, actual, error = check_fib_item_for_save(code, answer, expected)
    if ok:
        return None
    got = f"the code stopped with an error:\n{error}" if error else f'it printed:\n{actual or "(nothing)"}'
    return (f"{label}: with the correct answer in the blank, {got}\n"
            f"but the Expected output is:\n{expected or '(empty)'}\n"
            "Fix the code, the answer or the expected output (or use Generate expected output).")


# ------------------------------------------------------------------
# Flashcards   card = {"front", "front_code", "back", "hint", feedbacks}
# ------------------------------------------------------------------
def check_flashcard(card, label, strict=True):
    front = _text(card.get("front") or card.get("front_text"))
    back = _text(card.get("back") or card.get("back_text"))
    if strict and not front:
        return f"{label}: the front card text is required."
    if strict and not back:
        return f"{label}: the back card text is required."
    return _first(
        _too_long(label, "the front card", front, "flashcard_front"),
        _too_long(label, "the back card", back, "flashcard_back"),
        _too_long(label, "the hint", _text(card.get("hint")), "hint"),
        _too_long(label, "the feedback if right", _text(card.get("correct_feedback")), "feedback"),
        _too_long(label, "the feedback if wrong", _text(card.get("incorrect_feedback")), "feedback"),
    )


# ------------------------------------------------------------------
# Coding exercise (create-exercise.js REQUIRED_FOR_READY)
# ------------------------------------------------------------------
EXERCISE_REQUIRED = (
    ("instruction", "Please provide Instructions", "ex_instruction"),
    ("situation", "Please describe the Problem Situation", "ex_situation"),
    ("problem_question", "Please state the Problem Question", "ex_question"),
    ("clue", "Please provide a Clue (hint)", "ex_clue"),
    ("expected_answer", "Please provide the Expected Output", "ex_expected"),
    ("correct_feedback", "Please provide Correct Feedback", "ex_feedback"),
)


def check_exercise(data, label, strict=True):
    for field, message, limit_key in EXERCISE_REQUIRED:
        value = data.get(field) or ""
        if strict and not value.strip():
            return f"{label}: {message}."
        if limit_key:
            problem = _too_long(label, field.replace("_", " ").replace("expected answer", "the expected output"),
                                value, limit_key)
            if problem:
                return problem
    return None


# ------------------------------------------------------------------
# A whole activity (the editor's Save Draft / Mark Ready)
# ------------------------------------------------------------------
def check_activity_items(activity_type, questions=None, fill_blanks=None, flashcards=None, strict=False):
    """First problem in the activity's items, or None. Labels match the editor's cards."""
    if activity_type in ("Multiple Choice", "Quiz"):
        for n, q in enumerate(questions or [], start=1):
            problem = check_mcq(q, f"Question #{n}", strict=strict)
            if problem:
                return problem
    elif activity_type == "Fill in the Blanks":
        # The code run happens on save (FillBlanksActivityController) - not twice.
        for n, item in enumerate(fill_blanks or [], start=1):
            problem = check_fib(item, f"Item {n}", strict=strict, run_code=False)
            if problem:
                return problem
    elif activity_type == "Flashcards":
        for n, card in enumerate(flashcards or [], start=1):
            problem = check_flashcard(card, f"Flashcard {n}", strict=strict)
            if problem:
                return problem
    return None
