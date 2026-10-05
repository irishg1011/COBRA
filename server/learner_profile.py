"""
learner_profile.py - Learner Profile, Edit Profile, Change Password
--------------------------------------------------------------------
Blueprint behind the learner header's profile dropdown:

  Pages
    /profile                   - View Profile (analytics + badges)
    /profile/edit              - Edit Profile (name, username, email)
    /profile/change-password   - Change Password (OTP to email)
    /certificate               - Certificate of Completion (view / print)

  APIs (all for the logged-in learner only - the account always comes
  from the session, never from the request body)
    GET  /api/profile/me                    - name/username/email (dropdown + edit form)
    GET  /api/profile/overview              - profile page data + badges (awards new badges)
    POST /api/profile/heartbeat             - learning-time tracker (once a minute)
    POST /api/profile/update                - save name / username / email
    POST /api/profile/avatar                - upload / replace the profile photo
    POST /api/profile/avatar/remove         - back to the default icon
    GET  /api/certificate                   - the learner's certificate, or how far they are from it
    GET  /media/<name>                      - an uploaded image (profile photo / badge icon) from the database
    POST /api/profile/email/send-otp        - code to a NEW email address
    POST /api/profile/email/verify-otp      - verify that code
    POST /api/profile/password/send-otp     - reset code to the account's email
    POST /api/profile/password/verify-otp
    POST /api/profile/password/reset

Registered in login.py:  app.register_blueprint(learner_profile_bp)
"""

import os
import re
import time
from datetime import datetime
from flask import Blueprint, Response, jsonify, request, send_from_directory
from mysql.connector import Error

from cobradb import get_db_connection
from api import generate_otp, send_email
from auth_core import send_reset_code, verify_reset_code, reset_password, otp_storage, OTP_TTL_SECONDS
from validators import validate_name_field, capitalize_name, validate_email_format
from learner_routes import get_current_learner_acc_id, LEARNER_DIR
from learner_progress_monitor import _load_course_tree, _fetch_progress_rows, _evaluate_rows, _load_lesson_structure
from module_performance import module_performance, PASS_PERCENT
from learning_time import record_heartbeat, get_total_seconds
from badges import award_and_list_badges
from notifications import notify
from profile_avatar import get_avatar_url, set_avatar, remove_avatar  # feat/profile-photo
from certificates import issue_certificate_if_complete, get_certificate, certificate_payload  # feat/certificate
from image_uploads import get_image  # feat/images-in-database: serves /media/<name>

learner_profile_bp = Blueprint("learner_profile_bp", __name__)

USERNAME_REGEX = re.compile(r"^[a-z0-9._]{3,30}$")
USERNAME_RULE_MESSAGE = "Username must be 3-30 characters: letters, numbers, dots or underscores only."
EMAIL_CHANGE_WINDOW_SECONDS = 5 * 60   # time to press Save after verifying the new email
TYPE_KEYS = {
    "Multiple Choice": "mcq",
    "Quiz": "mcq",
    "Fill in the Blanks": "fib",
    "Flashcards": "flashcards",
}
# Breakdown bar order on the profile page (exercise = the lesson's coding exercise).
TOPIC_TYPES = ("mcq", "flashcards", "fib", "exercise")
CHAPTER_ICONS = ["fa-shapes", "fa-database", "fa-code-branch", "fa-cubes", "fa-cube",
                 "fa-puzzle-piece", "fa-file-code", "fa-diagram-project"]


def _not_logged_in():
    return jsonify({"success": False, "message": "Please log in again."}), 401


def _html(name):
    return send_from_directory(os.path.join(LEARNER_DIR, "html"), name)


def _email_change_key(acc_id):
    return f"email_change_{acc_id}"


def _fetch_account(cursor, acc_id):
    cursor.execute(
        """SELECT a.acc_id, a.email, a.username, p.firstname, p.lastname
           FROM account_tbl a
           LEFT JOIN profile_tbl p ON a.acc_id = p.acc_id
           WHERE a.acc_id = %s AND (a.is_deleted = 0 OR a.is_deleted IS NULL)""",
        (acc_id,)
    )
    return cursor.fetchone()


