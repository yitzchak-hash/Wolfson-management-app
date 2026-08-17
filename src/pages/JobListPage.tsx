import React, { useMemo, useState } from 'react';
import { Search, X, ArrowDownUp } from 'lucide-react';
import { useStore } from '../data/store';
import {
  Apartment, isCountableApartment, aptLabel, relativeTime, binLabelOf, binKeyOf,
  getStageName, projectColor,
} from '../types';
import { queryVariants, skeleton } from '../data/translit';
import { MiniJob } from '../components/board/MiniJob';
import { ApartmentDetailDrawer } from '../components/apartment/ApartmentDetailDrawer';
import { QuickAddTaskPanel } from '../components/apartment/QuickAddTaskPanel';
import { Toast } from '../components/ui/Toast';

/**
 * Every job in the workspace as ONE searchable list — the phone's answer to
 * the board.
 *
 * On a phone the board is a keyhole: you pan around looking for a tile you
 * could have typed three letters of. This page is the same records as rows —
 * search on top, sort by what happened last (or name, or stage), a stage
 * filter, and on the Job Board a group filter so "what's in Done" is one tap.
 * A row opens the same job window the board opens. Reachable from the bottom
 * bar; on a desktop the board and diagram remain the natural surfaces, so the
 * sidebar deliberately does not carry it.
 *
 * Search forgives the same way the board's does (translit skeletons), and the
 * same visibility rule applies: Trash never appears, other groups appear
 * labeled.
 */

type SortKey = 'recent' | 'name' | 'stage';

const SORT_LABEL: Record<SortKey, string> = {
  recent: 'Recent activity',
  name: 'Name',
  stage: 'Stage',
};

