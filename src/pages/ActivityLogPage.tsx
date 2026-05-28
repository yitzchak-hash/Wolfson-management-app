import React, { useState } from 'react';
import { useStore } from '../data/store';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';

export function ActivityLogPage() {
  const { activityLogs, users } = useStore();
  const [userFilter, setUserFilter] = useState('all');
  const [buildingFilter, setBuildingFilter] = useState('all');

  const filtered = activityLogs.filter(log => {
    if (userFilter !== 'all' && log.userId !== userFilter) return false;
    if (buildingFilter !== 'all' && log.buildingId !== buildingFilter) return false;
    return true;
  });

  function actionLabel(log: typeof activityLogs[0]): string {
    if (log.actionType === 'note') {
      return `added/updated note on Apt ${log.apartmentNumber} (${log.buildingId})`;
    }
    if (log.fieldChanged === 'currentStageId') {
      return `changed stage of Apt ${log.apartmentNumber} (${log.buildingId}): "${log.previousValue}" → "${log.newValue}"`;
    }
    if (log.fieldChanged === 'classification') {
      return `marked Apt ${log.apartmentNumber} (${log.buildingId}) as ${log.newValue}`;
    }
    if (log.fieldChanged === 'generalNotes') {
      return `updated notes for Apt ${log.apartmentNumber} (${log.buildingId})`;
    }
    if (log.fieldChanged === 'displayName') {
      return `renamed Apt in ${log.buildingId} to "${log.newValue}"`;
    }
    return `updated ${log.fieldChanged} for Apt ${log.apartmentNumber} (${log.buildingId})`;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Activity size={24} className="text-[#1e3a5f]" />
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <span className="ml-auto text-sm text-gray-500">{filtered.length} entries</span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">User</label>
          <select
            value={userFilter}
            onChange={e => setUserFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          >
            <option value="all">All users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">Building</label>
          <div className="flex gap-1">
            {(['all', 'A1', 'A2', 'A3'] as const).map(b => (
              <button
                key={b}
                onClick={() => setBuildingFilter(b)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  buildingFilter === b ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {b === 'all' ? 'All' : b}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Log list */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Activity size={32} className="mx-auto mb-3 opacity-40" />
            <p>No activity logs yet</p>
          </div>
        ) : (
          filtered.map(log => (
            <div key={log.id} className="flex gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] font-bold text-sm mt-0.5">
                {log.userName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="font-semibold text-gray-800">{log.userName}</span>
                  {' '}
                  <span className="text-gray-600">{actionLabel(log)}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {format(new Date(log.createdAt), 'MMMM d, yyyy · HH:mm')}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
