/**
 * THE APARTMENT WINDOW, for someone outside the office (shared view, owner 2026-11-18: "when I click on an apartment
 * in the link, I want it to show the same window as we see, but just the features that are available. Same exact
 * window and style").
 *
 * So this IS the office's window (components/apartment/ApartmentDetailDrawer) with the office-only parts left out:
 * the same size and place (centred, full screen on a phone, wider with the plan beside it), the same navy title,
 * the same tab row, the same details layout, the same stage list, the same plan pane and the same photo grid. The
 * look-only pieces both windows draw come from components/apartment/drawerParts.tsx, so they cannot drift apart.
 *
 *   Details — building, floor, type, contractor, AC company, number, family name, standard / upgraded, the project's
 *             yes/no answers, and the stages (StageSection, read-only) — shown, never editable. NO address, NO
 *             phone, NO notes.
 *   Plan    — beside the details on a wide screen, its own tab on a narrow one (as in the office): the starred plan,
 *             with layers, full screen, print, download, share, and this link's own pins.
 *   Photos  — the apartment's photos (the Drive Photos folder through the server, minus any notes folders).
 *
 * No tasks, no notes, no history, no settings, no Drive / Zoho / print / workers chips, no "report a problem", no
 * plan search: those are simply not here — and every piece of data it shows came from the server's allowlist
 * (lib/sharedView.js). Nothing in this folder may import the store or Firebase.
 */
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { X, Play, ChevronLeft, ChevronRight, Camera, Building2, Link, AlertTriangle, BookOpen, RefreshCw, FileText, Loader2 } from 'lucide-react';
import type { MainUiStrings, Stage, BoardSetting, ContractorPhoto } from '../types';
import { StageSection, type StagePhotoItem } from '../components/apartment/StageSection';
import { drawerSizes, drawerPanelClass, drawerPanelStyle, drawerTabClass, DrawerTitleChips, DetailLabel } from '../components/apartment/drawerParts';
import { useViewState } from '../data/viewState';
import { useMedia } from '../data/usePhone';
import { buildingShort, realName } from '../data/aptSale';
import { rowNumOf } from '../data/floorRows';
import { mediaKindOf } from '../data/mediaKind';
import { acCompanyOf, isCompanyButton, isInspectedButton } from '../data/aptCrew';
import type { SharedApi, SharedApartment, ViewerPin, DrivePhoto } from './sharedApi';
import type { PlanWords } from './SharedPlanViewer';

const SharedPlanViewer = lazy(() => import('./SharedPlanViewer'));

