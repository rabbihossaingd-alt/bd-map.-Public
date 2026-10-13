// ---- Messenger: friends, one-to-one chat, voice and video calls ----
// Everything goes through the app's own server (see "Messenger" in server.js): messages are saved there and
// pushed to both people over one long-lived stream; calls are peer-to-peer (WebRTC) and the server only passes
// the set-up messages between the two browsers. Needs an account, and the two people must be friends.

const CHAT = { friends: [], incoming: [], outgoing: [], blocked: [], open: null, msgs: new Map(), stream: null, typing: new Map(), loaded: false };

async function chatApi(path, body) {
  const res = await fetch('api/chat/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
  if (!res.ok) throw new Error(data.error || 'server');
  return data;
}

// ---- small pieces ----
// "রাত ৯:০৫" — the way the time of day is said in Bangla; plain 9:05 PM in English.
function timeOf(ts) {
  const d = new Date(ts), h = d.getHours();
  if (LANG === 'en') return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const part = h < 4 ? 'রাত' : h < 6 ? 'ভোর' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকেল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
  return `${part} ${num(h % 12 || 12)}:${num(d.getMinutes()).padStart(2, num(0))}`;
}
function dayOf(ts) {
  const d = new Date(ts), today = new Date(), yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'আজ';
  if (d.toDateString() === yesterday.toDateString()) return 'গতকাল';
  return d.toLocaleDateString(NUM_LOCALE, { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
function callText(m, mine) {
  const c = m.body, what = c.video ? 'ভিডিও কল' : 'ভয়েস কল';
  if (c.result === 'ended') return `${what} · ${fmtMin(Math.max(1, Math.round(c.secs / 60)))}`;
  if (c.result === 'declined') return `${what} · ধরা হয়নি`;
  return mine ? `${what} · উত্তর মেলেনি` : `মিসড ${what}`;
}
const preview = (m, mine) => m.kind === 'text' ? m.body : m.kind === 'place' ? `📍 ${m.body.label}` : callText(m, mine);
const friendById = id => CHAT.friends.find(f => f.id === id);

let toastTimer = null;
function chatToast(person, text, onClick) {
  const box = $('chat-toast');
  box.replaceChildren(avatar(person, 'sm'), Object.assign(el('span', 't no-tr'), { textContent: '' }));
  const t = box.querySelector('.t');
  t.append(el('b', null, person.name), el('span', null, text));
  box.onclick = () => { box.classList.remove('on'); if (onClick) onClick(); };
  box.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('on'), 4500);
}

function setBadges() {
  const n = CHAT.friends.reduce((sum, f) => sum + f.unread, 0) + CHAT.incoming.length;
  for (const b of document.querySelectorAll('[data-chat-badge]')) {
    b.textContent = n > 99 ? '99+' : num(n);
    b.hidden = !n;
  }
}

// ---- the list of people ----
function renderList() {
  const reqBox = $('chat-requests'), list = $('chat-list');
  reqBox.replaceChildren();
  if (CHAT.incoming.length) reqBox.appendChild(el('div', 'label', 'আপনাকে ফলো করছেন'));
  for (const p of CHAT.incoming) {
    const row = el('div', 'person req');
    const t = el('div', 't no-tr');
    t.append(el('b', null, p.name), el('span', null, p.bio || ''));
    const yes = el('button', 'pill-btn', 'ফলো ব্যাক'), no = el('button', 'pill-btn quiet', 'সরান');
    t.addEventListener('click', () => openProfilePage(p.id));
    yes.addEventListener('click', () => chatApi('friend', { id: p.id }).then(loadChat));
    no.addEventListener('click', () => chatApi('unfriend', { id: p.id }).then(loadChat));
    row.append(avatar(p), t, yes, no);
    reqBox.appendChild(row);
  }
  list.replaceChildren();
  const sorted = [...CHAT.friends].sort((a, b) => (b.last ? b.last.sent : b.since) - (a.last ? a.last.sent : a.since));
  for (const f of sorted) {
    const row = el('button', 'person' + (CHAT.open === f.id ? ' on' : ''));
    const av = avatar(f);
    if (f.online) av.classList.add('online');
    const t = el('div', 't');
    const typing = CHAT.typing.has(f.id);
    const sub = el('span', typing ? 'typing' : 'no-tr', typing ? 'লিখছে…' : f.last ? (f.last.sender === f.id ? '' : '↗ ') + preview(f.last, f.last.sender !== f.id) : 'বন্ধু হয়েছেন — হাই বলুন 👋');
    if (f.last && f.last.kind === 'call') sub.classList.remove('no-tr');
    t.append(Object.assign(el('b', 'no-tr'), { textContent: f.name }), sub);
    const side = el('div', 'pside');
    if (f.last) side.appendChild(el('time', null, timeOf(f.last.sent)));
    if (f.unread) side.appendChild(el('span', 'count', num(f.unread)));
    row.append(av, t, side);
    row.addEventListener('click', () => openThread(f.id));
    list.appendChild(row);
  }
  for (const p of CHAT.outgoing) {
    const row = el('div', 'person wait');
    const t = el('div', 't');
    t.append(Object.assign(el('b', 'no-tr'), { textContent: p.name }), el('span', null, 'ফলো করছেন · ফলো ব্যাকের অপেক্ষায়'));
    t.addEventListener('click', () => openProfilePage(p.id));
    const cancel = el('button', 'pill-btn quiet', 'আনফলো');
    cancel.addEventListener('click', () => chatApi('unfollow', { id: p.id }).then(loadChat));
    row.append(avatar(p), t, cancel);
    list.appendChild(row);
  }
  if (!CHAT.friends.length && !CHAT.outgoing.length && !CHAT.incoming.length) {
    const empty = el('div', 'chat-none');
    empty.append(ic('chat'), el('b', null, 'এখনো কোনো কথোপকথন নেই'), el('span', null, 'নাম দিয়ে মানুষ খুঁজে ফলো করুন। দুজনই দুজনকে ফলো করলে মেসেজ ও কল করা যাবে।'));
    const add = button('search', 'মানুষ খুঁজুন', () => openPeopleSearch());
    empty.appendChild(add);
    list.appendChild(empty);
  }
  setBadges();
}

async function loadChat() {
  if (!ME) return;
  try {
    const data = await chatApi('list');
    Object.assign(CHAT, data, { loaded: true });
    if (CHAT.open && !friendById(CHAT.open)) closeThread();
    renderList();
    if (CHAT.open) renderHead();
  } catch { /* offline: the last list stays on screen */ }
}

// ---- one conversation ----
function renderHead() {
  const f = friendById(CHAT.open);
  if (!f) return;
  const who = $('chat-who');
  const av = avatar(f, 'sm');
  if (f.online) av.classList.add('online');
  const t = el('div', 't');
  t.append(Object.assign(el('b', 'no-tr'), { textContent: f.name }),
    el('span', CHAT.typing.has(f.id) ? 'typing' : '', CHAT.typing.has(f.id) ? 'লিখছে…' : f.online ? 'অনলাইন' : 'অফলাইন'));
  who.replaceChildren(av, t);
}

function bubble(m, f) {
  const mine = m.sender !== f.id;
  const row = el('div', 'msg ' + (mine ? 'me' : 'them'));
  row.dataset.id = m.id;
  let b;
  if (m.kind === 'place') {
    b = el('button', 'bubble place');
    const t = el('span', 't');
    t.append(Object.assign(el('b', 'no-tr'), { textContent: m.body.label }), el('span', null, 'ম্যাপে দেখুন'));
    b.append(ic('pin'), t);
    b.addEventListener('click', () => goTo({ lat: m.body.lat, lon: m.body.lon, label: m.body.label }));
  } else if (m.kind === 'call') {
    b = el('div', 'bubble call');
    b.append(ic(m.body.video ? 'video' : 'phone'), el('span', null, callText(m, mine)));
  } else {
    // A message of one to three emoji is shown large, without a bubble.
    const big = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*\s*){1,3}$/u.test(m.body);
    b = el('div', 'bubble no-tr' + (big ? ' emoji' : ''));
    b.textContent = m.body;
  }
  const meta = el('span', 'meta', timeOf(m.sent));
  if (mine) meta.appendChild(el('i', 'tick' + (m.seen ? ' seen' : ''), m.seen ? '✓✓' : '✓'));
  row.append(b, meta);
  return row;
}

function renderMsgs(scroll = true) {
  const f = friendById(CHAT.open), box = $('chat-msgs');
  if (!f) return;
  const msgs = CHAT.msgs.get(f.id) || [];
  box.replaceChildren();
  let day = '', prev = null;
  for (const m of msgs) {
    const d = dayOf(m.sent);
    if (d !== day) { day = d; box.appendChild(el('div', 'day', d)); prev = null; }
    const row = bubble(m, f);
    // Messages from the same person within two minutes sit together, with the time shown on the last one only.
    if (prev && prev.m.sender === m.sender && m.sent - prev.m.sent < 120_000) { prev.row.classList.add('joined'); row.classList.add('follows'); }
    box.appendChild(row);
    prev = { m, row };
  }
  if (!msgs.length) {
    const hello = el('div', 'chat-hello');
    hello.append(avatar(f, 'lg'), Object.assign(el('b', 'no-tr'), { textContent: f.name }), el('span', null, 'আপনারা একে অপরকে ফলো করছেন। প্রথম মেসেজটি পাঠান।'));
    box.appendChild(hello);
  }
  if (CHAT.typing.has(f.id)) {
    const dots = el('div', 'msg them');
    dots.appendChild(Object.assign(el('div', 'bubble dots'), { innerHTML: '<i></i><i></i><i></i>' }));
    box.appendChild(dots);
  }
  if (scroll) box.scrollTop = box.scrollHeight;
}

async function openThread(id) {
  CHAT.open = id;
  $('chat').classList.add('open');
  $('chat-empty').hidden = true;
  $('chat-thread').hidden = false;
  renderHead();
  renderList();
  renderMsgs();
  try {
    const { messages } = await chatApi('messages?with=' + id);
    if (CHAT.open !== id) return;
    CHAT.msgs.set(id, messages);
    renderMsgs();
    markRead(id);
  } catch { /* shown from what is already loaded */ }
  if (matchMedia('(min-width: 761px)').matches) $('chat-input').focus();
}
function closeThread() {
  CHAT.open = null;
  $('chat').classList.remove('open');
  $('chat-thread').hidden = true;
  $('chat-empty').hidden = false;
  renderList();
}
function markRead(id) {
  const f = friendById(id);
  if (!f || !f.unread || document.hidden || current !== 'chat') return;
  f.unread = 0;
  renderList();
  chatApi('read', { with: id }).catch(() => {});
}

function addMessage(m) {
  const other = m.sender === (ME && ME.id) ? m.to : m.sender;
  const f = friendById(other);
  if (!f) { loadChat(); return; }
  const list = CHAT.msgs.get(other) || (CHAT.msgs.set(other, []), CHAT.msgs.get(other));
  if (list.some(x => x.id === m.id)) return;
  list.push(m);
  f.last = m;
  const viewing = CHAT.open === other && current === 'chat' && !document.hidden;
  if (m.sender === other) {
    CHAT.typing.delete(other);
    if (viewing) chatApi('read', { with: other }).catch(() => {});
    else { f.unread++; chatToast(f, preview(m, false), () => { go('chat'); openThread(other); }); }
  }
  if (CHAT.open === other) {
    const box = $('chat-msgs'), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    renderMsgs(atEnd || m.sender !== other);
    const row = box.querySelector(`[data-id="${m.id}"]`);
    if (row) row.classList.add('new');
    renderHead();
  }
  renderList();
}

async function sendMessage(kind, body) {
  const to = CHAT.open;
  if (!to) return;
  try {
    const { message } = await chatApi('send', { to, kind, body });
    addMessage(message);
  } catch (e) {
    chatToast(friendById(to) || { id: 0, name: '!' }, e.message === 'slow' ? 'একটু ধীরে — অনেক মেসেজ একসাথে গেছে।' : 'মেসেজটি পাঠানো যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।');
  }
}

// ---- the live stream from the server ----
function connectChat() {
  if (CHAT.stream || !ME || !window.EventSource) return;
  const es = CHAT.stream = new EventSource('api/chat/stream');
  const on = (name, fn) => es.addEventListener(name, e => fn(JSON.parse(e.data)));
  on('message', addMessage);
  on('friends', loadChat);
  on('presence', p => { const f = friendById(p.id); if (f) { f.online = p.online; renderList(); if (CHAT.open === p.id) renderHead(); } });
  on('read', p => {
    for (const m of CHAT.msgs.get(p.by) || []) m.seen = 1;
    if (CHAT.open === p.by) for (const t of $('chat-msgs').querySelectorAll('.tick')) { t.textContent = '✓✓'; t.classList.add('seen'); }
  });
  on('typing', p => {
    clearTimeout(CHAT.typing.get(p.from));
    CHAT.typing.set(p.from, setTimeout(() => { CHAT.typing.delete(p.from); refreshTyping(p.from); }, 4000));
    refreshTyping(p.from);
  });
  on('signal', p => onSignal(p.from, p.data));
  on('support', () => { if (typeof loadTickets === 'function') loadTickets(); });
  es.onopen = () => { if (CHAT.loaded) loadChat(); };      // back online: catch up on anything missed
}
function refreshTyping(id) {
  renderList();
  if (CHAT.open === id) { renderHead(); const box = $('chat-msgs'); renderMsgs(box.scrollHeight - box.scrollTop - box.clientHeight < 140); }
}
function disconnectChat() {
  if (CHAT.stream) CHAT.stream.close();
  Object.assign(CHAT, { stream: null, friends: [], incoming: [], outgoing: [], blocked: [], open: null, loaded: false });
  CHAT.msgs.clear();
}

// Called by account.js whenever someone logs in or out.
function chatAuthChanged() {
  $('chat-gate').hidden = !!ME;
  $('chat').hidden = !ME;
  for (const b of document.querySelectorAll('.chat-btn')) b.hidden = false;
  if (ME) { connectChat(); loadChat(); } else { endCall(); disconnectChat(); closeThread(); renderList(); }
}

// ---- adding a friend ----
function openAddFriend() {
  const input = el('input');
  Object.assign(input, { type: 'email', inputMode: 'email', placeholder: 'friend@gmail.com', maxLength: 120, autocomplete: 'off' });
  const field = el('label', 'money');
  field.append(el('span', null, 'বন্ধুর ই-মেইল'), input);
  const result = el('div');
  const note = el('div', 'form-note', 'যে ই-মেইল দিয়ে তিনি BD Map-এ অ্যাকাউন্ট খুলেছেন, সেটি লিখুন।');
  const find = button('search', 'খুঁজুন', async () => {
    result.replaceChildren();
    note.className = 'form-note';
    try {
      const { user } = await chatApi('find?email=' + encodeURIComponent(input.value.trim()));
      const row = el('div', 'person found');
      const t = el('div', 't no-tr');
      t.append(el('b', null, user.name), el('span', null, user.bio || input.value.trim()));
      const labels = { friends: 'আগে থেকেই বন্ধু', sent: 'অনুরোধ পাঠানো আছে', received: 'অনুরোধ গ্রহণ করুন', none: 'অনুরোধ পাঠান' };
      const act = el('button', 'pill-btn', labels[user.state]);
      act.disabled = user.state === 'friends' || user.state === 'sent';
      act.addEventListener('click', async () => { act.disabled = true; await chatApi('friend', { id: user.id }); act.textContent = user.state === 'received' ? 'এখন বন্ধু' : 'অনুরোধ পাঠানো হয়েছে'; loadChat(); });
      row.append(avatar(user), t, act);
      result.appendChild(row);
      note.textContent = '';
    } catch (e) {
      note.className = 'form-note bad';
      note.textContent = e.message === 'email' ? 'ই-মেইল ঠিকানাটি ঠিক নয়।' : e.message === 'none' ? 'এই ই-মেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।'
                       : e.message === 'self' ? 'এটি আপনার নিজের ই-মেইল।' : 'খোঁজা যায়নি। একটু পরে আবার চেষ্টা করুন।';
    }
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') find.click(); });
  openModal('বন্ধু যোগ করুন', 'ই-মেইল দিয়ে খুঁজুন', [field, result, note], [find]);
  input.focus();
}

// Unfriend, block, report — and the list of people you have blocked.
function openThreadMenu() {
  const f = friendById(CHAT.open);
  if (!f) return;
  const act = (text, cls, fn) => { const b = el('button', 'menu-row ' + cls, text); b.addEventListener('click', fn); return b; };
  const done = () => { closeModal(); closeThread(); loadChat(); };
  openModal(f.name, f.bio || '', [
    act('প্রোফাইল দেখুন', '', () => showProfile(f)),
    act('আনফলো করুন', '', () => chatApi('unfollow', { id: f.id }).then(done)),
    act('ব্লক করুন — আর মেসেজ বা কল আসবে না', 'bad', () => chatApi('block', { id: f.id }).then(done)),
    act('রিপোর্ট করুন ও ব্লক করুন', 'bad', () => openReport(f, done))
  ]);
  $('m-title').classList.add('no-tr');
  $('m-sub').classList.add('no-tr');
}
// Why someone is being reported. The report goes to the people who run the app; the person is blocked too.
function openReport(f, done) {
  const reasons = ['বাজে বা অশ্লীল কথা', 'হয়রানি বা হুমকি', 'স্প্যাম বা প্রতারণা', 'অন্যের নাম-পরিচয় ব্যবহার', 'অন্য কারণ'];
  const [moreBox, more] = field('আরও কিছু জানাতে চাইলে লিখুন', { rows: 2, maxLength: 200 }, 'textarea');
  let picked = reasons[0];
  const chips = el('div', 'chips');
  for (const r of reasons) {
    const c = el('button', 'chip' + (r === picked ? ' on' : ''), r);
    c.addEventListener('click', () => { picked = r; for (const x of chips.children) x.classList.toggle('on', x === c); });
    chips.appendChild(c);
  }
  const send = button('shield', 'রিপোর্ট পাঠান ও ব্লক করুন', () =>
    chatApi('report', { id: f.id, reason: (picked + (more.value.trim() ? ' — ' + more.value.trim() : '')).slice(0, 300) }).then(() => chatApi('block', { id: f.id })).then(done));
  openModal('রিপোর্ট করুন', f.name, [chips, moreBox, el('div', 'form-note', 'আমাদের টিম রিপোর্টটি দেখবে। আপনার মেসেজগুলো আমরা পড়তে পারি না, তাই কী হয়েছে লিখে দিলে সুবিধা হয়।')], [send]);
  $('m-sub').classList.add('no-tr');
}
function openBlocked() {
  const rows = CHAT.blocked.map(p => {
    const row = el('div', 'person');
    const t = el('div', 't no-tr');
    t.append(el('b', null, p.name), el('span', null, p.bio || ''));
    const un = el('button', 'pill-btn quiet', 'ব্লক তুলুন');
    un.addEventListener('click', () => chatApi('unblock', { id: p.id }).then(() => { row.remove(); loadChat(); }));
    row.append(avatar(p), t, un);
    return row;
  });
  openModal('ব্লক করা মানুষ', '', rows.length ? rows : [el('div', 'empty', 'আপনি কাউকে ব্লক করেননি।')]);
}

// Share a place: where you are now, or the place open on the map.
function openShare() {
  const rows = [];
  const add = (icon, title, sub, fn) => { rows.push(item(icon, title, sub, '', fn)); };
  add('locate', 'আমার এখনকার লোকেশন', 'একবার পাঠানো হবে, লাইভ নয়', () => {
    if (!navigator.geolocation) { closeModal(); return; }
    navigator.geolocation.getCurrentPosition(p => { closeModal(); sendMessage('place', { lat: p.coords.latitude, lon: p.coords.longitude, label: 'আমার লোকেশন' }); },
      () => { closeModal(); chatToast(friendById(CHAT.open), 'লোকেশনের অনুমতি পাওয়া যায়নি।'); }, { enableHighAccuracy: true, timeout: 10000 });
  });
  for (const p of [trip.to, trip.from]) if (p) add('pin', p.label, 'ম্যাপে খোলা জায়গা', () => { closeModal(); sendMessage('place', { lat: p.lat, lon: p.lon, label: p.label }); });
  openModal('জায়গা পাঠান', '', rows);
}

// ---- calls (WebRTC) ----
// idle -> calling (I rang) / ringing (they rang) -> live -> idle. Only the caller writes the call into the chat.
const call = { state: 'idle', peer: null, pc: null, media: null, video: false, mine: false, offer: null, ice: [], ring: null, clock: null, started: 0 };
let iceServers = null;

function signal(data) { return chatApi('signal', { to: call.peer.id, data }); }

function showCall(status) {
  const box = $('call');
  box.hidden = false;
  box.dataset.state = call.state;
  box.classList.toggle('video', call.video);
  $('call-name').textContent = call.peer.name;
  $('call-status').textContent = status;
  $('call-avatar').replaceChildren(avatar(call.peer, 'xl'));
  $('call-accept').hidden = call.state !== 'ringing';
  $('call-mic').hidden = $('call-cam').hidden = call.state === 'ringing';
  if (!call.video) $('call-cam').hidden = true;
}

async function newPeer() {
  if (!iceServers) iceServers = (await chatApi('ice')).iceServers;
  const pc = call.pc = new RTCPeerConnection({ iceServers });
  for (const track of call.media.getTracks()) pc.addTrack(track, call.media);
  pc.onicecandidate = e => { if (e.candidate) signal({ type: 'ice', candidate: e.candidate }).catch(() => {}); };
  pc.ontrack = e => { $('call-remote').srcObject = e.streams[0]; };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected' && call.state !== 'live') goLive();
    if (pc.connectionState === 'failed') endCall('সংযোগ করা যায়নি। দুজনের নেটওয়ার্ক দেখে আবার চেষ্টা করুন।', true);
  };
  $('call-local').srcObject = call.media;
  return pc;
}
function goLive() {
  call.state = 'live';
  call.started = Date.now();
  clearTimeout(call.ring);
  showCall('০০:০০');
  call.clock = setInterval(() => {
    const s = Math.floor((Date.now() - call.started) / 1000);
    $('call-status').textContent = `${num(Math.floor(s / 60)).padStart(2, num(0))}:${num(s % 60).padStart(2, num(0))}`;
  }, 1000);
}
async function getMedia(video) {
  try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { facingMode: 'user' } : false }); }
  catch { return null; }
}

