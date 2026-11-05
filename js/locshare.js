// ---- Sharing where you are, as Google Maps does ----
// Send a place or where you are now as a link (it opens the map with a pin), or share your live location for
// 15 minutes, an hour or 8 hours: a link with a long random token; while the app is open the phone sends its
// position every few seconds, and whoever has the link watches it move. Stopping, or the time running out, ends it
// for everyone. The server side is lib/live-location.cjs.

const LS_TIMES = [[15, '১৫ মিনিট', '15 min'], [60, '১ ঘণ্টা', '1 hour'], [480, '৮ ঘণ্টা', '8 hours']];
const lsT = (bn, en) => LANG === 'en' ? en : bn;
let LS = null;                         // your running share: { token, url, expires, watch, last }
let lsPillEl = null, lsTick = null;

async function lsApi(path, body) {
  const r = await fetch('api/liveloc/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const d = (r.headers.get('content-type') || '').includes('json') ? await r.json() : {};
  if (!r.ok) throw Object.assign(new Error(d.error || 'server'), { status: r.status });
  return d;
}
// the phone's share sheet when there is one (WhatsApp, Messenger, SMS…), else the link is copied
async function lsShareLink(title, text, url) {
  try { if (navigator.share) { await navigator.share({ title, text, url }); return 'shared'; } }
  catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  try { await navigator.clipboard.writeText(url); return 'copied'; } catch { return 'fail'; }
}
const lsPlaceLink = p => `${location.origin}/#/at/${placeToParam(p)}`;
const lsLeft = ms => { const m = Math.max(1, Math.round(ms / 60000)); return m >= 60 ? lsT(`${num(Math.floor(m / 60))} ঘণ্টা${m % 60 ? ' ' + num(m % 60) + ' মিনিট' : ''}`, `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`) : lsT(`${num(m)} মিনিট`, `${m} min`); };
const lsAgo = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? lsT('এইমাত্র', 'just now') : lsT(`${num(Math.round(s / 60))} মিনিট আগে`, `${Math.round(s / 60)} min ago`); };

// A place (the card on the map): its link
async function lsSharePlace(p) {
  const how = await lsShareLink(p.label || 'Manzeela', p.label || '', lsPlaceLink(p));
  if (how === 'copied') setStatus(lsT('লিংক কপি হয়েছে', 'Link copied'));
}

// ---- the sheet: where you are now, or live ----
function openShareSheet() {
  const body = [];
  if (LS && LS.expires > Date.now()) {
    const card = el('div', 'ls-on');
    const t = el('div', 't');
    t.append(el('b', null, lsT('লাইভ লোকেশন শেয়ার হচ্ছে', 'Sharing your live location')), el('span', null, lsT(`আর ${lsLeft(LS.expires - Date.now())}`, `${lsLeft(LS.expires - Date.now())} left`)));
    card.append(el('i', 'ls-dot'), t);
    const again = button('send', lsT('লিংক পাঠান', 'Send the link'), () => lsShareLink(lsT('আমার লাইভ লোকেশন', 'My live location'), lsT('আমি এখন কোথায়, ম্যাপে দেখুন', 'See where I am on the map'), LS.url));
    const stop = button('close', lsT('বন্ধ করুন', 'Stop sharing'), () => { lsStop(); closeModal(); }, true);
    stop.classList.add('ls-stop');
    body.push(card, el('div', 'ls-acts'));
    body[1].append(again, stop);
  }
  const list = el('div', 'card menu ls-list');
  const now = el('button');
  now.innerHTML = `<i class="mi c-blue">${svg('pin')}</i>`;
  const nt = el('span'); nt.append(el('b', null, lsT('এখনকার লোকেশন পাঠান', 'Send where I am now')), el('em', null, lsT('একবার, একটি লিংক হিসেবে', 'Once, as a link')));
  now.append(nt, ic('chev'));
  now.addEventListener('click', () => {
    nt.querySelector('em').textContent = lsT('লোকেশন নেওয়া হচ্ছে…', 'Getting your location…');
    getLocation({ maxAge: 30_000 }).then(async f => {
      closeModal();
      const how = await lsShareLink(lsT('আমার লোকেশন', 'My location'), lsT('আমি এখানে আছি', 'I am here'), lsPlaceLink({ lat: f.lat, lon: f.lon, label: lsT('আমার লোকেশন', 'My location') }));
      if (how === 'copied') setStatus(lsT('লিংক কপি হয়েছে', 'Link copied'));
    }, e => { nt.querySelector('em').textContent = locationError(e); });
  });
  list.appendChild(now);
  body.push(list);
  if (!(LS && LS.expires > Date.now())) {
    body.push(el('div', 'label', lsT('লাইভ লোকেশন', 'Live location')));
    const times = el('div', 'ls-times');
    for (const [m, bn, en] of LS_TIMES) {
      const b = el('button', 'ls-time');
      b.append(el('b', null, lsT(bn, en)));
      b.addEventListener('click', () => { if (!ME) { closeModal(); needLogin(lsT('লাইভ লোকেশন শেয়ার করতে লগইন করুন', 'Log in to share your live location')); return; } closeModal(); lsStart(m, true); });
      times.appendChild(b);
    }
    body.push(times, el('p', 'form-note ls-note', lsT('অ্যাপ খোলা থাকলে আপনার অবস্থান কয়েক সেকেন্ড পরপর আপডেট হয়। যার কাছে লিংক আছে শুধু সে-ই দেখতে পারবে, আর সময় শেষ হলে বা বন্ধ করলে আর দেখা যাবে না।',
      'While the app is open your position updates every few seconds. Only people with the link can see it, and nobody can once the time is up or you stop.')));
  }
  openModal(lsT('লোকেশন শেয়ার', 'Share location'), '', body);
}

