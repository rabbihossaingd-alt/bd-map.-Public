// Upload a file to the Cloudflare R2 bucket in .env (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET),
// with AWS Signature V4 and no SDK. The body streams from disk, unsigned (R2 accepts UNSIGNED-PAYLOAD), so a
// file of a few GB never sits in memory. A single PUT takes up to 5 GB, which the map's tile files stay under.
// Run: node tools/r2.mjs put <local file> <key> [content-type]
//      node tools/r2.mjs head <key>
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { createHmac, createHash } from 'node:crypto';
import { request } from 'node:https';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)
  .map(l => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l)).filter(Boolean).map(m => [m[1], m[2]]));
const { R2_ENDPOINT, R2_ACCESS_KEY_ID: AK, R2_SECRET_ACCESS_KEY: SK, R2_BUCKET } = env;
if (!R2_ENDPOINT || !AK || !SK || !R2_BUCKET) { console.error('R2 settings missing in .env'); process.exit(1); }
const host = new URL(R2_ENDPOINT).host;
const hmac = (k, s) => createHmac('sha256', k).update(s).digest();
const sha = s => createHash('sha256').update(s).digest('hex');

function signed(method, key, extra = {}) {
  const now = new Date(), amz = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), day = amz.slice(0, 8);
  const path = '/' + R2_BUCKET + '/' + key.split('/').map(encodeURIComponent).join('/');
  const headers = { host, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': amz, ...extra };
  const names = Object.keys(headers).map(h => h.toLowerCase()).sort();
  const canon = [method, path, '', ...names.map(h => `${h}:${String(headers[Object.keys(headers).find(k => k.toLowerCase() === h)]).trim()}`), '', names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha(canon)].join('\n');
  const kSig = hmac(hmac(hmac(hmac('AWS4' + SK, day), 'auto'), 's3'), 'aws4_request');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${AK}/${scope}, SignedHeaders=${names.join(';')}, Signature=${createHmac('sha256', kSig).update(toSign).digest('hex')}`;
  return { path, headers };
}
function send(method, key, extra, body) {
  return new Promise((ok, fail) => {
    const { path, headers } = signed(method, key, extra);
    const req = request({ host, path, method, headers }, res => { let t = ''; res.on('data', d => t += d); res.on('end', () => ok({ status: res.statusCode, headers: res.headers, text: t })); });
    req.on('error', fail);
    if (body) body.pipe(req); else req.end();
  });
}

const [cmd, a, b, type] = process.argv.slice(2);
if (cmd === 'put') {
  const size = statSync(a).size;
  let sent = 0, last = 0;
  const body = createReadStream(a).on('data', c => { sent += c.length; if (Date.now() - last > 2000) { last = Date.now(); process.stdout.write(`\r${(sent / 1e6).toFixed(0)} / ${(size / 1e6).toFixed(0)} MB`); } });
  const r = await send('PUT', b, { 'content-length': size, 'content-type': type || 'application/octet-stream' }, body);
  console.log(`\nPUT ${b}: ${r.status}${r.status >= 300 ? ' ' + r.text.slice(0, 300) : ''}`);
  process.exit(r.status < 300 ? 0 : 1);
} else if (cmd === 'head') {
  const r = await send('HEAD', a);
  console.log(`HEAD ${a}: ${r.status}`, r.headers['content-length'] || '');
} else console.log('usage: node tools/r2.mjs put <file> <key> [type] | head <key>');
