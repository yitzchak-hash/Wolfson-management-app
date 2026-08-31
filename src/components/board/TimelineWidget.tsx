import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, GitCommitHorizontal } from 'lucide-react';
import { CanvasElement, ContractorAssignment, aptLabel, personColor } from '../../types';
import { Frame, d, WidgetCtx } from '../../data/widgets';
import { daysOf } from '../../data/taskDays';
import { iso, tint } from './PlannerWidget';
import { useStore } from '../../data/store';

/**
 * The Timeline, rebuilt to the researched spec (Linear / Asana / Monday /
 * Notion / Google Calendar, distilled): a two-week GANTT STRIP, not a line
 * with dots.
 *
 *  - An axis strip of day columns with the work-week shaded honestly for
 *    Israel (Friday half, Saturday full — Monday.com's Fri–Sat weekend
 *    option, mapped to this company).
 *  - LANES under it: a multi-day task is a BAR spanning its days (one
 *    segment per consecutive run, dotted connector between — a task never
 *    draws across days it does not cover); a single-day task is a DIAMOND
 *    (Linear's milestone mark — a dot reads as gridline decoration).
 *  - Greedy interval packing (Google Calendar): first free lane wins; what
 *    does not fit collapses into "+N" pills on a cluster lane, and every
 *    pill opens its list — the app's standing numbers-open-their-lists rule.
 *  - Colour carries MEANING: the job's stage tints the bar; red always
 *    outranks it for overdue; done is dimmed with a tick and a strike, and
 *    hidden unless asked for. The worker rides as a small colour dot.
 *  - The TODAY line is red, full height, capped in the axis (Google
 *    Calendar's filled today pill + Monday's vertical bar).
 *  - ‹ Today › walk the window by half-screens; no wheel capture and no
 *    drag-pan — a board widget fighting the board's wheel is a standing
 *    trap here, and the arrows are enough for a read-mostly strip.
 *
 * Dates go through the planner's `iso()` — local days, never toISOString
 * (the documented midnight bug). Tasks go through the live set only, so a
 * job filed into Trash takes its bars with it.
 */

const DAY_MS = 86_400_000;
const dayAt = (isoStr: string) => new Date(`${isoStr}T00:00:00`);
const addDays = (isoStr: string, n: number) => iso(new Date(dayAt(isoStr).getTime() + n * DAY_MS));
const diffDays = (a: string, b: string) =>
  Math.round((dayAt(b).getTime() - dayAt(a).getTime()) / DAY_MS);
const sundayOf = (dt: Date) => iso(new Date(dt.getTime() - dt.getDay() * DAY_MS));

/** Discrete presets, never continuous zoom — every product surveyed. */
const WINDOWS: Record<string, { days: number; half: number; back: number }> = {
  '': { days: 14, half: 7, back: 0 },
  month: { days: 35, half: 14, back: 7 },
  quarter: { days: 91, half: 35, back: 14 },
};

const RED = '#dc2626';
const NAVY = '#1e3a5f';

interface TItem {
  id: string;
  jobId?: string;
  label: string;
  words?: string;
  days: string[];
  /** Consecutive calendar runs, so a bar never crosses a day it skips. */
  runs: string[][];
  stageColor?: string;
  stageName?: string;
  workerName?: string;
  workerColor?: string;
  overdue: boolean;
  done: boolean;
  urgent: boolean;
}

function runsOf(days: string[]): string[][] {
  const out: string[][] = [];
  for (const day of days) {
    const last = out[out.length - 1];
    if (last && diffDays(last[last.length - 1], day) === 1) last.push(day);
    else out.push([day]);
  }
  return out;
}

