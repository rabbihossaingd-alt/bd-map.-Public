// ---- Explore: photos and videos of places people have been ----
// The page is a feed, one post after another, the way a social app shows it: who posted, the photo or video at
// full width, like / comment / place underneath, then the caption. A search box at the top finds people and
// posts. Tapping a video opens the reels viewer: one video per screen, swipe or scroll up for the next.
// A post is one photo or one video with a caption and, optionally, the place it shows.

// An account the team has limited for a few days (admin panel → সীমিত করুন): say so plainly, once, wherever it happens.
let restrictedShown = 0;
function restrictedNotice() {
  if (Date.now() - restrictedShown < 15000 || typeof openModal !== 'function') return;
  restrictedShown = Date.now();
  openModal('অ্যাকাউন্ট কিছুদিনের জন্য সীমিত', '', [el('div', 'empty', 'নিয়ম ভাঙার জন্য আপনার অ্যাকাউন্ট কিছুদিনের জন্য সীমিত করা হয়েছে — এই সময়ে পোস্ট/মন্তব্য বা মেসেজ পাঠানো যাবে না। কারণ আর আপিলের সুযোগ নোটিফিকেশনে আছে।')]);
}
async function exploreApi(path, body) {
  const res = await fetch('api/explore/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
  if (!res.ok && data.error === 'restricted') restrictedNotice();
  if (!res.ok) throw new Error(data.error || 'server');
  return data;
}
const agoText = ts => {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'এইমাত্র';
  if (s < 3600) return `${num(Math.floor(s / 60))} মিনিট আগে`;
  if (s < 86400) return `${num(Math.floor(s / 3600))} ঘণ্টা আগে`;
  if (s < 7 * 86400) return `${num(Math.floor(s / 86400))} দিন আগে`;
  return new Date(ts).toLocaleDateString(NUM_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
};
const svgEl = (name, cls) => Object.assign(el('i', cls || ''), { innerHTML: svg(name) });

function exploreNote(text) { chatToast(ME || { id: 0, name: 'Manzeela' }, text); }
// Share a post: the phone's own share sheet where there is one, otherwise the link is copied.
async function sharePost(p) {
  postSignal(p.id, 'share', reelsBox ? 'reel' : 'feed');
  const url = `${location.origin}${location.pathname}?post=${p.id}#/explore`;
  try {
    if (navigator.share) await navigator.share({ title: 'Manzeela', text: p.caption || p.user.name, url });
    else { await navigator.clipboard.writeText(url); exploreNote('লিংক কপি হয়েছে।'); }
  } catch { /* the share sheet was closed */ }
}
async function toggleSave(p, repaint) {
  if (!ME) { needLogin('পোস্ট সেভ করতে লগইন করুন'); return; }
  p.saved = !p.saved;
  repaint();
  try { Object.assign(p, await exploreApi('save', { id: p.id })); repaint(); if (p.saved) exploreNote('সেভ করা হয়েছে — প্রোফাইলে পাবেন।'); } catch { /* keeps what was shown */ }
}

// Like or unlike. The heart and the count change at once; the server's answer then settles the number.
async function toggleLike(p, repaint) {
  if (!ME) { needLogin('লাইক দিতে লগইন করুন'); return; }
  p.liked = !p.liked;
  if (p.likes !== null) p.likes += p.liked ? 1 : -1;      // null: the owner hid the count
  repaint(true);
  try { Object.assign(p, await exploreApi('like', { id: p.id })); repaint(false); } catch { /* keeps what was shown */ }
}
function postMenu(p, onGone) {
  const mine = ME && ME.id === p.user.id, staff = ME && ME.role !== 'user';
  const rows = [];
  const row = (text, cls, fn) => { const b = el('button', 'menu-row ' + cls, text); b.addEventListener('click', fn); rows.push(b); };
  row('প্রোফাইল দেখুন', '', () => { closeReels(); openProfilePage(p.user.id); });
  if (p.place) row('জায়গাটি ম্যাপে দেখুন', '', () => { closeModal(); closeReels(); goTo(p.place); });
  if (mine || staff) row('পোস্টটি মুছে ফেলুন', 'bad', async () => { await exploreApi('delete', { id: p.id }).catch(() => {}); closeModal(); closeReels(); if (onGone) onGone(); });
  if (!mine) row('রিপোর্ট করুন', 'bad', async () => { if (!ME) { openLogin(); return; } await exploreApi('report', { id: p.id, reason: 'reported from the post' }).catch(() => {}); closeModal(); });
  openModal(p.user.name, agoText(p.created), rows);
  $('m-title').classList.add('no-tr');
}

// ---- sound in the feed ----
const feedSounds = new Set();
function setFeedSound(on) {
  feedSound = on;
  MUSIC.unlock();
  for (const b of document.querySelectorAll('.fc-sound')) b.classList.toggle('on', on);
  for (const x of document.querySelectorAll('.fc-media video')) x.muted = !on || x.dataset.orig === '0';
  for (const f of feedSounds) {
    if (f.v && !document.contains(f.v)) { f.sound.stop(); feedSounds.delete(f); continue; }
    f.sound.mute(!on);
    if (on && f.v && !f.v.paused) f.sound.start(f.v.currentTime);
    if (on && f.media && f.media.dataset.visible === '1') f.sound.start(0);
  }
}
let photoObs = null;
function photoMusic() {
  return photoObs || (photoObs = new IntersectionObserver(entries => {
    for (const e of entries) {
      const vis = e.isIntersecting && e.intersectionRatio > .6;
      e.target.dataset.visible = vis ? '1' : '0';
      if (vis && feedSound) e.target._sound.start(0); else e.target._sound.stop();
    }
  }, { threshold: [0, .6] }));
}
addEventListener('hashchange', () => { for (const f of feedSounds) f.sound.stop(); });

// ---- one post in the feed ----
let feedWatcher = null;      // plays a feed video while it is on screen, pauses it when it leaves

// One player at a time. Whatever video starts pauses every other one that has sound or sits in the feed, and the feed's
// photo music stops; camera and call pictures (a live stream, not a file) are left alone. While reels, a story, a live,
// the studio or a sheet covers the feed, the feed does not start; once nothing covers it, the video in view goes on.
const FEED_COVERS = 'body > .reels, body > .stories, body > .live-hub, body > .live-room:not(.embedded), body > .studio, body > .dg-sheet:not(.out), body > .auth';
const feedCovered = () => !!document.querySelector(FEED_COVERS) || ($('modal') && !$('modal').hidden && $('modal').classList.contains('post-modal'));
document.addEventListener('play', e => {
  const v = e.target;
  if (!(v instanceof HTMLVideoElement) || v.srcObject) return;
  if (v.closest('.fc-media') && feedCovered()) { v.pause(); return; }
  for (const o of document.querySelectorAll('video')) if (o !== v && !o.paused && !o.srcObject && (!o.muted || o.closest('.fc-media'))) o.pause();
  if (!v.closest('.fc-media')) for (const f of feedSounds) f.sound.stop();
}, true);
function resumeFeed() {
  if (current !== 'explore' || feedCovered()) return;
  const vh = innerHeight;
  for (const v of document.querySelectorAll('#explore-feed .fc-media video')) {
    const r = v.getBoundingClientRect(), seen = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / (r.height || 1);
    if (seen > 0.6) { if (v.paused) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); return; }
  }
}
new MutationObserver(muts => {
  if (feedCovered()) { for (const v of document.querySelectorAll('#explore-feed .fc-media video')) if (!v.paused) v.pause(); }
  else if (muts.some(m => m.removedNodes.length)) setTimeout(resumeFeed, 350);
}).observe(document.body, { childList: true });
let feedSound = true;        // sound is on, as on Instagram; a browser that refuses sound before a tap gets it at the first tap
let feedNeedsTap = false;
// A browser lets a video play with sound only after a real tap: a touch's pointerup/touchend, a click or a key —
// not pointerdown, and not a scroll. Unmuting before that pauses the video, which looked like a stall.
const soundAllowed = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
for (const type of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(type, () => {
  if (!feedNeedsTap) return;
  feedNeedsTap = false;
  if (feedSound) setFeedSound(true);
}, { capture: true });
function feedCard(p, onGone) {
  const card = el('article', 'fc');
  card.dataset.id = p.id;
  const head = el('header', 'fc-head');
  const who = el('button', 'fc-who');
  const t = el('span', 't');
  const when = el('small');
  when.appendChild(el('span', null, agoText(p.created)));
  if (p.place) when.append(document.createTextNode(' · '), Object.assign(el('span', 'no-tr'), { textContent: p.place.label }));
  t.append(nameEl(p.user), when);
  if (p.music || p.kind === 'video') {
    const tune = el('small', 'fc-tune no-tr');
    tune.append(Object.assign(el('i'), { innerHTML: svg('note') }), document.createTextNode(audioName(p)));
    tune.setAttribute('role', 'button');
    tune.title = LANG === 'en' ? 'Use this audio' : 'এই অডিও দিয়ে রিল বানান';
    tune.addEventListener('click', e => { e.stopPropagation(); openAudioSheet(p); });
    t.appendChild(tune);
  }
  who.append(avatar(p.user, 'sm ring'), t);
  who.addEventListener('click', () => openProfilePage(p.user.id));
  const more = el('button', 'icon-btn');
  more.innerHTML = svg('more');
  more.setAttribute('aria-label', 'আরও অপশন');
  more.addEventListener('click', () => postMenu(p, onGone));
  head.append(who, more);

  const media = el('div', 'fc-media' + (p.fx ? ' fx-' + p.fx : ''));
  const bar0 = el('div', 'fc-bar');
  // Instagram's shapes: as the picture is, between 1.91:1 and 4:5 (a 16:9 YouTube-size video stays 16:9).
  // A video may be as tall as a reel (9:16), as in Instagram's feed.
  const shapeIt = (w, h) => { if (w && h) media.style.aspectRatio = String(Math.min(1.91, Math.max(p.kind === 'video' ? 9 / 16 : 0.8, w / h))); };
  if (p.kind !== 'text') shapeIt(p.w, p.h);
  const burst = svgEl('heart', 'burst');
  const sound = postSound(p);
  const like = el('button', 'fc-btn like-btn'), count = el('b', 'fc-likes');
  const paint = pop => {
    like.classList.toggle('on', p.liked);
    count.textContent = `${num(p.likes)} লাইক`;
    count.hidden = !p.likes;
    if (p.likes === null) { count.textContent = LANG === 'en' ? 'Liked by others' : 'অন্যরা লাইক দিয়েছেন'; count.hidden = !p.liked; }
    if (pop) { like.classList.remove('pop'); void like.offsetWidth; like.classList.add('pop'); }
  };
  like.innerHTML = svg('heart');
  like.setAttribute('aria-label', 'লাইক');
  like.addEventListener('click', () => toggleLike(p, paint));
  if (p.kind === 'text') {
    media.className = 'fc-text g' + (p.id % 5) + (p.caption.length > 140 ? ' long' : '');
    media.appendChild(Object.assign(el('p', 'no-tr'), { textContent: p.caption }));
  } else if (p.kind === 'video' && !(p.more && p.more.length)) {
    const v = el('video');
    Object.assign(v, { src: p.src, poster: p.poster, muted: true, loop: true, playsInline: true, preload: 'metadata' });
    const speaker = el('button', 'fc-sound' + (feedSound ? ' on' : ''));
    speaker.innerHTML = svg('sound');
    speaker.setAttribute('aria-label', 'শব্দ');
    speaker.addEventListener('click', e => { e.stopPropagation(); setFeedSound(!feedSound); if (feedSound) v.play().catch(() => {}); });
    v.muted = !feedSound || !p.orig;
    v.dataset.orig = p.orig ? '1' : '0';
    v.addEventListener('waiting', () => media.classList.add('buffering'));
    for (const t of ['playing', 'pause', 'canplay']) v.addEventListener(t, () => media.classList.remove('buffering'));
    if (sound) {
      feedSounds.add({ v, sound });
      let last = 0;
      v.addEventListener('play', () => { sound.mute(!feedSound); sound.start(v.currentTime); });
      v.addEventListener('pause', () => sound.stop());
      v.addEventListener('timeupdate', () => { if (v.currentTime + .4 < last && !v.paused) sound.start(v.currentTime); last = v.currentTime; });   // the video looped
    }
    if (!p.w) v.addEventListener('loadedmetadata', () => shapeIt(v.videoWidth, v.videoHeight));
    // a tap in the middle stops it and starts it again; a double tap likes; the line at the bottom can be dragged
    const big = svgEl('play', 'fc-play');
    const seek = el('div', 'fc-seek'), fill = el('i');
    seek.appendChild(fill);
    const paintSeek = () => { if (v.duration) fill.style.width = (v.currentTime / v.duration * 100) + '%'; };
    v.addEventListener('timeupdate', paintSeek);

    const seekTo = e => { const r = seek.getBoundingClientRect(); if (v.duration) { v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.duration; paintSeek(); } };
    seek.addEventListener('pointerdown', e => { e.stopPropagation(); seek.classList.add('drag'); try { seek.setPointerCapture(e.pointerId); } catch { /* old browser */ } seekTo(e); });
    seek.addEventListener('pointermove', e => { if (seek.classList.contains('drag')) seekTo(e); });
    const endSeek = () => seek.classList.remove('drag');
    seek.addEventListener('pointerup', endSeek);
    seek.addEventListener('pointercancel', endSeek);
    seek.addEventListener('click', e => e.stopPropagation());
    media.append(v, big, speaker, seek);
    if (p.layers && p.layers.length) layerBox(v, p.layers);
    media.classList.add('video');
    card.classList.add('fc-video');
    // one tap opens it in reels (full screen, where a tap stops it); two taps like it
    let tapTimer = 0;
    media.addEventListener('click', e => {
      if (e.target.closest('.fc-head, .fc-sound, .fc-seek')) return;
      if (tapTimer) {
        clearTimeout(tapTimer); tapTimer = 0;
        if (!p.liked) toggleLike(p, paint);
        burst.classList.remove('go'); void burst.offsetWidth; burst.classList.add('go');
        return;
      }
      tapTimer = setTimeout(() => { tapTimer = 0; v.pause(); openReels(p.id); }, 260);
    });
    if (feedWatcher) feedWatcher.observe(v);
  } else {
    if (sound) {                                       // a photo with music: it plays while the photo is on screen, if sound is on
      const speaker = el('button', 'fc-sound' + (feedSound ? ' on' : ''));
      speaker.innerHTML = svg('sound');
      speaker.setAttribute('aria-label', 'শব্দ');
      speaker.addEventListener('click', e => { e.stopPropagation(); setFeedSound(!feedSound); if (feedSound) sound.start(0); });
      media.appendChild(speaker);
      feedSounds.add({ v: null, sound, media });
      photoMusic().observe(media);
      media._sound = sound;
    }
    if (p.more && p.more.length) {
      const [car, count, l, r] = carousel(p, bar0);
      media.classList.add('multi');
      media.append(car, count, l, r);
      const im = car.querySelector('img');
      if (!p.w && im) im.addEventListener('load', () => shapeIt(im.naturalWidth, im.naturalHeight));
    } else {
      const img = Object.assign(el('img'), { src: p.src, alt: p.caption || '', loading: 'lazy' });
      if (!p.w) img.addEventListener('load', () => shapeIt(img.naturalWidth, img.naturalHeight));
      media.appendChild(img);
    }
    // Double tap (or double click) on a photo likes it, with a heart over the picture.
    let last = 0;
    media.addEventListener('click', () => {
      const now = Date.now();
      if (now - last < 320) {
        if (!p.liked) toggleLike(p, paint);
        burst.classList.remove('go'); void burst.offsetWidth; burst.classList.add('go');
      }
      last = now;
    });
  }
  media.appendChild(burst);

  const bar = bar0;
  const talk = el('button', 'fc-btn');
  talk.innerHTML = svg('chat');
  talk.setAttribute('aria-label', 'মন্তব্য');
  talk.addEventListener('click', () => openComments(p, paintAll));
  const send = el('button', 'fc-btn');
  send.innerHTML = svg('share');
  send.setAttribute('aria-label', 'শেয়ার');
  send.addEventListener('click', () => sharePost(p));
  const keep = el('button', 'fc-btn keep');
  keep.innerHTML = svg('bookmark');
  keep.setAttribute('aria-label', 'সেভ');
  const paintKeep = () => keep.classList.toggle('on', p.saved);
  paintKeep();
  keep.addEventListener('click', () => toggleSave(p, paintKeep));
  bar.append(like, talk, send);
  if (p.place) {
    const pin = el('button', 'fc-btn');
    pin.innerHTML = svg('pin');
    pin.setAttribute('aria-label', 'ম্যাপে দেখুন');
    pin.addEventListener('click', () => goTo(p.place));
    bar.appendChild(pin);
  }
  bar.appendChild(keep);
  const body = el('div', 'fc-body');
  body.appendChild(count);
  if (p.caption && p.kind !== 'text') {
    const cap = el('p', 'fc-cap no-tr');
    cap.append(el('b', null, p.user.name), document.createTextNode(' ' + p.caption));
    body.appendChild(cap);
  }
  const all = el('button', 'fc-all');
  function paintAll() { all.textContent = p.comments ? (p.comments === 1 ? '১টি মন্তব্য দেখুন' : `সব ${num(p.comments)} টি মন্তব্য দেখুন`) : 'প্রথম মন্তব্যটি করুন'; }
  paintAll();
  all.addEventListener('click', () => openComments(p, paintAll));
  body.appendChild(all);
  paint(false);
  if (p.kind === 'video') { media.prepend(head); card.append(media, bar, body); }
  else card.append(head, media, bar, body);
  card.dataset.post = p.id;
  seenWatcher().observe(card);
  return card;
}

// Views: a post counts as seen once half of it has been on screen. Ids are sent in small batches.
let seenObs = null, seenQueue = [], seenTimer = null;
const seenSent = new Set();
function seenWatcher() {
  if (seenObs) return seenObs;
  seenObs = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const id = Number(e.target.dataset.post);
      seenObs.unobserve(e.target);
      if (!id || seenSent.has(id)) continue;
      seenSent.add(id);
      seenQueue.push(id);
    }
    clearTimeout(seenTimer);
    if (seenQueue.length) seenTimer = setTimeout(() => {
      const ids = seenQueue.splice(0, 30);
      fetch('api/explore/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => {});
    }, 1500);
  }, { threshold: 0.5 });
  return seenObs;
}

