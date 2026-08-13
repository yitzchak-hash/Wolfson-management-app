/**
 * Turn a pasted TikTok link into something the board can play.
 *
 * Two jobs, both of which have to happen on a server:
 *
 *  - A share link from the phone app is a short one (vm.tiktok.com/…) that
 *    carries no video id at all. Only following the redirect reveals it, and a
 *    browser cannot read a cross-origin redirect's destination.
 *  - The title and the poster's name come from TikTok's oEmbed endpoint, which
 *    does not send the headers a page needs to read it directly.
 *
 * No key, nothing secret, and nothing here that a person could not fetch
 * themselves — so like the geocoder this route is not key-guarded. Locking it
 * would only break the widget wherever the key is unset.
 */

const CACHE = new Map();
const CACHE_MAX = 300;

/** The numeric id inside a full TikTok URL, if it has one. */
function idFrom(url) {
  const m = /\/video\/(\d{6,})/.exec(url) || /\/v\/(\d{6,})/.exec(url) || /^(\d{15,})$/.exec(url.trim());
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const url = String(body.url || '').trim();
  if (!url) return res.status(400).json({ error: 'Missing url' });
  if (!/^https?:\/\/([\w-]+\.)*tiktok\.com\//i.test(url) && !/^\d{15,}$/.test(url)) {
    // Only TikTok. This route must never become a general-purpose fetcher that
    // anybody can point at an internal address.
    return res.status(400).json({ error: 'Not a TikTok link' });
  }

  if (CACHE.has(url)) return res.status(200).json({ ...CACHE.get(url), cached: true });

  try {
    let full = url;
    let videoId = idFrom(url);

    // Follow a short link far enough to see where it lands.
    if (!videoId) {
      const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
      full = r.url || url;
      videoId = idFrom(full);
    }

    let title = '', author = '', thumbnail = '';
    try {
      const o = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(full)}`);
      if (o.ok) {
        const j = await o.json();
        title = j.title || '';
        author = j.author_name || '';
        thumbnail = j.thumbnail_url || '';
        if (!videoId) videoId = idFrom(String(j.html || ''));
      }
    } catch {
      // The id alone is enough to play it; the words are a nicety.
    }

    const out = { videoId, url: full, title, author, thumbnail };
    if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(url, out);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
