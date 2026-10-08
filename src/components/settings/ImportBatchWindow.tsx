/**
 * ONE IMPORT, AS THE BOARD DRAWS IT (owner, 2026-10-08).
 *
 * "I want to be able to click on this and see what was imported, exactly
 * what job — I want to see the tiles and be able to click on them, just like
 * on the board." A row in Job Board project settings → Import jobs opens this
 * window: that batch's jobs as the board's own `JobTile` (the BinBoard idiom
 * — one tile component everywhere, so this window can never drift from the
 * board), a forgiving search over them (`searchJobs`, the group window's
 * search), a count, and each tile opens the real job window.
 *
 * Gestures are the board's: a click picks a tile, a click on the picked one
 * (or a double-click) opens it — the touch rule and the mouse rule in one.
 * The tile's own buttons are real here too: lock, the wallboard switch, the
 * ungroup chip, the thumbs and the X (which files the job into Trash, as on
 * the board — never a permanent delete). Only the resize corner is hidden:
 * this window lays the tiles in a grid, so a tile's own size has no say.
 *
 * A batch is a thousand jobs, so only the rows on screen (and two either side)
 * are mounted — the viewport-culling rule the board and the group window
 * already keep. The grid is measured by a damped ResizeObserver and the
 * visible band only re-renders when it actually moves a row.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { useStore } from '../../data/store';
import type { Apartment, CanvasElement } from '../../types';
import { BIN_META, BinKind, binKeyOf, binLabelOf, relativeTime } from '../../types';
import { JobTile, BoardHandlers, TILE_W, TILE_H } from '../board/BoardItems';
import { progressOf } from '../../data/stageMarks';
import { problemStates } from '../../data/problems';
import { searchJobs } from '../../data/searchIndex';
import { ApartmentDetailDrawer } from '../apartment/ApartmentDetailDrawer';
import { QuickAddTaskPanel } from '../apartment/QuickAddTaskPanel';
import { Toast } from '../ui/Toast';

const GAP = 18;
const PAD = 18;
/** The group caption under each tile. */
const CAPTION = 18;
const ROW_H = TILE_H + CAPTION + GAP;

/** Does this job id belong to the batch? A stamp of '' is the legacy bucket (ids with no parsable stamp). */
export function inImportBatch(id: string, stamp: string): boolean {
  if (stamp) return id.startsWith(`G-imp-${stamp}-`);
  return id.startsWith('G-imp-') && !/^G-imp-\d+-/.test(id);
}

const noop = () => {};

