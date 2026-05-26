from flask import Blueprint, jsonify, current_app

api_bp = Blueprint('api', __name__)


@api_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'service': 'AeroSync',
        'version': '1.0.0',
    }), 200


@api_bp.route('/config', methods=['GET'])
def get_client_config():
    """Return non-secret configuration needed by the frontend (e.g. STUN/TURN URLs)."""
    import os
    return jsonify({
        'stun_server': os.environ.get('STUN_SERVER', 'stun:stun.l.google.com:19302'),
        'turn_server': os.environ.get('TURN_SERVER', ''),
        'turn_username': os.environ.get('TURN_USERNAME', ''),
        'turn_credential': os.environ.get('TURN_CREDENTIAL', ''),
        'max_room_participants': current_app.config.get('MAX_ROOM_PARTICIPANTS', 50),
    }), 200
