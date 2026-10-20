// ---- App shell: router, shared search box, and one controller per page ----

for (const n of document.querySelectorAll('[data-ic]')) n.innerHTML = svg(n.dataset.ic);

const BD_LNGLAT = [[87.8, 20.3], [92.9, 26.9]];   // Bangladesh, as [lon, lat] corners
const PAGES = ['home', 'trip', 'buses', 'train', 'districts', 'nearby', 'tour', 'fares', 'more', 'chat', 'support', 'community', 'profile', 'settings', 'explore', 'insights'];
const trip = { from: null, to: null };          // each: { lat, lon, label }
const enter = {};                               // page name -> function run when the page opens
const searches = [];
let current = null;

const districtById = id => DISTRICTS.find(d => d.id === id);
const setStatus = msg => { for (const s of document.querySelectorAll('.status')) s.textContent = msg || ''; };

function stagger(box) {
  [...box.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 14)));
  box.classList.add('stagger');
}

// One list row: icon tile, title + sub line, optional price. Tappable when onClick is given.
function item(icon, title, sub, price, onClick) {
  const r = el(onClick ? 'button' : 'div', 'item');
  const t = el('div', 't');
  t.appendChild(el('b', null, title));
  if (sub) t.appendChild(el('span', null, sub));
  r.append(ic(icon), t);
  if (price) r.appendChild(el('div', 'p', price));
  if (onClick) r.addEventListener('click', () => onClick(r));
  return r;
}

function selectOnly(node) {
  for (const n of node.parentNode.querySelectorAll('.item.on')) n.classList.remove('on');
  node.classList.add('on');
}

function tile(cls, label, value, sub) {
  const t = el('div', 'tile ' + cls);
  t.append(el('span', null, label), el('b', null, value));
  if (sub) t.appendChild(el('span', null, sub));
  return t;
}

// Per-km rates keep two decimals (৳২.৭০) unless they are whole taka (৳১২).
const rateText = rate => '৳' + rate.toLocaleString(NUM_LOCALE, { minimumFractionDigits: rate % 1 ? 2 : 0, maximumFractionDigits: 2 });
const perKmText = rate => `কিমি প্রতি ${rateText(rate)}`;

// Non-AC fare at the government per-km rate beside the AC estimate (the government does not set AC fares).
// With `official` (BRTA's chart fare for this route) the non-AC tile shows that instead of an estimate.
function fareTiles(rule, km, official) {
  const fare = official ? official.f51 : busFare(rule, km);
  const [lo, hi] = FARES.bus.acRange;
  const tiles = el('div', 'tiles');
  tiles.append(
    official ? tile('main', 'নন-এসি · বিআরটিএ নির্ধারিত', fareRange(official.f51, official.f40), `৫১ ও ৪০ আসনের বাস · ${official.terminal} থেকে`)
             : tile('main', 'নন-এসি · আনুমানিক', taka(fare), perKmText(rule.perKm)),
    tile('', 'এসি · আনুমানিক', `${taka(fare * lo)}–${num(Math.ceil(fare * hi))}`, 'কোম্পানি ভেদে আলাদা')
  );
  return tiles;
}

// What counters typically charge between Dhaka and a district (unofficial list), when we have it.
function counterFare(a, b) {
  const other = a.id === 'dhaka' ? b : b.id === 'dhaka' ? a : null;
  const f = other && MARKET_FARES[other.id];
  if (!f) return null;
  const ac = f.length > 2 ? ` · এসি ${fareRange(f[2], f[3])}` : '';
  return item('tag', 'কাউন্টারে সাধারণত', `নন-এসি${ac} · অনানুষ্ঠানিক তালিকা`, fareRange(f[0], f[1]));
}

function operatorChips(a, b) {
  const list = operatorsBetween(a, b);
  if (!list.length) return el('div', 'empty', 'এই রুটের বাস কোম্পানির নাম এখনো যোগ হয়নি।');
  const chips = el('div', 'chips');
  for (const o of list) {
    const chip = el('div', 'chip', o.bn);
    chip.dataset.i = [...o.bn][0];
    if (!(o.ac && o.nonAc)) chip.appendChild(el('small', null, o.ac ? 'শুধু এসি' : 'নন-এসি'));
    chips.appendChild(chip);
  }
  return chips;
}

// ---- Modal (one shared dialog: bus routes, district details) ----
function openModal(title, sub, body, actions = []) {
  $('modal').classList.remove('post-modal');
  $('m-title').classList.remove('no-tr');
  $('m-sub').classList.remove('no-tr');
  $('m-title').textContent = title;
  $('m-sub').textContent = sub || '';
  $('m-body').replaceChildren(...body);
  $('m-body').scrollTop = 0;
  $('m-actions').replaceChildren(...actions);
  $('modal').hidden = false;
}
const closeModal = () => { $('modal').hidden = true; };
$('m-close').addEventListener('click', closeModal);
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && $('lightbox').hidden) closeModal(); });

function button(icon, text, onClick, quiet) {
  const b = el('button', 'btn' + (quiet ? ' quiet' : ''));
  b.innerHTML = svg(icon);
  b.appendChild(document.createTextNode(text));
  b.addEventListener('click', onClick);
  return b;
}

const asPlace = it => ({ lat: it.lat, lon: it.lon, label: it.bn || it.title });

// Start a trip to a place: straight to the map, with or without a starting point.
function goTo(place) {
  setPlace('to', place);
  if (!trip.from) go('trip');
}

// A photo strip for a place. Starts empty and fills in if Wikimedia Commons has pictures taken nearby.
function photoStrip(place, radius) {
  const box = el('div', 'photo-box');
  placePhotos(place, radius).then(photos => {
    if (!photos.length) return;
    const strip = el('div', 'photos');
    photos.forEach((p, i) => {
      const b = el('button');
      b.setAttribute('aria-label', p.name);
      const img = el('img');
      img.src = p.src;
      img.alt = p.name;
      img.loading = 'lazy';
      img.draggable = false;
      b.appendChild(img);
      b.addEventListener('click', () => openLightbox(photos, i));
      strip.appendChild(b);
    });
    dragScroll(strip);
    const note = photos.some(p => p.named) ? 'ছবি: উইকিমিডিয়া কমন্স' : 'আশপাশে তোলা ছবি · উইকিমিডিয়া কমন্স';
    box.append(strip, el('div', 'cap', `${note} · ${num(photos.length)} টি — টেনে সরান, চাপ দিলে বড় হবে`));
  });
  return box;
}

// Lets a horizontal strip be dragged with the mouse and scrolled with the wheel (touch already works).
function dragScroll(strip) {
  let startX = 0, startLeft = 0, down = false, moved = false;
  strip.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    down = true; moved = false; startX = e.clientX; startLeft = strip.scrollLeft;
  });
  addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) { moved = true; strip.classList.add('dragging'); }
    if (moved) strip.scrollLeft = startLeft - dx;
  });
  addEventListener('pointerup', () => { down = false; strip.classList.remove('dragging'); });
  // A drag must not count as a click on the photo underneath.
  strip.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  strip.addEventListener('wheel', e => {
    if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    e.preventDefault();
    strip.scrollLeft += e.deltaY;
  }, { passive: false });
}

// ---- Photo viewer ----
const lightbox = { photos: [], i: 0 };
function showPhoto(i) {
  const n = lightbox.photos.length;
  lightbox.i = (i + n) % n;
  const p = lightbox.photos[lightbox.i];
  $('lb-img').src = p.big;
  $('lb-img').onerror = () => { $('lb-img').onerror = null; $('lb-img').src = p.src; };
  $('lb-img').alt = p.name;
  $('lb-name').textContent = p.name;
  $('lb-meta').textContent = `${num(lightbox.i + 1)}/${num(n)}${p.license ? ' · ' + p.license : ''} · `;
  const link = el('a', null, 'উৎস দেখুন');
  link.href = p.page;
  link.target = '_blank';
  link.rel = 'noopener';
  $('lb-meta').appendChild(link);
  $('lb-prev').hidden = $('lb-next').hidden = n < 2;
}
function openLightbox(photos, i) {
  lightbox.photos = photos;
  showPhoto(i);
  $('lightbox').hidden = false;
}
const closeLightbox = () => { $('lightbox').hidden = true; };
$('lb-close').addEventListener('click', closeLightbox);
$('lb-prev').addEventListener('click', () => showPhoto(lightbox.i - 1));
$('lb-next').addEventListener('click', () => showPhoto(lightbox.i + 1));
$('lightbox').addEventListener('click', e => { if (e.target === $('lightbox') || e.target.classList.contains('lb-stage')) closeLightbox(); });
addEventListener('keydown', e => {
  if ($('lightbox').hidden) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') showPhoto(lightbox.i - 1);
  if (e.key === 'ArrowRight') showPhoto(lightbox.i + 1);
});
{
  // Swipe left/right on touch screens.
  let x0 = null;
  $('lightbox').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  $('lightbox').addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) showPhoto(lightbox.i + (dx < 0 ? 1 : -1));
    x0 = null;
  });
}

// ---- Router ----
// Cards below the fold start slightly lowered and faded, and settle as they come into view. Only what is
// off screen when the page opens is touched, and anything not seen within a few seconds is shown anyway, so
// nothing can stay hidden.
const revealer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' }) : null;
function revealOnScroll(root) {
  if (!revealer) return;
  const found = [...root.querySelectorAll('.card, .label, .page-head, .division, .tip, .faq, .help-topic')].filter(e => !e.classList.contains('reveal') && !e.closest('.modal, .chat, .sheet, .suggest'));
  let n = 0;
  for (const e of found) {
    if (e.getBoundingClientRect().top < innerHeight * 0.92) continue;
    e.classList.add('reveal');
    e.style.transitionDelay = Math.min(n++ % 6, 5) * 45 + 'ms';
    revealer.observe(e);
    setTimeout(() => e.classList.add('in'), 4000);
  }
}

function route() {
  let name = location.hash.replace(/^#\/?/, '') || 'home';
  if (name === 'intercity') name = 'districts';   // old link
  if (name === 'tour') { try { localStorage.setItem('bdmap.rb', 'tour'); } catch { /* storage off */ } history.replaceState(null, '', '#/districts'); name = 'districts'; }   // now a tab of রূপসী বাংলা
  if (name === 'community') { try { localStorage.setItem('bdmap.cx', 'fare'); } catch { /* storage off */ } history.replaceState(null, '', '#/buses'); name = 'buses'; }   // now a tab of নগরপথ
  current = PAGES.includes(name) ? name : 'home';
  for (const p of PAGES) $('page-' + p).classList.toggle('on', p === current);
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('on', a.dataset.nav === current);
  document.body.style.overflow = current === 'trip' ? 'hidden' : '';
  document.body.dataset.page = current;
  scrollTo(0, 0);
  if (enter[current]) enter[current]();
  requestAnimationFrame(() => revealOnScroll($('page-' + current)));
}

function go(name) {
  const hash = '#/' + (name === 'home' ? '' : name);
  if (location.hash === hash || (name === 'home' && !location.hash)) route();
  else location.hash = hash;
}
addEventListener('hashchange', route);

// ---- Trip state ----
function setPlace(which, place) {
  trip[which] = place;
  for (const s of searches) s.sync();
  if (trip.from && trip.to) go('trip');
  else if (current === 'trip') enter.trip();
}

// Type-ahead for one place input: known places instantly (any spelling), then the online search.
function wireSuggest(input, box, onPick, onType) {
  let timer = null, seq = 0;
  const addItem = (icon, title, sub, lat, lon) => {
    const s = el('div', 'sug');
    const t = el('div', 't');
    t.append(el('b', null, title), el('span', null, sub));
    s.append(ic(icon), t);
    // mousedown so the pick lands before the input's blur hides the list
    s.addEventListener('mousedown', e => { e.preventDefault(); box.hidden = true; onPick({ lat, lon, label: title }); });
    box.appendChild(s);
  };
  // Nothing typed yet: offer the places most people go to.
  const showPopular = () => {
    box.replaceChildren(el('div', 'sug-head', 'জনপ্রিয়'));
    for (const p of popularPlaces()) addItem(p.icon, p.title, p.sub, p.lat, p.lon);
    box.hidden = false;
  };
  input.addEventListener('focus', () => { if (input.value.trim().length < 2) showPopular(); });
  input.addEventListener('input', () => {
    if (onType) onType();
    clearTimeout(timer);
    const mine = ++seq;                             // any search still on its way is now out of date
    const q = input.value.trim();
    box.replaceChildren();
    if (q.length < 2) { showPopular(); return; }
    for (const p of searchLocal(q)) addItem(p.icon, p.title, p.sub, p.lat, p.lon);
    box.hidden = box.children.length === 0;
    if (q.length < 3) return;
    timer = setTimeout(async () => {
      const list = await searchOnline(q);
      // Late answers are dropped: the text has changed, or the user has already left the field.
      if (mine !== seq || document.activeElement !== input) return;
      for (const p of list) addItem('pin', p.title, p.sub, p.lat, p.lon);
      if (!box.children.length) box.appendChild(el('div', 'empty', 'কিছু পাওয়া যায়নি — অন্য বানানে লিখে দেখুন, অথবা ম্যাপে চাপ দিয়ে বেছে নিন।'));
      box.hidden = false;
    }, 450);
  });
  input.addEventListener('keydown', e => {
    const first = box.querySelector('.sug');
    if (e.key === 'Enter' && first && !box.hidden && input.value.trim().length >= 2) { e.preventDefault(); first.dispatchEvent(new MouseEvent('mousedown', { cancelable: true })); input.blur(); }
  });
  input.addEventListener('blur', () => { box.hidden = true; seq++; });
}

// ---- Search box (used on Home and on the map page; both stay in sync through `trip`) ----
function createSearch(root) {
  root.innerHTML = `
    <div class="od">
      <div class="dots"><i class="a"></i><i class="l"></i><i class="b"></i></div>
      <div class="inputs">
        <div class="field"><input data-w="from" autocomplete="off" placeholder="কোথা থেকে" aria-label="কোথা থেকে">
          <button class="icon-btn" data-act="locate" title="আমার লোকেশন" aria-label="আমার লোকেশন">${svg('locate')}</button>
          <div class="suggest" hidden></div></div>
        <div class="field"><input data-w="to" autocomplete="off" placeholder="কোথায় যাবেন" aria-label="কোথায় যাবেন">
          <button class="icon-btn" data-act="swap" title="অদলবদল" aria-label="অদলবদল">${svg('swap')}</button>
          <div class="suggest" hidden></div></div>
      </div>
    </div>
    <div class="status"></div>`;

  const inputs = {};
  for (const input of root.querySelectorAll('input')) {
    const which = input.dataset.w, box = input.parentNode.querySelector('.suggest');
    inputs[which] = input;
    wireSuggest(input, box, place => setPlace(which, place), () => { trip[which] = null; });
  }

  root.querySelector('[data-act=swap]').addEventListener('click', () => {
    if (!trip.from || !trip.to) return;
    [trip.from, trip.to] = [trip.to, trip.from];
    setPlace('from', trip.from);
  });
  root.querySelector('[data-act=locate]').addEventListener('click', () => {
    if (!navigator.geolocation) { setStatus('এই ডিভাইসে লোকেশন পাওয়া যাচ্ছে না।'); return; }
    setStatus('লোকেশন খোঁজা হচ্ছে…');
    navigator.geolocation.getCurrentPosition(pos => {
      setStatus('');
      setPlace('from', { lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'আমার লোকেশন' });
    }, () => setStatus('লোকেশনের অনুমতি পাওয়া যায়নি।'));
  });

  const api = {
    sync() {
      for (const w of ['from', 'to']) {
        if (trip[w]) inputs[w].value = tr(trip[w].label);
        else if (document.activeElement !== inputs[w]) inputs[w].value = '';
      }
    }
  };
  searches.push(api);
  return api;
}
createSearch($('home-search'));
createSearch($('trip-search'));

// ---- Recent trips (kept on this device only) ----
const RECENT_KEY = 'bdmap.recent';
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}
function saveRecent(from, to) {
  const same = r => r.from.label === from.label && r.to.label === to.label;
  const list = [{ from, to }, ...loadRecent().filter(r => !same(r))].slice(0, 4);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  if (typeof syncAccount === 'function') syncAccount();
}
function renderRecent() {
  const box = $('recent'), list = loadRecent();
  box.replaceChildren();
  box.hidden = !list.length;
  for (const r of list) {
    const chip = el('button', 'chip');
    chip.innerHTML = svg('clock');
    chip.appendChild(document.createTextNode(` ${r.from.label} → ${r.to.label}`));
    chip.addEventListener('click', () => { trip.from = r.from; setPlace('to', r.to); });
    box.appendChild(chip);
  }
}

