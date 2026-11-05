// ---- The map, as Google Maps has it: saved places with home and work, a place's hours, phone and website,
// "what is here" on a long press, measuring a distance, and an area kept on the phone for use without internet.
// Names here start with sv/pd/lp/ms2/off so they never meet another file's (all files share one global scope).

// ---- Saved places: home, work and a list; on this phone, and with the account when signed in ----
const SV_KEY = 'bdmap.saved', SV_MAX = 40;
const svClean = p => p && Number.isFinite(+p.lat) && Number.isFinite(+p.lon)
  ? { lat: +(+p.lat).toFixed(6), lon: +(+p.lon).toFixed(6), label: String(p.label || p.name || '').slice(0, 60) || 'সেভ করা জায়গা', kind: String(p.kind || '').slice(0, 12) } : null;
function svLoad() {
  try {
    const v = JSON.parse(localStorage.getItem(SV_KEY));
    if (v && typeof v === 'object') return { home: svClean(v.home), work: svClean(v.work), list: (Array.isArray(v.list) ? v.list : []).map(svClean).filter(Boolean).slice(0, SV_MAX) };
  } catch { /* storage off */ }
  return { home: null, work: null, list: [] };
}
function svStore(v) {
  try { localStorage.setItem(SV_KEY, JSON.stringify(v)); } catch { /* storage off */ }
  if (typeof syncAccount === 'function') syncAccount();
  svMarkers();
}
const svSame = (a, b) => !!(a && b) && Math.abs(a.lat - b.lat) < 2e-5 && Math.abs(a.lon - b.lon) < 2e-5;
// what this place is among the saved: 'home', 'work', 'saved' or ''
function svRole(p) { const v = svLoad(); return svSame(v.home, p) ? 'home' : svSame(v.work, p) ? 'work' : v.list.some(x => svSame(x, p)) ? 'saved' : ''; }
// the account's copy merged with the phone's at sign-in (the phone's home and work win; the lists are joined)
function svMerge(remote) {
  const mine = svLoad(), r = remote && typeof remote === 'object' ? remote : {};
  const list = [...mine.list];
  for (const p of (Array.isArray(r.list) ? r.list : []).map(svClean).filter(Boolean)) if (!list.some(x => svSame(x, p))) list.push(p);
  const v = { home: mine.home || svClean(r.home), work: mine.work || svClean(r.work), list: list.slice(0, SV_MAX) };
  try { localStorage.setItem(SV_KEY, JSON.stringify(v)); } catch { /* storage off */ }
  svMarkers();
}
const SV_ROLE_NAME = { home: 'বাসা', work: 'অফিস', saved: 'সেভ করা' };

// Their own small marks on the map: a house, a briefcase, a star (as Google draws them).
let svMarks = [];
function svMarkers() {
  for (const m of svMarks) m.remove();
  svMarks = [];
  if (!map || typeof maplibregl === 'undefined') return;
  const v = svLoad(), all = [...(v.home ? [[v.home, 'home']] : []), ...(v.work ? [[v.work, 'work']] : []), ...v.list.map(p => [p, 'saved'])];
  for (const [p, role] of all) {
    const b = el('button', 'sv-mark ' + role);
    b.innerHTML = svg(role === 'home' ? 'homeFill' : role === 'work' ? 'bag' : 'star');
    b.title = b.ariaLabel = role === 'saved' ? p.label : `${SV_ROLE_NAME[role]} · ${p.label}`;
    b.addEventListener('click', e => { e.stopPropagation(); showPlace({ lat: p.lat, lon: p.lon, name: p.label, kind: p.kind || 'other' }); });
    svMarks.push(new maplibregl.Marker({ element: b }).setLngLat([p.lon, p.lat]).addTo(map));
  }
}

