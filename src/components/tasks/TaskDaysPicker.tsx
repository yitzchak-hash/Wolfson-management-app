import React, { useEffect, useMemo, useState } from 'react';
import {
  DayStretch, workingRun, stretchDays, nextWorkingDay, stretchesFromDays,
} from '../../data/taskDays';
import type { Stage } from '../../types';
import { StagePairPicker, StagePairValue, StagePairStrings } from './StagePair';

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
 * 2026-09-15 (locked answer 9): the second stretch may carry DIFFERENT
 * STAGES. When the host hands over the workspace's stages and the first
 * stretch's pair, "Different stages for this stretch" reveals a second pair;
 * while the two pairs agree the whole thing is ONE task with no question;
 * the moment they differ the form asks "One task, or two?" (default two —
 * a worker closes Piping on the 17th and Wall units on the 23rd separately).
 * `taskWrites()` turns the answer into the record(s) to create, so every
 * host writes the same thing.
 *
 * The host keeps its own date input as the START day and receives the full
 * day list through `onDaysChange`. One day = the caller's plain single-date
 * task, exactly as before; more = `days` on the assignment with `dueDate`
 * pinned to the last (the model's standing invariant). Reset the picker by
 * changing its `key`.
 */
export interface TaskSplit {
  secondDays: string[];
  /** The second stretch's own pair (equal to the first when not different). */
  pair: StagePairValue;
  different: boolean;
  mode: 'one' | 'two';
}

export interface SplitStrings {
  different: string;
  ask: string;
  two: string;
  one: string;
}

export function TaskDaysPicker({
  start, initialDays, onDaysChange,
  stages, currentStageId, pair, onSplitChange, pairStrings, splitStrings, isRtl,
}: {
  start: string;
  /**
   * The days a task ALREADY covers, when this is editing one rather than
   * making one. Without it the editor opened showing "1 day" over a
   * three-day task, and saving threw the other two away.
   */
  initialDays?: string[];
  onDaysChange: (days: string[]) => void;
  /** Hand these over and the second stretch can carry its own stages. */
  stages?: Stage[];
  currentStageId?: string | null;
  pair?: StagePairValue;
  onSplitChange?: (split: TaskSplit | null) => void;
  pairStrings?: StagePairStrings;
  splitStrings?: SplitStrings;
  isRtl?: boolean;
}) {
  const seed = useMemo(() => stretchesFromDays(initialDays ?? []), [initialDays]);
  const [count, setCount] = useState(seed.count);
  const [friday, setFriday] = useState(seed.friday);
  const [noncon, setNoncon] = useState(!!seed.second);
  const [second, setSecond] = useState<DayStretch>(seed.second ?? { start: '', days: 1 });
  const [different, setDifferent] = useState(false);
  const [secondPair, setSecondPair] = useState<StagePairValue>({ from: '', to: '' });
  const [mode, setMode] = useState<'one' | 'two'>('two');

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

  const secondDays = useMemo(
    () => (noncon && second.start ? stretchDays([second]) : []),
    [noncon, second],
  );
  const canStage = !!stages && !!pair && !!pairStrings;
  const effSecond: StagePairValue = different && canStage ? secondPair : (pair ?? { from: '', to: '' });
  const differs = canStage && different
    && (effSecond.from !== (pair?.from ?? '') || effSecond.to !== (pair?.to ?? ''));
  const splitKey = `${secondDays.join('|')}|${effSecond.from}|${effSecond.to}|${differs ? mode : 'one'}`;
  useEffect(() => {
    if (!onSplitChange) return;
    if (!noncon || !secondDays.length) { onSplitChange(null); return; }
    onSplitChange({ secondDays, pair: effSecond, different: !!differs, mode: differs ? mode : 'one' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitKey, noncon]);

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

  const readout = () => {
    if (allDays.length <= 1) return null;
    if (canStage && differs && stages && pair) {
      const nm = (id: string) => stages.find(st => st.id === id)?.name ?? '';
      const firstDays = allDays.filter(d => !secondDays.includes(d));
      const tag1 = pair.from ? ` (${nm(pair.from)})` : '';
      const tag2 = effSecond.from ? ` (${nm(effSecond.from)})` : '';
      return `→ ${firstDays.map(fmtDay).join(', ')}${tag1} · ${secondDays.map(fmtDay).join(', ')}${tag2} — ${allDays.length} days`;
    }
    return `→ ${allDays.map(fmtDay).join(', ')} — ${allDays.length} days`;
  };

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
          {canStage && (
            <label data-different-stages className="flex items-center gap-1 text-[11px] font-bold text-[#1e3a5f] select-none cursor-pointer">
              <input type="checkbox" checked={different}
                onChange={e => {
                  setDifferent(e.target.checked);
                  if (e.target.checked && !secondPair.from && !secondPair.to) setSecondPair({ ...(pair as StagePairValue) });
                }}
                style={{ width: 13, height: 13, accentColor: '#1e3a5f' }} />
              {splitStrings?.different ?? 'Different stages for this stretch'}
            </label>
          )}
        </div>
      )}

      {/* The second stretch's own pair — only once "different" is on. */}
      {noncon && canStage && different && stages && pairStrings && (
        <div data-second-pair>
          <StagePairPicker stages={stages} currentStageId={currentStageId} value={secondPair}
            onChange={setSecondPair} strings={pairStrings} isRtl={isRtl} labels={false} hook="second" />
        </div>
      )}

      {/* The ask, only when the pairs really differ (locked answer 9). */}
      {noncon && differs && (
        <div data-split-ask className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-[11.5px]">
          <div className="font-bold text-[#1e3a5f] mb-1">{splitStrings?.ask ?? 'One task, or two?'}</div>
          <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer select-none">
            <input type="radio" name="task-split" checked={mode === 'two'} onChange={() => setMode('two')}
              style={{ accentColor: '#1e3a5f' }} />
            {splitStrings?.two ?? 'Two tasks — each stretch is its own'}
          </label>
          <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer select-none">
            <input type="radio" name="task-split" checked={mode === 'one'} onChange={() => setMode('one')}
              style={{ accentColor: '#1e3a5f' }} />
            {splitStrings?.one ?? 'One task in two parts'}
          </label>
        </div>
      )}

      {/* The green line: exactly which days, always — the drop dialog's rule. */}
      {allDays.length > 1 && (
        <p data-day-readout className="m-0 text-[11.5px] font-semibold" style={{ color: '#15803d' }}>
          {readout()}
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

/** One record's date-and-stage fields, as every host spreads them. */
export interface TaskWrite {
  dueDate: string | null;
  days?: string[];
  stageId: string | null;
  stageWhenDone?: string;
}

/**
 * What to create: ONE record with every day and the first pair — unless the
 * second stretch carries different stages and the office said "two", in
 * which case each stretch is its own record with its own stages.
 */
export function taskWrites(
  start: string, days: string[], pair?: StagePairValue, split?: TaskSplit | null,
): TaskWrite[] {
  const stageOf = (p?: StagePairValue) => ({
    stageId: p?.from || null,
    ...(p?.to ? { stageWhenDone: p.to } : {}),
  });
  if (split && split.mode === 'two' && split.different && split.secondDays.length) {
    const firstDays = days.filter(d => !split.secondDays.includes(d));
    const first = firstDays.length ? firstDays : days;
    return [
      { ...daysFields(start, first), ...stageOf(pair) },
      { ...daysFields(split.secondDays[0], split.secondDays), ...stageOf(split.pair) },
    ];
  }
  return [{ ...daysFields(start, days), ...stageOf(pair) }];
}

/** The split strings, read off the admin strings object. */
export function splitStringsOf(s: {
  stageDifferentLabel: string; splitAskLabel: string; splitTwoLabel: string; splitOneLabel: string;
}): SplitStrings {
  return { different: s.stageDifferentLabel, ask: s.splitAskLabel, two: s.splitTwoLabel, one: s.splitOneLabel };
}
