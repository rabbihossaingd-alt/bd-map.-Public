// For You: which posts reach more people, and the panel's controls over it.
//
// Every 10 minutes each public post of the last 60 days gets a score from 0 to 100. The score is a percentile:
// the post's quality compared with every other recent post. Quality comes from what viewers did, measured per
// person who saw the post:
//   videos — the share of it watched (going round counts), seen to the end, skipped in under 2 seconds;
//   all    — likes, comments, saves, shares, and taps on এখানে যান (people who want to go there).
// Small numbers are pulled toward the average of all posts (a post seen by 5 people cannot be a hit), so a new post
// is judged fairly as its audience grows.
//
// A post then reaches people in stages, each opened only by a good enough score:
//   0 পরীক্ষা  — up to 200 people; new posts get a push so they are seen at all
//   1 বাড়ছে   — up to 2,000
//   2 বড়      — up to 20,000
//   3 সবার জন্য — no limit
// A post that reached its stage's limit without the score for the next one is "আটকে আছে": it still shows, lower.
// The panel can lift a post to the top (for some days), keep it out of For You, change the weights, the limits and
// the scores needed, or turn the whole thing off (the feed is then mixed by chance, as before). Every change is
// written to the audit log with a reason.

const DEFAULTS = {
  on: true,
  weights: { watch: 3, complete: 3, skip: 2, like: 2, comment: 2, save: 2, share: 3, place: 3 },
  caps: [200, 2000, 20000],
  need: [45, 60, 75],          // the score a post needs to open stages 1, 2, 3
  freshHours: 48,              // a post's newness counts for about three times this
  explore: 0.35,               // the push for posts still in their first stage
  chance: 0.3                  // how much chance mixes the feed (so it is not the same each time)
};
const STAGES = ['পরীক্ষা', 'বাড়ছে', 'বড়', 'সবার জন্য'];
const PRIOR = 20;              // a post is judged as if it had 20 more viewers who behaved like the average