// Directions to a saved place from where you are, as a tap on Home does in Google Maps.
function svGo(p) {
  hidePlace(); openDirections(true);
  if (myLoc && !trip.from) trip.from = { lat: myLoc.lat, lon: myLoc.lon, label: 'আমার লোকেশন' };
  goTo({ lat: p.lat, lon: p.lon, label: p.label });          // where you are: a recent fix at once, else asked for (app.js)
}
// Choosing a place for home or work: the next place picked in the search box becomes it.
let svPicking = '';
function svStartPick(role) {
  svPicking = role;
  const input = $('ms-input');
  input.value = ''; $('ms-clear').hidden = true;
  input.placeholder = role === 'home' ? 'বাসার ঠিকানা খুঁজুন' : 'অফিসের ঠিকানা খুঁজুন';
  input.focus();
}
// called by the search box with the place picked; true when it was taken for home or work
function svPick(pl) {
  if (!svPicking) return false;
  const role = svPicking, v = svLoad(), p = svClean({ lat: pl.lat, lon: pl.lon, label: pl.name, kind: pl.kind });
  svPicking = '';
  $('ms-input').placeholder = 'এখানে খুঁজুন';
  $('ms-input').value = '';
  $('ms-clear').hidden = true;
  v[role] = p;
  svStore(v);
  mpToast(role === 'home' ? 'বাসা সেভ হয়েছে' : 'অফিস সেভ হয়েছে');
  showPlace({ ...pl });
  return true;
}
// The search box with nothing typed: home, work, the saved places and the last trips (Google's first list).
function svSuggest(sug) {
  const v = svLoad();
  sug.replaceChildren();
  const row = (icon, cls, title, sub, onPick, onEdit) => {
    const r = el('div', 'sug sv-row');
    const i = el('span', 'ic sv-ic ' + cls); i.innerHTML = svg(icon);
    const t = el('div', 't'); t.append(el('b', null, title), sub ? el('span', 'no-tr', sub) : el('span', null, ''));
    r.append(i, t);
    if (onEdit) {
      const e = el('button', 'sv-edit'); e.innerHTML = svg('edit'); e.ariaLabel = e.title = 'বদলান';
      e.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation(); onEdit(); });
      r.appendChild(e);
    }
    r.addEventListener('mousedown', e => { e.preventDefault(); onPick(); });
    sug.appendChild(r);
  };
  if (svPicking) { sug.appendChild(el('div', 'sug-head', svPicking === 'home' ? 'বাসার ঠিকানা' : 'অফিসের ঠিকানা')); sug.hidden = false; return; }
  for (const role of ['home', 'work']) {
    const p = v[role];
    if (p) row(role === 'home' ? 'homeFill' : 'bag', role, SV_ROLE_NAME[role], p.label, () => { $('ms-input').blur(); svGo(p); }, () => svStartPick(role));
    else row(role === 'home' ? 'homeFill' : 'bag', role, SV_ROLE_NAME[role], 'ঠিকানা যোগ করুন', () => svStartPick(role));
  }
  if (v.list.length) {
    sug.appendChild(el('div', 'sug-head', 'সেভ করা জায়গা'));
    for (const p of v.list.slice(-6).reverse()) row('star', 'saved', p.label, '', () => { $('ms-input').blur(); sug.hidden = true; showPlace({ lat: p.lat, lon: p.lon, name: p.label, kind: p.kind || 'other' }); });
  }
  const recent = typeof loadRecent === 'function' ? loadRecent().slice(0, 3) : [];
  if (recent.length) {
    sug.appendChild(el('div', 'sug-head', 'সাম্প্রতিক'));
    for (const r of recent) row('clock', 'recent', `${r.from.label} → ${r.to.label}`, '', () => { $('ms-input').blur(); sug.hidden = true; openDirections(true); trip.from = r.from; setPlace('to', r.to); });
  }
  sug.hidden = false;
}
// Saving from a place's card: the list, home or work, each on or off.
function svChoose(pl, btn) {
  const p = svClean({ lat: pl.lat, lon: pl.lon, label: pl.name, kind: pl.kind });
  const opt = (role, icon, text) => {
    const on = role === 'saved' ? svLoad().list.some(x => svSame(x, p)) : svSame(svLoad()[role], p);
    const b = el('button', 'sv-opt' + (on ? ' on' : ''));
    const i = el('span', 'ic sv-ic ' + role); i.innerHTML = svg(icon);
    const tick = el('span', 'sv-tick'); tick.innerHTML = svg('check');
    b.append(i, el('b', null, text), tick);
    b.addEventListener('click', () => {
      const v = svLoad(), now = !b.classList.contains('on');
      if (role === 'saved') v.list = now ? [...v.list.filter(x => !svSame(x, p)), p].slice(-SV_MAX) : v.list.filter(x => !svSame(x, p));
      else v[role] = now ? p : null;
      svStore(v);
      b.classList.toggle('on', now);
      svButton(btn, pl);
    });
    return b;
  };
  openModal('সেভ করুন', p.label, [opt('saved', 'star', 'সেভ করা জায়গা'), opt('home', 'homeFill', 'বাসা'), opt('work', 'bag', 'অফিস')], [button('check', 'হয়েছে', closeModal)]);
}
function svButton(btn, pl) {
  const role = svRole(pl);
  btn.classList.toggle('on', !!role);
  btn.innerHTML = svg(role === 'home' ? 'homeFill' : role === 'work' ? 'bag' : 'bookmark');
  btn.title = btn.ariaLabel = role ? SV_ROLE_NAME[role] : 'সেভ';
}

