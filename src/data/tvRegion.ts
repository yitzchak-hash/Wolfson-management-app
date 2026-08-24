/**
 * ONE set of arithmetic for "what does the TV actually show".
 *
 * The wall fits its region (or the content box) to the frame and then
 * multiplies by the display size — so at 160% the panel really shows a
 * SMALLER slice of the board than the saved region, and at 70% a bigger one.
 * The green frame everybody drags therefore cannot be the stored region: it
 * has to be the EFFECTIVE visible rectangle, scale folded in. Every surface
 * that draws or edits that frame (the settings picker, the board's own TV
 * overlay, the wall itself) goes through this module, so they can never
 * disagree about what the TV sees. Change one, change nothing — there is
 * only one.
 */

export interface TvRect { x: number; y: number; w: number; h: number }

/**
 * The scale and origin the wall really draws at: fit the box to the frame,
 * then apply the display size. The crop is CENTRED in both directions — a
 * display size above 1 zooms into the MIDDLE of the chosen region, and one
 * below 1 shows evenly around it. (It used to anchor the zoom-in at the
 * region's top-left, which is why the green box and the TV disagreed the
 * moment anybody touched the size slider.)
 */
export function tvViewbox(frameW: number, frameH: number, box: TvRect, boost: number) {
  const scale = Math.min(frameW / box.w, frameH / box.h) * boost;
  return {
    scale,
    origin: {
      x: box.x - (frameW / scale - box.w) / 2,
      y: box.y - (frameH / scale - box.h) / 2,
    },
  };
}

/**
 * The board rectangle a panel of this shape actually shows, display size
 * included. This IS the green frame. The frame size is nominal — the fit is
 * shape-relative, so only the ratio matters.
 */
export function tvVisibleRect(box: TvRect, screenRatio: number, boost: number): TvRect {
  const fw = 1000 * screenRatio, fh = 1000;
  const { scale, origin } = tvViewbox(fw, fh, box, boost);
  return { x: origin.x, y: origin.y, w: fw / scale, h: fh / scale };
}

/**
 * The region to STORE so the TV shows exactly `vis` — the inverse of
 * `tvVisibleRect` for a screen-shaped rectangle, which is the only kind the
 * ratio-locked frame can produce. Round-trips exactly: a saved region drawn
 * as its visible rect and written back lands on the same numbers.
 */
export function regionForVisible(vis: TvRect, boost: number): TvRect {
  const w = vis.w * boost, h = vis.h * boost;
  return {
    x: Math.round(vis.x + (vis.w - w) / 2),
    y: Math.round(vis.y + (vis.h - h) / 2),
    w: Math.round(w),
    h: Math.round(h),
  };
}

/** '16:9' → 16/9, with the wall's own default when nothing is stored. */
export function ratioOfShape(id?: string): number {
  const [w, h] = (id ?? '16:9').split(':').map(Number);
  return w > 0 && h > 0 ? w / h : 16 / 9;
}
