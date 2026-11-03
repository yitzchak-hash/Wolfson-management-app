/**
 * ALL THREE BUILDINGS on one screen (owner, 2026-11-03: "in the all view for
 * the building view, you can have all three of them on one screen just in a
 * smaller scale … let's make it scroll together"). Each is a compact
 * BuildingView; they share one FloorBus, so the wheel over any of them, a
 * press on the rail or a key moves all three to the same floor.
 */
import { useMemo, useEffect, useState } from 'react';
import type { Apartment, Stage } from '../../types';
import BuildingView, { makeFloorBus, type BuildingViewWords } from './BuildingView';

export interface TrioBuilding { id: string; title: string; apartments: Apartment[]; floorLabels?: Record<number, string> }

export default function BuildingTrio({ buildings, stages, onOpen, words, interiorSrc }: {
  buildings: TrioBuilding[]; stages: Stage[]; onOpen: (apt: Apartment) => void;
  words?: Partial<BuildingViewWords>; interiorSrc?: string;
}) {
  // The floors every building has, bottom first — the rail and the bus count them.
  const floors = useMemo(() => {
    const set = new Set<number>();
    for (const b of buildings) for (const a of b.apartments) if (!a.isUnnamed && !a.coveredBy && a.apartmentNumber) set.add(a.floor);
    return [...set].sort((x, y) => x - y);
  }, [buildings]);
  const bus = useMemo(() => makeFloorBus(Math.max(0, floors.length - 1)), [floors.length]);
  const [at, setAt] = useState(Math.round(bus.get()));
  useEffect(() => bus.subscribe(v => setAt(a => (a === Math.round(v) ? a : Math.round(v)))), [bus]);
  const lab = (f: number) => buildings[0]?.floorLabels?.[f] || String(f);
  return (
    <div className="bv-trio" data-building-trio>
      <div className="bv-trio-row">
        {buildings.map(b => (
          <BuildingView key={b.id} compact title={b.title} bus={bus} apartments={b.apartments} stages={stages}
            onOpen={onOpen} words={words} floorLabels={b.floorLabels} interiorSrc={interiorSrc} />
        ))}
      </div>
      <nav className="bv-rail" aria-label={words?.floor ?? 'Floor'}>
        {[...floors].reverse().map(f => {
          const i = floors.indexOf(f);
          return (
            <button key={f} type="button" data-rail-floor={lab(f)} className="bv-rail-btn" data-on={i === at ? '1' : '0'}
              onClick={() => bus.set(i)}>{lab(f)}</button>
          );
        })}
      </nav>
    </div>
  );
}
