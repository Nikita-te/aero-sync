from flask_socketio import emit
from flask import request
from app import socketio


@socketio.on('whiteboard_draw')
def handle_whiteboard_draw(data):
    """
    Broadcast a drawing stroke to other room participants.
    Payload: {
        room_id: str,
        stroke_data: {
            type: 'draw',
            points: [{x, y}, ...],
            color: '#FFFFFF',
            width: 4,
            tool: 'pen' | 'marker' | 'eraser'
        }
    }
    """
    room_id = data.get('room_id')
    stroke_data = data.get('stroke_data')

    if not room_id or not stroke_data:
        return

    emit('whiteboard_update', {
        'stroke_data': stroke_data,
        'from_socket_id': request.sid,
    }, to=room_id, skip_sid=request.sid)


@socketio.on('whiteboard_erase')
def handle_whiteboard_erase(data):
    """
    Broadcast an erase action.
    Payload: { room_id, erase_data: { x, y, radius } }
    """
    room_id = data.get('room_id')
    erase_data = data.get('erase_data')

    if not room_id:
        return

    emit('whiteboard_erase', {
        'erase_data': erase_data,
        'from_socket_id': request.sid,
    }, to=room_id, skip_sid=request.sid)


@socketio.on('whiteboard_clear')
def handle_whiteboard_clear(data):
    """
    Clear the entire whiteboard for all participants.
    Payload: { room_id }
    """
    room_id = data.get('room_id')
    if not room_id:
        return

    emit('whiteboard_cleared', {
        'from_socket_id': request.sid,
    }, to=room_id)


@socketio.on('whiteboard_undo')
def handle_whiteboard_undo(data):
    """
    Broadcast undo action to other participants.
    Payload: { room_id }
    """
    room_id = data.get('room_id')
    if not room_id:
        return

    emit('whiteboard_undo', {
        'from_socket_id': request.sid,
    }, to=room_id, skip_sid=request.sid)


@socketio.on('whiteboard_add_image')
def handle_whiteboard_add_image(data):
    """
    Broadcast image addition to whiteboard.
    Payload: { room_id, image_data (base64), position: {x, y}, size: {w, h} }
    """
    room_id = data.get('room_id')
    if not room_id:
        return

    emit('whiteboard_image_added', {
        'image_data': data.get('image_data'),
        'position': data.get('position'),
        'size': data.get('size'),
        'from_socket_id': request.sid,
    }, to=room_id, skip_sid=request.sid)


@socketio.on('whiteboard_shape')
def handle_whiteboard_shape(data):
    """
    Broadcast a shape (rectangle, circle, line) to other participants.
    Payload: { room_id, shape_data: { type, x, y, w, h, color, lineWidth } }
    """
    room_id = data.get('room_id')
    if not room_id:
        return

    emit('whiteboard_shape', {
        'shape_data': data.get('shape_data'),
        'from_socket_id': request.sid,
    }, to=room_id, skip_sid=request.sid)