// One square in a grid (profiles, search results).
// a video posted without a cover shows its own picture from half a second in (only the start of the file is fetched)
function firstFrame(p) {
  return Object.assign(el('video', 'frame'), { src: p.src + '#t=0.5', muted: true, playsInline: true, preload: 'metadata', disablePictureInPicture: true, tabIndex: -1 });
}
function postTile(p, onGone, user) {
  const tile = el('button', 'tile-post');
  const img = Object.assign(el('img'), { loading: 'lazy', alt: p.caption || '', src: p.kind === 'video' ? p.poster : p.src });
  if (p.kind === 'text') { tile.classList.add('texty', 'g' + (p.id % 5)); tile.appendChild(Object.assign(el('span', 'tt no-tr'), { textContent: p.caption })); }
  else if (p.kind === 'video' && !p.poster) tile.appendChild(firstFrame(p)); else tile.appendChild(img);
  if (p.kind === 'video' && !(p.more && p.more.length)) tile.appendChild(svgEl('play', 'play'));
  if (p.more && p.more.length) tile.appendChild(svgEl('copy', 'multi'));
  const meta = el('span', 'meta');
  meta.append(svgEl('heart'), document.createTextNode(num(p.likes)));
  tile.appendChild(meta);
  tile.addEventListener('click', () => (p.kind === 'video' && !(p.more && p.more.length) ? openReels(p.id, user) : openPost(p.id, onGone)));
  return tile;
}

// A grid of one person's posts (or of a search), a page at a time.
function postGrid(box, user, emptyText, query, saved, place) {
  const grid = el('div', 'post-grid'), more = el('button', 'btn quiet more-posts', 'আরও দেখুন');
  let last = 0, busy = false;
  async function load() {
    if (busy) return;
    busy = true;
    let posts = [];
    try { posts = (await exploreApi(`feed?user=${user}${last ? '&before=' + last : ''}${query ? '&q=' + encodeURIComponent(query) : ''}${saved ? '&saved=1' : ''}${place ? '&place=' + encodeURIComponent(place) : ''}`)).posts; } catch { /* shows what is there */ }
    for (const p of posts) grid.appendChild(postTile(p, reload, user));
    if (posts.length) last = posts[posts.length - 1].id;
    more.hidden = posts.length < 30;
    if (!grid.children.length) {
      const none = el('div', 'prof-none');
      none.append(ic('image'), el('b', null, emptyText));
      box.replaceChildren(none);
    }
    busy = false;
  }
  function reload() { last = 0; grid.replaceChildren(); box.replaceChildren(grid, more); load(); }
  more.hidden = true;
  more.addEventListener('click', load);
  reload();
  return reload;
}

