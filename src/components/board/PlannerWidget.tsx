import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays, Maximize2 } from 'lucide-react';
import {
  Apartment, CanvasElement, Contractor, User, ContractorAssignment, Stage, personColor,
} from '../../types';
import { registerRota, onRotaHover, RotaHit } from '../../data/rotaDrop';
import { holidaysOn, hebrewLabel, Holiday } from '../../data/hebrewDates';

/**
 * The planner.
 *
 * People down the left, days across, a slot at every crossing. It is the office's
 * paper sheet, so the two things the paper does are the two things it must do:
 * a cell holds a real job AND free words at the same time, and a person can have
 * as many jobs in a day as the day actually holds — the row grows, and a card
 * never shrinks to make room.
 */

export interface PlannerEntry {
  id: string;
  /** A real job from the board. */
  jobId?: string;
  /** Or plain words. Both can sit in the same cell. */
  text?: string;
  /** The task this slot created, if it made one. */
  taskId?: string;
}

export interface PlannerData {
  title?: string;
  /** Who is on it: `c:<contractorId>`, `u:<userId>` or `n:<free name>`. */
  people?: string[];
  /**
   * Somebody taken off, and the date they came off from.
   *
   * They stay on the sheet for the rest of that week, greyed out, because the
   * week is already planned around them — and disappear from the week after.
   */
  offFrom?: Record<string, string>;
  /** Where their jobs went, so putting them back can put everything back. */
  offKept?: Record<string, Record<string, PlannerEntry[]>>;
  /** The day the view is anchored on. */
  start?: string;
  mode?: 'week' | 'month';
  /** Days across: 5 = Sun–Thu, 6 = Sun–Fri, 7 = the lot. */
  span?: number;
  /** 0 = Sunday, 1 = Monday. */
  weekStart?: number;
  hebrew?: boolean;
  holidays?: { jewish?: boolean; israeli?: boolean; secular?: boolean };
  /** Offer to make a task when a job is dropped in. */
  askOnDrop?: boolean;
  cells?: Record<string, PlannerEntry[]>;
  dayNameSize?: number;
  textSize?: number;
  bold?: boolean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const cellKey = (person: string, day: string) => `${person}|${day}`;
export const newEntryId = () => `R-${Math.random().toString(36).slice(2, 8)}`;

export const iso = (d: Date) => {
  const t = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return t.toISOString().slice(0, 10);
};

export const addDays = (d: Date, n: number) => {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + n);
  return out;
};

/** The start of the week a date falls in, honouring which day the week starts. */
export function weekStartOf(d: Date, startDay = 0): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = (out.getDay() - startDay + 7) % 7;
  out.setDate(out.getDate() - back);
  return out;
}

/** Resolve a person id to a name and a colour. */
export function personOf(id: string, contractors: Contractor[], users: User[]) {
  if (id.startsWith('c:')) {
    const c = contractors.find(x => x.id === id.slice(2));
    return { name: c?.name ?? 'Someone', color: personColor(c?.name ?? id, c?.color), contractorId: c?.id };
  }
  if (id.startsWith('u:')) {
    const u = users.find(x => x.id === id.slice(2));
    return { name: u?.name ?? 'Someone', color: personColor(u?.name ?? id, u?.color), contractorId: undefined };
  }
  const name = id.slice(2) || id;
  return { name, color: personColor(name), contractorId: undefined };
}

const num = (v: unknown, fallback: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback;
};

/** What a drop is waiting on an answer about. */
export interface PendingDrop {
  elId: string;
  person: string;
  day: string;
  jobIds: string[];
}

