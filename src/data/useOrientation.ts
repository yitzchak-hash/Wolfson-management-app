import { useEffect, useState } from 'react';

/**
 * Which way up the screen is.
 *
 * The Samsung Flip panel turns on its mount, and when it does the app has to
 * lay itself out again — a three-across dashboard is unreadable in a 1080-wide
 * portrait window, and a board fitted to a landscape width is a stamp in the
 * middle of a tall one.
 *
 * There is no device API for this and there does not need to be one: turning
 * the panel changes the window's shape, and the window's shape is the thing
 * that actually matters. `matchMedia('(orientation: portrait)')` reports it and
 * fires when it changes, on every browser the panel might be running, including
 * the Android WebView the Flip uses. `screen.orientation` exists on some of
 * them and lies on others — a rotated panel can report a landscape screen while
 * presenting a portrait window — so the window is the honest source.
 *
 * `resize` is listened to as well, because a window that is merely reshaped
 * (a split view, a browser bar appearing) crosses the same threshold without
 * the orientation media query ever firing.
 */
export type Orientation = 'landscape' | 'portrait';

export interface ScreenShape {
  orientation: Orientation;
  width: number;
  height: number;
  /** height / width — a tall panel is well above 1. */
  ratio: number;
  /** A phone-shaped window, where even portrait layouts need to go single-file. */
  narrow: boolean;
}

function read(): ScreenShape {
  const width = typeof window === 'undefined' ? 1920 : window.innerWidth;
  const height = typeof window === 'undefined' ? 1080 : window.innerHeight;
  return {
    orientation: height > width ? 'portrait' : 'landscape',
    width,
    height,
    ratio: height / Math.max(1, width),
    narrow: width < 760,
  };
}

export function useOrientation(): ScreenShape {
  const [shape, setShape] = useState<ScreenShape>(read);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      // A rotation fires several events in a row while the window settles, and
      // on Android the first size reported is often the OLD one. Coalescing to
      // the next frame means one re-layout with the size it actually ended at.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setShape(read()));
    };

    window.addEventListener('resize', update);
    const mq = window.matchMedia?.('(orientation: portrait)');
    mq?.addEventListener?.('change', update);
    // Safari and older WebViews only have the deprecated form.
    if (mq && !mq.addEventListener) mq.addListener?.(update);
    window.addEventListener('orientationchange', update);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      mq?.removeEventListener?.('change', update);
      if (mq && !mq.removeEventListener) mq.removeListener?.(update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return shape;
}
