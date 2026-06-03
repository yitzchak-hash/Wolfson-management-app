import React, { useState, useCallback, useMemo } from 'react';
import { Search, X, ToggleLeft, CheckSquare, Printer, ChevronDown } from 'lucide-react';
import { Tooltip } from '../components/ui/Tooltip';
import { useStore } from '../data/store';
import { Apartment, BuildingId } from '../types';
import { BuildingDiagram } from '../components/diagram/BuildingDiagram';
import { StageLegend } from '../components/diagram/StageLegend';
import { ApartmentDetailDrawer } from '../components/apartment/ApartmentDetailDrawer';
import { QuickAddTaskPanel } from '../components/apartment/QuickAddTaskPanel';
import { Toast } from '../components/ui/Toast';

type ClassFilter = 'all' | 'standard' | 'shinui';

export function ProjectDiagramPage() {
  const { apartments, stages, currentUser, bulkUpdateApartments, updateApartment, contractorAssignments, contractors, mainUiStrings: s } = useStore();

  const [selectedBuilding, setSelectedBuilding] = useState<BuildingId | 'all'>('all');
  const [activeStageIds, setActiveStageIds] = useState<string[]>([]);
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showShinuiBadge, setShowShinuiBadge] = useState(true);
  const [selectedApt, setSelectedApt] = useState<Apartment | null>(null);
  const [addTaskApt, setAddTaskApt] = useState<Apartment | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [namingApt, setNamingApt] = useState<Apartment | null>(null);
  const [namingInput, setNamingInput] = useState('');

  // Bulk update state
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkStageId, setBulkStageId] = useState('');
  const [bulkDropdownOpen, setBulkDropdownOpen] = useState(false);

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);

  // Map aptId → "ContractorName · N" task summary for display in cell
  const aptTaskData = useMemo(() => {
    const m = new Map<string, string>();
    apartments.forEach(apt => {
      const pending = contractorAssignments.filter(a => a.apartmentId === apt.id && !a.completedAt);
      if (!pending.length) return;
      const firstContractor = contractors.find(c => c.id === pending[0].contractorId);
      const label = firstContractor
        ? `${firstContractor.name}${pending.length > 1 ? ` · ${pending.length}` : ''}`
        : `${pending.length} task${pending.length !== 1 ? 's' : ''}`;
      m.set(apt.id, label);
    });
    return m;
  }, [contractorAssignments, contractors, apartments]);

  // Map aptId → true if apartment has tasks and ALL are completed
  const aptCompletedData = useMemo(() => {
    const m = new Map<string, boolean>();
    apartments.forEach(apt => {
      const tasks = contractorAssignments.filter(a => a.apartmentId === apt.id);
      if (!tasks.length) return;
      if (tasks.every(a => !!a.completedAt)) m.set(apt.id, true);
    });
    return m;
  }, [contractorAssignments, apartments]);

  // Map aptId → next stage name
  const nextStageLabels = useMemo(() => {
    const m = new Map<string, string>();
    apartments.forEach(apt => {
      const idx = sortedStages.findIndex(s => s.id === apt.currentStageId);
      const next = idx >= 0 && idx < sortedStages.length - 1 ? sortedStages[idx + 1] : idx === -1 && sortedStages.length > 0 ? sortedStages[0] : null;
      if (next) m.set(apt.id, next.name);
    });
    return m;
  }, [apartments, sortedStages]);

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

  function exitBulkMode() {
    setBulkMode(false);
    setBulkSelected(new Set());
    setBulkStageId('');
    setBulkDropdownOpen(false);
  }

  const handleAptClick = useCallback((apt: Apartment) => {
    if (bulkMode) {
      setBulkSelected(prev => {
        const next = new Set(prev);
        next.has(apt.id) ? next.delete(apt.id) : next.add(apt.id);
        return next;
      });
    } else {
      setAddTaskApt(null);
      setSelectedApt(apt);
    }
  }, [bulkMode]);

  const handleAddTask = useCallback((apt: Apartment) => {
    setSelectedApt(null);
    setAddTaskApt(apt);
  }, []);

  const handleNameUnnamed = useCallback((apt: Apartment) => {
    setNamingApt(apt);
    setNamingInput('');
  }, []);

  function handleSaveName() {
    if (!namingApt || !currentUser || !namingInput.trim()) return;
    updateApartment(namingApt.id, { displayName: namingInput.trim(), isUnnamed: false }, currentUser);
    setNamingApt(null);
    setNamingInput('');
  }

  function handleBulkApply() {
    if (!currentUser || bulkSelected.size === 0) return;
    const ids = Array.from(bulkSelected);
    bulkUpdateApartments(ids, { currentStageId: bulkStageId || null }, currentUser);
    const stageName = sortedStages.find(s => s.id === bulkStageId)?.name ?? 'Not Started';
    showToast(`${ids.length} apartment${ids.length !== 1 ? 's' : ''} updated → ${stageName}`);
    exitBulkMode();
  }

  function handlePrint() {
    window.print();
  }

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
    <>
      {/* Print-only header — hidden on screen */}
      <div className="hidden print:block print:mb-4">
        <div className="flex items-center gap-4 mb-3">
          <img src="/tzviair-logo.png" alt="TzviAir" style={{ height: '40px' }} />
          <div>
            <h1 className="text-lg font-bold text-gray-900">{s.printHeader}</h1>
            <p className="text-xs text-gray-500">Printed {new Date().toLocaleDateString()}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 border border-gray-300 rounded p-3 bg-gray-50">
          {sortedStages.map(s => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
              <span className="text-xs">{s.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-white border border-gray-300" />
            <span className="text-xs">{s.notStartedOption}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col h-full overflow-hidden print:h-auto print:overflow-visible">
        {/* Top bar — hidden on print */}
        <div className="bg-white border-b border-gray-200 px-5 py-3 flex-shrink-0 print:hidden">
          <div className="flex items-center gap-3 flex-wrap">
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
                  {b === 'all' ? s.all : b}
                </button>
              ))}
            </div>

            {/* Classification filter */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              {(['all', 'standard', 'shinui'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setClassFilter(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    classFilter === c
                      ? c === 'shinui' ? 'bg-amber-500 text-white shadow-sm' : 'bg-[#1e3a5f] text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {c === 'all' ? s.all : c === 'standard' ? s.standard : s.changes}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={s.searchApt}
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl w-36 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-gray-50"
              />
            </div>

            {/* Changes badge toggle */}
            <Tooltip text={showShinuiBadge ? s.hideShinuiBadgeTooltip : s.showShinuiBadgeTooltip}>
              <button
                onClick={() => setShowShinuiBadge(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  showShinuiBadge ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-100 border-gray-200 text-gray-500'
                }`}
              >
                <ToggleLeft size={14} />
                {s.changes}
              </button>
            </Tooltip>

            {/* Bulk update toggle */}
            <Tooltip text={bulkMode ? s.exitBulkModeTooltip : s.enterBulkModeTooltip}>
              <button
                onClick={() => { if (bulkMode) exitBulkMode(); else setBulkMode(true); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                  bulkMode ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-gray-100 border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <CheckSquare size={14} />
                Bulk Update
              </button>
            </Tooltip>

            {/* Print */}
            <Tooltip text={s.printDiagramTooltip}>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all"
              >
                <Printer size={14} />
                Print
              </button>
            </Tooltip>

            {hasFilters && !bulkMode && (
              <Tooltip text={s.clearFiltersTooltip}>
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors px-2 py-1.5"
                >
                  <X size={12} />
                  Clear
                </button>
              </Tooltip>
            )}

            {/* Quick stats */}
            <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
              {bulkMode ? (
                <span className="text-[#1e3a5f] font-semibold">
                  {bulkSelected.size} {s.bulkSelected}
                </span>
              ) : (
                <>
                  <span><strong className="text-gray-800">{total}</strong> {s.bulkUnits}</span>
                  <span><strong className="text-gray-500">{noStage}</strong> {s.bulkNotStarted}</span>
                </>
              )}
            </div>
          </div>

          {/* Stage legend */}
          <div className="mt-3">
            <StageLegend
              stages={sortedStages}
              activeStageIds={bulkMode ? [] : activeStageIds}
              onToggle={bulkMode ? () => {} : toggleStage}
            />
          </div>
        </div>

        {/* Stage progress mini bar — hidden on print */}
        <div className="bg-gray-50 border-b border-gray-200 px-5 py-2 flex items-center gap-3 overflow-x-auto flex-shrink-0 print:hidden">
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
        <div className="flex-1 overflow-auto scrollbar-thin bg-gray-100 print:overflow-visible print:bg-white">
          <BuildingDiagram
            apartments={apartments}
            stages={stages}
            activeStageIds={activeStageIds}
            classFilter={classFilter}
            searchQuery={searchQuery}
            selectedBuilding={selectedBuilding}
            onApartmentClick={handleAptClick}
            showShinuiBadge={showShinuiBadge}
            bulkMode={bulkMode}
            bulkSelected={bulkSelected}
            aptTaskData={aptTaskData}
            nextStageLabels={nextStageLabels}
            onAddTask={bulkMode ? undefined : handleAddTask}
            aptCompletedData={aptCompletedData}
            onNameUnnamed={bulkMode ? undefined : handleNameUnnamed}
          />
        </div>

        {/* Detail drawer — hidden on print */}
        {!bulkMode && liveApt && currentUser && (
          <ApartmentDetailDrawer
            apartment={liveApt}
            onClose={() => setSelectedApt(null)}
            currentUser={currentUser}
            onToast={showToast}
            onRequestAddTask={(apt) => { setSelectedApt(null); setAddTaskApt(apt); }}
          />
        )}

        {/* Quick-add task panel */}
        {!bulkMode && addTaskApt && currentUser && (
          <QuickAddTaskPanel
            apartment={addTaskApt}
            onClose={() => setAddTaskApt(null)}
            currentUser={currentUser}
            onToast={msg => showToast(msg)}
          />
        )}

        {/* Bulk action bar — hidden on print */}
        {bulkMode && (
          <div className="fixed bottom-0 left-16 right-0 bg-[#1e3a5f] text-white px-5 py-3 shadow-2xl flex items-center gap-4 flex-wrap z-30 print:hidden">
            <span className="font-semibold text-sm">
              {bulkSelected.size} apartment{bulkSelected.size !== 1 ? 's' : ''} selected
            </span>

            {/* Stage picker */}
            <div className="relative">
              <button
                onClick={() => setBulkDropdownOpen(v => !v)}
                className="flex items-center gap-2 px-3 py-2 bg-white/15 rounded-lg text-sm font-medium hover:bg-white/25 transition-all min-w-40"
              >
                {bulkStageId ? (
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sortedStages.find(s => s.id === bulkStageId)?.color }} />
                    {sortedStages.find(s => s.id === bulkStageId)?.name}
                  </span>
                ) : (
                  <span className="text-white/70">{s.selectStagePlaceholder}</span>
                )}
                <ChevronDown size={14} className="ml-auto" />
              </button>
              {bulkDropdownOpen && (
                <div className="absolute bottom-full mb-1 left-0 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-48 z-50">
                  <button
                    onClick={() => { setBulkStageId(''); setBulkDropdownOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                  >
                    {s.notStartedOption}
                  </button>
                  {sortedStages.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setBulkStageId(s.id); setBulkDropdownOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleBulkApply}
              disabled={bulkSelected.size === 0}
              className="px-4 py-2 bg-[#4aa8d8] rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-[#3897c7] transition-colors"
            >
              {s.applyTo} {bulkSelected.size > 0 ? bulkSelected.size : '…'}
            </button>

            <button onClick={exitBulkMode} className="ml-auto px-3 py-2 text-white/70 hover:text-white text-sm">
              {s.cancel}
            </button>
          </div>
        )}

        {toast && (
          <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
        )}
      </div>

      {/* Naming dialog for unnamed ground/lobby/basement slots */}
      {namingApt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setNamingApt(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-80 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-bold text-gray-900">Name this space</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {namingApt.buildingId} · Floor {namingApt.floor === 0 ? 'Ground' : namingApt.floor === 1 ? '1 (Lobby)' : namingApt.floor}
              </p>
            </div>
            <input
              autoFocus
              type="text"
              value={namingInput}
              onChange={e => setNamingInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setNamingApt(null); }}
              placeholder="e.g. Parking 3, Storage B…"
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 w-full"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setNamingApt(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                {s.cancel}
              </button>
              <button
                onClick={handleSaveName}
                disabled={!namingInput.trim()}
                className="px-4 py-2 text-sm font-semibold bg-[#1e3a5f] text-white rounded-xl disabled:opacity-40 hover:bg-[#1e3a5f]/90 transition-colors"
              >
                {s.saveChanges}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
