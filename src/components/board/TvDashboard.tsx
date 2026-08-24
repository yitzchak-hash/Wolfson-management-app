import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Move } from 'lucide-react';
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
 * its height is layout pixels.
 *
 * THE SIZE IS NOT THIS COMPONENT'S BUSINESS (sealed picks 1–2). The display
 * size is applied ONCE, by the caller, as a layout zoom around the whole
 * dashboard — every `Math.min(scale, cap)` that used to live in here is what
 * made the office's red button dead: a wide panel STARTED at the cap, so
 * pressing 90% → 160% changed the label and froze the picture. Deltas from
 * pointer gestures arrive in visual pixels, so the handlers measure the
 * effective zoom off their own node (`rect / offset`, the ScreenReport idiom)
 * instead of being handed a number that can drift from the truth.
 *
 * The same component draws it on the wall and inside app settings, which is
 * what makes "edit it in settings and it updates the wall" true rather than
 * approximately true: there is one layout, not a description of one.
 */
export function TvDashboard({ ctx, shape, editing, onSpawn, ratio }: {
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

  /**
   * Home-screen reordering, the dashboard's own idiom: carry a card over
   * another and it takes that card's slot, the whole order rewritten dense so
   * two cards can never share a z. Per SHAPE, through `patchPlace` — what
   * reads best first across a wide screen is often not what should lead on a
   * tall one.
   */
  function placeOver(id: string, overId: string) {
    if (id === overId) return;
    const ids = widgets.map(w => w.id);
    const from = ids.indexOf(id), to = ids.indexOf(overId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    ids.forEach((wid, i) => {
      const el = widgets.find(w => w.id === wid);
      if (el && placeOn(el, shapeKey).z !== i) {
        updateCanvasElement(wid, patchPlace(el, shapeKey, { z: i }));
      }
    });
  }

  /** Live card rectangles, measured at drag time — the grid reflows under us. */
  const rects = useRef(new Map<string, HTMLDivElement>());

  if (widgets.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <button
          onClick={onSpawn}
          disabled={!onSpawn}
          className="rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-colors
                     disabled:cursor-default"
          style={{ borderColor: '#cbd5e1', color: '#64748b', fontSize: 15 }}
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
        fontSize: 15,
      }}
    >
      {widgets.map(el => (
        <TvCard
          key={el.id}
          el={el}
          ctx={ctx}
          columns={columns}
          editing={editing}
          shapeKey={shapeKey}
          registry={rects}
          onSize={(cols, h) => updateCanvasElement(el.id, patchPlace(el, shapeKey, { w: cols * 100, h }))}
          onPlaceOver={overId => placeOver(el.id, overId)}
          onRemove={() => deleteCanvasElement(el.id)}
        />
      ))}
    </div>
  );
}

