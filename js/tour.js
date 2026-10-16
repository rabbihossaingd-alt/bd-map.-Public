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

    // The group: overlapping round photos (or faces with initials), each popping in after the last
    const shown = groupSize(), nm = names();
    const size = 196, step = Math.min(170, (W - 144 - size) / Math.max(1, shown - 1)), startX = 72, cy = y + 250;
    for (let i = 0; i < shown; i++) {
      const s = pop((t - 0.35 - i * 0.08) / 0.3);
      if (s <= 0) continue;
      const cx = startX + size / 2 + i * step;
      ctx.globalAlpha = Math.min(1, s);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
      face(i, 0, 0, size / 2);
      ctx.restore();
    }
    ctx.globalAlpha = span(t, 0.7, 0.9);
    if (nm.length) { ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = '600 40px "Anek Bangla", sans-serif'; ctx.fillText(joined(nm.slice(0, 6)), 72, cy + size / 2 + 66, W - 144); }
    else if (plan.people > shown) { ctx.fillStyle = '#ffffff'; ctx.font = '700 46px "Anek Bangla", sans-serif'; ctx.fillText(`+${num(plan.people - shown)}`, startX + size + (shown - 1) * step + 26, cy + 16); }

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

  // ---- the story before the card: bags packed, everyone boards, the road (or the sky), and arrival ----
  // Four short scenes drawn on the same canvas. The people are the group's photos (or coloured faces with
  // their initials) and the names typed in the card form.
  const TINTS = ['#12b5cb', '#f29900', '#ec5f9c', '#6b4de6', '#34a853'];
  const lerp = (a, b, k) => a + (b - a) * k;
  const mix = (c1, c2, k) => {
    const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const a = p(c1), b = p(c2);
    return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], Math.max(0, Math.min(1, k))))).join(',')})`;
  };
  const rand = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // the same "random" every frame
  const COAST = ['coxsbazar', 'patuakhali', 'barguna'], HILLS = ['bandarban', 'rangamati', 'khagrachhari', 'sylhet', 'moulvibazar', 'habiganj', 'sunamganj'];

  function names() {
    return ($('tour-names') ? $('tour-names').value : '').split(/[,،\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 8);
  }
  const groupSize = () => Math.min(5, Math.max(photos.length, names().length, Math.min(plan.people, 5)));
  // "রাতুল, সিয়াম ও সাব্বির" — the names joined the way they are said
  function joined(list) {
    if (LANG === 'en') return list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list.at(-1) : list[0];
    return list.length > 1 ? list.slice(0, -1).join(', ') + ' ও ' + list.at(-1) : list[0];
  }

  // One person: a round photo with a white ring, or a coloured face with the initial.
  function face(i, cx, cy, r) {
    ctx.save();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, r + Math.max(3, r * 0.08), 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (photos[i]) cover(photos[i], cx - r, cy - r, r * 2, r * 2);
    else {
      const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      g.addColorStop(0, TINTS[i % 5]); g.addColorStop(1, mix(TINTS[i % 5], '#000000', 0.35));
      ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      const n = names()[i];
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
      if (n) { ctx.font = `700 ${Math.round(r * 0.95)}px "Anek Bangla", sans-serif`; ctx.fillText([...n][0], cx, cy + r * 0.34); }
      else { ctx.beginPath(); ctx.arc(cx, cy - r * 0.18, r * 0.34, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy + r * 0.9, r * 0.7, 0, Math.PI * 2); ctx.fill(); }
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }
  function backpack(x, y, s, tint) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = mix(tint, '#000000', 0.25); ctx.beginPath(); ctx.roundRect(-30, -40, 60, 74, 16); ctx.fill();
    ctx.fillStyle = tint; ctx.beginPath(); ctx.roundRect(-30, -44, 60, 66, 16); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.roundRect(-20, -6, 40, 24, 8); ctx.fill();
    ctx.strokeStyle = mix(tint, '#000000', 0.35); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, -44, 13, Math.PI, 0); ctx.stroke();
    ctx.restore();
  }

  // The sky by the hour of the trip: morning blue going to a golden evening on a long journey.
  function sky(k, top = 0, bottom = H) {
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, mix('#3b8cff', '#ff7a59', k)); g.addColorStop(0.55, mix('#8fd0ff', '#ffb36b', k)); g.addColorStop(1, mix('#e6f6ff', '#ffe2b0', k));
    ctx.fillStyle = g; ctx.fillRect(0, top, W, bottom - top);
    // the sun, low in the morning, high at noon, setting by evening
    const sx = lerp(860, 220, k), sy = 300 - Math.sin(Math.PI * (0.25 + k * 0.6)) * 140;
    const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 190);
    glow.addColorStop(0, 'rgba(255,248,214,.95)'); glow.addColorStop(0.25, 'rgba(255,236,170,.6)'); glow.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, 190, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mix('#fff6d6', '#ffd18a', k); ctx.beginPath(); ctx.arc(sx, sy, 54, 0, Math.PI * 2); ctx.fill();
  }
  function cloud(x, y, s, a) {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, 46 * s, 0, Math.PI * 2); ctx.arc(x + 52 * s, y - 22 * s, 58 * s, 0, Math.PI * 2);
    ctx.arc(x + 112 * s, y, 44 * s, 0, Math.PI * 2); ctx.roundRect(x - 40 * s, y, 196 * s, 44 * s, 22 * s);
    ctx.fill();
  }
  // Land in layers: far hills (taller on the way to the hills), a tree line, the fields, the road.
  const GY = 1090;                                   // where the wheels touch the road
  function land(off, k, hillAmp) {
    for (let i = 0; i < 5; i++) cloud(((i * 300 - off * 0.08) % (W + 400) + W + 400) % (W + 400) - 250, 220 + rand(i) * 260, 0.7 + rand(i + 9) * 0.7, 0.75);
    // far hills
    ctx.fillStyle = mix('#7fb7a0', '#c98a7a', k * 0.7);
    ctx.beginPath(); ctx.moveTo(0, 780);
    for (let x = 0; x <= W; x += 20) { const u = (x + off * 0.15) / 260; ctx.lineTo(x, 760 - hillAmp * (0.55 + 0.45 * Math.sin(u) * Math.sin(u * 0.37 + 1))); }
    ctx.lineTo(W, 860); ctx.lineTo(0, 860); ctx.fill();
    // tree line
    ctx.fillStyle = mix('#2f8f5b', '#6d6a3a', k * 0.6);
    ctx.fillRect(0, 812, W, 60);
    for (let i = 0; i < 26; i++) {
      const x = ((i * 64 - off * 0.35) % (W + 128) + W + 128) % (W + 128) - 64, r = 30 + rand(i) * 26;
      ctx.beginPath(); ctx.arc(x, 820 - r * 0.4, r, 0, Math.PI * 2); ctx.fill();
    }
    // palms and a few houses closer in
    for (let i = 0; i < 7; i++) {
      const x = ((i * 190 + rand(i) * 80 - off * 0.6) % (W + 380) + W + 380) % (W + 380) - 190, base = 900;
      if (rand(i + 3) > 0.62) {
        ctx.fillStyle = mix('#d9534f', '#a0522d', rand(i)); ctx.beginPath(); ctx.moveTo(x - 46, base - 40); ctx.lineTo(x, base - 78); ctx.lineTo(x + 46, base - 40); ctx.fill();
        ctx.fillStyle = '#f2e6cf'; ctx.fillRect(x - 38, base - 40, 76, 44);
        ctx.fillStyle = '#6b4f3a'; ctx.fillRect(x - 8, base - 22, 16, 26);
      } else {
        ctx.strokeStyle = '#6b4f3a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + 10, base - 70, x + 4, base - 130); ctx.stroke();
        ctx.fillStyle = mix('#1f7a45', '#4d5b2a', k * 0.6);
        for (let l = 0; l < 6; l++) { const a = l / 6 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + 4 + Math.cos(a) * 34, base - 130 + Math.sin(a) * 12, 40, 10, a, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    // paddy fields with rows that slide by
    const fg = ctx.createLinearGradient(0, 880, 0, GY);
    fg.addColorStop(0, mix('#8fd16a', '#b9a24a', k * 0.6)); fg.addColorStop(1, mix('#4fb04b', '#8e8a3a', k * 0.6));
    ctx.fillStyle = fg; ctx.fillRect(0, 880, W, GY - 880 + 6);
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 3;
    for (let i = 0; i < 18; i++) { const x = ((i * 80 - off * 0.8) % (W + 160) + W + 160) % (W + 160) - 80; ctx.beginPath(); ctx.moveTo(x, 886); ctx.lineTo(x - 60, GY); ctx.stroke(); }
    // the road
    ctx.fillStyle = '#3a3f47'; ctx.fillRect(0, GY - 4, W, 120);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 9; i++) { const x = ((i * 150 - off * 1.6) % (W + 150) + W + 150) % (W + 150) - 75; ctx.fillRect(x, GY + 54, 80, 9); }
    ctx.fillStyle = '#4fb04b'; ctx.fillRect(0, GY + 116, W, H - GY - 116);
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    for (let i = 0; i < 40; i++) { const x = ((i * 47 - off * 2.2) % (W + 94) + W + 94) % (W + 94) - 47; ctx.fillRect(x, GY + 130 + rand(i) * 80, 26, 6); }
  }

  // The bus, from the side, facing right. (x, ground) is the middle of its wheelbase on the road.
  const BUS = 1.32;                                  // the bus is drawn this much larger than its plan
  function bigBus(x, ground, opts) { ctx.save(); ctx.translate(x, ground); ctx.scale(BUS, BUS); busAt(0, 0, opts); ctx.restore(); }
  function busAt(x, ground, { wheel = 0, riders = [], bags = 0, door = 0, lights = 0, dest = '' } = {}) {
    const L = x - 290, T = ground - 262, R = x + 290;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, ground + 4, 300, 18, 0, 0, Math.PI * 2); ctx.fill();
    // bags on the roof rack
    ctx.strokeStyle = '#2b3138'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(L + 50, T - 6); ctx.lineTo(R - 120, T - 6); ctx.stroke();
    for (let i = 0; i < bags; i++) backpack(L + 90 + i * 70, T - 40, 0.62, TINTS[i % 5]);
    // body
    const g = ctx.createLinearGradient(0, T, 0, ground);
    g.addColorStop(0, '#2fd39a'); g.addColorStop(0.5, '#10a874'); g.addColorStop(1, '#087a54');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(L, T, R - L, 222, [34, 70, 20, 20]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.roundRect(L + 8, T + 6, R - L - 80, 16, 8); ctx.fill();
    // stripes
    ctx.fillStyle = '#ffd43b'; ctx.fillRect(L, T + 150, R - L - 4, 14);
    ctx.fillStyle = '#ff5c5c'; ctx.fillRect(L, T + 168, R - L - 4, 6);
    // windscreen and the destination board
    ctx.fillStyle = '#163238'; ctx.beginPath(); ctx.roundRect(R - 92, T + 14, 80, 30, 8); ctx.fill();
    if (dest) { ctx.fillStyle = '#ffb02e'; ctx.font = '700 22px "Anek Bangla", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(dest, R - 52, T + 37, 72); ctx.textAlign = 'left'; }
    const ws = ctx.createLinearGradient(R - 90, T, R, T + 130);
    ws.addColorStop(0, '#d9f3ff'); ws.addColorStop(1, '#7cc6ec');
    ctx.fillStyle = ws; ctx.beginPath(); ctx.moveTo(R - 92, T + 54); ctx.lineTo(R - 22, T + 54); ctx.lineTo(R - 4, T + 138); ctx.lineTo(R - 92, T + 138); ctx.fill();
    // windows, with whoever has boarded
    for (let i = 0; i < 5; i++) {
      const wx = L + 30 + i * 84, wy = T + 54;
      ctx.fillStyle = '#bfe6f8'; ctx.beginPath(); ctx.roundRect(wx, wy, 70, 76, 12); ctx.fill();
      const who = riders.indexOf(i);
      if (who >= 0) { ctx.save(); ctx.beginPath(); ctx.roundRect(wx, wy, 70, 76, 12); ctx.clip(); face(i, wx + 35, wy + 46 + Math.sin(wheel * 0.9 + i) * 2, 30); ctx.restore(); }
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(wx + 8, wy + 8); ctx.lineTo(wx + 30, wy + 8); ctx.lineTo(wx + 8, wy + 40); ctx.fill();
    }
    // door
    const dx = R - 170;
    ctx.fillStyle = '#0a6a49'; ctx.beginPath(); ctx.roundRect(dx, T + 54, 62, 160, 10); ctx.fill();
    ctx.fillStyle = '#bfe6f8'; ctx.beginPath(); ctx.roundRect(dx + 6 + door * 50, T + 60, 50 - door * 44, 84, 8); ctx.fill();
    // lights
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.roundRect(R - 18, T + 170, 16, 22, 6); ctx.fill();
    if (lights > 0) {
      const beam = ctx.createLinearGradient(R, 0, R + 260, 0);
      beam.addColorStop(0, `rgba(255,240,170,${0.55 * lights})`); beam.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(R - 4, T + 172); ctx.lineTo(R + 260, T + 140); ctx.lineTo(R + 260, T + 236); ctx.lineTo(R - 4, T + 192); ctx.fill();
    }
    ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.roundRect(L + 2, T + 172, 10, 26, 4); ctx.fill();
    // wheels
    for (const wx of [x - 178, x + 160]) {
      ctx.fillStyle = '#05080c'; ctx.beginPath(); ctx.arc(wx, ground - 36, 52, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#15191f'; ctx.beginPath(); ctx.arc(wx, ground - 36, 40, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c9d1db'; ctx.beginPath(); ctx.arc(wx, ground - 36, 20, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a95a3'; ctx.lineWidth = 5;
      for (let s = 0; s < 5; s++) { const a = wheel + s * Math.PI * 2 / 5; ctx.beginPath(); ctx.moveTo(wx, ground - 36); ctx.lineTo(wx + Math.cos(a) * 19, ground - 36 + Math.sin(a) * 19); ctx.stroke(); }
    }
  }
  function puff(x, y, k) {                           // exhaust: a soft grey ball that grows and fades
    ctx.fillStyle = `rgba(220,226,232,${0.55 * (1 - k)})`;
    ctx.beginPath(); ctx.arc(x - k * 120, y - k * 40, 14 + k * 34, 0, Math.PI * 2); ctx.fill();
  }
  function planeSide(x, y, { riders = [] } = {}) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#e8eef5'; ctx.beginPath(); ctx.moveTo(-250, -12); ctx.lineTo(-300, -110); ctx.lineTo(-250, -110); ctx.lineTo(-190, -30); ctx.fill();
    const g = ctx.createLinearGradient(0, -60, 0, 60); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#cfd9e4');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 300, 58, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a8f62'; ctx.fillRect(-280, 14, 540, 12);
    ctx.fillStyle = '#163238'; ctx.beginPath(); ctx.ellipse(246, -16, 40, 18, 0.2, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const wx = -170 + i * 70;
      ctx.fillStyle = '#9cc9e8'; ctx.beginPath(); ctx.roundRect(wx, -30, 40, 34, 14); ctx.fill();
      if (riders.includes(i)) { ctx.save(); ctx.beginPath(); ctx.roundRect(wx, -30, 40, 34, 14); ctx.clip(); face(i, wx + 20, -6, 17); ctx.restore(); }
    }
    ctx.fillStyle = '#c7d2de'; ctx.beginPath(); ctx.moveTo(-40, 20); ctx.lineTo(80, 20); ctx.lineTo(-10, 120); ctx.lineTo(-70, 120); ctx.fill();
    ctx.restore();
  }

  // Districts the road passes on the way, nearest the line between the two ends, in order.
  function along() {
    const route = routes.get(plan.from.id + '>' + plan.to.id), line = route && route.geometry && route.geometry.coordinates;
    if (line && line.length > 1) {
      // the district towns within 8 km of the road itself, in the order the road meets them
      const step = Math.max(1, Math.floor(line.length / 400)), pts = [];
      let run = 0;
      for (let i = 0; i < line.length; i += step) { const q = { lon: line[i][0], lat: line[i][1] }; if (pts.length) run += haversineKm(pts.at(-1), q); pts.push({ ...q, run }); }
      return DISTRICTS.filter(d => d !== plan.from && d !== plan.to).map(d => {
        let best = null;
        for (const q of pts) { const km = haversineKm(d, q); if (!best || km < best.km) best = { km, run: q.run }; }
        return { d, u: best.run / (run || 1), dist: best.km };
      }).filter(x => x.dist < 8 && x.u > 0.06 && x.u < 0.94).sort((x, y) => x.u - y.u).slice(0, 5);
    }
    const a = plan.from, b = plan.to, k = Math.cos(23.7 * Math.PI / 180);
    const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    return DISTRICTS.filter(d => d !== a && d !== b).map(d => {
      const px = d.lon * k, py = d.lat, u = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2;
      const dist = Math.hypot(ax + u * (bx - ax) - px, ay + u * (by - ay) - py) * 111;
      return { d, u, dist };
    }).filter(x => x.u > 0.12 && x.u < 0.88 && x.dist < 15).sort((x, y) => x.u - y.u).slice(0, 4);
  }

  function nameTag(text, cx, y) {                   // a name under a face, on a soft pill so it reads on any background
    ctx.font = '700 32px "Anek Bangla", sans-serif';
    const w = Math.min(190, ctx.measureText(text).width + 32);
    ctx.fillStyle = 'rgba(10,20,30,.5)'; ctx.beginPath(); ctx.roundRect(cx - w / 2, y, w, 50, 25); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(text, cx, y + 36, w - 20); ctx.textAlign = 'left';
  }
  function chip(text, x, y, { dark = false, size = 34 } = {}) {
    ctx.font = `700 ${size}px "Anek Bangla", sans-serif`;
    const w = ctx.measureText(text).width + size * 1.4, h = size * 1.9;
    ctx.fillStyle = dark ? 'rgba(10,20,30,.55)' : 'rgba(255,255,255,.92)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = dark ? '#ffffff' : '#0b3b2c';
    ctx.fillText(text, x + size * 0.7, y + h * 0.66);
    return w;
  }
  function headline(text, sub, p) {
    ctx.globalAlpha = p;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.font = '800 88px "Anek Bangla", sans-serif';
    ctx.fillText(text, 74, 214 + (1 - p) * 40);
    ctx.fillStyle = '#ffffff'; ctx.fillText(text, 72, 210 + (1 - p) * 40);
    if (sub) {
      ctx.font = '600 42px "Anek Bangla", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.95)';
      wrap(sub, W - 144).slice(0, 2).forEach((l, i) => ctx.fillText(l, 72, 284 + i * 56 + (1 - p) * 40));
    }
    ctx.globalAlpha = 1;
  }

  // Scene 1: everyone is ready, bags packed.
  function sceneReady(t) {
    sky(0); land(0, 0, 40);
    const n = groupSize(), nm = names(), to = tr(plan.to.bn);
    const who = nm.length ? joined(nm.slice(0, n)) : tr(`${num(plan.people)} জন বন্ধু`);
    headline(tr('ব্যাগ গোছানো শেষ!'), LANG === 'en' ? `${who} — off to ${to}` : `${who} — চলছে ${to}`, span(t, 0, 0.35));
    const gap = Math.min(200, (W - 220) / Math.max(1, n - 1));
    for (let i = 0; i < n; i++) {
      const s = pop((t - 0.15 - i * 0.09) / 0.35);
      if (s <= 0) continue;
      const cx = W / 2 + (i - (n - 1) / 2) * gap, cy = 820 + Math.sin(t * 14 + i) * 4;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
      const b = pop((t - 0.35 - i * 0.07) / 0.3);
      face(i, cx, cy, 82);
      if (b > 0) backpack(cx + 74, cy + 46 - (1 - Math.min(1, b)) * 90, 0.95 * b, TINTS[(i + 2) % 5]);
      if (nm[i]) nameTag(nm[i], cx, cy + 112);
      ctx.restore();
    }
  }

  // Scene 2: the bus comes in, everyone hops on, the bags go on the roof.
  function sceneBoard(t) {
    sky(0.05); land(0, 0.05, 40);
    const air = flying(), n = groupSize();
    // the counter sign
    ctx.fillStyle = '#4a4f57'; ctx.fillRect(110, 640, 10, GY - 640);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(40, 590, 300, 74, 16); ctx.fill();
    ctx.fillStyle = '#0a8f62'; ctx.font = '700 32px "Anek Bangla", sans-serif';
    ctx.fillText(tr(air ? `${plan.from.bn} বিমানবন্দর` : `${plan.from.bn} কাউন্টার`), 62, 638, 260);
    headline(tr(air ? 'বিমানে ওঠার পালা' : 'বাসে ওঠার পালা'), '', span(t, 0, 0.3));
    const arrive = span(t, 0, 0.35), bx = lerp(W + 520, 660, arrive);
    const boarded = [];
    const hops = [];
    for (let i = 0; i < n; i++) {
      const k = (t - 0.3 - i * 0.1) / 0.2;
      if (k >= 1) boarded.push(i);
      else hops.push([i, Math.max(0, k)]);
    }
    if (air) planeSide(bx, 760, { riders: boarded });
    else bigBus(bx, GY + 40, { wheel: -arrive * 14, riders: boarded, bags: Math.min(4, Math.round(span(t, 0.35, 0.75) * Math.min(4, n))), door: t > 0.3 && t < 0.9 ? 1 : 0, dest: tr(plan.to.bn) });
    // people still on the pavement, jumping to their window
    for (const [i, k] of hops) {
      const sx = 150 + i * 64, sy = GY - 30, wx = bx + (-225 + i * 84) * BUS, wy = GY + 40 + (-162) * BUS;
      const e = ease(k), x = lerp(sx, wx, e), y = lerp(sy, wy, e) - Math.sin(e * Math.PI) * 160;
      face(i, x, y, k > 0 ? lerp(42, 30, e) : 42);
    }
  }

  // Scene 3: the journey — the world slides past, a progress bar fills, the towns on the way are named.
  function sceneRoad(t, wheelBase) {
    const air = flying(), hours = plan.hours || (plan.km || haversineKm(plan.from, plan.to) * 1.25) / 40;
    const dusk = Math.min(0.85, hours / 12) * span(t, 0.1, 1);          // a long trip ends in the evening
    const off = wheelBase * 9;
    if (air) {
      sky(dusk * 0.6);
      for (let i = 0; i < 9; i++) cloud(((i * 260 - off * (0.4 + rand(i) * 0.8)) % (W + 500) + W + 500) % (W + 500) - 300, 420 + rand(i + 2) * 700, 0.8 + rand(i) * 1.2, 0.85);
      planeSide(W / 2, 760 + Math.sin(t * 20) * 8, { riders: [...Array(groupSize()).keys()] });
    } else {
      sky(dusk);
      const hilly = HILLS.includes(plan.to.id) ? 40 + 160 * span(t, 0.35, 0.9) : 40;
      land(off, dusk, hilly);
      bigBus(W / 2, GY + 40 + Math.abs(Math.sin(t * 60)) * -3, { wheel: wheelBase, riders: [...Array(groupSize()).keys()], bags: Math.min(4, groupSize()), lights: dusk, dest: tr(plan.to.bn) });
      for (let i = 0; i < 3; i++) puff(W / 2 - 290 * BUS, GY + 10, ((t * 6 + i / 3) % 1));
    }
    // progress
    const km = air ? haversineKm(plan.from, plan.to) : plan.km || haversineKm(plan.from, plan.to) * 1.25;
    const p = Math.max(0, Math.min(1, t)) ** 2 * (3 - 2 * Math.max(0, Math.min(1, t)));   // an even pace, easing in and out
    ctx.fillStyle = 'rgba(10,20,30,.45)'; ctx.beginPath(); ctx.roundRect(48, 70, W - 96, 230, 36); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = '700 40px "Anek Bangla", sans-serif';
    ctx.fillText(tr(plan.from.bn), 88, 132);
    ctx.textAlign = 'right'; ctx.fillText(tr(plan.to.bn), W - 88, 132); ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.roundRect(88, 160, W - 176, 14, 7); ctx.fill();
    const grad = ctx.createLinearGradient(88, 0, W - 88, 0); grad.addColorStop(0, '#5cf0b0'); grad.addColorStop(1, '#ffd43b');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.roundRect(88, 160, Math.max(14, (W - 176) * p), 14, 7); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(88 + (W - 176) * p, 167, 16, 0, Math.PI * 2); ctx.fill();
    ctx.font = '800 64px "Anek Bangla", sans-serif';
    ctx.fillText(tr(`${num(Math.round(km * p))} কিমি`), 88, 262);
    const left = Math.max(0, hours * (1 - p));
    ctx.font = '600 34px "Anek Bangla", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.textAlign = 'right';
    ctx.fillText(p > 0.98 ? tr('প্রায় পৌঁছে গেছি') : tr(`আর প্রায় ${fmtMin(left * 60)}`), W - 88, 258);
    ctx.textAlign = 'left';
    // the town being passed
    const towns = air ? [] : along(), now = towns.filter(x => x.u <= p + 0.03).at(-1);
    if (now) {
      const since = Math.min(1, (p - now.u + 0.03) * 12);
      ctx.globalAlpha = Math.min(1, since * 2) * (towns.at(-1) === now && p > 0.9 ? 1 - span(p, 0.9, 0.97) : 1);
      chip(tr(`পথে: ${now.d.bn}`), 72, 340, { dark: true });
      ctx.globalAlpha = 1;
    }
  }

  // Scene 4: arrival — the place itself, a welcome, everyone out with confetti.
  function sceneArrive(t) {
    const coast = COAST.includes(plan.to.id);
    ctx.save();
    const z = 1.12 - 0.12 * span(t, 0, 1);
    ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    if (backdrop) cover(backdrop, 0, 0, W, H);
    else if (coast) {
      sky(0.55, 0, 760);
      const sea = ctx.createLinearGradient(0, 700, 0, 980); sea.addColorStop(0, '#2a8fd6'); sea.addColorStop(1, '#7fd3f0');
      ctx.fillStyle = sea; ctx.fillRect(0, 700, W, 300);
      ctx.fillStyle = '#f2dfb4'; ctx.fillRect(0, 980, W, H - 980);
    } else { sky(0.4); land(0, 0.4, HILLS.includes(plan.to.id) ? 200 : 40); }
    ctx.restore();
    if (coast) {
      for (let r = 0; r < 4; r++) {
        ctx.strokeStyle = `rgba(255,255,255,${0.55 - r * 0.1})`; ctx.lineWidth = 5; ctx.beginPath();
        for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 1000 + r * 26 + Math.sin(x / 70 + t * 18 + r) * 7);
        ctx.stroke();
      }
    }
    const veil = ctx.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, 'rgba(0,0,0,.45)'); veil.addColorStop(0.4, 'rgba(0,0,0,.05)'); veil.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = veil; ctx.fillRect(0, 0, W, H);
    headline(tr('পৌঁছে গেছি!'), tr(`স্বাগতম, ${plan.to.bn}`), span(t, 0.05, 0.35));
    // everyone jumps out and lands in a row
    const n = groupSize(), nm = names(), gap = Math.min(200, (W - 220) / Math.max(1, n - 1));
    for (let i = 0; i < n; i++) {
      const k = span(t, 0.15 + i * 0.07, 0.45 + i * 0.07);
      if (k <= 0) continue;
      const cx = W / 2 + (i - (n - 1) / 2) * gap, cy = 1080 - Math.abs(Math.sin(k * Math.PI * 2)) * 70 * (1 - k * 0.6) - Math.sin(t * 16 + i) * 6;
      ctx.globalAlpha = Math.min(1, k * 3);
      face(i, cx, cy, 82);
      if (nm[i]) nameTag(nm[i], cx, cy + 112);
      ctx.globalAlpha = 1;
    }
    // confetti
    const c = span(t, 0.2, 1);
    for (let i = 0; i < 90; i++) {
      const x = rand(i) * W + Math.sin(t * 6 + i) * 30, y = -40 + c * (H + 200) * (0.6 + rand(i + 50) * 0.6) - rand(i + 7) * 300;
      if (y < -30 || y > H) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 10 * (rand(i + 3) - 0.5) + i);
      ctx.fillStyle = ['#ffd43b', '#ff6b6b', '#5cf0b0', '#74c0fc', '#f783ac'][i % 5]; ctx.fillRect(-9, -5, 18, 10);
      ctx.restore();
    }
  }

  // The whole piece, T from 0 to 1: four scenes, then the card opens out of the arrival.
  const CUTS = [0, 0.15, 0.32, 0.66, 0.84, 1];
  function drawScene(T) {
    if (T >= 1) { drawCard(1); return; }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const k = i => (T - CUTS[i]) / (CUTS[i + 1] - CUTS[i]);
    if (T < CUTS[1]) sceneReady(k(0));
    else if (T < CUTS[2]) sceneBoard(k(1));
    else if (T < CUTS[3]) sceneRoad(k(2), (T - CUTS[2]) * 260);
    else if (T < CUTS[4]) sceneArrive(k(3));
    else {
      sceneArrive(1);
      const kk = k(4);
      ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H * 0.62, ease(kk / 0.3) * 1600, 0, Math.PI * 2); ctx.clip();
      drawCard(Math.max(0, (kk - 0.05) / 0.95));
      ctx.restore();
    }
    // a soft crossfade over each cut
    for (const c of CUTS.slice(1, 4)) {
      const d = Math.abs(T - c);
      if (d < 0.012) { ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - d / 0.012)})`; ctx.fillRect(0, 0, W, H); }
    }
  }

  function play(duration = 13000) {
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
    drawScene(0);
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
    await play(13000);
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
