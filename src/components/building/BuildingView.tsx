/**
 * THE BUILDING VIEW (owner, recording 2026-11-02): a second view of a Wolfson
 * building, beside the board — "a square diagram of a building with semi
 * see-through floors where when we scroll up it kind of moves through the
 * floors", each floor "lands in", the apartments drawn in their TRUE shape,
 * the floor number big in the middle, and "when I hover … it lights up a bit
 * along with the information box on the side" (his red boxes in the four
 * corners). A press opens the apartment.
 *
 * The floors are a stack of plates in one 3D scene. The motion is a spring
 * run in requestAnimationFrame that writes each plate's transform straight to
 * the DOM — never React state per frame (a re-render per frame is the
 * documented smoulder). React state changes only when the hovered flat or the
 * landed floor changes.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Apartment, Stage } from '../../types';
import { realName } from '../../data/aptSale';
import {
  CARD_CORNER, CORE, CORE_PH, PH_DRAWING, isPenthouseShape, LABEL_AT, LEVEL_FLOORS, STRIP, zoneFor, PLAN_BOX, SHAPES, pathOf, shapesOf, stripFor, type ShapeKey, type LowerLevel,
} from './wolfsonPlan';
import './buildingView.css';

export interface BuildingViewWords {
  floor: string;
  notSold: string;
  notStarted: string;
  upgraded: string;
  open: string;
  floorsHint: string;
  apt: string;
  joinedWith: string;
}
const EN: BuildingViewWords = {
  floor: 'Floor', notSold: 'Not sold', notStarted: 'Not started', upgraded: 'Upgraded',
  open: 'Open', floorsHint: 'Scroll to move between floors', apt: 'Apt', joinedWith: 'Joined with',
};

export interface BuildingViewProps {
  /** One building's flats (blank placeholders are left out here). */
  apartments: Apartment[];
  stages: Stage[];
  onOpen: (apt: Apartment) => void;
  words?: Partial<BuildingViewWords>;
  /** The floor it opens on; the top floor when absent. */
  initialFloor?: number;
  /** The number the board prints on each floor (record floor → label), so both views agree. */
  floorLabels?: Record<number, string>;
  /**
   * The typical floor's own drawing — walls, doors, windows, furniture —
   * taken off the architects' plan in the plan's units (PLAN_BOX), laid on
   * every typical floor (owner, 2026-11-03: "add like walls, doors, windows,
   * and a little bit of furniture"). The set-back penthouse floor has its own
   * rooms, so it is drawn without it.
   */
  interiorSrc?: string;
  /**
   * Several buildings moving as one (owner, 2026-11-03: on All, "all three of
   * them on one screen … let's make it scroll together"): they share one
   * FloorBus, so a wheel over any of them moves all of them.
   */
  bus?: FloorBus;
  /** Small, beside its neighbours: no corner cards and no rail — one card for the flat under the pointer. */
  compact?: boolean;
  /** The building's name, drawn over it when compact. */
  title?: string;
  /** The shared levels under the towers, bottom first; this tower's own slice is lit, the rest grey. */
  lower?: LowerLevel[];
  /** Which tower this is (0 = A1), for where it stands on the shared levels. */
  tower?: number;
  /** In the trio the shared levels are drawn ONCE, wide, under the three — the tower leaves them out. */
  hideLower?: boolean;
}

/** The floor in view, shared: a fractional index into the floors, bottom = 0. */
export interface FloorBus {
  get(): number;
  set(v: number): void;
  subscribe(fn: (v: number) => void): () => void;
}
export function makeFloorBus(start: number): FloorBus {
  let v = start; const fns = new Set<(v: number) => void>();
  return {
    get: () => v,
    set: (n: number) => { if (n === v) return; v = n; fns.forEach(f => f(n)); },
    subscribe: fn => { fns.add(fn); return () => { fns.delete(fn); }; },
  };
}

