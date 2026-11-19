/**
 * A Drive file's picture and its "open" address — in a module of its own, with nothing else in it.
 *
 * The board and the stage list draw Drive thumbnails; they used to take this from driveApi.ts, which also carries
 * the office's API key and the backend calls. The outside SHARED VIEW (/s/<token>) draws the same board but must
 * never hold either, and must never name a Drive file at all: its "file ids" are sealed refs, and its pictures come
 * through the server (lib/sharedView.js). It plugs in a resolver; the office has none and gets Drive's own address.
 */
let resolver: null | { thumb: (fileId: string, maxPx: number) => string; open: (fileId: string) => string } = null;

/** The shared view only. */
export function setDriveMediaResolver(r: typeof resolver): void { resolver = r; }

export function driveThumbUrl(fileId: string, maxPx = 1200): string {
  if (resolver) return resolver.thumb(fileId, maxPx);
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${maxPx}`;
}

/** Where a press on a picture goes. */
export function driveOpenUrl(fileId: string): string {
  if (resolver) return resolver.open(fileId);
  return `https://drive.google.com/file/d/${fileId}/view`;
}
