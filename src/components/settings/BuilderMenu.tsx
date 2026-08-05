import React from 'react';
import {
  Copy, ClipboardPaste, Scissors, Layers, Link2, Unlink, Square, Trash2,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Pin, PinOff, Hash, Rows3,
  Columns3, FlipHorizontal, CopyPlus, Eraser,
} from 'lucide-react';
import { LayoutSlot } from '../../data/projectLayout';

/**
 * The builder's right-click menu.
 *
 * Grouped by what you are pointing at, because that is what decides which
 * actions even make sense: a position, a whole floor, or a whole building. The
 * groups are ordered by how often they are reached for — the join actions sit
 * at the top on an apartment, because that is the thing this builder exists to
 * do that nothing else can.
 *
 * Everything destructive sits alone at the bottom, behind a separator.
 */

export type BuilderTarget =
  | { kind: 'slot'; b: number; f: number; s: number }
  | { kind: 'floor'; b: number; f: number }
  | { kind: 'building'; b: number };

export interface BuilderMenuState { x: number; y: number; target: BuilderTarget }

export interface BuilderActions {
  // Position
  copySlot: () => void;
  cutSlot: () => void;
  pasteSlot: () => void;
  duplicateSlot: () => void;
  makeDuplex: (dir: 'up' | 'down') => void;
  connect: (dir: 'up' | 'down' | 'left' | 'right') => void;
  separate: () => void;
  toggleEmpty: () => void;
  togglePin: () => void;
  clearNumber: () => void;
  deleteSlot: () => void;
  // Floor
  addFloor: (where: 'above' | 'below') => void;
  duplicateFloor: () => void;
  copyFloor: () => void;
  pasteFloor: () => void;
  clearFloor: () => void;
  addPosition: () => void;
  removePosition: () => void;
  numberFloor: () => void;
  deleteFloor: () => void;
  // Building
  duplicateBuilding: () => void;
  mirrorBuilding: () => void;
  addColumn: () => void;
  removeColumn: () => void;
  numberBuilding: () => void;
  deleteBuilding: () => void;
}

export interface BuilderMenuInfo {
  slot?: LayoutSlot | null;
  /** Which join directions would actually be accepted from here. */
  canDuplex: { up: boolean; down: boolean };
  canConnect: { up: boolean; down: boolean; left: boolean; right: boolean };
  hasSlotClipboard: boolean;
  hasFloorClipboard: boolean;
  floorLabel?: string;
  buildingName?: string;
}

