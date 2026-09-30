"""
learner_progress_monitor.py - Admin > Learner Progress (By Lesson + By Learner)
------------------------------------------------------------------
Read-only helpers behind the Admin > Learner Progress page. Learner
accounts only (usertype_tbl.u_type = 'Learner'), deleted accounts
excluded. This file never writes anything.

BY LESSON VIEW: one row = one learner in one lesson
(learner_resource_progress_tbl).

BY LESSON VIEW - SCORE
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
      - Score % = AVERAGE of each gradeable activity's own % (each game
        and the exercise weigh the same, whatever their item count)
      - lessons with nothing graded -> score None (shown as "—")

BY LESSON VIEW - COMPLETION
    lesson steps done / lesson steps that exist:
      video (only if the lesson has a published video), content, each
      published activity, the exercise (only if the lesson has one).

BY LESSON VIEW - FILTERS
    search (learner ID or name), status ('passed' = score >= 80,
    'below' = score < 80), Started range, Completed range.
    Metric cards follow search + dates, never the status filter.

BY LEARNER VIEW: see the section further down.
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
                         completed_from=None, completed_to=None, progress_id=None, acc_id=None):
    clauses = [
        "ut.u_type = 'Learner'",
        "(a.is_deleted = 0 OR a.is_deleted IS NULL)",
    ]
    params = []

    if progress_id is not None:
        clauses.append("lrp.progress_id = %s")
        params.append(progress_id)

    if acc_id is not None:
        clauses.append("lrp.acc_id = %s")
        params.append(acc_id)

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
    activity_percents = []  # one fraction (0..1) per gradeable activity
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
            activity_percents.append(score / act["item_total"])

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
            activity_percents.append(points / ex["test_total"])

    score_pct = (
        round((sum(activity_percents) / len(activity_percents)) * 100)
        if activity_percents else None
    )

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
# Public: By Lesson page data
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
# Public: By Lesson modal data
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


# ==================================================================
# BY LEARNER VIEW
# ------------------------------------------------------------------
# One row = one learner across the course. Every learner account is
# listed, including ones who haven't started (0%).
#
#   Course      = published lessons in non-archived chapters/modules,
#                 ordered like the Learning Map (display_order, then id)
#   Scope       = the whole course, or just the Chapter / Module picked
#                 in the filter - every number is recalculated for it
#   Modules     = modules in scope where every lesson is completed
#   Lessons     = completed lessons in scope / lessons in scope
#   Avg Score   = average of the learner's lesson scores in scope
#                 (lessons with nothing graded are skipped)
#   Completion  = completed / total lessons in scope
#   Last Active = latest started or completed date in scope
#   Locked      = mirrors the Learning Map: first chapter always open;
#                 otherwise open if saved in learner_progress_unlocks_tbl,
#                 the previous chapter is finished, or the learner has
#                 already touched a lesson in it
# ==================================================================
def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _strip_private(summary):
    return {k: v for k, v in summary.items() if not k.startswith("_")}


def _load_course_tree(cursor):
    """Returns (chapters, lesson_path). chapters -> modules -> lessons, in course order."""
    cursor.execute(
        """
        SELECT
            c.cat_id, c.category_name,
            m.module_id, m.module_name,
            lr.resource_id, lr.resource_title
        FROM learning_resources_tbl lr
        JOIN learning_resources_stats_tbl lrs ON lr.lr_stats_id = lrs.lr_stats_id
        JOIN modules_tbl m ON lr.module_id = m.module_id
        JOIN category_tbl c ON m.cat_id = c.cat_id
        WHERE lrs.lr_stats_name = 'Published'
          AND COALESCE(c.is_archived, 0) = 0
          AND COALESCE(m.is_archived, 0) = 0
        ORDER BY
            COALESCE(c.display_order, 999999), c.cat_id,
            COALESCE(m.display_order, 999999), m.module_id,
            COALESCE(lr.display_order, 999999), lr.resource_id
        """
    )
    chapters = []
    chapter_index = {}
    module_index = {}
    lesson_path = {}

    for r in cursor.fetchall():
        chapter = chapter_index.get(r["cat_id"])
        if chapter is None:
            chapter = {"cat_id": r["cat_id"], "name": r["category_name"], "modules": []}
            chapter_index[r["cat_id"]] = chapter
            chapters.append(chapter)

        module = module_index.get(r["module_id"])
        if module is None:
            module = {"module_id": r["module_id"], "name": r["module_name"], "lessons": []}
            module_index[r["module_id"]] = module
            chapter["modules"].append(module)

        module["lessons"].append({"resource_id": r["resource_id"], "title": r["resource_title"]})
        lesson_path[r["resource_id"]] = {
            "cat_id": r["cat_id"],
            "module_id": r["module_id"],
            "chapter": r["category_name"],
            "module": r["module_name"],
        }

    return chapters, lesson_path


def _fetch_learners(cursor, search_query=None, acc_id=None):
    clauses = [
        "ut.u_type = 'Learner'",
        "(a.is_deleted = 0 OR a.is_deleted IS NULL)",
    ]
    params = []

    if acc_id is not None:
        clauses.append("a.acc_id = %s")
        params.append(acc_id)

    term = (search_query or "").strip().lower()
    if term:
        like = f"%{term}%"
        clauses.append(
            "(LOWER(a.acc_id) LIKE %s "
            "OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s)"
        )
        params.extend([like, like])

    cursor.execute(
        f"""
        SELECT a.acc_id, p.firstname, p.lastname
        FROM account_tbl a
        JOIN usertype_tbl ut ON a.u_type = ut.ut_id
        LEFT JOIN profile_tbl p ON a.acc_id = p.acc_id
        WHERE {' AND '.join(clauses)}
        ORDER BY a.acc_id ASC
        """,
        tuple(params)
    )
    return cursor.fetchall()


def _group_stats(lessons):
    """Totals for a module or chapter from its lesson entries."""
    total = len(lessons)
    done = sum(1 for l in lessons if l["status"] == "completed")
    touched = sum(1 for l in lessons if l["status"] != "not_started")
    scores = [l["score"] for l in lessons if l["score"] is not None]
    return {
        "lessons_total": total,
        "lessons_completed": done,
        "lessons_touched": touched,
        "avg_score": round(sum(scores) / len(scores)) if scores else None,
        "completion": round((done / total) * 100) if total else 0,
    }


def _scope_modules(lesson_path, scope_ids):
    """module_id -> set of its lesson ids that are in scope."""
    modules = {}
    for rid in scope_ids:
        modules.setdefault(lesson_path[rid]["module_id"], set()).add(rid)
    return modules


def _summarize_learner(learner, pairs, scope_ids, lesson_path, lessons_total, scope_modules):
    """
    One learner's row. pairs = [(raw progress row, evaluated row), ...].
    scope_modules = module_id -> lesson ids in scope; a module counts as
    done when every one of those lessons is completed.
    """
    in_scope = [(row, ev) for row, ev in pairs if row["resource_id"] in scope_ids]
    completed = [(row, ev) for row, ev in in_scope if ev["is_completed"]]
    open_pairs = [(row, ev) for row, ev in in_scope if not ev["is_completed"]]
    scores = [ev["score"] for _, ev in in_scope if ev["score"] is not None]

    last_active = None
    for row, ev in in_scope:
        for dt in (row.get("started_at"), row.get("completed_at") if ev["is_completed"] else None):
            if dt and (last_active is None or dt > last_active):
                last_active = dt

    current = None
    if not in_scope:
        state = "not_started"
    elif open_pairs:
        state = "in_progress"
        current = max(open_pairs, key=lambda p: (p[0].get("started_at") or datetime.min, p[0]["progress_id"]))
    elif lessons_total and len(completed) >= lessons_total:
        state = "finished"
    else:
        state = "idle"  # nothing open right now - show the last lesson they completed
        current = max(completed, key=lambda p: (p[0].get("completed_at") or datetime.min, p[0]["progress_id"]))

    current_lesson, current_path, current_rid = "—", "", None
    current_chapter, current_module = "—", "—"
    if current:
        current_rid = current[0]["resource_id"]
        current_lesson = current[1]["lesson"]
        path = lesson_path.get(current_rid)
        if path:
            current_chapter = path["chapter"]
            current_module = path["module"]
            current_path = f"{path['chapter']} › {path['module']}"

    completed_ids = {row["resource_id"] for row, _ in completed}
    modules_completed = sum(
        1 for lesson_ids in scope_modules.values() if lesson_ids and lesson_ids <= completed_ids
    )

    return {
        "acc_id": learner["acc_id"],
        "name": _full_name(learner),
        "current_state": state,
        "current_lesson": current_lesson,
        "current_chapter": current_chapter,
        "current_module": current_module,
        "current_path": current_path,
        "modules_completed": modules_completed,
        "modules_total": len(scope_modules),
        "lessons_completed": len(completed),
        "lessons_total": lessons_total,
        "avg_score": round(sum(scores) / len(scores)) if scores else None,
        "completion": round((len(completed) / lessons_total) * 100) if lessons_total else 0,
        "last_active": _fmt_date(last_active),
        "_last_active_raw": last_active,
        "_current_resource_id": current_rid,
    }


def _empty_learner_metrics():
    return {"total_learners": 0, "not_started": 0, "average_score": "—", "finished": 0, "below_80": 0}


def empty_learners_progress_overview():
    """Used when the DB is unreachable so the page still renders."""
    return {
        "learners": [], "metrics": _empty_learner_metrics(),
        "total": 0, "page": 1, "per_page": DEFAULT_PER_PAGE, "total_pages": 1,
    }


def get_progress_filter_options():
    """Chapters with their modules for the Chapter/Module dropdowns."""
    connection = get_db_connection()
    if connection is None:
        return []
    try:
        cursor = connection.cursor(dictionary=True)
        chapters, _ = _load_course_tree(cursor)
        cursor.close()
        return [{
            "cat_id": ch["cat_id"],
            "name": ch["name"],
            "modules": [{"module_id": m["module_id"], "name": m["name"]} for m in ch["modules"]],
        } for ch in chapters]
    except Error as e:
        print(f"learner_progress_monitor: failed to load filter options: {e}")
        return []
    finally:
        if connection.is_connected():
            connection.close()


def get_learners_progress_overview(search_query=None, status_filter=None, cat_id=None,
                                   module_id=None, active_from=None, active_to=None,
                                   page=1, per_page=DEFAULT_PER_PAGE):
    """
    Returns {"learners", "metrics", "total", "page", "per_page", "total_pages"}
    or None if the database is unreachable. Metric cards follow search,
    Chapter/Module and Last Active - never the status filter.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)

        cat_id = _to_int(cat_id)
        module_id = _to_int(module_id)
        active_from = _clean_date(active_from)
        active_to = _clean_date(active_to)

        chapters, lesson_path = _load_course_tree(cursor)
        scope_ids = {
            rid for rid, path in lesson_path.items()
            if (cat_id is None or path["cat_id"] == cat_id)
            and (module_id is None or path["module_id"] == module_id)
        }

        learners = _fetch_learners(cursor, search_query)
        rows = _fetch_progress_rows(cursor, search_query)
        evaluated = _evaluate_rows(cursor, rows)
        cursor.close()

        by_acc = {}
        for row, ev in zip(rows, evaluated):
            by_acc.setdefault(row["acc_id"], []).append((row, ev))

        scope_modules = _scope_modules(lesson_path, scope_ids)
        summaries = [
            _summarize_learner(l, by_acc.get(l["acc_id"], []), scope_ids, lesson_path,
                               len(scope_ids), scope_modules)
            for l in learners
        ]

        # --- Last Active range (learners with no activity drop out) ---
        if active_from or active_to:
            start = datetime.strptime(active_from, "%Y-%m-%d").date() if active_from else None
            end = datetime.strptime(active_to, "%Y-%m-%d").date() if active_to else None
            summaries = [
                s for s in summaries
                if s["_last_active_raw"]
                and (start is None or s["_last_active_raw"].date() >= start)
                and (end is None or s["_last_active_raw"].date() <= end)
            ]

        # --- Metric cards ---
        avgs = [s["avg_score"] for s in summaries if s["avg_score"] is not None]
        metrics = {
            "total_learners": len(summaries),
            "not_started": sum(1 for s in summaries if s["current_state"] == "not_started"),
            "average_score": f"{round(sum(avgs) / len(avgs))}%" if avgs else "—",
            "finished": sum(1 for s in summaries if s["current_state"] == "finished"),
            "below_80": sum(1 for a in avgs if a < PASS_MARK),
        }

        # --- Status filter (table only) ---
        status = (status_filter or "").strip().lower()
        if status == "passed":
            summaries = [s for s in summaries if s["avg_score"] is not None and s["avg_score"] >= PASS_MARK]
        elif status == "below":
            summaries = [s for s in summaries if s["avg_score"] is not None and s["avg_score"] < PASS_MARK]

        # Most recently active first, never-started learners last
        summaries.sort(key=lambda s: (
            s["_last_active_raw"] is None,
            -(s["_last_active_raw"].timestamp()) if s["_last_active_raw"] else 0,
            s["acc_id"],
        ))

        total = len(summaries)
        per_page = max(1, per_page)
        total_pages = max(1, (total + per_page - 1) // per_page)
        page = min(max(1, page or 1), total_pages)
        offset = (page - 1) * per_page

        return {
            "learners": [_strip_private(s) for s in summaries[offset:offset + per_page]],
            "metrics": metrics,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    except Error as e:
        print(f"learner_progress_monitor: failed to load learners overview: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_learner_course_detail(acc_id):
    """
    One learner's whole course, grouped Chapter -> Module -> Lesson
    (every published lesson, including ones not started). None if the
    learner doesn't exist.
    """
    connection = get_db_connection()
    if connection is None:
        return None

    try:
        cursor = connection.cursor(dictionary=True)

        learners = _fetch_learners(cursor, acc_id=acc_id)
        if not learners:
            cursor.close()
            return None

        chapters, lesson_path = _load_course_tree(cursor)
        rows = _fetch_progress_rows(cursor, acc_id=acc_id)
        evaluated = _evaluate_rows(cursor, rows)
        pairs = list(zip(rows, evaluated))

        cursor.execute(
            """SELECT entity_id FROM learner_progress_unlocks_tbl
               WHERE acc_id = %s AND entity_type = 'category'""",
            (acc_id,)
        )
        unlocked = {r["entity_id"] for r in cursor.fetchall()}
        cursor.close()

        all_ids = set(lesson_path.keys())
        summary = _summarize_learner(learners[0], pairs, all_ids, lesson_path, len(all_ids),
                                     _scope_modules(lesson_path, all_ids))
        current_rid = summary["_current_resource_id"] if summary["current_state"] == "in_progress" else None

        by_resource = {}
        for row, ev in pairs:
            by_resource.setdefault(row["resource_id"], ev)  # rows are newest-first

        chapters_out = []
        previous_finished = True
        for index, chapter in enumerate(chapters):
            modules_out = []
            chapter_lessons = []

            for module in chapter["modules"]:
                lessons_out = []
                for lesson in module["lessons"]:
                    ev = by_resource.get(lesson["resource_id"])
                    if ev:
                        status = "completed" if ev["is_completed"] else "in_progress"
                    else:
                        status = "not_started"
                    lessons_out.append({
                        "resource_id": lesson["resource_id"],
                        "title": lesson["title"],
                        "progress_id": ev["progress_id"] if ev else None,
                        "score": ev["score"] if ev else None,
                        "completion": ev["completion"] if ev else 0,
                        "status": status,
                        "started_at": ev["started_at"] if ev else "—",
                        "completed_at": ev["completed_at"] if ev else "—",
                        "is_current": lesson["resource_id"] == current_rid,
                    })

                chapter_lessons.extend(lessons_out)
                modules_out.append({
                    "module_id": module["module_id"],
                    "name": module["name"],
                    "is_current": any(l["is_current"] for l in lessons_out),
                    **_group_stats(lessons_out),
                    "lessons": lessons_out,
                })

            stats = _group_stats(chapter_lessons)
            locked = not (
                index == 0
                or chapter["cat_id"] in unlocked
                or previous_finished
                or stats["lessons_touched"] > 0
            )
            chapters_out.append({
                "cat_id": chapter["cat_id"],
                "name": chapter["name"],
                "locked": locked,
                "is_current": any(m["is_current"] for m in modules_out),
                "modules_total": len(modules_out),
                "modules_completed": sum(
                    1 for m in modules_out
                    if m["lessons_total"] > 0 and m["lessons_completed"] == m["lessons_total"]
                ),
                **stats,
                "modules": modules_out,
            })
            previous_finished = stats["lessons_total"] > 0 and stats["lessons_completed"] == stats["lessons_total"]

        result = _strip_private(summary)
        result["chapters"] = chapters_out
        return result

    except Error as e:
        print(f"learner_progress_monitor: failed to load course detail for {acc_id}: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()