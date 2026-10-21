// ---- Help centre: answers first, then a way to write to the people who run the app ----
// The page is a search box, topics, and questions with their answers. Whoever still needs help writes to
// support: one ticket is one conversation, staff answer from the admin panel, and the answer shows up here
// (and by e-mail when the server has a mail account).

const TICKET_KINDS = { account: 'অ্যাকাউন্ট বা লগইন', fare: 'ভাড়া ভুল', route: 'বাস, ট্রেন বা রুটের তথ্য ভুল', chat: 'মেসেজ বা কল', person: 'কারও বিরুদ্ধে অভিযোগ', verify: 'ভেরিফায়েড ব্যাজের আবেদন', other: 'অন্য কিছু' };
const TICKET_STATUS = { open: 'উত্তরের অপেক্ষায়', answered: 'উত্তর এসেছে', closed: 'বন্ধ' };
let TICKETS = [];

// Topics and answers, each as [Bangla, English]. Keep every answer true to what the app really does.
const HELP_TOPICS = [
  ['account', 'user', ['অ্যাকাউন্ট ও লগইন', 'Account and login']],
  ['fare', 'tag', ['ভাড়া', 'Fares']],
  ['route', 'bus', ['বাস, ট্রেন ও লঞ্চ', 'Buses, trains and launches']],
  ['chat', 'chat', ['মেসেজ ও কল', 'Messages and calls']],
  ['safety', 'shield', ['নিরাপত্তা ও রিপোর্ট', 'Safety and reporting']],
  ['map', 'pin', ['ম্যাপ ও জায়গা', 'Map and places']]
];
const HELP = [
  ['account', true, ['লগইন কোড ই-মেইলে আসছে না', 'The login code is not arriving'],
    ['প্রথমে ই-মেইলের স্প্যাম ও প্রমোশন ফোল্ডার দেখুন। ঠিকানাটি ঠিক লিখেছেন কি না মিলিয়ে নিন। এক মিনিট পরে আবার কোড চাইতে পারবেন; প্রতিটি কোড ১০ মিনিট চলে। তবুও না এলে নিচ থেকে আমাদের লিখুন।',
     'First check the spam and promotions folders. Make sure the address is typed correctly. You can ask for a new code after one minute; each code lasts 10 minutes. If it still does not arrive, write to us below.']],
  ['account', false, ['পাসওয়ার্ড লাগে না কেন?', 'Why is there no password?'],
    ['BD Map-এ পাসওয়ার্ড নেই। প্রতিবার লগইনের সময় আপনার ই-মেইলে ৬ সংখ্যার একটি কোড যায় — সেটিই আপনার চাবি। মনে রাখার কিছু নেই, চুরি হওয়ারও কিছু নেই।',
     'BD Map has no passwords. Each time you log in, a 6-digit code is sent to your e-mail — that is your key. Nothing to remember, nothing to steal.']],
  ['account', true, ['নাম, ছবি বা বায়ো কীভাবে বদলাবো?', 'How do I change my name, picture or bio?'],
    ['"আরও" পাতায় (কম্পিউটারে উপরের ডান দিকে) নিজের নামে চাপ দিন। ছবিতে চাপ দিলে নতুন ছবি বাছতে পারবেন; নাম ও বায়ো লিখে "সেভ করুন" চাপুন।',
     'Tap your name on the More page (top right on a computer). Tap the picture to choose a new one; edit the name and bio and press Save.']],
  ['account', false, ['অ্যাকাউন্ট কীভাবে মুছে ফেলবো?', 'How do I delete my account?'],
    ['প্রোফাইল খুলে ওপরের ⚙️ সেটিংসে যান, একদম নিচে "অ্যাকাউন্ট মুছে ফেলুন" চাপুন। প্রোফাইল, পোস্ট, ছবি-ভিডিও, ফলোয়ার, সব মেসেজ, পয়েন্ট, রেটিং ও সাপোর্টের কথোপকথন চিরতরে মুছে যায় — ফেরানো যায় না। অ্যাপ ছাড়াও ওয়েবসাইটে লগইন করে একইভাবে মোছা যায় (delete-account.html পাতায় ধাপগুলো আছে)।',
     'Open your profile, tap ⚙️ Settings at the top and press "Delete account" at the bottom. Your profile, posts, photos and videos, followers, all messages, points, ratings and support conversations are deleted for good — this cannot be undone. You can do the same on the website (the steps are on delete-account.html).']],
  ['fare', true, ['বাসের ভাড়া কোথা থেকে আসে?', 'Where do the bus fares come from?'],
    ['শহরের বাসের ভাড়া সরকার (বিআরটিএ) নির্ধারিত কিলোমিটার-প্রতি হার থেকে হিসাব করা। ঢাকা থেকে ৫১ জেলার দূরপাল্লার ভাড়া বিআরটিএর প্রকাশিত তালিকা থেকে নেওয়া। যেখানে "আনুমানিক" লেখা, সেটি হিসাব — নিশ্চিত ভাড়া নয়।',
     'City bus fares are worked out from the per-kilometre rate set by the government (BRTA). Long-distance fares from Dhaka to 51 districts come from BRTA\'s published chart. Where it says "estimate", it is a calculation, not a confirmed fare.']],
  ['fare', true, ['অ্যাপের ভাড়া আর বাসে নেওয়া ভাড়া মিলছে না', 'The fare in the app differs from what the bus charged'],
    ['ম্যাপে পথটি খুঁজে বাসের তালিকার নিচে "ভাড়া ঠিক নয়? আসল ভাড়া জানান" চাপুন এবং যা দিয়েছেন লিখুন। যাত্রীদের জানানো ভাড়ার মাঝের মানটি এরপর সবার জন্য দেখানো হয়।',
     'Search the trip on the map and press "Fare not right? Tell us the real fare" under the bus list, then enter what you paid. The middle value of riders\' reports is then shown to everyone.']],
  ['fare', false, ['এসি বাসের ভাড়া কেন আনুমানিক?', 'Why are AC bus fares estimates?'],
    ['এসি বাসের ভাড়া সরকার ঠিক করে না — প্রতিটি কোম্পানি নিজে ঠিক করে, আর মৌসুমভেদে বদলায়। তাই আমরা একটি সীমা দেখাই। নিশ্চিত ভাড়া কাউন্টারে জেনে নিন।',
     'The government does not set AC fares — each company sets its own, and they change with the season. So we show a range. Confirm the exact fare at the counter.']],
  ['fare', false, ['বাইক বা কারের ভাড়া কি ঠিক এটাই হবে?', 'Will a bike or car ride cost exactly this?'],
    ['না। রাইডের ভাড়া পাঠাও ও উবারের প্রকাশিত হার থেকে হিসাব করা একটি ধারণা; আসল ভাড়া সময়, যানজট ও চাহিদাভেদে বদলায়। BD Map থেকে এখনো রাইড ডাকা যায় না।',
     'No. Ride fares are an idea worked out from the published Pathao and Uber rates; the real fare changes with time, traffic and demand. You cannot book a ride from BD Map yet.']],
  ['route', true, ['কোন বাসে যাবো, কীভাবে খুঁজবো?', 'How do I find which bus to take?'],
    ['হোম বা ম্যাপ পাতায় "কোথা থেকে" ও "কোথায় যাবেন" লিখুন — কোন বাস, কোথায় উঠবেন, ভাড়া কত দেখাবে। অথবা "ঢাকার বাস" পাতায় জায়গার নাম লিখলে সেখানে যাওয়া সব বাস দেখাবে।',
     'Enter "from" and "to" on the Home or Map page — it shows which bus, where to board and the fare. Or type a place on the "Dhaka buses" page to see every bus that goes there.']],
  ['route', false, ['ট্রেনের সময় ও ভাড়া কতটা নির্ভরযোগ্য?', 'How reliable are the train times and fares?'],
    ['সময়সূচি বাংলাদেশ রেলওয়ের তথ্য থেকে তৈরি একটি খোলা ডেটাসেট থেকে নেওয়া। ভাড়ার আগে "~" চিহ্ন থাকলে সেটি দূরত্ব থেকে হিসাব করা আনুমানিক ভাড়া। টিকিট কাটার আগে রেলওয়ের কাছ থেকে মিলিয়ে নিন।',
     'The timetable comes from an open dataset built on Bangladesh Railway information. A "~" before a fare means it is estimated from the distance. Confirm with the railway before buying a ticket.']],
  ['route', false, ['লঞ্চের তথ্য কি অফিসিয়াল?', 'Is the launch information official?'],
    ['না। লঞ্চের সময়, ভাড়া ও নাম একটি খোলা তথ্যভান্ডার থেকে নেওয়া, যেখানে শুধু চালু লঞ্চগুলো রাখা হয়েছে। লঞ্চের সময় প্রায়ই বদলায় — যাওয়ার আগে ঘাটে জেনে নিন।',
     'No. Launch times, fares and names come from an open dataset, and only vessels it marks as running are listed. Launch times change often — confirm at the terminal before you go.']],
  ['route', true, ['কোনো তথ্য ভুল পেলে কী করবো?', 'What if I find wrong information?'],
    ['নিচের "সাপোর্টে লিখুন" থেকে "বাস, ট্রেন বা রুটের তথ্য ভুল" বেছে কোন পথ বা কোন বাস, আর সঠিক তথ্যটি কী — লিখে পাঠান। আমরা যাচাই করে ঠিক করে দেবো।',
     'Use "Write to support" below, choose "Wrong bus, train or route information", and tell us which route or bus and what the correct information is. We will check and fix it.']],
  ['chat', true, ['বন্ধু কীভাবে যোগ করবো?', 'How do I add a friend?'],
    ['"মেসেজ" পাতায় উপরের সবুজ বোতামে চাপ দিন, বন্ধুর ই-মেইল লিখে খুঁজুন এবং অনুরোধ পাঠান। তিনি গ্রহণ করলে আপনারা মেসেজ ও কল করতে পারবেন। বন্ধুকেও BD Map-এ অ্যাকাউন্ট খুলতে হবে।',
     'On the Messages page press the green button at the top, search your friend\'s e-mail and send a request. Once they accept, you can message and call each other. Your friend needs a BD Map account too.']],
  ['chat', true, ['কল লাগছে না বা শব্দ আসছে না', 'Calls do not connect or there is no sound'],
    ['দুজনেরই অ্যাপ খোলা থাকতে হবে। ব্রাউজার মাইক্রোফোন (ও ভিডিও কলে ক্যামেরা) ব্যবহারের অনুমতি চাইলে "Allow" দিন। মোবাইল ডাটায় কখনো কখনো কল সংযোগ হয় না — দুজনই ওয়াই-ফাই দিয়ে চেষ্টা করে দেখুন।',
     'Both of you need the app open. When the browser asks to use the microphone (and camera for video), choose Allow. Calls sometimes fail on mobile data — try with both of you on Wi-Fi.']],
  ['chat', false, ['অ্যাপ বন্ধ থাকলে মেসেজের নোটিফিকেশন আসে না কেন?', 'Why are there no notifications when the app is closed?'],
    ['এই সুবিধাটি এখনো তৈরি হয়নি। অ্যাপ খোলা থাকলে নতুন মেসেজ ও কল সাথে সাথে আসে; বন্ধ থাকলে পরেরবার খুললে না-পড়া মেসেজ দেখাবে।',
     'That feature is not built yet. With the app open, new messages and calls arrive at once; if it was closed, unread messages show the next time you open it.']],
  ['chat', false, ['আমার মেসেজ কে দেখতে পারে?', 'Who can see my messages?'],
    ['আপনি আর যাকে পাঠিয়েছেন তিনি। মেসেজ আমাদের সার্ভারে জমা থাকে, তবে হোয়াটসঅ্যাপের মতো এন্ড-টু-এন্ড এনক্রিপ্ট করা নয়। আমাদের অ্যাডমিন প্যানেলে কারও ব্যক্তিগত মেসেজ দেখানো হয় না।',
     'You and the person you sent them to. Messages are stored on our server, but they are not end-to-end encrypted like WhatsApp. Our admin panel does not show anyone\'s private messages.']],
  ['safety', true, ['কাউকে ব্লক বা রিপোর্ট করবো কীভাবে?', 'How do I block or report someone?'],
    ['তার সাথে কথোপকথন খুলে উপরের ডান দিকের তিন-বিন্দুতে চাপ দিন। "ব্লক করুন" বা "রিপোর্ট করুন ও ব্লক করুন" বেছে নিন। রিপোর্ট করলে কারণটি আমাদের টিমের কাছে যায়।',
     'Open the conversation and press the three dots at the top right. Choose "Block" or "Report and block". A report sends the reason to our team.']],
  ['safety', false, ['ব্লক করলে কী হয়?', 'What happens when I block someone?'],
    ['তিনি আর আপনাকে মেসেজ, কল বা বন্ধু হওয়ার অনুরোধ পাঠাতে পারবেন না, আর খুঁজলেও আপনাকে পাবেন না। "মেসেজ" পাতার ঢাল-চিহ্নে চাপ দিয়ে ব্লক করা মানুষদের তালিকা দেখা ও ব্লক তোলা যায়।',
     'They can no longer message, call or send you a friend request, and cannot find you by search. Press the shield icon on the Messages page to see the people you blocked and unblock them.']],
  ['safety', false, ['জরুরি বিপদে কী করবো?', 'What should I do in an emergency?'],
    ['জরুরি বিপদে সরাসরি ৯৯৯-এ কল করুন (পুলিশ, ফায়ার সার্ভিস, অ্যাম্বুলেন্স)। BD Map সাপোর্ট জরুরি সেবা নয় — আমরা সাধারণত এক-দুই দিনের মধ্যে উত্তর দিই।',
     'In an emergency call 999 directly (police, fire service, ambulance). BD Map support is not an emergency service — we usually reply within a day or two.']],
  ['map', false, ['একটি জায়গা খুঁজে পাচ্ছি না', 'I cannot find a place'],
    ['বাংলা, ইংরেজি বা বাংলিশ — যেকোনো বানানে লিখে দেখুন (যেমন "রমনা", "romna", "ramna")। পুরো নাম না লিখে প্রথম কয়েকটি অক্ষর লিখলেও পরামর্শ আসে। তবুও না পেলে ম্যাপে সেই জায়গায় চাপ দিয়ে বেছে নিন।',
     'Try any spelling — Bangla, English or Banglish (for example "রমনা", "romna", "ramna"). Typing just the first few letters also brings suggestions. If it still is not found, tap the spot on the map.']],
  ['map', false, ['আমার লোকেশন দেখাচ্ছে না', 'My location is not showing'],
    ['ব্রাউজার লোকেশন ব্যবহারের অনুমতি চাইলে "Allow" দিন, আর ফোনের লোকেশন (GPS) চালু রাখুন। আগে "Block" দিয়ে থাকলে ব্রাউজারের ঠিকানা-বারের তালা-চিহ্ন থেকে অনুমতি বদলে নিন।',
     'When the browser asks to use your location choose Allow, and keep the phone\'s location (GPS) on. If you chose Block before, change it from the lock icon in the browser\'s address bar.']],
  ['map', false, ['অ্যাপটি ইংরেজিতে দেখবো কীভাবে?', 'How do I see the app in English?'],
    ['কম্পিউটারে উপরের ডান দিকের "English" বোতামে, আর ফোনে "আরও" পাতার "ভাষা" সারিতে চাপ দিন। ম্যাপের নামসহ পুরো অ্যাপ বদলে যাবে।',
     'Press the language button at the top right on a computer, or the "Language" row on the More page on a phone. The whole app changes, map names included.']]
];

