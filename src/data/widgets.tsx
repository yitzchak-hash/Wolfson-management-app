import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Gauge, ListChecks, Hash, BarChart3, Table2, ShoppingCart, CalendarRange,
  Flag, User2, Link2, MapPin, Clock3, Megaphone, Image as ImageIcon,
  AlertTriangle, HardHat, CalendarDays, Camera, Briefcase, Activity,
  CircleDashed, Archive, StickyNote, Copy, Check, Filter, CalendarCheck,
  Calculator, Ruler, Target, Users, GitCommitHorizontal, TimerReset,
  ArrowRightLeft, ListFilter, Search, Sparkles, Timer, Sticker, Type, FolderPlus, Building,
  Minus, MessageSquareQuote, Palette, X, Pin, Plus, Trash2,
} from 'lucide-react';
import {
  Apartment, CanvasElement, Stage, ContractorAssignment, Contractor,
  ContractorPhoto, ActivityLog, BIN_KINDS, BIN_META, isCountableApartment, personColor,
  User, ContractorNote, PlanPin, Employee, TimePunch,
} from '../types';
import { portalLink } from './portalLink';
import { useStore } from './store';
import { soundScore } from './hebrewSearch';
import { describeActivity } from './activityText';
import { ClipArtNode, ART_KINDS, ArtKind } from '../components/board/BoardNodes';
import { MiniJob } from '../components/board/MiniJob';
import { ProjectMini, BoardMini, CalendarMini } from '../components/board/DashWidgets';
import { TV_WIDGETS } from './tvWidgets';
import { INSIGHT_WIDGETS } from './insightWidgets';
import { MORE_WIDGETS } from './moreWidgets';
import { PlannerWidget, PlannerData, PlannerEntry } from '../components/board/PlannerWidget';
import { StickyNoteWidget, StickyNoteRecord, NOTE_COLOURS } from '../components/board/StickyNoteWidget';
import { ActivitySentence } from '../components/ui/ActivitySentence';

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
  /** Staff, so the rota can put office people on it too. */
  users: User[];
  photos: ContractorPhoto[];
  logs: ActivityLog[];
  /**
   * What the site has said back, and what is still outstanding on a plan.
   *
   * Both were already in the store and neither reached a widget, which is why
   * "has anybody heard from this contractor?" and "what snags are still open?"
   * had no answer on the board. Optional so the eight places that build a
   * context did not all have to change at once — a widget that needs them
   * treats absent as empty.
   */
  notes?: ContractorNote[];
  planPins?: PlanPin[];
  /**
   * "Show me the list behind this number."
   *
   * Every figure a widget draws should open the records it counted — a number
   * you cannot look behind reads as a claim rather than a fact. The host draws
   * the list (MiniJob rows, its own openJob); optional so the store's preview
   * shelf, which has no board to open lists on, simply renders numbers.
   */
  showList?: (title: string, jobIds: string[]) => void;
  /**
   * The payroll list and its taps.
   *
   * Same reason as the two above: the tap-in board reads them from the store,
   * which is right on a real board and useless on the shelf — a store card
   * that says "nobody on the list yet" is honest and tells a shopper nothing
   * about what the widget is.
   */
  employees?: Employee[];
  punches?: TimePunch[];
  /** Writes back into the element — used by the interactive widgets. */
  update: (patch: Partial<CanvasElement>) => void;
  openJob: (id: string) => void;
  /** Switch to another workspace. Only the dashboard supplies this. */
  openProject?: (id: string) => void;
  /**
   * Open ONE unit in another workspace — switch there and land on it.
   * Separate from openProject because "show me Wolfson" and "show me
   * apartment 37 in Wolfson" are different requests.
   */
  openUnit?: (projectId: string, apartmentId: string) => void;
  /** Open the whole schedule in a window. Only the board supplies this. */
  showAllScheduled?: (plannerId: string) => void;
  /** Ask what to do with the task behind a planner slot being emptied. */
  askRemoveTask?: (entry: PlannerEntry, done: (alsoDelete: boolean) => void) => void;
  /** A job's last square in the notebook was emptied — put it back on the board. */
  leaveNotebook?: (jobId: string) => void;
  /**
   * This is a wall panel.
   *
   * Separate from `readOnly`, which the wall turns OFF when somebody picks up
   * its pen to move its own furniture about. The weekly notebook must not
   * follow that: a TV is walked up to by anyone, and a week's planning is not
   * something to rearrange by leaning on a screen. Jobs still open from it.
   */
  wall?: boolean;
  /** Hebrew, so a widget that writes its own words can turn round. */
  isRtl?: boolean;
  /** The TV passes this: widgets render, but nothing can be changed. */
  readOnly?: boolean;
  /**
   * The board's own nodes, for the widgets that read another widget.
   *
   * "Out today" and "Tomorrow" answer from whatever planner is on the board,
   * which they normally take straight from the store. On the widget shelf
   * there is no board, so they drew their "nothing on for that day" message —
   * indistinguishable from working correctly on a quiet day, and useless as a
   * preview. When this is set it is used instead of the store, which is how
   * the shelf hands them a sample planner.
   */
  boardElements?: CanvasElement[];
}