// ---- a post on its own, with its comments ----
// Comments as on Instagram: a sheet from the bottom over whatever is open (feed or reels), the list, a row of quick
// emoji and the box with your photo. onCount(n) tells the card the new number.
function openComments(p, onCount) {
  const box = el('div', 'cs');
  const sheet = el('div', 'cs-sheet');
  const grip = el('div', 'cs-grip');
  const head = el('header', 'cs-head', 'মন্তব্য');
  const list = el('div', 'cs-list');
  list.append(el('div', 'skeleton'), el('div', 'skeleton'));
  const closed = p.nocomm && (!ME || ME.id !== p.user.id);
  let shown = 0;
  const empty = () => { const n = el('div', 'cs-none'); n.append(el('b', null, 'এখনো কোনো মন্তব্য নেই'), el('span', null, closed ? 'এই পোস্টে মন্তব্য বন্ধ।' : 'আলোচনা শুরু করুন।')); return n; };
  const row = c => {
    const r = el('div', 'cs-row no-tr');
    const t = el('div', 'cs-t');
    const top = el('div', 'cs-top');
    top.append(nameEl(c.user), el('small', null, agoText(c.created)));
    t.append(top, Object.assign(el('p'), { textContent: c.body }));
    const pic = avatar(c.user, 'sm');
    const toUser = () => { close(); closeReels(); openProfilePage(c.user.id); };
    pic.addEventListener('click', toUser);
    top.querySelector('b').addEventListener('click', toUser);
    r.append(pic, t);
    return r;
  };
  const foot = el('div', 'cs-foot');
  const input = Object.assign(el('input'), { placeholder: LANG === 'en' ? 'Add a comment…' : 'মন্তব্য লিখুন…', maxLength: 500, enterKeyHint: 'send' });
  const send = el('button', 'cs-send', 'পোস্ট');
  send.type = 'submit';
  send.disabled = true;
  const form = el('form', 'cs-form');
  form.append(ME ? avatar(ME, 'sm') : el('span'), input, send);
  input.addEventListener('input', () => { send.disabled = !input.value.trim(); });
  const quick = el('div', 'cs-quick');
  for (const e of ['❤️', '🙌', '🔥', '👏', '😍', '😮', '😂', '🙏']) {
    const b = el('button', null, e);
    b.type = 'button';
    b.addEventListener('click', () => { input.value += e; send.disabled = false; input.focus(); });
    quick.appendChild(b);
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!ME) { needLogin('মন্তব্য করতে লগইন করুন'); return; }
    const text = input.value.trim();
    if (!text) return;
    input.value = ''; send.disabled = true;
    try {
      const c = (await exploreApi('comment', { id: p.id, body: text })).comment;
      if (!shown++) list.replaceChildren();
      list.appendChild(row(c));
      list.scrollTop = list.scrollHeight;
      p.comments = (p.comments || 0) + 1;
      if (onCount) onCount(p.comments);
    } catch { input.value = text; send.disabled = false; exploreNote('মন্তব্য পাঠানো যায়নি। আবার চেষ্টা করুন।'); }
  });
  if (closed) foot.appendChild(el('div', 'cs-off', 'এই পোস্টে মন্তব্য বন্ধ।'));
  else foot.append(quick, form);
  sheet.append(grip, head, list, foot);
  box.appendChild(sheet);
  const close = () => { if (!box.isConnected || box.classList.contains('out')) return; box.classList.add('out'); setTimeout(() => box.remove(), 260); removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  box.addEventListener('click', e => { if (e.target === box) close(); });
  addEventListener('keydown', key);
  // drag the top of the sheet down to close it
  let y0 = null;
  for (const h of [grip, head]) {
    h.addEventListener('pointerdown', e => { y0 = e.clientY; sheet.style.transition = 'none'; try { h.setPointerCapture(e.pointerId); } catch { /* old browser */ } });
    h.addEventListener('pointermove', e => { if (y0 != null) sheet.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
    const end = e => { if (y0 == null) return; const d = e.clientY - y0; y0 = null; sheet.style.transition = ''; sheet.style.transform = ''; if (d > 90) close(); };
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  }
  document.body.appendChild(box);
  exploreApi('post?id=' + p.id).then(d => {
    shown = d.comments.length;
    list.replaceChildren(...(shown ? d.comments.map(row) : [empty()]));
    if (d.post.comments !== p.comments && onCount) { p.comments = d.post.comments; onCount(p.comments); }
  }, () => list.replaceChildren(el('div', 'cs-none', 'দেখানো যায়নি।')));
}

async function openPost(id, onGone) {
  let data;
  try { data = await exploreApi('post?id=' + id); } catch { return; }
  const p = data.post;
  const media = el('div', 'post-media');
  if (p.kind === 'text') { media.className = 'fc-text g' + (p.id % 5); media.appendChild(Object.assign(el('p', 'no-tr'), { textContent: p.caption })); }
  else if (p.kind === 'video' && !(p.more && p.more.length)) media.appendChild(Object.assign(el('video'), { src: p.src, poster: p.poster, controls: true, playsInline: true, preload: 'metadata' }));
  else if (p.more && p.more.length) {
    const [car, count, l, r, dots] = carousel(p);
    media.classList.add('multi');
    if (p.w && p.h) media.style.aspectRatio = String(Math.min(1.91, Math.max(.8, p.w / p.h)));
    media.append(car, count, l, r, dots);
  }
  else media.appendChild(Object.assign(el('img'), { src: p.src, alt: p.caption }));

  const who = el('div', 'person tap post-who');
  const t = el('div', 't');
  t.append(nameEl(p.user), el('span', null, agoText(p.created)));
  who.append(avatar(p.user, 'sm'), t);
  who.addEventListener('click', () => { closeReels(); openProfilePage(p.user.id); });

  const like = el('button', 'heart-btn');
  const paint = pop => { like.innerHTML = svg('heart'); if (p.likes) like.appendChild(document.createTextNode(num(p.likes))); like.classList.toggle('on', p.liked); if (pop) { like.classList.add('pop'); setTimeout(() => like.classList.remove('pop'), 400); } };
  paint(false);
  like.addEventListener('click', () => toggleLike(p, paint));
  const bar = el('div', 'post-bar');
  bar.appendChild(like);
  if (p.place) {
    const place = el('button', 'chip');
    place.innerHTML = svg('pin');
    place.appendChild(Object.assign(el('span', 'no-tr'), { textContent: p.place.label }));
    place.addEventListener('click', () => { closeModal(); closeReels(); goTo(p.place); });
    bar.appendChild(place);
  }
  const menu = el('button', 'icon-btn post-act');
  menu.innerHTML = svg('more');
  menu.addEventListener('click', () => postMenu(p, onGone));
  bar.appendChild(menu);

  const list = el('div', 'post-comments');
  const addComment = c => {
    const row = el('div', 'cmt no-tr');
    const txt = el('div');
    txt.append(nameEl(c.user), document.createTextNode(' ' + c.body));
    row.append(avatar(c.user, 'xs'), txt);
    row.querySelector('b').addEventListener('click', () => { closeReels(); openProfilePage(c.user.id); });
    list.appendChild(row);
  };
  data.comments.forEach(addComment);
  const input = Object.assign(el('input'), { placeholder: 'মন্তব্য লিখুন…', maxLength: 500 });
  const form = el('form', 'cmt-form');
  form.append(input, el('button', 'send-cmt', 'পাঠান'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!ME) { needLogin('মন্তব্য করতে লগইন করুন'); return; }
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try { addComment((await exploreApi('comment', { id, body: text })).comment); $('m-body').scrollTop = $('m-body').scrollHeight; } catch { input.value = text; }
  });
  const caption = Object.assign(el('p', 'post-caption no-tr'), { textContent: p.caption });
  // tagged people, and comments the owner turned off
  const tagged = p.tags && p.tags.length ? Object.assign(el('p', 'post-tags no-tr'), { textContent: (LANG === 'en' ? 'With ' : 'সাথে: ') + p.tags.map(t => t.username ? '@' + t.username : t.name).join(', ') }) : null;
  const closed = p.nocomm && (!ME || ME.id !== p.user.id);
  const foot = closed ? el('div', 'cmt-off', LANG === 'en' ? 'Comments are turned off.' : 'এই পোস্টে মন্তব্য বন্ধ।') : form;
  openModal('', '', [media, who, bar, ...(p.caption && p.kind !== 'text' ? [caption] : []), ...(tagged ? [tagged] : []), list], [foot]);
  $('modal').classList.add('post-modal');
}

// ---- reels: one video per screen ----
// A full-screen column that snaps from one video to the next. The video on screen plays, the others wait.
let reelsBox = null;
function closeReels() {
  if (!reelsBox) return;
  if (reelsBox._seen) reelsBox._seen();
  for (const v of reelsBox.querySelectorAll('video')) v.pause();
  for (const r of reelsBox._sounds || []) r.rs.stop();
  reelsBox.remove();
  reelsBox = null;
  document.body.classList.remove('reels-open');
}
// A post of several photos: swiped sideways, with dots and a "1/3" that fades, as on Instagram.
// Each slide is a photo, or a video that plays while its slide is on screen (with its words and stickers over it).
let slideWatch = null;
const slideWatcher = () => slideWatch || (slideWatch = new IntersectionObserver(entries => {
  for (const e of entries) {
    const v = e.target.querySelector('video');
    if (!v) continue;
    if (e.isIntersecting && e.intersectionRatio > .6) { v.muted = !feedSound; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
    else v.pause();
  }
}, { threshold: [0, .6] }));
function carousel(p, dotsHost) {
  const items = [{ src: p.src, kind: p.kind, poster: p.poster, layers: p.layers || [] }, ...(p.more || []).map(x => (typeof x === 'string' ? { src: x, kind: 'photo' } : x))];
  const srcs = items;
  const car = el('div', 'fc-car');
  for (const it of items) {
    const slide = el('div', 'slide');
    if (it.kind === 'video') {
      const v = Object.assign(el('video'), { src: it.src, poster: it.poster || '', muted: true, loop: true, playsInline: true, preload: 'metadata' });
      slide.appendChild(v);
      if (it.layers && it.layers.length) layerBox(v, it.layers);
      slideWatcher().observe(slide);
    } else slide.appendChild(Object.assign(el('img'), { src: it.src, alt: p.caption || '', loading: 'lazy', draggable: false }));
    car.appendChild(slide);
  }
  const count = el('span', 'fc-count', `1/${num(srcs.length)}`);
  const dots = el('div', 'fc-dots');
  for (let i = 0; i < srcs.length; i++) dots.appendChild(el('i', i ? '' : 'on'));
  let at = 0, fade = 0;
  car.addEventListener('scroll', () => {
    const i = Math.round(car.scrollLeft / car.clientWidth);
    if (i === at) return;
    at = i;
    count.textContent = `${num(i + 1)}/${num(srcs.length)}`;
    [...dots.children].forEach((d, n) => d.classList.toggle('on', n === i));
    count.classList.add('show');
    clearTimeout(fade);
    fade = setTimeout(() => count.classList.remove('show'), 1600);
  }, { passive: true });
  // a mouse: arrows on the sides
  const arrow = (dir) => { const b = el('button', 'fc-arrow ' + (dir < 0 ? 'l' : 'r')); b.innerHTML = svg('chev'); b.setAttribute('aria-label', dir < 0 ? 'আগের ছবি' : 'পরের ছবি'); b.addEventListener('click', e => { e.stopPropagation(); car.scrollBy({ left: dir * car.clientWidth, behavior: 'smooth' }); }); return b; };
  count.classList.add('show');
  setTimeout(() => count.classList.remove('show'), 2200);
  if (dotsHost) dotsHost.appendChild(dots);
  return [car, count, arrow(-1), arrow(1), dots];
}

// Instagram's "use audio": a new reel with a post's sound (its own sound, or the track it uses).
function audioOf(p) {
  const l = p.music && p.music.label;
  return p.music ? (l.kind === 'gen' ? { id: 'gen:' + l.track, start: p.music.start } : l.kind === 'post' ? { id: 'post:' + l.post, start: p.music.start, src: l.src, by: l.by, title: l.title }
    : l.kind === 'file' ? { id: p.music.id, start: p.music.start, src: l.src, title: l.title, by: l.by } : null)
    : { id: 'post:' + p.id, start: 0, src: p.src, by: p.user.name, title: p.aname || '' };
}
function openAudioSheet(p) {
  const go2 = button('camera', LANG === 'en' ? 'Use this audio' : 'এই অডিও দিয়ে রিল বানান', () => { closeModal(); useAudioOf(p); });
  const head = el('div', 'aud-head');
  const art = el('span', 'aud-art');
  if (p.poster) art.style.backgroundImage = `url("${p.poster}")`;
  art.innerHTML = svg('note');
  const t = el('div', 't no-tr');
  t.append(el('b', null, audioName(p)), el('small', null, p.user.name));
  head.append(art, t);
  openModal(LANG === 'en' ? 'Audio' : 'অডিও', LANG === 'en' ? 'Make your own reel with this sound' : 'এই সাউন্ড দিয়ে নিজের রিল বানান', [head], [go2]);
}
function useAudioOf(p) {
  const music = audioOf(p);
  if (!music) return;
  if (!ME) { needLogin('এই অডিও দিয়ে রিল বানাতে লগইন করুন'); return; }
  openNewPost({ music, mode: 'reel' });
}
const audioName = p => p.music ? soundLabel(p) : p.aname || `${p.user.name} · ${LANG === 'en' ? 'Original audio' : 'মূল অডিও'}`;
const newSeed = () => 1 + Math.floor(Math.random() * 999983);
async function openReels(startId, user) {
  let posts = [];
  const seed = newSeed();
  const page = o => exploreApi(user ? `feed?kind=video&user=${user}${o ? '&before=' + o : ''}` : `feed?kind=video&seed=${seed}&o=${o}${startId ? '&first=' + startId : ''}`);
  // the screen answers the tap at once: black, with a spinner, until the list comes
  closeReels();
  const wait = reelsBox = el('div', 'reels reels-wait');
  wait.appendChild(el('i', 'reels-spin'));
  document.body.appendChild(wait);
  document.body.classList.add('reels-open');
  try { posts = (await page(0)).posts; } catch { if (reelsBox === wait) closeReels(); return; }
  if (reelsBox !== wait) return;                                     // closed (or opened again) meanwhile
  let offset = posts.length, ended = posts.length < 30, loading = false;
  const at = startId ? posts.findIndex(p => p.id === startId) : 0;
  if (at < 0 || !posts.length) { closeReels(); if (!startId) exploreNote('এখনো কোনো রিল নেই — প্রথম ভিডিওটি আপনিই দিন।'); return; }
  wait.remove();
  let sound = true;
  const reelSounds = [];
  const box = reelsBox = el('div', 'reels');
  box._sounds = reelSounds;
  const close = el('button', 'reels-x');
  close.innerHTML = svg('close');
  close.setAttribute('aria-label', 'বন্ধ করুন');
  close.addEventListener('click', closeReels);
  const column = el('div', 'reels-col');
  const topbar = el('div', 'reels-top');
  topbar.append(el('b', null, 'রিলস'));
  const camera = el('button', 'reels-cam');
  camera.innerHTML = svg('camera');
  camera.setAttribute('aria-label', 'নতুন রিল');
  camera.addEventListener('click', () => { closeReels(); openNewPost(); });
  topbar.appendChild(camera);
  const seen = watchLog('reel');     // how each reel is watched, for For You
  box._seen = () => seen.flush();
  const watcher = new IntersectionObserver(entries => {
    for (const e of entries) {
      const v = e.target.querySelector('video');
      if (e.isIntersecting && e.intersectionRatio > 0.6) { v.muted = !sound || v.dataset.orig === '0'; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); seen.start(Number(e.target.dataset.id), v); }
      else { v.pause(); seen.stop(Number(e.target.dataset.id)); }
    }
  }, { root: column, threshold: [0, 0.6, 1] });

  const shown = new Set();
  const addReel = p => {
    if (shown.has(p.id)) return;
    shown.add(p.id);
    const reel = el('section', 'reel');
    reel.dataset.id = p.id;
    const v = el('video');
    Object.assign(v, { src: p.src, poster: p.poster, loop: true, playsInline: true, preload: 'metadata' });
    // a spinner while it waits for more of the video
    v.addEventListener('waiting', () => reel.classList.add('buffering'));
    for (const t of ['playing', 'pause', 'canplay']) v.addEventListener(t, () => reel.classList.remove('buffering'));
    // A reel in its own shape: a tall one fills the screen, any other is whole in the middle with black above and below.
    const tall = (w, h) => reel.classList.toggle('tall', !!w && w / h < .66);
    if (p.w) tall(p.w, p.h); else v.addEventListener('loadedmetadata', () => tall(v.videoWidth, v.videoHeight));
    v.addEventListener('click', () => { if (v.paused) v.play(); else v.pause(); });
    v.addEventListener('pause', () => reel.classList.add('paused'));
    v.addEventListener('play', () => reel.classList.remove('paused'));
    const line = el('i', 'reel-line');
    v.addEventListener('timeupdate', () => { if (v.duration) line.style.width = (v.currentTime / v.duration * 100) + '%'; });

    const info = el('div', 'reel-info');
    const who = el('button', 'fc-who');
    who.append(avatar(p.user, 'sm'), nameEl(p.user));
    who.addEventListener('click', () => { closeReels(); openProfilePage(p.user.id); });
    const whoRow = el('div', 'reel-who');
    whoRow.appendChild(who);
    if (!ME || p.user.id !== ME.id) {
      const follow = el('button', 'reel-follow', 'ফলো করুন');
      follow.addEventListener('click', async () => {
        if (!ME) { needLogin('ফলো করতে লগইন করুন'); return; }
        follow.disabled = true;
        try { await chatApi('friend', { id: p.user.id }); follow.textContent = 'ফলো করছেন'; follow.classList.add('done'); } catch { follow.disabled = false; }
      });
      whoRow.appendChild(follow);
    }
    info.appendChild(whoRow);
    if (p.caption) info.appendChild(Object.assign(el('p', 'no-tr'), { textContent: p.caption }));
    if (p.place) {
      const place = el('button', 'reel-place');
      place.innerHTML = svg('pin');
      place.appendChild(Object.assign(el('span', 'no-tr'), { textContent: p.place.label }));
      place.addEventListener('click', () => { postSignal(p.id, 'place', 'reel'); closeReels(); goTo(p.place); });
      info.appendChild(place);
    }
    const side = el('div', 'reel-side');
    const act = (icon, text, fn) => { const b = el('button', 'reel-btn'); b.innerHTML = svg(icon); const n = el('span', null, text); b.appendChild(n); b.addEventListener('click', fn); side.appendChild(b); return [b, n]; };
    const [like, likes] = act('heart', p.likes ? num(p.likes) : '', () => toggleLike(p, pop => {
      like.classList.toggle('on', p.liked); likes.textContent = p.likes ? num(p.likes) : '';
      if (pop) { like.classList.remove('pop'); void like.offsetWidth; like.classList.add('pop'); }
    }));
    like.classList.toggle('on', p.liked);
    const [, talks] = act('chat', p.comments ? num(p.comments) : '', () => openComments(p, n => { talks.textContent = num(n); }));
    act('share', '', () => sharePost(p));
    const [keep] = act('bookmark', '', () => toggleSave(p, () => keep.classList.toggle('on', p.saved)));
    keep.classList.toggle('on', p.saved);
    const [mute] = act('sound', '', () => {
      sound = !sound;
      MUSIC.unlock();
      for (const x of box.querySelectorAll('video')) x.muted = !sound || x.dataset.orig === '0';
      for (const m of box.querySelectorAll('.mute')) m.classList.toggle('off', !sound);
      for (const r of reelSounds) { r.rs.mute(!sound); if (sound && !r.v.paused) r.rs.start(r.v.currentTime); }
    });
    mute.classList.add('mute');
    act('more', '', () => postMenu(p, closeReels));
    const audio = el('button', 'reel-audio no-tr');
    audio.append(Object.assign(el('i'), { innerHTML: svg('note') }), document.createTextNode(p.music ? soundLabel(p) : `${p.user.name} · ${LANG === 'en' ? 'Original audio' : 'মূল অডিও'}`));
    // Instagram's "use audio": a new reel with this sound (another reel's own sound, or the same app track).
    audio.addEventListener('click', () => { closeReels(); useAudioOf(p); });
    info.appendChild(audio);
    v.dataset.orig = p.orig ? '1' : '0';
    if (p.fx) reel.classList.add('fx-' + p.fx);
    const rs = postSound(p);
    if (rs) {
      let last = 0;
      v.addEventListener('play', () => { rs.mute(!sound); rs.start(v.currentTime); });
      v.addEventListener('pause', () => rs.stop());
      v.addEventListener('timeupdate', () => { if (v.currentTime + .4 < last && !v.paused) rs.start(v.currentTime); last = v.currentTime; });
      reelSounds.push({ v, rs });
    }
    reel.append(v, svgEl('play', 'reel-paused'), info, side, line);
    if (p.layers && p.layers.length) layerBox(v, p.layers);
    column.appendChild(reel);
    watcher.observe(reel);
  };
  posts.forEach(addReel);
  // Near the last reel, the next ones load (a new video each time, as on TikTok).
  column.addEventListener('scroll', async () => {
    if (ended || loading || column.scrollTop + column.clientHeight * 3 < column.scrollHeight) return;
    loading = true;
    try {
      const more = (await page(user ? posts.at(-1).id : offset)).posts;
      offset += more.length;
      ended = more.length < 30;
      posts.push(...more);
      more.forEach(addReel);
    } catch { /* the next scroll tries again */ }
    loading = false;
  }, { passive: true });
  box.append(column, topbar, close);
  document.body.appendChild(box);
  document.body.classList.add('reels-open');
  column.tabIndex = 0;
  column.children[at].scrollIntoView();
  column.focus();
  column.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('modal').hidden) closeReels();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); column.scrollBy({ top: (e.key === 'ArrowDown' ? 1 : -1) * column.clientHeight, behavior: 'smooth' }); }
  });
}
addEventListener('hashchange', closeReels);

