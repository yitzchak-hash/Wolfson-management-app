/**
 * What KIND of thing is this file — one answer, read by every screen that
 * shows a file back to somebody.
 *
 * The extension decides whenever the name has one, and only a file with no
 * extension falls back to the mime type. This is the standing Drive lesson
 * from `isViewableFile`: Drive's mime LIES about several types (a `.dwg`
 * commonly arrives as `image/vnd.dwg`), and a name is what a person sees.
 *
 * `pdf` is separate from `file` because a browser can draw one and the
 * viewer offers it a frame rather than a download card.
 */
export type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'file';

/** Extensions a browser can actually DRAW as a picture. HEIC and TIFF are
 *  images and neither renders in Chrome, so neither is here. */
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg'];
const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'ogv', 'avi', 'mkv', '3gp'];
const AUDIO_EXT = ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'aac', 'opus', 'weba'];

function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,5})\s*$/.exec(String(name || '').trim());
  return m ? m[1].toLowerCase() : '';
}

export function mediaKindOf(name?: string | null, mime?: string | null): MediaKind {
  const ext = extOf(name ?? '');
  if (ext) {
    if (IMAGE_EXT.includes(ext)) return 'image';
    if (VIDEO_EXT.includes(ext)) return 'video';
    if (AUDIO_EXT.includes(ext)) return 'audio';
    if (ext === 'pdf') return 'pdf';
    return 'file';
  }
  const m = String(mime ?? '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  return 'file';
}

/** Can this open INSIDE the app — a picture, a film, a memo or a sheet? */
export function isMediaFile(name?: string | null, mime?: string | null): boolean {
  return mediaKindOf(name, mime) !== 'file';
}

/** A short badge for a file nothing can draw — "DWG", "XLSX". */
export function typeBadgeOf(name: string, mime?: string): string {
  const ext = extOf(name);
  if (ext) return ext.toUpperCase();
  const t = String(mime ?? '').split('/').pop() ?? '';
  return (t.replace(/^vnd\.google-apps\./, '').slice(0, 5) || 'FILE').toUpperCase();
}