export function ImportBatchWindow({ stamp, label, onClose }: {
  stamp: string;
  /** The batch's date as the card prints it. */
  label: string;
  onClose: () => void;
}) {
  const apartments = useStore(st => st.apartments);
  const stages = useStore(st => st.stages);
  const assignments = useStore(st => st.contractorAssignments);
  const canvasElements = useStore(st => st.canvasElements);
  const currentUser = useStore(st => st.currentUser);
  const updateApartment = useStore(st => st.updateApartment);
  const moveToBin = useStore(st => st.moveToBin);
  const s = useStore(st => st.mainUiStrings);

  const [q, setQ] = useState('');
  const [needle, setNeedle] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setNeedle(q.trim()), 140);
    return () => clearTimeout(t);
  }, [q]);
  const [picked, setPicked] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addTaskFor, setAddTaskFor] = useState<Apartment | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const jobs = useMemo(() => apartments.filter(a => a.buildingId === 'G' && inImportBatch(a.id, stamp)), [apartments, stamp]);
  const edited = useMemo(() => jobs.filter(a => a.contentUpdatedAt && a.contentUpdatedAt !== a.createdAt).length, [jobs]);
  const sortedStages = useMemo(() => [...stages].sort((x, y) => x.order - y.order), [stages]);
  const shown = useMemo(() => {
    if (needle) return searchJobs(jobs, needle, { stages, includeTrash: true, limit: 2000, perKind: 2000 }).map(h => h.rec);
    return [...jobs].sort((x, y) => (x.displayName || '').localeCompare(y.displayName || ''));
  }, [jobs, needle, stages]);

  const openTasks = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assignments) if (!a.completedAt) m.set(a.apartmentId, (m.get(a.apartmentId) ?? 0) + 1);
    return m;
  }, [assignments]);
  const problems = useMemo(() => problemStates(assignments), [assignments]);
  const groupOf = useMemo(() => {
    const m = new Map<string, { label: string; color: string }>();
    for (const k of Object.keys(BIN_META) as BinKind[]) m.set(k, BIN_META[k]);
    for (const el of canvasElements as CanvasElement[]) {
      if (el.type !== 'bin') continue;
      m.set(binKeyOf(el), { label: binLabelOf(el), color: el.color || (el.binKind ? BIN_META[el.binKind].color : '#64748b') });
    }
    return m;
  }, [canvasElements]);

  const tileLabels = useMemo(
    () => ({ job: s.jobLabel, folder: s.openFolderTooltip, plans: s.engineeringPlans }),
    [s.jobLabel, s.openFolderTooltip, s.engineeringPlans],
  );

  // ── The grid, measured, and the band of rows on screen ──────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth, h = el.clientHeight;
      setBox(prev => (Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1 ? prev : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cols = Math.max(1, Math.floor((box.w - PAD * 2 + GAP) / (TILE_W + GAP)));
  const rows = Math.ceil(shown.length / cols);
  const gridW = cols * TILE_W + (cols - 1) * GAP;
  const left0 = Math.max(PAD, (box.w - gridW) / 2);
  const [band, setBand] = useState({ first: 0, last: 8 });
  const readBand = () => {
    const el = scrollRef.current;
    if (!el) return;
    const first = Math.max(0, Math.floor((el.scrollTop - PAD) / ROW_H) - 2);
    const last = Math.ceil((el.scrollTop + el.clientHeight) / ROW_H) + 2;
    setBand(prev => (prev.first === first && prev.last === last ? prev : { first, last }));
  };
  useLayoutEffect(readBand, [box.h, shown.length, cols]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new search starts at the top of its answers.
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; readBand(); }, [needle]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The tile's handlers — the board's bundle, held in a ref (memoisation) ──
  const pressRef = useRef<{ id: string; x: number; y: number; wasPicked: boolean } | null>(null);
  const live = useRef<Partial<BoardHandlers>>({});
  live.current = {
    jobDown: (e, j) => {
      if ((e.target as HTMLElement).closest('[data-no-drag],a,button')) return;
      pressRef.current = { id: j.id, x: e.clientX, y: e.clientY, wasPicked: picked === j.id };
    },
    jobUp: (e, j) => {
      const p = pressRef.current;
      pressRef.current = null;
      if (!p || p.id !== j.id || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) return;
      if (p.wasPicked) setOpenId(j.id); else setPicked(j.id);
    },
    jobOpen: j => { setPicked(j.id); setOpenId(j.id); },
    jobDelete: ids => {
      ids.forEach(id => moveToBin(id, 'trash'));
      setToast({ msg: s.importMovedToTrash, type: 'success' });
    },
    jobTv: j => { if (currentUser) updateApartment(j.id, { showOnTv: j.showOnTv === false ? undefined : false }, currentUser); },
    jobLock: j => { if (currentUser) updateApartment(j.id, { boardLocked: j.boardLocked ? undefined : true }, currentUser); },
    jobFocus: j => document.querySelector(`[data-import-window] [data-node-id="${j.id}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    jobUngroup: j => { if (currentUser) updateApartment(j.id, { boardGroup: undefined }, currentUser); },
    jobThumbs: (id, d) => {
      const j = apartments.find(a => a.id === id);
      if (j && currentUser) updateApartment(id, { thumbsUp: Math.max(0, (j.thumbsUp ?? 0) + d) || undefined }, currentUser);
    },
    jobThumbsDown: (id, d) => {
      const j = apartments.find(a => a.id === id);
      if (j && currentUser) updateApartment(id, { thumbsDown: Math.max(0, (j.thumbsDown ?? 0) + d) || undefined }, currentUser);
    },
  };
  const H = useRef<BoardHandlers>({
    jobDown: (e, j, i) => live.current.jobDown?.(e, j, i),
    jobMove: noop,
    jobUp: (e, j) => live.current.jobUp?.(e, j),
    jobMenu: noop,
    jobOpen: j => live.current.jobOpen?.(j),
    jobDelete: ids => live.current.jobDelete?.(ids),
    jobTv: j => live.current.jobTv?.(j),
    jobLock: j => live.current.jobLock?.(j),
    jobFocus: j => live.current.jobFocus?.(j),
    elFocus: noop,
    jobUngroup: j => live.current.jobUngroup?.(j),
    elUngroup: noop,
    jobResizeDown: noop, jobResizeMove: noop, jobResizeUp: noop,
    jobThumbs: (id, d) => live.current.jobThumbs?.(id, d),
    jobThumbsDown: (id, d) => live.current.jobThumbsDown?.(id, d),
    elDown: noop, elMove: noop, elUp: noop, elMenu: noop, elEdit: noop, elSeen: noop,
    elSettings: noop, elDelete: noop, elColor: noop, elPatch: noop, elThumbs: noop, elThumbsDown: noop,
    artUse: noop, editChange: noop, editCommit: noop, editCancel: noop,
    resizeDown: noop, resizeMove: noop, resizeUp: noop,
    openBin: noop, binCount: () => 0,
  } as BoardHandlers).current;

  // ── Escape closes the window — unless the job window or the task panel
  // over it is open: that Escape belongs to them. Read through a ref, so the
  // listener registered once still sees the latest answer. ──
  // One thing at a time, the app's Escape ladder: a search first, then the window.
  const overRef = useRef(false);
  overRef.current = !!openId || !!addTaskFor;
  const qRef = useRef('');
  qRef.current = q;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || overRef.current) return;
      if (qRef.current) { setQ(''); setNeedle(''); return; }
      onClose();
    };
    // CAPTURE, so this runs before the job window's own (bubble) Escape: a
    // native keydown flushes React between listeners, and read after the job
    // window had closed itself the same press would also clear the search.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const liveOpen = openId ? apartments.find(a => a.id === openId) ?? null : null;
  const total = jobs.length;
  const countText = needle
    ? s.importWindowShown.replace('{shown}', String(shown.length)).replace('{n}', String(total))
    : s.importWindowCount.replace('{n}', String(total));

  const tiles: React.ReactNode[] = [];
  const firstIdx = band.first * cols;
  const lastIdx = Math.min(shown.length, (band.last + 1) * cols);
  for (let i = firstIdx; i < lastIdx; i++) {
    const a = shown[i];
    const r = Math.floor(i / cols), c = i % cols;
    const x = left0 + c * (TILE_W + GAP), y = PAD + r * ROW_H;
    const grp = a.boardBin ? groupOf.get(a.boardBin) : null;
    tiles.push(
      <React.Fragment key={a.id}>
        <JobTile
          job={a}
          index={i}
          x={x} y={y} w={TILE_W} h={TILE_H}
          stage={stages.find(st => st.id === a.currentStageId) ?? null}
          progress={progressOf(a, sortedStages)}
          pendingTasks={openTasks.get(a.id) ?? 0}
          isSelected={picked === a.id}
          isDragging={false}
          justChanged={false}
          searchLit={false}
          fallbackBorder="#e2e8f0"
          lastEdited={a.contentUpdatedAt ? relativeTime(a.contentUpdatedAt) : ''}
          labels={tileLabels}
          H={H}
          problem={problems.get(a.id) ?? null}
        />
        <span data-import-tile-group={a.id}
          className="absolute flex items-center gap-1 text-[10.5px] font-semibold text-gray-500 truncate pointer-events-none"
          style={{ left: x + 4, top: y + TILE_H + 3, width: TILE_W - 8, height: CAPTION - 4 }}>
          {grp && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: grp.color }} />}
          <span className="truncate">{grp ? grp.label : s.jobLabel}</span>
        </span>
      </React.Fragment>,
    );
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/45 z-[100]" onClick={onClose} />
      <div data-import-window={stamp || 'legacy'}
        className="fixed z-[101] bg-slate-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                 width: 'min(1240px, 96vw)', height: 'min(900px, 92vh)' }}>
        {/* The tiles are laid in a grid: a tile's own size has no say here,
            so its resize corner would be a handle that does nothing. */}
        <style>{'[data-import-window] [data-resize]{display:none!important}'}</style>
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-white border-b border-gray-200">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-gray-900 truncate">
              {s.importWindowTitle.replace('{date}', label)}
            </h3>
            <p data-import-count className="text-[11.5px] text-gray-500">
              {countText}
              {edited > 0 && <> · <b className="text-amber-700">{s.importWindowEdited.replace('{n}', String(edited))}</b></>}
              <span className="text-gray-400"> · {s.importWindowHint}</span>
            </p>
          </div>
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white w-full sm:w-72">
            <Search size={14} className="text-gray-400 flex-shrink-0" />
            <input data-import-search autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder={s.importWindowSearch}
              className="flex-1 min-w-0 text-[13px] outline-none bg-transparent" />
            {q && (
              <button onClick={() => { setQ(''); setNeedle(''); }} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
            )}
          </label>
          <button data-import-close onClick={onClose} title={s.cancel}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div ref={scrollRef} onScroll={readBand} className="flex-1 overflow-y-auto overflow-x-hidden relative">
          {shown.length === 0 ? (
            <p data-import-empty className="p-8 text-center text-sm text-gray-400">{s.importWindowEmpty}</p>
          ) : (
            <div className="relative" style={{ height: PAD * 2 + rows * ROW_H }}>
              {tiles}
            </div>
          )}
        </div>
      </div>

      {liveOpen && currentUser && (
        <ApartmentDetailDrawer
          apartment={liveOpen}
          onClose={() => setOpenId(null)}
          currentUser={currentUser}
          onToast={(msg, type) => setToast({ msg, type: type ?? 'success' })}
          onRequestAddTask={apt => { setOpenId(null); setAddTaskFor(apt); }}
        />
      )}
      {/* The task panel sits at z-40/50 — lifted above this window. */}
      {addTaskFor && currentUser && (
        <div style={{ position: 'relative', zIndex: 130 }}>
          <QuickAddTaskPanel
            apartment={addTaskFor}
            currentUser={currentUser}
            onClose={() => setAddTaskFor(null)}
            onToast={msg => setToast({ msg, type: 'success' })}
          />
        </div>
      )}
      {toast && (
        <div style={{ position: 'relative', zIndex: 140 }}>
          <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
        </div>
      )}
    </>,
    document.body,
  );
}
