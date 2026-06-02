import React, { useState, useRef } from 'react';
import { ChevronDown, ChevronUp, Save, Calendar, User, MessageSquare, Paperclip, X, ExternalLink } from 'lucide-react';
import { Stage, User as UserType } from '../../types';
import { useStore } from '../../data/store';
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
  filename: string;
  mimeType: string;
  dataUrl: string;
  driveFileId?: string;
  driveUrl?: string;
}

export function StageNotesSection({ apartmentId, stages, currentUser, onSaved }: StageNotesSectionProps) {
  const {
    upsertStageNote, getStageNote,
    apartments, contractors, contractorAssignments, contractorNotes,
    addContractorAssignment, updateContractorAssignment, deleteContractorAssignment,
  } = useStore();

  const [openStage, setOpenStage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingAttachments, setPendingAttachments] = useState<Record<string, PendingAttachment>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileInputTarget, setFileInputTarget] = useState<string | null>(null);

  const apt = apartments.find(a => a.id === apartmentId);
  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);
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

  async function handleFileChosen(stageId: string, file: File) {
    const processed = await compressImage(file);

    // Try Drive upload first
    if (isUploadBackendConfigured() && apt?.driveLink) {
      try {
        const mainFolderId = extractFolderId(apt.driveLink);
        if (mainFolderId) {
          setUploadProgress(p => ({ ...p, [stageId]: 1 }));
          const photosFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Photos');
          const notesFolderId = await findOrCreateFolderViaBackend(photosFolderId, 'Stage Notes');
          const { fileId, webViewLink } = await uploadFileViaResumableSession(
            notesFolderId, processed,
            pct => setUploadProgress(p => ({ ...p, [stageId]: pct })),
          );
          await shareFileToDrive(fileId);
          setUploadProgress(p => { const n = { ...p }; delete n[stageId]; return n; });
          setPendingAttachments(pa => ({
            ...pa,
            [stageId]: { filename: processed.name, mimeType: processed.type, dataUrl: '', driveFileId: fileId, driveUrl: webViewLink },
          }));
          return;
        }
      } catch (e) {
        console.warn('Drive upload failed for stage note, falling back to base64:', e);
        setUploadProgress(p => { const n = { ...p }; delete n[stageId]; return n; });
      }
    }

    // Fall back to base64
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result as string ?? '';
      setPendingAttachments(pa => ({
        ...pa,
        [stageId]: { filename: processed.name, mimeType: processed.type, dataUrl },
      }));
    };
    reader.readAsDataURL(processed);
  }

  function handleSave(stageId: string) {
    const text = drafts[stageId] ?? (getStageNote(apartmentId, stageId)?.noteText ?? '');
    const pending = pendingAttachments[stageId];
    upsertStageNote(apartmentId, stageId, text, currentUser, pending ?? undefined);
    setPendingAttachments(pa => { const n = { ...pa }; delete n[stageId]; return n; });
    onSaved();
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
        taskDescription: `${stages.find(s => s.id === stageId)?.name ?? 'Stage'} work`,
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
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && fileInputTarget) handleFileChosen(fileInputTarget, file);
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
        const pending = pendingAttachments[stage.id];
        const progress = uploadProgress[stage.id];
        const hasAttachment = note?.attachmentFilename;

        return (
          <div key={stage.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setOpenStage(isOpen ? null : stage.id)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-medium text-gray-800">{stage.name}</span>
                {hasNote && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Note</span>
                )}
                {hasAttachment && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <Paperclip size={9} />File
                  </span>
                )}
                {stageDate && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Calendar size={9} />
                    {format(new Date(stageDate), 'MMM d, yyyy')}
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
                {/* Stage date display */}
                {stageDate && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    <Calendar size={12} className="text-[#4aa8d8]" />
                    Stage reached: <strong>{format(new Date(stageDate), 'MMMM d, yyyy · HH:mm')}</strong>
                  </div>
                )}

                {/* Contractor assignment */}
                {activeContractors.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1.5">
                      <User size={11} />
                      Assign Contractor
                    </label>
                    <select
                      value={assignment?.contractorId ?? ''}
                      onChange={e => handleContractorChange(stage.id, e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    >
                      <option value="">— None —</option>
                      {['drywall', 'ac', 'general'].map(cat => {
                        const catContractors = activeContractors.filter(c => c.category === cat);
                        if (!catContractors.length) return null;
                        const labels: Record<string, string> = { drywall: 'Drywall', ac: 'AC', general: 'General' };
                        return (
                          <optgroup key={cat} label={labels[cat]}>
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
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Office Notes</p>
                  <textarea
                    value={getDraft(stage.id)}
                    onChange={e => setDrafts(d => ({ ...d, [stage.id]: e.target.value }))}
                    placeholder={`Office notes for ${stage.name}...`}
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  />

                  {/* Saved attachment preview */}
                  {!pending && note?.attachmentFilename && (
                    <div className="mt-1.5">
                      {note.attachmentMimeType?.startsWith('image/') ? (
                        <div className="relative inline-block">
                          {note.attachmentDriveFileId ? (
                            <a href={note.attachmentDriveUrl ?? '#'} target="_blank" rel="noopener noreferrer">
                              <img
                                src={driveThumbUrl(note.attachmentDriveFileId, 400)}
                                alt={note.attachmentFilename}
                                className="max-h-28 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-90"
                              />
                            </a>
                          ) : note.attachmentDataUrl ? (
                            <img
                              src={note.attachmentDataUrl}
                              alt={note.attachmentFilename}
                              className="max-h-28 rounded-lg object-cover border border-gray-200"
                            />
                          ) : null}
                        </div>
                      ) : (
                        <a
                          href={note.attachmentDriveUrl ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                          <Paperclip size={10} />
                          <span className="truncate max-w-[160px]">{note.attachmentFilename}</span>
                          <ExternalLink size={9} className="text-gray-400 flex-shrink-0" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Pending attachment preview */}
                  {pending && (
                    <div className="mt-1.5">
                      {pending.mimeType.startsWith('image/') && (pending.dataUrl || pending.driveFileId) ? (
                        <div className="relative inline-block">
                          <img
                            src={pending.driveFileId ? driveThumbUrl(pending.driveFileId, 400) : pending.dataUrl}
                            alt={pending.filename}
                            className="max-h-28 rounded-lg object-cover border border-blue-200"
                          />
                          <button
                            onClick={() => setPendingAttachments(pa => { const n = { ...pa }; delete n[stage.id]; return n; })}
                            className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
                          <Paperclip size={11} />
                          <span className="flex-1 truncate">{pending.filename}</span>
                          <button
                            onClick={() => setPendingAttachments(pa => { const n = { ...pa }; delete n[stage.id]; return n; })}
                            className="text-blue-400 hover:text-blue-600"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Upload progress bar */}
                  {progress !== undefined && (
                    <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 transition-all duration-300 rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-1">
                    {note ? (
                      <span className="text-xs text-gray-400">
                        {note.updatedByName} · {format(new Date(note.updatedAt), 'MMM d, yyyy HH:mm')}
                      </span>
                    ) : <span />}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setFileInputTarget(stage.id);
                          fileInputRef.current?.click();
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-50 transition-colors"
                        title="Attach file"
                      >
                        <Paperclip size={12} />
                      </button>
                      <button
                        onClick={() => handleSave(stage.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-xs font-medium hover:bg-[#162d4a] transition-colors"
                      >
                        <Save size={12} />
                        Save
                      </button>
                    </div>
                  </div>
                </div>

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
                        <MessageSquare size={9} /> Contractor Notes
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
            <span className="text-xs font-semibold text-blue-700">All Contractor Notes ({allContractorNotes.length})</span>
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
                        {stages.find(s => s.id === asgn.stageId)?.name ?? 'Unknown stage'}
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
