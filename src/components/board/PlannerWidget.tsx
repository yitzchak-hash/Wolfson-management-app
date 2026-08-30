import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlannerDropDialog, PlannerDayDialog, PlannerTaskDialog, DayChoice } from './PlannerDialogs';
import { ChevronUp, ChevronDown, Plus, X, CalendarDays, Maximize2, Eye, EyeOff, ClipboardList } from 'lucide-react';
import {
  Apartment, CanvasElement, Contractor, User, ContractorAssignment, Stage, personColor,
  aptLabel,
} from '../../types';
import { registerRota, onRotaHover, rotaCellAt, setRotaHover, RotaHit } from '../../data/rotaDrop';
import { daysOf, dayNumberOf, moveTaskDay, removeTaskDay, addTaskDay } from '../../data/taskDays';
import { useStore, loadProjectSnapshot } from '../../data/store';
import { useBoardTrack } from '../../data/useBoardUndo';
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
  /**
   * Which workspace that job lives in — absent means this one.
   *
   * The office plans across all three: a Wolfson apartment sometimes has to go
   * on the same week as the Job Board's own work. Absent on every entry ever
   * written before this existed, and absent on nearly all of them after, so the
   * common case stays exactly as it was.
   *
   * A foreign job STAYS PUT (the owner's ruling): nothing leaves its own
   * building diagram or any count there. The square only points at it.
   */
  projectId?: string;
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
  /**
   * Weeks put away, by their start date.
   *
   * Hiding is a matter of what is DRAWN and nothing else: the week stays in the
   * run and every card stays in `cells`, so the schedule window, the wall, the
   * tasks behind them and every count still see it — and showing the week again
   * shows exactly what it held. Hiding by shortening the run instead would have
   * to move `firstWeek` or `weekCount`, which renumbers the run and orphans the
   * weeks the other side of the hole.
   */
  hiddenWeeks?: string[];
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
  /**
   * How the sheet looks.
   *
   * Every one of these was fixed in the code, which meant a notebook on a wall
   * panel had a header a person could not read from where they stand and no
   * way to change it. The dates in particular: the day NUMBER is what somebody
   * scans for and it was the smallest thing on the row.
   */
  dateSize?: number;
  nameSize?: number;
  /** The background behind a normal working day. */
  dayBg?: string;
  /** Behind a day nobody is expected on site — a holiday, or the weekend. */
  offBg?: string;
  /** Behind today. */
  todayBg?: string;
  /** The empty squares people write in. */
  cellBg?: string;
  /** Row height, as a multiplier on the natural one. */
  rowScale?: number;
  /**
   * One multiplier over the whole sheet — type, row height and the name column.
   *
   * The individual sizes are still there for tuning one thing; this is the one
   * somebody reaches for when the notebook is on a wall panel and everything on
   * it is too small, and it keeps the sizes in proportion to each other rather
   * than needing five settings changed in step.
   */
  scale?: number;
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

/**
 * How wide a string is, in ems of the sheet's own font — MEASURED.
 *
 * A 2D canvas measures the real face at 1px and hands back ems, so it cannot
 * drift from what the browser will draw. The diagram uses the same trick for
 * the same reason: a hand-tuned per-character table undershoots real text and
 * has no entries at all for Hebrew. Memoised — the same handful of names is
 * asked for on every row of every week.
 */
const nameEmCache = new Map<string, number>();
let nameCtx: CanvasRenderingContext2D | null | undefined;
function nameEms(text: string): number {
  const hit = nameEmCache.get(text);
  if (hit !== undefined) return hit;
  if (nameCtx === undefined) {
    try {
      nameCtx = document.createElement('canvas').getContext('2d');
      if (nameCtx) {
        const family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
        nameCtx.font = `700 100px ${family}`;
      }
    } catch { nameCtx = null; }
  }
  // Generous fallback: over-estimating makes the column a little wide, which is
  // merely untidy; under-estimating clips somebody's name.
  const w = nameCtx ? nameCtx.measureText(text).width / 100 : text.length * 0.62;
  nameEmCache.set(text, w);
  return w;
}

const num = (v: unknown, fallback: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback;
};

/**
 * A multiplier, kept as one.
 *
 * `num` rounds, which is right for a font size in whole pixels and wrong for a
 * multiplier: the row-height setting is offered as "1.5 gives half again as
 * much room" and rounding quietly turned that into 2.
 */