// ---- stories: a photo or video that stays for 24 hours ----
const seenStories = () => { try { return JSON.parse(localStorage.getItem('bdmap.stories')) || {}; } catch { return {}; } };
function markStorySeen(userId, storyId) {
  const seen = seenStories();
  if ((seen[userId] || 0) >= storyId) return;
  seen[userId] = storyId;
  try { localStorage.setItem('bdmap.stories', JSON.stringify(seen)); } catch { /* storage unavailable */ }
}
// Everyone's stories, so any picture of a person can show the ring and open their story when tapped.
const STORY = { groups: [], by: new Map() };
function storyClass(id) {
  const i = STORY.by.get(id);
  if (i == null) return '';
  return (seenStories()[id] || 0) >= STORY.groups[i].items.at(-1).id ? 'st-ring st-seen' : 'st-ring';
}
// One request serves the rings and the row above the feed (they used to ask twice as the page opened); 'fresh' after
// posting a story and on the three-minute refresh.
let storiesReq = null, storiesAt = 0;
function fetchStories(fresh) {
  if (!fresh && storiesReq && Date.now() - storiesAt < 20_000) return storiesReq;
  storiesAt = Date.now();
  storiesReq = exploreApi('stories').then(d => d.stories);
  storiesReq.catch(() => { storiesReq = null; });
  return storiesReq;
}
async function refreshStoryRings(fresh) {
  try { STORY.groups = await fetchStories(fresh); } catch { return; }
  STORY.by = new Map(STORY.groups.map((g, i) => [g.user.id, i]));
  paintRings();
}
function paintRings() {
  for (const a of document.querySelectorAll('.avatar[data-uid]')) {
    const cls = storyClass(Number(a.dataset.uid));
    a.classList.toggle('st-ring', !!cls);
    a.classList.toggle('st-seen', cls.includes('st-seen'));
  }
}
document.addEventListener('click', e => {
  const a = e.target.closest('.avatar.st-ring');
  if (!a || a.matches('.xs, .mini') || a.closest('.faces, .stories, .gcall, .pick-list, .note, .gc-ring, .seen-by, .gavatar, .call, .pic-edit, #chat-toast')) return;
  const i = STORY.by.get(Number(a.dataset.uid));
  if (i == null) return;
  e.preventDefault();
  e.stopPropagation();
  openStories(STORY.groups, i, paintRings);
}, true);
refreshStoryRings();
setInterval(() => { if (!document.hidden) refreshStoryRings(true); }, 180_000);

