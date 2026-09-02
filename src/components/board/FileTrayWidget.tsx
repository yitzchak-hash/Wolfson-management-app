import React, { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CloudUpload, Download, Eye, X, FileText, Image as ImageIcon,
  File as FileIcon, Loader2, PenLine,
} from 'lucide-react';
import { CanvasElement } from '../../types';
import { WidgetCtx } from '../../data/widgets';
import { useStore } from '../../data/store';
import {
  isUploadBackendConfigured, extractFolderId, findOrCreateFolderViaBackend,
  uploadFileViaBackend, shareFileToDrive, fetchPlanBytes,
} from '../../data/driveApi';
import { saveBytes, safeFileName } from '../../data/planExport';

/**
 * THE FILE TRAY — the owner's "file receiver / file sender" widget, built as
 * ONE widget because the board already syncs: Esther drags a file onto the
 * tray on her PC (or clicks it to browse), and the SAME widget on the TV —
 * or any other screen — shows it seconds later with a download button. The
 * sender and the receiver are the same tray seen from two desks.
 *
 * Where the bytes live: uploaded to a "File Tray" subfolder of the Drive
 * backup folder (the Board Files precedent) and shared on upload, so the
 * record carries only a URL — the voice-memo rule. Without the backend a
 * small file rides as a data URL (capped well under the Firestore document
 * limit) and anything bigger is refused out loud.
 *
 * A PDF previews IN PLACE — an overlay over everything drawing the sheet
 * through the app's own viewer (no Google login, the plan-pane precedent),
 * with a Mark up button on top that opens the full studio; a stamped copy
 * files into Annotated Plans beside the original. Images preview the same
 * way. The wall is read-only for uploads but its download and preview taps
 * work — a TV is where the tray is READ.
 */

export interface TrayFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** ISO stamp — what makes a fresh arrival glow. */
  at: string;
  by?: string;
  /** Drive view link, or a small data URL when no backend is configured. */
  url: string;
  /** Drive file id — what preview, download and markup fetch bytes by. */
  fileId?: string;
}

const LOCAL_CAP = 700_000;
const FRESH_MS = 3 * 60_000;

const PlanAnnotator = React.lazy(() =>
  import('../plans/PlanAnnotator').then(m => ({ default: m.PlanAnnotator })));

const isPdf = (f: TrayFile) => /pdf$/i.test(f.mime) || /\.pdf$/i.test(f.name);
const isImage = (f: TrayFile) => /^image\//i.test(f.mime) || /\.(png|jpe?g|gif|webp)$/i.test(f.name);

function kindIcon(f: TrayFile) {
  if (isPdf(f)) return <FileText size={15} className="text-red-500" />;
  if (isImage(f)) return <ImageIcon size={15} className="text-sky-500" />;
  return <FileIcon size={15} className="text-gray-400" />;
}

