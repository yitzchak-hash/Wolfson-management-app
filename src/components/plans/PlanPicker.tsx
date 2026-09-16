import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Folder, Loader2, X, CornerDownRight } from 'lucide-react';
import {
  DriveFolder, PlanEntry, listFoldersViaBackend, listMarkableViaBackend,
  listFolderPlansViaBackend, listPlanSubfoldersViaBackend,
} from '../../data/driveApi';
import { FileTile, SkeletonTiles, TileGrid } from './PlanBrowser';

/** A folder in the dropdown — `sub` marks a child slotted in under its parent. */
type FolderRow = DriveFolder & { sub?: boolean };

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
  plans, current, onPick, onOpenNewTab, onClose, onStar, starredId, starAuto, onPreview,
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
  /**
   * THE STAR: "make this the contractor's plan". The host writes plansPdfLink;
   * the picker only draws which tile wears it (`starredId`, the apartment's
   * plansPdfLink). Without the callback no star is drawn at all.
   */
  onStar?: (p: PlanEntry) => void;
  starredId?: string | null;
  /** The star is the app's latest-activity guess, drawn red until a person stars one. */
  starAuto?: boolean;
  /** The tile's expand arrow — open this sheet as a LOOK, never a choice. */
  onPreview?: (p: PlanEntry, folder: { id: string; name: string }) => void;
}) {
  const [openList, setOpenList] = useState(false);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [folder, setFolder] = useState<{ id: string; name: string } | null>(
    plansFolderId ? { id: plansFolderId, name: plansFolderName } : null,
  );
  /**
   * The opening view shows ONLY the main plans folder's own files (the
   * owner's ask) — the markups live under the Annotated Plans row in the
   * folder list, one press away, not mixed into the first screen.
   */
  const [files, setFiles] = useState<PlanEntry[]>(plans.filter(p => p.kind !== 'annotated'));
  const [busy, setBusy] = useState(false);
  /** The folder dropdown's own two waits, so nothing ever just JUMPS in. */
  const [foldersBusy, setFoldersBusy] = useState(false);
  const [subsBusy, setSubsBusy] = useState(false);
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
    let dead = false;
    if (!files.length) setBusy(true);
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
      setFolder(cur => cur ?? { id: id!, name });
      /**
       * ALWAYS re-list live, even when the caller handed a list over — the
       * handed list is what the drawer fetched when it OPENED. The folder's
       * OWN files only (the owner's ruling): the markups show under the
       * Annotated Plans folder in the dropdown, not mixed into this view.
       */
      const fresh = await listFolderPlansViaBackend(id);
      if (dead) return;
      // UNION, fresh first: the live listing brings what was saved since the
      // handed list was fetched, and the handed list keeps a version stamped
      // seconds ago that Drive's listing may not return yet.
      if (fresh.length || !files.length) {
        setFiles(prev => {
          const have = new Set(fresh.map(f => f.id));
          return [...fresh, ...prev.filter(f => !have.has(f.id))];
        });
      }
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

  // The job's folders, once, when the list is first opened — and then EVERY
  // top folder's own subfolders, slotted in under their parent, indented
  // (the owner's ask: "folders, then subfolders"). "Annotated Plans" lives
  // INSIDE Engineered Plans, one level deeper than the job-folder listing
  // reaches, and it was far from the only folder a level down — superseded
  // issues, a contractor's own set. The top rows land first so the list is
  // usable at once; children fill in as each small batch answers.
  // Guarded by a REF, not by folders.length: the sweep's own early
  // setFolders(rows) changes the length, and with the length in the dep list
  // that very write re-ran the effect, whose cleanup raised `dead` and killed
  // the subfolder batches mid-flight — the list showed the top folders and
  // silently never grew.
  const sweptRef = useRef(false);
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  useEffect(() => {
    if (!openList || sweptRef.current || !driveLink) return;
    sweptRef.current = true;
    let dead = false;
    (async () => {
      let rows: FolderRow[] = foldersRef.current;
      if (!rows.length) {
        setFoldersBusy(true);
        rows = await listFoldersViaBackend(driveLink);
        if (dead) return;
        setFoldersBusy(false);
        setFolders(rows);
      }
      setSubsBusy(true);
      const tree = [...rows];
      const tops: FolderRow[] = [...rows];
      // The plans folder may sit outside the job folder's own children (a
      // link straight to it) — its subfolders still belong on the list.
      const plansId = folder?.id ?? plansFolderId ?? null;
      if (plansId && !rows.some(r => r.id === plansId)) {
        tops.push({ id: plansId, name: folder?.name ?? plansFolderName });
      }
      for (let i = 0; i < tops.length; i += 3) {           // gentle on the API
        const batch = tops.slice(i, i + 3);
        const subLists = await Promise.all(batch.map(f => listPlanSubfoldersViaBackend(f.id)));
        if (dead) return;
        batch.forEach((f, j) => {
          const have = new Set(tree.map(r => r.id));
          const at = tree.findIndex(r => r.id === f.id);
          const subs = subLists[j]
            .filter(sf => !have.has(sf.id))
            .map(sf => ({ id: sf.id, name: sf.name, sub: at >= 0 }));
          tree.splice(at >= 0 ? at + 1 : tree.length, 0, ...subs);
        });
        setFolders([...tree]);
      }
      if (!dead) setSubsBusy(false);
    })();
    return () => { dead = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openList, driveLink]);

  async function chooseFolder(f: DriveFolder) {
    setFolder(f);
    setOpenList(false);
    setBusy(true);
    setFiles([]);   // skeletons, never the old folder's rows jumping out
    // The folder's OWN files. A markups folder's rows are marked `annotated`
    // so the chip shows and — belt and braces with the host's own folder
    // check — picking one can never write plansPdfLink.
    const rows = await listFolderPlansViaBackend(f.id);
    const annot = /annotated/i.test(f.name);
    setFiles(annot ? rows.map(p => ({ ...p, kind: 'annotated' as const })) : rows);
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

  const here = folder ?? { id: plansFolderId ?? '', name: plansFolderName };
  /** A plan as a tile — the browser's own tile, keyed `data-plan-row` for the standing probes. */
  const tile = (p: PlanEntry, sub: string | undefined, onChoose: () => void, inFolder: { id: string; name: string }) => (
    <FileTile
      key={`${inFolder.id}-${p.id}`}
      rowHook="plan-row"
      file={{ id: p.id, name: p.name, isImage: p.isImage, annotated: p.kind === 'annotated', viewable: true }}
      current={p.id === current}
      starred={!!starredId && starredId === p.id}
      starAuto={starAuto}
      sub={sub}
      onOpen={onChoose}
      onStar={onStar ? () => onStar(p) : undefined}
      onPreview={onPreview ? () => onPreview(p, inFolder) : undefined}
      onOpenNewTab={onOpenNewTab ? () => onOpenNewTab(p) : undefined}
    />
  );

  return (
    <>
      <div className="fixed inset-0 z-[162]" style={{ backgroundColor: 'rgba(9,14,22,.45)' }}
        onClick={onClose} />
      <div data-plan-picker
        className="fixed z-[163] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col"
        style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                 width: 'min(560px, 94vw)', maxHeight: '76vh' }}>

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
              {/* A wait LOOKS like a wait — rows landing into silence read as
                  the list jumping (the owner's report). */}
              {foldersBusy && [0, 1, 2].map(i => (
                <div key={i} data-folder-skeleton className="flex items-center gap-2 px-2.5 py-2 animate-pulse">
                  <span className="w-3.5 h-3.5 rounded bg-slate-200" />
                  <span className="h-3 rounded bg-slate-200" style={{ width: `${52 - i * 9}%` }} />
                </div>
              ))}
              {!foldersBusy && shownFolders.length === 0 && (
                <p className="px-2 py-2 text-[11.5px] text-gray-400">No folders found.</p>
              )}
              {shownFolders.map(f => (
                <button key={f.id} data-folder-row={f.id} data-folder-sub={f.sub ? '1' : undefined}
                  onClick={() => chooseFolder(f)}
                  className={`w-full flex items-center gap-2 py-2 rounded-lg hover:bg-gray-50 text-left ${
                    f.sub ? 'pl-7 pr-2.5' : 'px-2.5'}`}>
                  {f.sub && <CornerDownRight size={11} className="text-slate-300 flex-shrink-0" />}
                  <Folder size={14} className="text-[#4aa8d8] flex-shrink-0" />
                  <span className="truncate text-[12.5px] text-slate-700">{f.name}</span>
                </button>
              ))}
              {subsBusy && !foldersBusy && (
                <div data-subs-busy className="flex items-center gap-2 px-2.5 py-1.5 text-[10.5px] text-slate-400">
                  <Loader2 size={11} className="animate-spin" /> finding subfolders…
                </div>
              )}
            </div>
          )}

          {/* The file list waits out loud too — never stale rows, never a
              blank that fills in with a jump. */}
          {busy && shown.length === 0 && (
            <TileGrid><SkeletonTiles hook="plan-skeleton" count={3} /></TileGrid>
          )}
          {shown.length === 0 && !busy && (
            <p className="px-2 py-3 text-[11.5px] text-gray-400">
              Nothing to mark up in this folder.
            </p>
          )}
          {shown.length > 0 && (
            <TileGrid>
              {shown.map(p => tile(p, undefined, () => onPick(p, here), here))}
            </TileGrid>
          )}

          {/* Found somewhere else in the job. Choosing one opens its folder. */}
          {wider.length > 0 && (
            <>
              <div className="px-2 pt-3 pb-1 text-[9.5px] font-extrabold tracking-wide text-gray-400">
                ELSEWHERE IN THIS JOB
              </div>
              <TileGrid>
                {wider.map(({ file, folder: f }) => tile(file, f.name, () => {
                  // Open the folder it lives in as well as selecting it —
                  // being told a file exists and left to find it is the same
                  // as not being told.
                  setFolder(f);
                  setQ('');
                  setWider([]);
                  void listMarkableViaBackend(f.id).then(setFiles);
                  onPick(file, f, true);   // stay open, on that folder
                }, f))}
              </TileGrid>
            </>
          )}
        </div>
      </div>
    </>
  );
}
