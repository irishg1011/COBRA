"""
weak_spots.py - Recommendations for missed items ("weak spots")
------------------------------------------------------------------------------
After a lesson's activities, a learner below PASS_PERCENT gets:
  - "Review my weak spots"        -> the missed items of THIS lesson
  - "Review module weak spots"    -> the missed items of the WHOLE module
                                     (last lesson of a module that needs retake)
Each missed item is shown under the PART of the lesson content that teaches
it, so the learner re-reads exactly that part.

HOW A PART IS FOUND (automatic - no admin tagging):
  1. Every published lesson's content (lesson_content_tbl.content_body) is
     split at its H1/H2/H3 headings. One heading + everything under it until
     the next heading = one part. Text before the first heading is a part
     titled "Introduction".
  2. From each missed item we take key terms: the correct answer (weight 3)
     and the question / sentence / front card (weight 1). Very common words
     (print, the, is, ...) are ignored; operators (==, %, //, +=, ...) count.
  3. Every part of this lesson AND of the earlier lessons (course order) is
     scored: sum of (weight x rarity x frequency) of the terms it contains -
     a term found in fewer parts is worth more, a term the part uses more
     often counts a bit more, a term in the heading counts 1.5x, and an
     operator in the answer (==, %, //) weighs 4 instead of 3.
  4. The highest-scoring part wins; on a tie the EARLIER part wins (the
     place the concept was first taught). No match at all -> the item's own
     lesson, first part.
So an item can send the learner to its own lesson or to an earlier one.

"Missed" = the same items the retake uses (activity_retakes.missed_item_ids):
first attempt wrong or skipped, and not fixed in a retake round yet.

Every time weak spots are built, this learner's unresolved rows for the
module in lesson_recommendations_tbl are replaced with the new ones (one row
per recommended part), so the table always reflects the current weak spots.

Pure DB helpers + two public entry points. Never touches Flask.
"""

import html
from collections import Counter
import math
import re

from mysql.connector import Error
from cobradb import get_db_connection
from activity_retakes import (
    GAME_TABLES,
    MCQ_TYPE,
    FIB_TYPE,
    FLASHCARD_TYPE,
    ensure_retake_schema,
    item_ids_for_activity,
    missed_item_ids,
)
from module_performance import lesson_performance, module_performance, module_lesson_ids

RECOMMENDATIONS_TABLE = "lesson_recommendations_tbl"

TYPE_SHORT = {MCQ_TYPE: "MCQ", FIB_TYPE: "FIB", FLASHCARD_TYPE: "Card"}

TOKEN_RE = re.compile(r"\*\*|//|==|!=|<=|>=|\+=|-=|\*=|/=|%|<|>|\*|\+|[A-Za-z_][A-Za-z0-9_]*")
HEADING_SPLIT_RE = re.compile(r"(?=<h[1-3][\s>])", re.IGNORECASE)
HEADING_TEXT_RE = re.compile(r"<h[1-3][^>]*>(.*?)</h[1-3]>", re.IGNORECASE | re.DOTALL)
TAG_RE = re.compile(r"<[^>]+>")

STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "of", "to", "in", "on", "at",
    "by", "for", "from", "with", "as", "it", "its", "this", "that", "these", "those",
    "but", "so", "what", "which", "who", "when", "where", "why", "how", "does", "do",
    "did", "can", "will", "would", "should", "you", "your", "we", "our", "they", "them",
    "he", "she", "i", "me", "my", "all", "any", "only", "no", "yes", "than", "then",
    "there", "here", "into", "out", "up", "about", "after", "before", "because",
    "using", "use", "used", "write", "value", "values", "code", "line",
    "print", "run", "runs", "result", "output", "correct", "answer", "first", "next",
    "same", "one", "two", "three", "get", "gets", "give", "gives", "make", "makes",
    "number", "numbers", "text", "word", "words", "example", "following", "below", "above",
    "true", "false", "none",
}

HEADING_BONUS = 1.5
ANSWER_WEIGHT = 3.0
ANSWER_OPERATOR_WEIGHT = 4.0   # an operator in the answer (==, %, //) IS the concept
PROMPT_WEIGHT = 1.0


# ---------------- text helpers ----------------
def _plain(fragment):
    """HTML fragment -> plain text (tags removed, entities decoded)."""
    text = TAG_RE.sub(" ", fragment or "")
    return html.unescape(text)


STRING_LITERAL_RE = re.compile(r"[\"'][^\"'\n]{1,40}[\"']")


