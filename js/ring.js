// ---- Sounds for calls and messages, made in the browser (no sound files to download) ----
// Calling someone: the ringback tone (425 Hz, one second on, four off — the ITU tone Bangladesh's networks use).
// A call coming in: a ringtone, repeated, and the phone vibrates where it can. A message: a short two-note chime
// (a softer tick when that chat is open). Browsers allow sound only after the page has been touched once, so the
// audio is unlocked on the first tap or key.
let ringCtx = null, ringLoop = null, ringKind = '';
function ringAudio() {
  if (!ringCtx) { try { ringCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ringCtx.state === 'suspended') ringCtx.resume().catch(() => {});
  return ringCtx;
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => ringAudio(), { once: true, capture: true });

// one note: a sine with a soft attack and a ring-out, plus a quiet octave for brightness
function ringNote(freq, at, dur, vol = 0.16, bright = 0.25) {
  const ctx = ringAudio();
  if (!ctx) return;
  const t = ctx.currentTime + at, out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out.connect(ctx.destination);
  for (const [mult, level] of [[1, 1], [2, bright]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq * mult; g.gain.value = level;
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
}
// a steady tone (the ringback), flat for its whole length
function ringTone(freq, at, dur, vol = 0.09) {
  const ctx = ringAudio();
  if (!ctx) return;
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.setValueAtTime(vol, t + dur - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}

const RING_PATTERNS = {
  // outgoing: 425 Hz, 1 s on, 4 s off
  out: { every: 5000, play: () => ringTone(425, 0, 1) },
  // incoming: a bright four-note figure twice, then a pause; vibrate with it
  in: { every: 2600, play: () => {
    [[659, 0], [784, 0.13], [1047, 0.26], [784, 0.39], [659, 0.7], [784, 0.83], [1047, 0.96], [784, 1.09]].forEach(([f, at]) => ringNote(f, at, 0.32, 0.17));
    try { if (navigator.vibrate) navigator.vibrate([500, 250, 500]); } catch { /* not allowed */ }
  } }
};
// 'out' | 'in' | '' (silence)
function ringFor(kind) {
  if (kind === ringKind) return;
  clearInterval(ringLoop); ringLoop = null; ringKind = kind;
  try { if (navigator.vibrate) navigator.vibrate(0); } catch { /* not allowed */ }
  const p = RING_PATTERNS[kind];
  if (!p) return;
  p.play();
  ringLoop = setInterval(() => { if (ringKind === kind) p.play(); }, p.every);
}
// call states (chat.js): 'calling' — I rang; 'ringing' — they ring me; anything else is quiet
const ringForCall = state => ringFor(state === 'calling' ? 'out' : state === 'ringing' ? 'in' : '');

// a new message: a two-note chime, or a soft tick when that chat is already open
let lastChime = 0;
function messageChime(open) {
  const now = Date.now();
  if (now - lastChime < 900 || document.hidden || ringKind) return;    // not a burst, not over a ring, not unseen
  lastChime = now;
  if (open) ringNote(1319, 0, 0.12, 0.07, 0.1);
  else { ringNote(880, 0, 0.22, 0.14); ringNote(1319, 0.11, 0.3, 0.13); }
}
