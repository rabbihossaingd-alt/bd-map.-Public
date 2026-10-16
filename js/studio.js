// ---- The studio: making a post, a reel or a story, the way Instagram does it ----
// Choose from the gallery or open the camera (with live filters, photo or video), pick a filter and music, write
// a caption, share. A photo's filter is drawn into the picture where the browser can; a video keeps it as a
// setting (fx) that every phone applies while playing. Music is stored the same way (see music.js).

const FILTERS = [
  ['', 'স্বাভাবিক', 'Normal', 'none'],
  ['bright', 'উজ্জ্বল', 'Bright', 'brightness(1.12) contrast(1.05) saturate(1.18)'],
  ['warm', 'উষ্ণ', 'Warm', 'sepia(.22) saturate(1.3) hue-rotate(-8deg) brightness(1.05)'],
  ['cool', 'শীতল', 'Cool', 'saturate(1.05) hue-rotate(14deg) brightness(1.03) contrast(1.06)'],
  ['sunset', 'সূর্যাস্ত', 'Sunset', 'sepia(.3) saturate(1.6) hue-rotate(-18deg) contrast(1.05)'],
  ['green', 'সবুজ', 'Green', 'saturate(1.25) hue-rotate(22deg) brightness(1.03)'],
  ['drama', 'ড্রামা', 'Drama', 'contrast(1.35) saturate(1.2) brightness(.92)'],
  ['vintage', 'ভিনটেজ', 'Vintage', 'sepia(.45) contrast(.92) brightness(1.05) saturate(.85)'],
  ['soft', 'নরম', 'Soft', 'contrast(.9) brightness(1.08) saturate(.9)'],
  ['fade', 'ম্লান', 'Fade', 'contrast(.85) brightness(1.1) saturate(.75)'],
  ['mono', 'সাদাকালো', 'Mono', 'grayscale(1) contrast(1.12)']
];
const fxCss = id => (FILTERS.find(f => f[0] === id) || FILTERS[0])[3];
const fxName = f => LANG === 'en' ? f[2] : f[1];
// Safari cannot draw a canvas through a CSS filter yet; there the filter stays a setting.
const canvasFilters = (() => { try { const c = document.createElement('canvas').getContext('2d'); c.filter = 'grayscale(1)'; return c.filter === 'grayscale(1)'; } catch { return false; } })();

let studio = null;
function openNewPost(opts) {
  if (!ME) { openLogin(); return; }
  if (!opts || opts instanceof Event) opts = {};
  closeStudio();
  const st = studio = { mode: opts.mode || 'post', file: null, kind: '', url: '', fx: '', music: opts.music || null, orig: !opts.music, stream: null, facing: 'user', box: el('div', 'studio'), preview: null, layers: [] };
  loadCatalogue();                                     // the songs are ready by the time the music sheet opens
  document.body.appendChild(st.box);
  document.body.classList.add('studio-open');
  addEventListener('keydown', studioKey);
  if (opts.music) openCamera(); else drawSource();
}
function studioKey(e) { if (e.key === 'Escape' && $('modal').hidden) closeStudio(); }
function closeStudio() {
  if (!studio) return;
  stopCamera();
  if (studio.preview) studio.preview.stop();
  if (studio.pre && studio.pre.xhr && !studio.pre.done) studio.pre.xhr.abort();
  if (studio.url) URL.revokeObjectURL(studio.url);
  dropItems(studio);
  studio.box.remove();
  studio = null;
  document.body.classList.remove('studio-open');
  removeEventListener('keydown', studioKey);
}
const sbtn = (icon, label, fn, cls = '') => { const b = el('button', 'sbtn ' + cls); b.innerHTML = svg(icon); b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); return b; };
function studioBar(title, right) {
  const bar = el('header', 'st-bar');
  bar.append(sbtn('close', 'বন্ধ করুন', closeStudio), el('b', null, title), right || el('span'));
  return bar;
}
const MODES = [['post', 'পোস্ট', 'Post'], ['story', 'স্টোরি', 'Story'], ['reel', 'রিল', 'Reel']];
function modeSwitch(onPick) {
  const sw = el('div', 'st-modes');
  for (const [k, bn, en] of MODES) {
    const b = el('button', k === studio.mode ? 'on' : '', LANG === 'en' ? en : bn);
    b.addEventListener('click', () => { studio.mode = k; onPick(); });
    sw.appendChild(b);
  }
  return sw;
}
const modeTitle = () => ({ post: 'নতুন পোস্ট', story: 'নতুন স্টোরি', reel: 'নতুন রিল' })[studio.mode];

// ---- 1. where it comes from ----
function drawSource() {
  const st = studio;
  stopCamera();
  const chooser = Object.assign(el('input'), { type: 'file', accept: st.mode === 'reel' ? 'video/*' : 'image/*,video/*', hidden: true, multiple: st.mode === 'post' });
  chooser.addEventListener('change', () => {
    const files = [...chooser.files];
    if (files.length > 1 && st.mode === 'post') {
      const photos = files.filter(f => f.type.startsWith('image')).slice(0, 10);
      if (photos.length < files.length) chatToast(ME, files.length > 10 && photos.length === 10 ? tx('একটি পোস্টে ১০টি পর্যন্ত ছবি।', 'Up to 10 photos in one post.') : tx('একসাথে কয়েকটি বাছলে শুধু ছবি নেওয়া হয়; ভিডিও আলাদা পোস্ট করুন।', 'Several at once are photos only; post videos on their own.'));
      if (photos.length > 1) { takeMany(photos); return; }
      if (photos.length) { takeFile(photos[0], false); return; }
    }
    if (files[0]) takeFile(files[0], false);
  });
  const stage = el('div', 'st-source');
  const art = el('div', 'st-art');
  art.innerHTML = `<span class="a">${svg('image')}</span><span class="b">${svg('play')}</span>`;
  const gallery = el('button', 'st-cta', 'গ্যালারি থেকে বেছে নিন');
  gallery.addEventListener('click', () => chooser.click());
  const cam = el('button', 'st-cta ghost');
  cam.innerHTML = svg('camera');
  cam.appendChild(document.createTextNode(LANG === 'en' ? 'Open camera' : 'ক্যামেরা খুলুন'));
  cam.addEventListener('click', openCamera);
  stage.append(art, el('b', null, st.mode === 'reel' ? 'রিলের জন্য ভিডিও' : st.mode === 'story' ? '২৪ ঘণ্টার স্টোরি' : 'ছবি ও ভিডিও এখানে'),
    el('span', null, st.mode === 'reel' ? 'গ্যালারি থেকে ভিডিও দিন, অথবা ক্যামেরায় রেকর্ড করুন — গান ও ফিল্টার পরে।' : 'গ্যালারি থেকে বেছে নিন, অথবা এখনই ক্যামেরায় তুলুন।'), gallery, cam, chooser);
  if (st.mode === 'story') {
    const words = el('button', 'st-cta ghost st-words');
    words.append(el('i', null, 'Aa'), document.createTextNode(LANG === 'en' ? 'Words on a colour' : 'রঙের ওপর লেখা'));
    words.addEventListener('click', async () => { st.textStory = 0; takeFile(await wordsBackground(0), true); });
    stage.insertBefore(words, chooser);
  }
  if (st.mode === 'post') {
    const words = el('button', 'st-link', 'শুধু লেখা পোস্ট করুন');
    words.addEventListener('click', () => { closeStudio(); openQuickPost(); });
    stage.appendChild(words);
  }
  const drafts = el('button', 'st-link st-drafts', LANG === 'en' ? 'Drafts' : 'ড্রাফট');
  drafts.addEventListener('click', openDrafts);
  stage.appendChild(drafts);
  st.box.replaceChildren(studioBar(modeTitle()), stage, modeSwitch(drawSource));
}
function takeFile(file, baked) {
  const st = studio;
  const video = file.type.startsWith('video');
  if (video && file.size > MAX_VIDEO) { chatToast(ME, LANG === 'en' ? 'The video is over 3 GB.' : 'ভিডিওটি ৩ জিবির বেশি। ছোট একটি দিন।'); return; }
  if (st.mode === 'reel' && !video) { chatToast(ME, 'রিলের জন্য একটি ভিডিও দিন।'); return; }
  if (st.url) URL.revokeObjectURL(st.url);
  dropItems(st);
  const words = st.textStory != null && baked && !video;
  Object.assign(st, { file, kind: video ? 'video' : 'photo', url: URL.createObjectURL(file), baked, w: 0, h: 0, layers: words ? st.layers : [] });
  if (!words) st.textStory = null;
  if (video) preUpload(st);
  drawEdit();
}
// A video starts going up the moment it is chosen (as on Instagram), while it is edited and captioned; Share then
// only waits for what is left.
function preUpload(st) {
  if (st.pre && st.pre.xhr) st.pre.xhr.abort();
  const pre = st.pre = { file: st.file, f: 0, sent: 0, total: st.file.size, on: null };
  pre.promise = uploadMedia(st.file, st.file.type || 'video/mp4', (f, sent, total) => { Object.assign(pre, { f, sent, total }); if (pre.on) pre.on(f, sent, total); }, pre);
  pre.promise.catch(() => {});
}
const MAX_VIDEO = 3e9;
// A carousel: st.items holds every photo with its own words and stickers; st.file/url/layers are the one being edited.
function dropItems(st) {
  if (!st.items) return;
  for (const it of st.items) if (it.url !== st.url) URL.revokeObjectURL(it.url);
  st.items = null;
}
async function takeMany(files) {
  const st = studio;
  if (st.url) URL.revokeObjectURL(st.url);
  dropItems(st);
  st.textStory = null;
  st.items = files.map(f => ({ file: f, url: URL.createObjectURL(f), layers: [], w: 0, h: 0 }));
  for (const it of st.items) await mediaSize(Object.assign(it, { kind: 'photo' }));      // the first one's shape is everyone's
  showItem(0);
}
function showItem(i) {
  const st = studio, it = st.items[i];
  st.cur = i;
  Object.assign(st, { file: it.file, url: it.url, kind: 'photo', baked: false, layers: it.layers, w: it.w, h: it.h });
  drawEdit();
}
// The background of a words-only story: one of Instagram's gradients, as a picture.
const WORD_GRADIENTS = [['#f58529', '#dd2a7b', '#8134af'], ['#00c6ff', '#0072ff', '#3a0ca3'], ['#11998e', '#38ef7d', '#0b6e4f'], ['#ff512f', '#f09819', '#ffd200'],
  ['#232526', '#414345', '#0f0f0f'], ['#fc466b', '#3f5efb', '#1d1d6b'], ['#006a4e', '#00a86b', '#f42a41']];
