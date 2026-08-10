import React, { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore, loadAllProjectsTaskData } from '../data/store';
import { Apartment, CanvasElement, isCountableApartment, BIN_META, getStageName } from '../types';
import { DriveIcon, ZohoIcon, PlanIcon } from '../components/ui/BrandIcons';
import { getBoardTheme } from '../data/boardThemes';
import { BuildingDiagram } from '../components/diagram/BuildingDiagram';
import { CountdownNode, StopwatchNode, ClipArtNode, StrokeLayer } from '../components/board/BoardNodes';
import { renderWidget } from '../data/widgets';
import { WidgetStore } from '../components/board/WidgetStore';
import { extractFileId } from '../data/driveApi';
import { PenLine, Maximize, Minimize, Pencil, X as CloseIcon, Plus } from 'lucide-react';

/**
 * Lazy, like everywhere else — the wallboard is the last place that should
 * download a megabyte of PDF engine before it can show a board.
 */
const PlanAnnotator = lazy(() =>
  import('../components/plans/PlanAnnotator').then(m => ({ default: m.PlanAnnotator })));

/**
 * The office wall display.
 *
 * Its own link, opened on the TV and put full-screen. Three rules govern it:
 *
 *  1. It is THE BOARD, in light theme, not a re-imagining of it — same nodes,
 *     same colours, same positions.
 *  2. It is ALWAYS READ-ONLY. Not a setting, not a PIN. It can look, switch
 *     project and open a job; it can never change anything. Every edit happens
 *     from a PC on the normal app link. That removes the entire class of "a
 *     stray palm on the touchscreen moved a job and nobody knows".
 *  3. Anything Esther marks hidden never appears here.
 */
