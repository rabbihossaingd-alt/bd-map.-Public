// ---- Trains: every Bangladesh Railway train between two stations, with times and fares ----
// Data: data/trains.json, built by tools/build-trains.py from the open bd-railway-data set. It is loaded
// the first time it is needed. Published fares exist for 20 intercity trains; for the rest the fare is
// estimated from the distance at the per-km rate those published fares work out to, and marked as such.

const CLASS_NAMES = { shovon: 'শোভন', shovon_chair: 'শোভন চেয়ার', first_class: 'প্রথম শ্রেণি', snigdha: 'স্নিগ্ধা', ac_seat: 'এসি সিট', ac_berth: 'এসি বার্থ' };
const CLASS_ORDER = ['shovon', 'shovon_chair', 'first_class', 'snigdha', 'ac_seat', 'ac_berth'];
const TRAIN_TYPES = { intercity: 'আন্তঃনগর', mail_express: 'মেইল / এক্সপ্রেস', commuter: 'কমিউটার' };

// ---- Launches from Dhaka (Sadarghat) ----
// Source: the open bd-launch-json-data set (as shown on launch-route.vercel.app), which marks every vessel as
// active, unverified or suspended and says where each figure came from. Only vessels it marks ACTIVE are listed
// here; times and deck fares are the range across those vessels. It is not an official timetable, and the
// page tells people to confirm at the terminal.
//   to / when / note: [Bangla, English] · hours: [shortest, longest] · deck: [low, high] taka
//   names: "Bangla|English:numbers" per operator family; an empty number is the vessel with no number.
const LAUNCHES = [
  { to: ['বরিশাল', 'Barishal'], when: ['রাত ৮টা ৩০ – ৯টা', '8:30 – 9:00 pm'], hours: [8.5, 9], deck: [300, 450],
    names: 'সুন্দরবন|Sundarban:10,11,15,16; পারাবত|Parabat:9,10,11,12,18; সুরভী|Surovi:7,8,9; কীর্তনখোলা|Kirtankhola:2,10; অ্যাডভেঞ্চার|Adventure:1; মানামী|Manami; এম খান|M Khan:7; প্রিন্স আওলাদ|Prince Awlad:10; টিপু|Tipu:7' },
  { to: ['চাঁদপুর', 'Chandpur'], when: ['সকাল ৬টা থেকে রাত ১২টা ৩০ পর্যন্ত, সারা দিন', '6:00 am to 12:30 am, all day'], hours: [3, 4], deck: [100, 250],
    names: 'বোগদাদিয়া|Bagdadia:7,8,9; ঈগল|Eagle:3,7; ইমাম হাসান|Imam Hasan:,2,5; ময়ূর|Mayur:2,7,10; রফ রফ|Raf Raf:,2,7; সোনার তরী|Sonar Tari:1,2,4; জমজম|Zam Zam:1,7; মিতালী|Mitali:7; মেঘনা রানী|Meghna Rani; নিউ আল-বোরাক|New Al-Borak; দেশান্তর|Deshantor; লামিয়া|Lamia:2; প্রিন্স অব রাসেল|Prince of Rasel:3; শম্পা|Shampa; তাকওয়া|Taqwa' },
  { to: ['ভোলা (ইলিশা ঘাট)', 'Bhola (Ilisha ghat)'], when: ['সকাল ৮টা · বেলা ১১টা ৪৫ · রাত ৮টা ৩০', '8:00 am · 11:45 am · 8:30 pm'], hours: [5, 6], deck: [350, 350],
    note: ['গ্রীন লাইনে শুধু চেয়ার, ৳৪০০–৫০০', 'Green Line has chairs only, ৳400–500'],
    names: 'গ্রীন লাইন|Green Line:2; ফারহান|Farhan:9; ক্রিস্টাল ক্রুজ|Crystal Cruise' },
  { to: ['চরফ্যাশন (বেতুয়া ঘাট), ভোলা', 'Char Fasson (Betua ghat), Bhola'], when: ['রাত ৭টা ৪৫ – ৮টা ৩০', '7:45 – 8:30 pm'], hours: [10, 10.5], deck: [400, 500],
    names: 'ফারহান|Farhan:6; টিপু|Tipu:13,14' },
  { to: ['লালমোহন, ভোলা', 'Lalmohan, Bhola'], when: ['সন্ধ্যা ৭টা ১৫', '7:15 pm'], hours: [9.5, 10], deck: [400, 500], names: 'মানিক|Manik:11' },
  { to: ['বোরহানউদ্দিন, ভোলা', 'Borhanuddin, Bhola'], when: ['সন্ধ্যা ৬টা ৩০', '6:30 pm'], hours: [8.5, 9], deck: [400, 500], names: 'মানিক|Manik:1' },
  { to: ['মনপুরা ও হাতিয়া', 'Monpura and Hatiya'], when: ['বিকেল ৫টা ৩০ – সন্ধ্যা ৬টা ৩০', '5:30 – 6:30 pm'], hours: [11.5, 11.5], deck: [350, 550],
    names: 'ফারহান|Farhan:3,8,10' },
  { to: ['পটুয়াখালী', 'Patuakhali'], when: ['সন্ধ্যা ৭টা – ৭টা ৩০', '7:00 – 7:30 pm'], hours: [9.5, 10], deck: [200, 500],
    names: 'সুন্দরবন|Sundarban:14; কুয়াকাটা|Kuakata:1; প্রিন্স আওলাদ|Prince Awlad:7; পূবালী|Pubali:12' },
  { to: ['বরগুনা (আমতলী হয়ে)', 'Barguna (via Amtali)'], when: ['সন্ধ্যা ৬টা', '6:00 pm'], hours: [10, 10], deck: [400, 500], names: 'পূবালী|Pubali:1' },
  { to: ['ঝালকাঠি (বরিশাল হয়ে)', 'Jhalokathi (via Barishal)'], when: ['সন্ধ্যা ৬টা', '6:00 pm'], hours: [8, 8], deck: [400, 400], names: 'সুন্দরবন|Sundarban:12' },
  { to: ['কালাইয়া (বাউফল), পটুয়াখালী', 'Kalaiya (Bauphal), Patuakhali'], when: ['সন্ধ্যা ৭টা – রাত ৮টা', '7:00 – 8:00 pm'], hours: [10, 10], deck: [200, 200], names: 'ঈগল|Eagle:4,5' },
  { to: ['মুলাদী, বরিশাল', 'Muladi, Barishal'], when: ['রাত ৮টা – ৮টা ৩০', '8:00 – 8:30 pm'], hours: [8, 9], deck: [300, 400], names: 'দ্বীপরাজ|Dipraj:4; মানিক|Manik:5' }
];
const LAUNCH_CLOSED = ['পিরোজপুর (হুলারহাট) রুটের লঞ্চ নভেম্বর ২০২৪ থেকে বন্ধ।', 'Launches on the Pirojpur (Hularhat) route have been stopped since November 2024.'];

