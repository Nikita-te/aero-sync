from flask import Flask
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from flask_cors import CORS

# Initialize extensions (app-unbound)
db = SQLAlchemy()
socketio = SocketIO()
login_manager = LoginManager()
bcrypt = Bcrypt()


def create_app(config_class=None):
    """Application factory pattern."""
    from .config import DevelopmentConfig
    if config_class is None:
        config_class = DevelopmentConfig

    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    login_manager.init_app(app)
    bcrypt.init_app(app)
    CORS(app, origins=app.config.get('CORS_ORIGINS', '*'))

    # SocketIO: use Redis message queue in prod, in-memory in dev.
    # Probe Redis first — if it's unreachable, fall back to in-memory so the
    # app still works instead of flooding logs with "Cannot publish to redis".
    message_queue = app.config.get('SOCKETIO_MESSAGE_QUEUE')
    if message_queue:
        try:
            import redis as _redis
            _r = _redis.from_url(message_queue, socket_connect_timeout=2)
            _r.ping()
        except Exception:
            import warnings
            warnings.warn(
                f'[AeroSync] Redis at {message_queue!r} is unreachable — '
                'falling back to in-memory SocketIO (single-process only).',
                RuntimeWarning,
            )
            message_queue = None
    socketio.init_app(
        app,
        cors_allowed_origins='*',
        async_mode='eventlet',
        message_queue=message_queue,
        logger=False,
        engineio_logger=False
    )

    # Register blueprints
    from .routes.auth import auth_bp
    from .routes.rooms import rooms_bp
    from .routes.api import api_bp

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(rooms_bp, url_prefix='/rooms')
    app.register_blueprint(api_bp, url_prefix='/api')

    # Register socket handlers
    from .sockets import register_socket_handlers
    register_socket_handlers(socketio)

    # Serve the SPA frontend
    from .routes.frontend import register_frontend
    register_frontend(app)

    # User loader for Flask-Login
    from .models.user import User

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    login_manager.login_view = None  # API-only auth; no redirect

    return app
