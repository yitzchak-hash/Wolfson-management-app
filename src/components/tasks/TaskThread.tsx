import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { format, isToday, parseISO } from 'date-fns';
import { Download, X } from 'lucide-react';
import { ContractorAssignment, ContractorNote, ContractorPhoto } from '../../types';
import { VoiceMemoPlayer } from '../ui/VoiceMemo';
import { fetchPlanBytes, driveThumbUrl } from '../../data/driveApi';
import { saveBytes } from '../../data/planExport';
import { Translated } from '../ui/Translated';
import type { Lang } from '../../data/translate';

/**
 * The task as a CONVERSATION — one drawing, used in the worker's portal and
 * in the office's apartment window (owner's decisions 8–10, sealed
 * 2026-08-30). Two components would drift, which is exactly what the owner
 * asked to avoid, so this is the only one.
 *
 * Office messages sit at the start in white with the author's name in
 * accent; worker messages at the end in blue. A file is a card you press to
 * open and download — fetched through the app's own /api/drive-fetch route,
 * never a drive.google.com link, which turns away a worker who is not
 * signed into Google. A photo is a preview capped near 230px that expands
 * to a lightbox with a Download.
 *
 * The "Job closed · time" marker is DERIVED from `assignment.completedAt`,
 * never stored as a record; messages later than it render below it, which
 * is what keeps the conversation open after the close (decision 10). And
 * because the conversation stays open, nothing in it is ever edited or
 * deleted — a correction is simply a new message.
 */

export interface ThreadWords {
  rtl: boolean;
  /** "tap to open" — under files and photos. */
  tapToOpen: string;
  /** "Job closed" — the derived marker. */
  jobClosed: string;
  /** "Download" — the lightbox's button. */
  download: string;
}

const ACCENT = '#4aa8d8';

function stamp(iso: string): string {
  const d = iso.includes('T') ? new Date(iso) : parseISO(iso);
  return isToday(d) ? format(d, 'HH:mm') : format(d, 'MMM d · HH:mm');
}

function sizeLabel(bytes?: number): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extBadge(filename?: string, mime?: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(filename ?? '');
  if (m) return m[1].toUpperCase().slice(0, 4);
  if (mime?.includes('pdf')) return 'PDF';
  if (mime?.startsWith('video/')) return 'VID';
  if (mime?.startsWith('image/')) return 'IMG';
  return 'FILE';
}

function sniffMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x25 && bytes[1] === 0x50) return 'application/pdf';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  return 'application/octet-stream';
}

/**
 * Hand a file to the device. Drive files come down through the app's own
 * /api/drive-fetch (the service account reads them; the worker needs no
 * Google login); everything else is already bytes we can save directly.
 */
