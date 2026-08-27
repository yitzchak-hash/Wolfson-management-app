import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Paperclip, Loader2, AlertTriangle } from 'lucide-react';
import {
  Apartment, Contractor, Stage, TaskAttachment, TaskPriority, User, personColor,
} from '../../types';
import { useStore } from '../../data/store';
import {
  isUploadBackendConfigured, extractFolderId, findOrCreateFolderViaBackend, uploadFileViaBackend, shareFileToDrive,
} from '../../data/driveApi';
import { DayStretch, workingRun, stretchDays, nextWorkingDay, parseDay } from '../../data/taskDays';
import { RecordedMemo } from '../../data/voiceMemo';
import { VoiceRecorderButton, VoiceMemoPlayer } from '../ui/VoiceMemo';

/**
 * The two questions the planner has to ask.
 *
 * Both exist because a slot on the planner and a task on a job are related but
 * separate things — the planner says who is where, a task says what has to be
 * done. Assuming one always implies the other would be wrong in both
 * directions, so each is asked once, at the moment it matters.
 */

// ── Dropping a job in ────────────────────────────────────────────────────────

/**
 * The drop card, laid out as the owner approved it on the "Tasks That Take
 * Days" page (2026-08-24): the job's CURRENT stage on the left with "when
 * it's done, move to" beside it; who; ONE box for what has to be done (the
 * old separate Notes box said the same thing) with the paperclip and a voice
 * memo in its corner; then the days — a start day, a how-many-days counter,
 * an Include-Friday checkbox that only exists when the days actually pass a
 * Friday, and a Non-consecutive switch that opens a second stretch. A green
 * line always reads out exactly which days the task will sit on.
 */