/** The shelf's canned fortnight: bars, a cluster, one overdue, one done. */
function sampleItems(today: string): TItem[] {
  const mk = (id: string, label: string, from: number, len: number, color: string,
    extra?: Partial<TItem>): TItem => {
    const days = Array.from({ length: len }, (_, i) => addDays(today, from + i));
    return {
      id, label, days, runs: runsOf(days), stageColor: color,
      overdue: false, done: false, urgent: false, workerColor: '#0d9488', ...extra,
    };
  };
  return [
    mk('s1', 'Artzi, Avital', -3, 4, '#0ea5e9', { words: 'Concealed units', overdue: true }),
    mk('s2', 'Goldman Family', 0, 3, '#8b5cf6', { words: 'Close the ceiling', urgent: true, workerColor: '#c2410c' }),
    mk('s3', 'Liff, Diane', 2, 1, '#f59e0b'),
    mk('s4', 'Klein, Shmulik', 4, 3, '#16a34a', { words: 'Second fix', workerColor: '#7c3aed' }),
    mk('s5', 'Rosenberg, Sharon', -5, 2, '#64748b', { done: true }),
    mk('s6', 'Buchnik, Meir', 1, 2, '#0ea5e9', { workerColor: '#b8860b' }),
    mk('s7', 'Esses, Daniel', 1, 1, '#8b5cf6' ),
    mk('s8', 'Podim, Rivkah', 8, 4, '#0ea5e9', { words: 'Piping' }),
  ];
}

