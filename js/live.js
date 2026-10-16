// ---- Live: go live from the camera, watch who is live, comment and send hearts ----
// The picture goes from the broadcaster's browser to each viewer's (WebRTC; the broadcaster offers, the server
// passes the signals — see liveApi in server.js). The Live tab in Explore shows only lives; the feed shows them
// at the top too. A live is not recorded.

async function liveApi(path, body) {
  const res = await fetch('api/live/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
  if (!res.ok) throw new Error(data.error || 'server');
  return data;
}
const tl = (bn, en) => (LANG === 'en' ? en : bn);
let LIVE = null;          // the live I am in: { id, host: bool, ... }

// ---- the events from the server ----
let liveBound = null;
function liveEvents(on, es) {
  if (es && liveBound === es) return;
  liveBound = es;
  on('live-join', d => { if (LIVE && LIVE.host && LIVE.id === d.live) hostConnect(d.viewer.id); });
  on('live-leave', d => { if (LIVE && LIVE.host && LIVE.id === d.live) { const pc = LIVE.pcs.get(d.viewer); if (pc) pc.close(); LIVE.pcs.delete(d.viewer); } });
  on('live-signal', d => { if (LIVE && LIVE.id === d.live) (LIVE.host ? hostSignal : viewerSignal)(d.from, d.data); });
  on('live-count', d => { if (LIVE && LIVE.id === d.live) LIVE.paintCount(d.viewers); });
  on('live-comment', d => { if (LIVE && LIVE.id === d.live) LIVE.addComment(d.comment); });
  on('live-heart', d => { if (LIVE && LIVE.id === d.live) floatHeart(LIVE.box); });
  on('live-end', d => { if (LIVE && LIVE.id === d.live && !LIVE.host) LIVE.ended(); });
  on('live-start', card => {
    chatToast(card.user, tl('স্ট্রিমে এসেছেন — দেখতে চাপুন', 'is live — tap to watch'), () => watchLive(card));
    if (current === 'explore' && typeof enter.explore === 'function') liveIntoFeed($('explore-feed'));
  });
}
// live.js loads last; the stream may already be open
if (typeof CHAT === 'object' && CHAT.stream) liveEvents((name, fn) => CHAT.stream.addEventListener(name, e => fn(JSON.parse(e.data))), CHAT.stream);

const sig = (to, data) => liveApi('signal', { id: LIVE.id, to, data }).catch(() => {});

// ---- the broadcaster: one connection per viewer ----
async function hostConnect(viewer) {
  const old = LIVE.pcs.get(viewer);
  if (old) old.close();
  const pc = new RTCPeerConnection({ iceServers: LIVE.ice });
  pc._wait = [];
  LIVE.pcs.set(viewer, pc);
  for (const t of LIVE.stream.getTracks()) pc.addTrack(t, LIVE.stream);
  pc.onicecandidate = e => { if (e.candidate) sig(viewer, { cand: e.candidate }); };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { if (LIVE && LIVE.pcs.get(viewer) === pc) LIVE.pcs.delete(viewer); } };
  await pc.setLocalDescription(await pc.createOffer());
  sig(viewer, { sdp: pc.localDescription });
}
async function hostSignal(from, data) {
  const pc = LIVE.pcs.get(from);
  if (!pc) return;
  try {
    if (data.sdp) { await pc.setRemoteDescription(data.sdp); for (const c of pc._wait.splice(0)) await pc.addIceCandidate(c); }
    else if (data.cand) { if (pc.remoteDescription) await pc.addIceCandidate(data.cand); else pc._wait.push(data.cand); }
  } catch { /* a stale signal */ }
}
// ---- a viewer: one connection to the broadcaster ----
async function viewerSignal(from, data) {
  if (from !== LIVE.hostId) return;
  try {
    if (data.sdp && data.sdp.type === 'offer') {
      if (LIVE.pc) LIVE.pc.close();
      const pc = LIVE.pc = new RTCPeerConnection({ iceServers: LIVE.ice });
      pc._wait = [];
      pc.ontrack = e => LIVE.gotStream(e.streams[0]);
      pc.onicecandidate = e => { if (e.candidate) sig(from, { cand: e.candidate }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') LIVE.retry(); };
      await pc.setRemoteDescription(data.sdp);
      for (const c of pc._wait.splice(0)) await pc.addIceCandidate(c);
      await pc.setLocalDescription(await pc.createAnswer());
      sig(from, { sdp: pc.localDescription });
    } else if (data.cand) {
      const pc = LIVE.pc;
      if (pc && pc.remoteDescription) await pc.addIceCandidate(data.cand);
      else if (pc) pc._wait.push(data.cand);
      else (LIVE.early = LIVE.early || []).push(data.cand);
    }
  } catch { /* a stale signal */ }
}

// ---- the room: what the broadcaster and the viewers both see ----
function liveRoom(host) {
  const box = el('div', 'live-room' + (host ? ' host' : ''));
  const video = Object.assign(el('video', 'lv-video'), { autoplay: true, playsInline: true, muted: host });
  const shade = el('div', 'lv-shade');
  const top = el('div', 'lv-top');
  const badge = el('span', 'lv-badge', 'LIVE');
  const count = el('span', 'lv-count');
  count.append(ic('eye'), el('b', null, '0'));
  const comments = el('div', 'lv-comments');
  const bottom = el('div', 'lv-bottom');
  box.append(video, shade, top, comments, bottom);
  return { box, video, top, badge, count, comments, bottom,
    paintCount: n => { count.lastChild.textContent = num(n); },
    addComment: c => {
      const row = el('div', 'lv-c no-tr');
      row.append(avatar(c.user, 'xs'), Object.assign(el('span'), { innerHTML: '' }));
      row.lastChild.append(el('b', null, c.user.name), document.createTextNode(' ' + c.body));
      comments.appendChild(row);
      while (comments.children.length > 40) comments.firstChild.remove();
      comments.scrollTop = comments.scrollHeight;
    } };
}
function floatHeart(box) {
  const h = el('i', 'lv-heart', ['❤️', '💖', '🧡', '💜', '💙'][Math.floor(Math.random() * 5)]);
  h.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
  box.appendChild(h);
  setTimeout(() => h.remove(), 2600);
}
function commentBar(room, extra) {
  const form = el('form', 'lv-form');
  const input = Object.assign(el('input'), { placeholder: tl('মন্তব্য লিখুন…', 'Add a comment…'), maxLength: 200, autocomplete: 'off' });
  form.appendChild(input);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !LIVE) return;
    input.value = '';
    liveApi('comment', { id: LIVE.id, body: text }).catch(() => { input.value = text; });
  });
  const heart = el('button', 'lv-icon lv-like');
  heart.type = 'button';
  heart.innerHTML = svg('heart');
  heart.setAttribute('aria-label', tl('লাইক', 'Like'));
  heart.addEventListener('click', () => { if (!LIVE) return; floatHeart(room.box); liveApi('heart', { id: LIVE.id }).catch(() => {}); });
  room.bottom.append(form, ...(extra || []), heart);
}
const liveClock = t0 => { const s = Math.floor((Date.now() - t0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---- go live ----
async function startStream() {
  if (!ME) { openLogin(); return; }
  if (LIVE) return;
  const room = liveRoom(true);
  document.body.appendChild(room.box);
  document.body.classList.add('reels-open');
  let stream = null, facing = 'user', t0 = 0, ping = 0, clock = 0, closed = false;
  const x = el('button', 'lv-icon lv-x');
  x.innerHTML = svg('close');
  x.setAttribute('aria-label', tl('বন্ধ করুন', 'Close'));
  const flip = el('button', 'lv-icon');
  flip.innerHTML = svg('flip');
  flip.setAttribute('aria-label', tl('ক্যামেরা ঘোরান', 'Flip camera'));
  const mic = el('button', 'lv-icon');
  mic.innerHTML = svg('mic');
  mic.setAttribute('aria-label', tl('মাইক', 'Microphone'));
  const timer = el('span', 'lv-timer');
  const left = el('div', 'lv-left');
  left.append(room.badge, timer, room.count);
  const right = el('div', 'lv-right');
  right.append(flip, mic, x);
  room.top.append(left, right);
  room.badge.hidden = timer.hidden = room.count.hidden = true;
  const setup = el('div', 'lv-setup');
  const title = Object.assign(el('input', 'lv-title'), { placeholder: tl('কী নিয়ে স্ট্রিম? (যেমন: সাজেকের সূর্যোদয়)', 'What is your live about?'), maxLength: 80 });
  const start = el('button', 'lv-start');
  start.append(el('i', 'live-dot'), el('span', null, tl('স্ট্রিম শুরু করুন', 'Go live')));
  const note = el('small', 'lv-note', tl('যাঁরা আপনাকে ফলো করেন তাঁরা জানতে পারবেন। একসাথে ২৫ জন দেখতে পারবেন।', 'Your followers are told. Up to 25 people can watch at once.'));
  setup.append(title, start, note);
  room.box.appendChild(setup);
  const getCam = async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30 } }, audio: { echoCancellation: true, noiseSuppression: true } });
    room.video.srcObject = s;
    room.video.classList.toggle('mirror', facing === 'user');
    return s;
  };
  try { stream = await getCam(); }
  catch { start.disabled = true; note.textContent = tl('ক্যামেরা বা মাইকের অনুমতি পাওয়া যায়নি।', 'Camera or microphone not allowed.'); }
  const finish = async () => {
    if (closed) return;
    closed = true;
    clearInterval(ping); clearInterval(clock);
    removeEventListener('pagehide', onHide);
    if (LIVE) {
      for (const pc of LIVE.pcs.values()) pc.close();
      liveApi('end', { id: LIVE.id }).catch(() => {});
      const secs = Math.floor((Date.now() - t0) / 1000);
      LIVE = null;
      chatToast(ME, tl(`স্ট্রিম শেষ — ${num(Math.floor(secs / 60))} মিনিট ${num(secs % 60)} সেকেন্ড`, `Live ended — ${Math.floor(secs / 60)}m ${secs % 60}s`));
    }
    if (stream) stream.getTracks().forEach(t => t.stop());
    room.box.remove();
    document.body.classList.remove('reels-open');
    if (current === 'explore') enter.explore();
  };
  const onHide = () => { if (LIVE) fetch('api/live/end', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: LIVE.id }) }); };
  x.addEventListener('click', () => { if (!LIVE || confirm(tl('স্ট্রিম শেষ করবেন?', 'End your live?'))) finish(); });
  flip.addEventListener('click', async () => {
    facing = facing === 'user' ? 'environment' : 'user';
    try {
      const s = await getCam();
      const vt = s.getVideoTracks()[0], at = s.getAudioTracks()[0];
      if (LIVE) for (const pc of LIVE.pcs.values()) for (const snd of pc.getSenders()) { if (snd.track && snd.track.kind === 'video') snd.replaceTrack(vt); if (snd.track && snd.track.kind === 'audio' && at) snd.replaceTrack(at); }
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = s;
      if (LIVE) LIVE.stream = s;
      if (mic.classList.contains('off')) at.enabled = false;
    } catch { facing = facing === 'user' ? 'environment' : 'user'; }
  });
  mic.addEventListener('click', () => { const on = mic.classList.toggle('off'); if (stream) for (const t of stream.getAudioTracks()) t.enabled = !on; });
  start.addEventListener('click', async () => {
    start.disabled = true;
    try {
      const d = await liveApi('start', { title: title.value });
      LIVE = { id: d.live.id, host: true, ice: d.iceServers, pcs: new Map(), stream, box: room.box, paintCount: room.paintCount, addComment: room.addComment };
      t0 = Date.now();
      setup.remove();
      room.badge.hidden = timer.hidden = room.count.hidden = false;
      clock = setInterval(() => { timer.textContent = liveClock(t0); }, 500);
      ping = setInterval(() => liveApi('ping', { id: LIVE.id }).then(r => room.paintCount(r.viewers)).catch(e => { if (e.message === 'ended') finish(); }), 10_000);
      addEventListener('pagehide', onHide);
      commentBar(room);
      room.addComment({ user: ME, body: tl('স্ট্রিম শুরু হয়েছে 👋', 'Live started 👋') });
    } catch (e) {
      start.disabled = false;
      note.textContent = e.message === 'closed' ? tl('এই মুহূর্তে স্ট্রিম বন্ধ আছে।', 'Lives are off right now.') : tl('স্ট্রিম শুরু করা যায়নি। আবার চেষ্টা করুন।', 'Could not go live. Try again.');
    }
  });
}

