// ---- Videos made light before they go up ----
// A phone's own video is often 4K at 20–50 Mbit/s: 92 MB for half a minute, which no one on a Bangladeshi mobile
// connection can watch smoothly. Before uploading, the video is made again on the phone itself — at most 720 p on its
// short side, H.264 at about 2 Mbit/s, 30 frames a second — with the phone's own encoder (WebCodecs), usually faster
// than the video lasts. The sound is kept as it is (AAC). An iPhone's HEVC .mov comes out as an H.264 .mp4 that every
// phone can play. Nothing changes for a video that is already small, a recording from the app's own camera (WebM), or
// a browser without WebCodecs: those go up as they are.
// The two helpers (mp4box.js to read the file, mp4-muxer to write the new one) load only when a video is made.

const SHRINK = { side: 720, bitrate: 2_000_000, fps: 30, keyEvery: 2 };
const SHRINK_LIBS = [
  ['MP4Box', 'https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js'],
  ['Mp4Muxer', 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.min.js']
];
let shrinkLibs = null;
function loadShrinkLibs() {
  return shrinkLibs || (shrinkLibs = Promise.all(SHRINK_LIBS.map(([name, src]) => window[name] ? null : new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = ok; s.onerror = () => bad(new Error('could not load ' + name));
    document.head.appendChild(s);
  }))).catch(e => { shrinkLibs = null; throw e; }));
}
const canShrink = () => typeof VideoEncoder === 'function' && typeof VideoDecoder === 'function' && typeof OffscreenCanvas === 'function' && typeof VideoFrame === 'function';

// The first codec setting this phone's encoder accepts.
async function pickEncoder(width, height, fps) {
  const base = { width, height, bitrate: SHRINK.bitrate * Math.min(1, (width * height) / (1280 * 720)), framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality', bitrateMode: 'variable' };
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42e01f'])
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
      const config = { ...base, codec, hardwareAcceleration };
      try { const r = await VideoEncoder.isConfigSupported(config); if (r.supported) return r.config; } catch { /* next */ }
    }
  return null;
}