async function startCall(video) {
  const f = friendById(CHAT.open);
  if (!f || call.state !== 'idle') return;
  if (!navigator.mediaDevices || !window.RTCPeerConnection) { chatToast(f, 'এই ব্রাউজারে কল করা যায় না।'); return; }
  Object.assign(call, { state: 'calling', peer: f, video, mine: true, ice: [] });
  showCall('কল করা হচ্ছে…');
  call.media = await getMedia(video);
  if (!call.media) { endCall(video ? 'ক্যামেরা ও মাইক্রোফোনের অনুমতি দিন।' : 'মাইক্রোফোনের অনুমতি দিন।', true); return; }
  if (call.state !== 'calling') { stopMedia(); return; }
  try {
    const pc = await newPeer();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const { online } = await signal({ type: 'offer', sdp: offer.sdp, video });
    if (!online) { logCall('missed'); endCall(`${f.name} এখন অফলাইন।`, true); return; }
    showCall('রিং হচ্ছে…');
    call.ring = setTimeout(() => { signal({ type: 'end' }).catch(() => {}); logCall('missed'); endCall('উত্তর মেলেনি।', true); }, 40000);
  } catch { endCall('কল শুরু করা যায়নি।', true); }
}

async function acceptCall() {
  if (call.state !== 'ringing') return;
  $('call-accept').hidden = true;
  $('call-status').textContent = 'সংযোগ হচ্ছে…';
  call.media = await getMedia(call.video);
  if (!call.media) { signal({ type: 'decline' }).catch(() => {}); endCall(call.video ? 'ক্যামেরা ও মাইক্রোফোনের অনুমতি দিন।' : 'মাইক্রোফোনের অনুমতি দিন।', true); return; }
  try {
    const pc = await newPeer();
    await pc.setRemoteDescription({ type: 'offer', sdp: call.offer });
    for (const c of call.ice.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await signal({ type: 'answer', sdp: answer.sdp });
    call.state = 'connecting';
    showCall('সংযোগ হচ্ছে…');
  } catch { signal({ type: 'end' }).catch(() => {}); endCall('কল ধরা যায়নি।', true); }
}

async function onSignal(from, data) {
  const f = friendById(from);
  if (!f || !data) return;
  if (data.type === 'offer') {
    if (call.state !== 'idle') { chatApi('signal', { to: from, data: { type: 'busy' } }).catch(() => {}); return; }
    Object.assign(call, { state: 'ringing', peer: f, video: !!data.video, mine: false, offer: data.sdp, ice: [] });
    showCall(data.video ? 'ভিডিও কল আসছে…' : 'ভয়েস কল আসছে…');
    call.ring = setTimeout(() => endCall(), 45000);
    return;
  }
  if (!call.peer || call.peer.id !== from) return;
  if (data.type === 'answer' && call.pc) {
    await call.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }).catch(() => {});
    for (const c of call.ice.splice(0)) await call.pc.addIceCandidate(c).catch(() => {});
    clearTimeout(call.ring);
    $('call-status').textContent = 'সংযোগ হচ্ছে…';
  } else if (data.type === 'ice') {
    if (call.pc && call.pc.remoteDescription) call.pc.addIceCandidate(data.candidate).catch(() => {});
    else call.ice.push(data.candidate);
  } else if (data.type === 'decline') { logCall('declined'); endCall('কলটি ধরা হয়নি।', true); }
  else if (data.type === 'busy') { logCall('missed'); endCall(`${f.name} অন্য কলে আছেন।`, true); }
  else if (data.type === 'end') { if (call.state === 'live') logCall('ended'); endCall(call.state === 'live' ? 'কল শেষ।' : '', call.state === 'live'); }
}

