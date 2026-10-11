"""
progress_insights.py - the "insights" layer of Admin > Learner Progress
------------------------------------------------------------------------------
Read-only. Pure helpers + a few bulk queries; learner_progress_monitor.py
calls them with the rows it already loaded, so nothing is graded twice.

SCORE        first try only (the score saved when an activity was first
             finished - retakes never raise it), graded by
             module_performance.lesson_grade_percent(). Averages count
             FINISHED lessons only: a lesson still in progress has items
             not played yet, which would read as wrong answers.

COLOUR BAND  from the pass mark (activity_retakes.PASS_PERCENT):
                 pass   >= pass mark                     green
                 close  >= pass mark - CLOSE_BAND        yellow
                 fail   below that                       red
                 none   no score yet                     grey

NEEDS HELP   any of (each one is a reason shown to the admin / mentor):
                 average below the pass mark
                 started, but nothing done for INACTIVE_DAYS+ days
                 RETAKES_NEED_HELP+ retake rounds
                 LEAVES_NEED_HELP+ times left an activity page mid-play

STATUS CHIP  one per learner, first that applies:
                 not_started  never opened a lesson
                 needs_help   any reason other than inactivity
                 inactive     only reason: no activity for 7+ days
                 finished     every lesson in scope completed
                 on_track     everything else
"""

from datetime import datetime, timedelta

from mysql.connector import Error

from activity_retakes import PASS_PERCENT, GAME_TABLES, RETAKES_TABLE

PASS_MARK = PASS_PERCENT
CLOSE_BAND = 10              # yellow = within 10 points under the pass mark
INACTIVE_DAYS = 7
RETAKES_NEED_HELP = 2
LEAVES_NEED_HELP = 3
TREND_DAYS = 14              # trend: last 14 days vs the 14 days before
TREND_MIN_GAP = 5            # smaller changes show as "about the same"
ANSWER_KEY_MISS_PERCENT = 80 # "check the answer key" when this many miss it...
ANSWER_KEY_MIN_ANSWERS = 5   # ...and at least this many answered it
TOP_MISSED = 5
QUESTION_PREVIEW = 140

PLAYS_TABLE = "activity_plays_tbl"
PLAY_ITEMS_TABLE = "activity_play_items_tbl"
RECOMMENDATIONS_TABLE = "lesson_recommendations_tbl"
EXERCISE_TYPE = "Coding Exercise"

STATUS_LABELS = {
    "on_track": "On track",
    "close": "Close to passing",
    "needs_help": "Needs help",
    "inactive": f"Inactive {INACTIVE_DAYS}+ days",
    "finished": "Finished",
    "not_started": "Not started",
}
STATUS_FILTERS = tuple(STATUS_LABELS)
ATTENTION_STATUSES = ("needs_help", "inactive")


def settings():
    """Every threshold, for the templates / browser (tooltips, legends)."""
    return {
        "pass_mark": PASS_MARK,
        "close_from": PASS_MARK - CLOSE_BAND,
        "inactive_days": INACTIVE_DAYS,
        "retakes_need_help": RETAKES_NEED_HELP,
        "leaves_need_help": LEAVES_NEED_HELP,
        "trend_days": TREND_DAYS,
        "trend_min_gap": TREND_MIN_GAP,
        "answer_key_miss_percent": ANSWER_KEY_MISS_PERCENT,
        "answer_key_min_answers": ANSWER_KEY_MIN_ANSWERS,
        "status_labels": STATUS_LABELS,
    }


# ------------------------------------------------------------------
# Bands, averages
# ------------------------------------------------------------------
def band(score):
    if score is None:
        return "none"
    if score >= PASS_MARK:
        return "pass"
    if score >= PASS_MARK - CLOSE_BAND:
        return "close"
    return "fail"


def average(values):
    values = [v for v in values if v is not None]
    return round(sum(values) / len(values)) if values else None


def percent(part, whole):
    return round(part * 100 / whole) if whole else None


def days_since(dt, now=None):
    if not dt:
        return None
    now = now or datetime.now()
    return max(0, (now - dt).days)


