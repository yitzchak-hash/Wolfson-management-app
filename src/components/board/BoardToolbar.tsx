import React, { useEffect, useRef, useState } from 'react';
import { ToolbarSetup } from '../../types';
import { WIDGET_BY_ID } from '../../data/widgets';
import { MovablePanel } from './MovablePanel';
import {
  MousePointer2, Hand, Plus, StickyNote, Square, Type, Pen, Highlighter, Eraser,
  Palette, Maximize, Settings, Timer, Clock, Keyboard, GripVertical, Mic, Image,
  Map as MapIcon, LayoutGrid, X,
} from 'lucide-react';

export type BoardTool =
  | 'select' | 'pan' | 'job' | 'note' | 'box' | 'title'
  | 'pen' | 'highlighter' | 'eraser' | 'clipart' | 'countdown' | 'stopwatch' | 'voice' | 'export';

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
export const TOOL_LABELS: Record<string, string> = {
  select: 'Select', pan: 'Pan', job: 'Job', note: 'Note', box: 'Box', title: 'Title',
  pen: 'Pen', highlighter: 'Mark', eraser: 'Eraser', voice: 'Voice', export: 'Save',
};

/**
 * One scheme, and a visible way back to it.
 *
 * A click selects, a double click opens, a drag on something moves it, a drag
 * on empty board pans, Ctrl-drag lassoes, the wheel zooms to the pointer.
 * SELECT is that default made visible: it changes no mouse behaviour, it is
 * simply lit whenever no mode tool is armed, and pressing it puts whatever IS
 * armed (pen, highlighter, eraser) down. Asked for by the owner by name —
 * "if I wanna go back to the default, just build a select".
 *
 * Pen, highlighter and the eraser are modes — while armed a press draws (or
 * rubs out) instead of dragging. The eraser used to live inside the pen's
 * options panel; it is its own tile now, with its size and kind on right-click
 * exactly like the pen's colours.
 */
const TOOLS: ToolDef[][] = [
  [
    { id: 'select', icon: MousePointer2, label: 'Select', tip: 'The default — drag, drop, click to open' },
  ],
  [
    { id: 'job',   icon: Plus,        label: 'Job',   tip: 'New job' },
    { id: 'note',  icon: StickyNote,  label: 'Note',  tip: 'Sticky note' },
    { id: 'box',   icon: Square,      label: 'Box',   tip: 'Section box' },
    { id: 'title', icon: Type,        label: 'Title', tip: 'Title' },
  ],
  [
    { id: 'pen',         icon: Pen,         label: 'Pen',    tip: 'Draw · right-click for colours' },
    { id: 'highlighter', icon: Highlighter, label: 'Mark',   tip: 'Highlight · right-click for colours' },
    { id: 'eraser',      icon: Eraser,      label: 'Eraser', tip: 'Rub out · right-click for size' },
    { id: 'voice',       icon: Mic,         label: 'Voice',  tip: 'Voice memo' },
  ],
  [
    { id: 'export', icon: Image, label: 'Save', tip: 'Export board image' },
  ],
];

/**
 * The rail reflows; the buttons never scale.
 *
 * A button is a fixed 51px cell whatever size the toolbar is dragged to — the
 * box changes, what is in it does not. How many fit across is simply how much
 * width there is, so widening the rail far enough lays every button out in one
 * line and narrowing it stacks them again.
 */
const BTN_W = 50;
const GAP = 2;          // gap-x-0.5 / gap-y-0.5
const RAIL_PAD = 14;    // p-1.5 both sides, plus the 1px border — the box is border-box
const GRIP_W = 18;      // the move grip, once the rail is a single row
const SEP_W = 9;        // w-px + mx-1, a group divider once the rail is a single row
const MIN_W = RAIL_PAD + BTN_W;                  // one column
const DEFAULT_W = RAIL_PAD + BTN_W * 2 + GAP;    // 116 — the two-column rail, pixel for pixel
const MIN_H = 140;

/**
 * The rail's own size, per machine.
 *
 * localStorage rather than the synced board settings on purpose: how big the
 * toolbar wants to be is a property of the SCREEN it is on, and pushing one
 * person's wallboard-sized rail onto everybody else's laptop is wrong. Same
 * rule as `board_default_zoom_<pid>` and the Drive desktop root — and it keeps
 * a new key out of persist/export/import entirely.
 */
const SIZE_KEY = 'board_toolbar_size';
/** Broadcast so the controls panel, a sibling of the rail, can stay clear of it. */
const RAIL_SIZE_EVENT = 'board-rail-size';

