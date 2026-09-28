"""
learner_progress_monitor.py - Admin > Learner Progress (By Lesson view)
------------------------------------------------------------------
Read-only helpers behind the Admin > Learner Progress page. One row =
one learner in one lesson (learner_resource_progress_tbl). Learner
accounts only (usertype_tbl.u_type = 'Learner'), deleted accounts
excluded. This file never writes anything.

SCORE
    The SAME Performance % the learner sees on their lesson summary.
    The formula mirrors lesson_summary.get_lesson_performance_summary()
    exactly - it is loaded in bulk here so a whole table costs a handful
    of queries instead of a new connection + several queries per row.
    If that formula ever changes, change _evaluate() here too.
      - activities: learner's score / item count (MCQ questions, FIB
        items, flashcards), published activities only
      - exercise (latest published, non-archived): full credit once a
        learner_exercise_progress_tbl row exists, otherwise the latest
        attempt's test_cases_passed
      - lessons with nothing graded -> score None (shown as "—")

COMPLETION
    lesson steps done / lesson steps that exist:
      video (only if the lesson has a published video), content, each
      published activity, the exercise (only if the lesson has one).

FILTERS
    search (learner ID or name), status ('passed' = score >= 80,
    'below' = score < 80), Started range, Completed range.
    Metric cards follow search + dates, never the status filter.
"""

from datetime import datetime
from mysql.connector import Error
from cobradb import get_db_connection

DEFAULT_PER_PAGE = 8
PASS_MARK = 80
VALID_STATUS_FILTERS = {"passed", "below"}