// ---- A place's details from OpenStreetMap: opening hours (open now?), phone, website, address ----
// from our server's copy of OpenStreetMap's details (server.js: /api/pois/detail), at once and without Overpass
async function pdFetch(pl) {
  const r = await fetch(`api/pois/detail?lat=${(+pl.lat).toFixed(6)}&lon=${(+pl.lon).toFixed(6)}&name=${encodeURIComponent(pl.name)}`);
  if (!r.ok) return null;
  const d = await r.json();
  if (!d.hours && !d.phone && !d.web && !d.addr) return null;
  const web = String(d.web || '').trim();
  return { hours: d.hours || '', phone: d.phone || '', web: /^https?:\/\//i.test(web) ? web : web ? 'https://' + web : '', addr: d.addr || '' };
}
// opening_hours as OpenStreetMap writes it ("Sa-Th 09:00-21:00; Fr off", "24/7", "10:00-14:00,16:00-22:00"):
// each day's spans in minutes, or null when the text is something this does not read
const PD_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
function pdParse(s) {
  s = String(s || '').trim();
  if (!s) return null;
  if (/^24\/7$/.test(s)) return { always: true };
  const week = Array.from({ length: 7 }, () => []);
  let any = false;
  for (let rule of s.split(';')) {
    rule = rule.trim();
    if (!rule) continue;
    if (/\b(PH|SH)\b/.test(rule) && !/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/.test(rule)) continue;     // holidays: not known here
    rule = rule.replace(/,?\s*\bPH\b(\s+off)?/g, '');
    const m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/);
    if (!m) return null;
    let days = [0, 1, 2, 3, 4, 5, 6];
    if (m[1]) {
      days = [];
      for (const part of m[1].split(',')) {
        const [a, b] = part.split('-').map(x => PD_DAYS.indexOf(x.trim()));
        if (b == null || b < 0) days.push(a); else for (let d = a; ; d = (d + 1) % 7) { days.push(d); if (d === b) break; }
      }
    }
    const times = m[2].trim();
    let spans = [];
    if (/^(off|closed)$/i.test(times)) spans = [];
    else if (!times || /^24\/7$/.test(times)) spans = [[0, 1440]];
    else {
      for (const part of times.split(',')) {
        const t = part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\+?$/);
        if (!t) return null;
        const a = +t[1] * 60 + +t[2]; let b = +t[3] * 60 + +t[4];
        if (b <= a) b += 1440;                                  // past midnight
        spans.push([a, b]);
      }
    }
    for (const d of days) week[d] = spans;
    any = true;
  }
  return any ? { week } : null;
}
// "সকাল ৯টা", "রাত ১০:৩০"; in English "9 am", "10:30 pm"
function pdClock(min) {
  min = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60), m = min % 60;
  if (LANG === 'en') { const hh = h % 12 || 12; return `${hh}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`; }
  const part = h < 4 ? 'রাত' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকেল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
  const hh = h % 12 || 12;
  return `${part} ${num(hh)}${m ? ':' + num(m).padStart(2, '০') : 'টা'}`;
}
// "রাত ১০টায়", "রাত ১০:৩০-এ"
const pdAt = min => { const t = pdClock(min); return t.endsWith('টা') ? t + 'য়' : t + '-এ'; };
const PD_DAY_BN = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const PD_DAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// open now? and until when, or when it opens next (Bangladesh time)
function pdState(oh, now = new Date()) {
  if (oh.always) return { open: true, text: LANG === 'en' ? 'Open 24 hours' : '২৪ ঘণ্টা খোলা' };
  const bd = new Date(now.getTime() + (now.getTimezoneOffset() + 360) * 60000);   // UTC+6
  const d = bd.getDay(), m = bd.getHours() * 60 + bd.getMinutes();
  const en = LANG === 'en';
  const today = oh.week[d].find(([a, b]) => m >= a && m < b), late = oh.week[(d + 6) % 7].find(([a, b]) => b > 1440 && m < b - 1440);
  if (today || late) {
    const end = today ? today[1] : late[1] - 1440;
    return { open: true, text: en ? `Open · closes ${pdClock(end)}` : `খোলা · ${pdAt(end)} বন্ধ হবে` };
  }
  for (let k = 0; k < 7; k++) {
    const day = (d + k) % 7, next = oh.week[day].map(s => s[0]).filter(a => k > 0 || a > m).sort((a, b) => a - b)[0];
    if (next == null) continue;
    const when = k === 0 ? '' : k === 1 ? (en ? 'tomorrow ' : 'কাল ') : (en ? PD_DAY_EN[day] + ' ' : PD_DAY_BN[day] + ' ');
    return { open: false, text: en ? `Closed · opens ${when}${pdClock(next)}` : `বন্ধ · ${when}${pdAt(next)} খুলবে` };
  }
  return { open: false, text: en ? 'Closed' : 'বন্ধ' };
}

