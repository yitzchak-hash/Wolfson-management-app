import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Check, Printer } from 'lucide-react';
import { useStore, loadAllProjectsTaskData } from '../data/store';
import {
  Apartment, Contractor, ContractorAssignment, Stage, aptLabel, projectColor, projectShortName,
  generalBuildingsText, personColor, getStageName,
} from '../types';
import { daysOf, workingRun, moveTaskDay, addTaskDay, removeTaskDay, parseDay, dayIso } from '../data/taskDays';
import { recordStageIds } from '../data/stageMarks';
import { rowNumOf } from '../data/floorRows';
import { rememberTaskFocus } from '../data/taskFocus';
import { rememberReturn } from '../data/unitTravel';
import { useTimeOff } from '../data/useTimeOff';
import { TimeOff, hatchOf, bandLine, offOn, TIME_OFF_COLOR, timeOffWords, shiftDay } from '../data/timeOff';
import { personOf } from '../components/board/PlannerWidget';
import { PlannerTaskDialog, PlannerDayDialog, DayChoice } from '../components/board/PlannerDialogs';
import { BUNDLE_MIN, BundleBar, BundleInfo, BundlePopup, bundleWords, StagePill } from '../components/board/TaskBundle';
import { TimeOffDialog } from '../components/board/TimeOffDialog';
import { useMedia } from '../data/usePhone';
import { printTable } from '../data/printing';

import { prefGet, prefSet } from '../data/prefs';
/**
 * THE calendar — one, for every workspace (owner, 2026-10-12, "Calendar and
 * Time Off", all stars). It replaces the header's all-workspace calendar and
 * the sidebar's per-workspace one; the This workspace / All workspaces switch
 * lives inside it.
 *
 * Drawn like the notebook: each task is a small board tile (look A — frame in
 * its first stage's colour, the unit's name, the stages as pills, the
 * workspace tag, building and the worker's dot), a task that takes days is
 * ONE bar across them, done is green with a tick, a busy day folds into one
 * bundle tile (four or more single-day tasks of one worker in one workspace),
 * and time off is a striped band. The + on a day opens the notebook's own
 * task form on that day; dragging a tile moves the task by the notebook's
 * rules.
 */

const COLS = 'repeat(6, minmax(0, 1fr)) minmax(0, 0.62fr)';
const z = (n: number) => n;
// The calendar's type is a size up from the notebook's (owner's recording,
// 2026-10-12: "the text is too small here").
const SIZE = 13;

interface CalTask {
  key: string;
  pid: string;
  task: ContractorAssignment;
  apt?: Apartment;
  days: string[];
  label: string;
  ws: string;
  wsColor: string;
  worker?: Contractor;
  stagesOn: Stage[];
  building?: string;
  floorNo?: string;
  done: boolean;
}

type Item =
  | { kind: 'off'; col: number; span: number; t: TimeOff; key: string }
  | { kind: 'task'; col: number; span: number; ct: CalTask; segDays: string[]; key: string; away: boolean }
  | { kind: 'bundle'; col: number; span: 1; key: string; info: BundleInfo; worker?: Contractor };

const LOCALES: Record<string, string> = { en: 'en-US', he: 'he-IL' };

function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function weekStart(d: Date) { const o = new Date(d.getFullYear(), d.getMonth(), d.getDate()); o.setDate(o.getDate() - o.getDay()); return o; }
function addDaysD(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
const dayDiff = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000);
/** Shift a day, never landing on Saturday. */
const shiftNoSat = (d: string, n: number) => { const s = shiftDay(d, n); return parseDay(s).getDay() === 6 ? shiftDay(s, 1) : s; };

/** The day under a screen point — read off the week's own background columns. */
function dayAt(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const d = (el as HTMLElement).dataset?.calDay;
    if (d) return d;
  }
  return null;
}

