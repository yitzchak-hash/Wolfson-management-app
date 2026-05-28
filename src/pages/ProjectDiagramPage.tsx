import React, { useState, useCallback } from 'react';
import { Search, X, ToggleLeft } from 'lucide-react';
import { useStore } from '../data/store';
import { Apartment, BuildingId } from '../types';
import { BuildingDiagram } from '../components/diagram/BuildingDiagram';
import { StageLegend } from '../components/diagram/StageLegend';
import { ApartmentDetailDrawer } from '../components/apartment/ApartmentDetailDrawer';
import { Toast } from '../components/ui/Toast';

type ClassFilter = 'all' | 'standard' | 'shinui';

export function ProjectDiagramPage() {
  const { apartments, stages, currentUser } = useStore();

  const [selectedBuilding, setSelectedBuilding] = useState<BuildingId | 'all'>('all');
  const [activeStageIds, setActiveStageIds] = useState<string[]>([]);
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showShinuiBadge, setShowShinuiBadge] = useState(true);
  const [selectedApt, setSelectedApt] = useState<Apartment | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);

  function toggleStage(id: string) {
    setActiveStageIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function clearFilters() {
    setActiveStageIds([]);
    setClassFilter('all');
    setSearchQuery('');
    setSelectedBuilding('all');
  }

  const hasFilters = activeStageIds.length > 0 || classFilter !== 'all' || searchQuery || selectedBuilding !== 'all';

  const handleAptClick = useCallback((apt: Apartment) => {
    setSelectedApt(apt);
  }, []);

  // Refresh selected apt when store updates
  const liveApt = selectedApt
    ? apartments.find(a => a.id === selectedApt.id) ?? selectedApt
    : null;

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
  }

  const stageStats = sortedStages.map(s => ({
    stage: s,
    count: apartments.filter(a => a.currentStageId === s.id).length,
  }));
  const noStage = apartments.filter(a => !a.currentStageId).length;
  const total = apartments.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Building selector */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {(['all', 'A3', 'A2', 'A1'] as const).map(b => (
              <button
                key={b}
                onClick={() => setSelectedBuilding(b)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedBuilding === b
                    ? 'bg-[#1e3a5f] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {b === 'all' ? 'All' : b}
              </button>
            ))}
          </div>

          {/* Classification filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {(['all', 'standard', 'shinui'] as const).map(c => (
              <button
                key={c}
                onClick={() => setClassFilter(c)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                  classFilter === c
                    ? c === 'shinui'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-[#1e3a5f] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {c === 'all' ? 'All' : c === 'standard' ? 'Standard' : 'Changes'}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search apt..."
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl w-36 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-gray-50"
            />
          </div>

          {/* Changes badge toggle */}
          <button
            onClick={() => setShowShinuiBadge(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              showShinuiBadge ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-100 border-gray-200 text-gray-500'
            }`}
            title="Toggle Changes badges"
          >
            <ToggleLeft size={14} />
            Changes badges
          </button>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors px-2 py-1.5"
            >
              <X size={12} />
              Clear filters
            </button>
          )}

          {/* Quick stats */}
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
            <span><strong className="text-gray-800">{total}</strong> units</span>
            <span><strong className="text-gray-500">{noStage}</strong> not started</span>
          </div>
        </div>

        {/* Stage legend */}
        <div className="mt-3">
          <StageLegend
            stages={sortedStages}
            activeStageIds={activeStageIds}
            onToggle={toggleStage}
          />
        </div>
      </div>

      {/* Stage progress mini bar */}
      <div className="bg-gray-50 border-b border-gray-200 px-5 py-2 flex items-center gap-3 overflow-x-auto flex-shrink-0">
        {stageStats.map(({ stage, count }) => (
          count > 0 && (
            <div key={stage.id} className="flex items-center gap-1.5 flex-shrink-0">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="text-xs text-gray-600 font-medium">{count}</span>
            </div>
          )
        ))}
        {noStage > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
            <span className="text-xs text-gray-500">{noStage}</span>
          </div>
        )}
      </div>

      {/* Main diagram */}
      <div className="flex-1 overflow-auto scrollbar-thin bg-gray-100">
        <BuildingDiagram
          apartments={apartments}
          stages={stages}
          activeStageIds={activeStageIds}
          classFilter={classFilter}
          searchQuery={searchQuery}
          selectedBuilding={selectedBuilding}
          onApartmentClick={handleAptClick}
          showShinuiBadge={showShinuiBadge}
        />
      </div>

      {/* Detail drawer */}
      {liveApt && currentUser && (
        <ApartmentDetailDrawer
          apartment={liveApt}
          onClose={() => setSelectedApt(null)}
          currentUser={currentUser}
          onToast={showToast}
        />
      )}

      {toast && (
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
