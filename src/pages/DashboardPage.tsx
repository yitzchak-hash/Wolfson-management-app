import React, { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Building2, AlertTriangle, CheckCircle2, Clock, FileText, ClipboardList,
  AlertCircle, X, ChevronRight, Settings2, ChevronUp, ChevronDown, EyeOff, Eye, Printer,
  CalendarDays, Plus, Pencil, Trash2, ArrowLeft, ArrowRight,
} from 'lucide-react';
import {
  getStageName, isCountableApartment, CanvasElement, DASHBOARD_BOARD, personColor,
} from '../types';
import { WidgetStore } from '../components/board/WidgetStore';
import { NodeSettings } from '../components/board/NodeSettings';
import { WidgetCtx, renderWidget as renderBoardWidget, WIDGET_BY_ID } from '../data/widgets';
import { printSheet, printEsc } from '../data/printing';

type ModalKind = 'changes' | 'notes' | 'overdue' | 'pending' | 'completedToday' | null;

/**
 * Analytics folded in here.
 *
 * The two pages overlapped in four places and each of those collapses to the
 * better of the two: the clickable summary cards beat Analytics' plain numbers,
 * Analytics' stage table beat the Dashboard's bare bars because it carried the
 * counts as well, building progress merges, and there is one activity list.
 * The three things only Analytics had — the weekly output charts and the
 * contractor load — come across whole. Nothing is dropped.
 */
const DEFAULT_WIDGET_ORDER = [
  'apt-stats', 'task-stats', 'stage-progress', 'velocity',
  'building-progress', 'contractor-load', 'activity',
];

