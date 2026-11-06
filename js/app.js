// ---- App shell: router, shared search box, and one controller per page ----

for (const n of document.querySelectorAll('[data-ic]')) n.innerHTML = svg(n.dataset.ic);

const BD_LNGLAT = [[87.8, 20.3], [92.9, 26.9]];   // Bangladesh, as [lon, lat] corners
const PAGES = ['home', 'trip', 'train', 'districts', 'nearby', 'tour', 'fares', 'more', 'chat', 'support', 'community', 'profile', 'settings', 'explore', 'insights', 'verified'];
const trip = { from: null, to: null };          // each: { lat, lon, label }
const enter = {};                               // page name -> function run when the page opens
const searches = [];
let current = null;

const districtById = id => DISTRICTS.find(d => d.id === id);
let opsRefresh = () => {};                       // the bus companies' list, drawn again when the ratings come
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
  r.append(icon.endsWith('F') ? modeIc(icon.slice(0, -1)) : ic(icon), t);
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

// One number first, as a traveller wants it: what the counters usually charge (non-AC, and AC when known), with the
// BRTA's set fare under it as the official ceiling. Without a counter list, the BRTA chart (or the per-km rate) and the
// AC estimate as before.
function fareSummary(a, b, rule, km) {
  const other = a.id === 'dhaka' ? b : b.id === 'dhaka' ? a : null;
  const f = other && MARKET_FARES[other.id], official = officialFare(a, b);
  if (!f) return fareTiles(rule, km, official);
  const tiles = el('div', 'tiles');
  tiles.append(tile('main', 'সাধারণত গুনবেন · নন-এসি', fareRange(f[0], f[1]), f.length > 2 ? `এসি ${fareRange(f[2], f[3])} · কাউন্টারের অনানুষ্ঠানিক তালিকা` : 'কাউন্টারের অনানুষ্ঠানিক তালিকা'));
  if (official) tiles.append(tile('', 'বিআরটিএ নির্ধারিত · নন-এসি', fareRange(official.f51, official.f40), `সরকারি হার · ৫১ ও ৪০ আসন · ${official.terminal} থেকে`));
  else tiles.append(tile('', 'সরকারি হারে · নন-এসি', taka(busFare(rule, km)), perKmText(rule.perKm)));
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
    const chip = el('div', 'chip op-chip', o.bn);
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
// From where you are: at once when the location is known from a moment ago, else as soon as the phone says;
// the route is drawn the moment both ends are there.
function goTo(place) {
  const fresh = LAST_FIX && Date.now() - LAST_FIX.at < 5 * 60_000;
  if (!trip.from && fresh) trip.from = { lat: LAST_FIX.lat, lon: LAST_FIX.lon, label: 'আমার লোকেশন' };
  const ask = !trip.from;
  setPlace('to', place);
  if (ask) {
    go('trip');
    getLocation({ maxAge: 5 * 60_000 }).then(f => { if (trip.to === place && !trip.from) setPlace('from', { lat: f.lat, lon: f.lon, label: 'আমার লোকেশন' }); },
      e => { if (trip.to === place && !trip.from) setStatus(locationError(e) + ' অথবা কোথা থেকে যাবেন লিখুন।'); });
  } else if (current !== 'trip') go('trip');
}

// A photo strip for a place. Starts empty and fills in if Wikimedia Commons has pictures taken nearby.
// A district town's own pictures (the guide's cover and best places, each credited), else Commons photos taken nearby.
function guidePhotos(place) {
  if (typeof GUIDE === 'undefined' || !GUIDE) return [];
  const d = DISTRICTS.find(x => x.bn === place.label || x.en === place.label) || DISTRICTS.find(x => haversineKm(x, place) < 4);
  const g = d && GUIDE[d.id];
  if (!g) return [];
  const list = [];
  if (g.img) list.push({ src: typeof sized === 'function' ? sized(g.img, 500) : g.img, big: g.img, name: d.bn, named: true, by: g.fileBy || '', license: g.fileLic || '' });
  for (const s of g.sights || []) if (s.img && list.length < 6) list.push({ src: typeof sized === 'function' ? sized(s.img, 500) : s.img, big: s.img, name: s.name, named: true, by: s.imgBy || '', license: s.imgLic || '' });
  return list;
}
function photoStrip(place, radius) {
  const box = el('div', 'photo-box');
  const guideIn = typeof GUIDE !== 'undefined' && GUIDE ? Promise.resolve() : typeof loadGuide === 'function' ? loadGuide().catch(() => {}) : Promise.resolve();
  // the district's own pictures first; beside them only nearby photos named after the place (not whatever was
  // photographed near by); with no pictures of its own, the nearby ones as before
  guideIn.then(async () => {
    const own = guidePhotos(place);
    if (own.length >= 3) return own;
    const near = await placePhotos(place, radius);
    const seen = new Set(own.map(p => p.big));
    return own.length ? [...own, ...near.filter(p => p.named && !seen.has(p.big))].slice(0, 6) : near;
  }).then(photos => {
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
    box.append(strip, el('div', 'cap', note));
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

// Links that open something inside a page, so they can be shared: #/trip?from=lat,lon,name&to=lat,lon,name opens that
// route, #/district/<id> that district's card.
const placeParam = v => { const [lat, lon, ...rest] = String(v || '').split(','); const p = { lat: Number(lat), lon: Number(lon), label: decodeURIComponent(rest.join(',')) || '' }; return isFinite(p.lat) && isFinite(p.lon) && p.lat && p.lon ? p : null; };
const placeToParam = p => `${(+p.lat).toFixed(5)},${(+p.lon).toFixed(5)},${encodeURIComponent(p.label || '')}`;
const tripLink = () => trip.from && trip.to ? `${location.origin}/#/trip?from=${placeToParam(trip.from)}&to=${placeToParam(trip.to)}` : location.origin + '/#/trip';
// A district page (/district/<id>, what search engines and link previews know) opens the app on that district.
{ const m = /^\/district\/([a-z-]{2,30})\/?$/.exec(location.pathname); if (m) history.replaceState(history.state, '', '/#/district/' + m[1]); }

function route() {
  let name = location.hash.replace(/^#\/?/, '') || 'home';
  let deep = null;
  { const [base, query] = name.split('?');
    if (base.startsWith('district/')) { deep = { district: base.slice(9) }; name = 'districts'; }
    else if (base.startsWith('live/')) { deep = { live: base.slice(5) }; name = 'trip'; }               // a live location link (js/locshare.js)
    else if (base.startsWith('at/')) { deep = { at: placeParam(base.slice(3)) }; name = 'trip'; }        // a shared place
    else if (base === 'trip' && query) { const q = new URLSearchParams(query); deep = { from: placeParam(q.get('from')), to: placeParam(q.get('to')) }; name = 'trip'; }
    else name = base; }
  if (name === 'intercity') name = 'districts';   // old link
  // the profile tab: your own profile, or the menu with the login card when nobody is signed in
  if (name === 'me') { const me = typeof ME !== 'undefined' ? ME : null; if (me) { PROFILE.id = me.id; name = 'profile'; } else name = 'more'; }
  if (name === 'tour') { try { localStorage.setItem('bdmap.rb', 'tour'); } catch { /* storage off */ } history.replaceState(null, '', '#/districts'); name = 'districts'; }   // now a tab of রূপসী বাংলা
  let scrollToSel = '';
  if (name === 'leaderboard') { scrollToSel = '.lead-card'; name = 'community'; }   // the fare tab, at the leaderboard
  // the Dhaka bus page is gone (buses show on the map for a trip); its fare tab, and the old community page, are ভাড়া → ভাড়া জানান
  if (name === 'community' || name === 'buses') { try { localStorage.setItem('bdmap.fx', 'give'); } catch { /* storage off */ } history.replaceState(null, '', '#/fares'); name = 'fares'; }
  current = PAGES.includes(name) ? name : 'home';
  for (const p of PAGES) $('page-' + p).classList.toggle('on', p === current);
  const tab = ['profile', 'settings', 'support', 'insights', 'verified'].includes(current) || (current === 'more' && innerWidth <= 760) ? 'me' : current;
  for (const a of document.querySelectorAll('[data-nav]')) a.classList.toggle('on', a.dataset.nav === tab);
  document.body.style.overflow = current === 'trip' ? 'hidden' : '';
  document.body.dataset.page = current;
  mzPage(current);
  scrollTo(0, 0);
  if (enter[current]) enter[current]();
  requestAnimationFrame(() => revealOnScroll($('page-' + current)));
  if (deep && deep.from && deep.to) { trip.from = deep.from; setTimeout(() => setPlace('to', deep.to), 0); }
  if (deep && deep.live && typeof lsOpenLive === 'function') lsOpenLive(deep.live);
  if (deep && deep.at && typeof lsOpenAt === 'function') lsOpenAt(deep.at);
  if (deep && deep.district) { const d = districtById(deep.district); if (d) setTimeout(() => { if (window.openDistrictGuide) window.openDistrictGuide(d); }, 300); }
  if (scrollToSel) setTimeout(() => { const t = document.querySelector('#page-' + current + ' ' + scrollToSel); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250);
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
    s.addEventListener('mousedown', e => { e.preventDefault(); if (input.value.trim().length >= 2) mzTrack({ s: input.value, k: 'place', n: box.querySelectorAll('.sug').length, p: title }); box.hidden = true; input.blur(); onPick({ lat, lon, label: title }); });   // the keyboard goes; onPick may open the next field
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
      if (!box.children.length) { box.appendChild(el('div', 'empty', 'কিছু পাওয়া যায়নি — অন্য বানানে লিখে দেখুন, অথবা ম্যাপে চাপ দিয়ে বেছে নিন।')); mzTrack({ s: q, k: 'place', n: 0 }); }
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
        <div class="field"><input data-w="from" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off" enterkeyhint="next" placeholder="কোথা থেকে" aria-label="কোথা থেকে">
          <button class="icon-btn" data-act="locate" title="আমার লোকেশন" aria-label="আমার লোকেশন">${svg('locate')}</button>
          <div class="suggest" hidden></div></div>
        <div class="field"><input data-w="to" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off" enterkeyhint="search" placeholder="কোথায় যাবেন" aria-label="কোথায় যাবেন">
          <button class="icon-btn" data-act="swap" title="অদলবদল" aria-label="অদলবদল">${svg('swap')}</button>
          <div class="suggest" hidden></div></div>
      </div>
    </div>
    <div class="status"></div>`;

  const inputs = {};
  for (const input of root.querySelectorAll('input')) {
    const which = input.dataset.w, box = input.parentNode.querySelector('.suggest');
    inputs[which] = input;
    // after 'from', the cursor goes on to 'to'
    wireSuggest(input, box, place => { setPlace(which, place); if (which === 'from' && !trip.to && inputs.to && current !== 'trip') setTimeout(() => inputs.to.focus(), 0); }, () => { trip[which] = null; });
    // on a phone the home page's search moves up to the top, so the list of places has room above the keyboard
    if (root.id === 'home-search') input.addEventListener('focus', () => {
      if (!matchMedia('(max-width: 760px)').matches) return;
      setTimeout(() => { const y = root.getBoundingClientRect().top + scrollY - 12; if (Math.abs(scrollY - y) > 8) scrollTo({ top: y, behavior: 'smooth' }); }, 60);
    });
  }

  root.querySelector('[data-act=swap]').addEventListener('click', () => {
    if (!trip.from || !trip.to) return;
    [trip.from, trip.to] = [trip.to, trip.from];
    setPlace('from', trip.from);
  });
  root.querySelector('[data-act=locate]').addEventListener('click', () => {
    setStatus('লোকেশন খোঁজা হচ্ছে…');
    getLocation({ maxAge: 60_000 }).then(f => { setStatus(''); setPlace('from', { lat: f.lat, lon: f.lon, label: 'আমার লোকেশন' }); }, e => setStatus(locationError(e)));
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

  HELPLINES.forEach((h, i) => {
    const a = el('a', 'help-row');
    a.href = 'tel:' + h.number;
    a.title = h.sub;
    const t = el('span', 't');
    t.append(el('b', null, h.bn), el('small', null, h.sub));
    const call = el('span', 'hl-call');
    call.append(ic('phone'), document.createTextNode(h.number));
    a.append(Object.assign(el('i', 'mi ' + (i ? 'c-teal' : 'c-red')), { innerHTML: svg('phone') }), t, call);
    $('helplines').appendChild(a);
  });

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
  // the size the screen needs: a phone takes the 500 px picture, a wide screen the 960 or 1280 one (Wikimedia's standard widths)
  const fUrl = w => `https://upload.wikimedia.org/wikipedia/commons/thumb/${fFile}/${w}px-${fFile.split('/').pop()}`;
  fImg.sizes = '(max-width: 760px) calc(100vw - 32px), 720px';
  fImg.srcset = [500, 960, 1280].map(w => `${fUrl(w)} ${w}w`).join(', ');
  fImg.fetchPriority = 'low';
  fImg.decoding = 'async';
  fImg.src = fUrl(960);
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
let lastKey = '', pendingPath = null;
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
        if (l.id === 'poi_r1') l.minzoom = 15; else if (l.id === 'poi_r7') l.minzoom = 16.3; else if (l.id === 'poi_r20') l.minzoom = 17.3;   // fewer far out, as Google's
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
// Our map files on R2, under our own domain: Cloudflare keeps them in its cache near the reader (a cache rule for
// tiles.manzeela.com), where the bucket's r2.dev address was rate-limited and never cached.
const TILES_HOST = 'https://tiles.manzeela.com';
const BD_TILES = TILES_HOST + '/tiles/bd.pmtiles';
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
    if (!tiles) await loadMapLib().catch(() => {});
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
// slow or refused R2 would keep the whole map from opening.
const BD_BUILDINGS = TILES_HOST + '/tiles/buildings-bd.pmtiles';
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
// Imagery: Esri World Imagery (Esri, Vantor, Earthstar Geographics), only through ArcGIS Location Platform with our
// key (from the server, /api/map-config), as Esri's terms ask of an app like this. Without a working key there is no
// satellite view: the map stays standard (Esri's keyless public copy is not for use in a commercial app).
let SAT_TILES = '';
// The key is tried on one tile first: a wrong or expired key would turn every photo into an error.
const satKey = fetch('api/map-config').then(r => r.json()).then(async j => {
  if (!j.esriKey) return;
  const keyed = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=' + encodeURIComponent(j.esriKey);
  const test = await fetch(keyed.replace('{z}', '6').replace('{y}', '27').replace('{x}', '48'));
  if (test.ok && (test.headers.get('content-type') || '').startsWith('image')) SAT_TILES = keyed.replace('https://', 'esri://');
  else console.warn('imagery key refused; no satellite view');
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
const OUR_LAYERS = /^(route|bus|stops|places2|sat|walk|alt|measure)/;
async function setMapMode(mode) {
  if (mode !== 'standard') { await satKey; if (!SAT_TILES) mode = 'standard'; }     // no working key: no satellite view
  mapMode = mode;
  try { localStorage.setItem('bdmap.mapmode', mode); } catch { /* storage off */ }
  if (!map || !map.getStyle()) return;
  if (SAT_TILES && !map.getSource('sat')) {
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
    if (l.type === 'line' && /^(road|bridge|tunnel)/.test(l.id)) {
      if (!map._roadPaint) map._roadPaint = {};
      if (!map._roadPaint[l.id]) map._roadPaint[l.id] = { color: map.getPaintProperty(l.id, 'line-color') };
      const major = /motorway|trunk|primary/.test(l.id);
      map.setPaintProperty(l.id, 'line-color', mode === 'hybrid' ? (major ? '#f6d77a' : '#ffffff') : map._roadPaint[l.id].color);
      map.setPaintProperty(l.id, 'line-opacity', mode === 'hybrid' ? (major ? 0.4 : 0.3) : (l.id.startsWith('tunnel_') ? 0.55 : 1));
    }
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
  const satPic = () => SAT_TILES.replace('esri://', 'https://').replace('{z}', '15').replace('{y}', '14159').replace('{x}', '24613');
  const cards = el('div', 'mm-cards');
  for (const [mode, label] of [['standard', 'সাধারণ'], ['hybrid', 'হাইব্রিড'], ['satellite', 'স্যাটেলাইট']]) {
    const c = el('button', 'mm-card ' + mode); c.dataset.mode = mode;
    const pic = el('span', 'mm-pic');
    // the photo cards wait for the key; without one they stay off
    if (mode !== 'standard') satKey.then(() => { if (SAT_TILES) pic.style.backgroundImage = `url("${satPic()}")`; else { c.disabled = true; c.title = 'স্যাটেলাইট ছবি এখন পাওয়া যাচ্ছে না'; } });
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
  const open = () => { if (typeof offRow === 'function' && !card.querySelector('.mm-off')) card.appendChild(offRow(() => close()));   // js/mapplus.js loads after this file
    cb.checked = is3D; for (const b of cards.children) b.classList.toggle('on', b.dataset.mode === mapMode); sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('in')); };
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
      let b = map.project(it.next), back = a;
      if (it.line) {
        // the points about 40 px before and after the name's middle, along the road
        const reach = (step) => { let p = a; for (let i = it.mid + step; i >= 0 && i < it.line.length; i += step) { p = map.project(it.line[i]); if (Math.hypot(p.x - a.x, p.y - a.y) > 40) break; } return p; };
        b = reach(1); back = reach(-1);
        if (b === a) b = map.project(it.next);
      }
      let deg = Math.atan2(b.y - back.y, b.x - back.x) * 180 / Math.PI;
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
      item.line = line; item.mid = mid;
    }
    items.push(item);
    if (items.length >= 260) break;
  }
  // A division or district named as the city at its heart (খুলনা বিভাগ, খুলনা জেলা beside খুলনা): only the city, as
  // Google's and Apple's maps show it
  {
    const base = t => t.replace(/\s*(বিভাগ|জেলা|Division|District)$/i, '').trim();
    const towns = items.filter(it => /^(city|town|village|district)$/.test(it.kind)).map(it => ({ name: base(it.text), kind: it.kind, p: map.project(it.at) }));
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!/^(division|district|state)$/.test(it.kind)) continue;
      const p = map.project(it.at), b = base(it.text);
      if (towns.some(t => t !== it._town && t.name === b && t.kind !== it.kind && Math.hypot(t.p.x - p.x, t.p.y - p.y) < 300)) items.splice(i, 1);
    }
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
  const kept = [], zNow = map.getZoom();
  for (const it of [...bnLabels.items].sort((a, b) => rank[a.kind] - rank[b.kind] || b.wasShown - a.wasShown)) {
    const r = it.node.getBoundingClientRect();
    const clash = kept.some(k => r.left < k.right + 4 && r.right > k.left - 4 && r.top < k.bottom + 2 && r.bottom > k.top - 2);
    // far out, a few place names (as Google's); more as you come closer
    const capped = it.kind === 'poi' && kept.poi >= (zNow < 16 ? 6 : zNow < 17 ? 12 : zNow < 17.8 ? 20 : 60);
    it.node.style.visibility = clash || capped ? 'hidden' : '';
    if (!clash && !capped) { kept.push(r); if (it.kind === 'poi') kept.poi = (kept.poi || 0) + 1; }
  }
}
function initBanglaLabels() {
  if (bnLabels.box) return;
  bnLabels.box = el('div', 'bn-labels');
  map.getCanvasContainer().appendChild(bnLabels.box);
  map.on('move', placeBanglaLabels);
  map.on('idle', drawBanglaLabels);
  let again = 0;
  map.on('moveend', () => { clearTimeout(again); again = setTimeout(drawBanglaLabels, 280); });
  map.on('sourcedata', e => { if (e.isSourceLoaded && e.sourceId !== 'sat') { clearTimeout(again); again = setTimeout(drawBanglaLabels, 400); } });
  drawBanglaLabels();
}

// Room to leave around fitted shapes so the floating cards do not cover them.
function mapPadding() {
  // On wide screens the results sheet fills the left side; without it only the small search card is there.
  // On phones the top leaves room for the red pin, which stands 40 px above its point.
  return innerWidth > 760
    ? { top: 40, bottom: 40, left: $('sheet').hidden ? 40 : 430, right: 70 }
    : { top: Math.max($('trip-search').offsetHeight, $('map-search').offsetHeight) + 74, bottom: Math.max($('sheet').offsetHeight, $('place-card').offsetHeight) + 24, left: 24, right: 24 };
}

// Built once and shared; started early from the bottom of this file so the map opens faster.
let stylePromise = null;
const getMapStyle = () => stylePromise || (stylePromise = buildStyle().catch(e => { stylePromise = null; throw e; }));

// MapLibre (800 kB) and PMTiles load the first time a map is shown, not with Home; they are served from this site
// (vendor/), so the map does not depend on another CDN, and the service worker keeps them for offline use.
let mapLib = null;
function loadMapLib() {
  if (window.maplibregl && window.pmtiles) return Promise.resolve();
  if (mapLib) return mapLib;
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'vendor/maplibre-gl-4.7.1.css';
  document.head.appendChild(css);
  const script = src => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('could not load ' + src)); document.head.appendChild(s); });
  return (mapLib = Promise.all([script('vendor/maplibre-gl-4.7.1.js'), script('vendor/pmtiles-3.2.1.js')]).catch(e => { mapLib = null; throw e; }));
}

async function createMap() {
  await loadMapLib();
  const [style, badges] = await Promise.all([getMapStyle(), poiImages()]);
  const dark = isDark();
  map = new maplibregl.Map({ container: 'map', style, bounds: BD_LNGLAT, fitBoundsOptions: { padding: mapPadding() },
                             minZoom: 1.6, maxPitch: 70, attributionControl: { compact: true } });
  // Badges are registered as soon as the style is in, before the first tiles ask for them.
  map.once('styledata', () => { for (const b of badges) if (!map.hasImage(b.name)) map.addImage(b.name, b.img, { pixelRatio: 2 }); });
  // The "loading" note goes as soon as the first frame is drawn; tiles then fill in as they come, as in Google Maps.
  // After the first frame the note becomes a small pill with a spinner at the top until the first tiles are in.
  map.once('render', () => { const n = $('map-loading'); n.classList.add('pill'); n.textContent = 'ম্যাপ আসছে…'; });
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
  for (const id of ['route', 'bus', 'stops', 'walk', 'alt', 'measure']) map.addSource(id, { type: 'geojson', data: EMPTY });
  // the other roads: grey, under the chosen one; a tap on one chooses it
  map.addLayer({ id: 'alt-casing', type: 'line', source: 'alt', filter: ['!', ['get', 'walk']], layout: round, paint: { 'line-color': dark ? '#0b0f14' : '#ffffff', 'line-width': 9 } }, firstLabel);
  map.addLayer({ id: 'alt-line', type: 'line', source: 'alt', filter: ['!', ['get', 'walk']], layout: round, paint: { 'line-color': dark ? '#7d8794' : '#9aa6b2', 'line-width': 5.5 } }, firstLabel);
  map.addLayer({ id: 'alt-walk', type: 'line', source: 'alt', filter: ['get', 'walk'], layout: round, paint: { 'line-color': dark ? '#7d8794' : '#8a96a3', 'line-width': 6, 'line-dasharray': [0.1, 1.8] } }, firstLabel);
  map.on('click', 'alt-walk', e => { const f = e.features[0]; if (f) useWalk(f.properties.i); });
  map.on('click', 'alt-line', e => { const f = e.features[0]; if (f) useRoute(f.properties.i); });
  map.on('mouseenter', 'alt-line', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'alt-line', () => { map.getCanvas().style.cursor = ''; });
  map.addLayer({ id: 'walk-line', type: 'line', source: 'walk', layout: round, paint: { 'line-color': dark ? '#6ea8ff' : '#2563eb', 'line-width': 7, 'line-dasharray': [0.1, 1.8] } }, firstLabel);
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
  map.addLayer({ id: 'places2', type: 'symbol', source: 'places2', minzoom: 15,
                 layout: { 'icon-image': ['concat', 'poi-', ['get', 'kind']], 'icon-size': 1, 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
                           'icon-padding': 6,
                           // when badges crowd, these win: a hospital before a shop
                           'symbol-sort-key': ['match', ['get', 'kind'], 'health', 1, 'sight', 2, 'rail', 2, 'bus', 2, 'green', 3, 'learn', 4, 'worship', 4, 'food', 5, 'bank', 5, 'fuel', 5, 'stay', 6, 'civic', 6, 'shop', 8, 9],
                           'text-optional': true, 'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 1.05, 'text-justify': 'auto' },
                 paint: { 'text-opacity': 0 } }, firstPoi);
  NAME_LAYERS.push('places2');
  const cells = new Map(), CELL = 50;
  const classOf = kind => ((POI_KINDS.find(k => k[0] === kind) || [])[4] || [])[0] || '';
  async function morePlaces() {
    if (map.getZoom() < 15) return;
    const b = map.getBounds(), c = map.getCenter(), all = [];
    for (let y = Math.floor(b.getSouth() * CELL); y <= Math.floor(b.getNorth() * CELL); y++)
      for (let x = Math.floor(b.getWest() * CELL); x <= Math.floor(b.getEast() * CELL); x++) all.push([y, x, Math.hypot(y + 0.5 - c.lat * CELL, x + 0.5 - c.lng * CELL)]);
    // a tilted view reaches to the horizon; the cells nearest the middle are the ones close enough to read
    const keys = all.sort((p, q) => p[2] - q[2]).slice(0, 20).map(([y, x]) => y + ':' + x);
    await Promise.all(keys.filter(k => !cells.has(k)).map(k => { cells.set(k, []); return fetch('api/pois?c=' + k).then(r => r.json()).then(j => cells.set(k, j.p || [])).catch(() => cells.delete(k)); }));
    const features = [];
    // which kinds show at this distance: far out only hospitals, sights, stations and parks; then food, schools, mosques,
    // banks and the rest people look for; shops and offices once the street is close
    const z = map.getZoom();
    const SHOWN = z < 16 ? /^(health|sight|rail|bus|green)$/ : z < 17.2 ? /^(health|sight|rail|bus|green|food|learn|worship|bank|fuel|stay|civic)$/ : z < 17.8 ? /./ : /./;
    const close = z >= 17.8;
    for (const k of keys) for (const [lat, lon, kind, name, bn, cat] of cells.get(k) || []) if (SHOWN.test(kind) && (close || kind !== 'other') && (z >= 16 || kind !== 'health' || cat === 'hospital'))
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { kind, name, 'name:latin': name, ...(bn ? { 'name:bn': bn } : {}), class: classOf(kind), cat } });
    const src = map.getSource('places2');
    if (src) src.setData({ type: 'FeatureCollection', features });
  }
  map.on('moveend', morePlaces);

  // Live location: a blue dot with an accuracy ring that follows the device. MapLibre's own control does the
  // tracking; its button is hidden because ours (in .map-tools) triggers it.
  const geo = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }, trackUserLocation: true,
                                                showUserHeading: true, showAccuracyCircle: true, fitBoundsOptions: { maxZoom: 16 } });
  map.addControl(geo, 'bottom-right');
  geoCtl = geo;
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
  geo.on('geolocate', e => { quietLocate = false; myLoc = { lat: e.coords.latitude, lon: e.coords.longitude }; rememberFix(e.coords.latitude, e.coords.longitude, e.coords.accuracy); });

  // Stop names: on hover with a mouse, on tap with a finger.
  stopPopup = new maplibregl.Popup({ closeButton: false, offset: 12, className: 'stop-popup' });
  const showStop = e => stopPopup.setLngLat(e.features[0].geometry.coordinates).setText(e.features[0].properties.name).addTo(map);
  map.on('mouseenter', 'stops', e => { map.getCanvas().style.cursor = 'pointer'; showStop(e); });
  map.on('mouseleave', 'stops', () => { map.getCanvas().style.cursor = ''; stopPopup.remove(); });
  map.on('click', 'stops', showStop);

  // A tap on the map fills whichever end of the trip is still empty.
  map.on('click', async e => {
    if (typeof msClick === 'function' && msClick(e)) return;         // measuring a distance (js/mapplus.js)
    if (typeof lpGuard === 'function' && lpGuard()) return;          // the finger lifting after a long press
    if (map.queryRenderedFeatures(e.point, { layers: ['stops'] }).length) return;
    if (!dirOpen()) {
      const box = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
      const f = map.queryRenderedFeatures(box, { layers: NAME_LAYERS.filter(id => id === 'places2' || /^poi_/.test(id)).filter(id => map.getLayer(id)) })[0];
      if (f) {
        const pr = f.properties, [lon, lat] = f.geometry.coordinates;
        const kind = pr.kind || (POI_KINDS.find(k => k[4].includes(pr.class)) || POI_KINDS[POI_KINDS.length - 1])[0];
        showPlace({ lat, lon, name: labelText(pr), kind, cat: pr.cat || pr.subclass || pr.class || '' });
      } else hidePlace();
      return;
    }
    const which = !trip.from ? 'from' : !trip.to ? 'to' : null;
    if (!which) return;
    const { lat, lng } = e.lngLat;
    if (!inBangladesh(lat, lng)) { setStatus('বাংলাদেশের ভেতরে বেছে নিন।'); return; }
    const place = { lat, lon: lng, label: 'ম্যাপে বাছাই করা জায়গা' };
    setPlace(which, place);
    const name = await reverseName(lat, lng);
    if (name && trip[which] === place) { place.label = name; for (const s of searches) s.sync(); }
  });
  if (typeof mapPlusReady === 'function') mapPlusReady();          // long press, measuring, saved places (js/mapplus.js)
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

// Following the blue dot (on since the map opened) would pull the camera back to you on the next GPS update, so a
// route being shown never stayed in view. Showing a route lets go, as MapLibre itself does when you pan by hand.
let geoCtl = null;
function stopFollowing() {
  if (!geoCtl || geoCtl._watchState !== 'ACTIVE_LOCK') return;
  geoCtl._watchState = 'BACKGROUND';
  const b = geoCtl._geolocateButton;
  if (b) { b.classList.add('maplibregl-ctrl-geolocate-background'); b.classList.remove('maplibregl-ctrl-geolocate-active'); }
  geoCtl.fire(new maplibregl.Event('trackuserlocationend'));
}
// `points` are [lon, lat] pairs.
function fit(points, animate = true) {
  stopFollowing();
  const b = points.reduce((box, p) => box.extend(p), new maplibregl.LngLatBounds(points[0], points[0]));
  map.fitBounds(b, { padding: mapPadding(), animate, duration: 900, maxZoom: 16, pitch: is3D ? 60 : 0 });
}

function drawMarkers() {
  for (const w of ['from', 'to']) {
    if (markers[w]) { markers[w].remove(); markers[w] = null; }
    if (!trip[w]) continue;
    // as in Google Maps: the start a ringed dot (blue when it is where you are), the end a red pin standing on its place
    const mine = w === 'from' && /^(আমার লোকেশন|My location)$/.test(trip.from.label || '');
    const dot = el('div', 'pin ' + (w === 'from' ? 'a' + (mine ? ' me' : '') : 'b'));
    if (w === 'to') dot.innerHTML = '<svg viewBox="0 0 30 40" width="30" height="40" aria-hidden="true"><path d="M15 39c-1-6-14-15-14-24a14 14 0 0128 0c0 9-13 18-14 24z" fill="#ea4335" stroke="#b31412" stroke-width="1.2"/><circle cx="15" cy="15" r="5.2" fill="#7a0f0a"/></svg>';
    markers[w] = new maplibregl.Marker({ element: dot, anchor: w === 'to' ? 'bottom' : 'center' })
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
  const colors = ['#00875a', '#0e7c86'];        // the brand green and its teal (a second leg or line)
  const lines = paths.map((pts, n) => ({ color: colors[n % 2], coords: pts.map(p => [p.lon, p.lat]) }));
  fit(lines.flatMap(l => l.coords));
  drawLines('bus', lines);
  map.getSource('stops').setData({ type: 'FeatureCollection', features: paths.flatMap((pts, n) => pts.map(p => ({
    type: 'Feature', properties: { name: p.name, color: colors[n % 2] },
    geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }))) });
}

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

// ---- A bus, in the list under the map ----
// The map keeps only the places (where from, where to); a bus's details open beside it, in the list.
const BUS_COLORS = ['var(--brand)', 'var(--ink)'];   // a second bus in ink: one brand colour only
// Under the chosen bus: its route as a line, top to bottom in the direction you ride — where to get on, the stops on
// the way, where to get off — with the stops before and after your ride folded away (a tap opens them). A trip with
// a change shows both buses and where to change.
function openBusDetail(node, t) {
  const open = node.nextElementSibling && node.nextElementSibling.classList.contains('bus-detail');
  for (const d of node.parentNode.querySelectorAll('.bus-detail')) d.remove();
  if (open) return;
  const box = el('div', 'bus-detail');
  t.legs.forEach((l, n) => {
    const r = l.r, color = BUS_COLORS[n % 2], len = r.stops.length;
    // the route in the direction of the ride
    const i = r.stops.indexOf(l.seg[0]), j = r.stops.indexOf(l.seg[l.seg.length - 1]);
    const order = i <= j ? r.stops : [...r.stops].reverse(), on = i <= j ? i : len - 1 - i, off = i <= j ? j : len - 1 - j;
    if (n) box.appendChild(el('div', 'bd-change', `${STOPS[l.seg[0]].bn}-এ নেমে পরের বাসে উঠুন`));
    const sec = el('section', 'bd-bus');
    sec.style.setProperty('--bc', color);
    const badge = el('span', 'bd-badge'); badge.innerHTML = svg('busFront');
    const title = el('div', 'bd-title');
    title.append(Object.assign(el('b', 'no-tr'), { textContent: r.bn }), el('span', null, `${STOPS[order[0]].bn} থেকে ${STOPS[order[len - 1]].bn}`));
    const head = el('div', 'bd-head'); head.append(badge, title);
    const facts = el('div', 'bd-facts');
    for (const [v, k] of [[num(off - on), 'স্টপ পরে নামবেন'], [taka(l.fare), 'ভাড়া'], [fmtSpan(l.minFast, l.minSlow), 'সময়']]) { const f = el('div', 'bd-fact'); f.append(el('b', null, v), el('span', null, k)); facts.appendChild(f); }
    // the line: folded stops before, the ride, folded stops after
    const line = el('ol', 'bd-route');
    const stop = (id, cls, tag) => { const li = el('li', cls); li.appendChild(el('span', 'bd-name', STOPS[id].bn)); if (tag) li.appendChild(el('em', 'bd-tag', tag)); return li; };
    const fold = (ids, label) => {
      if (!ids.length) return;
      const more = el('li', 'bd-more'), btn = el('button', 'bd-more-btn');
      btn.type = 'button';
      const hidden = ids.map(id => { const li = stop(id, 'out'); li.hidden = true; return li; });
      const say = shown => { btn.replaceChildren(el('span', null, shown ? 'লুকান' : `${label} ${num(ids.length)}টি স্টপ`), Object.assign(el('i'), { innerHTML: svg('chev') })); btn.classList.toggle('open', shown); };
      say(false);
      btn.addEventListener('click', () => { const show = hidden[0].hidden; for (const li of hidden) li.hidden = !show; say(show); });
      more.appendChild(btn);
      return [more, hidden];
    };
    const before = fold(order.slice(0, on), 'আগের'), after = fold(order.slice(off + 1), 'পরের');
    if (before) line.append(...before[1], before[0]);
    order.slice(on, off + 1).forEach((id, k, ride) => line.appendChild(stop(id, 'ride' + (k === 0 ? ' on' : k === ride.length - 1 ? ' off' : ''), k === 0 ? 'এখানে উঠুন' : k === ride.length - 1 ? 'এখানে নামুন' : '')));
    if (after) line.append(after[0], ...after[1]);
    sec.append(head, facts, line);
    box.appendChild(sec);
  });
  node.after(box);
  requestAnimationFrame(() => box.classList.add('in'));
}

// The Dhaka bus ways of the trip shown (the best first) and the one drawn on the map.
let busWays = [], busAt = 0, busToken = 0;
function renderBusPane(km) {
  const pane = $('pane-bus');
  pane.replaceChildren();
  busWays = [];
  const trips = localTrips(trip.from, trip.to);
  const rule = busRule(trip.from, trip.to);
  if (trips.length) {
    const list = el('div');
    // companies that run between the same two stops are one way of going: one row, the others named in it
    const ways = [];
    for (const t of trips) {
      const k = t.legs.map(l => l.seg[0] + '>' + l.seg[l.seg.length - 1]).join('|'), w = ways.find(x => x.k === k);
      if (w) w.also.push(t); else ways.push({ k, t, also: [] });
    }
    busWays = ways.slice(0, 5).map(w => w.t);
    ways.slice(0, 5).forEach(({ t, also }, n) => {
      const first = t.legs[0], last = t.legs[t.legs.length - 1];
      const off = STOPS[last.seg[last.seg.length - 1]], walk = t.walkIn + t.walkOut;
      const names = t.legs.map(l => l.r.bn).join(' → ') + (also.length ? ` +${num(also.length)}` : '');
      // where to get on and off, door to door, and the walking in all (the stops are in the detail)
      const card = item('busF', names, `${STOPS[first.seg[0]].bn} → ${off.bn} · ${fmtSpan(t.doorLo, t.doorHi)}` + (walk >= 0.15 ? ` · ${kmText(walk)} হাঁটা` : ''), taka(t.fare), node => {
        selectOnly(node);
        openBusDetail(node, t);
        busAt = n;
        drawBusWay(t);
      });
      if (also.length) card.title = [t, ...also].map(x => x.legs.map(l => l.r.bn).join(' → ')).join(', ');
      if (n === busAt) card.classList.add('on');
      if (n === 0 && ways.length > 1) card.querySelector('.t').appendChild(el('span', 'badge g', 'সবচেয়ে ভালো'));
      if (t.legs.length > 1) card.querySelector('.t').appendChild(el('span', 'badge v', `${STOPS[last.seg[0]].bn}-এ বাস বদল`));
      else if (fareIsConfirmed(first.seg[0], first.seg[first.seg.length - 1])) card.querySelector('.t').appendChild(el('span', 'badge g', 'যাচাই করা ভাড়া'));
      list.appendChild(card);
    });
    stagger(list);
    pane.appendChild(list);
    const direct = trips.find(t => t.legs.length === 1);
    if (direct) {
      const seg = direct.legs[0].seg;
      const fix = el('button', 'text-btn');
      fix.innerHTML = svg('edit');
      fix.appendChild(document.createTextNode('সঠিক ভাড়া জানান'));
      fix.addEventListener('click', () => askFare(seg[0], seg[seg.length - 1], km));
      pane.appendChild(fix);
    }
    return;
  }

  const a = nearestDistrict(trip.from), b = nearestDistrict(trip.to);
  if (rule !== FARES.bus.intercity || a === b) {
    pane.appendChild(item('busF', 'বাস', `আনুমানিক · ${perKmText(rule.perKm)}`, taka(busFare(rule, km))));
    if (rule !== FARES.bus.intercity) pane.appendChild(el('div', 'empty', 'এই পথের বাসের নাম এখনো আমাদের কাছে নেই।'));
    return;
  }
  pane.append(...intercityRows(a, b, rule, km));
  const ops = operatorsBetween(a, b);
  if (ops.length) pane.append(el('div', 'label', 'বাস কোম্পানি'), operatorChips(a, b));
}
// Long-distance bus fares, one line each as Google lists ways of going: non-AC at BRTA's fare (or the per-km rate), AC
// as the range the companies charge; what the counters usually ask, when we know it, under each. Where they leave from
// once, above.
function intercityRows(a, b, rule, km) {
  const official = officialFare(a, b), other = a.id === 'dhaka' ? b : b.id === 'dhaka' ? a : null, f = other && MARKET_FARES[other.id];
  const base = official ? official.f51 : busFare(rule, km), [lo, hi] = FARES.bus.acRange;
  const out = [];
  if (official && official.terminal) out.push(el('div', 'label', `${official.terminal} বাস টার্মিনাল থেকে`));
  // the price people pay at the counter large, when we know it; BRTA's set fare under it
  const brta = official ? fareRange(official.f51, official.f40) : taka(base), acEst = `${taka(base * lo)}–${num(Math.ceil(base * hi))}`;
  out.push(f ? item('busF', 'নন-এসি বাস', `বিআরটিএ নির্ধারিত ${brta}`, fareRange(f[0], f[1])) : item('busF', 'নন-এসি বাস', official ? 'বিআরটিএ নির্ধারিত' : 'সরকারি হারে', brta));
  out.push(f && f.length > 2 ? item('busF', 'এসি বাস', 'কাউন্টার ভাড়া', fareRange(f[2], f[3])) : item('busF', 'এসি বাস', 'আনুমানিক', acEst));
  return out;
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

// min: the clear-road time; jamMin: with Dhaka's traffic. A ride paid by the minute is shown from one to the other.
function renderRidePane(km, min, jamMin = min) {
  const pane = $('pane-ride');
  pane.replaceChildren();
  cancelRide();
  const add = (icon, name, sub, price) => {
    pane.appendChild(item(icon, name, sub, Array.isArray(price) ? fareRange(Math.round(price[0] / 5) * 5, Math.round(price[1] / 5) * 5) : taka(price), node => { selectOnly(node); requestRide(name, Array.isArray(price) ? price[1] : price); }));
  };
  if (km <= FARES.cng.maxKm) add('cngF', 'সিএনজি', 'মিটারে · সরকারি হার', cngFare(km));
  for (const r of FARES.rides) if (km <= r.maxKm) {
    const lo = rideFare(r, km, min, trip.from), hi = rideFare(r, km, jamMin, trip.from);
    add(MODE_GLYPHS[r.id] ? r.id + 'F' : r.id, r.name, r.sub, Math.round(hi) - Math.round(lo) >= 5 ? [lo, hi] : lo);
  }
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

// Filled glyphs for the ways of going, as the map apps draw them (Material Icons, Apache License 2.0; see licenses.html).
const MODE_GLYPHS = {
  car: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
  bus: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
  train: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  // a motorbike (Material's two_wheeler) and a CNG auto-rickshaw (our own: the cabin, its windows, three wheels)
  bike: 'M20 11c-.18 0-.36.01-.53.03L17.41 9H20V6l-3.72 1.86L13.41 5H9v2h3.59l2 2H11l-4 2-2-2H0v2h4c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4l2 2h3l3.49-6.1 1.01 1.01c-.91.73-1.5 1.84-1.5 3.09 0 2.21 1.79 4 4 4s4-1.79 4-4-1.79-4-4-4zM4 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm16 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
  cng: '<path fill-rule="evenodd" d="M3.5 15.5V10C3.5 6.1 6.3 3 10.2 3h3.6c3 0 5.2 2.1 5.8 5l1.1 5.2c.1.4.3.6.3 1v1.3zM6.6 9.6V9c0-2 1.5-3.4 3.4-3.4h1.6v4zm7.4-4h.2c1.6 0 2.8 1 3.1 2.5l.4 1.5H14z"/><circle cx="7.2" cy="18.2" r="2.5"/><circle cx="17.6" cy="18.2" r="2.3"/>',
  walk: 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7'
};
const modeSvg = k => `<svg class="mg" viewBox="0 0 24 24" aria-hidden="true">${MODE_GLYPHS[k][0] === '<' ? MODE_GLYPHS[k] : `<path d="${MODE_GLYPHS[k]}"/>`}</svg>`;
// a list row's icon tile with the filled glyph
function modeIc(k) { const s = el('span', 'ic mode'); s.innerHTML = modeSvg(k); return s; }
// one way of going in the segmented row: the glyph above, the time under it; always car, bus, train, walk
const MODE_ORDER = ['car', 'bus', 'train', 'walk'];
function wayButton(k, label, time, pane) {
  const b = el('button', 'way');
  b.dataset.pane = pane; b.dataset.mode = k;
  b.title = b.ariaLabel = time ? `${label} ${time}` : label;
  b.innerHTML = modeSvg(k);
  b.appendChild(el('span', null, time || label));
  return b;
}
function placeWay(row, b) {
  const at = MODE_ORDER.indexOf(b.dataset.mode), next = [...row.children].find(x => MODE_ORDER.indexOf(x.dataset.mode) > at);
  row.insertBefore(b, next || null);
  row.style.setProperty('--n', row.children.length);
}

// A train between the two towns: its own place beside the others (the list comes later, from js/train.js).
function addTrainChip(mins) {
  const row = document.querySelector('#trip-time .ways');
  if (!row || row.querySelector('[data-pane=train]')) return;
  const b = wayButton('train', 'ট্রেন', mins ? fmtMin(mins) : '', 'train');
  b.addEventListener('click', () => { showPane('train'); for (const x of row.children) x.classList.toggle('on', x === b); });
  placeWay(row, b);
}
// on foot the map shows the dotted way on foot; every other choice shows the road
let driveLine = null, walkLine = null, driveKm = '', walkKm = '';
function showPane(name) {
  for (const b of $('seg').children) b.classList.toggle('on', b.dataset.pane === name);
  for (const p of ['walk', 'bus', 'ride', 'train']) $('pane-' + p).hidden = name !== p;
  for (const x of document.querySelectorAll('#trip-time .way')) x.classList.toggle('on', x.dataset.pane === name);
  if (driveKm) $('trip-km').textContent = name === 'walk' && walkKm ? walkKm : driveKm;   // the length of the way shown
  if (!map) return;
  if (name === 'walk' && walkLine) { clearBus(); drawLines('route', []); drawLines('walk', [{ coords: walkLine }]); showAlts(true); }
  else if (name === 'bus' && busWays.length) { drawLines('route', []); showAlts(false); drawBusWay(busWays[busAt] || busWays[0]); }
  else if (driveLine) { busToken++; clearBus(); drawLines('walk', []); if (map.getSource('route')) map.getSource('route').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: driveLine } }] }); showAlts(true); }
}
// the way on foot: how long, how far, free; from the walking route when it came, else from the road's length
function renderWalkPane(km, w) {
  const wkm = w ? w.distance / 1000 : km;
  walkKm = wkm < 1 ? distText(wkm) : `${num(wkm, 1)} কিমি`;
  const wmin = Math.max(1, Math.round(w ? Math.max(w.duration / 60, wkm / 4.8 * 60) : km / 4.5 * 60));
  const big = el('div', 'walk-big');
  big.append(el('b', null, fmtMin(wmin)), el('span', null, `হেঁটে · ${wkm < 1 ? distText(wkm) : num(wkm, 1) + ' কিমি'}`));
  $('pane-walk').replaceChildren(big, el('p', 'walk-src', w ? 'হাঁটার পথ: OpenStreetMap' : 'আনুমানিক সময়'));
  return wmin;
}

