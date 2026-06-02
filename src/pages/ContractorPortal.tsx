import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { ContractorAssignment, ContractorPhoto, DEFAULT_CONTRACTOR_UI_STRINGS, HEBREW_CONTRACTOR_UI_STRINGS } from '../types';
import { format, isPast, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns';
import {
  Camera, CheckCircle2, Clock, Building2, CalendarDays, FileText,
  Plus, Send, AlertCircle, X, Play, File as FileIcon, MapPin,
  BookOpen, Download, Paperclip, MessageSquare, CloudUpload,
  ChevronLeft, ChevronRight, Languages,
} from 'lucide-react';
import { BuildingDiagram } from '../components/diagram/BuildingDiagram';
import {
  extractFileId, drivePreviewUrl, driveDownloadUrl, driveThumbUrl,
  extractFolderId, isUploadBackendConfigured, findOrCreateFolderViaBackend,
  uploadFileViaResumableSession, shareFileToDrive,
} from '../data/driveApi';
import { isStorageConfigured, fsUploadFile } from '../data/firebase';

const CATEGORY_LABELS: Record<string, string> = {
  drywall: 'Drywall', ac: 'AC', general: 'General',
};
const CATEGORY_COLORS: Record<string, string> = {
  drywall: '#f59e0b', ac: '#3b82f6', general: '#10b981',
};

async function compressImage(file: File, maxPx = 1200, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          const scale = maxPx / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImageToBlob(file: File, maxPx = 1200, quality = 0.72): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          const scale = maxPx / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('Image compression failed')),
          'image/jpeg', quality,
        );
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function detectFileType(file: File): 'image' | 'video' | 'file' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

