/* ═══════════════════════════════════════════════
   AEROSYNC — MAIN APPLICATION JAVASCRIPT
   Auth · Dashboard · Meeting Room · WebRTC
   Whiteboard · Chat · Presentation · Socket.IO
════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   GLOBAL STATE
───────────────────────────────────────────── */
const State = {
  user: null,
  token: null,
  currentRoom: null,
  socket: null,
  localStream: null,
  screenStream: null,
  peers: {},            // { socketId: RTCPeerConnection }
  participants: {},     // { socketId: { displayName, audioEnabled, videoEnabled } }
  micEnabled: true,
  cameraEnabled: true,
  screenSharing: false,
  currentView: 'spotlight',    // 'spotlight' | 'gallery'
  activePanel: null,           // 'chat' | 'whiteboard' | 'presentation' | 'participants'
  chatUnread: 0,
  chatOpen: false,
  participantsOpen: false,
  // Whiteboard
  wb: {
    tool: 'pen',
    color: '#FFFFFF',
    size: 4,
    drawing: false,
    lastX: 0, lastY: 0,
    history: [],       // array of ImageData snapshots
    ctx: null,
  },
  // Presentation
  pres: {
    pdfDoc: null,
    currentSlide: 1,
    totalSlides: 1,
    isPresenting: false,
    zoomFactor: 1.0,   // multiplier on top of fit-to-screen scale
  },
  // Typing debounce
  typingTimeout: null,
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/* ─────────────────────────────────────────────
   UTILITY HELPERS
───────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const show = (id) => { const el = $(id); if (el) el.classList.remove('hidden'); };
const hide = (id) => { const el = $(id); if (el) el.classList.add('hidden'); };

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.classList.add('hidden');
  });
  const p = $(pageId);
  if (p) { p.classList.remove('hidden'); p.classList.add('active'); }
}

function toast(msg, type = 'info', duration = 3000) {
  const container = $('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

/* ─────────────────────────────────────────────
   STARFIELD GENERATOR
───────────────────────────────────────────── */
function generateStars() {
  const container = $('stars');
  if (!container) return;
  for (let i = 0; i < 140; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size = Math.random() * 2.5 + 0.5;
    star.style.cssText = `
      left: ${Math.random() * 100}%;
      top:  ${Math.random() * 100}%;
      width:  ${size}px;
      height: ${size}px;
      --dur:   ${2 + Math.random() * 4}s;
      --delay: ${-Math.random() * 5}s;
    `;
    container.appendChild(star);
  }
}

/* ─────────────────────────────────────────────
   API HELPER
───────────────────────────────────────────── */
async function api(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (State.token) headers['Authorization'] = `Bearer ${State.token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* ─────────────────────────────────────────────
   AUTH — MODAL
───────────────────────────────────────────── */
function showAuth(mode = 'login') {
  show('modal-auth');
  switchAuth(mode);
}

function closeAuth() {
  hide('modal-auth');
}

function closeAuthIfBg(e) {
  if (e.target.id === 'modal-auth') closeAuth();
}

function switchAuth(mode) {
  if (mode === 'login') {
    show('form-login'); hide('form-register');
  } else {
    show('form-register'); hide('form-login');
  }
  hide('login-error');
  hide('register-error');
}

function setAuthLoading(form, loading) {
  if (form === 'login') {
    $('login-btn-text').textContent = loading ? 'Launching…' : 'Launch Session';
    loading ? show('login-spinner') : hide('login-spinner');
  } else {
    $('reg-btn-text').textContent = loading ? 'Creating…' : 'Create Account';
    loading ? show('reg-spinner') : hide('reg-spinner');
  }
}

async function handleLogin() {
  const identifier = $('login-identifier').value.trim();
  const password   = $('login-password').value;
  hide('login-error');

  if (!identifier || !password) {
    showFormError('login-error', 'Please fill in all fields.');
    return;
  }

  setAuthLoading('login', true);
  const { ok, data } = await api('POST', '/auth/login', { username: identifier, password });
  setAuthLoading('login', false);

  if (!ok) {
    showFormError('login-error', data.error || 'Login failed.');
    return;
  }

  onLoginSuccess(data);
}

async function handleRegister() {
  const displayName = $('reg-display').value.trim();
  const username    = $('reg-username').value.trim();
  const email       = $('reg-email').value.trim();
  const password    = $('reg-password').value;
  hide('register-error');

  if (!username || !email || !password) {
    showFormError('register-error', 'Username, email, and password are required.');
    return;
  }

  setAuthLoading('register', true);
  const { ok, data } = await api('POST', '/auth/register', { display_name: displayName, username, email, password });
  setAuthLoading('register', false);

  if (!ok) {
    showFormError('register-error', data.error || 'Registration failed.');
    return;
  }

  onLoginSuccess(data);
}

function showFormError(elId, msg) {
  const el = $(elId);
  if (!el) return;
  el.textContent = msg;
  show(elId);
}

function onLoginSuccess(data) {
  State.user  = data.user;
  State.token = data.token;
  localStorage.setItem('aerosync_token', data.token);
  closeAuth();
  loadDashboard();
}

async function handleLogout() {
  await api('POST', '/auth/logout');
  State.user  = null;
  State.token = null;
  localStorage.removeItem('aerosync_token');
  showPage('page-landing');
}

/* ─────────────────────────────────────────────
   SESSION RESTORE
───────────────────────────────────────────── */
async function tryRestoreSession() {
  const token = localStorage.getItem('aerosync_token');
  if (!token) return false;
  State.token = token;
  const { ok, data } = await api('GET', '/auth/verify');
  if (!ok) { localStorage.removeItem('aerosync_token'); State.token = null; return false; }
  State.user  = data.user;
  State.token = token;
  return true;
}

/* ─────────────────────────────────────────────
   DASHBOARD
───────────────────────────────────────────── */
function loadDashboard() {
  showPage('page-dashboard');
  const user = State.user;
  if (!user) return;

  // Update sidebar user info
  $('dash-username').textContent  = user.display_name || user.username;
  $('dash-greeting').textContent  = user.display_name || user.username;
  $('dash-avatar').textContent    = initials(user.display_name || user.username);

  setDashTab('home');
  loadUserRooms();
}

function setDashTab(tab) {
  document.querySelectorAll('.dash-tab').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  show(`tab-${tab}`);
  const btn = document.querySelector(`[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');

  // Pre-fill display name in join form
  if (tab === 'join' && State.user) {
    const nameEl = $('join-display-name');
    if (nameEl && !nameEl.value) {
      nameEl.value = State.user.display_name || State.user.username;
    }
  }
}

async function loadUserRooms() {
  const { ok, data } = await api('GET', '/rooms/my-rooms');
  if (!ok) return;

  const list = $('rooms-list');
  if (!list) return;
  list.innerHTML = '';

  if (!data.rooms || data.rooms.length === 0) {
    list.innerHTML = `
      <div class="rooms-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>
        </svg>
        <p>No rooms yet — create your first meeting!</p>
      </div>`;
    return;
  }

  data.rooms.forEach(room => {
    const card = document.createElement('div');
    card.className = 'room-card';
    card.innerHTML = `
      <div class="room-card-header">
        <span class="room-card-name">${escHtml(room.name)}</span>
        <span class="room-badge ${room.is_active ? 'active' : 'ended'}">
          ${room.is_active ? 'Active' : 'Ended'}
        </span>
      </div>
      <div class="room-card-meta">👥 Up to ${room.max_participants} participants</div>
      <div class="room-card-id">🔑 ${room.room_id}</div>
      <div class="room-card-actions">
        ${room.is_active
          ? `<button class="btn-primary btn-sm" onclick="quickJoin('${room.room_id}')">Join</button>
             <button class="btn-ghost btn-sm" onclick="copyToClipboard('${room.room_id}')">Copy ID</button>`
          : `<button class="btn-ghost btn-sm" onclick="copyToClipboard('${room.room_id}')">Copy ID</button>`
        }
      </div>`;
    list.appendChild(card);
  });
}

/* ─────────────────────────────────────────────
   CREATE ROOM MODAL
───────────────────────────────────────────── */
function openCreateRoom() {
  show('modal-create-room');
  const nameEl = $('create-room-name');
  if (nameEl) nameEl.focus();
}

function closeCreateRoom() {
  hide('modal-create-room');
}

function closeCreateRoomIfBg(e) {
  if (e.target.id === 'modal-create-room') closeCreateRoom();
}

async function handleCreateRoom() {
  const name       = $('create-room-name').value.trim();
  const maxPart    = parseInt($('create-room-max').value) || 50;
  const muteEntry  = $('create-mute-entry').checked;
  const videoOff   = $('create-video-off').checked;
  hide('create-error');

  const { ok, data } = await api('POST', '/rooms/create', {
    name: name || undefined,
    max_participants: maxPart,
    settings: {
      allow_screen_share: true,
      allow_whiteboard: true,
      allow_chat: true,
      mute_on_entry: muteEntry,
      video_off_on_entry: videoOff,
    },
  });

  if (!ok) {
    showFormError('create-error', data.error || 'Failed to create room.');
    return;
  }

  closeCreateRoom();
  toast(`Room "${data.room.name}" created!`, 'success');
  loadUserRooms();
  // Auto-enter the new room
  enterMeeting(data.room);
}

/* ─────────────────────────────────────────────
   JOIN MEETING
───────────────────────────────────────────── */
async function handleJoin() {
  const roomId      = $('join-room-id').value.trim();
  const displayName = $('join-display-name').value.trim();
  hide('join-error');

  if (!roomId) { showFormError('join-error', 'Please enter a Room ID.'); return; }
  if (!displayName) { showFormError('join-error', 'Please enter a display name.'); return; }

  const { ok, data } = await api('POST', `/rooms/${roomId}/join`, {});
  if (!ok) { showFormError('join-error', data.error || 'Cannot join room.'); return; }

  enterMeeting(data.room, displayName);
}

function quickJoin(roomId) {
  const displayName = State.user ? (State.user.display_name || State.user.username) : 'Guest';
  api('POST', `/rooms/${roomId}/join`, {}).then(({ ok, data }) => {
    if (!ok) { toast(data.error || 'Cannot join', 'error'); return; }
    enterMeeting(data.room, displayName);
  });
}

/* ─────────────────────────────────────────────
   MEETING ROOM SETUP
───────────────────────────────────────────── */
async function enterMeeting(room, displayNameOverride = null) {
  State.currentRoom = room;
  const displayName = displayNameOverride
    || (State.user ? (State.user.display_name || State.user.username) : 'Guest');

  // Update UI header
  $('meeting-room-name').textContent     = room.name;
  $('meeting-room-id-display').textContent = room.room_id;

  // Navigate to meeting page
  showPage('page-meeting');

  // Get local media
  await initLocalMedia(room.settings);

  // Connect socket
  initSocket(room.room_id, displayName);

  // Set up whiteboard canvas
  initWhiteboard();

  // Fetch ICE config
  fetchIceConfig();
}

async function initLocalMedia(settings = {}) {
  // Always request BOTH video and audio so we have real tracks to enable/disable
  // later when the user clicks the mic or camera button.
  // Requesting `video: false` means no video track is ever created, so toggling
  // the camera on afterwards silently does nothing — that was the original bug.
  try {
    State.localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      // echoCancellation prevents hearing your own voice back with delay.
      // noiseSuppression and autoGainControl improve call quality.
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    State.micEnabled    = !settings.mute_on_entry;
    State.cameraEnabled = !settings.video_off_on_entry;
  } catch (err) {
    // Camera blocked / not present — fall back to audio-only
    console.warn('Video+audio request failed, trying audio-only:', err);
    try {
      State.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      State.micEnabled    = !settings.mute_on_entry;
      State.cameraEnabled = false;
      toast('No camera found — joining with audio only.', 'info');
    } catch (err2) {
      console.warn('Audio-only request also failed:', err2);
      State.localStream   = null;
      State.micEnabled    = false;
      State.cameraEnabled = false;
      toast('Camera/mic access denied. You will join without media.', 'error');
    }
  }

  // Apply initial states
  if (State.localStream) {
    State.localStream.getAudioTracks().forEach(t => t.enabled = State.micEnabled);
    State.localStream.getVideoTracks().forEach(t => t.enabled = State.cameraEnabled);
  }

  updateMicButton();
  updateCameraButton();

  // Render local video tile
  addVideoTile('local', State.user ? State.user.display_name || State.user.username : 'You', true, State.localStream);
  updateParticipantCount();
}

async function fetchIceConfig() {
  const { ok, data } = await api('GET', '/api/config');
  if (!ok) return;
  const servers = [{ urls: data.stun_server || 'stun:stun.l.google.com:19302' }];
  if (data.turn_server) {
    servers.push({
      urls: data.turn_server,
      username: data.turn_username,
      credential: data.turn_credential,
    });
  }
  State.iceServers = servers;
}

/* ─────────────────────────────────────────────
   SOCKET.IO
───────────────────────────────────────────── */
function initSocket(roomId, displayName) {
  if (State.socket) { State.socket.disconnect(); }

  State.socket = io({ transports: ['websocket', 'polling'] });

  State.socket.on('connect', () => {
    console.log('Socket connected:', State.socket.id);
    State.socket.emit('join_meeting', {
      room_id:      roomId,
      user_id:      State.user?.id,
      display_name: displayName,
      peer_id:      State.socket.id,
    });
  });

  State.socket.on('join_success', (data) => {
    toast(`Joined ${data.room.name}`, 'success');
  });

  State.socket.on('participants_list', ({ participants }) => {
    participants.forEach(p => {
      State.participants[p.socket_id] = p;
      addVideoTile(p.socket_id, p.display_name, false, null);
      createPeerConnection(p.socket_id, true);
    });
    updateParticipantCount();
    renderParticipantsList();
  });

  State.socket.on('user_joined', (data) => {
    toast(`${data.display_name} joined`, 'info');
    State.participants[data.socket_id] = { displayName: data.display_name, audioEnabled: true, videoEnabled: true };
    addVideoTile(data.socket_id, data.display_name, false, null);
    createPeerConnection(data.socket_id, false);
    updateParticipantCount();
    renderParticipantsList();
  });

  State.socket.on('user_left', (data) => {
    const p = State.participants[data.socket_id];
    if (p) toast(`${p.displayName || data.display_name} left`, 'info');
    removeVideoTile(data.socket_id);
    closePeerConnection(data.socket_id);
    delete State.participants[data.socket_id];
    updateParticipantCount();
    renderParticipantsList();
  });

  // WebRTC signaling
  State.socket.on('webrtc_offer',         handleOffer);
  State.socket.on('webrtc_answer',        handleAnswer);
  State.socket.on('webrtc_ice_candidate', handleIceCandidate);

  // Media state events
  State.socket.on('user_audio_toggled', ({ socket_id, enabled }) => {
    if (State.participants[socket_id]) State.participants[socket_id].audioEnabled = enabled;
    updateTileAudioIcon(socket_id, enabled);
    renderParticipantsList();
  });

  State.socket.on('user_video_toggled', ({ socket_id, enabled }) => {
    if (State.participants[socket_id]) State.participants[socket_id].videoEnabled = enabled;
    updateTileVideoState(socket_id, enabled);
    renderParticipantsList();
  });

  State.socket.on('user_screen_share_started', ({ socket_id, display_name }) => {
    toast(`${display_name} started screen sharing`, 'info');
    show('screen-share-badge');
  });

  State.socket.on('user_screen_share_stopped', () => {
    hide('screen-share-badge');
  });

  // Chat
  State.socket.on('new_message',  handleIncomingMessage);
  State.socket.on('user_typing',  handleTypingIndicator);
  State.socket.on('user_reaction', handleIncomingReaction);

  // Whiteboard
  State.socket.on('whiteboard_update',    handleWbUpdate);
  State.socket.on('whiteboard_erase',     handleWbErase);
  State.socket.on('whiteboard_cleared',   handleWbCleared);
  State.socket.on('whiteboard_undo',      handleWbUndo);
  State.socket.on('whiteboard_image_added', handleWbImageAdded);
  State.socket.on('whiteboard_shape',     handleWbShape);

  // Presentation
  State.socket.on('presentation_started',       handlePresStarted);
  State.socket.on('presentation_slide_changed', handlePresSlideChanged);
  State.socket.on('presentation_ended',         handlePresEnded);
  State.socket.on('presentation_slide_image',   handlePresSlideImage);

  State.socket.on('error', ({ message }) => toast(message, 'error'));

  State.socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });
}

