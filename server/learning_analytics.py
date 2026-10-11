"""
learning_analytics.py - Admin > Analytics (Learning Analytics dashboard)
------------------------------------------------------------------------
Read-only numbers behind the Analytics page (ADMIN only). Learner
accounts only, archived (deleted) accounts excluded. Never writes.

Every score is the SAME lesson score the learner sees on their lesson
summary and the admin sees on Learner Progress (learner_progress_monitor
_fetch_progress_rows + _evaluate_rows -> module_performance.lesson_grade_percent):
first try only, and - feat/analytics-insights, like Learner Progress -
averages count FINISHED lessons only (a lesson in progress has items not
played yet). Colours: progress_insights.band() (green / yellow / red).
Only lessons live in the course count (published, module / chapter not
archived).

FILTERS
  status  'all' | 'active' | 'inactive'        account_tbl.status
  range   '7d' | '30d' (default) | '90d' | 'all'
          the PERIOD. Scores = lessons finished in the period; "active"
          = did something in the period. The PREVIOUS period (the same
          number of days just before) is used for the "vs" comparisons;
          'all' has no previous period, so no comparison.

WHAT COUNTS AS ACTIVITY (active learners, engagement, study time)
  a successful sign-in, a lesson started / read / video watched /
  finished, an activity question answered (or a play started), an old
  style answer, a coding exercise run.
  Study time is ESTIMATED from that: actions less than SESSION_GAP_MINUTES
  apart are one study session; a session lasts from its first to its last
  action (a single action = SINGLE_ACTION_MINUTES). No table records real
  sign-out times.

SECTIONS
  cards               total / active / inactive learners, avg score,
                      finished the course, study time per active learner
  lesson_performance  one bar per module (course order) - "How each module scores"
  score_distribution  learners per score range - "How learners score"
  stages              per activity type: first-try avg, timeouts, skips,
                      retakes - "Score by activity type"
  trend               last 8 weeks, always - "Are scores going up?"
  topics              3 hardest / 3 easiest modules - "Which topics are hardest"
  funnel              signed up -> started -> finished chapter 1..N -> finished
                      the course (where everyone is now, not limited by the period)
  most_missed         top 10 questions missed on the first try, course-wide
  engagement          active learners per day, busiest hours, avg session
  insights            one plain sentence per chart

DETAILS (get_analytics_details) - what is behind a card / bar / point,
for the list modal: learners, active, inactive, avg_score, finished,
module, band, funnel, day, hour, question.
"""

from datetime import datetime, timedelta
from mysql.connector import Error

from cobradb import get_db_connection
from live_cache import live_cached  # 10-second memory for the auto-refreshing admin pages
from account_status import refresh_inactive_accounts
from admin_time import fmt_datetime
from learner_progress_monitor import _fetch_progress_rows, _evaluate_rows, _load_course_tree, _load_lesson_structure
import progress_insights as insights
from activity_retakes import GAME_TABLES

STATUS_FILTERS = {"active": "Active", "inactive": "Inactive"}
RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90}
DEFAULT_RANGE = "30d"
TREND_WEEKS = 8
TOPIC_COUNT = 3
TOP_MISSED = 10
SESSION_GAP_MINUTES = 30
SINGLE_ACTION_MINUTES = 1
ENGAGEMENT_DAYS_ALL = 90      # the per-day chart when the range is "All time"
DETAIL_ROW_LIMIT = 2000
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
WEEKDAY_NAMES = ("Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays")

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
    insights.EXERCISE_TYPE: "coding",
}


def _avg(values):
    return insights.average(values)


def _ph(items):
    return ",".join(["%s"] * len(items))


def _clean_filters(status, date_range):
    status = (status or "").strip().lower()
    date_range = (date_range or "").strip().lower() or DEFAULT_RANGE
    return (
        status if status in STATUS_FILTERS else "all",
        date_range if date_range in RANGE_DAYS or date_range == "all" else DEFAULT_RANGE,
    )


def _fmt_day(d):
    return f"{d.strftime('%b')} {d.day}"


def _hour_label(h):
    h12 = h % 12 or 12
    return f"{h12} {'AM' if h < 12 else 'PM'}"


def _band_of(score):
    for label, low, high in SCORE_BANDS:
        if score is not None and low <= score <= high:
            return label
    return None


def _compare(current, previous, kind="count"):
    """
    {"value", "previous", "change", "direction"} - change is % for counts,
    points for scores. None previous (no earlier period) = no comparison.
    """
    out = {"value": current, "previous": previous, "change": None, "direction": None}
    if previous is None or current is None:
        return out
    if kind == "points":
        change = current - previous
    elif previous == 0:
        change = None if current == 0 else 100
    else:
        change = round((current - previous) * 100 / previous)
    out["change"] = change
    if change is None or change == 0:
        out["direction"] = "same"
    else:
        out["direction"] = "up" if change > 0 else "down"
    return out


