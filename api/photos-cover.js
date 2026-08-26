/**
 * The cover picture of a shared Google Photos album.
 *
 * A shared album's public page carries its cover as an `og:image` meta tag —
 * but a browser cannot read a cross-origin page, so the server reads it. Two
 * honest answers matter as much as the picture: an album that is NOT shared
 * lands on a sign-in page with no og:image, and the widget has to be able to
 * say "this album isn't shared" rather than drawing a broken square; and a
 * fetch that fails outright is "couldn't reach Google Photos", which is a
 * different sentence.
 *
 * No key, nothing secret, and nothing here that a person could not open
 * themselves — only albums whose link is already public ever answer — so like
 * the geocoder and the TikTok resolver this route is not key-guarded. The URL
 * check keeps it from ever becoming a general-purpose fetcher somebody could
 * point at an internal address.
 */

const CACHE = new Map();
const CACHE_MAX = 200;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const url = String(body.url || '').trim();
  if (!url) return res.status(400).json({ error: 'Missing url' });
  if (!/^https?:\/\/(photos\.app\.goo\.gl|photos\.google\.com|goo\.gl)\//i.test(url)) {
    return res.status(400).json({ error: 'Not a Google Photos link' });
  }

  if (CACHE.has(url)) return res.status(200).json({ ...CACHE.get(url), cached: true });

  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
    const finalUrl = r.url || url;
    if (!r.ok) return res.status(200).json({ shared: false, status: r.status });
    const html = await r.text();

    const og = (name) => {
      const m = new RegExp(`<meta[^>]+property=["']og:${name}["'][^>]+content=["']([^"']+)`, 'i').exec(html)
        || new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${name}`, 'i').exec(html);
      return m ? m[1].replace(/&amp;/g, '&') : '';
    };

    let cover = og('image');
    const title = og('title');

    // A sign-in page has no cover — the album exists but is not shared, and
    // that is the answer, not an error.
    if (!cover || /accounts\.google\.com/i.test(finalUrl)) {
      return res.status(200).json({ shared: false, url: finalUrl });
    }

    // The og:image is sized for a link card (~600px). Google photo URLs take
    // their size as a trailing `=w…-h…` segment, so ask for one big enough
    // for a widget stretched across a TV.
    if (/=[^=/]+$/.test(cover)) cover = cover.replace(/=[^=/]+$/, '=w1600-h1600-no');
    else cover += '=w1600-h1600-no';

    const out = { shared: true, cover, title, url: finalUrl };
    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(url, out);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
