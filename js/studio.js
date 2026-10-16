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
  const st = studio = { mode: opts.mode || 'post', file: null, kind: '', url: '', fx: '', music: opts.music || null, orig: !opts.music, stream: null, facing: 'user', box: el('div', 'studio'), preview: null };
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
  if (video && file.size > 50e6) { chatToast(ME, 'ভিডিওটি ৫০ এমবির বেশি। ছোট একটি দিন।'); return; }
  if (st.mode === 'reel' && !video) { chatToast(ME, 'রিলের জন্য একটি ভিডিও দিন।'); return; }
  if (st.url) URL.revokeObjectURL(st.url);
  Object.assign(st, { file, kind: video ? 'video' : 'photo', url: URL.createObjectURL(file), baked });
  drawEdit();
}

// ---- 2. the camera ----
async function openCamera() {
  const st = studio;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { chatToast(ME, 'এই ব্রাউজারে ক্যামেরা খোলা যায় না।'); return; }
  stopCamera();
  try {
    st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: st.facing, width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: true });
  } catch { chatToast(ME, 'ক্যামেরা ও মাইক্রোফোনের অনুমতি দিন।'); drawSource(); return; }
  if (studio !== st) { stopCamera(); return; }
  const view = Object.assign(el('video'), { autoplay: true, muted: true, playsInline: true, srcObject: st.stream });
  view.classList.toggle('mirror', st.facing === 'user');
  view.style.filter = fxCss(st.fx);
  const stage = el('div', 'st-camera');
  const timer = el('div', 'st-rec-time');
  timer.hidden = true;
  // Top: music, flip.
  const tune = el('button', 'st-chip');
  const paintTune = () => { tune.replaceChildren(Object.assign(el('i'), { innerHTML: svg('note') }), document.createTextNode(st.music ? musicTitle(st.music) : (LANG === 'en' ? 'Add music' : 'গান যোগ করুন'))); tune.classList.toggle('on', !!st.music); };
  paintTune();
  tune.addEventListener('click', () => openMusicPicker(paintTune));
  const flip = sbtn('flip', 'ক্যামেরা ঘোরান', () => { st.facing = st.facing === 'user' ? 'environment' : 'user'; openCamera(); }, 'round');
  const mic = sbtn('mic', 'মাইক্রোফোন', () => { st.orig = !st.orig; mic.classList.toggle('off', !st.orig); }, 'round');
  mic.classList.toggle('off', !st.orig);
  const tools = el('div', 'st-tools');
  tools.append(flip, mic);
  // Bottom: filters, then the shutter. Photo and video in post mode; video only for a reel; story both.
  const strip = filterStrip(id => { st.fx = id; view.style.filter = fxCss(id); }, null);
  // The filter circles show what the camera sees, each through its own filter.
  view.addEventListener('loadeddata', () => setTimeout(() => {
    if (!view.videoWidth) return;
    const c = el('canvas'), k = 120 / Math.min(view.videoWidth, view.videoHeight);
    c.width = Math.round(view.videoWidth * k); c.height = Math.round(view.videoHeight * k);
    c.getContext('2d').drawImage(view, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', .7);
    for (const f of strip.querySelectorAll('.face')) f.style.backgroundImage = `url("${url}")`;
  }, 500), { once: true });
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
      const c = el('canvas'), w = view.videoWidth, h = view.videoHeight;
      if (!w) return;
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      if (st.facing === 'user') { g.translate(w, 0); g.scale(-1, 1); }
      if (canvasFilters) g.filter = fxCss(st.fx);
      g.drawImage(view, 0, 0, w, h);
      stage.classList.add('flash');
      c.toBlob(b => { if (!b) return; const baked = canvasFilters; if (baked) st.fx = ''; stopCamera(); takeFile(new File([b], 'photo.jpg', { type: 'image/jpeg' }), baked); }, 'image/jpeg', .9);
      return;
    }
    if (rec) { stopRec(); return; }
    const type = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    const tracks = [...st.stream.getVideoTracks(), ...(st.orig ? st.stream.getAudioTracks() : [])];
    try { rec = new MediaRecorder(new MediaStream(tracks), type ? { mimeType: type, videoBitsPerSecond: 2.5e6 } : undefined); }
    catch { chatToast(ME, 'এই ব্রাউজারে ভিডিও রেকর্ড করা যায় না।'); return; }
    chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      clearInterval(tick);
      if (playing) playing.stop();
      const base = (rec.mimeType || 'video/webm').split(';')[0];
      const file = new File(chunks, `reel.${base.includes('mp4') ? 'mp4' : 'webm'}`, { type: base });
      rec = null;
      stopCamera();
      takeFile(file, false);
    };
    rec.start(500);
    started = Date.now();
    shutter.classList.add('rec');
    timer.hidden = false;
    // You hear the music while recording; it is not recorded into the file — it plays with the reel later.
    if (st.music) playing = playMusicChoice(st.music, 0);
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
  stage.append(view, timer, tools);
  const bottom = el('div', 'st-cam-bottom');
  bottom.append(strip, kinds, row);
  const top = studioBar(modeTitle(), tune);
  st.box.replaceChildren(stage, top, bottom);
  stage.addEventListener('animationend', () => stage.classList.remove('flash'));
}
function stopCamera() {
  if (studio && studio.stream) { for (const t of studio.stream.getTracks()) t.stop(); studio.stream = null; }
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

// ---- 3. editing: filter, music, sound ----
async function drawEdit() {
  const st = studio;
  const frame = el('div', 'st-frame ' + (st.mode === 'post' ? 'r45' : 'r916'));
  const media = st.kind === 'video' ? Object.assign(el('video'), { src: st.url, autoplay: true, loop: true, playsInline: true, muted: !st.orig }) : Object.assign(el('img'), { src: st.url, alt: '' });
  media.style.filter = fxCss(st.fx);
  frame.appendChild(media);
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
  tune.addEventListener('click', () => openMusicPicker(() => { paintTune(); restartMusic(); }));
  if (st.mode !== 'story') tools.appendChild(tune);
  if (st.kind === 'video') {
    const vol = el('button', 'st-chip');
    const paintVol = () => { vol.replaceChildren(Object.assign(el('i'), { innerHTML: svg('sound') }), document.createTextNode(st.orig ? (LANG === 'en' ? 'Video sound on' : 'ভিডিওর শব্দ চালু') : (LANG === 'en' ? 'Video sound off' : 'ভিডিওর শব্দ বন্ধ'))); vol.classList.toggle('on', st.orig); };
    paintVol();
    vol.addEventListener('click', () => { st.orig = !st.orig; media.muted = !st.orig; paintVol(); });
    tools.appendChild(vol);
  }
  const next = el('button', 'st-next', st.mode === 'story' ? 'শেয়ার করুন' : 'পরের ধাপ');
  next.addEventListener('click', () => (st.mode === 'story' ? share() : drawDetails()));
  const back = sbtn('back', 'ফিরে যান', () => { if (st.preview) st.preview.stop(); drawSource(); });
  const bar = el('header', 'st-bar');
  bar.append(back, el('b', null, 'এডিট'), next);
  const body = el('div', 'st-edit');
  body.append(frame, tools, el('div', 'st-label', 'ফিল্টার'), strip);
  st.box.replaceChildren(bar, body);
}

// ---- 4. the caption, the place, share ----
function drawDetails() {
  const st = studio;
  const thumb = el('div', 'st-thumb');
  thumb.appendChild(st.kind === 'video' ? Object.assign(el('video'), { src: st.url, muted: true, playsInline: true, preload: 'metadata' }) : Object.assign(el('img'), { src: st.url, alt: '' }));
  thumb.firstChild.style.filter = fxCss(st.fx);
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
  const onProgress = f => { if (progress) progress.firstChild.style.width = Math.round(f * 100) + '%'; };
  try {
    let blob = st.file, type = st.file.type || 'video/mp4', fx = st.fx, poster = '';
    if (st.kind === 'photo') {
      blob = await bakePhoto(st.file, canvasFilters ? fx : '');
      if (canvasFilters) fx = '';
      type = 'image/jpeg';
    } else poster = await videoPoster(st.file);
    const media = await uploadMedia(blob, type, onProgress);
    if (st.mode === 'story') await exploreApi('story', { media, poster });
    else await exploreApi('post', { media, poster, caption: st.caption || '', place: st.place || null, fx, music: st.music ? st.music.id : '', mstart: st.music ? st.music.start : 0, orig: st.kind === 'video' ? st.orig : true });
    const mode = st.mode;
    closeStudio();
    chatToast(ME, mode === 'story' ? 'স্টোরি দেওয়া হয়েছে — ২৪ ঘণ্টা থাকবে।' : mode === 'reel' ? 'রিল পোস্ট হয়েছে।' : 'পোস্ট হয়েছে।');
    if (typeof refreshStoryRings === 'function') refreshStoryRings();
    if (current === 'explore') enter.explore(); else if (current === 'profile') drawProfile(); else go('explore');
  } catch (e) {
    if (btn) btn.disabled = false;
    if (progress) progress.hidden = true;
    const text = e.message === 'big' ? 'ফাইলটি অনেক বড়।' : e.message === 'type' ? 'এই ধরনের ফাইল নেওয়া যায় না।' : e.message === 'slow' ? 'আজ অনেকগুলো পোস্ট হয়েছে। কাল আবার চেষ্টা করুন।'
      : e.message === 'closed' ? 'এই মুহূর্তে পোস্ট দেওয়া বন্ধ আছে।' : 'শেয়ার করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।';
    if (note) { note.className = 'form-note bad'; note.textContent = text; } else chatToast(ME, text);
  }
}
// The picture at most 1600 px on its long side, with the filter drawn in.
function bakePhoto(file, fx) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = el('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const g = c.getContext('2d');
      if (fx) g.filter = fxCss(fx);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('image'))), 'image/jpeg', .88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

