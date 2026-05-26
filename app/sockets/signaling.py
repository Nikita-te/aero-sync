from flask_socketio import emit, join_room as sio_join_room, leave_room as sio_leave_room
from flask import request
from app import db, socketio
from app.models.room import Room, RoomParticipant
from datetime import datetime

# In-memory connection registry: { socket_id -> { room_id, peer_id, participant_id, display_name } }
active_connections: dict = {}


@socketio.on('join_meeting')
def handle_join_meeting(data):
    """
    Participant requests to join a meeting room.
    Payload: { room_id, user_id, display_name, peer_id }
    """
    room_id = data.get('room_id')
    user_id = data.get('user_id')
    display_name = (data.get('display_name') or 'Guest').strip()
    peer_id = data.get('peer_id', '')  # PeerJS peer ID for WebRTC mesh
    socket_id = request.sid

    room = Room.query.filter_by(room_id=room_id, is_active=True).first()
    if not room:
        emit('error', {'message': 'Room not found or has ended'})
        return

    active_count = RoomParticipant.query.filter_by(room_id=room.id).count()
    if active_count >= room.max_participants:
        emit('error', {'message': 'Room is at full capacity'})
        return

    participant = RoomParticipant(
        room_id=room.id,
        user_id=user_id,
        socket_id=socket_id,
        display_name=display_name,
        audio_enabled=not (room.settings or {}).get('mute_on_entry', False),
        video_enabled=not (room.settings or {}).get('video_off_on_entry', False),
    )

    try:
        db.session.add(participant)
        db.session.commit()
    except Exception:
        db.session.rollback()
        emit('error', {'message': 'Failed to join room'})
        return

    # Join the SocketIO room
    sio_join_room(room_id)

    # Register in active connections
    active_connections[socket_id] = {
        'room_id': room_id,
        'db_room_id': room.id,
        'user_id': user_id,
        'peer_id': peer_id,
        'participant_id': participant.id,
        'display_name': display_name,
    }

    # Build current participants list (excluding the new joiner)
    current_participants = [
        {
            'socket_id': p.socket_id,
            'display_name': p.display_name,
            'peer_id': active_connections.get(p.socket_id, {}).get('peer_id', ''),
            'audio_enabled': p.audio_enabled,
            'video_enabled': p.video_enabled,
            'screen_sharing': p.screen_sharing,
            'is_presenter': p.is_presenter,
        }
        for p in room.participants if p.socket_id != socket_id
    ]

    # Notify existing participants about new joiner
    emit('user_joined', {
        'socket_id': socket_id,
        'display_name': display_name,
        'peer_id': peer_id,
        'timestamp': datetime.utcnow().isoformat(),
    }, to=room_id, skip_sid=socket_id)

    # Send current state to the new joiner
    emit('participants_list', {'participants': current_participants})
    emit('join_success', {
        'message': 'Joined successfully',
        'room': room.to_dict(),
        'your_socket_id': socket_id,
    })


@socketio.on('leave_meeting')
def handle_leave_meeting(data=None):
    """
    Participant explicitly leaves the meeting.
    Payload: {} (socket_id inferred from request.sid)
    """
    socket_id = request.sid
    conn = active_connections.pop(socket_id, None)
    if not conn:
        return

    room_id = conn['room_id']
    participant_id = conn['participant_id']

    # Remove from DB
    participant = db.session.get(RoomParticipant, participant_id)
    if participant:
        db.session.delete(participant)
        db.session.commit()

    sio_leave_room(room_id)

    emit('user_left', {
        'socket_id': socket_id,
        'display_name': conn['display_name'],
    }, to=room_id)


@socketio.on('disconnect')
def handle_disconnect():
    """Handle unexpected disconnection — same as leaving."""
    handle_leave_meeting()


# ── WebRTC Signaling ──────────────────────────────────────────────────────────

@socketio.on('webrtc_offer')
def handle_webrtc_offer(data):
    """Forward WebRTC SDP offer to target peer."""
    emit('webrtc_offer', {
        'from_socket_id': request.sid,
        'offer': data.get('offer'),
        'peer_id': data.get('peer_id'),
    }, to=data.get('target_socket_id'))


@socketio.on('webrtc_answer')
def handle_webrtc_answer(data):
    """Forward WebRTC SDP answer to originating peer."""
    emit('webrtc_answer', {
        'from_socket_id': request.sid,
        'answer': data.get('answer'),
    }, to=data.get('target_socket_id'))


