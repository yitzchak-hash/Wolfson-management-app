import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { useDeleteImpactLine } from '../ui/DeleteImpact';
import {
  X, Undo2, Trash2, Search, StickyNote, Square, LayoutGrid, Settings2, Plus,
} from 'lucide-react';
import { useStore } from '../../data/store';
import {
  Apartment, CanvasElement, binLabelOf, BIN_META,
} from '../../types';
import { getBoardTheme } from '../../data/boardThemes';
import { WidgetStore } from './WidgetStore';
import { WidgetDef, WidgetCtx } from '../../data/widgets';
import { NODE_DEFAULT_SIZE, ArtKind } from './BoardNodes';
import { BoardNode, BoardHandlers } from './BoardItems';
import { NodeSettings } from './NodeSettings';

const TILE_W = 190, TILE_H = 116;

/**
 * A bin, opened as a board of its own.
 *
 * A bin was a list you could look at. It is now a real surface: the jobs inside
 * have their own positions, you can put notes, boxes and widgets on it from the
 * same store, and clicking a job opens it exactly as it does outside.
 *
 * **It draws its nodes with the main board's own `BoardNode`.** The first
 * version re-implemented them here in miniature, which is why the inside of a
 * group was so much worse than the outside: no resize handle, no colour, no
 * settings, no right-click, no support for headings or countdowns, and — worst
 * — a `WidgetCtx.update` stubbed to do nothing, so any widget placed in a group
 * threw away every edit. Sharing the component means a group cannot drift from
 * the board again, and anything added to nodes arrives here for free.
 *
 * Positions inside a bin are stored in `binX`/`binY`, deliberately separate from
 * `canvasX`/`canvasY` — so a job filed away and later restored goes back to
 * where it was on the main board rather than to wherever it was left in here.
 *
 * The nodes on this board carry `board: <bin key>`, which is the only thing
 * separating them from the main board's nodes.
 */
