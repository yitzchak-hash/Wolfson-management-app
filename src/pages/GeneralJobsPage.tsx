import React, { useState, useRef, useEffect } from 'react';
import { Plus, Briefcase, MapPin, ExternalLink, Trash2, ClipboardList, FolderOpen, Copy } from 'lucide-react';
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

interface DragState {
  ids: string[];
  starts: Map<string, { x: number; y: number }>;
  grabX: number;
  grabY: number;
  dx: number;
  dy: number;
  moved: boolean;
}

interface LassoState {
  sx: number; sy: number; ex: number; ey: number;
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

  const [selectedJob, setSelectedJob] = useState<Apartment | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [jobName, setJobName] = useState('');
  const [jobAddress, setJobAddress] = useState('');
  const [jobZoho, setJobZoho] = useState('');
  const [jobDrive, setJobDrive] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [lasso, setLasso] = useState<LassoState | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  // Ref for delete-key handler so it always sees latest selectedIds/jobs
  const deleteRef = useRef<() => void>(() => {});

  // ─── Redirect guard (after all hooks) ────────────────────────────
  if (currentProjectId !== 'general') return <Navigate to="/project" replace />;

  const stages = allStages.filter(st => st.projectId === 'general');
  const stageMap = new Map(stages.map(st => [st.id, st]));
  // Only show jobs that belong to the General project
  const jobs = apartments.filter(a => !a.isUnnamed && a.buildingId === 'G');

  function posOf(job: Apartment, index: number): { x: number; y: number } {
    if (drag && drag.ids.includes(job.id)) {
      const start = drag.starts.get(job.id)!;
      return { x: start.x + drag.dx, y: start.y + drag.dy };
    }
    if (typeof job.canvasX === 'number' && typeof job.canvasY === 'number') {
      return { x: job.canvasX, y: job.canvasY };
    }
    return defaultPos(index);
  }

