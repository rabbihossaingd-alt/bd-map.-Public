// ---- Messenger, continued: voice messages, editing, group calls ----
// Loaded after chat.js and uses its state (CHAT, threadOf, chatApi, ...).

// ---- voice messages ----
// Recorded in the browser (MediaRecorder), sent as a file of kind "audio" with its length, and played in the
// conversation with a small player: a play button, a waveform drawn from the message id, and the time.
const VOICE_MAX = 120;                                  // seconds
const rec = { mr: null, stream: null, chunks: [], started: 0, timer: null, cancelled: false, ctx: null, analyser: null, raf: 0 };

function pickAudioType() {
  if (!window.MediaRecorder) return null;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported(t)) return t;
  return '';
}
async function startRecording() {
  const t = threadOf(CHAT.open);
  if (!t || rec.mr) return;
  const type = pickAudioType();
  if (type === null || !navigator.mediaDevices) { chatToast(ME, tx('এই ব্রাউজারে ভয়েস রেকর্ড করা যায় না।', 'This browser cannot record voice.')); return; }
  if (typeof call !== 'undefined' && call.state !== 'idle') return;
  try { rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { chatToast(ME, tx('মাইক্রোফোনের অনুমতি দিন।', 'Allow the microphone.')); return; }
  rec.mr = new MediaRecorder(rec.stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
  rec.chunks = [];
  rec.cancelled = false;
  rec.mr.ondataavailable = e => { if (e.data.size) rec.chunks.push(e.data); };
  rec.mr.onstop = finishRecording;
  rec.mr.start(250);
  rec.started = Date.now();
  showRecBar();
  rec.timer = setInterval(() => {
    const s = (Date.now() - rec.started) / 1000;
    $('rec-time').textContent = mmss(s);
    if (s >= VOICE_MAX) stopRecording(false);
  }, 200);
  // A live level meter while recording.
  try {
    rec.ctx = new (window.AudioContext || window.webkitAudioContext)();
    rec.analyser = rec.ctx.createAnalyser();
    rec.analyser.fftSize = 64;
    rec.ctx.createMediaStreamSource(rec.stream).connect(rec.analyser);
    const bars = [...$('rec-wave').children], data = new Uint8Array(rec.analyser.frequencyBinCount);
    const draw = () => {
      rec.analyser.getByteFrequencyData(data);
      bars.forEach((b, i) => { b.style.setProperty('--v', Math.max(.12, data[(i * 2) % data.length] / 255).toFixed(2)); });
      rec.raf = requestAnimationFrame(draw);
    };
    draw();
  } catch { /* the meter is a nicety */ }
}
const mmss = s => `${num(Math.floor(s / 60))}:${num(Math.floor(s % 60)).padStart(2, num(0))}`;
function showRecBar() {
  const bar = $('chat-rec');
  const cancel = el('button', 'icon-btn rec-x');
  cancel.innerHTML = svg('trash');
  cancel.setAttribute('aria-label', 'বাতিল');
  cancel.addEventListener('click', () => stopRecording(true));
  const wave = el('span', 'rec-wave');
  wave.id = 'rec-wave';
  for (let i = 0; i < 28; i++) wave.appendChild(el('i'));
  const send = el('button', 'send rec-send');
  send.innerHTML = svg('send');
  send.setAttribute('aria-label', 'পাঠান');
  send.addEventListener('click', () => stopRecording(false));
  const dot = el('span', 'rec-dot');
  const time = el('span', 'rec-time');
  time.id = 'rec-time';
  time.textContent = mmss(0);
  bar.replaceChildren(cancel, dot, time, wave, send);
  bar.hidden = false;
  $('chat-form').hidden = true;
}
function stopRecording(cancel) {
  if (!rec.mr) return;
  rec.cancelled = cancel;
  clearInterval(rec.timer);
  cancelAnimationFrame(rec.raf);
  if (rec.mr.state !== 'inactive') rec.mr.stop(); else finishRecording();
}
function finishRecording() {
  const secs = Math.max(1, Math.round((Date.now() - rec.started) / 1000));
  const type = (rec.mr && rec.mr.mimeType || 'audio/webm').split(';')[0];
  for (const tr of rec.stream ? rec.stream.getTracks() : []) tr.stop();
  try { if (rec.ctx) rec.ctx.close(); } catch { /* already closed */ }
  const blob = new Blob(rec.chunks, { type });
  const cancelled = rec.cancelled;
  Object.assign(rec, { mr: null, stream: null, chunks: [], ctx: null, analyser: null });
  $('chat-rec').hidden = true;
  $('chat-form').hidden = false;
  if (cancelled || blob.size < 600) return;
  const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'weba';
  sendFile(new File([blob], `voice-${Date.now()}.${ext}`, { type }), { secs });
}

// One shared player, so starting a voice message stops the one before it.
let voicePlaying = null;
function voiceBubble(m) {
  const b = el('div', 'bubble voice');
  const play = el('button', 'vplay');
  play.innerHTML = svg('play');
  play.setAttribute('aria-label', 'শুনুন');
  const wave = el('span', 'vwave');
  let seed = m.id * 9301 + 49297;
  for (let i = 0; i < 30; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const bar = el('i');
    bar.style.height = Math.round(22 + (seed / 233280) * 78) + '%';
    wave.appendChild(bar);
  }
  const time = el('span', 'vtime', mmss(m.body.secs || 0));
  b.append(play, wave, time);
  let audio = null;
  const paint = () => {
    const p = audio && audio.duration && isFinite(audio.duration) ? audio.currentTime / audio.duration : audio && m.body.secs ? audio.currentTime / m.body.secs : 0;
    b.style.setProperty('--p', Math.min(1, p).toFixed(3));
    time.textContent = mmss(audio && !audio.paused ? audio.currentTime : m.body.secs || 0);
  };
  const toggle = () => {
    if (!audio) {
      audio = new Audio(m.body.src);
      audio.preload = 'auto';
      audio.addEventListener('timeupdate', paint);
      audio.addEventListener('ended', () => { b.classList.remove('playing'); play.innerHTML = svg('play'); audio.currentTime = 0; paint(); });
    }
    if (audio.paused) {
      if (voicePlaying && voicePlaying !== audio) voicePlaying.pause();
      voicePlaying = audio;
      audio.play().catch(() => {});
      b.classList.add('playing');
      play.innerHTML = svg('pause');
    } else { audio.pause(); b.classList.remove('playing'); play.innerHTML = svg('play'); }
  };
  play.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  // A tap on the waveform jumps there.
  wave.addEventListener('click', e => {
    e.stopPropagation();
    if (!audio) toggle();
    const r = wave.getBoundingClientRect(), f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const len = audio.duration && isFinite(audio.duration) ? audio.duration : m.body.secs;
    if (len) audio.currentTime = f * len;
  });
  return b;
}

// ---- editing a message ----
function startEdit(m) {
  clearReply();
  CHAT.edit = { id: m.id };
  const bar = $('chat-reply');
  const tt = el('div', 't');
  tt.append(el('b', null, 'মেসেজ এডিট করছেন'), el('span', null, 'পাঠানোর ১৫ মিনিটের মধ্যে বদলানো যায়। সবাই "এডিট করা" লেখা দেখবেন।'));
  const x = el('button', 'icon-btn');
  x.innerHTML = svg('close');
  x.setAttribute('aria-label', 'বাতিল');
  x.addEventListener('click', clearReply);
  bar.replaceChildren(ic('edit'), tt, x);
  bar.classList.add('editing');
  bar.hidden = false;
  const input = $('chat-input');
  input.value = m.body;
  input.dispatchEvent(new Event('input'));
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}
async function saveEdit(text) {
  const id = CHAT.edit.id;
  clearReply();
  try { const r = await chatApi('edit', { msg: id, body: text }); updateMessage(r.message); }
  catch (e) { chatToast(ME, e.message === 'late' ? 'পাঠানোর ১৫ মিনিট পেরিয়ে গেছে — এখন আর এডিট করা যায় না।' : 'এডিট করা যায়নি।'); }
}

// ---- group calls ----
// Everyone in the call connects to everyone else (a mesh, up to 8 people). Whoever joins sends an offer to each
// person already in the call; the server only passes these set-up messages along ("group-signal").
const gc = { group: null, video: false, media: null, peers: new Map(), started: 0, clock: null, ringing: null };

function renderCallBar() {
  const bar = $('chat-callbar'), t = threadOf(CHAT.open);
  if (!bar) return;
  const c = t && t.members && t.call;
  if (!c || gc.group === t.id) { bar.hidden = true; return; }
  const faces = el('span', 'cb-faces');
  for (const id of c.people.slice(0, 4)) faces.appendChild(avatar(senderIn(t, id), 'xs'));
  const tt = el('span', 't');
  tt.append(el('b', null, c.video ? 'গ্রুপ ভিডিও কল চলছে' : 'গ্রুপ ভয়েস কল চলছে'), el('span', null, `${num(c.people.length)} জন আছেন`));
  const join = el('button', 'pill-btn', 'যোগ দিন');
  join.addEventListener('click', () => joinGroupCall(t, c.video));
  bar.replaceChildren(ic(c.video ? 'video' : 'phone'), faces, tt, join);
  bar.hidden = false;
}

async function joinGroupCall(t, video) {
  if (gc.group) { showGroupCall(); return; }
  if (typeof call !== 'undefined' && call.state !== 'idle') { chatToast(ME, 'আগে চলতি কলটি শেষ করুন।'); return; }
  if (!navigator.mediaDevices || !window.RTCPeerConnection) { chatToast(ME, 'এই ব্রাউজারে কল করা যায় না।'); return; }
  const going = t.call;
  const wantVideo = going ? going.video : video;
  stopRing();
  let media;
  try { media = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false }); }
  catch { chatToast(ME, wantVideo ? 'ক্যামেরা ও মাইক্রোফোনের অনুমতি দিন।' : 'মাইক্রোফোনের অনুমতি দিন।'); return; }
  let r;
  try { r = await chatApi('group-call', { group: t.id, video: wantVideo }); }
  catch (e) { for (const tr of media.getTracks()) tr.stop(); chatToast(ME, e.message === 'full' ? 'কলে এখন ৮ জন আছেন — আর জায়গা নেই।' : 'কলে যোগ দেওয়া যায়নি।'); return; }
  Object.assign(gc, { group: t.id, video: r.call.video, media, started: r.call.started });
  t.call = r.call;
  if (!iceServers) iceServers = (await chatApi('ice')).iceServers;
  showGroupCall();
  for (const id of r.peers) {                             // I joined: I ring each person already there
    const p = groupPeer(id);
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    gsignal(id, { type: 'offer', sdp: offer.sdp });
  }
}
const gsignal = (to, data) => chatApi('group-signal', { group: gc.group, to, data }).catch(() => {});

