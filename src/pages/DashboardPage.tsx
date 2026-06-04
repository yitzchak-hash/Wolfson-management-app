import React, { useState } from 'react';
import { useStore } from '../data/store';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Building2, AlertTriangle, CheckCircle2, Clock, FileText, ClipboardList, AlertCircle, X, ChevronRight } from 'lucide-react';
import { getStageName } from '../types';

type ModalKind = 'changes' | 'notes' | 'overdue' | 'pending' | 'completedToday' | null;

export function DashboardPage() {
  const { apartments, stages, activityLogs, contractorAssignments, mainUiStrings: s, setPendingOpenAptId } = useStore();
  const navigate = useNavigate();
  const [modal, setModal] = useState<ModalKind>(null);

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);
  const total = apartments.length;
  const notStarted = apartments.filter(a => !a.currentStageId).length;
  const shinuiCount = apartments.filter(a => a.classification === 'shinui' && !a.isUnnamed).length;
  const withNotes = apartments.filter(a => a.generalNotes.trim() && !a.isUnnamed).length;
  const recentLogs = activityLogs.slice(0, 10);

  const today = new Date().toISOString().split('T')[0];
  const overdueTasks = contractorAssignments.filter(a => !a.completedAt && a.dueDate && a.dueDate < today).length;
  const pendingTasks = contractorAssignments.filter(a => !a.completedAt).length;
  const completedToday = contractorAssignments.filter(a => a.completedAt && a.completedAt.startsWith(today)).length;

  const buildings: Array<'A1' | 'A2' | 'A3'> = ['A1', 'A2', 'A3'];

  function getBuildingProgress(bid: 'A1' | 'A2' | 'A3') {
    const apts = apartments.filter(a => a.buildingId === bid);
    const started = apts.filter(a => a.currentStageId).length;
    return { total: apts.length, started, pct: apts.length > 0 ? Math.round(started / apts.length * 100) : 0 };
  }

  function openApartment(aptId: string) {
    setPendingOpenAptId(aptId);
    setModal(null);
    navigate('/project');
  }

  function getModalTitle() {
    if (modal === 'changes') return s.changes;
    if (modal === 'notes') return s.withNotes;
    if (modal === 'overdue') return s.overdueTasks;
    if (modal === 'pending') return s.pendingTasks;
    if (modal === 'completedToday') return s.completedToday;
    return '';
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{s.pageDashboard}</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <SummaryCard icon={<Building2 size={20} />} label={s.totalUnits} value={total} color="#1e3a5f" />
        <SummaryCard icon={<Clock size={20} />} label={s.notStarted} value={notStarted} color="#6b7280" />
        <SummaryCard
          icon={<AlertTriangle size={20} />}
          label={s.changes}
          value={shinuiCount}
          color="#f59e0b"
          onClick={() => setModal('changes')}
          clickable
        />
        <SummaryCard
          icon={<FileText size={20} />}
          label={s.withNotes}
          value={withNotes}
          color="#10b981"
          onClick={() => setModal('notes')}
          clickable
        />
      </div>

      {/* Task summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <SummaryCard
          icon={<AlertCircle size={20} />}
          label={s.overdueTasks}
          value={overdueTasks}
          color="#ef4444"
          onClick={() => setModal('overdue')}
          clickable
        />
        <SummaryCard
          icon={<ClipboardList size={20} />}
          label={s.pendingTasks}
          value={pendingTasks}
          color="#4aa8d8"
          onClick={() => setModal('pending')}
          clickable
        />
        <SummaryCard
          icon={<CheckCircle2 size={20} />}
          label={s.completedToday}
          value={completedToday}
          color="#10b981"
          onClick={() => setModal('completedToday')}
          clickable
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Stage breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">{s.progressByStage}</h2>
          <div className="space-y-3">
            {sortedStages.map(stage => {
              const count = apartments.filter(a => a.currentStageId === stage.id).length;
              const pct = total > 0 ? Math.round(count / total * 100) : 0;
              return (
                <div key={stage.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-sm text-gray-700">{getStageName(stage, s.isRtl)}</span>
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
                  <span className="text-sm text-gray-500">{s.notStarted}</span>
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
          <h2 className="font-semibold text-gray-800 mb-4">{s.progressByBuilding}</h2>
          <div className="space-y-5">
            {buildings.map(bid => {
              const { total: bTotal, started, pct } = getBuildingProgress(bid);
              return (
                <div key={bid}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-[#1e3a5f]">{bid}</span>
                    <span className="text-sm text-gray-600">{started}/{bTotal} {s.unitsStarted} <span className="text-gray-400">({pct}%)</span></span>
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
              <div className="text-xs text-gray-500">{s.overallStarted}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-500">{shinuiCount}</div>
              <div className="text-xs text-gray-500">{s.changesUnits}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-500">{notStarted}</div>
              <div className="text-xs text-gray-500">{s.notStarted}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">{s.recentActivity}</h2>
        {recentLogs.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">{s.noActivity}</p>
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
                        ? `${s.activityChangedStage} ${s.aptPrefix} ${log.apartmentNumber} (${log.buildingId}): "${log.previousValue}" → "${log.newValue}"`
                        : log.actionType === 'note'
                          ? `${s.activityAddedNote} ${s.aptPrefix} ${log.apartmentNumber} (${log.buildingId})`
                          : `${s.activityUpdatedField} ${log.fieldChanged} ${s.activityOf} ${s.aptPrefix} ${log.apartmentNumber} (${log.buildingId})`
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

      {/* Modal */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-bold text-gray-900 text-base">{getModalTitle()}</h3>
              <button
                onClick={() => setModal(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Apartment modals: Changes and With Notes */}
              {(modal === 'changes' || modal === 'notes') && (() => {
                const list = modal === 'changes'
                  ? apartments.filter(a => a.classification === 'shinui' && !a.isUnnamed)
                  : apartments.filter(a => a.generalNotes.trim() && !a.isUnnamed);
                if (list.length === 0) {
                  return <div className="py-12 text-center text-gray-400 text-sm">No items</div>;
                }
                return (
                  <div className="divide-y divide-gray-50">
                    {list.map(apt => {
                      const stage = stages.find(st => st.id === apt.currentStageId);
                      return (
                        <button
                          key={apt.id}
                          onClick={() => openApartment(apt.id)}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-[#1e3a5f]">{apt.buildingId}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">
                              {apt.displayName || `${s.aptPrefix} ${apt.apartmentNumber}`}
                            </p>
                            {stage && (
                              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                                {getStageName(stage, s.isRtl)}
                              </p>
                            )}
                            {modal === 'notes' && apt.generalNotes && (
                              <p className="text-xs text-gray-400 truncate mt-0.5">{apt.generalNotes}</p>
                            )}
                          </div>
                          <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Task modals: Overdue, Pending, Completed Today */}
              {(modal === 'overdue' || modal === 'pending' || modal === 'completedToday') && (() => {
                const list = modal === 'overdue'
                  ? contractorAssignments.filter(a => !a.completedAt && a.dueDate && a.dueDate < today)
                  : modal === 'pending'
                    ? contractorAssignments.filter(a => !a.completedAt)
                    : contractorAssignments.filter(a => a.completedAt && a.completedAt.startsWith(today));
                if (list.length === 0) {
                  return <div className="py-12 text-center text-gray-400 text-sm">No items</div>;
                }
                return (
                  <div className="divide-y divide-gray-50">
                    {list.slice(0, 50).map(task => {
                      const apt = apartments.find(a => a.id === task.apartmentId);
                      return (
                        <button
                          key={task.id}
                          onClick={() => {
                            setModal(null);
                            navigate('/tasks');
                          }}
                          className="w-full flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-gray-600">{apt?.buildingId ?? '?'}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 leading-snug">{task.taskDescription}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {apt ? (apt.displayName || `${s.aptPrefix} ${apt.apartmentNumber}`) : ''}
                              {task.dueDate ? ` · ${format(new Date(task.dueDate), 'MMM d')}` : ''}
                              {task.completedAt ? ` · ✓ ${format(new Date(task.completedAt), 'MMM d')}` : ''}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, color, onClick, clickable }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
  clickable?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 ${clickable ? 'cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all' : ''}`}
      onClick={onClick}
    >
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