export function BuilderMenu({ state, info, actions, onClose }: {
  state: BuilderMenuState;
  info: BuilderMenuInfo;
  actions: BuilderActions;
  onClose: () => void;
}) {
  const A = actions;
  const t = state.target;

  const Item = ({ icon: Icon, label, onClick, disabled, danger, hint }: {
    icon: React.ElementType; label: string; onClick: () => void;
    disabled?: boolean; danger?: boolean; hint?: string;
  }) => (
    <button
      disabled={disabled}
      onClick={() => { onClick(); onClose(); }}
      className={`w-full px-3 py-1.5 text-left text-[12.5px] flex items-center gap-2.5 rounded-md disabled:opacity-30 ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'}`}
    >
      <Icon size={13} className={danger ? '' : 'text-gray-400'} />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10px] text-gray-300">{hint}</span>}
    </button>
  );
  const Sep = () => <div className="h-px bg-gray-100 my-1" />;
  const Head = ({ children }: { children: React.ReactNode }) => (
    <div className="px-3 pt-1.5 pb-1 text-[9.5px] font-extrabold text-gray-400 tracking-wider">{children}</div>
  );

  return (
    <>
      <div className="fixed inset-0 z-[95]" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-[96] bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5"
        style={{
          left: Math.min(state.x, window.innerWidth - 250),
          top: Math.min(state.y, window.innerHeight - 420),
          width: 236,
          maxHeight: '70vh', overflowY: 'auto',
        }}
      >
        {t.kind === 'slot' && (
          <>
            <Head>{info.slot?.kind === 'apartment'
              ? `APARTMENT ${info.slot.number ?? '—'}`
              : 'EMPTY POSITION'}</Head>

            {info.slot?.kind === 'apartment' && (
              <>
                {info.slot.joinUid ? (
                  <Item icon={Unlink} label={info.slot.joinKind === 'duplex' ? 'Separate the duplex' : 'Separate them'}
                    onClick={A.separate} />
                ) : (
                  <>
                    <Item icon={Layers} label="Duplex with the one above"
                      onClick={() => A.makeDuplex('up')} disabled={!info.canDuplex.up} />
                    <Item icon={Layers} label="Duplex with the one below"
                      onClick={() => A.makeDuplex('down')} disabled={!info.canDuplex.down} />
                    <Item icon={Link2} label="Connect to the left"
                      onClick={() => A.connect('left')} disabled={!info.canConnect.left} />
                    <Item icon={Link2} label="Connect to the right"
                      onClick={() => A.connect('right')} disabled={!info.canConnect.right} />
                    <Item icon={Link2} label="Connect to the one above"
                      onClick={() => A.connect('up')} disabled={!info.canConnect.up} />
                    <Item icon={Link2} label="Connect to the one below"
                      onClick={() => A.connect('down')} disabled={!info.canConnect.down} />
                  </>
                )}
                <Sep />
                <Item icon={Copy} label="Copy" onClick={A.copySlot} hint="⌘C" />
                <Item icon={Scissors} label="Cut" onClick={A.cutSlot} hint="⌘X" />
                <Item icon={ClipboardPaste} label="Paste here" onClick={A.pasteSlot}
                  disabled={!info.hasSlotClipboard} hint="⌘V" />
                <Item icon={CopyPlus} label="Duplicate into the next free spot" onClick={A.duplicateSlot} />
                <Sep />
                <Item icon={info.slot.pinned ? PinOff : Pin}
                  label={info.slot.pinned ? 'Let renumbering change it' : 'Pin this number'}
                  onClick={A.togglePin} />
                <Item icon={Eraser} label="Clear the number" onClick={A.clearNumber} />
              </>
            )}

            {info.slot?.kind === 'gap' && (
              <>
                <Item icon={Square} label="Make it an apartment" onClick={A.toggleEmpty} />
                <Item icon={ClipboardPaste} label="Paste here" onClick={A.pasteSlot}
                  disabled={!info.hasSlotClipboard} />
              </>
            )}

            <Sep />
            {info.slot?.kind === 'apartment' && (
              <Item icon={Square} label="Make it empty" onClick={A.toggleEmpty} />
            )}
            <Item icon={Trash2} label="Remove this position" onClick={A.deleteSlot} danger />
          </>
        )}

        {t.kind === 'floor' && (
          <>
            <Head>FLOOR {info.floorLabel}</Head>
            <Item icon={ArrowUp} label="Insert a floor above" onClick={() => A.addFloor('above')} />
            <Item icon={ArrowDown} label="Insert a floor below" onClick={() => A.addFloor('below')} />
            <Item icon={CopyPlus} label="Duplicate this floor" onClick={A.duplicateFloor} />
            <Sep />
            <Item icon={Copy} label="Copy the whole floor" onClick={A.copyFloor} />
            <Item icon={ClipboardPaste} label="Paste onto this floor" onClick={A.pasteFloor}
              disabled={!info.hasFloorClipboard} />
            <Sep />
            <Item icon={ArrowRight} label="Add a position" onClick={A.addPosition} />
            <Item icon={ArrowLeft} label="Remove the last position" onClick={A.removePosition} />
            <Item icon={Hash} label="Renumber this floor" onClick={A.numberFloor} />
            <Sep />
            <Item icon={Eraser} label="Empty every position" onClick={A.clearFloor} danger />
            <Item icon={Trash2} label="Delete this floor" onClick={A.deleteFloor} danger />
          </>
        )}

        {t.kind === 'building' && (
          <>
            <Head>{info.buildingName}</Head>
            <Item icon={CopyPlus} label="Duplicate the whole building" onClick={A.duplicateBuilding} />
            <Item icon={FlipHorizontal} label="Mirror it left to right" onClick={A.mirrorBuilding} />
            <Sep />
            <Item icon={Columns3} label="Add a column everywhere" onClick={A.addColumn} />
            <Item icon={Rows3} label="Remove the last column" onClick={A.removeColumn} />
            <Item icon={Hash} label="Renumber the building" onClick={A.numberBuilding} />
            <Sep />
            <Item icon={Trash2} label="Delete this building" onClick={A.deleteBuilding} danger />
          </>
        )}
      </div>
    </>
  );
}
