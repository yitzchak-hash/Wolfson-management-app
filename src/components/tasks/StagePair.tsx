import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { ContractorAssignment, Stage } from '../../types';
import { getStageName } from '../../types';

/**
 * The stage a task is ON, and the stage the job moves TO when it is closed —
 * one pair, drawn the same way on every task form (owner, 2026-09-15: "I need
 * to be able to select what stage we're going to and from … so people can
 * choose future stages to start from that aren't even done yet").
 *
 * `from` is the task's own `stageId` (absent = the job's stage at the time,
 * so every old task reads as it always did). It may be ANY stage of the
 * workspace, including one the job has not reached — those wear a "not
 * reached yet" hint, and picking one NEVER moves the job (locked answer 10).
 * `to` is `stageWhenDone`, applied by the store at the completion write.
 */
export interface StagePairValue { from: string; to: string }

export interface StagePairStrings {
  onLabel: string;         // "Stage"
  toLabel: string;         // "When it's done, move to"
  jobsStage: string;       // "The job's stage"
  notReached: string;      // "not reached yet"
  leaveAlone: string;      // "Leave the stage alone"
}

export function StagePairPicker({ stages, currentStageId, value, onChange, strings, isRtl, box, hook, labels = true }: {
  /** The workspace's own active stages, sorted. */
  stages: Stage[];
  currentStageId?: string | null;
  value: StagePairValue;
  onChange: (v: StagePairValue) => void;
  strings: StagePairStrings;
  isRtl?: boolean;
  /** The host's input class, so the pair looks native on every form. */
  box?: string;
  hook?: string;
  labels?: boolean;
}) {
  const cur = stages.find(s => s.id === currentStageId);
  const cls = box ?? 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-[#1e3a5f]/25 bg-white';
  const lbl = 'text-[10px] font-bold tracking-wide text-gray-400 uppercase mb-0.5 block';
  return (
    <div data-stage-pair={hook ?? '1'} className="grid grid-cols-[1fr_auto_1fr] items-end gap-1.5">
      <div className="min-w-0">
        {labels && <span className={lbl}>{strings.onLabel}</span>}
        <select data-stage-from value={value.from} onChange={e => onChange({ ...value, from: e.target.value })} className={cls}>
          <option value="">{strings.jobsStage}{cur ? ` · ${getStageName(cur, !!isRtl)}` : ''}</option>
          {stages.map(st => (
            <option key={st.id} value={st.id}>
              {getStageName(st, !!isRtl)}{cur && st.order > cur.order ? ` · ${strings.notReached}` : ''}
            </option>
          ))}
        </select>
      </div>
      <ArrowRight size={13} className={`text-gray-400 flex-shrink-0 mb-2 ${isRtl ? 'rotate-180' : ''}`} />
      <div className="min-w-0">
        {labels && <span className={lbl}>{strings.toLabel}</span>}
        <select data-stage-to value={value.to} onChange={e => onChange({ ...value, to: e.target.value })} className={cls}>
          <option value="">{strings.leaveAlone}</option>
          {stages.map(st => <option key={st.id} value={st.id}>{getStageName(st, !!isRtl)}</option>)}
        </select>
      </div>
    </div>
  );
}

/**
 * "Installation → Drywall" on a task row — the same words on the drawer's
 * Tasks tab, the Tasks page, the worker's phone and the notebook bar. Draws
 * nothing when the task carries neither stage.
 */
export function StagePairPill({ task, stages, isRtl, size = 'sm', className = '' }: {
  task: Pick<ContractorAssignment, 'stageId' | 'stageWhenDone'>;
  stages: Stage[];
  isRtl?: boolean;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const from = task.stageId ? stages.find(s => s.id === task.stageId) : undefined;
  const to = task.stageWhenDone ? stages.find(s => s.id === task.stageWhenDone) : undefined;
  if (!from && !to) return null;
  const fs = size === 'xs' ? 'text-[10px]' : 'text-[11px]';
  return (
    <span data-stage-pill className={`inline-flex items-center gap-1 ${fs} font-semibold ${className}`}>
      {from && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
          style={{ backgroundColor: from.color + '20', color: from.color }}>
          {getStageName(from, !!isRtl)}
        </span>
      )}
      {to && (
        <>
          <ArrowRight size={11} className={`text-gray-400 flex-shrink-0 ${isRtl ? 'rotate-180' : ''}`} />
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: to.color + '20', color: to.color }}>
            {getStageName(to, !!isRtl)}
          </span>
        </>
      )}
    </span>
  );
}

/** The pair's strings, read off the admin strings object. */
export function stagePairStrings(s: {
  stageOnLabel: string; stageToLabel: string; stageJobsStage: string; stageNotReached: string; stageLeaveAlone: string;
}): StagePairStrings {
  return { onLabel: s.stageOnLabel, toLabel: s.stageToLabel, jobsStage: s.stageJobsStage, notReached: s.stageNotReached, leaveAlone: s.stageLeaveAlone };
}
