// ---- Messenger: one-to-one and group conversations, voice and video calls ----
// Everything goes through the app's own server (see "Messenger" in server.js): messages are saved there and
// pushed to everyone in the conversation over one long-lived stream; calls are peer-to-peer (WebRTC) between
// two people and the server only passes the set-up messages between the two browsers.
// A conversation is called a thread here. A thread with one person is keyed by their user id (a number); a
// group is keyed 'g' + its id (a string).

const CHAT = { friends: [], groups: [], requests: [], incoming: [], outgoing: [], blocked: [], notes: [], prefs: { active: true, dm: 'all' },
               open: null, msgs: new Map(), reads: new Map(), stream: null, typing: new Map(), loaded: false, reply: null };

async function chatApi(path, body) {
  const res = await fetch('api/chat/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
  if (!res.ok) throw new Error(data.error || 'server');
  return data;
}

// Sentences that carry a person's name are written in both languages here, so the translator leaves them alone.
const tx = (bn, en) => LANG === 'en' ? en : bn;
const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];
const THEMES = [['default', 'ক্লাসিক', 'Classic'], ['green', 'সবুজ', 'Green'], ['ocean', 'সমুদ্র', 'Ocean'], ['sunset', 'সূর্যাস্ত', 'Sunset'], ['berry', 'বেরি', 'Berry'],
                ['forest', 'বন', 'Forest'], ['grape', 'আঙুর', 'Grape'], ['mono', 'সাদা-কালো', 'Mono']];