function wordsBackground(i) {
  const c = el('canvas');
  c.width = 1080; c.height = 1920;
  const g = c.getContext('2d'), [a, b, d] = WORD_GRADIENTS[i % WORD_GRADIENTS.length];
  const grad = g.createLinearGradient(0, 0, 1080, 1920);
  grad.addColorStop(0, a); grad.addColorStop(.55, b); grad.addColorStop(1, d);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1080, 1920);
  return new Promise(resolve => c.toBlob(bl => resolve(new File([bl], 'words.jpg', { type: 'image/jpeg' })), 'image/jpeg', .92));
}
// The picture's or video's own size.
function mediaSize(st) {
  if (st.w) return Promise.resolve();
  return new Promise(resolve => {
    let over = false;
    const done = (w, h) => { if (over) return; over = true; st.w = w || 1080; st.h = h || 1350; resolve(); };
    if (st.kind === 'video') {
      const v = el('video');
      Object.assign(v, { preload: 'metadata', muted: true, playsInline: true });
      v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
      v.onerror = () => done();
      v.src = st.url;
      setTimeout(() => done(v.videoWidth, v.videoHeight), 8000);
    } else {
      const i = new Image();
      i.onload = () => done(i.naturalWidth, i.naturalHeight);
      i.onerror = () => done();
      i.src = st.url;
    }
  });
}
// The shape it is shown in, as Instagram does: a post between 1.91:1 (wide) and 4:5 (tall) — a YouTube-size 16:9 video
// stays 16:9 — and a reel or story 9:16, with a picture of another shape whole in the middle (a tall one fills the screen).
const postRatio = r => Math.min(1.91, Math.max(0.8, r));
function frameShape(st) {
  const r = st.w / st.h;
  if (st.mode === 'post') return { ratio: postRatio(r), fit: 'cover' };
  return { ratio: 9 / 16, fit: r < .66 ? 'cover' : 'contain' };
}

// ---- 2. the camera: drawn through an effect (effects.js), so photos and videos carry it ----
async function openCamera() {
  const st = studio;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { chatToast(ME, 'এই ব্রাউজারে ক্যামেরা খোলা যায় না।'); return; }
  stopCamera();
  try {
    st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: st.facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: true });
  } catch { chatToast(ME, 'ক্যামেরা ও মাইক্রোফোনের অনুমতি দিন।'); drawSource(); return; }
  if (studio !== st) { stopCamera(); return; }
  const video = Object.assign(el('video'), { autoplay: true, muted: true, playsInline: true, srcObject: st.stream });
  video.play().catch(() => {});
  const canvas = el('canvas', 'st-canvas');
  [canvas.width, canvas.height] = st.mode === 'post' ? [864, 1080] : [720, 1280];
  const status = el('div', 'st-status');
  status.hidden = true;
  st.cam = effectCamera(video, canvas, { mirror: st.facing === 'user', onStatus: s => {
    status.hidden = s === 'ready';
    status.textContent = s === 'loading' ? (LANG === 'en' ? 'Loading face effects…' : 'ফেস ইফেক্ট লোড হচ্ছে…') : s === 'failed' ? (LANG === 'en' ? 'Face effects need a newer browser' : 'এই ব্রাউজারে ফেস ইফেক্ট চলছে না') : '';
    if (s === 'failed') setTimeout(() => { status.hidden = true; }, 2500);
  } });
  st.cam.set(st.effect || 'none');
  const stage = el('div', 'st-camera');
  const name = el('div', 'st-fxname');
  const timer = el('div', 'st-rec-time');
  timer.hidden = true;
  stage.append(canvas, video, name, status, timer);
  video.className = 'st-src';
  // top: music; right: flip, microphone, effects
  const tune = el('button', 'st-chip');
  const paintTune = () => { tune.replaceChildren(Object.assign(el('i'), { innerHTML: svg('note') }), document.createTextNode(st.music ? musicTitle(st.music) : (LANG === 'en' ? 'Add music' : 'গান যোগ করুন'))); tune.classList.toggle('on', !!st.music); };
  paintTune();
  tune.addEventListener('click', () => openMusicSheet(paintTune));
  const flip = sbtn('flip', 'ক্যামেরা ঘোরান', () => { st.facing = st.facing === 'user' ? 'environment' : 'user'; openCamera(); }, 'round');
  const mic = sbtn('mic', 'মাইক্রোফোন', () => { st.orig = !st.orig; mic.classList.toggle('off', !st.orig); }, 'round');
  mic.classList.toggle('off', !st.orig);
  const allFx = sbtn('magic', 'সব ইফেক্ট', () => openEffectSheet(pick), 'round');
  const tools = el('div', 'st-toolrow');
  tools.append(flip, mic, allFx);
  stage.appendChild(tools);
  // the effects around the shutter, as on Instagram: swipe through, the middle one is on
  const ring = el('div', 'st-ring-strip');
  const showName = e => { name.textContent = effectName(e); name.classList.remove('show'); void name.offsetWidth; name.classList.add('show'); };
  function pick(id) {
    st.effect = id;
    st.cam.set(id);
    // an effect chosen from the sheet joins the row beside the shutter
    if (![...ring.children].some(b => b.dataset.id === id)) {
      const e = EFFECTS.find(x => x.id === id);
      if (e) ring.insertBefore(fxButton(e), ring.children[1] || null);
    }
    for (const b of ring.children) b.classList.toggle('on', b.dataset.id === id);
    const e = EFFECTS.find(x => x.id === id);
    if (e) showName(e);
  }
  function fxButton(e) {
    const b = el('button', 'st-fx' + (e.id === (st.effect || 'none') ? ' on' : ''));
    b.dataset.id = e.id;
    b.style.background = e.bg;
    b.textContent = e.icon;
    b.setAttribute('aria-label', effectName(e));
    b.addEventListener('click', () => pick(e.id));
    return b;
  }
  for (const e of EFFECTS.filter(x => x.tabs.includes('trend'))) ring.appendChild(fxButton(e));
  let kind = st.mode === 'reel' ? 'video' : 'photo';
  const kinds = el('div', 'st-kinds');
  if (st.mode !== 'reel') for (const [k, bn, en] of [['photo', 'ছবি', 'Photo'], ['video', 'ভিডিও', 'Video']]) {
    const b = el('button', k === kind ? 'on' : '', LANG === 'en' ? en : bn);
    b.addEventListener('click', () => { kind = k; for (const x of kinds.children) x.classList.toggle('on', x === b); shutter.classList.toggle('video', k === 'video'); });
    kinds.appendChild(b);
  }
  const shutter = el('button', 'st-shutter' + (kind === 'video' ? ' video' : ''));
  shutter.setAttribute('aria-label', 'তুলুন');
  shutter.innerHTML = '<svg viewBox="0 0 80 80"><circle class="track" cx="40" cy="40" r="36"/><circle class="prog" cx="40" cy="40" r="36"/></svg><i></i>';
  let rec = null, chunks = [], started = 0, tick = null, playing = null;
  const stopRec = () => { if (rec && rec.state !== 'inactive') rec.stop(); };
  shutter.addEventListener('click', () => {
    if (kind === 'photo') {
      stage.classList.add('flash');
      canvas.toBlob(b => { if (!b) return; st.fx = ''; stopCamera(); takeFile(new File([b], 'photo.jpg', { type: 'image/jpeg' }), true); }, 'image/jpeg', .92);
      return;
    }
    if (rec) { stopRec(); return; }
    const type = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    const out = canvas.captureStream ? canvas.captureStream(30) : null;
    if (!out) { chatToast(ME, 'এই ব্রাউজারে ভিডিও রেকর্ড করা যায় না।'); return; }
    if (st.orig) for (const t of st.stream.getAudioTracks()) out.addTrack(t);
    try { rec = new MediaRecorder(out, type ? { mimeType: type, videoBitsPerSecond: 3e6 } : undefined); }
    catch { chatToast(ME, 'এই ব্রাউজারে ভিডিও রেকর্ড করা যায় না।'); return; }
    chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      clearInterval(tick);
      if (playing) playing.stop();
      const base = (rec.mimeType || 'video/webm').split(';')[0];
      const file = new File(chunks, `reel.${base.includes('mp4') ? 'mp4' : 'webm'}`, { type: base });
      rec = null;
      st.fx = '';
      stopCamera();
      takeFile(file, true);
    };
    rec.start(500);
    started = Date.now();
    shutter.classList.add('rec');
    ring.classList.add('hide');
    timer.hidden = false;
    if (st.music) playing = playMusicChoice(st.music, 0);   // heard while recording; it plays with the reel later
    tick = setInterval(() => {
      const s = (Date.now() - started) / 1000;
      timer.textContent = `${num(Math.floor(s / 60))}:${num(Math.floor(s % 60)).padStart(2, num(0))}`;
      shutter.style.setProperty('--p', Math.min(1, s / 60));
      if (s >= 60) stopRec();
    }, 200);
  });
  const galleryBtn = sbtn('image', 'গ্যালারি', drawSource, 'round');
  const row = el('div', 'st-shoot');
  row.append(galleryBtn, shutter, el('span', 'st-gap'));
  const bottom = el('div', 'st-cam-bottom');
  bottom.append(ring, kinds, row);
  st.box.replaceChildren(stage, studioBar(modeTitle(), tune), bottom);
  stage.addEventListener('animationend', e => { if (e.animationName === 'shot-flash') stage.classList.remove('flash'); });
}
function stopCamera() {
  if (studio && studio.cam) { studio.cam.stop(); studio.cam = null; }
  if (studio && studio.stream) { for (const t of studio.stream.getTracks()) t.stop(); studio.stream = null; }
}

