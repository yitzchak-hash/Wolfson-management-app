import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Paperclip, Loader2, AlertTriangle, Search, Plus, Building2 } from 'lucide-react';
import {
  Apartment, Contractor, Stage, TaskAttachment, TaskPriority, User, personColor, aptLabel, GeneralWhere, generalBuildingsText } from '../../types';
import { useStore, loadProjectSnapshot } from '../../data/store';
import { searchJobs } from '../../data/searchIndex';
import { TaskDaysPicker, taskWrites, splitStringsOf, TaskSplit } from '../tasks/TaskDaysPicker';
import { StagePairPicker, stagePairStrings, StagePairValue } from '../tasks/StagePair';
import {
  isUploadBackendConfigured, extractFolderId, findOrCreateFolderViaBackend, uploadFileViaBackend, shareFileToDrive,
} from '../../data/driveApi';
import { DayStretch, workingRun, stretchDays, nextWorkingDay, parseDay } from '../../data/taskDays';
import { RecordedMemo } from '../../data/voiceMemo';
import { VoiceMemoPlayer } from '../ui/VoiceMemo';
import { MessageBox, memoFile } from '../ui/MessageBox';

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
export interface TaskDialogResult {
  /** The tasks that were made — none for "just put it on the planner". */
  taskIds: string[];
  days: string[];
  contractorIds: string[];
  jobId?: string;
  /** Where the job lives when it is not this workspace's. */
  projectId?: string;
  /** A general job in a workspace (no unit): the workspace and building. */
  general?: GeneralWhere;
  parked?: boolean;
}

/**
 * The add-a-job / drop card, as approved on "Buildings, Plans and the Notebook
 * Plus" (locked 2026-09-15, scene 3): WHICH JOB (a search across every
 * workspace, or a general job in a workspace → building), WHO (a search over
 * every worker; more than one can be picked; somebody not on the sheet gets
 * a row — the widget adds it), WHAT (the one message box), the STAGE PAIR
 * (on → when done, scene 4), and the standard day picker with its second
 * stretch and "different stages" (scene 5). `job` is given when the card was
 * dropped on a square; absent, the job step is shown first.
 *
 * Everything it makes is a TASK. The notebook draws tasks from the tasks
 * (locked answer 7), so nothing here writes a square.
 */