// ---- watch: full screen, or inside a page of the Stream pager (`into`) ----
async function watchLive(card, into) {
  if (!ME) { openLogin(); return; }
  if (LIVE && LIVE.host) return;
  if (LIVE && LIVE.close) LIVE.close();
  if (card.user.id === ME.id) return;
  const room = liveRoom(false);
  if (into) { room.box.classList.add('embedded'); into.appendChild(room.box); }
  else { document.body.appendChild(room.box); document.body.classList.add('reels-open'); }
  const who = el('button', 'lv-who');
  who.append(avatar(card.user, 'sm'), nameEl(card.user));
  const x = el('button', 'lv-icon lv-x');
  x.innerHTML = svg('close');
  x.setAttribute('aria-label', tl('বন্ধ করুন', 'Close'));
  const left = el('div', 'lv-left');
  left.append(who, room.badge, room.count);
  const right = el('div', 'lv-right');
  right.appendChild(x);
  room.top.append(left, right);
  if (card.title) room.top.after(Object.assign(el('div', 'lv-caption no-tr'), { textContent: card.title }));
  const status = el('div', 'lv-status', tl('সংযোগ হচ্ছে…', 'Connecting…'));
  const unmute = el('button', 'lv-unmute');
  unmute.append(ic('sound'), el('span', null, tl('শব্দ চালু করুন', 'Tap for sound')));
  unmute.hidden = true;
  unmute.addEventListener('click', () => { room.video.muted = false; room.video.play().catch(() => {}); unmute.hidden = true; });
  room.box.append(status, unmute);
  let tries = 0, waitTimer = 0;
  const close = () => {
    clearTimeout(waitTimer);
    if (LIVE && LIVE.pc) LIVE.pc.close();
    if (LIVE) liveApi('leave', { id: LIVE.id }).catch(() => {});
    LIVE = null;
    room.box.remove();
    if (!into) document.body.classList.remove('reels-open');
  };
  x.addEventListener('click', close);
  if (into) x.hidden = true;                    // the pager has its own close
  who.addEventListener('click', () => { close(); openProfilePage(card.user.id); });
  const join = async () => {
    try {
      const d = await liveApi('join', { id: card.id });
      LIVE.ice = d.iceServers;
      room.paintCount(d.live.viewers);
      if (!LIVE.joined) { LIVE.joined = true; d.comments.forEach(room.addComment); }
      clearTimeout(waitTimer);
      waitTimer = setTimeout(() => { if (LIVE && !LIVE.playing) LIVE.retry(); }, 15_000);
    } catch (e) {
      if (e.message === 'ended') LIVE.ended();
      else status.textContent = e.message === 'full' ? tl('স্ট্রিমটি ভরে গেছে (২৫ জন)। একটু পরে চেষ্টা করুন।', 'This live is full (25 viewers).') : tl('যোগ দেওয়া যায়নি।', 'Could not join.');
    }
  };
  LIVE = { id: card.id, host: false, hostId: card.user.id, ice: [], box: room.box, close, paintCount: room.paintCount, addComment: room.addComment,
    gotStream: s => {
      room.video.srcObject = s;
      LIVE.playing = true;
      status.hidden = true;
      room.video.muted = false;
      room.video.play().catch(() => { room.video.muted = true; room.video.play().catch(() => {}); unmute.hidden = false; });
    },
    retry: () => { if (!LIVE || ++tries > 3) { status.textContent = tl('ভিডিও আসছে না — সংযোগ দেখে আবার খুলুন।', 'No video — check the connection and open it again.'); return; } status.hidden = false; status.textContent = tl('আবার সংযোগ হচ্ছে…', 'Reconnecting…'); join(); },
    ended: () => {
      clearTimeout(waitTimer);
      if (LIVE && LIVE.pc) LIVE.pc.close();
      status.hidden = false;
      status.classList.add('end');
      status.replaceChildren(el('b', null, tl('স্ট্রিম শেষ হয়েছে', 'This live has ended')), button('close', tl('বন্ধ করুন', 'Close'), close));
      LIVE.id = -1;
    } };
  commentBar(room);
  join();
}