/* ─────────────────────────────────────────────
   WebRTC PEER CONNECTIONS
───────────────────────────────────────────── */
function createPeerConnection(remoteSocketId, isInitiator) {
  if (State.peers[remoteSocketId]) return State.peers[remoteSocketId];

  const pc = new RTCPeerConnection({ iceServers: State.iceServers });
  State.peers[remoteSocketId] = pc;

  // Add local tracks
  if (State.localStream) {
    State.localStream.getTracks().forEach(track => pc.addTrack(track, State.localStream));
  }

  // ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      State.socket.emit('webrtc_ice_candidate', {
        target_socket_id: remoteSocketId,
        candidate: event.candidate,
      });
    }
  };

  // Receiving remote tracks
  pc.ontrack = (event) => {
    const stream = event.streams[0];
    setVideoTileStream(remoteSocketId, stream);
  };

  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
      closePeerConnection(remoteSocketId);
    }
  };

  if (isInitiator) {
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        State.socket.emit('webrtc_offer', {
          target_socket_id: remoteSocketId,
          offer: pc.localDescription,
          peer_id: State.socket.id,
        });
      } catch (e) { console.error('Offer error:', e); }
    };
  }

  return pc;
}

async function handleOffer({ from_socket_id, offer }) {
  const pc = createPeerConnection(from_socket_id, false);
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    State.socket.emit('webrtc_answer', {
      target_socket_id: from_socket_id,
      answer: pc.localDescription,
    });
  } catch (e) { console.error('Answer error:', e); }
}