// The roads OSRM offered between the two ends (the best first) and the one the sheet is showing.
let routeChoices = [], routeAt = 0, walkMin = 0, altMarkers = [], walkChoices = [], walkAt = 0;
// minutes on foot: the walking route's own time, never quicker than 4.8 km/h
const walkTime = w => Math.max(1, Math.round(Math.max(w.duration / 60, w.distance / 1000 / 4.8 * 60)));
// One of the ways on foot: the sheet's walk pane, its chip and the dotted line follow it.
function useWalk(i, km = driveLine ? routeChoices[routeAt].distance / 1000 : 0) {
  const w = walkChoices[i];
  if (!w) return;
  walkAt = i;
  walkLine = w.geometry.coordinates;
  walkMin = renderWalkPane(km, w);
  const chip = $('trip-time').querySelector('.way[data-pane=walk] span');
  if (chip) chip.textContent = fmtMin(walkMin);
  if (!$('pane-walk').hidden) { $('trip-km').textContent = walkKm; drawLines('route', []); drawLines('walk', [{ coords: walkLine }]); showAlts(true); }
}
// A Dhaka bus way on the map, as Google draws a bus trip: dotted walks to the first stop and from the last, each bus
// in its colour along the road (OSRM through some of its stops), the stops where you get on, change and get off.
async function drawBusWay(t) {
  const token = ++busToken, colors = ['#00875a', '#0e7c86'];
  const at = id => ({ lat: STOPS[id].lat, lon: STOPS[id].lon }), ends = t.legs.map(l => [at(l.seg[0]), at(l.seg[l.seg.length - 1])]);
  const straight = l => l.seg.map(id => [STOPS[id].lon, STOPS[id].lat]);
  // first the stop-to-stop lines at once, then the roads when they come
  const paint = (legs, walks) => {
    if (token !== busToken || $('pane-bus').hidden) return;
    drawLines('bus', legs.map((coords, n) => ({ coords, color: colors[n % 2] })));
    drawLines('walk', walks.filter(Boolean).map(coords => ({ coords })));
  };
  const walkIn = t.walkIn >= 0.05 ? [[trip.from.lon, trip.from.lat], [ends[0][0].lon, ends[0][0].lat]] : null;
  const walkOut = t.walkOut >= 0.05 ? [[ends[ends.length - 1][1].lon, ends[ends.length - 1][1].lat], [trip.to.lon, trip.to.lat]] : null;
  paint(t.legs.map(straight), [walkIn, walkOut]);
  const stops = t.legs.flatMap((l, n) => [l.seg[0], l.seg[l.seg.length - 1]].map((id, k) => ({ type: 'Feature', properties: { name: STOPS[id].bn, color: colors[n % 2] }, geometry: { type: 'Point', coordinates: [STOPS[id].lon, STOPS[id].lat] } })));
  if (map.getSource('stops')) map.getSource('stops').setData({ type: 'FeatureCollection', features: stops });
  fit([[trip.from.lon, trip.from.lat], [trip.to.lon, trip.to.lat], ...t.legs.flatMap(straight)]);
  // the road a bus takes: OSRM from stop to stop. A stop just off a main road can send it round side streets, so a
  // road much longer than the stops' own line is not used: fewer stops are tried, and else the stops are joined straight.
  const chain = l => l.seg.slice(1).reduce((k, id, n) => k + haversineKm(at(l.seg[n]), at(id)), 0);
  const road = async l => {
    const pick = m => l.seg.length <= m ? l.seg : [...Array(m)].map((_, k) => l.seg[Math.round(k * (l.seg.length - 1) / (m - 1))]);
    const want = chain(l) * 1.3 + 0.3;
    for (const m of [6, 3, 2]) {
      try { const r = await getRoute(pick(m).map(at)); if (r.distance / 1000 <= want) return r.geometry.coordinates; } catch { /* the next try */ }
    }
    return straight(l);
  };
  const foot = (a, b) => getWalk(a, b).then(w => w.geometry.coordinates, () => [[a.lon, a.lat], [b.lon, b.lat]]);
  const [legs, wIn, wOut] = await Promise.all([Promise.all(t.legs.map(road)), walkIn ? foot(trip.from, ends[0][0]) : null, walkOut ? foot(ends[ends.length - 1][1], trip.to) : null]);
  paint(legs, [wIn, wOut]);
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
  saveRecent(trip.from, trip.to);
  routeChoices = [r, ...(r.alts || [])];
  walkLine = null; walkMin = 0; busAt = 0;
  useRoute(0, true);
}
// A car's time on a road: inside Dhaka from a clear road to the city's average with traffic (7 km/h, World Bank).
function carTime(r) {
  const km = r.distance / 1000, min = r.duration / 60;
  return inDhakaCity(trip.from, trip.to) ? [min, Math.max(min, km / FARES.cityKmh.dhakaMetro * 60)] : [min, min];
}
// One of the roads: the sheet, its chips and its panes follow it; the others stay grey on the map, each with its time.
function useRoute(i, first = false) {
  const key = lastKey, r = routeChoices[i];
  if (!r) return;
  routeAt = i;
  const km = r.distance / 1000, min = r.duration / 60, open = ['walk', 'bus', 'ride', 'train'].find(p => !$('pane-' + p).hidden);
  $('trip-km').textContent = km < 1 ? distText(km) : `${num(km, 1)} কিমি`;   // under a kilometre in metres ("৫০ মিটার", not "০ কিমি")
  // How long by each way of going, as Google lists them above a route. The road's length is the route's; walking
  // and bus speeds are the usual ones in Bangladesh, and the times are said to be rough. The bus chip uses the same
  // speeds as each bus below, so the two agree.
  const city = inDhakaCity(trip.from, trip.to), [busSlow, busFast] = FARES.bus.localSpeedKmh, [carLo, carHi] = carTime(r);
  const best = localTrips(trip.from, trip.to)[0];          // a Dhaka bus: its time door to door, walks and wait included
  const ways = [['car', 'গাড়িতে', city ? [carLo, carHi] : min],
    ['bus', 'বাসে', best ? [best.doorLo, best.doorHi] : city ? [km / busFast * 60, km / busSlow * 60] : km / (km < 40 ? 14 : 40) * 60],
    ...(km <= 8 ? [['walk', 'হেঁটে', walkMin || km / 4.5 * 60]] : [])];
  // close: by road, or a short walk across even where the cars go round a one-way loop
  const near = km <= 1.5 || haversineKm(trip.from, trip.to) <= 1;
  const PANE_OF = { walk: 'walk', bus: 'bus', car: 'ride' };
  const row = el('div', 'ways');
  for (const [k, label, m] of ways) {
    const b = wayButton(k, label, Array.isArray(m) ? fmtSpan(m[0], m[1]) : fmtMin(Math.max(1, Math.round(m))), PANE_OF[k]);
    b.addEventListener('click', () => { showPane(PANE_OF[k]); for (const x of row.children) x.classList.toggle('on', x === b); });
    placeWay(row, b);
  }
  $('trip-time').replaceChildren(row);                    // the ways of going are the choice; no note under them
  $('sheet').hidden = false;
  if (first && phoneSheet) phoneSheet.snap(1, false);
  if (first) $('trip-photo').replaceChildren(photoStrip(trip.to));
  clearBus();
  renderBusPane(km);
  renderRidePane(km, min, carHi);
  renderTrainPane();
  if (typeof showCommunityFares === 'function') showCommunityFares();
  // on foot: its own tab when it is a walk at all (8 km), filled in from the walking route when that comes
  const walkTab = $('seg').querySelector('[data-pane=walk]');
  walkTab.hidden = km > 8;
  if (walkTab.hidden) $('seg').hidden = $('seg').querySelectorAll('button:not([hidden])').length < 2;
  else $('seg').hidden = false;
  driveLine = r.geometry.coordinates; driveKm = $('trip-km').textContent;
  if (first) { walkKm = ''; walkChoices = []; walkAt = 0; drawLines('walk', []); if (km <= 8) renderWalkPane(km, null); }
  if (first) drawLines('route', [{ coords: r.geometry.coordinates }]);              // the road until the way on foot comes
  showPane(first ? (near ? 'walk' : 'bus') : open === 'walk' && km > 8 ? 'bus' : open || 'bus');
  if (first) fit(routeChoices.flatMap(c => c.geometry.coordinates));
  if (first && km <= 8) getWalk(trip.from, trip.to).then(w => {
    if (key !== lastKey) return;
    walkChoices = [w, ...(w.alts || [])];
    useWalk(0, km);
    if (!$('pane-walk').hidden) fit(walkChoices.flatMap(c => c.geometry.coordinates));
  }).catch(() => { if (key === lastKey && !$('pane-walk').hidden) drawLines('route', [{ coords: driveLine }]); });
}
// The other roads, grey under the chosen one, and a bubble with each road's time where it runs apart from the rest
// (as Google Maps shows them); a tap on either chooses that road.
function showAlts(on) {
  for (const m of altMarkers) m.remove();
  altMarkers = [];
  const src = map && map.getSource('alt');
  if (!src) return;
  // on foot: the other ways on foot (dotted); otherwise the other roads
  const walking = !$('pane-walk').hidden, list = walking ? walkChoices : routeChoices, at = walking ? walkAt : routeAt;
  const others = on ? list.map((c, i) => [c, i]).filter(([, i]) => i !== at) : [];
  src.setData({ type: 'FeatureCollection', features: others.map(([c, i]) => ({ type: 'Feature', properties: { i, walk: walking }, geometry: c.geometry })) });
  if (!on || list.length < 2) return;
  const sample = c => { const g = c.geometry.coordinates, n = Math.max(1, Math.floor(g.length / 60)); return g.filter((_, k) => k % n === 0); };
  const pts = list.map(sample);
  list.forEach((c, i) => {
    // the point of this road farthest from every other road
    let best = pts[i][Math.floor(pts[i].length / 2)], far = -1;
    for (const p of pts[i].slice(2, -2)) {
      const d = Math.min(...pts.filter((_, j) => j !== i).map(o => Math.min(...o.map(q => Math.hypot(q[0] - p[0], q[1] - p[1])))));
      if (d > far) { far = d; best = p; }
    }
    // in Dhaka every road gets the same traffic range, so the length is what tells them apart there
    const [lo, hi] = carTime(c), len = c.distance < 1000 ? distText(c.distance / 1000) : `${num(c.distance / 1000, 1)} কিমি`, b = el('button', 'rt-bubble' + (i === at ? ' on' : '') + (walking ? ' walk' : ''));
    if (walking) b.append(el('b', null, fmtMin(walkTime(c))), el('span', null, len));
    else if (inDhakaCity(trip.from, trip.to)) b.append(el('b', null, len), el('span', null, `${fmtMin(c.duration / 60)} জ্যাম ছাড়া`));
    else b.append(el('b', null, fmtSpan(lo, hi)), el('span', null, len));
    b.addEventListener('click', e => { e.stopPropagation(); if (i !== at) (walking ? useWalk(i) : useRoute(i)); });
    altMarkers.push(new maplibregl.Marker({ element: b, anchor: 'bottom' }).setLngLat(best).addTo(map));
  });
}

