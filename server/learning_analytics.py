"""
learning_analytics.py - Admin > Analytics (Learning Analytics dashboard)
------------------------------------------------------------------------
Read-only numbers behind the Analytics page. Learner accounts only,
archived (deleted) accounts excluded. This file never writes anything.

Every score is the SAME lesson Performance % the learner sees on their
lesson summary / profile and the admin sees on Learner Progress: the
rows and grades come from learner_progress_monitor (_fetch_progress_rows
+ _evaluate_rows -> module_performance.lesson_grade_percent). Only
lessons that are live in the course (published, module / chapter not
archived) are counted.

CARDS
  lesson_performance   one bar per module (course order): the average
                       lesson score of every learner who has one there.
                       Only modules with at least one gradeable lesson (a
                       published MCQ / FIB / Flashcards activity with items,
                       or a published coding exercise) - a module with
                       nothing to score is left out. "learners" = distinct
                       learners with a score in the module, so it always
                       matches the average beside it. The chart and the
                       "View data" table draw this same list, same order.
  score_distribution   each learner's overall average (average of their
                       lesson scores), counted per score band
  stages               one entry per activity type (Multiple Choice,
                       Fill in the Blanks, Flashcards, Coding Exercise):
                         avg       - average % of the activities done
                                     (games: completed ones, like the
                                     learner profile; coding: latest
                                     attempt, full marks once passed)
                         completed - learners who completed at least one
  trend                last 8 weeks (always, whatever the range filter):
                         active_learners - learners with a successful login
                         avg_score       - average score of the lessons
                                           completed that week
  topics               modules ranked by average score: the 3 strongest
                       and the 3 weakest (never the same module twice)

FILTERS
  status  ''/'all' | 'active' | 'inactive'   (account_tbl.status)
  range   ''/'all' | '7d' | '30d' | '90d'    lessons with activity in
          the last N days (started, read, watched or completed)
"""

from datetime import datetime, timedelta
from mysql.connector import Error

from cobradb import get_db_connection
from live_cache import live_cached  # 10-second memory for the auto-refreshing admin pages
from account_status import refresh_inactive_accounts
from learner_progress_monitor import _fetch_progress_rows, _evaluate_rows, _load_course_tree, _load_lesson_structure

STATUS_FILTERS = {"active": "Active", "inactive": "Inactive"}
RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90}
TREND_WEEKS = 8
TOPIC_COUNT = 3

# Highest first - the donut legend reads top to bottom.
SCORE_BANDS = (
    ("90-100%", 90, 100),
    ("80-89%", 80, 89),
    ("70-79%", 70, 79),
    ("60-69%", 60, 69),
    ("50-59%", 50, 59),
    ("Below 50%", 0, 49),
)

STAGES = (
    ("mcq", "Multiple Choice"),
    ("fib", "Fill in the Blanks"),
    ("flashcards", "Flashcards"),
    ("coding", "Coding Exercise"),
)
TYPE_KEYS = {
    "Multiple Choice": "mcq",
    "Quiz": "mcq",
    "Fill in the Blanks": "fib",
    "Flashcards": "flashcards",
}


def _avg(values):
    return round(sum(values) / len(values)) if values else None


def _clean_filters(status, date_range):
    status = (status or "").strip().lower()
    date_range = (date_range or "").strip().lower()
    return (
        status if status in STATUS_FILTERS else "all",
        date_range if date_range in RANGE_DAYS else "all",
    )


def _learner_statuses(cursor):
    """{acc_id: 'Active' | 'Inactive'} for every non-archived learner."""
    cursor.execute(
        """SELECT a.acc_id, a.status
           FROM account_tbl a
           JOIN usertype_tbl ut ON a.u_type = ut.ut_id
           WHERE ut.u_type = 'Learner'
             AND (a.is_deleted = 0 OR a.is_deleted IS NULL)"""
    )
    return {r["acc_id"]: (r["status"] or "Active") for r in cursor.fetchall()}


