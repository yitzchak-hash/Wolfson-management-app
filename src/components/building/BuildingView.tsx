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
import { isStartStage } from '../../data/stageMarks';
import { crewOf, acCompanyOf, isCompanyButton, isWallButton, DEFAULT_AC_COMPANY } from '../../data/aptCrew';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Apartment, Stage, CustomButton } from '../../types';
import { realName } from '../../data/aptSale';
import { haptic, hapticOnLift } from '../../data/haptics';
import { LEVEL_FLOORS, STRIP, zoneFor, PLAN_BOX, pathOf, stripFor, type LowerLevel } from './wolfsonPlan';
import { WOLFSON_PLAN, type BuildingPlan, type FloorSpec } from './buildingPlan';
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
  yes: string;
  no: string;
  unknown: string;
}
const EN: BuildingViewWords = {
  floor: 'Floor', notSold: 'Not sold', notStarted: 'Not started', upgraded: 'Upgraded',
  open: 'Open', floorsHint: 'Scroll to move between floors', apt: 'Apt', joinedWith: 'Joined with', yes: 'Yes', no: 'No', unknown: "Don't know",
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
  /** The standard-plan button (owner, 2026-11-10): under the title in the trio, a bubble on top of one building. */
  planSlot?: (floor: { key: string; label: string }) => React.ReactNode;
  /** The shared levels under the towers, bottom first; this tower's own slice is lit, the rest grey. */
  lower?: LowerLevel[];
  /**
   * The project's own buttons (owner, video 2026-11-03: "we want to see wall
   * yes, wall no … between the C1 and the U") — each flat's answers ride on
   * its floor tag and its card.
   */
  customButtons?: CustomButton[];
  /** Which tower this is (0 = A1), for where it stands on the shared levels. */
  tower?: number;
  /** In the trio the shared levels are drawn ONCE, wide, under the three — the tower leaves them out. */
  hideLower?: boolean;
  /** The project's plan — Wolfson's when none is given (Netiv's for Netiv; buildingPlan.ts). */
  plan?: BuildingPlan;
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

interface FloorRow { floor: number; flats: { apt: Apartment; shapes: string[] }[]; lower?: LowerLevel; slots?: Apartment[] }

/** A slot's name as the board shows it (the office's label, else its number). */
export function slotName(a: Apartment): string { return (a.displayName || '').trim() || (a.apartmentNumber || '').trim(); }
/** The board's slots on a lower level: records on that level's floors that carry a name. */
export function slotsOn(apartments: Apartment[], level: string): Apartment[] {
  const fl = LEVEL_FLOORS[level] ?? [];
  return apartments.filter(a => fl.includes(a.floor) && !a.coveredBy && !!(a.displayName || '').trim())
    .sort((x, y) => (x.colPosition ?? 0) - (y.colPosition ?? 0));
}

/** A floor the board names in words ("Ground / Commercial") by its first word, so the rail and the plate stay narrow. */
export function shortFloor(full: string): string {
  return full.length <= 4 ? full : (full.split(/\s*[/·,]\s*|\s+/)[0] || full);
}

/** A floor row as the plan reads it. */
function planRow(row: FloorRow) {
  return { floor: row.floor, keys: row.flats.flatMap(f => f.shapes), nums: row.flats.map(f => Number(f.apt.apartmentNumber)) };
}
/** Every outline of the floor (rooms, then their terraces) and its core, as one path. */
function slabPath(plan: BuildingPlan, spec: FloorSpec): string {
  return spec.slab.flatMap(k => [plan.shapes[k], ...(plan.terraces[k] ?? [])]).filter(Boolean).map(pathOf).join(' ') + ' ' + pathOf(spec.core);
}

export default function BuildingView({ apartments, stages, onOpen, words, initialFloor, floorLabels, interiorSrc, bus: sharedBus, compact, title, lower, tower = 0, hideLower, customButtons = [], plan = WOLFSON_PLAN, planSlot }: BuildingViewProps) {
  /** A flat's answers as short words: "Wall ✓", "Wall ✗", "Wall ?". */
  const answersOf = (a: Apartment) => customButtons.flatMap(cb => {
    // A company button is said by the AC company chip below, never twice.
    if (isCompanyButton(cb)) return [];
    // The wall is DRAWN on the plan where the plan has it marked (wallOn below) — never a "Wall: Yes" chip as well.
    if (isWallButton(cb) && plan.walls) return [];
    const v = a.customAnswers?.[cb.id];
    // "Wall Yes/No" is the button's name; the answer already says yes or no, so it reads "Wall: Yes" (owner, 2026-11-03).
    const name = cb.name.replace(/\s*\(?\s*(yes\s*\/\s*no|כן\s*\/\s*לא)\s*\)?\s*\??\s*$/i, '').trim() || cb.name;
    return v ? [{ id: cb.id, name, v, mark: v === 'yes' ? '✓' : v === 'no' ? '✗' : '?' }] : [];
  });
  /** A flat answered "Wall: Yes" (the project's own Wall button). */
  const wallOn = (a: Apartment) => customButtons.some(cb => isWallButton(cb) && a.customAnswers?.[cb.id] === 'yes');
  /** The contractor and the AC company, as chips under the answers (owner, recording 2026-11-11 123621, 1:42 — "you
   *  also want to see the contractor name and the AC company name"). */
  // The company is said only when it is NOT the default (LG): the default on every flat would cover the plan in chips.
  const factsOf = (a: Apartment) => { const co = acCompanyOf(a, customButtons); return [crewOf(a, stages).name, co === DEFAULT_AC_COMPANY ? '' : co].filter(Boolean); };
  const lab = (f: number, row?: FloorRow) => row?.lower ? row.lower.label : floorLabels?.[f] || String(f);
  const w = { ...EN, ...words };
  const stageById = useMemo(() => new Map(stages.map(s => [s.id, s])), [stages]);

  const floors: FloorRow[] = useMemo(() => {
    const by = new Map<number, FloorRow>();
    for (const apt of apartments) {
      if (apt.isUnnamed || apt.coveredBy || !apt.apartmentNumber) continue;
      // A duplex stands on two floors (Netiv's garden flats): drawn on each, as the plan says.
      for (const fl of [apt.floor, ...(plan.alsoOn?.(apt) ?? [])]) {
        const row = by.get(fl) ?? { floor: fl, flats: [] };
        row.flats.push({ apt, shapes: plan.shapesOf(apt, fl) });
        by.set(fl, row);
      }
    }
    const towers = [...by.values()].sort((a, b) => a.floor - b.floor);
    const low = (lower ?? []).map((l, i) => ({ floor: -1000 + i, flats: [], lower: l, slots: slotsOn(apartments, l.key) } as FloorRow));
    return [...low, ...towers];
  }, [apartments, lower, plan]);

  const topIdx = floors.length - 1;
  const startIdx = useMemo(() => {
    const i = initialFloor == null ? -1 : floors.findIndex(f => f.floor === initialFloor);
    return i >= 0 ? i : topIdx;
  }, [floors, initialFloor, topIdx]);

  // The landed floor (an index into `floors`) — state, because the cards read it.
  const [landed, setLanded] = useState(startIdx);
  const [hover, setHover] = useState<string | null>(null);
  /**
   * Press and HOLD a flat with a finger (owner, 2026-11-08: "all" of the vibration places): after 450 ms the phone
   * buzzes and the flat lights up (with its joined partner) without opening — a peek. The click that follows the
   * hold is swallowed; a finger that moves (dragging the floors) is not a hold.
   */
  const hold = useRef<{ id: string; x: number; y: number; timer: number; fired: boolean } | null>(null);
  const holdOf = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (hold.current) window.clearTimeout(hold.current.timer);
      const h = { id, x: e.clientX, y: e.clientY, fired: false, timer: 0 };
      h.timer = window.setTimeout(() => { h.fired = true; setHover(id); haptic('tap'); }, 450);
      hold.current = h;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const h = hold.current;
      if (h && !h.fired && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) { window.clearTimeout(h.timer); hold.current = null; }
    },
    onPointerUp: () => {
      if (hold.current && !hold.current.fired) { window.clearTimeout(hold.current.timer); hold.current = null; }
      // The hold's buzz came from a timer, which an iPhone ignores: its tick comes at the lift instead.
      else if (hold.current?.fired) hapticOnLift('tap');
    },
    onPointerCancel: () => { if (hold.current) window.clearTimeout(hold.current.timer); hold.current = null; },
    onContextMenu: (e: React.MouseEvent) => { if (hold.current?.fired) e.preventDefault(); },
  });
  /** True (and forgotten) when this click is the lift of a hold on that flat. */
  const heldClick = (id: string) => { const h = hold.current; if (h?.fired && h.id === id) { hold.current = null; return true; } return false; };
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
  // A small tick in the hand each time a new floor lands (owner, 2026-11-08: "vibrations … when moving the floors").
  // Only the first view of the trio ticks — three buzzes for one floor would be one too many.
  const firstLanded = useRef(true);
  // When the tick was already given INSIDE the press (a rail button, a key — the only moment an iPhone allows one),
  // the landing a moment later does not tick again.
  const handTicked = useRef(0);
  useEffect(() => {
    if (firstLanded.current) { firstLanded.current = false; return; }
    if (Date.now() - handTicked.current < 1200) return;
    if (!compact || tower === 0) haptic('tick');
  }, [landed]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((idx: number) => {
    setHover(null);
    const to = Math.max(0, Math.min(topIdx, Math.round(idx)));
    if (to !== Math.round(bus.get()) && (!compact || tower === 0)) { haptic('tick'); handTicked.current = Date.now(); }
    bus.set(to);
  }, [bus, topIdx, compact, tower]);

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
  const onPointerUp = () => {
    const t2 = touch.current;
    if (t2) {
      const to = Math.round(bus.get());
      // The floors that passed under the finger ticked on Android as they landed; an iPhone allows a tick only at
      // the lift, so it gets one there when the swipe changed the floor.
      if (to !== Math.round(t2.from) && (!compact || tower === 0)) hapticOnLift('tick');
      bus.set(to);
    }
    touch.current = null;
  };

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
    // A flat with no family name is drawn white and dashed ("not sold") — but only while nothing has been done in it.
    // Work is done in flats that have no buyer yet (owner's recording 2026-11-11 12:31: building 2's "Not sold" flats
    // with Installation, Inspection 1, Framing done stayed white — "why are we still having the color bug"): once its
    // stage is past the start, the stage's colour wins.
    if (!name && (!st || isStartStage(st))) return { fill: '#ffffff', tint: '#cbd5e1', dashed: true };
    return { fill: st?.color ?? '#94a3b8', tint: st?.color ?? '#94a3b8', dashed: false };
  };

  if (!floors.length) return null;

  return (
    <div className={`bv-root${compact ? ' bv-compact' : ''}`} data-building-view={title ?? ''}>
      {compact && title && <div className="bv-title">{title}</div>}
      {planSlot && floors[landed] && <div className={compact ? "bv-plan-slot" : "bv-plan-slot bv-plan-slot-top"}>
        {planSlot({ key: floors[landed].lower ? floors[landed].lower!.key : String(floors[landed].floor), label: lab(floors[landed].floor, floors[landed]) })}
      </div>}
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
          {floors.map((row, i) => { const spec = row.lower ? null : plan.floorOf(planRow(row), interiorSrc); return (
            <div
              key={row.floor}
              ref={el => { plates.current[i] = el; }}
              className="bv-plate"
              data-floor={row.floor}
              data-current={i === landed ? '1' : '0'}
              data-estimated={spec?.estimated ? '1' : undefined}
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
                          {...holdOf(a.id)}
                          onClick={() => !heldClick(a.id) && i === landed && onOpen(a)}>
                          {z && <rect className="bv-zone" x={z[0] + dx} y={z[1] + dy} width={z[2] - z[0]} height={z[3] - z[1]} rx={18} />}
                          <SlotChip x={cx} y={cy} name={slotName(a)} />
                        </g>
                      );
                    })}
                    {!(row.slots ?? []).length && <text x={555} y={470} className="bv-floor-no">{row.lower.label}</text>}
                  </svg>
                );
              })()) : (
              <svg viewBox={`${plan.box.x} ${plan.box.y} ${plan.box.w} ${plan.box.h}`} className="bv-svg">
                <path className="bv-slab" d={slabPath(plan, spec!)} />
                <g className="bv-core" data-plain={spec!.drawing ? '0' : '1'}>
                  <path d={pathOf(spec!.core)} />
                  {spec!.stairs.map(([x, y, sw, sh], j) => (
                    <g key={j}>
                      <rect x={x} y={y} width={sw} height={sh} className="bv-stair" />
                      {Array.from({ length: 9 }, (_, n) => (
                        <line key={n} x1={x} x2={x + sw} y1={y + (n + 1) * sh / 10} y2={y + (n + 1) * sh / 10} className="bv-tread" />
                      ))}
                    </g>
                  ))}
                  {spec!.lifts.map(([x, y, lw, lh], j) => (
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
                      {...holdOf(apt.id)}
                      onClick={() => !heldClick(apt.id) && i === landed && onOpen(apt)}
                    >
                      {shapes.flatMap(s => (plan.terraces[s] ?? []).map((t, j) => <path key={`${s}-t${j}`} className="bv-terrace" d={pathOf(t)} />))}
                      {shapes.map(s => <path key={s} d={pathOf(plan.shapes[s])} />)}
                    </g>
                  );
                })}
                {spec!.drawing && !spec!.drawing.clip && (
                  <g className="bv-interior" pointerEvents="none">
                    {/* Cut to the building and its terraces when it was drawn (the sheet also carries the floors below). */}
                    <image href={spec!.drawing.src} x={spec!.drawing.box.x} y={spec!.drawing.box.y} width={spec!.drawing.box.w} height={spec!.drawing.box.h} preserveAspectRatio="none" />
                  </g>
                )}
                {spec!.drawing?.clip && (
                  <g className="bv-interior" pointerEvents="none">
                    <clipPath id={`bv-clip-${plan.id}-${row.floor}`}><path d={spec!.slab.map(k => pathOf(plan.shapes[k])).join(' ') + ' ' + pathOf(spec!.core)} /></clipPath>
                    <image href={spec!.drawing.src} x={spec!.drawing.box.x} y={spec!.drawing.box.y} width={spec!.drawing.box.w} height={spec!.drawing.box.h}
                      clipPath={`url(#bv-clip-${plan.id}-${row.floor})`} preserveAspectRatio="none" />
                  </g>
                )}
                {/* The wall, lit green, on every flat answered "Wall: Yes" — above the drawing, under the labels. */}
                {plan.walls && row.flats.filter(({ apt }) => wallOn(apt)).flatMap(({ apt, shapes }) =>
                  shapes.flatMap(s => (plan.walls![s] ?? []).map((wl, wi) => (
                    <polyline key={`w-${apt.id}-${s}-${wi}`} className="bv-wall" data-flat-wall={apt.id}
                      points={wl.map(p => p.join(',')).join(' ')} pointerEvents="none" />
                  ))))}
                {/* The labels lie ABOVE the plan's drawing, so its lines never cross them (owner, 2026-11-03:
                    "it's getting hidden behind the lines of the plan"). */}
                {row.flats.map(({ apt, shapes }) => {
                  const [lx, ly] = plan.labelAt[shapes[0]] ?? [plan.box.x + plan.box.w / 2, plan.box.y + plan.box.h / 2];
                  return (
                    <g key={`l-${apt.id}`} className="bv-flat-labels" data-apt-labels={apt.id} pointerEvents="none">
                      {/* The number, the tipus and the upgrade "U" on one line, the project's own answers ("Wall: Yes")
                          on the line under it — both kept INSIDE the apartment (owner, 2026-11-03: "the info is
                          dragging off the apartment … fix that on all devices"). */}
                      {(() => {
                        const tip = (apt.tipus ?? '').trim();
                        const up = apt.classification === 'shinui';
                        const xs = shapes.flatMap(s => (plan.shapes[s] ?? []).map(p => p[0]));
                        const minX = Math.min(...xs) + 18, maxX = Math.max(...xs) - 18;
                        const fit = (wd: number, want: number) => Math.max(minX, Math.min(want, maxX - wd));
                        const nW = String(apt.apartmentNumber).length * 27;
                        const w2 = tip ? Math.max(56, tip.length * 26 + 24) : 0;
                        const row1 = nW + (tip ? 14 + w2 : 0) + (up ? 10 + 56 : 0);
                        let x = fit(row1, lx - nW / 2);
                        const parts: React.ReactNode[] = [
                          <text key="n" x={x + nW / 2} y={ly} className="bv-flat-no">{apt.apartmentNumber}</text>,
                        ];
                        const left = x;
                        x += nW + 14;
                        if (tip) {
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
                        let y2 = ly + 58;
                        for (const an of answersOf(apt)) {
                          const label = `${an.name}: ${an.v === 'yes' ? w.yes : an.v === 'no' ? w.no : '?'}`;
                          const w3 = Math.max(60, label.length * 17 + 30);
                          const x3 = fit(w3, left);
                          parts.push(
                            <g key={`c-${an.id}`} className="bv-flat-ans" data-flat-answer={an.v}>
                              <rect x={x3} y={y2 - 24} width={w3} height={48} rx={10} />
                              <text x={x3 + w3 / 2} y={y2}>{label}</text>
                            </g>);
                          y2 += 56;
                        }
                        factsOf(apt).forEach((label, fi) => {
                          const w3 = Math.max(60, label.length * 17 + 30);
                          const x3 = fit(w3, left);
                          parts.push(
                            <g key={`f-${fi}`} className="bv-flat-ans" data-flat-fact={fi === 0 && crewOf(apt, stages).name ? 'contractor' : 'company'}>
                              <rect x={x3} y={y2 - 24} width={w3} height={48} rx={10} />
                              <text x={x3 + w3 / 2} y={y2}>{label}</text>
                            </g>);
                          y2 += 56;
                        });
                        return parts;
                      })()}
                    </g>
                  );
                })}
                {/* A floor the board names in words ("Ground / Commercial") shows its first word, smaller, so it stays
                    on the plate; a number keeps the big figure. */}
                {(() => {
                  const full = lab(row.floor);
                  const t = shortFloor(full);
                  return <text x={spec!.floorNoAt[0]} y={spec!.floorNoAt[1]} className="bv-floor-no"
                    style={t.length > 3 ? { fontSize: Math.max(56, Math.round(380 / t.length)), letterSpacing: 0 } : undefined}>{t}</text>;
                })()}
              </svg>
              )}
            </div>
          ); })}
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
              className={`bv-card bv-${compact ? 'tl' : plan.cardSpot[shapes[0]] ?? 'tl'}`}
              data-card={apt.id}
              data-on={on ? '1' : '0'}
              style={{ ['--bv-c' as string]: st?.color ?? '#94a3b8' }}
              onPointerEnter={() => setHover(apt.id)}
              onPointerLeave={() => setHover(h => (h === apt.id ? null : h))}
              onFocus={() => setHover(apt.id)}
              onBlur={() => setHover(h => (h === apt.id ? null : h))}
              {...holdOf(apt.id)}
              onClick={() => !heldClick(apt.id) && onOpen(apt)}
            >
              <span className="bv-card-top">
                <span className="bv-card-no">{apt.apartmentNumber}</span>
                {apt.tipus && <span className="bv-card-tip">{apt.tipus}</span>}
                {answersOf(apt).map(an => (
                  <span key={an.id} className="bv-card-ans" data-card-answer={an.v}>{an.name}: {an.v === 'yes' ? w.yes : an.v === 'no' ? w.no : w.unknown}</span>
                ))}
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
              className="bv-rail-btn" data-on={i === landed ? '1' : '0'} onClick={() => go(i)} title={lab(row.floor, row)}>
              {shortFloor(lab(row.floor, row))}
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
