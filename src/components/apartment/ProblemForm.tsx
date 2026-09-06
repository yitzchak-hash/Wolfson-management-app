import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, Camera, Loader2 } from 'lucide-react';
import { useStore } from '../../data/store';
import { Apartment, User, aptLabel, ContractorAssignment, ContractorNote } from '../../types';
import { MessageBox, memoFile } from '../ui/MessageBox';
import { TaskThread } from '../tasks/TaskThread';
import { transcribeMemo } from '../../data/transcribe';
import { defaultDeadline, newProblemInfo } from '../../data/problems';
import {
  isUploadBackendConfigured, extractFolderId, findOrCreateFolderViaBackend,
  uploadFileViaResumableSession, shareFileToDrive, ensureDriveShared,
} from '../../data/driveApi';

/**
 * REPORT A PROBLEM — the form under the stage picker's red button (owner,
 * 2026-09-06), and the same form for many apartments at once from the
 * diagram's bulk bar.
 *
 * What it writes: ONE TASK per apartment wearing `problem` — worker,
 * deadline (three working days by default), the description; the notes
 * and pictures become the first messages of that task's thread, so the
 * office and the worker talk in one place from the start. The apartment's
 * stage is never touched: `stageBefore` remembers where it stood.
 *
 * "What is wrong" IS that thread, drawn before it exists (owner,
 * 2026-09-06: "the problem needs to look more WhatsAppy, just like the task
 * messages"): every sent line, memo and picture is a bubble in the same
 * grey panel the worker will see, with the same composer under it. The
 * first line is the task's description; every later bubble is saved as an
 * office message in the order it was written.
 *
 * Bulk: "same for all" is the default, and any line can say something
 * different ("46: also the bathroom") — one line per picked apartment.
 *
 * Renders through a PORTAL at z-[130]/[140] — the drawer panel is z-[120],
 * and anything the drawer opens must sit above it (the documented rule).
 */