export function TimelineWidget({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = d(el);
  const s = useStore(st => st.mainUiStrings);
  const preset = WINDOWS[String(data.window ?? '')] ?? WINDOWS[''];
  const groupByWorker = String(data.groupBy ?? '') === 'worker';
  const showDone = data.showDone === '1';
  const sample = !!data.sample;
  const today = iso(new Date());

  /** ‹ › move by half a window; Today snaps home with today in the left third. */
  const [off, setOff] = useState(0);
  const start = addDays(sundayOf(new Date()), -preset.back + off * preset.half);
  const nDays = preset.days;
  const end = addDays(start, nDays);

  // The body's real size — lane budget and label gating both need it.
  // Damped functional write (the standing ResizeObserver rule).
  const bodyRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    const read = () => {
      const w = node.clientWidth, h = node.clientHeight;
      setBox(prev => (Math.abs(prev.w - w) > 2 || Math.abs(prev.h - h) > 2) ? { w, h } : prev);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // ── the items ─────────────────────────────────────────────────────────────
  const items = useMemo<TItem[]>(() => {
    if (sample) return sampleItems(today);
    // Typed-in dates (the old widget's own mode) still draw, as diamonds.
    if (String(data.source ?? '') === 'own') {
      return ((data.items ?? []) as { t: string; on: string }[])
        .filter(i => i.on)
        .map((i, k) => {
          const day = String(i.on).slice(0, 10);
          return {
            id: `own-${k}`, label: i.t || 'Date', days: [day], runs: [[day]],
            overdue: false, done: false, urgent: false,
          };
        });
    }
    const jobs = new Map(c.jobs.map(j => [j.id, j]));
    const out: TItem[] = [];
    for (const a of c.assignments as ContractorAssignment[]) {
      const job = jobs.get(a.apartmentId);
      if (!job || !a.dueDate) continue;                      // live, dated tasks only
      const done = !!a.completedAt;
      if (done && !showDone) continue;
      const days = daysOf(a).map(x => String(x).slice(0, 10)).sort();
      if (!days.length) continue;
      const worker = c.contractors.find(x => x.id === a.contractorId);
      const stage = c.stages.find(x => x.id === job.currentStageId);
      out.push({
        id: a.id, jobId: job.id,
        label: aptLabel(job) || job.address?.trim() || a.taskDescription || 'Task',
        words: (a.taskDescription ?? '').trim() || undefined,
        days, runs: runsOf(days),
        stageColor: stage?.color, stageName: stage?.name,
        workerName: worker?.name,
        workerColor: worker ? personColor(worker.name, worker.color) : undefined,
        overdue: !done && days[days.length - 1] < today,
        done, urgent: a.priority === 'urgent',
      });
    }
    return out;
  }, [sample, data.source, data.items, c.jobs, c.assignments, c.contractors, c.stages,
      showDone, today]);

  const visible = useMemo(
    () => items.filter(i => i.days[0] < end && i.days[i.days.length - 1] >= start)
      .map(i => ({
        ...i,
        sIdx: Math.max(0, diffDays(start, i.days[0])),
        eIdx: Math.min(nDays - 1, diffDays(start, i.days[i.days.length - 1])),
      }))
      .sort((a, b) => a.sIdx - b.sIdx || (b.eIdx - b.sIdx) - (a.eIdx - a.sIdx)),
    [items, start, end, nDays]);

  // ── geometry ──────────────────────────────────────────────────────────────
  const AXIS_H = 18;
  const short = box.h > 0 && box.h < 100;
  const FOOT_H = short ? 0 : 18;
  const gutter = groupByWorker ? 56 : 0;
  const laneArea = Math.max(24, box.h - AXIS_H - FOOT_H - 6);
  const laneBudget = Math.max(1, Math.floor(laneArea / 24));
  const stripW = Math.max(1, box.w - gutter);
  const colPct = 100 / nDays;
  const xPct = (idx: number) => idx * colPct;

  // ── packing ───────────────────────────────────────────────────────────────
  type Placed = (typeof visible)[number] & { lane: number };
  const { placed, clusters, laneLabels } = useMemo(() => {
    const clusters = new Map<number, { count: number; jobIds: string[] }>();
    const overflow = (it: (typeof visible)[number]) => {
      const wk = Math.floor(it.sIdx / 7) * 7;
      const cur = clusters.get(wk) ?? { count: 0, jobIds: [] };
      cur.count++;
      if (it.jobId) cur.jobIds.push(it.jobId);
      clusters.set(wk, cur);
    };

    if (groupByWorker) {
      // One lane per worker, busiest first (Linear's swimlanes).
      const order: string[] = [];
      for (const it of visible) {
        const key = it.workerName ?? '';
        if (!order.includes(key)) order.push(key);
      }
      order.sort((a, b) =>
        visible.filter(i => (i.workerName ?? '') === b).length
        - visible.filter(i => (i.workerName ?? '') === a).length);
      const laneOf = new Map(order.slice(0, laneBudget).map((w, i) => [w, i]));
      const placed: Placed[] = [];
      const laneEnd = new Map<number, number>();
      for (const it of visible) {
        const lane = laneOf.get(it.workerName ?? '');
        if (lane === undefined) { overflow(it); continue; }
        if ((laneEnd.get(lane) ?? -1) >= it.sIdx) { overflow(it); continue; }
        laneEnd.set(lane, it.eIdx);
        placed.push({ ...it, lane });
      }
      const laneLabels = order.slice(0, laneBudget).map(w => ({
        name: w || '—',
        color: w ? (visible.find(i => i.workerName === w)?.workerColor ?? '#94a3b8') : '#cbd5e1',
      }));
      return { placed, clusters, laneLabels };
    }

    // Packed: first free lane wins; the last lane is kept for the clusters
    // once anything overflows.
    const placed: Placed[] = [];
    const laneEnd: number[] = [];
    for (const it of visible) {
      let lane = laneEnd.findIndex(e => e < it.sIdx);
      if (lane === -1) lane = laneEnd.length;
      if (lane >= laneBudget) { overflow(it); continue; }
      laneEnd[lane] = it.eIdx;
      placed.push({ ...it, lane });
    }
    return { placed, clusters, laneLabels: null as null | { name: string; color: string }[] };
  }, [visible, laneBudget, groupByWorker]);

  const [hover, setHover] = useState<{ it: TItem; x: number; y: number } | null>(null);

  const todayIdx = diffDays(start, today);
  const todayVisible = todayIdx >= 0 && todayIdx < nDays;
  const dayInitials = s.isRtl
    ? ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
    : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const nextTask = items
    .map(i => i.days[0])
    .filter(x => x >= end)
    .sort()[0];

  const rangeLabel = `${dayAt(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
    + ` – ${dayAt(addDays(start, nDays - 1)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  const openIt = (it: TItem) => {
    if (sample || !it.jobId) return;
    c.openJob(it.jobId);
  };

  const laneTop = (lane: number) => AXIS_H + 6 + lane * 24;

  return (
    <Frame title={String(data.title || 'Timeline')} icon={GitCommitHorizontal}>
      <div ref={bodyRef} dir="ltr" className="relative h-full w-full overflow-hidden select-none">
        {/* ── the strip (axis + lanes), inset past the worker gutter ── */}
        <div className="absolute top-0 bottom-0" style={{ left: gutter, right: 0 }}>
          {/* weekend shading — Friday half strength, Saturday full. */}
          {Array.from({ length: nDays }, (_, i) => {
            const dow = dayAt(addDays(start, i)).getDay();
            if (dow !== 5 && dow !== 6) return null;
            return (
              <div key={`we${i}`} className="absolute top-0 pointer-events-none"
                style={{
                  left: `${xPct(i)}%`, width: `${colPct}%`, bottom: FOOT_H,
                  backgroundColor: dow === 6 ? 'rgba(15,23,42,.055)' : 'rgba(15,23,42,.028)',
                }} />
            );
          })}
          {/* gridlines — per day on the fortnight, per week zoomed out. */}
          {Array.from({ length: nDays }, (_, i) => {
            if (nDays > 20 && i % 7 !== 0) return null;
            return (
              <div key={`gl${i}`} className="absolute top-0 pointer-events-none"
                style={{
                  left: `${xPct(i)}%`, width: 1, bottom: FOOT_H,
                  backgroundColor: 'rgba(148,163,184,.22)',
                }} />
            );
          })}

          {/* ── axis strip ── */}
          <div className="absolute top-0 left-0 right-0" style={{ height: AXIS_H }}>
            {Array.from({ length: nDays }, (_, i) => {
              const day = addDays(start, i);
              const dt = dayAt(day);
              const isToday = day === today;
              if (nDays <= 14) {
                return (
                  <div key={day} className="absolute top-0 h-full flex flex-col items-center justify-center leading-none"
                    style={{ left: `${xPct(i)}%`, width: `${colPct}%` }}>
                    <span style={{ fontSize: 6.5, color: '#b6c2d1', fontWeight: 700 }}>
                      {dayInitials[dt.getDay()]}
                    </span>
                    <span className={isToday ? 'rounded-full px-1' : ''}
                      style={{
                        fontSize: 8.5, fontWeight: 800, marginTop: 1,
                        color: isToday ? '#fff' : '#64748b',
                        backgroundColor: isToday ? RED : undefined,
                      }}>
                      {dt.getDate()}
                    </span>
                  </div>
                );
              }
              // Zoomed out: label Sundays; name a month where it starts.
              const first = dt.getDate() === 1
                || (i === 0 && dt.getDate() <= 7 && nDays > 40);
              if (dt.getDay() !== 0 && !first) return null;
              return (
                <div key={day} className="absolute top-0 h-full flex items-center gap-1 ps-0.5"
                  style={{ left: `${xPct(i)}%` }}>
                  {first && (
                    <span style={{ fontSize: 8.5, fontWeight: 900, color: NAVY }}>
                      {dt.toLocaleDateString(undefined, { month: 'short' })}
                    </span>
                  )}
                  {dt.getDay() === 0 && (
                    <span className={day === today ? 'rounded-full px-1' : ''}
                      style={{
                        fontSize: 8, fontWeight: 700,
                        color: day === today ? '#fff' : '#94a3b8',
                        backgroundColor: day === today ? RED : undefined,
                      }}>
                      {dt.getDate()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── today line ── */}
          {todayVisible && (
            <div className="absolute pointer-events-none" style={{
              left: `calc(${xPct(todayIdx) + colPct / 2}% - 1px)`,
              top: AXIS_H - 3, bottom: FOOT_H, width: 1.5, backgroundColor: RED, opacity: 0.75,
            }}>
              <span className="absolute -top-[1px] left-1/2 -translate-x-1/2"
                style={{
                  width: 0, height: 0,
                  borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
                  borderTop: `5px solid ${RED}`,
                }} />
            </div>
          )}

          {/* ── bars, diamonds, connectors ── */}
          {placed.map(it => {
            const y = laneTop(it.lane);
            const runs = it.runs
              .map(run => ({
                a: Math.max(0, diffDays(start, run[0])),
                b: Math.min(nDays - 1, diffDays(start, run[run.length - 1])),
                whole: run,
              }))
              .filter(r => r.b >= 0 && r.a <= nDays - 1);
            const single = it.days.length === 1;
            const fill = it.done ? 'rgba(148,163,184,.25)'
              : it.overdue ? 'rgba(220,38,38,.16)'
              : tint(it.stageColor ?? '#94a3b8', 0.2);
            const capColor = it.done ? '#94a3b8' : it.overdue ? RED : (it.stageColor ?? '#94a3b8');
            const widest = runs.reduce((m, r) => Math.max(m, r.b - r.a + 1), 0);
            const widestPx = (widest / nDays) * stripW;
            const events = {
              onClick: () => openIt(it),
              onMouseEnter: (e: React.MouseEvent) =>
                !c.readOnly && setHover({ it, x: e.clientX, y: e.clientY }),
              onMouseMove: (e: React.MouseEvent) =>
                setHover(h => (h ? { ...h, x: e.clientX, y: e.clientY } : h)),
              onMouseLeave: () => setHover(null),
            };
            if (single) {
              const i0 = Math.max(0, Math.min(nDays - 1, diffDays(start, it.days[0])));
              return (
                <button key={it.id} data-no-drag data-el-action data-tl-mark={it.id}
                  {...events}
                  className="absolute"
                  style={{
                    left: `calc(${xPct(i0) + colPct / 2}% - 5px)`, top: y + 2,
                    width: 10, height: 10, transform: 'rotate(45deg)',
                    backgroundColor: it.done ? '#cbd5e1' : it.overdue ? RED : (it.stageColor ?? NAVY),
                    borderRadius: 2, opacity: it.done ? 0.5 : 1,
                    boxShadow: '0 1px 3px rgba(15,23,42,.25)',
                  }}
                  title={it.label} />
              );
            }
            return (
              <React.Fragment key={it.id}>
                {runs.map((r, ri) => (
                  <React.Fragment key={ri}>
                    <button data-no-drag data-el-action data-tl-mark={it.id}
                      {...events}
                      className="absolute rounded-full overflow-hidden flex items-center"
                      style={{
                        left: `${xPct(r.a)}%`,
                        width: `max(${(r.b - r.a + 1) * colPct}%, 14px)`,
                        top: y, height: 15,
                        backgroundColor: fill,
                        border: it.overdue && !it.done ? `1px solid ${RED}` : '1px solid rgba(15,23,42,.06)',
                        opacity: it.done ? 0.45 : 1,
                      }}>
                      <span className="flex-shrink-0 h-full" style={{ width: 3, backgroundColor: capColor }} />
                      {it.urgent && !it.done && (
                        <span className="flex-shrink-0 rounded-full mx-0.5"
                          style={{ width: 4, height: 4, backgroundColor: RED }} />
                      )}
                      {ri === 0 && widestPx >= 44 && (
                        <span className="truncate px-1 min-w-0"
                          style={{
                            fontSize: 8.5, fontWeight: 700, color: capColor,
                            textDecoration: it.done ? 'line-through' : undefined,
                          }}>
                          {it.done && <Check size={7} className="inline me-0.5" />}
                          {it.label}{widestPx >= 90 && it.words ? ` · ${it.words}` : ''}
                        </span>
                      )}
                      <span className="flex-1" />
                      {it.workerColor && !groupByWorker && (
                        <span className="flex-shrink-0 rounded-full me-1"
                          style={{ width: 5, height: 5, backgroundColor: it.workerColor }} />
                      )}
                    </button>
                    {ri > 0 && (
                      <div className="absolute pointer-events-none"
                        style={{
                          left: `${xPct(runs[ri - 1].b + 1)}%`,
                          width: `${(r.a - runs[ri - 1].b - 1) * colPct}%`,
                          top: y + 7, borderTop: '1px dotted #94a3b8',
                        }} />
                    )}
                  </React.Fragment>
                ))}
              </React.Fragment>
            );
          })}

          {/* ── the overflow clusters — every number opens its list ── */}
          {[...clusters.entries()].map(([wk, cl]) => (
            <button key={`cl${wk}`} data-no-drag data-el-action data-tl-cluster
              onClick={() => c.showList?.(String(data.title || 'Timeline'), cl.jobIds)}
              className="absolute rounded-full px-1.5"
              style={{
                left: `${xPct(wk) + 0.4}%`, top: laneTop(Math.min(laneBudget - 1, 99)) + 1,
                fontSize: 8.5, fontWeight: 800, color: '#475569',
                backgroundColor: 'rgba(148,163,184,.22)', height: 13, lineHeight: '13px',
              }}>
              +{cl.count}
            </button>
          ))}

          {/* ── empty states: the axis stays drawn — an empty timeline that
                 still shows TIME reads as quiet, not broken. ── */}
          {visible.length === 0 && clusters.size === 0 && (
            <div className="absolute inset-x-0 flex flex-col items-center gap-0.5"
              style={{ top: AXIS_H + Math.max(8, laneArea / 2 - 12) }}>
              <span style={{ fontSize: 9.5, color: '#94a3b8' }}>
                {items.length ? s.tlQuietWindow : s.tlNoDates}
              </span>
              {items.length > 0 && nextTask && (
                <button data-no-drag data-el-action
                  onClick={() => setOff(o => o + Math.ceil((diffDays(end, nextTask) + 1) / preset.half))}
                  className="font-bold"
                  style={{ fontSize: 9.5, color: '#4aa8d8' }}>
                  {s.tlJumpNext} →
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── the worker gutter ── */}
        {groupByWorker && laneLabels && (
          <div className="absolute top-0 bottom-0 left-0" style={{ width: gutter }}>
            {laneLabels.map((l, i) => (
              <div key={i} className="absolute left-0 right-1 flex items-center gap-1 min-w-0"
                style={{ top: laneTop(i), height: 15 }}>
                <span className="rounded-full flex-shrink-0" style={{ width: 5, height: 5, backgroundColor: l.color }} />
                <span className="truncate" style={{ fontSize: 8, fontWeight: 700, color: '#64748b' }}>
                  {l.name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── footer: ‹ Today › and the honest range ── */}
        {!short && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1"
            style={{ height: FOOT_H }}>
            <button data-no-drag data-el-action onClick={() => setOff(o => o - 1)}
              className="p-0.5 rounded text-slate-400 hover:text-[#1e3a5f] hover:bg-slate-100">
              <ChevronLeft size={11} />
            </button>
            <button data-no-drag data-el-action data-tl-today onClick={() => setOff(0)}
              className="px-1.5 rounded-full font-bold hover:bg-slate-100"
              style={{ fontSize: 8.5, color: off === 0 ? '#b6c2d1' : NAVY }}>
              {s.tlToday}
            </button>
            <button data-no-drag data-el-action onClick={() => setOff(o => o + 1)}
              className="p-0.5 rounded text-slate-400 hover:text-[#1e3a5f] hover:bg-slate-100">
              <ChevronRight size={11} />
            </button>
            <span className="flex-1" />
            <span className="tabular-nums" style={{ fontSize: 8, color: '#b6c2d1' }}>{rangeLabel}</span>
          </div>
        )}

        {/* ── hover card — portalled: the widget body is overflow-clipped
               inside the scaled surface, so no z-index escapes it. Pointer-
               events-none, so it can never swallow a press. ── */}
        {hover && createPortal(
          <div className="fixed z-[400] pointer-events-none rounded-xl bg-white shadow-2xl border border-gray-100 px-3 py-2"
            style={{
              left: Math.min(hover.x + 12, window.innerWidth - 240),
              top: Math.min(hover.y + 12, window.innerHeight - 120),
              width: 220,
            }}>
            <div className="text-[12px] font-extrabold text-slate-800 truncate">{hover.it.label}</div>
            {hover.it.words && (
              <div className="text-[10.5px] text-slate-500 truncate">{hover.it.words}</div>
            )}
            <div className="flex items-center gap-1.5 mt-1 min-w-0">
              {hover.it.stageName && (
                <span className="px-1.5 rounded-full text-[9px] font-bold truncate"
                  style={{ backgroundColor: tint(hover.it.stageColor ?? '#94a3b8', 0.18), color: hover.it.stageColor }}>
                  {hover.it.stageName}
                </span>
              )}
              {hover.it.workerName && (
                <span className="flex items-center gap-1 text-[9.5px] text-slate-500 truncate">
                  <span className="rounded-full flex-shrink-0" style={{ width: 5, height: 5, backgroundColor: hover.it.workerColor }} />
                  {hover.it.workerName}
                </span>
              )}
            </div>
            <div className="text-[9.5px] text-slate-400 mt-1 tabular-nums">
              {dayAt(hover.it.days[0]).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
              {hover.it.days.length > 1 && ` – ${dayAt(hover.it.days[hover.it.days.length - 1])
                .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`}
              {` · ${hover.it.days.length === 1 ? '1' : hover.it.days.length} ${hover.it.days.length === 1 ? 'day' : 'days'}`}
              {hover.it.overdue && <span style={{ color: RED, fontWeight: 700 }}> · overdue</span>}
              {hover.it.done && ' · done'}
            </div>
          </div>,
          document.body)}
      </div>
    </Frame>
  );
}
