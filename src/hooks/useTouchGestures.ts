import { useEffect, useRef } from 'react';

/**
 * Touch, trackpad and stylus gestures for the board.
 *
 * Covers three input kinds that the mouse handlers alone get wrong:
 *
 *  - **Pinch to zoom / two-finger pan** on a tablet or the Samsung interactive
 *    display. Without this every scroll attempt drags a tile, because the
 *    existing pointer handlers fire on touch too.
 *  - **Trackpad pinch**, which browsers deliver as a wheel event with ctrlKey
 *    set — handled separately in the board's own wheel listener.
 *  - **Stylus**, reported as `pointerType: 'pen'`. The Samsung pens should draw
 *    or select precisely, so they are treated as a mouse rather than a finger:
 *    a pen press must NOT begin a pan, or drawing would be impossible.
 */
export function useTouchGestures(
  el: HTMLElement | null,
  {
    onPinch,
    onPan,
    enabled = true,
  }: {
    /** scaleDelta > 1 zooms in. Centre is in client coordinates. */
    onPinch: (scaleDelta: number, centerX: number, centerY: number) => void;
    onPan: (dx: number, dy: number) => void;
    enabled?: boolean;
  },
) {
  const state = useRef<{ dist: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    if (!el || !enabled) return;

    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const [a, b] = [e.touches[0], e.touches[1]];
      state.current = {
        dist: dist(a, b),
        cx: (a.clientX + b.clientX) / 2,
        cy: (a.clientY + b.clientY) / 2,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !state.current) return;
      // Two fingers always mean navigate, never move a tile.
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = dist(a, b);
      const cx = (a.clientX + b.clientX) / 2;
      const cy = (a.clientY + b.clientY) / 2;

      const prev = state.current;
      if (prev.dist > 0 && Math.abs(d - prev.dist) > 2) {
        onPinch(d / prev.dist, cx, cy);
      }
      onPan(cx - prev.cx, cy - prev.cy);
      state.current = { dist: d, cx, cy };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) state.current = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [el, enabled, onPinch, onPan]);
}

/**
 * True when a pointer event came from a finger.
 *
 * Used to require a deliberate long-press before a touch drag moves a tile,
 * so scrolling the board with a finger does not shove jobs around. A PEN is
 * deliberately excluded — stylus input should behave like a mouse and respond
 * immediately, otherwise drawing on the Samsung display feels broken.
 */
export function isFingerTouch(e: { pointerType?: string }): boolean {
  return e.pointerType === 'touch';
}

/** Milliseconds a finger must rest before a drag starts. */
export const TOUCH_DRAG_DELAY = 260;
