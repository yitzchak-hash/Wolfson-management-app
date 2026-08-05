import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore, loadAllProjectsTaskData } from '../data/store';
import { Apartment, CanvasElement, isCountableApartment, BIN_META, getStageName } from '../types';
import { DriveIcon, ZohoIcon, PlanIcon } from '../components/ui/BrandIcons';
import { getBoardTheme } from '../data/boardThemes';
import { BuildingDiagram } from '../components/diagram/BuildingDiagram';
import { CountdownNode, StopwatchNode, ClipArtNode, StrokeLayer } from '../components/board/BoardNodes';
import { renderWidget } from '../data/widgets';

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
  const [showScale, setShowScale] = useState(false);

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

  const tvElements = useMemo(
    () => canvasElements.filter(el => el.showOnTv !== false),
    [canvasElements],
  );

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

  const bar = (
    <div className="flex items-center gap-3 px-5 py-3 bg-[#1e3a5f] text-white flex-shrink-0"
      style={{ fontSize: 15 * Math.min(scale, 1.6) }}>
      <span className="font-extrabold">TzviAir <span className="text-[#4aa8d8]">Job Board</span></span>
      <span className="flex-1" />
      {projects.map(p => (
        <button key={p.id} onClick={() => { setView(p.id); setOpenJob(null); }}
          className="flex items-center gap-2 px-3 py-1 rounded-full font-bold transition-colors"
          style={view === p.id
            ? { backgroundColor: '#fff', color: '#1e3a5f' }
            : { backgroundColor: 'rgba(255,255,255,.12)', color: '#cbd5e1' }}>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.shortName}
        </button>
      ))}
      <button onClick={() => { setView('dashboard'); setOpenJob(null); }}
        className="px-3 py-1 rounded-full font-bold transition-colors"
        style={view === 'dashboard'
          ? { backgroundColor: '#fff', color: '#1e3a5f' }
          : { backgroundColor: 'rgba(255,255,255,.12)', color: '#cbd5e1' }}>
        {t('Dashboard', 'לוח בקרה')}
      </button>
      <span className="flex-1" />
      {overdue > 0 && (
        <span className="px-3 py-1 rounded-full font-bold"
          style={{ backgroundColor: 'rgba(239,68,68,.22)', color: '#fca5a5' }}>
          {overdue} {t('overdue', 'באיחור')}
        </span>
      )}

      {/* Language — the default lives in TV settings, this switches the panel. */}
      <div className="flex items-center rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,.12)' }}>
        {(['en', 'he'] as const).map(l => (
          <button key={l} onClick={() => setLang(l)}
            className="px-2.5 py-1 font-bold transition-colors"
            style={lang === l ? { backgroundColor: '#fff', color: '#1e3a5f' } : { color: '#cbd5e1' }}>
            {l === 'en' ? 'EN' : 'עב'}
          </button>
        ))}
      </div>

      {/* Display size. Automatic by default; this nudges it for the room. */}
      <div className="relative">
        <button onClick={() => setShowScale(v => !v)}
          title={t('Display size', 'גודל תצוגה')}
          className="px-2.5 py-1 rounded-full font-bold"
          style={{ backgroundColor: 'rgba(255,255,255,.12)', color: '#cbd5e1' }}>
          {Math.round(boost * 100)}%
        </button>
        {showScale && (
          <div className="absolute right-0 mt-2 z-50 bg-white text-gray-700 rounded-xl shadow-2xl p-3"
            style={{ width: 230, fontSize: 12 }}>
            <div className="font-extrabold mb-1">{t('Display size', 'גודל תצוגה')}</div>
            <div className="text-gray-400 mb-2 leading-snug" style={{ fontSize: 10.5 }}>
              {t('Automatic by default. Slide until the board reads comfortably from where people stand.',
                 'אוטומטי כברירת מחדל. הזיזו עד שהלוח נקרא בנוחות מהמקום שבו עומדים.')}
            </div>
            <input
              type="range" min={0.6} max={2} step={0.05} value={boost}
              onChange={e => setBoost(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex items-center justify-between mt-1" style={{ fontSize: 10.5 }}>
              <span className="text-gray-400">{t('Smaller', 'קטן')}</span>
              <button onClick={() => setBoost(1)} className="font-bold text-[#1e3a5f]">
                {t('Automatic', 'אוטומטי')}
              </button>
              <span className="text-gray-400">{t('Bigger', 'גדול')}</span>
            </div>
          </div>
        )}
      </div>

      <span className="font-bold tabular-nums">
        {now.toLocaleDateString(isRtl ? 'he-IL' : undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {now.toLocaleTimeString(isRtl ? 'he-IL' : undefined, { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );

  // ── Job detail ──
  if (openJob) {
    const st = stageOf(openJob);
    const photos = contractorPhotos
      .filter(p => contractorAssignments.some(a => a.id === p.assignmentId && a.apartmentId === openJob.id))
      .slice(0, 4);
    return (
      <div ref={frameRef} dir={isRtl ? 'rtl' : 'ltr'} className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
        {bar}
        <div className="flex-1 grid gap-3 p-3 min-h-0"
          style={{ gridTemplateColumns: '1.05fr 1fr', gridTemplateRows: '1.15fr 1fr', fontSize: 15 * Math.min(scale, 1.6) }}>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-3 py-2 font-extrabold border-b border-gray-200 flex items-center gap-2">
              <PlanIcon size={16} /> {t('Engineering plan', 'תוכנית הנדסית')}
              {openJob.plansPdfLink && (
                <a href={openJob.plansPdfLink} target="_blank" rel="noopener noreferrer"
                  className="ml-auto text-[#4aa8d8] font-bold">{t('open in Drive', 'פתח בדרייב')} ↗</a>
              )}
            </div>
            {openJob.plansPdfLink ? (
              <iframe title="plan" src={openJob.plansPdfLink.replace('/view', '/preview')} className="flex-1 w-full border-0" />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">{t('No plan linked', 'לא צורפה תוכנית')}</div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col">
            <div className="font-extrabold mb-2">{t('Latest site photos', 'תמונות אחרונות מהאתר')}</div>
            <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2">
              {photos.length === 0 && (
                <div className="col-span-2 row-span-2 flex items-center justify-center text-gray-400">{t('No photos yet', 'אין עדיין תמונות')}</div>
              )}
              {photos.map(p => (
                <div key={p.id} className="rounded-lg bg-slate-200 overflow-hidden">
                  {(p.storageUrl || p.dataUrl) && (
                    <img src={p.storageUrl || p.dataUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="font-black leading-tight" style={{ fontSize: '1.9em' }}>
              {openJob.displayName || t('Job', 'עבודה')}
            </div>
            {openJob.address && <div className="text-gray-500 mt-1">{openJob.address}</div>}
            <div className="flex gap-2 mt-3">
              {st && (
                <span className="font-bold px-3 py-1 rounded-full"
                  style={{ backgroundColor: `${st.color}22`, color: st.color }}>{st.name}</span>
              )}
              {pending(openJob) > 0 && (
                <span className="font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700">
                  {pending(openJob)} {t('open', 'פתוחות')}
                </span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-center gap-2">
            <div className="font-extrabold mb-1">{t('Links', 'קישורים')}</div>
            <div className="flex gap-3">
              {openJob.driveLink && <a href={openJob.driveLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200"><DriveIcon size={18} /> Drive</a>}
              {openJob.zohoLink && <a href={openJob.zohoLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200"><ZohoIcon size={18} /> Zoho</a>}
            </div>
          </div>
        </div>
        <button onClick={() => setOpenJob(null)}
          className="absolute left-4 bottom-4 px-4 py-2 rounded-full bg-[#1e3a5f] text-white font-bold shadow-lg">
          ← {t('Back to board', 'חזרה ללוח')}
        </button>
      </div>
    );
  }

  // ── Company dashboard ──
  if (view === 'dashboard') {
    const totals = projects.map(p => {
      const d = allProjects.find(x => x.projectId === p.id);
      const apts = (d?.apartments ?? []).filter(isCountableApartment);
      const staged = apts.filter(a => a.currentStageId).length;
      return { p, units: apts.length, pct: apts.length ? Math.round(staged / apts.length * 100) : 0 };
    });
    return (
      <div ref={frameRef} dir={isRtl ? 'rtl' : 'ltr'} className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
        {bar}
        <div className="flex-1 grid grid-cols-4 gap-3 p-4 min-h-0" style={{ fontSize: 15 * Math.min(scale, 1.6) }}>
          {totals.map(({ p, units }) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-center">
              <div className="font-black leading-none" style={{ fontSize: '2.8em', color: p.color }}>{units}</div>
              <div className="text-gray-500 mt-1">{p.shortName} · {t('units', 'יחידות')}</div>
            </div>
          ))}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-center">
            <div className="font-black leading-none text-red-500" style={{ fontSize: '2.8em' }}>{overdue}</div>
            <div className="text-gray-500 mt-1">{t('Overdue tasks', 'משימות באיחור')}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-4">
            <div className="font-extrabold mb-2">{t('Progress by project', 'התקדמות לפי פרויקט')}</div>
            {totals.map(({ p, pct }) => (
              <div key={p.id} className="flex items-center gap-3 mb-2">
                <span className="w-28 text-gray-500">{p.shortName}</span>
                <span className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                </span>
                <b className="w-12 text-right">{pct}%</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── A building project: its diagram, scaled to the wall ──
  if (view !== 'general' && projects.some(p => p.id === view)) {
    return (
      <div ref={frameRef} dir={isRtl ? 'rtl' : 'ltr'} className="h-screen w-screen flex flex-col overflow-hidden bg-white">
        {bar}
        <div className="flex-1 overflow-auto p-3">
          <div style={{ transform: `scale(${scale})`, transformOrigin: isRtl ? 'top right' : 'top left', width: `${100 / scale}%` }}>
            <BuildingDiagram
              apartments={jobs}
              stages={stages}
              activeStageIds={[]}
              classFilter="all"
              searchQuery=""
              selectedBuilding="all"
              onApartmentClick={setOpenJob}
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
            return (
              <div key={el.id} className="absolute rounded-xl overflow-hidden"
                style={{
                  left: el.x, top: el.y, width: el.w, height: el.h,
                  zIndex: el.type === 'box' ? 1 : 3,
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
                  <div className="w-full h-full flex flex-col justify-center px-3">
                    <span className="font-extrabold text-[12.5px]" style={{ color: el.color }}>
                      {BIN_META[el.binKind!].label}
                    </span>
                    <span className="text-[11px] text-gray-500">{binJobs}</span>
                  </div>
                ) : el.type === 'widget' ? renderWidget(el, {
                    jobs: apartments.filter(a => a.buildingId === 'G' && !a.isUnnamed),
                    stages, assignments: contractorAssignments, contractors: [],
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
              </div>
            );
          })}

          {jobs.map((job, i) => {
            const st = stageOf(job);
            const x = job.canvasX ?? 24 + (i % 6) * 240;
            const y = job.canvasY ?? 24 + Math.floor(i / 6) * 150;
            return (
              <button key={job.id} onClick={() => setOpenJob(job)}
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
      </div>
    </div>
  );
}
