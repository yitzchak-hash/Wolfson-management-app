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