// Every effect, in tabs, as a sheet over the camera.
function openEffectSheet(pick) {
  const st = studio;
  const sheet = el('div', 'st-sheet');
  const grab = el('div', 'grab');
  const tabs = el('div', 'fx-tabs');
  const grid = el('div', 'fx-grid');
  let tab = 'trend';
  const draw = () => {
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.t === tab);
    grid.replaceChildren(...EFFECTS.filter(e => e.tabs.includes(tab)).map(e => {
      const b = el('button', 'fx-cell' + (e.id === (st.effect || 'none') ? ' on' : ''));
      const face = el('span', 'fx-face');
      face.style.background = e.bg;
      face.textContent = e.icon;
      b.append(face, el('span', 'nm', effectName(e)));
      b.addEventListener('click', () => { pick(e.id); for (const x of grid.children) x.classList.toggle('on', x === b); });
      return b;
    }));
  };
  for (const [k, bn, en] of FX_TABS) { const b = el('button', null, LANG === 'en' ? en : bn); b.dataset.t = k; b.addEventListener('click', () => { tab = k; draw(); }); tabs.appendChild(b); }
  const close = () => { sheet.classList.add('out'); setTimeout(() => sheet.remove(), 250); };
  const done = el('button', 'fx-done', LANG === 'en' ? 'Done' : 'ঠিক আছে');
  done.addEventListener('click', close);
  sheet.append(grab, tabs, grid, done);
  st.box.appendChild(sheet);
  dragSheet(sheet, grab, { snaps: [.5, .92], onClose: close, onTap: close, box: () => st.box.clientHeight }).snap(0, false);
  draw();
}

// A row of round previews, one per filter. `src` is the picture to preview with (none: plain colour tiles).
function filterStrip(onPick, src) {
  const strip = el('div', 'st-filters');
  for (const f of FILTERS) {
    const b = el('button', 'st-filter' + (f[0] === (studio ? studio.fx : '') ? ' on' : ''));
    const face = el('span', 'face');
    if (src) face.style.backgroundImage = `url("${src}")`;
    face.style.filter = f[3];
    b.append(face, el('span', 'nm', fxName(f)));
    b.addEventListener('click', () => { for (const x of strip.children) x.classList.toggle('on', x === b); onPick(f[0]); });
    strip.appendChild(b);
  }
  return strip;
}

// ---- 3. editing, as on Instagram: the picture large, the tools along the bottom, Next ----
async function drawEdit() {
  const st = studio;
  await mediaSize(st);
  if (studio !== st) return;
  const shape = st.shape = frameShape(st.items ? { mode: st.mode, w: st.items[0].w, h: st.items[0].h } : st);
  const frame = el('div', 'st-frame ' + (shape.fit === 'contain' ? 'fit' : 'fill'));
  frame.style.aspectRatio = String(shape.ratio);
  frame.style.width = `min(100% - 20px, 560px, (100dvh - 236px) * ${shape.ratio.toFixed(4)})`;     // until fitFrame measures
  const media = st.kind === 'video' ? Object.assign(el('video', 'st-media'), { src: st.url, autoplay: true, loop: true, playsInline: true, muted: !st.orig }) : Object.assign(el('img', 'st-media'), { src: st.url, alt: '' });
  media.style.filter = fxCss(st.fx);
  media.style.objectFit = shape.fit;
  if (shape.fit === 'contain' && st.kind === 'photo') frame.appendChild(Object.assign(el('img', 'st-blur'), { src: st.url, alt: '' }));
  frame.appendChild(media);
  st.media = media;
  // Words and stickers: on a photo over the whole frame (they are drawn into it); on a video over the video itself.
  let lyr;
  if (st.kind === 'video') lyr = layerBox(media, null, shape.fit);
  else { lyr = el('div', 'lyr full'); frame.appendChild(lyr); }
  const bin = el('div', 'st-bin');
  bin.innerHTML = svg('trash');
  frame.appendChild(bin);
  const editor = layerEditor(lyr, st.layers, { bin, frame, onEditText: l => editText(l) });
  function editText(l, preset) {
    const i = l ? st.layers.indexOf(l) : -1;
    if (i >= 0) { st.layers.splice(i, 1); editor.redraw(); }
    if (st.kind === 'video') media.pause();
    openTextTool(st.box, l || preset, out => {
      if (out) {
        if (!l && !preset) { const n = st.layers.length; out.y = Math.min(.8, .42 + (n % 4) * .08); }
        st.layers.push(out);
      }
      editor.redraw();
      if (st.kind === 'video') media.play().catch(() => {});
    }, lyr.getBoundingClientRect().width / 100 || undefined);
  }
  if (st.textStory != null) {                           // a words-only story: its colour, on the picture
    const sw = el('button', 'st-tool st-swatch-btn');
    sw.innerHTML = '<i class="st-swatch"></i>';
    sw.setAttribute('aria-label', LANG === 'en' ? 'Background' : 'পেছনের রং');
    sw.addEventListener('click', async () => {
      st.textStory++;
      const f = await wordsBackground(st.textStory);
      URL.revokeObjectURL(st.url);
      Object.assign(st, { file: f, url: URL.createObjectURL(f) });
      media.src = st.url;
    });
    frame.appendChild(sw);
  }
  // A preview of the chosen music, in step with the video.
  const restartMusic = () => {
    if (st.preview) { st.preview.stop(); st.preview = null; }
    if (st.music) st.preview = playMusicChoice(st.music, st.kind === 'video' ? media.currentTime : 0);
  };
  if (st.kind === 'video') {
    let last = 0;
    media.addEventListener('timeupdate', () => { if (media.currentTime + .4 < last) restartMusic(); last = media.currentTime; });
    media.addEventListener('play', restartMusic);
  } else restartMusic();

  // the video's own sound, at the top
  const bar = el('header', 'st-bar');
  const back = sbtn('back', 'ফিরে যান', () => { if (st.preview) st.preview.stop(); st.textStory = null; drawSource(); });
  let right = el('span');
  if (st.kind === 'video') {
    right = sbtn('sound', LANG === 'en' ? 'Video sound' : 'ভিডিওর শব্দ', () => { st.orig = !st.orig; media.muted = !st.orig; right.classList.toggle('off', !st.orig); });
    right.classList.toggle('off', !st.orig);
  }
  bar.append(back, el('b', null, modeTitle()), right);

  // the filter row opens from its tool
  let thumb = st.url;
  if (st.kind === 'video') thumb = await videoPoster(st.file) || '';
  if (studio !== st) return;
  const strip = filterStrip(id => { st.fx = id; media.style.filter = fxCss(id); }, thumb);
  strip.classList.add('st-fxrow');
  strip.hidden = true;

  const tools = el('div', 'st-toolrow');
  const tool = (icon, bn, en, fn, html) => {
    const b = el('button', 'st-t');
    const i = el('span', 'ic2');
    i.innerHTML = html || svg(icon);
    b.append(i, el('small', null, LANG === 'en' ? en : bn));
    b.addEventListener('click', fn);
    tools.appendChild(b);
    return b;
  };
  const audio = tool('note', 'অডিও', 'Audio', () => openMusicSheet(() => { audio.classList.toggle('on', !!st.music); restartMusic(); }));
  audio.classList.toggle('on', !!st.music);
  tool('', 'লেখা', 'Text', () => editText(null), '<b class="aa">Aa</b>');
  if (st.kind === 'video') tool('mic', 'ভয়েস', 'Voice', () => openVoiceSheet(st, media, () => { audio.classList.toggle('on', !!st.music); restartMusic(); }));
  tool('', 'ক্যাপশন', 'Captions', () => editText(null, { t: 'text', s: '', x: .5, y: .84, sc: .72, r: 0, c: '#ffffff', bg: 2, f: 'classic', a: 'c' }), '<b class="cc">CC</b>');
  tool('smile', 'স্টিকার', 'Overlay', () => openStickerSheet(st.box, { place: st.place, text: () => editText(null) }, l => { l.y = Math.min(.85, .5 + (st.layers.length % 4) * .09); st.layers.push(l); editor.redraw(); }));
  const fxBtn = tool('magic', 'ফিল্টার', 'Filter', () => { strip.hidden = !strip.hidden; fxBtn.classList.toggle('on', !strip.hidden); fitFrame(); });

  const foot = el('div', 'st-editfoot');
  const shapeNote = el('span', 'st-shape', st.mode === 'post' ? (Math.abs(shape.ratio - 16 / 9) < .03 ? '16:9' : shape.ratio >= 1.9 ? '1.91:1' : Math.abs(shape.ratio - 1) < .02 ? '1:1' : shape.ratio <= .801 ? '4:5' : shape.ratio.toFixed(2) + ':1') : '9:16');
  shapeNote.title = LANG === 'en' ? 'The shape it will show in' : 'যে মাপে দেখাবে';
  const next = el('button', 'st-nextbtn');
  next.append(el('span', null, st.mode === 'story' ? (LANG === 'en' ? 'Share' : 'শেয়ার') : (LANG === 'en' ? 'Next' : 'পরের ধাপ')), Object.assign(el('i'), { innerHTML: svg('arrow') }));
  next.addEventListener('click', () => (st.mode === 'story' ? share() : drawDetails()));
  foot.append(shapeNote, next);
  const body = el('div', 'st-edit');
  body.append(frame, strip);
  if (st.items) body.appendChild(itemsRow(st));
  body.appendChild(tools);
  st.box.replaceChildren(bar, body, foot);
  // The picture gets the room that is really left: the screen less the bar, the photos' row, the filters, the
  // tools and Next (a phone browser's own bars make 100dvh unreliable, and the photos' row was not counted).
  function fitFrame() {
    if (!body.isConnected) { removeEventListener('resize', fitFrame); return; }
    const cs = getComputedStyle(body), gap = parseFloat(cs.rowGap) || 0;
    let used = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    for (const c of body.children) if (c !== frame && !c.hidden && c.offsetParent !== null) used += c.offsetHeight + gap;
    const room = Math.max(140, body.clientHeight - used - 4);
    frame.style.width = Math.round(Math.max(110, Math.min(body.clientWidth - 20, 560, room * shape.ratio))) + 'px';
  }
  st.fitFrame = fitFrame;
  requestAnimationFrame(fitFrame);
  addEventListener('resize', fitFrame);
  if (window.visualViewport) visualViewport.addEventListener('resize', fitFrame, { once: true });
  if (st.textStory != null && !st.layers.length) editText(null);
}