let RAIL = null, railLoading = null;
function loadRail() {
  return railLoading || (railLoading = fetch('data/trains.json').then(r => r.json()).then(data => {
    data.list = Object.entries(data.stations).map(([code, [bn, en, lat, lon]]) => ({ code, bn, en, lat, lon, use: 0 }));
    // Which trains call where: the busiest stations are suggested first, and changes of train are found here.
    const byCode = Object.fromEntries(data.list.map(s => [s.code, s]));
    data.calls = {};
    for (const train of data.trains) {
      train.at = stopMinutes(train);
      train.s.forEach((s, k) => {
        (data.calls[s[0]] = data.calls[s[0]] || []).push([train, k]);
        if (byCode[s[0]]) byCode[s[0]].use++;
      });
    }
    RAIL = data;
    if (LANG === 'en') {                           // station and train names for English mode
      if (!NAMES) buildNames();
      for (const s of data.list) if (!NAMES.has(s.bn)) NAMES.set(s.bn, s.en);
      for (const t of data.trains) if (!NAMES.has(t.bn)) NAMES.set(t.bn, t.en);
    }
    return data;
  }).catch(e => { railLoading = null; throw e; }));
}

// "07:05" in the app's digits.
const clock = hhmm => LANG === 'en' ? hhmm : hhmm.replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);

// Minutes from the train's first stop to each stop, carrying over midnight.
function stopMinutes(train) {
  const out = [];
  let day = 0, last = -1;
  for (const [, arrive, depart] of train.s) {
    const mins = hhmm => { const [h, m] = hhmm.split(':').map(Number); let v = h * 60 + m + day; if (v < last) { day += 1440; v += 1440; } last = v; return v; };
    out.push([mins(arrive), mins(depart)]);
  }
  return out;
}