async function loadStories(row) {
  let groups = [];
  try { groups = await fetchStories(); } catch { /* the row still offers to add one */ }
  STORY.groups = groups;
  STORY.by = new Map(groups.map((g, i) => [g.user.id, i]));
  const seen = seenStories();
  row.replaceChildren();
  const add = el('button', 'face add');
  if (!ME) add.classList.add('empty');
  add.append(ME ? avatar(ME, 'lg') : Object.assign(el('span', 'avatar lg'), { innerHTML: svg('user') }), svgEl('plus', 'badge'), el('span', null, 'আপনার স্টোরি'));
  add.addEventListener('click', addStory);
  row.appendChild(add);
  groups.forEach((g, i) => {
    const b = el('button', 'face' + ((seen[g.user.id] || 0) >= g.items.at(-1).id ? ' seen' : ''));
    b.append(avatar(g.user, 'lg ring'), Object.assign(el('span', 'no-tr'), { textContent: ME && g.user.id === ME.id ? (LANG === 'en' ? 'You' : 'আপনি') : g.user.name }));
    b.addEventListener('click', () => openStories(groups, i, () => { loadStories(row); paintRings(); }));
    row.appendChild(b);
  });
  row.hidden = false;
}
function addStory() {
  if (!ME) { needLogin('স্টোরি দিতে লগইন করুন'); return; }
  openNewPost({ mode: 'story' });
}
// The viewer: one story at a time, bars across the top, tap the right side for the next and the left for the last.
function openStories(groups, start, onClose) {
  let g = start, i = 0, timer = null, raf = 0;
  const box = el('div', 'stories');
  const bars = el('div', 'st-bars'), stage = el('div', 'st-stage'), head = el('div', 'st-head');
  const close = () => { clearTimeout(timer); cancelAnimationFrame(raf); for (const v of box.querySelectorAll('video')) v.pause(); box.remove(); document.body.classList.remove('reels-open'); removeEventListener('keydown', key); if (onClose) onClose(); };
  const step = d => {
    i += d;
    if (i < 0) { if (g === 0) { i = 0; } else { g--; i = groups[g].items.length - 1; } }
    else if (i >= groups[g].items.length) { g++; i = 0; if (g >= groups.length) { close(); return; } }
    show();
  };
  function show() {
    clearTimeout(timer); cancelAnimationFrame(raf);
    const group = groups[g], st = group.items[i];
    markStorySeen(group.user.id, st.id);
    bars.replaceChildren(...group.items.map((_, n) => { const b = el('i'); b.appendChild(el('b')); if (n < i) b.firstChild.style.width = '100%'; return b; }));
    const fill = bars.children[i].firstChild;
    const who = el('button', 'fc-who');
    who.append(avatar(group.user, 'sm'), Object.assign(el('b', 'no-tr'), { textContent: group.user.name }), el('small', null, agoText(st.created)));
    who.addEventListener('click', () => { close(); openProfilePage(group.user.id); });
    const x = el('button', 'st-x');
    x.innerHTML = svg('close');
    x.addEventListener('click', close);
    head.replaceChildren(who);
    if (ME && (ME.id === group.user.id || ME.role !== 'user')) {
      const del = el('button', 'st-x');
      del.innerHTML = svg('trash');
      del.addEventListener('click', async () => { await exploreApi('story-delete', { id: st.id }).catch(() => {}); close(); });
      head.appendChild(del);
    }
    head.appendChild(x);
    const run = ms => {
      const t0 = performance.now();
      const tick = () => { fill.style.width = Math.min(100, (performance.now() - t0) / ms * 100) + '%'; raf = requestAnimationFrame(tick); };
      tick();
      timer = setTimeout(() => step(1), ms);
    };
    if (st.kind === 'video') {
      const v = Object.assign(el('video'), { src: st.src, poster: st.poster, playsInline: true, autoplay: true });
      v.addEventListener('loadedmetadata', () => { if (v.videoWidth / v.videoHeight < .66) v.style.objectFit = 'cover'; run(Math.min(30, v.duration || 15) * 1000); });
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
      stage.replaceChildren(v);
      if (st.layers && st.layers.length) layerBox(v, st.layers);
    } else { stage.replaceChildren(Object.assign(el('img'), { src: st.src, alt: '' })); run(5000); }
  }
  const prev = el('button', 'st-zone left'), next = el('button', 'st-zone right');
  prev.setAttribute('aria-label', 'আগের'); next.setAttribute('aria-label', 'পরের');
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
  addEventListener('keydown', key);
  const frame = el('div', 'st-frame');
  frame.append(stage, bars, head, prev, next);
  box.appendChild(frame);
  document.body.appendChild(box);
  document.body.classList.add('reels-open');
  show();
}

// ---- a new post ----
// A photo is redrawn at no more than 1600 px on its long side (a phone photo of 4-8 MB becomes ~300 KB).
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = el('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('image'))), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
// The frame one second into a video, as the picture shown before it plays.
function videoPoster(file, at) {
  return new Promise(resolve => {
    const v = el('video'), url = URL.createObjectURL(file);
    const done = value => { URL.revokeObjectURL(url); resolve(value); };
    Object.assign(v, { muted: true, playsInline: true, preload: 'auto', src: url });
    v.onloadeddata = () => { v.currentTime = at != null ? Math.min(at, Math.max(0, (v.duration || 1) - .05)) : Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = () => {
      const scale = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight)), c = el('canvas');
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      try { c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); done(c.toDataURL('image/jpeg', 0.8)); } catch { done(''); }
    };
    v.onerror = () => done('');
    setTimeout(() => done(''), 8000);
  });
}
// Upload a photo or video for a post. A video is first made light on the phone (transcode.js: 720 p, about 2 Mbit/s);
// then anything over 8 MB goes up in 4 MB pieces, each tried again after a lost connection, going on from where the
// server says it got to — a weak mobile signal no longer means starting again. onProgress(fraction, sent, total, phase)
// where phase is 'make' while the video is made and 'send' while it goes up. hold.xhr.abort() stops it.
const PIECE = 4 * 1024 * 1024, PIECES_FROM = 8 * 1024 * 1024;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitOnline = () => navigator.onLine === false ? new Promise(r => addEventListener('online', r, { once: true })) : Promise.resolve();
function uploadMedia(blob, type, onProgress = () => {}, hold) {
  return (async () => {
    const h = hold || {};
    let file = blob;
    if (/^video\//.test(type) && typeof shrinkVideo === 'function') {
      h.xhr = { abort() { h.stopped = true; } };
      try {
        const small = await shrinkVideo(blob, f => onProgress(f * 0.4, 0, 0, 'make'), h);
        if (small) { file = small; type = 'video/mp4'; }
      } catch (e) { if (!h.stopped) console.warn('video kept as it is:', e && e.message); }
      if (h.stopped) throw new Error('stopped');
    }
    const base = file !== blob ? 0.4 : 0;
    const prog = (f, sent, total) => onProgress(base + f * (1 - base), sent, total, 'send');
    return file.size > PIECES_FROM ? sendPieces(file, type, prog, h) : sendWhole(file, type, prog, h);
  })();
}
function sendWhole(blob, type, onProgress, hold) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    hold.xhr = { abort() { hold.stopped = true; x.abort(); } };
    x.onabort = () => reject(new Error('stopped'));
    x.open('POST', 'api/explore/media');
    x.setRequestHeader('Content-Type', type);
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total, e.loaded, e.total); };
    x.onload = () => { try { const d = JSON.parse(x.responseText); x.status === 200 ? resolve(d.media) : reject(new Error(d.error || 'server')); } catch { reject(new Error('server')); } };
    x.onerror = () => reject(new Error('server'));
    x.send(blob);
  });
}
function sendPiece(piece, type, id, offset, total, onLoaded, hold) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    hold.xhr = { abort() { hold.stopped = true; x.abort(); } };
    x.onabort = () => reject(new Error('stopped'));
    x.open('POST', `api/explore/chunk?id=${id}&offset=${offset}&size=${total}`);
    x.setRequestHeader('Content-Type', type);
    x.upload.onprogress = e => { if (e.lengthComputable) onLoaded(e.loaded); };
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText); } catch { return reject(new Error('net')); }
      if (x.status === 200) resolve(d);
      else if (x.status === 409) resolve({ conflict: true, size: d.size });
      else reject(new Error(d.error || (x.status >= 500 ? 'net' : 'server')));
    };
    x.onerror = () => reject(new Error('net'));
    x.timeout = 120_000; x.ontimeout = () => reject(new Error('net'));
    x.send(piece);
  });
}
async function sendPieces(file, type, onProgress, hold) {
  const id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
  let offset = 0, tries = 0;
  for (;;) {
    if (hold.stopped) throw new Error('stopped');
    const end = Math.min(file.size, offset + PIECE), at = offset;
    let r;
    try { r = await sendPiece(file.slice(at, end), type, id, at, file.size, l => onProgress((at + l) / file.size, at + l, file.size), hold); }
    catch (e) {
      if (e.message !== 'net') throw e;                          // a real answer (too big, too many today, …): stop
      if (++tries > 20) throw new Error('server');
      await waitOnline();
      await sleep(Math.min(15_000, 700 * 2 ** Math.min(tries, 5)));
      try { const st = await (await fetch('api/explore/chunk?id=' + id)).json(); offset = Number(st.size) || 0; } catch { /* ask again next time */ }
      continue;
    }
    tries = 0;
    if (r.media) { onProgress(1, file.size, file.size); return r.media; }
    if (r.conflict) { if (r.size >= 0) offset = r.size; else await sleep(800); continue; }
    offset = r.size;
  }
}