export interface WidgetDef {
  id: string;
  name: string;
  category: WidgetCategory;
  /**
   * How near the front of its group this sits.
   *
   * Lower is earlier. Without it the shelf is in whatever order the file was
   * written, so the pieces reached for twenty times a day — tape, the note pad,
   * a banner, a section box — sat below things nobody has ever placed.
   */
  rank?: number;
  blurb: string;
  icon: React.ElementType;
  w: number;
  h: number;
  /** Seed values for `data` when one is placed. */
  data?: Record<string, unknown>;
  render: (el: CanvasElement, ctx: WidgetCtx) => React.ReactNode;
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

export const d = (el: CanvasElement) => (el.data ?? {}) as Record<string, any>;
export const today = () => new Date().toISOString().slice(0, 10);

export function Frame({ title, icon: Icon, children, tone }: {
  title: string; icon?: React.ElementType; children: React.ReactNode; tone?: string;
}) {
  return (
    <div className="w-full h-full flex flex-col px-2.5 py-2 overflow-hidden">
      <div className="flex items-center gap-1 mb-1 flex-shrink-0">
        {Icon && <Icon size={11} style={{ color: tone ?? '#94a3b8' }} />}
        <span className="text-[9.5px] font-extrabold tracking-wide truncate"
          style={{ color: tone ?? '#64748b' }}>{title.toUpperCase()}</span>
      </div>
      {/*
        The body SCROLLS when it does not fit, rather than being cut off.

        It used to be `overflow-hidden`, so shrinking a node quietly removed
        whatever fell past the bottom edge — the calculator lost its clear key,
        the converter lost its last unit, the month lost its last week. Nothing
        on screen said anything was missing. `auto` means a widget that fits
        shows no scrollbar at all and one that does not can still be read.
      */}
      {/* widget-scroll: the bar only appears under the pointer, in the
          widget's own grey — a standing scrollbar along the bottom read as
          broken chrome rather than as "there is more". */}
      <div className="flex-1 min-h-0 overflow-auto widget-scroll">{children}</div>
    </div>
  );
}

export function Big({ value, sub, color }: { value: React.ReactNode; sub?: string; color?: string }) {
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

export const overdueOf = (a: ContractorAssignment) => !a.completedAt && !!a.dueDate && a.dueDate < today();

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
  ['tape',         'Tape',        'A strip of masking tape. Decoration — it holds a section together visually.',  72, 32],
  ['marker',       'Marker',      'A pen resting on the board — click it to pick it up in that colour.',          48, 48],
  ['document',     'Document',    'A paper stub for a drawing or a spec — link it and it opens.',                 52, 62],
  ['sticky-stack', 'Note pad',    'A pad you take notes from — click it and a fresh sticky lands beside it.',     56, 56],
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
    id: 'kpi', rank: 4, name: 'Number', category: 'live', icon: Gauge, w: 175, h: 105,
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
      // The jobs BEHIND the figure, for the click-through.
      const jobsBehind: Record<string, () => string[]> = {
        openTasks: () => [...new Set(c.assignments.filter(a => !a.completedAt).map(a => a.apartmentId))],
        overdue: () => [...new Set(c.assignments.filter(overdueOf).map(a => a.apartmentId))],
        jobs: () => c.jobs.map(j => j.id),
        dueToday: () => [...new Set(c.assignments
          .filter(a => !a.completedAt && a.dueDate === today()).map(a => a.apartmentId))],
      };
      return (
        <Frame title={d(el).title || 'Live count'} icon={Gauge}>
          {c.showList ? (
            <button data-no-drag data-el-action className="w-full text-left"
              title="Show the list behind this number"
              onClick={() => c.showList!(label, (jobsBehind[m] ?? jobsBehind.openTasks)())}>
              <Big value={n} sub={label} color={colour} />
            </button>
          ) : (
            <Big value={n} sub={label} color={colour} />
          )}
        </Frame>
      );
    },
  },
  {
    id: 'stage-legend', rank: 12, name: 'Stage legend', category: 'live', icon: BarChart3, w: 210, h: 175,
    blurb: 'Every stage with a live count, in the stage colours.',
    render: (_el, c) => (
      <Frame title="Stages" icon={BarChart3}>
        <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
          {c.stages.map(st => {
            const at = c.jobs.filter(j => j.currentStageId === st.id);
            const Row = c.showList ? 'button' as const : 'div' as const;
            return (
              <Row key={st.id} className="flex items-center gap-1.5 text-left w-full"
                {...(c.showList ? {
                  'data-no-drag': true, 'data-el-action': true,
                  title: `The ${at.length} at ${st.name}`,
                  onClick: () => c.showList!(st.name, at.map(j => j.id)),
                } : {})}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                <span className="text-[10.5px] text-gray-700 truncate flex-1">{st.name}</span>
                <span className="text-[10.5px] font-bold tabular-nums" style={{ color: st.color }}>{at.length}</span>
              </Row>
            );
          })}
          {c.stages.length === 0 && <span className="text-[10px] text-gray-400">No stages yet</span>}
        </div>
      </Frame>
    ),
  },
  {
    id: 'overdue-list', rank: 5, name: 'Running late', category: 'live', icon: AlertTriangle, w: 235, h: 175,
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
              if (!job) {
                return (
                  <span key={a.id} className="text-[10.5px] text-gray-400 truncate">
                    {a.taskDescription}
                  </span>
                );
              }
              return (
                <div key={a.id} className="flex items-center gap-1 min-w-0">
                  <span className="text-[9px] font-black text-red-600 tabular-nums w-7 flex-shrink-0">{days}d</span>
                  <div className="flex-1 min-w-0">
                    <MiniJob job={job} stages={c.stages} assignments={c.assignments}
                      onOpen={c.openJob} sub={a.taskDescription} />
                  </div>
                </div>
              );
            })}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'contractor-load', rank: 11, name: 'Contractor', category: 'live', icon: HardHat, w: 200, h: 110,
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
    id: 'week-ahead', rank: 9, name: 'Week ahead', category: 'live', icon: CalendarDays, w: 300, h: 130,
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
    id: 'recent-photos', rank: 8, name: 'Latest photos', category: 'live', icon: Camera, w: 235, h: 150,
    blurb: 'The newest pictures back from site — from every job, or only the ones you choose.',
    data: {},
    render: (el, c) => {
      // Narrowed to chosen jobs, or left open to everything. "Everything" is
      // the default because a wall widget with nothing configured should still
      // be showing you something.
      const only = (d(el).jobIds ?? []) as string[];
      const allowed = only.length ? new Set(only) : null;
      const recent = [...c.photos]
        .filter(p => p.storageUrl || p.driveUrl || p.dataUrl)
        .filter(p => {
          if (!allowed) return true;
          const a = c.assignments.find(x => x.id === p.assignmentId);
          return a ? allowed.has(a.apartmentId) : false;
        })
        .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''))
        .slice(0, Number(d(el).limit) || 6);
      return (
        <Frame title={(d(el).title as string) || (only.length ? `Photos · ${only.length} jobs` : 'Latest from site')}
          icon={Camera}>
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
    id: 'activity-feed', rank: 20, name: 'What changed', category: 'live', icon: Activity, w: 235, h: 150,
    blurb: 'The last few edits and who made them.',
    render: (_el, c) => (
      <Frame title="What changed" icon={Activity}>
        <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
          {c.logs.slice(0, 8).map(l => {
            const { who, parts, when } = describeActivity(l, c.jobs);
            return (
              <div key={l.id} className="text-[10px] leading-tight">
                <span className="text-gray-700">
                  <b className="text-gray-900">{who}</b>{' '}
                  {/* Not gated on `readOnly`: opening a job is not editing it,
                      and a view-only board is explicitly allowed to open one. */}
                  <ActivitySentence parts={parts} onOpen={c.openJob} />
                </span>
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
    id: 'progress-ring', rank: 18, name: 'Progress ring', category: 'live', icon: CircleDashed, w: 155, h: 155,
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
    id: 'bin-counter', rank: 17, name: 'Bin totals', category: 'live', icon: Archive, w: 200, h: 120,
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
    id: 'checklist', rank: 2, name: 'Checklist', category: 'plan', icon: ListChecks, w: 215, h: 185,
    blurb: 'Tickable list. For the things the app does not model.',
    data: { title: 'Checklist', items: [{ t: 'First item', done: false }] },
    render: (el, c) => {
      const items = (d(el).items ?? []) as { t: string; done: boolean }[];
      const set = (next: typeof items) => c.update({ data: { ...d(el), items: next } });
      const doneN = items.filter(i => i.done).length;
      // Red through amber to green as it fills. A count alone ("3/11") makes
      // you do the arithmetic; a bar that changes colour is read across a room.
      const pct = items.length ? (doneN / items.length) * 100 : 0;
      const bar = pct >= 100 ? '#16a34a' : pct >= 66 ? '#65a30d'
        : pct >= 33 ? '#d97706' : '#dc2626';
      return (
        <Frame title={`${d(el).title ?? 'Checklist'} · ${doneN}/${items.length}`} icon={ListChecks}
          tone={items.length ? bar : undefined}>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-1 flex-shrink-0">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: bar }} />
          </div>
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
    id: 'tally', rank: 9, name: 'Tally counter', category: 'plan', icon: Hash, w: 165, h: 115,
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
    id: 'progress-bar', rank: 10, name: 'Progress bar', category: 'plan', icon: BarChart3, w: 215, h: 95,
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
    id: 'table', rank: 12, name: 'Small table', category: 'plan', icon: Table2, w: 280, h: 165,
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
    id: 'order-list', rank: 13, name: 'Order tracker', category: 'plan', icon: ShoppingCart, w: 240, h: 185,
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
    id: 'week-planner', rank: 3, name: 'Week planner', category: 'plan', icon: CalendarRange, w: 400, h: 175,
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
    /**
     * The id stays 'rota' so every planner already on a board keeps its people
     * and its filled-in days. Only the name and the component changed.
     */
    id: 'rota', rank: 1, name: 'Weekly notebook', category: 'plan', icon: CalendarDays, w: 760, h: 340,
    blurb: 'People down the left, days across. Drag a job onto a day and it moves in; drop it on a '
      + 'second day for a ghost of the same job. Add weeks above and below as you go.',
    data: {
      span: 5, weekStart: 0, people: [], cells: {}, weekCount: 1,
      hebrew: true, holidays: { jewish: true, israeli: true }, askOnDrop: true,
      textSize: 11, dayNameSize: 11,
    },
    render: (el, c) => <PlannerHost el={el} c={c} />,
  },
  {
    id: 'milestones', rank: 4, name: 'Key dates', category: 'plan', icon: Flag, w: 225, h: 165,
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
    id: 'contact', rank: 1, name: 'Contact card', category: 'ref', icon: User2, w: 200, h: 115,
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
    id: 'link', rank: 2, name: 'Link tile', category: 'ref', icon: Link2, w: 185, h: 90,
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
    id: 'address', rank: 3, name: 'Address', category: 'ref', icon: MapPin, w: 200, h: 100,
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
    id: 'lined-note', rank: 4, name: 'Lined pad', category: 'ref', icon: StickyNote, w: 215, h: 190,
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
    id: 'contractor-links', rank: 19, name: 'Contractor links', category: 'live', icon: Copy, w: 250, h: 195,
    blurb: 'Every contractor with a one-tap copy of their portal link. New contractors appear on their own.',
    render: (_el, c) => <ContractorLinks contractors={c.contractors} assignments={c.assignments} />,
  },
  {
    id: 'stage-funnel', rank: 10, name: 'Stage funnel', category: 'live', icon: ListFilter, w: 260, h: 180,
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
    id: 'due-today', rank: 6, name: 'Due today', category: 'live', icon: CalendarCheck, w: 230, h: 165,
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
              if (!job) {
                return (
                  <span key={a.id} className="text-[10.5px] text-gray-400 truncate">{a.taskDescription}</span>
                );
              }
              return (
                <MiniJob key={a.id} job={job} stages={c.stages} assignments={c.assignments}
                  onOpen={c.openJob}
                  sub={con ? `${con.name} · ${a.taskDescription}` : a.taskDescription} />
              );
            })}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'job-list', rank: 7, name: 'Job list', category: 'live', icon: Filter, w: 235, h: 195,
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
              <MiniJob key={j.id} job={j} stages={c.stages} assignments={c.assignments} onOpen={c.openJob} />
            ))}
            {list.length === 0 && <span className="text-[10px] text-gray-400">Nothing here</span>}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'photo-review', rank: 16, name: 'Photos to review', category: 'live', icon: Camera, w: 195, h: 125,
    blurb: 'How many site photos nobody has looked at, and a way straight to the oldest one.',
    render: (_el, c) => {
      const waiting = c.photos.filter(p => !p.reviewedAt)
        .sort((a, b) => (a.uploadedAt ?? '').localeCompare(b.uploadedAt ?? ''));
      const n = waiting.length;
      // Reviewing itself lives in the job window's Photos tab — one place, not
      // two. So this counts, and then takes you there rather than growing a
      // second half-copy of the reviewing screen on the board.
      const oldest = waiting[0];
      const job = oldest
        ? c.jobs.find(j => j.id === c.assignments.find(a => a.id === oldest.assignmentId)?.apartmentId)
        : undefined;
      return (
        <Frame title="To review" icon={Camera} tone={n ? '#d97706' : undefined}>
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <Big value={n} sub={n === 1 ? 'photo waiting' : 'photos waiting'} color={n ? '#d97706' : '#16a34a'} />
            </div>
            {job && (
              <button data-no-drag data-el-action onClick={() => c.openJob(job.id)}
                className="text-[9.5px] text-left text-[#4aa8d8] hover:underline truncate flex-shrink-0"
                title="Opens the job — reviewing is on its Photos tab">
                Review in {job.displayName || 'the job'} → Photos
              </button>
            )}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'count-by-stage', rank: 15, name: 'Stage count', category: 'live', icon: Gauge, w: 185, h: 110,
    blurb: 'One big number: how many jobs sit at a chosen stage, across whichever jobs you pick.',
    data: {},
    render: (el, c) => {
      const st = c.stages.find(x => x.id === d(el).stageId) ?? c.stages[0];
      const only = (d(el).jobIds ?? []) as string[];
      const pool = only.length ? c.jobs.filter(j => only.includes(j.id)) : c.jobs;
      const at = st ? pool.filter(j => j.currentStageId === st.id) : [];
      const body = (
        <Big value={at.length} sub={only.length ? `of ${pool.length} chosen jobs` : 'jobs at this stage'}
          color={st?.color} />
      );
      return (
        <Frame title={st?.name ?? 'Stage'} icon={Gauge} tone={st?.color}>
          {c.showList && st ? (
            <button data-no-drag data-el-action className="w-full text-left"
              title="Show these jobs"
              onClick={() => c.showList!(st.name, at.map(j => j.id))}>
              {body}
            </button>
          ) : body}
        </Frame>
      );
    },
  },
  {
    id: 'recent-jobs', rank: 13, name: 'New this week', category: 'live', icon: Sparkles, w: 220, h: 160,
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
              <MiniJob key={j.id} job={j} stages={c.stages} assignments={c.assignments} onOpen={c.openJob}
                sub={j.createdAt
                  ? `added ${new Date(j.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                  : undefined} />
            ))}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'job-search', rank: 14, name: 'Find a job', category: 'live', icon: Search, w: 230, h: 160,
    blurb: 'Type a name and jump straight to the job.',
    render: (el, c) => (
      <JobSearch jobs={c.jobs} openJob={c.openJob} stages={c.stages} assignments={c.assignments}
        preset={String(d(el).sampleQuery ?? '') || undefined} />
    ),
  },
  {
    id: 'calculator', rank: 16, name: 'Calculator', category: 'plan', icon: Calculator, w: 190, h: 175,
    blurb: 'A plain calculator, for when the phone is across the room.',
    render: () => <CalcWidget />,
  },
  {
    id: 'converter', rank: 17, name: 'HVAC converter', category: 'plan', icon: ArrowRightLeft, w: 225, h: 165,
    blurb: 'BTU, kW, tons, metres, feet and degrees — the conversions this trade actually uses.',
    data: { kind: 'btu', v: '12000' },
    render: (el, c) => <Converter el={el} update={c.update} readOnly={c.readOnly} />,
  },
  {
    id: 'weekly-goal', rank: 11, name: 'Target', category: 'plan', icon: Target, w: 195, h: 120,
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
    id: 'team-today', rank: 6, name: 'On site today', category: 'plan', icon: Users, w: 215, h: 175,
    blurb: 'Who is where today. The question the office is asked most.',
    data: { rows: [{ who: '', where: '' }] },
    render: (el, c) => {
      const rows = (d(el).rows ?? []) as { who: string; where: string }[];
      const set = (next: typeof rows) => c.update({ data: { ...d(el), rows: next } });
      // Typing a contractor's name here picks up their colour automatically —
      // the same colour they have on the rota. Nothing to configure: it matches
      // on the name, and falls back to a colour derived from whatever is typed.
      const colourFor = (who: string) => {
        const hit = c.contractors.find(x => x.name.toLowerCase() === who.trim().toLowerCase());
        return who.trim() ? personColor(hit?.name ?? who, hit?.color) : '#e2e8f0';
      };
      return (
        <Frame title="On site today" icon={Users}>
          <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colourFor(r.who) }} />
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
    id: 'timeline', rank: 5, name: 'Timeline', category: 'plan', icon: GitCommitHorizontal, w: 380, h: 110,
    blurb: 'Laid out left to right with today marked — from the tasks on the calendar, '
      + 'or from dates you type in.',
    data: { source: 'tasks', items: [] },
    render: (el, c) => {
      /**
       * Where the marks come from.
       *
       * It used to say "Add dates in Key dates style", which named a thing that
       * did not exist anywhere in the app — there was no way to add a date to a
       * timeline at all. It now reads the calendar (every task with a due date)
       * by default, and typing your own dates is the alternative, chosen in its
       * settings.
       */
      const source = (d(el).source as string) || 'tasks';
      const items = source === 'own'
        ? ((d(el).items ?? []) as { t: string; on: string }[])
        : c.assignments
          .filter(a => a.dueDate)
          .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
          .slice(0, 14)
          .map(a => ({
            t: c.jobs.find(j => j.id === a.apartmentId)?.displayName || a.taskDescription || 'Task',
            on: a.dueDate!,
          }));
      const dated = items.filter(i => i.on).map(i => ({ ...i, ms: new Date(i.on).getTime() }));
      /**
       * One mark per DAY, labels on alternating rows.
       *
       * Every task drew its own label on the same line, so three tasks due the
       * same day printed three names on top of each other — unreadable on any
       * busy week, which is exactly the week a timeline is for. A day's mark
       * now carries its first name plus "+n", and neighbouring marks take
       * turns between the upper and lower row so close dates stay legible.
       */
      const byDay = new Map<string, { t: string; on: string; ms: number; n: number }>();
      for (const i of dated) {
        const key = i.on.slice(0, 10);
        const cur = byDay.get(key);
        if (cur) cur.n++;
        else byDay.set(key, { t: i.t, on: i.on, ms: i.ms, n: 1 });
      }
      const marks = [...byDay.values()].sort((a, b) => a.ms - b.ms);
      const lo = Math.min(Date.now(), ...dated.map(i => i.ms));
      const hi = Math.max(Date.now(), ...dated.map(i => i.ms));
      const at = (ms: number) => (hi === lo ? 50 : ((ms - lo) / (hi - lo)) * 100);
      return (
        <Frame title="Timeline" icon={GitCommitHorizontal}>
          <div className="relative h-full">
            <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-200" />
            <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-red-500"
              style={{ left: `${at(Date.now())}%` }} title="today" />
            {marks.map((i, k) => (
              <div key={k} className="absolute -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${at(i.ms)}%`, top: k % 2 ? '46%' : 0 }}
                title={i.n > 1 ? `${i.n} tasks on this day` : i.t}>
                <div className="text-[9px] text-gray-600 whitespace-nowrap max-w-[90px] truncate">
                  {i.t}{i.n > 1 ? ` +${i.n - 1}` : ''}
                </div>
                <div className="w-2 h-2 rounded-full bg-[#1e3a5f] mx-auto mt-1" />
                <div className="text-[8px] text-gray-400 whitespace-nowrap mt-0.5">
                  {new Date(i.on).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </div>
              </div>
            ))}
            {dated.length === 0 && (
              <span className="text-[10px] text-gray-400">
                {source === 'own'
                  ? 'No dates typed in yet — add them in this widget’s settings.'
                  : 'Nothing on the calendar with a date yet.'}
              </span>
            )}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'multi-timer', rank: 14, name: 'Several timers', category: 'plan', icon: TimerReset, w: 215, h: 170,
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
    id: 'handover', rank: 5, name: 'Shift handover', category: 'ref', icon: ListChecks, w: 240, h: 185,
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
    id: 'w-countdown', rank: 7, name: 'Countdown', category: 'plan', icon: Timer, w: 190, h: 96,
    blurb: 'Counts down to a date and turns amber, then red, as it arrives.',
    data: {},
    render: (el, c) => <CountdownInner el={el} update={c.update} readOnly={c.readOnly} />,
  },
  {
    id: 'w-stopwatch', rank: 15, name: 'Stopwatch', category: 'plan', icon: Clock3, w: 190, h: 96,
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
    /**
     * Find a job by a name nobody can spell, in a language nobody typed.
     *
     * The office types Hebrew, the plans are in English, and half the families
     * exist in both — so this matches on how a name SOUNDS rather than how it
     * is written. "Artzi" finds ארצי, ארצי finds "Artzi", and "Arzi" finds
     * both. Big enough to actually use, and a result opens the job.
     */
    id: 'job-find', rank: 3, name: 'Find a job', category: 'live', icon: Search,
    w: 340, h: 300,
    blurb: 'Search every job by name, number or address. Finds Hebrew names when you type '
      + 'English and the other way round, and copes with a spelling that is nearly right.',
    data: {},
    render: (el, c) => <JobFinder el={el} ctx={c} />,
  },
  {
    /**
     * The sticky pad, with its cork board behind it.
     *
     * The Note button on the rail makes one of these; it is registered here as
     * well so it can be found in the store and put on any board, including the
     * dashboard and the wall.
     */
    id: 'sticky-pad', rank: 1, name: 'Sticky note', category: 'visual', icon: StickyNote,
    w: 260, h: 300,
    blurb: 'One sticky note, on the board. Bold, bullets and tick-boxes, six colours, and a '
      + 'corner that folds up to put a fresh note beside it.',
    // '' rather than undefined: fsSet's sanitiser turns a TOP-LEVEL undefined
    // into deleteField(), but this one is nested inside `data`, where it stays
    // undefined — and Firestore rejects the whole write. The note pad would
    // then save on this device and silently never reach any other.
    data: { notes: [], openId: '' },
    render: (el, c) => (
      <StickyNoteWidget el={el} readOnly={c.readOnly} isRtl={c.isRtl} update={c.update}
        onSpawn={c.readOnly ? undefined : colour => spawnStickyBeside(el, colour)} />
    ),
  },
  {
    /**
     * The cork board on its own.
     *
     * It was only ever reachable from inside one pad, which made it the wrong
     * shape for what people use it for: the question is "what has anybody
     * written down?", and that spans every pad on the board rather than the one
     * you happen to be holding. Placed on its own it answers that in a glance.
     */
    id: 'notes-board', rank: 2, name: 'Notes board', category: 'visual', icon: Pin,
    w: 340, h: 300,
    blurb: 'Every note on this board, pinned up on cork. New note puts a fresh note on the '
      + 'board beside it, and clicking one pinned up opens it on its own pad.',
    data: {},
    render: (el, c) => <NotesBoard el={el} ctx={c} />,
  },
  {
    id: 'w-title', rank: 1, name: 'Heading', category: 'visual', icon: Type, w: 280, h: 48,
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

  /**
   * How another workspace is doing, on this board.
   *
   * The one widget that deliberately looks OUTSIDE the workspace it sits in.
   * Everything else on a job board reads the job board; this reads Wolfson or
   * Netiv, so the office can keep an eye on a building project without leaving
   * the board they work on.
   */
  {
    id: 'project-glance', rank: 21, name: 'Another workspace', category: 'live',
    icon: Building, w: 250, h: 165,
    blurb: 'A live summary of one of your other workspaces — its stages, its counts, its progress.',
    data: {},
    render: (el, c) => <ProjectGlance el={el} ctx={c} />,
  },

  /**
   * A group, from the shelf.
   *
   * The four that ship with the board — Done, Ready, Archive, Trash — are
   * ordinary CanvasElements with a `binKind`, so there was never anything
   * special about them except that only they existed. This is the same thing
   * without one: your own group, with your own name, colour and board, and
   * optionally standing for a stage.
   *
   * It is placed as `type: 'bin'` rather than as a widget wrapper, exactly the
   * way clip art is placed as `type: 'clipart'` — a wrapper would inherit the
   * widget chrome and none of the drop-target behaviour.
   */
  {
    id: 'add-bin', rank: 8, name: 'Group', category: 'plan', icon: FolderPlus, w: 178, h: 92,
    blurb: 'A place to file jobs — like Done or Archive, but yours. Give it a name, a colour, '
      + 'and optionally a stage so filing a job here also moves it to that stage.',
    data: {},
    render: () => (
      <div className="w-full h-full flex flex-col items-start justify-center px-3 rounded-xl"
        style={{ border: '2px dashed #cbd5e1', backgroundColor: 'rgba(255,255,255,.82)' }}>
        <span className="flex items-center gap-1.5 font-extrabold text-[12.5px]" style={{ color: '#7c3aed' }}>
          <FolderPlus size={14} /> Ready to price
        </span>
        <span className="text-[11px] text-gray-500 mt-0.5">6 jobs</span>
        <span className="text-[9px] text-gray-400 mt-0.5">Click to open · drag jobs in</span>
      </div>
    ),
  },

  // ── Look & feel ───────────────────────────────────────────────────────────
  {
    id: 'clock', rank: 7, name: 'Wall clock', category: 'visual', icon: Clock3, w: 190, h: 110,
    blurb: 'Time and date, big enough to read across the office.',
    render: () => <ClockWidget />,
  },
  {
    id: 'banner', rank: 2, name: 'Banner', category: 'visual', icon: Megaphone, w: 340, h: 62,
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
    id: 'project-mini', rank: 1, name: 'Building progress', category: 'live',
    icon: Building, w: 250, h: 165,
    blurb: 'The building diagram in miniature, every unit in its stage colour. Pick which '
      + 'workspace — put three side by side and the whole company is on one screen.',
    data: {},
    render: (el, c) => (
      <ProjectMini projectId={String(d(el).projectId || '')}
        buildingId={String(d(el).buildingId || '') || undefined}
        sample={!!d(el).sample}
        onOpen={c.openProject} onOpenUnit={c.openUnit} />
    ),
  },
  {
    id: 'board-mini', rank: 2, name: "Someone's board", category: 'live', icon: Briefcase,
    w: 380, h: 260,
    blurb: 'A live miniature of a board you choose — yours, the main one, or any shared with you. '
      + 'Scroll to zoom inside it, drag to move around, double-click a job to open it.',
    data: {},
    render: (el, c) => (
      <BoardMini el={el} jobs={c.jobs} stages={c.stages} onOpen={c.openJob}
        update={c.update} readOnly={c.readOnly} />
    ),
  },
  {
    id: 'calendar-mini', rank: 3, name: 'Calendar', category: 'live', icon: CalendarDays, w: 220, h: 185,
    blurb: 'This month, with the busy days marked. Opens the full calendar.',
    render: (_el, c) => <CalendarMini assignments={c.assignments} jobs={c.jobs} />,
  },
  {
    id: 'divider', rank: 3, name: 'Divider', category: 'visual', icon: Minus, w: 340, h: 34,
    blurb: 'A rule across the board, with a word on it if you want one. Separates without moving anything.',
    data: {},
    render: (el, c) => {
      const text = String(d(el).text ?? '');
      const tone = el.color && el.color !== '#ffffff' ? el.color : '#94a3b8';
      return (
        <div className="w-full h-full flex items-center gap-2 px-2">
          <span className="flex-1 h-px" style={{ backgroundColor: tone, opacity: 0.5 }} />
          {(text || !c.readOnly) && (
            <Line value={text} readOnly={c.readOnly} placeholder="…"
              onChange={v => c.update({ data: { ...d(el), text: v } })}
              className="text-[10px] font-black tracking-widest uppercase text-center"
            />
          )}
          <span className="flex-1 h-px" style={{ backgroundColor: tone, opacity: 0.5 }} />
        </div>
      );
    },
  },
  {
    id: 'quote', rank: 4, name: 'Message', category: 'visual', icon: MessageSquareQuote, w: 300, h: 130,
    blurb: 'Something worth saying, in big type — a reminder, a safety note, a thank you.',
    data: {},
    render: (el, c) => (
      <div className="w-full h-full flex flex-col justify-center px-3 py-2">
        <Line value={String(d(el).text ?? '')} readOnly={c.readOnly}
          placeholder="Say something"
          onChange={v => c.update({ data: { ...d(el), text: v } })}
          className="text-[15px] font-bold text-slate-800 leading-snug" />
        <Line value={String(d(el).by ?? '')} readOnly={c.readOnly} placeholder="— who said it"
          onChange={v => c.update({ data: { ...d(el), by: v } })}
          className="text-[10px] text-slate-400 mt-1" />
      </div>
    ),
  },
  {
    id: 'legend', rank: 5, name: 'Colour key', category: 'visual', icon: Palette, w: 200, h: 150,
    blurb: 'What the colours on this board mean. A key you write yourself, for a code the app does not know.',
    data: { rows: [{ c: '#dc2626', t: '' }] },
    render: (el, c) => {
      const rows = (d(el).rows ?? []) as { c: string; t: string }[];
      const set = (next: typeof rows) => c.update({ data: { ...d(el), rows: next } });
      const CHOICES = ['#dc2626', '#d97706', '#16a34a', '#4aa8d8', '#7c3aed', '#0f172a'];
      return (
        <Frame title="Key" icon={Palette}>
          <div className="flex flex-col gap-1 h-full overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <button
                  data-no-drag data-el-action
                  disabled={c.readOnly}
                  onClick={() => {
                    const at = CHOICES.indexOf(r.c);
                    set(rows.map((x, j) => (j === i
                      ? { ...x, c: CHOICES[(at + 1) % CHOICES.length] } : x)));
                  }}
                  title="Click for the next colour"
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: r.c }}
                />
                <Line value={r.t} readOnly={c.readOnly} placeholder="means…"
                  onChange={v => set(rows.map((x, j) => (j === i ? { ...x, t: v } : x)))}
                  className="text-[10.5px] text-gray-700 flex-1" />
              </div>
            ))}
            {!c.readOnly && (
              <button data-no-drag data-el-action
                onClick={() => set([...rows, { c: '#16a34a', t: '' }])}
                className="text-[10px] text-gray-400 hover:text-gray-600 text-left">+ add</button>
            )}
          </div>
        </Frame>
      );
    },
  },
  {
    id: 'photo', rank: 6, name: 'Photo', category: 'visual', icon: ImageIcon, w: 215, h: 160,
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
 * A live look at a different workspace.
 *
 * Reads that workspace's own cached data rather than the one you are in, which
 * is the whole point — and it says plainly when the cache is all it has, because
 * only the workspace you are actually in syncs live.
 */
function ProjectGlance({ el, ctx }: { el: CanvasElement; ctx: WidgetCtx }) {
  const pid = (el.data as Record<string, unknown> | undefined)?.projectId as string | undefined;
  /** The store sets this: with no snapshot to draw, show a FULL fake summary
      (marked as sample) instead of a dash — a dash on a shelf reads as broken. */
  const wantSample = !!(el.data as Record<string, unknown> | undefined)?.sample;
  const { projects, currentProjectId, apartments, stages: allStages } = useStore();
  const p = projects.find(x => x.id === pid);

  // The workspace you are IN is live; any other is read from what this machine
  // last stored for it.
  const live = pid === currentProjectId;
  const snap = React.useMemo(() => {
    if (live) {
      return {
        apts: apartments.filter(isCountableApartment),
        stages: allStages.filter(st => st.active && (pid === 'general' ? st.projectId === 'general' : !st.projectId)),
      };
    }
    try {
      const raw = localStorage.getItem(`${pid}_app_data`);
      if (!raw) return null;
      const d = JSON.parse(raw) as { apartments?: Apartment[]; stages?: Stage[] };
      return {
        apts: (d.apartments ?? []).filter(isCountableApartment),
        stages: (d.stages ?? allStages).filter(st => st.active),
      };
    } catch { return null; }
  }, [pid, live, apartments, allStages]);

  // The store's full-fake mode: nothing stored for that workspace on this
  // machine (or none picked at all) still shows a busy, labelled summary.
  const sampleMode = wantSample && (!p || !snap || snap.apts.length === 0);
  if (sampleMode) {
    const name = p?.name ?? 'Wolfson Residence';
    const tone = p?.color ?? '#b8860b';
    const rows: [string, string, number][] = [
      ['Piping', '#0ea5e9', 14], ['Concealed Units', '#f59e0b', 11],
      ['Wiring', '#f43f5e', 9], ['Grilles & Vents', '#10b981', 6], ['Start-up', '#16a34a', 2],
    ];
    return (
      <Frame title={name} icon={Building} tone={tone}>
        <div className="h-full flex flex-col gap-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-black tabular-nums" style={{ fontSize: 26, color: tone }}>42</span>
            <span className="text-[11px] text-gray-400">of 56 started</span>
            <span className="ml-auto text-[11px] font-bold" style={{ color: tone }}>75%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
            <div className="h-full rounded-full" style={{ width: '75%', backgroundColor: tone }} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-0.5">
            {rows.map(([nm, c, n]) => (
              <div key={nm} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                <span className="text-[10px] text-gray-600 truncate flex-1">{nm}</span>
                <span className="text-[10px] font-bold tabular-nums" style={{ color: c }}>{n}</span>
              </div>
            ))}
          </div>
          <span className="text-[8.5px] text-gray-300 flex-shrink-0">sample data</span>
        </div>
      </Frame>
    );
  }

  if (!p) {
    return (
      <Frame title="Another workspace" icon={Building}>
        <span className="text-[10px] text-gray-400">Pick a workspace in its settings</span>
      </Frame>
    );
  }
  if (!snap) {
    return (
      /* A dash, not an explanation. The card knows nothing about this
         workspace yet; saying so in a sentence puts an apology on the board
         where a figure belongs. The reason lives in the tooltip. */
      <Frame title={p.name} icon={Building} tone={p.color}>
        <span className="text-[22px] font-black text-gray-300"
          title={`Open ${p.shortName ?? p.name} once and its figures appear here.`}>
          —
        </span>
      </Frame>
    );
  }

  const total = snap.apts.length;
  const started = snap.apts.filter(a => a.currentStageId).length;
  const pct = total ? Math.round((started / total) * 100) : 0;

  return (
    <Frame title={p.name} icon={Building} tone={p.color}>
      <div className="h-full flex flex-col gap-1.5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-black tabular-nums" style={{ fontSize: 26, color: p.color }}>{started}</span>
          <span className="text-[11px] text-gray-400">of {total} started</span>
          <span className="ml-auto text-[11px] font-bold" style={{ color: p.color }}>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden flex-shrink-0">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-0.5">
          {snap.stages.slice(0, 8).map(st => {
            const n = snap.apts.filter(a => a.currentStageId === st.id).length;
            if (!n) return null;
            return (
              <div key={st.id} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                <span className="text-[10px] text-gray-600 truncate flex-1">{st.name}</span>
                <span className="text-[10px] font-bold tabular-nums" style={{ color: st.color }}>{n}</span>
              </div>
            );
          })}
        </div>
        {!live && (
          <span className="text-[8.5px] text-gray-300 flex-shrink-0">
            as this machine last saw it
          </span>
        )}
      </div>
    </Frame>
  );
}

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
  const portalDomain = useStore(st => (st.boardSettings.__tv ?? {}).portalDomain);
  const active = contractors.filter(c => c.active);

  function copy(c: Contractor) {
    // Through the same helper as settings, so the board widget can never hand
    // out a different address from the one settings promises.
    const url = portalLink(c.token, portalDomain);
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
              {/* Their own colour, the one they carry on the rota and wherever
                  else they appear — set on their avatar in app settings. */}
              <span className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: personColor(c.name, c.color) }} />
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

