import React from 'react';
import { Check } from 'lucide-react';
import type { ContractorAssignment, Stage, Apartment } from '../../types';
import { getStageName } from '../../types';
import { stageSetOf, stageStateOf, isWorkStage, taskStageIds, recordStageIds, SetContext } from '../../data/stageMarks';

/**
 * WHICH STAGES A TASK IS FOR — the set model (locked answer 7, 2026-09-22):
 * ONE picker showing the apartment's own stages in the settings order; a
 * task may take one or several; closing it ticks every one of them done and
 * the apartment's headline moves on by itself.
 *
 * The from → to PAIR this file used to draw is gone from every form. The
 * value keeps its old shape so no form had to change its state: `from` is
 * the FIRST picked stage (every reader written for one stage — the notebook
 * bar's colour, sorting, the log — keeps working) and `ids` is the whole
 * pick. `to` is never written any more; it is only read off OLD tasks.
 */
export interface StagePairValue { from: string; to: string; ids?: string[] }

/** Every stage a value names — the new list, else the single from-stage. */
export function pairIds(p?: StagePairValue | null): string[] {
  if (!p) return [];
  if (p.ids) return p.ids;
  return p.from ? [p.from] : [];
}
export function samePair(a?: StagePairValue | null, b?: StagePairValue | null): boolean {
  return pairIds(a).join('|') === pairIds(b).join('|');
}

export interface StagePairStrings {
  onLabel: string;         // "Stage"
  toLabel: string;         // unused now — kept so old callers compile
  jobsStage: string;
  notReached: string;
  leaveAlone: string;
  several?: string;        // "one or several"
}

export function StagePairPicker({ stages, currentStageId, value, onChange, strings, isRtl, hook, labels = true, apartment, ctx }: {
  /** The workspace's own active stages, sorted. */
  stages: Stage[];
  currentStageId?: string | null;
  value: StagePairValue;
  onChange: (v: StagePairValue) => void;
  strings: StagePairStrings;
  isRtl?: boolean;
  /** The host's input class — kept for old callers; the bubbles draw their own. */
  box?: string;
  hook?: string;
  labels?: boolean;
  /**
   * The apartment the task is for: only ITS set is offered (never the whole
   * tower's list). Without it — a bulk task over many apartments — every
   * work stage of the workspace is offered.
   */
  apartment?: Pick<Apartment, 'id' | 'currentStageId' | 'stageMarks' | 'bubbles' | 'tipus' | 'buildingId'> | null;
  ctx?: SetContext;
}) {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const offered = apartment ? stageSetOf(apartment, sorted, ctx) : sorted.filter(st => isWorkStage(st) && st.active);
  const ids = pairIds(value);
  const lbl = 'text-[10px] font-bold tracking-wide text-gray-400 uppercase mb-1 block';
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter(x => x !== id) : sorted.filter(st => [...ids, id].includes(st.id)).map(st => st.id);
    onChange({ from: next[0] ?? '', to: '', ids: next });
  };
  return (
    <div data-stage-pair={hook ?? '1'}>
      {labels && (
        <span className={lbl}>
          {strings.onLabel}
          {strings.several && <span className="normal-case tracking-normal font-medium text-gray-400"> · {strings.several}</span>}
        </span>
      )}
      <div className="flex flex-wrap gap-1.5">
        {offered.map(st => {
          const on = ids.includes(st.id);
          const state = apartment ? stageStateOf(apartment, st.id, sorted) : 'todo';
          const isCur = st.id === currentStageId;
          return (
            <button key={st.id} type="button" data-stage-pick={st.id} data-on={on ? '1' : undefined}
              data-no-drag data-el-action
              onClick={() => toggle(st.id)}
              className="inline-flex items-center gap-1.5 rounded-full border pl-1.5 pr-2.5 py-1 text-[11.5px] font-bold max-w-full"
              style={on
                ? { borderColor: st.color, backgroundColor: st.color, color: '#fff' }
                : { borderColor: `${st.color}88`, backgroundColor: '#fff', color: state === 'done' ? '#94a3b8' : '#1f2937',
                    textDecoration: state === 'done' ? 'line-through' : undefined }}>
              {on
                ? <Check size={11} strokeWidth={3.5} />
                : <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />}
              <span className="truncate">{getStageName(st, !!isRtl)}</span>
              {isCur && !on && <span className="text-[9px] font-semibold opacity-70">· {strings.jobsStage}</span>}
            </button>
          );
        })}
        {!offered.length && <span className="text-[11px] text-gray-400">{strings.leaveAlone}</span>}
      </div>
    </div>
  );
}

