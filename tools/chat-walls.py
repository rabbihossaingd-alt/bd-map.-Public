# Draws the chat wallpapers as SVG and writes the CSS for every theme (and the preview tiles).
import math, random
from urllib.parse import quote

def uri(svg):
    svg = ' '.join(svg.split())
    svg = svg.replace('%23', '#')            # colours are written %23 above; quoted once, here
    return 'url("data:image/svg+xml,' + quote(svg, safe=" =:/,.'()-;") + '")'

def smooth_closed(pts):
    # Catmull-Rom through the points, as cubic Béziers
    n = len(pts); d = f'M{pts[0][0]:.0f},{pts[0][1]:.0f}'
    for i in range(n):
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f'C{c1[0]:.0f},{c1[1]:.0f} {c2[0]:.0f},{c2[1]:.0f} {p2[0]:.0f},{p2[1]:.0f}'
    return d + 'Z'

def blob(cx, cy, r, rnd, stretch=1.0, rot=0.0, k=8):
    pts = []
    for i in range(k):
        a = i / k * math.tau
        rr = r * (0.55 + rnd.random() * 0.75)
        x, y = math.cos(a) * rr * stretch, math.sin(a) * rr
        x, y = x * math.cos(rot) - y * math.sin(rot), x * math.sin(rot) + y * math.cos(rot)
        pts.append((cx + x, cy + y))
    return smooth_closed(pts)

def lava(seed, bg, fg, w=600, h=900, n=22):
    rnd = random.Random(seed); paths = []
    for _ in range(n):
        paths.append(blob(rnd.uniform(-40, w + 40), rnd.uniform(-40, h + 40), rnd.uniform(55, 120), rnd, rnd.uniform(1.0, 2.2), rnd.uniform(0, math.pi)))
    return f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' preserveAspectRatio='xMidYMid slice'><rect width='{w}' height='{h}' fill='{bg}'/><path fill='{fg}' d='{' '.join(paths)}'/></svg>"

def cats():
    def cat(x, y, s, rot):
        # a black cat's head peeking in: round head, two ears, big cream eyes, whiskers
        return (f"<g transform='translate({x},{y}) rotate({rot}) scale({s})'>"
                "<path fill='%23111' d='M-60,10 C-62,-40 -30,-62 0,-62 C30,-62 62,-40 60,10 C58,52 30,70 0,70 C-30,70 -58,52 -60,10Z'/>"
                "<path fill='%23111' d='M-52,-30 L-58,-104 L-12,-58Z M52,-30 L58,-104 L12,-58Z'/>"
                "<path fill='%23111' d='M-40,60 C-60,120 -70,200 -64,260 L64,260 C70,200 60,120 40,60Z'/>"
                "<ellipse cx='-22' cy='0' rx='17' ry='19' fill='%23fff6c8'/><ellipse cx='22' cy='4' rx='17' ry='19' fill='%23fff6c8'/>"
                "<circle cx='-18' cy='4' r='6' fill='%23111'/><circle cx='26' cy='8' r='6' fill='%23111'/>"
                "<rect x='-6' y='30' width='12' height='5' rx='2.5' fill='%23fff6c8'/>"
                "<path stroke='%23111' stroke-width='2' fill='none' stroke-linecap='round' d='M-56,22 L-100,14 M-56,30 L-98,36 M56,22 L100,14 M56,30 L98,36'/></g>")
    body = cat(110, 160, 1.15, 150) + cat(520, 120, 0.8, 200) + cat(560, 560, 0.62, -60) + cat(250, 830, 1.2, 0)
    return f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 900' preserveAspectRatio='xMidYMid slice'><rect width='600' height='900' fill='%230e8a5c'/>{body}</svg>"

def waves():
    rnd = random.Random(7); w, h = 600, 1100
    cols = ['%23f3f8f2', '%23dcece0', '%23bcdac5', '%2398c6a6', '%23e9f3ea', '%23cfe5d5', '%23a9cfb4', '%237fb391', '%23e6f1e8']
    out = []
    for i, c in enumerate(cols):
        base = -260 + i * 175
        def y(x, o=0): return base + o + 46 * math.sin(x / 140 + i * 1.3) + 22 * math.sin(x / 55 + i * 2.1)
        pts = ' '.join(f'L{x},{y(x):.0f}' for x in range(-320, w + 361, 40))
        out.append(f"<path fill='{c}' d='M-320,{h + 400} L-320,{y(-320):.0f} {pts} L{w + 360},{h + 400}Z'/>")
        for k in range(1, 5):   # the fine contour lines on each band
            pl = ' '.join(f'{"M" if x == -320 else "L"}{x},{y(x, k * 22):.0f}' for x in range(-320, w + 361, 40))
            out.append(f"<path fill='none' stroke='%23000' stroke-opacity='.06' stroke-width='1' d='{pl}'/>")
    return f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' preserveAspectRatio='xMidYMid slice'><g transform='rotate(-14 300 550)'>{''.join(out)}</g></svg>"

