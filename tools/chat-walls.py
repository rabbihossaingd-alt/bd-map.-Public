# Draws the chat wallpapers and writes css/chat-themes.css: every theme's art, its bubble colours, and the
# preview tiles of the picker. Calm and minimal, as Apple's wallpapers: soft blurred light, few shapes, room.
#   python tools/chat-walls.py
import math, os, random
from urllib.parse import quote

def uri(svg):
    svg = ' '.join(svg.split())
    return 'url("data:image/svg+xml,' + quote(svg, safe=" =:/,.'()-;") + '")'

def svg(body, defs=''):
    return ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 900' preserveAspectRatio='xMidYMid slice'>"
            f"<defs><filter id='b' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='60'/></filter>{defs}</defs>{body}</svg>")

def grad(stops):
    s = ''.join(f"<stop offset='{o}' stop-color='{c}'/>" for o, c in stops)
    return f"<linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>{s}</linearGradient>"

BG = "<rect width='600' height='900' fill='url(#g)'/>"

def glow(cx, cy, r, c, o=1):
    return f"<circle cx='{cx}' cy='{cy}' r='{r}' fill='{c}' opacity='{o}' filter='url(#b)'/>"

def smooth_closed(pts):
    n = len(pts); d = f'M{pts[0][0]:.0f},{pts[0][1]:.0f}'
    for i in range(n):
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f'C{c1[0]:.0f},{c1[1]:.0f} {c2[0]:.0f},{c2[1]:.0f} {p2[0]:.0f},{p2[1]:.0f}'
    return d + 'Z'

def blob(cx, cy, r, seed, stretch=1.0, rot=0.0, k=7):
    rnd = random.Random(seed); pts = []
    for i in range(k):
        a = i / k * math.tau; rr = r * (0.75 + rnd.random() * 0.45)
        x, y = math.cos(a) * rr * stretch, math.sin(a) * rr
        pts.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
    return smooth_closed(pts)

# peach: three big soft shapes of warm light on cream
peach = svg(BG + f"<path d='{blob(120, 160, 190, 1, 1.4, .5)}' fill='#ffc59e' opacity='.55' filter='url(#b)'/>"
            f"<path d='{blob(520, 520, 210, 2, 1.2, 2.1)}' fill='#ffb08a' opacity='.45' filter='url(#b)'/>"
            f"<path d='{blob(200, 860, 220, 3, 1.5, 1.0)}' fill='#ffd2b0' opacity='.6' filter='url(#b)'/>",
            grad([(0, '#fff6ee'), (1, '#ffe7d6')]))

# a black cat, minimal: one peeking in at the foot, a small one at the top corner, on a calm sage
def cat(x, y, s, rot):
    return (f"<g transform='translate({x},{y}) rotate({rot}) scale({s})'>"
            "<path fill='#1c1c1e' d='M-60,10 C-62,-40 -30,-62 0,-62 C30,-62 62,-40 60,10 C58,52 30,70 0,70 C-30,70 -58,52 -60,10Z M-52,-30 L-58,-104 L-12,-58Z M52,-30 L58,-104 L12,-58Z M-40,60 C-60,120 -70,200 -64,300 L64,300 C70,200 60,120 40,60Z'/>"
            "<ellipse cx='-22' cy='0' rx='15' ry='17' fill='#f5f1e3'/><ellipse cx='22' cy='4' rx='15' ry='17' fill='#f5f1e3'/>"
            "<circle cx='-18' cy='4' r='5.5' fill='#1c1c1e'/><circle cx='26' cy='8' r='5.5' fill='#1c1c1e'/>"
            "<path stroke='#1c1c1e' stroke-width='2' fill='none' stroke-linecap='round' d='M-56,24 L-96,18 M-56,32 L-94,38 M56,24 L96,18 M56,32 L94,38'/></g>")
cats = svg(BG + glow(460, 200, 220, '#ffffff', .35) + cat(470, 820, 1.05, 0) + cat(70, 70, .55, 160), grad([(0, '#a9cdb6'), (1, '#86b598')]))

# blue sky: Apple's light blue, one soft ring of light
sky = svg(BG + glow(300, 330, 230, '#ffffff', .85) + glow(520, 860, 260, '#7fb6ff', .5)
          + "<circle cx='300' cy='330' r='260' fill='none' stroke='#ffffff' stroke-opacity='.35' stroke-width='2'/>"
          + "<circle cx='300' cy='330' r='360' fill='none' stroke='#ffffff' stroke-opacity='.2' stroke-width='2'/>",
          grad([(0, '#e9f3ff'), (.55, '#c7e0ff'), (1, '#9cc7ff')]))

# green waves: broad soft hills of mint
waves = svg(BG + "<path d='M-50,420 C120,340 300,470 650,360 L650,900 L-50,900Z' fill='#cfe8d7' opacity='.8'/>"
            "<path d='M-50,620 C160,540 340,700 650,580 L650,900 L-50,900Z' fill='#b3dbc1' opacity='.75'/>"
            "<path d='M-50,800 C180,740 380,860 650,780 L650,900 L-50,900Z' fill='#9acfae' opacity='.7'/>",
            grad([(0, '#f4faf5'), (1, '#e3f2e7')]))

