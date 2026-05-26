def register_socket_handlers(socketio):
    """
    Import socket event handler modules so their @socketio.on decorators fire.
    Must be called after socketio is bound to the app.
    """
    from . import signaling   # noqa: F401 — side-effect imports
    from . import whiteboard  # noqa: F401
    from . import chat        # noqa: F401
