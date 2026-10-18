// ---- Many districts in one trip: the order that travels least, a plan day by day, and what it may cost ----
// Lives in the tour tab of রূপসী বাংলা, beside the one-district plan. Distances are the road's (OSRM) when it
// answers, else 1.3 × the straight line; bus fares use BRTA's intercity rate per km; hotel, food and local costs
// are the app's own estimates by kind of place (as in the one-district plan) and are said to be so.
(function initTrip() {
  const pane = document.getElementById('rb-tour');
  if (!pane) return;
  const T = { start: 'dhaka', stops: [], people: 2, nights: 1, style: 1, back: true };
  try { Object.assign(T, JSON.parse(localStorage.getItem('bdmap.trip') || '{}')); } catch { /* storage off */ }
  T.stops = (T.stops || []).filter(id => districtById(id));
  T.nights = Math.max(1, Math.min(5, Number(T.nights) || 1));
  const save = () => { try { localStorage.setItem('bdmap.trip', JSON.stringify(T)); } catch { /* storage off */ } };
  const STYLES = [
    { bn: 'সাশ্রয়ী', en: 'Budget', sub: tl2('নন-এসি বাস, সাধারণ হোটেল', 'Non-AC bus, simple hotel'), bus: 1, tier: 0, food: 450, local: 250 },
    { bn: 'মাঝারি', en: 'Comfort', sub: tl2('এসি বাস, ভালো হোটেল', 'AC bus, good hotel'), bus: 2, tier: 1, food: 750, local: 450 },
    { bn: 'আরামদায়ক', en: 'Premium', sub: tl2('এসি বাস, প্রিমিয়াম হোটেল', 'AC bus, premium hotel'), bus: 2, tier: 2, food: 1300, local: 900 }
  ];
  const kmLine = (a, b) => haversineKm(a, b) * 1.3;

  // ---- the two modes, side by side in one segmented control ----
  const modes = el('div', 'trip-modes');
  modes.innerHTML = `<span class="trip-thumb" aria-hidden="true"></span>`;
  const one = el('button', null, tl2('এক জেলায় ট্যুর', 'One district')), many = el('button', null, tl2('কয়েক জেলা ঘুরে', 'Several districts'));
  modes.append(one, many);
  pane.prepend(modes);
  const box = el('div', 'trip');
  box.hidden = true;
  pane.insertBefore(box, modes.nextSibling);
  const setMode = m => {
    modes.dataset.on = m;
    one.setAttribute('aria-pressed', String(m === 'one')); many.setAttribute('aria-pressed', String(m === 'many'));
    box.hidden = m !== 'many';
    pane.dataset.mode = m;                               // CSS hides the one-district plan while this one shows
    try { localStorage.setItem('bdmap.tripmode', m); } catch { /* storage off */ }
    if (m === 'many') draw();
  };
  one.addEventListener('click', () => setMode('one'));
  many.addEventListener('click', () => setMode('many'));

  // ---- the form ----
  const sel = (value, exclude = []) => {
    const s = el('select');
    for (const div of [...new Set(DISTRICTS.map(d => d.division))]) {
      const og = document.createElement('optgroup'); og.label = tl2(`${div} বিভাগ`, div);
      for (const d of DISTRICTS.filter(d => d.division === div && !exclude.includes(d.id))) og.appendChild(new Option(d.bn, d.id));
      s.appendChild(og);
    }
    if (value) s.value = value;
    return s;
  };
  const step = (n, title, sub) => { const h = el('header', 'trip-step'); h.append(el('span', 'n', num(n)), Object.assign(el('div'), { innerHTML: '' })); h.lastChild.append(el('h4', null, title), el('p', null, sub)); return h; };
  const stepper = (get, set, min, max, unit) => {
    const w = el('div', 'stepper');
    const minus = el('button', 'icon-btn'), plus = el('button', 'icon-btn'), v = el('b');
    minus.innerHTML = svg('minus'); plus.innerHTML = svg('plus');
    const paint = () => { v.textContent = num(get()) + (unit ? ' ' + unit : ''); minus.disabled = get() <= min; plus.disabled = get() >= max; };
    minus.addEventListener('click', () => { set(Math.max(min, get() - 1)); paint(); save(); draw(true); });
    plus.addEventListener('click', () => { set(Math.min(max, get() + 1)); paint(); save(); draw(true); });
    paint(); w.append(minus, v, plus); return w;
  };

  let seq = 0;
  async function draw(onlyPlan) {
    if (!onlyPlan) {
      box.replaceChildren();
      const form = el('div', 'trip-form');
      // 1 start
      const c1 = el('section', 'tp-card');
      const start = sel(T.start);
      start.addEventListener('change', () => { T.start = start.value; T.stops = T.stops.filter(id => id !== T.start); save(); draw(); });
      c1.append(step(1, tl2('কোথা থেকে শুরু', 'Starting from'), tl2('যে জেলা থেকে রওনা দেবেন', 'Where you set off')), Object.assign(el('label', 'trip-select'), {}));
      c1.lastChild.appendChild(start);
      // 2 districts
      const c2 = el('section', 'tp-card');
      c2.appendChild(step(2, tl2('কোন কোন জেলায় যাবেন', 'Districts to visit'), tl2('যত খুশি যোগ করুন — সবচেয়ে কম পথের ক্রমে সাজিয়ে দেওয়া হবে', 'Add as many as you like — they are put in the order that travels least')));
      const chips = el('div', 'trip-chips');
      for (const id of T.stops) {
        const d = districtById(id), c = el('button', 'trip-chip on');
        c.append(el('span', null, d.bn), Object.assign(el('i'), { innerHTML: svg('close') }));
        c.addEventListener('click', () => { T.stops = T.stops.filter(x => x !== id); save(); draw(); });
        chips.appendChild(c);
      }
      const add = sel('', [T.start, ...T.stops]);
      add.prepend(new Option(tl2('+ জেলা যোগ করুন', '+ Add a district'), '', true, true));
      add.addEventListener('change', () => { if (add.value) { T.stops.push(add.value); save(); draw(); } });
      const addWrap = el('label', 'trip-select add'); addWrap.appendChild(add);
      c2.append(chips, addWrap);
      // nearby suggestions: the districts closest to the last one chosen (or to the start)
      const from = districtById(T.stops.at(-1) || T.start);
      const near = DISTRICTS.filter(d => d.id !== T.start && !T.stops.includes(d.id)).map(d => ({ d, km: haversineKm(from, d) })).sort((a, b) => a.km - b.km).slice(0, 5);
      const sug = el('div', 'trip-sug');
      sug.appendChild(el('small', null, tl2(`${from.bn}-এর কাছের জেলা:`, `Near ${from.bn}:`)));
      for (const { d, km } of near) { const b = el('button', 'trip-chip'); b.append(el('span', null, '+ ' + d.bn), el('small', null, tl2(`${num(Math.round(km))} কিমি`, `${Math.round(km)} km`))); b.addEventListener('click', () => { T.stops.push(d.id); save(); draw(); }); sug.appendChild(b); }
      c2.appendChild(sug);
      // 3 people, nights, style
      const c3 = el('section', 'tp-card');
      c3.appendChild(step(3, tl2('কতজন, কেমন ভ্রমণ', 'Who and how'), tl2('দল, প্রতি জেলায় রাত আর খরচের ধরন', 'Group size, nights in each district, and style')));
      const two = el('div', 'tour-two');
      const f1 = el('div'), f2 = el('div');
      f1.append(el('div', 'label', tl2('কতজন', 'People')), stepper(() => T.people, v => { T.people = v; }, 1, 30));
      f2.append(el('div', 'label', tl2('প্রতি জেলায় রাত', 'Nights in each')), stepper(() => T.nights, v => { T.nights = v; }, 1, 5));
      two.append(f1, f2);
      const styles = el('div', 'trip-styles');
      STYLES.forEach((st, i) => {
        const b = el('button', 'trip-style' + (T.style === i ? ' on' : ''));
        b.append(el('b', null, tl2(st.bn, st.en)), el('small', null, st.sub));
        b.addEventListener('click', () => { T.style = i; save(); for (const x of styles.children) x.classList.remove('on'); b.classList.add('on'); draw(true); });
        styles.appendChild(b);
      });
      const back = el('label', 'trip-back');
      const cb = Object.assign(el('input'), { type: 'checkbox', checked: T.back });
      cb.addEventListener('change', () => { T.back = cb.checked; save(); draw(true); });
      back.append(cb, el('span', null, tl2(`শেষে ${districtById(T.start).bn}-এ ফিরে আসবো`, `Come back to ${districtById(T.start).bn} at the end`)));
      c3.append(two, styles, back);
      form.append(c1, c2, c3);
      const out = el('div', 'trip-out');
      box.append(form, out);
    }
    const out = box.querySelector('.trip-out');
    const mine = ++seq;
    if (!T.stops.length) {
      out.replaceChildren(Object.assign(el('div', 'trip-empty'), { innerHTML: '' }));
      out.firstChild.append(el('b', null, tl2('কোথায় কোথায় যাবেন?', 'Where would you like to go?')),
        el('p', null, tl2('শুরুর জেলা আর যেসব জেলায় যেতে চান বেছে নিন — প্রতিদিন কোথায় যাবেন, কী দেখবেন, কোথায় থাকবেন আর মোট কত খরচ হতে পারে, সাজিয়ে দেওয়া হবে।', 'Choose where you start and the districts you want — the plan shows each day, what to see, where to stay and the rough cost.')));
      const eg = el('button', 'btn quiet', tl2('উদাহরণ: ঢাকা থেকে সিলেট, মৌলভীবাজার, হবিগঞ্জ', 'Example: Dhaka to Sylhet, Moulvibazar, Habiganj'));
      eg.addEventListener('click', () => { Object.assign(T, { start: 'dhaka', stops: ['sylhet', 'moulvibazar', 'habiganj'] }); save(); draw(); });
      out.firstChild.appendChild(eg);
      return;
    }
    out.replaceChildren(Object.assign(el('div', 'trip-wait'), { textContent: tl2('পথ সাজানো হচ্ছে…', 'Planning the route…') }));
    if (typeof loadGuide === 'function') await loadGuide().catch(() => {});
    const plan = await planTrip();
    if (mine !== seq) return;
    out.replaceChildren(...renderPlan(plan));
  }

  // The order: nearest next stop first, then improved by swapping pairs while that shortens the trip (2-opt).
  function order(start, stops, back) {
    const pts = stops.map(districtById), s = districtById(start);
    const route = [];
    let at = s, left = [...pts];
    while (left.length) { left.sort((a, b) => haversineKm(at, a) - haversineKm(at, b)); at = left.shift(); route.push(at); }
    const len = r => { let k = 0, p = s; for (const x of r) { k += haversineKm(p, x); p = x; } return k + (back ? haversineKm(p, s) : 0); };
    let better = true;
    while (better) {
      better = false;
      for (let i = 0; i < route.length - 1; i++) for (let j = i + 1; j < route.length; j++) {
        const r = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        if (len(r) + 0.01 < len(route)) { route.splice(0, route.length, ...r); better = true; }
      }
    }
    return route;
  }
  async function planTrip() {
    const s = districtById(T.start), route = order(T.start, T.stops, T.back);
    const ends = [s, ...route, ...(T.back ? [s] : [])];
    let legs = null;
    try { const r = await getRoute(ends); if (r.legs && r.legs.length === ends.length - 1) legs = r.legs.map(l => ({ km: l.distance / 1000, road: true })); } catch { /* the straight-line estimate below */ }
    if (!legs) legs = ends.slice(1).map((d, i) => ({ km: kmLine(ends[i], d), road: false }));
    const st = STYLES[T.style];
    const rooms = Math.ceil(T.people / 2);
    const days = [];
    let day = 1, fare = 0, hotel = 0;
    legs.forEach((leg, i) => {
      const a = ends[i], b = ends[i + 1], hours = Math.round(leg.km / 42 * 2) / 2;
      const each = busFare(busRule(a, b), leg.km) * st.bus;
      fare += each * T.people;
      const last = T.back && i === legs.length - 1;
      if (last) { days.push({ day, a, b, km: leg.km, road: leg.road, hours, each, see: [], stay: null, last }); return; }
      const sights = ((((typeof GUIDE !== 'undefined' && GUIDE && GUIDE[b.id]) || {}).sights) || []).slice().sort((x, y) => (y.views || 0) - (x.views || 0));
      const nights = T.nights, price = window.tourHotelPrices ? window.tourHotelPrices(b)[st.tier] : 2000;
      hotel += price * rooms * nights;
      // the arrival day sees one or two places (one after a long ride); each further day three more
      const arriveSee = hours >= 6 ? 1 : 2;
      days.push({ day, a, b, km: leg.km, road: leg.road, hours, each, see: sights.slice(0, arriveSee), stay: { price, rooms } });
      for (let n = 1, used = arriveSee; n < nights; n++, used += 3) { day++; days.push({ day, b, see: sights.slice(used, used + 3), stay: { price, rooms } }); }
      day++;                                                         // the next ride is the morning after the last night
    });
    const totalDays = T.back ? day : day - 1;
    const food = st.food * T.people * totalDays, local = st.local * T.people * totalDays;
    const total = fare + hotel + food + local;
    return { route, ends, legs, days, fare, hotel, food, local, total, perHead: total / T.people, km: legs.reduce((k, l) => k + l.km, 0), totalDays, road: legs.every(l => l.road), st };
  }

  function renderPlan(p) {
    const parts = [];
    // the route at a glance: a chain of district names
    const head = el('section', 'trip-head');
    const chain = el('div', 'trip-chain');
    p.ends.forEach((d, i) => { if (i) chain.appendChild(Object.assign(el('i'), { innerHTML: svg('arrow') })); chain.appendChild(el('span', i === 0 || (T.back && i === p.ends.length - 1) ? 'home' : null, d.bn)); });
    const stats = el('div', 'trip-stats');
    const stat = (k, v) => { const x = el('div'); x.append(el('small', null, k), el('b', null, v)); stats.appendChild(x); };
    stat(tl2('জেলা', 'Districts'), num(p.route.length));
    stat(tl2('দিন', 'Days'), num(p.totalDays));
    stat(tl2('মোট পথ', 'Distance'), tl2(`${num(Math.round(p.km))} কিমি`, `${Math.round(p.km)} km`));
    stat(tl2('জনপ্রতি', 'Per person'), taka(p.perHead));
    head.append(el('small', 'trip-kicker', tl2('আপনার ট্রিপ', 'Your trip')), chain, stats);
    parts.push(head);
    // day by day
    const list = el('ol', 'trip-days');
    for (const d of p.days) {
      const li = el('li', 'trip-day' + (d.last ? ' last' : ''));
      li.appendChild(el('span', 'trip-dn', tl2(`দিন ${num(d.day)}`, `Day ${d.day}`)));
      const card = el('div', 'trip-card');
      if (d.a) {
        const go = el('div', 'trip-go');
        go.append(Object.assign(el('i'), { innerHTML: svg('bus') }), el('b', null, `${d.a.bn} → ${d.b.bn}`),
          el('small', null, tl2(`${num(Math.round(d.km))} কিমি · বাসে প্রায় ${fmtMin(d.hours * 60)} · জনপ্রতি ভাড়া ~${taka(d.each)}`, `${Math.round(d.km)} km · about ${fmtMin(d.hours * 60)} by bus · ~${taka(d.each)} each`)));
        card.appendChild(go);
      } else card.appendChild(el('b', 'trip-here', tl2(`${d.b.bn}-এ পুরো দিন`, `A full day in ${d.b.bn}`)));
      if (d.see && d.see.length) {
        card.appendChild(el('small', 'trip-lbl', tl2('যা দেখবেন', 'What to see')));
        const row = el('div', 'trip-see');
        for (const s of d.see) {
          const b = el('button', 'trip-sight');
          const ph = el('span', 'ph');
          photo(ph, s.img, d.b.division, 300, kindArt(s.name) || 'pin');
          b.append(ph, el('span', 'no-tr', s.name));
          b.addEventListener('click', () => openPlace(d.b, s));
          row.appendChild(b);
        }
        card.appendChild(row);
      }
      if (d.stay) card.appendChild(el('p', 'trip-stay', tl2(`রাত ${d.b.bn}-এ · ${num(d.stay.rooms)} রুম × ~${taka(d.stay.price)}`, `Night in ${d.b.bn} · ${d.stay.rooms} room${d.stay.rooms > 1 ? 's' : ''} × ~${taka(d.stay.price)}`)));
      else if (d.last) card.appendChild(el('p', 'trip-stay', tl2('বাড়ি ফেরা — ট্রিপ শেষ', 'Home — the end of the trip')));
      li.appendChild(card);
      list.appendChild(li);
    }
    parts.push(list);
    // the cost
    const cost = el('section', 'tp-card trip-cost');
    cost.appendChild(el('h4', null, tl2('আনুমানিক খরচ', 'Rough cost')));
    const row = (k, sub, v) => { const r = el('div', 'rule'); const l = el('span'); l.append(document.createTextNode(k), el('small', null, sub)); r.append(l, el('b', null, taka(v))); cost.appendChild(r); };
    row(tl2('বাস ভাড়া', 'Bus fares'), tl2(`${num(T.people)} জন · বিআরটিএ হারে${p.st.bus > 1 ? ', এসি' : ''}`, `${T.people} people · BRTA rate${p.st.bus > 1 ? ', AC' : ''}`), p.fare);
    row(tl2('হোটেল', 'Hotels'), tl2(`${num(Math.ceil(T.people / 2))} রুম · ${p.st.bn}`, `${Math.ceil(T.people / 2)} rooms · ${p.st.en}`), p.hotel);
    row(tl2('খাবার', 'Food'), tl2(`${num(p.totalDays)} দিন`, `${p.totalDays} days`), p.food);
    row(tl2('স্থানীয় যাতায়াত ও টিকিট', 'Local transport and tickets'), tl2('সিএনজি, নৌকা, প্রবেশ ফি', 'CNG, boats, entry'), p.local);
    const tot = el('div', 'rule total'); tot.append(el('span', null, tl2('মোট', 'Total')), el('b', null, taka(p.total))); cost.appendChild(tot);
    const ph = el('div', 'per-head'); ph.append(el('span', null, tl2('জনপ্রতি', 'Per person')), el('b', null, taka(p.perHead))); cost.appendChild(ph);
    cost.appendChild(el('p', 'foot', tl2(`${p.road ? 'দূরত্ব সড়কপথের (OSRM)' : 'দূরত্ব আনুমানিক (সোজা দূরত্বের ১.৩ গুণ)'}; বাস ভাড়া বিআরটিএ-র আন্তঃজেলা হারে, এসিতে দ্বিগুণ ধরা। হোটেল, খাবার ও স্থানীয় খরচ আমাদের আনুমানিক ধরা — আসল দাম নয়।`,
      `${p.road ? 'Road distances (OSRM)' : 'Distances estimated (1.3 × straight line)'}; bus fares at BRTA's intercity rate, doubled for AC. Hotel, food and local costs are our estimates, not real prices.`)));
    parts.push(cost);
    // share / copy the plan as text
    const acts = el('div', 'trip-acts');
    const text = () => [tl2('BD Map ট্রিপ প্ল্যান', 'BD Map trip plan'), p.ends.map(d => d.bn).join(' → '), '',
      ...p.days.map(d => `${tl2('দিন', 'Day')} ${num(d.day)}: ${d.a ? `${d.a.bn} → ${d.b.bn} (${num(Math.round(d.km))} ${tl2('কিমি', 'km')})` : d.b.bn}${d.see && d.see.length ? ' — ' + d.see.map(s => s.name).join(', ') : ''}`),
      '', `${tl2('জনপ্রতি আনুমানিক', 'Per person, roughly')} ${taka(p.perHead)}`].join('\n');
    const share = el('button', 'btn'); share.append(ic('send'), el('span', null, tl2('প্ল্যান শেয়ার করুন', 'Share the plan')));
    share.addEventListener('click', async () => { try { if (navigator.share) await navigator.share({ title: tl2('ট্রিপ প্ল্যান', 'Trip plan'), text: text() }); else { await navigator.clipboard.writeText(text()); share.querySelector('span').textContent = tl2('কপি হয়েছে ✓', 'Copied ✓'); } } catch { /* cancelled */ } });
    const print = el('button', 'btn quiet'); print.append(ic('copy'), el('span', null, tl2('প্রিন্ট / PDF', 'Print / PDF')));
    print.addEventListener('click', () => { document.body.classList.add('trip-print'); setTimeout(() => { window.print(); document.body.classList.remove('trip-print'); }, 50); });
    acts.append(share, print);
    parts.push(acts);
    return parts;
  }

  let m = 'one';
  try { m = localStorage.getItem('bdmap.tripmode') || 'one'; } catch { /* storage off */ }
  setMode(m);
})();