def _account_payload(row):
    first = (row.get("firstname") or "").strip()
    last = (row.get("lastname") or "").strip()
    return {
        "acc_id": row["acc_id"],
        "first_name": first,
        "last_name": last,
        "full_name": f"{first} {last}".strip() or row["username"],
        "username": row["username"],
        "email": row["email"],
    }


def _mask_email(email):
    name, _, domain = (email or "").partition("@")
    if not domain:
        return email
    shown = name[:2] if len(name) > 2 else name[:1]
    return f"{shown}{'*' * max(len(name) - len(shown), 3)}@{domain}"


# ============================================================
# PAGES
# ============================================================
@learner_profile_bp.route("/profile")
def profile_page():
    return _html("profile.html")


@learner_profile_bp.route("/profile/edit")
def edit_profile_page():
    return _html("edit-profile.html")


@learner_profile_bp.route("/profile/change-password")
def change_password_page():
    return _html("change-password.html")


# ============================================================
# API: CURRENT LEARNER (dropdown name + Edit Profile form)
# ============================================================
@learner_profile_bp.route("/api/profile/me", methods=["GET"])
def profile_me():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return _not_logged_in()

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500
    try:
        cursor = connection.cursor(dictionary=True)
        row = _fetch_account(cursor, acc_id)
        if not row:
            cursor.close()
            return _not_logged_in()
        payload = _account_payload(row)
        payload["masked_email"] = _mask_email(row["email"])
        payload["avatar_url"] = get_avatar_url(cursor, acc_id)  # feat/profile-photo (None = default icon)
        cursor.close()
        return jsonify({"success": True, "profile": payload})
    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {e}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# API: LEARNING-TIME HEARTBEAT
# ============================================================
@learner_profile_bp.route("/api/profile/heartbeat", methods=["POST"])
def profile_heartbeat():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return _not_logged_in()
    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False}), 500
    try:
        total = record_heartbeat(connection, acc_id)
        return jsonify({"success": True, "total_seconds": total})
    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {e}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# API: PROFILE OVERVIEW (analytics + badges)
# ============================================================
def _count(cursor, sql, params):
    cursor.execute(sql, params)
    row = cursor.fetchone()
    return int(list(row.values())[0] or 0) if row else 0


