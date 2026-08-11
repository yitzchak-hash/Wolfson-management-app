import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Apartment, CanvasElement, Stage, ContractorAssignment, isCountableApartment, getStageName,
  projectColor, boardsForUser, MAIN_BOARD,
} from '../../types';
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

// ── Somebody's board, live and in miniature ─────────────────────────────────

/**
 * A live miniature of a CHOSEN person's board.
 *
 * Not the board you are standing on — a picture of the thing under your feet is
 * the one useless choice, so it is excluded from the picker. What it is for is
 * seeing what somebody else has arranged without leaving your own board.
 *
 * It is genuinely the same board, drawn small: the jobs where that board puts
 * them, its notes, its groups. It has its own zoom and pan, so you can go into
 * a corner of it without touching your own view, and the wheel anchors on the
 * pointer exactly as the full-size board does.
 *
 * WHO CAN PICK WHAT is decided by boardAccess() — the same function the board
 * picker and the wallboard use, so there is no second copy of the rule to keep
 * in step. You see main boards, your own, and boards shared with you; an admin
 * sees everything, because an admin can already open everything.
 */
export function BoardMini({ el, jobs, stages, onOpen, update, readOnly }: {
  el: CanvasElement;
  jobs: Apartment[];
  stages: Stage[];
  onOpen: (id: string) => void;
  update: (patch: Partial<CanvasElement>) => void;
  readOnly?: boolean;
}) {
  const data = (el.data ?? {}) as { projectId?: string; boardId?: string; title?: string };
  const projects = useStore(st => st.projects);
  const boardViews = useStore(st => st.boardViews);
  const currentUser = useStore(st => st.currentUser);
  const currentProjectId = useStore(st => st.currentProjectId);
  const liveElements = useStore(st => st.canvasElements);
  const liveApartments = useStore(st => st.apartments);

  const isAdmin = (currentUser?.role ?? '').toLowerCase().includes('admin');
  const chosenProject = data.projectId ?? '';
  const chosenBoard = data.boardId;

  const [view, setView] = useState({ zoom: 0.34, x: 0, y: 0 });
  const frame = useRef<HTMLDivElement>(null);

  /** Boards this person may look at, in the workspace they picked. */
  const options = useMemo(() => {
    if (!chosenProject) return [];
    const mine = boardsForUser(boardViews, chosenProject, currentUser?.id ?? '', isAdmin);
    return [
      { id: MAIN_BOARD, name: 'Main board', owner: 'everyone' },
      ...mine.map(v => ({
        id: v.id,
        name: v.name,
        owner: v.ownerId === currentUser?.id ? 'yours' : (v.createdBy || 'shared'),
      })),
    ];
  }, [boardViews, chosenProject, currentUser?.id, isAdmin]);

  // Nothing is drawn until a board has been chosen — so it can never sit there
  // showing the board you are already looking at.
  const needsPicking = !chosenProject || chosenBoard === undefined;

  const sameWorkspace = chosenProject === currentProjectId;
  const snap = useMemo(() => {
    if (!chosenProject) return { apartments: [] as Apartment[], stages: [] as Stage[] };
    if (sameWorkspace) return { apartments: liveApartments, stages };
    return loadProjectSnapshot(chosenProject);
  }, [chosenProject, sameWorkspace, liveApartments, stages]);

  /** The nodes and tiles ON that board. */
  const nodes = useMemo(
    () => (sameWorkspace ? liveElements : []).filter(e => (e.board ?? '') === (chosenBoard ?? '')),
    [liveElements, chosenBoard, sameWorkspace],
  );
  const tiles = useMemo(() => snap.apartments
    .filter(a => a.buildingId === 'G' && !a.isUnnamed && !a.boardBin)
    .map((j, i) => {
      const at = chosenBoard ? j.viewPos?.[chosenBoard] : undefined;
      return {
        job: j,
        x: at?.x ?? j.canvasX ?? 24 + (i % 6) * 240,
        y: at?.y ?? j.canvasY ?? 24 + Math.floor(i / 6) * 150,
      };
    }), [snap.apartments, chosenBoard]);

  /** Zoom towards the pointer, inside the widget, without touching your board. */
  function wheel(e: React.WheelEvent) {
    e.stopPropagation();
    const r = frame.current?.getBoundingClientRect();
    if (!r) return;
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    setView(v => {
      const next = Math.max(0.08, Math.min(1.4, v.zoom * (e.deltaY < 0 ? 1.14 : 1 / 1.14)));
      if (next === v.zoom) return v;
      return { zoom: next, x: cx - (cx - v.x) * (next / v.zoom), y: cy - (cy - v.y) * (next / v.zoom) };
    });
  }

  const dragging = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  if (needsPicking) {
    return (
      <div className="w-full h-full flex flex-col gap-2 px-3 py-2.5 overflow-auto" data-no-drag>
        <span className="text-[9.5px] font-extrabold tracking-wide text-gray-400">WHOSE BOARD?</span>
        <select
          data-el-action
          value={chosenProject}
          onChange={e => update({ data: { ...data, projectId: e.target.value, boardId: undefined } })}
          className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-[12px] bg-white outline-none"
        >
          <option value="">Which workspace…</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        {chosenProject && (
          <div className="grid gap-1">
            {options.map(o => (
              <button
                key={o.id || 'main'}
                data-el-action
                onClick={() => update({ data: { ...data, boardId: o.id } })}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200
                           text-left hover:border-[#4aa8d8] transition-colors"
              >
                <span className="flex-1 min-w-0 truncate text-[12px] font-semibold text-slate-700">
                  {o.name}
                </span>
                <span className="text-[10px] text-slate-400">{o.owner}</span>
              </button>
            ))}
            {options.length === 1 && (
              <p className="text-[10.5px] text-gray-400 m-0 px-0.5">
                Only the main board here — named boards appear once somebody
                shares one with you.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const boardName = chosenBoard
    ? boardViews.find(v => v.id === chosenBoard)?.name ?? 'Board'
    : 'Main board';
  const projectName = projects.find(p => p.id === chosenProject)?.name ?? chosenProject;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 flex-shrink-0">
        <span className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: projectColor(projects, chosenProject) }} />
        <span className="text-[9.5px] font-extrabold tracking-wide text-gray-500 truncate">
          {(data.title || `${projectName} · ${boardName}`).toUpperCase()}
        </span>
        <span className="text-[9px] text-gray-400 tabular-nums">{tiles.length}</span>
        <span className="flex-1" />
        {!readOnly && (
          <>
            <button data-no-drag data-el-action title="Fit"
              onClick={() => setView({ zoom: 0.34, x: 0, y: 0 })}
              className="px-1.5 rounded text-[9px] font-bold text-gray-400 hover:bg-gray-100">Fit</button>
            <button data-no-drag data-el-action title="Choose another board"
              onClick={() => update({ data: { ...data, boardId: undefined } })}
              className="px-1.5 rounded text-[9px] font-bold text-gray-400 hover:bg-gray-100">Change</button>
          </>
        )}
      </div>

      <div
        ref={frame}
        data-no-drag
        onWheel={wheel}
        onPointerDown={e => {
          if (readOnly) return;
          dragging.current = { px: e.clientX, py: e.clientY, ox: view.x, oy: view.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          const d = dragging.current;
          if (!d) return;
          setView(v => ({ ...v, x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) }));
        }}
        onPointerUp={() => { dragging.current = null; }}
        className="flex-1 min-h-0 relative overflow-hidden rounded-md"
        style={{
          background: 'radial-gradient(circle at 1px 1px, rgba(15,23,42,.10) 1px, transparent 0) 0 0/14px 14px, #f8fafc',
          cursor: readOnly ? 'default' : 'grab',
          touchAction: 'none',
        }}
      >
        {tiles.length === 0 && nodes.length === 0 && (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400 px-3 text-center">
            {sameWorkspace ? 'Nothing on that board yet.' : 'Open that workspace once on this device to see it.'}
          </span>
        )}

        <div className="absolute top-0 left-0"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
          {nodes.filter(n => n.type !== 'stroke').map(n => (
            <div key={n.id} className="absolute rounded-lg"
              style={{
                left: n.x, top: n.y, width: n.w, height: n.h,
                backgroundColor: n.type === 'box' ? 'rgba(148,163,184,.20)' : (n.color || '#fff'),
                border: n.type === 'bin' ? '2px dashed #cbd5e1' : '1px solid rgba(15,23,42,.10)',
              }}>
              {n.text && (
                <span className="block px-2 pt-1.5 text-[11px] font-semibold text-slate-600 truncate">
                  {n.text}
                </span>
              )}
            </div>
          ))}
          {tiles.map(({ job, x, y }) => {
            const st = snap.stages.find(s => s.id === job.currentStageId);
            return (
              <button
                key={job.id}
                data-el-action
                onDoubleClick={() => onOpen(job.id)}
                title={`${job.displayName || 'Job'} — double-click to open`}
                className="absolute rounded-lg bg-white text-left px-2 py-1.5 hover:ring-2 hover:ring-[#4aa8d8]"
                style={{ left: x, top: y, width: 215, height: 132,
                         border: `3px solid ${st?.color ?? '#cbd5e1'}` }}
              >
                <span className="block text-[13px] font-bold text-slate-800 truncate">
                  {job.displayName || 'Job'}
                </span>
                {st && <span className="block text-[11px] text-slate-400 truncate">{st.name}</span>}
              </button>
            );
          })}
        </div>
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
