import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Apartment, CanvasElement, Stage, ContractorAssignment, isCountableApartment, getStageName,
  projectColor, boardsForUser, MAIN_BOARD, aptLabel,
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
export function ProjectMini({ projectId: chosen, buildingId, onOpen, onOpenUnit, sample }: {
  projectId: string;
  /** One building only, or blank for all of them side by side. */
  buildingId?: string;
  onOpen?: (projectId: string) => void;
  /** Clicking one apartment: switch to that workspace and open that unit. */
  onOpenUnit?: (projectId: string, apartmentId: string) => void;
  /** Store preview: with nothing stored to draw, show a full FAKE building
      (marked as sample) instead of "not opened on this device". */
  sample?: boolean;
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

  const units = snap.apartments.filter(isCountableApartment)
    .filter(a => !buildingId || a.buildingId === buildingId);
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
    /**
     * A DIV, not one big button.
     *
     * Every apartment is its own control now — clicking one opens that unit in
     * its own workspace — and a button inside a button is invalid markup that
     * browsers quietly flatten, so the outer control had to go. The header
     * keeps a button of its own for "open the workspace".
     */
    <div
      className="w-full h-full text-left flex flex-col px-2.5 py-2 overflow-hidden"
      data-no-drag data-el-action
    >
      <div className="flex items-center gap-1.5 mb-1 flex-shrink-0">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tone }} />
        <button
          onClick={() => onOpen?.(projectId)}
          title={`Open ${project?.name ?? 'this workspace'}`}
          className="text-[9.5px] font-extrabold tracking-wide truncate hover:underline"
          style={{ color: tone }}>
          {(project?.name ?? projectId).toUpperCase()}
        </button>
        <span className="ml-auto text-[9px] text-gray-400 tabular-nums flex-shrink-0">
          {byBuilding.length === 0 && sample ? '42/56' : `${started}/${units.length}`}
        </span>
      </div>

      {byBuilding.length === 0 && sample ? (
        /**
         * The store's full-fake mode: a two-building miniature drawn from a
         * fixed stage palette, so the shelf shows what the widget IS — a
         * building with every unit in its stage colour — rather than an
         * apology about this device's cache.
         */
        <div className="flex-1 min-h-0 flex gap-2 overflow-hidden">
          {(['A1', 'A2'] as const).map((bid, bi) => (
            <div key={bid} className="flex flex-col min-w-0 flex-1">
              <span className="text-[8px] font-bold text-gray-400 mb-0.5">{bid}</span>
              <div className="flex-1 min-h-0 grid gap-[2px] content-start"
                style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                {Array.from({ length: 28 }, (_, i) => {
                  const palette = ['#0ea5e9', '#f59e0b', '#f43f5e', '#10b981', '#16a34a', '#8b5cf6', '#e2e8f0'];
                  // A fixed spread, weighted towards the middle stages, with a
                  // few grey not-started cells — deterministic, so the card
                  // never shimmers between renders.
                  const c = palette[(i * 5 + bi * 3) % 9 < 7 ? (i * 5 + bi * 3) % 7 : 6];
                  return <span key={i} className="rounded-[2px]" style={{ backgroundColor: c, aspectRatio: '1.35' }} />;
                })}
              </div>
            </div>
          ))}
        </div>
      ) : byBuilding.length === 0 ? (
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
                  const fill = st?.color ?? '#e2e8f0';
                  return (
                    /**
                     * A cell reads like the real diagram: the number, and the
                     * family name under it when there is room. Bare colour
                     * squares meant you could see the shape of the work and
                     * not one thing about WHICH unit — and clicking one now
                     * takes you to that unit in its own workspace.
                     */
                    <button
                      key={a.id}
                      onClick={e => { e.stopPropagation(); onOpenUnit?.(projectId, a.id); }}
                      className="rounded-[2px] overflow-hidden flex flex-col items-center justify-center leading-none
                                 hover:ring-2 hover:ring-[#1e3a5f] transition-shadow px-[1px]"
                      style={{ backgroundColor: fill, aspectRatio: '1.35', color: readableOn(fill) }}
                      title={`${aptLabel(a)} · ${st ? getStageName(st, !!isRtl) : 'Not started'}`}
                    >
                      <span className="font-bold truncate max-w-full" style={{ fontSize: 7.5 }}>
                        {a.apartmentNumber || '—'}
                      </span>
                      {a.displayName && a.displayName !== a.apartmentNumber && (
                        <span className="truncate max-w-full" style={{ fontSize: 6, opacity: .85 }}>
                          {a.displayName}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Black or white writing, whichever can be read on this fill.
 *
 * The stage palette runs from pale amber to deep navy, so one fixed ink colour
 * is unreadable on half of it. Rec. 601 luma is the standard cheap answer and
 * is right for flat UI colours.
 */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#0f172a';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? '#0f172a' : '#ffffff';
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
  const data = (el.data ?? {}) as { projectId?: string; boardId?: string; title?: string; sample?: boolean };
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
  const tiles = useMemo(() => {
    const real = snap.apartments
      .filter(a => a.buildingId === 'G' && !a.isUnnamed && !a.boardBin)
      .map((j, i) => {
        const at = chosenBoard ? j.viewPos?.[chosenBoard] : undefined;
        return {
          job: j,
          x: at?.x ?? j.canvasX ?? 24 + (i % 6) * 240,
          y: at?.y ?? j.canvasY ?? 24 + Math.floor(i / 6) * 150,
        };
      });
    /**
     * The store's full-fake mode. With no board to draw on this machine, lay
     * the SAMPLE jobs (the ctx `jobs` prop) out as a tidy board, so the shelf
     * shows a busy miniature rather than an empty dotted field.
     */
    if (!real.length && data.sample && jobs.length) {
      return jobs.slice(0, 8).map((j, i) => ({
        job: j,
        x: 24 + (i % 3) * 240,
        y: 24 + Math.floor(i / 3) * 152,
      }));
    }
    return real;
  }, [snap.apartments, chosenBoard, data.sample, jobs]);

  /**
   * Open FITTED to what is on the board.
   *
   * The fixed 34% at the origin is right for a board arranged from its corner
   * and wrong for every other one — the owner's own board sits mid-world, so
   * the widget opened on empty dots with the tiles off-frame, which is
   * exactly how it previewed in the store. Fits once per board choice;
   * touching the view (wheel or drag) is respected from then on.
   */
  const touched = useRef(false);
  React.useEffect(() => {
    if (touched.current || (!tiles.length && !nodes.length)) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of tiles) {
      x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y);
      x1 = Math.max(x1, t.x + 215); y1 = Math.max(y1, t.y + 132);
    }
    for (const n of nodes) {
      if (n.type === 'stroke') continue;
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
    }
    if (!Number.isFinite(x0)) return;
    const fw = frame.current?.clientWidth ?? Math.max(80, el.w - 8);
    const fh = frame.current?.clientHeight ?? Math.max(60, el.h - 30);
    const pad = 14;
    const zoom = Math.max(0.08, Math.min(1.1,
      Math.min((fw - pad * 2) / Math.max(1, x1 - x0), (fh - pad * 2) / Math.max(1, y1 - y0))));
    setView({
      zoom,
      x: (fw - (x1 - x0) * zoom) / 2 - x0 * zoom,
      y: (fh - (y1 - y0) * zoom) / 2 - y0 * zoom,
    });
  }, [tiles, nodes, el.w, el.h]);

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
          {/* Only workspaces that HAVE a free board. The building projects
              are diagrams, not boards — offering them here produced a picker
              full of choices that could never draw anything. */}
          {projects
            .filter(p => p.id === 'general' || loadProjectSnapshot(p.id).buildings.length === 0)
            .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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

      <div className="grid grid-cols-7 gap-[2px] flex-1 min-h-0 content-start overflow-auto scrollbar-thin">
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