function itemsRow(st) {
  const row = el('div', 'st-items');
  st.items.forEach((it, i) => {
    const b = el('button', 'st-item' + (i === st.cur ? ' on' : ''));
    b.style.backgroundImage = `url("${it.url}")`;
    b.appendChild(el('small', null, num(i + 1)));
    b.addEventListener('click', () => { if (i !== st.cur) showItem(i); });
    if (i === st.cur && st.items.length > 1) {
      const x = el('i', 'del');
      x.innerHTML = svg('close');
      x.setAttribute('aria-label', tx('এই ছবি বাদ দিন', 'Remove this photo'));
      x.addEventListener('click', e => {
        e.stopPropagation();
        URL.revokeObjectURL(it.url);
        st.items.splice(i, 1);
        if (st.items.length === 1) { const last = st.items[0]; st.items = null; Object.assign(st, { file: last.file, url: last.url, layers: last.layers, w: last.w, h: last.h }); drawEdit(); return; }
        showItem(Math.min(i, st.items.length - 1));
      });
      b.appendChild(x);
    }
    row.appendChild(b);
  });
  if (st.items.length < 10) {
    const add = el('button', 'st-item add');
    add.innerHTML = svg('plus');
    add.setAttribute('aria-label', tx('আরও ছবি', 'More photos'));
    const pick = Object.assign(el('input'), { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    pick.addEventListener('change', async () => {
      const more = [...pick.files].filter(f => f.type.startsWith('image')).slice(0, 10 - st.items.length);
      for (const f of more) { const it = { file: f, url: URL.createObjectURL(f), layers: [], w: 0, h: 0, kind: 'photo' }; await mediaSize(it); st.items.push(it); }
      showItem(st.cur);
    });
    add.addEventListener('click', () => pick.click());
    row.append(add, pick);
  }
  return row;
}

// Voice: speak over the video while it plays; the recording becomes the post's sound (the video's own sound stays).
function openVoiceSheet(st, media, done) {
  const sheet = el('div', 'st-sheet vo-sheet');
  const grab = el('div', 'grab');
  const status = el('div', 'vo-status', LANG === 'en' ? 'Tap the button and speak — the video plays from the start.' : 'বোতাম চাপুন আর বলুন — ভিডিও শুরু থেকে চলবে।');
  const timer = el('b', 'vo-time', '0:00');
  const rec = el('button', 'vo-rec');
  rec.setAttribute('aria-label', LANG === 'en' ? 'Record' : 'রেকর্ড');
  const use = el('button', 'fx-done', LANG === 'en' ? 'Use this voice' : 'এই ভয়েস ব্যবহার করুন');
  use.hidden = true;
  let recorder = null, stream = null, parts = [], t0 = 0, tick = 0, blob = null, player = null;
  const close = () => { stop(); if (stream) stream.getTracks().forEach(t => t.stop()); if (player) player.pause(); sheet.classList.add('out'); setTimeout(() => sheet.remove(), 250); };
  function stop() {
    if (!recorder || recorder.state !== 'recording') return;
    recorder.stop();
    clearInterval(tick);
    media.pause();
    rec.classList.remove('on');
  }
  rec.addEventListener('click', async () => {
    if (recorder && recorder.state === 'recording') { stop(); return; }
    try { stream = stream || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { status.textContent = LANG === 'en' ? 'The microphone is not allowed.' : 'মাইক্রোফোনের অনুমতি পাওয়া যায়নি।'; return; }
    parts = []; blob = null; use.hidden = true;
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
    recorder.onstop = () => {
      blob = new Blob(parts, { type: recorder.mimeType || 'audio/webm' });
      status.textContent = LANG === 'en' ? 'Done. Play it with the video, or record again.' : 'হয়েছে। ভিডিওর সাথে শুনে দেখুন, বা আবার রেকর্ড করুন।';
      use.hidden = false;
      player = new Audio(URL.createObjectURL(blob));
      media.currentTime = 0; media.play().catch(() => {}); player.play().catch(() => {});
    };
    media.loop = false;
    media.currentTime = 0;
    media.muted = true;
    media.play().catch(() => {});
    media.onended = () => stop();
    recorder.start();
    t0 = Date.now();
    rec.classList.add('on');
    status.textContent = LANG === 'en' ? 'Recording… tap to stop.' : 'রেকর্ড হচ্ছে… থামাতে চাপুন।';
    tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= 600) stop(); }, 250);
  });
  use.addEventListener('click', async () => {
    if (!blob) return;
    use.disabled = true;
    use.textContent = LANG === 'en' ? 'Saving…' : 'সেভ হচ্ছে…';
    try {
      const type = (blob.type || 'audio/webm').split(';')[0];
      const up = await fetch('api/chat/upload', { method: 'POST', headers: { 'Content-Type': type, 'X-Name': 'voice' }, body: blob }).then(r => r.json());
      if (up.kind !== 'audio') throw new Error('type');
      const secs = (Date.now() - t0) / 1000;
      const { sound } = await exploreApi('sound', { media: up.media, title: LANG === 'en' ? 'Voiceover' : 'ভয়েসওভার', secs, rights: true });
      st.music = { id: sound.id, start: 0, title: sound.title, by: ME.name, src: sound.src };
      media.loop = true; media.muted = !st.orig;
      close();
      done();
    } catch { use.disabled = false; use.textContent = LANG === 'en' ? 'Could not save. Try again' : 'সেভ হয়নি। আবার চেষ্টা করুন'; }
  });
  sheet.append(grab, el('b', 'vo-title', LANG === 'en' ? 'Voiceover' : 'ভয়েসওভার'), status, timer, rec, use);
  st.box.appendChild(sheet);
  dragSheet(sheet, grab, { snaps: [.46, .7], onClose: close, onTap: close, box: () => st.box.clientHeight }).snap(0, false);
}

