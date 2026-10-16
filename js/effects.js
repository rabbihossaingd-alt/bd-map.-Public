// ---- Camera effects: face stickers, beauty and looks, drawn into every frame ----
// The camera is drawn onto a canvas 30 times a second; the effect is painted on top and the canvas is what gets
// photographed or recorded, so the effect is in the file. Face effects find the face with Google's MediaPipe
// Face Landmarker (Apache 2.0, loaded only when a face effect is first chosen). Looks use canvas blending modes,
// which every browser has (Safari cannot run CSS filters on a canvas).

const FX_TABS = [['trend', 'ট্রেন্ডিং', 'Trending'], ['face', 'চেহারা', 'Appearance'], ['look', 'এস্থেটিক', 'Aesthetic'], ['fun', 'মজা', 'Fun']];
const EFFECTS = [
  { id: 'none', bn: 'কিছু না', en: 'No effect', tabs: ['trend', 'face', 'look', 'fun'], icon: '⦸', bg: '#3a3a3c' },
  { id: 'beauty', bn: 'বিউটি', en: 'Beauty', tabs: ['trend', 'face'], face: false, icon: '✨', bg: 'linear-gradient(135deg,#ffd1dc,#ff8fab)' },
  { id: 'cat', bn: 'বিড়াল', en: 'Kitty', tabs: ['trend', 'fun'], face: true, icon: '🐱', bg: 'linear-gradient(135deg,#ffe0f0,#ffb3d1)' },
  { id: 'glasses', bn: 'সানগ্লাস', en: 'Shades', tabs: ['trend', 'fun'], face: true, icon: '😎', bg: 'linear-gradient(135deg,#1f1c2c,#928dab)' },
  { id: 'cinema', bn: 'সিনেমা', en: 'Cinema', tabs: ['trend', 'look'], icon: '🎬', bg: 'linear-gradient(135deg,#0f4c5c,#e36414)' },
  { id: 'y2014', bn: '২০১৪', en: '2014', tabs: ['trend', 'look'], icon: '📷', bg: 'linear-gradient(135deg,#ffb347,#ffcc33)' },
  { id: 'hearts', bn: 'ভালোবাসা', en: 'Hearts', tabs: ['trend', 'fun'], face: true, icon: '😍', bg: 'linear-gradient(135deg,#ff5f6d,#ffc371)' },
  { id: 'glow', bn: 'ড্রিমি', en: 'Dreamy', tabs: ['face', 'look'], icon: '🌸', bg: 'linear-gradient(135deg,#fbc2eb,#a6c1ee)' },
  { id: 'dog', bn: 'কুকুর', en: 'Puppy', tabs: ['fun'], face: true, icon: '🐶', bg: 'linear-gradient(135deg,#d7a86e,#8b5a2b)' },
  { id: 'crown', bn: 'ফুলের মুকুট', en: 'Flower crown', tabs: ['trend', 'face', 'fun'], face: true, icon: '🌼', bg: 'linear-gradient(135deg,#f6d365,#fda085)' },
  { id: 'blush', bn: 'লাজুক', en: 'Blush', tabs: ['face', 'fun'], face: true, icon: '😊', bg: 'linear-gradient(135deg,#ffecd2,#fcb69f)' },
  { id: 'bigeyes', bn: 'বড় চোখ', en: 'Big eyes', tabs: ['fun'], face: true, icon: '👀', bg: 'linear-gradient(135deg,#a1c4fd,#c2e9fb)' },
  { id: 'hdr', bn: 'HDR', en: 'HDR', tabs: ['look'], icon: '🌄', bg: 'linear-gradient(135deg,#134e5e,#71b280)' },
  { id: 'noir', bn: 'নয়ার', en: 'Noir', tabs: ['look'], icon: '🖤', bg: 'linear-gradient(135deg,#000,#666)' },
  { id: 'redlight', bn: 'লাল আলো', en: 'Red light', tabs: ['look'], icon: '🔴', bg: 'linear-gradient(135deg,#43000b,#ff2a2a)' },
  { id: 'vhs', bn: 'VHS', en: 'VHS', tabs: ['look', 'fun'], icon: '📼', bg: 'linear-gradient(135deg,#2c3e50,#4ca1af)' },
  { id: 'film', bn: 'ফিল্ম', en: 'Film grain', tabs: ['look'], icon: '🎞️', bg: 'linear-gradient(135deg,#7f6a4f,#d9c3a0)' }
];
const effectName = e => LANG === 'en' ? e.en : e.bn;

