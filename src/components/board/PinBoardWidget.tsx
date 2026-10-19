import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { CanvasElement, Apartment, Stage, aptLabel, projectColor, projectShortName } from '../../types';
import { useStore, loadProjectSnapshot } from '../../data/store';
import type { WidgetCtx } from '../../data/widgets';
import {
  registerPinBoard, pinBoardAt, onPinHover, setPinHover, rotaCellAt, setRotaHover,
  askRotaDrop, boardDropAt,
} from '../../data/rotaDrop';
import { placeJobsOnPlanner, showDragGhost, hideDragGhost } from '../../data/plannerDrop';
import { useBoardTrack } from '../../data/useBoardUndo';

/**
 * THE PIN BOARD — the owner's "board where I can pin jobs on… like a
 * whiteboard or a pin board, in a fun handwriting way" (2026-10-13).
 *
 * A cork (or white, or chalk) board with a handwritten title. A job dragged
 * onto it — a tile off the board, a row out of any list, a search result —
 * is PINNED where the hand let go: a paper card with a pushpin, a little
 * crooked, and the tile leaves the board the way it leaves for the notebook
 * (`inNotebook` = this board's id), so one job is never in two places. Drag a
 * pinned card to move it about; drag it OFF the cork and it lands wherever it
 * was let go — the board, another pin board, a notebook day. Its × takes it
 * off and the tile comes back to where it stood. A handwritten note can be
 * pinned too ("waiting for the permit").
 *
 * A job from ANOTHER workspace is pinned as a pointer (it stays put over
 * there, the unit-card rule) and opens by travelling to it.
 *
 * Positions are FRACTIONS of the cork, so the board can be any size and the
 * pins keep their arrangement.
 */

export interface PinItem {
  id: string;
  /** A pinned job… */
  jobId?: string;
  /** …from another workspace, when set. */
  projectId?: string;
  /** …or a handwritten note. */
  text?: string;
  /** Centre of the card, as a fraction of the cork. */
  x: number;
  y: number;
  /** A few degrees either way — pinned by a hand, not a printer. */
  rot: number;
  at?: string;
}

type Look = 'cork' | 'white' | 'chalk';

const LOOKS: Record<Look, {
  ground: React.CSSProperties; frame: string; ink: string; hint: string;
}> = {
  cork: {
    ground: {
      backgroundColor: '#c99a62',
      backgroundImage:
        'radial-gradient(circle at 20% 30%, rgba(120,72,30,.35) 1.2px, transparent 1.6px),'
        + 'radial-gradient(circle at 70% 60%, rgba(255,236,200,.35) 1px, transparent 1.5px),'
        + 'radial-gradient(circle at 45% 80%, rgba(90,52,20,.3) 1.4px, transparent 1.8px)',
      backgroundSize: '9px 9px, 13px 13px, 17px 17px',
    },
    frame: '#7c4a1e', ink: '#1f2937', hint: 'rgba(60,35,12,.55)',
  },
  white: {
    ground: {
      backgroundColor: '#fbfcfd',
      backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,.9), rgba(226,232,240,.35))',
    },
    frame: '#94a3b8', ink: '#1d4ed8', hint: 'rgba(30,58,138,.35)',
  },
  chalk: {
    ground: {
      backgroundColor: '#24473a',
      backgroundImage: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,.07), transparent 60%)',
    },
    frame: '#6b4423', ink: '#f8fafc', hint: 'rgba(248,250,252,.45)',
  },
};

/** Latin handwriting, with a Hebrew-capable hand behind it per glyph. */
export const HANDWRITING = "'Caveat', 'Amatic SC', 'Segoe Print', 'Bradley Hand', cursive";

const CARD_W = 138;
const PIN_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#9333ea'];
const NOTE_PAPER = '#fef08a';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number, pad = 0.06) => Math.min(1 - pad, Math.max(pad, v));
const newId = () => `PN-${Math.random().toString(36).slice(2, 9)}`;
const pinColorOf = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PIN_COLORS[Math.abs(h) % PIN_COLORS.length];
};

function pinsOf(el: CanvasElement | undefined): PinItem[] {
  const p = (el?.data as { pins?: unknown } | undefined)?.pins;
  return Array.isArray(p) ? (p as PinItem[]) : [];
}