// The caller records the call in the conversation, so it appears once.
function logCall(result) {
  if (!call.mine || !call.peer) return;
  const secs = call.started ? Math.round((Date.now() - call.started) / 1000) : 0;
  chatApi('send', { to: call.peer.id, kind: 'call', body: { video: call.video, result, secs } }).then(r => addMessage(r.message)).catch(() => {});
  call.mine = false;
}
function stopMedia() {
  if (call.media) for (const t of call.media.getTracks()) t.stop();
  call.media = null;
}
function endCall(message, linger) {
  clearTimeout(call.ring);
  clearInterval(call.clock);
  if (call.pc) { call.pc.onconnectionstatechange = null; call.pc.close(); }
  stopMedia();
  $('call-remote').srcObject = $('call-local').srcObject = null;
  Object.assign(call, { state: 'idle', pc: null, offer: null, ice: [], started: 0, peer: linger ? call.peer : null });
  const box = $('call');
  if (message && !box.hidden) {
    box.dataset.state = 'over';
    $('call-status').textContent = message;
    $('call-accept').hidden = $('call-mic').hidden = $('call-cam').hidden = true;
    setTimeout(() => { if (call.state === 'idle') { box.hidden = true; call.peer = null; } }, 2200);
  } else { box.hidden = true; call.peer = null; }
}
function hangUp() {
  if (call.state === 'idle') { $('call').hidden = true; return; }
  const was = call.state;
  signal({ type: was === 'ringing' ? 'decline' : 'end' }).catch(() => {});
  if (was === 'live') logCall('ended'); else if (was === 'calling') logCall('missed');
  endCall();
}