// ---- finding the face ----
let faceModel = null, faceLoading = null;
function loadFaceModel() {
  if (faceModel) return Promise.resolve(faceModel);
  if (faceLoading) return faceLoading;
  faceLoading = (async () => {
    const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const vision = await import(base + '/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks(base + '/wasm');
    const make = delegate => vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate },
      runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false
    });
    try { faceModel = await make('GPU'); } catch { faceModel = await make('CPU'); }
    return faceModel;
  })().catch(e => { faceLoading = null; throw e; });
  return faceLoading;
}

// ---- the camera, drawn through an effect ----
// make(video, canvas) -> { set(id), facing, stop() }. The canvas has the output size (9:16 for reels and stories,
// 4:5 for posts) and the video is cropped to fill it, mirrored for the front camera.
function effectCamera(video, canvas, opts = {}) {
  const g = canvas.getContext('2d');
  const small = document.createElement('canvas'), sg = small.getContext('2d');
  const grain = document.createElement('canvas');
  grain.width = grain.height = 160;
  { const n = grain.getContext('2d'), d = n.createImageData(160, 160); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } n.putImageData(d, 0, 0); }
  const grainPat = g.createPattern(grain, 'repeat');
  let effect = 'none', raf = 0, face = null, lastDetect = 0, loading = false, t0 = performance.now();
  const particles = [];
  const state = { mirror: !!opts.mirror, onStatus: opts.onStatus || (() => {}) };

  const W = canvas.width, H = canvas.height;
  // where the video lands on the canvas (cover-crop)
  const crop = () => {
    const vw = video.videoWidth, vh = video.videoHeight;
    const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
    return { s, dx: (W - dw) / 2, dy: (H - dh) / 2, dw, dh };
  };
  // a landmark (0..1 of the video) in canvas pixels, after the crop and the mirror
  const pt = (lm, c) => { let x = c.dx + lm.x * c.dw; const y = c.dy + lm.y * c.dh; if (state.mirror) x = W - x; return { x, y }; };

  function drawFrame() {
    const c = crop();
    g.save();
    if (state.mirror) { g.translate(W, 0); g.scale(-1, 1); }
    g.drawImage(video, c.dx, c.dy, c.dw, c.dh);
    g.restore();
    return c;
  }
  // a soft, blurred copy of the frame (drawn small, then big) — blur without filters
  function soften(amount, op = 'source-over', alpha = .5) {
    const k = amount;
    small.width = Math.max(8, Math.round(W / k)); small.height = Math.max(8, Math.round(H / k));
    sg.drawImage(canvas, 0, 0, small.width, small.height);
    g.save(); g.globalCompositeOperation = op; g.globalAlpha = alpha; g.imageSmoothingQuality = 'high';
    g.drawImage(small, 0, 0, W, H);
    g.restore();
  }
  const tint = (color, op, alpha) => { g.save(); g.globalCompositeOperation = op; g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, W, H); g.restore(); };
  const vignette = (strength = .55) => { const r = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(0,0,0,${strength})`); g.fillStyle = r; g.fillRect(0, 0, W, H); };
  const addGrain = alpha => { g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = alpha; g.translate(Math.random() * 160, Math.random() * 160); g.fillStyle = grainPat; g.fillRect(-160, -160, W + 320, H + 320); g.restore(); };
  const selfOverlay = alpha => { g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = alpha; g.drawImage(canvas, 0, 0); g.restore(); };

  // ---- the looks ----
  const LOOKS = {
    beauty() { soften(9, 'lighten', .42); tint('#ffe4ec', 'soft-light', .25); },
    glow() { soften(14, 'screen', .45); tint('#ffc6e0', 'soft-light', .35); },
    cinema() { const lg = g.createLinearGradient(0, 0, W, H); lg.addColorStop(0, '#00a6a6'); lg.addColorStop(1, '#ff8c42'); g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = .55; g.fillStyle = lg; g.fillRect(0, 0, W, H); g.restore(); selfOverlay(.25); vignette(.5);
      g.fillStyle = '#000'; const bar = H * .07; g.fillRect(0, 0, W, bar); g.fillRect(0, H - bar, W, bar); },
    y2014() { tint('#ffb36b', 'soft-light', .45); tint('#1a1a1a', 'screen', .18); addGrain(.12); vignette(.35);
      const d = new Date(), stamp = `'${String(d.getFullYear()).slice(2)}  ${d.getMonth() + 1}  ${d.getDate()}`;
      g.save(); g.font = `600 ${Math.round(W * .055)}px ui-monospace, Consolas, monospace`; g.fillStyle = '#ff9a2e'; g.shadowColor = '#ff5a00'; g.shadowBlur = 8; g.textAlign = 'right'; g.fillText(stamp, W * .93, H * .94); g.restore(); },
    hdr() { selfOverlay(.55); tint('#ffffff', 'soft-light', .12); },
    noir() { tint('#808080', 'saturation', 1); selfOverlay(.4); vignette(.6); addGrain(.08); },
    redlight() { const r = g.createRadialGradient(W * .3, H * .3, 0, W * .3, H * .3, H); r.addColorStop(0, '#ff3b3b'); r.addColorStop(1, '#3a0008'); g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = .7; g.fillStyle = r; g.fillRect(0, 0, W, H); g.restore(); soften(16, 'screen', .35); },
    vhs(now) { tint('#3b6fa0', 'soft-light', .3); g.save(); g.globalAlpha = .1; g.fillStyle = '#000'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2); g.restore();
      const band = (now / 12) % H; g.save(); g.globalAlpha = .08; g.fillStyle = '#fff'; g.fillRect(0, band, W, H * .05); g.restore(); addGrain(.1);
      g.save(); g.font = `700 ${Math.round(W * .05)}px ui-monospace, Consolas, monospace`; g.fillStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText('▶ PLAY', W * .06, H * .08);
      const s = Math.floor((now - t0) / 1000); g.fillText(`SP 0:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, W * .06, H * .94); g.restore(); },
    film() { tint('#c8a165', 'soft-light', .35); addGrain(.2); vignette(.5); if (Math.random() < .08) { g.save(); g.globalAlpha = .25; g.fillStyle = '#fff'; g.fillRect(Math.random() * W, 0, 1.5, H); g.restore(); } }
  };

  // ---- the face stickers (all drawn, no images) ----
  function heart(x, y, s, color) {
    g.save(); g.translate(x, y); g.scale(s / 30, s / 30); g.fillStyle = color;
    g.beginPath(); g.moveTo(0, 9); g.bezierCurveTo(-15, -2, -11, -15, 0, -7); g.bezierCurveTo(11, -15, 15, -2, 0, 9); g.fill(); g.restore();
  }
  function flower(x, y, r, petal, centre) {
    g.save(); g.translate(x, y); g.fillStyle = petal;
    for (let i = 0; i < 5; i++) { g.rotate(Math.PI * 2 / 5); g.beginPath(); g.ellipse(0, -r * .62, r * .42, r * .62, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = centre; g.beginPath(); g.arc(0, 0, r * .35, 0, Math.PI * 2); g.fill(); g.restore();
  }
  function sparkle(x, y, s, a) { g.save(); g.globalAlpha = a; g.translate(x, y); g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.quadraticCurveTo(s * .15, s * .15, 0, s); g.quadraticCurveTo(-s * .15, s * .15, 0, 0); } g.fill(); g.restore(); }

  function drawFace(lm, c, now) {
    const P = i => pt(lm[i], c);
    const eyeL = lm[468] ? P(468) : P(33), eyeR = lm[473] ? P(473) : P(263);
    const outerL = P(33), outerR = P(263), top = P(10), chin = P(152), nose = P(1), sideL = P(234), sideR = P(454);
    const cheekL = P(50), cheekR = P(280), upLip = P(13), lowLip = P(14);
    const eyeDist = Math.hypot(outerR.x - outerL.x, outerR.y - outerL.y);
    const faceW = Math.hypot(sideR.x - sideL.x, sideR.y - sideL.y), faceH = Math.hypot(chin.x - top.x, chin.y - top.y);
    const angle = Math.atan2(outerR.y - outerL.y, outerR.x - outerL.x);
    // above the forehead
    const up = { x: (top.x - chin.x) / faceH, y: (top.y - chin.y) / faceH };
    const crownAt = k => ({ x: top.x + up.x * faceH * k, y: top.y + up.y * faceH * k });
    const mouthOpen = Math.hypot(lowLip.x - upLip.x, lowLip.y - upLip.y) / faceH;
    const along = (p, d) => ({ x: p.x + Math.cos(angle) * d, y: p.y + Math.sin(angle) * d });

    if (effect === 'cat' || effect === 'dog') {
      const head = crownAt(.08);
      for (const side of [-1, 1]) {
        const base = along(head, side * faceW * .32);
        g.save(); g.translate(base.x, base.y); g.rotate(angle + side * .25);
        if (effect === 'cat') {
          const s = faceW * .44;
          g.fillStyle = '#2b2b2b'; g.beginPath(); g.moveTo(-s * .5, s * .15); g.lineTo(0, -s * .85); g.lineTo(s * .5, s * .15); g.closePath(); g.fill();
          g.fillStyle = '#ff9ec7'; g.beginPath(); g.moveTo(-s * .28, s * .05); g.lineTo(0, -s * .55); g.lineTo(s * .28, s * .05); g.closePath(); g.fill();
        } else {
          const s = faceW * .42;
          g.rotate(side * .35); g.fillStyle = '#8b5a2b'; g.beginPath(); g.ellipse(side * s * .25, s * .45, s * .32, s * .7, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#5e3a17'; g.beginPath(); g.ellipse(side * s * .25, s * .55, s * .18, s * .45, 0, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      }
      g.save(); g.translate(nose.x, nose.y); g.rotate(angle);
      if (effect === 'cat') {
        g.fillStyle = '#ff7eb6'; g.beginPath(); g.moveTo(-eyeDist * .1, -eyeDist * .05); g.lineTo(eyeDist * .1, -eyeDist * .05); g.lineTo(0, eyeDist * .07); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(40,40,40,.85)'; g.lineWidth = Math.max(1.5, eyeDist * .018); g.lineCap = 'round';
        for (const side of [-1, 1]) for (const k of [-1, 0, 1]) { g.beginPath(); g.moveTo(side * eyeDist * .18, eyeDist * .05 + k * eyeDist * .05); g.lineTo(side * eyeDist * .65, k * eyeDist * .12); g.stroke(); }
      } else {
        g.fillStyle = '#1b1b1b'; g.beginPath(); g.ellipse(0, -eyeDist * .02, eyeDist * .18, eyeDist * .12, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(-eyeDist * .05, -eyeDist * .06, eyeDist * .05, eyeDist * .03, 0, 0, Math.PI * 2); g.fill();
      }
      g.restore();
      if (effect === 'dog' && mouthOpen > .06) {
        const m = { x: (upLip.x + lowLip.x) / 2, y: (upLip.y + lowLip.y) / 2 };
        g.save(); g.translate(lowLip.x, lowLip.y); g.rotate(angle); g.fillStyle = '#ff6f91';
        g.beginPath(); g.ellipse(0, eyeDist * .25, eyeDist * .17, eyeDist * .3, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#d94f74'; g.lineWidth = eyeDist * .02; g.beginPath(); g.moveTo(0, eyeDist * .05); g.lineTo(0, eyeDist * .4); g.stroke(); g.restore();
        void m;
      }
    }
    if (effect === 'glasses') {
      const mid = { x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 };
      g.save(); g.translate(mid.x, mid.y); g.rotate(angle);
      const w = eyeDist * .62, hgt = eyeDist * .42;
      for (const side of [-1, 1]) {
        const lens = g.createLinearGradient(0, -hgt / 2, 0, hgt / 2); lens.addColorStop(0, 'rgba(30,30,40,.95)'); lens.addColorStop(1, 'rgba(70,40,90,.92)');
        g.fillStyle = lens; g.strokeStyle = '#111'; g.lineWidth = eyeDist * .05;
        g.beginPath(); g.roundRect(side * eyeDist * .5 - w / 2, -hgt / 2, w, hgt, hgt * .45); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.ellipse(side * eyeDist * .5 - w * .18, -hgt * .18, w * .14, hgt * .09, -.4, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = '#111'; g.lineWidth = eyeDist * .06; g.beginPath(); g.moveTo(-eyeDist * .19, -hgt * .15); g.quadraticCurveTo(0, -hgt * .38, eyeDist * .19, -hgt * .15); g.stroke();
      g.restore();
    }
    if (effect === 'hearts') {
      const beat = 1 + Math.sin(now / 160) * .08;
      heart(eyeL.x, eyeL.y, eyeDist * .5 * beat, '#ff2d55');
      heart(eyeR.x, eyeR.y, eyeDist * .5 * beat, '#ff2d55');
      if (Math.random() < .25) particles.push({ x: top.x + (Math.random() - .5) * faceW, y: top.y, vy: -1.2 - Math.random() * 1.5, s: eyeDist * (.12 + Math.random() * .18), life: 1 });
    }
    if (effect === 'crown') {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), a = (t - .5) * 1.9;
        const p = along(crownAt(.02 + Math.cos(a) * .08), Math.sin(a) * faceW * .55);
        flower(p.x, p.y, faceW * (.085 + (i % 2) * .02), ['#ffd6e7', '#ffffff', '#fff3b0'][i % 3], '#ffb703');
      }
      for (let i = 0; i < 3; i++) { const p = along(crownAt(.12), (i - 1) * faceW * .35); g.fillStyle = '#4caf50'; g.beginPath(); g.ellipse(p.x, p.y, faceW * .05, faceW * .02, angle + i, 0, Math.PI * 2); g.fill(); }
    }
    if (effect === 'blush' || effect === 'hearts' || effect === 'cat') {
      for (const ch of [cheekL, cheekR]) { const r = g.createRadialGradient(ch.x, ch.y, 0, ch.x, ch.y, eyeDist * .32); r.addColorStop(0, 'rgba(255,105,140,.42)'); r.addColorStop(1, 'rgba(255,105,140,0)'); g.fillStyle = r; g.beginPath(); g.arc(ch.x, ch.y, eyeDist * .32, 0, Math.PI * 2); g.fill(); }
      if (effect === 'blush') for (let i = 0; i < 4; i++) { const ph = now / 400 + i * 1.7; sparkle(top.x + Math.cos(ph) * faceW * .55, top.y + faceH * (.25 + .2 * Math.sin(ph * 1.3)), eyeDist * .12, .5 + .5 * Math.sin(ph * 2)); }
    }
    if (effect === 'bigeyes') {
      for (const e of [eyeL, eyeR]) {
        const r = eyeDist * .3, k = 1.45;
        g.save(); g.beginPath(); g.arc(e.x, e.y, r * k, 0, Math.PI * 2); g.clip();
        g.drawImage(canvas, e.x - r, e.y - r, r * 2, r * 2, e.x - r * k, e.y - r * k, r * 2 * k, r * 2 * k);
        g.restore();
      }
    }
  }

  async function needFace() {
    if (faceModel || loading) return;
    loading = true;
    state.onStatus('loading');
    try { await loadFaceModel(); state.onStatus('ready'); } catch { state.onStatus('failed'); }
    loading = false;
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!video.videoWidth) return;
    const c = drawFrame();
    const e = EFFECTS.find(x => x.id === effect) || EFFECTS[0];
    if (e.face && faceModel && now - lastDetect > 33) {
      lastDetect = now;
      try {
        const r = faceModel.detectForVideo(video, now);
        face = r.faceLandmarks && r.faceLandmarks[0] ? r.faceLandmarks[0] : null;
      } catch { face = null; }
    }
    if (LOOKS[effect]) LOOKS[effect](now);
    if (e.face && face) drawFace(face, c, now);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.y += p.vy * (H / 400); p.life -= .015;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      g.save(); g.globalAlpha = p.life; heart(p.x, p.y, p.s, '#ff4d6d'); g.restore();
    }
  }
  raf = requestAnimationFrame(loop);
  return {
    set(id) { effect = id; particles.length = 0; face = null; const e = EFFECTS.find(x => x.id === id); if (e && e.face) needFace(); },
    get effect() { return effect; },
    set mirror(v) { state.mirror = v; },
    stop() { cancelAnimationFrame(raf); }
  };
}
