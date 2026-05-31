import React, { useState } from 'react';
import { ActivityLog, BackupSnapshot } from '../../types';
import { format } from 'date-fns';
import { Clock, RotateCcw } from 'lucide-react';

interface ActivitySectionProps {
  logs: ActivityLog[];
  autoBackup?: boolean;
  backupSnapshots?: BackupSnapshot[];
  onRestore?: (snapshotId: string) => void;
}

function actionLabel(log: ActivityLog): string {
  if (log.actionType === 'note') return 'added/updated stage note';
  if (log.actionType === 'contractor_upload') return `uploaded file: ${log.newValue}`;
  if (log.actionType === 'contractor_note') return `added note: "${log.newValue}"`;
  if (log.actionType === 'contractor_complete') return 'marked task complete';
  if (log.fieldChanged === 'currentStageId') return `changed stage: "${log.previousValue}" → "${log.newValue}"`;
  if (log.fieldChanged === 'classification') return `changed classification: ${log.previousValue} → ${log.newValue}`;
  if (log.fieldChanged === 'generalNotes') return 'updated general notes';
  if (log.fieldChanged === 'displayName') return `renamed to "${log.newValue}"`;
  return `updated ${log.fieldChanged}`;
}

export function ActivitySection({ logs, autoBackup, backupSnapshots, onRestore }: ActivitySectionProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (logs.length === 0) {
    return (
      <div className="text-center text-gray-400 text-sm py-6">
        <Clock size={24} className="mx-auto mb-2 opacity-40" />
        No activity yet
      </div>
    );
  }

  return (
    <div className="space-y-2 pr-1">
      {logs.map(log => {
        const snapshot = autoBackup ? backupSnapshots?.find(s => s.activityLogId === log.id) : undefined;
        const isConfirming = confirmingId === log.id;

        return (
          <div key={log.id} className="flex gap-3 text-xs">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] font-bold">
              {log.userName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-gray-800">{log.userName}</span>
              {' '}
              <span className="text-gray-600">{actionLabel(log)}</span>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-gray-400">{format(new Date(log.createdAt), 'MMM d, yyyy · HH:mm')}</span>

                {snapshot && onRestore && (
                  isConfirming ? (
                    <span className="flex items-center gap-1">
                      <span className="text-amber-600 font-medium">Revert all data to this point?</span>
                      <button
                        onClick={() => { onRestore(snapshot.id); setConfirmingId(null); }}
                        className="px-1.5 py-0.5 rounded bg-amber-500 text-white font-medium text-[10px]"
                      >Yes</button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-medium text-[10px]"
                      >Cancel</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(log.id)}
                      className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-amber-600 transition-colors"
                      title="Restore to state before this change"
                    >
                      <RotateCcw size={9} /> Restore
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
