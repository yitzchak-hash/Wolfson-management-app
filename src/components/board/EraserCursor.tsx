import React, { useEffect, useRef } from 'react';

/**
 * The eraser's outline, following the pointer at the eraser's true size.
 *
 * The width is stored in BOARD units (`planErase` halves it in board space), so
 * the circle is scaled by the zoom — what is drawn is exactly the reach of the
 * next press at this zoom, which is what makes the size buttons mean something
 * on screen. The div is positioned imperatively from its own window listener,
 * so a 60fps pointermove never re-renders the board; it hides once the pointer
 * leaves its host, so it cannot hover over the toolbar pretending the rail is
 * erasable.
 *
 * Shared with the group window, which is a board too — an eraser that showed
 * its reach in one place and not the other would read as a different tool.
 */
export function EraserCursor({ width, zoom, hostRef }: {
  width: number; zoom: number; hostRef: React.RefObject<HTMLDivElement | null>;
}) {
  const dotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const dot = dotRef.current, host = hostRef.current;
      if (!dot || !host) return;
      const r = host.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right
        && e.clientY >= r.top && e.clientY <= r.bottom;
      dot.style.display = inside ? 'block' : 'none';
      dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }
    // Capture phase: a drag with pointer capture retargets events, but they
    // still pass the window on the way down.
    window.addEventListener('pointermove', onMove, true);
    return () => window.removeEventListener('pointermove', onMove, true);
  }, [hostRef]);
  const d = Math.max(6, width * zoom);
  return (
    <div ref={dotRef} className="fixed left-0 top-0 z-[95] pointer-events-none" style={{ display: 'none' }}>
      <div
        className="rounded-full"
        style={{
          width: d, height: d, marginLeft: -d / 2, marginTop: -d / 2,
          border: '1.5px solid rgba(30,58,95,.85)',
          backgroundColor: 'rgba(255,255,255,.28)',
          boxShadow: '0 0 0 1px rgba(255,255,255,.7)',
        }}
      />
    </div>
  );
}

/** Ink colours offered on the board's own quick strip. */
export const INK_COLOURS = [
  '#1e3a5f', '#0f172a', '#dc2626', '#ea580c', '#16a34a', '#2563eb', '#7c3aed', '#db2777',
];
export const MARKER_COLOURS = [
  '#facc15', '#fb923c', '#4ade80', '#38bdf8', '#f472b6', '#a78bfa',
];
