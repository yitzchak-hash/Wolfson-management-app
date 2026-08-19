import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Plus, Check } from 'lucide-react';
import { useStore } from '../../data/store';
import {
  WIDGETS, WidgetDef, WidgetCtx, fullSampleCtx,
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
  'notes-board',
  'open-snags', 'no-date', 'gone-quiet', 'nobody-booked', 'backlog-trend',
  'no-plan', 'floor-by-floor', 'duplicates', 'skipped-stage',
  'map', 'weather', 'tap-in', 'shabbat', 'world-clocks',
  'btu-hp', 'streak', 'spin', 'bubble-wrap', 'celebrate', 'tiktok',
];

/**
 * The shelves, rebuilt from what a widget is FOR rather than from how it is
 * implemented.
 *
 * The old top row — Live / Planning / Reference / Looks — was the code's own
 * taxonomy ("does it read the store?"), which the owner rightly called not
 * helpful and not smart: a person shopping for "something that shows me
 * today's work" does not care whether it is live. One level, one question per
 * shelf, every widget assigned by hand. A widget without an entry falls to a
 * MORE shelf at the bottom (clip art is caught by its `art-` prefix), so a
 * new widget is visible even before it is filed.
 */
const SHELF_ORDER = [
  'Chasing the work',
  'Catching problems',
  'Counts and progress',
  'Finding and following',
  'People and the week',
  'Photos, map and weather',
  'Clocks and timers',
  'Your own lists and tools',
  'Other workspaces',
  'Decoration and fun',
] as const;

const SHELF: Record<string, string> = {
  // What needs doing, and when.
  'overdue-list': 'Chasing the work', 'due-today': 'Chasing the work',
  'no-date': 'Chasing the work', 'week-ahead': 'Chasing the work',
  'calendar-mini': 'Chasing the work', milestones: 'Chasing the work',
  timeline: 'Chasing the work', 'weekly-goal': 'Chasing the work',
  'backlog-trend': 'Chasing the work', 'tv-late': 'Chasing the work',
  'tv-tomorrow': 'Chasing the work', 'tv-month': 'Chasing the work',
  'tv-waiting': 'Chasing the work',
  // What is quietly going wrong.
  'gone-quiet': 'Catching problems', 'nobody-booked': 'Catching problems',
  'no-plan': 'Catching problems', duplicates: 'Catching problems',
  'skipped-stage': 'Catching problems', 'open-snags': 'Catching problems',
  'floor-by-floor': 'Catching problems', 'tv-drive': 'Catching problems',
  // Figures and bars.
  kpi: 'Counts and progress', 'count-by-stage': 'Counts and progress',
  'stage-legend': 'Counts and progress', 'stage-funnel': 'Counts and progress',
  'progress-ring': 'Counts and progress', 'progress-bar': 'Counts and progress',
  'bin-counter': 'Counts and progress', 'streak-flame': 'Counts and progress',
  'split-flap': 'Counts and progress', 'tv-stage-spread': 'Counts and progress',
  'tv-week-done': 'Counts and progress', 'tv-done-today': 'Counts and progress',
  // Getting to a job, and seeing what changed.
  'job-find': 'Finding and following', 'job-search': 'Finding and following',
  'job-list': 'Finding and following', 'recent-jobs': 'Finding and following',
  'activity-feed': 'Finding and following', 'tv-new': 'Finding and following',
  'tv-feed': 'Finding and following',
  // Who is where, and the week's plan.
  rota: 'People and the week', 'week-planner': 'People and the week',
  'team-today': 'People and the week', 'tap-in': 'People and the week',
  'contractor-load': 'People and the week', 'contractor-links': 'People and the week',
  'crew-race': 'People and the week', 'tv-load': 'People and the week',
  'tv-out-today': 'People and the week',
  // What the site looks like.
  'recent-photos': 'Photos, map and weather', 'photo-review': 'Photos, map and weather',
  'before-after': 'Photos, map and weather', 'tv-photo': 'Photos, map and weather',
  'tv-photo-wall': 'Photos, map and weather', 'job-map': 'Photos, map and weather',
  weather: 'Photos, map and weather',
  // Time.
  clock: 'Clocks and timers', 'tv-clock': 'Clocks and timers',
  'world-clocks': 'Clocks and timers', 'shabbat-clock': 'Clocks and timers',
  'w-countdown': 'Clocks and timers', 'w-stopwatch': 'Clocks and timers',
  'multi-timer': 'Clocks and timers',
  // Things you write yourself.
  checklist: 'Your own lists and tools', tally: 'Your own lists and tools',
  table: 'Your own lists and tools', 'order-list': 'Your own lists and tools',
  'lined-note': 'Your own lists and tools', handover: 'Your own lists and tools',
  contact: 'Your own lists and tools', link: 'Your own lists and tools',
  address: 'Your own lists and tools', calculator: 'Your own lists and tools',
  converter: 'Your own lists and tools', 'btu-hp': 'Your own lists and tools',
  'add-bin': 'Your own lists and tools', 'sticky-pad': 'Your own lists and tools',
  'notes-board': 'Your own lists and tools',
  // Looking across workspaces.
  'project-mini': 'Other workspaces', 'project-glance': 'Other workspaces',
  'board-mini': 'Other workspaces', 'tv-workspace': 'Other workspaces',
  // The rest is for the eyes.
  'w-title': 'Decoration and fun', banner: 'Decoration and fun',
  divider: 'Decoration and fun', quote: 'Decoration and fun',
  legend: 'Decoration and fun', photo: 'Decoration and fun',
  'spin-wheel': 'Decoration and fun', 'bubble-wrap': 'Decoration and fun',
  celebrate: 'Decoration and fun', tiktok: 'Decoration and fun',
};

