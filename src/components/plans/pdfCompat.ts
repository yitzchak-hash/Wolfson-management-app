/**
 * Small compatibility shims for pdf.js.
 *
 * pdf.js tracks the newest browser engines closely, and the newest engine is
 * not what this runs on. The office PCs, the contractors' phones and the
 * Samsung panel's Android WebView are all a release or several behind, and a
 * missing built-in does not degrade — the whole viewer throws and the plan
 * comes up blank.
 *
 * This was found the hard way: the current pdf.js calls
 * `Map.prototype.getOrInsertComputed`, which Chrome 141 — a thoroughly current
 * browser — does not have. That version is therefore not used; the one that is
 * still wants `Promise.withResolvers` (Chrome 119+), so it is filled in here.
 *
 * Import this BEFORE pdf.js. Each shim installs only if genuinely absent.
 */

type Resolvers<T> = { promise: Promise<T>; resolve: (v: T | PromiseLike<T>) => void; reject: (r?: unknown) => void };

const P = Promise as unknown as { withResolvers?: <T>() => Resolvers<T> };
if (typeof P.withResolvers !== 'function') {
  P.withResolvers = function <T>(): Resolvers<T> {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (r?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

const M = Map.prototype as unknown as Record<string, unknown>;
if (typeof M.getOrInsertComputed !== 'function') {
  M.getOrInsertComputed = function <K, V>(this: Map<K, V>, key: K, make: (k: K) => V): V {
    if (!this.has(key)) this.set(key, make(key));
    return this.get(key)!;
  };
}
if (typeof M.getOrInsert !== 'function') {
  M.getOrInsert = function <K, V>(this: Map<K, V>, key: K, value: V): V {
    if (!this.has(key)) this.set(key, value);
    return this.get(key)!;
  };
}

export {};