function JobSearch({ jobs, openJob, stages, assignments, preset }: {
  jobs: Apartment[]; openJob: (id: string) => void;
  stages: Stage[]; assignments: ContractorAssignment[];
  /** The store seeds a query so the preview shows results, not an empty box. */
  preset?: string;
}) {
  const [q, setQ] = useState(preset ?? '');
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
            <MiniJob key={j.id} job={j} stages={stages} assignments={assignments} onOpen={openJob}
              sub={j.address || undefined} />
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
      {/* The keypad scrolls rather than losing its bottom row. Squeezed to a
          third of its size it is an awkward calculator, but it is still a
          calculator — before this the clear key simply was not there. */}
      <div className="grid grid-cols-4 gap-0.5 flex-1 min-h-0 overflow-auto widget-scroll">
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

export function useTick(on = true, everyMs = 1000) {
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
  // Fireworks for the first hour after it lands. Long enough that the room sees
  // it, short enough that a countdown left up from last month is not still
  // celebrating a fortnight later.
  const justLanded = past && ms > -3_600_000;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-2 relative overflow-hidden">
      {justLanded && <Fireworks />}
      <Line value={(data.title as string) ?? ''} readOnly={readOnly} placeholder="Countdown"
        onChange={v => update({ data: { ...data, title: v } })}
        className="text-[10px] font-bold text-gray-500 text-center" />
      <div className="font-black tabular-nums leading-none mt-1" style={{ color: colour, fontSize: 22 }}>
        {dd > 0 ? `${dd}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}:${String(ss).padStart(2, '0')}`}
      </div>
      <div className="text-[9px] text-gray-400 mt-0.5">
        {justLanded ? 'that is time 🎉' : past ? 'overdue' : 'remaining'}
      </div>
    </div>
  );
}

