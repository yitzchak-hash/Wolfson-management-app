/**
 * The week ribbon (owner, 2026-10-18 — "This Week First", approved with his
 * changes: no folded last-week bar, no "Open last week", the notebook starts
 * right under the ribbon, and a drag held over a chip turns the notebook to
 * that week so the job can be dropped on a day there).
 *
 * A chip for every week near now — two back, this week, three ahead — each
 * with how many tasks it holds and how many are done, plus "Older…" for the
 * rest and "Today" once you are looking somewhere else. Pressing a chip only
 * changes what THIS screen shows; nothing is written to the notebook.
 *
 * Which week a copy shows is remembered per copy, per computer, for the rest
 * of the week it was picked in: on Sunday every screen is on the new week by
 * itself — the TV left on overnight included (`useThisWeek` re-reads the
 * clock every minute and whenever the tab comes back).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

const isoOf = (d: Date) => {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return t.toISOString().slice(0, 10);
};
const plusDays = (d: Date, n: number) => { const o = new Date(d.getTime()); o.setDate(o.getDate() + n); return o; };
const startOfWeek = (d: Date, startDay: number) => {
  const o = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  o.setDate(o.getDate() - ((o.getDay() - startDay + 7) % 7));
  return o;
};
export const shiftWeek = (wk: string, n: number) => isoOf(plusDays(new Date(`${wk}T00:00:00`), n * 7));

/** The current week's first day, kept current: the page turns by itself on Sunday. */
export function useThisWeek(startDay: number): string {
  const read = () => isoOf(startOfWeek(new Date(), startDay));
  const [wk, setWk] = useState(read);
  useEffect(() => {
    const tick = () => setWk(prev => { const now = read(); return now === prev ? prev : now; });
    tick();
    const id = window.setInterval(tick, 60_000);
    const vis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDay]);
  return wk;
}

/**
 * A pick is kept only for the week it was made in — so a Sunday morning
 * always opens on the new week, and somebody who looked back at last week on
 * Wednesday is not still stuck there next Sunday.
 */
export function readWeekPick(key: string, thisWeek: string): string | null {
  try {
    const raw = localStorage.getItem(`nb_week_${key}`);
    if (!raw) return null;
    const v = JSON.parse(raw) as { week?: string; at?: string };
    return v.at === thisWeek && typeof v.week === 'string' ? v.week : null;
  } catch { return null; }
}
export function saveWeekPick(key: string, thisWeek: string, week: string | null): void {
  try {
    if (!week || week === thisWeek) localStorage.removeItem(`nb_week_${key}`);
    else localStorage.setItem(`nb_week_${key}`, JSON.stringify({ week, at: thisWeek }));
  } catch { /* private window — the pick lasts this visit only */ }
}

export interface WeekStat { tasks: number; done: number }

const WORDS = {
  en: { last: 'Last week', this: 'This week', next: 'Next week', older: 'Older…', today: 'Today',
        empty: 'nothing', olderTitle: 'Go to an earlier week', hold: 'Hold here to go to this week' },
  he: { last: 'שבוע שעבר', this: 'השבוע', next: 'שבוע הבא', older: 'קודמים…', today: 'היום',
        empty: 'ריק', olderTitle: 'מעבר לשבוע קודם', hold: 'החזיקו כאן כדי לעבור לשבוע הזה' },
  ru: { last: 'Прошлая неделя', this: 'Эта неделя', next: 'Следующая', older: 'Раньше…', today: 'Сегодня',
        empty: 'пусто', olderTitle: 'Перейти к прошлой неделе', hold: 'Задержите здесь, чтобы перейти' },
};

