import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Clock, User, Paperclip, ExternalLink, X } from 'lucide-react';
import { Stage, User as UserType, StageNoteAttachment, StageNoteEntry, getStageName } from '../../types';
import { useStore } from '../../data/store';
import { VoiceMemoPlayer } from '../ui/VoiceMemo';
import { MessageBox, memoFile } from '../ui/MessageBox';
import { Translated } from '../ui/Translated';
import { transcribeMemo } from '../../data/transcribe';
import { stageStateOf } from '../../data/stageMarks';
import { format } from 'date-fns';
import {
  isUploadBackendConfigured, extractFolderId,
  findOrCreateFolderViaBackend, uploadFileViaResumableSession,
  shareFileToDrive, driveThumbUrl,
} from '../../data/driveApi';

/**
 * THE NOTES TAB — the stage list itself, read like notes (owner, 2026-09-06).
 *
 *  - stages the job is PAST are crossed off and folded, with a count on the
 *    right (tap to unfold);
 *  - the CURRENT stage is open; later stages sit grey and folded;
 *  - inside a stage every note ever written is a BULLET in order, its author
 *    and date small and grey at the end of the line — a memo is a bullet too,
 *    with its words under it, and a worker's message shows in the office's
 *    language with Show original;
 *  - "Add notes for <Stage>" and the message box sit at the BOTTOM; Send puts
 *    the note above as a new bullet and nothing stays in the field.
 *
 * Storage is unchanged: `stageNotes` records, with `entries` beside the
 * legacy text (a note from before today is its first bullet).
 */
interface StageNotesSectionProps {
  apartmentId: string;
  stages: Stage[];
  currentUser: UserType;
  onSaved: () => void;
}

interface PendingAttachment extends StageNoteAttachment { id: string }

type Bullet = {
  id: string;
  at: string;
  byName: string;
  text: string;
  /** A worker's words — translated for the office, Show original one tap away. */
  foreign?: boolean;
  attachments?: StageNoteAttachment[];
  transcriptFor?: (attId: string) => string | undefined;
  onTranscript?: (attId: string, text: string) => void;
};

