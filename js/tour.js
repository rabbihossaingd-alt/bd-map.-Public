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
  }

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

  function pill(text, x, y) {
    ctx.font = '600 38px "Anek Bangla", sans-serif';
    const w = ctx.measureText(text).width + 56;
    ctx.fillStyle = 'rgba(255, 255, 255, .18)';
    ctx.beginPath(); ctx.roundRect(x, y, w, 72, 36); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + 28, y + 50);
    return w;
  }

  // One frame of the card. t runs 0 -> 1 over the animation; t = 1 is the finished card.
  function drawCard(t) {
    const c = costs();
    const title = $('tour-name').value.trim() || tr(`${plan.to.bn} ট্যুর`);
    const date = $('tour-date').value ? new Date($('tour-date').value).toLocaleDateString(LANG === 'en' ? 'en-GB' : 'bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    // Backdrop: a photo of the destination under a deep green veil, or the brand gradient alone.
    ctx.save();
    const zoom = 1.1 - 0.1 * span(t, 0, 1);
    ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H / 2);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0a8f62'); g.addColorStop(0.55, '#0b6f6a'); g.addColorStop(1, '#0b2b3f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (backdrop) { ctx.globalAlpha = 0.9; cover(backdrop, 0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.restore();
    const veil = ctx.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, 'rgba(4, 30, 22, .55)'); veil.addColorStop(0.45, 'rgba(4, 30, 22, .35)'); veil.addColorStop(1, 'rgba(4, 30, 22, .92)');
    ctx.fillStyle = veil; ctx.fillRect(0, 0, W, H);

    // Brand mark
    ctx.globalAlpha = span(t, 0, 0.2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(72, 72, 64, 64, 20); ctx.fill();
    ctx.fillStyle = '#0a8f62'; ctx.beginPath(); ctx.arc(104, 104, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = '700 40px "Anek Bangla", sans-serif'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('BD Map', 156, 118);
    ctx.font = '600 34px "Anek Bangla", sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(tr('ট্যুর প্ল্যান'), W - 72, 116);
    ctx.textAlign = 'left';

    // Title and route
    let p = span(t, 0.05, 0.4);
    ctx.globalAlpha = p;
    ctx.font = '700 118px "Anek Bangla", sans-serif';
    const lines = wrap(title, W - 144).slice(0, 2);
    let y = 330 + (1 - p) * 60;
    for (const line of lines) { ctx.fillText(line, 72, y); y += 128; }
    ctx.font = '500 50px "Anek Bangla", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, .9)';
    ctx.fillText(`${tr(plan.from.bn)}  →  ${tr(plan.to.bn)}`, 72, y - 34);

    // Facts
    p = span(t, 0.25, 0.55);
    ctx.globalAlpha = p;
    let x = 72;
    const stay = plan.nights ? tr(`${num(c.days)} দিন ${num(plan.nights)} রাত`) : tr(`${num(c.days)} দিন`);
    for (const fact of [tr(`${num(plan.people)} জন সদস্য`), stay, date].filter(Boolean)) x += pill(fact, x, y + 16 + (1 - p) * 30) + 16;

    // The group: overlapping round photos, each popping in after the last
    const shown = Math.min(5, Math.max(photos.length, Math.min(plan.people, 5)));
    const size = 196, step = 150, startX = 72, cy = y + 250;
    for (let i = 0; i < shown; i++) {
      const s = pop((t - 0.35 - i * 0.08) / 0.3);
      if (s <= 0) continue;
      const cx = startX + size / 2 + i * step;
      ctx.globalAlpha = Math.min(1, s);
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(s, s);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, size / 2 + 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.clip();
      if (photos[i]) cover(photos[i], -size / 2, -size / 2, size, size);
      else {
        const tint = ['#12b5cb', '#f29900', '#ec5f9c', '#6b4de6', '#34a853'][i];
        ctx.fillStyle = tint; ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.fillStyle = 'rgba(255, 255, 255, .92)';
        ctx.beginPath(); ctx.arc(0, -22, 38, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 96, 78, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (plan.people > shown) {
      ctx.globalAlpha = span(t, 0.75, 0.9);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 46px "Anek Bangla", sans-serif';
      ctx.fillText(`+${num(plan.people - shown)}`, startX + size + (shown - 1) * step + 26, cy + 16);
    }

    // Cost panel
    p = span(t, 0.6, 1);
    ctx.globalAlpha = p;
    const py = H - 392 + (1 - p) * 90;
    ctx.fillStyle = 'rgba(255, 255, 255, .96)';
    ctx.beginPath(); ctx.roundRect(72, py, W - 144, 300, 48); ctx.fill();
    ctx.fillStyle = '#5b6472'; ctx.font = '600 38px "Anek Bangla", sans-serif';
    ctx.fillText(tr('জনপ্রতি খরচ'), 124, py + 82);
    ctx.fillStyle = '#0a8f62'; ctx.font = '700 132px "Anek Bangla", sans-serif';
    ctx.fillText(taka((c.perHead || 0) * span(t, 0.6, 0.98)), 120, py + 212);
    ctx.fillStyle = '#5b6472'; ctx.font = '500 34px "Anek Bangla", sans-serif';
    ctx.fillText(`${tr('মোট')} ${taka(c.total || 0)} · ${tr(flying() ? 'বিমান, হোটেল, খাবার সহ' : 'বাস, হোটেল, খাবার সহ')} · ${tr('আনুমানিক')}`, 124, py + 266);
    if (backdrop) {
      ctx.fillStyle = 'rgba(255, 255, 255, .6)'; ctx.font = '400 24px "Anek Bangla", sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(tr('ছবি: উইকিমিডিয়া কমন্স'), W - 72, H - 44);
      ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;
  }

  // ---- opening scene: the group travels from the start to the destination ----
  // All 64 district towns are plotted as dots, which together draw the shape of the country; the route is
  // a curve between two of them, and a bus (or a plane, on a higher arc) rides along it.
  const MAP_BOX = { top: 400, height: 720 };
  function mapPoint(d) {
    const lonSpan = (92.7 - 88.0) * Math.cos(23.7 * Math.PI / 180), latSpan = 26.65 - 20.55;
    const scale = MAP_BOX.height / latSpan, width = lonSpan * scale;
    return { x: (W - width) / 2 + (d.lon - 88.0) * Math.cos(23.7 * Math.PI / 180) * scale, y: MAP_BOX.top + (26.65 - d.lat) * scale };
  }
  const bezier = (a, c, b, p) => ({ x: (1 - p) ** 2 * a.x + 2 * (1 - p) * p * c.x + p * p * b.x, y: (1 - p) ** 2 * a.y + 2 * (1 - p) * p * c.y + p * p * b.y });

  function drawBus() {                               // drawn facing right, centred on its middle
    ctx.fillStyle = 'rgba(0, 0, 0, .25)'; ctx.beginPath(); ctx.ellipse(0, 38, 62, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-66, -34, 132, 62, 16); ctx.fill();
    ctx.fillStyle = '#0a8f62'; ctx.fillRect(-66, 8, 132, 12);
    ctx.fillStyle = '#9fd3f7';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.roundRect(-56 + i * 28, -24, 22, 22, 5); ctx.fill(); }
    ctx.fillStyle = '#ffd44d'; ctx.beginPath(); ctx.roundRect(58, 2, 8, 9, 3); ctx.fill();
    for (const x of [-36, 36]) {
      ctx.fillStyle = '#12151b'; ctx.beginPath(); ctx.arc(x, 28, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cfd6e1'; ctx.beginPath(); ctx.arc(x, 28, 5, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawPlane() {                             // drawn facing right, seen from above
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-34, -66); ctx.lineTo(-10, -66); ctx.lineTo(30, 0); ctx.lineTo(-10, 66); ctx.lineTo(-34, 66); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-58, 0); ctx.lineTo(-74, -26); ctx.lineTo(-60, -26); ctx.lineTo(-44, 0); ctx.lineTo(-60, 26); ctx.lineTo(-74, 26); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, 76, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a8f62'; ctx.beginPath(); ctx.ellipse(52, 0, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
  }

  function label(text, x, y, strong) {
    ctx.font = `${strong ? 700 : 600} ${strong ? 46 : 38}px "Anek Bangla", sans-serif`;
    const w = ctx.measureText(text).width + 44, h = strong ? 72 : 62;
    const left = Math.max(40, Math.min(W - 40 - w, x - w / 2));
    ctx.fillStyle = strong ? '#ffffff' : 'rgba(255, 255, 255, .2)';
    ctx.beginPath(); ctx.roundRect(left, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = strong ? '#0a8f62' : '#ffffff';
    ctx.fillText(text, left + 22, y + h * 0.7);
  }

  function drawTravel(t) {
    const air = flying();
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0a8f62'); g.addColorStop(0.5, '#0b6f6a'); g.addColorStop(1, '#0b2b3f');
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // The country, as a constellation of its district towns.
    const a = mapPoint(plan.from), b = mapPoint(plan.to);
    DISTRICTS.forEach((d, i) => {
      const p = mapPoint(d);
      ctx.globalAlpha = 0.34 * span(t, i * 0.004, 0.2 + i * 0.004);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.fill();
    });

    // Headline and who is going
    let p = span(t, 0, 0.25);
    ctx.globalAlpha = p; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left';
    ctx.font = '700 104px "Anek Bangla", sans-serif';
    ctx.fillText(tr('চলো ঘুরে আসি'), 72, 210 + (1 - p) * 40);
    const size = 84;
    const shown = Math.min(5, Math.max(photos.length, Math.min(plan.people, 5)));
    for (let i = 0; i < shown; i++) {
      const cx = 72 + size / 2 + i * 62, cy = 300;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, size / 2 + 4, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2); ctx.clip();
      if (photos[i]) cover(photos[i], cx - size / 2, cy - size / 2, size, size);
      else { ctx.fillStyle = ['#12b5cb', '#f29900', '#ec5f9c', '#6b4de6', '#34a853'][i]; ctx.fillRect(cx - size / 2, cy - size / 2, size, size); }
      ctx.restore();
    }
    ctx.fillStyle = '#ffffff'; ctx.font = '600 42px "Anek Bangla", sans-serif';
    ctx.fillText(`${tr(`${num(plan.people)} জন সদস্য`)} · ${tr(air ? 'বিমানে' : 'বাসে')}`, 72 + shown * 62 + 44, 314);

    // Route: a faint dashed plan, then the solid line the vehicle has covered.
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dx = b.x - a.x, dy = b.y - a.y, bend = air ? 0.42 : 0.14;
    const ctrl = { x: mid.x + dy * bend, y: mid.y - dx * bend - (air ? 60 : 0) };
    const go = (() => { const e = span(t, 0.2, 0.92); return e; })();
    ctx.globalAlpha = span(t, 0.12, 0.3);
    ctx.lineCap = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255, 255, 255, .45)'; ctx.setLineDash([4, 22]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(ctrl.x, ctrl.y, b.x, b.y); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(a.x, a.y);
    for (let i = 1; i <= 40; i++) { const q = bezier(a, ctrl, b, go * i / 40); ctx.lineTo(q.x, q.y); }
    ctx.stroke();

    // The two ends
    for (const [pt, d, when] of [[a, plan.from, 0.1], [b, plan.to, 0.16]]) {
      const s = pop((t - when) / 0.25);
      if (s <= 0) continue;
      ctx.globalAlpha = Math.min(1, s);
      // A short ripple at the destination once the vehicle arrives.
      const since = Math.max(0, t - 0.86);
      const reached = pt === b && go > 0.97 ? Math.max(0.6, 1 + 0.45 * Math.sin(since * 45) * Math.max(0, 1 - since * 9)) : 1;
      ctx.fillStyle = 'rgba(255, 255, 255, .3)'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 34 * s * reached, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 18 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pt === b ? '#f29900' : '#0a8f62'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 9 * s, 0, Math.PI * 2); ctx.fill();
      label(tr(d.bn), pt.x, pt.y + (pt.y > mid.y ? 44 : -112), pt === b);
    }

    // The vehicle, turned to follow the route and never upside down
    const here = bezier(a, ctrl, b, go), ahead = bezier(a, ctrl, b, Math.min(1, go + 0.01)), behind = bezier(a, ctrl, b, Math.max(0, go - 0.01));
    const angle = Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
    ctx.globalAlpha = span(t, 0.16, 0.26) * (1 - span(t, 0.96, 1));
    ctx.save();
    ctx.translate(here.x, here.y); ctx.rotate(angle);
    if (Math.cos(angle) < 0) ctx.scale(1, -1);
    const lift = air ? 1 + 0.35 * Math.sin(go * Math.PI) : 1;       // the plane grows as it climbs, shrinks as it lands
    ctx.scale(lift, lift);
    if (air) drawPlane(); else { ctx.translate(0, -30); drawBus(); }
    ctx.restore();

    // Distance covered, counting up
    const km = air ? haversineKm(plan.from, plan.to) : plan.km || haversineKm(plan.from, plan.to) * 1.25;
    ctx.globalAlpha = span(t, 0.2, 0.4);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 96px "Anek Bangla", sans-serif';
    ctx.fillText(tr(`${num(Math.round(km * go))} কিমি`), 72, H - 150);
    ctx.font = '500 40px "Anek Bangla", sans-serif'; ctx.fillStyle = 'rgba(255, 255, 255, .85)';
    ctx.fillText(`${tr(plan.from.bn)}  →  ${tr(plan.to.bn)}`, 72, H - 88);
    ctx.globalAlpha = 1;
    return b;
  }

  // The whole piece: the journey, then the poster opening out from the destination.
  const TRAVEL = 0.46;
  function drawScene(T) {
    if (T >= 1) { drawCard(1); return; }
    if (T < TRAVEL) { drawTravel(T / TRAVEL); return; }
    const dest = drawTravel(1), k = (T - TRAVEL) / (1 - TRAVEL);
    ctx.save();
    ctx.beginPath(); ctx.arc(dest.x, dest.y, ease(k / 0.22) * 1800, 0, Math.PI * 2); ctx.clip();
    drawCard(Math.max(0, (k - 0.06) / 0.94));
    ctx.restore();
  }

  function play(duration = 7000) {
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
    const d = plan.to;
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
    $('tour-card').hidden = false;
    $('tour-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    await document.fonts.ready;
    drawTravel(0);
    await loadBackdrop();
    await play();
  }

  const cardBlob = () => new Promise((resolve, reject) => {
    drawCard(1);
    try { canvas.toBlob(b => b ? resolve(b) : reject(new Error('no image')), 'image/png'); }
    catch (e) { reject(e); }
  }).catch(() => { backdrop = null; drawCard(1); return new Promise(r => canvas.toBlob(r, 'image/png')); });   // a backdrop without CORS blocks saving

  function save(blob, name) {
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const fileName = ext => `tour-${plan.to.id}.${ext}`;

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
    await play(7200);
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
