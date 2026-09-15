import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Undo2, Save, ArrowUp, ArrowDown, Merge, Split, Pencil, Hash, Rows3, Plus, Minus } from 'lucide-react';
import { Apartment, MainUiStrings, aptLabel, isCountableApartment, projectColor } from '../../types';
import { useStore } from '../../data/store';
import {
  FloorRow, RowHeight, aptCol, aptSpan, buildFloorRows, floorKey, placedColumns, positionMap, rowCells, rowLabelText,
} from '../../data/floorRows';

/**
 * THE LAYOUT STUDIO — the Buildings card, full screen (owner, 2026-09-15).
 *
 * It edits a DRAFT of the workspace's real apartment records: every cell is
 * the live unit — its number, its family name, its stage colour — laid out by
 * the SAME row model the project page draws (`floorRows.ts`), so what you
 * move here is the thing you know and the two screens cannot disagree.
 *
 * Nothing is written while you work. Undo walks the draft back; Save shows
 * the list of every change first, and only then writes each one through the
 * store (`updateApartment` for a changed unit, `addApartment` for a new blank
 * position, `deleteApartment` for a blank position removed, `setBoardSetting`
 * for the row heights). Escape / X close it, asking only when something
 * changed.
 *
 * Merging across a row makes ONE unit spanning the positions it covers
 * (`colSpan`) — one record, one job, one number — and the positions it took
 * become blank placeholders carrying `coveredBy`, never deleted, so Unmerge
 * puts them back. Moving a unit to another floor always ASKS about its
 * number: keep it (the default) or resequence the tower and shift the rest.
 * Nothing is renumbered silently.
 */

const CELL_W = 74;
const CELL_H = 58;
const GAP = 6;
const STAIR_W = 14;
const LABEL_W = 64;
const LONG_PRESS_MS = 500;

type Heights = Record<string, Record<string, 'tall' | 'short'>>;
interface Draft { apts: Apartment[]; heights: Heights }

const fmt = (t: string, v: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));

const cloneDraft = (d: Draft): Draft => ({ apts: d.apts.map(a => ({ ...a })), heights: structuredClone(d.heights) });

/**
 * An EMPTY position is selectable too — it has no record, so its selection id
 * names the spot: `E|<building>|<floor>|<col>`. Merging over one makes a blank
 * record for it first (the same placeholder Add position mints), so a lobby
 * can be merged across a row that never had a record in every square.
 */
const emptyId = (bid: string, floor: number, col: number) => `E|${bid}|${floor}|${col}`;
function parseEmpty(id: string): { bid: string; floor: number; col: number } | null {
  if (!id.startsWith('E|')) return null;
  const [, bid, f, c] = id.split('|');
  return { bid, floor: Number(f), col: Number(c) };
}

/** The units of one floor, in column order (covered placeholders left out). */
function unitsOn(apts: Apartment[], bid: string, floor: number): Apartment[] {
  return apts
    .filter(a => a.buildingId === bid && a.floor === floor && !a.coveredBy)
    .sort((a, b) => aptCol(a) - aptCol(b));
}

/** True when nothing sits on any of the columns `col..col+span-1` of that floor. */
function colsFree(apts: Apartment[], bid: string, floor: number, col: number, span: number, ignore: Set<string>): boolean {
  for (const a of apts) {
    if (a.buildingId !== bid || a.floor !== floor || ignore.has(a.id)) continue;
    const c = aptCol(a), s = a.coveredBy ? 1 : aptSpan(a);
    if (c < col + span && col < c + s) return false;
  }
  return true;
}

/** The first column where a unit `span` wide can land — `want` first, then left to right, then past the row's end. */
function freeCol(apts: Apartment[], bid: string, floor: number, span: number, ignore: Set<string>, want?: number): number {
  if (want && colsFree(apts, bid, floor, want, span, ignore)) return want;
  let maxCol = 0;
  for (const a of apts) if (a.buildingId === bid && a.floor === floor && !ignore.has(a.id)) maxCol = Math.max(maxCol, aptCol(a) + (a.coveredBy ? 1 : aptSpan(a)) - 1);
  for (let c = 1; c <= maxCol; c++) if (colsFree(apts, bid, floor, c, span, ignore)) return c;
  return maxCol + 1;
}

/** Moves a unit — and the placeholders it covers — to another floor. */
function moveUnit(d: Draft, id: string, toFloor: number, want?: number): Draft {
  const unit = d.apts.find(a => a.id === id);
  if (!unit || unit.coveredBy) return d;
  const covered = d.apts.filter(a => a.coveredBy === id);
  const ignore = new Set([id, ...covered.map(c => c.id)]);
  const span = aptSpan(unit);
  const col = freeCol(d.apts, unit.buildingId, toFloor, span, ignore, want);
  const from = aptCol(unit);
  return {
    ...d,
    apts: d.apts.map(a => {
      if (a.id === id) return { ...a, floor: toFloor, colPosition: col };
      if (a.coveredBy === id) return { ...a, floor: toFloor, colPosition: col + (aptCol(a) - from) };
      return a;
    }),
  };
}

/** Two units on ONE floor trade columns. */
function swapUnits(d: Draft, idA: string, idB: string): Draft {
  const A = d.apts.find(a => a.id === idA), B = d.apts.find(a => a.id === idB);
  if (!A || !B || A.floor !== B.floor || A.buildingId !== B.buildingId) return d;
  if (aptSpan(A) !== aptSpan(B)) return d;
  const ca = aptCol(A), cb = aptCol(B);
  return {
    ...d,
    apts: d.apts.map(a => {
      if (a.id === idA) return { ...a, colPosition: cb };
      if (a.id === idB) return { ...a, colPosition: ca };
      if (a.coveredBy === idA) return { ...a, colPosition: aptCol(a) - ca + cb };
      if (a.coveredBy === idB) return { ...a, colPosition: aptCol(a) - cb + ca };
      return a;
    }),
  };
}

/** Sequence rows: the tower — never the lobby, never a basement. */
const inSequence = (row: FloorRow) => row.kind === 'normal' || row.kind === 'wide' || row.kind === 'ground';

/**
 * Option B of the move question: the whole tower renumbered bottom-up, left to
 * right, from the smallest number it already carries — only over units that
 * HAVE a number. A unit whose number was left blank stays blank.
 */
function resequenceTower(d: Draft, bid: string): Draft {
  const rows = buildFloorRows(bid, d.apts).filter(inSequence).sort((a, b) => a.floor - b.floor);
  const ordered: Apartment[] = [];
  for (const row of rows) ordered.push(...unitsOn(d.apts, bid, row.floor).filter(a => a.apartmentNumber.trim() !== ''));
  if (!ordered.length) return d;
  const nums = ordered.map(a => Number(a.apartmentNumber)).filter(n => Number.isFinite(n) && n > 0);
  let next = nums.length ? Math.min(...nums) : 1;
  const newNum = new Map<string, string>();
  for (const a of ordered) newNum.set(a.id, String(next++));
  return { ...d, apts: d.apts.map(a => newNum.has(a.id) ? { ...a, apartmentNumber: newNum.get(a.id)! } : a) };
}

