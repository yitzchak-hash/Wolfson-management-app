import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Printer, Check, Circle, X } from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, eachDayOfInterval, format, isSameMonth, isSameDay, parseISO,
} from 'date-fns';
import type { Locale } from 'date-fns';
import { DriveIcon, ZohoIcon, PlanIcon } from '../ui/BrandIcons';
import { printSheet, printEsc } from '../../data/printing';
import type { MainUiStrings } from '../../types';

export interface CalendarEvent {
  id: string;
  date: string;        // yyyy-MM-dd (due date)
  title: string;       // task description
  subtitle?: string;   // building · apt, or project name
  color: string;       // chip accent color (hex)
  completed: boolean;
  onClick?: () => void;
  /**
   * OPTIONAL grouping (owner, 2026-10-08 — a worker's twenty small reports a
   * day made the office's calendars a wall of struck-through chips). DONE
   * events sharing a `groupKey` on one day fold into ONE chip —
   * "Igor · Wolfson · 19 done ✓" — once there are FOLD_MIN of them; open
   * events are never folded, they are what the office has to manage. The
   * host decides what a group is (the office pages use worker + workspace)
   * and names it with `groupLabel`. Absent = never folded.
   */
  groupKey?: string;
  groupLabel?: string;

  /**
   * Optional full-node rendering. When present the calendar draws the same card
   * the board draws — stage border, Drive/Zoho/plan buttons, last edited — so a
   * day reads exactly like the board rather than as a coloured strip.
   */
  node?: {
    stageName?: string;
    stageColor?: string;
    address?: string;
    driveLink?: string;
    zohoLink?: string;
    plansPdfLink?: string;
    lastEdited?: string;
    pendingTasks?: number;
  };
}


const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Six working columns and a slim grey Saturday. */
const WEEK_COLS = 'repeat(6, minmax(0, 1fr)) minmax(0, 0.5fr)';
/** Done events of one group fold into one chip once there are this many. */
export const FOLD_MIN = 3;

/**
 * The calendar's own words. Every one is optional with an English default,
 * like `todayLabel` — the office pages hand in MainUiStrings, the worker's
 * portal its own language. `{n}` is the count.
 */
export interface CalendarWords {
  /** The folded chip's tail: "{n} done". */
  foldDone?: string;
  /** The overflow button: "+{n} more" (default "+{n}"). */
  more?: string;
  done?: string;
  open?: string;
  close?: string;
  /** Tooltip on a folded chip. */
  foldHint?: string;
}

/** The office's words for the calendar, out of its own strings. */
export function calendarWordsOf(s: Pick<MainUiStrings,
  'calFoldDone' | 'calMore' | 'calDoneWord' | 'calOpenWord' | 'calClose' | 'calFoldHint'>): CalendarWords {
  return {
    foldDone: s.calFoldDone, more: s.calMore, done: s.calDoneWord,
    open: s.calOpenWord, close: s.calClose, foldHint: s.calFoldHint,
  };
}

/**
 * How many things an OFFICE calendar day draws before "+N more" — enough for
 * an ordinary day, and a day of twenty small jobs stops being a wall.
 */
export const OFFICE_DAY_CAP = 5;

/** One thing drawn in a day: an event, or a FOLD of done events of one group. */
export type DayItem =
  | { kind: 'ev'; ev: CalendarEvent }
  | { kind: 'fold'; key: string; label: string; color: string; events: CalendarEvent[] };

/**
 * A day's events in the order the office reads them: what is still OPEN
 * first, one chip each — then what is done, where done events sharing a
 * group fold into one chip once there are FOLD_MIN of them. Pure, so a probe
 * (and the printed month) can ask exactly what a day will draw.
 */
export function dayItems(list: CalendarEvent[]): DayItem[] {
  const open = list.filter(e => !e.completed);
  const done = list.filter(e => e.completed);
  const byGroup = new Map<string, CalendarEvent[]>();
  for (const e of done) {
    if (!e.groupKey) continue;
    const arr = byGroup.get(e.groupKey);
    if (arr) arr.push(e); else byGroup.set(e.groupKey, [e]);
  }
  const out: DayItem[] = open.map(ev => ({ kind: 'ev' as const, ev }));
  const folded = new Set<string>();
  for (const e of done) {
    const g = e.groupKey ? byGroup.get(e.groupKey) : undefined;
    if (g && g.length >= FOLD_MIN) {
      if (folded.has(e.groupKey!)) continue;
      folded.add(e.groupKey!);
      out.push({ kind: 'fold', key: e.groupKey!, label: e.groupLabel ?? '', color: e.color, events: g });
    } else {
      out.push({ kind: 'ev', ev: e });
    }
  }
  return out;
}