# deep green: the light of a forest at night
forest = svg(BG + glow(120, 180, 220, '#2e7d52', .7) + glow(520, 640, 240, '#1f6b45', .6) + glow(260, 900, 200, '#3a8f5f', .4), grad([(0, '#0d2a1f'), (1, '#0a1f17')]))

# green mist: a soft green, light from above
mist = svg(BG + glow(220, 80, 240, '#cfeedd', .8) + glow(560, 560, 220, '#5fae84', .5) + glow(40, 700, 220, '#3f8f68', .45), grad([(0, '#7cc29b'), (1, '#4f9c76')]))

# love: a soft blush and five quiet hearts
def heart(x, y, s, r, c, o):
    return f"<path transform='translate({x},{y}) rotate({r}) scale({s})' fill='{c}' opacity='{o}' d='M0,-4 C-6,-13 -18,-5 0,10 C18,-5 6,-13 0,-4Z'/>"
love = svg(BG + glow(480, 160, 220, '#ffd1da', .7) + glow(100, 760, 240, '#ffdfe5', .8)
           + heart(470, 150, 3.2, 12, '#ff375f', .22) + heart(110, 330, 1.8, -14, '#ff6b86', .2) + heart(520, 560, 2.2, 8, '#ff375f', .16)
           + heart(160, 760, 3.0, -8, '#ff6b86', .18) + heart(360, 880, 1.6, 10, '#ff375f', .15),
           grad([(0, '#fff7f8'), (1, '#ffeef1')]))

# night: indigo, a few stars, a thin moon
rnd = random.Random(11)
stars = ''.join(f"<circle cx='{rnd.uniform(0, 600):.0f}' cy='{rnd.uniform(0, 620):.0f}' r='{rnd.choice([1, 1.3, 1.8])}' fill='#ffffff' opacity='{rnd.uniform(.25, .7):.2f}'/>" for _ in range(28))
night = svg(BG + glow(300, 980, 320, '#5e5ce6', .55) + stars
            + "<circle cx='470' cy='140' r='34' fill='#f5f0ff' opacity='.9'/><circle cx='486' cy='128' r='31' fill='#1a1c44'/>",
            grad([(0, '#0f1033'), (1, '#1d1f52')]))

# sunset: a soft gradient, the sun as a glow, one hill
sunset = svg(BG + glow(300, 560, 160, '#fff3d6', .9) + "<path d='M-50,720 C140,650 340,700 650,640 L650,900 L-50,900Z' fill='#c98bb9' opacity='.55'/>",
             grad([(0, '#ffe2c4'), (.5, '#ffbfae'), (1, '#d9a3c9')]))

W = {k: uri(v) for k, v in dict(lava=peach, cats=cats, ocean=sky, green=waves, forest=forest, mist=mist, berry=love, grape=night, sunset=sunset).items()}
THEMES = {
    # id: (wall, my bubble, my text, their bubble, their text, accent, chip bg, chip text)
    'lava':   (W['lava'], '#ff7a45', '#fff', '#ffffff', '#1c1c1e', '#ff7a45', 'rgb(255 255 255 / .6)', '#8a4a2a'),
    'cats':   (W['cats'], '#1c1c1e', '#ffffff', '#ffffff', '#1c1c1e', '#1c1c1e', 'rgb(255 255 255 / .5)', '#2b4a37'),
    'ocean':  (W['ocean'], '#0a84ff', '#fff', '#ffffff', '#1c1c1e', '#0a84ff', 'rgb(255 255 255 / .6)', '#2a5a8f'),
    'green':  (W['green'], '#2f9e6a', '#fff', '#ffffff', '#1c1c1e', '#2f9e6a', 'rgb(255 255 255 / .65)', '#3a6a50'),
    'forest': (W['forest'], '#30d158', '#04210f', '#1e3a2d', '#effff4', '#30d158', 'rgb(255 255 255 / .1)', '#bfe8cf'),
    'mist':   (W['mist'], '#ffffff', '#14432c', 'rgb(10 50 32 / .42)', '#ffffff', '#1f7a52', 'rgb(10 50 32 / .3)', '#effff5'),
    'berry':  (W['berry'], '#ff375f', '#fff', '#ffffff', '#1c1c1e', '#ff375f', 'rgb(255 255 255 / .7)', '#a33a52'),
    'grape':  (W['grape'], '#5e5ce6', '#fff', '#2c2c54', '#f2f2ff', '#7d7bff', 'rgb(255 255 255 / .1)', '#d6d6ff'),
    'sunset': (W['sunset'], '#ff5f6d', '#fff', '#ffffff', '#1c1c1e', '#ff6a6a', 'rgb(255 255 255 / .55)', '#7a3a4a'),
    'mono':   ('#f2f2f7', '#1c1c1e', '#ffffff', '#ffffff', '#1c1c1e', '#1c1c1e', 'rgb(0 0 0 / .05)', '#6e6e73'),
}
css = ["/* ---- chat themes (drawn by tools/chat-walls.py: python tools/chat-walls.py) ----\n"
       "   Calm art behind the whole conversation, the bars over it as glass, solid bubbles in the theme's colours,\n"
       "   and the day and notice lines on soft pills so every word reads. */"]