// ---- 4. the last step, as on Instagram: a preview with its cover, the caption, who sees it, share ----
function drawDetails() {
  const st = studio;
  if (st.preview) { st.preview.stop(); st.preview = null; }
  st.audience = st.audience || 'all';
  st.tags = st.tags || [];
  const shape = st.shape || frameShape(st);
  // the preview, in its shape, with its cover
  const card = el('div', 'sd-card');
  card.style.aspectRatio = String(shape.ratio);
  const first = st.items ? st.items[0] : st;          // a carousel is shown by its first photo
  const pv = st.kind === 'video' ? Object.assign(el('video'), { src: st.url, muted: true, playsInline: true, autoplay: true, loop: true }) : Object.assign(el('img'), { src: first.url, alt: '' });
  pv.style.filter = fxCss(st.fx);
  pv.style.objectFit = shape.fit;
  card.appendChild(pv);
  if (st.kind === 'video') {
    if (st.cover && st.cover.url) card.appendChild(Object.assign(el('img', 'sd-cover'), { src: st.cover.url, alt: '' }));
    if (st.layers.length) layerBox(pv, st.layers);
  } else if (first.layers.length) { const b = el('div', 'lyr full'); paintLayers(b, first.layers); card.appendChild(b); }
  if (st.items) card.appendChild(el('span', 'sd-count', `1/${num(st.items.length)}`));
  const pvBtn = el('button', 'sd-chip top', LANG === 'en' ? 'Preview' : 'প্রিভিউ');
  pvBtn.addEventListener('click', () => openPreview(st));
  card.appendChild(pvBtn);
  if (st.kind === 'video') {
    const cov = el('button', 'sd-chip bottom', LANG === 'en' ? 'Edit cover' : 'কভার বদলান');
    cov.addEventListener('click', () => openCoverSheet(st, drawDetails));
    card.appendChild(cov);
  }
  const caption = Object.assign(el('textarea', 'sd-caption'), { rows: 3, maxLength: 500, placeholder: LANG === 'en' ? 'Add a caption…' : 'ক্যাপশন লিখুন…' });
  caption.value = st.caption || '';
  caption.addEventListener('input', () => { st.caption = caption.value; });
  const chips = el('div', 'sd-chips');
  const chip = (icon, label, add) => { const b = el('button'); b.append(el('span', 'k', icon), el('span', null, label)); b.addEventListener('click', () => { caption.value = (caption.value.replace(/\s*$/, '') + (caption.value.trim() ? ' ' : '') + add); st.caption = caption.value; caption.focus(); }); chips.appendChild(b); };
  chip('#', LANG === 'en' ? 'Hashtags' : 'হ্যাশট্যাগ', '#');
  chip('@', LANG === 'en' ? 'Mention' : 'মেনশন', '@');
  if (st.place) chip('📍', st.place.label.split(',')[0], '#' + st.place.label.split(',')[0].replace(/\s+/g, ''));

  const rows = el('div', 'sd-rows');
  const row = (icon, label, value, fn) => {
    const r = el('button', 'sd-row');
    const v = el('span', 'v no-tr', value || '');
    r.append(ic(icon), el('span', 'l', label), v, ic('chev'));
    r.addEventListener('click', fn);
    rows.appendChild(r);
    return v;
  };
  const tagText = () => st.tags.length ? (st.tags.length === 1 ? st.tags[0].name : `${num(st.tags.length)} ${LANG === 'en' ? 'people' : 'জন'}`) : '';
  const tagV = row('userplus', LANG === 'en' ? 'Tag people' : 'মানুষ ট্যাগ করুন', tagText(), () => openTagSheet(st, () => { tagV.textContent = tagText(); }));
  // the place: typed here, with suggestions
  const placeRow = el('label', 'sd-row sd-place');
  const placeInput = Object.assign(el('input'), { autocomplete: 'off', placeholder: LANG === 'en' ? 'Add location' : 'জায়গা যোগ করুন' });
  if (st.place) placeInput.value = st.place.label;
  const sug = el('div', 'suggest');
  sug.hidden = true;
  placeRow.append(ic('pin'), placeInput, sug);
  wireSuggest(placeInput, sug, p => { st.place = p; placeInput.value = p.label; placeInput.blur(); }, () => { st.place = null; });
  rows.appendChild(placeRow);
  if (st.kind === 'video' && !st.music) {
    const aV = row('note', LANG === 'en' ? 'Rename audio' : 'অডিওর নাম', st.aname || (LANG === 'en' ? 'Original audio' : 'মূল অডিও'), () => {
      const name = prompt(LANG === 'en' ? 'Name of your original audio' : 'আপনার মূল অডিওর নাম', st.aname || '');
      if (name != null) { st.aname = name.trim().slice(0, 60); aV.textContent = st.aname || (LANG === 'en' ? 'Original audio' : 'মূল অডিও'); }
    });
  } else if (st.music) row('note', LANG === 'en' ? 'Audio' : 'অডিও', musicTitle(st.music), () => openMusicSheet(drawDetails));
  rows.appendChild(el('div', 'sd-gap'));
  const AUD = { all: ['সবাই', 'Everyone'], friends: ['বন্ধুরা', 'Friends'], me: ['শুধু আমি', 'Only me'] };
  const audV = row('eye', LANG === 'en' ? 'Audience' : 'কে দেখবে', AUD[st.audience][LANG === 'en' ? 1 : 0], () => openAudienceSheet(st, AUD, () => { audV.textContent = AUD[st.audience][LANG === 'en' ? 1 : 0]; paintAlso(); }));
  const also = el('label', 'sd-row sd-switch');
  const alsoBox = Object.assign(el('input'), { type: 'checkbox', checked: !!st.alsoStory });
  alsoBox.addEventListener('change', () => { st.alsoStory = alsoBox.checked; });
  also.append(ic('share'), el('span', 'l', LANG === 'en' ? 'Also share to your story' : 'স্টোরিতেও শেয়ার করুন'), alsoBox, el('i', 'sw'));
  const paintAlso = () => { also.hidden = st.audience !== 'all' || !!st.at; };
  paintAlso();
  rows.appendChild(also);
  const moreText = () => [st.at ? new Date(st.at).toLocaleString(LANG === 'en' ? 'en-GB' : 'bn-BD', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '', st.nocomm ? '🚫💬' : '', st.hidelikes ? '🙈' : ''].filter(Boolean).join(' · ');
  const moreV = row('more', LANG === 'en' ? 'More options' : 'আরও অপশন', moreText(), () => openMoreSheet(st, () => { moreV.textContent = moreText(); paintAlso(); shareBtn.firstChild.textContent = st.at ? (LANG === 'en' ? 'Schedule' : 'সময় ঠিক করুন') : (LANG === 'en' ? 'Share' : 'শেয়ার করুন'); }));

  const progress = el('div', 'st-progress');
  progress.innerHTML = '<i></i>';
  progress.hidden = true;
  const note = el('div', 'form-note');
  const bar = el('header', 'st-bar');
  bar.append(sbtn('back', 'ফিরে যান', drawEdit), el('b', null, st.mode === 'reel' ? (LANG === 'en' ? 'New reel' : 'নতুন রিল') : (LANG === 'en' ? 'New post' : 'নতুন পোস্ট')), el('span'));
  const body = el('div', 'st-details sd');
  body.append(card, caption, chips, rows, progress, note);
  const foot = el('div', 'st-foot sd-foot');
  const draft = el('button', 'sd-draft', LANG === 'en' ? 'Save draft' : 'ড্রাফট সেভ');
  draft.addEventListener('click', () => saveDraft(st, draft));
  const shareBtn = el('button', 'st-share');
  shareBtn.appendChild(document.createTextNode(st.at ? (LANG === 'en' ? 'Schedule' : 'সময় ঠিক করুন') : (LANG === 'en' ? 'Share' : 'শেয়ার করুন')));
  shareBtn.addEventListener('click', () => share(shareBtn, progress, note));
  foot.append(draft, shareBtn);
  st.box.replaceChildren(bar, body, foot);
}

// A bottom sheet in the studio, light like Instagram's settings.
function studioSheet(title, build, snaps = [.6, .92]) {
  const st = studio;
  const sheet = el('div', 'st-sheet light sd-sheet');
  const grab = el('div', 'grab');
  const close = () => { sheet.classList.add('out'); setTimeout(() => sheet.remove(), 250); };
  const content = el('div', 'sd-sheet-body');
  sheet.append(grab, el('b', 'sd-sheet-title', title), content);
  st.box.appendChild(sheet);
  build(content, close);
  dragSheet(sheet, grab, { snaps, onClose: close, onTap: close, box: () => st.box.clientHeight }).snap(0, false);
  return close;
}
function openAudienceSheet(st, AUD, done) {
  const notes = { all: ['BD Map-এর যে কেউ', 'Anyone on BD Map'], friends: ['যাঁরা আপনাকে ফলো করেন এবং আপনি যাঁদের ফলো করেন', 'People who follow you back'], me: ['শুধু আপনার প্রোফাইলে, আপনার কাছে', 'Only on your profile, for you'] };
  studioSheet(LANG === 'en' ? 'Audience' : 'কে দেখবে', (box, close) => {
    for (const k of ['all', 'friends', 'me']) {
      const r = el('label', 'sd-radio');
      const input = Object.assign(el('input'), { type: 'radio', name: 'aud', checked: st.audience === k });
      input.addEventListener('change', () => { st.audience = k; if (k !== 'all') st.alsoStory = false; done(); setTimeout(close, 180); });
      const t = el('span', 't');
      t.append(el('b', null, AUD[k][LANG === 'en' ? 1 : 0]), el('small', null, notes[k][LANG === 'en' ? 1 : 0]));
      r.append(ic(k === 'all' ? 'globe' : k === 'friends' ? 'users' : 'shield'), t, input, el('i', 'dot'));
      box.appendChild(r);
    }
  }, [.46, .7]);
}
function openMoreSheet(st, done) {
  studioSheet(LANG === 'en' ? 'More options' : 'আরও অপশন', box => {
    // a time later on: the post shows itself then
    const when = el('label', 'sd-opt');
    const at = Object.assign(el('input'), { type: 'datetime-local' });
    const pad = n => String(n).padStart(2, '0');
    const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    at.min = local(new Date(Date.now() + 5 * 6e4));
    at.max = local(new Date(Date.now() + 75 * 864e5));
    if (st.at) at.value = local(new Date(st.at));
    at.addEventListener('change', () => { const t = at.value ? new Date(at.value).getTime() : 0; st.at = t > Date.now() ? t : 0; if (st.at) st.alsoStory = false; done(); });
    const clear = el('button', 'sd-clear', LANG === 'en' ? 'Now' : 'এখনই');
    clear.addEventListener('click', e => { e.preventDefault(); at.value = ''; st.at = 0; done(); });
    const t = el('span', 't');
    t.append(el('b', null, LANG === 'en' ? 'Schedule' : 'সময় ঠিক করে পোস্ট'), el('small', null, LANG === 'en' ? 'It shows at the time you pick (up to 75 days).' : 'আপনার বেছে নেওয়া সময়ে দেখাবে (৭৫ দিন পর্যন্ত)।'));
    when.append(ic('clock'), t, at, clear);
    box.appendChild(when);
    const sw = (icon, bn, en, sub, key) => {
      const r = el('label', 'sd-row sd-switch');
      const c = Object.assign(el('input'), { type: 'checkbox', checked: !!st[key] });
      c.addEventListener('change', () => { st[key] = c.checked; done(); });
      const t2 = el('span', 'l');
      t2.append(el('b', null, LANG === 'en' ? en : bn), el('small', null, sub));
      r.append(ic(icon), t2, c, el('i', 'sw'));
      box.appendChild(r);
    };
    sw('heart', 'লাইকের সংখ্যা লুকান', 'Hide like count', LANG === 'en' ? 'Only you see how many liked it.' : 'কতজন লাইক দিয়েছেন, শুধু আপনি দেখবেন।', 'hidelikes');
    sw('chat', 'মন্তব্য বন্ধ', 'Turn off commenting', LANG === 'en' ? 'No one can comment on it.' : 'কেউ মন্তব্য করতে পারবেন না।', 'nocomm');
  }, [.5, .8]);
}
async function openTagSheet(st, done) {
  let people = [];
  try { const d = await chatApi('list'); people = [...(d.friends || []), ...(d.incoming || []), ...(d.outgoing || [])]; } catch { /* search still works */ }
  const seen = new Set();
  people = people.filter(p => !seen.has(p.id) && seen.add(p.id));
  studioSheet(LANG === 'en' ? 'Tag people' : 'মানুষ ট্যাগ করুন', box => {
    const search = el('label', 'mp-search');
    const q = Object.assign(el('input'), { type: 'search', placeholder: LANG === 'en' ? 'Search people' : 'মানুষ খুঁজুন', autocomplete: 'off' });
    search.append(ic('search'), q);
    const list = el('div', 'sd-people');
    const draw = rows => list.replaceChildren(...(rows.length ? rows.map(p => {
      const on = st.tags.some(t => t.id === p.id);
      const r = el('button', 'sd-person' + (on ? ' on' : ''));
      const t = el('span', 't no-tr');
      t.append(nameEl(p), el('small', null, p.username ? '@' + p.username : ''));
      r.append(avatar(p, 'sm'), t, el('i', 'tick'));
      r.addEventListener('click', () => {
        const i = st.tags.findIndex(x => x.id === p.id);
        if (i >= 0) st.tags.splice(i, 1); else if (st.tags.length < 20) st.tags.push({ id: p.id, name: p.name });
        r.classList.toggle('on', i < 0);
        done();
      });
      return r;
    }) : [el('div', 'mp-none', LANG === 'en' ? 'No one found.' : 'কাউকে পাওয়া যায়নি।')]));
    let timer = 0;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      const text = q.value.trim();
      if (text.length < 2) { draw(people); return; }
      timer = setTimeout(async () => { try { draw((await peopleApi('search?q=' + encodeURIComponent(text))).people.filter(p => p.id !== ME.id)); } catch { /* the list stays */ } }, 250);
    });
    box.append(search, list);
    draw(people);
  }, [.6, .92]);
}
// The cover: any moment of the video, or a picture from the gallery.
function openCoverSheet(st, done) {
  studioSheet(LANG === 'en' ? 'Cover' : 'কভার', (box, close) => {
    const v = Object.assign(el('video', 'sd-covervid'), { src: st.url, muted: true, playsInline: true, preload: 'auto' });
    const range = Object.assign(el('input'), { type: 'range', min: 0, max: 100, step: .1, value: st.cover && st.cover.at != null ? st.cover.at : 1 });
    v.addEventListener('loadedmetadata', () => { range.max = Math.max(.1, v.duration - .05); v.currentTime = Number(range.value) || Math.min(1, v.duration / 2); });
    range.addEventListener('input', () => { v.currentTime = Number(range.value); });
    const pick = Object.assign(el('input'), { type: 'file', accept: 'image/*', hidden: true });
    const gallery = el('button', 'sd-gallery');
    gallery.append(ic('image'), el('span', null, LANG === 'en' ? 'Add from gallery' : 'গ্যালারি থেকে'));
    gallery.addEventListener('click', () => pick.click());
    pick.addEventListener('change', async () => {
      const f = pick.files[0];
      if (!f) return;
      const url = await new Promise(r => { const img = new Image(); img.onload = () => { const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight)), c = el('canvas'); c.width = img.naturalWidth * k; c.height = img.naturalHeight * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); r(c.toDataURL('image/jpeg', .82)); }; img.onerror = () => r(''); img.src = URL.createObjectURL(f); });
      if (url) { st.cover = { url }; close(); done(); }
    });
    const ok = el('button', 'fx-done', LANG === 'en' ? 'Done' : 'ঠিক আছে');
    ok.addEventListener('click', async () => { ok.disabled = true; st.cover = { at: Number(range.value), url: await videoPoster(st.file, Number(range.value)) }; close(); done(); });
    box.append(v, range, gallery, pick, ok);
  }, [.72, .92]);
}
// How it will look: the post or reel full screen, with its words, the name and the caption.
function openPreview(st) {
  const shape = st.shape || frameShape(st);
  const box = el('div', 'sd-preview' + (st.mode === 'reel' ? ' reel' : ''));
  const stage = el('div', 'sd-pstage');
  stage.style.aspectRatio = String(st.mode === 'reel' ? 9 / 16 : shape.ratio);
  const m = st.kind === 'video' ? Object.assign(el('video'), { src: st.url, autoplay: true, loop: true, playsInline: true, muted: !st.orig }) : Object.assign(el('img'), { src: st.url, alt: '' });
  m.style.filter = fxCss(st.fx);
  m.style.objectFit = st.mode === 'reel' ? (st.w / st.h < .66 ? 'cover' : 'contain') : shape.fit;
  stage.appendChild(m);
  if (st.layers.length) { if (st.kind === 'video') layerBox(m, st.layers); else { const b = el('div', 'lyr full'); paintLayers(b, st.layers); stage.appendChild(b); } }
  const info = el('div', 'sd-pinfo no-tr');
  const who = el('div', 'who');
  who.append(avatar(ME, 'sm'), nameEl(ME));
  info.appendChild(who);
  if (st.caption) info.appendChild(el('p', null, st.caption));
  if (st.music) info.appendChild(el('small', null, '♪ ' + musicTitle(st.music)));
  stage.appendChild(info);
  const x = el('button', 'sd-px');
  x.innerHTML = svg('close');
  x.setAttribute('aria-label', 'বন্ধ করুন');
  const close = () => { if (m.pause) m.pause(); if (pv) pv.stop(); box.remove(); };
  x.addEventListener('click', close);
  const pv = st.music ? playMusicChoice(st.music, 0) : null;
  box.append(stage, x);
  st.box.appendChild(box);
}

