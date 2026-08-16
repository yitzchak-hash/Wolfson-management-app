import React, { useState, useRef } from 'react';
import { ChevronDown, ChevronUp, Save, Calendar, User, MessageSquare, Paperclip, X, ExternalLink, Clock, RotateCcw } from 'lucide-react';
import { Stage, User as UserType, StageNoteAttachment, getStageName } from '../../types';
import { useStore } from '../../data/store';
import { VoiceRecorderButton } from '../ui/VoiceMemo';
import { RecordedMemo } from '../../data/voiceMemo';
import { format } from 'date-fns';
import {
  isUploadBackendConfigured, extractFolderId,
  findOrCreateFolderViaBackend, uploadFileViaResumableSession,
  shareFileToDrive, driveThumbUrl,
} from '../../data/driveApi';

interface StageNotesSectionProps {
  apartmentId: string;
  stages: Stage[];
  currentUser: UserType;
  onSaved: () => void;
}

interface PendingAttachment {
  id: string;
  filename: string;
  mimeType: string;
  dataUrl: string;
  driveFileId?: string;
  driveUrl?: string;
}

export function StageNotesSection({ apartmentId, stages, currentUser, onSaved }: StageNotesSectionProps) {
  const {
    upsertStageNote, getStageNote, getStageNoteVersions,
    apartments, contractors, contractorAssignments, contractorNotes, contractorPhotos,
    addContractorAssignment, updateContractorAssignment, deleteContractorAssignment,
  } = useStore();
  const s = useStore(state => state.mainUiStrings);

  const [openStage, setOpenStage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Multi-attachment support: stageId → array of pending attachments
  const [pendingAttachments, setPendingAttachments] = useState<Record<string, PendingAttachment[]>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [historyOpen, setHistoryOpen] = useState<string | null>(null); // stageId with open history
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileInputTarget, setFileInputTarget] = useState<string | null>(null);

  const apt = apartments.find(a => a.id === apartmentId);
  const sortedStages = [...stages].filter(st => st.active).sort((a, b) => a.order - b.order);
  const activeContractors = contractors.filter(c => c.active);

  async function compressImage(file: File): Promise<File> {
    if (!file.type.startsWith('image/')) return file;
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1200;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', 0.72);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /**
   * A memo is attached as an audio FILE, through the same path a photo takes.
   *
   * Everything downstream — the Drive upload, the pending list, the note record,
   * the sync — already knows how to carry a file, and giving voice its own field
   * would mean a new key in persist, export and import (CLAUDE.md's rule) for no
   * behaviour that a file does not already have.
   */
  async function handleVoiceMemo(stageId: string, memo: RecordedMemo) {
    const ext = memo.blob.type.includes('mp4') ? 'm4a' : 'webm';
    await handleFileChosen(stageId, new File(
      [memo.blob], `voice-memo-${Date.now()}.${ext}`,
      { type: memo.blob.type || 'audio/webm' },
    ));
  }

  async function handleFileChosen(stageId: string, file: File) {
    const processed = await compressImage(file);
    const attId = Math.random().toString(36).substr(2, 9);

    // Try Drive upload first
    if (isUploadBackendConfigured() && apt?.driveLink) {
      try {
        const mainFolderId = extractFolderId(apt.driveLink);
        if (mainFolderId) {
          setUploadProgress(p => ({ ...p, [attId]: 1 }));
          const photosFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Photos');
          const notesFolderId = await findOrCreateFolderViaBackend(photosFolderId, 'Stage Notes');
          const { fileId, webViewLink } = await uploadFileViaResumableSession(
            notesFolderId, processed,
            pct => setUploadProgress(p => ({ ...p, [attId]: pct })),
          );
          await shareFileToDrive(fileId);
          setUploadProgress(p => { const n = { ...p }; delete n[attId]; return n; });
          setPendingAttachments(pa => ({
            ...pa,
            [stageId]: [...(pa[stageId] ?? []), { id: attId, filename: processed.name, mimeType: processed.type, dataUrl: '', driveFileId: fileId, driveUrl: webViewLink }],
          }));
          return;
        }
      } catch (e) {
        console.warn('Drive upload failed for stage note, falling back to base64:', e);
        setUploadProgress(p => { const n = { ...p }; delete n[attId]; return n; });
      }
    }

    // Fall back to base64
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string ?? '';
      setPendingAttachments(pa => ({
        ...pa,
        [stageId]: [...(pa[stageId] ?? []), { id: attId, filename: processed.name, mimeType: processed.type, dataUrl }],
      }));
    };
    reader.readAsDataURL(processed);
  }

  function handleSave(stageId: string) {
    const text = drafts[stageId] ?? (getStageNote(apartmentId, stageId)?.noteText ?? '');
    const pending = pendingAttachments[stageId] ?? [];
    const existingNote = getStageNote(apartmentId, stageId);

    // Merge existing saved attachments with newly added ones
    const existingAtts: StageNoteAttachment[] = existingNote?.attachments ?? [];
    const allAtts: StageNoteAttachment[] = [
      ...existingAtts,
      ...pending.map(p => ({ id: p.id, filename: p.filename, mimeType: p.mimeType, dataUrl: p.dataUrl, driveFileId: p.driveFileId, driveUrl: p.driveUrl })),
    ];

    upsertStageNote(apartmentId, stageId, text, currentUser, undefined, allAtts.length > 0 ? allAtts : undefined);
    setPendingAttachments(pa => { const n = { ...pa }; delete n[stageId]; return n; });
    onSaved();
  }

  function handleRemoveAttachment(stageId: string, attId: string) {
    const note = getStageNote(apartmentId, stageId);
    if (!note) return;
    const updated = (note.attachments ?? []).filter(a => a.id !== attId);
    const text = drafts[stageId] ?? note.noteText;
    upsertStageNote(apartmentId, stageId, text, currentUser, undefined, updated);
  }

  function handleRemovePending(stageId: string, attId: string) {
    setPendingAttachments(pa => ({ ...pa, [stageId]: (pa[stageId] ?? []).filter(a => a.id !== attId) }));
  }

  function handleRestoreVersion(stageId: string, noteText: string) {
    setDrafts(d => ({ ...d, [stageId]: noteText }));
    setHistoryOpen(null);
  }

  function getDraft(stageId: string): string {
    if (drafts[stageId] !== undefined) return drafts[stageId];
    return getStageNote(apartmentId, stageId)?.noteText ?? '';
  }

  function getAssignment(stageId: string) {
    return contractorAssignments.find(
      a => a.apartmentId === apartmentId && a.stageId === stageId
    );
  }

  function handleContractorChange(stageId: string, contractorId: string) {
    const existing = getAssignment(stageId);
    if (!contractorId) {
      if (existing) deleteContractorAssignment(existing.id);
      return;
    }
    const contractor = contractors.find(c => c.id === contractorId);
    if (!contractor || !apt) return;
    if (existing) {
      updateContractorAssignment(existing.id, { contractorId });
    } else {
      addContractorAssignment({
        contractorId,
        apartmentId,
        buildingId: apt.buildingId,
        taskDescription: `${stages.find(st => st.id === stageId)?.name ?? 'Stage'} work`,
        dueDate: null,
        stageId,
        completedAt: null,
        createdBy: currentUser.id,
        createdByName: currentUser.name,
      });
    }
  }

  const allAptAssignmentIds = contractorAssignments
    .filter(a => a.apartmentId === apartmentId)
    .map(a => a.id);
  const allContractorNotes = contractorNotes.filter(
    n => allAptAssignmentIds.includes(n.assignmentId) && n.authorType === 'contractor',
  );

  return (
    <div className="space-y-1.5">
      {/* Hidden file input shared across all stages */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
        multiple
        className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          if (fileInputTarget) files.forEach(f => handleFileChosen(fileInputTarget, f));
          e.target.value = '';
        }}
      />

      {sortedStages.map(stage => {
        const note = getStageNote(apartmentId, stage.id);
        const isOpen = openStage === stage.id;
        const hasNote = note && note.noteText.trim();
        const stageDate = apt?.stageDates?.[stage.id];
        const assignment = getAssignment(stage.id);
        const assignedContractor = assignment ? contractors.find(c => c.id === assignment.contractorId) : null;
        const pendingList = pendingAttachments[stage.id] ?? [];
        const anyUploading = Object.keys(uploadProgress).length > 0;
        const savedAtts = note?.attachments ?? (note?.attachmentFilename ? [{ id: 'legacy', filename: note.attachmentFilename!, mimeType: note.attachmentMimeType!, dataUrl: note.attachmentDataUrl, driveFileId: note.attachmentDriveFileId, driveUrl: note.attachmentDriveUrl }] : []);
        const hasAttachment = savedAtts.length > 0 || pendingList.length > 0;
        const noteVersions = note ? getStageNoteVersions(note.id) : [];
        const isHistoryOpen = historyOpen === stage.id;

        return (
          <div key={stage.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setOpenStage(isOpen ? null : stage.id)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-medium text-gray-800">{getStageName(stage, s.isRtl)}</span>
                {hasNote && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{s.noteLabel}</span>
                )}
                {savedAtts.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <Paperclip size={9} />{savedAtts.length} {savedAtts.length !== 1 ? s.filesLabel : s.fileLabel}
                  </span>
                )}
                {assignedContractor && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    <User size={9} />
                    {assignedContractor.name}
                  </span>
                )}
              </div>
              {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>

            {isOpen && (
              <div className="p-3 space-y-3 bg-white">
                {stageDate && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setHistoryOpen(isHistoryOpen ? null : stage.id); }}
                      className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-[#4aa8d8] transition-colors"
                      title="View stage history"
                    >
                      <Clock size={11} />
                      {format(new Date(stageDate), 'MMM d, yyyy')}
                    </button>
                  </div>
                )}
                {isHistoryOpen && stageDate && (() => {
                  const stageTasks = contractorAssignments.filter(
                    a => a.apartmentId === apartmentId && a.stageId === stage.id
                  );
                  return (
                    <div className="rounded-lg border border-[#4aa8d8]/20 bg-[#4aa8d8]/5 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4aa8d8]">
                        <Clock size={11} />
                        Stage reached: {format(new Date(stageDate), 'MMMM d, yyyy · HH:mm')}
                      </div>
                      {stageTasks.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-[#4aa8d8]/15">
                          {stageTasks.map(t => {
                            const contractor = contractors.find(c => c.id === t.contractorId);
                            return (
                              <div key={t.id} className="flex items-start gap-2 text-xs">
                                <span className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.completedAt ? 'bg-green-400' : 'bg-gray-300'}`} />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-gray-700 leading-snug ${t.completedAt ? 'line-through text-gray-400' : ''}`}>{t.taskDescription}</p>
                                  <div className="flex items-center gap-2 mt-0.5 text-gray-400">
                                    {contractor && <span>{contractor.name}</span>}
                                    {t.completedAt && <span className="text-green-600">✓ {format(new Date(t.completedAt), 'MMM d')}</span>}
                                    {t.dueDate && !t.completedAt && <span>{format(new Date(t.dueDate), 'MMM d')}</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {stageTasks.length === 0 && (
                        <p className="text-[11px] text-gray-400 pt-1 border-t border-[#4aa8d8]/15">No tasks for this stage</p>
                      )}
                    </div>
                  );
                })()}

                {/* Contractor assignment */}
                {activeContractors.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
                      <User size={11} />
                      {s.assignContractor}
                    </label>
                    <select
                      value={assignment?.contractorId ?? ''}
                      onChange={e => handleContractorChange(stage.id, e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    >
                      <option value="">{s.noneSelected}</option>
                      {['drywall', 'ac', 'general'].map(cat => {
                        const catContractors = activeContractors.filter(c => c.category === cat);
                        if (!catContractors.length) return null;
                        const catLabel = cat === 'ac' ? s.categoryAC : cat === 'drywall' ? s.categoryDrywall : s.categoryGeneral;
                        return (
                          <optgroup key={cat} label={catLabel}>
                            {catContractors.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Office notes */}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{s.officeNotes}</p>
                  <textarea
                    value={getDraft(stage.id)}
                    onChange={e => setDrafts(d => ({ ...d, [stage.id]: e.target.value }))}
                    placeholder={`${s.officeNotesFor} ${getStageName(stage, s.isRtl)}...`}
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  />

                  {/* Saved attachments (multi) */}
                  {savedAtts.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {savedAtts.map(att => (
                        <div key={att.id} className="relative group">
                          {att.mimeType?.startsWith('image/') ? (
                            att.driveFileId ? (
                              <a href={att.driveUrl ?? '#'} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={driveThumbUrl(att.driveFileId, 300)}
                                  alt={att.filename}
                                  className="h-16 w-16 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-90"
                                />
                              </a>
                            ) : att.dataUrl ? (
                              <img src={att.dataUrl} alt={att.filename} className="h-16 w-16 rounded-lg object-cover border border-gray-200" />
                            ) : null
                          ) : (
                            <a href={att.driveUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200 transition-colors">
                              <Paperclip size={10} />
                              <span className="truncate max-w-[140px]">{att.filename}</span>
                              <ExternalLink size={9} className="text-gray-400 flex-shrink-0" />
                            </a>
                          )}
                          {att.id !== 'legacy' && (
                            <button
                              onClick={() => handleRemoveAttachment(stage.id, att.id)}
                              className="absolute -top-1 -right-1 w-4 h-4 hidden group-hover:flex items-center justify-center rounded-full bg-black/60 text-white"
                            >
                              <X size={9} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pending (new) attachments */}
                  {pendingList.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {pendingList.map(p => (
                        <div key={p.id} className="relative">
                          {p.mimeType.startsWith('image/') && (p.dataUrl || p.driveFileId) ? (
                            <>
                              <img
                                src={p.driveFileId ? driveThumbUrl(p.driveFileId, 300) : p.dataUrl}
                                alt={p.filename}
                                className="h-16 w-16 rounded-lg object-cover border border-blue-200"
                              />
                              <button onClick={() => handleRemovePending(stage.id, p.id)}
                                className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-black/60 text-white">
                                <X size={9} />
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
                              <Paperclip size={11} />
                              <span className="flex-1 truncate max-w-[120px]">{p.filename}</span>
                              <button onClick={() => handleRemovePending(stage.id, p.id)} className="text-blue-400 hover:text-blue-600">
                                <X size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload progress bars */}
                  {anyUploading && (
                    <div className="mt-1.5 space-y-1">
                      {Object.entries(uploadProgress).map(([id, pct]) => (
                        <div key={id} className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 transition-all duration-300 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-1">
                    {note ? (
                      <span className="text-xs text-gray-400">
                        {note.updatedByName} · {format(new Date(note.updatedAt), 'MMM d, yyyy HH:mm')}
                      </span>
                    ) : <span />}
                    <div className="flex items-center gap-1.5">
                      {noteVersions.length > 0 && (
                        <button
                          onClick={() => setHistoryOpen(isHistoryOpen ? null : stage.id)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 border rounded-lg text-xs transition-colors ${isHistoryOpen ? 'bg-purple-50 border-purple-200 text-purple-600' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                          title={`${noteVersions.length} ${noteVersions.length === 1 ? s.versionCount : s.versionsCount}`}
                        >
                          <Clock size={11} />
                          {noteVersions.length}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setFileInputTarget(stage.id);
                          fileInputRef.current?.click();
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50 transition-colors"
                        title={s.attachFile}
                      >
                        <Paperclip size={12} />
                      </button>
                      {/* Beside the paperclip, everywhere a note takes a file. */}
                      <VoiceRecorderButton
                        compact
                        onRecorded={m => handleVoiceMemo(stage.id, m)}
                      />
                      <button
                        onClick={() => handleSave(stage.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-xs font-medium hover:bg-[#162d4a] transition-colors"
                      >
                        <Save size={12} />
                        {s.save}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Version history panel */}
                {isHistoryOpen && noteVersions.length > 0 && (
                  <div className="border-t border-purple-100 bg-purple-50/40 p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider flex items-center gap-1">
                      <Clock size={9} /> {s.editHistory} ({noteVersions.length})
                    </p>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {noteVersions.map(v => (
                        <div key={v.id} className="bg-white border border-purple-100 rounded-lg p-2 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-gray-500">{v.savedByName} · {format(new Date(v.savedAt), 'MMM d, HH:mm')}</span>
                            <button
                              onClick={() => handleRestoreVersion(stage.id, v.noteText)}
                              className="flex items-center gap-1 text-purple-600 hover:text-purple-800 font-medium text-[10px]"
                            >
                              <RotateCcw size={9} /> {s.restore}
                            </button>
                          </div>
                          <p className="text-gray-600 leading-snug line-clamp-3">{v.noteText || <em className="text-gray-400">{s.emptyNoteLabel}</em>}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contractor notes linked to this stage's assignments */}
                {(() => {
                  const aptAssignmentIds = contractorAssignments
                    .filter(a => a.apartmentId === apartmentId)
                    .map(a => a.id);
                  const cNotes = contractorNotes.filter(
                    n => aptAssignmentIds.includes(n.assignmentId) && n.authorType === 'contractor',
                  ).filter(n => {
                    const asgn = contractorAssignments.find(a => a.id === n.assignmentId);
                    return asgn?.stageId === stage.id || (!asgn?.stageId && stage.id === sortedStages[0]?.id);
                  });
                  if (!cNotes.length) return null;
                  return (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <MessageSquare size={9} /> {s.contractorNotesSection}
                      </p>
                      <div className="space-y-1.5">
                        {cNotes.map(n => (
                          <div key={n.id} className="px-2.5 py-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="font-medium text-gray-700">{n.authorName}</span>
                              <span className="text-gray-400 ml-auto">{format(new Date(n.createdAt), 'MMM d, HH:mm')}</span>
                            </div>
                            <p className="text-gray-600 leading-snug">{n.text}</p>
                            {n.attachmentFilename && (
                              <div className="mt-1">
                                {n.attachmentMimeType?.startsWith('image/') ? (
                                  n.attachmentDriveFileId ? (
                                    <a href={n.attachmentDriveUrl ?? '#'} target="_blank" rel="noopener noreferrer">
                                      <img
                                        src={driveThumbUrl(n.attachmentDriveFileId, 400)}
                                        alt={n.attachmentFilename}
                                        className="max-h-24 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-90"
                                      />
                                    </a>
                                  ) : n.attachmentDataUrl ? (
                                    <img
                                      src={n.attachmentDataUrl}
                                      alt={n.attachmentFilename}
                                      className="max-h-24 rounded-lg object-cover border border-gray-200"
                                    />
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-blue-500 text-[10px]">
                                      <Paperclip size={9} />{n.attachmentFilename}
                                    </span>
                                  )
                                ) : (
                                  <a
                                    href={n.attachmentDriveUrl ?? '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-500 text-[10px] hover:underline"
                                  >
                                    <Paperclip size={9} />{n.attachmentFilename}
                                    <ExternalLink size={8} />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Tasks and photos for this stage */}
                {(() => {
                  const stageTasks = contractorAssignments.filter(
                    a => a.apartmentId === apartmentId && a.stageId === stage.id
                  );
                  if (!stageTasks.length) return null;
                  return (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Paperclip size={9} /> {s.tasksHeading} ({stageTasks.length})
                      </p>
                      <div className="space-y-2">
                        {stageTasks.map(task => {
                          const contractor = contractors.find(c => c.id === task.contractorId);
                          const photos = contractorPhotos.filter(p => p.assignmentId === task.id);
                          return (
                            <div key={task.id} className="bg-gray-50 rounded-lg p-2 space-y-1.5 border border-gray-100">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${task.completedAt ? 'bg-green-100 text-green-700' : 'bg-orange-50 text-orange-600'}`}>
                                  {task.completedAt ? '✓' : '⏳'}
                                </span>
                                {contractor && (
                                  <span className="text-[10px] text-gray-500 font-medium">{contractor.name}</span>
                                )}
                                {task.dueDate && (
                                  <span className="text-[10px] text-gray-400 ml-auto">{format(new Date(task.dueDate), 'MMM d')}</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-700 leading-snug">{task.taskDescription}</p>
                              {task.attachments && task.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {task.attachments.map(att => (
                                    <div key={att.id}>
                                      {att.mimeType?.startsWith('image/') ? (
                                        att.driveFileId ? (
                                          <a href={att.driveUrl ?? '#'} target="_blank" rel="noopener noreferrer">
                                            <img src={driveThumbUrl(att.driveFileId, 200)} alt={att.filename} className="h-12 w-12 rounded-lg object-cover border border-gray-200 hover:opacity-90" />
                                          </a>
                                        ) : att.dataUrl ? (
                                          <img src={att.dataUrl} alt={att.filename} className="h-12 w-12 rounded-lg object-cover border border-gray-200" />
                                        ) : null
                                      ) : (
                                        <a href={att.driveUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-[10px] text-gray-600 hover:bg-gray-200">
                                          <Paperclip size={9} />{att.filename}
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {photos.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {photos.map(photo => {
                                    const src = photo.storageUrl || (photo.driveFileId ? driveThumbUrl(photo.driveFileId, 200) : photo.dataUrl);
                                    if (!src) return null;
                                    return (
                                      <a key={photo.id} href={photo.storageUrl || photo.driveUrl || photo.dataUrl} target="_blank" rel="noopener noreferrer">
                                        <img src={src} alt="" className="h-12 w-12 rounded-lg object-cover border border-gray-200 hover:opacity-90" />
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}

      {/* All contractor notes for this apartment */}
      {allContractorNotes.length > 0 && (
        <div className="mt-3 border border-blue-100 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-blue-50 flex items-center gap-2">
            <MessageSquare size={13} className="text-blue-500" />
            <span className="text-xs font-semibold text-blue-700">{s.allContractorNotes} ({allContractorNotes.length})</span>
          </div>
          <div className="p-3 space-y-2 bg-white">
            {allContractorNotes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(n => {
              const asgn = contractorAssignments.find(a => a.id === n.assignmentId);
              const contractor = asgn ? contractors.find(c => c.id === asgn.contractorId) : null;
              return (
                <div key={n.id} className="px-2.5 py-2 rounded-lg bg-gray-50 border border-gray-100 text-xs">
                  <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                    <span className="font-medium text-gray-700">{n.authorName}</span>
                    {contractor && contractor.name !== n.authorName && (
                      <span className="text-gray-400 text-[10px]">({contractor.name})</span>
                    )}
                    {asgn?.stageId && (
                      <span className="text-[10px] px-1 bg-gray-200 text-gray-500 rounded">
                        {stages.find(st => st.id === asgn.stageId)?.name ?? s.unknownStage}
                      </span>
                    )}
                    <span className="text-gray-400 ml-auto">{format(new Date(n.createdAt), 'MMM d, HH:mm')}</span>
                  </div>
                  <p className="text-gray-600 leading-snug">{n.text}</p>
                  {n.attachmentFilename && (
                    <div className="mt-1">
                      {n.attachmentMimeType?.startsWith('image/') ? (
                        n.attachmentDriveFileId ? (
                          <a href={n.attachmentDriveUrl ?? '#'} target="_blank" rel="noopener noreferrer">
                            <img
                              src={driveThumbUrl(n.attachmentDriveFileId, 400)}
                              alt={n.attachmentFilename}
                              className="max-h-24 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-90"
                            />
                          </a>
                        ) : n.attachmentDataUrl ? (
                          <img
                            src={n.attachmentDataUrl}
                            alt={n.attachmentFilename}
                            className="max-h-24 rounded-lg object-cover border border-gray-200"
                          />
                        ) : (
                          <span className="inline-flex items-center gap-1 text-blue-500 text-[10px]">
                            <Paperclip size={9} />{n.attachmentFilename}
                          </span>
                        )
                      ) : (
                        <a
                          href={n.attachmentDriveUrl ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-500 text-[10px] hover:underline"
                        >
                          <Paperclip size={9} />{n.attachmentFilename}
                          <ExternalLink size={8} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
