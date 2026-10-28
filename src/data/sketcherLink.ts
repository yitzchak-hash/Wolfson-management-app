/**
 * The way into the PLAN SKETCHER (owner, 2026-10-28): "I don't want the
 * markup studio to be in the Wolfson management app … it should say Open in
 * Sketcher … open a new tab and take us to the plan sketcher, into that job,
 * and open up the plan for us." The Sketcher is its own app, its own site,
 * reading the same jobs; it opens a plan at
 *   /sketch/<file id>?name=<plan>&job=<apartment id>&project=<workspace>&folder=<job's Drive folder>
 * — its `sketchPath`. A plan with no job (the board's file tray) opens with
 * the file alone and the Sketcher files it as a plan of its own.
 */
export const SKETCHER_URL = (import.meta.env.VITE_SKETCHER_URL as string | undefined)?.replace(/\/$/, '')
  || 'https://tzvi-air-plan-sketcher.vercel.app';

export interface SketcherPlan {
  fileId: string;
  name?: string;
  jobId?: string;
  projectId?: string;
  folderId?: string | null;
}

export function sketcherPlanUrl(p: SketcherPlan): string {
  const q = new URLSearchParams();
  if (p.name) q.set('name', p.name);
  if (p.jobId) q.set('job', p.jobId);
  if (p.projectId) q.set('project', p.projectId);
  if (p.folderId) q.set('folder', p.folderId);
  const qs = q.toString();
  return `${SKETCHER_URL}/sketch/${encodeURIComponent(p.fileId)}${qs ? '?' + qs : ''}`;
}

/** Opens the plan in the Sketcher in a NEW TAB. */
export function openInSketcher(p: SketcherPlan): void {
  // `noopener` keeps the Sketcher's tab from reaching back into this one; with it
  // window.open answers null even when the tab opened, so there is nothing to test.
  window.open(sketcherPlanUrl(p), '_blank', 'noopener');
}