def empty_analytics(status="all", date_range=DEFAULT_RANGE):
    """Used when the DB is unreachable so the page still renders."""
    return {
        "filters": {"status": status, "range": date_range},
        "period": None,
        "cards": {},
        "learners_total": 0,
        "learners_scored": 0,
        "records": 0,
        "lesson_performance": [],
        "score_distribution": [{"label": b[0], "count": 0} for b in SCORE_BANDS],
        "stages": [{"key": k, "label": label, "avg": None, "completed": 0, "timeouts": None, "skips": 0, "retakes": 0}
                   for k, label in STAGES],
        "trend": [],
        "topics": {"strongest": [], "weakest": []},
        "funnel": [],
        "most_missed": [],
        "engagement": {"days": [], "heatmap": [], "avg_session_minutes": None, "sessions": 0},
        "insights": {},
    }


# ------------------------------------------------------------------
# Loading everything once (the page + the detail lists share it)
# ------------------------------------------------------------------
def _learners(cursor):
    """{acc_id: {"status", "name", "created_at", "last_login"}} for every non-archived learner."""
    cursor.execute(
        """SELECT a.acc_id, a.status, a.created_at, a.last_login, p.firstname, p.lastname
           FROM account_tbl a
           JOIN usertype_tbl ut ON a.u_type = ut.ut_id
           LEFT JOIN profile_tbl p ON p.acc_id = a.acc_id
           WHERE ut.u_type = 'Learner'
             AND (a.is_deleted = 0 OR a.is_deleted IS NULL)"""
    )
    out = {}
    for r in cursor.fetchall():
        name = " ".join(x for x in (r["firstname"], r["lastname"]) if x).strip() or r["acc_id"]
        out[r["acc_id"]] = {"status": r["status"] or "Active", "name": name,
                            "created_at": r["created_at"], "last_login": r["last_login"]}
    return out


def _activity_events(cursor, learner_ids, since=None):
    """
    {acc_id: [(datetime, kind)]} sorted - kind 'login' or 'learn'. Every
    action listed in "WHAT COUNTS AS ACTIVITY", from `since` on.
    """
    ids = sorted(learner_ids)
    events = {acc: [] for acc in ids}
    if not ids:
        return events
    ph = _ph(ids)

    def add(acc, dt, kind="learn"):
        if acc in events and dt and (since is None or dt >= since):
            events[acc].append((dt, kind))

    def run(sql, params=()):
        try:
            cursor.execute(sql, tuple(ids) + params)
            return cursor.fetchall()
        except Error as e:
            print(f"learning_analytics: activity query skipped: {e}")
            return []

    cond = " AND {col} >= %s" if since else ""
    p = (since,) if since else ()
    for r in run(f"""SELECT acc_id, attempted_at FROM login_logs_tbl
                     WHERE attempt_status = 'Success' AND acc_id IN ({ph}){cond.format(col='attempted_at')}""", p):
        add(r["acc_id"], r["attempted_at"], "login")
    for r in run(f"""SELECT acc_id, status, started_at, content_read_at, video_watched_at, completed_at
                     FROM learner_resource_progress_tbl WHERE acc_id IN ({ph})"""):
        for key in ("started_at", "content_read_at", "video_watched_at"):
            add(r["acc_id"], r[key])
        if r["status"] == "completed":
            add(r["acc_id"], r["completed_at"])
    if insights._table_exists(cursor, insights.PLAYS_TABLE):
        for r in run(f"""SELECT acc_id, started_at FROM {insights.PLAYS_TABLE}
                         WHERE acc_id IN ({ph}){cond.format(col='started_at')}""", p):
            add(r["acc_id"], r["started_at"])
        for r in run(f"""SELECT pl.acc_id, pi.answered_at FROM {insights.PLAY_ITEMS_TABLE} pi
                         JOIN {insights.PLAYS_TABLE} pl ON pl.play_id = pi.play_id
                         WHERE pl.acc_id IN ({ph}) AND pi.answered_at IS NOT NULL{cond.format(col='pi.answered_at')}""", p):
            add(r["acc_id"], r["answered_at"])
    for answers_table, _, _, _ in GAME_TABLES.values():
        for r in run(f"""SELECT acc_id, answered_at FROM {answers_table}
                         WHERE acc_id IN ({ph}) AND play_id IS NULL{cond.format(col='answered_at')}""", p):
            add(r["acc_id"], r["answered_at"])
    for r in run(f"""SELECT acc_id, submitted_at FROM exercise_submissions_tbl
                     WHERE acc_id IN ({ph}){cond.format(col='submitted_at')}""", p):
        add(r["acc_id"], r["submitted_at"])

    for acc in events:
        events[acc] = sorted(set(events[acc]))
    return events


def _sessions(times):
    """[(start, end, minutes)] from one learner's sorted action times."""
    out = []
    start = prev = None
    for t in times:
        if start is None:
            start = prev = t
            continue
        if (t - prev).total_seconds() > SESSION_GAP_MINUTES * 60:
            out.append((start, prev))
            start = t
        prev = t
    if start is not None:
        out.append((start, prev))
    return [(a, b, max(SINGLE_ACTION_MINUTES, round((b - a).total_seconds() / 60))) for a, b in out]


