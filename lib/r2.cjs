// Cloudflare R2 (S3-compatible) from the server, with no SDK: a signed PUT that streams a file up, a signed GET that
// streams one down. Settings come from the environment: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_BUCKET. Used to keep the database and the uploaded media safe on hosts whose own disk is wiped on every
// deploy (Render's free plan). Run as a script it downloads one key: node lib/r2.cjs get <key> <file>
const fs = require('node:fs');
const crypto = require('node:crypto');
const https = require('node:https');

const env = () => ({ end: process.env.R2_ENDPOINT, ak: process.env.R2_ACCESS_KEY_ID, sk: process.env.R2_SECRET_ACCESS_KEY, bucket: process.env.R2_BUCKET });
const ready = () => { const e = env(); return !!(e.end && e.ak && e.sk && e.bucket); };
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function signed(method, key, extra = {}) {
  const { end, ak, sk, bucket } = env(), host = new URL(end).host;
  const amz = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), day = amz.slice(0, 8);
  const path = '/' + bucket + '/' + key.split('/').map(encodeURIComponent).join('/');
  const headers = { host, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': amz, ...extra };
  const names = Object.keys(headers).map(h => h.toLowerCase()).sort();
  const value = h => String(headers[Object.keys(headers).find(k => k.toLowerCase() === h)]).trim();
  const canon = [method, path, '', ...names.map(h => `${h}:${value(h)}`), '', names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const scope = `${day}/auto/s3/aws4_request`;
  const kSig = hmac(hmac(hmac(hmac('AWS4' + sk, day), 'auto'), 's3'), 'aws4_request');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${names.join(';')}, Signature=${crypto.createHmac('sha256', kSig).update(['AWS4-HMAC-SHA256', amz, scope, sha(canon)].join('\n')).digest('hex')}`;
  return { host, path, headers };
}

// put a file; resolves when R2 has it
function put(key, file, type = 'application/octet-stream') {
  return new Promise((ok, bad) => {
    const size = fs.statSync(file).size;
    const { host, path, headers } = signed('PUT', key, { 'content-length': size, 'content-type': type });
    const req = https.request({ host, path, method: 'PUT', headers }, res => {
      let t = ''; res.on('data', d => { t += d; });
      res.on('end', () => (res.statusCode < 300 ? ok() : bad(new Error(`R2 PUT ${res.statusCode} ${t.slice(0, 120)}`))));
    });
    req.on('error', bad);
    req.setTimeout(10 * 60_000, () => req.destroy(new Error('R2 PUT timeout')));
    fs.createReadStream(file).on('error', bad).pipe(req);
  });
}
// get a key into a file (written beside it first, then renamed); resolves false when R2 has no such key
function get(key, file) {
  return new Promise((ok, bad) => {
    const { host, path, headers } = signed('GET', key);
    const req = https.request({ host, path, method: 'GET', headers }, res => {
      if (res.statusCode === 404) { res.resume(); return ok(false); }
      if (res.statusCode >= 300) { res.resume(); return bad(new Error(`R2 GET ${res.statusCode}`)); }
      const tmp = file + '.r2';
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on('finish', () => fs.rename(tmp, file, e => (e ? bad(e) : ok(true))));
      out.on('error', bad); res.on('error', bad);
    });
    req.on('error', bad);
    req.setTimeout(5 * 60_000, () => req.destroy(new Error('R2 GET timeout')));
    req.end();
  });
}

// remove a key (R2 answers 204 whether or not it was there)
function del(key) {
  return new Promise((ok, bad) => {
    const { host, path, headers } = signed('DELETE', key);
    const req = https.request({ host, path, method: 'DELETE', headers }, res => { res.resume(); res.statusCode < 300 || res.statusCode === 404 ? ok() : bad(new Error('R2 DELETE ' + res.statusCode)); });
    req.on('error', bad);
    req.setTimeout(60_000, () => req.destroy(new Error('R2 DELETE timeout')));
    req.end();
  });
}

// copy one key to another inside the bucket (R2 does it, nothing is downloaded); resolves false when the source is missing.
// meta { type, cache } gives the copy its own Content-Type and Cache-Control.
function copy(from, to, meta) {
  return new Promise((ok, bad) => {
    const { bucket } = env();
    const extra = { 'x-amz-copy-source': '/' + bucket + '/' + from.split('/').map(encodeURIComponent).join('/') };
    if (meta) Object.assign(extra, { 'x-amz-metadata-directive': 'REPLACE', 'content-type': meta.type || 'application/octet-stream' }, meta.cache ? { 'cache-control': meta.cache } : {});
    const { host, path, headers } = signed('PUT', to, extra);
    const req = https.request({ host, path, method: 'PUT', headers }, res => {
      let t = ''; res.on('data', d => { t += d; });
      res.on('end', () => (res.statusCode === 404 ? ok(false) : res.statusCode < 300 ? ok(true) : bad(new Error('R2 COPY ' + res.statusCode + ' ' + t.slice(0, 120)))));
    });
    req.on('error', bad);
    req.setTimeout(5 * 60_000, () => req.destroy(new Error('R2 COPY timeout')));
    req.end();
  });
}

module.exports = { ready, put, get, del, copy };

if (require.main === module) {
  const [cmd, key, file] = process.argv.slice(2);
  if (cmd !== 'get' || !key || !file) { console.error('usage: node lib/r2.cjs get <key> <file>'); process.exit(2); }
  get(key, file).then(found => { console.log(found ? 'restored ' + key : 'none ' + key); process.exit(0); }, e => { console.error(e.message); process.exit(1); });
}