// ---- Home ----
(function initHome() {
  const S = id => ({ lat: STOPS[id].lat, lon: STOPS[id].lon, label: STOPS[id].bn });
  const D = id => { const d = districtById(id); return { lat: d.lat, lon: d.lon, label: d.bn }; };
  const popular = [
    [S('jatrabari'), S('mirpur10')], [S('farmgate'), S('uttara')], [D('dhaka'), D('coxsbazar')],
    [D('dhaka'), D('sylhet')], [D('dhaka'), D('rajshahi')]
  ];
  for (const [a, b] of popular) {
    const chip = el('button', 'chip', `${a.label} → ${b.label}`);
    chip.addEventListener('click', () => { trip.from = a; setPlace('to', b); });
    $('popular').appendChild(chip);
  }

  for (const h of HELPLINES) {
    const a = el('a', 'card help');
    a.href = 'tel:' + h.number;
    const t = el('div');
    t.append(el('b', null, h.bn), el('span', null, h.sub));
    a.append(el('div', 'n', h.number), t);
    $('helplines').appendChild(a);
  }

  // রূপসী বাংলা's door: one well-known place a day, its Wikimedia photo; a tap opens the place itself.
  const FEATURED = [
    ['satkhira', 'সুন্দরবন, মুন্সীগঞ্জ-কলাগাছিয়া', 'সুন্দরবন', '6/6b/Save_the_sundarbans_20.jpg'],
    ['naogaon', 'পাহাড়পুর বৌদ্ধ বিহার', 'পাহাড়পুর বৌদ্ধ বিহার', 'a/a3/%E0%A6%AA%E0%A6%BE%E0%A6%B9%E0%A6%BE%E0%A6%A1%E0%A6%BC%E0%A6%AA%E0%A7%81%E0%A6%B0_%E0%A6%AC%E0%A7%8C%E0%A6%A6%E0%A7%8D%E0%A6%A7_%E0%A6%AC%E0%A6%BF%E0%A6%B9%E0%A6%BE%E0%A6%B0_22.jpg'],
    ['munshiganj', 'পদ্মা সেতু ভিউ পয়েন্ট, মাওয়া', 'পদ্মা সেতু', '1/16/The_padma_bridge_02.jpg'],
    ['bagerhat', 'ষাট গম্বুজ মসজিদ', 'ষাট গম্বুজ মসজিদ', '4/4f/Sixty_Dome_Mosque%2CBagerhat.jpg'],
    ['dhaka', 'লালবাগের কেল্লা', 'লালবাগের কেল্লা', '1/1e/Dhaka_Lalbagh_Fort_5.JPG'],
    ['bogura', 'মহাস্থানগড়', 'মহাস্থানগড়', '0/06/BD_Mahasthangarh1_without_people.jpg'],
    ['dhaka', 'আহসান মঞ্জিল', 'আহসান মঞ্জিল', 'e/ea/DJI_0760_%28_Ahsan_Manzil%29.jpg']
  ];
  const [fId, fSight, fName, fFile] = FEATURED[Math.floor(Date.now() / 864e5) % FEATURED.length];
  const fImg = $('hm-feature-img');
  fImg.addEventListener('load', () => $('hm-feature').classList.add('in'));
  fImg.src = `https://upload.wikimedia.org/wikipedia/commons/thumb/${fFile}/960px-${fFile.split('/').pop()}`;
  fImg.alt = fName;
  $('hm-feature-name').textContent = fName;
  $('hm-feature-sub').textContent = `${districtById(fId).bn} জেলা · ${districtById(fId).division} বিভাগ`;
  $('hm-feature').addEventListener('click', async () => {
    const g = typeof loadGuide === 'function' ? await loadGuide().catch(() => null) : null;
    const s = g && ((g[fId] || {}).sights || []).find(x => x.name === fSight);
    if (s && window.openPlace) window.openPlace(districtById(fId), s); else location.hash = '#/districts';
  });

  // Count the headline numbers up once, the first time Home is shown.
  let counted = false;
  enter.home = () => {
    renderRecent();
    if (counted) return;
    counted = true;
    const targets = { routes: LOCAL_ROUTES.length, places: PLACES.length + Object.keys(STOPS).length };
    for (const node of document.querySelectorAll('[data-count]')) {
      const end = targets[node.dataset.count] || +node.dataset.count;
      const start = performance.now();
      const tick = now => {
        const p = Math.min(1, (now - start) / 1100);
        node.textContent = num(Math.round(end * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  };
})();

// ---- Trip / map ----
// MapLibre GL with vector tiles: text and roads are drawn on the device, so the map stays sharp on any
// screen, can tilt into 3D, and can be restyled. Tiles: OpenFreeMap (OpenStreetMap data), no API key.
let map = null, mapReady = null, driverMarker = null, rideTimer = null, is3D = false, stopPopup = null;
let lastKey = '', pendingBus = null, pendingPath = null;
const markers = { from: null, to: null };
const drawTokens = {};
const EMPTY = { type: 'FeatureCollection', features: [] };
const isDark = () => document.documentElement.dataset.theme === 'dark';     // set before the page draws (see index.html)
const inBangladesh = (lat, lon) => lat >= BD_LNGLAT[0][1] && lat <= BD_LNGLAT[1][1] && lon >= BD_LNGLAT[0][0] && lon <= BD_LNGLAT[1][0];
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

// ---- Map look ----
// Modelled on Apple Maps:
//   * a warm, quiet ground; parks, water and campuses in soft clear colours, so a district reads at a glance
//     (green for parks, blue for water, sand for schools and colleges, rose for hospitals, peach for markets)
//   * streets white with a hairline edge in the light map, highways warm yellow; in the dark map the roads are
//     greys a step apart and the highways a muted gold
//   * each label once, with a halo in the ground colour; colour kept for place badges and our own route lines
// The same base style is recoloured for light and dark, so both modes show the same things.
const PALETTES = {
  light: {
    ground: '#f6f4ef', halo: '#ffffff', label: '#1f2937', roadLabel: '#4b5563', waterLabel: '#2f7bbf', border: '#a29bb5',
    // [layer id, fill, edge]
    roads: [[/motorway/, '#f9cf6a', '#e3ab38'], [/trunk_primary/, '#fde6a3', '#e7c472'], [/secondary_tertiary/, '#ffffff', '#d9d3c7'], [/./, '#ffffff', '#e1dcd2']],
    casing: true, path: '#e4ded2', reliefOpacity: 1, ferry: '#5aa0d8',
    use: { commercial: '#fbe9dc', retail: '#fbe4d6', industrial: '#ebe7e2', university: '#f3ead0', college: '#f6efd9', kindergarten: '#f6efd9',
           stadium: '#d6ecc9', playground: '#d3ecc3', recreation_ground: '#d3ecc3', library: '#f6efd9', military: '#ece6e2', bus_station: '#e9ecf3', railway: '#ece9e4' },
    paint: {
      landuse_residential: { 'fill-opacity': 0 },
      park: { 'fill-color': '#cfe9bf', 'fill-opacity': 1 },
      park_outline: { 'line-opacity': 0 },
      landcover_wood: { 'fill-color': '#c6e4b4', 'fill-opacity': 1 },
      landcover_grass: { 'fill-color': '#d3ecc3', 'fill-opacity': 1 },
      landcover_sand: { 'fill-color': '#f4ebcb' },
      landuse_pitch: { 'fill-color': '#c9e7b8' },
      landuse_school: { 'fill-color': '#f6efd9', 'fill-opacity': 1 },
      landuse_hospital: { 'fill-color': '#fbe3e4', 'fill-opacity': 1 },
      landuse_cemetery: { 'fill-color': '#dcebd3' },
      water: { 'fill-color': '#9fd4f7' },
      waterway_river: { 'line-color': '#9fd4f7' },
      waterway_other: { 'line-color': '#9fd4f7' },
      building: { 'fill-color': '#ebe8e2', 'fill-outline-color': '#dcd7ce' },
      'building-3d': { 'fill-extrusion-color': '#ede9e2' },
      boundary_3: { 'line-color': '#c9c3b8' }
    }
  },
  dark: {
    ground: '#1d1f23', halo: '#141619', label: '#e5e7eb', roadLabel: '#b6bcc6', waterLabel: '#7cb6ea', border: '#6c6f80',
    roads: [[/motorway/, '#9c8550', '#9c8550'], [/trunk_primary/, '#686458', '#686458'], [/secondary_tertiary/, '#4d5158', '#4d5158'], [/./, '#3d4046', '#3d4046']],
    casing: false, path: '#34373d', reliefOpacity: 0, ferry: '#4f8fc7',
    use: { commercial: '#2b2626', retail: '#2d2627', industrial: '#26272a', university: '#2b2922', college: '#2a2822', kindergarten: '#2a2822',
           stadium: '#1f3326', playground: '#1f3a29', recreation_ground: '#1f3a29', library: '#2a2822', military: '#28262a', bus_station: '#24272e', railway: '#25262a' },
    paint: {
      landuse_residential: { 'fill-opacity': 0 },
      park: { 'fill-color': '#1e3a29', 'fill-opacity': 1 },
      park_outline: { 'line-opacity': 0 },
      landcover_wood: { 'fill-color': '#1c3626', 'fill-opacity': 1 },
      landcover_grass: { 'fill-color': '#1f3a29', 'fill-opacity': 1 },
      landcover_sand: { 'fill-color': '#38331f' },
      landcover_wetland: { 'fill-opacity': 0.15 },
      landcover_ice: { 'fill-opacity': 0.1 },
      landuse_pitch: { 'fill-color': '#21402c' },
      landuse_track: { 'fill-opacity': 0.15 },
      landuse_cemetery: { 'fill-color': '#22302a' },
      landuse_school: { 'fill-color': '#2a2822', 'fill-opacity': 1 },
      landuse_hospital: { 'fill-color': '#302326', 'fill-opacity': 1 },
      aeroway_fill: { 'fill-color': '#25282e' },
      aeroway_runway: { 'line-color': '#3d4046' },
      aeroway_taxiway: { 'line-color': '#34373d' },
      road_area_pattern: { 'fill-opacity': 0.1 },
      water: { 'fill-color': '#12324c' },
      waterway_river: { 'line-color': '#173a57' },
      waterway_other: { 'line-color': '#173a57' },
      waterway_tunnel: { 'line-color': '#173a57' },
      building: { 'fill-color': '#2a2d33', 'fill-outline-color': '#33373e' },
      'building-3d': { 'fill-extrusion-color': '#3a3e46' },
      boundary_3: { 'line-color': '#3d4046' }
    }
  }
};

// Places of interest get a round coloured badge and a matching label colour, by kind — the way Google Maps
// lets you tell a clinic from a shop at a glance. `classes` are OpenMapTiles POI classes.
// Icon is stroke markup on a 24px grid (drawn white, scaled into the disc) or { raw } markup placed as is.
const SIGN_H = { raw: '<text x="12" y="16.9" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="13.5" fill="#fff">H</text>' };
const SIGN_MOSQUE = { raw: '<path d="M7.2 17.2v-3a4.8 4.8 0 019.6 0v3z" fill="#fff"/><path d="M12 6.4v2.2M6 17.6h12" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>' };
const POI_KINDS = [
  // name, badge colour, label colour, icon, classes, shape ('square' = white tile with a coloured sign, as for transit stops)
  ['food',    '#f29900', '#b45f06', ICONS.fork,   ['restaurant', 'cafe', 'fast_food', 'bar', 'beer', 'ice_cream', 'bakery', 'food_court']],
  ['shop',    '#4285f4', '#1a56c4', ICONS.bag,    ['shop', 'grocery', 'clothing_store', 'mall', 'butcher', 'alcohol_shop', 'laundry', 'hairdresser']],
  ['health',  '#ea4335', '#c5221f', SIGN_H,       ['hospital', 'pharmacy', 'doctors', 'dentist', 'veterinary']],
  ['stay',    '#ec5f9c', '#c2185b', ICONS.bed,    ['lodging']],
  ['learn',   '#6b7fa3', '#48597a', ICONS.cap,    ['school', 'college', 'library']],
  ['green',   '#34a853', '#188038', ICONS.tree,   ['park', 'garden', 'pitch', 'stadium', 'golf', 'zoo', 'playground', 'swimming', 'campsite']],
  ['bus',     '#1a73e8', '#1a56c4', ICONS.bus,    ['bus', 'ferry_terminal'], 'square'],
  ['rail',    '#1a73e8', '#1a56c4', ICONS.train,  ['railway', 'aerialway'], 'square'],
  ['worship', '#8a94a6', '#5b6472', SIGN_MOSQUE,  ['place_of_worship']],
  ['bank',    '#5c6bc0', '#3f4ea3', ICONS.bank,   ['bank']],
  ['fuel',    '#00a3bf', '#00798f', ICONS.fuel,   ['fuel']],
  ['civic',   '#5f6b7a', '#48525f', ICONS.shield, ['police', 'town_hall', 'post', 'fire_station']],
  ['sight',   '#12b5cb', '#0b8696', ICONS.star,   ['attraction', 'museum', 'castle', 'art_gallery', 'theatre', 'cinema', 'monument']],
  ['other',   '#8a94a6', '#5b6472', { raw: '<circle cx="12" cy="12" r="3.2" fill="#fff"/>' }, []]
];
const poiMatch = pick => ['match', ['get', 'class'],
  ...POI_KINDS.filter(k => k[4].length).flatMap(k => [k[4], pick(k)]), pick(POI_KINDS[POI_KINDS.length - 1])];

// Draws each badge once at double size so it stays crisp on phone screens.
let poiImagesPromise = null;
function poiImages() {
  return poiImagesPromise || (poiImagesPromise = Promise.all(POI_KINDS.map(async ([name, color, , icon, , shape]) => {
    const square = shape === 'square';
    const plate = square
      ? `<rect x="2.2" y="2.2" width="19.6" height="19.6" rx="5.5" fill="#fff" stroke="${color}" stroke-width="1.8"/>`
      : `<circle cx="12" cy="12" r="10.6" fill="${color}" stroke="#fff" stroke-width="1.6"/>`;
    const sign = icon.raw || `<g transform="translate(5.6 5.6) scale(.535)" fill="none" stroke="${square ? color : '#fff'}" ` +
      `stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${icon}</g>`;
    const img = new Image(48, 48);
    img.src = 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">${plate}${sign}</svg>`);
    await img.decode();
    return { name: 'poi-' + name, img };
  })));
}

// Map labels use the Latin-script name. MapLibre draws text one letter at a time, with no joining of
// conjuncts and no reordering of vowel signs, so Bangla names come out misspelt; a place with only a
// Bangla name keeps its icon and gets no label rather than a wrong one.
// The map lays every name out (so spacing and collisions are right) but draws it invisibly;
// drawMapLabels() then writes the name at each spot with the browser's own text engine. A place with no
// name in the chosen language shows its name in the other one rather than nothing.
const MAP_LABEL = LANG === 'en'
  ? ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name_en'], ['get', 'name:nonlatin'], ['get', 'name']]
  : ['coalesce', ['get', 'name:bn'], ['get', 'name:nonlatin'], ['get', 'name:latin'], ['get', 'name']];
// The tiles carry translations (name:bn, name:en) for countries, cities and many places, so the world map
// reads in one language — চীন, ভারত — instead of every country's own script. `name:nonlatin` is the local
// script, which is Bangla only inside Bangladesh, so it is used only when it really is Bangla.
const banglaOnly = s => (s && /[\u0980-\u09FF]/.test(s) ? s : '');
const labelText = p => LANG === 'en'
  ? p['name:en'] || p['name:latin'] || p.name_en || p['name:bn'] || p['name:nonlatin'] || p.name
  : p['name:bn'] || banglaOnly(p['name:nonlatin']) || banglaOnly(p.name) || p['name:en'] || p['name:latin'] || p.name;
const NAME_LAYERS = [];

function restyle(style, dark) {
  const P = dark ? PALETTES.dark : PALETTES.light;
  for (const l of style.layers) {
    const paint = l.paint || (l.paint = {}), layout = l.layout || (l.layout = {});

    if (l.id === 'background') paint['background-color'] = P.ground;
    if (l.type === 'raster') paint['raster-opacity'] = P.reliefOpacity;   // painted relief suits the light map only
    if (P.paint[l.id]) Object.assign(paint, P.paint[l.id]);

    // Buildings: flat footprints at every street zoom; the extruded ones only in the tilted view,
    // because seen from straight above they draw as ragged dark edges.
    if (l.id === 'building') { delete l.maxzoom; paint['fill-opacity'] = ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1]; }
    if (l.type === 'fill-extrusion') {
      layout.visibility = 'none';
      Object.assign(paint, { 'fill-extrusion-opacity': 0.95, 'fill-extrusion-vertical-gradient': true,
        // taller buildings a shade lighter, so a skyline reads in depth (as Apple Maps shades its towers)
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], ...(dark ? [0, '#33363d', 30, '#40444c', 90, '#4d525c'] : [0, '#e4dfd5', 30, '#eeeae3', 90, '#f7f5f1'])] });
    }

    if (l.type === 'line') {
      if (/^boundary(_2|_country)/.test(l.id)) Object.assign(paint, { 'line-color': P.border, 'line-opacity': 0.9, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 6, 1.1, 10, 1.6] });   // a quiet grey line, as Google draws borders
      else if (/path_pedestrian/.test(l.id)) { if (!l.id.endsWith('_casing')) paint['line-color'] = P.path; else paint['line-opacity'] = 0; }
      else if (/^(road|bridge|tunnel)_/.test(l.id) && !/rail|pattern/.test(l.id)) {
        const [, fill, edge] = P.roads.find(([re]) => re.test(l.id));
        if (l.id.endsWith('_casing')) { if (P.casing) paint['line-color'] = edge; else paint['line-opacity'] = 0; }
        else {
          paint['line-color'] = fill;
          if (l.id.startsWith('tunnel_')) paint['line-opacity'] = 0.55;
        }
      } else if (/rail/.test(l.id) && dark) paint['line-color'] = '#4a556c';
    }

    if (l.type === 'symbol') {
      // One correctly spelt name per label.
      const named = layout['text-field'] && JSON.stringify(layout['text-field']).includes('name');
      if (named) {
        layout['text-field'] = MAP_LABEL;
        paint['text-opacity'] = 0;
        NAME_LAYERS.push(l.id);
      }
      const text = /^highway-name/.test(l.id) ? P.roadLabel : /^water/.test(l.id) ? P.waterLabel : P.label;
      Object.assign(paint, { 'text-color': text, 'text-halo-color': P.halo, 'text-halo-width': 1.6 });
      // Street names as Google prints them: small, close together, on every lane long enough to hold one.
      // (A big name fits only the long roads, so most lanes of a neighbourhood went without.)
      if (/^highway-name/.test(l.id)) {
        Object.assign(layout, { 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, 11, 18, 13], 'symbol-spacing': 160, 'text-max-angle': 60, 'text-padding': 1 });
        if (l.id === 'highway-name-minor') l.minzoom = 14.5;
        if (l.id === 'highway-name-path') l.minzoom = 16;
      }
      // lakes and rivers named along the water from the neighbourhood zooms
      if (/^water_name/.test(l.id)) layout['text-size'] = ['interpolate', ['linear'], ['zoom'], 8, 11, 15, 13];
      // Places of interest: coloured badge, label beside it in the matching colour, free to switch sides.
      if (l['source-layer'] === 'poi') {
        if (l.id !== 'poi_transit') l.filter = ['all', l.filter, ['has', 'name']];
        if (l.id === 'poi_r1') l.minzoom = 14; else if (l.id === 'poi_r7') l.minzoom = 15; else if (l.id === 'poi_r20') l.minzoom = 16;
        delete layout['text-anchor'];
        delete layout['text-offset'];
        Object.assign(layout, { 'icon-image': poiMatch(k => 'poi-' + k[0]), 'icon-size': 1, 'text-size': 12, 'text-optional': true,
                                'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 1.05, 'text-justify': 'auto' });
        paint['text-color'] = poiMatch(k => dark ? k[1] : k[2]);
      }
    }
  }
}

// The style and the tile index come from OpenFreeMap; the index can take ten seconds. Keep the last copy of each
// on the device and use it at once, refreshing it in the background for next time.
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet', STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
async function cachedJson(url, key) {
  const refresh = fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(data => {
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* storage unavailable */ }
    return data;
  });
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch { /* fall through to the network */ }
  if (saved && Date.now() - saved.at < 24 * 3600 * 1000) { refresh.catch(() => {}); return saved.data; }
  // an old copy still beats no map when OpenFreeMap does not answer
  return saved ? refresh.catch(() => saved.data) : refresh;
}
const tileJson = () => cachedJson(TILEJSON_URL, 'bdmap.tilejson');
// Our own copy of Bangladesh's tiles on R2 (tools/build-tiles.mjs, same OpenMapTiles layers): used only when
// OpenFreeMap's tile index cannot be had at all, so the country's map still opens.
const BD_TILES = 'https://pub-d68dd5fec84b4bbfa461621fce349435.r2.dev/tiles/bd.pmtiles';
// Hill shading waits until the map is up: its elevation tiles come from AWS in the US and take two seconds or
// more each, and the map's first view should not wait for shading.
let pendingHills = null;

