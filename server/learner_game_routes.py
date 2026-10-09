"""
learner_game_routes.py - Routes shared by the three learner games
------------------------------------------------------------------------------
feat/question-timer, feat/leave-detection

    POST /api/lesson-activities/game/timeout   the question bar ran out
                                               {la_id, item_id}
    POST /api/lesson-activities/game/leave     the learner left / came back
                                               {la_id, phase: start|end,
                                                away_seconds, reason}
                                               (phase start arrives as a
                                                sendBeacon, so the body is
                                                read whatever its type)

Every rule is in game_plays.py; the server decides, the browser only
reports. Registered in login.py:  app.register_blueprint(learner_game_bp)
"""

import json

from flask import Blueprint, jsonify, request
from learner_routes import get_current_learner_acc_id
from game_plays import time_out_item, report_leave

learner_game_bp = Blueprint("learner_game_bp", __name__)


def _body():
    data = request.get_json(silent=True, force=True)
    if isinstance(data, dict):
        return data
    try:
        data = json.loads(request.get_data(as_text=True) or "{}")
    except ValueError:
        data = {}
    return data if isinstance(data, dict) else {}


def _fail(error_message):
    status = 404 if error_message == "This activity is not available." else 400
    return jsonify({"success": False, "message": error_message or "Request failed."}), status


@learner_game_bp.route("/api/lesson-activities/game/timeout", methods=["POST"])
def game_timeout():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401
    data = _body()
    result, error_message = time_out_item(acc_id, data.get("la_id"), data.get("item_id"))
    if result is None:
        return _fail(error_message)
    return jsonify({"success": True, **result}), 200


@learner_game_bp.route("/api/lesson-activities/game/leave", methods=["POST"])
def game_leave():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401
    data = _body()
    phase = "start" if data.get("phase") == "start" else "end"
    result, error_message = report_leave(acc_id, data.get("la_id"), phase,
                                         data.get("away_seconds"), data.get("reason"))
    if result is None:
        return _fail(error_message)
    return jsonify({"success": True, **result}), 200
