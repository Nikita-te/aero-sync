from flask import Blueprint, request, jsonify
from app import db
from app.models.room import Room, RoomParticipant
from app.models.message import ChatMessage
from app.utils.auth_helpers import token_required
from app.utils.room_generator import generate_room_id, generate_meeting_name

rooms_bp = Blueprint('rooms', __name__)


@rooms_bp.route('/create', methods=['POST'])
@token_required
def create_room(current_user):
    """
    Create a new meeting room.
    Body: { name?, scheduled_start?, max_participants?, settings?, require_password?, password? }
    """
    data = request.get_json(silent=True) or {}

    room_name = (data.get('name') or '').strip() or generate_meeting_name()

    # Generate a unique room ID
    room_id = generate_room_id()
    while Room.query.filter_by(room_id=room_id).first():
        room_id = generate_room_id()

    room = Room(
        room_id=room_id,
        name=room_name,
        creator_id=current_user.id,
        max_participants=int(data.get('max_participants', 50)),
        scheduled_start=data.get('scheduled_start'),
        require_password=bool(data.get('require_password', False)),
        settings=data.get('settings') or {
            'allow_screen_share': True,
            'allow_whiteboard': True,
            'allow_chat': True,
            'enable_recording': False,
            'mute_on_entry': False,
            'video_off_on_entry': False,
        },
    )

    if room.require_password and data.get('password'):
        room.set_password(data['password'])

    try:
        db.session.add(room)
        db.session.commit()
        return jsonify({
            'message': 'Room created',
            'room': room.to_dict(),
            'join_url': f'/room/{room_id}',
        }), 201
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Failed to create room'}), 500


@rooms_bp.route('/<room_id>', methods=['GET'])
def get_room(room_id):
    """Get public room details."""
    room = Room.query.filter_by(room_id=room_id, is_active=True).first()
    if not room:
        return jsonify({'error': 'Room not found or has ended'}), 404
    return jsonify({'room': room.to_dict()}), 200


@rooms_bp.route('/<room_id>/join', methods=['POST'])
@token_required
def join_room(current_user, room_id):
    """
    Validate and prepare to join a room.
    Body: { password? }
    """
    room = Room.query.filter_by(room_id=room_id, is_active=True).first()
    if not room:
        return jsonify({'error': 'Room not found or has ended'}), 404

    active_count = RoomParticipant.query.filter_by(room_id=room.id).count()
    if active_count >= room.max_participants:
        return jsonify({'error': 'Room is at capacity'}), 403

    if room.require_password:
        data = request.get_json(silent=True) or {}
        if not room.check_password(data.get('password', '')):
            return jsonify({'error': 'Incorrect room password'}), 403

    return jsonify({
        'message': 'Ready to join',
        'room': room.to_dict(),
    }), 200


@rooms_bp.route('/<room_id>/end', methods=['POST'])
@token_required
def end_room(current_user, room_id):
    """End a meeting room (creator only)."""
    room = Room.query.filter_by(room_id=room_id).first()
    if not room:
        return jsonify({'error': 'Room not found'}), 404
    if room.creator_id != current_user.id:
        return jsonify({'error': 'Only the host can end the meeting'}), 403

    room.is_active = False
    # Remove all participants
    RoomParticipant.query.filter_by(room_id=room.id).delete()
    db.session.commit()

    return jsonify({'message': 'Meeting ended'}), 200


@rooms_bp.route('/my-rooms', methods=['GET'])
@token_required
def get_user_rooms(current_user):
    """Get all rooms created by the current user."""
    rooms = Room.query.filter_by(creator_id=current_user.id).order_by(
        Room.created_at.desc()
    ).all()
    return jsonify({'rooms': [r.to_dict() for r in rooms]}), 200


@rooms_bp.route('/<room_id>/messages', methods=['GET'])
@token_required
def get_room_messages(current_user, room_id):
    """Get recent chat history for a room (last 100 messages)."""
    room = Room.query.filter_by(room_id=room_id).first()
    if not room:
        return jsonify({'error': 'Room not found'}), 404

    messages = (
        ChatMessage.query
        .filter_by(room_id=room.id)
        .order_by(ChatMessage.timestamp.desc())
        .limit(100)
        .all()
    )
    return jsonify({
        'messages': [m.to_dict() for m in reversed(messages)]
    }), 200
