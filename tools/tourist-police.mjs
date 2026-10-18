// Reads the officer lists of Bangladesh Tourist Police's region websites (touristpolice.gov.bd and its 12 region
// sites) and prints every entry: designation, office (zone / sub-zone), mobile and office phone. Only the official
// police numbers (the 01320-xxxxxx series) are used in the app; personal mobiles are left out.
// Run: node tools/tourist-police.mjs > tools/.cache/tourist-police.json
const SITES = ['touristpolice.gov.bd', 'khureg', 'mymreg', 'sylreg', 'coxsreg', 'rajreg', 'dhareg', 'rangpurreg', 'bandarbanzn', 'ctgreg', 'rangamatireg', 'kuareg']
  .map(s => s.includes('.') ? s : s + '.touristpolice.gov.bd');
const bn2en = s => s.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const out = [];
for (const site of SITES) {
  let html = '';
  for (let i = 0; i < 3 && !html; i++) { try { const r = await fetch(`https://${site}/pages/officers`, { headers: { 'User-Agent': 'BDMap/1.0' } }); if (r.ok) html = await r.text(); } catch { await new Promise(r => setTimeout(r, 3000)); } }
  for (const card of html.split('employee-content-widget').slice(1)) {
    const cell = label => { const m = new RegExp(`<td>${label}</td>\\s*<td>([\\s\\S]*?)</td>`).exec(card); return m ? strip(m[1]) : ''; };
    out.push({ site, name: cell('নাম'), post: cell('পদবি'), office: cell('অফিস'), mobile: bn2en(cell('মোবাইল')).replace(/\D/g, ''), phone: bn2en(cell('ফোন \\(অফিস\\)')).replace(/[^\d-]/g, '') });
  }
  await new Promise(r => setTimeout(r, 800));
}
console.log(JSON.stringify(out, null, 1));