export function PlannerTaskDialog({
  job, person, dayIso, stages, contractors, onCancel, onDone,
}: {
  job: Apartment;
  /** The row it was dropped on — a contractor if that person is one. */
  person: { name: string; color: string; contractorId?: string };
  dayIso: string;
  stages: Stage[];
  contractors: Contractor[];
  onCancel: () => void;
  /**
   * taskId is undefined when they chose "just put it on the planner";
   * `days` is every day the task covers, so the caller can put a card on
   * each of them.
   */
  onDone: (taskId?: string, days?: string[]) => void;
}) {
  const { addContractorAssignment, currentUser } = useStore();

  const [contractorId, setContractorId] = useState(person.contractorId ?? '');
  const [stageWhenDone, setStageWhenDone] = useState('');
  const [task, setTask] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * The days. One stretch by default, starting on the day dropped on;
   * Non-consecutive opens a second with its own start and count. Saturday
   * never counts; Friday is per-stretch and asked only when it matters —
   * the arithmetic lives in taskDays.ts, tested offline.
   */
  const [stretches, setStretches] = useState<DayStretch[]>([{ start: dayIso, days: 1 }]);
  const [noncon, setNoncon] = useState(false);
  const active = noncon ? stretches : stretches.slice(0, 1);
  const allDays = useMemo(() => stretchDays(active), [active]);
  const patchStretch = (i: number, patch: Partial<DayStretch>) =>
    setStretches(prev => prev.map((st, j) => (j === i ? { ...st, ...patch } : st)));

  const currentStage = stages.find(s => s.id === job.currentStageId);

  useEffect(() => {
    function key(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onCancel]);

  async function attach(): Promise<TaskAttachment[]> {
    if (!files.length) return [];
    const folderId = job.driveLink ? extractFolderId(job.driveLink) : null;
    // Same route the ordinary form uses: Drive when it is set up, and the
    // file's own bytes only as a fallback so nothing is silently dropped.
    if (isUploadBackendConfigured() && folderId) {
      const into = await findOrCreateFolderViaBackend(folderId, 'Tasks');
      const out: TaskAttachment[] = [];
      for (const f of files) {
        const up = await uploadFileViaBackend(into, f);
        if (up?.fileId) void shareFileToDrive(up.fileId);
        out.push({
          id: `A-${Math.random().toString(36).slice(2, 8)}`,
          filename: f.name, mimeType: f.type, dataUrl: '',
          driveFileId: up?.fileId, driveUrl: up?.webViewLink,
        });
      }
      return out;
    }
    return Promise.all(files.map(f => new Promise<TaskAttachment>(res => {
      const r = new FileReader();
      r.onload = () => res({
        id: `A-${Math.random().toString(36).slice(2, 8)}`,
        filename: f.name, mimeType: f.type, dataUrl: String(r.result ?? ''),
      });
      r.readAsDataURL(f);
    })));
  }

  async function make() {
    if (!contractorId || !task.trim() || !allDays.length) return;
    setBusy(true);
    try {
      const attachments = await attach();
      const id = `T-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      addContractorAssignment({
        id,
        apartmentId: job.id,
        buildingId: job.buildingId,
        contractorId,
        taskDescription: task.trim(),
        // The task carries ALL of its days; dueDate stays the LAST one, so
        // everything written for the single-date world (sorting, overdue,
        // badges) stays correct — late only once every day has passed.
        dueDate: allDays[allDays.length - 1],
        ...(allDays.length > 1 ? { days: allDays } : {}),
        ...(stageWhenDone ? { stageWhenDone } : {}),
        stageId: job.currentStageId ?? null,
        priority: 'normal' as TaskPriority,
        attachments,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.name ?? '',
      } as never);
      onDone(id, allDays);
    } finally {
      setBusy(false);
    }
  }

  const box = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none '
    + 'focus:ring-2 focus:ring-[#1e3a5f]/25 bg-white';

  /** "Wed 26 Aug" — short enough that a week of them fits on the green line. */
  const fmtDay = (iso: string) =>
    parseDay(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Shell onCancel={onCancel} title={`Put ${job.displayName || 'this job'} on ${person.name}'s ${
      allDays.length > 1 ? 'week' : parseDay(dayIso).toLocaleDateString(undefined, { weekday: 'long' })}?`}>
      <div className="grid gap-2.5">
        {/* The explainer paragraph is gone, per the owner — the form says what
            it needs and the office knows what a drop means by now. */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Where the job STANDS — shown, not asked. Beside it, where it
              moves when this task is closed; the store applies that at the
              completion write, whichever screen closes it. */}
          <Field label="Current stage">
            <div className={`${box} bg-slate-50 text-gray-600 flex items-center gap-1.5`}>
              <span className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: currentStage?.color ?? '#cbd5e1' }} />
              <span className="truncate">{currentStage?.name ?? 'Not started'}</span>
            </div>
          </Field>
          <Field label="When it's done, move to">
            <select value={stageWhenDone} onChange={e => setStageWhenDone(e.target.value)} className={box}>
              <option value="">Leave the stage alone</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Who">
          <select value={contractorId} onChange={e => setContractorId(e.target.value)} className={box}>
            <option value="">Pick somebody…</option>
            {contractors.filter(c => c.active).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>

        {/* ONE box — what to do and any notes were two boxes saying the same
            thing. The paperclip and the voice memo live in its corner, the
            drawer's General-notes idiom. */}
        <Field label="What has to be done">
          <div className="relative">
            <textarea value={task} onChange={e => setTask(e.target.value)} autoFocus rows={3}
              placeholder={`What has to happen at ${job.displayName || 'this job'} — and anything the crew needs to know`}
              className={`${box} resize-none`} style={{ paddingBottom: 34 }} />
            <span className="absolute flex items-center gap-1" style={{ insetInlineEnd: 8, bottom: 12 }}>
              <button
                onClick={() => fileRef.current?.click()}
                title="Attach a file"
                className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200
                           text-gray-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f] bg-white"
              >
                <Paperclip size={13} />
              </button>
              <VoiceRecorderButton
                compact
                title="Record a voice memo"
                onRecorded={(memo: RecordedMemo) => {
                  // A memo is an ordinary audio FILE on the same attachment
                  // path — nothing new to persist or upload.
                  const ext = memo.blob.type.includes('mp4') ? 'm4a' : 'webm';
                  setFiles(prev => [...prev, new File(
                    [memo.blob], `voice-memo-${Date.now()}.${ext}`,
                    { type: memo.blob.type || 'audio/webm' },
                  )]);
                }}
              />
            </span>
          </div>
        </Field>
        <input ref={fileRef} type="file" multiple className="hidden"
          onChange={e => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 -mt-1">
            {files.map((f, i) => f.type.startsWith('audio/') ? (
              <PendingAudio key={i} file={f} onDelete={() => setFiles(files.filter((_, j) => j !== i))} />
            ) : (
              <span key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100
                                       text-[11px] text-slate-600">
                {f.name}
                <button onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-red-500"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}

        {/* The days. Saturday never counts; Friday is per-stretch, asked only
            when the stretch actually passes one; Non-consecutive opens a
            second stretch with its own start and count. */}
        {active.map((st, i) => {
          const run = workingRun(st.start, st.days, st.friday);
          return (
            <React.Fragment key={i}>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label={i === 0 ? 'Start day' : 'And again from'}>
                  <input type="date" value={st.start}
                    onChange={e => { if (e.target.value) patchStretch(i, { start: e.target.value }); }}
                    className={box} />
                </Field>
                <Field label="How many days">
                  <div className={`${box} flex items-center p-0 overflow-hidden`}>
                    <button onClick={() => patchStretch(i, { days: Math.max(1, st.days - 1) })}
                      className="px-3 py-1.5 font-black text-gray-500 hover:bg-gray-50" aria-label="One day fewer">−</button>
                    <span className="flex-1 text-center font-bold tabular-nums text-gray-700">{st.days}</span>
                    <button onClick={() => patchStretch(i, { days: Math.min(15, st.days + 1) })}
                      className="px-3 py-1.5 font-black text-gray-500 hover:bg-gray-50" aria-label="One day more">+</button>
                  </div>
                </Field>
              </div>
              {run.crossesFriday && (
                <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-gray-600 select-none -mt-1"
                  style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!st.friday}
                    onChange={e => patchStretch(i, { friday: e.target.checked })}
                    style={{ width: 13, height: 13, accentColor: '#1e3a5f' }} />
                  Include Friday?
                </label>
              )}
            </React.Fragment>
          );
        })}

        <label className="flex items-center gap-2 text-[11.5px] font-semibold text-gray-600 select-none"
          style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={noncon}
            onChange={e => {
              const on = e.target.checked;
              setNoncon(on);
              if (on && stretches.length === 1) {
                const run = workingRun(stretches[0].start, stretches[0].days, stretches[0].friday);
                setStretches([...stretches, { start: nextWorkingDay(run.days[run.days.length - 1]), days: 1 }]);
              }
              if (!on) setStretches(prev => prev.slice(0, 1));
            }}
            style={{ width: 14, height: 14, accentColor: '#1e3a5f' }} />
          Non-consecutive — work it in separate stretches
        </label>

        {/* The green line: exactly which days, always. */}
        <p data-day-readout className="m-0 text-[12px] font-semibold" style={{ color: '#15803d' }}>
          → {allDays.map(fmtDay).join(', ')} — {allDays.length} {allDays.length === 1 ? 'day' : 'days'}
        </p>
      </div>

      <Footer>
        {/* The no-task escape hatch, demoted to a quiet side button at the
            LEFT of the footer, per the owner: it is for the rare case where a
            card should sit on the sheet with no task behind it, and drawn as
            a peer of "Add the task" it was pressed instead of it. */}
        <button onClick={() => onDone(undefined)} disabled={busy}
          className="me-auto px-2 py-1.5 rounded-lg text-[11px] font-semibold
                     text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          title="Rare: the card sits on the planner with no task behind it">
          Just put it on the planner
        </button>
        <button onClick={make} disabled={busy || !contractorId || !task.trim()}
          className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold text-white flex items-center gap-1.5
                     disabled:opacity-40"
          style={{ backgroundColor: '#4aa8d8' }}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          Add the task
        </button>
      </Footer>
    </Shell>
  );
}

/**
 * A recorded-but-not-yet-saved memo, playable — a grey chip saying
 * "voice-memo-....webm" reads as broken (the documented voice-memo rule).
 * MODULE level, and the object URL made and revoked in an effect, once.
 */
function PendingAudio({ file, onDelete }: { file: File; onDelete: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <VoiceMemoPlayer src={url} className="max-w-[250px]" onDelete={onDelete} /> : null;
}

// ── Pulling a job out ────────────────────────────────────────────────────────

/**
 * Only asked when the slot actually made a task.
 *
 * A task can be created from half a dozen places and outlive the planner
 * entirely, so taking a card off a day must not quietly delete work somebody
 * is relying on. If the slot never made a task there is nothing to ask, and the
 * card just comes off.
 */
export function PlannerRemoveDialog({ jobName, taskName, onCancel, onDone }: {
  jobName: string;
  taskName: string;
  onCancel: () => void;
  onDone: (alsoDeleteTask: boolean) => void;
}) {
  return (
    <Shell onCancel={onCancel} title={`Take ${jobName} off this day?`}>
      <p className="text-[13px] text-gray-600 m-0">
        There's a task on it — <b>{taskName}</b>. Tasks live on the job whether
        or not they're on the planner, so this is a separate question.
      </p>
      <Footer>
        <button onClick={() => onDone(false)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12.5px] font-semibold
                     text-gray-600 hover:bg-gray-50">
          Keep the task
        </button>
        <button onClick={() => onDone(true)}
          className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold text-white"
          style={{ backgroundColor: '#b4342a' }}>
          Remove both
        </button>
      </Footer>
    </Shell>
  );
}

// ── Dragging a card that is already on the notebook ──────────────────────────

export type DropChoice = 'move' | 'copy' | 'off';

/**
 * What a drag of an existing card MEANT.
 *
 * It used to be decided silently by a modifier key: a plain drag moved the
 * card, Ctrl left a copy behind, and a drag off the edge took the job off the
 * notebook altogether. Three quite different outcomes, one of them
 * irreversible-looking, all triggered by the same gesture — so a hand that
 * slipped while tidying the week took a job off the planner with no way of
 * knowing it had happened.
 *
 * It asks now. The modifier still works as a shortcut for anybody who knows it
 * (Ctrl-drag copies without a question); a plain drag stops and says what the
 * three outcomes are, in the words the office uses.
 */
/**
 * One choice in the drop question — at MODULE level, deliberately.
 *
 * Declared inside the dialog's render body it was a new component TYPE every
 * render, so React unmounted and remounted the buttons whenever anything on
 * the board ticked. A remount between mousedown and mouseup means no `click`
 * ever fires: the dialog sat there apparently ignoring every press. Same trap
 * as `BinSettings` and the drawer's plan pane.
 */
function DropChoiceButton({ id, title, sub, danger, onPick }: {
  id: DropChoice; title: string; sub: string; danger?: boolean;
  onPick: (c: DropChoice) => void;
}) {
  return (
    <button onClick={() => onPick(id)}
      className="w-full text-left px-3 py-2.5 rounded-lg border transition-colors hover:bg-slate-50"
      style={{ borderColor: danger ? '#f3c9c4' : '#e2e8f0' }}>
      <b className="text-[13px]" style={{ color: danger ? '#b4342a' : '#1e293b' }}>{title}</b>
      <span className="block text-[11.5px] text-slate-500">{sub}</span>
    </button>
  );
}

export function PlannerDropDialog({ jobName, toWhere, canLand, onCancel, onDone }: {
  jobName: string;
  /** "Moshe · Tuesday" — absent when the card was dropped off the notebook. */
  toWhere?: string;
  /** False when it was let go outside the notebook: there is nowhere to land. */
  canLand: boolean;
  onCancel: () => void;
  onDone: (choice: DropChoice) => void;
}) {
  const Choice = (p: { id: DropChoice; title: string; sub: string; danger?: boolean }) =>
    DropChoiceButton({ ...p, onPick: onDone });

  return (
    <Shell
      onCancel={onCancel}
      title={canLand ? `${jobName} → ${toWhere}` : `Take ${jobName} off the notebook?`}
    >
      <div className="grid gap-2">
        {canLand ? (
          <>
            <Choice id="move" title="Move it here"
              sub="It leaves the day it was on and lands on this one." />
            <Choice id="copy" title="Put a copy here"
              sub="It stays where it was as well — one job, on two days." />
            <Choice id="off" danger title="Take it off the notebook"
              sub="It goes back to the board, where it was before." />
          </>
        ) : (
          <>
            <p className="text-[13px] text-gray-600 m-0">
              You let go outside the notebook. Nothing is deleted either way —
              the job goes back to the board it came from.
            </p>
            <Choice id="off" danger title="Take it off the notebook"
              sub="Back to the board, in the place it was in before." />
            <Choice id="move" title="Leave it where it was"
              sub="Put the card back on the day it came from." />
          </>
        )}
      </div>
    </Shell>
  );
}

// ── Dragging one day of a MULTI-DAY task ─────────────────────────────────────

export type DayChoice = 'move' | 'add' | 'new' | 'merge';

/**
 * At module level for the same remount reason as DropChoiceButton above.
 */
function DayChoiceButton({ id, title, sub, danger, onPick }: {
  id: DayChoice; title: string; sub: string; danger?: boolean;
  onPick: (c: DayChoice) => void;
}) {
  return (
    <button data-day-choice={id} onClick={() => onPick(id)}
      className="w-full text-left px-3 py-2.5 rounded-lg border transition-colors hover:bg-slate-50"
      style={{ borderColor: danger ? '#f3c9c4' : '#e2e8f0' }}>
      <b className="text-[13px]" style={{ color: danger ? '#b4342a' : '#1e293b' }}>{title}</b>
      <span className="block text-[11.5px] text-slate-500">{sub}</span>
    </button>
  );
}

/**
 * What dragging ONE DAY of a multi-day task to another square meant.
 *
 * It used to move the day silently; the owner's 2026-08-27 ruling replaces
 * that with a question, in his own three labels: move this day, add this day
 * to the existing task, or a new task on this day. The day-number pills are
 * labels derived from calendar order, never identities — so a move that
 * carries day one past day two simply renumbers them, and the dialog does
 * not treat it specially.
 *
 * When the target day is ALREADY one of the task's days, "move" would fold
 * two days into one and "add" would add nothing — so that case asks its own
 * plain question (merge, or a separate new task) instead of offering choices
 * that cannot mean what they say.
 */
export function PlannerDayDialog({
  jobName, dayNum, dayCount, fromLabel, toLabel, covered, onCancel, onDone,
}: {
  jobName: string;
  /** Which day of the task the dragged card is (1-based), and how many it has. */
  dayNum: number;
  dayCount: number;
  /** "Moshe · Tue 18 Aug" for where it came from and where it landed. */
  fromLabel: string;
  toLabel: string;
  /** The landing day is already one of this task's days. */
  covered: boolean;
  onCancel: () => void;
  onDone: (choice: DayChoice) => void;
}) {
  const Choice = (p: { id: DayChoice; title: string; sub: string; danger?: boolean }) =>
    DayChoiceButton({ ...p, onPick: onDone });

  return (
    <Shell onCancel={onCancel} title={`${jobName} — day ${dayNum} of ${dayCount}`}>
      <div className="grid gap-2" data-day-dialog>
        {covered ? (
          <>
            <p className="text-[13px] text-gray-600 m-0">
              <b>{toLabel}</b> is already one of this task's days.
            </p>
            <Choice id="merge" danger title="Merge into that day"
              sub={`The card from ${fromLabel} comes off and the task drops to ${dayCount - 1} `
                + `day${dayCount - 1 === 1 ? '' : 's'}. Nothing else about the task changes.`} />
            <Choice id="new" title="New task on this day"
              sub={`Opens the task form for ${jobName} starting ${toLabel} — a separate task.`} />
          </>
        ) : (
          <>
            <p className="text-[13px] text-gray-600 m-0">
              This card is one day of a task that covers {dayCount} days.
            </p>
            <Choice id="move" title="Move this day"
              sub={`The work planned for ${fromLabel} happens on ${toLabel} instead. `
                + 'The day numbers follow the calendar and renumber themselves.'} />
            <Choice id="add" title="Add this day to the existing task"
              sub={`${fromLabel} stays as well — the task grows to ${dayCount + 1} days, `
                + 'and the worker\'s schedule grows with it.'} />
            <Choice id="new" title="New task on this day"
              sub={`Opens the task form for ${jobName} starting ${toLabel} — a completely separate task.`} />
          </>
        )}
      </div>
    </Shell>
  );
}

// ── Taking somebody off the planner ──────────────────────────────────────────

export type OffScope = 'forward' | 'all' | 'date';

/**
 * Removing a person, with the choices the office actually needs.
 *
 * Nothing is destroyed: their days go into a pile on the board, and putting
 * them back puts every job in the slot it came from. The "from when" question
 * matters because a week that has already been worked is history, and rubbing
 * it out would lose the record of who was where.
 */
export function PlannerOffDialog({ name, jobCount, onCancel, onDone }: {
  name: string;
  jobCount: number;
  onCancel: () => void;
  onDone: (scope: OffScope, date?: string) => void;
}) {
  const [scope, setScope] = useState<OffScope>('forward');
  const [date, setDate] = useState('');

  const Choice = ({ id, title, sub }: { id: OffScope; title: string; sub: string }) => (
    <button onClick={() => setScope(id)}
      className="w-full text-left flex gap-2.5 items-start px-2.5 py-2 rounded-lg border transition-colors"
      style={{
        borderColor: scope === id ? '#4aa8d8' : '#e2e8f0',
        backgroundColor: scope === id ? '#f0f9ff' : '#fff',
      }}>
      <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 mt-0.5"
        style={{ border: scope === id ? '4px solid #4aa8d8' : '2px solid #cbd5e1' }} />
      <span>
        <b className="text-[12.5px] text-slate-800">{title}</b>
        <span className="block text-[11px] text-slate-500">{sub}</span>
      </span>
    </button>
  );

  return (
    <Shell onCancel={onCancel} title={`Take ${name} off the planner?`} danger>
      <div className="grid gap-2.5">
        <p className="text-[13px] text-gray-600 m-0">
          {jobCount > 0
            ? <>They have <b>{jobCount}</b> {jobCount === 1 ? 'job' : 'jobs'} in slots.</>
            : <>They have nothing in any slot.</>}
        </p>
        <div className="grid gap-1.5">
          <Choice id="forward" title="From today onwards"
            sub="The rest of this week stays visible, greyed out. Next week they're gone." />
          <Choice id="all" title="Everything, back to the start"
            sub="Including weeks already worked." />
          <Choice id="date" title="From a date I pick" sub="Everything from that day on." />
        </div>
        {scope === 'date' && (
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none" />
        )}
        <p className="text-[12px] text-slate-600 m-0 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">
          Their jobs go into a pile called <b>“{name} — off the planner”</b> on the
          job board. Nothing is deleted, and putting them back puts every job in
          the slot it came from.
        </p>
      </div>
      <Footer>
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12.5px] font-semibold text-gray-600">
          Cancel
        </button>
        <button onClick={() => onDone(scope, date || undefined)}
          disabled={scope === 'date' && !date}
          className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: '#b4342a' }}>
          Take them off
        </button>
      </Footer>
    </Shell>
  );
}

// ── Shared chrome ────────────────────────────────────────────────────────────

function Shell({ title, children, onCancel, danger }: {
  title: string; children: React.ReactNode; onCancel: () => void; danger?: boolean;
}) {
  useEffect(() => {
    function key(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onCancel]);

  /**
   * A modal must not leak its pointer events into whatever is hosting it.
   *
   * These dialogs can be rendered through a portal from INSIDE a board node —
   * and a React portal propagates events up the REACT tree, not the DOM one. So
   * a press on a button here arrived at the board node's own `onPointerDown`,
   * which captured the pointer: the button saw `pointerdown` and then nothing
   * at all, no `mouseup`, no `click`. The dialog sat there apparently ignoring
   * every press while doing exactly what it was told.
   *
   * Stopping propagation here does not affect this dialog's own handlers — they
   * are at or below this element — it only stops the event escaping upwards.
   */
  const seal = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerMove: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onContextMenu: (e: React.MouseEvent) => e.stopPropagation(),
    onWheel: (e: React.WheelEvent) => e.stopPropagation(),
  };

  return (
    <>
      <div className="fixed inset-0 z-[170]" style={{ backgroundColor: 'rgba(15,23,42,.45)' }}
        {...seal} onClick={onCancel} />
      <div className="fixed z-[171] rounded-2xl bg-white overflow-hidden flex flex-col"
        {...seal}
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: 'min(460px, 94vw)', maxHeight: '88vh',
          boxShadow: '0 24px 60px -16px rgba(15,23,42,.45)',
        }}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-start gap-2">
          {danger && <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />}
          <h3 className="m-0 text-[14.5px] font-extrabold text-slate-800 flex-1">{title}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="px-4 py-3 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 justify-end mt-3 pt-3 border-t border-gray-100">{children}</div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10.5px] font-bold text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
