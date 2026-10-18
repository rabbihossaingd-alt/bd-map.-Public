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
// Wikimedia serves thumbnails only at its standard widths (a 400 px or 640 px request is refused), so a wanted
// width is rounded up to the next standard one, and never past the width the file was linked at.
const THUMB_WIDTHS = [120, 250, 330, 500, 960, 1280, 1920];
const sized = (url, w) => url ? url.replace(/\/(\d+)px-([^/?]+)(\?|$)/, (m, old, name, q) => `/${Math.min(+old, THUMB_WIDTHS.find(x => x >= w) || 1920)}px-${name}${q}`) : '';
// A picture over its colour: the colour shows at once, the picture fades in only once it has all arrived.
// Line drawings for a place without a photo, chosen by what its name says it is.
const KIND_ART = [
  [/জমিদার|রাজবাড়|প্রাসাদ|বাড়ি|কুঠি|ভিটা/, '<path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M9 21v-5h6v5M8 12h1M15 12h1M12 5V2.5"/><path d="M3 10.5l9-6.5 9 6.5"/>'],
  [/মসজিদ|মাজার|দরগা/, '<path d="M4 21h16M6 21v-7a6 6 0 0112 0v7"/><path d="M12 4.5c1.5 1.4 2 2.6 0 4-2-1.4-1.5-2.6 0-4zM10 21v-4a2 2 0 014 0v4M3 21V9M21 21V9M3 9l-.5-2h1zM21 9l-.5-2h1z"/>'],
  [/মন্দির|মঠ|থান|গির্জা|বিহার/, '<path d="M4 21h16M6 21V13h12v8M8 13l4-9 4 9M12 4V2M10 21v-4h4v4"/>'],
  [/ঝর্ণা|জলপ্রপাত/, '<path d="M4 4h16M7 4v9M12 4v12M17 4v9"/><path d="M3 19c2 0 2-1.5 4.5-1.5S10 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19"/>'],
  [/দিঘি|দীঘি|দীঘী|সাগর|বিল|হাওর|বাওড়|পুখিরি|জলাবন/, '<path d="M3 15c2 0 2-1.5 4.5-1.5S10 15 12 15s2.5-1.5 4.5-1.5S19 15 21 15M3 19c2 0 2-1.5 4.5-1.5S10 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19"/><path d="M8 10V6M8 6l-2 2M8 6l2 2M16 11V5M16 5l-2.5 2.5M16 5l2.5 2.5"/>'],
  [/জাদুঘর|গ্রন্থাগার|হোমস|মিল/, '<path d="M3 21h18M4 10h16M12 3l9 5H3zM6 10v8M10 10v8M14 10v8M18 10v8M4 18h16"/>'],
  [/সেতু|রেলপথ/, '<path d="M2 17h20M4 17v-4M20 17v-4M2 9c4 0 6 4 10 4s6-4 10-4M8 12.2V17M16 12.2V17"/>'],
  [/সৈকত|দ্বীপ|চর|বন্দর|পল্লী/, '<circle cx="17" cy="6" r="2.5"/><path d="M3 19c2 0 2-1.5 4.5-1.5S10 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19M8 16V8M8 8c-3 0-4 2-4 2M8 8c3 0 4 2 4 2M8 8c-1-2.5-3-3-3-3M8 8c1-2.5 3-3 3-3"/>'],
  [/শালবন|অরণ্য|পার্ক|ইকোপার্ক|বন/, '<path d="M7 21v-4M17 21v-5M12 21v-6M7 17l-4 0 4-6-2.5 0L7 6l2.5 5H7l4 6zM17 16h-3.5l3.5-5.5h-2L17 6l2 4.5h-2l3.5 5.5z"/>'],
  [/স্মৃতিসৌধ|বধ্যভূমি|কবর|শহীদ|স্মৃতি/, '<path d="M4 21h16M12 3l2 18M12 3l-2 18M8 21l1.5-10M16 21l-1.5-10"/>']
];
const kindArt = name => (KIND_ART.find(([re]) => re.test(name || '')) || [])[1];
// Without a picture (or when it fails to load) the box shows its kind — a plate, a craft, a place — drawn large and faint.
function photo(box, url, division, w, icon) {
  box.style.background = coverStyle('', division);
  const art = () => { if (icon && !box.querySelector('.ph-art')) box.prepend(Object.assign(el('span', 'ph-art'), { innerHTML: icon.startsWith('<') ? `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>` : svg(icon) })); };
  if (!url) { art(); return; }
  const img = Object.assign(el('img', 'dg-img'), { alt: '', loading: 'lazy', decoding: 'async', src: sized(url, w) });
  img.addEventListener('load', () => img.classList.add('in'));
  img.addEventListener('error', () => { img.remove(); art(); });
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
    photo(cover, coverOf(g), d.division, 500, 'pin');
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
      photo(ph, s.img, s.d.division, 500, kindArt(s.name) || 'pin');
      ph.appendChild(el('em', null, num(i + 1)));
      const t = el('span', 't');
      t.append(el('b', 'no-tr', s.name), el('small', null, s.d.bn));
      c.append(ph, t);
      c.addEventListener('click', () => openPlace(s.d, GUIDE[s.d.id].sights.find(x => x.page === s.page) || s));
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
      photo(ph, story && story.img, d.division, 500, kind === 'f' ? 'fork' : 'bag');
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

  // ---- the reader: a whole Wikipedia article, here, in the app's type — headings, paragraphs, its pictures ----
  const SKIP_SECTIONS = /তথ্যসূত্র|আরও দেখুন|বহিঃসংযোগ|টীকা|পাদটীকা|গ্রন্থপঞ্জি|উৎস|বহিঃ সংযোগ|আরো দেখুন|গ্যালারি|চিত্রশালা|References|See also|External links/;
  async function openArticle(page, { title, img, file, sub, place } = {}) {
    const box = el('div', 'dg-sheet ar-sheet');
    const scroller = el('div', 'dg-scroll');
    const hero = el('header', 'dg-hero ar-hero');
    photo(hero, img, '', 1280, kindArt(title) || 'info');
    const x = el('button', 'lv-icon dg-x');
    x.innerHTML = svg('close');
    x.setAttribute('aria-label', tl2('বন্ধ করুন', 'Close'));
    const head = el('div', 'dg-title');
    if (sub) head.appendChild(el('small', null, sub));
    head.appendChild(el('h2', 'no-tr', title || page));
    hero.append(x, head);
    if (img && file) { const cr = el('a', 'dg-credit', tl2('ছবি', 'Photo')); cr.href = commonsLink(file); cr.target = '_blank'; cr.rel = 'noopener'; hero.appendChild(cr); }
    const body = el('article', 'dg-body ar-body');
    const wait = el('div', 'ar-wait');
    for (let i = 0; i < 6; i++) wait.appendChild(el('i'));
    body.appendChild(wait);
    scroller.append(hero, body);
    box.appendChild(scroller);
    document.body.appendChild(box);
    document.body.classList.add('reels-open');
    const close = () => { box.classList.add('out'); setTimeout(() => box.remove(), 280); if (!document.querySelector('.dg-sheet:not(.out):not(.ar-sheet)')) document.body.classList.remove('reels-open'); };
    x.addEventListener('click', close);
    scroller.addEventListener('scroll', () => hero.style.setProperty('--k', Math.min(1, scroller.scrollTop / 260).toFixed(3)), { passive: true });
    const W = 'https://bn.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*&redirects=1&';
    try {
      const [txt, pics] = await Promise.all([
        fetch(W + 'action=query&prop=extracts&explaintext=1&exsectionformat=wiki&titles=' + encodeURIComponent(page)).then(r => r.json()),
        fetch(W + 'action=query&generator=images&gimlimit=30&prop=imageinfo&iiprop=url|size&iiurlwidth=500&titles=' + encodeURIComponent(page)).then(r => r.json()).catch(() => ({}))
      ]);
      const text = ((txt.query && txt.query.pages[0]) || {}).extract || '';
      wait.remove();
      if (!text) throw new Error('empty');
      // == heading == lines start sections; the end matter (references, links) is left out
      let skip = false, first = true;
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        const h = /^(=+)\s*(.+?)\s*=+$/.exec(line);
        if (h) { skip = SKIP_SECTIONS.test(h[2]); if (!skip) body.appendChild(el(h[1].length <= 2 ? 'h3' : 'h4', 'ar-h no-tr', h[2])); continue; }
        if (skip) continue;
        body.appendChild(el('p', 'ar-p no-tr' + (first ? ' lead' : ''), line));
        first = false;
      }
      // the article's own pictures, without maps, flags and icons
      const gallery = ((pics.query && pics.query.pages) || []).map(p => p.imageinfo && p.imageinfo[0]).filter(i => i && i.thumburl && i.width >= 400 && !/map|locator|flag|logo|icon|symbol|emblem|seal|\.svg/i.test(i.url)).slice(0, 10);
      if (gallery.length) {
        body.appendChild(el('h3', 'ar-h', tl2('ছবি', 'Pictures')));
        const strip = el('div', 'ar-gallery');
        for (const g of gallery) { const f = el('a', 'ar-shot'); f.href = g.descriptionurl || g.url; f.target = '_blank'; f.rel = 'noopener'; photo(f, g.thumburl, '', 640); strip.appendChild(f); }
        body.appendChild(strip);
      }
    } catch {
      wait.remove();
      body.appendChild(el('p', 'ar-p', tl2('লেখাটি আনা গেল না। ইন্টারনেট সংযোগ দেখে আবার খুলুন।', 'Could not load the article. Check the connection and open it again.')));
    }
    if (place) body.appendChild(button('pin', tl2('ম্যাপে দেখুন', 'See on the map'), () => { for (const b of document.querySelectorAll('.dg-sheet')) b.remove(); document.body.classList.remove('reels-open'); goTo({ lat: place.lat, lon: place.lon, label: place.name }); }));
    const src = el('p', 'tx-source');
    src.append(document.createTextNode(tl2('লেখা: বাংলা উইকিপিডিয়া, ক্রিয়েটিভ কমন্স অ্যাট্রিবিউশন-শেয়ারঅ্যালাইক (CC BY-SA 4.0) লাইসেন্সে। ', 'Text: Bangla Wikipedia, under CC BY-SA 4.0. ')));
    const a = el('a', null, tl2('মূল নিবন্ধ ও লেখকদের তালিকা', 'The original article and its authors'));
    a.href = wikiLink(page); a.target = '_blank'; a.rel = 'noopener';
    src.appendChild(a);
    body.appendChild(src);
  }
  window.openArticle = openArticle;

  // ---- a GI product's story: its picture, the district, and what Wikipedia tells of it ----
  function openStory(p) {
    const d = districtById(p.id), story = GI_STORY[p.bn];
    const box = el('div', 'dg-sheet gi-story');
    const scroller = el('div', 'dg-scroll');
    const hero = el('header', 'dg-hero gi-hero');
    photo(hero, story && story.img, d.division, 1280, p.kind === 'f' ? 'fork' : 'bag');
    const x = el('button', 'lv-icon dg-x');
    x.innerHTML = svg('close');
    x.setAttribute('aria-label', tl2('বন্ধ করুন', 'Close'));
    const title = el('div', 'dg-title');
    const badge = el('span', 'gi-badge');
    badge.append(el('span', null, tl2(`জিআই জার্নাল নং ${num(p.no)}`, `GI journal no. ${p.no}`)));
    title.append(badge, el('h2', null, LANG === 'en' ? p.en : p.bn));
    const go = el('button', 'gi-district');
    go.append(ic('pin'), el('span', null, tl2(`${d.bn} জেলা · ${p.kind === 'f' ? 'খাবার' : 'পণ্য'}`, `${d.bn} · ${p.kind === 'f' ? 'food' : 'goods'}`)), ic('chev'));
    title.appendChild(go);
    hero.append(x, title);
    if (story && (story.src || story.file)) { const cr = el('a', 'dg-credit', tl2('ছবি', 'Photo')); cr.href = story.src || commonsLink(story.file); cr.title = story.credit || ''; cr.target = '_blank'; cr.rel = 'noopener'; hero.appendChild(cr); }
    const body = el('div', 'dg-body gi-body');
    if (story && story.imgCaption) body.appendChild(el('p', 'dg-note', story.imgCaption));
    else if (story && story.imgGeneric) body.appendChild(el('p', 'dg-note', tl2('ছবিটি এই ধরনের পণ্যের — এই জেলারই তোলা নয়।', 'The photo shows this kind of product, not one from this district.')));
    if (story && story.text) {
      // general only if the text does not speak of this place either (কাঁচাগোল্লা's article is about Natore's)
      const stem = p.bn.split(' ')[0].replace(/(র|ের|এর)$/, '');
      const general = story.general && !story.text.includes(d.bn) && !story.text.includes(stem);
      if (general) body.appendChild(el('p', 'dg-note gi-general', tl2(`এই জেলার পণ্যটি নিয়ে উইকিপিডিয়ায় আলাদা নিবন্ধ নেই — নিচে «${story.page}» নিয়ে যা লেখা আছে।`, `Wikipedia has no article on this district's product itself — below is what it says about «${story.page}».`)));
      for (const para of story.text.split('\n').filter(Boolean)) body.appendChild(el('p', 'gi-text no-tr', para));
      const more = el('button', 'dg-wiki', tl2('পুরোটা পড়ুন', 'Read it all'));
      more.addEventListener('click', () => openArticle(story.page, { title: LANG === 'en' ? p.en : p.bn, img: story.img, file: story.file, sub: tl2(`${d.bn} জেলা`, d.bn) }));
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
    const photoBy = story && story.credit ? story.credit : tl2('উইকিমিডিয়া কমন্স', 'Wikimedia Commons');
    body.appendChild(el('p', 'tx-source', tl2(`লেখা: বাংলা উইকিপিডিয়া (CC BY-SA) · ছবি: ${photoBy} · ` + GI_SOURCE.bn, `Text: Bangla Wikipedia (CC BY-SA) · Photo: ${photoBy} · ` + GI_SOURCE.en)));
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

  // ---- one place, full screen: its photos (Wikimedia and people's own), what it is, how far, how to go, reviews ----
  const placeKeyOf = (d, s) => `${d.id}|${s.gemId ? 'gem:' + s.gemId : s.page || s.name}`;
  const wanted = () => { try { return new Set(JSON.parse(localStorage.getItem('bdmap.want') || '[]')); } catch { return new Set(); } };
  const setWanted = set => { try { localStorage.setItem('bdmap.want', JSON.stringify([...set])); } catch { /* storage off */ } };
  async function placesGet(path) { const r = await fetch('api/places/' + path, { credentials: 'same-origin' }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }
  async function placesPost(path, body) {
    const r = await fetch('api/places/' + path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || 'server'), { status: r.status });
    return data;
  }
  function flash(text) {
    const t = el('div', 'pl-toast', text);
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, 2600);
  }
  // A phone photo, made at most 2000 px on its long side before it is sent (a 12 MP original is 4–8 MB).
  function shrink(file) {
    return new Promise(resolve => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        if (k === 1 && file.size < 2.5e6) { URL.revokeObjectURL(url); resolve(file); return; }
        const c = Object.assign(el('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) });
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => resolve(b || file), 'image/jpeg', 0.86);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
  const starRow = (v, size = 16) => {
    const s = el('span', 'pl-stars');
    s.style.setProperty('--v', String(Math.max(0, Math.min(5, v)) / 5));
    s.style.fontSize = size + 'px';
    s.setAttribute('aria-label', tl2(`৫-এর মধ্যে ${num(v, 1)}`, `${v} out of 5`));
    return s;
  };
  const kmText = km => km < 1 ? tl2(`${num(Math.round(km * 1000))} মিটার`, `${Math.round(km * 1000)} m`) : tl2(`${num(km, km < 10 ? 1 : 0)} কিমি`, `${km.toFixed(km < 10 ? 1 : 0)} km`);

  // ---- "যাব একদিন" (someday): kept on this phone, and with the account when signed in (merged on sign-in) ----
  async function syncWants() {
    if (!ME) { renderWants(); return; }
    try { const { keys } = await placesPost('wants-merge', { keys: [...wanted()] }); setWanted(new Set(keys)); } catch { /* offline: the phone's list stays */ }
    renderWants();
  }
  function toggleWant(key, on) {
    const set = wanted();
    if (on) set.add(key); else set.delete(key);
    setWanted(set);
    if (ME) placesPost('want', { key, on }).catch(() => {});
    renderWants();
  }
  document.addEventListener('bdmap:auth', syncWants);
  // The saved places, as a rail on the guide's front page (gems are found among the loaded ones).
  let gemsAll = [];
  function placeFromKey(key) {
    const [id, rest] = [key.slice(0, key.indexOf('|')), key.slice(key.indexOf('|') + 1)];
    const d = districtById(id);
    if (!d || !GUIDE) return null;
    if (rest.startsWith('gem:')) { const g = gemsAll.find(x => String(x.id) === rest.slice(4)); return g ? { d, s: gemSight(g) } : null; }
    const s = ((GUIDE[id] || {}).sights || []).find(x => (x.page || x.name) === rest);
    return s ? { d, s } : null;
  }
  function renderWants() {
    const sec = $('dg-want-sec'), rail = $('dg-want');
    if (!sec || !GUIDE) return;
    const items = [...wanted()].map(placeFromKey).filter(Boolean);
    sec.hidden = !items.length;
    $('dg-want-n').textContent = tl2(`${num(items.length)}টি জায়গা${ME ? ' · অ্যাকাউন্টে সেভ করা' : ' · লগইন করলে সব ফোনে থাকবে'}`, `${items.length} places${ME ? ' · saved to your account' : ' · sign in to keep them on every device'}`);
    rail.replaceChildren(...items.map(({ d, s }) => {
      const c = el('button', 'dg-place');
      const ph = el('span', 'ph');
      photo(ph, s.img, d.division, 500, kindArt(s.name) || 'pin');
      const t = el('span', 't');
      t.append(el('b', 'no-tr', s.name), el('small', null, d.bn));
      c.append(ph, t);
      c.addEventListener('click', () => openPlace(d, s));
      return c;
    }));
  }

  // ---- মেঠোপথ: places people know that the guide does not; each is checked by an admin first ----
  const GEM_KINDS = [['water', 'ঝর্ণা', 'Waterfall'], ['river', 'নদী / সৈকত / লেক', 'River, beach or lake'], ['hill', 'পাহাড় / বন', 'Hills or forest'], ['heritage', 'ঐতিহাসিক স্থাপনা', 'Heritage'],
    ['faith', 'ধর্মীয় স্থান', 'Place of worship'], ['wetland', 'হাওর / বিল', 'Haor or wetland'], ['village', 'গ্রাম ও গ্রামীণ জীবন', 'Village life'], ['other', 'অন্যান্য', 'Other']];
  const kindName = k => { const x = GEM_KINDS.find(g => g[0] === k); return x ? tl2(x[1], x[2]) : ''; };
  const GEM_ART = { water: 'ঝর্ণা', river: 'দিঘি', hill: 'বন', heritage: 'জমিদার', faith: 'মসজিদ', wetland: 'বিল', village: 'বাড়ি', other: '' };
  // a gem, in the shape the place page reads
  const gemSight = g => ({ name: g.name, text: g.about, img: g.photos[0] || '', lat: g.lat, lon: g.lon, page: null, gemId: g.id, gemPhotos: g.photos.slice(1), gemBy: g.by, gemHow: g.how, gemWhere: g.place, gemKind: g.kind, artName: GEM_ART[g.kind] || '' });
  function gemCard(g) {
    const d = districtById(g.district);
    const c = el('button', 'dg-place gm-card');
    const ph = el('span', 'ph');
    photo(ph, g.photos[0], d.division, 500, kindArt(GEM_ART[g.kind] || g.name) || 'pin');
    ph.appendChild(el('span', 'gm-badge', tl2('🌿 মেঠোপথ', '🌿 Methopath')));
    const t = el('span', 't');
    t.append(el('b', 'no-tr', g.name), el('small', null, `${d.bn}${g.place ? ' · ' + g.place : ''}`));
    c.append(ph, t);
    c.addEventListener('click', () => openPlace(d, gemSight(g)));
    return c;
  }
  async function renderGems() {
    try { gemsAll = (await placesGet('gems')).gems; } catch { gemsAll = []; }
    const rail = $('dg-gems');
    if (!rail) return;
    const add = el('button', 'dg-place gm-add');
    add.append(Object.assign(el('span', 'ph'), { innerHTML: '<span class="gm-plus">+</span>' }), Object.assign(el('span', 't'), { innerHTML: '' }));
    add.querySelector('.t').append(el('b', null, tl2('জায়গার খোঁজ দিন', 'Share a place')), el('small', null, tl2('অনুমোদন হলে ৫ পয়েন্ট', '5 points once approved')));
    add.addEventListener('click', () => openGemForm());
    rail.replaceChildren(add, ...gemsAll.map(gemCard));
    $('dg-gem-n').textContent = gemsAll.length ? tl2(`স্থানীয়দের চেনা ${num(gemsAll.length)}টি জায়গা — আমাদের টিম দেখে নিয়েছে`, `${gemsAll.length} places sent by locals, checked by our team`)
      : tl2('আপনার গ্রাম বা উপজেলার কোনো জায়গা, যা গাইডবইয়ে নেই অথচ দেখার মতো? মেঠোপথে যোগ করুন — দেখে নিয়ে আপনার নামে প্রকাশ করব।', 'A place near you that no guidebook lists but everyone should see? Add it to Methopath — once checked it goes up under your name.');
    renderWants();
  }

  function openGemForm(d0) {
    if (!ME) { openLogin(); return; }
    const box = el('div', 'gm-sheet');
    const card = el('div', 'gm-form');
    const close = () => { box.classList.add('out'); setTimeout(() => box.remove(), 260); };
    box.addEventListener('click', e => { if (e.target === box) close(); });
    const x = el('button', 'lv-icon gm-x'); x.innerHTML = svg('close'); x.addEventListener('click', close);
    const field = (label, input, hint) => { const f = el('label', 'gm-field'); f.append(el('span', null, label), input); if (hint) f.appendChild(el('small', null, hint)); return f; };
    const district = el('select');
    for (const div of [...new Set(DISTRICTS.map(d => d.division))]) {
      const og = document.createElement('optgroup'); og.label = tl2(`${div} বিভাগ`, div);
      for (const d of DISTRICTS.filter(d => d.division === div)) og.appendChild(new Option(d.bn, d.id));
      district.appendChild(og);
    }
    if (d0) district.value = d0.id;
    const name = Object.assign(el('input'), { maxLength: 80, placeholder: tl2('যেমন: চারান বিল', 'e.g. Charan Bil') });
    const kind = el('select'); for (const [k, bn, en] of GEM_KINDS) kind.appendChild(new Option(tl2(bn, en), k));
    const where = Object.assign(el('input'), { maxLength: 160, placeholder: tl2('উপজেলা, ইউনিয়ন বা গ্রাম — যেমন: কালিহাতী', 'Upazila, union or village') });
    const about = Object.assign(el('textarea'), { rows: 4, maxLength: 2000, placeholder: tl2('জায়গাটি কেমন, কেন সুন্দর, কখন গেলে ভালো — নিজের ভাষায় লিখুন (অন্তত ২০ অক্ষর)', 'What it is like, why it is special, the best time to go (at least 20 characters)') });
    const how = Object.assign(el('textarea'), { rows: 2, maxLength: 1000, placeholder: tl2('নিকটস্থ বাসস্ট্যান্ড থেকে কীভাবে যাবেন, ভাড়া কত', 'How to get there from the nearest bus stand, and the fare') });
    let pos = null;
    const locate = el('button', 'btn quiet gm-locate'); locate.type = 'button'; locate.append(ic('pin'), el('span', null, tl2('আমি এখন এখানে — অবস্থান দিন', 'I am here — add my location')));
    locate.addEventListener('click', () => {
      if (!navigator.geolocation) return;
      locate.querySelector('span').textContent = tl2('অবস্থান নেওয়া হচ্ছে…', 'Getting your location…');
      navigator.geolocation.getCurrentPosition(p => { pos = { lat: p.coords.latitude, lon: p.coords.longitude }; locate.classList.add('on'); locate.querySelector('span').textContent = tl2('অবস্থান যোগ হয়েছে ✓', 'Location added ✓'); },
        () => { locate.querySelector('span').textContent = tl2('অবস্থান পাওয়া যায়নি — ঐচ্ছিক, বাদ দিতে পারেন', 'No location — it is optional'); }, { enableHighAccuracy: true, timeout: 12000 });
    });
    const files = [];
    const shots = el('div', 'gm-shots');
    const chooser = Object.assign(el('input'), { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true });
    const drawShots = () => {
      shots.replaceChildren(...files.map((f, i) => { const b = el('button', 'gm-shot'); b.type = 'button'; b.style.backgroundImage = `url(${URL.createObjectURL(f)})`; b.innerHTML = svg('close'); b.addEventListener('click', () => { files.splice(i, 1); drawShots(); }); return b; }));
      if (files.length < 3) { const a = el('button', 'gm-shot add'); a.type = 'button'; a.innerHTML = svg('camera'); a.addEventListener('click', () => chooser.click()); shots.appendChild(a); }
    };
    chooser.addEventListener('change', () => { files.push(...[...chooser.files].slice(0, 3 - files.length)); chooser.value = ''; drawShots(); });
    drawShots();
    const note = el('p', 'pl-givenote');
    const send = el('button', 'btn gm-send', tl2('পাঠান', 'Send'));
    send.addEventListener('click', async () => {
      if (name.value.trim().length < 2 || about.value.trim().length < 20) { note.className = 'pl-givenote bad'; note.textContent = tl2('জায়গার নাম আর অন্তত ২০ অক্ষরের বর্ণনা দিন।', 'Give the name and at least 20 characters about it.'); return; }
      send.disabled = true;
      try {
        const media = [];
        for (const [i, f] of files.entries()) { note.className = 'pl-givenote'; note.textContent = tl2(`ছবি ${num(i + 1)}/${num(files.length)} পাঠানো হচ্ছে…`, `Sending photo ${i + 1}/${files.length}…`); const b = await shrink(f); media.push(await uploadMedia(b, b.type || 'image/jpeg', () => {})); }
        await placesPost('gem', { district: district.value, name: name.value, kind: kind.value, where: where.value, about: about.value, how: how.value, lat: pos && pos.lat, lon: pos && pos.lon, media });
        card.replaceChildren(x, Object.assign(el('div', 'gm-done'), { innerHTML: '<b>🌿</b>' }), el('h3', null, tl2('ধন্যবাদ!', 'Thank you!')),
          el('p', null, tl2('আমাদের টিম জায়গাটি যাচাই করে প্রকাশ করবে — তখন আপনার নামসহ সবাই দেখবে, আর আপনি পাবেন ৫ পয়েন্ট।', 'Our team will check it and publish it with your name — and you earn 5 points.')));
      } catch (e) {
        send.disabled = false; note.className = 'pl-givenote bad';
        note.textContent = e.message === 'slow' ? tl2('আজ অনেকগুলো পাঠিয়েছেন — কাল আবার চেষ্টা করুন।', 'You sent many today; try tomorrow.') : tl2('পাঠানো গেল না। ইন্টারনেট দেখে আবার চেষ্টা করুন।', 'Could not send; try again.');
      }
    });
    card.append(x, el('h3', null, tl2('মেঠোপথে নতুন জায়গা দিন', 'Add a place to Methopath')), el('p', 'gm-lead', tl2('যে জায়গার পথ আপনি চেনেন, অন্যরা চেনে না — তার কথা লিখুন। দেখে নিয়ে আপনার নামে প্রকাশ করা হবে।', 'A place whose way you know and others do not — tell us about it. Once checked it goes up under your name.')),
      field(tl2('জেলা', 'District'), district), field(tl2('জায়গার নাম', 'Name of the place'), name), field(tl2('ধরন', 'Kind'), kind), field(tl2('কোথায়', 'Where'), where),
      field(tl2('জায়গাটির কথা', 'About it'), about), field(tl2('যাবেন কীভাবে', 'How to get there'), how, tl2('ঐচ্ছিক', 'optional')),
      el('span', 'gm-label', tl2('ছবি (৩টি পর্যন্ত, নিজের তোলা)', 'Photos (up to 3, your own)')), shots, chooser, locate, note, send);
    box.appendChild(card);
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('in'));
    name.focus();
  }
  window.openGemForm = openGemForm;

  // ---- মেঠোপথ, full screen: what locals share — places, everyone's photos, and the people who share most ----
  async function openMethopath(tab = 'places') {
    const box = el('div', 'dg-sheet mtp-sheet');
    const scroller = el('div', 'dg-scroll');
    const close = () => { box.classList.add('out'); setTimeout(() => box.remove(), 280); if (!document.querySelector('.dg-sheet:not(.out):not(.mp-sheet)')) document.body.classList.remove('reels-open'); };
    const hero = el('header', 'mtp-hero');
    hero.innerHTML = `<svg class="mtp-path" viewBox="0 0 400 220" preserveAspectRatio="none" aria-hidden="true"><path d="M-20 200 C 80 170, 60 120, 150 110 S 260 60, 300 70 S 380 30, 430 10" /><path d="M-20 214 C 90 186, 70 134, 160 124 S 270 74, 310 84 S 390 44, 440 24" /></svg>`;
    const x = el('button', 'lv-icon dg-x'); x.innerHTML = svg('close'); x.setAttribute('aria-label', tl2('বন্ধ করুন', 'Close')); x.addEventListener('click', close);
    const head = el('div', 'mtp-head');
    const stats = el('div', 'mtp-stats');
    head.append(el('span', 'mtp-kicker', tl2('🌿 মেঠোপথ', '🌿 Methopath')), el('h2', null, tl2('চেনা পথের বাইরের বাংলা', 'Bangladesh off the beaten path')),
      el('p', null, tl2('স্থানীয়রা যেসব জায়গা চেনেন, আর ঘুরতে গিয়ে সবার তোলা ছবি — এক জায়গায়। আপনিও শেয়ার করুন; দেখে নিয়ে আপনার নামে প্রকাশ করা হয়।', 'Places locals know and photos everyone took on their trips — in one place. Share yours; once checked it goes up under your name.')), stats);
    const ctas = el('div', 'mtp-ctas');
    const sharePlace = el('button', 'mtp-cta main'); sharePlace.append(Object.assign(el('i'), { innerHTML: svg('pin') }), el('b', null, tl2('জায়গা শেয়ার করুন', 'Share a place')), el('small', null, tl2('অনুমোদন হলে ৫ পয়েন্ট', '5 points when approved')));
    const sharePhoto = el('button', 'mtp-cta'); sharePhoto.append(Object.assign(el('i'), { innerHTML: svg('camera') }), el('b', null, tl2('ছবি শেয়ার করুন', 'Share a photo')), el('small', null, tl2('প্রতিটি ছবিতে ৩ পয়েন্ট', '3 points each')));
    sharePlace.addEventListener('click', () => openGemForm());
    sharePhoto.addEventListener('click', () => pickPlaceForPhoto());
    ctas.append(sharePlace, sharePhoto);
    head.appendChild(ctas);
    hero.append(x, head);
    const body = el('div', 'mtp-body');
    const tabs = el('div', 'mtp-tabs');
    const pane = el('div', 'mtp-pane');
    const TABS = [['places', tl2('জায়গা', 'Places')], ['photos', tl2('সবার ছবি', 'Photos')], ['people', tl2('সেরা অবদানকারী', 'Top sharers')]];
    for (const [k, label] of TABS) { const b = el('button', null, label); b.dataset.k = k; b.addEventListener('click', () => show(k)); tabs.appendChild(b); }
    body.append(tabs, pane);
    scroller.append(hero, body);
    box.appendChild(scroller);
    document.body.appendChild(box);
    document.body.classList.add('reels-open');
    let feed = { photos: [], top: [], counts: { photos: 0, gems: 0, people: 0 } }, kind = '';
    try { [feed] = await Promise.all([placesGet('feed'), gemsAll.length ? null : renderGems()]); } catch { /* offline: empty states */ }
    stats.replaceChildren(...[[feed.counts.gems || gemsAll.length, tl2('জায়গা', 'places')], [feed.counts.photos, tl2('ছবি', 'photos')], [feed.counts.people, tl2('অবদানকারী', 'sharers')]]
      .map(([n, l]) => { const s = el('span'); s.append(el('b', null, num(n || 0)), document.createTextNode(' ' + l)); return s; }));
    const emptyNote = (title, sub, cta) => { const e = el('div', 'mtp-empty'); e.append(el('span', 'ic', '🌿'), el('b', null, title), el('p', null, sub)); if (cta) e.appendChild(cta); return e; };
    function show(k) {
      for (const b of tabs.children) b.classList.toggle('on', b.dataset.k === k);
      pane.replaceChildren();
      if (k === 'places') {
        const chips = el('div', 'mtp-chips');
        for (const [key, bn, en] of [['', 'সব', 'All'], ...GEM_KINDS]) { const c = el('button', 'trip-chip' + (kind === key ? ' on' : ''), tl2(bn, en)); c.addEventListener('click', () => { kind = key; show('places'); }); chips.appendChild(c); }
        pane.appendChild(chips);
        const list = gemsAll.filter(g => !kind || g.kind === kind);
        if (!list.length) { const b = el('button', 'btn', tl2('প্রথম জায়গাটি আপনিই দিন', 'Share the first one')); b.addEventListener('click', () => openGemForm()); pane.appendChild(emptyNote(tl2('এখনো কেউ এমন জায়গা দেননি', 'Nothing here yet'), tl2('আপনার এলাকার যে জায়গাটি সবার দেখা উচিত — সেটি দিয়েই শুরু হোক।', 'Start with the place near you that everyone should see.'), b)); return; }
        const grid = el('div', 'mtp-grid');
        for (const g of list) grid.appendChild(gemCard(g));
        pane.appendChild(grid);
      } else if (k === 'photos') {
        if (!feed.photos.length) { const b = el('button', 'btn', tl2('ছবি শেয়ার করুন', 'Share a photo')); b.addEventListener('click', () => pickPlaceForPhoto()); pane.appendChild(emptyNote(tl2('সবার তোলা ছবি এখানে দেখা যাবে', 'Everyone’s photos will show here'), tl2('যেকোনো জায়গার নিজের তোলা ছবি পাঠান — অনুমোদন হলে এখানে আর জায়গার পাতায় দেখা যাবে।', 'Send a photo you took of any place — once approved it shows here and on the place.'), b)); return; }
        const wall = el('div', 'mtp-wall');
        for (const p of feed.photos) {
          const d = districtById(p.district), c = el('button', 'mtp-shot');
          const im = Object.assign(el('img'), { src: p.src, alt: p.name, loading: 'lazy', decoding: 'async' });
          im.addEventListener('load', () => im.classList.add('in'));
          const cap = el('span', 'cap'); cap.append(el('b', 'no-tr', p.name), el('small', null, `${d ? d.bn : ''} · ${p.by.name}`));
          c.append(im, cap);
          c.addEventListener('click', () => { const f = placeFromKey(p.key); if (f) openPlace(f.d, f.s); });
          wall.appendChild(c);
        }
        pane.appendChild(wall);
      } else {
        if (!feed.top.length) { pane.appendChild(emptyNote(tl2('প্রথম অবদানকারী হোন', 'Be the first sharer'), tl2('যারা জায়গা আর ছবি শেয়ার করেন, তাদের নাম এখানে থাকবে।', 'People who share places and photos are listed here.'))); return; }
        const list = el('ol', 'mtp-people');
        feed.top.forEach((u, i) => {
          const li = el('li');
          const av = el('span', 'pl-av'); if (u.pic) av.style.backgroundImage = `url(api/avatar/${u.id}?v=${u.pic})`; else av.textContent = [...(u.name || '?')][0];
          li.append(el('span', 'rank', i < 3 ? ['🥇', '🥈', '🥉'][i] : num(i + 1)), av, el('b', null, u.name), el('small', null, tl2(`${num(u.photos)} ছবি · ${num(u.gems)} জায়গা`, `${u.photos} photos · ${u.gems} places`)));
          list.appendChild(li);
        });
        pane.appendChild(list);
      }
    }
    show(tab);
  }
  window.openMethopath = openMethopath;
  // "share a photo": choose the district and the place, then the place's own photo flow opens
  function pickPlaceForPhoto() {
    if (!ME) { openLogin(); return; }
    const box = el('div', 'gm-sheet'), card = el('div', 'gm-form');
    const close = () => { box.classList.add('out'); setTimeout(() => box.remove(), 260); };
    box.addEventListener('click', e => { if (e.target === box) close(); });
    const x = el('button', 'lv-icon gm-x'); x.innerHTML = svg('close'); x.addEventListener('click', close);
    const dSel = el('select'), pSel = el('select');
    for (const div of [...new Set(DISTRICTS.map(d => d.division))]) { const og = document.createElement('optgroup'); og.label = tl2(`${div} বিভাগ`, div); for (const d of DISTRICTS.filter(d => d.division === div)) og.appendChild(new Option(d.bn, d.id)); dSel.appendChild(og); }
    const fill = () => { pSel.replaceChildren(...(((GUIDE || {})[dSel.value] || {}).sights || []).map((s, i) => new Option(s.name, String(i)))); };
    dSel.addEventListener('change', fill); fill();
    const go = el('button', 'btn gm-send', tl2('এগোন — ছবি বেছে নিন', 'Next — choose photos'));
    go.addEventListener('click', async () => {
      const d = districtById(dSel.value), s = ((GUIDE[d.id] || {}).sights || [])[Number(pSel.value)];
      if (!s) return;
      close();
      await openPlace(d, s);
      document.querySelector('.pl-sheet:last-of-type .pl-give')?.click();
    });
    const f1 = el('label', 'gm-field'), f2 = el('label', 'gm-field');
    f1.append(el('span', null, tl2('জেলা', 'District')), dSel); f2.append(el('span', null, tl2('জায়গা', 'Place')), pSel);
    card.append(x, el('h3', null, tl2('কোন জায়গার ছবি?', 'A photo of which place?')), el('p', 'gm-lead', tl2('জায়গাটি বেছে নিন, তারপর নিজের তোলা ছবি পাঠান — অনুমোদন হলে প্রতিটিতে ৩ পয়েন্ট।', 'Pick the place, then send photos you took — 3 points for each one approved.')), f1, f2, go);
    box.appendChild(card);
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('in'));
  }


  async function openPlace(d, s) {
    await loadGuide();
    const g = GUIDE[d.id] || {}, key = placeKeyOf(d, s), dhaka = districtById('dhaka');
    const box = el('div', 'dg-sheet pl-sheet');
    const scroller = el('div', 'dg-scroll');
    const close = () => { box.classList.add('out'); setTimeout(() => box.remove(), 280); if (!document.querySelector('.dg-sheet:not(.out):not(.pl-sheet)')) document.body.classList.remove('reels-open'); };
    // gallery
    const hero = el('header', 'pl-hero');
    const gal = el('div', 'pl-gal'), count = el('span', 'pl-count'), dots = el('div', 'pl-dots');
    const slides = [];
    const addSlide = (src, credit, href) => {
      const f = el('figure', 'pl-slide');
      photo(f, src, d.division, 1280, kindArt(s.name) || 'pin');
      if (credit) { const c = el(href ? 'a' : 'span', 'pl-credit', credit); if (href) { c.href = href; c.target = '_blank'; c.rel = 'noopener'; } f.appendChild(c); }
      gal.appendChild(f); slides.push(f);
      dots.appendChild(el('i'));
      paintCount();
    };
    const paintCount = () => {
      const i = Math.round(gal.scrollLeft / Math.max(1, gal.clientWidth));
      count.textContent = slides.length > 1 ? `${num(i + 1)} / ${num(slides.length)}` : '';
      [...dots.children].forEach((x, k) => x.classList.toggle('on', k === i));
      dots.hidden = slides.length < 2;
    };
    gal.addEventListener('scroll', paintCount, { passive: true });
    if (s.img && s.gemId) addSlide(s.img, tl2(`ছবি: ${s.gemBy.name}`, `Photo: ${s.gemBy.name}`), '');
    for (const src of s.gemPhotos || []) addSlide(src, tl2(`ছবি: ${s.gemBy.name}`, `Photo: ${s.gemBy.name}`), '');
    const by = (who, lic) => who ? tl2(`ছবি: ${who}${lic ? ' · ' + lic : ''}`, `Photo: ${who}${lic ? ' · ' + lic : ''}`) : tl2('ছবি: উইকিমিডিয়া কমন্স', 'Photo: Wikimedia Commons');
    if (s.img && !s.gemId) addSlide(s.img, s.imgCaption ? tl2(`ছবি: ${s.imgCaption}`, `Photo: ${s.imgCaption}`) : by(s.imgBy, s.imgLic), s.file ? commonsLink(s.file) : '');
    for (const g of s.gallery || []) addSlide(g.img, by(g.by, g.lic), commonsLink(g.file));
    const empty = el('div', 'pl-empty');
    if (!s.img) {
      empty.append(Object.assign(el('span', 'ph-art'), { innerHTML: `<svg viewBox="0 0 24 24" aria-hidden="true">${kindArt(s.artName || s.name) || ''}</svg>` }));
      hero.classList.add('bare');
    }
    const x = el('button', 'lv-icon dg-x'); x.innerHTML = svg('close'); x.setAttribute('aria-label', tl2('বন্ধ করুন', 'Close'));
    const give = el('button', 'pl-give'); give.append(ic('camera'), el('span', null, tl2('ছবি দিন', 'Add a photo')));
    const arrows = ['prev', 'next'].map((k, i) => { const b = el('button', 'pl-arrow ' + k); b.innerHTML = svg(i ? 'next' : 'prev'); b.setAttribute('aria-label', i ? tl2('পরের ছবি', 'Next photo') : tl2('আগের ছবি', 'Previous photo')); b.addEventListener('click', () => gal.scrollBy({ left: (i ? 1 : -1) * gal.clientWidth, behavior: 'smooth' })); return b; });
    hero.append(gal, empty, x, give, count, dots, ...arrows);

    const body = el('div', 'pl-body');
    // title
    const head = el('div', 'pl-head');
    head.appendChild(el('small', null, tl2(`${s.gemWhere ? s.gemWhere + ', ' : ''}${d.bn} জেলা · ${d.division} বিভাগ`, `${s.gemWhere ? s.gemWhere + ', ' : ''}${d.bn} · ${d.division} division`)));
    head.appendChild(el('h2', 'no-tr', s.name));
    const badges = el('div', 'pl-badges');
    const rank = (g.sights || []).filter(t => (t.views || 0) > (s.views || 0)).length;
    if (s.gemId) badges.append(el('span', 'pl-badge gem', tl2('🌿 মেঠোপথ', '🌿 Methopath')), el('span', 'pl-badge calm', kindName(s.gemKind)), el('span', 'pl-badge by', tl2(`${s.gemBy.name} জানিয়েছেন`, `shared by ${s.gemBy.name}`)));
    if (s.views) badges.appendChild(el('span', 'pl-badge ' + (rank < 3 ? 'hot' : 'calm'), rank < 3 ? tl2('সবার প্রিয়', 'Loved by many') : tl2('নিরিবিলি', 'Quiet find')));
    const rating = el('span', 'pl-badge rate'); rating.hidden = true;
    badges.appendChild(rating);
    head.appendChild(badges);
    // actions
    const acts = el('div', 'pl-acts');
    const want = el('button', 'pl-act want');
    const paintWant = () => { const on = wanted().has(key); want.classList.toggle('on', on); want.replaceChildren(ic(on ? 'check' : 'plus'), el('span', null, on ? tl2('যাব একদিন ✓', 'Saved') : tl2('যাব একদিন', 'Someday'))); };
    want.addEventListener('click', () => { const on = !wanted().has(key); toggleWant(key, on); if (on) flash(ME ? tl2('“যাব একদিন” তালিকায় রাখা হলো — সব ডিভাইসে থাকবে', 'Saved — on all your devices') : tl2('“যাব একদিন” তালিকায় রাখা হলো', 'Saved to “want to go”')); paintWant(); });
    paintWant();
    acts.appendChild(want);
    const leave = fn => () => { for (const b of document.querySelectorAll('.dg-sheet')) b.remove(); document.body.classList.remove('reels-open'); fn(); };
    if (s.lat != null) {
      const m = el('button', 'pl-act'); m.append(ic('pin'), el('span', null, tl2('ম্যাপে', 'Map'))); m.addEventListener('click', leave(() => goTo({ lat: s.lat, lon: s.lon, label: s.name })));
      const r = el('button', 'pl-act'); r.append(ic('route'), el('span', null, tl2('রুট', 'Route'))); r.addEventListener('click', leave(() => setPlace('to', { lat: s.lat, lon: s.lon, label: s.name })));
      acts.append(m, r);
    }
    const sh = el('button', 'pl-act'); sh.append(ic('send'), el('span', null, tl2('শেয়ার', 'Share')));
    sh.addEventListener('click', async () => {
      const text = `${s.name}, ${d.bn} — BD Map`, url = location.origin + '/#/districts';
      try { if (navigator.share) await navigator.share({ title: s.name, text, url }); else { await navigator.clipboard.writeText(`${text}\n${url}`); flash(tl2('লিংক কপি হয়েছে', 'Link copied')); } } catch { /* cancelled */ }
    });
    acts.appendChild(sh);
    body.append(head, acts);

    // at a glance — only what we know
    const glance = el('div', 'pl-glance');
    const fact = (icon, label, value, sub) => { const f = el('div', 'pl-fact'); f.append(Object.assign(el('i'), { innerHTML: svg(icon) }), el('small', null, label), el('b', null, value)); if (sub) f.appendChild(el('span', null, sub)); glance.appendChild(f); };
    if (s.lat != null) fact('pin', tl2('জেলা শহর থেকে', 'From the town'), kmText(haversineKm(d, s)), tl2('সোজা দূরত্ব', 'as the crow flies'));
    if (d !== dhaka) {
      const official = officialFare(dhaka, d);
      fact('bus', tl2('ঢাকা থেকে', 'From Dhaka'), official ? tl2(`${num(official.km)} কিমি`, `${official.km} km`) : kmText(haversineKm(dhaka, s.lat != null ? s : d) * 1.25), official ? tl2(`বাসে ${taka(official.f51)} থেকে`, `bus from ${taka(official.f51)}`) : tl2('সড়কপথে আনুমানিক', 'by road, roughly'));
    }
    if (s.views) fact('eye', tl2('উইকিপিডিয়ায় পড়া', 'Read on Wikipedia'), tl2(`${num(s.views)} বার`, `${s.views} times`), tl2('গত ৬০ দিনে', 'last 60 days'));
    if (glance.children.length) body.appendChild(glance);

    // at a glance, from the article's infobox: built, architect, style, address ...
    if (s.facts && s.facts.length) {
      const t = el('section', 'pl-card pl-facts');
      t.appendChild(el('h3', null, tl2('এক নজরে', 'At a glance')));
      const dl = el('dl');
      for (const [k, v] of s.facts) dl.append(el('dt', null, k), el('dd', 'no-tr', v));
      t.append(dl, el('p', 'pl-muted pl-src', tl2('তথ্য: বাংলা উইকিপিডিয়ার নিবন্ধ', 'From the Bangla Wikipedia article')));
      body.appendChild(t);
    }
    // about
    if (s.text) {
      const about = el('section', 'pl-card');
      about.append(el('h3', null, tl2('জায়গাটির কথা', 'About')), Object.assign(el('p', 'no-tr', s.text), s.textLang === 'en' ? { lang: 'en' } : {}));
      if (s.textLang === 'en') { const a = el('a', 'pl-link', tl2('বাংলা উইকিপিডিয়ায় এখনো নিবন্ধ নেই — ইংরেজি উইকিপিডিয়ায় পুরোটা পড়ুন ↗', 'Read it all on English Wikipedia ↗')); a.href = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(s.enPage.replace(/ /g, '_')); a.target = '_blank'; a.rel = 'noopener'; about.appendChild(a); }
      if (s.page) { const more = el('button', 'pl-link', tl2('পুরো লেখা পড়ুন →', 'Read it all →')); more.addEventListener('click', () => openArticle(s.page, { title: s.name, img: s.img, file: s.file, sub: d.bn, place: s.lat != null ? s : null })); about.appendChild(more); }
      body.appendChild(about);
    }

    // nearby: the district's other places, nearest first when both have a pin
    const others = (g.sights || []).filter(t => t !== s).map(t => ({ t, km: s.lat != null && t.lat != null ? haversineKm(s, t) : null }))
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || (b.t.views || 0) - (a.t.views || 0)).slice(0, 8);
    if (others.length) {
      body.appendChild(el('h3', 'pl-h', tl2('আশেপাশে আরও', 'Around here')));
      const rail = el('div', 'pl-rail');
      for (const { t, km } of others) {
        const c = el('button', 'pl-mini');
        const ph = el('span', 'ph');
        photo(ph, t.img, d.division, 400, kindArt(t.name) || 'pin');
        c.append(ph, el('b', 'no-tr', t.name), el('small', null, km != null ? kmText(km) : tl2(`${d.bn} জেলায়`, `in ${d.bn}`)));
        c.addEventListener('click', () => { box.remove(); openPlace(d, t); });
        rail.appendChild(c);
      }
      body.appendChild(rail);
    }

    // getting there
    if (d !== dhaka) {
      const go = el('section', 'pl-card');
      go.appendChild(el('h3', null, tl2('কীভাবে যাবেন', 'Getting there')));
      const official = officialFare(dhaka, d), f = MARKET_FARES[d.id];
      const lines = [];
      if (official) lines.push(tl2(`ঢাকার ${official.terminal} থেকে ${d.bn}: নন-এসি বাসে বিআরটিএ নির্ধারিত ভাড়া ${taka(official.f51)}, দূরত্ব ${num(official.km)} কিমি।`, `From ${official.terminal}, Dhaka: BRTA non-AC fare ${taka(official.f51)}, ${official.km} km.`));
      if (f) lines.push(tl2(`কাউন্টারে সাধারণত ${fareRange(f[0], f[1])}${f.length > 2 ? `, এসি ${fareRange(f[2], f[3])}` : ''}।`, `At the counter usually ${fareRange(f[0], f[1])}${f.length > 2 ? `, AC ${fareRange(f[2], f[3])}` : ''}.`));
      const ops = [...new Set([...operatorsBetween(dhaka, d).map(o => o.bn), ...(DIVISION_OPERATORS[d.division] || [])])].slice(0, 6);
      if (ops.length) lines.push(tl2(`যেসব বাস চলে: ${ops.join(', ')}।`, `Buses: ${ops.join(', ')}.`));
      if (s.gemHow) lines.unshift(tl2(`যারা জানিয়েছেন তাদের কথায়: ${s.gemHow}`, `In the sender's words: ${s.gemHow}`));
      if (s.lat != null) lines.push(tl2(`জেলা শহর থেকে জায়গাটি প্রায় ${kmText(haversineKm(d, s))} দূরে — স্থানীয় সিএনজি বা অটোতে যাওয়া যায়।`, `The place is about ${kmText(haversineKm(d, s))} from the district town — a CNG or auto-rickshaw goes there.`));
      for (const l of lines) go.appendChild(el('p', null, l));
      body.appendChild(go);
    }

    // emergency
    const sos = el('section', 'pl-card pl-sos');
    sos.appendChild(el('h3', null, tl2('জরুরি দরকারে', 'In an emergency')));
    const bn = n => (LANG === 'en' ? n : n.replace(/\d/g, c => '০১২৩৪৫৬৭৮৯'[c]));
    for (const [office, number] of TOURIST_POLICE[d.id] || []) {
      const a = el('a', 'pl-call tp'); a.href = 'tel:' + number.replace(/\D/g, '');
      a.append(el('b', null, bn(number)), el('span', null, office), el('small', null, tl2('ট্যুরিস্ট পুলিশ · পর্যটকদের সাহায্য', 'Tourist Police · help for visitors')));
      sos.appendChild(a);
    }
    for (const h of HELPLINES.slice(0, 3)) {
      const a = el('a', 'pl-call'); a.href = 'tel:' + h.number;
      a.append(el('b', null, LANG === 'en' ? h.number : h.number.replace(/\d/g, c => '০১২৩৪৫৬৭৮৯'[c])), el('span', null, h.bn), el('small', null, h.sub));
      sos.appendChild(a);
    }
    const hos = el('button', 'pl-link', tl2('কাছের হাসপাতাল ও ফার্মেসি খুঁজুন →', 'Find hospitals and pharmacies nearby →'));
    sos.appendChild(el('p', 'pl-muted pl-src', TOURIST_POLICE[d.id] ? tl2(`ট্যুরিস্ট পুলিশের নম্বর তাদের সরকারি ওয়েবসাইট (touristpolice.gov.bd) থেকে নেওয়া, যাচাই ${TOURIST_POLICE_CHECKED.bn}।`, `Tourist Police numbers from touristpolice.gov.bd, checked ${TOURIST_POLICE_CHECKED.en}.`)
      : tl2('এই জেলায় ট্যুরিস্ট পুলিশের কোনো অফিসের সরকারি নম্বর প্রকাশিত নেই — বিপদে ৯৯৯-এ ফোন করুন।', 'Tourist Police publish no office number in this district — call 999 in an emergency.')));
    hos.addEventListener('click', leave(() => nearbyAt(s.lat != null ? { lat: s.lat, lon: s.lon, label: s.name } : asPlace(d))));
    sos.appendChild(hos);
    body.appendChild(sos);

    // photos people took
    const giveBox = el('section', 'pl-card pl-givebox');
    const givenote = el('p', 'pl-givenote');
    giveBox.append(el('h3', null, s.img ? tl2('আপনার চোখে জায়গাটি', 'The place through your eyes') : tl2('এই জায়গার প্রথম ছবিটি আপনিই দিন', 'Be the first to add a photo')),
      el('p', null, tl2('নিজের তোলা ছবি পাঠান (একসাথে ৩টি পর্যন্ত)। আমাদের টিম দেখে অনুমোদন দিলে ছবিটি সবাই দেখবে, আর আপনি পাবেন প্রতিটিতে ৩ পয়েন্ট।', 'Send photos you took (up to 3). Once our team approves one, everyone sees it and you earn 3 points for each.')));
    const pick = el('button', 'btn pl-pick'); pick.append(ic('camera'), el('span', null, tl2('ছবি পাঠান', 'Send photos')));
    const chooser = Object.assign(el('input'), { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true });
    giveBox.append(pick, chooser, givenote);
    body.appendChild(giveBox);
    const askPhoto = () => { if (!ME) { openLogin(); return; } chooser.click(); };
    pick.addEventListener('click', askPhoto); give.addEventListener('click', () => { giveBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(askPhoto, 350); });
    chooser.addEventListener('change', async () => {
      const files = [...chooser.files].slice(0, 3);
      chooser.value = '';
      if (!files.length) return;
      pick.disabled = true;
      let sent = 0, waiting = 0;
      for (const [i, f] of files.entries()) {
        givenote.className = 'pl-givenote'; givenote.textContent = tl2(`ছবি ${num(i + 1)}/${num(files.length)} পাঠানো হচ্ছে…`, `Sending photo ${i + 1} of ${files.length}…`);
        try {
          const blob = await shrink(f);
          const media = await uploadMedia(blob, blob.type || 'image/jpeg', p => { givenote.textContent = tl2(`ছবি ${num(i + 1)}/${num(files.length)} · ${num(Math.round(p * 100))}%`, `Photo ${i + 1}/${files.length} · ${Math.round(p * 100)}%`); });
          waiting = (await placesPost('photo', { key, name: s.name, media })).waiting; sent++;
        } catch (e) {
          givenote.className = 'pl-givenote bad';
          givenote.textContent = e.message === 'three' ? tl2('এই জায়গার ৩টি ছবি অনুমোদনের অপেক্ষায় আছে — সেগুলো দেখা হলে আবার পাঠাতে পারবেন।', 'Three of your photos of this place are already waiting.')
            : e.message === 'slow' ? tl2('আজ অনেক ছবি পাঠিয়েছেন — কাল আবার চেষ্টা করুন।', 'You have sent many photos today; try tomorrow.')
            : e.message === 'big' ? tl2('ছবিটি অনেক বড়।', 'The photo is too large.') : tl2('পাঠানো গেল না। ইন্টারনেট দেখে আবার চেষ্টা করুন।', 'Could not send. Check the connection and try again.');
          break;
        }
      }
      pick.disabled = false;
      if (sent) { givenote.className = 'pl-givenote ok'; givenote.textContent = tl2(`ধন্যবাদ! ${num(sent)}টি ছবি পাঠানো হয়েছে — অনুমোদনের অপেক্ষায় ${num(waiting)}টি। অনুমোদন হলে এখানে দেখা যাবে।`, `Thank you! ${sent} sent, ${waiting} waiting for approval.`); }
    });

    // reviews
    const rev = el('section', 'pl-card pl-reviews');
    const revHead = el('div', 'pl-revhead');
    const revList = el('div', 'pl-revlist');
    const write = el('button', 'btn quiet pl-write'); write.append(ic('star'), el('span', 'lbl', tl2('রিভিউ লিখুন', 'Write a review')));
    rev.append(el('h3', null, tl2('যারা গিয়েছেন তাদের কথা', 'From people who went')), revHead, write, revList);
    body.appendChild(rev);
    let data = null;
    const paintReviews = () => {
      revHead.replaceChildren();
      if (data && data.n) {
        revHead.append(el('b', null, num(data.stars, 1)), starRow(data.stars, 20), el('span', null, tl2(`${num(data.n)}টি রিভিউ`, `${data.n} reviews`)));
        rating.hidden = false; rating.replaceChildren(el('span', 'st', '★'), document.createTextNode(` ${num(data.stars, 1)} · ${num(data.n)}`));
      } else { revHead.appendChild(el('p', 'pl-muted', tl2('এখনো কেউ রিভিউ দেননি — গিয়ে থাকলে প্রথমটি আপনিই লিখুন।', 'No reviews yet — if you have been, write the first.'))); rating.hidden = true; }
      revList.replaceChildren(...((data && data.reviews) || []).map(r => {
        const c = el('article', 'pl-rev');
        const who = el('div', 'pl-who');
        const av = el('span', 'pl-av'); if (r.by.pic) av.style.backgroundImage = `url(api/avatar/${r.by.id}?v=${r.by.pic})`; else av.textContent = [...(r.by.name || '?')][0];
        who.append(av, el('b', null, r.by.name), starRow(r.stars, 13), el('small', null, new Date(r.created).toLocaleDateString(LANG === 'en' ? 'en-GB' : 'bn-BD', { day: 'numeric', month: 'short', year: 'numeric' })));
        c.appendChild(who);
        if (r.body) c.appendChild(el('p', 'no-tr', r.body));
        return c;
      }));
      write.querySelector('.lbl').textContent = data && data.mine && data.mine.review ? tl2('আমার রিভিউ বদলান', 'Edit my review') : tl2('রিভিউ লিখুন', 'Write a review');
    };
    write.addEventListener('click', () => {
      if (!ME) { openLogin(); return; }
      if (rev.querySelector('.pl-form')) return;
      const mine = (data && data.mine && data.mine.review) || { stars: 0, body: '' };
      let stars = mine.stars;
      const form = el('div', 'pl-form');
      const pickStars = el('div', 'pl-pickstars');
      const paint = () => [...pickStars.children].forEach((b, i) => b.classList.toggle('on', i < stars));
      for (let i = 1; i <= 5; i++) { const b = el('button', null, '★'); b.type = 'button'; b.setAttribute('aria-label', tl2(`${num(i)} তারা`, `${i} stars`)); b.addEventListener('click', () => { stars = i; paint(); }); pickStars.appendChild(b); }
      paint();
      const text = Object.assign(el('textarea'), { rows: 3, maxLength: 600, placeholder: tl2('কেমন লাগল, কখন গিয়েছিলেন, কী জেনে যাওয়া ভালো — লিখুন (ঐচ্ছিক)', 'How was it, when did you go, what should others know (optional)'), value: mine.body });
      const msg = el('p', 'pl-givenote');
      const send = el('button', 'btn', tl2('পাঠান', 'Post'));
      send.addEventListener('click', async () => {
        if (!stars) { msg.className = 'pl-givenote bad'; msg.textContent = tl2('কত তারা দেবেন বেছে নিন।', 'Choose the stars.'); return; }
        send.disabled = true;
        try { await placesPost('review', { key, name: s.name, stars, body: text.value }); form.remove(); await load(); flash(tl2('রিভিউ যোগ হয়েছে — ধন্যবাদ!', 'Review posted — thank you!')); }
        catch (e) { send.disabled = false; msg.className = 'pl-givenote bad'; msg.textContent = e.message === 'slow' ? tl2('আজ অনেক রিভিউ দিয়েছেন — কাল আবার চেষ্টা করুন।', 'Too many reviews today.') : tl2('পাঠানো গেল না, আবার চেষ্টা করুন।', 'Could not post; try again.'); }
      });
      const row = el('div', 'pl-formacts'); row.appendChild(send);
      if (mine.stars) { const del = el('button', 'btn quiet', tl2('মুছে ফেলুন', 'Delete')); del.addEventListener('click', async () => { await placesPost('unreview', { key }).catch(() => {}); form.remove(); load(); }); row.appendChild(del); }
      form.append(pickStars, text, msg, row);
      write.after(form);
      text.focus();
    });
    async function load() {
      try { data = await placesGet('place?key=' + encodeURIComponent(key)); } catch { data = null; }
      paintReviews();
      // people's approved photos join the gallery after the Wikimedia one
      for (const p of (data && data.photos) || []) if (!slides.some(f => f.dataset.id === String(p.id))) { addSlide(p.file, tl2(`ছবি: ${p.by.name}`, `Photo: ${p.by.name}`), ''); slides.at(-1).dataset.id = String(p.id); }
      if (slides.length) { hero.classList.remove('bare'); empty.hidden = true; }
      for (const a of arrows) a.hidden = slides.length < 2;
      if (data && data.mine && data.mine.waiting) { givenote.className = 'pl-givenote ok'; givenote.textContent = tl2(`আপনার ${num(data.mine.waiting)}টি ছবি অনুমোদনের অপেক্ষায়।`, `${data.mine.waiting} of your photos are waiting for approval.`); }
    }
    for (const a of arrows) a.hidden = true;
    load();
    body.appendChild(el('p', 'tx-source', tl2('লেখা: বাংলা উইকিপিডিয়া (CC BY-SA) · ছবি: উইকিমিডিয়া কমন্স ও BD Map ব্যবহারকারীরা · ভাড়া: বিআরটিএ ও কাউন্টারের তালিকা · জরুরি নম্বর: সরকারি হেল্পলাইন',
      'Text: Bangla Wikipedia (CC BY-SA) · Photos: Wikimedia Commons and BD Map users · Fares: BRTA and counters · Emergency: government helplines')));
    scroller.append(hero, body);
    box.append(scroller);
    document.body.appendChild(box);
    document.body.classList.add('reels-open');
    x.addEventListener('click', close);
    scroller.addEventListener('scroll', () => hero.style.setProperty('--k', Math.min(1, scroller.scrollTop / 300).toFixed(3)), { passive: true });
  }
  window.openPlace = openPlace;

  // ---- one district, full screen ----
  async function openGuide(d, focusPage) {
    await loadGuide();
    const g = GUIDE[d.id] || {}, gi = giOf(d.id), dhaka = districtById('dhaka');
    const box = el('div', 'dg-sheet');
    const scroller = el('div', 'dg-scroll');
    const hero = el('header', 'dg-hero');
    const heroImg = coverOf(g);
    photo(hero, heroImg, d.division, 1280, 'pin');
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
    if (d !== dhaka) {
      const off = officialFare(dhaka, d), km = off ? off.km : haversineKm(dhaka, d) * 1.3, h = Math.round(km / 42 * 2) / 2;
      chips.appendChild(el('span', null, tl2(`ঢাকা থেকে ${num(Math.round(km))} কিমি · বাসে ~${fmtMin(h * 60)}`, `${Math.round(km)} km from Dhaka · ~${fmtMin(h * 60)} by bus`)));
    }
    if ((g.sights || []).length) chips.appendChild(el('span', null, tl2(`${num(g.sights.length)}টি দর্শনীয় স্থান`, `${g.sights.length} sights`)));
    if (gi.length) chips.appendChild(el('span', null, tl2(`${num(gi.length)}টি জিআই পণ্য`, `${gi.length} GI products`)));
    title.appendChild(chips);
    hero.append(x, title);
    if (heroImg && g.file && heroImg === g.img) { const cr = el('a', 'dg-credit', tl2('ছবি', 'Photo')); cr.href = commonsLink(g.file); cr.target = '_blank'; cr.rel = 'noopener'; hero.appendChild(cr); }
    const body = el('div', 'dg-body');
    if (g.intro) {
      const p = el('p', 'dg-intro no-tr', g.intro);
      const more = el('button', 'dg-wiki', tl2('জেলার কথা — পুরোটা পড়ুন', 'About the district — read it all'));
      more.addEventListener('click', () => openArticle(g.page, { title: d.bn, img: coverOf(g), sub: tl2(`${d.division} বিভাগ`, d.division) }));
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
        : tl2('উইকিপিডিয়া আর উইকিমিডিয়া কমন্সে যেসব দর্শনীয় স্থানের খোঁজ আছে — সবচেয়ে বেশি পড়া আগে।', 'The sights found on Wikipedia and Wikimedia Commons — the most-read first.')));
      const grid = el('div', 'dg-sights');
      for (const s of g.sights) {
        const c = el('article', 'dg-sight' + (s.page === focusPage ? ' focus' : ''));
        const ph = el('div', 'ph');
        photo(ph, s.img, d.division, 960, kindArt(s.name) || 'pin');
        if (s.img && s.imgCaption) ph.appendChild(el('span', 'ph-cap', tl2(`ছবি: ${s.imgCaption}`, `Photo: ${s.imgCaption}`)));
        if (s.file) { const cr = el('a', 'dg-credit', '©'); cr.href = commonsLink(s.file); cr.target = '_blank'; cr.rel = 'noopener'; cr.title = tl2('ছবির উৎস ও লাইসেন্স', 'Photo source and licence'); ph.appendChild(cr); }
        const t = el('div', 't');
        t.append(el('b', 'no-tr', s.name));
        if (s.text) t.appendChild(el('p', 'no-tr', s.text));
        const acts = el('div', 'acts');
        if (s.lat != null) { const m = button('pin', tl2('ম্যাপে', 'On map'), () => { box.remove(); document.body.classList.remove('reels-open'); goTo({ lat: s.lat, lon: s.lon, label: s.name }); }, true); acts.appendChild(m); }
        const w = button('info', tl2('বিস্তারিত', 'More'), () => openPlace(d, s), true);
        acts.appendChild(w);
        c.dataset.key = placeKeyOf(d, s);
        c.addEventListener('click', e => { if (!e.target.closest('a, button')) openPlace(d, s); });
        t.appendChild(acts);
        c.append(ph, t);
        grid.appendChild(c);
      }
      body.appendChild(grid);
      // people's approved photos (for places Wikimedia has none of) and the stars they gave
      placesGet('summary?d=' + d.id).then(({ places }) => {
        for (const c of grid.children) {
          const p = places[c.dataset.key];
          if (!p) continue;
          const ph = c.querySelector('.ph');
          if (p.photo && !ph.querySelector('.dg-img')) { ph.querySelector('.ph-art')?.remove(); photo(ph, p.photo, d.division, 960); ph.appendChild(el('span', 'ph-cap', tl2('ছবি: BD Map ব্যবহারকারী', 'Photo: a BD Map user'))); }
          if (p.reviews) c.querySelector('.t b').after(Object.assign(el('span', 'pl-cardrate'), { textContent: `★ ${num(p.stars, 1)} · ${tl2(`${num(p.reviews)}টি রিভিউ`, `${p.reviews} reviews`)}` }));
        }
      }).catch(() => {});
    }
    // hidden gems people sent for this district
    const gemSec = el('section', 'dg-gemsec');
    gemSec.append(el('h3', 'dg-h', tl2('🌿 মেঠোপথ', '🌿 Methopath')));
    const gemRail = el('div', 'dg-rail');
    const gemAdd = el('button', 'dg-place gm-add');
    gemAdd.append(Object.assign(el('span', 'ph'), { innerHTML: '<span class="gm-plus">+</span>' }), el('span', 't'));
    gemAdd.querySelector('.t').append(el('b', null, tl2(`${d.bn}-এর কোনো জায়গা জানেন?`, `Know a place in ${d.bn}?`)), el('small', null, tl2('খোঁজ দিন · অনুমোদন হলে ৫ পয়েন্ট', 'Share it · 5 points once approved')));
    gemAdd.addEventListener('click', () => openGemForm(d));
    gemRail.appendChild(gemAdd);
    gemSec.appendChild(gemRail);
    placesGet('gems?d=' + d.id).then(({ gems }) => { gemRail.append(...gems.map(gemCard)); }).catch(() => {});
    body.appendChild(gemSec);
    if (TOURIST_POLICE[d.id]) {
      const tp = el('section', 'pl-card pl-sos dg-tp');
      tp.appendChild(el('h3', null, tl2('ট্যুরিস্ট পুলিশ', 'Tourist Police')));
      for (const [office, number] of TOURIST_POLICE[d.id]) {
        const a = el('a', 'pl-call tp'); a.href = 'tel:' + number.replace(/\D/g, '');
        a.append(el('b', null, LANG === 'en' ? number : number.replace(/\d/g, c => '০১২৩৪৫৬৭৮৯'[c])), el('span', null, office), el('small', null, tl2('পর্যটকদের সাহায্য ও নিরাপত্তা', 'Help and safety for visitors')));
        tp.appendChild(a);
      }
      tp.appendChild(el('p', 'pl-muted pl-src', tl2(`সূত্র: touristpolice.gov.bd · যাচাই ${TOURIST_POLICE_CHECKED.bn} · জরুরি দরকারে ৯৯৯`, `Source: touristpolice.gov.bd · checked ${TOURIST_POLICE_CHECKED.en} · emergency 999`)));
      body.appendChild(tp);
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
    seg.dataset.on = m; $('page-districts').dataset.tab = m;
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
    renderGems().then(syncWants);
  };
  $('mtp-open')?.addEventListener('click', () => openMethopath());
  if (current === 'districts') enter.districts();
})();