// On a phone the results sheet can be pulled up to read everything, or down to see the map.
const phoneSheet = matchMedia('(max-width: 760px)').matches ? (() => {
  let at = 1;
  const s = dragSheet($('sheet'), $('sheet-grip'), { snaps: [.2, .34, .88], onTap: () => { at = at === 1 ? 2 : 1; s.snap(at); } });
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
  drawLines('walk', []);
  driveLine = walkLine = null; driveKm = walkKm = '';
  routeChoices = []; walkChoices = []; busWays = []; busToken++; showAlts(false);
  clearBus();
  drawMarkers();
  fit(BD_LNGLAT);
}

// Opening the map with nothing chosen shows where you are, the way a maps app does. Asked once per visit:
// if the browser's permission prompt is turned down, the map simply stays on Bangladesh.
let locateMe = () => {}, locatedOnce = false, quietLocate = false;
enter.trip = async () => {
  if (trip.from || trip.to || pendingPath) $('page-trip').classList.add('dir-on');
  if (trip.from && trip.to) getRoute([trip.from, trip.to]).catch(() => {});      // the road, while the map is made
  try { await ensureMap(); } catch { return; }
  if (current !== 'trip') return;
  drawMarkers();
  if (!locatedOnce && !pendingPath && !trip.from && !trip.to && navigator.geolocation) { locatedOnce = true; locateMe(); }
  if (pendingPath) {
    showPathOnMap(pendingPath);
    pendingPath = null;
  } else if (trip.from && trip.to) {
    calculate();
  } else if (trip.from || trip.to) {
    const p = trip.from || trip.to;
    map.easeTo({ center: [p.lon, p.lat], zoom: 14, duration: 800 });
    setStatus(trip.to ? 'কোথা থেকে যাবেন লিখুন, অথবা ম্যাপে চাপ দিয়ে বেছে নিন।' : 'কোথায় যাবেন লিখুন, অথবা ম্যাপে চাপ দিয়ে বেছে নিন।');
  }
};
$('reset').addEventListener('click', clearTrip);

// ---- Search on the map, as Google Maps has it: one box; a place's card with its distance; directions on a button ----
let myLoc = null;
const KIND_BN = { food: 'খাবার', shop: 'দোকান', health: 'হাসপাতাল ও স্বাস্থ্য', stay: 'হোটেল', learn: 'স্কুল ও কলেজ', green: 'পার্ক ও খেলাধুলা', bus: 'বাস', rail: 'ট্রেন',
  worship: 'মসজিদ ও উপাসনালয়', bank: 'ব্যাংক ও এটিএম', fuel: 'পেট্রল পাম্প', civic: 'সরকারি অফিস', sight: 'দর্শনীয় স্থান', other: 'জায়গা' };
const CHIPS = [['food', 'রেস্টুরেন্ট'], ['learn', 'স্কুল'], ['health', 'হাসপাতাল'], ['bank', 'ব্যাংক ও এটিএম'], ['fuel', 'পেট্রল পাম্প'], ['stay', 'হোটেল'], ['worship', 'মসজিদ'], ['shop', 'দোকান']];
const dirOpen = () => $('page-trip').classList.contains('dir-on');
function openDirections(on) {
  $('page-trip').classList.toggle('dir-on', on);
  if (!on) return;
  hidePlace();
  setTimeout(() => { const i = $('trip-search').querySelector(trip.from ? 'input[data-w=to]' : 'input[data-w=from]'); if (i && !(trip.from && trip.to)) i.focus(); }, 60);
}
const bnDigits = v => LANG === 'en' ? String(v) : String(v).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
const kmText = km => km < 1 ? `${bnDigits(Math.round(km * 100) * 10)} মিটার` : `${bnDigits(km < 10 ? km.toFixed(1) : Math.round(km))} কিমি`;
let placeMarker = null;
function hidePlace() { $('place-card').hidden = true; if (placeMarker) { placeMarker.remove(); placeMarker = null; } }
function showPlace(pl) {
  const card = $('place-card');
  const k = POI_KINDS.find(x => x[0] === pl.kind) || POI_KINDS[POI_KINDS.length - 1];
  if (placeMarker) placeMarker.remove();
  const pinEl = el('div', 'sel-pin'); pinEl.appendChild(el('i'));
  placeMarker = new maplibregl.Marker({ element: pinEl, anchor: 'bottom' }).setLngLat([pl.lon, pl.lat]).addTo(map);
  const km = myLoc ? haversineKm(myLoc, pl) : null;
  const head = el('div', 'pc-head');
  const badge = el('span', 'pc-badge'); badge.style.background = k[1]; badge.innerHTML = k[3].raw ? `<svg viewBox="0 0 24 24">${k[3].raw}</svg>` : `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${k[3]}</svg>`;
  const t = el('div', 'pc-t'); t.append(el('b', 'no-tr', pl.name || 'বাছাই করা জায়গা'), el('span', null, [KIND_BN[pl.kind] || '', (KIND_BN[pl.kind] || '').includes(pl.sub || ' ') ? '' : pl.sub || ''].filter(Boolean).join(' · ')));
  const x = el('button', 'icon-btn pc-x'); x.innerHTML = svg('close'); x.setAttribute('aria-label', 'বন্ধ করুন'); x.addEventListener('click', hidePlace);
  head.append(badge, t, x);
  const dist = el('p', 'pc-dist');
  if (km != null) dist.textContent = `আপনার থেকে সোজা ${kmText(km)}`;
  else { const b = el('button', 'pc-link', 'আপনার থেকে কত দূর দেখতে লোকেশন চালু করুন'); b.addEventListener('click', () => { locateMe(); const w = setInterval(() => { if (myLoc) { clearInterval(w); showPlace(pl); } }, 500); setTimeout(() => clearInterval(w), 15000); }); dist.appendChild(b); }
  const acts = el('div', 'pc-acts');
  const go = el('button', 'btn pc-go'); go.append(ic('route'), el('span', null, 'দিকনির্দেশ'));
  go.addEventListener('click', () => {
    const to = { lat: pl.lat, lon: pl.lon, label: pl.name || 'বাছাই করা জায়গা' };
    hidePlace(); openDirections(true);
    if (myLoc) { trip.from = { lat: myLoc.lat, lon: myLoc.lon, label: 'আমার লোকেশন' }; }
    setPlace('to', to);
  });
  const from = el('button', 'btn quiet'); from.title = from.ariaLabel = 'এখান থেকে'; from.append(ic('pin'), el('span', null, 'এখান থেকে'));
  from.addEventListener('click', () => { hidePlace(); openDirections(true); setPlace('from', { lat: pl.lat, lon: pl.lon, label: pl.name || 'বাছাই করা জায়গা' }); });
  // the place as a link, for WhatsApp or Messenger (js/locshare.js)
  const sh = el('button', 'btn quiet pc-share'); sh.innerHTML = svg('share'); sh.setAttribute('aria-label', 'শেয়ার'); sh.title = 'শেয়ার';
  sh.addEventListener('click', () => lsSharePlace({ lat: pl.lat, lon: pl.lon, label: pl.name || 'বাছাই করা জায়গা' }));
  acts.append(go, from, sh);
  card.replaceChildren(head, dist, acts);
  if (typeof placeExtras === 'function') placeExtras(pl, card, acts);     // save; hours, phone, website; a pin's coordinates (js/mapplus.js)
  card.hidden = false;
  map.easeTo({ center: [pl.lon, pl.lat], zoom: Math.max(map.getZoom(), 16.2), duration: 700, padding: mapPadding() });
}
(function initMapSearch() {
  const input = $('ms-input'), sug = $('ms-sug'), clear = $('ms-clear');
  let timer = null, seq = 0;
  // where to look first: you, or the part of the map you are looking at; with the whole country on screen (or no map yet),
  // Dhaka — where most searches are — rather than the middle of the country
  const here = () => myLoc || (map && map.getZoom() >= 9 ? { lat: map.getCenter().lat, lon: map.getCenter().lng } : { lat: 23.81, lon: 90.41 });
  const shown = [];
  const item = (pl, icon) => {
    if (typeof placeTwin === 'function' && shown.some(s => placeTwin(s, pl))) return;     // the same place from another source (js/mapplus.js)
    shown.push(pl);
    const k = POI_KINDS.find(x => x[0] === pl.kind);
    const row = el('div', 'sug');
    const t = el('div', 't'); t.append(el('b', 'no-tr', pl.name), el('span', null, [pl.km != null ? kmText(pl.km) : '', KIND_BN[pl.kind] || pl.sub || ''].filter(Boolean).join(' · ')));
    const i = ic(icon || 'pin'); if (k) i.style.color = k[1];
    row.append(i, t);
    row.addEventListener('mousedown', e => { e.preventDefault(); sug.hidden = true; if (typeof svPick === 'function' && svPick(pl)) { input.blur(); return; } input.value = pl.name; clear.hidden = false; input.blur(); showPlace(pl); });
    sug.appendChild(row);
  };
  async function run() {
    const q = input.value.trim(), mine = ++seq;
    clear.hidden = !q;
    if (q.length < 2) { if (!q && document.activeElement === input && typeof svSuggest === 'function') svSuggest(sug); else sug.hidden = true; return; }
    const h = here();
    const [ours, local] = await Promise.all([
      fetch(`api/pois/search?q=${encodeURIComponent(q)}&lat=${h.lat}&lon=${h.lon}`).then(r => r.json()).then(j => j.results).catch(() => []),
      Promise.resolve(searchLocal(q))
    ]);
    if (mine !== seq) return;
    sug.replaceChildren(); shown.length = 0;
    // An area, a bus stop or a district that matches what was typed comes before shops and offices with the word in
    // their name (Jatrabari before 'Jatra Bangladesh Ltd'), as in Google Maps; then the rest.
    const top = local.filter(pl => pl.area && pl.score >= 2).slice(0, 3), rest = local.filter(pl => !top.includes(pl));
    // the app's own places say what they are in words ("হাসপাতাল"); the card's badge wants the kind
    const kindOf = sub => (Object.entries({ health: /হাসপাতাল|ক্লিনিক|মেডিকেল/, learn: /বিশ্ববিদ্যালয়|কলেজ|স্কুল/, worship: /মসজিদ|মন্দির|গির্জা/, sight: /দর্শনীয়|জাদুঘর|স্মৃতি/, green: /পার্ক|উদ্যান/, rail: /স্টেশন|রেল/, shop: /মার্কেট|শপিং|বাজার/, stay: /হোটেল/ })
      .find(([, re]) => re.test(sub || '')) || [])[0];
    for (const pl of top) item({ lat: pl.lat, lon: pl.lon, name: pl.title, sub: pl.sub, kind: kindOf(pl.sub) }, pl.icon);
    for (const pl of ours) item({ ...pl, name: LANG !== 'en' && pl.bn ? pl.bn : pl.name }, 'pin');
    for (const pl of rest.slice(0, Math.max(0, 4 - top.length))) item({ lat: pl.lat, lon: pl.lon, name: pl.title, sub: pl.sub, kind: kindOf(pl.sub) }, pl.icon);
    sug.hidden = !sug.children.length;
    // places OpenStreetMap knows (areas, roads, landmarks) after a pause
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const online = await searchOnline(q).catch(() => []);
      if (mine !== seq || document.activeElement !== input) return;
      for (const pl of online.slice(0, 4)) item({ lat: pl.lat, lon: pl.lon, name: pl.title, sub: pl.sub }, 'pin');
      if (!sug.children.length) sug.appendChild(el('div', 'empty', 'কিছু পাওয়া যায়নি — অন্য বানানে লিখে দেখুন।'));
      sug.hidden = false;
    }, 500);
  }
  let typing = null;
  input.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(run, 220); });
  input.addEventListener('focus', () => { const q = input.value.trim(); if (q.length >= 2 || !q) run(); });
  input.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 150));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = sug.querySelector('.sug'); if (f) f.dispatchEvent(new MouseEvent('mousedown', { cancelable: true })); } });
  clear.addEventListener('click', () => { input.value = ''; clear.hidden = true; sug.hidden = true; hidePlace(); input.focus(); });
  $('ms-dir').addEventListener('click', () => openDirections(true));
  // the directions panel gets a way back to the single box
  const back = el('button', 'icon-btn dir-back'); back.innerHTML = svg('back'); back.setAttribute('aria-label', 'ফিরে যান');
  back.addEventListener('click', () => { openDirections(false); if (trip.from || trip.to) clearTrip(); });
  $('trip-search').prepend(back);
  // nearby, by kind
  const chips = $('ms-chips');
  for (const [kind, label] of CHIPS) {
    const k = POI_KINDS.find(x => x[0] === kind);
    const c = el('button', 'ms-chip'); const dot = el('i'); dot.style.background = k[1]; c.append(dot, el('span', null, label));
    c.addEventListener('click', async () => {
      const h = here();
      const res = await fetch(`api/pois/near?kind=${kind}&lat=${h.lat}&lon=${h.lon}`).then(r => r.json()).then(j => j.results).catch(() => []);
      sug.replaceChildren(el('div', 'sug-head', `কাছের ${label}`)); shown.length = 0;
      for (const pl of res) item({ ...pl, name: LANG !== 'en' && pl.bn ? pl.bn : pl.name }, 'pin');
      if (!res.length) sug.appendChild(el('div', 'empty', 'কাছে কিছু পাওয়া যায়নি।'));
      sug.hidden = false;
      if (res.length && map) { const b = res.slice(0, 10).reduce((bx, pl) => bx.extend([pl.lon, pl.lat]), new maplibregl.LngLatBounds([h.lon, h.lat], [h.lon, h.lat])); map.fitBounds(b, { padding: mapPadding(), maxZoom: 16, duration: 800 }); }
      const away = e => { if (!sug.contains(e.target) && !chips.contains(e.target)) { sug.hidden = true; document.removeEventListener('pointerdown', away); } };
      setTimeout(() => document.addEventListener('pointerdown', away), 0);
    });
    chips.appendChild(c);
  }
})();
for (const b of $('seg').children) b.addEventListener('click', () => showPane(b.dataset.pane));

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
    const way = (mode, label, time) => { const f = el('span', 'rx-way'); f.innerHTML = modeSvg(mode); f.title = label; f.appendChild(el('span', null, time)); return f; };
    facts.append(fact('route', `${num(km, 1)} কিমি`), way('car', 'গাড়িতে, ফাঁকা রাস্তায়', fmtMin(r.duration / 60)), way('bus', 'বাসে, প্রায়', fmtMin(km / 40 * 60)));
    titles.append(route, facts);
    head.appendChild(titles);
    const btn = button('route', 'ম্যাপে দেখুন', () => { trip.from = asPlace(a); setPlace('to', asPlace(b)); });
    btn.classList.add('rx-go');
    const actions = el('div', 'actions');
    actions.appendChild(btn);
    const fares = el('div', 'rx-fares');
    fares.append(...intercityRows(a, b, busRule(a, b), km));
    // where the buses leave from, with a pin, above the fares
    const leaves = fares.querySelector('.label');
    if (leaves) { leaves.classList.add('rx-from'); leaves.prepend(ic('pin')); }
    const group = el('div', 'rx-group');
    group.append(...[...fares.children].filter(n => n !== leaves));
    fares.replaceChildren(...(leaves ? [leaves] : []), group);
    box.append(head, fares);
    box.append(el('div', 'label rx-label', 'এই রুটের বাস'), operatorChips(a, b), actions);
    stagger(box);
  }

  from.addEventListener('change', update);
  to.addEventListener('change', update);
  $('ic-swap').addEventListener('click', () => { [from.value, to.value] = [to.value, from.value]; update(); });

  const grid = $('op-grid'), more = $('op-more'), filter = $('op-filter');
  let showAll = false;
  const opRow = o => {
    const row = el('div', 'op-row');
    const main = el('button', 'op-main'); main.type = 'button';
    const badge = el('span', 'op-ic'); badge.innerHTML = modeSvg('bus');
    const t = el('span', 't'), sub = el('span', 'op-sub');
    t.append(el('b', null, o.bn), sub);
    sub.appendChild(el('span', null, `ঢাকা থেকে ${num(o.districts.length - 1)} জেলায়`));
    sub.appendChild(el('span', null, o.ac && o.nonAc ? 'এসি ও নন-এসি' : o.ac ? 'এসি' : 'নন-এসি'));
    const score = ratingText('bus:' + o.en);
    if (score) sub.appendChild(el('span', 'op-score', score));
    const chev = el('i', 'op-chev'); chev.innerHTML = svg('chev');
    main.append(badge, t, chev);
    const detail = el('div', 'op-detail');
    main.addEventListener('click', () => {
      const open = row.classList.toggle('open');
      if (open && !detail.children.length) detail.append(el('div', 'op-where', o.districts.slice(1).map(id => districtById(id).bn).join(' · ')), ratingStars('bus:' + o.en));
    });
    row.append(main, detail);
    return row;
  };
  function drawOps() {
    const q = filter.value.trim(), low = q.toLowerCase();
    const list = OPERATORS.filter(o => !q || o.bn.includes(q) || (o.en || '').toLowerCase().includes(low) || o.districts.some(id => { const d = districtById(id); return d && (d.bn.includes(q) || d.en.toLowerCase().includes(low)); }))
      .sort((x, y) => (ratingScore('bus:' + y.en) || 0) - (ratingScore('bus:' + x.en) || 0) || y.districts.length - x.districts.length);
    const shown = q || showAll ? list : list.slice(0, 8);
    grid.replaceChildren(...shown.map(opRow));
    if (!list.length) grid.appendChild(el('div', 'empty', 'এই নামে কোনো কোম্পানি নেই।'));
    more.hidden = !!q || showAll || list.length <= 8;
    more.replaceChildren(el('span', null, `সব ${num(list.length)}টি কোম্পানি দেখুন`), Object.assign(el('i'), { innerHTML: svg('chev') }));
    grid.appendChild(more);                        // the list's last row (hidden when everything is shown)
  }
  filter.addEventListener('input', drawOps);
  more.addEventListener('click', () => { showAll = true; drawOps(); });
  opsRefresh = drawOps;
  drawOps();

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
  const MINE = 'আমার লোকেশন';
  const isMine = () => !!center && center.label === MINE;
  // by road when the road distance came (OSRM), else the straight line, said as such
  const howFar = p => p.road ? distText(p.km) : `সোজা ${distText(p.km)}`;
  const input = $('near-input'), note = $('near-note'), list = $('near-list');

  // open now, from the hours OpenStreetMap has (js/mapplus.js reads them)
  const openState = p => (p.x.hours && typeof pdParse === 'function' && pdParse(p.x.hours)) ? pdState(pdParse(p.x.hours)) : null;
  function nearRow(p) {
    const r = el('div', 'nb-row');
    const main = el('button', 'nb-main'); main.type = 'button';
    const k = POI_KINDS.find(x => x[0] === NEAR_KIND[cat.tag]);
    const badge = el('span', 'nb-ic'); badge.innerHTML = svg(cat.icon); if (k) badge.style.setProperty('--c', k[1]);
    const t = el('span', 't');
    t.appendChild(el('b', 'no-tr', p.title));
    const st = openState(p);
    const line = el('span', 'nb-sub');
    line.appendChild(el('span', 'nb-km', howFar(p)));
    if (st) line.appendChild(el('span', st.open ? 'pd-open' : 'pd-shut', st.open ? (p.x.hours === '24/7' ? '২৪ ঘণ্টা খোলা' : 'খোলা') : 'বন্ধ'));
    // the rest of what is known, except what the row already says (the phone is its button, the hours its open/closed)
    for (const f of [ratingText(placeKey(p)), ...facts(p).filter(f => f !== 'ফোন আছে' && f !== '২৪ ঘণ্টা খোলা')].filter(Boolean)) line.appendChild(el('span', null, f));
    t.appendChild(line);
    main.append(badge, t);
    main.addEventListener('click', () => openPlace(p));
    r.appendChild(main);
    if (p.x.ph) {
      const call = Object.assign(el('a', 'nb-call'), { href: 'tel:' + p.x.ph.replace(/[^+\d]/g, '') });
      call.innerHTML = svg('phone'); call.title = call.ariaLabel = 'কল করুন · ' + p.x.ph;
      r.appendChild(call);
    }
    return r;
  }
  // the map's colour for each kind, so a row's badge matches the place's badge on the map
  const NEAR_KIND = { 'amenity:hospital': 'health', 'amenity:pharmacy': 'health', 'amenity:police': 'civic', 'amenity:bus_station': 'bus', 'railway:station': 'rail',
    'amenity:fuel': 'fuel', 'amenity:atm': 'bank', 'amenity:bank': 'bank', 'leisure:park': 'green', 'tourism:attraction': 'sight', 'tourism:hotel': 'stay',
    'amenity:restaurant': 'food', 'amenity:marketplace': 'shop', 'amenity:place_of_worship': 'worship', 'amenity:school': 'learn', 'amenity:college': 'learn',
    'amenity:university': 'learn', 'amenity:fire_station': 'civic' };
  // Facts OpenStreetMap holds about a place, as short labels.
  const facts = p => [p.x.kind, p.x.em && 'জরুরি বিভাগ', p.x.gov && 'সরকারি', p.x.pvt && 'বেসরকারি', p.x.beds && `${num(p.x.beds)} শয্যা`,
                      p.x.hours === '24/7' && '২৪ ঘণ্টা খোলা', p.x.ph && 'ফোন আছে'].filter(Boolean);

  function openPlace(p) {
    const shots = el('div', 'pc-photos');
    if (typeof pdPhotos === 'function') { const pl = { lat: p.lat, lon: p.lon, name: p.title }; pdPhotos(pl, pdFetch(pl).catch(() => null)).then(l => pdStrip(shots, l, pl)).catch(() => {}); }
    const body = [shots];
    const st = openState(p);
    if (st) body.push(el('div', 'nb-open ' + (st.open ? 'pd-open' : 'pd-shut'), st.text));
    const f = facts(p);
    if (f.length || p.sub) {
      const chips = el('div', 'chips');
      if (p.sub) chips.appendChild(el('div', 'chip', p.sub));
      chips.append(...f.filter(t => t !== 'ফোন আছে').map(t => el('div', 'chip', t)));
      body.push(chips);
    }
    if (p.x.hours && p.x.hours !== '24/7' && !st) body.push(el('div', 'label', 'খোলা থাকে'), el('div', 'empty no-tr', p.x.hours));
    body.push(el('div', 'label', 'রেটিং দিন'), ratingStars(placeKey(p), draw));
    if (!RATINGS_ONLINE) body.push(el('div', 'empty', 'সার্ভার ছাড়া চলছে — রেটিং শুধু এই ডিভাইসে থাকছে।'));
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
    openModal(p.title, `${cat.bn} · ${isMine() ? '' : tr(center.label) + ' থেকে '}${p.road ? 'রাস্তায় ' : ''}${howFar(p)}${p.road && p.road.min >= 1 ? ` · গাড়িতে ~${fmtMin(p.road.min)}` : ''}`, body, actions);
  }

  function draw() {
    list.replaceChildren();
    const rated = found.some(p => ratingScore(placeKey(p)));
    $('near-sort').hidden = !rated;
    const rows = byRating && rated
      ? [...found].sort((a, b) => ratingScore(placeKey(b)) - ratingScore(placeKey(a)) || a.km - b.km)
      : found;
    for (const p of rows.slice(0, 48)) list.appendChild(nearRow(p));
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
    const count = () => { note.textContent = `${num(found.length)}টি ${cat.bn}` + (isMine() ? ' · আপনার কাছে' : ` · ${tr(center.label)} থেকে দূরত্ব`); };
    try { found = await searchNearby(center, cat.tag, more => { if (mine === seq && more.length >= found.length) { found = more; count(); draw(); } }); }
    catch {
      if (mine === seq) { found = []; list.replaceChildren(); note.textContent = 'খোঁজা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।'; }
      return;
    }
    if (mine !== seq) return;
    list.replaceChildren();
    $('near-sort').hidden = true;
    if (!found.length) { note.textContent = `${center.label}-এর ৩০ কিমির মধ্যে কোনো ${cat.bn} ম্যাপে পাওয়া যায়নি।`; return; }
    const said = () => `${num(found.length)}টি ${cat.bn}` + (isMine() ? ' · আপনার কাছে' : ` · ${tr(center.label)} থেকে দূরত্ব`);
    note.textContent = said();
    draw();
    // every place by road, forty at a time (the most the road server takes in one question): a place left with its
    // straight-line distance would sort ahead of nearer ones whose road is longer than the line
    const near = found.slice(0, 80), from = center, parts = [];
    for (let i = 0; i < near.length; i += 40) parts.push(near.slice(i, i + 40));
    const roads = (await Promise.all(parts.map(part => roadDistances(from, part)))).flat();
    if (mine !== seq) return;
    near.forEach((p, i) => { if (roads[i]) { p.road = roads[i]; p.km = roads[i].km; } });
    found.sort((a, b) => a.km - b.km);
    note.textContent = said();
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
    note.textContent = 'লোকেশন খোঁজা হচ্ছে…';
    getLocation({ maxAge: 60_000 }).then(f => setCenter({ lat: f.lat, lon: f.lon, label: MINE }), e => { note.textContent = locationError(e); });
  });

  // First visit: around you, as Google's "nearby" is, when the location is already allowed (or known from a few
  // minutes ago); otherwise from the trip's destination or start, or Dhaka, saying so.
  enter.nearby = async () => {
    if (center) return;
    let allowed = !!(LAST_FIX && Date.now() - LAST_FIX.at < 15 * 60_000);
    if (!allowed) try { allowed = (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted'; } catch { /* not supported */ }
    if (allowed) {
      note.textContent = 'আপনার অবস্থান নেওয়া হচ্ছে…';
      try { const f = await getLocation({ maxAge: 15 * 60_000 }); if (!center) setCenter({ lat: f.lat, lon: f.lon, label: MINE }); return; } catch { /* fall back below */ }
    }
    if (!center) setCenter(trip.to || trip.from || asPlace(districtById('dhaka')));
  };
})();

