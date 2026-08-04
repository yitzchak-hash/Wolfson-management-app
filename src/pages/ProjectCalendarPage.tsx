import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useStore } from '../data/store';
import { TaskCalendar, CalendarEvent } from '../components/tasks/TaskCalendar';
import { aptLabel, projectColor } from '../types';

const CAT_COLORS: Record<string, string> = { drywall: '#f59e0b', ac: '#3b82f6', general: '#10b981' };

/**
 * Calendar for the CURRENT workspace only.
 *
 * Distinct from GlobalCalendarPage (/calendar), which combines every workspace
 * and is reached from the header. This one is a sidebar tab under Dashboard, so
 * it stays inside the project you are working in.
 */
export function ProjectCalendarPage() {
  const {
    contractorAssignments, apartments, contractors, projects, stages,
    currentProjectId, mainUiStrings: s,
  } = useStore();
  const navigate = useNavigate();

  const [filterContractorId, setFilterContractorId] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);

  const accent = projectColor(projects, currentProjectId);
  const projectName = projects.find(p => p.id === currentProjectId)?.name ?? currentProjectId;

  const events: CalendarEvent[] = useMemo(() => {
    const out: CalendarEvent[] = [];
    for (const a of contractorAssignments) {
      if (!a.dueDate) continue;
      if (filterContractorId && a.contractorId !== filterContractorId) continue;
      if (!showCompleted && a.completedAt) continue;
      const apt = apartments.find(ap => ap.id === a.apartmentId);
      const contractor = contractors.find(c => c.id === a.contractorId);
      const stage = apt ? stages.find(st => st.id === apt.currentStageId) : undefined;
      out.push({
        id: a.id,
        date: a.dueDate,
        title: a.taskDescription,
        subtitle: apt ? `${apt.buildingId} · ${aptLabel(apt)}` : a.buildingId,
        color: contractor ? (CAT_COLORS[contractor.category] ?? '#6b7280') : '#6b7280',
        completed: !!a.completedAt,
        onClick: () => navigate('/tasks'),
        // Full-node payload so a day renders the same card the board does
        node: apt ? {
          stageName: stage?.name,
          stageColor: stage?.color,
          address: apt.address,
          driveLink: apt.driveLink,
          zohoLink: apt.zohoLink,
          plansPdfLink: apt.plansPdfLink,
          pendingTasks: contractorAssignments.filter(x => x.apartmentId === apt.id && !x.completedAt).length,
        } : undefined,
      });
    }
    return out;
  }, [contractorAssignments, apartments, contractors, stages, filterContractorId, showCompleted, navigate]);

  return (
    <div className="p-6 w-full">
      <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <CalendarDays size={24} style={{ color: accent }} />
        {projectName} · {s.navCalendar}
      </h1>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">{s.contractorLabel}</label>
          <select
            value={filterContractorId}
            onChange={e => setFilterContractorId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          >
            <option value="">{s.allContractors}</option>
            {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Modern switch rather than a checkbox */}
        <button
          onClick={() => setShowCompleted(v => !v)}
          className="flex items-center gap-2 text-xs text-gray-600 pb-2"
          title={s.statusCompleted}
        >
          <span
            className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
            style={{ backgroundColor: showCompleted ? '#16a34a' : '#cbd5e1' }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
              style={{ left: showCompleted ? '18px' : '2px' }}
            />
          </span>
          {s.statusCompleted}
        </button>

        <span className="text-xs text-gray-400 pb-2 ml-auto">
          {events.length} · {s.navTasks}
        </span>
      </div>

      <TaskCalendar events={events} todayLabel={s.today} />
    </div>
  );
}
