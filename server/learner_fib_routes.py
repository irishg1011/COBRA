"""
learner_fib_routes.py - Learner Fill in the Blanks (Cobra vs SyntaxBug) API
------------------------------------------------------------------------------
Its own small Blueprint so the Fill in the Blanks battle doesn't touch the
routes the Multiple Choice cobra arena uses in learner_routes.py.

    GET  /api/lesson-activities/fib-play?la_id=<id>
         -> items (learner-safe, no answers) + lives/current-item state
    POST /api/lesson-activities/fib-answer   {la_id, fib_id, answer}
         -> graded result + updated state (+ correct_answer after a wrong one)
    POST /api/lesson-activities/fib-skip     {la_id, fib_id}
         -> skip the current item after a wrong answer + updated state

Registered onto the main app in login.py via:
    app.register_blueprint(learner_fib_bp)
"""

from flask import Blueprint, jsonify, request
from learner_routes import get_current_learner_acc_id
from lesson_fill_blanks import get_fib_play, start_fib_play, submit_fib_answer, skip_fib_item

learner_fib_bp = Blueprint("learner_fib_bp", __name__)


@learner_fib_bp.route("/api/lesson-activities/fib-play", methods=["GET"])
def fib_play():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    la_id = request.args.get("la_id", type=int)
    if not la_id:
        return jsonify({"success": False, "message": "la_id is required."}), 400

    play, error_message, status = get_fib_play(acc_id, la_id)
    if play is None:
        return jsonify({"success": False, "message": error_message}), status
    return jsonify({"success": True, **play}), 200


# feat/question-pool-draw: start-or-resume the ONE play and reveal its
# current item - called right before an item is shown (boot, Next puzzle).
@learner_fib_bp.route("/api/lesson-activities/fib-start", methods=["POST"])
def fib_start():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    play, error_message = start_fib_play(acc_id, data.get("la_id"), boot=data.get("boot") is True)
    if play is None:
        status = 404 if error_message == "This activity is not available." else 400
        return jsonify({"success": False, "message": error_message or "Could not start."}), status
    return jsonify({"success": True, **play}), 200


@learner_fib_bp.route("/api/lesson-activities/fib-answer", methods=["POST"])
def fib_answer():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    result, error_message = submit_fib_answer(
        acc_id, data.get("la_id"), data.get("fib_id"), data.get("answer")
    )
    if result is None:
        return jsonify({"success": False, "message": error_message or "Could not check this answer."}), 400
    return jsonify({"success": True, **result}), 200


@learner_fib_bp.route("/api/lesson-activities/fib-skip", methods=["POST"])
def fib_skip():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    result, error_message = skip_fib_item(
        acc_id, data.get("la_id"), data.get("fib_id"), data.get("from_preview") is True
    )
    if result is None:
        return jsonify({"success": False, "message": error_message or "Could not skip this item."}), 400
    return jsonify({"success": True, **result}), 200