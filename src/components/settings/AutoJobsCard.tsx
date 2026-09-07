import React, { useEffect, useState } from 'react';
import { FolderSync, Loader2, Play } from 'lucide-react';
import { useStore } from '../../data/store';
import { AUTO_JOBS_GROUP, autoJobsSetting, sweepAutoJobs } from '../../data/autoJobs';
import { isUploadBackendConfigured } from '../../data/driveApi';

/**
 * Job Board project settings → "Automatic jobs from Drive" (owner,
 * 2026-09-07). The switch, the watched folder links (one per line), a
 * Check-now button, and the last sweep's result. The service account's
 * email is shown because every watched folder has to be shared with it —
 * that is the whole reason a sweep can see the folder at all.
 */
export function AutoJobsCard({ onToast }: { onToast: (msg: string, type?: 'success' | 'error') => void }) {
  const boardSettings = useStore(st => st.boardSettings);
  const setBoardSettingFor = useStore(st => st.setBoardSettingFor);
  const setting = boardSettings.general?.autoJobs ?? { on: false, folders: [] };
  const [links, setLinks] = useState((setting.folders ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => { setLinks((autoJobsSetting()?.folders ?? []).join('\n')); }, [boardSettings]);
  useEffect(() => {
    let dead = false;
    fetch('/api/geocode?health=1').then(r => r.ok ? r.json() : null).then(j => { if (!dead && j?.clientEmail) setEmail(j.clientEmail); }).catch(() => {});
    return () => { dead = true; };
  }, []);

  function saveLinks() {
    const folders = links.split(/\n+/).map(l => l.trim()).filter(Boolean);
    setBoardSettingFor('general', 'autoJobs', { ...setting, folders });
  }
  async function runNow() {
    saveLinks();
    setBusy(true);
    try {
      const r = await sweepAutoJobs('manual');
      onToast(r.created ? `${r.created} new job${r.created === 1 ? '' : 's'} came in: ${r.names.slice(0, 4).join(', ')}${r.names.length > 4 ? '…' : ''}` : r.note, r.created ? 'success' : undefined);
    } finally { setBusy(false); }
  }

  return (
    <div data-autojobs-card className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
      <div className="flex items-center gap-2 mb-1">
        <FolderSync size={16} className="text-[#1e3a5f]" />
        <span className="text-sm font-bold text-gray-800">Automatic jobs from Drive</span>
        <label className="ms-auto inline-flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
          <input type="checkbox" data-autojobs-on checked={!!setting.on}
            onChange={e => setBoardSettingFor('general', 'autoJobs', { ...setting, folders: setting.folders ?? [], on: e.target.checked })} />
          {setting.on ? 'On' : 'Off'}
        </label>
      </div>
      <p className="text-[11.5px] text-gray-500 mb-2">
        Every two hours the app looks inside these Drive folders. A folder nobody has a job for yet becomes a job
        here — the family from the folder's name, the folder as its Drive link — filed into the
        “{AUTO_JOBS_GROUP}” group. Nothing is ever removed.
      </p>
      <label className="block text-[10.5px] font-extrabold uppercase tracking-wider text-gray-500 mb-1">Folders to watch — one link per line</label>
      <textarea data-autojobs-folders value={links} onChange={e => setLinks(e.target.value)} onBlur={saveLinks}
        rows={3} placeholder="https://drive.google.com/drive/folders/…"
        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#4aa8d8]/40" />
      <div className="text-[11px] text-gray-500 mt-1">
        {email
          ? <>Share each folder with <span className="font-mono text-gray-700 select-all">{email}</span> (viewer is enough).</>
          : isUploadBackendConfigured() ? 'Share each folder with the service account email shown in the Drive test panel.' : 'The Drive backend is not configured on this deployment, so the sweep cannot run here.'}
      </div>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <button type="button" data-autojobs-run onClick={runNow} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: '#1e3a5f' }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Check now
        </button>
        <span data-autojobs-status className="text-[11px] text-gray-500">
          {setting.lastRunAt
            ? <>Last checked {new Date(setting.lastRunAt).toLocaleString()} — {setting.lastNote ?? ''}</>
            : 'Never checked yet.'}
        </span>
      </div>
    </div>
  );
}
