import React, { useEffect, useMemo, useState } from 'react';
import { HardHat, CheckCircle2 } from 'lucide-react';
import {
  Apartment, CanvasElement, Stage, isCountableApartment, getStageName, personColor,
  projectColor,
} from '../types';
import { WidgetCtx, WidgetDef } from './widgets';
import { useStore, loadAllProjectsTaskData, loadProjectSnapshot } from './store';
import { hebrewLabel, holidaysOn } from './hebrewDates';
import { PlannerData, personOf, iso } from '../components/board/PlannerWidget';
import { daysOf } from './taskDays';

/**
 * The wall pieces.
 *
 * This file used to register SIXTEEN widgets — big-type copies of ordinary
 * board widgets, built when the wall drew everything at desk size. Since the
 * wall learned to scale every widget through WidgetSurface, the size reason
 * died, and the owner's 2026-08-27 dedupe folded fourteen of them into their
 * ordinary twins (see widgetAliases.ts — every old id still draws). What
 * remains here is what genuinely has no twin: the two surviving registrations
 * (Workers' load, Finished) and the wall-grade BODIES the merged board
 * widgets borrow — WhoIsOut, WorkspaceCard, LatestPhoto, PhotoWall,
 * WallClock, MonthHeat. widgets.tsx imports these; this file imports only
 * TYPES from widgets.tsx, so there is no runtime cycle.
 */

const d = (el: CanvasElement) => (el.data ?? {}) as Record<string, unknown>;
/**
 * Today, the way the PLANNER counts days.
 *
 * This used to be `toISOString().slice(0, 10)`, which is the date in UTC. The
 * planner writes its cell keys with local dates, so in Israel every day
 * between midnight and 2 or 3 in the morning the wall asked for yesterday's
 * row and showed the wrong people. One helper for both, so they cannot
 * disagree again.
 */
const todayIso = () => iso(new Date());

/** A wall card: a quiet label, then the thing itself. */
function Card({ label, tone, children, right }: {
  label: string; tone?: string; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <div className="w-full h-full flex flex-col px-3.5 py-3 overflow-hidden">
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <span className="text-[11px] font-extrabold tracking-widest" style={{ color: tone ?? '#94a3b8' }}>
          {label.toUpperCase()}
        </span>
        <span className="flex-1" />
        {right}
      </div>
      {/*
        Same rule as the board's Frame: a body that does not fit SCROLLS
        rather than losing its last line. On a wall panel nothing is ever
        this small, but the wall widgets are placeable on a board too.
      */}
      <div className="flex-1 min-h-0 overflow-auto widget-scroll">{children}</div>
    </div>
  );
}

function Figure({ value, sub, tone }: { value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="h-full flex flex-col justify-center">
      <div className="font-black leading-none tabular-nums" style={{ fontSize: 46, color: tone ?? '#0f172a' }}>
        {value}
      </div>
      {sub && <div className="text-[13px] text-slate-400 mt-1.5 truncate">{sub}</div>}
    </div>
  );
}

/** Everybody on the planner today, and where they are. */
function plannerRows(canvasElements: CanvasElement[], dayIso: string) {
  const out: { person: string; entries: { jobId?: string; text?: string }[] }[] = [];
  for (const el of canvasElements) {
    if (el.type !== 'widget' || el.widget !== 'rota') continue;
    const data = (el.data ?? {}) as PlannerData;
    for (const [key, entries] of Object.entries(data.cells ?? {})) {
      const [person, day] = key.split('|');
      if (day !== dayIso || !entries.length) continue;
      const row = out.find(r => r.person === person);
      if (row) row.entries.push(...entries);
      else out.push({ person, entries: [...entries] });
    }
  }
  return out;
}

/**
 * Who is out, read off the weekly notebook. Exported: the merged
 * "On site today" board widget draws this for its planner source.
 */
