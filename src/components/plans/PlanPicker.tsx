import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Folder, FileText, Image as ImageIcon, Loader2, X, ExternalLink } from 'lucide-react';
import {
  DriveFolder, PlanEntry, listFoldersViaBackend, listMarkableViaBackend,
} from '../../data/driveApi';
import { usePlanDownload } from '../../data/planCache';

/**
 * How far a plan's background download has got — quiet, on the row's right.
 * "ready" means its bytes are already here and pressing the row opens it with
 * no wait at all.
 */
function DownloadNote({ fileId }: { fileId: string }) {
  const pct = usePlanDownload(fileId);
  if (pct == null) return null;
  if (pct >= 100) {
    return <span data-plan-ready className="text-[9.5px] font-bold text-emerald-600 flex-shrink-0">ready</span>;
  }
  return (
    <span data-plan-downloading className="flex items-center gap-1 flex-shrink-0 text-[9.5px] text-slate-400 tabular-nums">
      <span className="w-[42px] h-[3px] rounded-full overflow-hidden bg-slate-200">
        <span className="block h-full rounded-full bg-[#4aa8d8]" style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}

/**
 * Which plan, out of which folder.
 *
 * It opens on Engineered Plans with that folder's files listed, because that is
 * where a plan is nine times out of ten. The folder name is a BUTTON: pressing
 * it drops down every folder in the job's Drive, so the tenth time — the plan
 * that was filed under Approvals, or a photo in Site Photos — is two clicks
 * rather than a trip to Drive and back with a link.
 *
 * The search looks in both at once. Typing a FOLDER name narrows the folders;
 * typing a FILE name finds the file wherever it is, and choosing it selects the
 * file AND opens the folder it lives in — otherwise you are told the file
 * exists and left to go and find it, which is the same as not being told.
 */
export function PlanPicker({
  driveLink, plansFolderId, plansFolderName = 'Engineered Plans',
  plans, current, onPick, onOpenNewTab, onClose,
}: {
  driveLink?: string;
  plansFolderId?: string | null;
  plansFolderName?: string;
  /** What is already known about the plans folder, so it opens instantly. */
  plans: PlanEntry[];
  current?: string;
  /**
   * `stayOpen` is true when the file was found in ANOTHER folder: the picker
   * stays up on that folder with the file selected, so you can see where it
   * turned out to live. Choosing from the folder you are already in closes it,
   * because you have finished.
   */
  onPick: (p: PlanEntry, folder: { id: string; name: string }, stayOpen?: boolean) => void;
  /** Offered per row when the host runs tabs — opens the plan in a NEW tab. */
  onOpenNewTab?: (p: PlanEntry) => void;
  onClose: () => void;
}) {
  const [openList, setOpenList] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [folder, setFolder] = useState<{ id: string; name: string } | null>(
    plansFolderId ? { id: plansFolderId, name: plansFolderName } : null,
  );
  const [files, setFiles] = useState<PlanEntry[]>(plans);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  /** Files found in OTHER folders while searching, so a file can be found anywhere. */
  const [wider, setWider] = useState<{ file: PlanEntry; folder: DriveFolder }[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  /**
   * Load the opening folder if nothing was handed over.
   *
   * The caller passes what it already knows so the list is instant, but it may
   * know nothing — and a chooser that opens empty on the folder the plans are
   * actually in is worse than no chooser.
   */
  useEffect(() => {
    if (files.length) return;
    let dead = false;
    setBusy(true);
    (async () => {
      let id = plansFolderId ?? null;
      let name = plansFolderName;
      /**
       * Find the plans folder ourselves if the caller has not.
       *
       * The caller only knows it once it has been looked up, and the chooser
       * can be opened before that has happened — an empty list on the folder
       * the plans are actually in is worse than no chooser at all.
       */
      if (!id && driveLink) {
        const rows = await listFoldersViaBackend(driveLink);
        if (dead) return;
        setFolders(rows);
        const plansFolder = rows.find(f => /engineer|plans/i.test(f.name)) ?? rows[0];
        if (plansFolder) { id = plansFolder.id; name = plansFolder.name; }
      }
      if (!id || dead) { setBusy(false); return; }
      const rows = await listMarkableViaBackend(id);
      if (dead) return;
      setFolder({ id, name });
      setFiles(rows);
      setBusy(false);
    })();
    return () => { dead = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansFolderId, driveLink]);

  // Escape closes the picker and nothing behind it — the studio and the job
  // window both listen for the key as well.
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    }
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);

  // The job's folders, once, when the list is first opened.
  useEffect(() => {
    if (!openList || folders.length || !driveLink) return;
    let dead = false;
    listFoldersViaBackend(driveLink).then(rows => { if (!dead) setFolders(rows); });
    return () => { dead = true; };
  }, [openList, folders.length, driveLink]);

  async function chooseFolder(f: DriveFolder) {
    setFolder(f);
    setOpenList(false);
    setBusy(true);
    setFiles(await listMarkableViaBackend(f.id));
    setBusy(false);
  }

  /**
   * Look for a FILE across the job's folders.
   *
   * Only once there is something worth looking for — a letter or two would
   * open every folder in the job for nothing.
   */
  useEffect(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 3 || !driveLink) { setWider([]); return; }
    let dead = false;
    (async () => {
      const rows = folders.length ? folders : await listFoldersViaBackend(driveLink);
      if (!dead && !folders.length) setFolders(rows);
      const hits: { file: PlanEntry; folder: DriveFolder }[] = [];
      for (const f of rows) {
        if (dead) return;
        if (f.id === folder?.id) continue;          // already listed below
        const inside = await listMarkableViaBackend(f.id);
        for (const file of inside) {
          if (file.name.toLowerCase().includes(needle)) hits.push({ file, folder: f });
        }
        if (!dead) setWider([...hits]);
      }
    })();
    return () => { dead = true; };
  }, [q, driveLink, folders, folder?.id]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? files.filter(f => f.name.toLowerCase().includes(needle)) : files;
  }, [files, q]);

  const shownFolders = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? folders.filter(f => f.name.toLowerCase().includes(needle)) : folders;
  }, [folders, q]);

  // A div wearing role=button, NOT a <button>: the open-in-new-tab control
  // inside it is a real button, and a button inside a button is invalid
  // markup that browsers flatten (the Building Progress lesson).
  const Row = ({ p, sub, onChoose }: { p: PlanEntry; sub?: string; onChoose: () => void }) => (
    <div
      data-plan-row={p.id}
      role="button" tabIndex={0}
      onClick={onChoose}
      onKeyDown={e => { if (e.key === 'Enter') onChoose(); }}
      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 text-left cursor-pointer"
      style={p.id === current ? { backgroundColor: 'rgba(74,168,216,.12)' } : undefined}
    >
      {p.isImage
        ? <ImageIcon size={14} className="text-emerald-600 flex-shrink-0" />
        : <FileText size={14} className="text-[#1e3a5f] flex-shrink-0" />}
      <span className="flex-1 min-w-0">
        <span className="block truncate text-[12.5px] text-slate-700">{p.name}</span>
        {sub && <span className="block truncate text-[10.5px] text-slate-400">{sub}</span>}
      </span>
      <DownloadNote fileId={p.id} />
      {p.kind === 'annotated' && (
        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">
          marked up
        </span>
      )}
      {onOpenNewTab && (
        <button data-open-new-tab={p.id}
          onClick={e => { e.stopPropagation(); onOpenNewTab(p); }}
          title="Open in a new tab"
          className="flex items-center gap-1 px-1.5 py-1 rounded-lg border border-gray-200 text-[10px]
                     font-bold text-[#1e3a5f] hover:border-[#4aa8d8] flex-shrink-0">
          <ExternalLink size={11} /> new tab
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-[162]" style={{ backgroundColor: 'rgba(9,14,22,.45)' }}
        onClick={onClose} />
      <div data-plan-picker
        className="fixed z-[163] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                 width: 'min(460px, 94vw)', maxHeight: '76vh' }}>

        {/* The folder, as a button. */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: '#1e3a5f' }}>
          <button data-folder-button onClick={() => setOpenList(v => !v)}
            title="Choose another folder in this job's Drive"
            className="flex items-center gap-1.5 min-w-0 text-white font-bold text-[13px]">
            <Folder size={15} className="flex-shrink-0 text-[#4aa8d8]" />
            <span className="truncate">{folder?.name ?? plansFolderName}</span>
            <ChevronDown size={14} className="flex-shrink-0 opacity-70" />
          </button>
          <span className="flex-1" />
          <button onClick={onClose} className="p-1 rounded-lg text-white/75 hover:bg-white/15">
            <X size={15} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
          <Search size={14} className="text-gray-400 flex-shrink-0" />
          <input
            ref={searchRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search this job's plans and folders"
            className="flex-1 min-w-0 text-[12.5px] outline-none text-slate-700 placeholder:text-slate-400"
          />
          {busy && <Loader2 size={13} className="animate-spin text-gray-400" />}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {openList && (
            <div className="mb-2">
              <div className="px-2 pb-1 text-[9.5px] font-extrabold tracking-wide text-gray-400">
                FOLDERS
              </div>
              {shownFolders.length === 0 && (
                <p className="px-2 py-2 text-[11.5px] text-gray-400">No folders found.</p>
              )}
              {shownFolders.map(f => (
                <button key={f.id} data-folder-row={f.id} onClick={() => chooseFolder(f)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-gray-50 text-left">
                  <Folder size={14} className="text-[#4aa8d8] flex-shrink-0" />
                  <span className="truncate text-[12.5px] text-slate-700">{f.name}</span>
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 && !busy && (
            <p className="px-2 py-3 text-[11.5px] text-gray-400">
              Nothing to mark up in this folder.
            </p>
          )}
          {shown.map(p => (
            <Row key={p.id} p={p}
              onChoose={() => onPick(p, folder ?? { id: plansFolderId ?? '', name: plansFolderName })} />
          ))}

          {/* Found somewhere else in the job. Choosing one opens its folder. */}
          {wider.length > 0 && (
            <>
              <div className="px-2 pt-3 pb-1 text-[9.5px] font-extrabold tracking-wide text-gray-400">
                ELSEWHERE IN THIS JOB
              </div>
              {wider.map(({ file, folder: f }) => (
                <Row key={`${f.id}-${file.id}`} p={file} sub={f.name}
                  onChoose={() => {
                    // Open the folder it lives in as well as selecting it —
                    // being told a file exists and left to find it is the same
                    // as not being told.
                    setFolder(f);
                    setQ('');
                    setWider([]);
                    void listMarkableViaBackend(f.id).then(setFiles);
                    onPick(file, f, true);   // stay open, on that folder
                  }} />
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