// One ride on one train, from its stop i to its stop j.
function leg(train, i, j) {
  const km = train.s[j][3] - train.s[i][3];
  // Published fares are from the train's first stop; use them only for that case.
  const published = i === 0 ? train.f[train.s[j][0]] : null;
  // Where the data does not say which classes a train has, the basic class of its type is assumed.
  const classes = train.cls.length ? train.cls : [train.t === 'intercity' ? 'shovon_chair' : 'shovon'];
  const fares = {};
  for (const cls of classes) {
    if (published && published[cls]) fares[cls] = { taka: published[cls], exact: true };
    else if (RAIL.rates[cls] && km > 0) fares[cls] = { taka: Math.max(45, Math.round(km * RAIL.rates[cls] / 5) * 5), exact: false };
  }
  return { train, i, j, depart: train.s[i][2], arrive: train.s[j][1], mins: train.at[j][0] - train.at[i][1], km, fares };
}

// Trains that call at one of `fromCodes` and later at one of `toCodes`, earliest departure first.
function trainsBetween(fromCodes, toCodes) {
  const out = [];
  for (const train of RAIL.trains) {
    const i = train.s.findIndex(s => fromCodes.includes(s[0]));
    if (i < 0) continue;
    const j = train.s.findIndex((s, k) => k > i && toCodes.includes(s[0]));
    if (j >= 0) out.push(leg(train, i, j));
  }
  return out.sort((a, b) => a.depart.localeCompare(b.depart));
}

// With no direct train: two trains with one change, waiting 20 minutes to 4 hours at the junction.
// The quickest few, one per first train.
function trainsWithChange(from, to) {
  const best = new Map();
  for (const [a, i] of RAIL.calls[from] || []) {
    for (let x = i + 1; x < a.s.length; x++) {
      const junction = a.s[x][0];
      if (junction === to) continue;
      for (const [b, k] of RAIL.calls[junction] || []) {
        if (b === a) continue;
        const l = b.s.findIndex((s, n) => n > k && s[0] === to);
        if (l < 0) continue;
        const arrive = a.at[x][0] % 1440, leave = b.at[k][1] % 1440;
        const wait = (leave - arrive + 1440) % 1440;
        if (wait < 20 || wait > 240) continue;
        const first = leg(a, i, x), second = leg(b, k, l);
        const total = first.mins + wait + second.mins;
        const old = best.get(a.c);
        if (!old || total < old.total) best.set(a.c, { first, second, wait, total, junction });
      }
    }
  }
  return [...best.values()].sort((p, q) => p.total - q.total).slice(0, 6).sort((p, q) => p.first.depart.localeCompare(q.first.depart));
}

function cheapest(fares) {
  const cls = CLASS_ORDER.find(c => fares[c]);
  return cls ? { cls, ...fares[cls] } : null;
}
const stationName = code => RAIL.stations[code][0];
const offText = t => t.off ? `${t.off[0]} বন্ধ` : 'প্রতিদিন';
const trainName = t => `${tr(t.bn)} (${num(+t.c) || t.c})`;
const pathOf = r => r.train.s.slice(r.i, r.j + 1).map(s => ({ lat: RAIL.stations[s[0]][2], lon: RAIL.stations[s[0]][3], name: RAIL.stations[s[0]][0] }));

function trainCard(r) {
  const low = cheapest(r.fares);
  const sub = [`${clock(r.depart)} → ${clock(r.arrive)}`, fmtMin(r.mins), offText(r.train)].join(' · ');
  const price = low ? (low.exact ? taka(low.taka) : `~${taka(low.taka)}`) : '';
  return item('train', trainName(r.train), sub, price, () => openTrain(r));
}

function fareTilesOf(r) {
  const tiles = el('div', 'tiles');
  for (const c of CLASS_ORDER.filter(c => r.fares[c])) {
    tiles.appendChild(tile(r.fares[c].exact ? 'main' : '', CLASS_NAMES[c], taka(r.fares[c].taka), r.fares[c].exact ? 'রেলওয়ের ভাড়া' : 'আনুমানিক'));
  }
  return tiles;
}