def hearts():
    rnd = random.Random(3); out = []
    for _ in range(26):
        x, y, s, r = rnd.uniform(0, 300), rnd.uniform(0, 300), rnd.uniform(0.5, 1.4), rnd.uniform(-30, 30)
        c = rnd.choice(['%23ff3b47', '%23ff8a95', '%23ff6b77'])
        out.append(f"<path transform='translate({x:.0f},{y:.0f}) rotate({r:.0f}) scale({s:.2f})' fill='{c}' d='M0,-4 C-6,-13 -18,-5 0,10 C18,-5 6,-13 0,-4Z'/>")
    return f"<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'>{''.join(out)}</svg>"

def night():
    rnd = random.Random(11); out = []
    for _ in range(70):
        out.append(f"<circle cx='{rnd.uniform(0, 600):.0f}' cy='{rnd.uniform(0, 900):.0f}' r='{rnd.choice([0.8, 1, 1.2, 1.6, 2.2])}' fill='%23fff' opacity='{rnd.uniform(.25, .9):.2f}'/>")
    moon = "<circle cx='470' cy='130' r='46' fill='%23fff3c4'/><circle cx='490' cy='116' r='42' fill='%23171a45'/>"
    return (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 900' preserveAspectRatio='xMidYMid slice'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>"
            f"<stop offset='0' stop-color='%230b1030'/><stop offset='1' stop-color='%23232a66'/></linearGradient></defs><rect width='600' height='900' fill='url(%23g)'/>{''.join(out)}{moon}</svg>")

def sunset():
    return ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 900' preserveAspectRatio='xMidYMid slice'><defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'>"
            "<stop offset='0' stop-color='%23ffd7a8'/><stop offset='.45' stop-color='%23ff9e8a'/><stop offset='1' stop-color='%23b06ab3'/></linearGradient></defs>"
            "<rect width='600' height='900' fill='url(%23s)'/><circle cx='300' cy='520' r='120' fill='%23fff1c9' opacity='.85'/>"
            "<path fill='%23e27aa0' opacity='.75' d='M0,640 C120,580 220,600 320,640 C420,680 520,620 600,600 L600,900 L0,900Z'/>"
            "<path fill='%23a65aa8' opacity='.85' d='M0,720 C140,670 260,700 360,740 C460,780 540,730 600,720 L600,900 L0,900Z'/>"
            "<path fill='%23744a95' d='M0,800 C160,760 300,800 420,820 C500,834 560,812 600,806 L600,900 L0,900Z'/></svg>")

W = {
    'lava': uri(lava(5, '%23f7ece1', '%23ffa166')),
    'forest': uri(lava(9, '%2303301f', '%23356f37')),
    'cats': uri(cats()),
    'green': uri(waves()),
    'berry': uri(hearts()),
    'grape': uri(night()),
    'sunset': uri(sunset()),
}
GRID = "repeating-linear-gradient(0deg, rgb(255 255 255 / .16) 0 1px, transparent 1px 44px), repeating-linear-gradient(90deg, rgb(255 255 255 / .16) 0 1px, transparent 1px 44px)"
THEMES = {
    # id: (wallpaper, my bubble, my text, their bubble, their text, accent, chip bg, chip text)
    'lava':   (W['lava'] + ' center / cover', 'linear-gradient(160deg, #ff8a3d, #ff5a1f)', '#fff', '#ffffff', '#2b1a10', '#ff6a1a', 'rgb(255 255 255 / .78)', '#6b3a1c'),
    'forest': (W['forest'] + ' center / cover', 'linear-gradient(160deg, #a6dc62, #7cc043)', '#062a18', '#0c3d2a', '#eafbe9', '#8bc34a', 'rgb(0 0 0 / .45)', '#d8f5c8'),
    'cats':   (W['cats'] + ' center / cover', '#111111', '#ffffff', '#fff8dc', '#1c1a12', '#111111', 'rgb(0 0 0 / .38)', '#fff8dc'),
    'ocean':  ('radial-gradient(circle at 50% 42%, #ffffff 0%, #d7efff 22%, #8fd0ff 52%, #2b8cff 100%) center / cover, ' + GRID, 'linear-gradient(160deg, #2e95ff, #0066ff)', '#fff', '#ffffff', '#0b2440', '#007bff', 'rgb(255 255 255 / .7)', '#0b4a8f'),
    'green':  (W['green'] + ' center / cover', 'linear-gradient(160deg, #3f9a68, #2b7a52)', '#fff', '#ffffff', '#12291c', '#2f8a5b', 'rgb(255 255 255 / .75)', '#2b5a40'),
    'mist':   ('radial-gradient(60% 40% at 40% 10%, #9ed3a4 0%, transparent 70%), radial-gradient(70% 45% at 30% 52%, #256a4e 0%, transparent 72%), radial-gradient(60% 40% at 90% 70%, #67ad7d 0%, transparent 70%), linear-gradient(180deg, #5aa877, #3c8f68) center / cover, ' + GRID, '#ffffff', '#16462f', 'rgb(8 40 26 / .55)', '#ffffff', '#ffffff', 'rgb(8 40 26 / .4)', '#e9fff1'),
    'berry':  (W['berry'] + ' 0 0 / 300px 300px, #fff6f7', 'linear-gradient(160deg, #ff5c6c, #e8235a)', '#fff', '#ffffff', '#3a1018', '#ff3b5c', 'rgb(255 255 255 / .85)', '#a3243c'),
    'grape':  (W['grape'] + ' center / cover', 'linear-gradient(160deg, #8a7dff, #5a5cf0)', '#fff', '#2a3070', '#eef0ff', '#8a7dff', 'rgb(255 255 255 / .14)', '#dfe2ff'),
    'sunset': (W['sunset'] + ' center / cover', 'linear-gradient(160deg, #ff7a59, #e8457c)', '#fff', '#ffffff', '#3a1a2a', '#ff6a5a', 'rgb(255 255 255 / .7)', '#7a2a4a'),
    'mono':   ('#f2f2f2', '#111111', '#ffffff', '#ffffff', '#111111', '#111111', 'rgb(0 0 0 / .06)', '#444444'),
}
css = ["\n/* ---- chat themes, as Messenger's: art behind the messages, solid bubbles in the theme's colours, and the day\n   and notice lines on a soft pill so every word reads on the art (drawn by tools/chat-walls.py: python tools/chat-walls.py) ---- */"]
for k, (wall, mb, mfg, tb, tfg, acc, chip, chipfg) in THEMES.items():
    css.append(f":is(.chat-thread, .theme-tile)[data-theme={k}] {{ --wall: {wall}; --mb: {mb}; --mfg: {mfg}; --tb: {tb}; --tfg: {tfg}; --mt: {acc}; --chip: {chip}; --chipfg: {chipfg}; }}")
