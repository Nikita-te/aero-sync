from app import db, bcrypt
from datetime import datetime
import secrets
import string


class Room(db.Model):
    __tablename__ = 'rooms'

    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    creator_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    scheduled_start = db.Column(db.DateTime, nullable=True)
    max_participants = db.Column(db.Integer, default=50)
    require_password = db.Column(db.Boolean, default=False)
    password_hash = db.Column(db.String(255), nullable=True)

    # Room feature settings stored as JSON
    settings = db.Column(db.JSON, default=lambda: {
        'allow_screen_share': True,
        'allow_whiteboard': True,
        'allow_chat': True,
        'enable_recording': False,
        'mute_on_entry': False,
        'video_off_on_entry': False,
    })

    # Relationships
    creator = db.relationship('User', back_populates='rooms_created')
    participants = db.relationship(
        'RoomParticipant', back_populates='room',
        cascade='all, delete-orphan'
    )
    messages = db.relationship(
        'ChatMessage', back_populates='room',
        cascade='all, delete-orphan', lazy='dynamic'
    )

    @staticmethod
    def generate_room_id(length: int = 12) -> str:
        """Generate a cryptographically secure random room ID."""
        alphabet = string.ascii_letters + string.digits
        return ''.join(secrets.choice(alphabet) for _ in range(length))

    def set_password(self, password: str):
        self.password_hash = bcrypt.generate_password_hash(password).decode('utf-8')

    def check_password(self, password: str) -> bool:
        if not self.password_hash:
            return False
        return bcrypt.check_password_hash(self.password_hash, password)

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'room_id': self.room_id,
            'name': self.name,
            'creator_id': self.creator_id,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'scheduled_start': self.scheduled_start.isoformat() if self.scheduled_start else None,
            'max_participants': self.max_participants,
            'require_password': self.require_password,
            'participant_count': len(self.participants),
            'settings': self.settings or {},
        }

    def __repr__(self):
        return f'<Room {self.room_id}: {self.name}>'


class RoomParticipant(db.Model):
    __tablename__ = 'room_participants'

    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('rooms.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True, index=True)
    socket_id = db.Column(db.String(100), unique=True)
    display_name = db.Column(db.String(100))
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_presenter = db.Column(db.Boolean, default=False)

    # Live media states
    audio_enabled = db.Column(db.Boolean, default=True)
    video_enabled = db.Column(db.Boolean, default=True)
    screen_sharing = db.Column(db.Boolean, default=False)

    # Relationships
    room = db.relationship('Room', back_populates='participants')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'socket_id': self.socket_id,
            'display_name': self.display_name,
            'audio_enabled': self.audio_enabled,
            'video_enabled': self.video_enabled,
            'screen_sharing': self.screen_sharing,
            'is_presenter': self.is_presenter,
            'joined_at': self.joined_at.isoformat(),
        }

    def __repr__(self):
        return f'<Participant {self.display_name} in room {self.room_id}>'
