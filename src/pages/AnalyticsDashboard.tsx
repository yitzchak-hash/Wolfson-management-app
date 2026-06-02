import React, { useMemo } from 'react';
import { useStore } from '../data/store';
import { format, subWeeks, startOfWeek, endOfWeek } from 'date-fns';
import { Building2, TrendingUp, CheckCircle2, Clock, Users, Wrench } from 'lucide-react';

function VelocityChart({ title, data, color, bgCard, borderColor, textPrimary, textSub }: {
  title: string;
  data: { label: string; value: number }[];
  color: string;
  bgCard: string;
  borderColor: string;
  textPrimary: string;
  textSub: string;
}) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="rounded-2xl border p-5 shadow-sm" style={{ backgroundColor: bgCard, borderColor }}>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={16} style={{ color }} />
        <h2 className="font-semibold text-sm" style={{ color: textPrimary }}>{title}</h2>
      </div>
      <div className="flex items-end gap-1.5 h-28">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <span className="text-[9px] font-medium" style={{ color: textSub }}>{d.value > 0 ? d.value : ''}</span>
            <div
              className="w-full rounded-t transition-all duration-500 min-h-[2px]"
              style={{ height: `${Math.round((d.value / maxVal) * 100)}%`, backgroundColor: color + 'cc' }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[8px]" style={{ color: textSub }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-600 w-9 text-right">{pct}%</span>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: color + '18', color }}
        >
          <Icon size={20} />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm font-medium text-gray-700 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export function AnalyticsDashboard() {
  const { apartments, stages, activityLogs, contractors, contractorAssignments, lightTheme, mainUiStrings: s } = useStore();

  const sortedStages = useMemo(() => [...stages].filter(s => s.active).sort((a, b) => a.order - b.order), [stages]);

  const stats = useMemo(() => {
    const residentialApts = apartments.filter(a => !a.isUnnamed && a.floor > 0);
    const total = residentialApts.length;
    const started = residentialApts.filter(a => a.currentStageId).length;
    const byStage = new Map<string, number>();
    sortedStages.forEach(s => byStage.set(s.id, 0));
    residentialApts.forEach(a => {
      if (a.currentStageId) byStage.set(a.currentStageId, (byStage.get(a.currentStageId) ?? 0) + 1);
    });

    const byBuilding = ['A1', 'A2', 'A3'].map(bid => {
      const bApts = residentialApts.filter(a => a.buildingId === bid);
      const bStarted = bApts.filter(a => a.currentStageId).length;
      return { building: bid, total: bApts.length, started: bStarted };
    });

    return { total, started, byStage, byBuilding };
  }, [apartments, sortedStages]);

  const contractorStats = useMemo(() => {
    const total = contractorAssignments.length;
    const completed = contractorAssignments.filter(a => a.completedAt).length;
    const pending = total - completed;
    const overdue = contractorAssignments.filter(a =>
      !a.completedAt && a.dueDate && new Date(a.dueDate) < new Date()
    ).length;
    return { total, completed, pending, overdue };
  }, [contractorAssignments]);

  const recentActivity = useMemo(() =>
    [...activityLogs].slice(0, 15),
    [activityLogs]
  );

  const velocityData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 8 }, (_, i) => {
      const weekDate = subWeeks(now, 7 - i);
      const wStart = startOfWeek(weekDate).toISOString();
      const wEnd = endOfWeek(weekDate).toISOString();
      const label = format(weekDate, 'MMM d');

      // Count stage date entries that fall in this week
      let stageCompletions = 0;
      apartments.forEach(a => {
        if (!a.stageDates) return;
        Object.values(a.stageDates).forEach(dateStr => {
          if (dateStr >= wStart && dateStr <= wEnd) stageCompletions++;
        });
      });

      // Count completed tasks in this week
      const tasksCompleted = contractorAssignments.filter(a =>
        a.completedAt && a.completedAt >= wStart && a.completedAt <= wEnd
      ).length;

      return { label, stageCompletions, tasksCompleted };
    });
  }, [apartments, contractorAssignments]);

  const bgPage = lightTheme ? '#f8fafc' : '#0f1b2d';
  const bgCard = lightTheme ? 'white' : '#1a2d45';
  const textPrimary = lightTheme ? '#111827' : '#f1f5f9';
  const textSub = lightTheme ? '#6b7280' : '#94a3b8';
  const borderColor = lightTheme ? '#e5e7eb' : '#2d4a6a';

  return (
    <div className="p-6 max-w-5xl mx-auto" style={{ color: textPrimary }}>
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp size={22} style={{ color: '#4aa8d8' }} />
        <h1 className="text-2xl font-bold">{s.pageAnalytics}</h1>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label={s.totalApartments}
          value={stats.total}
          sub={s.residentialUnits}
          icon={Building2}
          color="#1e3a5f"
        />
        <StatCard
          label={s.workStarted}
          value={stats.started}
          sub={`${stats.total - stats.started} ${s.notYetStarted}`}
          icon={TrendingUp}
          color="#4aa8d8"
        />
        <StatCard
          label={s.contractorsLabel}
          value={contractors.filter(c => c.active).length}
          sub={`${contractorStats.total} ${s.totalAssignments}`}
          icon={Users}
          color="#8b5cf6"
        />
        <StatCard
          label={s.tasksCompletedLabel}
          value={contractorStats.completed}
          sub={`${contractorStats.pending} ${s.pendingLabel.toLowerCase()}`}
          icon={CheckCircle2}
          color="#22c55e"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Progress by building */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm" style={{ backgroundColor: bgCard, borderColor }}>
          <h2 className="font-semibold mb-4" style={{ color: textPrimary }}>{s.progressByBuilding}</h2>
          <div className="space-y-4">
            {stats.byBuilding.map(({ building, total, started }) => (
              <div key={building}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold" style={{ color: textPrimary }}>{building}</span>
                  <span className="text-xs" style={{ color: textSub }}>{started} / {total}</span>
                </div>
                <ProgressBar value={started} max={total} color="#4aa8d8" />
              </div>
            ))}
          </div>
        </div>

        {/* Stage distribution */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm" style={{ backgroundColor: bgCard, borderColor }}>
          <h2 className="font-semibold mb-4" style={{ color: textPrimary }}>{s.progressByStage}</h2>
          <div className="space-y-3">
            {sortedStages.map(s => {
              const count = stats.byStage.get(s.id) ?? 0;
              return (
                <div key={s.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-xs font-medium truncate" style={{ color: textPrimary }}>{s.name}</span>
                    </div>
                    <span className="text-xs font-bold ml-2" style={{ color: textSub }}>{count}</span>
                  </div>
                  <ProgressBar value={count} max={stats.total} color={s.color} />
                </div>
              );
            })}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-gray-200" />
                  <span className="text-xs font-medium" style={{ color: textPrimary }}>{s.notStarted}</span>
                </div>
                <span className="text-xs font-bold" style={{ color: textSub }}>{stats.total - stats.started}</span>
              </div>
              <ProgressBar value={stats.total - stats.started} max={stats.total} color="#e5e7eb" />
            </div>
          </div>
        </div>
      </div>

      {/* Velocity charts */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <VelocityChart
          title={s.stageCompletionsWeek}
          data={velocityData.map(w => ({ label: w.label, value: w.stageCompletions }))}
          color="#4aa8d8"
          bgCard={bgCard}
          borderColor={borderColor}
          textPrimary={textPrimary}
          textSub={textSub}
        />
        <VelocityChart
          title={s.tasksCompletedWeek}
          data={velocityData.map(w => ({ label: w.label, value: w.tasksCompleted }))}
          color="#22c55e"
          bgCard={bgCard}
          borderColor={borderColor}
          textPrimary={textPrimary}
          textSub={textSub}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Contractor task summary */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm" style={{ backgroundColor: bgCard, borderColor }}>
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={16} style={{ color: '#8b5cf6' }} />
            <h2 className="font-semibold" style={{ color: textPrimary }}>{s.contractorTasksSection}</h2>
          </div>

          {contractorStats.total === 0 ? (
            <p className="text-sm" style={{ color: textSub }}>{s.noContractorAssignments}</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: s.pendingLabel, value: contractorStats.pending, color: '#f59e0b' },
                  { label: s.completedLabel, value: contractorStats.completed, color: '#22c55e' },
                  { label: s.overdue, value: contractorStats.overdue, color: '#ef4444' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl py-3" style={{ backgroundColor: color + '12' }}>
                    <div className="text-xl font-bold" style={{ color }}>{value}</div>
                    <div className="text-xs font-medium" style={{ color: textSub }}>{label}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mt-2">
                {contractors.filter(c => c.active).map(c => {
                  const assigned = contractorAssignments.filter(a => a.contractorId === c.id);
                  const done = assigned.filter(a => a.completedAt).length;
                  return (
                    <div key={c.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{
                          backgroundColor: c.category === 'drywall' ? '#f59e0b' : c.category === 'ac' ? '#3b82f6' : '#10b981'
                        }} />
                        <span className="text-sm truncate" style={{ color: textPrimary }}>{c.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ color: textSub, backgroundColor: lightTheme ? '#f3f4f6' : '#1e3a5f' }}>
                          {c.category}
                        </span>
                      </div>
                      <span className="text-xs flex-shrink-0" style={{ color: textSub }}>
                        {done}/{assigned.length}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm" style={{ backgroundColor: bgCard, borderColor }}>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} style={{ color: '#4aa8d8' }} />
            <h2 className="font-semibold" style={{ color: textPrimary }}>{s.recentActivity}</h2>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm" style={{ color: textSub }}>{s.noActivity}</p>
          ) : (
            <div className="space-y-2.5">
              {recentActivity.map(log => (
                <div key={log.id} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#4aa8d8] mt-2 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed" style={{ color: textPrimary }}>
                      <span className="font-semibold">{log.userName}</span>
                      {' '}{s.updatedStageNote}{' '}
                      <span className="font-medium">{log.buildingId} · {s.aptPrefix} {log.apartmentNumber}</span>
                      {log.fieldChanged === 'currentStageId' && (
                        <> → <span style={{ color: '#4aa8d8' }}>{log.newValue}</span></>
                      )}
                    </p>
                    <p className="text-[10px]" style={{ color: textSub }}>
                      {format(new Date(log.createdAt), 'MMM d, HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
