import React, { useMemo, useState } from 'react';
import { Copy, Check, Wand2, Plus, Trash2, ArrowLeftRight, Link2, Unlink, Layers } from 'lucide-react';
import {
  LayoutBuilding, LayoutSlot, ProjectLayout, JoinKind, SlotPos,
  findDuplicateNumbers, countUnits, generateGrid,
  newSlot, joinSlots, unjoinSlot, joinRefusal, findSlot, isDuplexUpper,
} from '../../data/projectLayout';
import { buildImportPrompt, parseLayoutJson, ParseResult } from '../../data/layoutImport';
import { BuilderMenu, BuilderMenuState, BuilderTarget } from './BuilderMenu';
import { NumberingPanel } from './NumberingPanel';

const CELL_W = 54;
const CELL_H = 40;
const ROW_GAP = 6;

/**
 * Visual builder for a project's buildings.
 *
 * Everything here edits a LAYOUT, never apartment records directly. Records are
 * regenerated from the layout on save, matching by building + number, so stages,
 * tasks, photos and Drive links survive an edit — the identity is the record,
 * not the number printed on the tile.
 *
 * ── Why there are no tool modes ────────────────────────────────────────────
 * This used to arm a tool and then interpret a click six different ways, which
 * is the whole reason the controls felt wrong. Now a click selects, and what
 * happens next is chosen explicitly. Joining is a two-step gesture because it
 * is a two-thing action: pick the apartment, press Duplex or Connect, then
 * click the neighbour it joins to. Its eligible neighbours light up, and an
 * impossible pick is refused with the reason rather than silently ignored.
 */
