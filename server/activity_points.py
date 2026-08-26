"""
activity_points.py - Task #55: Automatic Points Calculation for Learning
Activities
--------------------------------------------------------------------------------------
Single source of truth for computing a learning activity's points value
from the ACTUAL number of question / fill-blank / flashcard items
submitted with it - never from a client-supplied "points" field.

WHY THIS EXISTS
create-learning-activity.html's #activityPoints field is already
read-only, and create-learning-activity.js's updatePointsTotal() already
keeps its DISPLAYED value in sync in real time as items are added,
removed, duplicated, or moved in the Activity Content builder (Section 2),
and whenever Activity Type changes. That covers the FRONTEND half of
Task #55 ("update the points field automatically in real-time" /
"prevent manual overrides").

This file is the BACKEND half of the same rule: whatever the frontend
displayed is never trusted as-is. admin_routes.py's
create_activity_submit() (final Publish) calls
calculate_activity_points() on the raw submitted form data and uses
THAT number - never request.form.get('points') directly - so the
persisted points value can never drift from the real question count,
even if a request were hand-crafted to send a different "points" value.

This file never touches Flask/session state directly - admin_routes.py
is the only place this gets turned into an HTTP response, matching this
project's existing convention (lesson_validation.py, activity_validation.py,
manage_course.py, etc.).
"""

import re

# Mirrors create-learning-activity.html's #activityType <option> values
# exactly - never hardcoded anywhere else in the app.
MULTIPLE_CHOICE = "Multiple Choice"
FILL_IN_THE_BLANKS = "Fill in the Blanks"
FLASHCARDS = "Flashcards"

# Matches the bracketed-index prefix of each section's field names, e.g.
# "questions[0][text]" -> index 0, "fill_blanks[3][content]" -> index 3.
_INDEX_PATTERN_TEMPLATE = r"^{prefix}\[(\d+)\]"


def _count_indexed_items(form_keys, prefix):
    """
    Counts the number of DISTINCT bracketed indices used under `prefix`
    across an iterable of raw form-field names (e.g. request.form.keys()) -
    "questions[0][text]", "questions[0][options][0][text]", and
    "questions[1][text]" all belong to indices {0, 1}, giving a count of
    2, regardless of how many actual sub-fields each index has.

    Counts unique indices rather than trusting any single field's
    presence, so a partially-filled item (e.g. an option row with no
    feedback typed yet) still counts as one item - exactly matching what
    create-learning-activity.js's own querySelectorAll('.question-card')
    (etc.) count reflects client-side.
    """
    pattern = re.compile(_INDEX_PATTERN_TEMPLATE.format(prefix=re.escape(prefix)))
    indices = set()
    for key in form_keys:
        match = pattern.match(key)
        if match:
            indices.add(int(match.group(1)))
    return len(indices)


def count_questions_from_form(form_keys):
    """Multiple Choice item count - distinct questions[<n>] indices."""
    return _count_indexed_items(form_keys, "questions")


def count_fill_blanks_from_form(form_keys):
    """Fill in the Blanks item count - distinct fill_blanks[<n>] indices."""
    return _count_indexed_items(form_keys, "fill_blanks")


def count_flashcards_from_form(form_keys):
    """Flashcards item count - distinct flashcards[<n>] indices."""
    return _count_indexed_items(form_keys, "flashcards")


def calculate_activity_points(activity_type, form_keys):
    """
    Returns the correct points value for `activity_type`, counted
    directly from the raw submitted field names in `form_keys` (e.g.
    request.form.keys() from a normal multipart/form POST - which is
    exactly what create-learning-activity.html's Publish submission
    sends for Section 2's dynamically-named question/fill-blank/
    flashcard inputs).

    Args:
        activity_type (str | None): "Multiple Choice", "Fill in the
            Blanks", or "Flashcards" - matches
            create-learning-activity.html's #activityType values
            exactly.
        form_keys (iterable[str]): every field name submitted with the
            request.

    Returns:
        int: the real item count for the matching section. An
        unrecognized/missing activity_type returns 0 rather than
        guessing which section to count.
    """
    normalized = (activity_type or "").strip()
    if normalized == MULTIPLE_CHOICE:
        return count_questions_from_form(form_keys)
    if normalized == FILL_IN_THE_BLANKS:
        return count_fill_blanks_from_form(form_keys)
    if normalized == FLASHCARDS:
        return count_flashcards_from_form(form_keys)
    return 0


def calculate_activity_points_from_lists(activity_type, questions=None, fill_blanks=None, flashcards=None):
    """
    JSON-body counterpart to calculate_activity_points() above, for any
    future caller that receives already-parsed item lists (e.g. if the
    Save Draft endpoint is ever extended to submit Section 2's content -
    see learning_activity_draft.py's own docstring noting that scope is
    not implemented yet) instead of raw form field names. Uses the exact
    same "one list per activity_type" rule so there is never a second,
    divergent counting definition in the codebase.

    Args:
        activity_type (str | None): see calculate_activity_points().
        questions / fill_blanks / flashcards (list | None): the parsed
            item lists for each section, when available.

    Returns:
        int: 0 for a missing/unrecognized activity_type or a None list.
    """
    normalized = (activity_type or "").strip()
    if normalized == MULTIPLE_CHOICE:
        return len(questions or [])
    if normalized == FILL_IN_THE_BLANKS:
        return len(fill_blanks or [])
    if normalized == FLASHCARDS:
        return len(flashcards or [])
    return 0