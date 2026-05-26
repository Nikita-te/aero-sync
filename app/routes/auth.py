from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from app import db
from app.models.user import User
from app.utils.auth_helpers import generate_token, token_required
from datetime import datetime

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def register():
    """
    Register a new user.
    Body: { username, email, password, display_name? }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'JSON body required'}), 400

    username = (data.get('username') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    display_name = (data.get('display_name') or username).strip()

    if not username or not email or not password:
        return jsonify({'error': 'username, email and password are required'}), 400

    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already taken'}), 409

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 409

    user = User(username=username, email=email, display_name=display_name)
    user.set_password(password)

    try:
        db.session.add(user)
        db.session.commit()
        token = generate_token(user.id)
        return jsonify({
            'message': 'Registration successful',
            'user': user.to_dict(),
            'token': token,
        }), 201
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Registration failed — please try again'}), 500


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Login with username/email + password.
    Body: { username OR email, password }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'JSON body required'}), 400

    identifier = (data.get('username') or data.get('email') or '').strip()
    password = data.get('password') or ''

    if not identifier or not password:
        return jsonify({'error': 'Credentials required'}), 400

    user = User.query.filter(
        (User.username == identifier) | (User.email == identifier.lower())
    ).first()

    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401

    user.last_seen = datetime.utcnow()
    db.session.commit()

    login_user(user)
    token = generate_token(user.id)

    return jsonify({
        'message': 'Login successful',
        'user': user.to_dict(),
        'token': token,
    }), 200


@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout():
    """Logout current session."""
    logout_user()
    return jsonify({'message': 'Logged out successfully'}), 200


@auth_bp.route('/verify', methods=['GET'])
@token_required
def verify_token(current_user):
    """Verify JWT token and return current user data."""
    return jsonify({
        'valid': True,
        'user': current_user.to_dict(),
    }), 200


@auth_bp.route('/profile', methods=['PUT'])
@token_required
def update_profile(current_user):
    """
    Update user profile.
    Body: { display_name?, avatar_url? }
    """
    data = request.get_json(silent=True) or {}

    if 'display_name' in data:
        current_user.display_name = data['display_name'].strip()
    if 'avatar_url' in data:
        current_user.avatar_url = data['avatar_url'].strip()

    try:
        db.session.commit()
        return jsonify({'message': 'Profile updated', 'user': current_user.to_dict()}), 200
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Update failed'}), 500
