import React, { useState } from 'react';
import { useStore } from '../data/store';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Building2, AlertTriangle, CheckCircle2, Clock, FileText, ClipboardList,
  AlertCircle, X, ChevronRight, Settings2, ChevronUp, ChevronDown, EyeOff, Eye,
} from 'lucide-react';
import { getStageName } from '../types';

type ModalKind = 'changes' | 'notes' | 'overdue' | 'pending' | 'completedToday' | null;

const DEFAULT_WIDGET_ORDER = ['apt-stats', 'task-stats', 'stage-progress', 'building-progress', 'activity'];

export function DashboardPage() {
  const {
    apartments, stages, activityLogs, contractorAssignments,
    mainUiStrings: s, setPendingOpenAptId,
    dashboardWidgetOrder, dashboardHiddenWidgets, setDashboardLayout,
    buildings,
  } = useStore();
  const navigate = useNavigate();
  const [modal, setModal] = useState<ModalKind>(null);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [localHidden, setLocalHidden] = useState<string[]>([]);

  const sortedStages = [...stages].filter(st => st.active).sort((a, b) => a.order - b.order);
  const total = apartments.length;
  const notStarted = apartments.filter(a => !a.currentStageId).length;
  const shinuiCount = apartments.filter(a => a.classification === 'shinui' && !a.isUnnamed).length;
  const withNotes = apartments.filter(a => a.generalNotes.trim() && !a.isUnnamed).length;
  const recentLogs = activityLogs.slice(0, 10);

  const today = new Date().toISOString().split('T')[0];
  const overdueCount = contractorAssignments.filter(a => !a.completedAt && a.dueDate && a.dueDate < today).length;
  const pendingCount = contractorAssignments.filter(a => !a.completedAt).length;
  const completedTodayCount = contractorAssignments.filter(a => a.completedAt && a.completedAt.startsWith(today)).length;

  function getBuildingProgress(bid: string) {
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

  // --- Customize mode ---
  function enterCustomize() {
    const order = dashboardWidgetOrder.length > 0 ? [...dashboardWidgetOrder] : [...DEFAULT_WIDGET_ORDER];
    const hidden = [...dashboardHiddenWidgets];
    // Ensure any widget not in order or hidden is still present
    for (const id of DEFAULT_WIDGET_ORDER) {
      if (!order.includes(id) && !hidden.includes(id)) order.push(id);
    }
    setLocalOrder(order);
    setLocalHidden(hidden);
    setIsCustomizing(true);
  }

  function saveCustomize() {
    setDashboardLayout(localOrder, localHidden);
    setIsCustomizing(false);
  }

  function cancelCustomize() {
    setIsCustomizing(false);
  }

  function moveWidget(id: string, dir: -1 | 1) {
    const idx = localOrder.indexOf(id);
    if (idx === -1) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= localOrder.length) return;
    const next = [...localOrder];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setLocalOrder(next);
  }

  function hideWidget(id: string) {
    setLocalOrder(localOrder.filter(w => w !== id));
    setLocalHidden([...localHidden, id]);
  }

  function showWidget(id: string) {
    setLocalHidden(localHidden.filter(w => w !== id));
    setLocalOrder([...localOrder, id]);
  }

  function getWidgetLabel(id: string): string {
    switch (id) {
      case 'apt-stats': return s.widgetSummaryStats;
      case 'task-stats': return s.widgetTaskStats;
      case 'stage-progress': return s.progressByStage;
      case 'building-progress': return s.progressByBuilding;
      case 'activity': return s.recentActivity;
      default: return id;
    }
  }

  // Which order/hidden to use for rendering
  const activeOrder = isCustomizing ? localOrder : (dashboardWidgetOrder.length > 0 ? dashboardWidgetOrder : DEFAULT_WIDGET_ORDER);
  const activeHidden = isCustomizing ? localHidden : dashboardHiddenWidgets;

  // Ensure all widgets are accounted for even if state is stale
  const visibleOrder = activeOrder.filter(id => !activeHidden.includes(id));

  function renderWidget(id: string) {
    switch (id) {
      case 'apt-stats':
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        );

      case 'task-stats':
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SummaryCard
              icon={<AlertCircle size={20} />}
              label={s.overdueTasks}
              value={overdueCount}
              color="#ef4444"
              onClick={() => setModal('overdue')}
              clickable
            />
            <SummaryCard
              icon={<ClipboardList size={20} />}
              label={s.pendingTasks}
              value={pendingCount}
              color="#4aa8d8"
              onClick={() => setModal('pending')}
              clickable
            />
            <SummaryCard
              icon={<CheckCircle2 size={20} />}
              label={s.completedToday}
              value={completedTodayCount}
              color="#10b981"
              onClick={() => setModal('completedToday')}
              clickable
            />
          </div>
        );

      case 'stage-progress':
        return (
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
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: stage.color }} />
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
        );

      case 'building-progress':
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">{s.progressByBuilding}</h2>
            <div className="space-y-5">
              {buildings.map(b => {
                const { total: bTotal, started, pct } = getBuildingProgress(b.id);
                return (
                  <div key={b.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-[#1e3a5f]">{b.name}</span>
                      <span className="text-sm text-gray-600">{started}/{bTotal} {s.unitsStarted} <span className="text-gray-400">({pct}%)</span></span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: '#1e3a5f' }} />
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
        );

      case 'activity':
        return (
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
        );

      default:
        return null;
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{s.pageDashboard}</h1>
        {isCustomizing ? (
          <div className="flex items-center gap-2">
            <button
              onClick={cancelCustomize}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {s.cancel}
            </button>
            <button
              onClick={saveCustomize}
              className="px-3 py-1.5 text-sm text-white bg-[#1e3a5f] rounded-lg hover:bg-[#1e3a5f]/90 transition-colors font-medium"
            >
              {s.doneBtn}
            </button>
          </div>
        ) : (
          <button
            onClick={enterCustomize}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Settings2 size={14} />
            {s.customizeDashboard}
          </button>
        )}
      </div>

      {/* Customize mode banner */}
      {isCustomizing && (
        <div className="mb-4 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <Settings2 size={14} className="flex-shrink-0" />
          Use the arrows to reorder and the eye icon to hide/show widgets. Click Done to save.
        </div>
      )}

      {/* Widgets */}
      <div className="space-y-4">
        {visibleOrder.map((id, idx) => (
          <WidgetWrapper
            key={id}
            id={id}
            label={getWidgetLabel(id)}
            isCustomizing={isCustomizing}
            canMoveUp={idx > 0}
            canMoveDown={idx < visibleOrder.length - 1}
            onMoveUp={() => moveWidget(id, -1)}
            onMoveDown={() => moveWidget(id, 1)}
            onHide={() => hideWidget(id)}
          >
            {renderWidget(id)}
          </WidgetWrapper>
        ))}
      </div>

      {/* Hidden widgets panel — only in customize mode */}
      {isCustomizing && localHidden.length > 0 && (
        <div className="mt-6 border border-dashed border-gray-300 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Hidden widgets</p>
          <div className="flex flex-wrap gap-2">
            {localHidden.map(id => (
              <button
                key={id}
                onClick={() => showWidget(id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                <Eye size={13} />
                {getWidgetLabel(id)}
              </button>
            ))}
          </div>
        </div>
      )}

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

function WidgetWrapper({
  children,
  id,
  label,
  isCustomizing,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onHide,
}: {
  children: React.ReactNode;
  id: string;
  label: string;
  isCustomizing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onHide: () => void;
}) {
  if (!isCustomizing) return <>{children}</>;

  return (
    <div className="rounded-xl ring-2 ring-blue-200 overflow-hidden">
      {/* Drag handle / control bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-blue-50 border-b border-blue-200">
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="p-1 rounded hover:bg-blue-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move up"
          >
            <ChevronUp size={14} className="text-blue-600" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="p-1 rounded hover:bg-blue-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move down"
          >
            <ChevronDown size={14} className="text-blue-600" />
          </button>
          <button
            onClick={onHide}
            className="p-1 rounded hover:bg-blue-100 transition-colors ml-1"
            title="Hide widget"
          >
            <EyeOff size={14} className="text-blue-600" />
          </button>
        </div>
      </div>
      <div className="p-3 bg-white/50">
        {children}
      </div>
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
