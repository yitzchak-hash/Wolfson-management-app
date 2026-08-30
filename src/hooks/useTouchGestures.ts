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
    onGestureStart,
    onGesture,
    onGestureEnd,
    enabled = true,
  }: {
    /**
     * Two fingers landed. The consumer snapshots its zoom and pan HERE and
     * derives every frame of the gesture from that snapshot — and stands
     * down any single-finger pan already running, or the two systems fight
     * over the board and it jumps (the owner's exact report on the Samsung
     * display).
     */
    onGestureStart: (centerX: number, centerY: number) => void;
    /**
     * The gesture, ABSOLUTE since its start — never an increment:
     * `scale` is currentDistance / startDistance, `dx`/`dy` is how far the
     * midpoint has travelled. The zoom ANCHOR is the first-touch centre
     * (handed to onGestureStart), fixed for the whole gesture — per-frame
     * ratios anchored at a drifting midpoint accumulate error and double-
     * count the pan, which is what made the pinch jump all over.
     */
    onGesture: (scale: number, dx: number, dy: number) => void;
    onGestureEnd?: () => void;
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
      const cx = (a.clientX + b.clientX) / 2;
      const cy = (a.clientY + b.clientY) / 2;
      state.current = { dist: Math.max(1, dist(a, b)), cx, cy };
      onGestureStart(cx, cy);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !state.current) return;
      // Two fingers always mean navigate, never move a tile.
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const st = state.current;
      onGesture(
        dist(a, b) / st.dist,
        (a.clientX + b.clientX) / 2 - st.cx,
        (a.clientY + b.clientY) / 2 - st.cy,
      );
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && state.current) {
        state.current = null;
        onGestureEnd?.();
      }
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
  }, [el, enabled, onGestureStart, onGesture, onGestureEnd]);
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
