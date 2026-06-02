import React, { useState } from 'react';
import { useStore } from '../data/store';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';

const ACTION_TYPE_OPTIONS = [
  { value: 'all', label: 'All actions' },
  { value: 'update', label: 'Stage/field change' },
  { value: 'note', label: 'Note' },
  { value: 'task_created', label: 'Task created' },
  { value: 'task_completed', label: 'Task completed' },
  { value: 'task_uncompleted', label: 'Task re-opened' },
  { value: 'task_deleted', label: 'Task deleted' },
  { value: 'contractor_upload', label: 'Contractor upload' },
  { value: 'contractor_note', label: 'Contractor note' },
  { value: 'contractor_complete', label: 'Contractor completed' },
];

export function ActivityLogPage() {
  const { activityLogs, users } = useStore();
  const [userFilter, setUserFilter] = useState('all');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [actionTypeFilter, setActionTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filtered = activityLogs.filter(log => {
    if (userFilter !== 'all' && log.userId !== userFilter) return false;
    if (buildingFilter !== 'all' && log.buildingId !== buildingFilter) return false;
    if (actionTypeFilter !== 'all' && log.actionType !== actionTypeFilter) return false;
    if (dateFrom && log.createdAt < dateFrom) return false;
    if (dateTo && log.createdAt > dateTo + 'T23:59:59') return false;
    return true;
  });

  const hasFilters = userFilter !== 'all' || buildingFilter !== 'all' || actionTypeFilter !== 'all' || dateFrom || dateTo;

  function clearFilters() {
    setUserFilter('all');
    setBuildingFilter('all');
    setActionTypeFilter('all');
    setDateFrom('');
    setDateTo('');
  }

  function actionLabel(log: typeof activityLogs[0]): string {
    switch (log.actionType) {
      case 'task_created':
        return `created task on Apt ${log.apartmentNumber} (${log.buildingId}): "${log.newValue}"`;
      case 'task_completed':
        return `completed task on Apt ${log.apartmentNumber} (${log.buildingId}): "${log.newValue}"`;
      case 'task_uncompleted':
        return `re-opened task on Apt ${log.apartmentNumber} (${log.buildingId}): "${log.previousValue}"`;
      case 'task_deleted':
        return `deleted task on Apt ${log.apartmentNumber} (${log.buildingId}): "${log.previousValue}"`;
      case 'contractor_upload':
        return `uploaded file to Apt ${log.apartmentNumber} (${log.buildingId})`;
      case 'contractor_note':
        return `added contractor note on Apt ${log.apartmentNumber} (${log.buildingId})`;
      case 'contractor_complete':
        return `marked task complete on Apt ${log.apartmentNumber} (${log.buildingId})`;
      case 'note':
        return `added/updated note on Apt ${log.apartmentNumber} (${log.buildingId})`;
      default:
        break;
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

  function actionIcon(actionType: string): string {
    switch (actionType) {
      case 'task_created': return '✚';
      case 'task_completed': return '✓';
      case 'task_uncompleted': return '↩';
      case 'task_deleted': return '✕';
      case 'contractor_upload': return '↑';
      case 'contractor_note': return '✎';
      case 'contractor_complete': return '★';
      case 'note': return '✎';
      default: return '•';
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Activity size={24} className="text-[#1e3a5f]" />
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <span className="ml-auto text-sm text-gray-500">{filtered.length} entries</span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap gap-4 items-end">
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

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">Action type</label>
          <select
            value={actionTypeFilter}
            onChange={e => setActionTypeFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          >
            {ACTION_TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 mb-1.5 block">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Log list */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Activity size={32} className="mx-auto mb-3 opacity-40" />
            <p>No activity logs match current filters</p>
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
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">
                    {format(new Date(log.createdAt), 'MMMM d, yyyy · HH:mm')}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">
                    {actionIcon(log.actionType)} {log.actionType}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