export function WeekRibbon({
  thisWeek, focus, onPick, stats, lang, locale, fontSize, chipRefs, dwellKey, earliest,
}: {
  thisWeek: string;
  focus: string;
  onPick: (week: string) => void;
  stats: Map<string, WeekStat>;
  lang: string;
  locale: string;
  fontSize: number;
  /** Every chip registers itself here so a drag can find it by coordinates. */
  chipRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  /** The chip a drag is holding over right now — it fills up while it waits. */
  dwellKey: string | null;
  /** The oldest week the Older… list goes back to. */
  earliest: string;
}) {
  const w = WORDS[lang as keyof typeof WORDS] ?? WORDS.en;
  const [olderOpen, setOlderOpen] = useState(false);
  const olderRef = useRef<HTMLButtonElement>(null);
  const near = [-2, -1, 0, 1, 2, 3].map(n => shiftWeek(thisWeek, n));
  // A week reached through Older… gets its own chip at the front, lit.
  const chips = near.includes(focus) ? near : [focus, ...near];
  const dateOf = (wk: string) => new Date(`${wk}T00:00:00`)
    .toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const nameOf = (wk: string) =>
    wk === thisWeek ? w.this : wk === shiftWeek(thisWeek, -1) ? w.last : wk === shiftWeek(thisWeek, 1) ? w.next : dateOf(wk);
  const small = Math.max(8, fontSize - 2);

  const older: string[] = [];
  for (let wk = shiftWeek(thisWeek, -3); wk >= earliest && older.length < 52; wk = shiftWeek(wk, -1)) older.push(wk);

  return (
    <div data-week-ribbon className="flex items-stretch px-2 pb-1.5 flex-shrink-0 overflow-x-auto widget-scroll no-bar"
      style={{ gap: Math.max(4, Math.round(fontSize * 0.35)) }} data-no-drag>
      {chips.map(wk => {
        const st = stats.get(wk);
        const on = wk === focus;
        const now = wk === thisWeek;
        const share = st && st.tasks ? st.done / st.tasks : 0;
        const holding = dwellKey === wk;
        return (
          <button
            key={wk}
            ref={node => { if (node) chipRefs.current.set(wk, node); else chipRefs.current.delete(wk); }}
            data-no-drag data-el-action data-week-chip={wk} data-on={on ? '' : undefined}
            data-this-week={now ? '' : undefined} data-holding={holding ? '' : undefined}
            onClick={() => onPick(wk)}
            title={`${dateOf(wk)} · ${w.hold}`}
            // One equal share of the row each — the chips are the notebook's
            // top row, the way a week view's day headers are, and they grow
            // and shrink with the widget (owner, 2026-10-19). A narrow widget
            // keeps a readable floor and scrolls instead.
            className="relative flex-1 basis-0 flex flex-col items-start rounded-lg border text-start overflow-hidden transition-colors"
            style={{
              minWidth: Math.max(56, fontSize * 5),
              paddingInline: Math.round(fontSize * 0.7),
              paddingTop: Math.round(fontSize * 0.3),
              paddingBottom: Math.round(fontSize * 0.45),
              borderColor: on ? '#1e3a5f' : holding ? '#4aa8d8' : '#e2e8f0',
              backgroundColor: on ? '#1e3a5f' : holding ? '#e0f2fe' : '#fff',
              color: on ? '#fff' : '#334155',
              boxShadow: now && !on ? 'inset 0 0 0 1px #4aa8d8' : undefined,
            }}
          >
            {holding && (
              // Fills across while the drag waits — the half-second before the page turns.
              <span aria-hidden className="week-hold-fill absolute inset-y-0 start-0 pointer-events-none"
                style={{ backgroundColor: 'rgba(74,168,216,.28)' }} />
            )}
            <span className="relative font-extrabold whitespace-nowrap leading-tight" style={{ fontSize }}>
              {nameOf(wk)}
            </span>
            <span data-week-chip-count className="relative tabular-nums whitespace-nowrap leading-tight"
              style={{ fontSize: small, color: on ? '#cbd5e1' : '#64748b' }}>
              {st && st.tasks ? `${st.tasks} · ${st.done}✓` : w.empty}
            </span>
            <span aria-hidden className="relative w-full rounded-full overflow-hidden"
              style={{ marginTop: Math.round(fontSize * 0.3), height: Math.max(3, Math.round(fontSize * 0.25)), backgroundColor: on ? 'rgba(255,255,255,.22)' : '#eef2f7' }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, backgroundColor: '#16a34a' }} />
            </span>
          </button>
        );
      })}
      {older.length > 0 && (
        <button ref={olderRef} data-no-drag data-el-action data-week-older
          onClick={() => setOlderOpen(o => !o)} title={w.olderTitle}
          className="flex-shrink-0 inline-flex items-center gap-0.5 rounded-lg border border-dashed border-gray-300 px-2 font-bold text-gray-500 hover:text-[#1e3a5f]"
          style={{ fontSize: small }}>
          {w.older}<ChevronDown size={Math.max(10, small)} />
        </button>
      )}
      {focus !== thisWeek && (
        <button data-no-drag data-el-action data-week-today onClick={() => onPick(thisWeek)}
          className="flex-shrink-0 rounded-lg border border-[#4aa8d8] px-2 font-extrabold text-[#1e3a5f] bg-sky-50 hover:bg-sky-100"
          style={{ fontSize: small }}>
          {w.today}
        </button>
      )}
      {olderOpen && (
        <OlderList anchor={olderRef.current} weeks={older} stats={stats} locale={locale}
          onPick={wk => { setOlderOpen(false); onPick(wk); }} onClose={() => setOlderOpen(false)} />
      )}
    </div>
  );
}

/** The earlier weeks, grouped by month — portalled, sealed, Escape backs out. */
function OlderList({ anchor, weeks, stats, locale, onPick, onClose }: {
  anchor: HTMLElement | null;
  weeks: string[];
  stats: Map<string, WeekStat>;
  locale: string;
  onPick: (wk: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  const r = anchor?.getBoundingClientRect();
  const left = Math.max(8, Math.min((r?.left ?? 8), window.innerWidth - 248));
  const top = Math.min((r?.bottom ?? 40) + 4, window.innerHeight - 120);
  const seal = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onWheel: (e: React.WheelEvent) => e.stopPropagation(),
  };
  let lastMonth = '';
  return createPortal(
    <div {...seal}>
      <div className="fixed inset-0 z-[150]" onClick={onClose} />
      <div data-week-older-list className="fixed z-[151] w-[240px] rounded-xl border border-gray-200 bg-white shadow-xl py-1 overflow-y-auto"
        style={{ left, top, maxHeight: `calc(100vh - ${top + 8}px)` }}>
        {weeks.map(wk => {
          const d = new Date(`${wk}T00:00:00`);
          const month = d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
          const head = month !== lastMonth ? month : null;
          lastMonth = month;
          const st = stats.get(wk);
          return (
            <div key={wk}>
              {head && <div className="px-3 pt-2 pb-0.5 text-[10.5px] font-black tracking-wide text-slate-400 uppercase">{head}</div>}
              <button data-week-older-pick={wk} onClick={() => onPick(wk)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-start text-[12.5px] hover:bg-slate-50">
                <span className="font-bold text-slate-700">{d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}</span>
                <span className="flex-1" />
                <span className="tabular-nums text-slate-400">{st && st.tasks ? `${st.tasks} · ${st.done}✓` : '—'}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
