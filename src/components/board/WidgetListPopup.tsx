import React from 'react';
import { X } from 'lucide-react';
import { useStore } from '../../data/store';
import { MiniJob } from './MiniJob';

/**
 * The list behind a number.
 *
 * Any widget figure can be clicked open into this: the same MiniJob rows used
 * everywhere a job is listed, so the drill-down looks like the rest of the app
 * rather than like a debug dump. The host supplies openJob so a row goes on to
 * the job itself.
 */
export function WidgetListPopup({ title, jobIds, onOpenJob, onClose }: {
  title: string;
  jobIds: string[];
  onOpenJob: (id: string) => void;
  onClose: () => void;
}) {
  const { apartments, stages, contractorAssignments } = useStore();
  const jobs = jobIds
    .map(id => apartments.find(a => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a);

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15,23,42,.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-bold text-gray-900 text-sm flex-1 truncate">{title}</h3>
          <span className="text-[11px] font-bold text-gray-400 tabular-nums">{jobs.length}</span>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {jobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Nothing behind this number.</p>
          ) : jobs.map(j => (
            <MiniJob key={j.id} job={j} stages={stages} assignments={contractorAssignments}
              onOpen={id => { onClose(); onOpenJob(id); }} />
          ))}
        </div>
      </div>
    </div>
  );
}
