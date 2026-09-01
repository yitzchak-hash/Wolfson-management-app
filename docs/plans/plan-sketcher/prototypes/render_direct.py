import ezdxf, re, sys, math
from ezdxf import bbox as bboxmod
import pymupdf

clean = len(sys.argv) > 1 and sys.argv[1] == "clean"
stem = "direct_clean" if clean else "direct_before"
x0,x1,y0,y1 = -9350,-7300,-950,1010

doc = ezdxf.readfile("apt2_oda.dxf")
msp = doc.modelspace()

KEEPWALL = re.compile(r"wall", re.I)
KEEP = re.compile(r"wall|door|glaz|window|strs|stair|furn|sanit|kitchen|cols|flor$", re.I)
DROP = re.compile(r"iden|anno|note|dim|text|light|modification|elimination|prisot|construction|electr|plumb|demol|hidden|hral|area", re.I)
def keeplayer(n):
    if KEEPWALL.search(n) and not re.search(r"iden|text|elimination", n, re.I): return True
    return bool(KEEP.search(n)) and not DROP.search(n)

def hit2(xa,ya,xb,yb): return xb> x0 and xa<x1 and yb>y0 and ya<y1
def safe_iter(ins):
    try: it = ins.virtual_entities()
    except Exception: return
    while True:
        try: v = next(it)
        except StopIteration: return
        except Exception: continue
        yield v

S = []   # svg elements
def P(x, y): return f"{(x-x0)*10:.0f},{(y1-y)*10:.0f}"   # world cm -> svg units (mm), y flip
LW_THIN, LW_WALL = 12, 22   # svg units

def arcpts(cx, cy, r, a0, a1, n=24):
    if a1 < a0: a1 += 360
    return [(cx + r*math.cos(math.radians(a0 + (a1-a0)*i/n)),
             cy + r*math.sin(math.radians(a0 + (a1-a0)*i/n))) for i in range(n+1)]

def emit(e, layer):
    t = e.dxftype()
    wall = bool(KEEPWALL.search(layer))
    w = LW_WALL if wall else LW_THIN
    if t == "LINE":
        s, d = e.dxf.start, e.dxf.end
        S.append(f'<line x1="{P(s.x,s.y).replace(",", chr(34)+" y1="+chr(34))}" x2="{P(d.x,d.y).replace(",", chr(34)+" y2="+chr(34))}" stroke-width="{w}"/>')
    elif t in ("LWPOLYLINE","POLYLINE"):
        try:
            pts = [(p[0], p[1]) for p in e.get_points()] if t=="LWPOLYLINE" else [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
        except Exception: return
        if len(pts) < 2: return
        closed = getattr(e, "closed", False) or (e.dxf.flags & 1 if t=="POLYLINE" else False)
        tag = "polygon" if closed else "polyline"
        S.append(f'<{tag} points="{" ".join(P(x,y) for x,y in pts)}" fill="none" stroke-width="{w}"/>')
    elif t == "ARC":
        c = e.dxf.center
        pts = arcpts(c.x, c.y, e.dxf.radius, e.dxf.start_angle, e.dxf.end_angle)
        S.append(f'<polyline points="{" ".join(P(x,y) for x,y in pts)}" fill="none" stroke-width="{w}"/>')
    elif t == "CIRCLE":
        c = e.dxf.center
        S.append(f'<circle cx="{(c.x-x0)*10:.0f}" cy="{(y1-c.y)*10:.0f}" r="{e.dxf.radius*10:.0f}" fill="none" stroke-width="{w}"/>')
    elif t == "ELLIPSE":
        try:
            pts = [(p.x, p.y) for p in e.flattening(distance=2)]
            S.append(f'<polyline points="{" ".join(P(x,y) for x,y in pts)}" fill="none" stroke-width="{w}"/>')
        except Exception: pass
    elif t == "SOLID":
        try:
            pts = [e.dxf.vtx0, e.dxf.vtx1, e.dxf.vtx3, e.dxf.vtx2]
            S.append(f'<polygon points="{" ".join(P(p.x,p.y) for p in pts)}" fill="black" stroke="none"/>')
        except Exception: pass
    elif t == "HATCH":
        # wall fills only in clean; approximate each boundary path
        try:
            b = bboxmod.extents([e], fast=True)
            area = (b.extmax.x-b.extmin.x)*(b.extmax.y-b.extmin.y) if b.has_data else 0
        except Exception: return
        if clean and not wall and area > 60000: return
        for path in e.paths:
            pts = []
            if hasattr(path, "vertices"):     # PolylinePath
                pts = [(v[0], v[1]) for v in path.vertices]
            elif hasattr(path, "edges"):
                for ed in path.edges:
                    et = ed.type.name if hasattr(ed.type, "name") else str(ed.type)
                    if "LINE" in et.upper():
                        pts.append((ed.start[0], ed.start[1])); pts.append((ed.end[0], ed.end[1]))
                    elif "ARC" in et.upper() and hasattr(ed, "center"):
                        pts += arcpts(ed.center[0], ed.center[1], ed.radius, getattr(ed,"start_angle",0), getattr(ed,"end_angle",360), 12)
            if len(pts) >= 3:
                fill = "black" if wall else "#d9d9d9"
                S.append(f'<polygon points="{" ".join(P(x,y) for x,y in pts)}" fill="{fill}" fill-opacity="0.9" stroke="none"/>')

def want(t, layer):
    if t in ("DIMENSION","MTEXT","TEXT","LEADER","MULTILEADER","ATTDEF","XLINE","RAY","POINT","IMAGE","WIPEOUT"):
        return False if clean else t not in ("XLINE","RAY","IMAGE","WIPEOUT")
    if clean and layer != "0" and not keeplayer(layer): return False
    return True

def walk(container, ctx_layer=None):
    for v in (safe_iter(container) if hasattr(container, "virtual_entities") else container):
        t = v.dxftype()
        layer = v.dxf.layer if v.dxf.layer != "0" else (ctx_layer or "0")
        if t == "INSERT":
            walk(v, layer)
            continue
        if not want(t, layer): continue
        try: vb = bboxmod.extents([v], fast=True)
        except Exception: continue
        if not vb.has_data or not hit2(vb.extmin.x, vb.extmin.y, vb.extmax.x, vb.extmax.y): continue
        if max(abs(vb.extmax.x), abs(vb.extmax.y)) > 1e6: continue
        try: emit(v, layer)
        except Exception: pass

for e in msp:
    t = e.dxftype()
    try: b = bboxmod.extents([e], fast=True)
    except Exception: continue
    if not b.has_data: continue
    if not hit2(b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y): continue
    if t == "INSERT":
        walk(e, e.dxf.layer)
        continue
    if not want(t, e.dxf.layer): continue
    try: emit(e, e.dxf.layer)
    except Exception: pass

W = (x1-x0)*10; H = (y1-y0)*10
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}">'
       f'<rect width="{W:.0f}" height="{H:.0f}" fill="white"/>'
       f'<g stroke="black" stroke-linecap="round">{"".join(S)}</g></svg>')
open(f"{stem}.svg","w").write(svg)
print(stem, "elements:", len(S))
d = pymupdf.open(f"{stem}.svg"); r = d[0].rect
z = 5200/max(r.width, r.height)
d[0].get_pixmap(matrix=pymupdf.Matrix(z,z)).save(f"{stem}.png")
print(stem, "done")
