import React from 'react';
import { useStore } from '../data/store';
import { format } from 'date-fns';
import { Building2, AlertTriangle, CheckCircle2, Clock, FileText, Users } from 'lucide-react';

export function DashboardPage() {
  const { apartments, stages, activityLogs, users } = useStore();

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);
  const total = apartments.length;
  const notStarted = apartments.filter(a => !a.currentStageId).length;
  const shinuiCount = apartments.filter(a => a.classification === 'shinui').length;
  const withNotes = apartments.filter(a => a.generalNotes.trim()).length;
  const recentLogs = activityLogs.slice(0, 10);

  const buildings: Array<'A1' | 'A2' | 'A3'> = ['A1', 'A2', 'A3'];

  function getBuildingProgress(bid: 'A1' | 'A2' | 'A3') {
    const apts = apartments.filter(a => a.buildingId === bid);
    const started = apts.filter(a => a.currentStageId).length;
    return { total: apts.length, started, pct: apts.length > 0 ? Math.round(started / apts.length * 100) : 0 };
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Project Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard icon={<Building2 size={20} />} label="Total Units" value={total} color="#1e3a5f" />
        <SummaryCard icon={<Clock size={20} />} label="Not Started" value={notStarted} color="#6b7280" />
        <SummaryCard icon={<AlertTriangle size={20} />} label="Changes" value={shinuiCount} color="#f59e0b" />
        <SummaryCard icon={<FileText size={20} />} label="With Notes" value={withNotes} color="#10b981" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Stage breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Progress by Stage</h2>
          <div className="space-y-3">
            {sortedStages.map(stage => {
              const count = apartments.filter(a => a.currentStageId === stage.id).length;
              const pct = total > 0 ? Math.round(count / total * 100) : 0;
              return (
                <div key={stage.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm text-gray-700">{stage.name}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-800">{count} <span className="text-gray-400 font-normal text-xs">({pct}%)</span></span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: stage.color }}
                    />
                  </div>
                </div>
              );
            })}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-gray-300" />
                  <span className="text-sm text-gray-500">Not Started</span>
                </div>
                <span className="text-sm font-medium text-gray-500">{notStarted}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gray-300" style={{ width: `${total > 0 ? Math.round(notStarted / total * 100) : 0}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Building breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Progress by Building</h2>
          <div className="space-y-5">
            {buildings.map(bid => {
              const { total: bTotal, started, pct } = getBuildingProgress(bid);
              return (
                <div key={bid}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-[#1e3a5f]">{bid}</span>
                    <span className="text-sm text-gray-600">{started}/{bTotal} units started <span className="text-gray-400">({pct}%)</span></span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: '#1e3a5f' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-gray-100 flex gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#1e3a5f]">
                {total > 0 ? Math.round((total - notStarted) / total * 100) : 0}%
              </div>
              <div className="text-xs text-gray-500">Overall started</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-500">{shinuiCount}</div>
              <div className="text-xs text-gray-500">Changes units</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-500">{notStarted}</div>
              <div className="text-xs text-gray-500">Not started</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Recent Activity</h2>
        {recentLogs.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No activity yet</p>
        ) : (
          <div className="space-y-3">
            {recentLogs.map(log => (
              <div key={log.id} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] font-bold text-sm flex-shrink-0">
                  {log.userName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-medium text-gray-800">{log.userName}</span>
                    {' '}
                    <span className="text-gray-600">
                      {log.fieldChanged === 'currentStageId'
                        ? `changed stage of Apt ${log.apartmentNumber} (${log.buildingId}): "${log.previousValue}" → "${log.newValue}"`
                        : log.actionType === 'note'
                          ? `added note on Apt ${log.apartmentNumber} (${log.buildingId})`
                          : `updated ${log.fieldChanged} of Apt ${log.apartmentNumber} (${log.buildingId})`
                      }
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {format(new Date(log.createdAt), 'MMM d, yyyy · HH:mm')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '15', color }}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}
