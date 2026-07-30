"""
admin_dashboard.py - CobraByte Admin Dashboard (Frontend-Only)
---------------------------------------------------------------
Registers the route that renders the Admin Dashboard / Account & Security
page. This file intentionally contains ZERO authentication, database, or
business logic - it only renders the template. All data shown on the page
is placeholder/static data living inside admin_dashboard.html.

Wire this blueprint/route into the main Flask app (e.g. login.py) once
ready, for example:

    from admin_dashboard import register_admin_routes
    register_admin_routes(app)

or, if you prefer a Blueprint later, this module can be converted without
touching the template or static assets.
"""

from flask import Flask, render_template


def register_admin_routes(app: Flask) -> None:
    """Attaches the admin dashboard route to an existing Flask app."""

    @app.route("/admin/dashboard")
    def admin_dashboard():
        # NOTE: no session/role check here yet - this is frontend-only.
        # Future backend integration should verify an authenticated admin
        # session before rendering this template.
        return render_template("admin_dashboard.html", active_page="dashboard")

    @app.route("/admin/account-security")
    def admin_account_security():
        return render_template("admin_dashboard.html", active_page="account-security")


# Allows this file to also be run standalone for quick frontend previews:
#   python admin_dashboard.py
if __name__ == "__main__":
    preview_app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
    )
    register_admin_routes(preview_app)
    preview_app.run(debug=True, port=5001)