async function supportApi(path, body) {
  const res = await fetch('api/support/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
  if (!res.ok) throw new Error(data.error || 'server');
  return data;
}
const dateText = ts => new Date(ts).toLocaleDateString(NUM_LOCALE, { day: 'numeric', month: 'short' });

// ---- the answers ----
const helpView = { topic: null, q: '' };
function renderHelp() {
  const L = LANG === 'en' ? 1 : 0;
  const topics = $('help-topics');
  topics.replaceChildren();
  for (const [id, icon, name] of HELP_TOPICS) {
    const card = el('button', 'card help-topic no-tr' + (helpView.topic === id ? ' on' : ''));
    card.append(ic(icon), el('b', null, name[L]), el('span', null, `${num(HELP.filter(h => h[0] === id).length)} ${L ? 'answers' : 'টি উত্তর'}`));
    card.addEventListener('click', () => { helpView.topic = helpView.topic === id ? null : id; helpView.q = $('help-q').value = ''; renderHelp(); });
    topics.appendChild(card);
  }
  const q = helpView.q.trim().toLowerCase();
  const found = HELP.filter(([topic, popular, question, answer]) =>
    q ? (question.join(' ') + ' ' + answer.join(' ')).toLowerCase().includes(q) : helpView.topic ? topic === helpView.topic : popular);
  const topicName = helpView.topic && HELP_TOPICS.find(t => t[0] === helpView.topic)[2][L];
  $('help-label').textContent = q ? (L ? `${found.length} results` : `${num(found.length)} টি ফলাফল`) : topicName || (L ? 'Popular questions' : 'জনপ্রিয় প্রশ্ন');
  $('help-label').classList.add('no-tr');
  const list = $('help-list');
  list.replaceChildren();
  for (const [, , question, answer] of found) {
    const row = el('div', 'faq no-tr');
    const head = el('button', 'faq-q');
    head.append(el('span', null, question[L]), ic('chev'));
    const body = el('div', 'faq-a');
    body.appendChild(el('p', null, answer[L]));
    head.addEventListener('click', () => {
      const open = !row.classList.contains('open');
      for (const other of list.querySelectorAll('.faq.open')) other.classList.remove('open');
      row.classList.toggle('open', open);
    });
    row.append(head, body);
    list.appendChild(row);
  }
  list.hidden = !found.length;
  $('help-none').hidden = !!found.length;
}

// ---- writing to support ----
function renderTickets() {
  const box = $('support-list');
  box.replaceChildren();
  $('support-body').hidden = !ME || !TICKETS.length;
  for (const t of TICKETS) {
    const row = el('button', 'ticket');
    const head = el('div', 'h');
    head.append(Object.assign(el('b', 'no-tr'), { textContent: t.subject }), el('span', 'badge ' + (t.status === 'answered' ? 'g' : t.status === 'closed' ? '' : 'v'), TICKET_STATUS[t.status]));
    row.append(head, el('span', null, `${TICKET_KINDS[t.category]} · ${dateText(t.updated)}`));
    if (t.unread) row.classList.add('unread');
    row.addEventListener('click', () => openTicket(t.id));
    box.appendChild(row);
  }
  const n = TICKETS.filter(t => t.unread).length;
  for (const b of document.querySelectorAll('[data-support-badge]')) { b.textContent = num(n); b.hidden = !n; }
}
async function loadTickets() {
  if (!ME) { TICKETS = []; renderTickets(); return; }
  try { TICKETS = (await supportApi('list')).tickets; } catch { /* keep what is shown */ }
  renderTickets();
}
function supportAuthChanged() { loadTickets(); }

function openNewTicket(preset) {
  if (!ME) { openLogin(); return; }
  const kind = el('select');
  for (const [value, text] of Object.entries(TICKET_KINDS)) kind.appendChild(Object.assign(el('option'), { value, textContent: text }));
  if (preset) kind.value = preset;
  const kindBox = el('label', 'money');
  kindBox.append(el('span', null, 'বিষয়টি কী নিয়ে?'), kind);
  const [subjectBox, subject] = field('এক লাইনে সমস্যাটি', { type: 'text', maxLength: 120 });
  const [textBox, text] = field('বিস্তারিত লিখুন', { rows: 5, maxLength: 3000, placeholder: 'কী হয়েছে, কোথায়, কখন — যত পরিষ্কার লিখবেন তত দ্রুত সমাধান হবে।' }, 'textarea');
  const note = el('div', 'form-note', 'আমরা সাধারণত এক-দুই দিনের মধ্যে উত্তর দিই।');
  const send = button('send', 'পাঠান', async () => {
    send.disabled = true;
    try {
      const { id } = await supportApi('new', { category: kind.value, subject: subject.value, body: text.value });
      await loadTickets();
      openTicket(id);
    } catch (e) {
      send.disabled = false;
      note.className = 'form-note bad';
      note.textContent = e.message === 'short' ? 'বিষয় অন্তত ৩ অক্ষর, বিস্তারিত অন্তত ৫ অক্ষর লিখুন।' : e.message === 'slow' ? 'আজ অনেকগুলো অনুরোধ পাঠিয়েছেন। কাল আবার চেষ্টা করুন।' : 'পাঠানো যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।';
    }
  });
  openModal('সাপোর্টে লিখুন', '', [kindBox, subjectBox, textBox, note], [send]);
  subject.focus();
}

async function openTicket(id) {
  let data;
  try { data = await supportApi('thread?id=' + id); } catch { return; }
  const thread = el('div', 'ticket-thread');
  for (const m of data.messages) {
    const b = el('div', 'tmsg ' + (m.staff ? 'staff' : 'me'));
    b.append(el('small', null, m.staff ? `BD Map সাপোর্ট · ${dateText(m.sent)}` : dateText(m.sent)), Object.assign(el('p', 'no-tr'), { textContent: m.body }));
    thread.appendChild(b);
  }
  const body = [thread], actions = [];
  if (data.ticket.status !== 'closed') {
    const [replyBox, reply] = field('উত্তর লিখুন', { rows: 2, maxLength: 3000 }, 'textarea');
    body.push(replyBox);
    actions.push(button('send', 'পাঠান', async () => {
      if (!reply.value.trim()) return;
      try { await supportApi('reply', { id, body: reply.value }); openTicket(id); loadTickets(); } catch { /* stays open to try again */ }
    }));
    actions.push(button('check', 'সমাধান হয়েছে', async () => { await supportApi('close', { id }).catch(() => {}); closeModal(); loadTickets(); }, true));
  } else body.push(el('div', 'empty', 'এই কথোপকথনটি বন্ধ। নতুন সমস্যা হলে আবার লিখুন।'));
  openModal(data.ticket.subject, `${TICKET_KINDS[data.ticket.category]} · ${TICKET_STATUS[data.ticket.status]}`, body, actions);
  $('m-title').classList.add('no-tr');
  $('m-body').scrollTop = $('m-body').scrollHeight;
  loadTickets();
}

$('support-new').addEventListener('click', () => openNewTicket());
$('help-q').addEventListener('input', e => { helpView.q = e.target.value; helpView.topic = null; renderHelp(); });
enter.support = loadTickets;
renderHelp();
renderTickets();