async function buildStyle() {
  const dark = isDark();
  const [style, tiles] = await Promise.all([
    cachedJson(STYLE_URL, 'bdmap.style'),
    tileJson().catch(() => null)
  ]);
  // Hand the map the tile index directly so it does not fetch it again.
  for (const src of Object.values(style.sources)) {
    if (src.url !== TILEJSON_URL) continue;
    if (tiles) { delete src.url; Object.assign(src, { tiles: tiles.tiles, minzoom: tiles.minzoom, maxzoom: tiles.maxzoom, attribution: tiles.attribution }); }
    else if (window.pmtiles) { if (!pmtilesOn) { maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile); pmtilesOn = true; } src.url = 'pmtiles://' + BD_TILES; src.attribution = '<a href="https://openmaptiles.org" target="_blank" rel="noopener">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>'; }
  }

  // Elevation: soft hill shading in every view, real relief when the map is tilted (separate source for each use).
  const dem = { type: 'raster-dem', tiles: [TERRAIN_TILES], tileSize: 256, encoding: 'terrarium', maxzoom: 13, attribution: 'Terrain: Mapzen, AWS' };
  style.sources.hills = dem;
  style.sources.relief = { ...dem };
  const hills = { id: 'hills', type: 'hillshade', source: 'hills',
                  paint: { 'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 7, dark ? 0.3 : 0.4, 13, 0.08], 'hillshade-shadow-color': dark ? '#000000' : '#4f6352',
                           'hillshade-highlight-color': dark ? '#3a3a3c' : '#ffffff', 'hillshade-accent-color': dark ? '#000000' : '#6f7f6a' } };
  delete style.sources.hills;
  pendingHills = { source: dem, layer: hills };

  // 3D buildings for styles that do not ship them (the dark one).
  const vector = Object.keys(style.sources).find(k => style.sources[k].type === 'vector');
  if (vector && !style.layers.some(l => l.type === 'fill-extrusion')) {
    style.layers.push({ id: 'building-3d', type: 'fill-extrusion', source: vector, 'source-layer': 'building', minzoom: 14,
                        paint: { 'fill-extrusion-color': dark ? '#2c2c2e' : '#e6e2da', 'fill-extrusion-opacity': 0.85,
                                 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
                                 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0] } });
  }
  // markets, campuses, stadiums and the like in their own soft colours; launch and ferry routes; house numbers
  if (vector) {
    const P = dark ? PALETTES.dark : PALETTES.light;
    const at = id => style.layers.findIndex(l => l.id === id);
    style.layers.splice(at('landuse_pitch'), 0, { id: 'landuse_more', type: 'fill', source: vector, 'source-layer': 'landuse', minzoom: 11,
      filter: ['match', ['get', 'class'], Object.keys(P.use), true, false],
      paint: { 'fill-color': ['match', ['get', 'class'], ...Object.entries(P.use).flat(), P.ground], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 13, 1] } });
    style.layers.splice(at('water') + 1, 0, { id: 'ferry', type: 'line', source: vector, 'source-layer': 'transportation', minzoom: 7,
      filter: ['==', ['get', 'class'], 'ferry'], layout: { 'line-join': 'round' },
      paint: { 'line-color': P.ferry, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 14, 2], 'line-dasharray': [2, 2], 'line-opacity': 0.85 } });
    style.layers.push({ id: 'housenumber', type: 'symbol', source: vector, 'source-layer': 'housenumber', minzoom: 17.5,
      layout: { 'text-field': ['get', 'housenumber'], 'text-font': ['Noto Sans Regular'], 'text-size': 10.5 },
      paint: { 'text-color': dark ? '#8b9099' : '#8a8172', 'text-halo-color': P.halo, 'text-halo-width': 1.2 } });
  }
  if (vector) addAdmin(style, vector, dark);
  NAME_LAYERS.length = 0;
  restyle(style, dark);
  return style;
}