/** The office's tabs, in the office's order, less the ones that are not shared (tasks, notes, history). */
type Tab = 'details' | 'plan' | 'photos';
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
  const isPhone = useMedia('(max-width: 767px)');
  // Below 800px the window gets a Plan tab; above it the plan lives beside the fields — the office's own line.
  const planWide = useMedia('(min-width: 800px)');
  const [tab, setTab] = useState<Tab>('details');
  const [planWanted, setPlanWanted] = useState(true);
  const [planRatio, setPlanRatio] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{ items: Media[]; index: number } | null>(null);
  const [, setResized] = useState(0);
  const bornAt = useRef(Date.now());
  const sorted = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);
  const photos = useViewState(st => st.contractorPhotos);
  const loadPhotosFor = useViewState(st => st.loadPhotosFor);
  useEffect(() => { loadPhotosFor?.(apartment.id); }, [loadPhotosFor, apartment.id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !lightbox && !document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, lightbox]);
  useEffect(() => {
    const f = () => setResized(n => n + 1);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  useEffect(() => { setPlanRatio(null); }, [apartment.planRef]);
  useEffect(() => { if (planWide) setTab(t => (t === 'plan' ? 'details' : t)); }, [planWide]);

  const partner = apartment.mergedWith ? apartments.find(a => a.id === apartment.mergedWith) : undefined;
  const number = partner
    ? [apartment.apartmentNumber, partner.apartmentNumber].filter(Boolean).sort((a, b) => (Number(a) || 0) - (Number(b) || 0)).join('/')
    : apartment.apartmentNumber;
  const family = realName(apartment);
  const label = `${ui.aptPrefix} ${number}${family ? ` — ${family}` : ''}`;
  const myPins = pins.filter(p => p.apartmentId === apartment.id && p.planRef === apartment.planRef);
  // The plan pane is ALWAYS there on a wide screen — with or without a plan (owner, 2026-11-19: "the plan window should
  // always be visible … if we didn't approve a plan yet, it should say in the middle, just in small, no approved plan yet").
  const planSideOn = planWide;
  const size = drawerSizes(window.innerWidth, window.innerHeight, planRatio ?? Math.SQRT2);

  const planWords: PlanWords = {
    layers: W('Layers', 'שכבות'), allOn: W('All on', 'הכול'), allOff: W('All off', 'כלום'), fullScreen: W('Full screen', 'מסך מלא'),
    exitFullScreen: W('Exit full screen', 'יציאה ממסך מלא'), print: W('Print', 'הדפסה'), download: W('Download', 'הורדה'),
    share: ui.planShare || W('Share', 'שיתוף'), addPin: W('Pin', 'סיכה'), tapPlan: W('Click the plan', 'לגעת בתוכנית'),
    pinPlaceholder: W('What is here?', 'מה יש כאן?'), save: W('Save', 'שמירה'), cancel: W('Cancel', 'ביטול'),
    remove: W('Remove', 'הסרה'), reallyRemove: W('Remove?', 'להסיר?'), loading: W('Loading the plan…', 'טוען את התוכנית…'),
    failed: W('The plan could not be opened.', 'לא ניתן לפתוח את התוכנית.'), page: W('Page', 'עמוד'), fit: W('Fit to page', 'התאמה לעמוד'),
    shareFallback: W('Sharing isn\'t available here — the plan was downloaded instead.', 'שיתוף לא זמין כאן — התוכנית הורדה.'),
    pinFailed: W('That did not save — try again.', 'לא נשמר — נסו שוב.'), noLayers: W('This plan has no layers.', 'אין שכבות בתוכנית הזו.'),
    yourPins: W('pins', 'סיכות'), hide: W('Hide the plan', 'הסתרת התוכנית'),
  };

  const planPane = (variant: 'side' | 'tab') => {
    const asTab = variant === 'tab';
    if (!apartment.planRef) {
      return (
        <div data-plan-pane={variant} data-no-plan className={`flex items-center justify-center p-6 text-center ${asTab ? 'h-full' : 'border-l border-gray-200'}`}
          style={asTab ? { backgroundColor: '#f8fafc' } : { flex: '1 1 54%', minWidth: 0, backgroundColor: '#f8fafc' }}>
          <p className="text-[12px] text-gray-400">{W('No approved plan yet', 'אין עדיין תוכנית מאושרת')}</p>
        </div>
      );
    }
    return (
      <div data-plan-pane={variant} className={`relative flex flex-col min-h-0 ${asTab ? 'h-full' : 'border-l border-gray-200'}`}
        style={asTab ? { backgroundColor: '#f8fafc' } : { flex: '1 1 54%', minWidth: 0, backgroundColor: '#f8fafc' }}>
        <Suspense fallback={
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">{ui.engineeringPlans}…</div>
        }>
          <SharedPlanViewer api={api} planRef={apartment.planRef} apartmentId={apartment.id}
            heading={ui.engineeringPlans || W('Plan', 'תוכנית')} label={label}
            pins={myPins} rtl={rtl} words={planWords}
            onAspect={r => setPlanRatio(r)}
            onPinsChange={next => onPinsChange([...pins.filter(p => !(p.apartmentId === apartment.id && p.planRef === apartment.planRef)), ...next])} />
        </Suspense>
      </div>
    );
  };

  const tabs: Tab[] = planWide ? ['details', 'photos'] : ['details', 'plan', 'photos'];
  const tabName = (t: Tab) => t === 'plan' ? (rtl ? 'תוכנית' : 'Plan') : t === 'photos' ? ui.tabPhotos : ui.tabDetails;
  // The tap that OPENED this window is not aimed at it (the office's settle rule).
  const settle = (e: React.SyntheticEvent) => { if (Date.now() - bornAt.current < 400) { e.preventDefault(); e.stopPropagation(); } };

  return (
    // Always left-to-right: Hebrew changes the WORDS, never the layout (the office's design language).
    <div dir="ltr" data-shared-window-root>
      <div className="drawer-overlay fixed inset-0 bg-black/50 z-[110]" onClick={onClose} />
      <div role="dialog" aria-label={label} data-shared-window
        className={drawerPanelClass(isPhone)} style={drawerPanelStyle(isPhone, planSideOn, size)}
        onMouseDownCapture={settle} onClickCapture={settle}>
        {/* The office's title: building · floor · apt · type, the name, and the close button in the corner. */}
        <div className="flex items-start justify-between gap-2 px-4 py-3 bg-[#1e3a5f] text-white flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            <Building2 size={16} className="text-[#4aa8d8] flex-shrink-0" />
            <DrawerTitleChips buildingId={apartment.buildingId} floor={apartment.floor}
              apartmentNumber={apartment.apartmentNumber} tipus={apartment.tipus} ui={ui} />
            {partner && (
              <span className="text-white/60 text-xs flex-shrink-0">
                · {ui.linkedToApt} {ui.aptPrefix} {partner.displayName || partner.apartmentNumber}
              </span>
            )}
            <span data-drawer-name className="font-bold text-[15px] truncate min-w-0 ml-1">{family || ui.notSoldWord}</span>
          </div>
          <button type="button" onClick={onClose} aria-label={W('Close', 'סגירה')} title={W('Close', 'סגירה')}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="flex flex-col min-h-0 min-w-0" style={{ flex: planSideOn ? `0 0 ${size.fieldsW}px` : '1 1 100%' }}>
            <div className="flex border-b border-gray-200 flex-shrink-0 overflow-x-auto">
              {tabs.map(t => (
                <button key={t} type="button" data-shared-tab={t} onClick={() => setTab(t)} className={drawerTabClass(tab === t, isPhone)}>
                  {tabName(t)}
                </button>
              ))}
            </div>
            <div className={`flex-1 scrollbar-thin ${tab === 'plan' ? 'overflow-hidden' : `overflow-y-auto ${isPhone ? 'p-2.5' : 'p-4'}`}`}>
              {tab === 'plan' && planPane('tab')}
              {tab === 'details' && (
                <Details apartment={apartment} number={number} family={family} merged={!!partner} board={board}
                  stages={sorted} photos={photos} ui={ui} isPhone={isPhone}
                  onOpenPhotos={(items, index) => setLightbox({ items: items.map(i => ({ ref: i.fileId, mimeType: i.mimeType })).filter(i => i.ref), index })} />
              )}
              {tab === 'photos' && <PhotosTab apartment={apartment} api={api} photos={photos} stages={sorted} ui={ui} W={W}
                onOpen={(items, index) => setLightbox({ items, index })} />}
            </div>
          </div>
          {planSideOn && planPane('side')}
        </div>

      </div>
      {lightbox && <Lightbox api={api} {...lightbox} onIndex={i => setLightbox({ ...lightbox, index: i })} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/** A field's value, drawn in the office field's own box — shown, not editable. */
const boxCls = 'border border-gray-200 rounded-lg px-2 py-2 text-sm font-bold bg-white text-gray-900';

function AnswerRow({ name, ans, ui }: { name: string; ans: string | undefined; ui: MainUiStrings }) {
  return (
    <div data-custom-button className="flex items-center gap-3 justify-between">
      <span className="text-sm text-gray-800 min-w-0 truncate">{name}</span>
      <span className="inline-flex border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
        {(['yes', 'no', 'unknown'] as const).map(v => (
          <span key={v} data-custom-answer={v} aria-pressed={ans === v}
            className={`px-3 py-1.5 text-xs font-semibold border-s border-gray-200 first:border-s-0 ${ans === v ? 'bg-[#1e3a5f] text-white' : 'bg-white text-gray-600'}`}>
            {v === 'yes' ? ui.customYes : v === 'no' ? ui.customNo : ui.customUnknown}
          </span>
        ))}
      </span>
    </div>
  );
}

function Details({ apartment, number, family, merged, board, stages, photos, ui, isPhone, onOpenPhotos }: {
  apartment: SharedApartment; number: string; family: string; merged: boolean; board: BoardSetting; stages: Stage[];
  photos: ContractorPhoto[]; ui: MainUiStrings; isPhone: boolean; onOpenPhotos: (items: StagePhotoItem[], index: number) => void;
}) {
  const customButtons = board.customButtons ?? [];
  // Wolfson shows its buttons under the first row (less the AC-company and "inspected" ones the office hides there);
  // every other project shows them all, below the stages — the office's own two places.
  const isWolfson = useViewState(st => st.currentProjectId) === 'wolfson';
  const shownButtons = customButtons.filter(cb => !isCompanyButton(cb) && !isInspectedButton(cb));
  const buttons = (list: typeof customButtons) => list.length > 0 && (
    <div data-custom-buttons className="space-y-1.5">
      <div className="text-sm font-bold text-gray-800">{ui.customButtonsTitle}</div>
      {list.map(cb => <AnswerRow key={cb.id} name={cb.name} ans={apartment.customAnswers?.[cb.id]} ui={ui} />)}
    </div>
  );
  const shinui = apartment.classification === 'shinui';
  return (
    <div className={isPhone ? 'space-y-2.5' : 'space-y-4'} data-shared-details>
      <div className="flex flex-wrap items-start gap-2" data-details-row1>
        <div className="flex-shrink-0">
          <DetailLabel>{ui.buildingWord}</DetailLabel>
          <div data-detail-building className="min-w-[3rem] border border-gray-100 bg-gray-50 rounded-lg px-2.5 py-2 text-sm font-bold text-gray-700 text-center">{buildingShort(apartment.buildingId)}</div>
        </div>
        <div className="flex-shrink-0">
          <DetailLabel>{ui.floorPrefix}</DetailLabel>
          <div data-detail-floor className="min-w-[3rem] border border-gray-100 bg-gray-50 rounded-lg px-2.5 py-2 text-sm font-bold text-gray-700 text-center">{rowNumOf(apartment.buildingId, apartment.floor) || apartment.floor}</div>
        </div>
        <div className="flex-shrink-0">
          <DetailLabel>{ui.tipusLabel}</DetailLabel>
          <div data-detail-tipus className={`${boxCls} min-w-[3rem] ${apartment.tipus ? '' : '!font-normal !text-gray-400'}`}>{apartment.tipus || ui.tipusNone}</div>
        </div>
        <div className="flex-shrink-0">
          <DetailLabel>{ui.isRtl ? 'קבלן' : 'Contractor'}</DetailLabel>
          <div data-detail-crew className={`${boxCls} w-36 truncate ${apartment.crew ? '' : '!text-gray-400'}`}>{apartment.crew || '—'}</div>
        </div>
        <div className="flex-shrink-0">
          <DetailLabel>{ui.isRtl ? 'חברת מיזוג' : 'AC company'}</DetailLabel>
          <div data-detail-ac className={`${boxCls} min-w-[3rem]`}>{acCompanyOf(apartment, customButtons) || '—'}</div>
        </div>
        <div className="flex-shrink-0">
          <DetailLabel>{ui.aptPrefix} #</DetailLabel>
          {merged ? (
            <div className="flex items-center justify-center gap-1 border rounded-lg px-2 py-2 text-sm font-bold text-center border-blue-300 bg-blue-50 text-blue-700 min-w-[4.5rem]">
              <Link size={12} className="flex-shrink-0 text-blue-500" />
              <span>{number}</span>
            </div>
          ) : (
            <div data-detail-aptno className={`${boxCls} w-16 text-center`}>{number || '—'}</div>
          )}
        </div>
        <div className="flex-1 min-w-[150px] max-w-[55%]">
          <DetailLabel>{ui.familyName}</DetailLabel>
          <div data-family-name className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm truncate ${family ? 'text-gray-900' : 'text-gray-400'}`}>
            {family || ui.notSoldWord}
          </div>
        </div>
        <div data-details-row2 className="flex-shrink-0 self-end">
          <div className="flex gap-1">
            <span data-class-standard aria-pressed={!shinui} className={`px-2.5 py-2 rounded-lg text-xs font-medium border ${
              !shinui ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-500 border-gray-200'}`}>
              {ui.standard}
            </span>
            <span data-class-upgraded aria-pressed={shinui} className={`px-2 py-2 rounded-lg text-xs font-medium border flex items-center gap-0.5 ${
              shinui ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200'}`}>
              <AlertTriangle size={10} /> {ui.upgradedWord}
            </span>
          </div>
        </div>
      </div>

      {isWolfson && buttons(shownButtons)}

      {/* The stages — always open, every one of them, in their read-only form. */}
      <StageSection readOnly apartment={apartment} stages={stages} tasks={[]} workers={[]} photos={photos}
        ctx={{ tipusStages: board.tipusStages }} ui={ui} onOpenPhotos={onOpenPhotos} />

      {!isWolfson && buttons(customButtons)}
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

  // The office's photo tab: grey upper-case section titles over a three-across grid of square tiles.
  if (drive === null && !groups.length) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <RefreshCw size={18} className="animate-spin mr-2" /> {ui.loadingPhotos}
      </div>
    );
  }
  if (!groups.length) {
    return (
      <div className="flex flex-col items-center py-16 text-center px-4">
        <Camera size={32} className="text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">{ui.noPhotosYet}</p>
      </div>
    );
  }
  return (
    <div className="space-y-5" data-shared-photos>
      {drive === null && <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 size={12} className="animate-spin" /> {W('Loading more…', 'טוען עוד…')}</div>}
      {groups.map(g => (
        <div key={g.name} data-photo-section={g.name}>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">{g.name}</h4>
          <div className="grid grid-cols-3 gap-1.5">
            {g.items.map((m, i) => <Tile key={m.ref} api={api} m={m} onClick={() => onOpen(g.items, i)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tile({ api, m, onClick }: { api: SharedApi; m: Media; onClick: () => void }) {
  const [broken, setBroken] = useState(false);
  const kind = mediaKindOf('', m.mimeType);
  const thumb = !broken && <img src={api.fileUrl(m.ref, 400)} alt="" loading="lazy" onError={() => setBroken(true)}
    className={`w-full h-full object-cover ${kind === 'video' ? 'opacity-90' : ''}`} />;
  return (
    <button type="button" data-photo-tile={m.ref} onClick={onClick}
      className="aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer relative block w-full">
      {kind === 'video' ? (
        <div className="w-full h-full relative bg-gray-900">
          {thumb}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-9 h-9 rounded-full flex items-center justify-center text-white"
              style={{ backgroundColor: 'rgba(30,58,95,.85)', border: '2px solid rgba(255,255,255,.85)' }}>
              <Play size={16} fill="currentColor" className="ms-0.5" />
            </span>
          </div>
        </div>
      ) : kind === 'image' && !broken ? thumb : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-blue-50 px-1">
          {kind === 'image' ? <Camera size={18} className="text-blue-400" /> : <FileText size={18} className="text-blue-400" />}
        </div>
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
