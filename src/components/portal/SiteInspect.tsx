import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Image as ImageIcon, X, Play, Check, Loader2, Search } from 'lucide-react';
import { useStore } from '../../data/store';
import type { Apartment, Inspection, InspectionFile, Stage, User, PortalLang } from '../../types';
import { stageNameIn } from '../../types';
import { inspectionsOf, wantsVideo, asksApprove } from '../../data/stageHow';
import { jobFolderId } from '../../data/jobFolder';
import { isUploadBackendConfigured, findOrCreateFolderViaBackend, uploadFileViaResumableSession, ensureDriveShared, shareFileToDrive } from '../../data/driveApi';
import { expectUploads, forgetExpected, useUploadBatch, boxShowing } from '../../data/uploadTracker';
import { shrinkImageToDataUrl } from '../../data/imageMeta';
import { haptic } from '../../data/haptics';
import { InspectionCamera } from '../apartment/InspectionCamera';

/**
 * THE INSPECTOR'S SIDE OF THE WORKER LINK (owner, recording 2026-11-11 123621, 2:30 — "a worker link for Tzvi which is
 * the exact same layout as every worker; the only difference is instead of actually doing work he's doing
 * inspections"; and in chat: "the whole building map and everything, with the permissions … like the previous
 * workers"). A worker with the `inspect` permission gets a violet "Inspect here" at the foot of an apartment's sheet.
 * It opens this screen: which inspection (the next open one, the rest one tap away) → pictures and the video → Send →
 * "Do you approve this apartment?". Yes finishes the inspection stage in his name; No keeps it open and leaves the
 * office a word of what is wrong.
 *
 * It writes what the office's own Inspection button writes — an `Inspection` on the apartment record (cloud + backup),
 * the files in Drive › Photos › Inspections — so the job window shows it under the stage like any other.
 */

type W = (en: string, he: string, ru: string) => string;
const VIOLET = '#7c3aed';
const NAVY = '#1e3a5f';
const GREEN = '#059669';
const freshApt = (id: string) => useStore.getState().apartments.find(a => a.id === id) ?? null;
const isVideo = (f: { type?: string; name?: string }) => (f.type ?? '').startsWith('video/') || /\.(mp4|mov|m4v|webm|3gp)$/i.test(f.name ?? '');

/** The inspections of this apartment, in order, with which are done — for the sheet's button and the screen. */
export function inspectionList(apt: Apartment, sorted: Stage[], ctx: { tipusStages?: Record<string, string[]> }) {
  return inspectionsOf(apt, sorted, ctx);
}

/** The violet button at the foot of the sheet. Nothing when the apartment's list has no inspection stage. */
export function InspectHereButton({ apt, sorted, ctx, lang, w, onInspect }: {
  apt: Apartment; sorted: Stage[]; ctx: { tipusStages?: Record<string, string[]> }; lang: PortalLang; w: W; onInspect: () => void;
}) {
  const list = inspectionList(apt, sorted, ctx);
  if (!list.length) return null;
  const next = list.find(r => !r.done)?.st ?? null;
  return (
    <button data-site-inspect onClick={() => { haptic('tap'); onInspect(); }}
      className="w-full py-4 rounded-2xl text-base font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98]"
      style={{ backgroundColor: VIOLET }}>
      <Search size={18} />
      {next ? `${w('Inspect here', 'בדיקה כאן', 'Проверить здесь')} · ${stageNameIn(next, lang)}` : w('Inspect here', 'בדיקה כאן', 'Проверить здесь')}
    </button>
  );
}

type Step = 'media' | 'approve' | 'done' | 'no';