// ---- The place card's extras: save; for a named place its details; for a dropped pin its coordinates ----
function placeExtras(pl, card, acts) {
  const token = (card.dataset.k = String(Math.random()));
  const save = el('button', 'btn quiet pc-icon pc-save');
  svButton(save, pl);
  save.addEventListener('click', () => svChoose(pl, save));
  acts.insertBefore(save, acts.querySelector('.pc-share'));
  const info = el('div', 'pc-info');
  card.insertBefore(info, acts);
  if (pl.pin) {
    const kind = card.querySelector('.pc-t span'); if (kind) kind.textContent = '';
    const at = `${(+pl.lat).toFixed(5)}, ${(+pl.lon).toFixed(5)}`;
    const r = pdRow('pin', at, 'no-tr');
    const copy = el('button', 'pd-copy'); copy.innerHTML = svg('copy'); copy.ariaLabel = copy.title = 'কপি করুন';
    copy.addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(at).then(() => mpToast('কপি হয়েছে'), () => {}); });
    r.appendChild(copy);
    info.appendChild(r);
    const measure = el('button', 'btn quiet pc-icon'); measure.innerHTML = svg('route'); measure.title = measure.ariaLabel = 'দূরত্ব মাপুন';
    measure.addEventListener('click', () => { hidePlace(); msStart(pl); });
    acts.insertBefore(measure, save);
    return;
  }
  if (!pl.name) return;
  pdFetch(pl).then(d => {
    if (!d || card.dataset.k !== token || card.hidden) return;
    const oh = d.hours && pdParse(d.hours);
    if (oh) { const st = pdState(oh), r = pdRow('clock', st.text, 'no-tr ' + (st.open ? 'pd-open' : 'pd-shut')); r.title = d.hours; info.appendChild(r); }
    else if (d.hours) info.appendChild(pdRow('clock', d.hours, 'no-tr'));
    if (d.addr) info.appendChild(pdRow('pin', d.addr, 'no-tr'));
    if (d.web) {
      const a = Object.assign(el('a', 'pd-row'), { href: d.web, target: '_blank', rel: 'noopener nofollow' });
      a.innerHTML = svg('globe'); a.appendChild(el('span', 'no-tr', d.web.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')));
      info.appendChild(a);
    }
    if (d.phone) {
      const call = Object.assign(el('a', 'btn quiet pc-icon pc-call'), { href: 'tel:' + d.phone.replace(/[^\d+]/g, '') });
      call.innerHTML = svg('phone'); call.title = call.ariaLabel = 'কল করুন · ' + d.phone;
      acts.insertBefore(call, save);
    }
  }).catch(() => {});
}
function pdRow(icon, text, cls) {
  const r = el('div', 'pd-row');
  r.innerHTML = svg(icon);
  r.appendChild(el('span', cls || '', text));
  return r;
}

// ---- "What is here": a long press (right click with a mouse) drops a pin with its address and coordinates ----
let lpTimer = null, lpAt = null, lpDropped = 0;
function lpDrop(lngLat) {
  if (msOn || Date.now() - lpDropped < 800) return;        // Android also sends a right click for the same long press
  if (!inBangladesh(lngLat.lat, lngLat.lng)) return;
  lpDropped = Date.now();
  const pl = { lat: lngLat.lat, lon: lngLat.lng, name: 'বাছাই করা জায়গা', kind: 'other', pin: true };
  if (dirOpen()) {
    // with directions open the pin fills the empty end, as a tap does
    const which = !trip.from ? 'from' : !trip.to ? 'to' : 'to';
    const place = { lat: pl.lat, lon: pl.lon, label: 'ম্যাপে বাছাই করা জায়গা' };
    setPlace(which, place);
    reverseName(pl.lat, pl.lon).then(n => { if (n && trip[which] === place) { place.label = n; for (const s of searches) s.sync(); } });
    return;
  }
  showPlace(pl);
  if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* not allowed */ }
  reverseName(pl.lat, pl.lon).then(n => {
    const card = $('place-card'), b = card.querySelector('.pc-t b');
    if (!n || card.hidden || !b || b.textContent !== 'বাছাই করা জায়গা') return;
    pl.name = n; b.textContent = n;
  });
}
// a click right after a long press is the finger lifting: the map's own click handler leaves it alone
const lpGuard = () => Date.now() - lpDropped < 700;
function lpHook() {
  map.on('contextmenu', e => { e.preventDefault(); lpDrop(e.lngLat); });
  map.on('touchstart', e => {
    clearTimeout(lpTimer);
    if (!e.originalEvent.touches || e.originalEvent.touches.length !== 1) return;
    lpAt = e.point;
    const ll = e.lngLat;
    lpTimer = setTimeout(() => lpDrop(ll), 550);
  });
  const cancel = () => clearTimeout(lpTimer);
  map.on('touchmove', e => { if (lpAt && Math.hypot(e.point.x - lpAt.x, e.point.y - lpAt.y) > 10) cancel(); });
  map.on('touchend', cancel); map.on('touchcancel', cancel); map.on('dragstart', cancel); map.on('zoomstart', cancel); map.on('pitchstart', cancel);
}