export function ProjectBuilder({
  initial, onSave, onToast,
}: {
  initial: ProjectLayout;
  onSave: (layout: ProjectLayout) => void;
  onToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [layout, setLayout] = useState<ProjectLayout>(initial);
  const [sel, setSel] = useState<{ b: number; f: number; s: number } | null>(null);
  /** Armed join: waiting for the second click that says which neighbour. */
  const [joining, setJoining] = useState<JoinKind | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<ParseResult | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [drag, setDrag] = useState<{ b: number; f: number; s: number } | null>(null);
  const [menu, setMenu] = useState<BuilderMenuState | null>(null);
  const [numbering, setNumbering] = useState<number | null>(null);
  /** Copied position / floor. Plain data, so pasting never shares a uid. */
  const [slotClip, setSlotClip] = useState<LayoutSlot | null>(null);
  const [floorClip, setFloorClip] = useState<LayoutSlot[] | null>(null);
  const [big, setBig] = useState(false);

  const units = useMemo(() => countUnits(layout), [layout]);

  function edit(fn: (l: ProjectLayout) => ProjectLayout) {
    setLayout(l => fn(structuredClone(l)));
  }

  const slotAt = (p: { b: number; f: number; s: number } | null): LayoutSlot | null =>
    p ? layout.buildings[p.b]?.floors[p.f]?.slots[p.s] ?? null : null;
  const selSlot = slotAt(sel);

  /** True when this position is the upper half of a duplex reaching up from below. */
  function eatenByDuplexBelow(b: number, f: number, s: number): boolean {
    const slot = layout.buildings[b]?.floors[f]?.slots[s];
    return !!slot && isDuplexUpper(slot);
  }

  /** During an armed join, the neighbours that would actually accept it. */
  function isJoinCandidate(b: number, f: number, s: number): boolean {
    if (!joining || !sel || sel.b !== b) return false;
    return joinRefusal(layout.buildings[b], { f: sel.f, s: sel.s }, { f, s }, joining) === null;
  }

  function clickCell(b: number, f: number, s: number) {
    if (joining && sel && sel.b === b) {
      const why = joinRefusal(layout.buildings[b], { f: sel.f, s: sel.s }, { f, s }, joining);
      if (why) { setRefusal(why); return; }
      const kind = joining;
      edit(l => { joinSlots(l.buildings[b], { f: sel.f, s: sel.s }, { f, s }, kind); return l; });
      setJoining(null); setRefusal(null);
      onToast(kind === 'duplex' ? 'Duplex made — one home over two floors' : 'Apartments connected');
      return;
    }
    setSel({ b, f, s });
    setRefusal(null);
  }

  function armJoin(kind: JoinKind) {
    if (!sel || !selSlot) return;
    if (selSlot.joinUid) {
      edit(l => { unjoinSlot(l.buildings[sel.b], selSlot.uid); return l; });
      onToast('Separated');
      return;
    }
    setJoining(joining === kind ? null : kind);
    setRefusal(null);
  }

  function setKind(kind: 'apartment' | 'gap') {
    if (!sel) return;
    edit(l => {
      const slot = l.buildings[sel.b].floors[sel.f].slots[sel.s];
      if (slot.joinUid) unjoinSlot(l.buildings[sel.b], slot.uid);
      const fresh = l.buildings[sel.b].floors[sel.f].slots[sel.s];
      fresh.kind = kind;
      if (kind === 'gap') { delete fresh.number; delete fresh.pinned; }
      return l;
    });
    setJoining(null);
  }

  /** Dropping one position on another swaps what sits in them. */
  function dropOn(b: number, f: number, s: number) {
    if (!drag || drag.b !== b) { setDrag(null); return; }
    edit(l => {
      const from = l.buildings[b].floors[drag.f].slots;
      const to = l.buildings[b].floors[f].slots;
      // A joined pair would be torn apart by a swap, so it separates first.
      [from[drag.s], to[s]].forEach(x => { if (x?.joinUid) unjoinSlot(l.buildings[b], x.uid); });
      const a = l.buildings[b].floors[drag.f].slots[drag.s];
      const bb = l.buildings[b].floors[f].slots[s];
      l.buildings[b].floors[drag.f].slots[drag.s] = bb;
      l.buildings[b].floors[f].slots[s] = a;
      return l;
    });
    setSel({ b, f, s });
    setDrag(null);
  }

  /** A fresh copy of a slot: same content, new identity, no join. */
  function detached(src: LayoutSlot): LayoutSlot {
    return { ...newSlot(src.kind), number: src.number, pinned: src.pinned };
  }

  const T = menu?.target;
  const menuSlot = T?.kind === 'slot'
    ? layout.buildings[T.b]?.floors[T.f]?.slots[T.s] ?? null : null;

  /** Which joins would actually be accepted from the menu's position. */
  function joinable(kind: JoinKind) {
    if (!T || T.kind !== 'slot') return { up: false, down: false, left: false, right: false };
    const B = layout.buildings[T.b];
    const test = (f: number, sx: number) =>
      !!B.floors[f]?.slots[sx] && joinRefusal(B, { f: T.f, s: T.s }, { f, s: sx }, kind) === null;
    return {
      up: test(T.f - 1, T.s), down: test(T.f + 1, T.s),
      left: test(T.f, T.s - 1), right: test(T.f, T.s + 1),
    };
  }

  const actions = {
    copySlot: () => { if (menuSlot) setSlotClip(structuredClone(menuSlot)); onToast('Copied'); },
    cutSlot: () => {
      if (!menuSlot || !T || T.kind !== 'slot') return;
      setSlotClip(structuredClone(menuSlot));
      edit(l => {
        const sl = l.buildings[T.b].floors[T.f].slots[T.s];
        if (sl.joinUid) unjoinSlot(l.buildings[T.b], sl.uid);
        l.buildings[T.b].floors[T.f].slots[T.s] = newSlot('gap');
        return l;
      });
      onToast('Cut');
    },
    pasteSlot: () => {
      if (!slotClip || !T || T.kind !== 'slot') return;
      edit(l => {
        const old = l.buildings[T.b].floors[T.f].slots[T.s];
        if (old.joinUid) unjoinSlot(l.buildings[T.b], old.uid);
        l.buildings[T.b].floors[T.f].slots[T.s] = detached(slotClip);
        return l;
      });
    },
    duplicateSlot: () => {
      if (!menuSlot || !T || T.kind !== 'slot') return;
      edit(l => {
        const row = l.buildings[T.b].floors[T.f].slots;
        const free = row.findIndex((x, i) => i > T.s && x.kind === 'gap');
        const copy = detached(menuSlot);
        delete copy.number; delete copy.pinned;   // a duplicate needs its own number
        if (free === -1) row.push(copy); else row[free] = copy;
        return l;
      });
    },
    makeDuplex: (dir: 'up' | 'down') => {
      if (!T || T.kind !== 'slot') return;
      const f2 = dir === 'up' ? T.f - 1 : T.f + 1;
      edit(l => { joinSlots(l.buildings[T.b], { f: T.f, s: T.s }, { f: f2, s: T.s }, 'duplex'); return l; });
      onToast('Duplex made — one home over two floors');
    },
    connect: (dir: 'up' | 'down' | 'left' | 'right') => {
      if (!T || T.kind !== 'slot') return;
      const p = dir === 'up' ? { f: T.f - 1, s: T.s } : dir === 'down' ? { f: T.f + 1, s: T.s }
        : dir === 'left' ? { f: T.f, s: T.s - 1 } : { f: T.f, s: T.s + 1 };
      edit(l => { joinSlots(l.buildings[T.b], { f: T.f, s: T.s }, p, 'connected'); return l; });
      onToast('Apartments connected');
    },
    separate: () => {
      if (!menuSlot || !T || T.kind !== 'slot') return;
      edit(l => { unjoinSlot(l.buildings[T.b], menuSlot.uid); return l; });
      onToast('Separated');
    },
    toggleEmpty: () => {
      if (!T || T.kind !== 'slot') return;
      setSel({ b: T.b, f: T.f, s: T.s });
      setKind(menuSlot?.kind === 'gap' ? 'apartment' : 'gap');
    },
    togglePin: () => {
      if (!T || T.kind !== 'slot') return;
      edit(l => { const x = l.buildings[T.b].floors[T.f].slots[T.s]; x.pinned = !x.pinned; return l; });
    },
    clearNumber: () => {
      if (!T || T.kind !== 'slot') return;
      edit(l => { const x = l.buildings[T.b].floors[T.f].slots[T.s]; delete x.number; delete x.pinned; return l; });
    },
    deleteSlot: () => {
      if (!T || T.kind !== 'slot') return;
      edit(l => {
        const x = l.buildings[T.b].floors[T.f].slots[T.s];
        if (x.joinUid) unjoinSlot(l.buildings[T.b], x.uid);
        l.buildings[T.b].floors[T.f].slots.splice(T.s, 1);
        return l;
      });
      setSel(null);
    },

    addFloor: (where: 'above' | 'below') => {
      if (!T || T.kind === 'building') return;
      const f = T.f;
      edit(l => {
        const B = l.buildings[T.b];
        const width = B.floors[f]?.slots.length ?? 4;
        B.floors.splice(where === 'above' ? f : f + 1, 0,
          { label: '', slots: Array.from({ length: width }, () => newSlot('apartment')) });
        return l;
      });
    },
    duplicateFloor: () => {
      if (!T || T.kind === 'building') return;
      edit(l => {
        const B = l.buildings[T.b];
        const src = B.floors[T.f];
        // Copies never carry joins or numbers: a join spans two floors and a
        // number must be unique, so both belong to the original only.
        B.floors.splice(T.f, 0, {
          label: '',
          slots: src.slots.map(x => ({ ...newSlot(x.kind) })),
        });
        return l;
      });
    },
    copyFloor: () => {
      if (!T || T.kind === 'building') return;
      setFloorClip(structuredClone(layout.buildings[T.b].floors[T.f].slots));
      onToast('Floor copied');
    },
    pasteFloor: () => {
      if (!floorClip || !T || T.kind === 'building') return;
      edit(l => {
        const B = l.buildings[T.b];
        B.floors[T.f].slots.forEach(x => { if (x.joinUid) unjoinSlot(B, x.uid); });
        B.floors[T.f].slots = floorClip.map(detached);
        return l;
      });
    },
    clearFloor: () => {
      if (!T || T.kind === 'building') return;
      edit(l => {
        const B = l.buildings[T.b];
        B.floors[T.f].slots.forEach(x => { if (x.joinUid) unjoinSlot(B, x.uid); });
        B.floors[T.f].slots = B.floors[T.f].slots.map(() => newSlot('gap'));
        return l;
      });
    },
    addPosition: () => {
      if (!T || T.kind === 'building') return;
      edit(l => { l.buildings[T.b].floors[T.f].slots.push(newSlot('apartment')); return l; });
    },
    removePosition: () => {
      if (!T || T.kind === 'building') return;
      edit(l => {
        const row = l.buildings[T.b].floors[T.f].slots;
        const last = row[row.length - 1];
        if (last?.joinUid) unjoinSlot(l.buildings[T.b], last.uid);
        row.pop();
        return l;
      });
    },
    numberFloor: () => { if (T && T.kind !== 'building') setNumbering(T.b); },
    deleteFloor: () => {
      if (!T || T.kind === 'building') return;
      edit(l => {
        const B = l.buildings[T.b];
        B.floors[T.f].slots.forEach(x => { if (x.joinUid) unjoinSlot(B, x.uid); });
        B.floors.splice(T.f, 1);
        return l;
      });
      setSel(null);
    },

    duplicateBuilding: () => {
      if (!T) return;
      edit(l => {
        const src = l.buildings[T.b];
        const n = l.buildings.length + 1;
        l.buildings.push({
          id: `${src.id}-copy${n}`,
          name: `${src.name} (copy)`,
          displayOrder: n,
          // Fresh identities throughout: a copied building is its own building.
          floors: src.floors.map(f => ({
            label: f.label,
            slots: f.slots.map(x => ({ ...newSlot(x.kind), number: x.number, pinned: x.pinned })),
          })),
        });
        return l;
      });
      onToast('Building duplicated');
    },
    mirrorBuilding: () => {
      if (!T) return;
      edit(l => {
        const B = l.buildings[T.b];
        B.floors.forEach(f => { f.slots.reverse(); });
        return l;
      });
      onToast('Mirrored');
    },
    addColumn: () => {
      if (!T) return;
      edit(l => { l.buildings[T.b].floors.forEach(f => f.slots.push(newSlot('apartment'))); return l; });
    },
    removeColumn: () => {
      if (!T) return;
      edit(l => {
        const B = l.buildings[T.b];
        B.floors.forEach(f => {
          const last = f.slots[f.slots.length - 1];
          if (last?.joinUid) unjoinSlot(B, last.uid);
          f.slots.pop();
        });
        return l;
      });
    },
    numberBuilding: () => { if (T) setNumbering(T.b); },
    deleteBuilding: () => {
      if (!T) return;
      edit(l => { l.buildings.splice(T.b, 1); return l; });
      setSel(null);
    },
  };

  function openMenu(e: React.MouseEvent, target: BuilderTarget) {
    e.preventDefault(); e.stopPropagation();
    if (target.kind === 'slot') setSel({ b: target.b, f: target.f, s: target.s });
    setMenu({ x: e.clientX, y: e.clientY, target });
    setJoining(null);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden"
      style={big ? {
        position: 'fixed', inset: 12, zIndex: 75,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(15,23,42,.35)',
      } : undefined}>
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 flex-wrap">
        <button
          onClick={() => armJoin('duplex')}
          disabled={!selSlot || selSlot.kind !== 'apartment'}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40"
          style={joining === 'duplex'
            ? { backgroundColor: '#b3541e', color: '#fff', borderColor: '#b3541e' }
            : { color: '#b3541e', borderColor: '#e5e7eb' }}>
          <Layers size={12} />
          {selSlot?.joinKind === 'duplex' ? 'Separate duplex' : 'Make duplex'}
        </button>
        <button
          onClick={() => armJoin('connected')}
          disabled={!selSlot || selSlot.kind !== 'apartment'}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40"
          style={joining === 'connected'
            ? { backgroundColor: '#2d6a9f', color: '#fff', borderColor: '#2d6a9f' }
            : { color: '#2d6a9f', borderColor: '#e5e7eb' }}>
          {selSlot?.joinKind === 'connected' ? <Unlink size={12} /> : <Link2 size={12} />}
          {selSlot?.joinKind === 'connected' ? 'Separate' : 'Connect units'}
        </button>
        <span className="w-px h-5 bg-gray-200 mx-0.5" />
        <button onClick={() => setKind(selSlot?.kind === 'gap' ? 'apartment' : 'gap')}
          disabled={!selSlot}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-gray-600 border border-gray-200 disabled:opacity-40">
          {selSlot?.kind === 'gap' ? 'Make apartment' : 'Make it empty'}
        </button>
        <span className="w-px h-5 bg-gray-200 mx-0.5" />
        <button onClick={() => setShowImport(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-[#1e3a5f] border border-gray-200">
          <Wand2 size={12} /> AI import
        </button>
        <button
          onClick={() => edit(l => {
            l.buildings.push(generateGrid({
              id: `N${l.buildings.length + 1}`, name: `Building ${l.buildings.length + 1}`,
              displayOrder: l.buildings.length + 1, floors: 8, perFloor: 4,
            }));
            return l;
          })}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-gray-600 border border-gray-200">
          <Plus size={12} /> Building
        </button>
        <button onClick={() => setNumbering(0)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-[#1e3a5f] border border-gray-200">
          <ArrowLeftRight size={12} /> Numbering
        </button>
        <button onClick={() => setBig(v => !v)}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-gray-600 border border-gray-200">
          {big ? 'Shrink' : 'Full screen'}
        </button>
        <span className="ml-auto text-[11px] font-bold text-gray-400 tabular-nums">{units} units</span>
        <button onClick={() => { onSave(layout); onToast('Layout saved'); }}
          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-bold">Save</button>
      </div>

      {/* Armed-join banner: the second click is the one that does it. */}
      {joining && (
        <div className="px-3 py-2 text-[11.5px] font-semibold flex items-center gap-2"
          style={{ backgroundColor: joining === 'duplex' ? '#fbeade' : '#e2edf6',
                   color: joining === 'duplex' ? '#8a3f14' : '#1f4d75' }}>
          {joining === 'duplex'
            ? 'Now click the apartment directly above or below it.'
            : 'Now click the apartment next to it — above, below, left or right.'}
          <button onClick={() => { setJoining(null); setRefusal(null); }}
            className="ml-auto text-[11px] underline">Cancel</button>
        </div>
      )}
      {refusal && (
        <div className="px-3 py-2 text-[11.5px] font-semibold bg-amber-50 text-amber-800">{refusal}</div>
      )}

      {/* Buildings — the drawing gets the room, so it scrolls in both directions
          and grows to whatever height is available in full screen. */}
      <div className={`flex gap-6 overflow-auto p-4 items-start ${big ? 'flex-1 min-h-0' : ''}`}
        style={big ? undefined : { maxHeight: '58vh' }}>
        {layout.buildings.map((b, bi) => {
          const dupes = findDuplicateNumbers(b);
          let mine = 0;
          b.floors.forEach(fl => fl.slots.forEach(sl => {
            if (sl.kind === 'apartment' && !isDuplexUpper(sl)) mine++;
          }));
          return (
            <div key={b.id} className="flex-none">
              <div className="flex items-center gap-1.5 mb-2">
                <input
                  value={b.name}
                  onChange={e => edit(l => { l.buildings[bi].name = e.target.value; return l; })}
                  onContextMenu={e => openMenu(e, { kind: 'building', b: bi })}
                  title="Right-click for building actions"
                  className="font-bold text-[13px] text-gray-900 bg-transparent border-b-2 border-gray-800 outline-none focus:border-[#2d6a9f] px-0.5 pb-0.5"
                  style={{ width: 120 }}
                />
                <span className="text-[10.5px] font-bold text-gray-400 tabular-nums">{mine} units</span>
                <button onClick={() => edit(l => { l.buildings.splice(bi, 1); return l; })}
                  className="p-1 text-gray-300 hover:text-red-500" title="Remove building">
                  <Trash2 size={12} />
                </button>
              </div>

              {dupes.length > 0 && (
                <div className="text-[9.5px] text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 mb-1.5">
                  Duplicate number: {dupes.join(', ')}
                </div>
              )}

              {b.floors.map((floor, fi) => (
                <div key={fi} className="flex items-stretch gap-2">
                  <input
                    value={floor.label}
                    onChange={e => edit(l => { l.buildings[bi].floors[fi].label = e.target.value; return l; })}
                    onContextMenu={e => openMenu(e, { kind: 'floor', b: bi, f: fi })}
                    className="w-8 flex-none text-right text-[10.5px] font-bold text-gray-400 bg-transparent border-r border-gray-100 outline-none focus:text-[#2d6a9f] pr-2 tabular-nums"
                    title="Floor label · right-click for floor actions"
                  />
                  <div className="flex" style={{ gap: ROW_GAP, paddingTop: 3, paddingBottom: 3 }}>
                    {floor.slots.map((slot, si) => {
                      const isSel = !!sel && sel.b === bi && sel.f === fi && sel.s === si;
                      const eaten = eatenByDuplexBelow(bi, fi, si);
                      const candidate = isJoinCandidate(bi, fi, si);
                      const isApt = slot.kind === 'apartment';
                      const dup = slot.joinKind === 'duplex' && slot.joinPrimary;
                      const conn = slot.joinKind === 'connected';

                      // A duplex grows UP out of its own row and covers the
                      // position above — the fix for the thing that only ever
                      // made its own box taller.
                      const style: React.CSSProperties = {
                        width: CELL_W,
                        height: dup ? CELL_H * 2 + ROW_GAP : CELL_H,
                        marginTop: dup ? -(CELL_H + ROW_GAP) : 0,
                        zIndex: dup ? 2 : 1,
                        visibility: eaten ? 'hidden' : 'visible',
                        backgroundColor: !isApt ? 'transparent'
                          : dup ? '#fbeade' : conn ? '#e2edf6' : '#ffffff',
                        borderStyle: isApt ? 'solid' : 'dashed',
                        borderWidth: 1.5,
                        borderColor: isSel ? '#1c1f26'
                          : candidate ? '#2f7d4f'
                          : dup ? '#d08a5e' : conn ? '#7aa8cb'
                          : isApt ? '#e2e8f0' : '#cbd5e1',
                        boxShadow: isSel ? '0 0 0 2.5px rgba(28,31,38,.2)'
                          : candidate ? '0 0 0 2.5px rgba(47,125,79,.25)' : undefined,
                        color: dup ? '#b3541e' : conn ? '#2d6a9f' : '#334155',
                        ...(isApt ? {} : {
                          backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 4px, #d8d2c4 4px 5px)',
                        }),
                      };

                      return (
                        <div
                          key={slot.uid}
                          role="button"
                          tabIndex={eaten ? -1 : 0}
                          draggable={!eaten}
                          onDragStart={() => setDrag({ b: bi, f: fi, s: si })}
                          onDragOver={e => { if (drag && drag.b === bi) e.preventDefault(); }}
                          onDrop={e => { e.preventDefault(); dropOn(bi, fi, si); }}
                          onClick={() => !eaten && clickCell(bi, fi, si)}
                          onContextMenu={e => !eaten && openMenu(e, { kind: 'slot', b: bi, f: fi, s: si })}
                          onKeyDown={e => { if (e.key === 'Enter') clickCell(bi, fi, si); }}
                          className="relative flex items-end justify-center rounded font-bold cursor-pointer select-none transition-colors"
                          style={style}
                        >
                          {dup && (
                            <>
                              <span className="absolute left-1 right-1 border-t border-dashed"
                                style={{ top: CELL_H + ROW_GAP / 2, borderColor: 'rgba(179,84,30,.5)' }} />
                              <span className="absolute top-1 left-0 right-0 text-center text-[8px] tracking-wider opacity-80">
                                2 FLOORS
                              </span>
                            </>
                          )}
                          {conn && (
                            <span className="absolute top-1 left-0 right-0 text-center text-[8px] tracking-wider opacity-80">
                              JOINED
                            </span>
                          )}
                          <span className="pb-2 text-[12.5px] tabular-nums">
                            {isApt ? (slot.number ?? '–') : ''}
                          </span>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => edit(l => { l.buildings[bi].floors[fi].slots.push(newSlot('apartment')); return l; })}
                      className="w-5 flex-none rounded text-gray-300 hover:text-gray-500 text-[13px]"
                      title="Add a position on this floor">+</button>
                  </div>
                </div>
              ))}

              <div className="flex gap-1.5 mt-2 ml-10">
                <button
                  onClick={() => edit(l => {
                    const width = l.buildings[bi].floors[0]?.slots.length ?? 4;
                    l.buildings[bi].floors.unshift({ label: '', slots: Array.from({ length: width }, () => newSlot('apartment')) });
                    return l;
                  })}
                  className="text-[10px] font-bold text-gray-500 border border-dashed border-gray-300 rounded px-2 py-1">
                  + floor above
                </button>
                <button
                  onClick={() => edit(l => {
                    const width = l.buildings[bi].floors[0]?.slots.length ?? 4;
                    l.buildings[bi].floors.push({ label: '', slots: Array.from({ length: width }, () => newSlot('apartment')) });
                    return l;
                  })}
                  className="text-[10px] font-bold text-gray-500 border border-dashed border-gray-300 rounded px-2 py-1">
                  + below
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Inspector */}
      <div className="border-t border-gray-100 px-4 py-3 flex flex-wrap items-end gap-4 bg-slate-50/60">
        <div>
          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Number</div>
          <input
            value={selSlot?.number ?? ''}
            disabled={!selSlot || selSlot.kind !== 'apartment' || isDuplexUpper(selSlot)}
            onChange={e => edit(l => {
              const s = l.buildings[sel!.b].floors[sel!.f].slots[sel!.s];
              s.number = e.target.value || undefined;
              s.pinned = !!e.target.value;   // typed by hand = pinned
              return l;
            })}
            placeholder="–"
            className="w-24 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums disabled:bg-gray-50 disabled:text-gray-300"
          />
        </div>
        <div className="text-[11.5px] text-gray-500 max-w-[42ch] leading-snug">
          {!selSlot ? 'Click any position to select it. Drag one to move it.'
            : selSlot.joinKind === 'duplex'
              ? 'One home over two floors. It takes one number and counts once.'
            : selSlot.joinKind === 'connected'
              ? 'Two homes knocked together. Both keep their own number and both count.'
            : selSlot.kind === 'gap' ? 'An empty position — nothing is built here.'
            : selSlot.pinned ? 'This number was typed by hand, so a renumber leaves it alone.'
            : 'Drag it to move it. Duplex joins it to the floor above or below; Connect also works sideways.'}
        </div>
      </div>

      {/* Numbering, previewed properly */}
      {numbering !== null && layout.buildings[numbering] && (
        <NumberingPanel
          building={layout.buildings[numbering]}
          onClose={() => setNumbering(null)}
          onApply={next => {
            edit(l => { l.buildings[numbering] = next; return l; });
            setNumbering(null);
            onToast('Numbering applied');
          }}
        />
      )}

      {/* Right-click */}
      {menu && (
        <BuilderMenu
          state={menu}
          onClose={() => setMenu(null)}
          actions={actions}
          info={{
            slot: menuSlot,
            canDuplex: joinable('duplex'),
            canConnect: joinable('connected'),
            hasSlotClipboard: !!slotClip,
            hasFloorClipboard: !!floorClip,
            floorLabel: T && T.kind !== 'building' ? layout.buildings[T.b]?.floors[T.f]?.label : undefined,
            buildingName: T ? layout.buildings[T.b]?.name : undefined,
          }}
        />
      )}

      {/* AI import */}
      {showImport && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[80]" onClick={() => setShowImport(false)} />
          <div className="fixed z-[90] bg-white rounded-2xl shadow-2xl p-5 flex flex-col"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(620px,92vw)', maxHeight: '86vh' }}>
            <h3 className="font-bold text-gray-900 mb-1">Build from plans with AI</h3>
            <p className="text-xs text-gray-500 mb-3">
              Copy the prompt, paste it into ChatGPT or Claude together with your floor plans, then paste
              the JSON it returns back here.
            </p>

            <button
              onClick={() => {
                navigator.clipboard?.writeText(buildImportPrompt('this project'));
                setPromptCopied(true); setTimeout(() => setPromptCopied(false), 2000);
              }}
              className="flex items-center justify-center gap-2 py-2 rounded-lg bg-[#1e3a5f] text-white text-sm font-bold mb-3">
              {promptCopied ? <Check size={14} /> : <Copy size={14} />} Copy the prompt
            </button>

            <textarea
              value={importText}
              onChange={e => { setImportText(e.target.value); setImportResult(null); }}
              placeholder="Paste the JSON here…"
              className="flex-1 min-h-[140px] border border-gray-200 rounded-lg p-2 text-xs font-mono resize-none"
            />

            {importResult && (
              <div className="mt-2 text-xs">
                {importResult.ok && importResult.summary && (
                  <div className="text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    {importResult.summary.buildings} buildings · {importResult.summary.floors} floors ·{' '}
                    {importResult.summary.units} units · {importResult.summary.duplexes} duplexes
                  </div>
                )}
                {importResult.errors.map((e, i) => (
                  <div key={i} className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-1">{e}</div>
                ))}
                {importResult.warnings.slice(0, 4).map((w, i) => (
                  <div key={i} className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-1">{w}</div>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button onClick={() => setShowImport(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600">Cancel</button>
              <button onClick={() => setImportResult(parseLayoutJson(importText))}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-bold text-[#1e3a5f]">Check it</button>
              {importResult?.ok && importResult.layout && (
                <button
                  onClick={() => {
                    setLayout(importResult.layout!);
                    setShowImport(false);
                    onToast('Imported into the builder — review and Save');
                  }}
                  className="ml-auto px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-bold">
                  Import into builder
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