def ago_text(dt, now=None):
    """'today', 'yesterday', '3 days ago', 'never'."""
    days = days_since(dt, now)
    if days is None:
        return "never"
    if days == 0:
        return "today"
    if days == 1:
        return "yesterday"
    if days < 60:
        return f"{days} days ago"
    return f"{days // 30} months ago"


def _ph(items):
    return ",".join(["%s"] * len(items))


def _table_exists(cursor, name):
    cursor.execute("SHOW TABLES LIKE %s", (name,))
    found = cursor.fetchone() is not None
    return found


def _val(row, key, index=0):
    return row[key] if isinstance(row, dict) else row[index]


# ------------------------------------------------------------------
# Per-learner signals (bulk): retakes, leaves, last activity, time
# ------------------------------------------------------------------
def learner_signals(cursor, acc_ids):
    """
    {acc_id: {"retakes", "leaves", "last_seen", "activity_seconds"}}.
    last_seen = the newest of: an activity play started / answered, an
    old-style answer, an exercise submission. (Lesson rows add their own
    started / read / watched / completed times in the caller.)
    """
    acc_ids = sorted({a for a in acc_ids if a})
    out = {a: {"retakes": 0, "leaves": 0, "last_seen": None, "activity_seconds": 0} for a in acc_ids}
    if not acc_ids:
        return out
    params = tuple(acc_ids)

    def seen(acc_id, dt):
        if acc_id in out and dt and (out[acc_id]["last_seen"] is None or dt > out[acc_id]["last_seen"]):
            out[acc_id]["last_seen"] = dt

    try:
        if _table_exists(cursor, RETAKES_TABLE):
            cursor.execute(
                f"SELECT acc_id, COUNT(*) AS n FROM {RETAKES_TABLE} WHERE acc_id IN ({_ph(acc_ids)}) GROUP BY acc_id",
                params
            )
            for r in cursor.fetchall():
                out[r["acc_id"]]["retakes"] = int(r["n"] or 0)

        from game_plays import leave_counts
        for acc_id, c in leave_counts(cursor, acc_ids).items():
            if acc_id in out:
                out[acc_id]["leaves"] = c["total"]
                seen(acc_id, c.get("last_at"))

        if _table_exists(cursor, PLAYS_TABLE):
            cursor.execute(
                f"""SELECT p.acc_id, MAX(COALESCE(p.completed_at, p.resumed_at, p.started_at)) AS last_play,
                           MAX(pi.answered_at) AS last_answer, COALESCE(SUM(pi.time_used_seconds), 0) AS secs
                    FROM {PLAYS_TABLE} p
                    LEFT JOIN {PLAY_ITEMS_TABLE} pi ON pi.play_id = p.play_id
                    WHERE p.acc_id IN ({_ph(acc_ids)})
                    GROUP BY p.acc_id""",
                params
            )
            for r in cursor.fetchall():
                out[r["acc_id"]]["activity_seconds"] = int(r["secs"] or 0)
                seen(r["acc_id"], r["last_play"])
                seen(r["acc_id"], r["last_answer"])

        for answers_table, _, _, _ in GAME_TABLES.values():
            cursor.execute(
                f"SELECT acc_id, MAX(answered_at) AS last_at FROM {answers_table} "
                f"WHERE acc_id IN ({_ph(acc_ids)}) GROUP BY acc_id",
                params
            )
            for r in cursor.fetchall():
                seen(r["acc_id"], r["last_at"])

        cursor.execute(
            f"SELECT acc_id, MAX(submitted_at) AS last_at FROM exercise_submissions_tbl "
            f"WHERE acc_id IN ({_ph(acc_ids)}) GROUP BY acc_id",
            params
        )
        for r in cursor.fetchall():
            seen(r["acc_id"], r["last_at"])
    except Error as e:
        print(f"progress_insights: could not load learner signals: {e}")
    return out


