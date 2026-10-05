"""
exercise_tips.py - Plain, encouraging feedback for a coding exercise
------------------------------------------------------------------------------
feat/output-based-exercises: an exercise has ONE Expected Output. After a
submission, this file compares the learner's real output with it and
says what kind of difference there is. No AI and no outside service: the
same output always gives the same feedback.

The expected output itself is NEVER put in the feedback - only what kind
of difference there is (a Python error and its line, nothing printed,
the number of lines, which line differs, capital letters / spacing).

    normalize_output(text)                  -> text the comparison uses
    error_feedback(error_text)              -> explains a Python error
    output_feedback(actual, expected)       -> None when they match
"""

import re

# Plain-language meaning of the Python errors beginners hit most.
ERROR_HELP = {
    "SyntaxError": "Python can't read this line - check for a missing ( ), quote, colon or comma",
    "IndentationError": "the spaces at the start of this line are wrong - lines inside if/for/def need the same indent",
    "TabError": "tabs and spaces are mixed in the indent - use spaces only",
    "NameError": "a name is used before it's created, or it's misspelled (names are case-sensitive)",
    "TypeError": "two kinds of values are mixed, e.g. text + number - convert with str() or int()",
    "ValueError": "a value has the right type but a wrong form, e.g. int('abc')",
    "ZeroDivisionError": "the code divides by zero",
    "IndexError": "a list position is used that doesn't exist - lists start at 0",
    "KeyError": "a dictionary key is used that doesn't exist",
    "AttributeError": "a method or property is used that this kind of value doesn't have",
    "EOFError": "input() was called more times than this exercise gives input lines",
    "RecursionError": "a function keeps calling itself without stopping",
}
GENERIC_ERROR_HELP = "read the last line of the error message - it says what went wrong"

_LINE_RE = re.compile(r'File "<string>", line (\d+)')
_ERROR_RE = re.compile(r"^(\w+(?:Error|Exception)|KeyboardInterrupt)\b:?\s*(.*)$")
_WHITESPACE_RE = re.compile(r"\s+")


def normalize_output(text):
    r"""
    The one shape both sides are compared in: line endings become "\n",
    spaces at the end of every line are dropped, and blank lines at the
    very start and end are dropped. Case and the spaces inside a line
    must still match.
    """
    lines = [line.rstrip() for line in str(text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def _parse_error(error_text):
    """(error name or None, line number or None) from a traceback."""
    name = None
    for line in reversed(str(error_text or "").splitlines()):
        m = _ERROR_RE.match(line.strip())
        if m:
            name = m.group(1)
            break
    lines = _LINE_RE.findall(str(error_text or ""))
    return name, (int(lines[-1]) if lines else None)


def error_feedback(error_text):
    """The learner's code stopped with a Python error - what it means, kindly."""
    name, line = _parse_error(error_text)
    where = f" on line {line}" if line else ""
    if not name:
        return f"Your program stopped with an error{where}. Read the error message, fix that line and try again - you're close!"
    meaning = ERROR_HELP.get(name, GENERIC_ERROR_HELP)
    return f"Your program stopped with a {name}{where}: {meaning}. Fix it and try again - you're close!"


def _plural(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"


def output_feedback(actual, expected):
    """
    None when the normalized outputs match, else ONE hint about the kind
    of difference (never the expected text).
    """
    actual, expected = normalize_output(actual), normalize_output(expected)
    if actual == expected:
        return None
    if not actual:
        return "Your program didn't print anything. Use print() to show the result."
    if _WHITESPACE_RE.sub("", actual).lower() == _WHITESPACE_RE.sub("", expected).lower():
        return "Very close. Check your capital letters and spacing."
    actual_lines, expected_lines = actual.split("\n"), expected.split("\n")
    if len(actual_lines) != len(expected_lines):
        return (f"Your program printed {_plural(len(actual_lines), 'line')}, but "
                f"{_plural(len(expected_lines), 'line')} {'is' if len(expected_lines) == 1 else 'are'} expected. "
                f"Check how many times your code prints.")
    for number, (a, e) in enumerate(zip(actual_lines, expected_lines), start=1):
        if a != e:
            return f"Line {number} of your output doesn't match yet. Compare it with the expected output and try again."
    return "Your output doesn't match the expected output yet."
