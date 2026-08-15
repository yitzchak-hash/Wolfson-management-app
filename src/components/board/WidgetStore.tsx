import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Plus, Check } from 'lucide-react';
import { useStore } from '../../data/store';
import {
  WIDGETS, CATEGORY_LABEL, WidgetCategory, WidgetDef, WidgetCtx, withSampleData,
} from '../../data/widgets';
import { CanvasElement, MAIN_BOARD, Project } from '../../types';
import { WIDGET_PREVIEW, WIDGET_PREVIEW_COLOR } from '../../data/widgetFields';

/**
 * Big enough to read the widget, not the label.
 *
 * The median widget is 235×165. In a 226×150 card everything was being scaled
 * DOWN — you were shopping from thumbnails of the thing rather than the thing,
 * and a shelf of 73 unreadable stamps is a shelf you cannot choose from. At
 * 340×240 the median draws at about 1.4× instead, so a widget in the store is
 * the size it will be on the board and then some.
 *
 * Four across a wide panel rather than six. Fewer, larger, legible.
 */
const CARD_W = 340, CARD_H = 240;

/**
 * The shelf's zoom, remembered per machine.
 *
 * Shopping for widgets is done with the eyes: some people want six small
 * cards across, some want two big ones. The slider scales the card, and the
 * preview inside scales with it because the card's box is what the preview
 * is fitted to.
 */
const SIZE_KEY = 'widget_store_scale';

/**
 * Which widgets arrived RECENTLY, newest first.
 *
 * A hand-kept list rather than a timestamp on every entry: the registry has
 * no dates, and what the office means by "new" is "the last couple of
 * rounds", which is exactly what this is. Trim from the bottom as things stop
 * being news.
 */
const RECENT: string[] = [
  'open-snags', 'no-date', 'gone-quiet', 'nobody-booked', 'backlog-trend',
  'no-plan', 'floor-by-floor', 'duplicates', 'skipped-stage',
  'map', 'weather', 'tap-in', 'shabbat', 'world-clocks',
  'btu-hp', 'streak', 'spin', 'bubble-wrap', 'celebrate', 'tiktok',
];

/**
 * Finer shelves INSIDE the big categories, so 'Live' is not forty cards in
 * one undifferentiated wall. A widget without an entry falls to the
 * category's own tail — the map is a guide, not a cage.
 */
const SUBGROUP: Record<string, string> = {
  kpi: 'Counts and numbers', 'count-by-stage': 'Counts and numbers',
  'progress-ring': 'Counts and numbers', 'bin-counter': 'Counts and numbers',
  'stage-legend': 'Counts and numbers', 'stage-funnel': 'Counts and numbers',
  'overdue-list': 'Lists that chase', 'due-today': 'Lists that chase',
  'job-list': 'Lists that chase', 'recent-jobs': 'Lists that chase',
  'no-date': 'What is NOT happening', 'gone-quiet': 'What is NOT happening',
  'nobody-booked': 'What is NOT happening', 'backlog-trend': 'What is NOT happening',
  'open-snags': 'What is NOT happening', 'no-plan': 'What is NOT happening',
  'floor-by-floor': 'What is NOT happening', duplicates: 'What is NOT happening',
  'skipped-stage': 'What is NOT happening',
  'contractor-load': 'People', 'team-today': 'People', 'tap-in': 'People',
  'contractor-links': 'People',
  'recent-photos': 'Photos', 'photo-review': 'Photos',
  'activity-feed': 'The pulse', 'job-search': 'The pulse', 'job-find': 'The pulse',
  'project-mini': 'Other workspaces', 'board-mini': 'Other workspaces',
  'project-glance': 'Other workspaces', 'calendar-mini': 'Other workspaces',
  map: 'Site and weather', weather: 'Site and weather',
};

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
/**
 * A workspace to show off "Another workspace" with.
 *
 * Not the one you are already looking at, since the whole point of the widget
 * is the other ones — but only one this machine can actually draw. A workspace
 * reads from what this browser last stored for it, so on a machine that has
 * never opened Netiv the card would preview as "Nothing stored for Netiv on
 * this machine", which is honest on the board and no use at all on a shelf.
 * The current workspace is the last resort: always live, always drawable.
 */