def _build_overview(cursor, acc_id, collect=None):
    """collect: optional list - gets {"chapter", "module", "perf"} per module (used by notifications.py)."""
    chapters, _ = _load_course_tree(cursor)
    rows = _fetch_progress_rows(cursor, acc_id=acc_id)
    evaluated = _evaluate_rows(cursor, rows)

    by_resource = {}
    for row, ev in zip(rows, evaluated):
        by_resource.setdefault(row["resource_id"], ev)  # newest first

    perfect = {"mcq": 0, "fib": 0, "flashcards": 0}
    lessons_total = lessons_completed = modules_passed = chapters_completed = 0
    chapters_total = chapters_passed = 0   # feat/certificate: chapters with lessons / with every module passed
    all_scores = []
    topics = []

    # What each lesson actually has (published activities / exercise), so the
    # Topic Performance Breakdown only lists chapters - and bars - that exist.
    structure = _load_lesson_structure(
        cursor, [l["resource_id"] for c in chapters for m in c["modules"] for l in m["lessons"]])

    for index, chapter in enumerate(chapters):
        ch_total = ch_done = 0
        ch_all_passed = True   # feat/certificate: every module of this chapter passed its gate
        ch_scores = []
        type_fracs = {key: [] for key in TOPIC_TYPES}
        ch_types = set()   # graded content this chapter has, attempted or not

        for module in chapter["modules"]:
            perf = module_performance(cursor, acc_id, module["module_id"])
            if collect is not None:
                collect.append({"chapter": chapter, "module": module, "perf": perf})
            if module["lessons"] and perf["passed"]:
                modules_passed += 1
            if module["lessons"] and not perf["passed"]:
                ch_all_passed = False

            for lesson in module["lessons"]:
                rid = lesson["resource_id"]
                ch_total += 1
                if perf["lessons"].get(rid, {}).get("completed"):
                    ch_done += 1
                lesson_info = structure.get(rid) or {}
                for act in lesson_info.get("activities", []):
                    key = TYPE_KEYS.get(act["type"])
                    if key and act["item_total"]:
                        ch_types.add(key)
                if lesson_info.get("exercise"):
                    ch_types.add("exercise")

                ev = by_resource.get(rid)
                if not ev:
                    continue
                if ev["score"] is not None:
                    ch_scores.append(ev["score"])
                for act in ev["activities"]:
                    key = TYPE_KEYS.get(act["type"])
                    if not key or not act["completed"] or not act["total"]:
                        continue
                    type_fracs[key].append(act["score"] / act["total"])
                    if act["score"] >= act["total"]:
                        perfect[key] += 1
                ex = ev.get("exercise")
                if ex and ex["points_total"] and (ex["passed"] or ex["skipped"] or ex["attempts"]):
                    type_fracs["exercise"].append(ex["points_earned"] / ex["points_total"])

        lessons_total += ch_total
        lessons_completed += ch_done
        all_scores.extend(ch_scores)
        if ch_total and ch_done == ch_total:
            chapters_completed += 1
        if ch_total:
            chapters_total += 1
            if ch_all_passed:
                chapters_passed += 1

        topics.append({
            "cat_id": chapter["cat_id"],
            "name": chapter["name"],
            "icon": CHAPTER_ICONS[index % len(CHAPTER_ICONS)],
            "lessons_total": ch_total,
            "lessons_completed": ch_done,
            "percent": round(sum(ch_scores) / len(ch_scores)) if ch_scores else None,
            "types": {
                key: (round(sum(type_fracs[key]) / len(type_fracs[key]) * 100) if type_fracs[key] else None)
                for key in TOPIC_TYPES if key in ch_types
            },
        })

    areas = sorted(
        (t for t in topics if t["percent"] is not None and t["percent"] < PASS_PERCENT),
        key=lambda t: t["percent"]
    )[:3]
    # Chapters with no quiz / flashcards / fill-in / exercise have nothing to
    # break down - leave them out instead of showing empty "-" bars.
    topics = [t for t in topics if t["types"]]

    learning_seconds = get_total_seconds(cursor, acc_id)
    facts = {
        "lessons_completed": lessons_completed,
        "modules_passed": modules_passed,
        "chapters_completed": chapters_completed,
        "perfect_mcq": perfect["mcq"],
        "perfect_fib": perfect["fib"],
        "perfect_flashcards": perfect["flashcards"],
        "exercises_passed": _count(
            cursor, "SELECT COUNT(DISTINCT exercise_id) AS n FROM learner_exercise_progress_tbl WHERE acc_id = %s", (acc_id,)),
        "sandbox_runs": _count(
            cursor, "SELECT COUNT(*) AS n FROM sandbox_runs_tbl WHERE acc_id = %s", (acc_id,)),
        "snippets_saved": _count(
            cursor, "SELECT COUNT(*) AS n FROM sandbox_snippets_tbl WHERE acc_id = %s", (acc_id,)),
        "learning_seconds": learning_seconds,
        # feat/certificate: the whole course is finished when every published
        # chapter is passed (same rule as the "Chapter complete" notification).
        "chapters_total": chapters_total,
        "chapters_passed": chapters_passed,
        "course_completed": 1 if chapters_total and chapters_passed == chapters_total else 0,
        "login_days": _count(
            cursor,
            """SELECT COUNT(DISTINCT DATE(attempted_at)) AS n FROM login_logs_tbl
               WHERE acc_id = %s AND attempt_status = 'Success'""",
            (acc_id,)),
    }

    stats = {
        "overall_completion": round(lessons_completed / lessons_total * 100) if lessons_total else 0,
        "average_score": round(sum(all_scores) / len(all_scores)) if all_scores else None,
        "lessons_completed": lessons_completed,
        "lessons_total": lessons_total,
        "hours": round(learning_seconds / 3600, 1),
    }
    return topics, areas, stats, facts


