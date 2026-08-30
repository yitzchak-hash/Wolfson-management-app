import React, { useState } from 'react';
import { ActivityLog, BackupSnapshot } from '../../types';
import { format } from 'date-fns';
import { Clock, RotateCcw } from 'lucide-react';
import { useStore } from '../../data/store';

interface ActivitySectionProps {
  logs: ActivityLog[];
  autoBackup?: boolean;
  backupSnapshots?: BackupSnapshot[];
  onRestore?: (snapshotId: string) => void;
}

export function ActivitySection({ logs, autoBackup, backupSnapshots, onRestore }: ActivitySectionProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const s = useStore(state => state.mainUiStrings);

  function actionLabel(log: ActivityLog): string {
    if (log.actionType === 'opened') return s.openedJob;
    if (log.actionType === 'note') return s.updatedStageNote;
    if (log.actionType === 'contractor_upload') return `${s.uploadedFile} ${log.newValue}`;
    if (log.actionType === 'contractor_note') return s.addedNote;
    if (log.actionType === 'contractor_complete') return s.markedComplete;
    if (log.fieldChanged === 'currentStageId') return s.changedStage;
    if (log.fieldChanged === 'classification') return `${s.changedClassification} ${log.previousValue} → ${log.newValue}`;
    if (log.fieldChanged === 'generalNotes') return s.updatedGeneralNotes;
    if (log.fieldChanged === 'displayName') return `${s.renamedApartment}${log.newValue}"`;
    return `${s.updatedStageNote} ${log.fieldChanged}`;
  }

  if (logs.length === 0) {
    return (
      <div className="text-center text-gray-400 text-sm py-6">
        <Clock size={24} className="mx-auto mb-2 opacity-40" />
        {s.noActivityYet2}
      </div>
    );
  }

  return (
    <div className="space-y-2 pr-1">
      {logs.map(log => {
        const snapshot = autoBackup ? backupSnapshots?.find(s => s.activityLogId === log.id) : undefined;
        const isConfirming = confirmingId === log.id;

        const hasNoteContent = (log.actionType === 'note' || log.actionType === 'contractor_note' || log.fieldChanged === 'generalNotes') && log.newValue;
        const hasStageChange = log.fieldChanged === 'currentStageId';

        /**
         * A history entry whose name did not survive the round trip.
         *
         * `userName` is REQUIRED by the type and was still undefined on real
         * records: a task created without a `createdByName` writes the field
         * as undefined, and `fsSet` turns an undefined into a delete — so the
         * stored entry has no name at all, and `.charAt(0)` on it took the
         * whole History tab down with it. The type cannot protect a value
         * that came back from the cloud; the render has to cope.
         */
        const who = log.userName || s.unknownUser;

        return (
          <div key={log.id} className="flex gap-3 text-xs">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] font-bold">
              {who.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-gray-800">{who}</span>
              {' '}
              <span className="text-gray-600">{actionLabel(log)}</span>
              {log.apartmentNumber && (
                <span className="text-gray-400"> · Apt {log.apartmentNumber}</span>
              )}

              {/* Note content block */}
              {hasNoteContent && (
                <div className="mt-1 px-2 py-1.5 rounded-md bg-gray-50 border border-gray-100 text-gray-700 leading-snug text-[11px] whitespace-pre-wrap break-words">
                  {log.newValue}
                </div>
              )}

              {/* Stage change visualization */}
              {hasStageChange && (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] flex-wrap">
                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{log.previousValue || s.notStartedFallback}</span>
                  <span className="text-gray-400">→</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#1e3a5f]/10 text-[#1e3a5f] font-medium">{log.newValue || s.notStartedFallback}</span>
                </div>
              )}

              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-gray-400">{format(new Date(log.createdAt), 'MMM d, yyyy · HH:mm')}</span>

                {snapshot && onRestore && (
                  isConfirming ? (
                    <span className="flex items-center gap-1">
                      <span className="text-amber-600 font-medium">{s.revertConfirmMsg}</span>
                      <button
                        onClick={() => { onRestore(snapshot.id); setConfirmingId(null); }}
                        className="px-1.5 py-0.5 rounded bg-amber-500 text-white font-medium text-[10px]"
                      >{s.yesBtn}</button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-medium text-[10px]"
                      >{s.cancel}</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(log.id)}
                      className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-amber-600 transition-colors"
                      title={s.restoreTooltip}
                    >
                      <RotateCcw size={9} /> {s.restoreBtn}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
