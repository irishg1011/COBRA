"""
contact_routes.py - Landing page "Send Us a Message" API
------------------------------------------------------------------------------
feat/contact-messages

Its own small Blueprint (like learner_fib_routes.py), because this is
the one PUBLIC endpoint a visitor who is not logged in may post to:

    POST /api/contact   {name, email, message, website}
         -> saves the message and emails it to the admin inbox
            (contact_messages.submit_contact_message)

"website" is the hidden trap field for bots - real visitors leave it empty.

Two ways in, one set of rules:
  - landing_script.js sends JSON and gets JSON back (no page reload);
  - if that script did not run, the form posts normally and the visitor
    is sent back to the landing page's contact section with the result
    in the address (?contact=sent / invalid / limit / error), which
    landing_page.html shows in the same status line.

Registered onto the main app in login.py via:
    app.register_blueprint(contact_bp)
"""

from flask import Blueprint, jsonify, redirect, request
from contact_messages import submit_contact_message
from client_ip import get_client_ip

contact_bp = Blueprint("contact_bp", __name__)


# http status -> the ?contact= value for the no-script path
_RESULT_BY_STATUS = {200: "sent", 201: "sent", 400: "invalid", 429: "limit"}


@contact_bp.route("/api/contact", methods=["POST"])
def contact_submit():
    from_script = request.is_json
    data = (request.get_json(silent=True) or {}) if from_script else request.form
    payload, status = submit_contact_message(
        data.get("name"), data.get("email"), data.get("message"),
        client_key=get_client_ip(),  # per-visitor rate limit, not per-proxy
        trap=data.get("website"),
    )
    if from_script:
        return jsonify(payload), status
    return redirect(f"/?contact={_RESULT_BY_STATUS.get(status, 'error')}#contact", code=303)