// ---- small pieces ----
// "রাত ৯:০৫" — the way the time of day is said in Bangla; plain 9:05 PM in English.
function timeOf(ts) {
  const d = new Date(ts), h = d.getHours();
  if (LANG === 'en') return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const part = h < 4 ? 'রাত' : h < 6 ? 'ভোর' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকেল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
  return `${part} ${num(h % 12 || 12)}:${num(d.getMinutes()).padStart(2, num(0))}`;
}
function dayOf(ts) {
  const d = new Date(ts), today = new Date(), yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'আজ';
  if (d.toDateString() === yesterday.toDateString()) return 'গতকাল';
  return d.toLocaleDateString(NUM_LOCALE, { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
// "২ মি", "৫ ঘ", "৩ দি" — how long ago, as short as an inbox row needs.
function shortAgo(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return tx('এখন', 'now');
  if (m < 60) return tx(`${num(m)} মি`, `${m}m`);
  const h = Math.round(m / 60);
  if (h < 24) return tx(`${num(h)} ঘ`, `${h}h`);
  const d = Math.round(h / 24);
  return d < 7 ? tx(`${num(d)} দি`, `${d}d`) : tx(`${num(Math.round(d / 7))} স`, `${Math.round(d / 7)}w`);
}
function callText(m, mine) {
  const c = m.body, what = c.video ? 'ভিডিও কল' : 'ভয়েস কল';
  if (c.result === 'ended') return `${what} · ${fmtMin(Math.max(1, Math.round(c.secs / 60)))}`;
  if (c.result === 'declined') return `${what} · ধরা হয়নি`;
  return mine ? `${what} · উত্তর মেলেনি` : `মিসড ${what}`;
}
const sizeText = n => n >= 1048576 ? `${num(n / 1048576, 1)} MB` : `${num(Math.max(1, Math.round(n / 1024)))} KB`;
const friendById = id => CHAT.friends.find(f => f.id === id);
const isGroupKey = key => typeof key === 'string';
const threadOf = key => key == null ? null : isGroupKey(key) ? CHAT.groups.find(g => 'g' + g.id === key) : friendById(key);
const keyOf = t => t.members ? 'g' + t.id : t.id;
const firstName = name => (name || '').trim().split(/\s+/)[0] || name;
const others = t => t.members.filter(m => !ME || m.id !== ME.id);
const titleOf = t => !t.members ? t.name : t.name || others(t).map(m => firstName(m.name)).join(', ') || tx('গ্রুপ', 'Group');
// The person who wrote a message in a thread, or a stand-in for someone who has since left the group.
const senderIn = (t, id) => (ME && id === ME.id) ? ME : t.members ? (t.members.find(m => m.id === id) || { id, name: tx('একজন', 'Someone'), pic: 0 }) : t;
function sysText(m, t) {
  const b = m.body || {}, mine = ME && m.sender === ME.id, who = mine ? tx('আপনি', 'You') : senderIn(t, m.sender).name;
  const names = (b.who || []).map(p => p.name).join(', ');
  if (b.t === 'create') return b.name ? tx(`${who} "${b.name}" গ্রুপটি বানিয়েছেন`, `${who} created the group "${b.name}"`) : tx(`${who} গ্রুপটি বানিয়েছেন`, `${who} created the group`);
  if (b.t === 'add') return tx(`${who} ${names}-কে যোগ করেছেন`, `${who} added ${names}`);
  if (b.t === 'remove') return tx(`${who} ${names}-কে সরিয়ে দিয়েছেন`, `${who} removed ${names}`);
  if (b.t === 'leave') return tx(`${who} গ্রুপ ছেড়ে গেছেন`, `${who} left the group`);
  if (b.t === 'rename') return b.name ? tx(`${who} গ্রুপের নাম রেখেছেন "${b.name}"`, `${who} named the group "${b.name}"`) : tx(`${who} গ্রুপের নাম সরিয়েছেন`, `${who} removed the group name`);
  if (b.t === 'theme') return tx(`${who} থিম বদলেছেন`, `${who} changed the theme`);
  if (b.t === 'call') return tx(`গ্রুপ ${b.video ? 'ভিডিও' : 'ভয়েস'} কল · ${fmtMin(Math.max(1, Math.round((b.secs || 0) / 60)))}`, `Group ${b.video ? 'video' : 'voice'} call · ${Math.max(1, Math.round((b.secs || 0) / 60))} min`);
  return '';
}
function preview(m, t) {
  const mine = ME && m.sender === ME.id;
  if (m.kind === 'sys') return sysText(m, t);
  if (m.kind === 'gone') return mine ? tx('আপনি একটি মেসেজ সরিয়ে নিয়েছেন', 'You unsent a message') : tx('একটি মেসেজ সরিয়ে নেওয়া হয়েছে', 'A message was unsent');
  const what = m.kind === 'text' ? m.body : m.kind === 'place' ? `📍 ${m.body.label}` : m.kind === 'photo' ? tx('📷 ছবি', '📷 Photo') : m.kind === 'video' ? tx('🎬 ভিডিও', '🎬 Video')
    : m.kind === 'audio' ? tx('🎤 ভয়েস মেসেজ', '🎤 Voice message')
    : m.kind === 'file' ? `📎 ${m.body.name}` : callText(m, mine);
  if (m.kind === 'call') return what;
  if (mine) return tx('আপনি: ', 'You: ') + what;
  return t && t.members ? `${firstName(senderIn(t, m.sender).name)}: ${what}` : what;
}

// A group's picture: the faces of two of its members, one over the other.
function threadAvatar(t, cls = '') {
  if (!t.members) { const a = avatar(t, cls); if (t.online) a.classList.add('online'); return a; }
  const box = el('span', 'gavatar ' + cls), faces = others(t);
  box.append(avatar(faces[0] || t.members[0] || { id: t.id, name: titleOf(t) }, 'back'), avatar(faces[1] || ME || { id: 0, name: '?' }, 'front'));
  return box;
}

let toastTimer = null;
function chatToast(person, text, onClick, title) {
  const box = $('chat-toast');
  box.replaceChildren(avatar(person, 'sm'), el('span', 't'));
  const t = box.querySelector('.t');
  t.append(Object.assign(el('b', 'no-tr'), { textContent: title || person.name }), Object.assign(el('span', 'no-tr'), { textContent: text }));
  box.onclick = () => { box.classList.remove('on'); if (onClick) onClick(); };
  box.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('on'), 4500);
}
const allThreads = () => [...CHAT.friends, ...CHAT.groups];

function setBadges() {
  const n = allThreads().reduce((sum, t) => sum + (t.muted ? 0 : t.unread), 0) + CHAT.requests.length;
  for (const b of document.querySelectorAll('[data-chat-badge]')) {
    b.textContent = n > 99 ? '99+' : num(n);
    b.hidden = !n;
  }
}

// ---- notes: a line over your picture, for a day ----
function renderNotes() {
  const box = $('chat-notes');
  box.replaceChildren();
  box.hidden = inbox.tab !== 'all' || !!inbox.q;
  if (!ME) return;
  const mine = CHAT.notes.find(n => n.user.id === ME.id);
  const tile = (person, text, label, cls, fn) => {
    const b = el('button', 'note ' + cls);
    const bubbleText = el('span', 'note-bubble no-tr', text);
    b.append(bubbleText, avatar(person, 'note-av'), Object.assign(el('span', 'note-name no-tr'), { textContent: label }));
    b.addEventListener('click', fn);
    return b;
  };
  box.appendChild(tile(ME, mine ? mine.body : tx('নোট…', 'Note…'), tx('আপনার নোট', 'Your note'), mine ? 'mine' : 'mine empty', openNoteEditor));
  for (const n of CHAT.notes) if (n.user.id !== ME.id) box.appendChild(tile(n.user, n.body, firstName(n.user.name), '', () => openThreadWith(n.user)));
}
function openNoteEditor() {
  const mine = CHAT.notes.find(n => n.user.id === ME.id);
  const [box, input] = field(tx('কী ভাবছেন? (৬০ অক্ষর)', 'What’s on your mind? (60 characters)'), { maxLength: 60, value: mine ? mine.body : '', placeholder: tx('যেমন: কক্সবাজার যাচ্ছি 🌊', 'e.g. Off to Cox’s Bazar 🌊') });
  const count = el('div', 'form-note', '');
  const paint = () => { count.textContent = `${num([...input.value].length)}/${num(60)}`; };
  input.addEventListener('input', paint);
  paint();
  const save = button('send', tx('শেয়ার করুন', 'Share'), async () => { save.disabled = true; await chatApi('note', { body: input.value }).catch(() => {}); closeModal(); loadChat(); });
  const actions = [save];
  if (mine) actions.unshift(button('trash', tx('নোট মুছুন', 'Delete note'), async () => { await chatApi('note', { body: '' }).catch(() => {}); closeModal(); loadChat(); }, true));
  openModal(tx('নোট', 'Note'), tx('আপনি যাঁদের ফলো করেন ও যাঁরা আপনাকে ফলো করেন, তাঁরা ২৪ ঘণ্টা দেখবেন।', 'Your followers see it for 24 hours.'), [box, count], actions);
  input.focus();
}

// ---- the inbox ----
// Tabs: everything, unread, groups, requests. A search box narrows by name.
const inbox = { tab: 'all', q: '' };
function threadRow(t) {
  const key = keyOf(t);
  const row = el('button', 'person' + (CHAT.open === key ? ' on' : '') + (t.unread ? ' unread' : '') + (t.muted ? ' muted' : ''));
  const typing = CHAT.typing.get(key);
  const tt = el('div', 't');
  const name = t.members ? Object.assign(el('b', 'no-tr'), { textContent: titleOf(t) }) : nameEl(t);
  const sub = el('span', 'no-tr' + (typing ? ' typing' : ''));
  if (typing) sub.textContent = t.members ? tx(`${firstName(typing.name)} লিখছে…`, `${firstName(typing.name)} is typing…`) : tx('লিখছে…', 'typing…');
  else if (t.last) {
    sub.appendChild(el('span', 'pv', preview(t.last, t)));
    sub.appendChild(el('time', null, ` · ${shortAgo(t.last.sent)}`));
  } else sub.textContent = t.members ? tx(`${num(t.members.length)} জন সদস্য`, `${t.members.length} members`) : tx('হাই বলুন 👋', 'Say hi 👋');
  tt.append(name, sub);
  row.append(threadAvatar(t, 'lg'), tt);
  if (t.muted) row.appendChild(ic('bellOff'));
  if (t.unread) row.appendChild(el('i', 'dot'));
  row.addEventListener('click', () => openThread(key));
  return row;
}
function renderList() {
  const reqBox = $('chat-requests'), list = $('chat-list');
  const waiting = CHAT.requests.length;
  $('chat-me').textContent = ME ? (ME.username || ME.name) : '';
  for (const t of $('chat-tabs').children) {
    t.classList.toggle('on', t.dataset.tab === inbox.tab);
    const n = t.dataset.tab === 'requests' ? waiting : t.dataset.tab === 'unread' ? allThreads().filter(x => x.unread && !x.muted).length : 0;
    t.lastChild.textContent = n ? ` ${num(n)}` : '';
  }
  reqBox.replaceChildren();
  list.replaceChildren();
  reqBox.hidden = inbox.tab !== 'requests';
  list.hidden = $('chat-find').hidden = inbox.tab === 'requests';
  renderNotes();

  if (CHAT.requests.length) reqBox.appendChild(el('div', 'label', 'মেসেজ রিকোয়েস্ট'));
  for (const p of CHAT.requests) {
    const row = el('div', 'person req');
    const t = el('div', 't');
    t.append(nameEl(p), Object.assign(el('span', 'no-tr'), { textContent: p.last ? preview(p.last, p) : '' }));
    t.addEventListener('click', () => openProfilePage(p.id));
    const yes = el('button', 'pill-btn', 'গ্রহণ'), no = el('button', 'pill-btn quiet', 'মুছুন');
    yes.addEventListener('click', () => chatApi('accept', { id: p.id }).then(loadChat).then(() => { inbox.tab = 'all'; openThread(p.id); }));
    no.addEventListener('click', () => chatApi('decline', { id: p.id }).then(loadChat));
    row.append(avatar(p), t, yes, no);
    reqBox.appendChild(row);
  }
  if (CHAT.requests.length) reqBox.appendChild(el('div', 'form-note req-note', 'রিকোয়েস্ট গ্রহণ না করা পর্যন্ত তিনি জানবেন না যে আপনি মেসেজটি দেখেছেন।'));
  if (!waiting) {
    const none = el('div', 'chat-none small');
    none.append(ic('inbox'), el('b', null, 'কোনো মেসেজ রিকোয়েস্ট নেই'), el('span', null, 'যাঁদের আপনি ফলো করেন না, তাঁদের প্রথম মেসেজ এখানে আসবে। নতুন ফলোয়ারের খবর এক্সপ্লোরের ❤️-তে।'));
    reqBox.appendChild(none);
  }

  const q = inbox.q.trim().toLowerCase();
  const sorted = allThreads()
    .filter(t => inbox.tab === 'unread' ? t.unread > 0 : inbox.tab === 'groups' ? !!t.members : true)
    .filter(t => !q || titleOf(t).toLowerCase().includes(q) || (t.members && t.members.some(m => m.name.toLowerCase().includes(q))))
    .sort((a, b) => (b.last ? b.last.sent : b.since || b.created || 0) - (a.last ? a.last.sent : a.since || a.created || 0));
  for (const t of sorted) list.appendChild(threadRow(t));
  if (!sorted.length) {
    const empty = el('div', 'chat-none');
    if (q) empty.append(ic('search'), el('b', null, 'এই নামে কোনো কথোপকথন নেই'));
    else if (inbox.tab === 'unread') empty.append(ic('check'), el('b', null, 'সব মেসেজ পড়া হয়েছে'));
    else if (inbox.tab === 'groups') empty.append(ic('users'), el('b', null, 'এখনো কোনো গ্রুপ নেই'), el('span', null, 'বন্ধুদের নিয়ে একটি গ্রুপ বানান — ট্যুরের পরিকল্পনা এক জায়গায়।'), button('plus', 'নতুন গ্রুপ', () => openComposer()));
    else empty.append(ic('chat'), el('b', null, 'এখনো কোনো কথোপকথন নেই'), el('span', null, 'নাম দিয়ে মানুষ খুঁজে মেসেজ পাঠান। তিনি গ্রহণ করলে কথা ও কল শুরু হবে।'), button('edit', 'নতুন মেসেজ', () => openComposer()));
    list.appendChild(empty);
  }
  setBadges();
}

async function loadChat() {
  if (!ME) return;
  try {
    const data = await chatApi('list');
    // A conversation opened from a profile but not written in yet is kept while it is on screen.
    const fresh = CHAT.friends.filter(f => !f.last && f.id === CHAT.open && !data.friends.some(x => x.id === f.id));
    Object.assign(CHAT, data, { loaded: true });
    CHAT.friends.push(...fresh);
    if (CHAT.open != null && !threadOf(CHAT.open)) closeThread();
    renderList();
    if (CHAT.open != null) { renderHead(); if (!$('chat-info').hidden) openInfo(infoState.view); }
  } catch { /* offline: the last list stays on screen */ }
}

// ---- one conversation ----
function renderHead() {
  const t = threadOf(CHAT.open);
  if (!t) return;
  const who = $('chat-who'), key = keyOf(t), typing = CHAT.typing.get(key);
  const tt = el('div', 't');
  const status = typing ? (t.members ? tx(`${firstName(typing.name)} লিখছে…`, `${firstName(typing.name)} is typing…`) : tx('লিখছে…', 'typing…'))
    : t.members ? tx(`${num(t.members.length)} জন সদস্য`, `${t.members.length} members`)
    : !t.ok ? tx('রিকোয়েস্ট পাঠানো হয়েছে', 'Request sent') : t.online ? tx('অনলাইন', 'Active now') : CHAT.prefs.active ? tx('অফলাইন', 'Offline') : '';
  tt.append(t.members ? Object.assign(el('b', 'no-tr'), { textContent: titleOf(t) }) : nameEl(t), el('span', 'no-tr' + (typing ? ' typing' : ''), status));
  who.replaceChildren(threadAvatar(t, 'sm'), tt);
  const open = !!t.members || t.ok;                    // a group is always open; one person once they accept
  $('chat-voice').hidden = $('chat-video').hidden = !open;
  $('chat-attach').hidden = $('chat-mic').hidden = !open;
  renderCallBar();                                     // js/chat-extra.js: a group call is on, join it
  $('chat-thread').dataset.theme = t.theme || 'default';
}

// What a reply shows of the message it answers.
function quoteText(q, t) {
  if (!q) return '';
  if (q.kind === 'gone') return tx('সরিয়ে নেওয়া মেসেজ', 'Unsent message');
  if (q.kind === 'text' || q.kind === 'file') return q.text;
  return { photo: tx('📷 ছবি', '📷 Photo'), video: tx('🎬 ভিডিও', '🎬 Video'), place: tx('📍 জায়গা', '📍 Place'), audio: tx('🎤 ভয়েস মেসেজ', '🎤 Voice message') }[q.kind] || '';
}

function bubble(m, t) {
  const mine = ME && m.sender === ME.id;
  const row = el('div', 'msg ' + (mine ? 'me' : 'them'));
  row.dataset.id = m.id;
  const col = el('div', 'mcol');
  if (m.reply) {
    const q = el('button', 'quote no-tr');
    const self = ME && m.reply.sender === ME.id, name = firstName(senderIn(t, m.reply.sender).name), from = firstName(senderIn(t, m.sender).name);
    const toWhom = self ? tx('আপনাকে', 'you') : name;
    q.append(el('small', null, mine ? (self ? tx('আপনি নিজের মেসেজে উত্তর দিয়েছেন', 'You replied to yourself') : tx(`আপনি ${name}-কে উত্তর দিয়েছেন`, `You replied to ${name}`))
                                     : m.reply.sender === m.sender ? tx(`${from} নিজের মেসেজে উত্তর দিয়েছেন`, `${from} replied to themself`) : tx(`${from} ${self ? toWhom : toWhom + '-কে'} উত্তর দিয়েছেন`, `${from} replied to ${toWhom}`)),
      el('span', null, quoteText(m.reply, t)));
    q.addEventListener('click', () => jumpTo(m.reply.id));
    col.appendChild(q);
  }
  let b;
  if (m.kind === 'gone') {
    b = el('div', 'bubble gone', mine ? tx('আপনি মেসেজটি সরিয়ে নিয়েছেন', 'You unsent a message') : tx('মেসেজটি সরিয়ে নেওয়া হয়েছে', 'This message was unsent'));
    b.classList.add('no-tr');
  } else if (m.kind === 'place') {
    b = el('button', 'bubble place');
    const tt = el('span', 't');
    tt.append(Object.assign(el('b', 'no-tr'), { textContent: m.body.label }), el('span', null, 'ম্যাপে দেখুন'));
    b.append(ic('pin'), tt);
    b.addEventListener('click', () => goTo({ lat: m.body.lat, lon: m.body.lon, label: m.body.label }));
  } else if (m.kind === 'photo') {
    b = el('a', 'bubble media');
    b.href = m.body.src; b.target = '_blank'; b.rel = 'noopener';
    b.appendChild(Object.assign(el('img'), { src: m.body.src, alt: m.body.name, loading: 'lazy' }));
  } else if (m.kind === 'video') {
    b = el('div', 'bubble media');
    b.appendChild(Object.assign(el('video'), { src: m.body.src, controls: true, playsInline: true, preload: 'metadata' }));
  } else if (m.kind === 'audio') {
    b = voiceBubble(m);                                 // js/chat-extra.js
  } else if (m.kind === 'file') {
    b = el('a', 'bubble file');
    b.href = m.body.src; b.download = m.body.name;
    const tt = el('span', 't');
    tt.append(Object.assign(el('b', 'no-tr'), { textContent: m.body.name }), el('span', null, sizeText(m.body.size)));
    b.append(ic('file'), tt);
  } else {
    // A message of one to three emoji is shown large, without a bubble.
    const big = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*\s*){1,3}$/u.test(m.body);
    b = el('div', 'bubble no-tr' + (big ? ' emoji' : ''));
    b.textContent = m.body;
  }
  col.appendChild(b);
  if (m.reacts) {
    const counts = {};
    for (const e of Object.values(m.reacts)) counts[e] = (counts[e] || 0) + 1;
    const chip = el('button', 'reacts');
    const total = Object.values(counts).reduce((a, c) => a + c, 0);
    chip.textContent = Object.keys(counts).slice(0, 3).join('') + (total > 1 ? ' ' + num(total) : '');
    chip.addEventListener('click', e => { e.stopPropagation(); openReactors(m, t); });
    col.appendChild(chip);
    row.classList.add('has-reacts');
  }
  const meta = el('span', 'meta', (m.edited ? tx('এডিট করা · ', 'Edited · ') : '') + timeOf(m.sent));
  row.append(col, meta);
  if (m.kind !== 'gone') {
    // Hover tools (react, reply, more); on a phone, press and hold; double-click or double-tap sends a heart.
    const acts = el('div', 'msg-acts');
    const act = (icon, label, fn) => { const x = el('button'); x.innerHTML = svg(icon); x.title = label; x.setAttribute('aria-label', label); x.addEventListener('click', e => { e.stopPropagation(); fn(x); }); return x; };
    acts.append(act('smile', 'রিঅ্যাক্ট', x => openReactPop(m, x)), act('reply', 'উত্তর দিন', () => startReply(m, t)), act('more', 'আরও', x => openMsgMenu(m, t, x)));
    row.appendChild(acts);
    b.addEventListener('dblclick', e => { e.preventDefault(); react(m, '❤️'); });
    let timer = null, start = null;
    row.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; start = [e.clientX, e.clientY]; timer = setTimeout(() => { navigator.vibrate && navigator.vibrate(12); openMsgSheet(m, t); }, 430); });
    row.addEventListener('pointermove', e => { if (timer && start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10) { clearTimeout(timer); timer = null; } });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) row.addEventListener(ev, () => { clearTimeout(timer); timer = null; });
    row.addEventListener('contextmenu', e => { if (e.target.closest('a, video')) return; e.preventDefault(); openMsgSheet(m, t); });
  }
  return row;
}

