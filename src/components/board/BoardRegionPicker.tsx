import React, { useMemo, useRef, useState } from 'react';
import { Apartment, CanvasElement, Stage } from '../../types';

const TILE_W = 215, TILE_H = 132;

export interface Region { x: number; y: number; w: number; h: number }

/**
 * Pick which part of the board the TV shows.
 *
 * A shrunk drawing of the whole board with a rectangle over it: drag the
 * rectangle to move what the TV displays, drag its corner to change how much
 * fits. That is the only sane way to aim a wallboard — the board keeps growing,
 * and the corner worth showing is rarely the top-left one.
 *
 * Everything here is in BOARD coordinates and converted through a single scale
 * factor, so the rectangle you drag and the region the TV renders are the same
 * numbers. No second coordinate system to keep in step.
 */
export function BoardRegionPicker({
  jobs, elements, stages, value, onChange, width = 420, height = 240,
}: {
  jobs: Apartment[];
  elements: CanvasElement[];
  stages: Stage[];
  value?: Region;
  onChange: (r: Region | undefined) => void;
  width?: number;
  height?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: 'move' | 'resize'; px: number; py: number; start: Region } | null>(null);
  const [live, setLive] = useState<Region | null>(null);

  /**
   * The map tracks the board.
   *
   * Sized from the same content the board is, plus the same kind of margin, so
   * as jobs spread out the map grows with them and the rectangle keeps meaning
   * the same thing. A floor keeps an empty board drawable.
   */
  const world = useMemo(() => {
    let w = 0, h = 0;
    jobs.forEach((j, i) => {
      const x = j.canvasX ?? 24 + (i % 4) * 240;
      const y = j.canvasY ?? 24 + Math.floor(i / 4) * 150;
      w = Math.max(w, x + TILE_W); h = Math.max(h, y + TILE_H);
    });
    elements.forEach(e => {
      if (e.type === 'stroke') return;
      w = Math.max(w, e.x + e.w); h = Math.max(h, e.y + e.h);
    });
    return { w: Math.max(w + 160, 1200), h: Math.max(h + 160, 800) };
  }, [jobs, elements]);

  // The drawing keeps the board's real proportions, so the rectangle you drag
  // is not a differently-shaped approximation of what the TV will show.
  const k = Math.min(width / world.w, height / world.h);
  const drawW = world.w * k, drawH = world.h * k;
  const region = live ?? value ?? { x: 0, y: 0, w: world.w, h: world.h };
  const stageColor = (id?: string | null) => stages.find(s => s.id === id)?.color ?? '#cbd5e1';

  function down(mode: 'move' | 'resize') {
    return (e: React.PointerEvent) => {
      e.preventDefault(); e.stopPropagation();
      dragRef.current = { mode, px: e.clientX, py: e.clientY, start: { ...region } };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
  }
  function move(e: React.PointerEvent) {
    const st = dragRef.current;
    if (!st) return;
    // Screen delta -> board delta, through the same k the drawing uses.
    const dx = (e.clientX - st.px) / k;
    const dy = (e.clientY - st.py) / k;
    if (st.mode === 'move') {
      setLive({
        ...st.start,
        x: Math.max(0, Math.min(world.w - st.start.w, st.start.x + dx)),
        y: Math.max(0, Math.min(world.h - st.start.h, st.start.y + dy)),
      });
    } else {
      setLive({
        ...st.start,
        w: Math.max(320, Math.min(world.w - st.start.x, st.start.w + dx)),
        h: Math.max(200, Math.min(world.h - st.start.y, st.start.h + dy)),
      });
    }
  }
  function up() {
    if (dragRef.current && live) onChange({
      x: Math.round(live.x), y: Math.round(live.y),
      w: Math.round(live.w), h: Math.round(live.h),
    });
    dragRef.current = null;
    setLive(null);
  }

  return (
    <div>
      <div
        ref={boxRef}
        className="relative rounded-xl border border-gray-200 overflow-hidden bg-slate-50"
        style={{ width: drawW, height: drawH }}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {elements.map(el => (
          <div key={el.id} className="absolute rounded-[2px]"
            style={{
              left: el.x * k, top: el.y * k,
              width: Math.max(2, el.w * k), height: Math.max(2, el.h * k),
              backgroundColor: el.type === 'box' ? 'rgba(148,163,184,.30)'
                : el.type === 'bin' ? 'rgba(203,213,225,.55)'
                : el.type === 'widget' ? 'rgba(74,168,216,.35)'
                : 'rgba(252,211,77,.75)',
            }} />
        ))}
        {jobs.map((j, i) => (
          <div key={j.id} className="absolute rounded-[2px]"
            style={{
              left: (j.canvasX ?? 24 + (i % 4) * 240) * k,
              top: (j.canvasY ?? 24 + Math.floor(i / 4) * 150) * k,
              width: Math.max(3, TILE_W * k), height: Math.max(2, TILE_H * k),
              backgroundColor: stageColor(j.currentStageId),
            }} />
        ))}

        {/* Everything OUTSIDE the chosen region is dimmed, so what the TV will
            actually show reads at a glance. Four plain rectangles rather than a
            clip-path hole — the polygon form silently fails to cut the hole in
            some engines and dims the whole map, which is exactly backwards. */}
        {(() => {
          const L = region.x * k, T = region.y * k;
          const R = (region.x + region.w) * k, B = (region.y + region.h) * k;
          const dim = 'rgba(15,23,42,.45)';
          const parts: React.CSSProperties[] = [
            { left: 0, top: 0, width: '100%', height: T },
            { left: 0, top: B, width: '100%', bottom: 0 },
            { left: 0, top: T, width: L, height: B - T },
            { left: R, top: T, right: 0, height: B - T },
          ];
          return parts.map((st, i) => (
            <div key={i} className="absolute pointer-events-none"
              style={{ ...st, backgroundColor: dim }} />
          ));
        })()}

        <div
          onPointerDown={down('move')}
          className="absolute cursor-move"
          style={{
            left: region.x * k, top: region.y * k,
            width: region.w * k, height: region.h * k,
            border: '2px solid #4aa8d8',
            boxShadow: '0 0 0 1px rgba(255,255,255,.7)',
            borderRadius: 3,
          }}
        >
          <span className="absolute -top-0.5 left-1 text-[8.5px] font-black text-[#1e3a5f] bg-white/85 px-1 rounded">
            ON THE TV
          </span>
          <div
            onPointerDown={down('resize')}
            className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-sm cursor-se-resize"
            style={{ backgroundColor: '#4aa8d8', border: '2px solid #fff' }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2" style={{ width: drawW }}>
        <span className="text-[10.5px] text-gray-400 flex-1">
          Drag the box to aim the TV; drag its corner to take in more or less.
          The map grows as the board does.
        </span>
        <button
          onClick={() => onChange(undefined)}
          className="text-[10.5px] font-bold text-[#1e3a5f] whitespace-nowrap"
        >
          Show the whole board
        </button>
      </div>
    </div>
  );
}