function groupPeer(id) {
  if (gc.peers.has(id)) return gc.peers.get(id);
  const pc = new RTCPeerConnection({ iceServers });
  const p = { pc, ice: [], tile: null };
  gc.peers.set(id, p);
  for (const tr of gc.media.getTracks()) pc.addTrack(tr, gc.media);
  pc.onicecandidate = e => { if (e.candidate) gsignal(id, { type: 'ice', candidate: e.candidate }); };
  pc.ontrack = e => { const v = tileOf(id).querySelector('video'); if (v.srcObject !== e.streams[0]) v.srcObject = e.streams[0]; tileOf(id).classList.add('live'); };
  pc.onconnectionstatechange = () => {
    const tile = gc.peers.has(id) && tileOf(id);
    if (tile) tile.dataset.state = pc.connectionState;
  };
  return p;
}
async function onGroupSignal({ group, from, data }) {
  if (group !== gc.group || !data) return;
  const p = groupPeer(from);
  try {
    if (data.type === 'offer') {
      await p.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      for (const c of p.ice.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
      const answer = await p.pc.createAnswer();
      await p.pc.setLocalDescription(answer);
      gsignal(from, { type: 'answer', sdp: answer.sdp });
    } else if (data.type === 'answer') {
      await p.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      for (const c of p.ice.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
    } else if (data.type === 'ice') {
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate).catch(() => {});
      else p.ice.push(data.candidate);
    }
  } catch { /* a broken link to one person does not end the call for the others */ }
}

function onGroupCall({ group, call: c, ring, by }) {
  const t = CHAT.groups.find(g => g.id === group);
  if (t) t.call = c;
  if (gc.group === group) {
    // People who left: close their link and their tile.
    const here = new Set(c ? c.people : []);
    for (const id of [...gc.peers.keys()]) if (!here.has(id)) dropPeer(id);
    if (c) for (const id of c.people) if (ME && id !== ME.id) tileOf(id);
    paintGroupCall();
  } else if (ring && c && ME && by !== ME.id && !gc.group && t && !t.muted && (typeof call === 'undefined' || call.state === 'idle')) ringGroupCall(t, c, by);
  else if (!c && gc.ringing === group) stopRing();
  if (CHAT.open === 'g' + group) renderCallBar();
  renderList();
}
function dropPeer(id) {
  const p = gc.peers.get(id);
  if (!p) return;
  p.pc.onconnectionstatechange = null;
  p.pc.close();
  if (p.tile) p.tile.remove();
  gc.peers.delete(id);
}

// ---- the call screen ----
function gcallBox() {
  let box = $('gcall');
  if (box) return box;
  box = el('div', 'gcall');
  box.id = 'gcall';
  box.hidden = true;
  box.innerHTML = '<header class="gc-head"><span class="t"><b class="no-tr" id="gc-title"></b><span id="gc-status"></span></span></header><div class="gc-grid" id="gc-grid"></div><div class="call-actions" id="gc-actions"></div>';
  document.body.appendChild(box);
  return box;
}
function tileOf(id) {
  const p = gc.peers.get(id) || (ME && id === ME.id ? null : groupPeer(id));
  if (p && p.tile) return p.tile;
  const t = threadOf('g' + gc.group), who = ME && id === ME.id ? ME : senderIn(t || { members: [] }, id);
  const tile = el('div', 'gc-tile' + (ME && id === ME.id ? ' me' : ''));
  const v = el('video');
  Object.assign(v, { autoplay: true, playsInline: true });
  if (ME && id === ME.id) { v.muted = true; v.srcObject = gc.media; }
  const face = el('div', 'gc-face');
  face.appendChild(avatar(who, 'xl'));
  tile.append(v, face, Object.assign(el('span', 'gc-name no-tr'), { textContent: ME && id === ME.id ? tx('আপনি', 'You') : who.name }));
  if (p) p.tile = tile;
  $('gc-grid').appendChild(tile);
  paintGroupCall();
  return tile;
}
function showGroupCall() {
  const box = gcallBox(), t = threadOf('g' + gc.group);
  box.hidden = false;
  box.classList.toggle('video', gc.video);
  $('gc-title').textContent = t ? titleOf(t) : '';
  if (!$('gc-grid').querySelector('.gc-tile.me')) tileOf(ME.id);
  const actions = $('gc-actions');
  const mk = (icon, label, cls, fn) => { const b = el('button', 'call-btn ' + cls); b.innerHTML = svg(icon); b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); return b; };
  const mic = mk('mic', 'মাইক্রোফোন', '', () => { const tr = gc.media.getAudioTracks()[0]; if (tr) { tr.enabled = !tr.enabled; mic.classList.toggle('off', !tr.enabled); } });
  const btns = [mic];
  if (gc.video) {
    const cam = mk('video', 'ক্যামেরা', '', () => { const tr = gc.media.getVideoTracks()[0]; if (tr) { tr.enabled = !tr.enabled; cam.classList.toggle('off', !tr.enabled); $('gc-grid').querySelector('.gc-tile.me').classList.toggle('cam-off', !tr.enabled); } });
    btns.push(cam);
  }
  btns.push(mk('phone', 'কল ছাড়ুন', 'hang', leaveGroupCall));
  actions.replaceChildren(...btns);
  clearInterval(gc.clock);
  gc.clock = setInterval(paintGroupCall, 1000);
  paintGroupCall();
  renderCallBar();
}
function paintGroupCall() {
  const grid = $('gc-grid');
  if (!grid || !gc.group) return;
  const n = grid.children.length;
  grid.dataset.n = Math.min(n, 9);
  const t = threadOf('g' + gc.group);
  const s = Math.max(0, Math.floor((Date.now() - gc.started) / 1000));
  $('gc-status').textContent = n < 2 ? tx('অন্যদের জন্য অপেক্ষা…', 'Waiting for others…') : `${num(n)} জন · ${mmss(s)}`;
  if (!gc.video) for (const tile of grid.children) tile.classList.add('audio');
  if (t && t.call) for (const tile of grid.children) tile.classList.toggle('waiting', false);
}
async function leaveGroupCall() {
  const gid = gc.group;
  if (!gid) return;
  for (const id of [...gc.peers.keys()]) dropPeer(id);
  if (gc.media) for (const tr of gc.media.getTracks()) tr.stop();
  clearInterval(gc.clock);
  Object.assign(gc, { group: null, media: null, started: 0 });
  const box = $('gcall');
  if (box) { box.hidden = true; $('gc-grid').replaceChildren(); }
  await chatApi('group-call-leave', { group: gid }).catch(() => {});
  renderCallBar();
}
addEventListener('beforeunload', () => { if (gc.group) navigator.sendBeacon && fetch('api/chat/group-call-leave', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group: gc.group }) }); });