async function handleAnswer({ from_socket_id, answer }) {
  const pc = State.peers[from_socket_id];
  if (!pc) return;
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (e) { console.error('setRemoteDescription error:', e); }
}

async function handleIceCandidate({ from_socket_id, candidate }) {
  const pc = State.peers[from_socket_id];
  if (!pc || !candidate) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) { console.error('ICE candidate error:', e); }
}

function closePeerConnection(socketId) {
  const pc = State.peers[socketId];
  if (pc) { pc.close(); delete State.peers[socketId]; }
}

/* ─────────────────────────────────────────────
   VIDEO TILE MANAGEMENT
───────────────────────────────────────────── */
function addVideoTile(socketId, displayName, isLocal, stream) {
  // Add to spotlight thumbnail strip
  addThumbnail(socketId, displayName, isLocal, stream);
  // Add to gallery grid
  addGalleryTile(socketId, displayName, isLocal, stream);
  // Update spotlight if first participant
  if (isLocal && stream) {
    const sv = $('spotlight-video');
    if (sv) {
      sv.srcObject = stream;
      sv.muted = true; // MUST mute local stream — playing your own mic through
                       // speakers is what causes the echo/hearing-yourself bug.
    }
    $('spotlight-name').textContent = displayName;
  }
}

function addThumbnail(socketId, displayName, isLocal, stream) {
  const strip = $('thumbnail-strip');
  if (!strip) return;

  // Remove existing
  const existing = strip.querySelector(`[data-socket="${socketId}"]`);
  if (existing) existing.remove();

  const thumb = document.createElement('div');
  thumb.className = 'video-thumb';
  thumb.setAttribute('data-socket', socketId);
  // Do NOT capture `stream` in the closure — it may be null at creation time
  // for remote participants whose WebRTC stream arrives later.
  // Instead, read the live srcObject from the <video> element at click time.
  thumb.onclick = () => {
    const vid = thumb.querySelector('video');
    const liveStream = vid ? vid.srcObject : null;
    spotlightParticipant(socketId, displayName, liveStream);
  };

  if (stream) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsinline = true;
    video.muted = isLocal;
    video.srcObject = stream;
    thumb.appendChild(video);
  } else {
    const av = document.createElement('div');
    av.className = 'video-avatar';
    av.textContent = initials(displayName);
    thumb.appendChild(av);
  }

  const overlay = document.createElement('div');
  overlay.className = 'participant-overlay';
  overlay.innerHTML = `<span class="participant-name">${escHtml(displayName)}</span>`;
  thumb.appendChild(overlay);

  strip.appendChild(thumb);
}