export function CalendarPage() {
  const {
    contractorAssignments, apartments, contractors, users, projects, stages,
    currentProjectId, mainUiStrings: s, setCurrentProject, setPendingFocus,
    updateContractorAssignment, updateAssignmentInProject,
  } = useStore();
  const snapshotTick = useStore(st => st.snapshotTick);
  const navigate = useNavigate();
  const isRtl = !!s.isRtl;
  const lang = isRtl ? 'he' : 'en';
  const LT = LOCALES[lang];
  const t = (en: string, he: string) => (isRtl ? he : en);
  const timeOff = useTimeOff();
  const narrow = useMedia('(max-width: 767px)');

  const [scope, setScope] = useState<'here' | 'all'>(() => {
    try { return prefGet('calendar_scope') === 'here' ? 'here' : 'all'; } catch { return 'all'; }
  });
  const pickScope = (v: 'here' | 'all') => { setScope(v); try { prefSet('calendar_scope', v); } catch { /* private mode */ } };
  const [worker, setWorker] = useState('');
  const [showDone, setShowDone] = useState(true);
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const today = dayIso(new Date());

  const stagesFor = (pid: string) => stages
    .filter(st => (pid === 'general' ? st.projectId === 'general' : !st.projectId))
    .sort((a, b) => a.order - b.order);

  // ── Every task in scope, with what a tile needs ──────────────────────────
  const tasks: CalTask[] = useMemo(() => {
    const out: CalTask[] = [];
    const add = (pid: string, list: ContractorAssignment[], apts: Apartment[]) => {
      const proj = projects.find(p => p.id === pid);
      const ws = projectShortName(proj, isRtl, proj?.name ?? pid);
      const wsColor = projectColor(projects, pid);
      const stl = stagesFor(pid);
      for (const a of list) {
        const days = daysOf(a).map(d => String(d).slice(0, 10)).sort();
        if (!days.length) continue;
        if (worker && a.contractorId !== worker) continue;
        if (!showDone && a.completedAt) continue;
        const apt = a.apartmentId ? apts.find(x => x.id === a.apartmentId) : undefined;
        const label = a.general
          ? `${ws}${generalBuildingsText(a.general) ? ` · ${generalBuildingsText(a.general)}` : ''}`
          : apt ? (aptLabel(apt) || apt.address?.trim() || a.taskDescription) : (a.taskDescription || t('A task', 'משימה'));
        const building = apt && apt.buildingId && apt.buildingId !== 'G' ? apt.buildingId : undefined;
        out.push({
          key: `${pid}:${a.id}`, pid, task: a, apt, days, label, ws, wsColor,
          worker: contractors.find(c => c.id === a.contractorId),
          stagesOn: recordStageIds(a).map(id => stl.find(st => st.id === id)).filter((x): x is Stage => !!x),
          building, floorNo: building && apt ? rowNumOf(apt.buildingId, apt.floor) : undefined,
          done: !!a.completedAt,
        });
      }
    };
    add(currentProjectId, contractorAssignments, apartments);
    if (scope === 'all') {
      for (const w of loadAllProjectsTaskData()) {
        if (w.projectId === currentProjectId) continue;
        add(w.projectId, w.assignments, w.apartments);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorAssignments, apartments, contractors, projects, stages, currentProjectId, scope, snapshotTick, worker, showDone, isRtl]);

  // ── The month's weeks ────────────────────────────────────────────────────
  const weeks = useMemo(() => {
    const first = weekStart(month);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const out: string[][] = [];
    for (let w = first; w <= last; w = addDaysD(w, 7)) {
      out.push(Array.from({ length: 7 }, (_, i) => dayIso(addDaysD(w, i))));
    }
    return out;
  }, [month]);

  const visibleOff = useMemo(() => timeOff.filter(x => !worker || x.person === `c:${worker}`), [timeOff, worker]);

  const itemsOf = (week: string[]): Item[] => {
    const items: Item[] = [];
    // Time off: consecutive columns of one entry become one band.
    for (const off of visibleOff) {
      let i = 0;
      while (i < 7) {
        if (week[i] >= off.from && week[i] <= off.to) {
          const startCol = i;
          while (i < 7 && week[i] >= off.from && week[i] <= off.to) i++;
          items.push({ kind: 'off', col: startCol, span: i - startCol, t: off, key: `off:${off.id}:${week[0]}:${startCol}` });
        } else i++;
      }
    }
    // Tasks: consecutive columns become one bar.
    const singles = new Map<string, Item[]>();
    for (const ct of tasks) {
      const cols = week.map((d, i) => (ct.days.includes(d) ? i : -1)).filter(i => i >= 0);
      let k = 0;
      while (k < cols.length) {
        let e = k;
        while (e + 1 < cols.length && cols[e + 1] === cols[e] + 1) e++;
        const segDays = cols.slice(k, e + 1).map(c => week[c]);
        const away = !ct.done && !!ct.task.contractorId && segDays.some(d => !!offOn(timeOff, `c:${ct.task.contractorId}`, d));
        const it: Item = { kind: 'task', col: cols[k], span: e - k + 1, ct, segDays, away, key: `${ct.key}:${segDays[0]}` };
        if (it.span === 1 && ct.days.length === 1) {
          const gk = `${cols[k]}|${ct.task.contractorId ?? ''}|${ct.pid}`;
          const g = singles.get(gk);
          if (g) g.push(it); else singles.set(gk, [it]);
        } else items.push(it);
        k = e + 1;
      }
    }
    for (const [gk, group] of singles) {
      if (group.length < BUNDLE_MIN) { items.push(...group); continue; }
      const parts = gk.split('|');
      const col = Number(parts[0]);
      const pid = parts[2];
      const cts = group.map(g => (g as Extract<Item, { kind: 'task' }>).ct);
      const ordered = [...cts].sort((a, b) => Number(a.done) - Number(b.done) || a.label.localeCompare(b.label, undefined, { numeric: true }));
      const byBld = new Map<string, { floors: string[]; units: Set<string> }>();
      const stCount = new Map<string, { stage: Stage; count: number }>();
      for (const c of cts) {
        if (c.building) {
          const b = byBld.get(c.building) ?? { floors: [], units: new Set<string>() };
          if (c.floorNo) b.floors.push(c.floorNo);
          if (c.task.apartmentId) b.units.add(c.task.apartmentId);
          byBld.set(c.building, b);
        }
        for (const st of c.stagesOn) {
          const h = stCount.get(st.id);
          if (h) h.count++; else stCount.set(st.id, { stage: st, count: 1 });
        }
      }
      const proj = projects.find(p => p.id === pid);
      items.push({
        kind: 'bundle', col, span: 1, key: `bundle:${week[col]}:${gk}`, worker: cts[0].worker,
        info: {
          items: ordered.map(c => ({ taskId: c.task.id, task: c.task, label: c.label, jobId: c.task.apartmentId, done: c.done })),
          projectId: pid, workspace: projectShortName(proj, isRtl, proj?.name ?? pid), color: projectColor(projects, pid),
          done: cts.filter(c => c.done).length, day: week[col],
          buildings: [...byBld.entries()].sort((a, b) => a[0].localeCompare(b[0]))
            .map(([id, b]) => ({ id, floors: b.floors, units: b.units.size })),
          stages: [...stCount.values()].sort((a, b) => a.stage.order - b.stage.order),
        },
      });
    }
    const rank = (it: Item) => (it.kind === 'off' ? 0 : 1);
    return items.sort((a, b) => rank(a) - rank(b) || b.span - a.span || a.col - b.col
      || (a.kind === 'task' && b.kind === 'task' ? Number(a.ct.done) - Number(b.ct.done) : 0));
  };

  // ── Opening, adding, moving ──────────────────────────────────────────────
  const openTask = (ct: CalTask) => {
    const a = ct.task;
    if (!a.apartmentId) {
      if (ct.pid !== currentProjectId) setCurrentProject(ct.pid);
      navigate('/tasks');
      return;
    }
    rememberTaskFocus(a.id);
    if (ct.pid !== currentProjectId) {
      rememberReturn(currentProjectId, '/calendar', a.apartmentId);
      setCurrentProject(ct.pid);
    }
    setPendingFocus({ kind: 'task', id: a.id, apartmentId: a.apartmentId });
    navigate(ct.pid === 'general' ? '/jobs' : '/project');
  };

  const writeDays = (ct: CalTask, dds: string[]) => {
    const sorted = [...new Set(dds)].sort();
    const patch = { dueDate: sorted.length ? sorted[sorted.length - 1] : null, days: sorted.length > 1 ? sorted : undefined };
    if (ct.pid === currentProjectId) updateContractorAssignment(ct.task.id, patch);
    else updateAssignmentInProject(ct.pid, ct.task.id, patch);
  };

  const [plusDay, setPlusDay] = useState<string | null>(null);
  const [newOn, setNewOn] = useState<{ ct?: CalTask; day: string } | null>(null);
  const [dayAsk, setDayAsk] = useState<{ ct: CalTask; from: string; to: string } | null>(null);
  const [bundle, setBundle] = useState<{ info: BundleInfo; worker?: Contractor } | null>(null);
  const [offEdit, setOffEdit] = useState<TimeOff | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<{ it: Extract<Item, { kind: 'task' }>; grab: string; x: number; y: number; live: boolean } | null>(null);
  const [heldKey, setHeldKey] = useState<string | null>(null);

  function landTask(it: Extract<Item, { kind: 'task' }>, grab: string, to: string) {
    const { ct } = it;
    if (grab === to) return;
    const all = ct.days;
    // One day of a task that has others → the notebook's own question.
    if (it.span === 1 && all.length > 1) { setDayAsk({ ct, from: it.segDays[0], to }); return; }
    // The whole task moves, keeping its WORKING-DAY pattern (the notebook's rule).
    const delta = dayDiff(grab, to);
    const friday = all.some(d => parseDay(d).getDay() === 5);
    const first = all[0];
    const fromRun = workingRun(first, 80, friday).days;
    const toRun = workingRun(shiftNoSat(first, delta), 80, friday).days;
    writeDays(ct, all.map(d => {
      const i = fromRun.indexOf(d);
      return i >= 0 && i < toRun.length ? toRun[i] : shiftNoSat(d, delta);
    }));
  }

  function resolveDay(choice: DayChoice) {
    if (!dayAsk) return;
    const { ct, from, to } = dayAsk;
    setDayAsk(null);
    const days = daysOf(ct.task);
    if (choice === 'move') { const r = moveTaskDay(days, from, to); if (r) writeDays(ct, r.days); }
    else if (choice === 'add') { const r = addTaskDay(days, to); if (r) writeDays(ct, r.days); }
    else if (choice === 'merge') { const r = removeTaskDay(days, from); if (r) writeDays(ct, r.days); }
    else if (choice === 'new') setNewOn({ ct, day: to });
  }

  const tileHandlers = (it: Extract<Item, { kind: 'task' }>) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const grab = dayAt(e.clientX, e.clientY) ?? it.segDays[0];
      drag.current = { it, grab, x: e.clientX, y: e.clientY, live: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d || d.it.key !== it.key) return;
      if (!d.live && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
      if (it.ct.done) return;   // a closed task is the record — it stays where it happened
      if (!d.live) { d.live = true; setHeldKey(it.key); }
      setOver(dayAt(e.clientX, e.clientY));
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      setHeldKey(null); setOver(null);
      if (!d) return;
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (!d.live) { openTask(it.ct); return; }
      const to = dayAt(e.clientX, e.clientY);
      if (to) landTask(it, d.grab, to);
    },
    onPointerCancel: () => { drag.current = null; setHeldKey(null); setOver(null); },
  });

  const words = bundleWords(lang);
  const monthTitle = month.toLocaleDateString(LT, { month: 'long', year: 'numeric' });
  const weekdays = Array.from({ length: 7 }, (_, i) => addDaysD(weekStart(new Date()), i).toLocaleDateString(LT, { weekday: 'short' }));
  const count = tasks.length;
  const tw = timeOffWords(lang);

  useEffect(() => {
    // A press anywhere else puts a finger's "+" away again.
    if (!plusDay) return;
    const up = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.('[data-cal-plus]')) setPlusDay(null); };
    window.addEventListener('pointerdown', up, true);
    return () => window.removeEventListener('pointerdown', up, true);
  }, [plusDay]);

  return (
    <div className="p-3 md:p-6 w-full" data-calendar-page>
      <h1 className="hidden md:flex text-2xl font-bold text-gray-900 mb-4 items-center gap-2">
        <CalendarDays size={24} className="text-[#1e3a5f]" />
        {s.navCalendar}
      </h1>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1">
          <button data-cal-prev onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600" title={t('Previous month', 'החודש הקודם')}>
            {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          <span data-cal-title className="text-[15px] font-extrabold text-slate-800 min-w-[140px] text-center">{monthTitle}</span>
          <button data-cal-next onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600" title={t('Next month', 'החודש הבא')}>
            {isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          <button data-cal-today onClick={() => setMonth(monthStart(new Date()))}
            className="ms-1 px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
            {s.today}
          </button>
        </div>

        <div className="flex rounded-lg border border-gray-200 overflow-hidden" data-calendar-scope={scope}>
          {(['here', 'all'] as const).map(v => (
            <button key={v} type="button" data-calendar-scope-pick={v} onClick={() => pickScope(v)}
              className={`px-3 py-1.5 text-xs font-semibold ${scope === v ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {(v === 'here' ? s.tpScopeHere : s.tpScopeAll).replace(/\s*\(\{n\}\)\s*/, '').trim()}
            </button>
          ))}
        </div>

        <select data-cal-worker value={worker} onChange={e => setWorker(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white">
          <option value="">{s.allContractors}</option>
          {contractors.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <button data-cal-done onClick={() => setShowDone(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className="relative w-9 h-5 rounded-full transition-colors" style={{ backgroundColor: showDone ? '#16a34a' : '#cbd5e1' }}>
            <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: showDone ? 18 : 2 }} />
          </span>
          {t('Done', 'בוצע')} ✓
        </button>

        <span className="text-xs text-gray-400 ms-auto">{count} · {s.navTasks}</span>
        <button data-cal-print onClick={() => {
          // The month on paper: every task day in it, in date order, and the days away.
          const first = dayIso(month);
          const last = dayIso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
          type Row = { day: string; what: string; where: string; who: string; stages: string; state: string };
          const rows: Row[] = [];
          for (const ct of tasks) for (const d of ct.days) {
            if (d < first || d > last) continue;
            rows.push({ day: d, what: ct.label, where: `${ct.ws}${ct.building ? ` · ${ct.building}` : ''}`,
              who: ct.worker?.name ?? '', stages: ct.stagesOn.map(st => getStageName(st, isRtl)).join(', '),
              state: ct.done ? t('done', 'בוצע') : '' });
          }
          for (const o of visibleOff) for (let d = o.from; d <= o.to; d = shiftDay(d, 1)) {
            if (d < first || d > last) continue;
            rows.push({ day: d, what: bandLine(o, lang), where: '', who: personOf(o.person, contractors, users).name, stages: '', state: '' });
          }
          rows.sort((a, b) => a.day.localeCompare(b.day) || a.who.localeCompare(b.who));
          printTable(`${s.navCalendar} — ${monthTitle}`, rows, [
            { header: t('Day', 'יום'), value: r => parseDay(r.day).toLocaleDateString(LT, { weekday: 'short', day: 'numeric', month: 'short' }), width: '14%' },
            { header: t('What', 'מה'), value: r => r.what },
            { header: t('Where', 'איפה'), value: r => r.where, width: '16%' },
            { header: t('Who', 'מי'), value: r => r.who, width: '12%' },
            { header: t('Stages', 'שלבים'), value: r => r.stages },
            { header: '', value: r => r.state, width: '7%' },
          ], { rtl: isRtl, landscape: true });
        }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title={t('Print the month', 'הדפסת החודש')}>
          <Printer size={16} />
        </button>
      </div>

      <div className={narrow ? 'overflow-x-auto edge-fade -mx-3 px-3' : ''}>
        <div style={{ minWidth: narrow ? 760 : undefined }} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {/* The weekday row */}
          <div className="grid border-b border-gray-200 bg-slate-50" style={{ gridTemplateColumns: COLS }}>
            {weekdays.map((w, i) => (
              <div key={i} className={`px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide ${i === 6 ? 'text-gray-300' : 'text-gray-500'}`}>{w}</div>
            ))}
          </div>

          {weeks.map(week => {
            const items = itemsOf(week);
            return (
              <div key={week[0]} data-cal-week={week[0]} className="relative border-b border-gray-100 last:border-b-0" style={{ minHeight: 118 }}>
                {/* The day columns: borders, today, the month's edges, the drop target. */}
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: COLS }}>
                  {week.map((d, i) => {
                    const inMonth = parseDay(d).getMonth() === month.getMonth();
                    return (
                      <div key={d} data-cal-day={d}
                        className="border-gray-100"
                        style={{
                          borderInlineStartWidth: i ? 1 : 0,
                          backgroundColor: over === d ? '#dbeafe' : d === today ? '#f0f9ff' : i === 6 ? '#f8fafc' : inMonth ? '#fff' : '#fafafa',
                          outline: over === d ? '2px solid #4aa8d8' : undefined, outlineOffset: -2,
                        }} />
                    );
                  })}
                </div>

                <div className="relative grid gap-y-1 pb-1.5" style={{ gridTemplateColumns: COLS, gridAutoFlow: 'row dense' }}>
                  {/* Day numbers and the + */}
                  {week.map((d, i) => {
                    const inMonth = parseDay(d).getMonth() === month.getMonth();
                    const isToday = d === today;
                    return (
                      <div key={d} className="group/day flex items-center justify-between px-1.5 pt-1"
                        style={{ gridRow: 1, gridColumn: i + 1 }}
                        onPointerDown={e => { if (e.pointerType === 'touch') setPlusDay(d); }}>
                        <span className={`text-[12px] font-bold tabular-nums ${isToday ? 'bg-[#1e3a5f] text-white rounded-full px-1.5' : inMonth ? 'text-slate-700' : 'text-gray-300'}`}>
                          {parseDay(d).getDate()}
                        </span>
                        {i !== 6 && (
                          <button data-cal-plus={d} onClick={() => { setPlusDay(null); setNewOn({ day: d }); }}
                            title={t('Add a task on this day', 'הוספת משימה ביום הזה')}
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-white transition-opacity ${
                              plusDay === d ? 'opacity-100' : 'opacity-0 group-hover/day:opacity-100'}`}
                            style={{ backgroundColor: '#1e3a5f' }}>
                            <Plus size={12} strokeWidth={3} />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {items.map(it => {
                    const place = { gridColumn: `${it.col + 1} / span ${it.span}` };
                    if (it.kind === 'off') {
                      const who = personOf(it.t.person, contractors, users);
                      return (
                        <button key={it.key} data-cal-off={it.t.kind} data-cal-off-person={it.t.person}
                          onClick={() => setOffEdit(it.t)}
                          title={`${who.name} · ${bandLine(it.t, lang, true)}${it.t.note ? ` — ${it.t.note}` : ''}`}
                          className="mx-1 rounded-md px-1.5 py-0.5 text-start truncate text-[11px] font-extrabold border"
                          style={{ ...place, alignSelf: 'start', backgroundImage: hatchOf(it.t.kind), color: TIME_OFF_COLOR[it.t.kind].ink, borderColor: TIME_OFF_COLOR[it.t.kind].stripe }}>
                          <span className="inline-block w-2 h-2 rounded-full me-1 align-middle" style={{ backgroundColor: who.color }} />
                          {who.name} · {bandLine(it.t, lang)}
                        </button>
                      );
                    }
                    if (it.kind === 'bundle') {
                      return (
                        <div key={it.key} className="mx-1 min-w-0" style={place}>
                          <BundleBar bundle={it.info} height={30} z={z} size={SIZE} strip={false} words={words}
                            onOpen={() => setBundle({ info: it.info, worker: it.worker })} />
                        </div>
                      );
                    }
                    return (
                      <CalTile key={it.key} it={it} place={place} lang={lang} isRtl={isRtl}
                        held={heldKey === it.key} handlers={tileHandlers(it)} awayWord={tw.heAway} />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The + : the notebook's own task form, starting on that day, nobody chosen yet. */}
      {newOn && createPortal(
        <PlannerTaskDialog
          job={newOn.ct?.apt}
          jobProjectId={newOn.ct?.pid}
          jobs={apartments}
          person={newOn.ct?.worker
            ? { name: newOn.ct.worker.name, color: personColor(newOn.ct.worker.name, newOn.ct.worker.color), contractorId: newOn.ct.worker.id }
            : { name: '', color: '#1e3a5f' }}
          dayIso={newOn.day}
          contractors={contractors}
          noPark
          onCancel={() => setNewOn(null)}
          onDone={() => setNewOn(null)}
        />,
        document.body,
      )}

      {dayAsk && (() => {
        const all = daysOf(dayAsk.ct.task);
        const who = dayAsk.ct.worker?.name ?? '';
        const lab = (d: string) => `${who ? `${who} · ` : ''}${parseDay(d).toLocaleDateString(LT, { weekday: 'short', day: 'numeric', month: 'short' })}`;
        return createPortal(
          <PlannerDayDialog jobName={dayAsk.ct.label} dayNum={all.indexOf(dayAsk.from) + 1} dayCount={all.length}
            fromLabel={lab(dayAsk.from)} toLabel={lab(dayAsk.to)}
            toDay={parseDay(dayAsk.to).toLocaleDateString(LT, { weekday: 'long', day: 'numeric', month: 'long' })}
            covered={all.includes(dayAsk.to)} onCancel={() => setDayAsk(null)} onDone={resolveDay} />,
          document.body,
        );
      })()}

      {bundle && (
        <BundlePopup bundle={bundle.info} person={bundle.worker?.name ?? ''}
          personColor={bundle.worker ? personColor(bundle.worker.name, bundle.worker.color) : '#64748b'}
          dayLabel={parseDay(bundle.info.day).toLocaleDateString(LT, { weekday: 'long', day: 'numeric', month: 'long' })}
          stages={stagesFor(bundle.info.projectId)} words={words} isRtl={isRtl}
          onClose={() => setBundle(null)}
          onOpenItem={item => {
            setBundle(null);
            const ct = tasks.find(c => c.task.id === item.taskId && c.pid === bundle.info.projectId);
            if (ct) openTask(ct);
          }} />
      )}

      {offEdit && (() => {
        const who = personOf(offEdit.person, contractors, users);
        return <TimeOffDialog person={offEdit.person} name={who.name} color={who.color} initial={offEdit} onClose={() => setOffEdit(null)} />;
      })()}
    </div>
  );
}

/**
 * One task on the calendar — look A, the notebook's small board tile: a white
 * card framed in its first stage's colour (green when done), the unit's name
 * wrapping, the stages as pills, then workspace · building · the worker's dot.
 * A task over several days is one bar across them, "N days" on it.
 */
function CalTile({ it, place, lang, isRtl, held, handlers, awayWord }: {
  it: Extract<Item, { kind: 'task' }>;
  place: React.CSSProperties;
  lang: string;
  isRtl: boolean;
  held: boolean;
  handlers: Record<string, (e: never) => void>;
  awayWord: string;
}) {
  const { ct } = it;
  const frame = ct.done ? '#16a34a' : (ct.stagesOn[0]?.color ?? '#94a3b8');
  const wColor = ct.worker ? personColor(ct.worker.name, ct.worker.color) : '#94a3b8';
  const doneWord = lang === 'he' ? 'בוצע' : 'done';
  return (
    <div data-cal-task={ct.task.id} data-cal-ws={ct.pid} data-cal-days={it.span}
      {...(ct.done ? { 'data-cal-done': '1' } : {})}
      {...(it.away ? { 'data-cal-away': '1' } : {})}
      {...handlers}
      title={`${ct.label}${ct.task.taskDescription ? ` — ${ct.task.taskDescription}` : ''}\n${ct.done ? '' : 'Click to open · drag to another day'}`}
      className="mx-1 min-w-0 rounded-lg px-1.5 py-1 select-none cursor-pointer hover:brightness-[.98]"
      style={{
        ...place, touchAction: 'pan-y',
        backgroundColor: ct.done ? '#f0fdf4' : '#fff',
        border: `2px solid ${frame}`,
        opacity: held ? 0.45 : 1,
        boxShadow: '0 1px 2px rgba(15,23,42,.06)',
      }}>
      <div className="flex items-start gap-1 min-w-0">
        <span className="font-extrabold text-[13.5px] leading-tight text-slate-800 break-words min-w-0 flex-1" data-cal-label>
          {ct.label}
        </span>
        {ct.done && (
          <span className="flex-shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 text-[11px] font-extrabold text-white" style={{ backgroundColor: '#16a34a' }}>
            <Check size={11} strokeWidth={3.5} />{doneWord}
          </span>
        )}
      </div>
      {ct.stagesOn.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-0.5">
          {ct.stagesOn.map(st => (
            <StagePill key={st.id} name={getStageName(st, isRtl)} color={st.color} avail={0} size={SIZE} z={z} wrap />
          ))}
        </div>
      )}
      {/* WHO, first and in his own colour (owner's recording, 2026-10-12:
          "it's very hard to see which worker we're talking about here") —
          a dot and grey text at the end of the line was the whole problem. */}
      <div className="flex items-center flex-wrap gap-1 mt-1 min-w-0 text-[12px] font-semibold text-slate-500">
        {ct.worker && (
          <span data-cal-worker={ct.worker.name} className="flex-shrink-0 max-w-full truncate rounded-full px-2 text-[12px] font-extrabold text-white leading-[1.45]"
            style={{ backgroundColor: wColor }}>
            {ct.worker.name}
          </span>
        )}
        <span className="flex-shrink-0 px-1.5 rounded text-white text-[11px] font-extrabold" style={{ backgroundColor: ct.wsColor }}>{ct.ws}</span>
        {ct.building && <span className="flex-shrink-0 px-1.5 rounded bg-[#1e3a5f] text-white text-[11px] font-black">{ct.building}</span>}
        {ct.days.length > 1 && <span className="flex-shrink-0">{ct.days.length} {lang === 'he' ? 'ימים' : 'days'}</span>}
      </div>
      {it.away && (
        <span data-cal-away-tag className="inline-block mt-0.5 rounded-full px-1.5 text-[11px] font-extrabold"
          style={{ backgroundColor: '#fff1f2', color: '#be123c', border: '1px solid #fda4af' }}>⚠ {awayWord}</span>
      )}
    </div>
  );
}
