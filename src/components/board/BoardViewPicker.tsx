import React, { useMemo, useState } from 'react';
import { ChevronDown, Plus, Check, Users, Lock, LayoutDashboard } from 'lucide-react';
import { useStore } from '../../data/store';
import { BoardView, boardsForUser } from '../../types';

/**
 * Which board you are looking at.
 *
 * Worth stating what this fixes, because the assumption behind the request was
 * a reasonable one: boards were never per-user. `canvasElements` lives in the
 * workspace's own Firestore collection, so everyone in a workspace has always
 * shared one surface and there was no way to have a second.
 *
 * A board here is a second surface in the same workspace — its own notes,
 * widgets, groups and arrangement of the SAME jobs. Nothing is duplicated; a
 * job simply remembers where it sits on each.
 *
 * Which board you have open is a preference on your own machine, not shared
 * state: somebody switching to the installation board should not move
 * everybody else's screen.
 */
export function BoardViewPicker({ accent = '#1e3a5f' }: { accent?: string }) {
  const {
    boardViews, activeBoardView, setActiveBoardView, addBoardView,
    currentProjectId, currentUser, canvasElements, apartments,
  } = useStore();

  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState('');

  const isAdmin = (currentUser?.role ?? '').toLowerCase().includes('admin');

  const mine = useMemo(
    () => boardsForUser(boardViews, currentProjectId, currentUser?.id ?? '', isAdmin),
    [boardViews, currentProjectId, currentUser?.id, isAdmin],
  );

  // Nothing to pick between until somebody has made a second board.
  if (mine.length === 0 && !isAdmin) return null;

  const current = mine.find(v => v.id === activeBoardView);
  const label = current?.name ?? 'Main board';

  function countOn(id: string) {
    return canvasElements.filter(el => el.board === id).length
      + (id === '' ? apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed && !a.boardBin).length : 0);
  }

  function create() {
    const name = naming.trim();
    if (!name || !currentUser) return;
    const v: BoardView = {
      id: 'V-' + Math.random().toString(36).slice(2, 9),
      projectId: currentProjectId,
      name,
      // Made for yourself. Sharing it is a deliberate act in settings, so a new
      // board never lands on everybody's screen the moment it is created.
      userIds: [currentUser.id],
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name,
    };
    addBoardView(v);
    setActiveBoardView(v.id);
    setNaming('');
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Which board you are looking at"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-semibold transition-colors"
        style={{ backgroundColor: open ? `${accent}14` : 'transparent', color: accent }}
      >
        <LayoutDashboard size={14} />
        <span className="max-w-[130px] truncate">{label}</span>
        <ChevronDown size={13} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="absolute z-[61] mt-1 rounded-xl bg-white overflow-hidden"
            style={{
              right: 0, width: 268,
              border: '1px solid rgba(15,23,42,.08)',
              boxShadow: '0 16px 40px -8px rgba(15,23,42,.28)',
            }}
          >
            <div className="px-3 pt-2.5 pb-1 text-[9.5px] font-extrabold tracking-wide text-gray-400">
              BOARDS IN THIS WORKSPACE
            </div>

            <Row
              name="Main board"
              sub={`${countOn('')} things on it · everyone`}
              on={activeBoardView === ''}
              onClick={() => { setActiveBoardView(''); setOpen(false); }}
            />

            {mine.map(v => (
              <Row
                key={v.id}
                name={v.name}
                sub={`${countOn(v.id)} things on it · ${
                  v.userIds.length === 0 ? 'everyone'
                    : v.userIds.length === 1 ? 'just one person'
                    : `${v.userIds.length} people`}`}
                shared={v.userIds.length !== 1}
                restricted={v.userIds.length > 0}
                on={activeBoardView === v.id}
                onClick={() => { setActiveBoardView(v.id); setOpen(false); }}
              />
            ))}

            <div className="p-2 border-t border-gray-100">
              <div className="flex items-center gap-1.5">
                <input
                  value={naming}
                  onChange={e => setNaming(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') create(); }}
                  placeholder="Name a new board"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-[12.5px] outline-none focus:ring-2 focus:ring-[#1e3a5f]/20"
                />
                <button
                  onClick={create}
                  disabled={!naming.trim()}
                  className="p-1.5 rounded-lg text-white disabled:opacity-40"
                  style={{ backgroundColor: accent }}
                >
                  <Plus size={14} />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5 leading-snug px-0.5">
                The same jobs, arranged differently. Share it with other people in
                app settings → Users.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ name, sub, on, onClick, shared, restricted }: {
  name: string; sub: string; on: boolean; onClick: () => void;
  shared?: boolean; restricted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
    >
      <span className="w-4 flex-shrink-0">
        {on && <Check size={13} className="text-[#1e3a5f]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-gray-900 truncate">{name}</span>
        <span className="block text-[10.5px] text-gray-400 truncate">{sub}</span>
      </span>
      {restricted && (
        shared
          ? <Users size={11} className="text-gray-300 flex-shrink-0" />
          : <Lock size={11} className="text-gray-300 flex-shrink-0" />
      )}
    </button>
  );
}
