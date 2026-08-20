/**
 * Dropping a job from the board into a rota cell.
 *
 * The board drags tiles in WORLD coordinates; the rota is a grid of ordinary
 * DOM cells. Rather than have the board re-derive the rota's geometry — which
 * would mean two copies of the same layout maths, drifting apart the first time
 * a column width changed — each mounted rota registers a probe that answers one
 * question in SCREEN coordinates: "is there a cell of mine under this point?"
 *
 * Screen coordinates are the right currency here because a cell's own
 * getBoundingClientRect() already accounts for the board's pan and zoom. The
 * board asks, the rota answers, and neither knows anything about the other's
 * coordinate system.
 */

export interface RotaHit {
  /** The CanvasElement id of the rota — the record a drop is written to. */
  elId: string;
  /**
   * WHICH MOUNTED NOTEBOOK answered, which is not the same thing as `elId`.
   *
   * A projection draws the MAIN notebook's element, so both nodes report the
   * same `elId`. Telling them apart matters for the hover highlight: without
   * this, dragging over one lit the other.
   */
  probeId: string;
  /** Which person's row. */
  person: string;
  /** Which day column, as yyyy-mm-dd. */
  day: string;
}

type Probe = (clientX: number, clientY: number) => RotaHit | null;

const probes = new Map<string, Probe>();

/**
 * A rota announces itself while it is on screen. Returns the unregister.
 *
 * `key` must be unique per MOUNTED NOTEBOOK, never the element id.
 *
 * It was the element id, and a projection renders the main's element — so two
 * notebooks registered under one key, the second silently replaced the first,
 * and unmounting either deregistered both. The consequences were exactly what
 * the office reported: a job dragged onto the main notebook was hit-tested
 * against the projection's squares somewhere else on the board and landed
 * nowhere, and a card dragged between squares found no target on release, so
 * it offered to take the job OFF the notebook instead of asking move-or-copy.
 * Both came and went depending on which notebook had mounted last.
 */
export function registerRota(key: string, probe: Probe): () => void {
  probes.set(key, probe);
  return () => { probes.delete(key); };
}

/** The rota cell under a screen point, if any. */
export function rotaCellAt(clientX: number, clientY: number): RotaHit | null {
  for (const probe of probes.values()) {
    const hit = probe(clientX, clientY);
    if (hit) return hit;
  }
  return null;
}

/** True when at least one rota is on the board — lets the drag skip the work. */
export const anyRota = () => probes.size > 0;

// ── Where the drag currently is, so the cell under it can light up ──────────
//
// A plain module-level value with subscribers, rather than Zustand state: this
// changes on every pointermove of a drag, and putting that through the store
// would re-render the whole board sixty times a second to highlight one cell.

let hover: RotaHit | null = null;
const listeners = new Set<(h: RotaHit | null) => void>();

export function setRotaHover(next: RotaHit | null) {
  const same = hover?.probeId === next?.probeId && hover?.person === next?.person
    && hover?.day === next?.day;
  if (same) return;
  hover = next;
  listeners.forEach(fn => fn(hover));
}

export function onRotaHover(fn: (h: RotaHit | null) => void): () => void {
  listeners.add(fn);
  fn(hover);
  return () => { listeners.delete(fn); };
}
