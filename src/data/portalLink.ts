/** Strip the scheme and any trailing slashes, so a typed domain is usable. */
export function bareDomain(value: string | undefined | null): string {
  return (value ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/**
 * A contractor's portal link.
 *
 * `domain` is the address the office has nominated as the live one. When it is
 * blank this falls back to the address the browser is currently on, which is
 * what it always used to do — right while the office is on the live site, and
 * quietly wrong on a preview build.
 */
export function portalLink(token: string, domain?: string): string {
  const clean = bareDomain(domain);
  const base = clean ? `https://${clean}` : window.location.origin;
  return `${base}/c/${token}`;
}

/**
 * Does this look like one of Vercel's per-build addresses rather than the live
 * site?
 *
 * A preview host carries either `-git-<branch>` or a build hash between the
 * project name and the scope; the live alias has neither. It is a hint, not a
 * verdict — a custom domain is unknowable from here — so it is only ever used
 * to warn, never to block.
 *
 * The hash segment must contain a DIGIT. Without that the pattern also matched
 * `wolfson-management-app.vercel.app`, reading "management" as a build hash
 * and calling the live site a preview — a warning that cries wolf is worse
 * than none, because it is the one people learn to click past.
 */
export function looksLikePreviewHost(host?: string): boolean {
  const h = host ?? (typeof window === 'undefined' ? '' : window.location.hostname);
  if (!/\.vercel\.app$/i.test(h)) return false;
  return /-git-/i.test(h) || /-(?=[a-z0-9]*[0-9])[a-z0-9]{8,}-[^.]+\.vercel\.app$/i.test(h);
}
