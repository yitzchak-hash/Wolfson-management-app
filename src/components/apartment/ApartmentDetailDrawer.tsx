import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Building2, AlertTriangle, Link, Unlink, ExternalLink, BookOpen, Download, Eye, EyeOff, Activity, RefreshCw, Paperclip, Trash2, ChevronDown, ChevronRight, ClipboardList } from 'lucide-react';
import { Apartment, User } from '../../types';
import { useStore } from '../../data/store';
import { format } from 'date-fns';
import { StageNotesSection } from './StageNotesSection';
import { ActivitySection } from './ActivitySection';
import { extractFileId, drivePreviewUrl, driveDownloadUrl, findPlansPdfViaBackend, isUploadBackendConfigured } from '../../data/driveApi';

interface Props {
  apartment: Apartment | null;
  onClose: () => void;
  currentUser: User;
  onToast: (msg: string, type?: 'success' | 'error') => void;
  onRequestAddTask?: (apt: Apartment) => void;
}

export function ApartmentDetailDrawer({ apartment, onClose, currentUser, onToast, onRequestAddTask }: Props) {
  const { stages, activityLogs, apartments, updateApartment, mergeApartments, unmergeApartments,
    autoBackup, backupSnapshots, restoreFromSnapshot,
    officeNoteFiles, addOfficeNoteFile, deleteOfficeNoteFile } = useStore();
  const backendConfigured = isUploadBackendConfigured();
  const officeFileRef = useRef<HTMLInputElement>(null);

  const [familyName, setFamilyName] = useState('');
  const [currentStageId, setCurrentStageId] = useState<string>('');
  const [classification, setClassification] = useState<'standard' | 'shinui'>('standard');
  const [generalNotes, setGeneralNotes] = useState('');
  const [driveLink, setDriveLink] = useState('');
  const [plansPdfLink, setPlansPdfLink] = useState('');
  const [mergedWithId, setMergedWithId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details' | 'stages' | 'history'>('details');
  const [showUnmergeModal, setShowUnmergeModal] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fetchingPdf, setFetchingPdf] = useState(false);
  const [detectedPdfId, setDetectedPdfId] = useState<string | null>(null);
  const [stageChangeModal, setStageChangeModal] = useState<{ newStageId: string; newStageName: string } | null>(null);
  const [prevStageId, setPrevStageId] = useState<string>('');

  useEffect(() => {
    if (apartment) {
      setFamilyName(apartment.displayName || '');
      setCurrentStageId(apartment.currentStageId ?? '');
      setPrevStageId(apartment.currentStageId ?? '');
      setClassification(apartment.classification);
      setGeneralNotes(apartment.generalNotes);
      setDriveLink(apartment.driveLink ?? '');
      setPlansPdfLink(apartment.plansPdfLink ?? '');
      setMergedWithId(apartment.mergedWith ?? '');
      setShowPdfViewer(false);
      setShowHealthCheck(false);
      setShowSettings(false);
      setActiveTab('details');
      const existingFileId = apartment.plansPdfLink ? extractFileId(apartment.plansPdfLink) : null;
      setDetectedPdfId(existingFileId);
      if (!existingFileId && apartment.driveLink && backendConfigured) {
        setFetchingPdf(true);
        findPlansPdfViaBackend(apartment.driveLink).then(f => {
          if (f) setDetectedPdfId(f.id);
        }).finally(() => setFetchingPdf(false));
      }
    }
  }, [apartment?.id]);

  if (!apartment) return null;

  const sortedStages = [...stages].filter(s => s.active).sort((a, b) => a.order - b.order);
  const currentStage = stages.find(s => s.id === currentStageId);
  const aptLogs = activityLogs.filter(l => l.apartmentId === apartment.id).slice(0, 20);
  const sameBuildingApts = apartments
    .filter(a => a.buildingId === apartment.buildingId && a.id !== apartment.id && !a.isUnnamed)
    .sort((a, b) => (Number(a.apartmentNumber) || 0) - (Number(b.apartmentNumber) || 0));
  const mergedPartner = apartments.find(a => a.id === apartment.mergedWith);

  function handleSaveBasic() {
    const stageChanged = currentStageId !== prevStageId;
    updateApartment(apartment!.id, {
      displayName: familyName || apartment!.apartmentNumber,
      currentStageId: currentStageId || null,
      classification,
      generalNotes,
      driveLink: driveLink.trim() || undefined,
      plansPdfLink: plansPdfLink.trim() || undefined,
    }, currentUser);
    setPrevStageId(currentStageId);
    if (stageChanged && currentStageId && onRequestAddTask) {
      const newStageName = stages.find(s => s.id === currentStageId)?.name ?? '';
      setStageChangeModal({ newStageId: currentStageId, newStageName });
    } else {
      onToast('Apartment details saved');
    }
  }

  function handleSaveMerge() {
    if (!mergedWithId && mergedPartner) {
      setShowUnmergeModal(true);
      return;
    }
    mergeApartments(apartment!.id, mergedWithId || null, currentUser);
    const partner = apartments.find(a => a.id === mergedWithId);
    onToast(partner ? `Linked with Apt ${partner.displayName || partner.apartmentNumber}` : 'Merge link cleared');
  }

  function handleConfirmUnmerge(keepDataAptId: string | 'both') {
    setShowUnmergeModal(false);
    unmergeApartments(apartment!.id, keepDataAptId, currentUser);
    onToast('Apartments unlinked');
  }

  return (
    <>
      {/* Stage-change → assign task modal */}
      {stageChangeModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" />
          <div className="fixed z-[70] bg-white rounded-2xl shadow-2xl p-6" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(380px, 90vw)' }}>
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList size={18} className="text-[#1e3a5f]" />
              <h3 className="font-bold text-gray-900 text-base">Stage Changed</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Stage set to <strong className="text-[#1e3a5f]">{stageChangeModal.newStageName}</strong>. Would you like to assign a contractor task for this stage?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setStageChangeModal(null); onToast('Saved'); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                No, just save
              </button>
              <button
                onClick={() => {
                  setStageChangeModal(null);
                  onToast('Saved');
                  onClose();
                  const liveApt = apartments.find(a => a.id === apartment!.id) ?? apartment!;
                  onRequestAddTask?.(liveApt);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5"
                style={{ backgroundColor: '#1e3a5f' }}
              >
                <ClipboardList size={14} /> Assign Task
              </button>
            </div>
          </div>
        </>
      )}

      {/* Unmerge modal */}
      {showUnmergeModal && mergedPartner && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={() => setShowUnmergeModal(false)} />
          <div className="fixed z-[70] bg-white rounded-2xl shadow-2xl p-6" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(400px, 90vw)' }}>
            <h3 className="font-bold text-gray-900 mb-1 text-base">Unlink Apartments</h3>
            <p className="text-sm text-gray-500 mb-4">
              Which apartment keeps the shared data (stage, drive link)?
            </p>
            <div className="space-y-2">
              <button onClick={() => handleConfirmUnmerge(apartment.id)}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all">
                <div className="font-medium text-sm text-gray-800">Apt {apartment.displayName || apartment.apartmentNumber} keeps the data</div>
                <div className="text-xs text-gray-400 mt-0.5">Apt {mergedPartner.displayName || mergedPartner.apartmentNumber} — stage &amp; drive link will be cleared</div>
              </button>
              <button onClick={() => handleConfirmUnmerge(mergedPartner.id)}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all">
                <div className="font-medium text-sm text-gray-800">Apt {mergedPartner.displayName || mergedPartner.apartmentNumber} keeps the data</div>
                <div className="text-xs text-gray-400 mt-0.5">Apt {apartment.displayName || apartment.apartmentNumber} — stage &amp; drive link will be cleared</div>
              </button>
              <button onClick={() => handleConfirmUnmerge('both')}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all">
                <div className="font-medium text-sm text-gray-800">Both keep their current data</div>
                <div className="text-xs text-gray-400 mt-0.5">Just removes the link — no data is cleared</div>
              </button>
            </div>
            <button onClick={() => setShowUnmergeModal(false)} className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </>
      )}

      <div className="drawer-overlay fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      <div className="drawer-panel fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 size={16} className="text-[#4aa8d8] flex-shrink-0" />
            <span className="text-[#4aa8d8] font-semibold text-sm flex-shrink-0">{apartment.buildingId}</span>
            {apartment.floor > 0 && <span className="text-white/50 text-xs flex-shrink-0">· Floor {apartment.floor}</span>}
            {mergedPartner && (
              <span className="text-white/60 text-xs flex-shrink-0">
                · Linked with Apt {mergedPartner.displayName || mergedPartner.apartmentNumber}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {(['details', 'stages', 'history'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab ? 'border-b-2 border-[#1e3a5f] text-[#1e3a5f]' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab === 'stages' ? 'Stage Notes' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Top row: Apt# | Family Name | Classification | Stage */}
              <div className="flex items-start gap-2">
                {/* Apt number — read-only small */}
                <div className="flex-shrink-0">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Apt #</label>
                  <div className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm font-bold text-center text-gray-700 bg-gray-50">
                    {apartment.apartmentNumber}
                  </div>
                </div>

                {/* Family name */}
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Family Name</label>
                  <input
                    value={familyName}
                    onChange={e => setFamilyName(e.target.value)}
                    placeholder="Family name…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                  />
                </div>

                {/* Classification toggle */}
                <div className="flex-shrink-0">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Type</label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setClassification('standard')}
                      className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-all ${
                        classification === 'standard' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      Std
                    </button>
                    <button
                      onClick={() => setClassification('shinui')}
                      className={`px-2 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-0.5 ${
                        classification === 'shinui' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <AlertTriangle size={10} /> Chg
                    </button>
                  </div>
                </div>

                {/* Current stage */}
                <div className="flex-shrink-0 min-w-[120px]">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">Current Stage</label>
                  <select
                    value={currentStageId}
                    onChange={e => setCurrentStageId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    style={{ borderLeftColor: currentStage?.color, borderLeftWidth: currentStage ? '3px' : undefined }}
                  >
                    <option value="">— Not Started —</option>
                    {sortedStages.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* General notes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">General Notes</label>
                  <button
                    type="button"
                    onClick={() => officeFileRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1e3a5f] transition-colors"
                    title="Attach file to notes"
                  >
                    <Paperclip size={11} /> Attach
                  </button>
                </div>
                <textarea
                  value={generalNotes}
                  onChange={e => setGeneralNotes(e.target.value)}
                  rows={3}
                  placeholder="General notes about this apartment…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
                />
                <input
                  ref={officeFileRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file || !apartment) return;
                    const reader = new FileReader();
                    reader.onload = ev => {
                      addOfficeNoteFile({
                        apartmentId: apartment.id,
                        dataUrl: ev.target?.result as string,
                        filename: file.name,
                        mimeType: file.type,
                        uploadedBy: currentUser.id,
                        uploadedByName: currentUser.name,
                      });
                      onToast('File attached');
                    };
                    reader.readAsDataURL(file);
                    if (officeFileRef.current) officeFileRef.current.value = '';
                  }}
                />
                {(() => {
                  const aptFiles = officeNoteFiles.filter(f => f.apartmentId === apartment.id);
                  if (!aptFiles.length) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {aptFiles.map(f => {
                        const isImage = f.mimeType.startsWith('image/');
                        return (
                          <div key={f.id} className="relative group w-14 h-14 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
                            {isImage
                              ? <img src={f.dataUrl} alt={f.filename} className="w-full h-full object-cover" />
                              : <div className="flex flex-col items-center p-1"><BookOpen size={16} className="text-gray-400" /><span className="text-[8px] text-gray-400 truncate w-full text-center mt-0.5">{f.filename}</span></div>
                            }
                            <button onClick={() => deleteOfficeNoteFile(f.id)}
                              className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Trash2 size={8} color="white" />
                            </button>
                            <a href={f.dataUrl} download={f.filename}
                              className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-gray-700/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Download size={8} color="white" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Engineering Plans PDF */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                    <BookOpen size={11} /> Engineering Plans
                  </label>
                  <div className="flex items-center gap-2">
                    {driveLink && backendConfigured && (
                      <button
                        onClick={() => {
                          setFetchingPdf(true);
                          findPlansPdfViaBackend(driveLink).then(f => {
                            if (f) { setDetectedPdfId(f.id); setPlansPdfLink(`https://drive.google.com/file/d/${f.id}/view`); onToast('PDF found'); }
                            else onToast('No PDF found in Drive folder', 'error');
                          }).finally(() => setFetchingPdf(false));
                        }}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1e3a5f] transition-colors"
                      >
                        <RefreshCw size={11} className={fetchingPdf ? 'animate-spin' : ''} />
                        {fetchingPdf ? 'Detecting…' : 'Refresh'}
                      </button>
                    )}
                    <button
                      onClick={() => setShowHealthCheck(v => !v)}
                      className={`flex items-center gap-1 text-xs transition-colors ${showHealthCheck ? 'text-[#1e3a5f]' : 'text-gray-400 hover:text-[#1e3a5f]'}`}
                    >
                      <Activity size={11} /> Health
                    </button>
                  </div>
                </div>

                {showHealthCheck && (
                  <div className="mb-2 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
                    {[
                      { label: 'Drive folder linked', ok: !!driveLink.trim() },
                      { label: 'Plans PDF detected', ok: !!detectedPdfId },
                    ].map(({ label, ok }) => (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${ok ? 'bg-green-500' : 'bg-red-400'}`} style={{ fontSize: '9px' }}>
                          {ok ? '✓' : '✗'}
                        </span>
                        <span className="text-gray-600">{label}</span>
                      </div>
                    ))}
                    {!detectedPdfId && !fetchingPdf && driveLink && (
                      <p className="text-[10px] text-gray-400 mt-1 pt-1 border-t border-gray-200">
                        No PDF found. Check folder has "Engineered Plans" subfolder or PDF at root.
                      </p>
                    )}
                  </div>
                )}

                {detectedPdfId ? (
                  <>
                    <div
                      className="rounded-xl overflow-hidden border border-gray-200 cursor-pointer relative mb-2"
                      style={{ height: showPdfViewer ? '440px' : '160px' }}
                      onClick={() => setShowPdfViewer(v => !v)}
                    >
                      <iframe
                        src={drivePreviewUrl(detectedPdfId)}
                        width="100%"
                        height={showPdfViewer ? '440' : '160'}
                        allow="autoplay"
                        title="Engineering Plans"
                        style={{ border: 'none', display: 'block', pointerEvents: showPdfViewer ? 'auto' : 'none' }}
                      />
                      {!showPdfViewer && (
                        <div className="absolute inset-0 flex items-end justify-center pb-2 bg-gradient-to-t from-black/20 to-transparent">
                          <span className="text-white text-[10px] font-medium bg-black/40 px-2 py-0.5 rounded">Click to expand</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowPdfViewer(v => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-all">
                        {showPdfViewer ? <EyeOff size={12} /> : <Eye size={12} />}
                        {showPdfViewer ? 'Hide' : 'Full View'}
                      </button>
                      <a href={driveDownloadUrl(detectedPdfId)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-[#4aa8d8] hover:text-[#4aa8d8] transition-all">
                        <Download size={12} /> Download
                      </a>
                    </div>
                  </>
                ) : fetchingPdf ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                    <RefreshCw size={12} className="animate-spin" /> Looking for Plans PDF in Drive…
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic py-1">
                    {driveLink ? 'No Plans PDF found. Click Refresh to retry, or set Drive folder below.' : 'Set the Drive folder in Settings below to auto-detect Plans PDF.'}
                  </div>
                )}
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveBasic}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
              >
                <Save size={16} /> Save Changes
              </button>

              {/* Settings collapsible */}
              <div className="border-t border-gray-100 pt-3">
                <button
                  onClick={() => setShowSettings(v => !v)}
                  className="w-full flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                >
                  {showSettings ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  Settings
                  <span className="ml-auto text-xs text-gray-400">Drive folder · Connected unit</span>
                </button>

                {showSettings && (
                  <div className="mt-3 space-y-4">
                    {/* Google Drive link */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                          <ExternalLink size={11} /> Google Drive Folder
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={driveLink}
                          onChange={e => setDriveLink(e.target.value)}
                          placeholder="https://drive.google.com/drive/folders/…"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                        />
                        {driveLink && (
                          <a href={driveLink} target="_blank" rel="noopener noreferrer"
                            className="flex items-center px-3 py-2 rounded-lg border border-gray-200 text-gray-500 hover:text-[#4aa8d8] hover:border-[#4aa8d8] transition-all">
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                      {mergedPartner?.driveLink && driveLink && mergedPartner.driveLink !== driveLink.trim() && (
                        <div className="mt-1.5 flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
                          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                          <span>Merged partner has a different Drive link. Saving will sync both.</span>
                        </div>
                      )}
                    </div>

                    {/* Connected unit */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-1.5">
                        <Link size={12} /> Connected Unit (buyer-merged apartments)
                      </label>
                      {mergedPartner && (
                        <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
                          <Link size={12} />
                          Linked to Apt <strong>{mergedPartner.displayName || mergedPartner.apartmentNumber}</strong>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <select
                          value={mergedWithId}
                          onChange={e => setMergedWithId(e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                        >
                          <option value="">— No connection —</option>
                          {sameBuildingApts.map(a => (
                            <option key={a.id} value={a.id}>
                              Apt {a.displayName || a.apartmentNumber} (Floor {a.floor > 0 ? a.floor : 'B'})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleSaveMerge}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all bg-blue-600 text-white hover:bg-blue-700"
                        >
                          {mergedWithId ? <Link size={14} /> : <Unlink size={14} />}
                          {mergedWithId ? 'Link' : 'Clear'}
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">Linking is mutual — both apartments show the connection.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'stages' && (
            <StageNotesSection
              apartmentId={apartment.id}
              stages={sortedStages}
              currentUser={currentUser}
              onSaved={() => onToast('Note saved')}
            />
          )}

          {activeTab === 'history' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">Recent Activity</h4>
                {autoBackup && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Auto-backup on</span>
                )}
              </div>
              <ActivitySection
                logs={aptLogs}
                autoBackup={autoBackup}
                backupSnapshots={backupSnapshots}
                onRestore={(snapshotId) => {
                  restoreFromSnapshot(snapshotId);
                  onToast('Restored to selected point in time');
                }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
