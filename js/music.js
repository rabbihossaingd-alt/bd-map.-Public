// ---- BD Map's own music, played by the browser ----
// Eight short loops made from notes and noise with the Web Audio API — no recordings, so no one's copyright.
// A post that uses one stores only its name and where it starts; every phone then plays the same notes in time
// with the video. play() returns a handle that stops it. A recording (the camera) can take the sound through
// `dest`, a MediaStreamAudioDestinationNode.

const MUSIC = (() => {
  const m2f = m => 440 * Math.pow(2, (m - 69) / 12);
  // Chords are lists of MIDI notes; drum rows are 16 steps per bar ("x" hit, "." rest).
  const TRACKS = [
    { id: 'dhaka-nights', name: ['ঢাকার রাত', 'Dhaka Nights'], mood: ['লো-ফাই', 'Lo-fi'], bpm: 78, swing: .12, crackle: true,
      chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 64]], bass: [45, 41, 36, 43],
      kick: 'x.....x...x.....', snare: '....x.......x...', hat: '..x...x...x...x.', arp: null, pad: 'warm' },
    { id: 'sunrise', name: ['সূর্যোদয়', 'Sunrise'], mood: ['চিল পপ', 'Chill pop'], bpm: 100,
      chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], bass: [48, 43, 45, 41],
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', arp: [0, 1, 2, 1, 0, 2, 1, 2], arpOct: 12, pad: 'soft' },
    { id: 'river-lofi', name: ['নদীর ধারে', 'By the River'], mood: ['শান্ত', 'Calm'], bpm: 70, swing: .1, crackle: true,
      chords: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [57, 61, 64, 67]], bass: [38, 43, 36, 45],
      kick: 'x.......x.x.....', snare: '....x.......x...', hat: '..x...x...x...x.', arp: [3, 2, 1, 0, 1, 2, 3, 2], arpOct: 12, pluck: 'keys', pad: 'warm' },
    { id: 'baul-road', name: ['বাউলের পথ', 'Baul Road'], mood: ['লোকগান', 'Folk'], bpm: 92, folk: true,
      chords: [[50, 57, 62], [50, 57, 62], [55, 59, 62], [50, 57, 62]], bass: [38, 38, 43, 38],
      tabla: 'x..x.x..x..x.x.x', tablaHi: '..x...x...x..x..', hat: '', kick: '', snare: '',
      melody: [74, null, 76, 78, null, 81, 78, null, 76, 74, null, 71, 74, null, null, null, 76, null, 78, 81, null, 83, 81, null, 78, 76, null, 74, 76, null, null, null], pad: 'drone' },
    { id: 'monsoon', name: ['বর্ষা', 'Monsoon'], mood: ['বৃষ্টি · অ্যাম্বিয়েন্ট', 'Rain · Ambient'], bpm: 60, rain: true,
      chords: [[52, 55, 59, 62], [48, 52, 55, 59], [55, 59, 62, 66], [50, 54, 57, 62]], bass: [40, 36, 43, 38],
      kick: 'x...............', snare: '', hat: '', arp: [0, 2, 3, 2], arpOct: 24, pluck: 'bell', pad: 'wide' },
    { id: 'festival', name: ['উৎসব', 'Festival'], mood: ['উৎসব · নাচ', 'Party · Dance'], bpm: 120,
      chords: [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]], bass: [41, 36, 38, 34], bassEighths: true,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', clap: true, arp: [0, 1, 2, 1, 2, 1, 0, 1], arpOct: 12, pluck: 'saw', pad: 'bright' },
    { id: 'tea-garden', name: ['চা বাগান', 'Tea Garden'], mood: ['অ্যাকুস্টিক', 'Acoustic'], bpm: 88, strum: true,
      chords: [[55, 59, 62, 67], [50, 54, 57, 62], [52, 55, 59, 64], [48, 52, 55, 60]], bass: [43, 38, 40, 36],
      kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', pad: 'none' },
    { id: 'city-run', name: ['শহরের দৌড়', 'City Run'], mood: ['এনার্জি', 'Energetic'], bpm: 128,
      chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [45, 41, 36, 43], bassEighths: true,
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', arp: [0, 2, 1, 2, 0, 2, 1, 2], arpOct: 12, pluck: 'saw', pad: 'bright' }
  ];
  let ctx = null, noise = null;
  const audio = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };
  // The first tap anywhere lets sound start later (phones only allow it after a gesture).
  const unlock = () => { try { audio(); } catch { /* no Web Audio */ } };

  function env(g, t, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }
  function voice(out, t, f, type, len, vol, cutoff = 2400, detune = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    lp.type = 'lowpass'; lp.frequency.value = cutoff;
    env(g, t, 0.008, vol, len);
    o.connect(lp).connect(g).connect(out);
    o.start(t); o.stop(t + len + 0.1);
  }
  function noiseHit(out, t, hp, len, vol, bp) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = bp ? 'bandpass' : 'highpass'; f.frequency.value = hp; if (bp) f.Q.value = 1.2;
    env(g, t, 0.002, vol, len);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 1.5); s.stop(t + len + 0.05);
  }
  const kick = (out, t, v = .9) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .14); env(g, t, .003, v, .32); o.connect(g).connect(out); o.start(t); o.stop(t + .4); };
  const snare = (out, t) => { noiseHit(out, t, 1800, .16, .34); voice(out, t, 190, 'triangle', .08, .18, 3000); };
  const clap = (out, t) => { for (const d of [0, .012, .024]) noiseHit(out, t + d, 1200, .09, .22, true); };
  const hat = (out, t, v = .1) => noiseHit(out, t, 7500, .035, v);
  const tabla = (out, t, hi) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(hi ? 520 : 180, t); o.frequency.exponentialRampToValueAtTime(hi ? 380 : 95, t + .12); env(g, t, .002, hi ? .32 : .55, hi ? .14 : .28); o.connect(g).connect(out); o.start(t); o.stop(t + .35); };
  function pad(out, t, notes, len, kind) {
    if (kind === 'none') return;
    for (const n of notes) for (const det of kind === 'wide' ? [-9, 9] : [-5, 5]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = kind === 'drone' ? 'sawtooth' : 'sawtooth'; o.frequency.value = m2f(n); o.detune.value = det;
      lp.type = 'lowpass'; lp.frequency.value = kind === 'bright' ? 1800 : kind === 'warm' ? 750 : 1100;
      const vol = (kind === 'drone' ? .05 : .035) / notes.length * 2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(.6, len / 3)); g.gain.setValueAtTime(vol, t + len - .2); g.gain.exponentialRampToValueAtTime(0.0001, t + len + .3);
      o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + len + .4);
    }
  }
  function flute(out, t, n, len) {
    const o = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = m2f(n); vib.frequency.value = 5.2; vg.gain.value = 6; vib.connect(vg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + .06); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out); o.start(t); vib.start(t); o.stop(t + len + .05); vib.stop(t + len + .05);
  }

  // Plays a track from `offset` seconds (the loop repeats for ever). Returns { stop(), setVolume(v) }.
  function play(id, offset = 0, opts = {}) {
    const tr = TRACKS.find(x => x.id === id);
    if (!tr) return { stop() {}, setVolume() {} };
    audio();
    const master = ctx.createGain(), comp = ctx.createDynamicsCompressor();
    master.gain.value = opts.volume ?? .8;
    master.connect(comp).connect(opts.dest || ctx.destination);
    if (opts.dest && opts.alsoHear) comp.connect(ctx.destination);
    const step = 60 / tr.bpm / 4, loop = 64;
    let n = Math.floor(offset / step), next = ctx.currentTime + 0.06;
    const extra = [];
    if (tr.rain || tr.crackle) {                         // a bed of rain, or the hiss and pops of an old record
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; s.loop = true; f.type = tr.rain ? 'lowpass' : 'highpass'; f.frequency.value = tr.rain ? 2600 : 5000; g.gain.value = tr.rain ? .07 : .012;
      s.connect(f).connect(g).connect(master); s.start(); extra.push(s);
    }
    const tick = () => {
      while (next < ctx.currentTime + 0.15) {
        const i = n % loop, bar = Math.floor(i / 16) % 4, s = i % 16;
        const t = next + (tr.swing && s % 2 ? step * tr.swing : 0);
        const chord = tr.chords[bar];
        if (s === 0) pad(master, t, chord, step * 16, tr.pad);
        if (tr.kick && tr.kick[s] === 'x') kick(master, t);
        if (tr.snare && tr.snare[s] === 'x') { snare(master, t); if (tr.clap) clap(master, t); }
        if (tr.hat && tr.hat[s] === 'x') hat(master, t, s % 4 === 2 ? .12 : .07);
        if (tr.tabla && tr.tabla[s] === 'x') tabla(master, t, false);
        if (tr.tablaHi && tr.tablaHi[s] === 'x') tabla(master, t, true);
        if (tr.bassEighths ? s % 2 === 0 : (s === 0 || s === 10)) voice(master, t, m2f(tr.bass[bar]), 'triangle', step * (tr.bassEighths ? 1.6 : 5), .34, 520);
        if (tr.arp && s % 2 === 0) {
          const k = tr.arp[(s / 2) % tr.arp.length], note = chord[k % chord.length] + (tr.arpOct || 0);
          voice(master, t, m2f(note), tr.pluck === 'saw' ? 'sawtooth' : tr.pluck === 'bell' ? 'sine' : 'triangle', tr.pluck === 'bell' ? .9 : .28, tr.pluck === 'bell' ? .09 : .1, tr.pluck === 'saw' ? 1800 : 3200);
        }
        if (tr.strum && (s === 0 || s === 6 || s === 8 || s === 12)) chord.forEach((c, j) => voice(master, t + j * .018, m2f(c + 12), 'triangle', .5, .07, 2600));
        if (tr.melody) { const note = tr.melody[(i % 32)]; if (note && s % 2 === 0) flute(master, t, note, step * 3.5); }
        next += step;
        n++;
      }
    };
    tick();
    const timer = setInterval(tick, 30);
    return {
      stop() { clearInterval(timer); for (const e of extra) try { e.stop(); } catch { /* already stopped */ } master.gain.setTargetAtTime(0, ctx.currentTime, .05); setTimeout(() => { try { master.disconnect(); comp.disconnect(); } catch { /* gone */ } }, 600); },
      setVolume(v) { master.gain.setTargetAtTime(v, ctx.currentTime, .05); }
    };
  }
  const name = id => { const t = TRACKS.find(x => x.id === id); return t ? t.name[LANG === 'en' ? 1 : 0] : ''; };
  const mood = id => { const t = TRACKS.find(x => x.id === id); return t ? t.mood[LANG === 'en' ? 1 : 0] : ''; };
  return { TRACKS, play, unlock, name, mood, context: () => audio() };
})();
addEventListener('pointerdown', MUSIC.unlock, { once: true });

// A post's sound, in step with its video (or on its own for a photo): the app's track, or another reel's sound.
// Returns { start(at), stop(), mute(on) }.
function postSound(p) {
  const m = p.music;
  if (!m) return null;
  let handle = null, el = null, muted = true;
  return {
    start(at = 0) {
      this.stop();
      if (muted) return;
      if (m.label.kind === 'gen') handle = MUSIC.play(m.label.track, m.start + at, { volume: .75 });
      else if (m.label.kind === 'post' || m.label.kind === 'file') { el = new Audio(m.label.src); el.currentTime = m.start + at; el.loop = true; el.play().catch(() => {}); }
    },
    stop() { if (handle) { handle.stop(); handle = null; } if (el) { el.pause(); el = null; } },
    mute(on) { muted = on; if (on) this.stop(); }
  };
}
function soundLabel(p) {
  if (!p.music) return '';
  const l = p.music.label;
  if (l.kind === 'gen') return `${MUSIC.name(l.track)} · BD Map Music`;
  if (l.kind === 'post') return `${l.by} · ${LANG === 'en' ? 'Original audio' : 'মূল অডিও'}`;
  if (l.kind === 'file') return `${l.title} · ${l.by}`;
  return '';
}
