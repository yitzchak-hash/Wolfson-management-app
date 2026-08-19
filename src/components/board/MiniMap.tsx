import React, { useMemo, useState } from 'react';
import { Maximize2, Minimize2, GripVertical } from 'lucide-react';
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
export const MiniMap = React.memo(function MiniMap({
  jobs, elements, stages, worldW, worldH, zoom, pan, viewportW, viewportH, onJump,
  tileW = 215, tileH = 132, force,
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
  const [big, setBig] = useState(false);
  const { ref: panelRef, pos, posStyle, handleProps, dragging } = usePanelDrag('board-overview');
  const W = big ? 340 : 148;
  const H = big ? 238 : 104;
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

      {/* Same grip as every other floating panel, and the same 0-puts-it-back. */}
      <div
        {...handleProps}
        data-no-drag
        title="Move the overview"
        className="absolute top-0.5 left-0.5 z-20 p-0.5 rounded bg-white/90 text-gray-400
                   hover:text-[#1e3a5f] cursor-grab active:cursor-grabbing shadow-sm"
      >
        <GripVertical size={11} />
      </div>
      {dragging && pos && (
        <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-gray-900/85 text-white
                        text-[10px] whitespace-nowrap pointer-events-none z-20">
          press 0 to put it back
        </div>
      )}

      {/* Bottom-LEFT, and above a drawing that takes no pointer events at all.
          Two things had to be got out of the way: the job rectangles are
          painted after this button, so a job near the board's origin landed
          exactly on top of it; and the expanded map grows upwards into the
          toolbar rail, which covered its top-right corner. The bottom-left is
          clear of both at either size. */}
      <button
        data-no-drag
        onPointerDown={e => { e.stopPropagation(); }}
        onClick={e => { e.stopPropagation(); setBig(v => !v); }}
        title={big ? 'Shrink the overview' : 'Expand the overview'}
        className="absolute bottom-0.5 left-0.5 z-20 p-0.5 rounded bg-white/90 text-gray-400
                   hover:text-[#1e3a5f] shadow-sm"
      >
        {big ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
      </button>

      <div className="absolute inset-0 pointer-events-none">
      {elements.map(el => (
        <div key={el.id} className="absolute rounded-[1px]"
          style={{
            left: el.x * scale, top: el.y * scale,
            width: Math.max(2, el.w * scale), height: Math.max(2, el.h * scale),
            /*
              One colour per KIND, so the overview is readable at a glance:
              a job is the blue of the app, a widget is violet, a group box is
              the faint grey it is on the board, and a note keeps its yellow.
              Everything used to be the same yellow as a note, so a board of
              widgets and a board of stickies looked identical.
            */
            backgroundColor:
              el.type === 'box' ? 'rgba(148,163,184,.28)'
              : el.type === 'widget' ? 'rgba(124,58,237,.65)'
              : el.type === 'bin' ? 'rgba(100,116,139,.45)'
              : 'rgba(252,211,77,.75)',
          }} />
      ))}
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
