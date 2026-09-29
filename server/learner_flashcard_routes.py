"""
learner_flashcard_routes.py - Learner Flashcards ("Cobra's Card Duel") API
------------------------------------------------------------------------------
Its own small Blueprint, like learner_fib_routes.py, so the Flashcards game
never touches the Multiple Choice or Fill in the Blanks routes.

    GET  /api/lesson-activities/flashcard-play?la_id=<id>
         -> cards (front_text only, never the answer) + lives/current-card state
    POST /api/lesson-activities/flashcard-start   {la_id}
         -> starts the ONE play, or resumes the same paused play
    POST /api/lesson-activities/flashcard-answer  {la_id, flashcard_id, answer, recommendation_id?}
         -> graded result + updated state (+ the card's answer)
    POST /api/lesson-activities/flashcard-skip    {la_id, flashcard_id}
         -> skip the current card after a wrong answer + updated state

Registered onto the main app in login.py via:
    app.register_blueprint(learner_flashcard_bp)
"""

from flask import Blueprint, jsonify, request
from learner_routes import get_current_learner_acc_id
from lesson_flashcards import get_flashcard_play, start_flashcard_play, submit_flashcard_answer, skip_flashcard

learner_flashcard_bp = Blueprint("learner_flashcard_bp", __name__)


def _fail(error_message):
    status = 404 if error_message == "This activity is not available." else 400
    return jsonify({"success": False, "message": error_message or "Request failed."}), status


@learner_flashcard_bp.route("/api/lesson-activities/flashcard-play", methods=["GET"])
def flashcard_play():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    play, error_message = get_flashcard_play(acc_id, request.args.get("la_id", type=int))
    if play is None:
        return _fail(error_message)
    return jsonify({"success": True, **play}), 200


@learner_flashcard_bp.route("/api/lesson-activities/flashcard-start", methods=["POST"])
def flashcard_start():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    state, error_message = start_flashcard_play(acc_id, data.get("la_id"))
    if state is None:
        return _fail(error_message)
    return jsonify({"success": True, "state": state}), 200


@learner_flashcard_bp.route("/api/lesson-activities/flashcard-answer", methods=["POST"])
def flashcard_answer():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    result, error_message = submit_flashcard_answer(
        acc_id, data.get("la_id"), data.get("flashcard_id"), data.get("answer"),
        data.get("recommendation_id")
    )
    if result is None:
        return _fail(error_message)
    return jsonify({"success": True, **result}), 200


@learner_flashcard_bp.route("/api/lesson-activities/flashcard-skip", methods=["POST"])
def flashcard_skip():
    acc_id = get_current_learner_acc_id()
    if not acc_id:
        return jsonify({"success": False, "message": "Not logged in."}), 401

    data = request.get_json(silent=True) or {}
    result, error_message = skip_flashcard(
        acc_id, data.get("la_id"), data.get("flashcard_id"), data.get("from_preview") is True
    )
    if result is None:
        return _fail(error_message)
    return jsonify({"success": True, **result}), 200