function openTrain(r) {
  const t = r.train, body = [];
  if (Object.keys(r.fares).length) body.push(fareTilesOf(r));
  body.push(el('div', 'label', `${TRAIN_TYPES[t.t] || ''} · ${num(r.km, 0)} কিমি · ${offText(t)}`));
  const ul = el('ul', 'timeline times');
  t.s.forEach((s, k) => {
    const li = el('li', k < r.i || k > r.j ? 'dim' : '');
    li.append(el('b', null, clock(k === 0 ? s[2] : s[1])), document.createTextNode(stationName(s[0])));
    ul.appendChild(li);
  });
  body.push(ul);
  openModal(tr(t.bn), `${stationName(t.s[r.i][0])} → ${stationName(t.s[r.j][0])} · ${fmtMin(r.mins)}`, body,
    [button('route', 'ম্যাপে দেখুন', () => { closeModal(); pendingPath = [pathOf(r)]; go('trip'); })]);
}

// A journey with one change of train.
function changeCard(c) {
  const a = cheapest(c.first.fares), b = cheapest(c.second.fares);
  const sub = [`${clock(c.first.depart)} → ${clock(c.second.arrive)}`, fmtMin(c.total), `${stationName(c.junction)}-এ ট্রেন বদল`].join(' · ');
  return item('train', `${tr(c.first.train.bn)} → ${tr(c.second.train.bn)}`, sub, a && b ? `~${taka(a.taka + b.taka)}` : '', () => openChange(c));
}
function openChange(c) {
  const body = [];
  for (const r of [c.first, c.second]) {
    const from = r.train.s[r.i][0], to = r.train.s[r.j][0];
    body.push(el('div', 'label', `${trainName(r.train)} · ${offText(r.train)}`),
      item('train', `${stationName(from)} → ${stationName(to)}`, `${clock(r.depart)} → ${clock(r.arrive)} · ${fmtMin(r.mins)}`, ''));
    if (Object.keys(r.fares).length) body.push(fareTilesOf(r));
    if (r === c.first) body.push(el('div', 'empty', `${stationName(c.junction)} স্টেশনে অপেক্ষা ${fmtMin(c.wait)}`));
  }
  body.push(el('div', 'form-note', 'দুটি ট্রেনের টিকিট আলাদা কাটতে হয়। প্রথম ট্রেন দেরি করলে পরেরটি ধরা নাও যেতে পারে।'));
  openModal(`${stationName(c.first.train.s[c.first.i][0])} → ${stationName(c.second.train.s[c.second.j][0])}`, `এক বদলে · ${fmtMin(c.total)}`, body,
    [button('route', 'ম্যাপে দেখুন', () => { closeModal(); pendingPath = [pathOf(c.first), pathOf(c.second)]; go('trip'); })]);
}

