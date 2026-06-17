import React, { useState, useRef, useEffect } from 'react';
import {
  Plus, Briefcase, MapPin, ExternalLink, Trash2, ClipboardList, FolderOpen,
  Copy, StickyNote, Square, Palette, Pencil, X,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { Apartment, CanvasElement } from '../types';
import { ApartmentDetailDrawer } from '../components/apartment/ApartmentDetailDrawer';
import { QuickAddTaskPanel } from '../components/apartment/QuickAddTaskPanel';
import { Toast } from '../components/ui/Toast';

// ─── Layout constants ─────────────────────────────────────────────────────────
const TILE_W = 215;
const TILE_H = 132;
const GAP = 22;
const PER_ROW = 4;

// ─── Color palettes ───────────────────────────────────────────────────────────
const TILE_PALETTE = [
  { label: 'White', bg: '#ffffff', border: '#e5e7eb' },
  { label: 'Sky', bg: '#e0f2fe', border: '#7dd3fc' },
  { label: 'Green', bg: '#dcfce7', border: '#86efac' },
  { label: 'Yellow', bg: '#fef9c3', border: '#fde047' },
  { label: 'Orange', bg: '#ffedd5', border: '#fdba74' },
  { label: 'Rose', bg: '#ffe4e6', border: '#fda4af' },
  { label: 'Purple', bg: '#f3e8ff', border: '#d8b4fe' },
  { label: 'Teal', bg: '#ccfbf1', border: '#5eead4' },
  { label: 'Navy', bg: '#dbeafe', border: '#93c5fd' },
];

const NOTE_PALETTE = ['#fef9c3', '#dcfce7', '#fce7f3', '#dbeafe', '#f3e8ff', '#ffedd5', '#ccfbf1', '#ffe4e6'];

const BOX_PALETTE = [
  'rgba(219,234,254,0.45)',
  'rgba(220,252,231,0.45)',
  'rgba(252,231,243,0.45)',
  'rgba(243,232,255,0.45)',
  'rgba(255,237,213,0.45)',
  'rgba(204,251,241,0.45)',
  'rgba(255,228,230,0.45)',
  'rgba(254,249,195,0.45)',
];

function defaultPos(i: number) {
  const col = i % PER_ROW;
  const row = Math.floor(i / PER_ROW);
  return { x: GAP + col * (TILE_W + GAP), y: GAP + row * (TILE_H + GAP) };
}

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DragState {
  kind: 'job' | 'element';
  ids: string[];
  starts: Map<string, { x: number; y: number }>;
  grabX: number;
  grabY: number;
  dx: number;
  dy: number;
  moved: boolean;
}

interface ResizeState {
  id: string;
  startW: number;
  startH: number;
  startPX: number;
  startPY: number;
}

interface LassoState { sx: number; sy: number; ex: number; ey: number }

interface CtxMenu {
  x: number;
  y: number;
  kind: 'job' | 'element';
  ids: string[];
}

interface ColorPickerState {
  x: number;
  y: number;
  kind: 'job' | 'element';
  ids: string[];
}

// ─── Component ────────────────────────────────────────────────────────────────
export function GeneralJobsPage() {
  const {
    apartments,
    addApartment,
    deleteApartment,
    updateApartment,
    canvasElements,
    addCanvasElement,
    updateCanvasElement,
    deleteCanvasElement,
    stages: allStages,
    contractorAssignments,
    currentUser,
    mainUiStrings: s,
    currentProjectId,
  } = useStore();

  // ── All hooks must come before any early return ──────────────────
  const [selectedJob, setSelectedJob] = useState<Apartment | null>(null);
  const [addTaskJob, setAddTaskJob] = useState<Apartment | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [jobName, setJobName] = useState('');
  const [jobAddress, setJobAddress] = useState('');
  const [jobZoho, setJobZoho] = useState('');
  const [jobDrive, setJobDrive] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [selectedElIds, setSelectedElIds] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [lasso, setLasso] = useState<LassoState | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [colorPicker, setColorPicker] = useState<ColorPickerState | null>(null);
  const [editingEl, setEditingEl] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const canvasRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<() => void>(() => {});
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Redirect guard (after all hooks) ─────────────────────────────
  if (currentProjectId !== 'general') return <Navigate to="/project" replace />;

  const stages = allStages.filter(st => st.projectId === 'general');
  const stageMap = new Map(stages.map(st => [st.id, st]));
  const jobs = apartments.filter(a => !a.isUnnamed && a.buildingId === 'G');

  // ── Position helpers ──────────────────────────────────────────────
  function jobPos(job: Apartment, index: number): { x: number; y: number } {
    if (drag?.kind === 'job' && drag.ids.includes(job.id)) {
      const s = drag.starts.get(job.id)!;
      return { x: s.x + drag.dx, y: s.y + drag.dy };
    }
    if (typeof job.canvasX === 'number' && typeof job.canvasY === 'number') return { x: job.canvasX, y: job.canvasY };
    return defaultPos(index);
  }

  function elPos(el: CanvasElement): { x: number; y: number; w: number; h: number } {
    if (drag?.kind === 'element' && drag.ids.includes(el.id)) {
      const st = drag.starts.get(el.id)!;
      return { x: st.x + drag.dx, y: st.y + drag.dy, w: el.w, h: el.h };
    }
    if (resize?.id === el.id) {
      const newW = Math.max(120, el.w + (resize.startPX - resize.startPX)); // updated live in handler
      return { x: el.x, y: el.y, w: newW, h: el.h };
    }
    return { x: el.x, y: el.y, w: el.w, h: el.h };
  }

  // ── Delete / duplicate ────────────────────────────────────────────
  function handleDeleteJobs(ids: string[]) {
    if (!window.confirm(s.deleteJobConfirm)) return;
    ids.forEach(id => {
      if (selectedJob?.id === id) setSelectedJob(null);
      deleteApartment(id);
    });
    setSelectedJobIds(new Set());
    setCtxMenu(null);
  }

  function handleDeleteEls(ids: string[]) {
    if (!window.confirm('Delete selected items?')) return;
    ids.forEach(id => deleteCanvasElement(id));
    setSelectedElIds(new Set());
    setCtxMenu(null);
  }

  function handleDuplicateJobs(ids: string[]) {
    const now = new Date().toISOString();
    ids.forEach((id, idx) => {
      const orig = jobs.find(j => j.id === id);
      if (!orig) return;
      const origIdx = jobs.findIndex(j => j.id === id);
      const base = jobPos(orig, origIdx);
      addApartment({
        ...orig,
        id: genId('G'),
        displayName: orig.displayName ? `${orig.displayName} (copy)` : '',
        canvasX: base.x + 25,
        canvasY: base.y + 25,
        createdAt: now,
        updatedAt: now,
        updatedBy: currentUser?.id ?? '',
        updatedByName: currentUser?.name ?? '',
      });
    });
    setSelectedJobIds(new Set());
    setCtxMenu(null);
  }

  function handleDuplicateEls(ids: string[]) {
    ids.forEach(id => {
      const orig = canvasElements.find(e => e.id === id);
      if (!orig) return;
      addCanvasElement({ ...orig, id: genId('CE'), x: orig.x + 25, y: orig.y + 25 });
    });
    setSelectedElIds(new Set());
    setCtxMenu(null);
  }

  // ── Color change ──────────────────────────────────────────────────
  function applyTileColor(ids: string[], color: string | undefined) {
    if (currentUser) ids.forEach(id => updateApartment(id, { tileColor: color }, currentUser));
    setColorPicker(null);
    setCtxMenu(null);
  }

  function applyElColor(ids: string[], color: string) {
    ids.forEach(id => updateCanvasElement(id, { color }));
    setColorPicker(null);
    setCtxMenu(null);
  }

  // ── Delete key ────────────────────────────────────────────────────
  deleteRef.current = () => {
    if (selectedJobIds.size > 0) handleDeleteJobs([...selectedJobIds]);
    else if (selectedElIds.size > 0) handleDeleteEls([...selectedElIds]);
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') deleteRef.current();
      if (e.key === 'Escape') { setSelectedJobIds(new Set()); setSelectedElIds(new Set()); setCtxMenu(null); setColorPicker(null); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── Canvas element creation ───────────────────────────────────────
  function addNote() {
    const el: CanvasElement = {
      id: genId('CE'),
      type: 'note',
      x: GAP + Math.random() * 200,
      y: GAP + Math.random() * 150,
      w: 165,
      h: 150,
      text: 'Note',
      color: NOTE_PALETTE[0],
    };
    addCanvasElement(el);
  }

  function addBox() {
    const el: CanvasElement = {
      id: genId('CE'),
      type: 'box',
      x: GAP + Math.random() * 100,
      y: GAP + Math.random() * 100,
      w: 320,
      h: 220,
      text: 'Section',
      color: BOX_PALETTE[0],
    };
    addCanvasElement(el);
  }

  // ── Job drag ──────────────────────────────────────────────────────
  function onJobPointerDown(e: React.PointerEvent, job: Apartment, index: number) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    e.stopPropagation();
    setCtxMenu(null); setColorPicker(null);

    const rect = canvasRef.current!.getBoundingClientRect();
    const grabX = e.clientX - rect.left;
    const grabY = e.clientY - rect.top;

    if (e.ctrlKey || e.metaKey) {
      setSelectedJobIds(prev => { const n = new Set(prev); n.has(job.id) ? n.delete(job.id) : n.add(job.id); return n; });
      return;
    }

    const idsToMove = selectedJobIds.has(job.id) && selectedJobIds.size > 1
      ? [...selectedJobIds]
      : [job.id];
    if (!selectedJobIds.has(job.id)) { setSelectedJobIds(new Set([job.id])); setSelectedElIds(new Set()); }

    const starts = new Map<string, { x: number; y: number }>();
    jobs.forEach((j, i) => {
      if (idsToMove.includes(j.id)) {
        starts.set(j.id, typeof j.canvasX === 'number' && typeof j.canvasY === 'number'
          ? { x: j.canvasX, y: j.canvasY }
          : defaultPos(i));
      }
    });

    setDrag({ kind: 'job', ids: idsToMove, starts, grabX, grabY, dx: 0, dy: 0, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onJobPointerMove(e: React.PointerEvent) {
    if (!drag || drag.kind !== 'job') return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const dx = e.clientX - rect.left - drag.grabX;
    const dy = e.clientY - rect.top - drag.grabY;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4 });
  }

  function onJobPointerUp(job: Apartment) {
    if (!drag || drag.kind !== 'job') return;
    if (drag.moved) {
      if (currentUser) drag.ids.forEach(id => {
        const st = drag.starts.get(id)!;
        updateApartment(id, { canvasX: Math.max(0, Math.round(st.x + drag.dx)), canvasY: Math.max(0, Math.round(st.y + drag.dy)) }, currentUser);
      });
    } else if (drag.ids.length === 1 && drag.ids[0] === job.id) {
      setSelectedJobIds(new Set()); setSelectedJob(job);
    }
    setDrag(null);
  }

  function onJobContextMenu(e: React.MouseEvent, job: Apartment) {
    e.preventDefault(); e.stopPropagation();
    const ids = selectedJobIds.has(job.id) && selectedJobIds.size > 1 ? [...selectedJobIds] : [job.id];
    if (!selectedJobIds.has(job.id)) setSelectedJobIds(new Set([job.id]));
    setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'job', ids });
  }

  // ── Element drag ──────────────────────────────────────────────────
  function onElPointerDown(e: React.PointerEvent, el: CanvasElement) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-el-action]')) return;
    e.stopPropagation();
    setCtxMenu(null); setColorPicker(null);

    const rect = canvasRef.current!.getBoundingClientRect();
    const grabX = e.clientX - rect.left;
    const grabY = e.clientY - rect.top;

    if (e.ctrlKey || e.metaKey) {
      setSelectedElIds(prev => { const n = new Set(prev); n.has(el.id) ? n.delete(el.id) : n.add(el.id); return n; });
      return;
    }

    const idsToMove = selectedElIds.has(el.id) && selectedElIds.size > 1 ? [...selectedElIds] : [el.id];
    if (!selectedElIds.has(el.id)) { setSelectedElIds(new Set([el.id])); setSelectedJobIds(new Set()); }

    const starts = new Map<string, { x: number; y: number }>();
    canvasElements.forEach(elem => {
      if (idsToMove.includes(elem.id)) starts.set(elem.id, { x: elem.x, y: elem.y });
    });

    setDrag({ kind: 'element', ids: idsToMove, starts, grabX, grabY, dx: 0, dy: 0, moved: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onElPointerMove(e: React.PointerEvent) {
    if (!drag || drag.kind !== 'element') return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const dx = e.clientX - rect.left - drag.grabX;
    const dy = e.clientY - rect.top - drag.grabY;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4 });
  }

  function onElPointerUp(el: CanvasElement) {
    if (!drag || drag.kind !== 'element') return;
    if (drag.moved) {
      drag.ids.forEach(id => {
        const st = drag.starts.get(id)!;
        updateCanvasElement(id, { x: Math.max(0, Math.round(st.x + drag.dx)), y: Math.max(0, Math.round(st.y + drag.dy)) });
      });
    }
    setDrag(null);
  }

  function onElContextMenu(e: React.MouseEvent, el: CanvasElement) {
    e.preventDefault(); e.stopPropagation();
    const ids = selectedElIds.has(el.id) && selectedElIds.size > 1 ? [...selectedElIds] : [el.id];
    if (!selectedElIds.has(el.id)) setSelectedElIds(new Set([el.id]));
    setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'element', ids });
  }

  // ── Box resize ────────────────────────────────────────────────────
  function onResizePointerDown(e: React.PointerEvent, el: CanvasElement) {
    e.stopPropagation(); e.preventDefault();
    setResize({ id: el.id, startW: el.w, startH: el.h, startPX: e.clientX, startPY: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onResizePointerMove(e: React.PointerEvent) {
    if (!resize) return;
    const dw = e.clientX - resize.startPX;
    const dh = e.clientY - resize.startPY;
    updateCanvasElement(resize.id, {
      w: Math.max(120, resize.startW + dw),
      h: Math.max(80, resize.startH + dh),
    });
  }

  function onResizePointerUp() {
    setResize(null);
  }

  // ── Lasso ─────────────────────────────────────────────────────────
  function onCanvasPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element) !== canvasRef.current) return;
    setCtxMenu(null); setColorPicker(null);
    setSelectedJobIds(new Set()); setSelectedElIds(new Set());
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
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
      const newJobs = new Set<string>();
      const newEls = new Set<string>();
      jobs.forEach((job, i) => {
        const p = jobPos(job, i);
        if (p.x < maxX && p.x + TILE_W > minX && p.y < maxY && p.y + TILE_H > minY) newJobs.add(job.id);
      });
      canvasElements.forEach(el => {
        if (el.x < maxX && el.x + el.w > minX && el.y < maxY && el.y + el.h > minY) newEls.add(el.id);
      });
      setSelectedJobIds(newJobs);
      setSelectedElIds(newEls);
    }
    setLasso(null);
  }

  // ── Start text edit for element ───────────────────────────────────
  function startEdit(el: CanvasElement) {
    setEditingEl(el.id);
    setEditText(el.text);
    setTimeout(() => editInputRef.current?.focus(), 30);
  }

  function commitEdit() {
    if (editingEl) updateCanvasElement(editingEl, { text: editText });
    setEditingEl(null);
  }

  // ── Canvas size ───────────────────────────────────────────────────
  let maxX = 700, maxY = 500;
  jobs.forEach((job, i) => { const p = jobPos(job, i); maxX = Math.max(maxX, p.x + TILE_W + GAP); maxY = Math.max(maxY, p.y + TILE_H + GAP); });
  canvasElements.forEach(el => { maxX = Math.max(maxX, el.x + el.w + GAP); maxY = Math.max(maxY, el.y + el.h + GAP); });

  const totalSelected = selectedJobIds.size + selectedElIds.size;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-gray-50">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <Briefcase size={20} className="text-[#1e3a5f]" />
          <h1 className="text-xl font-bold text-gray-900">{s.generalJobsTitle}</h1>
          {jobs.length > 0 && (
            <span className="text-xs font-medium bg-gray-200 text-gray-600 rounded-full px-2 py-0.5">{jobs.length}</span>
          )}
          {totalSelected > 0 && (
            <span className="text-xs font-medium bg-[#4aa8d8]/20 text-[#1e3a5f] rounded-full px-2 py-0.5">
              {totalSelected} selected
            </span>
          )}
        </div>

        {/* Tool buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={addNote}
            title="Add sticky note"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-yellow-50 hover:border-yellow-300 hover:text-yellow-700 transition-all"
          >
            <StickyNote size={15} /> Note
          </button>
          <button
            onClick={addBox}
            title="Add section box"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all"
          >
            <Square size={15} /> Box
          </button>
          <div className="w-px h-6 bg-gray-200" />
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 shadow-sm"
            style={{ background: 'linear-gradient(135deg, #1e3a5f, #2d5a8e)' }}
          >
            <Plus size={16} /> {s.addJobBtn}
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="flex-1 overflow-auto min-h-0">
        {jobs.length === 0 && canvasElements.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 select-none">
            <Briefcase size={56} className="mb-4 opacity-25" />
            <p className="text-sm">{s.noJobsYet}</p>
            <p className="text-xs mt-1 opacity-70">Use Note and Box buttons to organize your canvas</p>
          </div>
        ) : (
          <div
            ref={canvasRef}
            className="relative"
            style={{
              width: maxX, height: maxY, minWidth: '100%', minHeight: '100%',
              backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              userSelect: 'none',
            }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }}
          >
            {/* Lasso box */}
            {lasso && (Math.abs(lasso.ex - lasso.sx) > 4 || Math.abs(lasso.ey - lasso.sy) > 4) && (
              <div
                className="absolute pointer-events-none z-30 rounded"
                style={{
                  left: Math.min(lasso.sx, lasso.ex), top: Math.min(lasso.sy, lasso.ey),
                  width: Math.abs(lasso.ex - lasso.sx), height: Math.abs(lasso.ey - lasso.sy),
                  border: '2px solid #4aa8d8', backgroundColor: 'rgba(74,168,216,0.08)',
                }}
              />
            )}

            {/* ── Canvas elements (notes & boxes) ── */}
            {canvasElements.map(el => {
              const pos = elPos(el);
              const isSelected = selectedElIds.has(el.id);
              const isDragging = drag?.kind === 'element' && drag.ids.includes(el.id) && drag.moved;
              const isEditing = editingEl === el.id;

              return (
                <div
                  key={el.id}
                  onPointerDown={e => onElPointerDown(e, el)}
                  onPointerMove={onElPointerMove}
                  onPointerUp={() => onElPointerUp(el)}
                  onContextMenu={e => onElContextMenu(e, el)}
                  onDoubleClick={() => startEdit(el)}
                  className={`absolute rounded-xl select-none ${
                    el.type === 'box' ? 'border-2' : 'shadow-md border'
                  } ${
                    isDragging ? 'cursor-grabbing z-20' :
                    isSelected ? 'cursor-grab z-10' : 'cursor-grab'
                  }`}
                  style={{
                    left: pos.x, top: pos.y, width: pos.w, height: pos.h,
                    backgroundColor: el.color,
                    borderColor: isSelected ? '#4aa8d8' : el.type === 'box' ? el.color.replace('0.45', '0.8') : 'rgba(0,0,0,0.1)',
                    outline: isSelected && !isDragging ? '2px solid rgba(74,168,216,0.5)' : undefined,
                    outlineOffset: '2px',
                    touchAction: 'none',
                    zIndex: el.type === 'box' ? 1 : 5,
                  }}
                >
                  {/* Element actions (always visible on selected, hover otherwise) */}
                  <div className={`absolute top-1.5 right-1.5 flex gap-1 ${isSelected ? 'opacity-100' : 'opacity-0 hover:opacity-100'} group-hover:opacity-100 transition-opacity`}
                    style={{ pointerEvents: 'auto' }}>
                    <button
                      data-el-action
                      onClick={e => { e.stopPropagation(); setColorPicker({ x: e.clientX, y: e.clientY, kind: 'element', ids: [el.id] }); }}
                      className="p-1 rounded-md bg-white/70 hover:bg-white text-gray-500 hover:text-gray-700 transition-all"
                    >
                      <Palette size={11} />
                    </button>
                    <button
                      data-el-action
                      onClick={e => { e.stopPropagation(); startEdit(el); }}
                      className="p-1 rounded-md bg-white/70 hover:bg-white text-gray-500 hover:text-gray-700 transition-all"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      data-el-action
                      onClick={e => { e.stopPropagation(); deleteCanvasElement(el.id); }}
                      className="p-1 rounded-md bg-white/70 hover:bg-red-100 text-gray-400 hover:text-red-500 transition-all"
                    >
                      <X size={11} />
                    </button>
                  </div>

                  {/* Text content */}
                  {isEditing ? (
                    <textarea
                      ref={editInputRef}
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e => { if (e.key === 'Escape') { setEditingEl(null); } if (e.key === 'Enter' && e.metaKey) commitEdit(); }}
                      className="absolute inset-0 w-full h-full bg-transparent border-none outline-none resize-none p-2.5 text-sm"
                      style={{ paddingTop: el.type === 'box' ? '8px' : '32px', zIndex: 20 }}
                    />
                  ) : (
                    <div
                      className={`${el.type === 'box' ? 'font-semibold text-sm pt-2 px-3' : 'text-sm pt-8 px-3'} text-gray-700 leading-snug whitespace-pre-wrap break-words`}
                      style={{ maxHeight: '100%', overflow: 'hidden' }}
                    >
                      {el.text || <span className="italic text-gray-400">Double-click to edit</span>}
                    </div>
                  )}

                  {/* Box title bar */}
                  {el.type === 'box' && !isEditing && (
                    <div
                      className="absolute top-0 left-0 right-0 px-3 py-1.5 font-semibold text-sm text-gray-700 rounded-t-xl cursor-grab"
                      style={{ backgroundColor: el.color.replace('0.45', '0.7') }}
                    >
                      {el.text}
                    </div>
                  )}

                  {/* Resize handle (bottom-right corner) */}
                  {el.type === 'box' && (
                    <div
                      data-el-action
                      onPointerDown={e => onResizePointerDown(e, el)}
                      onPointerMove={onResizePointerMove}
                      onPointerUp={onResizePointerUp}
                      className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize opacity-30 hover:opacity-80 transition-opacity"
                      style={{ borderRight: '2px solid #6b7280', borderBottom: '2px solid #6b7280', borderRadius: '0 0 4px 0' }}
                    />
                  )}
                </div>
              );
            })}

            {/* ── Job tiles ── */}
            {jobs.map((job, i) => {
              const pos = jobPos(job, i);
              const stage = job.currentStageId ? stageMap.get(job.currentStageId) : null;
              const pendingTasks = contractorAssignments.filter(a => a.apartmentId === job.id && !a.completedAt).length;
              const isDragging = drag?.kind === 'job' && drag.ids.includes(job.id) && drag.moved;
              const isSelected = selectedJobIds.has(job.id);
              const tilePalette = TILE_PALETTE.find(p => p.bg === job.tileColor) ?? TILE_PALETTE[0];

              return (
                <div
                  key={job.id}
                  onPointerDown={e => onJobPointerDown(e, job, i)}
                  onPointerMove={onJobPointerMove}
                  onPointerUp={() => onJobPointerUp(job)}
                  onContextMenu={e => onJobContextMenu(e, job)}
                  className={`absolute rounded-xl border p-3 group select-none ${
                    isDragging ? 'shadow-2xl cursor-grabbing z-20' :
                    isSelected ? 'shadow-md cursor-grab z-10' : 'shadow-sm hover:shadow-md cursor-grab z-5'
                  }`}
                  style={{
                    left: pos.x, top: pos.y, width: TILE_W, height: TILE_H,
                    touchAction: 'none',
                    backgroundColor: job.tileColor ?? '#ffffff',
                    borderColor: isSelected ? '#4aa8d8' : tilePalette.border,
                    outline: isSelected && !isDragging ? '2px solid rgba(74,168,216,0.4)' : undefined,
                    outlineOffset: '1px',
                    zIndex: isDragging ? 20 : isSelected ? 10 : 5,
                  }}
                >
                  {/* Hover delete */}
                  <button
                    data-no-drag
                    onClick={() => handleDeleteJobs([job.id])}
                    className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50/80 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>

                  {/* Name */}
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

                  {/* Link + task row */}
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center gap-3">
                    {job.zohoLink && (
                      <a data-no-drag
                        href={job.zohoLink.startsWith('http') ? job.zohoLink : `https://${job.zohoLink}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-[11px] text-[#4aa8d8] hover:underline flex items-center gap-1"
                      >
                        <ExternalLink size={10} /> Zoho
                      </a>
                    )}
                    {job.driveLink && (
                      <a data-no-drag
                        href={job.driveLink.startsWith('http') ? job.driveLink : `https://${job.driveLink}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-[11px] text-[#4aa8d8] hover:underline flex items-center gap-1"
                      >
                        <FolderOpen size={10} /> Drive
                      </a>
                    )}
                    {pendingTasks > 0 && (
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                        <ClipboardList size={11} /> {pendingTasks}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right-click context menu ── */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[170px]"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            {ctxMenu.kind === 'job' ? (
              <>
                <button onClick={() => handleDuplicateJobs(ctxMenu.ids)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Copy size={14} className="text-gray-400" />
                  {ctxMenu.ids.length > 1 ? `Duplicate (${ctxMenu.ids.length})` : 'Duplicate'}
                </button>
                <button onClick={e => { setColorPicker({ x: ctxMenu.x + 170, y: ctxMenu.y, kind: 'job', ids: ctxMenu.ids }); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Palette size={14} className="text-gray-400" /> Change Color
                </button>
                <div className="h-px bg-gray-100 my-1" />
                <button onClick={() => handleDeleteJobs(ctxMenu.ids)}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5">
                  <Trash2 size={14} />
                  {ctxMenu.ids.length > 1 ? `Delete (${ctxMenu.ids.length})` : 'Delete'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { const el = canvasElements.find(e => e.id === ctxMenu.ids[0]); if (el) startEdit(el); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Pencil size={14} className="text-gray-400" /> Edit Text
                </button>
                <button onClick={e => { setColorPicker({ x: ctxMenu.x + 170, y: ctxMenu.y, kind: 'element', ids: ctxMenu.ids }); setCtxMenu(null); }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Palette size={14} className="text-gray-400" /> Change Color
                </button>
                <button onClick={() => handleDuplicateEls(ctxMenu.ids)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2.5">
                  <Copy size={14} className="text-gray-400" />
                  {ctxMenu.ids.length > 1 ? `Duplicate (${ctxMenu.ids.length})` : 'Duplicate'}
                </button>
                <div className="h-px bg-gray-100 my-1" />
                <button onClick={() => handleDeleteEls(ctxMenu.ids)}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5">
                  <Trash2 size={14} />
                  {ctxMenu.ids.length > 1 ? `Delete (${ctxMenu.ids.length})` : 'Delete'}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* ── Color picker popup ── */}
      {colorPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setColorPicker(null)} />
          <div className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-3"
            style={{ left: Math.min(colorPicker.x, window.innerWidth - 200), top: colorPicker.y }}>
            <p className="text-[11px] font-medium text-gray-500 mb-2">Choose color</p>
            <div className="flex flex-wrap gap-2" style={{ width: 168 }}>
              {(colorPicker.kind === 'job' ? TILE_PALETTE : (colorPicker.kind === 'element' ?
                (canvasElements.find(e => e.id === colorPicker.ids[0])?.type === 'note' ? NOTE_PALETTE : BOX_PALETTE).map(c => c)
                : NOTE_PALETTE
              )).map((c, i) => {
                const isObj = typeof c === 'object' && c !== null && 'bg' in (c as object);
                const color = isObj ? (c as typeof TILE_PALETTE[0]).bg : c as string;
                const label = isObj ? (c as typeof TILE_PALETTE[0]).label : '';
                return (
                  <button
                    key={i}
                    title={label}
                    onClick={() => colorPicker.kind === 'job'
                      ? applyTileColor(colorPicker.ids, i === 0 ? undefined : color)
                      : applyElColor(colorPicker.ids, color)}
                    className="w-8 h-8 rounded-lg border-2 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color, borderColor: 'rgba(0,0,0,0.15)' }}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Add Job modal ── */}
      {showAddModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowAddModal(false)} />
          <div className="fixed z-50 bg-white rounded-2xl shadow-2xl p-6"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, 92vw)' }}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{s.addJobBtn}</h2>
            <form onSubmit={e => {
              e.preventDefault();
              const now = new Date().toISOString();
              const id = genId('G');
              const pos = defaultPos(jobs.length);
              addApartment({
                id, buildingId: 'G', apartmentNumber: '',
                displayName: jobName.trim(), floor: 0, colPosition: 1, colSpan: 1,
                isDuplexApt: false, currentStageId: null, classification: 'standard',
                shinuiDetails: null, generalNotes: '', isUnnamed: false,
                address: jobAddress.trim() || undefined,
                zohoLink: jobZoho.trim() || undefined,
                driveLink: jobDrive.trim() || undefined,
                canvasX: pos.x, canvasY: pos.y,
                createdAt: now, updatedAt: now,
                updatedBy: currentUser?.id ?? '', updatedByName: currentUser?.name ?? '',
              });
              setJobName(''); setJobAddress(''); setJobZoho(''); setJobDrive('');
              setShowAddModal(false);
            }} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{s.jobNameLabel}</label>
                <input autoFocus value={jobName} onChange={e => setJobName(e.target.value)}
                  placeholder={s.jobNameLabel}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{s.addressLabel}</label>
                <input value={jobAddress} onChange={e => setJobAddress(e.target.value)}
                  placeholder={s.addressLabel}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{s.zohoLinkLabel}</label>
                <input value={jobZoho} onChange={e => setJobZoho(e.target.value)}
                  placeholder="https://crm.zoho.com/..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{s.driveFolder}</label>
                <input value={jobDrive} onChange={e => setJobDrive(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
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

      {/* ── Detail drawer ── */}
      {selectedJob && currentUser && (
        <ApartmentDetailDrawer
          apartment={selectedJob}
          onClose={() => setSelectedJob(null)}
          currentUser={currentUser}
          onToast={msg => setToast(msg)}
          onRequestAddTask={(apt) => { setSelectedJob(null); setAddTaskJob(apt); }}
        />
      )}

      {addTaskJob && currentUser && (
        <QuickAddTaskPanel
          apartment={addTaskJob}
          onClose={() => setAddTaskJob(null)}
          currentUser={currentUser}
          onToast={msg => setToast(msg)}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
