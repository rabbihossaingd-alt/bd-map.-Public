// ---- Community: awareness, fares people know, points and the leaderboard ----
// Anyone logged in can say what a trip costs. Each new fare earns 10 points; the three people with the most
// points stand on the podium and a button opens the top 50. Fares reported for a trip are shown to whoever
// searches that trip on the map. Points have no cash value yet: they are kept for future discounts.

const FARE_MODE_NAMES = { bus: 'বাস', cng: 'সিএনজি', rickshaw: 'রিকশা', leguna: 'লেগুনা', bike: 'বাইক', car: 'কার', train: 'ট্রেন', launch: 'লঞ্চ', other: 'অন্য' };
const FARE_MODE_ICONS = { bus: 'bus', cng: 'cng', rickshaw: 'cng', leguna: 'bus', bike: 'bike', car: 'car', train: 'train', launch: 'ship', other: 'tag' };

// Short reminders, each [title, text] in [Bangla, English]. General road sense only: nothing here is a rule
// the app made up.
const AWARENESS = [
  ['shield', ['ভাড়ার তালিকা দেখে ভাড়া দিন', 'Pay by the fare chart'], ['বাসে সরকার নির্ধারিত ভাড়ার তালিকা টাঙানো থাকার কথা। বেশি চাইলে তালিকাটি দেখতে চান।', 'Buses are meant to display the government fare chart. If you are asked for more, ask to see it.']],
  ['bus', ['চলন্ত বাসে ওঠানামা নয়', 'Never board a moving bus'], ['বাস পুরোপুরি থামলে তবেই উঠুন বা নামুন। কয়েক সেকেন্ড বাঁচাতে গিয়ে জীবনের ঝুঁকি নয়।', 'Get on or off only when the bus has fully stopped. A few seconds are not worth your life.']],
  ['bike', ['বাইকে দুজনেরই হেলমেট', 'Helmets for both on a bike'], ['রাইড শেয়ারের বাইকেও চালকের কাছে আপনার জন্য হেলমেট চেয়ে নিন।', 'On a ride-share bike too, ask the rider for a helmet for yourself.']],
  ['route', ['রাস্তা পার হোন নিরাপদ জায়গায়', 'Cross where it is safe'], ['ফুটওভার ব্রিজ, আন্ডারপাস বা জেব্রা ক্রসিং ব্যবহার করুন। ফোনে চোখ রেখে রাস্তা পার হবেন না।', 'Use a footbridge, underpass or zebra crossing. Do not cross with your eyes on your phone.']],
  ['phone', ['জরুরি বিপদে ৯৯৯', 'In an emergency, call 999'], ['পুলিশ, ফায়ার সার্ভিস বা অ্যাম্বুলেন্স — ৯৯৯ নম্বরে কল বিনামূল্যে।', 'Police, fire service or ambulance — calls to 999 are free.']],
  ['user', ['সংরক্ষিত আসন ছেড়ে দিন', 'Give up reserved seats'], ['নারী, শিশু, বয়স্ক ও প্রতিবন্ধী যাত্রীদের জন্য রাখা আসন তাঁদেরই প্রাপ্য।', 'Seats kept for women, children, elderly and disabled passengers belong to them.']],
  ['bell', ['অপরিচিতের দেওয়া খাবার নয়', 'No food from strangers'], ['যাত্রাপথে অপরিচিত কারও দেওয়া খাবার বা পানীয় নেবেন না।', 'While travelling, do not accept food or drink from someone you do not know.']],
  ['pin', ['রাতের যাত্রায় লোকেশন জানান', 'Share your location at night'], ['রাতে একা যাত্রা করলে পরিবারের কাউকে জানিয়ে রাখুন — মেসেজ থেকে নিজের লোকেশন পাঠাতে পারেন।', 'Travelling alone at night? Let family know — you can send your location from Messages.']]
];

