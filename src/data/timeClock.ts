import { Employee, TimePunch, TimeClockSettings } from '../types';

/**
 * The time clock, as arithmetic.
 *
 * Everything here is pure. A shift is not stored — it is DERIVED by pairing an
 * employee's punches in order, which is the only way the numbers can never
 * disagree with the taps that produced them. Storing a shift and a pair of
 * punches would mean two records of the same fact, and the moment somebody
 * corrects one the month's total stops matching the board.
 *
 * The awkward part is not the pairing, it is what happens when somebody
 * forgets. That is handled at the point of the tap (`resolvePunch` below) so a
 * forgotten day is closed off THAT day and never runs into the next one.
 */

export const DEFAULT_TIME_CLOCK: TimeClockSettings = {
  dayStart: '08:00',
  dayEnd: '17:00',
  breakMinutes: 0,
  roundMinutes: 0,
};

/** The local calendar day of an instant, as yyyy-mm-dd. */
export function dayOf(t: Date | string | number): string {
  const dt = t instanceof Date ? t : new Date(t);
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** A wall-clock time on a given local day, as an instant. */
export function atOn(day: string, hhmm: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, h || 0, mi || 0, 0, 0);
}

export const hhmm = (t: Date | string): string => {
  const d = t instanceof Date ? t : new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export interface Shift {
  employeeId: string;
  /** The day the shift STARTED on. A shift never spans two days here. */
  day: string;
  inAt: string;
  outAt: string | null;
  minutes: number;
  /** Either end was written by the app rather than tapped. */
  autoIn: boolean;
  autoOut: boolean;
  inId: string;
  outId: string | null;
}

const sortPunches = (p: TimePunch[]) =>
  [...p].sort((a, b) => a.at.localeCompare(b.at) || (a.kind === 'in' ? -1 : 1));

/**
 * Pair one person's punches into shifts.
 *
 * A second `in` while one is already open closes the first at that day's end
 * rather than throwing it away — a lost shift is somebody's unpaid morning,
 * and silently dropping it is the worst thing this file could do.
 */
export function shiftsOf(
  punches: TimePunch[],
  employeeId: string,
  settings: TimeClockSettings = DEFAULT_TIME_CLOCK,
): Shift[] {
  const mine = sortPunches(punches.filter(p => p.employeeId === employeeId));
  const out: Shift[] = [];
  let open: TimePunch | null = null;

  const close = (start: TimePunch, end: TimePunch | null, autoOut: boolean) => {
    const day = dayOf(start.at);
    const endAt = end ? new Date(end.at) : atOn(day, settings.dayEnd);
    const mins = Math.max(0, Math.round((endAt.getTime() - new Date(start.at).getTime()) / 60_000));
    out.push({
      employeeId,
      day,
      inAt: start.at,
      outAt: end ? end.at : (mins > 0 ? endAt.toISOString() : null),
      minutes: mins,
      autoIn: !!start.auto,
      autoOut: end ? !!end.auto : autoOut,
      inId: start.id,
      outId: end ? end.id : null,
    });
  };

  for (const p of mine) {
    if (p.kind === 'in') {
      if (open) close(open, null, true);
      open = p;
    } else {
      if (open) { close(open, p, false); open = null; }
      // An `out` with nothing open is a stray. It is kept as a zero-length
      // record rather than discarded, so a correction screen can show it.
      else {
        out.push({
          employeeId, day: dayOf(p.at), inAt: p.at, outAt: p.at, minutes: 0,
          autoIn: true, autoOut: !!p.auto, inId: p.id, outId: p.id,
        });
      }
    }
  }
  // A shift open RIGHT NOW is left open — it is somebody who is at work.
  if (open) {
    out.push({
      employeeId, day: dayOf(open.at), inAt: open.at, outAt: null,
      minutes: 0, autoIn: !!open.auto, autoOut: false, inId: open.id, outId: null,
    });
  }
  return out;
}

/** True while this person is clocked in and has not clocked out. */
export function isClockedIn(punches: TimePunch[], employeeId: string): boolean {
  const mine = sortPunches(punches.filter(p => p.employeeId === employeeId));
  return mine.length > 0 && mine[mine.length - 1].kind === 'in';
}

/** The moment they clocked in, when they are in. */
export function clockedInSince(punches: TimePunch[], employeeId: string): string | null {
  const mine = sortPunches(punches.filter(p => p.employeeId === employeeId));
  const last = mine[mine.length - 1];
  return last && last.kind === 'in' ? last.at : null;
}

export interface PunchPlan {
  /** Punches to write, in order. The last one is the one the person asked for. */
  writes: Omit<TimePunch, 'id'>[];
  /** Plain words for the toast, so the person knows what was tidied up. */
  message: string;
}

/**
 * What actually gets written when somebody taps in or out.
 *
 * This is the whole point of the feature. Two things go wrong on a real site
 * and both used to ruin a month's timesheet:
 *
 *  - Somebody clocks in on Monday and forgets to clock out. On Tuesday morning
 *    they tap in again. Without help, Monday's shift runs for twenty-four hours
 *    and Tuesday has no start. Monday is closed off at Monday's end-of-day,
 *    marked as written by the app, and Tuesday starts clean.
 *
 *  - Somebody forgets to clock IN and taps out at the end of the day. Without
 *    help the tap is orphaned and the day counts as nothing. A start is written
 *    at that day's normal start time, so the day is paid and flagged.
 *
 * Every made-up punch carries `auto: true`, so the month's report can show
 * exactly which figures somebody should look at rather than quietly inventing
 * hours nobody can trace.
 */
export function resolvePunch(
  punches: TimePunch[],
  employeeId: string,
  kind: 'in' | 'out',
  now: Date,
  settings: TimeClockSettings = DEFAULT_TIME_CLOCK,
  source = 'board',
): PunchPlan {
  const mine = sortPunches(punches.filter(p => p.employeeId === employeeId));
  const last = mine[mine.length - 1] ?? null;
  const openIn = last && last.kind === 'in' ? last : null;
  const today = dayOf(now);

  const writes: Omit<TimePunch, 'id'>[] = [];
  const notes: string[] = [];

  // An open shift from an EARLIER day gets closed at that day's end. Never at
  // "now" — that would credit somebody with sleeping on site.
  if (openIn && dayOf(openIn.at) !== today) {
    const staleDay = dayOf(openIn.at);
    const end = atOn(staleDay, settings.dayEnd);
    // If they clocked in after the nominal end of day, the shift gets the
    // clock-in time itself so the day is zero rather than negative.
    const endAt = end.getTime() > new Date(openIn.at).getTime() ? end : new Date(openIn.at);
    writes.push({
      employeeId, day: staleDay, at: endAt.toISOString(), kind: 'out',
      auto: true, source: 'auto',
      note: `no clock-out was recorded, closed at ${settings.dayEnd}`,
    });
    notes.push(`${staleDay} was still open — closed at ${settings.dayEnd}`);
  }

  if (kind === 'in') {
    // Tapping in while already in on the SAME day is a mistake, not a shift.
    if (openIn && dayOf(openIn.at) === today) {
      return { writes: [], message: 'already clocked in today' };
    }
    writes.push({ employeeId, day: today, at: now.toISOString(), kind: 'in', source });
    notes.push(`clocked in at ${hhmm(now)}`);
  } else {
    const openToday = openIn && dayOf(openIn.at) === today;
    if (!openToday) {
      // Forgot to clock in. Open the day at its normal start, unless that is
      // after now — in which case use now, so the shift is never negative.
      const start = atOn(today, settings.dayStart);
      const startAt = start.getTime() < now.getTime() ? start : now;
      writes.push({
        employeeId, day: today, at: startAt.toISOString(), kind: 'in',
        auto: true, source: 'auto',
        note: `no clock-in was recorded, opened at ${hhmm(startAt)}`,
      });
      notes.push(`no clock-in today — opened at ${hhmm(startAt)}`);
    }
    writes.push({ employeeId, day: today, at: now.toISOString(), kind: 'out', source });
    notes.push(`clocked out at ${hhmm(now)}`);
  }

  return { writes, message: notes.join(' · ') };
}

// ─── Reporting ───────────────────────────────────────────────────────────────

export interface DayRow {
  day: string;
  inAt: string | null;
  outAt: string | null;
  minutes: number;
  flagged: boolean;
}

export interface MonthRow {
  employee: Employee;
  days: DayRow[];
  totalMinutes: number;
  flaggedDays: number;
}

/** yyyy-mm → every day in it, as yyyy-mm-dd. */
export function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * One month, one row per person, one column per day.
 *
 * Several shifts on the same day are added together and shown as the first
 * clock-in and the last clock-out — which is what a timesheet means by a day,
 * and what somebody checking it against their own memory expects to see.
 */
export function monthReport(
  employees: Employee[],
  punches: TimePunch[],
  month: string,
  settings: TimeClockSettings = DEFAULT_TIME_CLOCK,
): MonthRow[] {
  const days = daysInMonth(month);
  return employees.map(employee => {
    const shifts = shiftsOf(punches, employee.id, settings).filter(s => s.day.startsWith(month));
    const rows: DayRow[] = days.map(day => {
      const on = shifts.filter(s => s.day === day);
      if (!on.length) return { day, inAt: null, outAt: null, minutes: 0, flagged: false };
      const worked = on.reduce((sum, s) => sum + s.minutes, 0);
      const paid = Math.max(0, worked - (worked > 0 ? settings.breakMinutes : 0));
      return {
        day,
        inAt: on[0].inAt,
        outAt: on[on.length - 1].outAt,
        minutes: roundTo(paid, settings.roundMinutes),
        flagged: on.some(s => s.autoIn || s.autoOut || s.outAt === null),
      };
    });
    return {
      employee,
      days: rows,
      totalMinutes: rows.reduce((s, r) => s + r.minutes, 0),
      flaggedDays: rows.filter(r => r.flagged).length,
    };
  });
}

function roundTo(minutes: number, step: number): number {
  if (!step || step <= 1) return minutes;
  return Math.round(minutes / step) * step;
}

/** "7:45" — hours and minutes, which is how a wage is worked out. */
export function asHours(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** "7.75" — decimal hours, which is what a payroll spreadsheet wants. */
export function asDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
