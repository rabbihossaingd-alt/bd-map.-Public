// ---- The back button closes what is open, as in an app ----
// Android's back gesture (and the browser's back button) used to leave the page while a sheet, the reels or the
// login was open. Now every overlay that opens adds one step to the history, and going back closes the one on top;
// closing it with its own × takes that step away again. Tapping the bottom bar closes them too, so a district card
// no longer stays over the page you went to.
// Overlays are noticed by watching the page (a MutationObserver), so the code that opens them need not know.
(function () {
  const phone = () => matchMedia('(max-width: 760px)').matches;
  const tap = (root, sel) => () => { const b = root.querySelector(sel); if (b) b.click(); else root.remove(); };
  // Things laid over the page, each with how to close it. Elements are found as children of <body>.
  const KINDS = [
    ['.studio', () => () => closeStudio()],
    ['.reels', () => () => closeReels()],
    ['.stories', n => tap(n, '.st-x')],
    ['.cs', n => () => n.click()],                                   // the comment sheet closes on a tap outside it
    ['.notif', n => tap(n, '.notif-head .icon-btn')],
    ['.auth', n => tap(n, '.auth-x')],
    ['.dg-sheet', n => tap(n, '.dg-x')],
    ['.gm-sheet', n => tap(n, '.gm-x')],
    ['.live-hub', n => tap(n, '.lh-top .lv-icon')],
    ['.live-room', n => tap(n, '.lv-x')],
    ['.ts-player', n => tap(n, '.ts-x')]
  ];
  // States of the page itself: open when the test says so.
  const STATES = [
    ['modal', () => !$('modal').hidden, () => closeModal()],
    ['lightbox', () => !$('lightbox').hidden, () => $('lb-close').click()],
    ['place', () => document.body.dataset.page === 'trip' && !$('place-card').hidden, () => hidePlace()],
    ['dir', () => document.body.dataset.page === 'trip' && $('page-trip').classList.contains('dir-on'), () => openDirections(false)],
    ['mapmode', () => !!document.querySelector('.mm-sheet:not([hidden])'), () => { const s = document.querySelector('.mm-sheet:not([hidden])'); if (s) s.hidden = true; }],
    ['chat', () => phone() && document.body.dataset.page === 'chat' && document.body.classList.contains('chat-open'), () => closeThread()]
  ];

  let seq = 0, skip = 0;
  const stack = [];                                                  // { key, id, close }, oldest first
  const openNow = () => {
    const found = [];
    for (const n of document.body.children) {
      if (n.classList.contains('out') || n.hidden) continue;
      const k = KINDS.find(([sel]) => n.matches(sel));
      if (k) found.push({ key: n, close: k[1](n) });
    }
    for (const [key, isOpen, close] of STATES) { try { if (isOpen()) found.push({ key, close }); } catch { /* not on this page yet */ } }
    return found;
  };
  const ours = () => history.state && typeof history.state.mz === 'number';

  // Brought up to date after every change on the page. A step going back is decided by the browser when it is asked
  // for, not when it happens, so nothing new is pushed while one is under way; and when one overlay closes as another
  // opens (the login closing the dialog under it), the closed one's step is handed to the new one instead.
  function sync() {
    if (skip) return;                                                // a step back is under way: look again after it
    const now = openNow();
    const gone = stack.filter(item => !now.some(o => o.key === item.key));
    const fresh = now.filter(o => !stack.some(s => s.key === o.key));
    for (const item of gone) stack.splice(stack.indexOf(item), 1);
    let undo = ours() ? gone.length : 0;                             // only steps this page added can be taken back
    for (const o of fresh) {
      const item = { key: o.key, id: ++seq, close: o.close };
      stack.push(item);
      if (undo > 0) { history.replaceState({ mz: item.id }, ''); undo--; }
      else history.pushState({ mz: item.id }, '');
    }
    if (undo > 0) { skip = 1; history.go(-undo); }
    for (const item of stack) { const o = now.find(x => x.key === item.key); if (o) item.close = o.close; }
  }

  addEventListener('popstate', e => {
    if (skip) { skip = 0; sync(); return; }
    // going back past an overlay's step closes it (and anything opened after it)
    const at = e.state && typeof e.state.mz === 'number' ? e.state.mz : 0;
    const closing = stack.filter(s => s.id > at);
    if (!closing.length) return;
    for (const item of closing.reverse()) {
      stack.splice(stack.indexOf(item), 1);
      try { item.close(); } catch (err) { console.warn('back: could not close', err); }
    }
  });

  // The bottom bar (or any link to a page) closes what is open over the current page, without history steps.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#/"], a[href="#"], [data-nav]');
    if (!a || !stack.length) return;
    if (KINDS.some(([sel]) => a.closest(sel)) || a.closest('#modal')) return;   // a link inside a sheet decides itself
    // the map's and the chat's own state stay with their page (they leave the list once the page changes)
    const over = stack.filter(s => !['place', 'dir', 'chat'].includes(s.key));
    for (const item of over.reverse()) {
      stack.splice(stack.indexOf(item), 1);                            // out of the list first: no history step to undo
      try { item.close(); } catch { /* already gone */ }
    }
  }, true);

  // Overlays that stop the page scrolling (overflow: hidden on <body>) made phones jump to the top, and closing them left
  // you there — the feed lost its place. The last place is remembered and given back when they close.
  const LOCKS = ['reels-open', 'auth-open', 'studio-open'];
  const locked = () => LOCKS.some(c => document.body.classList.contains(c));
  let lastY = scrollY, wasLocked = false, lockPage = '';
  addEventListener('scroll', () => { if (!locked()) lastY = scrollY; }, { passive: true });
  function keepPlace() {
    const now = locked();
    if (now && !wasLocked) lockPage = document.body.dataset.page;
    if (!now && wasLocked && document.body.dataset.page === lockPage && Math.abs(scrollY - lastY) > 2) {
      const y = lastY;
      scrollTo(0, y);
      requestAnimationFrame(() => { if (Math.abs(scrollY - y) > 2) scrollTo(0, y); });   // once more after the page has its height back
    }
    wasLocked = now;
  }

  const watch = new MutationObserver(() => { keepPlace(); sync(); });
  watch.observe(document.body, { childList: true, attributes: true, attributeFilter: ['class', 'data-page'] });
  for (const id of ['modal', 'lightbox', 'place-card', 'page-trip']) { const n = $(id); if (n) watch.observe(n, { attributes: true, attributeFilter: ['hidden', 'class'] }); }
  document.addEventListener('DOMContentLoaded', sync);
  // the map's style sheet is made later: watch for it
  const later = setInterval(() => { const s = document.querySelector('.mm-sheet'); if (s) { watch.observe(s, { attributes: true, attributeFilter: ['hidden'] }); clearInterval(later); } }, 1000);
  sync();
})();