module.exports = function adminForYou(A, ctx) {
  const { db, json, POST_SELECT, shownPost, forViewer } = ctx;
  const now = () => Date.now();
  const fail = (res, s, e, x) => json(res, s, { error: e, ...x });
  const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const R = (k, o, f) => A.register(k, o, f);

  db.exec(`CREATE TABLE IF NOT EXISTS post_rank (post INTEGER PRIMARY KEY, score REAL NOT NULL DEFAULT 0, stage INTEGER NOT NULL DEFAULT 0,
    held INTEGER NOT NULL DEFAULT 0, seen INTEGER NOT NULL DEFAULT 0, watched INTEGER NOT NULL DEFAULT 0, ratio REAL NOT NULL DEFAULT 0,
    complete REAL NOT NULL DEFAULT 0, skip REAL NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0,
    saves INTEGER NOT NULL DEFAULT 0, shares INTEGER NOT NULL DEFAULT 0, places INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0)`);
  db.exec(`CREATE TABLE IF NOT EXISTS post_fy (post INTEGER PRIMARY KEY, mode TEXT NOT NULL, until INTEGER NOT NULL DEFAULT 0, by INTEGER NOT NULL,
    at INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '')`);
  db.exec('CREATE INDEX IF NOT EXISTS post_events_who ON post_events (who, post)');

  const settings = () => {
    let v = {};
    try { v = JSON.parse((db.prepare("SELECT value FROM settings WHERE key = 'foryou'").get() || {}).value || '{}') || {}; } catch { v = {}; }
    return { ...DEFAULTS, ...v, weights: { ...DEFAULTS.weights, ...(v.weights || {}) } };
  };
  const saveSettings = v => db.prepare("INSERT INTO settings (key, value) VALUES ('foryou', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(JSON.stringify(v));

  // ---- the score ----
  let lastRun = 0;
  function recompute() {
    const t = now(), since = t - 60 * 86400000, s = settings(), w = s.weights;
    const posts = db.prepare(`SELECT p.id, p.kind, p.views FROM posts p JOIN users u ON u.id = p.user WHERE u.banned = 0 AND p.audience = 'all' AND p.at <= ? AND p.created >= ?`).all(t, since);
    if (!posts.length) { lastRun = t; return 0; }
    const ev = new Map();
    for (const r of db.prepare(`SELECT post, kind, COUNT(*) AS n, COUNT(DISTINCT who) AS people, SUM(done) AS done,
        SUM(CASE WHEN dur > 0 THEN MIN(2.0, (ms * 1.0) / dur) ELSE 0 END) AS ratio FROM post_events WHERE at >= ? GROUP BY post, kind`).all(since)) {
      if (!ev.has(r.post)) ev.set(r.post, {});
      ev.get(r.post)[r.kind] = r;
    }
    const cnt = sql => new Map(db.prepare(sql).all().map(r => [r.post, r.n]));
    const likes = cnt('SELECT post, COUNT(*) AS n FROM post_likes GROUP BY post');
    const comments = cnt('SELECT post, COUNT(DISTINCT user) AS n FROM post_comments GROUP BY post');
    const saves = cnt('SELECT post, COUNT(*) AS n FROM post_saves GROUP BY post');
    const rows = posts.map(p => {
      const e = ev.get(p.id) || {}, watch = e.watch || {}, skip = e.skip || {}, share = e.share || {}, place = e.place || {};
      const watched = (watch.n || 0) + (skip.n || 0);
      const seen = Math.max(p.views || 0, (watch.people || 0) + (skip.people || 0));
      return { id: p.id, video: p.kind === 'video', seen, watched,
        ratioSum: (watch.ratio || 0) + (skip.ratio || 0), done: watch.done || 0, skips: skip.n || 0,
        likes: likes.get(p.id) || 0, comments: comments.get(p.id) || 0, saves: saves.get(p.id) || 0, shares: share.people || 0, places: place.people || 0 };
    });
    // the averages every post is pulled toward
    const tot = k => rows.reduce((a, r) => a + r[k], 0);
    const seenAll = Math.max(1, tot('seen')), watchedAll = Math.max(1, rows.filter(r => r.video).reduce((a, r) => a + r.watched, 0));
    const vids = rows.filter(r => r.video);
    const avg = {
      ratio: vids.reduce((a, r) => a + r.ratioSum, 0) / watchedAll || 0.4, complete: vids.reduce((a, r) => a + r.done, 0) / watchedAll || 0.2,
      skip: vids.reduce((a, r) => a + r.skips, 0) / watchedAll || 0.3,
      like: tot('likes') / seenAll, comment: tot('comments') / seenAll, save: tot('saves') / seenAll, share: tot('shares') / seenAll, place: tot('places') / seenAll
    };
    const smooth = (x, n, mean) => (x + PRIOR * mean) / (n + PRIOR);
    // each signal is scaled by its average, so a share (rare) and a like (common) weigh what the panel says
    const rel = (v, mean) => mean > 0 ? v / mean : 0;
    for (const r of rows) {
      const ratio = r.video ? smooth(r.ratioSum, r.watched, avg.ratio) : avg.ratio;
      const complete = r.video ? smooth(r.done, r.watched, avg.complete) : avg.complete;
      const skip = r.video ? smooth(r.skips, r.watched, avg.skip) : avg.skip;
      const n = Math.max(r.seen, r.likes + r.comments + r.saves);
      r.ratio = ratio; r.complete = complete; r.skip = skip;
      r.q = w.watch * rel(ratio, avg.ratio) + w.complete * rel(complete, avg.complete) - w.skip * rel(skip, avg.skip)
        + w.like * rel(smooth(r.likes, n, avg.like), avg.like) + w.comment * rel(smooth(r.comments, n, avg.comment), avg.comment)
        + w.save * rel(smooth(r.saves, n, avg.save), avg.save) + w.share * rel(smooth(r.shares, n, avg.share), avg.share)
        + w.place * rel(smooth(r.places, n, avg.place), avg.place);
    }
    // the score: where the post stands among all of them (0 the lowest, 100 the best)
    const sorted = rows.map(r => r.q).sort((a, b) => a - b);
    const rank = q => { let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < q) lo = m + 1; else hi = m; } return lo; };
    const up = db.prepare(`INSERT INTO post_rank (post, score, stage, held, seen, watched, ratio, complete, skip, likes, comments, saves, shares, places, updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (post) DO UPDATE SET score = excluded.score, stage = excluded.stage, held = excluded.held,
      seen = excluded.seen, watched = excluded.watched, ratio = excluded.ratio, complete = excluded.complete, skip = excluded.skip, likes = excluded.likes,
      comments = excluded.comments, saves = excluded.saves, shares = excluded.shares, places = excluded.places, updated = excluded.updated`);
    db.exec('BEGIN');
    try {
      for (const r of rows) {
        const score = sorted.length > 1 ? Math.round(1000 * rank(r.q) / (sorted.length - 1)) / 10 : 50;
        // the stage: each limit reached opens the next one only with the score it needs
        let stage = 0, held = 0;
        for (let i = 0; i < 3; i++) {
          if (r.seen < s.caps[i]) break;
          if (score >= s.need[i]) stage = i + 1; else { held = 1; break; }
        }
        up.run(r.id, score, stage, held, r.seen, r.watched, r.ratio, r.complete, r.skip, r.likes, r.comments, r.saves, r.shares, r.places, t);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    db.prepare('DELETE FROM post_fy WHERE until > 0 AND until < ?').run(t);
    lastRun = t;
    return rows.length;
  }
  setTimeout(() => { try { recompute(); } catch (e) { console.error('foryou', e); } }, 5000).unref();
  setInterval(() => { try { recompute(); } catch (e) { console.error('foryou', e); } }, 10 * 60_000).unref();

  // ---- the feed ----
  // one page of For You for this viewer: higher score first, a push for new and young posts, friends a little up,
  // what they have already watched far down, a held post lower, a lifted post at the top, a kept-out one not at all;
  // chance mixes it (the seed keeps one visit's pages in the same order). Then no more than 2 posts from one person
  // in a row of 10.
  function feed(meId, who, seed, off, kind, first) {
    const s = settings(), t = now(), fresh = Math.max(1, s.freshHours) * 3 * 3600000;
    const sql = `${POST_SELECT} AND (?4 = '' OR (p.kind = ?4 AND p.more = '')) AND NOT EXISTS (SELECT 1 FROM post_fy f WHERE f.post = p.id AND f.mode = 'suppress')
      ORDER BY (CASE WHEN p.id = ?5 THEN 99 ELSE 0 END)
        + (CASE WHEN EXISTS (SELECT 1 FROM post_fy f WHERE f.post = p.id AND f.mode = 'boost') THEN 9 ELSE 0 END)
        + ${s.on ? `COALESCE((SELECT r.score FROM post_rank r WHERE r.post = p.id), 50) / 100.0
        + (CASE WHEN COALESCE((SELECT r.stage FROM post_rank r WHERE r.post = p.id), 0) = 0 AND COALESCE((SELECT r.held FROM post_rank r WHERE r.post = p.id), 0) = 0 THEN ?9 ELSE 0 END)
        - (CASE WHEN COALESCE((SELECT r.held FROM post_rank r WHERE r.post = p.id), 0) = 1 THEN 0.6 ELSE 0 END)
        - (CASE WHEN ?8 <> '' AND EXISTS (SELECT 1 FROM post_events e WHERE e.who = ?8 AND e.post = p.id AND e.kind IN ('watch', 'skip')) THEN 0.8 ELSE 0 END)` : '0'}
        + MAX(0, 1 - (?6 - p.at) / ?7) * 0.7
        + (CASE WHEN EXISTS (SELECT 1 FROM friends f WHERE f.a = min(p.user, ?1) AND f.b = max(p.user, ?1) AND (f.state = 'friends' OR (f.state = 'pending' AND f.actor = ?1))) THEN 0.25 ELSE 0 END)
        + ((p.id * ?2 + 7919) % 1009) / 1009.0 * ?10 DESC
      LIMIT 30 OFFSET ?3`;
    const rows = db.prepare(sql).all(meId, seed, off, kind, first, t, fresh, who || '', s.explore, s.on ? s.chance : 1);
    // variety: a third post from the same person in a stretch of 10 waits for the end of the page
    const out = [], later = [], recent = [];
    for (const p of rows) {
      const n = recent.slice(-9).filter(u => u === p.user).length;
      if (n >= 2 && p.id !== first) { later.push(p); continue; }
      out.push(p); recent.push(p.user);
    }
    return [...out, ...later].map(p => forViewer(shownPost(p), meId));
  }

  // ---- the panel ----
  const perm = { perm: 'foryou.manage' };
  const postOut = r => {
    const u = db.prepare('SELECT id, name, username, pic_v FROM users WHERE id = ?').get(r.user) || { id: r.user, name: '?' };
    const f = db.prepare('SELECT mode, until, reason FROM post_fy WHERE post = ?').get(r.id);
    return { id: r.id, kind: r.kind, caption: (r.caption || '').slice(0, 120), place: r.place || '', created: r.created,
      thumb: r.kind === 'video' ? (r.poster ? 'media/' + r.poster : '') : r.kind === 'text' ? '' : 'media/' + r.file,
      user: { id: u.id, name: u.name, username: u.username || '', pic: u.pic_v || 0 },
      score: r.score ?? null, stage: r.stage ?? 0, held: !!r.held, seen: r.seen || 0, watched: r.watched || 0, ratio: r.ratio || 0, complete: r.complete || 0, skip: r.skip || 0,
      likes: r.likes || 0, comments: r.comments || 0, saves: r.saves || 0, shares: r.shares || 0, places: r.places || 0,
      mode: f ? f.mode : '', until: f ? f.until : 0, why: f ? f.reason : '' };
  };
  const LISTS = {
    top: 'r.stage DESC, r.score DESC',
    rising: 'r.score DESC',
    held: 'r.score DESC',
    picked: 'f.at DESC'
  };
  R('GET foryou', perm, ({ res, query }) => {
    const list = LISTS[query.get('list')] ? query.get('list') : 'top', t = now();
    const where = list === 'rising' ? 'AND r.held = 0 AND r.stage < 3 AND r.seen > 0' : list === 'held' ? 'AND r.held = 1' : list === 'picked' ? 'AND f.post IS NOT NULL' : '';
    const rows = db.prepare(`SELECT p.*, r.score, r.stage, r.held, r.seen, r.watched, r.ratio, r.complete, r.skip, r.likes, r.comments, r.saves, r.shares, r.places
      FROM posts p ${list === 'picked' ? 'LEFT' : ''} JOIN post_rank r ON r.post = p.id LEFT JOIN post_fy f ON f.post = p.id
      WHERE 1 ${where} ORDER BY ${LISTS[list]} LIMIT 60`).all();
    const stages = db.prepare('SELECT stage, held, COUNT(*) AS n FROM post_rank GROUP BY stage, held').all();
    const week = t - 7 * 86400000, day = t - 86400000;
    const sig = db.prepare(`SELECT kind, COUNT(*) AS n, COUNT(DISTINCT who) AS people, SUM(CASE WHEN at >= ? THEN 1 ELSE 0 END) AS today FROM post_events WHERE at >= ? GROUP BY kind`).all(day, week);
    const done = db.prepare(`SELECT AVG(done) AS c, AVG(CASE WHEN dur > 0 THEN MIN(1.0, ms * 1.0 / dur) END) AS r FROM post_events WHERE kind IN ('watch', 'skip') AND at >= ?`).get(week);
    json(res, 200, { list, settings: settings(), defaults: DEFAULTS, stages: STAGES, lastRun, rows: rows.map(postOut),
      funnel: { test: stages.filter(x => x.stage === 0 && !x.held).reduce((a, x) => a + x.n, 0), held: stages.filter(x => x.held).reduce((a, x) => a + x.n, 0),
        s1: stages.filter(x => x.stage === 1 && !x.held).reduce((a, x) => a + x.n, 0), s2: stages.filter(x => x.stage === 2 && !x.held).reduce((a, x) => a + x.n, 0),
        s3: stages.filter(x => x.stage === 3).reduce((a, x) => a + x.n, 0) },
      signals: Object.fromEntries(sig.map(x => [x.kind, { week: x.n, people: x.people, today: x.today }])),
      watch: { complete: done.c || 0, ratio: done.r || 0 } });
  });
  R('GET foryou/post', perm, ({ res, query }) => {
    const id = Number(query.get('id'));
    const r = db.prepare(`SELECT p.*, r.score, r.stage, r.held, r.seen, r.watched, r.ratio, r.complete, r.skip, r.likes, r.comments, r.saves, r.shares, r.places
      FROM posts p LEFT JOIN post_rank r ON r.post = p.id WHERE p.id = ?`).get(id);
    if (!r) return fail(res, 404, 'not found');
    json(res, 200, { post: postOut(r), stages: STAGES, settings: settings() });
  });
  R('POST foryou/post', perm, ({ req, res, user, body }) => {
    const id = Number(body.id), mode = String(body.mode || '');
    if (!['boost', 'suppress', 'clear'].includes(mode)) return fail(res, 400, 'bad request');
    if (!clean(body.reason, 40)) return fail(res, 400, 'reason');
    const p = db.prepare('SELECT id FROM posts WHERE id = ?').get(id);
    if (!p) return fail(res, 404, 'not found');
    const before = db.prepare('SELECT mode, until FROM post_fy WHERE post = ?').get(id) || null;
    if (mode === 'clear') db.prepare('DELETE FROM post_fy WHERE post = ?').run(id);
    else {
      const days = Math.max(0, Math.min(30, Math.round(Number(body.days) || 0)));
      db.prepare(`INSERT INTO post_fy (post, mode, until, by, at, reason) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (post) DO UPDATE SET mode = excluded.mode,
        until = excluded.until, by = excluded.by, at = excluded.at, reason = excluded.reason`).run(id, mode, days ? now() + days * 86400000 : 0, user.id, now(), clean(body.reason, 40));
    }
    const after = db.prepare('SELECT mode, until FROM post_fy WHERE post = ?').get(id) || null;
    A.audit(user.id, 'foryou.' + mode, { type: 'post', id, before, after, reason: clean(body.reason, 40), note: clean(body.note, 300), req });
    json(res, 200, { ok: true, mode: after ? after.mode : '' });
  });
  R('POST foryou/settings', perm, ({ req, res, user, body }) => {
    if (!clean(body.reason, 40)) return fail(res, 400, 'reason');
    const before = settings(), v = body.settings || {};
    const n = (x, lo, hi, d) => { x = Number(x); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
    const next = {
      on: typeof v.on === 'boolean' ? v.on : before.on,
      weights: Object.fromEntries(Object.keys(DEFAULTS.weights).map(k => [k, n(v.weights && v.weights[k], 0, 10, before.weights[k])])),
      caps: [0, 1, 2].map(i => Math.round(n(v.caps && v.caps[i], 10, 10_000_000, before.caps[i]))),
      need: [0, 1, 2].map(i => n(v.need && v.need[i], 0, 100, before.need[i])),
      freshHours: n(v.freshHours, 1, 24 * 30, before.freshHours),
      explore: n(v.explore, 0, 2, before.explore),
      chance: n(v.chance, 0, 1, before.chance)
    };
    if (!(next.caps[0] < next.caps[1] && next.caps[1] < next.caps[2])) return fail(res, 400, 'caps');
    saveSettings(next);
    try { recompute(); } catch (e) { console.error('foryou', e); }
    A.audit(user.id, 'foryou.settings', { type: 'foryou', id: 'settings', before, after: next, reason: clean(body.reason, 40), note: clean(body.note, 300), req });
    json(res, 200, { settings: next });
  });
  R('POST foryou/recompute', perm, ({ res }) => json(res, 200, { posts: recompute(), lastRun }));

  return { feed, recompute, settings };
};
