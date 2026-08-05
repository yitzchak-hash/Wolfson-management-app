import React, { useEffect, useState } from 'react';
import {
  Gauge, ListChecks, Hash, BarChart3, Table2, ShoppingCart, CalendarRange,
  Flag, User2, Link2, MapPin, Clock3, Megaphone, Image as ImageIcon,
  AlertTriangle, HardHat, CalendarDays, Camera, Briefcase, Activity,
  CircleDashed, Archive, StickyNote, Copy, Check, Filter, CalendarCheck,
  Calculator, Ruler, Target, Users, GitCommitHorizontal, TimerReset,
  ArrowRightLeft, ListFilter, Search, Sparkles, Timer, Sticker, Type,
} from 'lucide-react';
import {
  Apartment, CanvasElement, Stage, ContractorAssignment, Contractor,
  ContractorPhoto, ActivityLog, BIN_KINDS, BIN_META,
} from '../types';
import { describeActivity } from './activityText';
import { ClipArtNode, ART_KINDS, ArtKind } from '../components/board/BoardNodes';

/**
 * The widget store.
 *
 * A widget is an ordinary CanvasElement with `type: 'widget'`, a `widget` id
 * naming its kind, and a free-form `data` bag. That means every widget inherits
 * dragging, resizing, colouring, TV visibility, selection, Firestore sync and
 * backup for free — none of it is re-implemented per widget, and adding a new
 * one is a single entry in the registry below.
 *
 * Widgets fall into four groups, and the split matters:
 *
 *  - **Live** ones read the real data. They cannot go stale, and they are the
 *    reason the board is worth looking at rather than a whiteboard photo.
 *  - **Planning** ones hold their own state in `data`. Cheap, and they cover the
 *    things the office tracks that the app does not model.
 *  - **Reference** ones are shortcuts — a phone number, a link, an address.
 *  - **Decoration** makes the board readable at a distance.
 */

export type WidgetCategory = 'live' | 'plan' | 'ref' | 'visual';

export const CATEGORY_LABEL: Record<WidgetCategory, string> = {
  live: 'Live from your data',
  plan: 'Planning',
  ref: 'Shortcuts',
  visual: 'Look & feel',
};

export interface WidgetCtx {
  jobs: Apartment[];
  stages: Stage[];
  assignments: ContractorAssignment[];
  contractors: Contractor[];
  photos: ContractorPhoto[];
  logs: ActivityLog[];
  /** Writes back into the element — used by the interactive widgets. */
  update: (patch: Partial<CanvasElement>) => void;
  openJob: (id: string) => void;
  /** The TV passes this: widgets render, but nothing can be changed. */
  readOnly?: boolean;
}

