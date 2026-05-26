# 🛰️ AeroSync — Video Conferencing Platform

Aerospace-inspired real-time video conferencing with:
- **WebRTC** mesh networking for HD video/audio
- **Socket.IO** for real-time signaling, chat, and whiteboard sync
- **Collaborative Whiteboard** with multi-user drawing
- **Screen Sharing** with track replacement
- **Synchronized Presentation** (PDF viewer, slide sync)
- **Encrypted Chat** with typing indicators and reactions
- Flask + Python backend, vanilla HTML/CSS/JS frontend

---

## 🚀 Quick Start

### 1. Clone & set up the environment

```bash
cd aerosync
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set your SECRET_KEY and JWT_SECRET_KEY
```

### 3. Run the server

```bash
python run.py
```

Open **http://localhost:5000** in your browser.

---

## 📁 Project Structure

```
aerosync/
├── app/
│   ├── __init__.py          # Flask app factory
│   ├── config.py            # Configuration (dev/prod)
│   ├── models/
│   │   ├── user.py          # User model (auth)
│   │   ├── room.py          # Room + Participant models
│   │   └── message.py       # Chat message model
│   ├── routes/
│   │   ├── auth.py          # /auth/* — register, login, logout
│   │   ├── rooms.py         # /rooms/* — CRUD, join, end
│   │   ├── api.py           # /api/* — health, config
│   │   └── frontend.py      # SPA serving
│   ├── sockets/
│   │   ├── signaling.py     # WebRTC offer/answer/ICE, media states
│   │   ├── whiteboard.py    # Whiteboard sync events
│   │   └── chat.py          # Chat messages, typing, reactions
│   ├── utils/
│   │   ├── auth_helpers.py  # JWT generation + token_required decorator
│   │   └── room_generator.py # Secure room ID + name generation
│   └── static/
│       ├── index.html       # SPA entry point
│       ├── css/
│       │   ├── main.css     # Design system + all major page styles
│       │   └── components.css # Component-level styles
│       └── js/
│           └── app.js       # Complete frontend: auth, dashboard, meeting
├── run.py                   # Application entry point
├── requirements.txt
└── .env.example
```

---

## 🔑 API Endpoints

### Auth
| Method | Route             | Description        |
|--------|-------------------|--------------------|
| POST   | /auth/register    | Create account     |
| POST   | /auth/login       | Login → JWT token  |
| POST   | /auth/logout      | End session        |
| GET    | /auth/verify      | Validate JWT       |
| PUT    | /auth/profile     | Update display name|

### Rooms
| Method | Route                    | Description            |
|--------|--------------------------|------------------------|
| POST   | /rooms/create            | Create room            |
| GET    | /rooms/<room_id>         | Get room info          |
| POST   | /rooms/<room_id>/join    | Validate join          |
| POST   | /rooms/<room_id>/end     | End room (host only)   |
| GET    | /rooms/my-rooms          | List your rooms        |
| GET    | /rooms/<room_id>/messages| Chat history           |

### System
| Method | Route        | Description       |
|--------|--------------|-------------------|
| GET    | /api/health  | Health check      |
| GET    | /api/config  | ICE server config |

---

## 📡 Socket.IO Events

### Client → Server
| Event                       | Payload                                              |
|-----------------------------|------------------------------------------------------|
| `join_meeting`              | `{room_id, user_id, display_name, peer_id}`          |
| `leave_meeting`             | `{}`                                                 |
| `webrtc_offer`              | `{target_socket_id, offer, peer_id}`                 |
| `webrtc_answer`             | `{target_socket_id, answer}`                         |
| `webrtc_ice_candidate`      | `{target_socket_id, candidate}`                      |
| `toggle_audio`              | `{enabled, room_id}`                                 |
| `toggle_video`              | `{enabled, room_id}`                                 |
| `screen_share_started`      | `{room_id}`                                          |
| `screen_share_stopped`      | `{room_id}`                                          |
| `send_message`              | `{room_id, message, user_id, display_name}`          |
| `typing_indicator`          | `{room_id, is_typing, display_name}`                 |
| `reaction`                  | `{room_id, emoji, display_name}`                     |
| `whiteboard_draw`           | `{room_id, stroke_data}`                             |
| `whiteboard_erase`          | `{room_id, erase_data}`                              |
| `whiteboard_clear`          | `{room_id}`                                          |
| `whiteboard_undo`           | `{room_id}`                                          |
| `presentation_start`        | `{room_id, document_name, total_slides}`             |
| `presentation_change_slide` | `{room_id, slide_number}`                            |
| `presentation_end`          | `{room_id}`                                          |