/**
 * A small burst, for the moment a countdown reaches zero.
 *
 * Pure CSS on a handful of spans rather than a canvas or a library: it has to
 * be able to run on the wallboard next to twenty other widgets without costing
 * anything, and a burst of twelve dots is all the occasion needs.
 */
function Fireworks() {
  const sparks = Array.from({ length: 12 }, (_, i) => i);
  const COLORS = ['#f59e0b', '#ef4444', '#4aa8d8', '#22c55e', '#a855f7', '#ec4899'];
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {sparks.map(i => {
        const angle = (i / sparks.length) * Math.PI * 2;
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: '50%', top: '50%', width: 5, height: 5,
              backgroundColor: COLORS[i % COLORS.length],
              animation: `wf-spark 1.6s ease-out ${(i % 4) * 0.28}s infinite`,
              // Each spark carries its own direction; the keyframes just play it.
              ['--wf-x' as string]: `${Math.cos(angle) * 46}px`,
              ['--wf-y' as string]: `${Math.sin(angle) * 46}px`,
            }}
          />
        );
      })}
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
  { id: 'x3', name: 'Concealed Units', color: '#f59e0b', order: 3, active: true, description: '', createdAt: '', updatedAt: '' },
  { id: 'x4', name: 'Wiring', color: '#f43f5e', order: 4, active: true, description: '', createdAt: '', updatedAt: '' },
  { id: 'x5', name: 'Grilles & Vents', color: '#10b981', order: 5, active: true, description: '', createdAt: '', updatedAt: '' },
  { id: 'x6', name: 'Start-up', color: '#16a34a', order: 6, active: true, description: '', createdAt: '', updatedAt: '' },
] as unknown as Stage[];