function openQuickPost() {
  if (!ME) { needLogin('পোস্ট দিতে লগইন করুন'); return; }
  let file = null, place = null;
  const pick = el('button', 'post-pick');
  pick.append(ic('image'), el('b', null, 'ছবি বা ভিডিও বেছে নিন'), el('span', null, 'অথবা কিছু না বেছে শুধু লেখা পোস্ট করুন'));
  const chooser = Object.assign(el('input'), { type: 'file', accept: 'image/*,video/mp4,video/webm,video/quicktime', hidden: true });
  pick.addEventListener('click', () => chooser.click());
  const note = el('div', 'form-note');
  const fail = text => { note.className = 'form-note bad'; note.textContent = text; };
  chooser.addEventListener('change', () => {
    file = chooser.files[0] || null;
    if (!file) return;
    if (file.type.startsWith('video') && file.size > 3e9) { file = null; fail('ভিডিওটি ৩ জিবির বেশি। ছোট একটি ভিডিও দিন।'); return; }
    note.textContent = '';
    const url = URL.createObjectURL(file);
    const view = file.type.startsWith('video') ? Object.assign(el('video'), { src: url, controls: true, muted: true, playsInline: true }) : Object.assign(el('img'), { src: url, alt: '' });
    pick.classList.add('has');
    pick.replaceChildren(view);
  });
  const [capBox, caption] = field('লেখা', { rows: 3, maxLength: 1000, placeholder: 'কোথায় গিয়েছিলেন, কেমন লাগল…' }, 'textarea');
  const placeInput = Object.assign(el('input'), { autocomplete: 'off', placeholder: 'যেমন: কক্সবাজার, সাজেক' });
  const sug = el('div', 'suggest');
  sug.hidden = true;
  const placeBox = el('label', 'money place-field');
  placeBox.append(el('span', null, 'জায়গা (ঐচ্ছিক)'), placeInput, sug);
  wireSuggest(placeInput, sug, p => { place = p; placeInput.value = p.label; placeInput.blur(); }, () => { place = null; });
  const bar = el('div', 'upload-bar');
  bar.appendChild(el('i'));
  bar.hidden = true;
  const share = button('send', 'পোস্ট করুন', async () => {
    if (!file) {                                       // words only
      if (caption.value.trim().length < 2) { fail('একটি ছবি বা ভিডিও বেছে নিন, অথবা কিছু লিখুন।'); return; }
      share.disabled = true;
      try { await exploreApi('post', { caption: caption.value }); closeModal(); if (current === 'explore') enter.explore(); else if (current === 'profile') drawProfile(); else go('explore'); }
      catch { share.disabled = false; fail('পোস্ট করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।'); }
      return;
    }
    share.disabled = true;
    note.className = 'form-note';
    note.textContent = 'তৈরি হচ্ছে…';
    try {
      const video = file.type.startsWith('video');
      const blob = video ? file : await shrinkPhoto(file);
      const poster = video ? await videoPoster(file) : '';
      // from here it goes up in the background, under the pill at the top (studio.js), as on Instagram
      closeModal();
      sendPost({ mode: 'post', parts: [{ blob, type: video ? (file.type || 'video/mp4') : 'image/jpeg', poster, video }], fields: { caption: caption.value, place }, thumb: poster || URL.createObjectURL(blob) });
    } catch (e) {
      share.disabled = false;
      bar.hidden = true;
      fail(e.message === 'big' ? 'ফাইলটি অনেক বড়।' : e.message === 'type' ? 'এই ধরনের ফাইল নেওয়া যায় না। JPG, PNG, MP4 বা WebM দিন।' : e.message === 'slow' ? 'আজ অনেকগুলো পোস্ট করেছেন। কাল আবার চেষ্টা করুন।'
           : e.message === 'image' ? 'ছবিটি পড়া যায়নি। অন্য একটি ছবি দিন।' : 'পোস্ট করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।');
    }
  });
  openModal('নতুন পোস্ট', '', [pick, chooser, capBox, placeBox, bar, note], [share]);
}

// ---- For You: how posts are watched ----
// Each video counts the seconds it actually played, whether it was seen to the end (and how many times it went round),
// or skipped (gone in under 2 seconds). The notes go to the server in small batches; your own posts are not counted there.
const signalQueue = [];
let signalTimer = 0;
function sendSignals() {
  clearTimeout(signalTimer); signalTimer = 0;
  if (!signalQueue.length) return;
  const events = signalQueue.splice(0, 60);
  fetch('api/explore/events', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) }).catch(() => {});
  if (signalQueue.length) sendSignals();
}
function postSignal(post, kind, src, extra) {
  if (!post) return;
  signalQueue.push({ post, kind, src, ...(extra || {}) });
  if (signalQueue.length >= 30) sendSignals(); else if (!signalTimer) signalTimer = setTimeout(sendSignals, 20_000);
}
function watchLog(src) {
  const runs = new Map();     // post id -> { v, played, last, loops, tick }
  return {
    start(id, v) {
      if (!id || runs.has(id)) return;
      const r = { v, played: 0, last: v.currentTime || 0, loops: 0 };
      r.tick = () => {
        const t = v.currentTime, d = t - r.last;
        if (d > 0 && d < 1.5) r.played += d;
        else if (d < -1 && r.last > (v.duration || 0) - 1.5) r.loops++;      // it went round to the start
        r.last = t;
      };
      v.addEventListener('timeupdate', r.tick);
      runs.set(id, r);
    },
    stop(id) {
      const r = runs.get(id);
      if (!r) return;
      runs.delete(id);
      r.v.removeEventListener('timeupdate', r.tick);
      if (!r.played && r.v.readyState < 2) return;      // it never loaded: not a skip, the video did not come
      const dur = r.v.duration && isFinite(r.v.duration) ? r.v.duration : 0, ms = Math.round(r.played * 1000);
      const done = r.loops > 0 || (dur > 0 && r.played >= dur * 0.9);
      postSignal(id, ms < 2000 && !done ? 'skip' : 'watch', src, { ms, dur: Math.round(dur * 1000), done, loops: r.loops });
    },
    flush() { for (const id of [...runs.keys()]) this.stop(id); },
  };
}
const feedSeen = watchLog('feed');
addEventListener('pagehide', () => { feedSeen.flush(); if (reelsBox && reelsBox._seen) reelsBox._seen(); sendSignals(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) sendSignals(); });
addEventListener('hashchange', () => { if (current !== 'explore') feedSeen.flush(); });