function addGalleryTile(socketId, displayName, isLocal, stream) {
  const grid = $('gallery-view');
  if (!grid) return;

  const existing = grid.querySelector(`[data-socket="${socketId}"]`);
  if (existing) existing.remove();

  const tile = document.createElement('div');
  tile.className = 'gallery-tile';
  tile.setAttribute('data-socket', socketId);

  if (stream) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsinline = true;
    video.muted = isLocal;
    video.srcObject = stream;
    tile.appendChild(video);
  } else {
    const av = document.createElement('div');
    av.className = 'video-avatar';
    av.textContent = initials(displayName);
    tile.appendChild(av);
  }

  const overlay = document.createElement('div');
  overlay.className = 'participant-overlay';
  overlay.innerHTML = `<span class="participant-name">${escHtml(displayName)}</span>`;
  tile.appendChild(overlay);

  grid.appendChild(tile);
  updateGalleryGrid();
}

function setVideoTileStream(socketId, stream) {
  // Update thumbnail
  const strip = $('thumbnail-strip');
  if (strip) {
    const thumb = strip.querySelector(`[data-socket="${socketId}"]`);
    if (thumb) {
      let video = thumb.querySelector('video');
      const av = thumb.querySelector('.video-avatar');
      if (!video) {
        video = document.createElement('video');
        video.autoplay = true;
        video.playsinline = true;
        video.muted = false;
        if (av) av.remove();
        thumb.insertBefore(video, thumb.firstChild);
      }
      video.srcObject = stream;
    }
  }

  // Update gallery tile
  const grid = $('gallery-view');
  if (grid) {
    const tile = grid.querySelector(`[data-socket="${socketId}"]`);
    if (tile) {
      let video = tile.querySelector('video');
      const av = tile.querySelector('.video-avatar');
      if (!video) {
        video = document.createElement('video');
        video.autoplay = true;
        video.playsinline = true;
        video.muted = false;
        if (av) av.remove();
        tile.insertBefore(video, tile.firstChild);
      }
      video.srcObject = stream;
    }
  }
}

function removeVideoTile(socketId) {
  document.querySelectorAll(`[data-socket="${socketId}"]`).forEach(el => el.remove());
  updateGalleryGrid();
}

function updateGalleryGrid() {
  const grid = $('gallery-view');
  if (!grid) return;
  const count = grid.querySelectorAll('.gallery-tile').length;
  grid.classList.remove('grid-2', 'grid-3', 'grid-4');
  if      (count <= 4)  grid.classList.add('grid-2');
  else if (count <= 9)  grid.classList.add('grid-3');
  else                  grid.classList.add('grid-4');
}

function spotlightParticipant(socketId, displayName, stream) {
  const sv = $('spotlight-video');
  if (!sv) return;
  if (stream) {
    sv.srcObject = stream;
    // Mute the spotlight when it's showing the local user's own stream —
    // playing your own mic audio through speakers causes the echo bug.
    sv.muted = (socketId === 'local');
    hide('no-video-msg');
  } else {
    sv.srcObject = null;
    show('no-video-msg');
  }
  $('spotlight-name').textContent = displayName || 'Unknown';

  // Mark active speaker
  document.querySelectorAll('.video-thumb, .gallery-tile').forEach(t => t.classList.remove('active-speaker'));
  const thumb = document.querySelector(`[data-socket="${socketId}"]`);
  if (thumb) thumb.classList.add('active-speaker');
}

function updateTileAudioIcon(socketId, enabled) {
  const thumb = document.querySelector(`[data-socket="${socketId}"]`);
  if (!thumb) return;
  const icon = thumb.querySelector('.participant-audio-icon');
  if (icon) icon.textContent = enabled ? '🎤' : '🔇';
}

function updateTileVideoState(socketId, enabled) {
  // could toggle avatar visibility
}

function updateParticipantCount() {
  const count = 1 + Object.keys(State.participants).length;
  $('participant-count').textContent = count;
}

/* ─────────────────────────────────────────────
   VIEW MODES
───────────────────────────────────────────── */
function setView(view) {
  State.currentView = view;
  if (view === 'spotlight') {
    show('spotlight-view'); hide('gallery-view');
    $('btn-spotlight').classList.add('active');
    $('btn-gallery').classList.remove('active');
  } else {
    hide('spotlight-view'); show('gallery-view');
    $('btn-gallery').classList.add('active');
    $('btn-spotlight').classList.remove('active');
  }
}

/* ─────────────────────────────────────────────
   MEDIA CONTROLS
───────────────────────────────────────────── */
function toggleMic() {
  const audioTracks = State.localStream?.getAudioTracks() ?? [];
  if (audioTracks.length === 0) {
    toast('No microphone track available — check your mic permissions.', 'error');
    return;
  }
  State.micEnabled = !State.micEnabled;
  audioTracks.forEach(t => { t.enabled = State.micEnabled; });
  updateMicButton();
  State.socket?.emit('toggle_audio', {
    enabled: State.micEnabled,
    room_id: State.currentRoom?.room_id,
  });
}

function updateMicButton() {
  const btn = $('btn-mic');
  if (!btn) return;
  if (State.micEnabled) {
    btn.classList.add('active');
    show('icon-mic'); hide('icon-mic-off');
    btn.title = 'Mute Microphone';
  } else {
    btn.classList.remove('active');
    hide('icon-mic'); show('icon-mic-off');
    btn.title = 'Unmute Microphone';
  }
}

function toggleCamera() {
  const videoTracks = State.localStream?.getVideoTracks() ?? [];
  if (videoTracks.length === 0) {
    toast('No camera track available — check your camera permissions.', 'error');
    return;
  }
  State.cameraEnabled = !State.cameraEnabled;
  videoTracks.forEach(t => { t.enabled = State.cameraEnabled; });
  updateCameraButton();
  State.socket?.emit('toggle_video', {
    enabled: State.cameraEnabled,
    room_id: State.currentRoom?.room_id,
  });
}

function updateCameraButton() {
  const btn = $('btn-camera');
  if (!btn) return;
  if (State.cameraEnabled) {
    btn.classList.add('active');
    show('icon-cam'); hide('icon-cam-off');
    btn.title = 'Turn Off Camera';
  } else {
    btn.classList.remove('active');
    hide('icon-cam'); show('icon-cam-off');
    btn.title = 'Turn On Camera';
  }
}