function readSize(): { w: number; h: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
    if (raw && typeof raw.w === 'number' && typeof raw.h === 'number') {
      // `h: 0` means "as tall as there is room for" and must survive the clamp.
      return { w: Math.max(MIN_W, raw.w), h: raw.h ? Math.max(MIN_H, raw.h) : 0 };
    }
  } catch { /* a corrupt entry is not worth a broken toolbar */ }
  return { w: DEFAULT_W, h: 0 };
}

export function BoardToolbar({
  active, onPick, onFit, onToggleSettings, onToggleControls, controlsOpen,
  onOpenStore, onToggleMap, mapOn, onPenOptions, setup, onPickWidget,
  topGap = 0, bottomGap = 124,
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
  onPenOptions: (tool: 'pen' | 'highlighter' | 'eraser', x: number, y: number) => void;
  /** What is on the rail, from this workspace's settings. */
  setup?: ToolbarSetup;
  /** A widget promoted onto the rail, placed straight from it. */
  onPickWidget?: (widgetId: string) => void;
  /** Where the board's floating header ends — the rail starts below it. */
  topGap?: number;
  /** How much the overview takes off the bottom — the rail stops above it. */
  bottomGap?: number;
}) {
  // Offset from the default right-edge dock, so the toolbar can be moved anywhere
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  /**
   * How big the rail is allowed to be, dragged from its bottom edge or its
   * free (bottom-left) corner. Height zero means "as tall as there is room
   * for", which is the sensible default — a height is only remembered once
   * somebody has deliberately set one.
   */
  const [size, setSize] = useState(readSize);
  const sizeRef = useRef<
    { px: number; py: number; ow: number; oh: number; oh0: number; maxW: number; axis: 'y' | 'xy' } | null
  >(null);
  const railRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /**
   * On a phone the full rail covered a sixth of the board and ran off the
   * bottom, so it collapses to a single button and opens as a sheet. Desktop is
   * unchanged — the rail is the right shape when there is room for it.
   */
  const [phoneOpen, setPhoneOpen] = useState(false);

  const [gripping, setGripping] = useState(false);
  function onGripDown(e: React.PointerEvent) {
    e.preventDefault();
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    setGripping(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onGripMove(e: React.PointerEvent) {
    const st = dragRef.current;
    if (!st) return;
    setOffset({ x: st.ox + (e.clientX - st.px), y: st.oy + (e.clientY - st.py) });
  }
  function onGripUp() { dragRef.current = null; setGripping(false); }

  /**
   * `0` during the drag puts the rail back on its dock — the same key that
   * resets a size on the board, so one habit covers both. Checked against the
   * REF and cleared there, because the keydown and the pointerup can land in
   * the same tick and a state read would commit the dragged offset back over
   * the reset.
   */
  useEffect(() => {
    if (!gripping) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '0') return;
      e.preventDefault();
      dragRef.current = null;
      setOffset({ x: 0, y: 0 });
      setGripping(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gripping]);

  function onSizeDown(axis: 'y' | 'xy') {
    return (e: React.PointerEvent) => {
      e.preventDefault(); e.stopPropagation();
      const box = railRef.current?.getBoundingClientRect();
      /**
       * The ceiling is the BOARD's width, not the window's — the sidebar and
       * the page chrome are not the rail's to use, and a rail wider than its
       * containing block just hangs off the left of the board.
       */
      const host = wrapRef.current?.offsetParent as HTMLElement | null;
      sizeRef.current = {
        px: e.clientX, py: e.clientY,
        ow: box?.width ?? size.w, oh: box?.height ?? 0,
        oh0: size.h, axis,
        maxW: Math.max(MIN_W, (host?.clientWidth ?? window.innerWidth) - 48),
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };
  }
  function onSizeMove(e: React.PointerEvent) {
    const st = sizeRef.current;
    if (!st) return;
    const dy = e.clientY - st.py;
    /**
     * A corner drag that never moves vertically must leave the height on auto.
     * Pinning it to whatever was measured at pointerdown would freeze the box
     * at its tall two-column size, so reflowing into one line would leave a
     * rail of mostly empty white.
     */
    const h = st.axis === 'y' || Math.abs(dy) > 4 ? Math.max(MIN_H, st.oh + dy) : st.oh0;
    // The rail is docked to the right edge, so it grows leftwards.
    const w = st.axis === 'xy'
      ? Math.min(st.maxW, Math.max(MIN_W, st.ow - (e.clientX - st.px)))
      : size.w;
    setSize({ w, h });
  }
  function onSizeUp() {
    sizeRef.current = null;
    try { localStorage.setItem(SIZE_KEY, JSON.stringify(size)); } catch { /* private mode */ }
  }
  function resetSize() {
    setSize({ w: DEFAULT_W, h: 0 });
    try { localStorage.removeItem(SIZE_KEY); } catch { /* private mode */ }
  }

  /**
   * The controls panel parks itself against the rail's left edge, and it is a
   * sibling rendered by the board — so the width has to travel out of here.
   * An event rather than a prop because the size is local state and lifting it
   * would re-render the whole board on every pixel of a resize drag.
   */
  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent(RAIL_SIZE_EVENT, { detail: size.w }));
  }, [size.w]);

  /**
   * The rail, after the workspace's own choices.
   *
   * Order and hiding are applied here rather than baked into TOOLS, so the
   * shipped arrangement stays the fallback for any workspace that has not
   * touched it.
   */
  const shownGroups = React.useMemo(() => {
    const hidden = new Set(setup?.hidden ?? []);
    const order = setup?.tools;
    const groups = TOOLS.map(g => g.filter(t => !hidden.has(t.id))).filter(g => g.length);
    if (!order?.length) return groups;
    // `Map` is a lucide icon in this file's imports, so the global is aliased.
    const byId = new globalThis.Map<string, ToolDef>(TOOLS.flat().map(t => [t.id as string, t]));
    const picked = order.map(id => byId.get(id)).filter((t): t is ToolDef => !!t && !hidden.has(t.id));
    const rest = TOOLS.flat().filter(t => !order.includes(t.id) && !hidden.has(t.id));
    return [picked, rest].filter(g => g.length);
  }, [setup?.tools, setup?.hidden]);

  const railWidgets = (setup?.widgets ?? [])
    .map(id => WIDGET_BY_ID.get(id))
    .filter((w): w is NonNullable<typeof w> => !!w);

  /**
   * The width at which everything lands on one line.
   *
   * Counted from the real button and divider sizes rather than guessed at, so
   * the moment the rail switches to a single row is the moment a single row
   * actually fits — a threshold that is out by one button reads as a toolbar
   * that wraps for no reason.
   */
  const btnCount =
    shownGroups.reduce((n, g) => n + g.length, 0) + railWidgets.length + 5;
  const sepCount =
    Math.max(0, shownGroups.length - 1) + (railWidgets.length ? 1 : 0) + 1;
  const oneLineW =
    RAIL_PAD + GRIP_W + btnCount * (BTN_W + GAP) + sepCount * (SEP_W + GAP);
  const oneLine = size.w >= oneLineW;

  /**
   * `min-w-0` is load-bearing: a flex item's automatic minimum size is its
   * content, so a long promoted-widget name would push its button past the
   * 50px cell and knock the whole rail out of alignment.
   */
  const BTN = 'flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-colors min-w-0';
  const btnStyle = { width: BTN_W };

  /**
   * The rail's contents, in whichever shape it has been dragged to.
   *
   * Taken as a parameter rather than read from `oneLine` because the phone
   * sheet renders the same buttons in a grid and always wants the stacked
   * form — a vertical divider in a five-column grid is a stray tick mark.
   */
  const railBody = (oneLine: boolean) => {
    /**
     * A group divider.
     *
     * `flexBasis` is what makes a stacked divider take a whole line and push
     * the next group onto a fresh row; `gridColumn` is the same instruction
     * for the phone sheet, which lays the identical markup out as a grid.
     * Each container ignores the property that is not its own, so one element
     * serves both.
     *
     * `min-w-0` on the wrapper AND `max-w-full` on the rule: a flex item's
     * automatic minimum size is its content, so at a one-column rail the 64px
     * rule was the one thing making the toolbar scroll sideways.
     */
    const sep = (key: string) => oneLine
      ? <span key={key} className="self-center w-px h-8 bg-gray-200 mx-1" />
      : (
        <div key={key} className="flex items-center justify-center py-1 min-w-0"
          style={{ flexBasis: '100%', gridColumn: '1 / -1' }}>
          <span className="w-16 max-w-full h-px bg-gray-200" />
        </div>
      );

    return (
    <>
        {/* Drag grip — a full-width bar while stacked, a slim column once the rail is one line */}
        <div
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          className={`relative flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 ${
            oneLine ? 'h-9' : 'py-0.5'}`}
          style={oneLine ? { width: GRIP_W } : { flexBasis: '100%', gridColumn: '1 / -1' }}
          title="Move toolbar"
        >
          <GripVertical size={13} />
          {gripping && (
            <div className="absolute -top-6 right-0 px-1.5 py-0.5 rounded bg-gray-900/85 text-white
                            text-[10px] whitespace-nowrap pointer-events-none z-20">
              press 0 to put it back
            </div>
          )}
        </div>

        {shownGroups.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && sep(`g${gi}`)}
            {group.map(({ id, icon: Icon, label, tip }) => (
              <button
                key={id}
                onClick={() => onPick(id)}
                onContextMenu={e => {
                  if (id !== 'pen' && id !== 'highlighter' && id !== 'eraser') return;
                  e.preventDefault(); e.stopPropagation();
                  onPenOptions(id, e.clientX, e.clientY);
                }}
                title={tip}
                className={BTN}
                style={active === id
                  ? { ...btnStyle, backgroundColor: '#1e3a5f', color: '#fff' }
                  : { ...btnStyle, color: '#64748b' }}
              >
                <Icon size={17} />
                <span className="text-[8.5px] font-bold leading-none">{label}</span>
              </button>
            ))}
          </React.Fragment>
        ))}

        {railWidgets.length > 0 && (
          <>
            {sep('widgets')}
            {railWidgets.map(w => {
              const WIcon = w.icon;
              return (
                <button key={w.id} onClick={() => onPickWidget?.(w.id)} title={`${w.name} — ${w.blurb}`}
                  style={btnStyle} className={`${BTN} text-gray-500 hover:bg-gray-50`}>
                  <WIcon size={17} />
                  <span className="text-[8.5px] font-bold leading-none truncate max-w-full">{w.name}</span>
                </button>
              );
            })}
          </>
        )}

        {sep('chrome')}

        <button onClick={onOpenStore} title="Widget store"
          style={btnStyle} className={`${BTN} text-gray-500 hover:bg-gray-50`}>
          <LayoutGrid size={17} /><span className="text-[8.5px] font-bold leading-none">Store</span>
        </button>
        <button onClick={onToggleMap} title="Board overview" className={BTN}
          style={mapOn ? { ...btnStyle, backgroundColor: '#1e3a5f', color: '#fff' } : { ...btnStyle, color: '#64748b' }}>
          <MapIcon size={17} /><span className="text-[8.5px] font-bold leading-none">Map</span>
        </button>
        <button onClick={onFit} title="Zoom to fit"
          style={btnStyle} className={`${BTN} text-gray-500 hover:bg-gray-50`}>
          <Maximize size={17} /><span className="text-[8.5px] font-bold leading-none">Fit</span>
        </button>
        <button onClick={onToggleControls} title="Show controls" className={BTN}
          style={controlsOpen ? { ...btnStyle, backgroundColor: '#1e3a5f', color: '#fff' } : { ...btnStyle, color: '#64748b' }}>
          <Keyboard size={17} /><span className="text-[8.5px] font-bold leading-none">Keys</span>
        </button>
        <button onClick={onToggleSettings} title="Board settings"
          style={btnStyle} className={`${BTN} text-gray-500 hover:bg-gray-50`}>
          <Settings size={17} /><span className="text-[8.5px] font-bold leading-none">Setup</span>
        </button>
    </>
    );
  };

  return (
    <>
      {/* Desktop: the floating rail, draggable anywhere.
          It lives in the BAND between the header and the overview, centred in
          it — it used to start at the very top, where it lay across the Add job
          button at the right-hand end of the header, and stopped short of the
          overview by a number that had nothing to do with the overview's real
          height. `topGap` is the header's measured bottom; `bottomGap` clears
          whatever the overview is currently. */}
      <div
        ref={wrapRef}
        // Named so the board's pan clamp can measure the band it occupies —
        // the world's right edge must rest at the rail's LEFT edge when the
        // board de-expands, or a widget carried in from the right settles
        // underneath the toolbar. See clampPanRef in GeneralJobsPage.
        data-board-toolrail
        className="hidden md:flex absolute z-40 select-none"
        style={{
          right: 12 - offset.x,
          top: topGap + 12 + offset.y,
          bottom: bottomGap + 12,
          alignItems: 'center',
        }}
      >
        {/* Capped and scrollable: the rail grew past the bottom of a laptop
            screen once Store and Map joined it, hiding Setup entirely. Drag the
            handle at the bottom for height, or the corner for both. */}
        <div className="relative">
          {/* Two columns by default, and whatever the width allows after that.
              One column ran the full height of the board and still reached down
              into the minimap's corner; two makes the rail half as tall for the
              same buttons, which is what stops it overlapping. It is a wrapping
              FLEX row rather than a fixed grid so the column count follows the
              dragged width on its own — the buttons keep their 50px whatever
              happens, and once there is room for the lot they land in one line.
              `maxWidth` catches a width saved on a big monitor and reopened on
              a laptop: the wrapper shrinks to fit, so the rail wraps rather
              than hanging off the left of the board. */}
          <div
            ref={railRef}
            className="bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 pb-3 flex flex-wrap items-start justify-center gap-x-0.5 gap-y-0.5 content-start overflow-y-auto board-rail"
            style={{ width: size.w, maxWidth: '100%', ...(size.h ? { height: size.h } : { maxHeight: '100%' }) }}
          >
            {railBody(oneLine)}
          </div>
          <div
            onPointerDown={onSizeDown('y')}
            onPointerMove={onSizeMove}
            onPointerUp={onSizeUp}
            onPointerCancel={onSizeUp}
            onDoubleClick={resetSize}
            title="Drag to resize · double-click to fit"
            className="absolute left-4 right-0 -bottom-1 h-3 flex items-center justify-center cursor-ns-resize group/size"
          >
            <span className="w-6 h-[3px] rounded-full bg-gray-200 group-hover/size:bg-gray-400 transition-colors" />
          </div>
          {/* The corner. The rail is docked right, so its free corner is the
              bottom-LEFT one and dragging outwards means dragging left. */}
          <div
            onPointerDown={onSizeDown('xy')}
            onPointerMove={onSizeMove}
            onPointerUp={onSizeUp}
            onPointerCancel={onSizeUp}
            onDoubleClick={resetSize}
            title="Drag to resize the toolbar · double-click to reset"
            className="absolute -left-1 -bottom-1 w-4 h-4 flex items-end justify-start cursor-nesw-resize group/corner"
          >
            <span className="w-3 h-3 border-l-2 border-b-2 rounded-bl-md border-gray-200 group-hover/corner:border-gray-400 transition-colors" />
          </div>
        </div>
      </div>

      {/* Phone: one button, and a sheet. */}
      <button
        onClick={() => setPhoneOpen(true)}
        title="Board tools"
        // Bottom-LEFT. Top-3 sat exactly on the Board/Stages toggle, and
        // bottom-right sat on the board overview's corner — the overview owns
        // that corner (right-3, bottom 12px). The left one is free on a phone.
        // env(safe-area-inset-bottom) keeps it off an iPhone's home bar.
        className="md:hidden absolute z-40 left-3 w-12 h-12 rounded-full bg-[#1e3a5f] text-white shadow-lg flex items-center justify-center"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
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
              {railBody(false)}
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
export function BoardControlsPanel({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Click a job', 'Select it'],
    ['Double-click a job', 'Open it'],
    ['Drag a job', 'Move it'],
    ['Drag empty board', 'Pan'],
    ['Ctrl / ⌘ + drag', 'Lasso select'],
    ['Ctrl / ⌘ + click', 'Add to selection'],
    ['Ctrl / ⌘ + wheel', 'Zoom board'],
    ['Hold click + wheel', 'Zoom board'],
    ['Wheel', 'Pan up / down'],
    ['Shift + wheel', 'Pan sideways'],
    ['Wheel on toolbar', 'Scroll the toolbar'],
    ['Space + drag', 'Pan board'],
    ['Middle-mouse drag', 'Pan board'],
    ['Right-click', 'Menu · paste'],
    ['Delete', 'Remove selected'],
    ['Escape', 'Clear selection'],
  ];
  // Parks against the rail's left edge, whatever width the rail has been dragged to.
  const [railW, setRailW] = useState(() => readSize().w);
  React.useEffect(() => {
    const on = (e: Event) => setRailW((e as CustomEvent<number>).detail);
    window.addEventListener(RAIL_SIZE_EVENT, on);
    return () => window.removeEventListener(RAIL_SIZE_EVENT, on);
  }, []);
  return (
    // The same MovablePanel every other floating panel uses, so the grip, the
    // remembered position and the Escape-to-close all behave identically.
    <MovablePanel
      id="board-controls"
      title="Controls"
      className="absolute z-40 w-[188px] bg-white border border-gray-200 rounded-xl shadow-lg p-2.5"
      style={{ top: 12, right: railW + 24 }}
      onClose={onClose}
    >
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
    </MovablePanel>
  );
}