// ---- your live share ----
async function lsStart(minutes, share) {
  let f = null;
  try { f = await getLocation({ maxAge: 60_000 }); } catch (e) { setStatus(locationError(e)); return null; }
  let s;
  try { s = await lsApi('start', { minutes, lat: f.lat, lon: f.lon, acc: f.acc }); } catch { setStatus(lsT('লাইভ লোকেশন শুরু করা যায়নি', 'Could not start sharing')); return null; }
  LS = { ...s, watch: null, last: Date.now() };
  lsTrack();
  if (share) lsShareLink(lsT('আমার লাইভ লোকেশন', 'My live location'), lsT(`আমি এখন কোথায়, ম্যাপে দেখুন (${lsLeft(s.expires - Date.now())})`, `See where I am on the map (${lsLeft(s.expires - Date.now())})`), s.url);
  return s;
}
function lsSend(lat, lon, acc, heading) {
  if (!LS || Date.now() - (LS.sent || 0) < 5000) return;
  LS.sent = Date.now();
  lsApi('update', { token: LS.token, lat, lon, acc, heading }).catch(e => { if (e.status === 410 || e.status === 404) lsEnd(); });
}
function lsTrack() {
  if (!LS || !navigator.geolocation) return;
  if (LS.watch == null) LS.watch = navigator.geolocation.watchPosition(p => {
    rememberFix(p.coords.latitude, p.coords.longitude, p.coords.accuracy);
    lsSend(p.coords.latitude, p.coords.longitude, p.coords.accuracy, p.coords.heading);
  }, () => { /* GPS off for a while: the last position stays */ }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 });
  clearInterval(lsTick);
  lsTick = setInterval(() => { if (!LS || LS.expires <= Date.now()) lsEnd(); else lsPill(); }, 30_000);
  lsPill();
}
function lsEnd() {
  if (LS && LS.watch != null) navigator.geolocation.clearWatch(LS.watch);
  LS = null;
  clearInterval(lsTick);
  lsPill();
}
function lsStop() { if (LS) lsApi('stop', { token: LS.token }).catch(() => {}); lsEnd(); }
// the small pill while it runs: tap to send the link again or stop
function lsPill() {
  if (!LS) { if (lsPillEl) lsPillEl.hidden = true; return; }
  if (!lsPillEl) {
    lsPillEl = el('button', 'ls-pill');
    lsPillEl.addEventListener('click', openShareSheet);
    document.body.appendChild(lsPillEl);
  }
  lsPillEl.hidden = false;
  lsPillEl.replaceChildren(el('i', 'ls-dot'), el('span', null, lsT(`লাইভ লোকেশন · আর ${lsLeft(LS.expires - Date.now())}`, `Live location · ${lsLeft(LS.expires - Date.now())} left`)));
}
document.addEventListener('visibilitychange', () => {           // back to the app: say where at once
  if (document.visibilityState === 'visible' && LS) getLocation({ maxAge: 10_000 }).then(f => { LS.sent = 0; lsSend(f.lat, f.lon, f.acc); }).catch(() => {});
});
// after a reload, a share still running carries on
async function lsResume() {
  if (!ME || LS) return;
  try {
    const { share } = await lsApi('mine');
    if (!share) return;
    LS = { ...share, watch: null };
    let allowed = false;
    try { allowed = (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted'; } catch { /* unknown */ }
    if (allowed) lsTrack(); else lsPill();
  } catch { /* offline */ }
}
document.addEventListener('bdmap:auth', () => { if (ME) lsResume(); else lsEnd(); });

// ---- the other side: a link opened ----
let lsView = null;                     // { token, marker, card, timer }
function lsCloseView() {
  if (!lsView) return;
  clearInterval(lsView.timer);
  if (lsView.marker) lsView.marker.remove();
  lsView.card.remove();
  lsView = null;
}
async function lsOpenLive(token) {
  lsCloseView();
  if (current !== 'trip') go('trip');
  try { await ensureMap(); } catch { return; }
  const card = el('div', 'card ls-view');
  $('page-trip').appendChild(card);
  lsView = { token, marker: null, card, timer: null, first: true };
  const me = lsView;
  const paint = async () => {
    let d;
    try { d = await (await fetch('api/liveloc/get?t=' + encodeURIComponent(token))).json(); } catch { return; }
    if (lsView !== me) return;
    const head = el('div', 'ls-vh');
    const t = el('div', 't');
    const name = Object.assign(el('b', 'no-tr'), { textContent: d.name ? lsT(`${d.name}-এর লাইভ লোকেশন`, `${d.name}'s live location`) : lsT('লাইভ লোকেশন', 'Live location') });
    const sub = el('span', null, d.error ? lsT('লিংকটি ঠিক নয়', 'This link is not valid')
      : !d.active ? lsT('শেয়ার করা শেষ হয়েছে', 'Sharing has ended')
      : d.updated ? lsT(`${lsAgo(d.updated)} আপডেট · আর ${lsLeft(d.expires - Date.now())}`, `Updated ${lsAgo(d.updated)} · ${lsLeft(d.expires - Date.now())} left`) : lsT('অবস্থানের অপেক্ষায়…', 'Waiting for a position…'));
    t.append(name, sub);
    const av = d.uid ? avatar({ id: d.uid, name: d.name || '?', pic: d.pic }, 'ls-av') : el('i', 'ls-dot');
    const x = el('button', 'icon-btn'); x.innerHTML = svg('close'); x.setAttribute('aria-label', lsT('বন্ধ করুন', 'Close'));
    x.addEventListener('click', () => { lsCloseView(); history.replaceState(null, '', '#/trip'); });
    head.append(av, t, x);
    const acts = el('div', 'ls-vacts');
    if (d.active && d.lat != null) {
      const go2 = button('route', lsT('ওখানে যান', 'Directions'), () => goTo({ lat: d.lat, lon: d.lon, label: d.name || lsT('লাইভ লোকেশন', 'Live location') }));
      acts.append(go2);
    }
    card.replaceChildren(head, acts);
    if (!d.active) { clearInterval(me.timer); if (me.marker) { me.marker.remove(); me.marker = null; } return; }
    if (d.lat == null) return;
    if (!me.marker) {
      const pin = el('div', 'ls-marker');
      pin.append(el('i', 'ls-ring'), d.uid ? avatar({ id: d.uid, name: d.name || '?', pic: d.pic }, 'ls-mav') : el('i', 'ls-dot'));
      me.marker = new maplibregl.Marker({ element: pin }).setLngLat([d.lon, d.lat]).addTo(map);
    } else me.marker.setLngLat([d.lon, d.lat]);
    if (me.first) { me.first = false; map.flyTo({ center: [d.lon, d.lat], zoom: 16, duration: 900 }); }
  };
  await paint();
  me.timer = setInterval(paint, 5000);
}
async function lsOpenAt(p) {
  if (current !== 'trip') go('trip');
  try { await ensureMap(); } catch { return; }
  map.flyTo({ center: [p.lon, p.lat], zoom: 16.5, duration: 900 });
  showPlace({ lat: p.lat, lon: p.lon, name: p.label || lsT('শেয়ার করা জায়গা', 'Shared place'), kind: 'other', cat: '' });
}
addEventListener('hashchange', () => { if (!/^#\/live\//.test(location.hash)) lsCloseView(); });

(() => {
  // a link that opened the app
  const m = /^#\/(live|at)\/(.+)$/.exec(location.hash);
  if (m && m[1] === 'live') lsOpenLive(m[2]);
  else if (m) { const p = placeParam(m[2]); if (p) lsOpenAt(p); }
  if (typeof ME !== 'undefined' && ME) lsResume();
  const tool = $('tool-share');
  if (tool) tool.addEventListener('click', openShareSheet);
})();
