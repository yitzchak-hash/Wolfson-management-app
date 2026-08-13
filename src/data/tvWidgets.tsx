import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, AlertTriangle, CalendarCheck, CalendarDays, BarChart3, Camera, Images,
  Activity, HardHat, Inbox, HardDrive, Sparkles, CheckCircle2, Clock3, Building,
} from 'lucide-react';
import {
  Apartment, CanvasElement, Stage, isCountableApartment, getStageName, personColor,
  projectColor, isCountableApartment as counts,
} from '../types';
import { WidgetCtx, WidgetDef } from './widgets';
import { useStore, loadAllProjectsTaskData, loadProjectSnapshot } from './store';
import { hebrewLabel, holidaysOn } from './hebrewDates';
import { PlannerData, personOf, iso } from '../components/board/PlannerWidget';
import { describeActivity } from './activityText';
import { ActivitySentence } from '../components/ui/ActivitySentence';

/**
 * The widgets built for the wall.
 *
 * Every one reads data the app already holds — no new field, no new collection,
 * no backend call. They are ordinary entries in the same registry the board
 * uses, so each inherits the settings pencil, the outline, the colour, the
 * scaling and the syncing without a line for any of it.
 *
 * What makes them WALL widgets rather than board ones is only how they are
 * drawn: big figures, few words, and nothing that needs a pointer. A keypad or
 * a note pad makes no sense on a screen nobody touches, which is what
 * TV_WIDGETS below is for.
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
      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">{children}</div>
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

function WhoIsOut({ c, dayIso, label, tone }: {
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
        <div className="grid gap-2 h-full overflow-hidden content-start">
          {rows.slice(0, 8).map(r => {
            const who = personOf(r.person, c.contractors, users);
            const names = r.entries.map(e => (e.jobId
              ? c.jobs.find(j => j.id === e.jobId)?.displayName ?? 'a job'
              : e.text)).filter(Boolean);
            return (
              <div key={r.person} className="flex items-center gap-2.5 min-w-0">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: who.color }} />
                <span className="text-[15px] font-bold text-slate-700 w-[120px] truncate flex-shrink-0">
                  {who.name}
                </span>
                <span className="text-[14px] text-slate-500 truncate flex-1">{names.join(' · ')}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export const TV_WIDGETS: WidgetDef[] = [
  // ── 1 · a workspace, whole ────────────────────────────────────────────────
  {
    id: 'tv-workspace', rank: 1, name: 'Workspace card', category: 'live', icon: Building,
    w: 420, h: 260,
    blurb: 'One workspace: units, how far along, open, late, done today — and every unit as a '
      + 'coloured square so the shape of the job reads across the room.',
    data: {},
    render: (el, c) => <WorkspaceCard el={el} c={c} />,
  },

  // ── 2 · who is out today ──────────────────────────────────────────────────
  {
    id: 'tv-out-today', rank: 2, name: 'Out today', category: 'live', icon: Users, w: 400, h: 230,
    blurb: 'Who is on which job today, from the planner, in their own colour.',
    render: (_el, c) => <WhoIsOut c={c} dayIso={todayIso()} label="Out today" />,
  },

  // ── 3 · running late ──────────────────────────────────────────────────────
  {
    id: 'tv-late', rank: 3, name: 'Running late', category: 'live', icon: AlertTriangle,
    w: 300, h: 180,
    blurb: 'One big number, and the worst one by name.',
    render: (_el, c) => {
      const today = todayIso();
      const late = c.assignments
        .filter(a => !a.completedAt && a.dueDate && a.dueDate < today)
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
      const worst = late[0];
      const job = worst ? c.jobs.find(j => j.id === worst.apartmentId) : undefined;
      const days = worst
        ? Math.floor((Date.now() - new Date(worst.dueDate!).getTime()) / 86_400_000)
        : 0;
      return (
        <Card label="Running late" tone={late.length ? '#b4342a' : '#12735a'}>
          <Figure value={late.length} tone={late.length ? '#b4342a' : '#12735a'}
            sub={worst ? `worst is ${days}d · ${job?.displayName ?? 'a job'}` : 'nothing overdue'} />
        </Card>
      );
    },
  },

  // ── 4 · finished this week ────────────────────────────────────────────────
  {
    id: 'tv-week-done', rank: 4, name: 'Finished this week', category: 'live', icon: BarChart3,
    w: 340, h: 200,
    blurb: 'A bar for each day of this week, today picked out.',
    render: (_el, c) => {
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
    },
  },

  // ── 5 · tomorrow ──────────────────────────────────────────────────────────
  {
    id: 'tv-tomorrow', rank: 5, name: 'Tomorrow', category: 'live', icon: CalendarCheck,
    w: 400, h: 230,
    blurb: 'The same as Out today, a day ahead — so the evening shift can see it.',
    render: (_el, c) => {
      const t = new Date(); t.setDate(t.getDate() + 1);
      return <WhoIsOut c={c} dayIso={iso(t)} label="Tomorrow" tone="#7c3aed" />;
    },
  },

  // ── 6 · stage spread ──────────────────────────────────────────────────────
  {
    id: 'tv-stage-spread', rank: 6, name: 'Stage spread', category: 'live', icon: BarChart3,
    w: 380, h: 230,
    blurb: 'How the workspace is spread across its stages, as one stacked bar and a key.',
    render: (_el, c) => {
      const units = c.jobs.filter(isCountableApartment);
      const rows = c.stages.filter(s => s.active !== false).map(s => ({
        s, n: units.filter(u => u.currentStageId === s.id).length,
      }));
      const none = units.filter(u => !u.currentStageId).length;
      const total = Math.max(1, units.length);
      return (
        <Card label="Where everything is">
          <div className="h-full flex flex-col gap-3">
            <div className="h-5 rounded-full overflow-hidden flex flex-shrink-0" style={{ backgroundColor: '#eef2f7' }}>
              {rows.map(({ s, n }) => n > 0 && (
                <span key={s.id} title={`${s.name}: ${n}`}
                  style={{ width: `${(n / total) * 100}%`, backgroundColor: s.color }} />
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-auto scrollbar-thin grid gap-1.5 content-start">
              {rows.filter(r => r.n > 0).map(({ s, n }) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-[13px] text-slate-500 flex-1 truncate">{s.name}</span>
                  <b className="text-[14px] tabular-nums text-slate-700">{n}</b>
                </div>
              ))}
              {none > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300 flex-shrink-0" />
                  <span className="text-[13px] text-slate-400 flex-1">Not started</span>
                  <b className="text-[14px] tabular-nums text-slate-500">{none}</b>
                </div>
              )}
            </div>
          </div>
        </Card>
      );
    },
  },

  // ── 7 · this month ────────────────────────────────────────────────────────
  {
    id: 'tv-month', rank: 7, name: 'This month', category: 'live', icon: CalendarDays, w: 320, h: 250,
    blurb: 'The month as a grid, each day shaded by how much is due on it.',
    render: (_el, c) => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const counts = new Map<number, number>();
      for (const a of c.assignments) {
        if (!a.dueDate || a.completedAt) continue;
        const dt = new Date(`${a.dueDate}T00:00:00`);
        if (dt.getMonth() !== now.getMonth() || dt.getFullYear() !== now.getFullYear()) continue;
        counts.set(dt.getDate(), (counts.get(dt.getDate()) ?? 0) + 1);
      }
      const busiest = Math.max(1, ...counts.values());
      return (
        <Card label={first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>
          <div className="grid grid-cols-7 gap-1 h-full content-start">
            {Array.from({ length: first.getDay() }, (_, i) => <span key={`x${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const n = counts.get(i + 1) ?? 0;
              const heat = n ? 0.25 + 0.75 * (n / busiest) : 0;
              const today = i + 1 === now.getDate();
              return (
                <span key={i} className="rounded-md flex items-center justify-center tabular-nums"
                  style={{
                    aspectRatio: '1', fontSize: 12,
                    backgroundColor: n ? `rgba(217,119,6,${heat.toFixed(2)})` : '#f1f5f9',
                    color: n && heat > 0.55 ? '#fff' : '#64748b',
                    outline: today ? '2px solid #4aa8d8' : undefined,
                    fontWeight: today ? 800 : 500,
                  }}>{i + 1}</span>
              );
            })}
          </div>
        </Card>
      );
    },
  },

  // ── 8 · the newest photo, large ───────────────────────────────────────────
  {
    id: 'tv-photo', rank: 8, name: 'Latest from site', category: 'live', icon: Camera, w: 400, h: 300,
    blurb: 'The newest picture back from site, filling the card, changing every twenty seconds.',
    render: (_el, c) => <LatestPhoto c={c} />,
  },

  // ── 9 · a wall of photos, grouped by job ──────────────────────────────────
  {
    id: 'tv-photo-wall', rank: 9, name: 'Photo wall', category: 'live', icon: Images, w: 460, h: 320,
    blurb: 'The recent pictures grouped under the job they came from, newest job first.',
    render: (_el, c) => <PhotoWall c={c} />,
  },

  // ── 10 · what just happened ───────────────────────────────────────────────
  {
    id: 'tv-feed', rank: 10, name: 'Just happened', category: 'live', icon: Activity, w: 400, h: 250,
    blurb: 'The last few changes anybody made, newest on top.',
    render: (_el, c) => (
      <Card label="Just happened">
        <div className="h-full overflow-hidden grid gap-2 content-start">
          {c.logs.slice(0, 7).map(l => (
            <div key={l.id} className="flex items-baseline gap-2 min-w-0">
              <span className="text-[13px] font-bold text-slate-700 w-[86px] truncate flex-shrink-0">
                {l.userName}
              </span>
              {/* A sentence, not a field name. The wall was printing
                  `currentStageId`, which tells a room nothing. This is the SAME
                  describer the board's own feed uses — one wording, so the two
                  screens can never narrate the same event differently. */}
              <ActivitySentence
                className="text-[13px] text-slate-500 truncate flex-1"
                parts={describeActivity(l, c.jobs).parts}
                onOpen={c.openJob}
              />
              <span className="text-[11px] text-slate-300 tabular-nums flex-shrink-0">
                {new Date(l.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          {c.logs.length === 0 && <span className="text-[13px] text-slate-400">Nothing yet today.</span>}
        </div>
      </Card>
    ),
  },

  // ── 11 · contractor load ──────────────────────────────────────────────────
  {
    id: 'tv-load', rank: 11, name: 'Contractor load', category: 'live', icon: HardHat, w: 360, h: 240,
    blurb: 'A bar each: how much everybody is carrying right now.',
    render: (_el, c) => {
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

  // ── 12 · waiting on us ────────────────────────────────────────────────────
  {
    id: 'tv-waiting', rank: 12, name: 'Waiting on us', category: 'live', icon: Inbox, w: 340, h: 220,
    blurb: 'Jobs with no stage and no task — the ones nobody has picked up.',
    render: (_el, c) => {
      const idle = c.jobs.filter(j => isCountableApartment(j)
        && !j.currentStageId
        && !c.assignments.some(a => a.apartmentId === j.id && !a.completedAt));
      return (
        <Card label="Waiting on us" tone={idle.length ? '#b8650a' : '#12735a'}>
          <div className="h-full flex flex-col">
            <Figure value={idle.length} tone={idle.length ? '#b8650a' : '#12735a'} />
            <div className="grid gap-1 mt-1 overflow-hidden">
              {idle.slice(0, 4).map(j => (
                <span key={j.id} className="text-[13px] text-slate-500 truncate">
                  {j.displayName || 'Job'}
                </span>
              ))}
            </div>
          </div>
        </Card>
      );
    },
  },

  // ── 13 · Drive health ─────────────────────────────────────────────────────
  {
    id: 'tv-drive', rank: 13, name: 'Drive health', category: 'live', icon: HardDrive, w: 320, h: 200,
    blurb: 'How many jobs have a folder, a plan, or neither.',
    render: (_el, c) => {
      const units = c.jobs.filter(isCountableApartment);
      const ready = units.filter(j => j.driveLink?.trim() && j.plansPdfLink?.trim()).length;
      const part = units.filter(j => j.driveLink?.trim() && !j.plansPdfLink?.trim()).length;
      const none = units.length - ready - part;
      const bar = [
        { n: ready, c: '#16a34a', l: 'folder and plan' },
        { n: part, c: '#d97706', l: 'folder only' },
        { n: none, c: '#cbd5e1', l: 'neither' },
      ];
      const total = Math.max(1, units.length);
      return (
        <Card label="Drive">
          <div className="h-full flex flex-col justify-center gap-3">
            <div className="h-5 rounded-full overflow-hidden flex" style={{ backgroundColor: '#eef2f7' }}>
              {bar.map(b => b.n > 0 && (
                <span key={b.l} title={`${b.l}: ${b.n}`}
                  style={{ width: `${(b.n / total) * 100}%`, backgroundColor: b.c }} />
              ))}
            </div>
            <div className="grid gap-1">
              {bar.map(b => (
                <div key={b.l} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: b.c }} />
                  <span className="text-[13px] text-slate-500 flex-1">{b.l}</span>
                  <b className="text-[13px] tabular-nums text-slate-700">{b.n}</b>
                </div>
              ))}
            </div>
          </div>
        </Card>
      );
    },
  },

  // ── 14 · new this week ────────────────────────────────────────────────────
  {
    id: 'tv-new', rank: 14, name: 'New this week', category: 'live', icon: Sparkles, w: 320, h: 220,
    blurb: 'Jobs added in the last seven days.',
    render: (_el, c) => {
      const cut = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const fresh = c.jobs.filter(j => (j.createdAt ?? '') > cut)
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      return (
        <Card label="New this week" tone="#7c3aed">
          <div className="h-full flex flex-col">
            <Figure value={fresh.length} tone="#7c3aed" />
            <div className="grid gap-1 mt-1 overflow-hidden">
              {fresh.slice(0, 4).map(j => (
                <span key={j.id} className="text-[13px] text-slate-500 truncate">
                  {j.displayName || 'Job'}
                </span>
              ))}
            </div>
          </div>
        </Card>
      );
    },
  },

  // ── 15 · done today ───────────────────────────────────────────────────────
  {
    id: 'tv-done-today', rank: 15, name: 'Done today', category: 'live', icon: CheckCircle2,
    w: 360, h: 220,
    blurb: 'What was finished today, and who finished it.',
    render: (_el, c) => {
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

  // ── 18 · the clock, with both calendars ───────────────────────────────────
  {
    id: 'tv-clock', rank: 16, name: 'Clock and date', category: 'live', icon: Clock3, w: 340, h: 200,
    blurb: 'The time, big, with the English and Hebrew date and the next holiday.',
    render: () => <WallClock />,
  },
];

// ── The pieces that need their own state ────────────────────────────────────

function WorkspaceCard({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const projects = useStore(st => st.projects);
  const currentProjectId = useStore(st => st.currentProjectId);
  const isRtl = useStore(st => st.mainUiStrings.isRtl);
  const chosen = String(d(el).projectId || '') || currentProjectId;
  const live = chosen === currentProjectId;

  const snap = useMemo(
    () => (live ? { apartments: c.jobs, stages: c.stages } : loadProjectSnapshot(chosen)),
    [live, chosen, c.jobs, c.stages],
  );
  const cached = useMemo(() => loadAllProjectsTaskData().find(x => x.projectId === chosen), [chosen]);

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
    <div className="w-full h-full flex flex-col px-3.5 py-3 overflow-auto scrollbar-thin"
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
      <div className="flex-1 min-h-0 mt-2.5 grid gap-[3px] content-start overflow-auto scrollbar-thin"
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

function LatestPhoto({ c }: { c: WidgetCtx }) {
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
function PhotoWall({ c }: { c: WidgetCtx }) {
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

function WallClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  // The next thing worth knowing about, up to a month out.
  const next = useMemo(() => {
    for (let i = 0; i < 40; i++) {
      const d2 = new Date(now); d2.setDate(d2.getDate() + i);
      const hits = holidaysOn(d2, { jewish: true, israeli: true });
      if (hits.length) return { name: hits[0].name, days: i };
    }
    return null;
  }, [now]);

  return (
    // Centred when it fits, scrollable when it does not — squeezed short, the
    // holiday line was falling off the bottom with nothing to reach it by.
    <div className="w-full h-full flex flex-col justify-center px-3.5 py-3 overflow-auto scrollbar-thin">
      <div className="font-black leading-none tabular-nums text-slate-800 flex-shrink-0" style={{ fontSize: 52 }}>
        {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="text-[15px] text-slate-500 mt-1.5">
        {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
      <div className="text-[14px] text-slate-400">{hebrewLabel(now)}</div>
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
 * a heading, a banner, a message, a countdown, a stopwatch, a photo, a note,
 * and the two miniatures. A keypad or a note pad makes no sense on a screen
 * nobody touches.
 */
export const TV_ALLOWED = new Set([
  ...TV_WIDGETS.map(w => w.id),
  'w-title', 'banner', 'quote', 'divider', 'legend', 'photo',
  'w-countdown', 'w-stopwatch', 'clock',
  'board-mini', 'project-mini', 'rota',
]);
