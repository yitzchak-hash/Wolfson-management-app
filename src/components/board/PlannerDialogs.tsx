import React, { useEffect, useRef, useState } from 'react';
import { X, Paperclip, Loader2, AlertTriangle } from 'lucide-react';
import {
  Apartment, Contractor, Stage, TaskAttachment, TaskPriority, User, personColor,
} from '../../types';
import { useStore } from '../../data/store';
import {
  isUploadBackendConfigured, extractFolderId, findOrCreateFolderViaBackend, uploadFileViaBackend,
} from '../../data/driveApi';

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
 * Everything the ordinary Add Task form has, asked here.
 *
 * The point of doing it at the drop is that most of the form is already known:
 * which job, which day, which date, and who. So the only thing left to choose
 * is the stage — and then whatever else you would have typed anyway, which is
 * why the description, the priority, the notes and the attachments are all here
 * too rather than being a cut-down version you have to go and finish elsewhere.
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
  /** taskId is undefined when they chose "just put it on the planner". */
  onDone: (taskId?: string) => void;
}) {
  const { addContractorAssignment, currentUser } = useStore();

  const [contractorId, setContractorId] = useState(person.contractorId ?? '');
  const [stageId, setStageId] = useState(job.currentStageId ?? '');
  const [task, setTask] = useState('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const day = new Date(`${dayIso}T00:00:00`);
  const stage = stages.find(s => s.id === stageId);

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
    if (!contractorId || !task.trim()) return;
    setBusy(true);
    try {
      const attachments = await attach();
      const id = `T-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      addContractorAssignment({
        id,
        apartmentId: job.id,
        contractorId,
        taskDescription: task.trim(),
        dueDate: dayIso,
        stageId: stageId || null,
        priority: (priority || 'normal') as TaskPriority,
        notes: notes.trim() || undefined,
        attachments,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.name ?? '',
      } as never);
      onDone(id);
    } finally {
      setBusy(false);
    }
  }

  const box = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none '
    + 'focus:ring-2 focus:ring-[#1e3a5f]/25 bg-white';

  return (
    <Shell onCancel={onCancel} title={`Put ${job.displayName || 'this job'} on ${person.name}'s ${
      day.toLocaleDateString(undefined, { weekday: 'long' })}?`}>
      <div className="grid gap-2.5">
        <p className="text-[12px] text-gray-500 m-0">
          It's on the planner either way. This also makes it a task on the job —
          the day, the date and who it's for are already filled in.
        </p>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Stage">
            <select value={stageId} onChange={e => setStageId(e.target.value)} className={box}>
              <option value="">No stage</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Who">
            <select value={contractorId} onChange={e => setContractorId(e.target.value)} className={box}>
              <option value="">Pick somebody…</option>
              {contractors.filter(c => c.active).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="What has to be done">
          <input value={task} onChange={e => setTask(e.target.value)} autoFocus
            placeholder={stage ? `${stage.name} at ${job.displayName ?? 'this job'}` : 'First fix…'}
            className={box} />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Due">
            <div className={`${box} tabular-nums text-gray-600`}>
              {day.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} className={box}>
              <option value="">Normal</option>
              <option value="urgent">Urgent</option>
              <option value="low">Low</option>
            </select>
          </Field>
        </div>

        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="Anything the crew needs to know — optional"
            className={`${box} resize-none`} />
        </Field>

        <div>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200
                       text-[12px] font-semibold text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
          >
            <Paperclip size={13} /> Attach a file
          </button>
          <input ref={fileRef} type="file" multiple className="hidden"
            onChange={e => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {files.map((f, i) => (
                <span key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100
                                         text-[11px] text-slate-600">
                  {f.name}
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="text-slate-400 hover:text-red-500"><X size={10} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer>
        <button onClick={() => onDone(undefined)} disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12.5px] font-semibold
                     text-gray-600 hover:bg-gray-50 disabled:opacity-50">
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

  return (
    <>
      <div className="fixed inset-0 z-[170]" style={{ backgroundColor: 'rgba(15,23,42,.45)' }}
        onClick={onCancel} />
      <div className="fixed z-[171] rounded-2xl bg-white overflow-hidden flex flex-col"
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
