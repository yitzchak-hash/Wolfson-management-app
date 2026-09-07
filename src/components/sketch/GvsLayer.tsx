/**
 * The gvs and pipe layer (B8): lowered ceilings, pipes and ducts on the sheet,
 * drawn as SVG UNDER the block layer, in the same sheet units.
 *
 * Three tools press on its catch-plate: GVS drags a rectangle, TRACE taps
 * corners (the first again to close), PIPE draws rough and gets straight.
 * Corners snap to walls, wall corners and other boxes (pick 59); a pipe's
 * ends snap to a unit's connection dots (56), a flexible duct leaving an
 * outlet takes the outlet's width. Every box writes its own numbers on
 * itself (60), wears the legend's DROP chips beside it when selected (58),
 * raises an amber note with a one-press fix when a unit inside needs a
 * deeper drop (61), and joins a touching box of the same drop (62 — decided
 * by the host, which owns the records). Under the Move tool a press picks a
 * box or a run and a double-click opens its settings (52).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DROPS, boxNumbers, centroid, dropLabel, pointInPoly, rectPoly, snapToBoxes, snapToInk, type Pt, type SketchShape } from '../../data/gvs';
import { midpoint, nearestDot, pinEnd, pipeLength, pipeLook, roundedPath, stepAside, straighten, type Dot, type PipeKind, type PipeRules, type SketchPipe } from '../../data/pipes';
import { connectionDots, itemBox, rot2, suPerCm, type SketchItem } from '../../data/sketchItems';

const SU = 1000;
const AMBER = '#b45309';

export type SketchTool = 'gvs' | 'trace' | 'pipe' | null;

export interface GvsLayerProps {
  shapes: SketchShape[];
  pipes: SketchPipe[];
  items: SketchItem[];
  tags: Map<string, string>;
  /** The drop a unit needs, cm (0 = none). */
  minDropOf: (it: SketchItem) => number;
  mPerW: number;
  aspect: number;
  tool: SketchTool;
  pipeKind: PipeKind;
  pipeRules: PipeRules;
  /** Under the Move tool, with no drawing tool held: boxes and runs take the press. */
  active: boolean;
  selected: { kind: 'shape' | 'pipe'; id: string } | null;
  onSelect: (sel: { kind: 'shape' | 'pipe'; id: string } | null) => void;
  onAddShape: (pts: Pt[]) => void;
  onAddPipe: (p: { kind: PipeKind; pts: Pt[]; fromId?: string; toId?: string; widthCm?: number }) => void;
  onChangeShape: (id: string, patch: Partial<SketchShape>) => void;
  onOpenShape: (id: string) => void;
  onOpenPipe: (id: string) => void;
  /** The other option, ghosted in grey (pick 65). */
  ghost?: { shapes: SketchShape[]; pipes: SketchPipe[]; items: SketchItem[] } | null;
  pdfCanvas: () => HTMLCanvasElement | null;
  readOnly?: boolean;
  words: { needs: (tag: string, need: number) => string; fix: (need: number) => string; m2: string; runM: string };
}

/** Every unit's dots on the sheet, world coordinates. */
export function sheetDots(items: SketchItem[], mPerW: number): Dot[] {
  const out: Dot[] = [];
  for (const it of items) {
    if (!it.unit) continue;
    const box = itemBox(it, mPerW);
    for (const d of connectionDots(box, it.sub, it.cat)) {
      const r = rot2(d.x, d.y, it.rot);
      out.push({ itemId: it.id, x: it.x + r.x, y: it.y + r.y, kind: d.kind, sizeCm: d.sizeCm });
    }
  }
  return out;
}