export function BinBoard({ bin, onClose, onOpenJob, highlightJobId, onRestored }: {
  bin: CanvasElement;
  onClose: () => void;
  onOpenJob: (job: Apartment) => void;
  /** A job arriving from search: pulsed so the eye lands on it. */
  highlightJobId?: string | null;
  /** Jobs just dragged back out onto the board — the board pulses them in. */
  onRestored?: (ids: string[]) => void;
}) {
  const {
    apartments, stages, contractors, contractorAssignments, contractorPhotos, activityLogs, users,
    canvasElements, moveToBin, deleteApartment, updateApartment, currentUser,
    addCanvasElement, updateCanvasElement, deleteCanvasElement,
    boardSettings, currentProjectId,
  } = useStore();

  const binKey = bin.binKind ?? bin.id;
  const theme = getBoardTheme(boardSettings[currentProjectId]?.themeId);
  const accent = bin.color || (bin.binKind ? BIN_META[bin.binKind].color : '#1e3a5f');

  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // What the pending delete takes with it, said ON the button — this confirm
  // has no room for a modal, but it must not have less truth than one.
  const impactLine = useDeleteImpactLine(confirmId);
  const [storeOpen, setStoreOpen] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingEl, setEditingEl] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [menu, setMenu] = useState<
    { x: number; y: number; kind: 'canvas' | 'element' | 'job'; ids: string[]; wx?: number; wy?: number } | null>(null);
  const [drag, setDrag] = useState<
    { kind: 'job' | 'el'; ids: string[]; starts: Map<string, { x: number; y: number }>;
      gx: number; gy: number; dx: number; dy: number; moved: boolean; out: boolean } | null>(null);
  /** The window's outer frame — "out" is measured against THIS, not the scroller. */
  const frameRef = useRef<HTMLDivElement>(null);
  const [resize, setResize] = useState<
    { id: string; startW: number; startH: number; startPX: number; startPY: number; dw: number; dh: number } | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

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
    const base = { x: a.binX ?? gridX(i), y: a.binY ?? gridY(i) };
    if (drag?.kind === 'job' && drag.ids.includes(a.id)) {
      return { x: base.x + drag.dx, y: base.y + drag.dy };
    }
    return base;
  }, [drag]);

  const elPos = useCallback((el: CanvasElement) => {
    const live = resize?.id === el.id
      ? { w: Math.max(60, el.w + resize.dw), h: Math.max(40, el.h + resize.dh) }
      : { w: el.w, h: el.h };
    if (drag?.kind === 'el' && drag.ids.includes(el.id)) {
      return { x: el.x + drag.dx, y: el.y + drag.dy, ...live };
    }
    return { x: el.x, y: el.y, ...live };
  }, [drag, resize]);

  /**
   * A context that can actually save.
   *
   * The old one passed `update: () => {}`, so every interactive widget placed
   * inside a group silently discarded everything typed into it. `BoardNode`
   * binds the real per-element update on top of this.
   */
  const widgetCtx: WidgetCtx = useMemo(() => ({
    jobs: apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed),
    stages, assignments: contractorAssignments, contractors, users,
    photos: contractorPhotos, logs: activityLogs,
    update: () => {},
    openJob: (id: string) => { const j = apartments.find(x => x.id === id); if (j) onOpenJob(j); },
  }), [apartments, stages, contractorAssignments, contractors, contractorPhotos, activityLogs, users, onOpenJob]);

  function toLocal(e: { clientX: number; clientY: number }) {
    const r = surfaceRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left + (surfaceRef.current?.scrollLeft ?? 0),
                 y: e.clientY - r.top + (surfaceRef.current?.scrollTop ?? 0) }
             : { x: e.clientX, y: e.clientY };
  }

  // ── drag ────────────────────────────────────────────────────────────────
  function startDrag(e: React.PointerEvent, kind: 'job' | 'el', id: string) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag],[data-el-action]')) return;
    e.stopPropagation();
    setMenu(null);

    const ids = selected.has(id) && selected.size > 1 ? [...selected] : [id];
    if (!selected.has(id)) setSelected(new Set([id]));

    const starts = new Map<string, { x: number; y: number }>();
    if (kind === 'el') nodes.forEach(n => { if (ids.includes(n.id)) starts.set(n.id, { x: n.x, y: n.y }); });
    else items.forEach((a, i) => { if (ids.includes(a.id)) starts.set(a.id, jobPos(a, i)); });

    const p = toLocal(e);
    setDrag({ kind, ids, starts, gx: p.x, gy: p.y, dx: 0, dy: 0, moved: false, out: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    const p = toLocal(e);
    const dx = p.x - drag.gx, dy = p.y - drag.gy;
    /**
     * Past the window's edge with a job in hand means "back to the board".
     *
     * Measured against the window frame with a little margin, so grazing the
     * border while arranging inside does not flicker the offer. Only jobs —
     * a note dragged out of a group has nowhere meaningful to go.
     */
    let out = false;
    if (drag.kind === 'job') {
      const f = frameRef.current?.getBoundingClientRect();
      if (f) {
        const M = 14;
        out = e.clientX < f.left - M || e.clientX > f.right + M
           || e.clientY < f.top - M || e.clientY > f.bottom + M;
      }
    }
    setDrag({ ...drag, dx, dy, out, moved: drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4 });
  }

  function endDrag(job?: Apartment) {
    if (!drag) return;
    if (drag.moved && drag.out && drag.kind === 'job') {
      // Released outside the window: the job goes back to the main board, to
      // exactly where it stood before it was filed — moveToBin(null) restores
      // the old canvas position — and the board pulses it so the landing is
      // seen rather than deduced.
      drag.ids.forEach(id => moveToBin(id, null));
      onRestored?.(drag.ids);
      setDrag(null);
      return;
    }
    if (drag.moved) {
      drag.ids.forEach(id => {
        const st = drag.starts.get(id);
        if (!st) return;
        const x = Math.max(0, Math.round(st.x + drag.dx));
        const y = Math.max(0, Math.round(st.y + drag.dy));
        if (drag.kind === 'job' && currentUser) updateApartment(id, { binX: x, binY: y }, currentUser);
        if (drag.kind === 'el') updateCanvasElement(id, { x, y });
      });
    } else if (drag.kind === 'job' && job) {
      onOpenJob(job);
    }
    setDrag(null);
  }

  // ── resize ──────────────────────────────────────────────────────────────
  function resizeDown(e: React.PointerEvent, el: CanvasElement) {
    e.stopPropagation(); e.preventDefault();
    setResize({ id: el.id, startW: el.w, startH: el.h, startPX: e.clientX, startPY: e.clientY, dw: 0, dh: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function resizeMove(e: React.PointerEvent) {
    if (!resize) return;
    setResize({ ...resize, dw: e.clientX - resize.startPX, dh: e.clientY - resize.startPY });
  }
  function resizeUp() {
    if (resize && (resize.dw || resize.dh)) {
      updateCanvasElement(resize.id, {
        w: Math.max(60, Math.round(resize.startW + resize.dw)),
        h: Math.max(40, Math.round(resize.startH + resize.dh)),
      });
    }
    setResize(null);
  }

  /**
   * The same handler bundle the main board builds, so `BoardNode` behaves the
   * same in here. Held in a ref and never replaced, or memoisation is defeated
   * and a drag re-renders every node.
   */
  const live = useRef<Record<string, (...a: unknown[]) => unknown>>({});
  const H = useRef<BoardHandlers>({
    jobDown: () => {}, jobMove: () => {}, jobUp: () => {}, jobMenu: () => {}, jobOpen: () => {},
    jobDelete: () => {}, jobTv: () => {}, jobThumbs: () => {}, jobThumbsDown: () => {},
    // A bin is a filing drawer, not a layout — resizing a tile in here would
    // change how it looks back on the board, which is not what filing means.
    jobResizeDown: () => {},
    elDown: (e, el) => live.current.elDown(e, el),
    elMove: e => live.current.elMove(e),
    elUp: el => live.current.elUp(el),
    elSeen: () => {},
    elMenu: (e, el) => live.current.elMenu(e, el),
    elEdit: el => live.current.elEdit(el),
    elSettings: el => live.current.elSettings(el),
    elDelete: id => live.current.elDelete(id),
    elColor: (e, id) => live.current.elColor(e, id),
    elPatch: (id, p) => live.current.elPatch(id, p),
    elThumbs: (id, d) => live.current.elThumbs(id, d),
    elThumbsDown: (id, d) => live.current.elThumbsDown(id, d),
    artUse: (el, art) => live.current.artUse(el, art),
    editChange: v => live.current.editChange(v),
    editCommit: () => live.current.editCommit(),
    editCancel: () => live.current.editCancel(),
    resizeDown: (e, el) => live.current.resizeDown(e, el),
    resizeMove: e => live.current.resizeMove(e),
    resizeUp: () => live.current.resizeUp(),
    openBin: () => {},
    binCount: () => 0,
  } as BoardHandlers).current;

  live.current = {
    elDown: (e, el) => startDrag(e as React.PointerEvent, 'el', (el as CanvasElement).id),
    elMove: e => moveDrag(e as React.PointerEvent),
    elUp: () => endDrag(),
    elMenu: (e, el) => {
      const ev = e as React.MouseEvent;
      ev.preventDefault(); ev.stopPropagation();
      const id = (el as CanvasElement).id;
      const ids = selected.has(id) && selected.size > 1 ? [...selected] : [id];
      if (!selected.has(id)) setSelected(new Set([id]));
      setMenu({ x: ev.clientX, y: ev.clientY, kind: 'element', ids });
    },
    elEdit: el => {
      const e = el as CanvasElement;
      setEditingEl(e.id); setEditText(e.text);
      setTimeout(() => editRef.current?.focus(), 30);
    },
    elSettings: el => setSettingsId((el as CanvasElement).id),
    artUse: (el, art) => {
      // The pad works inside a group too — it drops its note on this board.
      if (art !== 'sticky-stack') return;
      const e = el as CanvasElement;
      addSimple('note', { x: e.x + e.w + 26, y: e.y });
    },
    elDelete: id => deleteCanvasElement(id as string),
    elColor: (_e, id) => setSettingsId(id as string),
    elPatch: (id, p) => updateCanvasElement(id as string, p as Partial<CanvasElement>),
    elThumbs: (id, d) => {
      const el = nodes.find(n => n.id === id);
      if (el) updateCanvasElement(el.id, { thumbsUp: Math.max(0, (el.thumbsUp ?? 0) + (d as number)) });
    },
    elThumbsDown: (id, d) => {
      const el = nodes.find(n => n.id === id);
      if (el) updateCanvasElement(el.id, { thumbsDown: Math.max(0, (el.thumbsDown ?? 0) + (d as number)) });
    },
    editChange: v => setEditText(v as string),
    editCommit: () => { if (editingEl) updateCanvasElement(editingEl, { text: editText }); setEditingEl(null); },
    editCancel: () => setEditingEl(null),
    resizeDown: (e, el) => resizeDown(e as React.PointerEvent, el as CanvasElement),
    resizeMove: e => resizeMove(e as React.PointerEvent),
    resizeUp: () => resizeUp(),
  };

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

  function place(def: WidgetDef, at?: { x: number; y: number }) {
    const spot = at ?? freeSpot(def.w, def.h);
    const isArt = def.id.startsWith('art-');
    const id = 'CE-' + Math.random().toString(36).slice(2, 9);
    if (def.id === 'add-bin') return;   // no groups inside a group
    addCanvasElement({
      id,
      ...(isArt
        ? { type: 'clipart' as const, art: def.id.slice(4) as ArtKind }
        : def.id === 'w-title'
          ? { type: 'title' as const, fontSize: 26, fontWeight: 800, align: 'left' as const }
          : { type: 'widget' as const, widget: def.id }),
      board: binKey,               // the one thing that keeps it in this bin
      x: Math.round(spot.x), y: Math.round(spot.y), w: def.w, h: def.h,
      text: '', color: isArt ? '#dc2626' : def.id === 'w-title' ? '#0f172a' : '#ffffff',
      data: isArt ? {} : (def.data ? JSON.parse(JSON.stringify(def.data)) : {}),
    });
    // Stays open, as on the main board.
  }

  function addSimple(type: 'note' | 'box', at?: { x: number; y: number }) {
    const size = NODE_DEFAULT_SIZE[type];
    const spot = at ?? freeSpot(size.w, size.h);
    addCanvasElement({
      id: 'CE-' + Math.random().toString(36).slice(2, 9),
      type, board: binKey,
      x: Math.round(spot.x), y: Math.round(spot.y), w: size.w, h: size.h,
      text: type === 'box' ? 'Section' : '',
      color: type === 'box' ? 'rgba(219,234,254,0.45)' : '#fef9c3',
    });
  }

  /**
   * The surface must cover the WINDOW, not just its contents.
   *
   * It used to start at 640×380 inside a window nearly 900 wide, so the themed
   * board stopped partway across and the rest was raw backdrop — which is what
   * "the board itself is messed up" was.
   */
  const [box, setBox] = useState({ w: 860, h: 520 });
  useEffect(() => {
    const measure = () => {
      const r = surfaceRef.current?.getBoundingClientRect();
      if (r) setBox({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const extent = useMemo(() => {
    let w = box.w, h = box.h;
    items.forEach((a, i) => {
      const p = jobPos(a, i);
      w = Math.max(w, p.x + TILE_W + 24); h = Math.max(h, p.y + TILE_H + 24);
    });
    nodes.forEach(n => { w = Math.max(w, n.x + n.w + 24); h = Math.max(h, n.y + n.h + 24); });
    return { w, h };
  }, [items, nodes, jobPos, box]);

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

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return;
      if (e.key === 'Escape') { if (menu) setMenu(null); else if (selected.size) setSelected(new Set()); else onClose(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
        selected.forEach(id => { if (nodes.some(n => n.id === id)) deleteCanvasElement(id); });
        setSelected(new Set());
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const settingsEl = settingsId
    ? (settingsId === bin.id ? bin : nodes.find(n => n.id === settingsId))
    : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[70]" onClick={onClose} />
      {/* The offer, drawn OVER the backdrop while a job is held outside the
          window: release here and it returns to the board. */}
      {drag?.out && (
        <div className="fixed inset-0 z-[75] pointer-events-none flex items-start justify-center pt-10">
          <div className="px-4 py-2.5 rounded-full text-sm font-bold text-white shadow-2xl
                          flex items-center gap-2 bin-window-in"
            style={{ backgroundColor: '#16a34a' }}>
            ↩ Release to put it back on the board
          </div>
        </div>
      )}
      <div
        ref={frameRef}
        className="fixed z-[80] flex flex-col bin-window-in"
        style={{
          outline: drag?.out ? '3px dashed #16a34a' : undefined,
          outlineOffset: 6,
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(1080px, 95vw)', height: 'min(760px, 90vh)',
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
            {bin.stageId && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20">
                sets stage · {stages.find(st => st.id === bin.stageId)?.name ?? '—'}
              </span>
            )}
            <span className="flex-1" />
            <button onClick={() => addSimple('note')} title="Sticky note"
              className="p-1.5 rounded-lg hover:bg-white/15"><StickyNote size={15} /></button>
            <button onClick={() => addSimple('box')} title="Section box"
              className="p-1.5 rounded-lg hover:bg-white/15"><Square size={15} /></button>
            <button onClick={() => setStoreOpen(true)} title="Widget store"
              className="p-1.5 rounded-lg hover:bg-white/15"><LayoutGrid size={15} /></button>
            <button onClick={() => setSettingsId(bin.id)} title="Group settings"
              className="p-1.5 rounded-lg hover:bg-white/15"><Settings2 size={15} /></button>
            <span className="w-px h-4 bg-white/25 mx-0.5" />
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15"><X size={16} /></button>
          </div>

          <div className="px-3 py-1.5 flex items-center gap-2 flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,.92)', borderBottom: '1px solid rgba(15,23,42,.08)' }}>
            <Search size={13} className="text-gray-400" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search inside this group…"
              className="flex-1 text-[12.5px] outline-none bg-transparent" />
            <span className="text-[10.5px] text-gray-400">drag to arrange · right-click for more</span>
          </div>

          <div
            ref={surfaceRef}
            className="flex-1 min-h-0 overflow-auto relative"
            onPointerMove={e => { moveDrag(e); resizeMove(e); }}
            onPointerUp={() => { endDrag(); resizeUp(); }}
            onPointerDown={e => {
              if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.binSurface) {
                setSelected(new Set()); setMenu(null);
              }
            }}
            onContextMenu={e => {
              if (!(e.target as HTMLElement).dataset.binSurface) return;
              e.preventDefault();
              const p = toLocal(e);
              setMenu({ x: e.clientX, y: e.clientY, kind: 'canvas', ids: [], wx: p.x, wy: p.y });
            }}
          >
            {/*
              The surface never paints smaller than the window.

              It was sized to the CONTENT's extent, so a group holding one job
              painted a board a few hundred pixels wide and left the rest of
              the window showing whatever was behind it — read as a stray
              outline down the right-hand side and along the bottom. The extent
              still drives how far it scrolls; the minimums only stop the paint
              falling short of the frame.
            */}
            <div data-bin-surface="1" className="relative"
              style={{
                width: extent.w, height: extent.h,
                minWidth: '100%', minHeight: '100%',
                ...theme.surface,
              }}>
              {items.length === 0 && nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-sm pointer-events-none"
                  style={{ color: theme.dark ? 'rgba(255,255,255,.55)' : 'rgba(15,23,42,.45)' }}>
                  Nothing here yet — drag jobs onto this group from the board.
                </div>
              )}

              {/* The main board's own node, so a group behaves like the board. */}
              {nodes.map(el => {
                const p = elPos(el);
                return (
                  <BoardNode
                    key={el.id}
                    el={el}
                    x={p.x} y={p.y} w={p.w} h={p.h}
                    isSelected={selected.has(el.id)}
                    isDragging={!!drag && drag.kind === 'el' && drag.ids.includes(el.id) && drag.moved}
                    isEditing={editingEl === el.id}
                    editText={editingEl === el.id ? editText : ''}
                    binHot={false}
                    binCount={0}
                    recording={false}
                    savingAudio={false}
                    ctx={widgetCtx}
                    editRef={editRef}
                    H={H}
                    onRecord={() => {}}
                    onStopRecord={() => {}}
                    onUploadAudio={() => {}}
                  />
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
                    onPointerDown={e => startDrag(e, 'job', a.id)}
                    onPointerMove={moveDrag}
                    onPointerUp={() => endDrag(a)}
                    onContextMenu={e => {
                      e.preventDefault(); e.stopPropagation();
                      setSelected(new Set([a.id]));
                      setMenu({ x: e.clientX, y: e.clientY, kind: 'job', ids: [a.id] });
                    }}
                    className={`absolute rounded-xl p-2.5 cursor-grab select-none group ${lit ? 'search-hit' : ''}`}
                    style={{
                      left: p.x, top: p.y, width: TILE_W, height: TILE_H,
                      ...theme.node,
                      border: `3px solid ${st?.color ?? '#e2e8f0'}`,
                      outline: selected.has(a.id) ? '2px solid rgba(74,168,216,.55)' : undefined,
                      outlineOffset: 2,
                      touchAction: 'none',
                      zIndex: drag?.ids.includes(a.id) ? 20 : 5,
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
                            title={impactLine}
                            className="flex items-center gap-1 text-[10px] font-bold text-white bg-red-600 px-1.5 py-0.5 rounded-md">
                            <Trash2 size={10} /> Forever{impactLine !== 'nothing else attached' ? ' — ' + impactLine : ''}
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

      {/* Right-click, inside a group as well as outside it. */}
      {menu && (
        <>
          <div className="fixed inset-0 z-[88]" onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null); }} />
          <div className="fixed z-[89] bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 min-w-[186px]"
            style={{ left: Math.min(menu.x, window.innerWidth - 210), top: Math.min(menu.y, window.innerHeight - 280) }}>
            {menu.kind === 'canvas' && (
              <>
                <MenuItem icon={StickyNote} label="Sticky note"
                  onClick={() => { addSimple('note', { x: menu.wx ?? 20, y: menu.wy ?? 20 }); setMenu(null); }} />
                <MenuItem icon={Square} label="Section box"
                  onClick={() => { addSimple('box', { x: menu.wx ?? 20, y: menu.wy ?? 20 }); setMenu(null); }} />
                <MenuItem icon={LayoutGrid} label="Widget store…"
                  onClick={() => { setStoreOpen(true); setMenu(null); }} />
                <div className="h-px bg-gray-100 my-1" />
                <MenuItem icon={Settings2} label="Group settings…"
                  onClick={() => { setSettingsId(bin.id); setMenu(null); }} />
              </>
            )}
            {menu.kind === 'element' && (
              <>
                <MenuItem icon={Settings2} label="Settings…"
                  onClick={() => { setSettingsId(menu.ids[0]); setMenu(null); }} />
                <MenuItem icon={Plus} label={menu.ids.length > 1 ? `Duplicate (${menu.ids.length})` : 'Duplicate'}
                  onClick={() => {
                    menu.ids.forEach(id => {
                      const el = nodes.find(n => n.id === id);
                      if (!el) return;
                      addCanvasElement({ ...el, id: 'CE-' + Math.random().toString(36).slice(2, 9), x: el.x + 24, y: el.y + 24 });
                    });
                    setMenu(null);
                  }} />
                <div className="h-px bg-gray-100 my-1" />
                <MenuItem icon={Trash2} danger
                  label={menu.ids.length > 1 ? `Remove (${menu.ids.length})` : 'Remove'}
                  onClick={() => { menu.ids.forEach(deleteCanvasElement); setSelected(new Set()); setMenu(null); }} />
              </>
            )}
            {menu.kind === 'job' && (
              <>
                <MenuItem icon={Undo2} label="Put back on the board"
                  onClick={() => { menu.ids.forEach(id => moveToBin(id, null)); setMenu(null); }} />
                <MenuItem icon={Search} label="Open the job"
                  onClick={() => {
                    const j = items.find(x => x.id === menu.ids[0]);
                    if (j) onOpenJob(j);
                    setMenu(null);
                  }} />
                {bin.binKind === 'trash' && (
                  <>
                    <div className="h-px bg-gray-100 my-1" />
                    <MenuItem icon={Trash2} danger label="Delete forever"
                      onClick={() => { menu.ids.forEach(deleteApartment); setMenu(null); }} />
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {settingsEl && (
        <NodeSettings
          el={settingsEl}
          onClose={() => setSettingsId(null)}
          onDelete={settingsEl.id === bin.id ? undefined : id => deleteCanvasElement(id)}
        />
      )}

      {storeOpen && <WidgetStore onPick={def => place(def)} onClose={() => setStoreOpen(false)} />}
    </>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: {
  icon: React.ElementType; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-left hover:bg-gray-50 ${
        danger ? 'text-red-600' : 'text-gray-700'}`}>
      <Icon size={13} /> {label}
    </button>
  );
}

const PER_ROW = 4;
const gridX = (i: number) => 20 + (i % PER_ROW) * (TILE_W + 16);
const gridY = (i: number) => 20 + Math.floor(i / PER_ROW) * (TILE_H + 16);
