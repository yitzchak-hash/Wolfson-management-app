T={'A':'tA','B':'tB','C1':'tC1','C2':'tC2'}
def tip(n):
    if n<=52: return ['A','B','C1','C2'][(n-1)%4]
    return {53:'A',54:'B',55:'A',56:'B'}[n]
proof={(1,45):'Weinstein plan: "טיפוס A"',(1,40):'Redlich plan: "C2 טיפוס"',(1,43):'Zoom file "1_43 - C1"',
 (3,47):'Zoom file "3_47 - C1"',(2,30):'"2_30 … טיפוס B"',(2,53):'Berger plan: "טיפוס A"',(2,56):'Ostern plan: duplex, "דירה B"',(1,38):'"joined flat, tipus BC1" (38/39)'}
def bld(b):
    rows=[]
    rows.append(f'<div class="frow"><div class="fl">15–16</div>'+''.join(cell(b,n,2) for n in (55,56))+'</div>')
    rows.append(f'<div class="frow"><div class="fl">14</div>'+''.join(cell(b,n,2) for n in (53,54))+'</div>')
    for f in range(13,0,-1):
        rows.append(f'<div class="frow"><div class="fl">{f}</div>'+''.join(cell(b,n,1) for n in range(4*f-3,4*f+1))+'</div>')
    return f'<div class="bld"><div class="bh">Building {b}</div>'+''.join(rows)+'</div>'
def cell(b,n,span):
    t=tip(n); p=proof.get((b,n))
    mark=f' proven" title="{p}' if p else ''
    return f'<div class="c {T[t]}{mark}" style="grid-column:span {span}"><b>{n}</b><span>{t}</span></div>'
html=open('scratchpad/tipus-map/page.tpl').read()
html=html.replace('{{BUILDINGS}}',''.join(bld(b) for b in (1,2,3)))
open('docs/artifacts/2026-10-28-wolfson-tipus-map.html','w').write(html)
