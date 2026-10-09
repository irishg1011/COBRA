"""
learning_activity_form_parser.py - Task #57: Multipart Form -> Section 2
Content Parser for Create Learning Activity (Publish submission)
--------------------------------------------------------------------------------------
WHY THIS EXISTS
create-learning-activity.html's Publish button is a real <form method="POST">
submit (create_activity_submit() in admin_routes.py), which arrives as a
normal multipart/form-data body - NOT JSON. Section 2's dynamically-added
question/fill-blank/flashcard cards (see create-learning-activity.js) are
submitted using bracketed, index-based field names, e.g.:

    questions[0][text]
    questions[0][options][0][text]
    questions[0][options][0][feedback]
    questions[0][correct_option]
    fill_blanks[2][content]
    fill_blanks[2][correct_answer]
    fill_blanks[2][correct_feedback]
    fill_blanks[2][incorrect_feedback]
    flashcards[1][front]
    flashcards[1][back]
    flashcards[1][correct_feedback]
    flashcards[1][incorrect_feedback]

This is a completely different shape than what Save Draft sends (a single
JSON body with already-nested lists - see
create-learning-activity-draft-guard.js's collectMultipleChoiceQuestions()/
collectFillBlanks()/collectFlashcards()). Before Task #57, nothing on the
backend ever turned this flat, bracketed multipart form back into that same
nested shape - which is exactly why admin_routes.py's create_activity_submit()
only ever had a "TODO: Insert activity and question sets" placeholder: there
was no parser to hand structured data to in the first place.

This file is that missing parser. Its three functions below return data in
EXACTLY the same shape learning_activity_content.save_activity_content()
(and activity_points.calculate_activity_points_from_lists()) already expect
from the Save Draft JSON path, so create_activity_submit() can pass its
result straight into learning_activity_draft.save_activity_draft() - the
exact same save path Save Draft uses - instead of a second, divergent
insert routine. Publish and Save Draft can therefore never disagree about
how Section 2 content is structured or persisted.

This file never touches Flask/session state or the database directly -
admin_routes.py is the only place these get turned into HTTP responses,
matching this project's existing convention (activity_points.py,
lesson_validation.py, etc.).
"""

import re

# Matches "questions[<n>][text]" -> group(1) = n
QUESTION_TEXT_PATTERN = re.compile(r"^questions\[(\d+)\]\[text\]$")
# Matches "questions[<n>][correct_option]" -> group(1) = n
QUESTION_CORRECT_PATTERN = re.compile(r"^questions\[(\d+)\]\[correct_option\]$")
# feat/hints-feedback: "questions[<n>][correct_feedback|incorrect_feedback]" (one pair per question)
QUESTION_FEEDBACK_PATTERN = re.compile(r"^questions\[(\d+)\]\[(correct_feedback|incorrect_feedback)\]$")
# Matches "questions[<n>][options][<m>][text|feedback]" -> group(1)=n, group(2)=m, group(3)=field
QUESTION_OPTION_PATTERN = re.compile(r"^questions\[(\d+)\]\[options\]\[(\d+)\]\[(text|feedback)\]$")

# Matches "fill_blanks[<n>][content|correct_answer|correct_feedback|incorrect_feedback]"
FILL_BLANK_FIELD_PATTERN = re.compile(
    r"^fill_blanks\[(\d+)\]\[(content|correct_answer|correct_feedback|incorrect_feedback"
    r"|instruction|code_text|expected_output|hint|must_contain)\]$"   # feat/fib-console
)

# Matches "flashcards[<n>][front|back|correct_feedback|incorrect_feedback]"
FLASHCARD_FIELD_PATTERN = re.compile(
    r"^flashcards\[(\d+)\]\[(front|front_code|back|correct_feedback|incorrect_feedback|hint)\]$"   # hint, front_code: feat/hints-feedback
)