// Bangladesh's buildings, from our own PMTiles file on R2 (tools/build-tiles.mjs), read a piece at a time.
// Added once the map is up, never in the first style: MapLibre's 'load' waits for every source in the style, so a
// slow or refused R2 (its public r2.dev address is rate-limited) would keep the whole map from opening.
const BD_BUILDINGS = 'https://pub-d68dd5fec84b4bbfa461621fce349435.r2.dev/tiles/buildings-bd.pmtiles';
let pmtilesOn = false;
function addBdBuildings() {
  if (!window.pmtiles || map.getSource('bdb')) return;          // no library: the base map's buildings stay
  if (!pmtilesOn) { maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile); pmtilesOn = true; }
  const layers = map.getStyle().layers, flat = layers.find(l => l.id === 'building'), tall = layers.find(l => l.id === 'building-3d');
  if (!flat || !tall) return;
  map.addSource('bdb', { type: 'vector', url: 'pmtiles://' + BD_BUILDINGS, attribution: '<a href="https://overturemaps.org" target="_blank" rel="noopener">Overture Maps</a> buildings' });
  const copy = (l, id) => ({ ...JSON.parse(JSON.stringify(l)), id, source: 'bdb', 'source-layer': 'building', minzoom: 13, layout: { ...(l.layout || {}), visibility: 'none' } });
  const f = copy(flat, 'bd-building'), t = copy(tall, 'bd-building-3d');
  delete f.maxzoom; delete t.maxzoom;
  const h = ['coalesce', ['get', 'height'], 5];                     // most footprints carry no height: a low house
  Object.assign(t.paint, { 'fill-extrusion-height': h, 'fill-extrusion-base': 0 });
  const colour = t.paint['fill-extrusion-color'];
  if (Array.isArray(colour) && colour[0] === 'interpolate') colour[2] = h;
  const after = l => (layers[layers.indexOf(l) + 1] || {}).id;
  map.addLayer(f, after(flat));
  map.addLayer(t, after(tall));
  buildingsHere = '';                                               // decide again which set shows here
  standBuildings();
}

// ---- Divisions and districts, as Google Maps shows them ----
// Borders from the tiles (OSM admin levels: 4 division, 5 district, 6 upazila), each drawn in its own weight;
// names from the app's list of 64 districts — a division's name at the middle of its districts, a district's at
// its town — so the map reads ঢাকা বিভাগ from afar and গাজীপুর, নরসিংদী as you come closer.
function addAdmin(style, vector, dark) {
  const base = style.layers.find(l => l.id === 'boundary_3');
  if (base) {
    const at = style.layers.indexOf(base), line = dark ? '#6b7280' : '#9aa1ad';
    const border = (id, level, minzoom, width, dash, opacity) => ({ id, type: 'line', source: vector, 'source-layer': 'boundary', minzoom,
      filter: ['all', ['==', ['get', 'admin_level'], level], ['!=', ['get', 'maritime'], 1]], layout: { 'line-join': 'round' },
      paint: { 'line-color': line, 'line-width': width, 'line-opacity': opacity, ...(dash ? { 'line-dasharray': dash } : {}) } });
    style.layers.splice(at, 1,
      border('admin_6', 6, 9.5, ['interpolate', ['linear'], ['zoom'], 9.5, 0.5, 14, 1], [1, 2], 0.5),
      border('admin_5', 5, 6.5, ['interpolate', ['linear'], ['zoom'], 6.5, 0.6, 12, 1.4], [3, 2], 0.8),
      border('admin_4', 4, 4.5, ['interpolate', ['linear'], ['zoom'], 4.5, 0.8, 10, 2], null, 0.9));
  }
  if (typeof DISTRICTS === 'undefined') return;
  const features = [];
  const point = (lon, lat, props) => features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props });
  const divisions = [...new Set(DISTRICTS.map(d => d.division))];
  for (const div of divisions) {
    const ds = DISTRICTS.filter(d => d.division === div);
    const en = (DISTRICTS.find(d => d.bn === div) || {}).en || div;
    point(ds.reduce((a, d) => a + d.lon, 0) / ds.length, ds.reduce((a, d) => a + d.lat, 0) / ds.length,
      { kind: 'div', name: en + ' Division', 'name:bn': div + ' বিভাগ', 'name:en': en + ' Division' });
  }
  for (const d of DISTRICTS) point(d.lon, d.lat, { kind: 'dist', name: d.en, 'name:bn': d.bn, 'name:en': d.en });
  style.sources.admin = { type: 'geojson', data: { type: 'FeatureCollection', features } };
  const label = (id, kind, minzoom, maxzoom, size) => ({ id, type: 'symbol', source: 'admin', minzoom, maxzoom, filter: ['==', ['get', 'kind'], kind],
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': size, 'text-letter-spacing': 0.08, 'text-max-width': 8, 'text-padding': 6 },
    paint: { 'text-opacity': 0 } });
  // the tiles' own division names (faint "state" labels) would print each division twice
  const states = style.layers.find(l => l.id === 'label_state');
  if (states) {
    const has = (word, key) => ['in', word, ['coalesce', ['get', key], '']];
    states.filter = ['all', states.filter, ['!', ['any', has('বিভাগ', 'name:bn'), has('বিভাগ', 'name'), has('Division', 'name:en'), has('Division', 'name')]]];
  }
  // on top of the list, so the map places them before villages and shops
  style.layers.push(label('admin-dist', 'dist', 7, 10.5, 12), label('admin-div', 'div', 5, 7.6, 14));
}

// ---- Standard, satellite and hybrid, as Apple and Google offer them ----
// Imagery: Esri World Imagery (Esri, Vantor, Earthstar Geographics), through ArcGIS Location Platform with our key
// (from the server, /api/map-config) so the use counts against our free allowance; without a key, the public copy.
const SAT_PUBLIC = 'esri://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
let SAT_TILES = SAT_PUBLIC;
// The key is tried on one tile first: a wrong or expired key would turn every photo into an error, so then the
// public copy is used instead.
const satKey = fetch('api/map-config').then(r => r.json()).then(async j => {
  if (!j.esriKey) return;
  const keyed = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=' + encodeURIComponent(j.esriKey);
  const test = await fetch(keyed.replace('{z}', '6').replace('{y}', '27').replace('{x}', '48'));
  if (test.ok && (test.headers.get('content-type') || '').startsWith('image')) SAT_TILES = keyed.replace('https://', 'esri://');
  else console.warn('imagery key refused; using the public imagery');
}).catch(() => {});
let esriOn = false;
const satShallow = new Map();
// Where Esri's photos stop early (a village at 18, not 19), allow one step past the last real photo, no more —
// Apple's Maps stops zooming there too, rather than show a smear.
function satZoomLimit() {
  if (mapMode === 'standard') return;
  const c = map.getCenter(), z = Math.floor(map.getZoom()), n = 2 ** z;
  const x = Math.floor((c.lng + 180) / 360 * n), y = Math.floor((1 - Math.log(Math.tan(c.lat * Math.PI / 180) + 1 / Math.cos(c.lat * Math.PI / 180)) / Math.PI) / 2 * n);
  const real = satShallow.get(z + '/' + y + '/' + x);
  map.setMaxZoom(real != null ? Math.min(19, real + 1) : 19);
}
// A tile Esri has no photo for is drawn from its parent: the parent's quarter, enlarged (up to three levels up).
async function esriTile(url, signal, depth = 0) {
  const r = await fetch(url, { signal });
  const data = await r.arrayBuffer();
  if (r.ok && data.byteLength !== 2521) return data;
  const m = /\/tile\/(\d+)\/(\d+)\/(\d+)/.exec(url);
  if (!m || depth >= 3 || +m[1] <= 10 || typeof OffscreenCanvas === 'undefined') throw new Error('no imagery here');
  const [z, y, x] = [+m[1], +m[2], +m[3]];
  satShallow.set(z + '/' + y + '/' + x, z - 1 - depth);           // the deepest real photo here is at least one up
  const parent = await esriTile(url.replace(m[0], '/tile/' + (z - 1) + '/' + (y >> 1) + '/' + (x >> 1)), signal, depth + 1);
  const img = await createImageBitmap(new Blob([parent]));
  const c = new OffscreenCanvas(256, 256), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, (x & 1) * img.width / 2, (y & 1) * img.height / 2, img.width / 2, img.height / 2, 0, 0, 256, 256);
  return (await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })).arrayBuffer();
}
let mapMode = (() => { try { return localStorage.getItem('bdmap.mapmode') || 'hybrid'; } catch { return 'standard'; } })();
const OUR_LAYERS = /^(route|bus|stops|places2|sat)/;
async function setMapMode(mode) {
  mapMode = mode;
  try { localStorage.setItem('bdmap.mapmode', mode); } catch { /* storage off */ }
  if (!map || !map.getStyle()) return;
  if (mode !== 'standard') await satKey;
  if (!map.getSource('sat')) {
    // Past its last zoom Esri answers with a grey 'Map data not yet available' picture (always the same 2,521
    // bytes) instead of an error. Treat it as missing, so the map stretches the last real photo, as Apple does.
    if (!esriOn) { maplibregl.addProtocol('esri', (req, abort) => esriTile(req.url.replace('esri://', 'https://'), abort.signal).then(data => ({ data }))); esriOn = true; }
    map.addSource('sat', { type: 'raster', tiles: [SAT_TILES], tileSize: 256, maxzoom: 19, attribution: 'Imagery: Esri, Vantor, Earthstar Geographics' });
    map.addLayer({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 200 } }, (map.getStyle().layers[1] || {}).id);
  }
  const sat = mode !== 'standard';
  map.setMaxZoom(sat ? 19 : 22);
  if (sat && !map._satLimit) { map.on('idle', satZoomLimit); map._satLimit = true; }                                  // Esri's photos stop at 19 here; Apple stops there too
  for (const l of map.getStyle().layers) {
    if (l.id === 'sat') { map.setLayoutProperty('sat', 'visibility', sat ? 'visible' : 'none'); continue; }
    if (l.id === 'places2') { map.setLayoutProperty(l.id, 'visibility', mode === 'satellite' ? 'none' : 'visible'); continue; }   // photo only, as Apple's
    if (OUR_LAYERS.test(l.id) || l['source-layer'] === 'building') continue;     // buildings: standBuildings decides
    const keep = mode === 'standard' || (mode === 'hybrid' && (l.type === 'symbol' || (l.type === 'line' && /^(road|bridge|tunnel|admin|boundary)/.test(l.id) && !/casing/.test(l.id))));
    if (l.type === 'background') { map.setPaintProperty(l.id, 'background-opacity', sat ? 0 : 1); continue; }
    map.setLayoutProperty(l.id, 'visibility', keep ? 'visible' : 'none');
    if (l.type === 'line' && /^(road|bridge|tunnel)/.test(l.id)) map.setPaintProperty(l.id, 'line-opacity', mode === 'hybrid' ? 0.55 : (l.id.startsWith('tunnel_') ? 0.55 : 1));
  }
  if (bnLabels.box) { bnLabels.box.classList.toggle('on-sat', mode === 'hybrid'); bnLabels.box.hidden = mode === 'satellite'; }
  buildingsHere = ''; standBuildings();
  for (const b of document.querySelectorAll('.mm-card')) b.classList.toggle('on', b.dataset.mode === mode);
}

// The chooser: three cards, like Apple's "Choose Map", and the 3D switch. The pictures are real tiles of Dhaka.
(function mapModeChooser() {
  const btn = document.getElementById('tool-layers');
  if (!btn) return;
  const sheet = el('div', 'mm-sheet'); sheet.hidden = true;
  const card = el('div', 'mm-panel');
  const head = el('div', 'mm-head'); head.append(el('b', null, 'ম্যাপের ধরন'));
  const x = el('button', 'mm-x'); x.innerHTML = svg('close'); x.setAttribute('aria-label', 'বন্ধ করুন'); head.appendChild(x);
  const sat = SAT_TILES.replace('esri://', 'https://').replace('{z}', '15').replace('{y}', '14159').replace('{x}', '24613');
  const cards = el('div', 'mm-cards');
  for (const [mode, label] of [['standard', 'সাধারণ'], ['hybrid', 'হাইব্রিড'], ['satellite', 'স্যাটেলাইট']]) {
    const c = el('button', 'mm-card ' + mode); c.dataset.mode = mode;
    const pic = el('span', 'mm-pic'); if (mode !== 'standard') pic.style.backgroundImage = `url("${sat}")`;
    c.append(pic, el('span', 'mm-name', label));
    c.addEventListener('click', () => { setMapMode(mode); });
    cards.appendChild(c);
  }
  const row = el('label', 'mm-row');
  const cb = Object.assign(el('input'), { type: 'checkbox' });
  cb.addEventListener('change', () => { if (map) set3D(cb.checked); });
  row.append(el('span', null, '৩D ভবন ও পাহাড়'), cb);
  card.append(head, cards, row);
  sheet.appendChild(card);
  document.getElementById('page-trip').appendChild(sheet);
  const open = () => { cb.checked = is3D; for (const b of cards.children) b.classList.toggle('on', b.dataset.mode === mapMode); sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('in')); };
  const close = () => { sheet.classList.remove('in'); setTimeout(() => { sheet.hidden = true; }, 220); };
  btn.addEventListener('click', () => (sheet.hidden ? open() : close()));
  x.addEventListener('click', close);
  sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
})();

