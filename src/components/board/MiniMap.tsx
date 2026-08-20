import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Move } from 'lucide-react';
import { Apartment, CanvasElement, Stage } from '../../types';
import { usePanelDrag } from './MovablePanel';

/**
 * Board overview, bottom-right.
 *
 * Shows the whole board shrunk to fit, with a rectangle marking what is
 * currently on screen. Clicking or dragging inside it jumps the view there —
 * which is the point once a board is larger than one screen.
 *
 * Deliberately built AFTER zoom and pan: a minimap needs a viewport rect to
 * draw, so building it first would have meant building it twice.
 */
/**
 * What a widget LOOKS like, at overview size.
 *
 * Every widget used to be the same violet block, so a board of twenty of them
 * told you where things were and nothing about what they were. These are
 * deliberately painted, not rendered: a real widget in the overview would mean
 * twenty live components reading the store on every pan, which is exactly the
 * cost the overview exists to avoid. A tint plus a few coloured cells is enough
 * to recognise the shape of your own board — the building diagram reads as a
 * grid of stage colours, the planner as ruled rows, the calendar as a month.
 *
 * `cells` is at most a dozen spans and is only drawn once the mark is big
 * enough to show them; below that the tint alone does the work.
 */
const STAGEY = ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#f43f5e', '#16a34a', '#cbd5e1'];
const FACES: Record<string, { bg: string; cells?: string[]; cols?: number }> = {
  'project-mini':  { bg: '#eef2f7', cols: 4, cells: Array.from({ length: 12 }, (_, i) => STAGEY[i % 7]) },
  'building-map':  { bg: '#eef2f7', cols: 4, cells: Array.from({ length: 12 }, (_, i) => STAGEY[(i * 3) % 7]) },
  'board-mini':    { bg: '#f1f5f9', cols: 3, cells: ['#4aa8d8', '#4aa8d8', '#fcd34d', '#4aa8d8', '#cbd5e1', '#4aa8d8'] },
  'rota':          { bg: '#ffffff', cols: 1, cells: ['#c7d2fe', '#fecaca', '#bbf7d0', '#fde68a'] },
  'week-planner':  { bg: '#ffffff', cols: 1, cells: ['#c7d2fe', '#fecaca', '#bbf7d0', '#fde68a'] },
  'job-map':       { bg: '#dbe7d4', cols: 3, cells: ['#dc2626', '#dbe7d4', '#dc2626', '#dbe7d4', '#dc2626', '#dbe7d4'] },
  'calendar-mini': { bg: '#ffffff', cols: 7, cells: Array.from({ length: 14 }, (_, i) => (i % 5 ? '#e2e8f0' : '#4aa8d8')) },
  'photo':         { bg: '#0f172a', cols: 3, cells: ['#64748b', '#94a3b8', '#475569', '#94a3b8', '#64748b', '#334155'] },
  'photo-wall':    { bg: '#0f172a', cols: 3, cells: ['#64748b', '#94a3b8', '#475569', '#94a3b8', '#64748b', '#334155'] },
  'weather':       { bg: '#cfe8fb', cols: 2, cells: ['#fbbf24', '#e0f2fe', '#e0f2fe', '#93c5fd'] },
  'clock':         { bg: '#ffffff' },
  'countdown':     { bg: '#fee2e2' },
  'stopwatch':     { bg: '#fef3c7' },
  'calculator':    { bg: '#1e293b', cols: 3, cells: Array.from({ length: 9 }, () => '#475569') },
  'sticky-pad':    { bg: '#fde68a' },
  'notes-board':   { bg: '#b98a52', cols: 3, cells: ['#fde68a', '#fecaca', '#bbf7d0', '#fde68a', '#e9d5ff', '#bfdbfe'] },
  'job-list':      { bg: '#ffffff', cols: 1, cells: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'] },
};
/** Anything unlisted still gets a tint by family rather than one flat violet. */
function faceFor(widget?: string): { bg: string; cells?: string[]; cols?: number } {
  if (!widget) return { bg: 'rgba(124,58,237,.55)' };
  const known = FACES[widget];
  if (known) return known;
  if (widget.startsWith('art-')) return { bg: 'rgba(148,163,184,.5)' };
  if (/task|due|late|snag|booked/.test(widget)) return { bg: '#fee2e2' };
  if (/count|progress|stat|trend/.test(widget)) return { bg: '#dbeafe' };
  if (/find|search|list/.test(widget)) return { bg: '#f1f5f9' };
  return { bg: 'rgba(124,58,237,.45)' };
}

/**
 * How big the overview is, per MACHINE.
 *
 * localStorage rather than the synced board settings, the same rule the tool
 * rail's size follows: how big a panel wants to be is a property of the screen
 * it is on, and pushing one person's wallboard-sized overview onto everybody
 * else's laptop is wrong. It also keeps a new key out of persist/export/import.
 */
const OVERVIEW_KEY = 'board_overview_size';
const OVERVIEW_DEFAULT = { w: 148, h: 104 };
const clampW = (n: number) => Math.max(120, Math.min(640, Math.round(n)));
const clampH = (n: number) => Math.max(84, Math.min(520, Math.round(n)));
function readOverviewSize(): { w: number; h: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(OVERVIEW_KEY) || 'null');
    if (raw && typeof raw.w === 'number' && typeof raw.h === 'number') {
      return { w: clampW(raw.w), h: clampH(raw.h) };
    }
  } catch { /* a corrupt entry is not worth a broken overview */ }
  return OVERVIEW_DEFAULT;
}
function writeOverviewSize(s: { w: number; h: number }) {
  try { localStorage.setItem(OVERVIEW_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export const MiniMap = React.memo(function MiniMap({
  jobs, elements, stages, worldW, worldH, zoom, pan, viewportW, viewportH, onJump,
  tileW = 215, tileH = 132, force, panelId = 'board-overview',
}: {
  jobs: Apartment[];
  elements: CanvasElement[];
  stages: Stage[];
  worldW: number;
  worldH: number;
  zoom: number;
  pan: { x: number; y: number };
  viewportW: number;
  viewportH: number;
  onJump: (worldX: number, worldY: number) => void;
  tileW?: number;
  tileH?: number;
  /** true = always show, false = never, undefined = only when it is useful. */
  force?: boolean;
  /**
   * Which panel's remembered position this is.
   *
   * A group window has its own overview, and two overviews sharing one id would
   * move together — drag the one in a group and the board's jumps with it.
   */
  panelId?: string;
}) {
  /**
   * It expands.
   *
   * At 148 x 104 a board of two hundred jobs is a field of two-pixel specks —
   * enough to see WHERE you are, not enough to see what is over there. Pressing
   * the corner grows it to a size you can actually aim at, and it stays that way
   * until you shrink it again, because somebody rearranging a board wants it big
   * for the whole job rather than for one click.
   */
  const { ref: panelRef, pos, posStyle, handleProps, dragging, movePos } = usePanelDrag(panelId);
  const [size, setSize] = useState(readOverviewSize);
  const { w: W, h: H } = size;
  /**
   * It resizes like anything else on the board, from its top-left corner.
   *
   * It used to be a two-step "bigger / smaller" button, which is two sizes,
   * neither of them the one you wanted. The panel is anchored to the BOTTOM
   * RIGHT, so the corner that grows it is the opposite one — and once it has
   * been moved it is anchored top-left instead, so the stored position is
   * shifted by the same delta to hold that far corner still.
   */
  const rz = useRef<{ px: number; py: number; w: number; h: number } | null>(null);
  const [sizing, setSizing] = useState(false);
  function sizeDown(e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    rz.current = { px: e.clientX, py: e.clientY, w: W, h: H };
    setSizing(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function sizeMove(e: React.PointerEvent) {
    const st = rz.current;
    if (!st) return;
    e.stopPropagation();
    const w = clampW(st.w - (e.clientX - st.px));
    const h = clampH(st.h - (e.clientY - st.py));
    // Computed outside the updater: a setState callback must be pure, and React
    // is free to run it twice.
    if (pos) movePos(W - w, H - h);
    setSize({ w, h });
    writeOverviewSize({ w, h });
  }
  function sizeUp(e: React.PointerEvent) { e.stopPropagation(); rz.current = null; setSizing(false); }
  useEffect(() => {
    if (!sizing) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== '0') return;
      ev.preventDefault();
      rz.current = null; setSizing(false);
      setSize(OVERVIEW_DEFAULT); writeOverviewSize(OVERVIEW_DEFAULT);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sizing]);
  const scale = useMemo(
    () => Math.min(W / Math.max(worldW, 1), H / Math.max(worldH, 1)),
    [worldW, worldH, W, H],
  );
  /**
   * The board's own shape, drawn at its true ratio inside the panel.
   *
   * The panel is a fixed box, so a tall board fills its height and uses only a
   * strip of its width — and with the leftover drawn in the same white as the
   * board, it read as though dragging the planner DOWN had also grown the board
   * to the RIGHT. The board rectangle is now painted explicitly and everything
   * outside it is grey, so the shape you see is the shape the board is.
   */
  const boardW = Math.max(2, worldW * scale);
  const boardH = Math.max(2, worldH * scale);

  // By default it appears only once the board exceeds the screen — but that made
  // it look missing on a board that happens to fit, so the toolbar can pin it on
  // or off outright.
  const needed = worldW * zoom > viewportW * 1.15 || worldH * zoom > viewportH * 1.15;
  if (force === false) return null;
  if (!force && !needed) return null;

  /**
   * A job's stage colour, or the company navy when it has none.
   *
   * The fallback used to be a light grey, which on the overview was almost
   * exactly the grey of a group box — so an unstaged job and an empty box were
   * the same mark. Navy keeps a job reading as a job whatever stage it is at.
   */
  const stageColor = (id?: string | null) => stages.find(s => s.id === id)?.color ?? '#1e3a5f';

  // Visible world rect, derived from the same transform the board uses.
  const view = {
    x: (-pan.x / zoom) * scale,
    y: (-pan.y / zoom) * scale,
    w: (viewportW / zoom) * scale,
    h: (viewportH / zoom) * scale,
  };

  function jump(e: React.PointerEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onJump((e.clientX - r.left) / scale, (e.clientY - r.top) / scale);
  }

  return (
    <div
      ref={panelRef}
      data-board-overview
      className="absolute right-3 z-30 rounded-lg border border-gray-200 bg-gray-200/90 shadow-sm overflow-hidden cursor-pointer"
      /* Clear of the iPad's home indicator, which otherwise sits across the
         overview's bottom edge. env() is 0 on every other device. */
      style={{ width: W, height: H, bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))', ...posStyle }}
      onPointerDown={jump}
      onPointerMove={e => { if (e.buttons === 1) jump(e); }}
      title="Board overview — click to jump"
    >
      {/* The board itself. Everything outside it is the panel's grey. */}
      <div className="absolute left-0 top-0 bg-white pointer-events-none"
        style={{ width: boardW, height: boardH }} />

      {/* Bigger, and BOTTOM-RIGHT: the two controls sit in opposite corners so
          neither is a guess — expand top-left, move bottom-right. */}
      <div
        {...handleProps}
        data-no-drag
        title="Move the overview"
        className="absolute bottom-1 right-1 z-20 p-1 rounded-md bg-white/95 text-gray-500
                   hover:text-[#1e3a5f] cursor-grab active:cursor-grabbing shadow ring-1 ring-black/5"
      >
        <Move size={13} />
      </div>
      {dragging && pos && (
        <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-gray-900/85 text-white
                        text-[10px] whitespace-nowrap pointer-events-none z-20">
          press 0 to put it back
        </div>
      )}

      {/* TOP-LEFT: the corner you pull to size it, opposite the move handle. */}
      <div
        data-no-drag
        onPointerDown={sizeDown}
        onPointerMove={sizeMove}
        onPointerUp={sizeUp}
        onPointerCancel={sizeUp}
        title="Drag to size the overview"
        className="absolute top-1 left-1 z-20 p-1 rounded-md bg-white/95 text-gray-500
                   hover:text-[#1e3a5f] shadow ring-1 ring-black/5 cursor-nwse-resize"
        style={{ touchAction: 'none' }}
      >
        <Maximize2 size={13} />
      </div>
      {sizing && (
        <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-gray-900/85 text-white
                        text-[10px] whitespace-nowrap pointer-events-none z-20">
          {W} × {H} · press 0 to reset
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none">
      {elements.map(el => {
        const w = Math.max(2, el.w * scale);
        const h = Math.max(2, el.h * scale);
        const face = el.type === 'widget' ? faceFor(el.widget) : null;
        /*
          One colour per KIND, so the overview is readable at a glance: a job is
          the blue of the app, a group box is the faint grey it is on the board,
          and a note keeps its yellow. Widgets get a painted face of their own —
          see FACES above.
        */
        const bg = face ? face.bg
          : el.type === 'box' ? 'rgba(148,163,184,.28)'
          : el.type === 'bin' ? 'rgba(100,116,139,.45)'
          : 'rgba(252,211,77,.75)';
        // Cells cost a span each, so they only appear once they would be visible.
        const showCells = !!face?.cells && w >= 15 && h >= 12;
        return (
          <div key={el.id} className="absolute rounded-[1px] overflow-hidden"
            style={{ left: el.x * scale, top: el.y * scale, width: w, height: h, backgroundColor: bg }}>
            {showCells && (
              <div className="grid h-full w-full gap-[1px] p-[1px]"
                style={{ gridTemplateColumns: `repeat(${face!.cols ?? 3}, minmax(0,1fr))` }}>
                {face!.cells!.map((c, i) => (
                  <span key={i} className="rounded-[1px]" style={{ backgroundColor: c }} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {jobs.map((j, i) => (
        <div key={j.id} className="absolute rounded-[1px]"
          style={{
            left: (j.canvasX ?? 24 + (i % 6) * 240) * scale,
            top: (j.canvasY ?? 24 + Math.floor(i / 6) * 150) * scale,
            width: Math.max(3, tileW * scale), height: Math.max(2, tileH * scale),
            backgroundColor: stageColor(j.currentStageId),
          }} />
      ))}
        <div className="absolute border-2 rounded-[2px]"
          style={{
            left: view.x, top: view.y, width: view.w, height: view.h,
            borderColor: '#4aa8d8', backgroundColor: 'rgba(74,168,216,.12)',
          }} />
      </div>
    </div>
  );
});
