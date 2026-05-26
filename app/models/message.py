from app import db
from datetime import datetime


class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'

    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('rooms.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    display_name = db.Column(db.String(100), nullable=False, default='Guest')
    message = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    message_type = db.Column(db.String(20), default='text')  # text | system | file

    # Relationships
    room = db.relationship('Room', back_populates='messages')

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'room_id': self.room_id,
            'user_id': self.user_id,
            'display_name': self.display_name,
            'message': self.message,
            'timestamp': self.timestamp.isoformat(),
            'message_type': self.message_type,
        }

    def __repr__(self):
        return f'<ChatMessage {self.id} by {self.display_name}>'
