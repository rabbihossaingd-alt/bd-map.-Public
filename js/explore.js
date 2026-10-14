// ---- Explore: photos and videos of places people have been ----
// The page is a feed, one post after another, the way a social app shows it: who posted, the photo or video at
// full width, like / comment / place underneath, then the caption. A search box at the top finds people and
// posts. Tapping a video opens the reels viewer: one video per screen, swipe or scroll up for the next.
// A post is one photo or one video with a caption and, optionally, the place it shows.

async function exploreApi(path, body) {
  const res = await fetch('api/explore/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
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

function exploreNote(text) { chatToast(ME || { id: 0, name: 'BD Map' }, text); }
// Share a post: the phone's own share sheet where there is one, otherwise the link is copied.
async function sharePost(p) {
  const url = `${location.origin}${location.pathname}?post=${p.id}#/explore`;
  try {
    if (navigator.share) await navigator.share({ title: 'BD Map', text: p.caption || p.user.name, url });
    else { await navigator.clipboard.writeText(url); exploreNote('লিংক কপি হয়েছে।'); }
  } catch { /* the share sheet was closed */ }
}
async function toggleSave(p, repaint) {
  if (!ME) { openLogin(); return; }
  p.saved = !p.saved;
  repaint();
  try { Object.assign(p, await exploreApi('save', { id: p.id })); repaint(); if (p.saved) exploreNote('সেভ করা হয়েছে — প্রোফাইলে পাবেন।'); } catch { /* keeps what was shown */ }
}

// Like or unlike. The heart and the count change at once; the server's answer then settles the number.
async function toggleLike(p, repaint) {
  if (!ME) { openLogin(); return; }
  p.liked = !p.liked;
  p.likes += p.liked ? 1 : -1;
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

// ---- one post in the feed ----
let feedWatcher = null;      // plays a feed video while it is on screen, pauses it when it leaves
let feedSound = false;       // browsers only allow sound after a tap, so videos start silent until the speaker is pressed
function feedCard(p, onGone) {
  const card = el('article', 'fc');
  const head = el('header', 'fc-head');
  const who = el('button', 'fc-who');
  const t = el('span', 't');
  const when = el('small');
  when.appendChild(el('span', null, agoText(p.created)));
  if (p.place) when.append(document.createTextNode(' · '), Object.assign(el('span', 'no-tr'), { textContent: p.place.label }));
  t.append(nameEl(p.user), when);
  who.append(avatar(p.user, 'sm ring'), t);
  who.addEventListener('click', () => openProfilePage(p.user.id));
  const more = el('button', 'icon-btn');
  more.innerHTML = svg('more');
  more.setAttribute('aria-label', 'আরও অপশন');
  more.addEventListener('click', () => postMenu(p, onGone));
  head.append(who, more);

  const media = el('div', 'fc-media');
  const burst = svgEl('heart', 'burst');
  const like = el('button', 'fc-btn like-btn'), count = el('b', 'fc-likes');
  const paint = pop => {
    like.classList.toggle('on', p.liked);
    count.textContent = `${num(p.likes)} লাইক`;
    count.hidden = !p.likes;
    if (pop) { like.classList.remove('pop'); void like.offsetWidth; like.classList.add('pop'); }
  };
  like.innerHTML = svg('heart');
  like.setAttribute('aria-label', 'লাইক');
  like.addEventListener('click', () => toggleLike(p, paint));
  if (p.kind === 'text') {
    media.className = 'fc-text g' + (p.id % 5) + (p.caption.length > 140 ? ' long' : '');
    media.appendChild(Object.assign(el('p', 'no-tr'), { textContent: p.caption }));
  } else if (p.kind === 'video') {
    const v = el('video');
    Object.assign(v, { src: p.src, poster: p.poster, muted: true, loop: true, playsInline: true, preload: 'metadata' });
    const speaker = el('button', 'fc-sound' + (feedSound ? ' on' : ''));
    speaker.innerHTML = svg('sound');
    speaker.setAttribute('aria-label', 'শব্দ');
    speaker.addEventListener('click', e => {
      e.stopPropagation();
      feedSound = !feedSound;
      for (const b of document.querySelectorAll('.fc-sound')) b.classList.toggle('on', feedSound);
      for (const x of document.querySelectorAll('.fc-media video')) x.muted = !feedSound;
      if (feedSound) v.play().catch(() => {});
    });
    v.muted = !feedSound;
    media.append(v, svgEl('play', 'reel-mark'), speaker);
    media.classList.add('video');
    media.addEventListener('click', () => { v.pause(); openReels(p.id); });
    if (feedWatcher) feedWatcher.observe(v);
  } else {
    const img = Object.assign(el('img'), { src: p.src, alt: p.caption || '', loading: 'lazy' });
    media.appendChild(img);
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

  const bar = el('div', 'fc-bar');
  const talk = el('button', 'fc-btn');
  talk.innerHTML = svg('chat');
  talk.setAttribute('aria-label', 'মন্তব্য');
  talk.addEventListener('click', () => openPost(p.id, onGone));
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
  const all = el('button', 'fc-all', p.comments ? `সব ${num(p.comments)} টি মন্তব্য দেখুন` : 'প্রথম মন্তব্যটি করুন');
  all.addEventListener('click', () => openPost(p.id, onGone));
  body.appendChild(all);
  paint(false);
  card.append(head, media, bar, body);
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
function postTile(p, onGone, user) {
  const tile = el('button', 'tile-post');
  const img = Object.assign(el('img'), { loading: 'lazy', alt: p.caption || '', src: p.kind === 'video' ? p.poster : p.src });
  if (p.kind === 'text') { tile.classList.add('texty', 'g' + (p.id % 5)); tile.appendChild(Object.assign(el('span', 'tt no-tr'), { textContent: p.caption })); }
  else if (p.kind === 'video' && !p.poster) tile.classList.add('blank'); else tile.appendChild(img);
  if (p.kind === 'video') tile.appendChild(svgEl('play', 'play'));
  const meta = el('span', 'meta');
  meta.append(svgEl('heart'), document.createTextNode(num(p.likes)));
  tile.appendChild(meta);
  tile.addEventListener('click', () => (p.kind === 'video' ? openReels(p.id, user) : openPost(p.id, onGone)));
  return tile;
}

// A grid of one person's posts (or of a search), a page at a time.
function postGrid(box, user, emptyText, query, saved) {
  const grid = el('div', 'post-grid'), more = el('button', 'btn quiet more-posts', 'আরও দেখুন');
  let last = 0, busy = false;
  async function load() {
    if (busy) return;
    busy = true;
    let posts = [];
    try { posts = (await exploreApi(`feed?user=${user}${last ? '&before=' + last : ''}${query ? '&q=' + encodeURIComponent(query) : ''}${saved ? '&saved=1' : ''}`)).posts; } catch { /* shows what is there */ }
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
async function openPost(id, onGone) {
  let data;
  try { data = await exploreApi('post?id=' + id); } catch { return; }
  const p = data.post;
  const media = el('div', 'post-media');
  if (p.kind === 'text') { media.className = 'fc-text g' + (p.id % 5); media.appendChild(Object.assign(el('p', 'no-tr'), { textContent: p.caption })); }
  else if (p.kind === 'video') media.appendChild(Object.assign(el('video'), { src: p.src, poster: p.poster, controls: true, playsInline: true, preload: 'metadata' }));
  else media.appendChild(Object.assign(el('img'), { src: p.src, alt: p.caption }));

  const who = el('div', 'person tap post-who');
  const t = el('div', 't');
  t.append(nameEl(p.user), el('span', null, agoText(p.created)));
  who.append(avatar(p.user, 'sm'), t);
  who.addEventListener('click', () => { closeReels(); openProfilePage(p.user.id); });

  const like = el('button', 'heart-btn');
  const paint = pop => { like.innerHTML = svg('heart'); like.appendChild(document.createTextNode(num(p.likes))); like.classList.toggle('on', p.liked); if (pop) { like.classList.add('pop'); setTimeout(() => like.classList.remove('pop'), 400); } };
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
    if (!ME) { openLogin(); return; }
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try { addComment((await exploreApi('comment', { id, body: text })).comment); $('m-body').scrollTop = $('m-body').scrollHeight; } catch { input.value = text; }
  });
  const caption = Object.assign(el('p', 'post-caption no-tr'), { textContent: p.caption });
  openModal('', '', [media, who, bar, ...(p.caption && p.kind !== 'text' ? [caption] : []), list], [form]);
  $('modal').classList.add('post-modal');
}

// ---- reels: one video per screen ----
// A full-screen column that snaps from one video to the next. The video on screen plays, the others wait.
let reelsBox = null;
function closeReels() {
  if (!reelsBox) return;
  for (const v of reelsBox.querySelectorAll('video')) v.pause();
  reelsBox.remove();
  reelsBox = null;
  document.body.classList.remove('reels-open');
}
async function openReels(startId, user) {
  let posts = [];
  try { posts = (await exploreApi(`feed?kind=video${user ? '&user=' + user : ''}`)).posts; } catch { return; }
  const at = posts.findIndex(p => p.id === startId);
  if (at < 0) return;
  closeReels();
  let sound = true;
  const box = reelsBox = el('div', 'reels');
  const close = el('button', 'reels-x');
  close.innerHTML = svg('close');
  close.setAttribute('aria-label', 'বন্ধ করুন');
  close.addEventListener('click', closeReels);
  const column = el('div', 'reels-col');
  const watcher = new IntersectionObserver(entries => {
    for (const e of entries) {
      const v = e.target.querySelector('video');
      if (e.isIntersecting && e.intersectionRatio > 0.6) { v.muted = !sound; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); }
      else v.pause();
    }
  }, { root: column, threshold: [0, 0.6, 1] });

  for (const p of posts) {
    const reel = el('section', 'reel');
    const v = el('video');
    Object.assign(v, { src: p.src, poster: p.poster, loop: true, playsInline: true, preload: 'metadata' });
    v.addEventListener('click', () => { if (v.paused) v.play(); else v.pause(); });
    v.addEventListener('pause', () => reel.classList.add('paused'));
    v.addEventListener('play', () => reel.classList.remove('paused'));
    const line = el('i', 'reel-line');
    v.addEventListener('timeupdate', () => { if (v.duration) line.style.width = (v.currentTime / v.duration * 100) + '%'; });

    const info = el('div', 'reel-info');
    const who = el('button', 'fc-who');
    who.append(avatar(p.user, 'sm'), nameEl(p.user));
    who.addEventListener('click', () => { closeReels(); openProfilePage(p.user.id); });
    info.appendChild(who);
    if (p.caption) info.appendChild(Object.assign(el('p', 'no-tr'), { textContent: p.caption }));
    if (p.place) {
      const place = el('button', 'reel-place');
      place.innerHTML = svg('pin');
      place.appendChild(Object.assign(el('span', 'no-tr'), { textContent: p.place.label }));
      place.addEventListener('click', () => { closeReels(); goTo(p.place); });
      info.appendChild(place);
    }
    const side = el('div', 'reel-side');
    const act = (icon, text, fn) => { const b = el('button', 'reel-btn'); b.innerHTML = svg(icon); const n = el('span', null, text); b.appendChild(n); b.addEventListener('click', fn); side.appendChild(b); return [b, n]; };
    const [like, likes] = act('heart', num(p.likes), () => toggleLike(p, pop => {
      like.classList.toggle('on', p.liked); likes.textContent = num(p.likes);
      if (pop) { like.classList.remove('pop'); void like.offsetWidth; like.classList.add('pop'); }
    }));
    like.classList.toggle('on', p.liked);
    act('chat', num(p.comments), () => { v.pause(); openPost(p.id); });
    const [mute] = act('sound', '', () => { sound = !sound; for (const x of box.querySelectorAll('video')) x.muted = !sound; for (const m of box.querySelectorAll('.mute')) m.classList.toggle('off', !sound); });
    mute.classList.add('mute');
    act('more', '', () => postMenu(p, closeReels));
    reel.append(v, svgEl('play', 'reel-paused'), info, side, line);
    column.appendChild(reel);
    watcher.observe(reel);
  }
  box.append(column, close);
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
async function loadStories(row) {
  let groups = [];
  try { groups = (await exploreApi('stories')).stories; } catch { /* the row still offers to add one */ }
  const seen = seenStories();
  row.replaceChildren();
  const add = el('button', 'face add');
  add.append(avatar(ME || { id: 0, name: '+' }, 'lg'), svgEl('plus', 'badge'), el('span', null, 'আপনার স্টোরি'));
  add.addEventListener('click', addStory);
  row.appendChild(add);
  groups.forEach((g, i) => {
    const b = el('button', 'face' + ((seen[g.user.id] || 0) >= g.items.at(-1).id ? ' seen' : ''));
    b.append(avatar(g.user, 'lg ring'), Object.assign(el('span', 'no-tr'), { textContent: ME && g.user.id === ME.id ? (LANG === 'en' ? 'You' : 'আপনি') : g.user.name }));
    b.addEventListener('click', () => openStories(groups, i, () => loadStories(row)));
    row.appendChild(b);
  });
  row.hidden = false;
}
function addStory() {
  if (!ME) { openLogin(); return; }
  const chooser = Object.assign(el('input'), { type: 'file', accept: 'image/*,video/mp4,video/webm,video/quicktime' });
  chooser.addEventListener('change', async () => {
    const file = chooser.files[0];
    if (!file) return;
    if (file.type.startsWith('video') && file.size > 50e6) { exploreNote('ভিডিওটি ৫০ এমবির বেশি।'); return; }
    exploreNote('স্টোরি আপলোড হচ্ছে…');
    try {
      const video = file.type.startsWith('video');
      const media = await uploadMedia(video ? file : await shrinkPhoto(file), video ? (file.type || 'video/mp4') : 'image/jpeg', () => {});
      await exploreApi('story', { media, poster: video ? await videoPoster(file) : '' });
      exploreNote('স্টোরি দেওয়া হয়েছে — ২৪ ঘণ্টা থাকবে।');
      loadStories($('explore-people'));
    } catch { exploreNote('স্টোরি দেওয়া যায়নি। আবার চেষ্টা করুন।'); }
  });
  chooser.click();
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
      v.addEventListener('loadedmetadata', () => run(Math.min(30, v.duration || 15) * 1000));
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
      stage.replaceChildren(v);
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
function videoPoster(file) {
  return new Promise(resolve => {
    const v = el('video'), url = URL.createObjectURL(file);
    const done = value => { URL.revokeObjectURL(url); resolve(value); };
    Object.assign(v, { muted: true, playsInline: true, preload: 'auto', src: url });
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
    v.onseeked = () => {
      const scale = Math.min(1, 900 / Math.max(v.videoWidth, v.videoHeight)), c = el('canvas');
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      try { c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); done(c.toDataURL('image/jpeg', 0.8)); } catch { done(''); }
    };
    v.onerror = () => done('');
    setTimeout(() => done(''), 8000);
  });
}
function uploadMedia(blob, type, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', 'api/explore/media');
    x.setRequestHeader('Content-Type', type);
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => { try { const d = JSON.parse(x.responseText); x.status === 200 ? resolve(d.media) : reject(new Error(d.error || 'server')); } catch { reject(new Error('server')); } };
    x.onerror = () => reject(new Error('server'));
    x.send(blob);
  });
}

function openNewPost() {
  if (!ME) { openLogin(); return; }
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
    if (file.type.startsWith('video') && file.size > 50e6) { file = null; fail('ভিডিওটি ৫০ এমবির বেশি। ছোট একটি ভিডিও দিন।'); return; }
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
    bar.hidden = false;
    note.className = 'form-note';
    note.textContent = 'আপলোড হচ্ছে…';
    try {
      const video = file.type.startsWith('video');
      const blob = video ? file : await shrinkPhoto(file);
      const poster = video ? await videoPoster(file) : '';
      const media = await uploadMedia(blob, video ? (file.type || 'video/mp4') : 'image/jpeg', f => { bar.firstChild.style.width = Math.round(f * 100) + '%'; });
      await exploreApi('post', { media, poster, caption: caption.value, place });
      closeModal();
      if (current === 'explore') enter.explore(); else if (current === 'profile') drawProfile(); else go('explore');
    } catch (e) {
      share.disabled = false;
      bar.hidden = true;
      fail(e.message === 'big' ? 'ফাইলটি অনেক বড়।' : e.message === 'type' ? 'এই ধরনের ফাইল নেওয়া যায় না। JPG, PNG, MP4 বা WebM দিন।' : e.message === 'slow' ? 'আজ অনেকগুলো পোস্ট করেছেন। কাল আবার চেষ্টা করুন।'
           : e.message === 'image' ? 'ছবিটি পড়া যায়নি। অন্য একটি ছবি দিন।' : 'পোস্ট করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।');
    }
  });
  openModal('নতুন পোস্ট', '', [pick, chooser, capBox, placeBox, bar, note], [share]);
}

// ---- the page ----
(function initExplore() {
  const feed = $('explore-feed'), results = $('explore-results'), people = $('explore-people'), q = $('explore-q');
  let last = 0, busy = false, done = false;
  feedWatcher = new IntersectionObserver(entries => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting && e.intersectionRatio > 0.6) { v.muted = !feedSound; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }); } else v.pause();
    }
  }, { threshold: [0, 0.6] });

  async function more() {
    if (busy || done) return;
    busy = true;
    let posts = [];
    try { posts = (await exploreApi('feed' + (last ? '?before=' + last : ''))).posts; } catch { /* shows what is there */ }
    for (const p of posts) feed.appendChild(feedCard(p, start));
    if (posts.length) last = posts[posts.length - 1].id;
    done = posts.length < 30;
    if (!feed.children.length) {
      const none = el('div', 'prof-none');
      none.append(ic('image'), el('b', null, 'এখনো কেউ কিছু পোস্ট করেননি। প্রথম পোস্টটি আপনার হোক।'), button('plus', 'নতুন পোস্ট', () => openNewPost()));
      feed.appendChild(none);
    }
    busy = false;
  }
  function start() { last = 0; done = false; busy = false; feed.replaceChildren(); more(); }

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

  // Search: people by name, posts by caption or place.
  let timer = null, seq = 0;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    const text = q.value.trim(), mine = ++seq;
    const searching = text.length >= 2;
    results.hidden = !searching;
    feed.hidden = searching;
    people.hidden = searching || !people.children.length;
    if (!searching) return;
    timer = setTimeout(async () => {
      const who = el('div', 'found-people'), grid = el('div');
      results.replaceChildren(el('div', 'label', 'মানুষ'), who, el('div', 'label', 'পোস্ট'), grid);
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
    q.value = ''; results.hidden = true; feed.hidden = false; start(); faces();
    const wanted = Number(new URLSearchParams(location.search).get('post'));     // arrived by a shared link
    if (wanted && !enter.explore.opened) { enter.explore.opened = true; openPost(wanted); }
  };
  $('explore-new').addEventListener('click', () => openNewPost());
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
    else if (p.kind === 'video' && !p.poster) card.classList.add('g4');
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
