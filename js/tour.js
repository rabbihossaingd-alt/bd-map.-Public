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

  // ---- the story and the card: motion graphics over a dark, softly lit stage ----
  // Five beats: the title, the crew, the journey across the map of Bangladesh, arrival over a photo of the
  // place, and the card. No money is shown anywhere — the card is about the trip, not its cost.
  const TINTS = ['#2dd4bf', '#f59e0b', '#f472b6', '#8b5cf6', '#22c55e'];
  const FONT = '"Anek Bangla", sans-serif';
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
  // The stage: near-black with slow, drifting light — teal, emerald and violet.
  function stage(t, warm = 0) {
    ctx.fillStyle = '#04070d'; ctx.fillRect(0, 0, W, H);
    const blobs = [
      [0.2 + 0.08 * Math.sin(t * 2.1), 0.22 + 0.05 * Math.cos(t * 1.7), 760, warm ? 'rgba(251,146,60,.30)' : 'rgba(45,212,191,.28)'],
      [0.85 + 0.06 * Math.cos(t * 1.3), 0.45 + 0.06 * Math.sin(t * 1.9), 820, 'rgba(139,92,246,.26)'],
      [0.35 + 0.1 * Math.sin(t * 1.1 + 2), 0.95, 900, 'rgba(34,197,94,.20)']
    ];
    for (const [x, y, r, c] of blobs) {
      const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r);
      g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
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
  // Soft out-of-focus lights drifting upward.
  function bokeh(t, n = 26, a = 1) {
    for (let i = 0; i < n; i++) {
      const r = 10 + rand(i) * 46, x = rand(i + 11) * W + Math.sin(t * 3 + i) * 24;
      const y = H + 80 - ((rand(i + 23) * H + t * (260 + rand(i + 5) * 340)) % (H + 160));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,240,210,${0.35 * a * (0.4 + rand(i + 7) * 0.6)})`); g.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
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
  const toScreen = (v, p) => { const [x, y] = proj(p); return [v.ox + (x - v.cx) * v.s, v.oy + (y - v.cy) * v.s]; };

  function country(v, a) {
    ctx.save(); ctx.globalAlpha = a;
    for (const ring of BD_OUTLINE) {
      ctx.beginPath();
      ring.forEach((p, i) => { const [x, y] = toScreen(v, p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 300, 0, H - 200);
      g.addColorStop(0, 'rgba(45,212,191,.16)'); g.addColorStop(1, 'rgba(34,197,94,.08)');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(94,234,212,.55)'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    // the district towns, as faint points of light
    for (const d of DISTRICTS) { const [x, y] = toScreen(v, [d.lon, d.lat]); ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
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

  // ---- beat 1: the title ----
  function beatTitle(t) {
    stage(t);
    bokeh(t, 14, 0.5);
    const k = clamp(t / 0.8);
    rise(tr(ST().air ? 'বিমানে' : 'সড়কপথে') + ' · ' + tr(`${num(ST().nights + 1)} দিন`), 72, 520, 36, k * 3, { weight: 600, color: 'rgba(255,255,255,.7)', tracking: 2 });
    setFont(800, 132, -3);
    const lines = wrap(tripTitle(), W - 144).slice(0, 2);
    lines.forEach((l, i) => rise(l, 72, 680 + i * 150, 132, (k - 0.12 - i * 0.1) * 2.4, { tracking: -3 }));
    const y = 680 + lines.length * 150;
    rise(ST().multi ? chainText() : `${tr(ST().from.bn)}  →  ${tr(ST().to.bn)}`, 72, y, ST().multi ? 40 : 50, (k - 0.35) * 2.5, { weight: 600, color: 'rgba(255,255,255,.88)' });
    if (tripDate()) rise(tripDate(), 72, y + 74, 38, (k - 0.45) * 2.5, { weight: 500, color: 'rgba(255,255,255,.6)' });
    // a sweep of light across the stage
    const sx = lerp(-400, W + 400, smooth((t - 0.2) / 0.6));
    const sw = ctx.createLinearGradient(sx - 200, 0, sx + 200, 0);
    sw.addColorStop(0, 'rgba(255,255,255,0)'); sw.addColorStop(0.5, 'rgba(255,255,255,.07)'); sw.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sw; ctx.fillRect(0, 0, W, H);
  }

  // ---- beat 2: the crew ----
  function beatCrew(t) {
    stage(t + 1);
    bokeh(t + 1, 18, 0.6);
    const n = groupSize(), nm = names();
    rise(tr('সঙ্গে যারা'), 72, 300, 42, t * 3, { weight: 600, color: 'rgba(255,255,255,.7)', tracking: 2 });
    rise(nm.length ? joined(nm.slice(0, n)) : tr(`${num(ST().people)} জনের দল`), 72, 400, 76, (t - 0.08) * 3, { max: W - 144 });
    // faces on a gentle arc, each arriving with a spring
    const r = n > 3 ? 112 : 136, gap = Math.min(r * 2.15, (W - 144 - r * 2) / Math.max(1, n - 1));
    for (let i = 0; i < n; i++) {
      const s = pop((t - 0.18 - i * 0.08) / 0.32);
      if (s <= 0) continue;
      const cx = W / 2 + (i - (n - 1) / 2) * gap, cy = 820 - Math.cos((i - (n - 1) / 2) / Math.max(1, n - 1) * 1.6) * 60 + Math.sin(t * 6 + i) * 6;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
      ctx.globalAlpha = Math.min(1, s);
      face(i, 0, 0, r, 1);
      ctx.restore();
      if (nm[i]) { ctx.globalAlpha = clamp((t - 0.3 - i * 0.08) * 4); glassPill(nm[i], cx, cy + r + 30, { size: 30, align: 'center' }); ctx.globalAlpha = 1; }
    }
    if (ST().people > n) { ctx.globalAlpha = clamp((t - 0.6) * 4); glassPill(tr(`আরও ${num(ST().people - n)} জন`), W / 2, 1120, { size: 30, align: 'center' }); ctx.globalAlpha = 1; }
  }

  // ---- beat 3: the journey on the map ----
  function beatJourney(t) {
    stage(t + 2);
    const line = routeLine(), air = ST().air;
    const whole = fit(boundsOf(BD_OUTLINE[0]), 70), near = fit(boundsOf(line), 190);
    // the camera settles from the whole country onto the route, and drifts with the traveller
    const p = smooth((t - 0.12) / 0.78);                           // how far along the route
    let v = blend(whole, near, smooth(t / 0.3) * (ST().multi ? 1 : 0.85));
    country(v, smooth(t / 0.15));
    // route: a faint full line, then the travelled part glowing, with a bright head
    const pts = line.map(q => toScreen(v, q));
    const lens = [0]; for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = lens.at(-1) || 1, upto = total * p;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 4; ctx.setLineDash([2, 14]);
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
    let head = pts[0], j = 0;
    const trail = [pts[0]];
    for (j = 1; j < pts.length && lens[j] <= upto; j++) trail.push(pts[j]);
    if (j < pts.length) { const k = (upto - lens[j - 1]) / ((lens[j] - lens[j - 1]) || 1); head = [lerp(pts[j - 1][0], pts[j][0], k), lerp(pts[j - 1][1], pts[j][1], k)]; trail.push(head); } else head = pts.at(-1);
    for (const [w, c] of [[26, 'rgba(45,212,191,.16)'], [14, 'rgba(94,234,212,.35)'], [6, '#ecfeff']]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); trail.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    }
    // the two ends
    const ends = ST().stops.filter((d, i, a) => a.indexOf(d) === i).map((d, i) => [toScreen(v, [d.lon, d.lat]), d, 0.05 + i * 0.04]);
    for (const [n, [[x, y], d, when]] of ends.entries()) {
      const s = pop((t - when) / 0.2);
      if (s <= 0) continue;
      const arrived = d !== ST().from && p > 0.98;
      ctx.fillStyle = arrived ? 'rgba(251,191,36,.35)' : 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(x, y, 30 * s * (arrived ? 1 + 0.25 * Math.sin(t * 30) : 1), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = d !== ST().from ? '#fbbf24' : '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 12 * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.min(1, s);
      const below = ST().multi ? n % 2 === 0 : y <= H * 0.6;             // close stops take turns above and below their dot
      glassPill(tr(d.bn), x, y + (below ? 34 : -96), { size: ST().multi ? 26 : 30, align: 'center', strong: d !== ST().from });
      ctx.globalAlpha = 1;
    }
    // towns on the way light up as the head passes them
    for (const x of along(line)) {
      if (x.u > p) continue;
      const [tx, ty] = toScreen(v, [x.d.lon, x.d.lat]), a = clamp((p - x.u) * 10);
      ctx.globalAlpha = a; ctx.fillStyle = '#5eead4'; ctx.beginPath(); ctx.arc(tx, ty, 8, 0, Math.PI * 2); ctx.fill();
      setFont(600, 26); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = tx > W / 2 ? 'right' : 'left';
      ctx.fillText(tr(x.d.bn), tx + (tx > W / 2 ? -18 : 18), ty + 9); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
    // the traveller: a white disc with a bus or a plane, and a soft halo
    if (p > 0.001 && p < 0.995) {
      const halo = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 90);
      halo.addColorStop(0, 'rgba(94,234,212,.55)'); halo.addColorStop(1, 'rgba(94,234,212,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(head[0], head[1], 90, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(head[0], head[1], 34, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(head[0], head[1]); glyph(air ? 'plane' : 'bus'); ctx.restore();
    }
    // headline and the panel with the distance counting up
    rise(tr('যাত্রা শুরু'), 72, 190, 40, t * 4, { weight: 600, color: 'rgba(255,255,255,.65)', tracking: 2 });
    rise(ST().multi ? chainText() : `${tr(ST().from.bn)} → ${tr(ST().to.bn)}`, 72, 284, ST().multi ? 52 : 80, (t - 0.04) * 4, { max: W - 144 });
    const py = H - 268;
    ctx.globalAlpha = clamp((t - 0.1) * 5);
    glass(48, py, W - 96, 200, 40, { tint: 'rgba(255,255,255,.08)' });
    setFont(800, 92, -2); ctx.fillStyle = '#ffffff'; ctx.fillText(num(Math.round(tripKm() * p)), 92, py + 122);
    const kw = ctx.measureText(num(Math.round(tripKm() * p))).width;
    setFont(600, 38); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(tr('কিমি'), 92 + kw + 14, py + 122);
    setFont(600, 30); ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.fillText(tr(air ? 'আকাশপথে' : 'সড়কপথে'), 92, py + 168);
    ctx.textAlign = 'right'; setFont(700, 40); ctx.fillStyle = '#ffffff';
    ctx.fillText(p > 0.98 ? tr('পৌঁছে গেছি') : tr(`আর ${fmtMin(tripHours() * (1 - p) * 60)}`), W - 92, py + 112);
    setFont(500, 28); ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fillText(tr(`মোট প্রায় ${fmtMin(tripHours() * 60)}`), W - 92, py + 160);
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }

  // ---- beat 4: arrival ----
  function placeBackdrop(z) {
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    const pic = ST().multi && mosaic[0] ? mosaic[0] : backdrop;      // several districts: the trip's best photo
    if (pic) cover(pic, 0, 0, W, H);
    else { stage(2.5, 1); }
    ctx.restore();
  }
  function beatArrive(t) {
    const z = 1.18 - 0.14 * smooth(t);
    placeBackdrop(z);
    const veil = ctx.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, 'rgba(2,6,12,.55)'); veil.addColorStop(0.35, 'rgba(2,6,12,.05)'); veil.addColorStop(0.7, 'rgba(2,6,12,.25)'); veil.addColorStop(1, 'rgba(2,6,12,.85)');
    ctx.fillStyle = veil; ctx.fillRect(0, 0, W, H);
    // letterbox bars opening
    const bar = 90 * (1 - smooth(t / 0.35));
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar);
    bokeh(t + 3, 22, 0.8);
    rise(ST().multi ? tr('সব ঘুরে এলাম') : tr('পৌঁছে গেছি'), 72, 230, 42, (t - 0.1) * 3, { weight: 600, color: 'rgba(255,255,255,.8)', tracking: 3 });
    // the place's name, its letters drawing closer together as it settles
    const k = smooth((t - 0.15) / 0.45);
    rise(ST().multi ? tr(`${num(ST().stops.filter(d => d !== ST().from).length)} জেলা ঘুরে`) : tr(ST().to.bn), 72, 380, ST().multi ? 120 : 150, k * 1.4, { tracking: lerp(18, -3, k), max: W - 144 });
    rise(ST().multi ? ST().stops.filter(d => d !== ST().from).map(d => tr(d.bn)).join(' · ') : tr(`${ST().to.division} বিভাগ`), 72, 450, 36, (t - 0.35) * 3, { weight: 500, color: 'rgba(255,255,255,.75)' });
    // the crew in a glass strip
    const n = groupSize(), nm = names(), r = 58, step = 104;
    const y = H - 260;
    ctx.globalAlpha = clamp((t - 0.4) * 3);
    glass(60, y, W - 120, 168, 84, { blurFrom: () => placeBackdrop(z), tint: 'rgba(255,255,255,.12)' });
    for (let i = 0; i < n; i++) face(i, 60 + 84 + i * step, y + 84, r);
    setFont(700, 34); ctx.fillStyle = '#ffffff';
    const label = nm.length ? joined(nm.slice(0, n)) : tr(`${num(ST().people)} জন`);
    ctx.fillText(label, 60 + 84 + n * step - 20, y + 78, W - 120 - (84 + n * step) - 20);
    setFont(500, 28); ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.fillText(tr(`${num(ST().days)} দিনের ট্যুর`), 60 + 84 + n * step - 20, y + 120, W - 120 - (84 + n * step) - 20);
    ctx.globalAlpha = 1;
  }

  // ---- the poster (1080 × 1350): a photo mosaic of the trip, the title, the route, the crew, a small map ----
  // The photos are the destination districts' own (their guide covers and best places), loaded with CORS so the
  // poster can still be saved. No money is shown.
  const mosaicCache = new Map();
  let mosaic = [];
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
    mosaic = (await Promise.all(urls.slice(0, 3).map(loadImage))).filter(Boolean);
  }
  // a photo in a rounded tile, gently zooming
  function tile(img, x, y, w, h, r, z = 1) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip();
    if (img) { ctx.translate(x + w / 2, y + h / 2); ctx.scale(z, z); ctx.translate(-(x + w / 2), -(y + h / 2)); cover(img, x, y, w, h); }
    else { const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#0f766e'); g.addColorStop(1, '#1e1b4b'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); }
    ctx.restore();
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
  function drawCard(t) {
    const st = ST(), z = 1.06 - 0.06 * smooth(t);
    ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H);
    // mosaic: one big photo and, when there are more, two beside it
    const top = 0, mh = 820, gap = 8, k = i => smooth((t - i * 0.06) / 0.4);
    const [a, b, c] = mosaic;
    ctx.globalAlpha = k(0);
    if (b) {
      tile(a, 0, top, 676, mh, 0, z);
      ctx.globalAlpha = k(1); tile(b, 676 + gap, top, W - 676 - gap, c ? (mh - gap) / 2 : mh, 0, z);
      if (c) { ctx.globalAlpha = k(2); tile(c, 676 + gap, top + (mh - gap) / 2 + gap, W - 676 - gap, (mh - gap) / 2, 0, z); }
    } else tile(a, 0, top, W, mh, 0, z);
    ctx.globalAlpha = 1;
    const fade = ctx.createLinearGradient(0, 360, 0, mh + 40);
    fade.addColorStop(0, 'rgba(5,7,13,0)'); fade.addColorStop(0.65, 'rgba(5,7,13,.78)'); fade.addColorStop(1, '#05070d');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, W, mh + 40);
    const shade = ctx.createLinearGradient(0, 0, 0, 220); shade.addColorStop(0, 'rgba(5,7,13,.55)'); shade.addColorStop(1, 'rgba(5,7,13,0)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, W, 220);
    // brand
    ctx.globalAlpha = clamp(t * 4);
    glass(56, 56, 300, 66, 33, { tint: 'rgba(10,15,25,.35)' });
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(70, 69, 40, 40, 12); ctx.fill();
    ctx.fillStyle = '#0a8f62'; ctx.beginPath(); ctx.arc(90, 89, 8, 0, Math.PI * 2); ctx.fill();
    setFont(800, 28); ctx.fillStyle = '#ffffff'; ctx.fillText('BD Map', 124, 99);
    setFont(600, 24); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(tr('· ট্যুর'), 230, 98);
    ctx.globalAlpha = 1;
    // title over the photos' foot
    setFont(800, 104, -3);
    const lines = wrap(tripTitle(), W - 144).slice(0, 2), base = 744, first = base - (lines.length - 1) * 110;
    rise(tripDate() || tr(st.multi ? `${num(st.days)} দিনে ${num(st.stops.filter(d => d !== st.from).length)} জেলা` : `${num(st.days)} দিনের ট্যুর`), 72, first - 100, 34, (t - 0.1) * 4, { weight: 700, color: '#5eead4', tracking: 3 });
    lines.forEach((l, i) => rise(l, 72, first + i * 110, 104, (t - 0.14 - i * 0.05) * 3, { tracking: -3 }));
    // the route as a chain of pills
    let x = 72, y = base + 44;
    const chain = st.stops;
    chain.forEach((d, i) => {
      const s = pop((t - 0.3 - i * 0.05) / 0.3);
      if (s <= 0) return;
      setFont(700, 30);
      const w = ctx.measureText(tr(d.bn)).width + 40;
      if (x + w > W - 72) { x = 72; y += 66; }
      ctx.save(); ctx.globalAlpha = Math.min(1, s); ctx.translate(x + w / 2, y + 26); ctx.scale(s, s); ctx.translate(-(x + w / 2), -(y + 26));
      ctx.fillStyle = i === 0 || (i === chain.length - 1 && d === st.from) ? 'rgba(255,255,255,.14)' : 'rgba(251,191,36,.18)';
      ctx.beginPath(); ctx.roundRect(x, y, w, 52, 26); ctx.fill();
      ctx.fillStyle = i === 0 || (i === chain.length - 1 && d === st.from) ? '#ffffff' : '#fde68a'; ctx.fillText(tr(d.bn), x + 20, y + 36);
      ctx.restore();
      x += w + 8;
      if (i < chain.length - 1) { ctx.globalAlpha = Math.min(1, s); ctx.save(); ctx.translate(x + 12, y + 26); ctx.scale(0.62, 0.62); glyph(st.air ? 'plane' : 'bus', 'rgba(255,255,255,.7)'); ctx.restore(); ctx.globalAlpha = 1; x += 34; }
    });
    // crew on the left, the little map on the right
    const cy = y + 150, n = groupSize(), nm = names(), r = 62, stepX = Math.min(104, 380 / Math.max(1, n - 1));
    for (let i = 0; i < n; i++) {
      const s = pop((t - 0.45 - i * 0.05) / 0.3);
      if (s <= 0) continue;
      ctx.save(); ctx.translate(72 + r + i * stepX, cy); ctx.scale(s, s); ctx.globalAlpha = Math.min(1, s); face(i, 0, 0, r); ctx.restore();
    }
    ctx.globalAlpha = clamp((t - 0.6) * 4);
    setFont(700, 32); ctx.fillStyle = '#ffffff';
    ctx.fillText(nm.length ? joined(nm.slice(0, 5)) : tr(`${num(st.people)} জনের দল`), 72, cy + r + 52, 640);
    ctx.globalAlpha = 1;
    ctx.globalAlpha = clamp((t - 0.35) * 3);
    miniMap(W - 72 - 150, cy - 128, 250, (t - 0.4) / 0.5);
    ctx.globalAlpha = 1;
    // three numbers on glass
    const py = H - 196, pw = W - 144;
    ctx.globalAlpha = clamp((t - 0.62) * 3);
    glass(72, py, pw, 132, 32, { tint: 'rgba(255,255,255,.07)' });
    const stats = [
      [tr('দূরত্ব'), tr(`${num(Math.round(tripKm()))} কিমি`)],
      [tr('সময়'), st.multi ? tr(`${num(st.days)} দিন`) : tr(`${st.air ? 'বিমানে' : 'বাসে'} ~${fmtMin(tripHours() * 60)}`)],
      st.multi ? [tr('জেলা'), tr(`${num(st.stops.filter(d => d !== st.from).length)}টি`)] : [tr('থাকা'), st.nights ? tr(`${num(st.nights)} রাত`) : tr('দিনে দিনে')]
    ];
    stats.forEach(([kk, v], i) => {
      const cx = 72 + pw / 6 + i * pw / 3;
      ctx.textAlign = 'center';
      setFont(600, 24); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(kk, cx, py + 50);
      setFont(800, 40); ctx.fillStyle = '#ffffff'; ctx.fillText(v, cx, py + 100, pw / 3 - 28);
      if (i) { ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(72 + i * pw / 3, py + 30, 2, 72); }
    });
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    setFont(500, 20); ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillText(tr('BD Map দিয়ে পরিকল্পনা'), 72, H - 30);
    if (mosaic.length) { ctx.textAlign = 'right'; ctx.fillText(tr('ছবি: উইকিমিডিয়া কমন্স'), W - 72, H - 30); ctx.textAlign = 'left'; }
  }

  // The whole piece, T from 0 to 1. Each beat hands over to the next with a short dissolve.
  const CUTS = [0, 0.14, 0.29, 0.63, 0.82, 1];
  const buffer = document.createElement('canvas');
  const BEATS = [beatTitle, beatCrew, beatJourney, beatArrive, drawCard];
  function drawScene(T) {
    if (T >= 1) { drawCard(1); return; }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const i = Math.max(0, CUTS.findIndex((c, k) => T >= c && T < CUTS[k + 1]));
    const k = (T - CUTS[i]) / (CUTS[i + 1] - CUTS[i]);
    BEATS[i](k);
    // the next beat dissolves in over the last 10 % of this one: this frame is kept aside, the next beat drawn,
    // and this frame laid back over it, fading out
    const fade = 0.1;
    if (i < BEATS.length - 1 && k > 1 - fade) {
      buffer.width = W; buffer.height = H;
      buffer.getContext('2d').drawImage(canvas, 0, 0);
      BEATS[i + 1](0.0001);
      ctx.globalAlpha = 1 - smooth((k - (1 - fade)) / fade);
      ctx.drawImage(buffer, 0, 0);
      ctx.globalAlpha = 1;
    }
  }

  function play(duration = 15000) {
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

  // Backdrop: the lead picture of the destination's Wikipedia article — the one image editors chose to
  // stand for the place. It must load with CORS, or the browser would refuse to save the card.
  const backdrops = new Map();
  async function loadBackdrop() {
    const d = ST().to;
    if (!backdrops.has(d.id)) {
      const name = d.id === 'coxsbazar' ? "Cox's Bazar" : d.en.split(' ')[0];
      let found = null;
      for (const title of [name, name + ' District']) {
        try {
          const page = await (await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title))).json();
          const src = page.thumbnail && page.thumbnail.source;
          if (!src) continue;
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = src.replace(/\/\d+px-/, '/960px-');
          await img.decode();
          found = img;
          break;
        } catch { /* try the next title, or go without a photo */ }
      }
      backdrops.set(d.id, found);
    }
    backdrop = backdrops.get(d.id);
  }

  async function makeCard() {
    custom = null;
    $('tour-card').hidden = false;
    $('tour-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    await document.fonts.ready;
    drawScene(0);
    await Promise.all([loadBackdrop(), loadMosaic()]);
    await play();
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
      await Promise.all([loadBackdrop(), loadMosaic()]);
      await play();
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
  $('tour-replay').addEventListener('click', () => play());
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
    $('tour-video').disabled = true;             // one recording at a time
    $('tour-video-note').textContent = 'ভিডিও তৈরি হচ্ছে…';
    const chunks = [], rec = new MediaRecorder(canvas.captureStream(30), { videoBitsPerSecond: 6e6 });
    rec.ondataavailable = e => chunks.push(e.data);
    const done = new Promise(r => { rec.onstop = r; });
    rec.start();
    await play(15000);
    await new Promise(r => setTimeout(r, 1600));     // hold the finished card
    rec.stop();
    await done;
    save(new Blob(chunks, { type: rec.mimeType }), fileName(rec.mimeType.includes('mp4') ? 'mp4' : 'webm'));
    $('tour-video-note').textContent = '';
    $('tour-video').disabled = false;
  });

  enter.tour = () => { if (plan.km == null) loadRoute(); };
  update();
  if (current === 'tour') enter.tour();
})();