// Instagram's colour that changes down the screen: one gradient the height of the conversation, each of my
// bubbles showing its own slice of it. (CSS background-attachment: fixed does this on a computer, but iPhones
// paint it wrong inside a scrolling box — bubbles came out blank or cut — so the slice is placed here.)
let bubbleTops = [], bubbleFrame = 0;
function measureBubbles() {
  const box = $('chat-msgs');
  if (!box) return;
  const top = box.getBoundingClientRect().top - box.scrollTop;
  bubbleTops = [...box.querySelectorAll('.msg.me .bubble:not(.emoji):not(.media):not(.gone)')].map(b => [b, b.getBoundingClientRect().top - top]);
  box.style.setProperty('--ch', box.clientHeight + 'px');
  paintBubbles();
}
function paintBubbles() {
  if (bubbleFrame) return;
  bubbleFrame = requestAnimationFrame(() => {
    bubbleFrame = 0;
    const box = $('chat-msgs'), st = box.scrollTop, h = box.clientHeight;
    for (const [b, y] of bubbleTops) {
      const at = y - st;
      if (at < -400 || at > h + 400) continue;            // only what is on screen (and near it)
      b.style.backgroundPosition = `0 ${-Math.round(at)}px`;
    }
  });
}
function renderMsgs(scroll = true) {
  const t = threadOf(CHAT.open), box = $('chat-msgs');
  if (!t) return;
  const key = keyOf(t), msgs = CHAT.msgs.get(key) || [];
  box.replaceChildren();
  // The conversation opens with who this is.
  const intro = el('div', 'chat-intro');
  if (t.members) {
    const see = el('button', 'pill-btn quiet', tx('সদস্যদের দেখুন', 'See members'));
    see.addEventListener('click', () => openInfo('main'));
    intro.append(threadAvatar(t, 'xl'), Object.assign(el('b', 'no-tr'), { textContent: titleOf(t) }),
      Object.assign(el('span', 'no-tr'), { textContent: others(t).map(m => firstName(m.name)).slice(0, 6).join(', ') + (t.members.length > 7 ? '…' : '') }), see);
  } else {
    const see = el('button', 'pill-btn quiet', 'প্রোফাইল দেখুন');
    see.addEventListener('click', () => openProfilePage(t.id));
    intro.append(avatar(t, 'xl'), nameEl(t), Object.assign(el('span', 'no-tr'), { textContent: t.bio || 'BD Map' }), see);
  }
  box.appendChild(intro);
  let day = '', prev = null;
  for (const m of msgs) {
    const d = dayOf(m.sent);
    if (d !== day) { day = d; box.appendChild(el('div', 'day', `${d} · ${timeOf(m.sent)}`)); prev = null; }
    if (m.kind === 'call' || m.kind === 'sys') {        // a call or a change is a line in the middle, not a bubble
      const line = el('div', 'sys no-tr');
      line.dataset.id = m.id;
      if (m.kind === 'call') line.append(ic(m.body.video ? 'video' : 'phone'), el('span', null, callText(m, ME && m.sender === ME.id)));
      else { if (m.body && m.body.t === 'call') line.appendChild(ic(m.body.video ? 'video' : 'phone')); line.append(el('span', null, sysText(m, t))); }
      if (m.kind === 'call') line.classList.remove('no-tr');
      box.appendChild(line);
      prev = null;
      continue;
    }
    const row = bubble(m, t);
    const theirs = !ME || m.sender !== ME.id;
    // Messages from the same person within two minutes sit together, with the time shown on the last one only.
    const joins = prev && prev.m.sender === m.sender && m.sent - prev.m.sent < 120_000 && !m.reply;
    if (joins) { prev.row.classList.add('joined'); row.classList.add('follows'); }
    if (theirs) {
      const who = senderIn(t, m.sender);
      row.prepend(avatar(who, 'xs mini'));
      if (t.members && !joins) row.querySelector('.mcol').prepend(Object.assign(el('span', 'from no-tr'), { textContent: firstName(who.name) }));
    }
    box.appendChild(row);
    prev = { m, row };
  }
  // In a group: who has seen my latest message.
  if (t.members && ME) {
    const lastMine = [...msgs].reverse().find(m => m.sender === ME.id && m.kind !== 'sys');
    const reads = CHAT.reads.get(key) || {};
    if (lastMine && msgs.at(-1) === lastMine) {
      const seers = others(t).filter(p => (reads[p.id] || 0) >= lastMine.id);
      if (seers.length) {
        const s = el('div', 'seen-by no-tr');
        for (const p of seers.slice(0, 5)) s.appendChild(avatar(p, 'xs'));
        s.appendChild(el('span', null, seers.length === others(t).length ? tx('সবাই দেখেছেন', 'Seen by everyone') : tx(`${seers.map(p => firstName(p.name)).join(', ')} দেখেছেন`, `Seen by ${seers.map(p => firstName(p.name)).join(', ')}`)));
        box.appendChild(s);
      }
    }
  }
  // With one person: sent, delivered, or their face under the last message they have seen (as Messenger shows it).
  if (!t.members && ME) {
    const mineList = msgs.filter(m => m.sender === ME.id && !['sys', 'call', 'gone'].includes(m.kind));
    const lastMine = mineList.at(-1), lastSeen = [...mineList].reverse().find(m => m.seen);
    const after = (m, node) => { const row = box.querySelector(`.msg[data-id="${m.id}"]`); if (row) row.after(node); };
    if (lastSeen) {
      const s = el('div', 'mstat seen');
      s.title = tx('দেখেছেন', 'Seen');
      s.appendChild(avatar(t, 'xs'));
      if (lastSeen === lastMine) s.appendChild(el('span', null, tx('দেখেছেন', 'Seen')));
      after(lastSeen, s);
    }
    if (lastMine && lastMine !== lastSeen) {
      const s = el('div', 'mstat ' + (lastMine.got ? 'got' : 'sent'));
      s.append(Object.assign(el('i'), { innerHTML: svg('check') }), el('span', null, lastMine.got ? tx('পৌঁছেছে', 'Delivered') : tx('পাঠানো হয়েছে', 'Sent')));
      after(lastMine, s);
    }
  }
  if (!t.members && !t.ok && msgs.length) box.appendChild(el('div', 'chat-wait', 'মেসেজ রিকোয়েস্ট পাঠানো হয়েছে। তিনি গ্রহণ করলে পুরো কথোপকথন, ছবি ও কল চালু হবে।'));
  if (CHAT.typing.has(key)) {
    const dots = el('div', 'msg them');
    const typer = CHAT.typing.get(key);
    dots.append(avatar(typer, 'xs mini'), Object.assign(el('div', 'bubble dots'), { innerHTML: '<i></i><i></i><i></i>' }));
    box.appendChild(dots);
  }
  if (scroll) box.scrollTop = box.scrollHeight;
  measureBubbles();
}
// Scroll to a message (a reply's original, a search result) and make it glow for a moment.
function jumpTo(id) {
  const row = $('chat-msgs').querySelector(`[data-id="${id}"]`);
  if (!row) { chatToast(threadOf(CHAT.open) || ME, tx('মেসেজটি অনেক আগের — উপরে স্ক্রল করে দেখুন।', 'That message is further up — scroll to see it.')); return; }
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
}

async function openThread(key) {
  CHAT.open = key;
  document.body.classList.add('chat-open');
  fitChat();
  clearReply();
  $('chat-info').hidden = true;
  $('chat').classList.add('open');
  $('chat-empty').hidden = true;
  $('chat-thread').hidden = false;
  renderHead();
  renderList();
  renderMsgs();
  const t = threadOf(key);
  try {
    const data = await chatApi('messages?' + (isGroupKey(key) ? 'group=' + t.id : 'with=' + key));
    if (CHAT.open !== key) return;
    if (!isGroupKey(key)) { const f = friendById(key); if (f) f.ok = data.ok; }
    if (data.reads) CHAT.reads.set(key, data.reads);
    renderHead();
    CHAT.msgs.set(key, data.messages);
    renderMsgs();
    markRead(key);
  } catch { /* shown from what is already loaded */ }
  if (matchMedia('(min-width: 761px)').matches) $('chat-input').focus();
}
// Start (or open) a conversation with someone who may not be in the list yet — from a profile, for example.
function openThreadWith(person) {
  if (!ME) { openLogin(); return; }
  if (!friendById(person.id)) CHAT.friends.push({ id: person.id, name: person.name, bio: person.bio || '', pic: person.pic || 0, verified: !!person.verified, online: false, since: Date.now(), last: null, unread: 0, ok: person.relation === 'mutual', mutual: person.relation === 'mutual' });
  if (!$('modal').hidden) closeModal();
  go('chat');
  openThread(person.id);
}

// Send a photo, a video or any other file: it is uploaded first, then goes out as a message.
function sendFile(file, extra = {}) {
  const key = CHAT.open, t = threadOf(key);
  if (!file || !t) return;
  if (file.size > 25e6) { chatToast(ME, 'ফাইলটি ২৫ এমবির বেশি।'); return; }
  const bar = $('chat-upload');
  bar.hidden = false;
  bar.firstChild.style.width = '0';
  const x = new XMLHttpRequest();
  x.open('POST', 'api/chat/upload');
  x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
  x.setRequestHeader('X-Name', encodeURIComponent(file.name));
  x.upload.onprogress = e => { if (e.lengthComputable) bar.firstChild.style.width = Math.round(e.loaded / e.total * 100) + '%'; };
  const done = () => { bar.hidden = true; };
  x.onerror = () => { done(); chatToast(ME, 'ফাইলটি পাঠানো যায়নি।'); };
  x.onload = async () => {
    done();
    let d = {};
    try { d = JSON.parse(x.responseText); } catch { /* handled below */ }
    if (x.status !== 200) { chatToast(ME, d.error === 'big' ? 'ফাইলটি ২৫ এমবির বেশি।' : 'ফাইলটি পাঠানো যায়নি।'); return; }
    if (CHAT.open === key) sendMessage(d.kind, { media: d.media, name: d.name, size: d.size, ...extra });
  };
  x.send(file);
}

