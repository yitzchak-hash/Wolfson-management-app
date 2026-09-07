/** One place that knows how to address the studio, so a plan opens the same way from every door. */
export interface PlanRef { fileId: string; name?: string; jobId?: string; projectId?: string; folderId?: string }

function query(p: PlanRef): string {
  const q = new URLSearchParams();
  if (p.name) q.set('name', p.name);
  if (p.jobId) q.set('job', p.jobId);
  if (p.projectId) q.set('project', p.projectId);
  if (p.folderId) q.set('folder', p.folderId);
  const qs = q.toString();
  return qs ? '?' + qs : '';
}

export function studioPath(p: PlanRef): string {
  return `/plan/${encodeURIComponent(p.fileId)}${query(p)}`;
}

/** The sketch studio (B7): the studio with the block shelf, over a clean base or any plan. */
export function sketchPath(p: PlanRef): string {
  return `/sketch/${encodeURIComponent(p.fileId)}${query(p)}`;
}

/** The import door (B3): a scan or a picture goes through cleaning before the studio. */
export function importPath(p: PlanRef): string {
  return `/import/${encodeURIComponent(p.fileId)}${query(p)}`;
}

/** Where a file goes when it is opened: a picture is always a scan → import; a PDF opens in the studio (its "Clean" button leads to import). */
export function isPictureName(name: string): boolean {
  return /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|heic)\s*$/i.test(name);
}
export function openPath(p: PlanRef): string {
  return isPictureName(p.name ?? '') ? importPath(p) : studioPath(p);
}
