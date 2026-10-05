"""
score_display.py - how a score LOOKS on the admin side (never how it is computed)
------------------------------------------------------------------------------
One color rule for every average score / score pill the admin pages show:

    below the pass mark   -> red     (score-fail)
    pass mark and above   -> green   (score-pass)
    no score ("—")        -> neutral (score-none)

The pass mark is NOT set here: it is activity_retakes.PASS_PERCENT (80), the
same value the module gate and the learner side use. admin_routes.py registers
score_class / score_badge_class as Jinja filters and passes `pass_mark` to the
templates; admin/js/admin-score.js applies the same rule in the browser, with
the pass mark read from the staff header (data-pass-mark), so 80 is written
in exactly one place.
"""

from activity_retakes import PASS_PERCENT

PASS_MARK = PASS_PERCENT


def score_value(value):
    """60, 60.4, '60%', ' 60 % ' -> 60; None, '', '—' or anything else -> None."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip().rstrip("%").strip()
    try:
        return float(text)
    except ValueError:
        return None


def score_passes(value):
    """True / False, or None when there is no score."""
    number = score_value(value)
    return None if number is None else number >= PASS_MARK


def score_class(value):
    """CSS class for a score number: score-pass / score-fail / score-none."""
    passed = score_passes(value)
    if passed is None:
        return "score-none"
    return "score-pass" if passed else "score-fail"


def score_badge_class(value):
    """Badge colour for a score pill (green / red). '' when there is no score."""
    passed = score_passes(value)
    if passed is None:
        return ""
    return "badge-active" if passed else "badge-locked"