def _terms(text):
    """Meaningful lower-case terms of a piece of text/code."""
    out = []
    if STRING_LITERAL_RE.search(text or ""):
        out.append("<string>")   # quoted text in code, e.g. "5" + "5" -> about str values
    for tok in TOKEN_RE.findall(text or ""):
        low = tok.lower()
        if low in STOPWORDS:
            continue
        if low.isalpha() and len(low) == 1:
            continue  # single-letter variable names (x, n, a)
        out.append(low)
    return out


def _split_sections(content_html, lesson_title):
    """Lesson HTML -> [{"heading", "html", "terms", "heading_terms"}], in order."""
    content_html = content_html or ""
    chunks = [c for c in HEADING_SPLIT_RE.split(content_html) if c and c.strip()]
    sections = []
    for chunk in chunks:
        match = HEADING_TEXT_RE.search(chunk)
        if match and chunk.lstrip().lower().startswith("<h"):
            heading = _plain(match.group(1)).strip() or lesson_title
        else:
            heading = "Introduction"
        plain = _plain(chunk)
        if not plain.strip() and "editor-code-container" not in chunk and "editor-terminal-container" not in chunk:
            continue
        sections.append({
            "heading": heading,
            "html": chunk,
            "terms": Counter(_terms(plain)),
            "heading_terms": set(_terms(heading)),
        })
    if not sections:
        sections.append({"heading": lesson_title, "html": content_html,
                         "terms": Counter(_terms(_plain(content_html))), "heading_terms": set()})
    return sections


# ---------------- course / lesson data ----------------
def _course_lessons(cursor):
    """Every published lesson (resource) in course order, with its module."""
    cursor.execute(
        """SELECT lr.resource_id, lr.resource_title, lr.module_id
           FROM learning_resources_tbl lr
           JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
           JOIN modules_tbl m ON lr.module_id = m.module_id
           JOIN category_tbl c ON m.cat_id = c.cat_id
           WHERE lrs.lr_stats_name = 'Published'
             AND COALESCE(m.is_archived, 0) = 0
             AND COALESCE(c.is_archived, 0) = 0
           ORDER BY COALESCE(c.display_order, 999999), c.cat_id,
                    COALESCE(m.display_order, 999999), m.module_id,
                    COALESCE(lr.display_order, 999999), lr.resource_id"""
    )
    return cursor.fetchall()


def _lesson_content(cursor, resource_id):
    cursor.execute("SELECT content_body FROM lesson_content_tbl WHERE resource_id = %s", (resource_id,))
    row = cursor.fetchone()
    return (row["content_body"] if row else "") or ""


def _published_game_activities(cursor, resource_id):
    cursor.execute(
        """SELECT la.la_id, la.activity_title, atp.activity_type_name
           FROM learning_activities_tbl la
           JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
           LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
           WHERE la.resource_id = %s AND las.la_stats_name = 'Published'
           ORDER BY la.activity_type_id ASC, la.la_id ASC""",
        (resource_id,)
    )
    return [r for r in cursor.fetchall() if (r.get("activity_type_name") or "") in GAME_TABLES]


def _first_answer(cursor, acc_id, activity_type, item_id):
    """What the learner gave on their first attempt ("Skipped" for a skip)."""
    answers_table, id_col, _, _ = GAME_TABLES[activity_type]
    if activity_type == MCQ_TYPE:
        cursor.execute(
            f"""SELECT a.status, o.option_text AS given
                FROM {answers_table} a
                LEFT JOIN mcq_options_tbl o ON a.option_id = o.option_id
                WHERE a.acc_id = %s AND a.{id_col} = %s AND a.attempt_number = 1
                LIMIT 1""",
            (acc_id, item_id)
        )
    else:
        cursor.execute(
            f"""SELECT status, answer_given AS given FROM {answers_table}
                WHERE acc_id = %s AND {id_col} = %s AND attempt_number = 1 LIMIT 1""",
            (acc_id, item_id)
        )
    row = cursor.fetchone()
    if not row:
        return ""
    if row["status"] == "skipped":
        return "Skipped"
    return row.get("given") or ""