// ---- the page ----
(function initExplore() {
  const feed = $('explore-feed'), results = $('explore-results'), people = $('explore-people'), q = $('explore-q'), disc = $('explore-discover'), page = $('page-explore');
  let last = 0, busy = false, done = false, seed = newSeed(), offset = 0;
  feedWatcher = new IntersectionObserver(entries => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting && e.intersectionRatio > 0.6) {
        if (feedCovered()) continue;                                 // something is over the feed: it waits (see resumeFeed)
        // one video at a time, as Instagram plays them
        for (const o of document.querySelectorAll('.fc-media video')) if (o !== v && !o.paused) o.pause();
        const wantSound = feedSound && v.dataset.orig !== '0';
        v.muted = !(wantSound && soundAllowed());
        if (wantSound && v.muted) feedNeedsTap = true;
        v.play().catch(() => { v.muted = true; if (wantSound) feedNeedsTap = true; v.play().catch(() => {}); });
        feedSeen.start(Number(v.closest('.fc') && v.closest('.fc').dataset.id), v);
        // the next video starts loading now, so it is ready when it scrolls in
        const cards = [...document.querySelectorAll('.fc-media video')], next = cards[cards.indexOf(v) + 1];
        if (next && next.preload !== 'auto') next.preload = 'auto';
      } else { feedSeen.stop(Number(v.closest('.fc') && v.closest('.fc').dataset.id)); if (!v.paused) { v.dataset.auto = '1'; v.pause(); } }
    }
  }, { threshold: [0, 0.6] });

  async function more() {
    if (busy || done) return;
    busy = true;
    let posts = [];
    try { posts = (await exploreApi(`feed?seed=${seed}&o=${offset}`)).posts; } catch { /* shows what is there */ }
    for (const g of feed.querySelectorAll('.fc-ghost')) g.remove();
    for (const p of posts) feed.appendChild(feedCard(p, start));
    offset += posts.length;
    if (posts.length) last = posts[posts.length - 1].id;
    done = posts.length < 30;
    // the end of the feed says so, as Instagram's 'You're all caught up'
    if (done && feed.querySelector('.fc:not(.fc-live)') && !feed.querySelector('.feed-end')) {
      const end = el('div', 'feed-end');
      end.append(Object.assign(el('span', 'fe-ic'), { innerHTML: svg('check') }), el('b', null, 'সব দেখে ফেলেছেন'), el('span', null, 'নতুন পোস্ট এলে এখানে দেখাবে।'));
      feed.appendChild(end);
    }
    if (!feed.querySelector('.fc:not(.fc-live)')) {
      const none = el('div', 'prof-none');
      none.append(ic('image'), el('b', null, 'এখনো কেউ কিছু পোস্ট করেননি। প্রথম পোস্টটি আপনার হোক।'), button('plus', 'নতুন পোস্ট', () => openNewPost()));
      feed.appendChild(none);
    }
    busy = false;
  }
  function start() {
    last = 0; offset = 0; done = false; busy = false; seed = newSeed();
    // two grey cards in the shape of posts while the first ones come
    const ghost = () => { const g = el('div', 'fc fc-ghost'); g.append(el('div', 'gh-head'), el('div', 'gh-media'), el('div', 'gh-line')); return g; };
    feed.replaceChildren(ghost(), ghost());
    if (typeof liveIntoFeed === 'function') liveIntoFeed(feed);     // who is live now, at the top (live.js)
    more();
  }

  // Stories: the row of rings above the feed. The first one adds your own.
  async function faces() { return loadStories(people); }
  async function oldFaces() {
    let top = [];
    try { top = (await communityApi('top?n=50')).top; } catch { /* the row stays empty */ }
    people.replaceChildren();
    for (const p of top.slice(0, 14)) {
      const b = el('button', 'face');
      b.append(avatar(p, 'lg ring'), Object.assign(el('span', 'no-tr'), { textContent: p.name }));
      b.addEventListener('click', () => openProfilePage(p.id));
      people.appendChild(b);
    }
    people.hidden = !top.length;
  }

  // Search: places (districts, and places people tagged), people by name, posts by caption or place.
  const placeRow = (icon, title, sub, onClick) => {
    const b = el('button', 'found-place');
    const t = el('span', 'fp-t'); t.append(el('b', null, title), el('em', null, sub));
    b.append(ic(icon), t); b.addEventListener('click', onClick); return b;
  };
  function showPlacePosts(name, text) {
    const grid = el('div'), head = el('div', 'label fp-head');
    const back = el('button', 'fp-back'); back.append(ic('back')); back.setAttribute('aria-label', 'ফিরে যান');
    back.addEventListener('click', () => { q.value = text; q.dispatchEvent(new Event('input')); });
    head.append(back, el('span', 'no-tr', name));
    results.replaceChildren(head, grid);
    postGrid(grid, 0, 'এই জায়গার কোনো পোস্ট নেই।', '', false, name);
  }
  async function findPlaces(text, box, label, mine) {
    const latin = text.toLowerCase().replace(/[^a-z]/g, '');     // 'cox' finds Cox's Bazar
    const ds = (typeof DISTRICTS !== 'undefined' ? DISTRICTS : [])
      .filter(d => d.bn.includes(text) || (latin.length >= 2 && d.en.toLowerCase().replace(/[^a-z]/g, '').includes(latin))).slice(0, 4);
    const rows = ds.map(d => placeRow('compass', LANG === 'en' ? d.en : d.bn, (LANG === 'en' ? tr(d.division) + ' division · District guide' : d.division + ' বিভাগ · জেলা গাইড'), () => window.openDistrictGuide && window.openDistrictGuide(d)));
    let tagged = [];
    try { tagged = (await exploreApi('places?q=' + encodeURIComponent(text) + (ds.length ? '&near=' + ds.map(d => d.lat + ',' + d.lon).join(';') : ''))).places; } catch { /* districts still show */ }
    if (mine !== seq) return;
    for (const p of tagged) rows.push(placeRow('pin', p.name, LANG === 'en' ? p.n + (p.n === 1 ? ' post' : ' posts') : num(p.n) + 'টি পোস্ট', () => showPlacePosts(p.name, text)));
    box.replaceChildren(...rows);
    box.hidden = label.hidden = !rows.length;
  }
  let timer = null, seq = 0;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    const text = q.value.trim(), mine = ++seq;
    const searching = text.length >= 2;
    results.hidden = !searching;
    disc.hidden = searching;
    if (!searching) return;
    timer = setTimeout(async () => {
      const who = el('div', 'found-people'), grid = el('div'), where = el('div', 'found-places'), whereLabel = el('div', 'label', 'জায়গা');
      where.hidden = whereLabel.hidden = true;
      results.replaceChildren(whereLabel, where, el('div', 'label', 'মানুষ'), who, el('div', 'label', 'পোস্ট'), grid);
      findPlaces(text, where, whereLabel, mine);
      postGrid(grid, 0, 'এই খোঁজে কোনো পোস্ট পাওয়া যায়নি।', text);
      if (!ME) { who.appendChild(el('div', 'empty', 'মানুষ খুঁজতে লগইন করুন।')); return; }
      try {
        const { people: found } = await peopleApi('search?q=' + encodeURIComponent(text));
        if (mine !== seq) return;
        who.replaceChildren(...(found.length ? found.map(personRow) : [el('div', 'empty', 'এই নামে কাউকে পাওয়া যায়নি।')]));
      } catch { /* posts still show */ }
    }, 250);
  });

  // The next page loads as the end of the feed comes near.
  new IntersectionObserver(entries => { if (entries[0].isIntersecting && current === 'explore' && !feed.hidden && last) more(); }, { rootMargin: '600px' }).observe($('explore-end'));
  enter.explore = () => {
    page.classList.remove('searching'); document.querySelector('.ex-search').classList.remove('open');
    q.value = ''; results.hidden = true; disc.hidden = false; start(); faces();
    const wanted = Number(new URLSearchParams(location.search).get('post'));     // arrived by a shared link
    if (wanted && !enter.explore.opened) { enter.explore.opened = true; openPost(wanted); }
  };
  $('explore-new').addEventListener('click', () => openNewPost());
  // The name at the top opens a small menu: the feed, reels, what you saved.
  $('explore-brand').addEventListener('click', e => {
    e.stopPropagation();
    const old = document.querySelector('.ex-menu');
    if (old) { old.remove(); return; }
    const menu = el('div', 'ex-menu');
    const item = (icon, bn, en, fn) => { const b = el('button'); b.append(ic(icon), el('span', null, LANG === 'en' ? en : bn)); b.addEventListener('click', () => { menu.remove(); fn(); }); menu.appendChild(b); };
    item('home', 'ফিড', 'Feed', () => { scrollTo({ top: 0, behavior: 'smooth' }); });
    item('play', 'রিলস', 'Reels', () => $('ex-tabs').children[1].click());
    item('bookmark', 'সেভ করা', 'Saved', () => { if (ME) { go('profile'); setTimeout(() => { const t = document.querySelector('#page-profile [data-tab=saved]'); if (t) t.click(); }, 400); } else openLogin(); });
    $('explore-brand').after(menu);
    setTimeout(() => addEventListener('click', () => menu.remove(), { once: true }), 0);
  });
  // Search opens under the top bar.
  // Search, as on Instagram: the box on top, the posts people like under it until something is typed; বাতিল goes back.
  let discovered = false;
  const openSearch = () => {
    page.classList.add('searching');
    document.querySelector('.ex-search').classList.add('open');
    if (!discovered) { discovered = true; postGrid(disc, 0, 'এখনো কোনো পোস্ট নেই।'); }
    scrollTo(0, 0);
    setTimeout(() => q.focus({ preventScroll: true }), 30);
  };
  const closeSearch = () => {
    page.classList.remove('searching');
    document.querySelector('.ex-search').classList.remove('open');
    q.value = ''; q.dispatchEvent(new Event('input')); q.blur();
  };
  $('explore-find').addEventListener('click', () => (page.classList.contains('searching') ? closeSearch() : openSearch()));
  q.addEventListener('focus', () => { if (!page.classList.contains('searching')) openSearch(); });
  $('explore-cancel').addEventListener('click', closeSearch);
  q.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });
  // The pill under the open tab slides to it (the tab buttons light up as reels or a stream open and close)
  {
    const tabs = $('ex-tabs'), ind = el('i', 'ex-ind');
    tabs.appendChild(ind);
    const place = () => {
      const on = tabs.querySelector('button.on') || tabs.querySelector('button');
      if (!on || !on.offsetWidth) return;
      ind.style.width = on.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + (on.offsetLeft - tabs.clientLeft) + 'px)';
    };
    new MutationObserver(place).observe(tabs, { subtree: true, attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', place);
    if (document.fonts) document.fonts.ready.then(place);
    const before = enter.explore;
    enter.explore = () => { before(); requestAnimationFrame(place); };
    requestAnimationFrame(place);
  }
  // the top bar's hairline only once the feed has scrolled under it
  addEventListener('scroll', () => { if (current === 'explore') page.classList.toggle('scrolled', scrollY > 4); }, { passive: true });
  // Reels: every video, one screen at a time, scrolled up and down.
  for (const b of $('ex-tabs').children) b.addEventListener('click', () => {
    if (b.dataset.t === 'live') { if (typeof openLiveHub === 'function') openLiveHub(); return; }
    if (b.dataset.t !== 'reels') return;
    b.classList.add('on');
    const feedTab = $('ex-tabs').children[0];
    feedTab.classList.remove('on');
    openReels(0).finally(() => {
      const back = () => { b.classList.remove('on'); feedTab.classList.add('on'); };
      if (!reelsBox) back(); else new MutationObserver((_, o) => { if (!document.body.contains(reelsBox)) { back(); o.disconnect(); } }).observe(document.body, { childList: true });
    });
  });
  if (current === 'explore') enter.explore();
})();

// ---- Home: the newest posts as a row of cards, and the faces of the people who share the most ----
async function loadHomePosts() {
  const row = $('home-posts');
  let posts = [];
  try { posts = (await exploreApi('feed')).posts.slice(0, 12); } catch { /* the row stays hidden */ }
  row.replaceChildren();
  for (const p of posts) {
    const card = el('button', 'hp');
    if (p.kind === 'text') { card.classList.add('texty', 'g' + (p.id % 5)); card.appendChild(Object.assign(el('p', 'no-tr'), { textContent: p.caption })); }
    else if (p.kind === 'video' && !p.poster) card.appendChild(firstFrame(p));
    else card.appendChild(Object.assign(el('img'), { src: p.kind === 'video' ? p.poster : p.src, alt: p.caption || '', loading: 'lazy' }));
    if (p.kind === 'video') card.appendChild(svgEl('play', 'play'));
    const who = el('span', 'hp-who');
    who.append(avatar(p.user, 'xs'), Object.assign(el('b', 'no-tr'), { textContent: p.user.name }));
    card.appendChild(who);
    card.addEventListener('click', () => (p.kind === 'video' ? openReels(p.id) : openPost(p.id, loadHomePosts)));
    row.appendChild(card);
  }
  row.hidden = $('home-posts-head').hidden = !posts.length;
  let top = [];
  try { top = (await communityApi('top?n=50')).top; } catch { /* no faces */ }
  const faces = $('home-leaders');
  faces.replaceChildren(...top.slice(0, 5).map(p => avatar(p)));
  if (top.length) faces.appendChild(el('span', 'more', `${num(top.length)} জন অবদান রেখেছেন`));
}
(function hookHome() {
  dragScroll($('home-posts'));
  const before = enter.home;
  enter.home = () => {
    if (before) before();
    const h = new Date().getHours();
    if (ME) $('home-hello').textContent = `${h < 12 ? 'শুভ সকাল' : h < 17 ? 'শুভ দুপুর' : h < 20 ? 'শুভ সন্ধ্যা' : 'শুভ রাত্রি'}, ${ME.name}`;
    loadHomePosts();
  };
  if (current === 'home') enter.home();
})();