// ---- wiring ----
(function initChat() {
  const input = $('chat-input'), send = $('chat-send');
  const refreshSend = () => { send.classList.toggle('like', !input.value.trim()); };
  let lastTyping = 0;
  input.addEventListener('input', () => {
    refreshSend();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 132) + 'px';
    if (CHAT.open && Date.now() - lastTyping > 2500) { lastTyping = Date.now(); chatApi('typing', { to: CHAT.open }).catch(() => {}); }
  });
  const submit = () => {
    const text = input.value.trim();
    sendMessage('text', text || '👍');
    input.value = '';
    input.style.height = 'auto';
    refreshSend();
    send.classList.add('sent');
    setTimeout(() => send.classList.remove('sent'), 350);
  };
  $('chat-form').addEventListener('submit', e => { e.preventDefault(); submit(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(min-width: 761px)').matches) { e.preventDefault(); submit(); } });
  refreshSend();

  $('chat-back').addEventListener('click', closeThread);
  $('chat-add').addEventListener('click', () => openPeopleSearch());   // defined in a later file: looked up when clicked
  $('chat-blocked').addEventListener('click', openBlocked);
  $('chat-more').addEventListener('click', openThreadMenu);
  $('chat-who').addEventListener('click', () => { const f = friendById(CHAT.open); if (f) showProfile(f); });
  $('chat-share').addEventListener('click', openShare);
  $('chat-voice').addEventListener('click', () => startCall(false));
  $('chat-video').addEventListener('click', () => startCall(true));
  $('chat-login').addEventListener('click', () => openLogin());
  $('call-hang').addEventListener('click', hangUp);
  $('call-accept').addEventListener('click', acceptCall);
  $('call-mic').addEventListener('click', e => {
    const track = call.media && call.media.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; e.currentTarget.classList.toggle('off', !track.enabled); }
  });
  $('call-cam').addEventListener('click', e => {
    const track = call.media && call.media.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; e.currentTarget.classList.toggle('off', !track.enabled); }
  });
  for (const b of document.querySelectorAll('.chat-btn')) b.addEventListener('click', () => go('chat'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && CHAT.open) markRead(CHAT.open); });
  addEventListener('beforeunload', () => { if (call.state !== 'idle') hangUp(); });

  enter.chat = () => { if (ME) { loadChat(); if (CHAT.open) markRead(CHAT.open); } };
  chatAuthChanged();
})();
