// "এক নজরে" for each place: the facts in the infobox of its Bangla Wikipedia article (built, architect, style,
// address, area, height ...), cleaned of wiki markup. Only fields with a plain value are kept, at most 7.
// Text: Bangla Wikipedia (CC BY-SA). Run after the guide is built: node tools/facts-guide.mjs
import fs from 'node:fs';
const UA = { 'User-Agent': 'BDMap/1.0 (guide build; contact via github.com/rabbihossaingd-alt)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(q) {
  for (let i = 0; i < 8; i++) {
    try { const r = await fetch(`https://bn.wikipedia.org/w/api.php?format=json&formatversion=2&${q}`, { headers: UA }); if (r.ok) { const t = await r.text(); if (t.startsWith('{')) return JSON.parse(t); } } catch { /* retry */ }
    await sleep(6000 * (i + 1));
  }
  throw new Error('wiki');
}
// infobox field -> the label shown (several fields can share one; the first found wins)
const FIELDS = [
  [['other_name', 'former_names', 'native_name', 'অন্য_নাম'], 'অন্য নাম'],
  [['building_type', 'type', 'ধরন'], 'ধরন'],
  [['architectural_style', 'architecture', 'style', 'স্থাপত্য_শৈলী'], 'স্থাপত্যশৈলী'],
  [['religious_affiliation', 'religion', 'affiliation', 'deity'], 'ধর্ম / উৎসর্গ'],
  [['address', 'location', 'অবস্থান'], 'অবস্থান'],
  [['start_date', 'built', 'established', 'founded', 'founded_date', 'year_built', 'construction_start', 'date_built', 'প্রতিষ্ঠা'], 'নির্মাণ / প্রতিষ্ঠা'],
  [['est_completion', 'completed', 'completion_date', 'opened', 'opening', 'inauguration', 'open'], 'সম্পন্ন / চালু'],
  [['architect', 'designer', 'স্থপতি'], 'স্থপতি'],
  [['founder', 'builder', 'built_by', 'founded_by', 'নির্মাতা'], 'নির্মাতা'],
  [['carries', 'crosses'], 'সেতুর ওপর দিয়ে / নিচে'],
  [['total_length', 'length', 'length_m', 'দৈর্ঘ্য'], 'দৈর্ঘ্য'],
  [['area', 'area_km2', 'area_ha', 'area_acre', 'আয়তন'], 'আয়তন'],
  [['elevation', 'elevation_m', 'height', 'height_m', 'উচ্চতা'], 'উচ্চতা'],
  [['max_depth', 'depth'], 'গভীরতা'],
  [['owner', 'governing_body', 'management', 'administrator', 'operator', 'maintained_by'], 'তত্ত্বাবধানে'],
  [['status', 'current_use'], 'বর্তমানে'],
  [['visitation_num', 'visitors'], 'দর্শনার্থী']
];
function clean(v) {
  let s = v;
  s = s.replace(/<!--[\s\S]*?(-->|$)/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  s = s.replace(/\{\{\s*(?:convert|cvt)\s*\|([^|}]+)\|([^|}]+)[^}]*\}\}/gi, '$1 $2');
  s = s.replace(/\{\{\s*(?:start date|start date and age|date|circa|c\.)\s*\|([^}]*)\}\}/gi, (m, x) => x.split('|').filter(p => !/=/.test(p)).join('-'));
  for (let i = 0; i < 3; i++) s = s.replace(/\{\{[^{}]*\}\}/g, '');
  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\[https?:\/\/\S+\s([^\]]+)\]/g, '$1').replace(/\[https?:\/\/\S+\]/g, '');
  s = s.replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '').replace(/'''?/g, '').replace(/&nbsp;/g, ' ');
  s = s.replace(/\s+/g, ' ').replace(/^[\s,;:]+|[\s,;:]+$/g, '').trim();
  return s;
}
function facts(wikitext) {
  const start = wikitext.search(/\{\{\s*(?:Infobox|তথ্যছক|ইনফোবক্স)/i);
  if (start < 0) return [];
  // the infobox ends where its braces balance
  let depth = 0, end = start;
  for (let i = start; i < wikitext.length; i++) {
    if (wikitext.startsWith('{{', i)) { depth++; i++; } else if (wikitext.startsWith('}}', i)) { depth--; i++; if (!depth) { end = i + 1; break; } }
  }
  const box = wikitext.slice(start, end), fields = {};
  // split on top-level pipes only
  let d = 0, cur = '';
  const parts = [];
  for (let i = 2; i < box.length - 2; i++) {
    const two = box.slice(i, i + 2);
    if (two === '{{' || two === '[[') { d++; cur += two; i++; continue; }
    if (two === '}}' || two === ']]') { d--; cur += two; i++; continue; }
    if (box[i] === '|' && d === 0) { parts.push(cur); cur = ''; continue; }
    cur += box[i];
  }
  parts.push(cur);
  for (const p of parts.slice(1)) { const k = p.indexOf('='); if (k > 0) fields[p.slice(0, k).trim().toLowerCase()] = p.slice(k + 1); }
  const out = [];
  for (const [keys, label] of FIELDS) {
    const k = keys.find(x => fields[x] && clean(fields[x]));
    if (!k) continue;
    const v = clean(fields[k]);
    if (v.length < 1 || v.length > 90 || /[{}[\]|=<>]/.test(v) || /^\d{1,2}$/.test(v)) continue;
    if (/^(অজানা|জানা নেই|নেই|unknown|n\/a|-+)$/i.test(v)) continue;                         // "unknown" says nothing
    if (['আয়তন', 'দৈর্ঘ্য', 'উচ্চতা', 'গভীরতা'].includes(label) && (!/[০-৯0-9]/.test(v) || /^[০-৯0-9.,\s]+$/.test(v))) continue;   // a measure needs a number and a unit
    if (/\d{1,2}:\d{2}|[০-৯]{1,2}:[০-৯]{2}/.test(v)) continue;                              // opening hours are not a date
    out.push([label, v]);
    if (out.length >= 7) break;
  }
  return out;
}
const GUIDE = new URL('../data/district-guide.json', import.meta.url);
const all = JSON.parse(fs.readFileSync(GUIDE, 'utf8'));
const sights = Object.values(all.guide).flatMap(g => g.sights || []).filter(s => s.page);
const pages = [...new Set(sights.map(s => s.page))];
const got = {};
for (let i = 0; i < pages.length; i += 40) {
  const r = await api(`action=query&redirects=1&prop=revisions&rvprop=content&rvslots=main&rvsection=0&titles=${encodeURIComponent(pages.slice(i, i + 40).join('|'))}`);
  const back = {}; for (const x of [...(r.query.normalized || []), ...(r.query.redirects || [])]) back[x.to] = x.from;
  for (const p of r.query.pages || []) {
    const text = p.revisions && (p.revisions[0].slots ? p.revisions[0].slots.main.content : p.revisions[0].content);
    if (!text) continue;
    let t = p.title; const f = facts(text); got[t] = f; while (back[t]) { t = back[t]; got[t] = f; }
  }
  await sleep(1500);
}
let n = 0;
for (const s of sights) { const f = got[s.page]; if (f && f.length) { s.facts = f; n++; } else delete s.facts; }
fs.writeFileSync(GUIDE, JSON.stringify(all));
console.log('places with facts', n, 'of', sights.length);
for (const s of sights.filter(s => s.facts).slice(0, 6)) console.log(' ', s.name, JSON.stringify(s.facts));