/**
 * The task's stages on a row — one chip per stage, in the drawer's Tasks
 * tab, the Tasks page, the worker's phone and the notebook bar. An OLD task
 * still carrying the pair draws "Installation → Drywall" as it always did.
 * Draws nothing when the task carries no stage.
 */
export function StagePairPill({ task, stages, isRtl, size = 'sm', className = '' }: {
  task: Pick<ContractorAssignment, 'stageId' | 'stageWhenDone' | 'stageIds' | 'stagesWorked' | 'stagesUnfinished' | 'completedAt'>;
  stages: Stage[];
  isRtl?: boolean;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  // BUBBLES, never an arrow (owner's recording, 2026-10-11: "we don't have
  // these arrows any more — we should have the bubbles"). A finished task's
  // bubbles are the stages its close names, each with a tick; an old task
  // that still carries a "then" stage says it in words.
  const ids = recordStageIds(task);
  const picked = ids.map(id => stages.find(s => s.id === id)).filter((s): s is Stage => !!s);
  const to = !task.stageIds && task.stageWhenDone && task.stageWhenDone !== task.stageId
    ? stages.find(s => s.id === task.stageWhenDone) : undefined;
  if (!picked.length && !to) return null;
  const fs = size === 'xs' ? 'text-[10px]' : 'text-[11px]';
  const half = new Set(task.stagesUnfinished ?? []);
  return (
    <span data-stage-pill className={`inline-flex items-center gap-1 flex-wrap ${fs} font-semibold ${className}`}>
      {picked.map(st => {
        const done = !!task.completedAt && !half.has(st.id);
        return (
          <span key={st.id} data-stage-bubble={st.id} data-done={done ? '1' : undefined}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border"
            style={{ backgroundColor: done ? '#dcfce7' : st.color + '1f', borderColor: done ? '#86efac' : st.color + '66', color: done ? '#166534' : '#1f2937' }}>
            {done
              ? <Check size={11} strokeWidth={3.5} className="flex-shrink-0" style={{ color: '#16a34a' }} />
              : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />}
            {getStageName(st, !!isRtl)}
          </span>
        );
      })}
      {to && (
        <span className="text-gray-500 font-medium">
          {isRtl ? 'ואז' : 'then'} {getStageName(to, !!isRtl)}
        </span>
      )}
    </span>
  );
}

/**
 * One plain sentence for a task (owner's recording, 2026-10-11: "explain it
 * in plain English, like a normal CRM"): "Igor is doing Piping, Concealed
 * Units and Fans — due Sun 11 Oct", "Igor finished Registers on Mon 5 Oct".
 */
export function taskPlainSentence(task: Pick<ContractorAssignment, 'stageId' | 'stageIds' | 'stagesWorked' | 'stagesUnfinished' | 'completedAt' | 'dueDate'>,
  stages: Stage[], who: string, isRtl?: boolean): string {
  const he = !!isRtl;
  const names = recordStageIds(task).map(id => stages.find(s => s.id === id)).filter((s): s is Stage => !!s).map(st => getStageName(st, he));
  const list = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${he ? 'ו' : 'and '}${xs[xs.length - 1]}`;
  const day = (iso: string) => {
    const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(he ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const what = names.length ? list(names) : (he ? 'את המשימה' : 'the task');
  if (task.completedAt) {
    return he ? `${who} סיים ${what} ב${day(task.completedAt)}` : `${who} finished ${what} on ${day(task.completedAt)}`;
  }
  const due = task.dueDate ? (he ? ` — עד ${day(task.dueDate)}` : ` — due ${day(task.dueDate)}`) : '';
  return he ? `${who} עושה ${what}${due}` : `${who} is doing ${what}${due}`;
}

/** The picker's strings, read off the admin strings object. */
export function stagePairStrings(s: {
  stageOnLabel: string; stageToLabel: string; stageJobsStage: string; stageNotReached: string; stageLeaveAlone: string; setPickSeveral?: string;
}): StagePairStrings {
  return { onLabel: s.stageOnLabel, toLabel: s.stageToLabel, jobsStage: s.stageJobsStage, notReached: s.stageNotReached, leaveAlone: s.stageLeaveAlone, several: s.setPickSeveral };
}