def parse_questions_from_form(form):
    """
    Parses every "questions[<n>][...]" field out of a submitted multipart
    form (e.g. Flask's request.form, an ImmutableMultiDict) into a list of
    dicts, ordered by question index:

        [
            {
                "text": "...",
                "options": [{"text": "...", "feedback": "..."}, ...],
                "correct_option": 0,  # or None if no radio was checked
            },
            ...
        ]

    This is EXACTLY the shape learning_activity_content._save_questions()
    and activity_points.calculate_activity_points_from_lists() already
    expect from the Save Draft JSON path - so callers pass the result
    straight through, never re-shaping it a second time.

    Args:
        form: any mapping-like object exposing .keys() and .get(key) for
            every submitted field name (Flask's request.form works as-is).

    Returns:
        list[dict]: [] if no question fields were submitted at all.
    """
    by_index = {}

    for key in form.keys():
        match = QUESTION_TEXT_PATTERN.match(key)
        if match:
            idx = int(match.group(1))
            entry = by_index.setdefault(idx, {"text": "", "correct_option": None, "options": {}})
            entry["text"] = (form.get(key) or "").strip()
            continue

        match = QUESTION_FEEDBACK_PATTERN.match(key)
        if match:
            idx = int(match.group(1))
            entry = by_index.setdefault(idx, {"text": "", "correct_option": None, "options": {}})
            entry[match.group(2)] = (form.get(key) or "").strip()
            continue

        match = QUESTION_CORRECT_PATTERN.match(key)
        if match:
            idx = int(match.group(1))
            entry = by_index.setdefault(idx, {"text": "", "correct_option": None, "options": {}})
            raw_value = form.get(key)
            try:
                entry["correct_option"] = int(raw_value)
            except (TypeError, ValueError):
                entry["correct_option"] = None
            continue

        match = QUESTION_OPTION_PATTERN.match(key)
        if match:
            idx = int(match.group(1))
            opt_idx = int(match.group(2))
            field = match.group(3)
            entry = by_index.setdefault(idx, {"text": "", "correct_option": None, "options": {}})
            option = entry["options"].setdefault(opt_idx, {"text": "", "feedback": ""})
            option[field] = (form.get(key) or "").strip()

    questions = []
    for idx in sorted(by_index.keys()):
        entry = by_index[idx]
        ordered_options = [entry["options"][opt_idx] for opt_idx in sorted(entry["options"].keys())]
        questions.append({
            "text": entry["text"],
            "options": ordered_options,
            "correct_option": entry["correct_option"],
            "correct_feedback": entry.get("correct_feedback", ""),
            "incorrect_feedback": entry.get("incorrect_feedback", ""),
        })
    return questions


def parse_fill_blanks_from_form(form):
    """
    Parses every "fill_blanks[<n>][...]" field into a list of dicts,
    ordered by item index:

        [
            {
                "content": "...",
                "correct_answer": "...",
                "correct_feedback": "...",
                "incorrect_feedback": "...",
            },
            ...
        ]

    Matches the exact keys learning_activity_content._save_fill_blanks()
    already reads via fb.get("content")/fb.get("correct_answer")/etc.

    Returns:
        list[dict]: [] if no fill_blanks fields were submitted at all.
    """
    by_index = {}

    for key in form.keys():
        match = FILL_BLANK_FIELD_PATTERN.match(key)
        if not match:
            continue
        idx = int(match.group(1))
        field = match.group(2)
        entry = by_index.setdefault(idx, {
            "content": "",
            "correct_answer": "",
            "correct_feedback": "",
            "incorrect_feedback": "",
        })
        value = form.get(key) or ""
        # Code keeps its indentation; only trailing space is dropped.
        entry[field] = value.rstrip() if field == "code_text" else value.strip()

    return [by_index[idx] for idx in sorted(by_index.keys())]


def parse_flashcards_from_form(form):
    """
    Parses every "flashcards[<n>][...]" field into a list of dicts,
    ordered by item index:

        [
            {
                "front": "...",
                "back": "...",
                "correct_feedback": "...",
                "incorrect_feedback": "...",
            },
            ...
        ]

    Matches the exact keys learning_activity_content._save_flashcards()
    already reads via fc.get("front")/fc.get("back")/etc.

    Returns:
        list[dict]: [] if no flashcards fields were submitted at all.
    """
    by_index = {}

    for key in form.keys():
        match = FLASHCARD_FIELD_PATTERN.match(key)
        if not match:
            continue
        idx = int(match.group(1))
        field = match.group(2)
        entry = by_index.setdefault(idx, {
            "front": "",
            "back": "",
            "correct_feedback": "",
            "incorrect_feedback": "",
        })
        entry[field] = (form.get(key) or "").strip()

    return [by_index[idx] for idx in sorted(by_index.keys())]