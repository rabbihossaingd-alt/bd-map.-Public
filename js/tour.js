// ---- Tour plan: a cost estimate for a group trip, and a shareable card with the group's photos ----
// Everything here runs on the device. Photos are drawn straight onto a canvas and are never uploaded.

(function initTour() {
  const dhaka = districtById('dhaka');
  // Room prices per night [budget, mid-range, premium]. These are the app's own rough estimates by kind of
  // destination — there is no reliable public price list — so the field stays editable and the page says so.
  const HOTEL_NAMES = ['বাজেট', 'মাঝারি', 'প্রিমিয়াম'];
  const HOTEL_PRICES = {
    dhaka: [2500, 6000, 14000], chattogram: [2000, 5000, 12000], coxsbazar: [2000, 5000, 12000],
    sylhet: [1500, 4000, 9000], moulvibazar: [1500, 4000, 9000],
    bandarban: [1500, 3500, 8000], rangamati: [1500, 3500, 8000], khagrachhari: [1500, 3500, 8000],
    patuakhali: [1200, 3000, 6000]
  };
  const CITY_PRICES = [1200, 3000, 6000], TOWN_PRICES = [800, 1800, 3500];
  const CITIES = ['khulna', 'rajshahi', 'rangpur', 'barishal', 'mymensingh', 'cumilla', 'bogura', 'jashore', 'gazipur', 'narayanganj'];
  const hotelPrices = d => HOTEL_PRICES[d.id] || (CITIES.includes(d.id) ? CITY_PRICES : TOWN_PRICES);
  window.tourHotelPrices = hotelPrices;   // the multi-district planner (trip.js) uses the same estimates
  // Districts with an airport that has scheduled domestic flights.
  const AIRPORTS = ['dhaka', 'chattogram', 'coxsbazar', 'sylhet', 'jashore', 'rajshahi', 'nilphamari', 'barishal'];
  const plan = { from: dhaka, to: districtById('coxsbazar'), people: 4, nights: 2, ac: false, roundTrip: true,
                 tier: 1, roomPrice: 0, rooms: 2, food: 600, other: 300, km: null, roomsTouched: false, priceTouched: false,
                 mode: 'bus', airFare: 5500 };
  plan.roomPrice = hotelPrices(plan.to)[plan.tier];
  const photos = [];                      // HTMLImageElement, up to 5
  const routes = new Map();               // "from>to" -> OSRM route
  let seq = 0;

  // ---- form ----
  const from = $('tour-from'), to = $('tour-to');
  for (const sel of [from, to]) {
    for (const division of [...new Set(DISTRICTS.map(d => d.division))]) {
      const group = document.createElement('optgroup');
      group.label = division + ' বিভাগ';
      for (const d of DISTRICTS.filter(d => d.division === division)) group.appendChild(new Option(d.bn, d.id));
      sel.appendChild(group);
    }
  }
  from.value = plan.from.id;
  to.value = plan.to.id;

  // A − value + control bound to one field of the plan.
  function stepper(id, key, min, max, onChange) {
    const box = $(id), value = el('b');
    const set = v => { plan[key] = Math.max(min, Math.min(max, v)); value.textContent = num(plan[key]); };
    const btn = (icon, step) => {
      const b = el('button', 'icon-btn');
      b.innerHTML = svg(icon);
      b.setAttribute('aria-label', step > 0 ? 'বাড়ান' : 'কমান');
      b.addEventListener('click', () => { set(plan[key] + step); if (onChange) onChange(); update(); });
      return b;
    };
    box.append(btn('minus', -1), value, btn('plus', 1));
    set(plan[key]);
    return set;
  }
  const setRooms = stepper('tour-rooms', 'rooms', 1, 20, () => { plan.roomsTouched = true; });
  stepper('tour-people', 'people', 1, 30, () => { if (!plan.roomsTouched) setRooms(Math.ceil(plan.people / 2)); });
  stepper('tour-nights', 'nights', 0, 30);

  // A two- or three-way choice; `pick(index)` runs on tap.
  function choice(id, labels, current, pick) {
    const box = $(id);
    labels.forEach((label, i) => {
      const b = el('button', i === current ? 'on' : '', label);
      b.addEventListener('click', () => {
        for (const n of box.children) n.classList.toggle('on', n === b);
        pick(i);
        update();
      });
      box.appendChild(b);
    });
  }
  choice('tour-class', ['নন-এসি', 'এসি'], 0, i => { plan.ac = i === 1; });
  choice('tour-way', ['আসা-যাওয়া', 'শুধু যাওয়া'], 0, i => { plan.roundTrip = i === 0; });
  const setRoomPrice = () => { plan.roomPrice = hotelPrices(plan.to)[plan.tier]; plan.priceTouched = false; $('tour-room-price').value = plan.roomPrice; };
  choice('tour-tier', HOTEL_NAMES, plan.tier, i => { plan.tier = i; setRoomPrice(); });
  choice('tour-mode', ['বাস', 'বিমান'], 0, i => { plan.mode = i === 1 ? 'air' : 'bus'; });

  for (const [id, key] of [['tour-room-price', 'roomPrice'], ['tour-food', 'food'], ['tour-other', 'other'], ['tour-air-fare', 'airFare']]) {
    $(id).value = plan[key];
    $(id).addEventListener('input', () => {
      plan[key] = Math.max(0, +$(id).value || 0);
      if (key === 'roomPrice') plan.priceTouched = true;
      update();
    });
  }
  from.addEventListener('change', () => { plan.from = districtById(from.value); loadRoute(); });
  to.addEventListener('change', () => {
    plan.to = districtById(to.value);
    if (!plan.priceTouched) setRoomPrice();        // a different town, a different going rate
    loadRoute();
  });
  const canFly = () => plan.from !== plan.to && AIRPORTS.includes(plan.from.id) && AIRPORTS.includes(plan.to.id);
  const flying = () => plan.mode === 'air' && canFly();

  // ---- cost ----
  // One-way bus fare per person: the counter fare when one end is Dhaka and we have it, otherwise the
  // government per-km rate over the road distance (AC taken as double, since AC fares are not regulated).
  function busFareEach() {
    if (flying()) return plan.airFare;
    const other = plan.from === dhaka ? plan.to : plan.to === dhaka ? plan.from : null;
    const f = other && MARKET_FARES[other.id], official = other && BRTA_FARES[other.id];
    if (official && !plan.ac) return (official[2] + official[3]) / 2;      // BRTA chart: between a 51- and a 40-seat bus
    if (f) {
      const nonAc = (f[0] + f[1]) / 2;
      return plan.ac ? (f.length > 2 ? (f[2] + f[3]) / 2 : nonAc * 1.6) : nonAc;
    }
    if (plan.km == null) return null;
    const base = busFare(busRule(plan.from, plan.to), plan.km);
    return plan.ac ? base * 2 : base;
  }

  function costs() {
    const each = busFareEach();
    const days = plan.nights + 1;
    const bus = each == null ? null : each * plan.people * (plan.roundTrip ? 2 : 1);
    const hotel = plan.roomPrice * plan.rooms * plan.nights;
    const food = plan.food * plan.people * days;
    const other = plan.other * plan.people * days;
    const total = bus == null ? null : bus + hotel + food + other;
    return { each, bus, hotel, food, other, total, perHead: total == null ? null : total / plan.people, days };
  }

  async function loadRoute() {
    const mine = ++seq;
    plan.km = null;
    update();
    if (plan.from === plan.to) return;
    const key = plan.from.id + '>' + plan.to.id;
    try {
      if (!routes.has(key)) routes.set(key, await getRoute([plan.from, plan.to]));
      if (mine !== seq) return;
      plan.km = routes.get(key).distance / 1000;
      plan.hours = routes.get(key).duration / 3600;
    } catch { /* the counter fare, if any, still works without the distance */ }
    update();
  }

  function update() {
    const c = costs(), same = plan.from === plan.to;
    const money = v => v == null ? '…' : taka(v);
    $('tour-route-note').textContent = same ? 'দুটি আলাদা জেলা বেছে নিন।'
      : plan.km == null ? 'দূরত্ব বের করা হচ্ছে…' : `সড়কপথে ${num(plan.km, 1)} কিমি · প্রায় ${fmtMin(plan.hours * 60)}`;
    const air = flying();
    $('tour-bus-opts').hidden = air;
    $('tour-air-opt').hidden = !air;
    $('tour-bus-each').textContent = plan.mode === 'air' && !air ? 'এই দুই জেলার মধ্যে সরাসরি বিমান নেই — বাস ধরা হলো।'
      : c.each == null ? '…' : `জনপ্রতি ${taka(c.each)} · এক দিকে`;
    const ops = same ? [] : [...new Set([...operatorsBetween(plan.from, plan.to).map(o => o.bn),
      ...(plan.from === dhaka ? DIVISION_OPERATORS[plan.to.division] || [] : [])])];
    $('tour-ops').replaceChildren(...(air ? [] : ops.slice(0, 8)).map(n => el('div', 'chip', n)));
    // Hotels the map knows near the destination — names only; the room price above is still an estimate.
    const hotels = OSM_INDEX.filter(p => p.kind === 'o').map(p => ({ p, d: haversineKm(plan.to, p) })).filter(x => x.d <= 15)
      .sort((a, b) => (b.p.x.st || 0) - (a.p.x.st || 0) || a.d - b.d).slice(0, 10);
    $('tour-hotels').replaceChildren(...hotels.map(({ p }) => el('div', 'chip', p.x.st ? `${p.bn} · ${num(p.x.st)}★` : p.bn)));
    $('tour-hotels-label').hidden = !hotels.length;

    const rows = [
      [air ? 'বিমান ভাড়া' : 'বাস ভাড়া', c.bus, `${num(plan.people)} জন সদস্য${plan.roundTrip ? ' · আসা-যাওয়া' : ''}`],
      ['হোটেল', c.hotel, `${num(plan.rooms)} রুম × ${num(plan.nights)} রাত`],
      ['খাবার', c.food, `${num(c.days)} দিন`],
      ['অন্যান্য', c.other, 'ঘোরাঘুরি, টিকিট']
    ];
    $('tour-rows').replaceChildren(...rows.map(([label, value, sub]) => {
      const r = el('div', 'rule');
      const left = el('span');
      left.append(document.createTextNode(label), el('small', null, sub));
      r.append(left, el('b', null, money(value)));
      return r;
    }));
    $('tour-total').textContent = money(c.total);
    $('tour-per-head').textContent = money(c.perHead);
    $('tour-make').disabled = same || c.total == null;
    // the bar under the total: each cost's share, in the colours of its row
    const parts = [c.bus || 0, c.hotel, c.food, c.other], whole = parts.reduce((x, y) => x + y, 0) || 1;
    [...$('tp-bar').children].forEach((b, i) => { b.style.flexGrow = String(parts[i] / whole); });
    $('tp-float-n').textContent = money(c.perHead);
    paintHero();
  }

  // The trip's header shows the destination's own picture (from the district guide, once it has loaded).
  let heroFor = '';
  function paintHero() {
    if (heroFor === plan.to.id) return;
    const g = typeof GUIDE !== 'undefined' && GUIDE && GUIDE[plan.to.id];
    if (!g) { if (typeof loadGuide === 'function') loadGuide().then(() => { if (GUIDE) paintHero(); }).catch(() => {}); return; }
    heroFor = plan.to.id;
    const hero = $('tp-hero');
    hero.querySelector('.dg-img')?.remove();
    photo(hero, coverOf(g), plan.to.division, 1280);
  }
  $('tp-float').addEventListener('click', () => $('tp-sum').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  // the floating total shows only while the tour tab is open and its summary is out of sight
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => $('tp-float').classList.toggle('show', !e.isIntersecting && e.boundingClientRect.top > 0)).observe($('tp-sum'));
  // …and steps aside while the finished card and its buttons are on screen
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => $('tp-float').classList.toggle('away', e.isIntersecting)).observe($('tour-card'));

  // ---- photos ----
  function drawThumbs() {
    const box = $('tour-photos');
    if ($('tour-photo-n')) $('tour-photo-n').textContent = `${num(photos.length)}/${num(5)}`;
    box.replaceChildren(...photos.map((img, i) => {
      const b = el('button', 'tour-thumb');
      b.setAttribute('aria-label', 'ছবি সরান');
      b.style.backgroundImage = `url(${img.src})`;
      b.innerHTML = svg('close');
      b.addEventListener('click', () => { URL.revokeObjectURL(img.src); photos.splice(i, 1); drawThumbs(); });
      return b;
    }));
    if (photos.length < 5) {
      const add = el('button', 'tour-thumb add');
      add.innerHTML = svg('plus');
      add.setAttribute('aria-label', 'ছবি যোগ করুন');
      add.addEventListener('click', () => $('tour-file').click());
      box.appendChild(add);
    }
  }
  $('tour-file').addEventListener('change', async e => {
    for (const file of [...e.target.files].slice(0, 5 - photos.length)) {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      try { await img.decode(); photos.push(img); } catch { URL.revokeObjectURL(img.src); }
    }
    e.target.value = '';
    drawThumbs();
  });
  drawThumbs();

  // ---- the card (1080 × 1350, the portrait size social apps show largest) ----
  const canvas = $('tour-canvas'), ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let backdrop = null, frame = 0;

  const ease = t => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  const span = (t, a, b) => ease((t - a) / (b - a));           // progress of one part of the animation
  const pop = t => { const e = Math.max(0, Math.min(1, t)); return e === 0 ? 0 : 1 + 0.25 * Math.sin(e * Math.PI) * (1 - e) - (1 - e) ** 3; };

  // Draw an image so it fills a box, cropping the overflow (like CSS object-fit: cover).
  function cover(img, x, y, w, h) {
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }

  function wrap(text, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  // ---- the story and the card ----
  // The story is the journey on the map of Bangladesh; the card (the picture that is saved) is a poster of the
  // trip. No money is shown anywhere — they are about the trip, not its cost.
  const TINTS = ['#2dd4bf', '#f59e0b', '#f472b6', '#8b5cf6', '#22c55e'];
  const FONT = '"Anek Bangla", sans-serif';
  // a number with its word, in either language (the dictionary would read 'N জন' as ratings)
  const count = (n, bn, one, many) => LANG === 'en' ? `${num(n)} ${n === 1 ? one : many}` : `${num(n)} ${bn}`;
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = v => Math.max(0, Math.min(1, v));
  const smooth = v => { const x = clamp(v); return x * x * (3 - 2 * x); };
  // What the story tells: the one-district plan, or — through TourStory.play — a trip across several districts.
  let custom = null;
  const ST = () => custom || { stops: [plan.from, plan.to], from: plan.from, to: plan.to, people: plan.people, nights: plan.nights, days: plan.nights + 1, air: flying(), line: null, km: null, hours: null, title: '', multi: false };
  const rand = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // the same "random" every frame

  function names() {
    return ($('tour-names') ? $('tour-names').value : '').split(/[,،\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 8);
  }
  const groupSize = () => Math.min(5, Math.max(photos.length, names().length, Math.min(ST().people, 5)));
  function joined(list) {
    if (!list.length) return '';
    if (LANG === 'en') return list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list.at(-1) : list[0];
    return list.length > 1 ? list.slice(0, -1).join(', ') + ' ও ' + list.at(-1) : list[0];
  }
  const tripKm = () => ST().km != null ? ST().km : ST().air ? haversineKm(ST().from, ST().to) : plan.km || haversineKm(ST().from, ST().to) * 1.25;
  // a bus averages about 42 km/h door to door on Bangladesh's highways (Dhaka–Cox's Bazar ≈ 9½ h); a domestic flight
  // is about an hour. Rounded to the half hour — these are estimates, not timetables.
  const tripHours = () => ST().hours != null ? ST().hours : Math.round((ST().air ? Math.max(0.75, haversineKm(ST().from, ST().to) / 450 + 0.4) : tripKm() / 42) * 2) / 2;
  const tripTitle = () => (custom && custom.title) || $('tour-name').value.trim() || tr(`${ST().to.bn} ট্যুর`);
  const tripDate = () => $('tour-date').value ? new Date($('tour-date').value).toLocaleDateString(LANG === 'en' ? 'en-GB' : 'bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const chainText = () => ST().stops.map(d => tr(d.bn)).join(' → ');
  // ---- drawing kit ----
  function setFont(weight, size, tracking = 0) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${tracking}px`;
  }
  // A line of text that rises out of a mask as it fades in — the reveal used for every headline.
  function rise(text, x, y, size, p, { weight = 800, color = '#ffffff', align = 'left', tracking = -1, max } = {}) {
    if (p <= 0) return;
    const e = ease(p);
    setFont(weight, size, tracking);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y - size * 1.25, W, size * 1.6); ctx.clip();
    ctx.globalAlpha *= e; ctx.fillStyle = color; ctx.textAlign = align;
    ctx.fillText(text, x, y + (1 - e) * size * 0.9, max);
    ctx.restore();
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  function glass(x, y, w, h, r, { blurFrom = null, tint = 'rgba(255,255,255,.10)' } = {}) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip();
    if (blurFrom && 'filter' in ctx) { ctx.filter = 'blur(26px) saturate(1.3)'; blurFrom(); ctx.filter = 'none'; }
    ctx.fillStyle = tint; ctx.fillRect(x, y, w, h);
    const hi = ctx.createLinearGradient(0, y, 0, y + h);
    hi.addColorStop(0, 'rgba(255,255,255,.16)'); hi.addColorStop(0.4, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi; ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x + 1, y + 1, w - 2, h - 2, r); ctx.stroke();
  }
  function glassPill(text, x, y, { size = 32, align = 'left', strong = false } = {}) {
    setFont(700, size);
    const w = ctx.measureText(text).width + size * 1.3, h = size * 1.85, left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    if (strong) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(left, y, w, h, h / 2); ctx.fill(); }
    else glass(left, y, w, h, h / 2, { tint: 'rgba(255,255,255,.12)' });
    ctx.fillStyle = strong ? '#04140f' : '#ffffff'; ctx.textAlign = 'left';
    ctx.fillText(text, left + size * 0.65, y + h * 0.67);
    return w;
  }
  // One person: a round photo, or a soft gradient with the initial, inside a thin bright ring.
  function face(i, cx, cy, r, glow = 0) {
    if (glow > 0) {
      const g = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.9);
      g.addColorStop(0, TINTS[i % 5] + '66'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha *= glow; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha /= glow;
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (photos[i]) cover(photos[i], cx - r, cy - r, r * 2, r * 2);
    else {
      const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      g.addColorStop(0, TINTS[i % 5]); g.addColorStop(1, '#0b1220');
      ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      const n = names()[i];
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
      if (n) { setFont(700, Math.round(r * 0.9)); ctx.fillText([...n][0], cx, cy + r * 0.32); }
      else { ctx.globalAlpha *= 0.9; ctx.beginPath(); ctx.arc(cx, cy - r * 0.18, r * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy + r * 0.88, r * 0.66, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha /= 0.9; }
      ctx.textAlign = 'left';
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(3, r * 0.06);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  }
  // Small line icons, drawn in a 48 px box centred on (0, 0).
  function glyph(kind, color = '#04140f') {
    ctx.strokeStyle = color; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'plane') {
      ctx.moveTo(-16, 2); ctx.lineTo(16, -10); ctx.lineTo(4, 2); ctx.lineTo(16, 14); ctx.lineTo(-4, 4); ctx.lineTo(-12, 12); ctx.lineTo(-10, 2); ctx.closePath();
    } else {
      ctx.roundRect(-13, -15, 26, 26, 6); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.moveTo(-8, 16); ctx.lineTo(-8, 13); ctx.moveTo(8, 16); ctx.lineTo(8, 13);
    }
    ctx.stroke();
    if (kind !== 'plane') { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-6, 6, 2.2, 0, Math.PI * 2); ctx.arc(6, 6, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }

  // ---- the map: the real border of Bangladesh, the real road ----
  const K = Math.cos(23.7 * Math.PI / 180);
  const proj = ([lon, lat]) => [lon * K, -lat];
  function routeLine() {
    if (ST().line && ST().line.length > 1) { const L = ST().line, step = Math.max(1, Math.floor(L.length / 300)); return L.filter((_, i) => i % step === 0 || i === L.length - 1); }
    const r = routes.get(ST().from.id + '>' + ST().to.id), line = !ST().air && r && r.geometry && r.geometry.coordinates;
    if (line && line.length > 1) { const step = Math.max(1, Math.floor(line.length / 300)); return line.filter((_, i) => i % step === 0 || i === line.length - 1); }
    // no road yet (or flying): a gentle arc between the two towns
    const a = [ST().from.lon, ST().from.lat], b = [ST().to.lon, ST().to.lat], n = [-(b[1] - a[1]), b[0] - a[0]], bend = ST().air ? 0.22 : 0.08;
    return Array.from({ length: 60 }, (_, i) => { const u = i / 59, s = Math.sin(Math.PI * u) * bend; return [lerp(a[0], b[0], u) + n[0] * s, lerp(a[1], b[1], u) + n[1] * s]; });
  }
  function boundsOf(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { const [x, y] = proj(p); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1 };
  }
  // the view that fits a box into the frame (with room above for the headline and below for the panel)
  function fit(b, pad) {
    const top = 360, bottom = H - 320, w = (b.x1 - b.x0) || 0.01, h = (b.y1 - b.y0) || 0.01;
    const s = Math.min((W - pad * 2) / w, (bottom - top - pad * 2) / h);
    return { s, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, ox: W / 2, oy: (top + bottom) / 2 };
  }
  const blend = (a, b, k) => ({ s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), k)), cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), ox: a.ox, oy: a.oy });
  const turn = (v, x, y) => { if (!v.rot) return [x, y]; const c = Math.cos(v.rot), n = Math.sin(v.rot), dx = x - v.ox, dy = y - v.oy; return [v.ox + dx * c - dy * n, v.oy + dx * n + dy * c]; };
  const toScreen = (v, p) => { const [x, y] = proj(p); return turn(v, v.ox + (x - v.cx) * v.s, v.oy + (y - v.cy) * v.s); };

  // Districts the road passes, in order, with how far along the road each one is (0..1).
  function along(line) {
    const pts = []; let run = 0;
    for (const [lon, lat] of line) { const q = { lon, lat }; if (pts.length) run += haversineKm(pts.at(-1), q); pts.push({ ...q, run }); }
    const cut = ST().air ? 0 : 8;
    return DISTRICTS.filter(d => !ST().stops.includes(d)).map(d => {
      let best = null;
      for (const q of pts) { const km = haversineKm(d, q); if (!best || km < best.km) best = { km, run: q.run }; }
      return { d, u: best.run / (run || 1), dist: best.km };
    }).filter(x => x.dist < cut && x.u > 0.06 && x.u < 0.94).sort((x, y) => x.u - y.u).slice(0, 5);
  }

  // ---- the story: one continuous flight over the map of Bangladesh ----
  // The country rises out of the dark, the camera flies down to where the trip starts, follows the bus (or the
  // plane) along the real road while the kilometres count up and towns on the way light up, a pin drops at the
  // destination, and the camera pulls back over the whole route with the trip's name and its people.
  const toScreenP = (v, [x, y]) => turn(v, v.ox + (x - v.cx) * v.s, v.oy + (y - v.cy) * v.s);
  const mix = (a, b, k) => ({ s: Math.exp(lerp(Math.log(a.s), Math.log(b.s), k)), cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), ox: lerp(a.ox, b.ox, k), oy: lerp(a.oy, b.oy, k), rot: lerp(a.rot || 0, b.rot || 0, k) });
  let pathCache = null;
  // the route in map units, with its length so far at each point, where each stop sits on it, and the towns it passes
  function routePath() {
    const line = routeLine(), key = ST().stops.map(d => d.id).join('>') + ':' + line.length + ':' + line[0] + ':' + line.at(-1) + ':' + ST().air;
    if (pathCache && pathCache.key === key) return pathCache;
    const P = line.map(proj), len = [0];
    for (let i = 1; i < P.length; i++) len.push(len[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = len.at(-1) || 1e-9;
    const stops = ST().stops.filter((d, i, a) => a.indexOf(d) === i).map(d => {
      if (d === ST().from) return { d, u: 0 };
      const q = proj([d.lon, d.lat]); let bi = 0, bd = Infinity;
      P.forEach((p, i) => { const dd = Math.hypot(p[0] - q[0], p[1] - q[1]); if (dd < bd) { bd = dd; bi = i; } });
      return { d, u: len[bi] / total };
    });
    pathCache = { key, line, P, len, total, stops, towns: along(line), whole: fit(boundsOf(BD_OUTLINE[0]), 56), all: { ...fit(boundsOf(line), 170), oy: 780 } };
    return pathCache;
  }
  // a point (and the heading) at a fraction of the way
  function pointAt(path, u) {
    const target = path.total * clamp(u), { P, len } = path;
    if (P.length < 2) return { x: P[0][0], y: P[0][1], ang: 0 };
    let j = 1; while (j < P.length - 1 && len[j] < target) j++;
    const k = clamp((target - len[j - 1]) / ((len[j] - len[j - 1]) || 1));
    return { x: lerp(P[j - 1][0], P[j][0], k), y: lerp(P[j - 1][1], P[j][1], k), j, ang: Math.atan2(P[j][1] - P[j - 1][1], P[j][0] - P[j - 1][0]) };
  }
  // the timeline (T from 0 to 1)
  const PH = { fly: 0.09, go: 0.2, land: 0.8, back: 0.9 };
  const travel = T => { const x = clamp((T - PH.go) / (PH.land - PH.go)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };   // ease in and out
  function camera(T, path) {
    const { whole, all } = path;
    const near = Math.min(Math.max(all.s * 2.2, whole.s * 3.2), whole.s * 4.5);
    const at = u => { const h = pointAt(path, u); return { s: near, cx: h.x, cy: h.y, ox: W / 2, oy: H * 0.5 }; };
    // it opens turned a little and high up, and straightens as it comes down
    const wide = { ...whole, s: whole.s * (0.86 + 0.14 * smooth(T / PH.fly)), rot: -0.13 + 0.05 * smooth(T / PH.fly) };
    if (T < PH.fly) return wide;
    if (T < PH.go) return mix(wide, at(0), smooth((T - PH.fly) / (PH.go - PH.fly)));
    if (T < PH.land) return at(travel(T));
    if (T < PH.back) { const k = (T - PH.land) / (PH.back - PH.land), punch = 1 + 0.08 * Math.sin(Math.PI * clamp(k * 3)) * (1 - k); const m = mix(at(1), all, smooth(k)); return { ...m, s: m.s * punch }; }
    return { ...all, s: all.s * (1 + 0.03 * smooth((T - PH.back) / (1 - PH.back))) };
  }

  // the base map: the sea, a faint grid of degrees, the land raised a little above it, its coast lit, the towns
  function mapBase(v, T, path) {
    const sea = ctx.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, '#081726'); sea.addColorStop(1, '#030b14');
    ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
    // a faint light drifting slowly behind the map
    for (const [x, y, r, c] of [
      [0.15 + 0.10 * Math.sin(T * 5), 0.18 + 0.06 * Math.cos(T * 4), 720, 'rgba(56,189,248,.08)'],
      [0.40 + 0.12 * Math.sin(T * 3 + 2), 0.92, 820, 'rgba(45,212,191,.08)']]) {
      const ag = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r);
      ag.addColorStop(0, c); ag.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ag; ctx.fillRect(0, 0, W, H);
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(148,190,230,.06)'; ctx.lineWidth = 1.5;
    for (let lon = 78; lon <= 104; lon++) { const [a, b] = toScreen(v, [lon, 10]), [c, d] = toScreen(v, [lon, 34]); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
    for (let lat = 10; lat <= 34; lat++) { const [a, b] = toScreen(v, [78, lat]), [c, d] = toScreen(v, [104, lat]); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
    ctx.restore();
    const show = smooth(T / 0.06);
    const land = new Path2D();
    for (const ring of BD_OUTLINE) { ring.forEach((p, i) => { const [x, y] = toScreen(v, p); if (i) land.lineTo(x, y); else land.moveTo(x, y); }); land.closePath(); }
    ctx.save(); ctx.globalAlpha = show;
    // the sea's name, quietly
    { const [bx, by] = toScreen(v, [90.4, 20.9]); setFont(600, 30); ctx.fillStyle = 'rgba(148,190,230,.30)'; ctx.textAlign = 'center'; ctx.fillText(tr('বঙ্গোপসাগর'), bx, by); ctx.textAlign = 'left'; }
    // the land, lifted off the sea by its shadow
    ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 22;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#173a35'); g.addColorStop(1, '#0e2826');
    ctx.fillStyle = g; ctx.fill(land);
    ctx.shadowColor = 'transparent';
    // the coast: a wide soft glow, then a fine bright line, drawn in as the map appears
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(45,212,191,.16)'; ctx.lineWidth = 16; ctx.stroke(land);
    ctx.strokeStyle = 'rgba(153,246,228,.6)'; ctx.lineWidth = 2.6; ctx.stroke(land);
    // district towns: points of light, and their names once the camera is close
    const zoom = v.s / path.whole.s, nameA = clamp((zoom - 2.2) / 1.2) * 0.75;
    for (const d of DISTRICTS) {
      const [x, y] = toScreen(v, [d.lon, d.lat]);
      if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
      ctx.fillStyle = 'rgba(255,255,255,.30)'; ctx.beginPath(); ctx.arc(x, y, zoom > 2 ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
      if (nameA > 0 && !ST().stops.includes(d)) { setFont(500, 24); ctx.fillStyle = `rgba(226,240,236,${nameA * 0.7})`; ctx.fillText(tr(d.bn), x + 12, y + 8); }
    }
    ctx.restore();
  }
  // a map pin that drops in and lands with a ripple
  function pin(x, y, color, s, t) {
    if (s <= 0) return;
    const drop = (1 - Math.min(1, s)) * 90;
    ctx.save();
    // the ripple where it lands
    if (s >= 1) for (let k = 0; k < 2; k++) {
      const r = ((t * 1.6 + k * 0.5) % 1);
      ctx.strokeStyle = color; ctx.globalAlpha = 0.5 * (1 - r); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, 20 + r * 60, (20 + r * 60) * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = Math.min(1, s * 1.5);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(x, y - drop);
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-8, -18, -28, -30, -28, -54); ctx.arc(0, -54, 28, Math.PI, 0); ctx.bezierCurveTo(28, -30, 8, -18, 0, 0); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -54, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function brandPill(a) {
    ctx.save(); ctx.globalAlpha = a;
    glass(56, 56, 252, 62, 31, { tint: 'rgba(10,15,25,.35)' });
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(68, 67, 40, 40, 12); ctx.fill();
    ctx.fillStyle = '#0a8f62'; ctx.beginPath(); ctx.arc(88, 87, 8, 0, Math.PI * 2); ctx.fill();
    setFont(800, 28); ctx.fillStyle = '#ffffff'; ctx.fillText('Manzeela', 120, 97);
    ctx.restore();
  }

  // soft clouds that open around the camera as it comes down
  function clouds(T) {
    const k = clamp((T - 0.02) / 0.2);
    if (k <= 0 || k >= 1) return;
    const a = Math.sin(Math.PI * Math.min(1, k * 1.3)) * (1 - k * 0.4);
    for (let i = 0; i < 10; i++) {
      const grow = 1 + k * (2.4 + rand(i + 60) * 2.2);
      const x = W / 2 + (rand(i + 40) * W - W / 2) * grow, y = H / 2 + (rand(i + 50) * H - H / 2) * grow, r = (200 + rand(i + 70) * 240) * grow;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(236,244,248,${0.6 * a})`); g.addColorStop(0.55, `rgba(214,230,240,${0.28 * a})`); g.addColorStop(1, 'rgba(214,230,240,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // sparks left behind the traveller
  function sparks(v, path, p, T) {
    if (p <= 0.002 || p >= 0.998) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i <= 18; i++) {
      const q = pointAt(path, p - i * 0.0035);
      const [x, y] = toScreenP(v, [q.x, q.y]), f = 1 - i / 19;
      const jx = Math.sin(T * 90 + i * 1.7) * 7 * (1 - f), jy = Math.cos(T * 80 + i * 2.3) * 7 * (1 - f);
      ctx.fillStyle = i % 3 ? `rgba(94,234,212,${0.55 * f})` : `rgba(251,191,36,${0.6 * f})`;
      ctx.beginPath(); ctx.arc(x + jx, y + jy, 3 + 6 * f, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function beatMap(T) {
    const path = routePath(), v = camera(T, path), air = ST().air, p = travel(T);
    mapBase(v, T, path);
    const P = path.P.map(q => toScreenP(v, q)), head = pointAt(path, p), [hx, hy] = toScreenP(v, [head.x, head.y]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // the way still ahead: a soft dotted line
    if (T > PH.fly) {
      ctx.globalAlpha = smooth((T - PH.fly) / 0.06);
      ctx.strokeStyle = 'rgba(255,255,255,.30)'; ctx.lineWidth = 5; ctx.setLineDash([1, 16]);
      ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    // the way travelled: glow, a teal-to-gold line, a white core
    if (p > 0) {
      const trail = P.slice(0, head.j); trail.push([hx, hy]);
      const [sx, sy] = P[0], [ex, ey] = P.at(-1);
      const grad = ctx.createLinearGradient(sx, sy, ex, ey);
      grad.addColorStop(0, '#2dd4bf'); grad.addColorStop(1, '#fbbf24');
      for (const [w, c] of [[34, 'rgba(45,212,191,.16)'], [16, grad], [5, 'rgba(255,255,255,.9)']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); trail.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      }
    }
    // towns on the way light up as the traveller passes them
    for (const x of path.towns) {
      if (x.u > p) continue;
      const [tx, ty] = toScreen(v, [x.d.lon, x.d.lat]), a = clamp((p - x.u) * 12);
      ctx.globalAlpha = a; ctx.fillStyle = '#5eead4'; ctx.beginPath(); ctx.arc(tx, ty, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(94,234,212,.4)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, ty, 9 + 16 * (1 - a), 0, Math.PI * 2); ctx.stroke();
      setFont(700, 28); ctx.fillStyle = '#ffffff'; ctx.textAlign = tx > W * 0.6 ? 'right' : 'left';
      ctx.fillText(tr(x.d.bn), tx + (tx > W * 0.6 ? -20 : 20), ty + 10); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    // the stops: white where it starts, gold where it goes; each drops in when it is reached
    for (const [n, s] of path.stops.entries()) {
      const [x, y] = toScreen(v, [s.d.lon, s.d.lat]), start = s.d === ST().from;
      const when = start ? PH.fly + 0.05 : PH.go + (PH.land - PH.go) * Math.max(0, s.u - 0.02);
      const k = pop((T - when) / 0.05);
      pin(x, y, start ? '#e2e8f0' : '#f59e0b', k, T * 14);
      if (k > 0.6) {
        ctx.globalAlpha = clamp((k - 0.6) * 3);
        // where it starts, above its pin; where it goes, below (so the road and the towns stay clear)
        const below = ST().multi ? n % 2 === 1 : !start;
        glassPill(tr(s.d.bn), x, below ? y + 24 : y - 160, { size: 30, align: 'center', strong: !start });
        ctx.globalAlpha = 1;
      }
    }
    sparks(v, path, p, T);
    // the traveller: a white disc with a bus (or a plane turned to its heading), a halo and a ring
    if (T > PH.go - 0.02 && T < PH.land + 0.02) {
      const a = clamp((T - PH.go + 0.02) * 30) * clamp((PH.land + 0.02 - T) * 30);
      ctx.save(); ctx.globalAlpha = a;
      const halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, 110);
      halo.addColorStop(0, 'rgba(94,234,212,.5)'); halo.addColorStop(1, 'rgba(94,234,212,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(hx, hy, 110, 0, Math.PI * 2); ctx.fill();
      const ring = (T * 9) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - ring)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx, hy, 40 + ring * 46, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx, hy, 38, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.translate(hx, hy); if (air) ctx.rotate(head.ang + 0.35); glyph(air ? 'plane' : 'bus');
      ctx.restore();
    }

    clouds(T);
    // the words: shaded top and bottom so they always read
    const top = ctx.createLinearGradient(0, 0, 0, 420); top.addColorStop(0, 'rgba(3,8,15,.85)'); top.addColorStop(1, 'rgba(3,8,15,0)');
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, 420);
    const foot = ctx.createLinearGradient(0, H - 420, 0, H); foot.addColorStop(0, 'rgba(3,8,15,0)'); foot.addColorStop(1, 'rgba(3,8,15,.9)');
    ctx.fillStyle = foot; ctx.fillRect(0, H - 420, W, 420);
    brandPill(smooth(T / 0.05));
    const st = ST(), route = st.multi ? chainText() : `${tr(st.from.bn)}  →  ${tr(st.to.bn)}`;
    rise(`${tr(air ? 'বিমানে' : 'সড়কপথে')} · ${count(st.days, 'দিন', 'day', 'days')}${tripDate() ? ' · ' + tripDate() : ''}`, 72, 196, 32, (T - 0.02) * 12, { weight: 600, color: '#5eead4', tracking: 2 });
    setFont(800, 88, -2);
    const title = wrap(tripTitle(), W - 144).slice(0, 2);
    title.forEach((l, i) => {
      const k = pop((T - 0.03 - i * 0.012) * 9);
      if (k <= 0) return;
      ctx.save(); ctx.translate(72, 290 + i * 96); ctx.scale(k, k); ctx.translate(-72, -(290 + i * 96));
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24;
      rise(l, 72, 290 + i * 96, 88, Math.min(1, k), { tracking: -2 });
      ctx.restore();
    });
    { const u = smooth((T - 0.06) * 8), uy = 290 + title.length * 96 + 6; setFont(600, st.multi ? 32 : 38);
      const uw = Math.min(W - 144, ctx.measureText(route).width) * u, ug = ctx.createLinearGradient(72, 0, 72 + uw, 0);
      ug.addColorStop(0, 'rgba(94,234,212,.9)'); ug.addColorStop(1, 'rgba(251,191,36,.9)'); ctx.fillStyle = ug; if (uw > 1) { ctx.beginPath(); ctx.roundRect(72, uy, uw, 4, 2); ctx.fill(); } }
    rise(route, 72, 290 + title.length * 96 - 18, st.multi ? 32 : 38, (T - 0.05) * 10, { weight: 600, color: 'rgba(255,255,255,.82)', max: W - 144 });

    // the panel at the foot: the journey while it runs, the crew once it is done
    const py = H - 246, ph = 190;
    const run = clamp((T - PH.go + 0.04) * 14) * (1 - clamp((T - PH.land - 0.04) * 14));
    const done = clamp((T - PH.back + 0.02) * 12);
    if (run > 0) {
      ctx.save(); ctx.globalAlpha = run;
      glass(48, py, W - 96, ph, 40, { tint: 'rgba(8,14,24,.45)' });
      const km = num(Math.round(tripKm() * p));
      setFont(800, 84, -2); ctx.fillStyle = '#ffffff'; ctx.fillText(km, 92, py + 104);
      const kw = ctx.measureText(km).width;
      setFont(600, 34); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(tr('কিমি'), 92 + kw + 14, py + 104);
      ctx.textAlign = 'right'; setFont(700, 38); ctx.fillStyle = '#ffffff';
      ctx.fillText(p > 0.985 ? tr('পৌঁছে গেছি') : tr(`আর ${fmtMin(tripHours() * (1 - p) * 60)}`), W - 92, py + 82);
      setFont(500, 26); ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.fillText(tr(`মোট প্রায় ${fmtMin(tripHours() * 60)}`), W - 92, py + 120);
      ctx.textAlign = 'left';
      // progress, with its two ends
      const bx = 92, bw = W - 184, by = py + 148;
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.roundRect(bx, by, bw, 10, 5); ctx.fill();
      const pg = ctx.createLinearGradient(bx, 0, bx + bw, 0); pg.addColorStop(0, '#2dd4bf'); pg.addColorStop(1, '#fbbf24');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(bx, by, Math.max(10, bw * p), 10, 5); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bx + Math.max(5, bw * p), by + 5, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (done > 0) {
      ctx.save(); ctx.globalAlpha = done;
      glass(48, py, W - 96, ph, 40, { tint: 'rgba(8,14,24,.45)' });
      const n = groupSize(), nm = names(), r = 50, step = Math.min(84, 300 / Math.max(1, n - 1));
      for (let i = 0; i < n; i++) {
        const s = pop((T - PH.back - 0.01 - i * 0.012) / 0.04);
        if (s <= 0) continue;
        ctx.save(); ctx.translate(92 + r + i * step, py + ph / 2); ctx.scale(s, s); face(i, 0, 0, r); ctx.restore();
      }
      const tx = 92 + r * 2 + (n - 1) * step + 28, tw = W - 92 - tx;
      setFont(700, 34); ctx.fillStyle = '#ffffff';
      ctx.fillText(nm.length ? joined(nm.slice(0, n)) : (LANG === 'en' ? `A group of ${num(st.people)}` : `${num(st.people)} জনের দল`), tx, py + 84, tw);
      setFont(500, 27); ctx.fillStyle = 'rgba(255,255,255,.7)';
      const facts = [count(st.days, 'দিন', 'day', 'days'), count(Math.round(tripKm()), 'কিমি', 'km', 'km'), st.multi ? count(st.stops.filter(d => d !== st.from).length, 'জেলা', 'district', 'districts') : (st.nights ? count(st.nights, 'রাত', 'night', 'nights') : tr('দিনে দিনে'))];
      ctx.fillText(facts.join(' · '), tx, py + 128, tw);
      ctx.restore();
    }
    // arrival: a gold pill over the destination
    const arr = pop((T - PH.land) / 0.05) * (1 - clamp((T - PH.back) * 10));
    if (arr > 0) {
      const dest = path.stops.at(-1), [x, y] = toScreen(v, [dest.d.lon, dest.d.lat]);
      ctx.save(); ctx.globalAlpha = Math.min(1, arr); ctx.translate(x, y - 158); ctx.scale(arr, arr);
      glassPill(tr(st.multi ? 'সব ঘুরে এলাম' : 'পৌঁছে গেছি'), 0, 0, { size: 32, align: 'center', strong: true });
      ctx.restore();
    }
  }

  // ---- the photos for the poster, and the small map on its ticket ----
  // The photos are the destination districts' own (their guide covers and best places), loaded with CORS so the
  // poster can still be saved. No money is shown.
  const mosaicCache = new Map();
  let mosaic = [], mosaicCredit = [];
  function loadImage(url) {
    if (!url) return Promise.resolve(null);
    if (!mosaicCache.has(url)) mosaicCache.set(url, new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = typeof sized === 'function' ? sized(url, 960) : url; }));
    return mosaicCache.get(url);
  }
  async function loadMosaic() {
    const G = typeof GUIDE !== 'undefined' && GUIDE ? GUIDE : (typeof loadGuide === 'function' ? await loadGuide().catch(() => null) : null);
    const seen = new Set(), urls = [];
    const visit = ST().stops.filter(d => d !== ST().from);
    for (const d of visit) {                          // each district's cover first
      const g = G && G[d.id]; const u = g && coverOf(g);
      if (u && !seen.has(u)) { seen.add(u); urls.push(u); }
    }
    for (const d of visit) {                          // then their best-known places, to fill three tiles
      for (const s of ((G && G[d.id] && G[d.id].sights) || []).filter(s => s.img).slice(0, 3)) if (urls.length < 3 && !seen.has(s.img)) { seen.add(s.img); urls.push(s.img); }
    }
    // who took each photo, and its licence (tools/add-photo-credits.mjs): the poster prints the one it shows
    const creditOf = u => {
      for (const d of visit) {
        const g = G && G[d.id]; if (!g) continue;
        if (g.img === u) return { by: g.fileBy || '', lic: g.fileLic || '' };
        for (const x of g.sights || []) if (x.img === u) return { by: x.imgBy || '', lic: x.imgLic || '' };
      }
      return { by: '', lic: '' };
    };
    const got = await Promise.all(urls.slice(0, 3).map(async u => ({ img: await loadImage(u), credit: creditOf(u) })));
    const ok = got.filter(x => x.img);
    mosaic = ok.map(x => x.img);
    mosaicCredit = ok.map(x => x.credit);
  }
  function miniMap(x, y, h, p) {
    const b = boundsOf(BD_OUTLINE[0]), s = h / (b.y1 - b.y0), w = (b.x1 - b.x0) * s;
    const at = q => { const [px, py] = proj(q); return [x + (px - b.x0) * s, y + (py - b.y0) * s]; };
    ctx.save();
    ctx.beginPath(); BD_OUTLINE[0].forEach((q, i) => { const [a, c] = at(q); if (i) ctx.lineTo(a, c); else ctx.moveTo(a, c); }); ctx.closePath();
    ctx.fillStyle = 'rgba(45,212,191,.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(94,234,212,.5)'; ctx.lineWidth = 2; ctx.stroke();
    const line = routeLine(), pts = line.map(at);
    const upto = Math.max(1, Math.round(pts.length * clamp(p)));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [lw, c] of [[8, 'rgba(94,234,212,.25)'], [3.5, '#ecfeff']]) { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); pts.slice(0, upto).forEach(([a, c2], i) => i ? ctx.lineTo(a, c2) : ctx.moveTo(a, c2)); ctx.stroke(); }
    for (const d of ST().stops) { const [a, c] = at([d.lon, d.lat]); ctx.fillStyle = d === ST().from ? '#ffffff' : '#fbbf24'; ctx.beginPath(); ctx.arc(a, c, 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    return w;
  }
  // ---- the poster (1080 × 1350), in the manner of a travel agency's: the place's photo edge to edge, a hand-lettered
  // line over a huge name, a dotted path with the bus or plane, a boarding-pass ticket with the route, the days, the
  // group and a small map, and what the trip includes. No money is shown.
  const SCRIPT = '"Galada", "Anek Bangla", cursive';
  let scriptReady = null;
  // Galada (a Bangla hand-lettered face) is loaded only when a poster is made
  function loadScript() {
    if (!scriptReady) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Galada&display=swap';
      document.head.appendChild(l);
      scriptReady = Promise.race([new Promise(r => { l.onload = () => document.fonts.load('80px "Galada"', 'চলো যাই').then(r, r); l.onerror = r; }), new Promise(r => setTimeout(r, 3000))]);
    }
    return scriptReady;
  }
  // the app's own line icons, as pictures for the canvas (white)
  const iconCache = new Map();
  function iconImg(name) {
    if (!iconCache.has(name)) {
      const img = new Image();
      img.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`);
      iconCache.set(name, img);
    }
    return iconCache.get(name);
  }
  const posterIcons = () => ['bed', 'fork', 'compass', 'users'].forEach(iconImg);

  // the name as large as it fits
  function fitFont(text, weight, max, width, tracking = 0) {
    let size = max;
    for (; size > 60; size -= 6) { setFont(weight, size, tracking); if (ctx.measureText(text).width <= width) break; }
    return size;
  }
  function ticket(x, y, w, h, k) {
    const st = ST(), stubX = x + w - 250;
    ctx.save();
    // the paper, with a notch at each end of the tear line
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    // the outline drawn by hand, so the two notches bite into the paper
    const paper = new Path2D(), rr = 34, nr = 22;
    paper.moveTo(x + rr, y); paper.lineTo(stubX - nr, y); paper.arc(stubX, y, nr, Math.PI, 0, true);
    paper.arcTo(x + w, y, x + w, y + h, rr); paper.arcTo(x + w, y + h, x, y + h, rr);
    paper.lineTo(stubX + nr, y + h); paper.arc(stubX, y + h, nr, 0, Math.PI, true);
    paper.arcTo(x, y + h, x, y, rr); paper.arcTo(x, y, x + w, y, rr); paper.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(paper);
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(11,18,32,.18)'; ctx.lineWidth = 3; ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.moveTo(stubX, y + 30); ctx.lineTo(stubX, y + h - 30); ctx.stroke(); ctx.setLineDash([]);
    // the tag in the corner
    setFont(800, 22, 1);
    const tag = tr('ট্যুর পাস'), tw = ctx.measureText(tag).width + 36;
    ctx.fillStyle = '#e11d48'; ctx.beginPath(); ctx.roundRect(stubX - tw - 26, y + 26, tw, 40, 20); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillText(tag, stubX - tw - 8, y + 54);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    // from → to
    const ink = '#0b1220', soft = 'rgba(11,18,32,.5)', L = x + 44, R = stubX - 44;
    const last = st.multi ? st.stops.filter(d => d !== st.from).at(-1) : st.to;
    setFont(600, 24); ctx.fillStyle = soft;
    ctx.fillText(tr('থেকে'), L, y + 104);
    ctx.textAlign = 'right'; ctx.fillText(tr(st.multi ? 'হয়ে' : 'গন্তব্য'), R, y + 104); ctx.textAlign = 'left';
    const a = tr(st.from.bn), b = st.multi ? count(st.stops.filter(d => d !== st.from).length, 'জেলা', 'district', 'districts') : tr(last.bn);
    const big = Math.min(fitFont(a, 800, 64, (R - L) * 0.36), fitFont(b, 800, 64, (R - L) * 0.36));
    setFont(800, big, -1); ctx.fillStyle = ink; ctx.fillText(a, L, y + 104 + big + 6);
    const aw = ctx.measureText(a).width;
    ctx.textAlign = 'right'; ctx.fillText(b, R, y + 104 + big + 6); const bw = ctx.measureText(b).width; ctx.textAlign = 'left';
    // the line between, with the vehicle in its middle
    const ly = y + 104 + big * 0.62, lx0 = L + aw + 26, lx1 = R - bw - 26;
    if (lx1 - lx0 > 60) {
      ctx.strokeStyle = 'rgba(11,18,32,.28)'; ctx.lineWidth = 3; ctx.setLineDash([2, 10]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lx0, ly); ctx.lineTo(lx1, ly); ctx.stroke(); ctx.setLineDash([]);
      const mx = lx0 + (lx1 - lx0) * clamp(0.5 + (k - 1) * 0.5 + 0.0001);
      ctx.fillStyle = '#0a8f62'; ctx.beginPath(); ctx.arc(mx, ly, 26, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(mx, ly); ctx.scale(0.72, 0.72); glyph(st.air ? 'plane' : 'bus', '#ffffff'); ctx.restore();
      for (const ex of [lx0, lx1]) { ctx.fillStyle = '#0a8f62'; ctx.beginPath(); ctx.arc(ex, ly, 6, 0, Math.PI * 2); ctx.fill(); }
    }
    // the facts in three columns
    const cy = y + h - 76, cw = (R - L) / 3;
    ctx.fillStyle = 'rgba(11,18,32,.08)'; ctx.fillRect(L, cy - 44, R - L, 2);
    const cols = [
      [tr('সময়'), count(st.days, 'দিন', 'day', 'days') + (st.nights ? ' · ' + count(st.nights, 'রাত', 'night', 'nights') : '')],
      [tr('পথ'), count(Math.round(tripKm()), 'কিমি', 'km', 'km')],
      [tr('দল'), count(st.people, 'জন', 'person', 'people')]
    ];
    cols.forEach(([kk, v], i) => {
      const cx = L + i * cw;
      setFont(600, 22); ctx.fillStyle = soft; ctx.fillText(kk, cx, cy);
      setFont(800, 32); ctx.fillStyle = ink; ctx.fillText(v, cx, cy + 42, cw - 16);
    });
    if (tripDate()) { setFont(600, 22); ctx.fillStyle = soft; ctx.textAlign = 'right'; ctx.fillText(tripDate(), R, y + 54); ctx.textAlign = 'left'; }
    // the stub: the route on the map of Bangladesh, and the group's faces
    ctx.save();
    ctx.beginPath(); ctx.roundRect(stubX + 24, y + 24, x + w - stubX - 48, h - 48, 22); ctx.clip();
    const sg = ctx.createLinearGradient(0, y, 0, y + h); sg.addColorStop(0, '#0b2a33'); sg.addColorStop(1, '#071a20');
    ctx.fillStyle = sg; ctx.fillRect(stubX, y, x + w - stubX, h);
    ctx.restore();
    const mh = h - 150, mb = boundsOf(BD_OUTLINE[0]), mw = (mb.x1 - mb.x0) * mh / (mb.y1 - mb.y0);
    miniMap(stubX + (x + w - stubX - mw) / 2, y + 40, mh, k * 1.4);
    const n = groupSize(), r = 26, step = 34, fx = stubX + (x + w - stubX) / 2 - ((n - 1) * step) / 2;
    for (let i = 0; i < n; i++) face(i, fx + i * step, y + h - 62, r);
    ctx.restore();
  }
  function feature(icon, label, x, y) {
    glass(x - 46, y - 46, 92, 92, 46, { tint: 'rgba(255,255,255,.12)' });
    if (icon === 'bus' || icon === 'plane') { ctx.save(); ctx.translate(x, y); ctx.scale(1.1, 1.1); glyph(icon, '#ffffff'); ctx.restore(); }
    else { const img = iconImg(icon); if (img.complete && img.naturalWidth) ctx.drawImage(img, x - 23, y - 23, 46, 46); }
    setFont(700, 24); ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(label, x, y + 80); ctx.textAlign = 'left';
  }
  function drawCard(t) {
    const st = ST(), e = k => ease(clamp(k));
    const photo = mosaic[0];
    // the photo, settling from a slow zoom
    const z = 1.14 - 0.14 * e(t / 0.8);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    if (photo) { if ('filter' in ctx) ctx.filter = 'saturate(1.3) contrast(1.08)'; cover(photo, 0, 0, W, H); ctx.filter = 'none'; }
    else {
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0e5a7a'); g.addColorStop(0.55, '#0a7a5c'); g.addColorStop(1, '#073b33');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const v = fit(boundsOf(BD_OUTLINE[0]), -120);
      ctx.globalAlpha = 0.14; ctx.fillStyle = '#ffffff';
      for (const ring of BD_OUTLINE) { ctx.beginPath(); ring.forEach((p, i) => { const [x, y] = toScreen(v, p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // light: a deeper sky at the top for the words, a dark foot for the ticket
    let g = ctx.createLinearGradient(0, 0, 0, 640);
    g.addColorStop(0, 'rgba(3,10,22,.72)'); g.addColorStop(0.55, 'rgba(3,10,22,.28)'); g.addColorStop(1, 'rgba(3,10,22,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 640);
    g = ctx.createLinearGradient(0, 700, 0, H);
    g.addColorStop(0, 'rgba(3,8,14,0)'); g.addColorStop(0.45, 'rgba(3,8,14,.55)'); g.addColorStop(1, 'rgba(3,8,14,.94)');
    ctx.fillStyle = g; ctx.fillRect(0, 700, W, H - 700);

    // the top: the brand, and the days and nights
    ctx.globalAlpha = e(t * 4);
    glass(56, 52, 252, 62, 31, { tint: 'rgba(10,15,25,.30)' });
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(68, 63, 40, 40, 12); ctx.fill();
    ctx.fillStyle = '#0a8f62'; ctx.beginPath(); ctx.arc(88, 83, 8, 0, Math.PI * 2); ctx.fill();
    setFont(800, 28); ctx.fillStyle = '#ffffff'; ctx.fillText('Manzeela', 120, 93);
    const dn = count(st.days, 'দিন', 'day', 'days') + (st.nights ? '  |  ' + count(st.nights, 'রাত', 'night', 'nights') : '');
    setFont(800, 30); const dw = ctx.measureText(dn).width + 48;
    glass(W - 56 - dw, 52, dw, 62, 31, { tint: 'rgba(10,15,25,.30)' });
    ctx.fillStyle = '#ffffff'; ctx.fillText(dn, W - 56 - dw + 24, 94);
    ctx.globalAlpha = 1;

    // the hand-lettered line, then the name, huge
    const hero = st.multi ? tripTitle() : tr(st.to.bn);
    const own = st.multi ? '' : $('tour-name').value.trim();   // a several-district trip's name is already its headline
    ctx.save();
    ctx.globalAlpha = e((t - 0.08) * 4);
    ctx.translate(86, 300 - (1 - e((t - 0.08) * 4)) * 30); ctx.rotate(-0.07);
    ctx.font = `400 96px ${SCRIPT}`; ctx.fillStyle = '#fbbf24';
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18;
    ctx.fillText(tr(st.multi ? 'ঘুরে আসি' : 'চলো যাই'), 0, 0);
    ctx.restore();
    const hs = fitFont(hero, 800, 210, W - 150, -6);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
    rise(hero, 72, 300 + hs * 0.86, hs, (t - 0.14) * 3, { tracking: lerp(10, -6, e((t - 0.14) * 2.5)), max: W - 144 });
    ctx.restore();
    const sub = own && own !== hero ? own : st.multi ? chainText() : tr(`${st.to.division} বিভাগ`) + ' · ' + tr('বাংলাদেশ');
    rise(sub, 78, 300 + hs * 0.86 + 70, 40, (t - 0.24) * 3, { weight: 600, color: 'rgba(255,255,255,.92)', max: W - 156 });

    // the dotted path across the picture, drawn in, with the vehicle at its head
    const pk = e((t - 0.3) / 0.45);
    if (pk > 0) {
      const P0 = [30, 770], C1 = [330, 560], C2 = [700, 830], P1 = [1010, 650];
      const bz = u => { const m = 1 - u; return [m * m * m * P0[0] + 3 * m * m * u * C1[0] + 3 * m * u * u * C2[0] + u * u * u * P1[0], m * m * m * P0[1] + 3 * m * m * u * C1[1] + 3 * m * u * u * C2[1] + u * u * u * P1[1]]; };
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 4; ctx.setLineDash([14, 12]); ctx.lineCap = 'round';
      ctx.beginPath(); for (let i = 0; i <= 60 * pk; i++) { const [x, y] = bz(i / 60); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); ctx.setLineDash([]);
      const [hx, hy] = bz(pk), [nx, ny] = bz(Math.min(1, pk + 0.02));
      ctx.translate(hx, hy); if (st.air) ctx.rotate(Math.atan2(ny - hy, nx - hx) + 0.35);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
      ctx.scale(0.85, 0.85); glyph(st.air ? 'plane' : 'bus');
      ctx.restore();
    }

    // the ticket rises in
    const tk = e((t - 0.36) / 0.4);
    if (tk > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, tk * 1.4);
      ctx.translate(W / 2, 968 + (1 - tk) * 160); ctx.rotate((1 - tk) * 0.05); ctx.translate(-W / 2, -968);
      ticket(56, 820, W - 112, 296, tk);
      ctx.restore();
    }
    // what is included: getting there, a place to stay, food, the sights
    const items = [[st.air ? 'plane' : 'bus', tr('যাতায়াত')], ...(st.nights ? [['bed', tr('থাকা')]] : []), ['fork', tr('খাবার')], ['compass', tr('ঘোরাঘুরি')]];
    const gap = 196, x0 = W / 2 - (items.length - 1) * gap / 2;
    items.forEach(([icon, label], i) => {
      const s = pop((t - 0.55 - i * 0.05) / 0.25);
      if (s <= 0) return;
      ctx.save(); ctx.globalAlpha = Math.min(1, s); ctx.translate(x0 + i * gap, 1194); ctx.scale(s, s); feature(icon, label, 0, 0); ctx.restore();
    });
    // gold motes rising slowly, and once it is all there, a sheen of light across it
    if (t > 0.3 && t < 1) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const x = rand(i + 90) * W, y = H * (0.15 + rand(i + 91) * 0.6) - t * (40 + rand(i + 92) * 90), tw = 0.5 + 0.5 * Math.sin(t * 30 + i * 2);
        ctx.fillStyle = `rgba(253,224,140,${0.35 * tw * clamp((t - 0.3) * 4) * (1 - clamp((t - 0.92) * 12))})`;
        ctx.beginPath(); ctx.arc(x, y, 2 + rand(i + 93) * 3, 0, Math.PI * 2); ctx.fill();
      }
      const sk = (t - 0.8) / 0.16;
      if (sk > 0 && sk < 1) {
        const sx = lerp(-W * 0.6, W * 1.6, smooth(sk));
        const sh = ctx.createLinearGradient(sx - 260, 0, sx + 260, H * 0.35);
        sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.22)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }
    // the foot
    ctx.globalAlpha = e((t - 0.7) * 4);
    setFont(600, 22); ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillText(tr('Manzeela দিয়ে পরিকল্পনা') + ' · manzeela.com', 72, H - 24);
    if (photo) {
      // the photographer and the licence, as CC BY and CC BY-SA ask; cut short with … where it would reach the left line
      const c = mosaicCredit[0] || {}, room = W - 144 - ctx.measureText(tr('Manzeela দিয়ে পরিকল্পনা') + ' · manzeela.com').width - 32;
      let line = `${tr('ছবি')}: ${c.by || tr('উইকিমিডিয়া কমন্স')}${c.lic ? ' · ' + c.lic : ''}`;
      if (ctx.measureText(line).width > room) {
        const tail = c.lic ? ' · ' + c.lic : '';
        let by = c.by || '';
        while (by.length > 1 && ctx.measureText(`${tr('ছবি')}: ${by}…${tail}`).width > room) by = by.slice(0, -1);
        line = `${tr('ছবি')}: ${by}…${tail}`;
      }
      ctx.textAlign = 'right'; ctx.fillText(line, W - 72, H - 24); ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;
  }

  // The whole piece, T from 0 to 1: the journey on the map, then the poster opens out of the destination's pin
  // in a widening circle and builds itself; the poster stays as the last frame (and is the picture saved).
  const MAP_END = 0.72, IRIS = 0.05;
  const buffer = document.createElement('canvas');
  function drawScene(T) {
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    if (T < MAP_END) { beatMap(T / MAP_END); return; }
    const k = (T - MAP_END) / (1 - MAP_END);
    drawCard(k);
    const iris = (T - MAP_END) / IRIS;
    if (iris < 1) {
      // the map's last frame, with a hole opening from the destination
      buffer.width = W; buffer.height = H;
      const b = buffer.getContext('2d'), keep = ctx;
      b.drawImage(canvas, 0, 0);                     // the poster, kept aside
      beatMap(1);
      const path = routePath(), v = camera(1, path), dest = path.stops.at(-1), [dx, dy] = toScreen(v, [dest.d.lon, dest.d.lat]);
      const r = smooth(iris) * Math.hypot(W, H);
      keep.save(); keep.beginPath(); keep.arc(dx, dy - 40, Math.max(1, r), 0, Math.PI * 2); keep.clip(); keep.drawImage(buffer, 0, 0); keep.restore();
      const fl = keep.createRadialGradient(dx, dy - 40, 0, dx, dy - 40, Math.max(2, r * 1.15));
      fl.addColorStop(0.75, 'rgba(255,255,255,0)'); fl.addColorStop(0.97, `rgba(255,255,255,${0.55 * (1 - iris)})`); fl.addColorStop(1, 'rgba(255,255,255,0)');
      keep.fillStyle = fl; keep.fillRect(0, 0, W, H);
      keep.strokeStyle = `rgba(255,255,255,${0.6 * (1 - iris)})`; keep.lineWidth = 6; keep.beginPath(); keep.arc(dx, dy - 40, Math.max(1, r), 0, Math.PI * 2); keep.stroke();
    }
  }

  function play(duration = 24000) {
    const mine = ++frame, start = performance.now();
    return new Promise(resolve => {
      const step = now => {
        if (mine !== frame) return resolve(false);
        const t = Math.min(1, (now - start) / duration);
        drawScene(t);
        if (t < 1) requestAnimationFrame(step); else resolve(true);
      };
      requestAnimationFrame(step);
    });
  }

  // the clip of this exact story, if one was recorded: kept until something about the trip changes
  let clip = null;
  const clipKey = () => JSON.stringify([ST().stops.map(d => d.id), ST().people, ST().nights, ST().air, ST().title, names(), photos.map(p => p.src),
    $('tour-name').value, $('tour-date').value, LANG, Math.round(tripKm())]);
  const canRecord = () => !!(canvas.captureStream && window.MediaRecorder);
  // play the story, recording it on the way; the finished poster is held a moment at the end
  async function playAndKeep() {
    const key = clipKey();
    if (!canRecord() || (clip && clip.key === key)) return play();
    let rec = null; const chunks = [];
    try { rec = new MediaRecorder(canvas.captureStream(30), { videoBitsPerSecond: 6e6 }); } catch { return play(); }
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    rec.start();
    const whole = await play(24000);
    if (whole) for (let i = 0; i < 16; i++) { await new Promise(r => setTimeout(r, 100)); drawScene(1); }
    rec.stop();
    await done;
    if (whole && chunks.length) clip = { key, blob: new Blob(chunks, { type: rec.mimeType }), type: rec.mimeType };
    return whole;
  }

  async function makeCard() {
    custom = null;
    $('tour-card').hidden = false;
    $('tour-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    await document.fonts.ready;
    drawScene(0);
    posterIcons(); await Promise.all([loadMosaic(), loadScript()]);
    await playAndKeep();
  }

  // ---- the same story for a trip across several districts (trip.js), shown in a full-screen player ----
  let player = null;
  window.TourStory = {
    photos: () => photos,
    async addFiles(files) {
      for (const file of [...files].slice(0, 5 - photos.length)) {
        const img = new Image(); img.src = URL.createObjectURL(file);
        try { await img.decode(); photos.push(img); } catch { URL.revokeObjectURL(img.src); }
      }
      drawThumbs();
    },
    remove(i) { if (photos[i]) { URL.revokeObjectURL(photos[i].src); photos.splice(i, 1); drawThumbs(); } },
    async play(opts) {
      custom = { multi: true, air: false, line: null, ...opts };
      const card = $('tour-card');
      if (!player) {
        player = el('div', 'ts-player');
        const x = el('button', 'lv-icon ts-x'); x.innerHTML = svg('close'); x.setAttribute('aria-label', tr('বন্ধ করুন'));
        x.addEventListener('click', () => this.close());
        player.append(x, el('div', 'ts-stage'));
      }
      player.home = card.parentNode; player.next = card.nextSibling;
      player.querySelector('.ts-stage').appendChild(card);
      card.hidden = false;
      document.body.appendChild(player);
      document.body.classList.add('reels-open');
      requestAnimationFrame(() => player.classList.add('in'));
      await document.fonts.ready;
      drawScene(0);
      posterIcons(); await Promise.all([loadMosaic(), loadScript()]);
      await playAndKeep();
    },
    close() {
      if (!player) return;
      frame++;                                         // stops a running animation
      const card = $('tour-card');
      player.home.insertBefore(card, player.next);
      card.hidden = true;
      player.classList.remove('in');
      player.remove();
      document.body.classList.remove('reels-open');
      custom = null;
    }
  };

  const cardBlob = () => new Promise((resolve, reject) => {
    drawCard(1);
    try { canvas.toBlob(b => b ? resolve(b) : reject(new Error('no image')), 'image/png'); }
    catch (e) { reject(e); }
  }).catch(() => { backdrop = null; mosaic = []; drawCard(1); return new Promise(r => canvas.toBlob(r, 'image/png')); });   // a backdrop without CORS blocks saving

  function save(blob, name) {
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const fileName = ext => `tour-${(custom ? custom.stops.filter(d => d !== custom.from).map(d => d.id).slice(0, 3).join('-') : plan.to.id)}.${ext}`;

  if (location.hostname === 'localhost') window.__tourScene = drawScene;   // for checking frames while developing
  $('tour-make').addEventListener('click', makeCard);
  $('tour-replay').addEventListener('click', () => playAndKeep());
  $('tour-save').addEventListener('click', async () => save(await cardBlob(), fileName('png')));
  $('tour-share').addEventListener('click', async () => {
    const file = new File([await cardBlob()], fileName('png'), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: $('tour-name').value || 'Tour plan' }); } catch { /* cancelled */ }
    } else save(file, file.name);                    // no share sheet on this device: fall back to a download
  });
  // A short clip of the animation, recorded from the canvas, for stories and reels.
  $('tour-video').addEventListener('click', async () => {
    if (!canvas.captureStream || !window.MediaRecorder) { $('tour-video-note').textContent = 'এই ব্রাউজারে ভিডিও বানানো যায় না — ছবি ডাউনলোড করুন।'; return; }
    if ($('tour-video').disabled) return;
    const give = () => save(clip.blob, fileName(clip.type.includes('mp4') ? 'mp4' : 'webm'));
    if (clip && clip.key === clipKey()) { give(); return; }   // already recorded while it played
    $('tour-video').disabled = true;             // one recording at a time
    $('tour-video-note').textContent = tr('ভিডিও তৈরি হচ্ছে…');
    await playAndKeep();
    if (clip && clip.key === clipKey()) give();
    $('tour-video-note').textContent = '';
    $('tour-video').disabled = false;
  });

  enter.tour = () => { if (plan.km == null) loadRoute(); };
  update();
  if (current === 'tour') enter.tour();
})();