function closeThread() {
  CHAT.open = null;
  document.body.classList.remove('chat-open');
  clearReply();
  $('chat-info').hidden = true;
  $('chat').classList.remove('open');
  $('chat-thread').hidden = true;
  $('chat-empty').hidden = false;
  renderList();
}
function markRead(key) {
  const t = threadOf(key);
  if (!t || !t.unread || document.hidden || current !== 'chat') return;
  t.unread = 0;
  renderList();
  (t.members ? chatApi('group-read', { group: t.id }) : chatApi('read', { with: key })).catch(() => {});
}

function addMessage(m) {
  const key = m.group ? 'g' + m.group : (ME && m.sender === ME.id ? m.to : m.sender);
  const t = threadOf(key);
  if (!t) { loadChat(); return; }
  const list = CHAT.msgs.get(key) || (CHAT.msgs.set(key, []), CHAT.msgs.get(key));
  if (list.some(x => x.id === m.id)) return;
  list.push(m);
  t.last = m;
  const viewing = CHAT.open === key && current === 'chat' && !document.hidden;
  if (ME && m.sender !== ME.id) {
    CHAT.typing.delete(key);
    if (m.kind !== 'sys') {
      if (viewing) (t.members ? chatApi('group-read', { group: t.id }) : chatApi('read', { with: key })).catch(() => {});
      else {
        t.unread++;
        if (!t.muted) {
          const from = senderIn(t, m.sender);
          chatToast(from, t.members ? `${firstName(from.name)}: ${preview(m, null)}` : preview(m, t), () => { go('chat'); openThread(key); }, t.members ? titleOf(t) : from.name);
        }
      }
    }
  }
  if (ME && m.sender === ME.id && t.members) { const r = CHAT.reads.get(key) || {}; r[ME.id] = m.id; CHAT.reads.set(key, r); }
  if (CHAT.open === key) {
    const box = $('chat-msgs'), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
    renderMsgs(atEnd || (ME && m.sender === ME.id));
    const row = box.querySelector(`[data-id="${m.id}"]`);
    if (row) row.classList.add('new');
    renderHead();
  }
  renderList();
}
// A reaction or an unsend changed a message that is already on screen.
function updateMessage(m) {
  const key = m.group ? 'g' + m.group : (ME && m.sender === ME.id ? m.to : m.sender);
  const list = CHAT.msgs.get(key), t = threadOf(key);
  if (list) { const i = list.findIndex(x => x.id === m.id); if (i >= 0) list[i] = m; }
  if (t && t.last && t.last.id === m.id) { t.last = m; renderList(); }
  if (CHAT.open === key) {
    const box = $('chat-msgs'), top = box.scrollTop;
    renderMsgs(false);
    box.scrollTop = top;
  }
}

async function sendMessage(kind, body) {
  const key = CHAT.open, t = threadOf(key);
  if (!t) return;
  const reply = CHAT.reply ? CHAT.reply.id : 0;
  clearReply();
  try {
    const { message } = await chatApi(t.members ? 'group-send' : 'send', t.members ? { group: t.id, kind, body, reply } : { to: key, kind, body, reply });
    addMessage(message);
  } catch (e) {
    chatToast(ME, e.message === 'slow' ? 'একটু ধীরে — অনেক মেসেজ একসাথে গেছে।'
      : e.message === 'request' ? 'তিনি রিকোয়েস্ট গ্রহণ না করা পর্যন্ত আর মেসেজ পাঠানো যাবে না।'
      : e.message === 'closed' ? 'তিনি শুধু যাঁদের ফলো করেন, তাঁদের কাছ থেকে মেসেজ নেন।'
      : e.message === 'group' ? 'আপনি আর এই গ্রুপে নেই।' : 'মেসেজটি পাঠানো যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।');
  }
}

// ---- reacting, replying, unsending, forwarding ----
function react(m, emoji) {
  chatApi('react', { msg: m.id, emoji }).then(r => updateMessage(r.message)).catch(() => {});
}
let popOpen = null;
function closePop() { if (popOpen) { popOpen.remove(); popOpen = null; } }
function placePop(pop, anchor) {
  document.body.appendChild(pop);
  const a = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, a.left + a.width / 2 - w / 2)) + 'px';
  pop.style.top = (a.top - h - 8 > 8 ? a.top - h - 8 : a.bottom + 8) + 'px';
  popOpen = pop;
}
function openReactPop(m, anchor) {
  closePop();
  const pop = el('div', 'react-pop');
  const mine = m.reacts && ME ? m.reacts[ME.id] : '';
  for (const e of REACTIONS) {
    const b = el('button', e === mine ? 'on' : '', e);
    b.addEventListener('click', ev => { ev.stopPropagation(); closePop(); react(m, e); });
    pop.appendChild(b);
  }
  placePop(pop, anchor);
}
function openMsgMenu(m, t, anchor) {
  closePop();
  const pop = el('div', 'msg-menu');
  for (const [icon, text, fn, bad] of msgActions(m, t)) {
    const b = el('button', bad ? 'bad' : '');
    b.innerHTML = svg(icon);
    b.appendChild(document.createTextNode(text));
    b.addEventListener('click', ev => { ev.stopPropagation(); closePop(); fn(); });
    pop.appendChild(b);
  }
  placePop(pop, anchor);
}
function msgActions(m, t) {
  const mine = ME && m.sender === ME.id, list = [];
  list.push(['reply', 'উত্তর দিন', () => startReply(m, t)]);
  if (mine && m.kind === 'text' && Date.now() - m.sent < 15 * 60_000) list.push(['edit', 'এডিট করুন', () => startEdit(m)]);
  if (m.kind === 'text') list.push(['copy', 'কপি করুন', () => { navigator.clipboard && navigator.clipboard.writeText(m.body); chatToast(ME, tx('কপি হয়েছে', 'Copied')); }]);
  if (m.kind === 'text' || m.kind === 'place') list.push(['share', 'ফরোয়ার্ড করুন', () => openForward(m)]);
  if (mine) list.push(['trash', 'সবার কাছ থেকে সরিয়ে নিন', () => confirmUnsend(m), true]);
  return list;
}
// On a phone: a sheet with the reactions on top and the actions below.
function openMsgSheet(m, t) {
  closePop();
  const row = el('div', 'react-row');
  const mine = m.reacts && ME ? m.reacts[ME.id] : '';
  for (const e of REACTIONS) {
    const b = el('button', e === mine ? 'on' : '', e);
    b.addEventListener('click', () => { closeModal(); react(m, e); });
    row.appendChild(b);
  }
  const rows = msgActions(m, t).map(([icon, text, fn, bad]) => { const b = el('button', 'menu-row' + (bad ? ' bad' : '')); b.innerHTML = svg(icon); b.appendChild(document.createTextNode(text)); b.addEventListener('click', () => { closeModal(); fn(); }); return b; });
  openModal(timeOf(m.sent), m.kind === 'text' ? m.body.slice(0, 80) : '', [row, ...rows]);
  $('m-sub').classList.add('no-tr');
}
function openReactors(m, t) {
  const rows = Object.entries(m.reacts || {}).map(([id, e]) => {
    const p = senderIn(t, Number(id)), mine = ME && Number(id) === ME.id;
    const row = el(mine ? 'button' : 'div', 'person');
    const tt = el('div', 't');
    tt.append(nameEl(p), el('span', null, mine ? 'সরাতে চাপ দিন' : ''));
    row.append(avatar(p), tt, el('span', 'react-big', e));
    if (mine) row.addEventListener('click', () => { closeModal(); react(m, ''); });
    return row;
  });
  openModal(tx('রিঅ্যাকশন', 'Reactions'), '', rows);
}
function startReply(m, t) {
  CHAT.reply = { id: m.id };
  const bar = $('chat-reply');
  const self = ME && m.sender === ME.id, who = firstName(senderIn(t, m.sender).name);
  const tt = el('div', 't no-tr');
  tt.append(el('b', null, self ? tx('নিজের মেসেজে উত্তর দিচ্ছেন', 'Replying to yourself') : tx(`${who}-কে উত্তর দিচ্ছেন`, `Replying to ${who}`)), el('span', null, quoteText({ kind: m.kind, text: m.kind === 'text' ? m.body : m.kind === 'file' ? m.body.name : '' }, t)));
  const x = el('button', 'icon-btn');
  x.innerHTML = svg('close');
  x.setAttribute('aria-label', 'বাতিল');
  x.addEventListener('click', clearReply);
  bar.replaceChildren(tt, x);
  bar.hidden = false;
  $('chat-input').focus();
}
function clearReply() {
  const editing = !!CHAT.edit;
  CHAT.reply = null; CHAT.edit = null;
  const bar = $('chat-reply');
  if (bar) { bar.hidden = true; bar.classList.remove('editing'); bar.replaceChildren(); }
  if (editing) { $('chat-input').value = ''; $('chat-input').dispatchEvent(new Event('input')); }
}
function confirmUnsend(m) {
  const yes = button('trash', 'সরিয়ে নিন', () => { closeModal(); chatApi('unsend', { msg: m.id }).then(r => updateMessage(r.message)).catch(() => chatToast(ME, 'সরানো যায়নি।')); });
  openModal('মেসেজটি সরিয়ে নেবেন?', 'কথোপকথনের সবার কাছ থেকে মেসেজটি মুছে যাবে।', [], [button('close', 'থাক', closeModal, true), yes]);
}
function openForward(m) {
  const rows = allThreads().filter(t => t.ok !== false).sort((a, b) => (b.last ? b.last.sent : 0) - (a.last ? a.last.sent : 0)).slice(0, 30).map(t => {
    const row = el('div', 'person');
    const tt = el('div', 't');
    tt.append(t.members ? Object.assign(el('b', 'no-tr'), { textContent: titleOf(t) }) : nameEl(t));
    const send = el('button', 'pill-btn', 'পাঠান');
    send.addEventListener('click', async () => {
      send.disabled = true;
      try {
        const r = await chatApi(t.members ? 'group-send' : 'send', t.members ? { group: t.id, kind: m.kind, body: m.body } : { to: t.id, kind: m.kind, body: m.body });
        addMessage(r.message);
        send.textContent = 'পাঠানো হয়েছে';
      } catch { send.disabled = false; }
    });
    row.append(threadAvatar(t), tt, send);
    return row;
  });
  openModal('ফরোয়ার্ড করুন', '', rows.length ? rows : [el('div', 'empty', 'পাঠানোর মতো কোনো কথোপকথন নেই।')]);
}

