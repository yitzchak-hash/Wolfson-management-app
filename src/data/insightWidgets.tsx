import React from 'react';
import {
  CalendarOff, EyeOff, UserX, TrendingUp, MapPinned, FileWarning,
  Layers3, CopyCheck, SkipForward,
} from 'lucide-react';
import {
  Apartment, CanvasElement, ContractorAssignment,
  isCountableApartment, personColor, getStageName,
} from '../types';
import { WidgetCtx, WidgetDef, Frame, d } from './widgets';
import { MiniJob } from '../components/board/MiniJob';
import { PlannerData } from '../components/board/PlannerWidget';
import { soundScore } from './hebrewSearch';
import { useStore } from './store';

/**
 * The widgets that answer a question nothing else in the app answers.
 *
 * Every existing live widget counts what is HAPPENING — tasks open, jobs at a
 * stage, who is carrying what. Each of these instead finds what is NOT
 * happening: work with no date on it, a site nobody has heard from, a unit
 * halfway through with nobody booked. Those are the things that go wrong
 * quietly, because there is no list they appear on and therefore no moment
 * anybody notices them.
 *
 * They live in their own file rather than in `widgets.tsx` only because that
 * file is already long; they are ordinary registry entries and are pushed onto
 * `WIDGETS` at the bottom of it, exactly like the wall widgets.
 */

const dayMs = 86_400_000;
const daysSince = (iso?: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / dayMs) : Infinity;

/** Only jobs that count. A binned job is filed away — it is not "unbooked". */
const liveJobs = (c: WidgetCtx) => c.jobs.filter(isCountableApartment);

/**
 * Only the tasks on those jobs.
 *
 * A job filed into Done or Trash drops out of every unit count in the app, and
 * its tasks have to drop out with it — otherwise filing a job away removes it
 * from the totals while its work carries on appearing in the chasing lists,
 * which is the one thing filing it was meant to stop.
 */
function liveAssignments(c: WidgetCtx): ContractorAssignment[] {
  const ok = new Set(liveJobs(c).map(j => j.id));
  return c.assignments.filter(a => ok.has(a.apartmentId));
}