/** Renumber one floor from `start` — again only the positions that already carry a number. */
function renumberFloor(d: Draft, bid: string, floor: number, start: number, dir: 'ltr' | 'rtl'): Draft {
  const units = unitsOn(d.apts, bid, floor).filter(a => a.apartmentNumber.trim() !== '');
  if (dir === 'rtl') units.reverse();
  let next = start;
  const newNum = new Map<string, string>();
  for (const a of units) newNum.set(a.id, String(next++));
  return { ...d, apts: d.apts.map(a => newNum.has(a.id) ? { ...a, apartmentNumber: newNum.get(a.id)! } : a) };
}

/** The numbers a floor would carry after a draft — "45–49". */
function floorRange(d: Draft, bid: string, floor: number): string {
  const nums = unitsOn(d.apts, bid, floor).map(a => a.apartmentNumber).filter(n => n.trim() !== '');
  if (!nums.length) return '—';
  const asN = nums.map(Number);
  if (asN.every(n => Number.isFinite(n))) return `${Math.min(...asN)}–${Math.max(...asN)}`;
  return nums.join(', ');
}

/** Why these cannot be merged, or null. */
function mergeRefusal(d: Draft, ids: string[], s: MainUiStrings): string | null {
  const units = ids.map(id => d.apts.find(a => a.id === id)).filter((a): a is Apartment => !!a && !a.coveredBy);
  if (units.length < 2) return s.lbMergeNeedsRow;
  const bid = units[0].buildingId, floor = units[0].floor;
  if (units.some(u => u.buildingId !== bid || u.floor !== floor)) return s.lbMergeNeedsRow;
  const sorted = [...units].sort((a, b) => aptCol(a) - aptCol(b));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    if (aptCol(sorted[i]) !== aptCol(prev) + aptSpan(prev)) return s.lbMergeNeedsRow;
  }
  return null;
}

/**
 * Merge: the FIRST selected unit is kept and grows to span every position;
 * the others become blank placeholders under it. Nothing is deleted.
 */
function mergeUnits(d: Draft, ids: string[]): Draft {
  const units = ids.map(id => d.apts.find(a => a.id === id)!).filter(a => a && !a.coveredBy);
  const kept = units[0];
  const sorted = [...units].sort((a, b) => aptCol(a) - aptCol(b));
  const first = aptCol(sorted[0]);
  const last = sorted[sorted.length - 1];
  const span = aptCol(last) + aptSpan(last) - first;
  const others = new Set(units.filter(u => u.id !== kept.id).map(u => u.id));
  return {
    ...d,
    apts: d.apts.map(a => {
      if (a.id === kept.id) return { ...a, colPosition: first, colSpan: span, coveredBy: undefined };
      if (others.has(a.id)) {
        return {
          ...a, coveredBy: kept.id, colSpan: 1, isUnnamed: true, apartmentNumber: '', displayName: '',
          currentStageId: null, mergedWith: undefined,
        };
      }
      // A placeholder one of the others was already covering now belongs to the kept unit.
      if (a.coveredBy && others.has(a.coveredBy)) return { ...a, coveredBy: kept.id };
      return a;
    }),
  };
}

function unmergeUnit(d: Draft, id: string): Draft {
  return {
    ...d,
    apts: d.apts.map(a => {
      if (a.id === id) return { ...a, colSpan: 1 };
      if (a.coveredBy === id) return { ...a, coveredBy: undefined };
      return a;
    }),
  };
}

function blankRecord(bid: string, floor: number, col: number): Apartment {
  const now = new Date().toISOString();
  return {
    id: `${bid}-P-${floor}-${col}-${Date.now().toString(36)}`,
    buildingId: bid, apartmentNumber: '', displayName: '', floor, colPosition: col, colSpan: 1,
    isDuplexApt: false, currentStageId: null, classification: 'standard', shinuiDetails: null,
    generalNotes: '', isUnnamed: true, createdAt: now, updatedAt: now, updatedBy: '', updatedByName: '',
  };
}

/** A new blank position after `afterCol` — everything to its right shifts along. */
function addPosition(d: Draft, bid: string, floor: number, afterCol: number): Draft {
  const apts = d.apts.map(a => (a.buildingId === bid && a.floor === floor && aptCol(a) > afterCol)
    ? { ...a, colPosition: aptCol(a) + 1 } : a);
  apts.push(blankRecord(bid, floor, afterCol + 1));
  return { ...d, apts };
}

/** Removes a BLANK position (a placeholder, or an empty column). Returns null when a real unit sits there. */
function removePosition(d: Draft, bid: string, floor: number, col: number): Draft | null {
  const here = d.apts.find(a => a.buildingId === bid && a.floor === floor && aptCol(a) === col && !a.coveredBy);
  if (here && (isCountableApartment(here) || aptSpan(here) > 1)) return null;
  const apts = d.apts
    .filter(a => !(here && a.id === here.id))
    .map(a => (a.buildingId === bid && a.floor === floor && aptCol(a) > col) ? { ...a, colPosition: aptCol(a) - 1 } : a);
  return { ...d, apts };
}

// ─── The change list ─────────────────────────────────────────────────────────

interface Change {
  key: string;
  title: string;
  lines: string[];
  write: () => void;
}

const same = (a: unknown, b: unknown) => (a ?? '') === (b ?? '');

// ─── Small pieces, MODULE level ───────────────────────────────────────────────
// Declared inside the render body they would be a new TYPE every render — the
// rename box would remount and drop focus on every keystroke (the standing trap).

function Item({ id, icon: Icon, label, onClick, disabled, close }: {
  id: string; icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean; close: () => void;
}) {
  return (
    <button data-menu-item={id} disabled={disabled}
      onClick={() => { onClick(); close(); }}
      className="w-full px-3 py-1.5 text-start text-[12.5px] flex items-center gap-2.5 rounded-md disabled:opacity-30 text-gray-700 hover:bg-gray-50">
      <Icon size={13} className="text-gray-400 flex-shrink-0" />
      <span className="flex-1">{label}</span>
    </button>
  );
}

