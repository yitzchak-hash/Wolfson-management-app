import React, { useMemo } from 'react';
import { AlertTriangle, ArrowRightLeft, Trash2 } from 'lucide-react';
import { useStore } from '../../data/store';
import { ContractorAssignment } from '../../types';
import { taskBaggage } from '../../data/taskMove';
import { DialogShell, officeMoveWords, baggagePhrases, joinList, fill } from './MoveTaskDialog';
import { TrText } from '../ui/Translated';

/**
 * DELETING A TASK SAYS WHAT GOES WITH IT (owner, 2026-10-05).
 *
 * The old ask was the browser's own "Delete this task?" — and pressing OK
 * also removed the task's whole conversation, its photos and a film from the
 * app, without a word about any of it (`deleteContractorAssignment`
 * cascades). This one counts them first, says the files themselves stay in
 * Google Drive when they are there, and offers the thing that was usually
 * meant instead: moving the task to the apartment it really belongs to.
 *
 * Same sealed portal shell as the move dialog, z-[130]/[140], Escape in the
 * capture phase — it is opened from inside the job window.
 */
export function DeleteTaskDialog({ task, onClose, onDeleted, onMoveInstead }: {
  task: ContractorAssignment;
  onClose: () => void;
  onDeleted?: () => void;
  /** Offered only for a task that sits on an apartment (never a general job). */
  onMoveInstead?: () => void;
}) {
  const ui = useStore(st => st.mainUiStrings);
  const photos = useStore(st => st.contractorPhotos);
  const notes = useStore(st => st.contractorNotes);
  const jobBoard = useStore(st => st.currentProjectId === 'general');
  const deleteContractorAssignment = useStore(st => st.deleteContractorAssignment);
  const w = officeMoveWords(ui, jobBoard);
  const baggage = useMemo(() => taskBaggage(task.id, photos, notes), [task.id, photos, notes]);
  const things = baggagePhrases(baggage, w);
  const canMove = !!onMoveInstead && !!task.apartmentId && !task.general;

  return (
    <DialogShell hook="data-task-delete-dialog" rtl={w.rtl} width={420} onClose={onClose}>
      <div className="px-5 pt-5 pb-4 text-center overflow-y-auto">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle size={22} className="text-red-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-base mb-1">{ui.deleteTaskConfirm}</h3>
        <p className="text-sm font-medium text-gray-700 mb-3 line-clamp-3">
          <bdi>"<TrText text={task.taskDescription || '—'} to={w.lang} />"</bdi>
        </p>
        <p className="text-sm text-gray-600 mb-1" data-task-delete-impact>
          {things.length
            ? <>{fill(ui.delTaskAlso, { things: '\u0002' }).split('\u0002').map((p, i, all) => (
                <React.Fragment key={i}>
                  {p}
                  {i < all.length - 1 && <span className="font-semibold text-red-600">{joinList(things, w)}</span>}
                </React.Fragment>
              ))}</>
            : ui.delTaskNothing}
        </p>
        {baggage.onDrive && <p className="text-sm text-gray-600 mb-1" data-task-delete-drive>{ui.delTaskDrive}</p>}
        <p className="text-xs text-gray-400">{ui.delTaskNoUndo}</p>
      </div>
      <div className="px-5 pb-5 space-y-2">
        {canMove && (
          <button type="button" data-task-delete-move
            onClick={() => { onClose(); onMoveInstead!(); }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#1e3a5f]/25 bg-[#1e3a5f]/5 text-[#1e3a5f] text-sm font-bold hover:bg-[#1e3a5f]/10">
            <ArrowRightLeft size={15} />
            {jobBoard ? ui.delTaskMoveInsteadJob : ui.delTaskMoveInstead}
          </button>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
            {ui.cancel}
          </button>
          <button type="button" data-task-delete-yes
            onClick={() => { deleteContractorAssignment(task.id); onClose(); onDeleted?.(); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold">
            <Trash2 size={14} /> {ui.delete}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
