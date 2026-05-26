from flask_socketio import emit
from flask import request
from app import db, socketio
from app.models.message import ChatMessage
from app.models.room import Room
from datetime import datetime
import html


@socketio.on('send_message')
def handle_send_message(data):
    """
    Receive and broadcast a chat message.
    Payload: { room_id, message, user_id, display_name }
    """
    room_id = data.get('room_id')
    raw_message = (data.get('message') or '').strip()
    user_id = data.get('user_id')
    display_name = (data.get('display_name') or 'Guest').strip()

    if not raw_message or not room_id:
        return

    # Sanitize to prevent XSS in stored data
    safe_message = html.escape(raw_message)[:2000]  # cap length

    # Resolve DB room integer ID from string room_id
    room = Room.query.filter_by(room_id=room_id).first()
    if not room:
        emit('error', {'message': 'Room not found'})
        return

    chat_message = ChatMessage(
        room_id=room.id,
        user_id=user_id,
        display_name=display_name,
        message=safe_message,
        timestamp=datetime.utcnow(),
    )

    try:
        db.session.add(chat_message)
        db.session.commit()

        emit('new_message', {
            'message_id': chat_message.id,
            'from_socket_id': request.sid,
            'user_id': user_id,
            'display_name': display_name,
            'message': safe_message,
            'timestamp': chat_message.timestamp.isoformat(),
        }, to=room_id)

    except Exception:
        db.session.rollback()
        emit('error', {'message': 'Failed to send message'})


@socketio.on('typing_indicator')
def handle_typing_indicator(data):
    """
    Broadcast typing indicator to room (excluding sender).
    Payload: { room_id, is_typing, display_name }
    """
    room_id = data.get('room_id')
    if not room_id:
        return

    emit('user_typing', {
        'socket_id': request.sid,
        'display_name': data.get('display_name', 'Someone'),
        'is_typing': bool(data.get('is_typing', False)),
    }, to=room_id, skip_sid=request.sid)


@socketio.on('reaction')
def handle_reaction(data):
    """
    Broadcast an emoji reaction.
    Payload: { room_id, emoji, display_name }
    """
    room_id = data.get('room_id')
    if not room_id:
        return

    emit('user_reaction', {
        'socket_id': request.sid,
        'display_name': data.get('display_name', 'Someone'),
        'emoji': data.get('emoji', '👍'),
    }, to=room_id)