export function PlannerTaskDialog({
  job, jobProjectId, jobs, person, dayIso, contractors, onCancel, onDone,
}: {
  job?: Apartment;
  /**
   * The workspace `job` lives in — omit for the one you are standing in. A
   * Building Progress square, a unit card or a search row dragged onto the
   * notebook is a job from ANOTHER workspace, and its task must be made
   * there, with that workspace's stages (owner, 2026-09-16).
   */
  jobProjectId?: string;
  /** This workspace's jobs, for the search. */
  jobs?: Apartment[];
  /** The row it was opened from — a contractor if that person is one. */
  person: { name: string; color: string; contractorId?: string };
  dayIso: string;
  contractors: Contractor[];
  onCancel: () => void;
  onDone: (result: TaskDialogResult) => void;
}) {
  const {
    addContractorAssignment, addAssignmentToProject, currentUser, currentProjectId, projects,
    buildings: liveBuildings, stages: allStages, mainUiStrings: s,
  } = useStore();
  const snapTick = useStore(st => st.snapshotTick);
  const isRtl = !!s.isRtl;
  const t = (en: string, he: string) => (isRtl ? he : en);

  // ── Which job ──────────────────────────────────────────────────────────
  const [picked, setPicked] = useState<{ job: Apartment; projectId: string } | null>(
    job ? { job, projectId: jobProjectId ?? currentProjectId } : null);
  const [general, setGeneral] = useState<GeneralWhere | null>(null);
  // The buildings ticked so far on the which-building step (several at once).
  const [genBlds, setGenBlds] = useState<string[]>([]);
  const [genStep, setGenStep] = useState<'ws' | 'bld' | null>(null);
  const [genWs, setGenWs] = useState('');
  const [q, setQ] = useState('');
  const jobStage = picked?.job.currentStageId ?? job?.currentStageId ?? '';

  const stagesFor = (pid: string) => allStages
    .filter(st => st.active && (pid === 'general' ? st.projectId === 'general' : !st.projectId))
    .sort((x, y) => x.order - y.order);
  /**
   * ALWAYS the job's own workspace's stages — never a list handed in by the
   * host. The board's widget context carried EVERY workspace's stages, and
   * the notebook passed that straight through, so a Wolfson notebook drop
   * offered the Job Board's stages beside Wolfson's own: the owner's "it
   * shows me all the stages". Each workspace has its own, everywhere.
   */
  const stageList = stagesFor(picked?.projectId ?? general?.projectId ?? currentProjectId);

  const hits = useMemo(() => {
    const query = q.trim();
    if (!query || picked || general) return [] as { job: Apartment; projectId: string; ws: string }[];
    const out: { job: Apartment; projectId: string; ws: string }[] = [];
    const wsName = (pid: string) => projects.find(p => p.id === pid)?.shortName ?? projects.find(p => p.id === pid)?.name ?? pid;
    const take = (list: Apartment[], pid: string) => {
      const real = list.filter(a => !a.isUnnamed && a.boardBin !== 'trash');
      for (const h of searchJobs(real, query, { stages: stagesFor(pid), projectId: pid, limit: 6 }).slice(0, 6)) {
        out.push({ job: h.rec, projectId: pid, ws: wsName(pid) });
      }
    };
    take(jobs ?? [], currentProjectId);
    for (const p of projects) {
      if (p.id === currentProjectId) continue;
      take(loadProjectSnapshot(p.id).apartments, p.id);
    }
    return out.slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, picked, general, jobs, projects, currentProjectId, snapTick]);

  const buildingsOf = (pid: string): { id: string; name?: string }[] =>
    pid === currentProjectId ? liveBuildings : loadProjectSnapshot(pid).buildings;

  // ── Who ────────────────────────────────────────────────────────────────
  const [who, setWho] = useState<string[]>(person.contractorId ? [person.contractorId] : []);
  const [whoQ, setWhoQ] = useState('');
  const active = contractors.filter(c => c.active);
  const whoHits = useMemo(() => {
    const qq = whoQ.trim().toLowerCase();
    const list = qq ? active.filter(c => c.name.toLowerCase().includes(qq)) : active;
    return list.slice(0, 12);
  }, [whoQ, active]);

  // ── The stage pair, what, days ────────────────────────────────────────
  const [pair, setPair] = useState<StagePairValue>({ from: jobStage, to: '' });
  useEffect(() => { setPair(pv => ({ ...pv, from: jobStage })); }, [jobStage]);
  const [task, setTask] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [start, setStart] = useState(dayIso);
  const [days, setDays] = useState<string[]>([dayIso]);
  const [split, setSplit] = useState<TaskSplit | null>(null);
  const allDays = days.length ? days : (start ? [start] : []);

  useEffect(() => {
    function key(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onCancel]);

  const jobFolder = picked?.job.driveLink;
  async function attach(): Promise<TaskAttachment[]> {
    if (!files.length) return [];
    const folderId = jobFolder ? extractFolderId(jobFolder) : null;
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

  const jobKnown = !!picked || !!general;
  const canMake = jobKnown && who.length > 0 && task.trim().length > 0 && allDays.length > 0;

  async function make() {
    if (!canMake) return;
    setBusy(true);
    try {
      const attachments = await attach();
      const writes = taskWrites(start, allDays, pair, split);
      const targetPid = picked?.projectId ?? general?.projectId ?? currentProjectId;
      const ids: string[] = [];
      for (const cid of who) {
        for (const w of writes) {
          const fields = {
            apartmentId: picked?.job.id ?? '',
            buildingId: picked?.job.buildingId ?? general?.buildingId ?? '',
            ...(general ? { general } : {}),
            contractorId: cid,
            taskDescription: task.trim(),
            ...w,
            priority: 'normal' as TaskPriority,
            attachments,
            completedAt: null,
            createdBy: currentUser?.id ?? '',
            createdByName: currentUser?.name ?? 'Office',
          };
          if (targetPid !== currentProjectId) {
            ids.push(addAssignmentToProject(targetPid, fields as never));
          } else {
            const id = `T-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            addContractorAssignment({ id, createdAt: new Date().toISOString(), ...fields } as never);
            ids.push(id);
          }
        }
      }
      // Two workers picked in ONE dialog are two tasks on the same job and
      // the same days — a deliberate act, not the overlap the store's ask
      // exists for. When both sides of a raised ask were minted just now,
      // answer it here; an overlap with an OLDER task still asks.
      const st = useStore.getState();
      if (st.plannerAsk && ids.includes(st.plannerAsk.taskId) && ids.includes(st.plannerAsk.overlap.taskId)) {
        st.answerPlannerAsk('keep');
      }
      onDone({
        taskIds: ids, days: allDays, contractorIds: who,
        jobId: picked?.job.id,
        projectId: targetPid !== currentProjectId ? targetPid : undefined,
        ...(general ? { general } : {}),
      });
    } finally {
      setBusy(false);
    }
  }

  const box = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none '
    + 'focus:ring-2 focus:ring-[#1e3a5f]/25 bg-white';
  const wsName = (pid: string) => projects.find(p => p.id === pid)?.shortName ?? projects.find(p => p.id === pid)?.name ?? pid;
  const wsColor = (pid: string) => projects.find(p => p.id === pid)?.color ?? '#64748b';
  const jobTitle = picked ? (aptLabel(picked.job) || picked.job.displayName || t('this job', 'העבודה'))
    : general ? `${wsName(general.projectId)}${generalBuildingsText(general) ? ` · ${generalBuildingsText(general)}` : ''}` : '';
  const dayWord = parseDay(dayIso).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { weekday: 'long', day: 'numeric', month: 'short' });
  const title = job
    ? `${t('Put', 'לשבץ את')} ${jobTitle} ${t('on', 'אצל')} ${person.name} · ${dayWord}`
    : `${t('Add a job', 'הוספת עבודה')} · ${person.name} · ${dayWord}`;

  return (
    <Shell onCancel={onCancel} title={title}>
      <div data-task-dialog className="grid gap-2.5">
        {/* WHICH JOB — a search across every workspace, or a general job. */}
        {!job && (
          <Field label={t('Which job', 'איזו עבודה')}>
            {picked ? (
              <div data-job-picked className={`${box} flex items-center gap-2`}>
                <span className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stageList.find(st => st.id === picked.job.currentStageId)?.color ?? '#cbd5e1' }} />
                <span className="truncate flex-1 font-semibold">{jobTitle}</span>
                <span className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: wsColor(picked.projectId) }}>{wsName(picked.projectId)}</span>
                <button data-job-clear onClick={() => setPicked(null)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
              </div>
            ) : general ? (
              <div data-job-general className={`${box} flex items-center gap-2`}>
                <Building2 size={13} className="text-gray-400 flex-shrink-0" />
                <span className="truncate flex-1 font-semibold">{t('General job', 'עבודה כללית')} · {jobTitle}</span>
                <button data-job-clear onClick={() => { setGeneral(null); setGenStep(null); }} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
              </div>
            ) : genStep === 'ws' ? (
              <div data-general-ws className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-gray-500">{t('Which workspace?', 'איזה מרחב עבודה?')}</span>
                {projects.map(p => (
                  <button key={p.id} data-general-ws-pick={p.id}
                    onClick={() => {
                      const blds = buildingsOf(p.id);
                      if (blds.length) { setGenWs(p.id); setGenBlds([]); setGenStep('bld'); }
                      else { setGeneral({ projectId: p.id }); setGenStep(null); }
                    }}
                    className="px-2.5 py-1 rounded-full text-[11.5px] font-bold text-white"
                    style={{ backgroundColor: p.color ?? '#64748b' }}>{p.shortName ?? p.name}</button>
                ))}
                <button onClick={() => setGenStep(null)} className="text-[11px] text-gray-400 hover:text-gray-600">{t('back', 'חזרה')}</button>
              </div>
            ) : genStep === 'bld' ? (
              <div data-general-bld className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-gray-500">{wsName(genWs)} · {t('which buildings?', 'איזה בניינים?')}</span>
                {/* ALL (owner, 2026-09-16): the whole workspace, no building named — one press and done. */}
                <button data-general-bld-pick="all"
                  onClick={() => { setGeneral({ projectId: genWs }); setGenBlds([]); setGenStep(null); }}
                  className="px-2.5 py-1 rounded-full text-[11.5px] font-bold text-white"
                  style={{ backgroundColor: wsColor(genWs) }}>{t('All', 'כולם')}</button>
                {/* Several at once: a pill toggles; Done writes the set. */}
                {buildingsOf(genWs).map(b => {
                  const on = genBlds.includes(b.id);
                  return (
                    <button key={b.id} data-general-bld-pick={b.id} {...(on ? { 'data-on': '1' } : {})}
                      onClick={() => setGenBlds(cur => cur.includes(b.id) ? cur.filter(x => x !== b.id) : [...cur, b.id])}
                      className={`px-2.5 py-1 rounded-full text-[11.5px] font-bold border ${on
                        ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{b.id}</button>
                  );
                })}
                <button data-general-bld-done disabled={genBlds.length === 0}
                  onClick={() => {
                    const ids = buildingsOf(genWs).map(b => b.id).filter(id => genBlds.includes(id));
                    setGeneral({ projectId: genWs, buildingIds: ids, ...(ids.length === 1 ? { buildingId: ids[0] } : {}) });
                    setGenStep(null);
                  }}
                  className="px-2.5 py-1 rounded-full text-[11.5px] font-bold text-white bg-emerald-600 disabled:opacity-40">
                  {t('Done', 'סיום')}{genBlds.length ? ` · ${genBlds.length}` : ''}
                </button>
                <button onClick={() => setGenStep('ws')} className="text-[11px] text-gray-400 hover:text-gray-600">{t('back', 'חזרה')}</button>
              </div>
            ) : (
              <div>
                <div className={`${box} flex items-center gap-1.5`}>
                  <Search size={13} className="text-gray-400 flex-shrink-0" />
                  <input data-job-search autoFocus value={q} onChange={e => setQ(e.target.value)}
                    placeholder={t('Search every workspace — a name, a number, an address', 'חיפוש בכל מרחבי העבודה — שם, מספר, כתובת')}
                    className="flex-1 min-w-0 outline-none bg-transparent text-[12.5px]" />
                </div>
                <div className="mt-1 rounded-lg border border-gray-200 overflow-hidden">
                  {hits.map(h => (
                    <button key={`${h.projectId}:${h.job.id}`} data-job-hit={h.job.id}
                      onClick={() => { setPicked({ job: h.job, projectId: h.projectId }); setQ(''); }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] border-b border-gray-100 last:border-b-0 hover:bg-slate-50">
                      <span className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stagesFor(h.projectId).find(st => st.id === h.job.currentStageId)?.color ?? '#cbd5e1' }} />
                      <span className="truncate flex-1">{aptLabel(h.job) || h.job.displayName || h.job.address}</span>
                      <span className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                        style={{ backgroundColor: wsColor(h.projectId) }}>{h.ws}</span>
                    </button>
                  ))}
                  <button data-general-job onClick={() => setGenStep('ws')}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12px] font-bold text-[#1e3a5f] hover:bg-slate-50">
                    <Plus size={12} /> {t('A general job in a workspace', 'עבודה כללית במרחב עבודה')} ›
                  </button>
                </div>
              </div>
            )}
          </Field>
        )}

        {/* WHO — a search over every worker; more than one can be picked.
            Somebody not on the sheet gets a row: the notebook adds it. */}
        <Field label={t('Who', 'מי')}>
          <div className={`${box} flex items-center gap-1.5`}>
            <Search size={13} className="text-gray-400 flex-shrink-0" />
            <input data-who-search value={whoQ} onChange={e => setWhoQ(e.target.value)}
              placeholder={t('Search a worker…', 'חיפוש עובד…')}
              className="flex-1 min-w-0 outline-none bg-transparent text-[12.5px]" />
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {[...active.filter(c => who.includes(c.id)), ...whoHits.filter(c => !who.includes(c.id))].map(c => {
              const on = who.includes(c.id);
              return (
                <button key={c.id} data-who-pick={c.id} data-on={on ? '1' : undefined}
                  onClick={() => setWho(w => (on ? w.filter(x => x !== c.id) : [...w, c.id]))}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                    on ? 'text-white border-transparent' : 'text-gray-700 border-gray-200 hover:bg-gray-50'}`}
                  style={on ? { backgroundColor: '#1e3a5f' } : undefined}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: on ? '#fff' : personColor(c.name, c.color) }} />
                  {c.name}
                </button>
              );
            })}
          </div>
        </Field>

        {/* ONE box — what to do and any notes were two boxes saying the same
            thing. The paperclip and the voice memo live in its corner. */}
        <Field label={t('What has to be done', 'מה צריך לעשות')}>
          <MessageBox
            hook="planner-task-box"
            rows={3}
            autoFocus={!!job}
            value={task}
            onChange={setTask}
            placeholder={t('What has to happen — and anything the crew needs to know', 'מה צריך לקרות — וכל מה שהצוות צריך לדעת')}
            onAttach={pickedFiles => setFiles(prev => [...prev, ...pickedFiles])}
            onMemo={memo => { setFiles(prev => [...prev, memoFile(memo)]); }}
            onTranscript={text => setTask(v => v.trim() ? v : text)}
          />
        </Field>
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

        {/* The stage the work is ON, and where the job goes when it is closed. */}
        {!general && (
          <Field label={`${s.stageOnLabel} · ${s.stageToLabel}`}>
            <StagePairPicker stages={stageList} currentStageId={jobStage || null} value={pair} onChange={setPair}
              strings={stagePairStrings(s)} isRtl={isRtl} box={box} labels={false} />
          </Field>
        )}

        {/* The days: start, how many, Friday, a second stretch (with its own
            stages, and the one-or-two ask when they differ). */}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('Start day', 'יום התחלה')}>
            <input data-start-day type="date" value={start}
              onChange={e => { if (e.target.value) setStart(e.target.value); }} className={box} />
          </Field>
        </div>
        <TaskDaysPicker key={start} start={start} onDaysChange={setDays}
          stages={general ? undefined : stageList} currentStageId={jobStage || null} pair={pair}
          onSplitChange={setSplit} pairStrings={stagePairStrings(s)} splitStrings={splitStringsOf(s)} isRtl={isRtl} />
      </div>

      <Footer>
        {/* The no-task escape hatch stays a quiet side button — for the rare
            card that should sit on the sheet with no task behind it yet. */}
        {picked && !general && (
          <button data-just-park onClick={() => onDone({ taskIds: [], days: [start], contractorIds: who, jobId: picked.job.id,
              projectId: picked.projectId !== currentProjectId ? picked.projectId : undefined, parked: true })}
            disabled={busy}
            className="me-auto px-2 py-1.5 rounded-lg text-[11px] font-semibold
                       text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            title={t('Rare: the job sits on the planner with no task behind it', 'נדיר: העבודה יושבת בלוח בלי משימה')}>
            {t('Just put it on the planner', 'רק לשים בלוח')}
          </button>
        )}
        <button data-add-the-job onClick={make} disabled={busy || !canMake}
          className="px-3 py-1.5 rounded-lg text-[12.5px] font-bold text-white flex items-center gap-1.5
                     disabled:opacity-40"
          style={{ backgroundColor: '#4aa8d8' }}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          {t('Add the job', 'להוסיף את העבודה')}
        </button>
      </Footer>
    </Shell>
  );
}

/**
 * "Who, and which day?" — the first half of a drop that never touched the
 * notebook.
 *
 * A job dropped on the board's quick-assign box (the hover target that appears
 * mid-drag) is headed for the weekly notebook, but the drop itself carries no
 * square — so this asks for the row and the date, and Next hands over to the
 * standing PlannerTaskDialog exactly as if the tile had been dropped on that
 * square. It exists so a job can be planned into the far future without
 * dragging across weeks of notebook.
 */
export function QuickAssignDialog({ jobName, people, contractors, users, isRtl, onCancel, onNext }: {
  /** What is being assigned — a job's name, or a free-words card's text. */
  jobName: string;
  /** The notebook's own rows ('c:<id>' / 'u:<id>' / 'n:<name>'). */
  people: string[];
  contractors: Contractor[];
  users: User[];
  isRtl: boolean;
  onCancel: () => void;
  onNext: (person: string, dayIso: string) => void;
}) {
  const nameOf = (pid: string): string => {
    if (pid.startsWith('c:')) return contractors.find(c => c.id === pid.slice(2))?.name ?? pid.slice(2);
    if (pid.startsWith('u:')) return users.find(u => u.id === pid.slice(2))?.name ?? pid.slice(2);
    return pid.replace(/^n:/, '');
  };
  const [person, setPerson] = useState(people[0] ?? '');
  const todayIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [day, setDay] = useState(todayIso);

  return (
    <Shell onCancel={onCancel}
      title={isRtl ? `לשבץ את ${jobName || 'העבודה'}` : `Assign ${jobName || 'this job'}`}>
      <div className="p-4 space-y-3" data-quick-assign>
        <label className="block">
          <span className="block text-[11px] font-bold text-gray-500 mb-1">
            {isRtl ? 'למי' : 'Who'}
          </span>
          <select
            value={person} onChange={e => setPerson(e.target.value)}
            data-quick-person
            className="w-full text-sm border border-gray-200 rounded-xl px-2.5 py-2 bg-white">
            {people.map(pid => (
              <option key={pid} value={pid}>{nameOf(pid)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-bold text-gray-500 mb-1">
            {isRtl ? 'לאיזה יום' : 'Which day'}
          </span>
          <input
            type="date" value={day}
            onChange={e => setDay(e.target.value)}
            data-quick-day
            className="w-full text-sm border border-gray-200 rounded-xl px-2.5 py-2 bg-white" />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel}
            className="text-sm font-bold px-3 py-2 rounded-xl text-gray-500 hover:bg-gray-100">
            {isRtl ? 'ביטול' : 'Cancel'}
          </button>
          <button
            onClick={() => { if (person && day) onNext(person, day); }}
            disabled={!person || !day}
            data-quick-next
            className="text-sm font-bold px-4 py-2 rounded-xl bg-[#1e3a5f] text-white hover:bg-[#2c4f78] disabled:opacity-40">
            {isRtl ? 'הבא' : 'Next'}
          </button>
        </div>
      </div>
    </Shell>
  );
}

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

/** A recorded memo waiting to be sent, drawn as the player it will become. */
function PendingAudio({ file, onDelete }: { file: File; onDelete: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <VoiceMemoPlayer src={url} className="max-w-[250px]" onDelete={onDelete} /> : null;
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
  jobName, dayNum, dayCount, fromLabel, toLabel, toDay, covered, onCancel, onDone,
}: {
  jobName: string;
  /** Which day of the task the dragged card is (1-based), and how many it has. */
  dayNum: number;
  dayCount: number;
  /** "Moshe · Tue 18 Aug" for where it came from and where it landed. */
  fromLabel: string;
  toLabel: string;
  /** The landing day ALONE — "Friday 28 August" — with nobody's name in it. */
  toDay: string;
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
              sub={`A completely separate task on ${toDay}.`} />
          </>
        ) : (
          <>
            <p className="text-[13px] text-gray-600 m-0">
              This card is one day of a task that covers {dayCount} days.
            </p>
            <Choice id="move" title="Move this day"
              sub={`The work planned for ${fromLabel} happens on ${toLabel} instead.`} />
            <Choice id="add" title="Add this day to the existing task"
              sub={`${fromLabel} stays as well — the task grows to ${dayCount + 1} days, `
                + 'and the worker\'s schedule grows with it.'} />
            <Choice id="new" title="New task on this day"
              sub={`A completely separate task on ${toDay}.`} />
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

/**
 * A DIV, not a `<label>`. A label forwards a click to its first labelable
 * descendant when the click's own target is no longer inside it — and a
 * search hit is a button that UNMOUNTS in the very click that picks it (React
 * flushes the render synchronously). Chrome then handed that click to the
 * next button standing in the field, which was the picked row's own clear X:
 * every pick undid itself before the eye could see it.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="block text-[10.5px] font-bold text-gray-500 mb-1">{label}</span>
      {children}
    </div>
  );
}
