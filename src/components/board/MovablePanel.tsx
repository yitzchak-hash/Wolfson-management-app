import React, { useEffect, useRef, useState } from 'react';
import { GripVertical, X } from 'lucide-react';

/*
 * The board's one movable-panel implementation.
 *
 * Lifted out of GeneralJobsPage so the Keys panel — which lives in
 * BoardToolbar — can use the SAME one. A second drag implementation is how two
 * panels end up disagreeing about what a grip does and where a panel is
 * remembered.
 */

/**
 * Where each floating panel was last left, for THIS session only.
 *
 * Module-level rather than stored, and deliberately: where a panel sits depends
 * on the size of the screen it was moved on, so syncing it would push one
 * person's arrangement onto everybody else's monitor — the same rule the
 * board's own default zoom follows. Closing and reopening a panel finds it
 * where you put it; a reload starts it back at its dock.
 */
const PANEL_POS = new Map<string, { x: number; y: number }>();

/**
 * The drag half of a movable panel, on its own so the board's fixtures — the
 * tool rail and the overview — move exactly the way the popovers do.
 *
 * `0` while the gesture is live puts the panel back where it ships, the same
 * key that resets a size on the board. It is checked against a REF, not state:
 * the keydown and the pointerup land in the same tick often enough that a
 * state read would still see the old gesture and commit the dragged position
 * straight back over the reset — the trap the tile resize already paid for.
 */
export function usePanelDrag(id: string) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => PANEL_POS.get(id) ?? null);
  const ref = useRef<HTMLDivElement>(null);
  const grab = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '0') return;
      e.preventDefault();
      grab.current = null;
      PANEL_POS.delete(id);
      setPos(null);
      setDragging(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dragging, id]);

  function down(e: React.PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const host = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    const start = pos ?? { x: r.left - (host?.left ?? 0), y: r.top - (host?.top ?? 0) };
    grab.current = { px: e.clientX, py: e.clientY, ox: start.x, oy: start.y };
    setPos(start);
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const g = grab.current;
    if (!g) return;
    // The move must not reach the panel underneath. The overview treats a
    // pointermove with the button down as "jump the view there", so dragging
    // its handle also flung the board across the world — the press was stopped
    // and the moves were not.
    e.stopPropagation();
    const next = { x: g.ox + (e.clientX - g.px), y: g.oy + (e.clientY - g.py) };
    setPos(next);
    PANEL_POS.set(id, next);
  }
  function up(e: React.PointerEvent) { e.stopPropagation(); grab.current = null; setDragging(false); }

  /** Spread onto whatever is the grab handle. */
  const handleProps = {
    onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up,
    style: { touchAction: 'none' as const },
  };
  /** Merge over the panel's docked style once it has been moved. */
  const posStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
    : {};

  /** For a panel that also RESIZES and has to hold a corner still while it does. */
  const movePos = (dx: number, dy: number) => {
    setPos(p => {
      if (!p) return p;
      const next = { x: p.x + dx, y: p.y + dy };
      PANEL_POS.set(id, next);
      return next;
    });
  };

  return { ref, pos, posStyle, handleProps, dragging, movePos };
}

/**
 * A floating panel with a move handle in its corner.
 *
 * Until it is dragged it keeps whatever anchor it was written with (`right`,
 * `top`, …) so nothing about the default layout changes; the first drag reads
 * the panel's own rectangle and switches to explicit left/top from there.
 * Positions are relative to the panel's offset parent, which is the board
 * viewport for the docked panels and the window for the `fixed` popovers.
 */
export function MovablePanel({
  id, className, style, onClose, title, children,
}: {
  id: string;
  className: string;
  /** The dock — used until somebody moves it. */
  style: React.CSSProperties;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const { ref, pos, posStyle, handleProps, dragging } = usePanelDrag(id);

  // Escape closes it. A panel you have not noticed lays a full-screen backdrop
  // over the board and swallows every other click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={className}
      // `right` is cleared explicitly: the docked panels are anchored to the
      // right edge, and leaving that in place while setting `left` stretches
      // the panel across the board instead of moving it.
      // `transform` is cleared for the same reason as `right`: a panel docked
      // by translate(-50%,-50%) centring would jump by half its own size the
      // instant left/top were set. `pos` is measured from the rendered rect, so
      // dropping the transform leaves it exactly where it already looked.
      style={{ ...style, ...posStyle }}
    >
      {/* In the corner, INSIDE the panel — a handle floating outside it is
          clipped away the moment a panel scrolls its own contents. Each panel
          keeps its first line clear of it with a little left padding. */}
      <div
        {...handleProps}
        title={`Move ${title}`}
        className="absolute top-1 left-0.5 p-0.5 rounded text-gray-300 hover:text-gray-600
                   cursor-grab active:cursor-grabbing z-10"
      >
        <GripVertical size={13} />
      </div>
      {dragging && pos && (
        <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-gray-900/85 text-white
                        text-[10px] whitespace-nowrap pointer-events-none z-20">
          press 0 to put it back
        </div>
      )}
      {children}
    </div>
  );
}
