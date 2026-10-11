"""
idle_logout.py - Log out after a period of NO REAL ACTIVITY
------------------------------------------------------------
Learners are logged out after LEARNER_IDLE_MINUTES (default 60) and staff
(Admin / Mentor) after STAFF_IDLE_MINUTES (default 120) without real use
of the site. Both are environment variables, so they change without a
code edit.

What counts as activity:
  - opening a page (a browser navigation), and
  - POST /session/activity - sent by static/idle-logout.js at most once a
    minute while the person clicks, types, scrolls, moves the mouse or
    plays a lesson video.
Background calls (heartbeat, notification checks, live dashboards) do
NOT count, so an open but forgotten tab is logged out like any other.

Two layers:
  1. static/idle-logout.js (every learner and staff page) warns 60
     seconds before the limit ("Stay logged in"), then calls
     POST /session/idle-logout and goes to the login page. Activity in
     any tab of the same browser counts for all of them.
  2. This file checks every request on the server, so a closed tab or a
     sleeping laptop is logged out too: the first request after the limit
     (+ a short grace for the once-a-minute ping) ends that device's
     session. Other devices of the same account are not touched.

The time of the last real activity is kept in the session cookie
("active_at"). feat/admin-online: the same activity is also copied to
active_sessions_tbl.last_activity_at (at most once a minute per device),
so admins can see who is online / idle - see presence.py.
"""
import os
import time

from flask import Blueprint, jsonify, request, session, g

from session_tracker import end_session, mark_session_activity

idle_bp = Blueprint("idle_logout", __name__)

LEARNER_IDLE_MINUTES_DEFAULT = 60
STAFF_IDLE_MINUTES_DEFAULT = 120
WARNING_SECONDS = 60
# The browser pings at most once a minute - the server waits a little
# longer than the page's own timer, so the page always logs out first.
SERVER_GRACE_SECONDS = 120
# Don't rewrite the session cookie on every request.
ACTIVE_WRITE_EVERY_SECONDS = 30
# feat/admin-online: last_activity_at is written at most this often per device.
ACTIVITY_DB_WRITE_EVERY_SECONDS = 60
IDLE_COOKIE = "cobra_idle_logout"
LOGIN_PAGES = ("/login", "/staff/login", "/")


def _minutes(env_name, default):
    raw = os.environ.get(env_name)
    try:
        value = float(raw) if raw not in (None, "") else default
        return value if value > 0 else default
    except (TypeError, ValueError):
        return default


def current_role():
    """'staff', 'learner' or None (not signed in)."""
    if session.get("admin_id"):
        return "staff"
    if session.get("acc_id") or session.get("session_token"):
        return "learner"
    return None


def limit_seconds(role):
    if role == "staff":
        return int(_minutes("STAFF_IDLE_MINUTES", STAFF_IDLE_MINUTES_DEFAULT) * 60)
    return int(_minutes("LEARNER_IDLE_MINUTES", LEARNER_IDLE_MINUTES_DEFAULT) * 60)


def login_url(role):
    return "/staff/login" if role == "staff" else "/login"


def _is_navigation():
    if request.method != "GET":
        return False
    if request.headers.get("Sec-Fetch-Mode") == "navigate":
        return True
    accept = request.headers.get("Accept", "")
    return "text/html" in accept and request.headers.get("X-Requested-With") != "XMLHttpRequest"


def _mark_active(now):
    last = session.get("active_at") or 0
    if now - last >= ACTIVE_WRITE_EVERY_SECONDS:
        session["active_at"] = now
    _record_activity(now)


def _record_activity(now):
    """Real use -> active_sessions_tbl.last_activity_at (Who's online dots)."""
    try:
        last = int(session.get("activity_db_at") or 0)
    except (TypeError, ValueError):
        last = 0
    if now - last < ACTIVITY_DB_WRITE_EVERY_SECONDS:
        return
    session["activity_db_at"] = now
    mark_session_activity(session.get("session_token"))


def _end_idle_session(role):
    """Ends ONLY this browser's session (other devices stay signed in)."""
    acc_id = session.get("admin_id") or session.get("acc_id")
    end_session(session.get("session_token"))
    if role == "staff" and acc_id:
        _touch_last_login(acc_id)   # same as a normal staff logout
    session.clear()
    g.idle_logged_out = role


def _touch_last_login(acc_id):
    try:
        from cobradb import get_db_connection
        connection = get_db_connection()
        if connection is None:
            return
        try:
            cursor = connection.cursor()
            cursor.execute("UPDATE account_tbl SET last_login = NOW() WHERE acc_id = %s", (acc_id,))
            connection.commit()
            cursor.close()
        finally:
            if connection.is_connected():
                connection.close()
    except Exception as e:   # a logout must never fail
        print(f"idle_logout: could not update last_login: {e}")


def enforce_idle_logout():
    """before_request: end a session idle past its limit; record real activity."""
    path = request.path or ""
    if request.endpoint == "static" or path.startswith(("/static/", "/assets/")) or "/static/" in path:
        return None
    role = current_role()
    if not role:
        return None
    now = int(time.time())
    last = session.get("active_at")
    if not last:
        # Signed in before this check existed (or just now): start counting.
        session["active_at"] = now
        return None
    if now - int(last) > limit_seconds(role) + SERVER_GRACE_SECONDS:
        # The page's own guard (or the login page) takes it from here.
        _end_idle_session(role)
        return None
    # Opening a login page never rewrites the session cookie: right after an
    # idle logout in another tab, that would save the old session again.
    if _is_navigation() and path not in LOGIN_PAGES:
        _mark_active(now)
    return None


def remember_idle_logout(response):
    """after_request: tell the login page why ("logged out after inactivity")."""
    role = getattr(g, "idle_logged_out", None)
    # A login request that cleared an idle session is signing in again.
    if role and not (request.method == "POST" and request.path in ("/login", "/staff/login")):
        response.set_cookie(IDLE_COOKIE, role, max_age=300, samesite="Lax", path="/")
    return response


@idle_bp.route("/session/idle-info")
def idle_info():
    role = current_role()
    if not role:
        # The login pages use these to say "logged out after 1 hour ...".
        return jsonify({"logged_in": False,
                        "learner_minutes": limit_seconds("learner") // 60,
                        "staff_minutes": limit_seconds("staff") // 60}), 200
    now = int(time.time())
    return jsonify({
        "logged_in": True,
        "role": role,
        "limit_seconds": limit_seconds(role),
        "warning_seconds": WARNING_SECONDS,
        "idle_seconds": max(0, now - int(session.get("active_at") or now)),
        "login_url": login_url(role),
    }), 200


@idle_bp.route("/session/activity", methods=["POST"])
def idle_activity():
    """The person really used the page (sent at most once a minute)."""
    if not current_role():
        return jsonify({"logged_in": False}), 401
    now = int(time.time())
    session["active_at"] = now
    _record_activity(now)
    return jsonify({"success": True}), 200


@idle_bp.route("/session/idle-logout", methods=["POST"])
def idle_logout():
    """The page's timer ran out - end this device's session."""
    role = current_role()
    if role:
        _end_idle_session(role)
    return jsonify({"success": True, "login_url": login_url(role or "learner")}), 200


def init_idle_logout(app):
    app.register_blueprint(idle_bp)
    app.before_request(enforce_idle_logout)
    app.after_request(remember_idle_logout)