export function TvPresentationPage() {
  const [params, setParams] = useSearchParams();
  const {
    projects, apartments, stages, contractorAssignments, contractorPhotos, canvasElements,
    boardSettings, currentProjectId, setCurrentProject, startFirebaseSync, firebaseListening,
    users, contractors, addCanvasElement, updateCanvasElement,
  } = useStore();

  /**
   * The TV subscribes to the same real-time listeners as the app.
   *
   * It sits outside AppLayout, which is what normally starts them, so without
   * this the panel would show whatever happened to be in that browser's
   * localStorage — which on a fresh TV browser is nothing at all.
   */
  useEffect(() => {
    if (!firebaseListening) startFirebaseSync();
  }, [firebaseListening, startFirebaseSync]);

  const view = params.get('view') ?? currentProjectId;
  const setView = (v: string) => {
    const p = new URLSearchParams(params);
    p.set('view', v);
    setParams(p, { replace: true });
  };

  /**
   * Switching the visible project has to switch the loaded workspace too — each
   * project's records live in their own collections. This writes only to the
   * TV's own browser; it changes nothing anyone else sees, so the panel stays
   * strictly read-only in the sense that matters.
   */
  useEffect(() => {
    if (view !== 'dashboard' && view !== currentProjectId && projects.some(p => p.id === view)) {
      setCurrentProject(view);
    }
  }, [view, currentProjectId, projects, setCurrentProject]);

  // ── Language ──
  // Default comes from TV settings; the toggle on the panel overrides it for
  // this screen only and rides in the URL, so a bookmark keeps the choice.
  const tvSettings = boardSettings.__tv ?? {};
  const lang = (params.get('lang') as 'en' | 'he' | null) ?? tvSettings.tvLang ?? 'en';
  const isRtl = lang === 'he';
  const setLang = (l: 'en' | 'he') => {
    const p = new URLSearchParams(params);
    p.set('lang', l);
    setParams(p, { replace: true });
  };
  const t = (en: string, he: string) => (isRtl ? he : en);

  const [openJob, setOpenJob] = useState<Apartment | null>(null);
  const [now, setNow] = useState(new Date());
  const frameRef = useRef<HTMLDivElement>(null);

  /**
   * Automatic display scale.
   *
   * A 4K panel has four times the pixels of a 1080p one, so rendering "normally"
   * makes everything physically tiny at viewing distance. The board is laid out
   * at a fixed design width and scaled to the real viewport, so it fills any
   * screen at a readable size with no configuration. `?scale=` overrides it.
   */
  const DESIGN_W = 1600;
  const [autoScale, setAutoScale] = useState(1);

  useEffect(() => {
    const measure = () => {
      const w = frameRef.current?.clientWidth ?? window.innerWidth;
      // Never below 1: on a small screen we want the real layout, not a shrunk one.
      setAutoScale(Math.max(1, w / DESIGN_W));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /**
   * The slider is a MULTIPLIER on the automatic scale, not a replacement for it.
   *
   * That is what makes one setting work on every panel: nudging it to 1.2 means
   * "a fifth bigger than this screen's natural size", which reads the same way
   * on a 1080p office TV and a 4K one. A raw pixel number would have to be
   * re-tuned for each screen.
   */
  const boostParam = Number(params.get('scale'));
  const boost = Number.isFinite(boostParam) && boostParam > 0
    ? boostParam
    : (tvSettings.tvScale ?? 1);
  const scale = autoScale * boost;
  const setBoost = (b: number) => {
    const p = new URLSearchParams(params);
    p.set('scale', String(Number(b.toFixed(2))));
    setParams(p, { replace: true });
  };
  /** The wallboard's single writable action: marking up a plan. */
  const [markUp, setMarkUp] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  /**
   * What appears on the wall.
   *
   * Everything is visible by default; only what Esther has explicitly switched
   * off is filtered out here. Binned jobs are off the board by definition.
   */
  const jobs = useMemo(
    () => apartments.filter(a =>
      (view === 'general' ? a.buildingId === 'G' : a.buildingId !== 'G')
      && !a.isUnnamed && !a.boardBin && a.showOnTv !== false),
    [apartments, view],
  );

  /**
   * Which board the wall is showing.
   *
   * Chosen once, in app settings, by whoever runs the place — not on the TV,
   * which has no keyboard and is read-only by design. Empty means the
   * workspace's main board, which is what it has always shown.
   *
   * The region and the scale follow from this, because they are measured
   * against whatever is on the chosen board: pick a different board and the
   * saved rectangle is describing somewhere else.
   */
  const tvBoard = tvSettings.tvBoard ?? '';

  const tvElements = useMemo(
    () => canvasElements.filter(el => (el.board ?? '') === tvBoard && el.showOnTv !== false),
    [canvasElements, tvBoard],
  );

  /**
   * Arranging the wallboard, from the wallboard.
   *
   * The panel is read-only by design and that does not change: nothing here
   * touches a job, a stage, a task or a plan. What the pen unlocks is the
   * WALLBOARD'S OWN FURNITURE — adding a widget, moving one, resizing one — so
   * whoever is standing at the screen can lay out the wall without walking back
   * to a PC and guessing at what a 4K panel ten feet away looks like.
   *
   * It is never sticky. It lives in component state, not in the URL and not in
   * settings, so the panel is back to read-only the moment the page reloads —
   * which is the behaviour you want on a screen nobody logs out of.
   */
  const [editing, setEditing] = useState(false);
  /** Which stages the building diagram is narrowed to. Empty = all of them. */
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  /** A group opened by tapping it — read-only, like everything else here. */
  const [openBin, setOpenBin] = useState<CanvasElement | null>(null);
  /** Which site photo the carousel is showing. Resets whenever a job opens. */
  const [photoAt, setPhotoAt] = useState(0);
  const [tvStoreOpen, setTvStoreOpen] = useState(false);
  const [dragEl, setDragEl] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [sizeEl, setSizeEl] = useState<{ id: string; w: number; h: number; x: number; y: number } | null>(null);

  /**
   * Full screen, and a way back out that a finger can find.
   *
   * A wall panel has no Escape key and no browser chrome worth having — the
   * address bar and tabs eat the top of a board that is being read from ten
   * feet away. So there is a button to go full screen and, once there, a small
   * X in the corner, because the browser's own way out is a keyboard shortcut
   * nobody standing at the wall can reach.
   */
  const [full, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  /**
   * Moving and resizing on the wall.
   *
   * Coordinates come back through the board's scale, exactly as they must on
   * the job board: the surface is drawn inside a `transform: scale()`, so a
   * pointer moves `dx` on the glass but only `dx / scale` in board coordinates.
   * Using the raw delta would move a widget at the wrong speed on every panel
   * except one showing at exactly 100%.
   */
  function startElDrag(e: React.PointerEvent, el: CanvasElement) {
    if (!editing) return;
    if ((e.target as HTMLElement).dataset.tvResize) return;      // the corner
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const startX = e.clientX, startY = e.clientY;
    const from = { x: el.x, y: el.y };
    const move = (ev: PointerEvent) => {
      setDragEl({
        id: el.id,
        dx: Math.max(0, from.x + (ev.clientX - startX) / boardScale),
        dy: Math.max(0, from.y + (ev.clientY - startY) / boardScale),
      });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const x = Math.max(0, Math.round(from.x + (ev.clientX - startX) / boardScale));
      const y = Math.max(0, Math.round(from.y + (ev.clientY - startY) / boardScale));
      setDragEl(null);
      if (x !== el.x || y !== el.y) updateCanvasElement(el.id, { x, y });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startElResize(e: React.PointerEvent, el: CanvasElement) {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const from = { w: el.w, h: el.h };
    const at = (ev: PointerEvent) => ({
      w: Math.max(60, Math.round(from.w + (ev.clientX - startX) / boardScale)),
      h: Math.max(40, Math.round(from.h + (ev.clientY - startY) / boardScale)),
    });
    const move = (ev: PointerEvent) => setSizeEl({ id: el.id, x: el.x, y: el.y, ...at(ev) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const next = at(ev);
      setSizeEl(null);
      if (next.w !== el.w || next.h !== el.h) updateCanvasElement(el.id, next);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const theme = getBoardTheme(boardSettings[currentProjectId]?.themeId);

  const stageOf = (a: Apartment) => stages.find(s => s.id === a.currentStageId) ?? null;
  const pending = (a: Apartment) =>
    contractorAssignments.filter(x => x.apartmentId === a.id && !x.completedAt).length;

  const allProjects = useMemo(() => loadAllProjectsTaskData(), []);
  const overdue = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return allProjects.reduce((n, d) =>
      n + d.assignments.filter(a => !a.completedAt && a.dueDate && a.dueDate < today).length, 0);
  }, [allProjects]);

  /**
   * The wall's top bar.
   *
   * Laid out for a room rather than for a desk: the views you switch between
   * are on the LEFT where a hand reaches first, the company's mark is large in
   * the MIDDLE where a room reads it, and the controls that get used once a
   * week sit on the right. Every control is a touch target, not a hover.
   */
  const barBtn = 'flex items-center gap-2 rounded-full font-bold transition-colors';
  const off = { backgroundColor: 'rgba(255,255,255,.12)', color: '#cbd5e1' };
  const on = { backgroundColor: '#fff', color: '#1e3a5f' };

  /**
   * The way out of full screen, for a finger.
   *
   * Deliberately small and in the corner: it must be findable when somebody
   * needs it and invisible the rest of the time, on a screen that spends its
   * life being looked at rather than used.
   */
  const exitFull = full ? (
    <button
      onClick={toggleFull}
      title={t('Leave full screen', 'יציאה ממסך מלא')}
      className="fixed top-2 right-2 z-[200] w-11 h-11 rounded-full flex items-center justify-center
                 text-white/70 hover:text-white transition-colors"
      style={{ backgroundColor: 'rgba(15,23,42,.35)' }}
    >
      <CloseIcon size={20} />
    </button>
  ) : null;

  const bar = (
    <div className="relative flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white flex-shrink-0"
      style={{ fontSize: 15 * Math.min(scale, 1.6) }}>

      {/* Views, on the left. */}
      {projects.map(p => (
        <button key={p.id} onClick={() => { setView(p.id); setOpenJob(null); }}
          className={`${barBtn} px-3 py-1.5`}
          style={view === p.id ? on : off}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.shortName}
        </button>
      ))}
      <button onClick={() => { setView('dashboard'); setOpenJob(null); }}
        className={`${barBtn} px-3 py-1.5`}
        style={view === 'dashboard' ? on : off}>
        {t('Dashboard', 'לוח בקרה')}
      </button>

      <span className="w-px h-6 mx-1" style={{ backgroundColor: 'rgba(255,255,255,.18)' }} />

      {/* Full screen, and the way back out — beside the views, as asked. */}
      <button onClick={toggleFull} title={t('Full screen', 'מסך מלא')}
        className={`${barBtn} px-3 py-1.5`} style={off}>
        {full ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>

      {/* Zoom, as a minus and a plus. The percentage between them is the
          automatic figure with your nudge applied, and tapping it resets. */}
      <div className="flex items-center rounded-full overflow-hidden" style={off}>
        <button onClick={() => setBoost(Math.max(0.6, Math.round((boost - 0.1) * 100) / 100))}
          title={t('Smaller', 'קטן')} className="px-3 py-1.5 font-black">−</button>
        <button onClick={() => setBoost(1)} title={t('Automatic', 'אוטומטי')}
          className="px-2 py-1.5 font-bold tabular-nums" style={{ fontSize: '.85em' }}>
          {Math.round(boost * 100)}%
        </button>
        <button onClick={() => setBoost(Math.min(2.5, Math.round((boost + 0.1) * 100) / 100))}
          title={t('Bigger', 'גדול')} className="px-3 py-1.5 font-black">+</button>
      </div>

      {/* Edit mode. Off by default and never sticky — see the note on `editing`. */}
      <button onClick={() => setEditing(v => !v)}
        title={t('Arrange the wallboard', 'סידור לוח הקיר')}
        className={`${barBtn} px-3 py-1.5`}
        style={editing ? { backgroundColor: '#f59e0b', color: '#fff' } : off}>
        <Pencil size={16} />
      </button>

      {/* The company mark, large, in the middle of the room's eyeline.
          On a white plate: the logo is drawn for a light background and on the
          navy bar it came out washed out and unreadable from any distance. */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center pointer-events-none">
        <span className="rounded-xl px-4 py-1.5 flex items-center"
          style={{ backgroundColor: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,.18)' }}>
          <img src="/tzviair-logo.png" alt="TzviAir"
            style={{ height: 46 * Math.min(scale, 1.8) }}
            className="object-contain" />
        </span>
      </div>

      <span className="flex-1" />

      {overdue > 0 && (
        <span className="px-3 py-1.5 rounded-full font-bold"
          style={{ backgroundColor: 'rgba(239,68,68,.22)', color: '#fca5a5' }}>
          {overdue} {t('overdue', 'באיחור')}
        </span>
      )}

      {/* Language — the default lives in TV settings, this switches the panel. */}
      <div className="flex items-center rounded-full overflow-hidden" style={off}>
        {(['en', 'he'] as const).map(l => (
          <button key={l} onClick={() => setLang(l)}
            className="px-3 py-1.5 font-bold transition-colors"
            style={lang === l ? on : { color: '#cbd5e1' }}>
            {l === 'en' ? 'EN' : 'עב'}
          </button>
        ))}
      </div>

      <span className="font-bold tabular-nums">
        {now.toLocaleDateString(isRtl ? 'he-IL' : undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {now.toLocaleTimeString(isRtl ? 'he-IL' : undefined, { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
  // ── Job detail ──
  if (openJob) {
    const planId = openJob.plansPdfLink ? extractFileId(openJob.plansPdfLink) : null;
    const st = stageOf(openJob);
    // The carousel shows one at a time, so there is no reason to stop at four
    // any more — it used to be capped to fill a 2x2 grid of thumbnails.
    const photos = contractorPhotos
      .filter(p => contractorAssignments.some(a => a.id === p.assignmentId && a.apartmentId === openJob.id))
      .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''));
    return (
      <div ref={frameRef} dir={isRtl ? 'rtl' : 'ltr'} className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
        {bar}
        {markUp && planId && (
          <Suspense fallback={null}>
            <PlanAnnotator
              planFileId={planId}
              planName={t('Engineering plan', 'תוכנית הנדסית')}
              apartmentId={openJob.id}
              apartmentLabel={openJob.displayName || openJob.apartmentNumber || 'Job'}
              driveFolderUrl={openJob.driveLink}
              authorName=""
              askWho
              people={users.filter(u => u.active !== false).map(u => u.name)}
              onClose={() => setMarkUp(false)}
            />
          </Suspense>
        )}
        {/**
          * The job, on the wall.
          *
          * The plan is the reason anybody opened this, so it gets the room: the
          * left two-thirds, full height, drawn by pdf.js onto white and fitted
          * to the space. It used to be a Drive preview iframe, which frames
          * every sheet in a black surround it cannot be told to drop — on an A3
          * landscape sheet in a portrait-ish box that black was most of the
          * panel.
          *
          * What is left is a photo, ONE at a time and as large as it will go,
          * with a way into the folder; four thumbnails on a screen read from
          * ten feet away are four smudges. Everything else — the name, the
          * stage, the links, the outstanding work — is a section of its own
          * underneath, rather than being scattered across three cards.
          */}
        <div className="flex-1 grid gap-3 p-3 min-h-0"
          style={{ gridTemplateColumns: '1.9fr 1fr', fontSize: 15 * Math.min(scale, 1.6) }}>

          <div className="relative bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col min-h-0">
            <div className="px-3 py-2 font-extrabold border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
              <PlanIcon size={16} /> {t('Engineering plan', 'תוכנית הנדסית')}
              {planId && (
                <>
                  {/*
                    The one thing the wallboard is allowed to change.
                    Everything else here stays read-only on purpose — but the
                    screen is in the middle of the office and marking a plan up
                    on it is the reason anybody walks over to it. It asks who is
                    drawing first, so the version carries a real name rather than
                    "the office". Saving is automatic, and it warns you if you
                    walk away before Drive has it.
                  */}
                  <button
                    onClick={() => setMarkUp(true)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold text-white"
                    style={{ backgroundColor: '#4aa8d8' }}>
                    <PenLine size={14} /> {t('Mark up', 'סימון')}
                  </button>
                  <a href={openJob.plansPdfLink} target="_blank" rel="noopener noreferrer"
                    className="text-[#4aa8d8] font-bold">{t('open in Drive', 'פתח בדרייב')} ↗</a>
                </>
              )}
            </div>
            <div className="flex-1 min-h-0 relative bg-white">
              {planId ? (
                <Suspense fallback={
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                    {t('Opening the plan…', 'פותח את התוכנית…')}
                  </div>
                }>
                  <PlanAnnotator
                    embedded
                    readOnly
                    planFileId={planId}
                    planName={t('Engineering plan', 'תוכנית הנדסית')}
                    apartmentId={openJob.id}
                    apartmentLabel={openJob.displayName || openJob.apartmentNumber || 'Job'}
                    driveFolderUrl={openJob.driveLink}
                    authorName=""
                    onClose={() => { /* it is part of the page here */ }}
                  />
                </Suspense>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  {t('No plan linked', 'לא צורפה תוכנית')}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 min-h-0">
            {/* One photo, large, with the folder a tap away. */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col"
              style={{ flex: '1.5 1 0%', minHeight: 0 }}>
              <div className="px-3 py-2 font-extrabold border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
                {t('From site', 'מהאתר')}
                {photos.length > 1 && (
                  <span className="text-gray-400 tabular-nums" style={{ fontSize: '.8em' }}>
                    {Math.min(photoAt + 1, photos.length)} / {photos.length}
                  </span>
                )}
                {openJob.driveLink && (
                  <a href={openJob.driveLink} target="_blank" rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1.5 font-bold text-[#4aa8d8]">
                    <DriveIcon size={15} /> {t('Folder', 'תיקייה')} ↗
                  </a>
                )}
              </div>
              {/* Dark only when there is a photo to sit on it — a photo needs
                  a dark surround to read, an empty panel does not, and a slab
                  of black is the loudest thing in a room. */}
              <div className={`flex-1 min-h-0 relative ${photos.length ? 'bg-slate-900' : 'bg-slate-50'}`}>
                {photos.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                    {t('No photos yet', 'אין עדיין תמונות')}
                  </div>
                ) : (
                  <>
                    {(() => {
                      const p = photos[Math.min(photoAt, photos.length - 1)];
                      const src = p?.storageUrl || p?.driveUrl || p?.dataUrl;
                      return src
                        ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-contain" />
                        : <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                            {t('This one is only in Drive', 'זו נמצאת רק בדרייב')}
                          </div>;
                    })()}
                    {photos.length > 1 && (
                      <>
                        <button
                          onClick={() => setPhotoAt(i => (i - 1 + photos.length) % photos.length)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full
                                     flex items-center justify-center text-white font-black"
                          style={{ backgroundColor: 'rgba(15,23,42,.5)', fontSize: '1.3em' }}>‹</button>
                        <button
                          onClick={() => setPhotoAt(i => (i + 1) % photos.length)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full
                                     flex items-center justify-center text-white font-black"
                          style={{ backgroundColor: 'rgba(15,23,42,.5)', fontSize: '1.3em' }}>›</button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Everything else, in one place. */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-y-auto"
              style={{ flex: '1 1 0%', minHeight: 0 }}>
              <div className="font-black leading-tight" style={{ fontSize: '1.7em' }}>
                {openJob.displayName || t('Job', 'עבודה')}
              </div>
              {openJob.address && <div className="text-gray-500 mt-1">{openJob.address}</div>}

              <div className="flex flex-wrap gap-2 mt-3">
                {st && (
                  <span className="font-bold px-3 py-1 rounded-full"
                    style={{ backgroundColor: `${st.color}22`, color: st.color }}>
                    {getStageName(st, isRtl)}
                  </span>
                )}
                {pending(openJob) > 0 && (
                  <span className="font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700">
                    {pending(openJob)} {t('open', 'פתוחות')}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {openJob.driveLink && (
                  <a href={openJob.driveLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200">
                    <DriveIcon size={17} /> Drive
                  </a>
                )}
                {openJob.zohoLink && (
                  <a href={openJob.zohoLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200">
                    <ZohoIcon size={17} /> Zoho
                  </a>
                )}
              </div>

              {/* What is actually outstanding on it. */}
              {(() => {
                const open = contractorAssignments
                  .filter(a => a.apartmentId === openJob.id && !a.completedAt)
                  .slice(0, 5);
                if (!open.length) return null;
                return (
                  <div className="mt-4">
                    <div className="font-extrabold mb-1" style={{ fontSize: '.85em' }}>
                      {t('Still to do', 'עוד לעשות')}
                    </div>
                    {open.map(a => (
                      <div key={a.id} className="flex items-center gap-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-gray-600" style={{ fontSize: '.85em' }}>
                          {a.taskDescription}
                        </span>
                        {a.dueDate && (
                          <span className="text-gray-400 tabular-nums" style={{ fontSize: '.75em' }}>
                            {a.dueDate.slice(5)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        {exitFull}
        <button onClick={() => setOpenJob(null)}
          className="absolute left-4 bottom-4 px-4 py-2 rounded-full bg-[#1e3a5f] text-white font-bold shadow-lg">
          ← {t('Back to board', 'חזרה ללוח')}
        </button>
      </div>
    );
  }

  // ── Company dashboard ──
  if (view === 'dashboard') {
    /**
     * The numbers on the wall.
     *
     * Two things were wrong. Every workspace was read from its own cache,
     * including the one that is actually loaded and live — so the workspace you
     * were looking at could be minutes out of date on the very screen showing
     * it. And the overdue figure counted every task in every workspace,
     * including tasks on jobs filed into Done or Trash and tasks pointing at
     * apartments that no longer exist, which is the same fault the office
     * dashboard had.
     *
     * The active workspace is overlaid with live state, and every task figure
     * is scoped to jobs that still count — the same isCountableApartment() rule
     * that decides the unit totals, so the two can never disagree.
     */
    const totals = projects.map(p => {
      const cached = allProjects.find(x => x.projectId === p.id);
      const isLive = p.id === currentProjectId;
      const apts = (isLive ? apartments : (cached?.apartments ?? [])).filter(isCountableApartment);
      const live = new Set(apts.map(a => a.id));
      const tasks = (isLive ? contractorAssignments : (cached?.assignments ?? []))
        .filter(a => live.has(a.apartmentId));
      const today = new Date().toISOString().slice(0, 10);
      const staged = apts.filter(a => a.currentStageId).length;
      return {
        p, isLive,
        units: apts.length,
        started: staged,
        notStarted: apts.length - staged,
        pct: apts.length ? Math.round((staged / apts.length) * 100) : 0,
        open: tasks.filter(a => !a.completedAt).length,
        late: tasks.filter(a => !a.completedAt && a.dueDate && a.dueDate < today).length,
        doneToday: tasks.filter(a => a.completedAt && a.completedAt.startsWith(today)).length,
      };
    });
    const lateAll = totals.reduce((n, x) => n + x.late, 0);

    return (
      <div ref={frameRef} dir={isRtl ? 'rtl' : 'ltr'} className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
        {bar}
        {exitFull}
        <div className="flex-1 grid gap-3 p-4 min-h-0 overflow-auto"
          style={{
            fontSize: 15 * Math.min(scale, 1.6),
            gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, totals.length))}, minmax(0, 1fr))`,
          }}>

          {/* A workspace is not one number. Each card carries what somebody
              standing at the wall would otherwise have to ask about: how much
              there is, how much has started, what is late and what finished
              today, and how it is spread across the stages. */}
          {totals.map(x => (
            <button
              key={x.p.id}
              onClick={() => { setView(x.p.id); setOpenJob(null); }}
              className="bg-white rounded-2xl border border-gray-200 p-5 text-left flex flex-col min-h-0
                         hover:border-[#4aa8d8] transition-colors"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: x.p.color }} />
                <span className="font-extrabold truncate" style={{ color: x.p.color }}>{x.p.name}</span>
                {x.isLive && (
                  <span className="ml-auto px-2 py-0.5 rounded-full font-bold"
                    style={{ fontSize: '.6em', backgroundColor: '#dcfce7', color: '#15803d' }}>
                    {t('live', 'חי')}
                  </span>
                )}
              </div>

              <div className="flex items-end gap-4 mb-3">
                <span>
                  <span className="font-black leading-none block" style={{ fontSize: '2.6em', color: x.p.color }}>
                    {x.units}
                  </span>
                  <span className="text-gray-400" style={{ fontSize: '.75em' }}>{t('units', 'יחידות')}</span>
                </span>
                <span>
                  <span className="font-black leading-none block text-slate-700" style={{ fontSize: '1.5em' }}>
                    {x.pct}%
                  </span>
                  <span className="text-gray-400" style={{ fontSize: '.75em' }}>{t('started', 'התחילו')}</span>
                </span>
              </div>

              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden mb-3">
                <div className="h-full rounded-full" style={{ width: `${x.pct}%`, backgroundColor: x.p.color }} />
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  [x.open, t('open', 'פתוחות'), '#0369a1'],
                  [x.late, t('late', 'באיחור'), x.late ? '#dc2626' : '#94a3b8'],
                  [x.doneToday, t('done today', 'הושלמו היום'), '#15803d'],
                ].map(([n, label, colour], i) => (
                  <span key={i} className="rounded-xl bg-slate-50 px-2 py-1.5">
                    <span className="font-black block leading-none" style={{ fontSize: '1.35em', color: colour as string }}>
                      {n as number}
                    </span>
                    <span className="text-gray-400 block truncate" style={{ fontSize: '.68em' }}>{label as string}</span>
                  </span>
                ))}
              </div>

              {/* How it is spread — only for the workspace whose stages are
                  loaded; another workspace's stage list is not in memory. */}
              {x.isLive && (
                <div className="flex-1 min-h-0 overflow-hidden">
                  {stages.filter(st => st.active).slice(0, 6).map(st => {
                    const n = apartments.filter(a => isCountableApartment(a) && a.currentStageId === st.id).length;
                    if (!n) return null;
                    return (
                      <div key={st.id} className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: st.color }} />
                        <span className="flex-1 min-w-0 truncate text-gray-500" style={{ fontSize: '.75em' }}>
                          {getStageName(st, isRtl)}
                        </span>
                        <b className="tabular-nums text-slate-700" style={{ fontSize: '.8em' }}>{n}</b>
                      </div>
                    );
                  })}
                </div>
              )}
            </button>
          ))}

          {lateAll > 0 && (
            <div className="rounded-2xl p-5 flex flex-col justify-center col-span-full"
              style={{ backgroundColor: '#fee2e2', border: '1px solid #fecaca' }}>
              <div className="font-black leading-none text-red-600" style={{ fontSize: '2.4em' }}>{lateAll}</div>
              <div className="text-red-500 mt-1">{t('tasks overdue across every workspace', 'משימות באיחור בכל סביבות העבודה')}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── A building project: its diagram, scaled to the wall ──
  if (view !== 'general' && projects.some(p => p.id === view)) {
    return (
      <div ref={frameRef} dir={isRtl ? 'rtl' : 'ltr'} className="h-screen w-screen flex flex-col overflow-hidden bg-white">
        {bar}
        {exitFull}
        {/* Tap a stage to see only it. The legend was already on the wall as
            a key; on a touch screen a key you cannot press is a missed
            control, and "show me only the ones at second fix" is the question
            people walk up to the board to ask. */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 flex-shrink-0"
          style={{ fontSize: 13 * Math.min(scale, 1.5), backgroundColor: '#f8fafc' }}>
          <button
            onClick={() => setStageFilter([])}
            className="px-3 py-1.5 rounded-full font-bold transition-colors"
            style={stageFilter.length === 0
              ? { backgroundColor: '#1e3a5f', color: '#fff' }
              : { backgroundColor: '#e2e8f0', color: '#475569' }}>
            {t('All', 'הכול')}
          </button>
          {stages.filter(st => st.active).map(st => {
            const on = stageFilter.includes(st.id);
            const n = jobs.filter(a => a.currentStageId === st.id).length;
            return (
              <button key={st.id}
                onClick={() => setStageFilter(prev => on ? prev.filter(x => x !== st.id) : [...prev, st.id])}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full font-bold transition-colors"
                style={on
                  ? { backgroundColor: st.color, color: '#fff' }
                  : { backgroundColor: '#e2e8f0', color: '#475569' }}>
                <span className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: on ? 'rgba(255,255,255,.85)' : st.color }} />
                {getStageName(st, isRtl)}
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1 overflow-auto p-3">
          <div style={{ transform: `scale(${scale})`, transformOrigin: isRtl ? 'top right' : 'top left', width: `${100 / scale}%` }}>
            <BuildingDiagram
              apartments={jobs}
              stages={stages}
              activeStageIds={stageFilter}
              classFilter="all"
              searchQuery=""
              selectedBuilding="all"
              onApartmentClick={j => { setPhotoAt(0); setOpenJob(j); }}
              showShinuiBadge
              compact
            />
          </div>
        </div>
      </div>
    );
  }

  /**
   * Which slice of the board is on the wall.
   *
   * When a region is set in TV settings, it is fitted to the screen — the same
   * numbers the picker's rectangle produced, so what you dragged is what shows.
   * Without one it falls back to the automatic whole-board scale, and the
   * manual boost still applies on top either way.
   */
  const tvRegion = tvSettings.tvView;
  const frameW = frameRef.current?.clientWidth ?? window.innerWidth;
  const frameH = (frameRef.current?.clientHeight ?? window.innerHeight) - 56;
  const boardScale = tvRegion && tvRegion.w > 0 && tvRegion.h > 0
    ? Math.min(frameW / tvRegion.w, frameH / tvRegion.h) * boost
    : scale;
  const boardOrigin = tvRegion ? { x: tvRegion.x, y: tvRegion.y } : { x: 0, y: 0 };

  // ── The board itself ──
  return (
    <div ref={frameRef} dir={isRtl ? 'rtl' : 'ltr'} className="h-screen w-screen flex flex-col overflow-hidden bg-white">
      {bar}
      {/* The board surface is the project's own theme, so the wall matches what
          the office sees on their screens rather than being a second design. */}
      <div className="flex-1 relative overflow-hidden" style={theme.surface}>
        <div className="absolute top-0 left-0" dir="ltr"
          style={{
            transform: `scale(${boardScale}) translate(${-boardOrigin.x}px, ${-boardOrigin.y}px)`,
            transformOrigin: '0 0',
          }}>
          {/* Notes, boxes, titles, timers and drawings — the same board, minus
              anything switched off for the wall. */}
          <StrokeLayer elements={tvElements} />
          {tvElements.map(el => {
            if (el.type === 'stroke') return null;
            const isBin = el.type === 'bin' && !!el.binKind;
            const binJobs = isBin
              ? apartments.filter(a => a.boardBin === el.binKind && !a.isUnnamed).length
              : 0;
            const live = dragEl?.id === el.id
              ? { x: dragEl.dx, y: dragEl.dy, w: el.w, h: el.h }
              : sizeEl?.id === el.id
                ? { x: el.x, y: el.y, w: sizeEl.w, h: sizeEl.h }
                : { x: el.x, y: el.y, w: el.w, h: el.h };
            return (
              <div key={el.id}
                onPointerDown={editing ? e => startElDrag(e, el) : undefined}
                className={`absolute rounded-xl overflow-hidden ${editing ? 'cursor-grab' : ''}`}
                style={{
                  left: live.x, top: live.y, width: live.w, height: live.h,
                  zIndex: el.type === 'box' ? 1 : 3,
                  ...(editing ? { outline: '2px dashed rgba(245,158,11,.7)', outlineOffset: 2 } : {}),
                  ...(isBin
                    ? { backgroundColor: 'rgba(255,255,255,.82)', border: `2px dashed ${el.color}` }
                    : el.type === 'widget'
                    // The same hardcode the board had: a widget's chosen colour
                    // was ignored here too, so a board coloured for the wall
                    // came out plain white on the wall.
                    ? { backgroundColor: el.color || '#ffffff', border: '1px solid #e2e8f0' }
                    : el.type === 'clipart'
                    ? {}
                    : { backgroundColor: el.color, border: '1px solid rgba(0,0,0,.08)' }),
                }}>
                {isBin ? (
                  <button
                    onClick={() => !editing && setOpenBin(el)}
                    className="w-full h-full flex flex-col justify-center px-3 text-left">
                    <span className="font-extrabold text-[12.5px]" style={{ color: el.color }}>
                      {BIN_META[el.binKind!].label}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {binJobs} {binJobs === 1 ? t('job', 'עבודה') : t('jobs', 'עבודות')}
                    </span>
                  </button>
                ) : el.type === 'widget' ? renderWidget(el, {
                    jobs: apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed),
                    stages, assignments: contractorAssignments, contractors, users,
                    photos: contractorPhotos, logs: [],
                    update: () => {}, openJob: () => {}, readOnly: true,
                  })
                  : el.type === 'countdown' ? <CountdownNode el={el} />
                  : el.type === 'stopwatch' ? <StopwatchNode el={el} />
                  : el.type === 'clipart' ? <ClipArtNode el={el} />
                  : el.type === 'title' ? (
                    <div className="w-full h-full flex items-center px-2 font-black leading-none"
                      style={{ fontSize: el.fontSize ?? 22, color: el.color || '#0f172a' }}>
                      {el.text || ''}
                    </div>
                  ) : (
                    <div className={`${el.type === 'box' ? 'font-semibold text-sm pt-2 px-3' : 'text-sm pt-3 px-3'} text-gray-700 leading-snug whitespace-pre-wrap break-words`}>
                      {el.text}
                    </div>
                  )}

                {/* A corner to pull, while arranging. Big enough for a finger
                    on a wall panel — the board's 10px handle is a mouse size. */}
                {editing && (
                  <span
                    onPointerDown={e => startElResize(e, el)}
                    className="absolute bottom-0 right-0 rounded-tl-md"
                    style={{
                      width: 26, height: 26, cursor: 'nwse-resize',
                      backgroundColor: 'rgba(245,158,11,.85)',
                    }}
                  />
                )}
              </div>
            );
          })}

          {jobs.map((job, i) => {
            const st = stageOf(job);
            // A named board remembers its own position for each job; the main
            // board uses the job's own. Reading canvasX on a named board put
            // every tile back where the MAIN board has it, which is the one
            // arrangement that board was made to differ from.
            const at = tvBoard ? job.viewPos?.[tvBoard] : undefined;
            const x = at?.x ?? job.canvasX ?? 24 + (i % 6) * 240;
            const y = at?.y ?? job.canvasY ?? 24 + Math.floor(i / 6) * 150;
            return (
              <button key={job.id} onClick={() => { setPhotoAt(0); setOpenJob(job); }}
                className="absolute text-left rounded-xl bg-white p-2.5"
                style={{ left: x, top: y, width: 215, height: 132, zIndex: 5, border: `4px solid ${st?.color ?? '#cbd5e1'}` }}>
                <div className="font-bold text-sm text-gray-900 leading-tight">{job.displayName || t('Job', 'עבודה')}</div>
                {job.address && <div className="text-[11px] text-gray-500 truncate mt-0.5">{job.address}</div>}
                {st && (
                  <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${st.color}22`, color: st.color }}>{getStageName(st, isRtl)}</span>
                )}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center gap-1.5">
                  {job.driveLink && <span className="w-5 h-5 rounded bg-gray-50 border border-gray-200 flex items-center justify-center"><DriveIcon size={11} /></span>}
                  {job.zohoLink && <span className="w-5 h-5 rounded bg-gray-50 border border-gray-200 flex items-center justify-center"><ZohoIcon size={11} /></span>}
                  {job.plansPdfLink && <span className="w-5 h-5 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600"><PlanIcon size={11} /></span>}
                  {pending(job) > 0 && <span className="ml-auto text-[11px] font-bold text-amber-600">{pending(job)}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* While arranging: a way to put something new on the wall. */}
        {editing && (
          <button
            onClick={() => setTvStoreOpen(true)}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2
                       px-5 py-3 rounded-full font-bold text-white shadow-2xl"
            style={{ backgroundColor: '#f59e0b', fontSize: 15 * Math.min(scale, 1.6) }}
          >
            <Plus size={18} /> {t('Add a widget', 'הוספת רכיב')}
          </button>
        )}
      </div>

      {/* A group, opened by tapping it. Read-only like the rest of the wall:
          the jobs in it are listed and each one opens, and nothing can be
          filed, moved or taken out from here. */}
      {openBin && (
        <>
          <div className="fixed inset-0 z-[150]" style={{ backgroundColor: 'rgba(15,23,42,.55)' }}
            onClick={() => setOpenBin(null)} />
          <div className="fixed z-[151] rounded-2xl bg-white overflow-hidden flex flex-col"
            style={{
              left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
              width: 'min(620px, 92vw)', maxHeight: '80vh',
              fontSize: 15 * Math.min(scale, 1.5),
            }}>
            <div className="flex items-center gap-3 px-5 py-3 text-white flex-shrink-0"
              style={{ backgroundColor: openBin.color || '#1e3a5f' }}>
              <span className="font-extrabold">
                {openBin.binKind ? BIN_META[openBin.binKind].label : (openBin.text || t('Group', 'קבוצה'))}
              </span>
              <span className="flex-1" />
              <button onClick={() => setOpenBin(null)} className="p-1.5 rounded-lg hover:bg-white/15">
                <CloseIcon size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {(() => {
                const inside = apartments.filter(a =>
                  a.boardBin === openBin.binKind && !a.isUnnamed && a.showOnTv !== false);
                if (!inside.length) {
                  return <p className="text-gray-400 px-2 py-6 text-center">{t('Nothing in here.', 'אין כאן דבר.')}</p>;
                }
                return inside.map(job => {
                  const st = stageOf(job);
                  return (
                    <button key={job.id}
                      onClick={() => { setOpenBin(null); setPhotoAt(0); setOpenJob(job); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left
                                 hover:bg-slate-50 transition-colors">
                      <span className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: st?.color ?? '#cbd5e1' }} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-slate-800 truncate">
                          {job.displayName || t('Job', 'עבודה')}
                        </span>
                        {st && <span className="block text-gray-400 truncate" style={{ fontSize: '.8em' }}>
                          {getStageName(st, isRtl)}
                        </span>}
                      </span>
                      {pending(job) > 0 && (
                        <span className="font-bold text-amber-600 tabular-nums">{pending(job)}</span>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </>
      )}

      {exitFull}
      {tvStoreOpen && (
        <WidgetStore
          onPick={def => {
            // It lands in the middle of what the wall is currently showing,
            // which is the only place the person standing at it is looking.
            addCanvasElement({
              id: `CE-${Math.random().toString(36).slice(2, 9)}`,
              type: 'widget', widget: def.id,
              ...(tvBoard ? { board: tvBoard } : {}),
              x: Math.round(boardOrigin.x + 80),
              y: Math.round(boardOrigin.y + 80),
              w: def.w, h: def.h, text: '', color: '#ffffff',
              data: def.data ? JSON.parse(JSON.stringify(def.data)) : {},
            });
          }}
          onClose={() => setTvStoreOpen(false)}
        />
      )}
    </div>
  );
}