// ---- new message / new group / add people ----
// Pick one person to talk to them, or several to start a group. The list is the people you follow and the
// people who follow you; typing a name also searches everyone (for a one-to-one message).
async function openComposer(addTo) {
  if (!ME) { openLogin(); return; }
  const picked = new Map();
  const toRow = el('div', 'to-row');
  const input = el('input');
  Object.assign(input, { type: 'search', placeholder: tx('খুঁজুন…', 'Search…'), autocomplete: 'off', maxLength: 40 });
  const list = el('div', 'pick-list');
  const [nameBox, name] = field(tx('গ্রুপের নাম (ঐচ্ছিক)', 'Group name (optional)'), { maxLength: 50, placeholder: tx('যেমন: সাজেক ট্যুর ২০২৬', 'e.g. Sajek trip 2026') });
  nameBox.hidden = true;
  const note = el('div', 'form-note');
  const goBtn = button('chat', addTo ? tx('যোগ করুন', 'Add') : tx('চ্যাট', 'Chat'), submit);
  let people = [], searchSeq = 0;
  const have = new Set(addTo ? addTo.members.map(m => m.id) : []);
  try {
    const [a, b] = await Promise.all([peopleApi(`list?id=${ME.id}&kind=following`), peopleApi(`list?id=${ME.id}&kind=followers`)]);
    const seen = new Set();
    for (const p of [...a.people, ...b.people]) if (!seen.has(p.id)) { seen.add(p.id); people.push({ ...p, linked: true }); }
  } catch { /* the search box still works */ }
  const paint = rows => {
    list.replaceChildren();
    const shown = rows.filter(p => !have.has(p.id) && p.id !== ME.id);
    for (const p of shown) {
      const row = el('button', 'person pick' + (picked.has(p.id) ? ' on' : ''));
      const tt = el('div', 't');
      tt.append(nameEl(p), Object.assign(el('span', 'no-tr'), { textContent: p.bio || (p.relation === 'mutual' ? tx('বন্ধু', 'Friend') : p.relation === 'following' ? tx('আপনি ফলো করেন', 'You follow') : p.relation === 'follower' ? tx('আপনাকে ফলো করেন', 'Follows you') : '') }));
      row.append(avatar(p), tt, el('i', 'tickbox'));
      row.addEventListener('click', () => { if (picked.has(p.id)) picked.delete(p.id); else picked.set(p.id, p); paintTo(); paint(rows); });
      list.appendChild(row);
    }
    if (!shown.length) list.appendChild(el('div', 'empty', input.value.trim() ? tx('কাউকে পাওয়া যায়নি।', 'No one found.') : tx('আপনি যাঁদের ফলো করেন বা যাঁরা আপনাকে ফলো করেন, তাঁরা এখানে আসবেন।', 'People you follow or who follow you appear here.')));
  };
  const paintTo = () => {
    toRow.replaceChildren(el('span', 'to', tx('প্রতি:', 'To:')));
    for (const p of picked.values()) {
      const chip = el('button', 'to-chip no-tr', p.name);
      chip.appendChild(ic('close'));
      chip.addEventListener('click', () => { picked.delete(p.id); paintTo(); filter(); });
      toRow.appendChild(chip);
    }
    toRow.appendChild(input);
    nameBox.hidden = !!addTo || picked.size < 2;
    goBtn.disabled = !picked.size;
    goBtn.lastChild.textContent = addTo ? tx('যোগ করুন', 'Add') : picked.size > 1 ? tx('গ্রুপ বানান', 'Create group') : tx('চ্যাট', 'Chat');
  };
  const filter = () => {
    const q = input.value.trim().toLowerCase();
    const local = people.filter(p => !q || p.name.toLowerCase().includes(q));
    paint(local);
    if (q.length >= 2 && !addTo) {
      const mine = ++searchSeq;
      peopleApi('search?q=' + encodeURIComponent(q)).then(({ people: found }) => {
        if (mine !== searchSeq) return;
        const ids = new Set(local.map(p => p.id));
        paint([...local, ...found.filter(p => !ids.has(p.id)).map(p => ({ ...p, linked: p.relation !== 'none' }))]);
      }).catch(() => {});
    }
  };
  input.addEventListener('input', filter);
  async function submit() {
    const ids = [...picked.keys()];
    note.className = 'form-note';
    note.textContent = '';
    if (!ids.length) return;
    if (!addTo && ids.length === 1) { openThreadWith(picked.get(ids[0])); return; }
    goBtn.disabled = true;
    try {
      if (addTo) { await chatApi('group-add', { group: addTo.id, ids }); closeModal(); await loadChat(); return; }
      const { group } = await chatApi('group-new', { ids, name: name.value });
      closeModal();
      await loadChat();
      go('chat');
      openThread('g' + group);
    } catch (e) {
      goBtn.disabled = false;
      note.className = 'form-note bad';
      note.textContent = e.message === 'few' ? 'গ্রুপে শুধু তাঁদের রাখা যায়, যাঁদের আপনি ফলো করেন বা যাঁরা আপনাকে ফলো করেন — অন্তত দুজন।'
        : e.message === 'big' ? 'একটি গ্রুপে সবচেয়ে বেশি ৩২ জন থাকতে পারেন।' : e.message === 'slow' ? 'আজ অনেক গ্রুপ বানানো হয়েছে। কাল আবার চেষ্টা করুন।' : 'কাজটি করা যায়নি। আবার চেষ্টা করুন।';
    }
  }
  paintTo();
  paint(people);
  openModal(addTo ? tx('সদস্য যোগ করুন', 'Add people') : tx('নতুন মেসেজ', 'New message'), addTo ? titleOf(addTo) : tx('একজনকে বাছলে চ্যাট, কয়েকজনকে বাছলে গ্রুপ', 'Pick one to chat, several for a group'), [toRow, nameBox, list, note], [goBtn]);
  $('modal').classList.add('composer');
  input.focus();
}

// ---- the details panel: who, mute, search, theme, media and files, privacy ----
const infoState = { view: 'main', mediaTab: 'media' };
async function openInfo(view = 'main') {
  const t = threadOf(CHAT.open), box = $('chat-info');
  if (!t) return;
  infoState.view = view;
  box.hidden = false;
  const key = keyOf(t);
  const head = el('header', 'info-head');
  const back = el('button', 'icon-btn');
  back.innerHTML = svg(view === 'main' ? 'close' : 'back');
  back.setAttribute('aria-label', view === 'main' ? 'বন্ধ করুন' : 'ফিরে যান');
  back.addEventListener('click', () => view === 'main' ? (box.hidden = true) : openInfo('main'));
  head.append(back, el('b', null, view === 'search' ? 'কথোপকথনে খুঁজুন' : view === 'media' ? 'মিডিয়া ও ফাইল' : 'বিস্তারিত'));
  const body = el('div', 'info-body');
  box.replaceChildren(head, body);

  if (view === 'search') {
    const lab = el('label', 'chat-find');
    const q = el('input');
    Object.assign(q, { type: 'search', placeholder: tx('মেসেজে খুঁজুন', 'Search messages'), autocomplete: 'off' });
    lab.append(ic('search'), q);
    const out = el('div', 'search-out');
    let timer = null, seq = 0;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      const text = q.value.trim(), mine = ++seq;
      if (text.length < 2) { out.replaceChildren(); return; }
      timer = setTimeout(async () => {
        try {
          const { items } = await chatApi('search?' + (t.members ? 'group=' + t.id : 'with=' + t.id) + '&q=' + encodeURIComponent(text));
          if (mine !== seq) return;
          out.replaceChildren(...(items.length ? items.map(m => {
            const row = el('button', 'person hit');
            const tt = el('div', 't no-tr');
            const who = senderIn(t, m.sender);
            tt.append(Object.assign(el('b'), { textContent: who.name }), Object.assign(el('span'), { textContent: m.body }));
            row.append(avatar(who, 'sm'), tt, el('time', null, dayOf(m.sent)));
            row.addEventListener('click', () => { if (matchMedia('(max-width: 1100px)').matches) box.hidden = true; jumpTo(m.id); });
            return row;
          }) : [el('div', 'empty', tx('কিছু পাওয়া যায়নি।', 'Nothing found.'))]));
        } catch { /* keep what is shown */ }
      }, 250);
    });
    body.append(lab, out);
    q.focus();
    return;
  }
  if (view === 'media') {
    const tabs = el('div', 'seg');
    const pane = el('div');
    const show = async which => {
      infoState.mediaTab = which;
      for (const b of tabs.children) b.classList.toggle('on', b.dataset.k === which);
      pane.replaceChildren(el('div', 'empty', tx('লোড হচ্ছে…', 'Loading…')));
      try {
        const { items } = await chatApi('media?' + (t.members ? 'group=' + t.id : 'with=' + t.id));
        const list = items.filter(m => which === 'files' ? m.kind === 'file' : m.kind !== 'file');
        if (!list.length) { pane.replaceChildren(el('div', 'empty', which === 'files' ? tx('কোনো ফাইল নেই।', 'No files.') : tx('কোনো ছবি বা ভিডিও নেই।', 'No photos or videos.'))); return; }
        if (which === 'files') {
          pane.replaceChildren(...list.map(m => { const a = el('a', 'item'); a.href = m.body.src; a.download = m.body.name; const tt = el('div', 't'); tt.append(Object.assign(el('b', 'no-tr'), { textContent: m.body.name }), el('span', null, `${sizeText(m.body.size)} · ${dayOf(m.sent)}`)); a.append(ic('file'), tt); return a; }));
        } else {
          const grid = el('div', 'media-grid');
          for (const m of list) {
            const a = el('a', 'tile-m' + (m.kind === 'video' ? ' vid' : ''));
            a.href = m.body.src; a.target = '_blank'; a.rel = 'noopener';
            a.appendChild(m.kind === 'video' ? Object.assign(el('video'), { src: m.body.src + '#t=0.5', muted: true, preload: 'metadata', playsInline: true }) : Object.assign(el('img'), { src: m.body.src, alt: '', loading: 'lazy' }));
            if (m.kind === 'video') a.appendChild(ic('play'));
            grid.appendChild(a);
          }
          pane.replaceChildren(grid);
        }
      } catch { pane.replaceChildren(el('div', 'empty', tx('দেখানো যায়নি।', 'Could not load.'))); }
    };
    for (const [k, label] of [['media', 'মিডিয়া'], ['files', 'ফাইল']]) { const b = el('button', null, label); b.dataset.k = k; b.addEventListener('click', () => show(k)); tabs.appendChild(b); }
    body.append(tabs, pane);
    show(infoState.mediaTab);
    return;
  }

  // The main view.
  const top = el('div', 'info-top');
  top.append(threadAvatar(t, 'xl'), t.members ? Object.assign(el('b', 'no-tr'), { textContent: titleOf(t) }) : nameEl(t),
    el('span', 'no-tr', t.members ? tx(`${num(t.members.length)} জন সদস্য`, `${t.members.length} members`) : t.online ? tx('অনলাইন', 'Active now') : (t.bio || '')));
  const quick = el('div', 'info-quick');
  const qb = (icon, label, fn, on) => { const b = el('button', on ? 'on' : ''); const i = el('span', 'qi'); i.innerHTML = svg(icon); b.append(i, el('span', null, label)); b.addEventListener('click', fn); quick.appendChild(b); };
  if (t.members) qb('userplus', 'যোগ করুন', () => openComposer(t));
  else qb('user', 'প্রোফাইল', () => openProfilePage(t.id));
  qb(t.muted ? 'bellOff' : 'bell', t.muted ? 'আনমিউট' : 'মিউট', () => setMute(t, !t.muted), t.muted);
  qb('search', 'খুঁজুন', () => openInfo('search'));
  top.appendChild(quick);
  body.appendChild(top);

  const section = (title, rows, open) => {
    const s = el('details', 'info-sec');
    if (open) s.open = true;
    const sum = el('summary', null, title);
    sum.appendChild(ic('chev'));
    s.appendChild(sum);
    for (const r of rows) s.appendChild(r);
    body.appendChild(s);
  };
  const row = (icon, text, fn, cls = '', sub = '') => {
    const b = el('button', 'info-row ' + cls);
    b.append(ic(icon));
    const tt = el('span', 't');
    tt.append(el('b', null, text));
    if (sub) tt.appendChild(el('em', null, sub));
    b.append(tt);
    b.addEventListener('click', fn);
    return b;
  };

  // Theme: the bubble colours, the same for everyone in the conversation.
  const swatches = el('div', 'swatches');
  for (const [id, bn, en] of THEMES) {
    const s = el('button', 'swatch' + ((t.theme || 'default') === id ? ' on' : ''));
    s.dataset.theme = id;
    s.title = tx(bn, en);
    s.setAttribute('aria-label', tx(bn, en));
    s.addEventListener('click', () => chatApi('theme', t.members ? { group: t.id, theme: id } : { with: t.id, theme: id }).then(() => { t.theme = id; renderHead(); openInfo('main'); }).catch(() => chatToast(ME, 'রিকোয়েস্ট গ্রহণের পরে থিম বদলানো যাবে।')));
    swatches.appendChild(s);
  }
  const custom = [el('div', 'info-label', 'থিম'), swatches];
  if (t.members) custom.push(row('edit', 'গ্রুপের নাম বদলান', () => renameGroup(t), '', t.name || 'নাম দেওয়া নেই'));
  section('কাস্টমাইজ', custom, true);

  if (t.members) {
    const meAdmin = t.members.some(m => ME && m.id === ME.id && m.role === 'admin');
    const rows = t.members.map(m => {
      const r = el('div', 'person member');
      const tt = el('div', 't');
      tt.append(nameEl(m), el('span', null, m.role === 'admin' ? 'অ্যাডমিন' : ''));
      r.append(avatar(m), tt);
      tt.addEventListener('click', () => openProfilePage(m.id));
      if (meAdmin && ME && m.id !== ME.id) {
        const x = el('button', 'pill-btn quiet', 'সরান');
        x.addEventListener('click', () => {
          const yes = button('trash', 'সরিয়ে দিন', () => chatApi('group-remove', { group: t.id, id: m.id }).then(() => { closeModal(); loadChat(); }).catch(() => closeModal()));
          openModal(tx(`${m.name}-কে সরাবেন?`, `Remove ${m.name}?`), 'তিনি আর এই গ্রুপের মেসেজ দেখতে পাবেন না।', [], [button('close', 'থাক', closeModal, true), yes]);
          $('m-title').classList.add('no-tr');
        });
        r.appendChild(x);
      }
      return r;
    });
    rows.push(row('userplus', 'সদস্য যোগ করুন', () => openComposer(t)));
    section(tx(`সদস্য · ${num(t.members.length)}`, `Members · ${t.members.length}`), rows, true);
  }
  section('মিডিয়া ও ফাইল', [row('image', 'মিডিয়া', () => { infoState.mediaTab = 'media'; openInfo('media'); }), row('file', 'ফাইল', () => { infoState.mediaTab = 'files'; openInfo('media'); })]);

  const privacy = [row(t.muted ? 'bellOff' : 'bell', t.muted ? 'নোটিফিকেশন চালু করুন' : 'মেসেজ মিউট করুন', () => setMute(t, !t.muted), '', t.muted ? 'এখন মিউট করা আছে' : 'নতুন মেসেজে আর জানানো হবে না')];
  if (t.members) privacy.push(row('logout', 'গ্রুপ ছেড়ে দিন', () => leaveGroup(t), 'bad'));
  else {
    privacy.push(row('shield', 'ব্লক করুন', () => {
      const yes = button('shield', 'ব্লক করুন', () => chatApi('block', { id: t.id }).then(() => { closeModal(); closeThread(); loadChat(); }));
      openModal(tx(`${t.name}-কে ব্লক করবেন?`, `Block ${t.name}?`), 'তিনি আর আপনাকে মেসেজ বা কল করতে পারবেন না। চাইলে পরে সেটিংস থেকে ব্লক তুলতে পারবেন।', [], [button('close', 'থাক', closeModal, true), yes]);
      $('m-title').classList.add('no-tr');
    }, 'bad'));
    privacy.push(row('flag', 'রিপোর্ট করুন', () => openReport(t, () => { closeModal(); closeThread(); loadChat(); }), 'bad', 'আমাদের টিম দেখবে; তিনি জানবেন না'));
  }
  section('প্রাইভেসি ও সাপোর্ট', privacy);
}
function setMute(t, on) {
  chatApi('mute', { thread: (t.members ? 'g' : 'u') + t.id, on }).then(() => { t.muted = on; renderList(); openInfo('main'); setBadges(); }).catch(() => {});
}
function renameGroup(t) {
  const [box, input] = field('গ্রুপের নাম', { maxLength: 50, value: t.name || '', placeholder: titleOf(t) });
  const save = button('check', 'সেভ করুন', () => chatApi('group-name', { group: t.id, name: input.value }).then(() => { closeModal(); loadChat(); }).catch(() => closeModal()));
  openModal('গ্রুপের নাম', 'সবাই নতুন নামটি দেখবেন।', [box], [save]);
  input.focus();
}
function leaveGroup(t) {
  const yes = button('logout', 'ছেড়ে দিন', () => chatApi('group-leave', { group: t.id }).then(() => { closeModal(); closeThread(); loadChat(); }).catch(() => closeModal()));
  openModal('গ্রুপ ছাড়বেন?', 'আর এই গ্রুপের মেসেজ পাবেন না। কেউ আবার যোগ না করলে ফেরা যাবে না।', [], [button('close', 'থাক', closeModal, true), yes]);
}