def _last_touched(row):
    """The latest time the learner did anything in this lesson."""
    times = [row.get(k) for k in ("started_at", "content_read_at", "video_watched_at", "completed_at")]
    times = [t for t in times if t]
    return max(times) if times else None


def _week_starts(today):
    """Monday of each of the last TREND_WEEKS weeks, oldest first."""
    this_monday = today - timedelta(days=today.weekday())
    return [this_monday - timedelta(weeks=i) for i in range(TREND_WEEKS - 1, -1, -1)]


def _fmt_day(d):
    return f"{d.strftime('%b')} {d.day}"


def empty_analytics(status="all", date_range="all"):
    """Used when the DB is unreachable so the page still renders."""
    return {
        "filters": {"status": status, "range": date_range},
        "learners_total": 0,
        "learners_scored": 0,
        "records": 0,
        "lesson_performance": [],
        "score_distribution": [{"label": b[0], "count": 0} for b in SCORE_BANDS],
        "stages": [{"key": k, "label": label, "avg": None, "completed": 0} for k, label in STAGES],
        "trend": [],
        "topics": {"strongest": [], "weakest": []},
    }


@live_cached   # the admin pages refresh every 10 s - see live_cache.py
def get_learning_analytics(status=None, date_range=None):
    """Everything the Analytics page shows, or None if the database is unreachable."""
    status, date_range = _clean_filters(status, date_range)

    connection = get_db_connection()
    if connection is None:
        return None

    # Same sweep as Account & Security, so Active / Inactive is up to date.
    refresh_inactive_accounts(connection)

    try:
        cursor = connection.cursor(dictionary=True)

        statuses = _learner_statuses(cursor)
        if status != "all":
            wanted = STATUS_FILTERS[status]
            learner_ids = {acc for acc, st in statuses.items() if st == wanted}
        else:
            learner_ids = set(statuses)

        chapters, lesson_path = _load_course_tree(cursor)
        gradeable = _gradeable_modules(cursor, lesson_path)

        rows = [
            r for r in _fetch_progress_rows(cursor)
            if r["acc_id"] in learner_ids and r["resource_id"] in lesson_path
        ]
        if date_range != "all":
            cutoff = datetime.now() - timedelta(days=RANGE_DAYS[date_range])
            rows = [r for r in rows if (_last_touched(r) or datetime.min) >= cutoff]

        evaluated = _evaluate_rows(cursor, rows)
        pairs = list(zip(rows, evaluated))

        trend = _build_trend(cursor, pairs, learner_ids)
        cursor.close()

        modules = _module_performance(chapters, pairs, lesson_path, gradeable)
        return {
            "filters": {"status": status, "range": date_range},
            "learners_total": len(learner_ids),
            "learners_scored": len({ev["acc_id"] for ev in evaluated if ev["score"] is not None}),
            "records": len(evaluated),
            "lesson_performance": modules,
            "score_distribution": _score_distribution(evaluated),
            "stages": _stages(evaluated),
            "trend": trend,
            "topics": _topics(modules),
        }

    except Error as e:
        print(f"learning_analytics: failed to load analytics: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Cards
# ------------------------------------------------------------------
def _gradeable_modules(cursor, lesson_path):
    """
    module_ids that have at least one lesson with something to score: a
    published activity with items or a published coding exercise - the same
    lesson structure the lesson grade itself is built from.
    """
    structure = _load_lesson_structure(cursor, sorted(lesson_path))
    modules = set()
    for rid, lesson in structure.items():
        if lesson["exercise"] or any(a["item_total"] > 0 for a in lesson["activities"]):
            modules.add(lesson_path[rid]["module_id"])
    return modules


def _module_performance(chapters, pairs, lesson_path, gradeable):
    scores = {}
    learners = {}
    for row, ev in pairs:
        if ev["score"] is None:
            continue
        module_id = lesson_path[row["resource_id"]]["module_id"]
        scores.setdefault(module_id, []).append(ev["score"])
        learners.setdefault(module_id, set()).add(ev["acc_id"])

    out = []
    for chapter in chapters:
        for module in chapter["modules"]:
            mid = module["module_id"]
            if mid not in gradeable:
                continue   # nothing in this module can be scored
            out.append({
                "module_id": mid,
                "name": module["name"],
                "chapter": chapter["name"],
                "avg": _avg(scores.get(mid, [])),
                "learners": len(learners.get(mid, ())),
            })
    return out


def _score_distribution(evaluated):
    per_learner = {}
    for ev in evaluated:
        if ev["score"] is not None:
            per_learner.setdefault(ev["acc_id"], []).append(ev["score"])

    counts = {label: 0 for label, _, _ in SCORE_BANDS}
    for scores in per_learner.values():
        average = _avg(scores)
        for label, low, high in SCORE_BANDS:
            if low <= average <= high:
                counts[label] += 1
                break
    return [{"label": label, "count": counts[label]} for label, _, _ in SCORE_BANDS]


def _stages(evaluated):
    fractions = {key: [] for key, _ in STAGES}
    completed = {key: set() for key, _ in STAGES}

    for ev in evaluated:
        for act in ev["activities"]:
            key = TYPE_KEYS.get(act["type"])
            if not key or not act["completed"] or not act["total"]:
                continue
            fractions[key].append(act["score"] / act["total"])
            completed[key].add(ev["acc_id"])

        ex = ev["exercise"]
        if ex and ex["points_total"] and (ex["attempts"] or ex["passed"]):
            fractions["coding"].append(ex["points_earned"] / ex["points_total"])
            if ex["passed"]:
                completed["coding"].add(ev["acc_id"])

    return [
        {
            "key": key,
            "label": label,
            "avg": round(sum(fractions[key]) / len(fractions[key]) * 100) if fractions[key] else None,
            "completed": len(completed[key]),
        }
        for key, label in STAGES
    ]


def _build_trend(cursor, pairs, learner_ids):
    starts = _week_starts(datetime.now().date())
    first_day = starts[0]

    weekly_logins = [set() for _ in starts]
    cursor.execute(
        """SELECT acc_id, attempted_at FROM login_logs_tbl
           WHERE attempt_status = 'Success' AND attempted_at >= %s""",
        (first_day,)
    )
    for r in cursor.fetchall():
        if r["acc_id"] not in learner_ids or not r["attempted_at"]:
            continue
        index = (r["attempted_at"].date() - first_day).days // 7
        if 0 <= index < len(starts):
            weekly_logins[index].add(r["acc_id"])

    weekly_scores = [[] for _ in starts]
    for row, ev in pairs:
        done = row.get("completed_at")
        if row.get("status") != "completed" or not done or ev["score"] is None:
            continue
        index = (done.date() - first_day).days // 7
        if 0 <= index < len(starts):
            weekly_scores[index].append(ev["score"])

    return [
        {
            "label": _fmt_day(start),
            "range_label": f"{_fmt_day(start)} - {_fmt_day(start + timedelta(days=6))}",
            "active_learners": len(weekly_logins[i]),
            "avg_score": _avg(weekly_scores[i]),
        }
        for i, start in enumerate(starts)
    ]


def _topics(modules):
    ranked = sorted((m for m in modules if m["avg"] is not None), key=lambda m: -m["avg"])
    strong_n = min(TOPIC_COUNT, (len(ranked) + 1) // 2)
    weak_n = min(TOPIC_COUNT, len(ranked) - strong_n)

    def pick(m):
        return {"name": m["name"], "chapter": m["chapter"], "avg": m["avg"], "learners": m["learners"]}

    return {
        "strongest": [pick(m) for m in ranked[:strong_n]],
        "weakest": [pick(m) for m in reversed(ranked[len(ranked) - weak_n:])] if weak_n else [],
    }
