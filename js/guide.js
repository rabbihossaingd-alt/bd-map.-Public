// ---- ৬৪ জেলা: where to go, what each district is famous for, and how to get there from Dhaka ----
// Places and pictures: data/district-guide.json (tools/build-guide.mjs) — the places each district's Bangla Wikipedia
// article lists as its sights, the most-read first (Wikipedia page views, 60 days); pictures from Wikimedia Commons.
// Famous foods and products: the government's GI register (data/district-famous.js). Fares: BRTA and the counter list.

const DIVISION_TINT = { 'ঢাকা': ['#0a84ff', '#0060df'], 'চট্টগ্রাম': ['#30d158', '#0a9f6e'], 'সিলেট': ['#64d2ff', '#0a84ff'], 'রাজশাহী': ['#ff9f0a', '#d4581a'],
  'খুলনা': ['#34c759', '#1f7a4d'], 'বরিশাল': ['#5e5ce6', '#3634a3'], 'রংপুর': ['#ff6482', '#c4325a'], 'ময়মনসিংহ': ['#bf5af2', '#7d36a8'] };
let GUIDE = null, guideLoading = null;
const loadGuide = () => GUIDE ? Promise.resolve(GUIDE) : (guideLoading = guideLoading || fetch('data/district-guide.json').then(r => r.json()).then(j => (GUIDE = j.guide || {})).catch(() => (GUIDE = {})));
const tl2 = (bn, en) => (LANG === 'en' ? en : bn);
const commonsLink = file => file ? `https://bn.wikipedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}` : '';   // shows Commons files and the wiki's own
const wikiLink = page => page ? `https://bn.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}` : '';
const coverStyle = (img, division) => {
  const [a, b] = DIVISION_TINT[division] || ['#636366', '#3a3a3c'];
  return img ? `url("${img}") center / cover no-repeat, linear-gradient(150deg, ${a}, ${b})` : `linear-gradient(150deg, ${a}, ${b})`;
};