# ------------------------------------------------------------------
# Small helpers
# ------------------------------------------------------------------
def _fmt_date(dt):
    """e.g. 'Jul 1, 2026'."""
    if not dt:
        return "—"
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _clean_date(value):
    """Only a real 'YYYY-MM-DD' date is used; anything else is ignored."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def _ph(items):
    return ",".join(["%s"] * len(items))


def _full_name(row):
    name = " ".join(part for part in [row.get("firstname"), row.get("lastname")] if part).strip()
    return name or "—"


def _empty_metrics():
    return {"total_records": 0, "average_score": "—", "completed_100": 0, "below_80": 0}


def empty_learner_progress_overview():
    """Used when the DB is unreachable so the page still renders."""
    return {
        "records": [], "metrics": _empty_metrics(),
        "total": 0, "page": 1, "per_page": DEFAULT_PER_PAGE, "total_pages": 1,
    }


# ------------------------------------------------------------------
# 1. Progress rows (learner x lesson)
# ------------------------------------------------------------------
def _fetch_progress_rows(cursor, search_query=None, started_from=None, started_to=None,
                         completed_from=None, completed_to=None, progress_id=None):
    clauses = [
        "ut.u_type = 'Learner'",
        "(a.is_deleted = 0 OR a.is_deleted IS NULL)",
    ]
    params = []

    if progress_id is not None:
        clauses.append("lrp.progress_id = %s")
        params.append(progress_id)

    term = (search_query or "").strip().lower()
    if term:
        like = f"%{term}%"
        clauses.append(
            "(LOWER(lrp.acc_id) LIKE %s "
            "OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s)"
        )
        params.extend([like, like])

    if started_from:
        clauses.append("DATE(lrp.started_at) >= %s")
        params.append(started_from)
    if started_to:
        clauses.append("DATE(lrp.started_at) <= %s")
        params.append(started_to)

    # A Completed range only makes sense for lessons that ARE completed.
    if completed_from or completed_to:
        clauses.append("lrp.status = 'completed'")
    if completed_from:
        clauses.append("DATE(lrp.completed_at) >= %s")
        params.append(completed_from)
    if completed_to:
        clauses.append("DATE(lrp.completed_at) <= %s")
        params.append(completed_to)

    cursor.execute(
        f"""
        SELECT
            lrp.progress_id, lrp.acc_id, lrp.resource_id, lrp.status,
            lrp.started_at, lrp.video_watched_at, lrp.content_read_at, lrp.completed_at,
            p.firstname, p.lastname,
            lr.resource_title
        FROM learner_resource_progress_tbl lrp
        JOIN account_tbl a ON lrp.acc_id = a.acc_id
        JOIN usertype_tbl ut ON a.u_type = ut.ut_id
        LEFT JOIN profile_tbl p ON lrp.acc_id = p.acc_id
        LEFT JOIN learning_resources_tbl lr ON lrp.resource_id = lr.resource_id
        WHERE {' AND '.join(clauses)}
        ORDER BY lrp.started_at DESC, lrp.progress_id DESC
        """,
        tuple(params)
    )
    return cursor.fetchall()


# ------------------------------------------------------------------
# 2. What each lesson contains (loaded once per lesson, not per row)
# ------------------------------------------------------------------
def _load_lesson_structure(cursor, resource_ids):
    lessons = {rid: {"has_video": False, "activities": [], "exercise": None} for rid in resource_ids}
    if not resource_ids:
        return lessons
    ids = tuple(resource_ids)

    # Published video?
    cursor.execute(
        f"""SELECT DISTINCT vt.resource_id
            FROM video_tutorials_tbl vt
            JOIN learning_resources_stats_tbl lrs ON vt.video_stats_id = lrs.lr_stats_id
            WHERE vt.resource_id IN ({_ph(ids)}) AND lrs.lr_stats_name = 'Published'""",
        ids
    )
    for r in cursor.fetchall():
        lessons[r["resource_id"]]["has_video"] = True

    # Published activities + how many graded items each has
    cursor.execute(
        f"""SELECT
                la.la_id, la.resource_id, la.activity_title, atp.activity_type_name,
                (SELECT COUNT(*) FROM mcq_questions_tbl q WHERE q.la_id = la.la_id) AS mcq_count,
                (SELECT COUNT(*) FROM fill_blanks_tbl f WHERE f.la_id = la.la_id) AS fib_count,
                (SELECT COUNT(*) FROM flashcards_tbl fc WHERE fc.la_id = la.la_id) AS fc_count
            FROM learning_activities_tbl la
            JOIN learning_activities_stats_tbl las ON la.la_stats_id = las.la_stats_id
            LEFT JOIN activity_types_tbl atp ON la.activity_type_id = atp.activity_type_id
            WHERE la.resource_id IN ({_ph(ids)}) AND las.la_stats_name = 'Published'
            ORDER BY la.la_id ASC""",
        ids
    )
    for r in cursor.fetchall():
        activity_type = r.get("activity_type_name") or ""
        if activity_type in ("Multiple Choice", "Quiz"):
            item_total = r["mcq_count"]
        elif activity_type == "Fill in the Blanks":
            item_total = r["fib_count"]
        elif activity_type == "Flashcards":
            item_total = r["fc_count"]
        else:
            item_total = 0
        lessons[r["resource_id"]]["activities"].append({
            "la_id": r["la_id"],
            "title": r["activity_title"],
            "type": activity_type or "—",
            "item_total": int(item_total or 0),
        })

    # Latest published, non-archived exercise per lesson + its test-case count
    cursor.execute(
        f"""SELECT
                ce.exercise_id, ce.resource_id, ce.exercise_title,
                (SELECT COUNT(*) FROM test_cases_tbl tc WHERE tc.exercise_id = ce.exercise_id) AS test_total
            FROM coding_exercises_tbl ce
            JOIN learning_activities_stats_tbl las ON ce.exercise_stats_id = las.la_stats_id
            WHERE ce.resource_id IN ({_ph(ids)}) AND las.la_stats_name = 'Published'
              AND COALESCE(ce.is_archived, 0) = 0
            ORDER BY ce.exercise_id DESC""",
        ids
    )
    for r in cursor.fetchall():
        lesson = lessons[r["resource_id"]]
        if lesson["exercise"] is None:  # first row = highest exercise_id
            lesson["exercise"] = {
                "exercise_id": r["exercise_id"],
                "title": r["exercise_title"],
                "test_total": int(r["test_total"] or 0),
            }

    return lessons


# ------------------------------------------------------------------
# 3. What each learner did (bulk)
# ------------------------------------------------------------------
def _load_activity_progress(cursor, acc_ids, la_ids):
    if not acc_ids or not la_ids:
        return {}
    cursor.execute(
        f"""SELECT acc_id, la_id, status, score
            FROM learner_activity_progress_tbl
            WHERE acc_id IN ({_ph(acc_ids)}) AND la_id IN ({_ph(la_ids)})
            ORDER BY progress_id ASC""",
        tuple(acc_ids) + tuple(la_ids)
    )
    progress = {}
    for r in cursor.fetchall():
        progress.setdefault((r["acc_id"], r["la_id"]), r)
    return progress


def _load_exercise_results(cursor, acc_ids, exercise_ids):
    """Returns (passed_keys, submissions) keyed by (acc_id, exercise_id)."""
    if not acc_ids or not exercise_ids:
        return set(), {}
    params = tuple(acc_ids) + tuple(exercise_ids)

    cursor.execute(
        f"""SELECT DISTINCT acc_id, exercise_id
            FROM learner_exercise_progress_tbl
            WHERE acc_id IN ({_ph(acc_ids)}) AND exercise_id IN ({_ph(exercise_ids)})""",
        params
    )
    passed = {(r["acc_id"], r["exercise_id"]) for r in cursor.fetchall()}

    cursor.execute(
        f"""SELECT acc_id, exercise_id, test_cases_passed
            FROM exercise_submissions_tbl
            WHERE acc_id IN ({_ph(acc_ids)}) AND exercise_id IN ({_ph(exercise_ids)})
            ORDER BY attempt_number ASC, submission_id ASC""",
        params
    )
    submissions = {}
    for r in cursor.fetchall():
        key = (r["acc_id"], r["exercise_id"])
        entry = submissions.setdefault(key, {"attempts": 0, "latest_passed": 0})
        entry["attempts"] += 1
        entry["latest_passed"] = int(r["test_cases_passed"] or 0)  # last row = latest attempt
    return passed, submissions


# ------------------------------------------------------------------
# 4. Score + completion for one row
# ------------------------------------------------------------------
def _evaluate(row, lesson, act_progress, ex_passed, submissions):
    acc_id = row["acc_id"]

    activities = []
    graded_points = 0.0
    graded_total = 0
    activities_done = 0

    for act in lesson["activities"]:
        prog = act_progress.get((acc_id, act["la_id"]))
        completed = bool(prog and prog["status"] == "completed")
        score = int(prog["score"] or 0) if prog else 0
        if completed:
            activities_done += 1

        activities.append({
            "title": act["title"],
            "type": act["type"],
            "score": score,
            "total": act["item_total"],
            "completed": completed,
            "started": prog is not None,
        })

        if act["item_total"] > 0:
            graded_points += score
            graded_total += act["item_total"]

    exercise = None
    exercise_done = False
    ex = lesson["exercise"]
    if ex:
        key = (acc_id, ex["exercise_id"])
        passed = key in ex_passed
        sub = submissions.get(key)
        points = ex["test_total"] if passed else (sub["latest_passed"] if sub else 0)
        exercise_done = passed

        exercise = {
            "title": ex["title"],
            "points_earned": points,
            "points_total": ex["test_total"],
            "passed": passed,
            "attempts": sub["attempts"] if sub else 0,
        }

        if ex["test_total"] > 0:
            graded_points += points
            graded_total += ex["test_total"]

    score_pct = round((graded_points / graded_total) * 100) if graded_total > 0 else None

    video_watched = row.get("video_watched_at") is not None
    content_read = row.get("content_read_at") is not None

    steps_total = 1 + len(activities) + (1 if lesson["has_video"] else 0) + (1 if ex else 0)
    steps_done = (
        (1 if content_read else 0)
        + activities_done
        + (1 if lesson["has_video"] and video_watched else 0)
        + (1 if exercise_done else 0)
    )
    completion = round((steps_done / steps_total) * 100)

    is_completed = row.get("status") == "completed"

    return {
        "progress_id": row["progress_id"],
        "acc_id": acc_id,
        "name": _full_name(row),
        "lesson": row.get("resource_title") or "—",
        "score": score_pct,
        "completion": completion,
        "started_at": _fmt_date(row.get("started_at")),
        "completed_at": _fmt_date(row.get("completed_at")) if is_completed else "—",
        "is_completed": is_completed,
        # Modal-only details
        "has_video": lesson["has_video"],
        "video_watched": video_watched,
        "content_read": content_read,
        "activities": activities,
        "exercise": exercise,
        "graded_points": int(graded_points),
        "graded_total": graded_total,
        "steps_done": steps_done,
        "steps_total": steps_total,
    }


def _evaluate_rows(cursor, rows):
    if not rows:
        return []

    resource_ids = sorted({r["resource_id"] for r in rows})
    lessons = _load_lesson_structure(cursor, resource_ids)

    acc_ids = sorted({r["acc_id"] for r in rows})
    la_ids = sorted({a["la_id"] for lesson in lessons.values() for a in lesson["activities"]})
    exercise_ids = sorted({lesson["exercise"]["exercise_id"] for lesson in lessons.values() if lesson["exercise"]})

    act_progress = _load_activity_progress(cursor, acc_ids, la_ids)
    ex_passed, submissions = _load_exercise_results(cursor, acc_ids, exercise_ids)

    return [
        _evaluate(row, lessons[row["resource_id"]], act_progress, ex_passed, submissions)
        for row in rows
    ]


TABLE_KEYS = ("progress_id", "acc_id", "name", "lesson", "score", "completion",
              "started_at", "completed_at", "is_completed")


# ------------------------------------------------------------------
# Public: page data
# ------------------------------------------------------------------
def get_learner_progress_overview(search_query=None, status_filter=None,
                                  started_from=None, started_to=None,
                                  completed_from=None, completed_to=None,
                                  page=1, per_page=DEFAULT_PER_PAGE):
    """
    Returns {"records", "metrics", "total", "page", "per_page", "total_pages"}
    or None if the database is unreachable.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)

        rows = _fetch_progress_rows(
            cursor, search_query,
            _clean_date(started_from), _clean_date(started_to),
            _clean_date(completed_from), _clean_date(completed_to),
        )
        evaluated = _evaluate_rows(cursor, rows)
        cursor.close()

        # --- Metric cards (search + dates only) ---
        scored = [r["score"] for r in evaluated if r["score"] is not None]
        metrics = {
            "total_records": len(evaluated),
            "average_score": f"{round(sum(scored) / len(scored))}%" if scored else "—",
            "completed_100": sum(1 for r in evaluated if r["completion"] == 100),
            "below_80": sum(1 for s in scored if s < PASS_MARK),
        }

        # --- Status filter (table only) ---
        status = (status_filter or "").strip().lower()
        if status == "passed":
            evaluated = [r for r in evaluated if r["score"] is not None and r["score"] >= PASS_MARK]
        elif status == "below":
            evaluated = [r for r in evaluated if r["score"] is not None and r["score"] < PASS_MARK]

        total = len(evaluated)
        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(max(1, page or 1), total_pages)
        offset = (page - 1) * per_page

        records = [{key: r[key] for key in TABLE_KEYS} for r in evaluated[offset:offset + per_page]]

        return {
            "records": records,
            "metrics": metrics,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    except Error as e:
        print(f"learner_progress_monitor: failed to load overview: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


# ------------------------------------------------------------------
# Public: modal data
# ------------------------------------------------------------------
def get_learner_progress_detail(progress_id):
    """One record with its full breakdown, or None if not found."""
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        rows = _fetch_progress_rows(cursor, progress_id=progress_id)
        evaluated = _evaluate_rows(cursor, rows)
        cursor.close()
        return evaluated[0] if evaluated else None

    except Error as e:
        print(f"learner_progress_monitor: failed to load record {progress_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()