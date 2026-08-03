#!/usr/bin/env python3
"""Render a faithful preview of the Arrow Escape UI (mockup) — for visual verification."""
import sys, subprocess, json
from PIL import Image, ImageDraw, ImageFont

NODE = r"""
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('/home/user/AgentOS/web/js/levels.js','utf8');
const sb={globalThis:{}}; vm.createContext(sb); vm.runInContext(src,sb);
const L=sb.globalThis.AO.Levels;
const N=parseInt(process.argv[1]);
const lv=L.buildLevel(N);
console.log(JSON.stringify({level:N,size:lv.size,shape:lv.shape,grid:lv.grid}));
"""

def get_level(n):
    out = subprocess.run(['node', '-e', NODE, str(n)], capture_output=True, text=True)
    return json.loads(out.stdout)

def draw_arrow(d, cx, cy, u, dir_, color, w=None):
    """minimal arrow: rounded shaft + triangle head (dir: 0=up,1=right,2=down,3=left)"""
    sh = (w or u*0.21)
    tail, mid = -u*0.30, u*0.06
    hw, tip = u*0.19, u*0.34
    def R(x, y):
        k = (dir_ - 1) % 4
        for _ in range(k):
            x, y = -y, x
        return cx + x, cy + y
    x1, y1 = R(tail, 0); x2, y2 = R(mid, 0)
    d.line([x1, y1, x2, y2], fill=color, width=max(2, int(sh)))
    pts = [R(tip, 0), R(-u*0.02, -hw), R(-u*0.02, hw)]
    d.polygon(pts, fill=color)

def draw_heart(d, cx, cy, s, fill, outline=None):
    o = outline or fill
    d.polygon([(cx, cy-s*0.35), (cx+s*0.62, cy+s*0.35), (cx, cy+s*0.95)], fill=o)
    d.ellipse((cx-s*0.95, cy-s*0.75, cx-s*0.05, cy+s*0.15), fill=o)
    d.ellipse((cx+s*0.05, cy-s*0.75, cx+s*0.95, cy+s*0.15), fill=o)
    d.polygon([(cx, cy-s*0.35), (cx+s*0.62, cy+s*0.35), (cx, cy+s*0.95)], fill=fill)
    d.ellipse((cx-s*0.95, cy-s*0.75, cx-s*0.05, cy+s*0.15), fill=fill)
    d.ellipse((cx+s*0.05, cy-s*0.75, cx+s*0.95, cy+s*0.15), fill=fill)

lv = get_level(int(sys.argv[1]) if len(sys.argv) > 1 else 10)
size, grid, shape = lv['size'], lv['grid'], lv['shape']

CELL = 110
PAD = 60
W, H = 420, 760
BW, BH = size*CELL + PAD*2, size*CELL + PAD*2
X0 = (W - BW)//2
Y0 = 130

img = Image.new('RGB', (W, H), '#ffffff')
d = ImageDraw.Draw(img)
try:
    f_mid = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 19)
except Exception:
    f_mid = ImageFont.load_default()

# HUD
d.rounded_rectangle((16, 16, 58, 58), radius=29, outline='#dcdcdc', width=2)
d.line((30, 30, 44, 44), fill='#141414', width=3)
d.line((44, 30, 30, 44), fill='#141414', width=3)
d.text((74, 28), f"Level {lv['level']}", font=f_mid, fill='#141414')
for i in range(5):
    draw_heart(d, W - 34 - i*31, 40, 13, '#ff3b30' if i < 4 else '#d5d5d5')

# board
for y in range(size):
    for x in range(size):
        v = grid[y][x]
        cx = X0 + PAD + x*CELL + CELL//2
        cy = Y0 + PAD + y*CELL + CELL//2
        if v == -2:
            continue
        d.rectangle((cx-CELL//2+4, cy-CELL//2+4, cx+CELL//2-4, cy+CELL//2-4),
                    outline='#ececec', width=2, fill='#fbfbfb')
        if v >= 0:
            draw_arrow(d, cx, cy, CELL*0.62, v, '#141414')

# hint example on a safe arrow: red path + red arrow
hinted = None
for y in range(size):
    for x in range(size):
        if grid[y][x] >= 0:
            hinted = (x, y, grid[y][x]); break
    if hinted: break
if hinted:
    x, y, dir_ = hinted
    cx = X0 + PAD + x*CELL + CELL//2
    cy = Y0 + PAD + y*CELL + CELL//2
    # walk to exit
    dxs = [0, 1, 0, -1]; dys = [-1, 0, 1, 0]
    nx, ny = x + dxs[dir_], y + dys[dir_]
    lx, ly = x, y
    while 0 <= nx < size and 0 <= ny < size and grid[ny][nx] == -1:
        lx, ly = nx, ny
        nx += dxs[dir_]; ny += dys[dir_]
    ex = X0 + PAD + lx*CELL + CELL//2
    ey = Y0 + PAD + ly*CELL + CELL//2
    d.line([cx, cy, ex, ey], fill='#ff3b30', width=8)
    draw_arrow(d, cx, cy, CELL*0.62, dir_, '#ff3b30', w=CELL*0.23)

# bottom bar
bx = W//2
d.rounded_rectangle((bx-118, H-92, bx-74, H-48), radius=22, outline='#dcdcdc', width=2)
d.rounded_rectangle((bx-27, H-100, bx+27, H-40), radius=27, outline='#ff3b30', width=2)
d.rounded_rectangle((bx+74, H-92, bx+118, H-48), radius=22, outline='#dcdcdc', width=2)

out = '/home/user/AgentOS/docs/ui-preview-level%d.png' % lv['level']
img.save(out)
print('saved', out, '| shape:', shape, '| size:', size)
