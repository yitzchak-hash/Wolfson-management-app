import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, eachDayOfInterval, format, isSameMonth, isSameDay, parseISO,
} from 'date-fns';
import { DriveIcon, ZohoIcon, PlanIcon } from '../ui/BrandIcons';
import { printSheet, printEsc } from '../../data/printing';

export interface CalendarEvent {
  id: string;
  date: string;        // yyyy-MM-dd (due date)
  title: string;       // task description
  subtitle?: string;   // building · apt, or project name
  color: string;       // chip accent color (hex)
  completed: boolean;
  onClick?: () => void;

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

export function TaskCalendar({
  events,
  weekdayLabels = WEEKDAYS,
  todayLabel = 'Today',
  printTitle = 'Calendar',
  rtl = false,
}: {
  events: CalendarEvent[];
  weekdayLabels?: string[];
  todayLabel?: string;
  /** Names the printed sheet — "Tasks — Wolfson", "All workspaces", and so on. */
  printTitle?: string;
  rtl?: boolean;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

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

  const today = new Date();

  /**
   * Print the month as a real month grid.
   *
   * A wall planner, not a list: the point of a calendar on paper is seeing the
   * shape of the week at a glance, and a table of dates loses exactly that.
   */
  function printMonth() {
    const e = printEsc;
    const rows: string[] = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(`<tr>${days.slice(i, i + 7).map(day => {
        const key = format(day, 'yyyy-MM-dd');
        const evs = eventsByDay.get(key) ?? [];
        const dim = !isSameMonth(day, month);
        return `<td class="cal ${dim ? 'dim' : ''}">
          <div class="d">${format(day, 'd')}</div>
          ${evs.map(ev => `<div class="ev${ev.completed ? ' done' : ''}"
              style="border-inline-start:3px solid ${e(ev.color)}">
            ${e(ev.title)}${ev.subtitle ? `<span class="s">${e(ev.subtitle)}</span>` : ''}
          </div>`).join('')}
        </td>`;
      }).join('')}</tr>`);
    }

    const inMonthCount = events.filter(ev =>
      ev.date && isSameMonth(parseISO(ev.date.slice(0, 10)), month)).length;

    printSheet(
      `${printTitle} — ${format(month, 'MMMM yyyy')}`,
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
          .ev.done { text-decoration:line-through; color:#9ca3af; }
          .ev .s { display:block; color:#9ca3af; font-size:7.5px; }
        `,
      },
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
            {format(month, 'MMMM yyyy')}</h3>
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
      <div className="grid grid-cols-7 border-b border-gray-100">
        {weekdayLabels.map((d, i) => (
          <div key={i} className="py-2 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay.get(key) ?? [];
          const inMonth = isSameMonth(day, month);
          const isToday = isSameDay(day, today);
          return (
            <div
              key={idx}
              className={`border-b border-r border-gray-50 p-0.5 sm:p-1.5 flex flex-col gap-0.5 sm:gap-1
                overflow-hidden aspect-square sm:aspect-auto sm:min-h-[132px] ${
                inMonth ? 'bg-white' : 'bg-gray-50/60'
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
                {dayEvents.map(ev => {
                  // One job fills the day; several share it and shrink together.
                  const roomy = dayEvents.length === 1;
                  const compact = dayEvents.length > 3;
                  const accent = ev.node?.stageColor ?? ev.color;
                  return (
                    <button
                      key={ev.id}
                      onClick={ev.onClick}
                      title={`${ev.title}${ev.subtitle ? ' — ' + ev.subtitle : ''}`}
                      className={`text-left rounded-lg bg-white transition-all hover:shadow-md flex-1 min-h-0 ${
                        ev.completed ? 'opacity-50' : ''
                      }`}
                      style={{
                        border: `${compact ? 2 : 3}px solid ${accent}`,
                        padding: compact ? '1px 3px' : '3px 5px',
                      }}
                    >
                      <span className={`block font-bold truncate ${roomy ? 'text-[12px]' : compact ? 'text-[9px]' : 'text-[10.5px]'}`}
                        style={{ textDecoration: ev.completed ? 'line-through' : undefined }}>
                        {ev.subtitle || ev.title}
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
