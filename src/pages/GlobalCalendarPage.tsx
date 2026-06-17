import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useStore, loadAllProjectsTaskData } from '../data/store';
import { TaskCalendar, CalendarEvent } from '../components/tasks/TaskCalendar';

const CAT_COLORS: Record<string, string> = { drywall: '#f59e0b', ac: '#3b82f6', general: '#10b981' };

export function GlobalCalendarPage() {
  const {
    projects, contractors, currentProjectId,
    contractorAssignments, apartments, setCurrentProject,
    mainUiStrings: s,
  } = useStore();
  const navigate = useNavigate();

  const [filterProject, setFilterProject] = useState('all');
  const [filterContractorId, setFilterContractorId] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);

  // Read all workspaces from localStorage, then overlay the active project with
  // the freshest in-memory store data.
  const allData = useMemo(() => {
    const data = loadAllProjectsTaskData();
    return data.map(d => d.projectId === currentProjectId
      ? { ...d, assignments: contractorAssignments, apartments }
      : d);
  }, [currentProjectId, contractorAssignments, apartments]);

  const projectName = (id: string) => projects.find(p => p.id === id)?.shortName ?? id;

  const events: CalendarEvent[] = useMemo(() => {
    const out: CalendarEvent[] = [];
    for (const d of allData) {
      if (filterProject !== 'all' && d.projectId !== filterProject) continue;
      for (const a of d.assignments) {
        if (!a.dueDate) continue;
        if (filterContractorId && a.contractorId !== filterContractorId) continue;
        if (!showCompleted && a.completedAt) continue;
        const apt = d.apartments.find(ap => ap.id === a.apartmentId);
        const contractor = contractors.find(c => c.id === a.contractorId);
        out.push({
          id: `${d.projectId}:${a.id}`,
          date: a.dueDate,
          title: a.taskDescription,
          subtitle: `${projectName(d.projectId)} · ${apt?.displayName || apt?.apartmentNumber || a.buildingId}`,
          color: contractor ? (CAT_COLORS[contractor.category] ?? '#6b7280') : '#6b7280',
          completed: !!a.completedAt,
          onClick: () => {
            if (d.projectId !== currentProjectId) setCurrentProject(d.projectId);
            navigate('/tasks');
          },
        });
      }
    }
    return out;
  }, [allData, filterProject, filterContractorId, showCompleted, contractors]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
        <CalendarDays size={24} className="text-[#1e3a5f]" />
        {s.globalCalendarTitle}
      </h1>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">{s.navProject}</label>
          <div className="flex gap-1 flex-wrap">
            {['all', ...projects.map(p => p.id)].map(pid => (
              <button
                key={pid}
                onClick={() => setFilterProject(pid)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  filterProject === pid ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {pid === 'all' ? s.allProjects : projectName(pid)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">{s.contractorLabel}</label>
          <select
            value={filterContractorId}
            onChange={e => setFilterContractorId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          >
            <option value="">{s.allContractors}</option>
            {contractors.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer pb-2">
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} className="rounded" />
          {s.statusCompleted}
        </label>
        <span className="text-xs text-gray-400 pb-2 ml-auto">
          {events.length} · {s.navTasks}
        </span>
      </div>

      <TaskCalendar events={events} todayLabel={s.today} />
    </div>
  );
}
