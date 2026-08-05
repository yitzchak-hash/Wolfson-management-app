import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, MapPin, CornerDownLeft } from 'lucide-react';
import { Apartment, CanvasElement, Stage, ContractorAssignment, binLabelOf } from '../../types';

export interface BoardHit {
  job: Apartment;
  /** The bin it sits in, or null when it is out on the board. */
  bin: CanvasElement | null;
  /** Why it matched, so the result can say so rather than looking arbitrary. */
  why: string;
}

/**
 * Search across the whole board, bins included.
 *
 * The point of including the bins is that "where did that job go?" is the
 * question this answers, and half the time the answer is "you filed it". A
 * result therefore says which group it is in, and picking it takes you there —
 * opening the group if it needs to — rather than just telling you.
 */
export function BoardSearch({
  jobs, bins, stages, assignments, onGo, onClose,
}: {
  jobs: Apartment[];
  bins: CanvasElement[];
  stages: Stage[];
  assignments: ContractorAssignment[];
  onGo: (hit: BoardHit) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = useMemo<BoardHit[]>(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const binByKey = new Map(bins.map(b => [b.binKind ?? b.id, b]));
    const out: BoardHit[] = [];

    for (const job of jobs) {
      const name = (job.displayName ?? '').toLowerCase();
      const addr = (job.address ?? '').toLowerCase();
      const notes = (job.generalNotes ?? '').toLowerCase();
      const stage = stages.find(s => s.id === job.currentStageId)?.name.toLowerCase() ?? '';
      const task = assignments.find(a =>
        a.apartmentId === job.id && (a.taskDescription ?? '').toLowerCase().includes(needle));

      let why = '';
      if (name.includes(needle)) why = 'name';
      else if (addr.includes(needle)) why = job.address ?? 'address';
      else if (stage.includes(needle)) why = `stage · ${stages.find(s => s.id === job.currentStageId)?.name}`;
      else if (task) why = `task · ${task.taskDescription}`;
      else if (notes.includes(needle)) why = 'in the notes';
      else continue;

      out.push({ job, bin: job.boardBin ? binByKey.get(job.boardBin) ?? null : null, why });
    }

    // Jobs out on the board first — those are the ones being worked on.
    return out.sort((a, b) => (a.bin ? 1 : 0) - (b.bin ? 1 : 0)).slice(0, 40);
  }, [q, jobs, bins, stages, assignments]);

  useEffect(() => setCursor(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('[data-on]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && hits[cursor]) { e.preventDefault(); onGo(hits[cursor]); }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/35 z-[85]" onClick={onClose} />
      <div
        className="fixed z-[90] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ left: '50%', top: '13%', transform: 'translateX(-50%)', width: 'min(620px, 94vw)', maxHeight: '68vh' }}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <Search size={17} className="text-gray-400" />
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Find a job — name, address, stage, task or note"
            className="flex-1 text-[15px] outline-none bg-transparent"
          />
          <button onClick={onClose} className="p-1 text-gray-300 hover:text-gray-500"><X size={16} /></button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto">
          {q.trim() && hits.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Nothing matches “{q.trim()}” — on the board or in any group.
            </div>
          )}
          {!q.trim() && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Searches everything, including jobs you have filed into a group.
            </div>
          )}
          {hits.map((h, i) => {
            const st = stages.find(s => s.id === h.job.currentStageId);
            const on = i === cursor;
            return (
              <button
                key={h.job.id}
                data-on={on || undefined}
                onMouseEnter={() => setCursor(i)}
                onClick={() => onGo(h)}
                className="w-full text-left px-4 py-2.5 flex items-center gap-3 border-b border-gray-50"
                style={{ backgroundColor: on ? 'rgba(74,168,216,.10)' : undefined }}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: st?.color ?? '#cbd5e1' }} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[13.5px] text-gray-900 truncate">
                    {h.job.displayName || 'Job'}
                  </span>
                  <span className="block text-[11px] text-gray-500 truncate">
                    {h.why === 'name' && h.job.address
                      ? <><MapPin size={9} className="inline -mt-0.5 mr-0.5" />{h.job.address}</>
                      : h.why}
                  </span>
                </span>

                {/* Where it lives — the whole reason bins are in this search. */}
                {h.bin ? (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: `${h.bin.color}1e`, color: h.bin.color }}>
                    in {binLabelOf(h.bin)}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 bg-gray-100 text-gray-500">
                    on the board
                  </span>
                )}
                {on && <CornerDownLeft size={13} className="text-gray-300 flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        {hits.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400 flex-shrink-0">
            ↑ ↓ to move · Enter to go there · anything in a group opens the group first
          </div>
        )}
      </div>
    </>
  );
}
