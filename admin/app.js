// The admin panel's start: who is this, is the panel unlocked, then the frame. A locked panel (never opened, idle
// for 30 minutes, or past 12 hours) asks for a code: the authenticator app's, or one sent by e-mail.
import { api, errText, on, session } from './api.js';
import { attrs, button, h, icon, stepUp, toast } from './ui.js';
import { buildShell } from './shell.js';

const root = document.getElementById('app');

async function start() {
  let me;
  try { me = await api('me'); }
  catch (e) { return gate(e.status === 403 ? 'forbidden' : 'offline'); }
  session.me = me;
  if (!me.elevated) return unlock();
  session.csrf = me.csrf;
  buildShell(root);
}

// not on the team, or the server unreachable
function gate(kind) {
  root.replaceChildren(h('div', 'gate', h('div', 'gate-card', h('span', 'logo lg'), h('h1', null, 'Manzeela অ্যাডমিন'),
    h('p', null, kind === 'forbidden' ? 'এই পাতাটি শুধু টিমের জন্য। টিমের অ্যাকাউন্ট দিয়ে অ্যাপে লগইন করে আবার আসুন।' : 'সার্ভারের সাথে যোগাযোগ করা যায়নি। একটু পরে আবার চেষ্টা করুন।'),
    kind === 'forbidden' ? attrs(h('a', 'btn primary', 'অ্যাপে লগইন করুন'), { href: 'index.html#/more' }) : button('আবার চেষ্টা', { kind: 'primary', ic: 'refresh', onClick: () => start() }))));
}

// the unlock screen
function unlock(reason) {
  const me = session.me;
  const err = h('p', 'form-err'), input = attrs(h('input', 'input code'), { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: me.method === 'totp' ? '11' : '6', placeholder: '••••••', 'aria-label': 'কোড' });
  const lead = h('p', null, reason === 'locked' ? 'নিরাপত্তার জন্য প্যানেল লক হয়ে গেছে (৩০ মিনিট নিষ্ক্রিয়, বা ১২ ঘণ্টা পূর্ণ)। আবার খুলতে কোড দিন।' : 'প্যানেল খুলতে আপনার কোড দিন।');
  const codeBox = h('div', 'unlock-code', input); codeBox.hidden = true;
  const verify = button('খুলুন', { kind: 'primary', onClick: async () => {
    try { const r = await api('elevate/verify', { code: input.value.trim() }); session.csrf = r.csrf; if (reason === 'locked') location.reload(); else await start(); }
    catch (e) { err.textContent = errText(e); input.select(); }
  } });
  verify.hidden = true;
  const ask = button(me.method === 'totp' ? 'অথেন্টিকেটর কোড দিন' : 'ই-মেইলে কোড পাঠান', { kind: 'primary', ic: 'lock', onClick: async () => {
    try {
      const r = await api('elevate/start', {});
      if (r.devCode) input.value = r.devCode;           // only on this computer, when no mail is set up
      lead.textContent = r.method === 'totp' ? 'অথেন্টিকেটর অ্যাপের ৬ সংখ্যার কোড (বা একটি ব্যাকআপ কোড) দিন।' : r.wait ? 'একটু আগেই কোড পাঠানো হয়েছে — মেইল দেখুন।' : `${me.user.email} ঠিকানায় একটি কোড পাঠানো হয়েছে।`;
      codeBox.hidden = false; verify.hidden = false; ask.hidden = true; input.focus();
    } catch (e) {
      err.textContent = e.message === 'needs-2fa' ? 'টু-স্টেপ ভেরিফিকেশন ছাড়া আর প্যানেলে ঢোকা যাবে না (৭ দিনের সময় শেষ)। অ্যাপের সেটিংসে চালু করুন।' : errText(e);
    }
  } });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') verify.click(); });
  root.replaceChildren(h('div', 'gate', h('div', 'gate-card', h('span', 'logo lg'), h('h1', null, 'প্যানেল খুলুন'), h('p', 'muted', `${me.user.name} · ${me.roleName}`), lead, codeBox, err, ask, verify,
    h('p', 'hint', icon('shield'), ' প্যানেল ৩০ মিনিট নিষ্ক্রিয় থাকলে, আর সর্বোচ্চ ১২ ঘণ্টা পরে নিজে থেকেই লক হয়।'),
    me.twofa.required ? attrs(h('a', 'btn secondary', 'টু-স্টেপ চালু করুন'), { href: 'index.html#/settings' }) : null)));
  if (me.method === 'totp') ask.click();
}

on('locked', () => { if (session.csrf) { session.csrf = ''; unlock('locked'); } });
on('stepup', () => stepUp());
start();
