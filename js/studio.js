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
  if (studio.url) URL.revokeObjectURL(studio.url);
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
  const chooser = Object.assign(el('input'), { type: 'file', accept: st.mode === 'reel' ? 'video/*' : 'image/*,video/*', hidden: true });
  chooser.addEventListener('change', () => { const f = chooser.files[0]; if (f) takeFile(f, false); });
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
  st.box.replaceChildren(studioBar(modeTitle()), stage, modeSwitch(drawSource));
}
function takeFile(file, baked) {
  const st = studio;
  const video = file.type.startsWith('video');
  if (video && file.size > MAX_VIDEO) { chatToast(ME, LANG === 'en' ? 'The video is over 3 GB.' : 'ভিডিওটি ৩ জিবির বেশি। ছোট একটি দিন।'); return; }
  if (st.mode === 'reel' && !video) { chatToast(ME, 'রিলের জন্য একটি ভিডিও দিন।'); return; }
  if (st.url) URL.revokeObjectURL(st.url);
  const words = st.textStory != null && baked && !video;
  Object.assign(st, { file, kind: video ? 'video' : 'photo', url: URL.createObjectURL(file), baked, w: 0, h: 0, layers: words ? st.layers : [] });
  if (!words) st.textStory = null;
  drawEdit();
}
const MAX_VIDEO = 3e9;
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
  const tools = el('div', 'st-tools');
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

// ---- 3. editing: words, stickers, filter, music, sound ----
async function drawEdit() {
  const st = studio;
  await mediaSize(st);
  if (studio !== st) return;
  const shape = st.shape = frameShape(st);
  const frame = el('div', 'st-frame ' + (shape.fit === 'contain' ? 'fit' : 'fill'));
  frame.style.aspectRatio = String(shape.ratio);
  frame.style.width = `min(100% - 24px, 520px, ${st.mode === 'post' ? 60 : 64}dvh * ${shape.ratio.toFixed(4)})`;
  const media = st.kind === 'video' ? Object.assign(el('video', 'st-media'), { src: st.url, autoplay: true, loop: true, playsInline: true, muted: !st.orig }) : Object.assign(el('img', 'st-media'), { src: st.url, alt: '' });
  media.style.filter = fxCss(st.fx);
  media.style.objectFit = shape.fit;
  if (shape.fit === 'contain' && st.kind === 'photo') frame.appendChild(Object.assign(el('img', 'st-blur'), { src: st.url, alt: '' }));
  frame.appendChild(media);
  // Words and stickers: on a photo over the whole frame (they are drawn into it); on a video over the video itself.
  let lyr;
  if (st.kind === 'video') lyr = layerBox(media, null, shape.fit);
  else { lyr = el('div', 'lyr full'); frame.appendChild(lyr); }
  const bin = el('div', 'st-bin');
  bin.innerHTML = svg('trash');
  frame.appendChild(bin);
  const editor = layerEditor(lyr, st.layers, { bin, frame, onEditText: l => editText(l) });
  function editText(l) {
    const i = l ? st.layers.indexOf(l) : -1;
    if (i >= 0) { st.layers.splice(i, 1); editor.redraw(); }
    if (st.kind === 'video') media.pause();
    openTextTool(st.box, l, (out) => {
      if (out) {
        if (!l) { const n = st.layers.length; out.y = Math.min(.8, .42 + (n % 4) * .08); }
        st.layers.push(out);
      }
      editor.redraw();
      if (st.kind === 'video') media.play().catch(() => {});
    }, lyr.getBoundingClientRect().width / 100 || undefined);
  }
  // the tools down the right side, as on Instagram
  const side = el('div', 'st-side');
  const tool = (html, label, fn) => { const b = el('button', 'st-tool'); b.innerHTML = html; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); side.appendChild(b); return b; };
  tool('<b>Aa</b>', LANG === 'en' ? 'Text' : 'লেখা', () => editText(null));
  tool(svg('smile'), LANG === 'en' ? 'Stickers' : 'স্টিকার ও ইমোজি', () => openStickerSheet(st.box, { place: st.place, text: () => editText(null) }, l => { l.y = Math.min(.85, .5 + (st.layers.length % 4) * .09); st.layers.push(l); editor.redraw(); }));
  if (st.textStory != null) tool('<i class="st-swatch"></i>', LANG === 'en' ? 'Background' : 'পেছনের রং', async () => {
    st.textStory++;
    const f = await wordsBackground(st.textStory);
    URL.revokeObjectURL(st.url);
    Object.assign(st, { file: f, url: URL.createObjectURL(f) });
    media.src = st.url;
  });
  frame.appendChild(side);
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
  let thumb = st.url;
  if (st.kind === 'video') thumb = await videoPoster(st.file) || '';
  if (studio !== st) return;
  const strip = filterStrip(id => { st.fx = id; media.style.filter = fxCss(id); }, thumb);
  const tools = el('div', 'st-edit-tools');
  const tune = el('button', 'st-chip');
  const paintTune = () => { tune.replaceChildren(Object.assign(el('i'), { innerHTML: svg('note') }), document.createTextNode(st.music ? musicTitle(st.music) : (LANG === 'en' ? 'Music' : 'গান'))); tune.classList.toggle('on', !!st.music); };
  paintTune();
  tune.addEventListener('click', () => openMusicSheet(() => { paintTune(); restartMusic(); }));
  if (st.mode !== 'story') tools.appendChild(tune);
  if (st.kind === 'video') {
    const vol = el('button', 'st-chip');
    const paintVol = () => { vol.replaceChildren(Object.assign(el('i'), { innerHTML: svg('sound') }), document.createTextNode(st.orig ? (LANG === 'en' ? 'Video sound on' : 'ভিডিওর শব্দ চালু') : (LANG === 'en' ? 'Video sound off' : 'ভিডিওর শব্দ বন্ধ'))); vol.classList.toggle('on', st.orig); };
    paintVol();
    vol.addEventListener('click', () => { st.orig = !st.orig; media.muted = !st.orig; paintVol(); });
    tools.appendChild(vol);
  }
  const shapeNote = el('span', 'st-shape', st.mode === 'post' ? (Math.abs(shape.ratio - 16 / 9) < .03 ? '16:9' : shape.ratio >= 1.9 ? '1.91:1' : Math.abs(shape.ratio - 1) < .02 ? '1:1' : shape.ratio <= .801 ? '4:5' : shape.ratio.toFixed(2) + ':1') : '9:16');
  shapeNote.title = LANG === 'en' ? 'The shape it will show in' : 'যে মাপে দেখাবে';
  tools.prepend(shapeNote);
  const next = el('button', 'st-next', st.mode === 'story' ? 'শেয়ার করুন' : 'পরের ধাপ');
  next.addEventListener('click', () => (st.mode === 'story' ? share() : drawDetails()));
  const back = sbtn('back', 'ফিরে যান', () => { if (st.preview) st.preview.stop(); st.textStory = null; drawSource(); });
  const bar = el('header', 'st-bar');
  bar.append(back, el('b', null, 'এডিট'), next);
  const body = el('div', 'st-edit');
  body.append(frame, tools, el('div', 'st-label', 'ফিল্টার'), strip);
  st.box.replaceChildren(bar, body);
  if (st.textStory != null && !st.layers.length) editText(null);
}