// ---- the Train page ----
(function initTrainPage() {
  const picked = { from: null, to: null };
  const list = $('train-list'), note = $('train-note');

  function show() {
    list.replaceChildren();
    if (!picked.from || !picked.to) { note.textContent = 'দুটি স্টেশন বেছে নিন।'; return; }
    if (picked.from.code === picked.to.code) { note.textContent = 'দুটি আলাদা স্টেশন বেছে নিন।'; return; }
    const found = trainsBetween([picked.from.code], [picked.to.code]);
    if (found.length) {
      note.textContent = `${num(found.length)} টি ট্রেন · চাপ দিলে সব স্টেশন ও ভাড়া`;
      list.append(...found.map(trainCard));
    } else {
      const via = trainsWithChange(picked.from.code, picked.to.code);
      if (!via.length) { note.textContent = `${picked.from.bn} থেকে ${picked.to.bn} সরাসরি বা এক বদলে কোনো ট্রেন তালিকায় নেই।`; return; }
      note.textContent = `সরাসরি ট্রেন নেই · এক বদলে ${num(via.length)} টি উপায়`;
      list.append(...via.map(changeCard));
    }
    stagger(list);
  }

  // Station inputs: any spelling; the best match first, then the busier station. An empty box offers the busiest.
  function wire(which) {
    const input = $('train-' + which), box = $('train-' + which + '-suggest');
    function fill() {
      box.replaceChildren();
      if (!RAIL) { box.hidden = true; return; }
      const q = input.value.trim(), low = q.toLowerCase();
      let hits;
      if (q.length < 2 || picked[which]) {
        hits = [...RAIL.list].sort((a, b) => b.use - a.use).slice(0, 7);
        box.appendChild(el('div', 'sug-head', 'ব্যস্ত স্টেশন'));
      } else {
        const starts = s => s.bn.startsWith(q) || s.en.toLowerCase().startsWith(low) ? 1 : 0;
        hits = RAIL.list.map(s => ({ s, score: matchScore(s, q), starts: starts(s) })).filter(x => x.score)
          .sort((a, b) => b.score - a.score || b.starts - a.starts || b.s.use - a.s.use).slice(0, 8).map(x => x.s);
      }
      for (const s of hits) {
        const row = el('div', 'sug');
        const t = el('div', 't');
        t.append(el('b', null, s.bn), el('span', null, `${s.en} · ${num(s.use)} টি ট্রেন`));
        row.append(ic('train'), t);
        row.addEventListener('mousedown', e => { e.preventDefault(); pick(which, s); box.hidden = true; input.blur(); });
        box.appendChild(row);
      }
      box.hidden = !hits.length;
    }
    input.addEventListener('input', () => { picked[which] = null; fill(); });
    input.addEventListener('focus', () => { input.select(); fill(); });
    input.addEventListener('keydown', e => {
      const first = box.querySelector('.sug');
      if (e.key === 'Enter' && first && !box.hidden && !picked[which] && input.value.trim().length >= 2) { e.preventDefault(); first.dispatchEvent(new MouseEvent('mousedown', { cancelable: true })); }
    });
    input.addEventListener('blur', () => { box.hidden = true; });
  }
  function pick(which, station) {
    picked[which] = station;
    $('train-' + which).value = tr(station.bn);
    show();
  }
  wire('from');
  wire('to');
  $('train-swap').addEventListener('click', () => {
    const a = picked.from, b = picked.to;
    if (a && b) { pick('from', b); pick('to', a); }
  });

  // Launches. The text is written in the app's language here, because the times do not translate word by word.
  const L = LANG === 'en' ? 1 : 0;
  const vessels = spec => spec.split('; ').flatMap(family => {
    const [names, numbers] = family.split(':');
    const name = names.split('|')[L];
    return numbers == null ? [name] : numbers.split(',').map(n => n ? `${name} ${L ? n : num(+n)}` : name);
  });
  const launchCards = LAUNCHES.map(l => {
    const h = x => num(x, Number.isInteger(x) ? 0 : 1);
    const hours = l.hours[0] === l.hours[1] ? h(l.hours[0]) : `${h(l.hours[0])}–${h(l.hours[1])}`;
    const list = vessels(l.names);
    const card = el('article', 'lx-card');
    const top = el('div', 'lx-top');
    const icon = el('span', 'lx-ic');
    icon.innerHTML = svg('launchBoat');
    const routeBox = el('div', 'lx-route');
    routeBox.append(el('small', null, L ? 'Sadarghat, Dhaka' : 'সদরঘাট, ঢাকা'), el('b', null, l.to[L]));
    const fare = el('div', 'lx-fare');
    fare.append(el('small', null, L ? 'Deck' : 'ডেক'), el('b', null, fareRange(l.deck[0], l.deck[1])));
    top.append(icon, routeBox, fare);
    const meta = el('div', 'lx-meta');
    const item = (ico, text) => { const s = el('span'); s.append(ic(ico), el('span', null, text)); return s; };
    meta.append(item('clock', l.when[L]), item('hourglass', `${hours} ${L ? 'hours' : 'ঘণ্টা'}`));
    card.append(top, meta);
    if (l.note) card.appendChild(el('div', 'lx-note', l.note[L]));
    const more = el('button', 'lx-more');
    more.append(el('span', null, L ? `${list.length} launch${list.length > 1 ? 'es' : ''}` : `${num(list.length)}টি লঞ্চ`), ic('chev'));
    const chips = el('div', 'lx-vessels');
    chips.append(...list.map(n => el('span', 'badge', n)));
    chips.hidden = true;
    more.addEventListener('click', () => { chips.hidden = !chips.hidden; card.classList.toggle('open', !chips.hidden); });
    card.append(more, chips);
    card._find = (l.to[0] + ' ' + l.to[1] + ' ' + list.join(' ')).toLowerCase();
    $('launch-grid').appendChild(card);
    return card;
  });
  $('launch-filter').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    for (const c of launchCards) { c.hidden = !!q && !c._find.includes(q); shown += !c.hidden; }
    let none = $('launch-grid').querySelector('.empty');
    if (!shown && !none) { none = el('div', 'empty', L ? 'No launch to that place in the list.' : 'এই জায়গার লঞ্চ তালিকায় নেই।'); $('launch-grid').appendChild(none); }
    if (shown && none) none.remove();
  });
  $('launch-note').textContent = LAUNCH_CLOSED[L] + (L ? ' Source: the open bd-launch-json-data set; only launches it marks as running are listed.'
                                                        : ' সূত্র: খোলা bd-launch-json-data তথ্য; শুধু যেগুলো চালু বলে চিহ্নিত, সেগুলোই দেওয়া হয়েছে।');

  const seg = $('tx-seg'), pill = seg.querySelector('.tseg-pill');
  const placePill = () => {
    const b = seg.querySelector('[aria-selected="true"]');
    if (!b || !b.offsetWidth) return;
    pill.style.width = b.offsetWidth + 'px';
    pill.style.transform = `translateX(${b.offsetLeft - 4}px)`;
  };
  function showMode(m, animate = true) {
    if (!['bus', 'train', 'launch'].includes(m)) m = 'bus';
    seg.classList.toggle('still', !animate);
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.m === m));
    for (const k of ['bus', 'train', 'launch']) {
      const pane = $('tx-' + k), on = k === m;
      if (on && pane.hidden) { pane.hidden = false; pane.classList.remove('in'); void pane.offsetWidth; pane.classList.add('in'); }
      else if (!on) pane.hidden = true;
    }
    placePill();
    try { localStorage.setItem('bdmap.tx', m); } catch { /* storage off */ }
    if (m === 'bus' && enter.districts) enter.districts();
    if (m === 'train') loadTrains();
  }
  for (const b of seg.querySelectorAll('button')) b.addEventListener('click', () => showMode(b.dataset.m));
  addEventListener('resize', placePill);
  let savedMode = 'bus';
  try { savedMode = localStorage.getItem('bdmap.tx') || 'bus'; } catch { /* storage off */ }
  enter.train = () => { showMode(new URLSearchParams(location.search).get('m') || savedMode, false); savedMode = seg.querySelector('[aria-selected="true"]').dataset.m; };

  async function loadTrains() {
    if (RAIL) return;
    note.textContent = 'ট্রেনের তালিকা আসছে…';
    try { await loadRail(); } catch { note.textContent = 'ট্রেনের তালিকা আনা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।'; return; }
    $('train-updated').textContent = `ট্রেনের সময়সূচি: বাংলাদেশ রেলওয়ের তথ্য থেকে, হালনাগাদ ${RAIL.updated}।`;
    pick('from', RAIL.list.find(s => s.code === 'DA'));
    pick('to', RAIL.list.find(s => s.code === 'CTG'));
  }
  if (current === 'train') enter.train();
})();