// Drafts stay on this phone (IndexedDB), with the file itself.
function draftsDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('bdmap-drafts', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('drafts', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function draftsTx(mode, fn) {
  const db = await draftsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode), store = tx.objectStore('drafts');
    const req = fn(store);
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function saveDraft(st, btn) {
  btn.disabled = true;
  try {
    const thumb = st.kind === 'video' ? (st.cover && st.cover.url) || await videoPoster(st.file) : '';
    const d = { id: st.draftId || Date.now(), made: Date.now(), file: st.file, kind: st.kind, mode: st.mode, fx: st.fx, music: st.music, orig: st.orig, layers: st.layers, caption: st.caption || '',
      place: st.place || null, tags: st.tags || [], audience: st.audience || 'all', at: st.at || 0, nocomm: !!st.nocomm, hidelikes: !!st.hidelikes, aname: st.aname || '', cover: st.cover || null, thumb, textStory: st.textStory,
      items: st.items ? st.items.map(it => ({ file: it.file, layers: it.layers })) : null };
    await draftsTx('readwrite', s => s.put(d));
    closeStudio();
    chatToast(ME, LANG === 'en' ? 'Saved to drafts on this device.' : 'ড্রাফট সেভ হয়েছে — এই ডিভাইসে থাকবে।');
  } catch {
    btn.disabled = false;
    chatToast(ME, LANG === 'en' ? 'Could not save the draft (the file may be too big for this browser).' : 'ড্রাফট সেভ হয়নি — ফাইলটি এই ব্রাউজারের জন্য বেশি বড় হতে পারে।');
  }
}
async function openDrafts() {
  let list = [];
  try { list = (await draftsTx('readonly', s => s.getAll())) || []; } catch { /* none */ }
  list.sort((a, b) => b.made - a.made);
  studioSheet(LANG === 'en' ? 'Drafts' : 'ড্রাফট', (box, close) => {
    if (!list.length) { box.appendChild(el('div', 'mp-none', LANG === 'en' ? 'No drafts yet.' : 'এখনো কোনো ড্রাফট নেই।')); return; }
    const grid = el('div', 'sd-drafts');
    for (const d of list) {
      const cell = el('div', 'sd-draft-cell');
      const open = el('button', 'pic');
      if (d.thumb) open.style.backgroundImage = `url("${d.thumb}")`;
      else if (d.kind === 'photo') open.style.backgroundImage = `url("${URL.createObjectURL(d.file)}")`;
      open.appendChild(el('small', null, ({ post: 'পোস্ট', reel: 'রিল', story: 'স্টোরি' })[d.mode] || ''));
      open.addEventListener('click', () => {
        close();
        const st = studio;
        Object.assign(st, { mode: d.mode, fx: d.fx, music: d.music, orig: d.orig, caption: d.caption, place: d.place, tags: d.tags, audience: d.audience, at: d.at > Date.now() ? d.at : 0,
          nocomm: d.nocomm, hidelikes: d.hidelikes, aname: d.aname, cover: d.cover, draftId: d.id, textStory: d.textStory != null ? d.textStory : null });
        const layers = d.layers || [];
        st.textStory = st.textStory != null ? st.textStory : null;
        if (st.url) URL.revokeObjectURL(st.url);
        if (d.items && d.items.length > 1) {
          dropItems(st);
          st.items = d.items.map(it => ({ file: it.file, url: URL.createObjectURL(it.file), layers: it.layers || [], w: 0, h: 0, kind: 'photo' }));
          Promise.all(st.items.map(mediaSize)).then(() => showItem(0));
          return;
        }
        Object.assign(st, { file: d.file, kind: d.kind, url: URL.createObjectURL(d.file), baked: false, w: 0, h: 0, layers });
        drawEdit();
      });
      const del = el('button', 'del');
      del.innerHTML = svg('trash');
      del.setAttribute('aria-label', LANG === 'en' ? 'Delete draft' : 'ড্রাফট মুছুন');
      del.addEventListener('click', async () => { await draftsTx('readwrite', s => s.delete(d.id)).catch(() => {}); cell.remove(); });
      cell.append(open, del);
      grid.appendChild(cell);
    }
    box.appendChild(grid);
  }, [.6, .92]);
}

async function share(btn, progress, note) {
  const st = studio;
  if (!st || !st.file) return;
  if (btn) btn.disabled = true;
  if (progress) progress.hidden = false;
  // Over the studio: how much has gone, so a big video does not look stuck.
  const up = el('div', 'st-up');
  const ring = el('div', 'ring'), pct = el('b', null, '0%'), size = el('span', 'no-tr'), hint = el('small', null, LANG === 'en' ? 'Keep BD Map open until it is done' : 'শেষ না হওয়া পর্যন্ত অ্যাপটি খোলা রাখুন');
  up.append(ring, pct, size, hint);
  st.box.appendChild(up);
  const mb = n => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : Math.max(.1, n / 1e6).toFixed(1) + ' MB';
  const onProgress = (f, sent, total) => {
    if (progress) progress.firstChild.style.width = Math.round(f * 100) + '%';
    ring.style.setProperty('--p', f);
    pct.textContent = Math.floor(f * 100) + '%';
    if (total) size.textContent = `${mb(sent)} / ${mb(total)}`;
  };
  try {
    let blob = st.file, type = st.file.type || 'video/mp4', fx = st.fx, poster = '', layers = [];
    const shape = st.shape || frameShape(st);
    let w = st.w, h = st.h;
    let more = [];
    if (st.items) {
      const parts = [];
      for (const it of st.items) parts.push(await bakeFrame(it, shape, canvasFilters ? fx : ''));
      const total = parts.reduce((a, p) => a + p.blob.size, 0);
      let done = 0;
      const names = [];
      for (const p of parts) {
        names.push(await uploadMedia(p.blob, 'image/jpeg', (f, sent) => onProgress((done + sent) / total, done + sent, total)));
        done += p.blob.size;
      }
      blob = null; w = parts[0].w; h = parts[0].h; type = 'image/jpeg';
      if (canvasFilters) fx = '';
      [st.preMedia, ...more] = names;
    } else if (st.kind === 'photo') {
      const baked = await bakeFrame(st, shape, canvasFilters ? fx : '');
      blob = baked.blob; w = baked.w; h = baked.h;
      if (canvasFilters) fx = '';
      type = 'image/jpeg';
    } else { poster = (st.cover && st.cover.url) || await videoPoster(st.file); layers = st.layers; }
    let media = st.items ? st.preMedia : null;
    if (st.kind === 'video' && st.pre && st.pre.file === st.file) {
      onProgress(st.pre.f, st.pre.sent, st.pre.total);
      st.pre.on = onProgress;
      try { media = await st.pre.promise; st.pre.done = true; } catch { media = null; }
    }
    if (!media) media = await uploadMedia(blob, type, onProgress);
    const send = m => st.mode === 'story' ? exploreApi('story', { media: m, poster, w, h, layers }) : exploreApi('post', { poster, w, h, layers, caption: st.caption || '', place: st.place || null, fx, music: st.music ? st.music.id : '', mstart: st.music ? st.music.start : 0,
      orig: st.kind === 'video' ? st.orig : true, audience: st.audience || 'all', at: st.at || 0, tags: (st.tags || []).map(t => t.id), nocomm: !!st.nocomm, hidelikes: !!st.hidelikes,
      media: m, more, aname: st.aname || '', story: !!st.alsoStory && !more.length });
    // an upload made long before Share (over an hour) is cleared by the server: then it goes up again
    try { await send(media); } catch (e) { if (e.message !== 'media') throw e; await send(await uploadMedia(blob, type, onProgress)); }
    if (st.draftId) draftsTx('readwrite', s => s.delete(st.draftId)).catch(() => {});
    const mode = st.mode, later = st.at;
    closeStudio();
    chatToast(ME, later ? (LANG === 'en' ? 'Scheduled. It will show at the time you picked.' : 'সময় ঠিক হয়েছে — সেই সময়ে পোস্টটি দেখাবে।')
      : mode === 'story' ? 'স্টোরি দেওয়া হয়েছে — ২৪ ঘণ্টা থাকবে।' : mode === 'reel' ? 'রিল পোস্ট হয়েছে।' : 'পোস্ট হয়েছে।');
    if (typeof refreshStoryRings === 'function') refreshStoryRings();
    if (current === 'explore') enter.explore(); else if (current === 'profile') drawProfile(); else go('explore');
  } catch (e) {
    up.remove();
    if (btn) btn.disabled = false;
    if (progress) progress.hidden = true;
    const text = e.message === 'big' ? (LANG === 'en' ? 'The file is too big (3 GB at most).' : 'ফাইলটি অনেক বড় — সর্বোচ্চ ৩ জিবি।') : e.message === 'space' ? (LANG === 'en' ? 'The server has no room for this file now. Try a smaller one.' : 'সার্ভারে এখন এত বড় ফাইলের জায়গা নেই। ছোট একটি দিন।')
      : e.message === 'type' ? 'এই ধরনের ফাইল নেওয়া যায় না।' : e.message === 'slow' ? 'আজ অনেকগুলো পোস্ট হয়েছে। কাল আবার চেষ্টা করুন।'
      : e.message === 'closed' ? 'এই মুহূর্তে পোস্ট দেওয়া বন্ধ আছে।' : 'শেয়ার করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।';
    if (note) { note.className = 'form-note bad'; note.textContent = text; } else chatToast(ME, text);
  }
}
// The photo as it was framed: 1080 px wide in the post's shape (or 1080x1920 for a story), with the filter, a blurred
// copy behind a picture that does not fill a story, and the words and stickers drawn in.
function bakeFrame(st, shape, fx) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try { await document.fonts.ready; } catch { /* fonts as they are */ }
      const W = 1080, H = Math.round(W / shape.ratio), iw = img.naturalWidth, ih = img.naturalHeight;
      const c = el('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      const cover = Math.max(W / iw, H / ih), fit = Math.min(W / iw, H / ih);
      if (shape.fit === 'contain') {
        const k = cover * 1.15;
        if (canvasFilters) g.filter = 'blur(48px) brightness(.72) saturate(1.25)';
        g.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
        g.filter = 'none';
        if (!canvasFilters) { g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, H); }
      }
      const k = shape.fit === 'cover' ? cover : fit;
      if (fx) g.filter = fxCss(fx);
      g.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
      g.filter = 'none';
      drawLayers(g, st.layers, 0, 0, W, H);
      c.toBlob(b => (b ? resolve({ blob: b, w: W, h: H }) : reject(new Error('image'))), 'image/jpeg', .9);
    };
    img.onerror = () => reject(new Error('image'));
    img.src = st.url;
  });
}

