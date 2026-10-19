import React, { useMemo, useState } from 'react';
import { Search, Briefcase, MapPin } from 'lucide-react';
import { Apartment, aptLabel, binKeyOf, binLabelOf, projectShortName } from '../../types';
import { useStore, loadProjectSnapshot } from '../../data/store';
import { searchJobs } from '../../data/searchIndex';

/**
 * "Add existing" — the second tab of the Job Board's Add Job window (owner,
 * recording 2026-10-15: "I need a way also over here to click add existing,
 * that will take an existing job and create another tile for it, with a
 * search here").
 *
 * Nothing is copied. A Job Board job comes back as ANOTHER TILE OF THE SAME
 * RECORD (stored as a ghost position; never called that on screen) — so an edit through either is an edit to the job; that is
 * true even for a job filed in a group, a notebook or a pin board, which then
 * shows on the board as well without leaving where it is. A unit from another
 * workspace lands as a unit card, the board's standing pointer at it.
 * Trash never appears.
 */
export interface ExistingPick {
  job: Apartment;
  /** Set for a unit that lives in another workspace. */
  projectId?: string;
}

interface Row extends ExistingPick {
  where: string;
}

export function AddExistingJob({ onPick, onCancel }: {
  onPick: (p: ExistingPick) => void;
  onCancel: () => void;
}) {
  const s = useStore(st => st.mainUiStrings);
  const apartments = useStore(st => st.apartments);
  const canvasElements = useStore(st => st.canvasElements);
  const projects = useStore(st => st.projects);
  const currentProjectId = useStore(st => st.currentProjectId);
  const tick = useStore(st => st.snapshotTick);
  const [q, setQ] = useState('');
  const he = !!s.isRtl;

  // Where a Job Board job sits now, in words: on the board, or in a group.
  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    canvasElements.filter(e => e.type === 'bin').forEach(b => m.set(binKeyOf(b), binLabelOf(b)));
    return m;
  }, [canvasElements]);

  const own = useMemo(() => apartments.filter(a =>
    a.buildingId === 'G' && !a.isUnnamed && a.boardBin !== 'trash'), [apartments]);

  // Other workspaces' units, from what this machine last saw of them.
  const foreign = useMemo(() => projects
    .filter(p => p.id !== currentProjectId && p.id !== 'general')
    .map(p => ({ p, units: loadProjectSnapshot(p.id).apartments
      .filter(a => !a.isUnnamed && (a.apartmentNumber || a.displayName)) })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [projects, currentProjectId, tick]);

  const rows: Row[] = useMemo(() => {
    const text = q.trim();
    if (!text) return [];
    const out: Row[] = [];
    for (const h of searchJobs(own, text, { includeTrash: false }).slice(0, 25)) {
      const j = h.rec;
      const where = j.boardBin ? `${he ? 'בקבוצה' : 'In'} ${groupOf.get(j.boardBin) ?? j.boardBin}`
        : j.inNotebook ? (he ? 'במחברת / בלוח' : 'In a notebook or pin board')
        : (he ? 'על הלוח' : 'On the board');
      out.push({ job: j, where });
    }
    for (const { p, units } of foreign) {
      for (const h of searchJobs(units, text, { includeTrash: false }).slice(0, 8)) {
        out.push({ job: h.rec, projectId: p.id, where: projectShortName(p, he) });
      }
    }
    return out;
  }, [q, own, foreign, groupOf, he]);

  return (
    <div className="space-y-3" data-add-existing>
      <div className="relative">
        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} data-add-existing-search
          data-enter-own
          placeholder={he ? 'חפשו עבודה קיימת…' : 'Search for an existing job…'}
          className="w-full border border-gray-200 rounded-xl ps-9 pe-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
      </div>
      <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-1">
        {q.trim() && rows.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-6">
            {he ? 'לא נמצאה עבודה בשם הזה' : 'No job by that name'}
          </div>
        )}
        {!q.trim() && (
          <div className="text-[12.5px] text-gray-400 leading-snug py-2">
            {he
              ? 'בחרו עבודה ותופיע אריח נוסף שלה במרכז המסך — אותה עבודה, לא עותק.'
              : 'Pick a job and another tile of it lands in the middle of the screen — the same job, not a copy.'}
          </div>
        )}
        {rows.map(r => (
          <button key={`${r.projectId ?? 'g'}:${r.job.id}`} type="button"
            data-add-existing-row={r.job.id}
            onClick={() => onPick({ job: r.job, projectId: r.projectId })}
            className="w-full text-start flex items-center gap-2.5 px-3 py-2 rounded-xl border border-gray-100 hover:border-[#4aa8d8] hover:bg-sky-50 transition-colors">
            {r.projectId ? <MapPin size={14} className="text-amber-600 flex-shrink-0" />
              : <Briefcase size={14} className="text-gray-400 flex-shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-900 truncate">
                {aptLabel(r.job) || r.job.displayName || (he ? 'עבודה' : 'Job')}
              </span>
              <span className="block text-[11px] text-gray-400 truncate">{r.where}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-all">
          {s.cancel}
        </button>
      </div>
    </div>
  );
}
