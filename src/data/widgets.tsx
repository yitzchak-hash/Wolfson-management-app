import React, { useEffect, useState } from 'react';
import {
  Gauge, ListChecks, Hash, BarChart3, Table2, ShoppingCart, CalendarRange,
  Flag, User2, Link2, MapPin, Clock3, Megaphone, Image as ImageIcon,
  AlertTriangle, HardHat, CalendarDays, Camera, Briefcase, Activity,
  CircleDashed, Archive, StickyNote,
} from 'lucide-react';
import {
  Apartment, CanvasElement, Stage, ContractorAssignment, Contractor,
  ContractorPhoto, ActivityLog, BIN_KINDS, BIN_META,
} from '../types';

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
          {c.logs.slice(0, 8).map(l => (
            <div key={l.id} className="text-[10px] text-gray-600 truncate">
              <b className="text-gray-800">{l.userName}</b> · {l.apartmentNumber || l.fieldChanged}
            </div>
          ))}
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

export const WIDGET_BY_ID = new Map(WIDGETS.map(w => [w.id, w]));

/** Renders whichever widget an element names, or nothing if it is unknown. */
export function renderWidget(el: CanvasElement, ctx: WidgetCtx): React.ReactNode {
  const def = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;
  if (!def) return <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">Unknown widget</div>;
  return def.render(el, ctx);
}
