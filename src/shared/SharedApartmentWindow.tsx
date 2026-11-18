/**
 * THE APARTMENT WINDOW, for someone outside the office (shared view, owner 2026-11-18). Four tabs and nothing else:
 *
 *   Details — building, floor, type, contractor, AC company, number, family name, standard / upgraded, the project's
 *             yes/no answers. NO address, NO phone, NO notes.
 *   Plan    — the starred plan, with layers, full screen, print, download, share, and their own pins.
 *   Stages  — the office's own stage list (StageSection) in its read-only form, with the pictures and films.
 *   Photos  — the apartment's photos (the Drive Photos folder through the server, minus any notes folders).
 *
 * No tasks, no history, no settings, no "report a problem", no plan search: those are simply not here — and every
 * piece of data it shows came from the server's allowlist (lib/sharedView.js).
 */
import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { X, Loader2, Play, ChevronLeft, ChevronRight, Camera } from 'lucide-react';
import type { MainUiStrings, Stage, BoardSetting, ContractorPhoto } from '../types';
import { StageSection, type StagePhotoItem } from '../components/apartment/StageSection';
import { useViewState } from '../data/viewState';
import { buildingShort, realName } from '../data/aptSale';
import { rowNumOf } from '../data/floorRows';
import { acCompanyOf, isCompanyButton, isInspectedButton } from '../data/aptCrew';
import type { SharedApi, SharedApartment, ViewerPin, DrivePhoto } from './sharedApi';
import type { PlanWords } from './SharedPlanViewer';

const SharedPlanViewer = lazy(() => import('./SharedPlanViewer'));

type Tab = 'details' | 'plan' | 'stages' | 'photos';
interface Media { ref: string; mimeType: string }

