import React, { useMemo, useState } from 'react';
import { X, Search, Plus } from 'lucide-react';
import { useStore } from '../../data/store';
import { WIDGETS, CATEGORY_LABEL, WidgetCategory, WidgetDef, WidgetCtx, withSampleData } from '../../data/widgets';
import { CanvasElement } from '../../types';
import { WIDGET_PREVIEW, WIDGET_PREVIEW_COLOR } from '../../data/widgetFields';

/**
 * Browse and place widgets.
 *
 * Grouped rather than one long grid, because the groups answer a real question:
 * "will this stay correct on its own, or do I have to keep it up to date?"
 * Live widgets read the actual data; planning ones hold their own. That
 * distinction is the first thing anyone needs to know before placing one.
 */
export function WidgetStore({ onPick, onClose }: {
  onPick: (def: WidgetDef) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<WidgetCategory | 'all'>('all');
  const { apartments, stages, contractorAssignments, contractors, contractorPhotos, activityLogs } = useStore();

  /**
   * Previews run on the REAL data, not on mock rows.
   *
   * A store that shows an artist's impression tells you nothing about whether a
   * widget is worth placing; one that shows your own overdue list, your own
   * stages and your own contractors answers that in a glance. They are
   * read-only, so nothing in the store can change anything.
   */
  const previewCtx: WidgetCtx = useMemo(() => ({
    jobs: apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed && !a.boardBin),
    stages, assignments: contractorAssignments, contractors,
    photos: contractorPhotos, logs: activityLogs,
    update: () => {}, openJob: () => {}, readOnly: true,
  }), [apartments, stages, contractorAssignments, contractors, contractorPhotos, activityLogs]);

  // Samples fill in only where the real thing is empty, so a new board still
  // shows what each widget looks like with something in it.
  const shownCtx = useMemo(() => withSampleData(previewCtx), [previewCtx]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return WIDGETS.filter(w =>
      (cat === 'all' || w.category === cat)
      && (!needle || w.name.toLowerCase().includes(needle) || w.blurb.toLowerCase().includes(needle)));
  }, [q, cat]);

  const groups = (['live', 'plan', 'ref', 'visual'] as WidgetCategory[])
    .map(c => ({ c, items: shown.filter(w => w.category === c) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/45 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[80] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(980px, 94vw)', height: 'min(720px, 90vh)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3 bg-[#1e3a5f] text-white flex-shrink-0">
          <span className="font-bold text-sm">Widget store</span>
          <span className="text-[11px] text-white/60">{WIDGETS.length} to choose from</span>
          <span className="flex-1" />
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10"><X size={17} /></button>
        </div>

        <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 flex-shrink-0 flex-wrap">
          <Search size={14} className="text-gray-400" />
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search widgets…"
            className="flex-1 min-w-[140px] text-sm outline-none bg-transparent"
          />
          {(['all', 'live', 'plan', 'ref', 'visual'] as const).map(c => (
            <button key={c} onClick={() => setCat(c)}
              className="text-[10.5px] font-bold px-2.5 py-1 rounded-full transition-colors"
              style={cat === c
                ? { backgroundColor: '#1e3a5f', color: '#fff' }
                : { backgroundColor: '#f1f5f9', color: '#64748b' }}>
              {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {groups.length === 0 && (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">Nothing matches that.</div>
          )}
          {groups.map(({ c, items }) => (
            <div key={c} className="mb-5">
              <div className="text-[10px] font-extrabold text-gray-400 tracking-wide mb-2">
                {CATEGORY_LABEL[c].toUpperCase()}
                {c === 'live' && <span className="ml-2 font-medium normal-case text-gray-300">keeps itself up to date</span>}
              </div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(226px, 1fr))' }}>
                {items.map(w => (
                  <WidgetCard key={w.id} def={w} ctx={shownCtx} onPick={onPick} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-400 flex-shrink-0">
          Every preview above is running on your real data. Widgets move, resize, colour and hide from
          the TV exactly like notes and boxes do.
        </div>
      </div>
    </>
  );
}

/**
 * One shelf item: the widget itself, running, filled with something to look at.
 *
 * Two things were wrong here and they pulled in opposite directions.
 *
 * The scale was `max(BOX_W/w, min(BOX_H/h, 1.6))` — a "cover" fit. On a 56px
 * pin that works out at 4x, which is why the clip art was enormous; on the
 * 400px-wide week planner it is 0.86, which pushed a 343px widget through a
 * 226px window and cropped a third of it off. It is a CONTAIN fit now, capped
 * so a small piece is enlarged a little but never blown up, and centred.
 *
 * The content was drawn from `def.data`, which is the seed a NEWLY PLACED
 * widget starts with — correctly empty, because a checklist you place should be
 * yours to fill. Reusing it for the preview is what made half the shelf show
 * blank boxes and the week planner show an empty week. Previews use
 * `WIDGET_PREVIEW` instead, which exists only for this.
 */
function WidgetCard({ def, ctx, onPick }: {
  def: WidgetDef; ctx: WidgetCtx; onPick: (d: WidgetDef) => void;
}) {
  const Icon = def.icon;
  const BOX_W = 226, BOX_H = 150;
  const isArt = def.id.startsWith('art-');

  // A widget fills the card's WIDTH — that is what makes the shelf look full
  // rather than like a grid of postage stamps in white boxes. Anything taller
  // than the card is cropped with a fade, the way a real shelf looks.
  //
  // Clip art is the exception and has to be: filling the width with a 56px pin
  // means scaling it four times, which is what made it enormous. It gets a
  // contain fit against a board-textured backdrop instead.
  const contain = Math.min((BOX_W - 16) / def.w, (BOX_H - 16) / def.h);
  const k = isArt ? Math.min(contain, 1.5) : Math.min((BOX_W - 10) / def.w, 1.5);
  const drawnW = def.w * k, drawnH = def.h * k;

  const preview: CanvasElement = {
    id: `preview-${def.id}`,
    type: 'widget',
    widget: def.id,
    x: 0, y: 0, w: def.w, h: def.h,
    text: def.id === 'w-title' ? 'THIS WEEK' : '',
    color: WIDGET_PREVIEW_COLOR[def.id] ?? '#ffffff',
    ...(isArt ? { art: def.id.slice(4) as CanvasElement['art'] } : {}),
    ...(def.id === 'w-countdown' ? { targetAt: new Date(Date.now() + 61 * 3_600_000).toISOString() } : {}),
    ...(def.id === 'w-stopwatch' ? { elapsedMs: 1_000 * (60 * 42 + 17) } : {}),
    data: {
      ...(def.data ? JSON.parse(JSON.stringify(def.data)) : {}),
      ...(WIDGET_PREVIEW[def.id] ?? {}),
    },
  };

  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onPick(def)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(def); } }}
      className="group text-left rounded-xl border border-gray-200 overflow-hidden hover:border-[#4aa8d8] hover:shadow-md transition-all flex flex-col cursor-pointer"
    >
      <div
        className="relative overflow-hidden flex justify-center"
        style={{
          height: BOX_H,
          alignItems: drawnH > BOX_H - 4 ? 'flex-start' : 'center',
          // Clip art is a thing you stick ON a board, so it is shown against
          // one rather than floating on white.
          background: isArt
            ? 'radial-gradient(circle at 1px 1px, rgba(15,23,42,.10) 1px, transparent 0) 0 0/12px 12px, #f8fafc'
            : '#ffffff',
        }}
      >
        <div
          className="origin-center"
          style={{
            width: def.w, height: def.h,
            transform: `scale(${k})`,
            // The preview is a picture of the widget, not a working copy.
            pointerEvents: 'none',
            // Reserve the SCALED footprint so centring is honest.
            marginLeft: (drawnW - def.w) / 2,
            marginTop: (drawnH - def.h) / 2,
            ...(isArt ? {} : {
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 4px rgba(15,23,42,.06)',
              backgroundColor: '#fff',
              overflow: 'hidden',
            }),
          }}
        >
          {def.render(preview, ctx)}
        </div>
        {/* A soft fade where a tall widget is cropped, so the cut looks meant. */}
        {drawnH > BOX_H - 4 && (
          <div className="absolute inset-x-0 bottom-0 h-9 pointer-events-none"
            style={{ background: 'linear-gradient(transparent, #ffffff)' }} />
        )}
        <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: '#1e3a5f' }}>
          <Plus size={10} /> Add
        </span>
      </div>
      <div className="p-2.5 flex-1 border-t border-gray-100">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Icon size={13} className="text-[#1e3a5f] flex-shrink-0" />
          <span className="font-bold text-[12px] text-gray-900">{def.name}</span>
        </div>
        <p className="text-[10px] text-gray-500 leading-snug">{def.blurb}</p>
      </div>
    </div>
  );
}