// ---- Measure a distance: taps add points; the total in a pill with undo and done ----
let msOn = false, msPts = [], msPill = null;
function msDraw() {
  const src = map.getSource('measure');
  if (!src) return;
  const f = msPts.map(p => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }));
  if (msPts.length > 1) f.unshift({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: msPts } });
  src.setData({ type: 'FeatureCollection', features: f });
  let km = 0;
  for (let i = 1; i < msPts.length; i++) km += haversineKm({ lat: msPts[i - 1][1], lon: msPts[i - 1][0] }, { lat: msPts[i][1], lon: msPts[i][0] });
  msPill.querySelector('b').textContent = msPts.length < 2 ? 'পরের জায়গায় চাপ দিন' : (km < 1 ? `${num(Math.round(km * 1000))} মিটার` : `${num(km, 2)} কিমি`);
  msPill.querySelector('.ms2-undo').disabled = msPts.length < 2;
}
function msStart(pl) {
  msOn = true;
  msPts = [[pl.lon, pl.lat]];
  if (!msPill) {
    msPill = el('div', 'ms2-pill');
    const undo = el('button', 'ms2-undo'); undo.innerHTML = svg('prev'); undo.ariaLabel = undo.title = 'শেষেরটা মুছুন';
    undo.addEventListener('click', () => { if (msPts.length > 1) { msPts.pop(); msDraw(); } });
    const done = el('button', 'ms2-done'); done.innerHTML = svg('close'); done.ariaLabel = done.title = 'শেষ';
    done.addEventListener('click', msStop);
    const t = el('div', 't'); t.append(el('span', null, 'মোট দূরত্ব'), el('b', null, ''));
    msPill.append(undo, t, done);
    $('page-trip').appendChild(msPill);
  }
  msPill.hidden = false;
  msDraw();
}
function msStop() { msOn = false; msPts = []; if (msPill) msPill.hidden = true; const s = map && map.getSource('measure'); if (s) s.setData({ type: 'FeatureCollection', features: [] }); }
// the map's click handler asks first: while measuring, a tap is the next point
function msClick(e) {
  if (!msOn) return false;
  msPts.push([e.lngLat.lng, e.lngLat.lat]);
  msDraw();
  return true;
}