// ---- music: the app's tracks, and reels' own sounds ----
const musicTitle = m => m.id.startsWith('gen:') ? MUSIC.name(m.id.slice(4)) : `${m.by || ''} · ${LANG === 'en' ? 'Original audio' : 'মূল অডিও'}`;
function playMusicChoice(m, at = 0) {
  if (m.id.startsWith('gen:')) return MUSIC.play(m.id.slice(4), (m.start || 0) + at, { volume: .75 });
  const a = new Audio(m.src);
  a.currentTime = (m.start || 0) + at;
  a.play().catch(() => {});
  return { stop() { a.pause(); }, setVolume(v) { a.volume = v; } };
}
async function openMusicPicker(done) {
  const st = studio;
  let previewing = null, previewId = '';
  const stopPreview = () => { if (previewing) previewing.stop(); previewing = null; previewId = ''; for (const b of list.querySelectorAll('.mp-play')) b.classList.remove('on'); };
  const list = el('div', 'mp-list');
  const row = (m, title, sub, art) => {
    const r = el('div', 'mp-row' + (st.music && st.music.id === m.id ? ' picked' : ''));
    const play = el('button', 'mp-play');
    play.innerHTML = svg('play');
    play.setAttribute('aria-label', 'শুনুন');
    play.addEventListener('click', e => {
      e.stopPropagation();
      const was = previewId === m.id;
      stopPreview();
      if (was) return;
      previewing = playMusicChoice(m, 0);
      previewId = m.id;
      play.classList.add('on');
    });
    const t = el('div', 't no-tr');
    t.append(el('b', null, title), el('span', null, sub));
    const use = el('button', 'pill-btn', st.music && st.music.id === m.id ? 'বাছা হয়েছে' : 'বাছুন');
    use.addEventListener('click', () => { stopPreview(); st.music = { ...m, start: Number(start.value) || 0 }; if (st.kind === 'video' || st.stream) st.orig = false; closeModal(); done(); });
    r.append(art, t, play, use);
    return r;
  };
  list.appendChild(el('div', 'info-label', 'BD Map Music — কপিরাইট ছাড়া, যে কেউ ব্যবহার করতে পারেন'));
  MUSIC.TRACKS.forEach((tr, i) => {
    const art = el('span', 'mp-art g' + (i % 8));
    art.innerHTML = svg('note');
    list.appendChild(row({ id: 'gen:' + tr.id, start: 0 }, MUSIC.name(tr.id), `${MUSIC.mood(tr.id)} · ${num(tr.bpm)} BPM`, art));
  });
  const reels = el('div');
  list.append(el('div', 'info-label', 'রিলের মূল অডিও — অন্যদের রিলের শব্দ দিয়ে বানান'), reels);
  // Where the music starts, in seconds.
  const start = Object.assign(el('input'), { type: 'range', min: 0, max: 60, step: 1, value: st.music ? st.music.start || 0 : 0 });
  const startLabel = el('span', 'mp-start-v', `${num(start.value)} সেকেন্ড`);
  start.addEventListener('input', () => { startLabel.textContent = `${num(start.value)} সেকেন্ড`; });
  const startBox = el('label', 'mp-start');
  startBox.append(el('span', null, 'কোথা থেকে বাজবে'), start, startLabel);
  const actions = [];
  if (st.music) actions.push(button('trash', 'গান সরান', () => { stopPreview(); st.music = null; st.orig = true; closeModal(); done(); }, true));
  openModal('গান বাছুন', 'রিল বা পোস্টের সাথে বাজবে', [startBox, list], actions);
  $('modal').classList.add('music-modal');
  const obs = new MutationObserver(() => { if ($('modal').hidden) { stopPreview(); obs.disconnect(); } });
  obs.observe($('modal'), { attributes: true, attributeFilter: ['hidden'] });
  try {
    const { audios } = await exploreApi('audios');
    if (!audios.length) { reels.appendChild(el('div', 'empty', 'এখনো কোনো রিল নেই।')); return; }
    for (const a of audios) {
      const art = el('span', 'mp-art pic');
      if (a.poster) art.style.backgroundImage = `url("${a.poster}")`;
      else art.appendChild(avatar(a.user, 'sm'));
      reels.appendChild(row({ id: a.id, start: 0, src: a.src, by: a.user.name }, `${a.user.name} · ${LANG === 'en' ? 'Original audio' : 'মূল অডিও'}`, a.uses ? `${num(a.uses)}টি রিলে ব্যবহার হয়েছে` : agoText(a.created), art));
    }
  } catch { reels.appendChild(el('div', 'empty', 'দেখানো যায়নি।')); }
}