export interface WidgetDef {
  id: string;
  name: string;
  category: WidgetCategory;
  blurb: string;
  icon: React.ElementType;
  w: number;
  h: number;
  /** Seed values for `data` when one is placed. */
  data?: Record<string, unknown>;
  render: (el: CanvasElement, ctx: WidgetCtx) => React.ReactNode;
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

const d = (el: CanvasElement) => (el.data ?? {}) as Record<string, any>;
const today = () => new Date().toISOString().slice(0, 10);

function Frame({ title, icon: Icon, children, tone }: {
  title: string; icon?: React.ElementType; children: React.ReactNode; tone?: string;
}) {
  return (
    <div className="w-full h-full flex flex-col px-2.5 py-2 overflow-hidden">
      <div className="flex items-center gap-1 mb-1 flex-shrink-0">
        {Icon && <Icon size={11} style={{ color: tone ?? '#94a3b8' }} />}
        <span className="text-[9.5px] font-extrabold tracking-wide truncate"
          style={{ color: tone ?? '#64748b' }}>{title.toUpperCase()}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

function Big({ value, sub, color }: { value: React.ReactNode; sub?: string; color?: string }) {
  return (
    <div className="h-full flex flex-col justify-center">
      <div className="font-black leading-none tabular-nums" style={{ fontSize: 34, color: color ?? '#0f172a' }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-gray-500 mt-1 truncate">{sub}</div>}
    </div>
  );
}

/** Editable single line that commits on blur. Inert when read-only. */
function Line({ value, onChange, placeholder, className, readOnly }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; readOnly?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  if (readOnly) return <span className={className}>{value || placeholder}</span>;
  return (
    <input
      data-no-drag data-el-action
      value={v}
      placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onBlur={() => onChange(v)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={`bg-transparent outline-none w-full ${className ?? ''}`}
    />
  );
}

const overdueOf = (a: ContractorAssignment) => !a.completedAt && !!a.dueDate && a.dueDate < today();

/**
 * The clip-art shelf.
 *
 * Every piece attaches: drag one onto a job or a note and it sticks there, with
 * a small impact as it lands, and from then on it travels with whatever it is
 * stuck to. Take it off from its right-click menu.
 */
const ART_PIECES: WidgetDef[] = ([
  ['pin',          'Push pin',    'Stick it through a job to mark it. Travels with the job from then on.',        56, 56],
  ['clip',         'Paperclip',   'Clips onto the edge of a job or a note, and stays clipped to it.',             56, 56],
  ['star',         'Star',        'Mark the one that matters. Sticks to whatever you drop it on.',                48, 48],
  ['tape',         'Tape',        'A strip of masking tape across a corner.',                                     72, 32],
  ['marker',       'Marker',      'A marker pen resting on the board.',                                           48, 48],
  ['document',     'Document',    'A paper stub for a drawing or a spec — link it and it opens.',                 52, 62],
  ['sticky-stack', 'Note pad',    'A pad of unused notes, for the corner of a section.',                          56, 56],
  ['arrow',        'Arrow mark',  'A drawn arrow. To CONNECT two jobs, right-click one and choose Draw an arrow.', 52, 52],
] as const).map(([art, name, blurb, w, h]) => ({
  id: `art-${art}`,
  name,
  category: 'visual' as const,
  icon: Sticker,
  w, h,
  blurb,
  data: { art },
  render: (el: CanvasElement, c: WidgetCtx) => <ArtInner el={el} update={c.update} readOnly={c.readOnly} />,
}));


// ─── Registry ────────────────────────────────────────────────────────────────

export const WIDGETS: WidgetDef[] = [
  // ── Live ──────────────────────────────────────────────────────────────────
  {
    id: 'kpi', name: 'Number', category: 'live', icon: Gauge, w: 175, h: 105,
    blurb: 'One live figure — open tasks, overdue, jobs on the board. Never stale.',
    data: { metric: 'openTasks' },
    render: (el, c) => {
      const m = d(el).metric ?? 'openTasks';
      const open = c.assignments.filter(a => !a.completedAt).length;
      const over = c.assignments.filter(overdueOf).length;
      const map: Record<string, [number, string, string]> = {
        openTasks: [open, 'open tasks', '#0f172a'],
        overdue: [over, 'overdue', '#dc2626'],
        jobs: [c.jobs.length, 'jobs on the board', '#0f172a'],
        dueToday: [c.assignments.filter(a => !a.completedAt && a.dueDate === today()).length, 'due today', '#d97706'],
      };
      const [n, label, colour] = map[m] ?? map.openTasks;
      return (
        <Frame title={d(el).title || 'Live count'} icon={Gauge}>
          <Big value={n} sub={label} color={colour} />
        </Frame>
      );
    },
  },
  {
    id: 'stage-legend', name: 'Stage legend', category: 'live', icon: BarChart3, w: 210, h: 175,
    blurb: 'Every stage with a live count, in the stage colours.',
    render: (_el, c) => (
      <Frame title="Stages" icon={BarChart3}>
        <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
          {c.stages.map(st => {
            const n = c.jobs.filter(j => j.currentStageId === st.id).length;
            return (
              <div key={st.id} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                <span className="text-[10.5px] text-gray-700 truncate flex-1">{st.name}</span>
                <span className="text-[10.5px] font-bold tabular-nums" style={{ color: st.color }}>{n}</span>
              </div>
            );
          })}
          {c.stages.length === 0 && <span className="text-[10px] text-gray-400">No stages yet</span>}
        </div>
      </Frame>
    ),
  },
  {
    id: 'overdue-list', name: 'Running late', category: 'live', icon: AlertTriangle, w: 235, h: 175,
    blurb: 'Every task past its date, worst first. The one list worth a wall.',
    render: (_el, c) => {
      const late = c.assignments.filter(overdueOf)
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
      return (
        <Frame title={`Running late · ${late.length}`} icon={AlertTriangle} tone="#dc2626">
          <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
            {late.length === 0 && <span className="text-[10.5px] text-emerald-600 font-semibold">Nothing late 🎉</span>}
            {late.slice(0, 12).map(a => {
              const job = c.jobs.find(j => j.id === a.apartmentId);
              const days = Math.floor((Date.now() - new Date(a.dueDate!).getTime()) / 86_400_000);
              return (
                <button key={a.id} data-no-drag data-el-action
                  onClick={() => job && c.openJob(job.id)}
                  className="flex items-center gap-1.5 text-left">
                  <span className="text-[9px] font-black text-red-600 tabular-nums w-7 flex-shrink-0">{days}d</span>
                  <span className="text-[10.5px] text-gray-700 truncate">{job?.displayName || a.taskDescription}</span>
                </button>
              );
            })}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'contractor-load', name: 'Contractor', category: 'live', icon: HardHat, w: 200, h: 110,
    blurb: 'One contractor and how much they already have open.',
    data: {},
    render: (el, c) => {
      const con = c.contractors.find(x => x.id === d(el).contractorId) ?? c.contractors[0];
      if (!con) return <Frame title="Contractor" icon={HardHat}><span className="text-[10px] text-gray-400">No contractors yet</span></Frame>;
      const mine = c.assignments.filter(a => a.contractorId === con.id && !a.completedAt);
      const late = mine.filter(overdueOf).length;
      return (
        <Frame title={con.name} icon={HardHat} tone={late ? '#dc2626' : undefined}>
          <div className="flex items-baseline gap-2 h-full">
            <span className="font-black tabular-nums" style={{ fontSize: 30 }}>{mine.length}</span>
            <span className="text-[10px] text-gray-500">open</span>
            {late > 0 && <span className="ml-auto text-[10px] font-bold text-red-600">{late} late</span>}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'week-ahead', name: 'Week ahead', category: 'live', icon: CalendarDays, w: 300, h: 130,
    blurb: 'The next seven days with what falls due on each.',
    render: (_el, c) => {
      const days = Array.from({ length: 7 }, (_, i) => {
        const dt = new Date(Date.now() + i * 86_400_000);
        const iso = dt.toISOString().slice(0, 10);
        return { iso, dt, n: c.assignments.filter(a => !a.completedAt && a.dueDate === iso).length };
      });
      return (
        <Frame title="Week ahead" icon={CalendarDays}>
          <div className="grid grid-cols-7 gap-1 h-full">
            {days.map(({ iso, dt, n }, i) => (
              <div key={iso} className="flex flex-col items-center justify-center rounded-lg"
                style={{ backgroundColor: i === 0 ? 'rgba(30,58,95,.08)' : '#f8fafc' }}>
                <span className="text-[8.5px] text-gray-400">{dt.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                <span className="text-[11px] font-bold text-gray-700">{dt.getDate()}</span>
                {n > 0 && <span className="text-[9px] font-black text-amber-600">{n}</span>}
              </div>
            ))}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'recent-photos', name: 'Latest photos', category: 'live', icon: Camera, w: 235, h: 150,
    blurb: 'The newest pictures back from site.',
    render: (_el, c) => {
      const recent = [...c.photos]
        .filter(p => p.storageUrl || p.driveUrl || p.dataUrl)
        .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''))
        .slice(0, 6);
      return (
        <Frame title="Latest from site" icon={Camera}>
          {recent.length === 0
            ? <span className="text-[10px] text-gray-400">No photos yet</span>
            : (
              <div className="grid grid-cols-3 gap-1 h-full">
                {recent.map(p => (
                  <div key={p.id} className="rounded-md overflow-hidden bg-slate-100">
                    <img src={p.storageUrl || p.driveUrl || p.dataUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
        </Frame>
      );
    },
  },
  {
    id: 'job-shortcut', name: 'Pinned job', category: 'live', icon: Briefcase, w: 200, h: 105,
    blurb: 'A live card for one job, so it can sit in two places at once.',
    data: {},
    render: (el, c) => {
      const job = c.jobs.find(j => j.id === d(el).jobId);
      if (!job) return <Frame title="Pinned job" icon={Briefcase}><span className="text-[10px] text-gray-400">Pick a job in the menu</span></Frame>;
      const st = c.stages.find(x => x.id === job.currentStageId);
      return (
        <button data-no-drag data-el-action onClick={() => c.openJob(job.id)} className="w-full h-full text-left">
          <Frame title="Pinned job" icon={Briefcase} tone={st?.color}>
            <div className="font-bold text-[13px] text-gray-900 truncate">{job.displayName || 'Job'}</div>
            {st && <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${st.color}22`, color: st.color }}>{st.name}</span>}
          </Frame>
        </button>
      );
    },
  },
  {
    id: 'activity-feed', name: 'What changed', category: 'live', icon: Activity, w: 235, h: 150,
    blurb: 'The last few edits and who made them.',
    render: (_el, c) => (
      <Frame title="What changed" icon={Activity}>
        <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
          {c.logs.slice(0, 8).map(l => {
            const { who, what, when } = describeActivity(l, c.jobs);
            return (
              <div key={l.id} className="text-[10px] leading-tight">
                <span className="text-gray-700"><b className="text-gray-900">{who}</b> {what}</span>
                <span className="text-gray-400"> · {when}</span>
              </div>
            );
          })}
          {c.logs.length === 0 && <span className="text-[10px] text-gray-400">Nothing yet</span>}
        </div>
      </Frame>
    ),
  },
  {
    id: 'progress-ring', name: 'Progress ring', category: 'live', icon: CircleDashed, w: 155, h: 155,
    blurb: 'How much of the board has reached a chosen stage.',
    data: {},
    render: (el, c) => {
      const target = d(el).stageId as string | undefined;
      const idx = c.stages.findIndex(s => s.id === target);
      const done = idx === -1
        ? c.jobs.filter(j => j.currentStageId).length
        : c.jobs.filter(j => {
            const i = c.stages.findIndex(s => s.id === j.currentStageId);
            return i >= idx;
          }).length;
      const pct = c.jobs.length ? Math.round((done / c.jobs.length) * 100) : 0;
      const colour = c.stages[idx]?.color ?? '#4aa8d8';
      const R = 34, C = 2 * Math.PI * R;
      return (
        <Frame title={c.stages[idx]?.name ?? 'Started'} icon={CircleDashed} tone={colour}>
          <div className="h-full flex items-center justify-center">
            <svg viewBox="0 0 90 90" style={{ width: 84, height: 84 }}>
              <circle cx="45" cy="45" r={R} fill="none" stroke="#e2e8f0" strokeWidth="9" />
              <circle cx="45" cy="45" r={R} fill="none" stroke={colour} strokeWidth="9" strokeLinecap="round"
                strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 45 45)" />
              <text x="45" y="51" textAnchor="middle" fontSize="19" fontWeight="900" fill="#0f172a">{pct}%</text>
            </svg>
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'bin-counter', name: 'Bin totals', category: 'live', icon: Archive, w: 200, h: 120,
    blurb: 'How much sits in Done, Ready, Archive and Trash.',
    render: (_el, c) => (
      <Frame title="In the bins" icon={Archive}>
        <div className="grid grid-cols-2 gap-1 h-full">
          {BIN_KINDS.map(k => (
            <div key={k} className="flex items-baseline gap-1">
              <span className="font-black tabular-nums text-[17px]" style={{ color: BIN_META[k].color }}>
                {c.jobs.filter(j => j.boardBin === k).length}
              </span>
              <span className="text-[9px] text-gray-500 truncate">{BIN_META[k].label}</span>
            </div>
          ))}
        </div>
      </Frame>
    ),
  },

  // ── Planning ──────────────────────────────────────────────────────────────
  {
    id: 'checklist', name: 'Checklist', category: 'plan', icon: ListChecks, w: 215, h: 185,
    blurb: 'Tickable list. For the things the app does not model.',
    data: { title: 'Checklist', items: [{ t: 'First item', done: false }] },
    render: (el, c) => {
      const items = (d(el).items ?? []) as { t: string; done: boolean }[];
      const set = (next: typeof items) => c.update({ data: { ...d(el), items: next } });
      const doneN = items.filter(i => i.done).length;
      return (
        <Frame title={`${d(el).title ?? 'Checklist'} · ${doneN}/${items.length}`} icon={ListChecks}>
          <div className="flex flex-col gap-0.5 h-full overflow-y-auto pr-1">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input type="checkbox" data-no-drag data-el-action checked={it.done} disabled={c.readOnly}
                  onChange={() => set(items.map((x, j) => j === i ? { ...x, done: !x.done } : x))}
                  className="w-3 h-3 rounded flex-shrink-0" />
                <Line value={it.t} readOnly={c.readOnly}
                  onChange={v => set(items.map((x, j) => j === i ? { ...x, t: v } : x))}
                  className={`text-[10.5px] ${it.done ? 'line-through text-gray-400' : 'text-gray-700'}`} />
              </div>
            ))}
            {!c.readOnly && (
              <button data-no-drag data-el-action onClick={() => set([...items, { t: '', done: false }])}
                className="text-[10px] text-gray-400 hover:text-gray-600 text-left mt-0.5">+ add</button>
            )}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'tally', name: 'Tally counter', category: 'plan', icon: Hash, w: 165, h: 115,
    blurb: 'Tap to count. Units delivered, floors done, whatever you are counting.',
    data: { title: 'Count', n: 0 },
    render: (el, c) => (
      <Frame title={d(el).title ?? 'Count'} icon={Hash}>
        <div className="h-full flex items-center gap-2">
          <span className="font-black tabular-nums" style={{ fontSize: 32 }}>{d(el).n ?? 0}</span>
          {!c.readOnly && (
            <div className="ml-auto flex flex-col gap-0.5">
              <button data-no-drag data-el-action onClick={() => c.update({ data: { ...d(el), n: (d(el).n ?? 0) + 1 } })}
                className="w-6 h-6 rounded-md bg-gray-100 text-gray-600 font-bold">+</button>
              <button data-no-drag data-el-action onClick={() => c.update({ data: { ...d(el), n: Math.max(0, (d(el).n ?? 0) - 1) } })}
                className="w-6 h-6 rounded-md bg-gray-100 text-gray-600 font-bold">−</button>
            </div>
          )}
        </div>
      </Frame>
    ),
  },
  {
    id: 'progress-bar', name: 'Progress bar', category: 'plan', icon: BarChart3, w: 215, h: 95,
    blurb: 'A percentage you set by hand, for anything the data cannot know.',
    data: { title: 'Progress', pct: 40 },
    render: (el, c) => (
      <Frame title={d(el).title ?? 'Progress'} icon={BarChart3}>
        <div className="h-full flex flex-col justify-center gap-1.5">
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${d(el).pct ?? 0}%`, backgroundColor: el.color || '#4aa8d8' }} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tabular-nums">{d(el).pct ?? 0}%</span>
            {!c.readOnly && (
              <input data-no-drag data-el-action type="range" min={0} max={100} value={d(el).pct ?? 0}
                onChange={e => c.update({ data: { ...d(el), pct: Number(e.target.value) } })}
                className="flex-1 h-1" />
            )}
          </div>
        </div>
      </Frame>
    ),
  },
  {
    id: 'table', name: 'Small table', category: 'plan', icon: Table2, w: 280, h: 165,
    blurb: 'A few rows and columns, edited in place.',
    data: { title: 'Table', rows: [['', ''], ['', '']] },
    render: (el, c) => {
      const rows = (d(el).rows ?? []) as string[][];
      const set = (r: number, col: number, v: string) =>
        c.update({ data: { ...d(el), rows: rows.map((row, i) => i === r ? row.map((cell, j) => j === col ? v : cell) : row) } });
      return (
        <Frame title={d(el).title ?? 'Table'} icon={Table2}>
          <div className="h-full overflow-auto">
            <table className="w-full">
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className="border border-gray-100 px-1 py-0.5">
                        <Line value={cell} readOnly={c.readOnly} onChange={v => set(i, j, v)}
                          className={`text-[10.5px] ${i === 0 ? 'font-bold text-gray-700' : 'text-gray-600'}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!c.readOnly && (
              <button data-no-drag data-el-action
                onClick={() => c.update({ data: { ...d(el), rows: [...rows, rows[0].map(() => '')] } })}
                className="text-[10px] text-gray-400 hover:text-gray-600 mt-1">+ row</button>
            )}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'order-list', name: 'Order tracker', category: 'plan', icon: ShoppingCart, w: 240, h: 185,
    blurb: 'Equipment on order: needed → ordered → arrived. Tap to advance.',
    data: { title: 'On order', items: [{ t: 'Condenser 5t', s: 0 }] },
    render: (el, c) => {
      const items = (d(el).items ?? []) as { t: string; s: number }[];
      const STATES = [['Needed', '#94a3b8'], ['Ordered', '#d97706'], ['Arrived', '#16a34a']] as const;
      const set = (next: typeof items) => c.update({ data: { ...d(el), items: next } });
      return (
        <Frame title={d(el).title ?? 'On order'} icon={ShoppingCart}>
          <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
            {items.map((it, i) => {
              const [label, colour] = STATES[Math.min(it.s, 2)];
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <button data-no-drag data-el-action disabled={c.readOnly}
                    onClick={() => set(items.map((x, j) => j === i ? { ...x, s: (x.s + 1) % 3 } : x))}
                    className="text-[8.5px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: `${colour}22`, color: colour }}>{label}</button>
                  <Line value={it.t} readOnly={c.readOnly}
                    onChange={v => set(items.map((x, j) => j === i ? { ...x, t: v } : x))}
                    className="text-[10.5px] text-gray-700" />
                </div>
              );
            })}
            {!c.readOnly && (
              <button data-no-drag data-el-action onClick={() => set([...items, { t: '', s: 0 }])}
                className="text-[10px] text-gray-400 hover:text-gray-600 text-left">+ add</button>
            )}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'week-planner', name: 'Week planner', category: 'plan', icon: CalendarRange, w: 400, h: 175,
    blurb: 'Monday to Sunday, free text under each. The wall version of a diary.',
    data: { cols: ['', '', '', '', '', '', ''] },
    render: (el, c) => {
      const cols = (d(el).cols ?? Array(7).fill('')) as string[];
      const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return (
        <Frame title="Week planner" icon={CalendarRange}>
          <div className="grid grid-cols-7 gap-1 h-full">
            {NAMES.map((n, i) => (
              <div key={n} className="flex flex-col rounded-lg bg-slate-50 p-1 min-h-0">
                <span className="text-[8.5px] font-bold text-gray-400">{n}</span>
                <textarea data-no-drag data-el-action readOnly={c.readOnly}
                  value={cols[i] ?? ''}
                  onChange={e => c.update({ data: { ...d(el), cols: cols.map((v, j) => j === i ? e.target.value : v) } })}
                  className="flex-1 min-h-0 bg-transparent outline-none resize-none text-[9.5px] text-gray-700" />
              </div>
            ))}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'milestones', name: 'Key dates', category: 'plan', icon: Flag, w: 225, h: 165,
    blurb: 'Several dated milestones in one node, counting down together.',
    data: { items: [{ t: 'Handover', on: '' }] },
    render: (el, c) => {
      const items = (d(el).items ?? []) as { t: string; on: string }[];
      const set = (next: typeof items) => c.update({ data: { ...d(el), items: next } });
      return (
        <Frame title="Key dates" icon={Flag}>
          <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
            {items.map((it, i) => {
              const days = it.on ? Math.ceil((new Date(it.on).getTime() - Date.now()) / 86_400_000) : null;
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black tabular-nums w-9 flex-shrink-0"
                    style={{ color: days === null ? '#cbd5e1' : days < 0 ? '#dc2626' : days < 7 ? '#d97706' : '#64748b' }}>
                    {days === null ? '—' : days < 0 ? `${-days}d ago` : `${days}d`}
                  </span>
                  <Line value={it.t} readOnly={c.readOnly}
                    onChange={v => set(items.map((x, j) => j === i ? { ...x, t: v } : x))}
                    className="text-[10.5px] text-gray-700 flex-1" />
                  {!c.readOnly && (
                    <input data-no-drag data-el-action type="date" value={it.on}
                      onChange={e => set(items.map((x, j) => j === i ? { ...x, on: e.target.value } : x))}
                      className="text-[9px] text-gray-400 bg-transparent outline-none w-[86px]" />
                  )}
                </div>
              );
            })}
            {!c.readOnly && (
              <button data-no-drag data-el-action onClick={() => set([...items, { t: '', on: '' }])}
                className="text-[10px] text-gray-400 hover:text-gray-600 text-left">+ add</button>
            )}
          </div>
        </Frame>
      );
    },
  },

  // ── Shortcuts ─────────────────────────────────────────────────────────────
  {
    id: 'contact', name: 'Contact card', category: 'ref', icon: User2, w: 200, h: 115,
    blurb: 'A name and number, tap to call. For the crane firm, the super, the inspector.',
    data: { name: 'Name', role: '', phone: '' },
    render: (el, c) => (
      <Frame title={d(el).role || 'Contact'} icon={User2}>
        <div className="h-full flex flex-col justify-center gap-0.5">
          <Line value={d(el).name ?? ''} readOnly={c.readOnly} placeholder="Name"
            onChange={v => c.update({ data: { ...d(el), name: v } })}
            className="text-[13px] font-bold text-gray-900" />
          <Line value={d(el).role ?? ''} readOnly={c.readOnly} placeholder="Role"
            onChange={v => c.update({ data: { ...d(el), role: v } })}
            className="text-[10px] text-gray-500" />
          {d(el).phone
            ? <a data-no-drag data-el-action href={`tel:${d(el).phone}`}
                className="text-[11px] font-bold text-[#1e3a5f]">{d(el).phone}</a>
            : <Line value="" readOnly={c.readOnly} placeholder="Phone"
                onChange={v => c.update({ data: { ...d(el), phone: v } })}
                className="text-[11px] text-gray-400" />}
        </div>
      </Frame>
    ),
  },
  {
    id: 'link', name: 'Link tile', category: 'ref', icon: Link2, w: 185, h: 90,
    blurb: 'A labelled shortcut to anything — a sheet, a supplier, a portal.',
    data: { label: 'Open', url: '' },
    render: (el, c) => (
      <Frame title="Link" icon={Link2}>
        <div className="h-full flex flex-col justify-center gap-0.5">
          <Line value={d(el).label ?? ''} readOnly={c.readOnly} placeholder="Label"
            onChange={v => c.update({ data: { ...d(el), label: v } })}
            className="text-[12px] font-bold text-gray-900" />
          {d(el).url
            ? <a data-no-drag data-el-action href={d(el).url} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-[#4aa8d8] truncate">{d(el).url}</a>
            : <Line value="" readOnly={c.readOnly} placeholder="https://…"
                onChange={v => c.update({ data: { ...d(el), url: v } })}
                className="text-[10px] text-gray-400" />}
        </div>
      </Frame>
    ),
  },
  {
    id: 'address', name: 'Address', category: 'ref', icon: MapPin, w: 200, h: 100,
    blurb: 'A site address that opens straight into Maps.',
    data: { text: '' },
    render: (el, c) => (
      <Frame title="Site" icon={MapPin}>
        <div className="h-full flex flex-col justify-center gap-1">
          <Line value={d(el).text ?? ''} readOnly={c.readOnly} placeholder="Address"
            onChange={v => c.update({ data: { ...d(el), text: v } })}
            className="text-[11.5px] text-gray-800" />
          {d(el).text && (
            <a data-no-drag data-el-action target="_blank" rel="noopener noreferrer"
              href={`https://maps.google.com/?q=${encodeURIComponent(d(el).text)}`}
              className="text-[10px] font-bold text-[#4aa8d8]">Open in Maps ↗</a>
          )}
        </div>
      </Frame>
    ),
  },
  {
    id: 'lined-note', name: 'Lined pad', category: 'ref', icon: StickyNote, w: 215, h: 190,
    blurb: 'A proper writing pad — more room than a sticky, and it looks like paper.',
    data: { text: '' },
    render: (el, c) => (
      <div className="w-full h-full p-2 overflow-hidden"
        style={{
          backgroundImage: 'repeating-linear-gradient(transparent, transparent 19px, rgba(148,163,184,.35) 20px)',
          backgroundPosition: '0 6px',
        }}>
        <textarea data-no-drag data-el-action readOnly={c.readOnly}
          value={d(el).text ?? ''}
          onChange={e => c.update({ data: { ...d(el), text: e.target.value } })}
          placeholder="Write…"
          className="w-full h-full bg-transparent outline-none resize-none text-[12px] text-gray-700"
          style={{ lineHeight: '20px' }} />
      </div>
    ),
  },


  // ── Fifteen more ──────────────────────────────────────────────────────────
  {
    id: 'contractor-links', name: 'Contractor links', category: 'live', icon: Copy, w: 250, h: 195,
    blurb: 'Every contractor with a one-tap copy of their portal link. New contractors appear on their own.',
    render: (_el, c) => <ContractorLinks contractors={c.contractors} assignments={c.assignments} />,
  },
  {
    id: 'stage-funnel', name: 'Stage funnel', category: 'live', icon: ListFilter, w: 260, h: 180,
    blurb: 'Bars showing how the board is spread across the stages.',
    render: (_el, c) => {
      const rows = c.stages.map(st => ({ st, n: c.jobs.filter(j => j.currentStageId === st.id).length }));
      const top = Math.max(1, ...rows.map(r => r.n));
      return (
        <Frame title="Spread by stage" icon={ListFilter}>
          <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
            {rows.map(({ st, n }) => (
              <div key={st.id}>
                <div className="flex items-baseline gap-1">
                  <span className="text-[9.5px] text-gray-600 truncate flex-1">{st.name}</span>
                  <span className="text-[9.5px] font-bold tabular-nums" style={{ color: st.color }}>{n}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(n / top) * 100}%`, backgroundColor: st.color }} />
                </div>
              </div>
            ))}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'due-today', name: 'Due today', category: 'live', icon: CalendarCheck, w: 230, h: 165,
    blurb: 'Only what is due today. The morning list.',
    render: (_el, c) => {
      const list = c.assignments.filter(a => !a.completedAt && a.dueDate === today());
      return (
        <Frame title={`Due today · ${list.length}`} icon={CalendarCheck} tone="#d97706">
          <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
            {list.length === 0 && <span className="text-[10.5px] text-gray-400">Nothing due today</span>}
            {list.map(a => {
              const job = c.jobs.find(j => j.id === a.apartmentId);
              const con = c.contractors.find(x => x.id === a.contractorId);
              return (
                <button key={a.id} data-no-drag data-el-action onClick={() => job && c.openJob(job.id)}
                  className="text-left">
                  <span className="text-[10.5px] text-gray-700 truncate block">{job?.displayName || a.taskDescription}</span>
                  {con && <span className="text-[9px] text-gray-400">{con.name}</span>}
                </button>
              );
            })}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'job-list', name: 'Job list', category: 'live', icon: Filter, w: 235, h: 195,
    blurb: 'A live list of the jobs at one stage. Click any to open it.',
    data: {},
    render: (el, c) => {
      const sid = d(el).stageId as string | undefined;
      const st = c.stages.find(x => x.id === sid);
      const list = sid ? c.jobs.filter(j => j.currentStageId === sid) : c.jobs;
      return (
        <Frame title={`${st?.name ?? 'All jobs'} · ${list.length}`} icon={Filter} tone={st?.color}>
          <div className="flex flex-col gap-0.5 h-full overflow-y-auto pr-1">
            {list.map(j => (
              <button key={j.id} data-no-drag data-el-action onClick={() => c.openJob(j.id)}
                className="text-[10.5px] text-gray-700 truncate text-left hover:text-[#1e3a5f]">
                {j.displayName || 'Job'}
              </button>
            ))}
            {list.length === 0 && <span className="text-[10px] text-gray-400">Nothing here</span>}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'photo-review', name: 'Photos to review', category: 'live', icon: Camera, w: 175, h: 105,
    blurb: 'How many site photos nobody has looked at yet.',
    render: (_el, c) => {
      const n = c.photos.filter(p => !p.reviewedAt).length;
      return (
        <Frame title="To review" icon={Camera} tone={n ? '#d97706' : undefined}>
          <Big value={n} sub={n === 1 ? 'photo waiting' : 'photos waiting'} color={n ? '#d97706' : '#16a34a'} />
        </Frame>
      );
    },
  },
  {
    id: 'count-by-stage', name: 'Stage count', category: 'live', icon: Gauge, w: 175, h: 105,
    blurb: 'One big number: how many jobs sit at a chosen stage.',
    data: {},
    render: (el, c) => {
      const st = c.stages.find(x => x.id === d(el).stageId) ?? c.stages[0];
      const n = st ? c.jobs.filter(j => j.currentStageId === st.id).length : 0;
      return (
        <Frame title={st?.name ?? 'Stage'} icon={Gauge} tone={st?.color}>
          <Big value={n} sub="jobs at this stage" color={st?.color} />
        </Frame>
      );
    },
  },
  {
    id: 'recent-jobs', name: 'New this week', category: 'live', icon: Sparkles, w: 220, h: 160,
    blurb: 'Jobs added in the last seven days.',
    render: (_el, c) => {
      const cut = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const list = c.jobs.filter(j => (j.createdAt ?? '') > cut)
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      return (
        <Frame title={`New this week · ${list.length}`} icon={Sparkles}>
          <div className="flex flex-col gap-0.5 h-full overflow-y-auto pr-1">
            {list.length === 0 && <span className="text-[10px] text-gray-400">Nothing new</span>}
            {list.map(j => (
              <button key={j.id} data-no-drag data-el-action onClick={() => c.openJob(j.id)}
                className="text-[10.5px] text-gray-700 truncate text-left">{j.displayName || 'Job'}</button>
            ))}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'job-search', name: 'Find a job', category: 'live', icon: Search, w: 230, h: 160,
    blurb: 'Type a name and jump straight to the job.',
    render: (_el, c) => <JobSearch jobs={c.jobs} openJob={c.openJob} />,
  },
  {
    id: 'calculator', name: 'Calculator', category: 'plan', icon: Calculator, w: 190, h: 175,
    blurb: 'A plain calculator, for when the phone is across the room.',
    render: () => <CalcWidget />,
  },
  {
    id: 'converter', name: 'HVAC converter', category: 'plan', icon: ArrowRightLeft, w: 225, h: 165,
    blurb: 'BTU, kW, tons, metres, feet and degrees — the conversions this trade actually uses.',
    data: { kind: 'btu', v: '12000' },
    render: (el, c) => <Converter el={el} update={c.update} readOnly={c.readOnly} />,
  },
  {
    id: 'weekly-goal', name: 'Target', category: 'plan', icon: Target, w: 195, h: 120,
    blurb: 'A target and how far along you are against it.',
    data: { title: 'This week', target: 10, done: 0 },
    render: (el, c) => {
      const t = Number(d(el).target ?? 0), n = Number(d(el).done ?? 0);
      const pct = t > 0 ? Math.min(100, Math.round((n / t) * 100)) : 0;
      return (
        <Frame title={d(el).title ?? 'Target'} icon={Target}>
          <div className="h-full flex flex-col justify-center gap-1.5">
            <div className="flex items-baseline gap-1">
              <span className="font-black tabular-nums text-[26px]">{n}</span>
              <span className="text-[11px] text-gray-400">/ {t}</span>
              {!c.readOnly && (
                <span className="ml-auto flex gap-1">
                  <button data-no-drag data-el-action onClick={() => c.update({ data: { ...d(el), done: n + 1 } })}
                    className="w-5 h-5 rounded bg-gray-100 text-gray-600 text-[11px] font-bold">+</button>
                  <button data-no-drag data-el-action onClick={() => c.update({ data: { ...d(el), done: Math.max(0, n - 1) } })}
                    className="w-5 h-5 rounded bg-gray-100 text-gray-600 text-[11px] font-bold">−</button>
                </span>
              )}
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#16a34a' : '#4aa8d8' }} />
            </div>
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'team-today', name: 'On site today', category: 'plan', icon: Users, w: 215, h: 175,
    blurb: 'Who is where today. The question the office is asked most.',
    data: { rows: [{ who: '', where: '' }] },
    render: (el, c) => {
      const rows = (d(el).rows ?? []) as { who: string; where: string }[];
      const set = (next: typeof rows) => c.update({ data: { ...d(el), rows: next } });
      return (
        <Frame title="On site today" icon={Users}>
          <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Line value={r.who} readOnly={c.readOnly} placeholder="Who"
                  onChange={v => set(rows.map((x, j) => j === i ? { ...x, who: v } : x))}
                  className="text-[10.5px] font-bold text-gray-800 w-[42%]" />
                <Line value={r.where} readOnly={c.readOnly} placeholder="Where"
                  onChange={v => set(rows.map((x, j) => j === i ? { ...x, where: v } : x))}
                  className="text-[10.5px] text-gray-500 flex-1" />
              </div>
            ))}
            {!c.readOnly && (
              <button data-no-drag data-el-action onClick={() => set([...rows, { who: '', where: '' }])}
                className="text-[10px] text-gray-400 hover:text-gray-600 text-left">+ add</button>
            )}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'timeline', name: 'Timeline', category: 'plan', icon: GitCommitHorizontal, w: 380, h: 110,
    blurb: 'Key dates laid out left to right, with today marked.',
    data: { items: [{ t: 'Start', on: '' }, { t: 'Handover', on: '' }] },
    render: (el, c) => {
      const items = (d(el).items ?? []) as { t: string; on: string }[];
      const dated = items.filter(i => i.on).map(i => ({ ...i, ms: new Date(i.on).getTime() }));
      const lo = Math.min(Date.now(), ...dated.map(i => i.ms));
      const hi = Math.max(Date.now(), ...dated.map(i => i.ms));
      const at = (ms: number) => (hi === lo ? 50 : ((ms - lo) / (hi - lo)) * 100);
      return (
        <Frame title="Timeline" icon={GitCommitHorizontal}>
          <div className="relative h-full">
            <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-200" />
            <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-red-500"
              style={{ left: `${at(Date.now())}%` }} title="today" />
            {dated.map((i, k) => (
              <div key={k} className="absolute -translate-x-1/2" style={{ left: `${at(i.ms)}%`, top: 0 }}>
                <div className="text-[9px] text-gray-600 whitespace-nowrap">{i.t}</div>
                <div className="w-2 h-2 rounded-full bg-[#1e3a5f] mx-auto mt-1" />
                <div className="text-[8px] text-gray-400 whitespace-nowrap mt-0.5">
                  {new Date(i.on).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </div>
              </div>
            ))}
            {dated.length === 0 && <span className="text-[10px] text-gray-400">Add dates in Key dates style</span>}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'multi-timer', name: 'Several timers', category: 'plan', icon: TimerReset, w: 215, h: 170,
    blurb: 'A few labelled countdowns in one node, instead of one each.',
    data: { items: [{ t: 'Crane', on: '' }] },
    render: (el, c) => {
      const items = (d(el).items ?? []) as { t: string; on: string }[];
      const set = (next: typeof items) => c.update({ data: { ...d(el), items: next } });
      return (
        <Frame title="Timers" icon={TimerReset}>
          <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
            {items.map((it, i) => {
              const ms = it.on ? new Date(it.on).getTime() - Date.now() : null;
              const hrs = ms === null ? null : Math.floor(Math.abs(ms) / 3_600_000);
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[9px] font-black tabular-nums w-11 flex-shrink-0"
                    style={{ color: ms === null ? '#cbd5e1' : ms < 0 ? '#dc2626' : hrs! < 24 ? '#d97706' : '#64748b' }}>
                    {ms === null ? '—' : hrs! >= 48 ? `${Math.floor(hrs! / 24)}d` : `${hrs}h`}
                  </span>
                  <Line value={it.t} readOnly={c.readOnly}
                    onChange={v => set(items.map((x, j) => j === i ? { ...x, t: v } : x))}
                    className="text-[10.5px] text-gray-700 flex-1" />
                  {!c.readOnly && (
                    <input data-no-drag data-el-action type="datetime-local" value={it.on}
                      onChange={e => set(items.map((x, j) => j === i ? { ...x, on: e.target.value } : x))}
                      className="text-[8px] text-gray-400 bg-transparent outline-none w-[74px]" />
                  )}
                </div>
              );
            })}
            {!c.readOnly && (
              <button data-no-drag data-el-action onClick={() => set([...items, { t: '', on: '' }])}
                className="text-[10px] text-gray-400 hover:text-gray-600 text-left">+ add</button>
            )}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'handover', name: 'Shift handover', category: 'ref', icon: ListChecks, w: 240, h: 185,
    blurb: 'What the next person needs to know. Structured, so nothing is left implied.',
    data: { done: '', next: '', watch: '' },
    render: (el, c) => (
      <Frame title="Handover" icon={ListChecks}>
        <div className="flex flex-col gap-1 h-full">
          {([['done', 'Done'], ['next', 'Next'], ['watch', 'Watch out']] as const).map(([k, label]) => (
            <div key={k} className="flex-1 min-h-0 flex flex-col">
              <span className="text-[8.5px] font-bold text-gray-400">{label.toUpperCase()}</span>
              <textarea data-no-drag data-el-action readOnly={c.readOnly}
                value={(d(el)[k] as string) ?? ''}
                onChange={e => c.update({ data: { ...d(el), [k]: e.target.value } })}
                className="flex-1 min-h-0 bg-slate-50 rounded px-1.5 py-0.5 outline-none resize-none text-[10px] text-gray-700" />
            </div>
          ))}
        </div>
      </Frame>
    ),
  },


  // ── Things that used to sit on the toolbar ────────────────────────────────
  // They are things you PLACE, not ways of working, so the store is where they
  // belong; the toolbar is left with gestures and the raw board pieces.
  {
    id: 'w-countdown', name: 'Countdown', category: 'plan', icon: Timer, w: 190, h: 96,
    blurb: 'Counts down to a date and turns amber, then red, as it arrives.',
    data: {},
    render: (el, c) => <CountdownInner el={el} update={c.update} readOnly={c.readOnly} />,
  },
  {
    id: 'w-stopwatch', name: 'Stopwatch', category: 'plan', icon: Clock3, w: 190, h: 96,
    blurb: 'Counts up. Start it when a crew starts, stop it when they finish.',
    data: { elapsedMs: 0 },
    render: (el, c) => <StopwatchInner el={el} update={c.update} readOnly={c.readOnly} />,
  },
  /**
   * Each piece is its own item on the shelf.
   *
   * One "Clip art" entry that opened a chooser meant the store showed a pin and
   * nothing else — you could not see what was in there without placing one
   * first. Eight entries means eight pictures, and the blurb says what each one
   * actually DOES, because these are not decoration: drop one on a job and it
   * sticks to it.
   */
  ...ART_PIECES,

  {
    id: 'w-title', name: 'Heading', category: 'visual', icon: Type, w: 280, h: 48,
    blurb: 'A heading to label a column or a section. Full type controls, and it can be pinned to the top.',
    data: {},
    render: (el, c) => (
      <div className="w-full h-full flex items-center px-2 leading-tight overflow-hidden"
        style={{
          fontSize: (el.fontSize ?? 30) as number,
          fontWeight: (el.fontWeight ?? 800) as number,
          color: (el.color && el.color !== '#ffffff') ? el.color : '#0f172a',
          justifyContent: el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start',
        }}>
        {el.text || (c.readOnly ? 'This week' : 'Title')}
      </div>
    ),
  },

  // ── Look & feel ───────────────────────────────────────────────────────────
  {
    id: 'clock', name: 'Wall clock', category: 'visual', icon: Clock3, w: 190, h: 110,
    blurb: 'Time and date, big enough to read across the office.',
    render: () => <ClockWidget />,
  },
  {
    id: 'banner', name: 'Banner', category: 'visual', icon: Megaphone, w: 340, h: 62,
    blurb: 'A bold ribbon across a section of the board.',
    data: { text: 'THIS WEEK' },
    render: (el, c) => (
      <div className="w-full h-full flex items-center justify-center px-3 rounded-xl"
        style={{ backgroundColor: el.color || '#1e3a5f' }}>
        <Line value={d(el).text ?? ''} readOnly={c.readOnly} placeholder="Banner"
          onChange={v => c.update({ data: { ...d(el), text: v } })}
          className="text-center text-white font-black tracking-wide text-[19px]" />
      </div>
    ),
  },
  {
    id: 'photo', name: 'Photo', category: 'visual', icon: ImageIcon, w: 215, h: 160,
    blurb: 'Pin a picture to the board by its link.',
    data: { url: '' },
    render: (el, c) => (
      d(el).url
        ? <img src={d(el).url} alt="" className="w-full h-full object-cover rounded-xl" />
        : (
          <Frame title="Photo" icon={ImageIcon}>
            <Line value="" readOnly={c.readOnly} placeholder="Paste an image link"
              onChange={v => c.update({ data: { ...d(el), url: v } })}
              className="text-[10px] text-gray-400" />
          </Frame>
        )
    ),
  },
];


/**
 * Every contractor with a one-tap copy of their portal link.
 *
 * Reads the live contractor list, so a contractor added in settings shows up
 * here on its own — the point of it being a live widget rather than a set of
 * link tiles somebody has to maintain by hand.
 */
function ContractorLinks({ contractors, assignments }: {
  contractors: Contractor[]; assignments: ContractorAssignment[];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const active = contractors.filter(c => c.active);

  function copy(c: Contractor) {
    const url = `${window.location.origin}/c/${c.token}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(c.id);
      setTimeout(() => setCopied(null), 1600);
    }).catch(() => {});
  }

  return (
    <Frame title={`Contractor links · ${active.length}`} icon={Copy}>
      <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
        {active.length === 0 && <span className="text-[10px] text-gray-400">No contractors yet</span>}
        {active.map(c => {
          const open = assignments.filter(a => a.contractorId === c.id && !a.completedAt).length;
          return (
            <div key={c.id} className="flex items-center gap-1.5">
              <span className="text-[10.5px] text-gray-700 truncate flex-1">{c.name}</span>
              {open > 0 && <span className="text-[9px] text-gray-400 tabular-nums">{open}</span>}
              <button
                data-no-drag data-el-action
                onClick={() => copy(c)}
                title="Copy this contractor's portal link"
                className="p-1 rounded-md flex-shrink-0 transition-colors"
                style={copied === c.id
                  ? { backgroundColor: '#dcfce7', color: '#166534' }
                  : { backgroundColor: '#f1f5f9', color: '#64748b' }}
              >
                {copied === c.id ? <Check size={11} /> : <Copy size={11} />}
              </button>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function JobSearch({ jobs, openJob }: { jobs: Apartment[]; openJob: (id: string) => void }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? jobs.filter(j => (j.displayName ?? '').toLowerCase().includes(needle)
        || (j.address ?? '').toLowerCase().includes(needle)).slice(0, 8)
    : [];
  return (
    <Frame title="Find a job" icon={Search}>
      <div className="h-full flex flex-col gap-1">
        <input
          data-no-drag data-el-action value={q} onChange={e => setQ(e.target.value)}
          placeholder="Name or address…"
          className="text-[11px] bg-slate-50 rounded px-2 py-1 outline-none flex-shrink-0"
        />
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-0.5">
          {hits.map(j => (
            <button key={j.id} data-no-drag data-el-action onClick={() => openJob(j.id)}
              className="text-[10.5px] text-gray-700 truncate text-left hover:text-[#1e3a5f]">
              {j.displayName || 'Job'}
            </button>
          ))}
          {needle && hits.length === 0 && <span className="text-[10px] text-gray-400">No match</span>}
        </div>
      </div>
    </Frame>
  );
}

function CalcWidget() {
  const [expr, setExpr] = useState('');
  const [out, setOut] = useState('');
  const KEYS = ['7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+'];

  /**
   * Evaluated by a tiny parser rather than `eval`. Only digits and the four
   * operators are ever accepted, so nothing that arrives here can be code.
   */
  function calc(src: string): string {
    if (!/^[\d+\-*/.\s]+$/.test(src)) return '';
    const toks = src.match(/\d*\.?\d+|[+\-*/]/g);
    if (!toks) return '';
    const nums: number[] = [], ops: string[] = [];
    for (const t of toks) {
      if (/[+\-*/]/.test(t)) ops.push(t);
      else {
        let n = parseFloat(t);
        // Multiplication and division bind tighter, so they resolve immediately.
        while (ops.length && (ops[ops.length - 1] === '*' || ops[ops.length - 1] === '/')) {
          const op = ops.pop()!, a = nums.pop()!;
          n = op === '*' ? a * n : a / n;
        }
        nums.push(n);
      }
    }
    let acc = nums[0] ?? 0;
    for (let i = 0; i < ops.length; i++) acc = ops[i] === '+' ? acc + nums[i + 1] : acc - nums[i + 1];
    return Number.isFinite(acc) ? String(Math.round(acc * 1e6) / 1e6) : '';
  }

  return (
    <div className="w-full h-full flex flex-col p-1.5 gap-1">
      <div className="bg-slate-50 rounded px-2 py-1 text-right flex-shrink-0">
        <div className="text-[10px] text-gray-400 truncate h-3.5">{expr || '\u00a0'}</div>
        <div className="text-[15px] font-black tabular-nums">{out || '0'}</div>
      </div>
      <div className="grid grid-cols-4 gap-0.5 flex-1 min-h-0">
        {KEYS.map(k => (
          <button key={k} data-no-drag data-el-action
            onClick={() => {
              if (k === '=') { setOut(calc(expr)); return; }
              setExpr(e => e + k);
            }}
            className="rounded text-[11px] font-bold text-gray-700 bg-slate-50 hover:bg-slate-100">
            {k}
          </button>
        ))}
        <button data-no-drag data-el-action onClick={() => { setExpr(''); setOut(''); }}
          className="col-span-4 rounded text-[10px] font-bold text-gray-500 bg-slate-50 hover:bg-slate-100 py-0.5">
          clear
        </button>
      </div>
    </div>
  );
}

/** The conversions this trade actually reaches for, in one node. */
const CONVERSIONS: { id: string; label: string; from: string; to: string; f: (n: number) => number }[] = [
  { id: 'btu',   label: 'BTU/h → kW',  from: 'BTU/h', to: 'kW',    f: n => n * 0.00029307107 },
  { id: 'kw',    label: 'kW → BTU/h',  from: 'kW',    to: 'BTU/h', f: n => n / 0.00029307107 },
  { id: 'ton',   label: 'Tons → kW',   from: 'tons',  to: 'kW',    f: n => n * 3.516853 },
  { id: 'tonbtu',label: 'Tons → BTU/h',from: 'tons',  to: 'BTU/h', f: n => n * 12000 },
  { id: 'm',     label: 'Metres → ft', from: 'm',     to: 'ft',    f: n => n * 3.280839895 },
  { id: 'ft',    label: 'Feet → m',    from: 'ft',    to: 'm',     f: n => n / 3.280839895 },
  { id: 'c',     label: '°C → °F',     from: '°C',    to: '°F',    f: n => n * 9 / 5 + 32 },
  { id: 'f',     label: '°F → °C',     from: '°F',    to: '°C',    f: n => (n - 32) * 5 / 9 },
];

function Converter({ el, update, readOnly }: {
  el: CanvasElement; update: (p: Partial<CanvasElement>) => void; readOnly?: boolean;
}) {
  const data = d(el);
  const conv = CONVERSIONS.find(c => c.id === data.kind) ?? CONVERSIONS[0];
  const n = parseFloat(String(data.v ?? ''));
  const out = Number.isFinite(n) ? conv.f(n) : null;
  const round = (x: number) => Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 100) / 100;

  return (
    <Frame title="Convert" icon={ArrowRightLeft}>
      <div className="h-full flex flex-col gap-1">
        <select
          data-no-drag data-el-action disabled={readOnly}
          value={conv.id}
          onChange={e => update({ data: { ...data, kind: e.target.value } })}
          className="text-[10px] bg-slate-50 rounded px-1.5 py-1 outline-none flex-shrink-0"
        >
          {CONVERSIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <input
            data-no-drag data-el-action readOnly={readOnly}
            value={String(data.v ?? '')}
            onChange={e => update({ data: { ...data, v: e.target.value } })}
            inputMode="decimal"
            className="w-[52%] text-[13px] font-bold bg-slate-50 rounded px-1.5 py-1 outline-none tabular-nums"
          />
          <span className="text-[9px] text-gray-400">{conv.from}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-[18px] font-black tabular-nums text-[#1e3a5f]">
            {out === null ? '—' : round(out)}
          </span>
          <span className="text-[10px] text-gray-400">{conv.to}</span>
        </div>
      </div>
    </Frame>
  );
}


// ─── The three that moved off the toolbar ────────────────────────────────────

function splitMs(ms: number) {
  const abs = Math.abs(ms);
  return {
    d: Math.floor(abs / 86_400_000),
    h: Math.floor((abs % 86_400_000) / 3_600_000),
    m: Math.floor((abs % 3_600_000) / 60_000),
    s: Math.floor((abs % 60_000) / 1000),
    past: ms < 0,
  };
}

function useTick(on = true, everyMs = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set(n => n + 1), everyMs);
    return () => clearInterval(t);
  }, [on, everyMs]);
}

function CountdownInner({ el, update, readOnly }: {
  el: CanvasElement; update: (p: Partial<CanvasElement>) => void; readOnly?: boolean;
}) {
  useTick();
  const data = d(el);
  const target = data.targetAt as string | undefined;
  if (!target) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-2">
        <span className="text-[10px] text-gray-400">Counting down to…</span>
        {!readOnly && (
          <input data-no-drag data-el-action type="datetime-local"
            onChange={e => update({ data: { ...data, targetAt: new Date(e.target.value).toISOString() } })}
            className="text-[10px] bg-slate-50 rounded px-1.5 py-1 outline-none" />
        )}
      </div>
    );
  }
  const ms = new Date(target).getTime() - Date.now();
  const { d: dd, h, m, s: ss, past } = splitMs(ms);
  const colour = past ? '#dc2626' : dd === 0 && h < 4 ? '#d97706' : '#0f172a';
  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-2">
      <Line value={(data.title as string) ?? ''} readOnly={readOnly} placeholder="Countdown"
        onChange={v => update({ data: { ...data, title: v } })}
        className="text-[10px] font-bold text-gray-500 text-center" />
      <div className="font-black tabular-nums leading-none mt-1" style={{ color: colour, fontSize: 22 }}>
        {dd > 0 ? `${dd}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}:${String(ss).padStart(2, '0')}`}
      </div>
      <div className="text-[9px] text-gray-400 mt-0.5">{past ? 'overdue' : 'remaining'}</div>
    </div>
  );
}

function StopwatchInner({ el, update, readOnly }: {
  el: CanvasElement; update: (p: Partial<CanvasElement>) => void; readOnly?: boolean;
}) {
  const data = d(el);
  const startedAt = data.startedAt as string | undefined;
  useTick(!!startedAt);
  const base = Number(data.elapsedMs ?? 0);
  const live = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
  const { d: dd, h, m, s: ss } = splitMs(base + live);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-2">
      <Line value={(data.title as string) ?? ''} readOnly={readOnly} placeholder="Stopwatch"
        onChange={v => update({ data: { ...data, title: v } })}
        className="text-[10px] font-bold text-gray-500 text-center" />
      <div className="font-black tabular-nums leading-none mt-1" style={{ fontSize: 22 }}>
        {dd > 0 ? `${dd}d ${h}h` : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`}
      </div>
      {!readOnly && (
        <button data-no-drag data-el-action
          onClick={() => update({ data: startedAt
            ? { ...data, startedAt: undefined, elapsedMs: base + live }
            : { ...data, startedAt: new Date().toISOString() } })}
          className="mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full"
          style={startedAt ? { backgroundColor: '#fee2e2', color: '#b91c1c' } : { backgroundColor: '#dcfce7', color: '#166534' }}>
          {startedAt ? 'Stop' : 'Start'}
        </button>
      )}
    </div>
  );
}

/**
 * Clip art, with its piece chosen on the node itself.
 *
 * Attaching to a job is handled by the board (it knows where everything is);
 * this only draws the piece and lets you swap it.
 */
function ArtInner({ el, update, readOnly }: {
  el: CanvasElement; update: (p: Partial<CanvasElement>) => void; readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const data = d(el);
  const art = (data.art as ArtKind) ?? 'pin';
  return (
    <div className="w-full h-full relative">
      <ClipArtNode el={{ ...el, art, color: (data.color as string) || '#dc2626' }} />
      {!readOnly && (
        <button data-no-drag data-el-action
          onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
          title="Change the piece"
          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-200 text-[8px] text-gray-500 opacity-0 hover:opacity-100 focus:opacity-100">
          ⋯
        </button>
      )}
      {open && !readOnly && (
        <div data-no-drag data-el-action
          className="absolute z-30 top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 p-1 grid grid-cols-4 gap-0.5"
          style={{ width: 150 }}>
          {ART_KINDS.map(k => (
            <button key={k} title={k.replace('-', ' ')}
              onClick={() => { update({ data: { ...data, art: k } }); setOpen(false); }}
              className="aspect-square rounded hover:bg-slate-100 p-0.5">
              <ClipArtNode el={{ ...el, art: k, w: 30, h: 30 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ClockWidget() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="font-black tabular-nums leading-none" style={{ fontSize: 34 }}>
        {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="text-[10.5px] text-gray-500 mt-1">
        {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
      </div>
    </div>
  );
}


/**
 * Stand-in data for the store's previews.
 *
 * A brand-new board has no jobs, no tasks and no contractors, so a preview
 * running on the real data would show every live widget as an empty box —
 * which tells you nothing about whether it is worth placing. Sample rows are
 * used only when the real thing has nothing to show, so as soon as there IS
 * real data you are looking at your own.
 */
const SAMPLE_STAGES: Stage[] = [
  { id: 'x1', name: 'Survey', color: '#8b5cf6', order: 1, active: true, description: '', createdAt: '', updatedAt: '' },
  { id: 'x2', name: 'Piping', color: '#0ea5e9', order: 2, active: true, description: '', createdAt: '', updatedAt: '' },
  { id: 'x3', name: 'Units In', color: '#f59e0b', order: 3, active: true, description: '', createdAt: '', updatedAt: '' },
  { id: 'x4', name: 'Start-up', color: '#16a34a', order: 4, active: true, description: '', createdAt: '', updatedAt: '' },
] as unknown as Stage[];

const SAMPLE_JOBS: Apartment[] = [
  { id: 'j1', displayName: 'Artzi, Avital', address: '14 Ben Gurion', currentStageId: 'x2' },
  { id: 'j2', displayName: 'Cohen, Miriam', address: '3 Herzl', currentStageId: 'x3' },
  { id: 'j3', displayName: 'Levi, Yosef', address: '88 Dizengoff', currentStageId: 'x1' },
  { id: 'j4', displayName: 'Mizrahi, Dana', address: '5 Rothschild', currentStageId: 'x4' },
  { id: 'j5', displayName: 'Peretz, Eli', address: '21 Allenby', currentStageId: 'x2' },
  { id: 'j6', displayName: 'Shapiro, Ruth', address: '9 Bialik', currentStageId: 'x3', boardBin: 'done' },
].map(j => ({ ...j, buildingId: 'G', isUnnamed: false, createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() })) as unknown as Apartment[];

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const SAMPLE_TASKS: ContractorAssignment[] = [
  { id: 't1', apartmentId: 'j1', contractorId: 'k1', taskDescription: 'Hang the units', dueDate: day(-6) },
  { id: 't2', apartmentId: 'j3', contractorId: 'k2', taskDescription: 'Duct run', dueDate: day(-2) },
  { id: 't3', apartmentId: 'j2', contractorId: 'k1', taskDescription: 'Grilles', dueDate: day(0) },
  { id: 't4', apartmentId: 'j4', contractorId: 'k3', taskDescription: 'Commissioning', dueDate: day(2) },
  { id: 't5', apartmentId: 'j5', contractorId: 'k2', taskDescription: 'Thermostats', dueDate: day(4) },
] as unknown as ContractorAssignment[];

const SAMPLE_CONTRACTORS: Contractor[] = [
  { id: 'k1', name: 'Avi Drywall', category: 'drywall', token: 'sample1', active: true, email: '', createdAt: '' },
  { id: 'k2', name: 'Moshe AC', category: 'ac', token: 'sample2', active: true, email: '', createdAt: '' },
  { id: 'k3', name: 'Yoni General', category: 'general', token: 'sample3', active: true, email: '', createdAt: '' },
] as unknown as Contractor[];

const SAMPLE_LOGS: ActivityLog[] = [
  { id: 'g1', userName: 'Esther', apartmentId: 'j1', apartmentNumber: 'Artzi, Avital', actionType: 'update',
    fieldChanged: 'currentStageId', previousValue: 'Survey', newValue: 'Piping',
    createdAt: new Date(Date.now() - 12 * 60_000).toISOString() },
  { id: 'g2', userName: 'Yitzchak', apartmentId: 'j4', apartmentNumber: 'Mizrahi, Dana', actionType: 'update',
    fieldChanged: 'address', previousValue: '', newValue: '5 Rothschild',
    createdAt: new Date(Date.now() - 95 * 60_000).toISOString() },
] as unknown as ActivityLog[];

/** Real data where there is any, samples where there is not — field by field. */
export function withSampleData(ctx: WidgetCtx): WidgetCtx {
  return {
    ...ctx,
    jobs: ctx.jobs.length ? ctx.jobs : SAMPLE_JOBS,
    stages: ctx.stages.length ? ctx.stages : SAMPLE_STAGES,
    assignments: ctx.assignments.length ? ctx.assignments : SAMPLE_TASKS,
    contractors: ctx.contractors.length ? ctx.contractors : SAMPLE_CONTRACTORS,
    logs: ctx.logs.length ? ctx.logs : SAMPLE_LOGS,
    readOnly: true,
  };
}


export const WIDGET_BY_ID = new Map(WIDGETS.map(w => [w.id, w]));

/** Renders whichever widget an element names, or nothing if it is unknown. */
export function renderWidget(el: CanvasElement, ctx: WidgetCtx): React.ReactNode {
  const def = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;
  if (!def) return <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">Unknown widget</div>;
  return def.render(el, ctx);
}
