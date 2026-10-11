"""
reports.py - Admin > Reports: learner performance ranking (read-only)
---------------------------------------------------------------------
Ranks every learner by the SAME Avg Score / Completion the Learner
Progress -> By Learner view shows: the numbers come straight from
learner_progress_monitor.build_learner_summaries(). No score or
completion formula lives here, and nothing is ever written.

Ranking order
    avg_score DESC -> completion % DESC -> lessons_completed DESC,
    then name ASC (display order only - it never splits a tie).
    Learners equal on all three ranking values share a rank, and the
    next rank skips ahead (1, 1, 3).
    Learners with no score yet come after everyone ranked, with rank
    None ("—") and level "Not yet rated".

Performance level (by avg_score)
    Excellent           EXCELLENT_MARK (90) - 100
    Good                GOOD_MARK (= PASS_MARK, 80) - 89
    Needs Improvement   below GOOD_MARK
    Not yet rated       no score
"""

from mysql.connector import Error
from live_cache import live_cached  # 10-second memory for the auto-refreshing admin pages

from cobradb import get_db_connection
from learner_progress_monitor import (
    PASS_MARK,
    build_learner_summaries,
    get_progress_filter_options,
)

EXCELLENT_MARK = 90
GOOD_MARK = PASS_MARK  # 80 - the same pass mark Learner Progress uses

LEVEL_EXCELLENT = "Excellent"
LEVEL_GOOD = "Good"
LEVEL_NEEDS_IMPROVEMENT = "Needs Improvement"
LEVEL_NOT_RATED = "Not yet rated"

RANKING_FIELDS = ("rank", "acc_id", "name", "avg_score", "completion",
                  "lessons_completed", "lessons_total", "last_active", "level")


def performance_level(avg_score):
    if avg_score is None:
        return LEVEL_NOT_RATED
    if avg_score >= EXCELLENT_MARK:
        return LEVEL_EXCELLENT
    if avg_score >= GOOD_MARK:
        return LEVEL_GOOD
    return LEVEL_NEEDS_IMPROVEMENT


def _rank_key(s):
    """The three values that decide a rank (higher is better)."""
    return (s["avg_score"], s["completion"], s["lessons_completed"])


def rank_learners(summaries):
    """
    Summaries (build_learner_summaries rows) -> ranked list of
    RANKING_FIELDS dicts, ranked learners first, then the unrated ones.
    """
    rated = [s for s in summaries if s["avg_score"] is not None]
    unrated = [s for s in summaries if s["avg_score"] is None]

    rated.sort(key=lambda s: (-s["avg_score"], -s["completion"], -s["lessons_completed"],
                              (s["name"] or "").lower(), s["acc_id"]))
    unrated.sort(key=lambda s: (-s["completion"], -s["lessons_completed"],
                                (s["name"] or "").lower(), s["acc_id"]))

    ranked = []
    previous_key, previous_rank = None, 0
    for position, s in enumerate(rated, start=1):
        key = _rank_key(s)
        rank = previous_rank if key == previous_key else position  # 1, 1, 3
        previous_key, previous_rank = key, rank
        ranked.append(_row(s, rank))

    return ranked + [_row(s, None) for s in unrated]


def _row(s, rank):
    return {
        "rank": rank,
        "acc_id": s["acc_id"],
        "name": s["name"],
        "avg_score": s["avg_score"],
        "completion": s["completion"],
        "lessons_completed": s["lessons_completed"],
        "lessons_total": s["lessons_total"],
        "last_active": s["last_active"],
        "level": performance_level(s["avg_score"]),
    }


def summarize_ranking(rows):
    """Summary cards for the Reports page."""
    rated = [r for r in rows if r["avg_score"] is not None]
    top = rated[0] if rated else None
    return {
        "total_learners": len(rows),
        "ranked_learners": len(rated),
        "average_score": round(sum(r["avg_score"] for r in rated) / len(rated)) if rated else None,
        "top_performer": {"name": top["name"], "avg_score": top["avg_score"]} if top else None,
        "excellent": sum(1 for r in rated if r["level"] == LEVEL_EXCELLENT),
        "needs_improvement": sum(1 for r in rated if r["level"] == LEVEL_NEEDS_IMPROVEMENT),
    }


def empty_learner_ranking():
    """Used when the database is unreachable so the page still renders."""
    return {"learners": [], "summary": summarize_ranking([])}


