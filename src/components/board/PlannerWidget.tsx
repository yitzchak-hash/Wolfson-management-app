import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays, Maximize2 } from 'lucide-react';
import {
  Apartment, CanvasElement, Contractor, User, ContractorAssignment, Stage, personColor,
} from '../../types';
import { registerRota, onRotaHover, rotaCellAt, setRotaHover, RotaHit } from '../../data/rotaDrop';
import { holidaysOn, hebrewLabel, Holiday } from '../../data/hebrewDates';
import { DriveIcon, ZohoIcon, PlanIcon } from '../ui/BrandIcons';

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
  /** The day the view is anchored on. Kept for notebooks made before weeks. */
  start?: string;
  /**
   * The run of weeks the notebook holds, as a first week and a count.
   *
   * It opens on the week it was made and grows only when asked: the plus above
   * adds an earlier week and everything shifts down, the plus below adds a
   * later one. A first-week-plus-count is stored rather than a list of weeks
   * because the run has to stay unbroken — the month rules and the jump-to-a-
   * month arrows both assume there is no gap to fall into.
   *
   * Nothing already written is touched when a week is added, so the notebook
   * accumulates into a record of what actually happened.
   */
  firstWeek?: string;
  weekCount?: number;
  /** Sticky notes pinned in a day, by cell key. */
  stickies?: Record<string, { id: string; text: string; colour: string }[]>;
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

/**
 * Taking somebody off the planner, and putting them back.
 *
 * Kept here, beside the data it edits, rather than in the settings panel that
 * happens to call it — the rules are about what a planner means, not about a
 * form.
 *
 * Nothing is destroyed. Their filled-in days from the cut-off onward are moved
 * out of `cells` and into `offKept`, so putting them back puts every job in the
 * slot it came from. Days already worked keep their jobs, because that is the
 * record of who was where and rubbing it out would be a lie.
 *
 * `offFrom` is what makes the rest of the cut week draw greyed rather than
 * simply vanish: the week is already planned around them, so it stays visible
 * and unavailable, and the week after does not draw the row at all.
 */
export function takeOffPlanner(
  data: PlannerData, personId: string, from: string,
): { data: PlannerData; freed: string[] } {
  const cells = { ...(data.cells ?? {}) };
  const kept: Record<string, PlannerEntry[]> = { ...(data.offKept?.[personId] ?? {}) };
  const freed: string[] = [];

  for (const key of Object.keys(cells)) {
    const [person, day] = key.split('|');
    if (person !== personId || day < from) continue;
    kept[key] = cells[key];
    for (const e of cells[key]) if (e.jobId) freed.push(e.jobId);
    delete cells[key];
  }

  return {
    data: {
      ...data,
      cells,
      offFrom: { ...(data.offFrom ?? {}), [personId]: from },
      offKept: { ...(data.offKept ?? {}), [personId]: kept },
    },
    freed: [...new Set(freed)],
  };
}

/** Putting them back restores every slot they had. */
export function putBackOnPlanner(data: PlannerData, personId: string): PlannerData {
  const kept = data.offKept?.[personId] ?? {};
  const offFrom = { ...(data.offFrom ?? {}) };
  const offKept = { ...(data.offKept ?? {}) };
  delete offFrom[personId];
  delete offKept[personId];
  return {
    ...data,
    cells: { ...(data.cells ?? {}), ...kept },
    offFrom,
    offKept,
  };
}

/** How many jobs a person has in slots from a date onward. */
export function slotsFrom(data: PlannerData, personId: string, from: string): number {
  let n = 0;
  for (const [key, entries] of Object.entries(data.cells ?? {})) {
    const [person, day] = key.split('|');
    if (person === personId && day >= from) n += entries.filter(e => e.jobId).length;
  }
  return n;
}

/** What a drop is waiting on an answer about. */
export interface PendingDrop {
  elId: string;
  person: string;
  day: string;
  jobIds: string[];
}

