/**
 * The worker's link is its own app.
 *
 * Chrome's "Add to Home screen" / "Install" / "Create shortcut" does NOT save
 * the page you are on — it reads the site's web app manifest and launches
 * that manifest's `start_url`. The office app's manifest (`/site.webmanifest`)
 * says `start_url: "/"`, so a shortcut made from a worker's `/c/<token>` page
 * opened the office home instead of his portal: the owner's "it takes me back
 * to the main workspace page". (iPhone Safari ignores the manifest's start
 * address and saves the current page, which is why nobody noticed there.)
 *
 * While a portal page is mounted, the manifest link is pointed at a manifest
 * made on the spot: the worker's own name, the portal link as `start_url`,
 * the link as its `scope` and its `id` — so Chrome treats every worker's
 * portal as a separate app from the office one (and from each other), and a
 * shortcut made from the page always opens the page it was made from. The
 * office manifest is put back the moment the portal unmounts.
 *
 * A blob: address is used because a manifest has to be FETCHED, and there is
 * no serverless slot to spare for a route (the 12-function limit). Every URL
 * in it is absolute: relative ones would resolve against the blob itself.
 */
export interface PortalManifestInput {
  token: string;
  /** The worker's own name — becomes the icon's label. */
  workerName?: string | null;
  /** The address the page is really on; defaults to the browser's. */
  origin?: string;
}

const OFFICE_MANIFEST = '/site.webmanifest';
const OFFICE_TITLE = 'TzviAir Job Management Platform';

export function portalManifestJson({ token, workerName, origin }: PortalManifestInput): string {
  const base = (origin ?? window.location.origin).replace(/\/+$/, '');
  const link = `${base}/c/${token}`;
  const who = (workerName ?? '').trim();
  return JSON.stringify({
    id: link,
    name: who ? `TzviAir · ${who}` : 'TzviAir',
    short_name: who ? who.slice(0, 12) : 'TzviAir',
    description: 'TzviAir worker portal',
    start_url: link,
    scope: link,
    display: 'standalone',
    background_color: '#1e3a5f',
    theme_color: '#1e3a5f',
    icons: [
      { src: `${base}/favicon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
  });
}

function manifestLink(): HTMLLinkElement | null {
  return document.querySelector('link[rel="manifest"]');
}

/**
 * Point the page's manifest at the worker's own; returns the undo.
 *
 * Safe to call again with a new name (the worker's record can land after the
 * page does): the previous blob is released and a fresh one made.
 */
export function installPortalManifest(input: PortalManifestInput): () => void {
  if (typeof document === 'undefined') return () => {};
  const link = manifestLink();
  if (!link) return () => {};
  const json = portalManifestJson(input);
  let url = '';
  try {
    url = URL.createObjectURL(new Blob([json], { type: 'application/manifest+json' }));
  } catch {
    // An environment with no Blob support keeps the office manifest — a
    // shortcut there is the old behaviour, never a broken page.
    return () => {};
  }
  link.setAttribute('href', url);
  link.setAttribute('data-portal-manifest', input.token);
  const who = (input.workerName ?? '').trim();
  document.title = who ? `TzviAir · ${who}` : 'TzviAir';
  return () => {
    // Only undo what is still ours — a later install may have replaced it.
    const now = manifestLink();
    if (now && now.getAttribute('href') === url) {
      now.setAttribute('href', OFFICE_MANIFEST);
      now.removeAttribute('data-portal-manifest');
      document.title = OFFICE_TITLE;
    }
    try { URL.revokeObjectURL(url); } catch { /* already gone */ }
  };
}
