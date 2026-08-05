/**
 * Turning a pointer into a pen stroke.
 *
 * WHAT THE SAMSUNG SCREEN ACTUALLY GIVES US
 * The WAD-series interactive display (LH75WADWLG / LH86WADWLG, the 75" and 86"
 * panels) is an INFRARED touch screen running Android 13. Infrared works by
 * breaking a grid of beams across the glass, so it reports *where* something is
 * and *how big* it is — it has no way to measure how hard you press. Its pens
 * are passive plastic: no battery, no digitiser, no pressure. Samsung's own
 * spec sheet lists an object-recognition range of 3 / 5 / 10 / 15 mm and no
 * pressure figure at all, and its headline pen feature is the DUAL NIB — a thin
 * tip on one end and a fat tip on the other, which the panel tells apart purely
 * by contact size.
 *
 * So `PointerEvent.pressure` on that screen is a constant, and a naive
 * pressure-only implementation would draw one dead flat line there. What the
 * panel does give, and what Chrome on Android forwards, is `PointerEvent.width`
 * and `height` — the contact patch. That is the signal that makes the fat nib
 * draw fat and the thin nib draw thin, which is the whole point of the pen.
 *
 * A real pressure stylus on a PC — Surface Pen, Wacom, an S Pen on a Galaxy Tab
 * (4096 levels) — does report varying `pressure`, and that is strictly better,
 * so it wins when it is genuinely present.
 *
 * Hence three sources, in order of how much they actually know:
 *   1. real pressure, when the value moves during the stroke
 *   2. contact size, which is how the Samsung dual nib expresses itself
 *   3. speed, so a plain mouse or finger still gets a stroke with some life
 *
 * We only commit to (1) after seeing the pressure move, because a device with
 * no pressure sensor reports a *plausible* constant (0.5, or 1) rather than
 * nothing — trusting it blind would silently disable (2) on the exact screen
 * this was built for.
 */

export type PenSource = 'pressure' | 'contact' | 'speed';

export interface PenSample {
  /** Client-space position of the sample. */
  x: number;
  y: number;
  /** Width multiplier against the tool's base width, roughly 0.35 – 2.2. */
  w: number;
}

export interface PenOptions {
  /**
   * Contact size, in CSS pixels, that should draw at the tool's base width.
   * The thin nib lands under it and the fat nib above it. Adjustable because
   * a 4K 86" panel and a 1080p 55" panel report very different pixel sizes for
   * the same physical nib.
   */
  contactBaseline?: number;
  /** How much variation is allowed either side of the base width. */
  min?: number;
  max?: number;
  /** 0 = ignore the input signal entirely and draw a constant line. */
  sensitivity?: number;
}