def attention_reasons(summary, signal, now=None):
    """[{"key", "text"}] - why this learner needs attention ([] = fine)."""
    reasons = []
    avg = summary.get("avg_score")
    if avg is not None and avg < PASS_MARK:
        reasons.append({"key": "low_score", "text": f"Average {avg}% (pass mark {PASS_MARK}%)"})
    if summary.get("current_state") not in ("not_started", "finished"):
        days = days_since(summary.get("_last_seen_raw"), now)
        if days is not None and days >= INACTIVE_DAYS:
            reasons.append({"key": "inactive", "text": f"No activity for {days} days"})
    retakes = (signal or {}).get("retakes", 0)
    if retakes >= RETAKES_NEED_HELP:
        reasons.append({"key": "retakes", "text": f"{retakes} retakes"})
    leaves = (signal or {}).get("leaves", 0)
    if leaves >= LEAVES_NEED_HELP:
        reasons.append({"key": "leaves", "text": f"Left the page {leaves} times during activities"})
    return reasons


def learner_status(summary, reasons):
    if summary.get("current_state") == "not_started":
        return "not_started"
    keys = {r["key"] for r in reasons}
    if keys - {"inactive"}:
        return "needs_help"
    if "inactive" in keys:
        return "inactive"
    if summary.get("current_state") == "finished":
        return "finished"
    return "on_track"


def learner_matches(summary, status):
    """Status filter (By Learner). 'close' = average in the yellow band."""
    if not status:
        return True
    if status == "close":
        return band(summary.get("avg_score")) == "close"
    return summary.get("status") == status


def score_trend(completed, now=None):
    """
    completed = [(completed_at, score)] of finished lessons. Average of
    the last TREND_DAYS vs the TREND_DAYS before. {"direction": up | down
    | same | None, "recent", "before", "change"}.
    """
    now = now or datetime.now()
    recent_from = now - timedelta(days=TREND_DAYS)
    before_from = now - timedelta(days=TREND_DAYS * 2)
    recent = average([s for dt, s in completed if dt and dt >= recent_from])
    before = average([s for dt, s in completed if dt and before_from <= dt < recent_from])
    if recent is None or before is None:
        return {"direction": None, "recent": recent, "before": before, "change": None}
    change = recent - before
    direction = "same" if abs(change) < TREND_MIN_GAP else ("up" if change > 0 else "down")
    return {"direction": direction, "recent": recent, "before": before, "change": change}


# ------------------------------------------------------------------
# One lesson's records (By Lesson rows + the lesson modal)
# ------------------------------------------------------------------
def first_try_percent(ev):
    """First-try % over the activities (and exercise) this learner FINISHED; None if none."""
    got = total = 0
    for act in ev.get("activities") or []:
        if act["completed"] and act["total"]:
            got += act["score"]
            total += act["total"]
    ex = ev.get("exercise")
    if ex and (ex["passed"] or ex["attempts"]) and ex["points_total"]:
        got += ex["points_earned"]
        total += ex["points_total"]
    return percent(got, total)


def record_status(ev, last_touched, now=None):
    """Chip for one learner in one lesson."""
    if ev["is_completed"]:
        if ev["score"] is not None and ev["score"] < PASS_MARK:
            return "needs_help"
        return "finished"
    so_far = first_try_percent(ev)
    if so_far is not None and so_far < PASS_MARK:
        return "needs_help"
    days = days_since(last_touched, now)
    if days is not None and days >= INACTIVE_DAYS:
        return "inactive"
    return "on_track"


def record_matches(record, status):
    """Status filter (By Lesson), on one learner's record."""
    if not status:
        return True
    if status == "close":
        return band(record.get("result")) == "close"
    return record.get("status") == status


def record_result(ev):
    """The score that counts for this record: the lesson score once finished, else first-try so far."""
    return ev["score"] if ev["is_completed"] else first_try_percent(ev)


def stuck_step(ev):
    """Where an unfinished learner stopped: the first step not done (Video -> Content -> Activities -> Exercise)."""
    if ev.get("has_video") and not ev.get("video_watched"):
        return "Video"
    if not ev.get("content_read"):
        return "Lesson content"
    for act in ev.get("activities") or []:
        if not act["completed"]:
            return act["type"] if act["type"] and act["type"] != "—" else "Activities"
    ex = ev.get("exercise")
    if ex and not (ex["passed"] or ex["skipped"]):
        return "Coding exercise"
    return "Finishing the lesson"


