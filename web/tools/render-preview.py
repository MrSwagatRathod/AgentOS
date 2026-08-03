#!/usr/bin/env python3
"""Render a faithful preview of the long-arrow UI — for visual verification.
Loads the real puzzle generator via Node, then draws the arrows with PIL
(rounded joints approximated by circles, filled arrowheads, navy on white).
Usage: python3 tools/render-preview.py [level]
"""
import sys, subprocess, json, math
from PIL import Image, ImageDraw

NODE = r"""
const fs=require('fs'),vm=require('vm');
const sb={globalThis:{}}; vm.createContext(sb);
for (const f of ['puzzle.js','difficulty.js','hints.js','renderer.js'])
  vm.runInContext(fs.readFileSync('/home/user/AgentOS/web/js/'+f,'utf8'), sb, {filename:f});
const AO=sb.globalThis.AO;
const N=parseInt(process.argv[1]);
const lv=AO.Puzzle.buildLevel(N);
console.log(JSON.stringify({level:N,size:lv.size,shape:lv.shape,arrows:lv.arrows.map(a=>({cells:a.cells,dir:a.dir,length:a.length})),removal:lv.removalOrder}));
"""

def get_level(n):
    out = subprocess.run(['node', '-e', NODE, str(n)], capture_output=True, text=True)
    return json.loads(out.stdout)

def draw_arrow(d, pts, head, dir_, cell, color, width, shadow=False):
    """rounded polyline (circles at joints) + filled arrowhead; dir 0=up 1=right 2=down 3=left"""
    ox, oy = (0, 2.5) if shadow else (0, 0)
    w = width + (3 if shadow else 0)
    col = (20, 30, 40, 30) if shadow else color
    for i in range(len(pts) - 1):
        d.line([pts[i][0]+ox, pts[i][1]+oy, pts[i+1][0]+ox, pts[i+1][1]+oy], fill=col, width=w)
    for (x, y) in pts[1:-1]:
        d.ellipse((x-ox-w/2, y+oy-w/2, x+ox+w/2, y+oy+w/2), fill=col)
    # arrowhead at head, pointing dir
    ux, uy = [(0,-1),(1,0),(0,1),(-1,0)][dir_]
    px, py = [(1,0),(0,1),(-1,0),(0,-1)][dir_]  # perpendicular
    tip = (head[0]+ux*cell*0.42, head[1]+uy*cell*0.42)
    base = (head[0]-ux*cell*0.18, head[1]-uy*cell*0.18)
    w1 = (base[0]+px*cell*0.17, base[1]+py*cell*0.17)
    w2 = (base[0]-px*cell*0.17, base[1]-py*cell*0.17)
    d.polygon([tip, w1, w2], fill=color)

lv = get_level(int(sys.argv[1]) if len(sys.argv) > 1 else 10)
size, shape = lv['size'], lv['shape']
CELL = 64
PAD = 55
W, H = 420, 760
X0, Y0 = (W - size*CELL)//2, 130

img = Image.new('RGB', (W, H), '#ffffff')
d = ImageDraw.Draw(img, 'RGBA')

# subtle grid
for y in range(size):
    for x in range(size):
        d.rectangle((X0+x*CELL+2, Y0+y*CELL+2, X0+x*CELL+CELL-2, Y0+y*CELL+CELL-2),
                    outline=(238, 241, 246, 255), width=1)

NAVY = (28, 50, 83, 255)
for a in lv['arrows']:
    pts = [(X0 + c['x']*CELL + CELL//2, Y0 + c['y']*CELL + CELL//2) for c in a['cells']]
    head = pts[-1]
    draw_arrow(d, pts, head, a['dir'], CELL, NAVY, max(3, int(CELL*0.22)), shadow=True)
    draw_arrow(d, pts, head, a['dir'], CELL, NAVY, max(3, int(CELL*0.22)))

out = '/home/user/AgentOS/docs/ui-preview-level%d.png' % lv['level']
img.save(out)
print('saved', out, '| shape:', shape, '| size:', size, 'x', size,
      '| arrows:', len(lv['arrows']), '| removal:', lv['removal'])
