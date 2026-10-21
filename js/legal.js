// The public pages (privacy, terms, deleting an account): Bangla or English. Opens in the app's language
// (or ?lang=en, the link given to the app stores); the switch here does not change the app's own setting.
(function () {
  const pick = lang => {
    for (const a of document.querySelectorAll('article[lang]')) a.hidden = a.lang !== lang;
    for (const b of document.querySelectorAll('.langs button')) b.classList.toggle('on', b.dataset.l === lang);
    document.documentElement.lang = lang;
  };
  let lang = new URLSearchParams(location.search).get('lang');
  if (lang !== 'en' && lang !== 'bn') { try { lang = localStorage.getItem('bdmap.lang') === 'en' ? 'en' : 'bn'; } catch { lang = 'bn'; } }
  for (const b of document.querySelectorAll('.langs button')) b.addEventListener('click', () => pick(b.dataset.l));
  pick(lang);
})();