/**
 * Pin jobs onto a board at a cork fraction. Writes the board and marks each
 * local job as held here — the notebook's rule, so the tile leaves the board
 * and comes back when the pin does. A job already held by a NOTEBOOK keeps
 * that holder (unpinning must not pull it out of the week too).
 */
/**
 * `hold: false` pins the job WITHOUT taking it off the board — used when the
 * hand carried a job's SECOND tile in: that tile becomes the pin, and the job's
 * own tile stays where it was (owner, 2026-10-19).
 */
function pinJobs(elId: string, ids: string[], at: { x: number; y: number }, projectId?: string, hold = true): number {
  const st = useStore.getState();
  const el = st.canvasElements.find(e => e.id === elId);
  if (!el) return 0;
  const foreign = !!projectId && projectId !== st.currentProjectId;
  const pins = [...pinsOf(el)];
  let n = 0;
  ids.forEach((jobId, i) => {
    if (!foreign && !st.apartments.some(a => a.id === jobId)) return;
    const x = clamp01(at.x + i * 0.05), y = clamp01(at.y + i * 0.06, 0.1);
    const same = pins.findIndex(p => p.jobId === jobId && (p.projectId ?? '') === (foreign ? projectId : ''));
    if (same >= 0) pins[same] = { ...pins[same], x, y };
    else pins.push({
      id: newId(), jobId, x, y, rot: Math.round(rnd(-5, 5) * 10) / 10,
      at: new Date().toISOString(), ...(foreign ? { projectId } : {}),
    });
    n++;
  });
  if (!n) return 0;
  st.updateCanvasElement(el.id, { data: { ...(el.data ?? {}), pins } });
  const user = st.currentUser;
  if (user && !foreign && hold) {
    for (const jobId of ids) {
      const j = st.apartments.find(a => a.id === jobId);
      if (!j) continue;
      const holder = j.inNotebook ? st.canvasElements.find(e => e.id === j.inNotebook) : undefined;
      if (holder && holder.widget !== 'pin-board') continue;
      if (j.inNotebook === el.id && !j.boardBin) continue;
      st.updateApartment(jobId, { inNotebook: el.id, boardBin: undefined, binnedAt: undefined }, user);
    }
  }
  return n;
}

/** Take a pin off; a job this board was holding goes back on the board. */
function unpin(elId: string, pinId: string, release = true) {
  const st = useStore.getState();
  const el = st.canvasElements.find(e => e.id === elId);
  if (!el) return;
  const pin = pinsOf(el).find(p => p.id === pinId);
  st.updateCanvasElement(el.id, { data: { ...(el.data ?? {}), pins: pinsOf(el).filter(p => p.id !== pinId) } });
  if (release && pin?.jobId && !pin.projectId && st.currentUser) {
    const j = st.apartments.find(a => a.id === pin.jobId);
    if (j?.inNotebook === el.id) st.updateApartment(j.id, { inNotebook: undefined }, st.currentUser);
  }
}

interface Resolved {
  pin: PinItem;
  job?: Apartment;
  stage?: Stage;
  ws?: { name: string; color: string };
  open: number;
}

