// The e-mails Manzeela sends, as a person would want to receive them: the logo, one clear message, the code large
// enough to read at a glance, a word on safety, and a quiet footer. Every mail has a plain-text twin.
// Built for mail apps, not browsers: tables, inline styles, no web fonts, no images except the logo (a PNG — Gmail
// shows no SVG), colours that survive dark mode, nothing wider than 480 px.

const BRAND = process.env.BRAND_NAME || 'Manzeela';
const SITE = (process.env.SITE_URL || 'https://manzeela.com').replace(/\/+$/, '');
const HELP = process.env.HELP_EMAIL || 'help@manzeela.com';
const GREEN = '#0a7d5a', INK = '#0b0f14', SOFT = '#5b6472', LINE = '#e7e9ee', PAPER = '#f4f5f7';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans Bengali','Hind Siliguri',Helvetica,Arial,sans-serif";

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const paras = text => esc(text).split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;font:16px/1.6 ${FONT};color:${INK};">${p.replace(/\n/g, '<br>')}</p>`).join('');

// One mail: preheader (the grey line under the subject in the inbox), title, content, an optional note under it.
function shell({ preheader, title, content, note }) {
  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
    <tr><td style="padding:0 4px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;"><a href="${SITE}" style="text-decoration:none;"><img src="${SITE}/img/mail-logo.png" width="40" height="40" alt="${BRAND}" style="display:block;border:0;border-radius:11px;"></a></td>
        <td style="vertical-align:middle;padding-left:10px;font:700 20px/1 ${FONT};color:${INK};letter-spacing:-.3px;">${BRAND}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:22px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:5px;line-height:5px;font-size:0;background:${GREEN};background-image:linear-gradient(90deg,#0a7d5a,#12a77a 55%,#f59e0b);">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 28px;">
          <h1 style="margin:0 0 12px;font:700 24px/1.3 ${FONT};color:${INK};letter-spacing:-.3px;">${esc(title)}</h1>
          ${content}
        </td></tr>
      </table>
    </td></tr>
    ${note ? `<tr><td style="padding:18px 8px 0;font:13px/1.6 ${FONT};color:${SOFT};">${note}</td></tr>` : ''}
    <tr><td style="padding:26px 8px 0;border-top:0;">
      <p style="margin:0 0 6px;font:600 13px/1.5 ${FONT};color:${INK};">${BRAND} · বাংলাদেশ ঘুরে দেখার অ্যাপ</p>
      <p style="margin:0;font:12px/1.7 ${FONT};color:${SOFT};">
        <a href="${SITE}" style="color:${SOFT};text-decoration:underline;">${SITE.replace(/^https?:\/\//, '')}</a> &nbsp;·&nbsp;
        <a href="${SITE}/privacy.html" style="color:${SOFT};text-decoration:underline;">প্রাইভেসি</a> &nbsp;·&nbsp;
        <a href="mailto:${HELP}" style="color:${SOFT};text-decoration:underline;">${HELP}</a>
      </p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

// The sign-in code: the code first in the subject (it shows in the notification), large and spaced in the mail.
function codeMail(code) {
  const c = String(code);
  const content = `
    <p style="margin:0 0 22px;font:16px/1.6 ${FONT};color:${SOFT};">${BRAND}-এ ঢুকতে নিচের কোডটি দিন।</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" style="background:#f0f7f4;border:1px solid #d5ebe2;border-radius:16px;padding:20px 12px;">
        <div style="font:700 38px/1 'SF Mono',Menlo,Consolas,'Courier New',monospace;letter-spacing:10px;color:${INK};padding-left:10px;">${esc(c)}</div>
        <div style="margin-top:12px;font:13px/1.4 ${FONT};color:${SOFT};">কোডটি ১০ মিনিট পর্যন্ত চলবে</div>
      </td>
    </tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr>
      <td style="width:28px;vertical-align:top;font:18px/1.4 ${FONT};">🔒</td>
      <td style="vertical-align:top;font:14px/1.6 ${FONT};color:${INK};"><b>কোডটি কাউকে দেবেন না।</b> ${BRAND} কখনো ফোন, মেসেজ বা ই-মেইলে আপনার কোড চায় না।</td>
    </tr></table>
    <p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${LINE};font:13px/1.6 ${FONT};color:${SOFT};">Your ${BRAND} code is <b style="color:${INK};">${esc(c)}</b>. It is valid for 10 minutes. Never share it with anyone.</p>`;
  return {
    subject: `${c} — আপনার ${BRAND} কোড`,
    text: `আপনার ${BRAND} কোড: ${c}\n\nকোডটি ১০ মিনিট পর্যন্ত চলবে। কোডটি কাউকে দেবেন না — ${BRAND} কখনো আপনার কোড চায় না।\nআপনি না চেয়ে থাকলে এই ই-মেইলটি উপেক্ষা করুন; কোড ছাড়া কেউ আপনার অ্যাকাউন্টে ঢুকতে পারবে না।\n\nYour ${BRAND} code is ${c}. It is valid for 10 minutes. Never share it with anyone.\n\n— ${BRAND} · ${SITE}`,
    html: shell({ preheader: `কোডটি ১০ মিনিট পর্যন্ত চলবে। কাউকে দেবেন না।`, title: 'আপনার লগইন কোড', content,
      note: 'আপনি এই কোড না চেয়ে থাকলে এই ই-মেইলটি উপেক্ষা করুন — কোড ছাড়া কেউ আপনার অ্যাকাউন্টে ঢুকতে পারবে না।' })
  };
}

// A reply from the support team, under the subject the person wrote.
function supportMail(subject, reply) {
  const content = `
    <p style="margin:0 0 18px;font:14px/1.5 ${FONT};color:${SOFT};">বিষয়: ${esc(subject)}</p>
    <div style="border-left:3px solid ${GREEN};padding:2px 0 2px 16px;">${paras(reply)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;"><tr>
      <td style="background:${INK};border-radius:12px;"><a href="${SITE}/#/support" style="display:inline-block;padding:13px 22px;font:600 15px/1 ${FONT};color:#ffffff;text-decoration:none;">উত্তর দিন</a></td>
    </tr></table>`;
  return {
    subject: `${BRAND} সাপোর্ট: ${subject}`,
    text: `${reply}\n\n— ${BRAND} সাপোর্ট\nউত্তর দিতে অ্যাপের "সাহায্য ও সাপোর্ট" পাতায় যান: ${SITE}/#/support`,
    html: shell({ preheader: String(reply).slice(0, 90), title: 'সাপোর্ট থেকে উত্তর', content })
  };
}

// A creator's earnings went out.
function payoutMail(amount, method, ref) {
  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" style="background:#f0f7f4;border:1px solid #d5ebe2;border-radius:16px;padding:22px 12px;">
        <div style="font:700 36px/1 ${FONT};color:${GREEN};">৳${esc(amount)}</div>
        <div style="margin-top:10px;font:14px/1.4 ${FONT};color:${SOFT};">আপনার ${esc(method)} নম্বরে পাঠানো হয়েছে</div>
      </td>
    </tr></table>
    <p style="margin:20px 0 0;font:14px/1.6 ${FONT};color:${INK};">লেনদেন নম্বর: <b>${esc(ref)}</b></p>`;
  return {
    subject: `${BRAND}: ৳${amount} পাঠানো হয়েছে`,
    text: `আপনার ${method} নম্বরে ৳${amount} পাঠানো হয়েছে। লেনদেন নম্বর: ${ref}\n\n— ${BRAND}`,
    html: shell({ preheader: `আপনার ${method} নম্বরে ৳${amount} পাঠানো হয়েছে`, title: 'আপনার আয় পাঠানো হয়েছে', content })
  };
}

module.exports = { BRAND, codeMail, supportMail, payoutMail };
