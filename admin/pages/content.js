// কনটেন্ট: posts and reels, stories, comments, sounds and groups — one module, a view per kind. Taking something down
// asks for a reason (tier 2); a post's author is told in their notifications. Media stays blurred until clicked.
import { api, errText } from '../api.js';
import { attrs, avatar, badge, button, confirmAction, empty, errorBox, h, icon, skeleton, tabs, toast, when } from '../ui.js';
import { dataTable } from '../table.js';
import { full, num, waited } from '../fmt.js';

const LABEL = { post: 'পোস্ট', story: 'স্টোরি', comment: 'মন্তব্য', sound: 'সাউন্ড', group: 'গ্রুপ' };
const who = u => h('div', 'person', avatar(u, 'sm'), h('div', 't', h('b', null, u.name), h('span', null, '@' + (u.username || ''))));
function blurred(p) {
  const m = p.kind === 'video' ? attrs(h('video'), { src: p.src, poster: p.poster || null, preload: 'none', playsinline: '', muted: '' }) : attrs(h('img'), { src: p.src, alt: '', loading: 'lazy' });
  const wrap = h('div', 'blur', m, h('span', 'blur-hint', icon('eye'), 'দেখতে চাপুন'));
  wrap.addEventListener('click', () => { wrap.classList.add('shown'); if (m.tagName === 'VIDEO') { m.muted = true; m.controls = true; m.play().catch(() => {}); } }, { once: true });
  return wrap;
}
async function removeIt(type, items, { preview, extra, after } = {}) {
  const ok = await confirmAction({ tier: 2, title: `${items.length > 1 ? num(items.length) + 'টি ' : ''}${LABEL[type]} সরাবেন?`, text: extra || '', preview, confirmText: 'সরান' });
  if (!ok) return false;
  try { const r = await api('content/remove', { type, ids: items.map(x => x.id), ...ok }); toast(`${num(r.done.length)}টি ${LABEL[type]} সরানো হলো — খতিয়ানে লেখা থাকল।`); if (after) after(); return true; }
  catch (e) { toast(errText(e), { bad: true }); return false; }
}

export async function render(box, { page }) {
  const views = { posts: posts, stories: stories, comments: comments, sounds: sounds, groups: groups };
  return views[page.key](box);
}

function posts(box) {
  let mode = (() => { try { return localStorage.getItem('mzadm.postview') || 'grid'; } catch { return 'grid'; } })();
  const holder = h('div');
  const toggle = button(mode === 'grid' ? 'টেবিল' : 'গ্রিড', { kind: 'ghost', ic: mode === 'grid' ? 'list' : 'image', onClick: () => { mode = mode === 'grid' ? 'table' : 'grid'; try { localStorage.setItem('mzadm.postview', mode); } catch { /* storage off */ } box.replaceChildren(); posts(box); } });
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'পোস্ট ও রিল'), h('p', 'muted', 'এক্সপ্লোরের সব পোস্ট। সরালে লেখক নোটিফিকেশনে জানেন; কারণ খতিয়ানে থাকে।')), toggle), holder);
  const table = dataTable({
    page: 'posts', search: 'ক্যাপশন, নাম, @username বা #ID',
    filters: [{ key: 'kind', label: 'ধরন', options: [['photo', 'ছবি'], ['video', 'ভিডিও'], ['text', 'লেখা']] }, { key: 'reported', label: 'রিপোর্ট', options: [['1', 'রিপোর্ট হয়েছে']] }],
    columns: [
      { key: 'media', label: '', render: p => h('div', 'thumb', p.kind === 'text' ? h('div', 'ptext', p.caption) : blurred(p)), sortable: false },
      { key: 'caption', label: 'পোস্ট', render: p => h('div', 'cell-t', h('b', 'clip', p.caption || (p.kind === 'video' ? 'ভিডিও' : 'ছবি')), h('span', 'muted', `#${num(p.id)} · ${p.kind === 'video' ? 'ভিডিও' : p.kind === 'text' ? 'লেখা' : 'ছবি'}${p.audience !== 'all' ? ' · সীমিত দর্শক' : ''}`)), sort: p => p.id },
      { key: 'user', label: 'লেখক', render: p => who(p.user), sort: p => p.user.name },
      { key: 'views', label: 'ভিউ', render: p => num(p.views), sort: p => p.views, cls: 'num' },
      { key: 'likes', label: 'লাইক', render: p => num(p.likes), sort: p => p.likes, cls: 'num' },
      { key: 'comments', label: 'মন্তব্য', render: p => num(p.comments), sort: p => p.comments, cls: 'num' },
      { key: 'reports', label: 'রিপোর্ট', render: p => p.reports ? badge(num(p.reports), 'danger') : '—', sort: p => p.reports },
      { key: 'created', label: 'কখন', render: p => when(p.created), sort: p => p.created }
    ],
    load: async ({ cursor, limit, q, filters }) => api(`posts2?limit=${limit}${cursor ? '&cursor=' + cursor : ''}${q ? '&q=' + encodeURIComponent(q) : ''}${filters.kind ? '&kind=' + filters.kind : ''}${filters.reported ? '&reported=1' : ''}`),
    actions: p => [button('সরান', { small: true, kind: 'ghost', onClick: () => removeIt('post', [p], { preview: 'টিম আপনার একটি পোস্ট নিয়ম ভাঙার জন্য সরিয়েছে।', after: () => table.reload() }) })],
    bulk: [{ text: 'সরান', ic: 'x', danger: true, run: rows => removeIt('post', rows, { preview: 'টিম আপনার একটি পোস্ট নিয়ম ভাঙার জন্য সরিয়েছে।', after: () => table.reload() }) }],
    emptyText: 'কোনো পোস্ট নেই।'
  });
  table.classList.toggle('as-grid', mode === 'grid');
  holder.append(table);
  return { key: e => table.keyHandler(e) };
}

