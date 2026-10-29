/**
 * SETTINGS → BACKUPS (owner, 2026-10-29). One place for everything about
 * backups:
 *  - Automatic: which Drive folder, how often during the day (the night one
 *    always runs, on the server), the last one, and "Back up now".
 *  - Backups in Drive: every full backup (all workspaces, every record),
 *    newest first, each with Preview (the whole app as it was, in its own tab,
 *    where Restore is pressed) and Download (the full backup as a .json on
 *    this computer). The older one-workspace files on request.
 *  - From a file: a backup file from this computer is put in the Drive folder
 *    and opened in the same Preview.
 * The full backup itself: lib/fullBackup.js; preview: previewMode.ts;
 * restore: lib/fullRestore.js.
 */
import React from 'react';
import { saveAs } from 'file-saver';
import { Download, ExternalLink, Eye, FileUp, Loader2, RefreshCw } from 'lucide-react';
import { useStore, type FullBackupEvery } from '../../data/store';
import { SettingBox, SettingRow } from './SettingsShell';

type Row = { id: string; name: string; createdTime: string; sizeKB: number; records: number | null; kind: 'full' | 'uploaded' | 'old' };
const DRIVE_KEY = (import.meta.env.VITE_DRIVE_API_KEY as string | undefined) ?? '';
const ENV_Q = () => new URLSearchParams({
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) ?? '',
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) ?? '',
});

const when = (iso: string) => {
  try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
};
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

