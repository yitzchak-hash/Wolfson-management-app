import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Image as ImageIcon, X, Play, Trash2, Check, ChevronRight, Loader2, Search } from 'lucide-react';
import { useStore } from '../../data/store';
import type { Apartment, InspectionFile, SiteVisit, Stage, User, ContractorCategory, PortalLang } from '../../types';
import { stageNameIn } from '../../types';
import { stageSetOf, stageStateOf, isStartStage } from '../../data/stageMarks';
import { howOf, workerCanDo, nextSiteStage, waitingInspection, visitId, workingVisits } from '../../data/stageHow';
import { jobFolderId } from '../../data/jobFolder';
import {
  isUploadBackendConfigured, findOrCreateFolderViaBackend, uploadFileViaResumableSession,
  ensureDriveShared, shareFileToDrive, driveThumbUrl,
} from '../../data/driveApi';
import { expectUploads, forgetExpected, useUploadBatch, boxShowing } from '../../data/uploadTracker';
import { trashDriveFiles } from '../../data/driveTrash';
import { shrinkImageToDataUrl } from '../../data/imageMeta';
import { haptic } from '../../data/haptics';
import { InspectionCamera } from '../apartment/InspectionCamera';
import { MediaViewer } from '../ui/MediaViewer';

/**
 * THE WORKER'S SIDE OF THE SITE FLOW (owner, 2026-11-10 — the Site Flow Preview he approved, "Worker · his phone",
 * steps 1–6c). He taps an apartment and presses "I'm working here" — no stage, no questions. It glows on his map and
 * on the office board until he presses "I'm done here", sends his pictures and videos, and answers "Did you do
 * <the next open stage>?". Yes marks that stage done in his name; No leaves a question for the office.
 *
 * Everything is written on the apartment record (`siteVisits`, `stageMarks`, `stageDone`) through the store, so it is
 * in the cloud and the full backup with it. He may be working in any number of apartments at once, and a forgotten
 * one stays open until somebody closes it — nothing here closes a visit by itself.
 */

type W = (en: string, he: string, ru: string) => string;
export interface SiteWorker { id: string; name: string; category?: ContractorCategory }

const GREEN = '#059669';
const NAVY = '#1e3a5f';

/** HH:mm of a stored time, in the phone's own clock. */
export const clockOf = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** This worker's open visit here, if he has one. */
export const myOpenVisit = (apt: Pick<Apartment, 'siteVisits'> | null | undefined, workerId: string): SiteVisit | null =>
  apt ? workingVisits(apt).find(v => v.byId === workerId) ?? null : null;

const freshApt = (id: string) => useStore.getState().apartments.find(a => a.id === id) ?? null;

/** "I'm working here": one open visit for him on this apartment (a second press is the same visit). */
export function startSiteVisit(aptId: string, worker: SiteWorker, user: User): string | null {
  const apt = freshApt(aptId);
  if (!apt) return null;
  const mine = myOpenVisit(apt, worker.id);
  if (mine) return mine.id;
  const v: SiteVisit = { id: visitId(), byId: worker.id, byName: worker.name, startedAt: new Date().toISOString(), status: 'working' };
  useStore.getState().updateApartment(aptId, { siteVisits: [...(apt.siteVisits ?? []), v] }, user);
  return v.id;
}

/** The workspace's stages in order — the same list the job window and the board read. */
function useSortedStages(): { sorted: Stage[]; ctx: { tipusStages?: Record<string, string[]> } } {
  const stages = useStore(s => s.stages);
  const projectId = useStore(s => s.currentProjectId);
  const tipusStages = useStore(s => s.boardSettings[s.currentProjectId]?.tipusStages);
  const sorted = useMemo(() => stages
    .filter(st => (projectId === 'general' ? st.projectId === 'general' : !st.projectId))
    .sort((a, b) => a.order - b.order), [stages, projectId]);
  return { sorted, ctx: { tipusStages } };
}

