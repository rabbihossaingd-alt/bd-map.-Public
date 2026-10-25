// জায়গার ছবি ও মেঠোপথ: one item at a time, large, with where it is and anything similar already there. Keys: a approve,
// r reject (asks why), j/k next and previous. Each decision can be undone.
import { api, errText } from '../api.js';
import { attrs, avatar, badge, button, confirmAction, empty, errorBox, h, icon, skeleton, tabs, toast, when } from '../ui.js';
import { num } from '../fmt.js';

const GEM_KIND = { water: 'ঝর্ণা', river: 'নদী / সৈকত / লেক', hill: 'পাহাড় / বন', heritage: 'ঐতিহাসিক স্থাপনা', faith: 'ধর্মীয় স্থান', wetland: 'হাওর / বিল', village: 'গ্রাম ও গ্রামীণ জীবন', other: 'অন্যান্য' };

export async function render(box, { page }) {
  const kind = page.key === 'gems' ? 'gem' : 'photo';
  let status = 'pending', items = [], at = 0;
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, kind === 'gem' ? 'মেঠোপথ' : 'জায়গার ছবি'),
    h('p', 'muted', kind === 'gem' ? 'মানুষের পাঠানো অজানা জায়গা। জায়গাটি সত্যিই আছে, বর্ণনা ঠিক আর ভদ্র, ছবি ওই জায়গার — তবেই অনুমোদন। বিজ্ঞাপন, ব্যক্তিগত বাড়ি বা ভুয়া তথ্য বাদ।' : 'রূপসী বাংলায় পাঠানো জায়গার ছবি। ছবিটি সত্যিই ওই জায়গার, পরিষ্কার, মুখ মুখ্য নয় — তবেই অনুমোদন। স্ক্রিনশট, ঝাপসা বা অন্যের ওয়াটারমার্ক বাদ।')),
    h('span', 'muted small', h('kbd', null, 'a'), ' অনুমোদন · ', h('kbd', null, 'r'), ' বাদ · ', h('kbd', null, 'j'), '/', h('kbd', null, 'k'), ' পরের/আগের')), holder);
  async function load() {
    holder.replaceChildren(skeleton(3, 'cards'));
    try { const r = await api(`review?kind=${kind}&status=${status}`); items = r.items; at = Math.min(at, Math.max(0, items.length - 1)); paint(r.waiting); }
    catch (e) { holder.replaceChildren(errorBox(e, load)); }
  }
  function paint(waiting) {
    const t = tabs([['pending', 'দেখা বাকি', waiting], ['ok', 'অনুমোদিত'], ['no', 'বাদ দেওয়া']], status, v => { status = v; at = 0; load(); });
    if (!items.length) { holder.replaceChildren(t, empty(status === 'pending' ? 'দেখার মতো কিছু বাকি নেই — সাবাস' : 'এখানে কিছু নেই।')); return; }
    const it = items[at];
    const media = kind === 'photo' ? h('div', 'rv-media', attrs(h('img'), { src: it.src, alt: it.title })) : h('div', 'rv-media gallery', ...(it.photos.length ? it.photos.map(src => attrs(h('img'), { src, alt: '', loading: 'lazy' })) : [h('div', 'empty', 'ছবি নেই')]));
    const facts = h('div', 'stack',
      h('div', 'u-head', h('div', 'u-id', h('h2', null, it.title), h('span', 'muted', `${it.district}${it.place ? ' · ' + it.place : ''}${kind === 'gem' ? ' · ' + (GEM_KIND[it.kind] || it.kind) : ''}`))),
      h('div', 'person', avatar(it.user), h('div', 't', h('b', null, it.user.name), h('span', null, '@' + it.user.username))), h('div', 'kv', h('span', null, 'পাঠানো'), when(it.created)),
      kind === 'gem' && it.about ? h('p', null, it.about) : null, kind === 'gem' && it.how ? h('p', 'muted', 'যাবেন কীভাবে: ' + it.how) : null,
      it.lat != null ? attrs(h('a', 'btn secondary sm', icon('pin'), h('span', null, 'ম্যাপে অবস্থান')), { href: `https://www.openstreetmap.org/?mlat=${it.lat}&mlon=${it.lon}#map=15/${it.lat}/${it.lon}`, target: '_blank', rel: 'noopener' }) : null,
      it.same.length ? h('div', 'dup', h('b', null, icon('alert'), kind === 'gem' ? ' কাছাকাছি একই রকম জায়গা' : ' এই জায়গার আরও ছবি'),
        ...(kind === 'gem' ? it.same.map(s => h('div', 'kv', h('span', null, s.name), h('span', 'muted', `${s.km != null ? num(s.km, 1) + ' কিমি দূরে · ' : ''}${s.status === 'ok' ? 'অনুমোদিত' : 'অপেক্ষায়'}`)))
          : [h('div', 'rv-same', ...it.same.map(s => attrs(h('img'), { src: s.src, alt: '', loading: 'lazy', title: s.status === 'ok' ? 'অনুমোদিত' : 'অপেক্ষায়' })))])) : null,
      h('div', 'row-acts', status !== 'ok' ? button('অনুমোদন দিন', { kind: 'primary', ic: 'check', onClick: () => decide('approve') }) : null, status !== 'no' ? button(status === 'ok' ? 'সরিয়ে দিন' : 'বাদ দিন', { kind: 'danger', onClick: () => decide('reject') }) : null,
        h('span', 'grow'), h('span', 'muted', `${num(at + 1)} / ${num(items.length)}`), button('', { kind: 'ghost', ic: 'chevl', title: 'আগের (k)', onClick: () => step(-1) }), button('', { kind: 'ghost', ic: 'chevr', title: 'পরের (j)', onClick: () => step(1) })));
    holder.replaceChildren(t, h('div', 'review', media, facts));
  }
  function step(d) { if (!items.length) return; at = (at + d + items.length) % items.length; paint(); }
  async function decide(what) {
    const it = items[at];
    let extra = {};
    if (what === 'reject') {
      const ok = await confirmAction({ tier: 2, title: `"${it.title}" বাদ দেবেন?`, reasons: kind === 'gem' ? [['fake', 'ভুয়া/অস্তিত্ব নেই'], ['ad', 'বিজ্ঞাপন'], ['private', 'ব্যক্তিগত জায়গা'], ['duplicate', 'আগে থেকেই আছে'], ['rude', 'অভদ্র বর্ণনা'], ['other', 'অন্য']]
        : [['wrong_place', 'অন্য জায়গার ছবি'], ['blurry', 'ঝাপসা/অন্ধকার'], ['screenshot', 'স্ক্রিনশট/ওয়াটারমার্ক'], ['faces', 'মানুষের মুখ মুখ্য'], ['duplicate', 'একই ছবি আগে আছে'], ['other', 'অন্য']], confirmText: 'বাদ দিন' });
      if (!ok) return; extra = ok;
    }
    try {
      const r = await api('review/decide', { kind, id: it.id, do: what, ...extra });
      toast(what === 'approve' ? 'অনুমোদন দেওয়া হলো — অ্যাপে দেখা যাবে।' : 'বাদ দেওয়া হলো।', { undo: async () => { await api('review/decide', { kind, id: it.id, do: r.before === 'ok' ? 'approve' : r.before === 'no' ? 'reject' : 'pending', reason: 'undo' }); load(); } });
      load();
    } catch (e) { toast(errText(e), { bad: true }); }
  }
  await load();
  return { key: e => { if (e.key === 'a' && status !== 'ok') { decide('approve'); return true; } if (e.key === 'r' && status !== 'no') { decide('reject'); return true; } if (e.key === 'j' || e.key === 'k') { step(e.key === 'j' ? 1 : -1); return true; } return false; } };
}
