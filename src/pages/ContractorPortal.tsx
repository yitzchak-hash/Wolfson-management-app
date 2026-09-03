import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useStore, loadAllProjectsTaskData, ensureProjectSnapshot } from '../data/store';
import { ContractorAssignment, ContractorPhoto, Contractor, Apartment, Project, DEFAULT_CONTRACTOR_UI_STRINGS, HEBREW_CONTRACTOR_UI_STRINGS, RUSSIAN_CONTRACTOR_UI_STRINGS, PortalLang, getStageName, aptLabel, workAtLabel, projectColor } from '../types';
import { useSpeechToText } from '../data/voiceSearch';
import { transcribeMemo } from '../data/transcribe';
import { daysOf, futureDaysOf } from '../data/taskDays';
import { PlanPinOverlay } from '../components/apartment/PlanPinOverlay';
import { printSheet, printEsc } from '../data/printing';
import { format, isPast, parseISO, isToday, differenceInCalendarDays, startOfDay, startOfWeek, addDays as addDaysFns } from 'date-fns';
import { usePhone } from '../data/usePhone';
import {
  Camera, CheckCircle2, Clock, Building2, CalendarDays, FileText, Hammer,
  Plus, Send, AlertCircle, X, Play, File as FileIcon, MapPin,
  BookOpen, Download, Paperclip, MessageSquare, CloudUpload,
  ChevronLeft, ChevronRight, ChevronDown, History, PenLine, Mic,
  Settings as SettingsIcon, Bell,
} from 'lucide-react';
import { BuildingDiagram } from '../components/diagram/BuildingDiagram';
import { permsOf } from '../data/workerLevels';
import { PlannerWidget } from '../components/board/PlannerWidget';
import { TaskCalendar, CalendarEvent } from '../components/tasks/TaskCalendar';
import { VoiceRecorderButton, VoiceMemoPlayer } from '../components/ui/VoiceMemo';
import { WazeIcon, wazeUrl } from '../components/ui/BrandIcons';
import { RecordedMemo } from '../data/voiceMemo';
import {
  extractFileId, drivePreviewUrl, driveDownloadUrl, driveThumbUrl,
  extractFolderId, isUploadBackendConfigured, findOrCreateFolderViaBackend,
  uploadFileViaResumableSession, shareFileToDrive, ensureDriveShared,
  fetchPlanBytes,
} from '../data/driveApi';
import { saveBytes, safeFileName } from '../data/planExport';
import { TaskThread } from '../components/tasks/TaskThread';
import { Translated, TrText } from '../components/ui/Translated';

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

/**
 * The countdown badge on a task card — in the WORKER's language.
 *
 * This was a module-level function with "Overdue" / "Today" / "Tomorrow"
 * written into it, which is the trap CLAUDE.md names: a constant outside a
 * component cannot reach the translation store, so it silently keeps English.
 * Every other word on the portal followed the worker's language and these four
 * did not — on the one screen a Hebrew-speaking worker actually holds, and on
 * the part of the card that tells him whether he is late.
 *
 * The strings are passed IN rather than the function being moved inside the
 * component, because both call sites are already inside it and this keeps the
 * arithmetic out of the render.
 */
