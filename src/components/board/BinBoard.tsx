import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { X, Undo2, Trash2, Search, StickyNote, Square, LayoutGrid, Palette, Check } from 'lucide-react';
import { useStore } from '../../data/store';
import {
  Apartment, CanvasElement, binLabelOf, isBuiltInBin, BIN_META, BinKind,
} from '../../types';
import { getBoardTheme } from '../../data/boardThemes';
import { WidgetStore } from './WidgetStore';
import { WidgetDef, renderWidget, WidgetCtx } from '../../data/widgets';
import { NODE_DEFAULT_SIZE, ART_KINDS, ArtKind, ClipArtNode } from './BoardNodes';

const TILE_W = 190, TILE_H = 116;

/**
 * A bin, opened as a board of its own.
 *
 * A bin was a list you could look at. It is now a real surface: the jobs inside
 * have their own positions, you can put notes, boxes and widgets on it from the
 * same store, and clicking a job opens it exactly as it does outside. It wears
 * the same theme as the main board and, on the physical themes, the same frame.
 *
 * Positions inside a bin are stored in `binX`/`binY`, deliberately separate from
 * `canvasX`/`canvasY` — so a job filed away and later restored goes back to
 * where it was on the main board rather than to wherever it was left in here.
 *
 * The nodes on this board carry `board: <bin key>`, which is the only thing
 * separating them from the main board's nodes. Everything else — dragging,
 * resizing, syncing, backup — is the machinery that was already there.
 */