art = ':is(' + ', '.join(f'[data-theme={k}]' for k in THEMES) + ')'
css.append(f".chat-thread{art} .chat-msgs {{ background: var(--wall); }}")
css.append(f".chat-thread{art} .me .bubble:not(.emoji):not(.media):not(.gone) {{ background: var(--mb); background-size: auto; color: var(--mfg); box-shadow: 0 1px 2px rgb(0 0 0 / .12); }}")
css.append(f".chat-thread{art} .them .bubble:not(.emoji):not(.media):not(.gone) {{ background: var(--tb); color: var(--tfg); box-shadow: 0 1px 2px rgb(0 0 0 / .12); }}")
css.append(f".chat-thread{art} .me .bubble a, .chat-thread{art} .me .bubble.file {{ color: var(--mfg); }}")
css.append(f".chat-thread{art} .them .bubble a, .chat-thread{art} .them .bubble.file {{ color: var(--tfg); }}")
css.append(f".chat-thread{art} :is(.day, .sys, .seen-by) {{ align-self: center; padding: 4px 12px; border-radius: 999px; background: var(--chip); color: var(--chipfg); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }}")
css.append(f".chat-thread{art} .seen-by {{ align-self: flex-end; }}")
css.append(f".chat-thread{art} .msg .who, .chat-thread{art} .msg .meta {{ color: var(--chipfg); }}")
# the picker: small phones with the wall and two bubbles
css.append(""".theme-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 0 var(--space-2) var(--space-4); }
.theme-tile { position: relative; display: grid; gap: 6px; padding: 0; border: 0; background: none; color: var(--ink); font: inherit; cursor: pointer; text-align: center; }
.theme-tile .tt-wall { position: relative; aspect-ratio: 3 / 4; border-radius: 16px; overflow: hidden; background: var(--wall, var(--surface-2)); box-shadow: inset 0 0 0 1px rgb(var(--black-rgb) / 0.08); transition: transform .2s var(--ease), box-shadow .2s; }
.theme-tile:hover .tt-wall { transform: translateY(-2px); }
.theme-tile.on .tt-wall { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--ink); }
.theme-tile .tt-b { position: absolute; height: 14px; border-radius: 8px; }
.theme-tile .tt-b.t { left: 9px; top: 32%; width: 52%; background: var(--tb, var(--surface)); box-shadow: 0 1px 2px rgb(0 0 0 / .12); }
.theme-tile .tt-b.m { right: 9px; top: 52%; width: 46%; background: var(--mb, var(--brand)); }
.theme-tile .tt-b.m2 { right: 9px; top: 66%; width: 30%; background: var(--mb, var(--brand)); }
.theme-tile > span { font-size: var(--fs-xs); font-weight: 700; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.theme-tile.on > span { color: var(--ink); }
.theme-tile[data-theme=default] .tt-wall { background: var(--bg); }""")
import os
NL = chr(10)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'css', 'chat-themes.css')
open(out, 'w', encoding='utf-8', newline=NL).write(NL.join(css) + NL)
print('wrote', out)