// ---- music: a sheet like TikTok's — popular, for you, saved, recent, search; trim; save ----
// Sources: BD Map's own tracks (music.js), sounds people uploaded, reels' original sounds, and — when the server
// has a Jamendo id — Jamendo's Creative Commons catalogue.
const musicTitle = m => m.id.startsWith('gen:') ? MUSIC.name(m.id.slice(4)) : m.title || `${m.by || ''} · ${LANG === 'en' ? 'Original audio' : 'মূল অডিও'}`;
function playMusicChoice(m, at = 0) {
  if (m.id.startsWith('gen:')) return MUSIC.play(m.id.slice(4), (m.start || 0) + at, { volume: .75 });
  const a = new Audio(m.src);
  a.preload = 'auto';
  const go = () => { try { a.currentTime = (m.start || 0) + at; } catch { /* not seekable yet */ } a.play().catch(() => {}); };
  if (a.readyState >= 1) go(); else { a.addEventListener('loadedmetadata', go, { once: true }); a.load(); a.play().catch(() => {}); }
  return { stop() { a.pause(); a.src = ''; }, setVolume(v) { a.volume = v; } };
}
const MUSIC_SAVED = 'bdmap.music.saved', MUSIC_RECENT = 'bdmap.music.recent';
const readList = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
const writeList = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v.slice(0, 40))); } catch { /* storage unavailable */ } };
const durText = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : (LANG === 'en' ? 'Loop' : 'লুপ');
// What the sheet lists, fetched once when the studio opens and kept for ten minutes.
let musicCache = null;
function loadCatalogue() {
  if (musicCache && Date.now() - musicCache.at < 6e5) return musicCache.ready;
  const c = musicCache = { at: Date.now(), data: null, chart: [] };
  c.ready = (async () => {
    try {
      const data = await exploreApi('audios');
      const chart = data.catalogue ? (await exploreApi('music').catch(() => ({}))).tracks || [] : [];
      Object.assign(c, { data, chart });                // both at once: the sheet takes them together
    } catch { if (musicCache === c) musicCache = null; }
    return c;
  })();
  return c.ready;
}

