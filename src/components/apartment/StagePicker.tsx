import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock, ChevronDown, AlertTriangle, X, Plus, Hammer, CalendarDays } from 'lucide-react';
import { Stage, MainUiStrings, Apartment, ContractorAssignment, Contractor, ContractorPhoto, StageMark, getStageName } from '../../types';
import {
  stageSetOf, liveStateOf, cycleMark, setMark, progressOf, isWorkStage, taskStageIds,
  StageState, SetContext,
} from '../../data/stageMarks';
import { format, parseISO } from 'date-fns';

/**
 * THE APARTMENT'S STAGE BOARD (the set model, built 2026-09-22 from the
 * owner's "Bubbles, Not Stages" plan). On screen the word is still STAGE.
 *
 * The field still reads like the old current-stage picker — one headline
 * word, the fraction beside it — but the panel underneath is no longer a
 * ladder you stand somewhere on. It is the apartment's own set of work,
 * grouped by state:
 *
 *   Happening now · Booked · Half done · Still to do · Done · Not needed
 *
 * TAP a stage and it moves on (to do → happening now → done); RIGHT-click
 * marks it half done; the × takes it off this apartment (it stops
 * counting, locked answers 6 + 13 — office only, which this window is);
 * "+ add a stage" puts another one on, from the workspace list or a brand-
 * new custom one for this apartment alone (locked answer 16). Nothing has
 * to be "current": the headline is derived by the store from the marks.
 *
 * The panel renders through a PORTAL at z-[140]: the drawer's body is an
 * overflow scroller, and no z-index saves a child from its parent's
 * scissors — the drawer tooltips' disease, cured the same way.
 */

const CUSTOM_COLORS = ['#e11d48', '#0d9488', '#7c3aed', '#ea580c', '#2563eb', '#16a34a', '#d97706', '#64748b'];

export type CustomWhere = 'apartment' | 'tipus' | 'building' | 'workspace';

