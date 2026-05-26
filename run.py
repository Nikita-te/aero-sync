# ⚠️  MUST be the very first import — patches stdlib sockets for eventlet async mode.
# Without this, WebSocket upgrades crash with "write() before start_response".
import eventlet
eventlet.monkey_patch()

import os
from app import create_app, socketio, db
from app.models import User, Room, RoomParticipant, ChatMessage
from app.config import config

env = os.environ.get('FLASK_ENV', 'development')
cfg = config.get(env, config['default'])

app = create_app(cfg)


@app.shell_context_processor
def make_shell_context():
    """Expose models in `flask shell` for easy debugging."""
    return {
        'db': db,
        'User': User,
        'Room': Room,
        'RoomParticipant': RoomParticipant,
        'ChatMessage': ChatMessage,
    }


@app.cli.command('init-db')
def init_db():
    """CLI: Create all database tables."""
    with app.app_context():
        db.create_all()
        print('✅ Database tables created.')


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        print('✅ Database ready.')

    print('🚀 AeroSync server starting on http://0.0.0.0:5000')
    socketio.run(
        app,
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000)),
        debug=(env == 'development'),
        use_reloader=(env == 'development'),
        allow_unsafe_werkzeug=True,  # needed for eventlet in dev
    )
