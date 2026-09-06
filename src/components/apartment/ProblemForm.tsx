import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X, Paperclip, Camera, Loader2 } from 'lucide-react';
import { useStore } from '../../data/store';
import { Apartment, User, aptLabel } from '../../types';
import { MessageBox, memoFile } from '../ui/MessageBox';
import { VoiceMemoPlayer } from '../ui/VoiceMemo';
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
 * Bulk: "same for all" is the default, and any line can say something
 * different ("46: also the bathroom") — one line per picked apartment.
 *
 * Renders through a PORTAL at z-[130]/[140] — the drawer panel is z-[120],
 * and anything the drawer opens must sit above it (the documented rule).
 */
interface PendingAtt { dataUrl: string; filename: string; mimeType: string; driveFileId?: string; driveUrl?: string; transcript?: string }

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
  const [atts, setAtts] = useState<PendingAtt[]>([]);
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
    setAtts(prev => [...prev, done]);
    if (transcript) {
      void transcribeMemo(done.driveUrl || done.dataUrl).then(t => {
        if (!t) return;
        setAtts(prev => prev.map(x => x === done ? { ...x, transcript: t } : x));
        setText(cur => cur.trim() ? cur : t);
      });
    }
  }

  const canSave = !!contractorId && !!deadline && (text.trim().length > 0 || atts.length > 0) && !busy;

  function save() {
    if (!canSave) return;
    setBusy(true);
    const now = new Date().toISOString();
    for (const apt of apartments) {
      const line = (many ? (perApt[apt.id] ?? '').trim() : '') || text.trim() || atts.find(a => a.transcript)?.transcript || ui.problemLabel;
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
      // The notes and pictures are the FIRST messages of the problem's thread.
      const base = {
        assignmentId: id, apartmentId: apt.id, contractorId,
        authorType: 'office' as const, authorId: currentUser.id, authorName: currentUser.name,
      };
      atts.forEach(att => addContractorNote({
        ...base,
        text: att.mimeType.startsWith('audio/') || att.mimeType.startsWith('image/') ? '' : att.filename,
        attachmentDataUrl: att.driveFileId ? '' : att.dataUrl,
        attachmentFilename: att.filename,
        attachmentMimeType: att.mimeType,
        attachmentDriveFileId: att.driveFileId,
        attachmentDriveUrl: att.driveUrl,
        transcript: att.transcript,
      }));
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
      void now;
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
            <MessageBox
              hook="problem-box"
              rows={3}
              value={text}
              onChange={setText}
              lang={lang}
              onAttach={files => { files.forEach(f => void attach(f)); }}
              onMemo={memo => attach(memoFile(memo), true)}
              placeholder={ui.problemWhatWrong}
            >
              {atts.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2" data-problem-atts>
                  {atts.map((att, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      {att.mimeType.startsWith('audio/')
                        ? <VoiceMemoPlayer src={att.driveUrl || att.dataUrl} className="max-w-[260px]" transcript={att.transcript} lang={lang} saidLabel={ui.isRtl ? 'נאמר' : 'Said'} />
                        : att.mimeType.startsWith('image/') && att.dataUrl
                          ? <img src={att.dataUrl} alt={att.filename} className="h-16 w-16 rounded-lg border border-gray-200 object-cover" />
                          : <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700"><Paperclip size={11} />{att.filename}</span>}
                      <button onClick={() => setAtts(prev => prev.filter((_, i) => i !== idx))}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </MessageBox>
          </div>

          <div>
            <label className={label}>{ui.problemPictures}</label>
            <label data-problem-pictures className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:border-red-300 hover:text-red-600 cursor-pointer">
              <Camera size={15} /> +
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
                      placeholder={text.trim() ? `${ui.problemSameForAll}: ${text.trim().slice(0, 50)}` : ui.problemSameForAll}
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