// shrinkVideo(file, onProgress(fraction), hold) -> a smaller .mp4 Blob, or null when it is not needed or not possible
// (the original then goes up). hold.stopped stops it.
async function shrinkVideo(file, onProgress = () => {}, hold = {}) {
  if (!canShrink() || !/mp4|quicktime|m4v|3gpp/i.test(file.type || '') && !/\.(mp4|mov|m4v|3gp)$/i.test(file.name || '')) return null;
  await loadShrinkLibs();
  const MP4Box = window.MP4Box, { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
  const mp4 = MP4Box.createFile();
  let info = null, failure = null;
  const ready = new Promise((ok, bad) => { mp4.onReady = i => { info = i; ok(i); }; mp4.onError = e => bad(new Error('mp4: ' + e)); });

  // read the file a slice at a time, as far as the parser asks, until it knows the tracks
  const SLICE = 4 * 1024 * 1024;
  let offset = 0, readAll = false;
  const state = shrinkVideo.state = { stage: 'reading', offset: 0, size: file.size };
  const feed = async () => {
    const buf = await file.slice(offset, offset + SLICE).arrayBuffer();
    buf.fileStart = offset;
    const next = mp4.appendBuffer(buf);
    offset = typeof next === 'number' ? next : offset + buf.byteLength;
    if (offset >= file.size) readAll = true;
    state.offset = offset;
  };
  while (!info && !readAll) { await feed(); await Promise.race([ready, Promise.resolve()]); }
  if (!info) { mp4.flush(); await Promise.race([ready, new Promise(r => setTimeout(r, 50))]); }
  if (!info) return null;
  const vt = info.videoTracks[0], at = info.audioTracks[0];
  if (!vt) return null;

  // the size it is shown at: the picture turned as the phone held it, then fitted to 720 on its short side
  const m = vt.matrix || [65536, 0, 0, 0, 65536, 0, 0, 0, 1 << 30];
  const turn = ((Math.round(Math.atan2(m[1], m[0]) * 180 / Math.PI) % 360) + 360) % 360;
  const srcW = vt.video ? vt.video.width : vt.track_width, srcH = vt.video ? vt.video.height : vt.track_height;
  const shownW = turn % 180 ? srcH : srcW, shownH = turn % 180 ? srcW : srcH;
  const scale = Math.min(1, SHRINK.side / Math.min(shownW, shownH));
  const even = n => Math.max(2, Math.round(n / 2) * 2);
  const outW = even(shownW * scale), outH = even(shownH * scale);
  const durationS = (vt.duration || vt.movie_duration || 0) / (vt.timescale || 1) || info.duration / info.timescale;
  const srcRate = vt.bitrate || (file.size * 8 / Math.max(1, durationS));
  const srcFps = vt.nb_samples && durationS ? vt.nb_samples / durationS : 30;
  // already light enough: keep it
  if (scale === 1 && srcRate <= SHRINK.bitrate * 1.6 && /^avc1/.test(vt.codec)) return null;
  // sound that is not AAC cannot be carried over as it is: keep the original rather than lose the sound
  if (at && !/^mp4a/.test(at.codec)) return null;

  const fps = Math.min(SHRINK.fps, Math.round(srcFps) || 30);
  const encConfig = await pickEncoder(outW, outH, fps);
  if (!encConfig) return null;
  const description = trak => {
    for (const entry of mp4.getTrackById(trak.id).mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) { const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); box.write(stream); return new Uint8Array(stream.buffer, 8); }
    }
    return undefined;
  };
  const decConfig = { codec: vt.codec, codedWidth: srcW, codedHeight: srcH, description: description(vt) };
  try { if (!(await VideoDecoder.isConfigSupported(decConfig)).supported) return null; } catch { return null; }
  let audioConfig = null;
  if (at) {
    const entry = mp4.getTrackById(at.id).mdia.minf.stbl.stsd.entries[0];
    let asc;
    try { asc = entry.esds.esd.descs[0].descs[0].data; } catch { return null; }
    audioConfig = { codec: at.codec, sampleRate: at.audio.sample_rate, numberOfChannels: at.audio.channel_count, description: asc };
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target, fastStart: 'in-memory', firstTimestampBehavior: 'offset',
    video: { codec: 'avc', width: outW, height: outH, frameRate: fps },
    ...(audioConfig ? { audio: { codec: 'aac', sampleRate: audioConfig.sampleRate, numberOfChannels: audioConfig.numberOfChannels } } : {})
  });
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { failure = e; } });
  encoder.configure(encConfig);
  const canvas = new OffscreenCanvas(outW, outH), g = canvas.getContext('2d');
  const frames = [];                                     // decoded, waiting for the encoder
  let nextTs = -Infinity, encoded = 0, lastKey = -Infinity, totalVideo = vt.nb_samples || 1, decodedCount = 0;
  const step = 1e6 / fps;
  const decoder = new VideoDecoder({
    output: frame => {
      decodedCount++;
      // a 60 frame-a-second video keeps every other frame
      if (frame.timestamp + 1 < nextTs) { frame.close(); return; }
      nextTs = Math.max(nextTs + step, frame.timestamp + step * 0.5);
      frames.push(frame);
    },
    error: e => { failure = e; }
  });
  decoder.configure(decConfig);
  let audioFirst = true;

  const encodeWaiting = async () => {
    while (frames.length) {
      if (hold.stopped) throw new Error('stopped');
      while (encoder.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
      const frame = frames.shift();
      g.save();
      g.translate(outW / 2, outH / 2);
      g.rotate(turn * Math.PI / 180);
      const dw = turn % 180 ? outH : outW, dh = turn % 180 ? outW : outH;
      g.drawImage(frame, -dw / 2, -dh / 2, dw, dh);
      g.restore();
      const out = new VideoFrame(canvas, { timestamp: frame.timestamp, duration: step });
      frame.close();
      const key = out.timestamp - lastKey >= SHRINK.keyEvery * 1e6;
      if (key) lastKey = out.timestamp;
      encoder.encode(out, { keyFrame: key });
      out.close();
      encoded++;
    }
  };

  mp4.onSamples = (id, user, samples) => {
    for (const s of samples) {
      if (id === vt.id) {
        decoder.decode(new EncodedVideoChunk({ type: s.is_sync ? 'key' : 'delta', timestamp: 1e6 * s.cts / s.timescale, duration: 1e6 * s.duration / s.timescale, data: s.data }));
      } else if (audioConfig && id === at.id) {
        const chunk = new EncodedAudioChunk({ type: 'key', timestamp: 1e6 * s.cts / s.timescale, duration: 1e6 * s.duration / s.timescale, data: s.data });
        muxer.addAudioChunk(chunk, audioFirst ? { decoderConfig: audioConfig } : undefined);
        audioFirst = false;
      }
    }
    if (samples.length) mp4.releaseUsedSamples(id, samples[samples.length - 1].number + 1);
  };
  mp4.setExtractionOptions(vt.id, null, { nbSamples: 60 });
  if (audioConfig) mp4.setExtractionOptions(at.id, null, { nbSamples: 120 });
  mp4.start();

  // keep reading while the decoder and encoder keep up; the parser says where the next needed bytes are
  state.stage = 'making';
  Object.defineProperties(state, { dq: { get: () => decoder.decodeQueueSize, enumerable: true }, eq: { get: () => encoder.encodeQueueSize, enumerable: true }, waiting: { get: () => frames.length, enumerable: true }, decoded: { get: () => decodedCount, enumerable: true }, made: { get: () => encoded, enumerable: true } });
  while (!readAll) {
    if (hold.stopped) throw new Error('stopped');
    if (failure) throw failure;
    while (decoder.decodeQueueSize > 24 || frames.length > 8) { await encodeWaiting(); await new Promise(r => setTimeout(r, 2)); }
    await feed();
    await encodeWaiting();
    onProgress(Math.min(0.99, decodedCount / totalVideo));
  }
  mp4.flush();
  // the decoder gives its last frames only as the waiting ones are used: keep encoding while it finishes
  let flushed = false;
  decoder.flush().then(() => { flushed = true; }, e => { failure = failure || e; flushed = true; });
  while (!flushed) { await encodeWaiting(); onProgress(Math.min(0.99, decodedCount / totalVideo)); await new Promise(r => setTimeout(r, 4)); }
  await encodeWaiting();
  await encoder.flush();
  if (failure) throw failure;
  decoder.close(); encoder.close();
  muxer.finalize();
  onProgress(1);
  if (!encoded) return null;
  const out = new Blob([target.buffer], { type: 'video/mp4' });
  out.name = (file.name || 'video').replace(/\.\w+$/, '') + '.mp4';
  return out.size < file.size ? out : null;            // never send something bigger than the original
}
