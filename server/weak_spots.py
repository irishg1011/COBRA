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
  3. The parts of the item's OWN lesson are scored first; only when none of
     them matches at all are the earlier lessons (course order) scored too: sum of (weight x rarity x frequency) of the terms it contains -
     a term found in fewer parts is worth more, a term the part uses more
     often counts a bit more, a term in the heading counts 1.5x, and an
     operator in the answer (==, %, //) weighs 4 instead of 3.
  4. The highest-scoring part wins; on a tie the EARLIER part wins (the
     place the concept was first taught). No match at all -> the item's own
     lesson, first part.
So an item sends the learner to its own lesson, and to an earlier one only
when its own lesson has no matching part.

"Missed" (feat/retake-unseen) = the items missed in the learner's FIRST
play (activity_retakes.first_play_missed_ids) - retakes draw new questions,
so they never change this list. The mentor's recommendation tracking uses
the ones still not made up by retakes (missed_item_ids).

RECOMMENDATIONS (lesson_recommendations_tbl - feat/mentor-recommendations)
One row per learner + recommended part (the lesson part to re-read). Rows
are kept up to date, never thrown away, so the mentor's Recommendations
page (recommendations.py) can follow each one from start to finish:

    Pending      recommended, the learner has not opened the review yet
    In Progress  the learner opened the review (viewed_at) or already
                 fixed some of the missed items (missed_count < initial_missed)
    Completed    every missed item behind it was fixed (resolved = 1)

They are refreshed for one learner + module (_sync_module):
  - when the lesson Summary loads            (get_review_status)
  - when the learner opens the review        (get_weak_spots - also sets viewed_at)
  - when a mentor opens Recommendations      (refresh_recommendations)
A part that is still missed keeps its row and its original date; a part
that is no longer missed is marked resolved; a newly missed part gets a
new row.

Pure DB helpers + three public entry points. Never touches Flask.
"""

import html
from collections import Counter
import math
import re
import time

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
    first_play_missed_ids,
)
from module_performance import lesson_performance, module_performance, module_lesson_ids

RECOMMENDATIONS_TABLE = "lesson_recommendations_tbl"
PROGRESS_TABLE = "learner_resource_progress_tbl"
TOPIC_MAX = 150

# Columns added to the original lesson_recommendations_tbl (name, DDL).
# Added one by one only when missing, so this is safe on any database.
_RECOMMENDATION_COLUMNS = [
    ("weak_topic", "VARCHAR(150) NULL"),               # the lesson part (heading) to re-read
    ("missed_count", "INT(10) NOT NULL DEFAULT 0"),    # items still missed
    ("initial_missed", "INT(10) NOT NULL DEFAULT 0"),  # items missed when first recommended
    ("viewed_at", "DATETIME NULL"),                    # when the learner first opened the review
    ("resolved_at", "DATETIME NULL"),                  # when every missed item was fixed
]
# Rows saved before the columns above existed only have the old reason text.
LEGACY_REASON_RE = re.compile(r"^Review '(.*)' - \d+ missed item")

REFRESH_EVERY_SECONDS = 60   # the mentor page re-checks learners at most this often
MAX_PAIRS_PER_REFRESH = 300  # learner + module pairs re-checked in one refresh

_recommendation_schema_ready = False
_last_refresh = 0.0
_checked_pairs = set()       # (acc_id, module_id) already checked since the server started

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
           JOIN module_stats_tbl ms ON m.module_stats_id = ms.module_stats_id
           JOIN category_tbl c ON m.cat_id = c.cat_id
           JOIN category_stats_tbl cs ON c.cat_stats_id = cs.cat_stats_id
           WHERE lrs.lr_stats_name = 'Published'
             AND ms.module_stats_name = 'Published'
             AND cs.cat_stats_name = 'Published'
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


SKIPPED_FEEDBACK = "You skipped this one. Read the lesson part above, then try it again."


def _first_answer(cursor, acc_id, activity_type, item_id):
    """
    (answer, feedback) from the learner's first attempt.
    answer is "Skipped" for a skip; feedback is the exact feedback the game
    gave on that attempt (feedback_given), or SKIPPED_FEEDBACK for a skip.
    The correct answer is never part of this - learners only see feedback.
    """
    answers_table, id_col, _, _ = GAME_TABLES[activity_type]
    if activity_type == MCQ_TYPE:
        cursor.execute(
            f"""SELECT a.status, o.option_text AS given, a.feedback_given AS feedback
                FROM {answers_table} a
                LEFT JOIN mcq_options_tbl o ON a.option_id = o.option_id
                WHERE a.acc_id = %s AND a.{id_col} = %s AND a.attempt_number = 1
                LIMIT 1""",
            (acc_id, item_id)
        )
    else:
        cursor.execute(
            f"""SELECT status, answer_given AS given, feedback_given AS feedback FROM {answers_table}
                WHERE acc_id = %s AND {id_col} = %s AND attempt_number = 1 LIMIT 1""",
            (acc_id, item_id)
        )
    row = cursor.fetchone()
    if not row:
        return "", ""
    if row["status"] == "skipped":
        return "Skipped", SKIPPED_FEEDBACK
    # feat/question-timer + feat/leave-detection outcomes
    if row["status"] == "timed_out":
        return "Time ran out", (row.get("feedback") or "").strip()
    if row["status"] == "left":
        return "Left the page", (row.get("feedback") or "").strip()
    return (row.get("given") or ""), (row.get("feedback") or "").strip()


def _missed_items(cursor, acc_id, resource_id, tracking=False):
    """
    The lesson's missed items with the text needed to match and to show them.
    feat/retake-unseen: the learner's list is the items missed in the FIRST
    play (retakes never change it); tracking=True (mentor recommendations)
    keeps only as many as are still missed, so a recommendation resolves
    once retakes made up its activity's missed questions.
    [{"label", "activity_type", "prompt", "correct", "your_answer", "answer_text", "prompt_text"}]
    """
    items = []
    for act in _published_game_activities(cursor, resource_id):
        activity_type = act["activity_type_name"]
        if tracking:
            missed, _ = missed_item_ids(cursor, acc_id, activity_type, act["la_id"])
        else:
            missed = first_play_missed_ids(cursor, acc_id, activity_type, act["la_id"])
        if not missed:
            continue
        order = item_ids_for_activity(cursor, activity_type, act["la_id"])
        position = {item_id: i + 1 for i, item_id in enumerate(order)}
        placeholders = ",".join(["%s"] * len(missed))

        if activity_type == MCQ_TYPE:
            cursor.execute(
                f"""SELECT q.q_id AS item_id, q.question_text AS prompt,
                           (SELECT o.option_text FROM mcq_options_tbl o
                            WHERE o.q_id = q.q_id AND o.is_correct = 1 AND o.is_removed = 0 LIMIT 1) AS correct
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
            your_answer, feedback = _first_answer(cursor, acc_id, activity_type, item_id)
            items.append({
                "source_resource_id": resource_id,
                "activity_type": activity_type,
                "label": f"{TYPE_SHORT.get(activity_type, 'Item')} {number}",
                "sort": (act["la_id"], number),
                "prompt": (row.get("prompt") or "").strip(),
                "correct": (row.get("correct") or "").strip(),
                "your_answer": your_answer,
                "feedback": feedback,
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


def _build(cursor, acc_id, lessons_in_scope, course, candidates_cache=None, tracking=False):
    """
    Groups of {part -> missed items} for the given lessons (one course scan).
    candidates_cache: pass the same dict when building for several learners,
    so each lesson's content is read and split only once.
    """
    groups = {}
    order_of = {l["resource_id"]: i for i, l in enumerate(course)}
    if candidates_cache is None:
        candidates_cache = {}

    for lesson in lessons_in_scope:
        resource_id = lesson["resource_id"]
        items = _missed_items(cursor, acc_id, resource_id, tracking)
        if not items:
            continue
        if resource_id not in candidates_cache:
            candidates_cache[resource_id] = _candidate_sections(cursor, course, resource_id)
        candidates = candidates_cache[resource_id]

        own = [c for c in candidates if c["resource_id"] == resource_id]
        for item in items:
            # The item's OWN lesson first; an earlier lesson only when no
            # part of its own lesson matches at all.
            index = _best_section(item, own)
            if index is not None:
                section = own[index]
            else:
                index = _best_section(item, candidates)
                section = candidates[index] if index is not None else (own[0] if own else None)
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
                # "correct" stays server-side (section matching only) - it is
                # never sent to the learner; they get the feedback instead.
                "your_answer": item["your_answer"],
                "feedback": item["feedback"],
            })

    out = sorted(groups.values(), key=lambda g: g["order"])
    for g in out:
        g.pop("order", None)
    return out


def ensure_recommendation_schema(cursor):
    """Adds the tracking columns to lesson_recommendations_tbl when missing."""
    global _recommendation_schema_ready
    if _recommendation_schema_ready:
        return
    cursor.execute(f"SHOW COLUMNS FROM {RECOMMENDATIONS_TABLE}")
    existing = set()
    for row in cursor.fetchall():
        existing.add(next(iter(row.values())) if isinstance(row, dict) else row[0])
    for name, ddl in _RECOMMENDATION_COLUMNS:
        if name not in existing:
            cursor.execute(f"ALTER TABLE {RECOMMENDATIONS_TABLE} ADD COLUMN {name} {ddl}")
    _recommendation_schema_ready = True


def _reason_text(group, titles):
    """e.g. "Missed 3 items in Variables and Data Types (MCQ 2, MCQ 5, FIB 1)"."""
    by_lesson = {}
    for item in group["items"]:
        by_lesson.setdefault(item["from_resource_id"], []).append(item["label"])
    parts = [f"{titles.get(rid, 'a lesson')} ({', '.join(labels)})" for rid, labels in by_lesson.items()]
    count = len(group["items"])
    return f"Missed {count} item{'s' if count != 1 else ''} in {'; '.join(parts)}"[:255]


def _save_recommendations(cursor, acc_id, module_id, groups, titles, viewed_keys=None):
    """
    Brings this learner's recommendations for the module in line with
    `groups` (the parts that are missed RIGHT NOW):
      - a part that already has an open row keeps it (and its date); its
        count and reason are updated
      - a part with no open row gets a new one
      - an open row whose part is no longer missed is marked resolved
    viewed_keys: {(resource_id, heading)} the learner is looking at now -
    those rows get viewed_at (first time only).
    titles: {resource_id: lesson title} for the reason text.
    """
    ensure_recommendation_schema(cursor)
    viewed_keys = viewed_keys or set()

    cursor.execute(
        f"""SELECT recommendation_id, resource_id, weak_topic, reason
            FROM {RECOMMENDATIONS_TABLE}
            WHERE acc_id = %s AND module_id = %s AND resolved = 0
            ORDER BY recommendation_id""",
        (acc_id, module_id)
    )
    open_rows, no_longer_missed = {}, []
    for row in cursor.fetchall():
        topic = row["weak_topic"]
        if topic is None:   # saved before weak_topic existed
            match = LEGACY_REASON_RE.match(row["reason"] or "")
            topic = match.group(1) if match else ""
        key = (row["resource_id"], topic[:TOPIC_MAX])
        if key in open_rows:
            no_longer_missed.append(row["recommendation_id"])   # an old duplicate
        else:
            open_rows[key] = row["recommendation_id"]

    for g in groups:
        count = len(g["items"])
        topic = (g["heading"] or "")[:TOPIC_MAX]
        reason = _reason_text(g, titles)
        viewed = (g["resource_id"], g["heading"]) in viewed_keys
        recommendation_id = open_rows.pop((g["resource_id"], topic), None)

        if recommendation_id is not None:
            cursor.execute(
                f"""UPDATE {RECOMMENDATIONS_TABLE}
                    SET weak_topic = %s, reason = %s, missed_count = %s,
                        initial_missed = GREATEST(initial_missed, %s)
                    WHERE recommendation_id = %s""",
                (topic, reason, count, count, recommendation_id)
            )
            if viewed:
                cursor.execute(
                    f"""UPDATE {RECOMMENDATIONS_TABLE} SET viewed_at = NOW()
                        WHERE recommendation_id = %s AND viewed_at IS NULL""",
                    (recommendation_id,)
                )
        else:
            cursor.execute(
                f"""INSERT INTO {RECOMMENDATIONS_TABLE}
                        (acc_id, module_id, resource_id, reason, generated_at, resolved,
                         weak_topic, missed_count, initial_missed)
                    VALUES (%s, %s, %s, %s, NOW(), 0, %s, %s, %s)""",
                (acc_id, module_id, g["resource_id"], reason, topic, count, count)
            )
            if viewed:
                cursor.execute(
                    f"""UPDATE {RECOMMENDATIONS_TABLE} SET viewed_at = NOW()
                        WHERE acc_id = %s AND module_id = %s AND resource_id = %s
                          AND weak_topic = %s AND resolved = 0 AND viewed_at IS NULL""",
                    (acc_id, module_id, g["resource_id"], topic)
                )

    for recommendation_id in no_longer_missed + list(open_rows.values()):
        cursor.execute(
            f"""UPDATE {RECOMMENDATIONS_TABLE}
                SET resolved = 1, resolved_at = NOW(), missed_count = 0
                WHERE recommendation_id = %s""",
            (recommendation_id,)
        )


def _sync_module(connection, cursor, acc_id, module_id, course=None, candidates_cache=None):
    """
    Rebuilds and saves one learner's recommendations for one module.
    Never raises - keeping recommendations fresh must not break the page
    that triggered it. Returns True when saved.
    """
    try:
        if course is None:
            course = _course_lessons(cursor)
        by_id = {l["resource_id"]: l for l in course}
        lessons = [by_id[rid] for rid in module_lesson_ids(cursor, module_id) if rid in by_id]
        if not lessons:
            return True   # module not published right now - leave its rows as they are
        groups = _build(cursor, acc_id, lessons, course, candidates_cache, tracking=True)
        titles = {l["resource_id"]: l["resource_title"] for l in course}
        _save_recommendations(cursor, acc_id, module_id, groups, titles)
        connection.commit()
        return True
    except Error as e:
        print(f"weak_spots: could not refresh recommendations for {acc_id} / module {module_id}: {e}")
        try:
            connection.rollback()
        except Error:
            pass
        return False


# ---------------- public entry points ----------------
def get_weak_spots(acc_id, resource_id, scope="lesson"):
    """
    scope "lesson": this lesson's missed items; "module": every lesson of its module.
    Returns {"scope", "module_id", "groups": [...], "missed_total"} or None on error.
    Each group: {"resource_id", "lesson_title", "heading", "html",
                 "is_current_lesson", "items": [{"label", "prompt", "your_answer", "feedback", ...}]}
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
        tracking_groups = _build(cursor, acc_id, [by_id[rid] for rid in module_ids], course, tracking=True)

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

        # The parts shown now count as "opened by the learner" (In Progress).
        titles = {l["resource_id"]: l["resource_title"] for l in course}
        _save_recommendations(cursor, acc_id, module_id, tracking_groups, titles,
                              viewed_keys={(g["resource_id"], g["heading"]) for g in groups})
        connection.commit()

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
        # The Summary is where a learner lands after activities and retakes, so
        # this is where their recommendations are created / marked resolved.
        _sync_module(connection, cursor, acc_id, module_id)
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
            # Module Review card (module_review.py) - shown once all lessons are done
            "module_id": module_id,
            "module_all_done": module["all_done"],
            "module_passed": module["passed"],
        }
    except Error as e:
        print(f"weak_spots: failed to load review status for resource_id={resource_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def refresh_recommendations(force=False):
    """
    For the mentor's Recommendations page: re-checks
      - every learner + module that still has an open recommendation
        (so one the learner has fixed since shows as Completed), and
      - every learner + module with lesson progress that has not been
        checked since the server started (so learners who never opened the
        review still get their recommendations).
    Runs at most once every REFRESH_EVERY_SECONDS unless forced.
    Never raises. Returns how many learner + module pairs were re-checked.
    """
    global _last_refresh
    now = time.time()
    if not force and now - _last_refresh < REFRESH_EVERY_SECONDS:
        return 0
    _last_refresh = now

    connection = get_db_connection()
    if connection is None:
        return 0
    try:
        ensure_retake_schema(connection)
        cursor = connection.cursor(dictionary=True)
        ensure_recommendation_schema(cursor)

        cursor.execute(f"SELECT DISTINCT acc_id, module_id FROM {RECOMMENDATIONS_TABLE} WHERE resolved = 0")
        pairs = {(r["acc_id"], r["module_id"]) for r in cursor.fetchall()}

        cursor.execute(
            f"""SELECT DISTINCT p.acc_id, lr.module_id
                FROM {PROGRESS_TABLE} p
                JOIN learning_resources_tbl lr ON lr.resource_id = p.resource_id"""
        )
        for r in cursor.fetchall():
            pair = (r["acc_id"], r["module_id"])
            if pair not in _checked_pairs:
                pairs.add(pair)

        course = _course_lessons(cursor)
        candidates_cache = {}
        done = 0
        for acc_id, module_id in sorted(pairs)[:MAX_PAIRS_PER_REFRESH]:
            if _sync_module(connection, cursor, acc_id, module_id, course, candidates_cache):
                _checked_pairs.add((acc_id, module_id))
                done += 1
        cursor.close()
        return done
    except Error as e:
        print(f"weak_spots: recommendation refresh failed: {e}")
        return 0
    finally:
        if connection.is_connected():
            connection.close()