/** A stack spring that overshoots a hair and settles — "it lands in". */
const K = 150, C = 19;
const GAP = 92;                 // px between plates along the stack
const ABOVE_SHOWN = 1, BELOW_SHOWN = 6;

interface FloorRow { floor: number; flats: { apt: Apartment; shapes: ShapeKey[] }[]; lower?: LowerLevel; slots?: Apartment[] }

/** A slot's name as the board shows it (the office's label, else its number). */
export function slotName(a: Apartment): string { return (a.displayName || '').trim() || (a.apartmentNumber || '').trim(); }
/** The board's slots on a lower level: records on that level's floors that carry a name. */
export function slotsOn(apartments: Apartment[], level: string): Apartment[] {
  const fl = LEVEL_FLOORS[level] ?? [];
  return apartments.filter(a => fl.includes(a.floor) && !a.coveredBy && !!(a.displayName || '').trim())
    .sort((x, y) => (x.colPosition ?? 0) - (y.colPosition ?? 0));
}

/** A typical floor: four flats, none of them a penthouse half. */
function isTypical(row: FloorRow): boolean {
  return !row.lower && row.flats.every(f => f.shapes.every(k => k === 'A' || k === 'B' || k === 'C1' || k === 'C2'));
}
/** A penthouse floor's own drawing, when it is one. */
function phDrawing(row: FloorRow): string | undefined {
  for (const f of row.flats) for (const k of f.shapes) if (isPenthouseShape(k)) return PH_DRAWING[k];
  return undefined;
}
function coreOf(row: FloorRow): [number, number][] {
  return phDrawing(row) ? CORE_PH : CORE.outline;
}

/** The floor's own outline: a typical floor is all four flats; the set-back top floor only what its flats cover. */
function slabOf(row: FloorRow): ShapeKey[] {
  const used = row.flats.flatMap(f => f.shapes);
  return used.some(k => k === 'WL' || k === 'WR' || isPenthouseShape(k)) ? used : ['A', 'B', 'C1', 'C2'];
}

