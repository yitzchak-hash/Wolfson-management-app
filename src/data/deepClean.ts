/**
 * Strip `undefined` EVERYWHERE inside a value, not only at the top level.
 *
 * Firestore rejects a write whose payload holds `undefined` at ANY depth —
 * the WHOLE document write fails, and with a catch that only warns, the stale
 * server copy silently wins from then on. One planner entry written with
 * `taskId: undefined` froze the office's weekly notebook in the cloud: every
 * edit — the X, drags off, drops in — looked done on screen and came back on
 * the next load, on every device. The localStorage copy never showed the
 * problem because JSON.stringify drops `undefined` on its own; only the
 * in-memory object handed to Firestore carried the poison.
 *
 * Recursion goes into PLAIN objects and arrays only: Firestore's own
 * sentinels (serverTimestamp, deleteField) and Timestamps are class
 * instances and must pass through untouched. In arrays `undefined` becomes
 * `null` rather than being dropped — positions can be meaning-bearing (flat
 * point lists) and shortening an array would corrupt them.
 */
export function stripUndefinedDeep<T>(v: T): T {
  if (Array.isArray(v)) {
    return v.map(x => (x === undefined ? null : stripUndefinedDeep(x))) as unknown as T;
  }
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === undefined) continue;
      out[k] = stripUndefinedDeep(val);
    }
    return out as unknown as T;
  }
  return v;
}
