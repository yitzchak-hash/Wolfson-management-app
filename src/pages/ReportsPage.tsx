import React, { useState, useMemo } from 'react';
import { Download, Printer, Filter, SlidersHorizontal, Search, X, ClipboardList } from 'lucide-react';
import { useStore } from '../data/store';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';

type BuildingFilter = 'all' | 'A1' | 'A2' | 'A3';
type ClassFilter = 'all' | 'standard' | 'shinui';

const ALL_COLUMNS = [
  { key: 'building',       label: 'Building',          always: true },
  { key: 'apartment',      label: 'Apartment',         always: true },
  { key: 'floor',          label: 'Floor',             always: false },
  { key: 'stage',          label: 'Current Stage',     always: false },
  { key: 'classification', label: 'Classification',    always: false },
  { key: 'generalNotes',   label: 'General Notes',     always: false },
  { key: 'lastUpdated',    label: 'Last Updated',      always: false },
  { key: 'updatedBy',      label: 'Updated By',        always: false },
  // Stage note columns added dynamically
] as const;

type ColKey = typeof ALL_COLUMNS[number]['key'];

const TASK_SUB_COLS = ['Description', 'Contractor', 'Stage', 'Due Date', 'Status', 'Completed'] as const;

export function ReportsPage() {
  const { apartments, stages, stageNotes, contractorAssignments, contractors } = useStore();

  const [buildingFilter, setBuildingFilter] = useState<BuildingFilter>('all');
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [includeNoStage, setIncludeNoStage] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [enabledCols, setEnabledCols] = useState<Set<string>>(() =>
    new Set(['building', 'apartment', 'floor', 'stage', 'classification', 'generalNotes', 'lastUpdated', 'updatedBy'])
  );
  const [enabledStageCols, setEnabledStageCols] = useState<Set<string>>(() => new Set());
  const [includeTaskCols, setIncludeTaskCols] = useState(false);

  // Date range filter
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);

  const filtered = useMemo(() => {
    return apartments.filter(apt => {
      if (buildingFilter !== 'all' && apt.buildingId !== buildingFilter) return false;
      if (classFilter !== 'all' && apt.classification !== classFilter) return false;
      if (stageFilter.length > 0 && !stageFilter.includes(apt.currentStageId ?? '')) return false;
      if (stageFilter.length === 0 && !includeNoStage && !apt.currentStageId) return false;
      if (appliedSearch) {
        const q = appliedSearch.toLowerCase();
        const label = (apt.displayName || apt.apartmentNumber || '').toLowerCase();
        if (!label.includes(q)) return false;
      }
      if (dateFrom && apt.updatedAt && apt.updatedAt.slice(0, 10) < dateFrom) return false;
      if (dateTo && apt.updatedAt && apt.updatedAt.slice(0, 10) > dateTo) return false;
      return true;
    });
  }, [apartments, buildingFilter, classFilter, stageFilter, includeNoStage, appliedSearch, dateFrom, dateTo]);

  // Max tasks for any apartment in filtered set (used to generate CSV columns)
  const maxTasks = useMemo(() => {
    if (!includeTaskCols) return 0;
    return filtered.reduce((max, apt) => {
      const count = contractorAssignments.filter(a => a.apartmentId === apt.id).length;
      return Math.max(max, count);
    }, 0);
  }, [filtered, contractorAssignments, includeTaskCols]);

  function toggleStage(id: string) {
    setStageFilter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleCol(key: string) {
    setEnabledCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleStageCol(stageId: string) {
    setEnabledStageCols(prev => {
      const next = new Set(prev);
      next.has(stageId) ? next.delete(stageId) : next.add(stageId);
      return next;
    });
  }

  function getNotes(aptId: string, stageId: string): string {
    return stageNotes.find(n => n.apartmentId === aptId && n.stageId === stageId)?.noteText ?? '';
  }

  function getStageName(stageId: string | null | undefined): string {
    if (!stageId) return 'Not Started';
    return stages.find(s => s.id === stageId)?.name ?? stageId;
  }

  function getAptTasks(aptId: string) {
    return contractorAssignments
      .filter(a => a.apartmentId === aptId)
      .sort((a, b) => {
        // completed last, then by due date
        if (!!a.completedAt !== !!b.completedAt) return a.completedAt ? 1 : -1;
        return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
      });
  }

  function buildRow(apt: typeof apartments[0]): Record<string, string> {
    const row: Record<string, string> = {};
    if (enabledCols.has('building')) row['Building'] = apt.buildingId;
    if (enabledCols.has('apartment')) row['Apartment'] = apt.displayName || apt.apartmentNumber || '(unnamed)';
    if (enabledCols.has('floor')) row['Floor'] = apt.floor === 0 ? 'Ground' : String(apt.floor);
    if (enabledCols.has('stage')) row['Current Stage'] = getStageName(apt.currentStageId);
    if (enabledCols.has('classification')) row['Classification'] = apt.classification === 'shinui' ? 'Changes' : 'Standard';
    if (enabledCols.has('generalNotes')) row['General Notes'] = apt.generalNotes;
    sortedStages.forEach(s => {
      if (enabledStageCols.has(s.id)) row[`${s.name} Notes`] = getNotes(apt.id, s.id);
    });
    if (enabledCols.has('lastUpdated')) row['Last Updated'] = apt.updatedAt ? format(new Date(apt.updatedAt), 'yyyy-MM-dd HH:mm') : '';
    if (enabledCols.has('updatedBy')) row['Updated By'] = apt.updatedByName || '';

    if (includeTaskCols) {
      const tasks = getAptTasks(apt.id);
      for (let i = 0; i < maxTasks; i++) {
        const t = tasks[i];
        const n = i + 1;
        row[`Task ${n} Description`] = t?.taskDescription ?? '';
        row[`Task ${n} Contractor`] = t ? (contractors.find(c => c.id === t.contractorId)?.name ?? '') : '';
        row[`Task ${n} Stage`] = t ? getStageName(t.stageId) : '';
        row[`Task ${n} Due Date`] = t?.dueDate ?? '';
        row[`Task ${n} Status`] = t ? (t.completedAt ? 'Completed' : 'Pending') : '';
        row[`Task ${n} Completed`] = t?.completedAt ? t.completedAt.slice(0, 10) : '';
      }
    }

    return row;
  }

  function exportCSV() {
    const rows = filtered.map(buildRow);
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `wolfson-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  }

  const hasDateFilter = !!dateFrom || !!dateTo;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowColumnPicker(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
              showColumnPicker ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={16} />
            Columns
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Printer size={16} />
            Print
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Column picker */}
      {showColumnPicker && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Export Columns</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
            {ALL_COLUMNS.map(col => (
              <label key={col.key} className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enabledCols.has(col.key)}
                  onChange={() => toggleCol(col.key)}
                  disabled={col.always}
                  className="rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                />
                <span className="text-sm text-gray-700">{col.label}</span>
                {col.always && <span className="text-xs text-gray-400">(required)</span>}
              </label>
            ))}
          </div>

          {/* Stage notes columns */}
          <div className="border-t border-gray-100 mt-3 pt-3">
            <span className="text-xs font-medium text-gray-500 mb-2 block">Stage Notes Columns</span>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
              {sortedStages.map(s => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enabledStageCols.has(s.id)}
                    onChange={() => toggleStageCol(s.id)}
                    className="rounded border-gray-300"
                  />
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-sm text-gray-700 truncate">{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Task columns */}
          <div className="border-t border-gray-100 mt-3 pt-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeTaskCols}
                onChange={() => setIncludeTaskCols(v => !v)}
                className="rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
              />
              <ClipboardList size={14} className="text-gray-500" />
              <span className="text-sm text-gray-700 font-medium">Include Tasks</span>
              <span className="text-xs text-gray-400">
                (adds Task 1–N columns: description, contractor, stage, due date, status, completion date)
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-500" />
            <h2 className="font-semibold text-gray-700 text-sm">Filters</h2>
          </div>
          {/* Apartment search */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setAppliedSearch(searchInput)}
                placeholder="Search apartment…"
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
              />
            </div>
            <button
              onClick={() => setAppliedSearch(searchInput)}
              className="px-3 py-1.5 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#162d4a] transition-colors"
            >
              Enter
            </button>
            {appliedSearch && (
              <button
                onClick={() => { setSearchInput(''); setAppliedSearch(''); }}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Building</label>
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'A1', 'A2', 'A3'] as const).map(b => (
                <button key={b} onClick={() => setBuildingFilter(b)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    buildingFilter === b ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}>
                  {b === 'all' ? 'All' : b}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Classification</label>
            <div className="flex gap-1.5">
              {(['all', 'standard', 'shinui'] as const).map(c => (
                <button key={c} onClick={() => setClassFilter(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                    classFilter === c
                      ? c === 'shinui' ? 'bg-amber-500 text-white border-amber-500' : 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {c === 'shinui' ? 'Changes' : c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Include Not Started</label>
            <button onClick={() => setIncludeNoStage(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                includeNoStage ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200'
              }`}>
              {includeNoStage ? 'Yes' : 'No'}
            </button>
          </div>
        </div>

        {/* Date range filter */}
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Last Updated — From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
            />
          </div>
          {hasDateFilter && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors pb-1.5"
            >
              <X size={12} /> Clear dates
            </button>
          )}
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-gray-500 mb-2 block">Stages (empty = all)</label>
          <div className="flex flex-wrap gap-2">
            {sortedStages.map(s => (
              <button key={s.id} onClick={() => toggleStage(s.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  stageFilter.includes(s.id) ? 'opacity-100' : 'opacity-50'
                }`}
                style={{
                  backgroundColor: stageFilter.includes(s.id) ? s.color + '22' : '#f9fafb',
                  borderColor: stageFilter.includes(s.id) ? s.color + '55' : '#e5e7eb',
                  color: stageFilter.includes(s.id) ? s.color : '#9ca3af',
                }}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">
          Showing <strong className="text-gray-800">{filtered.length}</strong> apartments
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {enabledCols.has('building') && <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Building</th>}
                {enabledCols.has('apartment') && <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Apartment</th>}
                {enabledCols.has('floor') && <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Floor</th>}
                {enabledCols.has('stage') && <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Stage</th>}
                {enabledCols.has('classification') && <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Class</th>}
                {enabledCols.has('generalNotes') && <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Notes</th>}
                {sortedStages.filter(s => enabledStageCols.has(s.id)).map(s => (
                  <th key={s.id} className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  </th>
                ))}
                {includeTaskCols && <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Tasks</th>}
                {enabledCols.has('lastUpdated') && <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Updated</th>}
                {enabledCols.has('updatedBy') && <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">By</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={20} className="text-center py-10 text-gray-400">No apartments match the current filters</td></tr>
              ) : (
                filtered.map((apt, i) => {
                  const stage = stages.find(s => s.id === apt.currentStageId);
                  const aptTasks = includeTaskCols ? getAptTasks(apt.id) : [];
                  const doneCount = aptTasks.filter(t => t.completedAt).length;
                  return (
                    <tr key={apt.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      {enabledCols.has('building') && (
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-[#1e3a5f]">{apt.buildingId}</span>
                        </td>
                      )}
                      {enabledCols.has('apartment') && (
                        <td className="px-4 py-2.5 font-medium text-gray-800">
                          {apt.displayName || apt.apartmentNumber || <span className="text-gray-400 italic">Unnamed</span>}
                        </td>
                      )}
                      {enabledCols.has('floor') && (
                        <td className="px-4 py-2.5 text-gray-600">{apt.floor === 0 ? 'G' : apt.floor}</td>
                      )}
                      {enabledCols.has('stage') && (
                        <td className="px-4 py-2.5">
                          {stage ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ backgroundColor: stage.color + '22', color: stage.color }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
                              {stage.name}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">Not Started</span>
                          )}
                        </td>
                      )}
                      {enabledCols.has('classification') && (
                        <td className="px-4 py-2.5">
                          {apt.classification === 'shinui'
                            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 font-medium">Changes</span>
                            : <span className="text-gray-500 text-xs">Standard</span>}
                        </td>
                      )}
                      {enabledCols.has('generalNotes') && (
                        <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate text-xs">{apt.generalNotes || '—'}</td>
                      )}
                      {sortedStages.filter(s => enabledStageCols.has(s.id)).map(s => (
                        <td key={s.id} className="px-4 py-2.5 text-gray-600 max-w-xs truncate text-xs">
                          {getNotes(apt.id, s.id) || '—'}
                        </td>
                      ))}
                      {includeTaskCols && (
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                          {aptTasks.length === 0
                            ? <span className="text-gray-400">—</span>
                            : <span className={doneCount === aptTasks.length ? 'text-green-600 font-medium' : 'text-gray-600'}>
                                {doneCount}/{aptTasks.length} done
                              </span>
                          }
                        </td>
                      )}
                      {enabledCols.has('lastUpdated') && (
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                          {apt.updatedAt ? format(new Date(apt.updatedAt), 'MMM d, yyyy') : '—'}
                        </td>
                      )}
                      {enabledCols.has('updatedBy') && (
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{apt.updatedByName || '—'}</td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