/**
 * Stand-in jobs — a board that reads FULL, per the owner: "no one can
 * understand how they will actually look when data is full", so the fake board
 * is a busy one, not a minimal one.
 *
 * They carry a FLOOR because "Floor by floor" reads one, DRIVE LINKS on most
 * (so every Drive light and folder chip previews lit), a PHONE, and one plan
 * link — so "On site without a plan" flags SOME rows rather than all of them.
 * `j8` is deliberately started but unbooked and `j7` is deliberately a
 * near-miss of `j1`, so "Nobody's booked" and "Possible duplicates" each have
 * an honest row to draw.
 */
const gdrive = (n: number) => `https://drive.google.com/drive/folders/sample${n}`;
const SAMPLE_JOBS: Apartment[] = [
  { id: 'j1', displayName: 'Artzi, Avital', address: '14 Ben Gurion, Jerusalem', currentStageId: 'x2', floor: 3, driveLink: gdrive(1), plansPdfLink: 'https://drive.google.com/file/d/sampleplan1/view', phone: '052-700-0001' },
  { id: 'j2', displayName: 'Cohen, Miriam', address: '3 Herzl, Ramat Gan', currentStageId: 'x3', floor: 3, driveLink: gdrive(2), phone: '054-311-0202' },
  { id: 'j3', displayName: 'Levi, Yosef', address: '88 Dizengoff, Tel Aviv', currentStageId: 'x1', floor: 4, driveLink: gdrive(3) },
  { id: 'j4', displayName: 'Mizrahi, Dana', address: '5 Rothschild, Rishon', currentStageId: 'x6', floor: 4, driveLink: gdrive(4), phone: '050-556-7788' },
  { id: 'j5', displayName: 'Peretz, Eli', address: '21 Allenby, Tel Aviv', currentStageId: 'x2', floor: 5, driveLink: gdrive(5) },
  { id: 'j6', displayName: 'Shapiro, Ruth', address: '9 Bialik, Givatayim', currentStageId: 'x3', boardBin: 'done', floor: 5, driveLink: gdrive(6) },
  { id: 'j7', displayName: 'Arzi, Avital', address: '14 Ben Gurion, Jerusalem', currentStageId: 'x2', floor: 6 },
  { id: 'j8', displayName: 'Goodhardt, Nechama', address: '2 Weizmann, Rehovot', currentStageId: 'x1', floor: 6 },
  { id: 'j9', displayName: 'Friedman, Shmuel', address: '17 Jabotinsky, Bnei Brak', currentStageId: 'x5', floor: 7, driveLink: gdrive(9), phone: '053-980-4141' },
  { id: 'j10', displayName: 'Ben-David, Rivka', address: '31 HaPalmach, Jerusalem', currentStageId: 'x4', floor: 7, driveLink: gdrive(10) },
].map(j => ({ ...j, buildingId: 'G', isUnnamed: false, createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() })) as unknown as Apartment[];

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** The same day counted locally — the planner's convention. */
const localDay = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const SAMPLE_TASKS: ContractorAssignment[] = [
  { id: 't1', apartmentId: 'j1', contractorId: 'k1', taskDescription: 'Hang the concealed units', dueDate: day(-6), createdAt: ago(11), priority: 'urgent' },
  { id: 't2', apartmentId: 'j3', contractorId: 'k2', taskDescription: 'Duct run, floors 3–4', dueDate: day(-2), createdAt: ago(9) },
  // THREE due today — a "Due today" preview with one row reads as a quiet day,
  // and the shelf is meant to show a full one.
  { id: 't3', apartmentId: 'j2', contractorId: 'k1', taskDescription: 'Fit the grilles', dueDate: day(0), createdAt: ago(4) },
  { id: 't8', apartmentId: 'j9', contractorId: 'k2', taskDescription: 'Gas top-up and leak test', dueDate: day(0), createdAt: ago(2), priority: 'urgent' },
  { id: 't9', apartmentId: 'j10', contractorId: 'k3', taskDescription: 'Crane for the roof units', dueDate: day(0), createdAt: ago(5) },
  { id: 't10', apartmentId: 'j5', contractorId: 'k1', taskDescription: 'Balance the system', dueDate: day(1), createdAt: ago(1) },
  { id: 't4', apartmentId: 'j4', contractorId: 'k3', taskDescription: 'Commissioning', dueDate: day(2), createdAt: ago(3) },
  { id: 't5', apartmentId: 'j5', contractorId: 'k2', taskDescription: 'Thermostats', dueDate: day(4), createdAt: ago(12) },
  // Deliberately dateless. Every other list keys off a due date, so these two
  // are invisible everywhere except the widget written to find them.
  { id: 't6', apartmentId: 'j2', contractorId: 'k3', taskDescription: 'Chase the lift booking', dueDate: null, createdAt: ago(16) },
  { id: 't7', apartmentId: 'j3', contractorId: 'k1', taskDescription: 'Order the grilles', dueDate: null, createdAt: ago(6) },
] as unknown as ContractorAssignment[];

/** Work already finished, spread across this week, for the bar chart. */
const SAMPLE_DONE: ContractorAssignment[] = [
  { createdAt: ago(6), id: 'td1', apartmentId: 'j1', contractorId: 'k1', taskDescription: 'First fix', completed: true, completedAt: `${localDay(-1)}T09:10:00.000Z` },
  { createdAt: ago(6), id: 'td2', apartmentId: 'j2', contractorId: 'k2', taskDescription: 'Drops', completed: true, completedAt: `${localDay(-1)}T14:20:00.000Z` },
  { createdAt: ago(7), id: 'td3', apartmentId: 'j3', contractorId: 'k1', taskDescription: 'Grilles', completed: true, completedAt: `${localDay(-2)}T11:00:00.000Z` },
  { createdAt: ago(8), id: 'td4', apartmentId: 'j4', contractorId: 'k3', taskDescription: 'Snagging', completed: true, completedAt: `${localDay(-3)}T16:40:00.000Z` },
  { createdAt: ago(5), id: 'td5', apartmentId: 'j5', contractorId: 'k2', taskDescription: 'Thermostats', completed: true, completedAt: `${localDay(0)}T08:05:00.000Z` },
] as unknown as ContractorAssignment[];

const SAMPLE_CONTRACTORS: Contractor[] = [
  { id: 'k1', name: 'Avi Drywall', category: 'drywall', token: 'sample1', active: true, email: '', createdAt: '' },
  { id: 'k2', name: 'Moshe AC', category: 'ac', token: 'sample2', active: true, email: '', createdAt: '' },
  { id: 'k3', name: 'Yoni General', category: 'general', token: 'sample3', active: true, email: '', createdAt: '' },
] as unknown as Contractor[];