export function StageNotesSection({ apartmentId, stages, currentUser, onSaved }: StageNotesSectionProps) {
  const {
    getStageNote, appendStageNoteEntry,
    apartments, contractors, contractorAssignments, contractorNotes, contractorPhotos,
    addContractorAssignment, updateContractorAssignment, deleteContractorAssignment, updateContractorNote,
  } = useStore();
  const s = useStore(state => state.mainUiStrings);
  const lang = s.isRtl ? 'he' : 'en';

  const apt = apartments.find(a => a.id === apartmentId);
  const sortedStages = [...stages].filter(st => st.active).sort((a, b) => a.order - b.order);
  const activeContractors = contractors.filter(c => c.active);

  /** Open/closed per stage: the rule (current open, done folded, later folded) until somebody toggles. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, PendingAttachment[]>>({});
  const [uploading, setUploading] = useState<Record<string, number>>({});

  const isCurrent = (stageId: string) => apt?.currentStageId === stageId;
  const defaultOpen = (stageId: string) => {
    if (!apt) return false;
    const state = stageStateOf(apt, stageId, sortedStages);
    if (state === 'pending') return true;
    if (isCurrent(stageId)) return true;
    // No current stage at all: the first stage is where the notes go.
    return !apt.currentStageId && sortedStages[0]?.id === stageId;
  };
  const isOpen = (stageId: string) => toggled[stageId] ?? defaultOpen(stageId);

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
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', 0.72);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /** A file or a memo waits on the box until Send — Drive first, base64 when there is no backend. */
  async function attach(stageId: string, file: File, transcript?: boolean) {
    const processed = await compressImage(file);
    const attId = Math.random().toString(36).slice(2, 11);
    let att: PendingAttachment | null = null;
    if (isUploadBackendConfigured() && apt?.driveLink) {
      try {
        const mainFolderId = extractFolderId(apt.driveLink);
        if (mainFolderId) {
          setUploading(p => ({ ...p, [attId]: 1 }));
          const photosFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Photos');
          const notesFolderId = await findOrCreateFolderViaBackend(photosFolderId, 'Stage Notes');
          const { fileId, webViewLink } = await uploadFileViaResumableSession(
            notesFolderId, processed, pct => setUploading(p => ({ ...p, [attId]: pct })));
          await shareFileToDrive(fileId);
          att = { id: attId, filename: processed.name, mimeType: processed.type, dataUrl: '', driveFileId: fileId, driveUrl: webViewLink };
        }
      } catch (e) {
        console.warn('Drive upload failed for stage note, falling back to base64:', e);
      } finally {
        setUploading(p => { const n = { ...p }; delete n[attId]; return n; });
      }
    }
    if (!att) {
      const dataUrl = await new Promise<string>(resolve => {
        const r = new FileReader();
        r.onload = e => resolve((e.target?.result as string) ?? '');
        r.readAsDataURL(processed);
      });
      att = { id: attId, filename: processed.name, mimeType: processed.type, dataUrl };
    }
    const done = att;
    setPending(pa => ({ ...pa, [stageId]: [...(pa[stageId] ?? []), done] }));
    if (transcript) {
      void transcribeMemo(done.driveUrl || done.dataUrl || '').then(t => {
        if (!t) return;
        setPending(pa => ({ ...pa, [stageId]: (pa[stageId] ?? []).map(x => x.id === attId ? { ...x, transcript: t } : x) }));
        setDrafts(d => (d[stageId] ?? '').trim() ? d : { ...d, [stageId]: t });
      });
    }
  }

  function send(stageId: string) {
    const text = (drafts[stageId] ?? '').trim();
    const atts = pending[stageId] ?? [];
    if (!text && atts.length === 0) return;
    appendStageNoteEntry(apartmentId, stageId, {
      text,
      attachments: atts.map(({ id, filename, mimeType, dataUrl, driveFileId, driveUrl, transcript }) =>
        ({ id, filename, mimeType, dataUrl, driveFileId, driveUrl, transcript })),
    }, currentUser);
    setDrafts(d => ({ ...d, [stageId]: '' }));
    setPending(pa => { const n = { ...pa }; delete n[stageId]; return n; });
    onSaved();
  }

  /** Who is on this stage — forgiving on READ (see the drawer's stage-worker rule). */
  function getAssignment(stageId: string) {
    const mine = contractorAssignments.filter(a => a.apartmentId === apartmentId);
    return mine.find(a => a.stageId === stageId && !a.completedAt)
      ?? mine.find(a => a.stageId === stageId)
      ?? (apt?.currentStageId === stageId ? mine.find(a => !a.stageId && !a.completedAt) : undefined);
  }
  /** Strict on WRITE: only a task genuinely on this stage is re-pointed. */
  function stagedAssignment(stageId: string) {
    return contractorAssignments.find(a => a.apartmentId === apartmentId && a.stageId === stageId);
  }
  function handleContractorChange(stageId: string, contractorId: string) {
    const existing = stagedAssignment(stageId);
    if (!contractorId) { if (existing) deleteContractorAssignment(existing.id); return; }
    if (!apt) return;
    if (existing) updateContractorAssignment(existing.id, { contractorId });
    else addContractorAssignment({
      contractorId, apartmentId, buildingId: apt.buildingId,
      taskDescription: `${stages.find(st => st.id === stageId)?.name ?? 'Stage'} work`,
      dueDate: null, stageId, completedAt: null, createdBy: currentUser.id, createdByName: currentUser.name,
    });
  }

  /** Every bullet on a stage: the office's entries and the workers' messages on its tasks, oldest first. */
  function bulletsOf(stageId: string): Bullet[] {
    const note = getStageNote(apartmentId, stageId);
    const entries: StageNoteEntry[] = note?.entries
      ?? (note && (note.noteText.trim() || note.attachments?.length || note.attachmentFilename)
        ? [{
            id: `${note.id}-0`, text: note.noteText, at: note.updatedAt, by: note.updatedBy, byName: note.updatedByName,
            attachments: note.attachments ?? (note.attachmentFilename
              ? [{ id: 'legacy', filename: note.attachmentFilename, mimeType: note.attachmentMimeType ?? '', dataUrl: note.attachmentDataUrl, driveFileId: note.attachmentDriveFileId, driveUrl: note.attachmentDriveUrl }]
              : undefined),
          }]
        : []);
    const office: Bullet[] = entries.map(e => ({ id: e.id, at: e.at, byName: e.byName, text: e.text, attachments: e.attachments }));
    const stageTaskIds = new Set(contractorAssignments
      .filter(a => a.apartmentId === apartmentId && (a.stageId === stageId || (!a.stageId && stageId === sortedStages[0]?.id)))
      .map(a => a.id));
    const workers: Bullet[] = contractorNotes
      .filter(n => stageTaskIds.has(n.assignmentId) && n.authorType === 'contractor')
      .map(n => ({
        id: n.id, at: n.createdAt, byName: n.authorName, text: n.text, foreign: true,
        attachments: n.attachmentFilename ? [{
          id: n.id, filename: n.attachmentFilename, mimeType: n.attachmentMimeType ?? '', dataUrl: n.attachmentDataUrl,
          driveFileId: n.attachmentDriveFileId, driveUrl: n.attachmentDriveUrl, transcript: n.transcript,
        }] : undefined,
        onTranscript: (_attId, t) => { if (!n.transcript) updateContractorNote(n.id, { transcript: t }); },
      }));
    return [...office, ...workers].sort((a, b) => a.at.localeCompare(b.at));
  }

  const attachmentView = (att: StageNoteAttachment, onTranscript?: (t: string) => void, sign?: { who: string; at: string }) => {
    if (att.mimeType?.startsWith('audio/')) {
      return <VoiceMemoPlayer src={att.driveUrl || att.dataUrl || ''} className="w-full"
        transcript={att.transcript} onTranscript={onTranscript} lang={lang} saidLabel={s.isRtl ? 'נאמר' : 'Said'}
        who={sign?.who} at={sign?.at} />;
    }
    if (att.mimeType?.startsWith('image/')) {
      const src = att.driveFileId ? driveThumbUrl(att.driveFileId, 300) : att.dataUrl;
      if (!src) return null;
      return (
        <a href={att.driveUrl ?? att.dataUrl ?? '#'} target="_blank" rel="noopener noreferrer">
          <img src={src} alt={att.filename} className="h-16 w-16 rounded-lg object-cover border border-gray-200 hover:opacity-90" />
        </a>
      );
    }
    return (
      <a href={att.driveUrl ?? att.dataUrl ?? '#'} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200">
        <Paperclip size={10} /><span className="truncate max-w-[160px]">{att.filename}</span><ExternalLink size={9} className="text-gray-400" />
      </a>
    );
  };

  return (
    <div className="space-y-1.5" data-notes-tab>
      {sortedStages.map(stage => {
        const state = apt ? stageStateOf(apt, stage.id, sortedStages) : 'open';
        const done = state === 'done';
        const pendingMark = state === 'pending';
        const cur = isCurrent(stage.id);
        const open = isOpen(stage.id);
        const bullets = bulletsOf(stage.id);
        const count = bullets.length;
        const assignment = getAssignment(stage.id);
        const assignedContractor = assignment ? contractors.find(c => c.id === assignment.contractorId) : null;
        const pendingList = pending[stage.id] ?? [];
        const stageName = getStageName(stage, s.isRtl);
        const countLabel = count ? `${count} ${count === 1 ? s.noteCount : s.notesCount}` : '';

        return (
          <div key={stage.id} data-notes-stage={stage.id} data-notes-state={done ? 'done' : cur ? 'current' : pendingMark ? 'pending' : 'later'}
            className="border rounded-xl overflow-hidden"
            style={{ borderColor: cur ? stage.color : '#e5e7eb', backgroundColor: cur ? '#fff' : done ? '#fafafa' : '#fff' }}>
            <button
              data-notes-toggle
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left rtl:text-right hover:bg-gray-50 transition-colors"
              onClick={() => setToggled(t => ({ ...t, [stage.id]: !open }))}
            >
              {/* The box: green check crossed off, orange clock half done, a plain dot otherwise. */}
              <span className="w-[18px] h-[18px] rounded flex items-center justify-center border flex-shrink-0"
                style={done ? { backgroundColor: '#16a34a', borderColor: '#16a34a' }
                  : pendingMark ? { backgroundColor: '#fff7ed', borderColor: '#f97316' }
                  : { backgroundColor: '#fff', borderColor: cur ? stage.color : '#d1d5db' }}>
                {done && <Check size={13} color="#fff" strokeWidth={3} />}
                {pendingMark && <Clock size={12} color="#f97316" className="pending-glow" />}
              </span>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
              <span className={`text-sm min-w-0 truncate ${cur ? 'font-extrabold text-gray-900' : done ? 'font-medium' : 'font-medium'}`}
                style={done ? { textDecoration: 'line-through', color: '#9ca3af' } : !cur && !pendingMark ? { color: '#6b7280' } : undefined}>
                {stageName}
              </span>
              {cur && <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex-shrink-0">{s.stageCurrent}</span>}
              {/* Who is on this stage — a small bubble beside CURRENT (owner, 2026-09-06),
                  never a full-width field crowding the notes. */}
              {activeContractors.length > 0 && (open || assignedContractor) && (
                <span className="relative flex-shrink-0 inline-flex items-center" onClick={e => e.stopPropagation()}>
                  <select
                    data-stage-worker
                    value={assignment?.contractorId ?? ''}
                    onChange={e => handleContractorChange(stage.id, e.target.value)}
                    className="appearance-none pl-5 pr-5 py-0.5 rounded-full text-[10.5px] font-semibold border cursor-pointer focus:outline-none"
                    style={assignedContractor
                      ? { backgroundColor: '#eef4fa', borderColor: '#cfe0f0', color: '#1e3a5f' }
                      : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#94a3b8' }}
                    title={s.assignContractor}
                  >
                    <option value="">{s.assignContractor}</option>
                    {['drywall', 'ac', 'general'].map(cat => {
                      const items = activeContractors.filter(c => c.category === cat);
                      if (!items.length) return null;
                      const catLabel = cat === 'ac' ? s.categoryAC : cat === 'drywall' ? s.categoryDrywall : s.categoryGeneral;
                      return (
                        <optgroup key={cat} label={catLabel}>
                          {items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                  <User size={9} className="absolute left-1.5 pointer-events-none" style={{ color: assignedContractor ? '#1e3a5f' : '#94a3b8' }} />
                  <ChevronDown size={9} className="absolute right-1.5 pointer-events-none" style={{ color: assignedContractor ? '#1e3a5f' : '#94a3b8' }} />
                </span>
              )}
              <span className="ms-auto text-[10.5px] text-gray-400 flex-shrink-0" data-notes-count>{countLabel}</span>
              {open ? <ChevronDown size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={15} className="text-gray-400 flex-shrink-0" />}
            </button>

            {open && (
              <div className="px-3 pb-3 space-y-3">
                {/* THE BULLETS — oldest first, sign-off small and grey at the end of each line. */}
                {bullets.length > 0 && (
                  <ul className="space-y-1.5" data-notes-bullets>
                    {bullets.map(b => (
                      <li key={b.id} data-notes-bullet className="flex items-start gap-2 text-[13px] leading-snug text-gray-800">
                        <span className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: stage.color }} />
                        <div className="min-w-0 flex-1">
                          {b.text && (
                            <span className="me-2">
                              {b.foreign ? <Translated text={b.text} to={lang} /> : b.text}
                            </span>
                          )}
                          {b.attachments?.length ? (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {b.attachments.map(att => (
                                <span key={att.id} className={att.mimeType?.startsWith('audio/') ? 'w-full max-w-[380px]' : undefined}>
                                  {attachmentView(att, b.onTranscript ? t => b.onTranscript!(att.id, t) : undefined,
                                    att.mimeType?.startsWith('audio/') ? { who: b.byName, at: format(new Date(b.at), 'd MMM · HH:mm') } : undefined)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {!b.attachments?.some(a => a.mimeType?.startsWith('audio/')) && (
                            <span data-notes-signoff className="text-[10px] text-gray-400 whitespace-nowrap">
                              {b.byName} · {format(new Date(b.at), 'd MMM')}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Tasks and photos on this stage — the record, folded small under the bullets. */}
                {(() => {
                  const stageTasks = contractorAssignments.filter(a => a.apartmentId === apartmentId && a.stageId === stage.id);
                  if (!stageTasks.length) return null;
                  return (
                    <div className="space-y-1">
                      {stageTasks.map(task => {
                        const contractor = contractors.find(c => c.id === task.contractorId);
                        const photos = contractorPhotos.filter(p => p.assignmentId === task.id);
                        return (
                          <div key={task.id} className="flex items-center gap-2 text-[11px] text-gray-500">
                            <span>{task.completedAt ? '✓' : '⏳'}</span>
                            <span className="truncate flex-1 min-w-0">{task.taskDescription}</span>
                            {contractor && <span className="text-gray-400 flex-shrink-0">{contractor.name}</span>}
                            {photos.slice(0, 4).map(photo => {
                              const src = photo.storageUrl || (photo.driveFileId ? driveThumbUrl(photo.driveFileId, 200) : photo.dataUrl);
                              return src ? (
                                <a key={photo.id} href={photo.storageUrl || photo.driveUrl || photo.dataUrl} target="_blank" rel="noopener noreferrer">
                                  <img src={src} alt="" className="h-7 w-7 rounded object-cover border border-gray-200" />
                                </a>
                              ) : null;
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* THE BOX at the bottom: "Add notes for <Stage>" — Send puts the note above. */}
                <div>
                  <MessageBox
                    hook="stage-note-box"
                    value={drafts[stage.id] ?? ''}
                    onChange={v => setDrafts(d => ({ ...d, [stage.id]: v }))}
                    onSend={() => send(stage.id)}
                    hasPending={pendingList.length > 0}
                    onAttach={files => { files.forEach(f => void attach(stage.id, f)); }}
                    onMemo={memo => attach(stage.id, memoFile(memo), true)}
                    busy={Object.keys(uploading).length > 0}
                    lang={lang}
                    placeholder={`${s.addNotesFor} ${stageName}…`}
                  >
                    {pendingList.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {pendingList.map(p => (
                          <div key={p.id} className="flex items-center gap-1">
                            {p.mimeType.startsWith('audio/')
                              ? <VoiceMemoPlayer src={p.driveUrl || p.dataUrl || ''} className="max-w-[260px]" transcript={p.transcript} lang={lang} saidLabel={s.isRtl ? 'נאמר' : 'Said'} />
                              : p.mimeType.startsWith('image/') && (p.dataUrl || p.driveFileId)
                                ? <img src={p.driveFileId ? driveThumbUrl(p.driveFileId, 300) : p.dataUrl} alt={p.filename} className="h-14 w-14 rounded-lg object-cover border border-blue-200" />
                                : <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700"><Paperclip size={11} />{p.filename}</span>}
                            <button onClick={() => setPending(pa => ({ ...pa, [stage.id]: (pa[stage.id] ?? []).filter(a => a.id !== p.id) }))}
                              className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500"><X size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </MessageBox>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
