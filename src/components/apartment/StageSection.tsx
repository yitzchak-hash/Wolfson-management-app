import React, { useState } from 'react';
import { Check, AlertTriangle, X, Plus, Hammer, CalendarDays, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Stage, MainUiStrings, Apartment, ContractorAssignment, Contractor, ContractorPhoto, StageMark, getStageName } from '../../types';
import {
  stageSetOf, liveStateOf, cycleMark, setMark, isWorkStage, taskStageIds, markerRole, isStartStage,
  StageState, SetContext,
} from '../../data/stageMarks';
import { driveThumbUrl } from '../../data/driveApi';
import type { CustomWhere } from './StagePicker';
import { includeIn } from '../../data/stageIncludes';

/**
 * THE STAGES, AS A SECTION OF THE WINDOW (owner, recording 2026-10-28).
 *
 * "There is no current stage … a lot of times we do everything together", so
 * the one-field "Current stage" picker gave way to the apartment's whole set
 * laid out in lines, always open: each stage's name big, its parts under it
 * (the `includes` words kept in Settings → Stages), who finished it and on
 * what day, what was done only in part, and its pictures as thumbnails that
 * grow under the pointer. Sold/Start is not in the list — it is where every
 * apartment starts, and it ticks itself the moment any work begins.
 *
 * The marking is the picker's, unchanged: tap a stage's ring to move it on
 * (to do → happening → done), right-click for half done, × to take it off
 * this apartment, "+ add a stage" to put one on, and Report a problem.
 */

export interface StagePhotoItem {
  fileId: string;
  filename: string;
  mimeType: string;
  thumbSrc: string;
  downloadHref: string;
}

const CUSTOM_COLORS = ['#e11d48', '#0d9488', '#7c3aed', '#ea580c', '#2563eb', '#16a34a', '#d97706', '#64748b'];

function photoSrc(p: ContractorPhoto, size: number): string {
  if (p.driveFileId) return driveThumbUrl(p.driveFileId, size);
  return p.storageUrl || p.dataUrl || '';
}