interface PendingAtt { dataUrl: string; filename: string; mimeType: string; driveFileId?: string; driveUrl?: string; transcript?: string }
/** One bubble of the not-yet-saved thread — a line of text, or one attachment. */
interface Bubble { id: string; at: string; text: string; att?: PendingAtt }

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target?.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function ProblemForm({ apartments, currentUser, onClose, onSaved }: {
  apartments: Apartment[];
  currentUser: User;
  onClose: () => void;
  onSaved?: (count: number) => void;
}) {
  const ui = useStore(st => st.mainUiStrings);
  const contractors = useStore(st => st.contractors);
  const addContractorAssignment = useStore(st => st.addContractorAssignment);
  const addContractorNote = useStore(st => st.addContractorNote);
  const addActivityLog = useStore(st => st.addActivityLog);
  const lang = ui.isRtl ? 'he' : 'en';

  const [contractorId, setContractorId] = useState('');
  const [deadline, setDeadline] = useState(() => defaultDeadline(new Date()));
  const [text, setText] = useState('');
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [photosRequired, setPhotosRequired] = useState(true);
  const [perApt, setPerApt] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const many = apartments.length > 1;

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  /** Files go to the FIRST apartment's Drive folder (Photos/Contractor Notes) when it has one; else data URLs. */
  async function attach(file: File, transcript?: boolean) {
    const link = apartments[0]?.driveLink;
    const mainFolderId = link ? extractFolderId(link) : null;
    const isImg = file.type.startsWith('image/');
    let att: PendingAtt | null = null;
    if (isUploadBackendConfigured() && mainFolderId && !many) {
      try {
        const photosFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Photos');
        ensureDriveShared(photosFolderId);
        const notesFolderId = await findOrCreateFolderViaBackend(photosFolderId, 'Contractor Notes');
        const { fileId, webViewLink } = await uploadFileViaResumableSession(notesFolderId, file);
        await shareFileToDrive(fileId);
        att = { dataUrl: isImg ? await fileToDataUrl(file) : '', filename: file.name, mimeType: file.type, driveFileId: fileId, driveUrl: webViewLink };
      } catch { /* fall through to local */ }
    }
    if (!att) att = { dataUrl: await fileToDataUrl(file), filename: file.name, mimeType: file.type };
    const done = att;
    const id = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setBubbles(prev => [...prev, { id, at: new Date().toISOString(), text: '', att: done }]);
    if (transcript) {
      void transcribeMemo(done.driveUrl || done.dataUrl).then(t => {
        if (!t) return;
        setBubbles(prev => prev.map(b => b.id === id && b.att ? { ...b, att: { ...b.att, transcript: t } } : b));
      });
    }
  }

  /** The composer's Send — a typed line becomes a bubble. */
  function sendLine() {
    const line = text.trim();
    if (!line) return;
    setBubbles(prev => [...prev, { id: `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), text: line }]);
    setText('');
  }

  // What the task will SAY: the first line sent, else the line still in the
  // box, else the first memo's words. Everything after it is a message.
  const firstText = bubbles.find(b => b.text.trim());
  const headline = (firstText?.text ?? '').trim() || text.trim() || bubbles.find(b => b.att?.transcript)?.att?.transcript || '';
  const canSave = !!contractorId && !!deadline && (headline.length > 0 || bubbles.length > 0) && !busy;

  // The thread as the worker will see it — the same drawing, on synthetic
  // records that do not exist yet. Ids are the bubbles' own.
  const draftAssignment = { id: 'draft', completedAt: null } as unknown as ContractorAssignment;
  const draftNotes: ContractorNote[] = bubbles.map(b => ({
    id: b.id, assignmentId: 'draft', apartmentId: apartments[0]?.id ?? '', contractorId,
    text: b.text, authorType: 'office', authorId: currentUser.id, authorName: currentUser.name, createdAt: b.at,
    attachmentDataUrl: b.att ? (b.att.driveFileId ? '' : b.att.dataUrl) : undefined,
    attachmentFilename: b.att?.filename, attachmentMimeType: b.att?.mimeType,
    attachmentDriveFileId: b.att?.driveFileId, attachmentDriveUrl: b.att?.driveUrl,
    transcript: b.att?.transcript,
  }));

  function save() {
    if (!canSave) return;
    setBusy(true);
    // A line still sitting in the box is sent with the rest.
    const all: Bubble[] = text.trim() ? [...bubbles, { id: 'draft-line', at: new Date().toISOString(), text: text.trim() }] : bubbles;
    const head = all.find(b => b.text.trim());
    const headLine = (head?.text ?? '').trim() || all.find(b => b.att?.transcript)?.att?.transcript || ui.problemLabel;
    for (const apt of apartments) {
      const line = (many ? (perApt[apt.id] ?? '').trim() : '') || headLine;
      const id = `PR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      addContractorAssignment({
        id,
        contractorId,
        apartmentId: apt.id,
        buildingId: apt.buildingId,
        taskDescription: line,
        dueDate: deadline,
        stageId: apt.currentStageId ?? null,
        priority: 'urgent',
        completedAt: null,
        createdBy: currentUser.id,
        createdByName: currentUser.name,
        problem: newProblemInfo(apt, photosRequired),
      } as never);
      // Every bubble but the headline is the FIRST run of messages in the
      // problem's thread, in the order it was written.
      const base = {
        assignmentId: id, apartmentId: apt.id, contractorId,
        authorType: 'office' as const, authorId: currentUser.id, authorName: currentUser.name,
      };
      all.forEach(b => {
        if (b === head) return;
        if (b.att) {
          const att = b.att;
          addContractorNote({
            ...base,
            text: att.mimeType.startsWith('audio/') || att.mimeType.startsWith('image/') ? '' : att.filename,
            attachmentDataUrl: att.driveFileId ? '' : att.dataUrl,
            attachmentFilename: att.filename,
            attachmentMimeType: att.mimeType,
            attachmentDriveFileId: att.driveFileId,
            attachmentDriveUrl: att.driveUrl,
            transcript: att.transcript,
          });
        } else if (b.text.trim()) {
          addContractorNote({ ...base, text: b.text.trim() });
        }
      });
      addActivityLog({
        apartmentId: apt.id,
        apartmentNumber: apt.apartmentNumber,
        buildingId: apt.buildingId,
        userId: currentUser.id,
        userName: currentUser.name,
        actionType: 'contractor_assigned',
        fieldChanged: 'problem',
        previousValue: '',
        newValue: line.slice(0, 80),
        stageId: apt.currentStageId ?? '',
      } as never);
    }
    onSaved?.(apartments.length);
    onClose();
  }

  const box = 'w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 bg-white';
  const label = 'block text-[10.5px] font-extrabold uppercase tracking-wider text-gray-500 mb-1';

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 z-[130]" onClick={onClose} />
      <div
        data-problem-form
        dir={ui.isRtl ? 'rtl' : 'ltr'}
        className="fixed z-[140] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(560px, 94vw)', maxHeight: 'min(760px, 92dvh)' }}
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 text-white flex-shrink-0" style={{ backgroundColor: '#dc2626' }}>
          <AlertTriangle size={18} />
          <span className="font-extrabold text-[15px] truncate">
            {ui.problemLabel} — {many ? `${apartments.length} ${ui.bulkUnits}` : aptLabel(apartments[0])}
          </span>
          <button onClick={onClose} className="ms-auto p-1 rounded-lg hover:bg-white/15"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>{ui.problemWho}</label>
              <select data-problem-who value={contractorId} onChange={e => setContractorId(e.target.value)} className={box}>
                <option value="">{ui.selectContractor}</option>
                {contractors.filter(c => c.active).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>{ui.problemDeadline}</label>
              <input data-problem-deadline type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={box} />
            </div>
          </div>

          <div>
            <label className={label}>{ui.problemWhatWrong}</label>
            {/* The thread the worker will see, with its composer — every sent
                line, memo and picture is a bubble here before it is saved. */}
            <div data-problem-thread>
              <TaskThread
                assignment={draftAssignment}
                notes={draftNotes}
                photos={[]}
                viewer="office"
                words={{
                  rtl: !!ui.isRtl,
                  tapToOpen: ui.threadTapToOpen,
                  jobClosed: ui.threadJobClosed,
                  download: ui.downloadLabel,
                  said: ui.isRtl ? 'נאמר' : 'Said',
                }}
                translateTo={lang}
                maxBubble={420}
                footer={
                  <MessageBox
                    hook="problem-box"
                    value={text}
                    onChange={setText}
                    onSend={sendLine}
                    lang={lang}
                    onAttach={files => { files.forEach(f => void attach(f)); }}
                    onMemo={memo => attach(memoFile(memo), true)}
                    placeholder={ui.problemWhatWrong}
                  />
                }
              />
            </div>
            <label data-problem-pictures className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-600 hover:border-red-300 hover:text-red-600 cursor-pointer">
              <Camera size={14} /> {ui.problemPictures}
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ''; files.forEach(f => void attach(f)); }} />
            </label>
          </div>

          {many && (
            <div data-problem-lines>
              <label className={label}>{ui.problemPerApartment}</label>
              <div className="space-y-1.5">
                {apartments.map(apt => (
                  <div key={apt.id} className="flex items-center gap-2">
                    <span className="w-24 flex-shrink-0 text-xs font-bold text-gray-700 truncate">{aptLabel(apt)}</span>
                    <input
                      data-problem-line={apt.id}
                      value={perApt[apt.id] ?? ''}
                      onChange={e => setPerApt(p => ({ ...p, [apt.id]: e.target.value }))}
                      placeholder={headline ? `${ui.problemSameForAll}: ${headline.slice(0, 50)}` : ui.problemSameForAll}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border p-3" style={{ borderColor: '#fde68a', backgroundColor: '#fffbeb' }}>
            <div className="text-[12.5px] font-bold text-amber-800 mb-2">{ui.problemPhotosAsk}</div>
            <div className="flex gap-2">
              <button data-problem-photos="yes" onClick={() => setPhotosRequired(true)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${photosRequired ? 'bg-[#1e3a5f] text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {ui.problemPhotosYes}
              </button>
              <button data-problem-photos="no" onClick={() => setPhotosRequired(false)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${!photosRequired ? 'bg-[#1e3a5f] text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {ui.problemPhotosNo}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">{ui.cancel}</button>
          <button data-problem-save onClick={save} disabled={!canSave}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 flex items-center gap-1.5"
            style={{ backgroundColor: '#dc2626' }}>
            {busy && <Loader2 size={13} className="animate-spin" />}
            {ui.problemSave}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