@learner_profile_bp.route("/api/profile/overview", methods=["GET"])
def profile_overview():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return _not_logged_in()

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500
    try:
        cursor = connection.cursor(dictionary=True)
        row = _fetch_account(cursor, acc_id)
        if not row:
            cursor.close()
            return _not_logged_in()
        topics, areas, stats, facts = _build_overview(cursor, acc_id)
        profile = _account_payload(row)
        profile["avatar_url"] = get_avatar_url(cursor, acc_id)  # feat/profile-photo
        cursor.close()

        badges = award_and_list_badges(connection, acc_id, facts)
        stats["badges_earned"] = sum(1 for b in badges if b["earned"])
        stats["badges_total"] = len(badges)
        certificate = issue_certificate_if_complete(connection, acc_id, facts)  # feat/certificate

        return jsonify({
            "success": True,
            "profile": profile,
            "stats": stats,
            "topics": topics,
            "areas_to_improve": areas,
            "pass_percent": PASS_PERCENT,
            "badges": badges,
            "certificate": certificate_payload(certificate, facts),
        })
    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {e}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# UPLOADED IMAGES (feat/images-in-database)
# Profile photos and badge icons are stored in the database
# (image_uploads.py). This is the URL the browser loads them from, on
# the learner AND the staff side. Public, like /assets: an image name
# is 24 random characters, and names are never reused - so the browser
# may keep an image forever (a new upload always gets a new name).
# ============================================================
@learner_profile_bp.route("/media/<name>")
def uploaded_image(name):
    image = get_image(name)
    if image is None:
        return "", 404
    data, mime_type = image
    response = Response(data, mimetype=mime_type)
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


# ============================================================
# API: PROFILE PHOTO (feat/profile-photo)
# The account is ALWAYS the logged-in learner from the session - no id
# is read from the request - so a learner can only change their own
# photo. Every rule (file type, size, replacing the old file) lives in
# profile_avatar.py, shared with the staff side.
# ============================================================
@learner_profile_bp.route("/api/profile/avatar", methods=["POST"])
def profile_avatar_upload():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return _not_logged_in()
    payload, status = set_avatar(acc_id, request.files.get("avatar"))
    return jsonify(payload), status


@learner_profile_bp.route("/api/profile/avatar/remove", methods=["POST"])
def profile_avatar_remove():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return _not_logged_in()
    payload, status = remove_avatar(acc_id)
    return jsonify(payload), status


# ============================================================
# CERTIFICATE OF COMPLETION (feat/certificate)
# The account is ALWAYS the logged-in learner from the session - no id
# is read from the request - so a learner can only open their own
# certificate. Whether the course is finished is decided here on the
# server (certificates.py), never by the page.
# ============================================================
@learner_profile_bp.route("/certificate")
def certificate_page():
    return _html("certificate.html")


@learner_profile_bp.route("/api/certificate", methods=["GET"])
def certificate_data():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return _not_logged_in()

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500
    try:
        cursor = connection.cursor(dictionary=True)
        row = _fetch_account(cursor, acc_id)
        if not row:
            cursor.close()
            return _not_logged_in()

        # Already issued: nothing to work out. Otherwise check the learner's
        # progress now and issue it if they have just finished the course.
        certificate = get_certificate(cursor, acc_id)
        facts = None
        if certificate is None:
            _, _, _, facts = _build_overview(cursor, acc_id)
        cursor.close()
        if certificate is None:
            certificate = issue_certificate_if_complete(connection, acc_id, facts)

        return jsonify({
            "success": True,
            "learner_name": _account_payload(row)["full_name"],
            "certificate": certificate_payload(certificate, facts),
        })
    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {e}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# API: EDIT PROFILE - new email verification