// Someone started the group's call: a ringing card, for up to 40 seconds.
function ringGroupCall(t, c, by) {
  stopRing();
  gc.ringing = t.id;
  const box = el('div', 'gc-ring');
  box.id = 'gc-ring';
  const tt = el('div', 't');
  const who = senderIn(t, by);
  tt.append(Object.assign(el('b', 'no-tr'), { textContent: titleOf(t) }),
    Object.assign(el('span', 'no-tr'), { textContent: tx(`${firstName(who.name)} গ্রুপ ${c.video ? 'ভিডিও' : 'ভয়েস'} কল শুরু করেছেন`, `${firstName(who.name)} started a group ${c.video ? 'video' : 'voice'} call`) }));
  const no = el('button', 'call-btn hang small');
  no.innerHTML = svg('phone');
  no.setAttribute('aria-label', 'বাদ দিন');
  no.addEventListener('click', stopRing);
  const yes = el('button', 'call-btn accept small');
  yes.innerHTML = svg(c.video ? 'video' : 'phone');
  yes.setAttribute('aria-label', 'যোগ দিন');
  yes.addEventListener('click', () => { stopRing(); go('chat'); openThread('g' + t.id); joinGroupCall(t, c.video); });
  box.append(threadAvatar(t, 'lg'), tt, no, yes);
  document.body.appendChild(box);
  gc.ringTimer = setTimeout(stopRing, 40000);
}
function stopRing() {
  clearTimeout(gc.ringTimer);
  gc.ringing = null;
  const r = $('gc-ring');
  if (r) r.remove();
}
