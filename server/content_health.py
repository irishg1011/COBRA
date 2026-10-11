"""
content_health.py - Mentor Dashboard: "How your content is doing" (feat/dashboard-reports)
------------------------------------------------------------------------------
Read-only. Two parts, for the whole course or only one mentor's content
(uploaded_by = the mentor, "Only mine"):

PERFORMANCE (published activities, every learner, all time, FIRST try)
    hardest        the activity with the lowest first-try % (at least
                   MIN_LEARNERS learners answered it)
    activities     the HARDEST_LIST lowest, for the list under it
    questions      the TOP_QUESTIONS questions missed most on the first try
                   (progress_insights.lesson_activity_stats - same rule and
                   "check the answer key" flag as Learner Progress / Analytics)

CONTENT HEALTH (every activity / exercise that is not archived)
    too_few        activities with fewer than DRAW_SIZE (5) items - a play
                   draws 5, so the learner gets fewer; also how many are
                   under the POOL_TARGET (50) the editor aims for
    feedback       items with something missing:
                     Multiple Choice  no feedback for a right answer, or none
                                      for a wrong one (question or option level)
                     Fill in the Blanks  right / wrong feedback, or the hint
                     Flashcards       right / wrong feedback, or the hint
                   (grouped per activity: how many items miss what)
    exercises      coding exercises with no expected answer and no test case
                   with an expected output
Every row carries the editor link (the same editors Publishing opens).
"""

from mysql.connector import Error

from cobradb import get_db_connection
from activity_retakes import GAME_TABLES, DRAW_SIZE
import progress_insights as insights

MIN_LEARNERS = 3
HARDEST_LIST = 5
TOP_QUESTIONS = 5
POOL_TARGET = 50
LIST_LIMIT = 50

MCQ, FIB, FC = "Multiple Choice", "Fill in the Blanks", "Flashcards"


def _empty(value):
    return value is None or not str(value).strip()


def _activity_url(la_id):
    return f"/admin/create-learning-activity?activity_id={la_id}"


def _exercise_url(exercise_id):
    return f"/admin/coding-exercises/create?exercise_id={exercise_id}"


def _activities(cursor, owner=None, published_only=False):
    """Not archived activities (+ type, lesson, status), optionally one mentor's."""
    where = ["las.la_stats_name <> 'Archived'"]
    params = []
    if published_only:
        where.append("las.la_stats_name = 'Published'")
    if owner:
        where.append("la.uploaded_by = %s")
        params.append(owner)
    cursor.execute(
        f"""SELECT la.la_id, la.activity_title, at.activity_type_name AS type, las.la_stats_name AS status,
                   lr.resource_title AS lesson, la.uploaded_by
            FROM learning_activities_tbl la
            JOIN learning_activities_stats_tbl las ON las.la_stats_id = la.la_stats_id
            LEFT JOIN activity_types_tbl at ON at.activity_type_id = la.activity_type_id
            LEFT JOIN learning_resources_tbl lr ON lr.resource_id = la.resource_id
            WHERE {' AND '.join(where)}
            ORDER BY la.la_id""",
        tuple(params)
    )
    out = []
    for r in cursor.fetchall():
        kind = MCQ if r["type"] in (MCQ, "Quiz") else r["type"]
        out.append({"la_id": r["la_id"], "title": r["activity_title"] or "Untitled", "type": kind or "—",
                    "status": r["status"], "lesson": r["lesson"] or "—"})
    return out


def _learner_ids(cursor):
    cursor.execute(
        """SELECT a.acc_id FROM account_tbl a JOIN usertype_tbl ut ON ut.ut_id = a.u_type
           WHERE ut.u_type = 'Learner' AND (a.is_deleted = 0 OR a.is_deleted IS NULL)"""
    )
    return [r["acc_id"] for r in cursor.fetchall()]


