"""
learner_shuffle.py - Each learner gets their own question order
------------------------------------------------------------------------------
feat/learner-shuffle

On the learner side, the items of every activity (Multiple Choice
questions, Fill in the Blanks puzzles, Flashcards) are shown in a
different order for each learner, and the answer choices of a Multiple
Choice question are shuffled per learner too. "Number 3 is B" means
nothing to the learner sitting next to you.

HOW THE ORDER IS MADE
Nothing is stored. Each item gets a sort key worked out from
    learner id + activity (or question) id + item id
and the items are sorted by that key. So:
  - one learner always gets the SAME order for an activity - refresh,
    resume after running out of lives and the "Question 3 of 10" counter
    all keep working;
  - two learners get different orders;
  - adding or removing an item later does not reshuffle the others
    (every item's key depends only on its own id).

ONE copy of the rule: the three game engines (lesson_activities.py,
lesson_fill_blanks.py, lesson_flashcards.py) all call the helpers here,
so the server and the list sent to the browser can never disagree.

Staff views (editor, Preview & Play, Learner Progress, Recommendations)
never call this - they keep the order the mentor wrote.

Pure functions - no database, no Flask.
"""

import hashlib

OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _key(acc_id, scope, item_id):
    return hashlib.sha256(f"{acc_id}|{scope}|{item_id}".encode("utf-8")).hexdigest()


def learner_order(acc_id, scope, item_ids):
    """
    `item_ids` in THIS learner's order for `scope` (e.g. "la:12" for
    activity 12). No acc_id -> the list is returned as it was written.
    """
    ids = list(item_ids)
    if not acc_id:
        return ids
    return sorted(ids, key=lambda item_id: _key(acc_id, scope, item_id))


def order_rows(acc_id, scope, rows, id_key):
    """The same order as learner_order(), for a list of row dicts keyed by `id_key`."""
    rows = list(rows)
    if not acc_id:
        return rows
    return sorted(rows, key=lambda row: _key(acc_id, scope, row[id_key]))


def activity_scope(la_id):
    """Scope for the items of one activity."""
    return f"la:{la_id}"


def shuffle_options(acc_id, q_id, options, id_key="option_id", letter_key="option_letter"):
    """
    A Multiple Choice question's choices in THIS learner's order, with the
    letters re-issued by position (the first shown is always A, then B...).
    Answers are graded by option_id, never by letter, so grading is not
    affected. Returns new dicts; the input is not changed.
    """
    ordered = order_rows(acc_id, f"q:{q_id}", options, id_key)
    if not acc_id:
        return [dict(option) for option in ordered]
    relabelled = []
    for position, option in enumerate(ordered):
        option = dict(option)
        if position < len(OPTION_LETTERS):
            option[letter_key] = OPTION_LETTERS[position]
        relabelled.append(option)
    return relabelled