import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { X, Save, Building2, AlertTriangle, Link, Unlink, ExternalLink, BookOpen, Download, Eye, EyeOff, Activity, RefreshCw, Paperclip, Trash2, ChevronDown, ChevronRight, ClipboardList, CheckCircle2, CalendarDays, FileText, UserCheck, Plus, Camera, Play, ChevronLeft, FolderOpen, Clock, RotateCcw, Edit2, BarChart3, PenLine, Maximize2, Printer } from 'lucide-react';
import { Apartment, User, getStageName, TaskAttachment, TaskPriority, aptLabel } from '../../types';
import { useStore } from '../../data/store';
import { format, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns';
import { StageNotesSection } from './StageNotesSection';
import { ActivitySection } from './ActivitySection';
import { extractFileId, drivePreviewUrl, driveDownloadUrl, findPlansPdfViaBackend, findAllPlansPdfsViaBackend, findPlanSetViaBackend, PlanEntry, isUploadBackendConfigured, findOrCreateFolderViaBackend, uploadFileViaResumableSession, shareFileToDrive, extractFolderId, driveThumbUrl, listAllPhotosViaBackend, getFolderNameViaBackend, familyNameFromFolderName, DrivePhotoItem, DriveFile, FolderHealth, checkFolderHealthViaBackend } from '../../data/driveApi';
import { Tooltip } from '../ui/Tooltip';
import { DriveStatus } from '../ui/DriveStatus';
import { printSheet, printEsc } from '../../data/printing';
import { PlanPinOverlay } from './PlanPinOverlay';
// Lazy, deliberately. The markup studio carries pdf.js — about a megabyte of
// PDF engine — and nobody should pay for that on the login screen. It arrives
// the moment someone presses "Mark up", and not before.
const PlanAnnotator = lazy(() =>
  import('../plans/PlanAnnotator').then(m => ({ default: m.PlanAnnotator })));
import { ContractorStatusPanel } from './ContractorStatusPanel';

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

function LightboxOverlay({ items, initialIndex, onClose, imageUnavailable, openDownload, downloadLabel }: { items: LightboxItem[]; initialIndex: number; onClose: () => void; imageUnavailable: string; openDownload: string; downloadLabel: string }) {
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
              className="p-1.5 text-gray-300 hover:text-white" title={downloadLabel}>
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
    contractorAssignments, contractors, updateContractorAssignment, deleteContractorAssignment,
    deleteApartment, getGeneralNoteVersions, currentProjectId,
    contractorPhotos, updateContractorPhoto, planAnnotations, stageNotes, planPins } = useStore();
  const isGeneralProject = currentProjectId === 'general';
  const backendConfigured = isUploadBackendConfigured();
  const officeFileRef = useRef<HTMLInputElement>(null);
  const taskEditFileRef = useRef<HTMLInputElement>(null);

  const [familyName, setFamilyName] = useState('');
  const [currentStageId, setCurrentStageId] = useState<string>('');
  const [classification, setClassification] = useState<'standard' | 'shinui'>('standard');
  const [generalNotes, setGeneralNotes] = useState('');
  const [generalNotesHistoryOpen, setGeneralNotesHistoryOpen] = useState(false);
  const [driveLink, setDriveLink] = useState('');
  const [plansPdfLink, setPlansPdfLink] = useState('');
  const [zohoLinkLocal, setZohoLinkLocal] = useState('');
  const [addressLocal, setAddressLocal] = useState('');
  const [mergedWithId, setMergedWithId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details' | 'tasks' | 'stages' | 'history' | 'photos'>('details');
  const [drivePhotos, setDrivePhotos] = useState<DrivePhotoItem[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [lightbox, setLightbox] = useState<{ items: { fileId: string; filename: string; mimeType: string; thumbSrc: string; downloadHref: string }[]; index: number } | null>(null);
  const [officeUploadPct, setOfficeUploadPct] = useState<number | null>(null);
  const [showUnmergeModal, setShowUnmergeModal] = useState(false);
  /** Drive folder health, checked once when the Photos tab is opened. */
  const [folderHealth, setFolderHealth] = useState<FolderHealth | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showContractorStatus, setShowContractorStatus] = useState(false);
  const [unmergeTarget, setUnmergeTarget] = useState<Apartment | null>(null);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  /** null = closed, 'draw' = markup studio, 'view' = same studio read-only. */
  const [annotating, setAnnotating] = useState<null | 'draw' | 'view'>(null);
  /**
   * Every plan on this job: the originals from the Engineered Plans folder and
   * the markups from its "Annotated Plans" child. Only those two levels — the
   * plans folder often has other subfolders whose PDFs nobody wants in the row.
   */
  const [planSet, setPlanSet] = useState<{ plansFolderId: string | null; plans: PlanEntry[] }>(
    { plansFolderId: null, plans: [] });
  /** Which chip is showing — an id from planSet, or null for the detected default. */
  const [shownPlanId, setShownPlanId] = useState<string | null>(null);
  /** The plan pane beside the fields — off when there is no plan to show. */
  const [planWanted, setPlanWanted] = useState(true);
  const [showHealthCheck, setShowHealthCheck] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fetchingPdf, setFetchingPdf] = useState(false);
  const [availablePdfs, setAvailablePdfs] = useState<DriveFile[]>([]);
  const [selectedPdfIdx, setSelectedPdfIdx] = useState(0);
  const [stageChangeModal, setStageChangeModal] = useState<{ newStageId: string; newStageName: string } | null>(null);
  const [prevStageId, setPrevStageId] = useState<string>('');
  const [drawerEditingTaskId, setDrawerEditingTaskId] = useState<string | null>(null);
  const [drawerEditFields, setDrawerEditFields] = useState<{ taskDescription: string; dueDate: string; stageId: string; priority: string }>({ taskDescription: '', dueDate: '', stageId: '', priority: '' });
  const [drawerEditAttachments, setDrawerEditAttachments] = useState<TaskAttachment[]>([]);
  const [drawerEditProgress, setDrawerEditProgress] = useState<number | null>(null);
  const [keepHistoryModal, setKeepHistoryModal] = useState(false);

  useEffect(() => {
    if (apartment) {
      setFamilyName(apartment.displayName || '');
      setCurrentStageId(apartment.currentStageId ?? '');
      setPrevStageId(apartment.currentStageId ?? '');
      setClassification(apartment.classification);
      setGeneralNotes(apartment.generalNotes);
      setDriveLink(apartment.driveLink ?? '');
      setPlansPdfLink(apartment.plansPdfLink ?? '');
      setZohoLinkLocal(apartment.zohoLink ?? '');
      setAddressLocal(apartment.address ?? '');
      setMergedWithId(apartment.mergedWith ?? '');
      setShowPdfViewer(false);
      setShowHealthCheck(false);
      setShowSettings(false);
      setActiveTab('details');
      setDrivePhotos([]);
      setPhotosLoaded(false);
      setLightbox(null);
      const existingFileId = apartment.plansPdfLink ? extractFileId(apartment.plansPdfLink) : null;
      setAvailablePdfs(existingFileId ? [{ id: existingFileId, name: '', mimeType: 'application/pdf' }] : []);
      setSelectedPdfIdx(0);
      setPlanSet({ plansFolderId: null, plans: [] });
      setShownPlanId(null);

      if (apartment.driveLink && backendConfigured) {
        // One scan gets the originals, the markups and the folder a new markup
        // has to be filed into.
        findPlanSetViaBackend(apartment.driveLink).then(setPlanSet).catch(() => {});
      }

      if (!existingFileId && apartment.driveLink && backendConfigured) {
        setFetchingPdf(true);
        findAllPlansPdfsViaBackend(apartment.driveLink).then(pdfs => {
          setAvailablePdfs(pdfs);
          setSelectedPdfIdx(0);
          if (pdfs.length > 0 && currentUser) {
            const link = `https://drive.google.com/file/d/${pdfs[0].id}/view`;
            setPlansPdfLink(link);
            updateApartment(apartment.id, { plansPdfLink: link }, currentUser);
          }
        }).finally(() => setFetchingPdf(false));
      }
    }
  }, [apartment?.id]);

  if (!apartment) return null;

  const detectedPdfId = availablePdfs[selectedPdfIdx]?.id ?? null;

  // Saved markup versions of the plan currently selected, so the drawer can
  // show how many there are and link straight to the newest PDF.
  const planVersions = detectedPdfId
    ? planAnnotations
        .filter(a => a.apartmentId === apartment.id && a.planFileId === detectedPdfId)
        .sort((a, b) => b.version - a.version)
    : [];
  const latestPlanVersion = planVersions[0];
  /** Only split the window when there is actually a plan to put on the right. */
  const planPaneOn = planWanted && !!detectedPdfId;
  const setPlanPaneOn = setPlanWanted;
  const planVersionCount = planVersions.length ? planVersions[0].version : 0;

  const sortedStages = [...stages]
    // EXCLUSIVE per project. The old filter was
    //   (!s.projectId || (isGeneral && s.projectId === 'general'))
    // which in General showed General's stages PLUS the shared ones — the
    // reported stage mixing. Every other page already filters exclusively.
    .filter(s => s.active && (isGeneralProject ? s.projectId === 'general' : !s.projectId))
    .sort((a, b) => a.order - b.order);
  const currentStage = stages.find(s => s.id === currentStageId);
  const aptLogs = activityLogs.filter(l => l.apartmentId === apartment.id).slice(0, 20);

  /**
   * A job sheet somebody can take out of the office.
   *
   * Everything a person standing in the apartment needs and nothing they do
   * not: where it is, what stage it is at, what is outstanding, what the office
   * has written down, and the links to the Drive folder and the plan. Built as
   * a document rather than printing the drawer, which would give a screenshot
   * of a modal.
   */
  function printJobSheet() {
    const e = printEsc;
    const tasks = contractorAssignments
      .filter(a => a.apartmentId === apartment!.id)
      .sort((a, b) => (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0)
        || (a.dueDate ?? "z").localeCompare(b.dueDate ?? "z"));
    const notes = stageNotes.filter(nt => nt.apartmentId === apartment!.id);
    const pins = planPins.filter(pn => pn.apartmentId === apartment!.id);

    const row = (k: string, v: string) => v
      ? `<tr><td style="width:120px;color:#6b7280;font-size:10.5px">${e(k)}</td><td><b>${e(v)}</b></td></tr>`
      : "";

    const body = `
      <table style="margin-bottom:14px">
        ${row(isGeneralProject ? "Job" : "Apartment", isGeneralProject ? (apartment!.displayName || "Job") : aptLabel(apartment!))}
        ${row("Building", isGeneralProject ? "" : apartment!.buildingId)}
        ${row("Address", apartment!.address ?? "")}
        ${row("Stage", currentStage ? getStageName(currentStage, !!ui.isRtl) : "Not started")}
        ${row("Type", isGeneralProject ? "" : (classification === "shinui" ? ui.chgShort : "Standard"))}
        ${row("Drive folder", apartment!.driveLink ?? "")}
        ${row("Plan", apartment!.plansPdfLink ?? "")}
        ${row("Latest markup", latestPlanVersion?.driveUrl
          ? `Version ${latestPlanVersion.version} — ${latestPlanVersion.driveUrl}` : "")}
      </table>

      <h2 style="font-size:13px;margin:14px 0 6px;color:#1e3a5f">Tasks (${tasks.length})</h2>
      ${tasks.length ? `<table><thead><tr>
          <th>Task</th><th style="width:110px">Contractor</th>
          <th style="width:80px">Due</th><th style="width:64px">Status</th></tr></thead><tbody>
        ${tasks.map(t => `<tr>
          <td>${e(t.taskDescription || "—")}</td>
          <td>${e(contractors.find(c => c.id === t.contractorId)?.name ?? "—")}</td>
          <td>${t.dueDate ? e(format(parseISO(t.dueDate), "d MMM")) : "—"}</td>
          <td>${t.completedAt ? "Done" : "Open"}</td></tr>`).join("")}
      </tbody></table>` : `<p class="muted">No tasks.</p>`}

      ${pins.length ? `<h2 style="font-size:13px;margin:14px 0 6px;color:#1e3a5f">Punch list (${pins.filter(pn => !pn.resolvedAt).length} open)</h2>
        <table><thead><tr><th style="width:26px">#</th><th>Item</th><th style="width:70px">On plan</th><th style="width:56px">Status</th></tr></thead><tbody>
        ${pins.map((pn, i) => `<tr><td><b>${i + 1}</b></td><td>${e(pn.text || "—")}</td>
          <td class="muted">${pn.xPct.toFixed(0)}% / ${pn.yPct.toFixed(0)}%</td>
          <td>${pn.resolvedAt ? "Done" : "Open"}</td></tr>`).join("")}
      </tbody></table>` : ""}

      ${apartment!.generalNotes ? `<h2 style="font-size:13px;margin:14px 0 6px;color:#1e3a5f">Office notes</h2>
        <div class="card" style="white-space:pre-wrap">${e(apartment!.generalNotes)}</div>` : ""}

      ${notes.length ? `<h2 style="font-size:13px;margin:14px 0 6px;color:#1e3a5f">Stage notes</h2>
        ${notes.map(nt => {
          const st = stages.find(x => x.id === nt.stageId);
          return `<div class="card"><h3>${e(st ? getStageName(st, !!ui.isRtl) : "Stage")}</h3>
            <div style="white-space:pre-wrap">${e(nt.noteText || "—")}</div></div>`;
        }).join("")}` : ""}

      <h2 style="font-size:13px;margin:16px 0 6px;color:#1e3a5f">Notes on site</h2>
      <div style="border:1px solid #d1d5db;border-radius:8px;height:130px"></div>
    `;

    printSheet(
      isGeneralProject ? (apartment!.displayName || "Job sheet") : `${aptLabel(apartment!)} — job sheet`,
      body,
      { rtl: !!ui.isRtl, subtitle: apartment!.address || (isGeneralProject ? "" : apartment!.buildingId) },
    );
  }

  // Connect-unit picker: one entry per apartment NUMBER in this building.
  // Duplicate records (same number, different id) would otherwise flood the list.
  const sameBuildingApts = Array.from(
    apartments
      .filter(a =>
        a.buildingId === apartment.buildingId
        && a.id !== apartment.id
        && !a.isUnnamed
        && !!a.apartmentNumber?.trim())
      .reduce((m, a) => m.has(a.apartmentNumber.trim()) ? m : m.set(a.apartmentNumber.trim(), a),
              new Map<string, typeof apartments[0]>())
      .values(),
  ).sort((a, b) => (Number(a.apartmentNumber) || 0) - (Number(b.apartmentNumber) || 0));
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

  function startTaskEdit(task: (typeof aptTasks)[0]) {
    setDrawerEditingTaskId(task.id);
    setDrawerEditFields({
      taskDescription: task.taskDescription,
      dueDate: task.dueDate ?? '',
      stageId: task.stageId ?? '',
      priority: task.priority ?? '',
    });
    setDrawerEditAttachments(task.attachments ?? []);
  }

  function saveTaskEdit() {
    if (!drawerEditingTaskId) return;
    updateContractorAssignment(drawerEditingTaskId, {
      taskDescription: drawerEditFields.taskDescription,
      dueDate: drawerEditFields.dueDate || null,
      stageId: drawerEditFields.stageId || null,
      priority: (drawerEditFields.priority as TaskPriority) || undefined,
      attachments: drawerEditAttachments.length > 0 ? drawerEditAttachments : undefined,
    });
    setDrawerEditingTaskId(null);
    setDrawerEditAttachments([]);
    onToast(ui.saveChanges);
  }

  async function handleTaskEditFileChosen(file: File) {
    const isImage = file.type.startsWith('image/');
    let processed = file;
    if (isImage) {
      processed = await new Promise<File>(resolve => {
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
          canvas.toBlob(blob => resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file), 'image/jpeg', 0.72);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      });
    }
    const id = crypto.randomUUID();
    if (backendConfigured && apartment?.driveLink) {
      try {
        const mainFolderId = extractFolderId(apartment.driveLink);
        if (mainFolderId) {
          setDrawerEditProgress(1);
          const tasksFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Tasks');
          const { fileId, webViewLink } = await uploadFileViaResumableSession(tasksFolderId, processed, pct => setDrawerEditProgress(pct));
          await shareFileToDrive(fileId);
          setDrawerEditProgress(null);
          setDrawerEditAttachments(prev => [...prev, { id, filename: processed.name, mimeType: processed.type, dataUrl: '', driveFileId: fileId, driveUrl: webViewLink }]);
          return;
        }
      } catch {
        setDrawerEditProgress(null);
      }
    }
    const reader = new FileReader();
    reader.onload = ev => {
      setDrawerEditAttachments(prev => [...prev, { id, filename: processed.name, mimeType: processed.type, dataUrl: ev.target?.result as string ?? '' }]);
    };
    reader.readAsDataURL(processed);
  }

  function handleSaveBasic() {
    if (!currentStageId && prevStageId) {
      setKeepHistoryModal(true);
      return;
    }
    doSaveBasic(false);
  }

  // `explicitStageId` is needed when called straight from the stage <select>'s
  // onChange — React hasn't flushed setCurrentStageId yet at that point.
  function doSaveBasic(clearHistory: boolean, explicitStageId?: string) {
    setKeepHistoryModal(false);
    const stageId = explicitStageId !== undefined ? explicitStageId : currentStageId;
    const stageChanged = stageId !== prevStageId;
    updateApartment(apartment!.id, {
      displayName: familyName || apartment!.apartmentNumber,
      currentStageId: stageId || null,
      classification,
      generalNotes,
      driveLink: driveLink.trim() || undefined,
      plansPdfLink: plansPdfLink.trim() || undefined,
      zohoLink: zohoLinkLocal.trim() || undefined,
      address: addressLocal.trim() || undefined,
      ...(clearHistory ? { stageDates: {} } : {}),
    }, currentUser);
    setPrevStageId(stageId);
    if (stageChanged && stageId && onRequestAddTask) {
      const newStageName = stages.find(s => s.id === stageId)?.name ?? '';
      setStageChangeModal({ newStageId: stageId, newStageName });
    } else {
      onToast(ui.apartmentSaved);
    }
  }

  // Stage picker saves the moment it changes. Clearing the stage still has to ask
  // whether to keep the stage-date history, so that modal now fires on change.
  function handleStageChange(newStageId: string) {
    setCurrentStageId(newStageId);
    if (!newStageId && prevStageId) {
      setKeepHistoryModal(true);
      return;
    }
    doSaveBasic(false, newStageId);
  }

  // Classification is a single targeted write — no other field is touched.
  function handleClassificationChange(v: 'standard' | 'shinui') {
    setClassification(v);
    if (v !== apartment!.classification) {
      updateApartment(apartment!.id, { classification: v }, currentUser);
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
      zohoLink: zohoLinkLocal.trim() || undefined,
      address: addressLocal.trim() || undefined,
    }, currentUser);
    setPrevStageId(currentStageId);
  }

  // Drive folders are named "Artzi, Avital - 1234 - …" — pull everything before the
  // first " -" into the family name whenever a new folder link is saved.
  async function autoFillFamilyNameFromFolder(folderId: string) {
    if (isGeneralProject) return;
    const folderName = await getFolderNameViaBackend(folderId);
    if (!folderName) return;
    const derived = familyNameFromFolderName(folderName);
    if (!derived || derived === familyName) return;
    setFamilyName(derived);
    updateApartment(apartment!.id, { displayName: derived }, currentUser);
    onToast(`${ui.familyName}: ${derived}`);
  }

  function handleSaveMerge() {
    if (!mergedWithId && mergedPartner) {
      setUnmergeTarget(mergedPartner);
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
    setUnmergeTarget(null);
    unmergeApartments(apartment!.id, keepDataAptId, currentUser);
    setMergedWithId('');
    onToast(ui.apartmentUnlinked);
  }

  return (
    <>
      {/* Stage-change → assign task modal */}
      {stageChangeModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[130]" />
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

      {/* Keep stage history modal (shown when resetting apartment to Not Started) */}
      {keepHistoryModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[130]" />
          <div className="fixed z-[70] bg-white rounded-2xl shadow-2xl p-6" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(380px, 90vw)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Clock size={18} className="text-amber-500" />
              <h3 className="font-bold text-gray-900 text-base">Reset to Not Started</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Keep the stage completion history (dates when each stage was reached)?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => doSaveBasic(true)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                No, clear history
              </button>
              <button
                onClick={() => doSaveBasic(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5 bg-[#1e3a5f]"
              >
                Yes, keep history
              </button>
            </div>
          </div>
        </>
      )}

      {/* Unmerge modal */}
      {showUnmergeModal && unmergeTarget && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[130]" onClick={() => { setShowUnmergeModal(false); setUnmergeTarget(null); }} />
          <div className="fixed z-[70] bg-white rounded-2xl shadow-2xl p-6" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(400px, 90vw)' }}>
            <h3 className="font-bold text-gray-900 mb-1 text-base">{ui.unlinkApartments}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {ui.unmergeQuestion}
            </p>
            <div className="space-y-2">
              <button onClick={() => handleConfirmUnmerge(apartment.id)}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all">
                <div className="font-medium text-sm text-gray-800">{ui.aptPrefix} {apartment.displayName || apartment.apartmentNumber} {ui.keepsData}</div>
                <div className="text-xs text-gray-400 mt-0.5">{ui.aptPrefix} {unmergeTarget.displayName || unmergeTarget.apartmentNumber} — {ui.stageWillBeCleared}</div>
              </button>
              <button onClick={() => handleConfirmUnmerge(unmergeTarget.id)}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all">
                <div className="font-medium text-sm text-gray-800">{ui.aptPrefix} {unmergeTarget.displayName || unmergeTarget.apartmentNumber} {ui.keepsData}</div>
                <div className="text-xs text-gray-400 mt-0.5">{ui.aptPrefix} {apartment.displayName || apartment.apartmentNumber} — {ui.stageWillBeCleared}</div>
              </button>
              <button onClick={() => handleConfirmUnmerge('both')}
                className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-[#1e3a5f] transition-all">
                <div className="font-medium text-sm text-gray-800">{ui.bothKeepData}</div>
                <div className="text-xs text-gray-400 mt-0.5">{ui.justRemovesLink}</div>
              </button>
            </div>
            <button onClick={() => { setShowUnmergeModal(false); setUnmergeTarget(null); }} className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700">{ui.cancel}</button>
          </div>
        </>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (() => {
        const aptTaskCount = contractorAssignments.filter(a => a.apartmentId === apartment.id).length;
        const label = apartment.displayName || apartment.apartmentNumber || apartment.id;
        return (
          <>
            <div className="fixed inset-0 bg-black/50 z-[130]" onClick={() => setShowDeleteConfirm(false)} />
            <div className="fixed z-[70] bg-white rounded-2xl shadow-2xl p-6 text-center"
              style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(360px, 90vw)' }}>
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={22} className="text-red-500" />
              </div>
              <h3 className="font-bold text-gray-900 text-base mb-1">
                {isGeneralProject ? ui.deleteJobConfirm : `${ui.deleteApartmentLabel}?`}
              </h3>
              <p className="text-sm font-medium text-gray-700 mb-2">"{label}"</p>
              {aptTaskCount > 0 && (
                <p className="text-sm text-gray-600 mb-1">
                  <span className="font-semibold text-red-600">{aptTaskCount} task{aptTaskCount !== 1 ? 's' : ''}</span>{' '}
                  and all associated notes will also be permanently deleted.
                </p>
              )}
              <p className="text-xs text-gray-400 mb-5">This cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {ui.cancel}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    onClose();
                    deleteApartment(apartment.id);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </>
        );
      })()}

      {showContractorStatus && (
        <ContractorStatusPanel apartment={apartment} onClose={() => setShowContractorStatus(false)} />
      )}

      {/* Centred modal, not a side drawer. Roughly twice the usable width and it
          no longer squeezes the board or diagram behind it. Applies to every
          project — Job Board, Wolfson, Netiv and anything added later. */}
      <div className="drawer-overlay fixed inset-0 bg-black/50 z-[110]" onClick={onClose} />

      <div
        className="drawer-panel fixed bg-white shadow-2xl z-[120] flex flex-col rounded-2xl overflow-hidden"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          // Wide enough to hold the fields AND the plan side by side, but still
          // inset on every edge so it reads as a window over the board rather
          // than as a page you have navigated to.
          width: planPaneOn ? 'min(1720px, 95vw)' : 'min(1020px, 94vw)',
          height: 'min(980px, 93vh)',
          transition: 'width 180ms ease',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1e3a5f] text-white flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 size={16} className="text-[#4aa8d8] flex-shrink-0" />
            {isGeneralProject
              ? <span className="text-[#4aa8d8] font-semibold text-sm flex-shrink-0">{ui.jobLabel}</span>
              : <>
                  <span className="text-[#4aa8d8] font-semibold text-sm flex-shrink-0">{apartment.buildingId}</span>
                  {apartment.floor > 0 && <span className="text-white/50 text-xs flex-shrink-0">· {ui.floorPrefix} {apartment.floor}</span>}
                </>
            }
            {mergedPartner && (
              <span className="text-white/60 text-xs flex-shrink-0">
                · {ui.linkedToApt} {ui.aptPrefix} {mergedPartner.displayName || mergedPartner.apartmentNumber}
              </span>
            )}

            {/* Live contractor progress — opens the sheet-backed panel */}
            {!isGeneralProject && (
              <Tooltip text={ui.contractorStatusTitle}>
                <button
                  onClick={() => setShowContractorStatus(true)}
                  className="flex items-center gap-1.5 rounded-full px-2 py-0.5 flex-shrink-0 transition-colors hover:brightness-125"
                  style={{
                    backgroundColor: 'rgba(74,168,216,0.18)',
                    border: '1px solid rgba(74,168,216,0.45)',
                    color: '#cfe9f8',
                    fontSize: '10px',
                    fontWeight: 700,
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                  <span className="truncate">{ui.contractorStatusTitle}</span>
                </button>
              </Tooltip>
            )}
                    </div>
          {/* The same light the tiles carry, so the answer to "is this job set
              up in Drive" is the same shape wherever you are looking. */}
          <Tooltip text="Google Drive" side="left">
            <span className="mr-1"><DriveStatus job={apartment} size="panel" /></span>
          </Tooltip>
          <Tooltip text="Print a job sheet" side="left">
            <button onClick={printJobSheet}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
              <Printer size={17} />
            </button>
          </Tooltip>
          <Tooltip text={ui.cancel} side="left">
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
              <X size={20} />
            </button>
          </Tooltip>
        </div>

        <div className="flex-1 min-h-0 flex">
        {/* ── Everything written down ── */}
        <div className="flex flex-col min-h-0 min-w-0"
          style={{ flex: planPaneOn ? '0 0 46%' : '1 1 100%' }}>

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
                {!isGeneralProject && (
                <div className="flex-shrink-0">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">{ui.aptPrefix} #</label>
                  {/* Linked pair shows both numbers with a slash, plus a link badge */}
                  <div className={`flex items-center justify-center gap-1 border rounded-lg px-2 py-2 text-sm font-bold text-center ${
                    mergedPartner
                      ? 'border-blue-300 bg-blue-50 text-blue-700 min-w-[4.5rem]'
                      : 'w-14 border-gray-200 bg-gray-50 text-gray-700'
                  }`}>
                    {mergedPartner && <Link size={12} className="flex-shrink-0 text-blue-500" />}
                    <span>
                      {mergedPartner
                        ? [apartment.apartmentNumber, mergedPartner.apartmentNumber]
                            .filter(Boolean)
                            .sort((a, b) => (Number(a) || 0) - (Number(b) || 0))
                            .join('/')
                        : apartment.apartmentNumber}
                    </span>
                  </div>
                </div>
                )}

                {/* Family name / Job name */}
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">{isGeneralProject ? ui.jobNameLabel : ui.familyName}</label>
                  <input
                    value={familyName}
                    onChange={e => setFamilyName(e.target.value)}
                    onBlur={autoSave}
                    placeholder={ui.familyNamePlaceholder}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                  />
                </div>

                {/* Classification toggle */}
                {!isGeneralProject && (
                <div className="flex-shrink-0">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">{ui.typeField}</label>
                  <div className="flex gap-1">
                    <Tooltip text={ui.standardApt}>
                      <button
                        onClick={() => handleClassificationChange('standard')}
                        className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-all ${
                          classification === 'standard' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {ui.stdShort}
                      </button>
                    </Tooltip>
                    <Tooltip text={ui.hasModifications}>
                      <button
                        onClick={() => handleClassificationChange('shinui')}
                        className={`px-2 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-0.5 ${
                          classification === 'shinui' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <AlertTriangle size={10} /> {ui.chgShort}
                      </button>
                    </Tooltip>
                  </div>
                </div>
                )}

                {/* Current stage */}
                <div className="flex-shrink-0 min-w-[120px]">
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">{ui.currentStage}</label>
                  <select
                    value={currentStageId}
                    onChange={e => handleStageChange(e.target.value)}
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

              {/* Address (building projects) — shown under the top row, above notes */}
              {!isGeneralProject && (
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 mb-1">{ui.addressLabel}</label>
                  <input
                    value={addressLocal}
                    onChange={e => setAddressLocal(e.target.value)}
                    onBlur={autoSave}
                    placeholder={ui.addressLabel}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                  />
                </div>
              )}

              {/* General Jobs: Zoho Link + Address */}
              {isGeneralProject && (
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">{ui.addressLabel}</label>
                    <input
                      value={addressLocal}
                      onChange={e => setAddressLocal(e.target.value)}
                      onBlur={autoSave}
                      placeholder={ui.addressLabel}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">{ui.zohoLinkLabel}</label>
                    <div className="flex gap-2">
                      <input
                        value={zohoLinkLocal}
                        onChange={e => setZohoLinkLocal(e.target.value)}
                        onBlur={autoSave}
                        placeholder="https://crm.zoho.com/..."
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                      />
                      {zohoLinkLocal.trim() && (
                        <a
                          href={zohoLinkLocal.startsWith('http') ? zohoLinkLocal : `https://${zohoLinkLocal}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#4aa8d8] text-[#4aa8d8] text-xs font-medium hover:bg-[#4aa8d8]/10 transition-all flex-shrink-0"
                        >
                          <ExternalLink size={12} /> {ui.openZohoBtn}
                        </a>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">{ui.driveFolder}</label>
                    <div className="flex gap-2">
                      <input
                        value={driveLink}
                        onChange={e => setDriveLink(e.target.value)}
                        onBlur={autoSave}
                        placeholder="https://drive.google.com/..."
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                      />
                      {driveLink.trim() && (
                        <a
                          href={driveLink.startsWith('http') ? driveLink : `https://${driveLink}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[#4aa8d8] text-[#4aa8d8] text-xs font-medium hover:bg-[#4aa8d8]/10 transition-all flex-shrink-0"
                        >
                          <FolderOpen size={12} /> {ui.openFolderTooltip}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

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
                              title={ui.restoreVersionTitle}
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
                    onToast(`${files.length} ${files.length === 1 ? ui.fileAttachedToast : ui.filesAttachedToast}`);
                  }}
                />
                <input
                  ref={taskEditFileRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={e => {
                    Array.from(e.target.files ?? []).forEach(f => handleTaskEditFileChosen(f));
                    if (taskEditFileRef.current) taskEditFileRef.current.value = '';
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
                                title={ui.storedLocallyTitle}
                                className="absolute bottom-0.5 left-0.5 w-3 h-3 rounded-full bg-amber-400 flex items-center justify-center"
                              >
                                <AlertTriangle size={6} color="white" />
                              </div>
                            )}
                            <button onClick={e => { e.stopPropagation(); deleteOfficeNoteFile(f.id); }}
                              title={ui.removeFileTitle}
                              className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                              <Trash2 size={8} color="white" />
                            </button>
                            <a
                              href={f.driveFileId ? `https://drive.google.com/uc?export=download&id=${f.driveFileId}` : f.dataUrl}
                              download={!f.driveFileId ? f.filename : undefined}
                              target={f.driveFileId ? '_blank' : undefined}
                              rel={f.driveFileId ? 'noopener noreferrer' : undefined}
                              title={ui.downloadFileTitle}
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
                      <Tooltip text={ui.rescanDriveTooltip}>
                        <button
                          onClick={() => {
                            setFetchingPdf(true);
                            findAllPlansPdfsViaBackend(driveLink).then(pdfs => {
                              if (pdfs.length > 0) {
                                setAvailablePdfs(pdfs);
                                setSelectedPdfIdx(0);
                                const link = `https://drive.google.com/file/d/${pdfs[0].id}/view`;
                                setPlansPdfLink(link);
                                updateApartment(apartment!.id, { plansPdfLink: link }, currentUser);
                                onToast(ui.pdfFound);
                              } else {
                                // Explicit re-scan found no Engineered Plans folder — drop any
                                // previously detected plan so a wrong one can't reach the contractor.
                                setAvailablePdfs([]);
                                setSelectedPdfIdx(0);
                                setPlansPdfLink('');
                                if (apartment!.plansPdfLink) {
                                  updateApartment(apartment!.id, { plansPdfLink: undefined }, currentUser);
                                }
                                onToast(ui.noPdfFound, 'error');
                              }
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
                    {/* The plan chips.
                        Originals from the Engineered Plans folder, then a rule,
                        then the markups from its "Annotated Plans" child — so
                        version 3 can be looked at without opening the studio.
                        PDFs in any OTHER subfolder are deliberately left out. */}
                    {(() => {
                      const originals = planSet.plans.filter(p => p.kind === 'original');
                      const marked = planSet.plans.filter(p => p.kind === 'annotated');
                      const fallback = availablePdfs.map((pdf, i) => ({
                        id: pdf.id,
                        name: pdf.name || `Plan ${i + 1}`,
                        kind: 'original' as const,
                      }));
                      const shownOriginals = originals.length ? originals : fallback;
                      if (shownOriginals.length + marked.length < 2) return null;

                      const chip = (p: { id: string; name: string }, active: boolean, tone: string) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setShownPlanId(p.id);
                            const link = `https://drive.google.com/file/d/${p.id}/view`;
                            const idx = availablePdfs.findIndex(x => x.id === p.id);
                            if (idx >= 0) setSelectedPdfIdx(idx);
                            // Only an ORIGINAL becomes the job's plan — the one
                            // the contractor is shown should not silently become
                            // somebody's markup.
                            if (originals.some(o => o.id === p.id) || idx >= 0) {
                              setPlansPdfLink(link);
                              updateApartment(apartment!.id, { plansPdfLink: link }, currentUser);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all truncate max-w-[190px]"
                          style={active
                            ? { backgroundColor: tone, color: '#fff', borderColor: tone }
                            : { backgroundColor: '#fff', color: '#64748b', borderColor: '#e2e8f0' }}
                          title={p.name}
                        >
                          {p.name.replace(/\.pdf$/i, '')}
                        </button>
                      );

                      return (
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          {shownOriginals.map(p => chip(p, (shownPlanId ?? detectedPdfId) === p.id, '#1e3a5f'))}
                          {marked.length > 0 && (
                            <span className="w-px h-5 mx-0.5" style={{ backgroundColor: '#e2e8f0' }} />
                          )}
                          {marked.map(p => chip(p, shownPlanId === p.id, '#4aa8d8'))}
                        </div>
                      );
                    })()}

                    <div
                      className="rounded-xl overflow-hidden border border-gray-200 cursor-pointer relative mb-2"
                      // Tall enough to read the first page. A 160px strip shows
                      // the top border of a drawing and nothing else.
                      style={{ height: showPdfViewer ? '620px' : '330px' }}
                      onClick={() => setShowPdfViewer(v => !v)}
                    >
                      <iframe
                        src={drivePreviewUrl(shownPlanId ?? detectedPdfId)}
                        width="100%"
                        height={showPdfViewer ? '620' : '330'}
                        allow="autoplay"
                        title={ui.engineeringPlans}
                        style={{ border: 'none', display: 'block', pointerEvents: showPdfViewer ? 'auto' : 'none' }}
                      />
                      {/* Punch-list pins live OVER the plan, never inside the
                          PDF — the file in Drive stays untouched. Only shown
                          once the viewer is expanded, so the collapsed preview
                          keeps its click-to-expand behaviour. */}
                      {showPdfViewer && (
                        <div onClick={e => e.stopPropagation()}>
                          <PlanPinOverlay
                            apartmentId={apartment.id}
                            apartmentLabel={aptLabel(apartment)}
                            authorName={currentUser.name}
                          />
                        </div>
                      )}
                      {!showPdfViewer && (
                        <div className="absolute inset-0 flex items-end justify-center pb-2 bg-gradient-to-t from-black/20 to-transparent">
                          <span className="text-white text-[10px] font-medium bg-black/40 px-2 py-0.5 rounded">{ui.clickToExpand}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setShowPdfViewer(v => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-all">
                        {showPdfViewer ? <EyeOff size={12} /> : <Eye size={12} />}
                        {showPdfViewer ? ui.hideLabel : ui.fullView}
                      </button>
                      {/* Open the plan properly — full screen, at a size you can
                          actually read, rather than in a 440px box. */}
                      <button onClick={() => setAnnotating('view')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-all">
                        <Maximize2 size={12} /> View plan
                      </button>
                      {/* Mark it up. Saves a new version straight into the job's
                          "Annotated Plans" folder in Drive, with the markup on
                          its own PDF layer. */}
                      <button onClick={() => setAnnotating('draw')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                        style={{ backgroundColor: '#4aa8d8' }}>
                        <PenLine size={12} /> Mark up
                        {planVersionCount > 0 && (
                          <span className="px-1.5 rounded-full text-[9px] font-bold"
                            style={{ backgroundColor: 'rgba(255,255,255,.28)' }}>
                            v{planVersionCount}
                          </span>
                        )}
                      </button>
                      <a href={driveDownloadUrl(shownPlanId ?? detectedPdfId)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:border-[#4aa8d8] hover:text-[#4aa8d8] transition-all">
                        <Download size={12} /> {ui.download}
                      </a>
                    </div>
                    {latestPlanVersion?.driveUrl && (
                      <a href={latestPlanVersion.driveUrl} target="_blank" rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-[#4aa8d8]">
                        <ExternalLink size={10} />
                        Latest markup — version {latestPlanVersion.version},
                        {' '}{latestPlanVersion.createdBy || 'Office'},
                        {' '}{new Date(latestPlanVersion.createdAt).toLocaleDateString()}
                      </a>
                    )}
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

              {/* No Save button — every field on this tab saves on its own:
                  text fields on blur, stage + classification the moment they change. */}

              {/* Settings collapsible */}
              {!isGeneralProject && (
              <div className="border-t border-gray-100 pt-3">
                <button
                  onClick={() => setShowSettings(v => !v)}
                  className="w-full flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                  title={ui.settingsLabel}
                >
                  {showSettings ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  {ui.settingsLabel}
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
                        <Tooltip text={showHealthCheck ? ui.hideLabel : ui.statusLabel}>
                          <button
                            onClick={() => setShowHealthCheck(v => !v)}
                            className={`flex items-center gap-1 text-xs transition-colors ${showHealthCheck ? 'text-[#1e3a5f]' : 'text-gray-400 hover:text-[#1e3a5f]'}`}
                          >
                            <Activity size={11} /> {ui.statusLabel}
                          </button>
                        </Tooltip>
                      </div>

                      {showHealthCheck && (
                        <div className="mb-2 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1.5">
                          {[
                            { label: ui.driveLinkedCheck, ok: !!driveLink.trim() },
                            { label: ui.plansDetected, ok: !!detectedPdfId },
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
                              {ui.noPdfHelp}
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
                                autoFillFamilyNameFromFolder(folderId);
                                if (!detectedPdfId) {
                                  setFetchingPdf(true);
                                  findAllPlansPdfsViaBackend(trimmed)
                                    .then(pdfs => {
                                      if (pdfs.length > 0) {
                                        setAvailablePdfs(pdfs);
                                        setSelectedPdfIdx(0);
                                        const link = `https://drive.google.com/file/d/${pdfs[0].id}/view`;
                                        setPlansPdfLink(link);
                                        updateApartment(apartment!.id, { plansPdfLink: link }, currentUser);
                                      }
                                    })
                                    .finally(() => setFetchingPdf(false));
                                }
                              }
                            }
                          }}
                          placeholder="https://drive.google.com/drive/folders/…"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                        />
                        {driveLink && (
                          <Tooltip text={ui.openFolderTooltip}>
                            <a href={driveLink} target="_blank" rel="noopener noreferrer"
                              className="flex items-center px-2.5 py-2 rounded-lg border border-gray-200 text-gray-500 hover:text-[#4aa8d8] hover:border-[#4aa8d8] transition-all">
                              <ExternalLink size={14} />
                            </a>
                          </Tooltip>
                        )}
                        <Tooltip text={ui.saveDriveLinkTooltip}>
                          <button
                            onClick={async () => {
                              handleSaveBasic();
                              const trimmed = driveLink.trim();
                              if (trimmed && backendConfigured) {
                                const folderId = extractFolderId(trimmed);
                                if (folderId) {
                                  findOrCreateFolderViaBackend(folderId, 'Photos').catch(() => {});
                                  autoFillFamilyNameFromFolder(folderId);
                                  setFetchingPdf(true);
                                  findAllPlansPdfsViaBackend(trimmed)
                                    .then(pdfs => { if (pdfs.length > 0) { setAvailablePdfs(pdfs); setSelectedPdfIdx(0); } })
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
                          <span>{ui.mergedDriveDiffers}</span>
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
                              {ui.aptPrefix} {a.apartmentNumber} ({ui.floorPrefix} {a.floor > 0 ? a.floor : 'B'})
                            </option>
                          ))}
                        </select>
                        {mergedWithId !== (apartment.mergedWith ?? '') && (
                          <Tooltip text={mergedWithId ? ui.linkMutualHint : ui.unlinkApartments}>
                            <button
                              onClick={handleSaveMerge}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all bg-blue-600 text-white hover:bg-blue-700"
                            >
                              {mergedWithId ? <Link size={14} /> : <Unlink size={14} />}
                              {ui.save}
                            </button>
                          </Tooltip>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">{ui.linkMutualHint}</p>
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Danger zone — delete this apartment/job */}
              <div className="pt-2 mt-2 border-t border-red-100">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                  {isGeneralProject ? ui.deleteJobConfirm.replace('?', '') : ui.deleteApartmentLabel}
                </button>
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
                    const isEditing = drawerEditingTaskId === a.id;
                    return (
                      <div key={a.id} className={`rounded-xl border transition-all ${
                        isEditing
                          ? 'border-[#1e3a5f]/40 bg-[#f0f4fa]'
                          : a.completedAt
                            ? 'border-green-100 bg-green-50/40 opacity-75'
                            : 'border-gray-200 bg-white'
                      }`}>
                        {/* Card header row */}
                        <div className="flex items-start gap-2 p-3">
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
                            {!isEditing && (
                              <>
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
                              </>
                            )}
                          </div>
                          {/* Edit / Delete buttons */}
                          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                            <button
                              onClick={() => {
                                if (isEditing) { setDrawerEditingTaskId(null); setDrawerEditAttachments([]); }
                                else startTaskEdit(a);
                              }}
                              className="p-1 rounded-md text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100 transition-colors"
                              title={isEditing ? ui.cancel : 'Edit task'}
                            >
                              {isEditing ? <X size={14} /> : <Edit2 size={14} />}
                            </button>
                            <button
                              onClick={() => { if (window.confirm('Delete this task?')) deleteContractorAssignment(a.id); }}
                              className="p-1 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete task"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Inline edit form */}
                        {isEditing && (
                          <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-[#1e3a5f]/10">
                            <textarea
                              value={drawerEditFields.taskDescription}
                              onChange={e => setDrawerEditFields(f => ({ ...f, taskDescription: e.target.value }))}
                              rows={2}
                              autoFocus
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={drawerEditFields.stageId}
                                onChange={e => setDrawerEditFields(f => ({ ...f, stageId: e.target.value }))}
                                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
                              >
                                <option value="">{ui.noneOption}</option>
                                {sortedStages.map(st => <option key={st.id} value={st.id}>{getStageName(st, ui.isRtl)}</option>)}
                              </select>
                              <input
                                type="date"
                                value={drawerEditFields.dueDate}
                                onChange={e => setDrawerEditFields(f => ({ ...f, dueDate: e.target.value }))}
                                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                              />
                            </div>
                            <select
                              value={drawerEditFields.priority}
                              onChange={e => setDrawerEditFields(f => ({ ...f, priority: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-white"
                            >
                              <option value="">{ui.normalDefault}</option>
                              <option value="urgent">{ui.urgentPriority}</option>
                              <option value="low">{ui.lowPriority}</option>
                            </select>
                            {drawerEditAttachments.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {drawerEditAttachments.map(att => (
                                  <div key={att.id} className="relative flex-shrink-0">
                                    <div className="w-9 h-9 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center">
                                      {att.mimeType.startsWith('image/')
                                        ? <DriveImg src={att.driveFileId ? driveThumbUrl(att.driveFileId, 200) : att.dataUrl} alt={att.filename} className="w-full h-full object-cover" />
                                        : <FileText size={12} className="text-gray-400" />
                                      }
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setDrawerEditAttachments(prev => prev.filter(x => x.id !== att.id))}
                                      className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center"
                                    >
                                      <X size={7} color="white" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {drawerEditProgress !== null && (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-[#4aa8d8] transition-all" style={{ width: `${Math.round(drawerEditProgress)}%` }} />
                                </div>
                                <span className="text-[10px] text-gray-500">{Math.round(drawerEditProgress)}%</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => taskEditFileRef.current?.click()}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100 border border-gray-200 transition-colors"
                                title="Attach file"
                              >
                                <Paperclip size={13} />
                              </button>
                              <div className="flex-1" />
                              <button
                                onClick={() => { setDrawerEditingTaskId(null); setDrawerEditAttachments([]); }}
                                className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                              >
                                {ui.cancel}
                              </button>
                              <button
                                onClick={saveTaskEdit}
                                disabled={!drawerEditFields.taskDescription.trim()}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-xs font-semibold hover:bg-[#162d4a] disabled:opacity-40 transition-colors"
                              >
                                <Save size={11} /> {ui.save}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'photos' && (
            <div>
              {/* Photo review queue.
                  Uploads from the site that nobody has looked at yet. It lives
                  in the job rather than in a notification, so reviewing a photo
                  happens next to the plan, the notes and the tasks it relates
                  to. Marking one reviewed only records that someone looked. */}
              {(() => {
                const jobAssignments = new Set(
                  contractorAssignments.filter(a => a.apartmentId === apartment.id).map(a => a.id));
                const queue = contractorPhotos
                  .filter(p => jobAssignments.has(p.assignmentId) && !p.reviewedAt)
                  .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
                if (queue.length === 0) return null;
                return (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Camera size={14} className="text-amber-600" />
                      <span className="text-xs font-bold text-amber-800">
                        {queue.length} new from the site
                      </span>
                      <button
                        onClick={() => queue.forEach(p => updateContractorPhoto(p.id, {
                          reviewedAt: new Date().toISOString(), reviewedBy: currentUser.name,
                        }))}
                        className="ml-auto text-[11px] font-bold text-amber-700 hover:text-amber-900"
                      >
                        Mark all reviewed
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {queue.slice(0, 8).map(p => {
                        const src = p.storageUrl || (p.driveFileId ? driveThumbUrl(p.driveFileId, 300) : p.dataUrl);
                        const who = contractors.find(c => c.id === p.contractorId)?.name;
                        return (
                          <button
                            key={p.id}
                            title={`${who ?? 'Contractor'} · ${p.filename} — click to mark reviewed`}
                            onClick={() => updateContractorPhoto(p.id, {
                              reviewedAt: new Date().toISOString(), reviewedBy: currentUser.name,
                            })}
                            className="aspect-square rounded-lg overflow-hidden bg-white border border-amber-200 relative"
                          >
                            {src
                              ? <img src={src} alt={p.filename} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center"><FileText size={14} className="text-gray-300" /></div>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Drive folder health — inside the job only, never on a tile. */}
              {apartment.driveLink && backendConfigured && (
                <div className="mb-3 flex items-center gap-2 text-[11px]">
                  {folderHealth === null ? (
                    <button
                      onClick={async () => {
                        setCheckingHealth(true);
                        setFolderHealth(await checkFolderHealthViaBackend(apartment.driveLink, apartment.plansPdfLink)
                          .catch(() => ({ mainFolderLinked: true, plansPdfLinked: !!apartment.plansPdfLink, mainFolderAccessible: false })));
                        setCheckingHealth(false);
                      }}
                      disabled={checkingHealth}
                      className="text-gray-400 hover:text-gray-600 font-semibold"
                    >
                      {checkingHealth ? 'Checking folder…' : 'Check Drive folder'}
                    </button>
                  ) : (() => {
                    const issues: string[] = [];
                    if (!folderHealth.mainFolderAccessible) issues.push('folder not reachable');
                    else {
                      if (!folderHealth.photosFolderFound) issues.push('no Photos folder');
                      if (!folderHealth.plansFolderFound) issues.push('no Engineered Plans folder');
                      else if (!folderHealth.plansPdfFound) issues.push('no plan PDF inside it');
                    }
                    const ok = issues.length === 0;
                    return (
                      <span
                        title={ok ? 'Folder looks complete' : issues.join(' · ')}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full font-bold"
                        style={ok
                          ? { backgroundColor: '#dcfce7', color: '#166534' }
                          : { backgroundColor: '#fef3c7', color: '#92400e' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ok ? '#16a34a' : '#d97706' }} />
                        {ok ? 'Drive folder complete' : issues.join(' · ')}
                      </span>
                    );
                  })()}
                </div>
              )}

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
                  <p className="text-xs text-gray-400 mt-1">{ui.driveApiKeyHint}</p>
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
                  <p className="text-xs text-gray-400">{ui.loadPhotosHint}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'stages' && (
            <StageNotesSection
              apartmentId={apartment.id}
              stages={sortedStages}
              currentUser={currentUser}
              onSaved={() => onToast(ui.noteSaved)}
            />
          )}

          {activeTab === 'history' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">{ui.recentActivityLabel}</h4>
                {autoBackup && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">{ui.autoBackupOn}</span>
                )}
              </div>
              <ActivitySection
                logs={aptLogs}
                autoBackup={autoBackup}
                backupSnapshots={backupSnapshots}
                onRestore={(snapshotId) => {
                  restoreFromSnapshot(snapshotId);
                  onToast(ui.restoredToPoint);
                }}
              />
            </div>
          )}
        </div>
        </div>

        {/* ── The plan, alongside rather than buried in a tab ──
            It is the thing everyone opens a job to look at, so it gets half the
            window and stays visible whichever tab is showing. Collapsible,
            because on a laptop the fields sometimes want the whole width. */}
        {planPaneOn && (
          <div className="flex flex-col min-h-0 border-l border-gray-200"
            style={{ flex: '1 1 54%', backgroundColor: '#f8fafc' }}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 flex-shrink-0 bg-white">
              <BookOpen size={13} className="text-[#1e3a5f]" />
              <span className="text-[12px] font-bold text-gray-800 truncate">
                {planSet.plans.find(p => p.id === (shownPlanId ?? detectedPdfId))?.name?.replace(/\.pdf$/i, '')
                  ?? ui.engineeringPlans}
              </span>
              <span className="flex-1" />
              <Tooltip text="Mark up this plan" side="left">
                <button onClick={() => setAnnotating('draw')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-bold text-white"
                  style={{ backgroundColor: '#4aa8d8' }}>
                  <PenLine size={11} /> Mark up
                  {planVersionCount > 0 && (
                    <span className="px-1 rounded-full text-[9px]" style={{ backgroundColor: 'rgba(255,255,255,.28)' }}>
                      v{planVersionCount}
                    </span>
                  )}
                </button>
              </Tooltip>
              <Tooltip text="Full screen" side="left">
                <button onClick={() => setAnnotating('view')}
                  className="p-1 rounded-lg text-gray-400 hover:text-[#1e3a5f]"><Maximize2 size={13} /></button>
              </Tooltip>
              <Tooltip text="Hide the plan" side="left">
                <button onClick={() => setPlanPaneOn(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-700"><ChevronRight size={15} /></button>
              </Tooltip>
            </div>
            <iframe
              src={drivePreviewUrl(shownPlanId ?? detectedPdfId!)}
              title={ui.engineeringPlans}
              className="flex-1 w-full"
              style={{ border: 'none' }}
              allow="autoplay"
            />
          </div>
        )}
        </div>

        {/* Bring it back. */}
        {!planPaneOn && detectedPdfId && (
          <button
            onClick={() => setPlanPaneOn(true)}
            title="Show the plan beside the details"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1 px-1.5 py-4 rounded-l-lg text-white text-[10px] font-bold"
            style={{ backgroundColor: '#1e3a5f', writingMode: 'vertical-rl' }}
          >
            <ChevronLeft size={12} style={{ transform: 'rotate(90deg)' }} /> PLAN
          </button>
        )}
      </div>

      {/* Plan markup studio. Full screen and above the drawer, because marking
          up a construction drawing in a panel the width of a phone is not
          marking anything up. */}
      {annotating && detectedPdfId && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[150] flex items-center justify-center gap-2 text-white text-sm"
            style={{ backgroundColor: '#111827' }}>
            <RefreshCw size={16} className="animate-spin" /> Loading the markup tools…
          </div>
        }>
        <PlanAnnotator
          planFileId={shownPlanId ?? detectedPdfId}
          planName={planSet.plans.find(p => p.id === (shownPlanId ?? detectedPdfId))?.name
            ?? availablePdfs[selectedPdfIdx]?.name}
          apartmentId={apartment.id}
          apartmentLabel={isGeneralProject ? (apartment.displayName || 'Job') : aptLabel(apartment)}
          driveFolderUrl={driveLink}
          plansFolderId={planSet.plansFolderId ?? undefined}
          plans={planSet.plans}
          onPickPlan={p => setShownPlanId(p.id)}
          authorName={currentUser.name}
          readOnly={annotating === 'view'}
          onStartMarkup={() => setAnnotating('draw')}
          onClose={() => setAnnotating(null)}
          onToast={onToast}
        />
        </Suspense>
      )}

      {/* Lightbox */}
      {lightbox && (
        <LightboxOverlay
          items={lightbox.items}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          imageUnavailable={ui.imageUnavailable}
          openDownload={ui.openDownload}
          downloadLabel={ui.downloadLabel}
        />
      )}
    </>
  );
}
