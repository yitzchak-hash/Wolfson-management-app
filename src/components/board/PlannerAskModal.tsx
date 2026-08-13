import React from 'react';
import { CalendarDays, Ghost, ArrowRight, X } from 'lucide-react';
import { useStore } from '../../data/store';
import { aptLabel } from '../../types';

/**
 * A dated task was just saved for a job that is already standing on the
 * planner. The office decides what the planner does about it — the three
 * choices the owner confirmed, spelled out in full sentences, because this
 * modal appears mid-thought and has to be answerable without re-reading.
 *
 * Nothing here is automatic: "ask every time" was the explicit ruling.
 */
export function PlannerAskModal() {
  const { plannerAsk, answerPlannerAsk, apartments, contractors, mainUiStrings: s } = useStore();
  if (!plannerAsk) return null;

  const job = apartments.find(a => a.id === plannerAsk.jobId);
  const worker = contractors.find(c => c.id === plannerAsk.contractorId);
  const jobName = job ? aptLabel(job) || job.displayName : 'This job';
  const day = plannerAsk.dueDate;

  const CHOICES = [
    {
      key: 'ghost' as const, icon: Ghost, tone: '#1e3a5f',
      title: s.isRtl ? 'להוסיף רוח ליום הזה' : 'Add a ghost on that day',
      blurb: s.isRtl
        ? `העבודה תופיע גם אצל ${worker?.name ?? 'העובד'} ב־${day}, וההופעה הקיימת נשארת.`
        : `The job appears on ${worker?.name ?? 'the worker'}'s row on ${day} too — the existing entry stays where it is.`,
    },
    {
      key: 'move' as const, icon: ArrowRight, tone: '#b45309',
      title: s.isRtl ? 'להעביר אותה לשם' : 'Move it there',
      blurb: s.isRtl
        ? 'ההופעה הקיימת בלוח יורדת, והעבודה עוברת ליום ולשורה של המשימה החדשה.'
        : 'The existing planner entry comes off, and the job lands on the new row and day instead.',
    },
    {
      key: 'skip' as const, icon: X, tone: '#64748b',
      title: s.isRtl ? 'רק לשמור את המשימה' : 'Just save the task',
      blurb: s.isRtl
        ? 'הלוח לא משתנה בכלל.'
        : 'The planner is not touched at all.',
    },
  ];

  return (
    <div className="fixed inset-0 z-[240] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,.5)' }}
      onClick={() => answerPlannerAsk('skip')}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays size={18} className="text-[#1e3a5f]" />
          <h3 className="font-bold text-gray-900">
            {s.isRtl ? 'העבודה הזאת כבר בלוח השבועי' : 'This job is already on the planner'}
          </h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {s.isRtl
            ? `נשמרה משימה עם תאריך עבור "${jobName}". מה שהלוח יעשה:`
            : `A dated task was just saved for “${jobName}”. What should the planner do?`}
        </p>
        <div className="space-y-2">
          {CHOICES.map(c => (
            <button key={c.key} onClick={() => answerPlannerAsk(c.key)}
              className="w-full flex items-start gap-3 rounded-xl border border-gray-200 p-3 text-left
                         hover:border-[#4aa8d8] hover:bg-[#f6fafd] transition-colors">
              <span className="mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${c.tone}14`, color: c.tone }}>
                <c.icon size={16} />
              </span>
              <span>
                <span className="block text-sm font-bold text-gray-800">{c.title}</span>
                <span className="block text-xs text-gray-500 leading-snug">{c.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
