/**
 * Send files to Drive's trash (owner, 2026-11-08: Tzvi selects photos in the Photos tab and deletes them).
 * Trash, not gone: Drive keeps them 30 days. Through api/drive-upload.js's `trash-files` mode — the 12 functions are
 * all taken, so no new file in /api. Returns the ids that really went to the trash.
 */
const DRIVE_API_KEY = (import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '';

export async function trashDriveFiles(fileIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(fileIds.filter(Boolean))];
  if (!ids.length || !DRIVE_API_KEY) return new Set();
  const r = await fetch('/api/drive-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_API_KEY },
    body: JSON.stringify({ mode: 'trash-files', fileIds: ids }),
  });
  if (!r.ok) throw new Error(`Drive refused (${r.status})`);
  const j = await r.json() as { results?: { id: string; trashed: boolean }[] };
  return new Set((j.results ?? []).filter(x => x.trashed).map(x => x.id));
}