function HeightRow({ cur, s, onPick }: { cur: RowHeight; s: MainUiStrings; onPick: (h: RowHeight) => void }) {
  return (
    <div className="px-3 py-1.5 flex items-center gap-2 text-[12.5px] text-gray-700">
      <Rows3 size={13} className="text-gray-400 flex-shrink-0" />
      <span className="flex-1 whitespace-nowrap">{s.lbRowHeight}</span>
      {(['normal', 'tall', 'short'] as RowHeight[]).map(h => (
        <button key={h} data-row-height={h} data-active={cur === h ? '1' : undefined}
          onClick={() => onPick(h)}
          className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${cur === h ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'border-gray-200 text-gray-500'}`}>
          {h === 'normal' ? s.lbRowNormal : h === 'tall' ? s.lbRowTall : s.lbRowShort}
        </button>
      ))}
    </div>
  );
}

const Sep = () => <div className="h-px bg-gray-100 my-1" />;

function Shell({ children, hook, width = 420, onClose }: { children: React.ReactNode; hook: string; width?: number; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[140] bg-black/40" onClick={onClose} />
      <div {...{ [hook]: '' }} className="fixed z-[141] bg-white rounded-2xl shadow-2xl p-5"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: `min(${width}px, 94vw)`, maxHeight: '86vh', overflowY: 'auto' }}
        onPointerDown={e => e.stopPropagation()}>
        {children}
      </div>
    </>
  );
}

function Btn({ children, onClick, primary, hook, disabled, tone }: {
  children: React.ReactNode; onClick: () => void; primary?: boolean; hook?: string; disabled?: boolean; tone: string;
}) {
  return (
    <button {...(hook ? { [hook]: '' } : {})} onClick={onClick} disabled={disabled}
      className={`px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40 ${primary ? 'text-white' : 'border border-gray-200 text-gray-600'}`}
      style={primary ? { backgroundColor: tone } : undefined}>
      {children}
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

type Menu =
  | { x: number; y: number; kind: 'cell'; id: string; bid: string; floor: number; col: number }
  | { x: number; y: number; kind: 'empty'; bid: string; floor: number; col: number }
  | { x: number; y: number; kind: 'floor'; bid: string; floor: number };

type Modal =
  | { kind: 'rename'; id: string }
  | { kind: 'number'; id: string }
  | { kind: 'move'; ids: string[]; toFloor: number; toCol?: number }
  | { kind: 'renumber'; bid: string; floor: number }
  | { kind: 'save' }
  | { kind: 'discard' };

export function LayoutStudio({ onClose, onToast }: {
  onClose: () => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const s = useStore(st => st.mainUiStrings);
  const projects = useStore(st => st.projects);
  const currentProjectId = useStore(st => st.currentProjectId);
  const buildingsAll = useStore(st => st.buildings);
  const stages = useStore(st => st.stages);
  const liveApartments = useStore(st => st.apartments);
  const liveHeights = useStore(st => st.boardSettings[st.currentProjectId]?.floorHeights);
  const currentUser = useStore(st => st.currentUser);
  const updateApartment = useStore(st => st.updateApartment);
  const addApartment = useStore(st => st.addApartment);
  const deleteApartment = useStore(st => st.deleteApartment);
  const setBoardSetting = useStore(st => st.setBoardSetting);

  const tone = projectColor(projects, currentProjectId);
  const buildings = useMemo(
    () => [...buildingsAll].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [buildingsAll]);

  const fresh = useCallback((): Draft => {
    // The draft carries the column each unit is DRAWN at: a record whose
    // guessed column collided with another's was stepped aside on screen,
    // and the draft must agree with the screen or a merge of two neighbours
    // is refused as "not adjacent". Saving writes the resolved column only
    // where it differs — which is what fixes the collision for good.
    const placed = new Map<string, number>();
    for (const b of buildings) placedColumns(b.id, liveApartments).forEach((c, id) => placed.set(id, c));
    return {
      apts: liveApartments.filter(a => a.buildingId !== 'G').map(a => ({ ...a, colPosition: placed.get(a.id) ?? a.colPosition })),
      heights: structuredClone(liveHeights ?? {}),
    };
  }, [liveApartments, liveHeights, buildings]);

  const [draft, setDraft] = useState<Draft>(fresh);
  const [history, setHistory] = useState<Draft[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [lasso, setLasso] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<string | null>(null);
  const [field, setField] = useState('');
  const [moveChoice, setMoveChoice] = useState<'keep' | 'renumber'>('keep');
  const [renum, setRenum] = useState<{ start: string; dir: 'ltr' | 'rtl' }>({ start: '1', dir: 'ltr' });

  const gridRef = useRef<HTMLDivElement>(null);
  const lassoRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const pressTimer = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const dirty = history.length > 0;

  const edit = useCallback((fn: (d: Draft) => Draft | null) => {
    const cur = draftRef.current;
    const next = fn(cloneDraft(cur));
    if (!next) return;
    setHistory(h => [...h.slice(-60), cur]);
    setDraft(next);
  }, []);

  const undo = useCallback(() => {
    setHistory(h => {
      if (!h.length) return h;
      setDraft(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);

  // ── Every building, side by side (owner, 2026-09-15: all three at once) ──
  const perB = useMemo(() => buildings.map(b => ({
    id: b.id,
    rows: buildFloorRows(b.id, draft.apts, draft.heights[b.id]),
    pos: positionMap(b.id, draft.apts),
  })), [buildings, draft]);
  const rowsOf = (bid: string) => perB.find(x => x.id === bid)?.rows ?? [];
  const posOf = (bid: string) => perB.find(x => x.id === bid)?.pos ?? new Map<string, Apartment>();
  const stageColor = useCallback((id: string | null | undefined) =>
    id ? stages.find(st => st.id === id)?.color ?? '#e2e8f0' : '#e2e8f0', [stages]);
  const unitCount = useMemo(() => draft.apts.filter(a => isCountableApartment(a)).length, [draft]);
  const byId = useMemo(() => new Map(draft.apts.map(a => [a.id, a])), [draft]);
  const rowLabel = (row: FloorRow) => rowLabelText(row, s.lobby, s.groundCommercial);
  const rowOfFloor = (bid: string, floor: number) => rowsOf(bid).find(r => r.floor === floor);
  const labelOfFloor = (bid: string, floor: number) => { const r = rowOfFloor(bid, floor); return r ? rowLabel(r) : String(floor); };
  const unitLabel = (a: Apartment | undefined) => a ? (aptLabel(a) === '?' ? s.lbBlankSlot : aptLabel(a)) : s.lbBlankSlot;

  // A selected unit that is no longer in the draft (removed) drops out of the selection.
  const selUnits = sel.map(id => byId.get(id)).filter((a): a is Apartment => !!a && !a.coveredBy);
  const selEmpties = sel.map(parseEmpty).filter((e): e is { bid: string; floor: number; col: number } => !!e);
  const selCount = selUnits.length + selEmpties.length;
  /** The selection in its order — units first, then empty positions — for a merge. */
  const selForMerge = () => [...selUnits.map(u => u.id), ...selEmpties.map(e => emptyId(e.bid, e.floor, e.col))];

  // ── Selection ──
  function clickCell(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (e.shiftKey && sel.length) {
      const anchor = byId.get(sel[sel.length - 1]);
      const me = byId.get(id);
      if (anchor && me && anchor.floor === me.floor && anchor.buildingId === me.buildingId) {
        const lo = Math.min(aptCol(anchor), aptCol(me)), hi = Math.max(aptCol(anchor), aptCol(me));
        const range = unitsOn(draft.apts, me.buildingId, me.floor).filter(u => aptCol(u) >= lo && aptCol(u) <= hi).map(u => u.id);
        setSel(prev => [...prev, ...range.filter(r => !prev.includes(r))]);
        return;
      }
      setSel(prev => prev.includes(id) ? prev : [...prev, id]);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
      return;
    }
    setSel([id]);
  }

  // ── Lasso on the empty background ──
  function onGridPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-builder-cell],[data-builder-empty],[data-builder-floor-label],button,input')) return;
    const box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
    lassoRef.current = box;
    setLasso(box);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onGridPointerMove(e: React.PointerEvent) {
    if (!lassoRef.current) return;
    const box = { ...lassoRef.current, x1: e.clientX, y1: e.clientY };
    lassoRef.current = box;
    setLasso(box);
  }
  function onGridPointerUp(e: React.PointerEvent) {
    const box = lassoRef.current;
    lassoRef.current = null;
    setLasso(null);
    if (!box) return;
    const L = Math.min(box.x0, box.x1), R = Math.max(box.x0, box.x1);
    const T = Math.min(box.y0, box.y1), B = Math.max(box.y0, box.y1);
    if (R - L < 6 && B - T < 6) { setSel([]); return; }
    const hits: string[] = [];
    gridRef.current?.querySelectorAll<HTMLElement>('[data-builder-cell],[data-builder-empty]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > L && r.left < R && r.bottom > T && r.top < B) hits.push(el.dataset.builderCell ?? el.dataset.builderEmpty!);
    });
    setSel(e.shiftKey ? prev => [...prev, ...hits.filter(h => !prev.includes(h))] : hits);
  }

  // ── Drag a cell onto another floor / position ──
  function onDropTo(bid: string, floor: number, col?: number) {
    const id = dragId;
    setDragId(null); setDropAt(null);
    if (!id) return;
    const unit = byId.get(id);
    if (!unit || unit.buildingId !== bid) return;   // a unit never crosses buildings by a drag
    if (unit.floor === floor) {
      const there = col ? posOf(bid).get(`${floor}-${col}`) : undefined;
      if (there && there.id !== id) { edit(d => swapUnits(d, id, there.id)); return; }
      if (col && col !== aptCol(unit)) { edit(d => moveUnit(d, id, floor, col)); return; }
      return;
    }
    const ids = sel.includes(id) ? selUnits.map(u => u.id) : [id];
    setMoveChoice('keep');
    setModal({ kind: 'move', ids, toFloor: floor, toCol: col });
  }

  // ── Actions ──
  function moveByRows(ids: string[], dir: -1 | 1) {
    const units = ids.map(id => byId.get(id)).filter((a): a is Apartment => !!a);
    if (!units.length) return;
    const rows = rowsOf(units[0].buildingId);
    const idx = rows.findIndex(r => r.floor === units[0].floor);
    const target = rows[idx + dir];
    if (idx === -1 || !target) { onToast(dir === -1 ? s.lbTopAlready : s.lbBottomAlready, 'error'); return; }
    setMoveChoice('keep');
    setModal({ kind: 'move', ids: units.map(u => u.id), toFloor: target.floor });
  }
  function confirmMove() {
    if (modal?.kind !== 'move') return;
    const { ids, toFloor, toCol } = modal;
    const choice = moveChoice;
    const bid = byId.get(ids[0])?.buildingId ?? '';
    edit(d => {
      let next = d;
      ids.forEach((id, i) => { next = moveUnit(next, id, toFloor, i === 0 ? toCol : undefined); });
      if (choice === 'renumber') next = resequenceTower(next, bid);
      return next;
    });
    setModal(null);
    onToast(fmt(s.lbMoved, { f: labelOfFloor(bid, toFloor) }));
  }
  function doMerge(ids: string[]) {
    // An empty position in the selection becomes a blank record first — the
    // spot is then a real square the merge can span.
    const cur = cloneDraft(draftRef.current);
    const realIds: string[] = [];
    for (const id of ids) {
      const em = parseEmpty(id);
      if (!em) { realIds.push(id); continue; }
      const rec = blankRecord(em.bid, em.floor, em.col);
      cur.apts.push(rec);
      realIds.push(rec.id);
    }
    const why = mergeRefusal(cur, realIds, s);
    if (why) { onToast(why, 'error'); return; }
    edit(() => mergeUnits(cur, realIds));
    setSel([realIds[0]]);
    onToast(s.lbMerged);
  }
  function doUnmerge(id: string) {
    edit(d => unmergeUnit(d, id));
    onToast(s.lbUnmerged);
  }
  function setRowHeight(bid: string, floor: number, h: RowHeight) {
    edit(d => {
      const mine = { ...(d.heights[bid] ?? {}) };
      if (h === 'normal') delete mine[floorKey(floor)]; else mine[floorKey(floor)] = h;
      const heights = { ...d.heights };
      if (Object.keys(mine).length) heights[bid] = mine; else delete heights[bid];
      return { ...d, heights };
    });
  }
  function applyRename() {
    if (modal?.kind !== 'rename') return;
    const name = field.trim();
    edit(d => ({ ...d, apts: d.apts.map(a => a.id === modal.id
      ? { ...a, displayName: name, isUnnamed: !(name || a.apartmentNumber.trim()) } : a) }));
    setModal(null);
  }
  function applyNumber() {
    if (modal?.kind !== 'number') return;
    const num = field.trim();
    edit(d => ({ ...d, apts: d.apts.map(a => a.id === modal.id
      ? { ...a, apartmentNumber: num, isUnnamed: !(num || a.displayName.trim()) } : a) }));
    setModal(null);
  }
  function applyRenumber() {
    if (modal?.kind !== 'renumber') return;
    const start = parseInt(renum.start, 10);
    if (!Number.isFinite(start)) return;
    edit(d => renumberFloor(d, modal.bid, modal.floor, start, renum.dir));
    setModal(null);
  }

  // ── Save: the list of changes, then the writes ──
  const changes = useMemo((): Change[] => {
    if (modal?.kind !== 'save') return [];
    const out: Change[] = [];
    const liveById = new Map(liveApartments.map(a => [a.id, a]));
    const draftIds = new Set(draft.apts.map(a => a.id));
    const user = currentUser;
    for (const a of draft.apts) {
      const live = liveById.get(a.id);
      const title = `${a.buildingId} · ${labelOfFloor(a.buildingId, a.floor)} · ${unitLabel(live ?? a)}`;
      if (!live) {
        out.push({ key: a.id, title, lines: [s.lbChangeNew], write: () => addApartment(a) });
        continue;
      }
      const patch: Partial<Apartment> = {};
      const lines: string[] = [];
      if (live.floor !== a.floor) { patch.floor = a.floor; lines.push(fmt(s.lbChangeFloor, { a: labelOfFloor(a.buildingId, live.floor), b: labelOfFloor(a.buildingId, a.floor) })); }
      if (aptCol(live) !== aptCol(a)) { patch.colPosition = aptCol(a); lines.push(fmt(s.lbChangeCol, { a: aptCol(live), b: aptCol(a) })); }
      if (aptSpan(live) !== aptSpan(a)) {
        patch.colSpan = aptSpan(a);
        lines.push(aptSpan(a) > 1 ? fmt(s.lbChangeMerged, { n: aptSpan(a) }) : s.lbChangeUnmerged);
      }
      if (!same(live.coveredBy, a.coveredBy)) { patch.coveredBy = a.coveredBy; lines.push(a.coveredBy ? s.lbChangeCovered : s.lbChangeUncovered); }
      if (!same(live.apartmentNumber, a.apartmentNumber)) { patch.apartmentNumber = a.apartmentNumber; lines.push(fmt(s.lbChangeNumber, { a: live.apartmentNumber || s.lbNoNumber, b: a.apartmentNumber || s.lbNoNumber })); }
      if (!same(live.displayName, a.displayName)) { patch.displayName = a.displayName; lines.push(fmt(s.lbChangeName, { a: live.displayName || s.lbBlankSlot, b: a.displayName || s.lbBlankSlot })); }
      if (!!live.isUnnamed !== !!a.isUnnamed) patch.isUnnamed = a.isUnnamed;
      if (!same(live.currentStageId, a.currentStageId)) patch.currentStageId = a.currentStageId;
      if (!same(live.mergedWith, a.mergedWith)) patch.mergedWith = a.mergedWith;
      if (!Object.keys(patch).length) continue;
      out.push({ key: a.id, title, lines, write: () => { if (user) updateApartment(a.id, patch, user); } });
    }
    for (const live of liveApartments) {
      if (live.buildingId === 'G' || draftIds.has(live.id)) continue;
      out.push({
        key: live.id, title: `${live.buildingId} · ${labelOfFloor(live.buildingId, live.floor)} · ${unitLabel(live)}`,
        lines: [s.lbChangeRemoved], write: () => deleteApartment(live.id),
      });
    }
    if (JSON.stringify(liveHeights ?? {}) !== JSON.stringify(draft.heights)) {
      out.push({ key: '__heights', title: s.lbChangeHeights, lines: [], write: () => setBoardSetting('floorHeights', draft.heights) });
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, draft, liveApartments, liveHeights, currentUser]);

  function writeAll() {
    changes.forEach(c => c.write());
    setModal(null);
    setHistory([]);
    onToast(s.lbSaved);
  }

  // ── Escape ladder: menu → modal → the studio (asking if dirty) ──
  const requestClose = useCallback(() => {
    if (dirty) setModal({ kind: 'discard' }); else onClose();
  }, [dirty, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault(); e.stopPropagation();
      if (menu) { setMenu(null); return; }
      if (modal) { setModal(null); return; }
      requestClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [menu, modal, requestClose]);

  // ── Long-press opens the menu on a touch screen ──
  function startPress(e: React.PointerEvent, open: () => void) {
    if (e.pointerType !== 'touch') return;
    pressTimer.current = window.setTimeout(open, LONG_PRESS_MS);
  }
  function endPress() {
    if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  function openCellMenu(x: number, y: number, a: Apartment) {
    setSel(prev => prev.includes(a.id) ? prev : [a.id]);
    setMenu({ x, y, kind: 'cell', id: a.id, bid: a.buildingId, floor: a.floor, col: aptCol(a) });
  }

  // ── Menu rows ──
  const menuUnit = menu?.kind === 'cell' ? byId.get(menu.id) : undefined;
  const menuIds = menu?.kind === 'cell' ? (sel.includes(menu.id) && selUnits.length > 1 ? selUnits.map(u => u.id) : [menu.id]) : [];
  const canUnmerge = !!menuUnit && (aptSpan(menuUnit) > 1 || draft.apts.some(a => a.coveredBy === menuUnit.id));
  const menuRow = menu ? rowOfFloor(menu.bid, menu.floor) : undefined;

  const moveInfo = modal?.kind === 'move' ? (() => {
    const first = byId.get(modal.ids[0]);
    const bid = first?.buildingId ?? '';
    let sim: Draft = cloneDraft(draft);
    modal.ids.forEach((id, i) => { sim = moveUnit(sim, id, modal.toFloor, i === 0 ? modal.toCol : undefined); });
    sim = resequenceTower(sim, bid);
    const range = floorRange(sim, bid, modal.toFloor);
    const label = first ? unitLabel(first) + (modal.ids.length > 1 ? ` +${modal.ids.length - 1}` : '') : '';
    return { first, range, label };
  })() : null;

  const renumberPreview = modal?.kind === 'renumber' ? (() => {
    const start = parseInt(renum.start, 10);
    if (!Number.isFinite(start)) return [];
    const after = renumberFloor(cloneDraft(draft), modal.bid, modal.floor, start, renum.dir);
    const before = unitsOn(draft.apts, modal.bid, modal.floor);
    return before.filter(a => a.apartmentNumber.trim() !== '').map(a => {
      const n = after.apts.find(x => x.id === a.id)!.apartmentNumber;
      return { id: a.id, from: a.apartmentNumber, to: n };
    });
  })() : [];

  return createPortal(
    <div data-layout-studio dir={s.isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[120] flex flex-col bg-slate-100 text-gray-800"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Top bar in the workspace colour */}
      <div className="flex items-center gap-2 px-3 py-2 text-white flex-shrink-0 flex-wrap"
        style={{ backgroundColor: tone }}>
        <span className="font-bold text-sm tracking-wide me-2">{s.lbTitle}</span>
        <span className="text-[11px] opacity-80 tabular-nums ms-2">{fmt(s.lbUnits, { n: unitCount })}</span>
        <div className="ms-auto flex items-center gap-1.5">
          <button data-builder-undo onClick={undo} disabled={!dirty} title={s.lbUndo}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-[12px] font-bold disabled:opacity-40">
            <Undo2 size={13} /> {s.lbUndo}
          </button>
          <button data-builder-save onClick={() => setModal({ kind: 'save' })}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-gray-900 text-[12px] font-bold">
            <Save size={13} /> {s.lbSaveLayout}{dirty ? ` (${history.length})` : ''}
          </button>
          <button data-builder-close onClick={requestClose} title={s.lbCloseTip}
            className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* The building */}
      <div ref={gridRef} className="flex-1 min-h-0 overflow-auto p-5 select-none"
        style={{ cursor: lasso ? 'crosshair' : undefined }}
        onPointerDown={onGridPointerDown} onPointerMove={onGridPointerMove}
        onPointerUp={onGridPointerUp} onPointerCancel={onGridPointerUp}
        onContextMenu={e => { if (e.target === e.currentTarget) e.preventDefault(); }}>
        <div className="flex items-start gap-6" style={{ minWidth: 'fit-content' }}>
        {perB.map(({ id: bid, rows, pos }) => (
        <div key={bid} data-builder-building={bid} className="inline-flex flex-col rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden flex-shrink-0" style={{ minWidth: 'fit-content' }}>
          <div className="text-center font-bold text-white tracking-widest text-sm py-1.5" style={{ backgroundColor: '#1e3a5f' }}>
            {bid}
            <span className="ms-2 text-[10px] font-semibold opacity-70 tabular-nums tracking-normal">
              {fmt(s.lbUnits, { n: draft.apts.filter(a => a.buildingId === bid && isCountableApartment(a)).length })}
            </span>
          </div>
          {/* Roof */}
          <div className="flex items-stretch border-b border-gray-100" style={{ height: 22 }}>
            <div className="flex-shrink-0" style={{ width: LABEL_W, backgroundColor: '#dbeafe' }} />
            <div className="flex-1 m-1 rounded-md" style={{ backgroundColor: '#bfdbfe' }} />
          </div>
          {rows.map((row, ri) => {
            const cells = rowCells(row, pos);
            const leftN = Math.ceil(row.cols / 2);
            const crosses = cells.some(c => c.col <= leftN && c.col + c.span - 1 > leftN);
            const hBase = row.height === 'tall' ? CELL_H * 1.5 : row.height === 'short' ? CELL_H * 0.6 : CELL_H;
            const rowH = Math.round(hBase) + 10;
            const label = rowLabel(row);
            const rowBg = row.kind === 'ground' ? '#fef9c3' : row.kind === 'basement' ? '#e8f0fb' : row.kind === 'lobby' ? '#f0fdf4' : '#f1f5f9';
            const isDropRow = dropAt === `${bid}:${row.floor}`;
            const items: React.ReactNode[] = [];
            cells.forEach(cell => {
              if (!crosses && cell.col === leftN + 1) {
                items.push(<div key="stair" className="rounded-full flex-shrink-0 self-stretch" style={{ width: 3, marginInline: (STAIR_W - 3) / 2, backgroundColor: '#f59e0b', opacity: .55 }} />);
              }
              const w = CELL_W * cell.span + GAP * (cell.span - 1) + (cell.col <= leftN && cell.col + cell.span - 1 > leftN ? STAIR_W + GAP : 0);
              const apt = cell.apt;
              if (!apt) {
                const key = `${bid}:${row.floor}-${cell.col}`;
                const eid = emptyId(bid, row.floor, cell.col);
                const selectedE = sel.includes(eid);
                items.push(
                  <div key={key} data-builder-empty={eid} data-builder-pos={`${row.floor}-${cell.col}`}
                    role="button" tabIndex={0}
                    onClick={e => clickCell(e, eid)}
                    onDragOver={e => { if (dragId) { e.preventDefault(); setDropAt(key); } }}
                    onDragLeave={() => setDropAt(null)}
                    onDrop={e => { e.preventDefault(); onDropTo(bid, row.floor, cell.col); }}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSel(prev => prev.includes(eid) ? prev : [eid]); setMenu({ x: e.clientX, y: e.clientY, kind: 'empty', bid, floor: row.floor, col: cell.col }); }}
                    onPointerDown={e => startPress(e, () => setMenu({ x: e.clientX, y: e.clientY, kind: 'empty', bid, floor: row.floor, col: cell.col }))}
                    onPointerUp={endPress} onPointerMove={endPress} onPointerCancel={endPress}
                    className="rounded-md flex-shrink-0 border border-dashed cursor-pointer"
                    style={{ width: w, height: hBase,
                      borderColor: selectedE ? '#1c1f26' : dropAt === key ? tone : '#d1d5db',
                      boxShadow: selectedE ? '0 0 0 2.5px rgba(28,31,38,.22)' : undefined,
                      backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 4px, #eceae4 4px 5px)' }} />,
                );
                return;
              }
              const isDuplexTop = !!apt.isDuplexApt && apt.floor !== row.floor;
              if (isDuplexTop) {
                items.push(<div key={`dt-${cell.col}`} className="flex-shrink-0" style={{ width: w, height: hBase }} aria-hidden="true" />);
                return;
              }
              const selected = sel.includes(apt.id);
              const blank = !isCountableApartment(apt);
              const name = apt.displayName?.trim() && apt.displayName.trim() !== apt.apartmentNumber?.trim() ? apt.displayName.trim() : '';
              const num = apt.apartmentNumber?.trim() ?? '';
              const color = stageColor(apt.currentStageId);
              const key = `${bid}:${row.floor}-${cell.col}`;
              items.push(
                <div key={apt.id}
                  data-builder-cell={apt.id} data-builder-pos={`${row.floor}-${cell.col}`} data-builder-span={cell.span}
                  data-builder-num={num} data-builder-name={name} data-builder-stage={apt.currentStageId ?? ''}
                  role="button" tabIndex={0}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('text/plain', apt.id); e.dataTransfer.effectAllowed = 'move'; setDragId(apt.id); }}
                  onDragEnd={() => { setDragId(null); setDropAt(null); }}
                  onDragOver={e => { if (dragId && dragId !== apt.id) { e.preventDefault(); setDropAt(key); } }}
                  onDragLeave={() => setDropAt(null)}
                  onDrop={e => { e.preventDefault(); onDropTo(bid, row.floor, cell.col); }}
                  onClick={e => clickCell(e, apt.id)}
                  onDoubleClick={() => { setField(apt.displayName ?? ''); setModal({ kind: 'rename', id: apt.id }); }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openCellMenu(e.clientX, e.clientY, apt); }}
                  onPointerDown={e => startPress(e, () => openCellMenu(e.clientX, e.clientY, apt))}
                  onPointerUp={endPress} onPointerMove={endPress} onPointerCancel={endPress}
                  className="relative flex-shrink-0 rounded-md overflow-hidden cursor-pointer flex flex-col items-center justify-center text-center"
                  style={{
                    width: w, height: hBase,
                    backgroundColor: blank ? 'transparent' : '#ffffff',
                    border: `1.5px ${blank ? 'dashed' : 'solid'} ${selected ? '#1c1f26' : dropAt === key ? tone : blank ? '#cbd5e1' : '#d9dee7'}`,
                    boxShadow: selected ? '0 0 0 2.5px rgba(28,31,38,.22)' : undefined,
                    opacity: dragId === apt.id ? .45 : 1,
                    ...(blank ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 4px, #eceae4 4px 5px)' } : {}),
                  }}>
                  {!blank && (
                    <>
                      {num && <span className="font-bold leading-none text-[13px] text-gray-900 tabular-nums">{num}</span>}
                      {name && (
                        <span className={`px-1 leading-tight text-gray-600 ${num ? 'text-[10px] mt-0.5' : 'text-[11.5px] font-semibold'}`}
                          style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', overflowWrap: 'anywhere' }}>
                          {name}
                        </span>
                      )}
                      <span className="absolute left-0 right-0 bottom-0" style={{ height: 4, backgroundColor: color }} />
                    </>
                  )}
                  {apt.mergedWith && <span className="absolute top-0.5 end-0.5 w-2 h-2 rounded-full bg-blue-500" />}
                </div>,
              );
            });
            return (
              <div key={row.key} data-builder-row={row.key} data-builder-kind={row.kind}
                className={`flex items-center ${ri < rows.length - 1 ? 'border-b border-gray-100' : ''}`}
                style={{ height: rowH, backgroundColor: isDropRow ? `${tone}14` : undefined }}
                onDragOver={e => { if (dragId) { e.preventDefault(); if (e.target === e.currentTarget) setDropAt(`${bid}:${row.floor}`); } }}
                onDrop={e => { e.preventDefault(); onDropTo(bid, row.floor); }}>
                <div data-builder-floor-label={label}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, kind: 'floor', bid, floor: row.floor }); }}
                  onPointerDown={e => startPress(e, () => setMenu({ x: e.clientX, y: e.clientY, kind: 'floor', bid, floor: row.floor }))}
                  onPointerUp={endPress} onPointerMove={endPress}
                  title={s.lbFloorLabelTip}
                  className="flex-shrink-0 self-stretch flex items-center justify-center text-center text-gray-600 font-bold border-e border-gray-200 cursor-context-menu"
                  style={{ width: LABEL_W, backgroundColor: rowBg, fontSize: row.kind === 'lobby' || row.kind === 'ground' ? 9.5 : 11, lineHeight: 1.1, padding: '0 3px' }}>
                  {label}
                </div>
                <div className="flex items-center px-2" style={{ gap: GAP }}>{items}</div>
              </div>
            );
          })}
        </div>
        ))}
        </div>

        {lasso && (
          <div className="fixed pointer-events-none z-[125] rounded"
            style={{
              left: Math.min(lasso.x0, lasso.x1), top: Math.min(lasso.y0, lasso.y1),
              width: Math.abs(lasso.x1 - lasso.x0), height: Math.abs(lasso.y1 - lasso.y0),
              border: `1.5px dashed ${tone}`, backgroundColor: `${tone}1a`,
            }} />
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-white border-t border-gray-200 flex-shrink-0 flex-wrap"
        style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
        <button data-move-up disabled={!selUnits.length} onClick={() => moveByRows(selUnits.map(u => u.id), -1)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border border-gray-200 text-gray-700 disabled:opacity-40">
          <ArrowUp size={12} /> {s.lbMoveUp}
        </button>
        <button data-move-down disabled={!selUnits.length} onClick={() => moveByRows(selUnits.map(u => u.id), 1)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border border-gray-200 text-gray-700 disabled:opacity-40">
          <ArrowDown size={12} /> {s.lbMoveDown}
        </button>
        <span className="w-px h-5 bg-gray-200 mx-0.5" />
        <button data-merge-btn disabled={selCount < 2} onClick={() => doMerge(selForMerge())}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold text-white disabled:opacity-40"
          style={{ backgroundColor: '#2d6a9f' }}>
          <Merge size={12} /> {s.lbMergeSelected} ({selCount})
        </button>
        <button data-unmerge-btn
          disabled={!(selUnits.length === 1 && (aptSpan(selUnits[0]) > 1 || draft.apts.some(a => a.coveredBy === selUnits[0].id)))}
          onClick={() => doUnmerge(selUnits[0].id)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border border-gray-200 text-gray-700 disabled:opacity-40">
          <Split size={12} /> {s.lbUnmerge}
        </button>
        <span className="w-px h-5 bg-gray-200 mx-0.5" />
        <button data-rename-btn disabled={selUnits.length !== 1}
          onClick={() => { setField(selUnits[0].displayName ?? ''); setModal({ kind: 'rename', id: selUnits[0].id }); }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border border-gray-200 text-gray-700 disabled:opacity-40">
          <Pencil size={12} /> {s.lbRename}
        </button>
        <button data-number-btn disabled={selUnits.length !== 1}
          onClick={() => { setField(selUnits[0].apartmentNumber ?? ''); setModal({ kind: 'number', id: selUnits[0].id }); }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border border-gray-200 text-gray-700 disabled:opacity-40">
          <Hash size={12} /> {s.lbSetNumber}
        </button>
        <span className="ms-auto text-[10.5px] text-gray-400">
          {selCount ? fmt(s.lbSelected, { n: selCount }) + ' · ' : ''}{s.lbSelectHint}
        </span>
      </div>

      {/* Right-click menu */}
      {menu && (
        <>
          <div className="fixed inset-0 z-[130]" onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null); }} />
          <div data-builder-menu className="fixed z-[131] bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5"
            style={{ left: Math.min(menu.x, window.innerWidth - 270), top: Math.min(menu.y, window.innerHeight - 440), width: 258, maxHeight: '80vh', overflowY: 'auto' }}>
            {menu.kind === 'cell' && menuUnit && (
              <>
                <div className="px-3 pt-1 pb-1 text-[9.5px] font-extrabold text-gray-400 tracking-wider truncate">
                  {menuIds.length > 1 ? fmt(s.lbSelected, { n: menuIds.length }).toUpperCase() : unitLabel(menuUnit).toUpperCase()}
                </div>
                <Item close={() => setMenu(null)} id="rename" icon={Pencil} label={s.lbRename} onClick={() => { setField(menuUnit.displayName ?? ''); setModal({ kind: 'rename', id: menuUnit.id }); }} />
                <Item close={() => setMenu(null)} id="number" icon={Hash} label={s.lbSetNumber} onClick={() => { setField(menuUnit.apartmentNumber ?? ''); setModal({ kind: 'number', id: menuUnit.id }); }} />
                <Sep />
                <Item close={() => setMenu(null)} id="move-up" icon={ArrowUp} label={s.lbMoveUp} onClick={() => moveByRows(menuIds, -1)} />
                <Item close={() => setMenu(null)} id="move-down" icon={ArrowDown} label={s.lbMoveDown} onClick={() => moveByRows(menuIds, 1)} />
                <Sep />
                <Item close={() => setMenu(null)} id="merge" icon={Merge} label={`${s.lbMergeSelected} (${selCount})`} disabled={selCount < 2} onClick={() => doMerge(selForMerge())} />
                <Item close={() => setMenu(null)} id="unmerge" icon={Split} label={s.lbUnmerge} disabled={!canUnmerge} onClick={() => doUnmerge(menuUnit.id)} />
                <Sep />
                <Item close={() => setMenu(null)} id="renumber" icon={Hash} label={s.lbRenumberFloor} onClick={() => {
                  const nums = unitsOn(draft.apts, menuUnit.buildingId, menuUnit.floor).map(a => Number(a.apartmentNumber)).filter(n => Number.isFinite(n) && n > 0);
                  setRenum({ start: String(nums.length ? Math.min(...nums) : 1), dir: 'ltr' });
                  setModal({ kind: 'renumber', bid: menuUnit.buildingId, floor: menuUnit.floor });
                }} />
                <HeightRow cur={rowOfFloor(menuUnit.buildingId, menuUnit.floor)?.height ?? 'normal'} s={s} onPick={h => { setRowHeight(menuUnit.buildingId, menuUnit.floor, h); setMenu(null); }} />
                <Sep />
                <Item close={() => setMenu(null)} id="add-position" icon={Plus} label={s.lbAddPosition} onClick={() => edit(d => addPosition(d, menuUnit.buildingId, menuUnit.floor, aptCol(menuUnit) + aptSpan(menuUnit) - 1))} />
                <Item close={() => setMenu(null)} id="remove-position" icon={Minus} label={s.lbRemovePosition} onClick={() => {
                  const next = removePosition(cloneDraft(draft), menuUnit.buildingId, menuUnit.floor, aptCol(menuUnit));
                  if (!next) { onToast(s.lbRemoveRefused, 'error'); return; }
                  edit(() => next);
                }} />
              </>
            )}
            {menu.kind === 'empty' && (
              <>
                <div className="px-3 pt-1 pb-1 text-[9.5px] font-extrabold text-gray-400 tracking-wider">{s.lbBlankSlot.toUpperCase()}</div>
                <Item close={() => setMenu(null)} id="merge" icon={Merge} label={`${s.lbMergeSelected} (${selCount})`} disabled={selCount < 2} onClick={() => doMerge(selForMerge())} />
                <Item close={() => setMenu(null)} id="add-position" icon={Plus} label={s.lbAddPosition} onClick={() => edit(d => addPosition(d, menu.bid, menu.floor, menu.col))} />
                <Item close={() => setMenu(null)} id="remove-position" icon={Minus} label={s.lbRemovePosition} onClick={() => {
                  const next = removePosition(cloneDraft(draft), menu.bid, menu.floor, menu.col);
                  if (!next) { onToast(s.lbRemoveRefused, 'error'); return; }
                  edit(() => next);
                }} />
                <HeightRow cur={rowOfFloor(menu.bid, menu.floor)?.height ?? 'normal'} s={s} onPick={h => { setRowHeight(menu.bid, menu.floor, h); setMenu(null); }} />
              </>
            )}
            {menu.kind === 'floor' && menuRow && (
              <>
                <div className="px-3 pt-1 pb-1 text-[9.5px] font-extrabold text-gray-400 tracking-wider">{rowLabel(menuRow).toUpperCase()}</div>
                <HeightRow cur={rowOfFloor(menu.bid, menu.floor)?.height ?? 'normal'} s={s} onPick={h => { setRowHeight(menu.bid, menu.floor, h); setMenu(null); }} />
                <Item close={() => setMenu(null)} id="renumber" icon={Hash} label={s.lbRenumberFloor} onClick={() => {
                  const nums = unitsOn(draft.apts, menu.bid, menu.floor).map(a => Number(a.apartmentNumber)).filter(n => Number.isFinite(n) && n > 0);
                  setRenum({ start: String(nums.length ? Math.min(...nums) : 1), dir: 'ltr' });
                  setModal({ kind: 'renumber', bid: menu.bid, floor: menu.floor });
                }} />
                <Item close={() => setMenu(null)} id="add-position" icon={Plus} label={s.lbAddPosition} onClick={() => edit(d => addPosition(d, menu.bid, menu.floor, menuRow.cols))} />
              </>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      {modal?.kind === 'move' && moveInfo && (
        <Shell onClose={() => setModal(null)} hook="data-move-modal">
          <h3 className="font-bold text-gray-900 mb-3">{fmt(s.lbMoveAsk, { a: moveInfo.label, f: labelOfFloor(moveInfo.first?.buildingId ?? '', modal.toFloor) })}</h3>
          <label className="flex items-start gap-2 p-2.5 rounded-lg border border-gray-200 mb-2 cursor-pointer" data-move-keep>
            <input type="radio" name="movenum" checked={moveChoice === 'keep'} onChange={() => setMoveChoice('keep')} className="mt-0.5" />
            <span className="text-sm text-gray-800">
              {moveInfo.first?.apartmentNumber?.trim() ? fmt(s.lbKeepNumber, { n: moveInfo.first.apartmentNumber }) : s.lbKeepNoNumber}
            </span>
          </label>
          <label className="flex items-start gap-2 p-2.5 rounded-lg border border-gray-200 mb-4 cursor-pointer" data-move-renumber>
            <input type="radio" name="movenum" checked={moveChoice === 'renumber'} onChange={() => setMoveChoice('renumber')} className="mt-0.5" />
            <span className="text-sm text-gray-800">{fmt(s.lbRenumberOpt, { f: labelOfFloor(moveInfo.first?.buildingId ?? '', modal.toFloor), range: moveInfo.range })}</span>
          </label>
          <div className="flex gap-2 justify-end">
            <Btn tone={tone} onClick={() => setModal(null)}>{s.cancel}</Btn>
            <Btn tone={tone} primary hook="data-move-confirm" onClick={confirmMove}>{s.lbMoveBtn}</Btn>
          </div>
        </Shell>
      )}
      {(modal?.kind === 'rename' || modal?.kind === 'number') && (
        <Shell onClose={() => setModal(null)} hook={modal.kind === 'rename' ? 'data-rename-modal' : 'data-number-modal'} width={360}>
          <h3 className="font-bold text-gray-900 mb-1">{modal.kind === 'rename' ? s.lbRename : s.lbSetNumber}</h3>
          <div className="text-[11px] text-gray-500 mb-2">{unitLabel(byId.get(modal.id))}</div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            {modal.kind === 'rename' ? s.lbNameField : s.lbNumberField}
          </label>
          <input autoFocus data-enter-own
            {...{ [modal.kind === 'rename' ? 'data-rename-input' : 'data-number-input']: '' }}
            value={field} onChange={e => setField(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); modal.kind === 'rename' ? applyRename() : applyNumber(); } }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4" />
          <div className="flex gap-2 justify-end">
            <Btn tone={tone} onClick={() => setModal(null)}>{s.cancel}</Btn>
            <Btn tone={tone} primary hook="data-modal-apply" onClick={modal.kind === 'rename' ? applyRename : applyNumber}>{s.lbApply}</Btn>
          </div>
        </Shell>
      )}
      {modal?.kind === 'renumber' && (
        <Shell onClose={() => setModal(null)} hook="data-renumber-modal">
          <h3 className="font-bold text-gray-900 mb-1">{s.lbRenumberFloor.replace(/…$/, '')} — {modal.bid} · {labelOfFloor(modal.bid, modal.floor)}</h3>
          <p className="text-[11px] text-gray-500 mb-3">{s.lbRenumberHint}</p>
          <div className="flex gap-3 mb-3">
            <label className="text-[11px] font-bold text-gray-500">
              {s.lbStartAt}
              <input data-enter-own data-renumber-start type="number" value={renum.start} onChange={e => setRenum(r => ({ ...r, start: e.target.value }))}
                className="block mt-1 w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold" />
            </label>
            <label className="text-[11px] font-bold text-gray-500">
              {s.lbDirection}
              <select value={renum.dir} onChange={e => setRenum(r => ({ ...r, dir: e.target.value as 'ltr' | 'rtl' }))}
                className="block mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                <option value="ltr">{s.lbLeftToRight}</option>
                <option value="rtl">{s.lbRightToLeft}</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {renumberPreview.map(p => (
              <span key={p.id} className={`text-[11px] px-2 py-0.5 rounded border ${p.from === p.to ? 'border-gray-200 text-gray-400' : 'border-amber-300 bg-amber-50 text-amber-800 font-bold'}`}>
                {p.from} → {p.to}
              </span>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <Btn tone={tone} onClick={() => setModal(null)}>{s.cancel}</Btn>
            <Btn tone={tone} primary hook="data-modal-apply" onClick={applyRenumber}>{s.lbApply}</Btn>
          </div>
        </Shell>
      )}
      {modal?.kind === 'save' && (
        <Shell onClose={() => setModal(null)} hook="data-save-modal" width={520}>
          <h3 className="font-bold text-gray-900 mb-3">{changes.length ? s.lbSavePreview : s.lbNoChanges}</h3>
          <div className="max-h-[52vh] overflow-y-auto mb-4 space-y-1.5">
            {changes.map(c => (
              <div key={c.key} data-save-change className="rounded-lg border border-gray-200 px-3 py-2">
                <div className="text-[12px] font-bold text-gray-800">{c.title}</div>
                {c.lines.map((l, i) => <div key={i} className="text-[11.5px] text-gray-600">· {l}</div>)}
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <Btn tone={tone} onClick={() => setModal(null)}>{s.cancel}</Btn>
            <Btn tone={tone} primary hook="data-save-write" disabled={!changes.length} onClick={writeAll}>{fmt(s.lbWrite, { n: changes.length })}</Btn>
          </div>
        </Shell>
      )}
      {modal?.kind === 'discard' && (
        <Shell onClose={() => setModal(null)} hook="data-discard-modal" width={380}>
          <h3 className="font-bold text-gray-900 mb-4">{s.lbDiscardAsk}</h3>
          <div className="flex gap-2 justify-end">
            <Btn tone={tone} onClick={() => setModal(null)}>{s.lbKeepEditing}</Btn>
            <Btn tone={tone} primary hook="data-discard-yes" onClick={() => { setModal(null); onClose(); }}>{s.lbDiscard}</Btn>
          </div>
        </Shell>
      )}
    </div>,
    document.body,
  );
}
