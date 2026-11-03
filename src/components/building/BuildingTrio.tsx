/**
 * ALL THREE BUILDINGS on one screen (owner, 2026-11-03: "in the all view for
 * the building view, you can have all three of them on one screen just in a
 * smaller scale … let's make it scroll together"). Each is a compact
 * BuildingView; they share one FloorBus, so the wheel over any of them, a
 * press on the rail or a key moves all three to the same floor.
 */
import { useMemo, useEffect, useState } from 'react';
import type { Apartment, Stage } from '../../types';
import BuildingView, { makeFloorBus, type BuildingViewWords, type FloorBus } from './BuildingView';
import { STRIP, type LowerLevel } from './wolfsonPlan';

export interface TrioBuilding { id: string; title: string; apartments: Apartment[]; floorLabels?: Record<number, string> }

export default function BuildingTrio({ buildings, stages, onOpen, words, interiorSrc, lower = [] }: {
  buildings: TrioBuilding[]; stages: Stage[]; onOpen: (apt: Apartment) => void;
  words?: Partial<BuildingViewWords>; interiorSrc?: string; lower?: LowerLevel[];
}) {
  // The floors every building has, bottom first — the rail and the bus count them.
  const floors = useMemo(() => {
    const set = new Set<number>();
    for (const b of buildings) for (const a of b.apartments) if (!a.isUnnamed && !a.coveredBy && a.apartmentNumber) set.add(a.floor);
    return [...set].sort((x, y) => x - y);
  }, [buildings]);
  const levels = lower.length + floors.length;
  const bus = useMemo(() => makeFloorBus(Math.max(0, levels - 1)), [levels]);
  const [at, setAt] = useState(Math.round(bus.get()));
  useEffect(() => bus.subscribe(v => setAt(a => (a === Math.round(v) ? a : Math.round(v)))), [bus]);
  const lab = (f: number) => buildings[0]?.floorLabels?.[f] || String(f);
  const rail = [...lower.map((l, i) => ({ key: l.key, label: l.label, i })), ...floors.map((f, j) => ({ key: String(f), label: lab(f), i: lower.length + j }))];
  return (
    <div className="bv-trio" data-building-trio>
      <div className="bv-trio-row">
        {lower.length > 0 && <LowerWide lower={lower} bus={bus} />}
        {buildings.map((b, i) => (
          <BuildingView key={b.id} compact title={b.title} bus={bus} apartments={b.apartments} stages={stages}
            onOpen={onOpen} words={words} floorLabels={b.floorLabels} interiorSrc={interiorSrc}
            lower={lower} tower={i} hideLower />
        ))}
      </div>
      <nav className="bv-rail" aria-label={words?.floor ?? 'Floor'}>
        {[...rail].reverse().map(r => (
          <button key={r.key} type="button" data-rail-floor={r.label} className="bv-rail-btn" data-on={r.i === at ? '1' : '0'}
            onClick={() => bus.set(r.i)}>{r.label}</button>
        ))}
      </nav>
    </div>
  );
}

/**
 * The shared levels drawn ONCE across the three (owner: "one wide floor under
 * all three"): one long plate per level, moving on the same bus as the towers.
 */
function LowerWide({ lower, bus }: { lower: LowerLevel[]; bus: FloorBus }) {
  const [v, setV] = useState(bus.get());
  useEffect(() => bus.subscribe(setV), [bus]);
  return (
    <div className="bv-wide" aria-hidden>
      <div className="bv-wide-world">
        {lower.map((l, i) => {
          const o = i - v;
          const op = o > 1.5 ? 0 : o <= 0 ? Math.max(0.12, 1 - 0.2 * -o) : o < 1 ? 1 - 0.93 * o : 0.07;
          return (
            <div key={l.key} className="bv-wide-plate" data-wide={l.key} data-solid={Math.abs(o) < 0.5 ? '1' : '0'}
              style={{ transform: `translate3d(0,0,${o * 70}px)`, opacity: op, visibility: op < 0.01 ? 'hidden' : 'visible' }}>
              <svg viewBox={`${STRIP.x} ${STRIP.y} ${STRIP.w} ${STRIP.h}`} preserveAspectRatio="xMidYMid meet">
                <rect className="bv-lower-mine" x={STRIP.x} y={STRIP.y} width={STRIP.w} height={STRIP.h} />
                <image href={l.src} x={STRIP.x} y={STRIP.y} width={STRIP.w} height={STRIP.h} preserveAspectRatio="none" />
                <text x={STRIP.x + STRIP.w / 2} y={STRIP.y + STRIP.h / 2} className="bv-floor-no">{l.label}</text>
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}