async function toggleScreenShare() {
  if (!State.screenSharing) {
    try {
      State.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      State.screenSharing = true;

      const screenTrack = State.screenStream.getVideoTracks()[0];

      // Replace video track in all peer connections
      for (const pc of Object.values(State.peers)) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      }

      // Show local screen in spotlight and switch to contain so it isn't cropped
      const sv = $('spotlight-video');
      if (sv) {
        sv.srcObject = State.screenStream;
        sv.classList.add('screen-share-video');    // object-fit: contain via CSS
      }

      screenTrack.onended = () => stopScreenShare();

      $('btn-screen').classList.add('active-screen');
      State.socket?.emit('screen_share_started', { room_id: State.currentRoom?.room_id });
      toast('Screen sharing started', 'info');
    } catch (err) {
      if (err.name !== 'NotAllowedError') toast('Screen share failed', 'error');
    }
  } else {
    stopScreenShare();
  }
}

function stopScreenShare() {
  if (!State.screenSharing) return;
  State.screenSharing = false;

  if (State.screenStream) {
    State.screenStream.getTracks().forEach(t => t.stop());
    State.screenStream = null;
  }

  // Restore camera track
  const cameraTrack = State.localStream?.getVideoTracks()[0];
  if (cameraTrack) {
    for (const pc of Object.values(State.peers)) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(cameraTrack);
    }
    const sv = $('spotlight-video');
    if (sv) {
      sv.srcObject = State.localStream;
      sv.classList.remove('screen-share-video'); // restore object-fit: cover
    }
  }

  $('btn-screen').classList.remove('active-screen');
  State.socket?.emit('screen_share_stopped', { room_id: State.currentRoom?.room_id });
  toast('Screen sharing stopped', 'info');
}

/* ─────────────────────────────────────────────
   PANEL TOGGLES
───────────────────────────────────────────── */
function toggleChat() {
  const sidebar = $('chat-sidebar');
  if (!sidebar) return;
  State.chatOpen = !State.chatOpen;

  if (State.chatOpen) {
    sidebar.classList.remove('hidden');
    $('btn-chat').classList.add('active-panel');
    State.chatUnread = 0;
    hide('chat-badge');
    // Close participants if open
    $('participants-sidebar')?.classList.add('hidden');
    $('btn-participants')?.classList.remove('active-panel');
    State.participantsOpen = false;
    // Focus input
    setTimeout(() => $('chat-input')?.focus(), 100);
  } else {
    sidebar.classList.add('hidden');
    $('btn-chat').classList.remove('active-panel');
  }
}

function toggleParticipants() {
  const sidebar = $('participants-sidebar');
  if (!sidebar) return;
  State.participantsOpen = !State.participantsOpen;

  if (State.participantsOpen) {
    sidebar.classList.remove('hidden');
    $('btn-participants').classList.add('active-panel');
    // Close chat if open
    $('chat-sidebar')?.classList.add('hidden');
    $('btn-chat')?.classList.remove('active-panel');
    State.chatOpen = false;
    renderParticipantsList();
  } else {
    sidebar.classList.add('hidden');
    $('btn-participants').classList.remove('active-panel');
  }
}

function toggleWhiteboard() {
  const wb = $('whiteboard-panel');
  const pres = $('presentation-panel');
  const va = $('video-area');

  if (!wb) return;

  const isOpen = !wb.classList.contains('hidden');
  if (isOpen) {
    wb.classList.add('hidden');
    va?.classList.remove('hidden');
    $('btn-whiteboard').classList.remove('active-panel');
  } else {
    wb.classList.remove('hidden');
    va?.classList.add('hidden');
    pres?.classList.add('hidden');
    $('btn-whiteboard').classList.add('active-panel');
    $('btn-present').classList.remove('active-panel');
    resizeWhiteboard();
  }
}

function togglePresentation() {
  const pres = $('presentation-panel');
  const wb = $('whiteboard-panel');
  const va = $('video-area');

  if (!pres) return;

  const isOpen = !pres.classList.contains('hidden');
  if (isOpen) {
    pres.classList.add('hidden');
    va?.classList.remove('hidden');
    $('btn-present').classList.remove('active-panel');
  } else {
    pres.classList.remove('hidden');
    va?.classList.add('hidden');
    wb?.classList.add('hidden');
    $('btn-present').classList.add('active-panel');
    $('btn-whiteboard').classList.remove('active-panel');
    // Always hide nav controls on open — loadPDF re-shows them for the
    // presenter. Viewers should never see Prev / Next / End Presentation.
    hide('presentation-controls');
  }
}

/* ─────────────────────────────────────────────
   LEAVE MEETING
───────────────────────────────────────────── */
function leaveMeeting() {
  // Stop all streams
  State.localStream?.getTracks().forEach(t => t.stop());
  State.screenStream?.getTracks().forEach(t => t.stop());
  State.localStream  = null;
  State.screenStream = null;
  State.screenSharing = false;

  // Close peer connections
  Object.values(State.peers).forEach(pc => pc.close());
  State.peers = {};
  State.participants = {};

  // Disconnect socket
  State.socket?.emit('leave_meeting', {});
  State.socket?.disconnect();
  State.socket = null;

  // Reset whiteboard
  if (State.wb.ctx) {
    State.wb.ctx.clearRect(0, 0, State.wb.ctx.canvas.width, State.wb.ctx.canvas.height);
    State.wb.history = [];
  }

  // Reset chat
  const messages = $('chat-messages');
  if (messages) messages.innerHTML = '<div class="chat-welcome"><p>🛰️ Secure channel established. Say hello!</p></div>';
  State.chatUnread = 0;
  State.chatOpen   = false;
  State.participantsOpen = false;

  // Hide panels
  $('chat-sidebar')?.classList.add('hidden');
  $('participants-sidebar')?.classList.add('hidden');
  $('whiteboard-panel')?.classList.add('hidden');
  $('presentation-panel')?.classList.add('hidden');
  $('video-area')?.classList.remove('hidden');

  // Clear video grid
  const strip = $('thumbnail-strip');
  if (strip) strip.innerHTML = '';
  const gallery = $('gallery-view');
  if (gallery) gallery.innerHTML = '';

  // Reset button states
  document.querySelectorAll('.ctrl-btn').forEach(b => b.classList.remove('active', 'active-screen', 'active-panel'));
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  $('btn-spotlight')?.classList.add('active');

  // PDF / presentation state — reset everything including file input so
  // the next session starts with a clean slate.
  State.pres = { pdfDoc: null, currentSlide: 1, totalSlides: 1, isPresenting: false, zoomFactor: 1.0 };
  const pdfCanvas = $('pdf-canvas');
  if (pdfCanvas) pdfCanvas.getContext('2d').clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
  const fileInput = $('pdf-upload');
  if (fileInput) fileInput.value = '';
  hide('presentation-controls');
  hide('pdf-canvas');
  show('pres-hint');
  show('pres-upload-btn');

  State.currentRoom = null;
  loadDashboard();
}