export function SiteInspectFlow({ aptId, sorted, ctx, inspector, user, lang, w, title, sub, onClose }: {
  aptId: string; sorted: Stage[]; ctx: { tipusStages?: Record<string, string[]> };
  inspector: { id: string; name: string }; user: User; lang: PortalLang; w: W;
  title: string; sub?: string; onClose: () => void;
}) {
  const apt = useStore(s => s.apartments.find(a => a.id === aptId)) ?? null;
  const updateApartment = useStore(s => s.updateApartment);
  const setApartmentMarks = useStore(s => s.setApartmentMarks);
  const list = apt ? inspectionList(apt, sorted, ctx) : [];
  const [stageId, setStageId] = useState<string | null>(() => (list.find(r => !r.done) ?? list[0])?.st.id ?? null);
  const stage = sorted.find(s => s.id === stageId) ?? null;
  const [step, setStep] = useState<Step>('media');
  const [insId, setInsId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ key: string; file: File; url: string }[]>([]);
  const pendingRef = useRef(pending); pendingRef.current = pending;
  useEffect(() => () => { pendingRef.current.forEach(p => URL.revokeObjectURL(p.url)); }, []);
  const [camOpen, setCamOpen] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const camFallbackRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wrong, setWrong] = useState('');
  const batch = useUploadBatch();
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
  const needVideo = !!stage && wantsVideo(stage);
  const hasVideo = pending.some(p => isVideo({ type: p.file.type, name: p.file.name }));
  const enough = pending.length > 0 && (!needVideo || hasVideo);

  const finish = (sid: string, inspections: Inspection[]) => {
    const a = freshApt(aptId); if (!a) return;
    setApartmentMarks(aptId, { ...(a.stageMarks ?? {}), [sid]: 'done' }, user, { quiet: true });
    const b = freshApt(aptId) ?? a;
    updateApartment(aptId, { inspections, stageDone: { ...(b.stageDone ?? {}), [sid]: { by: inspector.name, at: new Date().toISOString() } } }, user);
  };

  async function send() {
    if (!apt || !stage || sending || !enough) return;
    haptic('tap');
    setSending(true); setErr(null);
    const items = [...pendingRef.current];
    const saved: InspectionFile[] = [];
    try {
      let folder: string | null = null;
      const root = isUploadBackendConfigured() ? await jobFolderId(apt).catch(() => null) : null;
      if (root) {
        const photos = await findOrCreateFolderViaBackend(root, 'Photos');
        ensureDriveShared(photos);
        folder = await findOrCreateFolderViaBackend(photos, 'Inspections');
      }
      if (folder) expectUploads(items.map(p => p.file));
      for (const p of items) {
        if (folder) {
          const { fileId, webViewLink } = await uploadFileViaResumableSession(folder, p.file);
          void shareFileToDrive(fileId);
          saved.push({ filename: p.file.name, mimeType: p.file.type || 'application/octet-stream', driveFileId: fileId, driveUrl: webViewLink });
        } else if (!isVideo({ type: p.file.type, name: p.file.name })) {
          const dataUrl = await shrinkImageToDataUrl(p.file);
          if (dataUrl) saved.push({ filename: p.file.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', dataUrl });
        }
      }
    } catch {
      forgetExpected();
      setSending(false);
      setErr(w('The upload failed — try again', 'ההעלאה נכשלה — נסו שוב', 'Загрузка не удалась — попробуйте ещё раз'));
      return;
    }
    setSending(false);
    if (!saved.length) {
      setErr(w('Nothing was saved: this job has no Drive folder for a video. Send pictures, or ask the office.',
        'שום דבר לא נשמר: אין לעבודה תיקיית Drive לסרטון. שלחו תמונות, או פנו למשרד.',
        'Ничего не сохранено: у работы нет папки Drive для видео. Отправьте фото или спросите офис.'));
      return;
    }
    items.forEach(p => removePending(p.key));
    const now = new Date().toISOString();
    const a = freshApt(aptId); if (!a) return;
    const lastDone = [...sorted].reverse().find(s => a.stageMarks?.[s.id] === 'done')?.id ?? null;
    const ins: Inspection = { id: `ins-${Date.now().toString(36)}`, at: now, lastAt: now, byId: inspector.id, byName: inspector.name,
      afterStageId: lastDone, files: saved, stageId: stage.id };
    const all = [...(a.inspections ?? []), ins];
    setInsId(ins.id);
    haptic('success');
    if (asksApprove(stage)) { updateApartment(aptId, { inspections: all }, user); setStep('approve'); }
    else { finish(stage.id, all); setStep('done'); }
  }

  function answer(yes: boolean) {
    if (!stage || !insId) return;
    const a = freshApt(aptId); if (!a) return;
    const all = (a.inspections ?? []).map(i => (i.id === insId ? { ...i, approved: yes } : i));
    if (yes) { haptic('success'); finish(stage.id, all); setStep('done'); }
    else { haptic('tap'); updateApartment(aptId, { inspections: all }, user); setStep('no'); }
  }
  /** What is wrong, in his words — a note on the inspection the office reads. */
  function saveWrong() {
    const t = wrong.trim();
    if (t && insId) {
      const a = freshApt(aptId);
      if (a) updateApartment(aptId, { inspections: (a.inspections ?? []).map(i => (i.id === insId ? { ...i, note: t } : i)) }, user);
    }
    onClose();
  }

  const name = stage ? stageNameIn(stage, lang) : '';
  const back = (
    <button data-insp-back onClick={onClose} className="w-full py-3.5 rounded-xl text-[15px] font-bold text-white" style={{ backgroundColor: NAVY }}>
      {w('Back to the building', 'חזרה לבניין', 'Назад к зданию')}
    </button>
  );
  const screen = (
    <div data-inspect-flow={step} className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: '#f3f5f8' }}>
      <div className="flex items-center gap-2 px-4 pb-3 text-white flex-shrink-0" style={{ backgroundColor: NAVY, paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-[17px] truncate">{title}</div>
          {sub && <div className="text-[12px] opacity-75 truncate">{sub}</div>}
        </div>
        {step === 'media' && <button data-insp-close onClick={onClose} className="p-2 -m-2" aria-label={w('Close', 'סגירה', 'Закрыть')}><X size={26} /></button>}
      </div>
      <div className="flex-1 overflow-y-auto no-bar px-4 py-4 flex flex-col gap-3">
        {err && <div data-insp-error className="rounded-xl px-3 py-2.5 text-[13px] font-semibold" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>{err}</div>}

        {step === 'media' && (
          <>
            {list.length > 1 && (
              <div data-insp-choices className="flex flex-wrap gap-1.5">
                {list.map(r => (
                  <button key={r.st.id} data-insp-choice={r.st.id} aria-pressed={r.st.id === stageId} disabled={sending}
                    onClick={() => setStageId(r.st.id)}
                    className="px-3 py-2 rounded-full text-[13px] font-bold border inline-flex items-center gap-1.5"
                    style={r.st.id === stageId ? { backgroundColor: VIOLET, color: '#fff', borderColor: VIOLET } : { backgroundColor: '#fff', color: '#374151', borderColor: '#e5e7eb' }}>
                    {r.done && <Check size={13} strokeWidth={3} />}{stageNameIn(r.st, lang)}
                  </button>
                ))}
              </div>
            )}
            <div className="rounded-xl bg-white border border-gray-200 p-3 space-y-2.5">
              <div className="font-extrabold text-[14px] text-gray-900">{name}</div>
              <div className="grid grid-cols-3 gap-1.5" data-insp-pending={pending.length}>
                {pending.map(p => {
                  const v = isVideo({ type: p.file.type, name: p.file.name });
                  return (
                    <div key={p.key} data-insp-thumb={p.file.name} className="relative aspect-square rounded-lg overflow-hidden" style={{ background: 'linear-gradient(135deg, #cbd5e1, #94a3b8)' }}>
                      {v ? <video src={p.url} muted playsInline preload="metadata" className="w-full h-full object-cover" /> : <img src={p.url} alt="" className="w-full h-full object-cover" />}
                      {v && <span className="absolute inset-0 flex items-center justify-center pointer-events-none"><Play size={22} className="text-white drop-shadow" fill="#fff" /></span>}
                      {!sending && (
                        <button type="button" onClick={() => removePending(p.key)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center"><X size={14} /></button>
                      )}
                    </div>
                  );
                })}
                {!sending && (
                  <button type="button" onClick={() => galleryRef.current?.click()}
                    className="aspect-square rounded-lg bg-white flex items-center justify-center text-[24px] text-gray-400" style={{ border: '2px dashed #cbd5e1' }}>+</button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" data-insp-camera disabled={sending} onClick={() => setCamOpen(true)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-white border border-gray-200 text-gray-800 flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <Camera size={16} />{w('Camera', 'מצלמה', 'Камера')}
                </button>
                <button type="button" disabled={sending} onClick={() => galleryRef.current?.click()}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold bg-white border border-gray-200 text-gray-800 flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <ImageIcon size={16} />{w('Gallery', 'גלריה', 'Галерея')}
                </button>
              </div>
              <input ref={galleryRef} data-insp-gallery-input type="file" accept="image/*,video/*" multiple className="hidden"
                onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; addFiles(f); }} />
              <input ref={camFallbackRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; addFiles(f); }} />
            </div>
            {batch && sending && (
              <div data-upload-toast className="rounded-xl bg-white border border-gray-200 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[12.5px] font-bold text-gray-700">
                  <span className="flex-1">{w(`Uploading ${Math.min(batch.count, batch.done + 1)} of ${batch.count}`, `מעלה ${Math.min(batch.count, batch.done + 1)} מתוך ${batch.count}`, `Загрузка ${Math.min(batch.count, batch.done + 1)} из ${batch.count}`)}</span>
                  <span className="tabular-nums text-gray-500">{batch.pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-[#4aa8d8] transition-all" style={{ width: `${Math.max(4, batch.pct)}%` }} /></div>
              </div>
            )}
            {needVideo && !hasVideo && pending.length > 0 && (
              <div data-insp-need className="text-[13px] font-semibold text-center" style={{ color: '#9a3412' }}>{w('a video is needed', 'צריך סרטון', 'нужно видео')}</div>
            )}
            <div className="flex-1" />
            <button data-insp-send disabled={!enough || sending} onClick={() => void send()}
              className="w-full py-4 rounded-2xl text-base font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98]" style={{ backgroundColor: NAVY }}>
              {sending && <Loader2 size={18} className="animate-spin" />}{w('Send', 'שליחה', 'Отправить')}
            </button>
          </>
        )}

        {step === 'approve' && (
          <div data-insp-approve className="rounded-xl bg-white border border-gray-200 p-4 space-y-3">
            <div className="font-extrabold text-[20px] leading-tight text-gray-900 text-center py-1">
              {w('Do you approve this apartment?', 'האם אתה מאשר את הדירה?', 'Вы принимаете эту квартиру?')}
            </div>
            <button data-insp-yes onClick={() => answer(true)} className="w-full py-4 rounded-2xl text-base font-bold text-white active:scale-[0.98]" style={{ backgroundColor: GREEN }}>
              {w('Yes, approved', 'כן, מאושר', 'Да, принято')}
            </button>
            <button data-insp-no onClick={() => answer(false)} className="w-full py-4 rounded-2xl text-base font-bold active:scale-[0.98]"
              style={{ backgroundColor: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' }}>
              {w('No, not yet', 'לא, עדיין לא', 'Нет, пока нет')}
            </button>
          </div>
        )}

        {step === 'done' && (
          <>
            <div className="text-center grid gap-1">
              <div className="w-[54px] h-[54px] rounded-full mx-auto mt-1.5 flex items-center justify-center" style={{ backgroundColor: '#d1fae5', color: GREEN }}><Check size={30} strokeWidth={3} /></div>
              <div data-insp-done-title className="font-extrabold text-[18px] text-gray-900">{w(`${name}: approved`, `${name}: אושר`, `${name}: принято`)}</div>
            </div>
            {back}
          </>
        )}

        {step === 'no' && (
          <>
            <div className="rounded-xl bg-white border border-gray-200 p-4 space-y-2.5">
              <div className="font-extrabold text-[17px] text-gray-900">{w('What is wrong?', 'מה לא בסדר?', 'Что не так?')}</div>
              <textarea data-insp-wrong value={wrong} onChange={e => setWrong(e.target.value)} rows={4}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[15px] text-gray-900" />
            </div>
            <button data-insp-wrong-save onClick={saveWrong} className="w-full py-3.5 rounded-xl text-[15px] font-bold text-white" style={{ backgroundColor: NAVY }}>
              {w('Send to the office', 'שליחה למשרד', 'Отправить в офис')}
            </button>
          </>
        )}
      </div>
      <InspectionCamera open={camOpen} isRtl={lang === 'he'}
        onClose={() => setCamOpen(false)}
        onDone={files => { setCamOpen(false); addFiles(files); }}
        onFallback={k => { setCamOpen(false); (k === 'camera' ? camFallbackRef : galleryRef).current?.click(); }} />
    </div>
  );
  return createPortal(screen, document.body);
}