function getDueBadge(
  dueDate: string | null,
  t: { overdue: string; today: string; tomorrow: string; days: string },
): { text: string; cls: string } | null {
  if (!dueDate) return null;
  const days = differenceInCalendarDays(parseISO(dueDate), startOfDay(new Date()));
  if (days < 0)  return { text: t.overdue,  cls: 'text-red-600 bg-red-50 border-red-200' };
  if (days === 0) return { text: t.today,    cls: 'text-orange-600 bg-orange-50 border-orange-200' };
  if (days === 1) return { text: t.tomorrow, cls: 'text-amber-700 bg-amber-50 border-amber-200' };
  if (days <= 3)  return { text: `${days} ${t.days}`, cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' };
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
  const imgSrc = (photo.driveFileId ? driveThumbUrl(photo.driveFileId, 2000) : null) || (photo.dataUrl || null);
  const videoSrc = photo.dataUrl || null;
  const downloadHref = photo.driveFileId
    ? `https://drive.google.com/uc?export=download&id=${photo.driveFileId}`
    : photo.dataUrl;

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
              download={!photo.driveFileId ? photo.filename : undefined}
              target={photo.driveFileId ? '_blank' : undefined}
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
  const thumbSrc = photo.driveFileId
    ? driveThumbUrl(photo.driveFileId, 800)
    : (photo.dataUrl || null);

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
      {photo.driveFileId ? (
        <div
          className="absolute bottom-1 left-1 rounded-full w-3.5 h-3.5 flex items-center justify-center bg-green-500"
          title="Saved in Google Drive"
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

// ── The worker's notification bell ─────────────────────────────────────────

interface BellItem {
  id: string;
  kind: 'overdue' | 'today' | 'tomorrow' | 'new';
  text: string;
  where: string;
  /** Named only when the task lives in ANOTHER workspace. */
  workspace?: string;
  projectId: string;
  taskId: string;
}

/**
 * A small bell in the portal header — the worker's updates, DERIVED from his
 * own tasks across every workspace, never stored: overdue, today, tomorrow
 * and newly-assigned work, each one tap from its task. What it shows follows
 * the per-worker scope the office sets (`Contractor.notifyScope`, Settings →
 * Workers): everything / today + tomorrow / today only — and 'off' draws no
 * bell at all, for the worker a stream of updates would only confuse.
 *
 * The red dot is per device (`portal_bell_seen_<id>` holds a hash of what the
 * bell currently says; opening it marks it read) — the localStorage rule, in
 * try/catch like every per-machine convenience.
 */
function PortalBell({ contractor, s, lang, currentProjectId, allAssignments, allApartments, projects, snapshotTick, onPick }: {
  contractor: Contractor;
  s: typeof DEFAULT_CONTRACTOR_UI_STRINGS;
  lang: PortalLang;
  currentProjectId: string;
  allAssignments: ContractorAssignment[];
  allApartments: Apartment[];
  projects: Project[];
  snapshotTick: number;
  onPick: (item: BellItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const scope = contractor.notifyScope ?? 'all';

  const items = useMemo(() => {
    const d0 = new Date();
    const isoOf = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = isoOf(d0);
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
    const tomorrow = isoOf(d1);
    const weekAgo = Date.now() - 6 * 86400000;
    const out: BellItem[] = [];
    for (const p of loadAllProjectsTaskData()) {
      // The open workspace is LIVE; the snapshots stand in for the rest.
      const asg = p.projectId === currentProjectId ? allAssignments : p.assignments;
      const apts = p.projectId === currentProjectId ? allApartments : p.apartments;
      const wsName = projects.find(x => x.id === p.projectId)?.name ?? p.projectId;
      for (const a of asg) {
        if (a.contractorId !== contractor.id || a.completedAt) continue;
        const apt = apts.find(x => x.id === a.apartmentId);
        const where = a.general ? workAtLabel(lang, wsName) : (apt ? (aptLabel(apt) || apt.address || '') : a.buildingId);
        const mk = (kind: BellItem['kind'], id: string) => out.push({
          id, kind, text: a.taskDescription || where, where,
          workspace: p.projectId === currentProjectId ? undefined : wsName,
          projectId: p.projectId, taskId: a.id,
        });
        const ds = daysOf(a);
        if (ds.includes(today)) mk('today', `t|${a.id}|${today}`);
        else if (scope !== 'today' && ds.includes(tomorrow)) mk('tomorrow', `m|${a.id}|${tomorrow}`);
        else if (scope === 'all' && a.dueDate && a.dueDate < today) mk('overdue', `o|${a.id}`);
        else if (scope === 'all' && a.createdAt && Date.parse(a.createdAt) > weekAgo) mk('new', `n|${a.id}`);
      }
    }
    const order: Record<BellItem['kind'], number> = { overdue: 0, today: 1, tomorrow: 2, new: 3 };
    return out.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 30);
    // snapshotTick: a hydrated snapshot landing must recompute this.
  }, [contractor.id, scope, currentProjectId, allAssignments, allApartments, projects, snapshotTick, lang]);

  const hash = items.map(i => i.id).join(',');
  const seenKey = `portal_bell_seen_${contractor.id}`;
  const [seen, setSeen] = useState(() => {
    try { return localStorage.getItem(seenKey) ?? ''; } catch { return ''; }
  });
  const unseen = items.length > 0 && seen !== hash;

  const KIND: Record<BellItem['kind'], { word: string; color: string }> = {
    overdue: { word: s.filterOverdue, color: '#dc2626' },
    today: { word: s.filterToday, color: '#f97316' },
    tomorrow: { word: s.filterTomorrow, color: '#0ea5e9' },
    new: { word: s.notifNew || (s.isRtl ? 'עבודה חדשה בשבילך' : 'New job for you'), color: '#16a34a' },
  };

  return (
    <>
      <button
        onClick={() => {
          setOpen(v => !v);
          try { localStorage.setItem(seenKey, hash); } catch { /* private mode */ }
          setSeen(hash);
        }}
        title={s.notifTitle || 'Updates'}
        data-portal-bell
        className="relative flex-shrink-0 p-2 rounded-xl border border-white/15 text-white/85 hover:bg-white/10"
      >
        <Bell size={17} />
        {unseen && (
          <span data-bell-dot className="absolute top-1 end-1 w-2 h-2 rounded-full bg-red-500" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[119]" onClick={() => setOpen(false)} />
          <div data-bell-panel
            className="fixed z-[120] top-16 inset-x-2 sm:inset-x-auto sm:end-4 sm:w-[380px]
                       bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#1e3a5f]">
              <span className="text-[14px] font-bold text-white">{s.notifTitle || 'Updates'}</span>
              <button onClick={() => setOpen(false)} className="p-1 text-white/70 hover:text-white">
                <X size={15} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-[13px] text-gray-400 text-center py-8 px-4">
                  {s.notifEmpty || (s.isRtl ? 'אין חדש — אתם מעודכנים' : 'Nothing new — you are all caught up')}
                </p>
              ) : items.map(it => (
                <button key={it.id}
                  onClick={() => { setOpen(false); onPick(it); }}
                  data-bell-item
                  className="flex items-start gap-2.5 w-full text-start px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50">
                  <span className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: KIND[it.kind].color }} />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold" style={{ color: KIND[it.kind].color }}>
                      {KIND[it.kind].word}
                      {it.workspace && (
                        <span className="ms-1.5 px-1.5 rounded-full text-[10px]"
                          style={{ backgroundColor: '#ede9fe', color: '#6d28d9' }}>{it.workspace}</span>
                      )}
                    </span>
                    <span className="block text-[13px] font-semibold text-gray-800 truncate">{it.text}</span>
                    {it.where && it.where !== it.text && (
                      <span className="block text-[11px] text-gray-400 truncate">{it.where}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

export function ContractorPortal() {
  const { token } = useParams<{ token: string }>();
  const {
    contractors, contractorAssignments, contractorNotes, contractorPhotos,
    apartments, stages, stageNotes, buildings,
    addContractorNote, addContractorPhoto, deleteContractorPhoto,
    updateContractorAssignment, addContractorAssignment, addActivityLog,
    updateApartment,
    contractorUiStrings, planAnnotations,
    workerLevels, updateContractor, canvasElements, users,
    projects, currentProjectId, setCurrentProject,
    startFirebaseSync, firebaseListening, snapshotTick,
  } = useStore();

  /**
   * The portal sits outside AppLayout, so nothing else starts the listeners.
   *
   * Without this a worker's phone shows whatever happens to be in that
   * browser's localStorage — which on a phone that has never opened the app is
   * nothing at all, and reads as "your link is broken".
   */
  useEffect(() => {
    if (!firebaseListening) startFirebaseSync();
  }, [firebaseListening, startFirebaseSync]);

  /**
   * Pull down the OTHER workspaces' snapshots too (the AppLayout idiom).
   *
   * The portal only ever syncs the open workspace live, and a worker's phone
   * has no reason to have visited the others — so without this, "which
   * workspaces have work for this person" can only see the one that happens
   * to be open, and the auto-switch below has nothing to switch to.
   */
  useEffect(() => {
    const { projects: ps, currentProjectId: cur } = useStore.getState();
    ps.filter(p => p.id !== cur).forEach(p => void ensureProjectSnapshot(p.id));
  }, []);

  const workerNow = contractors.find(c => c.token === token) ?? null;

  /**
   * Language: chosen from either end, and the same choice on both.
   *
   * The worker's own pick is stored ON the worker, so the office sees what
   * language his portal is in and can change it for him — which is what
   * happens when somebody rings up unable to read the screen. A pick made here
   * is written back; a pick made in the office arrives through the listener.
   */
  const [langOverride, setLangOverride] = useState<PortalLang | null>(null);
  const [scalePanel, setScalePanel] = useState(false);
  const lang = langOverride ?? workerNow?.lang ?? null;
  const s = lang === 'en' ? DEFAULT_CONTRACTOR_UI_STRINGS
           : lang === 'he' ? HEBREW_CONTRACTOR_UI_STRINGS
           : lang === 'ru' ? RUSSIAN_CONTRACTOR_UI_STRINGS
           : contractorUiStrings;
  /**
   * The language everything OTHER PEOPLE wrote is translated into for this
   * worker: his own choice when he has one, else whatever the office's
   * default portal strings read in. A Russian-speaking worker reads the
   * office's Hebrew in Russian; the office reads his Russian in its own.
   */
  const readLang: PortalLang = lang ?? (contractorUiStrings.isRtl ? 'he' : 'en');
  /** The four countdown words, in whatever language this worker reads. */
  const dueWords = {
    overdue: s.filterOverdue, today: s.filterToday,
    tomorrow: s.filterTomorrow, days: s.daysLabel ?? (s.isRtl ? 'ימים' : 'days'),
  };
  /**
   * Text size, applied at the ROOT.
   *
   * Tailwind sizes and paddings are rem-based, so scaling the document's font
   * size scales the whole portal proportionally — big text that still looks
   * like the same app, exactly like a phone's OS-level font setting, rather
   * than one field blown up out of a layout built for another size.
   */
  const textScale = workerNow?.textScale ?? 1;
  useEffect(() => {
    document.documentElement.style.fontSize = textScale === 1 ? '' : `${16 * textScale}px`;
    return () => { document.documentElement.style.fontSize = ''; };
  }, [textScale]);

  const setLang = (next: PortalLang) => {
    setLangOverride(next);
    if (workerNow) updateContractor(workerNow.id, { lang: next });
  };

  const [activeTab, setActiveTab] = useState<'tasks' | 'map' | 'calendar' | 'planner'>('tasks');
  /** Which building the map shows — a building id, 'all' for every one, '' for the first. */
  const [mapBuilding, setMapBuilding] = useState<string>('');
  /**
   * Which project's map he chose (owner, 2026-09-03: "which building map?"
   * asked on big squares, only when there is a choice). Remembered per
   * worker on this phone; the name button on the map changes it.
   */
  const [mapChosen, setMapChosen] = useState<string | null>(() => {
    try { return localStorage.getItem(`portal_map_${token ?? ''}`); } catch { return null; }
  });
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  /**
   * A task tapped on the list that lives in ANOTHER workspace: the switch
   * loads that workspace's collections, and this ref opens the task the
   * moment it lands (the list shows every workspace's tasks together now).
   */
  const pendingOpenTask = useRef<string | null>(null);
  const [selfTask, setSelfTask] = useState(false);
  const [selfText, setSelfText] = useState('');
  const [selfApt, setSelfApt] = useState('');
  /**
   * The rest of the office's task form, field for field. Adding work from the
   * site is the same act as adding it from the office, so it gets the same
   * vocabulary: who it is for (only with the assign-others permission), when,
   * at what stage, how urgent, and any photos of the problem.
   */
  const [selfFor, setSelfFor] = useState('');
  const [selfDue, setSelfDue] = useState(() => new Date().toISOString().slice(0, 10));
  const [selfStage, setSelfStage] = useState('');
  const [selfPriority, setSelfPriority] = useState<'urgent' | 'normal' | 'low'>('normal');
  const [selfFiles, setSelfFiles] = useState<{ id: string; filename: string; mimeType: string; dataUrl: string }[]>([]);
  const selfFileRef = useRef<HTMLInputElement>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<ContractorAssignment | null>(null);
  const [noteText, setNoteText] = useState('');
  /**
   * Dictation into the message box — the browser's own speech recognition
   * in the worker's language (the search tile's door). Words appear in the
   * box for him to fix and send; the big mic at the end is a different
   * thing (a recording, sent as one).
   */
  const dictate = useSpeechToText(
    (langOverride ?? workerNow?.lang) === 'he' ? 'he-IL'
      : (langOverride ?? workerNow?.lang) === 'ru' ? 'ru-RU' : 'en-US',
    text => setNoteText(text),
  );
  const [noteAttachments, setNoteAttachments] = useState<{ dataUrl: string; filename: string; mimeType: string; driveFileId?: string; driveUrl?: string; transcript?: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number } | null>(null);
  const [completing, setCompleting] = useState(false);
  /** The finished-task celebration, carrying the ready-to-paste office message. */
  const [celebrate, setCelebrate] = useState<{ msg: string } | null>(null);
  const [celebrateCopied, setCelebrateCopied] = useState(false);
  const [lightboxInfo, setLightboxInfo] = useState<{ photos: ContractorPhoto[]; index: number } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [mapFilter, setMapFilter] = useState<'yesterday' | 'today' | 'tomorrow' | 'week' | 'all'>('today');
  /**
   * Today is the opening filter and stays it (owner, 2026-09-03 — the
   * once-per-visit widening to All is gone). An empty Today says so in words
   * and offers every day in one press, so his work on other days is one tap
   * away rather than hidden.
   */
  const [showPlansPdf, setShowPlansPdf] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  /** The days a multi-day task still has ahead when the worker closes it. */
  const [finishAsk, setFinishAsk] = useState<string[] | null>(null);
  /**
   * The CLOSING screen (the owner's flow, 2026-08-24): the task sheet shows
   * one big "Close job" button; pressing it opens this — "add at least 3
   * pictures", the add button, the paperclip, the voice memo and the note all
   * in one place, and the FINAL Close job press at the bottom. Only then do
   * the finish-early ask and completion run.
   */
  const [closing, setClosing] = useState(false);
  /** The closing screen's own comment (decision 9) — one message, sent with
   *  the photos when the job is closed. Separate from the composer's text. */
  const [closingComment, setClosingComment] = useState('');
  /** The media that existed when the closing screen opened, so "the photos
   *  taken on that screen" is exactly the difference. */
  const preClosingIds = useRef<Set<string>>(new Set());
  const [planDlBusy, setPlanDlBusy] = useState(false);
  /** The map's "I did work here" flow — one small screen at a time. */
  const [workHere, setWorkHere] = useState<null | {
    aptId: string; step: 'view' | 'part' | 'stage' | 'finished' | 'note'; stageId?: string;
    /** The general job this report is filed under, once he has said so. */
    partOf?: string | null;
  }>(null);
  const [leftNote, setLeftNote] = useState('');
  /** How many pictures a closing needs. photosOptional workers skip it. */
  const MIN_CLOSE_MEDIA = 3;
  /** Weekly is what a worker plans his van by; the month grid is one press away. */
  const [calMode, setCalMode] = useState<'week' | 'month'>('month');
  const [calWeekOff, setCalWeekOff] = useState(0);
  const phonePortal = usePhone();
  const [showHistory, setShowHistory] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const noteAttachRef = useRef<HTMLInputElement>(null);

  const contractor = contractors.find(c => c.token === token && c.active) ?? null;
  const perms = permsOf(contractor, workerLevels);

  /**
   * Which workspaces have work for this person.
   *
   * Read straight out of each project's own stored snapshot, because only the
   * one that is open is live. Switching is the same call the wall makes — it
   * loads that project's collections into this browser and nothing else.
   */
  const myProjects = useMemo(() => {
    if (!contractor) return [];
    return loadAllProjectsTaskData()
      .map(p => ({
        id: p.projectId,
        name: projects.find(x => x.id === p.projectId)?.name ?? p.projectId,
        open: p.assignments.filter(a => a.contractorId === contractor.id && !a.completedAt).length,
        total: p.assignments.filter(a => a.contractorId === contractor.id).length,
      }))
      .filter(p => p.total > 0 || p.id === currentProjectId);
    // snapshotTick: a hydrated snapshot landing must recompute this, or a
    // fresh phone never learns which workspaces hold this worker's tasks.
  }, [contractor?.id, projects, currentProjectId, contractorAssignments, snapshotTick]);

  /**
   * Open on the workspace his work is IN.
   *
   * Which workspace the portal opens on is whatever `active_project` this
   * browser last held — on a worker's phone, a default nobody chose. A worker
   * whose jobs live in Netiv or on the Job Board opened onto Wolfson, saw
   * "No tasks yet", and — without the switchProject permission — had no way
   * to reach his own work at all.
   *
   * Once per visit: when the open workspace holds NONE of his tasks and
   * another holds some, go there (most open tasks wins). Decided on a settle
   * timer, the seeded-bins idiom — "he has nothing here" and "nothing has
   * loaded yet" look identical for the first moments, and data arriving
   * restarts the clock. His own later switch is never fought: the guard trips
   * the moment a workspace with his work is on screen.
   */
  const autoSwitched = useRef(false);
  useEffect(() => {
    if (autoSwitched.current || !contractor) return;
    const here = myProjects.find(p => p.id === currentProjectId);
    /**
     * OPEN tasks decide, not total. A single finished task in the open
     * workspace used to satisfy the guard, so a worker with one done job in
     * Wolfson and tomorrow's real work on the Job Board opened onto the done
     * one and never saw tomorrow ("I have a task for a contractor tomorrow
     * and it doesn't show it for him"). Only when NOWHERE has open work does
     * his history count as a reason to stay.
     */
    const best = myProjects.filter(p => p.open > 0)
      .sort((a, b) => (b.open - a.open) || (b.total - a.total))[0];
    if (here && (here.open > 0 || (!best && here.total > 0))) { autoSwitched.current = true; return; }
    if (!best) return;
    const t = setTimeout(() => {
      if (autoSwitched.current) return;
      autoSwitched.current = true;
      setCurrentProject(best.id);
      setMapBuilding('');
    }, 1600);
    return () => clearTimeout(t);
  }, [contractor?.id, myProjects, currentProjectId, setCurrentProject]);

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
  const wsNameOf = (pid: string) => projects.find(p => p.id === pid)?.name ?? pid;
  const currentWsName = wsNameOf(currentProjectId);
  /**
   * His tasks in the OTHER workspaces — read from each one's stored snapshot,
   * because only the open workspace is live (the workspace chip row is gone;
   * the list shows everything together, each card wearing its workspace).
   */
  const otherTasks = useMemo(() => {
    const out: { a: ContractorAssignment; apt?: Apartment; projectId: string; projectName: string }[] = [];
    for (const p of loadAllProjectsTaskData()) {
      if (p.projectId === currentProjectId) continue;
      const name = projects.find(x => x.id === p.projectId)?.name ?? p.projectId;
      for (const a of p.assignments) {
        if (a.contractorId !== contractorId) continue;
        out.push({ a, apt: p.apartments.find(x => x.id === a.apartmentId), projectId: p.projectId, projectName: name });
      }
    }
    return out;
  // snapshotTick: a hydrated snapshot landing must recompute this.
  }, [contractorId, currentProjectId, projects, snapshotTick]);
  /** "Apt 47" — or "Work at Wolfson" for a general job. */
  const whereLabel = (a: ContractorAssignment, apt: Apartment | undefined, ws: string) =>
    a.general ? workAtLabel(readLang, ws) : `${s.isRtl ? 'דירה' : 'Apt'} ${aptLabel(apt)}`;
  /** Open a task — switching workspace first when it lives elsewhere. */
  const openTask = (pid: string, a: ContractorAssignment) => {
    setShowHistory(false);
    if (pid === currentProjectId) { setSelectedAssignment(a); return; }
    pendingOpenTask.current = a.id;
    setCurrentProject(pid);
    setMapBuilding('');
  };

  const getApt = (id: string) => apartments.find(a => a.id === id);
  const getStage = (id: string | null) => stages.find(s => s.id === id);
  useEffect(() => {
    const id = pendingOpenTask.current;
    if (!id) return;
    const a = contractorAssignments.find(x => x.id === id);
    if (a) { pendingOpenTask.current = null; setSelectedAssignment(a); }
  }, [contractorAssignments]);
  const getMedia = (assignmentId: string) => contractorPhotos.filter(p => p.assignmentId === assignmentId);
  const getNotes = (assignmentId: string) => contractorNotes.filter(n => n.assignmentId === assignmentId);

  /**
   * The plan a worker is about to look at becomes link-shared (the owner's
   * decision): the plan view is Google's preview iframe and the marked-up
   * plan is a plain Drive link, both served by drive.google.com — which knows
   * nothing about the portal token and demands a Google login from anyone
   * outside the company account. Fired when the task sheet opens, so every
   * plan heals itself the first time it is actually needed on site.
   */
  useEffect(() => {
    if (!selectedAssignment) return;
    const apt = apartments.find(x => x.id === selectedAssignment.apartmentId);
    const planId = apt?.plansPdfLink ? extractFileId(apt.plansPdfLink) : null;
    ensureDriveShared(planId);
    if (apt && planId) {
      const latest = planAnnotations
        .filter(x => x.apartmentId === apt.id && x.planFileId === planId && x.driveFileId)
        .sort((a, b) => b.version - a.version)[0];
      ensureDriveShared(latest?.driveFileId);
    }
  }, [selectedAssignment, apartments, planAnnotations]);

  const assignedAptIds = new Set(assignments.map(a => a.apartmentId));

  /**
   * Multi-day tasks: the task carries ALL of its days (the owner's ruling),
   * so the schedule shows it on every one, a filter matches on ANY of them,
   * and the countdown badge counts to the NEXT day it covers — falling back
   * to the last, so a task whose days have all passed still reads Overdue.
   * A single-date task falls out of the same rule: `daysOf` gives [dueDate].
   */
  const effectiveDue = (a: ContractorAssignment): string | null => {
    const list = daysOf(a);
    if (!list.length) return null;
    const today = format(new Date(), 'yyyy-MM-dd');
    return list.find(d => d >= today) ?? list[list.length - 1];
  };
  const dayOffsets = (a: ContractorAssignment): number[] => {
    const today = startOfDay(new Date());
    return daysOf(a).map(d => differenceInCalendarDays(parseISO(d), today));
  };

  const aptSubLabels = useMemo(() => {
    const m = new Map<string, string>();
    const today = startOfDay(new Date());
    [...assignments]
      .filter(a => !a.completedAt && a.dueDate)
      .sort((a, b) => (effectiveDue(a) ?? '').localeCompare(effectiveDue(b) ?? ''))
      .forEach(a => {
        if (m.has(a.apartmentId)) return;
        const eff = effectiveDue(a)!;
        const days = differenceInCalendarDays(parseISO(eff), today);
        const label =
          days === -1 ? s.filterYesterday :
          days < 0  ? s.filterOverdue :
          days === 0 ? s.filterToday :
          days === 1 ? s.filterTomorrow :
          format(parseISO(eff), 'MMM d');
        m.set(a.apartmentId, label);
      });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, s]);

  const filteredAptIds = useMemo(() => {
    if (mapFilter === 'all') return assignedAptIds;
    const matching = new Set<string>();
    assignments.forEach(a => {
      if (a.completedAt || !a.dueDate) return;
      const offs = dayOffsets(a);
      if (mapFilter === 'yesterday' && offs.includes(-1)) matching.add(a.apartmentId);
      else if (mapFilter === 'today' && offs.includes(0)) matching.add(a.apartmentId);
      else if (mapFilter === 'tomorrow' && offs.includes(1)) matching.add(a.apartmentId);
      else if (mapFilter === 'week' && offs.some(d => d >= 0 && d <= 7)) matching.add(a.apartmentId);
    });
    return matching;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFilter, assignments]);

  const filteredAssignments = useMemo(() => {
    if (mapFilter === 'all') return assignments;
    return assignments.filter(a => {
      if (a.completedAt) return false;
      if (!a.dueDate) return false;
      const offs = dayOffsets(a);
      if (mapFilter === 'yesterday') return offs.includes(-1);
      if (mapFilter === 'today') return offs.includes(0);
      if (mapFilter === 'tomorrow') return offs.includes(1);
      if (mapFilter === 'week') return offs.some(d => d >= 0 && d <= 7);
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFilter, assignments]);
  type ListRow = { a: ContractorAssignment; apt?: Apartment; projectId: string; projectName: string; live: boolean };
  const listRows: ListRow[] = useMemo(() => {
    const passes = (a: ContractorAssignment) => {
      if (mapFilter === 'all') return true;
      if (a.completedAt || !a.dueDate) return false;
      const offs = dayOffsets(a);
      if (mapFilter === 'yesterday') return offs.includes(-1);
      if (mapFilter === 'today') return offs.includes(0);
      if (mapFilter === 'tomorrow') return offs.includes(1);
      if (mapFilter === 'week') return offs.some(d => d >= 0 && d <= 7);
      return true;
    };
    const live: ListRow[] = filteredAssignments.map(a => ({ a, apt: getApt(a.apartmentId), projectId: currentProjectId, projectName: currentWsName, live: true }));
    const foreign: ListRow[] = otherTasks.filter(r => passes(r.a)).map(r => ({ ...r, live: false }));
    return [...live, ...foreign];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredAssignments, otherTasks, mapFilter, currentProjectId, currentWsName, apartments]);
  const openEverywhere = assignments.filter(a => !a.completedAt).length + otherTasks.filter(r => !r.a.completedAt).length;

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
            ensureDriveShared(photosFolderId);
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
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (noteAttachRef.current) noteAttachRef.current.value = '';

    const apt = selectedAssignment ? getApt(selectedAssignment.apartmentId) : null;
    const mainFolderId = apt?.driveLink ? extractFolderId(apt.driveLink) : null;

    for (const file of files) {
      const isImg = detectFileType(file) === 'image';
      const dataUrl = isImg ? await compressImage(file) : await readAsDataUrl(file);

      if (isUploadBackendConfigured() && mainFolderId) {
        try {
          const photosFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Photos');
        ensureDriveShared(photosFolderId);
          ensureDriveShared(photosFolderId);
          const notesFolderId = await findOrCreateFolderViaBackend(photosFolderId, 'Contractor Notes');
          const { fileId, webViewLink } = await uploadFileViaResumableSession(notesFolderId, file);
          await shareFileToDrive(fileId);
          setNoteAttachments(prev => [...prev, { dataUrl: isImg ? dataUrl : '', filename: file.name, mimeType: file.type, driveFileId: fileId, driveUrl: webViewLink }]);
          continue;
        } catch { /* fall through to local */ }
      }
      setNoteAttachments(prev => [...prev, { dataUrl, filename: file.name, mimeType: file.type }]);
    }
  }

  /**
   * A voice memo attaches exactly like any other file.
   *
   * Giving it its own field would mean a new key in the record, in persist, in
   * export and in import (CLAUDE.md's standing rule), plus a second upload path
   * to keep in step with the first. It is an audio file; the note already knows
   * how to carry a file.
   */
  async function handleNoteVoiceMemo(memo: RecordedMemo) {
    const ext = memo.blob.type.includes('mp4') ? 'm4a' : 'webm';
    const file = new File([memo.blob], `voice-memo-${Date.now()}.${ext}`,
      { type: memo.blob.type || 'audio/webm' });
    const apt = selectedAssignment ? getApt(selectedAssignment.apartmentId) : null;
    const mainFolderId = apt?.driveLink ? extractFolderId(apt.driveLink) : null;

    if (isUploadBackendConfigured() && mainFolderId) {
      try {
        const photosFolderId = await findOrCreateFolderViaBackend(mainFolderId, 'Photos');
        ensureDriveShared(photosFolderId);
        const notesFolderId = await findOrCreateFolderViaBackend(photosFolderId, 'Contractor Notes');
        const { fileId, webViewLink } = await uploadFileViaResumableSession(notesFolderId, file);
        await shareFileToDrive(fileId);
        setNoteAttachments(prev => [...prev, {
          dataUrl: '', filename: file.name, mimeType: file.type,
          driveFileId: fileId, driveUrl: webViewLink,
        }]);
        // The words, as soon as the server has them — stored on the note
        // when it is sent, so the office reads them at once.
        void transcribeMemo(webViewLink).then(t => {
          if (t) setNoteAttachments(prev => prev.map(x => x.driveFileId === fileId ? { ...x, transcript: t } : x));
        });
        return;
      } catch { /* fall through to local */ }
    }
    const dataUrl = await readAsDataUrl(file);
    setNoteAttachments(prev => [...prev, { dataUrl, filename: file.name, mimeType: file.type }]);
    void transcribeMemo(dataUrl).then(t => {
      if (t) setNoteAttachments(prev => prev.map(x => x.dataUrl === dataUrl ? { ...x, transcript: t } : x));
    });
  }

  function handleSendNote() {
    if (!selectedAssignment || (!noteText.trim() && noteAttachments.length === 0)) return;
    const apt = getApt(selectedAssignment.apartmentId);
    const text = noteText.trim();
    const base = {
      assignmentId: selectedAssignment.id,
      apartmentId: selectedAssignment.apartmentId,
      contractorId,
      authorType: 'contractor' as const,
      authorId: contractorId,
      authorName: contractor?.name ?? '',
    };

    if (noteAttachments.length === 0) {
      addContractorNote({ ...base, text });
    } else {
      noteAttachments.forEach((att, i) => {
        addContractorNote({
          ...base,
          text: i === 0 ? (text || att.filename) : att.filename,
          attachmentDataUrl: att.driveFileId ? '' : att.dataUrl,
          attachmentFilename: att.filename,
          attachmentMimeType: att.mimeType,
          attachmentDriveFileId: att.driveFileId,
          attachmentDriveUrl: att.driveUrl,
          transcript: att.transcript,
        });
      });
      if (text && noteAttachments.length > 1) {
        // text was already on the first note; additional notes carry filename as text
      }
    }

    addActivityLog({
      apartmentId: selectedAssignment.apartmentId,
      apartmentNumber: apt?.apartmentNumber ?? '',
      buildingId: selectedAssignment.buildingId,
      userId: contractorId,
      userName: contractor!.name,
      actionType: 'contractor_note',
      fieldChanged: 'note_added',
      previousValue: '',
      newValue: text.slice(0, 80) || `${noteAttachments.length} file(s)`,
      stageId: selectedAssignment.stageId ?? '',
    });
    setNoteText('');
    setNoteAttachments([]);
  }

  /**
   * A new task selection always starts OUTSIDE the closing screen — except a
   * sheet the "I did work here" flow opens: the worker just said the stage is
   * finished, so he arrives straight ON the closing screen. A ref, because
   * this effect fires on the very selection that flow makes, and a plain
   * setClosing(true) beside setSelectedAssignment would be undone right here.
   */
  const arriveClosingRef = useRef(false);
  useEffect(() => {
    if (arriveClosingRef.current) { arriveClosingRef.current = false; setClosing(true); return; }
    setClosing(false);
  }, [selectedAssignment?.id]);

  // The moment the closing screen opens, remember which media already existed
  // — the closing comment carries exactly the photos taken ON that screen.
  useEffect(() => {
    if (closing && selectedAssignment) {
      preClosingIds.current = new Set(getMedia(selectedAssignment.id).map(m => m.id));
      setClosingComment('');
      setFinishAsk(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

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
    setClosing(false);
    setCompleting(true);
    setTimeout(() => setCompleting(false), 800);

    /**
     * The report back to the office, written FOR them.
     *
     * WhatsApp is how the site actually talks to the office, so the moment of
     * finishing hands over a message ready to paste: what was done, where, by
     * whom, and the links to the proof. Building it here — not on demand —
     * means the photo list is exactly what existed at the moment of finishing.
     */
    const media = getMedia(selectedAssignment.id);
    const links = media
      .map(m => m.driveUrl || m.storageUrl)
      .filter((u): u is string => !!u);
    const he = !!s.isRtl;
    const lines = [
      he ? '✅ המשימה הושלמה!' : '✅ Task finished!',
      `🏠 ${apt ? aptLabel(apt) : selectedAssignment.buildingId}${apt?.address ? ' — ' + apt.address : ''}`,
      `🔧 ${selectedAssignment.taskDescription}`,
      `👷 ${contractor!.name}`,
      media.length
        ? (he ? `📸 ${media.length} תמונות/קבצים:` : `📸 ${media.length} photo${media.length === 1 ? '' : 's'}/files:`)
        : (he ? '📸 בלי תמונות' : '📸 No photos'),
      ...links,
      `🕒 ${new Date().toLocaleString(he ? 'he-IL' : 'en-GB')}`,
    ];
    setCelebrate({ msg: lines.join('\n') });
  }

  function handleUncomplete() {
    if (!selectedAssignment) return;
    updateContractorAssignment(selectedAssignment.id, { completedAt: null });
  }

  /**
   * The plan handed over as a FILE, through the app's own /api/drive-fetch —
   * never a drive.google.com link, which turns away a worker not signed into
   * Google (decision 6). The Drive URL survives only as the last resort when
   * the fetch itself fails.
   */
  async function downloadPlanFile(fileId: string, jobName: string) {
    setPlanDlBusy(true);
    try {
      const buf = await fetchPlanBytes(fileId);
      const bytes = new Uint8Array(buf);
      const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50;
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      const ext = isPdf ? 'pdf' : isPng ? 'png' : 'jpg';
      const mime = isPdf ? 'application/pdf' : isPng ? 'image/png' : 'image/jpeg';
      saveBytes(bytes, `${safeFileName(`${jobName} — ${s.engineeringPlans}`)}.${ext}`, mime);
    } catch {
      window.open(driveDownloadUrl(fileId), '_blank', 'noopener');
    } finally {
      setPlanDlBusy(false);
    }
  }

  /**
   * The closing comment lands in the conversation (decision 9): ONE
   * contractor note carrying the comment — which may be empty — and the ids
   * of the photos taken on the closing screen, written just before the task
   * completes so it sits right above the "Job closed" marker. Attachments
   * from the comment box's paperclip and microphone ride along (the first on
   * the closing note, any others as their own messages just before it).
   * With nothing at all to say, no empty bubble is minted — the marker alone
   * records the close.
   */
  function postClosingNote() {
    if (!selectedAssignment) return;
    const text = closingComment.trim();
    const newPhotoIds = getMedia(selectedAssignment.id)
      .map(m => m.id)
      .filter(id => !preClosingIds.current.has(id));
    if (!text && newPhotoIds.length === 0 && noteAttachments.length === 0) return;
    const base = {
      assignmentId: selectedAssignment.id,
      apartmentId: selectedAssignment.apartmentId,
      contractorId,
      authorType: 'contractor' as const,
      authorId: contractorId,
      authorName: contractor?.name ?? '',
    };
    const [first, ...rest] = noteAttachments;
    rest.forEach(att => {
      addContractorNote({
        ...base,
        text: att.filename,
        attachmentDataUrl: att.driveFileId ? '' : att.dataUrl,
        attachmentFilename: att.filename,
        attachmentMimeType: att.mimeType,
        attachmentDriveFileId: att.driveFileId,
        attachmentDriveUrl: att.driveUrl,
      });
    });
    addContractorNote({
      ...base,
      text,
      photoIds: newPhotoIds.length ? newPhotoIds : undefined,
      ...(first ? {
        attachmentDataUrl: first.driveFileId ? '' : first.dataUrl,
        attachmentFilename: first.filename,
        attachmentMimeType: first.mimeType,
        attachmentDriveFileId: first.driveFileId,
        attachmentDriveUrl: first.driveUrl,
        transcript: first.transcript,
      } : {}),
    });
    setClosingComment('');
    setNoteAttachments([]);
  }

  /** The final press on the closing screen: the finish-early ask still fires
   *  first when the task has days left; otherwise the comment posts and the
   *  job closes in one motion. */
  function handleSendAndClose() {
    if (!selectedAssignment || !canComplete) return;
    const future = futureDaysOf(selectedAssignment.days, format(new Date(), 'yyyy-MM-dd'));
    if (future.length) { setFinishAsk(future); return; }
    postClosingNote();
    handleConfirmComplete();
  }

  /**
   * Tapping an apartment on the map opens ITS sheet: the same view as before
   * (his tasks there, one tap deeper), plus the big "I did work here"
   * button — the start of the stage-report flow, one small step at a time:
   * what did you do → did you finish → yes: pictures and close (the standing
   * closing screen), no: a note of what is left, and the stage goes HALF
   * DONE (orange) for the office.
   */
  function handleDiagramClick(apt: typeof apartments[0]) {
    setWorkHere({ aptId: apt.id, step: 'view' });
    setShowHistory(false);
  }

  const selMedia = selectedAssignment ? getMedia(selectedAssignment.id) : [];
  const selNotes = selectedAssignment ? getNotes(selectedAssignment.id) : [];
  const selOfficeNotes = selNotes.filter(n => n.authorType === 'office');
  const selContractorNotes = selNotes.filter(n => n.authorType === 'contractor');
  // Three pictures close a job, unless the office relaxed it for this worker.
  const canComplete = (selMedia.length >= MIN_CLOSE_MEDIA || !!contractor?.photosOptional)
    && !selectedAssignment?.completedAt;

  type FilterKey = 'yesterday' | 'today' | 'tomorrow' | 'week' | 'all';
  // ALL leads, per the owner — the everything view is the anchor the eye
  // returns to, and at the end of the row it kept being hunted for.
  const filterOptions: { key: FilterKey; label: string; color: string }[] = [
    { key: 'all',       label: s.filterAll,        color: '#1e3a5f' },
    { key: 'yesterday', label: s.filterYesterday, color: '#6b7280' },
    { key: 'today',     label: s.filterToday,     color: '#f97316' },
    { key: 'tomorrow',  label: s.filterTomorrow,  color: '#f59e0b' },
    { key: 'week',      label: s.filterThisWeek,  color: '#3b82f6' },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f0f4f8' }} dir={s.isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      {/* The right-hand group used to be five fixed-size things beside a
          32px logo, which needed 408px of a 390px phone — the worker's own
          name and his task count sat off the edge of the screen he uses all
          day. It shrinks now: the group may give up width, the name lines
          truncate rather than push, and the category pill (which repeats what
          his work already tells him) steps aside on the narrowest screens. */}
      <header data-portal-header
        className="grid items-center gap-2 px-3 py-2.5 shadow-md flex-shrink-0"
        style={{ backgroundColor: '#0f1f35', gridTemplateColumns: '1fr auto 1fr' }}>
        {/* The worker on the left, small. */}
        <div className="min-w-0">
          <div className="text-white text-[13px] font-bold truncate">{contractor!.name}</div>
          <div className="text-gray-400 text-[11px] truncate">
            {openEverywhere} {openEverywhere !== 1 ? s.taskPlural : s.taskSingular} · {assignments.filter(a => a.completedAt).length + otherTasks.filter(r => r.a.completedAt).length} {s.doneLabel}
          </div>
        </div>
        {/* The logo in the MIDDLE, a real mark (owner, 2026-09-03). */}
        <img src="/tzviair-logo.png" alt="TzviAir" data-portal-logo
          className="h-8 w-auto justify-self-center"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.9)) drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }} />
        {/* Everything that acts, on the right: the bell, then the gear.
            Print left the phone; the language lives inside the gear now. */}
        <div className="flex items-center justify-end gap-2 min-w-0">
          {workerNow && (workerNow.notifyScope ?? 'all') !== 'off' && (
            <PortalBell
              contractor={workerNow}
              s={s}
              lang={readLang}
              currentProjectId={currentProjectId}
              allAssignments={contractorAssignments}
              allApartments={apartments}
              projects={projects}
              snapshotTick={snapshotTick}
              onPick={it => {
                if (it.projectId !== currentProjectId) {
                  // The task lives in another workspace — go where it is (the
                  // auto-switch precedent); the list there shows it.
                  setCurrentProject(it.projectId);
                  setMapBuilding('');
                  setActiveTab('tasks');
                  return;
                }
                const a = contractorAssignments.find(x => x.id === it.taskId);
                if (a) { setActiveTab('tasks'); setSelectedAssignment(a); setShowHistory(false); }
              }}
            />
          )}
          <div className="relative">
            <button
              data-portal-gear
              onClick={() => setScalePanel(v => !v)}
              className="flex items-center justify-center w-9 h-9 rounded-xl border border-white/25 text-white/85 hover:bg-white/10 active:bg-white/20 transition-colors"
              title={s.isRtl ? 'הגדרות' : lang === 'ru' ? 'Настройки' : 'Settings'}
            >
              <SettingsIcon size={16} />
            </button>
            {scalePanel && (
              <>
                <div className="fixed inset-0 z-[119]" onClick={() => setScalePanel(false)} />
                <div className="absolute top-full mt-1.5 z-[120] bg-white rounded-xl shadow-xl border border-gray-200 p-2 w-48"
                  style={s.isRtl ? { left: 0 } : { right: 0 }}>
                  <div className="text-[10px] font-bold text-gray-400 px-1.5 pb-1">
                    {s.isRtl ? 'גודל הטקסט' : lang === 'ru' ? 'Размер текста' : 'Text size'}
                  </div>
                  {([[1, s.isRtl ? 'רגיל' : lang === 'ru' ? 'Обычный' : 'Normal'],
                     [1.15, s.isRtl ? 'גדול' : lang === 'ru' ? 'Крупный' : 'Large'],
                     [1.3, s.isRtl ? 'גדול מאוד' : lang === 'ru' ? 'Очень крупный' : 'Extra large'],
                     [1.5, s.isRtl ? 'ענק' : lang === 'ru' ? 'Огромный' : 'Huge']] as const).map(([v, label]) => (
                    <button key={v}
                      onClick={() => {
                        if (workerNow) updateContractor(workerNow.id, { textScale: v === 1 ? undefined : v });
                        setScalePanel(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center justify-between ${
                        textScale === v ? 'bg-[#eef4fa] font-bold' : ''}`}
                      style={{ fontSize: `${13 * v}px` }}>
                      {label}
                      {textScale === v && <span className="text-[#1e3a5f]">✓</span>}
                    </button>
                  ))}
                  {/* The language, all three — written onto the worker, so
                      the office sees it and messages are translated into it. */}
                  <div className="text-[10px] font-bold text-gray-400 px-1.5 pt-2 pb-1 border-t border-gray-100 mt-1">
                    {s.isRtl ? 'שפה' : lang === 'ru' ? 'Язык' : 'Language'}
                  </div>
                  <div className="flex gap-1 px-1 pb-1" data-portal-langs>
                    {([['en', 'EN'], ['he', 'עב'], ['ru', 'RU']] as const).map(([code, label]) => (
                      <button key={code} data-portal-lang={code}
                        onClick={() => { setLang(code); setScalePanel(false); }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold border ${
                          lang === code
                            ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                            : 'text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Tab bar. A tab this worker's level does not allow is not drawn — a
          greyed-out tab is an invitation to ask why. */}
      <div className="flex bg-white border-b border-gray-200 flex-shrink-0">
        <button onClick={() => setActiveTab('tasks')}
          className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'tasks' ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]' : 'text-gray-500'
          }`}>
          <FileText size={15} /> {s.myTasks}
        </button>
        {perms.seeSchedule && (
          <button onClick={() => setActiveTab('calendar')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'calendar' ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]' : 'text-gray-500'
            }`}>
            <CalendarDays size={15} /> {s.calendarTab}
          </button>
        )}
        {perms.seeDiagrams && (
          <button onClick={() => setActiveTab('map')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'map' ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]' : 'text-gray-500'
            }`}>
            <MapPin size={15} /> {s.buildingMap}
          </button>
        )}
        {perms.seePlanner && (
          <button onClick={() => setActiveTab('planner')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'planner' ? 'text-[#1e3a5f] border-b-2 border-[#1e3a5f]' : 'text-gray-500'
            }`}>
            <CalendarDays size={15} /> {s.isRtl ? 'לוח' : 'Planner'}
          </button>
        )}
      </div>

      {/* The day bar — above the task list. The map carries its own combined
          row (projects · divider · days) so both filters read as one place. */}
      {activeTab === 'tasks' && (
      <div className="bg-white border-b border-gray-100 px-3 py-2.5 flex gap-2 overflow-x-auto flex-shrink-0 edge-fade">
        {filterOptions.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setMapFilter(key)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              mapFilter === key ? 'text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            style={mapFilter === key ? { backgroundColor: color } : {}}
          >
            {label}
          </button>
        ))}
      </div>
      )}

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <main className="flex-1 p-4 max-w-2xl mx-auto w-full">
          {/*
            Writing yourself a task.

            For somebody who finds work on site — a damaged grille, a wall that
            is not ready — and needs it recorded rather than remembered. It is
            an ordinary task in every respect: it takes photos, it appears in
            the office, and it is closed the same way. Off unless the level
            allows it.
          */}
          {(perms.selfAssign || perms.assignOthers) && (
            <div className="mb-4">
              {!selfTask ? (
                <button onClick={() => setSelfTask(true)}
                  className="w-full py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold
                             text-gray-500 hover:text-[#1e3a5f] hover:border-[#4aa8d8] transition-colors"
                  style={{ borderColor: '#d1d5db' }}>
                  + {perms.assignOthers
                    ? (s.isRtl ? 'משימה חדשה' : 'A new task')
                    : (s.isRtl ? 'משימה לעצמי' : 'A job for myself')}
                </button>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                  <input
                    autoFocus
                    value={selfText}
                    onChange={e => setSelfText(e.target.value)}
                    placeholder={s.isRtl ? 'מה צריך לעשות?' : 'What needs doing?'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4aa8d8]"
                  />

                  {/* Only a worker ALLOWED to hand out work sees the picker —
                      for everybody else a task they add is their own, and the
                      field would only be a way to get it wrong. */}
                  {perms.assignOthers && (
                    <select
                      value={selfFor || contractorId}
                      onChange={e => setSelfFor(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4aa8d8]"
                    >
                      {contractors.filter(c => c.active).map(c => (
                        <option key={c.id} value={c.id}>
                          {c.id === contractorId ? (s.isRtl ? 'בשבילי — ' : 'For me — ') : ''}{c.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <select
                    value={selfApt}
                    onChange={e => setSelfApt(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4aa8d8]"
                  >
                    <option value="">{s.isRtl ? 'איפה?' : 'Where?'}</option>
                    {/* Their own units first — that is where the work almost
                        always is — then everything else if they can see it.
                        Somebody allowed to HAND OUT work gets the full list
                        regardless: you cannot give a task without being able
                        to say where it is. */}
                    {[...apartments]
                      .filter(a => !a.isUnnamed
                        && (perms.seeAllApartments || perms.assignOthers || assignedAptIds.has(a.id)))
                      .sort((a, b) => Number(assignedAptIds.has(b.id)) - Number(assignedAptIds.has(a.id)))
                      .slice(0, 400)
                      .map(a => (
                        <option key={a.id} value={a.id}>
                          {assignedAptIds.has(a.id) ? '★ ' : ''}{aptLabel(a)}
                          {a.buildingId !== 'G' ? ` · ${a.buildingId}` : ''}
                        </option>
                      ))}
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="block text-[10px] font-bold text-gray-400 mb-0.5">
                        {s.isRtl ? 'לְמָתַי' : 'Due'}
                      </span>
                      <input type="date" value={selfDue} onChange={e => setSelfDue(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-[#4aa8d8]" />
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-bold text-gray-400 mb-0.5">
                        {s.isRtl ? 'דחיפות' : 'Priority'}
                      </span>
                      <select value={selfPriority}
                        onChange={e => setSelfPriority(e.target.value as 'urgent' | 'normal' | 'low')}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-[#4aa8d8]">
                        <option value="urgent">{s.isRtl ? 'דחוף' : 'Urgent'}</option>
                        <option value="normal">{s.isRtl ? 'רגיל' : 'Normal'}</option>
                        <option value="low">{s.isRtl ? 'נמוך' : 'Low'}</option>
                      </select>
                    </label>
                  </div>

                  <select value={selfStage} onChange={e => setSelfStage(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4aa8d8]">
                    <option value="">{s.isRtl ? 'שלב (לא חובה)' : 'Stage (optional)'}</option>
                    {stages.filter(st => st.active).sort((a, b) => a.order - b.order).map(st => (
                      <option key={st.id} value={st.id}>{s.isRtl && st.nameHe ? st.nameHe : st.name}</option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={() => selfFileRef.current?.click()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200
                                 text-xs font-semibold text-gray-500 min-h-[32px]">
                      📎 {s.isRtl ? 'צרף קבצים' : 'Attach'}
                      {selfFiles.length > 0 && <span className="text-[#1e3a5f] font-bold">{selfFiles.length}</span>}
                    </button>
                    {selfFiles.map(f => (
                      <span key={f.id} className="flex items-center gap-1 text-[10.5px] text-gray-500
                                                  bg-gray-50 border border-gray-200 rounded-full px-2 py-1 max-w-[140px]">
                        <span className="truncate">{f.filename}</span>
                        <button onClick={() => setSelfFiles(prev => prev.filter(x => x.id !== f.id))}
                          className="text-gray-300 hover:text-red-500">×</button>
                      </span>
                    ))}
                    <input ref={selfFileRef} type="file" multiple accept="image/*,.pdf" className="hidden"
                      onChange={e => {
                        const files = [...(e.target.files ?? [])].slice(0, 5);
                        files.forEach(file => {
                          const r = new FileReader();
                          r.onload = () => setSelfFiles(prev => [...prev, {
                            id: `TA-${Math.random().toString(36).slice(2, 9)}`,
                            filename: file.name, mimeType: file.type, dataUrl: String(r.result),
                          }]);
                          r.readAsDataURL(file);
                        });
                        e.target.value = '';
                      }} />
                  </div>

                  <div className="flex gap-2">
                    <button
                      disabled={!selfText.trim() || !selfApt}
                      onClick={() => {
                        const apt = apartments.find(a => a.id === selfApt);
                        if (!apt) return;
                        addContractorAssignment({
                          contractorId: (perms.assignOthers && selfFor) ? selfFor : contractorId,
                          apartmentId: apt.id,
                          buildingId: apt.buildingId,
                          taskDescription: selfText.trim(),
                          /**
                           * Dated — never blank. The portal's list is filtered
                           * by date, so a dateless task lands outside every
                           * filter and disappears the instant it is written.
                           */
                          dueDate: selfDue || new Date().toISOString().slice(0, 10),
                          stageId: selfStage || apt.currentStageId || null,
                          priority: selfPriority,
                          attachments: selfFiles.length ? selfFiles : undefined,
                          completedAt: null,
                          createdBy: contractorId,
                          createdByName: contractor!.name,
                        } as never);
                        setSelfText(''); setSelfApt(''); setSelfTask(false);
                        setSelfFor(''); setSelfStage(''); setSelfPriority('normal'); setSelfFiles([]);
                        setSelfDue(new Date().toISOString().slice(0, 10));
                      }}
                      className="flex-1 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
                      style={{ backgroundColor: '#1e3a5f' }}>
                      {s.isRtl ? 'הוספה' : 'Add it'}
                    </button>
                    <button onClick={() => { setSelfTask(false); setSelfText(''); setSelfApt(''); setSelfFiles([]); }}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-500 border border-gray-200">
                      {s.isRtl ? 'ביטול' : 'Cancel'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                <FileText size={28} className="text-blue-400" />
              </div>
              <p className="text-gray-600 font-medium">{s.noAssignments}</p>
              <p className="text-gray-400 text-sm mt-1">{s.noAssignmentsHint}</p>
            </div>
          ) : listRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center" data-list-empty>
              <Clock size={32} className="text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm font-medium">
                {mapFilter === 'today' ? (s.nothingToday || 'Nothing for today') : (s.noAssignments)}
              </p>
              {mapFilter !== 'all' && openEverywhere > 0 && (
                <button
                  data-show-all-days
                  onClick={() => setMapFilter('all')}
                  className="mt-3 px-4 py-2 rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: '#1e3a5f' }}
                >
                  {s.showAllDays || 'Show every day'} · {openEverywhere}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {listRows.map(({ a, apt, projectId: rowPid, projectName: rowWs, live }) => {
                const stage = live ? getStage(a.stageId) : undefined;
                const media = live ? getMedia(a.id) : [];
                const notes = live ? getNotes(a.id) : [];
                const isOverdue = a.dueDate && !a.completedAt && isPast(parseISO(a.dueDate));
                const isDone = !!a.completedAt;
                const dueBadge = getDueBadge(effectiveDue(a), dueWords);

                return (
                  <button key={`${rowPid}:${a.id}`} data-task-card={a.id} data-task-ws={rowPid}
                    onClick={() => openTask(rowPid, a)}
                    className={`w-full text-left bg-white rounded-2xl shadow-sm border p-4 transition-all active:scale-[0.99] hover:shadow-md ${
                      a.general ? 'border-dashed' : 'border-gray-100'}`}
                    style={a.general ? { borderColor: '#b8860b', backgroundColor: '#fffdf5' } : undefined}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-[#1e3a5f] text-base">
                            {whereLabel(a, apt, rowWs)}
                          </span>
                          {/* WHICH workspace — each card says, in that
                              workspace's colour, since the list holds them all. */}
                          <span data-task-ws-chip className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: `${projectColor(projects, rowPid)}1f`, color: projectColor(projects, rowPid) }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: projectColor(projects, rowPid) }} />
                            {rowWs}{!a.general && a.buildingId && a.buildingId !== 'G' ? ` · ${a.buildingId}` : ''}
                          </span>
                          {stage && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: stage.color + '22', color: stage.color }}>
                              {getStageName(stage, s.isRtl)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate"><TrText text={a.taskDescription} to={readLang} /></p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {a.dueDate && (
                            <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                              <CalendarDays size={11} />
                              {/* EVERY day the task covers — a task that takes
                                  days carries all of them now. */}
                              {a.days?.length
                                ? a.days.map(d => format(parseISO(d), 'EEE d MMM')).join(' · ')
                                : format(parseISO(a.dueDate), 'MMM d, yyyy')}
                            </span>
                          )}
                          {dueBadge && !isDone && (
                            <span className={`text-xs px-1.5 py-0.5 rounded border font-semibold ${dueBadge.cls}`}>
                              {dueBadge.text}
                            </span>
                          )}
                          {a.general && (a.visits?.length ?? 0) > 0 && (
                            <span data-visits-count className="text-xs font-bold" style={{ color: '#8a6508' }}>
                              {a.visits!.length} {s.visitsLabel?.toLowerCase() || 'visited'}
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

      {/* Calendar tab */}
      {activeTab === 'calendar' && (() => {
        const calRows = [
          ...assignments.map(a => ({ a, apt: getApt(a.apartmentId), projectId: currentProjectId, projectName: currentWsName })),
          ...otherTasks,
        ];
        const calEvents: CalendarEvent[] = calRows
          .filter(r => !!r.a.dueDate)
          // Every day of a multi-day task, so the worker's calendar says
          // exactly which days he is expected at the job. Every workspace's
          // tasks — the calendar is his week, wherever the work is.
          .flatMap(({ a, apt, projectId: pid, projectName: ws }) => {
            const st = pid === currentProjectId ? stages.find(x => x.id === a.stageId) : undefined;
            return daysOf(a).map(day => ({
              id: `${pid}:${a.id}:${day}`,
              date: day,
              title: a.taskDescription,
              subtitle: a.general ? workAtLabel(readLang, ws) : (apt ? aptLabel(apt) : a.buildingId),
              // The stage's colour inside the day; the trade colour only for
              // a task with no stage.
              color: st?.color ?? projectColor(projects, pid),
              node: st ? { stageName: st.name, stageColor: st.color } : undefined,
              completed: !!a.completedAt,
              onClick: () => openTask(pid, a),
            }));
          });
        const wdLabels = s.isRtl
          ? ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
          : undefined;
        /**
         * WEEKLY first (the owner's ask — the month grid kept being mistaken
         * for the notebook): the current week as a plain list of days, each
         * with its tasks, big enough for a thumb. The month grid is the other
         * bubble. Multi-day tasks already arrive one event per day, so the
         * week view needs no arithmetic of its own.
         */
        const byDay = new Map<string, CalendarEvent[]>();
        for (const ev of calEvents) {
          const arr = byDay.get(ev.date) ?? [];
          arr.push(ev); byDay.set(ev.date, arr);
        }
        const weekStart = addDaysFns(startOfWeek(new Date()), calWeekOff * 7);
        const weekDays = Array.from({ length: 7 }, (_, i) => addDaysFns(weekStart, i));
        const todayKey = format(new Date(), 'yyyy-MM-dd');
        return (
          <div className="flex-1 min-h-0 flex flex-col overflow-auto px-3 py-3" data-cal-tab
            /* The page itself has no ceiling (min-h-screen), so "fill the
               phone" is pinned to the viewport here: the grid ends where the
               screen does, and only a month with more than fits scrolls. */
            style={{ height: 'calc(100dvh - 118px)' }}>
            {/* The two bubbles, big, on top. */}
            <div className="flex items-center gap-2 mb-3">
              {([
                ['week', s.weeklyLabel || (s.isRtl ? 'שבועי' : 'Weekly')],
                ['month', s.monthlyLabel || (s.isRtl ? 'חודשי' : 'Monthly')],
              ] as const).map(([mode, label]) => (
                <button key={mode} data-cal-mode={mode}
                  onClick={() => setCalMode(mode)}
                  className="flex-1 py-2.5 rounded-full text-base font-bold transition-all active:scale-[0.98]"
                  style={calMode === mode
                    ? { backgroundColor: '#1e3a5f', color: '#fff' }
                    : { backgroundColor: '#fff', color: '#475569', border: '1px solid #e2e8f0' }}>
                  {label}
                </button>
              ))}
            </div>
            {calMode === 'month' ? (
              /* Fills the phone down to the bottom (owner, 2026-09-03) so a
                 day shows what is in it — the flex-1 host is the room. */
              <div className="flex-1 min-h-0" style={{ minHeight: 420 }}>
                <TaskCalendar
                  events={calEvents}
                  weekdayLabels={wdLabels}
                  todayLabel={s.filterToday}
                  fill
                />
              </div>
            ) : (
              <div data-cal-week>
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setCalWeekOff(v => v - 1)} aria-label="Previous week"
                    className="w-9 h-9 rounded-xl border border-gray-200 bg-white font-black text-gray-500">‹</button>
                  <button onClick={() => setCalWeekOff(0)}
                    className="flex-1 text-center text-sm font-bold text-gray-700">
                    {format(weekStart, 'd MMM')} – {format(addDaysFns(weekStart, 6), 'd MMM')}
                    {calWeekOff !== 0 && (
                      <span className="block text-[10px] font-semibold text-[#4aa8d8]">{s.filterToday} ↺</span>
                    )}
                  </button>
                  <button onClick={() => setCalWeekOff(v => v + 1)} aria-label="Next week"
                    className="w-9 h-9 rounded-xl border border-gray-200 bg-white font-black text-gray-500">›</button>
                </div>
                <div className="space-y-2">
                  {weekDays.map(d => {
                    const key = format(d, 'yyyy-MM-dd');
                    const evs = byDay.get(key) ?? [];
                    const isToday = key === todayKey;
                    return (
                      <div key={key} className={`rounded-2xl border bg-white overflow-hidden ${
                        isToday ? 'border-[#4aa8d8]' : 'border-gray-100'}`}>
                        <div className="flex items-baseline gap-2 px-3 py-1.5"
                          style={{ backgroundColor: isToday ? '#e0f2fe' : '#f8fafc' }}>
                          <span className="font-black tabular-nums" style={{ fontSize: 16, color: isToday ? '#0369a1' : '#334155' }}>
                            {format(d, 'd')}
                          </span>
                          <span className="text-xs font-bold" style={{ color: isToday ? '#0369a1' : '#64748b' }}>
                            {format(d, 'EEEE')}
                          </span>
                          {isToday && (
                            <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white text-[#0369a1]">
                              {s.filterToday}
                            </span>
                          )}
                        </div>
                        {evs.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-300">—</div>
                        ) : evs.map(ev => (
                          <button key={ev.id} onClick={ev.onClick}
                            className="w-full text-left px-3 py-2.5 border-t border-gray-50 active:bg-gray-50">
                            <span className="flex items-start gap-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
                                style={{ backgroundColor: ev.color }} />
                              <span className="flex-1 min-w-0">
                                <span className={`block text-sm font-bold text-gray-800 ${ev.completed ? 'line-through opacity-50' : ''}`}>
                                  {ev.title}
                                </span>
                                <span className="block text-xs text-gray-500 truncate">{ev.subtitle}</span>
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Building Map tab */}
      {activeTab === 'map' && perms.seeDiagrams && (() => {
        /**
         * The map, redrawn to the approved page (owner, 2026-09-03).
         *
         * WHICH project first: every workspace with buildings that this
         * worker may open (`mapProjects`, absent = all). More than one and
         * nothing chosen yet → big squares, the whole screen. One → straight
         * in. The choice is remembered per worker on this phone, and the
         * project's name on the map's bar changes it.
         *
         * Then ONE bar — the project's name in its colour (press: a sheet of
         * projects), and the buildings as a segmented control — and the
         * diagram inside a building outline whose bottom fades out so the
         * eye knows the floors continue. No day filters, no hint sentence,
         * no "0 yours", no scrollbar: if he has a task in an apartment it is
         * lit, whatever day it is for.
         */
        const allowedMaps = projects.filter(p => p.id !== 'general'
          && (!workerNow?.mapProjects || workerNow.mapProjects.includes(p.id)));
        const choice = allowedMaps.find(p => p.id === mapChosen) ?? null;
        const chooser = !choice && allowedMaps.length !== 1;
        const pick = (pid: string) => {
          setMapChosen(pid);
          try { localStorage.setItem(`portal_map_${token ?? ''}`, pid); } catch { /* private mode */ }
          if (pid !== currentProjectId) { setCurrentProject(pid); setMapBuilding(''); }
          setMapPickerOpen(false);
        };
        const here = buildings
          .filter(b => apartments.some(a => a.buildingId === b.id))
          .map(b => b.id);
        const shown = mapBuilding === 'all' ? 'all'
          : here.includes(mapBuilding) ? mapBuilding : (here[0] ?? '');
        const visible = perms.seeAllApartments
          ? apartments
          : apartments.filter(a => assignedAptIds.has(a.id));
        const projectName = projects.find(p => p.id === currentProjectId)?.name ?? currentProjectId;
        const wsColor = projectColor(projects, currentProjectId);
        const wsColorOf = (pid: string) => projectColor(projects, pid);
        const openHere = (pid: string) => (pid === currentProjectId ? assignments : otherTasks.filter(r => r.projectId === pid).map(r => r.a))
          .filter(a => !a.completedAt).length;

        if (chooser) {
          return (
            <div className="flex-1 overflow-auto bg-gray-100 px-4 pt-5 pb-6 flex flex-col gap-3.5" data-map-chooser>
              <div>
                <h2 className="text-[22px] font-black text-[#1e3a5f] leading-tight">{s.whichMap || 'Which building map?'}</h2>
                <p className="text-[13px] text-gray-500 mt-0.5">{s.pickProjectHint || 'Pick the project you are standing in.'}</p>
              </div>
              {allowedMaps.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">{s.noApartmentsAssigned}</p>
              ) : allowedMaps.map(p => {
                const n = openHere(p.id);
                return (
                  <button key={p.id} data-map-square={p.id}
                    onClick={() => pick(p.id)}
                    className="relative flex-1 min-h-[150px] rounded-3xl bg-white border text-left rtl:text-right p-5 flex flex-col justify-end overflow-hidden active:scale-[0.99] transition-transform"
                    style={{ borderColor: '#e2e8f0', boxShadow: '0 8px 24px -16px rgba(15,23,42,.35)' }}>
                    <span className="absolute inset-y-0 start-0 w-2" style={{ backgroundColor: wsColorOf(p.id) }} />
                    <svg className="absolute end-4 bottom-14 opacity-[.08]" width="120" height="150" viewBox="0 0 120 150" fill="#1e3a5f" aria-hidden="true">
                      <rect x="10" y="30" width="100" height="120" /><rect x="40" y="10" width="40" height="20" />
                    </svg>
                    {n > 0 && (
                      <span className="absolute top-4 end-4 text-[12px] font-extrabold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: '#fde68a', color: '#92400e' }}>
                        {n} {n !== 1 ? s.taskPlural : s.taskSingular}
                      </span>
                    )}
                    <span className="text-[22px] font-black text-[#1e3a5f] leading-tight">{p.name}</span>
                  </button>
                );
              })}
            </div>
          );
        }

        // One allowed map and nothing chosen yet: go straight in.
        if (!choice && allowedMaps.length === 1 && mapChosen !== allowedMaps[0].id) {
          setTimeout(() => pick(allowedMaps[0].id), 0);
        }
        const switching = choice && choice.id !== currentProjectId;

        return (
          <div className="flex-1 min-h-0 flex flex-col bg-gray-100" data-portal-map>
            {/* ONE bar: the project's name (press for the sheet) and the buildings. */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 bg-white border-b border-gray-200 flex-shrink-0" data-map-bar>
              <button data-map-project-btn
                onClick={() => setMapPickerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-extrabold text-[13.5px] min-w-0 active:scale-[0.98]"
                style={{ backgroundColor: '#eef4fa', color: '#1e3a5f' }}>
                <span className="w-2 h-[18px] rounded-sm flex-shrink-0" style={{ backgroundColor: wsColor }} />
                <span className="truncate">{projectName}</span>
                <ChevronDown size={14} className="flex-shrink-0" />
              </button>
              <div className="ms-auto flex rounded-xl p-[3px] flex-shrink-0" style={{ backgroundColor: '#eef2f6' }} data-map-buildings>
                {!phonePortal && here.length > 1 && (
                  <button data-map-building="all" onClick={() => setMapBuilding('all')}
                    className="px-3 py-1.5 rounded-[9px] text-[13px] font-extrabold transition-all"
                    style={shown === 'all' ? { backgroundColor: '#1e3a5f', color: '#fff' } : { color: '#475569' }}>
                    {s.filterAll}
                  </button>
                )}
                {here.map(b => (
                  <button key={b} data-map-building={b} onClick={() => setMapBuilding(b)}
                    className="px-3 py-1.5 rounded-[9px] text-[13px] font-extrabold transition-all"
                    style={shown === b
                      ? { backgroundColor: '#1e3a5f', color: '#fff', boxShadow: '0 2px 6px rgba(30,58,95,.35)' }
                      : { color: '#475569' }}>
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* The project sheet — the two (or more) maps, the current ticked. */}
            {mapPickerOpen && (
              <>
                <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setMapPickerOpen(false)} />
                <div data-map-project-sheet
                  className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white shadow-2xl px-4 pt-3 pb-6">
                  <div className="w-10 h-1.5 rounded-full bg-gray-200 mx-auto mb-3" />
                  <div className="text-[11px] font-extrabold tracking-wider text-gray-400 mb-2">
                    {(s.buildingMap || 'Building map').toUpperCase()}
                  </div>
                  {allowedMaps.map(p => {
                    const on = p.id === currentProjectId;
                    const n = openHere(p.id);
                    return (
                      <button key={p.id} data-map-project-pick={p.id}
                        onClick={() => pick(p.id)}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl border mb-2 text-left rtl:text-right font-extrabold text-[15px]"
                        style={on
                          ? { backgroundColor: '#eef4fa', borderColor: '#4aa8d8', color: '#1e3a5f' }
                          : { borderColor: '#e2e8f0', color: '#1e3a5f' }}>
                        <span className="w-2.5 h-7 rounded-sm" style={{ backgroundColor: wsColorOf(p.id) }} />
                        <span className="flex-1">{p.name}</span>
                        {n > 0 && <span className="text-[11px] font-semibold text-gray-400">{n} {n !== 1 ? s.taskPlural : s.taskSingular}</span>}
                        {on && <span style={{ color: '#4aa8d8' }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {switching ? (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400">…</div>
            ) : here.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-center px-6">
                <MapPin size={32} className="text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm">{s.noApartmentsAssigned}</p>
              </div>
            ) : (
              /* The scroller: no bars anywhere inside it, and a fade pinned to
                 its bottom edge so the last floors dissolve into the page. */
              <div className="flex-1 min-h-0 overflow-auto bars-off relative" data-map-scroller>
                <div className="relative px-2.5 pt-7 pb-8" data-building-outline>
                  {/* The building: a parapet, a roof box over the stairwell,
                      walls down both sides, a doorway at the ground — the
                      same silhouette around every diagram. Navy at a quarter
                      strength, so it frames the grid without competing. */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M2 5 H40 V1 H60 V5 H98 V100 H2 Z" fill="#fff" stroke="#1e3a5f" strokeOpacity=".28" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d="M45 100 V95 H55 V100" fill="#f3f4f6" stroke="#1e3a5f" strokeOpacity=".28" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="relative">
                    <BuildingDiagram
                      apartments={visible}
                      stages={stages}
                      activeStageIds={[]}
                      classFilter="all"
                      searchQuery=""
                      selectedBuilding={shown as never}
                      onApartmentClick={handleDiagramClick}
                      showShinuiBadge={false}
                      highlightedApartmentIds={assignedAptIds}
                      aptSubLabels={aptSubLabels}
                      compact={!phonePortal}
                      phone={phonePortal}
                    />
                  </div>
                </div>
                <div className="sticky bottom-0 h-20 pointer-events-none -mt-20" data-map-fade
                  style={{ background: 'linear-gradient(to bottom, rgba(243,244,246,0), #f3f4f6 85%)' }} />
              </div>
            )}
          </div>
        );
      })()}

      {/* The planner, read-only always. */}
      {activeTab === 'planner' && perms.seePlanner && (() => {
        const sheet = canvasElements.find(e => e.type === 'widget' && e.widget === 'rota');
        return (
          <div className="flex-1 overflow-auto bg-gray-100 p-3">
            {!sheet ? (
              <p className="text-sm text-gray-400 text-center py-16">
                {s.isRtl ? 'אין לוח משמרות עדיין.' : 'Nobody has made a planner yet.'}
              </p>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto"
                style={{ height: 'calc(100vh - 220px)', minHeight: 380 }}>
                {/* A phone is narrower than a week: the sheet keeps its real
                    width and SCROLLS sideways instead of smushing five days
                    into columns a word wide — the same rule every wide thing
                    in the app follows. */}
                <div style={{ minWidth: 640, height: '100%' }}>
                {/* readOnly, and not as a setting — a worker looking at the
                    week must never be one mis-tap from rearranging it. */}
                <PlannerWidget
                  el={sheet}
                  data={(sheet.data ?? {}) as never}
                  jobs={apartments}
                  contractors={contractors}
                  users={users}
                  stages={stages}
                  assignments={contractorAssignments}
                  update={() => {}}
                  openJob={() => {}}
                  openUnit={() => {}}
                  readOnly
                />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Assignment detail bottom sheet */}
      {selectedAssignment && (() => {
        /* Re-resolve from the LIVE list — the state holds the object captured
           at open, so closing the task (or any edit) would otherwise never
           reach the open sheet and the closing screen would stand over a
           finished job. */
        const a = contractorAssignments.find(x => x.id === selectedAssignment.id) ?? selectedAssignment;
        const apt = getApt(a.apartmentId);
        const stage = getStage(a.stageId);
        const isOverdue = a.dueDate && !a.completedAt && isPast(parseISO(a.dueDate));
        const dueBadge = getDueBadge(effectiveDue(a), dueWords);
        const plansPdfFileId = apt?.plansPdfLink ? extractFileId(apt.plansPdfLink) : null;
        const composerNode = (
          <div data-composer-block>
{noteAttachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {noteAttachments.map((att, idx) => (
                        att.mimeType.startsWith('audio/') ? (
                          // Check it before you send it — the whole point of a
                          // preview is hearing what you just recorded.
                          <div key={idx} className="flex items-center gap-1">
                            <VoiceMemoPlayer src={att.driveUrl || att.dataUrl || ''} className="max-w-[220px]" />
                            <button
                              onClick={() => setNoteAttachments(prev => prev.filter((_, i) => i !== idx))}
                              className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500"
                            ><X size={12} /></button>
                          </div>
                        ) : att.mimeType.startsWith('image/') && att.dataUrl ? (
                          <div key={idx} className="relative inline-block">
                            <img
                              src={att.dataUrl}
                              alt={att.filename}
                              className="max-h-28 rounded-xl object-cover border border-gray-200"
                            />
                            <button
                              onClick={() => setNoteAttachments(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                            ><X size={11} /></button>
                          </div>
                        ) : (
                          <div key={idx} className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
                            <Paperclip size={11} />
                            <span className="flex-1 truncate max-w-[140px]">{att.filename}</span>
                            <button onClick={() => setNoteAttachments(prev => prev.filter((_, i) => i !== idx))} className="text-blue-400 hover:text-blue-600"><X size={12} /></button>
                          </div>
                        )
                      ))}
                    </div>
                  )}

                  {/* The composer — WhatsApp's way (owner, 2026-09-03): the
                      paperclip at the start, the box saying "Your message"
                      with the DICTATION mic inside it at the left (words land
                      in the box, in his language), and the big navy mic at
                      the end that records a memo — which becomes the Send
                      arrow the moment there is something to send. */}
                  <div className="flex gap-2 items-center mt-2" data-composer>
                    <button
                      data-composer-clip
                      onClick={() => noteAttachRef.current?.click()}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:text-[#1e3a5f] flex-shrink-0"
                      title="Attach file"
                    >
                      <Paperclip size={15} />
                    </button>
                    <div className="flex-1 min-w-0 flex items-center gap-1 bg-white border rounded-full ps-1.5 pe-3.5"
                      style={{ borderColor: dictate.listening ? '#4aa8d8' : '#dbe3ec', minHeight: 42 }}>
                      {dictate.supported && (
                        <button
                          type="button"
                          data-composer-dictate
                          onClick={dictate.toggle}
                          title={s.isRtl ? 'הקלדה קולית' : lang === 'ru' ? 'Голосовой ввод' : 'Dictate'}
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            dictate.listening ? 'text-white animate-pulse' : 'text-[#1e3a5f]'}`}
                          style={{ backgroundColor: dictate.listening ? '#dc2626' : '#eef4fa' }}
                        >
                          <Mic size={15} />
                        </button>
                      )}
                      <input
                        data-composer-input
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendNote()}
                        placeholder={s.yourMessage || (s.isRtl ? 'ההודעה שלך' : 'Your message')}
                        className="flex-1 min-w-0 bg-transparent py-2 text-sm focus:outline-none"
                      />
                    </div>
                    {(noteText.trim() || noteAttachments.length > 0) ? (
                      <button data-composer-send onClick={handleSendNote}
                        className="w-11 h-11 flex items-center justify-center rounded-full text-white transition-all active:scale-95 flex-shrink-0"
                        style={{ backgroundColor: '#4aa8d8', boxShadow: '0 6px 14px -6px rgba(74,168,216,.7)' }}>
                        <Send size={18} />
                      </button>
                    ) : (
                      <VoiceRecorderButton big onRecorded={handleNoteVoiceMemo} title={s.addNote} />
                    )}
                  </div>
          </div>
        );

        return (
          <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { setSelectedAssignment(null); setShowCompleteConfirm(false); setFinishAsk(null); }} />
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
                      <span className="font-bold text-[#1e3a5f] text-lg" data-sheet-where>
                        {whereLabel(a, apt, currentWsName)}
                      </span>
                      {!a.general && <span className="text-gray-400 text-sm">{a.buildingId}</span>}
                    </div>
                    {stage && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                          style={{ backgroundColor: stage.color + '22', color: stage.color, border: `1px solid ${stage.color}33` }}>
                          {getStageName(stage, s.isRtl)}
                        </span>
                        {apt?.stageDates && Object.keys(apt.stageDates).length > 0 && (
                          <button
                            onClick={() => setShowHistory(v => !v)}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all ${showHistory ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'text-gray-400 border-gray-200 hover:border-gray-300'}`}
                          >
                            <History size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setSelectedAssignment(null); setShowCompleteConfirm(false); setFinishAsk(null); }} className="p-1.5 rounded-full hover:bg-gray-100">
                    <X size={20} className="text-gray-500" />
                  </button>
                </div>
                {apt?.address?.trim() && (
                  <div className="flex items-start gap-1.5 text-xs text-gray-600 mt-2">
                    <MapPin size={13} className="text-[#4aa8d8] flex-shrink-0 mt-0.5" />
                    <span className="leading-snug">{apt.address}</span>
                    {/* Waze, at the end of the address — one press on site and
                        the phone is navigating. An icon, nothing more. */}
                    <a
                      href={wazeUrl(apt.address)}
                      target="_blank" rel="noopener noreferrer"
                      title="Waze"
                      onClick={e => e.stopPropagation()}
                      className="flex-shrink-0 -mt-0.5 p-0.5 rounded hover:bg-sky-50"
                    >
                      <WazeIcon size={15} />
                    </a>
                  </div>
                )}
                {a.dueDate && (
                  <div className={`flex items-center gap-1.5 text-xs font-medium mt-2 flex-wrap ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
                    <CalendarDays size={13} />
                    {a.days?.length
                      ? a.days.map(d => format(parseISO(d), 'EEE d MMM')).join(' · ')
                      : <>{s.duePrefix} {format(parseISO(a.dueDate), 'MMMM d, yyyy')}</>}
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
                  <p className="text-gray-800 text-sm leading-relaxed" data-task-text>
                    <Translated text={a.taskDescription} to={readLang} />
                  </p>
                  {a.general && (a.visits?.length ?? 0) > 0 && (
                    <p className="text-xs mt-1.5 font-semibold" style={{ color: '#8a6508' }} data-sheet-visits>
                      {s.visitsLabel || 'Visited'}: {a.visits!.map(v => aptLabel(getApt(v.apartmentId))).join(', ')}
                    </p>
                  )}
                  {/* No box (decision 6): a red dot and the word — the same
                      treatment for every priority so they stay consistent. */}
                  {a.priority && a.priority !== 'normal' && (
                    <span className={`inline-flex items-center gap-1 mt-1.5 text-xs font-medium ${
                      a.priority === 'urgent' ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {a.priority === 'urgent' ? '🔴' : '🟢'} {a.priority === 'urgent' ? 'Urgent' : 'Low priority'}
                    </span>
                  )}
                </div>

                {/* Stage history panel */}
                {showHistory && apt && (() => {
                  const stageDates = apt.stageDates ?? {};
                  const history = stages
                    .filter(st => stageDates[st.id])
                    .sort((a, b) => new Date(stageDates[b.id]!).getTime() - new Date(stageDates[a.id]!).getTime());
                  if (!history.length) return null;
                  return (
                    <div className="border border-gray-100 rounded-2xl overflow-hidden">
                      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                        <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                          <History size={12} /> Stage History
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {history.map(st => {
                          const note = stageNotes.find(n => n.apartmentId === a.apartmentId && n.stageId === st.id);
                          const stagePhotos = contractorPhotos.filter(p => {
                            const assignment = contractorAssignments.find(ca => ca.id === p.assignmentId);
                            return assignment?.apartmentId === a.apartmentId && assignment?.stageId === st.id;
                          });
                          const isCurrent = apt.currentStageId === st.id;
                          return (
                            <div key={st.id} className="px-4 py-3 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={{ backgroundColor: st.color + '22', color: st.color, border: `1px solid ${st.color}33` }}>
                                  {getStageName(st, s.isRtl)}
                                </span>
                                {isCurrent && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e3a5f]/10 text-[#1e3a5f] font-semibold">Current</span>
                                )}
                                <span className="text-[10px] text-gray-400 ml-auto">
                                  {format(new Date(stageDates[st.id]!), 'MMM d, yyyy')}
                                </span>
                              </div>
                              {note?.noteText?.trim() && (
                                <p className="text-xs text-gray-600 leading-relaxed bg-blue-50 rounded-lg px-2.5 py-2">{note.noteText}</p>
                              )}
                              {stagePhotos.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {stagePhotos.map(photo => {
                                    const src = photo.storageUrl || (photo.driveFileId ? driveThumbUrl(photo.driveFileId, 200) : photo.dataUrl);
                                    if (!src) return null;
                                    return (
                                      <a key={photo.id} href={photo.storageUrl || photo.driveUrl || photo.dataUrl} target="_blank" rel="noopener noreferrer">
                                        <img src={src} alt="" className="h-14 w-14 rounded-xl object-cover border border-gray-200" />
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

                {/* Engineering Plans PDF */}
                {plansPdfFileId && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                        <BookOpen size={12} /> {s.engineeringPlans}
                      </h3>
                      <div className="flex items-center gap-2">
                        {/* Through the app's own /api/drive-fetch (decision 6):
                            a drive.google.com link turns away a worker who is
                            not signed into Google. The service account reads
                            the bytes; the phone just gets a file. */}
                        <button onClick={() => void downloadPlanFile(plansPdfFileId, apt ? aptLabel(apt) : a.buildingId)}
                          disabled={planDlBusy}
                          className="flex items-center gap-1 text-xs text-[#1e3a5f] hover:underline disabled:opacity-50">
                          <Download size={11} /> {planDlBusy ? '…' : s.download}
                        </button>
                        <button onClick={() => setShowPlansPdf(v => !v)}
                          className="text-xs px-2.5 py-1 rounded-lg bg-[#1e3a5f] text-white font-medium">
                          {showPlansPdf ? s.hide : s.view}
                        </button>
                      </div>
                    </div>

                    {/* The office's markup, when there is one.
                        A straight Drive link rather than the markup studio: on a
                        phone on site the studio would pull the whole PDF down to
                        render it, and all the contractor needs is to look at what
                        was drawn — which the Drive viewer does natively, with the
                        markup layer already switched on. */}
                    {(() => {
                      const latest = apt
                        ? planAnnotations
                            .filter(x => x.apartmentId === apt.id && x.planFileId === plansPdfFileId && x.driveUrl)
                            .sort((x, y) => y.version - x.version)[0]
                        : undefined;
                      if (!latest) return null;
                      return (
                        <a href={latest.driveUrl} target="_blank" rel="noopener noreferrer"
                          className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl border"
                          style={{ borderColor: '#fcd34d', backgroundColor: '#fffbeb' }}>
                          <PenLine size={13} className="text-amber-600 flex-shrink-0" />
                          <span className="text-xs font-semibold text-amber-800 flex-1">
                            {s.markedUpPlan}
                          </span>
                          <span className="text-[10px] text-amber-600">
                            v{latest.version} · {format(new Date(latest.createdAt), 'MMM d')}
                          </span>
                        </a>
                      );
                    })()}
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
                      {/* The SAME pins the office sees, drawn from the same
                          coordinates. Workers WRITE now too (the owner's
                          2026-08-31 ask): a worker on site can drop a pin,
                          speak a memo into it or attach a photo — but only
                          delete a pin they placed themselves. */}
                      {showPlansPdf && apt && (
                        <div onClick={e => e.stopPropagation()}>
                          <PlanPinOverlay
                            apartmentId={apt.id}
                            apartmentLabel={aptLabel(apt)}
                            authorName={contractor?.name ?? ''}
                            driveFolderLink={apt.driveLink}
                            workerMode
                            planFileId={plansPdfFileId}
                          />
                        </div>
                      )}
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

                {/* THIS TASK — the conversation (decisions 8–10). It replaces
                    the FILES & PHOTOS block and the two separate note lists:
                    photos, files and words from both sides are ONE thread,
                    the same drawing the office sees in the apartment window.
                    The office's Add File button left this section (owner's
                    decision — the worker's paperclip lives in the composer
                    and on the closing screen). */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <MessageSquare size={12} /> {s.taskMessagesLabel || (s.isRtl ? 'הודעות המשימה' : 'Task messages')}
                  </h3>
                  <TaskThread
                    assignment={a}
                    notes={selNotes}
                    photos={selMedia}
                    viewer="contractor"
                    translateTo={readLang}
                    words={{
                      rtl: !!s.isRtl,
                      tapToOpen: s.tapToOpenLabel || (s.isRtl ? 'הקישו לפתיחה' : 'tap to open'),
                      jobClosed: s.jobClosedLabel || (s.isRtl ? 'העבודה נסגרה' : 'Job closed'),
                      download: s.download,
                      said: s.saidLabel || 'Said',
                    }}
                    footer={composerNode}
                  />

                  {/* The hidden pickers stay mounted at sheet level — the
                      closing screen's add button and the composer's paperclip
                      both reach them. */}
                  <input ref={mediaInputRef} type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                    multiple className="hidden" onChange={handleMediaUpload} />
                  <input ref={noteAttachRef} type="file"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                    multiple className="hidden" onChange={handleNoteAttachmentPick} />
                </div>
              </div>

              {/* The footer: ONE Close job button (decision 6) — and once
                  the task is closed, a plain "Job closed" state instead of
                  the button (decision 11). The message box above stays live
                  either way: decision 10 keeps the conversation open. */}
              <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
                {a.completedAt ? (
                  <div data-job-closed
                    className="w-full py-3.5 rounded-xl text-base font-bold flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>
                    <CheckCircle2 size={18} />
                    {s.jobClosedLabel || (s.isRtl ? 'העבודה נסגרה' : 'Job closed')}
                    {' · '}
                    {format(new Date(a.completedAt), isToday(new Date(a.completedAt)) ? 'HH:mm' : 'MMM d · HH:mm')}
                  </div>
                ) : (
                  /* One button. Pressing it opens the closing screen —
                     it never sits greyed-out wondering why. */
                  <button
                    data-close-job
                    onClick={() => setClosing(true)}
                    className="w-full py-3.5 rounded-xl text-base font-bold tracking-wide transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-white"
                    style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
                  >
                    <CheckCircle2 size={18} />
                    {s.closeJobBtn || (s.isRtl ? 'סגירת עבודה' : 'Close job')}
                  </button>
                )}
              </div>
            </div>

            {/* THE CLOSING SCREEN — a screen of its own (decision 7): its
                own navy header with a back arrow and the apartment name; the
                add-media button with its counter at the top; then ONE
                comment box with the paperclip and the microphone INSIDE it,
                the same idiom as the drawer's General Notes box. The footer
                is Send and close the job. There is NO separate file section
                — the add-media button already takes files. The picture rule
                follows each worker's own permission (decision 7 / item 11):
                a photos-optional worker sees no demand, no counter, and is
                never locked out. The finish-early ask still fires on the
                final press when the task has days left. */}
            {closing && !a.completedAt && (
              <div data-closing-panel className="fixed inset-0 z-[60] bg-white flex flex-col">
                <div className="flex items-center gap-3 px-4 py-3.5 flex-shrink-0 text-white"
                  style={{ backgroundColor: '#1e3a5f' }}>
                  <button onClick={() => { setFinishAsk(null); setClosing(false); }}
                    className="p-1.5 rounded-lg hover:bg-white/10 flex-shrink-0" title={s.cancel}>
                    {s.isRtl ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
                  </button>
                  <div className="min-w-0">
                    <div className="font-extrabold leading-tight" style={{ fontSize: 17 }}>
                      {s.closingTitle || (s.isRtl ? 'סגירת העבודה' : 'Closing the job')}
                    </div>
                    <div className="truncate opacity-70" style={{ fontSize: 12.5 }}>
                      {apt ? aptLabel(apt) : a.buildingId}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-5" style={{ overscrollBehavior: 'contain' }}>
                  {finishAsk ? (
                    /* The finish-early ask — big simple words in the
                       worker's own language, only reachable after the
                       photos are in and Send and close was pressed. */
                    <div className="space-y-3 max-w-md mx-auto w-full" data-finish-early>
                      <p className="text-center font-extrabold text-gray-800"
                        style={{ fontSize: 17, lineHeight: 1.35 }}>
                        {s.finishEarlyStill || (s.isRtl
                          ? 'העבודה הזאת עדיין ביומן שלך בתאריכים:'
                          : 'This job is still on your calendar for:')}
                      </p>
                      <p className="text-center font-bold" style={{ color: '#0369a1', fontSize: 16 }}>
                        {finishAsk.map(d => format(parseISO(d), 'EEEE d MMMM')).join(' · ')}
                      </p>
                      <p className="text-center text-sm text-gray-500">
                        {s.finishEarlyQuestion || (s.isRtl
                          ? 'סיימת לגמרי, או שתצטרך לחזור?'
                          : 'Are you completely finished, or do you need to come back?')}
                      </p>
                      <button
                        onClick={() => { setFinishAsk(null); postClosingNote(); handleConfirmComplete(); }}
                        className="w-full py-3.5 rounded-xl font-bold text-white text-base"
                        style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                        {s.finishEarlyYes || (s.isRtl
                          ? 'סיימתי הכול — אפשר למחוק את הימים'
                          : 'I finished everything — cross those days off')}
                      </button>
                      <button
                        onClick={() => setFinishAsk(null)}
                        className="w-full py-3.5 rounded-xl font-bold text-slate-600 text-base"
                        style={{ backgroundColor: '#eef2f7' }}>
                        {s.finishEarlyNo || (s.isRtl ? 'לא — אני אחזור' : "No — I'm coming back")}
                      </button>
                    </div>
                  ) : (
                    <div className="max-w-md mx-auto w-full space-y-6">
                      {/* 1 · the pictures — the rule names MIN_CLOSE_MEDIA, so
                          changing the constant changes the sentence. */}
                      <div>
                        {!contractor?.photosOptional && (
                          <p className="text-center font-extrabold text-gray-800 mb-3"
                            style={{ fontSize: 16, lineHeight: 1.35 }}>
                            {(s.addPicturesRule || (s.isRtl
                              ? 'הוסיפו לפחות {n} תמונות כדי לסגור את העבודה'
                              : 'Add at least {n} pictures to close the job'))
                              .replace('{n}', String(MIN_CLOSE_MEDIA))}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => mediaInputRef.current?.click()}
                            disabled={uploading}
                            className="flex-1 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98]"
                            style={{ backgroundColor: '#1e3a5f' }}>
                            <Camera size={17} />
                            {uploading ? s.uploading : s.tapToAddMedia}
                          </button>
                          {!contractor?.photosOptional && (
                            <span data-close-count
                              className="flex-shrink-0 px-3 py-2 rounded-xl text-sm font-black tabular-nums"
                              style={selMedia.length >= MIN_CLOSE_MEDIA
                                ? { backgroundColor: '#dcfce7', color: '#15803d' }
                                : { backgroundColor: '#fef3c7', color: '#92400e' }}>
                              {selMedia.length}/{MIN_CLOSE_MEDIA}
                            </span>
                          )}
                        </div>
                        {uploadProgress && (
                          <div className="mt-3">
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
                          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3 border border-amber-200">
                            <AlertCircle size={13} className="flex-shrink-0" /> {uploadError}
                          </div>
                        )}
                      </div>

                      {/* 2 · one comment box — paperclip and microphone
                          INSIDE it, bottom corner, the General-notes idiom. */}
                      <div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                          {s.closingCommentLabel || (s.isRtl ? 'הערה' : 'A comment')}
                        </div>
                        <div className="text-gray-400 mb-2" style={{ fontSize: 13 }}>
                          {s.closingCommentHint || (s.isRtl ? 'כל מה שהמשרד צריך לדעת' : 'Anything the office should know')}
                        </div>
                        <div className="relative border border-gray-200 rounded-xl bg-white">
                          <textarea
                            value={closingComment}
                            onChange={e => setClosingComment(e.target.value)}
                            placeholder={s.typeWhatYouDid || (s.isRtl ? 'כתבו מה עשיתם…' : 'Type what you did…')}
                            className="w-full min-h-[104px] border-0 outline-none rounded-xl px-3 pt-2.5 pb-10 text-[15px] resize-y bg-transparent"
                          />
                          <div className="absolute bottom-2 flex items-center gap-1.5" style={{ insetInlineEnd: 9 }}>
                            <button
                              onClick={() => noteAttachRef.current?.click()}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-[#1e3a5f]"
                              title="Attach file">
                              <Paperclip size={16} />
                            </button>
                            <VoiceRecorderButton onRecorded={handleNoteVoiceMemo} title={s.addNote} />
                          </div>
                        </div>
                        {noteAttachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {noteAttachments.map((att, idx) => (
                              att.mimeType.startsWith('audio/') ? (
                                <div key={idx} className="flex items-center gap-1">
                                  <VoiceMemoPlayer src={att.driveUrl || att.dataUrl || ''} className="max-w-[220px]" />
                                  <button
                                    onClick={() => setNoteAttachments(prev => prev.filter((_, i) => i !== idx))}
                                    className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500"
                                  ><X size={12} /></button>
                                </div>
                              ) : (
                                <div key={idx} className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700">
                                  <Paperclip size={11} />
                                  <span className="flex-1 truncate max-w-[140px]">{att.filename}</span>
                                  <button onClick={() => setNoteAttachments(prev => prev.filter((_, i) => i !== idx))}
                                    className="text-blue-400 hover:text-blue-600"><X size={12} /></button>
                                </div>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {!finishAsk && (
                  <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0"
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
                    <button
                      data-close-now
                      onClick={handleSendAndClose}
                      disabled={!canComplete || completing}
                      className="w-full py-3.5 rounded-xl text-base font-bold tracking-wide transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{
                        background: canComplete ? 'linear-gradient(135deg, #22c55e, #16a34a)' : undefined,
                        backgroundColor: !canComplete ? '#e5e7eb' : undefined,
                        color: canComplete ? 'white' : '#9ca3af',
                      }}>
                      <CheckCircle2 size={18} />
                      {completing ? s.markingComplete
                        : (s.sendAndClose || (s.isRtl ? 'שליחה וסגירת העבודה' : 'Send and close the job'))}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}

      {/*
        THE "I DID WORK HERE" SHEET — the map's stage-report flow, one small
        screen at a time. View (his tasks here + the big button) → what did
        you do (a stage) → did you finish → YES creates a stage-report task
        and hands over to the standing closing screen (pictures, note, Close
        job — completing it marks the stage done on the apartment), NO takes
        a note of what is left, files it under an OPEN stage-report task, and
        marks the stage HALF DONE (the glowing orange clock the office sees
        in the stage picker and in the header's pending list).
      */}
      {workHere && (() => {
        const apt = apartments.find(a => a.id === workHere.aptId);
        if (!apt) return null;
        const allWsStages = stages
          .filter(st => (currentProjectId === 'general' ? st.projectId === 'general' : !st.projectId) && st.active)
          .sort((a, b) => a.order - b.order);
        /**
         * Only the stages HE may report (owner, 2026-09-03): the office's list
         * per worker, else every stage but the first and the last — "Ready
         * to start" is a place a job waits, not work anybody did.
         */
        const allowedReport = workerNow?.reportStages?.[currentProjectId]
          ?? allWsStages.slice(1, Math.max(1, allWsStages.length - 1)).map(st => st.id);
        const wsStages = allWsStages.filter(st => allowedReport.includes(st.id));
        const pickedStage = wsStages.find(st => st.id === workHere.stageId);
        /** His open general jobs here — the "is this part of…?" question. */
        const generalJobs = assignments.filter(x => x.general && !x.completedAt);
        const stageOrder = (id: string | null | undefined) => allWsStages.find(st => st.id === id)?.order ?? -1;
        /** File the report under the general job he named. */
        const recordVisit = (rid: string, st: typeof allWsStages[0]) => {
          const gid = workHere.partOf;
          if (!gid) return;
          const g = useStore.getState().contractorAssignments.find(x => x.id === gid);
          if (!g) return;
          updateContractorAssignment(gid, {
            visits: [...(g.visits ?? []), { apartmentId: apt.id, at: new Date().toISOString(), stageId: st.id, reportTaskId: rid }],
          });
        };
        const aptTasks = assignments.filter(a => a.apartmentId === apt.id);
        const curStage = getStage(apt.currentStageId);
        const todayIso = new Date().toISOString().slice(0, 10);
        const closeSheet = () => { setWorkHere(null); setLeftNote(''); };
        const mintId = () => `SR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const reportBase = (st: typeof wsStages[0], desc: string) => ({
          contractorId,
          apartmentId: apt.id,
          buildingId: apt.buildingId,
          taskDescription: desc,
          dueDate: todayIso,
          stageId: st.id,
          priority: 'normal',
          completedAt: null,
          stageReport: true,
          createdBy: contractorId,
          createdByName: contractor?.name ?? '',
        });
        const finishedYes = () => {
          if (!pickedStage) return;
          const rid = mintId();
          addContractorAssignment({
            id: rid,
            ...reportBase(pickedStage,
              `${getStageName(pickedStage, !!s.isRtl)} — ${s.isRtl ? 'דיווח שלב' : 'stage report'}`),
          } as never);
          recordVisit(rid, pickedStage);
          const rec = useStore.getState().contractorAssignments.find(a => a.id === rid);
          closeSheet();
          if (rec) { arriveClosingRef.current = true; setSelectedAssignment(rec); }
        };
        const sendNotFinished = () => {
          if (!pickedStage || !leftNote.trim()) return;
          const rid = mintId();
          addContractorAssignment({
            id: rid,
            ...reportBase(pickedStage,
              `${s.isRtl ? 'להשלים' : 'Finish'} ${getStageName(pickedStage, !!s.isRtl)}`),
          } as never);
          addContractorNote({
            assignmentId: rid,
            apartmentId: apt.id,
            contractorId,
            text: leftNote.trim(),
            authorType: 'contractor' as const,
            authorId: contractorId,
            authorName: contractor?.name ?? '',
          });
          recordVisit(rid, pickedStage);
          /* "Not yet" marks the stage half done AND moves the apartment to it
             when it is further along than where it stood (owner's rule) —
             never backwards. */
          updateApartment(apt.id,
            {
              stageMarks: { ...(apt.stageMarks ?? {}), [pickedStage.id]: 'pending' },
              ...(stageOrder(pickedStage.id) > stageOrder(apt.currentStageId) ? { currentStageId: pickedStage.id } : {}),
            },
            {
              id: contractorId, name: contractor?.name ?? 'Worker', code: '',
              role: 'viewer', active: true, createdAt: new Date().toISOString(),
            } as never);
          closeSheet();
        };
        return (
          <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={closeSheet} />
            <div data-work-sheet
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white shadow-2xl flex flex-col"
              style={{ maxHeight: '88vh' }}>
              <div className="flex items-center justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1.5 rounded-full bg-gray-200" />
              </div>
              <div className="px-5 pb-3 border-b border-gray-100 flex-shrink-0 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Building2 size={16} className="text-[#4aa8d8] flex-shrink-0" />
                    <span className="font-bold text-[#1e3a5f] text-lg truncate">{aptLabel(apt)}</span>
                    <span className="text-gray-400 text-sm">{apt.buildingId}</span>
                  </div>
                  {apt.address && <p className="text-xs text-gray-500 mt-0.5 truncate">{apt.address}</p>}
                  {curStage && (
                    <p className="text-xs mt-0.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: curStage.color }} />
                      <span className="text-gray-600">{getStageName(curStage, !!s.isRtl)}</span>
                    </p>
                  )}
                </div>
                <button onClick={closeSheet} className="p-1.5 text-gray-400 flex-shrink-0"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {workHere.step === 'view' && (
                  <>
                    {aptTasks.length > 0 && (
                      <div className="space-y-2">
                        {aptTasks.map(t => (
                          <button key={t.id}
                            onClick={() => { closeSheet(); setSelectedAssignment(t); }}
                            className="w-full text-left rtl:text-right border border-gray-200 rounded-xl px-3 py-2.5">
                            <span className={`text-sm font-semibold ${t.completedAt ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                              <TrText text={t.taskDescription} to={readLang} />
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button data-work-here
                      onClick={() => setWorkHere({ ...workHere, step: generalJobs.length ? 'part' : 'stage' })}
                      className="w-full py-4 rounded-xl text-base font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg, #1e3a5f, #2c4f78)' }}>
                      <Hammer size={19} />
                      {s.workHereBtn || (s.isRtl ? 'עבדתי כאן' : 'I did work here')}
                    </button>
                  </>
                )}
                {workHere.step === 'part' && (
                  <div data-work-part className="space-y-2">
                    <p className="text-center font-extrabold text-gray-800" style={{ fontSize: 17 }}>
                      {s.isPartOfLabel || 'Is this part of:'}
                    </p>
                    {generalJobs.map((g, i) => (
                      <button key={g.id} data-work-part-yes={g.id}
                        onClick={() => setWorkHere({ ...workHere, step: 'stage', partOf: g.id })}
                        className="w-full text-left rtl:text-right rounded-xl px-3.5 py-3 border"
                        style={i === 0
                          ? { backgroundColor: '#fffdf5', borderColor: '#b8860b' }
                          : { borderColor: '#e5e7eb' }}>
                        <span className="block text-sm font-bold text-gray-800">{g.taskDescription}</span>
                        <span className="block text-[11px] font-semibold" style={{ color: '#8a6508' }}>
                          {s.partYes || 'Yes, part of it'}
                        </span>
                      </button>
                    ))}
                    <button data-work-part-no
                      onClick={() => setWorkHere({ ...workHere, step: 'stage', partOf: null })}
                      className="w-full py-3 rounded-xl font-bold text-sm text-gray-600 border border-gray-200">
                      {s.partNo || 'No, separate work'}
                    </button>
                  </div>
                )}
                {workHere.step === 'stage' && (
                  <>
                    <p className="text-center font-extrabold text-gray-800" style={{ fontSize: 17 }}>
                      {s.whatDidYouDo || (s.isRtl ? 'מה עשית?' : 'What did you do?')}
                    </p>
                    <div className="space-y-2" data-work-stages>
                      {wsStages.map(st => (
                        <button key={st.id}
                          onClick={() => setWorkHere({ ...workHere, step: 'finished', stageId: st.id })}
                          className="w-full flex items-center gap-2.5 border border-gray-200 rounded-xl px-3.5 py-3 text-left rtl:text-right active:scale-[0.99]">
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                          <span className="text-sm font-bold text-gray-800">{getStageName(st, !!s.isRtl)}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setWorkHere({ ...workHere, step: 'view' })}
                      className="w-full text-center text-xs font-semibold text-gray-400">
                      {s.isRtl ? 'חזרה' : 'Back'}
                    </button>
                  </>
                )}
                {workHere.step === 'finished' && pickedStage && (
                  <div data-work-finished className="space-y-3">
                    <p className="text-center font-extrabold text-gray-800" style={{ fontSize: 17, lineHeight: 1.35 }}>
                      {s.didYouFinish || (s.isRtl ? 'סיימת את השלב הזה?' : 'Did you finish this stage?')}
                    </p>
                    <p className="text-center font-bold flex items-center justify-center gap-2" style={{ color: '#0369a1', fontSize: 15 }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pickedStage.color }} />
                      {getStageName(pickedStage, !!s.isRtl)}
                    </p>
                    <button data-finished-yes onClick={finishedYes}
                      className="w-full py-3.5 rounded-xl font-bold text-white text-base"
                      style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                      {s.finishedYes || (s.isRtl ? 'כן — זה גמור' : 'Yes — it is finished')}
                    </button>
                    <button data-finished-no onClick={() => setWorkHere({ ...workHere, step: 'note' })}
                      className="w-full py-3.5 rounded-xl font-bold text-base"
                      style={{ backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }}>
                      {s.finishedNo || (s.isRtl ? 'עוד לא' : 'Not yet')}
                    </button>
                    <button onClick={() => setWorkHere({ ...workHere, step: 'stage' })}
                      className="w-full text-center text-xs font-semibold text-gray-400">
                      {s.isRtl ? 'חזרה' : 'Back'}
                    </button>
                  </div>
                )}
                {workHere.step === 'note' && pickedStage && (
                  <div data-work-note className="space-y-3">
                    <p className="text-center font-extrabold text-gray-800" style={{ fontSize: 17 }}>
                      {s.whatsLeft || (s.isRtl ? 'מה נשאר לעשות?' : 'What is left to do?')}
                    </p>
                    <textarea
                      value={leftNote}
                      onChange={e => setLeftNote(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                      placeholder={s.whatsLeft || (s.isRtl ? 'מה נשאר לעשות?' : 'What is left to do?')}
                    />
                    <button data-work-send onClick={sendNotFinished} disabled={!leftNote.trim()}
                      className="w-full py-3.5 rounded-xl font-bold text-white text-base flex items-center justify-center gap-2 disabled:opacity-40"
                      style={{ backgroundColor: '#1e3a5f' }}>
                      <Send size={16} />
                      {s.sendToOffice || (s.isRtl ? 'שליחה למשרד' : 'Send to the office')}
                    </button>
                    <p className="text-center text-[11px] text-gray-400">
                      {s.halfDoneSaved || (s.isRtl
                        ? 'המשרד יראה את השלב הזה כחצי גמור.'
                        : 'The office will see this stage as half done.')}
                    </p>
                    <button onClick={() => setWorkHere({ ...workHere, step: 'finished' })}
                      className="w-full text-center text-xs font-semibold text-gray-400">
                      {s.isRtl ? 'חזרה' : 'Back'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}

      {/*
        The moment of finishing.

        A small celebration, and — the useful half — the report to the office
        already written: job, task, who, the photo links, the time. One press
        copies it for WhatsApp. Dismissable anywhere, because the worker who
        does not want it should not have to aim.
      */}
      {celebrate && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15,23,42,.55)' }}
          onClick={() => { setCelebrate(null); setCelebrateCopied(false); }}>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 text-center celebrate-pop"
            onClick={e => e.stopPropagation()}>
            <div className="celebrate-burst" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}
            </div>
            <div className="text-5xl mb-1">🎉</div>
            <h3 className="text-lg font-extrabold text-gray-900 mb-0.5">
              {s.isRtl ? 'כל הכבוד!' : 'Nice work!'}
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              {s.isRtl ? 'העתיקו את ההודעה ושלחו למשרד' : 'Copy this message and send it back to the office'}
            </p>
            <div className="text-left rounded-xl border border-gray-200 bg-gray-50 p-3 mb-3 max-h-44 overflow-y-auto"
              dir={s.isRtl ? 'rtl' : 'ltr'}>
              <pre className="whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-gray-700 font-sans">
                {celebrate.msg}
              </pre>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try { await navigator.clipboard.writeText(celebrate.msg); }
                  catch {
                    const ta = document.createElement('textarea');
                    ta.value = celebrate.msg; ta.style.position = 'fixed'; ta.style.opacity = '0';
                    document.body.appendChild(ta); ta.select();
                    document.execCommand('copy'); document.body.removeChild(ta);
                  }
                  setCelebrateCopied(true);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: celebrateCopied
                  ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                  : 'linear-gradient(135deg, #1e3a5f, #2d4a6f)' }}>
                {celebrateCopied ? (s.isRtl ? 'הועתק ✓' : 'Copied ✓') : (s.isRtl ? 'העתקת ההודעה' : 'Copy the message')}
              </button>
              <button onClick={() => { setCelebrate(null); setCelebrateCopied(false); }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-500 border border-gray-200">
                {s.isRtl ? 'סגירה' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

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