async function openMusicSheet(done) {
  const st = studio;
  let data = { tracks: [], audios: [], sounds: [], tracksUsed: [], catalogue: null };
  // chart: Jamendo's most played this week; hits: what a search found there; loading: still fetching
  let tab = 'hot', q = '', previewing = null, previewId = '', chart = [], hits = [], loading = true, searching = false;
  const sheet = el('div', 'st-sheet light mp-sheet');
  const grab = el('div', 'grab');
  const tabs = el('div', 'mp-tabs');
  const search = el('label', 'mp-search');
  const qi = Object.assign(el('input'), { type: 'search', placeholder: LANG === 'en' ? 'Search songs and sounds' : 'গান বা সাউন্ড খুঁজুন', autocomplete: 'off' });
  search.append(ic('search'), qi);
  const list = el('div', 'mp-list');
  const upload = el('button', 'mp-upload');
  upload.append(ic('plus'), el('span', null, LANG === 'en' ? 'Upload your own sound' : 'নিজের সাউন্ড আপলোড করুন'));
  upload.addEventListener('click', () => uploadSound(s => { data.sounds.unshift({ ...s, uses: 0, created: Date.now() }); choose(soundItem(s)); }));
  const stopPreview = () => { if (previewing) previewing.stop(); previewing = null; previewId = ''; for (const b of list.querySelectorAll('.mp-row')) b.classList.remove('playing'); };
  const close = () => { stopPreview(); sheet.classList.add('out'); setTimeout(() => sheet.remove(), 250); };

  // Every source becomes one shape: { id, title, by, art (url or gradient class), secs, uses, src? }
  const genItem = (t, i) => ({ id: 'gen:' + t.id, title: MUSIC.name(t.id), by: `BD Map Music · ${MUSIC.mood(t.id)}`, art: 'g' + (i % 8), secs: 0, uses: (data.tracks.find(x => x.id === t.id) || {}).uses || 0 });
  const soundItem = s => ({ id: s.id, title: s.title, by: s.user.name, art: '', pic: s.user, secs: s.secs, uses: s.uses || 0, src: s.src });
  const reelItem = a => ({ id: a.id, title: `${a.user.name} · ${LANG === 'en' ? 'original sound' : 'মূল সাউন্ড'}`, by: a.user.name, art: a.poster, secs: 0, uses: a.uses || 0, src: a.src });
  const extItem = t => ({ id: t.id, title: t.title, by: t.artist, art: t.image, secs: t.secs, uses: t.uses || 0, src: t.audio });
  const all = () => [...MUSIC.TRACKS.map(genItem), ...data.sounds.map(soundItem), ...data.audios.map(reelItem), ...data.tracksUsed.map(extItem), ...chart.map(extItem)];

  function choose(it) {
    stopPreview();
    st.music = { id: it.id, start: it.start || 0, title: it.id.startsWith('gen:') ? '' : it.title, by: it.by, src: it.src };
    if (st.kind === 'video' || st.stream) st.orig = false;
    writeList(MUSIC_RECENT, [it, ...readList(MUSIC_RECENT).filter(x => x.id !== it.id)]);
    close();
    done();
  }
  function row(it) {
    const r = el('div', 'mp-row' + (st.music && st.music.id === it.id ? ' picked' : ''));
    const art = el('span', 'mp-art' + (it.art && it.art.length <= 3 ? ' ' + it.art : ''));
    if (it.art && it.art.length > 3) art.style.backgroundImage = `url("${it.art}")`;
    else if (it.pic) art.appendChild(avatar(it.pic, 'sm'));
    else art.innerHTML = svg('note');
    const eq = el('i', 'mp-eq');
    eq.innerHTML = '<b></b><b></b><b></b>';
    art.appendChild(eq);
    const t = el('div', 't no-tr');
    t.append(el('b', null, it.title), el('span', null, [it.by, it.uses ? `${num(it.uses)} ${LANG === 'en' ? 'posts' : 'পোস্ট'}` : '', durText(it.secs)].filter(Boolean).join(' · ')));
    // tap: listen; tap again: stop. The tick uses it.
    r.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const was = previewId === it.id;
      stopPreview();
      if (was) return;
      previewing = playMusicChoice({ ...it, start: it.start || 0 }, 0);
      previewId = it.id;
      r.classList.add('playing');
    });
    const cut = sbtnLight('cut', 'কোথা থেকে বাজবে', () => openTrim(it, r));
    const saved = readList(MUSIC_SAVED).some(x => x.id === it.id);
    const keep = sbtnLight('bookmark', 'সেভ', () => {
      const list0 = readList(MUSIC_SAVED), on = !list0.some(x => x.id === it.id);
      writeList(MUSIC_SAVED, on ? [it, ...list0] : list0.filter(x => x.id !== it.id));
      keep.classList.toggle('on', on);
    });
    keep.classList.toggle('on', saved);
    const use = el('button', 'mp-use');
    use.innerHTML = svg('check');
    use.setAttribute('aria-label', 'ব্যবহার করুন');
    use.addEventListener('click', () => choose(it));
    r.append(art, t, cut, keep, use);
    return r;
  }
  // ✂ where the sound starts
  function openTrim(it, r) {
    for (const x of list.querySelectorAll('.mp-trim')) x.remove();
    const box = el('div', 'mp-trim');
    const range = Object.assign(el('input'), { type: 'range', min: 0, max: it.secs ? Math.max(0, it.secs - 5) : 60, step: 1, value: it.start || 0 });
    const v = el('span', null, `${num(range.value)} ${LANG === 'en' ? 's' : 'সে.'}`);
    range.addEventListener('input', () => { it.start = Number(range.value); v.textContent = `${num(range.value)} ${LANG === 'en' ? 's' : 'সে.'}`; });
    range.addEventListener('change', () => { stopPreview(); previewing = playMusicChoice(it, 0); previewId = it.id; r.classList.add('playing'); });
    box.append(el('span', null, LANG === 'en' ? 'Start at' : 'শুরু'), range, v);
    r.after(box);
  }
  const sec = (bn, en) => ({ sec: LANG === 'en' ? en : bn });
  function draw() {
    for (const b of tabs.children) b.classList.toggle('on', b.dataset.t === tab);
    let items;
    const needle = q.trim().toLowerCase();
    const jam = chart.map(extItem);
    if (needle) {
      items = all().filter(x => (x.title + ' ' + x.by).toLowerCase().includes(needle));
      if (hits.length) items.push(sec('Jamendo থেকে', 'From Jamendo'), ...hits.map(extItem));
    } else if (tab === 'hot') {
      // what people here use most, then the world's chart (Jamendo), then the rest
      const used = all().filter(x => x.uses > 0).sort((a, b) => b.uses - a.uses);
      items = [...used];
      if (jam.length) items.push(sec('এই সপ্তাহের জনপ্রিয় · Jamendo', 'Trending this week · Jamendo'), ...jam);
      items.push(sec('BD Map Music ও আপনাদের সাউন্ড', 'BD Map Music and your sounds'), ...all().filter(x => !x.uses && !x.id.startsWith('jam:')));
    } else if (tab === 'you') items = [...jam.slice(8, 30), ...MUSIC.TRACKS.map(genItem), ...data.audios.map(reelItem).slice(0, 10), ...jam.slice(0, 8)];
    else if (tab === 'saved') items = readList(MUSIC_SAVED);
    else items = readList(MUSIC_RECENT);
    const seen = new Set();
    items = items.filter(x => x.sec || (!seen.has(x.id) && seen.add(x.id)));
    items = items.filter((x, i) => !x.sec || (items[i + 1] && !items[i + 1].sec));          // no heading without songs under it
    const rows = items.map(x => (x.sec ? el('div', 'mp-sec', x.sec) : row(x)));
    if ((loading && data.catalogue !== false && (tab === 'hot' || tab === 'you') && !needle) || (needle && searching)) rows.push(el('div', 'mp-none mp-wait', LANG === 'en' ? 'Fetching songs…' : 'গান আনা হচ্ছে…'));
    list.replaceChildren(...(rows.length ? rows : [el('div', 'mp-none', tab === 'saved' ? (LANG === 'en' ? 'Tap 🔖 on a sound to keep it here.' : 'কোনো সাউন্ডে 🔖 চাপলে এখানে থাকবে।') : tab === 'recent' ? (LANG === 'en' ? 'Sounds you use show up here.' : 'যে সাউন্ড ব্যবহার করবেন, এখানে আসবে।') : (LANG === 'en' ? 'Nothing found.' : 'কিছু পাওয়া যায়নি।'))]));
    if (data.catalogue === false && tab === 'hot' && !needle) list.appendChild(el('div', 'mp-note', LANG === 'en' ? 'Popular film songs need a licence from the music labels, so they are not here. BD Map Music, your own uploads and reels’ original sounds are free to use.' : 'সিনেমা ও জনপ্রিয় গান ব্যবহারের জন্য গানের কোম্পানির লাইসেন্স লাগে, তাই সেগুলো এখানে নেই। BD Map Music, নিজের আপলোড আর রিলের মূল সাউন্ড সবাই ব্যবহার করতে পারেন।'));
  }
  for (const [k, bn, en] of [['hot', 'জনপ্রিয়', 'Hot'], ['you', 'আপনার জন্য', 'For you'], ['saved', 'সেভ করা', 'Saved'], ['recent', 'সাম্প্রতিক', 'Recent']]) {
    const b = el('button', null, LANG === 'en' ? en : bn);
    b.dataset.t = k;
    b.addEventListener('click', () => { tab = k; draw(); });
    tabs.appendChild(b);
  }
  let timer = null;
  qi.addEventListener('input', () => {
    q = qi.value;
    draw();
    clearTimeout(timer);
    hits = [];
    searching = !!(data.catalogue && q.trim().length >= 2);
    draw();
    const asked = q.trim();
    if (searching) timer = setTimeout(async () => {
      try { const r = (await exploreApi('music?q=' + encodeURIComponent(asked))).tracks || []; if (q.trim() === asked) hits = r; } catch { /* local results stay */ }
      if (q.trim() === asked) { searching = false; draw(); }
    }, 350);
  });
  const head = el('div', 'mp-head');
  head.append(tabs);
  const remove = el('button', 'mp-remove', LANG === 'en' ? 'Remove music' : 'গান সরান');
  remove.hidden = !st.music;
  remove.addEventListener('click', () => { stopPreview(); st.music = null; st.orig = true; close(); done(); });
  sheet.append(grab, search, head, upload, list, remove);
  st.box.appendChild(sheet);
  // Pull up to see more songs, down to see the video, further down to close.
  dragSheet(sheet, grab, { snaps: [.58, .94], onClose: close, onTap: close, box: () => st.box.clientHeight }).snap(0, false);
  if (musicCache && musicCache.data) { data = musicCache.data; chart = musicCache.chart; loading = false; }
  draw();
  if (loading) {
    const c = await loadCatalogue();
    if (c && c.data) { data = c.data; chart = c.chart; }
    loading = false;
    if (sheet.isConnected) draw();
  }
}
function sbtnLight(icon, label, fn) { const b = el('button', 'mp-icon'); b.innerHTML = svg(icon); b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', e => { e.stopPropagation(); fn(); }); return b; }

// A sound of one's own: an audio file from the phone, with a title and a promise about the rights.
function uploadSound(done) {
  const chooser = Object.assign(el('input'), { type: 'file', accept: 'audio/*' });
  chooser.addEventListener('change', () => {
    const file = chooser.files[0];
    if (!file) return;
    if (file.size > 10e6) { chatToast(ME, 'ফাইলটি ১০ এমবির বেশি।'); return; }
    const [titleBox, title] = field('সাউন্ডের নাম', { maxLength: 80, value: file.name.replace(/\.[^.]+$/, '').slice(0, 80) });
    const rights = Object.assign(el('input'), { type: 'checkbox' });
    const label = el('label', 'mp-rights');
    label.append(rights, el('span', null, 'এই সাউন্ডটি আমার নিজের, অথবা ব্যবহারের অনুমতি আমার আছে। অন্যের কপিরাইট করা গান দিলে তা সরিয়ে দেওয়া হবে।'));
    const note = el('div', 'form-note');
    const go = button('send', 'আপলোড করুন', async () => {
      if (!rights.checked) { note.className = 'form-note bad'; note.textContent = 'আগে নিশ্চিত করুন যে সাউন্ডটি ব্যবহারের অনুমতি আছে।'; return; }
      go.disabled = true;
      note.className = 'form-note'; note.textContent = 'আপলোড হচ্ছে…';
      try {
        const secs = await new Promise(r => { const a = new Audio(URL.createObjectURL(file)); a.onloadedmetadata = () => r(a.duration || 0); a.onerror = () => r(0); setTimeout(() => r(0), 4000); });
        const up = await fetch('api/chat/upload', { method: 'POST', headers: { 'Content-Type': file.type || 'audio/mpeg', 'X-Name': encodeURIComponent(file.name) }, body: file }).then(r => r.json());
        if (up.kind !== 'audio') throw new Error('type');
        const { sound } = await exploreApi('sound', { media: up.media, title: title.value, secs, rights: true });
        closeModal();
        done({ ...sound, secs });
      } catch (e) { go.disabled = false; note.className = 'form-note bad'; note.textContent = e.message === 'type' ? 'MP3, M4A, OGG বা WebM অডিও দিন।' : 'আপলোড করা যায়নি।'; }
    });
    openModal('নিজের সাউন্ড', 'অন্যরাও এটি দিয়ে রিল বানাতে পারবেন', [titleBox, label, note], [go]);
  });
  chooser.click();
}