// ---- 4. the caption, the place, share ----
function drawDetails() {
  const st = studio;
  const thumb = el('div', 'st-thumb');
  thumb.appendChild(st.kind === 'video' ? Object.assign(el('video'), { src: st.url, muted: true, playsInline: true, preload: 'metadata' }) : Object.assign(el('img'), { src: st.url, alt: '' }));
  thumb.firstChild.style.filter = fxCss(st.fx);
  if (st.shape) thumb.style.aspectRatio = String(st.shape.ratio);
  const caption = Object.assign(el('textarea', 'st-caption'), { rows: 4, maxLength: 500, placeholder: LANG === 'en' ? 'Write a caption…' : 'ক্যাপশন লিখুন… কোথায়, কেমন লাগল' });
  caption.value = st.caption || '';
  caption.addEventListener('input', () => { st.caption = caption.value; });
  const top = el('div', 'st-compose');
  top.append(thumb, caption);
  const placeInput = Object.assign(el('input'), { autocomplete: 'off', placeholder: LANG === 'en' ? 'Add location' : 'জায়গা যোগ করুন' });
  if (st.place) placeInput.value = st.place.label;
  const sug = el('div', 'suggest');
  sug.hidden = true;
  const place = el('label', 'st-row');
  place.append(ic('pin'), placeInput, sug);
  wireSuggest(placeInput, sug, p => { st.place = p; placeInput.value = p.label; placeInput.blur(); }, () => { st.place = null; });
  const rows = [place];
  if (st.music) { const r = el('div', 'st-row'); r.append(ic('note'), el('span', 'no-tr', musicTitle(st.music))); rows.push(r); }
  const progress = el('div', 'st-progress');
  progress.innerHTML = '<i></i>';
  progress.hidden = true;
  const note = el('div', 'form-note');
  const shareBtn = el('button', 'st-share', 'শেয়ার করুন');
  shareBtn.addEventListener('click', () => share(shareBtn, progress, note));
  const bar = el('header', 'st-bar');
  bar.append(sbtn('back', 'ফিরে যান', drawEdit), el('b', null, st.mode === 'reel' ? 'নতুন রিল' : 'নতুন পোস্ট'), el('span'));
  const body = el('div', 'st-details');
  body.append(top, ...rows, progress, note);
  const foot = el('div', 'st-foot');
  foot.appendChild(shareBtn);
  st.box.replaceChildren(bar, body, foot);
  if (st.preview) { st.preview.stop(); st.preview = null; }
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
    if (st.kind === 'photo') {
      const baked = await bakeFrame(st, shape, canvasFilters ? fx : '');
      blob = baked.blob; w = baked.w; h = baked.h;
      if (canvasFilters) fx = '';
      type = 'image/jpeg';
    } else { poster = await videoPoster(st.file); layers = st.layers; }
    const media = await uploadMedia(blob, type, onProgress);
    if (st.mode === 'story') await exploreApi('story', { media, poster, w, h, layers });
    else await exploreApi('post', { media, poster, w, h, layers, caption: st.caption || '', place: st.place || null, fx, music: st.music ? st.music.id : '', mstart: st.music ? st.music.start : 0, orig: st.kind === 'video' ? st.orig : true });
    const mode = st.mode;
    closeStudio();
    chatToast(ME, mode === 'story' ? 'স্টোরি দেওয়া হয়েছে — ২৪ ঘণ্টা থাকবে।' : mode === 'reel' ? 'রিল পোস্ট হয়েছে।' : 'পোস্ট হয়েছে।');
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
