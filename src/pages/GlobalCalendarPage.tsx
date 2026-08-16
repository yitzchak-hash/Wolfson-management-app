import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useStore, loadAllProjectsTaskData } from '../data/store';
import { TaskCalendar, CalendarEvent } from '../components/tasks/TaskCalendar';
import { ContractorAssignment, Apartment, aptLabel } from '../types';
import { fsListen, isFirebaseConfigured, projectCollection } from '../data/firebase';
import { DEFAULT_PROJECTS } from '../data/initialData';

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

  // Live Firestore data for non-active projects (keyed by projectId)
  const [bgAssignments, setBgAssignments] = useState<Record<string, ContractorAssignment[]>>({});
  const [bgApartments, setBgApartments] = useState<Record<string, Apartment[]>>({});

  // Attach/detach background Firestore listeners whenever the active project changes.
  // The active project is handled by the main startFirebaseSync; only non-active ones need listeners here.
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const unsubs: Array<() => void> = [];

    for (const proj of DEFAULT_PROJECTS) {
      if (proj.id === currentProjectId) continue;
      const pid = proj.id;

      unsubs.push(
        fsListen(projectCollection(pid, 'contractorAssignments'), (docs) => {
          setBgAssignments(prev => ({ ...prev, [pid]: docs as unknown as ContractorAssignment[] }));
        }),
        fsListen(projectCollection(pid, 'apartments'), (docs) => {
          setBgApartments(prev => ({ ...prev, [pid]: docs as unknown as Apartment[] }));
        }),
      );
    }

    return () => unsubs.forEach(u => u());
  }, [currentProjectId]);

  // Combine data sources: localStorage baseline → Firestore live (non-active) → in-memory store (active).
  const allData = useMemo(() => {
    const data = loadAllProjectsTaskData();
    return data.map(d => {
      if (d.projectId === currentProjectId) {
        return { ...d, assignments: contractorAssignments, apartments };
      }
      const liveAssign = bgAssignments[d.projectId];
      const liveApts   = bgApartments[d.projectId];
      return {
        ...d,
        assignments: liveAssign && liveAssign.length > 0 ? liveAssign : d.assignments,
        apartments:  liveApts   && liveApts.length   > 0 ? liveApts   : d.apartments,
      };
    });
  }, [currentProjectId, contractorAssignments, apartments, bgAssignments, bgApartments]);

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
        const stage = (d.stages ?? []).find(st => st.id === a.stageId);
        out.push({
          id: `${d.projectId}:${a.id}`,
          date: a.dueDate,
          title: a.taskDescription,
          subtitle: `${projectName(d.projectId)} · ${apt ? aptLabel(apt) : a.buildingId}`,
          // Stage colour first; the trade colour only when the task has none.
          color: stage?.color ?? (contractor ? (CAT_COLORS[contractor.category] ?? '#6b7280') : '#6b7280'),
          node: stage ? { stageName: stage.name, stageColor: stage.color } : undefined,
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
    <div className="p-6 w-full">
      <h1 className="hidden md:flex text-2xl font-bold text-gray-900 mb-6 items-center gap-2">
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
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)}
            className="rounded w-5 h-5 sm:w-auto sm:h-auto" />
          {s.statusCompleted}
        </label>
        <span className="text-xs text-gray-400 pb-2 ml-auto">
          {events.length} · {s.navTasks}
        </span>
      </div>

      <TaskCalendar events={events} todayLabel={s.today} rtl={!!s.isRtl}
        printTitle="All workspaces" />
    </div>
  );
}