export function JobListPage() {
  const {
    apartments, stages: allStages, contractorAssignments, canvasElements,
    currentProjectId, currentUser, projects, mainUiStrings: s,
  } = useStore();

  const isGeneral = currentProjectId === 'general';
  const accent = projectColor(projects, currentProjectId);

  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [stageFilter, setStageFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [selectedApt, setSelectedApt] = useState<Apartment | null>(null);
  const [addTaskApt, setAddTaskApt] = useState<Apartment | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const stages = useMemo(
    () => allStages
      .filter(st => (isGeneral ? st.projectId === 'general' : !st.projectId))
      .sort((a, b) => a.order - b.order),
    [allStages, isGeneral],
  );

  /** Group key → label, for the Job Board's filter chips and row subtitles. */
  const groups = useMemo(() => {
    if (!isGeneral) return [];
    return canvasElements
      .filter(el => el.type === 'bin' && !el.board && el.binKind !== 'trash')
      .map(el => ({ key: binKeyOf(el), label: binLabelOf(el) }));
  }, [canvasElements, isGeneral]);
  const groupLabel = useMemo(() => new Map(groups.map(g => [g.key, g.label])), [groups]);

  const units = useMemo(() => {
    let list = isGeneral
      ? apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed && a.boardBin !== 'trash')
      : apartments.filter(isCountableApartment);

    if (stageFilter) list = list.filter(a => a.currentStageId === stageFilter);
    if (groupFilter) {
      list = groupFilter === '__board'
        ? list.filter(a => !a.boardBin)
        : list.filter(a => a.boardBin === groupFilter);
    }

    const query = q.trim();
    if (query.length >= 2) {
      const v = queryVariants(query);
      const hit = (text: string) => {
        const t = text.toLowerCase();
        if (v.plain.some(p => t.includes(p.toLowerCase()))) return true;
        if (v.skeletons.length) {
          const sk = skeleton(text);
          return v.skeletons.some(k => sk.includes(k));
        }
        return false;
      };
      list = list.filter(a => hit(
        `${aptLabel(a)} ${a.generalNotes ?? ''} ${a.address ?? ''} ${a.phone ?? ''}`));
    }

    const when = (a: Apartment) => a.contentUpdatedAt ?? a.updatedAt ?? '';
    const stageOrder = (a: Apartment) =>
      stages.find(st => st.id === a.currentStageId)?.order ?? Number.MAX_SAFE_INTEGER;
    return [...list].sort((a, b) => {
      if (sort === 'recent') return when(b).localeCompare(when(a));
      if (sort === 'name') return aptLabel(a).localeCompare(aptLabel(b));
      return stageOrder(a) - stageOrder(b) || aptLabel(a).localeCompare(aptLabel(b));
    });
  }, [apartments, isGeneral, stageFilter, groupFilter, q, sort, stages]);

  // Rows read the freshest copy so an edit in the drawer shows on close.
  const liveApt = selectedApt ? apartments.find(a => a.id === selectedApt.id) ?? null : null;

  function cycleSort() {
    setSort(prev => (prev === 'recent' ? 'name' : prev === 'name' ? 'stage' : 'recent'));
  }

  return (
    // A plain block, not a flex column: as a squeezed column the chip rows
    // shrank vertically under the weight of the list and drew half-cut.
    <div className="p-3 md:p-6 w-full max-w-2xl mx-auto">
      {/* Search, and the sort toggle beside it — one row, phone first. */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0 bg-white border border-gray-200 rounded-xl px-3">
          <Search size={15} className="text-gray-400 flex-shrink-0" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={s.searchPlaceholder}
            className="w-full min-w-0 py-2.5 text-sm outline-none bg-transparent"
          />
          {q && (
            <button onClick={() => setQ('')} className="p-1 text-gray-400 flex-shrink-0" title="Clear">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={cycleSort}
          title="Change the sort"
          className="flex items-center gap-1.5 px-2.5 py-2.5 rounded-xl border border-gray-200 bg-white
                     text-[11px] font-semibold text-gray-600 flex-shrink-0"
        >
          <ArrowDownUp size={13} style={{ color: accent }} />
          {SORT_LABEL[sort]}
        </button>
      </div>

      {/* Stage chips — the same one-line scroller the phone diagram uses. */}
      <div className="flex items-center gap-1.5 overflow-x-auto edge-fade pb-1 mb-1 [&>*]:flex-shrink-0">
        <Chip on={!stageFilter} accent={accent} onClick={() => setStageFilter('')}>All stages</Chip>
        {stages.map(st => (
          <Chip key={st.id} on={stageFilter === st.id} accent={st.color}
            onClick={() => setStageFilter(f => (f === st.id ? '' : st.id))}>
            <span className="w-2 h-2 rounded-full inline-block me-1" style={{ backgroundColor: st.color }} />
            {getStageName(st, !!s.isRtl)}
          </Chip>
        ))}
      </div>

      {/* Group chips — Job Board only. Trash stays out, same as search. */}
      {isGeneral && groups.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto edge-fade pb-1 mb-1 [&>*]:flex-shrink-0">
          <Chip on={!groupFilter} accent={accent} onClick={() => setGroupFilter('')}>Everywhere</Chip>
          <Chip on={groupFilter === '__board'} accent={accent}
            onClick={() => setGroupFilter(f => (f === '__board' ? '' : '__board'))}>On the board</Chip>
          {groups.map(g => (
            <Chip key={g.key} on={groupFilter === g.key} accent={accent}
              onClick={() => setGroupFilter(f => (f === g.key ? '' : g.key))}>{g.label}</Chip>
          ))}
        </div>
      )}

      <div className="text-[11px] text-gray-400 mb-1.5">
        {units.length} {isGeneral ? (units.length === 1 ? 'job' : 'jobs') : (units.length === 1 ? 'unit' : 'units')}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-2 py-1.5 divide-y divide-gray-50">
        {units.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-400">{s.searchNoResults}</div>
        )}
        {units.map(a => {
          const stamp = relativeTime(a.contentUpdatedAt ?? a.updatedAt);
          const where = a.boardBin ? groupLabel.get(a.boardBin) : '';
          const sub = [where, a.address, stamp].filter(Boolean).join(' · ');
          return (
            <div key={a.id} className="py-0.5">
              <MiniJob
                job={a}
                stages={stages}
                assignments={contractorAssignments}
                onOpen={() => setSelectedApt(a)}
                rtl={!!s.isRtl}
                size={13}
                sub={sub || undefined}
              />
            </div>
          );
        })}
      </div>

      {liveApt && currentUser && (
        <ApartmentDetailDrawer
          apartment={liveApt}
          onClose={() => setSelectedApt(null)}
          currentUser={currentUser}
          onToast={(msg, type) => setToast({ msg, type: type ?? 'success' })}
          onRequestAddTask={apt => { setSelectedApt(null); setAddTaskApt(apt); }}
        />
      )}
      {addTaskApt && currentUser && (
        <QuickAddTaskPanel
          apartment={addTaskApt}
          currentUser={currentUser}
          onClose={() => setAddTaskApt(null)}
          onToast={msg => setToast({ msg, type: 'success' })}
        />
      )}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function Chip({ on, accent, onClick, children }: {
  on: boolean; accent: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-full text-[11.5px] font-medium border transition-colors"
      style={on
        ? { backgroundColor: `${accent}1a`, borderColor: accent, color: '#1e293b' }
        : { borderColor: '#e5e7eb', color: '#6b7280', backgroundColor: '#ffffff' }}
    >
      {children}
    </button>
  );
}