// The part of the screen the keyboard leaves free (visualViewport), written as two CSS variables.
function fitChat() {
  const vv = window.visualViewport, root = document.documentElement.style;
  root.setProperty('--vvh', Math.round(vv ? vv.height : innerHeight) + 'px');
  root.setProperty('--vvt', Math.round(vv ? vv.offsetTop : 0) + 'px');
}
if (window.visualViewport) {
  let wasShort = false;
  const onViewport = () => {
    fitChat();
    if (!document.body.classList.contains('chat-open')) return;
    // When the keyboard comes up, keep the newest messages in sight.
    const short = visualViewport.height < innerHeight * 0.8;
    if (short && !wasShort) { const box = $('chat-msgs'); box.scrollTop = box.scrollHeight; }
    wasShort = short;
  };
  visualViewport.addEventListener('resize', onViewport);
  visualViewport.addEventListener('scroll', onViewport);
}
// iPhones scroll the page to show the typing box once the keyboard is up — a moment after the resize event.
// While that settles, the page is held at the top and the conversation re-measured every frame.
function holdChatInPlace() {
  if (!document.body.classList.contains('chat-open')) return;
  // iPhones slide the page up to show the field. Correcting that on every frame fought the phone and made the
  // chat shake; now it is put back a few times while the keyboard settles, and the box follows the visible area.
  for (const ms of [0, 120, 320, 650]) setTimeout(() => {
    if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0);
    fitChat();
    if (ms === 650) { const box = $('chat-msgs'); box.scrollTop = box.scrollHeight; measureBubbles(); }
  }, ms);
}
$('chat-input').addEventListener('focus', holdChatInPlace);
$('chat-input').addEventListener('blur', () => setTimeout(holdChatInPlace, 50));
addEventListener('scroll', () => { if (document.body.classList.contains('chat-open')) fitChat(); }, { passive: true });
addEventListener('hashchange', () => { if (!location.hash.includes('chat')) document.body.classList.remove('chat-open'); else if (CHAT.open != null) document.body.classList.add('chat-open'); });