export function StageSection({
  apartment, stages, tasks, ctx, workers, photos, onMarks, onMarker, onAddCustom, ui, onReportProblem, onOpenPhotos,
}: {
  apartment: Apartment;
  stages: Stage[];
  tasks: ContractorAssignment[];
  ctx: SetContext;
  workers: Contractor[];
  photos: ContractorPhoto[];
  onMarks: (next: Record<string, StageMark> | undefined) => void;
  onMarker: (stageId: string) => void;
  onAddCustom: (input: { name: string; color: string; where: CustomWhere }) => void;
  ui: MainUiStrings;
  onReportProblem?: () => void;
  onOpenPhotos: (items: StagePhotoItem[], index: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState<{ name: string; color: string; where: CustomWhere } | null>(null);
  const rtl = !!ui.isRtl;
  const marks = apartment.stageMarks;
  const set = stageSetOf(apartment, stages, ctx).filter(st => !isStartStage(st));
  const workStages = stages.filter(st => isWorkStage(st) && st.active && !isStartStage(st));
  const markers = stages.filter(st => !isWorkStage(st) && st.active)
    .sort((x, y) => (markerRole(x, stages) === 'closing' ? 1 : 0) - (markerRole(y, stages) === 'closing' ? 1 : 0));
  const off = workStages.filter(st => marks?.[st.id] === 'off');
  const notOnApt = workStages.filter(st => !set.some(x => x.id === st.id) && marks?.[st.id] !== 'off');
  const rows = [
    ...set.map(st => ({ stage: st, state: liveStateOf(apartment, st.id, stages, tasks) })),
    ...off.map(st => ({ stage: st, state: 'off' as StageState })),
  ].sort((a, b) => a.stage.order - b.stage.order);
  // The fraction without the start stage, which is never work.
  const counted = rows.filter(r => r.state !== 'off');
  const doneN = counted.filter(r => r.state === 'done').length;
  const next = counted.find(r => r.state !== 'done');
  const aptTasks = tasks.filter(t => t.apartmentId === apartment.id);
  const aptTaskIds = new Set(aptTasks.map(t => t.id));
  const nameOf = (id: string) => workers.find(w => w.id === id)?.name ?? '';
  const day = (iso?: string | null) => { try { return iso ? format(parseISO(iso), 'EEE d MMM') : ''; } catch { return ''; } };

  /** Who finished it and when — the newest closed task that did this stage. */
  function finishedLine(st: Stage): string {
    const closed = aptTasks
      .filter(t => t.completedAt && (t.stagesWorked ?? taskStageIds(t)).includes(st.id) && !(t.stagesUnfinished ?? []).includes(st.id))
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0];
    if (!closed) return '';
    const who = nameOf(closed.contractorId);
    return who ? ui.stageFinishedBy.replace('{who}', who).replace('{day}', day(closed.completedAt)) : day(closed.completedAt);
  }

  /** Booked or working on it now — names and the day. */
  function openLine(st: Stage, state: StageState): string {
    const open = aptTasks.filter(t => !t.completedAt && taskStageIds(t).includes(st.id));
    const who = [...new Set(open.map(t => nameOf(t.contractorId)).filter(Boolean))].join(', ');
    if (!who) return '';
    if (state === 'doing') return ui.stageWorkingBy.replace('{who}', who);
    const due = open.find(t => t.dueDate)?.dueDate;
    return due ? `${who} · ${day(due)}` : who;
  }

  /** What was done only in part, in the worker's own words. */
  function partLine(st: Stage): string {
    const t = aptTasks
      .filter(x => x.partWords?.[st.id])
      .sort((a, b) => (b.completedAt ?? b.createdAt ?? '').localeCompare(a.completedAt ?? a.createdAt ?? ''))[0];
    if (!t) return '';
    const who = nameOf(t.contractorId);
    return `${ui.stagePartLabel}: ${t.partWords![st.id]}${who ? ` — ${who}, ${day(t.completedAt ?? t.createdAt)}` : ''}`;
  }

  const stateWord = (s: StageState) =>
    s === 'done' ? ui.stageStateDone : s === 'doing' ? ui.stageStateDoing : s === 'pending' ? ui.stageStatePart
    : s === 'booked' ? ui.stageStateBooked : s === 'problem' ? ui.problemLabel : s === 'off' ? ui.stageStateOff : ui.stageStateTodo;
  const stateStyle = (s: StageState): React.CSSProperties =>
    s === 'done' ? { backgroundColor: '#dcfce7', color: '#166534' }
    : s === 'doing' ? { backgroundColor: '#e0f2fe', color: '#075985' }
    : s === 'pending' ? { backgroundColor: '#fef3c7', color: '#92400e' }
    : s === 'problem' ? { backgroundColor: '#fee2e2', color: '#b91c1c' }
    : s === 'booked' ? { backgroundColor: '#ede9fe', color: '#5b21b6' }
    : { backgroundColor: '#f3f4f6', color: '#4b5563' };

  const ring = (st: Stage, state: StageState) => {
    const c = st.color;
    if (state === 'done') return <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: c }}><Check size={12} color="#fff" strokeWidth={3.5} /></span>;
    if (state === 'doing') return <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ border: `3px solid ${c}` }}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} /></span>;
    if (state === 'pending') return <span className="block w-5 h-5 rounded-full overflow-hidden" style={{ border: `3px solid ${c}` }}><span className="block w-1/2 h-full" style={{ backgroundColor: c }} /></span>;
    if (state === 'booked') return <span className="block w-5 h-5 rounded-full" style={{ border: `3px dashed ${c}` }} />;
    if (state === 'problem') return <span className="w-5 h-5 rounded-full flex items-center justify-center text-white font-black text-[11px]" style={{ backgroundColor: '#dc2626' }}>!</span>;
    if (state === 'off') return <span className="block w-5 h-5 rounded-full flex-shrink-0" style={{ border: '2px dashed #cbd5e1' }} />;
    return <span className="block w-5 h-5 rounded-full" style={{ border: `3px solid ${c}` }} />;
  };

  return (
    <div data-stage-section className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-gray-800">{ui.stagesTitle}</span>
        {counted.length > 0 && (
          <span data-stage-next data-fraction={`${doneN}/${counted.length}`} className="text-xs text-gray-700 bg-sky-50 border border-sky-100 rounded-md px-2 py-1">
            {next
              ? ui.stageNextLine.replace('{stage}', getStageName(next.stage, rtl)).replace('{done}', String(doneN)).replace('{total}', String(counted.length))
              : ui.stageAllDone.replace('{done}', String(doneN)).replace('{total}', String(counted.length))}
          </span>
        )}
      </div>

      <div data-stage-flow className="space-y-2">
      {rows.map(({ stage: st, state }) => {
        const pics = photos.filter(p => p.apartmentId === apartment.id && p.stageId === st.id && aptTaskIds.has(p.assignmentId)
          && (p.fileType ?? 'image') === 'image');
        const items: StagePhotoItem[] = pics.map(p => ({
          fileId: p.driveFileId ?? '', filename: p.filename, mimeType: p.mimeType ?? 'image/jpeg',
          thumbSrc: photoSrc(p, 1600), downloadHref: p.driveFileId ? `https://drive.google.com/uc?export=download&id=${p.driveFileId}` : (p.storageUrl || p.dataUrl),
        }));
        const who = state === 'done' ? finishedLine(st) : state === 'doing' || state === 'booked' ? openLine(st, state) : '';
        const part = state === 'pending' || state === 'done' ? partLine(st) : '';
        const isOff = state === 'off';
        return (
          <div key={st.id} data-stage-row={st.id} data-stage-state={state}
            className={`group/st rounded-xl border px-3 py-2.5 ${isOff ? 'border-dashed border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'}`}
            style={!isOff ? { borderInlineStartWidth: 4, borderInlineStartColor: st.color } : undefined}>
            <div className="flex items-center gap-2.5">
              {isOff ? ring(st, state) : (
                <button type="button" data-stage-bubble={st.id} data-stage-state={state}
                  title={ui.setTapHint}
                  onClick={() => onMarks(cycleMark(marks, st.id, 'left', state))}
                  onContextMenu={e => { e.preventDefault(); onMarks(cycleMark(marks, st.id, 'right', state)); }}
                  className="flex-shrink-0 rounded-full hover:scale-110 transition-transform">
                  {ring(st, state)}
                </button>
              )}
              <span className={`text-[15px] font-bold min-w-0 truncate ${isOff ? 'text-gray-400' : 'text-gray-900'}`}>{getStageName(st, rtl)}</span>
              <span data-stage-word className="text-[11px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0" style={stateStyle(state)}>
                {stateWord(state)}
              </span>
              {state === 'doing' && <Hammer size={12} className="flex-shrink-0" style={{ color: st.color }} />}
              {state === 'booked' && <CalendarDays size={12} className="flex-shrink-0 text-gray-400" />}
              {state === 'pending' && <Clock size={12} className="flex-shrink-0" style={{ color: '#f97316' }} />}
              <span className="flex-1" />
              {isOff ? (
                <button type="button" data-stage-putback={st.id} onClick={() => onMarks(setMark(marks, st.id, 'todo'))}
                  className="text-[11px] font-semibold text-[#1e3a5f] px-2 py-0.5 rounded-full hover:bg-[#1e3a5f]/10">{ui.setPutBack}</button>
              ) : state !== 'done' && (
                <button type="button" data-stage-off={st.id} onClick={() => onMarks(setMark(marks, st.id, 'off'))}
                  title={ui.setNotNeededAct} aria-label={ui.setNotNeededAct}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/st:opacity-100 focus:opacity-100">
                  <X size={13} />
                </button>
              )}
            </div>
            {!isOff && (st.includes?.length ?? 0) > 0 && (
              <div data-stage-includes className="mt-1.5 flex flex-wrap gap-1">
                {st.includes!.map(w => <span key={w} className="text-[11px] bg-gray-100 text-gray-700 rounded px-1.5 py-0.5" dir="auto">{includeIn(st, w, rtl ? 'he' : 'en') || w}</span>)}
              </div>
            )}
            {who && <div data-stage-who className="mt-1 text-[12.5px] text-gray-700">{who}</div>}
            {part && <div data-stage-part className="mt-0.5 text-[12.5px] text-amber-800">{part}</div>}
            {items.length > 0 && (
              <div data-stage-thumbs className="mt-2 flex gap-1.5 flex-wrap">
                {items.map((it, i) => (
                  <button key={i} type="button" data-stage-thumb onClick={() => onOpenPhotos(items, i)}
                    className="relative w-14 h-10 rounded-md overflow-hidden border border-gray-200 bg-gray-100
                               transition-transform duration-150 origin-top-left hover:scale-[3] hover:z-20 focus:scale-[3] focus:z-20 hover:shadow-xl motion-reduce:transition-none">
                    <img src={photoSrc(pics[i], 400)} alt={it.filename} loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      </div>

      {/* + add a stage — from the workspace's list, or a new one. */}
      <div>
        {!adding ? (
          <button type="button" data-stage-add onClick={() => setAdding(true)}
            className="text-xs font-semibold text-gray-500 border border-dashed border-gray-300 rounded-full px-3 py-1 hover:border-[#1e3a5f] hover:text-[#1e3a5f]">
            {ui.setAddStage}
          </button>
        ) : custom ? (
          <div data-stage-custom-form className="rounded-xl border border-dashed border-gray-400 bg-white p-2.5 space-y-2">
            <input data-stage-custom-name autoFocus value={custom.name} placeholder={ui.setCustomName}
              onChange={e => setCustom({ ...custom, name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter' && custom.name.trim()) { onAddCustom({ ...custom, name: custom.name.trim() }); setCustom(null); setAdding(false); } }}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
            <div className="flex gap-1.5">
              {CUSTOM_COLORS.map(c => (
                <button key={c} type="button" data-stage-custom-color={c} onClick={() => setCustom({ ...custom, color: c })}
                  className="w-[18px] h-[18px] rounded-full" aria-label={c}
                  style={{ backgroundColor: c, boxShadow: custom.color === c ? `0 0 0 2px #fff, 0 0 0 3.5px ${c}` : undefined }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([
                ['apartment', ui.setOnlyThisApt],
                ...(apartment.tipus ? [['tipus', ui.setEveryTipus.replace('{t}', apartment.tipus)]] : []),
                ...(apartment.buildingId && apartment.buildingId !== 'G' ? [['building', ui.setWholeBuilding]] : []),
                ['workspace', ui.setWholeWorkspace],
              ] as Array<[CustomWhere, string]>).map(([w, label]) => (
                <button key={w} type="button" data-stage-custom-where={w} onClick={() => setCustom({ ...custom, where: w })}
                  className="text-[11px] font-semibold px-2 py-1 rounded-full border"
                  style={custom.where === w
                    ? { borderColor: '#1e3a5f', backgroundColor: '#1e3a5f', color: '#fff' }
                    : { borderColor: '#e5e7eb', color: '#64748b', backgroundColor: '#fff' }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button type="button" data-stage-custom-add disabled={!custom.name.trim()}
                onClick={() => { onAddCustom({ ...custom, name: custom.name.trim() }); setCustom(null); setAdding(false); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#1e3a5f] disabled:opacity-40">{ui.add}</button>
              <button type="button" onClick={() => setCustom(null)} className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50">{ui.cancel}</button>
            </div>
          </div>
        ) : (
          <div data-stage-add-panel className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-2.5">
            {notOnApt.length === 0 && <div className="text-[11px] text-gray-400 mb-2">{ui.setNothingToPick}</div>}
            {notOnApt.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {notOnApt.map(st => (
                  <button key={st.id} type="button" data-stage-add-pick={st.id}
                    onClick={() => { onMarks(setMark(marks, st.id, 'todo')); setAdding(false); }}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-white pl-1.5 pr-2.5 py-1 text-xs font-semibold text-gray-700 hover:border-[#1e3a5f]"
                    style={{ borderColor: `${st.color}88` }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                    {getStageName(st, rtl)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button type="button" data-stage-custom-start onClick={() => setCustom({ name: '', color: CUSTOM_COLORS[0], where: 'apartment' })}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1e3a5f] border border-[#1e3a5f]/30 rounded-full px-2.5 py-1 bg-white hover:bg-[#1e3a5f]/5">
                <Plus size={11} /> {ui.setNewCustom}
              </button>
              <button type="button" onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-600">{ui.cancel}</button>
            </div>
          </div>
        )}
      </div>

      {markers.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-gray-500">{apartment.buildingId === 'G' ? ui.setJobIs : ui.setFlatIs}</span>
          {markers.map(m => {
            const on = apartment.currentStageId === m.id;
            return (
              <button key={m.id} type="button" data-stage-marker={m.id} data-on={on ? '1' : undefined}
                onClick={() => onMarker(m.id)}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                style={on ? { borderColor: m.color, backgroundColor: m.color, color: '#fff' } : { borderColor: '#e5e7eb', color: '#64748b', backgroundColor: '#fff' }}>
                {getStageName(m, rtl)}
              </button>
            );
          })}
        </div>
      )}

      {onReportProblem && (
        <button type="button" data-report-problem onClick={onReportProblem}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ backgroundColor: '#dc2626' }}>
          <AlertTriangle size={13} /> {ui.reportProblem}
        </button>
      )}
    </div>
  );
}
