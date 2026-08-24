import React, { useMemo, useRef, useState } from 'react';
import { Tv, Monitor, Maximize2, ExternalLink, Pencil, Plus } from 'lucide-react';
import { useStore } from '../data/store';
import { TV_DASH_BOARD, isCountableApartment } from '../types';
import { TvDashboard } from '../components/board/TvDashboard';
import { WidgetStore } from '../components/board/WidgetStore';
import { WidgetCtx } from '../data/widgets';
import { TV_ALLOWED } from '../data/tvWidgets';
import { nearestRatio } from '../data/dashRatios';
import { bareDomain } from '../data/portalLink';

/** A bare domain in an href is a relative path; the scheme goes back on. */
const openable = (shown: string) => (/^https?:\/\//i.test(shown) ? shown : `https://${shown}`);

/**
 * What the TV sees, from a computer.
 *
 * This is where the wall gets arranged, rather than a form in settings that
 * described the wall in words. It draws at the panel's REAL shape, so what you
 * lay out here is what walks onto the wall — a dashboard arranged in a square
 * box and then shown on a 16:9 panel is a different dashboard.
 *
 * The wall itself stays read-only, which is the point of doing this from a PC.
 */

/** Shapes a panel is actually sold in, plus what each is usually driven at. */
const SHAPES: { id: string; label: string; w: number; h: number; note: string }[] = [
  { id: '16:9',  label: '16:9',  w: 16, h: 9,  note: 'Most TVs · 1080p and 4K' },
  { id: '16:10', label: '16:10', w: 16, h: 10, note: 'Some monitors' },
  { id: '4:3',   label: '4:3',   w: 4,  h: 3,  note: 'Older panels' },
  { id: '9:16',  label: '9:16',  w: 9,  h: 16, note: 'Turned upright' },
];

const RESOLUTIONS: { id: string; label: string; w: number }[] = [
  { id: 'hd',  label: '1080p', w: 1920 },
  { id: 'qhd', label: '1440p', w: 2560 },
  { id: '4k',  label: '4K',    w: 3840 },
];

export function TvViewPage() {
  const {
    boardSettings, setTvSetting, apartments, stages, contractorAssignments, contractors,
    contractorPhotos, activityLogs, users, canvasElements, currentUser,
  } = useStore();

  const tv = boardSettings.__tv ?? {};
  const shape = SHAPES.find(s => s.id === (tv.tvShape ?? '16:9')) ?? SHAPES[0];
  const res = RESOLUTIONS.find(r => r.id === (tv.tvRes ?? 'hd')) ?? RESOLUTIONS[0];
  const isAdmin = currentUser?.role === 'admin';

  const [editing, setEditing] = useState(false);
  const [store, setStore] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  const domain = bareDomain(tv.tvDomain);
  const link = domain ? `${domain}/tv` : `${window.location.origin}/tv`;

  /**
   * The panel drawn to scale inside whatever room the page has.
   *
   * Its width in real pixels is the resolution; the box on screen is that
   * shrunk to fit. The scale is handed to the dashboard so a card takes the
   * same fraction of this box as it will of the wall.
   */
  const [box, setBox] = useState({ w: 960, h: 540 });
  React.useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () => {
      // Fit the shape inside the room available, longest constraint first.
      // Measuring the drawn element and dividing was one arithmetic step too
      // many — the box came out at the container's height rather than the
      // shape's, and the panel was the wrong shape by a noticeable amount.
      // The CONTENT box. `clientWidth` includes the padding, so the panel was
      // sized to a space 48px bigger than it had — and because it is a flex
      // item, the browser then shrank the width to fit while leaving the
      // height alone, which is how a 16:9 panel came out at 1.72.
      const cs = getComputedStyle(node);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const availW = Math.max(200, node.clientWidth - padX);
      const availH = Math.max(200, node.clientHeight - padY);
      const wide = availW / availH > shape.w / shape.h;
      const w = wide ? (availH * shape.w) / shape.h : availW;
      const h = wide ? availH : (availW * shape.h) / shape.w;
      setBox({ w: Math.round(w), h: Math.round(h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [shape.w, shape.h]);

  const ctx: WidgetCtx = useMemo(() => ({
    jobs: apartments.filter(isCountableApartment),
    stages, assignments: contractorAssignments, contractors, users,
    photos: contractorPhotos, logs: activityLogs,
    boardElements: canvasElements,
    update: () => {},
    openJob: () => {},
    readOnly: true,
  }), [apartments, stages, contractorAssignments, contractors, users, contractorPhotos,
       activityLogs, canvasElements]);

  const onWall = canvasElements.filter(e => e.board === TV_DASH_BOARD).length;
  /** The box is drawn at the panel's width, so a card sizes as it will there. */
  const scale = box.w / (res.w / 2);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-5 py-3 flex-wrap flex-shrink-0 border-b border-gray-200">
        <Tv size={18} className="text-[#4aa8d8]" />
        <h1 className="font-bold text-[15px] text-gray-800">TV</h1>

        <span className="flex-1" />

        {/* Shape and resolution — the panel this is being laid out for. */}
        <span className="flex items-center rounded-lg overflow-hidden border border-gray-200"
          title="The shape of the panel this is laid out for">
          {SHAPES.map(sh => (
            <button key={sh.id} data-shape={sh.id}
              onClick={() => setTvSetting('tvShape', sh.id)}
              title={sh.note}
              className="px-2.5 py-1.5 text-[12px] font-bold transition-colors"
              style={sh.id === shape.id
                ? { backgroundColor: '#1e3a5f', color: '#fff' }
                : { backgroundColor: '#fff', color: '#64748b' }}>
              {sh.label}
            </button>
          ))}
        </span>

        <span className="flex items-center rounded-lg overflow-hidden border border-gray-200"
          title="What the panel is driven at">
          {RESOLUTIONS.map(r => (
            <button key={r.id} data-res={r.id}
              onClick={() => setTvSetting('tvRes', r.id)}
              className="px-2.5 py-1.5 text-[12px] font-bold transition-colors"
              style={r.id === res.id
                ? { backgroundColor: '#1e3a5f', color: '#fff' }
                : { backgroundColor: '#fff', color: '#64748b' }}>
              {r.label}
            </button>
          ))}
        </span>

        {isAdmin && (
          <button data-arrange onClick={() => setEditing(v => !v)}
            title="Move and resize what is on the wall"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors"
            style={editing
              ? { backgroundColor: '#f59e0b', color: '#fff', borderColor: '#f59e0b' }
              : { backgroundColor: '#fff', color: '#475569', borderColor: '#e2e8f0' }}>
            <Pencil size={14} /> Arrange
          </button>
        )}

        {isAdmin && (
          <button data-add-widget onClick={() => setStore(true)}
            title="Put something on the wall"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-bold text-white"
            style={{ backgroundColor: '#1e3a5f' }}>
            <Plus size={14} /> Add
          </button>
        )}

        <a href={openable(link)} target="_blank" rel="noopener noreferrer"
          title="Open the wall itself in a new tab"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200
                     text-[12.5px] font-semibold text-gray-600 hover:text-[#4aa8d8] hover:border-[#4aa8d8]">
          <ExternalLink size={14} /> Open
        </a>
      </div>

      {/* The panel, to scale. */}
      <div ref={frame} className="flex-1 min-h-0 p-6 flex items-center justify-center bg-slate-100">
        <div
          data-tv-frame
          className="relative bg-white shadow-2xl flex flex-col overflow-hidden"
          style={{
            width: box.w, height: box.h,
            // Never shrunk by the flex row it sits in: shrinking one side and
            // not the other is what makes a panel the wrong shape.
            flexShrink: 0,
            aspectRatio: `${shape.w} / ${shape.h}`,
            borderRadius: 10,
            outline: '10px solid #0f172a',
            outlineOffset: 0,
          }}
        >
          {/* The mock-up lays out at half the panel's real resolution and is
              zoomed into the box — one layout zoom, the same single-number
              pipeline the wall itself uses. TvDashboard no longer takes a
              scale of its own. */}
          {(() => {
            const z = Math.max(0.6, scale);
            return (
              <div className="flex-1 min-h-0 overflow-hidden">
                <div className="flex flex-col" style={{ zoom: z, width: `${100 / z}%`, height: `${100 / z}%` }}>
                  <TvDashboard
                    ctx={ctx}
                    // The mock-up shows the arrangement for the shape being mocked up,
                    // not for the browser window it is being mocked up in.
                    ratio={nearestRatio(shape.w, shape.h)}
                    shape={{
                      orientation: shape.w >= shape.h ? 'landscape' : 'portrait',
                      width: box.w, height: box.h,
                      ratio: box.h / Math.max(1, box.w),
                      narrow: false,
                    }}
                    editing={editing}
                    onSpawn={isAdmin ? () => setStore(true) : undefined}
                  />
                </div>
              </div>
            );
          })()}

          {/* The panel's own measurements, quietly, in its bezel. */}
          <span data-tv-caption
            className="absolute -bottom-[26px] left-0 right-0 text-center text-[11px] text-slate-400 tabular-nums">
            {shape.label} · {res.label} · {onWall} on the wall
          </span>
        </div>
      </div>

      {store && (
        <WidgetStore
          only={TV_ALLOWED}
          onPick={def => {
            useStore.getState().addCanvasElement({
              id: `CE-${Math.random().toString(36).slice(2, 9)}`,
              type: 'widget',
              widget: def.id,
              board: TV_DASH_BOARD,
              x: 0, y: 0,
              w: def.w, h: def.h,
              text: '', color: '#ffffff',
              addedAt: new Date().toISOString(),
              data: def.data ? JSON.parse(JSON.stringify(def.data)) : {},
            });
          }}
          onClose={() => setStore(false)}
        />
      )}
    </div>
  );
}
