/**
 * The block layer (B7): every placed block on the sheet, drawn as SVG over the
 * studio's three canvases, in sheet units (0..1000 across).
 *
 * It takes the pointer only when the studio's MOVE tool is held, a block is
 * being stamped (pick 46), or the two-tap scale is being set — the pen still
 * draws straight over a block. What it does with a press:
 *   · on a block — pick it; drag moves it, and letting go SNAPS it to the
 *     nearest wall turned to face the room (pick 42), or leaves it exactly
 *     where it was put;
 *   · the round handle above — turns it, 15° at a time, Shift frees (43);
 *   · the padlock — true size locked, or free resize (19); a grille's corner
 *     pulls its LENGTH and snaps to the catalog's lengths, Shift frees (51);
 *   · the label — drag to move, its corner resizes, a tiny bar flips or
 *     hides it; no text editing on the sheet (44 · 49);
 *   · double-click / double-tap anything — its settings (52).
 * Chrome (handles, dashes, label type) is sized in SCREEN pixels: it is a
 * marker, not part of the drawing, so it must not grow with the zoom.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CatalogBlock } from '../../data/catalog';
import { blockLabel, snapLength } from '../../data/catalog';
import { connectionDots, itemBox, normAngle, rot2, snapAngle, suPerCm, wallSnap, type SketchItem } from '../../data/sketchItems';

const NAVY = '#1e3a5f';
const ACCENT = '#4aa8d8';
const SU = 1000;

export interface BlockLayerHandle {
  /** A shelf drag let go at these client coordinates: is it over the sheet, and where? */
  suAtClient: (clientX: number, clientY: number) => { x: number; y: number } | null;
  /** The wall snap for a fresh block let go at a sheet point. */
  settle: (b: Pick<CatalogBlock, 'wCm' | 'hCm'>, at: { x: number; y: number }) => { x: number; y: number; rot: number };
}

export interface BlockLayerProps {
  items: SketchItem[];
  blocks: Map<string, CatalogBlock>;
  /** Metres across the sheet's width. */
  mPerW: number;
  /** Sheet height ÷ width. */
  aspect: number;
  /** Take the pointer (the Move tool). */
  active: boolean;
  /** The block riding the cursor (stamp mode), or null. */
  stamp: CatalogBlock | null;
  /** Two-tap scale: the taps so far. */
  measuring: { x: number; y: number }[] | null;
  onMeasureTap?: (p: { x: number; y: number }) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onPlace: (b: CatalogBlock, at: { x: number; y: number; rot: number }) => void;
  onChange: (id: string, patch: Partial<SketchItem>) => void;
  onOpen: (id: string) => void;
  tags: Map<string, string>;
  /** The drawn sheet, for the wall snap's pixels. */
  pdfCanvas: () => HTMLCanvasElement | null;
  readOnly?: boolean;
  words: { hideLabel: string; showLabel: string; flipLabel: string; locked: string; unlocked: string; turn: string; resize: string; stretch: string };
}

type Gesture =
  | { kind: 'move'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean; pointerId: number }
  | { kind: 'rotate'; id: string; pointerId: number }
  | { kind: 'resize'; id: string; pointerId: number; stretch: boolean; startW: number; startH: number; sx: number; sy: number }
  | { kind: 'label'; id: string; sx: number; sy: number; olx: number; oly: number; pointerId: number; moved: boolean }
  | { kind: 'labelsize'; id: string; pointerId: number; start: number; sy: number };

/** Draw one block body, in block units scaled to its box. */
function Body({ b, w, h, ghost }: { b: CatalogBlock | undefined; w: number; h: number; ghost?: boolean }) {
  if (!b) {
    return <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#fff" stroke={NAVY} strokeDasharray="4 3" />;
  }
  const [, , vw, vh] = b.vb.split(/\s+/).map(Number);
  if (b.png) return <image href={b.png} x={-w / 2} y={-h / 2} width={w} height={h} preserveAspectRatio="none" opacity={ghost ? 0.55 : 1} />;
  return (
    <g transform={`translate(${-w / 2} ${-h / 2}) scale(${w / (vw || 1)} ${h / (vh || 1)})`} opacity={ghost ? 0.55 : 1}
      data-block-body dangerouslySetInnerHTML={{ __html: b.body ?? '' }} />
  );
}