// Set up once the map is there (app.js calls this at the end of createMap).
function mapPlusReady() {
  const dark = isDark();
  map.addLayer({ id: 'measure-line', type: 'line', source: 'measure', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' },
                 paint: { 'line-color': dark ? '#ffffff' : '#1f1f1f', 'line-width': 3, 'line-dasharray': [2, 1.5] } });
  map.addLayer({ id: 'measure-dot', type: 'circle', source: 'measure', filter: ['==', ['geometry-type'], 'Point'],
                 paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-width': 2.5, 'circle-stroke-color': dark ? '#ffffff' : '#1f1f1f' } });
  lpHook();
  svMarkers();
}

// ---- An area kept on the phone: the map's street tiles of what is on screen, for use without internet ----
// The tiles are stored under their place (z/x/y), not under OpenFreeMap's dated address, so a newer map build
// online still finds them offline (sw.js looks here when the network fails).
const OFF_CACHE = 'bdmap-offline-v1', OFF_KEY = 'bdmap.offline', OFF_MAX = 3500;
const offTileKey = (z, x, y) => `https://offline.manzeela.com/t/${z}/${x}/${y}.pbf`;
function offAreas() { try { return JSON.parse(localStorage.getItem(OFF_KEY)) || []; } catch { return []; } }
function offSaveAreas(a) { try { localStorage.setItem(OFF_KEY, JSON.stringify(a)); } catch { /* storage off */ } }
const offLon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const offLat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
// every tile of a box from zoom 6 to 14 (OpenFreeMap's deepest; the map draws closer views from those)
function offTiles([w, s, e, n]) {
  const out = [];
  for (let z = 6; z <= 14; z++) for (let x = offLon2x(w, z); x <= offLon2x(e, z); x++) for (let y = offLat2y(n, z); y <= offLat2y(s, z); y++) out.push([z, x, y]);
  return out;
}
function offTemplate() {
  const st = map && map.getStyle();
  const src = st && Object.values(st.sources).find(x => x.type === 'vector' && Array.isArray(x.tiles) && /openfreemap/.test(x.tiles[0]));
  if (src) return src.tiles[0];
  // the map fell back to our own copy of the country: the tile index OpenFreeMap gave last time
  try { const t = JSON.parse(localStorage.getItem('bdmap.tilejson')).data.tiles[0]; return /openfreemap/.test(t) ? t : ''; } catch { return ''; }
}
const offMb = b => LANG === 'en' ? `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB` : `${num(b / 1048576, b < 10485760 ? 1 : 0)} এমবি`;
let offBusy = false;
async function offDownload(ui) {
  const tpl = offTemplate();
  if (!tpl || offBusy) return;
  const b = map.getBounds(), box = [Math.max(88, b.getWest()), Math.max(20.5, b.getSouth()), Math.min(92.8, b.getEast()), Math.min(26.7, b.getNorth())];
  const tiles = offTiles(box);
  if (tiles.length > OFF_MAX) { ui.note.textContent = 'এলাকাটা অনেক বড় — ম্যাপে একটু কাছে গিয়ে আবার চেষ্টা করুন।'; return; }
  offBusy = true;
  ui.go.disabled = true;
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* the browser decides */ }
  const cache = await caches.open(OFF_CACHE);
  let done = 0, bytes = 0, failed = 0;
  const queue = tiles.slice();
  const work = async () => {
    while (queue.length) {
      const [z, x, y] = queue.shift();
      try {
        const key = offTileKey(z, x, y);
        let hit = await cache.match(key);
        if (!hit) {
          const res = await fetch(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
          if (!res.ok && res.status !== 204) throw new Error(res.status);
          const body = await res.blob();
          await cache.put(key, new Response(body, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/x-protobuf' } }));
          bytes += body.size;
        } else bytes += (await hit.blob()).size;
      } catch { failed++; }
      done++;
      ui.bar.style.width = (done / tiles.length * 100).toFixed(1) + '%';
      ui.note.textContent = `${num(Math.round(done / tiles.length * 100))}% · ${offMb(bytes)}`;
    }
  };
  // the letters and map symbols the map has used, kept beside the tiles
  const keepParts = caches.open('bdmap-maps-v1').then(c => c.keys()).then(keys => Promise.all(keys.filter(k => /\/(fonts|sprites)\//.test(k.url)).map(async k => {
    const r = await caches.match(k); if (r) await cache.put(k.url, r.clone());
  }))).catch(() => {});
  await Promise.all([...Array(6)].map(work).concat(keepParts));
  offBusy = false;
  ui.go.disabled = false;
  if (failed > tiles.length * 0.2) { ui.note.textContent = 'ডাউনলোড শেষ হয়নি — ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।'; return; }
  const c = map.getCenter(), name = (await reverseName(c.lat, c.lng)) || 'ম্যাপের এলাকা';
  const areas = offAreas();
  areas.unshift({ id: Date.now().toString(36), name: name.split(',')[0].slice(0, 40), box, n: tiles.length, bytes, at: Date.now() });
  offSaveAreas(areas.slice(0, 12));
  ui.note.textContent = `সেভ হয়েছে · ${offMb(bytes)}`;
  offList(ui);
}
async function offDelete(id, ui) {
  const areas = offAreas().filter(a => a.id !== id);
  offSaveAreas(areas);
  const keep = new Set(areas.flatMap(a => offTiles(a.box).map(([z, x, y]) => offTileKey(z, x, y))));
  try {
    const cache = await caches.open(OFF_CACHE);
    for (const k of await cache.keys()) if (k.url.includes('offline.manzeela.com/t/') && !keep.has(k.url)) await cache.delete(k);
  } catch { /* nothing kept */ }
  offList(ui);
}
function offList(ui) {
  ui.list.replaceChildren();
  const areas = offAreas();
  if (areas.length) ui.list.appendChild(el('div', 'off-head', 'ফোনে রাখা এলাকা'));
  for (const a of areas) {
    const r = el('div', 'off-area');
    const t = el('button', 't'); t.append(el('b', 'no-tr', a.name), el('span', null, `${offMb(a.bytes)} · ${new Date(a.at).toLocaleDateString(LANG === 'en' ? 'en-GB' : 'bn-BD', { day: 'numeric', month: 'short' })}`));
    t.addEventListener('click', () => { ui.close(); map.fitBounds([[a.box[0], a.box[1]], [a.box[2], a.box[3]]], { padding: 20, duration: 800 }); });
    const del = el('button', 'off-del'); del.innerHTML = svg('trash'); del.ariaLabel = del.title = 'মুছে ফেলুন';
    del.addEventListener('click', () => offDelete(a.id, ui));
    r.append(t, del);
    ui.list.appendChild(r);
  }
}
// the sheet: what is on screen with its size, a download button, the areas already kept
function offOpen() {
  if (!map) return;
  const sheet = el('div', 'mm-sheet off-sheet'), card = el('div', 'mm-panel');
  const head = el('div', 'mm-head'); head.append(el('b', null, 'অফলাইন ম্যাপ'));
  const x = el('button', 'mm-x'); x.innerHTML = svg('close'); x.ariaLabel = 'বন্ধ করুন'; head.appendChild(x);
  const tpl = offTemplate(), b = map.getBounds();
  const n = offTiles([Math.max(88, b.getWest()), Math.max(20.5, b.getSouth()), Math.min(92.8, b.getEast()), Math.min(26.7, b.getNorth())]).length;
  const here = el('div', 'off-here');
  const ht = el('div', 't'); ht.append(el('b', null, 'ম্যাপে যে এলাকা দেখছেন'), el('span', null, n > OFF_MAX ? 'অনেক বড় — একটু কাছে যান' : `প্রায় ${offMb(n * 190 * 1024)}`));
  const go = button('arrow', 'ডাউনলোড', () => offDownload(ui));
  go.classList.add('off-go');
  go.disabled = !tpl || n > OFF_MAX;
  here.append(ht, go);
  const track = el('div', 'off-track'), bar = el('i');
  track.appendChild(bar);
  const note = el('p', 'off-note', tpl ? 'ইন্টারনেট না থাকলেও এই এলাকার রাস্তা আর নাম দেখা যাবে।' : 'এখন ডাউনলোড করা যাচ্ছে না।');
  const list = el('div', 'off-list');
  card.append(head, here, track, note, list);
  sheet.appendChild(card);
  $('page-trip').appendChild(sheet);
  const close = () => { sheet.classList.remove('in'); setTimeout(() => sheet.remove(), 220); };
  const ui = { go, bar, note, list, close };
  x.addEventListener('click', close);
  sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
  offList(ui);
  requestAnimationFrame(() => sheet.classList.add('in'));
}
// the row in the map-type chooser that opens it
function offRow(closeChooser) {
  const b = el('button', 'mm-row mm-off');
  b.append(el('span', null, 'অফলাইন ম্যাপ'), Object.assign(el('i'), { innerHTML: svg('chev') }));
  b.addEventListener('click', () => { closeChooser(); offOpen(); });
  return b;
}

// A short note at the bottom of the map that fades by itself.
let mpToastTimer = null;
function mpToast(text) {
  let t = document.querySelector('.mp-toast');
  if (!t) { t = el('div', 'mp-toast'); document.body.appendChild(t); }
  t.textContent = text;
  t.classList.add('in');
  clearTimeout(mpToastTimer);
  mpToastTimer = setTimeout(() => t.classList.remove('in'), 1800);
}
