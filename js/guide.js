// ---- ৬৪ জেলা: where to go, what each district is famous for, and how to get there from Dhaka ----
// Places and pictures: data/district-guide.json (tools/build-guide.mjs) — the places each district's Bangla Wikipedia
// article lists as its sights, the most-read first (Wikipedia page views, 60 days); pictures from Wikimedia Commons.
// Famous foods and products: the government's GI register (data/district-famous.js). Fares: BRTA and the counter list.

const DIVISION_TINT = { 'ঢাকা': ['#0a84ff', '#0060df'], 'চট্টগ্রাম': ['#30d158', '#0a9f6e'], 'সিলেট': ['#64d2ff', '#0a84ff'], 'রাজশাহী': ['#ff9f0a', '#d4581a'],
  'খুলনা': ['#34c759', '#1f7a4d'], 'বরিশাল': ['#5e5ce6', '#3634a3'], 'রংপুর': ['#ff6482', '#c4325a'], 'ময়মনসিংহ': ['#bf5af2', '#7d36a8'] };
let GUIDE = null, guideLoading = null, GI_STORY = {};
const loadGuide = () => GUIDE ? Promise.resolve(GUIDE) : (guideLoading = guideLoading || Promise.all([
  fetch('data/district-guide.json').then(r => r.json()).then(j => j.guide || {}).catch(() => ({})),
  fetch('data/gi-guide.json').then(r => r.json()).catch(() => ({}))
]).then(([g, gi]) => { GI_STORY = gi || {}; return (GUIDE = g); }));
// The districts you have been to: kept on this phone, ticked in each district's guide.
const VISITED_KEY = 'bdmap.visited';
const visited = () => { try { return new Set(JSON.parse(localStorage.getItem(VISITED_KEY)) || []); } catch { return new Set(); } };
const setVisited = set => { try { localStorage.setItem(VISITED_KEY, JSON.stringify([...set])); } catch { /* storage off */ } };
const tl2 = (bn, en) => (LANG === 'en' ? en : bn);
const commonsLink = file => file ? `https://bn.wikipedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}` : '';   // shows Commons files and the wiki's own
const wikiLink = page => page ? `https://bn.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}` : '';
// A Wikimedia thumbnail at another of its standard widths (a card needs 500 px, not 1280); an original stays as it is.
const sized = (url, w) => url ? url.replace(/\/(\d+)px-([^/?]+)(\?|$)/, (m, old, name, q) => `/${Math.min(+old, w)}px-${name}${q}`) : '';
// A picture over its colour: the colour shows at once, the picture fades in only once it has all arrived.
function photo(box, url, division, w) {
  box.style.background = coverStyle('', division);
  if (!url) return;
  const img = Object.assign(el('img', 'dg-img'), { alt: '', loading: 'lazy', decoding: 'async', src: sized(url, w) });
  img.addEventListener('load', () => img.classList.add('in'));
  img.addEventListener('error', () => img.remove());
  box.prepend(img);
}
// A district's own picture, unless its article shows a map; then its first place's.
const looksLikeMap = f => /map|locator|মানচিত্র|\.svg$/i.test(f || '');
const coverOf = g => (g.img && !looksLikeMap(g.file) ? g.img : ((g.sights || []).find(s => s.img && !looksLikeMap(s.file)) || {}).img || '');
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
    photo(cover, coverOf(g), d.division, 500);
    const meta = el('span', 'dg-meta');
    meta.append(el('b', null, d.bn), el('small', null, [sights ? tl2(`${num(sights)}টি জায়গা`, `${sights} places`) : '', gi[0] ? gi[0].bn.replace(/^.+?র /, '') : ''].filter(Boolean).join(' · ') || tl2(`${d.division} বিভাগ`, d.division)));
    c.append(cover, meta);
    if (visited().has(d.id)) c.appendChild(Object.assign(el('span', 'dg-been'), { innerHTML: svg('check'), title: tl2('গিয়েছেন', 'Been there') }));
    c.addEventListener('click', () => openGuide(d));
    return c;
  }
  function renderList() {
    const q = filter.value.trim();
    list.replaceChildren();
    const been = visited();
    for (const div of [...new Set(DISTRICTS.map(d => d.division))]) {
      if (division && division !== '__been' && div !== division) continue;
      const ds = DISTRICTS.filter(d => d.division === div && (!q || matches(d, q)) && (division !== '__been' || been.has(d.id)));
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
    if (!list.children.length) list.appendChild(el('div', 'empty', division === '__been' ? tl2('এখনো কোনো জেলায় "গিয়েছি" চাপেননি। জেলায় চাপ দিয়ে উপরের বোতামটি চাপুন।', 'No district ticked yet. Open one and tap "Been there".') : tl2('এই নামে কোনো জেলা পাওয়া যায়নি।', 'No district by that name.')));
  }
  function renderDivisions() {
    const box = $('dg-divs');
    const chip = (key, label) => { const b = el('button', 'dg-chip' + (division === key ? ' on' : ''), label); b.addEventListener('click', () => { division = key; renderDivisions(); renderList(); }); return b; };
    box.replaceChildren(chip('', tl2('সব', 'All')), chip('__been', tl2(`✓ গিয়েছি · ${num(visited().size)}`, `✓ Been · ${visited().size}`)), ...[...new Set(DISTRICTS.map(d => d.division))].map(div => chip(div, div)));
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
      photo(ph, s.img, s.d.division, 500);
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
    grid.replaceChildren(...items.slice(0, giAll ? items.length : 12).map(([id, bn, en, kind, no]) => {
      const d = districtById(id), story = GI_STORY[bn];
      const c = el('button', 'dg-gi-card' + (story && story.img ? ' has-ph' : ''));
      const ph = el('span', 'gi-ph');
      if (story && story.img) photo(ph, story.img, d.division, 500);
      ph.appendChild(el('span', 'gi-mark', 'GI'));
      const t = el('span', 't');
      t.append(el('b', null, LANG === 'en' ? en : bn), el('small', null, d.bn));
      c.append(ph, t);
      c.addEventListener('click', () => openStory({ id, bn, en, kind, no }));
      return c;
    }));
    if (!giAll && items.length > 12) {
      const more = el('button', 'dg-more', tl2(`সব ${num(items.length)}টি দেখুন`, `See all ${items.length}`));
      more.addEventListener('click', () => { giAll = true; renderGI(); });
      grid.appendChild(more);
    }
  }

  // ---- a GI product's story: its picture, the district, and what Wikipedia tells of it ----
  function openStory(p) {
    const d = districtById(p.id), story = GI_STORY[p.bn];
    const box = el('div', 'dg-sheet gi-story');
    const scroller = el('div', 'dg-scroll');
    const hero = el('header', 'dg-hero gi-hero');
    photo(hero, story && story.img, d.division, 1280);
    const x = el('button', 'lv-icon dg-x');
    x.innerHTML = svg('close');
    x.setAttribute('aria-label', tl2('বন্ধ করুন', 'Close'));
    const title = el('div', 'dg-title');
    const badge = el('span', 'gi-badge');
    badge.append(el('span', 'gi-mark', 'GI'), el('span', null, tl2(`জিআই জার্নাল নং ${num(p.no)}`, `GI journal no. ${p.no}`)));
    title.append(badge, el('h2', null, LANG === 'en' ? p.en : p.bn));
    const go = el('button', 'gi-district');
    go.append(ic('pin'), el('span', null, tl2(`${d.bn} জেলা · ${p.kind === 'f' ? 'খাবার' : 'পণ্য'}`, `${d.bn} · ${p.kind === 'f' ? 'food' : 'goods'}`)), ic('chev'));
    title.appendChild(go);
    hero.append(x, title);
    if (story && story.file) { const cr = el('a', 'dg-credit', tl2('ছবি', 'Photo')); cr.href = commonsLink(story.file); cr.target = '_blank'; cr.rel = 'noopener'; hero.appendChild(cr); }
    const body = el('div', 'dg-body gi-body');
    if (story && story.text) {
      // general only if the text does not speak of this place either (কাঁচাগোল্লা's article is about Natore's)
      const stem = p.bn.split(' ')[0].replace(/(র|ের|এর)$/, '');
      const general = story.general && !story.text.includes(d.bn) && !story.text.includes(stem);
      if (general) body.appendChild(el('p', 'dg-note gi-general', tl2(`এই জেলার পণ্যটি নিয়ে উইকিপিডিয়ায় আলাদা নিবন্ধ নেই — নিচে «${story.page}» নিয়ে যা লেখা আছে।`, `Wikipedia has no article on this district's product itself — below is what it says about «${story.page}».`)));
      for (const para of story.text.split('\n').filter(Boolean)) body.appendChild(el('p', 'gi-text no-tr', para));
      const more = el('a', 'dg-wiki', tl2('উইকিপিডিয়ায় পুরোটা পড়ুন', 'Read it all on Wikipedia'));
      more.href = wikiLink(story.page); more.target = '_blank'; more.rel = 'noopener';
      body.appendChild(more);
    } else body.appendChild(el('p', 'gi-text', tl2('এই পণ্যটি নিয়ে বাংলা উইকিপিডিয়ায় এখনো কোনো নিবন্ধ নেই। এটি সরকারের জিআই তালিকায় নিবন্ধিত — অর্থাৎ এর নাম, স্বাদ বা গুণ এই এলাকার সাথেই জড়িয়ে আছে।', 'Bangla Wikipedia has no article on this yet. It is registered as a GI — its name and quality belong to this place.')));
    // the same district's other famous things
    const others = giOf(p.id).filter(o => o.bn !== p.bn);
    if (others.length) {
      body.appendChild(el('h3', 'dg-h', tl2(`${d.bn}-এর আরও`, `More from ${d.bn}`)));
      const row = el('div', 'dg-famous');
      for (const o of others) { const b = el('button', 'dg-fam ' + o.kind); b.append(Object.assign(el('span', 'fi'), { innerHTML: svg(o.kind === 'f' ? 'fork' : 'bag') }), el('b', null, LANG === 'en' ? o.en : o.bn)); b.addEventListener('click', () => { close(); openStory({ id: p.id, ...o }); }); row.appendChild(b); }
      body.appendChild(row);
    }
    body.appendChild(el('p', 'tx-source', tl2('লেখা: বাংলা উইকিপিডিয়া (CC BY-SA) · ছবি: উইকিমিডিয়া কমন্স · ' + GI_SOURCE.bn, 'Text: Bangla Wikipedia (CC BY-SA) · Photo: Wikimedia Commons · ' + GI_SOURCE.en)));
    scroller.append(hero, body);
    box.appendChild(scroller);
    document.body.appendChild(box);
    document.body.classList.add('reels-open');
    const close = () => { box.classList.add('out'); setTimeout(() => box.remove(), 280); document.body.classList.remove('reels-open'); };
    x.addEventListener('click', close);
    go.addEventListener('click', () => { close(); setTimeout(() => openGuide(d), 120); });
    scroller.addEventListener('scroll', () => hero.style.setProperty('--k', Math.min(1, scroller.scrollTop / 260).toFixed(3)), { passive: true });
  }
  window.openStory = openStory;

  // ---- one district, full screen ----
  async function openGuide(d, focusPage) {
    await loadGuide();
    const g = GUIDE[d.id] || {}, gi = giOf(d.id), dhaka = districtById('dhaka');
    const box = el('div', 'dg-sheet');
    const scroller = el('div', 'dg-scroll');
    const hero = el('header', 'dg-hero');
    const heroImg = coverOf(g);
    photo(hero, heroImg, d.division, 1280);
    const x = el('button', 'lv-icon dg-x');
    x.innerHTML = svg('close');
    x.setAttribute('aria-label', tl2('বন্ধ করুন', 'Close'));
    const title = el('div', 'dg-title');
    title.append(el('small', null, tl2(`${d.division} বিভাগ`, `${d.division} division`)), el('h2', null, d.bn));
    const chips = el('div', 'dg-facts');
    const been = el('button', 'dg-been-btn');
    const paintBeen = () => { const on = visited().has(d.id); been.classList.toggle('on', on); been.replaceChildren(Object.assign(el('i'), { innerHTML: svg(on ? 'check' : 'plus') }), el('span', null, on ? tl2('গিয়েছি', 'Been there') : tl2('গিয়েছি?', 'Been here?'))); };
    been.addEventListener('click', () => { const set = visited(); if (set.has(d.id)) set.delete(d.id); else set.add(d.id); setVisited(set); paintBeen(); paintRing(); renderDivisions(); renderList(); });
    paintBeen();
    chips.appendChild(been);
    if ((g.sights || []).length) chips.appendChild(el('span', null, tl2(`${num(g.sights.length)}টি দর্শনীয় স্থান`, `${g.sights.length} sights`)));
    if (gi.length) chips.appendChild(el('span', null, tl2(`${num(gi.length)}টি জিআই পণ্য`, `${gi.length} GI products`)));
    title.appendChild(chips);
    hero.append(x, title);
    if (heroImg && g.file && heroImg === g.img) { const cr = el('a', 'dg-credit', tl2('ছবি', 'Photo')); cr.href = commonsLink(g.file); cr.target = '_blank'; cr.rel = 'noopener'; hero.appendChild(cr); }
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
        const c = el('button', 'dg-fam ' + p.kind);
        c.addEventListener('click', () => { box.remove(); openStory({ id: d.id, ...p }); });
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
        photo(ph, s.img, d.division, 960);
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

  function paintRing() {
    const n = visited().size;
    $('rb-n').textContent = num(n);
    $('rb-ring').style.setProperty('--n', n);
  }
  $('rb-ring').addEventListener('click', () => { division = '__been'; renderDivisions(); renderList(); $('district-list').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  // two tabs: the guide and the tour plan (the tour page now lives here)
  const seg = $('rb-seg');
  const showTab = (m, animate = true) => {
    if (!['guide', 'tour'].includes(m)) m = 'guide';
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.m === m));
    for (const k of ['guide', 'tour']) {
      const pane = $('rb-' + k), on = k === m;
      if (on && pane.hidden) { pane.hidden = false; if (animate) { pane.classList.remove('in'); void pane.offsetWidth; pane.classList.add('in'); } }
      else if (!on) pane.hidden = true;
    }
    try { localStorage.setItem('bdmap.rb', m); } catch { /* storage off */ }
    if (m === 'tour' && enter.tour) enter.tour();
  };
  for (const b of seg.querySelectorAll('button')) b.addEventListener('click', () => showTab(b.dataset.m));
  paintRing();
  filter.addEventListener('input', renderList);
  renderDivisions();
  renderList();
  renderGI();
  const nationalBox = $('dg-gi-national');
  if (nationalBox) nationalBox.textContent = tl2('সারা দেশের জিআই: ', 'Countrywide GI: ') + GI_NATIONAL.map(g => (LANG === 'en' ? g[1] : g[0])).join(' · ');
  const before = enter.districts;
  enter.districts = async () => {
    if (before) before();
    let m = 'guide';
    try { m = localStorage.getItem('bdmap.rb') || 'guide'; } catch { /* storage off */ }
    showTab(m, false);
    paintRing();
    await loadGuide();
    const total = DISTRICTS.reduce((n, d) => n + ((GUIDE[d.id] || {}).sights || []).length, 0);
    $('dg-count').textContent = tl2(`৬৪ জেলার ${num(total)}টি দর্শনীয় স্থান, ${num(new Set(GI_PRODUCTS.map(g => g[1])).size)}টি জিআই খাবার ও পণ্য, আর ঢাকা থেকে যাওয়ার ভাড়া — এক জায়গায়।`,
      `${total} sights in 64 districts, ${new Set(GI_PRODUCTS.map(g => g[1])).size} GI foods and goods, and the fare from Dhaka — in one place.`);
    renderTop();
    renderGI();
    renderList();
  };
  if (current === 'districts') enter.districts();
})();