export const BlockLayer = forwardRef<BlockLayerHandle, BlockLayerProps>(function BlockLayer(props, ref) {
  const { items, blocks, mPerW, aspect, active, stamp, measuring, onMeasureTap, selected, onSelect, onPlace, onChange, onOpen, tags, pdfCanvas, readOnly, words } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  /** Sheet units per screen pixel — chrome is drawn in pixels. */
  const [pxSu, setPxSu] = useState(1);
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const measure = () => { const w = el.getBoundingClientRect().width; if (w > 0) setPxSu(prev => (Math.abs(prev - SU / w) < 1e-4 ? prev : SU / w)); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toSu = useCallback((clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    // ONE factor for both axes: the viewBox is SU wide and SU·aspect tall
    return { x: ((clientX - r.left) / r.width) * SU, y: ((clientY - r.top) / r.width) * SU };
  }, []);

  /** Pick 42, in the sheet's own pixels. */
  const settle = useCallback((b: Pick<CatalogBlock, 'wCm' | 'hCm'>, at: { x: number; y: number }, rot = 0): { x: number; y: number; rot: number } => {
    const c = pdfCanvas();
    if (!c || !c.width) return { ...at, rot };
    const k = c.width / SU;                       // canvas px per su
    const cmPx = suPerCm(mPerW) * k;              // canvas px per cm
    const reach = Math.max(6, Math.min(48, 25 * cmPx));   // a wall within 25 cm counts
    const half = (b.hCm / 2) * cmPx;
    const win = Math.ceil(reach + 14);
    const cx = at.x * k, cy = at.y * k;
    const x0 = Math.max(0, Math.floor(cx - win)), y0 = Math.max(0, Math.floor(cy - win));
    const x1 = Math.min(c.width, Math.ceil(cx + win)), y1 = Math.min(c.height, Math.ceil(cy + win));
    if (x1 - x0 < 4 || y1 - y0 < 4) return { ...at, rot };
    let img: ImageData;
    try { img = c.getContext('2d', { willReadFrequently: true })!.getImageData(x0, y0, x1 - x0, y1 - y0); } catch { return { ...at, rot }; }
    const hit = wallSnap(img, cx - x0, cy - y0, reach, half, 10);
    if (!hit) return { ...at, rot };
    return { x: (hit.x + x0) / k, y: (hit.y + y0) / k, rot: hit.rot };
  }, [pdfCanvas, mPerW]);

  useImperativeHandle(ref, () => ({
    suAtClient: (clientX, clientY) => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r || clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
      return toSu(clientX, clientY);
    },
    settle: (b, at) => settle(b, at),
  }), [toSu, settle]);

  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gRef = useRef<Gesture | null>(null); gRef.current = gesture;
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [labelPicked, setLabelPicked] = useState<string | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const shift = useRef(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { shift.current = e.shiftKey; };
    window.addEventListener('keydown', k); window.addEventListener('keyup', k);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('keyup', k); };
  }, []);

  const takes = active || !!stamp || !!measuring;
  const itemById = (id: string) => items.find(i => i.id === id);

  function doubleTap(id: string): boolean {
    const now = performance.now();
    const prev = lastTap.current; lastTap.current = { id, at: now };
    return !!prev && prev.id === id && now - prev.at < 380;
  }

  function onDownItem(e: React.PointerEvent, it: SketchItem) {
    if (readOnly) return;
    e.stopPropagation();
    if (stamp || measuring) return;
    onSelect(it.id); setLabelPicked(null);
    if (doubleTap(it.id)) { onOpen(it.id); return; }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = toSu(e.clientX, e.clientY);
    setGesture({ kind: 'move', id: it.id, sx: p.x, sy: p.y, ox: it.x, oy: it.y, moved: false, pointerId: e.pointerId });
  }
  function onDownRotate(e: React.PointerEvent, it: SketchItem) {
    e.stopPropagation(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setGesture({ kind: 'rotate', id: it.id, pointerId: e.pointerId });
  }
  function onDownResize(e: React.PointerEvent, it: SketchItem, stretch: boolean) {
    e.stopPropagation(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = toSu(e.clientX, e.clientY);
    setGesture({ kind: 'resize', id: it.id, pointerId: e.pointerId, stretch, startW: it.wCm, startH: it.hCm, sx: p.x, sy: p.y });
  }
  function onDownLabel(e: React.PointerEvent, it: SketchItem) {
    if (readOnly) return;
    e.stopPropagation();
    onSelect(it.id); setLabelPicked(it.id);
    if (doubleTap(`label:${it.id}`)) { onOpen(it.id); return; }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = toSu(e.clientX, e.clientY);
    setGesture({ kind: 'label', id: it.id, sx: p.x, sy: p.y, olx: it.lx, oly: it.ly, pointerId: e.pointerId, moved: false });
  }
  function onDownLabelSize(e: React.PointerEvent, it: SketchItem) {
    e.stopPropagation(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = toSu(e.clientX, e.clientY);
    setGesture({ kind: 'labelsize', id: it.id, pointerId: e.pointerId, start: it.labelScale, sy: p.y });
  }

  function onMove(e: React.PointerEvent) {
    const p = toSu(e.clientX, e.clientY);
    if (stamp) setCursor(p);
    const g = gRef.current; if (!g) return;
    const it = itemById(g.id); if (!it) return;
    if (g.kind === 'move') {
      const nx = g.ox + (p.x - g.sx), ny = g.oy + (p.y - g.sy);
      const moved = g.moved || Math.hypot(p.x - g.sx, p.y - g.sy) > 2 * pxSu;
      if (moved) { onChange(it.id, { x: nx, y: ny }); if (!g.moved) setGesture({ ...g, moved: true }); }
    } else if (g.kind === 'rotate') {
      const a = (Math.atan2(p.y - it.y, p.x - it.x) * 180) / Math.PI + 90;   // handle sits above: local −y
      onChange(it.id, { rot: shift.current ? normAngle(Math.round(a)) : snapAngle(a) });
    } else if (g.kind === 'resize') {
      const l0 = rot2(g.sx - it.x, g.sy - it.y, -it.rot), l1 = rot2(p.x - it.x, p.y - it.y, -it.rot);
      const k = suPerCm(mPerW);
      if (g.stretch) {
        let w = Math.max(5, g.startW + ((l1.x - l0.x) * 2) / k);
        const b = blocks.get(it.blockId);
        if (!shift.current && b) { const s = snapLength(b, w); if (s != null) w = s; }
        onChange(it.id, { wCm: +w.toFixed(1) });
      } else {
        const w = Math.max(3, g.startW + ((l1.x - l0.x) * 2) / k), h = Math.max(3, g.startH + ((l1.y - l0.y) * 2) / k);
        onChange(it.id, { wCm: +w.toFixed(1), hCm: +h.toFixed(1) });
      }
    } else if (g.kind === 'label') {
      const moved = g.moved || Math.hypot(p.x - g.sx, p.y - g.sy) > 2 * pxSu;
      if (moved) { onChange(it.id, { lx: g.olx + (p.x - g.sx), ly: g.oly + (p.y - g.sy) }); if (!g.moved) setGesture({ ...g, moved: true }); }
    } else if (g.kind === 'labelsize') {
      const s = Math.max(0.5, Math.min(4, g.start + (p.y - g.sy) / (40 * pxSu)));
      onChange(it.id, { labelScale: +s.toFixed(2) });
    }
  }
  function onUp() {
    const g = gRef.current; if (!g) return;
    setGesture(null);
    const it = itemById(g.id); if (!it) return;
    if (g.kind === 'move' && g.moved) {
      // letting go: the nearest wall, facing the room — or exactly where it was put
      const s = settle(it, { x: it.x, y: it.y }, it.rot);
      if (s.x !== it.x || s.y !== it.y || s.rot !== it.rot) onChange(it.id, s);
    }
  }
  function onDownEmpty(e: React.PointerEvent) {
    if (readOnly) return;
    const p = toSu(e.clientX, e.clientY);
    if (measuring) { onMeasureTap?.(p); return; }
    if (stamp) { onPlace(stamp, settle(stamp, p)); setCursor(p); return; }
    onSelect(null); setLabelPicked(null);
  }

  const H = SU * aspect;
  const hs = 9 * pxSu;          // handle radius, px → su
  const sel = selected ? itemById(selected) : undefined;

  return (
    <svg ref={svgRef} data-block-layer viewBox={`0 0 ${SU} ${H}`} className="absolute inset-0 w-full h-full"
      /* The ROOT never takes the pointer: the studio's own Move tool must still
         reach the ink marks under this layer. Only the blocks, their chrome and
         — while stamping or measuring — a catch-plate over the whole sheet do. */
      style={{ pointerEvents: 'none', touchAction: 'none', overflow: 'visible' }}
      onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onPointerLeave={() => setCursor(null)}>
      {(stamp || measuring) && !readOnly && (
        <rect data-catch-plate x={0} y={0} width={SU} height={H} fill="rgba(255,255,255,0.01)" style={{ pointerEvents: 'auto', cursor: stamp ? 'copy' : 'crosshair' }} onPointerDown={onDownEmpty} />
      )}
      <style>{`[data-block-body] * { vector-effect: non-scaling-stroke; } [data-block-layer] text { font-family: ui-sans-serif, system-ui, sans-serif; }`}</style>
      {items.map(it => {
        const b = blocks.get(it.blockId);
        const { w, h } = itemBox(it, mPerW);
        const tag = tags.get(it.id);
        const isSel = it.id === selected;
        const fs = 11 * pxSu * it.labelScale;
        const label = blockLabel(it, tag);
        const flip = it.lx < 0;
        // the leader leaves the block's edge, not its centre
        const dir = rot2(it.lx, it.ly, -it.rot);
        const tEdge = Math.min(Math.abs(dir.x) > 1e-6 ? (w / 2) / Math.abs(dir.x) : 1e9, Math.abs(dir.y) > 1e-6 ? (h / 2) / Math.abs(dir.y) : 1e9);
        const edge = tEdge < 1 ? rot2(dir.x * tEdge, dir.y * tEdge, it.rot) : { x: 0, y: 0 };
        const labelW = label.length * fs * 0.56;
        return (
          <g key={it.id} data-item={it.id} data-item-cat={it.cat}>
            <g transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`}
              onPointerDown={e => onDownItem(e, it)}
              style={{ cursor: takes && !stamp ? 'move' : undefined, pointerEvents: active && !stamp && !measuring ? 'auto' : 'none' }}>
              {/* an invisible plate so the whole block, not only its ink, takes the press */}
              <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="rgba(255,255,255,0.01)" stroke="none" />
              <Body b={b} w={w} h={h} />
              {it.unit && connectionDots({ w, h }, it.sub, it.cat).map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={(d.kind === 'outlet' ? 3.2 : 2.6) * pxSu} fill={d.kind === 'outlet' ? '#0891b2' : ACCENT} stroke="#fff" strokeWidth={pxSu} data-connection-dot={d.kind} />
              ))}
              {tag && (
                <g data-unit-tag>
                  <rect x={-fs * 0.85 * Math.max(2, tag.length) / 2 - 2 * pxSu} y={-fs * 0.7} width={fs * 0.85 * Math.max(2, tag.length) + 4 * pxSu} height={fs * 1.4} rx={3 * pxSu} fill="#fff" stroke={NAVY} strokeWidth={pxSu} />
                  <text x={0} y={fs * 0.4} textAnchor="middle" fontSize={fs * 1.1} fontWeight={800} fill={NAVY}>{tag}</text>
                </g>
              )}
              {isSel && <rect x={-w / 2 - 2 * pxSu} y={-h / 2 - 2 * pxSu} width={w + 4 * pxSu} height={h + 4 * pxSu} fill="none" stroke={ACCENT} strokeWidth={1.5 * pxSu} strokeDasharray={`${5 * pxSu} ${4 * pxSu}`} />}
            </g>
            {!it.labelHidden && (
              <g data-item-label={it.id} style={{ pointerEvents: active && !stamp && !measuring ? 'auto' : 'none', cursor: 'move' }}
                onPointerDown={e => onDownLabel(e, it)}>
                <line x1={it.x + edge.x} y1={it.y + edge.y} x2={it.x + it.lx} y2={it.y + it.ly} stroke={NAVY} strokeWidth={0.8 * pxSu} />
                <text x={it.x + it.lx} y={it.y + it.ly} fontSize={fs} fontWeight={700} fill={NAVY} textAnchor={flip ? 'end' : 'start'}
                  stroke="#fff" strokeWidth={3 * pxSu} paintOrder="stroke" style={{ direction: /[֐-׿]/.test(label) ? 'rtl' : 'ltr', unicodeBidi: 'plaintext' }}>{label}</text>
                {isSel && labelPicked === it.id && (
                  <rect x={flip ? it.x + it.lx - labelW : it.x + it.lx} y={it.y + it.ly - fs} width={labelW} height={fs * 1.3} fill="none" stroke={ACCENT} strokeWidth={pxSu} strokeDasharray={`${3 * pxSu} ${3 * pxSu}`} />
                )}
              </g>
            )}
          </g>
        );
      })}

      {/* the selection's chrome, on top of everything */}
      {sel && !readOnly && active && !stamp && !measuring && (() => {
        const b = blocks.get(sel.blockId);
        const { w, h } = itemBox(sel, mPerW);
        const stretch = !!b?.stretch;
        const canResize = !sel.locked || stretch;
        const top = rot2(0, -h / 2 - 26 * pxSu, sel.rot);
        const corner = rot2(w / 2, h / 2, sel.rot);
        const lockAt = rot2(w / 2, -h / 2, sel.rot);
        const fs = 11 * pxSu * sel.labelScale;
        const flip = sel.lx < 0;
        const labelW = blockLabel(sel, tags.get(sel.id)).length * fs * 0.56;
        return (
          // pointer-events is INHERITED in SVG: the root says none, so the chrome must say auto itself
          <g data-item-chrome style={{ pointerEvents: 'auto' }}>
            {/* the round turn handle above the block (pick 43) */}
            <line x1={sel.x + rot2(0, -h / 2, sel.rot).x} y1={sel.y + rot2(0, -h / 2, sel.rot).y} x2={sel.x + top.x} y2={sel.y + top.y} stroke={ACCENT} strokeWidth={pxSu} />
            <circle data-rotate-handle cx={sel.x + top.x} cy={sel.y + top.y} r={hs} fill="#fff" stroke={ACCENT} strokeWidth={2 * pxSu}
              style={{ cursor: 'grab' }} onPointerDown={e => onDownRotate(e, sel)}>
              <title>{words.turn}</title>
            </circle>
            <text x={sel.x + top.x} y={sel.y + top.y + 3.5 * pxSu} textAnchor="middle" fontSize={10 * pxSu} fill={NAVY} style={{ pointerEvents: 'none' }}>↻</text>
            {/* the padlock (pick 19) */}
            <g data-lock={sel.locked ? '1' : '0'} transform={`translate(${sel.x + lockAt.x} ${sel.y + lockAt.y})`} style={{ cursor: 'pointer' }}
              onPointerDown={e => { e.stopPropagation(); onChange(sel.id, { locked: !sel.locked }); }}>
              <title>{sel.locked ? words.locked : words.unlocked}</title>
              <circle r={hs} fill={sel.locked ? '#fff' : '#fde68a'} stroke={sel.locked ? NAVY : '#b45309'} strokeWidth={1.5 * pxSu} />
              <text y={3.5 * pxSu} textAnchor="middle" fontSize={10 * pxSu} style={{ pointerEvents: 'none' }}>{sel.locked ? '🔒' : '🔓'}</text>
            </g>
            {/* the corner: length for a grille, free size when unlocked */}
            {canResize && (
              <rect data-resize-handle={stretch ? 'stretch' : 'free'} x={sel.x + corner.x - hs * 0.8} y={sel.y + corner.y - hs * 0.8} width={hs * 1.6} height={hs * 1.6} rx={2 * pxSu}
                fill="#fff" stroke={ACCENT} strokeWidth={2 * pxSu} style={{ cursor: stretch ? 'ew-resize' : 'nwse-resize' }}
                onPointerDown={e => onDownResize(e, sel, stretch)}>
                <title>{stretch ? words.stretch : words.resize}</title>
              </rect>
            )}
            {/* the label's own bar: flip · hide (pick 49) and its corner */}
            {labelPicked === sel.id && !sel.labelHidden && (() => {
              const lx = sel.x + sel.lx, ly = sel.y + sel.ly;
              const bx = flip ? lx - labelW : lx;
              return (
                <g data-label-bar>
                  <g transform={`translate(${bx} ${ly - fs - 16 * pxSu})`}>
                    <rect width={44 * pxSu} height={14 * pxSu} rx={3 * pxSu} fill={NAVY} />
                    <text data-label-flip x={11 * pxSu} y={10.5 * pxSu} textAnchor="middle" fontSize={10 * pxSu} fill="#fff" style={{ cursor: 'pointer' }}
                      onPointerDown={e => { e.stopPropagation(); onChange(sel.id, { lx: -sel.lx }); }}><title>{words.flipLabel}</title>⇋</text>
                    <text data-label-hide x={33 * pxSu} y={10.5 * pxSu} textAnchor="middle" fontSize={10 * pxSu} fill="#fff" style={{ cursor: 'pointer' }}
                      onPointerDown={e => { e.stopPropagation(); onChange(sel.id, { labelHidden: true }); setLabelPicked(null); }}><title>{words.hideLabel}</title>✕</text>
                  </g>
                  <rect data-label-size x={bx + labelW - hs * 0.7} y={ly + fs * 0.3 - hs * 0.7} width={hs * 1.4} height={hs * 1.4} rx={2 * pxSu}
                    fill="#fff" stroke={ACCENT} strokeWidth={2 * pxSu} style={{ cursor: 'ns-resize' }} onPointerDown={e => onDownLabelSize(e, sel)} />
                </g>
              );
            })()}
            {sel.labelHidden && (
              <text data-label-show x={sel.x + rot2(w / 2 + 6 * pxSu, 0, sel.rot).x} y={sel.y + rot2(w / 2 + 6 * pxSu, 0, sel.rot).y} fontSize={10 * pxSu} fill={ACCENT} fontWeight={700} style={{ cursor: 'pointer' }}
                onPointerDown={e => { e.stopPropagation(); onChange(sel.id, { labelHidden: false }); }}>{words.showLabel}</text>
            )}
          </g>
        );
      })()}

      {/* the block on the cursor (pick 46) */}
      {stamp && cursor && (() => {
        const k = suPerCm(mPerW);
        return (
          <g data-stamp-ghost transform={`translate(${cursor.x} ${cursor.y})`} style={{ pointerEvents: 'none' }}>
            <Body b={stamp} w={stamp.wCm * k} h={stamp.hCm * k} ghost />
          </g>
        );
      })()}

      {/* the two taps */}
      {measuring?.map((p, i) => (
        <g key={i} data-measure-tap style={{ pointerEvents: 'none' }}>
          <circle cx={p.x} cy={p.y} r={6 * pxSu} fill="none" stroke="#dc2626" strokeWidth={2 * pxSu} />
          <circle cx={p.x} cy={p.y} r={1.5 * pxSu} fill="#dc2626" />
        </g>
      ))}
      {measuring && measuring.length === 2 && (
        <line x1={measuring[0].x} y1={measuring[0].y} x2={measuring[1].x} y2={measuring[1].y} stroke="#dc2626" strokeWidth={1.5 * pxSu} strokeDasharray={`${4 * pxSu} ${3 * pxSu}`} style={{ pointerEvents: 'none' }} />
      )}
    </svg>
  );
});
