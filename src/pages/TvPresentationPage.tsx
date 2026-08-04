import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore, loadAllProjectsTaskData } from '../data/store';
import { Apartment, isCountableApartment, projectColor } from '../types';
import { DriveIcon, ZohoIcon, PlanIcon } from '../components/ui/BrandIcons';

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
  const { projects, apartments, stages, contractorAssignments, contractorPhotos, boardSettings } = useStore();

  const view = params.get('view') ?? 'general';
  const setView = (v: string) => { const p = new URLSearchParams(params); p.set('view', v); setParams(p, { replace: true }); };

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
  const manualScale = Number(params.get('scale'));

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

  const scale = Number.isFinite(manualScale) && manualScale > 0 ? manualScale : autoScale;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const jobs = useMemo(
    () => apartments.filter(a =>
      a.buildingId === 'G' && !a.isUnnamed && !a.boardBin && a.showOnTv !== false),
    [apartments],
  );

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
        Dashboard
      </button>
      <span className="flex-1" />
      {overdue > 0 && (
        <span className="px-3 py-1 rounded-full font-bold"
          style={{ backgroundColor: 'rgba(239,68,68,.22)', color: '#fca5a5' }}>
          {overdue} overdue
        </span>
      )}
      <span className="font-bold tabular-nums">
        {now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
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
      <div ref={frameRef} className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
        {bar}
        <div className="flex-1 grid gap-3 p-3 min-h-0"
          style={{ gridTemplateColumns: '1.05fr 1fr', gridTemplateRows: '1.15fr 1fr', fontSize: 15 * Math.min(scale, 1.6) }}>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="px-3 py-2 font-extrabold border-b border-gray-200 flex items-center gap-2">
              <PlanIcon size={16} /> Engineering plan
              {openJob.plansPdfLink && (
                <a href={openJob.plansPdfLink} target="_blank" rel="noopener noreferrer"
                  className="ml-auto text-[#4aa8d8] font-bold">open in Drive ↗</a>
              )}
            </div>
            {openJob.plansPdfLink ? (
              <iframe title="plan" src={openJob.plansPdfLink.replace('/view', '/preview')} className="flex-1 w-full border-0" />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">No plan linked</div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col">
            <div className="font-extrabold mb-2">Latest site photos</div>
            <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2">
              {photos.length === 0 && (
                <div className="col-span-2 row-span-2 flex items-center justify-center text-gray-400">No photos yet</div>
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
              {openJob.displayName || 'Job'}
            </div>
            {openJob.address && <div className="text-gray-500 mt-1">{openJob.address}</div>}
            <div className="flex gap-2 mt-3">
              {st && (
                <span className="font-bold px-3 py-1 rounded-full"
                  style={{ backgroundColor: `${st.color}22`, color: st.color }}>{st.name}</span>
              )}
              {pending(openJob) > 0 && (
                <span className="font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700">
                  {pending(openJob)} open
                </span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-center gap-2">
            <div className="font-extrabold mb-1">Links</div>
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
          ← Back to board
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
      <div ref={frameRef} className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
        {bar}
        <div className="flex-1 grid grid-cols-4 gap-3 p-4 min-h-0" style={{ fontSize: 15 * Math.min(scale, 1.6) }}>
          {totals.map(({ p, units }) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-center">
              <div className="font-black leading-none" style={{ fontSize: '2.8em', color: p.color }}>{units}</div>
              <div className="text-gray-500 mt-1">{p.shortName} units</div>
            </div>
          ))}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col justify-center">
            <div className="font-black leading-none text-red-500" style={{ fontSize: '2.8em' }}>{overdue}</div>
            <div className="text-gray-500 mt-1">Overdue tasks</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-4">
            <div className="font-extrabold mb-2">Progress by project</div>
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

  // ── The board itself ──
  return (
    <div ref={frameRef} className="h-screen w-screen flex flex-col overflow-hidden bg-white">
      {bar}
      <div className="flex-1 relative overflow-hidden"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(120,140,170,.30) 1px, transparent 1px)',
          backgroundSize: `${22 * scale}px ${22 * scale}px`,
        }}>
        <div className="absolute top-0 left-0" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          {jobs.map((job, i) => {
            const st = stageOf(job);
            const x = job.canvasX ?? 24 + (i % 6) * 240;
            const y = job.canvasY ?? 24 + Math.floor(i / 6) * 150;
            return (
              <button key={job.id} onClick={() => setOpenJob(job)}
                className="absolute text-left rounded-xl bg-white p-2.5"
                style={{ left: x, top: y, width: 215, height: 132, border: `4px solid ${st?.color ?? '#cbd5e1'}` }}>
                <div className="font-bold text-sm text-gray-900 leading-tight">{job.displayName || 'Job'}</div>
                {job.address && <div className="text-[11px] text-gray-500 truncate mt-0.5">{job.address}</div>}
                {st && (
                  <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${st.color}22`, color: st.color }}>{st.name}</span>
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