export function PinBoardWidget({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = (el.data ?? {}) as { title?: string; look?: Look; sample?: unknown };
  const look = LOOKS[(data.look as Look) in LOOKS ? (data.look as Look) : 'cork'];
  const sample = !!data.sample;
  const editable = !c.readOnly && !sample;
  const title = (data.title ?? '').trim() || (c.isRtl ? 'לוח נעיצות' : 'Pin board');

  const live = useStore(st => st.apartments);
  const stages = useStore(st => st.stages);
  const projects = useStore(st => st.projects);
  const currentProjectId = useStore(st => st.currentProjectId);
  const tick = useStore(st => st.snapshotTick);
  const track = useBoardTrack();

  const corkRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef(`pinboard-${Math.random().toString(36).slice(2, 8)}`);
  const [lit, setLit] = useState(false);
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<{ id: string; text: string } | null>(null);
  const [moving, setMoving] = useState<{ id: string; dx: number; dy: number; outside: boolean } | null>(null);
  const press = useRef<{ id: string; x: number; y: number; scale: number; live: boolean } | null>(null);

  const pins = sample ? SAMPLE_PINS : pinsOf(el);

  const resolved: Resolved[] = useMemo(() => pins.flatMap((pin): Resolved[] => {
    if (pin.text != null && !pin.jobId) return [{ pin, open: 0 }];
    if (sample) {
      const s = SAMPLE_JOBS[pin.jobId ?? ''];
      return s ? [{ pin, job: s.job, stage: s.stage, open: s.open }] : [];
    }
    if (pin.projectId && pin.projectId !== currentProjectId) {
      const snap = loadProjectSnapshot(pin.projectId);
      const job = snap.apartments.find(a => a.id === pin.jobId);
      const stage = job?.currentStageId ? snap.stages.find(s => s.id === job.currentStageId) : undefined;
      const p = projects.find(pp => pp.id === pin.projectId);
      return [{
        pin, job, stage, open: 0,
        ws: { name: p ? projectShortName(p, !!c.isRtl) : pin.projectId, color: projectColor(projects, pin.projectId) || '#7c3aed' },
      }];
    }
    const job = live.find(a => a.id === pin.jobId);
    if (!job || job.boardBin === 'trash') return [];
    const stage = job.currentStageId ? stages.find(s => s.id === job.currentStageId) : undefined;
    const open = c.assignments.filter(a => a.apartmentId === job.id && !a.completedAt).length;
    return [{ pin, job, stage, open }];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pins, live, stages, projects, currentProjectId, tick, c.assignments, sample, c.isRtl]);

  // The drop probe — only a board that can be written to takes drops.
  useEffect(() => {
    if (!editable) return;
    const key = keyRef.current;
    return registerPinBoard(key, (x, y) => {
      const node = corkRef.current;
      if (!node) return null;
      const r = node.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
      if (!document.elementsFromPoint(x, y).includes(node)) return null;
      const at = { x: (x - r.left) / r.width, y: (y - r.top) / r.height };
      return {
        key, elId: el.id,
        place: (ids, projectId, opts) => {
          const n = pinJobs(el.id, ids, at, projectId, opts?.hold !== false);
          if (!n) return null;
          return n === 1 ? 'Pinned' : `${n} pinned`;
        },
      };
    });
  }, [editable, el.id]);

  useEffect(() => onPinHover(k => setLit(k === keyRef.current)), []);

  // ── Moving a pin, and carrying it off the cork ──────────────────────────
  const scaleOf = () => {
    const n = corkRef.current;
    return n && n.offsetWidth ? n.getBoundingClientRect().width / n.offsetWidth : 1;
  };
  const outsideCork = (x: number, y: number) => {
    const r = corkRef.current?.getBoundingClientRect();
    return !r || x < r.left || x > r.right || y < r.top || y > r.bottom;
  };

  const onCardDown = (e: React.PointerEvent, pin: PinItem) => {
    e.stopPropagation();
    if (e.button !== 0 || editNote?.id === pin.id) return;
    press.current = { id: pin.id, x: e.clientX, y: e.clientY, scale: scaleOf(), live: false };
    if (editable) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onCardMove = (e: React.PointerEvent, r: Resolved) => {
    const p = press.current;
    if (!p || !editable) return;
    e.stopPropagation();
    if (!p.live && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
    p.live = true;
    const outside = outsideCork(e.clientX, e.clientY);
    setMoving({ id: p.id, dx: (e.clientX - p.x) / p.scale, dy: (e.clientY - p.y) / p.scale, outside });
    if (outside) {
      showDragGhost(r.job ? aptLabel(r.job) || 'Job' : (r.pin.text || 'Note'), e.clientX, e.clientY);
      if (r.job) {
        const cell = rotaCellAt(e.clientX, e.clientY);
        setRotaHover(cell);
        setPinHover(cell ? null : pinBoardAt(e.clientX, e.clientY, keyRef.current)?.key ?? null);
      }
    } else {
      hideDragGhost(); setRotaHover(null); setPinHover(null);
    }
  };
  const onCardUp = (e: React.PointerEvent, r: Resolved) => {
    const p = press.current;
    press.current = null;
    setMoving(null);
    hideDragGhost(); setRotaHover(null); setPinHover(null);
    if (!p) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!p.live) {
      // A motionless press is a click: open the job.
      if (sample || !r.job) return;
      if (r.pin.projectId && r.pin.projectId !== currentProjectId) c.openUnit?.(r.pin.projectId, r.job.id);
      else c.openJob(r.job.id);
      return;
    }
    const pin = r.pin;
    if (!outsideCork(e.clientX, e.clientY)) {
      const node = corkRef.current!;
      const rect = node.getBoundingClientRect();
      // Keep the grab offset: the card moves by the hand's travel, not to it.
      const fx = clamp01(pin.x + (e.clientX - p.x) / rect.width);
      const fy = clamp01(pin.y + (e.clientY - p.y) / rect.height, 0.1);
      track({ weight: 'arrange', label: 'Moved a pin' }, () => {
        const cur = useStore.getState().canvasElements.find(x2 => x2.id === el.id);
        useStore.getState().updateCanvasElement(el.id, {
          data: { ...(cur?.data ?? {}), pins: pinsOf(cur).map(q => q.id === pin.id ? { ...q, x: fx, y: fy } : q) },
        });
      });
      return;
    }
    // Carried OFF the cork. Notes stay put — a note belongs to its board.
    if (!r.job || !pin.jobId) return;
    const jobId = pin.jobId;
    const pid = pin.projectId && pin.projectId !== currentProjectId ? pin.projectId : undefined;
    const cell = rotaCellAt(e.clientX, e.clientY);
    if (cell) {
      // Released from the pin first, so a dialog cancelled half way leaves
      // the job on the board rather than nowhere.
      track({ weight: 'arrange', label: 'Took a pin off' }, () => unpin(el.id, pin.id));
      if (askRotaDrop(cell, jobId, pid)) return;
      placeJobsOnPlanner(cell, [jobId], pid);
      return;
    }
    const other = pinBoardAt(e.clientX, e.clientY, keyRef.current);
    if (other) {
      track({ weight: 'arrange', label: 'Moved a pin to another board' }, () => {
        unpin(el.id, pin.id, false);
        other.place([jobId], pid);
      });
      return;
    }
    const place = boardDropAt(e.clientX, e.clientY);
    if (place) {
      unpin(el.id, pin.id, false);
      place([jobId], pid);
    }
  };

  const removePin = (pin: PinItem) => {
    track({ weight: 'arrange', label: pin.jobId ? 'Took a pin off' : 'Removed a note' }, () => unpin(el.id, pin.id));
  };

  const addNote = () => {
    const pin: PinItem = { id: newId(), text: '', x: rnd(0.35, 0.65), y: rnd(0.4, 0.6), rot: Math.round(rnd(-4, 4) * 10) / 10, at: new Date().toISOString() };
    c.update({ data: { ...(el.data ?? {}), pins: [...pinsOf(el), pin] } });
    setEditNote({ id: pin.id, text: '' });
  };
  const saveNote = () => {
    if (!editNote) return;
    const text = editNote.text.trim();
    const cur = useStore.getState().canvasElements.find(x => x.id === el.id);
    const next = text
      ? pinsOf(cur).map(q => q.id === editNote.id ? { ...q, text } : q)
      : pinsOf(cur).filter(q => q.id !== editNote.id);
    track({ weight: 'content', label: 'Wrote on the pin board', explain: 'The note on the pin board goes back to what it said before.' },
      () => useStore.getState().updateCanvasElement(el.id, { data: { ...(cur?.data ?? {}), pins: next } }));
    setEditNote(null);
  };
  const saveTitle = () => {
    if (editTitle == null) return;
    c.update({ data: { ...(el.data ?? {}), title: editTitle.trim() } });
    setEditTitle(null);
  };

  const noDrag = { 'data-no-drag': '', 'data-el-action': '' } as Record<string, string>;

  return (
    <div className="w-full h-full rounded-xl p-[7px] select-none" data-pin-board={el.id}
      style={{ background: look.frame, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.18)' }}>
      <div ref={corkRef} data-pin-cork
        className="relative w-full h-full rounded-[7px] overflow-hidden"
        style={{
          ...look.ground,
          boxShadow: lit
            ? 'inset 0 0 0 3px #22c55e, inset 0 0 26px rgba(34,197,94,.35)'
            : 'inset 0 2px 8px rgba(0,0,0,.25)',
          transition: 'box-shadow 140ms ease',
        }}>
        {/* The title, in handwriting. Double-click to write it. */}
        <div className="absolute left-0 right-0 top-1 flex justify-center px-6 z-[2]">
          {editTitle != null ? (
            <input autoFocus value={editTitle} {...noDrag} data-enter-own dir="auto"
              onChange={e => setEditTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditTitle(null); e.stopPropagation(); }}
              onPointerDown={e => e.stopPropagation()}
              className="text-center bg-white/70 rounded-md outline-none px-2 w-full max-w-[90%]"
              style={{ fontFamily: HANDWRITING, fontSize: 30, fontWeight: 700, color: look.ink, lineHeight: 1.15 }}
              data-pin-title-input />
          ) : (
            <div {...noDrag} data-pin-title dir="auto"
              onDoubleClick={e => { if (!editable) return; e.stopPropagation(); setEditTitle(data.title ?? ''); }}
              title={editable ? 'Double-click to write the title' : undefined}
              className="truncate max-w-full"
              style={{ fontFamily: HANDWRITING, fontSize: 30, fontWeight: 700, color: look.ink, lineHeight: 1.15, transform: 'rotate(-1.2deg)' }}>
              {title}
            </div>
          )}
        </div>

        {resolved.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6 text-center"
            style={{ fontFamily: HANDWRITING, fontSize: 22, color: look.hint, paddingTop: 30 }}>
            {c.isRtl ? 'גררו עבודות לכאן כדי לנעוץ אותן' : 'Drag jobs here to pin them'}
          </div>
        )}

        {resolved.map(r => {
          const { pin } = r;
          const m = moving?.id === pin.id ? moving : null;
          const isNote = !r.job && pin.text != null;
          const editing = editNote?.id === pin.id;
          return (
            <div key={pin.id} {...noDrag}
              data-pin-card={pin.jobId ?? pin.id} data-pin-kind={isNote ? 'note' : 'job'}
              onPointerDown={e => onCardDown(e, pin)}
              onPointerMove={e => onCardMove(e, r)}
              onPointerUp={e => onCardUp(e, r)}
              onPointerCancel={() => { press.current = null; setMoving(null); hideDragGhost(); setRotaHover(null); setPinHover(null); }}
              onDoubleClick={e => { if (isNote && editable) { e.stopPropagation(); setEditNote({ id: pin.id, text: pin.text ?? '' }); } }}
              className="group/pin absolute"
              style={{
                left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, width: CARD_W,
                transform: `translate(-50%, -50%) translate(${m?.dx ?? 0}px, ${m?.dy ?? 0}px) rotate(${m ? 0 : pin.rot}deg)`,
                zIndex: m ? 30 : 3,
                opacity: m?.outside ? 0.35 : 1,
                cursor: editable ? (m ? 'grabbing' : 'grab') : 'pointer',
                touchAction: 'none',
                transition: m ? 'none' : 'transform 160ms ease',
              }}>
              {/* The pushpin. */}
              <span aria-hidden className="absolute left-1/2 -translate-x-1/2 -top-[7px] z-[2] w-[15px] h-[15px] rounded-full"
                style={{
                  background: `radial-gradient(circle at 35% 30%, #fff8 0 2px, ${pinColorOf(pin.id)} 3px)`,
                  boxShadow: '0 2px 3px rgba(0,0,0,.45)',
                }} />
              <div className="rounded-[3px] px-2.5 pt-3 pb-2"
                style={{
                  background: isNote ? NOTE_PAPER : '#ffffff',
                  boxShadow: m ? '0 14px 26px rgba(0,0,0,.35)' : '0 3px 7px rgba(0,0,0,.28)',
                  borderTop: !isNote && r.stage ? `4px solid ${r.stage.color}` : undefined,
                }}>
                {isNote ? (
                  editing ? (
                    <textarea autoFocus value={editNote!.text} rows={3} dir="auto"
                      onChange={e => setEditNote({ id: pin.id, text: e.target.value })}
                      onBlur={saveNote}
                      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') saveNote(); }}
                      onPointerDown={e => e.stopPropagation()}
                      className="w-full bg-transparent outline-none resize-none"
                      data-pin-note-input
                      style={{ fontFamily: HANDWRITING, fontSize: 22, lineHeight: 1.05, color: '#1f2937' }} />
                  ) : (
                    <div data-pin-note-text dir="auto" className="break-words whitespace-pre-wrap"
                      style={{ fontFamily: HANDWRITING, fontSize: 22, lineHeight: 1.05, color: '#1f2937', minHeight: 24 }}>
                      {pin.text || (c.isRtl ? 'כתבו כאן…' : 'Write here…')}
                    </div>
                  )
                ) : r.job ? (
                  <>
                    {r.ws && (
                      <div className="text-[8.5px] font-extrabold tracking-wide mb-0.5" style={{ color: r.ws.color }}>
                        {r.ws.name.toUpperCase()}
                      </div>
                    )}
                    <div className="font-bold text-[12.5px] leading-tight text-gray-900 break-words" data-pin-name>
                      {aptLabel(r.job) || r.job.displayName || 'Job'}
                    </div>
                    <div className="flex items-center gap-1 mt-1 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.stage?.color ?? '#cbd5e1' }} />
                      <span className="text-[10px] text-gray-500 truncate">{r.stage?.name ?? (c.isRtl ? 'לא התחיל' : 'Not started')}</span>
                      {r.open > 0 && (
                        <span className="ms-auto text-[9.5px] font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 flex-shrink-0">{r.open}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-gray-400 leading-snug">
                    {r.ws ? `Open ${r.ws.name} once on this computer to see this job.` : 'Job'}
                  </div>
                )}
              </div>
              {editable && !editing && (
                <button type="button" {...noDrag} data-pin-remove
                  title={pin.jobId ? 'Take it off the pin board (it goes back on the board)' : 'Remove this note'}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); removePin(pin); }}
                  className="absolute -top-2 -right-2 z-[3] w-5 h-5 rounded-full bg-white text-gray-500 hover:text-red-600 shadow flex items-center justify-center opacity-0 group-hover/pin:opacity-100 transition-opacity">
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}

        {editable && (
          <button type="button" {...noDrag} data-pin-add-note
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); addNote(); }}
            title={c.isRtl ? 'הוסיפו פתק בכתב יד' : 'Pin a handwritten note'}
            className="absolute bottom-2 right-2 z-[4] flex items-center gap-1 rounded-full px-2.5 py-1 shadow-md"
            style={{ background: NOTE_PAPER, fontFamily: HANDWRITING, fontSize: 18, fontWeight: 700, color: '#1f2937' }}>
            <Plus size={13} /> {c.isRtl ? 'פתק' : 'Note'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── The shelf's preview: a busy board, so a shopper sees what it is for ──────
const SAMPLE_STAGE = (name: string, color: string) => ({ id: name, name, color } as Stage);
const SAMPLE_JOBS: Record<string, { job: Apartment; stage: Stage; open: number }> = {
  s1: { job: { id: 's1', displayName: 'Office fit-out', buildingId: 'G', apartmentNumber: '' } as Apartment, stage: SAMPLE_STAGE('AC installation', '#0ea5e9'), open: 2 },
  s2: { job: { id: 's2', displayName: 'Kitchen VRF job', buildingId: 'G', apartmentNumber: '' } as Apartment, stage: SAMPLE_STAGE('Ready to start', '#22c55e'), open: 0 },
  s3: { job: { id: 's3', displayName: 'Roof units', buildingId: 'G', apartmentNumber: '' } as Apartment, stage: SAMPLE_STAGE('Piping', '#f59e0b'), open: 1 },
};
const SAMPLE_PINS: PinItem[] = [
  { id: 'sp1', jobId: 's1', x: 0.24, y: 0.45, rot: -3 },
  { id: 'sp2', jobId: 's2', x: 0.56, y: 0.5, rot: 2.5 },
  { id: 'sp3', jobId: 's3', x: 0.3, y: 0.78, rot: 1.5 },
  { id: 'sp4', text: 'Waiting for the permit!', x: 0.8, y: 0.68, rot: -2 },
];