function getDueBadge(dueDate: string | null): { text: string; cls: string } | null {
  if (!dueDate) return null;
  const days = differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
  if (days < 0)  return { text: 'Overdue',   cls: 'text-red-600 bg-red-50 border-red-200' };
  if (days === 0) return { text: 'Today',     cls: 'text-orange-600 bg-orange-50 border-orange-200' };
  if (days === 1) return { text: 'Tomorrow',  cls: 'text-amber-700 bg-amber-50 border-amber-200' };
  if (days <= 3)  return { text: `${days} days`, cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' };
  return null;
}

function PhotoGallery({
  photos, initialIndex, onClose,
}: { photos: ContractorPhoto[]; initialIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const photo = photos[idx];
  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(photos.length - 1, i + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const type = photo.fileType ?? 'image';
  const imgSrc = photo.storageUrl
    || (photo.driveFileId ? driveThumbUrl(photo.driveFileId, 2000) : null)
    || (photo.dataUrl || null);
  const videoSrc = photo.storageUrl || photo.dataUrl || null;
  const downloadHref = photo.driveFileId
    ? `https://drive.google.com/uc?export=download&id=${photo.driveFileId}`
    : (photo.storageUrl || photo.dataUrl);

  return (
    <div
      className="fixed inset-0 z-[300] bg-black flex flex-col select-none"
      onTouchStart={e => setTouchStart(e.touches[0].clientX)}
      onTouchEnd={e => {
        if (touchStart === null) return;
        const d = touchStart - e.changedTouches[0].clientX;
        if (d > 60) next();
        else if (d < -60) prev();
        setTouchStart(null);
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 flex-shrink-0">
        <span className="text-white text-sm font-medium truncate max-w-[55%]">{photo.filename}</span>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-xs">{idx + 1} / {photos.length}</span>
          {downloadHref && (
            <a
              href={downloadHref}
              download={!photo.driveFileId && !photo.storageUrl ? photo.filename : undefined}
              target={photo.driveFileId || photo.storageUrl ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="p-1.5 text-gray-300 hover:text-white"
              title="Download"
            >
              <Download size={18} />
            </a>
          )}
          <button onClick={onClose} className="p-1.5 text-gray-300 hover:text-white">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Image / video */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden px-12">
        {type === 'image' && (
          imgSrc
            ? <img src={imgSrc} alt={photo.filename} className="max-w-full max-h-full object-contain" draggable={false} />
            : photo.driveUrl
              ? <a href={photo.driveUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline text-sm">View on Google Drive</a>
              : <div className="text-gray-500 text-sm">Image unavailable</div>
        )}
        {type === 'video' && (
          videoSrc
            ? <video src={videoSrc} controls className="max-w-full max-h-full" />
            : photo.driveUrl
              ? <a href={photo.driveUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 text-white">
                  <Play size={48} />
                  <span className="text-sm">Open video on Drive</span>
                </a>
              : null
        )}
        {type === 'file' && (
          <div className="flex flex-col items-center gap-4">
            <FileIcon size={56} className="text-blue-400" />
            <span className="text-white text-sm">{photo.filename}</span>
            {downloadHref && (
              <a href={downloadHref} target="_blank" rel="noopener noreferrer"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium">
                Open / Download
              </a>
            )}
          </div>
        )}
      </div>

      {/* Prev / Next arrows */}
      {idx > 0 && (
        <button onClick={prev}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white z-10">
          <ChevronLeft size={22} />
        </button>
      )}
      {idx < photos.length - 1 && (
        <button onClick={next}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white z-10">
          <ChevronRight size={22} />
        </button>
      )}

      {/* Dot indicators */}
      {photos.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-4 pt-2 flex-shrink-0">
          {photos.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`rounded-full transition-all ${i === idx ? 'w-4 h-2 bg-white' : 'w-2 h-2 bg-gray-600 hover:bg-gray-400'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaItem({ photo, onDelete, onOpen }: { photo: ContractorPhoto; onDelete: () => void; onOpen: () => void }) {
  const type = photo.fileType ?? 'image';
  // Thumbnail: Drive thumbnailURL (publicly shared) → Firebase Storage URL → base64
  const thumbSrc = photo.driveFileId
    ? driveThumbUrl(photo.driveFileId, 800)
    : (photo.storageUrl || (photo.dataUrl || null));

  return (
    <div className="relative rounded-xl overflow-hidden aspect-square bg-gray-100 cursor-pointer" onClick={onOpen}>
      {(type === 'image') && (
        thumbSrc
          ? <img src={thumbSrc} alt={photo.filename} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center"><Camera size={24} className="text-gray-300" /></div>
      )}
      {type === 'video' && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800">
          <Play size={28} className="text-white" />
          <span className="text-white text-[10px] mt-1 opacity-60 truncate px-2 max-w-full">{photo.filename}</span>
        </div>
      )}
      {type === 'file' && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-blue-50 px-2">
          <FileIcon size={24} className="text-blue-400 flex-shrink-0" />
          <span className="text-[10px] text-gray-600 mt-1.5 text-center break-all leading-tight line-clamp-3">{photo.filename}</span>
        </div>
      )}
      {/* Cloud / local badge */}
      {(photo.driveFileId || photo.storageUrl) ? (
        <div
          className={`absolute bottom-1 left-1 rounded-full w-3.5 h-3.5 flex items-center justify-center ${photo.storageUrl && !photo.driveFileId ? 'bg-blue-500' : 'bg-green-500'}`}
          title={photo.driveFileId ? 'Saved in Google Drive' : 'Saved in Firebase Storage'}
        >
          <CloudUpload size={8} className="text-white" />
        </div>
      ) : (
        <div
          className="absolute bottom-1 left-1 rounded-full w-3.5 h-3.5 flex items-center justify-center bg-amber-400"
          title="Saved locally only — not synced to cloud"
        >
          <AlertCircle size={8} className="text-white" />
        </div>
      )}
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center z-10"
      >
        <X size={12} className="text-white" />
      </button>
    </div>
  );
}

export function ContractorPortal() {
  const { token } = useParams<{ token: string }>();
  const {
    contractors, contractorAssignments, contractorNotes, contractorPhotos,
    apartments, stages,
    addContractorNote, addContractorPhoto, deleteContractorPhoto,
    updateContractorAssignment, addActivityLog,
    contractorUiStrings,
  } = useStore();

  const [langOverride, setLangOverride] = useState<'en' | 'he' | null>(null);
  const s = langOverride === 'en' ? DEFAULT_CONTRACTOR_UI_STRINGS
           : langOverride === 'he' ? HEBREW_CONTRACTOR_UI_STRINGS
           : contractorUiStrings;

  const [activeTab, setActiveTab] = useState<'tasks' | 'map'>('tasks');
  const [selectedAssignment, setSelectedAssignment] = useState<ContractorAssignment | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteAttachment, setNoteAttachment] = useState<{ dataUrl: string; filename: string; mimeType: string; driveFileId?: string; driveUrl?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [lightboxInfo, setLightboxInfo] = useState<{ photos: ContractorPhoto[]; index: number } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [mapFilter, setMapFilter] = useState<'all' | 'overdue' | 'today' | 'tomorrow' | 'week'>('all');
  const [showPlansPdf, setShowPlansPdf] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const noteAttachRef = useRef<HTMLInputElement>(null);

  const contractor = contractors.find(c => c.token === token && c.active) ?? null;

  if (!contractor) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ backgroundColor: '#0f1f35' }}>
        <img src="/tzviair-logo.png" alt="TzviAir" className="h-16 mb-8"
          style={{ filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.8)) drop-shadow(0 0 4px rgba(0,0,0,0.6))' }} />
        <div className="text-white text-xl font-semibold mb-2">{s.linkNotFound}</div>
        <p className="text-gray-400 text-sm text-center">{s.linkInvalid}</p>
      </div>
    );
  }

  const contractorId = contractor.id;
  const assignments = contractorAssignments.filter(a => a.contractorId === contractorId);
  const catColor = CATEGORY_COLORS[contractor.category] ?? '#6b7280';

  const getApt = (id: string) => apartments.find(a => a.id === id);
  const getStage = (id: string | null) => stages.find(s => s.id === id);
  const getMedia = (assignmentId: string) => contractorPhotos.filter(p => p.assignmentId === assignmentId);
  const getNotes = (assignmentId: string) => contractorNotes.filter(n => n.assignmentId === assignmentId);

  const assignedAptIds = new Set(assignments.map(a => a.apartmentId));

  const aptSubLabels = useMemo(() => {
    const m = new Map<string, string>();
    const today = startOfDay(new Date());
    [...assignments]
      .filter(a => !a.completedAt && a.dueDate)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
      .forEach(a => {
        if (m.has(a.apartmentId)) return;
        const days = differenceInCalendarDays(parseISO(a.dueDate!), today);
        const label =
          days < 0 ? s.filterOverdue :
          days === 0 ? s.filterToday :
          days === 1 ? s.filterTomorrow :
          format(parseISO(a.dueDate!), 'MMM d');
        m.set(a.apartmentId, label);
      });
    return m;
  }, [assignments, s]);

  const filteredAptIds = useMemo(() => {
    if (mapFilter === 'all') return assignedAptIds;
    const today = startOfDay(new Date());
    const matching = new Set<string>();
    assignments.forEach(a => {
      if (a.completedAt || !a.dueDate) return;
      const days = differenceInCalendarDays(parseISO(a.dueDate), today);
      if (mapFilter === 'overdue' && days < 0) matching.add(a.apartmentId);
      else if (mapFilter === 'today' && days === 0) matching.add(a.apartmentId);
      else if (mapFilter === 'tomorrow' && days === 1) matching.add(a.apartmentId);
      else if (mapFilter === 'week' && days >= 0 && days <= 7) matching.add(a.apartmentId);
    });
    return matching;
  }, [mapFilter, assignments]);

  async function handleMediaUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedAssignment || !e.target.files?.length) return;
    setUploading(true);
    setUploadError('');
    const LOCAL_MAX = 50 * 1024 * 1024;
    const apt = getApt(selectedAssignment.apartmentId);
    const backendOn = isUploadBackendConfigured();
    const mainFolderId = apt?.driveLink ? extractFolderId(apt.driveLink) : null;
    const canUseDrive = backendOn && !!mainFolderId;

    try {
      for (const file of Array.from(e.target.files)) {
        const fType = detectFileType(file);

        if (canUseDrive) {
          // ── Primary: Google Drive (resumable, no file size limit) ─────────
          setUploadProgress({ name: file.name, pct: 0 });
          try {
            const photosFolderId = await findOrCreateFolderViaBackend(mainFolderId!, 'Photos');
            const stageName = getStage(selectedAssignment.stageId)?.name ?? 'General';
            const stageFolderId = await findOrCreateFolderViaBackend(photosFolderId, stageName);
            const { fileId, webViewLink } = await uploadFileViaResumableSession(
              stageFolderId, file, pct => setUploadProgress({ name: file.name, pct }),
            );
            // Make publicly readable so thumbnail URLs work in <img> tags
            await shareFileToDrive(fileId);
            addContractorPhoto({
              assignmentId: selectedAssignment.id,
              apartmentId: selectedAssignment.apartmentId,
              contractorId,
              dataUrl: '',
              filename: file.name,
              fileType: fType,
              mimeType: file.type,
              fileSizeBytes: file.size,
              driveFileId: fileId,
              driveUrl: webViewLink,
            });
          } catch (err) {
            setUploadError(`"${file.name}" failed: ${(err as Error).message}`);
            continue;
          } finally {
            setUploadProgress(null);
          }

        } else if (isStorageConfigured) {
          // ── Fallback: Firebase Storage ────────────────────────────────────
          setUploadProgress({ name: file.name, pct: 0 });
          try {
            const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
            const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const path = `contractorPhotos/${selectedAssignment.id}/${uid}${ext ? '.' + ext : ''}`;
            const storageUrl = await fsUploadFile(path, file, pct => setUploadProgress({ name: file.name, pct }));
            addContractorPhoto({
              assignmentId: selectedAssignment.id,
              apartmentId: selectedAssignment.apartmentId,
              contractorId,
              dataUrl: '',
              filename: file.name,
              fileType: fType,
              mimeType: file.type,
              storageUrl,
              storagePath: path,
              fileSizeBytes: file.size,
            });
          } catch (err) {
            setUploadError(`"${file.name}" failed: ${(err as Error).message}`);
            continue;
          } finally {
            setUploadProgress(null);
          }

        } else {
          // ── Last resort: local base64 ─────────────────────────────────────
          if (file.size > LOCAL_MAX) {
            setUploadError(`"${file.name}" exceeds 50 MB — skipped.`);
            continue;
          }
          const dataUrl = fType === 'image' ? await compressImage(file) : await readAsDataUrl(file);
          addContractorPhoto({
            assignmentId: selectedAssignment.id,
            apartmentId: selectedAssignment.apartmentId,
            contractorId,
            dataUrl,
            filename: file.name,
            fileType: fType,
            mimeType: file.type,
          });
        }

        addActivityLog({
          apartmentId: selectedAssignment.apartmentId,
          apartmentNumber: apt?.apartmentNumber ?? '',
          buildingId: selectedAssignment.buildingId,
          userId: contractorId,
          userName: contractor!.name,
          actionType: 'contractor_upload',
          fieldChanged: 'photo_uploaded',
          previousValue: '',
          newValue: file.name,
          stageId: selectedAssignment.stageId ?? '',
        });
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (mediaInputRef.current) mediaInputRef.current.value = '';
    }
  }

  async function handleNoteAttachmentPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (noteAttachRef.current) noteAttachRef.current.value = '';
    const isImg = detectFileType(file) === 'image';
    const dataUrl = isImg ? await compressImage(file) : await readAsDataUrl(file);

    // Try Drive upload if backend is configured and the apartment has a Drive folder
    const apt = selectedAssignment ? getApt(selectedAssignment.apartmentId) : null;
    const mainFolderId = apt?.driveLink ? extractFolderId(apt.driveLink) : null;
    if (isUploadBackendConfigured() && mainFolderId) {
      try {
        const photosFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Photos');
        const notesFolderId = await findOrCreateFolderViaBackend(photosFolderId, 'Contractor Notes');
        const { fileId, webViewLink } = await uploadFileViaResumableSession(notesFolderId, file);
        await shareFileToDrive(fileId);
        setNoteAttachment({ dataUrl: isImg ? dataUrl : '', filename: file.name, mimeType: file.type, driveFileId: fileId, driveUrl: webViewLink });
        return;
      } catch { /* fall through to local */ }
    }
    setNoteAttachment({ dataUrl, filename: file.name, mimeType: file.type });
  }

  function handleSendNote() {
    if (!selectedAssignment || !noteText.trim()) return;
    const apt = getApt(selectedAssignment.apartmentId);
    addContractorNote({
      assignmentId: selectedAssignment.id,
      apartmentId: selectedAssignment.apartmentId,
      contractorId,
      text: noteText.trim(),
      authorType: 'contractor',
      authorId: contractorId,
      authorName: contractor?.name ?? '',
      ...(noteAttachment ? {
        attachmentDataUrl: noteAttachment.driveFileId ? '' : noteAttachment.dataUrl,
        attachmentFilename: noteAttachment.filename,
        attachmentMimeType: noteAttachment.mimeType,
        attachmentDriveFileId: noteAttachment.driveFileId,
        attachmentDriveUrl: noteAttachment.driveUrl,
      } : {}),
    });
    addActivityLog({
      apartmentId: selectedAssignment.apartmentId,
      apartmentNumber: apt?.apartmentNumber ?? '',
      buildingId: selectedAssignment.buildingId,
      userId: contractorId,
      userName: contractor!.name,
      actionType: 'contractor_note',
      fieldChanged: 'note_added',
      previousValue: '',
      newValue: noteText.trim().slice(0, 80),
      stageId: selectedAssignment.stageId ?? '',
    });
    setNoteText('');
    setNoteAttachment(null);
  }

  function handleComplete() {
    if (!selectedAssignment) return;
    if (getMedia(selectedAssignment.id).length === 0) return;
    setShowCompleteConfirm(true);
  }

  function handleConfirmComplete() {
    if (!selectedAssignment) return;
    const apt = getApt(selectedAssignment.apartmentId);
    const completedAt = new Date().toISOString();
    updateContractorAssignment(selectedAssignment.id, { completedAt });
    addActivityLog({
      apartmentId: selectedAssignment.apartmentId,
      apartmentNumber: apt?.apartmentNumber ?? '',
      buildingId: selectedAssignment.buildingId,
      userId: contractorId,
      userName: contractor!.name,
      actionType: 'contractor_complete',
      fieldChanged: 'completedAt',
      previousValue: '',
      newValue: completedAt,
      stageId: selectedAssignment.stageId ?? '',
    });
    setShowCompleteConfirm(false);
    setCompleting(true);
    setTimeout(() => setCompleting(false), 800);
  }

  function handleUncomplete() {
    if (!selectedAssignment) return;
    updateContractorAssignment(selectedAssignment.id, { completedAt: null });
  }

  function handleDiagramClick(apt: typeof apartments[0]) {
    const aptAssignments = assignments.filter(a => a.apartmentId === apt.id);
    if (aptAssignments.length === 0) return;
    setSelectedAssignment(aptAssignments.find(a => !a.completedAt) ?? aptAssignments[0]);
  }

  const selMedia = selectedAssignment ? getMedia(selectedAssignment.id) : [];
  const selNotes = selectedAssignment ? getNotes(selectedAssignment.id) : [];
  const selOfficeNotes = selNotes.filter(n => n.authorType === 'office');
  const selContractorNotes = selNotes.filter(n => n.authorType === 'contractor');
  const canComplete = selMedia.length > 0 && !selectedAssignment?.completedAt;

  const mapFilterLabels: Record<string, string> = {
    all: s.filterAll,
    overdue: s.filterOverdue,
    today: s.filterToday,
    tomorrow: s.filterTomorrow,
    week: s.filterThisWeek,
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f4f8' }} dir={s.isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 shadow-md flex-shrink-0" style={{ backgroundColor: '#0f1f35' }}>
        <img src="/tzviair-logo.png" alt="TzviAir" style={{ height: '32px', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9)) drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }} />
        <div className="flex items-center gap-2.5">
          {/* Language toggle — always visible */}
          <button
            onClick={() => setLangOverride(s.isRtl ? 'en' : 'he')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/25 text-white/80 hover:bg-white/10 active:bg-white/20 transition-colors text-xs font-bold tracking-wide"
            title={s.isRtl ? 'Switch to English' : 'עבור לעברית'}
          >
            <Languages size={14} />
            {s.isRtl ? 'EN' : 'עב'}
          </button>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: catColor + '22', color: catColor, border: `1px solid ${catColor}44` }}>
            {CATEGORY_LABELS[contractor.category]}
          </span>
          <div className={s.isRtl ? 'text-left' : 'text-right'}>
            <div className="text-white text-sm font-semibold">{contractor!.name}</div>
            <div className="text-gray-400 text-xs">
              {assignments.length} {assignments.length !== 1 ? s.taskPlural : s.taskSingular} · {assignments.filter(a => a.completedAt).length} {s.doneLabel}
            </div>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex bg-white border-b border-gray-200 flex-shrink-0">
        <button onClick={() => setActiveTab('tasks')}
          className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'tasks' ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]' : 'text-gray-500'
          }`}>
          <FileText size={15} /> {s.myTasks}
        </button>
        <button onClick={() => setActiveTab('map')}
          className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'map' ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]' : 'text-gray-500'
          }`}>
          <MapPin size={15} /> {s.buildingMap}
        </button>
      </div>

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <main className="flex-1 p-4 max-w-2xl mx-auto w-full">
          {assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                <FileText size={28} className="text-blue-400" />
              </div>
              <p className="text-gray-600 font-medium">{s.noAssignments}</p>
              <p className="text-gray-400 text-sm mt-1">{s.noAssignmentsHint}</p>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {assignments.map(a => {
                const apt = getApt(a.apartmentId);
                const stage = getStage(a.stageId);
                const media = getMedia(a.id);
                const notes = getNotes(a.id);
                const isOverdue = a.dueDate && !a.completedAt && isPast(parseISO(a.dueDate));
                const isDone = !!a.completedAt;
                const dueBadge = getDueBadge(a.dueDate);

                return (
                  <button key={a.id} onClick={() => setSelectedAssignment(a)}
                    className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 transition-all active:scale-[0.99] hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-[#1e3a5f] text-base">
                            Apt {apt?.displayName || apt?.apartmentNumber || '?'}
                          </span>
                          <span className="text-xs text-gray-400 font-medium">{a.buildingId}</span>
                          {stage && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: stage.color + '22', color: stage.color }}>
                              {stage.name}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{a.taskDescription}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {a.dueDate && (
                            <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                              <CalendarDays size={11} />
                              {format(parseISO(a.dueDate), 'MMM d, yyyy')}
                            </span>
                          )}
                          {dueBadge && !isDone && (
                            <span className={`text-xs px-1.5 py-0.5 rounded border font-semibold ${dueBadge.cls}`}>
                              {dueBadge.text}
                            </span>
                          )}
                          {media.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <Camera size={11} /> {media.length}
                            </span>
                          )}
                          {notes.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <FileText size={11} /> {notes.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 mt-1">
                        {isDone ? <CheckCircle2 size={22} className="text-green-500" /> : <Clock size={22} className="text-gray-300" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* Building Map tab */}
      {activeTab === 'map' && (
        <div className="flex-1 overflow-auto bg-gray-100 pb-4">
          {assignedAptIds.size === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <MapPin size={32} className="text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">{s.noApartmentsAssigned}</p>
            </div>
          ) : (
            <>
              <div className="px-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
                {(['all', 'overdue', 'today', 'tomorrow', 'week'] as const).map(f => (
                  <button key={f} onClick={() => setMapFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                      mapFilter === f
                        ? f === 'overdue' ? 'bg-red-500 text-white border-red-500'
                        : f === 'today'   ? 'bg-orange-500 text-white border-orange-500'
                        : f === 'tomorrow'? 'bg-amber-500 text-white border-amber-500'
                        : f === 'week'    ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}>
                    {mapFilterLabels[f]}
                  </button>
                ))}
                <span className="text-xs text-gray-400 ml-auto">
                  {filteredAptIds.size} apt{filteredAptIds.size !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="px-4 pb-1 text-xs text-gray-400">{s.mapHint}</p>
              <BuildingDiagram
                apartments={apartments}
                stages={stages}
                activeStageIds={[]}
                classFilter="all"
                searchQuery=""
                selectedBuilding="all"
                onApartmentClick={handleDiagramClick}
                showShinuiBadge={false}
                highlightedApartmentIds={filteredAptIds}
                aptSubLabels={aptSubLabels}
                compact
              />
            </>
          )}
        </div>
      )}

      {/* Assignment detail bottom sheet */}
      {selectedAssignment && (() => {
        const a = selectedAssignment;
        const apt = getApt(a.apartmentId);
        const stage = getStage(a.stageId);
        const isOverdue = a.dueDate && !a.completedAt && isPast(parseISO(a.dueDate));
        const dueBadge = getDueBadge(a.dueDate);
        const plansPdfFileId = apt?.plansPdfLink ? extractFileId(apt.plansPdfLink) : null;

        return (
          <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { setSelectedAssignment(null); setShowCompleteConfirm(false); }} />
            <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
              <div className="flex items-center justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1.5 rounded-full bg-gray-200" />
              </div>

              {/* Sheet header */}
              <div className="px-5 pb-3 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Building2 size={16} className="text-[#4aa8d8]" />
                      <span className="font-bold text-[#1e3a5f] text-lg">
                        Apt {apt?.displayName || apt?.apartmentNumber || '?'}
                      </span>
                      <span className="text-gray-400 text-sm">{a.buildingId}</span>
                    </div>
                    {stage && (
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ backgroundColor: stage.color + '22', color: stage.color, border: `1px solid ${stage.color}33` }}>
                        {stage.name}
                      </span>
                    )}
                  </div>
                  <button onClick={() => { setSelectedAssignment(null); setShowCompleteConfirm(false); }} className="p-1.5 rounded-full hover:bg-gray-100">
                    <X size={20} className="text-gray-500" />
                  </button>
                </div>
                {a.dueDate && (
                  <div className={`flex items-center gap-1.5 text-xs font-medium mt-2 ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
                    <CalendarDays size={13} />
                    {s.duePrefix} {format(parseISO(a.dueDate), 'MMMM d, yyyy')}
                    {dueBadge && !a.completedAt && (
                      <span className={`ml-1 px-1.5 py-0.5 rounded border font-semibold text-xs ${dueBadge.cls}`}>
                        {dueBadge.text}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ overscrollBehavior: 'contain' }}>
                {/* Task description */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{s.sectionTask}</h3>
                  <p className="text-gray-800 text-sm leading-relaxed">{a.taskDescription}</p>
                </div>

                {/* Office notes */}
                {apt?.generalNotes && (
                  <div className="px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MessageSquare size={12} className="text-blue-500" />
                      <span className="text-xs font-semibold text-blue-700">{s.fromOffice}</span>
                    </div>
                    <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-line">{apt.generalNotes}</p>
                  </div>
                )}

                {/* Engineering Plans PDF */}
                {plansPdfFileId && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <BookOpen size={12} /> {s.engineeringPlans}
                      </h3>
                      <div className="flex items-center gap-2">
                        <a href={driveDownloadUrl(plansPdfFileId)} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-[#1e3a5f] hover:underline">
                          <Download size={11} /> {s.download}
                        </a>
                        <button onClick={() => setShowPlansPdf(v => !v)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-[#1e3a5f] text-white font-medium">
                          {showPlansPdf ? s.hide : s.view}
                        </button>
                      </div>
                    </div>
                    <div
                      className="rounded-xl overflow-hidden border border-gray-200 cursor-pointer relative"
                      style={{ height: showPlansPdf ? '420px' : '160px' }}
                      onClick={() => setShowPlansPdf(v => !v)}
                    >
                      <iframe
                        src={drivePreviewUrl(plansPdfFileId)}
                        width="100%"
                        height={showPlansPdf ? '420' : '160'}
                        allow="autoplay"
                        title="Engineering Plans"
                        style={{ border: 'none', display: 'block', pointerEvents: showPlansPdf ? 'auto' : 'none' }}
                      />
                      {!showPlansPdf && (
                        <div className="absolute inset-0 flex items-end justify-center pb-2 bg-gradient-to-t from-black/20 to-transparent">
                          <span className="text-white text-xs font-medium bg-black/40 px-2 py-0.5 rounded">{s.tapToExpand}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Completion status */}
                {a.completedAt && (
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-green-50 rounded-xl border border-green-200">
                    <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-green-700">{s.completed}</div>
                      <div className="text-xs text-green-600">{format(new Date(a.completedAt), 'MMM d, yyyy · HH:mm')}</div>
                    </div>
                    <button onClick={handleUncomplete} className="ml-auto text-xs text-gray-400 hover:text-gray-600">{s.undo}</button>
                  </div>
                )}

                {/* Media */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {s.filesAndPhotos} ({selMedia.length})
                    </h3>
                    <button
                      onClick={() => mediaInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all active:scale-95"
                      style={{ backgroundColor: '#1e3a5f' }}
                    >
                      <Plus size={14} />
                      {uploading ? s.uploading : s.addFile}
                    </button>
                    <input ref={mediaInputRef} type="file"
                      accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                      multiple className="hidden" onChange={handleMediaUpload} />
                  </div>

                  {uploadProgress && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span className="flex items-center gap-1.5 truncate">
                          <CloudUpload size={13} className="flex-shrink-0 text-[#4aa8d8]" />
                          <span className="truncate">{uploadProgress.name}</span>
                        </span>
                        <span className="flex-shrink-0 ml-2 font-medium">{uploadProgress.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-[#4aa8d8] transition-all duration-150"
                          style={{ width: `${uploadProgress.pct}%` }} />
                      </div>
                    </div>
                  )}

                  {uploadError && (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-3 border border-amber-200">
                      <AlertCircle size={13} className="flex-shrink-0" /> {uploadError}
                    </div>
                  )}

                  {selMedia.length === 0 ? (
                    <button onClick={() => mediaInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-[#4aa8d8] hover:text-[#4aa8d8] transition-all">
                      <Camera size={28} />
                      <span className="text-sm font-medium">{s.tapToAddMedia}</span>
                      <span className="text-xs">{s.requiredBeforeComplete}</span>
                    </button>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {selMedia.map((m, i) => (
                        <MediaItem
                          key={m.id}
                          photo={m}
                          onDelete={() => deleteContractorPhoto(m.id)}
                          onOpen={() => setLightboxInfo({ photos: selMedia, index: i })}
                        />
                      ))}
                      <button onClick={() => mediaInputRef.current?.click()}
                        className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center hover:border-[#4aa8d8] transition-all">
                        <Plus size={20} className="text-gray-400" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <MessageSquare size={12} /> {s.sectionNotes}
                  </h3>

                  {selOfficeNotes.length > 0 && (
                    <div className="mb-3 space-y-2">
                      <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">{s.fromOffice}</p>
                      {selOfficeNotes.map(n => (
                        <div key={n.id} className="px-3 py-2.5 rounded-xl text-sm bg-blue-50 border border-blue-100">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-semibold text-gray-600">{n.authorName}</span>
                            <span className="text-[10px] text-gray-400 ml-auto">{format(new Date(n.createdAt), 'MMM d, HH:mm')}</span>
                          </div>
                          <p className="text-gray-700 leading-relaxed">{n.text}</p>
                          {(n.attachmentDataUrl || n.attachmentDriveFileId) && (() => {
                            const isImg = n.attachmentMimeType?.startsWith('image/');
                            const thumbSrc = n.attachmentDriveFileId
                              ? driveThumbUrl(n.attachmentDriveFileId, 400)
                              : (isImg ? n.attachmentDataUrl : null);
                            const openHref = n.attachmentDriveUrl || n.attachmentDataUrl;
                            return (
                              <div className="mt-1.5">
                                {isImg && thumbSrc ? (
                                  <a href={openHref} target="_blank" rel="noopener noreferrer" className="block">
                                    <img src={thumbSrc} alt={n.attachmentFilename} className="max-h-32 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity" />
                                  </a>
                                ) : (
                                  <a href={openHref} target={n.attachmentDriveUrl ? '_blank' : undefined}
                                    download={!n.attachmentDriveUrl ? n.attachmentFilename : undefined}
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-[#1e3a5f] hover:underline">
                                    <Paperclip size={10} /> {n.attachmentFilename}
                                  </a>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}

                  {selContractorNotes.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {selOfficeNotes.length > 0 && <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{s.yourNotes}</p>}
                      {selContractorNotes.map(n => (
                        <div key={n.id} className="px-3 py-2.5 rounded-xl text-sm bg-gray-50 border border-gray-100">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-semibold text-gray-600">{n.authorName}</span>
                            <span className="text-[10px] text-gray-400 ml-auto">{format(new Date(n.createdAt), 'MMM d, HH:mm')}</span>
                          </div>
                          <p className="text-gray-700 leading-relaxed">{n.text}</p>
                          {(n.attachmentDataUrl || n.attachmentDriveFileId) && (() => {
                            const isImg = n.attachmentMimeType?.startsWith('image/');
                            const thumbSrc = n.attachmentDriveFileId
                              ? driveThumbUrl(n.attachmentDriveFileId, 400)
                              : (isImg ? n.attachmentDataUrl : null);
                            const openHref = n.attachmentDriveUrl || n.attachmentDataUrl;
                            return (
                              <div className="mt-1.5">
                                {isImg && thumbSrc ? (
                                  <a href={openHref} target="_blank" rel="noopener noreferrer" className="block">
                                    <img src={thumbSrc} alt={n.attachmentFilename} className="max-h-32 rounded-lg object-cover border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity" />
                                  </a>
                                ) : (
                                  <a href={openHref} target={n.attachmentDriveUrl ? '_blank' : undefined}
                                    download={!n.attachmentDriveUrl ? n.attachmentFilename : undefined}
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-[#1e3a5f] hover:underline">
                                    <Paperclip size={10} /> {n.attachmentFilename}
                                  </a>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}

                  {noteAttachment && (
                    <div className="mb-2">
                      {noteAttachment.mimeType.startsWith('image/') && noteAttachment.dataUrl ? (
                        <div className="relative inline-block">
                          <img
                            src={noteAttachment.dataUrl}
                            alt={noteAttachment.filename}
                            className="max-h-28 rounded-xl object-cover border border-gray-200"
                          />
                          <button
                            onClick={() => setNoteAttachment(null)}
                            className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                          ><X size={11} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
                          <Paperclip size={11} />
                          <span className="flex-1 truncate">{noteAttachment.filename}</span>
                          <button onClick={() => setNoteAttachment(null)} className="text-blue-400 hover:text-blue-600"><X size={12} /></button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 items-end">
                    <button
                      onClick={() => noteAttachRef.current?.click()}
                      className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-[#1e3a5f] hover:border-[#1e3a5f] transition-all flex-shrink-0"
                      title="Attach file"
                    >
                      <Paperclip size={15} />
                    </button>
                    <input ref={noteAttachRef} type="file"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                      className="hidden" onChange={handleNoteAttachmentPick} />
                    <input
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendNote()}
                      placeholder={s.addNote}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    />
                    <button onClick={handleSendNote} disabled={!noteText.trim()}
                      className="w-10 h-10 flex items-center justify-center rounded-xl text-white disabled:opacity-40 transition-all active:scale-95 flex-shrink-0"
                      style={{ backgroundColor: '#1e3a5f' }}>
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Complete button — sticky */}
              <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
                {!a.completedAt && (
                  <>
                    {selMedia.length === 0 && (
                      <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">
                        <AlertCircle size={14} />
                        {s.addMediaBeforeComplete}
                      </div>
                    )}

                    {showCompleteConfirm ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-800 text-center">{s.markCompletePrompt}</p>
                        <p className="text-xs text-gray-500 text-center">{s.markCompleteHint}</p>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => setShowCompleteConfirm(false)}
                            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                            {s.cancel}
                          </button>
                          <button onClick={handleConfirmComplete}
                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                            style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                            <CheckCircle2 size={16} /> {s.confirmComplete}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={handleComplete}
                        disabled={!canComplete || completing}
                        className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        style={{
                          background: canComplete ? 'linear-gradient(135deg, #22c55e, #16a34a)' : undefined,
                          backgroundColor: !canComplete ? '#e5e7eb' : undefined,
                          color: canComplete ? 'white' : '#9ca3af',
                        }}
                      >
                        <CheckCircle2 size={18} />
                        {completing ? s.markingComplete : s.markAsComplete}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {/* Full-screen photo gallery lightbox */}
      {lightboxInfo && (
        <PhotoGallery
          photos={lightboxInfo.photos}
          initialIndex={lightboxInfo.index}
          onClose={() => setLightboxInfo(null)}
        />
      )}
    </div>
  );
}
