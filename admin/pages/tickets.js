// টিকিট: support conversations. The list (waiting for us / waiting for them / closed), and a ticket in full: the thread
// on the left, a short 360 of the person on the right, a reply box with templates ("/" inserts one, {নাম} fills in),
// internal notes the person never sees, assignment, tags and priority. Closing has an undo.
import { api, can, errText, session } from '../api.js';
import { attrs, avatar, badge, button, closeDrawer, dot, empty, errorBox, h, icon, openDrawer, select, skeleton, tabs, toast, when } from '../ui.js';
import { dataTable } from '../table.js';
import { full, num, waited } from '../fmt.js';

const CAT = { account: 'অ্যাকাউন্ট', fare: 'ভাড়া', route: 'রুটের তথ্য', chat: 'মেসেজ/কল', person: 'অভিযোগ', verify: 'ব্যাজ', other: 'অন্য' };
const STATUS = { open: ['উত্তর বাকি', 'warn'], answered: ['ব্যবহারকারীর উত্তরের অপেক্ষায়', 'info'], closed: ['বন্ধ', ''] };

export async function render(box, { params, go }) {
  let status = 'open';
  const metrics = h('div', 'metrics');
  const holder = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'টিকিট'), h('p', 'muted', 'ব্যবহারকারীদের সাপোর্ট অনুরোধ। উত্তর দিলে তিনি অ্যাপে আর ই-মেইলে পান।')),
    attrs(h('a', 'btn secondary', icon('reply'), h('span', null, 'উত্তর-টেমপ্লেট')), { href: '#/macros' })), metrics, holder);
  api('support/metrics').then(m => metrics.replaceChildren(
    h('div', 'metric', h('b', null, m.firstReply ? waited(m.firstReply) : '—'), h('span', 'muted', 'প্রথম উত্তরের মধ্যমা সময়')),
    h('div', 'metric', h('b', null, m.resolve ? waited(m.resolve) : '—'), h('span', 'muted', 'সমাধানের মধ্যমা সময়')),
    h('div', 'metric', h('b', null, num(m.opened)), h('span', 'muted', 'গত ৩০ দিনে নতুন')),
    h('div', 'metric', h('b', null, m.agents.map(a => `${a.name} ${num(a.n)}`).join(' · ') || '—'), h('span', 'muted', 'কে কতগুলো উত্তর দিয়েছেন (৩০ দিন)')))).catch(() => {});
  let table;
  function draw() {
    const t = tabs([['open', 'উত্তর বাকি'], ['answered', 'ব্যবহারকারীর উত্তরের অপেক্ষায়'], ['closed', 'বন্ধ'], ['all', 'সব']], status, v => { status = v; draw(); });
    table = dataTable({
      page: 'tickets', search: 'বিষয়, নাম বা #নম্বর',
      filters: [{ key: 'cat', label: 'বিষয়', options: Object.entries(CAT) }],
      columns: [
        { key: 'id', label: '#', render: r => h('span', 'mono', '#' + r.id), sort: r => r.id },
        { key: 'subject', label: 'বিষয়', render: r => h('div', 'cell-t', h('b', null, r.subject), h('span', 'muted', `${CAT[r.category] || r.category}${r.tags.length ? ' · ' + r.tags.join(', ') : ''}`)), sort: r => r.subject },
        { key: 'user', label: 'কে', render: r => h('div', 'person', avatar(r.user, 'sm'), h('div', 't', h('b', null, r.user.name))), sort: r => r.user.name },
        { key: 'status', label: 'অবস্থা', render: r => badge(STATUS[r.status][0], STATUS[r.status][1]) },
        { key: 'priority', label: 'প্রায়োরিটি', render: r => r.priority ? badge(r.priority, r.priority === 'P1' ? 'danger' : r.priority === 'P2' ? 'warn' : '') : '—', hide: true },
        { key: 'assignee', label: 'কার কাছে', render: r => r.assignee ? badge(r.assignee.name, r.assignee.id === session.me.user.id ? 'brand' : 'info') : h('span', 'muted', '—') },
        { key: 'updated', label: 'শেষ বদল', render: r => when(r.updated), sort: r => r.updated }
      ],
      load: async ({ cursor, limit, q, filters }) => api(`tickets?status=${status}&limit=${limit}${cursor ? '&cursor=' + cursor : ''}${q ? '&q=' + encodeURIComponent(q) : ''}${filters.cat ? '&cat=' + filters.cat : ''}`),
      onOpen: r => go('#/tickets/' + r.id),
      emptyText: status === 'open' ? 'সব অনুরোধের উত্তর দেওয়া হয়েছে — সাবাস' : 'এখানে কিছু নেই।'
    });
    holder.replaceChildren(t, table);
  }
  draw();

  // ---- a ticket ----
  let openId = 0;
  async function show(id) {
    openId = Number(id);
    const body = h('div', 'ticket-view', skeleton(4));
    const box2 = openDrawer({ title: `টিকিট #${num(id)}`, body, wide: true, ref: 'ticket:' + id, ...stepper(id) });
    let d;
    try { d = await api('ticket?id=' + id); } catch (e) { body.replaceChildren(errorBox(e, () => show(id))); return; }
    if (openId !== Number(id)) return;
    const t = d.ticket, u = d.user;
    box2.querySelector('.drawer-head h2').textContent = `#${num(t.id)} · ${t.subject}`;
    // the thread
    const thread = h('div', 'thread');
    for (const m of d.messages) thread.append(h('div', 'tmsg ' + (m.internal ? 'note' : m.staff ? 'staff' : 'them'),
      h('small', null, `${m.internal ? 'অভ্যন্তরীণ নোট · ' : ''}${m.name || (m.staff ? 'টিম' : 'ব্যবহারকারী')} · `, when(m.sent)), h('p', null, m.body)));
    // the reply box, with templates
    const reply = attrs(h('textarea', 'input'), { rows: '4', maxlength: '3000', placeholder: 'উত্তর লিখুন… ("/" লিখলে টেমপ্লেট)' });
    const internal = attrs(h('input'), { type: 'checkbox' });
    const note = h('label', 'check', internal, ' অভ্যন্তরীণ নোট (ব্যবহারকারী দেখবেন না)');
    internal.addEventListener('change', () => reply.classList.toggle('note', internal.checked));
    let macroUsed = 0;
    const macroBox = h('div', 'macro-pop'); macroBox.hidden = true;
    const first = u ? u.name.split(' ')[0] : '';
    const fillMacro = m => { const at = reply.value.lastIndexOf('/'); reply.value = reply.value.slice(0, at) + m.body.replace(/\{নাম\}/g, first).replace(/\{name\}/gi, first); macroUsed = m.id; macroBox.hidden = true; reply.focus(); };
    reply.addEventListener('input', () => {
      const at = reply.value.lastIndexOf('/'), q = at >= 0 && (at === 0 || /\s/.test(reply.value[at - 1])) ? reply.value.slice(at + 1) : null;
      if (q == null || q.includes('\n') || q.length > 30) { macroBox.hidden = true; return; }
      const hits = d.macros.filter(m => !q || m.title.includes(q) || m.category.includes(q)).slice(0, 6);
      macroBox.replaceChildren(...hits.map(m => { const b = h('button', null, h('b', null, m.title), h('span', 'muted', m.body.slice(0, 60))); b.type = 'button'; b.addEventListener('mousedown', e => { e.preventDefault(); fillMacro(m); }); return b; }));
      macroBox.hidden = !hits.length;
    });
    const send = close => async () => {
      if (!reply.value.trim()) { toast('আগে উত্তরটি লিখুন।', { bad: true }); reply.focus(); return; }
      try { await api('ticket/reply', { id: t.id, body: reply.value, close, internal: internal.checked, macro: macroUsed }); toast(internal.checked ? 'নোট রাখা হলো।' : close ? 'উত্তর পাঠিয়ে বন্ধ করা হলো।' : 'উত্তর পাঠানো হলো — ব্যবহারকারী অ্যাপে ও ই-মেইলে পাবেন।'); table.reload(); show(t.id); }
      catch (e) { toast(errText(e), { bad: true }); }
    };
    const setStatus = async to => {
      try {
        const r = await api('ticket/status', { id: t.id, status: to });
        toast(to === 'closed' ? 'টিকিট বন্ধ করা হলো।' : 'আবার খোলা হলো।', { undo: async () => { await api('ticket/status', { id: t.id, status: r.before }); table.reload(); show(t.id); } });
        table.reload(); show(t.id);
      } catch (e) { toast(errText(e), { bad: true }); }
    };
    const canReply = can('support.reply');
    const composer = canReply ? h('div', 'composer', h('div', 'macro-wrap', reply, macroBox), note,
      h('div', 'row-acts', button('উত্তর পাঠান', { kind: 'primary', onClick: send(false) }), button('উত্তর দিয়ে বন্ধ', { onClick: send(true) }),
        t.status === 'closed' ? button('আবার খুলুন', { kind: 'ghost', onClick: () => setStatus('open') }) : button('উত্তর ছাড়া বন্ধ', { kind: 'ghost', onClick: () => setStatus('closed') }))) : h('p', 'hint', 'উত্তর দেওয়ার অনুমতি আপনার ভূমিকায় নেই।');
    // the side: the person, and the ticket's own settings
    const assignBtn = button(t.assignee ? (t.assignee.id === session.me.user.id ? 'ছেড়ে দিন' : `${t.assignee.name}-এর কাছে · নিন`) : 'আমি নিচ্ছি', { small: true, onClick: async () => {
      const to = t.assignee && t.assignee.id === session.me.user.id ? 'none' : 'me';
      try { await api('inbox/assign', { type: 'ticket', ref: t.id, to, force: true }); toast(to === 'me' ? 'টিকিটটি এখন আপনার।' : 'ছেড়ে দেওয়া হলো।'); table.reload(); show(t.id); } catch (e) { toast(errText(e), { bad: true }); }
    } });
    const prio = select([['', 'প্রায়োরিটি: স্বাভাবিক'], ['P1', 'P1 — জরুরি'], ['P2', 'P2 — আগে'], ['P3', 'P3 — সাধারণ']], t.priority);
    const tags = attrs(h('input', 'input'), { placeholder: 'ট্যাগ, কমা দিয়ে', value: t.tags.join(', ') });
    const saveMeta = async () => { try { await api('ticket/meta', { id: t.id, priority: prio.value, tags: tags.value.split(',').map(x => x.trim()).filter(Boolean) }); toast('সেভ হলো।'); table.reload(); } catch (e) { toast(errText(e), { bad: true }); } };
    prio.addEventListener('change', saveMeta); tags.addEventListener('change', saveMeta);
    const side = h('aside', 'ticket-side',
      u ? h('div', 'card', h('div', 'person lg', avatar(u, 'lg'), h('div', 't', h('b', null, u.name), h('span', null, '@' + u.username))),
        h('div', 'kv', h('span', null, 'যোগ দিয়েছেন'), when(u.created)), h('div', 'kv', h('span', null, 'শেষ সক্রিয়'), when(u.seen)),
        h('div', 'kv', h('span', null, 'অবস্থা'), u.banned ? badge('বন্ধ', 'danger') : u.restrictions.length ? badge('সীমিত', 'warn') : badge('সক্রিয়', 'ok'), u.verified ? badge('ভেরিফায়েড', 'info') : null),
        h('div', 'kv', h('span', null, 'টু-স্টেপ'), u.twofa ? 'চালু' : 'বন্ধ'), h('div', 'kv', h('span', null, 'ডিভাইস'), num(u.devices)),
        h('div', 'kv', h('span', null, 'আগের টিকিট'), num(u.tickets - 1)), h('div', 'kv', h('span', null, 'তাঁর বিরুদ্ধে রিপোর্ট'), num(u.reportsAbout)),
        u.previous.length ? h('div', 'prev', ...u.previous.map(p => attrs(h('a', 'link small', `#${num(p.id)} ${p.subject}`), { href: '#/tickets/' + p.id }))) : null,
        can('users.view') ? attrs(h('a', 'btn secondary sm', 'পুরো প্রোফাইল'), { href: '#/users/' + u.id }) : null) : h('p', 'hint', 'অ্যাকাউন্টটি আর নেই।'),
      h('div', 'card stack', h('div', 'kv', h('span', null, 'অবস্থা'), badge(STATUS[t.status][0], STATUS[t.status][1])), h('div', 'kv', h('span', null, 'বিষয়'), CAT[t.category] || t.category),
        h('div', 'kv', h('span', null, 'খোলা হয়েছে'), h('b', null, full(t.created))), h('div', 'kv', h('span', null, 'কার কাছে'), assignBtn), canReply ? prio : null, canReply ? tags : null));
    body.replaceChildren(h('div', 'ticket-main', thread, composer), side);
    thread.scrollTop = thread.scrollHeight;
  }
  // previous/next within the list as it is now
  const stepper = id => {
    const rows = table ? table.rows() : [], i = rows.findIndex(r => String(r.id) === String(id));
    return { prev: i > 0 ? () => go('#/tickets/' + rows[i - 1].id) : null, next: i >= 0 && i < rows.length - 1 ? () => go('#/tickets/' + rows[i + 1].id) : null };
  };
  const onTicket = e => { if (Number(e.detail.id) === openId) { /* someone else replied: their reply shows the next time it opens */ } table && table.reload(); };
  document.addEventListener('mz:ticket', onTicket);
  if (params[0]) setTimeout(() => show(params[0]), 300);
  return {
    onParams: p => { if (p[0]) show(p[0]); else { openId = 0; closeDrawer(); } },
    key: e => { if (e.key === 'e' && openId) { const r = document.querySelector('.composer textarea'); if (r) { r.focus(); return true; } } return table.keyHandler(e); },
    destroy: () => document.removeEventListener('mz:ticket', onTicket)
  };
}
