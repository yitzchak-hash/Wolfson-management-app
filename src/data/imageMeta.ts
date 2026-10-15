import * as piexifNs from 'piexifjs';

/**
 * Shrinking a photo without losing what it knows.
 *
 * A canvas keeps none of the original's EXIF, so a photo drawn onto one and
 * saved as a JPEG arrives with no location, no date taken and no camera. That
 * is why the ORIGINAL file is what goes to Google Drive (the TzviAir Photos app
 * reads place and date from it); a shrunk copy is only for the app's own
 * small previews and the base64 fallback — and even that copy carries the
 * original's EXIF, copied in here.
 *
 * Orientation: the browser turns the picture upright as it draws it, so the
 * copy's pixels are already the right way up. The tag is kept but written as
 * 1 ("as stored") — copying the original's 6 or 8 would turn it a second time
 * in every viewer. The original upload keeps its own value untouched.
 */

// piexifjs is CommonJS with `module.exports = …`; the bundler hands it over as
// either the namespace or its default.
const piexif = ((piexifNs as unknown as { default?: typeof piexifNs }).default ?? piexifNs) as typeof piexifNs;

export const SHRINK_MAX_PX = 1200;
export const SHRINK_QUALITY = 0.72;

function isJpeg(file: Blob & { name?: string }): boolean {
  return /jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name ?? '');
}

/** The file as a binary string — the form piexifjs reads and writes. */
async function binaryOf(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return out;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * The EXIF block to put into the shrunk copy, or null when the original has
 * none (or it cannot be read). Everything the original carries is kept except
 * the embedded thumbnail and the maker's private notes (large, and the usual
 * reason a re-dump fails); if even that will not dump, the copy gets the
 * essentials alone — GPS, the date taken, the camera.
 */
async function exifFor(original: File, w: number, h: number): Promise<string | null> {
  if (!isJpeg(original)) return null;
  let src: piexifNs.ExifDict;
  try { src = piexif.load(await binaryOf(original)); } catch { return null; }
  const has = (o?: object) => !!o && Object.keys(o).length > 0;
  if (!has(src['0th']) && !has(src.Exif) && !has(src.GPS)) return null;

  const I = piexif.ImageIFD, E = piexif.ExifIFD;
  const zeroth = { ...(src['0th'] ?? {}) } as Record<number, unknown>;
  const exif = { ...(src.Exif ?? {}) } as Record<number, unknown>;
  zeroth[I.Orientation] = 1;
  delete zeroth[I.ImageWidth];
  delete zeroth[I.ImageLength];
  delete exif[E.MakerNote];
  if (E.PixelXDimension in exif || E.PixelYDimension in exif) {
    exif[E.PixelXDimension] = w;
    exif[E.PixelYDimension] = h;
  }
  try {
    return piexif.dump({ '0th': zeroth, Exif: exif, GPS: src.GPS ?? {}, Interop: src.Interop ?? {} } as piexifNs.ExifDict);
  } catch { /* fall back to the essentials */ }

  const keep = (from: Record<number, unknown> | undefined, tags: number[]) => {
    const out: Record<number, unknown> = {};
    for (const t of tags) if (from && from[t] !== undefined) out[t] = from[t];
    return out;
  };
  try {
    return piexif.dump({
      '0th': { ...keep(src['0th'] as Record<number, unknown>, [I.Make, I.Model, I.DateTime, I.Software]), [I.Orientation]: 1 },
      Exif: keep(src.Exif as Record<number, unknown>, [E.DateTimeOriginal, E.DateTimeDigitized]),
      GPS: src.GPS ?? {},
    } as piexifNs.ExifDict);
  } catch { return null; }
}

/** Decode with the browser's own decoder — it applies the EXIF orientation as it draws. */
function decode(file: File): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/**
 * A small JPEG copy of a picture, as a data URL, with the original's EXIF
 * written into it. Null when the browser cannot draw the file (an iPhone HEIC
 * in Chrome, a non-image) — the caller keeps the original then, as before.
 */
export async function shrinkImageToDataUrl(file: File, maxPx = SHRINK_MAX_PX, quality = SHRINK_QUALITY): Promise<string | null> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name)) return null;
  const img = await decode(file);
  if (!img) return null;
  const scale = Math.min(1, maxPx / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  const plain = canvas.toDataURL('image/jpeg', quality);
  const exif = await exifFor(file, w, h).catch(() => null);
  if (!exif) return plain;
  try { return piexif.insert(exif, plain); } catch { return plain; }
}

/**
 * The same small copy as a File named `.jpg`. Hands back the ORIGINAL file
 * untouched when it cannot be drawn — the old behaviour of every caller.
 */
export async function shrinkImage(file: File, maxPx = SHRINK_MAX_PX, quality = SHRINK_QUALITY): Promise<File> {
  const url = await shrinkImageToDataUrl(file, maxPx, quality);
  if (!url) return file;
  return new File([dataUrlToBlob(url)], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
}

/** Read a file as a data URL — the base64 fallback for anything that is not shrunk. */
export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve((e.target?.result as string) ?? '');
    r.onerror = () => resolve('');
    r.readAsDataURL(file);
  });
}
