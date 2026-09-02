import ezdxf, json, math, os, re, logging; logging.disable(logging.CRITICAL)
from ezdxf import bbox as bboxmod
doc = ezdxf.readfile('blocks.dxf'); msp = doc.modelspace()
HEBFONTS={'atir.shx','gil.shx'}
STYLEFONT={s.dxf.name:(s.dxf.font or '').lower() for s in doc.styles}
MAP=dict(zip("qwertyuiopasdfghjkl;zxcvbnm,./'", "/'קראטוןםפשדגכעיחלךףזסבהנמצתץ.,"))
def heb(s):
    """keyboard-mapped SHX Hebrew -> unicode; Latin/digit runs inside were stored visually reversed"""
    out=''.join(MAP.get(c,c) for c in s)
    # a Latin run is stored VISUALLY (reversed) only when it reads like "11=H 33=L"; "L=150" is already logical
    if re.search(r'\d+=[A-Za-z]', out):
        out=re.sub(r'[A-Za-z0-9=.\-/"]+(?: [A-Za-z0-9=.\-/"]+)*', lambda m:m.group(0)[::-1], out)
    return out
def decode(txt, style):
    return heb(txt) if STYLEFONT.get(style,'') in HEBFONTS else txt

def arcpts(cx,cy,r,a0,a1,n=24):
    if a1<a0: a1+=360
    return [(cx+r*math.cos(math.radians(a0+(a1-a0)*i/n)), cy+r*math.sin(math.radians(a0+(a1-a0)*i/n))) for i in range(n+1)]
def safe_iter(ins):
    try: it=ins.virtual_entities()
    except Exception: return
    while True:
        try: v=next(it)
        except StopIteration: return
        except Exception: continue
        yield v
def collect(container, out, depth=0):
    if depth>6: return
    for v in safe_iter(container):
        t=v.dxftype()
        if t=='INSERT': collect(v,out,depth+1); continue
        try:
            if t=='LINE': out.append(['pl',[(v.dxf.start.x,v.dxf.start.y),(v.dxf.end.x,v.dxf.end.y)],False,None])
            elif t in ('LWPOLYLINE','POLYLINE'):
                pts=[(p[0],p[1]) for p in v.get_points()] if t=='LWPOLYLINE' else [(q.dxf.location.x,q.dxf.location.y) for q in v.vertices]
                if len(pts)>=2: out.append(['pl',pts,bool(getattr(v,'closed',False)),None])
            elif t=='ARC': c=v.dxf.center; out.append(['pl',arcpts(c.x,c.y,v.dxf.radius,v.dxf.start_angle,v.dxf.end_angle),False,None])
            elif t=='CIRCLE': c=v.dxf.center; out.append(['c',(c.x,c.y,v.dxf.radius),False,None])
            elif t in ('ELLIPSE','SPLINE'): out.append(['pl',[(p.x,p.y) for p in v.flattening(distance=0.5)],False,None])
            elif t=='SOLID': out.append(['pg',[(v.dxf.vtx0.x,v.dxf.vtx0.y),(v.dxf.vtx1.x,v.dxf.vtx1.y),(v.dxf.vtx3.x,v.dxf.vtx3.y),(v.dxf.vtx2.x,v.dxf.vtx2.y)],True,'solid'])
            elif t=='HATCH':
                for path in v.paths:
                    pts=[]
                    if hasattr(path,'vertices'): pts=[(p[0],p[1]) for p in path.vertices]
                    elif hasattr(path,'edges'):
                        for ed in path.edges:
                            et=str(getattr(ed.type,'name',ed.type)).upper()
                            if 'LINE' in et: pts+=[(ed.start[0],ed.start[1]),(ed.end[0],ed.end[1])]
                            elif 'ARC' in et and hasattr(ed,'center'): pts+=arcpts(ed.center[0],ed.center[1],ed.radius,getattr(ed,'start_angle',0),getattr(ed,'end_angle',360),12)
                    if len(pts)>=3: out.append(['pg',pts,True,'hatch'])
            elif t in ('TEXT','MTEXT','ATTRIB'):
                raw = v.dxf.text if t!='MTEXT' else v.plain_text()
                txt = decode(raw, getattr(v.dxf,'style','Standard'))
                p=v.dxf.insert; h=getattr(v.dxf,'height',None) or getattr(v.dxf,'char_height',2)
                rot=getattr(v.dxf,'rotation',0) or 0
                out.append(['tx',(p.x,p.y,h,txt,rot),False,None])
        except Exception: pass

def firstlevel_box(e):
    """the honest box: extents of the DIRECT children (nested inserts measured as wholes but clipped)"""
    xs=[];ys=[]
    for v in safe_iter(e):
        try: b=bboxmod.extents([v],fast=True)
        except Exception: continue
        if not b.has_data: continue
        if b.extmax.x-b.extmin.x>1500 or b.extmax.y-b.extmin.y>1500: continue
        xs+=[b.extmin.x,b.extmax.x]; ys+=[b.extmin.y,b.extmax.y]
    return (min(xs),min(ys),max(xs),max(ys)) if xs else None

def inside(s,bb,m):
    x0,y0,x1,y1=bb[0]-m,bb[1]-m,bb[2]+m,bb[3]+m
    k,d=s[0],s[1]
    pts=[(d[0],d[1])] if k in ('c','tx') else d
    return all(x0<=x<=x1 and y0<=y<=y1 for x,y in pts)
def shapes_bbox(sh):
    xs=[];ys=[]
    for k,d,_,_ in sh:
        if k=='c': xs+=[d[0]-d[2],d[0]+d[2]]; ys+=[d[1]-d[2],d[1]+d[2]]
        elif k=='tx': xs.append(d[0]); ys.append(d[1])
        else:
            for x,y in d: xs.append(x); ys.append(y)
    return (min(xs),min(ys),max(xs),max(ys)) if xs else None