// Can this phone reach the relay (TURN) that calls across networks need? Checked quietly twice a day, only
// relay routes allowed; the answer (yes/no and which ways, never a password) goes to the server's turn check.
async function relayTest() {
  try {
    const last = Number(localStorage.getItem('bdmap.relaytest') || 0);
    if (Date.now() - last < 12 * 36e5) return;
    localStorage.setItem('bdmap.relaytest', String(Date.now()));
  } catch { return; }
  try {
    const d = await chatApi('ice');
    if (!d.relay || !window.RTCPeerConnection) return;
    const pc = new RTCPeerConnection({ iceServers: d.iceServers, iceTransportPolicy: 'relay' });
    pc.createDataChannel('t');
    const kinds = new Set(), t0 = performance.now();
    let first = 0;
    pc.onicecandidate = e => { if (e.candidate && / typ relay/.test(e.candidate.candidate)) { kinds.add(e.candidate.relayProtocol || e.candidate.protocol || 'relay'); first = first || Math.round(performance.now() - t0); } };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise(r => { const done = () => r(); pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') done(); }; setTimeout(done, 9000); });
    pc.close();
    fetch(`api/chat/relaytest?ok=${kinds.size ? 1 : 0}&k=${encodeURIComponent([...kinds].join(','))}&ms=${first}`).catch(() => {});
  } catch { /* a browser without WebRTC */ }
}

// ---- the live stream from the server ----
function connectChat() {
  if (CHAT.stream || !ME || !window.EventSource) return;
  const es = CHAT.stream = new EventSource('api/chat/stream');
  const on = (name, fn) => es.addEventListener(name, e => fn(JSON.parse(e.data)));
  if (typeof liveEvents === 'function') liveEvents(on, es);   // live video's signals, comments and hearts (live.js)
  on('message', addMessage);
  on('update', updateMessage);
  on('friends', loadChat);
  on('presence', p => { const f = friendById(p.id); if (f) { f.online = p.online && CHAT.prefs.active; renderList(); if (CHAT.open === p.id) renderHead(); } });
  on('read', p => {
    for (const m of CHAT.msgs.get(p.by) || []) { m.seen = 1; m.got = 1; }
    if (CHAT.open === p.by) { const box = $('chat-msgs'); renderMsgs(box.scrollHeight - box.scrollTop - box.clientHeight < 140); }
  });
  on('delivered', p => {
    for (const m of CHAT.msgs.get(p.by) || []) if (ME && m.sender === ME.id) m.got = 1;
    if (CHAT.open === p.by) { const box = $('chat-msgs'); renderMsgs(box.scrollHeight - box.scrollTop - box.clientHeight < 140); }
  });
  on('gread', p => {
    const key = 'g' + p.group, r = CHAT.reads.get(key) || {};
    r[p.by] = p.id;
    CHAT.reads.set(key, r);
    if (CHAT.open === key) { const box = $('chat-msgs'); renderMsgs(box.scrollHeight - box.scrollTop - box.clientHeight < 140); }
  });
  on('typing', p => {
    const key = p.group ? 'g' + p.group : p.from, t = threadOf(key);
    if (!t) return;
    const old = CHAT.typing.get(key);
    if (old) clearTimeout(old.timer);
    const who = senderIn(t, p.from);
    CHAT.typing.set(key, { id: who.id, name: who.name, pic: who.pic, timer: setTimeout(() => { CHAT.typing.delete(key); refreshTyping(key); }, 4000) });
    refreshTyping(key);
  });
  on('signal', p => onSignal(p.from, p.data));
  on('gcall', p => onGroupCall(p));                    // js/chat-extra.js
  on('gsignal', p => onGroupSignal(p));
  on('creator', () => { if (current === 'insights' && typeof drawInsights === 'function') drawInsights(); });
  on('support', () => { if (typeof loadTickets === 'function') loadTickets(); });
  on('notify', () => { if (typeof refreshNotify === 'function') refreshNotify(); });
  es.onopen = () => { if (CHAT.loaded) loadChat(); };      // back online: catch up on anything missed
}
function refreshTyping(key) {
  renderList();
  if (CHAT.open === key) { renderHead(); const box = $('chat-msgs'); renderMsgs(box.scrollHeight - box.scrollTop - box.clientHeight < 140); }
}
function disconnectChat() {
  if (CHAT.stream) CHAT.stream.close();
  Object.assign(CHAT, { stream: null, friends: [], groups: [], requests: [], incoming: [], outgoing: [], blocked: [], notes: [], open: null, loaded: false, reply: null });
  CHAT.msgs.clear();
  CHAT.reads.clear();
}

// Called by account.js whenever someone logs in or out.
function chatAuthChanged() {
  $('chat-gate').hidden = !!ME;
  $('chat').hidden = !ME;
  for (const b of document.querySelectorAll('.chat-btn')) b.hidden = false;
  if (ME) { connectChat(); loadChat(); setTimeout(relayTest, 6000); } else { endCall(); disconnectChat(); closeThread(); renderList(); }
}

// Why someone is being reported. The report goes to the people who run the app; the person is blocked too.
function openReport(f, done) {
  const reasons = ['বাজে বা অশ্লীল কথা', 'হয়রানি বা হুমকি', 'স্প্যাম বা প্রতারণা', 'অন্যের নাম-পরিচয় ব্যবহার', 'অন্য কারণ'];
  const [moreBox, more] = field('আরও কিছু জানাতে চাইলে লিখুন', { rows: 2, maxLength: 200 }, 'textarea');
  let picked = reasons[0];
  const chips = el('div', 'chips');
  for (const r of reasons) {
    const c = el('button', 'chip' + (r === picked ? ' on' : ''), r);
    c.addEventListener('click', () => { picked = r; for (const x of chips.children) x.classList.toggle('on', x === c); });
    chips.appendChild(c);
  }
  const send = button('shield', 'রিপোর্ট পাঠান ও ব্লক করুন', () =>
    chatApi('report', { id: f.id, reason: (picked + (more.value.trim() ? ' — ' + more.value.trim() : '')).slice(0, 300) }).then(() => chatApi('block', { id: f.id })).then(done));
  openModal('রিপোর্ট করুন', f.name, [chips, moreBox, el('div', 'form-note', 'আমাদের টিম রিপোর্টটি দেখবে। আপনার মেসেজগুলো আমরা পড়তে পারি না, তাই কী হয়েছে লিখে দিলে সুবিধা হয়।')], [send]);
  $('m-sub').classList.add('no-tr');
}
function openBlocked() {
  if (!ME) { openLogin(); return; }
  const rows = CHAT.blocked.map(p => {
    const row = el('div', 'person');
    const t = el('div', 't no-tr');
    t.append(el('b', null, p.name), el('span', null, p.bio || ''));
    const un = el('button', 'pill-btn quiet', 'ব্লক তুলুন');
    un.addEventListener('click', () => chatApi('unblock', { id: p.id }).then(() => { row.remove(); loadChat(); }));
    row.append(avatar(p), t, un);
    return row;
  });
  openModal('ব্লক করা মানুষ', '', rows.length ? rows : [el('div', 'empty', 'আপনি কাউকে ব্লক করেননি।')]);
}

// Share a place: where you are now, or the place open on the map.
function openShare() {
  const rows = [];
  const add = (icon, title, sub, fn) => { rows.push(item(icon, title, sub, '', fn)); };
  add('locate', 'আমার এখনকার লোকেশন', 'একবার পাঠানো হবে, লাইভ নয়', () => {
    if (!navigator.geolocation) { closeModal(); return; }
    navigator.geolocation.getCurrentPosition(p => { closeModal(); sendMessage('place', { lat: p.coords.latitude, lon: p.coords.longitude, label: 'আমার লোকেশন' }); },
      () => { closeModal(); chatToast(ME, 'লোকেশনের অনুমতি পাওয়া যায়নি।'); }, { enableHighAccuracy: true, timeout: 10000 });
  });
  for (const p of [trip.to, trip.from]) if (p) add('pin', p.label, 'ম্যাপে খোলা জায়গা', () => { closeModal(); sendMessage('place', { lat: p.lat, lon: p.lon, label: p.label }); });
  openModal('জায়গা পাঠান', '', rows);
}

// ---- calls (WebRTC) ----
// idle -> calling (I rang) / ringing (they rang) -> live -> idle. Only the caller writes the call into the chat.
const call = { state: 'idle', peer: null, pc: null, media: null, video: false, mine: false, offer: null, ice: [], ring: null, clock: null, started: 0 };
let iceServers = null;

function signal(data) { return chatApi('signal', { to: call.peer.id, data }); }

function showCall(status) {
  const box = $('call');
  box.hidden = false;
  box.dataset.state = call.state;
  box.classList.toggle('video', call.video);
  $('call-name').textContent = call.peer.name;
  $('call-status').textContent = status;
  $('call-avatar').replaceChildren(avatar(call.peer, 'xl'));
  $('call-accept').hidden = call.state !== 'ringing';
  $('call-mic').hidden = $('call-cam').hidden = $('call-spk').hidden = call.state === 'ringing';
  $('call-spk').classList.toggle('on', !!call.loud);
  if (!call.video) $('call-cam').hidden = true;
}

// What each side's network offered (host = same Wi-Fi, srflx = through the router, relay = through TURN) —
// told to the server when a call fails, so the reason can be seen.
const candType = c => (/ typ (\w+)/.exec(c && (c.candidate || c)) || [])[1] || '?';
// ---- the call's sound: by the ear, as a phone call is, unless the loudspeaker is chosen ----
// A web page cannot pick the earpiece everywhere. Where the browser can say what the audio is for (Safari on
// iPhone, iOS 16.4+: 'play-and-record' is a phone-call session, heard at the ear) or which output to use
// (setSinkId with an earpiece among the outputs), that is used; otherwise the call is simply quieter until the
// loudspeaker button is pressed. A video call starts on the loudspeaker, as WhatsApp's do.
async function applyCallSound() {
  const loud = !!call.loud, outs = [$('call-remote'), ...document.querySelectorAll('.gc-tile video')];
  try { if (navigator.audioSession) navigator.audioSession.type = loud ? 'auto' : 'play-and-record'; } catch { /* not this browser */ }
  let sink = null;
  try {
    if (outs[0].setSinkId && navigator.mediaDevices.enumerateDevices) {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput');
      sink = devs.find(d => (loud ? /speaker/i : /earpiece|receiver|handset/i).test(d.label));
    }
  } catch { /* no list of outputs */ }
  for (const v of outs) {
    if (sink) v.setSinkId(sink.deviceId).catch(() => {});
    v.volume = loud || sink ? 1 : 0.35;
  }
  $('call-spk').classList.toggle('on', loud);
}
async function newPeer() {
  call.loud = call.video;
  applyCallSound();
  // fetched for each call: relay passwords from metered.ca change
  try { const d = await chatApi('ice'); iceServers = d.iceServers; call.relay = d.relay; } catch { if (!iceServers) throw new Error('ice'); }
  const pc = call.pc = new RTCPeerConnection({ iceServers });
  call.diag = { mine: new Set(), theirs: new Set(), restarted: false };
  for (const track of call.media.getTracks()) pc.addTrack(track, call.media);
  pc.onicecandidate = e => { if (e.candidate) { call.diag.mine.add(candType(e.candidate)); signal({ type: 'ice', candidate: e.candidate }).catch(() => {}); } };
  pc.ontrack = e => { const v = $('call-remote'); v.srcObject = e.streams[0]; v.play().catch(() => {}); applyCallSound(); };
  const failed = () => {
    if (call.pc !== pc) return;
    // One more try with fresh routes (an ICE restart) before giving up; the caller starts it.
    if (!call.diag.restarted) {
      call.diag.restarted = true;
      $('call-status').textContent = tx('আবার সংযোগের চেষ্টা হচ্ছে…', 'Trying again…');
      clearTimeout(call.ring);
      call.ring = setTimeout(connectTimeout, 20000);
      if (call.mine) restartIce(pc);
      return;
    }
    callFailed();
  };
  pc.oniceconnectionstatechange = () => {
    if ((pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') && call.state !== 'live') callConnected();
    if (pc.iceConnectionState === 'failed') failed();
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected' && call.state !== 'live') callConnected();
    if (pc.connectionState === 'failed') failed();
  };
  $('call-local').srcObject = call.media;
  return pc;
}
async function restartIce(pc) {
  try {
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    await signal({ type: 'reoffer', sdp: offer.sdp });
  } catch { callFailed(); }
}
// Answered, but the two networks never found a way to each other (common on mobile data without a relay).
function connectTimeout() {
  if (call.state === 'live' || call.state === 'idle') return;
  if (call.pc && call.diag && !call.diag.restarted && call.mine) { call.diag.restarted = true; call.ring = setTimeout(connectTimeout, 20000); restartIce(call.pc); return; }
  signal({ type: 'end' }).catch(() => {});
  callFailed();
}
// Why it did not connect, as far as can be told, said plainly.
function callFailed() {
  const d = call.diag || { mine: new Set(), theirs: new Set() };
  const mine = [...d.mine].join(','), theirs = [...d.theirs].join(',');
  fetch(`api/chat/calldiag?d=${encodeURIComponent(`relay=${call.relay ? 1 : 0} mine=${mine} theirs=${theirs} ua=${navigator.userAgent.slice(0, 90)}`)}`).catch(() => {});
  const why = !call.relay ? tx('সার্ভারে রিলে (TURN) চালু নেই, তাই আলাদা নেটওয়ার্কে (মোবাইল ডেটা) কল যায় না। দুজনেই একই Wi-Fi-তে চেষ্টা করুন।', 'No relay (TURN) is set up on the server, so calls across different networks cannot connect. Try both on the same Wi-Fi.')
    : !d.mine.has('relay') ? tx('রিলে সার্ভারে পৌঁছানো গেল না (আপনার নেটওয়ার্ক আটকাচ্ছে বা রিলের পাসওয়ার্ড ঠিক নেই)। Wi-Fi বদলে আবার চেষ্টা করুন।', 'Could not reach the relay server (your network blocks it, or its password is wrong). Try another network.')
    : tx('দুই নেটওয়ার্কের মধ্যে সংযোগ হলো না। একটু পরে আবার চেষ্টা করুন।', 'The two networks would not connect. Try again in a moment.');
  endCall(why, true);
}
function callConnected() {
  call.state = 'live';
  call.started = Date.now();
  clearTimeout(call.ring);
  showCall('০০:০০');
  call.clock = setInterval(() => {
    const s = Math.floor((Date.now() - call.started) / 1000);
    $('call-status').textContent = `${num(Math.floor(s / 60)).padStart(2, num(0))}:${num(s % 60).padStart(2, num(0))}`;
  }, 1000);
}
async function getMedia(video) {
  try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { facingMode: 'user' } : false }); }
  catch { return null; }
}

async function startCall(video) {
  const f = friendById(CHAT.open);
  if (!f || call.state !== 'idle') return;
  if (!navigator.mediaDevices || !window.RTCPeerConnection) { chatToast(f, 'এই ব্রাউজারে কল করা যায় না।'); return; }
  Object.assign(call, { state: 'calling', peer: f, video, mine: true, ice: [] });
  showCall('কল করা হচ্ছে…');
  call.media = await getMedia(video);
  if (!call.media) { endCall(video ? 'ক্যামেরা ও মাইক্রোফোনের অনুমতি দিন।' : 'মাইক্রোফোনের অনুমতি দিন।', true); return; }
  if (call.state !== 'calling') { stopMedia(); return; }
  try {
    const pc = await newPeer();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const { online } = await signal({ type: 'offer', sdp: offer.sdp, video });
    if (!online) { logCall('missed'); endCall(`${f.name} এখন অফলাইন।`, true); return; }
    showCall('রিং হচ্ছে…');
    call.ring = setTimeout(() => { signal({ type: 'end' }).catch(() => {}); logCall('missed'); endCall('উত্তর মেলেনি।', true); }, 40000);
  } catch { endCall('কল শুরু করা যায়নি।', true); }
}

async function acceptCall() {
  if (call.state !== 'ringing') return;
  $('call-accept').hidden = true;
  $('call-status').textContent = 'সংযোগ হচ্ছে…';
  call.media = await getMedia(call.video);
  if (!call.media) { signal({ type: 'decline' }).catch(() => {}); endCall(call.video ? 'ক্যামেরা ও মাইক্রোফোনের অনুমতি দিন।' : 'মাইক্রোফোনের অনুমতি দিন।', true); return; }
  try {
    const pc = await newPeer();
    await pc.setRemoteDescription({ type: 'offer', sdp: call.offer });
    for (const c of call.ice.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await signal({ type: 'answer', sdp: answer.sdp });
    call.state = 'connecting';
    showCall('সংযোগ হচ্ছে…');
    clearTimeout(call.ring);
    call.ring = setTimeout(connectTimeout, 25000);
  } catch { signal({ type: 'end' }).catch(() => {}); endCall('কল ধরা যায়নি।', true); }
}

async function onSignal(from, data) {
  const f = friendById(from);
  if (!f || !data) return;
  if (data.type === 'offer') {
    if (call.state !== 'idle') { chatApi('signal', { to: from, data: { type: 'busy' } }).catch(() => {}); return; }
    Object.assign(call, { state: 'ringing', peer: f, video: !!data.video, mine: false, offer: data.sdp, ice: [] });
    showCall(data.video ? 'ভিডিও কল আসছে…' : 'ভয়েস কল আসছে…');
    call.ring = setTimeout(() => endCall(), 45000);
    return;
  }
  if (!call.peer || call.peer.id !== from) return;
  if (data.type === 'reoffer' && call.pc) {               // the other side is trying fresh routes
    try {
      await call.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      const answer = await call.pc.createAnswer();
      await call.pc.setLocalDescription(answer);
      await signal({ type: 'answer', sdp: answer.sdp });
      if (call.diag) call.diag.restarted = true;
    } catch { /* the timer ends it */ }
    return;
  }
  if (data.type === 'answer' && call.pc) {
    await call.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }).catch(() => {});
    for (const c of call.ice.splice(0)) await call.pc.addIceCandidate(c).catch(() => {});
    clearTimeout(call.ring);
    call.ring = setTimeout(connectTimeout, 25000);
    $('call-status').textContent = 'সংযোগ হচ্ছে…';
  } else if (data.type === 'ice') {
    if (call.diag) call.diag.theirs.add(candType(data.candidate));
    if (call.pc && call.pc.remoteDescription) call.pc.addIceCandidate(data.candidate).catch(() => {});
    else call.ice.push(data.candidate);
  } else if (data.type === 'decline') { logCall('declined'); endCall('কলটি ধরা হয়নি।', true); }
  else if (data.type === 'busy') { logCall('missed'); endCall(`${f.name} অন্য কলে আছেন।`, true); }
  else if (data.type === 'end') { if (call.state === 'live') logCall('ended'); endCall(call.state === 'live' ? 'কল শেষ।' : '', call.state === 'live'); }
}

