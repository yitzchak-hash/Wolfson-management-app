import React from 'react';
import { Stage, getStageName } from '../../types';
import { useStore } from '../../data/store';

interface StageLegendProps {
  stages: Stage[];
  activeStageIds: string[];
  onToggle: (id: string) => void;
}

export function StageLegend({ stages, activeStageIds, onToggle }: StageLegendProps) {
  const isRtl = useStore(state => state.mainUiStrings.isRtl);
  const sorted = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map(stage => {
        const isActive = activeStageIds.length === 0 || activeStageIds.includes(stage.id);
        return (
          <button
            key={stage.id}
            onClick={() => onToggle(stage.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
              isActive
                ? 'opacity-100 shadow-sm'
                : 'opacity-40 grayscale'
            }`}
            style={{
              backgroundColor: stage.color + '22',
              borderColor: stage.color + '55',
              color: stage.color,
            }}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
            {getStageName(stage, isRtl)}
          </button>
        );
      })}
      {/* Not started */}
      <button
        onClick={() => onToggle('__none__')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
          activeStageIds.length === 0 || activeStageIds.includes('__none__') ? 'opacity-100 shadow-sm' : 'opacity-40 grayscale'
        }`}
        style={{ backgroundColor: '#f3f4f6', borderColor: '#d1d5db', color: '#6b7280' }}
      >
        <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
        Not Started
      </button>
    </div>
  );
}

/**
 * The stage filter folded into ONE small drop-down (owner, recording
 * 2026-10-28: "this whole thing … can become a drop-down, a little tiny
 * drop-down"). The chips inside are the legend above, unchanged — the same
 * press narrows the board to those stages.
 */
export function StageFilterMenu({ stages, activeStageIds, onToggle, onClear, anyLabel, someLabel, clearLabel }: StageLegendProps & {
  onClear: () => void;
  anyLabel: string;
  someLabel: string;
  clearLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [open]);
  const n = activeStageIds.length;
  const picked = stages.filter(s => activeStageIds.includes(s.id));
  return (
    <div ref={ref} className="relative" data-stage-filter>
      <button type="button" data-stage-filter-btn aria-expanded={open} onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
          n ? 'bg-[#1e3a5f]/5 border-[#1e3a5f]/30 text-[#1e3a5f]' : 'bg-gray-100 border-gray-200 text-gray-600 hover:border-gray-300'}`}>
        {picked.slice(0, 3).map(s => <span key={s.id} className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />)}
        {n ? someLabel.replace('{n}', String(n)) : anyLabel}
        <span className="text-[10px] text-gray-400">▾</span>
      </button>
      {open && (
        <div data-stage-filter-panel className="absolute z-40 mt-1.5 left-0 rtl:left-auto rtl:right-0 w-[420px] max-w-[80vw] bg-white border border-gray-200 rounded-xl shadow-xl p-3">
          <StageLegend stages={stages} activeStageIds={activeStageIds} onToggle={onToggle} />
          {n > 0 && (
            <button type="button" onClick={onClear} className="mt-2 text-xs text-red-500 hover:text-red-700">{clearLabel}</button>
          )}
        </div>
      )}
    </div>
  );
}
