// ব্যবহারকারী: the list, and one person in full (৩৬০) — summary and risk, activity timeline, content, security
// (devices, sign out one or all, possibly linked accounts), reports and restrictions, contributions, earnings, team notes.
// Every action asks for what its tier needs and is written to the log. E-mails stay masked until "দেখান".
import { api, can, errText, session } from '../api.js';
import { attrs, avatar, badge, button, closeDrawer, confirmAction, dot, empty, errorBox, field, h, icon, menu, modal, openDrawer, select, skeleton, tabs, toast, when, REASONS } from '../ui.js';
import { dataTable } from '../table.js';
import { full, num, taka } from '../fmt.js';

const STATUS = { active: ['সক্রিয়', 'ok'], restricted: ['সীমিত', 'warn'], banned: ['বন্ধ', 'danger'], deleted: ['মোছা (৩০ দিন)', 'danger'] };
const ROLE = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', support: 'Support', data_editor: 'Data Editor', finance: 'Finance', viewer: 'Viewer' };
const riskTone = r => r >= 60 ? 'danger' : r >= 30 ? 'warn' : '';

export async function render(box, { params, go }) {
  let tab = 'all';
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'ব্যবহারকারী'), h('p', 'muted', 'নাম, @username, ই-মেইল বা ID দিয়ে খুঁজুন। ব্যক্তিগত মেসেজ এখানে কখনো দেখা যায় না — শুধু সংখ্যা।'))), holder);
  let table;
  function draw() {
    const t = tabs([['all', 'সবাই'], ['new', 'এই সপ্তাহে নতুন'], ['team', 'টিম'], ['banned', 'বন্ধ'], ['risky', 'ঝুঁকিপূর্ণ'], ['deleted', 'মোছা']], tab, v => { tab = v; draw(); });
    table = dataTable({
      page: 'users', search: 'নাম, @username, ই-মেইল বা #ID',
      columns: [
        { key: 'name', label: 'ব্যবহারকারী', render: u => h('div', 'person', avatar(u), h('div', 't', h('b', null, u.name, u.verified ? icon('checkc', 'vbadge') : null), h('span', null, '@' + u.username))), sort: u => u.name },
        { key: 'email', label: 'ই-মেইল', render: u => h('span', 'mono', u.email), sortable: false },
        { key: 'role', label: 'ভূমিকা', render: u => u.role ? badge(ROLE[u.role] || u.role, 'info') : h('span', 'muted', '—'), sort: u => u.role },
        { key: 'status', label: 'অবস্থা', render: u => badge(...STATUS[u.status]), sort: u => u.status },
        { key: 'creator', label: 'ক্রিয়েটর', render: u => u.creator === 'approved' ? badge('ক্রিয়েটর', 'brand') : u.creator === 'applied' ? badge('আবেদন', 'warn') : '—', hide: true },
        { key: 'created', label: 'যোগদান', render: u => when(u.created), sort: u => u.created },
        { key: 'seen', label: 'শেষ সক্রিয়', render: u => when(u.seen), sort: u => u.seen || 0 },
        { key: 'posts', label: 'পোস্ট', render: u => num(u.posts), sort: u => u.posts, cls: 'num' },
        { key: 'followers', label: 'ফলোয়ার', render: u => num(u.followers), sort: u => u.followers, cls: 'num', hide: true },
        { key: 'risk', label: 'ঝুঁকি', render: u => u.risk ? badge(num(u.risk), riskTone(u.risk)) : h('span', 'muted', '০'), sort: u => u.risk }
      ],
      load: async ({ cursor, limit, q }) => api(`users?tab=${tab}&limit=${limit}${cursor ? '&cursor=' + cursor : ''}${q ? '&q=' + encodeURIComponent(q) : ''}`),
      onOpen: u => go('#/users/' + u.id),
      emptyText: 'এই খোঁজে কাউকে পাওয়া যায়নি।'
    });
    holder.replaceChildren(t, table);
  }
  draw();

  // ---- one person ----
  let openId = 0, view = 'summary';
  async function show(id, keepView) {
    openId = Number(id);
    if (!keepView) view = 'summary';
    const body = h('div', 'u360', skeleton(5));
    const rows = table.rows(), i = rows.findIndex(r => String(r.id) === String(id));
    const d0 = openDrawer({ title: 'ব্যবহারকারী', body, wide: true, ref: 'user:' + id, prev: i > 0 ? () => go('#/users/' + rows[i - 1].id) : null, next: i >= 0 && i < rows.length - 1 ? () => go('#/users/' + rows[i + 1].id) : null });
    let d;
    try { d = await api('user?id=' + id); } catch (e) { body.replaceChildren(errorBox(e, () => show(id))); return; }
    if (openId !== Number(id)) return;
    const u = d.user;
    d0.querySelector('.drawer-head h2').textContent = u.name;
    // the head: who, status, and the actions
    const emailEl = h('span', 'mono', u.email);
    const reveal = can('pii.unmask') || can('pii.unmask.ticket') ? button('দেখান', { small: true, kind: 'ghost', ic: 'eye', onClick: async () => { try { emailEl.textContent = (await api('pii', { user: u.id, kind: 'email', reason: 'user360' })).value; toast('দেখানো হলো — খতিয়ানে লেখা থাকল।'); } catch (e) { toast(errText(e), { bad: true }); } } }) : null;
    const head = h('div', 'u-head', avatar(u, 'lg'), h('div', 'u-id', h('h2', null, u.name, u.verified ? icon('checkc', 'vbadge') : null), h('span', 'muted', `@${u.username} · ID ${num(u.id)}`), h('div', 'kv', emailEl, reveal),
      h('div', 'badges', badge(...STATUS[u.status]), d.online ? h('span', 'hp', dot('live'), 'এখন অনলাইন') : h('span', 'muted small', 'শেষ সক্রিয় ', when(u.seen)), u.role ? badge(ROLE[u.role] || u.role, 'info') : null,
        u.twofa ? badge('টু-স্টেপ চালু', 'ok') : null, u.creator === 'approved' ? badge('ক্রিয়েটর', 'brand') : null)),
      h('div', 'u-acts', actionsMenu(u, d)));
    const views = [['summary', 'সারসংক্ষেপ'], ['activity', 'কার্যক্রম'], ['content', 'কনটেন্ট', d.counts.posts], ['security', 'নিরাপত্তা', d.sessions.length], ['reports', 'রিপোর্ট ও সীমা', d.reports.about.length],
      ['contrib', 'অবদান'], ...(d.money ? [['money', 'আয়']] : []), ['notes', 'নোট', d.notes.length]];
    const pane = h('div', 'u-pane');
    const t = tabs(views, view, v => { view = v; t.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.textContent.startsWith(views.find(x => x[0] === v)[1]))); paintPane(); });
    function paintPane() { pane.replaceChildren(PANES[view](u, d)); }
    body.replaceChildren(head, t, pane);
    paintPane();
  }
  const PANES = {
    summary: (u, d) => h('div', 'stack',
      h('div', 'risk ' + riskTone(u.risk), h('b', null, `ঝুঁকি স্কোর ${num(u.risk)}`), h('span', null, u.riskWhy.length ? u.riskWhy.join(' · ') : 'কোনো সংকেত নেই')),
      h('div', 'stat-grid', ...[['বন্ধু', d.counts.friends], ['ফলোয়ার', d.counts.followers], ['পোস্ট', d.counts.posts], ['মন্তব্য', d.counts.comments], ['পাঠানো মেসেজ (সংখ্যা)', d.counts.messages], ['গ্রুপ', d.counts.groups], ['পয়েন্ট', u.points]]
        .map(([l, v]) => h('div', 'stat', h('b', null, num(v)), h('span', null, l)))),
      h('div', 'kv', h('span', null, 'যোগ দিয়েছেন'), h('b', null, full(u.created))), u.bio ? h('div', 'kv', h('span', null, 'বায়ো'), h('b', null, u.bio)) : null,
      u.deletedAt ? h('div', 'banner warn', icon('alert'), h('span', null, `মোছা হয়েছে ${full(u.deletedAt)} — ৩০ দিন পরে সব চিরতরে চলে যাবে। এর আগে ফেরানো যায়।`)) : null),
    activity: (u, d) => d.timeline.length ? h('div', 'timeline', ...d.timeline.map(e => h('div', 'tl-row ' + e.kind, h('span', 'tl-dot'), h('div', 't', h('b', null, e.text)), when(e.at)))) : empty('কোনো কার্যক্রম নেই।'),
    content: (u, d) => d.content.length ? h('div', 'media-grid', ...d.content.map(p => h('div', 'media-tile', p.kind === 'text' ? h('div', 'ptext', p.caption) : blurred(p), h('small', 'muted', `#${num(p.id)} · `, when(p.created))))) : empty('কোনো পোস্ট নেই।'),
    security: (u, d) => h('div', 'stack',
      h('h3', null, 'যেসব ডিভাইসে লগইন আছে'),
      d.sessions.length ? h('div', 'card flush', ...d.sessions.map(s => h('div', 'feed-row pad', icon(/Android|iPhone|iPad/.test(s.agent) ? 'dot' : 'server'), h('div', 't', h('b', null, s.agent || 'ডিভাইস'), h('span', 'muted', `IP ${s.ip || '—'} · লগইন ${s.made ? full(s.made) : '—'}`)), when(s.last),
        can('users.ban') && u.id !== session.me.user.id ? button('লগআউট', { small: true, kind: 'ghost', onClick: () => act('user/signout', { user: u.id, session: s.id }, 'ওই ডিভাইস থেকে লগআউট হলো।') }) : null))) : empty('কোথাও লগইন নেই।'),
      h('h3', null, 'সম্ভাব্য সংযুক্ত অ্যাকাউন্ট'),
      h('p', 'hint', 'একই নেটওয়ার্ক আর একই ধরনের ডিভাইস থেকে লগইন — প্রমাণ নয়, একই ওয়াই-ফাইয়ে অনেকে থাকতে পারেন।'),
      d.linked.length ? h('div', 'stack', ...d.linked.map(l => { const r = h('div', 'feed-row click', h('div', 'person', avatar(l), h('div', 't', h('b', null, l.name), h('span', null, '@' + l.username))), l.banned ? badge('বন্ধ', 'danger') : null); r.addEventListener('click', () => go('#/users/' + l.id)); return r; })) : h('p', 'muted', 'কিছু পাওয়া যায়নি।')),
    reports: (u, d) => h('div', 'stack',
      h('h3', null, `তাঁর বিরুদ্ধে রিপোর্ট (${num(d.reports.about.length)})`), reportList(d.reports.about, 'by'),
      h('h3', null, `তিনি রিপোর্ট করেছেন (${num(d.reports.by.length)})`), reportList(d.reports.by, 'about'),
      h('h3', null, 'সীমা'), d.restrictions.length ? h('div', 'stack', ...d.restrictions.map(r => h('div', 'feed-row', h('div', 't', h('b', null, `${r.kind === 'post' ? 'পোস্ট' : 'মেসেজ'} বন্ধ · ${REASONS.find(x => x[0] === r.reason)?.[1] || r.reason}`), h('span', 'muted', `${r.by || 'টিম'} · শেষ ${full(r.until)}`)),
        r.lifted ? badge('তুলে নেওয়া', '') : r.until > Date.now() ? (can('users.restrict') ? button('তুলে নিন', { small: true, onClick: () => act('user/unrestrict', { id: r.id }, 'সীমা তুলে নেওয়া হলো।') }) : badge('চলছে', 'warn')) : badge('শেষ', '')))) : h('p', 'muted', 'কখনো সীমিত করা হয়নি।'),
      strikesBox(u)),
    contrib: (u, d) => h('div', 'stack', h('div', 'stat-grid', ...[['পয়েন্ট', u.points], ['জানানো ভাড়া', d.contributions.fares.length], ['স্টপের ভাড়া', d.contributions.stopFares], ['রেটিং', d.contributions.ratings], ['জায়গার ছবি', d.contributions.photos], ['মেঠোপথ', d.contributions.gems]]
      .map(([l, v]) => h('div', 'stat', h('b', null, num(v)), h('span', null, l)))),
      d.contributions.fares.length ? h('div', 'card flush', ...d.contributions.fares.map(f => h('div', 'feed-row pad', h('div', 't', h('b', null, `${f.flabel} → ${f.tlabel}`), h('span', 'muted', `৳${num(f.fare)} · ${f.mode}`)), f.ok ? badge('অনুমোদিত', 'ok') : badge('অপেক্ষায়', 'warn'), when(f.created)))) : null),
    money: (u, d) => h('div', 'stack', h('div', 'stat-grid', h('div', 'stat', h('b', null, taka(d.money.earned)), h('span', null, 'মোট আয়'))),
      d.money.payouts.length ? h('div', 'card flush', ...d.money.payouts.map(p => h('div', 'feed-row pad', h('div', 't', h('b', null, taka(p.amount)), h('span', 'muted', `${p.method}${p.ref ? ' · ' + p.ref : ''}`)), badge({ pending: 'অনুমোদন বাকি', approved: 'অনুমোদিত, পাঠানো বাকি', paid: 'পাঠানো', rejected: 'বাতিল' }[p.status] || p.status, p.status === 'paid' ? 'ok' : p.status === 'rejected' ? '' : 'warn'), when(p.created)))) : empty('কোনো পেআউট নেই।')),
    notes: (u, d) => {
      const ta = attrs(h('textarea', 'input'), { rows: '3', maxlength: '1000', placeholder: 'টিমের জন্য নোট (ব্যবহারকারী দেখবেন না)' });
      return h('div', 'stack', h('div', 'composer', ta, button('নোট রাখুন', { kind: 'primary', small: true, onClick: () => { if (ta.value.trim()) act('user/note', { user: u.id, body: ta.value }, 'নোট রাখা হলো।'); } })),
        ...d.notes.map(n => h('div', 'tmsg note', h('small', null, `${n.name || 'টিম'} · `, when(n.at)), h('p', null, n.body))), d.notes.length ? null : h('p', 'muted', 'এখনো কোনো নোট নেই।'));
    }
  };
  // strikes, removals and appeals (phase 4), loaded when this tab opens
  function strikesBox(u) {
    const box = h('div', 'stack', h('h3', null, 'স্ট্রাইক'), skeleton(2));
    api('strikes/user?id=' + u.id).then(d => {
      const OUT = o => o === 'ban' ? 'অ্যাকাউন্ট বন্ধ' : o.startsWith('restrict:') ? `${num(Number(o.split(':')[1]))} দিন পোস্ট বন্ধ` : 'সতর্কবার্তা';
      const active = d.strikes.filter(s => s.active).length;
      box.replaceChildren(h('h3', null, `স্ট্রাইক — চালু ${num(active)}টি`),
        d.strikes.length ? h('div', 'stack', ...d.strikes.map(s => h('div', 'feed-row', h('div', 't', h('b', null, `${REASONS.find(x => x[0] === s.reason)?.[1] || s.reason} · ${OUT(s.outcome)}`),
          h('span', 'muted', `${s.by.name || 'টিম'} · মেয়াদ ${full(s.expires)}${s.appeal ? ' · আপিল: ' + ({ open: 'অপেক্ষায়', upheld: 'বহাল', overturned: 'বাতিল' })[s.appeal.status] : ''}`)),
          s.revoked ? badge('বাতিল', '') : s.active ? badge('চালু', 'danger') : badge('মেয়াদ শেষ', ''), when(s.made)))) : h('p', 'muted', 'কোনো স্ট্রাইক নেই।'),
        h('h3', null, `সরানো কনটেন্ট (${num(d.removals.length)})`),
        d.removals.length ? h('div', 'stack', ...d.removals.map(r => h('div', 'feed-row', h('div', 't', h('b', null, `${r.type === 'post' ? 'পোস্ট' : 'মন্তব্য'} · ${REASONS.find(x => x[0] === r.reason)?.[1] || r.reason}`), h('span', 'muted', `${r.snippet || '—'} · ${r.by || 'টিম'}`)), when(r.made)))) : h('p', 'muted', 'কিছু সরানো হয়নি।'),
        h('p', 'hint', 'নীতি: ', d.policy.steps.map((s, i) => `${num(i + 1)}ম: ${OUT(s)}`).join(' · '), ` · ${num(d.policy.expireDays)} দিনে স্ট্রাইকের মেয়াদ শেষ`));
    }).catch(e => box.replaceChildren(errorBox(e)));
    return box;
  }
  async function strike(u) {
    let next;
    try { next = await api('strikes/next?user=' + u.id); } catch (e) { toast(errText(e), { bad: true }); return; }
    const what = next.step === 'ban' ? 'অ্যাকাউন্ট বন্ধ হবে' : next.step.startsWith('restrict:') ? `${num(Number(next.step.split(':')[1]))} দিন পোস্ট, স্টোরি ও মন্তব্য বন্ধ থাকবে` : 'শুধু সতর্কবার্তা যাবে';
    const ok = await confirmAction({ tier: 2, title: `${u.name}-কে স্ট্রাইক দেবেন?`, text: `এটা হবে তাঁর ${num(next.number)}ম চালু স্ট্রাইক — নীতি অনুযায়ী ${what}।`, preview: 'আপনার অ্যাকাউন্টে একটি স্ট্রাইক দেওয়া হয়েছে — কারণ ও আপিলের সুযোগ নোটিফিকেশনে।', confirmText: 'স্ট্রাইক দিন' });
    if (ok) act('strikes/give', { user: u.id, ...ok, source: 'user360' }, 'স্ট্রাইক দেওয়া হলো — তিনি নোটিফিকেশনে কারণ দেখবেন।');
  }
  function reportList(list, who) {
    if (!list.length) return h('p', 'muted', 'নেই।');
    return h('div', 'stack', ...list.map(r => h('div', 'feed-row', h('div', 't', h('b', null, r.reason), h('span', 'muted', `${r[who] || '—'} · ${r.status === 'open' ? 'খোলা' : r.outcome === 'dismissed' ? 'ব্যবস্থা লাগেনি' : r.outcome === 'actioned' ? 'ব্যবস্থা নেওয়া হয়েছে' : 'দেখা হয়েছে'}`)), when(r.made))));
  }
  // a photo or video, blurred until clicked (reports may hold what no one wants to see by surprise)
  function blurred(p) {
    const m = p.kind === 'video' ? attrs(h('video'), { src: p.src, poster: p.poster || null, muted: '', preload: 'none', playsinline: '' }) : attrs(h('img'), { src: p.src, alt: '', loading: 'lazy' });
    const wrap = h('div', 'blur', m, h('span', 'blur-hint', icon('eye'), 'দেখতে চাপুন'));
    wrap.addEventListener('click', () => { wrap.classList.add('shown'); if (m.tagName === 'VIDEO') { m.muted = true; m.controls = true; m.play().catch(() => {}); } }, { once: true });
    return wrap;
  }
  async function act(path, data, done, undo) {
    try { await api(path, data); toast(done, undo ? { undo } : {}); table.reload(); if (openId) show(openId, true); return true; }
    catch (e) { toast(errText(e), { bad: true }); return false; }
  }
  function actionsMenu(u, d) {
    const items = [];
    const self = u.id === session.me.user.id;
    if (can('users.verify')) items.push({ text: u.verified ? 'ব্যাজ সরান' : 'ভেরিফায়েড ব্যাজ দিন', ic: 'checkc', run: async () => {
      const ok = await confirmAction({ tier: 2, title: u.verified ? 'ব্যাজ সরাবেন?' : 'ব্যাজ দেবেন?', danger: u.verified, reasons: [['identity', 'পরিচয় যাচাই হয়েছে'], ['public', 'পরিচিত ব্যক্তি/প্রতিষ্ঠান'], ['impersonation', 'ছদ্মবেশ'], ['other', 'অন্য']], confirmText: u.verified ? 'সরান' : 'দিন' });
      if (ok) act('user/verify', { user: u.id, on: !u.verified, ...ok }, u.verified ? 'ব্যাজ সরানো হলো।' : 'ব্যাজ দেওয়া হলো।');
    } });
    if (can('users.restrict') && !self) items.push({ text: 'সীমিত করুন…', ic: 'clock', run: () => restrict(u) });
    if (can('content.remove') && !self && !u.role) items.push({ text: 'স্ট্রাইক দিন…', ic: 'strike', run: () => strike(u) });
    if (can('users.ban') && !self) {
      items.push({ text: u.banned && !u.deletedAt ? 'অ্যাকাউন্ট চালু করুন' : 'অ্যাকাউন্ট বন্ধ করুন', ic: 'shield', danger: !u.banned, run: async () => {
        if (u.banned) { const ok = await confirmAction({ tier: 2, title: 'অ্যাকাউন্ট আবার চালু করবেন?', danger: false, reasons: null, confirmText: 'চালু করুন' }); if (ok) act('user/ban', { user: u.id, on: false, ...ok }, 'অ্যাকাউন্ট চালু হলো।'); return; }
        const ok = await confirmAction({ tier: 2, title: `${u.name}-এর অ্যাকাউন্ট বন্ধ করবেন?`, text: 'তিনি সঙ্গে সঙ্গে সব ডিভাইস থেকে বেরিয়ে যাবেন আর লগইন করতে পারবেন না।', preview: 'আপনার অ্যাকাউন্টটি Manzeela-র নিয়ম ভাঙার জন্য বন্ধ করা হয়েছে। ভুল মনে হলে help@manzeela.com-এ লিখুন।', confirmText: 'বন্ধ করুন' });
        if (ok) act('user/ban', { user: u.id, on: true, ...ok }, 'অ্যাকাউন্ট বন্ধ হলো।');
      } });
      items.push({ text: 'সব ডিভাইস থেকে লগআউট', ic: 'logout', run: async () => { const ok = await confirmAction({ tier: 2, title: 'সব ডিভাইস থেকে লগআউট করাবেন?', danger: false, reasons: [['security', 'নিরাপত্তা'], ['request', 'তাঁর অনুরোধে'], ['other', 'অন্য']], confirmText: 'লগআউট' }); if (ok) act('user/signout', { user: u.id }, 'সব ডিভাইস থেকে লগআউট হলো।'); } });
    }
    if (can('team.manage') && !self) items.push({ text: 'ভূমিকা বদলান (টিম পাতা)', ic: 'key', run: () => go('#/team') });
    if (can('users.delete') && !self) items.push('-', u.deletedAt
      ? { text: 'অ্যাকাউন্ট ফিরিয়ে আনুন', ic: 'undo', run: async () => { const ok = await confirmAction({ tier: 2, title: 'অ্যাকাউন্ট ফিরিয়ে আনবেন?', danger: false, reasons: null, confirmText: 'ফিরিয়ে আনুন' }); if (ok) act('user/restore', { user: u.id }, 'অ্যাকাউন্ট ফেরানো হলো।'); } }
      : { text: 'অ্যাকাউন্ট মুছে ফেলুন…', ic: 'x', danger: true, run: async () => {
        const ok = await confirmAction({ tier: 3, title: `${u.name}-এর অ্যাকাউন্ট মুছবেন?`, text: 'অ্যাকাউন্ট এখনই বন্ধ হবে; ৩০ দিন পরে প্রোফাইল, পোস্ট, মেসেজসহ সব চিরতরে মুছে যাবে। এর আগে ফেরানো যায়।', word: u.username, confirmText: 'মুছুন' });
        if (ok) act('user/delete', { user: u.id, ...ok }, 'অ্যাকাউন্ট মোছা হলো — ৩০ দিন পরে সব চলে যাবে।');
      } });
    if (!items.length) return null;
    const b = button('কাজ', { ic: 'more', onClick: e => menu(e.currentTarget, items) });
    return b;
  }
  function restrict(u) {
    const kind = select([['post', 'পোস্ট, স্টোরি ও মন্তব্য বন্ধ'], ['message', 'মেসেজ বন্ধ']], 'post'), days = select([['1', '১ দিন'], ['3', '৩ দিন'], ['7', '৭ দিন'], ['14', '১৪ দিন'], ['30', '৩০ দিন']], '7');
    const mm = modal({ title: 'সীমিত করুন', body: h('div', 'confirm', h('p', 'lead', 'পুরো ব্যানের নরম বিকল্প: নির্দিষ্ট কয়েক দিন শুধু একটা জিনিস বন্ধ থাকে।'), field('কী বন্ধ থাকবে', kind), field('কত দিন', days)),
      actions: [button('বাতিল', { kind: 'ghost', onClick: () => mm.close() }), button('পরের ধাপ', { kind: 'primary', onClick: async () => {
        mm.close();
        const ok = await confirmAction({ tier: 2, title: `${u.name} — ${kind.selectedOptions[0].textContent}, ${days.selectedOptions[0].textContent}`, preview: 'নিয়ম ভাঙার জন্য আপনার অ্যাকাউন্ট কিছুদিনের জন্য সীমিত করা হয়েছে।', confirmText: 'সীমিত করুন' });
        if (ok) act('user/restrict', { user: u.id, kind: kind.value, days: Number(days.value), ...ok }, 'সীমিত করা হলো।');
      } })] });
  }
  if (params[0]) setTimeout(() => show(params[0]), 300);
  return { onParams: p => { if (p[0]) show(p[0]); else { openId = 0; closeDrawer(); } }, key: e => table.keyHandler(e) };
}
