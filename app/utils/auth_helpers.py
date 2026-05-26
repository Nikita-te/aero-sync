import jwt
from datetime import datetime, timezone
from functools import wraps
from flask import request, jsonify, current_app
from app.models.user import User
from app import db


def generate_token(user_id: int) -> str:
    """Generate a JWT access token for the given user ID."""
    payload = {
        'user_id': user_id,
        'exp': datetime.now(timezone.utc) + current_app.config['JWT_ACCESS_TOKEN_EXPIRES'],
        'iat': datetime.now(timezone.utc),
    }
    return jwt.encode(payload, current_app.config['JWT_SECRET_KEY'], algorithm='HS256')


def decode_token(token: str) -> dict | None:
    """Decode and validate a JWT token. Returns payload or None."""
    try:
        payload = jwt.decode(
            token,
            current_app.config['JWT_SECRET_KEY'],
            algorithms=['HS256']
        )
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_current_user_from_token() -> User | None:
    """Extract user from Bearer token in Authorization header."""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(' ', 1)[1]
    payload = decode_token(token)
    if not payload:
        return None
    return db.session.get(User, payload.get('user_id'))


def token_required(f):
    """Decorator: require valid JWT token on a route."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user_from_token()
        if not user:
            return jsonify({'error': 'Authentication required'}), 401
        return f(user, *args, **kwargs)
    return decorated
