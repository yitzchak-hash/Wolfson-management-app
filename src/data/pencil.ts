/**
 * Apple Pencil, and the palm attached to the hand holding it.
 *
 * A tablet reports three kinds of pointer through the same events — `mouse`,
 * `touch` and `pen` — and the app was treating a pen as a mouse (right) and a
 * palm as a finger (also right, and useless). Resting your hand on the glass to
 * write is not an edge case, it is HOW people write, so the palm arrives on
 * nearly every stroke and often lands FIRST.
 *
 * The rule, in one sentence: **once a pen has been seen, fingers are ignored
 * for a moment.** Not "ignore the second contact" — that only works when the
 * pen touches down first, and a hand settles before the nib does about half the
 * time. And not "ignore fingers on a tablet", which would break scrolling for
 * anybody not holding a pencil.
 *
 * The window is deliberately generous going forwards (a palm can land well
 * after the pen lifts, at the end of a stroke) and the pen also RETROSPECTIVELY
 * cancels a touch that started moments earlier, which is the case the simple
 * version cannot cover at all.
 */

/** How long after a pen is seen that fingers stop counting, in ms. */
export const PEN_WINDOW = 700;

/**
 * How recently a touch can have started and still be disowned when a pen
 * arrives. A hand settles a little before the nib does; anything already
 * begun inside this window was the palm, not a deliberate finger drag.
 */
export const PALM_LOOKBACK = 400;

/**
 * Everything the module knows, in one place so it can be reset in a test.
 *
 * "Never" is -Infinity rather than 0, because 0 is ALSO a valid timestamp. With
 * 0 the very first finger on a fresh page was rejected as a palm — `now - 0` is
 * inside the window when `now` is small. Real clocks are large enough that this
 * never bit in the app, which is precisely why it needed a test with its own
 * timeline to surface.
 */
const seen = { pen: -Infinity, touchStart: -Infinity };

export type PointerLike = { pointerType?: string; pressure?: number };

export const isPen = (e: PointerLike): boolean => e.pointerType === 'pen';
export const isFinger = (e: PointerLike): boolean => e.pointerType === 'touch';

/**
 * Call at the top of every pointerdown/move on a drawing or dragging surface.
 *
 * `now` is a parameter so this can be driven deterministically in a test —
 * a palm-rejection rule tested against the wall clock is a rule tested once.
 */
export function notePointer(e: PointerLike, now = Date.now()): void {
  if (isPen(e)) seen.pen = now;
  else if (isFinger(e)) seen.touchStart = now;
}

/** Has a pen been in play just now? */
export const penActive = (now = Date.now()): boolean => now - seen.pen < PEN_WINDOW;

/**
 * Should this event be thrown away as palm contact?
 *
 * Only ever true for a finger, and only while a pen is in play. A mouse and a
 * pen are always honoured.
 */
export function isPalm(e: PointerLike, now = Date.now()): boolean {
  return isFinger(e) && penActive(now);
}

/**
 * Did a touch that is already running turn out to be a palm?
 *
 * Asked when a PEN comes down while a finger gesture is in progress: if that
 * gesture began within the lookback it was the hand settling, and whatever it
 * started should be abandoned rather than fighting the stroke.
 */
export function touchWasPalm(now = Date.now()): boolean {
  return now - seen.touchStart < PALM_LOOKBACK;
}

/** Forget everything. Used between test cases; harmless in the app. */
export function resetPenState(): void {
  seen.pen = -Infinity;
  seen.touchStart = -Infinity;
}

/**
 * Is the primary input a finger rather than a mouse?
 *
 * This decides whether hover-only controls have to be revealed another way. It
 * is NOT "is this an iPad" — a touchscreen laptop has the same problem, and an
 * iPad with a trackpad attached does not. `any-hover: none` asks the question
 * that actually matters: is there any pointer here that can hover.
 */
export function isTouchPrimary(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(any-hover: none)').matches;
}

/**
 * An iPad, including the ones that lie about it.
 *
 * iPadOS 13+ reports itself as a Macintosh, so the user agent alone says "this
 * is a desktop Mac". A Mac with a touchscreen does not exist, so touch points
 * on a claimed Macintosh mean an iPad.
 */
export function isIPad(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return true;
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}