const frac = (v: unknown, fallback: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, n)) : fallback;
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
  el, data, jobs, contractors, users, assignments, stages, readOnly, projection,
  update, openJob, openUnit, onDropAsk, onRemoveTask, onShowAll, onLeaveNotebook,
}: {
  el: CanvasElement;
  data: PlannerData;
  jobs: Apartment[];
  contractors: Contractor[];
  users: User[];
  assignments: ContractorAssignment[];
  stages: Stage[];
  readOnly?: boolean;
  /**
   * A PROJECTION of the main notebook: shows exactly what the secretary's copy
   * shows and cannot be written to — but a job in a square still opens, which
   * is the whole reason to put one on a second screen.
   */
  projection?: boolean;
  update: (patch: Partial<CanvasElement>) => void;
  openJob: (id: string) => void;
  /**
   * Opens a unit that lives in ANOTHER workspace. Where the host provides it
   * (the board, the dashboard) that is a read-only PEEK over the snapshot —
   * you stay standing exactly where you are, and the peek's own button does
   * the travel for whoever really wants it. Without it, the old behaviour
   * (switch workspace, hand over a focus intent) is the fallback.
   */
  openUnit?: (projectId: string, aptId: string) => void;
  /** Ask about making a task; only called when the setting is on. */
  onDropAsk?: (d: PendingDrop) => void;
  /** Ask what to do with the task behind an entry being pulled out. */
  onRemoveTask?: (entry: PlannerEntry, done: (alsoDelete: boolean) => void) => void;
  onShowAll?: () => void;
  /** This job has no squares left anywhere — put it back on the board. */
  onLeaveNotebook?: (jobId: string) => void;
}) {
  /** Nothing may be written: either it is inert, or it is a projection. */
  /**
   * A PROJECTION is not read-only.
   *
   * It was, and that made a second notebook a picture of the first: no X on
   * its cards, nothing droppable onto it, no drag. The owner's ruling is that
   * a copy carries every control the original does and the two stay in step —
   * so `projection` now says only WHERE the writes go (the main's element),
   * never whether they are allowed.
   */
  const ro = !!readOnly;
  const mode = data.mode === 'month' ? 'month' : 'week';
  const span = num(data.span, 5, 1, 7);
  const weekStart = Number(data.weekStart) === 1 ? 1 : 0;
  /**
   * The whole sheet, at one size.
   *
   * Every measurement on the notebook — type, the height of a square, the width
   * of the name column — goes through `z`, so the setting scales the sheet
   * rather than just its words. The floors that keep the small type legible are
   * scaled too: leaving them absolute meant that at anything under 1 the
   * secondary lines stopped shrinking while the headings kept going, and the
   * sheet came out with its hierarchy inverted.
   */
  const scale = frac(data.scale, 1, 0.5, 3);
  const z = (n: number) => Math.round(n * scale * 10) / 10;

  const baseText = num(data.textSize, 11, 7, 26);
  const baseDay = num(data.dayNameSize, 11, 7, 28);
  /**
   * The date is its own size, and it starts BIGGER than the day name.
   *
   * It used to be `daySize - 3` — the smallest type on the sheet — which is
   * backwards: on a printed rota the number is what the eye goes to and the
   * weekday is the label under it.
   */
  const baseDate = num(data.dateSize, Math.round(baseDay * 1.15), 7, 34);
  const baseName = num(data.nameSize, baseText, 7, 30);
  const textSize = z(baseText);
  const daySize = z(baseDay);
  const dateSize = z(baseDate);
  const nameSize = z(baseName);
  /**
   * Wide enough for the longest name on the sheet, and no wider.
   *
   * Measured rather than guessed, so it follows the text size, the sheet's
   * scale and whatever somebody types — a long name widens the column instead
   * of being cut off, and a sheet of short names gives the days their space
   * back. The chrome is the dot, the two gaps and the row padding; the clamp
   * stops a pasted paragraph swallowing the week.
   */
  const nameColW = useMemo(() => {
    const widest = (data.people ?? [])
      .map(pid => personOf(pid, contractors, users).name)
      .reduce((w, n) => Math.max(w, nameEms(n)), 0);
    const CHROME = z(6) + z(4) + z(8);        // dot + gap + the row's own padding
    return Math.round(Math.min(z(220), Math.max(z(56), widest * nameSize + CHROME)));
  }, [data.people, contractors, users, nameSize, z]);
  const dayBg = String(data.dayBg || '#f1f5f9');
  const offBg = String(data.offBg || '#f5f3ff');
  const todayBg = String(data.todayBg || '#e0f2fe');
  const cellBg = String(data.cellBg || '#fbfcfd');
  const rowScale = frac(data.rowScale, 1, 0.6, 3);
  const cells = data.cells ?? {};
  const people = data.people ?? [];
  const offFrom = data.offFrom ?? {};
  /**
   * The settings panel writes flat keys, one per switch; the widget's own seed
   * uses a nested object. Both are read, so a planner placed before this and one
   * configured after it behave the same.
   */
  const d = data as PlannerData & Record<string, unknown>;
  /**
   * '1'/'0' from the settings panel, booleans from older seeds, missing means
   * the default. The old Hide value was '' — which is also what an untouched
   * select displays — so the panel showed Hide while the default showed them,
   * and the toggle read as broken.
   */
  const flag = (v: unknown, dflt: boolean): boolean =>
    v === '1' || v === true ? true : v === '0' || v === '' || v === false ? false : dflt;
  const holidayKinds = {
    jewish:  flag(d.holJewish,  data.holidays?.jewish ?? true),
    israeli: flag(d.holIsraeli, data.holidays?.israeli ?? true),
    secular: flag(d.holSecular, data.holidays?.secular ?? false),
  };
  const hebrewOn = flag(d.hebrew, false);

  /**
   * The trade dividers.
   *
   * Rows are grouped by what the person IS — drywall, AC, general, office,
   * free names — keeping each group's own order, with a subtle labeled line
   * between groups. Every visual property is a setting because the office
   * asked for exactly that; the defaults are deliberately quiet.
   */
  const divOn = (d.divOn ?? 'show') !== 'hide';
  const divStyle = {
    thick: Math.max(1, Math.min(6, Number(d.divThick) || 1)),
    color: typeof d.divColor === 'string' && d.divColor ? d.divColor : '#e2e8f0',
    textSize: z(Math.max(6, Math.min(14, Number(d.divTextSize) || 8))),
    weight: Number(d.divWeight) || 600,
    textColor: typeof d.divTextColor === 'string' && d.divTextColor ? d.divTextColor : '#94a3b8',
  };
  const categoryOf = (pid: string): string => {
    if (pid.startsWith('c:')) {
      const c = contractors.find(x => x.id === pid.slice(2));
      return c ? ({ drywall: 'Drywall', ac: 'AC', general: 'General' }[c.category] ?? 'General') : 'General';
    }
    if (pid.startsWith('u:')) return 'Office';
    return 'Others';
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

  /** Every week the notebook holds, hidden or not. */
  const runWeeks = useMemo(
    () => Array.from({ length: weekCount }, (_, i) => addDays(firstWeek, i * 7)),
    [firstWeek, weekCount],
  );

  const hiddenKeys = useMemo(() => {
    const raw = Array.isArray(data.hiddenWeeks) ? data.hiddenWeeks : [];
    return [...new Set(raw.filter((k): k is string => typeof k === 'string'))].sort();
  }, [data.hiddenWeeks]);
  const hidden = useMemo(() => new Set(hiddenKeys), [hiddenKeys]);

  /** What is drawn. */
  const weeks = useMemo(() => runWeeks.filter(w => !hidden.has(iso(w))), [runWeeks, hidden]);
  /**
   * Drawn OLDEST FIRST — the owner's reversal (2026-08-24, the secretary's
   * ask): a calendar reads downward, older weeks above, newer below, and the
   * newest-on-top experiment read as backwards to everybody using it. What
   * keeps the CURRENT week at the top is not the order: worked weeks get put
   * away with the eye (and come back the same way), and the notebook scrolls
   * itself to today's week when it opens — see the mount effect below.
   */
  const drawn = weeks;
  /** What has been put away, oldest first. */
  const hiddenInRun = useMemo(() => runWeeks.filter(w => hidden.has(iso(w))), [runWeeks, hidden]);

  /**
   * Putting a week away, and getting it back.
   *
   * Nothing is removed, unassigned or moved — the week keeps its place in the
   * run and its squares keep their cards, so showing it again shows exactly
   * what it held.
   *
   * NOT memoised, and neither is `addWeek`. `write` spreads the element's data
   * as it was when it was created, so a callback that captured an old one would
   * write that old data back — and since the notebook starts empty, adding a
   * week silently emptied every square that had been filled since. A plain
   * function always has the current one.
   */
  function hideWeek(key: string) {
    if (hidden.has(key)) return;
    write({ hiddenWeeks: [...hiddenKeys, key].sort() });
  }
  function showWeek(key: string) {
    write({ hiddenWeeks: hiddenKeys.filter(k => k !== key) });
  }

  /** Is there a week put away just off the top, or just off the bottom? */
  const firstShown = weeks[0] ? iso(weeks[0]) : null;
  const lastShown = weeks.length ? iso(weeks[weeks.length - 1]) : null;
  const hiddenAbove = hiddenInRun.map(iso).filter(k => !firstShown || k < firstShown);
  const hiddenBelow = hiddenInRun.map(iso).filter(k => !lastShown || k > lastShown);

  /**
   * Add a week before the first, or after the last.
   *
   * When a week has been put away in that direction, the plus brings THAT week
   * back — with everything that was written in it — rather than opening a blank
   * one beside it. Asking for a week after hiding one means "show it again",
   * which is exactly what the office asked for.
   */
  function addWeek(where: 'before' | 'after') {
    if (where === 'before') {
      // The nearest one first, so repeated presses walk back up the run.
      if (hiddenAbove.length) { showWeek(hiddenAbove[hiddenAbove.length - 1]); return; }
      write({ firstWeek: iso(addDays(firstWeek, -7)), weekCount: weekCount + 1 });
      return;
    }
    if (hiddenBelow.length) { showWeek(hiddenBelow[0]); return; }
    write({ firstWeek: iso(firstWeek), weekCount: weekCount + 1 });
  }

  const cellRefs = useRef(new Map<string, HTMLElement>());
  const [hover, setHover] = useState<RotaHit | null>(null);

  /**
   * This mounted notebook's own identity, which is NOT its element's id.
   *
   * A projection draws the MAIN notebook's element, so `el.id` is the same
   * string on two different nodes. Registering the drop probe under it meant
   * the second to mount replaced the first and unmounting either deregistered
   * both — see `registerRota`.
   */
  const probeId = useRef(`rota-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    /**
     * A notebook you cannot edit is not a drop target.
     *
     * The wallboard and the worker's portal both draw a notebook read-only,
     * and registering them meant a job could be moved from a screen nobody is
     * supposed to be arranging from. A PROJECTION is no longer in that
     * company: it takes drops like any other notebook and the write lands on
     * the main's element, which is what makes two of them one notebook.
     */
    if (ro) return;
    return registerRota(probeId, (x, y) => {
      for (const [key, node] of cellRefs.current) {
        const r = node.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          const [person, day] = key.split('|');
          return { elId: el.id, probeId, person, day };
        }
      }
      return null;
    });
  }, [el.id, probeId, ro, projection]);

  useEffect(
    () => onRotaHover(h => setHover(h?.probeId === probeId ? h : null)),
    [probeId],
  );

  const write = useCallback((patch: Partial<PlannerData>) => {
    update({ data: { ...(el.data ?? {}), ...patch } });
  }, [el.data, update]);

  /**
   * Undo, for the notebook.
   *
   * Everything here is `content` by the owner's rule — a square is somebody's
   * plan for a day, and putting one back or taking one away changes who is
   * expected where. So every one of these stops and says what it will do
   * before it does it, naming the actual job, person and day.
   */
  const track = useBoardTrack();
  /** How this square reads out loud: "Moshe · Tue 18 Aug". */
  const squareName = (key: string) => {
    const [person, day] = key.split('|');
    const who = personOf(person, contractors, users).name;
    const when = new Date(`${day}T00:00:00`);
    return `${who} · ${isNaN(when.getTime()) ? day : when.toLocaleDateString(undefined,
      { weekday: 'short', day: 'numeric', month: 'short' })}`;
  };
  /** The day alone, spelled out: "Friday 28 August" — no name in it. */
  const dayName = (key: string) => {
    const when = new Date(`${key.split('|')[1]}T00:00:00`);
    return isNaN(when.getTime()) ? key.split('|')[1]
      : when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  };
  /** What a card says: the job's name, or the words written on it. */
  const cardName = (e: PlannerEntry) =>
    (e.jobId ? jobById.get(e.jobId)?.displayName : undefined)
    || (e.text || '').trim()
    || 'that card';

  /**
   * How many squares in THIS notebook hold that job.
   *
   * The single test for "is this its last one", used by the X and by anything
   * else that has to know whether a removal takes the job off the notebook
   * altogether.
   */
  function squaresFor(jobId: string): number {
    return Object.values(cells)
      .reduce((n, list) => n + (list ?? []).filter(e => e.jobId === jobId).length, 0);
  }

  /**
   * Multi-day tasks on the notebook.
   *
   * A task that takes days is one record wearing one card per day, every card
   * carrying its taskId. Moving or removing a SINGLE day is deliberately
   * silent (the owner's locked decision): the day just moves, and the task's
   * own `days` list is rewritten to match, so the worker's schedule follows
   * the office's hand. The question card survives only on the task's LAST
   * remaining day — where the gesture means leaving the notebook. Only tasks
   * living in THIS workspace are edited; a foreign entry's task belongs to
   * its own workspace and its card keeps the ordinary asks.
   */
  const updateAssignment = useStore(st => st.updateContractorAssignment);
  const taskOf = (en: PlannerEntry) =>
    en.taskId && !en.projectId ? assignments.find(a => a.id === en.taskId) : undefined;
  /** How many squares in this notebook carry that task. */
  function taskSquares(taskId: string): number {
    return Object.values(cells)
      .reduce((n, list) => n + (list ?? []).filter(e => e.taskId === taskId).length, 0);
  }

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
   * A drag of an existing card, waiting to be told what it meant.
   *
   * `target` is null when the card was let go outside the notebook. Held as
   * state rather than acted on, because the three outcomes — move it, copy it,
   * take it off — are different enough that guessing from a modifier key took
   * jobs off the planner by accident.
   */
  const [dropAsk, setDropAsk] = useState<
    { fromKey: string; entry: PlannerEntry; target: RotaHit | null } | null>(null);

  /**
   * A dragged day of a MULTI-DAY task, waiting to be told what it meant.
   *
   * The owner's 2026-08-27 ruling replaces the earlier silent move with a
   * question in his own three labels: move this day, add this day to the
   * existing task, or a new task on this day. The day-number pills renumber
   * themselves from calendar order after any answer — they are labels, not
   * identities, so day one dragged past day two simply becomes the later day.
   */
  const [dayAsk, setDayAsk] = useState<
    { fromKey: string; entry: PlannerEntry; target: RotaHit } | null>(null);
  /** "New task on this day" — the standing task form, three-quarters filled in. */
  const [newTaskAsk, setNewTaskAsk] = useState<
    { entry: PlannerEntry; target: RotaHit } | null>(null);

  function resolveDayChoice(choice: DayChoice) {
    const ask = dayAsk;
    setDayAsk(null);
    if (!ask) return;
    if (choice === 'new') { setNewTaskAsk({ entry: ask.entry, target: ask.target }); return; }
    const t = taskOf(ask.entry);
    const fromDay = ask.fromKey.split('|')[1];
    if (choice === 'merge') {
      // The landing day is already one of the task's days: the dragged card
      // comes off and the task shrinks by that one day. Nothing else changes.
      track({
        weight: 'content',
        label: `Merged a day of ${cardName(ask.entry)}`,
        explain: `The card comes back onto ${squareName(ask.fromKey)}, and that day is `
          + 'put back on the task. The task itself is not otherwise touched.',
      }, () => setCell(ask.fromKey, (cells[ask.fromKey] ?? []).filter(x => x.id !== ask.entry.id)));
      if (t) {
        const upd = removeTaskDay(daysOf(t), fromDay);
        if (upd) updateAssignment(t.id, upd);
      }
      return;
    }
    // 'add' keeps the origin card and grows the task; 'move' rewrites the day.
    const landed = moveEntry(ask.fromKey, ask.entry, ask.target, choice === 'add');
    if (landed && t) {
      const upd = choice === 'add'
        ? addTaskDay(daysOf(t), ask.target.day)
        : moveTaskDay(daysOf(t), fromDay, ask.target.day);
      if (upd) updateAssignment(t.id, upd);
    }
  }

  /** Carry out whichever the office picked. */
  function resolveDrop(choice: 'move' | 'copy' | 'off') {
    const ask = dropAsk;
    setDropAsk(null);
    if (!ask) return;
    if (choice === 'off') {
      const drop = () => track({
        weight: 'content',
        label: `Took ${cardName(ask.entry)} off the notebook`,
        explain: `${cardName(ask.entry)} goes back onto ${squareName(ask.fromKey)} in the weekly `
          + 'notebook, and comes back off the board. Nothing about the job itself changes.',
      }, () => setCell(
        ask.fromKey,
        (cells[ask.fromKey] ?? []).filter(x => x.id !== ask.entry.id),
      ));
      // A task attached to the slot is its own question, asked as it always was.
      if (ask.entry.taskId && onRemoveTask) onRemoveTask(ask.entry, () => drop());
      else drop();
      return;
    }
    // "Leave it where it was" for a drop outside: there is nowhere to move to,
    // so doing nothing IS the answer.
    if (!ask.target) return;
    const landed = moveEntry(ask.fromKey, ask.entry, ask.target, choice === 'copy');
    // The task follows its card: a moved day is rewritten in `days`, a copied
    // one is added — so the worker's schedule always says what the sheet says.
    const t = landed ? taskOf(ask.entry) : undefined;
    if (t) {
      const fromDay = ask.fromKey.split('|')[1];
      const upd = choice === 'copy'
        ? addTaskDay(daysOf(t), ask.target.day)
        : moveTaskDay(daysOf(t), fromDay, ask.target.day);
      if (upd) updateAssignment(t.id, upd);
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
  function moveEntry(fromKey: string, entry: PlannerEntry, target: RotaHit, copy: boolean): boolean {
    const toKey = cellKey(target.person, target.day);
    if (toKey === fromKey) return false;
    let landed = false;
    track({
      weight: 'content',
      label: copy
        ? `Put a copy of ${cardName(entry)} on ${squareName(toKey)}`
        : `Moved ${cardName(entry)} to ${squareName(toKey)}`,
      explain: copy
        ? `The copy on ${squareName(toKey)} is taken away again. The original on `
          + `${squareName(fromKey)} stays exactly where it is.`
        : `${cardName(entry)} goes back to ${squareName(fromKey)} and comes off `
          + `${squareName(toKey)}. Nothing about the job itself changes.`,
    }, () => { landed = moveEntryNow(fromKey, entry, copy, toKey); });
    return landed;
  }

  function moveEntryNow(
    fromKey: string, entry: PlannerEntry, copy: boolean, toKey: string,
  ): boolean {
    const next = { ...cells };
    if (!copy) {
      const left = (next[fromKey] ?? []).filter(x => x.id !== entry.id);
      if (left.length) next[fromKey] = left; else delete next[fromKey];
    }
    const landing = next[toKey] ?? [];
    // The same job twice in ONE square says nothing the first one did not.
    if (entry.jobId && landing.some(e => e.jobId === entry.jobId)) return false;
    next[toKey] = [...landing, { ...entry, id: newEntryId() }];
    write({ cells: next });
    return true;
  }

  /**
   * The workspaces, and the two writers a cross-workspace card needs.
   *
   * Read here rather than passed in: the notebook is drawn from a widget
   * registry entry whose context is scoped to ONE workspace on purpose, and
   * threading these through it would widen that context for every widget.
   */
  const projects = useStore(st => st.projects);
  const currentProjectId = useStore(st => st.currentProjectId);
  const setCurrentProject = useStore(st => st.setCurrentProject);
  const setPendingFocus = useStore(st => st.setPendingFocus);
  // Re-read foreign snapshots when a missing one arrives from the cloud.
  const snapTick = useStore(st => st.snapshotTick);

  const jobById = useMemo(() => {
    const m = new Map<string, Apartment>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  /**
   * Jobs on this sheet that belong to ANOTHER workspace.
   *
   * The office plans across all three, so a Wolfson apartment can sit on the
   * same week as the Job Board's own work. Only the open workspace is live, so
   * a foreign job is read from that workspace's last stored snapshot — the same
   * source the Building Progress widget and the all-workspace calendar use, and
   * the same limitation: it is whatever this machine last saw.
   *
   * Keyed by `${projectId}:${jobId}` so two workspaces cannot collide, and
   * built only from the ids actually referenced — never by loading everything.
   */
  const foreign = useMemo(() => {
    const want = new Map<string, Set<string>>();
    for (const list of Object.values(data.cells ?? {})) {
      for (const e of list ?? []) {
        if (!e?.jobId || !e.projectId) continue;
        const set = want.get(e.projectId) ?? new Set<string>();
        set.add(e.jobId);
        want.set(e.projectId, set);
      }
    }
    const out = new Map<string, { job: Apartment; workspace: string }>();
    for (const [pid, ids] of want) {
      const snap = loadProjectSnapshot(pid);
      const name = projects.find(p => p.id === pid)?.name ?? pid;
      for (const j of snap.apartments) {
        if (ids.has(j.id)) out.set(`${pid}:${j.id}`, { job: j, workspace: name });
      }
    }
    return out;
  }, [data.cells, projects, snapTick]);

  /** The job a card is pointing at, wherever it lives. */
  const resolve = (en: PlannerEntry): { job?: Apartment; workspace?: string } => {
    if (!en.jobId) return {};
    if (!en.projectId) return { job: jobById.get(en.jobId) };
    const hit = foreign.get(`${en.projectId}:${en.jobId}`);
    return { job: hit?.job, workspace: hit?.workspace ?? en.projectId };
  };

  /**
   * ASSIGNED TASKS appear on the notebook by themselves — the owner's ask:
   * "if I assign a task to someone, it should show up in the weekly notebook".
   *
   * DERIVED, never stored: an open task with a due date and a worker is drawn
   * as a chip in that worker's square on that day, from EVERY workspace — the
   * open one live, the others from their snapshots on this machine (workers
   * are global, so the same person's row collects all of it). A chip is the
   * task showing itself, not a planner card: it moves by changing the task's
   * date or worker where the task lives, and it disappears when the task is
   * done. A task the office already placed BY HAND carries its taskId on a
   * planner entry, and that task gets no chip — one thing, drawn once.
   * `showTasks` in the pencil turns the whole layer off.
   */
  const tasksOn = flag(d.showTasks, true);
  const taskChips = useMemo(() => {
    const map = new Map<string, {
      id: string; desc: string; label: string; jobId: string;
      projectId?: string; workspace?: string;
    }[]>();
    if (!tasksOn) return map;
    const rows = new Set(people.filter(p => p.startsWith('c:')).map(p => p.slice(2)));
    if (!rows.size) return map;
    const linked = new Set<string>();
    for (const list of Object.values(cells)) {
      for (const e of list ?? []) if (e?.taskId) linked.add(e.taskId);
    }
    const put = (a: ContractorAssignment, apts: Apartment[], pid?: string, ws?: string) => {
      if (!a.dueDate || a.completedAt || !a.contractorId) return;
      if (!rows.has(a.contractorId) || linked.has(a.id)) return;
      const apt = apts.find(x => x.id === a.apartmentId);
      // A task that takes days shows itself on EVERY one of them — it carries
      // all its days now, and one chip on the last day was the old world.
      for (const day of daysOf(a).map(d => String(d).slice(0, 10))) {
        const key = `c:${a.contractorId}|${day}`;
        const list = map.get(key) ?? [];
        list.push({
          id: a.id,
          desc: (a.taskDescription ?? '').trim(),
          label: apt ? (aptLabel(apt) || apt.address?.trim() || 'Job') : 'Job',
          jobId: a.apartmentId,
          projectId: pid, workspace: ws,
        });
        map.set(key, list);
      }
    };
    assignments.forEach(a => put(a, jobs));
    for (const p of projects) {
      if (p.id === currentProjectId) continue;
      const snap = loadProjectSnapshot(p.id);
      (snap.assignments ?? []).forEach(a => put(a, snap.apartments, p.id, p.name));
    }
    return map;
  }, [tasksOn, people, cells, assignments, jobs, projects, currentProjectId, snapTick]);

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
  // `weeks[0]` can be missing — every week can be put away — so the run's own
  // first week stands in rather than the label reading "Invalid Date".
  // Oldest first again, so the first visible week is the one at the top.
  const [shownMonth, setShownMonth] = useState<string>(
    () => monthKey(weeks[0] ?? firstWeek));

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

  // `weeks.length` as well as the run's length: putting a week away or bringing
  // one back changes which week is topmost without the run changing at all, and
  // the month at the top would otherwise still name the week that was hidden.
  useEffect(() => { readMonth(); }, [readMonth, weekCount, weeks.length]);

  /** Scroll so a given week's top sits at the top of the notebook. */
  const scrollToWeek = useCallback((key: string, smooth = true) => {
    const node = weekRefs.current.get(key);
    const box = scrollRef.current;
    if (node && box) {
      // Offsets, not client rects: the widget sits inside a scale transform,
      // so rect deltas are in screen pixels while scrollTop is in local ones.
      // The scroller itself is not positioned, so both offsetTops measure
      // against the same ancestor and the difference is the position INSIDE
      // the scroller — bare node.offsetTop also counted the header above it.
      box.scrollTo({ top: node.offsetTop - box.offsetTop - 4, behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  /**
   * The notebook OPENS on the current week.
   *
   * Weeks draw oldest-first (a calendar reads downward), so without this a
   * season-long notebook opened on last winter and today's week lived at the
   * bottom of a scroll. Today's week when the run holds it, else the newest
   * week — the closest thing to today the notebook has. Once, on mount, after
   * layout; a person's own scrolling is never fought.
   */
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    const id = requestAnimationFrame(() => {
      // Marked done INSIDE the frame, not before it: StrictMode runs
      // mount → cleanup → mount, and a guard set before the frame fires is
      // a guard that cancels the scroll and then refuses the retry.
      openedRef.current = true;
      const wk = iso(weekStartOf(new Date(), weekStart));
      const target = weekRefs.current.has(wk)
        ? wk
        : weeks.length ? iso(weeks[weeks.length - 1]) : null;
      if (target) scrollToWeek(target, false);
      readMonth();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = new Date(`${shownMonth}-01T00:00:00`)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* The header row scrolls sideways rather than pushing its buttons off
          the edge. Squeezed narrow, the month arrows and the show-all button
          used to sit outside the node with nothing to reach them by. */}
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 flex-shrink-0 overflow-x-auto widget-scroll">
        <CalendarDays size={12} className="text-gray-400 flex-shrink-0" />
        <span className="font-extrabold tracking-wide text-gray-500 truncate"
          style={{ fontSize: Math.max(z(9), textSize - z(1)) }}>
          {title.toUpperCase()}
        </span>
        <span className="px-1.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0 tabular-nums"
          style={{ fontSize: Math.max(z(8), textSize - z(2)) }}>{label}</span>
        <span className="flex-1" />
        {/* The ‹ Today › cluster is gone, per the owner — nobody knew what it
            was for. The notebook opens on the current week by itself, and each
            week's label row carries its own tiny up/down scrollers. */}
        {!ro && onShowAll && (
          <button data-no-drag data-el-action onClick={onShowAll} title="Show every job in the schedule"
            className="p-0.5 rounded text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100">
            <Maximize2 size={12} />
          </button>
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
        {/* The PUT AWAY strip and the two full-width add-week rows are gone,
            per the owner — a whole banner naming every hidden week was chrome
            spent on a rare action. Adding and restoring weeks now lives in the
            tiny icons beside each week's put-away eye; only the pathological
            everything-is-hidden case still needs a way back drawn here. */}
        {!ro && weeks.length === 0 && (
          <div className="text-center text-gray-400 leading-snug py-6 px-4 flex flex-col items-center gap-2"
            style={{ fontSize: textSize }}>
            <span>Every week is put away. Nothing in them was removed.</span>
            <button data-no-drag data-el-action onClick={() => write({ hiddenWeeks: [] })}
              className="px-2.5 py-1 rounded-full border border-gray-200 font-bold text-gray-500
                         hover:text-[#1e3a5f] hover:border-[#cbd5e1]"
              style={{ fontSize: Math.max(z(8), textSize - z(1)) }}>
              Bring them back
            </button>
          </div>
        )}

        {drawn.map((wkStart, wi) => {
          const days = Array.from({ length: span }, (_, i) => addDays(wkStart, i));
          // The name column is as wide as the NAMES, not a share of the sheet.
          // It used to be `0.85fr`, so a row of five short names spent a tenth
          // of the paper saying "Max" — and the days, which are what the sheet
          // is for, were squeezed to pay for it.
          const cols = `${nameColW}px repeat(${span}, minmax(0, 1fr))`;
          // A rule wherever the month changes, so the run reads as months
          // rather than as an undifferentiated column of weeks.
          const newMonth = wi > 0 && monthKey(wkStart) !== monthKey(drawn[wi - 1]);
          return (
            <div
              key={iso(wkStart)}
              ref={node => { if (node) weekRefs.current.set(iso(wkStart), node);
                             else weekRefs.current.delete(iso(wkStart)); }}
              className={`group/wk ${wi ? 'mt-2.5' : ''}`}
            >
              {newMonth && (
                <div className="flex items-center gap-2 my-2">
                  <span className="h-px flex-1" style={{ backgroundColor: '#cbd5e1' }} />
                  {/* A little bigger than the body text, per the owner — the
                      month rule is the landmark the eye scans for. */}
                  <span className="font-black tracking-wide text-slate-500"
                    style={{ fontSize: Math.max(z(10), textSize + z(2)) }}>
                    {wkStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase()}
                  </span>
                  <span className="h-px flex-1" style={{ backgroundColor: '#cbd5e1' }} />
                </div>
              )}
              <div className="grid gap-px mb-px" style={{ gridTemplateColumns: cols }}>
                {/* The week's own label cell, rebuilt to the owner's layout
                    (2026-08-24): the MONTH big and bold on top — "AUG 22" at
                    the same size as the day numbers beside it, filling the
                    white space that used to hold seven-point type — tiny
                    up/down scrollers inline after it, and the week's controls
                    on their own line underneath, grown and spread out because
                    at 11px in a huddle they were hard to press. */}
                <div className="flex flex-col justify-end gap-0.5 pb-0.5 min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="truncate leading-none">
                      <span className="font-black tracking-wide" style={{ fontSize: dateSize, color: '#334155' }}>
                        {wkStart.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
                      </span>
                      <span className="font-bold tabular-nums" style={{ fontSize: dateSize, color: '#94a3b8' }}>
                        {' '}{wkStart.getDate()}
                      </span>
                    </span>
                    <span className="flex-1" />
                    {/* Just scrollers, nothing more: up shows the week above,
                        down the week below. They replace the ‹ Today › cluster
                        nobody understood. Always visible — navigation is not a
                        control to hunt for. */}
                    {wi > 0 && (
                      <button
                        data-no-drag data-el-action data-week-up
                        onClick={() => scrollToWeek(iso(drawn[wi - 1]))}
                        title="Scroll to the week above"
                        className="flex-shrink-0 text-gray-300 hover:text-[#1e3a5f]"
                      >
                        <ChevronUp size={Math.max(11, Math.round(z(12)))} />
                      </button>
                    )}
                    {wi < drawn.length - 1 && (
                      <button
                        data-no-drag data-el-action data-week-down
                        onClick={() => scrollToWeek(iso(drawn[wi + 1]))}
                        title="Scroll to the week below"
                        className="flex-shrink-0 text-gray-300 hover:text-[#1e3a5f]"
                      >
                        <ChevronDown size={Math.max(11, Math.round(z(12)))} />
                      </button>
                    )}
                  </div>
                  {/* OLDEST FIRST again, so the TOP week (drawn index 0)
                      carries the plus that adds an OLDER week and the BOTTOM
                      one adds a NEWER week — the direction a calendar reads
                      in. A week put away in that direction turns the plus
                      into an eye that restores it, wording and all. */}
                  {/* ALWAYS visible, like the scroll arrows beside them. They
                      were opacity-0 group-hover/wk:opacity-100 — and the
                      touch-screen reveal rule in index.css only matches the
                      UNNAMED group-hover class, so on an iPad the add-a-week
                      plus never appeared at all: the owner's "I can't add a
                      week in the future". A control for navigating time is
                      not a control to hunt for. */}
                  {!ro && (
                    <span className="flex items-center gap-1.5">
                      {wi === 0 && (
                        <button
                          data-no-drag data-el-action
                          onClick={() => addWeek('before')}
                          title={hiddenAbove.length
                            ? 'Bring back the week before — everything in it comes with it'
                            : 'Add the week before this one'}
                          className="text-gray-300 hover:text-[#1e3a5f]"
                        >
                          {hiddenAbove.length
                            ? <Eye size={Math.max(13, Math.round(z(14)))} />
                            : <Plus size={Math.max(13, Math.round(z(14)))} />}
                        </button>
                      )}
                      {wi === drawn.length - 1 && (
                        <button
                          data-no-drag data-el-action
                          onClick={() => addWeek('after')}
                          title={hiddenBelow.length
                            ? 'Bring back the next week — everything in it comes with it'
                            : 'Add the week after this one'}
                          className="text-gray-300 hover:text-[#1e3a5f]"
                        >
                          {hiddenBelow.length
                            ? <Eye size={Math.max(13, Math.round(z(14)))} />
                            : <Plus size={Math.max(13, Math.round(z(14)))} />}
                        </button>
                      )}
                      <button
                        data-no-drag data-el-action
                        onClick={() => hideWeek(iso(wkStart))}
                        title="Put this week away — nothing in it is removed, and adding the week back brings it all with it"
                        className="text-gray-300 hover:text-[#1e3a5f]"
                      >
                        <EyeOff size={Math.max(13, Math.round(z(14)))} />
                      </button>
                    </span>
                  )}
                </div>
                {days.map(dt => {
                  const key = iso(dt);
                  const isToday = key === todayIso;
                  const hols: Holiday[] = holidaysOn(dt, holidayKinds);
                  const off = hols.some(h => h.noWork);
                  return (
                    <div key={key} className="px-1 py-0.5 rounded-t-md leading-tight"
                      style={{
                        backgroundColor: isToday ? todayBg : off ? offBg : dayBg,
                      }}>
                      {/* The NUMBER first and largest, the weekday under it —
                          that is the order somebody reads a rota in. */}
                      <div className="truncate tabular-nums font-black"
                        style={{ fontSize: dateSize, color: isToday ? '#0369a1' : '#334155' }}>
                        {dt.getDate()}
                        <span className="font-normal" style={{ fontSize: Math.max(z(7), dateSize - z(4)), color: '#94a3b8' }}>
                          {' '}{dt.toLocaleDateString(undefined, { month: 'short' })}
                        </span>
                      </div>
                      <div className="font-bold truncate"
                        style={{ fontSize: daySize, color: isToday ? '#0369a1' : '#64748b' }}>
                        {span > 5 ? SHORT_DAYS[dt.getDay()] : DAY_NAMES[dt.getDay()]}
                        {hebrewOn && (
                          <span className="font-normal" style={{ color: '#94a3b8' }}> · {hebrewLabel(dt)}</span>
                        )}
                      </div>
                      {hols.length > 0 && (
                        <div className="truncate font-bold"
                          style={{ fontSize: Math.max(z(7), daySize - z(3)), color: '#7c3aed' }}
                          title={hols.map(h => h.name).join(' · ')}>
                          {hols.map(h => h.name).join(' · ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {(() => {
                const visible = people.filter(pid => rowVisible(pid, days));
                if (!divOn) return visible.map(pid => ({ pid, divider: null as string | null }));
                // Group by trade, keeping each group's own order; a divider
                // only ever sits BETWEEN groups, and only when there are two.
                const order: string[] = [];
                const byCat = new Map<string, string[]>();
                visible.forEach(pid => {
                  const cat = categoryOf(pid);
                  if (!byCat.has(cat)) { byCat.set(cat, []); order.push(cat); }
                  byCat.get(cat)!.push(pid);
                });
                if (order.length < 2) return visible.map(pid => ({ pid, divider: null as string | null }));
                const rows: { pid: string; divider: string | null }[] = [];
                order.forEach((cat, gi) => {
                  byCat.get(cat)!.forEach((pid, i) => {
                    rows.push({ pid, divider: gi > 0 && i === 0 ? cat : null });
                  });
                });
                return rows;
              })().map(({ pid, divider }) => {
                const person = personOf(pid, contractors, users);
                return (
                  <React.Fragment key={pid}>
                  {divider && (
                    <div className="flex items-center gap-1.5 py-0.5 select-none" aria-hidden="true">
                      <span className="uppercase tracking-wider flex-shrink-0"
                        style={{ fontSize: divStyle.textSize, fontWeight: divStyle.weight, color: divStyle.textColor }}>
                        {divider}
                      </span>
                      <span className="flex-1" style={{ height: divStyle.thick, backgroundColor: divStyle.color }} />
                    </div>
                  )}
                  <div className="grid gap-px mb-px" style={{ gridTemplateColumns: cols }}>
                    <div className="flex items-start gap-1 px-1 py-1 rounded-l-md min-w-0"
                      style={{ backgroundColor: tint(person.color, 0.10) }}>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
                        style={{ backgroundColor: person.color }} />
                      <span className="truncate font-bold" style={{ fontSize: nameSize, color: '#334155' }}>
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
                            // Through `z` as well, or the sheet's type grows
                            // and the square it sits in does not.
                            minHeight: z(SLOT_H) * rowScale,
                            backgroundColor: lit ? '#dbeafe'
                              : state === 'ending' ? '#f1f5f9' : cellBg,
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
                              job={resolve(en).job}
                              workspace={resolve(en).workspace}
                              stages={stages}
                              assignments={assignments}
                              color={person.color}
                              size={textSize}
                              scale={scale}
                              bold={data.bold}
                              readOnly={ro || state === 'ending'}
                              openOnly={!!projection}
                              onOpen={() => {
                                if (!en.jobId) return;
                                // Another workspace's job PEEKS — the owner's
                                // rule: clicking it must not carry you off the
                                // board you are standing on. Only when the host
                                // offers no peek does the old travel (switch
                                // first, then the intent — setCurrentProject
                                // clears a pending focus on arrival) remain.
                                if (en.projectId && en.projectId !== currentProjectId) {
                                  if (openUnit) { openUnit(en.projectId, en.jobId); return; }
                                  setCurrentProject(en.projectId);
                                  setPendingFocus({ kind: 'apartment', id: en.jobId });
                                  return;
                                }
                                openJob(en.jobId);
                              }}
                              day={day}
                              onText={v => setCell(key, entries.map(x => (x.id === en.id ? { ...x, text: v } : x)))}
                              onRemove={() => {
                                /**
                                 * One day of a multi-day task comes off SILENTLY (the
                                 * locked decision): the entry goes, the day is rewritten
                                 * out of the task, and the task carries on on its other
                                 * days. The questions below are for last-remaining days.
                                 */
                                const t = taskOf(en);
                                if (t && taskSquares(t.id) > 1) {
                                  track({
                                    weight: 'content',
                                    label: `Took a day of ${cardName(en)} off the notebook`,
                                    explain: `${cardName(en)} goes back onto ${squareName(key)} — one of the `
                                      + 'days its task covers. The task itself keeps its other days.',
                                  }, () => setCell(key, entries.filter(x => x.id !== en.id)));
                                  const upd = removeTaskDay(daysOf(t), day);
                                  if (upd) updateAssignment(t.id, upd);
                                  return;
                                }
                                /**
                                 * The X on a job's LAST square is a decision, so it asks.
                                 *
                                 * Taking that square away is the job LEAVING the notebook and
                                 * going back on the board — a different act from tidying one of
                                 * several days it sits on, and the office should be told which
                                 * one is about to happen. With copies elsewhere the job is not
                                 * going anywhere, so there is nothing to ask about and the
                                 * square just goes.
                                 *
                                 * It raises the SAME question a drag off the notebook raises —
                                 * `target: null` is the off-the-notebook branch of the drop
                                 * dialog — so the two ways of doing one thing cannot drift
                                 * into asking it differently.
                                 */
                                if (en.jobId && squaresFor(en.jobId) <= 1) {
                                  setDropAsk({ fromKey: key, entry: en, target: null });
                                  return;
                                }
                                const drop = () => track({
                                  weight: 'content',
                                  label: `Took ${cardName(en)} off ${squareName(key)}`,
                                  explain: `${cardName(en)} goes back onto ${squareName(key)} in the weekly `
                                    + 'notebook, exactly as it was. The job itself is not touched — it is '
                                    + 'still on the notebook on its other days.',
                                }, () => setCell(key, entries.filter(x => x.id !== en.id)));
                                if (en.taskId && onRemoveTask) onRemoveTask(en, () => drop());
                                else drop();
                              }}
                              onDragOff={() => {
                                // Dragging ONE day of a multi-day task off the sheet
                                // takes just that day, silently — the same act as its X.
                                const t = taskOf(en);
                                if (t && taskSquares(t.id) > 1) {
                                  track({
                                    weight: 'content',
                                    label: `Took a day of ${cardName(en)} off the notebook`,
                                    explain: `${cardName(en)} goes back onto ${squareName(key)} — one of the `
                                      + 'days its task covers. The task itself keeps its other days.',
                                  }, () => setCell(key, entries.filter(x => x.id !== en.id)));
                                  const upd = removeTaskDay(daysOf(t), day);
                                  if (upd) updateAssignment(t.id, upd);
                                  return;
                                }
                                setDropAsk({ fromKey: key, entry: en, target: null });
                              }}
                              onDragTo={(target, copy) => {
                                const t = taskOf(en);
                                // Ctrl/⌘ still copies outright — a shortcut for
                                // anybody who knows it. A copied task card adds
                                // its landing day to the task.
                                if (copy) {
                                  const landed = moveEntry(key, en, target, true);
                                  if (landed && t) {
                                    const upd = addTaskDay(daysOf(t), target.day);
                                    if (upd) updateAssignment(t.id, upd);
                                  }
                                  return;
                                }
                                /**
                                 * A single day of a multi-day task ASKS — the owner's
                                 * 2026-08-27 ruling, superseding the earlier silent
                                 * move: move this day, add this day to the task, or a
                                 * new task on this day. Dropping the card back on its
                                 * own square still means nothing and asks nothing.
                                 */
                                if (t && taskSquares(t.id) > 1) {
                                  if (cellKey(target.person, target.day) === key) return;
                                  setDayAsk({ fromKey: key, entry: en, target });
                                  return;
                                }
                                // A plain drag asks, because the same gesture used
                                // to mean three very different things silently.
                                setDropAsk({ fromKey: key, entry: en, target });
                              }}
                            />
                          ))}
                          {/* Tasks with this day and this worker on them —
                              drawn dashed, because they are the TASK showing
                              itself, not a planner card: change the task's
                              date or worker where the task lives and the chip
                              follows. Clicking opens the job — a PEEK when it
                              lives in another workspace, so you stay put.
                              A chip whose JOB already has a card in this same
                              square is folded into that card (which lists the
                              job's tasks itself now) — the owner's "separate
                              tiles for tasks and for the job". */}
                          {(taskChips.get(key) ?? [])
                            .filter(t => !entries.some(en => en.jobId === t.jobId))
                            .map(t => (
                            <button
                              key={t.id}
                              data-no-drag data-el-action
                              onClick={() => {
                                if (t.projectId && t.projectId !== currentProjectId) {
                                  if (openUnit) { openUnit(t.projectId, t.jobId); return; }
                                  setCurrentProject(t.projectId);
                                  setPendingFocus({ kind: 'apartment', id: t.jobId });
                                  return;
                                }
                                openJob(t.jobId);
                              }}
                              title="From the task list — change its day or worker on the task itself"
                              className="w-full text-left rounded-md px-1.5 py-1 min-w-0"
                              style={{
                                border: '1px dashed rgba(15,23,42,.28)',
                                backgroundColor: 'rgba(255,255,255,.65)',
                              }}
                            >
                              <span className="flex items-start gap-1 min-w-0">
                                <ClipboardList
                                  size={Math.max(9, Math.round(z(10)))}
                                  className="flex-shrink-0 mt-0.5 text-slate-400"
                                />
                                <span className="flex-1 min-w-0">
                                  <span className="block truncate"
                                    style={{ fontSize: textSize, fontWeight: 700, color: '#334155' }}>
                                    {t.workspace && (
                                      <span style={{ color: '#7c3aed' }}>{t.workspace} · </span>
                                    )}
                                    {t.label}
                                  </span>
                                  {t.desc && (
                                    <span className="block truncate font-medium"
                                      style={{ fontSize: Math.max(z(7), textSize - z(2)), color: '#64748b' }}>
                                      {t.desc}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                          ))}
                          {!ro && state === 'on' && (
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
                  </React.Fragment>
                );
              })}
            </div>
          );
        })}
        </>}
      </div>

      {/* What that drag meant. Rendered through a portal at the top of the
          page: the notebook is a board node inside a transformed, scrolling
          world, and a dialog drawn in there is clipped by its own widget. */}
      {dropAsk && createPortal(
        <PlannerDropDialog
          jobName={
            (dropAsk.entry.jobId ? jobById.get(dropAsk.entry.jobId) : undefined)
              ?.displayName || 'This job'
          }
          canLand={!!dropAsk.target}
          toWhere={dropAsk.target
            ? `${personOf(dropAsk.target.person, contractors, users).name} · ${
              new Date(`${dropAsk.target.day}T00:00:00`)
                .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}`
            : undefined}
          onCancel={() => setDropAsk(null)}
          onDone={resolveDrop}
        />,
        document.body,
      )}

      {/* What dragging ONE DAY of a multi-day task meant — same portal rule. */}
      {dayAsk && (() => {
        const t = taskOf(dayAsk.entry);
        const fromDay = dayAsk.fromKey.split('|')[1];
        const days = t ? daysOf(t) : [];
        const num = t ? dayNumberOf(days, fromDay) : null;
        return createPortal(
          <PlannerDayDialog
            jobName={cardName(dayAsk.entry)}
            dayNum={num?.k ?? 1}
            dayCount={days.length || 1}
            fromLabel={squareName(dayAsk.fromKey)}
            toLabel={squareName(cellKey(dayAsk.target.person, dayAsk.target.day))}
            toDay={dayName(cellKey(dayAsk.target.person, dayAsk.target.day))}
            covered={dayAsk.target.day !== fromDay && days.includes(dayAsk.target.day)}
            onCancel={() => setDayAsk(null)}
            onDone={resolveDayChoice}
          />,
          document.body,
        );
      })()}

      {/* "New task on this day": the standing task form, three-quarters filled
          in — the dragged card never moved, and the form's own days place one
          card per day on the target person's row. */}
      {newTaskAsk && (() => {
        const job = newTaskAsk.entry.jobId ? jobById.get(newTaskAsk.entry.jobId) : undefined;
        if (!job) return null;
        const who = personOf(newTaskAsk.target.person, contractors, users);
        return createPortal(
          <PlannerTaskDialog
            job={job}
            person={who}
            dayIso={newTaskAsk.target.day}
            stages={stages}
            contractors={contractors}
            onCancel={() => setNewTaskAsk(null)}
            onDone={(taskId, taskDays) => {
              /**
               * The store queues its "this job is on the planner and just got
               * a dated task" question (plannerAsk) the moment the dialog
               * creates the task — right for a task typed elsewhere, and
               * exactly wrong here: this task was made FROM the planner and
               * its day cards are placed two lines down. Left standing, the
               * modal's backdrop silently swallowed every later press on the
               * board. Answer it as "leave the planner alone" ourselves.
               */
              const queued = useStore.getState().plannerAsk;
              if (queued && queued.jobId === newTaskAsk.entry.jobId) {
                useStore.getState().answerPlannerAsk('skip');
              }
              const person = newTaskAsk.target.person;
              const dds = taskDays?.length ? taskDays : [newTaskAsk.target.day];
              track({
                weight: 'content',
                label: `Planned a new task for ${cardName(newTaskAsk.entry)}`,
                explain: `The new task's day cards come back off the notebook. The task `
                  + 'itself stays on the job either way.',
              }, () => {
                const next = { ...cells };
                for (const dd of dds) {
                  const k2 = cellKey(person, dd);
                  const landing = next[k2] ?? [];
                  // The same job twice in ONE square says nothing — its card
                  // lists the job's tasks itself, so the new task shows there.
                  if (landing.some(e => e.jobId === job.id)) continue;
                  next[k2] = [...landing, {
                    id: newEntryId(), jobId: job.id, ...(taskId ? { taskId } : {}),
                  }];
                }
                write({ cells: next });
              });
              setNewTaskAsk(null);
            }}
          />,
          document.body,
        );
      })()}
    </div>
  );
}

