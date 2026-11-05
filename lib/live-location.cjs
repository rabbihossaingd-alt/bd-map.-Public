// ---- Live location, as Google Maps shares it ----
// A person starts sharing for 15 minutes, an hour or 8 hours and gets a link with a long random token. Their phone
// sends its position every few seconds while the app is open; whoever has the link sees it move on the map. When the
// time is up or they stop, the position is no longer given to anyone (only that it has ended), and the row is removed
// a day later. One share at a time per person: starting a new one ends the old.
//   POST /api/liveloc/start  {minutes, lat?, lon?, acc?}  -> { token, url, expires }      (login)
//   POST /api/liveloc/update {token, lat, lon, acc, heading}                                (the owner)
//   POST /api/liveloc/stop   {token}                                                       (the owner)
//   GET  /api/liveloc/mine   -> { share | null }   the owner's running share, to carry on after a reload
//   GET  /api/liveloc/get?t= -> { name, pic, uid, active, expires, lat, lon, acc, heading, updated }   (anyone with the link)
'use strict';

const MINUTES = [15, 60, 480];

module.exports = function liveLocation({ db, json, readBody, userOf, SITE, crypto }) {
  db.exec(`CREATE TABLE IF NOT EXISTS live_locs (token TEXT PRIMARY KEY, user INTEGER NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL,
    lat REAL, lon REAL, acc REAL, heading REAL, updated INTEGER NOT NULL DEFAULT 0, stopped INTEGER NOT NULL DEFAULT 0)`);
  db.exec('CREATE INDEX IF NOT EXISTS live_locs_user ON live_locs (user, expires)');
  setInterval(() => db.prepare('DELETE FROM live_locs WHERE expires < ?').run(Date.now() - 864e5), 3600e3).unref();

  const inBd = (lat, lon) => lat > 20 && lat < 27 && lon > 88 && lon < 93;
  const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  const live = r => r && !r.stopped && r.expires > Date.now();
  const shown = r => ({ token: r.token, url: SITE + '/#/live/' + r.token, expires: r.expires, created: r.created });

  return async function api(req, res, action, query) {
    if (req.method === 'GET' && action === 'get') {
      const r = db.prepare('SELECT l.*, u.name, u.pic_v FROM live_locs l JOIN users u ON u.id = l.user WHERE l.token = ? AND u.banned = 0').get(String(query.get('t') || '').slice(0, 40));
      if (!r) return json(res, 404, { error: 'not found' });
      const out = { name: r.name, uid: r.user, pic: r.pic_v || 0, active: live(r), expires: r.expires };
      // only while it runs, and only once the phone has said where it is
      if (out.active && r.updated) Object.assign(out, { lat: r.lat, lon: r.lon, acc: r.acc, heading: r.heading, updated: r.updated });
      return json(res, 200, out);
    }
    const me = userOf(req);
    if (!me) return json(res, 401, { error: 'login' });
    if (req.method === 'GET' && action === 'mine') {
      const r = db.prepare('SELECT * FROM live_locs WHERE user = ? AND stopped = 0 AND expires > ? ORDER BY created DESC LIMIT 1').get(me.id, Date.now());
      return json(res, 200, { share: r ? shown(r) : null });
    }
    if (req.method !== 'POST' || !(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 400, { error: 'bad request' });
    let body;
    try { body = JSON.parse(await readBody(req, 2000)) || {}; } catch { return json(res, 400, { error: 'bad request' }); }
    const now = Date.now();
    if (action === 'start') {
      const minutes = MINUTES.includes(Number(body.minutes)) ? Number(body.minutes) : 60;
      db.prepare('UPDATE live_locs SET stopped = 1 WHERE user = ? AND stopped = 0').run(me.id);
      const token = crypto.randomBytes(16).toString('base64url');
      const lat = num(body.lat, -90, 90), lon = num(body.lon, -180, 180), ok = lat != null && lon != null && inBd(lat, lon);
      db.prepare('INSERT INTO live_locs (token, user, created, expires, lat, lon, acc, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(token, me.id, now, now + minutes * 60_000, ok ? lat : null, ok ? lon : null, ok ? num(body.acc, 0, 1e5) : null, ok ? now : 0);
      return json(res, 200, shown(db.prepare('SELECT * FROM live_locs WHERE token = ?').get(token)));
    }
    const r = db.prepare('SELECT * FROM live_locs WHERE token = ? AND user = ?').get(String(body.token || '').slice(0, 40), me.id);
    if (!r) return json(res, 404, { error: 'not found' });
    if (action === 'stop') { db.prepare('UPDATE live_locs SET stopped = 1 WHERE token = ?').run(r.token); return json(res, 200, { ok: true }); }
    if (action === 'update') {
      if (!live(r)) return json(res, 410, { error: 'ended' });
      if (now - r.updated < 2000) return json(res, 200, { ok: true, skipped: true });       // a few seconds apart is plenty
      const lat = num(body.lat, -90, 90), lon = num(body.lon, -180, 180);
      if (lat == null || lon == null || !inBd(lat, lon)) return json(res, 400, { error: 'where' });
      db.prepare('UPDATE live_locs SET lat = ?, lon = ?, acc = ?, heading = ?, updated = ? WHERE token = ?').run(lat, lon, num(body.acc, 0, 1e5), num(body.heading, 0, 360), now, r.token);
      return json(res, 200, { ok: true, expires: r.expires });
    }
    return json(res, 404, { error: 'not found' });
  };
};