/** An empty list should say what it means, not sit blank looking broken. */
function Empty({ children, good }: { children: React.ReactNode; good?: boolean }) {
  return (
    <span className={`text-[10.5px] ${good ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
      {children}
    </span>
  );
}

const Scroll = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">{children}</div>
);

/** Everybody named anywhere on any planner on the board, as a set of job ids. */
function jobsOnPlanners(elements: CanvasElement[]): Set<string> {
  const out = new Set<string>();
  for (const el of elements) {
    if (el.type !== 'widget' || el.widget !== 'rota') continue;
    const data = (el.data ?? {}) as PlannerData;
    for (const entries of Object.values(data.cells ?? {})) {
      for (const e of entries) if (e.jobId) out.add(e.jobId);
    }
  }
  return out;
}

/**
 * Sunday of the week a date falls in, as a local yyyy-mm-dd.
 *
 * Returns '' for anything unparseable. Records made before a field existed
 * carry a blank timestamp, and `new Date('').toISOString()` throws — one such
 * row took down the whole board, not just the widget reading it.
 */
function weekStart(t: number): string {
  if (!Number.isFinite(t)) return '';
  const dt = new Date(t);
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - dt.getDay());
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 4 · Nobody's booked, and 3 · Gone quiet — both need the board's own nodes.
 *
 * A planner is a widget, so "is this job booked?" is a question about the other
 * things on the board. `boardElements` is what the shelf uses to hand over a
 * sample planner; everywhere else the store is the board.
 */
function NobodyBooked({ c, el }: { c: WidgetCtx; el: CanvasElement }) {
  const storeElements = useStore(s => s.canvasElements);
  const booked = jobsOnPlanners(c.boardElements ?? storeElements);
  const limit = Number(d(el).limit) || 20;

  // "Mid-job" means somebody has started it: a stage is set and it is not at
  // the last one. A job nobody has touched yet is not neglected, it is queued.
  const lastStage = c.stages[c.stages.length - 1]?.id;
  const list = liveJobs(c).filter(j =>
    j.currentStageId
    && j.currentStageId !== lastStage
    && !booked.has(j.id)
    && !c.assignments.some(a => a.apartmentId === j.id && !a.completedAt));

  return (
    <Frame title={`Nobody's booked · ${list.length}`} icon={UserX} tone="#7c3aed">
      <Scroll>
        {list.length === 0 && <Empty good>Everything under way has somebody on it</Empty>}
        {list.slice(0, limit).map(j => (
          <MiniJob key={j.id} job={j} stages={c.stages} assignments={c.assignments}
            onOpen={c.openJob} rtl={c.isRtl} sub="no task, not on a planner" />
        ))}
      </Scroll>
    </Frame>
  );
}

/**
 * 3 · Gone quiet on site.
 *
 * A task handed out and then silence is the failure mode the office finds out
 * about last — the task is not late yet, so it is on no list, and nobody has
 * said anything, so there is nothing to read. This looks for the silence
 * itself: an open task older than a few days with no photo and no note against
 * it since the day it was given out.
 */
function GoneQuiet({ c, el }: { c: WidgetCtx; el: CanvasElement }) {
  const storeNotes = useStore(s => s.contractorNotes);
  const notes = c.notes ?? storeNotes;
  const after = Number(d(el).days) || 7;

  const quiet = liveAssignments(c)
    .filter(a => !a.completedAt && daysSince(a.createdAt) >= after)
    .filter(a => !c.photos.some(p => p.assignmentId === a.id))
    .filter(a => !notes.some(n => n.assignmentId === a.id && n.authorType === 'contractor'))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Grouped by person, because the action is one phone call per contractor,
  // not one per task.
  const byPerson = new Map<string, ContractorAssignment[]>();
  for (const a of quiet) byPerson.set(a.contractorId, [...(byPerson.get(a.contractorId) ?? []), a]);

  return (
    <Frame title={`Gone quiet · ${quiet.length}`} icon={EyeOff} tone="#dc2626">
      <Scroll>
        {quiet.length === 0 && <Empty good>Everyone has checked in</Empty>}
        {[...byPerson.entries()].map(([cid, list]) => {
          const con = c.contractors.find(x => x.id === cid);
          const oldest = daysSince(list[0].createdAt);
          return (
            <div key={cid} className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: personColor(con?.name ?? '?', con?.color) }} />
                <span className="text-[10.5px] font-bold text-slate-700 truncate flex-1">
                  {con?.name ?? 'Unassigned'}
                </span>
                <span className="text-[9px] font-black text-red-600 tabular-nums flex-shrink-0">
                  {oldest}d
                </span>
              </div>
              {list.slice(0, 3).map(a => {
                const job = c.jobs.find(j => j.id === a.apartmentId);
                return (
                  <div key={a.id} className="pl-3 text-[9.5px] text-gray-400 truncate">
                    {job?.displayName || job?.address || 'a job'} · {a.taskDescription}
                  </div>
                );
              })}
            </div>
          );
        })}
      </Scroll>
    </Frame>
  );
}

/**
 * 8 · Open snags.
 *
 * Punch-list pins already exist against every plan and there has never been a
 * way to see them all at once — you had to open a job, open its plan, and look.
 * A project's outstanding snags are exactly the list somebody wants at a
 * handover meeting.
 */
