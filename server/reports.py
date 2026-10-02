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