/* ─────────────────────────────────────────────
   CHAT
───────────────────────────────────────────── */
function handleChatKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function handleTyping() {
  if (!State.socket) return;
  clearTimeout(State.typingTimeout);
  State.socket.emit('typing_indicator', {
    room_id: State.currentRoom?.room_id,
    is_typing: true,
    display_name: State.user?.display_name || 'Someone',
  });
  State.typingTimeout = setTimeout(() => {
    State.socket?.emit('typing_indicator', {
      room_id: State.currentRoom?.room_id,
      is_typing: false,
      display_name: State.user?.display_name || 'Someone',
    });
  }, 2000);
}

function sendMessage() {
  const input = $('chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  State.socket?.emit('send_message', {
    room_id:      State.currentRoom?.room_id,
    message:      text,
    user_id:      State.user?.id,
    display_name: State.user?.display_name || 'You',
  });

  input.value = '';
}

function handleIncomingMessage(data) {
  const isOwn = data.from_socket_id === State.socket?.id;
  const messages = $('chat-messages');
  if (!messages) return;

  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = isOwn ? 'flex-end' : 'flex-start';

  if (!isOwn) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.style.marginLeft = '12px';
    meta.textContent = `${data.display_name} · ${formatTime(data.timestamp)}`;
    wrapper.appendChild(meta);
  } else {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.style.marginRight = '12px';
    meta.textContent = formatTime(data.timestamp);
    wrapper.appendChild(meta);
  }

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${isOwn ? 'sent' : 'received'}`;
  bubble.textContent = data.message;
  wrapper.appendChild(bubble);

  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;

  // Unread badge
  if (!State.chatOpen) {
    State.chatUnread++;
    const badge = $('chat-badge');
    if (badge) {
      badge.textContent = State.chatUnread;
      show('chat-badge');
    }
  }
}

function handleTypingIndicator({ socket_id, display_name, is_typing }) {
  if (socket_id === State.socket?.id) return;
  const el = $('typing-indicator');
  if (!el) return;
  el.textContent = is_typing ? `${display_name} is typing…` : '';
  is_typing ? show('typing-indicator') : hide('typing-indicator');
}

function sendReaction(emoji) {
  State.socket?.emit('reaction', {
    room_id: State.currentRoom?.room_id,
    emoji,
    display_name: State.user?.display_name || 'Someone',
  });
}

function handleIncomingReaction({ emoji, display_name }) {
  spawnFloatingReaction(emoji);
  toast(`${display_name}: ${emoji}`, 'info', 2000);
}

function spawnFloatingReaction(emoji) {
  const overlay = $('reaction-overlay');
  if (!overlay) return;
  const el = document.createElement('div');
  el.className = 'floating-reaction';
  el.textContent = emoji;
  el.style.left = (20 + Math.random() * 60) + '%';
  el.style.bottom = '80px';
  overlay.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ─────────────────────────────────────────────
   PARTICIPANTS PANEL
───────────────────────────────────────────── */
function renderParticipantsList() {
  const list = $('participants-list');
  if (!list) return;
  list.innerHTML = '';

  // Self
  const selfItem = createParticipantItem(
    State.user?.display_name || 'You',
    true, State.micEnabled, State.cameraEnabled, true
  );
  list.appendChild(selfItem);

  // Others
  for (const [socketId, p] of Object.entries(State.participants)) {
    const item = createParticipantItem(
      p.displayName || p.display_name || 'Guest',
      p.audioEnabled !== false,
      p.videoEnabled !== false,
      false,
      false
    );
    list.appendChild(item);
  }
}

function createParticipantItem(name, audioEnabled, videoEnabled, isHost, isSelf) {
  const item = document.createElement('div');
  item.className = 'participant-item';
  item.innerHTML = `
    <div class="participant-avatar">${initials(name)}</div>
    <div class="participant-info">
      <div class="participant-display-name">${escHtml(name)}${isSelf ? ' (You)' : ''}${isHost ? ' 👑' : ''}</div>
    </div>
    <div class="participant-icons">
      <span class="${audioEnabled ? 'icon-active' : 'icon-muted'}">${audioEnabled ? '🎤' : '🔇'}</span>
      <span class="${videoEnabled ? 'icon-active' : 'icon-muted'}">${videoEnabled ? '📷' : '📵'}</span>
    </div>`;
  return item;
}

/* ─────────────────────────────────────────────
   WHITEBOARD
───────────────────────────────────────────── */
function initWhiteboard() {
  const canvas = $('whiteboard-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  State.wb.ctx = ctx;
  resizeWhiteboard();
  window.addEventListener('resize', resizeWhiteboard);

  canvas.addEventListener('mousedown',  wbStartDraw);
  canvas.addEventListener('mousemove',  wbDraw);
  canvas.addEventListener('mouseup',    wbEndDraw);
  canvas.addEventListener('mouseleave', wbEndDraw);

  canvas.addEventListener('touchstart',  wbTouchStart, { passive: false });
  canvas.addEventListener('touchmove',   wbTouchMove,  { passive: false });
  canvas.addEventListener('touchend',    wbEndDraw);
}

function resizeWhiteboard() {
  const canvas = $('whiteboard-canvas');
  if (!canvas) return;
  const panel = $('whiteboard-panel');
  if (!panel) return;
  const tb = $('wb-toolbar');
  const tbH = tb ? tb.offsetHeight : 0;
  const rect = panel.getBoundingClientRect();
  canvas.width  = rect.width;
  canvas.height = rect.height - tbH;

  // Redraw grid
  drawWbGrid();
}

function drawWbGrid() {
  const ctx = State.wb.ctx;
  if (!ctx) return;
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#1F2937';
  ctx.lineWidth = 0.5;
  const gap = 50;
  for (let x = 0; x <= width; x += gap) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y <= height; y += gap) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
}

function wbGetPos(e) {
  const canvas = $('whiteboard-canvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX || e.touches[0].clientX) - rect.left,
    y: (e.clientY || e.touches[0].clientY) - rect.top,
  };
}

function wbTouchStart(e) { e.preventDefault(); wbStartDraw(e); }
function wbTouchMove(e)  { e.preventDefault(); wbDraw(e); }

function wbStartDraw(e) {
  const { x, y } = wbGetPos(e);
  State.wb.drawing = true;
  State.wb.lastX   = x;
  State.wb.lastY   = y;

  // Save snapshot for undo
  const snapshot = State.wb.ctx.getImageData(0, 0, State.wb.ctx.canvas.width, State.wb.ctx.canvas.height);
  State.wb.history.push(snapshot);
  if (State.wb.history.length > 30) State.wb.history.shift();
}

function wbDraw(e) {
  if (!State.wb.drawing) return;
  const { x, y } = wbGetPos(e);
  const ctx = State.wb.ctx;
  if (!ctx) return;

  if (State.wb.tool === 'eraser') {
    ctx.clearRect(x - 10, y - 10, 20, 20);
    State.socket?.emit('whiteboard_draw', {
      room_id: State.currentRoom?.room_id,
      stroke_data: { type: 'erase', x, y, radius: 10 },
    });
  } else {
    ctx.beginPath();
    ctx.moveTo(State.wb.lastX, State.wb.lastY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = State.wb.color;
    ctx.lineWidth   = State.wb.size;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    if (State.wb.tool === 'marker') ctx.globalAlpha = 0.6;
    else ctx.globalAlpha = 1;
    ctx.stroke();

    State.socket?.emit('whiteboard_draw', {
      room_id: State.currentRoom?.room_id,
      stroke_data: {
        type: 'draw',
        fromX: State.wb.lastX, fromY: State.wb.lastY,
        toX: x, toY: y,
        color: State.wb.color,
        width: State.wb.size,
        alpha: State.wb.tool === 'marker' ? 0.6 : 1,
      },
    });
  }

  State.wb.lastX = x;
  State.wb.lastY = y;
}

function wbEndDraw() {
  State.wb.drawing = false;
  if (State.wb.ctx) State.wb.ctx.globalAlpha = 1;
}

function setWbTool(tool) {
  State.wb.tool = tool;
  document.querySelectorAll('.wb-tool[data-tool]').forEach(b => b.classList.remove('active'));
  document.querySelector(`.wb-tool[data-tool="${tool}"]`)?.classList.add('active');
  const canvas = $('whiteboard-canvas');
  if (canvas) canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
}

function setWbColor(color) {
  State.wb.color = color;
  document.querySelectorAll('.wb-color').forEach(b => b.classList.remove('active'));
  document.querySelector(`.wb-color[data-color="${color}"]`)?.classList.add('active');
}

function setWbSize(size) {
  State.wb.size = parseInt(size);
}

function undoWb() {
  if (State.wb.history.length === 0) return;
  const snapshot = State.wb.history.pop();
  State.wb.ctx.putImageData(snapshot, 0, 0);
  State.socket?.emit('whiteboard_undo', { room_id: State.currentRoom?.room_id });
}

function clearWb() {
  if (!State.wb.ctx) return;
  State.wb.history.push(State.wb.ctx.getImageData(0, 0, State.wb.ctx.canvas.width, State.wb.ctx.canvas.height));
  drawWbGrid();
  State.socket?.emit('whiteboard_clear', { room_id: State.currentRoom?.room_id });
}

// Incoming whiteboard events
function handleWbUpdate({ stroke_data }) {
  const ctx = State.wb.ctx;
  if (!ctx) return;
  if (stroke_data.type === 'erase') {
    ctx.clearRect(stroke_data.x - stroke_data.radius, stroke_data.y - stroke_data.radius,
      stroke_data.radius * 2, stroke_data.radius * 2);
  } else {
    ctx.beginPath();
    ctx.moveTo(stroke_data.fromX, stroke_data.fromY);
    ctx.lineTo(stroke_data.toX, stroke_data.toY);
    ctx.strokeStyle  = stroke_data.color;
    ctx.lineWidth    = stroke_data.width;
    ctx.lineCap      = 'round';
    ctx.lineJoin     = 'round';
    ctx.globalAlpha  = stroke_data.alpha || 1;
    ctx.stroke();
    ctx.globalAlpha  = 1;
  }
}

function handleWbErase({ erase_data }) {
  if (!State.wb.ctx || !erase_data) return;
  State.wb.ctx.clearRect(erase_data.x - 10, erase_data.y - 10, 20, 20);
}

function handleWbCleared() { drawWbGrid(); }

function handleWbUndo() {
  if (State.wb.history.length === 0) return;
  const snapshot = State.wb.history.pop();
  State.wb.ctx?.putImageData(snapshot, 0, 0);
}

function handleWbImageAdded({ image_data, position }) {
  if (!State.wb.ctx || !image_data) return;
  const img = new Image();
  img.onload = () => {
    State.wb.ctx.drawImage(img, position?.x || 0, position?.y || 0);
  };
  img.src = image_data;
}

function handleWbShape({ shape_data }) {
  const ctx = State.wb.ctx;
  if (!ctx || !shape_data) return;
  ctx.strokeStyle = shape_data.color || '#fff';
  ctx.lineWidth   = shape_data.lineWidth || 2;
  ctx.beginPath();
  if (shape_data.type === 'rect') ctx.rect(shape_data.x, shape_data.y, shape_data.w, shape_data.h);
  if (shape_data.type === 'circle') {
    ctx.arc(shape_data.x + shape_data.w / 2, shape_data.y + shape_data.h / 2,
      Math.abs(shape_data.w) / 2, 0, Math.PI * 2);
  }
  ctx.stroke();
}

/* ─────────────────────────────────────────────
   PRESENTATION / PDF
───────────────────────────────────────────── */
async function loadPDF(event) {
  const file = event.target.files[0];
  if (!file || !window.pdfjsLib) return;

  const arrayBuffer = await file.arrayBuffer();
  State.pres.pdfDoc       = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  State.pres.totalSlides  = State.pres.pdfDoc.numPages;
  State.pres.currentSlide = 1;
  State.pres.isPresenting = true;
  State.pres.zoomFactor   = 1.0;   // always start at fit-to-screen on new PDF

  hide('pres-hint');
  hide('pres-upload-btn');
  show('pdf-canvas');
  // Show nav + zoom controls only for the presenter
  show('presentation-controls');
  updateZoomLabel();

  $('slide-counter').textContent = `Slide 1 / ${State.pres.totalSlides}`;

  // Render + broadcast first slide BEFORE emitting presentation_start so
  // the image is in-flight by the time viewers open the panel.
  await renderSlide(1, true);

  State.socket?.emit('presentation_start', {
    room_id:       State.currentRoom?.room_id,
    document_name: file.name,
    total_slides:  State.pres.totalSlides,
  });
}

async function renderSlide(pageNum, broadcast = false) {
  if (!State.pres.pdfDoc) return;
  const page    = await State.pres.pdfDoc.getPage(pageNum);
  const canvas  = $('pdf-canvas');
  const ctx     = canvas.getContext('2d');
  const viewer  = $('presentation-viewer');

  // Base "fit to screen" scale — fills the viewer at zoom 1.0
  const maxW = viewer.clientWidth  * 0.9;
  const maxH = viewer.clientHeight * 0.85;
  const vp   = page.getViewport({ scale: 1 });
  const fitScale = Math.min(maxW / vp.width, maxH / vp.height);

  // Apply the user's zoom factor on top of the fit scale
  const scale    = fitScale * (State.pres.zoomFactor || 1.0);
  const viewport = page.getViewport({ scale });

  canvas.width  = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  // After rendering locally, broadcast the slide as a JPEG image to all
  // participants. Viewers have no PDF file so they cannot render themselves —
  // they rely on this image. Using JPEG at 0.85 quality keeps the payload
  // small while keeping text readable.
  if (broadcast && State.socket) {
    const imageData = canvas.toDataURL('image/jpeg', 0.85);
    State.socket.emit('presentation_slide_image', {
      room_id:      State.currentRoom?.room_id,
      slide_number: pageNum,
      image_data:   imageData,
    });
  }
}

/* Zoom in / out by a delta (e.g. ±0.25). Clamped to 0.25 – 4×. */
function zoomPDF(delta) {
  const next = Math.max(0.25, Math.min(4.0, State.pres.zoomFactor + delta));
  State.pres.zoomFactor = next;
  updateZoomLabel();
  renderSlide(State.pres.currentSlide, false); // local only — don't re-broadcast
}

/* Reset to fit-to-screen (zoom = 1.0). */
function zoomFitPDF() {
  State.pres.zoomFactor = 1.0;
  updateZoomLabel();
  // Scroll the viewer back to top-left after fitting
  const viewer = $('presentation-viewer');
  if (viewer) { viewer.scrollTop = 0; viewer.scrollLeft = 0; }
  renderSlide(State.pres.currentSlide, false);
}

function updateZoomLabel() {
  const label = $('zoom-label');
  if (label) label.textContent = `${Math.round(State.pres.zoomFactor * 100)}%`;
}

// Made async so renderSlide (which broadcasts the image) fully completes
// BEFORE the slide-change event is emitted. Without await, the socket event
// could arrive at viewers before the image, leaving a blank canvas briefly.
async function changeSlide(delta) {
  const newSlide = State.pres.currentSlide + delta;
  if (newSlide < 1 || newSlide > State.pres.totalSlides) return;
  State.pres.currentSlide = newSlide;
  await renderSlide(newSlide, true);   // render + broadcast image first
  $('slide-counter').textContent = `Slide ${newSlide} / ${State.pres.totalSlides}`;
  State.socket?.emit('presentation_change_slide', {
    room_id:      State.currentRoom?.room_id,
    slide_number: newSlide,
  });
}

function endPresentation() {
  // ── Reset ALL presenter state so next upload starts fresh ──────────────
  // Without this, re-opening the panel shows the old PDF without prompting.
  State.pres.isPresenting = false;
  State.pres.pdfDoc       = null;
  State.pres.currentSlide = 1;
  State.pres.totalSlides  = 1;
  State.pres.zoomFactor   = 1.0;   // reset zoom for next session

  // Clear canvas pixels
  const canvas = $('pdf-canvas');
  if (canvas) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  // Reset file input — clearing .value means the browser fires `change` again
  // even if the user picks the same file next time.
  const fileInput = $('pdf-upload');
  if (fileInput) fileInput.value = '';

  // Restore the upload UI and hide the nav controls
  hide('pdf-canvas');
  hide('presentation-controls');
  show('pres-hint');
  show('pres-upload-btn');

  State.socket?.emit('presentation_end', { room_id: State.currentRoom?.room_id });
  togglePresentation();
}

function handlePresStarted({ total_slides, current_slide, presenter_name, document_name }) {
  State.pres.totalSlides  = total_slides;
  State.pres.currentSlide = current_slide;
  if ($('slide-counter')) $('slide-counter').textContent = `Slide ${current_slide} / ${total_slides}`;

  // If this client is the presenter, their UI is already set up by loadPDF —
  // no need to do anything here (and we must NOT hide their controls).
  if (State.pres.isPresenting) return;

  // ── Viewer path ──────────────────────────────────────────────────────────
  toast(`${presenter_name} started presenting: ${document_name}`, 'info');
  // Viewers never see Prev / Next / End — hide those controls.
  hide('presentation-controls');
  hide('pres-hint');
  hide('pres-upload-btn');
  show('pdf-canvas');
  show('presentation-panel');
  hide('video-area');
}

function handlePresSlideChanged({ slide_number }) {
  State.pres.currentSlide = slide_number;
  if ($('slide-counter')) $('slide-counter').textContent = `Slide ${slide_number} / ${State.pres.totalSlides}`;
  // Presenter re-renders locally (no broadcast — already done in changeSlide).
  // Viewers get the image via presentation_slide_image instead.
  if (State.pres.pdfDoc) renderSlide(slide_number);
}

function handlePresEnded() {
  toast('Presentation ended', 'info');
  // Clear the viewer canvas so stale slide doesn't flash on next presentation
  const canvas = $('pdf-canvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  hide('pdf-canvas');
  hide('presentation-panel');
  show('video-area');
}

// Viewers receive this instead of the raw PDF — the presenter renders each
// slide and broadcasts it as a JPEG. Draw it onto the canvas so viewers
// see exactly what the presenter sees.
function handlePresSlideImage({ slide_number, image_data }) {
  if (!image_data) return;
  // Skip if we are the presenter (we already rendered it locally)
  if (State.pres.isPresenting) return;

  const canvas = $('pdf-canvas');
  if (!canvas) return;
  show('pdf-canvas');
  hide('pres-hint');

  const img = new Image();
  img.onload = () => {
    canvas.width  = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
  };
  img.src = image_data;
  if ($('slide-counter')) {
    $('slide-counter').textContent = `Slide ${slide_number} / ${State.pres.totalSlides}`;
  }
}

/* ─────────────────────────────────────────────
   UTILITY
───────────────────────────────────────────── */
function copyRoomLink() {
  const roomId = State.currentRoom?.room_id;
  if (!roomId) return;
  const url = `${window.location.origin}/?join=${roomId}`;
  copyToClipboard(url, 'Room link copied!');
  const btn = document.querySelector('[onclick="copyRoomLink()"]');
  if (btn) btn.classList.add('copy-flash');
  setTimeout(() => btn?.classList.remove('copy-flash'), 300);
}

function copyToClipboard(text, msg = 'Copied to clipboard!') {
  navigator.clipboard.writeText(text).then(() => toast(msg, 'success')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast(msg, 'success');
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  generateStars();

  // Handle ?join= deep-link
  const params = new URLSearchParams(window.location.search);
  const joinId = params.get('join');

  const restored = await tryRestoreSession();

  if (restored) {
    if (joinId) {
      quickJoin(joinId);
    } else {
      loadDashboard();
    }
  } else {
    showPage('page-landing');
    if (joinId) {
      setTimeout(() => showAuth('login'), 500);
    }
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Only in meeting room
    if (!$('page-meeting')?.classList.contains('active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'm' || e.key === 'M') { toggleMic(); e.preventDefault(); }
    if (e.key === 'v' || e.key === 'V') { toggleCamera(); e.preventDefault(); }
    if (e.key === 'c' || e.key === 'C') { toggleChat(); e.preventDefault(); }
    if (e.key === 'Escape') {
      if (State.chatOpen) toggleChat();
      if (State.participantsOpen) toggleParticipants();
    }
  });
});
