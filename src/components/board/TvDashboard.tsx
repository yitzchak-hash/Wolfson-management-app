import React, { useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import { CanvasElement, TV_DASH_BOARD } from '../../types';
import { useStore } from '../../data/store';
import { WidgetCtx, renderWidget, WIDGET_BY_ID } from '../../data/widgets';
import { ScreenShape } from '../../data/useOrientation';
import { DashRatio, placeOn, patchPlace, nearestRatio } from '../../data/dashRatios';

/**
 * The wall's dashboard.
 *
 * Ordinary CanvasElements on a reserved board id, laid out on a twelve-column
 * grid — not a free canvas, because a wall screen gets turned on its side and a
 * free canvas cannot reflow. Each widget's stored width is a column span and
 * its height is real pixels, both scaled by the display size so one arrangement
 * works on a 1080p panel and a 4K one.
 *
 * The same component draws it on the wall and inside app settings, which is
 * what makes "edit it in settings and it updates the wall" true rather than
 * approximately true: there is one layout, not a description of one.
 */
export function TvDashboard({ ctx, shape, scale, editing, onSpawn, ratio }: {
  ctx: WidgetCtx;
  shape: ScreenShape;
  /**
   * Which screen shape's arrangement to draw.
   *
   * The wall works this out from its own window; the settings preview is told
   * explicitly, because a PC window is neither of the shapes the office is
   * actually arranging for.
   */
  ratio?: DashRatio;
  /** The wall's display scale, so type and spacing grow with the panel. */
  scale: number;
  /** Arranging is on — show the handles. */
  editing: boolean;
  /** Open the widget shelf. */
  onSpawn?: () => void;
}) {
  const canvasElements = useStore(st => st.canvasElements);
  const updateCanvasElement = useStore(st => st.updateCanvasElement);
  const deleteCanvasElement = useStore(st => st.deleteCanvasElement);

  const shapeKey = (ratio ?? nearestRatio(shape.width, shape.height)).key;

  const widgets = useMemo(
    () => canvasElements
      .filter(e => e.board === TV_DASH_BOARD && e.type === 'widget')
      .sort((a, b) => placeOn(a, shapeKey).z - placeOn(b, shapeKey).z),
    [canvasElements, shapeKey],
  );

  /**
   * Twelve columns across a landscape panel, SIX across a portrait one.
   *
   * A card that reads well as a third of a 1920 screen is 640px; the same third
   * of a 1080 portrait window is 360, which is too narrow for a row of figures.
   * Halving the grid means a widget that spanned four columns still spans four —
   * it just occupies two thirds of the width instead of a third, which is the
   * right answer when the screen is tall.
   */
  const columns = (ratio?.orientation ?? shape.orientation) === 'portrait' ? 6 : 12;

  function move(id: string, dir: -1 | 1) {
    const ids = widgets.map(w => w.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const a = widgets[i], b = widgets[j];
    // Reordering is per shape too: what reads best first across a wide screen
    // is often not what should lead on a tall one.
    const az = placeOn(a, shapeKey).z, bz = placeOn(b, shapeKey).z;
    updateCanvasElement(a.id, patchPlace(a, shapeKey, { z: bz === az ? j : bz }));
    updateCanvasElement(b.id, patchPlace(b, shapeKey, { z: bz === az ? i : az }));
  }

  if (widgets.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <button
          onClick={onSpawn}
          disabled={!onSpawn}
          className="rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-colors
                     disabled:cursor-default"
          style={{ borderColor: '#cbd5e1', color: '#64748b', fontSize: 15 * Math.min(scale, 1.6) }}
        >
          <Plus size={26} className="mx-auto mb-2 opacity-50" />
          {onSpawn
            ? 'Nothing on the wall dashboard yet — add the first thing.'
            : 'Nothing on the wall dashboard yet. Build it in app settings → TV.'}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex-1 min-h-0 overflow-auto p-3 grid gap-3 content-start"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        fontSize: 15 * Math.min(scale, 1.9),
      }}
    >
      {widgets.map(el => (
        <TvCard
          key={el.id}
          el={el}
          ctx={ctx}
          columns={columns}
          scale={scale}
          editing={editing}
          shapeKey={shapeKey}
          onSpan={n => updateCanvasElement(el.id, patchPlace(el, shapeKey, { w: n * 100 }))}
          onTall={n => updateCanvasElement(el.id, patchPlace(el, shapeKey, { h: n }))}
          onMove={dir => move(el.id, dir)}
          onRemove={() => deleteCanvasElement(el.id)}
        />
      ))}
    </div>
  );
}

