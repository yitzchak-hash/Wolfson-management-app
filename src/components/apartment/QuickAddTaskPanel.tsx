import React, { useState, useRef } from 'react';
import { X, Plus, CheckCircle2, Clock, CalendarDays, ArrowRight, User2, Paperclip, FileText, X as XIcon, AlertTriangle, Pencil, Save, ZoomIn, Loader2, Copy, Check } from 'lucide-react';
import {
  Apartment, User, ContractorCategory, TaskAttachment, ContractorAssignment, getStageName,
} from '../../types';
import { useStore } from '../../data/store';
import { VoiceRecorderButton } from '../ui/VoiceMemo';
import { RecordedMemo } from '../../data/voiceMemo';
import { contractorLoad, loadTooltip, loadColor } from '../../data/contractorLoad';
import { taskShareText, copyTaskShare } from '../../data/taskShare';
import { format, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns';
import { findOrCreateFolderViaBackend, uploadFileViaResumableSession, shareFileToDrive, isUploadBackendConfigured, extractFolderId } from '../../data/driveApi';

const CAT_COLORS: Record<ContractorCategory, string> = {
  drywall: '#f59e0b', ac: '#3b82f6', general: '#10b981',
};

interface Props {
  apartment: Apartment;
  onClose: () => void;
  currentUser: User;
  onToast: (msg: string) => void;
}

export function QuickAddTaskPanel({ apartment, onClose, currentUser, onToast }: Props) {
  const { stages, contractors, contractorAssignments, updateContractorAssignment,
    addContractorAssignment, updateApartment, currentProjectId, projects } = useStore();
  /** The workspace's name, so a pasted message says which site it is about. */
  const projectLabel = projects.find(p => p.id === currentProjectId)?.name;
  const s = useStore(state => state.mainUiStrings);

  function getDueBadge(dueDate: string | null) {
    if (!dueDate) return null;
    const days = differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
    if (days < 0) return { text: s.overdue, cls: 'bg-red-100 text-red-700 border-red-200' };
    if (days === 0) return { text: s.today, cls: 'bg-orange-100 text-orange-700 border-orange-200' };
    if (days === 1) return { text: s.tomorrow, cls: 'bg-amber-100 text-amber-700 border-amber-200' };
    if (days <= 3) return { text: `${days} ${s.daysLabel}`, cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
    return { text: format(parseISO(dueDate), 'MMM d'), cls: 'bg-gray-100 text-gray-500 border-gray-200' };
  }

  const catLabel = (c: string) => c === 'ac' ? s.categoryAC : c === 'drywall' ? s.categoryDrywall : s.categoryGeneral;

  const [contractorId, setContractorId] = useState('');
  const [inlineDrive, setInlineDrive] = useState('');

  /** Sets the job's Drive folder without leaving this panel. */
  function saveInlineDrive() {
    const link = inlineDrive.trim();
    if (!link || !currentUser) return;
    updateApartment(apartment.id, { driveLink: link }, currentUser);
    setInlineDrive('');
    onToast('Drive folder saved');
  }
  const [task, setTask] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [stageId, setStageId] = useState(apartment.currentStageId ?? '');
  const [priority, setPriority] = useState('');
  const [showForm, setShowForm] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  /**
   * Saving, and then what was saved.
   *
   * A task used to vanish the instant it was made, with a toast that was gone
   * before you read it — so there was no moment at which the thing you had
   * just created existed on screen. `saved` holds it: a confirmation, and the
   * one button people actually want next, which is telling the contractor.
   */
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<ContractorAssignment | null>(null);
  const [copied, setCopied] = useState(false);
  const [attProgress, setAttProgress] = useState<Record<string, number>>({});
  const [previewAtt, setPreviewAtt] = useState<TaskAttachment | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editContractorId, setEditContractorId] = useState('');
  const [editTask, setEditTask] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editStageId, setEditStageId] = useState('');
  const attachRef = useRef<HTMLInputElement>(null);

  function startEdit(a: typeof aptTasks[0]) {
    setEditingTaskId(a.id);
    setEditContractorId(a.contractorId);
    setEditTask(a.taskDescription);
    setEditDueDate(a.dueDate ?? '');
    setEditStageId(a.stageId ?? '');
  }

  function saveEdit(id: string) {
    if (!editTask.trim()) return;
    updateContractorAssignment(id, {
      contractorId: editContractorId,
      taskDescription: editTask.trim(),
      dueDate: editDueDate || null,
      stageId: editStageId || null,
    });
    setEditingTaskId(null);
  }

  // Scoped to THIS workspace. Without the filter the picker listed every
  // project's stages together, which is the same mixing bug the drawer had.
  const sortedStages = [...stages]
    .filter(st => st.active && (currentProjectId === 'general' ? st.projectId === 'general' : !st.projectId))
    .sort((a, b) => a.order - b.order);
  const currentStage = stages.find(s => s.id === apartment.currentStageId);
  const currentIdx = sortedStages.findIndex(s => s.id === apartment.currentStageId);
  const nextStage = currentIdx >= 0 && currentIdx < sortedStages.length - 1
    ? sortedStages[currentIdx + 1]
    : currentIdx === -1 && sortedStages.length > 0
      ? sortedStages[0]
      : null;

  const aptTasks = contractorAssignments
    .filter(a => a.apartmentId === apartment.id)
    .sort((a, b) => {
      if (!!a.completedAt !== !!b.completedAt) return a.completedAt ? 1 : -1;
      return (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z');
    });

  const pendingCount = aptTasks.filter(a => !a.completedAt).length;
  const completedCount = aptTasks.filter(a => !!a.completedAt).length;
  const visibleTasks = hideCompleted ? aptTasks.filter(a => !a.completedAt) : aptTasks;

  async function handleAdd() {
    if (!contractorId || !task.trim() || !apartment.driveLink) return;

    let finalAttachments = attachments;

    const backendOn = isUploadBackendConfigured();
    const mainFolderId = extractFolderId(apartment.driveLink);
    if (backendOn && mainFolderId && attachmentFiles.length > 0) {
      setUploading(true);
      try {
        const tasksFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Tasks');
        finalAttachments = [];
        for (let i = 0; i < attachmentFiles.length; i++) {
          const file = attachmentFiles[i];
          const att = attachments[i];
          setAttProgress(p => ({ ...p, [att.id]: 0 }));
          try {
            const { fileId, webViewLink } = await uploadFileViaResumableSession(
              tasksFolderId, file, pct => setAttProgress(p => ({ ...p, [att.id]: pct })),
            );
            await shareFileToDrive(fileId);
            finalAttachments.push({ ...att, dataUrl: '', driveFileId: fileId, driveUrl: webViewLink });
          } catch {
            finalAttachments.push(att);
          } finally {
            setAttProgress(p => { const n = { ...p }; delete n[att.id]; return n; });
          }
        }
      } catch {
        // folder creation failed — fall back to base64 attachments
      } finally {
        setUploading(false);
        setAttProgress({});
      }
    }

    setSaving(true);
    const made: ContractorAssignment = {
      id: '',
      createdAt: new Date().toISOString(),
      contractorId,
      apartmentId: apartment.id,
      buildingId: apartment.buildingId,
      taskDescription: task.trim(),
      dueDate: dueDate || null,
      stageId: stageId || null,
      completedAt: null,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      ...(finalAttachments.length ? { attachments: finalAttachments } : {}),
      ...(priority ? { priority: priority as import('../../types').TaskPriority } : {}),
    } as ContractorAssignment;
    addContractorAssignment(made);
    if (stageId && stageId !== apartment.currentStageId) {
      updateApartment(apartment.id, { currentStageId: stageId }, currentUser);
    }
    setTask('');
    setContractorId('');
    setDueDate('');
    setPriority('');
    setAttachments([]);
    setAttachmentFiles([]);
    setAttProgress({});
    setSaving(false);
    setSaved(made);
    onToast(s.taskAdded);
  }

  const aptLabel = apartment.displayName || apartment.apartmentNumber;

  return (
    <>
      <div className="drawer-overlay fixed inset-0 bg-black/25 z-40" onClick={onClose} />

      {/* Centred, not a side drawer.
          Everything else that opens over the board is a centred modal now, and
          a panel that slides in from the right for this one action was the last
          thing still behaving the old way. */}
      <div
        className="drawer-panel fixed bg-white shadow-2xl z-50 flex flex-col rounded-2xl overflow-hidden"
        style={{
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(560px, 94vw)', height: 'min(760px, 90vh)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#1e3a5f] text-white flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col">
              <span className="font-bold text-lg">{s.aptPrefix} {aptLabel}</span>
              <span className="text-[#4aa8d8] text-xs font-medium">{apartment.buildingId}</span>
            </div>
            {/* Stage breadcrumb */}
            {(currentStage || nextStage) && (
              <div className="flex items-center gap-1.5 ml-2 bg-white/10 rounded-lg px-2.5 py-1.5">
                {currentStage ? (
                  <span className="text-xs font-medium" style={{ color: currentStage.color }}>{currentStage.name}</span>
                ) : (
                  <span className="text-xs text-white/50 italic">{s.notStartedOption}</span>
                )}
                {nextStage && (
                  <>
                    <ArrowRight size={11} className="text-white/40 flex-shrink-0" />
                    <span className="text-xs text-white/60">{nextStage.name}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">

          {/* Task list */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Clock size={14} className="text-gray-400" />
                {s.tasksHeading}
                {pendingCount > 0 && (
                  <span className="text-xs bg-[#1e3a5f]/10 text-[#1e3a5f] px-1.5 py-0.5 rounded-full font-medium">
                    {pendingCount} {s.pendingBadge}
                  </span>
                )}
              </h3>
              {completedCount > 0 && (
                <button
                  onClick={() => setHideCompleted(v => !v)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${
                    hideCompleted ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  <CheckCircle2 size={11} />
                  {hideCompleted ? `${completedCount} hidden` : s.hideDone}
                </button>
              )}
            </div>

            {aptTasks.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <User2 size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{s.noTasksYet}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleTasks.map(a => {
                  const contractor = contractors.find(c => c.id === a.contractorId);
                  const stage = stages.find(s => s.id === a.stageId);
                  const dueBadge = getDueBadge(a.dueDate);
                  const isEditing = editingTaskId === a.id;

                  if (isEditing) {
                    return (
                      <div key={a.id} className="rounded-xl border-2 border-[#1e3a5f]/20 bg-blue-50/50 p-3 space-y-2">
                        <select
                          value={editContractorId}
                          onChange={e => setEditContractorId(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                        >
                          <option value="">{s.selectContractor}</option>
                          {(['drywall', 'ac', 'general'] as ContractorCategory[]).map(cat => {
                            const items = contractors.filter(c => c.category === cat && c.active);
                            if (!items.length) return null;
                            return (
                              <optgroup key={cat} label={catLabel(cat)}>
                                {items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </optgroup>
                            );
                          })}
                        </select>
                        <textarea
                          value={editTask}
                          onChange={e => setEditTask(e.target.value)}
                          rows={2}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={editStageId}
                            onChange={e => setEditStageId(e.target.value)}
                            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                          >
                            <option value="">{s.stageLabel}</option>
                            {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <input
                            type="date"
                            value={editDueDate}
                            onChange={e => setEditDueDate(e.target.value)}
                            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingTaskId(null)}
                            className="flex-1 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            {s.cancel}
                          </button>
                          <button
                            onClick={() => saveEdit(a.id)}
                            disabled={!editTask.trim() || !editContractorId}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium bg-[#1e3a5f] text-white rounded-lg hover:bg-[#162d4a] disabled:opacity-40 transition-colors"
                          >
                            <Save size={11} /> {s.save}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={a.id}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                        a.completedAt ? 'border-green-100 bg-green-50/50 opacity-70' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <button
                        onClick={() => updateContractorAssignment(a.id, { completedAt: a.completedAt ? null : new Date().toISOString() })}
                        className="mt-0.5 flex-shrink-0"
                      >
                        {a.completedAt
                          ? <CheckCircle2 size={16} className="text-green-500" />
                          : <div className="w-4 h-4 rounded-full border-2 border-gray-300 hover:border-green-400 transition-colors" />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          {contractor && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: CAT_COLORS[contractor.category] + '22', color: CAT_COLORS[contractor.category] }}
                            >
                              {contractor.name}
                            </span>
                          )}
                          {stage && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: stage.color + '20', color: stage.color }}>
                              {getStageName(stage, s.isRtl)}
                            </span>
                          )}
                        </div>
                        <p className={`text-xs leading-snug ${a.completedAt ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                          {a.taskDescription}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {a.dueDate && (
                            <span className="flex items-center gap-1 text-[10px] text-gray-400">
                              <CalendarDays size={9} /> {format(parseISO(a.dueDate), 'MMM d')}
                            </span>
                          )}
                          {dueBadge && !a.completedAt && (
                            <span className={`text-[10px] px-1 py-0.5 rounded border font-medium ${dueBadge.cls}`}>
                              {dueBadge.text}
                            </span>
                          )}
                          {(a.attachments?.length ?? 0) > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                              <Paperclip size={9} /> {a.attachments!.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => startEdit(a)}
                        className="flex-shrink-0 mt-0.5 p-1 rounded-lg text-gray-300 hover:text-[#1e3a5f] hover:bg-gray-100 transition-colors"
                        title="Edit task"
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add task form */}
          <div className="px-5 pb-5">
            <div
              className={`rounded-xl border-2 overflow-hidden transition-all ${showForm ? 'border-[#1e3a5f]/20 bg-blue-50/50' : 'border-dashed border-gray-200'}`}
            >
              {!showForm ? (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-gray-500 hover:text-[#1e3a5f] transition-colors"
                >
                  <Plus size={15} /> {s.addTask}
                </button>
              ) : (
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-semibold text-[#1e3a5f]">{s.newTaskHeading}</h3>
                    <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>

                  {/* Telling someone to go and do something in another tab, then
                      come back, is a worse answer than simply letting them do it
                      here. The field is the fix, not the warning. */}
                  {!apartment.driveLink && (
                    <div className="text-xs bg-amber-50 rounded-lg px-3 py-2.5 border border-amber-200">
                      <div className="flex items-start gap-2 text-amber-800 mb-2">
                        <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                        <span>This job has no Drive folder yet — the contractor's photos need somewhere to go.</span>
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          value={inlineDrive}
                          onChange={e => setInlineDrive(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveInlineDrive(); }}
                          placeholder="https://drive.google.com/drive/folders/…"
                          className="flex-1 min-w-0 border border-amber-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                        />
                        <button
                          onClick={saveInlineDrive}
                          disabled={!inlineDrive.trim()}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                          style={{ backgroundColor: '#b45309' }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}

                  {/* The number after each name is how much that contractor
                      already has open — visible at the moment it matters, and
                      nowhere else. */}
                  <select
                    value={contractorId}
                    onChange={e => setContractorId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                  >
                    <option value="">{s.selectContractor}</option>
                    {(['drywall', 'ac', 'general'] as ContractorCategory[]).map(cat => {
                      const items = contractors.filter(c => c.category === cat && c.active);
                      if (!items.length) return null;
                      return (
                        <optgroup key={cat} label={catLabel(cat)}>
                          {items.map(c => {
                            const l = contractorLoad(contractorAssignments, c.id);
                            return (
                              <option key={c.id} value={c.id}>
                                {c.name}{l.open ? ` · ${l.open}${l.overdue ? ` (${l.overdue} late)` : ''}` : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      );
                    })}
                  </select>
                  {contractorId && (() => {
                    const l = contractorLoad(contractorAssignments, contractorId);
                    return (
                      <div className="flex items-center gap-1.5 -mt-1" title={loadTooltip(l)}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: loadColor(l) }} />
                        <span className="text-[11px]" style={{ color: loadColor(l) }}>{loadTooltip(l)}</span>
                      </div>
                    );
                  })()}

                  <textarea
                    value={task}
                    onChange={e => setTask(e.target.value)}
                    rows={2}
                    placeholder={s.taskDescriptionPlaceholder}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
                  />

                  {/* Attachments row */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => attachRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#1e3a5f] transition-colors px-2 py-1 rounded-lg border border-dashed border-gray-300 hover:border-[#1e3a5f]/40"
                    >
                      <Paperclip size={12} /> {s.attachBtn}
                    </button>
                    {/* A memo rides the same TaskAttachment shape as any file —
                        it is audio, and the task already knows how to carry a
                        file. Nothing new to persist, export or import. */}
                    <VoiceRecorderButton
                      compact
                      onRecorded={(memo: RecordedMemo) => {
                        const ext = memo.blob.type.includes('mp4') ? 'm4a' : 'webm';
                        const reader = new FileReader();
                        reader.onload = ev => setAttachments(prev => [...prev, {
                          id: Math.random().toString(36).substr(2, 9),
                          filename: `voice-memo-${Date.now()}.${ext}`,
                          mimeType: memo.blob.type || 'audio/webm',
                          dataUrl: ev.target?.result as string,
                        }]);
                        reader.readAsDataURL(memo.blob);
                      }}
                    />
                    <input
                      ref={attachRef}
                      type="file"
                      multiple
                      accept="image/*,application/pdf,.doc,.docx"
                      className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        files.forEach(file => {
                          const reader = new FileReader();
                          reader.onload = ev => {
                            setAttachments(prev => [...prev, {
                              id: Math.random().toString(36).substr(2, 9),
                              filename: file.name,
                              mimeType: file.type,
                              dataUrl: ev.target?.result as string,
                            }]);
                            setAttachmentFiles(prev => [...prev, file]);
                          };
                          reader.readAsDataURL(file);
                        });
                        if (attachRef.current) attachRef.current.value = '';
                      }}
                    />
                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {attachments.map(att => {
                          const pct = attProgress[att.id] ?? null;
                          const isUploading = pct !== null;
                          return (
                            <div
                              key={att.id}
                              className="relative flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:border-[#1e3a5f]/40 transition-colors"
                              style={{ maxWidth: '120px' }}
                              onClick={() => att.mimeType.startsWith('image/') && setPreviewAtt(att)}
                            >
                              {/* Green upload progress bar fills from left */}
                              {isUploading && (
                                <div
                                  className="absolute inset-0 bg-green-400/30 transition-all duration-300 pointer-events-none"
                                  style={{ width: `${pct}%` }}
                                />
                              )}
                              {att.mimeType.startsWith('image/') ? (
                                <div className="relative w-8 h-8 flex-shrink-0">
                                  <img src={att.dataUrl} alt={att.filename} className="w-8 h-8 object-cover" />
                                  {!isUploading && (
                                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 flex items-center justify-center transition-all">
                                      <ZoomIn size={10} className="text-white opacity-0 hover:opacity-100" />
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 bg-gray-100">
                                  <FileText size={14} className="text-gray-400" />
                                </div>
                              )}
                              <span className="text-[10px] text-gray-500 truncate pr-1 relative z-10" style={{ maxWidth: '60px' }}>
                                {isUploading ? `${Math.round(pct)}%` : att.filename}
                              </span>
                              {!isUploading && (
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    const idx = attachments.findIndex(a => a.id === att.id);
                                    setAttachments(prev => prev.filter(a => a.id !== att.id));
                                    setAttachmentFiles(prev => prev.filter((_, i) => i !== idx));
                                  }}
                                  className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center z-10"
                                >
                                  <XIcon size={8} color="white" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={stageId}
                      onChange={e => setStageId(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    >
                      <option value="">{s.stageOptional}</option>
                      {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    />
                    <select
                      value={priority}
                      onChange={e => setPriority(e.target.value)}
                      className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    >
                      <option value="">{s.noPriorityLabel}</option>
                      <option value="urgent">{s.urgentPriority}</option>
                      <option value="normal">{s.normalPriority}</option>
                      <option value="low">{s.lowPriority}</option>
                    </select>
                  </div>

                  <button
                    data-create-task
                    onClick={handleAdd}
                    disabled={!contractorId || !task.trim() || !apartment.driveLink || uploading || saving}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] disabled:opacity-40 transition-colors"
                  >
                    {uploading || saving
                      ? <Loader2 size={15} className="animate-spin" />
                      : <Plus size={15} />}
                    {uploading ? s.uploadingLabel : saving ? 'Saving…' : s.createTask}
                  </button>

                  {/* What was just made, and the thing you do next with it.
                      A task used to vanish the moment it was created, so there
                      was no point at which it existed on screen — and telling
                      the contractor meant retyping the address, the date and
                      the plan link into WhatsApp by hand. */}
                  {saved && (
                    <div data-task-saved
                      className="mt-3 rounded-xl border p-3"
                      style={{ borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <CheckCircle2 size={14} className="text-green-600" />
                        <span className="text-[12.5px] font-bold text-green-800">
                          Sent to {contractors.find(c => c.id === saved.contractorId)?.name ?? 'them'}
                        </span>
                      </div>
                      <button
                        data-copy-task
                        onClick={async () => {
                          const ok = await copyTaskShare(taskShareText({
                            task: saved,
                            apartment,
                            contractor: contractors.find(c => c.id === saved.contractorId),
                            stage: sortedStages.find(st => st.id === saved.stageId),
                            projectName: projectLabel,
                            isRtl: !!s.isRtl,
                          }));
                          setCopied(ok);
                          onToast(ok ? 'Copied — paste it into WhatsApp'
                                     : 'Could not copy — press Ctrl+C');
                          if (ok) setTimeout(() => setCopied(false), 2400);
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg
                                   text-[12.5px] font-bold text-white transition-colors"
                        style={{ backgroundColor: copied ? '#16a34a' : '#25D366' }}
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? 'Copied' : 'Copy the details to send'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Attachment image preview overlay */}
      {previewAtt && (
        <div
          className="fixed inset-0 z-[400] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewAtt(null)}
        >
          <div className="relative max-w-full max-h-full" onClick={e => e.stopPropagation()}>
            <img
              src={previewAtt.dataUrl}
              alt={previewAtt.filename}
              className="max-w-[90vw] max-h-[80vh] object-contain rounded-xl shadow-2xl"
            />
            <button
              onClick={() => setPreviewAtt(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white"
            >
              <X size={16} />
            </button>
            <p className="text-center text-white/60 text-xs mt-2 truncate max-w-[90vw]">{previewAtt.filename}</p>
          </div>
        </div>
      )}
    </>
  );
}
