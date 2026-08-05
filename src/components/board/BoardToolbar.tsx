import React, { useRef, useState } from 'react';
import {
  MousePointer2, Hand, Plus, StickyNote, Square, Type, Pen, Highlighter,
  Palette, Maximize, Settings, Timer, Clock, Keyboard, GripVertical, Mic, Image,
  Map, LayoutGrid, X,
} from 'lucide-react';

export type BoardTool =
  | 'select' | 'pan' | 'job' | 'note' | 'box' | 'title'
  | 'pen' | 'highlighter' | 'clipart' | 'countdown' | 'stopwatch' | 'voice' | 'export';

interface ToolDef { id: BoardTool; icon: React.ElementType; label: string; tip: string }

/**
 * Floating board toolbar.
 *
 * Docked right by default and draggable anywhere, Photoshop-style. Every button
 * carries a text label underneath as well as a short tooltip — the labels are
 * what make it usable on the interactive display, where hovering to discover an
 * icon is not practical.
 */
/**
 * Tools only.
 *
 * Anything that is really a *thing you place* rather than a *way of working*
 * belongs in the widget store: clip art, countdowns and stopwatches all moved
 * there. What is left is the handful of gestures — select, pan, draw — plus the
 * three raw board pieces that are not widgets (job, note, box, title).
 */
const TOOLS: ToolDef[][] = [
  [
    { id: 'select', icon: MousePointer2, label: 'Select', tip: 'Select' },
    { id: 'pan',    icon: Hand,          label: 'Pan',    tip: 'Pan · space-drag' },
  ],
  [
    { id: 'job',   icon: Plus,        label: 'Job',   tip: 'New job' },
    { id: 'note',  icon: StickyNote,  label: 'Note',  tip: 'Sticky note' },
    { id: 'box',   icon: Square,      label: 'Box',   tip: 'Section box' },
    { id: 'title', icon: Type,        label: 'Title', tip: 'Title' },
  ],
  [
    { id: 'pen',         icon: Pen,         label: 'Pen',   tip: 'Draw · right-click for colours' },
    { id: 'highlighter', icon: Highlighter, label: 'Mark',  tip: 'Highlight · right-click for colours' },
    { id: 'voice',       icon: Mic,         label: 'Voice', tip: 'Voice memo' },
  ],
  [
    { id: 'export', icon: Image, label: 'Save', tip: 'Export board image' },
  ],
];