def _context(status, date_range):
    """Everything both the page and the detail lists need, or None (DB down)."""
    status, date_range = _clean_filters(status, date_range)
    connection = get_db_connection()
    if connection is None:
        return None
    refresh_inactive_accounts(connection)   # same sweep as Account & Security
    try:
        cursor = connection.cursor(dictionary=True)
        now = datetime.now()
        if date_range == "all":
            start = prev_start = None
        else:
            days = RANGE_DAYS[date_range]
            start = now - timedelta(days=days)
            prev_start = start - timedelta(days=days)

        learners = _learners(cursor)
        if status != "all":
            learner_ids = {acc for acc, info in learners.items() if info["status"] == STATUS_FILTERS[status]}
        else:
            learner_ids = set(learners)

        chapters, lesson_path = _load_course_tree(cursor)
        structure = _load_lesson_structure(cursor, sorted(lesson_path))
        rows = [r for r in _fetch_progress_rows(cursor) if r["acc_id"] in learner_ids and r["resource_id"] in lesson_path]
        pairs = list(zip(rows, _evaluate_rows(cursor, rows)))

        # first-try answers in the period: activity types + most missed
        activities = []
        for rid in lesson_path:
            for act in structure[rid]["activities"]:
                if act["type"] in GAME_TABLES:
                    activities.append({"la_id": act["la_id"], "title": act["title"], "type": act["type"],
                                       "resource_id": rid})
        events_since = prev_start if prev_start else None
        events = _activity_events(cursor, learner_ids, events_since)
        ctx = {
            "status": status, "range": date_range, "now": now, "start": start, "prev_start": prev_start,
            "learners": learners, "learner_ids": learner_ids, "chapters": chapters,
            "lesson_path": lesson_path, "structure": structure, "pairs": pairs,
            "activities": activities, "events": events, "cursor": cursor,
        }
        ctx["period_pairs"] = [(r, ev) for r, ev in pairs if _in_period(_touched(r), ctx)]
        ctx["finished"] = [(r, ev) for r, ev in pairs
                           if ev["is_completed"] and ev["score"] is not None and _in_period(r.get("completed_at"), ctx)]
        return ctx, connection
    except Error:
        if connection.is_connected():
            connection.close()
        raise


def _touched(row):
    times = [row.get(k) for k in ("started_at", "content_read_at", "video_watched_at", "completed_at")]
    times = [t for t in times if t]
    return max(times) if times else None


def _in_period(dt, ctx, previous=False):
    if ctx["start"] is None:
        return not previous
    if not dt:
        return False
    if previous:
        return ctx["prev_start"] <= dt < ctx["start"]
    return dt >= ctx["start"]