(function initGuide() {
  const list = $('district-list'), filter = $('district-filter');
  let division = '', giKind = 'f', giAll = false;

  function card(d) {
    const g = (GUIDE || {})[d.id] || {}, gi = giOf(d.id), sights = (g.sights || []).length;
    const c = el('button', 'dg-card');
    const cover = el('span', 'dg-cover');
    cover.style.background = coverStyle(g.img || (g.sights || []).find(s => s.img)?.img, d.division);
    const meta = el('span', 'dg-meta');
    meta.append(el('b', null, d.bn), el('small', null, [sights ? tl2(`${num(sights)}টি জায়গা`, `${sights} places`) : '', gi[0] ? gi[0].bn.replace(/^.+?র /, '') : ''].filter(Boolean).join(' · ') || tl2(`${d.division} বিভাগ`, d.division)));
    c.append(cover, meta);
    c.addEventListener('click', () => openGuide(d));
    return c;
  }
  function renderList() {
    const q = filter.value.trim();
    list.replaceChildren();
    for (const div of [...new Set(DISTRICTS.map(d => d.division))]) {
      if (division && div !== division) continue;
      const ds = DISTRICTS.filter(d => d.division === div && (!q || matches(d, q)));
      if (!ds.length) continue;
      const sec = el('div', 'dg-division');
      const head = el('div', 'dg-dhead');
      const dot = el('i');
      dot.style.background = `linear-gradient(145deg, ${(DIVISION_TINT[div] || [])[0]}, ${(DIVISION_TINT[div] || [])[1]})`;
      head.append(dot, el('b', null, tl2(`${div} বিভাগ`, div)), el('small', null, tl2(`${num(ds.length)} জেলা`, `${ds.length} districts`)));
      const grid = el('div', 'dg-grid');
      grid.append(...ds.map(card));
      sec.append(head, grid);
      list.appendChild(sec);
    }
    if (!list.children.length) list.appendChild(el('div', 'empty', tl2('এই নামে কোনো জেলা পাওয়া যায়নি।', 'No district by that name.')));
  }
  function renderDivisions() {
    const box = $('dg-divs');
    const chip = (key, label) => { const b = el('button', 'dg-chip' + (division === key ? ' on' : ''), label); b.addEventListener('click', () => { division = key; renderDivisions(); renderList(); }); return b; };
    box.replaceChildren(chip('', tl2('সব', 'All')), ...[...new Set(DISTRICTS.map(d => d.division))].map(div => chip(div, div)));
  }
  // the most-read places in the country
  function renderTop() {
    const all = [];
    for (const d of DISTRICTS) for (const s of ((GUIDE || {})[d.id] || {}).sights || []) if (s.img && s.lat != null) all.push({ ...s, d });   // places with a picture and a position
    const seen = new Set();
    const top = all.sort((a, b) => b.views - a.views).filter(s => !seen.has(s.page) && seen.add(s.page)).slice(0, 14);
    const rail = $('dg-top');
    rail.replaceChildren(...top.map((s, i) => {
      const c = el('button', 'dg-place');
      const ph = el('span', 'ph');
      ph.style.background = coverStyle(s.img, s.d.division);
      ph.appendChild(el('em', null, num(i + 1)));
      const t = el('span', 't');
      t.append(el('b', 'no-tr', s.name), el('small', null, s.d.bn));
      c.append(ph, t);
      c.addEventListener('click', () => openGuide(s.d, s.page));
      return c;
    }));
    $('dg-top-sec').hidden = !top.length;
  }
  // what each district is famous for (GI)
  function renderGI() {
    const tabs = $('dg-gi-tabs');
    const tab = (k, label, n) => { const b = el('button', 'dg-chip' + (giKind === k ? ' on' : '')); b.append(el('span', null, label), el('small', null, num(n))); b.addEventListener('click', () => { giKind = k; giAll = false; renderGI(); }); return b; };
    tabs.replaceChildren(tab('f', tl2('খাবার', 'Food'), GI_PRODUCTS.filter(g => g[3] === 'f').length), tab('p', tl2('পণ্য', 'Crafts & goods'), GI_PRODUCTS.filter(g => g[3] === 'p').length));
    const grid = $('dg-gi');
    const items = GI_PRODUCTS.filter(g => g[3] === giKind);
    grid.replaceChildren(...items.slice(0, giAll ? items.length : 12).map(([id, bn, en]) => {
      const d = districtById(id);
      const c = el('button', 'dg-gi-card');
      const mark = el('span', 'gi-mark', 'GI');
      const t = el('span', 't');
      t.append(el('b', null, LANG === 'en' ? en : bn), el('small', null, d.bn));
      c.append(mark, t);
      c.addEventListener('click', () => openGuide(d));
      return c;
    }));
    if (!giAll && items.length > 12) {
      const more = el('button', 'dg-more', tl2(`সব ${num(items.length)}টি দেখুন`, `See all ${items.length}`));
      more.addEventListener('click', () => { giAll = true; renderGI(); });
      grid.appendChild(more);
    }
  }

  // ---- one district, full screen ----
  async function openGuide(d, focusPage) {
    await loadGuide();
    const g = GUIDE[d.id] || {}, gi = giOf(d.id), dhaka = districtById('dhaka');
    const box = el('div', 'dg-sheet');
    const scroller = el('div', 'dg-scroll');
    const hero = el('header', 'dg-hero');
    const heroImg = g.img || (g.sights || []).find(s => s.img)?.img;
    hero.style.background = coverStyle(heroImg, d.division);
    const x = el('button', 'lv-icon dg-x');
    x.innerHTML = svg('close');
    x.setAttribute('aria-label', tl2('বন্ধ করুন', 'Close'));
    const title = el('div', 'dg-title');
    title.append(el('small', null, tl2(`${d.division} বিভাগ`, `${d.division} division`)), el('h2', null, d.bn));
    const chips = el('div', 'dg-facts');
    if ((g.sights || []).length) chips.appendChild(el('span', null, tl2(`${num(g.sights.length)}টি দর্শনীয় স্থান`, `${g.sights.length} sights`)));
    if (gi.length) chips.appendChild(el('span', null, tl2(`${num(gi.length)}টি জিআই পণ্য`, `${gi.length} GI products`)));
    title.appendChild(chips);
    hero.append(x, title);
    if (heroImg && g.file) { const cr = el('a', 'dg-credit', tl2('ছবি', 'Photo')); cr.href = commonsLink(g.file); cr.target = '_blank'; cr.rel = 'noopener'; hero.appendChild(cr); }
    const body = el('div', 'dg-body');
    if (g.intro) {
      const p = el('p', 'dg-intro no-tr', g.intro);
      const more = el('a', 'dg-wiki', tl2('উইকিপিডিয়ায় আরও পড়ুন', 'Read more on Wikipedia'));
      more.href = wikiLink(g.page); more.target = '_blank'; more.rel = 'noopener';
      body.append(p, more);
    }
    if (gi.length) {
      body.appendChild(el('h3', 'dg-h', tl2(`${d.bn}-এর বিখ্যাত`, `${d.bn} is famous for`)));
      const row = el('div', 'dg-famous');
      for (const p of gi) {
        const c = el('div', 'dg-fam ' + p.kind);
        c.append(Object.assign(el('span', 'fi'), { innerHTML: svg(p.kind === 'f' ? 'fork' : 'bag') }), el('b', null, LANG === 'en' ? p.en : p.bn), el('small', null, tl2(`জিআই জার্নাল নং ${num(p.no)}`, `GI journal no. ${p.no}`)));
        row.appendChild(c);
      }
      body.appendChild(row);
    }
    if ((g.sights || []).length) {
      body.appendChild(el('h3', 'dg-h', tl2('কোথায় ঘুরবেন', 'Where to go')));
      body.appendChild(el('p', 'dg-note', g.near ? tl2('এই জেলার উইকিপিডিয়া নিবন্ধে দর্শনীয় স্থানের তালিকা নেই — তাই জেলা শহরের ১০ কিমির মধ্যে যেসব জায়গার নিবন্ধ আছে, সেগুলো; বেশি পড়া আগে।', 'This district’s Wikipedia article has no list of sights, so these are the places within 10 km of its town that have an article, the most-read first.')
        : tl2('জেলার উইকিপিডিয়া নিবন্ধে যেসব দর্শনীয় স্থানের নাম আছে — সবচেয়ে বেশি পড়া আগে।', 'The sights the district’s Wikipedia article names — the most-read first.')));
      const grid = el('div', 'dg-sights');
      for (const s of g.sights) {
        const c = el('article', 'dg-sight' + (s.page === focusPage ? ' focus' : ''));
        const ph = el('div', 'ph');
        ph.style.background = coverStyle(s.img, d.division);
        if (s.file) { const cr = el('a', 'dg-credit', '©'); cr.href = commonsLink(s.file); cr.target = '_blank'; cr.rel = 'noopener'; cr.title = tl2('ছবির উৎস ও লাইসেন্স', 'Photo source and licence'); ph.appendChild(cr); }
        const t = el('div', 't');
        t.append(el('b', 'no-tr', s.name));
        if (s.text) t.appendChild(el('p', 'no-tr', s.text));
        const acts = el('div', 'acts');
        if (s.lat != null) { const m = button('pin', tl2('ম্যাপে', 'On map'), () => { box.remove(); document.body.classList.remove('reels-open'); goTo({ lat: s.lat, lon: s.lon, label: s.name }); }, true); acts.appendChild(m); }
        const w = el('a', 'btn quiet', tl2('বিস্তারিত', 'More')); w.href = wikiLink(s.page); w.target = '_blank'; w.rel = 'noopener';
        acts.appendChild(w);
        t.appendChild(acts);
        c.append(ph, t);
        grid.appendChild(c);
      }
      body.appendChild(grid);
    }
    if ((g.sights || []).length < 3) {
      // Wikipedia names few or none for this district: say so, and offer the map's own list nearby
      const few = el('div', 'dg-few');
      few.append(el('p', null, tl2('উইকিপিডিয়ায় এই জেলার দর্শনীয় স্থানের তালিকা এখনো ছোট। ম্যাপের তথ্য (OpenStreetMap) থেকে জেলা শহরের কাছের দর্শনীয় জায়গা খুঁজে দেখুন।',
        'Wikipedia lists few sights for this district so far. Look for sights near the district town in the map data (OpenStreetMap).')),
        button('compass', tl2('কাছাকাছি দর্শনীয় স্থান খুঁজুন', 'Find sights nearby'), () => { box.remove(); document.body.classList.remove('reels-open'); nearbyAt(asPlace(d)); }, true));
      body.appendChild(few);
    }
    // from Dhaka: the fares and the buses (as the old sheet showed)
    if (d !== dhaka) {
      body.appendChild(el('h3', 'dg-h', tl2('ঢাকা থেকে যাবেন কীভাবে', 'Getting there from Dhaka')));
      const official = officialFare(dhaka, d), f = MARKET_FARES[d.id];
      const tiles = el('div', 'tiles');
      if (official) tiles.appendChild(tile('main', tl2('নন-এসি বাস · বিআরটিএ নির্ধারিত', 'Non-AC bus · BRTA'), taka(official.f51), tl2(`${official.terminal} থেকে · ${num(official.km)} কিমি`, `from ${official.terminal} · ${official.km} km`)));
      if (f) tiles.appendChild(tile(official ? '' : 'main', tl2('কাউন্টারে সাধারণত', 'At the counter'), fareRange(f[0], f[1]), f.length > 2 ? tl2(`এসি ${fareRange(f[2], f[3])}`, `AC ${fareRange(f[2], f[3])}`) : tl2('অনানুষ্ঠানিক তালিকা', 'unofficial list')));
      if (tiles.children.length) body.appendChild(tiles);
      const road = el('p', 'dg-note', tl2('সড়কপথের দূরত্ব বের করা হচ্ছে…', 'Working out the road distance…'));
      body.appendChild(road);
      getRoute([dhaka, d]).then(r => { road.textContent = tl2(`সড়কপথে ${num(r.distance / 1000, 1)} কিমি · গাড়িতে প্রায় ${fmtMin(r.duration / 60)}`, `${(r.distance / 1000).toFixed(1)} km by road · about ${fmtMin(r.duration / 60)}`); }).catch(() => { road.textContent = ''; });
      const names = [...new Set([...operatorsBetween(dhaka, d).map(o => o.bn), ...(DIVISION_OPERATORS[d.division] || [])])];
      if (names.length) { const c = el('div', 'chips'); c.append(...names.map(n => el('div', 'chip', n))); body.appendChild(c); }
      const acts = el('div', 'dg-actions');
      acts.append(button('route', tl2('ঢাকা থেকে রুট', 'Route from Dhaka'), () => { box.remove(); document.body.classList.remove('reels-open'); trip.from = asPlace(dhaka); setPlace('to', asPlace(d)); }),
        button('compass', tl2('কাছাকাছি খুঁজুন', 'Find nearby'), () => { box.remove(); document.body.classList.remove('reels-open'); nearbyAt(asPlace(d)); }, true));
      body.appendChild(acts);
    }
    body.appendChild(el('p', 'tx-source', tl2('লেখা: বাংলা উইকিপিডিয়া (CC BY-SA) · ছবি: উইকিমিডিয়া কমন্স, প্রতিটির নিজস্ব লাইসেন্স (© চাপুন) · ' + GI_SOURCE.bn + ' · ভাড়া: বিআরটিএ ও কাউন্টারের তালিকা',
      'Text: Bangla Wikipedia (CC BY-SA) · Photos: Wikimedia Commons, each under its own licence (tap ©) · ' + GI_SOURCE.en + ' · Fares: BRTA and the counter list')));
    scroller.append(hero, body);
    box.appendChild(scroller);
    document.body.appendChild(box);
    document.body.classList.add('reels-open');
    const close = () => { box.classList.add('out'); setTimeout(() => box.remove(), 280); document.body.classList.remove('reels-open'); removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    addEventListener('keydown', key);
    x.addEventListener('click', close);
    // the hero shrinks as the guide scrolls, as in the App Store
    scroller.addEventListener('scroll', () => { const y = Math.min(1, scroller.scrollTop / 260); hero.style.setProperty('--k', y.toFixed(3)); }, { passive: true });
    if (focusPage) setTimeout(() => { const f = box.querySelector('.dg-sight.focus'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 450);
  }
  window.openGuide = openGuide;

  filter.addEventListener('input', renderList);
  renderDivisions();
  renderList();
  renderGI();
  const nationalBox = $('dg-gi-national');
  if (nationalBox) nationalBox.textContent = tl2('সারা দেশের জিআই: ', 'Countrywide GI: ') + GI_NATIONAL.map(g => (LANG === 'en' ? g[1] : g[0])).join(' · ');
  const before = enter.districts;
  enter.districts = async () => {
    if (before) before();
    await loadGuide();
    const total = DISTRICTS.reduce((n, d) => n + ((GUIDE[d.id] || {}).sights || []).length, 0);
    $('dg-count').textContent = tl2(`৬৪ জেলা · ${num(total)}টি দর্শনীয় স্থান`, `64 districts · ${total} sights`);
    renderTop();
    renderList();
  };
  if (current === 'districts') enter.districts();
})();
