import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Plus, Check } from 'lucide-react';
import { useStore } from '../../data/store';
import {
  WIDGETS, CATEGORY_LABEL, WidgetCategory, WidgetDef, WidgetCtx, withSampleData,
} from '../../data/widgets';
import { CanvasElement } from '../../types';
import { WIDGET_PREVIEW, WIDGET_PREVIEW_COLOR } from '../../data/widgetFields';

const CARD_W = 226, CARD_H = 150;

/**
 * The shelf.
 *
 * Three things were wrong with it as a place to shop rather than as a list.
 *
 * It closed the moment you took something, so furnishing a board meant opening
 * it five times. It opened as one long grid, so the only way to see what was in
 * a category was to scroll and hope. And it was a 980px box on a wide monitor,
 * which showed four cards and a lot of desktop.
 *
 * All three are the same mistake: treating the store as a dialog that produces
 * one answer, rather than as a drawer you work out of.
 */
export function WidgetStore({ onPick, onClose }: {
  onPick: (def: WidgetDef) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<WidgetCategory | 'all'>('all');
  /** What you have taken this visit, so the shelf can say so. */
  const [taken, setTaken] = useState<Record<string, number>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const {
    apartments, stages, contractorAssignments, contractors, contractorPhotos, activityLogs, users,
    projects, currentProjectId,
  } = useStore();

  /**
   * Previews run on the REAL data where there is any, samples where there is
   * not. An artist's impression tells you nothing about whether a widget is
   * worth placing; your own overdue list answers it at a glance.
   */
  const previewCtx: WidgetCtx = useMemo(() => ({
    jobs: apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed && !a.boardBin),
    stages, assignments: contractorAssignments, contractors, users,
    photos: contractorPhotos, logs: activityLogs,
    update: () => {}, openJob: () => {}, readOnly: true,
  }), [apartments, stages, contractorAssignments, contractors, contractorPhotos, activityLogs]);

  const shownCtx = useMemo(() => withSampleData(previewCtx), [previewCtx]);

  // Escape closes it. The store deliberately STAYS OPEN after each placement so
  // you can take three things in a row, which makes having a way out that does
  // not involve aiming at a small × more important, not less.
  useEffect(() => {
    function key(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return WIDGETS.filter(w =>
      !needle || w.name.toLowerCase().includes(needle) || w.blurb.toLowerCase().includes(needle));
  }, [q]);

  /** A row per group, each in its own order of usefulness. */
  const groups = useMemo(() => (['live', 'plan', 'ref', 'visual'] as WidgetCategory[])
    .map(c => ({
      c,
      items: matches
        .filter(w => w.category === c)
        .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name)),
    }))
    .filter(g => g.items.length > 0 && (cat === 'all' || cat === g.c)),
  [matches, cat]);

  /**
   * Live pieces of the other workspaces.
   *
   * A job board carrying how Wolfson is doing is a thing people ask for, and
   * until now the only way to see it was to switch workspace and lose the board
   * you were on.
   */
  const otherWorkspaces = useMemo(
    () => projects.filter(p => p.id !== currentProjectId),
    [projects, currentProjectId],
  );

  function take(def: WidgetDef) {
    onPick(def);
    setTaken(t => ({ ...t, [def.id]: (t[def.id] ?? 0) + 1 }));
    // Focus returns to the search so the next one is a keystroke away.
    searchRef.current?.focus();
  }

  const totalTaken = Object.values(taken).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className="fixed inset-0 z-[70]" style={{ backgroundColor: 'rgba(15,23,42,.5)' }} onClick={onClose} />
      <div
        className="fixed z-[80] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(1560px, 96vw)', height: 'min(1000px, 94vh)',
        }}
      >
        <div className="px-6 pt-5 pb-3 flex-shrink-0" style={{ backgroundColor: '#1e3a5f' }}>
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-[15px]">Widgets</span>
            <span className="flex-1" />
            {totalTaken > 0 && (
              <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,.16)', color: '#fff' }}>
                {totalTaken} added
              </span>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/80 hover:bg-white/15">
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ backgroundColor: 'rgba(255,255,255,.12)' }}>
            <Search size={19} className="text-white/70 flex-shrink-0" />
            <input
              ref={searchRef}
              autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder={`Search ${WIDGETS.length} widgets — a number, a list, a note, a picture…`}
              className="flex-1 min-w-0 bg-transparent outline-none text-white text-[16px] placeholder:text-white/45"
            />
            {q && (
              <button onClick={() => setQ('')} className="text-white/60 hover:text-white"><X size={16} /></button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {(['all', 'live', 'plan', 'ref', 'visual'] as const).map(c => {
              const on = cat === c;
              const n = c === 'all' ? matches.length : matches.filter(w => w.category === c).length;
              return (
                <button key={c} onClick={() => setCat(c)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold transition-colors"
                  style={on
                    ? { backgroundColor: '#fff', color: '#1e3a5f' }
                    : { backgroundColor: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.82)' }}>
                  {c === 'all' ? 'Everything' : CATEGORY_LABEL[c]}
                  <span className="text-[11px] font-extrabold opacity-60">{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {groups.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <p className="text-[15px] text-gray-500">Nothing matches “{q.trim()}”.</p>
              <button onClick={() => { setQ(''); setCat('all'); }}
                className="mt-2 text-[13px] font-semibold text-[#4aa8d8]">Show everything</button>
            </div>
          )}

          {groups.map(({ c, items }) => (
            <div key={c} className="mb-7">
              <div className="flex items-baseline gap-2 mb-3">
                <h3 className="text-[15px] font-extrabold text-gray-900">{CATEGORY_LABEL[c]}</h3>
                <span className="text-[12px] text-gray-400">{items.length}</span>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_W}px, 1fr))` }}>
                {items.map(w => (
                  <WidgetCard key={w.id} def={w} ctx={shownCtx} onPick={take} taken={taken[w.id] ?? 0} />
                ))}
              </div>
            </div>
          ))}

          {cat === 'all' && !q.trim() && otherWorkspaces.length > 0 && (
            <div className="mb-4">
              <h3 className="text-[15px] font-extrabold text-gray-900 mb-1">From your other workspaces</h3>
              <p className="text-[12.5px] text-gray-500 mb-3" style={{ maxWidth: '70ch' }}>
                A live piece of another workspace, on this board. It keeps reading that
                workspace's own data, so it stays right without anybody maintaining it.
              </p>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_W}px, 1fr))` }}>
                {otherWorkspaces.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const def = WIDGETS.find(w => w.id === 'project-glance');
                      if (def) take({ ...def, data: { ...(def.data ?? {}), projectId: p.id } });
                    }}
                    className="text-left rounded-xl border border-gray-200 overflow-hidden hover:border-[#4aa8d8] hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-2 px-3 py-2.5"
                      style={{ backgroundColor: `${p.color}14`, borderBottom: `2px solid ${p.color}` }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="font-bold text-[13px] text-gray-900 truncate">{p.name}</span>
                    </div>
                    <div className="p-3">
                      <div className="text-[11px] text-gray-500">
                        Stages, counts and progress for {p.shortName ?? p.name}, live.
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-bold" style={{ color: p.color }}>
                        <Plus size={11} /> Add to this board
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * One shelf item.
 *
 * A widget fills the card's WIDTH — that is what makes the shelf look full
 * rather than like a grid of stamps in white boxes. Clip art is the exception
 * and has to be: filling the width with a 56px pin means scaling it four times.
 *
 * The content is `WIDGET_PREVIEW`, never `def.data`. `data` is the seed a newly
 * placed widget starts with and is correctly empty — reusing it for the preview
 * is what made half the shelf blank.
 */
function WidgetCard({ def, ctx, onPick, taken }: {
  def: WidgetDef; ctx: WidgetCtx; onPick: (d: WidgetDef) => void; taken: number;
}) {
  const Icon = def.icon;
  const isArt = def.id.startsWith('art-');

  const contain = Math.min((CARD_W - 16) / def.w, (CARD_H - 16) / def.h);
  const k = isArt ? Math.min(contain, 1.5) : Math.min((CARD_W - 10) / def.w, 1.5);
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
      className="group text-left rounded-xl border border-gray-200 overflow-hidden hover:border-[#4aa8d8] hover:shadow-md transition-all flex flex-col cursor-pointer relative"
    >
      <div
        className="relative overflow-hidden flex justify-center"
        style={{
          height: CARD_H,
          alignItems: drawnH > CARD_H - 4 ? 'flex-start' : 'center',
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
            pointerEvents: 'none',
            marginLeft: (drawnW - def.w) / 2,
            marginTop: (drawnH - def.h) / 2,
            ...(isArt ? {} : {
              borderRadius: 12, border: '1px solid #e2e8f0',
              boxShadow: '0 1px 4px rgba(15,23,42,.06)',
              backgroundColor: '#fff', overflow: 'hidden',
            }),
          }}
        >
          {def.render(preview, ctx)}
        </div>

        {drawnH > CARD_H - 4 && (
          <div className="absolute inset-x-0 bottom-0 h-9 pointer-events-none"
            style={{ background: 'linear-gradient(transparent, #ffffff)' }} />
        )}

        {/* Taken this visit — so placing five reads as five. */}
        {taken > 0 && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: '#16a34a' }}>
            <Check size={10} /> {taken > 1 ? `${taken} added` : 'added'}
          </span>
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
