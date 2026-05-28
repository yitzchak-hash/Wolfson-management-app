import React, { useState, useMemo } from 'react';
import { Download, Printer, Filter } from 'lucide-react';
import { useStore } from '../data/store';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';

type BuildingFilter = 'all' | 'A1' | 'A2' | 'A3';
type ClassFilter = 'all' | 'standard' | 'shinui';

export function ReportsPage() {
  const { apartments, stages, stageNotes } = useStore();

  const [buildingFilter, setBuildingFilter] = useState<BuildingFilter>('all');
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [includeNoStage, setIncludeNoStage] = useState(true);

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);

  const filtered = useMemo(() => {
    return apartments.filter(apt => {
      if (buildingFilter !== 'all' && apt.buildingId !== buildingFilter) return false;
      if (classFilter !== 'all' && apt.classification !== classFilter) return false;
      if (stageFilter.length > 0) {
        if (!apt.currentStageId && !includeNoStage) return false;
        if (apt.currentStageId && !stageFilter.includes(apt.currentStageId)) return false;
      } else if (!includeNoStage && !apt.currentStageId) {
        return false;
      }
      return true;
    });
  }, [apartments, buildingFilter, classFilter, stageFilter, includeNoStage]);

  function toggleStage(id: string) {
    setStageFilter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function getNotes(aptId: string, stageId: string): string {
    return stageNotes.find(n => n.apartmentId === aptId && n.stageId === stageId)?.noteText ?? '';
  }

  function getStageName(stageId: string | null): string {
    if (!stageId) return 'Not Started';
    return stages.find(s => s.id === stageId)?.name ?? stageId;
  }

  function exportCSV() {
    const stageHeaders = sortedStages.map(s => s.name);
    const headers = ['Building', 'Apartment', 'Floor', 'Current Stage', 'Classification', 'Shinui Description', 'Shinui Requested By', 'General Notes', ...stageHeaders, 'Last Updated', 'Last Updated By'];

    const rows = filtered.map(apt => {
      const stageNoteCols = sortedStages.map(s => getNotes(apt.id, s.id));
      return [
        apt.buildingId,
        apt.displayName || apt.apartmentNumber || '(unnamed)',
        apt.floor === 0 ? 'Ground' : String(apt.floor),
        getStageName(apt.currentStageId),
        apt.classification === 'shinui' ? 'Shinui/Change' : 'Standard',
        apt.shinuiDetails?.description ?? '',
        apt.shinuiDetails?.requestedBy ?? '',
        apt.generalNotes,
        ...stageNoteCols,
        apt.updatedAt ? format(new Date(apt.updatedAt), 'yyyy-MM-dd HH:mm') : '',
        apt.updatedByName || '',
      ];
    });

    const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const csvContent = [
      headers.map(escape).join(','),
      ...rows.map(row => row.map(escape).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `wolfson-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <div className="flex gap-2">
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

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-gray-500" />
          <h2 className="font-semibold text-gray-700 text-sm">Filters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Building */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Building</label>
            <div className="flex gap-1.5">
              {(['all', 'A1', 'A2', 'A3'] as const).map(b => (
                <button
                  key={b}
                  onClick={() => setBuildingFilter(b)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    buildingFilter === b ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {b === 'all' ? 'All' : b}
                </button>
              ))}
            </div>
          </div>

          {/* Classification */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Classification</label>
            <div className="flex gap-1.5">
              {(['all', 'standard', 'shinui'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setClassFilter(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
                    classFilter === c
                      ? c === 'shinui' ? 'bg-amber-500 text-white border-amber-500' : 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {c === 'shinui' ? 'Shinui' : c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* No stage toggle */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Include Not Started</label>
            <button
              onClick={() => setIncludeNoStage(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                includeNoStage ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {includeNoStage ? 'Yes' : 'No'}
            </button>
          </div>
        </div>

        {/* Stage filter */}
        <div className="mt-4">
          <label className="text-xs font-medium text-gray-500 mb-2 block">Stages (leave empty for all)</label>
          <div className="flex flex-wrap gap-2">
            {sortedStages.map(s => (
              <button
                key={s.id}
                onClick={() => toggleStage(s.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  stageFilter.includes(s.id) ? 'opacity-100' : 'opacity-50'
                }`}
                style={{
                  backgroundColor: stageFilter.includes(s.id) ? s.color + '22' : '#f9fafb',
                  borderColor: stageFilter.includes(s.id) ? s.color + '55' : '#e5e7eb',
                  color: stageFilter.includes(s.id) ? s.color : '#9ca3af',
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results count */}
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
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Building</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Apartment</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Floor</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Stage</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Class</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">General Notes</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Last Updated</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Updated By</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-400">
                    No apartments match the current filters
                  </td>
                </tr>
              ) : (
                filtered.map((apt, i) => {
                  const stage = stages.find(s => s.id === apt.currentStageId);
                  return (
                    <tr key={apt.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-[#1e3a5f]">{apt.buildingId}</span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        {apt.displayName || apt.apartmentNumber || <span className="text-gray-400 italic">Unnamed</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {apt.floor === 0 ? 'G' : apt.floor}
                      </td>
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
                      <td className="px-4 py-2.5">
                        {apt.classification === 'shinui' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 font-medium">Shinui</span>
                        ) : (
                          <span className="text-gray-500 text-xs">Standard</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">{apt.generalNotes || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">
                        {apt.updatedAt ? format(new Date(apt.updatedAt), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{apt.updatedByName || '—'}</td>
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