export function SharedApartmentWindow({ apartment, apartments, api, stages, board, pins, onPinsChange, ui, onClose }: {
  apartment: SharedApartment;
  apartments: SharedApartment[];
  api: SharedApi;
  stages: Stage[];
  board: BoardSetting;
  pins: ViewerPin[];
  onPinsChange: (next: ViewerPin[]) => void;
  ui: MainUiStrings;
  onClose: () => void;
}) {
  const rtl = !!ui.isRtl;
  const W = (en: string, he: string) => (rtl ? he : en);
  const [tab, setTab] = useState<Tab>('details');
  const [lightbox, setLightbox] = useState<{ items: Media[]; index: number } | null>(null);
  const sorted = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);
  const photos = useViewState(st => st.contractorPhotos);
  const loadPhotosFor = useViewState(st => st.loadPhotosFor);
  useEffect(() => { loadPhotosFor?.(apartment.id); }, [loadPhotosFor, apartment.id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lightbox) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, lightbox]);

  const partner = apartment.mergedWith ? apartments.find(a => a.id === apartment.mergedWith) : undefined;
  const number = partner
    ? [apartment.apartmentNumber, partner.apartmentNumber].filter(Boolean).sort((a, b) => (Number(a) || 0) - (Number(b) || 0)).join('/')
    : apartment.apartmentNumber;
  const family = realName(apartment);
  const title = `${ui.aptPrefix} ${number}${family ? ` — ${family}` : ''}`;
  const myPins = pins.filter(p => p.apartmentId === apartment.id && p.planRef === apartment.planRef);

  const planWords: PlanWords = {
    layers: W('Layers', 'שכבות'), allOn: W('All on', 'הכול'), allOff: W('All off', 'כלום'), fullScreen: W('Full screen', 'מסך מלא'),
    exitFullScreen: W('Exit full screen', 'יציאה ממסך מלא'), print: W('Print', 'הדפסה'), download: W('Download', 'הורדה'),
    share: W('Share', 'שיתוף'), addPin: W('Add pin', 'הוספת סיכה'), tapPlan: W('Tap the plan', 'לגעת בתוכנית'),
    pinPlaceholder: W('What is here?', 'מה יש כאן?'), save: W('Save', 'שמירה'), cancel: W('Cancel', 'ביטול'),
    remove: W('Remove', 'הסרה'), reallyRemove: W('Remove?', 'להסיר?'), loading: W('Loading the plan…', 'טוען את התוכנית…'),
    failed: W('The plan could not be opened.', 'לא ניתן לפתוח את התוכנית.'), page: W('Page', 'עמוד'), fit: W('Fit', 'התאמה'),
    shareFallback: W('Sharing isn\'t available here — the plan was downloaded instead.', 'שיתוף לא זמין כאן — התוכנית הורדה.'),
    pinFailed: W('That did not save — try again.', 'לא נשמר — נסו שוב.'), noLayers: W('This plan has no layers.', 'אין שכבות בתוכנית הזו.'),
    yourPins: W('Pins', 'סיכות'),
  };

  const tabs: Tab[] = ['details', 'plan', 'stages', 'photos'];
  const tabName = (t: Tab) => t === 'plan' ? W('Plan', 'תוכנית') : t === 'stages' ? ui.stagesTitle : t === 'photos' ? ui.tabPhotos : ui.tabDetails;

  return (
    <div className="fixed inset-0 z-[200] flex justify-end" style={{ background: 'rgba(15,23,42,.4)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} dir={rtl ? 'rtl' : 'ltr'}>
      <div role="dialog" aria-label={title} data-shared-window
        className="bg-white w-full max-w-[1100px] h-full flex flex-col shadow-2xl">
        <div className="flex items-center gap-3 px-4 py-3 text-white flex-shrink-0" style={{ backgroundColor: '#1e3a5f' }}>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold truncate">{title}</div>
            <div className="text-[12px] text-white/70">{buildingShort(apartment.buildingId)} · {ui.floorPrefix} {rowNumOf(apartment.buildingId, apartment.floor) || apartment.floor}</div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10" aria-label={W('Close', 'סגירה')}><X size={20} /></button>
        </div>
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {tabs.map(t => (
            <button key={t} type="button" data-shared-tab={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium ${tab === t ? 'border-b-2 border-[#1e3a5f] text-[#1e3a5f]' : 'text-gray-500 hover:text-gray-700'}`}>
              {tabName(t)}
            </button>
          ))}
        </div>
        <div className={`flex-1 min-h-0 ${tab === 'plan' ? 'overflow-hidden' : 'overflow-y-auto p-4'}`}>
          {tab === 'details' && <Details apartment={apartment} number={number} family={family} board={board} ui={ui} W={W} />}
          {tab === 'plan' && (apartment.planRef ? (
            <Suspense fallback={<div className="h-full flex items-center justify-center text-gray-400"><Loader2 className="animate-spin" /></div>}>
              <SharedPlanViewer api={api} planRef={apartment.planRef} apartmentId={apartment.id} label={title}
                pins={myPins} rtl={rtl} words={planWords}
                onPinsChange={next => onPinsChange([...pins.filter(p => !(p.apartmentId === apartment.id && p.planRef === apartment.planRef)), ...next])} />
            </Suspense>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-500 p-6 text-center">
              {W('No plan has been shared for this apartment yet.', 'עדיין לא שותפה תוכנית לדירה הזו.')}
            </div>
          ))}
          {tab === 'stages' && (
            <StageSection readOnly apartment={apartment} stages={sorted} tasks={[]} workers={[]} photos={photos}
              ctx={{ tipusStages: board.tipusStages }} ui={ui}
              onOpenPhotos={(items: StagePhotoItem[], index: number) => setLightbox({ items: items.map(i => ({ ref: i.fileId, mimeType: i.mimeType })).filter(i => i.ref), index })} />
          )}
          {tab === 'photos' && <PhotosTab apartment={apartment} api={api} photos={photos} stages={sorted} ui={ui} W={W}
            onOpen={(items, index) => setLightbox({ items, index })} />}
        </div>
      </div>
      {lightbox && <Lightbox api={api} {...lightbox} onIndex={i => setLightbox({ ...lightbox, index: i })} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-shrink-0 min-w-[3.5rem]">
      <div className="text-[10px] font-medium text-gray-500 mb-1">{label}</div>
      <div className="border border-gray-100 bg-gray-50 rounded-lg px-2.5 py-2 text-sm font-bold text-gray-700">{children || '—'}</div>
    </div>
  );
}

function Details({ apartment, number, family, board, ui, W }: {
  apartment: SharedApartment; number: string; family: string; board: BoardSetting; ui: MainUiStrings; W: (en: string, he: string) => string;
}) {
  const buttons = (board.customButtons ?? []).filter(cb => !isCompanyButton(cb) && !isInspectedButton(cb));
  return (
    <div className="space-y-4" data-shared-details>
      <div className="flex flex-wrap items-start gap-2">
        <Field label={ui.buildingWord}>{buildingShort(apartment.buildingId)}</Field>
        <Field label={ui.floorPrefix}>{rowNumOf(apartment.buildingId, apartment.floor) || apartment.floor}</Field>
        <Field label={ui.tipusLabel}>{apartment.tipus}</Field>
        <Field label={W('Contractor', 'קבלן')}>{apartment.crew}</Field>
        <Field label={W('AC company', 'חברת מיזוג')}>{acCompanyOf(apartment, board.customButtons ?? [])}</Field>
        <Field label={`${ui.aptPrefix} #`}>{number}</Field>
        <div className="flex-1 min-w-[150px]">
          <div className="text-[10px] font-medium text-gray-500 mb-1">{ui.familyName}</div>
          <div className="border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-800">{family || ui.notSoldWord}</div>
        </div>
        <div className="self-end">
          <span className={`inline-block px-2.5 py-2 rounded-lg text-xs font-medium border ${apartment.classification === 'shinui' ? 'bg-amber-500 text-white border-amber-500' : 'bg-[#1e3a5f] text-white border-[#1e3a5f]'}`}>
            {apartment.classification === 'shinui' ? ui.upgradedWord : ui.standard}
          </span>
        </div>
      </div>
      {buttons.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-sm font-bold text-gray-800">{ui.customButtonsTitle}</div>
          {buttons.map(cb => {
            const ans = apartment.customAnswers?.[cb.id];
            return (
              <div key={cb.id} className="flex items-center gap-3 justify-between">
                <span className="text-sm text-gray-800 min-w-0 truncate">{cb.name}</span>
                <span className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-700">
                  {ans === 'yes' ? ui.customYes : ans === 'no' ? ui.customNo : ans === 'unknown' ? ui.customUnknown : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PhotosTab({ apartment, api, photos, stages, ui, W, onOpen }: {
  apartment: SharedApartment; api: SharedApi; photos: ContractorPhoto[]; stages: Stage[]; ui: MainUiStrings;
  W: (en: string, he: string) => string; onOpen: (items: Media[], index: number) => void;
}) {
  const [drive, setDrive] = useState<DrivePhoto[] | null>(null);
  useEffect(() => {
    let dead = false;
    setDrive(null);
    api.photos(apartment.id).then(p => { if (!dead) setDrive(p); }).catch(() => { if (!dead) setDrive([]); });
    return () => { dead = true; };
  }, [api, apartment.id]);

  const groups = useMemo(() => {
    const out: { name: string; items: Media[] }[] = [];
    const byName = new Map<string, { name: string; items: Media[] }>();
    const seen = new Set<string>();
    const add = (name: string, m: Media) => {
      if (!m.ref || seen.has(m.ref)) return;
      seen.add(m.ref);
      const k = name.trim().toLowerCase();
      let g = byName.get(k);
      if (!g) { g = { name, items: [] }; byName.set(k, g); out.push(g); }
      g.items.push(m);
    };
    for (const d of drive ?? []) add(d.folder, { ref: d.ref, mimeType: d.mimeType });
    const site = photos.filter(p => p.apartmentId === apartment.id).sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
    for (const p of site) {
      const st = stages.find(s => s.id === p.stageId);
      add(st ? (ui.isRtl && st.nameHe ? st.nameHe : st.name) : ui.fromTheSite, { ref: p.driveFileId ?? '', mimeType: p.mimeType ?? 'image/jpeg' });
    }
    for (const ins of apartment.inspections ?? []) for (const f of ins.files) add(W('Inspections', 'בדיקות'), { ref: f.driveFileId ?? '', mimeType: f.mimeType });
    return out;
  }, [drive, photos, apartment, stages, ui, W]);

  if (drive === null && !groups.length) {
    return <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> {W('Loading photos…', 'טוען תמונות…')}</div>;
  }
  if (!groups.length) {
    return <div className="text-sm text-gray-500 flex items-center gap-2"><Camera size={16} /> {W('No photos yet.', 'אין עדיין תמונות.')}</div>;
  }
  return (
    <div className="space-y-5" data-shared-photos>
      {drive === null && <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> {W('Loading more…', 'טוען עוד…')}</div>}
      {groups.map(g => (
        <section key={g.name}>
          <h3 className="text-sm font-bold text-gray-800 mb-2">{g.name} <span className="text-gray-400 font-medium">· {g.items.length}</span></h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {g.items.map((m, i) => <Thumb key={m.ref} api={api} m={m} onClick={() => onOpen(g.items, i)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function Thumb({ api, m, onClick }: { api: SharedApi; m: Media; onClick: () => void }) {
  const [broken, setBroken] = useState(false);
  const video = m.mimeType.startsWith('video/');
  return (
    <button type="button" onClick={onClick} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
      {!broken && <img src={api.fileUrl(m.ref, 400)} alt="" loading="lazy" className="w-full h-full object-cover" onError={() => setBroken(true)} />}
      {(video || broken) && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-9 h-9 rounded-full bg-black/55 flex items-center justify-center">{video ? <Play size={16} color="#fff" fill="#fff" /> : <Camera size={16} color="#fff" />}</span>
        </span>
      )}
    </button>
  );
}

function Lightbox({ api, items, index, onIndex, onClose }: { api: SharedApi; items: Media[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const m = items[index];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, items.length, onIndex, onClose]);
  if (!m) return null;
  return (
    <div className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} dir="ltr">
      <button type="button" onClick={onClose} className="absolute top-3 right-3 p-2 rounded-full bg-white/10 text-white" aria-label="Close"><X size={22} /></button>
      {index > 0 && <button type="button" onClick={() => onIndex(index - 1)} className="absolute left-3 p-2 rounded-full bg-white/10 text-white" aria-label="Previous"><ChevronLeft size={26} /></button>}
      {index < items.length - 1 && <button type="button" onClick={() => onIndex(index + 1)} className="absolute right-3 p-2 rounded-full bg-white/10 text-white" aria-label="Next"><ChevronRight size={26} /></button>}
      {m.mimeType.startsWith('video/')
        ? <video key={m.ref} src={api.fileUrl(m.ref)} controls autoPlay playsInline className="max-w-[92vw] max-h-[86vh]" />
        : <img key={m.ref} src={api.fileUrl(m.ref, 1600)} alt="" className="max-w-[92vw] max-h-[86vh] object-contain" />}
      <div className="absolute bottom-3 text-white/70 text-sm">{index + 1} / {items.length}</div>
    </div>
  );
}