def _performance(cursor, owner):
    acts = [a for a in _activities(cursor, owner, published_only=True) if a["type"] in GAME_TABLES]
    learners = _learner_ids(cursor)
    answers, _ = insights.first_try_answers(cursor, acts, learners)
    per = {}
    for a in answers:
        entry = per.setdefault(a["la_id"], {"answered": 0, "right": 0, "learners": set()})
        entry["answered"] += 1
        entry["learners"].add(a["acc_id"])
        if a["outcome"] == "correct":
            entry["right"] += 1
    ranked = []
    for act in acts:
        e = per.get(act["la_id"])
        if not e or len(e["learners"]) < MIN_LEARNERS:
            continue
        pct = insights.percent(e["right"], e["answered"])
        ranked.append({**act, "percent": pct, "band": insights.band(pct), "learners": len(e["learners"]),
                       "answers": e["answered"], "edit_url": _activity_url(act["la_id"])})
    ranked.sort(key=lambda r: (r["percent"], -r["learners"]))
    _, questions = insights.lesson_activity_stats(cursor, acts, [{"acc_id": a} for a in learners], top=TOP_QUESTIONS)
    lesson_of = {a["la_id"]: a["lesson"] for a in acts}
    for q in questions:
        q["lesson"] = lesson_of.get(q["la_id"], "—")
        q["edit_url"] = _activity_url(q["la_id"])
    return {
        "hardest": ranked[0] if ranked else None,
        "activities": ranked[:HARDEST_LIST],
        "questions": questions,
        "min_learners": MIN_LEARNERS,
    }


def _item_counts(cursor, ids):
    """{la_id: number of items (not removed)} for these activities."""
    counts = {}
    if not ids:
        return counts
    ph = ",".join(["%s"] * len(ids))
    for _, (_, _, items_table, _) in GAME_TABLES.items():
        cursor.execute(
            f"SELECT la_id, COUNT(*) AS n FROM {items_table} WHERE la_id IN ({ph}) AND is_removed = 0 GROUP BY la_id",
            tuple(ids)
        )
        for r in cursor.fetchall():
            counts[r["la_id"]] = counts.get(r["la_id"], 0) + int(r["n"])
    return counts


def _missing_by_activity(cursor, acts):
    """{la_id: {"feedback": n, "hint": n, "items": n}} - items with something missing."""
    out = {}
    by_type = {}
    for a in acts:
        by_type.setdefault(a["type"], []).append(a["la_id"])

    def add(la_id, what):
        entry = out.setdefault(la_id, {"feedback": 0, "hint": 0})
        entry[what] += 1

    ids = by_type.get(MCQ, [])
    if ids:
        ph = ",".join(["%s"] * len(ids))
        cursor.execute(
            f"""SELECT q.la_id, q.q_id, q.correct_feedback, q.incorrect_feedback,
                       MAX(o.is_correct = 1 AND COALESCE(TRIM(o.feedback), '') <> '') AS right_option_fb,
                       MAX(o.is_correct = 0 AND COALESCE(TRIM(o.feedback), '') <> '') AS wrong_option_fb
                FROM mcq_questions_tbl q
                LEFT JOIN mcq_options_tbl o ON o.q_id = q.q_id AND o.is_removed = 0
                WHERE q.la_id IN ({ph}) AND q.is_removed = 0
                GROUP BY q.la_id, q.q_id, q.correct_feedback, q.incorrect_feedback""",
            tuple(ids)
        )
        for r in cursor.fetchall():
            no_right = _empty(r["correct_feedback"]) and not r["right_option_fb"]
            no_wrong = _empty(r["incorrect_feedback"]) and not r["wrong_option_fb"]
            if no_right or no_wrong:
                add(r["la_id"], "feedback")

    for kind, table in ((FIB, "fill_blanks_tbl"), (FC, "flashcards_tbl")):
        ids = by_type.get(kind, [])
        if not ids:
            continue
        ph = ",".join(["%s"] * len(ids))
        cursor.execute(
            f"""SELECT la_id, correct_feedback, incorrect_feedback, hint
                FROM {table} WHERE la_id IN ({ph}) AND is_removed = 0""",
            tuple(ids)
        )
        for r in cursor.fetchall():
            if _empty(r["correct_feedback"]) or _empty(r["incorrect_feedback"]):
                add(r["la_id"], "feedback")
            if _empty(r["hint"]):
                add(r["la_id"], "hint")
    return out