# ============================================================
def _email_taken(cursor, email, acc_id):
    cursor.execute("SELECT acc_id FROM account_tbl WHERE email = %s AND acc_id <> %s", (email, acc_id))
    return cursor.fetchone() is not None


@learner_profile_bp.route("/api/profile/email/send-otp", methods=["POST"])
def profile_email_send_otp():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return _not_logged_in()

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    ok, message = validate_email_format(email)
    if not ok:
        return jsonify({"success": False, "message": message}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500
    try:
        cursor = connection.cursor(dictionary=True)
        current = _fetch_account(cursor, acc_id)
        if current and current["email"] == email:
            cursor.close()
            return jsonify({"success": False, "message": "This is already your email address."}), 400
        if _email_taken(cursor, email, acc_id):
            cursor.close()
            return jsonify({"success": False, "message": "An account with this email already exists."}), 409
        cursor.close()
    except Error as e:
        return jsonify({"success": False, "message": f"Database error: {e}"}), 500
    finally:
        if connection.is_connected():
            connection.close()

    otp_code = generate_otp()
    otp_storage[_email_change_key(acc_id)] = {
        "otp": otp_code,
        "email": email,
        "expires_at": time.time() + OTP_TTL_SECONDS,
        "verified": False,
    }
    sent = send_email(
        to_email=email,
        subject="CobraByte - Verify Your New Email",
        body_text=f"Your 6-digit verification code is: {otp_code}\nThis code expires in 1 minute."
    )
    if sent:
        return jsonify({"success": True, "message": "Verification code sent to your new email."})
    return jsonify({"success": False, "message": "Failed to send email. Please try again."}), 500


@learner_profile_bp.route("/api/profile/email/verify-otp", methods=["POST"])
def profile_email_verify_otp():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return _not_logged_in()

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp = (data.get("otp") or "").strip()

    key = _email_change_key(acc_id)
    record = otp_storage.get(key)
    if not record or record["email"] != email:
        return jsonify({"success": False, "message": "No verification code found. Please request a new code."}), 400
    if time.time() > record["expires_at"]:
        otp_storage.pop(key, None)
        return jsonify({"success": False, "message": "Verification code has expired. Please click 'Resend code'."}), 400
    if record["otp"] != otp:
        return jsonify({"success": False, "message": "Invalid verification code."}), 400

    record["verified"] = True
    record["expires_at"] = time.time() + EMAIL_CHANGE_WINDOW_SECONDS
    return jsonify({"success": True, "message": "Email verified. Press Save Changes to finish."})


# ============================================================
# API: EDIT PROFILE - save
# ============================================================
@learner_profile_bp.route("/api/profile/update", methods=["POST"])
def profile_update():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return _not_logged_in()

    data = request.get_json(silent=True) or {}
    first_name = (data.get("firstName") or "").strip()
    last_name = (data.get("lastName") or "").strip()
    username = (data.get("username") or "").strip().lower()
    email = (data.get("email") or "").strip().lower()

    for value, label in ((first_name, "First name"), (last_name, "Last name")):
        ok, message = validate_name_field(value, label)
        if not ok:
            return jsonify({"success": False, "message": message, "field": label}), 400
    if not USERNAME_REGEX.match(username):
        return jsonify({"success": False, "message": USERNAME_RULE_MESSAGE, "field": "username"}), 400
    ok, message = validate_email_format(email)
    if not ok:
        return jsonify({"success": False, "message": message, "field": "email"}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"success": False, "message": "Could not connect to database."}), 500
    try:
        cursor = connection.cursor(dictionary=True)
        current = _fetch_account(cursor, acc_id)
        if not current:
            cursor.close()
            return _not_logged_in()

        cursor.execute("SELECT acc_id FROM account_tbl WHERE username = %s AND acc_id <> %s", (username, acc_id))
        if cursor.fetchone():
            cursor.close()
            return jsonify({"success": False, "message": "This username is already taken.", "field": "username"}), 409

        email_changed = email != current["email"]
        key = _email_change_key(acc_id)
        if email_changed:
            record = otp_storage.get(key)
            if (not record or not record.get("verified") or record["email"] != email
                    or time.time() > record["expires_at"]):
                cursor.close()
                return jsonify({"success": False, "field": "email",
                                "message": "Please verify your new email with the code we send before saving."}), 400
            if _email_taken(cursor, email, acc_id):
                cursor.close()
                return jsonify({"success": False, "message": "An account with this email already exists.",
                                "field": "email"}), 409

        first_name = capitalize_name(first_name)
        last_name = capitalize_name(last_name)

        changed = []
        if first_name != (current.get("firstname") or "") or last_name != (current.get("lastname") or ""):
            changed.append("name")
        if username != current["username"]:
            changed.append("username")

        cursor.execute(
            "UPDATE account_tbl SET username = %s, email = %s WHERE acc_id = %s",
            (username, email, acc_id)
        )
        cursor.execute("SELECT prof_id FROM profile_tbl WHERE acc_id = %s", (acc_id,))
        if cursor.fetchone():
            cursor.execute(
                "UPDATE profile_tbl SET firstname = %s, lastname = %s WHERE acc_id = %s",
                (first_name, last_name, acc_id)
            )
        else:
            cursor.execute(
                "INSERT INTO profile_tbl (acc_id, firstname, lastname) VALUES (%s, %s, %s)",
                (acc_id, first_name, last_name)
            )
        if email_changed:
            notify(cursor, acc_id, "security",
                   "Your **email address** was changed",
                   f"From now on we'll send codes to {_mask_email(email)}. If this wasn't you, change your password.",
                   "/profile/edit")
        if changed:
            notify(cursor, acc_id, "profile",
                   "Your **profile** was updated",
                   "Changed: " + " and ".join(changed) + ".",
                   "/profile")
        connection.commit()

        if email_changed:
            otp_storage.pop(key, None)

        updated = _fetch_account(cursor, acc_id)
        cursor.close()
        return jsonify({"success": True, "message": "Profile updated.", "profile": _account_payload(updated)})
    except Error as e:
        connection.rollback()
        return jsonify({"success": False, "message": f"Database error: {e}"}), 500
    finally:
        if connection.is_connected():
            connection.close()