export default function BuildingView({ apartments, stages, onOpen, words, initialFloor, floorLabels, interiorSrc, bus: sharedBus, compact, title, lower, tower = 0, hideLower }: BuildingViewProps) {
  const lab = (f: number, row?: FloorRow) => row?.lower ? row.lower.label : floorLabels?.[f] || String(f);
  const w = { ...EN, ...words };
  const stageById = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages]);

  const floors: FloorRow[] = useMemo(() => {
    const by = new Map<number, FloorRow>();
    for (const apt of apartments) {
      if (apt.isUnnamed || apt.coveredBy || !apt.apartmentNumber) continue;
      const row = by.get(apt.floor) ?? { floor: apt.floor, flats: [] };
      row.flats.push({ apt, shapes: shapesOf(apt) });
      by.set(apt.floor, row);
    }
    const towers = [...by.values()].sort((a, b) => a.floor - b.floor);
    const low = (lower ?? []).map((l, i) => ({ floor: -1000 + i, flats: [], lower: l, slots: slotsOn(apartments, l.key) } as FloorRow));
    return [...low, ...towers];
  }, [apartments, lower]);

  const topIdx = floors.length - 1;
  const startIdx = useMemo(() => {
    const i = initialFloor == null ? -1 : floors.findIndex(f => f.floor === initialFloor);
    return i >= 0 ? i : topIdx;
  }, [floors, initialFloor, topIdx]);

  // The landed floor (an index into `floors`) — state, because the cards read it.
  const [landed, setLanded] = useState(startIdx);
  const [hover, setHover] = useState<string | null>(null);
  const target = useRef(startIdx);
  const pos = useRef(startIdx);
  const vel = useRef(0);
  const plates = useRef<(HTMLDivElement | null)[]>([]);
  const raf = useRef(0);
  const last = useRef(0);

  const paint = useCallback(() => {
    const p = pos.current;
    plates.current.forEach((el, i) => {
      if (!el) return;
      const o = i - p; // > 0 above the floor in view
      const shown = o > ABOVE_SHOWN + 0.5 || o < -(BELOW_SHOWN + 0.5) ? 0 : 1;
      // The landed floor solid; below it a fading, see-through stack; above it
      // the next floors only as a faint glass so they never hide this one.
      const op = !shown ? 0
        : o <= 0 ? Math.max(0.12, 1 - 0.2 * -o)
        : o < 1 ? 1 - 0.93 * o
        : 0.07;
      el.style.transform = `translate3d(0,0,${o * GAP}px) scale(${1 + Math.max(0, o) * 0.03})`;
      el.style.opacity = op.toFixed(3);
      el.style.visibility = op < 0.01 ? 'hidden' : 'visible';
      el.dataset.solid = Math.abs(o) < 0.5 ? '1' : '0';
    });
  }, []);

  const step = useCallback((t: number) => {
    const dt = Math.min(0.033, last.current ? (t - last.current) / 1000 : 0.016);
    last.current = t;
    const a = K * (target.current - pos.current) - C * vel.current;
    vel.current += a * dt;
    pos.current += vel.current * dt;
    paint();
    if (Math.abs(target.current - pos.current) < 0.0015 && Math.abs(vel.current) < 0.002) {
      pos.current = target.current; vel.current = 0; paint();
      raf.current = 0; last.current = 0;
      return;
    }
    raf.current = requestAnimationFrame(step);
  }, [paint]);

  // The ONE floor in view lives on the bus (this view's own when none is shared).
  const ownBus = useMemo(() => makeFloorBus(startIdx), []); // eslint-disable-line react-hooks/exhaustive-deps
  const bus = sharedBus ?? ownBus;
  useEffect(() => bus.subscribe(v => {
    const t2 = Math.max(0, Math.min(topIdx, v));
    target.current = t2;
    const r = Math.round(t2);
    setLanded(l => (l === r ? l : r));
    if (!raf.current) raf.current = requestAnimationFrame(step);
  }), [bus, step, topIdx]);
  useEffect(() => { const v = bus.get(); target.current = pos.current = Math.max(0, Math.min(topIdx, v)); setLanded(Math.round(target.current)); paint(); }, [bus, topIdx, paint]);

  const go = useCallback((idx: number) => {
    setHover(null);
    bus.set(Math.max(0, Math.min(topIdx, Math.round(idx))));
  }, [bus, topIdx]);

  /**
   * The wheel GLIDES (owner, 2026-11-03: "how do we make it work a bit less
   * stucky?"): a trackpad moves the stack with the fingers, a mouse notch is
   * one floor, and the moment the hand rests the stack settles on the nearest
   * floor. Never the page underneath while the pointer is over the building.
   */
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let settle = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cur = bus.get();
      const notch = e.deltaMode === 1 || Math.abs(e.deltaY) >= 50;
      const next = notch
        ? Math.round(cur) + (e.deltaY < 0 ? 1 : -1)          // up the wheel = up the building
        : cur - e.deltaY / 110;
      bus.set(Math.max(0, Math.min(topIdx, next)));
      setHover(null);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => bus.set(Math.max(0, Math.min(topIdx, Math.round(bus.get())))), 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); window.clearTimeout(settle); };
  }, [bus, topIdx]);

  // A finger drags the stack with it (80px a floor) and lets go onto the nearest floor.
  const touch = useRef<{ y: number; from: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    touch.current = { y: e.clientY, from: bus.get() };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const t2 = touch.current;
    if (!t2) return;
    bus.set(Math.max(0, Math.min(topIdx, t2.from + (e.clientY - t2.y) / 80)));
  };
  const onPointerUp = () => { if (touch.current) bus.set(Math.round(bus.get())); touch.current = null; };

  // Keys: ↑ ↓, Page Up/Down, Home/End.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key, cur = Math.round(bus.get());
    if (k === 'ArrowUp' || k === 'PageUp') { e.preventDefault(); go(cur + 1); }
    else if (k === 'ArrowDown' || k === 'PageDown') { e.preventDefault(); go(cur - 1); }
    else if (k === 'Home') { e.preventDefault(); go(topIdx); }
    else if (k === 'End') { e.preventDefault(); go(0); }
  };

  /**
   * Joined apartments (owner, 2026-11-03: "connected apartments need to show
   * hovering together … they both need to show it like connected"): a hover on
   * either lights both, and both carry the join.
   */
  const partner = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of apartments) if (a.mergedWith) { m.set(a.id, a.mergedWith); m.set(a.mergedWith, a.id); }
    return m;
  }, [apartments]);
  const lit = (id: string) => !!hover && (hover === id || partner.get(hover) === id);
  const numOf = useMemo(() => new Map(apartments.map(a => [a.id, a.apartmentNumber])), [apartments]);

  const here = floors[landed];
  const flatInfo = (apt: Apartment) => {
    const st = apt.currentStageId ? stageById.get(apt.currentStageId) : undefined;
    const name = realName(apt);
    return { st, name };
  };
  const fillOf = (apt: Apartment) => {
    const { st, name } = flatInfo(apt);
    if (!name) return { fill: '#ffffff', tint: '#cbd5e1', dashed: true };
    return { fill: st?.color ?? '#94a3b8', tint: st?.color ?? '#94a3b8', dashed: false };
  };

  if (!floors.length) return null;

  return (
    <div className={`bv-root${compact ? ' bv-compact' : ''}`} data-building-view={title ?? ''}>
      {compact && title && <div className="bv-title">{title}</div>}
      <div
        ref={stageRef}
        className="bv-stage"
        tabIndex={0}
        role="group"
        aria-label={`${w.floor} ${here ? lab(here.floor, here) : ''}`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="bv-world">
          {floors.map((row, i) => (
            <div
              key={row.floor}
              ref={el => { plates.current[i] = el; }}
              className="bv-plate"
              data-floor={row.floor}
              data-current={i === landed ? '1' : '0'}
            >
              {row.lower ? (hideLower ? null : (() => {
                const s = stripFor(tower);
                return (
                  <svg viewBox={`${PLAN_BOX.x} ${PLAN_BOX.y} ${PLAN_BOX.w} ${PLAN_BOX.h}`} className="bv-svg bv-lower" data-lower={row.lower.key}>
                    <clipPath id={`bv-slice-${tower}-${row.lower.key}`}><rect x={s.sliceX} y={s.y} width={s.sliceW} height={s.h} /></clipPath>
                    <rect className="bv-lower-ground" x={s.x} y={s.y} width={s.w} height={s.h} />
                    <image href={row.lower.src} x={s.x} y={s.y} width={s.w} height={s.h} opacity={0.22} preserveAspectRatio="none" />
                    <rect className="bv-lower-mine" x={s.sliceX} y={s.y} width={s.sliceW} height={s.h} />
                    <image href={row.lower.src} x={s.x} y={s.y} width={s.w} height={s.h} preserveAspectRatio="none"
                      clipPath={`url(#bv-slice-${tower}-${row.lower.key})`} />
                    {/* The board's own slots on this level: its named area lit, the name a press that opens it. */}
                    {(row.slots ?? []).map((a, j) => {
                      const z = zoneFor(row.lower!.key, slotName(a), tower);
                      const dx = s.x - STRIP.x, dy = s.y - STRIP.y;
                      const on = hover === a.id && i === landed;
                      const cx = z ? (z[0] + z[2]) / 2 + dx : 555;
                      const cy = z ? (z[1] + z[3]) / 2 + dy - 40 + (j % 2) * 0 : 600 + j * 62;
                      return (
                        <g key={a.id} className="bv-slot" data-slot={a.id} data-on={on ? '1' : '0'} data-zone={z ? '1' : '0'}
                          onPointerEnter={() => i === landed && setHover(a.id)} onPointerLeave={() => setHover(h => (h === a.id ? null : h))}
                          onClick={() => i === landed && onOpen(a)}>
                          {z && <rect className="bv-zone" x={z[0] + dx} y={z[1] + dy} width={z[2] - z[0]} height={z[3] - z[1]} rx={18} />}
                          <SlotChip x={cx} y={cy} name={slotName(a)} />
                        </g>
                      );
                    })}
                    {!(row.slots ?? []).length && <text x={555} y={470} className="bv-floor-no">{row.lower.label}</text>}
                  </svg>
                );
              })()) : (
              <svg viewBox={`${PLAN_BOX.x} ${PLAN_BOX.y} ${PLAN_BOX.w} ${PLAN_BOX.h}`} className="bv-svg">
                <path className="bv-slab" d={slabOf(row).map(k => pathOf(SHAPES[k])).join(' ') + ' ' + pathOf(coreOf(row))} />
                <g className="bv-core" data-plain={(interiorSrc && isTypical(row)) || phDrawing(row) ? '0' : '1'}>
                  <path d={pathOf(coreOf(row))} />
                  {CORE.stairs.map(([x, y, sw, sh], j) => (
                    <g key={j}>
                      <rect x={x} y={y} width={sw} height={sh} className="bv-stair" />
                      {Array.from({ length: 9 }, (_, n) => (
                        <line key={n} x1={x} x2={x + sw} y1={y + (n + 1) * sh / 10} y2={y + (n + 1) * sh / 10} className="bv-tread" />
                      ))}
                    </g>
                  ))}
                  {CORE.lifts.map(([x, y, lw, lh], j) => (
                    <g key={j} className="bv-lift">
                      <rect x={x} y={y} width={lw} height={lh} />
                      <path d={`M${x} ${y}L${x + lw} ${y + lh}M${x + lw} ${y}L${x} ${y + lh}`} />
                    </g>
                  ))}
                </g>
                {row.flats.map(({ apt, shapes }) => {
                  const f = fillOf(apt);
                  const on = lit(apt.id) && i === landed;
                  const joined = partner.has(apt.id);
                  const [lx, ly] = LABEL_AT[shapes[0]];
                  return (
                    <g
                      key={apt.id}
                      className="bv-flat"
                      data-apt={apt.id}
                      data-on={on ? '1' : '0'}
                      data-unsold={f.dashed ? '1' : '0'}
                      data-joined={joined ? '1' : undefined}
                      style={{ ['--bv-c' as string]: f.tint }}
                      onPointerEnter={() => i === landed && setHover(apt.id)}
                      onPointerLeave={() => setHover(h => (h === apt.id ? null : h))}
                      onClick={() => i === landed && onOpen(apt)}
                    >
                      {shapes.map(s => <path key={s} d={pathOf(SHAPES[s])} />)}
                      <text x={lx} y={ly} className="bv-flat-no">{apt.apartmentNumber}</text>
                      {/* The tipus and the upgrade "U" lie on the plan beside the number, like on the board's tile (owner, 2026-11-03). */}
                      {(() => {
                        const tip = (apt.tipus ?? '').trim();
                        const up = apt.classification === 'shinui';
                        const nW = String(apt.apartmentNumber).length * 27;
                        let x = lx + nW / 2 + 14;
                        const parts: React.ReactNode[] = [];
                        if (tip) {
                          const w2 = Math.max(56, tip.length * 26 + 24);
                          parts.push(
                            <g key="t" className="bv-flat-tip" data-flat-tipus>
                              <rect x={x} y={ly - 24} width={w2} height={48} rx={10} />
                              <text x={x + w2 / 2} y={ly}>{tip}</text>
                            </g>);
                          x += w2 + 10;
                        }
                        if (up) parts.push(
                          <g key="u" className="bv-flat-u" data-flat-upgraded>
                            <rect x={x} y={ly - 24} width={56} height={48} rx={14} />
                            <text x={x + 28} y={ly + 1}>U</text>
                          </g>);
                        return parts;
                      })()}
                    </g>
                  );
                })}
                {phDrawing(row) && (
                  <g className="bv-interior" pointerEvents="none">
                    <image href={phDrawing(row)} x={PLAN_BOX.x} y={PLAN_BOX.y} width={PLAN_BOX.w} height={PLAN_BOX.h} preserveAspectRatio="none" />
                  </g>
                )}
                {interiorSrc && isTypical(row) && (
                  <g className="bv-interior" pointerEvents="none">
                    <clipPath id={`bv-clip-${row.floor}`}><path d={slabOf(row).map(k => pathOf(SHAPES[k])).join(' ') + ' ' + pathOf(CORE.outline)} /></clipPath>
                    <image href={interiorSrc} x={PLAN_BOX.x} y={PLAN_BOX.y} width={PLAN_BOX.w} height={PLAN_BOX.h}
                      clipPath={`url(#bv-clip-${row.floor})`} preserveAspectRatio="none" />
                  </g>
                )}
                <text x={555} y={470} className="bv-floor-no">{lab(row.floor)}</text>
              </svg>
              )}
            </div>
          ))}
        </div>

        {/* His red boxes: one card per flat of the landed floor, in its corner. */}
        {here && here.flats.filter(f => !compact || lit(f.apt.id)).map(({ apt, shapes }) => {
          const { st, name } = flatInfo(apt);
          const on = lit(apt.id);
          const mate = partner.get(apt.id);
          return (
            <button
              key={`${here.floor}-${apt.id}`}
              type="button"
              className={`bv-card bv-${compact ? 'tl' : CARD_CORNER[shapes[0]]}`}
              data-card={apt.id}
              data-on={on ? '1' : '0'}
              style={{ ['--bv-c' as string]: st?.color ?? '#94a3b8' }}
              onPointerEnter={() => setHover(apt.id)}
              onPointerLeave={() => setHover(h => (h === apt.id ? null : h))}
              onFocus={() => setHover(apt.id)}
              onBlur={() => setHover(h => (h === apt.id ? null : h))}
              onClick={() => onOpen(apt)}
            >
              <span className="bv-card-top">
                <span className="bv-card-no">{apt.apartmentNumber}</span>
                {apt.tipus && <span className="bv-card-tip">{apt.tipus}</span>}
                {apt.classification === 'shinui' && <span className="bv-card-u" title={w.upgraded}>U</span>}
              </span>
              {mate && <span className="bv-card-joined" data-card-joined>{w.joinedWith} {numOf.get(mate)}</span>}
              <span className={`bv-card-name${name ? '' : ' bv-muted'}`}><bdi>{name || w.notSold}</bdi></span>
              <span className="bv-card-stage">
                <span className="bv-dot" />
                <span>{st?.name ?? w.notStarted}</span>
              </span>
              <span className="bv-card-open">{w.open} →</span>
            </button>
          );
        })}
      </div>

      {/* The floors, top to bottom — a press goes straight there. */}
      {!compact && <nav className="bv-rail" aria-label={w.floor}>
        {[...floors].reverse().map(row => {
          const i = floors.indexOf(row);
          return (
            <button key={row.floor} type="button" data-rail-floor={lab(row.floor, row)}
              className="bv-rail-btn" data-on={i === landed ? '1' : '0'} onClick={() => go(i)}>
              {lab(row.floor, row)}
            </button>
          );
        })}
      </nav>}
    </div>
  );
}

/** A slot's name on a lower level, as a pill (plan units). */
export function SlotChip({ x, y, name, size = 34 }: { x: number; y: number; name: string; size?: number }) {
  const w = Math.max(size * 3, name.length * size * 0.62 + size * 1.2), h = size * 1.6;
  return (
    <g className="bv-chip">
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} />
      <text x={x} y={y} style={{ fontSize: size }}>{name}</text>
    </g>
  );
}
