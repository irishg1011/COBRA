"""
lesson_content_validation.py - Minimum Lesson Content Length Validation
--------------------------------------------------------------------------
Enforces that a lesson's rich-text content (lesson_content_tbl.content_body)
contains at least MIN_LESSON_CONTENT_CHARS characters of real, meaningful
text - not HTML markup, and not whitespace-only content.

WHY THIS EXISTS
resource_draft.save_lesson_draft() is the single save path used by BOTH
"Save Draft" and "Publish" (Task #45), for both a brand-new lesson and a
re-saved/edited one. Validating length there - not only in the browser -
means a lesson can never be saved with an empty/trivial body regardless
of how the request reaches the server.
"""

import re
from html import unescape

MIN_LESSON_CONTENT_CHARS = 20


def _strip_html(html_value):
    """Reduces HTML content to plain, human-readable text - stripping
    tags, decoding entities, and collapsing whitespace - so the length
    check below counts only real characters a reader would see."""
    if not html_value:
        return ""
    text = re.sub(r"<[^>]*>", " ", html_value)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def get_lesson_content_length(html_value):
    """Count of meaningful (non-markup, trimmed) characters."""
    return len(_strip_html(html_value))


def validate_lesson_content(html_value):
    """
    Returns (True, "") if the content has at least
    MIN_LESSON_CONTENT_CHARS meaningful characters, otherwise
    (False, error_message). Empty/whitespace-only is always invalid -
    leading/trailing spaces are stripped before counting.
    """
    length = get_lesson_content_length(html_value)
    if length < MIN_LESSON_CONTENT_CHARS:
        return False, (
            f"Lesson message must contain at least {MIN_LESSON_CONTENT_CHARS} "
            "characters of meaningful content."
        )
    return True, ""