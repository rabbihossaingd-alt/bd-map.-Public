// How fast the map opens on a phone: a headless Edge/Chrome, a phone's screen and a throttled 4G line
// (Chrome DevTools' "Fast 4G"-like numbers), driven over the DevTools protocol with no extra packages.
// Measures, from navigation: when the "loading" note goes, when MapLibre says 'load', and when the map is idle.
// Runs twice: a first visit (empty cache) and a second one (style and tile index already saved on the phone).
// Run: node tools/map-speed.mjs [url]   (default http://localhost:8765/#/trip)
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] || 'http://localhost:8765/#/trip';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = 9333;
const browser = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'bdmap-speed-'))}`,
  '--no-first-run', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) { await wait(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* not up yet */ } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async expr => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await cdp('Network.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await cdp('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8 * 9, uploadThroughput: 750e3 / 8 * 9 });   // ~14 Mbps down, 150 ms
await cdp('Emulation.setCPUThrottlingRate', { rate: 4 });                                                                                 // a mid-range phone
const probe = `new Promise(done => {
  const t0 = performance.timeOrigin, out = {};
  const tick = setInterval(() => {
    const now = Math.round(performance.now());
    if (!out.noteGone && document.getElementById('map-loading') && document.getElementById('map-loading').hidden) out.noteGone = now;
    if (!out.load && window.map && map.getSource && map.getSource('places2')) out.load = now;      // set up right after MapLibre's 'load'
    if (out.load && !out.idle && map.style && Object.entries(map.style.sourceCaches || {}).every(([k, c]) => k === 'bdb' || c.loaded())) out.idle = now;
    if (out.idle || now > 60000) { clearInterval(tick); done(out); }
  }, 50);
})`;
for (const visit of ['first visit', 'second visit']) {
  await cdp('Page.navigate', { url: 'about:blank' });
  await wait(300);
  await cdp('Page.navigate', { url });
  await wait(300);
  const r = await evalJs(probe);
  console.log(visit.padEnd(13), `note gone ${(r.noteGone / 1000).toFixed(1)} s · map load ${(r.load / 1000).toFixed(1)} s · all tiles ${(r.idle / 1000).toFixed(1)} s`);
}
ws.close(); browser.kill();