# ============================================================
# API: CHANGE PASSWORD (same rules/codes as Forgot Password,
# but the email always comes from the logged-in account)
# ============================================================
def _session_email():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return None
    connection = get_db_connection()
    if connection is None:
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        row = _fetch_account(cursor, acc_id)
        cursor.close()
        return row["email"] if row else None
    except Error:
        return None
    finally:
        if connection.is_connected():
            connection.close()


@learner_profile_bp.route("/api/profile/password/send-otp", methods=["POST"])
def profile_password_send_otp():
    email = _session_email()
    if not email:
        return _not_logged_in()
    payload, status = send_reset_code(email, "learner")
    if payload.get("success"):
        payload["message"] = f"We sent a 6-digit code to {_mask_email(email)}."
    return jsonify(payload), status


@learner_profile_bp.route("/api/profile/password/verify-otp", methods=["POST"])
def profile_password_verify_otp():
    email = _session_email()
    if not email:
        return _not_logged_in()
    data = request.get_json(silent=True) or {}
    payload, status = verify_reset_code(email, data.get("otp"), "learner")
    return jsonify(payload), status


@learner_profile_bp.route("/api/profile/password/reset", methods=["POST"])
def profile_password_reset():
    email = _session_email()
    if not email:
        return _not_logged_in()
    data = request.get_json(silent=True) or {}
    payload, status = reset_password(email, data.get("newPassword"), data.get("confirmPassword"), "learner",
                                     via="change")
    if not payload.get("success") and "Forgot password" in (payload.get("message") or ""):
        payload["message"] = "Your code expired. Please send a new code and try again."
    return jsonify(payload), status