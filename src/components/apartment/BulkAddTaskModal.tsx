import React, { useState, useRef, useMemo } from 'react';
import {
  X, Plus, Paperclip, Layers, HardDrive, Database, AlertTriangle,
  Loader, ChevronLeft, CheckCircle2, Circle, FileText, ZoomIn,
} from 'lucide-react';
import { Apartment, ContractorCategory, TaskAttachment } from '../../types';
import { useStore } from '../../data/store';
import {
  isUploadBackendConfigured, extractFolderId,
  findOrCreateFolderViaBackend, uploadFileViaResumableSession, shareFileToDrive,
} from '../../data/driveApi';

const CAT_LABELS: Record<ContractorCategory, string> = {
  drywall: 'Drywall', ac: 'AC', general: 'General',
};
const CAT_COLORS: Record<ContractorCategory, string> = {
  drywall: '#f59e0b', ac: '#3b82f6', general: '#10b981',
};

type ModalStage = 'form' | 'attachmentChoice' | 'missingDriveWarning' | 'selectTargetApt' | 'uploading';
type BuildingTab = 'all' | 'A1' | 'A2' | 'A3';

interface Props {
  onClose: () => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}

export function BulkAddTaskModal({ onClose, onToast }: Props) {
  const {
    apartments, stages, contractors,
    addContractorAssignment, updateApartment, currentUser,
  } = useStore();

  // ── Form ─────────────────────────────────────────────────────────────────
  const [contractorId, setContractorId] = useState('');
  const [task, setTask] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [stageId, setStageId] = useState('');
  const [selectedAptIds, setSelectedAptIds] = useState<Set<string>>(new Set());
  const [buildingTab, setBuildingTab] = useState<BuildingTab>('all');

  // ── Attachments ───────────────────────────────────────────────────────────
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [previewAtt, setPreviewAtt] = useState<TaskAttachment | null>(null);
  const attachRef = useRef<HTMLInputElement>(null);

  // ── Modal flow ────────────────────────────────────────────────────────────
  const [modalStage, setModalStage] = useState<ModalStage>('form');
  const [targetAptId, setTargetAptId] = useState('');
  const [missingDriveApts, setMissingDriveApts] = useState<Apartment[]>([]);
  const [uploadStatus, setUploadStatus] = useState({ current: 0, total: 0, label: '' });
  const [fileUploadPct, setFileUploadPct] = useState(0);

  // ── Derived ───────────────────────────────────────────────────────────────
  const sortedStages = useMemo(
    () => [...stages].filter(s => s.active).sort((a, b) => a.order - b.order),
    [stages],
  );

  const namedApts = useMemo(
    () => apartments.filter(a => !(a.isUnnamed && !a.displayName)),
    [apartments],
  );

  const visibleApts = useMemo(
    () => namedApts
      .filter(a => buildingTab === 'all' || a.buildingId === buildingTab)
      .sort((a, b) =>
        a.buildingId.localeCompare(b.buildingId) ||
        a.floor - b.floor ||
        Number(a.apartmentNumber) - Number(b.apartmentNumber),
      ),
    [namedApts, buildingTab],
  );

  const selectedApts = useMemo(
    () => namedApts.filter(a => selectedAptIds.has(a.id)),
    [namedApts, selectedAptIds],
  );

  const tabApts = useMemo(
    () => namedApts.filter(a => buildingTab === 'all' || a.buildingId === buildingTab),
    [namedApts, buildingTab],
  );

  const allTabSelected = tabApts.length > 0 && tabApts.every(a => selectedAptIds.has(a.id));

  function toggleApt(id: string) {
    setSelectedAptIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllInTab() {
    setSelectedAptIds(prev => {
      const next = new Set(prev);
      if (allTabSelected) {
        tabApts.forEach(a => next.delete(a.id));
      } else {
        tabApts.forEach(a => next.add(a.id));
      }
      return next;
    });
  }

  // ── Attachment file picker ────────────────────────────────────────────────
  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const id = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      await new Promise<void>(resolve => {
        const reader = new FileReader();
        reader.onload = ev => {
          setAttachments(prev => [...prev, {
            id, filename: file.name, mimeType: file.type,
            dataUrl: ev.target?.result as string ?? '',
          }]);
          setAttachmentFiles(prev => [...prev, file]);
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    if (attachRef.current) attachRef.current.value = '';
  }

  function removeAttachment(id: string) {
    const idx = attachments.findIndex(a => a.id === id);
    setAttachments(prev => prev.filter(a => a.id !== id));
    setAttachmentFiles(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  function handleSubmit() {
    if (!contractorId || !task.trim() || selectedAptIds.size === 0) return;
    if (attachments.length === 0 || !isUploadBackendConfigured()) {
      createAllWithAtts(selectedApts.map(() => attachments));
      return;
    }
    setModalStage('attachmentChoice');
  }

  function handleAttachmentChoice(choice: 'each' | 'one' | 'local') {
    if (choice === 'local') {
      createAllWithAtts(selectedApts.map(() => attachments));
      return;
    }
    if (choice === 'one') {
      setModalStage('selectTargetApt');
      return;
    }
    // choice === 'each' — check for missing drive links
    const missing = selectedApts.filter(a => !a.driveLink);
    if (missing.length > 0) {
      setMissingDriveApts(missing);
      setModalStage('missingDriveWarning');
    } else {
      startUploading('each');
    }
  }

  function startUploading(choice: 'each' | 'one') {
    setModalStage('uploading');
    runUploads(choice).catch(() => {
      onToast('Upload failed', 'error');
      onClose();
    });
  }

  async function runUploads(choice: 'each' | 'one') {
    const apts = selectedApts;

    if (choice === 'each') {
      const allAtts: TaskAttachment[][] = [];
      for (let i = 0; i < apts.length; i++) {
        const apt = apts[i];
        setUploadStatus({ current: i + 1, total: apts.length, label: `Apt ${apt.displayName || apt.apartmentNumber} (${apt.buildingId})` });
        let finalAtts = attachments;
        if (apt.driveLink) {
          try {
            const folderId = extractFolderId(apt.driveLink);
            if (folderId) {
              const photosId = await findOrCreateFolderViaBackend(folderId, 'Photos');
              const notesId = await findOrCreateFolderViaBackend(photosId, 'Task Notes');
              finalAtts = await uploadFilesToFolder(notesId);
            }
          } catch { /* keep base64 */ }
        }
        allAtts.push(finalAtts);
      }
      createAllWithAtts(allAtts);
    } else if (choice === 'one' && targetAptId) {
      const target = apts.find(a => a.id === targetAptId);
      let driveAtts = attachments;
      if (target?.driveLink) {
        setUploadStatus({ current: 1, total: 1, label: `Apt ${target.displayName || target.apartmentNumber}` });
        try {
          const folderId = extractFolderId(target.driveLink);
          if (folderId) {
            const photosId = await findOrCreateFolderViaBackend(folderId, 'Photos');
            const notesId = await findOrCreateFolderViaBackend(photosId, 'Task Notes');
            driveAtts = await uploadFilesToFolder(notesId);
          }
        } catch { /* keep base64 */ }
      }
      createAllWithAtts(apts.map(a => (a.id === targetAptId ? driveAtts : attachments)));
    }
  }

  async function uploadFilesToFolder(folderId: string): Promise<TaskAttachment[]> {
    const results: TaskAttachment[] = [];
    for (let i = 0; i < attachmentFiles.length; i++) {
      const file = attachmentFiles[i];
      const att = attachments[i];
      try {
        const { fileId, webViewLink } = await uploadFileViaResumableSession(
          folderId, file, pct => setFileUploadPct(pct),
        );
        await shareFileToDrive(fileId);
        results.push({ ...att, dataUrl: '', driveFileId: fileId, driveUrl: webViewLink });
      } catch {
        results.push(att);
      }
    }
    setFileUploadPct(0);
    return results;
  }

  function createAllWithAtts(attsList: TaskAttachment[][]) {
    const apts = selectedApts;
    apts.forEach((apt, i) => {
      const atts = attsList[i] ?? [];
      addContractorAssignment({
        contractorId,
        apartmentId: apt.id,
        buildingId: apt.buildingId,
        taskDescription: task.trim(),
        dueDate: dueDate || null,
        stageId: stageId || null,
        completedAt: null,
        createdBy: currentUser?.id ?? '',
        createdByName: currentUser?.name ?? 'Office',
        ...(atts.length ? { attachments: atts } : {}),
      });
      if (stageId && stageId !== apt.currentStageId && currentUser) {
        updateApartment(apt.id, { currentStageId: stageId }, currentUser);
      }
    });
    onToast(`${apts.length} task${apts.length !== 1 ? 's' : ''} created`);
    onClose();
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  const canSubmit = !!contractorId && task.trim().length > 0 && selectedAptIds.size > 0;
  const aptsByBuilding = useMemo(() => {
    const map = new Map<string, Apartment[]>();
    visibleApts.forEach(a => {
      if (!map.has(a.buildingId)) map.set(a.buildingId, []);
      map.get(a.buildingId)!.push(a);
    });
    return map;
  }, [visibleApts]);

  const eligibleForOne = selectedApts.filter(a => !!a.driveLink);

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden"
          style={{ maxHeight: '93vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              {modalStage !== 'form' && (
                <button
                  onClick={() => {
                    if (modalStage === 'missingDriveWarning' || modalStage === 'selectTargetApt') setModalStage('attachmentChoice');
                    else if (modalStage === 'attachmentChoice') setModalStage('form');
                  }}
                  className="p-1 rounded-lg hover:bg-gray-100 transition-colors mr-1"
                >
                  <ChevronLeft size={18} className="text-gray-500" />
                </button>
              )}
              <Layers size={18} className="text-[#1e3a5f]" />
              <h2 className="text-base font-bold text-gray-900">
                {modalStage === 'form' ? 'Create Bulk Task' :
                 modalStage === 'attachmentChoice' ? 'Where to put the attached files?' :
                 modalStage === 'missingDriveWarning' ? 'Missing Drive Links' :
                 modalStage === 'selectTargetApt' ? 'Select target apartment' :
                 'Creating tasks…'}
              </h2>
              {modalStage === 'form' && selectedAptIds.size > 0 && (
                <span className="ml-1 text-xs bg-[#1e3a5f] text-white px-2 py-0.5 rounded-full font-semibold">
                  {selectedAptIds.size} selected
                </span>
              )}
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden">

            {/* ── FORM STAGE ──────────────────────────────────────────── */}
            {modalStage === 'form' && (
              <div className="flex h-full divide-x divide-gray-100">

                {/* Left: Apartment selector */}
                <div className="w-[55%] flex flex-col overflow-hidden">
                  {/* Building tabs */}
                  <div className="flex border-b border-gray-100 flex-shrink-0">
                    {(['all', 'A1', 'A2', 'A3'] as BuildingTab[]).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setBuildingTab(tab)}
                        className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                          buildingTab === tab
                            ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]'
                            : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        {tab === 'all' ? 'All' : tab}
                      </button>
                    ))}
                  </div>

                  {/* Select all + count */}
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100 flex-shrink-0">
                    <button
                      onClick={toggleAllInTab}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-[#1e3a5f] transition-colors"
                    >
                      {allTabSelected
                        ? <CheckCircle2 size={13} className="text-[#1e3a5f]" />
                        : <Circle size={13} className="text-gray-400" />
                      }
                      {allTabSelected ? 'Deselect all' : 'Select all'}
                    </button>
                    <span className="text-[10px] text-gray-400">
                      {tabApts.filter(a => selectedAptIds.has(a.id)).length}/{tabApts.length} in view
                    </span>
                  </div>

                  {/* Apartment list */}
                  <div className="flex-1 overflow-y-auto">
                    {buildingTab === 'all' ? (
                      ['A1', 'A2', 'A3'].map(bid => {
                        const bApts = aptsByBuilding.get(bid) ?? [];
                        if (bApts.length === 0) return null;
                        return (
                          <div key={bid}>
                            <div className="px-4 py-1.5 bg-gray-50/80 border-b border-gray-100">
                              <span className="text-[10px] font-bold text-[#1e3a5f] uppercase tracking-wider">Building {bid}</span>
                            </div>
                            {bApts.map(apt => <AptRow key={apt.id} apt={apt} selected={selectedAptIds.has(apt.id)} onToggle={toggleApt} />)}
                          </div>
                        );
                      })
                    ) : (
                      visibleApts.map(apt => <AptRow key={apt.id} apt={apt} selected={selectedAptIds.has(apt.id)} onToggle={toggleApt} />)
                    )}
                  </div>
                </div>

                {/* Right: Task form */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {/* Contractor */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Contractor *</label>
                      <select
                        value={contractorId}
                        onChange={e => setContractorId(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
                      >
                        <option value="">Select contractor…</option>
                        {(['drywall', 'ac', 'general'] as ContractorCategory[]).map(cat => {
                          const items = contractors.filter(c => c.category === cat && c.active);
                          if (!items.length) return null;
                          return (
                            <optgroup key={cat} label={CAT_LABELS[cat]}>
                              {items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </optgroup>
                          );
                        })}
                      </select>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Task description *</label>
                      <textarea
                        value={task}
                        onChange={e => setTask(e.target.value)}
                        rows={3}
                        placeholder="Describe the work to be done…"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
                      />
                    </div>

                    {/* Stage + Due date */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Stage</label>
                        <select
                          value={stageId}
                          onChange={e => setStageId(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
                        >
                          <option value="">None</option>
                          {sortedStages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Due date</label>
                        <input
                          type="date"
                          value={dueDate}
                          onChange={e => setDueDate(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                        />
                      </div>
                    </div>

                    {/* Attachments */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <label className="text-xs font-medium text-gray-500">Attachments</label>
                        <button
                          type="button"
                          onClick={() => attachRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-[#1e3a5f]/40 hover:text-[#1e3a5f] transition-colors"
                        >
                          <Paperclip size={11} /> Attach
                        </button>
                        <input
                          ref={attachRef}
                          type="file"
                          multiple
                          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                          className="hidden"
                          onChange={handleFilePick}
                        />
                      </div>
                      {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {attachments.map(att => (
                            <div
                              key={att.id}
                              className="relative flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:border-[#1e3a5f]/30"
                              style={{ maxWidth: '120px' }}
                              onClick={() => att.mimeType.startsWith('image/') && setPreviewAtt(att)}
                            >
                              {att.mimeType.startsWith('image/') ? (
                                <div className="relative w-8 h-8 flex-shrink-0 group">
                                  <img src={att.dataUrl} alt={att.filename} className="w-8 h-8 object-cover" />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all">
                                    <ZoomIn size={10} className="text-white opacity-0 group-hover:opacity-100" />
                                  </div>
                                </div>
                              ) : (
                                <div className="w-8 h-8 flex items-center justify-center bg-gray-100 flex-shrink-0">
                                  <FileText size={12} className="text-gray-400" />
                                </div>
                              )}
                              <span className="text-[10px] text-gray-500 truncate pr-1 relative z-10" style={{ maxWidth: '60px' }}>
                                {att.filename}
                              </span>
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); removeAttachment(att.id); }}
                                className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center z-10"
                              >
                                <X size={8} color="white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Form footer */}
                  <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
                    {selectedAptIds.size === 0 && (
                      <p className="text-xs text-amber-600 mb-2 flex items-center gap-1">
                        <AlertTriangle size={11} /> Select at least one apartment
                      </p>
                    )}
                    <button
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-semibold hover:bg-[#162d4a] disabled:opacity-40 transition-colors"
                    >
                      <Plus size={15} />
                      Create {selectedAptIds.size > 0 ? selectedAptIds.size : ''} Task{selectedAptIds.size !== 1 ? 's' : ''}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── ATTACHMENT CHOICE STAGE ──────────────────────────────── */}
            {modalStage === 'attachmentChoice' && (
              <div className="p-6 max-w-lg mx-auto">
                <p className="text-sm text-gray-500 mb-1">
                  You have {attachments.length} file{attachments.length !== 1 ? 's' : ''} attached.
                  Where should {attachments.length !== 1 ? 'they' : 'it'} be stored in Google Drive?
                </p>
                <p className="text-xs text-gray-400 mb-5">Creating tasks for {selectedApts.length} apartments.</p>

                <div className="space-y-3">
                  <button
                    onClick={() => handleAttachmentChoice('each')}
                    className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f]/40 hover:bg-blue-50/30 text-left transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#1e3a5f]/10 flex items-center justify-center flex-shrink-0">
                      <Layers size={20} className="text-[#1e3a5f]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Upload to each apartment's Drive</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Creates a separate copy in each apartment's <code className="bg-gray-100 px-1 rounded">Photos/Task Notes/</code> folder.
                        Apartments without a Drive link will keep files locally.
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleAttachmentChoice('one')}
                    className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-amber-300 hover:bg-amber-50/30 text-left transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <HardDrive size={20} className="text-amber-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Upload to one specific apartment's Drive</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        You choose which apartment's folder to use. Other apartments keep a local copy.
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleAttachmentChoice('local')}
                    className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-left transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Database size={20} className="text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Keep as task data only</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Files are stored as task attachments locally. No Google Drive upload.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* ── MISSING DRIVE WARNING STAGE ──────────────────────────── */}
            {modalStage === 'missingDriveWarning' && (
              <div className="p-6 max-w-lg mx-auto">
                <div className="flex items-start gap-3 mb-5 p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Drive link missing for {missingDriveApts.length} apartment{missingDriveApts.length !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Files can't be uploaded to Drive for these apartments. They'll keep local copies instead.
                    </p>
                  </div>
                </div>

                <div className="mb-5 space-y-1 max-h-48 overflow-y-auto">
                  {missingDriveApts.map(apt => (
                    <div key={apt.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                      <span className="text-xs font-medium text-gray-700">
                        Apt {apt.displayName || apt.apartmentNumber}
                      </span>
                      <span className="text-[10px] text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full">{apt.buildingId}</span>
                      <span className="text-[10px] text-amber-600 ml-auto">No Drive link</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setModalStage('attachmentChoice')}
                    className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => startUploading('each')}
                    className="flex-1 py-2.5 text-sm font-semibold bg-[#1e3a5f] text-white rounded-xl hover:bg-[#162d4a]"
                  >
                    Proceed anyway
                  </button>
                </div>
              </div>
            )}

            {/* ── SELECT TARGET APT STAGE ──────────────────────────────── */}
            {modalStage === 'selectTargetApt' && (
              <div className="p-6 max-w-lg mx-auto">
                {eligibleForOne.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertTriangle size={28} className="text-amber-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700">No eligible apartments</p>
                    <p className="text-xs text-gray-500 mt-1">None of the selected apartments have a Google Drive folder configured.</p>
                    <button
                      onClick={() => setModalStage('attachmentChoice')}
                      className="mt-4 text-xs text-[#1e3a5f] underline"
                    >
                      Go back
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-4">
                      Choose which apartment's Drive folder will receive the uploaded files.
                      All other apartments will keep a local copy.
                    </p>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto mb-5">
                      {selectedApts.map(apt => {
                        const hasLink = !!apt.driveLink;
                        const isTarget = apt.id === targetAptId;
                        return (
                          <button
                            key={apt.id}
                            onClick={() => hasLink && setTargetAptId(apt.id)}
                            disabled={!hasLink}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                              isTarget
                                ? 'border-[#1e3a5f] bg-[#1e3a5f]/5'
                                : hasLink
                                  ? 'border-gray-200 hover:border-[#1e3a5f]/40 hover:bg-blue-50/30'
                                  : 'border-gray-100 opacity-40 cursor-not-allowed bg-gray-50'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                              isTarget ? 'border-[#1e3a5f] bg-[#1e3a5f]' : 'border-gray-300'
                            }`}>
                              {isTarget && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-gray-800">
                                Apt {apt.displayName || apt.apartmentNumber}
                              </span>
                              <span className="ml-2 text-xs text-gray-400">{apt.buildingId}</span>
                            </div>
                            {hasLink ? (
                              <span className="text-[10px] text-green-600 font-medium flex-shrink-0">Drive ✓</span>
                            ) : (
                              <span className="text-[10px] text-gray-400 flex-shrink-0">No Drive link</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => targetAptId && startUploading('one')}
                      disabled={!targetAptId}
                      className="w-full py-2.5 text-sm font-semibold bg-[#1e3a5f] text-white rounded-xl hover:bg-[#162d4a] disabled:opacity-40 transition-colors"
                    >
                      Upload to selected apartment
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ── UPLOADING STAGE ──────────────────────────────────────── */}
            {modalStage === 'uploading' && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <Loader size={36} className="text-[#1e3a5f] animate-spin mb-4" />
                <p className="text-base font-semibold text-gray-800 mb-1">Creating tasks…</p>
                {uploadStatus.total > 0 && (
                  <>
                    <p className="text-sm text-gray-500 mb-3">
                      {uploadStatus.label} ({uploadStatus.current} of {uploadStatus.total})
                    </p>
                    <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1e3a5f] rounded-full transition-all"
                        style={{ width: `${Math.round((uploadStatus.current / uploadStatus.total) * 100)}%` }}
                      />
                    </div>
                    {fileUploadPct > 0 && (
                      <p className="text-xs text-gray-400 mt-2">File: {Math.round(fileUploadPct)}%</p>
                    )}
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Image preview overlay */}
      {previewAtt && (
        <div
          className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewAtt(null)}
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
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
          </div>
        </div>
      )}
    </>
  );
}

// ── Apartment row ──────────────────────────────────────────────────────────
function AptRow({ apt, selected, onToggle }: { apt: Apartment; selected: boolean; onToggle: (id: string) => void }) {
  const hasDrive = !!apt.driveLink;
  return (
    <button
      onClick={() => onToggle(apt.id)}
      className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 transition-colors text-left ${
        selected ? 'bg-[#1e3a5f]/5' : 'hover:bg-gray-50'
      }`}
    >
      <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
        selected ? 'bg-[#1e3a5f] border-[#1e3a5f]' : 'border-gray-300'
      }`}>
        {selected && (
          <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2">
            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-800">
          Apt {apt.displayName || apt.apartmentNumber}
        </span>
        <span className="ml-2 text-[10px] text-gray-400">
          Fl {apt.floor} · {apt.buildingId}
        </span>
      </div>
      <div
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasDrive ? 'bg-green-400' : 'bg-gray-300'}`}
        title={hasDrive ? 'Drive linked' : 'No Drive link'}
      />
    </button>
  );
}