export function BinBoard({ bin, onClose, onOpenJob, highlightJobId }: {
  bin: CanvasElement;
  onClose: () => void;
  onOpenJob: (job: Apartment) => void;
  /** A job arriving from search: pulsed so the eye lands on it. */
  highlightJobId?: string | null;
}) {
  const {
    apartments, stages, contractors, contractorAssignments, contractorPhotos, activityLogs,
    canvasElements, moveToBin, deleteApartment, updateApartment, currentUser,
    addCanvasElement, updateCanvasElement, deleteCanvasElement,
    boardSettings, currentProjectId,
  } = useStore();

  const binKey = bin.binKind ?? bin.id;
  const theme = getBoardTheme(boardSettings[currentProjectId]?.themeId);
  const accent = bin.color || (bin.binKind ? BIN_META[bin.binKind].color : '#1e3a5f');

  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [drag, setDrag] = useState<
    { kind: 'job' | 'el'; id: string; sx: number; sy: number; gx: number; gy: number; dx: number; dy: number; moved: boolean } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apartments
      .filter(a => a.boardBin === binKey && !a.isUnnamed)
      .filter(a => !q || (a.displayName ?? '').toLowerCase().includes(q)
        || (a.address ?? '').toLowerCase().includes(q))
      .sort((a, b) => (b.binnedAt ?? '').localeCompare(a.binnedAt ?? ''));
  }, [apartments, binKey, query]);

  const nodes = useMemo(
    () => canvasElements.filter(el => el.board === binKey && el.type !== 'bin'),
    [canvasElements, binKey],
  );

  /** Laid out in a grid until somebody drags one, then it keeps its place. */
  const jobPos = useCallback((a: Apartment, i: number) => {
    if (drag?.kind === 'job' && drag.id === a.id) {
      return { x: (a.binX ?? gridX(i)) + drag.dx, y: (a.binY ?? gridY(i)) + drag.dy };
    }
    return { x: a.binX ?? gridX(i), y: a.binY ?? gridY(i) };
  }, [drag]);

  const elPos = useCallback((el: CanvasElement) => {
    if (drag?.kind === 'el' && drag.id === el.id) return { x: el.x + drag.dx, y: el.y + drag.dy };
    return { x: el.x, y: el.y };
  }, [drag]);

  const widgetCtx: WidgetCtx = useMemo(() => ({
    jobs: apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed),
    stages, assignments: contractorAssignments, contractors,
    photos: contractorPhotos, logs: activityLogs,
    update: () => {},
    openJob: (id: string) => { const j = apartments.find(x => x.id === id); if (j) onOpenJob(j); },
  }), [apartments, stages, contractorAssignments, contractors, contractorPhotos, activityLogs, onOpenJob]);

  function toLocal(e: React.PointerEvent) {
    const r = surfaceRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left + (surfaceRef.current?.scrollLeft ?? 0),
                 y: e.clientY - r.top + (surfaceRef.current?.scrollTop ?? 0) }
             : { x: e.clientX, y: e.clientY };
  }

  function startDrag(e: React.PointerEvent, kind: 'job' | 'el', id: string, x: number, y: number) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    e.stopPropagation();
    const p = toLocal(e);
    setDrag({ kind, id, sx: x, sy: y, gx: p.x, gy: p.y, dx: 0, dy: 0, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    const p = toLocal(e);
    const dx = p.x - drag.gx, dy = p.y - drag.gy;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4 });
  }
  function endDrag(job?: Apartment) {
    if (!drag) return;
    if (drag.moved) {
      const x = Math.max(0, Math.round(drag.sx + drag.dx));
      const y = Math.max(0, Math.round(drag.sy + drag.dy));
      if (drag.kind === 'job' && currentUser) updateApartment(drag.id, { binX: x, binY: y }, currentUser);
      if (drag.kind === 'el') updateCanvasElement(drag.id, { x, y });
    } else if (drag.kind === 'job' && job) {
      onOpenJob(job);
    }
    setDrag(null);
  }

  /** Somewhere free, so two new nodes never land on top of each other. */
  function freeSpot(w: number, h: number) {
    const taken = [
      ...nodes.map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h })),
      ...items.map((a, i) => ({ ...jobPos(a, i), w: TILE_W, h: TILE_H })),
    ];
    for (let row = 0; row < 40; row++) {
      for (let col = 0; col < 8; col++) {
        const x = 20 + col * (w + 16), y = 20 + row * (h + 16);
        const clear = !taken.some(t =>
          x < t.x + t.w + 8 && x + w + 8 > t.x && y < t.y + t.h + 8 && y + h + 8 > t.y);
        if (clear) return { x, y };
      }
    }
    return { x: 20, y: 20 };
  }

  function place(def: WidgetDef) {
    const at = freeSpot(def.w, def.h);
    const isArt = def.id.startsWith('art-');
    addCanvasElement({
      id: 'CE-' + Math.random().toString(36).slice(2, 9),
      ...(isArt
        ? { type: 'clipart' as const, art: def.id.slice(4) as ArtKind }
        : { type: 'widget' as const, widget: def.id }),
      board: binKey,               // the one thing that keeps it in this bin
      x: at.x, y: at.y, w: def.w, h: def.h,
      text: '', color: isArt ? '#dc2626' : '#ffffff',
      data: isArt ? {} : (def.data ? JSON.parse(JSON.stringify(def.data)) : {}),
    });
    setStoreOpen(false);
  }

  function addSimple(type: 'note' | 'box') {
    const size = NODE_DEFAULT_SIZE[type];
    const at = freeSpot(size.w, size.h);
    addCanvasElement({
      id: 'CE-' + Math.random().toString(36).slice(2, 9),
      type, board: binKey,
      x: at.x, y: at.y, w: size.w, h: size.h,
      text: type === 'box' ? 'Section' : '',
      color: type === 'box' ? 'rgba(219,234,254,0.45)' : '#fef9c3',
    });
  }

  // The surface must cover its own contents.
  const extent = useMemo(() => {
    let w = 640, h = 380;
    items.forEach((a, i) => {
      const p = jobPos(a, i);
      w = Math.max(w, p.x + TILE_W + 24); h = Math.max(h, p.y + TILE_H + 24);
    });
    nodes.forEach(n => { w = Math.max(w, n.x + n.w + 24); h = Math.max(h, n.y + n.h + 24); });
    return { w, h };
  }, [items, nodes, jobPos]);

  const stageOf = (a: Apartment) => stages.find(s => s.id === a.currentStageId) ?? null;
  const taskCount = (a: Apartment) => contractorAssignments.filter(x => x.apartmentId === a.id).length;

  // A job arriving from a search gets scrolled to and pulsed.
  useEffect(() => {
    if (!highlightJobId) return;
    const t = setTimeout(() => {
      surfaceRef.current
        ?.querySelector(`[data-bin-job="${highlightJobId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 220);
    return () => clearTimeout(t);
  }, [highlightJobId, items.length]);

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[80] flex flex-col bin-window-in"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(900px, 94vw)', height: 'min(700px, 88vh)',
          ...(theme.frame ?? { padding: 0, borderRadius: 16, boxShadow: '0 18px 44px rgba(15,23,42,.3)' }),
        }}
      >
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden"
          style={{ borderRadius: theme.frame ? 4 : 16 }}>

          <div className="flex items-center gap-2 px-3 py-2.5 text-white flex-shrink-0 flex-wrap"
            style={{ backgroundColor: accent }}>
            <span className="font-bold text-sm">{binLabelOf(bin)}</span>
            <span className="text-[11px] text-white/70">
              {items.length} {items.length === 1 ? 'job' : 'jobs'}
            </span>
            <span className="flex-1" />
            <button onClick={() => addSimple('note')} title="Sticky note"
              className="p-1.5 rounded-lg hover:bg-white/15"><StickyNote size={15} /></button>
            <button onClick={() => addSimple('box')} title="Section box"
              className="p-1.5 rounded-lg hover:bg-white/15"><Square size={15} /></button>
            <button onClick={() => setStoreOpen(true)} title="Widget store"
              className="p-1.5 rounded-lg hover:bg-white/15"><LayoutGrid size={15} /></button>
            <span className="w-px h-4 bg-white/25 mx-0.5" />
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15"><X size={16} /></button>
          </div>

          <div className="px-3 py-1.5 flex items-center gap-2 flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,.92)', borderBottom: '1px solid rgba(15,23,42,.08)' }}>
            <Search size={13} className="text-gray-400" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search inside this group…"
              className="flex-1 text-[12.5px] outline-none bg-transparent" />
            <span className="text-[10.5px] text-gray-400">drag to arrange · click to open</span>
          </div>

          <div ref={surfaceRef} className="flex-1 min-h-0 overflow-auto relative"
            onPointerMove={moveDrag} onPointerUp={() => endDrag()}>
            <div className="relative" style={{ width: extent.w, height: extent.h, ...theme.surface }}>
              {items.length === 0 && nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm"
                  style={{ color: theme.dark ? 'rgba(255,255,255,.55)' : 'rgba(15,23,42,.45)' }}>
                  Nothing here yet — drag jobs onto this group from the board.
                </div>
              )}

              {/* Notes, boxes, widgets and clip art that live in this bin. */}
              {nodes.map(el => {
                const p = elPos(el);
                return (
                  <div
                    key={el.id}
                    onPointerDown={e => startDrag(e, 'el', el.id, el.x, el.y)}
                    onPointerMove={moveDrag}
                    onPointerUp={() => endDrag()}
                    className="absolute group rounded-xl cursor-grab select-none"
                    style={{
                      left: p.x, top: p.y, width: el.w, height: el.h,
                      backgroundColor: el.type === 'clipart' ? 'transparent'
                        : el.type === 'box' ? el.color : (el.color || '#fff'),
                      border: el.type === 'clipart' ? 'none' : '1px solid rgba(0,0,0,.10)',
                      boxShadow: el.type === 'clipart' ? 'none' : '0 1px 3px rgba(15,23,42,.10)',
                      touchAction: 'none',
                    }}
                  >
                    <button data-no-drag onClick={() => deleteCanvasElement(el.id)}
                      className="absolute -top-2 -right-2 z-10 p-1 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={11} />
                    </button>
                    {el.type === 'widget' ? renderWidget(el, widgetCtx)
                      : el.type === 'clipart' ? <ClipArtNode el={el} />
                      : (
                        <textarea
                          data-no-drag
                          value={el.text}
                          onChange={e => updateCanvasElement(el.id, { text: e.target.value })}
                          placeholder={el.type === 'box' ? 'Section' : 'Note…'}
                          className="w-full h-full bg-transparent outline-none resize-none p-2.5 text-[12.5px] text-gray-700"
                        />
                      )}
                  </div>
                );
              })}

              {/* The jobs themselves. */}
              {items.map((a, i) => {
                const p = jobPos(a, i);
                const st = stageOf(a);
                const lit = highlightJobId === a.id;
                return (
                  <div
                    key={a.id}
                    data-bin-job={a.id}
                    onPointerDown={e => startDrag(e, 'job', a.id, a.binX ?? gridX(i), a.binY ?? gridY(i))}
                    onPointerMove={moveDrag}
                    onPointerUp={() => endDrag(a)}
                    className={`absolute rounded-xl p-2.5 cursor-grab select-none group ${lit ? 'search-hit' : ''}`}
                    style={{
                      left: p.x, top: p.y, width: TILE_W, height: TILE_H,
                      ...theme.node,
                      border: `3px solid ${st?.color ?? '#e2e8f0'}`,
                      touchAction: 'none',
                      zIndex: drag?.id === a.id ? 20 : 5,
                    }}
                  >
                    <div className="font-bold text-[12.5px] leading-tight truncate"
                      style={{ color: (theme.node.color as string) ?? '#111827' }}>
                      {a.displayName || 'Job'}
                    </div>
                    {a.address && <div className="text-[10.5px] text-gray-500 truncate mt-0.5">{a.address}</div>}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {st && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: `${st.color}22`, color: st.color }}>{st.name}</span>
                      )}
                      {taskCount(a) > 0 && <span className="text-[9px] text-gray-400">{taskCount(a)} tasks</span>}
                    </div>

                    <div className="absolute bottom-1.5 left-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button data-no-drag onClick={() => moveToBin(a.id, null)}
                        className="flex items-center gap-1 text-[10px] font-bold text-[#1e3a5f] px-1.5 py-0.5 rounded-md border border-gray-200 bg-white/90"
                        title="Put it back on the board">
                        <Undo2 size={10} /> Restore
                      </button>
                      {bin.binKind === 'trash' && (
                        confirmId === a.id ? (
                          <button data-no-drag onClick={() => { deleteApartment(a.id); setConfirmId(null); }}
                            className="flex items-center gap-1 text-[10px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded-md">
                            <Trash2 size={10} /> Forever
                          </button>
                        ) : (
                          <button data-no-drag onClick={() => setConfirmId(a.id)}
                            className="ml-auto text-gray-300 hover:text-red-500" title="Delete permanently">
                            <Trash2 size={11} />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {bin.binKind === 'trash' && (
            <div className="px-3 py-1.5 text-[11px] text-gray-500 flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,.92)', borderTop: '1px solid rgba(15,23,42,.08)' }}>
              Nothing in Trash is ever removed automatically.
            </div>
          )}
        </div>
      </div>

      {storeOpen && <WidgetStore onPick={place} onClose={() => setStoreOpen(false)} />}
    </>
  );
}

const PER_ROW = 4;
const gridX = (i: number) => 20 + (i % PER_ROW) * (TILE_W + 16);
const gridY = (i: number) => 20 + Math.floor(i / PER_ROW) * (TILE_H + 16);
