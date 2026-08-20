import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlannerDropDialog } from './PlannerDialogs';
import { ChevronLeft, ChevronRight, Plus, X, CalendarDays, Maximize2, Eye, EyeOff } from 'lucide-react';
import {
  Apartment, CanvasElement, Contractor, User, ContractorAssignment, Stage, personColor,
  aptLabel,
} from '../../types';
import { registerRota, onRotaHover, rotaCellAt, setRotaHover, RotaHit } from '../../data/rotaDrop';
import { useStore, loadProjectSnapshot } from '../../data/store';
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
  /**
   * A PROJECTION of the main notebook: shows exactly what the secretary's copy
   * shows and cannot be written to — but a job in a square still opens, which
   * is the whole reason to put one on a second screen.
   */
  projection?: boolean;
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
  /** Nothing may be written: either it is inert, or it is a projection. */
  const ro = !!readOnly || !!projection;
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
     * A projection, the wallboard and the worker's portal all draw a notebook
     * read-only. Registering them meant a drag could be answered by a copy
     * that is not allowed to accept it — and on a TV, that a job could be
     * moved from a screen nobody is supposed to be arranging from.
     */
    if (ro || projection) return;
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

  /** Carry out whichever the office picked. */
  function resolveDrop(choice: 'move' | 'copy' | 'off') {
    const ask = dropAsk;
    setDropAsk(null);
    if (!ask) return;
    if (choice === 'off') {
      const drop = () => setCell(
        ask.fromKey,
        (cells[ask.fromKey] ?? []).filter(x => x.id !== ask.entry.id),
      );
      // A task attached to the slot is its own question, asked as it always was.
      if (ask.entry.taskId && onRemoveTask) onRemoveTask(ask.entry, () => drop());
      else drop();
      return;
    }
    // "Leave it where it was" for a drop outside: there is nowhere to move to,
    // so doing nothing IS the answer.
    if (!ask.target) return;
    moveEntry(ask.fromKey, ask.entry, ask.target, choice === 'copy');
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
  }, [data.cells, projects]);

  /** The job a card is pointing at, wherever it lives. */
  const resolve = (en: PlannerEntry): { job?: Apartment; workspace?: string } => {
    if (!en.jobId) return {};
    if (!en.projectId) return { job: jobById.get(en.jobId) };
    const hit = foreign.get(`${en.projectId}:${en.jobId}`);
    return { job: hit?.job, workspace: hit?.workspace ?? en.projectId };
  };

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
  const [shownMonth, setShownMonth] = useState<string>(() => monthKey(weeks[0] ?? firstWeek));

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

  /** Scroll to the first week of the next or previous month. */
  function jumpMonth(by: 1 | -1) {
    if (!weeks.length) return;
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
      {/* The header row scrolls sideways rather than pushing its buttons off
          the edge. Squeezed narrow, the month arrows and the show-all button
          used to sit outside the node with nothing to reach them by. */}
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 flex-shrink-0 overflow-x-auto scrollbar-thin">
        <CalendarDays size={12} className="text-gray-400 flex-shrink-0" />
        <span className="font-extrabold tracking-wide text-gray-500 truncate"
          style={{ fontSize: Math.max(z(9), textSize - z(1)) }}>
          {title.toUpperCase()}
        </span>
        <span className="px-1.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0 tabular-nums"
          style={{ fontSize: Math.max(z(8), textSize - z(2)) }}>{label}</span>
        <span className="flex-1" />
        {!ro && (
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
              style={{ fontSize: Math.max(z(8), textSize - z(2)) }}>
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

        {weeks.map((wkStart, wi) => {
          const days = Array.from({ length: span }, (_, i) => addDays(wkStart, i));
          // The name column is as wide as the NAMES, not a share of the sheet.
          // It used to be `0.85fr`, so a row of five short names spent a tenth
          // of the paper saying "Max" — and the days, which are what the sheet
          // is for, were squeezed to pay for it.
          const cols = `${nameColW}px repeat(${span}, minmax(0, 1fr))`;
          // A rule wherever the month changes, so the run reads as months
          // rather than as an undifferentiated column of weeks.
          const newMonth = wi > 0 && monthKey(wkStart) !== monthKey(weeks[wi - 1]);
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
                <div className="font-black tracking-wide text-gray-400 flex items-end justify-between gap-1 pb-0.5"
                  style={{ fontSize: Math.max(z(7), daySize - z(3)) }}>
                  <span className="truncate">
                    {wkStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  {/* The week's tiny controls, together at the label's end —
                      the owner asked for exactly this shape: add-a-week as a
                      little icon RIGHT NEXT to the put-away eye, tooltips and
                      all, instead of two full-width rows. The first week
                      carries add-before, the last carries add-after; when a
                      week was put away in that direction the same press
                      restores it (Eye instead of Plus, wording says so). */}
                  {!ro && (
                    <span className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover/wk:opacity-100 transition-opacity">
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
                            ? <Eye size={Math.max(10, Math.round(z(11)))} />
                            : <Plus size={Math.max(10, Math.round(z(11)))} />}
                        </button>
                      )}
                      {wi === weeks.length - 1 && (
                        <button
                          data-no-drag data-el-action
                          onClick={() => addWeek('after')}
                          title={hiddenBelow.length
                            ? 'Bring back the next week — everything in it comes with it'
                            : 'Add the week after this one'}
                          className="text-gray-300 hover:text-[#1e3a5f]"
                        >
                          {hiddenBelow.length
                            ? <Eye size={Math.max(10, Math.round(z(11)))} />
                            : <Plus size={Math.max(10, Math.round(z(11)))} />}
                        </button>
                      )}
                      <button
                        data-no-drag data-el-action
                        onClick={() => hideWeek(iso(wkStart))}
                        title="Put this week away — nothing in it is removed, and adding the week back brings it all with it"
                        className="text-gray-300 hover:text-[#1e3a5f]"
                      >
                        <EyeOff size={Math.max(10, Math.round(z(11)))} />
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
                                // Another workspace's job opens over there — the
                                // switch first, then the intent, because
                                // setCurrentProject clears a pending focus as
                                // part of arriving somewhere new.
                                if (en.projectId && en.projectId !== currentProjectId) {
                                  setCurrentProject(en.projectId);
                                  setPendingFocus({ kind: 'apartment', id: en.jobId });
                                  return;
                                }
                                openJob(en.jobId);
                              }}
                              onText={v => setCell(key, entries.map(x => (x.id === en.id ? { ...x, text: v } : x)))}
                              onRemove={() => {
                                const drop = () => setCell(key, entries.filter(x => x.id !== en.id));
                                if (en.taskId && onRemoveTask) onRemoveTask(en, () => drop());
                                else drop();
                              }}
                              onDragOff={() => setDropAsk({ fromKey: key, entry: en, target: null })}
                              onDragTo={(target, copy) => {
                                // Ctrl/⌘ still copies outright — a shortcut for
                                // anybody who knows it. A plain drag asks,
                                // because the same gesture used to mean three
                                // very different things with nothing said.
                                if (copy) { moveEntry(key, en, target, true); return; }
                                setDropAsk({ fromKey: key, entry: en, target });
                              }}
                            />
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
  onOpen, onText, onRemove, onDragOff, onDragTo,
}: {
  entry: PlannerEntry;
  job?: Apartment;
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
  const openHandlers = openOnly && entry.jobId
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
          cursor: readOnly && !openOnly ? undefined : 'pointer', touchAction: 'none',
          // See-through while held, so the landing square shows through the hand.
          opacity: held ? 0.45 : undefined,
          transition: 'opacity 120ms ease',
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
            title={job ? undefined
              : entry.projectId
                ? `This job is in ${workspace ?? 'another workspace'} — open it once on this computer and it will show here`
                : 'This job is no longer on the board'}
          >
            <span className="block truncate">
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
            {(workspace || stage || entry.text || job?.address) && (
              <span className="block truncate font-medium"
                style={{ fontSize: Math.max(z(7), size - z(2)), color: '#64748b' }}>
                {/* The workspace FIRST when it is not this one: "Artzi" here and
                    "Artzi" in Wolfson are two different answers to "where am I
                    going today". */}
                {workspace && (
                  <span className="font-bold" style={{ color: '#7c3aed' }}>{workspace} · </span>
                )}
                {[entry.text, stage?.name, job?.address].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>

          {/* What the tile carries, carried here too. */}
          <span className="flex items-center gap-0.5 flex-shrink-0">
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