const SAMPLE_LOGS: ActivityLog[] = [
  { id: 'g0', userName: 'Esther', apartmentId: 'j9', apartmentNumber: 'Friedman, Shmuel', actionType: 'update',
    fieldChanged: 'currentStageId', previousValue: 'Wiring', newValue: 'Grilles & Vents',
    createdAt: new Date(Date.now() - 3 * 60_000).toISOString() },
  { id: 'g1', userName: 'Esther', apartmentId: 'j1', apartmentNumber: 'Artzi, Avital', actionType: 'update',
    fieldChanged: 'currentStageId', previousValue: 'Survey', newValue: 'Piping',
    createdAt: new Date(Date.now() - 12 * 60_000).toISOString() },
  { id: 'g5', userName: 'Yitzchak', apartmentId: 'j10', apartmentNumber: 'Ben-David, Rivka', actionType: 'update',
    fieldChanged: 'generalNotes', previousValue: '', newValue: 'Crane booked for Thursday morning',
    createdAt: new Date(Date.now() - 41 * 60_000).toISOString() },
  { id: 'g2', userName: 'Yitzchak', apartmentId: 'j4', apartmentNumber: 'Mizrahi, Dana', actionType: 'update',
    fieldChanged: 'address', previousValue: '', newValue: '5 Rothschild, Rishon',
    createdAt: new Date(Date.now() - 95 * 60_000).toISOString() },
  { id: 'g6', userName: 'Esther', apartmentId: 'j2', apartmentNumber: 'Cohen, Miriam', actionType: 'update',
    fieldChanged: 'displayName', previousValue: 'Cohen', newValue: 'Cohen, Miriam',
    createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString() },
  // Two moves on the same job, the second jumping two stages ahead — which is
  // what "Skipped a stage" reads. One move on its own can never show a skip,
  // because there is nothing to have skipped FROM.
  { id: 'g3', userName: 'Esther', apartmentId: 'j2', apartmentNumber: 'Cohen, Miriam', actionType: 'update',
    fieldChanged: 'currentStageId', previousValue: '', newValue: 'Survey',
    createdAt: new Date(Date.now() - 9 * 86_400_000).toISOString() },
  { id: 'g4', userName: 'Yitzchak', apartmentId: 'j2', apartmentNumber: 'Cohen, Miriam', actionType: 'update',
    fieldChanged: 'currentStageId', previousValue: 'Survey', newValue: 'Start-up',
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
] as unknown as ActivityLog[];

/**
 * Stand-in site photos.
 *
 * `photos` was the one context field with no sample, so "Latest photos" and
 * "Photos to review" were the two widgets that previewed empty on every board
 * that had not yet had a picture come back from site — which is every new board.
 */
const shot = (a: string, b: string, roof: string) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
       <rect width="120" height="120" fill="${a}"/>
       <rect y="74" width="120" height="46" fill="${b}"/>
       <rect x="18" y="30" width="34" height="44" fill="${roof}"/>
       <rect x="62" y="44" width="40" height="30" fill="${roof}" opacity=".75"/>
       <circle cx="96" cy="24" r="10" fill="#ffffff" opacity=".55"/>
     </svg>`);

/**
 * Sample photos, each ATTACHED TO A TASK.
 *
 * The photo wall groups pictures under the job they came from, which it works
 * out photo → assignment → apartment. Sample photos with no `assignmentId`
 * belong to no job, so every one of them was dropped and the wall previewed as
 * "No photos yet" — a widget that looked broken on the shelf.
 */
const SAMPLE_PHOTOS: ContractorPhoto[] = [
  { id: 'p1', assignmentId: 't1', dataUrl: shot('#bfdbfe', '#cbd5e1', '#64748b'), uploadedAt: new Date(Date.now() - 3_600_000).toISOString() },
  { id: 'p2', assignmentId: 't1', dataUrl: shot('#bbf7d0', '#d1d5db', '#475569'), uploadedAt: new Date(Date.now() - 9_000_000).toISOString() },
  { id: 'p3', assignmentId: 't2', dataUrl: shot('#fde68a', '#e2e8f0', '#78716c'), uploadedAt: new Date(Date.now() - 26_000_000).toISOString() },
  { id: 'p4', assignmentId: 't2', dataUrl: shot('#fecaca', '#cbd5e1', '#57534e'), uploadedAt: new Date(Date.now() - 51_000_000).toISOString() },
  { id: 'p5', assignmentId: 't3', dataUrl: shot('#ddd6fe', '#d1d5db', '#52525b'), uploadedAt: new Date(Date.now() - 76_000_000).toISOString() },
  { id: 'p6', assignmentId: 't4', dataUrl: shot('#a5f3fc', '#e5e7eb', '#3f3f46'), uploadedAt: new Date(Date.now() - 99_000_000).toISOString() },
] as unknown as ContractorPhoto[];

/**
 * A planner with somebody on it, for the two wall widgets that read one.
 *
 * "Out today" and "Tomorrow" draw from whatever planner is on the board. On
 * the shelf there is no board, so both previewed as "Nothing on the planner
 * for that day" — which is exactly what they say when they are working
 * correctly and there is nothing on, so the shelf could not tell you what
 * they were for.
 */
function samplePlanner(jobs: Apartment[], people: Contractor[]): CanvasElement {
  // Built from whatever the preview ENDED UP with, not from the sample ids.
  // A machine with two real contractors and three real jobs keeps them, and a
  // planner naming `k1` and `j1` then resolved to nothing — so the card read
  // "Someone · a job" three times over, which looks like a fault.
  const who = people.slice(0, 3).map(p => `c:${p.id}`);
  const what = jobs.slice(0, 5).map(j => j.id);
  const at = (p: number, dayOffset: number) => `${who[p % who.length]}|${localDay(dayOffset)}`;
  const cells: Record<string, { id: string; jobId?: string; text?: string }[]> = {};
  if (who.length && what.length) {
    cells[at(0, 0)] = [{ id: 's1', jobId: what[0] }];
    cells[at(1, 0)] = [{ id: 's2', jobId: what[1 % what.length] }, { id: 's3', text: 'Pardes 8 am' }];
    if (who.length > 2) cells[at(2, 0)] = [{ id: 's4', jobId: what[2 % what.length] }];
    cells[at(0, 1)] = [{ id: 's5', jobId: what[3 % what.length] }];
    cells[at(1, 1)] = [{ id: 's6', jobId: what[4 % what.length] }];
  }
  return {
    id: 'CE-sample-planner', type: 'widget', widget: 'rota',
    x: 0, y: 0, w: 900, h: 460, text: '', color: '#ffffff',
    // Local dates, because that is what the planner writes and what the two
    // wall widgets look up. `day()` above is UTC and is only right for due
    // dates, which are compared against other UTC strings.
    data: { title: 'Planner', people: who, cells },
  } as unknown as CanvasElement;
}

/**
 * Snags and a word back from site.
 *
 * Neither had a sample, so "Open snags" and "Gone quiet" both previewed as
 * their own success message — "no snags outstanding", "everyone has checked
 * in" — which is exactly what they say when they work and there is nothing to
 * report, and therefore tells a shopper nothing about what they do.
 */
const SAMPLE_PINS = [
  { id: 'pin1', apartmentId: 'j1', xPct: 32, yPct: 41, text: 'Grille clashes with the beam', createdAt: ago(4), createdBy: 'Esther' },
  { id: 'pin2', apartmentId: 'j1', xPct: 68, yPct: 22, text: 'Condensate run not shown', createdAt: ago(3), createdBy: 'Esther' },
  { id: 'pin3', apartmentId: 'j3', xPct: 51, yPct: 74, text: 'Access panel too small', createdAt: ago(2), createdBy: 'Yitzchak' },
] as unknown as PlanPin[];

const SAMPLE_NOTES = [
  { id: 'n1', assignmentId: 't3', apartmentId: 'j2', contractorId: 'k1', text: 'Grilles fitted, waiting on the trims.',
    authorType: 'contractor', authorId: 'k1', authorName: 'Avi Drywall', createdAt: ago(1) },
  { id: 'n2', assignmentId: 't8', apartmentId: 'j9', contractorId: 'k2', text: 'Pressure held overnight — topping up now.',
    authorType: 'contractor', authorId: 'k2', authorName: 'Moshe AC', createdAt: ago(0.2) },
] as unknown as ContractorNote[];

const SAMPLE_USERS = [
  { id: 'u1', name: 'Esther', code: '000000', role: 'admin', active: true, createdAt: '' },
  { id: 'u2', name: 'Yitzchak', code: '000000', role: 'admin', active: true, createdAt: '' },
] as unknown as WidgetCtx['users'];

/** Three people and a morning's taps, so the tap-in board has something to be. */
const SAMPLE_EMPLOYEES = [
  { id: 'w1', name: 'Yaakov', role: 'Installer', active: true, sortOrder: 0, createdAt: '' },
  { id: 'w2', name: 'Igor', role: 'Installer', active: true, sortOrder: 1, createdAt: '' },
  { id: 'w3', name: 'Dina', role: 'Office', active: true, sortOrder: 2, createdAt: '' },
  { id: 'w4', name: 'Moshe', role: 'Driver', active: true, sortOrder: 3, createdAt: '' },
] as unknown as Employee[];

const SAMPLE_PUNCHES = (() => {
  const day = localDay(0);
  const at = (h: number, m: number) => {
    const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString();
  };
  return [
    { id: 'tp1', employeeId: 'w1', day, at: at(7, 12), kind: 'in' },
    { id: 'tp2', employeeId: 'w2', day, at: at(7, 58), kind: 'in' },
  ] as unknown as TimePunch[];
})();

/** Real data where there is any, samples where there is not — field by field. */
export function withSampleData(ctx: WidgetCtx): WidgetCtx {
  const jobs = ctx.jobs.length ? ctx.jobs : SAMPLE_JOBS;
  const contractors = ctx.contractors.length ? ctx.contractors : SAMPLE_CONTRACTORS;

  /**
   * Sample rows are re-pointed at whatever is REALLY there.
   *
   * Each field falls back on its own, so a machine with three real jobs and no
   * tasks kept the real jobs and took the sample tasks — which name `j1`, a
   * job that does not exist here. Every widget that looks a task's job up then
   * printed "a job", which reads as a fault rather than as a sample. Spreading
   * them round the real ids costs nothing and makes the shelf tell the truth.
   */
  // Only when the jobs/contractors are REAL. When they are the samples too,
  // the tasks already point at exactly the jobs they were written for —
  // re-pointing by index would scramble the pin, note and photo chains that
  // hang off those pairings.
  const jobsAreSample = !ctx.jobs.length;
  const peopleAreSample = !ctx.contractors.length;
  const repoint = <T extends ContractorAssignment>(rows: T[]): T[] => rows.map((a, i) => ({
    ...a,
    apartmentId: jobsAreSample || !jobs.length ? a.apartmentId : jobs[i % jobs.length].id,
    contractorId: peopleAreSample || !contractors.length ? a.contractorId : contractors[i % contractors.length].id,
  }));

  const assignments = ctx.assignments.length ? ctx.assignments : repoint(SAMPLE_TASKS);

  /**
   * Photos only stand in when the JOBS and TASKS they hang off are samples
   * too. Real photos are found through their task to their job; sample photos
   * point at sample tasks, so mixing the two gives pictures belonging to
   * nothing and a photo wall that draws nothing.
   */
  const realChain = ctx.photos.length && ctx.assignments.length && ctx.jobs.length;
  const photos = realChain ? ctx.photos : SAMPLE_PHOTOS;

  const hasPlanner = (ctx.boardElements ?? []).some(e => e.widget === 'rota');

  /**
   * A week's worth of finished work, when nothing has actually been finished.
   *
   * The bar chart counts `completedAt`, and no sample task carried one — so
   * the preview was seven empty bars. These are EXTRA rows rather than flags
   * on the existing ones, because marking the overdue samples done would empty
   * the "running late" preview instead.
   */
  const anyDone = assignments.some(a => a.completedAt);
  const withDone = anyDone ? assignments : [...assignments, ...repoint(SAMPLE_DONE)];

  /**
   * A job nobody has picked up.
   *
   * Several widgets exist precisely to find the job with no stage and no open
   * task — and every sample job had both, so those cards drew their own empty
   * state on the shelf, which is indistinguishable from a broken preview. One
   * idle clone gives them something true to show.
   */
  const hasIdle = jobs.some(j => !j.currentStageId
    && !withDone.some(a => a.apartmentId === j.id && !a.completedAt));
  const withIdle = hasIdle || !jobs.length
    ? jobs
    : [...jobs, { ...jobs[0], id: `${jobs[0].id}-idle`, displayName: 'Rosen, Chana', currentStageId: null }];

  /**
   * A job that jumped a stage.
   *
   * SAMPLE_LOGS already carries one — but `logs` falls back WHOLESALE, so any
   * machine with even one real history entry took the real list, and a real
   * history mostly contains no skip. "Skipped a stage" then drew its empty
   * state on a shelf whose entire job is showing what the widget does.
   *
   * Same failure the sample task rows had, and the same fix: ADD the rows
   * rather than choose between the two lists. Detected exactly the way the
   * widget detects it, so the two can never disagree about what a skip is.
   */
  const stages = ctx.stages.length ? ctx.stages : SAMPLE_STAGES;
  const logs = ctx.logs.length ? ctx.logs : SAMPLE_LOGS;
  const order = new Map(stages.map((st, i) => [st.name, i]));
  const hasSkip = (() => {
    const at = new Map<string, number>();
    const moves = logs
      .filter(l => l.fieldChanged === 'currentStageId' && l.apartmentId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const l of moves) {
      const to = order.get(l.newValue ?? '');
      if (to === undefined) { at.set(l.apartmentId!, -1); continue; }
      const from = at.get(l.apartmentId!) ?? -1;
      if (from >= 0 && to > from + 1) return true;
      at.set(l.apartmentId!, to);
    }
    return false;
  })();
  /**
   * A job with NO stage history of its own.
   *
   * The first pick was withIdle[1] — j2, the very job SAMPLE_LOGS already
   * moves. Its Survey→Start-up row (a name the real stage list cannot map)
   * sorts BETWEEN the two appended rows and resets the widget's tracker to
   * "unknown", so the skip was invisible exactly when the sample names and the
   * real names differ — the case this fallback exists for.
   */
  const moved = new Set(logs
    .filter(l => l.fieldChanged === 'currentStageId')
    .map(l => l.apartmentId));
  const skipJob = withIdle.find(j => !moved.has(j.id)) ?? null;
  const withSkip = hasSkip || !skipJob || stages.length < 3
    ? logs
    : [...logs,
        { id: 'sample-skip-a', userName: 'Esther', apartmentId: skipJob.id,
          apartmentNumber: skipJob.displayName ?? '', actionType: 'update',
          fieldChanged: 'currentStageId', previousValue: '', newValue: stages[0].name,
          createdAt: new Date(Date.now() - 9 * 86_400_000).toISOString() },
        { id: 'sample-skip-b', userName: 'Yitzchak', apartmentId: skipJob.id,
          apartmentNumber: skipJob.displayName ?? '', actionType: 'update',
          fieldChanged: 'currentStageId', previousValue: stages[0].name,
          newValue: stages[stages.length - 1].name,
          createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
      ] as unknown as typeof logs;

  return {
    ...ctx,
    jobs: withIdle, contractors, photos,
    assignments: withDone,
    stages,
    logs: withSkip,
    users: ctx.users.length ? ctx.users : SAMPLE_USERS,
    planPins: ctx.planPins?.length ? ctx.planPins : SAMPLE_PINS,
    notes: ctx.notes?.length ? ctx.notes : SAMPLE_NOTES,
    employees: ctx.employees?.length ? ctx.employees : SAMPLE_EMPLOYEES,
    punches: ctx.punches?.length ? ctx.punches : SAMPLE_PUNCHES,
    boardElements: hasPlanner
      ? ctx.boardElements
      : [...(ctx.boardElements ?? []), samplePlanner(jobs, contractors)],
    readOnly: true,
  };
}

/**
 * The store's context: samples ONLY, never the machine's own data.
 *
 * The shelf used to run each preview on the real data field by field, on the
 * theory that your own overdue list beats an artist's impression. The owner
 * overruled it from experience: a sparse real workspace made half the shelf
 * preview its empty or all-clear state — "Due today · 0", "everything open
 * has a date", a bare search box — and "no one can understand how they will
 * actually look when data is full." So the store always previews the same
 * rich fake board, and the moment a widget is PLACED it reads the real data.
 *
 * Built by running the ordinary sample machinery over an empty context, so
 * the fake board stays coherent (tasks point at jobs, photos at tasks, the
 * skip at a job with no other history) without a second dataset to maintain.
 */
export function fullSampleCtx(): WidgetCtx {
  return withSampleData({
    jobs: [], stages: [], assignments: [], contractors: [], users: [],
    photos: [], logs: [], boardElements: [],
    update: () => {}, openJob: () => {}, readOnly: true,
  });
}


/**
 * The wall widgets join the same registry.
 *
 * Registered here rather than inside the array so tvWidgets.tsx can import
 * WidgetCtx and WidgetDef from this file without the two importing each other
 * in a circle.
 */
WIDGETS.push(...TV_WIDGETS);

/**
 * And the ones that look for what is NOT happening. Same reason, same place:
 * they import Frame and the data helpers from here, so the push has to be
 * after the array rather than inside it.
 */
WIDGETS.push(...INSIGHT_WIDGETS);
WIDGETS.push(...MORE_WIDGETS);

export const WIDGET_BY_ID = new Map(WIDGETS.map(w => [w.id, w]));

/** Renders whichever widget an element names, or nothing if it is unknown. */
export function renderWidget(el: CanvasElement, ctx: WidgetCtx): React.ReactNode {
  const def = el.widget ? WIDGET_BY_ID.get(el.widget) : undefined;
  if (!def) return <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">Unknown widget</div>;
  return def.render(el, ctx);
}

/**
 * Find a job, by a name spelled however it came out.
 *
 * Three ways of matching, in order of confidence: the text as typed, the name
 * as it SOUNDS (which is what crosses the language), and the apartment number
 * or address. A row is the shared MiniJob, so a result reads exactly like a
 * job reads everywhere else, and clicking one opens it.
 */
function JobFinder({ el, ctx }: { el: CanvasElement; ctx: WidgetCtx }) {
  // The store preview seeds a query (`sampleQuery`) — an interactive widget
  // whose preview cannot be typed into otherwise shows its empty state
  // forever, which tells a shopper nothing about what it looks like in use.
  const [q, setQ] = useState(String((el.data as Record<string, unknown> | undefined)?.sampleQuery ?? ''));
  const size = Number((el.data as Record<string, unknown> | undefined)?.textSize) || 12;

  const hits = useMemo(() => {
    const needle = q.trim();
    if (needle.length < 1) return [];
    const plain = needle.toLowerCase();
    return ctx.jobs
      .map(j => {
        const name = j.displayName?.trim() ?? '';
        const written = `${name} ${j.apartmentNumber ?? ''} ${j.address ?? ''}`.toLowerCase();
        // Typed-as-written beats sounds-alike, so an exact search is never
        // pushed down the list by a phonetic near-miss.
        const literal = written.includes(plain) ? 1.5 : 0;
        const heard = Math.max(soundScore(needle, name), soundScore(needle, j.address ?? ''));
        return { job: j, score: Math.max(literal, heard) };
      })
      .filter(r => r.score > 0.55)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
  }, [q, ctx.jobs]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 pt-2 pb-1.5 flex-shrink-0">
        <Search size={13} className="text-gray-400 flex-shrink-0" />
        <input
          data-no-drag data-el-action data-job-find
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Name, number or address"
          className="flex-1 min-w-0 outline-none bg-transparent text-slate-700 placeholder:text-slate-400"
          style={{ fontSize: size }}
        />
        {q && (
          <button data-no-drag data-el-action onClick={() => setQ('')}
            className="text-gray-300 hover:text-gray-600"><X size={12} /></button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-1" data-no-drag data-wheel>
        {!q.trim() && (
          <p className="px-2 py-3 text-gray-400" style={{ fontSize: size - 1 }}>
            {ctx.jobs.length} jobs. Type a family name in either language.
          </p>
        )}
        {q.trim() && hits.length === 0 && (
          <p className="px-2 py-3 text-gray-400" style={{ fontSize: size - 1 }}>
            Nothing close to “{q.trim()}”.
          </p>
        )}
        {hits.map(({ job }: { job: Apartment }) => (
          <MiniJob
            key={job.id}
            job={job}
            stages={ctx.stages}
            assignments={ctx.assignments}
            onOpen={ctx.openJob}
            size={size}
          />
        ))}
      </div>
    </div>
  );
}


/**
 * The cork the notes are pinned to.
 *
 * Restated here rather than shared with the pad because the pad keeps its own
 * board as component state and there is nothing to import — but the two must
 * keep matching. They are the same object seen two ways (one pad's notes, or
 * every pad's), and two different-looking cork boards read as two unrelated
 * features rather than one.
 */
const CORK: React.CSSProperties = {
  background:
    'radial-gradient(circle at 20% 25%, #C58A4B 0 2px, transparent 3px), '
    + 'radial-gradient(circle at 62% 68%, #B87C3F 0 2px, transparent 3px), '
    + 'radial-gradient(circle at 85% 20%, #C9925A 0 2px, transparent 3px), '
    + 'linear-gradient(150deg, #C08A50 0%, #B27B41 55%, #A76F38 100%)',
  backgroundSize: '26px 26px, 34px 34px, 30px 30px, 100% 100%',
  boxShadow: 'inset 0 0 0 6px #8A5A2B, inset 0 0 22px rgba(0,0,0,.35)',
};

/** A note's headline: its first written line, with any marker stripped off. */
function noteHeadline(text: string, fallback: string): string {
  const line = text
    .split('\n')
    .map(l => l.replace(/^[☐☑•]\s*/, '').replace(/\*\*/g, '').trim())
    .find(Boolean);
  return line || fallback;
}

/**
 * Somewhere free beside the board for a new note to land.
 *
 * Straight down the board's right-hand edge, first gap wins. The page's own
 * free-spot finder knows about the viewport and lives on the page, which a
 * widget cannot reach — and this only has to put one node next to the thing
 * that made it, not fill a canvas.
 */
/**
 * A fresh sticky note on the board, beside the one that asked for it.
 *
 * Shared by the note's own folded corner and by the Notes board's + button, so
 * "a new note" means exactly one thing wherever it is pressed. It reads the
 * store directly because a widget's render is a plain function, not a
 * component — the same reason `NotesBoard` does.
 */
/**
 * One notebook is the MAIN one; the rest are projections of it.
 *
 * The secretary keeps one planner and everybody else looks at a copy — on a
 * second screen, on another named board, on the wall. A projection has no
 * contents of its own: it renders the main one's element, so anything typed
 * into the main appears in every copy the moment it is saved, and there is no
 * second version of the week to reconcile.
 *
 * The identity it renders is the MAIN's on purpose. Every link a planner makes
 * — a job's `inNotebook`, the schedule window, the take-off dialogs — points at
 * a notebook by id, and a projection that answered with its own id would have
 * quietly built a second set of them.
 */
export function isProjection(el: CanvasElement): boolean {
  return ((el.data ?? {}) as Record<string, unknown>).role === 'projection';
}

/** The main planner of this kind, or null when this IS the main one. */
export function mainPlannerFor(el: CanvasElement, all: CanvasElement[]): CanvasElement | null {
  if (!isProjection(el)) return null;
  return all.find(e =>
    e.id !== el.id && e.type === 'widget' && e.widget === el.widget && !isProjection(e)) ?? null;
}

function PlannerHost({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  // Subscribed, not read once: a projection has to redraw when the MAIN
  // changes, and the main is a different element than the one this node is.
  const all = useStore(s => s.canvasElements);
  const projecting = isProjection(el);
  const main = projecting ? mainPlannerFor(el, c.boardElements ?? all) : null;
  const src = main ?? el;
  const orphan = projecting && !main;

  /**
   * A second notebook is a FULL notebook, not a picture of one.
   *
   * It used to be read-only with `update` stubbed to `() => {}` — the exact
   * fault this codebase has already paid for once, where a widget silently
   * discarded every edit. So a copy could be looked at and nothing else: no X
   * on its cards, nothing could be dropped on it, and nothing done on either
   * one reached the other. The owner's ruling: the second one gets every
   * control the first has, and the two stay in step.
   *
   * The writes go to the MAIN's element, which is the whole point — one set of
   * data, shown twice. `c.update` cannot be used for that: `BoardNode` binds
   * it to the node being rendered, which here is the projection, so it would
   * quietly write the main's data onto the copy and they would drift apart.
   */
  const updateMain = useCallback((patch: Partial<CanvasElement>) => {
    if (!main) return;
    useStore.getState().updateCanvasElement(main.id, patch);
  }, [main?.id]);
  return (
    <div className="relative w-full h-full">
      <PlannerWidget
        el={src}
        data={(src.data ?? {}) as PlannerData}
        jobs={c.jobs}
        contractors={c.contractors}
        users={c.users}
        assignments={c.assignments}
        stages={c.stages}
        // The wall is read-only for the notebook whatever its pen says.
        // An ORPHAN is read-only too: there is no main to write to, and
        // letting somebody plan a week into a node that points at nothing is
        // the one way this can still lose work.
        readOnly={c.readOnly || c.wall || orphan}
        projection={projecting}
        update={projecting ? updateMain : c.update}
        openJob={c.openJob}
        onShowAll={c.showAllScheduled ? () => c.showAllScheduled!(src.id) : undefined}
        onRemoveTask={c.askRemoveTask}
        onLeaveNotebook={c.leaveNotebook}
      />
      {projecting && (
        <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold
                         pointer-events-none"
          style={{ backgroundColor: orphan ? '#fee2e2' : '#e2e8f0', color: orphan ? '#b4342a' : '#475569' }}>
          {orphan ? 'no main planner' : 'projection'}
        </span>
      )}
    </div>
  );
}

export function spawnStickyBeside(host: CanvasElement, colour = 'yellow'): void {
  const st = useStore.getState();
  const w = 260, h = 300;
  const at = spotBeside(st.canvasElements, host, w, h);
  const now = new Date().toISOString();
  const noteId = `SN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  st.addCanvasElement({
    addedAt: now,
    id: 'CE-' + Math.random().toString(36).slice(2, 9),
    type: 'widget', widget: 'sticky-pad',
    ...(host.board ? { board: host.board } : {}),
    x: Math.round(at.x), y: Math.round(at.y), w, h,
    text: '', color: 'transparent',
    data: { notes: [{ id: noteId, text: '', colour, updatedAt: now }], openId: noteId },
  });
}

