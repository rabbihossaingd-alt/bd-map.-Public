// উত্তর-টেমপ্লেট: the answers the team gives again and again. In a ticket, "/" inserts one; {নাম} becomes the person's name.
import { api, can, errText } from '../api.js';
import { attrs, badge, button, confirmAction, empty, errorBox, field, h, modal, skeleton, toast, when } from '../ui.js';
import { num } from '../fmt.js';

export async function render(box) {
  const list = h('div');
  box.append(h('div', 'page-head', h('div', null, h('h1', null, 'উত্তর-টেমপ্লেট'), h('p', 'muted', 'টিকিটের উত্তরে "/" লিখে এগুলো ঢোকানো যায়। {নাম} লিখলে সেখানে ব্যবহারকারীর নাম বসে।')),
    can('support.reply') ? button('নতুন টেমপ্লেট', { kind: 'primary', ic: 'plus', onClick: () => edit() }) : null), list);
  let macros = [];
  async function load() {
    list.replaceChildren(skeleton(4));
    try { macros = (await api('macros')).macros; paint(); } catch (e) { list.replaceChildren(errorBox(e, load)); }
  }
  function paint() {
    if (!macros.length) { list.replaceChildren(empty('এখনো কোনো টেমপ্লেট নেই।', 'বারবার দেওয়া উত্তরগুলো এখানে রাখুন।', 'reply')); return; }
    const groups = new Map();
    for (const m of macros) { const k = m.category || 'অন্য'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
    list.replaceChildren(...[...groups].map(([cat, items]) => h('section', 'section', h('h2', null, cat), h('div', 'macro-grid', ...items.map(m => h('div', 'card macro',
      h('div', 'card-head', h('h3', null, m.title), badge(`${num(m.uses)} বার`, '')), h('p', 'muted', m.body), h('small', 'faint', m.byName ? `শেষ বদল ${m.byName} · ` : '', when(m.updated)),
      can('support.reply') ? h('div', 'row-acts', button('বদলান', { small: true, onClick: () => edit(m) }), button('মুছুন', { small: true, kind: 'ghost', onClick: () => remove(m) })) : null))))));
  }
  function edit(m) {
    const title = attrs(h('input', 'input'), { maxlength: '80', value: m ? m.title : '' }), cat = attrs(h('input', 'input'), { maxlength: '30', value: m ? m.category : '', placeholder: 'যেমন: অ্যাকাউন্ট, ভাড়া' });
    const body = attrs(h('textarea', 'input'), { rows: '6', maxlength: '3000' }); body.value = m ? m.body : 'প্রিয় {নাম}, ';
    const mm = modal({ title: m ? 'টেমপ্লেট বদলান' : 'নতুন টেমপ্লেট', wide: true, body: h('div', 'confirm', field('নাম', title), field('বিভাগ', cat), field('লেখা', body, '{নাম} = ব্যবহারকারীর নামের প্রথম অংশ')),
      actions: [button('বাতিল', { kind: 'ghost', onClick: () => mm.close() }), button('সেভ', { kind: 'primary', onClick: async () => {
        if (!title.value.trim() || !body.value.trim()) { toast('নাম আর লেখা দুটোই লাগবে।', { bad: true }); return; }
        try { await api('macros/save', { id: m && m.id, title: title.value, body: body.value, category: cat.value }); mm.close(); toast('সেভ হলো।'); load(); } catch (e) { toast(errText(e), { bad: true }); }
      } })] });
  }
  async function remove(m) {
    const ok = await confirmAction({ tier: 2, title: `"${m.title}" মুছবেন?`, text: 'খতিয়ানে আগের লেখাটা থাকবে।', reasons: null, confirmText: 'মুছুন' });
    if (!ok) return;
    try { await api('macros/delete', { id: m.id }); toast('মুছে ফেলা হলো।', { undo: async () => { await api('macros/save', { title: m.title, body: m.body, category: m.category }); load(); } }); load(); } catch (e) { toast(errText(e), { bad: true }); }
  }
  await load();
  return {};
}