export function WhoIsOut({ c, dayIso, label, tone }: {
  c: WidgetCtx; dayIso: string; label: string; tone?: string;
}) {
  const storeElements = useStore(st => st.canvasElements);
  const users = useStore(st => st.users);
  // The shelf hands over a sample planner; everywhere else this is the board.
  const rows = plannerRows(c.boardElements ?? storeElements, dayIso);

  return (
    <Card label={label} tone={tone}>
      {rows.length === 0 ? (
        <span className="text-[13px] text-slate-400">Nothing on the planner for that day.</span>
      ) : (
        /* The rows WRAP, and the list scrolls past eight — `truncate` here
           cut every job name off with three dots on the wall ("the tomorrow
           widget, the text is getting cut off"). A widget scrolls, it does
           not clip. */
        <div className="grid gap-2 h-full overflow-y-auto widget-scroll content-start">
          {rows.map(r => {
            const who = personOf(r.person, c.contractors, users);
            const names = r.entries.map(e => (e.jobId
              ? c.jobs.find(j => j.id === e.jobId)?.displayName ?? 'a job'
              : e.text)).filter(Boolean);
            return (
              <div key={r.person} className="flex items-start gap-2.5 min-w-0">
                <span className="w-3 h-3 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: who.color }} />
                <span className="text-[15px] font-bold text-slate-700 flex-shrink-0 break-words leading-tight"
                  style={{ maxWidth: '42%' }}>
                  {who.name}
                </span>
                <span className="text-[14px] text-slate-500 flex-1 min-w-0 break-words leading-tight">
                  {names.join(' · ')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export const TV_WIDGETS: WidgetDef[] = [
  // ── Workers' load — one worker, or everybody as bars ──────────────────────
  {
    id: 'tv-load', rank: 11, name: "Workers' load", category: 'live', icon: HardHat, w: 360, h: 240,
    blurb: 'How much everybody is carrying right now — a bar each, or one worker\'s own count.',
    render: (el, c) => {
      // The old "Contractor" widget folded in here: its single-worker card is
      // this widget's `show: one`, so one worker and the whole crew are one
      // widget with a switch rather than two widgets.
      if (String(d(el).show || 'all') === 'one') {
        const con = c.contractors.find(x => x.id === d(el).contractorId) ?? c.contractors[0];
        if (!con) return <Card label="Worker"><span className="text-[13px] text-slate-400">No workers yet.</span></Card>;
        const mine = c.assignments.filter(a => a.contractorId === con.id && !a.completedAt);
        const today = todayIso();
        const late = mine.filter(a => a.dueDate && a.dueDate < today).length;
        return (
          <Card label={con.name} tone={late ? '#b4342a' : personColor(con.name, con.color)}>
            <Figure value={mine.length} tone={late ? '#b4342a' : '#0f172a'}
              sub={late ? `open · ${late} late` : 'open'} />
          </Card>
        );
      }
      const rows = c.contractors.filter(x => x.active).map(x => ({
        x, open: c.assignments.filter(a => a.contractorId === x.id && !a.completedAt).length,
      })).sort((a, b) => b.open - a.open);
      const top = Math.max(1, ...rows.map(r => r.open));
      return (
        <Card label="Carrying now">
          <div className="h-full overflow-hidden grid gap-2 content-start">
            {rows.slice(0, 8).map(({ x, open }) => (
              <div key={x.id}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: personColor(x.name, x.color) }} />
                  <span className="text-[13px] text-slate-600 flex-1 truncate">{x.name}</span>
                  <b className="text-[13px] tabular-nums text-slate-700">{open}</b>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${(open / top) * 100}%`, backgroundColor: personColor(x.name, x.color) }} />
                </div>
              </div>
            ))}
            {rows.length === 0 && <span className="text-[13px] text-slate-400">No contractors yet.</span>}
          </div>
        </Card>
      );
    },
  },

  // ── Finished — today's names, or the week as bars ─────────────────────────
  {
    id: 'tv-done-today', rank: 15, name: 'Finished', category: 'live', icon: CheckCircle2,
    w: 360, h: 220,
    blurb: 'What was finished — today with who finished it, or the whole week as a bar per day.',
    render: (el, c) => {
      // "Finished this week" folded in here as `period: week`.
      if (String(d(el).period || 'today') === 'week') {
        const start = new Date();
        start.setDate(start.getDate() - start.getDay());
        const days = Array.from({ length: 7 }, (_, i) => {
          const dt = new Date(start); dt.setDate(dt.getDate() + i);
          const key = iso(dt);
          return {
            key,
            label: dt.toLocaleDateString(undefined, { weekday: 'narrow' }),
            n: c.assignments.filter(a => a.completedAt?.startsWith(key)).length,
            today: key === todayIso(),
          };
        });
        const top = Math.max(1, ...days.map(x => x.n));
        return (
          <Card label="Finished this week">
            <div className="h-full flex items-end gap-2">
              {days.map(x => (
                <div key={x.key} className="flex-1 flex flex-col items-center gap-1 h-full">
                  <span className="flex-1 w-full flex items-end">
                    <span className="w-full rounded-t-md" title={`${x.n}`}
                      style={{ height: `${(x.n / top) * 100}%`, minHeight: 3,
                               backgroundColor: x.today ? '#12735a' : '#4aa8d8' }} />
                  </span>
                  <span className="text-[11px] text-slate-400">{x.label}</span>
                </div>
              ))}
            </div>
          </Card>
        );
      }
      const today = todayIso();
      const done = c.assignments.filter(a => a.completedAt?.startsWith(today));
      return (
        <Card label="Done today" tone="#12735a">
          <div className="h-full flex flex-col">
            <Figure value={done.length} tone="#12735a" />
            <div className="grid gap-1 mt-1 overflow-hidden">
              {done.slice(0, 4).map(a => {
                const who = c.contractors.find(x => x.id === a.contractorId);
                const job = c.jobs.find(j => j.id === a.apartmentId);
                return (
                  <span key={a.id} className="text-[13px] text-slate-500 truncate">
                    {job?.displayName ?? 'Job'} — {who?.name ?? 'somebody'}
                  </span>
                );
              })}
            </div>
          </div>
        </Card>
      );
    },
  },
];

// ── The bodies the merged board widgets borrow ──────────────────────────────

export function WorkspaceCard({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const projects = useStore(st => st.projects);
  const currentProjectId = useStore(st => st.currentProjectId);
  const isRtl = useStore(st => st.mainUiStrings.isRtl);
  const pid = String(d(el).projectId || '');
  const chosen = (!pid || pid === 'this') ? currentProjectId : pid;
  const live = chosen === currentProjectId;
  // Re-read when a missing workspace snapshot arrives from the cloud.
  const snapTick = useStore(st => st.snapshotTick);

  const snap = useMemo(
    () => (live ? { apartments: c.jobs, stages: c.stages } : loadProjectSnapshot(chosen)),
    [live, chosen, c.jobs, c.stages, snapTick],
  );
  const cached = useMemo(() => loadAllProjectsTaskData().find(x => x.projectId === chosen), [chosen, snapTick]);

  const units = snap.apartments.filter(isCountableApartment);
  const liveIds = new Set(units.map(u => u.id));
  const tasks = (live ? c.assignments : (cached?.assignments ?? [])).filter(a => liveIds.has(a.apartmentId));
  const today = todayIso();
  const started = units.filter(u => u.currentStageId).length;
  const pct = units.length ? Math.round((started / units.length) * 100) : 0;
  const tone = projectColor(projects, chosen);
  const name = projects.find(p => p.id === chosen)?.name ?? chosen;

  const figures: [number, string, string][] = [
    [tasks.filter(a => !a.completedAt).length, 'open', '#334155'],
    [tasks.filter(a => !a.completedAt && a.dueDate && a.dueDate < today).length, 'late', '#b4342a'],
    [tasks.filter(a => a.completedAt?.startsWith(today)).length, 'today', '#12735a'],
  ];

  return (
    <div className="w-full h-full flex flex-col px-3.5 py-3 overflow-auto widget-scroll"
      style={{ borderTop: `4px solid ${tone}` }}>
      <div className="flex items-center gap-2 mb-2">
        <b className="text-[15px] tracking-wide" style={{ color: tone }}>{name.toUpperCase()}</b>
        <span className="flex-1" />
        <span className="text-[12px] text-slate-400 tabular-nums">{units.length} units</span>
      </div>

      <div className="flex items-end gap-5 mb-2.5">
        <span>
          <span className="block font-black leading-none tabular-nums" style={{ fontSize: 40, color: tone }}>
            {pct}%
          </span>
          <span className="text-[12px] text-slate-400">started</span>
        </span>
        {figures.map(([n, label, colour]) => (
          <span key={label}>
            <span className="block font-black leading-none tabular-nums" style={{ fontSize: 24, color: colour }}>
              {n}
            </span>
            <span className="text-[12px] text-slate-400">{label}</span>
          </span>
        ))}
      </div>

      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: tone }} />
      </div>

      {/* Every unit as a square, in its stage colour. */}
      <div className="flex-1 min-h-0 mt-2.5 grid gap-[3px] content-start overflow-auto widget-scroll"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(14px, 1fr))' }}>
        {units.slice(0, 200).map(u => {
          const st = snap.stages.find(s => s.id === u.currentStageId);
          return (
            <span key={u.id} className="rounded-[3px]"
              style={{ backgroundColor: st?.color ?? '#e2e8f0', aspectRatio: '1' }}
              title={`${u.apartmentNumber || u.displayName || ''} · ${
                st ? getStageName(st, !!isRtl) : 'Not started'}`} />
          );
        })}
      </div>
    </div>
  );
}

export function LatestPhoto({ c }: { c: WidgetCtx }) {
  const shots = useMemo(() => [...c.photos]
    .filter(p => p.storageUrl || p.driveUrl || p.dataUrl)
    .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''))
    .slice(0, 12), [c.photos]);
  const [at, setAt] = useState(0);

  // A wall photo that never changes stops being looked at. Twenty seconds is
  // long enough to take one in and short enough that the wall stays alive.
  useEffect(() => {
    if (shots.length < 2) return;
    const t = setInterval(() => setAt(i => (i + 1) % shots.length), 20_000);
    return () => clearInterval(t);
  }, [shots.length]);

  const p = shots[Math.min(at, Math.max(0, shots.length - 1))];
  const src = p?.storageUrl || p?.driveUrl || p?.dataUrl;
  const job = p ? c.jobs.find(j =>
    c.assignments.some(a => a.id === p.assignmentId && a.apartmentId === j.id)) : undefined;

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-100">
      {src
        ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
        : <span className="absolute inset-0 flex items-center justify-center text-[13px] text-slate-400">
            No photos yet
          </span>}
      {job && (
        <span className="absolute left-0 right-0 bottom-0 px-3 py-2 text-[14px] font-bold text-white"
          style={{ background: 'linear-gradient(0deg, rgba(15,23,42,.75), transparent)' }}>
          {job.displayName}
        </span>
      )}
    </div>
  );
}

/**
 * The photo wall, grouped BY JOB.
 *
 * A flat grid of nine pictures from five different jobs tells you nothing —
 * you cannot tell which site any of them is. Grouped, each row is a job name
 * and the pictures that came in for it, which is how somebody looking at the
 * wall actually reads them.
 */
export function PhotoWall({ c }: { c: WidgetCtx }) {
  const groups = useMemo(() => {
    const byJob = new Map<string, { job: Apartment; shots: typeof c.photos }>();
    const sorted = [...c.photos]
      .filter(p => p.storageUrl || p.driveUrl || p.dataUrl)
      .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
    for (const p of sorted) {
      const a = c.assignments.find(x => x.id === p.assignmentId);
      const job = a ? c.jobs.find(j => j.id === a.apartmentId) : undefined;
      if (!job) continue;
      if (!byJob.has(job.id)) byJob.set(job.id, { job, shots: [] });
      const g = byJob.get(job.id)!;
      if (g.shots.length < 6) g.shots.push(p);
    }
    return [...byJob.values()].slice(0, 4);
  }, [c.photos, c.assignments, c.jobs]);

  return (
    <Card label="From site">
      {groups.length === 0 ? (
        <span className="text-[13px] text-slate-400">No photos yet.</span>
      ) : (
        <div className="h-full overflow-hidden grid gap-2.5 content-start">
          {groups.map(({ job, shots }) => (
            <div key={job.id}>
              <div className="text-[13px] font-bold text-slate-600 truncate mb-1">
                {job.displayName || 'Job'}
                <span className="ml-2 text-[11px] font-medium text-slate-400">{shots.length}</span>
              </div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))' }}>
                {shots.map(p => (
                  <span key={p.id} className="rounded-md overflow-hidden bg-slate-100"
                    style={{ aspectRatio: '1.3' }}>
                    <img src={p.storageUrl || p.driveUrl || p.dataUrl} alt=""
                      className="w-full h-full object-cover" />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
 * The month as a heat map: each day shaded by how much is due on it —
 * every day a multi-day task covers, plus the weekly notebook's own entries.
 * The merged Calendar widget draws this for its `shade` look.
 */
export function MonthHeat({ c }: { c: WidgetCtx }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const counts = new Map<number, number>();
  const bump = (isoDay: string | undefined) => {
    if (!isoDay) return;
    const dt = new Date(`${isoDay}T00:00:00`);
    if (Number.isNaN(dt.getTime())
      || dt.getMonth() !== now.getMonth() || dt.getFullYear() !== now.getFullYear()) return;
    counts.set(dt.getDate(), (counts.get(dt.getDate()) ?? 0) + 1);
  };
  // EVERY day an open task covers — a three-day task shades three days,
  // not just its final dueDate.
  for (const a of c.assignments) {
    if (a.completedAt) continue;
    for (const day of daysOf(a)) bump(day);
  }
  /**
   * The NOTEBOOK too — this heat map used to know nothing about the
   * weekly planner, which is where the actual booking lives, so it read
   * as stale. Every planned entry counts on its day; entries that stand
   * for a TASK are skipped, because their task's days were counted above
   * and one piece of work must not shade twice. Projections point at the
   * main notebook's element and would double it — skipped.
   */
  const els = c.boardElements ?? useStore.getState().canvasElements;
  for (const el of els) {
    if (el.type !== 'widget' || (el.widget !== 'rota' && el.widget !== 'week-planner')) continue;
    if ((el.data as { role?: string } | undefined)?.role === 'projection') continue;
    const cells = (el.data as { cells?: Record<string, { taskId?: string }[]> } | undefined)?.cells ?? {};
    for (const [key, entries] of Object.entries(cells)) {
      const day = String(key).split('|')[1];
      if (!Array.isArray(entries)) continue;
      for (const en of entries) if (!en?.taskId) bump(day);
    }
  }
  const busiest = Math.max(1, ...counts.values());
  /**
   * The shade is a RAMP OF THE COMPANY BLUE — a light accent tint walking
   * into the navy — instead of the old translucent amber, whose quarter-
   * strength orange over white read as dirty ("the colors are just ugly",
   * the owner). Solid computed colors, so every step of the ramp is a
   * deliberate shade rather than an alpha accident.
   */
  const shade = (t: number) => {
    const a = [227, 242, 251], b = [30, 58, 95];
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  };
  const wd = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 7, 2 + i).toLocaleDateString(undefined, { weekday: 'narrow' }));
  return (
    <Card label={first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>
      <div className="grid grid-cols-7 gap-1 h-full content-start">
        {wd.map((w, i) => (
          <span key={`w${i}`} className="flex items-center justify-center font-bold"
            style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '.04em' }}>{w}</span>
        ))}
        {Array.from({ length: first.getDay() }, (_, i) => <span key={`x${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const n = counts.get(i + 1) ?? 0;
          const t = n ? 0.14 + 0.86 * (n / busiest) : 0;
          const today = i + 1 === now.getDate();
          return (
            <span key={i} className="rounded-md flex items-center justify-center tabular-nums"
              style={{
                aspectRatio: '1', fontSize: 12,
                backgroundColor: n ? shade(t) : '#fbfcfe',
                boxShadow: n ? undefined : 'inset 0 0 0 1px #eef2f7',
                color: n && t > 0.5 ? '#fff' : n ? '#1e3a5f' : '#94a3b8',
                outline: today ? '2px solid #4aa8d8' : undefined,
                outlineOffset: today ? 1 : undefined,
                fontWeight: today ? 800 : n ? 700 : 500,
              }}>{i + 1}</span>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * The wall's own time, in a chosen TIMEZONE. A TV panel is the machine most
 * likely to be sitting on the wrong country (a fresh browser often thinks it
 * is in UTC), and a widget can only show what the device gives it — so the
 * clock is pinned to a zone (Israel by default) and reads right whatever the
 * panel believes. A device whose CLOCK is minutes off still needs its own
 * clock set: no page can overrule that.
 */
export function tzDate(now: Date, tz: string): Date {
  if (!tz) return now;
  try { return new Date(now.toLocaleString('en-US', { timeZone: tz })); } catch { return now; }
}

/**
 * The clock with both calendars. The merged Wall clock draws this whenever
 * either extra is switched on; the flags hide the lines that were not asked
 * for, so "Hebrew date without the holiday" is a real choice.
 */
export function WallClock({ hebrew = true, holiday = true, tz = 'Asia/Jerusalem' }: {
  hebrew?: boolean; holiday?: boolean; tz?: string;
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);
  const shown = tzDate(now, tz);

  // The next thing worth knowing about, up to a month out — counted from the
  // ZONE's own day, or the holiday line flips a day early/late near midnight.
  const next = useMemo(() => {
    if (!holiday) return null;
    for (let i = 0; i < 40; i++) {
      const d2 = new Date(shown); d2.setDate(d2.getDate() + i);
      const hits = holidaysOn(d2, { jewish: true, israeli: true });
      if (hits.length) return { name: hits[0].name, days: i };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, holiday, tz]);

  return (
    // Centred when it fits, scrollable when it does not — squeezed short, the
    // holiday line was falling off the bottom with nothing to reach it by.
    <div className="w-full h-full flex flex-col justify-center px-3.5 py-3 overflow-auto widget-scroll">
      <div className="font-black leading-none tabular-nums text-slate-800 flex-shrink-0" style={{ fontSize: 52 }}>
        {shown.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="text-[15px] text-slate-500 mt-1.5">
        {shown.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
      {hebrew && <div className="text-[14px] text-slate-400">{hebrewLabel(shown)}</div>}
      {next && (
        <div className="text-[13px] mt-1.5" style={{ color: '#7c3aed' }}>
          {next.days === 0 ? next.name : `${next.name} in ${next.days} day${next.days === 1 ? '' : 's'}`}
        </div>
      )}
    </div>
  );
}

/**
 * Which widgets may go on the wall screen.
 *
 * The wall ones, plus the board pieces that genuinely belong on a wall —
 * and every RETIRED id, because a wall somebody set up before the dedupe
 * still carries the old names and must keep drawing. A keypad or a note pad
 * makes no sense on a screen nobody touches.
 */
export const TV_ALLOWED = new Set([
  ...TV_WIDGETS.map(w => w.id),
  // The survivors of the TV merges — the same content the wall always had.
  'overdue-list', 'recent-jobs', 'activity-feed', 'recent-photos', 'calendar-mini',
  'stage-legend', 'due-today', 'team-today', 'count-by-stage', 'project-glance',
  'nobody-booked', 'no-plan',
  'w-title', 'banner', 'quote', 'divider', 'legend', 'photo',
  'w-countdown', 'w-stopwatch', 'clock',
  'board-mini', 'project-mini', 'rota', 'goals', 'search-tile', 'file-tray',
  // Retired ids (widgetAliases.ts) — hardcoded rather than imported, because
  // importing the alias table from here would close a runtime cycle.
  'tv-workspace', 'tv-out-today', 'tv-late', 'tv-week-done', 'tv-tomorrow',
  'tv-stage-spread', 'tv-month', 'tv-photo', 'tv-photo-wall', 'tv-feed',
  'tv-waiting', 'tv-drive', 'tv-new', 'tv-clock', 'week-ahead', 'contractor-load',
]);