for k, (wall, mb, mfg, tb, tfg, acc, chip, chipfg) in THEMES.items():
    css.append(f":is(.chat-thread, .theme-tile)[data-theme={k}] {{ --wall: {wall} center / cover no-repeat; --mb: {mb}; --mfg: {mfg}; --tb: {tb}; --tfg: {tfg}; --mt: {acc}; --chip: {chip}; --chipfg: {chipfg}; }}")
art = ':is(' + ', '.join(f'[data-theme={k}]' for k in THEMES) + ')'
T = f'.chat-thread{art}'
css += [
    f"{T} {{ background: var(--wall); }}",
    f"{T} .chat-msgs {{ background: none; }}",
    f"{T} .chat-head {{ background: rgb(var(--white-rgb) / 0.62); border-bottom-color: rgb(var(--black-rgb) / 0.06); -webkit-backdrop-filter: saturate(1.8) blur(20px); backdrop-filter: saturate(1.8) blur(20px); }}",
    f":root[data-theme=dark] {T} .chat-head {{ background: rgb(28 28 30 / .62); border-bottom-color: rgb(255 255 255 / .06); }}",
    f"{T} .chat-compose {{ background: rgb(var(--white-rgb) / 0.72); border-color: rgb(var(--black-rgb) / 0.06); -webkit-backdrop-filter: saturate(1.8) blur(20px); backdrop-filter: saturate(1.8) blur(20px); }}",
    f":root[data-theme=dark] {T} .chat-compose {{ background: rgb(28 28 30 / .72); border-color: rgb(255 255 255 / .08); }}",
    f"{T} .me .bubble:not(.emoji):not(.media):not(.gone) {{ background: var(--mb); background-image: none; color: var(--mfg); box-shadow: none; }}",
    f"{T} .them .bubble:not(.emoji):not(.media):not(.gone) {{ background: var(--tb); background-image: none; color: var(--tfg); box-shadow: none; }}",
    f"{T} .me .bubble a, {T} .me .bubble.file {{ color: var(--mfg); }}",
    f"{T} .them .bubble a, {T} .them .bubble.file {{ color: var(--tfg); }}",
    f"{T} :is(.day, .sys, .seen-by) {{ align-self: center; padding: 3px 11px; border-radius: 999px; background: var(--chip); color: var(--chipfg); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }}",
    f"{T} .seen-by {{ align-self: flex-end; }}",
    # the dark art: dark glass bars with light words, in either mode of the app
    ".chat-thread:is([data-theme=forest], [data-theme=grape]) :is(.chat-head, .chat-compose) { background: rgb(18 20 28 / .55); border-color: rgb(255 255 255 / .08); color: #fff; }",
    ".chat-thread:is([data-theme=forest], [data-theme=grape]) .chat-head :is(b, span, small, em, .icon-btn#chat-back) { color: #fff; }",
    ".chat-thread:is([data-theme=forest], [data-theme=grape]) .chat-compose :is(textarea, .icon-btn) { color: rgb(255 255 255 / .85); }",
    ".chat-thread:is([data-theme=forest], [data-theme=grape]) .chat-compose textarea::placeholder { color: rgb(255 255 255 / .5); }",
    """.theme-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 0 var(--space-2) var(--space-4); }
.theme-tile { position: relative; display: grid; gap: 7px; padding: 0; border: 0; background: none; color: var(--ink); font: inherit; cursor: pointer; text-align: center; }
.theme-tile .tt-wall { position: relative; aspect-ratio: 3 / 4; border-radius: 18px; overflow: hidden; background: var(--wall, var(--surface-2)); box-shadow: inset 0 0 0 1px rgb(var(--black-rgb) / 0.07); transition: transform .25s var(--ease), box-shadow .2s; }
.theme-tile:hover .tt-wall { transform: translateY(-2px); }
.theme-tile.on .tt-wall { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--mt, var(--brand)); }
.theme-tile .tt-b { position: absolute; height: 13px; border-radius: 7px; }
.theme-tile .tt-b.t { left: 10px; top: 34%; width: 50%; background: var(--tb, #e9e9eb); }
.theme-tile .tt-b.m { right: 10px; top: 52%; width: 44%; background: var(--mb, var(--brand)); }
.theme-tile .tt-b.m2 { right: 10px; top: 65%; width: 28%; background: var(--mb, var(--brand)); }
.theme-tile > span { font-size: var(--fs-xs); font-weight: 600; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.theme-tile.on > span { color: var(--ink); font-weight: 700; }
.theme-tile[data-theme=default] .tt-wall { background: var(--bg); }"""]
NL = chr(10)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'css', 'chat-themes.css')
open(out, 'w', encoding='utf-8', newline=NL).write(NL.join(css) + NL)
print('wrote', out, len(NL.join(css)))
