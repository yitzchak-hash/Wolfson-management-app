import React from 'react';
import { CalendarDays, Check, Undo2 } from 'lucide-react';
import { useStore } from '../../data/store';
import { aptLabel, getStageName } from '../../types';

/**
 * A dated task was just made for a job that ALREADY has work on one of those
 * days — the overlap ask (locked answer 8, 2026-09-15). It used to fire
 * whenever the job had ANY card anywhere on the notebook and offered to add a
 * ghost / move the card / skip — questions about the notebook's own copies,
 * which no longer exist. Now it fires on same job + same day only, names who
 * is already there, and offers exactly two answers: keep the new task, or take
 * it back out so another day can be picked.
 */
export function PlannerAskModal() {
  const { plannerAsk, answerPlannerAsk, apartments, contractors, stages, mainUiStrings: s } = useStore();
  if (!plannerAsk) return null;

  const job = apartments.find(a => a.id === plannerAsk.jobId);
  const jobName = job ? aptLabel(job) || job.displayName : (s.isRtl ? 'העבודה הזאת' : 'This job');
  const other = contractors.find(c => c.id === plannerAsk.overlap.contractorId);
  const stage = plannerAsk.overlap.stageId ? stages.find(st => st.id === plannerAsk.overlap.stageId) : undefined;
  const shared = plannerAsk.days.filter(d => plannerAsk.overlap.days.includes(d));
  const fmt = (iso: string) => new Date(`${iso}T00:00:00`)
    .toLocaleDateString(s.isRtl ? 'he-IL' : 'en-US', { weekday: 'long', day: 'numeric', month: 'short' });
  const when = shared.map(fmt).join(', ');

  return (
    <div data-planner-ask className="fixed inset-0 z-[240] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,.5)' }}
      onClick={() => answerPlannerAsk('keep')}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays size={18} className="text-[#1e3a5f]" />
          <h3 className="font-bold text-gray-900">
            {s.isRtl ? `${jobName} כבר בעבודה ב־${when}` : `${jobName} already has work on ${when}`}
          </h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {other?.name ?? (s.isRtl ? 'מישהו' : 'Somebody')}
          {stage ? ` · ${getStageName(stage, !!s.isRtl)}` : ''}
          {' · '}{plannerAsk.overlap.days.map(fmt).join(', ')}
        </p>
        <div className="flex gap-2 justify-end">
          <button data-ask-remove onClick={() => answerPlannerAsk('remove')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            <Undo2 size={14} />
            {s.isRtl ? 'לבחור יום אחר' : 'Pick another day'}
          </button>
          <button data-ask-keep onClick={() => answerPlannerAsk('keep')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: '#1e3a5f' }}>
            <Check size={14} />
            {s.isRtl ? 'להוסיף בכל זאת' : 'Add anyway'}
          </button>
        </div>
      </div>
    </div>
  );
}