function otherIdForPreview(projects: Project[], currentId: string): string {
  const drawable = (id: string) => {
    try {
      const raw = localStorage.getItem(`${id}_app_data`);
      return !!raw && (JSON.parse(raw).apartments ?? []).length > 0;
    } catch { return false; }
  };
  const others = projects.filter(p => p.id !== currentId);
  return others.find(p => drawable(p.id))?.id ?? currentId;
}

export function WidgetStore({ onPick, onClose, only, destLabel = 'the board' }: {
  onPick: (def: WidgetDef) => void;
  /** Where a taken widget lands — 'the board' or 'the dashboard'. The button
      says so, because "Add to the board" pressed on the dashboard reads as
      the wrong destination. */
  destLabel?: string;
  onClose: () => void;
  /**
   * Narrow the shelf to a set of ids.
   *
   * The wall screen uses this: a calculator or a note pad makes no sense on a
   * display nobody touches, and offering them there is offering something that
   * cannot work.
   */
  only?: Set<string>;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<WidgetCategory | 'all' | 'recent'>('all');
  const [scale, setScale] = useState(() => {
    const v = Number(localStorage.getItem(SIZE_KEY));
    return v >= 0.7 && v <= 1.5 ? v : 1;
  });
  const pickScale = (v: number) => { setScale(v); localStorage.setItem(SIZE_KEY, String(v)); };
  const [sort, setSort] = useState<'useful' | 'az' | 'new'>('useful');
  /** What you have taken this visit, so the shelf can say so. */
  const [taken, setTaken] = useState<Record<string, number>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const {
    apartments, stages, contractorAssignments, contractors, contractorPhotos, activityLogs, users,
    projects, currentProjectId, canvasElements,
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
    boardElements: canvasElements,
    update: () => {}, openJob: () => {}, readOnly: true,
  }), [apartments, stages, contractorAssignments, contractors, contractorPhotos, activityLogs,
       users, canvasElements]);

  const shownCtx = useMemo(() => withSampleData(previewCtx), [previewCtx]);

  /**
   * The two widgets that draw nothing until they are told what to show.
   *
   * "Someone's board" and "Another workspace" both open with a picker, which
   * is right on the board and useless on the shelf: a card showing an empty
   * dropdown tells you nothing about what the widget is. Only the shelf knows
   * which workspaces exist, so only the shelf can answer this — the widgets
   * themselves stay unopinionated.
   */
  const pickedForPreview = useMemo(() => {
    const other = otherIdForPreview(projects, currentProjectId);
    return {
      'board-mini': { projectId: currentProjectId, boardId: MAIN_BOARD },
      'project-glance': { projectId: other },
      // The building diagram needs a workspace that HAS buildings — showing it
      // against the job board draws an empty frame.
      'project-mini': { projectId: other },
    } as Record<string, Record<string, unknown>>;
  }, [projects, currentProjectId]);

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
    return WIDGETS
      .filter(w => !only || only.has(w.id))
      .filter(w => !needle
        || w.name.toLowerCase().includes(needle)
        || w.blurb.toLowerCase().includes(needle));
  }, [q, only]);

  /** A row per group, each in the chosen order, split into finer shelves. */
  const order = useMemo(() => {
    const recentRank = new Map(RECENT.map((id, i) => [id, i]));
    return (a: WidgetDef, b: WidgetDef) => {
      if (sort === 'az') return a.name.localeCompare(b.name);
      if (sort === 'new') {
        const ra = recentRank.get(a.id) ?? 999, rb = recentRank.get(b.id) ?? 999;
        return ra - rb || a.name.localeCompare(b.name);
      }
      return (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name);
    };
  }, [sort]);

  const groups = useMemo(() => {
    const pool = cat === 'recent' ? matches.filter(w => RECENT.includes(w.id)) : matches;
    return (['live', 'plan', 'ref', 'visual'] as WidgetCategory[])
      .map(c => {
        const items = pool.filter(w => w.category === c).sort(order);
        // The finer shelves: clusters in first-appearance order, unmapped last.
        const shelves: { name: string; items: WidgetDef[] }[] = [];
        for (const w of items) {
          const name = SUBGROUP[w.id] ?? '';
          let shelf = shelves.find(x => x.name === name);
          if (!shelf) { shelf = { name, items: [] }; shelves.push(shelf); }
          shelf.items.push(w);
        }
        shelves.sort((a, b) => (a.name === '' ? 1 : 0) - (b.name === '' ? 1 : 0));
        return { c, items, shelves };
      })
      .filter(g => g.items.length > 0 && (cat === 'all' || cat === 'recent' || cat === g.c));
  }, [matches, cat, order]);

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
              placeholder="Search widgets"
              className="flex-1 min-w-0 bg-transparent outline-none text-white text-[16px] placeholder:text-white/45"
            />
            {q && (
              <button onClick={() => setQ('')} className="text-white/60 hover:text-white"><X size={16} /></button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {(['all', 'recent', 'live', 'plan', 'ref', 'visual'] as const).map(c => {
              const on = cat === c;
              const n = c === 'all' ? matches.length
                : c === 'recent' ? matches.filter(w => RECENT.includes(w.id)).length
                : matches.filter(w => w.category === c).length;
              return (
                <button key={c} onClick={() => setCat(c)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold transition-colors"
                  style={on
                    ? { backgroundColor: '#fff', color: '#1e3a5f' }
                    : { backgroundColor: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.82)' }}>
                  {c === 'all' ? 'Everything' : c === 'recent' ? 'Recently added' : CATEGORY_LABEL[c]}
                  <span className="text-[11px] font-extrabold opacity-60">{n}</span>
                </button>
              );
            })}
            <span className="flex-1" />
            <select value={sort} onChange={e => setSort(e.target.value as typeof sort)}
              title="Sort the shelf"
              className="text-[12px] font-bold rounded-lg px-2 py-1.5 outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,.12)', color: '#fff' }}>
              <option value="useful" style={{ color: '#111' }}>Most useful first</option>
              <option value="az" style={{ color: '#111' }}>A to Z</option>
              <option value="new" style={{ color: '#111' }}>Newest first</option>
            </select>
            {/* The shelf's zoom: smaller for six-across shopping, bigger for a
                good look. It scales the card, and the preview follows. */}
            <label className="flex items-center gap-1.5" title="Preview size">
              <span className="text-[10px] font-bold text-white/60">A</span>
              <input type="range" min={0.7} max={1.5} step={0.1} value={scale}
                onChange={e => pickScale(Number(e.target.value))}
                className="w-24 accent-white" />
              <span className="text-[14px] font-bold text-white/60">A</span>
            </label>
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

          {groups.map(({ c, shelves }) => (
            <div key={c} className="mb-7">
              {/* Only when everything is shown. Filtered to one group, the
                  heading repeats the chip that is already lit above it. */}
              {(cat === 'all' || cat === 'recent') && (
                <h3 className="text-[13px] font-extrabold text-gray-500 uppercase tracking-wide mb-3">
                  {CATEGORY_LABEL[c]}
                </h3>
              )}
              {shelves.map(shelf => (
                <div key={shelf.name || 'rest'} className="mb-4">
                  {shelf.name && shelves.length > 1 && (
                    <h4 className="text-[11px] font-bold text-gray-400 tracking-wide mb-2">
                      {shelf.name}
                    </h4>
                  )}
                  <div className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(CARD_W * scale)}px, 1fr))` }}>
                    {shelf.items.map(w => (
                      <WidgetCard key={w.id} def={w} ctx={shownCtx} onPick={take} scale={scale}
                        destLabel={destLabel}
                        taken={taken[w.id] ?? 0} picked={pickedForPreview[w.id]} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {cat === 'all' && !q.trim() && otherWorkspaces.length > 0 && (
            <div className="mb-4">
              <h3 className="text-[13px] font-extrabold text-gray-500 uppercase tracking-wide mb-3">
                From your other workspaces
              </h3>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_W}px, 1fr))` }}>
                {otherWorkspaces.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const def = WIDGETS.find(w => w.id === 'project-glance');
                      if (def) take({ ...def, data: { ...(def.data ?? {}), projectId: p.id } });
                    }}
                    className="group text-left rounded-xl border border-gray-200 overflow-hidden
                               hover:border-[#4aa8d8] hover:shadow-md transition-all flex flex-col"
                  >
                    <div className="relative flex-1 flex flex-col items-center justify-center gap-2"
                      style={{ height: CARD_H, backgroundColor: `${p.color}0e` }}>
                      <span className="w-14 h-14 rounded-2xl flex items-center justify-center text-[22px] font-extrabold text-white"
                        style={{ backgroundColor: p.color }}>
                        {(p.shortName ?? p.name).slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-bold text-[15px] text-gray-900">{p.name}</span>
                      <div className="absolute inset-x-0 bottom-0 p-3 pt-8 opacity-0 group-hover:opacity-100
                                      transition-opacity pointer-events-none"
                        style={{ background: 'linear-gradient(transparent, rgba(15,23,42,.86) 42%)' }}>
                        <p className="text-[12px] leading-snug text-white/90">
                          That workspace's stages, counts and progress, live on this board.
                        </p>
                        <span className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white"
                          style={{ backgroundColor: '#4aa8d8' }}>
                          <Plus size={11} /> Add to {destLabel}
                        </span>
                      </div>
                    </div>
                    <div className="px-3 py-2 flex items-center gap-2 border-t border-gray-100">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="font-bold text-[13px] text-gray-900 truncate">How {p.shortName ?? p.name} is doing</span>
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
function WidgetCard({ def, ctx, onPick, taken, picked, scale = 1, destLabel = 'the board' }: {
  def: WidgetDef; ctx: WidgetCtx; onPick: (d: WidgetDef) => void; taken: number;
  /** A choice the shelf makes on the widget's behalf, for preview only. */
  picked?: Record<string, unknown>;
  /** The shelf's zoom — the card grows and the preview grows with it. */
  scale?: number;
  destLabel?: string;
}) {
  const Icon = def.icon;
  const isArt = def.id.startsWith('art-');
  const CARD_W = 340 * scale, CARD_H = 240 * scale;

  const contain = Math.min((CARD_W - 16) / def.w, (CARD_H - 16) / def.h);
  // 2.4 rather than 1.5. The cap exists so a 30px pin does not become a poster,
  // but at 1.5 the small widgets — a clock, a counter, a single figure — were
  // still islands in a big empty card.
  const k = isArt ? Math.min(contain, 2.4) : Math.min((CARD_W - 12) / def.w, 2.4);
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
      ...(picked ?? {}),
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
          <span className="absolute left-2 top-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: '#16a34a' }}>
            <Check size={10} /> {taken > 1 ? `${taken} added` : 'added'}
          </span>
        )}

        {/* What it is, only for the one you are looking at.
            Seventy-three descriptions on screen at once is not seventy-three
            times as much help as one — it is a wall of grey text you read past
            to get to the pictures. The words are still here, they just wait to
            be asked. */}
        <div
          className="absolute inset-x-0 bottom-0 p-3 pt-8 opacity-0 group-hover:opacity-100
                     transition-opacity pointer-events-none"
          style={{ background: 'linear-gradient(transparent, rgba(15,23,42,.86) 42%)' }}
        >
          <p className="text-[12px] leading-snug text-white/90" style={{ textWrap: 'pretty' }}>
            {def.blurb}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white"
            style={{ backgroundColor: '#4aa8d8' }}>
            <Plus size={11} /> Add to {destLabel}
          </span>
        </div>
      </div>

      <div className="px-3 py-2 flex items-center gap-2 border-t border-gray-100">
        <Icon size={14} className="text-[#1e3a5f] flex-shrink-0" />
        <span className="font-bold text-[13px] text-gray-900 truncate">{def.name}</span>
      </div>
    </div>
  );
}
