/**
 * Turn a typed address into a coordinate.
 *
 * This has to go through the server rather than straight from the browser for
 * one reason: OpenStreetMap's geocoder requires a request to identify itself
 * with a real User-Agent, and a browser will not let a page set that header.
 * Requests from the page are therefore refused, or rate-limited to nothing, in
 * a way that looks from the app like the address is simply not findable.
 *
 * There is no key and no secret here, so unlike the Drive routes this one does
 * not demand `x-api-key` — locking it would only mean the map stops working on
 * any deployment where the key has not been set, in exchange for guarding a
 * public lookup anybody can make themselves.
 *
 * Two caches, for two different reasons:
 *  - the in-memory one stops the same address being looked up twice while a
 *    board with forty jobs on it settles;
 *  - the caller stores its own results permanently, so a warm board makes no
 *    requests at all.
 */

const CACHE = new Map();
const CACHE_MAX = 500;

/**
 * One request per second, queued.
 *
 * The published usage policy is an absolute maximum of one request a second,
 * and exceeding it gets an address — or an IP — blocked rather than throttled.
 * Serialising here means a board that asks for forty addresses at once takes
 * forty seconds and always succeeds, instead of taking two seconds and being
 * refused halfway through.
 */
let chain = Promise.resolve();
function queued(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => new Promise(r => setTimeout(r, 1100)),
    () => new Promise(r => setTimeout(r, 1100)),
  );
  return run;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const raw = String(body.address || '').trim();
  if (!raw) return res.status(400).json({ error: 'Missing address' });

  // Israel is assumed unless the address names somewhere else. Without it
  // "3 Herzl" finds a Herzl street on another continent, which is worse than
  // finding nothing because it looks like an answer.
  const country = String(body.country || 'Israel');
  const q = /israel|ישראל/i.test(raw) ? raw : `${raw}, ${country}`;
  const key = q.toLowerCase();

  if (CACHE.has(key)) {
    return res.status(200).json({ ...CACHE.get(key), cached: true });
  }

  try {
    const out = await queued(async () => {
      const url = 'https://nominatim.openstreetmap.org/search'
        + `?q=${encodeURIComponent(q)}&format=jsonv2&limit=1&addressdetails=0`;
      const r = await fetch(url, {
        headers: {
          // The identifying agent this whole route exists to be able to send.
          'User-Agent': 'TzviAir-JobBoard/1.0 (internal project management; contact via wolfson-management-app.vercel.app)',
          'Accept-Language': 'he,en',
        },
      });
      if (!r.ok) throw new Error(`geocoder returned ${r.status}`);
      const list = await r.json();
      if (!Array.isArray(list) || list.length === 0) return { found: false };
      const hit = list[0];
      return {
        found: true,
        lat: Number(hit.lat),
        lon: Number(hit.lon),
        label: hit.display_name || q,
      };
    });

    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, out);
    return res.status(200).json(out);
  } catch (e) {
    // A miss and a failure are different things to the caller: a miss is
    // final, a failure is worth trying again later.
    return res.status(502).json({ error: String(e.message || e) });
  }
}
