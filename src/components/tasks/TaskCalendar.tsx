import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, eachDayOfInterval, format, isSameMonth, isSameDay, parseISO,
} from 'date-fns';

export interface CalendarEvent {
  id: string;
  date: string;        // yyyy-MM-dd (due date)
  title: string;       // task description
  subtitle?: string;   // building · apt, or project name
  color: string;       // chip accent color (hex)
  completed: boolean;
  onClick?: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function TaskCalendar({
  events,
  weekdayLabels = WEEKDAYS,
  todayLabel = 'Today',
}: {
  events: CalendarEvent[];
  weekdayLabels?: string[];
  todayLabel?: string;
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => setMonth(m => subMonths(m, 1))}
          className="p-1.5 rounded-lg text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-gray-800">{format(month, 'MMMM yyyy')}</h3>
          <button
            onClick={() => setMonth(startOfMonth(new Date()))}
            className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-colors"
          >
            {todayLabel}
          </button>
        </div>
        <button
          onClick={() => setMonth(m => addMonths(m, 1))}
          className="p-1.5 rounded-lg text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100 transition-colors"
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
              className={`min-h-[92px] border-b border-r border-gray-50 p-1 flex flex-col gap-0.5 ${
                inMonth ? 'bg-white' : 'bg-gray-50/60'
              } ${idx % 7 === 6 ? 'border-r-0' : ''}`}
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
              <div className="flex flex-col gap-0.5 overflow-y-auto max-h-[120px] scrollbar-thin">
                {dayEvents.map(ev => (
                  <button
                    key={ev.id}
                    onClick={ev.onClick}
                    title={`${ev.title}${ev.subtitle ? ' — ' + ev.subtitle : ''}`}
                    className={`text-left rounded px-1 py-0.5 text-[9px] leading-tight transition-all hover:brightness-95 ${
                      ev.completed ? 'opacity-50 line-through' : ''
                    }`}
                    style={{ backgroundColor: ev.color + '22', borderLeft: `2px solid ${ev.color}` }}
                  >
                    <span className="block font-semibold truncate" style={{ color: ev.color }}>
                      {ev.subtitle || ev.title}
                    </span>
                    {ev.subtitle && (
                      <span className="block text-gray-500 truncate">{ev.title}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