def type_scores(evs):
    """{type: {"got", "total", "learners"}} first try, finished activities only (+ the exercise)."""
    per = {}
    for ev in evs:
        for act in ev.get("activities") or []:
            if act["completed"] and act["total"]:
                entry = per.setdefault(act["type"], {"got": 0, "total": 0, "learners": set()})
                entry["got"] += act["score"]
                entry["total"] += act["total"]
                entry["learners"].add(ev["acc_id"])
        ex = ev.get("exercise")
        if ex and (ex["passed"] or ex["attempts"]) and ex["points_total"]:
            entry = per.setdefault(EXERCISE_TYPE, {"got": 0, "total": 0, "learners": set()})
            entry["got"] += ex["points_earned"]
            entry["total"] += ex["points_total"]
            entry["learners"].add(ev["acc_id"])
    return per


def lesson_row_extras(items, now=None):
    """
    items = [(row, ev, last_touched)] of ONE lesson. Adds to the By Lesson row:
    started / finished, avg (finished only), pass rate, hardest part, stuck at.
    """
    evs = [ev for _, ev, _ in items]
    learners = {ev["acc_id"] for ev in evs}
    finished = [ev for ev in evs if ev["is_completed"]]
    finished_scores = [ev["score"] for ev in finished if ev["score"] is not None]

    hardest = None
    for type_name, entry in type_scores(evs).items():
        pct = percent(entry["got"], entry["total"])
        if pct is not None and (hardest is None or pct < hardest["percent"]):
            hardest = {"type": type_name, "percent": pct, "learners": len(entry["learners"])}

    stuck = {}
    for ev in evs:
        if not ev["is_completed"]:
            step = stuck_step(ev)
            stuck[step] = stuck.get(step, 0) + 1
    stuck_at = None
    if stuck:
        step, count = max(stuck.items(), key=lambda kv: kv[1])
        stuck_at = {"step": step, "count": count}

    passed = sum(1 for s in finished_scores if s >= PASS_MARK)
    return {
        "started": len(learners),
        "finished": len({ev["acc_id"] for ev in finished}),
        "avg_score": average(finished_scores),
        "pass_rate": percent(passed, len(finished_scores)),
        "passed": passed,
        "hardest": hardest,
        "stuck_at": stuck_at,
    }


def lesson_funnel(evs, has_video, has_exercise):
    """Step funnel: how many learners got past each step of the lesson."""
    steps = [{"step": "Started", "count": len(evs)}]
    if has_video:
        steps.append({"step": "Video watched", "count": sum(1 for ev in evs if ev.get("video_watched"))})
    steps.append({"step": "Content read", "count": sum(1 for ev in evs if ev.get("content_read"))})
    if any(ev.get("activities") for ev in evs):
        steps.append({"step": "Activities done", "count": sum(
            1 for ev in evs if ev.get("activities") and all(a["completed"] for a in ev["activities"]))})
    if has_exercise:
        steps.append({"step": "Exercise done", "count": sum(
            1 for ev in evs if ev.get("exercise") and (ev["exercise"]["passed"] or ev["exercise"]["skipped"]))})
    steps.append({"step": "Finished", "count": sum(1 for ev in evs if ev["is_completed"])})
    top = steps[0]["count"] or 1
    for s in steps:
        s["percent"] = percent(s["count"], top) or 0
    return steps


def _question_texts(cursor, keys):
    """{(activity type, item id): text} for the most-missed list."""
    texts = {}
    columns = {"Multiple Choice": "question_text", "Fill in the Blanks": "COALESCE(NULLIF(instruction, ''), content)",
               "Flashcards": "front_text"}
    for activity_type, (_, id_col, items_table, _) in GAME_TABLES.items():
        ids = sorted({i for t, i in keys if t == activity_type})
        if not ids:
            continue
        cursor.execute(
            f"SELECT {id_col} AS item_id, {columns[activity_type]} AS txt FROM {items_table} WHERE {id_col} IN ({_ph(ids)})",
            tuple(ids)
        )
        for r in cursor.fetchall():
            text = " ".join(str(r["txt"] or "").split())
            texts[(activity_type, r["item_id"])] = text[:QUESTION_PREVIEW] + ("…" if len(text) > QUESTION_PREVIEW else "")
    return texts