function OpenSnags({ c, el }: { c: WidgetCtx; el: CanvasElement }) {
  const storePins = useStore(s => s.planPins);
  const pins = (c.planPins ?? storePins).filter(p => !p.resolvedAt);
  const limit = Number(d(el).limit) || 20;

  const byJob = new Map<string, typeof pins>();
  for (const p of pins) byJob.set(p.apartmentId, [...(byJob.get(p.apartmentId) ?? []), p]);

  return (
    <Frame title={`Open snags · ${pins.length}`} icon={MapPinned} tone="#d97706">
      <Scroll>
        {pins.length === 0 && <Empty good>No snags outstanding</Empty>}
        {[...byJob.entries()].slice(0, limit).map(([jobId, list]) => {
          const job = c.jobs.find(j => j.id === jobId);
          return (
            <div key={jobId} className="min-w-0">
              {job
                ? <MiniJob job={job} stages={c.stages} assignments={c.assignments}
                    onOpen={c.openJob} rtl={c.isRtl}
                    sub={`${list.length} open snag${list.length === 1 ? '' : 's'}`} />
                : <span className="text-[10.5px] text-gray-400">{list.length} snags</span>}
              {list.slice(0, 2).map((p, i) => (
                <div key={p.id} className="pl-4 text-[9.5px] text-gray-400 truncate">
                  {i + 1}. {p.text || 'no wording'}
                </div>
              ))}
            </div>
          );
        })}
      </Scroll>
    </Frame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export const INSIGHT_WIDGETS: WidgetDef[] = [
  // ── 2 · No date on it ─────────────────────────────────────────────────────
  {
    id: 'no-date', rank: 8, name: 'No date on it', category: 'live',
    icon: CalendarOff, w: 235, h: 175,
    blurb: 'Open tasks with no due date — the ones no other list can ever show.',
    data: {},
    render: (el, c) => {
      // These are invisible to Running late, Due today and Week ahead, all of
      // which key off a date. Without this they can only be found by opening
      // every job in turn, which means in practice they are never found.
      const list = liveAssignments(c)
        .filter(a => !a.completedAt && !a.dueDate)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const limit = Number(d(el).limit) || 20;
      return (
        <Frame title={`No date on it · ${list.length}`} icon={CalendarOff} tone="#64748b">
          <Scroll>
            {list.length === 0 && <Empty good>Everything open has a date</Empty>}
            {list.slice(0, limit).map(a => {
              const job = c.jobs.find(j => j.id === a.apartmentId);
              const con = c.contractors.find(x => x.id === a.contractorId);
              const age = daysSince(a.createdAt);
              return (
                <div key={a.id} className="flex items-center gap-1 min-w-0">
                  <span className="text-[9px] font-bold text-slate-400 tabular-nums w-7 flex-shrink-0">
                    {Number.isFinite(age) ? `${age}d` : ''}
                  </span>
                  <div className="flex-1 min-w-0">
                    {job
                      ? <MiniJob job={job} stages={c.stages} assignments={c.assignments}
                          onOpen={c.openJob} rtl={c.isRtl}
                          sub={con ? `${con.name} · ${a.taskDescription}` : a.taskDescription} />
                      : <span className="text-[10.5px] text-gray-400 truncate">{a.taskDescription}</span>}
                  </div>
                </div>
              );
            })}
          </Scroll>
        </Frame>
      );
    },
  },

  // ── 3 · Gone quiet on site ────────────────────────────────────────────────
  {
    id: 'gone-quiet', rank: 9, name: 'Gone quiet on site', category: 'live',
    icon: EyeOff, w: 240, h: 185,
    blurb: 'Contractors sitting on an open task with no photo and no word back.',
    data: { days: 7 },
    render: (el, c) => <GoneQuiet el={el} c={c} />,
  },

  // ── 4 · Nobody's booked ───────────────────────────────────────────────────
  {
    id: 'nobody-booked', rank: 10, name: "Nobody's booked", category: 'live',
    icon: UserX, w: 235, h: 180,
    blurb: 'Units part-way through with no open task and nobody on a planner.',
    data: {},
    render: (el, c) => <NobodyBooked el={el} c={c} />,
  },

  // ── 7 · Backlog trend ─────────────────────────────────────────────────────
  {
    id: 'backlog-trend', rank: 14, name: 'Backlog trend', category: 'live',
    icon: TrendingUp, w: 250, h: 165,
    blurb: 'Tasks made against tasks finished, week by week. Output alone always looks healthy.',
    data: { weeks: 8 },
    render: (el, c) => {
      const n = Math.max(3, Math.min(16, Number(d(el).weeks) || 8));
      const now = Date.now();
      const weeks = Array.from({ length: n }, (_, i) => weekStart(now - (n - 1 - i) * 7 * dayMs));
      const made = new Map(weeks.map(w => [w, 0]));
      const done = new Map(weeks.map(w => [w, 0]));
      for (const a of liveAssignments(c)) {
        const mw = weekStart(new Date(a.createdAt).getTime());
        if (made.has(mw)) made.set(mw, made.get(mw)! + 1);
        if (a.completedAt) {
          const dw = weekStart(new Date(a.completedAt).getTime());
          if (done.has(dw)) done.set(dw, done.get(dw)! + 1);
        }
      }
      const top = Math.max(1, ...weeks.flatMap(w => [made.get(w)!, done.get(w)!]));
      // The number that matters is the gap, not either bar: a week that makes
      // nine and closes four is a week the backlog grew by five, however busy
      // it felt.
      const net = weeks.reduce((s, w) => s + made.get(w)! - done.get(w)!, 0);

      return (
        <Frame title="Backlog trend" icon={TrendingUp} tone={net > 0 ? '#dc2626' : '#16a34a'}>
          <div className="h-full flex flex-col">
            <div className="flex items-baseline gap-1.5 flex-shrink-0 mb-1">
              <span className="text-[17px] font-black tabular-nums"
                style={{ color: net > 0 ? '#dc2626' : '#16a34a' }}>
                {net > 0 ? `+${net}` : net}
              </span>
              <span className="text-[9px] text-gray-400">
                {net > 0 ? 'more made than finished' : net < 0 ? 'backlog coming down' : 'holding level'}
              </span>
            </div>
            <div className="flex-1 min-h-0 flex items-end gap-[3px]">
              {weeks.map(w => (
                <div key={w} className="flex-1 flex items-end gap-[1px] h-full" title={
                  `${shortDay(w)} — ${made.get(w)} made, ${done.get(w)} finished`}>
                  <div className="flex-1 rounded-t-sm" style={{
                    height: `${(made.get(w)! / top) * 100}%`, minHeight: 2, backgroundColor: '#f59e0b',
                  }} />
                  <div className="flex-1 rounded-t-sm" style={{
                    height: `${(done.get(w)! / top) * 100}%`, minHeight: 2, backgroundColor: '#16a34a',
                  }} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-shrink-0">
              <span className="flex items-center gap-1 text-[8px] text-gray-400">
                <i className="w-2 h-2 rounded-sm inline-block" style={{ background: '#f59e0b' }} /> made
              </span>
              <span className="flex items-center gap-1 text-[8px] text-gray-400">
                <i className="w-2 h-2 rounded-sm inline-block" style={{ background: '#16a34a' }} /> finished
              </span>
              <span className="ml-auto text-[8px] text-gray-300">{shortDay(weeks[0])} →</span>
            </div>
          </div>
        </Frame>
      );
    },
  },

  // ── 8 · Open snags ────────────────────────────────────────────────────────
  {
    id: 'open-snags', rank: 11, name: 'Open snags', category: 'live',
    icon: MapPinned, w: 240, h: 185,
    blurb: 'Every unresolved plan pin in the workspace, gathered by job.',
    data: {},
    render: (el, c) => <OpenSnags el={el} c={c} />,
  },

  // ── 11 · On site without a plan ───────────────────────────────────────────
  {
    id: 'no-plan', rank: 12, name: 'On site without a plan', category: 'live',
    icon: FileWarning, w: 235, h: 175,
    blurb: 'Jobs with work handed out but no engineering plan set on them.',
    data: {},
    render: (el, c) => {
      // The contractor's portal shows the plan straight off the job, so a job
      // with work on it and no plan means somebody is on site guessing.
      const list = liveJobs(c).filter(j =>
        !j.plansPdfLink
        && c.assignments.some(a => a.apartmentId === j.id && !a.completedAt));
      const limit = Number(d(el).limit) || 20;
      return (
        <Frame title={`No plan · ${list.length}`} icon={FileWarning} tone="#dc2626">
          <Scroll>
            {list.length === 0 && <Empty good>Every live job has its plan</Empty>}
            {list.slice(0, limit).map(j => (
              <MiniJob key={j.id} job={j} stages={c.stages} assignments={c.assignments}
                onOpen={c.openJob} rtl={c.isRtl}
                sub={j.driveLink ? 'folder set, no plan chosen' : 'no Drive folder either'} />
            ))}
          </Scroll>
        </Frame>
      );
    },
  },

  // ── 14 · Floor by floor ───────────────────────────────────────────────────
  {
    id: 'floor-by-floor', rank: 15, name: 'Floor by floor', category: 'live',
    icon: Layers3, w: 250, h: 210,
    blurb: 'One bar per floor, split by stage. Where the building actually is.',
    data: {},
    render: (el, c) => {
      const want = d(el).buildingId as string | undefined;
      const units = liveJobs(c).filter(j => j.floor > 0 && (!want || j.buildingId === want));
      const floors = [...new Set(units.map(u => u.floor))].sort((a, b) => b - a);
      const stageOf = (j: Apartment) => c.stages.find(s => s.id === j.currentStageId);

      return (
        <Frame title={want ? `Floor by floor · ${want}` : 'Floor by floor'} icon={Layers3}>
          <Scroll>
            {floors.length === 0 && (
              <Empty>
                {/* The Job Board has no floors at all, which is not a fault —
                    it is a different shape of workspace, and saying so is
                    better than an empty box that reads as broken. */}
                This workspace has no floors — put one on Wolfson or Netiv.
              </Empty>
            )}
            {floors.map(f => {
              const on = units.filter(u => u.floor === f);
              const started = on.filter(u => u.currentStageId).length;
              return (
                <div key={f} className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[9px] font-black text-slate-400 tabular-nums w-5 flex-shrink-0 text-right">
                    {f}
                  </span>
                  <div className="flex-1 flex h-3 rounded-sm overflow-hidden bg-slate-100 min-w-0">
                    {on.map(u => {
                      const st = stageOf(u);
                      return (
                        <button
                          key={u.id} data-no-drag data-el-action
                          onClick={() => c.openJob(u.id)}
                          className="flex-1 min-w-0 hover:opacity-70 transition-opacity"
                          style={{ backgroundColor: st?.color ?? '#e2e8f0' }}
                          title={`${u.apartmentNumber || u.displayName || 'unit'} — ${
                            st ? getStageName(st, !!c.isRtl) : 'not started'}`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[8.5px] text-gray-400 tabular-nums w-8 flex-shrink-0">
                    {started}/{on.length}
                  </span>
                </div>
              );
            })}
          </Scroll>
        </Frame>
      );
    },
  },

  // ── 16 · Possible duplicates ──────────────────────────────────────────────
  {
    id: 'duplicates', rank: 16, name: 'Possible duplicates', category: 'live',
    icon: CopyCheck, w: 245, h: 175,
    blurb: 'Two records that look like the same job — same address, or a name that sounds alike.',
    data: {},
    render: (el, c) => {
      const jobs = liveJobs(c);
      const pairs: { a: Apartment; b: Apartment; why: string }[] = [];
      const seen = new Set<string>();
      // The same sound-matching the search box uses, so "Artzi" and "ארצי"
      // are recognised as one family here too — which is exactly how the
      // duplicate got made in the first place.
      for (let i = 0; i < jobs.length; i++) {
        for (let j = i + 1; j < jobs.length; j++) {
          const A = jobs[i], B = jobs[j];
          const key = `${A.id}|${B.id}`;
          if (seen.has(key)) continue;
          const addrA = (A.address ?? '').trim().toLowerCase();
          const addrB = (B.address ?? '').trim().toLowerCase();
          let why = '';
          if (addrA && addrA === addrB) why = 'same address';
          else if (A.driveLink && A.driveLink === B.driveLink) why = 'same Drive folder';
          else {
            const nameA = (A.displayName ?? '').trim(), nameB = (B.displayName ?? '').trim();
            if (nameA.length > 2 && nameB.length > 2 && soundScore(nameA, nameB) >= 0.92) {
              why = 'the names sound the same';
            }
          }
          if (why) { pairs.push({ a: A, b: B, why }); seen.add(key); }
        }
      }
      const limit = Number(d(el).limit) || 12;
      return (
        <Frame title={`Possible duplicates · ${pairs.length}`} icon={CopyCheck} tone="#7c3aed">
          <Scroll>
            {pairs.length === 0 && <Empty good>Nothing looks doubled up</Empty>}
            {pairs.slice(0, limit).map(({ a, b, why }) => (
              <div key={`${a.id}|${b.id}`} className="min-w-0 border-l-2 pl-1.5"
                style={{ borderColor: '#e9d5ff' }}>
                <div className="text-[8.5px] text-purple-500 font-bold uppercase tracking-wide">{why}</div>
                <MiniJob job={a} stages={c.stages} assignments={c.assignments}
                  onOpen={c.openJob} rtl={c.isRtl} size={10} />
                <MiniJob job={b} stages={c.stages} assignments={c.assignments}
                  onOpen={c.openJob} rtl={c.isRtl} size={10} />
              </div>
            ))}
          </Scroll>
        </Frame>
      );
    },
  },

  // ── 17 · Skipped a stage ──────────────────────────────────────────────────
  {
    id: 'skipped-stage', rank: 17, name: 'Skipped a stage', category: 'live',
    icon: SkipForward, w: 240, h: 175,
    blurb: 'Jobs that jumped past a stage without ever being recorded at it.',
    data: {},
    render: (el, c) => {
      // Read out of the change log rather than guessed from the current stage:
      // a job sitting at stage 5 tells you nothing about whether it passed
      // through 3, but the log holds every move it ever made.
      const order = new Map(c.stages.map((s, i) => [s.name, i]));
      const moves = c.logs
        .filter(l => l.fieldChanged === 'currentStageId' && l.apartmentId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      const found = new Map<string, { from: string; to: string; missed: string[] }>();
      const at = new Map<string, number>();
      for (const l of moves) {
        const to = order.get(l.newValue ?? '');
        if (to === undefined) { at.set(l.apartmentId, -1); continue; }
        const from = at.get(l.apartmentId) ?? -1;
        if (from >= 0 && to > from + 1) {
          found.set(l.apartmentId, {
            from: c.stages[from].name,
            to: c.stages[to].name,
            missed: c.stages.slice(from + 1, to).map(s => s.name),
          });
        }
        at.set(l.apartmentId, to);
      }
      const rows = [...found.entries()]
        .map(([id, info]) => ({ job: c.jobs.find(j => j.id === id), info }))
        .filter(r => !!r.job);
      const limit = Number(d(el).limit) || 12;

      return (
        <Frame title={`Skipped a stage · ${rows.length}`} icon={SkipForward} tone="#d97706">
          <Scroll>
            {rows.length === 0 && <Empty good>Nothing has jumped a stage</Empty>}
            {rows.slice(0, limit).map(({ job, info }) => (
              <div key={job!.id} className="min-w-0">
                <MiniJob job={job!} stages={c.stages} assignments={c.assignments}
                  onOpen={c.openJob} rtl={c.isRtl}
                  sub={`missed ${info.missed.join(', ')}`} />
              </div>
            ))}
          </Scroll>
        </Frame>
      );
    },
  },
];