export function BoardToolbar({
  active, onPick, onFit, onToggleSettings, onToggleControls, controlsOpen,
  onOpenStore, onToggleMap, mapOn, onPenOptions,
}: {
  active: BoardTool;
  onPick: (t: BoardTool) => void;
  onFit: () => void;
  onToggleSettings: () => void;
  onToggleControls: () => void;
  controlsOpen: boolean;
  onOpenStore: () => void;
  onToggleMap: () => void;
  mapOn: boolean;
  onPenOptions: (tool: 'pen' | 'highlighter', x: number, y: number) => void;
}) {
  // Offset from the default right-edge dock, so the toolbar can be moved anywhere
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  /**
   * On a phone the full rail covered a sixth of the board and ran off the
   * bottom, so it collapses to a single button and opens as a sheet. Desktop is
   * unchanged — the rail is the right shape when there is room for it.
   */
  const [phoneOpen, setPhoneOpen] = useState(false);

  function onGripDown(e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onGripMove(e: React.PointerEvent) {
    const st = dragRef.current;
    if (!st) return;
    setOffset({ x: st.ox + (e.clientX - st.px), y: st.oy + (e.clientY - st.py) });
  }
  function onGripUp() { dragRef.current = null; }

  const buttons = (
    <>
        {/* Drag grip */}
        <div
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          className="w-full flex justify-center py-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400"
          title="Move toolbar"
        >
          <GripVertical size={13} />
        </div>

        {TOOLS.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && <div className="w-7 h-px bg-gray-200 my-1" />}
            {group.map(({ id, icon: Icon, label, tip }) => (
              <button
                key={id}
                onClick={() => onPick(id)}
                onContextMenu={e => {
                  if (id !== 'pen' && id !== 'highlighter') return;
                  e.preventDefault(); e.stopPropagation();
                  onPenOptions(id, e.clientX, e.clientY);
                }}
                title={tip}
                className="w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-colors"
                style={active === id
                  ? { backgroundColor: '#1e3a5f', color: '#fff' }
                  : { color: '#64748b' }}
              >
                <Icon size={17} />
                <span className="text-[8.5px] font-bold leading-none">{label}</span>
              </button>
            ))}
          </React.Fragment>
        ))}

        <div className="w-7 h-px bg-gray-200 my-1" />

        <button onClick={onOpenStore} title="Widget store"
          className="w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-50">
          <LayoutGrid size={17} /><span className="text-[8.5px] font-bold leading-none">Store</span>
        </button>
        <button onClick={onToggleMap} title="Board overview"
          className="w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-colors"
          style={mapOn ? { backgroundColor: '#1e3a5f', color: '#fff' } : { color: '#64748b' }}>
          <Map size={17} /><span className="text-[8.5px] font-bold leading-none">Map</span>
        </button>
        <button onClick={onFit} title="Zoom to fit"
          className="w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-50">
          <Maximize size={17} /><span className="text-[8.5px] font-bold leading-none">Fit</span>
        </button>
        <button onClick={onToggleControls} title="Show controls"
          className="w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-colors"
          style={controlsOpen ? { backgroundColor: '#1e3a5f', color: '#fff' } : { color: '#64748b' }}>
          <Keyboard size={17} /><span className="text-[8.5px] font-bold leading-none">Keys</span>
        </button>
        <button onClick={onToggleSettings} title="Board settings"
          className="w-full flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-50">
          <Settings size={17} /><span className="text-[8.5px] font-bold leading-none">Setup</span>
        </button>
    </>
  );

  return (
    <>
      {/* Desktop: the floating rail, draggable anywhere. */}
      {/* Bottom is reserved for the minimap and the zoom readout, so the rail
          stops short of them and scrolls inside itself instead of overlapping. */}
      <div
        className="hidden md:flex absolute z-40 select-none"
        style={{ right: 12 - offset.x, top: 12 + offset.y, bottom: 124, alignItems: 'flex-start' }}
      >
        {/* Capped and scrollable: the rail grew past the bottom of a laptop
            screen once Store and Map joined it, hiding Setup entirely. */}
        <div
          className="w-[62px] bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 flex flex-col items-center gap-0.5 overflow-y-auto board-toolbar-scroll"
          style={{ maxHeight: 'calc(100% - 140px)' }}
        >
          {buttons}
        </div>
      </div>

      {/* Phone: one button, and a sheet. */}
      <button
        onClick={() => setPhoneOpen(true)}
        title="Board tools"
        className="md:hidden absolute z-40 right-3 top-3 w-11 h-11 rounded-full bg-white border border-gray-200 shadow-lg flex items-center justify-center text-[#1e3a5f]"
      >
        <LayoutGrid size={20} />
      </button>
      {phoneOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setPhoneOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div onClick={e => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-3 pb-6 max-h-[72vh] overflow-y-auto">
            <div className="flex items-center mb-2">
              <span className="text-[11px] font-extrabold text-gray-700 tracking-wide">BOARD TOOLS</span>
              <button onClick={() => setPhoneOpen(false)} className="ml-auto p-1 text-gray-400"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-5 gap-1.5 [&>button]:!w-auto" onClick={() => setPhoneOpen(false)}>
              {buttons}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Mouse & keyboard reference.
 *
 * Sits top-right ABOVE the toolbar, which shifts down to make room — so the two
 * never overlap, exactly as specified.
 */
export function BoardControlsPanel() {
  const rows: [string, string][] = [
    ['Click a job', 'Open it'],
    ['Drag a job', 'Move it'],
    ['Drag empty space', 'Move the board'],
    ['Ctrl / ⌘ + drag', 'Select several'],
    ['Ctrl / ⌘ + click', 'Add to selection'],
    ['Ctrl / ⌘ + wheel', 'Zoom board'],
    ['Wheel', 'Pan up / down'],
    ['Shift + wheel', 'Pan sideways'],
    ['Space + drag', 'Pan board'],
    ['Middle-mouse drag', 'Pan board'],
    ['Right-click', 'Menu · paste'],
    ['Delete', 'Remove selected'],
    ['Escape', 'Clear selection'],
  ];
  return (
    <div className="absolute right-[86px] top-3 z-40 w-[188px] bg-white border border-gray-200 rounded-xl shadow-lg p-2.5">
      <div className="text-[10px] font-extrabold text-gray-700 mb-1.5 tracking-wide">CONTROLS</div>
      <div className="flex flex-col gap-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-2">
            <span className="text-[9px] font-bold text-gray-700 whitespace-nowrap">{k}</span>
            <span className="flex-1 border-b border-dotted border-gray-200" />
            <span className="text-[9px] text-gray-500 whitespace-nowrap">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
