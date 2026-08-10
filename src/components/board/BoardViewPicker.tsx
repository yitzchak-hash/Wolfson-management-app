import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Plus, Check, Users, Lock, Eye, LayoutDashboard } from 'lucide-react';
import { useStore } from '../../data/store';
import { BoardView, boardsForUser, boardAccess } from '../../types';

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
    currentProjectId, currentUser, canvasElements, apartments, users,
  } = useStore();

  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState('');

  const isAdmin = (currentUser?.role ?? '').toLowerCase().includes('admin');

  const mine = useMemo(
    () => boardsForUser(boardViews, currentProjectId, currentUser?.id ?? '', isAdmin),
    [boardViews, currentProjectId, currentUser?.id, isAdmin],
  );

  /**
   * Taken off a board, you land back where you were.
   *
   * Unsharing is done by somebody else, on another machine, while you may be
   * looking at the board they just took you off — so it cannot be handled at
   * the moment of unassigning. It is handled here, on the machine that is
   * actually showing it: the moment a board stops being visible to you, the
   * view falls back to the last one you were on that you can still see, and
   * failing that to the workspace's main board.
   *
   * The previous board is remembered per workspace, so this restores a real
   * place rather than dumping everybody at the top.
   */
  useEffect(() => {
    if (!activeBoardView) return;
    if (mine.some(v => v.id === activeBoardView)) {
      try { localStorage.setItem(`prev_board_${currentProjectId}`, activeBoardView); } catch { /* private mode */ }
      return;
    }
    let back = '';
    try { back = localStorage.getItem(`prev_board_${currentProjectId}`) ?? ''; } catch { /* ignore */ }
    setActiveBoardView(mine.some(v => v.id === back) ? back : '');
  }, [activeBoardView, mine, currentProjectId, setActiveBoardView]);

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
      ownerId: currentUser.id,
      share: {},
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

            {mine.map(v => {
              const access = boardAccess(v, currentUser?.id ?? '', isAdmin);
              const ownerId = v.ownerId ?? '';
              const mineOwn = ownerId === currentUser?.id || (!ownerId && v.createdBy === currentUser?.name);
              const owner = users.find(u => u.id === ownerId)?.name ?? v.createdBy;
              const withCount = Object.keys(v.share ?? {}).length;
              return (
                <Row
                  key={v.id}
                  name={v.name}
                  // WHOSE board it is, under its name. Somebody else's board
                  // appearing in your list with no owner on it is the thing
                  // that made shared boards confusing.
                  sub={mineOwn
                    ? `${countOn(v.id)} things on it · yours${withCount ? ` · shared with ${withCount}` : ''}`
                    : `${countOn(v.id)} things on it · ${owner}’s`}
                  viewOnly={access === 'view'}
                  shared={withCount > 0}
                  restricted={!mineOwn}
                  on={activeBoardView === v.id}
                  onClick={() => { setActiveBoardView(v.id); setOpen(false); }}
                />
              );
            })}

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

function Row({ name, sub, on, onClick, shared, restricted, viewOnly }: {
  name: string; sub: string; on: boolean; onClick: () => void;
  shared?: boolean; restricted?: boolean; viewOnly?: boolean;
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
      {/* A view-only board says so here and on the board itself, so nobody
          spends a minute wondering why nothing will move. */}
      {viewOnly && <span title="View only" className="flex-shrink-0"><Eye size={11} className="text-amber-500" /></span>}
      {restricted && !viewOnly && (
        shared
          ? <Users size={11} className="text-gray-300 flex-shrink-0" />
          : <Lock size={11} className="text-gray-300 flex-shrink-0" />
      )}
    </button>
  );
}