  // ─── Add Job ──────────────────────────────────────────────────────
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
    setJobName(''); setJobAddress(''); setJobZoho(''); setJobDrive('');
    setShowAddModal(false);
  }

  // ─── Delete / Duplicate ───────────────────────────────────────────
  function handleDeleteIds(ids: string[]) {
    if (!window.confirm(s.deleteJobConfirm)) return;
    ids.forEach(id => {
      if (selectedJob?.id === id) setSelectedJob(null);
      deleteApartment(id);
    });
    setSelectedIds(new Set());
    setContextMenu(null);
  }

  function handleDuplicate(ids: string[]) {
    const now = new Date().toISOString();
    ids.forEach((id, idx) => {
      const original = jobs.find(j => j.id === id);
      if (!original) return;
      const newId = `G-${Date.now() + idx}-${Math.random().toString(36).slice(2, 6)}`;
      const origIndex = jobs.findIndex(j => j.id === id);
      const base = posOf(original, origIndex);
      addApartment({
        ...original,
        id: newId,
        displayName: original.displayName ? `${original.displayName} (copy)` : '',
        canvasX: base.x + 25,
        canvasY: base.y + 25,
        createdAt: now,
        updatedAt: now,
        updatedBy: currentUser?.id ?? '',
        updatedByName: currentUser?.name ?? '',
      });
    });
    setSelectedIds(new Set());
    setContextMenu(null);
  }

  // Keep delete ref fresh so the keyboard handler always closes over current state
  deleteRef.current = () => {
    if (selectedIds.size > 0) handleDeleteIds([...selectedIds]);
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteRef.current();
      if (e.key === 'Escape') { setSelectedIds(new Set()); setContextMenu(null); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ─── Tile drag ────────────────────────────────────────────────────
  function onTilePointerDown(e: React.PointerEvent, job: Apartment, index: number) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    e.stopPropagation();
    setContextMenu(null);

    const rect = canvasRef.current!.getBoundingClientRect();
    const grabX = e.clientX - rect.left;
    const grabY = e.clientY - rect.top;

    if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(job.id)) next.delete(job.id); else next.add(job.id);
        return next;
      });
      return;
    }

    const idsToMove = selectedIds.has(job.id) && selectedIds.size > 1
      ? [...selectedIds]
      : [job.id];

    if (!selectedIds.has(job.id)) setSelectedIds(new Set([job.id]));

    const starts = new Map<string, { x: number; y: number }>();
    jobs.forEach((j, i) => {
      if (idsToMove.includes(j.id)) {
        starts.set(j.id,
          typeof j.canvasX === 'number' && typeof j.canvasY === 'number'
            ? { x: j.canvasX, y: j.canvasY }
            : defaultPos(i)
        );
      }
    });

    setDrag({ ids: idsToMove, starts, grabX, grabY, dx: 0, dy: 0, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onTilePointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const dx = e.clientX - rect.left - drag.grabX;
    const dy = e.clientY - rect.top - drag.grabY;
    const moved = drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4;
    setDrag({ ...drag, dx, dy, moved });
  }

  function onTilePointerUp(job: Apartment) {
    if (!drag) return;
    if (drag.moved) {
      if (currentUser) {
        drag.ids.forEach(id => {
          const start = drag.starts.get(id)!;
          updateApartment(id, {
            canvasX: Math.max(0, Math.round(start.x + drag.dx)),
            canvasY: Math.max(0, Math.round(start.y + drag.dy)),
          }, currentUser);
        });
      }
    } else {
      // Plain click → open drawer
      if (drag.ids.length === 1 && drag.ids[0] === job.id) {
        setSelectedIds(new Set());
        setSelectedJob(job);
      }
    }
    setDrag(null);
  }

  function onTileContextMenu(e: React.MouseEvent, job: Apartment) {
    e.preventDefault();
    e.stopPropagation();
    const idsForMenu = selectedIds.has(job.id) && selectedIds.size > 1
      ? [...selectedIds]
      : [job.id];
    if (!selectedIds.has(job.id)) setSelectedIds(new Set([job.id]));
    setContextMenu({ x: e.clientX, y: e.clientY, ids: idsForMenu });
  }

  // ─── Lasso selection ──────────────────────────────────────────────
  function onCanvasPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element) !== canvasRef.current) return;
    setContextMenu(null);
    setSelectedIds(new Set());
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setLasso({ sx: x, sy: y, ex: x, ey: y });
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    if (!lasso) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    setLasso(l => l ? { ...l, ex: e.clientX - rect.left, ey: e.clientY - rect.top } : null);
  }

  function onCanvasPointerUp() {
    if (!lasso) return;
    const { sx, sy, ex, ey } = lasso;
    if (Math.abs(ex - sx) > 8 || Math.abs(ey - sy) > 8) {
      const minX = Math.min(sx, ex), maxX = Math.max(sx, ex);
      const minY = Math.min(sy, ey), maxY = Math.max(sy, ey);
      const newSel = new Set<string>();
      jobs.forEach((job, i) => {
        const pos = posOf(job, i);
        if (pos.x < maxX && pos.x + TILE_W > minX && pos.y < maxY && pos.y + TILE_H > minY) {
          newSel.add(job.id);
        }
      });
      setSelectedIds(newSel);
    }
    setLasso(null);
  }

  // ─── Canvas size ──────────────────────────────────────────────────
  let maxX = 600, maxY = 400;
  jobs.forEach((job, i) => {
    const p = posOf(job, i);
    maxX = Math.max(maxX, p.x + TILE_W + GAP);
    maxY = Math.max(maxY, p.y + TILE_H + GAP);
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <Briefcase size={22} className="text-[#1e3a5f]" />
          <h1 className="text-xl font-bold text-gray-900">{s.generalJobsTitle}</h1>
          {jobs.length > 0 && (
            <span className="text-xs font-medium bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">{jobs.length}</span>
          )}
          {selectedIds.size > 0 && (
            <span className="text-xs font-medium bg-[#4aa8d8]/20 text-[#1e3a5f] rounded-full px-2 py-0.5">
              {selectedIds.size} selected
            </span>
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
              userSelect: 'none',
            }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}
          >
            {/* Lasso selection rectangle */}
            {lasso && (Math.abs(lasso.ex - lasso.sx) > 4 || Math.abs(lasso.ey - lasso.sy) > 4) && (
              <div
                className="absolute pointer-events-none z-10 rounded"
                style={{
                  left: Math.min(lasso.sx, lasso.ex),
                  top: Math.min(lasso.sy, lasso.ey),
                  width: Math.abs(lasso.ex - lasso.sx),
                  height: Math.abs(lasso.ey - lasso.sy),
                  border: '2px solid #4aa8d8',
                  backgroundColor: 'rgba(74,168,216,0.08)',
                }}
              />
            )}

            {jobs.map((job, i) => {
              const pos = posOf(job, i);
              const stage = job.currentStageId ? stageMap.get(job.currentStageId) : null;
              const pendingTasks = contractorAssignments.filter(a => a.apartmentId === job.id && !a.completedAt).length;
              const isDragging = drag?.ids.includes(job.id) && drag.moved;
              const isSelected = selectedIds.has(job.id);

              return (
                <div
                  key={job.id}
                  onPointerDown={e => onTilePointerDown(e, job, i)}
                  onPointerMove={onTilePointerMove}
                  onPointerUp={() => onTilePointerUp(job)}
                  onContextMenu={e => onTileContextMenu(e, job)}
                  className={`absolute bg-white rounded-xl border p-3 group select-none ${
                    isDragging
                      ? 'shadow-2xl border-[#4aa8d8] cursor-grabbing z-20'
                      : isSelected
                      ? 'shadow-md border-[#4aa8d8] cursor-grab z-10'
                      : 'shadow-sm border-gray-200 hover:shadow-md hover:border-[#4aa8d8]/40 cursor-grab'
                  }`}
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: TILE_W,
                    height: TILE_H,
                    touchAction: 'none',
                    outline: isSelected && !isDragging ? '2px solid rgba(74,168,216,0.4)' : undefined,
                    outlineOffset: '1px',
                  }}
                >
                  {/* Hover delete */}
                  <button
                    data-no-drag
                    onClick={() => handleDeleteIds([job.id])}
                    className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>

                  {/* Name + stage dot */}
                  <div className="flex items-start gap-2 mb-1.5 pr-6">
                    {stage && (
                      <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1" style={{ backgroundColor: stage.color }} />
                    )}
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

                  {/* Bottom link row */}
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center gap-3">
                    {job.zohoLink && (
                      <a
                        data-no-drag
                        href={job.zohoLink.startsWith('http') ? job.zohoLink : `https://${job.zohoLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
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
                        onClick={e => e.stopPropagation()}
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

      {/* Right-click context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => handleDuplicate(contextMenu.ids)}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
            >
              <Copy size={14} className="text-gray-400" />
              {contextMenu.ids.length > 1 ? `Duplicate (${contextMenu.ids.length})` : 'Duplicate'}
            </button>
            <div className="h-px bg-gray-100 my-1" />
            <button
              onClick={() => handleDeleteIds(contextMenu.ids)}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5"
            >
              <Trash2 size={14} />
              {contextMenu.ids.length > 1 ? `Delete (${contextMenu.ids.length})` : 'Delete'}
            </button>
          </div>
        </>
      )}

      {/* Add Job modal */}
      {showAddModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowAddModal(false)} />
          <div
            className="fixed z-50 bg-white rounded-2xl shadow-2xl p-6"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(420px, 92vw)' }}
          >
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
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-all"
                >
                  {s.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}
                >
                  {s.addJobBtn}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Detail drawer */}
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