function spotBeside(all: CanvasElement[], host: CanvasElement, w: number, h: number) {
  const gap = 20;
  const x = host.x + host.w + gap;
  const near = all.filter(e => (e.board ?? '') === (host.board ?? '') && e.id !== host.id);
  for (let row = 0; row < 20; row++) {
    const y = host.y + row * (h + gap);
    const clash = near.some(e => x < e.x + e.w && x + w > e.x && y < e.y + e.h && y + h > e.y);
    if (!clash) return { x, y };
  }
  return { x, y: host.y };
}

/**
 * The notes board.
 *
 * The cork board that used to be reachable only from inside one sticky pad,
 * placed on its own. It gathers every pad standing on the same board and pins
 * all their notes up together, because "what has anybody written down?" spans
 * the board rather than the one pad you happen to be holding.
 *
 * The one behaviour that changes: **New note makes a new note WIDGET** beside
 * the board rather than another page inside a single pad. A note is a thing on
 * the board — it can be moved, coloured, resized, attached and put on the wall
 * like anything else — and a notes board that quietly hid them all inside
 * itself would be the pad again under a different name.
 */
function NotesBoard({ el, ctx }: { el: CanvasElement; ctx: WidgetCtx }) {
  const storeElements = useStore(s => s.canvasElements);
  const addCanvasElement = useStore(s => s.addCanvasElement);
  const updateCanvasElement = useStore(s => s.updateCanvasElement);

  const he = !!ctx.isRtl;
  const readOnly = !!ctx.readOnly;
  const cfg = d(el);

  // The shelf hands over the board's nodes; everywhere else the store IS the board.
  const elements = ctx.boardElements ?? storeElements;

  /** Every pad on the same board as this one — a group's board is its own board. */
  const pads = elements.filter(e =>
    e.type === 'widget' && e.widget === 'sticky-pad' && (e.board ?? '') === (el.board ?? ''));

  const pinned = pads
    .flatMap(p => (((p.data ?? {}) as Record<string, any>).notes as StickyNoteRecord[] ?? [])
      .map(note => ({ note, padId: p.id })))
    // Newest first: a board people keep adding to is read from the top.
    .sort((a, b) => (b.note.updatedAt ?? '').localeCompare(a.note.updatedAt ?? ''));

  /**
   * The shelf has no pads to gather from, so a sample stands in — the same
   * rule the rest of the store follows. On a real board with nothing written
   * yet there is no sample, and the empty state is simply the truth.
   */
  const sample = (cfg.notes as StickyNoteRecord[] | undefined) ?? [];
  const rows: { note: StickyNoteRecord; padId: string }[] =
    pinned.length ? pinned : sample.map(note => ({ note, padId: '' }));

  /** Blank fits as many across as the node is wide — it is a resizable node. */
  const cols = Number(cfg.columns) || 0;

  function openOnItsPad(padId: string, noteId: string) {
    const pad = elements.find(e => e.id === padId);
    if (readOnly || !pad) return;
    updateCanvasElement(padId, { data: { ...(pad.data ?? {}), openId: noteId } });
  }

  function takeDown(padId: string, noteId: string) {
    const pad = elements.find(e => e.id === padId);
    if (readOnly || !pad) return;
    if (!window.confirm(he ? 'להסיר את הפתק?' : 'Take this note down?')) return;
    const data = (pad.data ?? {}) as Record<string, any>;
    const rest = ((data.notes ?? []) as StickyNoteRecord[]).filter(n => n.id !== noteId);
    // '' rather than undefined: an undefined value NESTED inside `data` is not
    // something Firestore accepts, and fsSet's sanitiser only reaches the top
    // level — the write would fail into a console warning and the note would
    // come back on the next device. The pad reads a missing id the same way.
    updateCanvasElement(padId, { data: { ...data, notes: rest, openId: rest[0]?.id ?? '' } });
  }

  function newNote() {
    if (readOnly) return;
    const w = 260, h = 300;
    const at = spotBeside(storeElements, el, w, h);
    const now = new Date().toISOString();
    const noteId = `SN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    addCanvasElement({
      addedAt: now,
      id: 'CE-' + Math.random().toString(36).slice(2, 9),
      type: 'widget', widget: 'sticky-pad',
      // It lands on whatever board this one is standing on.
      ...(el.board ? { board: el.board } : {}),
      x: Math.round(at.x), y: Math.round(at.y), w, h,
      text: '', color: 'transparent',
      // Seeded with one blank page rather than none, so the new note is pinned
      // up here the moment it is made. An empty pad shows nothing on the cork,
      // which would have made the button look as though it had done nothing.
      data: { notes: [{ id: noteId, text: '', colour: 'yellow', updatedAt: now }], openId: noteId },
    });
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-md" style={CORK}>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <span className="truncate text-xs font-bold text-amber-50 drop-shadow">
          {(cfg.title as string) || (he ? 'לוח הפתקים' : 'The notes board')} · {rows.length}
        </span>
        {!readOnly && (
          <button type="button" data-no-drag data-el-action data-notes-board-new
            title={he ? 'פתק חדש' : 'New note'}
            onClick={newNote}
            className="flex shrink-0 items-center gap-1 rounded bg-amber-50/85 px-1.5 py-1
                       text-[10px] font-bold text-amber-900 hover:bg-amber-50">
            <Plus className="h-3.5 w-3.5" />
            {he ? 'פתק' : 'Note'}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" data-no-drag data-wheel>
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-[11.5px] text-amber-50/90">
            {he
              ? 'אין עדיין פתקים על הלוח. לחצו “פתק” כדי להוסיף אחד.'
              : 'Nothing written down yet. Press Note for one.'}
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={cols
              ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
              : { gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}
          >
            {rows.map(({ note, padId }, i) => {
              const cc = NOTE_COLOURS[note.colour] ?? NOTE_COLOURS.yellow;
              // A board of perfectly square notes reads as a spreadsheet. The
              // tilts repeat every five so a note does not jump about as the
              // list re-sorts under it.
              const tilt = [-2.5, 1.8, -1.2, 2.4, -0.8][i % 5];
              return (
                <div key={`${padId}:${note.id}`} data-notes-board-note={note.id}
                  className="group/pin relative pt-2" style={{ transform: `rotate(${tilt}deg)` }}>
                  <span aria-hidden
                    className="absolute start-1/2 top-0 z-10 h-3.5 w-3.5 -translate-x-1/2 rounded-full rtl:translate-x-1/2"
                    style={{
                      background: 'radial-gradient(circle at 32% 30%, #ff8a8a 0 30%, #d92c2c 55%, #8e1414 100%)',
                      boxShadow: '0 2px 3px rgba(0,0,0,.45)',
                    }} />
                  <button type="button" data-no-drag data-el-action data-notes-board-open={note.id}
                    title={readOnly ? undefined : (he ? 'פתיחה על הפתק שלו' : 'Open it on its own pad')}
                    onClick={() => openOnItsPad(padId, note.id)}
                    className="block h-24 w-full overflow-hidden rounded-[3px] p-2 text-start text-[11px] leading-5 transition-transform hover:scale-[1.03]"
                    style={{
                      background: `linear-gradient(160deg, ${cc.bg} 0%, ${cc.bg} 62%, ${cc.bg2} 100%)`,
                      color: cc.text,
                      boxShadow: '0 6px 12px -6px rgba(0,0,0,.55)',
                    }}>
                    <span className="line-clamp-4 whitespace-pre-wrap break-words">
                      {noteHeadline(note.text, he ? '(פתק ריק)' : '(empty note)')}
                    </span>
                  </button>
                  {/* No pad behind it means this is the shelf's sample — there
                      is nothing to take down, and offering it would be a lie. */}
                  {!readOnly && padId !== '' && (
                    <button type="button" data-no-drag data-el-action data-notes-board-delete={note.id}
                      title={he ? 'הסרה' : 'Take down'}
                      onClick={() => takeDown(padId, note.id)}
                      className="absolute -end-1.5 -top-0.5 rounded-full bg-white/90 p-1 text-rose-600
                                 opacity-0 shadow transition group-hover/pin:opacity-100">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
