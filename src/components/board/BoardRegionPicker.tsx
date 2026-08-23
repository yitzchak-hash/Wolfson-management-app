import React, { useMemo, useRef, useState } from 'react';
import { Apartment, CanvasElement, Stage } from '../../types';

const TILE_W = 215, TILE_H = 132;

export interface Region { x: number; y: number; w: number; h: number }

/**
 * Pick which part of the board the TV shows.
 *
 * A shrunk drawing of the whole board with a rectangle over it: drag the
 * rectangle to move what the TV displays, drag its corner to change how much
 * fits. Everything here is in BOARD coordinates and converted through a single
 * scale factor, so the rectangle you drag and the region the TV renders are
 * the same numbers.
 *
 * The map is drawn with an APRON — the desk-grey beyond the board's own edges.
 * The rectangle is hard-locked to the screen's shape, and a screen-shaped box
 * that takes in ALL of a board the other shape must reach past the board's
 * edge: a 16:9 box over a tall board is wider than the board is. Clamping the
 * box inside the board (the old rule) made "show me everything" impossible for
 * any board that was not already TV-shaped. The apron is exactly the room that
 * needs, plus a little slack so the default box has somewhere to be dragged.
 */
export function BoardRegionPicker({
  jobs, elements, stages, value, onChange, width = 420, height = 240, screenRatio = 16 / 9,
}: {
  jobs: Apartment[];
  elements: CanvasElement[];
  stages: Stage[];
  value?: Region;
  onChange: (r: Region | undefined) => void;
  width?: number;
  height?: number;
  /** The panel's shape. The box only ever IS this shape — resizing keeps it. */
  screenRatio?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ mode: 'move' | 'resize'; px: number; py: number; start: Region } | null>(null);
  const [live, setLive] = useState<Region | null>(null);

  /**
   * The board's own footprint, from the same content the board sizes itself
   * by. A floor keeps an empty board drawable.
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

  /**
   * The apron. `ax`/`ay` is the ratio's own requirement — the overhang a
   * screen-shaped box needs to contain the whole board, split evenly so the
   * board sits centred in it. `pad` is slack on top of that, so even the
   * everything-box has room to be dragged and the map reads as a sheet on a
   * desk rather than a wall-to-wall diagram.
   */
  const ax = Math.max(0, (world.h * screenRatio - world.w) / 2);
  const ay = Math.max(0, (world.w / screenRatio - world.h) / 2);
  const pad = Math.max(world.w + 2 * ax, world.h + 2 * ay) * 0.06;
  const outer = { x: -ax - pad, y: -ay - pad, w: world.w + 2 * (ax + pad), h: world.h + 2 * (ay + pad) };

  // The drawing keeps the map's real proportions, so the rectangle you drag
  // is not a differently-shaped approximation of what the TV will show.
  const k = Math.min(width / outer.w, height / outer.h);
  const drawW = outer.w * k, drawH = outer.h * k;
  /** Board coordinate -> pixels inside the drawn map. */
  const px = (x: number) => (x - outer.x) * k;
  const py = (y: number) => (y - outer.y) * k;

  /**
   * The default is the whole board, in the screen's shape — the ratio apron
   * without the slack. Unset therefore MEANS "show me everything", which is
   * also what the wall itself falls back to, so the picker and the panel
   * agree before anybody has dragged anything.
   */
  const defaultRegion = useMemo(() => ({
    x: Math.round(-ax), y: Math.round(-ay),
    w: Math.round(world.w + 2 * ax), h: Math.round(world.h + 2 * ay),
  }), [world, ax, ay]);

  const region = live ?? value ?? defaultRegion;
  const stageColor = (id?: string | null) => stages.find(s => s.id === id)?.color ?? '#cbd5e1';

  function down(mode: 'move' | 'resize') {
    return (e: React.PointerEvent) => {
      e.preventDefault(); e.stopPropagation();
      dragRef.current = { mode, px: e.clientX, py: e.clientY, start: { ...region } };
      // A first drag of an unset region commits the default it was showing, so
      // what you were looking at is what you start moving.
      if (!value) onChange({ ...region });
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
        x: Math.max(outer.x, Math.min(outer.x + outer.w - st.start.w, st.start.x + dx)),
        y: Math.max(outer.y, Math.min(outer.y + outer.h - st.start.h, st.start.y + dy)),
      });
    } else {
      // Locked to the screen's shape: the corner drives the width (whichever
      // axis the hand pulled harder), and the height follows the ratio. A box
      // that is not the screen's shape gets letterboxed on the wall, so there
      // is no reason to let one be made.
      const wanted = Math.max(st.start.w + dx, (st.start.h + dy) * screenRatio);
      const maxW = Math.min(outer.x + outer.w - st.start.x, (outer.y + outer.h - st.start.y) * screenRatio);
      const w = Math.max(320, Math.min(maxW, wanted));
      setLive({ ...st.start, w, h: w / screenRatio });
    }
  }
  function up() {
    if (dragRef.current && live) {
      onChange({
        x: Math.round(live.x), y: Math.round(live.y),
        w: Math.round(live.w), h: Math.round(live.h),
      });
    }
    dragRef.current = null;
    setLive(null);
  }

  return (
    <div>
      <div
        ref={boxRef}
        className="relative rounded-xl border border-gray-200 overflow-hidden"
        // The desk grey the board itself sits on, so the apron reads as the
        // same dead space the office already knows from zooming out.
        style={{ width: drawW, height: drawH, backgroundColor: '#d7dce3' }}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {/* The board's own sheet, white on the desk. */}
        <div className="absolute bg-slate-50 rounded-[3px] shadow-sm"
          style={{ left: px(0), top: py(0), width: world.w * k, height: world.h * k }} />
        {elements.map(el => (
          <div key={el.id} className="absolute rounded-[2px]"
            style={{
              left: px(el.x), top: py(el.y),
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
              left: px(j.canvasX ?? 24 + (i % 4) * 240),
              top: py(j.canvasY ?? 24 + Math.floor(i / 4) * 150),
              width: Math.max(3, TILE_W * k), height: Math.max(2, TILE_H * k),
              backgroundColor: stageColor(j.currentStageId),
            }} />
        ))}

        {/* Everything OUTSIDE the chosen region is dimmed, so what the TV will
            actually show reads at a glance. Four plain rectangles rather than a
            clip-path hole — the polygon form silently fails to cut the hole in
            some engines and dims the whole map, which is exactly backwards. */}
        {(() => {
          const L = px(region.x), T = py(region.y);
          const R = px(region.x + region.w), B = py(region.y + region.h);
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
            left: px(region.x), top: py(region.y),
            width: region.w * k, height: region.h * k,
            border: '2px solid #16a34a',
            boxShadow: '0 0 0 1px rgba(255,255,255,.7), 0 0 0 4px rgba(22,163,74,.16)',
            borderRadius: 3,
          }}
          data-region-fits="yes"
        >
          <div
            onPointerDown={down('resize')}
            className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-sm cursor-se-resize"
            style={{ backgroundColor: '#16a34a', border: '2px solid #fff' }}
          />
        </div>
      </div>

      <div className="flex items-center justify-end mt-2" style={{ width: drawW }}>
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