export function GvsLayer(props: GvsLayerProps) {
  const { shapes, pipes, items, tags, minDropOf, mPerW, aspect, tool, pipeKind, pipeRules, active, selected, onSelect, onAddShape, onAddPipe, onChangeShape, onOpenShape, onOpenPipe, ghost, pdfCanvas, readOnly, words } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [pxSu, setPxSu] = useState(1);
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const measure = () => { const w = el.getBoundingClientRect().width; if (w > 0) setPxSu(prev => (Math.abs(prev - SU / w) < 1e-4 ? prev : SU / w)); };
    measure(); const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const toSu = (clientX: number, clientY: number) => { const r = svgRef.current!.getBoundingClientRect(); return { x: ((clientX - r.left) / r.width) * SU, y: ((clientY - r.top) / r.width) * SU }; };
  const H = SU * aspect;
  const cm = suPerCm(mPerW);
  const reach = Math.max(12 * pxSu, 25 * cm);   // 25 cm, and never under twelve screen pixels

  const dots = useMemo(() => sheetDots(items, mPerW), [items, mPerW]);
  const boxes = useMemo(() => shapes.map(s => s.pts), [shapes]);

  /** Pick 59: the nearest of a box corner/edge and the plan's ink, within reach. */
  const snapCorner = (p: Pt): Pt => {
    const b = snapToBoxes(p, boxes, reach);
    let ink: Pt | null = null;
    const c = pdfCanvas();
    if (c && c.width) {
      const k = c.width / SU, win = Math.ceil(reach * k + 4);
      const cx = p.x * k, cy = p.y * k;
      const x0 = Math.max(0, Math.floor(cx - win)), y0 = Math.max(0, Math.floor(cy - win));
      const x1 = Math.min(c.width, Math.ceil(cx + win)), y1 = Math.min(c.height, Math.ceil(cy + win));
      if (x1 - x0 > 3 && y1 - y0 > 3) {
        try {
          const img = c.getContext('2d', { willReadFrequently: true })!.getImageData(x0, y0, x1 - x0, y1 - y0);
          const hit = snapToInk(img, cx - x0, cy - y0, reach * k);
          if (hit) ink = { x: (hit.x + x0) / k, y: (hit.y + y0) / k };
        } catch { /* a tainted canvas: no ink snap */ }
      }
    }
    if (b && ink) return Math.hypot(b.x - p.x, b.y - p.y) <= Math.hypot(ink.x - p.x, ink.y - p.y) ? b : ink;
    return b ?? ink ?? p;
  };

  // drafts
  const [rectDraft, setRectDraft] = useState<{ a: Pt; b: Pt } | null>(null);
  const [trace, setTrace] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const raw = useRef<Pt[] | null>(null);
  const [rawDraft, setRawDraft] = useState<Pt[] | null>(null);
  useEffect(() => { setRectDraft(null); setTrace([]); raw.current = null; setRawDraft(null); }, [tool]);

  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const dbl = (id: string) => { const now = performance.now(); const p = lastTap.current; lastTap.current = { id, at: now }; return !!p && p.id === id && now - p.at < 380; };

  function onPlateDown(e: React.PointerEvent) {
    if (readOnly || !tool) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = toSu(e.clientX, e.clientY);
    if (tool === 'gvs') { const a = snapCorner(p); setRectDraft({ a, b: a }); }
    else if (tool === 'trace') {
      const first = trace[0];
      if (first && trace.length >= 3 && Math.hypot(first.x - p.x, first.y - p.y) <= reach) { onAddShape(trace); setTrace([]); return; }
      setTrace(t => [...t, snapCorner(p)]);
    } else if (tool === 'pipe') { raw.current = [p]; setRawDraft([p]); }
  }
  function onPlateMove(e: React.PointerEvent) {
    if (!tool) return;
    const p = toSu(e.clientX, e.clientY);
    if (tool === 'gvs' && rectDraft) setRectDraft(d => (d ? { ...d, b: p } : d));
    else if (tool === 'trace') setHover(p);
    else if (tool === 'pipe' && raw.current) { raw.current.push(p); if (raw.current.length % 2 === 0) setRawDraft([...raw.current]); }
  }
  function onPlateUp(e: React.PointerEvent) {
    if (!tool) return;
    const p = toSu(e.clientX, e.clientY);
    if (tool === 'gvs' && rectDraft) {
      const b = snapCorner(p);
      setRectDraft(null);
      if (Math.abs(b.x - rectDraft.a.x) > 4 * pxSu && Math.abs(b.y - rectDraft.a.y) > 4 * pxSu) onAddShape(rectPoly(rectDraft.a, b));
    } else if (tool === 'pipe' && raw.current) {
      const r = raw.current; raw.current = null; setRawDraft(null);
      if (r.length < 2 || Math.hypot(r[r.length - 1].x - r[0].x, r[r.length - 1].y - r[0].y) < 4 * pxSu) return;
      finishPipe(r);
    }
  }

  /** Rough in, straight out (picks 54–56). */
  function finishPipe(r: Pt[]) {
    const isDuct = pipeKind === 'duct';
    const dotReach = Math.max(reach, 16 * pxSu);
    const startDot = nearestDot(r[0], isDuct ? dots.filter(d => d.kind === 'outlet') : dots.filter(d => d.kind === 'pipe'), dotReach)
      ?? nearestDot(r[0], dots, dotReach);
    let pts = straighten(r, 5 * pxSu);
    let toId: string | undefined;
    let endPt: Pt | null = null;
    if (isDuct) {
      // a flexible duct reaches a grille or a diffuser: its centre
      const target = items.filter(i => i.cat === 'grilles' || i.cat === 'diffusers').map(i => ({ ...i, d: Math.hypot(i.x - r[r.length - 1].x, i.y - r[r.length - 1].y) })).filter(i => i.d <= dotReach * 1.5).sort((a, b) => a.d - b.d)[0];
      if (target) { endPt = { x: target.x, y: target.y }; toId = target.id; }
    } else {
      const endDot = nearestDot(r[r.length - 1], dots.filter(d => d.kind === 'pipe' && d.itemId !== startDot?.itemId), dotReach);
      if (endDot) { endPt = { x: endDot.x, y: endDot.y }; toId = endDot.itemId; }
    }
    if (startDot) pts = pinEnd(pts, { x: startDot.x, y: startDot.y }, true);
    if (endPt) pts = pinEnd(pts, endPt, false);
    pts = stepAside(pts, pipes.map(p => p.pts), 6 * pxSu);
    const look = pipeLook(pipeKind, pipeRules);
    onAddPipe({ kind: pipeKind, pts, fromId: startDot?.itemId, toId, widthCm: isDuct ? (startDot?.kind === 'outlet' ? startDot.sizeCm : look.sizeCm ?? 20) : undefined });
  }

  const fs = 10 * pxSu;
  const sel = selected;
  const takesPicks = active && !tool && !readOnly;

  const drawShape = (s: SketchShape, ghosted = false) => {
    const c = centroid(s.pts);
    const n = boxNumbers(s.pts, mPerW);
    const isSel = sel?.kind === 'shape' && sel.id === s.id;
    // a unit inside that needs a deeper drop (pick 61)
    const needs = ghosted ? [] : items.filter(it => it.unit && pointInPoly({ x: it.x, y: it.y }, s.pts)).map(it => ({ it, need: minDropOf(it) })).filter(x => x.need > s.drop);
    const worst = needs.sort((a, b) => b.need - a.need)[0];
    const xs = s.pts.map(p => p.x), ys = s.pts.map(p => p.y);
    const x1 = Math.max(...xs), y0 = Math.min(...ys), x0 = Math.min(...xs), y1 = Math.max(...ys);
    return (
      <g key={s.id} data-gvs={ghosted ? undefined : s.id} data-gvs-drop={s.drop} opacity={ghosted ? 0.35 : 1}>
        <polygon points={s.pts.map(p => `${p.x},${p.y}`).join(' ')} fill={ghosted ? '#94a3b8' : s.color} fillOpacity={0.22} stroke={ghosted ? '#94a3b8' : s.color} strokeWidth={(isSel ? 2.5 : 1.5) * pxSu}
          strokeDasharray={isSel ? `${5 * pxSu} ${3 * pxSu}` : undefined}
          style={{ pointerEvents: takesPicks && !ghosted ? 'auto' : 'none', cursor: 'pointer' }}
          onPointerDown={e => { e.stopPropagation(); onSelect({ kind: 'shape', id: s.id }); if (dbl(s.id)) onOpenShape(s.id); }} />
        {!ghosted && (
          <g data-gvs-numbers style={{ pointerEvents: 'none' }}>
            <text x={c.x} y={c.y - fs * 0.2} textAnchor="middle" fontSize={fs * 1.6} fontWeight={800} fill={s.color} stroke="#fff" strokeWidth={3 * pxSu} paintOrder="stroke">{dropLabel(s.drop)}</text>
            <text x={c.x} y={c.y + fs * 1.1} textAnchor="middle" fontSize={fs} fontWeight={700} fill="#1e3a5f" stroke="#fff" strokeWidth={3 * pxSu} paintOrder="stroke">{n.m2.toFixed(1)} {words.m2} · {n.runM.toFixed(1)} {words.runM}</text>
            {s.name && <text x={c.x} y={c.y + fs * 2.3} textAnchor="middle" fontSize={fs} fill="#1e3a5f" stroke="#fff" strokeWidth={3 * pxSu} paintOrder="stroke">{s.name}</text>}
          </g>
        )}
        {/* the amber note with its one-press fix (pick 61) — advice, never a block */}
        {worst && (() => {
          const label = `${words.needs(tags.get(worst.it.id) ?? worst.it.model, worst.need)}`;
          const fix = words.fix(worst.need);
          const w1 = label.length * fs * 0.56 + 8 * pxSu, w2 = fix.length * fs * 0.56 + 10 * pxSu;
          return (
            <g data-gvs-warn={s.id} transform={`translate(${x0} ${y1 + 4 * pxSu})`} style={{ pointerEvents: readOnly ? 'none' : 'auto' }}>
              <rect width={w1 + w2} height={fs * 1.7} rx={3 * pxSu} fill="#fef3c7" stroke={AMBER} strokeWidth={pxSu} />
              <text x={4 * pxSu} y={fs * 1.2} fontSize={fs} fontWeight={700} fill={AMBER}>{label}</text>
              <rect data-gvs-fix={s.id} x={w1} y={pxSu} width={w2 - pxSu} height={fs * 1.7 - 2 * pxSu} rx={3 * pxSu} fill={AMBER} style={{ cursor: 'pointer' }}
                onPointerDown={e => { e.stopPropagation(); onChangeShape(s.id, { drop: worst.need, color: DROPS.find(d => d.drop === worst.need)?.color ?? s.color }); }} />
              <text x={w1 + 5 * pxSu} y={fs * 1.2} fontSize={fs} fontWeight={800} fill="#fff" style={{ pointerEvents: 'none' }}>{fix}</text>
            </g>
          );
        })()}
        {/* the legend's chips beside the selected box (pick 58) */}
        {isSel && !readOnly && (
          <g data-drop-chips transform={`translate(${x1 + 6 * pxSu} ${y0})`} style={{ pointerEvents: 'auto' }}>
            {DROPS.map((d, i) => (
              <g key={d.drop} data-drop-chip={d.drop} transform={`translate(0 ${i * fs * 2})`} style={{ cursor: 'pointer' }}
                onPointerDown={e => { e.stopPropagation(); onChangeShape(s.id, { drop: d.drop, color: d.color }); }}>
                <rect width={fs * 3.6} height={fs * 1.7} rx={3 * pxSu} fill={d.color} stroke="#fff" strokeWidth={s.drop === d.drop ? 2 * pxSu : 0} />
                <text x={fs * 1.8} y={fs * 1.22} textAnchor="middle" fontSize={fs} fontWeight={800} fill="#fff" style={{ pointerEvents: 'none' }}>{dropLabel(d.drop)}</text>
              </g>
            ))}
          </g>
        )}
      </g>
    );
  };

  const drawPipe = (p: SketchPipe, ghosted = false) => {
    const look = pipeLook(p.kind, pipeRules);
    const isSel = sel?.kind === 'pipe' && sel.id === p.id;
    const d = roundedPath(p.pts, 10 * pxSu);
    const m = midpoint(p.pts);
    const len = pipeLength(p.pts, mPerW);
    const color = ghosted ? '#94a3b8' : look.color;
    const duct = p.kind === 'duct';
    const ductW = (p.widthCm ?? 20) * cm;
    return (
      <g key={p.id} data-pipe={ghosted ? undefined : p.id} data-pipe-kind={p.kind} opacity={ghosted ? 0.35 : 1}>
        {/* a fat invisible hit line, so a thin run can be picked */}
        <path d={d} fill="none" stroke="rgba(0,0,0,0.001)" strokeWidth={Math.max(12 * pxSu, duct ? ductW : 0)} strokeLinecap="round"
          style={{ pointerEvents: takesPicks && !ghosted ? 'stroke' : 'none', cursor: 'pointer' }}
          onPointerDown={e => { e.stopPropagation(); onSelect({ kind: 'pipe', id: p.id }); if (dbl(p.id)) onOpenPipe(p.id); }} />
        {isSel && <path d={d} fill="none" stroke="#4aa8d8" strokeOpacity={0.5} strokeWidth={(duct ? ductW : 0) + 8 * pxSu} strokeLinecap="round" style={{ pointerEvents: 'none' }} />}
        {duct
          ? (<>
            <path d={d} fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={ductW} strokeLinecap="butt" style={{ pointerEvents: 'none' }} />
            <path d={d} fill="none" stroke={color} strokeWidth={1.2 * pxSu} strokeDasharray={`${6 * pxSu} ${4 * pxSu}`} style={{ pointerEvents: 'none' }} />
          </>)
          : look.pair
            ? (<>
              <path d={d} fill="none" stroke={color} strokeWidth={3.4 * pxSu} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              <path d={d} fill="none" stroke="#fff" strokeWidth={1.2 * pxSu} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
            </>)
            : <path d={d} fill="none" stroke={color} strokeWidth={2 * pxSu} strokeLinecap="round" strokeDasharray={look.dash ? look.dash.split(/\s+/).map(v => Number(v) * pxSu).join(' ') : undefined} style={{ pointerEvents: 'none' }} />}
        {!ghosted && (
          <text data-pipe-length x={m.x + (m.horiz ? 0 : 4 * pxSu)} y={m.y - (m.horiz ? 4 * pxSu : 0)} textAnchor={m.horiz ? 'middle' : 'start'} fontSize={fs} fontWeight={700} fill={color} stroke="#fff" strokeWidth={3 * pxSu} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
            {len.toFixed(1)} m{duct ? ` · Ø${p.widthCm ?? 20}` : ''}
          </text>
        )}
      </g>
    );
  };

  return (
    <svg ref={svgRef} data-gvs-layer viewBox={`0 0 ${SU} ${H}`} className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none', touchAction: 'none', overflow: 'visible' }}
      onPointerMove={onPlateMove} onPointerUp={onPlateUp} onPointerCancel={onPlateUp}>
      {/* the ghost of the other option, underneath everything (pick 65) */}
      {ghost && (
        <g data-ghost style={{ pointerEvents: 'none' }}>
          {ghost.shapes.map(s => drawShape(s, true))}
          {ghost.pipes.map(p => drawPipe(p, true))}
          {ghost.items.map(it => { const b = itemBox(it, mPerW); return <rect key={it.id} x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h} transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`} fill="#94a3b8" fillOpacity={0.25} stroke="#94a3b8" strokeWidth={pxSu} />; })}
        </g>
      )}
      {shapes.map(s => drawShape(s))}
      {pipes.map(p => drawPipe(p))}
      {/* the catch-plate: only while a drawing tool is held */}
      {tool && !readOnly && (
        <rect data-gvs-plate x={0} y={0} width={SU} height={H} fill="rgba(255,255,255,0.01)" style={{ pointerEvents: 'auto', cursor: 'crosshair' }} onPointerDown={onPlateDown} />
      )}
      {/* the dots light up while the pipe tool is held, so the pen knows where to start */}
      {tool === 'pipe' && dots.map((d, i) => (
        <circle key={i} data-sheet-dot={d.kind} cx={d.x} cy={d.y} r={(d.kind === 'outlet' ? 4 : 3) * pxSu} fill={d.kind === 'outlet' ? '#0891b2' : '#4aa8d8'} stroke="#fff" strokeWidth={pxSu} style={{ pointerEvents: 'none' }} />
      ))}
      {/* drafts */}
      {rectDraft && (() => { const r = rectPoly(rectDraft.a, rectDraft.b); return <polygon data-gvs-draft points={r.map(p => `${p.x},${p.y}`).join(' ')} fill="#1e3a5f" fillOpacity={0.12} stroke="#1e3a5f" strokeWidth={1.5 * pxSu} strokeDasharray={`${4 * pxSu} ${3 * pxSu}`} style={{ pointerEvents: 'none' }} />; })()}
      {trace.length > 0 && (
        <g data-trace-draft style={{ pointerEvents: 'none' }}>
          <polyline points={[...trace, ...(hover ? [hover] : [])].map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#1e3a5f" strokeWidth={1.5 * pxSu} strokeDasharray={`${4 * pxSu} ${3 * pxSu}`} />
          {trace.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={(i === 0 ? 5 : 3) * pxSu} fill={i === 0 ? '#fff' : '#1e3a5f'} stroke="#1e3a5f" strokeWidth={1.5 * pxSu} />)}
        </g>
      )}
      {rawDraft && <polyline data-pipe-draft points={rawDraft.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={pipeLook(pipeKind, pipeRules).color} strokeOpacity={0.6} strokeWidth={2 * pxSu} style={{ pointerEvents: 'none' }} />}
    </svg>
  );
}