/** The month a date belongs to, as `YYYY-MM`. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// AddWeekRow is gone: adding and restoring weeks lives in the tiny icons
// beside each week's put-away eye, which is where the owner asked for it —
// two full-width rows of chrome bought nothing the icons do not.

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
  entry, job, workspace, stages, assignments, color, size, scale = 1, bold, readOnly, openOnly,
  day, onOpen, onText, onRemove, onDragOff, onDragTo,
}: {
  entry: PlannerEntry;
  job?: Apartment;
  /** The day this card sits on — what the "day 2 of 3" pill is counted from. */
  day?: string;
  /**
   * Set when the job belongs to ANOTHER workspace.
   *
   * Shown as a small tag on the card, because "Artzi" on the Job Board's sheet
   * and "Artzi" in Wolfson are two different answers to "where am I going
   * today", and a card that does not say which is worse than no card.
   */
  workspace?: string;
  stages: Stage[];
  assignments: ContractorAssignment[];
  color: string;
  size: number;
  /** The sheet's scale, so the card's own floors move with it. */
  scale?: number;
  bold?: boolean;
  readOnly?: boolean;
  /** Read-only, but a job still opens on a click — a projection. */
  openOnly?: boolean;
  onOpen: () => void;
  onText: (v: string) => void;
  onRemove: () => void;
  /** Dropped outside the planner entirely — back to the board. */
  onDragOff?: () => void;
  /** Dropped on another square. `copy` leaves this one where it is. */
  onDragTo?: (target: RotaHit, copy: boolean) => void;
}) {
  const [v, setV] = useState(entry.text ?? '');
  useEffect(() => setV(entry.text ?? ''), [entry.text]);

  const z = (n: number) => n * scale;

  /**
   * Dragging a card from one square to another.
   *
   * Four pixels of travel separates a drag from a press, so a single click
   * still picks a card and a double click still opens the job. The hover
   * highlight is the same one a board tile lights when it passes over a
   * square, because it is the same registry answering.
   */
  const drag = useRef<{ x: number; y: number; live: boolean } | null>(null);
  const [held, setHeld] = useState(false);
  /**
   * A projection gets ONE of the four gestures back.
   *
   * Everything that would change the notebook is gone, but a job in a square
   * still opens on a click — which is the point of putting a second copy on a
   * screen somebody is standing in front of.
   */
  /**
   * ANY job card opens on a click when the drag handlers are not installed —
   * not only a projection's. This was gated on `openOnly`, so a READ-ONLY
   * planner (the TV wall, a view-only board) rendered its cards with no
   * handler at all: the owner's "I press an apartment inside the notebook…
   * nothing is clicking". The hosts whose taps must stay inert (the worker's
   * portal) pass a no-op openJob/openUnit, so the gate belongs there, not
   * here. When the card is editable the drag handlers replace these and
   * their pointerup does the opening.
   */
  const openHandlers = entry.jobId
    ? { onClick: (e: React.MouseEvent) => {
        if (!(e.target as HTMLElement).closest('a,[data-card-action]')) onOpen();
      } }
    : {};
  const dragHandlers = readOnly || !onDragTo ? openHandlers : {
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
      // Held and moving: the card goes see-through, so what is UNDER the hand
      // — the square it will land in — is what the eye reads.
      setHeld(true);
      setRotaHover(rotaCellAt(e.clientX, e.clientY));
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      setHeld(false);
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
      if (target) { onDragTo!(target, e.ctrlKey || e.metaKey); return; }
      /**
       * Released with no square under the hand: OFF the calendar.
       *
       * A job card dropped outside the planner goes back to the board — the
       * same act as removing its last square, through the same onRemove path
       * so the take-a-task-off question still fires when one is attached.
       * Free words stay put: they have no board to return to.
       */
      if (entry.jobId && onDragOff) onDragOff();
    },
    onPointerCancel: () => { drag.current = null; setHeld(false); setRotaHover(null); },
  };

  if (entry.jobId) {
    const stage = stages.find(s => s.id === job?.currentStageId);
    const open = assignments.filter(a => a.apartmentId === job?.id && !a.completedAt);
    const pending = open.length;
    /**
     * The task behind THIS card, for the multi-day dress: the "day 2 of 3"
     * pill, and — once the task is closed — the strike through the card,
     * which is the record: "done" on days worked, "finished early" on the
     * days ahead the worker said he will not need. Nothing is deleted.
     */
    const cardTask = entry.taskId ? assignments.find(a => a.id === entry.taskId) : undefined;
    const pill = day ? dayNumberOf(cardTask?.days, day) : null;
    const closed = !!cardTask?.completedAt;
    const early = closed && !!day && day > String(cardTask!.completedAt).slice(0, 10);
    /**
     * The tile, in the square — laid out the way the office asked (2026-08-24):
     * the NAME first, bigger, and never cut off with three dots (it wraps);
     * the job's open tasks inside the SAME card, one per row, instead of
     * separate tiles for the job and its tasks; and the task counter, Drive,
     * Zoho and plan buttons along the bottom-right.
     */
    const shownTasks = open.slice(0, 3);
    return (
      <div
        {...dragHandlers}
        // The board's node handler takes the pointer on pointerdown so it can
        // start dragging the notebook; without these the card never saw the
        // press at all, so clicking one did nothing and dragging one moved the
        // whole widget.
        data-no-drag data-el-action
        className="group/en relative rounded-md px-1.5 py-1 min-w-0 planner-card flex-1 flex flex-col justify-center"
        style={{
          backgroundColor: tint(color, 0.16), border: '1px solid rgba(15,23,42,.07)',
          cursor: readOnly && !openOnly ? undefined : 'pointer', touchAction: 'none',
          // See-through while held, so the landing square shows through the
          // hand — and dimmed for good once the task behind it is closed.
          opacity: held ? 0.45 : closed ? 0.6 : undefined,
          transition: 'opacity 120ms ease',
        }}
        title={closed
          ? (early ? 'Finished early — this day was crossed off' : 'Done')
          : 'Click to open · drag to another day · hold Ctrl to leave a copy'}
      >
        {/* The line through a finished day — the record, drawn, not deleted. */}
        {closed && (
          <span aria-hidden="true" className="pointer-events-none absolute"
            style={{
              left: 4, right: 4, top: '50%',
              borderTop: `${Math.max(2, z(2.5))}px solid #475569`,
              transform: 'rotate(-4deg)', opacity: 0.8,
            }} />
        )}
        {/* The name, on top and WHOLE. `break-words`, never `truncate` — a
            card whose whole point is saying which job it is must not say
            "Wein…". */}
        <div className="flex items-start gap-1 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1"
            style={{ backgroundColor: stage?.color ?? '#cbd5e1' }}
            title={stage ? stage.name : 'Not started'} />
          <span
            className="flex-1 min-w-0 text-left break-words"
            style={{
              fontSize: size + z(1.5), fontWeight: 800, color: '#1e293b',
              lineHeight: 1.15, overflowWrap: 'break-word',
            }}
            title={job ? undefined
              : entry.projectId
                ? `This job is in ${workspace ?? 'another workspace'} — open it once on this computer and it will show here`
                : 'This job is no longer on the board'}
          >
            {/* aptLabel, not displayName: a building-project apartment has a
                NUMBER and often no family name, and displayName-only drew
                every one of those as the word "Job". */}
            {job
              ? (aptLabel(job) || job.address?.trim() || 'Job')
              : entry.projectId
                // Not "removed" — this machine simply has not opened that
                // workspace yet, so its snapshot is not here to read.
                ? 'Open that workspace to see this'
                : '(job removed)'}
          </span>
        </div>
        {(workspace || stage || entry.text) && (
          <span className="block truncate font-medium ps-2.5"
            style={{ fontSize: Math.max(z(7), size - z(2)), color: '#64748b' }}>
            {/* The workspace FIRST when it is not this one: "Artzi" here and
                "Artzi" in Wolfson are two different answers to "where am I
                going today". */}
            {workspace && (
              <span className="font-bold" style={{ color: '#7c3aed' }}>{workspace} · </span>
            )}
            {[entry.text, stage?.name].filter(Boolean).join(' · ')}
          </span>
        )}

        {/* "day 2 of 3" — the same task wearing several faces — and, once the
            task is closed, what this day's line through it means. */}
        {(pill || closed) && (
          <span className="flex items-center gap-1 ps-2.5 mt-0.5">
            {pill && (
              <span data-day-pill className="px-1.5 rounded-full font-bold tabular-nums"
                style={{ fontSize: Math.max(z(7), size - z(3)), backgroundColor: '#e0e7ff', color: '#3730a3' }}>
                day {pill.k} of {pill.n}
              </span>
            )}
            {closed && (
              <span className="font-semibold" style={{ fontSize: Math.max(z(7), size - z(3)), color: '#64748b' }}>
                {early ? 'finished early' : 'done'}
              </span>
            )}
          </span>
        )}

        {/* The job's own open tasks, INSIDE the card, one per row — no more
            separate tiles for the job and for what is to be done on it. */}
        {shownTasks.map(t => (
          <span key={t.id} className="flex items-baseline gap-1 min-w-0 ps-2.5"
            style={{ fontSize: Math.max(z(7), size - z(1.5)), color: '#475569' }}>
            <span className="flex-shrink-0" style={{ fontSize: '.8em' }}>•</span>
            <span className="flex-1 min-w-0 truncate font-medium">{t.taskDescription}</span>
          </span>
        ))}
        {pending > shownTasks.length && (
          <span className="ps-2.5 font-semibold"
            style={{ fontSize: Math.max(z(7), size - z(2)), color: '#94a3b8' }}>
            +{pending - shownTasks.length} more
          </span>
        )}

        {/* Counter and links, bottom-right — where the office asked for them. */}
        <span className="flex items-center justify-end gap-1 mt-0.5">
          {!readOnly && (
            <button data-no-drag data-el-action data-card-action onClick={onRemove}
              title="Take it off this day"
              className="opacity-0 group-hover/en:opacity-100 text-gray-400 hover:text-red-500 me-auto">
              <X size={9} />
            </button>
          )}
          {pending > 0 && (
            <span className="px-1 rounded-full font-bold tabular-nums"
              style={{ fontSize: Math.max(z(7), size - z(3)), backgroundColor: '#fef3c7', color: '#92400e' }}
              title={`${pending} still to do`}>
              {pending}
            </span>
          )}
          {job?.driveLink && (
            <a data-no-drag data-el-action href={job.driveLink} target="_blank" rel="noreferrer"
              title="Drive folder" onClick={e => e.stopPropagation()}
              className="text-[#4aa8d8] hover:opacity-70">
              <DriveIcon size={Math.max(z(9), size - z(2))} />
            </a>
          )}
          {job?.zohoLink && (
            <a data-no-drag data-el-action href={job.zohoLink} target="_blank" rel="noreferrer"
              title="Zoho" onClick={e => e.stopPropagation()}
              className="text-[#e11d48] hover:opacity-70">
              <ZohoIcon size={Math.max(z(9), size - z(2))} />
            </a>
          )}
          {job?.plansPdfLink && (
            <a data-no-drag data-el-action href={job.plansPdfLink} target="_blank" rel="noreferrer"
              title="Plan" onClick={e => e.stopPropagation()}
              className="text-[#1e3a5f] hover:opacity-70">
              <PlanIcon size={Math.max(z(9), size - z(2))} />
            </a>
          )}
        </span>
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
