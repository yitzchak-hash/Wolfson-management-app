import React, { useMemo, useState } from 'react';
import { useDeleteImpactLine } from '../ui/DeleteImpact';
import { X, Undo2, Trash2, Search } from 'lucide-react';
import { useStore } from '../../data/store';
import { Apartment, BIN_META, BinKind } from '../../types';
import { getBoardTheme } from '../../data/boardThemes';

const BIN_LABELS: Record<string, string> = {
  done: 'Done', ready: 'Ready to Start', archive: 'Archive', trash: 'Trash',
};

/**
 * A window over the main board showing one bin's contents.
 *
 * Deliberately simpler than the board: no canvas, no zoom. You can look without
 * restoring, and restore with one click. Nothing here is ever auto-purged —
 * Trash keeps its contents indefinitely, so this is always a safe place to look.
 * Permanent deletion exists but is explicit, confirmed, and only reachable here.
 */
export function BinWindow({ bin, onClose, onOpenJob }: {
  bin: BinKind;
  onClose: () => void;
  onOpenJob?: (job: Apartment) => void;
}) {
  const { apartments, stages, moveToBin, deleteApartment, contractorAssignments,
    boardSettings, currentProjectId } = useStore();
  /**
   * A bin is a piece of the same board, so it wears the same surface.
   *
   * On cork that means real cork inside a timber surround; on a whiteboard, the
   * aluminium trim. Themes with no physical frame simply get a plain surround —
   * the point is that opening a bin does not feel like leaving the board.
   */
  const theme = getBoardTheme(boardSettings[currentProjectId]?.themeId);
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // What the pending delete takes with it, said ON the button — this confirm
  // has no room for a modal, but it must not have less truth than one.
  const impactLine = useDeleteImpactLine(confirmId);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apartments
      .filter(a => a.boardBin === bin)
      .filter(a => !q || (a.displayName ?? '').toLowerCase().includes(q) || (a.address ?? '').toLowerCase().includes(q))
      .sort((a, b) => (b.binnedAt ?? '').localeCompare(a.binnedAt ?? ''));
  }, [apartments, bin, query]);

  const stageOf = (a: Apartment) => stages.find(s => s.id === a.currentStageId) ?? null;
  const taskCount = (a: Apartment) => contractorAssignments.filter(x => x.apartmentId === a.id).length;

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[80] flex flex-col"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(780px, 92vw)', height: 'min(660px, 86vh)',
          ...(theme.frame ?? { padding: 0, borderRadius: 16, boxShadow: '0 18px 44px rgba(15,23,42,.3)' }),
        }}
      >
       <div className="flex flex-col flex-1 min-h-0 overflow-hidden"
         style={{ borderRadius: theme.frame ? 4 : 16 }}>
        <div className="flex items-center gap-3 px-4 py-3 text-white flex-shrink-0"
          style={{ backgroundColor: BIN_META[bin].color }}>
          <span className="font-bold text-sm">{BIN_LABELS[bin]}</span>
          <span className="text-[11px] text-white/60">{items.length} {items.length === 1 ? 'job' : 'jobs'}</span>
          <span className="flex-1" />
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10"><X size={17} /></button>
        </div>

        <div className="px-4 py-2 flex items-center gap-2 flex-shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,.9)', borderBottom: '1px solid rgba(15,23,42,.08)' }}>
          <Search size={14} className="text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            className="flex-1 text-sm outline-none bg-transparent"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3" style={theme.surface}>
          {items.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm"
              style={{ color: theme.dark ? 'rgba(255,255,255,.55)' : 'rgba(15,23,42,.45)' }}>
              Nothing here.
            </div>
          ) : (
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(228px, 1fr))' }}>
              {items.map(a => {
                const st = stageOf(a);
                return (
                  <div key={a.id} className="p-2.5"
                    style={{ ...theme.node, border: `3px solid ${st?.color ?? '#e2e8f0'}` }}>
                    <button
                      onClick={() => onOpenJob?.(a)}
                      className="font-bold text-sm leading-tight text-left hover:underline"
                      style={{ color: (theme.node.color as string) ?? '#111827' }}
                      title="Open this job">
                      {a.displayName || 'Job'}
                    </button>
                    {a.address && <div className="text-[11px] text-gray-500 truncate mt-0.5">{a.address}</div>}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {st && (
                        <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${st.color}22`, color: st.color }}>{st.name}</span>
                      )}
                      {taskCount(a) > 0 && (
                        <span className="text-[9.5px] text-gray-400">{taskCount(a)} tasks</span>
                      )}
                    </div>
                    {a.binnedAt && (
                      <div className="text-[9px] text-gray-400 mt-1">
                        {new Date(a.binnedAt).toLocaleDateString()}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mt-2.5">
                      <button
                        onClick={() => moveToBin(a.id, null)}
                        className="flex items-center gap-1 text-[11px] font-bold text-[#1e3a5f] px-2 py-1 rounded-lg border border-gray-200 hover:border-[#1e3a5f] transition-colors"
                        title="Move back to board"
                      >
                        <Undo2 size={11} /> Restore
                      </button>
                      {bin === 'trash' && (
                        confirmId === a.id ? (
                          <button
                            onClick={() => { deleteApartment(a.id); setConfirmId(null); }}
                            title={impactLine}
                            className="flex items-center gap-1 text-[11px] font-bold text-white bg-red-600 px-2 py-1 rounded-lg"
                          >
                            <Trash2 size={11} /> Delete forever{impactLine !== 'nothing else attached' ? ' — ' + impactLine : ''}
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmId(a.id)}
                            className="flex items-center gap-1 text-[11px] text-gray-400 px-2 py-1 rounded-lg hover:text-red-500"
                            title="Delete permanently"
                          >
                            <Trash2 size={11} />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {bin === 'trash' && (
          <div className="px-4 py-2 text-[11px] text-gray-500 flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,.92)', borderTop: '1px solid rgba(15,23,42,.08)' }}>
            Nothing in Trash is ever removed automatically. Deleting permanently also removes the job's
            tasks, notes and photos.
          </div>
        )}
       </div>
      </div>
    </>
  );
}