function stories(box) {
  const holder = h('div', 'sgrid');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'স্টোরি'), h('p', 'muted', 'গত ২৪ ঘণ্টার স্টোরি — মেয়াদ শেষে নিজে থেকেই চলে যায়।'))), holder);
  const load = async () => {
    holder.replaceChildren(skeleton(6, 'cards'));
    try {
      const { rows } = await api('stories2');
      if (!rows.length) { holder.replaceChildren(empty('এখন কোনো স্টোরি নেই।')); return; }
      holder.replaceChildren(...rows.map(s => h('div', 'card scard', blurred(s), who(s.user), h('div', 'row-acts', h('span', 'muted small', icon('clock'), ` ${waited(s.ends - Date.now())} বাকি`), h('span', 'grow'),
        button('সরান', { small: true, kind: 'ghost', onClick: () => removeIt('story', [s], { after: load }) })))));
    } catch (e) { holder.replaceChildren(errorBox(e, load)); }
  };
  load();
  return {};
}

function comments(box) {
  let flagged = false, words = [];
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'মন্তব্য'), h('p', 'muted', 'গালি, হুমকি বা লিংক-স্প্যামের শব্দ থাকা মন্তব্য আগে, শব্দগুলো হাইলাইট করা। শব্দ-তালিকা ফেজ ৪-এ সেটিংস থেকে বদলানো যাবে।'))), holder);
  const mark = (text, hits) => { if (!hits.length) return text; const re = new RegExp('(' + hits.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi'); return h('span', null, ...text.split(re).map((part, i) => i % 2 ? h('mark', null, part) : part)); };
  function draw() {
    const t = tabs([['all', 'সব'], ['flagged', 'চিহ্নিত']], flagged ? 'flagged' : 'all', v => { flagged = v === 'flagged'; draw(); });
    const table = dataTable({
      page: 'comments', search: 'লেখা বা নাম',
      columns: [
        { key: 'body', label: 'মন্তব্য', render: c => h('div', 'cell-t', h('span', 'wrap', mark(c.body, c.hits)), c.hits.length ? h('span', null, badge(`${num(c.hits.length)}টি চিহ্নিত শব্দ`, 'warn')) : null), sortable: false },
        { key: 'user', label: 'কে', render: c => who(c.user), sort: c => c.user.name },
        { key: 'post', label: 'পোস্ট', render: c => h('span', 'mono', '#' + c.post), sort: c => c.post },
        { key: 'created', label: 'কখন', render: c => when(c.created), sort: c => c.created }
      ],
      load: async ({ q }) => { const r = await api('comments2' + (flagged ? '?flagged=1' : '')); words = r.words; const rows = q ? r.rows.filter(c => c.body.includes(q) || c.user.name.toLowerCase().includes(q.toLowerCase())) : r.rows; return { rows, total: rows.length, next: 0 }; },
      actions: c => [button('সরান', { small: true, kind: 'ghost', onClick: () => removeIt('comment', [c], { after: () => table.reload() }) })],
      bulk: [{ text: 'সরান', ic: 'x', danger: true, run: rows => removeIt('comment', rows, { after: () => table.reload() }) }],
      emptyText: flagged ? 'কোনো চিহ্নিত মন্তব্য নেই।' : 'এখনো কোনো মন্তব্য নেই।'
    });
    holder.replaceChildren(t, table);
  }
  draw();
  return {};
}

function sounds(box) {
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'সাউন্ড'), h('p', 'muted', 'রিলের জন্য আপলোড করা সাউন্ড। কপিরাইটের গান সরালে যেসব পোস্টে ব্যবহার হয়েছে, সেখান থেকেও উঠে যায় — সংখ্যাটা আগে দেখানো হয়।'))), holder);
  const table = dataTable({
    page: 'sounds', search: 'নাম বা কে',
    columns: [
      { key: 'title', label: 'সাউন্ড', render: s => { const a = attrs(h('audio'), { src: s.src, controls: '', preload: 'none' }); return h('div', 'cell-t', h('b', null, s.title), a); }, sort: s => s.title },
      { key: 'user', label: 'কে আপলোড করেছেন', render: s => who(s.user), sort: s => s.user.name },
      { key: 'uses', label: 'ব্যবহার', render: s => num(s.uses), sort: s => s.uses, cls: 'num' },
      { key: 'secs', label: 'দৈর্ঘ্য', render: s => `${num(s.secs)} সে.`, sort: s => s.secs, cls: 'num' },
      { key: 'created', label: 'কখন', render: s => when(s.created), sort: s => s.created }
    ],
    load: async ({ q }) => { const { rows } = await api('sounds2'); const r = q ? rows.filter(s => s.title.includes(q) || s.user.name.includes(q)) : rows; return { rows: r, total: r.length, next: 0 }; },
    actions: s => [button('সরান', { small: true, kind: 'ghost', onClick: () => removeIt('sound', [s], { extra: s.uses ? `${num(s.uses)}টি পোস্ট থেকেও এই সাউন্ড উঠে যাবে।` : 'কোনো পোস্টে ব্যবহার হয়নি।', reasons: undefined, after: () => table.reload() }) })],
    emptyText: 'এখনো কেউ সাউন্ড আপলোড করেননি।'
  });
  holder.append(table);
  return {};
}

