import React, { useState, useRef } from 'react';
import { Plus, Briefcase, MapPin, ExternalLink, Trash2, ClipboardList, FolderOpen } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { Apartment } from '../types';
import { ApartmentDetailDrawer } from '../components/apartment/ApartmentDetailDrawer';
import { Toast } from '../components/ui/Toast';

const TILE_W = 215;
const TILE_H = 132;
const GAP = 22;
const PER_ROW = 4;

function defaultPos(i: number) {
  const col = i % PER_ROW;
  const row = Math.floor(i / PER_ROW);
  return { x: GAP + col * (TILE_W + GAP), y: GAP + row * (TILE_H + GAP) };
}

export function GeneralJobsPage() {
  const {
    apartments,
    addApartment,
    deleteApartment,
    updateApartment,
    stages: allStages,
    contractorAssignments,
    currentUser,
    mainUiStrings: s,
    currentProjectId,
  } = useStore();

  if (currentProjectId !== 'general') return <Navigate to="/project" replace />;

  const [selectedJob, setSelectedJob] = useState<Apartment | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [jobName, setJobName] = useState('');
  const [jobAddress, setJobAddress] = useState('');
  const [jobZoho, setJobZoho] = useState('');
  const [jobDrive, setJobDrive] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Drag state for the tile currently being moved
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const grabRef = useRef<{ gx: number; gy: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const stages = allStages.filter(st => st.projectId === 'general');
  const stageMap = new Map(stages.map(st => [st.id, st]));
  const jobs = apartments.filter(a => !a.isUnnamed);

  function posOf(job: Apartment, index: number) {
    if (drag && drag.id === job.id) return { x: drag.x, y: drag.y };
    if (typeof job.canvasX === 'number' && typeof job.canvasY === 'number') {
      return { x: job.canvasX, y: job.canvasY };
    }
    return defaultPos(index);
  }

  function handleAddJob(e: React.FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    const id = `G-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pos = defaultPos(jobs.length);
    addApartment({
      id,
      buildingId: 'G',
      apartmentNumber: '',
      displayName: jobName.trim(),
      floor: 0,
      colPosition: 1,
      colSpan: 1,
      isDuplexApt: false,
      currentStageId: null,
      classification: 'standard',
      shinuiDetails: null,
      generalNotes: '',
      isUnnamed: false,
      address: jobAddress.trim() || undefined,
      zohoLink: jobZoho.trim() || undefined,
      driveLink: jobDrive.trim() || undefined,
      canvasX: pos.x,
      canvasY: pos.y,
      createdAt: now,
      updatedAt: now,
      updatedBy: currentUser?.id ?? '',
      updatedByName: currentUser?.name ?? '',
    });
    setJobName('');
    setJobAddress('');
    setJobZoho('');
    setJobDrive('');
    setShowAddModal(false);
    setToast(s.taskAdded);
  }

  function handleDelete(id: string) {
    if (!window.confirm(s.deleteJobConfirm)) return;
    if (selectedJob?.id === id) setSelectedJob(null);
    deleteApartment(id);
  }

  // ─── Drag handlers ────────────────────────────────────────────────
  function onTilePointerDown(e: React.PointerEvent, job: Apartment, pos: { x: number; y: number }) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    grabRef.current = {
      gx: e.clientX - rect.left - pos.x,
      gy: e.clientY - rect.top - pos.y,
    };
    setDrag({ id: job.id, x: pos.x, y: pos.y, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onTilePointerMove(e: React.PointerEvent) {
    if (!drag || !grabRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = Math.max(0, e.clientX - rect.left - grabRef.current.gx);
    const ny = Math.max(0, e.clientY - rect.top - grabRef.current.gy);
    const moved = drag.moved || Math.abs(nx - drag.x) > 4 || Math.abs(ny - drag.y) > 4;
    setDrag({ id: drag.id, x: nx, y: ny, moved });
  }

  function onTilePointerUp(job: Apartment) {
    if (!drag) return;
    if (drag.moved) {
      if (currentUser) updateApartment(job.id, { canvasX: Math.round(drag.x), canvasY: Math.round(drag.y) }, currentUser);
    } else {
      setSelectedJob(job);
    }
    setDrag(null);
    grabRef.current = null;
  }

  // Canvas size grows to fit the furthest tile
  let maxX = 600, maxY = 400;
  jobs.forEach((job, i) => {
    const p = posOf(job, i);
    maxX = Math.max(maxX, p.x + TILE_W + GAP);
    maxY = Math.max(maxY, p.y + TILE_H + GAP);
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <Briefcase size={22} className="text-[#1e3a5f]" />
          <h1 className="text-xl font-bold text-gray-900">{s.generalJobsTitle}</h1>
          {jobs.length > 0 && (
            <span className="text-xs font-medium bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">{jobs.length}</span>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 shadow-sm"
          style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}
        >
          <Plus size={18} /> {s.addJobBtn}
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto min-h-0">
        {jobs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 select-none">
            <Briefcase size={56} className="mb-4 opacity-25" />
            <p className="text-sm">{s.noJobsYet}</p>
          </div>
        ) : (
          <div
            ref={canvasRef}
            className="relative"
            style={{
              width: maxX,
              height: maxY,
              minWidth: '100%',
              minHeight: '100%',
              backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          >
            {jobs.map((job, i) => {
              const pos = posOf(job, i);
              const stage = job.currentStageId ? stageMap.get(job.currentStageId) : null;
              const pendingTasks = contractorAssignments.filter(a => a.apartmentId === job.id && !a.completedAt).length;
              const isDragging = drag?.id === job.id && drag.moved;
              return (
                <div
                  key={job.id}
                  onPointerDown={e => onTilePointerDown(e, job, pos)}
                  onPointerMove={onTilePointerMove}
                  onPointerUp={() => onTilePointerUp(job)}
                  className={`absolute bg-white rounded-xl border p-3 group select-none transition-shadow ${
                    isDragging ? 'shadow-2xl border-[#4aa8d8] cursor-grabbing z-20' : 'shadow-sm border-gray-200 hover:shadow-md hover:border-[#4aa8d8]/40 cursor-grab'
                  }`}
                  style={{ left: pos.x, top: pos.y, width: TILE_W, height: TILE_H, touchAction: 'none' }}
                >
                  {/* Delete */}
                  <button
                    data-no-drag
                    onClick={() => handleDelete(job.id)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>

                  {/* Name + stage dot */}
                  <div className="flex items-start gap-2 mb-1.5 pr-6">
                    {stage && <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1" style={{ backgroundColor: stage.color }} />}
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">
                      {job.displayName || s.jobLabel}
                    </h3>
                  </div>

                  {stage && (
                    <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full text-white mb-1.5" style={{ backgroundColor: stage.color }}>
                      {stage.name}
                    </span>
                  )}

                  {job.address && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <MapPin size={11} className="flex-shrink-0 text-gray-400" />
                      <span className="truncate">{job.address}</span>
                    </div>
                  )}

                  {/* Link row */}
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center gap-3">
                    {job.zohoLink && (
                      <a
                        data-no-drag
                        href={job.zohoLink.startsWith('http') ? job.zohoLink : `https://${job.zohoLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-[#4aa8d8] hover:underline flex items-center gap-1"
                      >
                        <ExternalLink size={10} /> Zoho
                      </a>
                    )}
                    {job.driveLink && (
                      <a
                        data-no-drag
                        href={job.driveLink.startsWith('http') ? job.driveLink : `https://${job.driveLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-[#4aa8d8] hover:underline flex items-center gap-1"
                      >
                        <FolderOpen size={10} /> Drive
                      </a>
                    )}
                    {pendingTasks > 0 && (
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                        <ClipboardList size={11} />
                        {pendingTasks}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Job modal */}
      {showAddModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowAddModal(false)} />
          <div className="fixed z-50 bg-white rounded-2xl shadow-2xl p-6"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(420px, 92vw)' }}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{s.addJobBtn}</h2>
            <form onSubmit={handleAddJob} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{s.jobNameLabel}</label>
                <input
                  autoFocus
                  value={jobName}
                  onChange={e => setJobName(e.target.value)}
                  placeholder={s.jobNameLabel}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{s.addressLabel}</label>
                <input
                  value={jobAddress}
                  onChange={e => setJobAddress(e.target.value)}
                  placeholder={s.addressLabel}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{s.zohoLinkLabel}</label>
                <input
                  value={jobZoho}
                  onChange={e => setJobZoho(e.target.value)}
                  placeholder="https://crm.zoho.com/..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{s.driveFolder}</label>
                <input
                  value={jobDrive}
                  onChange={e => setJobDrive(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-all">
                  {s.cancel}
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}>
                  {s.addJobBtn}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Detail drawer — reused for jobs */}
      {selectedJob && currentUser && (
        <ApartmentDetailDrawer
          apartment={selectedJob}
          onClose={() => setSelectedJob(null)}
          currentUser={currentUser}
          onToast={msg => setToast(msg)}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
