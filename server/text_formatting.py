"""
text_formatting.py - Shared Display-Name Formatting Helper
-------------------------------------------------------------
Single source of truth for normalizing free-text display names (Manage
Course Category names, Module names) before they are stored, so a name
typed in any case is always saved and shown consistently as sentence
case - only the first letter of the whole string is uppercased, every
other letter is forced lowercase, and existing spacing between words is
left untouched:

    "pYtHoN bAsIcS"          -> "Python basics"
    "iNtRoDuCtIoN tO pYtHoN" -> "Introduction to python"

WHY THIS IS SEPARATE FROM validators.py's capitalize_name()
capitalize_name() title-cases EVERY word (e.g. "de la cruz" -> "De La
Cruz") because it formats PEOPLE's names (First/Middle/Last Name on the
Sign Up and Create Administrator forms). Category/Module names are
short descriptive phrases, not proper names, so only the leading letter
should be capitalized here - "Introduction to python", not
"Introduction To Python". Reusing capitalize_name() for this would give
the wrong result, so this is its own small, single-purpose module
instead.

Kept out of manage_course.py / admin_routes.py so the formatting rule
lives in exactly one place and any current or future caller (Category
create/update, Module create/update) shares it identically.
"""


def format_display_name(value):
    """
    Normalizes a name string to sentence case.

    - Leading/trailing whitespace is stripped first.
    - Internal whitespace (the spaces between words) is preserved
      exactly as typed - this function only ever changes letter case,
      never spacing.
    - An empty/blank/None input returns "" unchanged, so the existing
      "required" validation in manage_course.py (e.g. "Category name is
      required.") still catches it exactly the same way it always has.

    Args:
        value (str | None): the raw, as-typed name.

    Returns:
        str: the sentence-cased name, or "" if there was nothing to format.
    """
    if not value:
        return ""

    trimmed = value.strip()
    if not trimmed:
        return ""

    lowered = trimmed.lower()
    return lowered[0].upper() + lowered[1:]