function groups(box) {
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'গ্রুপ'), h('p', 'muted', 'গ্রুপের নাম, সদস্য আর মেসেজের সংখ্যা — মেসেজ পড়া যায় না। বন্ধ করলে সব মেসেজ মুছে যায়।'))), holder);
  const table = dataTable({
    page: 'groups', search: 'গ্রুপের নাম',
    columns: [
      { key: 'name', label: 'গ্রুপ', render: g => h('b', null, g.name || `গ্রুপ #${num(g.id)}`), sort: g => g.name },
      { key: 'owner', label: 'বানিয়েছেন', render: g => g.owner || '—', sort: g => g.owner },
      { key: 'members', label: 'সদস্য', render: g => num(g.members), sort: g => g.members, cls: 'num' },
      { key: 'messages', label: 'মেসেজ (সংখ্যা)', render: g => num(g.messages), sort: g => g.messages, cls: 'num' },
      { key: 'call', label: 'কল', render: g => g.call ? badge(`চলছে · ${num(g.call)} জন`, 'ok') : '—', sort: g => g.call },
      { key: 'active', label: 'শেষ সক্রিয়', render: g => when(g.active), sort: g => g.active }
    ],
    load: async ({ q }) => { const { rows } = await api('groups2'); const r = q ? rows.filter(g => (g.name || '').includes(q)) : rows; return { rows: r, total: r.length, next: 0 }; },
    actions: g => [button('বন্ধ করুন', { small: true, kind: 'ghost', onClick: () => removeIt('group', [g], { extra: `${num(g.members)} জন সদস্য বেরিয়ে যাবেন, ${num(g.messages)}টি মেসেজ মুছে যাবে।`, after: () => table.reload() }) })],
    emptyText: 'এখনো কোনো গ্রুপ নেই।'
  });
  holder.append(table);
  return {};
}