@socketio.on('webrtc_ice_candidate')
def handle_ice_candidate(data):
    """Forward ICE candidate to target peer."""
    emit('webrtc_ice_candidate', {
        'from_socket_id': request.sid,
        'candidate': data.get('candidate'),
    }, to=data.get('target_socket_id'))


# ── Media State Toggles ───────────────────────────────────────────────────────

@socketio.on('toggle_audio')
def handle_toggle_audio(data):
    """Broadcast audio mute/unmute state change."""
    socket_id = request.sid
    conn = active_connections.get(socket_id)
    if not conn:
        return

    enabled = bool(data.get('enabled', False))
    participant = db.session.get(RoomParticipant, conn['participant_id'])
    if participant:
        participant.audio_enabled = enabled
        db.session.commit()

    emit('user_audio_toggled', {
        'socket_id': socket_id,
        'enabled': enabled,
    }, to=conn['room_id'])


@socketio.on('toggle_video')
def handle_toggle_video(data):
    """Broadcast video on/off state change."""
    socket_id = request.sid
    conn = active_connections.get(socket_id)
    if not conn:
        return

    enabled = bool(data.get('enabled', False))
    participant = db.session.get(RoomParticipant, conn['participant_id'])
    if participant:
        participant.video_enabled = enabled
        db.session.commit()

    emit('user_video_toggled', {
        'socket_id': socket_id,
        'enabled': enabled,
    }, to=conn['room_id'])


@socketio.on('screen_share_started')
def handle_screen_share_started(data):
    """Notify room that a participant started sharing their screen."""
    socket_id = request.sid
    conn = active_connections.get(socket_id)
    if not conn:
        return

    participant = db.session.get(RoomParticipant, conn['participant_id'])
    if participant:
        participant.screen_sharing = True
        db.session.commit()

    emit('user_screen_share_started', {
        'socket_id': socket_id,
        'display_name': conn['display_name'],
    }, to=conn['room_id'])


@socketio.on('screen_share_stopped')
def handle_screen_share_stopped(data=None):
    """Notify room that screen sharing has stopped."""
    socket_id = request.sid
    conn = active_connections.get(socket_id)
    if not conn:
        return

    participant = db.session.get(RoomParticipant, conn['participant_id'])
    if participant:
        participant.screen_sharing = False
        db.session.commit()

    emit('user_screen_share_stopped', {
        'socket_id': socket_id,
    }, to=conn['room_id'])


# ── Presentation Sync ─────────────────────────────────────────────────────────

@socketio.on('presentation_start')
def handle_presentation_start(data):
    """Presenter starts a synchronized document presentation."""
    socket_id = request.sid
    conn = active_connections.get(socket_id)
    if not conn:
        return

    participant = db.session.get(RoomParticipant, conn['participant_id'])
    if participant:
        participant.is_presenter = True
        db.session.commit()

    emit('presentation_started', {
        'presenter_socket_id': socket_id,
        'presenter_name': conn['display_name'],
        'document_name': data.get('document_name', 'Presentation'),
        'total_slides': data.get('total_slides', 1),
        'current_slide': 1,
    }, to=conn['room_id'])


@socketio.on('presentation_change_slide')
def handle_presentation_change_slide(data):
    """Sync slide change to all participants."""
    socket_id = request.sid
    conn = active_connections.get(socket_id)
    if not conn:
        return

    emit('presentation_slide_changed', {
        'slide_number': data.get('slide_number', 1),
        'from_socket_id': socket_id,
    }, to=conn['room_id'])


@socketio.on('presentation_end')
def handle_presentation_end(data=None):
    """Presenter ends presentation mode."""
    socket_id = request.sid
    conn = active_connections.get(socket_id)
    if not conn:
        return

    participant = db.session.get(RoomParticipant, conn['participant_id'])
    if participant:
        participant.is_presenter = False
        db.session.commit()

    emit('presentation_ended', {
        'from_socket_id': socket_id,
    }, to=conn['room_id'])


@socketio.on('presentation_slide_image')
def handle_slide_image(data):
    """
    Relay a rendered slide image (JPEG base64) from the presenter to all
    other participants. Viewers cannot render the PDF themselves since they
    don't have the file — this is how they see the presentation.
    Payload: { room_id, slide_number, image_data }
    """
    socket_id = request.sid
    conn = active_connections.get(socket_id)
    if not conn:
        return

    emit('presentation_slide_image', {
        'slide_number': data.get('slide_number'),
        'image_data':   data.get('image_data'),
    }, to=conn['room_id'], skip_sid=socket_id)
