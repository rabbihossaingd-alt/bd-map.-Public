// ---- The moving picture behind Home's headline ----
// A quiet network of places and the roads between them, with a few lights travelling along the roads like
// buses at night. Drawn on one canvas; it pauses when Home is not on screen, and stands still for people
// who have asked their device for less motion.

(function heroScene() {
  const canvas = document.getElementById('hero-scene');
  if (!canvas) return;
  // With "reduce motion" switched on in the device's settings the picture is still drawn, but it stands still.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, nodes = [], edges = [], lights = [], running = false, pointer = { x: 0.5, y: 0.5 };

  // The same picture every visit: a small seeded generator instead of Math.random.
  let seed = 20261014;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  function build() {
    const box = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
    w = box.width; h = box.height;
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    seed = 20261014;
    const count = Math.max(14, Math.min(46, Math.round(w * h / 21000)));
    nodes = Array.from({ length: count }, () => ({ x: rand() * w, y: rand() * h, vx: (rand() - 0.5) * 0.16, vy: (rand() - 0.5) * 0.16, r: 1.2 + rand() * 2.2, depth: 0.4 + rand() * 0.6 }));
    link();
    lights = Array.from({ length: Math.max(4, Math.round(count / 5)) }, () => newLight());
  }
  // Each place is joined to its two nearest neighbours: a road map, not a spider's web.
  function link() {
    edges = [];
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => [j, (a.x - b.x) ** 2 + (a.y - b.y) ** 2]).filter(x => x[0] !== i).sort((p, q) => p[1] - q[1]).slice(0, 2);
      for (const [j] of near) if (!edges.some(e => (e[0] === i && e[1] === j) || (e[0] === j && e[1] === i))) edges.push([i, j]);
    });
  }
  const newLight = () => ({ edge: Math.floor(rand() * Math.max(1, edges.length)), t: rand(), speed: 0.0016 + rand() * 0.0026, dir: rand() < 0.5 ? 1 : -1 });

  function colours() {
    const css = getComputedStyle(document.documentElement);
    const dark = document.documentElement.dataset.theme === 'dark';
    return { accent: css.getPropertyValue('--accent').trim() || '#0a8f62', line: dark ? 'rgba(255,255,255,' : 'rgba(11,15,20,', dark };
  }
  let look = colours(), frame = 0;

  function draw() {
    if (!running) return;
    if (++frame % 600 === 0) link();                    // the places drift, so the roads are re-laid now and then
    ctx.clearRect(0, 0, w, h);
    const px = (pointer.x - 0.5) * 18, py = (pointer.y - 0.5) * 12;
    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < -20 || n.x > w + 20) n.vx *= -1;
      if (n.y < -20 || n.y > h + 20) n.vy *= -1;
    }
    const at = n => [n.x + px * n.depth, n.y + py * n.depth];
    ctx.lineWidth = 1;
    for (const [i, j] of edges) {
      const [ax, ay] = at(nodes[i]), [bx, by] = at(nodes[j]);
      const far = Math.hypot(ax - bx, ay - by);
      if (far > 260) continue;
      ctx.strokeStyle = look.line + (0.11 * (1 - far / 260)).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    for (const n of nodes) {
      const [x, y] = at(n);
      ctx.fillStyle = look.line + (0.16 + 0.2 * n.depth).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, n.r, 0, 6.2832); ctx.fill();
    }
    for (const l of lights) {
      const e = edges[l.edge];
      if (!e) { Object.assign(l, newLight()); continue; }
      l.t += l.speed * l.dir;
      if (l.t > 1 || l.t < 0) {                          // at a junction: take another road out of this place
        const here = l.t > 1 ? e[1] : e[0];
        const ways = edges.map((x, k) => [x, k]).filter(([x]) => x[0] === here || x[1] === here);
        const [next, k] = ways[Math.floor(rand() * ways.length)] || [e, l.edge];
        l.edge = k; l.dir = next[0] === here ? 1 : -1; l.t = l.dir === 1 ? 0 : 1;
        continue;
      }
      const [ax, ay] = at(nodes[e[0]]), [bx, by] = at(nodes[e[1]]);
      const x = ax + (bx - ax) * l.t, y = ay + (by - ay) * l.t;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
      glow.addColorStop(0, look.accent); glow.addColorStop(1, 'transparent');
      ctx.globalAlpha = look.dark ? 0.55 : 0.4;
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = look.accent;
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 6.2832); ctx.fill();
    }
    if (!still) requestAnimationFrame(draw);
  }
  function setRunning(on) {
    if (on === running) return;
    running = on;
    if (on) { look = colours(); if (still) { draw(); running = false; } else requestAnimationFrame(draw); }
  }
  const visible = () => !document.hidden && document.body.dataset.page === 'home' && scrollY < h + 200;
  build();
  addEventListener('resize', () => { build(); });
  addEventListener('scroll', () => setRunning(visible()), { passive: true });
  addEventListener('hashchange', () => setTimeout(() => { if (document.body.dataset.page === 'home' && !w) build(); setRunning(visible()); }, 60));
  document.addEventListener('visibilitychange', () => setRunning(visible()));
  canvas.parentElement.addEventListener('pointermove', e => { const b = canvas.getBoundingClientRect(); pointer = { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }; });
  setTimeout(() => { if (!w) build(); setRunning(visible()); }, 120);
})();