export function PlannerWidget({
  el, data, jobs, contractors, users, assignments, stages, readOnly,
  update, openJob, onDropAsk, onRemoveTask, onShowAll,
}: {
  el: CanvasElement;
  data: PlannerData;
  jobs: Apartment[];
  contractors: Contractor[];
  users: User[];
  assignments: ContractorAssignment[];
  stages: Stage[];
  readOnly?: boolean;
  update: (patch: Partial<CanvasElement>) => void;
  openJob: (id: string) => void;
  /** Ask about making a task; only called when the setting is on. */
  onDropAsk?: (d: PendingDrop) => void;
  /** Ask what to do with the task behind an entry being pulled out. */
  onRemoveTask?: (entry: PlannerEntry, done: (alsoDelete: boolean) => void) => void;
  onShowAll?: () => void;
}) {
  const mode = data.mode === 'month' ? 'month' : 'week';
  const span = num(data.span, 5, 1, 7);
  const weekStart = Number(data.weekStart) === 1 ? 1 : 0;
  const textSize = num(data.textSize, 11, 7, 26);
  const daySize = num(data.dayNameSize, 11, 7, 28);
  const cells = data.cells ?? {};
  const people = data.people ?? [];
  const offFrom = data.offFrom ?? {};
  /**
   * The settings panel writes flat keys, one per switch; the widget's own seed
   * uses a nested object. Both are read, so a planner placed before this and one
   * configured after it behave the same.
   */
  const d = data as PlannerData & Record<string, unknown>;
  const holidayKinds = {
    jewish:  'holJewish'  in d ? !!d.holJewish  : (data.holidays?.jewish ?? true),
    israeli: 'holIsraeli' in d ? !!d.holIsraeli : (data.holidays?.israeli ?? true),
    secular: 'holSecular' in d ? !!d.holSecular : (data.holidays?.secular ?? false),
  };

  const anchor = useMemo(
    () => (data.start ? new Date(`${data.start}T00:00:00`) : new Date()),
    [data.start],
  );

  /**
   * The weeks on screen.
   *
   * A week view is one week. A month view is every week that touches the
   * anchor's month — four or five of them — so the dates you see are the real
   * ones rather than a fixed four-week window.
   */
  const weeks = useMemo(() => {
    if (mode === 'week') return [weekStartOf(anchor, weekStart)];
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const out: Date[] = [];
    let cur = weekStartOf(first, weekStart);
    while (cur <= last) { out.push(new Date(cur.getTime())); cur = addDays(cur, 7); }
    return out;
  }, [anchor, mode, weekStart]);

  const cellRefs = useRef(new Map<string, HTMLElement>());
  const [hover, setHover] = useState<RotaHit | null>(null);

  useEffect(() => registerRota(el.id, (x, y) => {
    for (const [key, node] of cellRefs.current) {
      const r = node.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const [person, day] = key.split('|');
        return { elId: el.id, person, day };
      }
    }
    return null;
  }), [el.id]);

  useEffect(() => onRotaHover(h => setHover(h?.elId === el.id ? h : null)), [el.id]);

  const write = useCallback((patch: Partial<PlannerData>) => {
    update({ data: { ...(el.data ?? {}), ...patch } });
  }, [el.data, update]);

  function setCell(key: string, entries: PlannerEntry[]) {
    const next = { ...cells };
    if (entries.length) next[key] = entries; else delete next[key];
    write({ cells: next });
  }

  /** Arrows step a week in week view and a month in month view. */
  function shift(by: number) {
    const d = new Date(anchor.getTime());
    if (mode === 'week') d.setDate(d.getDate() + by * 7);
    else d.setMonth(d.getMonth() + by);
    write({ start: iso(d) });
  }

  const jobById = useMemo(() => {
    const m = new Map<string, Apartment>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const todayIso = iso(new Date());

  /** Somebody who came off shows for the rest of that week, then not at all. */
  function personState(pid: string, dayIso: string): 'on' | 'ending' | 'gone' {
    const from = offFrom[pid];
    if (!from) return 'on';
    if (dayIso < from) return 'on';
    const lastWeek = weekStartOf(new Date(`${from}T00:00:00`), weekStart);
    const dayWeek = weekStartOf(new Date(`${dayIso}T00:00:00`), weekStart);
    return dayWeek.getTime() === lastWeek.getTime() ? 'ending' : 'gone';
  }

  const rowVisible = (pid: string, days: Date[]) =>
    days.some(d => personState(pid, iso(d)) !== 'gone');

  const title = data.title || 'Planner';
  const label = mode === 'week'
    ? `${weeks[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${
        addDays(weeks[0], span - 1).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
    : anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 flex-shrink-0">
        <CalendarDays size={12} className="text-gray-400 flex-shrink-0" />
        <span className="font-extrabold tracking-wide text-gray-500 truncate"
          style={{ fontSize: Math.max(9, textSize - 1) }}>
          {title.toUpperCase()}
        </span>
        <span className="px-1.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0 tabular-nums"
          style={{ fontSize: Math.max(8, textSize - 2) }}>{label}</span>
        <span className="flex-1" />
        {!readOnly && (
          <>
            {onShowAll && (
              <button data-no-drag data-el-action onClick={onShowAll} title="Show every job in the schedule"
                className="p-0.5 rounded text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100">
                <Maximize2 size={12} />
              </button>
            )}
            <button data-no-drag data-el-action onClick={() => shift(-1)}
              title={mode === 'week' ? 'Back a week' : 'Back a month'}
              className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <ChevronLeft size={13} />
            </button>
            <button data-no-drag data-el-action title="Today"
              onClick={() => write({ start: iso(new Date()) })}
              className="px-1.5 py-0.5 rounded font-bold text-gray-500 hover:bg-gray-100"
              style={{ fontSize: Math.max(8, textSize - 2) }}>
              Today
            </button>
            <button data-no-drag data-el-action onClick={() => shift(1)}
              title={mode === 'week' ? 'On a week' : 'On a month'}
              className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <ChevronRight size={13} />
            </button>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-2 pb-2" data-no-drag>
        {people.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-4">
            <span className="text-gray-400 leading-snug" style={{ fontSize: textSize }}>
              Nobody on the planner yet. Open its settings — the pencil — and
              choose who is on it.
            </span>
          </div>
        ) : weeks.map((wkStart, wi) => {
          const days = Array.from({ length: span }, (_, i) => addDays(wkStart, i));
          const cols = `minmax(74px, 0.85fr) repeat(${span}, minmax(0, 1fr))`;
          return (
            <div key={iso(wkStart)} className={wi ? 'mt-2.5' : ''}>
              <div className="grid gap-px mb-px" style={{ gridTemplateColumns: cols }}>
                <div className="font-black tracking-wide text-gray-400 flex items-end pb-0.5"
                  style={{ fontSize: Math.max(7, daySize - 3) }}>
                  {wkStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
                {days.map(dt => {
                  const key = iso(dt);
                  const isToday = key === todayIso;
                  const hols: Holiday[] = holidaysOn(dt, holidayKinds);
                  const off = hols.some(h => h.noWork);
                  return (
                    <div key={key} className="px-1 py-0.5 rounded-t-md leading-tight"
                      style={{
                        backgroundColor: isToday ? '#e0f2fe' : off ? '#f5f3ff' : '#f1f5f9',
                      }}>
                      <div className="font-bold truncate"
                        style={{ fontSize: daySize, color: isToday ? '#0369a1' : '#475569' }}>
                        {span > 5 ? SHORT_DAYS[dt.getDay()] : DAY_NAMES[dt.getDay()]}
                      </div>
                      <div className="truncate tabular-nums" style={{ fontSize: Math.max(7, daySize - 3), color: '#94a3b8' }}>
                        {dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        {data.hebrew && <span> · {hebrewLabel(dt)}</span>}
                      </div>
                      {hols.length > 0 && (
                        <div className="truncate font-bold"
                          style={{ fontSize: Math.max(7, daySize - 3), color: '#7c3aed' }}
                          title={hols.map(h => h.name).join(' · ')}>
                          {hols.map(h => h.name).join(' · ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {people.filter(pid => rowVisible(pid, days)).map(pid => {
                const person = personOf(pid, contractors, users);
                return (
                  <div key={pid} className="grid gap-px mb-px" style={{ gridTemplateColumns: cols }}>
                    <div className="flex items-start gap-1 px-1 py-1 rounded-l-md min-w-0"
                      style={{ backgroundColor: tint(person.color, 0.10) }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
                        style={{ backgroundColor: person.color }} />
                      <span className="truncate font-bold" style={{ fontSize: textSize, color: '#334155' }}>
                        {person.name}
                      </span>
                    </div>

                    {days.map(dt => {
                      const day = iso(dt);
                      const key = cellKey(pid, day);
                      const entries = cells[key] ?? [];
                      const state = personState(pid, day);
                      const lit = hover?.person === pid && hover?.day === day;
                      return (
                        <div
                          key={day}
                          ref={node => {
                            if (node && state !== 'ending') cellRefs.current.set(key, node);
                            else cellRefs.current.delete(key);
                          }}
                          className="group/cell p-0.5 flex flex-col gap-0.5 transition-colors"
                          style={{
                            // A slot is a rectangle a job card fits in, and it
                            // grows by whole cards — never by squeezing them.
                            minHeight: SLOT_H,
                            backgroundColor: lit ? '#dbeafe'
                              : state === 'ending' ? '#f1f5f9' : '#fbfcfd',
                            backgroundImage: state === 'ending'
                              ? 'repeating-linear-gradient(45deg,#e2e8f0 0 5px,transparent 5px 10px)'
                              : undefined,
                            outline: lit ? '2px solid #4aa8d8' : '1px solid #eef2f7',
                            outlineOffset: lit ? -2 : -1,
                          }}
                        >
                          {entries.map(en => (
                            <PlannerCard
                              key={en.id}
                              entry={en}
                              job={en.jobId ? jobById.get(en.jobId) : undefined}
                              stages={stages}
                              color={person.color}
                              size={textSize}
                              bold={data.bold}
                              readOnly={readOnly || state === 'ending'}
                              onOpen={() => en.jobId && openJob(en.jobId)}
                              onText={v => setCell(key, entries.map(x => (x.id === en.id ? { ...x, text: v } : x)))}
                              onRemove={() => {
                                const drop = () => setCell(key, entries.filter(x => x.id !== en.id));
                                if (en.taskId && onRemoveTask) onRemoveTask(en, () => drop());
                                else drop();
                              }}
                            />
                          ))}
                          {!readOnly && state === 'on' && (
                            <button
                              data-no-drag data-el-action
                              onClick={() => setCell(key, [...entries, { id: newEntryId(), text: '' }])}
                              title="Add a note to this day"
                              className="self-start px-0.5 text-gray-300 hover:text-[#1e3a5f]
                                         opacity-0 group-hover/cell:opacity-100 transition-opacity"
                            >
                              <Plus size={9} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The height of one empty slot — sized so a job card sits in it comfortably. */
const SLOT_H = 58;

/**
 * One thing in a slot.
 *
 * A job reads as a card in the person's colour with its stage under the name;
 * free words are just words. A single click picks it up, a double click opens
 * the job — the same rule as the board, so there is one habit to learn.
 */
function PlannerCard({
  entry, job, stages, color, size, bold, readOnly, onOpen, onText, onRemove,
}: {
  entry: PlannerEntry;
  job?: Apartment;
  stages: Stage[];
  color: string;
  size: number;
  bold?: boolean;
  readOnly?: boolean;
  onOpen: () => void;
  onText: (v: string) => void;
  onRemove: () => void;
}) {
  const [v, setV] = useState(entry.text ?? '');
  useEffect(() => setV(entry.text ?? ''), [entry.text]);

  if (entry.jobId) {
    const stage = stages.find(s => s.id === job?.currentStageId);
    return (
      <div
        className="group/en rounded-md px-1.5 py-1 min-w-0 planner-card"
        style={{ backgroundColor: tint(color, 0.16), border: '1px solid rgba(15,23,42,.07)' }}
      >
        <div className="flex items-start gap-1 min-w-0">
          <button
            data-no-drag data-el-action
            onDoubleClick={onOpen}
            className="flex-1 min-w-0 text-left"
            style={{ fontSize: size, fontWeight: bold ? 800 : 700, color: '#1e293b' }}
            title={job ? 'Double-click to open' : 'This job is no longer on the board'}
          >
            <span className="block truncate">
              {job ? (job.displayName?.trim() || 'Job') : '(job removed)'}
            </span>
            {(stage || entry.text) && (
              <span className="block truncate font-medium"
                style={{ fontSize: Math.max(7, size - 2), color: '#64748b' }}>
                {[entry.text, stage?.name].filter(Boolean).join(' · ')}
              </span>
            )}
          </button>
          {!readOnly && (
            <button data-no-drag data-el-action onClick={onRemove} title="Take it off this day"
              className="opacity-0 group-hover/en:opacity-100 text-gray-400 hover:text-red-500 flex-shrink-0">
              <X size={9} />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (readOnly) {
    return (
      <span className="truncate px-0.5"
        style={{ fontSize: size, fontWeight: bold ? 700 : 500, color: '#475569' }}>
        {entry.text}
      </span>
    );
  }

  return (
    <div className="group/en flex items-center gap-0.5 min-w-0">
      <input
        data-no-drag data-el-action
        value={v}
        placeholder="…"
        onChange={e => setV(e.target.value)}
        onBlur={() => { if (v !== entry.text) onText(v); if (!v.trim()) onRemove(); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="flex-1 min-w-0 bg-transparent outline-none px-0.5"
        style={{ fontSize: size, fontWeight: bold ? 700 : 500, color: '#475569' }}
      />
      <button data-no-drag data-el-action onClick={onRemove} title="Remove"
        className="opacity-0 group-hover/en:opacity-100 text-gray-300 hover:text-red-500 flex-shrink-0">
        <X size={9} />
      </button>
    </div>
  );
}

/** A colour at an alpha, whether it arrived as hex or as hsl(). */
export function tint(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const h = color.slice(1);
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color.replace(/^hsl\((.*)\)$/, (_, inner) => `hsla(${inner} / ${alpha})`);
}