def _health(cursor, owner):
    acts = [a for a in _activities(cursor, owner) if a["type"] in GAME_TABLES]
    counts = _item_counts(cursor, [a["la_id"] for a in acts])
    too_few, under_target = [], 0
    for a in acts:
        n = counts.get(a["la_id"], 0)
        if n < POOL_TARGET:
            under_target += 1
        if n < DRAW_SIZE:
            too_few.append({**a, "items": n, "edit_url": _activity_url(a["la_id"])})
    too_few.sort(key=lambda a: (a["items"], a["title"].lower()))

    missing = _missing_by_activity(cursor, acts)
    feedback = []
    for a in acts:
        m = missing.get(a["la_id"])
        if m:
            feedback.append({**a, "missing_feedback": m["feedback"], "missing_hint": m["hint"],
                             "items": counts.get(a["la_id"], 0), "edit_url": _activity_url(a["la_id"])})
    feedback.sort(key=lambda a: (-(a["missing_feedback"] + a["missing_hint"]), a["title"].lower()))

    where, params = ["COALESCE(ce.is_archived, 0) = 0", "COALESCE(st.la_stats_name, '') <> 'Archived'"], []
    if owner:
        where.append("ce.uploaded_by = %s")
        params.append(owner)
    cursor.execute(
        f"""SELECT ce.exercise_id, ce.exercise_title, st.la_stats_name AS status, lr.resource_title AS lesson,
                   ce.expected_answer,
                   (SELECT COUNT(*) FROM test_cases_tbl tc WHERE tc.exercise_id = ce.exercise_id
                      AND COALESCE(TRIM(tc.expected_output), '') <> '') AS outputs
            FROM coding_exercises_tbl ce
            LEFT JOIN learning_activities_stats_tbl st ON st.la_stats_id = ce.exercise_stats_id
            LEFT JOIN learning_resources_tbl lr ON lr.resource_id = ce.resource_id
            WHERE {' AND '.join(where)}
            ORDER BY ce.exercise_id""",
        tuple(params)
    )
    exercises = [{"exercise_id": r["exercise_id"], "title": r["exercise_title"] or "Untitled",
                  "status": r["status"] or "Draft", "lesson": r["lesson"] or "—",
                  "edit_url": _exercise_url(r["exercise_id"])}
                 for r in cursor.fetchall() if _empty(r["expected_answer"]) and not r["outputs"]]
    return {
        "activities_checked": len(acts),
        "too_few": too_few[:LIST_LIMIT], "too_few_total": len(too_few),
        "under_target": under_target,
        "feedback": feedback[:LIST_LIMIT], "feedback_total": len(feedback),
        "items_missing_feedback": sum(a["missing_feedback"] for a in feedback),
        "items_missing_hint": sum(a["missing_hint"] for a in feedback),
        "exercises": exercises[:LIST_LIMIT], "exercises_total": len(exercises),
        "draw_size": DRAW_SIZE, "pool_target": POOL_TARGET,
    }


def get_content_insights(owner=None):
    """{"performance": {...}, "health": {...}} or None when the database is down."""
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        from game_plays import ensure_play_schema   # hint / feedback columns
        ensure_play_schema(connection)
        cursor = connection.cursor(dictionary=True)
        result = {"performance": _performance(cursor, owner), "health": _health(cursor, owner),
                  "only_mine": bool(owner)}
        cursor.close()
        return result
    except Error as e:
        print(f"content_health: failed: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()