@live_cached   # the admin pages refresh every 10 s - see live_cache.py
def get_learner_ranking(cat_id=None, module_id=None, search=None):
    """
    Returns {"learners": [...every matching learner, ranked...],
             "summary": {...}} or None if the database is unreachable.
    cat_id / module_id scope the scores the same way the By Learner
    Chapter / Module filters do; search matches learner ID or name.
    """
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        summaries = build_learner_summaries(cursor, search, cat_id, module_id)
        cursor.close()
        rows = rank_learners(summaries)
        return {"learners": rows, "summary": summarize_ranking(rows)}
    except Error as e:
        print(f"reports: failed to load learner ranking: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_report_filter_options():
    """Chapters with their modules, for the Chapter / Module dropdowns."""
    return get_progress_filter_options()


# ==================================================================
# feat/dashboard-reports: per chapter / per module report + certificates
# ==================================================================
def _module_row(name, lesson_ids, by_lesson, learner_ids):
    """Numbers for one module (or chapter) from its lesson ids."""
    import progress_insights as insights
    started, scores, evs = set(), [], []
    done = {}
    for rid in lesson_ids:
        for row, ev in by_lesson.get(rid, []):
            started.add(ev["acc_id"])
            evs.append(ev)
            if ev["is_completed"]:
                done.setdefault(ev["acc_id"], set()).add(rid)
                if ev["score"] is not None:
                    scores.append(ev["score"])
    finished = sum(1 for acc, ids in done.items() if set(lesson_ids) <= ids) if lesson_ids else 0
    passed = sum(1 for s in scores if s >= PASS_MARK)
    hardest = None
    for type_name, entry in insights.type_scores(evs).items():
        pct = insights.percent(entry["got"], entry["total"])
        if pct is not None and (hardest is None or pct < hardest["percent"]):
            hardest = {"type": type_name, "percent": pct}
    avg = insights.average(scores)
    return {
        "name": name,
        "lessons": len(lesson_ids),
        "learners": len(learner_ids),
        "started": len(started),
        "finished": finished,
        "finished_lessons": len(scores),
        "avg_score": avg,
        "band": insights.band(avg),
        "pass_rate": insights.percent(passed, len(scores)),
        "hardest": hardest,
    }


@live_cached
def get_course_report(cat_id=None, module_id=None):
    """
    One row per chapter, with its modules under it: learners who started /
    finished it (every lesson completed), average first-try score of the
    finished lessons (green / yellow / red), pass rate (finished lessons at
    the pass mark or more) and the hardest activity type. None on a DB error.
    """
    from learner_progress_monitor import _load_course_tree, _fetch_progress_rows, _evaluate_rows, _fetch_learners, _to_int
    cat_id, module_id = _to_int(cat_id), _to_int(module_id)
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        chapters, lesson_path = _load_course_tree(cursor)
        learner_ids = {l["acc_id"] for l in _fetch_learners(cursor)}
        rows = [r for r in _fetch_progress_rows(cursor) if r["resource_id"] in lesson_path and r["acc_id"] in learner_ids]
        by_lesson = {}
        for row, ev in zip(rows, _evaluate_rows(cursor, rows)):
            by_lesson.setdefault(row["resource_id"], []).append((row, ev))
        cursor.close()
        out = []
        for index, chapter in enumerate(chapters, start=1):
            if cat_id is not None and chapter["cat_id"] != cat_id:
                continue
            modules = []
            for module in chapter["modules"]:
                if module_id is not None and module["module_id"] != module_id:
                    continue
                ids = [l["resource_id"] for l in module["lessons"]]
                modules.append({"module_id": module["module_id"], **_module_row(module["name"], ids, by_lesson, learner_ids)})
            chapter_ids = [l["resource_id"] for m in chapter["modules"] for l in m["lessons"]]
            out.append({"cat_id": chapter["cat_id"], "number": index,
                        **_module_row(chapter["name"], chapter_ids, by_lesson, learner_ids), "modules": modules})
        return {"chapters": out, "pass_mark": PASS_MARK}
    except Error as e:
        print(f"reports: failed to load the course report: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def get_certificates(search=None):
    """Certificates issued, newest first: [{acc_id, name, reference_no, course_name, issued_at}]. None on a DB error."""
    from admin_time import fmt_datetime
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SHOW TABLES LIKE 'certificates_tbl'")
        if cursor.fetchone() is None:          # created the first time a learner finishes
            cursor.close()
            return []
        term = (search or "").strip().lower()
        where, params = "", ()
        if term:
            where = """WHERE LOWER(c.acc_id) LIKE %s OR LOWER(c.reference_no) LIKE %s
                       OR LOWER(CONCAT(COALESCE(p.firstname, ''), ' ', COALESCE(p.lastname, ''))) LIKE %s"""
            params = (f"%{term}%",) * 3
        cursor.execute(
            f"""SELECT c.acc_id, c.reference_no, c.course_name, c.issued_at, p.firstname, p.lastname
                FROM certificates_tbl c LEFT JOIN profile_tbl p ON p.acc_id = c.acc_id
                {where} ORDER BY c.issued_at DESC""",
            params
        )
        rows = [{
            "acc_id": r["acc_id"],
            "name": " ".join(x for x in (r["firstname"], r["lastname"]) if x).strip() or r["acc_id"],
            "reference_no": r["reference_no"],
            "course_name": r["course_name"],
            "issued_at": fmt_datetime(r["issued_at"]),
        } for r in cursor.fetchall()]
        cursor.close()
        return rows
    except Error as e:
        print(f"reports: failed to load certificates: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()
