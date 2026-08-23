import React from 'react';
import { Apartment, Stage, ContractorAssignment, getStageName } from '../../types';
import { DriveStatus } from '../ui/DriveStatus';
import { anyRota } from '../../data/rotaDrop';
import { usePlannerDrag } from '../../data/plannerDrop';
import { tint } from './PlannerWidget';

/**
 * A job, in one row, everywhere a job is listed.
 *
 * Every widget that mentioned a job printed its name as grey text and nothing
 * else — no stage, no outstanding work, no sign of whether its Drive folder was
 * set up. Which meant a list of six jobs told you six names and, to learn
 * anything about any of them, you opened each in turn.
 *
 * This is the same reading a board tile gives, compressed into a line: the
 * stage as a coloured dot and a word, how many tasks are outstanding, and the
 * Drive light. One component, used by every list, so those readings can never
 * disagree with each other or with the board.
 *
 * **And it drags onto the notebook, like a board tile.** Only board tiles could
 * be planned, so a job noticed in "Running late" or "New this week" — which is
 * exactly where you notice it needs a day — had to be hunted down on the board
 * first. Every list that draws a MiniJob now inherits the gesture.
 */
export function MiniJob({ job, stages, assignments, onOpen, rtl, size = 11, sub, onToast }: {
  job: Apartment;
  stages: Stage[];
  assignments: ContractorAssignment[];
  onOpen: (id: string) => void;
  rtl?: boolean;
  /** Text size, so a widget scaled up scales its rows too. */
  size?: number;
  /** An extra line under the name — a due date, a contractor, whatever fits. */
  sub?: React.ReactNode;
  /** Said after a successful drop. Absent = say nothing. */
  onToast?: (msg: string) => void;
}) {
  const stage = stages.find(s => s.id === job.currentStageId);
  const pending = assignments.filter(a => a.apartmentId === job.id && !a.completedAt).length;

  // The same gesture a board tile has, from the one place it is written.
  const planner = usePlannerDrag(job.id, {
    onToast,
    label: job.displayName?.trim() || job.address?.trim() || 'Job',
  });

  return (
    <button
      data-no-drag data-el-action
      {...planner.handlers}
      onClick={() => onOpen(job.id)}
      title={`Open ${job.displayName || 'this job'}${anyRota() ? ' · drag it onto a day' : ''}`}
      className="group/mj w-full text-left flex items-center gap-1.5 px-1.5 py-[3px] rounded-md
                 hover:bg-slate-50 transition-colors min-w-0"
      style={{
        ...planner.style,
        // The row wears its stage — the same tint idiom as a planner card, so
        // a list reads as colour-coded work rather than a column of grey text.
        backgroundColor: stage ? tint(stage.color, 0.12) : undefined,
        boxShadow: stage ? 'inset 0 0 0 1px rgba(15,23,42,.05)' : undefined,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: stage?.color ?? '#cbd5e1' }}
        title={stage ? getStageName(stage, !!rtl) : 'Not started'}
      />

      <span className="flex-1 min-w-0">
        <span className="block truncate font-semibold text-slate-700 group-hover/mj:text-[#1e3a5f]"
          style={{ fontSize: size }}>
          {job.displayName?.trim() || job.address?.trim() || 'Job'}
        </span>
        {(sub || stage) && (
          <span className="block truncate text-slate-400" style={{ fontSize: Math.max(7, size - 2) }}>
            {sub ?? getStageName(stage!, !!rtl)}
          </span>
        )}
      </span>

      {pending > 0 && (
        <span
          className="flex-shrink-0 px-1 rounded-full font-bold tabular-nums"
          style={{
            fontSize: Math.max(7, size - 3),
            backgroundColor: 'rgba(217,119,6,.14)',
            color: '#b45309',
          }}
          title={`${pending} task${pending === 1 ? '' : 's'} still open`}
        >
          {pending}
        </span>
      )}

      <span className="flex-shrink-0"><DriveStatus job={job} /></span>
    </button>
  );
}