function TvCard({ el, ctx, columns, scale, editing, shapeKey, onSpan, onTall, onMove, onRemove }: {
  el: CanvasElement;
  ctx: WidgetCtx;
  columns: number;
  scale: number;
  editing: boolean;
  shapeKey: string;
  onSpan: (cols: number) => void;
  onTall: (px: number) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const def = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;
  const updateCanvasElement = useStore(st => st.updateCanvasElement);
  const ref = useRef<HTMLDivElement>(null);

  const place = placeOn(el, shapeKey);
  const span = Math.max(2, Math.min(columns, Math.round((place.w || 400) / 100)));
  const height = Math.max(120, place.h || 200);

  /**
   * The widget is drawn at its natural size and SCALED into the card.
   *
   * A widget's insides are written in pixels — 11px labels, 30px figures — and
   * on a wall those want to be two or three times bigger. Scaling the whole
   * thing keeps every proportion the designer chose, where re-specifying each
   * size would not.
   */
  const [box, setBox] = useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const ro = new ResizeObserver(() => {
      setBox({ w: node.clientWidth, h: node.clientHeight });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const naturalW = def?.w ?? 300;
  const k = box.w ? Math.max(0.5, Math.min(4, (box.w / naturalW) * Math.min(scale, 1.5))) : 1;

  const bound: WidgetCtx = useMemo(
    () => ({ ...ctx, update: patch => updateCanvasElement(el.id, patch) }),
    [ctx, el.id, updateCanvasElement],
  );

  return (
    <div
      className="relative group bg-white rounded-2xl border overflow-hidden"
      style={{
        gridColumn: `span ${span} / span ${span}`,
        height: height * Math.min(scale, 1.6),
        borderColor: el.outline || '#e2e8f0',
        borderWidth: el.outline ? (el.outlineWidth ?? 3) : 1,
        backgroundColor: el.color || '#ffffff',
      }}
    >
      <div ref={ref} className="w-full h-full overflow-hidden">
        {def ? (
          <div style={{ width: box.w ? box.w / k : '100%', height: box.h ? box.h / k : '100%',
                        transform: `scale(${k})`, transformOrigin: '0 0' }}>
            {renderWidget(el, bound)}
          </div>
        ) : (
          <div className="p-3 text-xs text-gray-400">This widget is no longer available.</div>
        )}
      </div>

      {editing && (
        <>
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
            <button onClick={onRemove} title="Take it off the wall"
              className="p-1.5 rounded-lg bg-white/95 border border-gray-200 text-gray-400 hover:text-red-500">
              <Trash2 size={14} />
            </button>
          </div>
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 bg-white/95 rounded-lg
                          border border-gray-200 px-1.5 py-1">
            <button onClick={() => onMove(-1)} title="Earlier"
              className="p-0.5 text-gray-400 hover:text-[#1e3a5f]"><ArrowLeft size={13} /></button>
            <button onClick={() => onMove(1)} title="Later"
              className="p-0.5 text-gray-400 hover:text-[#1e3a5f]"><ArrowRight size={13} /></button>
            <span className="w-px h-3.5 bg-gray-200" />
            <button onClick={() => onSpan(Math.max(2, span - 1))} title="Narrower"
              className="px-1 text-[13px] font-bold text-gray-400 hover:text-[#1e3a5f]">−</button>
            <span className="text-[11px] tabular-nums text-gray-400 w-8 text-center">{span}/{columns}</span>
            <button onClick={() => onSpan(Math.min(columns, span + 1))} title="Wider"
              className="px-1 text-[13px] font-bold text-gray-400 hover:text-[#1e3a5f]">+</button>
            <span className="w-px h-3.5 bg-gray-200" />
            <button onClick={() => onTall(Math.max(120, height - 40))} title="Shorter"
              className="px-1 text-[13px] font-bold text-gray-400 hover:text-[#1e3a5f]">↑</button>
            <button onClick={() => onTall(Math.min(900, height + 40))} title="Taller"
              className="px-1 text-[13px] font-bold text-gray-400 hover:text-[#1e3a5f]">↓</button>
          </div>
        </>
      )}
    </div>
  );
}