function TvCard({ el, ctx, columns, editing, shapeKey, registry, onSize, onPlaceOver, onRemove }: {
  el: CanvasElement;
  ctx: WidgetCtx;
  columns: number;
  editing: boolean;
  shapeKey: string;
  registry: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onSize: (cols: number, h: number) => void;
  onPlaceOver: (overId: string) => void;
  onRemove: () => void;
}) {
  const def = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;
  const updateCanvasElement = useStore(st => st.updateCanvasElement);
  const ref = useRef<HTMLDivElement>(null);

  const place = placeOn(el, shapeKey);
  const span = Math.max(2, Math.min(columns, Math.round((place.w || 400) / 100)));
  const height = Math.max(120, place.h || 200);
  /**
   * The zoom the card is really drawn at — the caller's wrapper zoom (and the
   * TV frame's real-pixel compensation) folded together, read off the node
   * itself. Drag deltas arrive in VISUAL pixels and stored sizes are layout
   * pixels, so gestures divide by this. Never handed in as a prop: a prop is
   * a claim, and this is a measurement.
   */
  const zoomOf = () => {
    const node = registry.current.get(el.id);
    return node && node.offsetHeight
      ? node.getBoundingClientRect().height / node.offsetHeight : 1;
  };

  /**
   * Home-screen editing, two handles and nothing else — the same gestures the
   * main dashboard already has, so arranging the wall feels like arranging
   * anything else:
   *  · the MOVE handle at the top-left — hold it and carry the card; whichever
   *    card you hold it over gives up its slot and the grid reflows live;
   *  · the RESIZE handle at the bottom-right — snapping to whole columns and
   *    40px rows so cards line up with each other by construction.
   */
  const [lift, setLift] = useState<{ dx: number; dy: number } | null>(null);
  const moveRef = useRef<{ x: number; y: number } | null>(null);
  function moveDown(e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    moveRef.current = { x: e.clientX, y: e.clientY };
    setLift({ dx: 0, dy: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function moveMove(e: React.PointerEvent) {
    const st = moveRef.current;
    if (!st) return;
    // The translate is applied INSIDE the caller's zoom, the pointer moves in
    // visual pixels — divide, or the lifted card outruns the hand at any size
    // but 100%.
    const z = zoomOf();
    setLift({ dx: (e.clientX - st.x) / z, dy: (e.clientY - st.y) / z });
    // What is the hand over? Measured live, because the grid reflows under us.
    for (const [id, node] of registry.current) {
      if (id === el.id) continue;
      const r = node.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        onPlaceOver(id);
        // The card we displaced moves; our translation stays anchored to the
        // pointer, so re-baseline the grab point to avoid a visual jump.
        moveRef.current = { x: e.clientX, y: e.clientY };
        setLift({ dx: 0, dy: 0 });
        break;
      }
    }
  }
  function moveUp() { moveRef.current = null; setLift(null); }

  const sizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [preview, setPreview] = useState<{ span: number; h: number } | null>(null);
  function sizeDown(e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    sizeRef.current = { x: e.clientX, y: e.clientY, w: span * 100, h: height };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function sizeMove(e: React.PointerEvent) {
    const st = sizeRef.current;
    if (!st) return;
    // A column measured from our own card's VISUAL rect, so the width snap is
    // zoom-independent by construction (delta and rect share the visual
    // space); the height delta divides by the measured zoom so the stored
    // numbers stay screen-independent.
    const node = registry.current.get(el.id);
    const colPx = node ? node.getBoundingClientRect().width / span : 100;
    const nextSpan = Math.max(2, Math.min(columns,
      Math.round((st.w / 100) + (e.clientX - st.x) / Math.max(1, colPx))));
    const nextH = Math.max(120, Math.min(900,
      Math.round((st.h + (e.clientY - st.y) / zoomOf()) / 40) * 40));
    setPreview({ span: nextSpan, h: nextH });
  }
  function sizeUp() {
    const p = preview;
    sizeRef.current = null;
    setPreview(null);
    if (p) onSize(p.span, p.h);
  }

  // 0 during a resize puts the card back to the shape's default footprint.
  useEffect(() => {
    if (!preview) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== '0') return;
      ev.preventDefault();
      sizeRef.current = null;
      setPreview(null);
      onSize(4, 200);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  const shownSpan = Math.max(2, Math.min(columns, preview?.span ?? span));
  const shownH = Math.max(120, preview?.h ?? height);

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

  // Fill the card from the widget's natural width, nothing more: the display
  // size is the caller's zoom, applied around the whole dashboard, so putting
  // any scale factor here would apply it twice — and capping it here is the
  // exact bug that froze the wall at one size.
  const naturalW = def?.w ?? 300;
  const k = box.w ? Math.max(0.5, Math.min(4, box.w / naturalW)) : 1;

  const bound: WidgetCtx = useMemo(
    () => ({ ...ctx, update: patch => updateCanvasElement(el.id, patch) }),
    [ctx, el.id, updateCanvasElement],
  );

  return (
    <div
      ref={node => { if (node) registry.current.set(el.id, node); else registry.current.delete(el.id); }}
      className="relative group bg-white rounded-2xl border overflow-hidden"
      style={{
        gridColumn: `span ${shownSpan} / span ${shownSpan}`,
        height: shownH,
        borderColor: el.outline || '#e2e8f0',
        borderWidth: el.outline ? (el.outlineWidth ?? 3) : 1,
        backgroundColor: el.color || '#ffffff',
        transform: lift ? `translate(${lift.dx}px, ${lift.dy}px) scale(1.02)` : undefined,
        boxShadow: lift ? '0 14px 34px rgba(15,23,42,.25)' : undefined,
        zIndex: lift ? 30 : undefined,
        transition: lift ? 'none' : 'box-shadow 150ms ease',
        outline: preview ? '2px dashed #4aa8d8' : undefined,
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
          {/* The MOVE handle: top-left, like picking an app up by its corner. */}
          <button
            onPointerDown={moveDown} onPointerMove={moveMove}
            onPointerUp={moveUp} onPointerCancel={moveUp}
            title="Hold and drag to rearrange"
            className="absolute top-1.5 left-1.5 p-1.5 rounded-lg bg-white/95 border border-gray-200
                       text-gray-400 hover:text-[#1e3a5f] cursor-grab active:cursor-grabbing"
            style={{ touchAction: 'none' }}
          >
            <Move size={14} />
          </button>
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
            <button onClick={onRemove} title="Take it off the wall"
              className="p-1.5 rounded-lg bg-white/95 border border-gray-200 text-gray-400 hover:text-red-500">
              <Trash2 size={14} />
            </button>
          </div>
          {/* The RESIZE handle: bottom-right, the only corner that resizes. */}
          <button
            onPointerDown={sizeDown} onPointerMove={sizeMove}
            onPointerUp={sizeUp} onPointerCancel={sizeUp}
            title="Drag to resize — snaps to the grid; 0 resets"
            className="absolute bottom-1 right-1 w-5 h-5 rounded-sm cursor-nwse-resize"
            style={{
              touchAction: 'none',
              backgroundImage: 'linear-gradient(135deg, transparent 45%, #94a3b8 45%, #94a3b8 55%, transparent 55%, transparent 70%, #94a3b8 70%, #94a3b8 80%, transparent 80%)',
            }}
          />
          {preview && (
            <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold
                             bg-[#1e3a5f] text-white tabular-nums">
              {preview.span}/{columns} · {preview.h}px
            </span>
          )}
        </>
      )}
    </div>
  );
}