async function fileBytes(id: string): Promise<Uint8Array> {
  const r = await fetch(`/api/drive-fetch?id=${encodeURIComponent(id)}&k=${encodeURIComponent(DRIVE_KEY)}`);
  if (!r.ok) throw new Error(`Drive answered ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
const isGz = (b: Uint8Array) => b[0] === 0x1f && b[1] === 0x8b;
async function gunzip(b: Uint8Array): Promise<string> {
  return new Response(new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
async function gzip(text: string): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
function base64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
const preview = (id: string) => window.open(`/?previewBackup=${encodeURIComponent(id)}`, '_blank');

export function BackupsPage({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const folder = useStore(st => st.backupDriveFolderLink);
  const setFolder = useStore(st => st.setBackupDriveFolder);
  const every = useStore(st => st.fullBackupEvery);
  const setEvery = useStore(st => st.setFullBackupEvery);
  const exportToDrive = useStore(st => st.exportToDrive);

  const [draft, setDraft] = React.useState(folder);
  React.useEffect(() => setDraft(folder), [folder]);
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [folderId, setFolderId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState('');
  const [withOld, setWithOld] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);   // which press is working
  const [showAll, setShowAll] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async (old: boolean) => {
    setErr('');
    try {
      const q = ENV_Q(); q.set('listFullBackups', '1'); if (old) q.set('old', '1');
      const r = await fetch(`/api/drive-upload?${q}`, { headers: { 'x-api-key': DRIVE_KEY } });
      if (!r.ok) throw new Error(`Drive answered ${r.status}`);
      const j = await r.json();
      setRows(j.files ?? []); setFolderId(j.folderId ?? null);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
  }, []);
  React.useEffect(() => { void load(withOld); }, [load, withOld]);

  const lastFull = rows?.find(r => r.kind === 'full') ?? null;

  const backUpNow = async () => {
    setBusy('now');
    const r = await exportToDrive({ now: true });
    setBusy(null);
    if (r.ok) { onToast(r.skipped ? 'Nothing changed since the last backup' : 'Saved to Drive'); void load(withOld); }
    else onToast(`Not saved: ${r.error}`, 'error');
  };

  const download = async (row: Row) => {
    setBusy(`dl-${row.id}`);
    try {
      const b = await fileBytes(row.id);
      const text = isGz(b) ? await gunzip(b) : new TextDecoder().decode(b);
      const base = row.name.replace(/\.json(\.gz)?$/, '');
      saveAs(new Blob([text], { type: 'application/json' }), `${base}.json`);
    } catch (e) { onToast(`Could not download: ${String((e as Error).message ?? e)}`, 'error'); }
    setBusy(null);
  };

  const openFile = async (f: File) => {
    setBusy('file');
    try {
      const raw = new Uint8Array(await f.arrayBuffer());
      const text = isGz(raw) ? await gunzip(raw) : new TextDecoder().decode(raw);
      const j = JSON.parse(text) as Record<string, unknown>;
      if (j.kind !== 'tzviair-full-backup' && !Array.isArray(j.apartments)) throw new Error('This file is not a TzviAir backup');
      if (!folderId) throw new Error('The Drive folder is not ready');
      const gz = await gzip(text);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const r = await fetch('/api/drive-upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': DRIVE_KEY },
        body: JSON.stringify({ folderId, filename: `uploaded-${stamp}-${f.name.replace(/\.gz$/, '')}.gz`, mimeType: 'application/gzip', data: base64(gz) }),
      });
      if (!r.ok) throw new Error(`Drive answered ${r.status}`);
      const { fileId } = await r.json();
      preview(fileId);
      void load(withOld);
    } catch (e) { onToast(String((e as Error).message ?? e), 'error'); }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const list = rows ? (showAll ? rows : rows.slice(0, 12)) : [];
  const kindLabel = (r: Row) => (r.kind === 'old' ? 'One workspace (old)' : r.kind === 'uploaded' ? 'From a file' : `${r.records ? r.records.toLocaleString() : '—'} records`);

  return (
    <>
      <SettingBox name="Automatic">
        <SettingRow label="Drive folder" hint={folder ? 'Backups go into its Backups folder' : 'Not set'} htmlFor="bk-folder">
          <input id="bk-folder" className="tz-input w-full md:w-80" value={draft} onChange={e => setDraft(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" />
          <button className="tz-btn tz-btn-secondary" disabled={draft.trim() === folder} onClick={() => { setFolder(draft.trim()); onToast('Drive folder saved'); }}>Save</button>
          {folder && <a className="tz-btn tz-btn-quiet" href={folder} target="_blank" rel="noreferrer" aria-label="Open in Drive"><ExternalLink /></a>}
        </SettingRow>
        <SettingRow label="During the day" hint="The night backup always runs" htmlFor="bk-every">
          <select id="bk-every" className="tz-select" value={every} onChange={e => setEvery(e.target.value as FullBackupEvery)}>
            <option value="activity">After changes</option>
            <option value="hourly">Every hour</option>
            <option value="every4h">Every 4 hours</option>
            <option value="night">Only at night</option>
          </select>
        </SettingRow>
        <SettingRow label="Last backup" hint={lastFull ? `${when(lastFull.createdTime)} · ${ago(lastFull.createdTime)}` : rows ? 'none yet' : undefined}>
          <button className="tz-btn tz-btn-secondary" onClick={backUpNow} disabled={busy === 'now' || !folder}>
            {busy === 'now' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Back up now
          </button>
        </SettingRow>
      </SettingBox>

      <SettingBox name="Backups in Drive">
        {err && <SettingRow label="The list could not be read" hint={err} />}
        {!rows && !err && <SettingRow label={<span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Reading the list</span>} />}
        {rows && rows.length === 0 && <SettingRow label="No backups yet" />}
        {list.map(r => (
          <SettingRow key={r.id} label={when(r.createdTime)} hint={`${kindLabel(r)} · ${r.sizeKB.toLocaleString()} KB`}>
            <button className="tz-btn tz-btn-secondary" onClick={() => preview(r.id)}><Eye /> Preview</button>
            <button className="tz-btn tz-btn-quiet" onClick={() => download(r)} disabled={busy === `dl-${r.id}`} aria-label="Download">
              {busy === `dl-${r.id}` ? <Loader2 className="animate-spin" /> : <Download />}
            </button>
          </SettingRow>
        ))}
        {rows && (rows.length > 12 || !withOld) && (
          <div className="flex flex-wrap gap-2 py-3">
            {rows.length > 12 && <button className="tz-btn tz-btn-quiet" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</button>}
            {!withOld && <button className="tz-btn tz-btn-quiet" onClick={() => { setRows(null); setWithOld(true); }}>Show the older one-workspace files</button>}
          </div>
        )}
      </SettingBox>

      <SettingBox name="From a file">
        <SettingRow label="Open a backup file" hint="It opens in the preview first">
          <input ref={fileRef} type="file" accept=".json,.gz,application/json,application/gzip" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void openFile(f); }} />
          <button className="tz-btn tz-btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy === 'file' || !folderId}>
            {busy === 'file' ? <Loader2 className="animate-spin" /> : <FileUp />} Choose a file
          </button>
        </SettingRow>
      </SettingBox>
    </>
  );
}