// ---- notifications: the heart in Explore ----
// Likes and comments on your posts, new followers and follow-backs. A red dot until they have been looked at.
function setNotifyDot(n) { for (const d of document.querySelectorAll('[data-notify-dot]')) d.hidden = !n; }
async function refreshNotify() {
  if (!ME) { setNotifyDot(0); return; }
  try { const r = await fetch('api/notify/count'); if (r.ok) setNotifyDot((await r.json()).unread); } catch { /* the dot waits for the next try */ }
}
const NOTIFY_TEXT = {
  like: ['আপনার পোস্টে লাইক দিয়েছেন।', 'liked your post.'],
  comment: ['মন্তব্য করেছেন:', 'commented:'],
  follow: ['আপনাকে ফলো করা শুরু করেছেন।', 'started following you.'],
  followback: ['আপনাকে ফলো ব্যাক করেছেন।', 'followed you back.'],
  tag: ['আপনাকে একটি পোস্টে ট্যাগ করেছেন।', 'tagged you in a post.'],
  removed: ['টিম আপনার একটি পোস্ট নিয়ম ভাঙার জন্য সরিয়েছে। কারণ ও আপিল দেখতে চাপুন।', 'The team removed one of your posts for breaking the rules. Tap for why, and to appeal.'],
  removedComment: ['টিম আপনার একটি মন্তব্য নিয়ম ভাঙার জন্য সরিয়েছে। কারণ ও আপিল দেখতে চাপুন।', 'The team removed one of your comments for breaking the rules. Tap for why, and to appeal.'],
  strike: ['আপনার অ্যাকাউন্টে একটি স্ট্রাইক দেওয়া হয়েছে। কারণ ও আপিল দেখতে চাপুন।', 'gave your account a strike. Tap for why, and to appeal.'],
  appeal: ['আপনার আপিলের সিদ্ধান্ত হয়েছে। দেখতে চাপুন।', 'decided on your appeal. Tap to see.'],
  broadcast: ['', '']
};
const MOD_KINDS = new Set(['removed', 'strike', 'appeal', 'broadcast']);
// A removal, a strike or an appeal's answer, opened from its notification: the reason, what it means, and (within
// 30 days, once) a form to appeal. The team member who decided does not review the appeal.
function openModNotice(m) {
  const T = (bn, en) => LANG === 'en' ? en : bn;
  if (m.type === 'broadcast') { openModal(m.title || 'Manzeela', '', [Object.assign(el('p', 'mod-lead no-tr'), { textContent: LANG === 'en' && m.bodyEn ? m.bodyEn : m.body })], [button('check', T('ঠিক আছে', 'OK'), closeModal)]); return; }
  const day = ts => new Date(ts).toLocaleDateString(NUM_LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
  const outcome = o => o === 'ban' ? T('অ্যাকাউন্ট বন্ধ', 'the account closed') : String(o).startsWith('restrict:') ? T(num(Number(o.split(':')[1])) + ' দিন পোস্ট, স্টোরি ও মন্তব্য বন্ধ', 'no posts, stories or comments for ' + o.split(':')[1] + ' days') : T('সতর্কবার্তা', 'a warning');
  const quote = text => Object.assign(el('blockquote', 'mod-quote no-tr'), { textContent: text });
  const body = [];
  const line = (label, value) => { const r = el('div', 'mod-kv'); r.append(el('span', null, label), Object.assign(el('b', 'no-tr'), { textContent: value })); return r; };
  if (m.type === 'appeal') {
    body.push(el('p', 'mod-lead', m.status === 'overturned' ? T('টিম আবার দেখে আপনার আপিল মেনে নিয়েছে। স্ট্রাইক থাকলে তা বাতিল হয়েছে, আর তার কারণে যা বন্ধ ছিল তা খুলে দেওয়া হয়েছে।', 'The team looked again and accepted your appeal. Any strike is cancelled, and what it limited is open again.')
      : T('টিমের অন্য একজন আবার দেখেছেন — আগের সিদ্ধান্তই থাকছে।', 'Another team member looked again — the decision stays.')));
    if (m.note) body.push(quote(m.note));
    openModal(m.status === 'overturned' ? T('আপিল মেনে নেওয়া হয়েছে', 'Your appeal was accepted') : T('সিদ্ধান্ত বহাল থাকছে', 'The decision stays'), '', body, [button('check', T('ঠিক আছে', 'OK'), closeModal)]);
    return;
  }
  const reason = LANG === 'en' ? m.reasonEn : m.reasonBn;
  let title;
  if (m.type === 'removal') {
    title = m.what === 'comment' ? T('আপনার একটি মন্তব্য সরানো হয়েছে', 'One of your comments was removed') : T('আপনার একটি পোস্ট সরানো হয়েছে', 'One of your posts was removed');
    body.push(line(T('কারণ', 'Why'), reason), line(T('কবে', 'When'), day(m.made)));
    if (m.snippet) body.push(quote(m.snippet));
    if (m.strike) body.push(el('p', 'mod-note', T('এর সাথে আপনার অ্যাকাউন্টে একটি স্ট্রাইকও দেওয়া হয়েছে — নোটিফিকেশনে আলাদা করে আছে।', 'A strike was also given to your account — it is in your notifications too.')));
  } else {
    title = T('আপনার অ্যাকাউন্টে একটি স্ট্রাইক', 'A strike on your account');
    body.push(line(T('কারণ', 'Why'), reason), line(T('ফল', 'What happens'), outcome(m.outcome)), line(T('মেয়াদ শেষ', 'Ends'), day(m.expires)));
    if (m.revoked) body.push(el('p', 'mod-note ok', T('এই স্ট্রাইক পরে বাতিল করা হয়েছে।', 'This strike was later cancelled.')));
    else body.push(el('p', 'mod-note', T('এখন আপনার চালু স্ট্রাইক ' + num(m.active) + 'টি। নিয়ম: ', 'Active strikes now: ' + m.active + '. The rule: ')
      + m.policy.steps.map((x, i) => num(i + 1) + T('ম', '') + ': ' + outcome(x)).join(' · ') + T(' — ' + num(m.policy.expireDays) + ' দিন পরে স্ট্রাইকের মেয়াদ শেষ হয়।', ' — a strike ends after ' + m.policy.expireDays + ' days.')));
  }
  const actions = [];
  if (m.appeal) {
    const st = { open: T('আপনার আপিল জমা আছে — টিমের অন্য একজন দেখে জানাবেন।', 'Your appeal is in — another team member will look and tell you.'), upheld: T('আপিলের পর সিদ্ধান্ত বহাল আছে।', 'After your appeal the decision stays.'), overturned: T('আপিল মেনে নেওয়া হয়েছে।', 'Your appeal was accepted.') }[m.appeal.status];
    body.push(el('p', 'mod-note' + (m.appeal.status === 'overturned' ? ' ok' : ''), st));
    if (m.appeal.note) body.push(quote(m.appeal.note));
  } else if (m.canAppeal) {
    const ta = Object.assign(el('textarea', 'mod-text'), { rows: 4, maxLength: 1000, placeholder: T('কেন ভুল মনে হচ্ছে, লিখুন (অন্তত ১০ অক্ষর)', 'Why do you think this is wrong? (at least 10 characters)') });
    const msg = el('div', 'form-note');
    body.push(el('b', 'mod-sub', T('ভুল মনে হলে আপিল করুন', 'Think this is a mistake? Appeal')), ta, msg);
    const send = button('send', T('আপিল পাঠান', 'Send appeal'), async () => {
      if (ta.value.trim().length < 10) { msg.textContent = T('আরেকটু লিখুন।', 'Please write a little more.'); ta.focus(); return; }
      send.disabled = true;
      try {
        const r = await fetch('api/appeal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: m.type, id: m.id, body: ta.value.trim() }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'server');
        $('m-body').replaceChildren(el('p', 'mod-lead', T('আপিল জমা হয়েছে। যিনি সিদ্ধান্ত নিয়েছিলেন তিনি ছাড়া টিমের অন্য একজন দেখবেন, আর এখানে নোটিফিকেশনে জানাবেন।', 'Your appeal is in. Someone other than the one who decided will look, and tell you here in your notifications.')));
        $('m-actions').replaceChildren(button('check', T('ঠিক আছে', 'OK'), closeModal));
      } catch (e) {
        send.disabled = false;
        msg.textContent = e.message === 'already' ? T('এর জন্য আপিল আগেই জমা আছে।', 'An appeal is already in.') : e.message === 'late' ? T('৩০ দিন পার হয়ে গেছে — সাহায্য কেন্দ্রে জানান।', 'More than 30 days have passed — write to the help centre.') : T('পাঠানো যায়নি — আবার চেষ্টা করুন।', 'Could not send — try again.');
      }
    });
    actions.push(send);
  } else body.push(el('p', 'mod-note', T('আপিলের সময় (৩০ দিন) পার হয়ে গেছে। কিছু বলার থাকলে সাহায্য কেন্দ্রে লিখুন।', 'The 30 days to appeal have passed. Write to the help centre if you need to.')));
  openModal(title, '', body, actions);
}
async function openNotifications() {
  if (!ME) { needLogin('নোটিফিকেশন দেখতে লগইন করুন'); return; }
  const box = el('div', 'notif');
  const head = el('header', 'notif-head');
  const back = el('button', 'icon-btn');
  back.innerHTML = svg('back');
  back.setAttribute('aria-label', 'ফিরে যান');
  head.append(back, el('b', null, 'নোটিফিকেশন'));
  const list = el('div', 'notif-list');
  list.append(el('div', 'skeleton'), el('div', 'skeleton'));
  const sheet = el('div', 'notif-sheet');
  sheet.append(head, list);
  box.appendChild(sheet);
  const close = () => { box.classList.add('out'); setTimeout(() => box.remove(), 260); removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', close);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  addEventListener('keydown', key);
  document.body.appendChild(box);
  let d;
  try { d = await (await fetch('api/notify/list')).json(); } catch { list.replaceChildren(el('div', 'empty', 'দেখানো যায়নি।')); return; }
  fetch('api/notify/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  setNotifyDot(0);
  if (!d.items.length) {
    const none = el('div', 'notif-none');
    none.append(Object.assign(el('span', 'ring'), { innerHTML: svg('heart') }), el('b', null, 'এখনো কিছু নেই'), el('span', null, 'কেউ আপনার পোস্টে লাইক বা মন্তব্য করলে, বা আপনাকে ফলো করলে এখানে দেখবেন।'));
    list.replaceChildren(none);
    return;
  }
  const day = 864e5, now = Date.now();
  const bucket = t => now - t < day ? 'আজ' : now - t < 7 * day ? 'এই সপ্তাহে' : now - t < 30 * day ? 'এই মাসে' : 'আগের';
  const rows = [];
  let last = '';
  for (const n of d.items) {
    const b = bucket(n.created);
    if (b !== last) { rows.push(el('div', 'notif-label', b)); last = b; }
    const row = el('div', 'notif-row' + (n.seen ? '' : ' new'));
    const t = el('div', 't no-tr');
    const who = Object.assign(el('b'), { textContent: MOD_KINDS.has(n.kind) ? 'Manzeela' : n.actor.username || n.actor.name });   // a removal, a strike or an appeal's answer comes from the team, not a person
    if (isVerified(n.actor) && !MOD_KINDS.has(n.kind)) who.appendChild(vbadge());
    const [bn, en] = NOTIFY_TEXT[n.kind === 'removed' && n.mod && n.mod.what === 'comment' ? 'removedComment' : n.kind] || ['', ''];
    const said = n.kind === 'broadcast' && n.mod ? (LANG === 'en' && n.mod.bodyEn ? n.mod.bodyEn : n.mod.body) : (LANG === 'en' ? en : bn) + (n.kind === 'comment' ? ' ' + n.body : '');
    t.append(who, document.createTextNode(' ' + said + ' '), el('time', null, shortAgo(n.created)));
    row.append(MOD_KINDS.has(n.kind) ? Object.assign(el('span', 'avatar notif-team'), { innerHTML: svg('shield') }) : avatar(n.actor), t);
    if (MOD_KINDS.has(n.kind) && n.mod) row.addEventListener('click', () => { close(); setTimeout(() => openModNotice(n.mod), 280); });
    if (n.kind === 'follow' || n.kind === 'followback') {
      if (n.actor.relation === 'follower') row.appendChild(followButton(n.actor, null, false));
      else if (n.actor.relation === 'mutual' || n.actor.relation === 'following') row.appendChild(el('span', 'notif-tag', LANG === 'en' ? 'Following' : 'ফলো করছেন'));
      row.addEventListener('click', e => { if (!e.target.closest('button')) { close(); openProfilePage(n.actor.id); } });
    } else if (n.post) {
      const thumb = el('span', 'notif-thumb');
      if (n.post.thumb) thumb.appendChild(Object.assign(el('img'), { src: n.post.thumb, alt: '', loading: 'lazy' }));
      else thumb.appendChild(Object.assign(el('span', 'tt no-tr'), { textContent: n.post.text || '▶' }));
      row.appendChild(thumb);
      row.addEventListener('click', () => { close(); openPost(n.post.id); });
    }
    rows.push(row);
  }
  list.replaceChildren(...rows);
}
$('explore-heart').addEventListener('click', openNotifications);
refreshNotify();
setInterval(() => { if (!document.hidden) refreshNotify(); }, 120_000);
