// Pipeline: node tools/build-guide.mjs && node tools/clean-guide.mjs && node tools/thumbs-guide.mjs
// Builds data/district-guide.json: for each of the 64 districts, its Bangla Wikipedia introduction and cover picture,
// and the places its article lists under its sights / tourism section, each with a picture, a line and a position.
// Text is from Bangla Wikipedia (CC BY-SA), pictures from Wikimedia Commons (each file's own licence); the app
// shows where each comes from. Run: node tools/build-guide.mjs
import fs from 'node:fs';

const UA = { 'User-Agent': 'BDMap/1.0 (district guide build; contact via github.com/rabbihossaingd-alt)' };
const API = 'https://bn.wikipedia.org/w/api.php?format=json&formatversion=2&';
let lastStatus = 0;
const get = async q => {
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch(API + q, { headers: UA }); lastStatus = r.status; if (r.ok) return r.json(); } catch (e) { lastStatus = e.message; }
    await new Promise(r => setTimeout(r, 4000 * (i + 1)));                          // Wikipedia asks for patience
  }
  throw new Error('wiki ' + lastStatus);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getEN = async q => {
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch('https://en.wikipedia.org/w/api.php?format=json&formatversion=2&' + q, { headers: UA }); if (r.ok) return r.json(); } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 4000 * (i + 1)));
  }
  throw new Error('enwiki');
};
const getWD = async q => {
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch('https://www.wikidata.org/w/api.php?format=json&' + q, { headers: UA }); if (r.ok) return r.json(); } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 4000 * (i + 1)));
  }
  throw new Error('wikidata');
};