// ---- Fares ----
(function initFares() {
  const { bus, cng, rides } = FARES;
  const range = $('calc-range'), list = $('calc-tiles');
  const AVG_KMH = 25;   // assumed ride speed, only to estimate the per-minute part of a ride fare
  // The slider runs 1 to 500 km on a curve: most trips are short, so the first half of the bar is the first 25 km.
  const kmOf = v => Math.max(1, Math.round(Math.exp(Math.log(500) * v / 1000)));
  const posOf = km => Math.round(Math.log(km) / Math.log(500) * 1000);
  // a city bus charges in steps of ৳5, rounded down (FARES.bus.roundTo), as every bus fare in the app; never below the least
  const cityBus = km => Math.max(bus.metro.min, Math.floor(km * bus.metro.perKm / bus.roundTo) * bus.roundTo);
  // One way of going: its price, and under it, on a tap, how the price is made (every part with its rate)
  const open = new Set();
  const row = (mode, name, price, note, why) => {
    const wrap = el('div', 'fx-item' + (open.has(name) ? ' open' : ''));
    const r = el('button', 'fx-row');
    r.type = 'button';
    r.innerHTML = modeSvg(mode);
    const t = el('div', 't'); t.appendChild(el('b', null, name)); if (note) t.appendChild(el('span', null, note));
    const chev = el('i', 'fx-chev'); chev.innerHTML = svg('chev');
    r.append(t, el('div', 'p', price), chev);
    const box = el('div', 'fx-why');
    for (const [a, b, strong] of why) { const l = el('div', 'fx-line' + (strong ? ' sum' : '')); l.append(el('span', null, a), el('b', null, b)); box.appendChild(l); }
    r.addEventListener('click', () => { const on = !wrap.classList.contains('open'); wrap.classList.toggle('open', on); if (on) open.add(name); else open.delete(name); });
    wrap.append(r, box);
    return wrap;
  };
  const money = v => rateText(Math.round(v * 100) / 100);
  function update(km) {
    // whole minutes, the same in the working as in the fare, so the parts add up to what is shown
    const min = Math.max(1, Math.round(km / AVG_KMH * 60));
    $('calc-km').textContent = num(km);
    for (const c of $('calc-presets').children) c.classList.toggle('on', +c.dataset.km === km);
    const rows = [];
    // the city bus and the CNG only inside a city (40 km); a long-distance bus from 40 km (BRTA's shortest chart route is 42)
    if (km <= cng.maxKm) {
      const raw = km * bus.metro.perKm, fare = cityBus(km);
      rows.push(row('bus', 'শহরের বাস', taka(fare), '', [[`${num(km)} কিমি × ${rateText(bus.metro.perKm)}`, money(raw)],
        raw < bus.metro.min ? ['সর্বনিম্ন ভাড়া', taka(bus.metro.min)] : ['৫ টাকার ধাপে, নিচের দিকে', taka(fare)], ['ভাড়া', taka(fare), true]]));
    }
    if (km >= 40) rows.push(row('bus', 'দূরপাল্লার বাস', taka(busFare(bus.intercity, km)), 'নন-এসি',
      [[`${num(km)} কিমি × ${rateText(bus.intercity.perKm)}`, money(km * bus.intercity.perKm)], ['ভাড়া', taka(busFare(bus.intercity, km)), true]]));
    if (km <= cng.maxKm) rows.push(row('cng', 'সিএনজি', taka(cngFare(km)), 'মিটারে', [[`প্রথম ${num(cng.baseKm)} কিমি পর্যন্ত`, taka(cng.base)],
      ...(km > cng.baseKm ? [[`বাকি ${num(km - cng.baseKm)} কিমি × ${taka(cng.perKm)}`, taka((km - cng.baseKm) * cng.perKm)]] : []),
      ['জ্যামে থেমে থাকলে মিনিটে', taka(cng.waitPerMin)], ['ভাড়া, না থেমে', taka(cngFare(km)), true]]));
    for (const r of rides) if (km <= r.maxKm) {
      const sum = r.base + km * r.perKm + min * r.perMin, fare = rideFare(r, km, min);
      rows.push(row(r.id, r.name, taka(fare), 'সাধারণ সময়ে', [['শুরুতে', taka(r.base)], [`${num(km)} কিমি × ${taka(r.perKm)}`, taka(km * r.perKm)],
        [`প্রায় ${num(min)} মিনিট × ${rateText(r.perMin)}`, money(min * r.perMin)], ...(sum < r.min ? [['সর্বনিম্ন ভাড়া', taka(r.min)]] : []), ['ভাড়া', taka(fare), true]]));
    }
    list.replaceChildren(...rows);
  }
  range.addEventListener('input', () => update(kmOf(+range.value)));
  for (const km of [3, 10, 25, 60, 150, 300]) {
    const c = el('button', 'fx-chip', `${num(km)} কিমি`);
    c.dataset.km = km;
    c.addEventListener('click', () => { range.value = posOf(km); update(km); });
    $('calc-presets').appendChild(c);
  }
  range.value = posOf(10);
  update(10);

  // the government's rates, as an inset list: each mode's own rows under its name
  const rate = r => `${rateText(r)}/কিমি`;
  const groups = [
    ['bus', 'বাস · নন-এসি', [
      ['ঢাকা ও চট্টগ্রাম শহরে', rate(bus.metro.perKm)],
      ['শহরের মিনিবাস', rate(bus.minibus.perKm)],
      ['ঢাকার আশপাশের জেলায়', rate(bus.dtca.perKm)],
      ['দূরপাল্লায়', rate(bus.intercity.perKm)],
      ['শহরে সর্বনিম্ন ভাড়া', taka(bus.metro.min)]
    ]],
    ['cng', 'সিএনজি', [
      [`প্রথম ${num(cng.baseKm)} কিমি`, taka(cng.base)],
      ['এরপর প্রতি কিমি', taka(cng.perKm)],
      ['অপেক্ষা, প্রতি মিনিট', taka(cng.waitPerMin)]
    ]],
    ...rides.map(r => [r.id, `${r.name} · রাইড`, [['শুরুতে', taka(r.base)], ['প্রতি কিমি', taka(r.perKm)], ['প্রতি মিনিট', rateText(r.perMin)], ['সর্বনিম্ন ভাড়া', taka(r.min)]]])
  ];
  for (const [mode, title, rows] of groups) {
    const card = el('div', 'card fx-group');
    const h = el('div', 'fx-gh'); h.innerHTML = modeSvg(mode); h.appendChild(el('b', null, title));
    card.appendChild(h);
    for (const [a, b] of rows) { const r = el('div', 'fx-rate'); r.append(el('span', null, a), el('b', null, b)); card.appendChild(r); }
    $('rules').appendChild(card);
  }
  $('rules-foot').textContent = `বাস আর সিএনজি: সরকারি হার, ${FARES.effective} থেকে। রাইড: পাঠাও (২০২২) আর উবারের (২০১৭) প্রকাশিত হার; চাহিদা বাড়লে অ্যাপে ভাড়াও বাড়ে। রাইডের সময় ধরা হয়েছে ঘণ্টায় ${num(AVG_KMH)} কিমি — জ্যামে বেশি লাগবে।`;
})();