def first_try_answers(cursor, activities, acc_ids, since=None):
    """
    Every FIRST-TRY answer of these learners to these activities:
    [{"acc_id", "la_id", "item_id", "outcome", "at"}]. The first play of
    each activity (new model) or, before plays existed, attempt 1 of each
    item. outcome: correct / wrong / close / skipped / timed_out / left.
    since = only answers given from then on. Also returns retake rounds
    per la_id: (answers, {la_id: rounds}).
    """
    acc_ids = sorted(set(acc_ids))
    la_ids = [a["la_id"] for a in activities]
    answers, retakes = [], {}
    if not acc_ids or not la_ids:
        return answers, retakes
    acc_ph, la_ph = _ph(acc_ids), _ph(la_ids)
    first_played = set()
    try:
        if _table_exists(cursor, PLAYS_TABLE):
            cursor.execute(
                f"""SELECT p.acc_id, p.la_id, pi.item_id, pi.outcome, pi.answered_at
                    FROM {PLAYS_TABLE} p JOIN {PLAY_ITEMS_TABLE} pi ON pi.play_id = p.play_id
                    WHERE p.play_kind = 'first' AND p.acc_id IN ({acc_ph}) AND p.la_id IN ({la_ph})
                      AND pi.outcome IS NOT NULL AND pi.outcome <> 'replaced'""",
                tuple(acc_ids) + tuple(la_ids)
            )
            for r in cursor.fetchall():
                first_played.add((r["acc_id"], r["la_id"]))
                if since and r["answered_at"] and r["answered_at"] < since:
                    continue
                answers.append({"acc_id": r["acc_id"], "la_id": r["la_id"], "item_id": r["item_id"],
                                "outcome": r["outcome"], "at": r["answered_at"]})

        # Answers given before plays existed: the first attempt of each item.
        for activity_type, (answers_table, id_col, items_table, _) in GAME_TABLES.items():
            type_la = [a["la_id"] for a in activities if a["type"] == activity_type]
            if not type_la:
                continue
            cursor.execute(
                f"""SELECT i.la_id, a.{id_col} AS item_id, a.acc_id, a.status, a.answered_at
                    FROM {answers_table} a JOIN {items_table} i ON i.{id_col} = a.{id_col}
                    WHERE i.la_id IN ({_ph(type_la)}) AND a.acc_id IN ({acc_ph})
                      AND a.attempt_number = 1 AND a.play_id IS NULL AND a.retake_id IS NULL
                    ORDER BY a.answer_id ASC""",
                tuple(type_la) + tuple(acc_ids)
            )
            seen = set()
            for r in cursor.fetchall():
                key = (r["acc_id"], r["item_id"])
                if key in seen or (r["acc_id"], r["la_id"]) in first_played:
                    continue
                seen.add(key)
                if since and r["answered_at"] and r["answered_at"] < since:
                    continue
                answers.append({"acc_id": r["acc_id"], "la_id": r["la_id"], "item_id": r["item_id"],
                                "outcome": "correct" if r["status"] == "correct" else (
                                    "skipped" if r["status"] == "skipped" else "wrong"),
                                "at": r["answered_at"]})

        if _table_exists(cursor, RETAKES_TABLE):
            where_since = " AND started_at >= %s" if since else ""
            cursor.execute(
                f"""SELECT la_id, COUNT(*) AS n FROM {RETAKES_TABLE}
                    WHERE acc_id IN ({acc_ph}) AND la_id IN ({la_ph}){where_since} GROUP BY la_id""",
                tuple(acc_ids) + tuple(la_ids) + ((since,) if since else ())
            )
            for r in cursor.fetchall():
                retakes[r["la_id"]] = int(r["n"] or 0)
    except Error as e:
        print(f"progress_insights: could not load first-try answers: {e}")
    return answers, retakes