// ---- trains in the map page's results: stations near both ends of the trip ----
async function renderTrainPane() {
  const pane = $('pane-train'), tab = $('seg').querySelector('[data-pane=train]');
  pane.replaceChildren();
  tab.hidden = true;
  if (!pane.hidden) showPane('bus');
  const from = trip.from, to = trip.to;
  if (!from || !to || haversineKm(from, to) < 25) return;      // nobody takes a train across town
  try { await loadRail(); } catch { return; }
  if (trip.from !== from || trip.to !== to) return;
  const near = p => RAIL.list.map(s => ({ s, d: haversineKm(p, s) })).filter(x => x.d <= 12).sort((a, b) => a.d - b.d).slice(0, 4).map(x => x.s.code);
  const a = near(from), b = near(to);
  if (!a.length || !b.length) return;
  const found = trainsBetween(a, b);
  if (!found.length) return;
  pane.appendChild(el('div', 'label', `${stationName(found[0].train.s[found[0].i][0])} স্টেশন থেকে · ${num(found.length)} টি ট্রেন`));
  pane.append(...found.slice(0, 8).map(trainCard));
  tab.hidden = false;
  $('seg').hidden = false;
}
// The districts page's link opens the Transport page on its bus tab.
for (const a of document.querySelectorAll('.dx-link')) a.addEventListener('click', () => { try { localStorage.setItem('bdmap.tx', 'bus'); } catch { /* storage off */ } });
