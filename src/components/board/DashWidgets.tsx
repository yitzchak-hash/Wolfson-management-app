import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Apartment, Stage, ContractorAssignment, isCountableApartment, getStageName, projectColor } from '../../types';
import { useStore, loadProjectSnapshot } from '../../data/store';

/**
 * The three widgets the dashboard was asked for.
 *
 * They live here rather than in widgets.tsx because each one needs something
 * the widget context deliberately does not carry — another workspace's data, or
 * the router. `WidgetCtx` is scoped to one workspace on purpose, and widening it
 * for three widgets would have made every other widget able to reach across
 * workspaces by accident.
 */

// ── E-3 · a live miniature of one workspace's building diagram ──────────────

/**
 * The building diagram, small enough to sit on a dashboard.
 *
 * Not the real `BuildingDiagram` component: that one reads `buildings` straight
 * out of the store, so it can only ever draw the workspace you are currently
 * in — and the whole point here is to see all three at once. This draws the
 * same thing from a snapshot: one column per building, one cell per unit, each
 * cell in its stage colour.
 */
export function ProjectMini({ projectId: chosen, onOpen }: {
  projectId: string;
  onOpen?: (projectId: string) => void;
}) {
  const projects = useStore(st => st.projects);
  const liveApartments = useStore(st => st.apartments);
  const liveStages = useStore(st => st.stages);
  const currentProjectId = useStore(st => st.currentProjectId);
  const isRtl = useStore(st => st.mainUiStrings.isRtl);
  // Unset means "wherever I am", so a freshly placed one shows something.
  const projectId = chosen || currentProjectId;

  const snap = useMemo(() => {
    // The workspace you are in is live; the others are their last cache.
    if (projectId === currentProjectId) {
      return {
        apartments: liveApartments,
        stages: liveStages,
        buildings: [] as { id: string; name?: string }[],
      };
    }
    return loadProjectSnapshot(projectId);
  }, [projectId, currentProjectId, liveApartments, liveStages]);

  const project = projects.find(p => p.id === projectId);
  const tone = projectColor(projects, projectId);

  const units = snap.apartments.filter(isCountableApartment);
  const byBuilding = useMemo(() => {
    const m = new Map<string, Apartment[]>();
    for (const a of units) {
      if (!m.has(a.buildingId)) m.set(a.buildingId, []);
      m.get(a.buildingId)!.push(a);
    }
    for (const list of m.values()) {
      list.sort((a, b) => (b.floor - a.floor)
        || Number(a.apartmentNumber || 0) - Number(b.apartmentNumber || 0));
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [units]);

  const stageOf = (id?: string | null) => snap.stages.find(s => s.id === id);
  const started = units.filter(a => a.currentStageId).length;

  return (
    <button
      onClick={() => onOpen?.(projectId)}
      className="w-full h-full text-left flex flex-col px-2.5 py-2 overflow-hidden"
      data-no-drag data-el-action
      title={`Open ${project?.name ?? 'this workspace'}`}
    >
      <div className="flex items-center gap-1.5 mb-1 flex-shrink-0">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tone }} />
        <span className="text-[9.5px] font-extrabold tracking-wide truncate" style={{ color: tone }}>
          {(project?.name ?? projectId).toUpperCase()}
        </span>
        <span className="ml-auto text-[9px] text-gray-400 tabular-nums flex-shrink-0">
          {started}/{units.length}
        </span>
      </div>

      {byBuilding.length === 0 ? (
        <span className="text-[10px] text-gray-400">
          {projectId === currentProjectId ? 'No units yet' : 'Not opened on this device yet'}
        </span>
      ) : (
        <div className="flex-1 min-h-0 flex gap-2 overflow-hidden">
          {byBuilding.map(([bid, apts]) => (
            <div key={bid} className="flex flex-col min-w-0 flex-1">
              <span className="text-[8px] font-bold text-gray-400 mb-0.5">{bid}</span>
              <div className="flex-1 min-h-0 grid gap-[2px] content-start"
                style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                {apts.slice(0, 64).map(a => {
                  const st = stageOf(a.currentStageId);
                  return (
                    <span
                      key={a.id}
                      className="rounded-[2px]"
                      style={{ backgroundColor: st?.color ?? '#e2e8f0', aspectRatio: '1.35' }}
                      title={`${a.apartmentNumber || a.displayName || ''} · ${
                        st ? getStageName(st, !!isRtl) : 'Not started'}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

// ── E-4 · the job board, in miniature ───────────────────────────────────────

/**
 * A readable thumbnail of the job board.
 *
 * Laid out from each job's real board position, scaled to fit, so it looks like
 * the board rather than like a list — that is what makes it recognisable at a
 * glance. Clicking a tile opens the job.
 */
export function BoardMini({ jobs, stages, onOpen }: {
  jobs: Apartment[];
  stages: Stage[];
  onOpen: (id: string) => void;
}) {
  const placed = jobs.map((j, i) => ({
    job: j,
    x: j.canvasX ?? 24 + (i % 6) * 240,
    y: j.canvasY ?? 24 + Math.floor(i / 6) * 150,
  }));
  const maxX = Math.max(320, ...placed.map(p => p.x + 215));
  const maxY = Math.max(220, ...placed.map(p => p.y + 132));

  return (
    <div className="w-full h-full flex flex-col px-2 py-1.5 overflow-hidden">
      <span className="text-[9.5px] font-extrabold tracking-wide text-gray-500 mb-1 flex-shrink-0">
        JOB BOARD · {jobs.length}
      </span>
      <div className="flex-1 min-h-0 relative rounded-md bg-slate-50 overflow-hidden">
        {placed.length === 0 && (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400">
            Nothing on the board
          </span>
        )}
        {placed.map(({ job, x, y }) => {
          const st = stages.find(s => s.id === job.currentStageId);
          return (
            <button
              key={job.id}
              data-no-drag data-el-action
              onClick={() => onOpen(job.id)}
              title={job.displayName || 'Job'}
              className="absolute rounded-[2px] hover:ring-2 hover:ring-[#4aa8d8]"
              style={{
                // Percentages, so the thumbnail rescales with the widget rather
                // than needing to be measured.
                left: `${(x / maxX) * 100}%`,
                top: `${(y / maxY) * 100}%`,
                width: `${(215 / maxX) * 100}%`,
                height: `${(132 / maxY) * 100}%`,
                backgroundColor: st?.color ?? '#cbd5e1',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── E-5 · the calendar ──────────────────────────────────────────────────────

/**
 * This month, with the days that have work on them marked.
 *
 * Deliberately not the full `TaskCalendar`: at dashboard size its event chips
 * are unreadable, and a widget that cannot be read is worse than one that shows
 * less. This shows the shape of the month — how loaded each day is — and hands
 * off to the real calendar for the detail.
 */
export function CalendarMini({ assignments, jobs }: {
  assignments: ContractorAssignment[];
  jobs: Apartment[];
}) {
  const navigate = useNavigate();
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = first.getDay();
  const todayN = now.getMonth() === month ? now.getDate() : -1;

  const counts = new Map<number, number>();
  for (const a of assignments) {
    if (!a.dueDate || a.completedAt) continue;
    const d = new Date(`${a.dueDate}T00:00:00`);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    counts.set(d.getDate(), (counts.get(d.getDate()) ?? 0) + 1);
  }
  const busiest = Math.max(1, ...counts.values());
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  return (
    <button
      data-no-drag data-el-action
      onClick={() => navigate('/calendar')}
      className="w-full h-full text-left flex flex-col px-2.5 py-2 overflow-hidden"
      title="Open the full calendar"
    >
      <div className="flex items-baseline gap-1.5 mb-1 flex-shrink-0">
        <span className="text-[9.5px] font-extrabold tracking-wide text-gray-500 truncate">
          {first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase()}
        </span>
        <span className="ml-auto text-[9px] text-gray-400 tabular-nums">{total} due</span>
      </div>

      <div className="grid grid-cols-7 gap-[2px] text-center flex-shrink-0 mb-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="text-[7.5px] font-bold text-gray-300">{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-[2px] flex-1 min-h-0 content-start">
        {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const n = i + 1;
          const c = counts.get(n) ?? 0;
          const heat = c ? 0.2 + 0.8 * (c / busiest) : 0;
          return (
            <span
              key={n}
              className="rounded-[3px] flex items-center justify-center tabular-nums"
              style={{
                fontSize: 8,
                aspectRatio: '1.1',
                backgroundColor: c ? `rgba(217,119,6,${heat.toFixed(2)})` : '#f1f5f9',
                color: c && heat > 0.55 ? '#fff' : '#64748b',
                outline: n === todayN ? '1.5px solid #4aa8d8' : undefined,
                fontWeight: n === todayN ? 800 : 500,
              }}
              title={c ? `${n}: ${c} task${c === 1 ? '' : 's'} due` : String(n)}
            >
              {n}
            </span>
          );
        })}
      </div>

      {jobs.length === 0 && (
        <span className="text-[8.5px] text-gray-300 mt-0.5 flex-shrink-0">No jobs yet</span>
      )}
    </button>
  );
}