async function communityApi(path, body) {
  const res = await fetch('api/community/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
  if (!res.ok) throw new Error(data.error || 'server');
  return data;
}

// ---- the leaderboard ----
function leaderRow(p, rank) {
  const row = el('div', 'person leader' + (ME && ME.id === p.id ? ' me' : ''));
  const t = el('div', 't');
  t.append(Object.assign(el('b', 'no-tr'), { textContent: p.name }), el('span', null, `${num(p.points)} পয়েন্ট`));
  row.append(el('span', 'rank', num(rank)), avatar(p), t);
  row.classList.add('tap');
  row.addEventListener('click', () => openProfilePage(p.id));
  return row;
}
async function loadLeaders() {
  let data;
  try { data = await communityApi('top?n=3'); } catch { return; }
  const podium = $('podium');
  podium.replaceChildren();
  // Second, first, third: the winner stands in the middle, as on a real podium.
  for (const i of [1, 0, 2]) {
    const p = data.top[i], step = el('div', 'step s' + (i + 1) + (p ? '' : ' none'));
    if (p) { step.classList.add('tap'); step.addEventListener('click', () => openProfilePage(p.id)); }
    if (p) step.append(avatar(p, 'lg'), Object.assign(el('b', 'no-tr'), { textContent: p.name }), el('span', null, `${num(p.points)} পয়েন্ট`));
    else step.append(el('span', 'avatar lg ghost', ''), el('b', null, 'জায়গাটি ফাঁকা'), el('span', null, 'আপনিই হতে পারেন'));
    step.appendChild(el('i', 'block', num(i + 1)));
    podium.appendChild(step);
  }
  $('lead-more').hidden = data.total <= 3;
  $('lead-stats').textContent = `${num(data.fares)} টি ভাড়া জানানো হয়েছে · ${num(data.total)} জন অবদান রেখেছেন`;
  const mine = $('my-points');
  mine.hidden = !ME;
  if (ME && data.me) {
    mine.replaceChildren(avatar(ME, 'sm'), Object.assign(el('span', 't'), { innerHTML: '' }));
    mine.querySelector('.t').append(el('b', null, `${num(data.me.points)} পয়েন্ট`), el('span', null, data.me.rank ? `আপনার অবস্থান ${num(data.me.rank)} নম্বরে` : 'প্রথম ভাড়াটি জানিয়ে তালিকায় আসুন'));
  }
}
async function openTop50() {
  let data;
  try { data = await communityApi('top?n=50'); } catch { return; }
  openModal('সেরা ৫০ জন', 'পয়েন্ট অনুযায়ী', data.top.map((p, i) => leaderRow(p, i + 1)));
}

async function loadRecentFares() {
  let data;
  try { data = await communityApi('recent'); } catch { return; }
  const box = $('recent-fares');
  box.replaceChildren();
  for (const r of data.recent) {
    const row = item(FARE_MODE_ICONS[r.mode], `${r.from} → ${r.to}`, `${FARE_MODE_NAMES[r.mode]} · ${r.user.name}`, taka(r.fare));
    row.querySelector('.t').classList.add('no-tr');
    box.appendChild(row);
  }
  $('recent-label').hidden = !data.recent.length;
}

// ---- the form ----
(function initCommunity() {
  const L = LANG === 'en' ? 1 : 0;
  const tips = $('tips');
  for (const [icon, title, text] of AWARENESS) {
    const card = el('div', 'tip no-tr');
    card.append(ic(icon), el('b', null, title[L]), el('span', null, text[L]));
    tips.appendChild(card);
  }
  dragScroll(tips);
  const step = dir => tips.scrollBy({ left: dir * Math.max(260, tips.clientWidth * 0.8), behavior: 'smooth' });
  $('tips-prev').addEventListener('click', () => step(-1));
  $('tips-next').addEventListener('click', () => step(1));

  const picked = { from: null, to: null };
  let mode = 'bus';
  for (const which of ['from', 'to']) {
    const input = $('give-' + which);
    wireSuggest(input, $('give-' + which + '-suggest'), place => { picked[which] = place; input.value = place.label; input.blur(); }, () => { picked[which] = null; });
  }
  const modes = $('give-modes');
  for (const [id, name] of Object.entries(FARE_MODE_NAMES)) {
    const chip = el('button', 'chip' + (id === mode ? ' on' : ''), name);
    chip.type = 'button';
    chip.addEventListener('click', () => { mode = id; for (const c of modes.children) c.classList.toggle('on', c === chip); });
    modes.appendChild(chip);
  }
  const note = $('give-note'), fare = $('give-fare'), send = $('give-send');
  const say = (text, bad) => { note.className = 'form-note' + (bad ? ' bad' : ' good'); note.textContent = text; };
  const ERR = { place: 'দুটি জায়গাই তালিকা থেকে বেছে নিন।', fare: 'ভাড়া ৫ থেকে ২০,০০০ টাকার মধ্যে একটি সংখ্যা হতে হবে।', same: 'দুটি আলাদা জায়গা বেছে নিন।',
                odd: 'এই দূরত্বের জন্য ভাড়াটি অস্বাভাবিক মনে হচ্ছে। সংখ্যাটি আবার দেখে নিন।', slow: 'আজ অনেকগুলো ভাড়া জানিয়েছেন — ধন্যবাদ! কাল আবার জানাতে পারবেন।' };
  send.addEventListener('click', async () => {
    if (!ME) { openLogin(); return; }
    if (!picked.from || !picked.to) { say(ERR.place, true); return; }
    send.disabled = true;
    try {
      const r = await communityApi('fare', { from: picked.from, to: picked.to, mode, fare: Math.round(+fare.value) });
      ME.points = r.points;
      say(r.earned ? `ধন্যবাদ! আপনি ${num(r.earned)} পয়েন্ট পেলেন। আপনার জানানো ভাড়া এখন অন্যদের কাজে লাগবে।` : 'আপনার আগের জানানো ভাড়াটি বদলে দেওয়া হলো।');
      $('give-card').classList.add('won');
      setTimeout(() => $('give-card').classList.remove('won'), 1200);
      fare.value = '';
      picked.to = null;
      $('give-to').value = '';
      loadLeaders();
      loadRecentFares();
    } catch (e) { say(ERR[e.message] || 'জমা দেওয়া যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।', true); }
    send.disabled = false;
  });
  $('lead-more').addEventListener('click', openTop50);
  enter.community = () => { loadLeaders(); loadRecentFares(); };
  if (current === 'community') enter.community();
})();

// Fares people reported for the trip now on the map, added above the bus list.
async function showCommunityFares() {
  const from = trip.from, to = trip.to;
  if (!from || !to) return;
  let data;
  try { data = await communityApi(`near?flat=${from.lat}&flon=${from.lon}&tlat=${to.lat}&tlon=${to.lon}`); } catch { return; }
  if (trip.from !== from || trip.to !== to || !data.fares.length) return;
  const pane = $('pane-bus');
  for (const old of pane.querySelectorAll('.given')) old.remove();
  const box = el('div', 'given');
  box.appendChild(el('div', 'label', 'যাত্রীদের জানানো ভাড়া'));
  for (const f of data.fares) box.appendChild(item(FARE_MODE_ICONS[f.mode], FARE_MODE_NAMES[f.mode], `${num(f.n)} জন জানিয়েছেন`, taka(f.fare)));
  pane.prepend(box);
}
