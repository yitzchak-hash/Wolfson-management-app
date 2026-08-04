import React, { useMemo } from 'react';
import { Apartment, CanvasElement, Stage } from '../../types';

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
export function MiniMap({
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
  const W = 148, H = 104;
  const scale = useMemo(
    () => Math.min(W / Math.max(worldW, 1), H / Math.max(worldH, 1)),
    [worldW, worldH],
  );

  // By default it appears only once the board exceeds the screen — but that made
  // it look missing on a board that happens to fit, so the toolbar can pin it on
  // or off outright.
  const needed = worldW * zoom > viewportW * 1.15 || worldH * zoom > viewportH * 1.15;
  if (force === false) return null;
  if (!force && !needed) return null;

  const stageColor = (id?: string | null) => stages.find(s => s.id === id)?.color ?? '#cbd5e1';

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
      className="absolute bottom-3 right-3 z-30 rounded-lg border border-gray-200 bg-white/95 shadow-sm overflow-hidden cursor-pointer"
      style={{ width: W, height: H }}
      onPointerDown={jump}
      onPointerMove={e => { if (e.buttons === 1) jump(e); }}
      title="Board overview — click to jump"
    >
      {elements.map(el => (
        <div key={el.id} className="absolute rounded-[1px]"
          style={{
            left: el.x * scale, top: el.y * scale,
            width: Math.max(2, el.w * scale), height: Math.max(2, el.h * scale),
            backgroundColor: el.type === 'box' ? 'rgba(148,163,184,.28)' : 'rgba(252,211,77,.7)',
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
      <div className="absolute border-2 rounded-[2px] pointer-events-none"
        style={{
          left: view.x, top: view.y, width: view.w, height: view.h,
          borderColor: '#4aa8d8', backgroundColor: 'rgba(74,168,216,.12)',
        }} />
    </div>
  );
}