def _missed_items(cursor, acc_id, resource_id):
    """
    The lesson's missed items with the text needed to match and to show them:
    [{"label", "activity_type", "prompt", "correct", "your_answer", "answer_text", "prompt_text"}]
    """
    items = []
    for act in _published_game_activities(cursor, resource_id):
        activity_type = act["activity_type_name"]
        missed, _ = missed_item_ids(cursor, acc_id, activity_type, act["la_id"])
        if not missed:
            continue
        order = item_ids_for_activity(cursor, activity_type, act["la_id"])
        position = {item_id: i + 1 for i, item_id in enumerate(order)}
        placeholders = ",".join(["%s"] * len(missed))

        if activity_type == MCQ_TYPE:
            cursor.execute(
                f"""SELECT q.q_id AS item_id, q.question_text AS prompt,
                           (SELECT o.option_text FROM mcq_options_tbl o
                            WHERE o.q_id = q.q_id AND o.is_correct = 1 LIMIT 1) AS correct
                    FROM mcq_questions_tbl q WHERE q.q_id IN ({placeholders})""",
                tuple(missed)
            )
        elif activity_type == FIB_TYPE:
            cursor.execute(
                f"""SELECT fib_id AS item_id, content AS prompt, correct_answer AS correct
                    FROM fill_blanks_tbl WHERE fib_id IN ({placeholders})""",
                tuple(missed)
            )
        else:
            cursor.execute(
                f"""SELECT flashcard_id AS item_id, front_text AS prompt, back_text AS correct
                    FROM flashcards_tbl WHERE flashcard_id IN ({placeholders})""",
                tuple(missed)
            )
        rows = {r["item_id"]: r for r in cursor.fetchall()}

        for item_id in missed:
            row = rows.get(item_id)
            if not row:
                continue
            number = position.get(item_id, 0)
            items.append({
                "source_resource_id": resource_id,
                "activity_type": activity_type,
                "label": f"{TYPE_SHORT.get(activity_type, 'Item')} {number}",
                "sort": (act["la_id"], number),
                "prompt": (row.get("prompt") or "").strip(),
                "correct": (row.get("correct") or "").strip(),
                "your_answer": _first_answer(cursor, acc_id, activity_type, item_id),
            })
    items.sort(key=lambda i: i["sort"])
    return items


# ---------------- matching ----------------
def _candidate_sections(cursor, course, upto_resource_id):
    """Sections of every published lesson up to (and including) this one, in course order."""
    out = []
    for lesson in course:
        sections = _split_sections(_lesson_content(cursor, lesson["resource_id"]), lesson["resource_title"])
        for index, section in enumerate(sections):
            out.append({**section, "resource_id": lesson["resource_id"],
                        "resource_title": lesson["resource_title"], "index": index})
        if lesson["resource_id"] == upto_resource_id:
            break
    return out


def _best_section(item, candidates):
    """Index into candidates of the part that best teaches this item (None = no match)."""
    weights = {}
    for term in _terms(item["correct"]):
        weight = ANSWER_WEIGHT if term[0].isalpha() or term[0] == "_" else ANSWER_OPERATOR_WEIGHT
        weights[term] = max(weights.get(term, 0), weight)
    for term in _terms(item["prompt"]):
        weights[term] = max(weights.get(term, 0), PROMPT_WEIGHT)
    if not weights or not candidates:
        return None

    total = len(candidates)
    best_index, best_score = None, 0.0
    for i, section in enumerate(candidates):
        score = 0.0
        for term, weight in weights.items():
            if term not in section["terms"]:
                continue
            df = sum(1 for s in candidates if term in s["terms"])
            rarity = math.log(1 + total / df)
            bonus = HEADING_BONUS if term in section["heading_terms"] else 1.0
            frequency = 1 + math.log(section["terms"][term])   # taught more = explained more
            score += weight * rarity * bonus * frequency
        if score > best_score + 1e-9:   # strictly better; ties keep the EARLIER part
            best_index, best_score = i, score
    return best_index


def _build(cursor, acc_id, lessons_in_scope, course):
    """Groups of {part -> missed items} for the given lessons (one course scan)."""
    groups = {}
    order_of = {l["resource_id"]: i for i, l in enumerate(course)}
    candidates_cache = {}

    for lesson in lessons_in_scope:
        resource_id = lesson["resource_id"]
        items = _missed_items(cursor, acc_id, resource_id)
        if not items:
            continue
        if resource_id not in candidates_cache:
            candidates_cache[resource_id] = _candidate_sections(cursor, course, resource_id)
        candidates = candidates_cache[resource_id]

        for item in items:
            index = _best_section(item, candidates)
            if index is None:
                own = [c for c in candidates if c["resource_id"] == resource_id]
                section = own[0] if own else None
            else:
                section = candidates[index]
            if section is None:
                continue
            key = (section["resource_id"], section["index"])
            group = groups.setdefault(key, {
                "resource_id": section["resource_id"],
                "lesson_title": section["resource_title"],
                "heading": section["heading"],
                "html": section["html"],
                "order": (order_of.get(section["resource_id"], 0), section["index"]),
                "items": [],
            })
            group["items"].append({
                "label": item["label"],
                "activity_type": item["activity_type"],
                "from_resource_id": item["source_resource_id"],
                "prompt": item["prompt"],
                "correct": item["correct"],
                "your_answer": item["your_answer"],
            })

    out = sorted(groups.values(), key=lambda g: g["order"])
    for g in out:
        g.pop("order", None)
    return out


