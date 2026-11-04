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

/**
 * THE FILE MADE READY BEFORE THE PRESS (owner, video 2026-11-04 on the Galaxy Fold: "we're trying to share … it's not
 * letting"). Samsung's browser refuses a share sheet that opens after ANY wait, even the plan cache's own — so the
 * File is built while the plan is on screen (`warmPlanShare`) and a press hands it over with nothing awaited first.
 */
const ready = new Map<string, File>();
export function warmPlanShare(fileId: string | null | undefined, name: string | undefined): void {
  if (!fileId) return;
  const want = pdfName(name);
  if (ready.get(fileId)?.name === want) return;
  fetchPlanCached(fileId).then(buf => { ready.set(fileId, new File([buf], want, { type: 'application/pdf' })); }, () => {});
}

async function handOver(file: File, title?: string): Promise<ShareOutcome> {
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) { download(file); return 'downloaded'; }
  try {
    await navigator.share({ files: [file], title: title || file.name });
    return 'shared';
  } catch (e) {
    const n = (e as Error)?.name;
    if (n === 'AbortError') return 'cancelled';
    if (n === 'NotAllowedError') return 'again';   // the press expired while the plan downloaded
    // Some phone browsers turn down a title beside a file: the file alone, once.
    try { await navigator.share({ files: [file] }); return 'shared'; } catch (e2) {
      const n2 = (e2 as Error)?.name;
      if (n2 === 'AbortError') return 'cancelled';
      if (n2 === 'NotAllowedError') return 'again';
    }
    download(file); return 'downloaded';
  }
}

export async function sharePlanFile(fileId: string, name: string | undefined, title?: string): Promise<ShareOutcome> {
  const want = pdfName(name);
  const warm = ready.get(fileId);
  if (warm) return handOver(warm.name === want ? warm : new File([warm], want, { type: 'application/pdf' }), title);
  let buf: ArrayBuffer;
  try { buf = await fetchPlanCached(fileId); } catch { return 'failed'; }
  const file = new File([buf], want, { type: 'application/pdf' });
  ready.set(fileId, file);
  return handOver(file, title);
}