const DEFAULTS: Required<PenOptions> = {
  contactBaseline: 26,
  min: 0.4,
  max: 2.1,
  sensitivity: 1,
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * One stroke in progress.
 *
 * Kept as a class because the interesting part is all history: which signal has
 * proved itself, what the last few widths were, how fast the tip is moving.
 */
export class PenStroke {
  private opts: Required<PenOptions>;
  private source: PenSource = 'speed';
  private decided = false;
  private firstPressure: number | null = null;
  private lastW = 1;
  private lastPt: { x: number; y: number; t: number } | null = null;
  private speed = 0;

  constructor(opts: PenOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  /** Which signal this stroke ended up using — surfaced in the UI so the office can see it. */
  get usedSource(): PenSource { return this.source; }

  /**
   * Feed a pointer event and get back the sample to draw.
   *
   * `coalesced` events are folded in by the caller, not here, so that a 240 Hz
   * pen on the Samsung panel produces a smooth line rather than the ~60 samples
   * a second the main event stream would give.
   */
  push(e: { clientX: number; clientY: number; pressure?: number; width?: number; height?: number; pointerType?: string }, now: number): PenSample {
    const { min, max, sensitivity, contactBaseline } = this.opts;

    // Speed, always — it is the fallback and it costs nothing to keep current.
    if (this.lastPt) {
      const dt = Math.max(1, now - this.lastPt.t);
      const d = Math.hypot(e.clientX - this.lastPt.x, e.clientY - this.lastPt.y);
      // Exponential average: raw speed between two samples is far too jumpy to
      // drive a line width directly.
      this.speed = this.speed * 0.75 + (d / dt) * 0.25;
    }
    this.lastPt = { x: e.clientX, y: e.clientY, t: now };

    const pressure = typeof e.pressure === 'number' ? e.pressure : 0;
    const contact = Math.max(e.width ?? 0, e.height ?? 0);

    if (!this.decided) {
      if (e.pointerType === 'pen' && pressure > 0) {
        if (this.firstPressure === null) this.firstPressure = pressure;
        // A genuine sensor wanders within a few samples. A flat panel does not.
        else if (Math.abs(pressure - this.firstPressure) > 0.02) {
          this.source = 'pressure';
          this.decided = true;
        }
      }
      // Contact size only counts once it is big enough to be a nib rather than
      // the 1×1 placeholder a mouse reports.
      if (!this.decided && contact > 1.5) this.source = 'contact';
    }

    let target: number;
    if (this.source === 'pressure') {
      // Squash toward the middle: raw pressure spends most of its range at the
      // extremes and a linear map draws hairlines and blobs.
      target = 0.45 + Math.pow(clamp(pressure, 0, 1), 0.65) * 1.15;
    } else if (this.source === 'contact') {
      target = Math.pow(clamp(contact / contactBaseline, 0.25, 3), 0.7);
    } else {
      // Slow = deliberate = heavier, the way a felt tip behaves.
      target = 1.28 - clamp(this.speed / 2.2, 0, 1) * 0.55;
    }

    target = 1 + (target - 1) * sensitivity;
    target = clamp(target, min, max);

    // Smooth, or every stray sample shows up as a lump in the line.
    this.lastW = this.lastW * 0.68 + target * 0.32;
    return { x: e.clientX, y: e.clientY, w: Math.round(this.lastW * 1000) / 1000 };
  }
}

/**
 * Pull every sample out of a pointer event, high-frequency ones included.
 *
 * A pen that samples faster than the display refreshes delivers the extra
 * samples through `getCoalescedEvents()`. Ignoring them is what makes hand-drawn
 * lines come out as visible straight facets on a fast device.
 */
export function samplesOf(e: PointerEvent): PointerEvent[] {
  const anyE = e as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
  if (typeof anyE.getCoalescedEvents === 'function') {
    try {
      const list = anyE.getCoalescedEvents();
      if (list && list.length) return list;
    } catch { /* Safari has thrown here historically. */ }
  }
  return [e];
}

/**
 * Drop points that add nothing, keeping the shape.
 *
 * Ramer–Douglas–Peucker. A minute of drawing on an 86" screen at 240 Hz is tens
 * of thousands of points; the sketch is sent to the server as JSON and stored in
 * Firestore, so shipping raw samples would be both slow and expensive. At the
 * tolerance used here the simplified line is not distinguishable from the raw
 * one at any zoom the PDF supports.
 */
export function simplify(pts: PenSample[], tolerance = 0.4): PenSample[] {
  if (pts.length < 3) return pts;

  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];

  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const A = pts[a], B = pts[b];
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1, worstI = -1;

    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      const d = Math.abs(dy * P.x - dx * P.y + B.x * A.y - B.y * A.x) / len;
      // A width change matters as much as a positional one — thinning it away
      // would flatten the pressure the pen worked to capture.
      const wd = Math.abs(P.w - (A.w + (B.w - A.w) * ((i - a) / (b - a)))) * 6;
      const score = d + wd;
      if (score > worst) { worst = score; worstI = i; }
    }

    if (worst > tolerance && worstI > 0) {
      keep[worstI] = 1;
      stack.push([a, worstI], [worstI, b]);
    }
  }

  const out: PenSample[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/** Distance from a point to a line segment. Used for hit-testing marks. */
export function nearSegment(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