/** Which shelf a widget sits on — clip art by prefix, unmapped to More. */
const shelfOf = (id: string): string =>
  SHELF[id] ?? (id.startsWith('art-') ? 'Decoration and fun' : 'More');

/** The layout toggle, remembered per machine. */
const LAYOUT_KEY = 'widget_store_layout';
const SHELF_KEY = 'widget_store_shelf';

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
  /**
   * The tiny switch the owner asked for by name: split into categories, or
   * one flat list of everything. Remembered per machine.
   */
  const [layout, setLayout] = useState<'cats' | 'flat'>(() =>
    localStorage.getItem(LAYOUT_KEY) === 'flat' ? 'flat' : 'cats');
  const pickLayout = (v: 'cats' | 'flat') => { setLayout(v); localStorage.setItem(LAYOUT_KEY, v); };
  /** '' = every shelf at once; otherwise the one shelf being browsed. */
  const [shelf, setShelf] = useState<string>(() => localStorage.getItem(SHELF_KEY) ?? '');
  const pickShelf = (v: string) => { setShelf(v); localStorage.setItem(SHELF_KEY, v); };
  const [scale, setScale] = useState(() => {
    const v = Number(localStorage.getItem(SIZE_KEY));
    return v >= 0.7 && v <= 1.5 ? v : 1;
  });
  const pickScale = (v: number) => { setScale(v); localStorage.setItem(SIZE_KEY, String(v)); };
  const [sort, setSort] = useState<'useful' | 'az' | 'new'>('useful');
  /** What you have taken this visit, so the shelf can say so. */
  const [taken, setTaken] = useState<Record<string, number>>({});
  const searchRef = useRef<HTMLInputElement>(null);

  const { projects, currentProjectId } = useStore();

  /**
   * Previews run on the FULL FAKE board, never on this machine's own data.
   *
   * They used to prefer the real data field by field, on the theory that your
   * own overdue list beats an artist's impression — and the owner overruled it
   * from experience: a sparse real workspace made half the shelf preview its
   * empty or all-clear state ("Due today · 0", a bare search box), and "no one
   * can understand how they will actually look when data is full." The store
   * shows the busy fake board; the moment a widget is PLACED it reads the
   * real thing.
   */
  const shownCtx = useMemo(() => fullSampleCtx(), []);

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
    // `sample: true` is the full-fake fallback: with nothing stored on this
    // machine for the picked workspace, each of these draws a busy canned
    // preview (marked "sample") instead of an apology about the cache.
    return {
      'board-mini': { projectId: currentProjectId, boardId: MAIN_BOARD, sample: true },
      'project-glance': { projectId: other, sample: true },
      // The building diagram needs a workspace that HAS buildings — showing it
      // against the job board draws an empty frame.
      'project-mini': { projectId: other, sample: true },
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

  /**
   * One list, or the smart shelves — the toggle decides.
   *
   * In categories mode every widget lands on exactly one shelf, in the
   * hand-set SHELF_ORDER; anything unmapped shows on a MORE shelf at the end
   * rather than disappearing. In flat mode the same pool is one grid in the
   * chosen sort.
   */
  const allGroups = useMemo(() => {
    if (layout === 'flat') {
      return matches.length ? [{ name: '', items: [...matches].sort(order) }] : [];
    }
    const by = new Map<string, WidgetDef[]>();
    for (const w of matches) {
      const name = shelfOf(w.id);
      if (!by.has(name)) by.set(name, []);
      by.get(name)!.push(w);
    }
    return [...SHELF_ORDER, 'More']
      .filter(name => by.has(name))
      .map(name => ({ name, items: by.get(name)!.sort(order) }));
  }, [matches, layout, order]);

  /**
   * The shelves as a MENU, not just as headings you scroll past.
   *
   * Ten shelves down one long page means nine of the names are somewhere
   * off-screen, so the only ones you ever see are whichever two the scroll
   * happens to be sitting on — and it starts at the top again every time the
   * store is opened. The row of names is always on screen, says how many are on
   * each shelf, and the one you picked is remembered on this machine.
   */
  const shelfPick = shelf && allGroups.some(g => g.name === shelf) ? shelf : '';
  const groups = shelfPick ? allGroups.filter(g => g.name === shelfPick) : allGroups;

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
            {/* The little switch: shelves by what a widget is FOR, or one flat
                list of everything. The old Live/Planning/Reference/Looks chips
                were the code's own taxonomy and are gone. */}
            <div className="flex items-center rounded-full p-0.5"
              style={{ backgroundColor: 'rgba(255,255,255,.12)' }}>
              {([['cats', 'Categories'], ['flat', 'One list']] as const).map(([v, label]) => (
                <button key={v} onClick={() => pickLayout(v)}
                  className="px-3 py-1 rounded-full text-[12px] font-bold transition-colors"
                  style={layout === v
                    ? { backgroundColor: '#fff', color: '#1e3a5f' }
                    : { color: 'rgba(255,255,255,.75)' }}>
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[11.5px] font-semibold text-white/50">
              {shelfPick ? `${groups[0]?.items.length ?? 0} of ${matches.length}` : `${matches.length} widgets`}
            </span>
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

          {/* The shelves, always in view. Scrolls sideways when it must, with
              the fade that marks a scroller everywhere else in the app. */}
          {layout === 'cats' && !q.trim() && (
            <div className="mt-2.5 -mx-1 px-1 flex items-center gap-1.5 overflow-x-auto edge-fade
                            [&>*]:flex-shrink-0 pb-0.5">
              <button
                onClick={() => pickShelf('')}
                className="px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors"
                style={!shelfPick
                  ? { backgroundColor: '#fff', color: '#1e3a5f' }
                  : { backgroundColor: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.8)' }}>
                Everything
              </button>
              {allGroups.map(g => (
                <button key={g.name}
                  onClick={() => pickShelf(shelfPick === g.name ? '' : g.name)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors"
                  style={shelfPick === g.name
                    ? { backgroundColor: '#fff', color: '#1e3a5f' }
                    : { backgroundColor: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.8)' }}>
                  {g.name}
                  <span className="ml-1.5 font-semibold opacity-55">{g.items.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {groups.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <p className="text-[15px] text-gray-500">Nothing matches “{q.trim()}”.</p>
              <button onClick={() => setQ('')}
                className="mt-2 text-[13px] font-semibold text-[#4aa8d8]">Show everything</button>
            </div>
          )}

          {groups.map(({ name, items }) => (
            <div key={name || 'all'} className="mb-6">
              {name && (
                <h3 className="text-[13px] font-extrabold text-gray-500 uppercase tracking-wide mb-3">
                  {name} <span className="text-gray-300 normal-case font-bold">· {items.length}</span>
                </h3>
              )}
              <div className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(CARD_W * scale)}px, 1fr))` }}>
                {items.map(w => (
                  <WidgetCard key={w.id} def={w} ctx={shownCtx} onPick={take} scale={scale}
                    destLabel={destLabel}
                    taken={taken[w.id] ?? 0} picked={pickedForPreview[w.id]} />
                ))}
              </div>
            </div>
          ))}

          {layout === 'cats' && !q.trim() && otherWorkspaces.length > 0 && !only && (
            <div className="mb-4">
              <h3 className="text-[13px] font-extrabold text-gray-500 uppercase tracking-wide mb-3">
                From your other workspaces
              </h3>
              {/* Each card is the real "Another workspace" widget previewing
                  THAT workspace — live numbers when this machine has them, the
                  sample summary when it does not. It used to be a logo on a
                  tinted box, which showed nothing of what you would get. */}
              <div className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(CARD_W * scale)}px, 1fr))` }}>
                {otherWorkspaces.map(p => {
                  const def = WIDGETS.find(w => w.id === 'project-glance');
                  if (!def) return null;
                  const wired: WidgetDef = { ...def, data: { ...(def.data ?? {}), projectId: p.id } };
                  return (
                    <WidgetCard key={p.id} def={wired} ctx={shownCtx} onPick={take} scale={scale}
                      destLabel={destLabel} taken={0}
                      picked={{ projectId: p.id, sample: true }}
                      nameOverride={`How ${p.shortName ?? p.name} is doing`} />
                  );
                })}
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
function WidgetCard({ def, ctx, onPick, taken, picked, scale = 1, destLabel = 'the board', nameOverride }: {
  def: WidgetDef; ctx: WidgetCtx; onPick: (d: WidgetDef) => void; taken: number;
  /** A choice the shelf makes on the widget's behalf, for preview only. */
  picked?: Record<string, unknown>;
  /** The shelf's zoom — the card grows and the preview grows with it. */
  scale?: number;
  destLabel?: string;
  /** The workspace cards wear the workspace's name, not the widget's. */
  nameOverride?: string;
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
      // The card says which widget it is, so the shelf can be AUDITED — a
      // preview quietly drawing "nothing yet" is indistinguishable from a
      // broken one, and there was no way to ask which ones did.
      data-widget-id={def.id}
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
        <span className="font-bold text-[13px] text-gray-900 truncate">{nameOverride ?? def.name}</span>
      </div>
    </div>
  );
}
