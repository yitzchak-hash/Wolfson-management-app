import React from 'react';
import { FileText, X, Loader2 } from 'lucide-react';

/**
 * A pin's attachments, drawn the same way in the office's pin bubble and on the outside shared link (owner,
 * 2026-11-19: "when they pin and when we pin … a recording, and attachments"): recordings as players across the
 * bubble, pictures as small thumbnails, a PDF (or anything else) as a chip with its name.
 *
 * Imports nothing of the office's — the outside SHARED VIEW draws it too, and that page may not load the store,
 * Firebase or the Drive helpers. Each host says how a thing is shown and opened: the office gives Drive addresses,
 * the shared view gives its own server's sealed-ref addresses.
 */
export interface PinAttachmentView {
  id: string;
  name: string;
  mimeType: string;
  /** A small picture (images). */
  thumb?: string;
  /** Where a press goes … */
  href?: string;
  /** … saved instead of opened (a data URL). */
  download?: boolean;
  /** … or what a press does (the shared view fetches the bytes first, so its key never sits in an address bar). */
  onOpen?: () => void;
  /** The player, for a recording. */
  player?: React.ReactNode;
  /** Still going up. */
  pending?: boolean;
}

export const isAudio = (mime: string) => /^audio\//i.test(mime) || /^video\/webm/i.test(mime);
export const isImage = (mime: string) => /^image\//i.test(mime);

export function PinAttachments({ items, onRemove, removeLabel = 'Remove', className = '' }: {
  items: PinAttachmentView[];
  onRemove?: (id: string) => void;
  removeLabel?: string;
  className?: string;
}) {
  if (!items.length) return null;
  const audio = items.filter(i => isAudio(i.mimeType) && i.player);
  const rest = items.filter(i => !audio.includes(i));
  const remove = (id: string) => onRemove && (
    <button type="button" onClick={e => { e.stopPropagation(); onRemove(id); }} title={removeLabel} aria-label={removeLabel}
      data-pin-attachment-remove
      className="flex-shrink-0 p-0.5 rounded text-gray-400 hover:text-red-500">
      <X size={10} />
    </button>
  );
  const opener = (i: PinAttachmentView, children: React.ReactNode, cls: string) => (i.onOpen
    ? <button type="button" onClick={i.onOpen} title={i.name} className={cls}>{children}</button>
    : i.href
      ? <a href={i.href} title={i.name} className={cls}
          {...(i.download ? { download: i.name } : { target: '_blank', rel: 'noreferrer noopener' })}>{children}</a>
      : <span title={i.name} className={cls}>{children}</span>);

  return (
    <div className={`flex flex-col gap-1 ${className}`} data-pin-attachments>
      {audio.map(i => (
        <div key={i.id} className="flex items-center gap-1 min-w-0" data-pin-attachment="audio">
          <div className="flex-1 min-w-0">{i.player}</div>
          {i.pending && <Loader2 size={12} className="animate-spin text-gray-400 flex-shrink-0" />}
          {remove(i.id)}
        </div>
      ))}
      {rest.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {rest.map(i => isImage(i.mimeType) && i.thumb ? (
            <span key={i.id} className="relative inline-flex" data-pin-attachment="image">
              {opener(i,
                <img src={i.thumb} alt={i.name} loading="lazy"
                  className="w-14 h-14 object-cover rounded-lg border border-gray-200 bg-gray-50" />,
                'block rounded-lg overflow-hidden')}
              {i.pending && (
                <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/60">
                  <Loader2 size={14} className="animate-spin text-[#1e3a5f]" />
                </span>
              )}
              {onRemove && (
                <span className="absolute -top-1 -right-1 rounded-full bg-white shadow border border-gray-200">{remove(i.id)}</span>
              )}
            </span>
          ) : (
            <span key={i.id} data-pin-attachment="file"
              className="flex items-center gap-1 max-w-full pl-1.5 pr-1 py-0.5 rounded-lg border border-gray-200 bg-gray-50 text-[10px] text-gray-600">
              {i.pending ? <Loader2 size={10} className="animate-spin flex-shrink-0" /> : <FileText size={10} className="flex-shrink-0 text-[#1e3a5f]" />}
              {opener(i, i.name, 'truncate max-w-[150px] hover:underline text-start')}
              {remove(i.id)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