def to_svg(sh, bb, unit=4):
    """block-local svg: origin = bbox min, y flipped; 1 cm = `unit` svg units"""
    x0,y0,x1,y1=bb; W=(x1-x0)*unit; H=(y1-y0)*unit
    P=lambda x,y: f"{(x-x0)*unit:.1f},{(y1-y)*unit:.1f}"
    S=[]
    for k,d,closed,fill in sh:
        if k=='pl': S.append(f'<{"polygon" if closed else "polyline"} points="{" ".join(P(x,y) for x,y in d)}" fill="none"/>')
        elif k=='pg': S.append(f'<polygon points="{" ".join(P(x,y) for x,y in d)}" fill="{"#1e3a5f" if fill=="solid" else "#8fb3d9"}" fill-opacity=".5" stroke="none"/>')
        elif k=='c': S.append(f'<circle cx="{(d[0]-x0)*unit:.1f}" cy="{(y1-d[1])*unit:.1f}" r="{d[2]*unit:.1f}" fill="none"/>')
        elif k=='tx':
            x,y,hh,txt,rot=d; txt=txt.replace('&','&amp;').replace('<','&lt;')
            rot=rot%360
            flip = 135<rot<225
            if flip: rot=0
            elif rot>315 or rot<45: rot=0
            rtl=bool(re.search(r'[֐-׿]',txt))
            rtlattr = 'direction="rtl" text-anchor="end"' if rtl else ('text-anchor="end"' if flip else '')
            S.append(f'<text x="{(x-x0)*unit:.1f}" y="{(y1-y)*unit:.1f}" font-size="{hh*unit:.1f}" font-family="Arial,Heebo,sans-serif" fill="#22303d" {rtlattr} transform="rotate({-rot:.1f} {(x-x0)*unit:.1f} {(y1-y)*unit:.1f})">{txt}</text>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.1f} {H:.1f}" width="{W:.1f}" height="{H:.1f}" data-cm="{x1-x0:.1f}x{y1-y0:.1f}">'
            f'<g stroke="#1e3a5f" stroke-width="{0.35*unit:.2f}" stroke-linecap="round" stroke-linejoin="round">{"".join(S)}</g></svg>')

# headings (decoded), used for categories
heads=[]
for t in msp.query('TEXT MTEXT'):
    p=t.dxf.insert
    if abs(p.x)>1e6: continue
    raw=t.dxf.text if t.dxftype()=='TEXT' else t.plain_text()
    heads.append({'text':decode(raw,getattr(t.dxf,'style','Standard')).strip(),'x':p.x,'y':p.y,'h':getattr(t.dxf,'height',0) or 0})
BRANDS={'מיצובישי','אלקטרה','הייסנס','היסנס'}
def category(x,y):
    # right-hand copy of the sheet is canonical; find nearest heading ABOVE within the same column band
    cands=[h for h in heads if h['h']>15 and h['text'] not in BRANDS and h['y']>=y-5 and abs(h['x']-x)<1400]
    typ=min(cands,key=lambda h:(h['y']-y)+abs(h['x']-x)*0.3)['text'] if cands else ''
    brand=[h for h in heads if h['text'] in BRANDS and abs(h['x']-x)<450 and h['y']>y]
    return typ, (min(brand,key=lambda h:abs(h['x']-x))['text'] if brand else '')

os.makedirs('svg2',exist_ok=True); index=[]; seen={}
for e in msp.query('INSERT'):
    p=e.dxf.insert
    if abs(p.x)>1e6 or abs(p.y)>1e6: continue
    fb=firstlevel_box(e)
    if not fb: continue
    sh=[]; collect(e,sh)
    sh=[s for s in sh if inside(s,fb,25)]
    bb=shapes_bbox(sh)
    if not bb: continue
    if bb[3]-bb[1]<2: bb=(bb[0],bb[1]-6,bb[2],bb[3]+6)
    if bb[2]-bb[0]<2: bb=(bb[0]-6,bb[1],bb[2]+6,bb[3])
    n=e.dxf.name; seen[n]=seen.get(n,0)+1
    fn=re.sub(r'[^\w\-]+','_',n)+(f'_{seen[n]}' if seen[n]>1 else '')+'.svg'
    open(f'svg2/{fn}','w').write(to_svg(sh,bb))
    attribs={a.dxf.tag:decode(a.dxf.text,getattr(a.dxf,'style','Standard')) for a in e.attribs} if e.attribs else {}
    texts=[s[1][3] for s in sh if s[0]=='tx' and s[1][3].strip()]
    typ,brand=category(p.x,p.y)
    index.append({'name':n,'file':fn,'x':round(p.x,1),'y':round(p.y,1),'rot':round(e.dxf.rotation,1),
                  'w_cm':round(bb[2]-bb[0],1),'h_cm':round(bb[3]-bb[1],1),'layer':e.dxf.layer,
                  'copy':'right' if p.x>-8000 else 'left','type':typ,'brand':brand,
                  'attribs':attribs,'texts':texts[:6]})
json.dump({'blocks':index,'headings':[h for h in heads]},open('index2.json','w'),ensure_ascii=False,indent=1)
big=[b for b in index if b['w_cm']>600 or b['h_cm']>600]
print('blocks',len(index),' still >6m:',len(big),[ (b['name'],b['w_cm']) for b in big[:6]])
import collections
print(collections.Counter(b['type'] for b in index if b['copy']=='right').most_common(20))