def _save_recommendations(cursor, acc_id, module_id, groups):
    """Replace this learner's unresolved recommendations for the module."""
    cursor.execute(
        f"DELETE FROM {RECOMMENDATIONS_TABLE} WHERE acc_id = %s AND module_id = %s AND resolved = 0",
        (acc_id, module_id)
    )
    for g in groups:
        count = len(g["items"])
        reason = f"Review '{g['heading']}' - {count} missed item{'s' if count != 1 else ''}"[:255]
        cursor.execute(
            f"""INSERT INTO {RECOMMENDATIONS_TABLE}
                (acc_id, module_id, resource_id, reason, generated_at, resolved)
                VALUES (%s, %s, %s, %s, NOW(), 0)""",
            (acc_id, module_id, g["resource_id"], reason)
        )


# ---------------- public entry points ----------------
def get_weak_spots(acc_id, resource_id, scope="lesson"):
    """
    scope "lesson": this lesson's missed items; "module": every lesson of its module.
    Returns {"scope", "module_id", "groups": [...], "missed_total"} or None on error.
    Each group: {"resource_id", "lesson_title", "heading", "html",
                 "is_current_lesson", "items": [{"label", "prompt", "correct", "your_answer", ...}]}
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        ensure_retake_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT module_id FROM learning_resources_tbl WHERE resource_id = %s", (resource_id,))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return None
        module_id = row["module_id"]

        course = _course_lessons(cursor)
        by_id = {l["resource_id"]: l for l in course}
        module_ids = [rid for rid in module_lesson_ids(cursor, module_id) if rid in by_id]

        # Always build the whole module (it's what gets saved as recommendations),
        # then return the scope that was asked for.
        module_groups = _build(cursor, acc_id, [by_id[rid] for rid in module_ids], course)
        _save_recommendations(cursor, acc_id, module_id, module_groups)
        connection.commit()

        if scope == "module":
            groups = module_groups
        else:
            groups = []
            for g in module_groups:
                own = [i for i in g["items"] if i["from_resource_id"] == int(resource_id)]
                if own:
                    groups.append({**g, "items": own})
        for g in groups:
            g["is_current_lesson"] = g["resource_id"] == int(resource_id)

        cursor.close()
        return {
            "scope": scope,
            "module_id": module_id,
            "groups": groups,
            "missed_total": sum(len(g["items"]) for g in groups),
        }
    except Error as e:
        connection.rollback()
        print(f"weak_spots: failed to build weak spots for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_review_status(acc_id, resource_id):
    """
    What the lesson Summary needs to decide which review buttons to show:
      {"pass_percent", "lesson_percent", "lesson_below", "lesson_missed",
       "is_last_lesson", "module_percent", "module_below", "module_missed"}
    or None on error.
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        ensure_retake_schema(connection)
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT module_id FROM learning_resources_tbl WHERE resource_id = %s", (resource_id,))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            return None
        module_id = row["module_id"]

        lesson = lesson_performance(cursor, acc_id, resource_id)
        module = module_performance(cursor, acc_id, module_id)
        lesson_ids = module_lesson_ids(cursor, module_id)
        is_last = bool(lesson_ids) and lesson_ids[-1] == int(resource_id)
        module_missed = sum((l.get("missed") or 0) for l in module["lessons"].values())
        cursor.close()

        lesson_percent = lesson["percent"]
        return {
            "pass_percent": module["pass_percent"],
            "lesson_percent": lesson_percent,
            "lesson_below": lesson_percent is not None and lesson_percent < module["pass_percent"],
            "lesson_missed": lesson["missed"],
            "is_last_lesson": is_last,
            "module_percent": module["percent"],
            "module_below": is_last and module["needs_retake"],
            "module_missed": module_missed,
        }
    except Error as e:
        print(f"weak_spots: failed to load review status for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()