# ------------------------------------------------------------------
# The page
# ------------------------------------------------------------------
@live_cached   # the admin pages refresh every 10 s - see live_cache.py
def get_learning_analytics(status=None, date_range=None):
    """Everything the Analytics page shows, or None if the database is unreachable."""
    try:
        built = _context(status, date_range)
    except Error as e:
        print(f"learning_analytics: failed to load analytics: {e}")
        return None
    if built is None:
        return None
    ctx, connection = built
    try:
        cursor = ctx["cursor"]
        gradeable = _gradeable_modules(ctx)
        modules = _module_performance(ctx, gradeable)
        per_learner = _learner_averages(ctx["finished"])
        distribution = _score_distribution(per_learner)
        stages, most_missed = _stages_and_missed(ctx)
        trend = _build_trend(cursor, ctx)
        funnel = _funnel(ctx)
        engagement = _engagement(ctx)
        cards = _cards(ctx, per_learner)
        topics = _topics(modules)
        cursor.close()

        data = {
            "filters": {"status": ctx["status"], "range": ctx["range"]},
            "period": None if ctx["start"] is None else {
                "days": RANGE_DAYS[ctx["range"]],
                "from": _fmt_day(ctx["start"]), "to": _fmt_day(ctx["now"]),
                "previous": f"{_fmt_day(ctx['prev_start'])} - {_fmt_day(ctx['start'])}",
            },
            "cards": cards,
            "learners_total": len(ctx["learner_ids"]),
            "learners_scored": len(per_learner),
            "records": len(ctx["finished"]),
            "lesson_performance": modules,
            "score_distribution": distribution,
            "stages": stages,
            "trend": trend,
            "topics": topics,
            "funnel": funnel,
            "most_missed": most_missed,
            "engagement": engagement,
        }
        data["insights"] = _insights(data)
        return data
    except Error as e:
        print(f"learning_analytics: failed to load analytics: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def _gradeable_modules(ctx):
    """module_ids with at least one lesson that has something to score."""
    modules = set()
    for rid, lesson in ctx["structure"].items():
        if lesson["exercise"] or any(a["item_total"] > 0 for a in lesson["activities"]):
            modules.add(ctx["lesson_path"][rid]["module_id"])
    return modules


def _module_performance(ctx, gradeable):
    scores, learners = {}, {}
    for row, ev in ctx["finished"]:
        module_id = ctx["lesson_path"][row["resource_id"]]["module_id"]
        scores.setdefault(module_id, []).append(ev["score"])
        learners.setdefault(module_id, set()).add(ev["acc_id"])
    out = []
    for chapter in ctx["chapters"]:
        for module in chapter["modules"]:
            mid = module["module_id"]
            if mid not in gradeable:
                continue   # nothing in this module can be scored
            avg = _avg(scores.get(mid, []))
            out.append({
                "module_id": mid,
                "name": module["name"],
                "chapter": chapter["name"],
                "avg": avg,
                "band": insights.band(avg),
                "learners": len(learners.get(mid, ())),
            })
    return out


def _learner_averages(finished):
    per = {}
    for _, ev in finished:
        per.setdefault(ev["acc_id"], []).append(ev["score"])
    return {acc: _avg(scores) for acc, scores in per.items()}


def _score_distribution(per_learner):
    counts = {label: 0 for label, _, _ in SCORE_BANDS}
    for avg in per_learner.values():
        label = _band_of(avg)
        if label:
            counts[label] += 1
    return [{"label": label, "count": counts[label], "band": insights.band(low)} for label, low, _ in SCORE_BANDS]


def _stages_and_missed(ctx):
    evs = [ev for _, ev in ctx["period_pairs"]]
    per_type, most_missed = insights.lesson_activity_stats(
        ctx["cursor"], ctx["activities"], evs, top=TOP_MISSED, since=ctx["start"])
    by_label = {}
    for t in per_type:
        key = TYPE_KEYS.get(t["type"])
        if key:
            by_label[key] = t
    lesson_of = {a["la_id"]: a["resource_id"] for a in ctx["activities"]}
    stages = []
    for key, label in STAGES:
        t = by_label.get(key) or {}
        stages.append({
            "key": key, "label": label,
            "avg": t.get("avg"),
            "completed": t.get("learners", 0),
            "timeouts": t.get("timeouts", 0 if key != "coding" else None),
            "skips": t.get("skips", 0),
            "retakes": t.get("retakes", 0),
        })
    lesson_titles = _lesson_titles(ctx)
    for q in most_missed:
        q["lesson"] = lesson_titles.get(lesson_of.get(q["la_id"]), "—")
    return stages, most_missed


def _lesson_titles(ctx):
    titles = {}
    for chapter in ctx["chapters"]:
        for module in chapter["modules"]:
            for lesson in module["lessons"]:
                titles[lesson["resource_id"]] = lesson["title"]
    return titles


def _week_starts(today):
    """Monday of each of the last TREND_WEEKS weeks, oldest first."""
    this_monday = today - timedelta(days=today.weekday())
    return [this_monday - timedelta(weeks=i) for i in range(TREND_WEEKS - 1, -1, -1)]


def _build_trend(cursor, ctx):
    """Last 8 weeks, whatever the period: active learners (signed in) + avg of lessons finished that week."""
    starts = _week_starts(ctx["now"].date())
    first_day = starts[0]
    weekly_logins = [set() for _ in starts]
    cursor.execute(
        """SELECT acc_id, attempted_at FROM login_logs_tbl
           WHERE attempt_status = 'Success' AND attempted_at >= %s""",
        (first_day,)
    )
    for r in cursor.fetchall():
        if r["acc_id"] not in ctx["learner_ids"] or not r["attempted_at"]:
            continue
        index = (r["attempted_at"].date() - first_day).days // 7
        if 0 <= index < len(starts):
            weekly_logins[index].add(r["acc_id"])

    weekly_scores = [[] for _ in starts]
    for row, ev in ctx["pairs"]:
        done = row.get("completed_at")
        if not ev["is_completed"] or not done or ev["score"] is None:
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
        return {"module_id": m["module_id"], "name": m["name"], "chapter": m["chapter"], "avg": m["avg"],
                "band": m["band"], "learners": m["learners"]}

    return {
        "strongest": [pick(m) for m in ranked[:strong_n]],
        "weakest": [pick(m) for m in reversed(ranked[len(ranked) - weak_n:])] if weak_n else [],
    }


# ---------------- funnel ----------------
def _completed_lessons(ctx):
    """{acc_id: {resource_id: completed_at}} - every finished live lesson (all time)."""
    done = {}
    for row, ev in ctx["pairs"]:
        if ev["is_completed"]:
            done.setdefault(row["acc_id"], {})[row["resource_id"]] = row.get("completed_at")
    return done


def _funnel_steps(ctx):
    """[(label, set of acc_ids that reached it)] - where everyone is now."""
    done = _completed_lessons(ctx)
    started = {row["acc_id"] for row, _ in ctx["pairs"]}
    steps = [("Signed up", set(ctx["learner_ids"])), ("Started a lesson", started)]
    all_lessons = set()
    for index, chapter in enumerate(ctx["chapters"], start=1):
        lessons = {l["resource_id"] for m in chapter["modules"] for l in m["lessons"]}
        if not lessons:
            continue
        all_lessons |= lessons
        reached = {acc for acc, d in done.items() if lessons <= set(d)}
        steps.append((f"Finished Chapter {index}: {chapter['name']}", reached))
    if all_lessons:
        steps.append(("Finished the course", {acc for acc, d in done.items() if all_lessons <= set(d)}))
    return steps


def _funnel(ctx):
    steps = _funnel_steps(ctx)
    top = len(steps[0][1]) or 1
    out = []
    for i, (label, people) in enumerate(steps):
        prev = len(steps[i - 1][1]) if i else None
        out.append({"index": i, "label": label, "count": len(people),
                    "percent": round(len(people) * 100 / top),
                    "dropped": (prev - len(people)) if prev is not None else None})
    return out


# ---------------- engagement + cards ----------------
def _period_events(ctx, previous=False):
    return {acc: [(t, k) for t, k in ev if _in_period(t, ctx, previous)] for acc, ev in ctx["events"].items()}


def _engagement(ctx):
    events = _period_events(ctx)
    now = ctx["now"]
    if ctx["start"] is not None:
        first = ctx["start"].date()
    else:
        first = (now - timedelta(days=ENGAGEMENT_DAYS_ALL - 1)).date()
    days = {}
    heat = {}
    session_minutes = []
    for acc, evs in events.items():
        for t, kind in evs:
            if t.date() >= first:
                days.setdefault(t.date(), set()).add(acc)
            if kind == "learn":
                cell = heat.setdefault((t.weekday(), t.hour), {"actions": 0, "learners": set()})
                cell["actions"] += 1
                cell["learners"].add(acc)
        session_minutes += [m for _, _, m in _sessions([t for t, _ in evs])]
    day_list = []
    d = first
    while d <= now.date():
        day_list.append({"date": d.isoformat(), "label": _fmt_day(d), "active": len(days.get(d, ()))})
        d += timedelta(days=1)
    heatmap = [{"day": wd, "hour": h, "actions": c["actions"], "learners": len(c["learners"])}
               for (wd, h), c in sorted(heat.items())]
    return {
        "days": day_list,
        "heatmap": heatmap,
        "avg_session_minutes": _avg(session_minutes),
        "sessions": len(session_minutes),
        "gap_minutes": SESSION_GAP_MINUTES,
    }


def _study_minutes(events):
    """(active learners, total minutes) from {acc: [(t, kind)]}."""
    active = [acc for acc, ev in events.items() if ev]
    minutes = sum(m for acc in active for _, _, m in _sessions([t for t, _ in events[acc]]))
    return len(active), minutes


def _cards(ctx, per_learner):
    has_prev = ctx["start"] is not None
    learners = ctx["learners"]
    ids = ctx["learner_ids"]

    total_before = sum(1 for a in ids if learners[a]["created_at"] and learners[a]["created_at"] < ctx["start"]) \
        if has_prev else None

    cur_events, prev_events = _period_events(ctx), (_period_events(ctx, True) if has_prev else None)
    active_now, minutes_now = _study_minutes(cur_events)
    active_prev, minutes_prev = _study_minutes(prev_events) if has_prev else (None, None)
    per_now = round(minutes_now / active_now) if active_now else None
    per_prev = (round(minutes_prev / active_prev) if active_prev else None) if has_prev else None

    prev_finished = [(r, ev) for r, ev in ctx["pairs"]
                     if ev["is_completed"] and ev["score"] is not None and has_prev
                     and _in_period(r.get("completed_at"), ctx, True)]
    avg_now = _avg([ev["score"] for _, ev in ctx["finished"]])
    avg_prev = _avg([ev["score"] for _, ev in prev_finished]) if has_prev else None

    finishers = _course_finishers(ctx)
    finished_in = sum(1 for _, when in finishers.items() if _in_period(when, ctx))
    finished_prev = sum(1 for _, when in finishers.items() if _in_period(when, ctx, True)) if has_prev else None

    inactive = sum(1 for a in ids if learners[a]["status"] == "Inactive")
    return {
        "total": {**_compare(len(ids), total_before), "label": "Total learners"},
        "active": {**_compare(active_now, active_prev), "label": "Active learners"},
        "inactive": {"value": inactive, "previous": None, "change": None, "direction": None,
                     "label": "Inactive learners"},
        "avg_score": {**_compare(avg_now, avg_prev, "points"), "label": "Average score",
                      "band": insights.band(avg_now), "scored": len(per_learner)},
        "finished": {"value": len(finishers), "previous": None, "change": None, "direction": None,
                     "in_period": finished_in, "in_previous": finished_prev,
                     "period_compare": _compare(finished_in, finished_prev) if has_prev else None,
                     "label": "Finished the course"},
        "study_time": {**_compare(per_now, per_prev), "label": "Study time per active learner",
                       "unit": "min"},
    }


def _course_finishers(ctx):
    """{acc_id: when they finished their last lesson} for learners who finished every live lesson."""
    all_lessons = set(ctx["lesson_path"])
    if not all_lessons:
        return {}
    out = {}
    for acc, d in _completed_lessons(ctx).items():
        if all_lessons <= set(d):
            out[acc] = max((t for t in d.values() if t), default=None)
    return out


# ---------------- one-line insights ----------------
def _insights(data):
    pm = insights.PASS_MARK
    out = {}
    scored = [m for m in data["lesson_performance"] if m["avg"] is not None]
    if scored:
        low = min(scored, key=lambda m: m["avg"])
        if low["avg"] < pm:
            out["lesson_performance"] = f"Weakest: {low['name']} ({low['avg']}%) - {pm - low['avg']} points below the pass mark."
        else:
            out["lesson_performance"] = f"Every module is at or above the {pm}% pass mark. Lowest: {low['name']} ({low['avg']}%)."
    else:
        out["lesson_performance"] = "No lesson was finished in this period yet."

    total = sum(b["count"] for b in data["score_distribution"])
    below = sum(b["count"] for b in data["score_distribution"] if b["band"] != "pass")
    out["score_distribution"] = (f"{below} of {total} learners ({round(below * 100 / total)}%) are below the {pm}% pass mark."
                                 if total else "No learner finished a lesson in this period yet.")

    stages = [s for s in data["stages"] if s["avg"] is not None]
    if stages:
        hard = min(stages, key=lambda s: s["avg"])
        text = f"Hardest: {hard['label']} ({hard['avg']}% on the first try)."
        timeouts = [s for s in data["stages"] if s.get("timeouts")]
        if timeouts:
            most = max(timeouts, key=lambda s: s["timeouts"])
            text += f" Most timeouts: {most['label']} ({most['timeouts']})."
        out["stages"] = text
    else:
        out["stages"] = "No activity was finished in this period yet."

    recent = _avg([w["avg_score"] for w in data["trend"][-4:] if w["avg_score"] is not None])
    before = _avg([w["avg_score"] for w in data["trend"][:4] if w["avg_score"] is not None])
    if recent is None or before is None:
        out["trend"] = "Not enough finished lessons in the last 8 weeks to compare."
    elif abs(recent - before) < insights.TREND_MIN_GAP:
        out["trend"] = f"About the same: {recent}% in the last 4 weeks vs {before}% the 4 weeks before."
    else:
        out["trend"] = (f"{'Up' if recent > before else 'Down'} {abs(recent - before)} points: "
                        f"{recent}% in the last 4 weeks vs {before}% the 4 weeks before.")

    weak = data["topics"]["weakest"]
    strong = data["topics"]["strongest"]
    if weak:
        out["topics"] = f"Hardest topic: {weak[0]['name']} ({weak[0]['avg']}%). Easiest: {strong[0]['name']} ({strong[0]['avg']}%)."
    elif strong:
        out["topics"] = f"Only one module has scores so far: {strong[0]['name']} ({strong[0]['avg']}%)."
    else:
        out["topics"] = "No module has scores in this period yet."

    steps = data["funnel"]
    drops = [s for s in steps if s["dropped"]]
    if drops:
        worst = max(drops, key=lambda s: s["dropped"])
        before_label = steps[worst["index"] - 1]["label"]
        out["funnel"] = f"Biggest drop: {worst['dropped']} learners stop between \"{before_label}\" and \"{worst['label']}\"."
    else:
        out["funnel"] = "No drop-off yet."

    flagged = [q for q in data["most_missed"] if q["check_key"]]
    if flagged:
        out["most_missed"] = f"{len(flagged)} question{'s' if len(flagged) != 1 else ''} missed by almost everyone - check the answer key."
    elif data["most_missed"]:
        q = data["most_missed"][0]
        out["most_missed"] = f"Most missed: \"{q['question'][:60]}\" ({q['miss_percent']}% missed it on the first try)."
    else:
        out["most_missed"] = "No question was missed on the first try in this period."

    heat = data["engagement"]["heatmap"]
    if heat:
        busiest = max(heat, key=lambda c: c["actions"])
        out["engagement"] = (f"Busiest: {WEEKDAY_NAMES[busiest['day']]} {_hour_label(busiest['hour'])}–"
                             f"{_hour_label((busiest['hour'] + 1) % 24)}.")
        if data["engagement"]["avg_session_minutes"] is not None:
            out["engagement"] += f" A study session lasts about {data['engagement']['avg_session_minutes']} min."
    else:
        out["engagement"] = "No learning activity in this period yet."
    return out


# ------------------------------------------------------------------
# What is behind a card / bar / point (the list modal)
# ------------------------------------------------------------------
_LEARNER = {"key": "learner", "label": "Learner", "type": "learner"}
DETAIL_KINDS = ("learners", "active", "inactive", "avg_score", "finished",
                "module", "band", "funnel", "day", "hour", "question")


def get_analytics_details(kind, status=None, date_range=None, key=None):
    """{"title", "subtitle", "sections", "bands"?} or None (unknown / bad key / DB down)."""
    if kind not in DETAIL_KINDS:
        return None
    try:
        built = _context(status, date_range)
    except Error as e:
        print(f"learning_analytics: details failed: {e}")
        return None
    if built is None:
        return None
    ctx, connection = built
    try:
        card = _details(ctx, kind, (key or "").strip())
        ctx["cursor"].close()
        if card is None:
            return None
        for section in card["sections"]:
            section["total"] = len(section["rows"])
            section["rows"] = section["rows"][:DETAIL_ROW_LIMIT]
        return card
    except Error as e:
        print(f"learning_analytics: details {kind} failed: {e}")
        return None
    finally:
        if connection.is_connected():
            connection.close()


def _period_text(ctx):
    return "all time" if ctx["start"] is None else f"the last {RANGE_DAYS[ctx['range']]} days"


def _details(ctx, kind, key):
    learners = ctx["learners"]
    per_learner = _learner_averages(ctx["finished"])
    finished_count = {}
    for _, ev in ctx["finished"]:
        finished_count[ev["acc_id"]] = finished_count.get(ev["acc_id"], 0) + 1
    all_events = ctx["events"]
    period_events = _period_events(ctx)

    def last_active(acc):
        times = [t for t, _ in all_events.get(acc, [])]
        return max(times) if times else None

    def learner_row(acc, **extra):
        avg = per_learner.get(acc)
        row = {
            "learner": {"acc_id": acc, "name": learners[acc]["name"]},
            "avg_score": avg,
            "lessons": finished_count.get(acc, 0),
            "last_active": insights.ago_text(last_active(acc) or learners[acc]["last_login"], ctx["now"]),
            "_open": {"type": "learner", "id": acc},
        }
        row.update(extra)
        return row

    base_cols = [_LEARNER, {"key": "avg_score", "label": "Avg score", "type": "score"},
                 {"key": "lessons", "label": "Lessons finished", "type": "text"},
                 {"key": "last_active", "label": "Last active", "type": "text"}]
    period = _period_text(ctx)
    ids = sorted(ctx["learner_ids"], key=lambda a: learners[a]["name"].lower())

    if kind == "learners":
        return {"title": "All learners", "subtitle": f"Scores = lessons finished in {period}.",
                "sections": [{"columns": base_cols, "rows": [learner_row(a) for a in ids]}]}

    if kind == "active":
        rows = []
        for acc in ids:
            evs = period_events.get(acc) or []
            if not evs:
                continue
            minutes = sum(m for _, _, m in _sessions([t for t, _ in evs]))
            rows.append(learner_row(acc, actions=sum(1 for _, k in evs if k == "learn"),
                                    study=f"{minutes} min"))
        return {"title": "Active learners", "subtitle": f"Signed in or did any learning in {period}.",
                "sections": [{"columns": [_LEARNER, {"key": "actions", "label": "Learning actions", "type": "text"},
                                          {"key": "study", "label": "Study time (est.)", "type": "text"},
                                          {"key": "avg_score", "label": "Avg score", "type": "score"},
                                          {"key": "last_active", "label": "Last active", "type": "text"}],
                              "rows": rows}]}

    if kind == "inactive":
        rows = []
        for acc in ids:
            info = learners[acc]
            if info["status"] != "Inactive":
                continue
            since = info["last_login"] or info["created_at"]
            rows.append(learner_row(acc, since=fmt_datetime(since) if since else "—",
                                    since_ago=insights.ago_text(since, ctx["now"]) if since else "never signed in",
                                    _sort=since or datetime.min))
        rows.sort(key=lambda r: r["_sort"])
        for r in rows:
            r.pop("_sort")
        return {"title": "Inactive learners", "subtitle": "No sign-in for 30+ days (the account status). Longest first.",
                "sections": [{"columns": [_LEARNER, {"key": "since", "label": "Inactive since (last sign-in)", "type": "text"},
                                          {"key": "since_ago", "label": "", "type": "text"},
                                          {"key": "avg_score", "label": "Avg score", "type": "score"}],
                              "rows": rows}]}

    if kind == "avg_score":
        scored = sorted([a for a in ids if per_learner.get(a) is not None], key=lambda a: per_learner[a])
        counts = {"pass": 0, "close": 0, "fail": 0}
        for a in scored:
            counts[insights.band(per_learner[a])] += 1
        return {"title": "Average score", "subtitle": f"First try, lessons finished in {period}.",
                "bands": counts,
                "sections": [
                    {"title": "Lowest 5", "columns": base_cols, "rows": [learner_row(a) for a in scored[:5]]},
                    {"title": "Highest 5", "columns": base_cols, "rows": [learner_row(a) for a in reversed(scored[-5:])]},
                    {"title": "Everyone with a score (lowest first)", "columns": base_cols,
                     "rows": [learner_row(a) for a in scored]},
                ]}

    if kind == "finished":
        finishers = _course_finishers(ctx)
        rows = [learner_row(a, finished_at=fmt_datetime(finishers[a]), _sort=finishers[a] or datetime.min)
                for a in ids if a in finishers]
        rows.sort(key=lambda r: r["_sort"], reverse=True)
        for r in rows:
            r.pop("_sort")
        return {"title": "Finished the course", "subtitle": "Every published lesson completed. Newest first.",
                "sections": [{"columns": [_LEARNER, {"key": "finished_at", "label": "Finished", "type": "text"},
                                          {"key": "avg_score", "label": "Avg score", "type": "score"}],
                              "rows": rows}]}

    if kind == "band":
        bands = {label: (low, high) for label, low, high in SCORE_BANDS}
        if key not in bands:
            return None
        low, high = bands[key]
        rows = [learner_row(a) for a in sorted(per_learner, key=lambda a: per_learner[a])
                if a in ctx["learner_ids"] and low <= per_learner[a] <= high]
        return {"title": f"Learners scoring {key}", "subtitle": f"Their average of the lessons finished in {period}.",
                "sections": [{"columns": base_cols, "rows": rows}]}

    if kind == "module":
        try:
            module_id = int(key)
        except ValueError:
            return None
        module = next(((ch, m) for ch in ctx["chapters"] for m in ch["modules"] if m["module_id"] == module_id), None)
        if not module:
            return None
        chapter, mod = module
        rows = []
        for lesson in mod["lessons"]:
            rid = lesson["resource_id"]
            started = {ev["acc_id"] for r, ev in ctx["period_pairs"] if r["resource_id"] == rid}
            scores = [ev["score"] for r, ev in ctx["finished"] if r["resource_id"] == rid]
            passed = sum(1 for s in scores if s >= insights.PASS_MARK)
            rows.append({"lesson": lesson["title"], "avg_score": _avg(scores), "finished": len(scores),
                         "started": len(started), "pass_rate": insights.percent(passed, len(scores)),
                         "_open": {"type": "lesson", "id": rid}})
        return {"title": mod["name"], "subtitle": f"{chapter['name']} · its lessons, finished in {period}.",
                "sections": [{"columns": [{"key": "lesson", "label": "Lesson", "type": "text"},
                                          {"key": "avg_score", "label": "Avg score", "type": "score"},
                                          {"key": "pass_rate", "label": "Pass rate", "type": "percent"},
                                          {"key": "finished", "label": "Finished", "type": "text"},
                                          {"key": "started", "label": "Active in it", "type": "text"}],
                              "rows": rows}]}

    if kind == "funnel":
        steps = _funnel_steps(ctx)
        try:
            index = int(key)
            label, people = steps[index]
        except (ValueError, IndexError):
            return None
        stopped = people - steps[index + 1][1] if index + 1 < len(steps) else set()
        sections = [{"title": f"Reached \"{label}\"", "columns": base_cols,
                     "rows": [learner_row(a) for a in ids if a in people]}]
        if index + 1 < len(steps):
            sections.insert(0, {"title": f"Stopped here (not \"{steps[index + 1][0]}\" yet)", "columns": base_cols,
                                "rows": [learner_row(a) for a in ids if a in stopped]})
        return {"title": label, "subtitle": "Where everyone is now (not limited by the time range).",
                "sections": sections}

    if kind == "day":
        try:
            day = datetime.strptime(key, "%Y-%m-%d").date()
        except ValueError:
            return None
        rows = []
        for acc in ids:
            evs = [(t, k) for t, k in all_events.get(acc, []) if t.date() == day]
            if evs:
                rows.append(learner_row(acc, actions=sum(1 for _, k in evs if k == "learn"),
                                        first=evs[0][0].strftime("%I:%M %p").lstrip("0"),
                                        last=evs[-1][0].strftime("%I:%M %p").lstrip("0")))
        return {"title": f"Active on {_fmt_day(day)}, {day.year}", "subtitle": "Signed in or did any learning that day.",
                "sections": [{"columns": [_LEARNER, {"key": "actions", "label": "Learning actions", "type": "text"},
                                          {"key": "first", "label": "From", "type": "text"},
                                          {"key": "last", "label": "To", "type": "text"}],
                              "rows": rows}]}

    if kind == "hour":
        try:
            wd, hour = (int(x) for x in key.split("-"))
            assert 0 <= wd < 7 and 0 <= hour < 24
        except (ValueError, AssertionError):
            return None
        rows = []
        for acc in ids:
            n = sum(1 for t, k in period_events.get(acc, []) if k == "learn" and t.weekday() == wd and t.hour == hour)
            if n:
                rows.append(learner_row(acc, actions=n))
        rows.sort(key=lambda r: -r["actions"])
        return {"title": f"{WEEKDAY_NAMES[wd]}, {_hour_label(hour)}–{_hour_label((hour + 1) % 24)}",
                "subtitle": f"Learners who studied in this hour, {period}.",
                "sections": [{"columns": [_LEARNER, {"key": "actions", "label": "Learning actions", "type": "text"},
                                          {"key": "avg_score", "label": "Avg score", "type": "score"}],
                              "rows": rows}]}

    if kind == "question":
        try:
            la_id, item_id = (int(x) for x in key.split("-"))
        except ValueError:
            return None
        act = next((a for a in ctx["activities"] if a["la_id"] == la_id), None)
        if not act:
            return None
        answers, _ = insights.first_try_answers(ctx["cursor"], [act], ctx["learner_ids"], ctx["start"])
        answers = [a for a in answers if a["item_id"] == item_id]
        words = {"wrong": "Wrong", "close": "Close (not exact)", "skipped": "Skipped", "timed_out": "Time ran out",
                 "left": "Left the page", "correct": "Correct"}
        missed = [learner_row(a["acc_id"], answer=words.get(a["outcome"], a["outcome"]), when=fmt_datetime(a["at"]))
                  for a in answers if a["outcome"] != "correct" and a["acc_id"] in learners]
        right = [learner_row(a["acc_id"], answer="Correct", when=fmt_datetime(a["at"]))
                 for a in answers if a["outcome"] == "correct" and a["acc_id"] in learners]
        cols = [_LEARNER, {"key": "answer", "label": "First try", "type": "text"},
                {"key": "when", "label": "When", "type": "text"}]
        return {"title": insights.question_text(ctx["cursor"], act["type"], item_id),
                "subtitle": f"{act['title']} · {act['type']} · first try, {period}.",
                "sections": [{"title": f"Missed it ({len(missed)})", "columns": cols, "rows": missed},
                             {"title": f"Got it right ({len(right)})", "columns": cols, "rows": right}]}
    return None
