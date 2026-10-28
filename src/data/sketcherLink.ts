/**
 * The plan's door into the TzviAir Plan Sketcher (owner, 2026-10-28: "once we press Mark up — which should actually be
 * Open in Sketcher — it opens it up in the Sketcher with the block drawer"). The Sketcher is the same markup studio plus
 * the blocks, on its own site, reading the same Firebase project and the same Drive — so the plan, the job and the job's
 * folder travel in the address and the Sketcher files its work where this app would have.
 *
 * The address is the Sketcher's own `sketchPath` (`/sketch/<fileId>?name=&job=&project=&folder=`), kept in step with
 * `src/data/paths.ts` there.
 */
export const SKETCHER_SITE = 'https://tzvi-air-plan-sketcher.vercel.app';

export function sketcherUrl(p: { fileId: string; name?: string; jobId?: string; projectId?: string; folderId?: string | null }): string {
  const q = new URLSearchParams();
  if (p.name) q.set('name', p.name);
  if (p.jobId) q.set('job', p.jobId);
  if (p.projectId) q.set('project', p.projectId);
  if (p.folderId) q.set('folder', p.folderId);
  const qs = q.toString();
  return `${SKETCHER_SITE}/sketch/${encodeURIComponent(p.fileId)}${qs ? `?${qs}` : ''}`;
}
