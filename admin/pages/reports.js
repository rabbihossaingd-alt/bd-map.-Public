// রিপোর্ট: reports as cases — every open report about one person together ("৫টি রিপোর্ট" is one case), with the
// reporters' records, the reported posts (blurred until clicked), and the person's history. Actions: no action needed
// (with an undo), remove a post, restrict, close the account. Strikes come in phase 4.
import { api, can, errText, session } from '../api.js';
import { attrs, avatar, badge, button, closeDrawer, confirmAction, empty, errorBox, field, h, icon, modal, openDrawer, select, skeleton, tabs, toast, when } from '../ui.js';
import { dataTable } from '../table.js';
import { full, num } from '../fmt.js';

export async function render(box, { params, go }) {
  let status = 'open', cases = [];
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'রিপোর্ট'), h('p', 'muted', 'একজন মানুষের বিরুদ্ধে সব রিপোর্ট একসাথে একটা কেস হিসেবে। ঝুঁকির শব্দ (হুমকি, নাবালক…) থাকলে কেসটা P1।'))), holder);
  let table;
  function draw() {
    const t = tabs([['open', 'দেখা বাকি'], ['all', 'সব']], status, v => { status = v; draw(); });
    table = dataTable({
      page: 'reports', search: 'নাম বা কারণ দিয়ে খুঁজুন', rowKey: c => c.about,
      columns: [
        { key: 'target', label: 'কার বিরুদ্ধে', render: c => c.target ? h('div', 'person', avatar(c.target), h('div', 't', h('b', null, c.target.name), h('span', null, '@' + c.target.username))) : h('span', 'muted', 'মুছে ফেলা অ্যাকাউন্ট'), sort: c => c.target ? c.target.name : '' },
        { key: 'count', label: 'রিপোর্ট', render: c => h('b', null, `${num(c.count)}টি` + (c.open && c.open < c.count ? ` (খোলা ${num(c.open)})` : '')), sort: c => c.count },
        { key: 'priority', label: 'প্রায়োরিটি', render: c => badge(c.priority, c.priority === 'P1' ? 'danger' : c.priority === 'P2' ? 'warn' : ''), sort: c => c.priority },
        { key: 'why', label: 'কারণ', render: c => h('span', 'clip', c.reports.map(r => r.reason).join(' · ')), sortable: false },
        { key: 'posts', label: 'পোস্ট', render: c => c.posts.length ? num(c.posts.length) : '—', sort: c => c.posts.length },
        { key: 'assignee', label: 'কার কাছে', render: c => c.assignee ? badge(c.assignee.name, c.assignee.id === session.me.user.id ? 'brand' : 'info') : h('span', 'muted', '—') },
        { key: 'first', label: 'প্রথম রিপোর্ট', render: c => when(c.first), sort: c => c.first }
      ],
      load: async ({ q }) => {
        cases = (await api('reports2?status=' + status)).cases;
        const rows = q ? cases.filter(c => (c.target && (c.target.name + ' ' + c.target.username).toLowerCase().includes(q.toLowerCase())) || c.reports.some(r => r.reason.includes(q))) : cases;
        return { rows, total: rows.length, next: 0 };
      },
      onOpen: c => go('#/reports/' + c.about),
      emptyText: status === 'open' ? 'কোনো রিপোর্ট বাকি নেই — সাবাস' : 'কোনো রিপোর্ট নেই।'
    });
    holder.replaceChildren(t, table);
  }
  draw();

  let openId = 0;
  function show(about) {
    openId = Number(about);
    const rows = table.rows(), i = rows.findIndex(c => String(c.about) === String(about)), c = rows[i] || cases.find(x => String(x.about) === String(about));
    if (!c) { setTimeout(() => { if (openId === Number(about)) { const again = cases.find(x => String(x.about) === String(about)); if (again) show(about); } }, 600); return; }
    const tg = c.target;
    const body = h('div', 'stack',
      tg ? h('div', 'u-head', avatar(tg, 'lg'), h('div', 'u-id', h('h2', null, tg.name), h('span', 'muted', `@${tg.username} · যোগ দিয়েছেন `, when(tg.created)),
        h('div', 'badges', badge(c.priority, c.priority === 'P1' ? 'danger' : c.priority === 'P2' ? 'warn' : ''), tg.banned ? badge('বন্ধ', 'danger') : tg.status === 'restricted' ? badge('সীমিত', 'warn') : null,
          badge(`আগের রিপোর্ট ${num(tg.previous)}`, tg.previous ? 'warn' : ''), badge(`আগে সীমিত ${num(tg.restrictions)} বার`, tg.restrictions ? 'warn' : ''))),
        can('users.view') ? attrs(h('a', 'btn secondary sm', 'পুরো প্রোফাইল'), { href: '#/users/' + tg.id }) : null) : h('p', 'muted', 'অ্যাকাউন্টটি আর নেই।'),
      h('h3', null, `রিপোর্টগুলো (${num(c.count)})`),
      h('div', 'stack', ...c.reports.map(r => h('div', 'report-row' + (r.status === 'open' ? '' : ' done'), h('p', null, r.reason),
        h('small', 'muted', `${r.reporter.name || 'মুছে ফেলা অ্যাকাউন্ট'} · মোট ${num(r.reporter.total)}টি রিপোর্ট করেছেন${r.reporter.total > 1 ? ` (ব্যবস্থা ${num(r.reporter.acted)}, লাগেনি ${num(r.reporter.dismissed)})` : ''} · `, when(r.made)),
        r.status !== 'open' ? badge(r.outcome === 'dismissed' ? 'ব্যবস্থা লাগেনি' : 'ব্যবস্থা নেওয়া হয়েছে', '') : null))),
      c.posts.length ? h('h3', null, 'রিপোর্ট করা পোস্ট') : null,
      c.posts.length ? h('div', 'media-grid', ...c.posts.map(p => h('div', 'media-tile', p.kind === 'text' ? h('div', 'ptext', p.caption) : blurred(p), h('small', 'muted', `পোস্ট #${num(p.id)}`),
        can('content.remove') && c.open ? button('পোস্টটি সরান', { small: true, kind: 'danger', onClick: () => resolve(c, 'remove', { post: p.id }) }) : null))) : null);
    const foot = c.open ? [
      button('ব্যবস্থা লাগবে না', { onClick: () => resolve(c, 'dismiss') }),
      can('users.restrict') && tg ? button('সীমিত করুন…', { onClick: () => restrict(c) }) : null,
      can('users.ban') && tg && !tg.banned ? button('অ্যাকাউন্ট বন্ধ', { kind: 'danger', onClick: () => resolve(c, 'ban') }) : null,
      attrs(button('স্ট্রাইক দিন', { kind: 'ghost' }), { disabled: '', title: 'ফেজ ৪-এ আসছে' }),
      h('span', 'grow'),
      button(c.assignee && c.assignee.id === session.me.user.id ? 'ছেড়ে দিন' : 'আমি নিচ্ছি', { kind: 'ghost', onClick: async () => { try { await api('inbox/assign', { type: 'report', ref: c.about, to: c.assignee && c.assignee.id === session.me.user.id ? 'none' : 'me', force: true }); table.reload(); setTimeout(() => show(c.about), 500); } catch (e) { toast(errText(e), { bad: true }); } } })
    ].filter(Boolean) : null;
    openDrawer({ title: `কেস · ${tg ? tg.name : '#' + c.about}`, body, foot, wide: true, ref: 'report:' + c.about,
      prev: i > 0 ? () => go('#/reports/' + rows[i - 1].about) : null, next: i >= 0 && i < rows.length - 1 ? () => go('#/reports/' + rows[i + 1].about) : null });
  }
  function blurred(p) {
    const m = p.kind === 'video' ? attrs(h('video'), { src: p.src, poster: p.poster || null, preload: 'none', playsinline: '' }) : attrs(h('img'), { src: p.src, alt: '', loading: 'lazy' });
    const wrap = h('div', 'blur', m, h('span', 'blur-hint', icon('eye'), 'দেখতে চাপুন'));
    wrap.addEventListener('click', () => { wrap.classList.add('shown'); if (m.tagName === 'VIDEO') { m.muted = true; m.controls = true; m.play().catch(() => {}); } }, { once: true });
    return wrap;
  }
  async function resolve(c, act, extra = {}) {
    let ok = { reason: '', note: '' };
    if (act === 'remove') ok = await confirmAction({ tier: 2, title: 'পোস্টটি সরাবেন?', text: 'পোস্টটি সবার কাছ থেকে চলে যাবে; ওই পোস্টের রিপোর্টগুলো বন্ধ হবে।', preview: 'আপনার একটি পোস্ট Manzeela-র নিয়ম ভাঙার জন্য সরানো হয়েছে।', confirmText: 'সরান' });
    if (act === 'ban') ok = await confirmAction({ tier: 2, title: 'অ্যাকাউন্ট বন্ধ করবেন?', text: 'সঙ্গে সঙ্গে সব ডিভাইস থেকে বেরিয়ে যাবেন; কেসের সব রিপোর্ট বন্ধ হবে।', preview: 'আপনার অ্যাকাউন্টটি Manzeela-র নিয়ম ভাঙার জন্য বন্ধ করা হয়েছে।', confirmText: 'বন্ধ করুন' });
    if (!ok) return;
    try {
      const r = await api('reports/resolve', { about: c.about, do: act, ...extra, ...ok });
      const label = { dismiss: 'রিপোর্টগুলো বন্ধ — ব্যবস্থা লাগেনি।', remove: 'পোস্টটি সরানো হলো।', ban: 'অ্যাকাউন্ট বন্ধ হলো।', restrict: 'সীমিত করা হলো।' }[act];
      toast(label, act === 'dismiss' ? { undo: async () => { await api('reports/resolve', { about: c.about, do: 'reopen', ids: r.closed }); table.reload(); } } : {});
      table.reload(); history.back();
    } catch (e) { toast(errText(e), { bad: true }); }
  }
  function restrict(c) {
    const kind = select([['post', 'পোস্ট, স্টোরি ও মন্তব্য বন্ধ'], ['message', 'মেসেজ বন্ধ']], 'post'), days = select([['1', '১ দিন'], ['3', '৩ দিন'], ['7', '৭ দিন'], ['14', '১৪ দিন'], ['30', '৩০ দিন']], '7');
    const mm = modal({ title: 'সীমিত করুন', body: h('div', 'confirm', field('কী বন্ধ থাকবে', kind), field('কত দিন', days)),
      actions: [button('বাতিল', { kind: 'ghost', onClick: () => mm.close() }), button('পরের ধাপ', { kind: 'primary', onClick: async () => {
        mm.close();
        const ok = await confirmAction({ tier: 2, title: 'সীমিত করবেন?', preview: 'নিয়ম ভাঙার জন্য আপনার অ্যাকাউন্ট কিছুদিনের জন্য সীমিত করা হয়েছে।', confirmText: 'সীমিত করুন' });
        if (!ok) return;
        try { await api('reports/resolve', { about: c.about, do: 'restrict', kind: kind.value, days: Number(days.value), ...ok }); toast('সীমিত করা হলো; কেস বন্ধ।'); table.reload(); history.back(); } catch (e) { toast(errText(e), { bad: true }); }
      } })] });
  }
  if (params[0]) setTimeout(() => show(params[0]), 500);
  return { onParams: p => { if (p[0]) show(p[0]); else { openId = 0; closeDrawer(); } }, key: e => table.keyHandler(e) };
}