const src = fs.readFileSync(new URL('../data/bangladesh.js', import.meta.url), 'utf8');
const rows = [...src.matchAll(/\['([a-z]+)', '([^']+)', (?:'([^']+)'|"([^"]+)"), ([\d.]+), ([\d.]+), '([^']+)'\]/g)].map(m => ({ id: m[1], bn: m[2], en: (m[3] || m[4]).split(' ')[0], lat: +m[5], lon: +m[6] }));
if (rows.length !== 64) throw new Error('districts: ' + rows.length);

// Article names that differ from "<name> জেলা"
const TITLE = { coxsbazar: 'কক্সবাজার জেলা', chapainawabganj: 'চাঁপাইনবাবগঞ্জ জেলা', brahmanbaria: 'ব্রাহ্মণবাড়িয়া জেলা' };
const SIGHT_SECTION = /দর্শনীয়|চিত্তবিনোদন|বিনোদন|পর্যটন|চিত্তাকর্ষক|দেখার মতো|ভ্রমণ|ঐতিহাসিক|উল্লেখযোগ্য স্থান|প্রত্নতাত্ত্বিক|স্থাপনা|স্থাপত্য/;
// lists under those headings also name airports, campuses, stations, offices: not places to go and see
const NOT_A_SIGHT = /ইনস্টিটিউট|কোর্ট|কোম্পানি|লিমিটেড|সার কারখানা|বিমানবন্দর|বিশ্ববিদ্যালয়|কলেজ|স্কুল|বিদ্যালয়|মাদ্রাসা|রেলওয়ে|স্টেশন|সেনানিবাস|ক্যান্টনমেন্ট|হাসপাতাল|মেডিক্যাল|মেডিকেল|কার্যালয়|অফিস|ব্যাংক|থানা|আদালত|ক্লাব|স্টেডিয়াম/;
const NOT_A_PLACE = /জেলা$|উপজেলা$|বিভাগ$|^বাংলাদেশ$|নদী$|^ঢাকা$|সাল$|^\d|ইউনিয়ন$|থানা$|পৌরসভা$|ওয়ার্ড$|-\d+$|আসন|জেলাসমূহ|তালিকা/;

const cleanWikitext = s => s.replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/\{\{[^{}]*\}\}/g, '').replace(/'''?/g, '');
function linksIn(wikitext, prose = false) {
  const out = [];
  for (const line of cleanWikitext(wikitext).split('\n')) {
    if (!prose && !/^[*#]/.test(line.trim()) && !/^\|/.test(line.trim())) continue;       // list items and table cells
    for (const m of line.matchAll(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g)) {
      const target = m[1].trim(), text = (m[2] || m[1]).trim();
      if (/^(চিত্র|ফাইল|File|Image|বিষয়শ্রেণী|Category):/i.test(target) || NOT_A_PLACE.test(target) || NOT_A_SIGHT.test(target)) continue;
      out.push({ title: target, name: text, prose });
      if (!prose) break;                                                           // the first link of a list line names it
    }
  }
  return out;
}

const OUT = new URL('../data/district-guide.json', import.meta.url);
const guide = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).guide : {};
for (const d of rows) {
  if (guide[d.id] && guide[d.id].sights.length >= 3 && !process.argv.includes('--all')) continue;
  const title = TITLE[d.id] || `${d.bn} জেলা`;
  try {
    const sec = await get(`action=parse&prop=sections&redirects=1&page=${encodeURIComponent(title)}`);
    if (!sec.parse) { console.log('no article', d.id, title); continue; }
    const page = sec.parse.title;
    const hits = sec.parse.sections.filter(s => SIGHT_SECTION.test(s.line));
    let sights = [];
    for (const s of hits.slice(0, 3)) {
      const w = await get(`action=parse&prop=wikitext&redirects=1&page=${encodeURIComponent(page)}&section=${s.index}`);
      const listed = linksIn(w.parse.wikitext);
      sights.push(...(listed.length >= 3 ? listed : [...listed, ...linksIn(w.parse.wikitext, true)]));   // a section written as prose
      await sleep(700);
    }
    const near = false;   // (articles near the town were tried: unions, wards and offices — not places to visit)
    // Too few: the district town's own article (চট্টগ্রাম rather than চট্টগ্রাম জেলা) often lists them
    let fromTown = '';
    if (sights.length < 3) {
      try {
        const ts = await get(`action=parse&prop=sections&redirects=1&page=${encodeURIComponent(d.bn)}`);
        if (ts.parse && ts.parse.title !== page) {
          for (const sct of ts.parse.sections.filter(x => SIGHT_SECTION.test(x.line)).slice(0, 3)) {
            const w = await get(`action=parse&prop=wikitext&redirects=1&page=${encodeURIComponent(ts.parse.title)}&section=${sct.index}`);
            const l = linksIn(w.parse.wikitext);
            sights.push(...(l.length >= 3 ? l : [...l, ...linksIn(w.parse.wikitext, true)]));
            await sleep(700);
          }
          if (sights.length) fromTown = ts.parse.title;
        }
      } catch (e) { console.log('  town article failed', d.id, e.message); }
    }
    // Too few on Bangla Wikipedia: the English article's tourism section, keeping the places that have a Bangla article
    if (sights.length < 3) {
      const EN_SECTION = /touris|attraction|places of interest|landmark|sights|heritage|archaeolog/i;
      const EN_NOT = /University|College|School|Airport|Station|Hospital|Cantonment|Upazila|District|Union|Company|Limited|Bank|Ward|constituency/i;
      const enTitle = { coxsbazar: "Cox's Bazar District", chattogram: 'Chittagong District', jashore: 'Jessore District', barishal: 'Barisal District', bogura: 'Bogra District', cumilla: 'Comilla District' }[d.id] || `${d.en} District`;
      try {
        const es = await getEN(`action=parse&prop=sections&redirects=1&page=${encodeURIComponent(enTitle)}`);
        const enPage = es.parse ? es.parse.title : '';
        const enLinks = [];
        for (const sct of (es.parse ? es.parse.sections : []).filter(x => EN_SECTION.test(x.line)).slice(0, 3)) {
          const w = await getEN(`action=parse&prop=wikitext&redirects=1&page=${encodeURIComponent(enPage)}&section=${sct.index}`);
          const l = linksIn(w.parse.wikitext);
          enLinks.push(...(l.length >= 3 ? l : [...l, ...linksIn(w.parse.wikitext, true)]).map(x => x.title).filter(t => !EN_NOT.test(t)));
          await sleep(700);
        }
        const uniq = [...new Set(enLinks)].slice(0, 45);
        for (let i = 0; i < uniq.length; i += 40) {
          const q = await getEN(`action=query&redirects=1&prop=langlinks&lllang=bn&lllimit=max&titles=${encodeURIComponent(uniq.slice(i, i + 40).join('|'))}`);
          for (const p of q.query.pages || []) { const bnT = p.langlinks && p.langlinks[0] && p.langlinks[0].title; if (bnT && !NOT_A_PLACE.test(bnT) && !NOT_A_SIGHT.test(bnT)) sights.push({ title: bnT, name: bnT.replace(/\s*\([^)]*\)$/, '') }); }
          await sleep(700);
        }
      } catch (e) { console.log('  english fallback failed', d.id, e.message); }
    }
    const seen = new Set();
    sights = sights.filter(x => !seen.has(x.title) && seen.add(x.title)).slice(0, 45);
    // the district's own introduction and picture, and each place's picture, line and position
    const titles = [page, ...sights.map(x => x.title)];
    const info = {};
    for (let i = 0; i < titles.length; i += 20) {
      const q = await get(`action=query&redirects=1&prop=pageimages|coordinates|extracts|pageviews|pageprops&ppprop=wikibase_item&piprop=thumbnail|name&pithumbsize=900&exintro=1&explaintext=1&exsentences=2&exlimit=20&pvipdays=60&titles=${encodeURIComponent(titles.slice(i, i + 20).join('|'))}`);
      const redirect = new Map((q.query.redirects || []).map(r => [r.to, r.from]));
      const norm = new Map((q.query.normalized || []).map(n => [n.to, n.from]));
      for (const p of q.query.pages) {
        let from = p.title; from = redirect.get(from) || from; from = norm.get(from) || from;
        info[from] = info[p.title] = p.missing ? null : {
          title: p.title, img: p.thumbnail ? p.thumbnail.source : '', file: p.pageimage || '',
          lat: p.coordinates ? +p.coordinates[0].lat.toFixed(5) : null, lon: p.coordinates ? +p.coordinates[0].lon.toFixed(5) : null,
          text: (p.extract || '').replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 260),
          views: Object.values(p.pageviews || {}).reduce((a, v) => a + (v || 0), 0),
          q: p.pageprops ? p.pageprops.wikibase_item : ''
        };
      }
      await sleep(700);
    }
    // What each one is, from Wikidata: people and list pages are not places to visit; a place's own picture (P18)
    // is used before the article's, which for a shrine can be a portrait of the person it is named after.
    const qs = [...new Set(Object.values(info).filter(Boolean).map(i => i.q).filter(Boolean))];
    const wd = {};
    for (let i = 0; i < qs.length; i += 45) {
      const r = await getWD(`action=wbgetentities&props=claims&ids=${qs.slice(i, i + 45).join('|')}`);
      for (const [id, e] of Object.entries(r.entities || {})) {
        const claim = p => ((e.claims || {})[p] || []).map(c => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value).filter(Boolean);
        wd[id] = { types: claim('P31').map(v => v.id), image: claim('P18')[0] || '' };
      }
      await sleep(700);
    }
    const NOT_PLACES = new Set(['Q5', 'Q13406463', 'Q4167410', 'Q4167836', 'Q6256']);   // human, list article, disambiguation page, category, country
    for (const i of Object.values(info)) {
      if (!i || !i.q || !wd[i.q]) continue;
      const w = wd[i.q];
      i.notPlace = w.types.some(t => NOT_PLACES.has(t));
      if (w.image) { i.file = w.image; i.img = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(w.image.replace(/ /g, '_'))}?width=900`; }
    }
    const me = info[page] || {};
    guide[d.id] = {
      page, intro: me.text || '', img: me.img || '', file: me.file || '', near, fromTown,
      // the places people read about most (Wikipedia page views, last 60 days) come first; only those with an article
      sights: sights.map(x => ({ x, i: info[x.title] })).filter(o => o.i && !(o.x.prose && o.i.lat == null) && !o.i.notPlace && !/তালিকা|জেলাসমূহ|উপজেলাসমূহ/.test(o.i.title + ' ' + o.x.title) && !NOT_A_PLACE.test(o.i.title)).sort((a, b) => b.i.views - a.i.views || !!b.i.img - !!a.i.img).slice(0, 10)
        .map(({ x, i }) => ({ name: x.name, page: i.title, img: i.img, file: i.file, text: i.text, lat: i.lat, lon: i.lon, views: i.views }))
    };
    console.log(d.id, guide[d.id].sights.length, 'sights', guide[d.id].sights.filter(s => s.img).length, 'with pictures');
  } catch (e) { console.log('failed', d.id, e.message); }
  await sleep(1200);
  fs.writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString().slice(0, 10), source: 'bn.wikipedia.org (CC BY-SA), commons.wikimedia.org', guide }));
}
fs.writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString().slice(0, 10), source: 'bn.wikipedia.org (CC BY-SA), commons.wikimedia.org', guide }));
console.log('done', Object.keys(guide).length);
