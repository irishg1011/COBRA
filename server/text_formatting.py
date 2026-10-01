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

    # First character uppercased; everything after it is kept exactly
    # as typed (no forced lowercase) - "python on Windows" ->
    # "Python on Windows", "VS Code basics" stays "VS Code basics".
    return trimmed[0].upper() + trimmed[1:]


def format_sentence_case(value):
    """
    Task #77 - Module Name / Description sentence-case formatter.

    Like format_display_name() above, but sentence casing RESTARTS after
    every period ('.') instead of only capitalizing the very first letter
    of the whole string. This is what lets a multi-sentence Description
    (or a Module Name containing more than one sentence) end up fully
    sentence-cased, not just its opening word:

        "this IS a MODULE. this IS ANOTHER one."
            -> "This is a module. This is another one."

    Rules:
        - The first alphabetic character in the string is capitalized.
        - Every other character is kept exactly as typed (no forced
          lowercase), EXCEPT the first letter after each '.', which is
          capitalized again.
        - Every non-alphabetic character (spaces, digits, commas,
          question marks, exclamation marks, parentheses, hyphens,
          multiple/extra spaces, etc.) is left completely untouched -
          only letter CASE is ever changed, never spacing or
          punctuation.
        - Only leading/trailing whitespace is stripped (matching
          format_display_name()'s own convention); all internal spacing
          - including runs of multiple spaces - is preserved exactly.
        - An empty/blank/None input returns "" unchanged, so existing
          "required" checks (e.g. "Module name is required.") still
          catch it exactly like format_display_name() does.

    Args:
        value (str | None): the raw, as-typed Module Name or Description.

    Returns:
        str: the sentence-cased text, or "" if there was nothing to format.
    """
    if not value:
        return ""

    trimmed = value.strip()
    if not trimmed:
        return ""

    chars = list(trimmed)

    # The very first character is uppercased literally (matching
    # format_display_name()'s own convention) - e.g. "123 PYTHON" starts
    # with a digit, so this step has no visible effect and the first
    # actual LETTER ("P") is still lowercased below, giving
    # "123 python" rather than "123 Python".
    chars[0] = chars[0].upper()

    # After the (already-handled) first character, every other
    # alphabetic character is lowercased by default - UNLESS a '.' was
    # just seen, in which case casing "pauses" (skipping over any
    # spaces or other punctuation in between) until the next actual
    # letter, which gets capitalized instead.
    capitalize_next_alpha = False
    for i in range(1, len(chars)):
        ch = chars[i]
        if capitalize_next_alpha:
            if ch.isalpha():
                chars[i] = ch.upper()
                capitalize_next_alpha = False
        # Every other letter is kept exactly as typed (no forced lowercase).

        if ch == ".":
            capitalize_next_alpha = True

    return "".join(chars)


def capitalize_first_only(value):
    """
    Activity question/feedback casing rule.

    Only the first character is uppercased. Every other character is
    kept EXACTLY as typed, so "What does Python's print() do?" stays
    "What does Python's print() do?" instead of being lowercased.

    Leading/trailing whitespace is stripped; an empty/blank/None input
    returns "".
    """
    if not value:
        return ""

    trimmed = value.strip()
    if not trimmed:
        return ""

    return trimmed[0].upper() + trimmed[1:]