for (const b of document.querySelectorAll('.lang-btn')) {
  b.textContent = LANG === 'en' ? 'বাংলা' : 'English';
  b.addEventListener('click', () => setLang(LANG === 'en' ? 'bn' : 'en'));
}
startTranslating();
route();
setTimeout(() => getMapStyle().catch(() => {}), 1200);   // warm the map style while the user is still on Home
// …and the map itself (its library and the place badges) once the page is idle, unless the line is slow or the
// person asked to save data: then opening a route draws the map at once instead of first fetching 800 KB.
setTimeout(() => {
  const c = navigator.connection;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
  const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 4000 }) : f => setTimeout(f, 800);
  idle(() => { loadMapLib().catch(() => {}); poiImages().catch(() => {}); });
}, 2500);
// Shared ratings arrive after first paint; cards drawn earlier pick up the averages on their next draw.
loadFareReports();
loadRatings().then(() => { for (const box of document.querySelectorAll('#op-grid .rate')) box.dispatchEvent(new Event('refresh')); opsRefresh(); });
new Promise(done => {
  const go = () => done(loadIndex());
  const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 3000 }) : f => setTimeout(f, 1500);
  if (document.readyState === 'complete') idle(go); else addEventListener('load', () => idle(go), { once: true });
  document.addEventListener('focusin', e => { if (e.target instanceof HTMLInputElement) go(); }, { once: true });
}).then(n => {
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

// Share the route on the map: a link that opens the same route, with the place names, on any phone.
$('trip-share').addEventListener('click', async () => {
  if (!trip.from || !trip.to) return;
  const url = tripLink(), text = `${tr(trip.from.label)} → ${tr(trip.to.label)} — Manzeela`;
  try {
    if (navigator.share) await navigator.share({ title: text, text, url });
    else { await navigator.clipboard.writeText(url); setStatus('লিংক কপি হয়েছে'); setTimeout(() => setStatus(''), 2000); }
  } catch { /* the share sheet was closed */ }
});

// The back button at the top of inner pages (phones). Each page visit remembers where it came from in its own
// history entry, so the button goes back exactly there; a page opened from a link goes up to where it lives.
const PAGE_PARENT = { insights: 'more', settings: 'more', support: 'more', verified: 'settings' };
addEventListener('hashchange', e => {
  const from = new URL(e.oldURL).hash || '#/';
  if (!(history.state && typeof history.state.mz === 'number')) history.replaceState({ ...(history.state || {}), pgFrom: from }, '');
});
document.addEventListener('click', e => {
  if (!e.target.closest('.pg-back')) return;
  if (history.state && history.state.pgFrom) history.back();
  else location.hash = '#/' + (PAGE_PARENT[document.body.dataset.page] || '');
});

// Search boxes everywhere (also the ones made later): no red spelling lines under 'coxbazar', no autocorrect.
document.addEventListener('focusin', e => {
  const t = e.target;
  if (t.tagName !== 'INPUT' || t.dataset.plain) return;
  if (t.type === 'search' || /খুঁজ|খোঁজ|search|যাবেন|থেকে/i.test(t.placeholder || '')) {
    t.spellcheck = false; t.setAttribute('autocorrect', 'off'); t.setAttribute('autocapitalize', 'off'); t.dataset.plain = '1';
  }
});

// PC map: the place chips sit in one row beside the search box, as in Google Maps. When they do not all fit, the row
// fades at the edge, arrows move it, and the mouse wheel scrolls it sideways (phones swipe it as before).
(() => {
  const chips = $('ms-chips'), bar = el('div', 'ms-chipbar');
  const arrow = (side, icon) => { const b = el('button', 'ms-chipnav ' + side); b.type = 'button'; b.innerHTML = svg(icon); b.setAttribute('aria-label', side === 'l' ? 'আগের' : 'পরের'); return b; };
  const l = arrow('l', 'back'), r = arrow('r', 'chev');
  chips.before(bar); bar.append(l, chips, r);
  const paint = () => {
    const max = chips.scrollWidth - chips.clientWidth;
    bar.classList.toggle('more-l', chips.scrollLeft > 2);
    bar.classList.toggle('more-r', chips.scrollLeft < max - 2);
  };
  const step = d => chips.scrollBy({ left: d * Math.max(160, chips.clientWidth * 0.7), behavior: 'smooth' });
  l.addEventListener('click', () => step(-1)); r.addEventListener('click', () => step(1));
  chips.addEventListener('scroll', paint, { passive: true });
  chips.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && chips.scrollWidth > chips.clientWidth) { e.preventDefault(); chips.scrollLeft += e.deltaY; } }, { passive: false });
  new ResizeObserver(paint).observe(chips);
  addEventListener('resize', paint);
})();

// Enter in any one-line box (a search, a place, a station, a code) closes the keyboard once it has done its job, as
// phones' own apps do. Not in the boxes where people keep writing: chat (a textarea), comments and live chat. When
// Enter moved on to the next field (from → to), that field keeps the keyboard.
document.addEventListener('keydown', e => {
  const t = e.target;
  if (e.key !== 'Enter' || e.isComposing || t.tagName !== 'INPUT' || /^(checkbox|radio|button|submit|range|color|file)$/.test(t.type) || t.closest('.cs, .live-room, .lv-chat, .chat-compose')) return;
  setTimeout(() => { if (document.activeElement === t) t.blur(); }, 0);
});
