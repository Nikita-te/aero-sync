from flask import send_from_directory
import os


def register_frontend(app):
    """
    Register routes to serve the single-page frontend from /app/static/.
    This must be called after blueprints are registered so it doesn't shadow API routes.
    """
    static_dir = os.path.join(app.root_path, 'static')

    @app.route('/')
    def index():
        return send_from_directory(static_dir, 'index.html')

    @app.route('/room/<path:room_id>')
    def room_page(room_id):
        """Deep-link to a room — SPA handles it via ?join= param client-side."""
        return send_from_directory(static_dir, 'index.html')