def question_text(cursor, activity_type, item_id):
    return _question_texts(cursor, {(activity_type, item_id)}).get((activity_type, item_id)) or "(question removed)"


def lesson_activity_stats(cursor, activities, evs, top=TOP_MISSED, since=None):
    """
    activities = [{"la_id", "title", "type"}] (one lesson, or the whole
    course for Analytics); evs = the learners in scope. Returns
    (per_type, most_missed):
      per_type     [{"type", "avg", "learners", "timeouts", "skips", "retakes"}]
                   avg = first try, finished activities only
      most_missed  the `top` questions by miss rate on the FIRST try
                   [{"la_id", "item_id", "activity", "type", "question",
                     "answered", "missed", "miss_percent", "check_key"}]
    since = only answers (and retakes) from then on.
    """
    act_by_id = {a["la_id"]: a for a in activities}
    answers, retake_counts = first_try_answers(cursor, activities, [ev["acc_id"] for ev in evs], since)
    counts = {}       # la_id -> {"timeouts", "skips", "retakes"}
    items = {}        # (la_id, item_id) -> {"answered", "missed"}
    for a in answers:
        c = counts.setdefault(a["la_id"], {"timeouts": 0, "skips": 0, "retakes": 0})
        if a["outcome"] == "timed_out":
            c["timeouts"] += 1
        elif a["outcome"] == "skipped":
            c["skips"] += 1
        entry = items.setdefault((a["la_id"], a["item_id"]), {"answered": 0, "missed": 0})
        entry["answered"] += 1
        if a["outcome"] != "correct":
            entry["missed"] += 1
    for la_id, n in retake_counts.items():
        counts.setdefault(la_id, {"timeouts": 0, "skips": 0, "retakes": 0})["retakes"] = n

    scores = type_scores(evs)
    per_type = []
    for type_name in sorted({a["type"] for a in activities}):
        type_la = [a["la_id"] for a in activities if a["type"] == type_name]
        entry = scores.get(type_name)
        per_type.append({
            "type": type_name,
            "avg": percent(entry["got"], entry["total"]) if entry else None,
            "learners": len(entry["learners"]) if entry else 0,
            "timeouts": sum(counts.get(la, {}).get("timeouts", 0) for la in type_la),
            "skips": sum(counts.get(la, {}).get("skips", 0) for la in type_la),
            "retakes": sum(counts.get(la, {}).get("retakes", 0) for la in type_la),
        })
    exercise_evs = [ev for ev in evs if ev.get("exercise")]
    if exercise_evs:
        entry = scores.get(EXERCISE_TYPE)
        per_type.append({
            "type": EXERCISE_TYPE,
            "avg": percent(entry["got"], entry["total"]) if entry else None,
            "learners": len(entry["learners"]) if entry else 0,
            "timeouts": None,
            "skips": sum(1 for ev in exercise_evs if ev["exercise"]["skipped"]),
            "retakes": sum(max(0, ev["exercise"]["attempts"] - 1) for ev in exercise_evs),
        })

    missed = [
        {"la_id": la_id, "item_id": item_id, **entry, "miss_percent": percent(entry["missed"], entry["answered"])}
        for (la_id, item_id), entry in items.items() if entry["missed"] > 0
    ]
    missed.sort(key=lambda m: (-m["miss_percent"], -m["missed"], m["la_id"], m["item_id"]))
    missed = missed[:top]
    texts = _question_texts(cursor, {(act_by_id[m["la_id"]]["type"], m["item_id"]) for m in missed}) if missed else {}
    most_missed = []
    for m in missed:
        act = act_by_id[m["la_id"]]
        most_missed.append({
            "la_id": m["la_id"],
            "item_id": m["item_id"],
            "activity": act["title"],
            "type": act["type"],
            "question": texts.get((act["type"], m["item_id"])) or "(question removed)",
            "answered": m["answered"],
            "missed": m["missed"],
            "miss_percent": m["miss_percent"],
            "check_key": m["answered"] >= ANSWER_KEY_MIN_ANSWERS and m["miss_percent"] >= ANSWER_KEY_MISS_PERCENT,
        })
    return per_type, most_missed


