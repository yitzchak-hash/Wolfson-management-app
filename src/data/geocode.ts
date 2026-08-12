/**
 * Addresses to coordinates, and the tile maths behind a slippy map.
 *
 * Nothing in the app has ever stored a location. Rather than adding a field
 * somebody has to fill in for every job, the address that is already typed is
 * looked up once and the answer is remembered — so the map fills itself in
 * from work the office is already doing.
 */

export interface LatLon { lat: number; lon: number }

export interface GeoHit extends LatLon {
  label?: string;
}

/** What a lookup can come back as. A miss is final; a failure is worth retrying. */
export type GeoResult =
  | { kind: 'hit'; at: GeoHit }
  | { kind: 'miss' }
  | { kind: 'failed' };

/**
 * Look one address up.
 *
 * Goes through the app's own server, which is the only place a request can
 * carry the identifying header the geocoder insists on. If that route is not
 * there — a local dev server, or a deployment without the API folder — it
 * falls back to asking directly, which works often enough to be worth having
 * and is not relied upon.
 */
export async function geocodeAddress(address: string): Promise<GeoResult> {
  const clean = (address ?? '').trim();
  if (!clean) return { kind: 'miss' };

  try {
    const r = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: clean }),
    });
    if (r.ok) {
      const j = await r.json();
      return j.found
        ? { kind: 'hit', at: { lat: j.lat, lon: j.lon, label: j.label } }
        : { kind: 'miss' };
    }
    // 404 means the route is not deployed; anything else is a real failure and
    // the direct attempt below will probably fail too, but it costs one call.
  } catch {
    /* fall through */
  }

  try {
    const q = /israel|ישראל/i.test(clean) ? clean : `${clean}, Israel`;
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=1`,
    );
    if (!r.ok) return { kind: 'failed' };
    const list = await r.json();
    if (!Array.isArray(list) || !list.length) return { kind: 'miss' };
    return { kind: 'hit', at: { lat: Number(list[0].lat), lon: Number(list[0].lon), label: list[0].display_name } };
  } catch {
    return { kind: 'failed' };
  }
}

// ─── Slippy-map maths ────────────────────────────────────────────────────────

export const TILE = 256;

/**
 * A longitude, in world pixels at a zoom level.
 *
 * The whole world is `256 * 2^zoom` pixels wide at every level, which is what
 * makes a tile grid work: floor the pixel coordinate by 256 and you have the
 * tile, and the remainder is where inside it to draw.
 */
export const lonToX = (lon: number, zoom: number) =>
  ((lon + 180) / 360) * TILE * 2 ** zoom;

/**
 * A latitude, in world pixels — the Mercator projection.
 *
 * Latitude is NOT linear in y: the further from the equator, the more stretched
 * it is. Treating it as linear puts a pin in Haifa several streets out from
 * one in Be'er Sheva, which is exactly the sort of error that looks like the
 * data is wrong rather than the maths.
 */
export const latToY = (lat: number, zoom: number) => {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** zoom;
};

export const xToLon = (x: number, zoom: number) =>
  (x / (TILE * 2 ** zoom)) * 360 - 180;

export const yToLat = (y: number, zoom: number) => {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/**
 * The zoom at which a set of points fits a box, and the middle of them.
 *
 * One pin gives no box at all, so it gets a sensible street-level zoom rather
 * than the maximum — which would otherwise show one building and nothing to
 * place it against.
 */
export function fitBounds(
  points: LatLon[],
  width: number,
  height: number,
  maxZoom = 16,
): { center: LatLon; zoom: number } {
  if (!points.length) return { center: { lat: 31.9, lon: 35.0 }, zoom: 7 };
  const lats = points.map(p => p.lat), lons = points.map(p => p.lon);
  const center = {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lon: (Math.min(...lons) + Math.max(...lons)) / 2,
  };
  if (points.length === 1) return { center, zoom: 14 };

  for (let z = maxZoom; z >= 2; z--) {
    const xs = lons.map(l => lonToX(l, z)), ys = lats.map(l => latToY(l, z));
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    // A tenth of margin, so pins never sit against the edge where half the
    // marker is clipped and looks like a rendering fault.
    if (w < width * 0.9 && h < height * 0.9) return { center, zoom: z };
  }
  return { center, zoom: 2 };
}

/**
 * A stable scatter around a point, from a string.
 *
 * Jobs with no address have to go SOMEWHERE, and it has to be the same
 * somewhere every render — a marker that jumps each time the board redraws
 * reads as a fault, and two of them landing on the same pixel reads as one.
 * Derived from the record's own id, so it is fixed for as long as the record
 * exists and different for every record.
 */
export function scatterAround(centre: LatLon, seed: string, spreadDeg = 0.55): LatLon {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
  const r = (((h >>> 12) % 1000) / 1000) ** 0.5 * spreadDeg;
  return { lat: centre.lat + r * Math.sin(a), lon: centre.lon + r * Math.cos(a) * 1.15 };
}
