/**
 * The AI plan reader — the client half of the `planRead` branch in
 * api/geocode.js (owner, 2026-09-07).
 *
 * Sends ONE picture (a page render, or the crop under a drawn box) and gets
 * back the customer's address, phone and family name as printed. Runs only
 * when the app has its shared key AND the server has an AI key: a 501 or a
 * 401 stands the reader down for the visit, and the local text-layer reader
 * carries on alone — a missing key must never read as a broken drawer.
 */
const API_KEY = (import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '';
let serverOff = false;

export interface AiPlanRead { address: string; phone: string; family: string }

export function aiPlanReadingAvailable(): boolean { return !!API_KEY && !serverOff; }

export async function aiReadPlanImage(
  image: string, want: 'address' | 'phone' | 'both', crop: boolean,
): Promise<AiPlanRead | null> {
  if (!API_KEY || serverOff) return null;
  try {
    const resp = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ planRead: { image, want, crop } }),
    });
    if (resp.status === 501 || resp.status === 401) { serverOff = true; return null; }
    if (!resp.ok) return null;
    const j = await resp.json();
    return { address: String(j.address ?? ''), phone: String(j.phone ?? ''), family: String(j.family ?? '') };
  } catch {
    return null;
  }
}

/** A JPEG of the whole canvas, or of a box on it (fractions), scaled to fit `maxPx` on its long edge. */
export function canvasToJpeg(src: HTMLCanvasElement | HTMLImageElement, box?: { x0: number; y0: number; x1: number; y1: number }, maxPx = 1600): string {
  const sw = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const sh = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  const bx = box ? Math.min(box.x0, box.x1) * sw : 0;
  const by = box ? Math.min(box.y0, box.y1) * sh : 0;
  const bw = box ? Math.abs(box.x1 - box.x0) * sw : sw;
  const bh = box ? Math.abs(box.y1 - box.y0) * sh : sh;
  const k = Math.min(1, maxPx / Math.max(bw, bh));
  // A crop is sent LARGER than it is on the sheet — small print reads better.
  const up = box ? Math.min(3, 900 / Math.max(bw, bh)) : 1;
  const scale = Math.max(k, up);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bw * scale));
  c.height = Math.max(1, Math.round(bh * scale));
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, bx, by, bw, bh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

export function __resetAiPlanReading() { serverOff = false; }