async function handOver(opts: { driveFileId?: string; url?: string; dataUrl?: string; filename: string; mime?: string }) {
  try {
    if (opts.driveFileId) {
      const buf = await fetchPlanBytes(opts.driveFileId);
      const bytes = new Uint8Array(buf);
      saveBytes(bytes, opts.filename, opts.mime || sniffMime(bytes));
      return;
    }
    if (opts.url) {
      const resp = await fetch(opts.url);
      if (!resp.ok) throw new Error(String(resp.status));
      const bytes = new Uint8Array(await resp.arrayBuffer());
      saveBytes(bytes, opts.filename, opts.mime || sniffMime(bytes));
      return;
    }
    if (opts.dataUrl) {
      const a = document.createElement('a');
      a.href = opts.dataUrl;
      a.download = opts.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
  } catch {
    // Last resort — let the browser have a go at the raw location.
    const href = opts.url || opts.dataUrl;
    if (href) window.open(href, '_blank', 'noopener');
  }
}

type Item =
  | { t: string; kind: 'note'; note: ContractorNote; photos: ContractorPhoto[] }
  | { t: string; kind: 'photo'; photo: ContractorPhoto };

function photoSrc(p: ContractorPhoto, px = 400): string | null {
  return p.storageUrl || (p.driveFileId ? driveThumbUrl(p.driveFileId, px) : null) || (p.dataUrl || null);
}

export function TaskThread({ assignment, notes, photos, viewer, readOnly = false, words, maxBubble, translateTo }: {
  assignment: ContractorAssignment;
  /**
   * The READER's language — every message written in another one is shown
   * translated, with its original one press away. Absent = nothing is
   * translated.
   */
  translateTo?: Lang | null;
  /** This assignment's notes, any order. */
  notes: ContractorNote[];
  /** This assignment's photos, any order. */
  photos: ContractorPhoto[];
  /** Who is looking — the drawing is the same either way (decision 8). */
  viewer: 'office' | 'contractor';
  readOnly?: boolean;
  words: ThreadWords;
  /** Cap the bubbles on a monitor so they do not run the whole window. */
  maxBubble?: number;
}) {
  const [lightbox, setLightbox] = useState<ContractorPhoto | null>(null);
  void viewer; void readOnly; // the thread is the same drawing for everyone,
  // and nothing in it can be edited or deleted from either side.

  // A photo the closing comment claimed rides inside that message; the rest
  // stand as messages of their own.
  const claimed = new Set(notes.flatMap(n => n.photoIds ?? []));
  const items: Item[] = [
    ...notes.map<Item>(n => ({
      t: n.createdAt, kind: 'note', note: n,
      photos: (n.photoIds ?? []).map(id => photos.find(p => p.id === id)).filter((p): p is ContractorPhoto => !!p),
    })),
    ...photos.filter(p => !claimed.has(p.id)).map<Item>(p => ({ t: p.uploadedAt, kind: 'photo', photo: p })),
  ].sort((a, b) => a.t.localeCompare(b.t));

  const closedAt = assignment.completedAt ?? null;
  const before = closedAt ? items.filter(i => i.t <= closedAt) : items;
  const after = closedAt ? items.filter(i => i.t > closedAt) : [];

  function photoBlock(p: ContractorPhoto, inBubble: boolean) {
    const src = photoSrc(p);
    const isImage = (p.fileType ?? 'image') === 'image';
    if (isImage && src) {
      return (
        <div key={p.id} className={inBubble ? 'mb-1.5' : undefined}>
          <img
            src={src}
            alt={p.filename}
            className="block w-full rounded-[9px] cursor-pointer"
            style={{ maxWidth: 230 }}
            onClick={() => setLightbox(p)}
          />
          <div className="text-[11px] mt-0.5" style={{ color: '#8a99a8' }}>{words.tapToOpen}</div>
        </div>
      );
    }
    // A video or any other file is a card you press to open and download.
    return <div key={p.id} className={inBubble ? 'mb-1.5' : undefined}>{fileCard({
      filename: p.filename, mime: p.mimeType, size: p.fileSizeBytes,
      driveFileId: p.driveFileId, url: p.storageUrl, dataUrl: p.dataUrl,
    })}</div>;
  }

  function fileCard(f: { filename: string; mime?: string; size?: number; driveFileId?: string; url?: string; dataUrl?: string }) {
    const size = sizeLabel(f.size);
    return (
      <button
        type="button"
        onClick={() => void handOver({ driveFileId: f.driveFileId, url: f.url, dataUrl: f.dataUrl, filename: f.filename, mime: f.mime })}
        className="w-full flex items-center gap-2 rounded-[10px] px-2.5 py-2 text-start cursor-pointer"
        style={{ backgroundColor: '#f4f7fa', border: '1px solid #e2e9f1' }}
      >
        <span className="flex items-center justify-center flex-shrink-0 rounded-[5px] text-white font-bold"
          style={{ width: 30, height: 34, backgroundColor: '#1e3a5f', fontSize: 9.5 }}>
          {extBadge(f.filename, f.mime)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold truncate" style={{ fontSize: 13.5, color: '#1f2c3d' }}>{f.filename}</span>
          <span className="block" style={{ fontSize: 11.5, color: '#8a99a8' }}>
            {size ? `${size} · ` : ''}{words.tapToOpen}
          </span>
        </span>
        <Download size={15} className="flex-shrink-0" style={{ color: ACCENT }} />
      </button>
    );
  }

  function bubble(item: Item) {
    const worker = item.kind === 'photo' || item.note.authorType === 'contractor';
    const body: React.ReactNode[] = [];
    let when = '';
    if (item.kind === 'photo') {
      body.push(<React.Fragment key="p">{photoBlock(item.photo, true)}</React.Fragment>);
      when = item.photo.uploadedAt;
    } else {
      const n = item.note;
      when = n.createdAt;
      if (!worker && n.authorName) {
        body.push(
          <div key="who" className="font-bold mb-0.5" style={{ fontSize: 12.5, color: ACCENT }}>{n.authorName}</div>,
        );
      }
      for (const p of item.photos) body.push(<React.Fragment key={p.id}>{photoBlock(p, true)}</React.Fragment>);
      if (n.attachmentDataUrl || n.attachmentDriveFileId || n.attachmentDriveUrl) {
        if (n.attachmentMimeType?.startsWith('audio/')) {
          body.push(
            <div key="att" className="mb-1.5">
              <VoiceMemoPlayer src={n.attachmentDriveUrl || n.attachmentDataUrl || ''} />
            </div>,
          );
        } else if (n.attachmentMimeType?.startsWith('image/') && (n.attachmentDriveFileId || n.attachmentDataUrl)) {
          const src = n.attachmentDriveFileId ? driveThumbUrl(n.attachmentDriveFileId, 400) : n.attachmentDataUrl!;
          body.push(
            <div key="att" className="mb-1.5">
              <img src={src} alt={n.attachmentFilename} className="block w-full rounded-[9px] cursor-pointer" style={{ maxWidth: 230 }}
                onClick={() => void handOver({ driveFileId: n.attachmentDriveFileId, dataUrl: n.attachmentDataUrl, filename: n.attachmentFilename || 'photo.jpg', mime: n.attachmentMimeType })} />
              <div className="text-[11px] mt-0.5" style={{ color: '#8a99a8' }}>{words.tapToOpen}</div>
            </div>,
          );
        } else {
          body.push(
            <div key="att" className="mb-1.5">
              {fileCard({
                filename: n.attachmentFilename || 'file', mime: n.attachmentMimeType,
                driveFileId: n.attachmentDriveFileId, dataUrl: n.attachmentDataUrl,
              })}
            </div>,
          );
        }
      }
      if (n.text?.trim()) body.push(
        <div key="t" style={{ color: '#1f2c3d' }} data-thread-text>
          <Translated text={n.text} to={translateTo} />
        </div>,
      );
    }
    const key = item.kind === 'photo' ? `ph-${item.photo.id}` : `nt-${item.note.id}`;
    return (
      <div key={key} className={`flex ${worker ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`rounded-[14px] shadow-sm ${worker ? 'rounded-se-[5px]' : 'rounded-ss-[5px]'}`}
          style={{
            maxWidth: maxBubble ? Math.min(maxBubble, 640) : '82%',
            width: maxBubble ? undefined : undefined,
            padding: '8px 10px 6px',
            fontSize: 14.5,
            lineHeight: 1.45,
            backgroundColor: worker ? '#e3f2fb' : '#ffffff',
            border: `1px solid ${worker ? '#c9e6f8' : '#e6ecf3'}`,
          }}
        >
          {body}
          <div className="text-end mt-0.5" style={{ fontSize: 11, color: '#93a2b1' }}>{stamp(when)}</div>
        </div>
      </div>
    );
  }

  const marker = closedAt ? (
    <div data-thread-closed className="flex justify-center my-0.5">
      <span className="rounded-full font-bold"
        style={{
          backgroundColor: '#dff3e6', color: '#177a4b', border: '1px solid #bfe6cf',
          padding: '4px 12px', fontSize: 12,
        }}>
        ✓ {words.jobClosed} · {stamp(closedAt)}
      </span>
    </div>
  ) : null;

  return (
    <div data-thread className="flex flex-col gap-2.5 rounded-[14px] p-3"
      style={{ backgroundColor: '#f2f5f8', border: '1px solid #e3e9f0' }}>
      {before.map(bubble)}
      {marker}
      {after.map(bubble)}
      {items.length === 0 && !closedAt && (
        <div className="text-center py-2" style={{ fontSize: 12, color: '#93a2b1' }}>—</div>
      )}

      {/* The lightbox — portalled to the body: the drawer's panel carries a
          transform, and a fixed child inside a transformed ancestor is
          positioned against IT, not the screen. */}
      {lightbox && createPortal(
        <div className="fixed inset-0 z-[210] flex flex-col items-center justify-center"
          style={{ backgroundColor: 'rgba(6,10,16,.88)' }}
          onClick={() => setLightbox(null)}>
          <img
            src={photoSrc(lightbox, 1600) ?? undefined}
            alt={lightbox.filename}
            className="max-w-[94vw] max-h-[82vh] rounded-lg object-contain"
            onClick={e => e.stopPropagation()}
          />
          <div className="flex items-center gap-2 mt-4" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => void handOver({
                driveFileId: lightbox.driveFileId, url: lightbox.storageUrl,
                dataUrl: lightbox.dataUrl, filename: lightbox.filename, mime: lightbox.mimeType,
              })}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ backgroundColor: '#1e3a5f' }}>
              <Download size={15} /> {words.download}
            </button>
            <button onClick={() => setLightbox(null)}
              className="p-2 rounded-xl text-white/80 hover:text-white" style={{ backgroundColor: 'rgba(255,255,255,.12)' }}>
              <X size={17} />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
