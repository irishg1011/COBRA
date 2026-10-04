"""
exercise_tips.py - Automatic "how to fix it" tips for a coding exercise
------------------------------------------------------------------------------
After a failed submission, every failing test case gets ONE plain tip,
worked out by comparing the learner's real output with the expected
output on the server. No AI and no outside service: the same output
always gives the same tip.

The expected output itself is NEVER put in a tip - only what kind of
difference there is (nothing printed, a Python error and its line,
capital letters only, spaces/punctuation, number of lines, a number
that's off, input() not used).

    fix_tips(code, test_rows, actual_by_id) -> [{"test": n, "input": str, "tip": str}]
        code: the submitted code (None = unknown, skips the input() check)
        test_rows: [{"test_case_id", "test_order", "test_input", "expected_output"}]
        actual_by_id: {test_case_id: actual output (trimmed)}
    tips_text(tips) -> one line per tip, saved with the attempt for mentors
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
    "EOFError": "input() was called more times than this test gives input lines",
    "RecursionError": "a function keeps calling itself without stopping",
}

_LINE_RE = re.compile(r'File "<string>", line (\d+)')
_ERROR_RE = re.compile(r"^(\w+(?:Error|Exception)|KeyboardInterrupt)\b:?\s*(.*)$")
_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")
_PUNCT_SPACE_RE = re.compile(r"[\s.,!?;:'\"\-()]+")


def _python_error(actual):
    """(error name, detail, line number or None) when the output is a traceback, else None."""
    if "Traceback (most recent call last)" not in actual and not re.search(r"^\s*File \"<string>\"", actual, re.M):
        return None
    name, detail = None, ""
    for line in reversed(actual.splitlines()):
        m = _ERROR_RE.match(line.strip())
        if m:
            name, detail = m.group(1), m.group(2).strip()
            break
    if not name:
        return None
    lines = _LINE_RE.findall(actual)
    return name, detail, (int(lines[-1]) if lines else None)


def _tip_for(code, test_input, expected, actual):
    err = _python_error(actual)
    if err:
        name, detail, line = err
        where = f" on line {line}" if line else ""
        meaning = ERROR_HELP.get(name, "read the error message and check that line")
        extra = f" ({detail})" if detail else ""
        return f"Python stopped with a {name}{where}: {meaning}{extra}."

    if not actual and expected:
        return "Your code didn't print anything. Use print() to show the result."

    if code is not None and (test_input or "").strip() and "input(" not in code:
        return "This test gives your program input, but your code never reads it. Use input() to get it."

    if actual.lower() == expected.lower():
        return "Almost! Only the capital/small letters are different. Check uppercase and lowercase."

    if _PUNCT_SPACE_RE.sub("", actual) == _PUNCT_SPACE_RE.sub("", expected):
        return "Almost! Check the spaces and punctuation (commas, periods, !, :) in your output."

    if _PUNCT_SPACE_RE.sub("", actual).lower() == _PUNCT_SPACE_RE.sub("", expected).lower():
        return "Almost! Check the capital letters, spaces and punctuation (commas, periods, !, :) in your output."

    actual_lines = actual.count("\n") + 1 if actual else 0
    expected_lines = expected.count("\n") + 1 if expected else 0
    if actual_lines != expected_lines:
        return (f"Your output has {actual_lines} line{'s' if actual_lines != 1 else ''}, "
                f"but this test expects {expected_lines}. Check how many times you print.")

    actual_nums, expected_nums = _NUM_RE.findall(actual), _NUM_RE.findall(expected)
    if (expected_nums and len(actual_nums) == len(expected_nums) and actual_nums != expected_nums
            and _NUM_RE.sub("#", actual).lower() == _NUM_RE.sub("#", expected).lower()):
        return "The words are right, but a number is off. Check your calculation."

    return "Your output doesn't match what this test expects. Run your code with this input and compare it with the problem."


def fix_tips(code, test_rows, actual_by_id):
    tips = []
    for row in sorted(test_rows, key=lambda r: (r.get("test_order") or 0, r["test_case_id"])):
        expected = (row.get("expected_output") or "").strip()
        actual = actual_by_id.get(row["test_case_id"], "")
        if actual == expected:
            continue
        tips.append({
            "test": len(tips) + 1 if not row.get("test_order") else int(row["test_order"]),
            "input": row.get("test_input") or "",
            "tip": _tip_for(code, row.get("test_input") or "", expected, actual),
        })
    return tips


def tips_text(tips):
    return "\n".join(f"Test {t['test']}: {t['tip']}" for t in tips)