function sizeWord(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

const SAMPLE: TrayFile[] = [
  { id: 's1', name: 'Miller — revised plan.pdf', mime: 'application/pdf', size: 2_400_000,
    at: new Date().toISOString(), by: 'Esther', url: '#' },
  { id: 's2', name: 'condenser photo.jpg', mime: 'image/jpeg', size: 890_000,
    at: new Date(Date.now() - 3600e3).toISOString(), by: 'Esther', url: '#' },
  { id: 's3', name: 'price list.xlsx', mime: 'application/vnd.ms-excel', size: 45_000,
    at: new Date(Date.now() - 7200e3).toISOString(), by: 'Max', url: '#' },
];

export function FileTrayWidget({ el, c }: { el: CanvasElement; c: WidgetCtx }) {
  const data = (el.data ?? {}) as { files?: TrayFile[]; folderId?: string; sample?: unknown };
  const backupDriveFolderLink = useStore(s => s.backupDriveFolderLink);
  const me = useStore(s => s.currentUser?.name) ?? 'Office';
  const sample = !!data.sample;
  const files: TrayFile[] = sample ? SAMPLE : (data.files ?? []);

  const [hot, setHot] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [fetching, setFetching] = useState('');
  const [preview, setPreview] = useState<TrayFile | null>(null);
  const [markup, setMarkup] = useState<TrayFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // A fresh arrival stops glowing on its own — one cheap tick.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick(x => x + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  async function addFiles(list: FileList | File[]) {
    if (sample || c.readOnly) return;
    const incoming = [...list];
    if (!incoming.length) return;
    setErr('');
    const parent = backupDriveFolderLink ? extractFolderId(backupDriveFolderLink) : null;
    const added: TrayFile[] = [];
    let folderId = data.folderId;
    for (const f of incoming) {
      setBusy(f.name);
      let entry: TrayFile | null = null;
      if (isUploadBackendConfigured() && parent) {
        try {
          folderId = folderId || await findOrCreateFolderViaBackend(parent, 'File Tray');
          const res = await uploadFileViaBackend(folderId, f);
          if (res?.fileId) void shareFileToDrive(res.fileId);
          if (res?.webViewLink) {
            entry = {
              id: 'TF-' + Math.random().toString(36).slice(2, 9),
              name: f.name, mime: f.type || 'application/octet-stream', size: f.size,
              at: new Date().toISOString(), by: me,
              url: res.webViewLink, fileId: res.fileId,
            };
          }
        } catch { /* fall through to the local path */ }
      }
      if (!entry) {
        if (f.size > LOCAL_CAP) {
          setErr(`"${f.name}" is too big to send without Drive — set the backup folder in App settings.`);
          continue;
        }
        const url = await new Promise<string | null>(resolve => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => resolve(null);
          fr.readAsDataURL(f);
        });
        if (!url) { setErr(`"${f.name}" could not be read.`); continue; }
        entry = {
          id: 'TF-' + Math.random().toString(36).slice(2, 9),
          name: f.name, mime: f.type || 'application/octet-stream', size: f.size,
          at: new Date().toISOString(), by: me, url,
        };
      }
      added.push(entry);
    }
    setBusy('');
    if (!added.length) return;
    // ONE write for the whole batch — newest first, folderId remembered so
    // the markup studio knows where stamped copies belong.
    c.update({ data: { ...data, files: [...added, ...(data.files ?? [])], ...(folderId ? { folderId } : {}) } });
  }

  async function download(f: TrayFile) {
    if (sample) return;
    try {
      if (f.url.startsWith('data:')) {
        const blob = await (await fetch(f.url)).blob();
        saveBytes(blob, safeFileName(f.name), f.mime);
        return;
      }
      if (f.fileId) {
        setFetching(f.id);
        const bytes = await fetchPlanBytes(f.fileId);
        saveBytes(new Blob([bytes]), safeFileName(f.name), f.mime);
        return;
      }
      window.open(f.url, '_blank', 'noreferrer');
    } catch {
      setErr(`Could not fetch "${f.name}" — try its Drive link.`);
    } finally {
      setFetching('');
    }
  }

  const canPreview = (f: TrayFile) => !sample && (isPdf(f) || isImage(f)) && (!!f.fileId || f.url.startsWith('data:'));

  return (
    <div className="flex flex-col h-full min-h-0 gap-1.5" data-file-tray>
      {/* The drop zone — hidden on the wall, where the tray is read. */}
      {!c.readOnly && (
        <button
          data-tray-drop
          data-no-drag data-el-action
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setHot(true); }}
          onDragLeave={() => setHot(false)}
          onDrop={e => {
            e.preventDefault(); e.stopPropagation(); setHot(false);
            void addFiles(e.dataTransfer.files);
          }}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed px-2 py-2.5 text-[11.5px] font-bold transition-colors flex-shrink-0"
          style={hot
            ? { borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.10)', color: '#166534' }
            : { borderColor: '#c7d4e0', color: '#64748b' }}
        >
          {busy
            ? <><Loader2 size={14} className="animate-spin" /> {`Sending ${busy}…`}</>
            : <><CloudUpload size={15} /> Drop a file here — or press to choose</>}
          <input
            ref={inputRef} type="file" multiple className="hidden" data-tray-input
            // COPY before clearing: a FileList is live, and resetting the
            // input's value empties it — the picked files silently vanished.
            onChange={e => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = '';
              if (picked.length) void addFiles(picked);
            }} />
        </button>
      )}

      {err && <p className="text-[10px] text-red-600 flex-shrink-0">{err}</p>}

      <div className="flex-1 min-h-0 overflow-y-auto widget-scroll space-y-1">
        {files.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-4">
            Nothing in the tray — whatever lands here shows on every screen.
          </p>
        ) : files.map(f => {
          const fresh = Date.now() - Date.parse(f.at) < FRESH_MS;
          return (
            <div key={f.id}
              data-tray-file
              className="flex items-center gap-1.5 rounded-lg border px-1.5 py-1 bg-white"
              style={fresh
                ? { borderColor: '#4aa8d8', boxShadow: '0 0 0 2px rgba(74,168,216,.25)' }
                : { borderColor: '#eef1f5' }}>
              <span className="flex-shrink-0">{kindIcon(f)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold text-gray-800 truncate">{f.name}</span>
                <span className="block text-[9px] text-gray-400 truncate">
                  {sizeWord(f.size)}{f.by ? ` · ${f.by}` : ''} · {new Date(f.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {fresh && <span className="ms-1 font-bold text-[#4aa8d8]">new</span>}
                </span>
              </span>
              {canPreview(f) && (
                <button data-no-drag data-el-action data-tray-preview
                  // A PLAN opens straight into the markup studio (the owner's
                  // ask): looking at a drawing and marking it up are one act,
                  // and the studio's first save asks where the copy belongs.
                  // Images — and a data-URL PDF, which the studio cannot
                  // fetch by id — keep the plain preview; so does the wall.
                  onClick={() => (isPdf(f) && f.fileId && !c.readOnly && !sample)
                    ? setMarkup(f) : setPreview(f)}
                  title={isPdf(f) && f.fileId && !c.readOnly && !sample ? 'Open in markup' : 'Preview'}
                  className="p-1 rounded-md text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100 flex-shrink-0">
                  <Eye size={13} />
                </button>
              )}
              <button data-no-drag data-el-action data-tray-download
                onClick={() => void download(f)} title="Download"
                className="p-1 rounded-md text-gray-400 hover:text-[#1e3a5f] hover:bg-gray-100 flex-shrink-0">
                {fetching === f.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              </button>
              {!c.readOnly && !sample && (
                <button data-no-drag data-el-action
                  onClick={() => c.update({ data: { ...data, files: (data.files ?? []).filter(x => x.id !== f.id) } })}
                  title="Remove from the tray (the Drive copy stays)"
                  className="p-1 rounded-md text-gray-300 hover:text-red-500 flex-shrink-0">
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* The in-place preview — over everything, sealed (the portal-in-a-node
          trap), Escape closes. */}
      {preview && createPortal(
        <TrayPreview
          f={preview}
          me={me}
          elId={el.id}
          folderId={data.folderId}
          readOnly={!!c.readOnly}
          onMarkup={() => { setMarkup(preview); setPreview(null); }}
          onDownload={() => void download(preview)}
          onClose={() => setPreview(null)}
        />, document.body)}

      {/* The full markup studio — it draws its own full-screen surface. */}
      {markup?.fileId && createPortal(
        <Suspense fallback={
          <div className="fixed inset-0 z-[250] flex items-center justify-center gap-2 text-white text-sm"
            style={{ backgroundColor: '#111827' }}>
            <Loader2 size={16} className="animate-spin" /> Loading the markup tools…
          </div>
        }>
          <div onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}>
            <PlanAnnotator
              planFileId={markup.fileId}
              planName={markup.name}
              apartmentId={`FT-${el.id}`}
              apartmentLabel={markup.name}
              authorName={me}
              plansFolderId={data.folderId}
              /* A tray plan has no job of its own — the studio's first save
                 asks WHERE the marked-up copy belongs (the tray's folder, or
                 a job's plans folder) and files there from then on. */
              chooseSaveFolder
              onClose={() => setMarkup(null)}
            />
          </div>
        </Suspense>, document.body)}
    </div>
  );
}

/** The overlay a preview opens — the sheet through the app's own viewer. */
function TrayPreview({ f, me, elId, folderId, readOnly, onMarkup, onDownload, onClose }: {
  f: TrayFile;
  me: string;
  elId: string;
  folderId?: string;
  readOnly: boolean;
  onMarkup: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(f.url.startsWith('data:') ? f.url : null);
  useEffect(() => {
    if (!isImage(f) || f.url.startsWith('data:') || !f.fileId) return;
    let alive = true;
    let made = '';
    void fetchPlanBytes(f.fileId).then(bytes => {
      if (!alive) return;
      made = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
      setImgUrl(made);
    }).catch(() => {});
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [f]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', key, { capture: true });
    return () => window.removeEventListener('keydown', key, { capture: true });
  }, [onClose]);

  const seal = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerMove: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onWheel: (e: React.WheelEvent) => e.stopPropagation(),
    onContextMenu: (e: React.MouseEvent) => e.stopPropagation(),
  };

  return (
    <div className="fixed inset-0 z-[240] flex flex-col" data-tray-overlay {...seal}
      style={{ backgroundColor: 'rgba(10,16,28,.88)' }}>
      <div className="flex items-center gap-2 px-3 md:px-5 py-2.5 flex-shrink-0"
        style={{ backgroundColor: '#1e3a5f' }}>
        <span className="text-white font-bold text-[14px] truncate flex-1">{f.name}</span>
        {isPdf(f) && f.fileId && !readOnly && (
          <button onClick={onMarkup} data-tray-markup
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#4aa8d8] text-white text-[12px] font-bold hover:bg-[#3d95c2]">
            <PenLine size={13} /> Mark up
          </button>
        )}
        <button onClick={onDownload} title="Download"
          className="p-2 rounded-xl text-white/80 hover:bg-white/10">
          <Download size={16} />
        </button>
        <button onClick={onClose} title="Close" data-tray-close
          className="p-2 rounded-xl text-white/80 hover:bg-white/10">
          <X size={17} />
        </button>
      </div>
      <div className="flex-1 min-h-0 relative">
        {isPdf(f) ? (
          f.fileId ? (
            <Suspense fallback={
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-white/80 text-sm">
                <Loader2 size={16} className="animate-spin" /> Opening…
              </div>
            }>
              <PlanAnnotator
                planFileId={f.fileId}
                planName={f.name}
                apartmentId={`FT-${elId}`}
                apartmentLabel={f.name}
                authorName={me}
                plansFolderId={folderId}
                embedded readOnly
                onClose={onClose}
              />
            </Suspense>
          ) : (
            <object data={f.url} type="application/pdf" className="w-full h-full bg-white" aria-label={f.name} />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            {imgUrl
              ? <img src={imgUrl} alt={f.name} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
              : <span className="flex items-center gap-2 text-white/80 text-sm">
                  <Loader2 size={16} className="animate-spin" /> Opening…
                </span>}
          </div>
        )}
      </div>
    </div>
  );
}
