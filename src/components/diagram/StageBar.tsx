import React, { useEffect, useRef, useState } from 'react';
import { Stage, Apartment, isCountableApartment, getStageName, MainUiStrings } from '../../types';

/**
 * One bar showing the whole project (owner's decision 5, sealed 2026-08-30).
 *
 * Below 900px the diagram's top chrome is: search + one Filters button, the
 * building tabs, then THIS — each stage a block sized by how many apartments
 * are in it, its count written inside when the block is wide enough to hold
 * it, tap a block to toggle that stage in the page's filter. A line above it
 * reads the total; the stage names with colour dots wrap beneath. It replaces
 * both the eight wrapping stage bubbles and the separate row of bare numbers.
 *
 * Counts go through `isCountableApartment` and NOTHING else — the standing
 * rule, so this bar can never disagree with the dashboard. Units not yet at
 * any stage get a grey block, because a bar of "the whole project" that
 * leaves them out is a bar that lies about how far along the project is.
 */
export function StageBar({ stages, apartments, activeStageIds, onToggle, s }: {
  /** The page's own sorted, project-filtered stage list. */
  stages: Stage[];
  apartments: Apartment[];
  activeStageIds: string[];
  onToggle: (stageId: string) => void;
  s: MainUiStrings;
}) {
  const countable = apartments.filter(isCountableApartment);
  const total = countable.length;
  const rows = stages
    .map(st => ({
      id: st.id,
      name: getStageName(st, s.isRtl),
      color: st.color,
      n: countable.filter(a => a.currentStageId === st.id).length,
    }))
    .filter(r => r.n > 0);
  const noStage = countable.filter(a => !a.currentStageId).length;

  /**
   * A count is only written where it fits. The block's width is its share of
   * the measured bar, so the bar is watched — a number squeezed into a 9px
   * sliver is ink, not information.
   */
  const barRef = useRef<HTMLDivElement>(null);
  const [barW, setBarW] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarW(el.clientWidth));
    ro.observe(el);
    setBarW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const inBar = rows.reduce((a, r) => a + r.n, 0) + noStage;
  const filtering = activeStageIds.length > 0;
  const segW = (n: number) => (inBar > 0 ? (n / inBar) * Math.max(0, barW - inBar) : 0);

  return (
    <div data-stage-bar className="bg-white border-b border-gray-200 px-4 pt-2 pb-2.5 flex-shrink-0">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12px] font-bold uppercase tracking-[.06em] text-gray-500">
          {s.stageBarLabel}
        </span>
        <span className="text-[13px] text-gray-500">
          <b className="text-gray-900">{total}</b> {s.bulkUnits}
        </span>
      </div>

      <div ref={barRef} className="flex h-[34px] rounded-[9px] overflow-hidden gap-[2px]">
        {rows.map(r => {
          const on = activeStageIds.includes(r.id);
          return (
            <button
              key={r.id}
              data-stage-seg={r.id}
              onClick={() => onToggle(r.id)}
              title={`${r.name} · ${r.n}`}
              className="flex items-center justify-center text-white font-bold text-[12px] leading-none transition-opacity"
              style={{
                flex: `${r.n} 1 0%`,
                minWidth: 0,
                backgroundColor: r.color,
                // A filter with no visible state is a trap: the picked
                // blocks stay full strength, the rest step back.
                opacity: filtering && !on ? 0.35 : 1,
                boxShadow: on ? 'inset 0 0 0 2px rgba(255,255,255,.85)' : undefined,
              }}
            >
              {segW(r.n) >= 20 ? r.n : ''}
            </button>
          );
        })}
        {noStage > 0 && (
          // Not-started units keep the bar honest about the whole project.
          // Grey and unpressable: the page's stage filter has no "no stage"
          // value to toggle, and a dead-looking button would read as broken.
          <div
            className="flex items-center justify-center text-gray-500 font-bold text-[12px] leading-none bg-gray-200"
            style={{ flex: `${noStage} 1 0%`, minWidth: 0, opacity: filtering ? 0.35 : 1 }}
            title={`${s.notStartedOption} · ${noStage}`}
          >
            {segW(noStage) >= 20 ? noStage : ''}
          </div>
        )}
      </div>

      <div className="flex gap-x-3.5 gap-y-1 flex-wrap mt-2">
        {rows.map(r => (
          <span key={r.id} className="flex items-center gap-[5px] text-[11.5px] text-gray-600">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
            {r.name}
          </span>
        ))}
        {noStage > 0 && (
          <span className="flex items-center gap-[5px] text-[11.5px] text-gray-500">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300" />
            {s.notStartedOption}
          </span>
        )}
      </div>
    </div>
  );
}