// ---- Stream: only lives, one per screen, swiped up and down like reels ----
async function openLiveHub() {
  const box = el('div', 'live-hub');
  const top = el('div', 'lh-top');
  const x = el('button', 'lv-icon');
  x.innerHTML = svg('close');
  x.setAttribute('aria-label', tl('বন্ধ করুন', 'Close'));
  const title = el('div', 'lh-title');
  title.append(Object.assign(el('span', 'lh-ic'), { innerHTML: svg('broadcast') }), el('b', null, 'Stream'));
  const go2 = el('button', 'lv-start small');
  go2.append(svgEl('camera'), el('span', null, tl('স্ট্রিম শুরু', 'Go live')));
  top.append(x, title, go2);
  const pager = el('div', 'lh-pager');
  box.append(pager, top);
  document.body.appendChild(box);
  document.body.classList.add('reels-open');
  let timer = 0, onPage = null, known = new Map();
  const tabs = $('ex-tabs');
  const restoreTab = () => { if (tabs) [...tabs.children].forEach((b2, i) => b2.classList.toggle('on', i === 0)); };
  if (tabs) [...tabs.children].forEach(b2 => b2.classList.toggle('on', b2.dataset.t === 'live'));
  const leave = () => { if (LIVE && !LIVE.host && LIVE.close) LIVE.close(); onPage = null; };
  const close = () => { clearInterval(timer); leave(); watcher.disconnect(); box.remove(); if (!document.querySelector('.live-room')) document.body.classList.remove('reels-open'); restoreTab(); };
  x.addEventListener('click', close);
  go2.addEventListener('click', () => { close(); startStream(); });
  // the page on screen joins its live; the one that leaves, leaves
  const watcher = new IntersectionObserver(entries => {
    for (const e of entries) {
      const page = e.target;
      if (e.isIntersecting && e.intersectionRatio > .6 && onPage !== page) {
        leave();
        onPage = page;
        watchLive(page._live, page.querySelector('.sp-stage'));
      }
    }
  }, { root: pager, threshold: [0, .6] });
  const pageFor = l => {
    const page = el('section', 'sp-page');
    page._live = l;
    const stage = el('div', 'sp-stage');
    const cover = el('div', 'sp-cover');
    if (l.user.pic) cover.style.backgroundImage = `url("api/avatar/${l.user.id}?v=${l.user.pic}")`;
    const face = el('span', 'sp-face');
    face.appendChild(avatar(l.user, 'xl'));
    stage.append(cover, face);
    page.appendChild(stage);
    watcher.observe(page);
    return page;
  };
  const empty = () => {
    const none = el('section', 'sp-page sp-empty');
    none.innerHTML = '<span class="orb o1"></span><span class="orb o2"></span><span class="orb o3"></span>';
    const inner = el('div', 'sp-empty-in');
    const mark = el('span', 'sp-mark');
    mark.innerHTML = svg('broadcast');
    const cta = el('button', 'lv-start');
    cta.append(svgEl('camera'), el('span', null, tl('স্ট্রিম শুরু করুন', 'Start a stream')));
    cta.addEventListener('click', () => { close(); startStream(); });
    inner.append(mark, el('b', null, tl('এখন কেউ স্ট্রিমে নেই', 'No one is streaming right now')),
      el('span', null, tl('প্রথম স্ট্রিমটি আপনার হোক — যাঁরা আপনাকে ফলো করেন তাঁরা সাথে সাথে জানতে পারবেন।', 'Be the first — your followers are told the moment you start.')), cta);
    none.appendChild(inner);
    return none;
  };
  const draw = async () => {
    let lives = [];
    try { lives = (await liveApi('list')).lives; } catch { return; }
    if (!box.isConnected) return;
    lives = lives.filter(l => !ME || l.user.id !== ME.id);
    const ids = new Set(lives.map(l => l.id));
    // lives that ended go, new ones are added at the end; the one being watched stays where it is
    for (const [id, page] of known) if (!ids.has(id) && page !== onPage) { watcher.unobserve(page); page.remove(); known.delete(id); }
    for (const l of lives) if (!known.has(l.id)) { const p = pageFor(l); known.set(l.id, p); pager.appendChild(p); } else known.get(l.id)._live = l;
    const none = pager.querySelector('.sp-empty');
    if (!known.size && !none) pager.appendChild(empty());
    else if (known.size && none) none.remove();
  };
  await draw();
  timer = setInterval(draw, 8000);
}
function liveCardEl(l, onOpen) {
  const c = el('button', 'lh-card');
  const bg = el('span', 'bg');
  if (l.user.pic) bg.style.backgroundImage = `url("api/avatar/${l.user.id}?v=${l.user.pic}")`;
  const face = el('span', 'face');
  face.appendChild(avatar(l.user, 'lg'));
  const meta = el('span', 'meta no-tr');
  meta.append(nameEl(l.user), el('small', null, l.title || tl('স্ট্রিম ভিডিও', 'Live video')));
  const top = el('span', 'tags');
  top.append(el('span', 'lv-badge', 'LIVE'), Object.assign(el('span', 'lv-count'), { innerHTML: svg('eye') }));
  top.lastChild.appendChild(el('b', null, num(l.viewers)));
  c.append(bg, face, top, meta);
  c.addEventListener('click', onOpen);
  return c;
}

// ---- in the feed: who is live, first ----
async function liveIntoFeed(feed) {
  let lives = [];
  try { lives = (await liveApi('list')).lives; } catch { return; }
  for (const old of feed.querySelectorAll('.fc-live')) old.remove();
  if (!lives.length) return;
  const card = el('article', 'fc fc-live');
  const head = el('header', 'fc-head');
  head.append(el('span', 'lv-badge', 'LIVE'), el('b', null, tl('এখন স্ট্রিমে', 'Live now')));
  const row = el('div', 'fl-row');
  for (const l of lives.slice(0, 12)) if (!ME || l.user.id !== ME.id) row.appendChild(liveCardEl(l, () => watchLive(l)));
  if (!row.children.length) return;
  card.append(head, row);
  feed.prepend(card);
}
// The feed may have filled before this file loaded; and lives come and go, so the row is looked at again.
if (typeof current !== 'undefined' && current === 'explore') liveIntoFeed($('explore-feed'));
setInterval(() => { if (current === 'explore' && !document.hidden && !document.querySelector('.live-room, .live-hub')) liveIntoFeed($('explore-feed')); }, 30_000);