/** The stage he is asked about at the end: the first open SITE stage he can do, else the first open site stage. */
export function suggestedStage(apt: Apartment, sorted: Stage[], ctx: { tipusStages?: Record<string, string[]> }, worker: SiteWorker): Stage | null {
  const open = stageSetOf(apt, sorted, ctx)
    .filter(st => !isStartStage(st) && howOf(st) === 'site')
    .filter(st => { const s = stageStateOf(apt, st.id, sorted); return s !== 'done' && s !== 'off'; });
  return open.find(st => workerCanDo(st, { id: worker.id, category: worker.category })) ?? nextSiteStage(apt, sorted, ctx);
}

/**
 * The top of the apartment's sheet on the map (step 1): one big green "I'm working here" and Cancel — or, when he is
 * already working here, "I'm done here" (big navy) and "Still working".
 */
export function SiteHereBlock({ apt, workerId, w, onStart, onDone, onCancel }: {
  apt: Apartment; workerId: string; w: W;
  onStart: () => void; onDone: () => void; onCancel: () => void;
}) {
  const mine = myOpenVisit(apt, workerId);
  const big = 'w-full py-4 rounded-2xl text-base font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98]';
  const ghost = 'w-full py-3 rounded-xl text-[14px] font-bold bg-white border border-gray-200 text-gray-800 active:scale-[0.98]';
  if (mine) return (
    <div data-site-here="working" className="space-y-2">
      <div className="rounded-xl px-3 py-2.5 flex items-center gap-2.5 font-bold text-[13.5px]"
        style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46' }}>
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 apt-signal-work" style={{ backgroundColor: GREEN }} />
        {w(`You are working here since ${clockOf(mine.startedAt)}`, `אתה עובד כאן מאז ${clockOf(mine.startedAt)}`, `Вы работаете здесь с ${clockOf(mine.startedAt)}`)}
      </div>
      <button data-site-done-here className={big} style={{ backgroundColor: NAVY }}
        onClick={() => { haptic('tap'); onDone(); }}>
        {w("I'm done here", 'סיימתי כאן', 'Я закончил здесь')}
      </button>
      <button data-site-still className={ghost} onClick={onCancel}>{w('Still working', 'עדיין עובד', 'Ещё работаю')}</button>
    </div>
  );
  return (
    <div data-site-here="idle" className="space-y-2">
      <button data-site-start className={big} style={{ backgroundColor: GREEN }}
        onClick={() => { haptic('success'); onStart(); }}>
        {w("I'm working here", 'אני עובד כאן', 'Я работаю здесь')}
      </button>
      <button data-site-cancel className={ghost} onClick={onCancel}>{w('Cancel', 'ביטול', 'Отмена')}</button>
    </div>
  );
}

/** The green bars on top of the map (step 2): one per apartment he is working in now. */
export function WorkingBars({ apartments, workerId, w, label, onOpen }: {
  apartments: Apartment[]; workerId: string; w: W;
  label: (apt: Apartment) => string;
  onOpen: (aptId: string, visitId: string) => void;
}) {
  const open = apartments
    .map(a => ({ a, v: myOpenVisit(a, workerId) }))
    .filter((x): x is { a: Apartment; v: SiteVisit } => !!x.v)
    .sort((x, y) => x.v.startedAt.localeCompare(y.v.startedAt));
  if (!open.length) return null;
  return (
    <div data-working-bars className="px-2.5 pt-2 space-y-1.5 flex-shrink-0">
      {open.map(({ a, v }) => (
        <button key={v.id} data-working-bar={a.id}
          onClick={() => { haptic('tap'); onOpen(a.id, v.id); }}
          className="w-full rounded-xl px-3 py-2.5 flex items-center gap-2.5 font-bold text-[13.5px] text-left rtl:text-right active:scale-[0.99]"
          style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46' }}>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 apt-signal-work" style={{ backgroundColor: GREEN }} />
          <span className="flex-1 min-w-0 truncate">
            {w(`Working in Apt ${label(a)} · since ${clockOf(v.startedAt)}`, `עובד בדירה ${label(a)} · מאז ${clockOf(v.startedAt)}`, `Работаю в кв. ${label(a)} · с ${clockOf(v.startedAt)}`)}
          </span>
          <ChevronRight size={16} className="flex-shrink-0 rtl:rotate-180" />
        </button>
      ))}
    </div>
  );
}