### Server → Client
| Event                       | Payload                                              |
|-----------------------------|------------------------------------------------------|
| `join_success`              | `{room, your_socket_id}`                             |
| `participants_list`         | `{participants: [...]}`                              |
| `user_joined`               | `{socket_id, display_name, peer_id, timestamp}`      |
| `user_left`                 | `{socket_id, display_name}`                          |
| `webrtc_offer`              | forwarded offer                                      |
| `webrtc_answer`             | forwarded answer                                     |
| `webrtc_ice_candidate`      | forwarded ICE                                        |
| `user_audio_toggled`        | `{socket_id, enabled}`                               |
| `user_video_toggled`        | `{socket_id, enabled}`                               |
| `new_message`               | `{message_id, from_socket_id, display_name, message}`|
| `user_typing`               | `{socket_id, display_name, is_typing}`               |
| `user_reaction`             | `{socket_id, display_name, emoji}`                   |
| `whiteboard_update`         | `{stroke_data, from_socket_id}`                      |
| `whiteboard_cleared`        | `{from_socket_id}`                                   |
| `whiteboard_undo`           | `{from_socket_id}`                                   |
| `presentation_started`      | `{presenter_socket_id, total_slides, document_name}` |
| `presentation_slide_changed`| `{slide_number}`                                     |
| `presentation_ended`        | `{from_socket_id}`                                   |

---

## ⌨️ Keyboard Shortcuts (In Meeting)

| Key | Action          |
|-----|-----------------|
| `M` | Toggle mic      |
| `V` | Toggle camera   |
| `C` | Toggle chat     |
| `Esc`| Close panels   |

---

## 🏭 Production Deployment

### Required environment variables:

```bash
FLASK_ENV=production
SECRET_KEY=<strong-random-secret>
JWT_SECRET_KEY=<strong-jwt-secret>
DATABASE_URL=postgresql://user:pass@host:5432/aerosync
REDIS_URL=redis://localhost:6379/0
CORS_ORIGINS=https://yourdomain.com
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=turn:your-turn.example.com:3478
TURN_USERNAME=<username>
TURN_CREDENTIAL=<password>
```

### Run with Gunicorn + eventlet:

```bash
gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:5000 "run:app"
```

> **Note:** Use `-w 1` with eventlet; Socket.IO requires sticky sessions if scaling horizontally (use Redis pub/sub).

---

## 🔒 Security Notes

- Passwords hashed with bcrypt (12 rounds)
- JWT tokens expire in 24 hours
- Chat messages are HTML-escaped server-side (XSS prevention)
- Room IDs are cryptographically random (12 chars)
- WebRTC uses DTLS-SRTP encryption by default
- Rate limiting recommended on all auth endpoints in production

---

## 📦 Dependencies

```
Flask 3.0          — Web framework
Flask-SocketIO 5   — Real-time WebSocket layer
Flask-SQLAlchemy   — ORM
Flask-Login        — Session management
Flask-Bcrypt       — Password hashing
Flask-CORS         — Cross-origin resource sharing
PyJWT 2.8          — JSON Web Tokens
eventlet           — Async mode for SocketIO
python-dotenv      — Environment variable loading
```

Frontend uses no build tools — plain HTML/CSS/JS with:
- **Socket.IO 4.7** (CDN)
- **PDF.js 3.11** (CDN) for presentation mode
- **WebRTC** browser APIs (built-in)