// ---- Names on the map ----
// Each label is a small HTML element pinned to a map position, so Bangla conjuncts and vowel signs are
// shaped properly (the map engine cannot do that). Which places get a label is decided by the map (the invisible labels above); this only
// redraws the text. Positions follow the map while it moves; the set is rebuilt whenever it comes to rest.
const bnLabels = { box: null, items: [], nodes: new Map(), prev: new Map() };
const LABEL_STYLE = [
  [/^admin-div/, 'division'], [/^admin-dist/, 'district'], [/^label_country/, 'country'], [/^label_city/, 'city'], [/^label_town/, 'town'], [/^label_state/, 'state'],
  [/^label_/, 'village'], [/^highway-name/, 'road'], [/^water/, 'water'], [/./, 'poi']
];
function placeBanglaLabels() {
  for (const it of bnLabels.items) {
    const a = map.project(it.at);
    let turn = '';
    if (it.next) {
      const b = map.project(it.next);
      let deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      if (deg > 90) deg -= 180; else if (deg < -90) deg += 180;      // never upside down
      turn = ` rotate(${deg.toFixed(1)}deg)`;
    }
    it.node.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px)${turn} translate(${it.shift})`;
  }
}
function drawBanglaLabels() {
  const { width, height } = map.getCanvas().getBoundingClientRect();
  const onScreen = p => p.x > 0 && p.y > 0 && p.x < width && p.y < height;
  const dark = isDark(), seen = new Set(), roads = [], items = [];
  for (const f of map.queryRenderedFeatures({ layers: NAME_LAYERS })) {
    const text = labelText(f.properties);
    if (!text) continue;
    const kind = LABEL_STYLE.find(([re]) => re.test(f.layer.id))[1];
    const item = { text, kind, shift: '-50%, -50%' };
    if (f.geometry.type === 'Point') {
      item.at = f.geometry.coordinates;
      const p = map.project(item.at);
      const key = text + '|' + Math.round(p.x / 8) + '|' + Math.round(p.y / 8);
      if (!onScreen(p) || seen.has(key)) continue;
      seen.add(key);
      if (kind === 'poi') {
        const k = POI_KINDS.find(k => k[4].includes(f.properties.class)) || POI_KINDS[POI_KINDS.length - 1];
        item.color = dark ? k[1] : k[2];
        item.shift = '15px, -50%';                 // beside the badge, not on top of it
      }
    } else {
      // A road or river name: use the stretch of the line that is on screen, at its middle, turned to follow it.
      const raw = f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates[0];
      // a lane is often two or three points, one of them off screen: walk it in small steps so its name still finds room
      const line = [];
      raw.forEach((c, i) => { if (i) for (let k = 1; k < 8; k++) line.push([raw[i - 1][0] + (c[0] - raw[i - 1][0]) * k / 8, raw[i - 1][1] + (c[1] - raw[i - 1][1]) * k / 8]); line.push(c); });
      const visible = line.map((c, i) => i).filter(i => onScreen(map.project(line[i])));
      if (visible.length < 2) continue;
      // keep the spot the name already had while it is still on this line and on screen — a name that slides
      // along its road every time the map stops reads as jumping
      const had = bnLabels.prev.get('road|' + text);
      let mid = visible[Math.floor(visible.length / 2)];
      if (had) { const near = visible.find(i => Math.abs(line[i][0] - had.at[0]) < 1e-7 && Math.abs(line[i][1] - had.at[1]) < 1e-7); if (near != null) mid = near; }
      const p = map.project(line[mid]);
      if (roads.some(r => r.text === text && Math.hypot(r.x - p.x, r.y - p.y) < 200)) continue;   // one name per stretch
      roads.push({ text, x: p.x, y: p.y });
      item.at = line[mid];
      item.next = line[mid + 1] || line[mid - 1];
    }
    items.push(item);
    if (items.length >= 260) break;
  }
  const keyOf = it => it.next ? 'road|' + it.text : it.kind + '|' + it.text + '|' + it.at[0].toFixed(4) + '|' + it.at[1].toFixed(4);
  const old = bnLabels.nodes, nodes = new Map(), prev = new Map();
  for (const it of items) {
    const key = keyOf(it);
    if (nodes.has(key)) continue;
    let node = old.get(key);
    if (node) { old.delete(key); node.classList.remove('fresh'); }
    else { node = el('span', 'k-' + it.kind + ' fresh', it.text); if (it.color) node.style.color = it.color; bnLabels.box.appendChild(node); }
    it.node = node; it.wasShown = node.style.visibility !== 'hidden' && !node.classList.contains('fresh');
    nodes.set(key, node);
    if (it.next) prev.set(key, it);
  }
  for (const node of old.values()) node.remove();
  bnLabels.nodes = nodes; bnLabels.prev = prev;
  bnLabels.items = items.filter(it => it.node && nodes.get(keyOf(it)) === it.node);
  placeBanglaLabels();

  // The map spaced these names for its own invisible text; ours can be wider. Keep the important ones
  // (places, then roads and water, then shops) and hide any name that would print over one already kept.
  const rank = { country: 0, division: 0.5, city: 1, district: 1.5, town: 2, state: 3, village: 4, road: 5, water: 6, poi: 7 };
  const kept = [];
  for (const it of [...bnLabels.items].sort((a, b) => rank[a.kind] - rank[b.kind] || b.wasShown - a.wasShown)) {
    const r = it.node.getBoundingClientRect();
    const clash = kept.some(k => r.left < k.right + 4 && r.right > k.left - 4 && r.top < k.bottom + 2 && r.bottom > k.top - 2);
    it.node.style.visibility = clash ? 'hidden' : '';
    if (!clash) kept.push(r);
  }
}
function initBanglaLabels() {
  if (bnLabels.box) return;
  bnLabels.box = el('div', 'bn-labels');
  map.getCanvasContainer().appendChild(bnLabels.box);
  map.on('move', placeBanglaLabels);
  map.on('idle', drawBanglaLabels);
  drawBanglaLabels();
}

// Room to leave around fitted shapes so the floating cards do not cover them.
function mapPadding() {
  // On wide screens the results sheet fills the left side; without it only the small search card is there.
  return innerWidth > 760
    ? { top: 40, bottom: 40, left: $('sheet').hidden ? 40 : 430, right: 70 }
    : { top: $('trip-search').offsetHeight + 34, bottom: $('sheet').offsetHeight + 24, left: 24, right: 24 };
}

// Built once and shared; started early from the bottom of this file so the map opens faster.
let stylePromise = null;
const getMapStyle = () => stylePromise || (stylePromise = buildStyle().catch(e => { stylePromise = null; throw e; }));

async function createMap() {
  const [style, badges] = await Promise.all([getMapStyle(), poiImages()]);
  const dark = isDark();
  map = new maplibregl.Map({ container: 'map', style, bounds: BD_LNGLAT, fitBoundsOptions: { padding: mapPadding() },
                             minZoom: 1.6, maxPitch: 70, attributionControl: { compact: true } });
  // Badges are registered as soon as the style is in, before the first tiles ask for them.
  map.once('styledata', () => { for (const b of badges) if (!map.hasImage(b.name)) map.addImage(b.name, b.img, { pixelRatio: 2 }); });
  // The "loading" note goes as soon as the first frame is drawn; tiles then fill in as they come, as in Google Maps.
  map.once('render', () => { $('map-loading').hidden = true; });
  await new Promise(resolve => map.once('load', resolve));
  $('map-loading').hidden = true;
  if (pendingHills && !map.getSource('hills')) {
    map.addSource('hills', pendingHills.source);
    const before = map.getStyle().layers.find(l => l.id.startsWith('waterway') || l.id === 'water');
    map.addLayer(pendingHills.layer, before && before.id);
  }
  initBanglaLabels();
  map.on('pitch', standBuildings);
  map.on('moveend', standBuildings);
  standBuildings();
  try { addBdBuildings(); } catch (e) { console.warn('buildings', e); }
  if (mapMode !== 'standard') setMapMode(mapMode);
  map.setLight({ anchor: 'viewport', color: '#ffffff', intensity: dark ? 0.28 : 0.4, position: [1.3, 200, 40] });   // a soft sun from the upper left
  // Start with the credits folded into their (i) button; they open on tap.
  const credits = document.querySelector('.maplibregl-ctrl-attrib');
  if (credits) { credits.classList.remove('maplibregl-compact-show'); credits.removeAttribute('open'); }

  // Our own layers. Lines go under the map's labels so place names stay readable on top of a route.
  const firstLabel = (map.getStyle().layers.find(l => l.type === 'symbol') || {}).id;
  const round = { 'line-cap': 'round', 'line-join': 'round' };
  for (const id of ['route', 'bus', 'stops']) map.addSource(id, { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: round, paint: { 'line-color': dark ? '#0b0f14' : '#ffffff', 'line-width': 10 } }, firstLabel);
  map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: round, paint: { 'line-color': dark ? '#6ea8ff' : '#2563eb', 'line-width': 6 } }, firstLabel);
  map.addLayer({ id: 'bus-casing', type: 'line', source: 'bus', layout: round, paint: { 'line-color': dark ? '#0b0f14' : '#ffffff', 'line-width': 10 } }, firstLabel);
  map.addLayer({ id: 'bus-line', type: 'line', source: 'bus', layout: round, paint: { 'line-color': ['get', 'color'], 'line-width': 6 } }, firstLabel);
  map.addLayer({ id: 'stops', type: 'circle', source: 'stops',
                 paint: { 'circle-radius': 5.5, 'circle-color': '#ffffff', 'circle-stroke-width': 3, 'circle-stroke-color': ['get', 'color'] } });

  // More places — Overture's shops, schools, clinics and mosques, which OpenStreetMap often lacks here. The server
  // keeps them in 0.02° cells; the cells on screen are fetched once each. They sit under OpenStreetMap's own badges,
  // so where both know a place the map's collision rule keeps one badge.
  map.addSource('places2', { type: 'geojson', data: EMPTY, attribution: '<a href="https://overturemaps.org" target="_blank" rel="noopener">Overture Maps</a>' });
  const firstPoi = (map.getStyle().layers.find(l => l['source-layer'] === 'poi') || {}).id;
  map.addLayer({ id: 'places2', type: 'symbol', source: 'places2', minzoom: 15.5,
                 layout: { 'icon-image': ['concat', 'poi-', ['get', 'kind']], 'icon-size': 1, 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
                           'text-optional': true, 'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 1.05, 'text-justify': 'auto' },
                 paint: { 'text-opacity': 0 } }, firstPoi);
  NAME_LAYERS.push('places2');
  const cells = new Map(), CELL = 50;
  const classOf = kind => ((POI_KINDS.find(k => k[0] === kind) || [])[4] || [])[0] || '';
  async function morePlaces() {
    if (map.getZoom() < 15.5) return;
    const b = map.getBounds(), c = map.getCenter(), all = [];
    for (let y = Math.floor(b.getSouth() * CELL); y <= Math.floor(b.getNorth() * CELL); y++)
      for (let x = Math.floor(b.getWest() * CELL); x <= Math.floor(b.getEast() * CELL); x++) all.push([y, x, Math.hypot(y + 0.5 - c.lat * CELL, x + 0.5 - c.lng * CELL)]);
    // a tilted view reaches to the horizon; the cells nearest the middle are the ones close enough to read
    const keys = all.sort((p, q) => p[2] - q[2]).slice(0, 20).map(([y, x]) => y + ':' + x);
    await Promise.all(keys.filter(k => !cells.has(k)).map(k => { cells.set(k, []); return fetch('api/pois?c=' + k).then(r => r.json()).then(j => cells.set(k, j.p || [])).catch(() => cells.delete(k)); }));
    const features = [];
    const close = map.getZoom() >= 17.5;                           // offices and services only once the street is close
    for (const k of keys) for (const [lat, lon, kind, name, bn, cat] of cells.get(k) || []) if (close || kind !== 'other')
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { kind, name, 'name:latin': name, ...(bn ? { 'name:bn': bn } : {}), class: classOf(kind), cat } });
    const src = map.getSource('places2');
    if (src) src.setData({ type: 'FeatureCollection', features });
  }
  map.on('moveend', morePlaces);

  // Live location: a blue dot with an accuracy ring that follows the device. MapLibre's own control does the
  // tracking; its button is hidden because ours (in .map-tools) triggers it.
  const geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true,
                                                showUserHeading: true, showAccuracyCircle: true, fitBoundsOptions: { maxZoom: 16 } });
  map.addControl(geo, 'bottom-right');
  document.querySelector('.maplibregl-ctrl-geolocate').parentElement.style.display = 'none';
  geo.on('trackuserlocationstart', () => $('tool-me').classList.add('on'));
  geo.on('trackuserlocationend', () => $('tool-me').classList.remove('on'));
  // GPS refused or unavailable: fall back to the rough area the internet connection is in (city level), so
  // the map still opens near the person. It is labelled as approximate.
  async function approxLocate(quiet) {
    try {
      const r = await (await fetch('https://ipapi.co/json/')).json();
      if (!(r.latitude > 20 && r.latitude < 27 && r.longitude > 88 && r.longitude < 93)) throw new Error('outside');
      map.flyTo({ center: [r.longitude, r.latitude], zoom: 12, duration: 1400 });
      if (!quiet) setStatus(`জিপিএস পাওয়া যায়নি — ইন্টারনেট সংযোগ থেকে আনুমানিক এলাকা দেখানো হচ্ছে${r.city ? ' (' + r.city + ')' : ''}। সঠিক লোকেশনের জন্য ব্রাউজারে লোকেশনের অনুমতি দিন।`);
    } catch { if (!quiet) setStatus('লোকেশন পাওয়া যায়নি — ব্রাউজারে লোকেশনের অনুমতি দিন।'); }
  }
  geo.on('error', () => { $('tool-me').classList.remove('on'); const quiet = quietLocate; quietLocate = false; approxLocate(quiet); });
  $('tool-me').addEventListener('click', () => { setStatus(''); geo.trigger(); });
  locateMe = () => { quietLocate = true; geo.trigger(); };       // on opening: no complaint if location is refused
  geo.on('geolocate', () => { quietLocate = false; });

  // Stop names: on hover with a mouse, on tap with a finger.
  stopPopup = new maplibregl.Popup({ closeButton: false, offset: 12, className: 'stop-popup' });
  const showStop = e => stopPopup.setLngLat(e.features[0].geometry.coordinates).setText(e.features[0].properties.name).addTo(map);
  map.on('mouseenter', 'stops', e => { map.getCanvas().style.cursor = 'pointer'; showStop(e); });
  map.on('mouseleave', 'stops', () => { map.getCanvas().style.cursor = ''; stopPopup.remove(); });
  map.on('click', 'stops', showStop);

  // A tap on the map fills whichever end of the trip is still empty.
  map.on('click', async e => {
    if (map.queryRenderedFeatures(e.point, { layers: ['stops'] }).length) return;
    const which = !trip.from ? 'from' : !trip.to ? 'to' : null;
    if (!which) return;
    const { lat, lng } = e.lngLat;
    if (!inBangladesh(lat, lng)) { setStatus('বাংলাদেশের ভেতরে বেছে নিন।'); return; }
    const place = { lat, lon: lng, label: 'ম্যাপে বাছাই করা জায়গা' };
    setPlace(which, place);
    const name = await reverseName(lat, lng);
    if (name && trip[which] === place) { place.label = name; for (const s of searches) s.sync(); }
  });
}

function ensureMap() {
  if (mapReady) { if (map) map.resize(); return mapReady; }
  mapReady = createMap().catch(() => {
    mapReady = null;
    $('map-loading').textContent = 'ম্যাপ লোড করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।';
    throw new Error('map failed');
  });
  return mapReady;
}

// `points` are [lon, lat] pairs.
function fit(points, animate = true) {
  const b = points.reduce((box, p) => box.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
  map.fitBounds(b, { padding: mapPadding(), animate, duration: 900, maxZoom: 16, pitch: is3D ? 60 : 0 });
}

function drawMarkers() {
  for (const w of ['from', 'to']) {
    if (markers[w]) { markers[w].remove(); markers[w] = null; }
    if (!trip[w]) continue;
    markers[w] = new maplibregl.Marker({ element: el('div', 'pin ' + (w === 'from' ? 'a' : 'b')) })
      .setLngLat([trip[w].lon, trip[w].lat]).addTo(map);
  }
}

// Puts lines ({ coords, color }) into a source, growing them from their start as if a pen traces them.
function drawLines(source, lines) {
  const token = drawTokens[source] = (drawTokens[source] || 0) + 1;
  const data = part => ({ type: 'FeatureCollection', features: lines.map(l => ({
    type: 'Feature', properties: { color: l.color || '' },
    geometry: { type: 'LineString', coordinates: l.coords.slice(0, Math.max(2, Math.ceil(l.coords.length * part))) } })) });
  const src = map.getSource(source);
  if (!src) return;                               // the map is still loading; there is nothing drawn to change
  if (!lines.length) { src.setData(EMPTY); return; }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { src.setData(data(1)); return; }
  const start = performance.now();
  const step = now => {
    if (token !== drawTokens[source]) return;      // a newer drawing replaced this one
    const p = Math.min(1, (now - start) / 1000);
    src.setData(data(1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function clearBus() {
  drawLines('bus', []);
  if (map.getSource('stops')) map.getSource('stops').setData(EMPTY);
  if (stopPopup) stopPopup.remove();
}

// Draws one or two stop-to-stop paths (bus legs, or a train's stations) with a dot at every stop.
// Each path is a list of { lat, lon, name }.
function showPathOnMap(paths) {
  const colors = ['#0a8f62', '#6b4de6'];
  const lines = paths.map((pts, n) => ({ color: colors[n % 2], coords: pts.map(p => [p.lon, p.lat]) }));
  fit(lines.flatMap(l => l.coords));
  drawLines('bus', lines);
  map.getSource('stops').setData({ type: 'FeatureCollection', features: paths.flatMap((pts, n) => pts.map(p => ({
    type: 'Feature', properties: { name: p.name, color: colors[n % 2] },
    geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }))) });
}
const showBusOnMap = segs => showPathOnMap(segs.map(seg => seg.map(id => ({ lat: STOPS[id].lat, lon: STOPS[id].lon, name: STOPS[id].bn }))));

// Tilted view with real relief and 3D buildings, or flat and north-up.
function set3D(on) {
  is3D = on;
  $('tool-3d').classList.toggle('on', on);
  map.setTerrain(on ? { source: 'relief', exaggeration: 1.4 } : null);
  buildingsUp = !on; standBuildings();
  map.easeTo({ pitch: on ? 60 : 0, bearing: on ? -18 : 0, duration: 900 });
}
$('tool-3d').addEventListener('click', () => { if (map) set3D(!is3D); });
// Buildings: inside Bangladesh our own tiles (Overture's footprints, 3.9 crore of them, OSM's among them) take over
// from the base map's, which has only what OSM mappers drew; outside, the base map's as before. Flat footprints
// show at street zooms; the extruded ones stand up when the map is tilted (or 3D is on).
let buildingsUp = false, buildingsHere = '';
// The border itself (data/bd-outline.js), not the box around it — Kolkata and Agartala sit inside the box.
const insideBorder = (x, y) => typeof BD_OUTLINE === 'undefined' ? inBangladesh(y, x) : BD_OUTLINE.some(r => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c;
});
function standBuildings() {
  const up = is3D || map.getPitch() > 12, c = map.getCenter(), onSat = mapMode !== 'standard';
  const here = map.getLayer('bd-building') && insideBorder(c.lng, c.lat) ? 'bd' : 'base';
  if (up === buildingsUp && here === buildingsHere) return;
  buildingsUp = up; buildingsHere = here;
  for (const l of map.getStyle().layers) {
    if (l['source-layer'] !== 'building') continue;
    const ours = l.id.startsWith('bd-'), mine = (here === 'bd') === ours;
    map.setLayoutProperty(l.id, 'visibility', mine && !onSat && (l.type !== 'fill-extrusion' || up) ? 'visible' : 'none');
  }
}
$('tool-home').addEventListener('click', () => { if (map) fit(BD_LNGLAT); });
$('tool-in').addEventListener('click', () => { if (map) map.zoomIn(); });
$('tool-out').addEventListener('click', () => { if (map) map.zoomOut(); });

function renderBusPane(km) {
  const pane = $('pane-bus');
  pane.replaceChildren();
  const trips = localTrips(trip.from, trip.to);
  const rule = busRule(trip.from, trip.to);
  if (trips.length) {
    pane.appendChild(el('div', 'label', `যে বাসে যেতে পারেন · ${perKmText(rule.perKm)}`));
    const list = el('div');
    for (const t of trips.slice(0, 6)) {
      const first = t.legs[0], last = t.legs[t.legs.length - 1];
      const card = item('bus', t.legs.map(l => l.r.bn).join(' → '), `${STOPS[first.seg[0]].bn} থেকে উঠুন · প্রায় ${fmtMin(t.min)}`, taka(t.fare), node => {
        selectOnly(node);
        showBusOnMap(t.legs.map(l => l.seg));
      });
      if (t.legs.length > 1) card.querySelector('.t').appendChild(el('span', 'badge v', `${STOPS[last.seg[0]].bn}-এ বাস বদল`));
      else if (fareIsConfirmed(first.seg[0], first.seg[first.seg.length - 1])) card.querySelector('.t').appendChild(el('span', 'badge g', 'যাচাই করা ভাড়া'));
      list.appendChild(card);
    }
    stagger(list);
    pane.appendChild(list);
    const direct = trips.find(t => t.legs.length === 1);
    if (direct) {
      const seg = direct.legs[0].seg;
      const fix = el('button', 'text-btn');
      fix.innerHTML = svg('edit');
      fix.appendChild(document.createTextNode('ভাড়া ঠিক নয়? আসল ভাড়া জানান'));
      fix.addEventListener('click', () => askFare(seg[0], seg[seg.length - 1], km));
      pane.appendChild(fix);
    }
    return;
  }

  const a = nearestDistrict(trip.from), b = nearestDistrict(trip.to);
  if (rule !== FARES.bus.intercity || a === b) {
    pane.appendChild(item('bus', 'বাস ভাড়া · আনুমানিক', perKmText(rule.perKm), taka(busFare(rule, km))));
    if (rule !== FARES.bus.intercity) pane.appendChild(el('div', 'empty', 'এই পথের বাসের নাম এখনো আমাদের কাছে নেই।'));
    return;
  }
  pane.appendChild(fareTiles(rule, km, officialFare(a, b)));
  const counter = counterFare(a, b);
  if (counter) pane.appendChild(counter);
  pane.append(el('div', 'label', `${a.bn} – ${b.bn} রুটের বাস`), operatorChips(a, b));
}

// A small form: the fare someone really paid between two stops. It is saved on the server and, from then
// on, shown to everyone in place of the calculated fare.
function askFare(a, b, km) {
  const input = el('input');
  Object.assign(input, { type: 'number', min: 5, max: 2000, step: 5, inputMode: 'numeric', placeholder: '৳' });
  const field = el('label', 'money');
  field.append(el('span', null, 'আপনি কত ভাড়া দিয়েছেন? (টাকা)'), input);
  const note = el('div', 'empty', 'আপনার জানানো ভাড়া সবার জন্য দেখানো হবে।');
  const send = button('edit', 'জমা দিন', async () => {
    const fare = Math.round(+input.value);
    if (!(fare >= 5 && fare <= 2000)) { note.textContent = '৫ থেকে ২০০০ টাকার মধ্যে একটি সংখ্যা লিখুন।'; return; }
    send.disabled = true;
    try {
      await reportFare(a, b, fare);
      closeModal();
      renderBusPane(km);
    } catch {
      send.disabled = false;
      note.textContent = 'জমা দেওয়া যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।';
    }
  });
  openModal('আসল ভাড়া জানান', `${STOPS[a].bn} → ${STOPS[b].bn}`, [field, note], [send]);
  input.focus();
}

function renderRidePane(km, min) {
  const pane = $('pane-ride');
  pane.replaceChildren();
  cancelRide();
  const add = (icon, name, sub, price) => {
    pane.appendChild(item(icon, name, sub, taka(price), node => { selectOnly(node); requestRide(name, price); }));
  };
  if (km <= FARES.cng.maxKm) add('cng', 'সিএনজি', 'মিটার রেট', cngFare(km));
  for (const r of FARES.rides) if (km <= r.maxKm) add(r.id, r.name, r.sub, rideFare(r, km, min, trip.from));
  const any = pane.children.length > 0;
  $('seg').hidden = !any;
  $('seg').querySelector('[data-pane=ride]').hidden = !any;      // too far for a ride: no empty tab
  if (!any && !pane.hidden) showPane('bus');
  if (any) {
    stagger(pane);
    const toast = el('div', 'toast');
    toast.hidden = true;
    pane.appendChild(toast);
  }
}

function cancelRide() {
  clearTimeout(rideTimer);
  if (driverMarker) { driverMarker.remove(); driverMarker = null; }
}

// Demo only: there are no real drivers yet.
function requestRide(name, price) {
  cancelRide();
  const toast = $('pane-ride').querySelector('.toast');
  toast.hidden = false;
  toast.textContent = `${name} খোঁজা হচ্ছে…`;
  rideTimer = setTimeout(() => {
    const lat = trip.from.lat + (Math.random() - .5) * .01;
    const lon = trip.from.lon + (Math.random() - .5) * .01;
    const dot = el('div', 'driver');
    dot.appendChild(el('span', null, 'ড্রাইভার (ডেমো)'));
    driverMarker = new maplibregl.Marker({ element: dot }).setLngLat([lon, lat]).addTo(map);
    toast.textContent = `ডেমো: ${name} ${num(2 + Math.floor(Math.random() * 6))} মিনিটে আসছে · ${taka(price)}`;
  }, 2000);
}

function showPane(name) {
  for (const b of $('seg').children) b.classList.toggle('on', b.dataset.pane === name);
  for (const p of ['bus', 'ride', 'train']) $('pane-' + p).hidden = name !== p;
}

async function calculate() {
  const key = [trip.from.lat, trip.from.lon, trip.to.lat, trip.to.lon].join();
  if (key === lastKey) return;
  lastKey = key;
  setStatus('রুট খোঁজা হচ্ছে…');
  let r;
  try { r = await getRoute([trip.from, trip.to]); }
  catch { lastKey = ''; setStatus('রুট পাওয়া যায়নি। অন্য জায়গা দিয়ে চেষ্টা করুন।'); return; }
  if (key !== lastKey) return;
  setStatus('');

  const km = r.distance / 1000, min = r.duration / 60;
  saveRecent(trip.from, trip.to);
  $('trip-km').textContent = `${num(km, 1)} কিমি`;
  $('trip-time').textContent = `গাড়িতে প্রায় ${fmtMin(min)} · জ্যাম ছাড়া`;
  $('sheet').hidden = false;
  if (phoneSheet) phoneSheet.snap(1, false);
  $('trip-photo').replaceChildren(photoStrip(trip.to));
  clearBus();
  renderBusPane(km);
  renderRidePane(km, min);
  renderTrainPane();
  if (typeof showCommunityFares === 'function') showCommunityFares();
  showPane('bus');

  fit(r.geometry.coordinates);
  drawLines('route', [{ coords: r.geometry.coordinates }]);
}

// On a phone the results sheet can be pulled up to read everything, or down to see the map.
const phoneSheet = matchMedia('(max-width: 760px)').matches ? (() => {
  let at = 1;
  const s = dragSheet($('sheet'), $('sheet-grip'), { snaps: [.2, .46, .88], onTap: () => { at = at === 1 ? 2 : 1; s.snap(at); } });
  return s;
})() : null;

function clearTrip() {
  cancelRide();
  trip.from = trip.to = null;
  lastKey = '';
  $('sheet').hidden = true;
  setStatus('');
  for (const s of searches) s.sync();
  if (!map) return;
  drawLines('route', []);
  clearBus();
  drawMarkers();
  fit(BD_LNGLAT);
}

// Opening the map with nothing chosen shows where you are, the way a maps app does. Asked once per visit:
// if the browser's permission prompt is turned down, the map simply stays on Bangladesh.
let locateMe = () => {}, locatedOnce = false, quietLocate = false;
enter.trip = async () => {
  try { await ensureMap(); } catch { return; }
  if (current !== 'trip') return;
  drawMarkers();
  if (!locatedOnce && !pendingPath && !pendingBus && !trip.from && !trip.to && navigator.geolocation) { locatedOnce = true; locateMe(); }
  if (pendingPath) {
    showPathOnMap(pendingPath);
    pendingPath = null;
  } else if (pendingBus) {
    showBusOnMap([pendingBus]);
    pendingBus = null;
  } else if (trip.from && trip.to) {
    calculate();
  } else if (trip.from || trip.to) {
    const p = trip.from || trip.to;
    map.easeTo({ center: [p.lon, p.lat], zoom: 14, duration: 800 });
    setStatus(trip.to ? 'কোথা থেকে যাবেন লিখুন, অথবা ম্যাপে চাপ দিয়ে বেছে নিন।' : 'কোথায় যাবেন লিখুন, অথবা ম্যাপে চাপ দিয়ে বেছে নিন।');
  }
};
$('reset').addEventListener('click', clearTrip);
for (const b of $('seg').children) b.addEventListener('click', () => showPane(b.dataset.pane));

// ---- Dhaka buses ----
(function initBuses() {
  const hubs = ['farmgate', 'mirpur10', 'jatrabari', 'uttara', 'gulistan', 'gabtoli', 'mohakhali', 'notunbazar'];
  let hub = null;

  let timer = null, seq = 0;

  // `getOff` maps a route to the stop nearest the searched place, when the search was for a place.
  function show(list, note, getOff) {
    $('bus-note').textContent = note || '';
    $('bus-note').hidden = !note;
    const grid = $('bus-grid');
    grid.replaceChildren();
    for (const r of list) {
      const card = el('button', 'card bus-card');
      card.append(
        el('b', null, r.bn),
        el('span', null, `${STOPS[r.stops[0]].bn} – ${STOPS[r.stops[r.stops.length - 1]].bn}`),
        getOff ? el('span', 'badge v', `${STOPS[getOff.get(r)].bn} স্টপে নামুন`) : el('span', 'badge g', `${num(r.stops.length)} স্টপ`)
      );
      card.addEventListener('click', () => open(r));
      grid.appendChild(card);
    }
    stagger(grid);
  }

  // Buses that pass within walking distance of a place (a park, hospital, road, neighbourhood…).
  function showNear(place, pool) {
    const near = nearStops(place);
    const getOff = new Map();
    for (const r of pool) {
      const id = near.find(id => r.stops.includes(id));
      if (id) getOff.set(r, id);
    }
    if (!getOff.size) { show([], `${place.title}-এর কাছে (১.২ কিমির মধ্যে) কোনো বাস স্টপ আমাদের তালিকায় নেই।`); return; }
    const stops = [...new Set(getOff.values())].map(id => STOPS[id].bn).join(', ');
    show([...getOff.keys()], `${place.title} — কাছের স্টপ: ${stops} · ${num(getOff.size)} টি বাস যায়`, getOff);
  }

  function render() {
    clearTimeout(timer);
    const mine = ++seq;
    const q = $('bus-filter').value.trim();
    const pool = LOCAL_ROUTES.filter(r => !hub || r.stops.includes(hub));
    if (!q) { show(pool); return; }

    // 1) a bus or stop name, 2) a known place, 3) anything else through the online search.
    const direct = pool.filter(r => matches(r, q) || r.stops.some(id => matches(STOPS[id], q)));
    if (direct.length) { show(direct); return; }
    const place = searchLocal(q).find(p => p.icon === 'pin');
    if (place) { showNear(place, pool); return; }
    if (q.length < 3) { show([], 'কোনো বাস পাওয়া যায়নি।'); return; }
    show([], 'জায়গাটি খোঁজা হচ্ছে…');
    timer = setTimeout(async () => {
      const found = (await searchOnline(q)).find(p => inZone(p, FARES.zones.dtca));
      if (mine !== seq) return;
      if (found) showNear(found, pool);
      else show([], 'এই নামে ঢাকায় কোনো বাস বা জায়গা পাওয়া যায়নি — অন্য বানানে লিখে দেখুন।');
    }, 500);
  }

  function open(r) {
    const ul = el('ul', 'timeline');
    ul.append(...r.stops.map(id => el('li', null, STOPS[id].bn)));
    stagger(ul);
    openModal(r.bn, `${r.en} · ${num(r.stops.length)} স্টপ`, [ul],
      [button('route', 'ম্যাপে দেখুন', () => { closeModal(); pendingBus = r.stops; go('trip'); })]);
  }

  for (const id of hubs) {
    const chip = el('button', 'chip', STOPS[id].bn);
    chip.addEventListener('click', () => {
      hub = hub === id ? null : id;
      for (const c of $('hubs').children) c.classList.toggle('on', c === chip && hub === id);
      render();
    });
    $('hubs').appendChild(chip);
  }
  // Suggestions as you type: buses by name first, then stops and places (any spelling).
  const filter = $('bus-filter'), sugBox = $('bus-suggest');
  function suggest() {
    const q = filter.value.trim();
    sugBox.replaceChildren();
    const rows = [];
    if (q.length < 2) {                              // nothing typed: the busiest stops
      sugBox.appendChild(el('div', 'sug-head', 'জনপ্রিয় স্টপ'));
      for (const s of busiestStops(7)) rows.push(['pin', s.bn, `বাস স্টপ · ${num(s.use)} টি বাস`, s.bn]);
    } else {
    // A bus whose own name starts with what was typed comes first; then places; then buses that merely match.
    const low = q.toLowerCase(), named = [], loose = [];
    for (const r of LOCAL_ROUTES) {
      if (!matches(r, q)) continue;
      const row = ['bus', r.bn, `${STOPS[r.stops[0]].bn} – ${STOPS[r.stops[r.stops.length - 1]].bn}`, r.bn];
      (r.bn.startsWith(q) || (r.en || '').toLowerCase().startsWith(low) ? named : loose).push(row);
    }
    rows.push(...named.slice(0, 4));
    for (const p of searchLocal(q, 5)) rows.push([p.icon === 'bus' ? 'pin' : p.icon, p.title, p.sub, p.title]);
    rows.push(...loose.slice(0, Math.max(0, 3 - named.length)));
    }
    for (const [icon, title, sub, value] of rows) {
      const row = el('div', 'sug');
      const t = el('div', 't');
      t.append(el('b', null, title), el('span', null, sub));
      row.append(ic(icon), t);
      row.addEventListener('mousedown', e => { e.preventDefault(); filter.value = tr(value); sugBox.hidden = true; filter.blur(); render(); });
      sugBox.appendChild(row);
    }
    sugBox.hidden = !rows.length;
  }
  filter.addEventListener('input', () => { suggest(); render(); });
  filter.addEventListener('focus', suggest);
  filter.addEventListener('blur', () => { sugBox.hidden = true; });
  filter.addEventListener('keydown', e => { if (e.key === 'Enter') { sugBox.hidden = true; filter.blur(); } });
  render();
})();

// ---- Districts: 64 district cards, district-to-district fares, bus companies ----
(function initDistricts() {
  const from = $('ic-from'), to = $('ic-to'), box = $('ic-result');
  const cache = new Map();
  let seq = 0;

  for (const sel of [from, to]) {
    for (const division of [...new Set(DISTRICTS.map(d => d.division))]) {
      const group = document.createElement('optgroup');
      group.label = division + ' বিভাগ';
      for (const d of DISTRICTS.filter(d => d.division === division)) group.appendChild(new Option(d.bn, d.id));
      sel.appendChild(group);
    }
  }
  from.value = 'dhaka';
  to.value = 'chattogram';

  async function update() {
    const a = districtById(from.value), b = districtById(to.value);
    const mine = ++seq;
    box.replaceChildren();
    if (a === b) { box.appendChild(el('div', 'empty', 'দুটি আলাদা জেলা বেছে নিন।')); return; }
    const key = a.id + '>' + b.id;
    if (!cache.has(key)) {
      box.appendChild(el('div', 'skeleton'));
      try { cache.set(key, await getRoute([a, b])); }
      catch {
        if (mine === seq) box.replaceChildren(el('div', 'empty', 'দূরত্ব বের করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।'));
        return;
      }
      if (mine !== seq) return;
      box.replaceChildren();
    }
    const r = cache.get(key), km = r.distance / 1000;
    const head = el('div', 'head');
    const titles = el('div', 'grow');
    const route = el('h3', 'rx-route');
    route.append(el('span', null, a.bn), Object.assign(el('i', 'rx-arrow'), { innerHTML: svg('arrow') }), el('span', null, b.bn));
    const facts = el('div', 'rx-facts');
    const fact = (icon, text) => { const f = el('span'); f.append(ic(icon), el('span', null, text)); return f; };
    facts.append(fact('route', `${num(km, 1)} কিমি`), fact('clock', `গাড়িতে প্রায় ${fmtMin(r.duration / 60)}`));
    titles.append(route, facts);
    head.appendChild(titles);
    const btn = button('route', 'ম্যাপে দেখুন', () => { trip.from = asPlace(a); setPlace('to', asPlace(b)); }, true);
    const actions = el('div', 'actions');
    actions.appendChild(btn);
    box.append(head, fareTiles(busRule(a, b), km, officialFare(a, b)));
    const counter = counterFare(a, b);
    if (counter) box.appendChild(counter);
    box.append(el('div', 'label', 'এই রুটের বাস'), operatorChips(a, b), actions);
    stagger(box);
  }

  from.addEventListener('change', update);
  to.addEventListener('change', update);
  $('ic-swap').addEventListener('click', () => { [from.value, to.value] = [to.value, from.value]; update(); });

  const grid = $('op-grid');
  for (const o of OPERATORS) {
    const card = el('div', 'card op-card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const badges = el('div', 'chips');
    if (o.ac) badges.appendChild(el('span', 'badge v', 'এসি'));
    if (o.nonAc) badges.appendChild(el('span', 'badge', 'নন-এসি'));
    card.append(el('b', null, o.bn), el('span', null, `ঢাকা থেকে ${num(o.districts.length - 1)} জেলায়`), badges,
      ratingStars('bus:' + o.en));
    card.addEventListener('click', () => {
      const open = card.querySelector('.where');
      if (open) { open.remove(); return; }
      card.appendChild(el('div', 'where', o.districts.slice(1).map(id => districtById(id).bn).join(' · ')));
    });
    grid.appendChild(card);
  }

  const dhaka = districtById('dhaka');

  function openDistrict(d) {
    const body = [photoStrip(asPlace(d), 3000)];
    const f = MARKET_FARES[d.id], official = officialFare(dhaka, d);
    if (official) {
      const tiles = el('div', 'tiles');
      tiles.append(tile('main', 'নন-এসি · বিআরটিএ নির্ধারিত', taka(official.f51), `৫১ আসনের বাস · ${official.terminal} থেকে`),
                   tile('', '৪০ আসনের বাস', taka(official.f40), `${num(official.km)} কিমি · টোলসহ`));
      body.push(tiles);
    }
    if (f) {
      const tiles = el('div', 'tiles');
      tiles.appendChild(tile(official ? '' : 'main', 'নন-এসি · কাউন্টারে', fareRange(f[0], f[1]), 'অনানুষ্ঠানিক তালিকা'));
      tiles.appendChild(f.length > 2 ? tile('', 'এসি · কাউন্টারে', fareRange(f[2], f[3]), 'কোম্পানি ভেদে আলাদা')
                                     : tile('', 'এসি', '—', 'তথ্য নেই'));
      body.push(tiles);
    }
    const road = el('div', 'empty', d === dhaka ? '' : 'দূরত্ব বের করা হচ্ছে…');
    body.push(road);

    if (d !== dhaka) {
      const names = [...new Set([...operatorsBetween(dhaka, d).map(o => o.bn), ...(DIVISION_OPERATORS[d.division] || [])])];
      body.push(el('div', 'label', 'ঢাকা থেকে বাস'));
      if (names.length) {
        const chips = el('div', 'chips');
        chips.append(...names.map(n => el('div', 'chip', n)));
        body.push(chips);
      } else body.push(el('div', 'empty', 'এই জেলার বাস কোম্পানির নাম এখনো যোগ হয়নি।'));
    }

    const sights = PLACES.filter(p => nearestDistrict(p) === d).slice(0, 10);
    if (sights.length) {
      body.push(el('div', 'label', 'চেনা জায়গা'));
      const chips = el('div', 'chips');
      for (const p of sights) {
        const chip = el('button', 'chip', p.bn);
        chip.addEventListener('click', () => { closeModal(); goTo(asPlace(p)); });
        chips.appendChild(chip);
      }
      body.push(chips);
    }

    const actions = [button('compass', 'কাছাকাছি খুঁজুন', () => { closeModal(); nearbyAt(asPlace(d)); }, true)];
    if (d !== dhaka) actions.unshift(button('route', 'ঢাকা থেকে রুট', () => { closeModal(); trip.from = asPlace(dhaka); setPlace('to', asPlace(d)); }));
    openModal(d.bn, `${d.division} বিভাগ`, body, actions);

    if (d === dhaka) return;
    const key = 'dhaka>' + d.id;
    (cache.has(key) ? Promise.resolve(cache.get(key)) : getRoute([dhaka, d]).then(r => (cache.set(key, r), r)))
      .then(r => {
        const km = r.distance / 1000;
        road.textContent = `সড়কপথে ${num(km, 1)} কিমি · প্রায় ${fmtMin(r.duration / 60)}` + (official ? '' : ` · সরকারি হারে আনুমানিক ${taka(busFare(busRule(dhaka, d), km))}`);
      })
      .catch(() => { road.textContent = 'দূরত্ব বের করা যায়নি।'; });
  }

  function renderDistricts() {
    const q = $('district-filter').value.trim();
    const box = $('district-list');
    box.replaceChildren();
    for (const division of [...new Set(DISTRICTS.map(d => d.division))]) {
      const list = DISTRICTS.filter(d => d.division === division && (!q || matches(d, q)));
      if (!list.length) continue;
      const section = el('div', 'division');
      const grid = el('div', 'grid');
      for (const d of list) {
        const card = el('button', 'card district-card');
        const f = MARKET_FARES[d.id], official = BRTA_FARES[d.id];
        card.append(el('b', null, d.bn), el('span', null, official ? `ঢাকা থেকে ${taka(official[2])}` : f ? `ঢাকা থেকে ${fareRange(f[0], f[1])}` : d.id === 'dhaka' ? 'রাজধানী' : 'ভাড়া দেখুন'));
        card.addEventListener('click', () => openDistrict(d));
        grid.appendChild(card);
      }
      stagger(grid);
      section.append(el('div', 'label', division + ' বিভাগ'), grid);
      box.appendChild(section);
    }
    if (!box.children.length) box.appendChild(el('div', 'empty', 'এই নামে কোনো জেলা পাওয়া যায়নি।'));
  }
  // the district list is drawn by js/guide.js now (pictures, places, famous foods)

  let loaded = false;
  enter.districts = () => { if (!loaded) { loaded = true; update(); } };
})();

// ---- Nearby: pick a place, pick a kind of thing, get the closest ones ----
let nearbyAt = () => {};
(function initNearby() {
  let center = null, cat = NEARBY_CATEGORIES[0], seq = 0, found = [], byRating = false;
  const input = $('near-input'), note = $('near-note'), list = $('near-list');

  // Facts OpenStreetMap holds about a place, as short labels.
  const facts = p => [p.x.kind, p.x.em && 'জরুরি বিভাগ', p.x.gov && 'সরকারি', p.x.pvt && 'বেসরকারি', p.x.beds && `${num(p.x.beds)} শয্যা`,
                      p.x.hours === '24/7' && '২৪ ঘণ্টা খোলা', p.x.ph && 'ফোন আছে'].filter(Boolean);

  function openPlace(p) {
    const body = [photoStrip({ lat: p.lat, lon: p.lon, label: p.title })];
    const f = facts(p);
    if (f.length || p.sub) {
      const chips = el('div', 'chips');
      if (p.sub) chips.appendChild(el('div', 'chip', p.sub));
      chips.append(...f.filter(t => t !== 'ফোন আছে').map(t => el('div', 'chip', t)));
      body.push(chips);
    }
    if (p.x.hours && p.x.hours !== '24/7') body.push(el('div', 'label', 'খোলা থাকে'), el('div', 'empty no-tr', p.x.hours));
    body.push(el('div', 'label', 'রেটিং দিন'), ratingStars(placeKey(p), draw),
      el('div', 'empty', RATINGS_ONLINE ? 'আপনার রেটিং সবার রেটিংয়ের সাথে যোগ হয়।' : 'সার্ভার ছাড়া চলছে — রেটিং শুধু এই ডিভাইসে থাকছে।'));
    const actions = [button('route', 'রুট দেখুন', () => { closeModal(); goTo({ lat: p.lat, lon: p.lon, label: p.title }); })];
    if (p.x.ph) {
      const call = el('a', 'btn quiet');
      call.href = 'tel:' + p.x.ph.replace(/[^+\d]/g, '');
      call.innerHTML = svg('phone');
      call.appendChild(document.createTextNode(p.x.ph));
      actions.push(call);
    }
    const g = el('a', 'btn quiet');                    // Google's own page for the spot: reviews, photos, live hours
    g.href = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
    g.target = '_blank';
    g.rel = 'noopener';
    g.innerHTML = svg('pin');
    g.appendChild(document.createTextNode('Google Maps'));
    actions.push(g);
    openModal(p.title, `${cat.bn} · ${distText(p.km)} দূরে`, body, actions);
  }

  function draw() {
    list.replaceChildren();
    const rated = found.some(p => ratingScore(placeKey(p)));
    $('near-sort').hidden = !rated;
    const rows = byRating && rated
      ? [...found].sort((a, b) => ratingScore(placeKey(b)) - ratingScore(placeKey(a)) || a.km - b.km)
      : found;
    for (const p of rows.slice(0, 48)) {
      const sub = [ratingText(placeKey(p)), p.sub, ...facts(p)].filter(Boolean).join(' · ');
      list.appendChild(item(cat.icon, p.title, sub, distText(p.km), () => openPlace(p)));
    }
    stagger(list);
  }
  for (const b of $('near-sort').children) {
    b.addEventListener('click', () => {
      byRating = b.dataset.sort === 'rating';
      for (const n of $('near-sort').children) n.classList.toggle('on', n === b);
      draw();
    });
  }

  async function load() {
    const mine = ++seq;
    list.replaceChildren(el('div', 'skeleton'));
    note.textContent = `${center.label}-এর কাছের ${cat.bn} খোঁজা হচ্ছে…`;
    const count = () => { note.textContent = `${center.label}-এর কাছে ${num(found.length)} টি ${cat.bn} · চাপ দিলে বিস্তারিত`; };
    try { found = await searchNearby(center, cat.tag, more => { if (mine === seq && more.length >= found.length) { found = more; count(); draw(); } }); }
    catch {
      if (mine === seq) { found = []; list.replaceChildren(); note.textContent = 'খোঁজা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।'; }
      return;
    }
    if (mine !== seq) return;
    list.replaceChildren();
    $('near-sort').hidden = true;
    if (!found.length) { note.textContent = `${center.label}-এর ৩০ কিমির মধ্যে কোনো ${cat.bn} ম্যাপে পাওয়া যায়নি।`; return; }
    note.textContent = `${center.label}-এর কাছে ${num(found.length)} টি ${cat.bn} · চাপ দিলে বিস্তারিত`;
    draw();
  }

  function setCenter(place) {
    center = place;
    input.value = tr(place.label);
    load();
  }
  nearbyAt = place => { go('nearby'); setCenter(place); };

  for (const c of NEARBY_CATEGORIES) {
    const b = el('button', 'cat' + (c === cat ? ' on' : ''));
    b.append(ic(c.icon), document.createTextNode(c.bn));
    b.addEventListener('click', () => {
      cat = c;
      for (const n of $('cats').children) n.classList.toggle('on', n === b);
      if (center) load();
    });
    $('cats').appendChild(b);
  }
  wireSuggest(input, $('near-suggest'), setCenter);
  $('near-locate').addEventListener('click', () => {
    if (!navigator.geolocation) { note.textContent = 'এই ডিভাইসে লোকেশন পাওয়া যাচ্ছে না।'; return; }
    note.textContent = 'লোকেশন খোঁজা হচ্ছে…';
    navigator.geolocation.getCurrentPosition(
      pos => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'আমার লোকেশন' }),
      () => { note.textContent = 'লোকেশনের অনুমতি পাওয়া যায়নি।'; });
  });

  // First visit: start from the trip's destination or start if there is one, otherwise Dhaka.
  enter.nearby = () => { if (!center) setCenter(trip.to || trip.from || asPlace(districtById('dhaka'))); };
})();

// ---- Fares ----
(function initFares() {
  const { bus, cng, rides } = FARES;
  const range = $('calc-range'), tiles = $('calc-tiles');
  const AVG_KMH = 25;   // assumed ride speed, only to estimate the per-minute part of a ride fare

  function update() {
    const km = +range.value, min = km / AVG_KMH * 60;
    $('calc-km').textContent = num(km);
    // A city bus trip longer than the metro area makes no sense, so it drops out past the CNG range too.
    const rows = [];
    if (km <= cng.maxKm) rows.push(['bus', 'শহরের বাস', taka(busFare(bus.metro, km)), bus.metro.perKm]);
    if (km >= 40) rows.push(['send', 'দূরপাল্লার বাস', taka(busFare(bus.intercity, km)), bus.intercity.perKm]);   // the shortest route in BRTA's charts is 42 km
    if (km <= cng.maxKm) rows.push(['cng', 'সিএনজি', taka(cngFare(km)), cng.perKm]);
    for (const r of rides) if (km <= r.maxKm) rows.push([r.id, r.name, taka(rideFare(r, km, min)), r.perKm]);
    tiles.replaceChildren(...rows.map(([icon, label, value, rate], i) => {
      const t = tile(i === 0 ? 'main' : '', label, value, perKmText(rate));
      t.prepend(ic(icon));
      return t;
    }));
  }
  range.addEventListener('input', update);
  update();

  const perKm = r => `${rateText(r.perKm)}/কিমি`;
  const groups = [
    ['bus', 'বাস (নন-এসি)', [
      ['ঢাকা ও চট্টগ্রাম শহর', perKm(bus.metro)],
      ['ঢাকার আশপাশের জেলা', perKm(bus.dtca)],
      ['সারা দেশ, দূরপাল্লা', perKm(bus.intercity)],
      ['শহরে সর্বনিম্ন', taka(bus.metro.min)]
    ]],
    ['cng', 'সিএনজি', [
      [`প্রথম ${num(cng.baseKm)} কিমি`, taka(cng.base)],
      ['এরপর প্রতি কিমি', taka(cng.perKm)],
      ['অপেক্ষা, প্রতি মিনিট', taka(cng.waitPerMin)]
    ]],
    ['car', 'রাইড', rides.map(r => [r.name, `${taka(r.base)} + ${taka(r.perKm)}/কিমি`])]
  ];
  for (const [icon, title, rows] of groups) {
    const card = el('div', 'card rule-card');
    const h = el('h4');
    h.append(ic(icon), document.createTextNode(title));
    card.appendChild(h);
    for (const [a, b] of rows) {
      const row = el('div', 'rule');
      row.append(el('span', null, a), el('b', null, b));
      card.appendChild(row);
    }
    $('rules').appendChild(card);
  }
  stagger($('rules'));
  $('rules').lastChild.appendChild(el('div', 'foot', FARES.rideSource));
  $('rules-foot').textContent = `কিমি-প্রতি হার সরকার নির্ধারিত, ${FARES.effective} থেকে। অ্যাপের ভাড়া এই হার × আনুমানিক দূরত্ব — ` +
    'বিআরটিএর রুটভিত্তিক তালিকার সাথে কিছু কমবেশি হতে পারে (সেতুর টোল ধরা নেই)। এসি বাসের ভাড়া কোম্পানি ঠিক করে।';
})();

for (const b of document.querySelectorAll('.lang-btn')) {
  b.textContent = LANG === 'en' ? 'বাংলা' : 'English';
  b.addEventListener('click', () => setLang(LANG === 'en' ? 'bn' : 'en'));
}
startTranslating();
route();
setTimeout(() => getMapStyle().catch(() => {}), 1200);   // warm the map style while the user is still on Home
// Shared ratings arrive after first paint; cards drawn earlier pick up the averages on their next draw.
loadFareReports();
loadRatings().then(() => { for (const box of document.querySelectorAll('#op-grid .rate')) box.dispatchEvent(new Event('refresh')); });
loadIndex().then(n => {
  const stat = document.querySelector('[data-count=places]');
  if (!n || !stat) return;
  stat.dataset.count = n + PLACES.length + Object.keys(STOPS).length;
  // Written after Home's count-up has finished, which would otherwise overwrite it with the old total.
  setTimeout(() => { stat.textContent = num(+stat.dataset.count); }, 1300);
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// Phones: the tab bar steps away while you scroll down, and comes back as soon as you scroll up (as on Facebook).
(() => {
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY, d = y - lastY;
    if (Math.abs(d) < 8) return;
    lastY = y;
    if (innerWidth > 760) return;
    document.body.classList.toggle('nav-away', d > 0 && y > 90);
  }, { passive: true });
  addEventListener('hashchange', () => { document.body.classList.remove('nav-away'); lastY = scrollY; });
})();
