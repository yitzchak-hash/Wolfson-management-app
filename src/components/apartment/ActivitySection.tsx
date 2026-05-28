import React from 'react';
import { ActivityLog } from '../../types';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';

interface ActivitySectionProps {
  logs: ActivityLog[];
}

function actionLabel(log: ActivityLog): string {
  if (log.actionType === 'note') {
    return `added/updated note for stage`;
  }
  if (log.fieldChanged === 'currentStageId') {
    return `changed stage: "${log.previousValue}" → "${log.newValue}"`;
  }
  if (log.fieldChanged === 'classification') {
    return `changed classification: ${log.previousValue} → ${log.newValue}`;
  }
  if (log.fieldChanged === 'generalNotes') {
    return 'updated general notes';
  }
  if (log.fieldChanged === 'displayName') {
    return `renamed to "${log.newValue}"`;
  }
  return `updated ${log.fieldChanged}`;
}

export function ActivitySection({ logs }: ActivitySectionProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center text-gray-400 text-sm py-6">
        <Clock size={24} className="mx-auto mb-2 opacity-40" />
        No activity yet
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin pr-1">
      {logs.map(log => (
        <div key={log.id} className="flex gap-3 text-xs">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] font-bold">
            {log.userName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-gray-800">{log.userName}</span>
            {' '}
            <span className="text-gray-600">{actionLabel(log)}</span>
            <div className="text-gray-400 mt-0.5">
              {format(new Date(log.createdAt), 'MMM d, yyyy · HH:mm')}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