// The caller records the call in the conversation, so it appears once.
function logCall(result) {
  if (!call.mine || !call.peer) return;
  const secs = call.started ? Math.round((Date.now() - call.started) / 1000) : 0;
  chatApi('send', { to: call.peer.id, kind: 'call', body: { video: call.video, result, secs } }).then(r => addMessage(r.message)).catch(() => {});
  call.mine = false;
}
function stopMedia() {
  if (call.media) for (const t of call.media.getTracks()) t.stop();
  call.media = null;
}
function endCall(message, linger) {
  try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch { /* not this browser */ }
  clearTimeout(call.ring);
  clearInterval(call.clock);
  if (call.pc) { call.pc.onconnectionstatechange = null; call.pc.close(); }
  stopMedia();
  $('call-remote').srcObject = $('call-local').srcObject = null;
  Object.assign(call, { state: 'idle', pc: null, offer: null, ice: [], started: 0, peer: linger ? call.peer : null });
  const box = $('call');
  if (message && !box.hidden) {
    box.dataset.state = 'over';
    $('call-status').textContent = message;
    $('call-accept').hidden = $('call-mic').hidden = $('call-cam').hidden = true;
    setTimeout(() => { if (call.state === 'idle') { box.hidden = true; call.peer = null; } }, 2200);
  } else { box.hidden = true; call.peer = null; }
}
function hangUp() {
  if (call.state === 'idle') { $('call').hidden = true; return; }
  const was = call.state;
  signal({ type: was === 'ringing' ? 'decline' : 'end' }).catch(() => {});
  if (was === 'live') logCall('ended'); else if (was === 'calling') logCall('missed');
  endCall();
}

// ---- wiring ----
(function initChat() {
  const input = $('chat-input'), send = $('chat-send');
  const refreshSend = () => { send.classList.toggle('like', !input.value.trim()); $('chat-form').classList.toggle('typing', !!input.value.trim()); };
  let lastTyping = 0;
  input.addEventListener('input', () => {
    refreshSend();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 132) + 'px';
    const t = threadOf(CHAT.open);
    if (t && Date.now() - lastTyping > 2500) { lastTyping = Date.now(); (t.members ? chatApi('group-typing', { group: t.id }) : chatApi('typing', { to: t.id })).catch(() => {}); }
  });
  const submit = () => {
    const text = input.value.trim();
    if (CHAT.edit) { if (text) saveEdit(text); return; }
    sendMessage('text', text || '👍');
    input.value = '';
    input.style.height = 'auto';
    refreshSend();
    send.classList.add('sent');
    setTimeout(() => send.classList.remove('sent'), 350);
  };
  $('chat-form').addEventListener('submit', e => { e.preventDefault(); submit(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && matchMedia('(min-width: 761px)').matches) { e.preventDefault(); submit(); }
    if (e.key === 'Escape' && CHAT.reply) clearReply();
  });
  refreshSend();

  // Attach, and a small emoji tray.
  const chooser = $('chat-file'), photos = $('chat-photo');
  // On a phone the paper-clip also offers a place, since there is no room for its own button.
  $('chat-attach').addEventListener('click', () => {
    if (!matchMedia('(max-width: 760px)').matches) { chooser.click(); return; }
    openModal('পাঠান', '', [item('file', 'ফাইল, ছবি বা ভিডিও', 'ফোন থেকে বেছে নিন', '', () => { closeModal(); chooser.click(); }),
                            item('pin', 'জায়গা', 'আপনার লোকেশন বা ম্যাপে খোলা জায়গা', '', () => { closeModal(); openShare(); })]);
  });
  $('chat-cam').addEventListener('click', () => photos.click());
  photos.addEventListener('change', () => { for (const f of [...photos.files].slice(0, 6)) sendFile(f); photos.value = ''; });
  $('chat-empty-new').addEventListener('click', () => openComposer());
  chooser.addEventListener('change', () => { sendFile(chooser.files[0]); chooser.value = ''; });
  const tray = $('chat-emoji-tray');
  for (const e of '😀 😂 🥰 😍 😎 😢 😡 👍 🙏 👏 🔥 ❤️ 🎉 💯 🤔 😴 🤝 🚌 🚆 ✈️ 🏖️ 🏞️ 🌧️ ☀️ 🍛 ☕ 📍 ✅'.split(' ')) {
    const b = el('button', null, e);
    b.type = 'button';
    b.addEventListener('click', () => { input.setRangeText(e, input.selectionStart, input.selectionEnd, 'end'); input.dispatchEvent(new Event('input')); input.focus(); });
    tray.appendChild(b);
  }
  $('chat-emoji').addEventListener('click', () => { tray.hidden = !tray.hidden; });
  input.addEventListener('focus', () => { if (matchMedia('(max-width: 760px)').matches) tray.hidden = true; });
  for (const t of $('chat-tabs').children) t.addEventListener('click', () => { inbox.tab = t.dataset.tab; renderList(); });
  $('chat-q').addEventListener('input', e => { inbox.q = e.target.value; renderList(); });
  $('chat-back').addEventListener('click', closeThread);
  $('chat-add').addEventListener('click', () => openComposer());
  $('chat-more').addEventListener('click', () => { const box = $('chat-info'); if (box.hidden) openInfo('main'); else box.hidden = true; });
  $('chat-who').addEventListener('click', () => openInfo('main'));
  $('chat-share').addEventListener('click', openShare);
  // One person: a direct call. A group: start its call, or join the one going on.
  const callBtn = video => { const t = threadOf(CHAT.open); if (t && t.members) joinGroupCall(t, video); else startCall(video); };
  $('chat-voice').addEventListener('click', () => callBtn(false));
  $('chat-video').addEventListener('click', () => callBtn(true));
  $('chat-mic').addEventListener('click', () => startRecording());
  $('chat-login').addEventListener('click', () => openLogin());
  $('call-hang').addEventListener('click', hangUp);
  $('call-accept').addEventListener('click', acceptCall);
  $('call-mic').addEventListener('click', e => {
    const track = call.media && call.media.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; e.currentTarget.classList.toggle('off', !track.enabled); }
  });
  $('call-spk').addEventListener('click', () => { call.loud = !call.loud; applyCallSound(); });
  $('call-cam').addEventListener('click', e => {
    const track = call.media && call.media.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; e.currentTarget.classList.toggle('off', !track.enabled); }
  });
  for (const b of document.querySelectorAll('.chat-btn')) b.addEventListener('click', () => go('chat'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && CHAT.open != null) markRead(CHAT.open); });
  document.addEventListener('click', e => { if (popOpen && !popOpen.contains(e.target)) closePop(); });
  $('chat-msgs').addEventListener('scroll', closePop, { passive: true });
  $('chat-msgs').addEventListener('scroll', paintBubbles, { passive: true });
  $('chat-msgs').addEventListener('load', measureBubbles, true);       // a picture that loads moves what is under it
  addEventListener('resize', measureBubbles);
  addEventListener('beforeunload', () => { if (call.state !== 'idle') hangUp(); });

  enter.chat = () => { if (ME) { loadChat(); if (CHAT.open != null) markRead(CHAT.open); } };
  chatAuthChanged();
})();