const countOf = (it: DayItem) => (it.kind === 'fold' ? it.events.length : 1);
const fillN = (t: string, n: number) => t.replace('{n}', String(n));

export function TaskCalendar({
  events,
  weekdayLabels = WEEKDAYS,
  todayLabel = 'Today',
  printTitle = 'Calendar',
  rtl = false,
  fill = false,
  locale,
  words,
  maxPerDay,
  onMore,
}: {
  events: CalendarEvent[];
  /** date-fns locale for the month title — the worker's phone reads its own language. */
  locale?: Locale;
  weekdayLabels?: string[];
  todayLabel?: string;
  /** Names the printed sheet — "Tasks — Wolfson", "All workspaces", and so on. */
  printTitle?: string;
  rtl?: boolean;
  /**
   * FILL the host's height (the worker's phone, owner 2026-09-03): the week
   * rows share the room equally down to the bottom, so a day cell is tall
   * enough to show what is in it instead of a square the size of a stamp.
   * Each cell shows up to two tasks in full and folds the rest into "+N".
   */
  fill?: boolean;
  /** The calendar's words (folded chip, "+N more", the day list). English by default. */
  words?: CalendarWords;
  /**
   * How many things a day draws before the rest go behind "+N". Default:
   * two when filling the phone, no limit otherwise (the old behaviour).
   */
  maxPerDay?: number;
  /**
   * What "+N" (and a folded chip) does. Default: a small DAY LIST over the
   * calendar, each row keeping its event's own onClick — before this the
   * "+N" opened only the next hidden task, which read as doing nothing.
   */
  onMore?: (date: string, events: CalendarEvent[]) => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  /** The day list open over the calendar — a whole day, or one folded group. */
  const [dayList, setDayList] = useState<{ date: string; title?: string; events: CalendarEvent[] } | null>(null);
  const W = {
    foldDone: words?.foldDone ?? '{n} done',
    more: words?.more ?? '+{n}',
    done: words?.done ?? 'done',
    open: words?.open ?? 'open',
    close: words?.close ?? 'Close',
    foldHint: words?.foldHint ?? '',
  };
  const cap = maxPerDay ?? (fill ? 2 : Infinity);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month));
    const gridEnd = endOfWeek(endOfMonth(month));
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [month]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (!ev.date) continue;
      const key = ev.date.slice(0, 10);
      const arr = m.get(key);
      if (arr) arr.push(ev); else m.set(key, [ev]);
    }
    return m;
  }, [events]);

  /** Each day's drawn items — open first, done groups folded. */
  const itemsByDay = useMemo(() => {
    const m = new Map<string, DayItem[]>();
    for (const [k, list] of eventsByDay) m.set(k, dayItems(list));
    return m;
  }, [eventsByDay]);

  const today = new Date();

  function openList(date: string, evs: CalendarEvent[], title?: string) {
    if (onMore) { onMore(date, evs); return; }
    setDayList({ date, events: evs, title });
  }

  /**
   * Print the month as a real month grid.
   *
   * A wall planner, not a list: the point of a calendar on paper is seeing the
   * shape of the week at a glance, and a table of dates loses exactly that.
   * Done groups fold on paper exactly as on screen.
   */
  function printMonth() {
    const e = printEsc;
    const rows: string[] = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(`<tr>${days.slice(i, i + 7).map(day => {
        const key = format(day, 'yyyy-MM-dd');
        const items = itemsByDay.get(key) ?? [];
        const dim = !isSameMonth(day, month);
        return `<td class="cal ${dim ? 'dim' : ''}">
          <div class="d">${format(day, 'd')}</div>
          ${items.map(it => it.kind === 'fold'
            ? `<div class="ev done" style="border-inline-start:3px solid #16a34a">
                ${e(it.label ? `${it.label} · ` : '')}${e(fillN(W.foldDone, it.events.length))} ✓
              </div>`
            : `<div class="ev${it.ev.completed ? ' done' : ''}"
              style="border-inline-start:3px solid ${e(it.ev.color)}">
            ${it.ev.completed ? '✓ ' : ''}${e(it.ev.title)}${it.ev.subtitle ? `<span class="s">${e(it.ev.subtitle)}</span>` : ''}
          </div>`).join('')}
        </td>`;
      }).join('')}</tr>`);
    }

    const inMonthCount = events.filter(ev =>
      ev.date && isSameMonth(parseISO(ev.date.slice(0, 10)), month)).length;

    printSheet(
      `${printTitle} — ${format(month, 'LLLL yyyy', { locale })}`,
      `<table class="calgrid">
        <thead><tr>${weekdayLabels.map(d => `<th>${e(d)}</th>`).join('')}</tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>`,
      {
        landscape: true,
        rtl,
        subtitle: `${inMonthCount} item${inMonthCount === 1 ? '' : 's'} this month`,
        css: `
          .calgrid { table-layout:fixed; }
          .calgrid th { text-align:center; }
          td.cal { height:104px; vertical-align:top; border:1px solid #e5e7eb; padding:3px 4px; }
          td.cal.dim { background:#fafafa; }
          td.cal.dim .d { color:#d1d5db; }
          .d { font-size:10px; font-weight:800; color:#6b7280; margin-bottom:2px; }
          .ev { font-size:8.5px; line-height:1.25; padding:1px 3px; margin-bottom:2px;
                background:#f8fafc; border-radius:2px; overflow:hidden; }
          .ev.done { color:#15803d; background:#f0fdf4; }
          .ev .s { display:block; color:#9ca3af; font-size:7.5px; }
        `,
      },
    );
  }

  const weekRows = Math.ceil(days.length / 7);
  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${fill ? 'h-full flex flex-col min-h-0' : ''}`}
      data-calendar-fill={fill ? '1' : undefined}>
      {/* Month navigation */}
      <div className="flex items-center justify-between gap-1 px-2 sm:px-4 py-2 sm:py-3 border-b border-gray-100">
        <button
          onClick={() => setMonth(m => subMonths(m, 1))}
          className="p-2.5 sm:p-1.5 rounded-lg text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <h3 className="text-[13px] sm:text-sm font-bold text-gray-800 whitespace-nowrap truncate">
            {format(month, 'LLLL yyyy', { locale })}</h3>
          <button
            onClick={() => setMonth(startOfMonth(new Date()))}
            className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-colors"
          >
            {todayLabel}
          </button>
          <button
            onClick={printMonth}
            title="Print this month"
            className="p-2.5 sm:p-1 rounded-lg border border-gray-200 text-gray-400 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-colors"
          >
            <Printer size={13} />
          </button>
        </div>
        <button
          onClick={() => setMonth(m => addMonths(m, 1))}
          className="p-2.5 sm:p-1.5 rounded-lg text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Weekday headers */}
      {/* Saturday is not a working day (owner, 2026-09-06): its column is
          narrow and grey so the six days that matter get the width. */}
      <div className="grid border-b border-gray-100" style={{ gridTemplateColumns: WEEK_COLS }}>
        {weekdayLabels.map((d, i) => (
          <div key={i} className={`py-2 text-center text-[10px] font-semibold uppercase tracking-wider ${i === 6 ? 'text-gray-300 bg-gray-50' : 'text-gray-400'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className={`grid ${fill ? 'flex-1 min-h-0' : ''}`}
        style={{ gridTemplateColumns: WEEK_COLS, ...(fill ? { gridTemplateRows: `repeat(${weekRows}, minmax(0, 1fr))` } : {}) }}>
        {days.map((day, idx) => {
          const key = format(day, 'yyyy-MM-dd');
          const allDayEvents = eventsByDay.get(key) ?? [];
          const allItems = itemsByDay.get(key) ?? [];
          // Filling the phone: two named things, the rest behind "+N". The
          // office pages pass their own cap so a busy day is not a wall.
          const shown = Number.isFinite(cap) ? allItems.slice(0, cap) : allItems;
          const folded = allItems.slice(shown.length).reduce((n, it) => n + countOf(it), 0);
          const inMonth = isSameMonth(day, month);
          const isToday = isSameDay(day, today);
          return (
            <div
              key={idx}
              data-calendar-day={key}
              className={`border-b border-r border-gray-50 p-0.5 sm:p-1.5 flex flex-col gap-0.5 sm:gap-1
                overflow-hidden ${fill ? 'min-h-0' : 'aspect-square sm:aspect-auto sm:min-h-[132px]'} ${
                idx % 7 === 6 ? 'bg-gray-100/80' : inMonth ? 'bg-white' : 'bg-gray-50/60'
              } ${idx % 7 === 6 ? 'border-r-0' : ''}`}
              /* On a phone a seventh of the width is ~52px, and the old fixed
                 132px height turned every day into a long-necked rectangle —
                 SQUARES read as a calendar. From sm up the week row grows to
                 fit its busiest day instead, so one job shows full size. */
            >
              <div className="flex items-center justify-center">
                <span
                  className={`text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday
                      ? 'bg-[#1e3a5f] text-white'
                      : inMonth ? 'text-gray-600' : 'text-gray-300'
                  }`}
                >
                  {format(day, 'd')}
                </span>
              </div>
              <div className="flex flex-col gap-1 flex-1">
                {shown.map(it => {
                  if (it.kind === 'fold') {
                    // Every done thing one person did in one workspace that
                    // day — ONE chip, green, with the count (owner, 2026-10-08).
                    const tail = `${fillN(W.foldDone, it.events.length)} ✓`;
                    return (
                      <button
                        key={`fold-${it.key}`}
                        data-calendar-fold={it.events.length}
                        data-calendar-fold-key={it.key}
                        onClick={() => openList(key, it.events, it.label)}
                        title={`${it.label ? `${it.label} · ` : ''}${tail}${W.foldHint ? ` — ${W.foldHint}` : ''}`}
                        className="text-left rtl:text-right rounded-lg transition-all hover:shadow-md min-h-0 flex-shrink-0"
                        style={{ border: '2px solid #86efac', backgroundColor: '#f0fdf4', padding: '2px 5px' }}
                      >
                        <span className="flex items-center gap-1 min-w-0 text-[10.5px] font-bold">
                          <span className="truncate min-w-0 text-gray-700" style={{ flex: '0 1 auto' }}>{it.label}</span>
                          <span className="flex-shrink-0 whitespace-nowrap text-green-700">{it.label ? '· ' : ''}{tail}</span>
                        </span>
                      </button>
                    );
                  }
                  const ev = it.ev;
                  // One job fills the day; several share it and shrink together.
                  const roomy = shown.length === 1;
                  const compact = shown.length > 3;
                  const accent = ev.node?.stageColor ?? ev.color;
                  return (
                    <button
                      key={ev.id}
                      data-calendar-ev={ev.id}
                      data-calendar-ev-done={ev.completed ? '1' : '0'}
                      onClick={ev.onClick}
                      title={`${ev.completed ? `✓ ${W.done} — ` : ''}${ev.title}${ev.subtitle ? ' — ' + ev.subtitle : ''}`}
                      className={`text-left rounded-lg transition-all hover:shadow-md flex-1 min-h-0 ${
                        ev.completed ? 'opacity-70' : 'bg-white'
                      }`}
                      style={{
                        border: `${compact ? 2 : 3}px solid ${accent}`,
                        padding: compact ? '1px 3px' : '3px 5px',
                        // DONE reads as done — a green tint and a tick, never a
                        // line through the words (the notebook's ruling).
                        backgroundColor: ev.completed ? '#f0fdf4' : undefined,
                      }}
                    >
                      <span className={`flex items-center gap-0.5 font-bold min-w-0 ${roomy ? 'text-[12px]' : compact ? 'text-[9px]' : 'text-[10.5px]'}`}>
                        {ev.completed && <Check size={compact ? 9 : 11} strokeWidth={3.5} className="flex-shrink-0 text-green-600" />}
                        <span className="truncate min-w-0">{ev.subtitle || ev.title}</span>
                      </span>
                      {!compact && ev.subtitle && (
                        <span className="block text-gray-500 truncate text-[9.5px]">{ev.title}</span>
                      )}
                      {roomy && ev.node?.address && (
                        <span className="block text-gray-400 truncate text-[9px]">{ev.node.address}</span>
                      )}
                      {!compact && ev.node?.stageName && (
                        <span className="inline-block mt-1 text-[8.5px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: `${accent}22`, color: accent }}>
                          {ev.node.stageName}
                        </span>
                      )}
                      {roomy && (
                        <span className="flex items-center gap-1 mt-1">
                          {ev.node?.driveLink && <span className="w-4 h-4 rounded bg-gray-50 border border-gray-200 flex items-center justify-center"><DriveIcon size={9} /></span>}
                          {ev.node?.zohoLink && <span className="w-4 h-4 rounded bg-gray-50 border border-gray-200 flex items-center justify-center"><ZohoIcon size={9} /></span>}
                          {ev.node?.plansPdfLink && <span className="w-4 h-4 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600"><PlanIcon size={9} /></span>}
                          {!!ev.node?.pendingTasks && (
                            <span className="ml-auto text-[9px] font-bold text-amber-600">{ev.node.pendingTasks}</span>
                          )}
                        </span>
                      )}
                      {roomy && ev.node?.lastEdited && (
                        <span className="block text-[8.5px] text-gray-400 mt-0.5">{ev.node.lastEdited}</span>
                      )}
                    </button>
                  );
                })}
                {folded > 0 && (
                  <button
                    onClick={() => openList(key, allDayEvents)}
                    className="text-[10px] font-bold text-[#1e3a5f] text-left rtl:text-right px-1 hover:underline"
                    data-calendar-more={folded}>
                    {fillN(W.more, folded)}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {dayList && (
        <DayListPopover
          list={dayList}
          locale={locale}
          rtl={rtl}
          words={W}
          onClose={() => setDayList(null)}
        />
      )}
    </div>
  );
}

/**
 * Everything on one day (or one folded group), as a short list over the
 * calendar. Portalled to the body — a calendar can sit inside an overflow
 * scroller — and each row keeps its event's own onClick. Escape closes it and
 * only it (capture phase, stopped).
 */
function DayListPopover({ list, locale, rtl, words, onClose }: {
  list: { date: string; title?: string; events: CalendarEvent[] };
  locale?: Locale;
  rtl: boolean;
  words: Required<CalendarWords>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  // Open first, then done — the same order the day draws in.
  const evs = [...list.events].sort((a, b) => Number(a.completed) - Number(b.completed));
  const when = format(parseISO(list.date), 'EEEE d MMMM', { locale });
  return createPortal(
    <div dir={rtl ? 'rtl' : undefined}>
      <div className="fixed inset-0 z-[180]" style={{ backgroundColor: 'rgba(15,23,42,.35)' }} onClick={onClose} />
      <div data-calendar-daylist={evs.length}
        className="fixed z-[181] bg-white rounded-2xl overflow-hidden flex flex-col"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: 'min(420px, 94vw)', maxHeight: '76vh',
          boxShadow: '0 24px 60px -16px rgba(15,23,42,.45)',
        }}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="m-0 text-[14px] font-extrabold text-slate-800 truncate">{list.title || when}</h3>
            {list.title && <p className="m-0 text-[11.5px] text-slate-500">{when}</p>}
          </div>
          <button onClick={onClose} title={words.close} aria-label={words.close}
            className="text-gray-400 hover:text-gray-700 p-1 -m-1"><X size={16} /></button>
        </div>
        <ul className="m-0 p-2 list-none overflow-y-auto flex flex-col gap-1">
          {evs.map(ev => (
            <li key={ev.id}>
              <button
                data-calendar-daylist-row={ev.id}
                onClick={() => { onClose(); ev.onClick?.(); }}
                className="w-full text-start flex items-start gap-2 px-2.5 py-2 rounded-lg border hover:bg-slate-50"
                style={{
                  borderColor: ev.completed ? '#bbf7d0' : '#e2e8f0',
                  backgroundColor: ev.completed ? '#f0fdf4' : '#fff',
                  borderInlineStartWidth: 4, borderInlineStartColor: ev.node?.stageColor ?? ev.color,
                }}>
                {ev.completed
                  ? <Check size={15} strokeWidth={3} className="flex-shrink-0 mt-0.5 text-green-600" aria-label={words.done} />
                  : <Circle size={14} strokeWidth={2.5} className="flex-shrink-0 mt-0.5 text-amber-500" aria-label={words.open} />}
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-bold text-slate-800 break-words">{ev.subtitle || ev.title}</span>
                  {ev.subtitle && <span className="block text-[11.5px] text-slate-500 break-words">{ev.title}</span>}
                  {ev.node?.stageName && (
                    <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${ev.node.stageColor ?? ev.color}22`, color: ev.node.stageColor ?? ev.color }}>
                      {ev.node.stageName}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
