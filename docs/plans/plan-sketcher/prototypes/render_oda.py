import ezdxf, re, sys
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.svg import SVGBackend
from ezdxf.addons.drawing.layout import Page
from ezdxf.addons.drawing.config import Configuration, BackgroundPolicy
from ezdxf import bbox as bboxmod
import pymupdf

x0,x1,y0,y1 = [float(v)*100 for v in sys.argv[1:5]]
stem, px = sys.argv[5], int(sys.argv[6])
clean = len(sys.argv) > 7 and sys.argv[7] == "clean"

doc = ezdxf.readfile("apt2_oda.dxf")
msp = doc.modelspace()

KEEP = re.compile(r"wall|door|glaz|window|strs|stair|furn|sanit|kitchen|cols|flor", re.I)
DROP = re.compile(r"iden|anno|note|dim|text|light|modification|prisot|construction", re.I)
def keeplayer(n):
    return bool(KEEP.search(n)) and not DROP.search(n)
if clean:
    for layer in doc.layers:
        n = layer.dxf.name
        if n != "0" and not keeplayer(n):
            layer.off()

SKIP_T = ("DIMENSION","MTEXT","TEXT","LEADER","MULTILEADER","ATTDEF")
def hit(b):
    return b.has_data and b.extmax.x> x0 and b.extmin.x<x1 and b.extmax.y>y0 and b.extmin.y<y1
ents = []
for e in msp:
    t = e.dxftype()
    if clean and t in SKIP_T: continue
    try: b = bboxmod.extents([e], fast=True)
    except Exception: continue
    if not b.has_data: continue
    big = t == "INSERT" and (b.extmax.x-b.extmin.x > 1000 or b.extmax.y-b.extmin.y > 1000)
    if big:
        try:
            for v in e.virtual_entities():
                vt = v.dxftype()
                if clean and vt in SKIP_T: continue
                if clean and v.dxf.layer != "0" and not keeplayer(v.dxf.layer): continue
                try: vb = bboxmod.extents([v], fast=True)
                except Exception: continue
                if hit(vb) and max(abs(vb.extmax.x),abs(vb.extmax.y)) < 1e6:
                    ents.append(v)
        except Exception: pass
        continue
    if hit(b):
        ents.append(e)
print(stem, "entities:", len(ents))
cfg = Configuration(background_policy=BackgroundPolicy.WHITE)
backend = SVGBackend()
Frontend(RenderContext(doc), backend, config=cfg).draw_entities(ents)
svg = backend.get_string(Page(0,0))
m = re.search(r'width="([^"]+)mm"', svg)
print("content width:", m.group(1), "mm")
svg = re.sub(r'<rect fill="#[0-9a-fA-F]{6}"', '<rect fill="#ffffff"', svg, count=1)
open(f"{stem}.svg","w").write(svg)
d = pymupdf.open(f"{stem}.svg")
r = d[0].rect
z = px/max(r.width, r.height)
d[0].get_pixmap(matrix=pymupdf.Matrix(z,z)).save(f"{stem}.png")
print(stem, "done")
