import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Building2, AlertTriangle, Link, Unlink, ExternalLink, BookOpen, Download, Eye, EyeOff, Activity, RefreshCw, Paperclip, Trash2, ChevronDown, ChevronRight, ClipboardList, CheckCircle2, CalendarDays, FileText, UserCheck, Plus, Camera, Play, ChevronLeft, FolderOpen, Clock, RotateCcw } from 'lucide-react';
import { Apartment, User, getStageName } from '../../types';
import { useStore } from '../../data/store';
import { format, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns';
import { StageNotesSection } from './StageNotesSection';
import { ActivitySection } from './ActivitySection';
import { extractFileId, drivePreviewUrl, driveDownloadUrl, findPlansPdfViaBackend, isUploadBackendConfigured, findOrCreateFolderViaBackend, uploadFileViaResumableSession, shareFileToDrive, extractFolderId, driveThumbUrl, listAllPhotosViaBackend, DrivePhotoItem } from '../../data/driveApi';
import { Tooltip } from '../ui/Tooltip';

interface Props {
  apartment: Apartment | null;
  onClose: () => void;
  currentUser: User;
  onToast: (msg: string, type?: 'success' | 'error') => void;
  onRequestAddTask?: (apt: Apartment) => void;
}

interface LightboxItem {
  fileId: string;
  filename: string;
  mimeType: string;
  thumbSrc: string;
  downloadHref: string;
}

function LightboxOverlay({ items, initialIndex, onClose, imageUnavailable, openDownload }: { items: LightboxItem[]; initialIndex: number; onClose: () => void; imageUnavailable: string; openDownload: string }) {
  const [idx, setIdx] = React.useState(initialIndex);
  const [touchStart, setTouchStart] = React.useState<number | null>(null);
  const item = items[idx];
  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(items.length - 1, i + 1));
  const isImg = item.mimeType.startsWith('image/');
  const isVid = item.mimeType.startsWith('video/');

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[300] bg-black flex flex-col select-none"
      onTouchStart={e => setTouchStart(e.touches[0].clientX)}
      onTouchEnd={e => {
        if (touchStart === null) return;
        const d = touchStart - e.changedTouches[0].clientX;
        if (d > 60) next(); else if (d < -60) prev();
        setTouchStart(null);
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 flex-shrink-0">
        <span className="text-white text-sm font-medium truncate max-w-[60%]">{item.filename}</span>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-xs">{idx + 1} / {items.length}</span>
          {item.downloadHref && (
            <a href={item.downloadHref} target="_blank" rel="noopener noreferrer" download={!item.fileId ? item.filename : undefined}
              className="p-1.5 text-gray-300 hover:text-white" title="Download">
              <Download size={18} />
            </a>
          )}
          <button onClick={onClose} className="p-1.5 text-gray-300 hover:text-white"><X size={20} /></button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden px-12">
        {isImg ? (
          item.thumbSrc
            ? <img src={item.thumbSrc} alt={item.filename} className="max-w-full max-h-full object-contain" draggable={false} />
            : <div className="text-gray-500 text-sm">{imageUnavailable}</div>
        ) : isVid ? (
          <video src={item.thumbSrc} controls className="max-w-full max-h-full" />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <FileText size={56} className="text-blue-400" />
            <span className="text-white text-sm">{item.filename}</span>
            {item.downloadHref && (
              <a href={item.downloadHref} target="_blank" rel="noopener noreferrer"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium">
                {openDownload}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Prev / Next */}
      {idx > 0 && (
        <button onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white z-10">
          <ChevronLeft size={22} />
        </button>
      )}
      {idx < items.length - 1 && (
        <button onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white z-10">
          <ChevronRight size={22} />
        </button>
      )}

      {/* Dot indicators */}
      {items.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-4 pt-2 flex-shrink-0">
          {items.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`rounded-full transition-all ${i === idx ? 'w-4 h-2 bg-white' : 'w-2 h-2 bg-gray-600 hover:bg-gray-400'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function DriveImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 px-1">
      <FileText size={14} className="text-gray-300" />
      <span className="text-[8px] text-gray-400 text-center break-all leading-tight mt-0.5 truncate w-full">{alt}</span>
    </div>
  );
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

export function ApartmentDetailDrawer({ apartment, onClose, currentUser, onToast, onRequestAddTask }: Props) {
  const { stages, activityLogs, apartments, updateApartment, mergeApartments, unmergeApartments,
    autoBackup, backupSnapshots, restoreFromSnapshot, mainUiStrings: ui,
    officeNoteFiles, addOfficeNoteFile, deleteOfficeNoteFile,
    contractorAssignments, contractors, updateContractorAssignment,
    getGeneralNoteVersions } = useStore();
  const backendConfigured = isUploadBackendConfigured();
  const officeFileRef = useRef<HTMLInputElement>(null);

  const [familyName, setFamilyName] = useState('');
  const [currentStageId, setCurrentStageId] = useState<string>('');
  const [classification, setClassification] = useState<'standard' | 'shinui'>('standard');
  const [generalNotes, setGeneralNotes] = useState('');
  const [generalNotesHistoryOpen, setGeneralNotesHistoryOpen] = useState(false);
  const [driveLink, setDriveLink] = useState('');
  const [plansPdfLink, setPlansPdfLink] = useState('');
  const [mergedWithId, setMergedWithId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details' | 'tasks' | 'stages' | 'history' | 'photos'>('details');
  const [drivePhotos, setDrivePhotos] = useState<DrivePhotoItem[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [lightbox, setLightbox] = useState<{ items: { fileId: string; filename: string; mimeType: string; thumbSrc: string; downloadHref: string }[]; index: number } | null>(null);
  const [officeUploadPct, setOfficeUploadPct] = useState<number | null>(null);
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
      setDrivePhotos([]);
      setPhotosLoaded(false);
      setLightbox(null);
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

  const aptTasks = contractorAssignments
    .filter(a => a.apartmentId === apartment.id)
    .sort((a, b) => (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0) || (a.dueDate ?? 'z').localeCompare(b.dueDate ?? 'z'));
  const pendingTaskCount = aptTasks.filter(a => !a.completedAt).length;

  function getTaskDueBadge(dueDate: string | null) {
    if (!dueDate) return null;
    const days = differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
    if (days < 0) return { text: ui.overdue, cls: 'bg-red-100 text-red-700' };
    if (days === 0) return { text: ui.today, cls: 'bg-orange-100 text-orange-700' };
    if (days === 1) return { text: ui.tomorrow, cls: 'bg-amber-100 text-amber-700' };
    if (days <= 3) return { text: `${days}d`, cls: 'bg-yellow-100 text-yellow-700' };
    return { text: format(parseISO(dueDate), 'MMM d'), cls: 'bg-gray-100 text-gray-500' };
  }

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
      onToast(ui.apartmentSaved);
    }
  }

  // Silent auto-save on blur — no toast, no modal
  function autoSave() {
    updateApartment(apartment!.id, {
      displayName: familyName || apartment!.apartmentNumber,
      currentStageId: currentStageId || null,
      classification,
      generalNotes,
      driveLink: driveLink.trim() || undefined,
      plansPdfLink: plansPdfLink.trim() || undefined,
    }, currentUser);
    setPrevStageId(currentStageId);
  }

  function handleSaveMerge() {
    if (!mergedWithId && mergedPartner) {
      setShowUnmergeModal(true);
      return;
    }
    if (mergedWithId) {
      const partner = apartments.find(a => a.id === mergedWithId);
      if (partner && partner.buildingId !== apartment!.buildingId) {
        onToast(ui.cannotMergeBldgs, 'error');
        return;
      }
      if (partner && partner.mergedWith && partner.mergedWith !== apartment!.id) {
        onToast(ui.alreadyMergedError, 'error');
        return;
      }
      if (apartment!.mergedWith && apartment!.mergedWith !== mergedWithId) {
        onToast(ui.alreadyMergedError, 'error');
        return;
      }
    }
    mergeApartments(apartment!.id, mergedWithId || null, currentUser);
    const partner = apartments.find(a => a.id === mergedWithId);
    onToast(partner ? `${ui.linkedToApt} ${ui.aptPrefix} ${partner.displayName || partner.apartmentNumber}` : 'Merge link cleared');
  }

  function handleConfirmUnmerge(keepDataAptId: string | 'both') {
    setShowUnmergeModal(false);
    unmergeApartments(apartment!.id, keepDataAptId, currentUser);
    onToast(ui.apartmentUnlinked);
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
              <h3 className="font-bold text-gray-900 text-base">{ui.stageChangedModal}</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Stage set to <strong className="text-[#1e3a5f]">{stageChangeModal.newStageName}</strong>. {ui.assignTaskQuestion}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setStageChangeModal(null); onToast(ui.apartmentSaved); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                {ui.noJustSave}
              </button>
              <button
                onClick={() => {
                  setStageChangeModal(null);
                  onToast(ui.apartmentSaved);
                  onClose();
                  const liveApt = apartments.find(a => a.id === apartment!.id) ?? apartment!;
                  onRequestAddTask?.(liveApt);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5"
                style={{ backgroundColor: '#1e3a5f' }}
              >
                <ClipboardList size={14} /> {ui.assignTaskBtn}
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
            <h3 className="font-bold text-gray-900 mb-1 text-base">{ui.unlinkApartments}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {ui.unmergeQuestion}
            </p>
            <div className="space-y-2">
              <button onClick={() => handleConfirmUnmerge(apartment.id)}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all">
                <div className="font-medium text-sm text-gray-800">{ui.aptPrefix} {apartment.displayName || apartment.apartmentNumber} {ui.keepsData}</div>
                <div className="text-xs text-gray-400 mt-0.5">{ui.aptPrefix} {mergedPartner.displayName || mergedPartner.apartmentNumber} — {ui.stageWillBeCleared}</div>
              </button>
              <button onClick={() => handleConfirmUnmerge(mergedPartner.id)}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all">
                <div className="font-medium text-sm text-gray-800">{ui.aptPrefix} {mergedPartner.displayName || mergedPartner.apartmentNumber} {ui.keepsData}</div>
                <div className="text-xs text-gray-400 mt-0.5">{ui.aptPrefix} {apartment.displayName || apartment.apartmentNumber} — {ui.stageWillBeCleared}</div>
              </button>
              <button onClick={() => handleConfirmUnmerge('both')}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all">
                <div className="font-medium text-sm text-gray-800">{ui.bothKeepData}</div>
                <div className="text-xs text-gray-400 mt-0.5">{ui.justRemovesLink}</div>
              </button>
            </div>
            <button onClick={() => setShowUnmergeModal(false)} className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700">{ui.cancel}</button>
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
            {apartment.floor > 0 && <span className="text-white/50 text-xs flex-shrink-0">· {ui.floorPrefix} {apartment.floor}</span>}
            {mergedPartner && (
              <span className="text-white/60 text-xs flex-shrink-0">
                · {ui.linkedToApt} {ui.aptPrefix} {mergedPartner.displayName || mergedPartner.apartmentNumber}
              </span>
            )}
          </div>
          <Tooltip text="Close" side="left">
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
              <X size={20} />
            </button>
          </Tooltip>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0 overflow-x-auto">
          {(['details', 'tasks', 'stages', 'photos', 'history'] as const).map(tab => (
            <button key={tab} onClick={() => {
              setActiveTab(tab);
              if (tab === 'photos' && !photosLoaded && apartment?.driveLink && backendConfigured) {
                setLoadingPhotos(true);
                listAllPhotosViaBackend(apartment.driveLink)
                  .then(photos => { setDrivePhotos(photos); setPhotosLoaded(true); })
                  .catch(() => setPhotosLoaded(true))
                  .finally(() => setLoadingPhotos(false));
              }
            }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors relative ${
                activeTab === tab ? 'border-b-2 border-[#1e3a5f] text-[#1e3a5f]' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab === 'tasks' ? ui.tabTasks : tab === 'stages' ? ui.tabNotes : tab === 'history' ? ui.tabHistory : tab === 'photos' ? ui.tabPhotos : ui.tabDetails}
              {tab === 'tasks' && pendingTaskCount > 0 && (
                <span className="ml-1 text-[10px] bg-orange-500 text-white rounded-full px-1.5 py-0.5 font-bold">
                  {pendingTaskCount}
                </span>
              )}
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
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">{ui.aptPrefix} #</label>
                  <div className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm font-bold text-center text-gray-700 bg-gray-50">
                    {apartment.apartmentNumber}
                  </div>
                </div>

                {/* Family name */}
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">{ui.familyName}</label>
                  <input
                    value={familyName}
                    onChange={e => setFamilyName(e.target.value)}
                    onBlur={autoSave}
                    placeholder={ui.familyNamePlaceholder}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                  />
                </div>

                {/* Classification toggle */}
                <div className="flex-shrink-0">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">{ui.typeField}</label>
                  <div className="flex gap-1">
                    <Tooltip text={ui.standardApt}>
                      <button
                        onClick={() => setClassification('standard')}
                        className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-all ${
                          classification === 'standard' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        Std
                      </button>
                    </Tooltip>
                    <Tooltip text={ui.hasModifications}>
                      <button
                        onClick={() => setClassification('shinui')}
                        className={`px-2 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-0.5 ${
                          classification === 'shinui' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <AlertTriangle size={10} /> Chg
                      </button>
                    </Tooltip>
                  </div>
                </div>

                {/* Current stage */}
                <div className="flex-shrink-0 min-w-[120px]">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">{ui.currentStage}</label>
                  <select
                    value={currentStageId}
                    onChange={e => setCurrentStageId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    style={{ borderLeftColor: currentStage?.color, borderLeftWidth: currentStage ? '3px' : undefined }}
                  >
                    <option value="">{ui.notStartedOption}</option>
                    {sortedStages.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* General notes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-medium text-gray-600">{ui.generalNotes}</label>
                    {apartment && (() => {
                      const versions = getGeneralNoteVersions(apartment.id);
                      return versions.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setGeneralNotesHistoryOpen(v => !v)}
                          className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-[#1e3a5f] transition-colors"
                          title={ui.noteHistory}
                        >
                          <Clock size={11} />
                          <span className="text-[10px]">{versions.length}</span>
                        </button>
                      ) : null;
                    })()}
                  </div>
                  <Tooltip text={ui.attachFiles}>
                    <button
                      type="button"
                      onClick={() => officeFileRef.current?.click()}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1e3a5f] transition-colors"
                    >
                      <Paperclip size={11} /> {ui.attachFiles}
                    </button>
                  </Tooltip>
                </div>
                <textarea
                  value={generalNotes}
                  onChange={e => setGeneralNotes(e.target.value)}
                  onBlur={autoSave}
                  rows={3}
                  placeholder={ui.generalNotesPlaceholder}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
                />
                {/* General notes history panel */}
                {generalNotesHistoryOpen && apartment && (() => {
                  const versions = getGeneralNoteVersions(apartment.id);
                  return versions.length > 0 ? (
                    <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                      <div className="px-3 py-1.5 border-b border-gray-200 flex items-center gap-1.5">
                        <Clock size={11} className="text-gray-400" />
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{ui.noteHistory}</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                        {versions.map(v => (
                          <div key={v.id} className="px-3 py-2 flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] text-gray-400 mb-0.5">
                                {format(new Date(v.savedAt), 'MMM d, yyyy HH:mm')} · {v.savedByName}
                              </div>
                              <div className="text-xs text-gray-600 truncate">{v.noteText || <span className="italic text-gray-400">empty</span>}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => { setGeneralNotes(v.noteText); setGeneralNotesHistoryOpen(false); }}
                              className="flex items-center gap-1 text-[10px] text-[#1e3a5f] hover:underline flex-shrink-0"
                              title="Restore this version"
                            >
                              <RotateCcw size={10} /> {ui.restore}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}
                <input
                  ref={officeFileRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  onChange={async e => {
                    const files = Array.from(e.target.files ?? []);
                    if (!files.length || !apartment) return;
                    if (officeFileRef.current) officeFileRef.current.value = '';

                    for (const file of files) {
                      const mainFolderId = apartment.driveLink ? extractFolderId(apartment.driveLink) : null;
                      if (backendConfigured && mainFolderId) {
                        try {
                          const photosFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Photos');
                          const notesFolderId = await findOrCreateFolderViaBackend(photosFolderId, 'Job Notes');
                          setOfficeUploadPct(0);
                          const { fileId, webViewLink } = await uploadFileViaResumableSession(notesFolderId, file, pct => setOfficeUploadPct(pct));
                          setOfficeUploadPct(null);
                          await shareFileToDrive(fileId);
                          addOfficeNoteFile({
                            apartmentId: apartment.id,
                            dataUrl: '',
                            filename: file.name,
                            mimeType: file.type,
                            uploadedBy: currentUser.id,
                            uploadedByName: currentUser.name,
                            driveFileId: fileId,
                            driveUrl: webViewLink,
                          });
                          continue;
                        } catch {
                          setOfficeUploadPct(null);
                        }
                      }
                      await new Promise<void>(resolve => {
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
                          resolve();
                        };
                        reader.readAsDataURL(file);
                      });
                    }
                    onToast(`${files.length} file${files.length !== 1 ? 's' : ''} attached`);
                  }}
                />
                {officeUploadPct !== null && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#4aa8d8] transition-all" style={{ width: `${officeUploadPct}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-500 flex-shrink-0">{officeUploadPct}%</span>
                  </div>
                )}
                {(() => {
                  const aptFiles = officeNoteFiles.filter(f => f.apartmentId === apartment.id);
                  if (!aptFiles.length) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {aptFiles.map(f => {
                        const isImage = f.mimeType.startsWith('image/');
                        return (
                          <div key={f.id} className="relative group w-14 h-14 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center cursor-pointer"
                            onClick={() => {
                              const allFiles = officeNoteFiles.filter(of => of.apartmentId === apartment.id);
                              const items = allFiles.map(of => ({
                                fileId: of.driveFileId ?? '',
                                filename: of.filename,
                                mimeType: of.mimeType,
                                thumbSrc: of.driveFileId ? driveThumbUrl(of.driveFileId, 800) : of.dataUrl,
                                downloadHref: of.driveFileId ? `https://drive.google.com/uc?export=download&id=${of.driveFileId}` : of.dataUrl,
                              }));
                              setLightbox({ items, index: allFiles.findIndex(of => of.id === f.id) });
                            }}
                          >
                            {isImage
                              ? <DriveImg
                                  src={f.driveFileId ? driveThumbUrl(f.driveFileId, 400) : f.dataUrl}
                                  alt={f.filename}
                                  className="w-full h-full object-cover"
                                />
                              : <div className="flex flex-col items-center p-1"><BookOpen size={16} className="text-gray-400" /><span className="text-[8px] text-gray-400 truncate w-full text-center mt-0.5">{f.filename}</span></div>
                            }
                            {!f.driveFileId && (
                              <div
                                title="Stored locally only — not synced to Drive"
                                className="absolute bottom-0.5 left-0.5 w-3 h-3 rounded-full bg-amber-400 flex items-center justify-center"
                              >
                                <AlertTriangle size={6} color="white" />
                              </div>
                            )}
                            <button onClick={e => { e.stopPropagation(); deleteOfficeNoteFile(f.id); }}
                              title="Remove file"
                              className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                              <Trash2 size={8} color="white" />
                            </button>
                            <a
                              href={f.driveFileId ? `https://drive.google.com/uc?export=download&id=${f.driveFileId}` : f.dataUrl}
                              download={!f.driveFileId ? f.filename : undefined}
                              target={f.driveFileId ? '_blank' : undefined}
                              rel={f.driveFileId ? 'noopener noreferrer' : undefined}
                              title="Download file"
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
                    <BookOpen size={11} /> {ui.engineeringPlans}
                  </label>
                  {driveLink && backendConfigured && (
                      <Tooltip text="Re-scan Drive folder for Plans PDF">
                        <button
                          onClick={() => {
                            setFetchingPdf(true);
                            findPlansPdfViaBackend(driveLink).then(f => {
                              if (f) { setDetectedPdfId(f.id); setPlansPdfLink(`https://drive.google.com/file/d/${f.id}/view`); onToast('PDF found'); }
                              else onToast(ui.noPdfFound, 'error');
                            }).finally(() => setFetchingPdf(false));
                          }}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1e3a5f] transition-colors"
                        >
                          <RefreshCw size={11} className={fetchingPdf ? 'animate-spin' : ''} />
                          {fetchingPdf ? ui.detecting : ui.refreshButton}
                        </button>
                      </Tooltip>
                    )}
                </div>

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
                        title={ui.engineeringPlans}
                        style={{ border: 'none', display: 'block', pointerEvents: showPdfViewer ? 'auto' : 'none' }}
                      />
                      {!showPdfViewer && (
                        <div className="absolute inset-0 flex items-end justify-center pb-2 bg-gradient-to-t from-black/20 to-transparent">
                          <span className="text-white text-[10px] font-medium bg-black/40 px-2 py-0.5 rounded">{ui.clickToExpand}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowPdfViewer(v => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-all">
                        {showPdfViewer ? <EyeOff size={12} /> : <Eye size={12} />}
                        {showPdfViewer ? 'Hide' : ui.fullView}
                      </button>
                      <a href={driveDownloadUrl(detectedPdfId)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-[#4aa8d8] hover:text-[#4aa8d8] transition-all">
                        <Download size={12} /> {ui.download}
                      </a>
                    </div>
                  </>
                ) : fetchingPdf ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                    <RefreshCw size={12} className="animate-spin" /> {ui.lookingForPdf}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic py-1">
                    {driveLink ? `${ui.noPdfFound}. ${ui.refreshButton}` : ui.setPdfHint}
                  </div>
                )}
              </div>

              {/* Save button */}
              <button
                onClick={handleSaveBasic}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#162d4a] transition-colors"
              >
                <Save size={16} /> {ui.saveChangesBtn}
              </button>

              {/* Settings collapsible */}
              <div className="border-t border-gray-100 pt-3">
                <button
                  onClick={() => setShowSettings(v => !v)}
                  className="w-full flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                  title={showSettings ? 'Collapse settings' : 'Expand: Drive folder & connected unit'}
                >
                  {showSettings ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  Settings
                  <span className="ml-auto text-xs text-gray-400">{ui.driveFolder} · {ui.connectedUnit}</span>
                </button>

                {showSettings && (
                  <div className="mt-3 space-y-4">
                    {/* Google Drive link */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                          <ExternalLink size={11} /> {ui.driveFolder}
                        </label>
                        <Tooltip text={showHealthCheck ? 'Hide status' : 'Show Drive folder status'}>
                          <button
                            onClick={() => setShowHealthCheck(v => !v)}
                            className={`flex items-center gap-1 text-xs transition-colors ${showHealthCheck ? 'text-[#1e3a5f]' : 'text-gray-400 hover:text-[#1e3a5f]'}`}
                          >
                            <Activity size={11} /> Status
                          </button>
                        </Tooltip>
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

                      <div className="flex gap-2">
                        <input
                          value={driveLink}
                          onChange={e => setDriveLink(e.target.value)}
                          onBlur={async () => {
                            const trimmed = driveLink.trim();
                            if (trimmed === (apartment.driveLink ?? '')) return;
                            handleSaveBasic();
                            // After saving a new drive link, auto-create Photos/ folder and refresh PDF detection
                            if (trimmed && backendConfigured) {
                              const folderId = extractFolderId(trimmed);
                              if (folderId) {
                                findOrCreateFolderViaBackend(folderId, 'Photos').catch(() => {});
                                if (!detectedPdfId) {
                                  setFetchingPdf(true);
                                  findPlansPdfViaBackend(trimmed)
                                    .then(f => { if (f) setDetectedPdfId(f.id); })
                                    .finally(() => setFetchingPdf(false));
                                }
                              }
                            }
                          }}
                          placeholder="https://drive.google.com/drive/folders/…"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                        />
                        {driveLink && (
                          <Tooltip text="Open folder in Drive">
                            <a href={driveLink} target="_blank" rel="noopener noreferrer"
                              className="flex items-center px-2.5 py-2 rounded-lg border border-gray-200 text-gray-500 hover:text-[#4aa8d8] hover:border-[#4aa8d8] transition-all">
                              <ExternalLink size={14} />
                            </a>
                          </Tooltip>
                        )}
                        <Tooltip text="Save drive link">
                          <button
                            onClick={async () => {
                              handleSaveBasic();
                              const trimmed = driveLink.trim();
                              if (trimmed && backendConfigured) {
                                const folderId = extractFolderId(trimmed);
                                if (folderId) {
                                  findOrCreateFolderViaBackend(folderId, 'Photos').catch(() => {});
                                  setFetchingPdf(true);
                                  findPlansPdfViaBackend(trimmed)
                                    .then(f => { if (f) setDetectedPdfId(f.id); })
                                    .finally(() => setFetchingPdf(false));
                                }
                              }
                            }}
                            className="flex items-center px-2.5 py-2 rounded-lg border border-gray-200 text-gray-500 hover:text-[#1e3a5f] hover:border-[#1e3a5f] transition-all"
                          >
                            <Save size={14} />
                          </button>
                        </Tooltip>
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
                        <Link size={12} /> {ui.connectedUnit}
                      </label>
                      {mergedPartner && (
                        <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
                          <Link size={12} />
                          {ui.linkedToApt} <strong>{mergedPartner.displayName || mergedPartner.apartmentNumber}</strong>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <select
                          value={mergedWithId}
                          onChange={e => setMergedWithId(e.target.value)}
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                        >
                          <option value="">{ui.noConnection}</option>
                          {sameBuildingApts.map(a => (
                            <option key={a.id} value={a.id}>
                              {ui.aptPrefix} {a.displayName || a.apartmentNumber} ({ui.floorPrefix} {a.floor > 0 ? a.floor : 'B'})
                            </option>
                          ))}
                        </select>
                        <Tooltip text={mergedWithId ? 'Link these apartments as a merged unit' : 'Clear the connected unit link'}>
                          <button
                            onClick={handleSaveMerge}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all bg-blue-600 text-white hover:bg-blue-700"
                          >
                            {mergedWithId ? <Link size={14} /> : <Unlink size={14} />}
                            {mergedWithId ? 'Link' : 'Clear'}
                          </button>
                        </Tooltip>
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">{ui.linkMutualHint}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-3">
              {/* Add Task button */}
              {onRequestAddTask && (
                <button
                  onClick={() => { onClose(); onRequestAddTask(apartment); }}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-[#1e3a5f]/5 border border-dashed border-[#1e3a5f]/20 rounded-lg text-sm text-[#1e3a5f] hover:bg-[#1e3a5f]/10 transition-colors font-medium"
                >
                  <Plus size={14} /> {ui.addTask}
                </button>
              )}

              {aptTasks.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <UserCheck size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{ui.noTasksAssigned}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {aptTasks.map(a => {
                    const contractor = contractors.find(c => c.id === a.contractorId);
                    const stage = stages.find(s => s.id === a.stageId);
                    const badge = getTaskDueBadge(a.dueDate);
                    const CAT_COLORS: Record<string, string> = { drywall: '#f59e0b', ac: '#3b82f6', general: '#10b981' };
                    return (
                      <div key={a.id} className={`rounded-xl border p-3 transition-all ${
                        a.completedAt ? 'border-green-100 bg-green-50/40 opacity-75' : 'border-gray-200 bg-white'
                      }`}>
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => updateContractorAssignment(a.id, { completedAt: a.completedAt ? null : new Date().toISOString() })}
                            className="mt-0.5 flex-shrink-0"
                            title={a.completedAt ? 'Mark incomplete' : 'Mark complete'}
                          >
                            {a.completedAt
                              ? <CheckCircle2 size={17} className="text-green-500" />
                              : <div className="w-4 h-4 rounded-full border-2 border-gray-300 hover:border-green-400 transition-colors" />
                            }
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                              {contractor && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: (CAT_COLORS[contractor.category] ?? '#888') + '22', color: CAT_COLORS[contractor.category] ?? '#888' }}>
                                  {contractor.name}
                                </span>
                              )}
                              {stage && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: stage.color + '20', color: stage.color }}>
                                  {getStageName(stage, ui.isRtl)}
                                </span>
                              )}
                              {a.priority === 'urgent' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium text-red-600 bg-red-50 border-red-200">
                                  {ui.urgentPriority}
                                </span>
                              )}
                              {a.priority === 'low' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium text-green-600 bg-green-50 border-green-200">
                                  {ui.lowPriority}
                                </span>
                              )}
                            </div>
                            <p className={`text-xs leading-snug ${a.completedAt ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                              {a.taskDescription}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {a.dueDate && (
                                <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                                  <CalendarDays size={9} /> {format(parseISO(a.dueDate), 'MMM d')}
                                </span>
                              )}
                              {badge && !a.completedAt && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.cls}`}>
                                  {badge.text}
                                </span>
                              )}
                              {a.completedAt && (
                                <span className="text-[10px] text-green-600">Done {format(new Date(a.completedAt), 'MMM d')}</span>
                              )}
                              {(a.attachments?.length ?? 0) > 0 && (
                                <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                                  <Paperclip size={9} /> {a.attachments!.length}
                                </span>
                              )}
                            </div>
                            {/* Attachment thumbnails */}
                            {(a.attachments?.length ?? 0) > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {a.attachments!.map((att, attIdx) => (
                                  <div key={att.id} className="relative flex-shrink-0">
                                    <div
                                      className="w-10 h-10 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center cursor-pointer"
                                      onClick={() => {
                                        const items = a.attachments!.map(at => ({
                                          fileId: at.driveFileId ?? '',
                                          filename: at.filename,
                                          mimeType: at.mimeType,
                                          thumbSrc: at.driveFileId ? driveThumbUrl(at.driveFileId, 800) : at.dataUrl,
                                          downloadHref: at.driveFileId ? `https://drive.google.com/uc?export=download&id=${at.driveFileId}` : at.dataUrl,
                                        }));
                                        setLightbox({ items, index: attIdx });
                                      }}
                                    >
                                      {att.mimeType.startsWith('image/')
                                        ? <DriveImg src={att.driveFileId ? driveThumbUrl(att.driveFileId, 200) : att.dataUrl} alt={att.filename} className="w-full h-full object-cover" />
                                        : <FileText size={14} className="text-gray-400" />
                                      }
                                    </div>
                                    <button
                                      onClick={e => { e.stopPropagation(); updateContractorAssignment(a.id, { attachments: (a.attachments ?? []).filter(at => at.id !== att.id) }); }}
                                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center z-10"
                                      title="Remove attachment"
                                    >
                                      <X size={8} color="white" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'photos' && (
            <div>
              {!apartment.driveLink ? (
                <div className="flex flex-col items-center py-16 text-center px-4">
                  <Camera size={32} className="text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-500">{ui.noDriveLinked}</p>
                  <p className="text-xs text-gray-400 mt-1">{ui.setDriveFolderHint}</p>
                </div>
              ) : !backendConfigured ? (
                <div className="flex flex-col items-center py-16 text-center px-4">
                  <Camera size={32} className="text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-500">{ui.driveBackendNotConfigured}</p>
                  <p className="text-xs text-gray-400 mt-1">Set VITE_DRIVE_API_KEY to enable photo browsing.</p>
                </div>
              ) : loadingPhotos ? (
                <div className="flex items-center justify-center py-16 text-gray-400">
                  <RefreshCw size={18} className="animate-spin mr-2" /> {ui.loadingPhotos}
                </div>
              ) : photosLoaded && drivePhotos.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center px-4">
                  <Camera size={32} className="text-gray-300 mb-3" />
                  <p className="text-sm font-medium text-gray-500">{ui.noPhotosYet}</p>
                  <p className="text-xs text-gray-400 mt-1">{ui.photosDesc}</p>
                </div>
              ) : drivePhotos.length > 0 ? (
                (() => {
                  const groups = drivePhotos.reduce<Record<string, DrivePhotoItem[]>>((acc, p) => {
                    (acc[p.folderName] = acc[p.folderName] || []).push(p);
                    return acc;
                  }, {});
                  return (
                    <div className="space-y-5">
                      {Object.entries(groups).map(([folder, items]) => (
                        <div key={folder}>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{folder}</h4>
                          <div className="grid grid-cols-3 gap-1.5">
                            {items.map((photo) => {
                              const isImg = photo.mimeType.startsWith('image/');
                              const isVid = photo.mimeType.startsWith('video/');
                              return (
                                <div
                                  key={photo.fileId}
                                  className="aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer relative"
                                  onClick={() => {
                                    const allItems = drivePhotos.map(p => ({
                                      fileId: p.fileId,
                                      filename: p.filename,
                                      mimeType: p.mimeType,
                                      thumbSrc: driveThumbUrl(p.fileId, 800),
                                      downloadHref: `https://drive.google.com/uc?export=download&id=${p.fileId}`,
                                    }));
                                    const globalIdx = drivePhotos.findIndex(p => p.fileId === photo.fileId);
                                    setLightbox({ items: allItems, index: globalIdx });
                                  }}
                                >
                                  {isImg ? (
                                    <DriveImg src={driveThumbUrl(photo.fileId, 400)} alt={photo.filename} className="w-full h-full object-cover" />
                                  ) : isVid ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800">
                                      <Play size={22} className="text-white" />
                                      <span className="text-white text-[9px] mt-1 opacity-60 truncate px-1 max-w-full">{photo.filename}</span>
                                    </div>
                                  ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-blue-50 px-1">
                                      <FileText size={18} className="text-blue-400" />
                                      <span className="text-[9px] text-gray-500 text-center break-all leading-tight line-clamp-2 mt-1">{photo.filename}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col items-center py-16 text-center px-4">
                  <Camera size={32} className="text-gray-300 mb-3" />
                  <p className="text-xs text-gray-400">Click the Photos tab to load from Drive.</p>
                </div>
              )}
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

      {/* Lightbox */}
      {lightbox && (
        <LightboxOverlay
          items={lightbox.items}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          imageUnavailable={ui.imageUnavailable}
          openDownload={ui.openDownload}
        />
      )}
    </>
  );
}
