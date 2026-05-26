import secrets
import string


def generate_room_id(length: int = 12) -> str:
    """Generate a cryptographically secure, URL-safe random room ID."""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def generate_meeting_name() -> str:
    """Generate a human-friendly default meeting name."""
    adjectives = [
        'Orbital', 'Stellar', 'Cosmic', 'Solar', 'Lunar', 'Polar',
        'Arctic', 'Nimbus', 'Apex', 'Zenith', 'Fusion', 'Vector',
        'Quantum', 'Photon', 'Nebula', 'Aurora', 'Pulsar', 'Vortex',
    ]
    nouns = [
        'Meeting', 'Session', 'Briefing', 'Sync', 'Huddle', 'Launch',
        'Summit', 'Review', 'Standup', 'Sprint', 'Workshop', 'Debrief',
    ]
    adj = secrets.choice(adjectives)
    noun = secrets.choice(nouns)
    return f'{adj} {noun}'
