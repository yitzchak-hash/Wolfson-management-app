/**
 * SHARE THE PLAN ITSELF (owner, 2026-11-03: "an option to share the plans from
 * the phones and that the share menu of diff phones will come up … it should
 * send the actual pdf not a link … also from pc").
 *
 * The PDF's bytes (the plan cache's, so a plan already on screen goes at once)
 * are handed to the system share sheet as a FILE — WhatsApp, Mail, Messages,
 * Nearby Share… whatever the phone or computer offers. Where a browser cannot
 * share files (Firefox, Chrome on a Mac), the PDF is downloaded instead, so
 * there is always a file in hand.
 *
 * A share sheet only opens straight from a press. When the plan still had to
 * be downloaded, the press may have expired by the time it arrived — then the
 * bytes are kept and the caller says "tap Share again"; the second press is
 * instant.
 */
import { fetchPlanCached } from './planCache';

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded' | 'again' | 'failed';

function pdfName(name: string | undefined): string {
  const n = (name || 'plan').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'plan';
  return /\.pdf$/i.test(n) ? n : `${n}.pdf`;
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Can this browser hand a PDF file to the system share sheet? */
export function canShareFiles(): boolean {
  try {
    const f = new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' });
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [f] });
  } catch { return false; }
}

export async function sharePlanFile(fileId: string, name: string | undefined, title?: string): Promise<ShareOutcome> {
  let buf: ArrayBuffer;
  try { buf = await fetchPlanCached(fileId); } catch { return 'failed'; }
  const file = new File([buf], pdfName(name), { type: 'application/pdf' });
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) { download(file); return 'downloaded'; }
  try {
    await navigator.share({ files: [file], title: title || file.name });
    return 'shared';
  } catch (e) {
    const n = (e as Error)?.name;
    if (n === 'AbortError') return 'cancelled';
    if (n === 'NotAllowedError') return 'again';   // the press expired while the plan downloaded
    download(file); return 'downloaded';
  }
}
