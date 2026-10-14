"""
course_status.py - the course's finish line (feat/certificate-finish-line)
------------------------------------------------------------------------------
Where the learner stands on the Certificate of Completion, for the lesson
Summary, the retake screen and the end of the Learning Map. The RULE is not
written here: the facts come from learner_profile._build_overview() and the
certificate from certificates.issue_certificate_if_complete() - the same
calls the profile and the bell make - so every screen agrees.

    course_block(connection, acc_id)
        - runs the certificate check (issues it once, with its notification,
          when the course is finished) and returns:
          {
            "state": "certificate" | "almost" | "none",
            "course_name", "pass_percent",
            "chapters_passed", "chapters_total",
            # state "certificate":
            "reference_no", "just_earned",   # just_earned: issued in the last day
            # no certificate yet:
            "remaining": [{"cat_id", "name", "modules": [module entry, ...]}],
          }
          "almost" = every lesson finished, but some module is below its gate.

A learner who already has a certificate is answered from that row alone -
nothing is recalculated, and nothing is ever taken back.
"""

from datetime import datetime, timedelta

from certificates import get_certificate, issue_certificate_if_complete, COURSE_NAME
from module_performance import PASS_PERCENT

# The celebration popup is only for a certificate earned just now (not for
# learners who earned it before this release) - see lesson-content.js.
JUST_EARNED_WITHIN = timedelta(days=1)


def _ph_now():
    """Philippine time, naive - the same clock certificates.issued_at is saved in."""
    return datetime.utcnow() + timedelta(hours=8)


def _module_entry(module, perf):
    """One module that is not passed yet, with the way forward."""
    lessons = perf["lessons"]
    any_done = any(l["completed"] for l in lessons.values())
    if perf["needs_retake"]:
        status = "needs_retake"
    elif any_done:
        status = "in_progress"
    else:
        status = "not_started"

    # Same links as the Lessons page: "Retake N missed" opens the first
    # lesson with missed items in retake mode. A module that is low with
    # nothing to retake (e.g. a skipped coding exercise) gets its Module
    # Review instead.
    action = None
    if perf["needs_retake"]:
        first_missed = next((rid for rid, l in lessons.items() if l["missed"] > 0), None)
        if first_missed is not None:
            action = {"label": "Retake", "url": f"/lesson-content?resource_id={first_missed}&retake=1"}
        else:
            action = {"label": "Module Review", "url": f"/module-review?module_id={module['module_id']}"}

    return {
        "module_id": module["module_id"],
        "name": module["name"],
        "percent": perf["percent"],
        "status": status,
        "action": action,
    }


def course_block(connection, acc_id):
    from learner_profile import _build_overview   # imported here: learner_profile imports learner_routes

    block = {"course_name": COURSE_NAME, "pass_percent": PASS_PERCENT}

    cursor = connection.cursor(dictionary=True)
    try:
        certificate = get_certificate(cursor, acc_id)
        collected, facts = [], None
        if certificate is None:
            _, _, _, facts = _build_overview(cursor, acc_id, collect=collected)
    finally:
        cursor.close()

    if certificate is None:
        certificate = issue_certificate_if_complete(connection, acc_id, facts)

    if certificate is not None:
        block.update({
            "state": "certificate",
            "reference_no": certificate["reference_no"],
            "just_earned": _ph_now() - certificate["issued_at"] <= JUST_EARNED_WITHIN,
        })
        if facts:
            block["chapters_passed"] = int(facts.get("chapters_passed") or 0)
            block["chapters_total"] = int(facts.get("chapters_total") or 0)
        return block

    remaining = []
    by_chapter = {}
    all_lessons_done = True
    for item in collected:
        chapter, module, perf = item["chapter"], item["module"], item["perf"]
        if not module["lessons"]:
            continue
        all_lessons_done = all_lessons_done and perf["all_done"]
        if perf["passed"]:
            continue
        entry = by_chapter.get(chapter["cat_id"])
        if entry is None:
            entry = {"cat_id": chapter["cat_id"], "name": chapter["name"], "modules": []}
            by_chapter[chapter["cat_id"]] = entry
            remaining.append(entry)
        entry["modules"].append(_module_entry(module, perf))

    block.update({
        "state": "almost" if all_lessons_done and remaining else "none",
        "chapters_passed": int(facts.get("chapters_passed") or 0),
        "chapters_total": int(facts.get("chapters_total") or 0),
        "remaining": remaining,
    })
    return block