export function DashboardPage() {
  const {
    apartments: allApartments, stages: allStages, activityLogs, contractorAssignments,
    mainUiStrings: s, setPendingOpenAptId,
    dashboardWidgetOrder, dashboardHiddenWidgets, setDashboardLayout,
    buildings, currentProjectId, projects, contractors, users,
    canvasElements, addCanvasElement, updateCanvasElement, deleteCanvasElement,
    contractorPhotos, setCurrentProject,
  } = useStore();
  const stages = allStages.filter(st => currentProjectId === 'general' ? st.projectId === 'general' : !st.projectId);
  // Scope apartments to current project only (guard against stale localStorage)
  const apartments = currentProjectId === 'general'
    ? allApartments.filter(a => a.buildingId === 'G' && isCountableApartment(a))
    : allApartments;
  const navigate = useNavigate();
  const [modal, setModal] = useState<ModalKind>(null);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [localHidden, setLocalHidden] = useState<string[]>([]);
  const sortedStages = [...stages].filter(st => st.active).sort((a, b) => a.order - b.order);
  const total = apartments.filter(isCountableApartment).length;
  const notStarted = apartments.filter(a => isCountableApartment(a) && !a.currentStageId).length;
  const shinuiCount = apartments.filter(a => a.classification === 'shinui' && isCountableApartment(a)).length;
  const withNotes = apartments.filter(a => a.generalNotes.trim() && isCountableApartment(a)).length;
  const recentLogs = activityLogs.slice(0, 10);

  const today = new Date().toISOString().split('T')[0];

  /**
   * Tasks that belong to a job that still counts.
   *
   * Every task figure used to be taken straight off `contractorAssignments`,
   * which includes tasks on jobs that have been filed into Done or Trash and on
   * apartments that no longer exist at all. So the dashboard could report eleven
   * jobs and fourteen outstanding tasks with no way to find the extra three —
   * the unit counts had been scoped with isCountableApartment() and the task
   * counts had not. One rule, both sides.
   */
  const liveAssignments = useMemo(() => {
    const live = new Set(apartments.filter(isCountableApartment).map(a => a.id));
    return contractorAssignments.filter(a => live.has(a.apartmentId));
  }, [apartments, contractorAssignments]);


  const [storeOpen, setStoreOpen] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [settingsFor, setSettingsFor] = useState<CanvasElement | null>(null);

  /**
   * The dashboard's own widgets.
   *
   * Kept in `canvasElements` under the dashboard's board id rather than in a
   * collection of their own. That one decision is what makes them persist,
   * sync between devices, land in a backup and come back out of one, without a
   * single new store point — and the backup rule has already caught two
   * silent-data-loss bugs on keys that DID get their own collection.
   */
  const dashWidgets = useMemo(
    () => canvasElements
      .filter(e => e.board === DASHBOARD_BOARD && e.type === 'widget')
      .sort((a, b) => (a.z ?? 0) - (b.z ?? 0)),
    [canvasElements],
  );

  const dashCtx: WidgetCtx = useMemo(() => ({
    jobs: apartments.filter(a => isCountableApartment(a)),
    stages: sortedStages,
    assignments: liveAssignments,
    contractors, users,
    photos: contractorPhotos,
    logs: activityLogs,
    update: () => {},                       // bound per element in DashCard
    openJob: (id: string) => { setPendingOpenAptId(id); navigate(currentProjectId === 'general' ? '/jobs' : '/project'); },
    openProject: (id: string) => {
      setCurrentProject(id);
      navigate(id === 'general' ? '/jobs' : '/project');
    },
  }), [apartments, sortedStages, liveAssignments, contractors, users,
       contractorPhotos, activityLogs, currentProjectId, navigate,
       setPendingOpenAptId, setCurrentProject]);

  /** Move a widget one place earlier or later in the grid. */
  function moveDashWidget(id: string, dir: -1 | 1) {
    const ids = dashWidgets.map(w => w.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    // Order comes from the element list, so swapping means swapping the two
    // elements' z — the one field the grid reads for sequence.
    const a = dashWidgets[i], b = dashWidgets[j];
    updateCanvasElement(a.id, { z: (b.z ?? j) });
    updateCanvasElement(b.id, { z: (a.z ?? i) });
  }


  const overdueCount = liveAssignments.filter(a => !a.completedAt && a.dueDate && a.dueDate < today).length;
  const pendingCount = liveAssignments.filter(a => !a.completedAt).length;
  const completedTodayCount = liveAssignments.filter(a => a.completedAt && a.completedAt.startsWith(today)).length;

  function getBuildingProgress(bid: string) {
    const apts = apartments.filter(a => a.buildingId === bid && isCountableApartment(a));
    const started = apts.filter(a => a.currentStageId).length;
    return { total: apts.length, started, pct: apts.length > 0 ? Math.round(started / apts.length * 100) : 0 };
  }

  function printSummary() {
    const e = printEsc;
    const projectName = projects.find(p => p.id === currentProjectId)?.name ?? "Workspace";
    const stageRows = sortedStages.map(st => {
      const count = apartments.filter(a => a.currentStageId === st.id && isCountableApartment(a)).length;
      const pct = total ? Math.round((count / total) * 100) : 0;
      return `<tr>
        <td><span class="dot" style="background:${e(st.color)}"></span>${e(getStageName(st, !!s.isRtl))}</td>
        <td style="width:56px;text-align:end"><b>${count}</b></td>
        <td style="width:180px">
          <div style="background:#eef2f6;height:8px;border-radius:4px;overflow:hidden">
            <div style="background:${e(st.color)};height:8px;width:${pct}%"></div>
          </div>
        </td>
        <td style="width:44px;text-align:end" class="muted">${pct}%</td>
      </tr>`;
    }).join("");

    const buildingRows = buildings.map(b => {
      const p = getBuildingProgress(b.id);
      return `<tr><td>${e(b.name ?? b.id)}</td>
        <td style="width:70px;text-align:end">${p.started} / ${p.total}</td>
        <td style="width:180px">
          <div style="background:#eef2f6;height:8px;border-radius:4px;overflow:hidden">
            <div style="background:#1e3a5f;height:8px;width:${p.pct}%"></div>
          </div></td>
        <td style="width:44px;text-align:end" class="muted">${p.pct}%</td></tr>`;
    }).join("");

    const num = (label: string, value: number | string, tone = "#1e3a5f") =>
      `<div class="card" style="text-align:center;padding:12px 8px">
        <div style="font-size:24px;font-weight:800;color:${tone};line-height:1">${e(value)}</div>
        <div class="muted" style="font-size:10px;margin-top:3px">${e(label)}</div>
      </div>`;

    printSheet(`${s.pageDashboard} — ${projectName}`, `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">
        ${num(s.totalApartments ?? "Total", total)}
        ${num(s.notStarted ?? "Not started", notStarted, "#6b7280")}
        ${num(s.changes, shinuiCount, "#d97706")}
        ${num(s.withNotes, withNotes, "#0d9488")}
        ${num(s.pendingTasks ?? "Tasks open", pendingCount, "#2563eb")}
        ${num(s.overdueTasks, overdueCount, overdueCount ? "#dc2626" : "#6b7280")}
        ${num(s.completedToday ?? "Done today", completedTodayCount, "#16a34a")}
        ${num("Contractors", contractors.length, "#7c3aed")}
      </div>

      <h2 style="font-size:13px;margin:0 0 6px;color:#1e3a5f">Stages</h2>
      <table>${stageRows || '<tr><td class="muted">No stages yet.</td></tr>'}</table>

      ${buildings.length ? `<h2 style="font-size:13px;margin:16px 0 6px;color:#1e3a5f">Buildings</h2>
      <table>${buildingRows}</table>` : ""}
    `, { rtl: !!s.isRtl, subtitle: `${total} unit${total === 1 ? "" : "s"} counted` });
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
    const order = [...mergedOrder];
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
      case 'velocity': return s.stageCompletionsWeek ?? 'Work finished each week';
      case 'contractor-load': return s.contractorTasksSection ?? 'Contractor load';
      default: return id;
    }
  }

  // Which order/hidden to use for rendering
  /**
   * A saved order must not hide sections added later.
   *
   * Everyone who has ever opened this page has an order stored, and it names
   * the sections that existed the day it was saved. Using it as-is meant the
   * two sections folded in from Analytics would never appear for a single
   * existing user — they would simply not be in anybody's list. Anything in the
   * defaults but missing from the saved order is appended, unless it has been
   * deliberately hidden. Same rule as mergeFreshMainUi, same reason.
   */
  const savedOrder = dashboardWidgetOrder.length > 0 ? dashboardWidgetOrder : DEFAULT_WIDGET_ORDER;
  const mergedOrder = useMemo(() => {
    const missing = DEFAULT_WIDGET_ORDER.filter(id => !savedOrder.includes(id));
    return missing.length ? [...savedOrder, ...missing] : savedOrder;
  }, [savedOrder]);

  const activeOrder = isCustomizing ? localOrder : mergedOrder;
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
                const count = apartments.filter(a => isCountableApartment(a) && a.currentStageId === stage.id).length;
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

      /**
       * Both of these came from Analytics, which no longer exists as a page.
       * They are drawn from the same scoped data as everything else here, so a
       * job filed into Done cannot show up in one and not the other.
       */
      case 'velocity': {
        const weeks = Array.from({ length: 8 }, (_, i) => {
          const end = new Date();
          end.setDate(end.getDate() - (7 - i) * 7);
          const wStart = new Date(end); wStart.setDate(wStart.getDate() - wStart.getDay());
          const wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + 7);
          const a = wStart.toISOString(), b = wEnd.toISOString();
          return {
            label: format(wStart, 'MMM d'),
            tasks: liveAssignments.filter(x => x.completedAt && x.completedAt >= a && x.completedAt < b).length,
            stages: apartments.filter(isCountableApartment).reduce((n, ap) => n + Object.values(ap.stageDates ?? {})
              .filter(d => d >= a && d < b).length, 0),
          };
        });
        const top = Math.max(1, ...weeks.map(w => Math.max(w.tasks, w.stages)));
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-1">Work finished each week</h2>
            <p className="text-xs text-gray-400 mb-4">
              Stages reached and tasks completed, the last eight weeks.
            </p>
            <div className="flex items-end gap-3 h-40">
              {weeks.map(w => (
                <div key={w.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex items-end justify-center gap-1 flex-1">
                    <div className="w-1/2 rounded-t transition-all" title={`${w.stages} stages`}
                      style={{ height: `${(w.stages / top) * 100}%`, backgroundColor: '#4aa8d8', minHeight: 2 }} />
                    <div className="w-1/2 rounded-t transition-all" title={`${w.tasks} tasks`}
                      style={{ height: `${(w.tasks / top) * 100}%`, backgroundColor: '#16a34a', minHeight: 2 }} />
                  </div>
                  <span className="text-[10px] text-gray-400 truncate w-full text-center">{w.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#4aa8d8' }} /> stages reached
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#16a34a' }} /> tasks done
              </span>
            </div>
          </div>
        );
      }

      case 'contractor-load': {
        const rows = contractors.filter(c => c.active).map(c => {
          const mine = liveAssignments.filter(a => a.contractorId === c.id);
          return {
            c,
            open: mine.filter(a => !a.completedAt).length,
            done: mine.filter(a => a.completedAt).length,
            late: mine.filter(a => !a.completedAt && a.dueDate && a.dueDate < today).length,
          };
        }).sort((a, b) => b.open - a.open);
        const top = Math.max(1, ...rows.map(r => r.open + r.done));
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Contractor load</h2>
            {rows.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No contractors yet.</p>
            ) : (
              <div className="space-y-3">
                {rows.map(({ c, open, done, late }) => (
                  <div key={c.id}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: personColor(c.name, c.color) }} />
                      <span className="text-sm text-gray-700 flex-1 truncate">{c.name}</span>
                      {late > 0 && (
                        <span className="text-xs font-bold text-red-600 tabular-nums">{late} late</span>
                      )}
                      <span className="text-sm font-medium text-gray-800 tabular-nums">{open}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                      <div style={{ width: `${(open / top) * 100}%`, backgroundColor: '#4aa8d8' }} />
                      <div style={{ width: `${(done / top) * 100}%`, backgroundColor: '#cbd5e1' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

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
    /* Full width. It was a 1152px column down the middle of a 2560px office
       monitor, which on a page whose whole job is showing a lot at once is the
       one layout that cannot. */
    <div className="p-5 xl:p-6 w-full">
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
          <div className="flex items-center gap-2">
            {/* A one-page state-of-play for a meeting: the same numbers as the
                cards, on paper, so nobody has to read them off a screen. */}
            {/* The calendar, from the top of the dashboard. */}
            <button
              onClick={() => navigate('/calendar')}
              title="Open the calendar"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <CalendarDays size={14} /> Calendar
            </button>
            <button
              onClick={printSummary}
              title="Print a summary"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <Printer size={14} />
            </button>
            <button
              onClick={enterCustomize}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <Settings2 size={14} />
              {s.customizeDashboard}
            </button>
          </div>
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

      {/* ── Your own widgets ────────────────────────────────────────────────
          The dashboard is arranged like the board now: the SAME widget store,
          the SAME widgets, the same settings panel behind the same pencil.
          They are ordinary CanvasElements carrying the dashboard's board id, so
          they are persisted, synced, backed up and restored by machinery that
          already exists — no new collection, and no new way to lose them.

          Laid out in a grid rather than on a free canvas, because a dashboard
          has to reflow on a laptop and a wall screen alike. Each widget's own
          width decides how many columns it spans. */}
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-500">Your widgets</h2>
          <span className="text-xs text-gray-300">{dashWidgets.length}</span>
          <div className="flex-1" />
          <button
            onClick={() => setArranging(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              arranging
                ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                : 'text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Settings2 size={14} /> {arranging ? 'Done arranging' : 'Arrange'}
          </button>
          <button
            onClick={() => setStoreOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg bg-[#4aa8d8] hover:brightness-95"
          >
            <Plus size={14} /> Add a widget
          </button>
        </div>

        {dashWidgets.length === 0 ? (
          <button
            onClick={() => setStoreOpen(true)}
            className="w-full rounded-xl border border-dashed border-gray-300 py-8 text-center
                       text-sm text-gray-400 hover:border-[#4aa8d8] hover:text-[#4aa8d8] transition-colors"
          >
            Nothing here yet. Add a workspace miniature, the job board, a calendar —
            anything from the same shelf the board uses.
          </button>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
            {dashWidgets.map(el => (
              <DashCard
                key={el.id}
                el={el}
                ctx={dashCtx}
                arranging={arranging}
                onSpan={(n: number) => updateCanvasElement(el.id, { w: n * 100 })}
                onSettings={() => setSettingsFor(el)}
                onRemove={() => deleteCanvasElement(el.id)}
                onMove={(dir: -1 | 1) => moveDashWidget(el.id, dir)}
              />
            ))}
          </div>
        )}
      </div>

      {storeOpen && (
        <WidgetStore
          onPick={def => {
            addCanvasElement({
              id: `CE-${Math.random().toString(36).slice(2, 9)}`,
              type: 'widget', widget: def.id, board: DASHBOARD_BOARD,
              x: 0, y: 0, w: def.w, h: def.h,
              z: dashWidgets.length,
              text: '', color: '#ffffff',
              data: def.data ? JSON.parse(JSON.stringify(def.data)) : {},
            });
          }}
          onClose={() => setStoreOpen(false)}
        />
      )}

      {settingsFor && (
        <NodeSettings
          el={settingsFor}
          onClose={() => setSettingsFor(null)}
          onDelete={id => { deleteCanvasElement(id); setSettingsFor(null); }}
        />
      )}

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
                  ? apartments.filter(a => a.classification === 'shinui' && isCountableApartment(a))
                  : apartments.filter(a => a.generalNotes.trim() && isCountableApartment(a));
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
                  ? liveAssignments.filter(a => !a.completedAt && a.dueDate && a.dueDate < today)
                  : modal === 'pending'
                    ? liveAssignments.filter(a => !a.completedAt)
                    : liveAssignments.filter(a => a.completedAt && a.completedAt.startsWith(today));
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

/**
 * One widget on the dashboard.
 *
 * The chrome is the dashboard's, the contents are the board's — the same
 * `renderWidget` and the same `NodeSettings` behind the same pencil, so a
 * widget cannot behave one way here and another way there.
 *
 * Width is a COLUMN SPAN rather than a pixel size. A dashboard has to reflow
 * between a laptop and a wall screen, and a widget pinned to 300px looks right
 * on exactly one of them.
 */
function DashCard({ el, ctx, arranging, onSpan, onSettings, onRemove, onMove }: {
  el: CanvasElement;
  ctx: WidgetCtx;
  arranging: boolean;
  onSpan: (cols: number) => void;
  onSettings: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const def = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;
  const updateCanvasElement = useStore(st => st.updateCanvasElement);

  // Stored as a width in pixels so the same element can sit on a free board
  // too; on the grid it reads as a span. 100px per column, clamped to the grid.
  const span = Math.max(2, Math.min(12, Math.round((el.w || 300) / 100)));

  const bound: WidgetCtx = useMemo(
    () => ({ ...ctx, update: patch => updateCanvasElement(el.id, patch) }),
    [ctx, el.id, updateCanvasElement],
  );

  return (
    <div
      className="relative group bg-white rounded-xl border border-gray-200 overflow-hidden"
      style={{
        gridColumn: `span ${span} / span ${span}`,
        minHeight: Math.max(120, el.h || 165),
        ...(el.outline ? { borderColor: el.outline, borderWidth: el.outlineWidth ?? 3 } : {}),
      }}
    >
      <div className="w-full h-full" style={{ height: Math.max(120, el.h || 165) }}>
        {def ? renderBoardWidget(el, bound) : (
          <div className="p-3 text-xs text-gray-400">This widget is no longer available.</div>
        )}
      </div>

      {/* The controls appear on hover, and stay out while you are just reading. */}
      <div className={`absolute top-1.5 right-1.5 flex items-center gap-1 transition-opacity ${
        arranging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <button onClick={onSettings} title="Settings"
          className="p-1 rounded-md bg-white/90 border border-gray-200 text-gray-400 hover:text-[#1e3a5f]">
          <Pencil size={12} />
        </button>
        <button onClick={onRemove} title="Take it off the dashboard"
          className="p-1 rounded-md bg-white/90 border border-gray-200 text-gray-400 hover:text-red-500">
          <Trash2 size={12} />
        </button>
      </div>

      {arranging && (
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 bg-white/95 rounded-lg
                        border border-gray-200 px-1 py-0.5">
          <button onClick={() => onMove(-1)} title="Earlier"
            className="p-0.5 text-gray-400 hover:text-[#1e3a5f]"><ArrowLeft size={12} /></button>
          <button onClick={() => onMove(1)} title="Later"
            className="p-0.5 text-gray-400 hover:text-[#1e3a5f]"><ArrowRight size={12} /></button>
          <span className="w-px h-3 bg-gray-200" />
          <button onClick={() => onSpan(Math.max(2, span - 1))} title="Narrower"
            className="px-1 text-[11px] font-bold text-gray-400 hover:text-[#1e3a5f]">−</button>
          <span className="text-[10px] tabular-nums text-gray-400 w-6 text-center">{span}/12</span>
          <button onClick={() => onSpan(Math.min(12, span + 1))} title="Wider"
            className="px-1 text-[11px] font-bold text-gray-400 hover:text-[#1e3a5f]">+</button>
          <span className="w-px h-3 bg-gray-200" />
          <button onClick={() => updateCanvasElement(el.id, { h: Math.max(120, (el.h || 165) - 40) })}
            title="Shorter" className="px-1 text-[11px] font-bold text-gray-400 hover:text-[#1e3a5f]">↑</button>
          <button onClick={() => updateCanvasElement(el.id, { h: Math.min(720, (el.h || 165) + 40) })}
            title="Taller" className="px-1 text-[11px] font-bold text-gray-400 hover:text-[#1e3a5f]">↓</button>
        </div>
      )}
    </div>
  );
}