const isVideo = (f: { mimeType?: string; type?: string; filename?: string; name?: string }) =>
  (f.mimeType ?? f.type ?? '').startsWith('video/') || /\.(mp4|mov|m4v|webm|3gp)$/i.test(f.filename ?? f.name ?? '');
const isPicture = (f: { mimeType?: string; type?: string; filename?: string; name?: string }) =>
  (f.mimeType ?? f.type ?? '').startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.filename ?? f.name ?? '');

/** One square picture of a file: its own pixels, Drive's thumbnail, or a dark tile for a film. */
function Thumb({ src, video, picked, onClick, onRemove, hook }: {
  src?: string; video: boolean; picked?: boolean; onClick?: () => void; onRemove?: () => void; hook?: Record<string, string>;
}) {
  return (
    <div {...hook} data-picked={picked ? '1' : undefined}
      className="relative aspect-square rounded-lg overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #cbd5e1, #94a3b8)', outline: picked ? '3px solid #dc2626' : undefined, outlineOffset: -3 }}>
      <button type="button" onClick={onClick} className="absolute inset-0 w-full h-full">
        {src && !video && <img src={src} alt="" className="w-full h-full object-cover" />}
        {src && video && /^blob:/.test(src) && <video src={src} muted playsInline preload="metadata" className="w-full h-full object-cover" />}
        {src && video && !/^blob:/.test(src) && <img src={src} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
        {video && <span className="absolute inset-0 flex items-center justify-center"><Play size={22} className="text-white drop-shadow" fill="#fff" /></span>}
      </button>
      {picked && (
        <span className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-white pointer-events-none" style={{ backgroundColor: '#dc2626' }}>
          <Check size={13} strokeWidth={3} />
        </span>
      )}
      {onRemove && (
        <button type="button" data-site-thumb-remove onClick={onRemove}
          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

type Step = 'ask' | 'media' | 'question' | 'done' | 'office';

/** The full-screen flow on his phone: steps 3 to 6c of the approved drawing. */
export function SiteVisitFlow({ aptId, visitId: vid, start, worker, user, lang, w, title, sub, onClose }: {
  aptId: string; visitId: string; start: 'ask' | 'media';
  worker: SiteWorker; user: User; lang: PortalLang; w: W;
  title: string; sub?: string;
  onClose: () => void;
}) {
  const apt = useStore(s => s.apartments.find(a => a.id === aptId)) ?? null;
  const updateApartment = useStore(s => s.updateApartment);
  const setApartmentMarks = useStore(s => s.setApartmentMarks);
  const { sorted, ctx } = useSortedStages();
  const visit = apt?.siteVisits?.find(v => v.id === vid) ?? null;
  const [step, setStep] = useState<Step>(start);
  /** The stage asked about — fixed once the question shows, so marking it done does not move it under his finger. */
  const [askedId, setAskedId] = useState<string | null>(null);
  const suggestion = useMemo(() => (apt ? suggestedStage(apt, sorted, ctx, worker) : null), [apt, sorted, ctx, worker]);
  const asked = (askedId ? sorted.find(s => s.id === askedId) : null) ?? (step === 'media' || step === 'ask' ? suggestion : null);

  // The files he picked, before they go up.
  const [pending, setPending] = useState<{ key: string; file: File; url: string }[]>([]);
  const pendingRef = useRef(pending); pendingRef.current = pending;
  useEffect(() => () => { pendingRef.current.forEach(p => URL.revokeObjectURL(p.url)); }, []);
  const [camOpen, setCamOpen] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const camFallbackRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const batch = useUploadBatch();
  // The batch card is drawn INSIDE this screen; the corner card (where there is one) stands aside meanwhile.
  useEffect(() => { boxShowing(1); return () => boxShowing(-1); }, []);

  const addFiles = (files: File[]) => {
    if (!files.length) return;
    setErr(null);
    setPending(p => [...p, ...files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, file: f, url: URL.createObjectURL(f) }))]);
  };
  const removePending = (key: string) => setPending(p => {
    const hit = p.find(x => x.key === key); if (hit) URL.revokeObjectURL(hit.url);
    return p.filter(x => x.key !== key);
  });

  const patchVisit = (patch: Partial<SiteVisit>, extra?: Partial<Apartment>) => {
    const a = freshApt(aptId); if (!a) return;
    const list = (a.siteVisits ?? []).map(v => (v.id === vid ? { ...v, ...patch } : v));
    updateApartment(aptId, { siteVisits: list, ...(extra ?? {}) }, user);
  };
  const addSaved = (f: InspectionFile) => {
    const a = freshApt(aptId); if (!a) return;
    const list = (a.siteVisits ?? []).map(v => (v.id === vid ? { ...v, files: [...(v.files ?? []), f] } : v));
    updateApartment(aptId, { siteVisits: list }, user, { quiet: true });
  };

  const sent = visit?.files ?? [];
  // The proof the suggested stage asks for (pictures and/or a video); with none set, one file of any kind.
  const all = [...sent.map(f => ({ mimeType: f.mimeType, filename: f.filename })), ...pending.map(p => ({ type: p.file.type, name: p.file.name }))];
  const pics = all.filter(isPicture).length;
  const vids = all.filter(isVideo).length;
  const needPics = suggestion?.proofPictures ?? 0;
  const needVideo = !!suggestion?.proofVideo;
  const morePics = Math.max(0, needPics - pics);
  const moreVideo = needVideo && vids === 0;
  const enough = (needPics || needVideo) ? (!morePics && !moreVideo) : all.length > 0;

  async function send() {
    if (!apt || sending || !enough) return;
    haptic('tap');
    setSending(true); setErr(null);
    const items = [...pendingRef.current];
    let folder: string | null = null;
    if (items.length) {
      try {
        const root = isUploadBackendConfigured() ? await jobFolderId(apt).catch(() => null) : null;
        if (root) {
          const photos = await findOrCreateFolderViaBackend(root, 'Photos');
          ensureDriveShared(photos);
          folder = await findOrCreateFolderViaBackend(photos, 'Site visits');
        }
      } catch {
        setSending(false);
        setErr(w('Could not reach Drive — try again', 'אין חיבור ל-Drive — נסו שוב', 'Нет связи с Drive — попробуйте ещё раз'));
        return;
      }
      if (folder) expectUploads(items.map(p => p.file));   // one bar for the whole batch (uploadTracker)
      let refused = 0;
      try {
        for (const p of items) {
          if (folder) {
            const { fileId, webViewLink } = await uploadFileViaResumableSession(folder, p.file);
            void shareFileToDrive(fileId);
            addSaved({ filename: p.file.name, mimeType: p.file.type || 'application/octet-stream', driveFileId: fileId, driveUrl: webViewLink });
          } else if (isVideo({ type: p.file.type, name: p.file.name })) {
            // No Drive folder anywhere: a film cannot ride inside the record — say so, never drop it silently.
            refused++;
          } else {
            const dataUrl = await shrinkImageToDataUrl(p.file);
            if (!dataUrl) { refused++; } else addSaved({ filename: p.file.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', dataUrl });
          }
          removePending(p.key);
        }
      } catch {
        forgetExpected();
        setSending(false);
        setErr(w('The upload failed — try again', 'ההעלאה נכשלה — נסו שוב', 'Загрузка не удалась — попробуйте ещё раз'));
        return;
      }
      if (refused) {
        setSending(false);
        setErr(w('A video was not saved: this job has no Drive folder. Send pictures, or ask the office.',
          'סרטון לא נשמר: אין לעבודה תיקיית Drive. שלחו תמונות, או פנו למשרד.',
          'Видео не сохранено: у работы нет папки Drive. Отправьте фото или спросите офис.'));
        const now = (freshApt(aptId)?.siteVisits?.find(v => v.id === vid)?.files ?? []).length;
        if (!now) return;
      }
    }
    setSending(false);
    haptic('success');
    if (suggestion) { setAskedId(suggestion.id); setStep('question'); }
    else answerNo(null);
  }

  function answerYes() {
    if (!asked) return;
    haptic('success');
    const a = freshApt(aptId); if (!a) return;
    const now = new Date().toISOString();
    setApartmentMarks(aptId, { ...(a.stageMarks ?? {}), [asked.id]: 'done' }, user, { quiet: true });
    const b = freshApt(aptId) ?? a;
    patchVisit({ status: 'done', stageId: asked.id, askedStageId: asked.id, endedAt: now },
      { stageDone: { ...(b.stageDone ?? {}), [asked.id]: { by: worker.name, at: now } } });
    setStep('done');
  }
  function answerNo(stageId: string | null) {
    haptic('tap');
    patchVisit({ status: 'question', askedStageId: stageId, endedAt: new Date().toISOString() });
    setStep('office');
  }

  // Select and delete (6b).
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [delAsk, setDelAsk] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewAt, setViewAt] = useState<number | null>(null);
  async function deletePicked() {
    const chosen = picked.map(i => sent[i]).filter(Boolean);
    const driveIds = chosen.map(f => f.driveFileId).filter((x): x is string => !!x);
    setDeleting(true); setErr(null);
    let gone = new Set<string>();
    try { gone = driveIds.length ? await trashDriveFiles(driveIds) : new Set(); }
    catch {
      setDeleting(false); setDelAsk(false);
      setErr(w('Drive did not delete them — try again', 'Drive לא מחק אותם — נסו שוב', 'Drive не удалил их — попробуйте ещё раз'));
      return;
    }
    // A Drive file goes only once Drive says it is in the trash; a picture kept in the record simply goes.
    const keyOf = (f: InspectionFile) => f.driveFileId ?? f.dataUrl ?? f.filename;
    const drop = new Set(chosen.filter(f => !f.driveFileId || gone.has(f.driveFileId)).map(keyOf));
    const a = freshApt(aptId);
    if (a) {
      const list = (a.siteVisits ?? []).map(v => (v.id === vid ? { ...v, files: (v.files ?? []).filter(f => !drop.has(keyOf(f))) } : v));
      updateApartment(aptId, { siteVisits: list }, user);
    }
    if (drop.size < chosen.length) setErr(w('Some could not be deleted', 'חלק לא נמחקו', 'Часть не удалось удалить'));
    setDeleting(false); setDelAsk(false); setSelecting(false); setPicked([]);
  }
  const thumbSrc = (f: InspectionFile) => f.dataUrl ?? (f.driveFileId ? driveThumbUrl(f.driveFileId, 400) : undefined);

  const sentCard = (
    <div data-site-sent className="rounded-xl bg-white border border-gray-200 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <b className="flex-1 text-[14px] text-gray-900" data-site-sent-count={selecting ? picked.length : sent.length}>
          {selecting
            ? w(`${picked.length} selected`, `${picked.length} נבחרו`, `Выбрано: ${picked.length}`)
            : w(`What you sent · ${sent.length}`, `מה ששלחת · ${sent.length}`, `Что вы отправили · ${sent.length}`)}
        </b>
        {sent.length > 0 && (
          <button data-site-select onClick={() => { setSelecting(x => !x); setPicked([]); setDelAsk(false); }}
            className="rounded-full px-3 py-1 text-[12px] font-bold bg-white border border-gray-200 text-gray-800">
            {selecting ? w('Cancel', 'ביטול', 'Отмена') : w('Select', 'בחירה', 'Выбрать')}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {sent.map((f, i) => (
          <Thumb key={`${f.driveFileId ?? ''}${i}`} hook={{ 'data-site-sent-thumb': String(i) }}
            src={thumbSrc(f)} video={isVideo(f)} picked={selecting && picked.includes(i)}
            onClick={() => (selecting ? setPicked(p => (p.includes(i) ? p.filter(x => x !== i) : [...p, i])) : setViewAt(i))} />
        ))}
      </div>
      {selecting && (
        <button data-site-delete disabled={!picked.length}
          onClick={() => setDelAsk(true)}
          className="w-full py-3 rounded-xl text-[14px] font-bold bg-white flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ color: '#dc2626', border: '1px solid #fecaca' }}>
          <Trash2 size={16} />{w(`Delete ${picked.length}`, `מחיקת ${picked.length}`, `Удалить: ${picked.length}`)}
        </button>
      )}
      {delAsk && (
        <div data-site-delete-ask className="rounded-2xl bg-white p-3.5 space-y-2.5" style={{ boxShadow: '0 6px 20px rgba(15,23,42,.15)', border: '1px solid #e5e7eb' }}>
          <div className="font-extrabold text-[15px] text-gray-900">
            {picked.length === 1
              ? w('Delete 1 picture?', 'למחוק תמונה אחת?', 'Удалить 1 фото?')
              : w(`Delete ${picked.length} pictures?`, `למחוק ${picked.length} תמונות?`, `Удалить ${picked.length} фото?`)}
          </div>
          <div className="flex gap-2">
            <button data-site-delete-keep onClick={() => setDelAsk(false)} className="flex-1 py-3 rounded-xl text-[14px] font-bold bg-white border border-gray-200 text-gray-800">
              {w('Keep', 'להשאיר', 'Оставить')}
            </button>
            <button data-site-delete-yes disabled={deleting} onClick={() => { haptic('tap'); void deletePicked(); }}
              className="flex-1 py-3 rounded-xl text-[14px] font-bold text-white flex items-center justify-center gap-1.5" style={{ backgroundColor: '#dc2626' }}>
              {deleting && <Loader2 size={15} className="animate-spin" />}{w('Delete', 'מחיקה', 'Удалить')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
  const back = (
    <button data-site-back onClick={onClose} className="w-full py-3.5 rounded-xl text-[15px] font-bold text-white" style={{ backgroundColor: NAVY }}>
      {w('Back to the building', 'חזרה לבניין', 'Назад к зданию')}
    </button>
  );

  const headTitle = step === 'media' ? w('Your pictures and videos', 'התמונות והסרטונים שלך', 'Ваши фото и видео') : title;
  const headSub = step === 'media' ? title : sub;
  const nextHere = step === 'done' && apt ? (() => {
    const insp = waitingInspection(apt, sorted, ctx);
    if (insp) return { insp: true, name: stageNameIn(insp, lang), color: '#7c3aed' };
    const nx = nextSiteStage(apt, sorted, ctx);
    return nx ? { insp: false, name: stageNameIn(nx, lang), color: nx.color } : null;
  })() : null;

  const screen = (
    <div data-site-flow={step} className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: '#f3f5f8' }}>
      <div className="flex items-center gap-2 px-4 pb-3 text-white flex-shrink-0" style={{ backgroundColor: NAVY, paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-[17px] truncate" data-site-title>{headTitle}</div>
          {headSub && <div className="text-[12px] opacity-75 truncate">{headSub}</div>}
        </div>
        {(step === 'ask' || step === 'media') && (
          <button data-site-close onClick={onClose} className="p-1.5 -m-1.5" aria-label={w('Close', 'סגירה', 'Закрыть')}><X size={20} /></button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {err && <div data-site-error className="rounded-xl px-3 py-2.5 text-[13px] font-semibold" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>{err}</div>}

        {step === 'ask' && (
          <>
            <div className="rounded-xl px-3 py-2.5 flex items-center gap-2.5 font-bold text-[13.5px]"
              style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46' }}>
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 apt-signal-work" style={{ backgroundColor: GREEN }} />
              {visit?.status === 'working'
                ? w(`You are working here since ${clockOf(visit.startedAt)}`, `אתה עובד כאן מאז ${clockOf(visit.startedAt)}`, `Вы работаете здесь с ${clockOf(visit.startedAt)}`)
                : w('This visit is closed', 'הביקור הזה נסגר', 'Этот визит закрыт')}
            </div>
            <div className="flex-1" />
            {visit?.status === 'working' && (
              <button data-site-done-here onClick={() => { haptic('tap'); setStep('media'); }}
                className="w-full py-4 rounded-2xl text-base font-bold text-white active:scale-[0.98]" style={{ backgroundColor: NAVY }}>
                {w("I'm done here", 'סיימתי כאן', 'Я закончил здесь')}
              </button>
            )}
            <button data-site-still onClick={onClose} className="w-full py-3 rounded-xl text-[14px] font-bold bg-white border border-gray-200 text-gray-800">
              {w('Still working', 'עדיין עובד', 'Ещё работаю')}
            </button>
          </>
        )}

        {step === 'media' && (
          <>
            <div className="rounded-xl bg-white border border-gray-200 p-3 space-y-2.5">
              <div className="font-extrabold text-[14px] text-gray-900">{w('Show what you did today', 'הראו מה עשיתם היום', 'Покажите, что вы сделали сегодня')}</div>
              <div className="grid grid-cols-3 gap-1.5" data-site-pending={pending.length}>
                {sent.map((f, i) => <Thumb key={`s${i}`} src={thumbSrc(f)} video={isVideo(f)} hook={{ 'data-site-uploaded': String(i) }} />)}
                {pending.map(p => (
                  <Thumb key={p.key} src={p.url} video={isVideo({ type: p.file.type, name: p.file.name })}
                    hook={{ 'data-site-pending-thumb': p.file.name }}
                    onRemove={sending ? undefined : () => removePending(p.key)} />
                ))}
                {!sending && (
                  <button type="button" data-site-add onClick={() => galleryRef.current?.click()}
                    className="aspect-square rounded-lg bg-white flex items-center justify-center text-[24px] text-gray-400"
                    style={{ border: '2px dashed #cbd5e1' }}>+</button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" data-site-camera disabled={sending} onClick={() => setCamOpen(true)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-white border border-gray-200 text-gray-800 flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <Camera size={16} />{w('Camera', 'מצלמה', 'Камера')}
                </button>
                <button type="button" data-site-gallery disabled={sending} onClick={() => galleryRef.current?.click()}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-white border border-gray-200 text-gray-800 flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <ImageIcon size={16} />{w('Gallery', 'גלריה', 'Галерея')}
                </button>
              </div>
              <input ref={galleryRef} data-site-gallery-input type="file" accept="image/*,video/*" multiple className="hidden"
                onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; addFiles(f); }} />
              <input ref={camFallbackRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; addFiles(f); }} />
            </div>
            {batch && sending && (
              <div data-upload-toast data-site-batch data-upload-count={batch.count} data-upload-done={batch.done}
                className="rounded-xl bg-white border border-gray-200 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[12.5px] font-bold text-gray-700">
                  <span className="flex-1">
                    {w(`Uploading ${Math.min(batch.count, batch.done + 1)} of ${batch.count}`, `מעלה ${Math.min(batch.count, batch.done + 1)} מתוך ${batch.count}`, `Загрузка ${Math.min(batch.count, batch.done + 1)} из ${batch.count}`)}
                  </span>
                  <span className="tabular-nums text-gray-500">{batch.pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-[#4aa8d8] transition-all" style={{ width: `${Math.max(4, batch.pct)}%` }} />
                </div>
              </div>
            )}
            {!enough && (needPics > 0 || needVideo) && (
              <div data-site-need className="text-[13px] font-semibold text-center" style={{ color: '#9a3412' }}>
                {[
                  morePics ? w(`${morePics} more ${morePics === 1 ? 'picture' : 'pictures'} needed`, `צריך עוד ${morePics} ${morePics === 1 ? 'תמונה' : 'תמונות'}`, `Нужно ещё фото: ${morePics}`) : '',
                  moreVideo ? w('a video is needed', 'צריך סרטון', 'нужно видео') : '',
                ].filter(Boolean).join(' · ')}
              </div>
            )}
            <div className="flex-1" />
            <button data-site-send disabled={!enough || sending} onClick={() => void send()}
              className="w-full py-4 rounded-2xl text-base font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98]"
              style={{ backgroundColor: NAVY }}>
              {sending && <Loader2 size={18} className="animate-spin" />}{w('Send', 'שליחה', 'Отправить')}
            </button>
          </>
        )}

        {step === 'question' && asked && (
          <div data-site-question={asked.id} className="rounded-xl bg-white border border-gray-200 p-4 space-y-3">
            <div className="text-[12px] text-gray-500">{w('The next stage open here is', 'השלב הבא הפתוח כאן הוא', 'Следующий открытый этап здесь')}</div>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-gray-200 font-bold text-[16px]" style={{ color: asked.color }}>
              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ border: '2.5px solid currentColor' }} />
              <span className="text-gray-900">{stageNameIn(asked, lang)}</span>
            </div>
            <div className="font-extrabold text-[18px] leading-tight text-gray-900">
              {w(`Did you do ${stageNameIn(asked, lang)} here?`, `עשית כאן ${stageNameIn(asked, lang)}?`, `Вы сделали здесь: ${stageNameIn(asked, lang)}?`)}
            </div>
            <button data-site-yes onClick={answerYes}
              className="w-full py-4 rounded-2xl text-base font-bold text-white active:scale-[0.98]" style={{ backgroundColor: GREEN }}>
              {w(`Yes, ${stageNameIn(asked, lang)}`, `כן, ${stageNameIn(asked, lang)}`, `Да, ${stageNameIn(asked, lang)}`)}
            </button>
            <button data-site-no onClick={() => answerNo(asked.id)}
              className="w-full py-4 rounded-2xl text-base font-bold active:scale-[0.98]"
              style={{ backgroundColor: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' }}>
              {w('No, something else', 'לא, משהו אחר', 'Нет, другое')}
            </button>
          </div>
        )}

        {step === 'done' && (
          <>
            <div className="text-center grid gap-1">
              <div className="w-[54px] h-[54px] rounded-full mx-auto mt-1.5 flex items-center justify-center" style={{ backgroundColor: '#d1fae5', color: GREEN }}><Check size={30} strokeWidth={3} /></div>
              <div data-site-done-title className="font-extrabold text-[18px] text-gray-900">
                {w(`Done. ${asked ? stageNameIn(asked, lang) : ''} is finished`, `בוצע. ${asked ? stageNameIn(asked, lang) : ''} הסתיים`, `Готово. ${asked ? stageNameIn(asked, lang) : ''} завершён`)}
              </div>
            </div>
            {sentCard}
            {nextHere && (
              <div data-site-next className="rounded-xl bg-white border border-gray-200 p-3 space-y-2">
                <div className="text-[10.5px] font-semibold text-gray-500 tracking-wide">{w('NEXT HERE', 'הבא כאן', 'ДАЛЕЕ ЗДЕСЬ')}</div>
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white font-bold text-[14px]"
                  style={{ color: nextHere.color, border: `1px ${nextHere.insp ? 'dashed' : 'solid'} ${nextHere.insp ? nextHere.color : '#e5e7eb'}` }}>
                  {nextHere.insp ? <Search size={16} /> : <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ border: '2.5px solid currentColor' }} />}
                  <span data-site-next-name={nextHere.insp ? 'inspection' : 'stage'}>
                    {nextHere.insp ? w(`Waiting for ${nextHere.name}`, `ממתין ל${nextHere.name}`, `Ожидает: ${nextHere.name}`) : nextHere.name}
                  </span>
                </div>
              </div>
            )}
            {back}
          </>
        )}

        {step === 'office' && (
          <>
            <div className="text-center grid gap-1.5">
              <div className="w-[54px] h-[54px] rounded-full mx-auto mt-1.5 flex items-center justify-center" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}><Check size={30} strokeWidth={3} /></div>
              <div data-site-office-title className="font-extrabold text-[18px] text-gray-900">{w('Sent to the office', 'נשלח למשרד', 'Отправлено в офис')}</div>
              <div className="text-[13px] text-gray-500">{w('They will be in touch with you.', 'הם ייצרו איתך קשר.', 'С вами свяжутся.')}</div>
            </div>
            {sentCard}
            {back}
          </>
        )}
      </div>
      <InspectionCamera open={camOpen} isRtl={lang === 'he'}
        onClose={() => setCamOpen(false)}
        onDone={files => { setCamOpen(false); addFiles(files); }}
        onFallback={k => { setCamOpen(false); (k === 'camera' ? camFallbackRef : galleryRef).current?.click(); }} />
      {viewAt !== null && sent[viewAt] && (
        <MediaViewer lang={lang} initialIndex={viewAt} onClose={() => setViewAt(null)}
          items={sent.map(f => ({ fileId: f.driveFileId, filename: f.filename, mimeType: f.mimeType, src: f.dataUrl }))} />
      )}
    </div>
  );
  return createPortal(screen, document.body);
}
