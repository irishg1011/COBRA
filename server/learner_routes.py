"""
learner_routes.py - CobraByte Learner-Side Page & Asset Routes
------------------------------------------------------------------
Blueprint containing every route that serves a page or asset for
logged-in Learner accounts: Dashboard, Coding Sandbox, and the
learner/ folder's own css/js files (learner.js, sandbox.css,
sandbox.js, etc.).

Registered onto the main app in login.py via:
    app.register_blueprint(learner_bp)

Kept separate from login.py (which stays focused on auth/session
routes) the same way admin_routes.py's admin_bp is kept separate.
"""

import os
from flask import Blueprint, render_template, send_from_directory

learner_bp = Blueprint('learner_bp', __name__)

# This file lives in server/, so learner/ is a sibling one level up
# (server/learner_routes.py -> ../learner).
LEARNER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../learner'))


# ============================================================
# ROUTE: DASHBOARD PAGE
# ============================================================
@learner_bp.route("/dashboard")
def dashboard():
    """
    dashboard.html lives in the main Flask templates/ folder (like
    login.html), so render_template works as normal here - the
    Blueprint shares the main app's Jinja template loader.
    """
    return render_template('dashboard.html')


# ============================================================
# ROUTE: CODING SANDBOX PAGE
# ============================================================
@learner_bp.route("/sandbox")
def sandbox():
    """
    sandbox.html lives under learner/html/, NOT the Flask templates/
    folder, so it's served directly via send_from_directory rather
    than render_template.
    """
    learner_html_dir = os.path.join(LEARNER_DIR, 'html')
    return send_from_directory(learner_html_dir, 'sandbox.html')


# ============================================================
# ROUTE: LEARNER FOLDER ASSETS (css/js/etc.)
# ============================================================
@learner_bp.route('/learner/<path:filename>')
def serve_learner_assets(filename):
    """
    Serves everything under the learner/ folder - e.g. learner/js/learner.js,
    learner/css/sandbox.css, learner/js/sandbox.js - so relative paths
    like "../learner/css/sandbox.css" resolve correctly from pages
    served at routes like /sandbox or /dashboard.

    <path:filename> matches slashes, so nested subfolders (css/, js/,
    html/) work automatically without extra routes.
    """
    return send_from_directory(LEARNER_DIR, filename)