export function StagePicker({
  apartment, stages, tasks, ctx, workers, photos, onMarks, onMarker, onAddCustom, ui, onReportProblem, problem,
}: {
  apartment: Apartment;
  /** The workspace's own stages, sorted — markers included. */
  stages: Stage[];
  tasks: ContractorAssignment[];
  ctx: SetContext;
  workers: Contractor[];
  photos: ContractorPhoto[];
  /** The one writer: the next marks (the store derives the headline). */
  onMarks: (next: Record<string, StageMark> | undefined) => void;
  /** A MARKER pressed — "the whole flat is Ready to start / Job completed". */
  onMarker: (stageId: string) => void;
  onAddCustom: (input: { name: string; color: string; where: CustomWhere }) => void;
  ui: MainUiStrings;
  /** "Report a problem" lives UNDER the list, red and only red (owner, 2026-09-06). */
  onReportProblem?: () => void;
  problem?: 'open' | 'waiting' | null;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState<{ name: string; color: string; where: CustomWhere } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const rtl = !!ui.isRtl;

  const marks = apartment.stageMarks;
  const current = stages.find(s => s.id === apartment.currentStageId);
  const set = stageSetOf(apartment, stages, ctx);
  const progress = progressOf(apartment, stages, ctx);
  const stateOf = (id: string): StageState => liveStateOf(apartment, id, stages, tasks);
  const workStages = stages.filter(st => isWorkStage(st) && st.active);
  const markers = stages.filter(st => !isWorkStage(st) && st.active);
  const off = workStages.filter(st => marks?.[st.id] === 'off');
  const notOnApt = workStages.filter(st => !set.some(x => x.id === st.id) && marks?.[st.id] !== 'off');
  const pendingCount = Object.values(marks ?? {}).filter(m => m === 'pending').length;

  const groups: Array<{ key: StageState; label: string }> = [
    { key: 'doing', label: ui.setHappeningNow },
    { key: 'problem', label: ui.problemLabel },
    { key: 'booked', label: ui.setBooked },
    { key: 'pending', label: ui.setHalfDone },
    { key: 'todo', label: ui.setStillToDo },
    { key: 'done', label: ui.setDone },
  ];
  const rows = set.map(st => ({ stage: st, state: stateOf(st.id) }));

  /** The small line under a bubble: who is on it, when it is booked, how many pictures. */
  function whoLine(st: Stage, state: StageState): string {
    const open = tasks.filter(t => t.apartmentId === apartment.id && !t.completedAt && taskStageIds(t).includes(st.id));
    const names = (ts: ContractorAssignment[]) => [...new Set(ts.map(t => workers.find(w => w.id === t.contractorId)?.name).filter(Boolean))];
    if (state === 'doing') {
      const ts = open.filter(t => t.stageReport);
      const who = names(ts.length ? ts : open);
      return who.length ? `${who.join(', ')} · ${ui.today}` : '';
    }
    if (state === 'booked') {
      const t = open.find(x => x.dueDate);
      const who = names(open);
      const day = t?.dueDate ? format(parseISO(t.dueDate), 'EEE d') : '';
      return [who.join(', '), day].filter(Boolean).join(' · ');
    }
    if (state === 'done') {
      const aptTaskIds = new Set(tasks.filter(t => t.apartmentId === apartment.id).map(t => t.id));
      const n = photos.filter(p => p.stageId === st.id && aptTaskIds.has(p.assignmentId)).length;
      const closed = tasks.filter(t => t.apartmentId === apartment.id && t.completedAt && taskStageIds(t).includes(st.id))
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0];
      const who = closed ? workers.find(w => w.id === closed.contractorId)?.name : '';
      return [n ? `📷 ${n}` : '', who].filter(Boolean).join(' · ');
    }
    return '';
  }

  function openPanel() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 300);
    const left = rtl
      ? Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
      : Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ left, top: Math.min(r.bottom + 4, window.innerHeight - 60), width });
    setAdding(false); setCustom(null);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Capture, and stopPropagation, so the drawer's own Escape stays shut out
    // while the panel is the thing being closed.
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (custom) setCustom(null); else if (adding) setAdding(false); else setOpen(false);
      }
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key, true);
    };
  }, [open, adding, custom]);

  const ring = (st: Stage, state: StageState) => {
    const c = st.color;
    if (state === 'done') return <span className="w-[15px] h-[15px] rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: c }}><Check size={10} color="#fff" strokeWidth={3.5} /></span>;
    if (state === 'doing') return <span className="w-[15px] h-[15px] rounded-full flex-shrink-0 flex items-center justify-center" style={{ border: `2.5px solid ${c}` }}><span className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: c }} /></span>;
    if (state === 'pending') return <span className="w-[15px] h-[15px] rounded-full flex-shrink-0 overflow-hidden" style={{ border: `2.5px solid ${c}` }}><span className="block w-1/2 h-full" style={{ backgroundColor: c }} /></span>;
    if (state === 'booked') return <span className="w-[15px] h-[15px] rounded-full flex-shrink-0" style={{ border: `2.5px dashed ${c}` }} />;
    if (state === 'problem') return <span className="w-[15px] h-[15px] rounded-full flex-shrink-0 flex items-center justify-center text-white font-black text-[10px]" style={{ backgroundColor: '#dc2626' }}>!</span>;
    if (state === 'off') return <span className="w-[15px] h-[15px] rounded-full flex-shrink-0" style={{ border: '2px dashed #cbd5e1' }} />;
    return <span className="w-[15px] h-[15px] rounded-full flex-shrink-0" style={{ border: `2.5px solid ${c}` }} />;
  };

  const bubble = (st: Stage, state: StageState) => {
    const who = whoLine(st, state);
    const done = state === 'done';
    return (
      <div
        key={st.id}
        data-stage-bubble={st.id}
        data-stage-state={state}
        role="button"
        tabIndex={0}
        title={ui.setTapHint}
        onClick={() => onMarks(cycleMark(marks, st.id, 'left', state))}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onMarks(cycleMark(marks, st.id, 'right', state)); }}
        onKeyDown={e => { if (e.key === 'Enter') onMarks(cycleMark(marks, st.id, 'left', state)); }}
        className="group/bub inline-flex items-center gap-1.5 rounded-full border pl-1.5 pr-1 py-1 text-[11.5px] font-bold cursor-pointer select-none max-w-full"
        style={{
          borderColor: state === 'problem' ? '#dc2626' : done ? `${st.color}55` : st.color,
          backgroundColor: state === 'doing' ? `${st.color}1f` : state === 'pending' ? '#fff7ed' : state === 'problem' ? '#fef2f2' : '#fff',
          color: done ? '#64748b' : '#0f172a',
          boxShadow: state === 'doing' ? `0 0 0 3px ${st.color}33` : undefined,
        }}
      >
        {ring(st, state)}
        <span className="truncate" style={done ? { textDecoration: 'line-through' } : undefined}>{getStageName(st, rtl)}</span>
        {who && <span className="text-[9.5px] font-semibold text-gray-500 whitespace-nowrap">{who}</span>}
        {state === 'pending' && <Clock size={11} className="pending-glow flex-shrink-0" style={{ color: '#f97316' }} />}
        {state === 'doing' && <Hammer size={10} className="flex-shrink-0" style={{ color: st.color }} />}
        {state === 'booked' && <CalendarDays size={10} className="flex-shrink-0 text-gray-400" />}
        {!done && (
          <button
            data-stage-off={st.id}
            onClick={e => { e.stopPropagation(); onMarks(setMark(marks, st.id, 'off')); }}
            title={ui.setNotNeededAct}
            className="w-4 h-4 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/bub:opacity-100 flex-shrink-0"
          ><X size={10} /></button>
        )}
      </div>
    );
  };

  const groupLabel = (text: string) => (
    <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-gray-400 mt-2 mb-1 first:mt-0">{text}</div>
  );

  return (
    <>
      <button
        ref={btnRef}
        data-stage-picker
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-left rtl:text-right
                   focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white flex items-center gap-1.5"
        style={problem
          ? { borderColor: problem === 'open' ? '#dc2626' : '#f43f5e', backgroundColor: problem === 'open' ? '#fef2f2' : '#fff1f2', borderLeftWidth: '3px' }
          : { borderLeftColor: current?.color, borderLeftWidth: current ? '3px' : undefined }}
      >
        {problem
          ? <span data-stage-problem className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
              style={{ backgroundColor: problem === 'open' ? '#dc2626' : '#f43f5e' }}>!</span>
          : current && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: current.color }} />}
        <span className="flex-1 min-w-0 truncate" style={problem ? { color: problem === 'open' ? '#b91c1c' : '#be123c', fontWeight: 700 } : undefined}>
          {problem
            ? `${problem === 'open' ? ui.problemLabel.toUpperCase() : ui.problemWaiting}${current ? ` · ${ui.problemWas} ${getStageName(current, rtl)}` : ''}`
            : current ? getStageName(current, rtl) : ui.notStartedOption}
        </span>
        {progress.total > 0 && (
          <span data-stage-fraction className="flex-shrink-0 text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: progress.done === progress.total ? '#dcfce7' : '#f1f5f9', color: progress.done === progress.total ? '#15803d' : '#334155' }}>
            {progress.done}/{progress.total}
          </span>
        )}
        {pendingCount > 0 && (
          <span className="flex items-center gap-0.5 flex-shrink-0 text-[10px] font-bold" style={{ color: '#f97316' }}>
            <Clock size={11} className="pending-glow" />{pendingCount}
          </span>
        )}
        <ChevronDown size={13} className="flex-shrink-0 text-gray-400" />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          data-stage-panel
          dir={rtl ? 'rtl' : 'ltr'}
          className="fixed z-[140] bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden flex flex-col"
          style={{ left: pos.left, top: pos.top, width: Math.max(pos.width, 340), maxHeight: 'min(520px, calc(100dvh - 24px))' }}
        >
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {/* Segmented strip — the same picture the buildings page draws. */}
            {rows.length > 0 && (
              <div data-stage-strip className="flex gap-[2px] h-[6px] rounded-full overflow-hidden mb-2">
                {rows.map(r => (
                  <span key={r.stage.id} className="flex-1" style={{
                    backgroundColor: r.state === 'done' || r.state === 'doing' ? r.stage.color
                      : r.state === 'pending' ? '#f97316' : r.state === 'problem' ? '#dc2626' : '#e5e7eb',
                    opacity: r.state === 'doing' ? 0.55 : 1,
                  }} />
                ))}
              </div>
            )}
            {groups.map(g => {
              const list = rows.filter(r => r.state === g.key);
              if (!list.length) return null;
              return (
                <div key={g.key} data-stage-group={g.key}>
                  {groupLabel(g.label)}
                  <div className="flex flex-wrap gap-1.5">{list.map(r => bubble(r.stage, r.state))}</div>
                </div>
              );
            })}
            {off.length > 0 && (
              <div data-stage-group="off">
                {groupLabel(ui.setNotNeeded)}
                <div className="flex flex-wrap gap-1.5">
                  {off.map(st => (
                    <span key={st.id} data-stage-bubble={st.id} data-stage-state="off"
                      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 pl-1.5 pr-1 py-1 text-[11.5px] font-semibold text-gray-400 max-w-full">
                      {ring(st, 'off')}
                      <span className="truncate">{getStageName(st, rtl)}</span>
                      <button data-stage-putback={st.id} onClick={() => onMarks(setMark(marks, st.id, 'todo'))}
                        className="text-[9.5px] font-bold text-[#1e3a5f] px-1.5 py-0.5 rounded-full hover:bg-[#1e3a5f]/10">{ui.setPutBack}</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* + add a stage: from the list, or a new custom one (locked answers 15 + 16). */}
            <div className="mt-2.5">
              {!adding ? (
                <button data-stage-add onClick={() => setAdding(true)}
                  className="text-[11px] font-bold text-gray-500 border border-dashed border-gray-300 rounded-full px-2.5 py-1 hover:border-[#1e3a5f] hover:text-[#1e3a5f]">
                  {ui.setAddStage}
                </button>
              ) : custom ? (
                <div data-stage-custom-form className="rounded-xl border border-dashed border-gray-400 bg-white p-2.5 space-y-2">
                  <div className="text-[10.5px] font-extrabold text-gray-800">{ui.setNewCustom}</div>
                  <label className="block">
                    <span className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400">{ui.setCustomName}</span>
                    <input data-stage-custom-name autoFocus value={custom.name} data-enter-own
                      onChange={e => setCustom({ ...custom, name: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter' && custom.name.trim()) { onAddCustom({ ...custom, name: custom.name.trim() }); setCustom(null); setAdding(false); } }}
                      className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
                  </label>
                  <div>
                    <span className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400">{ui.pickColor}</span>
                    <div className="mt-1 flex gap-1.5">
                      {CUSTOM_COLORS.map(c => (
                        <button key={c} data-stage-custom-color={c} onClick={() => setCustom({ ...custom, color: c })}
                          className="w-[18px] h-[18px] rounded-full"
                          style={{ backgroundColor: c, boxShadow: custom.color === c ? `0 0 0 2px #fff, 0 0 0 3.5px ${c}` : undefined }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400">{ui.setCustomWhere}</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {([
                        ['apartment', ui.setOnlyThisApt],
                        ...(apartment.tipus ? [['tipus', ui.setEveryTipus.replace('{t}', apartment.tipus)]] : []),
                        ...(apartment.buildingId && apartment.buildingId !== 'G' ? [['building', ui.setWholeBuilding]] : []),
                        ['workspace', ui.setWholeWorkspace],
                      ] as Array<[CustomWhere, string]>).map(([w, label]) => (
                        <button key={w} data-stage-custom-where={w} onClick={() => setCustom({ ...custom, where: w })}
                          className="text-[10.5px] font-bold px-2 py-1 rounded-full border"
                          style={custom.where === w
                            ? { borderColor: '#1e3a5f', backgroundColor: '#1e3a5f', color: '#fff' }
                            : { borderColor: '#e5e7eb', color: '#64748b', backgroundColor: '#fff' }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1.5 pt-0.5">
                    <button data-stage-custom-add disabled={!custom.name.trim()}
                      onClick={() => { onAddCustom({ ...custom, name: custom.name.trim() }); setCustom(null); setAdding(false); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#1e3a5f] disabled:opacity-40">{ui.add}</button>
                    <button onClick={() => setCustom(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50">{ui.cancel}</button>
                  </div>
                </div>
              ) : (
                <div data-stage-add-panel className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-2.5">
                  <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-gray-400 mb-1">{ui.setAddExisting}</div>
                  {notOnApt.length ? (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {notOnApt.map(st => (
                        <button key={st.id} data-stage-add-pick={st.id}
                          onClick={() => { onMarks(setMark(marks, st.id, 'todo')); setAdding(false); }}
                          className="inline-flex items-center gap-1.5 rounded-full border bg-white pl-1.5 pr-2.5 py-1 text-[11.5px] font-bold text-gray-700 hover:border-[#1e3a5f]"
                          style={{ borderColor: `${st.color}88` }}>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                          {getStageName(st, rtl)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10.5px] text-gray-400 mb-2">{ui.setNothingToPick}</div>
                  )}
                  <div className="flex items-center gap-2">
                    <button data-stage-custom-start onClick={() => setCustom({ name: '', color: CUSTOM_COLORS[0], where: 'apartment' })}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1e3a5f] border border-[#1e3a5f]/30 rounded-full px-2.5 py-1 bg-white hover:bg-[#1e3a5f]/5">
                      <Plus size={11} /> {ui.setNewCustom}
                    </button>
                    <button onClick={() => setAdding(false)} className="text-[11px] text-gray-400 hover:text-gray-600">{ui.cancel}</button>
                  </div>
                </div>
              )}
            </div>

            {/* The markers — the whole flat's state, not work anybody does. */}
            {markers.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-gray-400">{ui.setFlatIs}</span>
                {markers.map(m => {
                  const on = apartment.currentStageId === m.id;
                  return (
                    <button key={m.id} data-stage-marker={m.id} data-on={on ? '1' : undefined}
                      onClick={() => { onMarker(m.id); setOpen(false); }}
                      className="text-[10.5px] font-bold px-2 py-0.5 rounded-full border"
                      style={on
                        ? { borderColor: m.color, backgroundColor: m.color, color: '#fff' }
                        : { borderColor: '#e5e7eb', color: '#64748b', backgroundColor: '#fff' }}>
                      {getStageName(m, rtl)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {onReportProblem && (
            <button
              data-report-problem
              onClick={() => { setOpen(false); onReportProblem(); }}
              className="mx-2 mb-1.5 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-extrabold text-white flex-shrink-0"
              style={{ backgroundColor: '#dc2626' }}
            >
              <AlertTriangle size={13} /> {ui.reportProblem}
            </button>
          )}
          <div className="px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400 flex-shrink-0">
            {ui.setTapHint}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