export function PlannerWidget({
  el, data, jobs, contractors, users, assignments, stages, readOnly,
  update, openJob, onDropAsk, onRemoveTask, onShowAll, onLeaveNotebook,
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
  /** This job has no squares left anywhere — put it back on the board. */
  onLeaveNotebook?: (jobId: string) => void;
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
   * The weeks the notebook holds.
   *
   * One unbroken run, from the week it was made, growing only when somebody
   * presses a plus. A notebook written before this had a single anchored week
   * and no run, so it starts as a run of one from wherever it was pointing —
   * nothing it had recorded is lost or moved.
   */
  const firstWeek = useMemo(() => weekStartOf(
    data.firstWeek ? new Date(`${data.firstWeek}T00:00:00`) : anchor, weekStart,
  ), [data.firstWeek, anchor, weekStart]);
  const weekCount = Math.max(1, Math.min(520, Math.round(num(data.weekCount, 1, 1, 520))));

  const weeks = useMemo(
    () => Array.from({ length: weekCount }, (_, i) => addDays(firstWeek, i * 7)),
    [firstWeek, weekCount],
  );

  /**
   * Add a week before the first, or after the last.
   *
   * NOT memoised. `write` spreads the element's data as it was when it was
   * created, so a callback that captured an old one would write that old data
   * back — and since the notebook starts empty, adding a week silently emptied
   * every square that had been filled since. A plain function always has the
   * current one.
   */
  function addWeek(where: 'before' | 'after') {
    if (where === 'after') {
      write({ firstWeek: iso(firstWeek), weekCount: weekCount + 1 });
    } else {
      write({ firstWeek: iso(addDays(firstWeek, -7)), weekCount: weekCount + 1 });
    }
  }

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

    /**
     * A job with no squares left goes back on the board.
     *
     * Only when the LAST one goes: a job on three days is one job wearing
     * three faces, and losing one of them is losing a ghost, not the job.
     * Its board position was never cleared, so it lands back where it was.
     */
    const gone = (cells[key] ?? [])
      .map(e => e.jobId)
      .filter((id): id is string => !!id && !entries.some(x => x.jobId === id));
    for (const id of gone) {
      const stillThere = Object.values(next).some(list => list.some(e => e.jobId === id));
      if (!stillThere) onLeaveNotebook?.(id);
    }
  }

  /**
   * Move a card to another square — or leave a ghost behind.
   *
   * Once a job has moved into the notebook there is no tile on the board to
   * drag any more, so this is the only way to put the same job on a second
   * person's row. A plain drag MOVES it; holding Ctrl or ⌘ leaves the original
   * where it was, which is the same copy idiom the board already uses. Either
   * way there is one job record — a second square is another face of it, not
   * another job.
   */
  function moveEntry(fromKey: string, entry: PlannerEntry, target: RotaHit, copy: boolean) {
    const toKey = cellKey(target.person, target.day);
    if (toKey === fromKey) return;
    const next = { ...cells };
    if (!copy) {
      const left = (next[fromKey] ?? []).filter(x => x.id !== entry.id);
      if (left.length) next[fromKey] = left; else delete next[fromKey];
    }
    const landing = next[toKey] ?? [];
    // The same job twice in ONE square says nothing the first one did not.
    if (entry.jobId && landing.some(e => e.jobId === entry.jobId)) return;
    next[toKey] = [...landing, { ...entry, id: newEntryId() }];
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

  const title = data.title || 'Weekly notebook';

  /**
   * The month named at the top is the month you are LOOKING at.
   *
   * A notebook is one long scroll of weeks, so a fixed label would be telling
   * you about a week that is no longer on screen. Each week reports its
   * position and the topmost visible one wins.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekRefs = useRef(new Map<string, HTMLElement>());
  const [shownMonth, setShownMonth] = useState<string>(() => monthKey(weeks[0]));

  const readMonth = useCallback(() => {
    const box = scrollRef.current?.getBoundingClientRect();
    if (!box) return;
    let best: { key: string; top: number } | null = null;
    for (const [key, node] of weekRefs.current) {
      const r = node.getBoundingClientRect();
      if (r.bottom < box.top + 4) continue;                 // scrolled past
      if (!best || r.top < best.top) best = { key, top: r.top };
    }
    if (best) {
      const wk = new Date(`${best.key}T00:00:00`);
      setShownMonth(monthKey(wk));
    }
  }, []);

  useEffect(() => { readMonth(); }, [readMonth, weekCount]);

  /** Scroll to the first week of the next or previous month. */
  function jumpMonth(by: 1 | -1) {
    const here = new Date(`${shownMonth}-01T00:00:00`);
    const want = new Date(here.getFullYear(), here.getMonth() + by, 1);
    // The nearest week that touches that month, within what the notebook holds.
    let target: Date | null = null;
    for (const w of weeks) {
      if (monthKey(w) === monthKey(want)) { target = w; break; }
      if (by > 0 && w > want && !target) target = w;
    }
    if (!target && by < 0) target = weeks[0];
    if (!target) target = weeks[weeks.length - 1];
    const node = weekRefs.current.get(iso(target));
    const box = scrollRef.current;
    if (node && box) box.scrollTo({ top: node.offsetTop - 4, behavior: 'smooth' });
  }

  const label = new Date(`${shownMonth}-01T00:00:00`)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

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
            {/* The arrows move the VIEW between months, they do not move the
                notebook. Nothing in it changes; the scroll goes to that month. */}
            <button data-no-drag data-el-action onClick={() => jumpMonth(-1)}
              title="The month before"
              className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <ChevronLeft size={13} />
            </button>
            <button data-no-drag data-el-action title="This week"
              onClick={() => {
                const wk = weekStartOf(new Date(), weekStart);
                const node = weekRefs.current.get(iso(wk));
                if (node && scrollRef.current) {
                  scrollRef.current.scrollTo({ top: node.offsetTop - 4, behavior: 'smooth' });
                }
              }}
              className="px-1.5 py-0.5 rounded font-bold text-gray-500 hover:bg-gray-100"
              style={{ fontSize: Math.max(8, textSize - 2) }}>
              Today
            </button>
            <button data-no-drag data-el-action onClick={() => jumpMonth(1)}
              title="The month after"
              className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <ChevronRight size={13} />
            </button>
          </>
        )}
      </div>

      {/* The wheel scrolls the notebook when the pointer is over it, and the
          board must not also pan. `data-no-drag` keeps a press on the scrollbar
          from dragging the widget; the wheel is stopped here so the two never
          fight over the same gesture. */}
      <div
        ref={scrollRef}
        onScroll={readMonth}
        className="flex-1 min-h-0 overflow-auto px-2 pb-2 planner-scroll"
        data-no-drag
        data-wheel
      >
        {people.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center px-4">
            <span className="text-gray-400 leading-snug" style={{ fontSize: textSize }}>
              Nobody on it yet. Open its settings — the pencil — and choose who is on it.
            </span>
          </div>
        ) : <>
        {!readOnly && (
          <AddWeekRow where="before" size={textSize} onAdd={() => addWeek('before')} />
        )}
        {weeks.map((wkStart, wi) => {
          const days = Array.from({ length: span }, (_, i) => addDays(wkStart, i));
          const cols = `minmax(74px, 0.85fr) repeat(${span}, minmax(0, 1fr))`;
          // A rule wherever the month changes, so the run reads as months
          // rather than as an undifferentiated column of weeks.
          const newMonth = wi > 0 && monthKey(wkStart) !== monthKey(weeks[wi - 1]);
          return (
            <div
              key={iso(wkStart)}
              ref={node => { if (node) weekRefs.current.set(iso(wkStart), node);
                             else weekRefs.current.delete(iso(wkStart)); }}
              className={wi ? 'mt-2.5' : ''}
            >
              {newMonth && (
                <div className="flex items-center gap-2 my-2">
                  <span className="h-px flex-1" style={{ backgroundColor: '#cbd5e1' }} />
                  <span className="font-black tracking-wide text-slate-500"
                    style={{ fontSize: Math.max(8, textSize - 1) }}>
                    {wkStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase()}
                  </span>
                  <span className="h-px flex-1" style={{ backgroundColor: '#cbd5e1' }} />
                </div>
              )}
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
                          className="group/cell p-0.5 flex flex-col gap-0.5 transition-colors items-stretch"
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
                              assignments={assignments}
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
                              onDragTo={(target, copy) => moveEntry(key, en, target, copy)}
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
        {!readOnly && (
          <AddWeekRow where="after" size={textSize} onAdd={() => addWeek('after')} />
        )}
        </>}
      </div>
    </div>
  );
}

/** The month a date belongs to, as `YYYY-MM`. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The plus that lengthens the notebook.
 *
 * One above and one below, rather than a week/month switch: the notebook is a
 * run you extend in the direction you need, and what is already written never
 * moves. Quiet until you go near it, so a long notebook is weeks and not
 * buttons.
 */
function AddWeekRow({ where, size, onAdd }: {
  where: 'before' | 'after'; size: number; onAdd: () => void;
}) {
  return (
    <button
      data-no-drag data-el-action
      onClick={onAdd}
      title={where === 'before' ? 'Add the week before' : 'Add the week after'}
      className="w-full flex items-center gap-2 py-1 my-0.5 group/add"
    >
      <span className="h-px flex-1 transition-colors"
        style={{ backgroundColor: '#e2e8f0' }} />
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors
                       text-gray-400 border-transparent
                       group-hover/add:text-[#1e3a5f] group-hover/add:border-[#cbd5e1]"
        style={{ fontSize: Math.max(8, size - 2) }}>
        <Plus size={9} />
        {where === 'before' ? 'earlier week' : 'another week'}
      </span>
      <span className="h-px flex-1" style={{ backgroundColor: '#e2e8f0' }} />
    </button>
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
  entry, job, stages, assignments, color, size, bold, readOnly, onOpen, onText, onRemove, onDragTo,
}: {
  entry: PlannerEntry;
  job?: Apartment;
  stages: Stage[];
  assignments: ContractorAssignment[];
  color: string;
  size: number;
  bold?: boolean;
  readOnly?: boolean;
  onOpen: () => void;
  onText: (v: string) => void;
  onRemove: () => void;
  /** Dropped on another square. `copy` leaves this one where it is. */
  onDragTo?: (target: RotaHit, copy: boolean) => void;
}) {
  const [v, setV] = useState(entry.text ?? '');
  useEffect(() => setV(entry.text ?? ''), [entry.text]);

  /**
   * Dragging a card from one square to another.
   *
   * Four pixels of travel separates a drag from a press, so a single click
   * still picks a card and a double click still opens the job. The hover
   * highlight is the same one a board tile lights when it passes over a
   * square, because it is the same registry answering.
   */
  const drag = useRef<{ x: number; y: number; live: boolean } | null>(null);
  const dragHandlers = readOnly || !onDragTo ? {} : {
    onPointerDown: (e: React.PointerEvent) => {
      // NOT `closest('a,button')`: the job's name is itself a button, so that
      // test refused to start a drag anywhere except the few pixels of padding
      // around it. Only the links and the little remove cross are exempt.
      if ((e.target as HTMLElement).closest('a,[data-card-action]')) return;
      drag.current = { x: e.clientX, y: e.clientY, live: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.live && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
      d.live = true;
      setRotaHover(rotaCellAt(e.clientX, e.clientY));
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (!d?.live) {
        // A press that never travelled IS a click, and a click opens the job —
        // the same thing it does anywhere else. Done here rather than in a
        // separate onClick so there is one path, not two that must agree.
        if (!(e.target as HTMLElement).closest('a,[data-card-action]')) onOpen();
        return;
      }
      const target = rotaCellAt(e.clientX, e.clientY);
      setRotaHover(null);
      if (target) onDragTo!(target, e.ctrlKey || e.metaKey);
    },
    onPointerCancel: () => { drag.current = null; setRotaHover(null); },
  };

  if (entry.jobId) {
    const stage = stages.find(s => s.id === job?.currentStageId);
    const pending = assignments.filter(a => a.apartmentId === job?.id && !a.completedAt).length;
    /**
     * The tile, in the square.
     *
     * The job has MOVED here — this is where it lives now — so the square shows
     * what the board tile showed: the stage as a dot and a word, what is still
     * outstanding, and the links. A grey name would have meant losing every
     * reading the board gave you the moment anything was scheduled.
     */
    return (
      <div
        {...dragHandlers}
        // The board's node handler takes the pointer on pointerdown so it can
        // start dragging the notebook; without these the card never saw the
        // press at all, so clicking one did nothing and dragging one moved the
        // whole widget.
        data-no-drag data-el-action
        className="group/en rounded-md px-1.5 py-1 min-w-0 planner-card flex-1 flex flex-col justify-center"
        style={{
          backgroundColor: tint(color, 0.16), border: '1px solid rgba(15,23,42,.07)',
          cursor: readOnly ? undefined : 'pointer', touchAction: 'none',
        }}
        title="Click to open · drag to another day · hold Ctrl to leave a copy"
      >
        <div className="flex items-start gap-1 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
            style={{ backgroundColor: stage?.color ?? '#cbd5e1' }}
            title={stage ? stage.name : 'Not started'} />
          <span
            className="flex-1 min-w-0 text-left"
            style={{ fontSize: size, fontWeight: bold ? 800 : 700, color: '#1e293b' }}
            title={job ? undefined : 'This job is no longer on the board'}
          >
            <span className="block truncate">
              {job ? (job.displayName?.trim() || job.address?.trim() || 'Job') : '(job removed)'}
            </span>
            {(stage || entry.text || job?.address) && (
              <span className="block truncate font-medium"
                style={{ fontSize: Math.max(7, size - 2), color: '#64748b' }}>
                {[entry.text, stage?.name, job?.address].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>

          {/* What the tile carries, carried here too. */}
          <span className="flex items-center gap-0.5 flex-shrink-0">
            {pending > 0 && (
              <span className="px-1 rounded-full font-bold tabular-nums"
                style={{ fontSize: Math.max(7, size - 3), backgroundColor: '#fef3c7', color: '#92400e' }}
                title={`${pending} still to do`}>
                {pending}
              </span>
            )}
            {job?.driveLink && (
              <a data-no-drag data-el-action href={job.driveLink} target="_blank" rel="noreferrer"
                title="Drive folder" onClick={e => e.stopPropagation()}
                className="text-[#4aa8d8] hover:opacity-70">
                <DriveIcon size={Math.max(9, size - 2)} />
              </a>
            )}
            {job?.zohoLink && (
              <a data-no-drag data-el-action href={job.zohoLink} target="_blank" rel="noreferrer"
                title="Zoho" onClick={e => e.stopPropagation()}
                className="text-[#e11d48] hover:opacity-70">
                <ZohoIcon size={Math.max(9, size - 2)} />
              </a>
            )}
            {job?.plansPdfLink && (
              <a data-no-drag data-el-action href={job.plansPdfLink} target="_blank" rel="noreferrer"
                title="Plan" onClick={e => e.stopPropagation()}
                className="text-[#1e3a5f] hover:opacity-70">
                <PlanIcon size={Math.max(9, size - 2)} />
              </a>
            )}
            {!readOnly && (
              <button data-no-drag data-el-action data-card-action onClick={onRemove}
                title="Take it off this day"
                className="opacity-0 group-hover/en:opacity-100 text-gray-400 hover:text-red-500">
                <X size={9} />
              </button>
            )}
          </span>
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
