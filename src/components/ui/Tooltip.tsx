import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * The bubble renders through a PORTAL at fixed viewport coordinates, not
 * absolutely inside the trigger. The old in-place version was clipped by any
 * overflow container above it — the job window's own panel cut tooltips off
 * at its edges — and no z-index can save a child from its parent's scissors.
 * Position is measured from the trigger on hover and nudged back inside the
 * viewport, so a tooltip near an edge slides over instead of running off.
 */
export function Tooltip({ text, children, side = 'top' }: TooltipProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  if (!text) return <>{children}</>;

  function show() {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const GAP = 6;
    let x = r.left + r.width / 2;
    let y = side === 'bottom' ? r.bottom + GAP : r.top - GAP;
    if (side === 'left') { x = r.left - GAP; y = r.top + r.height / 2; }
    if (side === 'right') { x = r.right + GAP; y = r.top + r.height / 2; }
    setAt({ x, y });
  }

  const transform =
    side === 'top' ? 'translate(-50%, -100%)'
    : side === 'bottom' ? 'translate(-50%, 0)'
    : side === 'left' ? 'translate(-100%, -50%)'
    : 'translate(0, -50%)';

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={() => setAt(null)}
      onFocus={show}
      onBlur={() => setAt(null)}
    >
      {children}
      {at && createPortal(
        <span
          role="tooltip"
          className="hidden md:block pointer-events-none fixed z-[400]"
          style={{ left: Math.min(Math.max(at.x, 8), window.innerWidth - 8), top: at.y, transform }}
        >
          <span className="block bg-gray-900 text-white text-[11px] font-medium rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap leading-tight max-w-[280px] md:whitespace-normal">
            {text}
          </span>
        </span>,
        document.body,
      )}
    </span>
  );
}