# ------------------------------------------------------------------
# One learner (the Course Progress modal)
# ------------------------------------------------------------------
def learner_extras(cursor, acc_id, pairs, lesson_path, signal, now=None):
    """
    Timeline of finished lessons, strong / weak modules, first-try % per
    activity type, retakes per activity, time in activities and the
    recommendations the system gave.
    """
    now = now or datetime.now()
    timeline = []
    by_module = {}
    for row, ev in pairs:
        if not ev["is_completed"] or ev["score"] is None:
            continue
        path = lesson_path.get(row["resource_id"]) or {}
        timeline.append({
            "lesson": ev["lesson"],
            "score": ev["score"],
            "band": band(ev["score"]),
            "completed_at": row.get("completed_at"),
            "module": path.get("module") or "—",
        })
        if path:
            by_module.setdefault((path["module_id"], path["module"]), []).append(ev["score"])
    timeline.sort(key=lambda t: t["completed_at"] or datetime.min)
    trend = score_trend([(t["completed_at"], t["score"]) for t in timeline], now)
    for t in timeline:
        dt = t.pop("completed_at")
        t["date"] = f"{dt.strftime('%b')} {dt.day}" if dt else "—"

    modules = [{"module": name, "avg": average(scores), "lessons": len(scores), "band": band(average(scores))}
               for (_, name), scores in by_module.items()]
    strong = sorted([m for m in modules if m["avg"] >= PASS_MARK], key=lambda m: -m["avg"])
    weak = sorted([m for m in modules if m["avg"] < PASS_MARK], key=lambda m: m["avg"])

    types = [{"type": t, "percent": percent(e["got"], e["total"]), "band": band(percent(e["got"], e["total"]))}
             for t, e in sorted(type_scores([ev for _, ev in pairs]).items())]

    retakes, recommendations = [], []
    try:
        if _table_exists(cursor, RETAKES_TABLE):
            cursor.execute(
                f"""SELECT r.la_id, la.activity_title, COUNT(*) AS rounds,
                           SUM(r.status = 'completed') AS done, MAX(r.started_at) AS last_at
                    FROM {RETAKES_TABLE} r LEFT JOIN learning_activities_tbl la ON la.la_id = r.la_id
                    WHERE r.acc_id = %s GROUP BY r.la_id, la.activity_title ORDER BY last_at DESC""",
                (acc_id,)
            )
            from admin_time import fmt_datetime
            retakes = [{"activity": r["activity_title"] or "—", "rounds": int(r["rounds"] or 0),
                        "done": int(r["done"] or 0), "last": fmt_datetime(r["last_at"])} for r in cursor.fetchall()]
        if _table_exists(cursor, RECOMMENDATIONS_TABLE):
            cursor.execute(
                f"""SELECT rec.reason, rec.generated_at, rec.resolved, lr.resource_title
                    FROM {RECOMMENDATIONS_TABLE} rec LEFT JOIN learning_resources_tbl lr ON lr.resource_id = rec.resource_id
                    WHERE rec.acc_id = %s ORDER BY rec.generated_at DESC, rec.recommendation_id DESC LIMIT 50""",
                (acc_id,)
            )
            from admin_time import fmt_datetime
            recommendations = [{"lesson": r["resource_title"] or "—", "reason": r["reason"] or "",
                                "resolved": bool(r["resolved"]), "when": fmt_datetime(r["generated_at"])}
                               for r in cursor.fetchall()]
    except Error as e:
        print(f"progress_insights: could not load learner extras for {acc_id}: {e}")

    seconds = (signal or {}).get("activity_seconds", 0)
    return {
        "timeline": timeline,
        "trend": trend,
        "strong": strong,
        "weak": weak,
        "types": types,
        "retakes": retakes,
        "retake_total": sum(r["rounds"] for r in retakes),
        "recommendations": recommendations,
        "activity_minutes": round(seconds / 60),
    }
