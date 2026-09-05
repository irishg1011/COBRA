import os
from flask import Flask, render_template, redirect, url_for, send_from_directory
from admin_routes import admin_bp

# Define paths relative to the 'server' folder
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
TEMPLATES_DIR = os.path.abspath(os.path.join(BASE_DIR, '../templates'))
STATIC_DIR = os.path.abspath(os.path.join(BASE_DIR, '../static'))

# Initialize the Flask application with the correct folder paths
app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR)

# --- SECURE SESSION KEY ---
app.secret_key = 'your_super_secret_key_change_this_to_something_random'

# ------------------------------------------------------------
# Route to serve root-level assets folder
# ------------------------------------------------------------
@app.route('/assets/<path:filename>')
def serve_assets(filename):
    assets_dir = os.path.abspath(os.path.join(BASE_DIR, '../assets'))
    return send_from_directory(assets_dir, filename)

# ------------------------------------------------------------
# Landing Page Route
# ------------------------------------------------------------
@app.route('/')
def landing_page():
    return render_template('landing_page.html')

# ------------------------------------------------------------
# Blueprint Registration
# ------------------------------------------------------------
app.register_blueprint(admin_bp, url_prefix='/admin')

# ------------------------------------------------------------
# Server Runner
# ------------------------------------------------------------
if __name__ == '__main__':
    app.run(debug=True, port=5000)