import React, { useEffect, useMemo, useState } from 'react';
import {
  DayStretch, workingRun, stretchDays, nextWorkingDay, stretchesFromDays,
} from '../../data/taskDays';

/**
 * "How many days" — the multi-day block, shared by every task form.
 *
 * The day arithmetic shipped in the weekly notebook's drop dialog and stayed
 * there, so a task made any other way — the drawer's Add Task (which is what
 * opens when a stage change asks "assign a task?"), the Tasks page, the bulk
 * modal — could only carry one date. The owner's report was per-stage ("the
 * Geves stage needs days like installation has") because the notebook is
 * where installations get planned; the real boundary was WHICH FORM, and this
 * removes it: one picker, the same rules, every workspace and every stage.
 *
 * The rules are the locked 2026-08-24 ones, straight from taskDays.ts:
 * Saturday never counts; Friday is per-stretch and only offered when the days
 * actually pass one; Non-consecutive opens a second stretch; the green line
 * always reads out exactly which days the task will sit on.
 *
 * The host keeps its own date input as the START day and receives the full
 * day list through `onDaysChange`. One day = the caller's plain single-date
 * task, exactly as before; more = `days` on the assignment with `dueDate`
 * pinned to the last (the model's standing invariant). Reset the picker by
 * changing its `key`.
 */
export function TaskDaysPicker({ start, initialDays, onDaysChange }: {
  start: string;
  /**
   * The days a task ALREADY covers, when this is editing one rather than
   * making one. Without it the editor opened showing "1 day" over a
   * three-day task, and saving threw the other two away.
   */
  initialDays?: string[];
  onDaysChange: (days: string[]) => void;
}) {
  const seed = useMemo(() => stretchesFromDays(initialDays ?? []), [initialDays]);
  const [count, setCount] = useState(seed.count);
  const [friday, setFriday] = useState(seed.friday);
  const [noncon, setNoncon] = useState(!!seed.second);
  const [second, setSecond] = useState<DayStretch>(seed.second ?? { start: '', days: 1 });

  const stretches: DayStretch[] = useMemo(() => {
    if (!start) return [];
    const first: DayStretch = { start, days: count, friday };
    return noncon && second.start ? [first, second] : [first];
  }, [start, count, friday, noncon, second]);
  const allDays = useMemo(() => stretchDays(stretches), [stretches]);
  const daysKey = allDays.join('|');
  useEffect(() => {
    onDaysChange(allDays);
    // Keyed on the computed list — the callback is an inline closure at every
    // host and must not retrigger the effect on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey]);

  // No start day picked yet: a dateless task stays exactly what it was.
  if (!start) return null;

  const run = workingRun(start, count, friday);
  const run2 = noncon && second.start ? workingRun(second.start, second.days, second.friday) : null;
  const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`)
    .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  const stepper = (value: number, set: (n: number) => void, tag: string) => (
    <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden">
      <button type="button" data-no-drag data-el-action aria-label="One day fewer"
        onClick={() => set(Math.max(1, value - 1))}
        className="px-2.5 py-1 font-black text-gray-500 hover:bg-gray-50 text-sm">−</button>
      <span data-days-count={tag}
        className="flex-1 min-w-[26px] text-center font-bold tabular-nums text-gray-700 text-sm">{value}</span>
      <button type="button" data-no-drag data-el-action aria-label="One day more"
        onClick={() => set(Math.min(15, value + 1))}
        className="px-2.5 py-1 font-black text-gray-500 hover:bg-gray-50 text-sm">+</button>
    </div>
  );

  return (
    <div data-task-days className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11.5px] font-semibold text-gray-600 flex-shrink-0">How many days</span>
        {stepper(count, setCount, 'first')}
        {run.crossesFriday && (
          <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 select-none cursor-pointer">
            <input type="checkbox" checked={friday}
              onChange={e => setFriday(e.target.checked)}
              style={{ width: 13, height: 13, accentColor: '#1e3a5f' }} />
            Include Friday?
          </label>
        )}
      </div>

      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 select-none cursor-pointer">
        <input type="checkbox" checked={noncon}
          onChange={e => {
            const on = e.target.checked;
            setNoncon(on);
            if (on && !second.start) {
              setSecond({ start: nextWorkingDay(run.days[run.days.length - 1]), days: 1 });
            }
          }}
          style={{ width: 13, height: 13, accentColor: '#1e3a5f' }} />
        Non-consecutive — work it in separate stretches
      </label>

      {noncon && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-500 flex-shrink-0">And again from</span>
          <input type="date" value={second.start}
            onChange={e => { if (e.target.value) setSecond(sc => ({ ...sc, start: e.target.value })); }}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white" />
          {stepper(second.days, n => setSecond(sc => ({ ...sc, days: n })), 'second')}
          {run2?.crossesFriday && (
            <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 select-none cursor-pointer">
              <input type="checkbox" checked={!!second.friday}
                onChange={e => setSecond(sc => ({ ...sc, friday: e.target.checked }))}
                style={{ width: 13, height: 13, accentColor: '#1e3a5f' }} />
              Include Friday?
            </label>
          )}
        </div>
      )}

      {/* The green line: exactly which days, always — the drop dialog's rule. */}
      {allDays.length > 1 && (
        <p data-day-readout className="m-0 text-[11.5px] font-semibold" style={{ color: '#15803d' }}>
          → {allDays.map(fmtDay).join(', ')} — {allDays.length} days
        </p>
      )}
    </div>
  );
}

/**
 * The write, in one place: more than one day pins `dueDate` to the LAST day
 * and carries the full list; a single day stays the plain single-date task
 * every consumer already understands.
 */
export function daysFields(start: string, days: string[]): { dueDate: string | null; days?: string[] } {
  if (days.length > 1) return { dueDate: days[days.length - 1], days };
  return { dueDate: start || null };
}
